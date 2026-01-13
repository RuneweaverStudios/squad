/**
 * Session Attach API
 * POST /api/sessions/[name]/attach - Attach to an existing tmux session
 *
 * Creates a new window in the parent tmux session (server-jat or configurable)
 * that attaches to the specified agent session. This keeps all sessions organized
 * within tmux for IDE tracking.
 *
 * Unlike resume, this assumes the session already exists (agent is online).
 */

import { json } from '@sveltejs/kit';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const execAsync = promisify(exec);

/**
 * Session name prefix for JAT agent sessions
 */
const SESSION_PREFIX = 'jat-';

/**
 * Default parent session names to try (in order of preference)
 * server-jat is the naming convention for the IDE dev server
 */
const DEFAULT_PARENT_SESSIONS = ['server-jat', 'jat'];

/**
 * Get the full tmux session name from a name parameter.
 * @param {string} name - Agent name or full session name
 * @returns {{ agentName: string, sessionName: string }}
 */
function resolveSessionName(name) {
	if (name.startsWith(SESSION_PREFIX)) {
		return {
			agentName: name.slice(SESSION_PREFIX.length),
			sessionName: name
		};
	}
	return {
		agentName: name,
		sessionName: `${SESSION_PREFIX}${name}`
	};
}

/**
 * Check if a tmux session exists
 * @param {string} sessionName - tmux session name
 * @returns {Promise<boolean>}
 */
async function sessionExists(sessionName) {
	try {
		await execAsync(`tmux has-session -t "${sessionName}" 2>/dev/null`);
		return true;
	} catch {
		return false;
	}
}

/**
 * Find the parent tmux session to create windows in
 * @param {string[]} candidates - Session names to try
 * @returns {Promise<string | null>}
 */
async function findParentSession(candidates) {
	for (const name of candidates) {
		if (await sessionExists(name)) {
			return name;
		}
	}
	return null;
}

/**
 * Find the project for a session by looking up agent files across projects
 * @param {string} agentName - Agent name to look up
 * @returns {Promise<string | null>} Project name or null
 */
async function findProjectForAgent(agentName) {
	const codeDir = join(homedir(), 'code');
	if (!existsSync(codeDir)) return null;

	try {
		const projects = readdirSync(codeDir, { withFileTypes: true })
			.filter(d => d.isDirectory() && !d.name.startsWith('.'))
			.map(d => d.name);

		for (const project of projects) {
			const sessionsDir = join(codeDir, project, '.claude', 'sessions');
			const claudeDir = join(codeDir, project, '.claude');

			// Check sessions directory
			if (existsSync(sessionsDir)) {
				const files = readdirSync(sessionsDir)
					.filter(f => f.startsWith('agent-') && f.endsWith('.txt'));
				for (const file of files) {
					const content = readFileSync(join(sessionsDir, file), 'utf-8').trim();
					if (content === agentName) {
						return project;
					}
				}
			}

			// Check legacy location
			if (existsSync(claudeDir)) {
				const files = readdirSync(claudeDir)
					.filter(f => f.startsWith('agent-') && f.endsWith('.txt'));
				for (const file of files) {
					const content = readFileSync(join(claudeDir, file), 'utf-8').trim();
					if (content === agentName) {
						return project;
					}
				}
			}
		}
	} catch {
		// Ignore errors
	}

	return null;
}

/**
 * Apply Hyprland border colors for a session
 * @param {string} sessionName - tmux session name
 * @param {string} projectName - Project name
 */
async function applyHyprlandColors(sessionName, projectName) {
	try {
		const response = await globalThis.fetch(
			`http://localhost:${process.env.PORT || 3333}/api/sessions/${sessionName}/hyprland-color?project=${projectName}`,
			{ method: 'POST' }
		);
		if (response.ok) {
			const result = await response.json();
			console.log(`[attach] Hyprland colors applied: ${result.windowsUpdated || 0} windows`);
		}
	} catch {
		// Silent - Hyprland coloring is optional
	}
}

/**
 * POST /api/sessions/[name]/attach
 * Attach to an existing tmux session by creating a window in the parent session
 */
