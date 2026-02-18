/**
 * Terminal Sessions API
 * GET /api/terminal - List all terminal sessions
 * POST /api/terminal - Spawn a new terminal session
 * DELETE /api/terminal?name=... - Kill a terminal session
 *
 * Terminal sessions are tmux sessions with names prefixed with "jat-term-"
 * They use the same infrastructure as agent sessions (capture-pane, send-keys)
 * but are independent ad-hoc shells for quick commands.
 */

import { json } from '@sveltejs/kit';
import { execFile, exec } from 'child_process';
import { promisify } from 'util';
import { homedir } from 'os';
import { existsSync } from 'fs';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

// Terminal session prefix - distinguishes from agent sessions (jat-{AgentName})
const TERMINAL_PREFIX = 'jat-term-';

/**
 * Generate a short unique ID for terminal sessions
 * @returns {string} 4-character alphanumeric ID
 */
function generateTerminalId() {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	let id = '';
	for (let i = 0; i < 4; i++) {
		id += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return id;
}

/**
 * Get the project working directory.
 * Default to Squad project directory since that's where the IDE runs.
 * @returns {Promise<string>} Path to project directory
 */
async function getProjectPath() {
	// Prefer Squad IDE in OpenClaw workspace when running from this fork
	const openclawSquad =
		process.env.OPENCLAW_HOME
			? `${process.env.OPENCLAW_HOME}/workspace/squad`
			: `${homedir()}/.openclaw/workspace/squad`;
	if (existsSync(openclawSquad)) {
		return openclawSquad;
	}
	// Default to canonical project directory (where upstream IDE runs)
	const defaultPath = `${homedir()}/code/jat`;
	if (existsSync(defaultPath)) {
		return defaultPath;
	}

	// Fallback: try to get from config (~/.config/jat used by jt CLI)
	const configPath = `${homedir()}/.config/jat/projects.json`;
	if (existsSync(configPath)) {
		try {
			const { readFileSync } = await import('fs');
			const config = JSON.parse(readFileSync(configPath, 'utf-8'));

			// Get first project path
			if (config.projects) {
				const firstProject = Object.values(config.projects)[0];
				if (firstProject && typeof firstProject === 'object' && 'path' in firstProject) {
					const projectPath = /** @type {{ path: string }} */ (firstProject).path;
					const expandedPath = projectPath.replace('~', homedir());
					if (existsSync(expandedPath)) {
						return expandedPath;
					}
				}
			}
		} catch {
			// Fall through to default
		}
	}

	// Final fallback to home directory
	return homedir();
}

/** @type {import('./$types').RequestHandler} */
export async function GET() {
	try {
		// List all tmux sessions that start with terminal prefix
		const { stdout } = await execAsync(
			`tmux list-sessions -F '#{session_name}:#{session_created}:#{session_attached}' 2>/dev/null | grep '^${TERMINAL_PREFIX}' || true`,
			{ maxBuffer: 1024 * 1024 }
		);

		const sessions = stdout
			.trim()
			.split('\n')
			.filter(Boolean)
			.map((line) => {
				const [name, created, attached] = line.split(':');
				// Extract display name (remove prefix)
				const displayName = name.replace(TERMINAL_PREFIX, '');
				return {
					name, // Full session name for tmux commands
					displayName, // Short name for UI
					created: created ? new Date(parseInt(created, 10) * 1000).toISOString() : null,
					attached: attached === '1'
				};
			});

		return json({
			success: true,
			sessions,
			count: sessions.length
		});
	} catch (error) {
		// Graceful degradation: when tmux isn't running or any list error, return empty
		const err = error instanceof Error ? error : new Error(String(error));
		const msg = err.message || '';
		if (
			msg.includes('no server running') ||
			msg.includes('no sessions') ||
			msg.includes('tmux') ||
			msg.includes('spawn')
		) {
			return json({
				success: true,
				sessions: [],
				count: 0
			});
		}

		console.error('Error listing terminal sessions:', error);
		return json(
			{
				success: false,
				error: 'Failed to list terminal sessions',
				message: msg
			},
			{ status: 500 }
		);
	}
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const { name: customName, path: customPath } = body;

		// Generate session name
		const terminalId = customName || generateTerminalId();
		const sessionName = `${TERMINAL_PREFIX}${terminalId}`;

		// Check if session already exists
		try {
			await execFileAsync('tmux', ['has-session', '-t', sessionName]);
			// Session exists, return it
			return json({
				success: true,
				sessionName,
				displayName: terminalId,
				created: false,
				message: `Terminal session '${terminalId}' already exists`
			});
		} catch {
			// Session doesn't exist, create it
		}

		// Get working directory
		const workingDir = customPath || (await getProjectPath());

		// Create new tmux session in detached mode
		await execFileAsync('tmux', [
			'new-session',
			'-d', // Detached
			'-s',
			sessionName, // Session name
			'-c',
			workingDir // Working directory
		]);

		return json({
			success: true,
			sessionName,
			displayName: terminalId,
			workingDir,
			created: true,
			message: `Created terminal session '${terminalId}'`
		});
	} catch (error) {
		console.error('Error spawning terminal session:', error);
		return json(
			{
				success: false,
				error: 'Failed to spawn terminal session',
				message: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
}

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ url }) {
	try {
		const sessionName = url.searchParams.get('name');

		if (!sessionName) {
			return json(
				{
					success: false,
					error: 'Missing session name',
					message: 'Session name is required'
				},
				{ status: 400 }
			);
		}

		// Validate it's a terminal session (security check)
		if (!sessionName.startsWith(TERMINAL_PREFIX)) {
			return json(
				{
					success: false,
					error: 'Invalid session',
					message: 'Can only kill terminal sessions created by the IDE'
				},
				{ status: 403 }
			);
		}

		// Kill the session
		await execFileAsync('tmux', ['kill-session', '-t', sessionName]);

		return json({
			success: true,
			sessionName,
			message: `Killed terminal session '${sessionName}'`
		});
	} catch (error) {
		const err = /** @type {{ stderr?: string, message?: string }} */ (error);
		const errorMessage = err.stderr || err.message || String(error);

		// Session not found is fine
		if (errorMessage.includes("can't find session") || errorMessage.includes('no server running')) {
			return json({
				success: true,
				message: 'Session already terminated'
			});
		}

		console.error('Error killing terminal session:', error);
		return json(
			{
				success: false,
				error: 'Failed to kill terminal session',
				message: errorMessage
			},
			{ status: 500 }
		);
	}
}
