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
 * - enter: Sends Enter key
 * - escape: Sends Escape key
 * - up/down/left/right: Arrow keys (for navigation)
 * - delete: Delete key (delete character forward)
 * - backspace: Backspace key (delete character backward)
 * - space: Space key (for toggling multi-select options)
 * - raw: Send exact keys without Enter
 */

import { json } from '@sveltejs/kit';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { appendFileSync } from 'fs';

const execFileAsync = promisify(execFile);

/**
 * Write a dashboard_input event to the timeline for visibility in EventStack.
 * This ensures dashboard-initiated inputs are tracked even if Claude Code's
 * UserPromptSubmit hook fails.
 *
 * @param {string} sessionName - tmux session name (e.g., 'jat-AgentName')
 * @param {string} input - The text that was sent
 * @param {string} inputType - Type of input ('text', 'command', 'key')
 */
function writeTimelineEvent(sessionName, input, inputType) {
	try {
		// Ensure session name has jat- prefix for timeline filename
		const tmuxSession = sessionName.startsWith('jat-') ? sessionName : `jat-${sessionName}`;
		const timelineFile = `/tmp/jat-timeline-${tmuxSession}.jsonl`;

		// Determine if this is a slash command
		const isCommand = input.startsWith('/');

		const event = {
			type: 'dashboard_input',
			tmux_session: tmuxSession,
			timestamp: new Date().toISOString(),
			data: {
				input: input,
				inputType: inputType,
				isCommand: isCommand,
				source: 'dashboard'
			}
		};

		appendFileSync(timelineFile, JSON.stringify(event) + '\n');
	} catch (err) {
		// Silently fail - timeline logging is best-effort
		console.error('[input] Failed to write timeline event:', err);
	}
}

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

		// Build args array for execFile (avoids shell escaping issues entirely)
		// Using execFile instead of exec means no shell interpretation of quotes, $, etc.
		/** @type {string[]} */
		let args;

		switch (type) {
			case 'enter':
				// Send just Enter (accept highlighted option in Claude Code prompts)
				args = ['send-keys', '-t', sessionName, 'Enter'];
				break;

			case 'down':
				// Send Down arrow
				args = ['send-keys', '-t', sessionName, 'Down'];
				break;

			case 'up':
				// Send Up arrow
				args = ['send-keys', '-t', sessionName, 'Up'];
				break;

			case 'escape':
				// Send Escape key
				args = ['send-keys', '-t', sessionName, 'Escape'];
				break;

			case 'ctrl-c':
				// Send Ctrl+C (interrupt signal)
				args = ['send-keys', '-t', sessionName, 'C-c'];
				break;

			case 'ctrl-d':
				// Send Ctrl+D (EOF)
				args = ['send-keys', '-t', sessionName, 'C-d'];
				break;

			case 'ctrl-u':
				// Send Ctrl+U (clear line - for live streaming input)
				args = ['send-keys', '-t', sessionName, 'C-u'];
				break;

			case 'tab':
				// Send Tab key (for autocomplete in terminal)
				args = ['send-keys', '-t', sessionName, 'Tab'];
				break;

			case 'left':
				// Send Left arrow
				args = ['send-keys', '-t', sessionName, 'Left'];
				break;

			case 'right':
				// Send Right arrow
				args = ['send-keys', '-t', sessionName, 'Right'];
				break;

			case 'delete':
				// Send Delete key (delete character forward)
				args = ['send-keys', '-t', sessionName, 'DC'];
				break;

			case 'backspace':
				// Send Backspace key (delete character backward)
				args = ['send-keys', '-t', sessionName, 'BSpace'];
				break;

			case 'space':
				// Send Space key (for toggling options in multi-select prompts)
				args = ['send-keys', '-t', sessionName, 'Space'];
				break;

			case 'raw':
				// Send raw keys without Enter
				// Using -l flag for literal mode (no key name interpretation)
				// Using -- to stop option parsing (prevents input like "-a" being interpreted as a flag)
				args = ['send-keys', '-t', sessionName, '-l', '--', input];
				break;

			case 'text':
			default:
				// Send text followed by Enter
				// Using -l flag for literal mode, then separate Enter key
				// Using -- to stop option parsing (prevents input like "-a" being interpreted as a flag)
				args = ['send-keys', '-t', sessionName, '-l', '--', input];
				break;
		}

		try {
			await execFileAsync('tmux', args);

			// For 'text' type, send Enter separately after the literal text
			if (type === 'text' || type === undefined) {
				await execFileAsync('tmux', ['send-keys', '-t', sessionName, 'Enter']);
			}

			// Write timeline event for text inputs (commands and regular text)
			// This ensures dashboard-initiated inputs appear in EventStack
			// regardless of whether the UserPromptSubmit hook succeeds
			if ((type === 'text' || type === undefined) && input) {
				const inputType = input.startsWith('/') ? 'command' : 'text';
				writeTimelineEvent(sessionName, input, inputType);
			}

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
