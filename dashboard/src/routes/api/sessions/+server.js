/**
 * Sessions API - List and Spawn Sessions
 * GET /api/sessions - List all tmux sessions (optionally filtered by jat- prefix)
 * POST /api/sessions - Spawn a new Claude Code session
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';

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
			model = 'sonnet-4.5',
			task,
			prompt = '/jat:start auto'
		} = body;

		// Determine project path
		const projectPath = project || process.cwd().replace('/dashboard', '');

		// Generate session name
		const sessionName = agentName ? `jat-${agentName}` : `jat-agent-${Date.now()}`;

		// Build the claude command
		let claudeCmd = `cd "${projectPath}" && claude`;
		if (model) claudeCmd += ` --model ${model}`;

		// Build initial prompt
		let initialPrompt = prompt;
		if (task && !prompt.includes(task)) {
			initialPrompt = `/jat:start ${task}`;
		}

		// Create tmux session with Claude Code
		// Use send-keys to run claude after session creation
		const command = `tmux new-session -d -s "${sessionName}" -c "${projectPath}" && tmux send-keys -t "${sessionName}" "${claudeCmd}" Enter`;

		try {
			await execAsync(command);

			// Wait a moment for Claude to start, then send the initial prompt
			if (initialPrompt) {
				await new Promise(resolve => setTimeout(resolve, 2000));
				const escapedPrompt = initialPrompt.replace(/"/g, '\\"');
				await execAsync(`tmux send-keys -t "${sessionName}" "${escapedPrompt}" Enter`);
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