/** @type {import('./$types').RequestHandler} */
export async function POST({ params }) {
	try {
		const { agentName, sessionName } = resolveSessionName(params.name);

		if (!agentName) {
			return json({
				error: 'Missing agent name',
				message: 'Agent name is required'
			}, { status: 400 });
		}

		// Verify the agent session exists
		const exists = await sessionExists(sessionName);
		if (!exists) {
			return json({
				error: 'Session not found',
				message: `tmux session '${sessionName}' does not exist. The agent may be offline.`,
				agentName,
				sessionName
			}, { status: 404 });
		}

		// Get config
		let terminal = 'alacritty';
		let parentSessionConfig = null;
		const configPath = `${process.env.HOME}/.config/jat/projects.json`;
		if (existsSync(configPath)) {
			try {
				const config = JSON.parse(readFileSync(configPath, 'utf-8'));
				terminal = config.defaults?.terminal || 'alacritty';
				parentSessionConfig = config.defaults?.parent_session || null;
			} catch (e) {
				// Use defaults
			}
		}

		// Build list of parent session candidates
		const parentCandidates = parentSessionConfig
			? [parentSessionConfig, ...DEFAULT_PARENT_SESSIONS]
			: DEFAULT_PARENT_SESSIONS;

		// Find the parent session
		const parentSession = await findParentSession(parentCandidates);

		if (parentSession) {
			// Create a new window in the parent session that attaches to the agent session
			// The window title shows the agent name for easy identification
			const windowName = agentName;
			const attachCommand = `tmux attach-session -t "${sessionName}"`;

			try {
				await execAsync(`tmux new-window -t "${parentSession}" -n "${windowName}" "bash -c '${attachCommand}'"`);

				// Apply Hyprland colors (best-effort, delay to allow window to open)
				setTimeout(async () => {
					const projectName = await findProjectForAgent(agentName);
					if (projectName) {
						await applyHyprlandColors(sessionName, projectName);
					}
				}, 1000);

				return json({
					success: true,
					agentName,
					sessionName,
					parentSession,
					windowName,
					method: 'tmux-window',
					message: `Created window '${windowName}' in ${parentSession} attached to ${sessionName}`,
					timestamp: new Date().toISOString()
				});
			} catch (e) {
				console.error('Failed to create tmux window:', e);
				// Fall through to terminal fallback
			}
		}

		// Fallback: spawn new terminal window if no parent session found
		const attachCommand = `tmux attach-session -t "${sessionName}"`;
		// Find project for this agent to use project-specific title
		const foundProject = await findProjectForAgent(agentName);
		const displayName = foundProject ? foundProject.toUpperCase() : 'JAT';
		const windowTitle = `${displayName}: ${sessionName}`;

		let child;
		switch (terminal) {
			case 'alacritty':
				child = spawn('alacritty', ['-T', windowTitle, '-e', 'bash', '-c', attachCommand], {
					detached: true,
					stdio: 'ignore'
				});
				break;
			case 'kitty':
				child = spawn('kitty', ['--title', windowTitle, 'bash', '-c', attachCommand], {
					detached: true,
					stdio: 'ignore'
				});
				break;
			case 'gnome-terminal':
				child = spawn('gnome-terminal', ['--title', windowTitle, '--', 'bash', '-c', attachCommand], {
					detached: true,
					stdio: 'ignore'
				});
				break;
			case 'konsole':
				child = spawn('konsole', ['-p', `tabtitle=${windowTitle}`, '-e', 'bash', '-c', attachCommand], {
					detached: true,
					stdio: 'ignore'
				});
				break;
			default:
				child = spawn('xterm', ['-T', windowTitle, '-e', 'bash', '-c', attachCommand], {
					detached: true,
					stdio: 'ignore'
				});
		}

		child.unref();

		// Apply Hyprland colors (best-effort, delay to allow terminal to open)
		setTimeout(async () => {
			const projectName = await findProjectForAgent(agentName);
			if (projectName) {
				await applyHyprlandColors(sessionName, projectName);
			}
		}, 1500);

		return json({
			success: true,
			agentName,
			sessionName,
			terminal,
			method: 'terminal',
			message: `Opened terminal attached to ${sessionName}`,
			timestamp: new Date().toISOString()
		});

	} catch (error) {
		console.error('Error in POST /api/sessions/[name]/attach:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
