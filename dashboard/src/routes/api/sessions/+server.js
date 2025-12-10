/**
 * Sessions API - List and Spawn Sessions
 * GET /api/sessions - List all tmux sessions (optionally filtered by jat- prefix)
 * POST /api/sessions - Spawn a new Claude Code session
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
	DEFAULT_MODEL,
	DANGEROUSLY_SKIP_PERMISSIONS,
	AGENT_MAIL_URL
} from '$lib/config/spawnConfig.js';

const execAsync = promisify(exec);

/**
 * GET /api/sessions
 * List all tmux sessions
 * Query params:
 * - filter: 'jat' to only show jat-* sessions (default), 'all' for all sessions
 */
/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
	try {
		const filter = url.searchParams.get('filter') || 'jat';

		// List tmux sessions with format: name:created:attached:windows
		const command = `tmux list-sessions -F "#{session_name}:#{session_created}:#{session_attached}:#{session_windows}"`;

		try {
			const { stdout } = await execAsync(command);

			const sessions = stdout
				.trim()
				.split('\n')
				.filter(line => line.length > 0)
				.map(line => {
					const [name, created, attached, windows] = line.split(':');
					return {
						name,
						created: new Date(parseInt(created, 10) * 1000).toISOString(),
						attached: attached === '1',
						windows: parseInt(windows, 10) || 1
					};
				})
				.filter(session => {
					if (filter === 'all') return true;
					return session.name.startsWith('jat-');
				});

			return json({
				success: true,
				sessions,
				count: sessions.length,
				filter,
				timestamp: new Date().toISOString()
			});
		} catch (execError) {
			const execErr = /** @type {{ stderr?: string, stdout?: string, message?: string }} */ (execError);
			// Check both stderr and stdout (some error messages go to stdout)
			const errorMessage = execErr.stderr || execErr.stdout || execErr.message || String(execError);

			// No server running = no sessions (this is normal, not an error)
			if (errorMessage.includes('no server running') || errorMessage.includes('no sessions')) {
				return json({
					success: true,
					sessions: [],
					count: 0,
					filter,
					timestamp: new Date().toISOString()
				});
			}

			return json({
				error: 'Failed to list sessions',
				message: errorMessage
			}, { status: 500 });
		}
	} catch (error) {
		console.error('Error in GET /api/sessions:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}

/**
 * POST /api/sessions
 * Spawn a new Claude Code session
 * Body:
 * - agentName: Name for the agent (optional - will auto-generate if not provided)
 * - project: Project path (default: current project from cwd)
 * - model: Model to use (sonnet-4.5, opus-4.5, haiku)
 * - task: Optional task ID to auto-start
 * - prompt: Optional initial prompt (e.g., '/jat:start auto')
 */
/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	try {
		const body = await request.json();
		const {
			agentName,
			project,
			model = DEFAULT_MODEL,
			task,
			prompt,
			skipPermissions = DANGEROUSLY_SKIP_PERMISSIONS
		} = body;

		// Determine project path
		const projectPath = project || process.cwd().replace('/dashboard', '');

		// Generate session name
		// If agentName provided, use it directly (caller is responsible for registration)
		// Otherwise, use jat-pending-* naming so /jat:start can register and rename
		const sessionName = agentName ? `jat-${agentName}` : `jat-pending-${Date.now()}`;

		// Build the claude command with proper flags
		let claudeCmd = `cd "${projectPath}"`;

		// Set AGENT_MAIL_URL environment variable
		claudeCmd += ` && AGENT_MAIL_URL="${AGENT_MAIL_URL}"`;

		// Claude with model
		claudeCmd += ` claude --model ${model}`;

		// Add dangerous skip permissions for autonomous operation
		if (skipPermissions) {
			claudeCmd += ' --dangerously-skip-permissions';
		}

		// Build initial prompt - task takes priority, then prompt, then default auto
		let initialPrompt;
		if (task) {
			initialPrompt = `/jat:start ${task}`;
		} else if (prompt) {
			initialPrompt = prompt;
		} else {
			initialPrompt = '/jat:start auto';
		}

		// Create tmux session with Claude Code
		// Use send-keys to run claude after session creation
		const command = `tmux new-session -d -s "${sessionName}" -c "${projectPath}" && tmux send-keys -t "${sessionName}" "${claudeCmd}" Enter`;

		try {
			await execAsync(command);

			// Wait for Claude to fully start, then send the initial prompt
			// Claude Code needs ~5 seconds to initialize and show prompt
			if (initialPrompt) {
				await new Promise(resolve => setTimeout(resolve, 5000));
				// Escape special characters and send text+Enter as ONE command to avoid race conditions
				const escapedPrompt = initialPrompt.replace(/"/g, '\\"').replace(/\$/g, '\\$');
				await execAsync(`tmux send-keys -t "${sessionName}" -- "${escapedPrompt}" Enter`);
			}

			return json({
				success: true,
				sessionName,
				agentName: agentName || sessionName.replace('jat-', ''),
				project: projectPath,
				model,
				task: task || null,
				prompt: initialPrompt,
				message: `Session ${sessionName} created successfully`,
				timestamp: new Date().toISOString()
			});
		} catch (execError) {
			const execErr = /** @type {{ stderr?: string, message?: string }} */ (execError);
			const errorMessage = execErr.stderr || execErr.message || String(execError);

			// Check if session already exists
			if (errorMessage.includes('duplicate session')) {
				return json({
					error: 'Session already exists',
					message: `Session '${sessionName}' already exists`,
					sessionName
				}, { status: 409 });
			}

			return json({
				error: 'Failed to create session',
				message: errorMessage,
				sessionName
			}, { status: 500 });
		}
	} catch (error) {
		console.error('Error in POST /api/sessions:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
