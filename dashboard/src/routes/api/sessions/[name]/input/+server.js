/**
 * Session Input API - Send Input to Session
 * POST /api/sessions/[name]/input
 *
 * Sends input to a tmux session. Supports:
 * - text: Regular text input (sent with Enter)
 * - ctrl-c: Sends Ctrl+C interrupt signal
 * - ctrl-d: Sends Ctrl+D (EOF)
 * - ctrl-u: Sends Ctrl+U (clear line)
 * - tab: Sends Tab key (for autocomplete)
 * - raw: Send exact keys without Enter
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/** @type {import('./$types').RequestHandler} */
export async function POST({ params, request }) {
	try {
		const sessionName = params.name;

		if (!sessionName) {
			return json({
				error: 'Missing session name',
				message: 'Session name is required'
			}, { status: 400 });
		}

		const body = await request.json();
		const { type = 'text', input = '' } = body;

		let command;

		switch (type) {
			case 'enter':
				// Send just Enter (accept highlighted option in Claude Code prompts)
				command = `tmux send-keys -t "${sessionName}" Enter`;
				break;

			case 'down':
				// Send Down arrow
				command = `tmux send-keys -t "${sessionName}" Down`;
				break;

			case 'up':
				// Send Up arrow
				command = `tmux send-keys -t "${sessionName}" Up`;
				break;

			case 'escape':
				// Send Escape key
				command = `tmux send-keys -t "${sessionName}" Escape`;
				break;

			case 'ctrl-c':
				// Send Ctrl+C (interrupt signal)
				command = `tmux send-keys -t "${sessionName}" C-c`;
				break;

			case 'ctrl-d':
				// Send Ctrl+D (EOF)
				command = `tmux send-keys -t "${sessionName}" C-d`;
				break;

			case 'ctrl-u':
				// Send Ctrl+U (clear line - for live streaming input)
				command = `tmux send-keys -t "${sessionName}" C-u`;
				break;

			case 'tab':
				// Send Tab key (for autocomplete in terminal)
				command = `tmux send-keys -t "${sessionName}" Tab`;
				break;

			case 'raw':
				// Send raw keys without Enter
				// Escape special characters for shell
				const escapedRaw = input.replace(/"/g, '\\"').replace(/\$/g, '\\$');
				command = `tmux send-keys -t "${sessionName}" "${escapedRaw}"`;
				break;

			case 'text':
			default:
				// Send text followed by Enter
				// Escape special characters for shell
				const escapedText = input.replace(/"/g, '\\"').replace(/\$/g, '\\$');
				command = `tmux send-keys -t "${sessionName}" "${escapedText}" Enter`;
				break;
		}

		try {
			await execAsync(command);

			return json({
				success: true,
				sessionName,
				type,
				input: type === 'ctrl-c' || type === 'ctrl-d' ? type : input,
				message: `Input sent to session ${sessionName}`,
				timestamp: new Date().toISOString()
			});
		} catch (execError) {
			const execErr = /** @type {{ stderr?: string, message?: string }} */ (execError);
			const errorMessage = execErr.stderr || execErr.message || String(execError);

			// Check if session not found
			if (errorMessage.includes("can't find session") || errorMessage.includes('no server running')) {
				return json({
					error: 'Session not found',
					message: `Session '${sessionName}' does not exist`,
					sessionName
				}, { status: 404 });
			}

			return json({
				error: 'Failed to send input',
				message: errorMessage,
				sessionName
			}, { status: 500 });
		}
	} catch (error) {
		console.error('Error in POST /api/sessions/[name]/input:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
