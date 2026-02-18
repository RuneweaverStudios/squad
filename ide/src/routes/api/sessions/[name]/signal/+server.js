/**
 * Session Signal API - Read/Clear/Emit Agent Signals
 *
 * GET /api/sessions/[name]/signal
 *   Returns the current signal for a session (from PostToolUse hook)
 *   Signal file: /tmp/squad-signal-tmux-{sessionName}.json
 *
 * POST /api/sessions/[name]/signal
 *   Emits a signal for the session using squad-signal command
 *   Body: { type: string, data: string | object }
 *
 * DELETE /api/sessions/[name]/signal
 *   Clears the signal file after processing
 *
 * Signal Types:
 *   - state: Session state change (working, review, idle, needs_input, completed, starting, compacting, completing)
 *   - tasks: Suggested follow-up tasks (JSON array)
 *   - action: Human action request (JSON object)
 *   - complete: Full completion bundle (state + tasks + actions)
 *
 * Note: completed signals with completionMode: 'auto_proceed' trigger automatic spawning of next task.
 */

import { json } from '@sveltejs/kit';
import { readFileSync, writeFileSync, appendFileSync, unlinkSync, existsSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** @type {import('./$types').RequestHandler} */
export async function GET({ params }) {
	const sessionName = params.name;

	if (!sessionName) {
		return json({ error: 'Missing session name' }, { status: 400 });
	}

	// Try tmux session name first (e.g., "squad-FairBay")
	let signalFile = `/tmp/squad-signal-tmux-${sessionName}.json`;

	// If not found, try session ID format
	if (!existsSync(signalFile)) {
		signalFile = `/tmp/squad-signal-${sessionName}.json`;
	}

	if (!existsSync(signalFile)) {
		return json({
			hasSignal: false,
			sessionName,
			message: 'No signal file found'
		});
	}

	try {
		const content = readFileSync(signalFile, 'utf-8');
		const signal = JSON.parse(content);

		return json({
			hasSignal: true,
			sessionName,
			signal,
			file: signalFile
		});
	} catch (err) {
		const error = /** @type {Error} */ (err);
		return json({
			hasSignal: false,
			sessionName,
			error: 'Failed to read signal file',
			message: error.message
		}, { status: 500 });
	}
}

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ params }) {
	const sessionName = params.name;

	if (!sessionName) {
		return json({ error: 'Missing session name' }, { status: 400 });
	}

	// Try to delete both possible file locations
	const files = [
		`/tmp/squad-signal-tmux-${sessionName}.json`,
		`/tmp/squad-signal-${sessionName}.json`
	];

	let deleted = false;
	const deletedFiles = [];

	for (const file of files) {
		if (existsSync(file)) {
			try {
				unlinkSync(file);
				deleted = true;
				deletedFiles.push(file);
			} catch (err) {
				// Ignore deletion errors
			}
		}
	}

	return json({
		success: true,
		deleted,
		deletedFiles,
		sessionName
	});
}

/**
 * POST /api/sessions/[name]/signal
 * Emit a signal for a session - writes directly to files for instant feedback
 *
 * Body: { type: string, data: string | object, direct?: boolean }
 *
 * When direct=true (default), writes directly to signal files for instant UI feedback.
 * When direct=false, uses squad-signal command (legacy behavior).
 */
/** @type {import('./$types').RequestHandler} */
export async function POST({ params, request }) {
	const sessionName = params.name;

	if (!sessionName) {
		return json({ error: 'Missing session name' }, { status: 400 });
	}

	try {
		const body = await request.json();
		const { type, data, direct = true } = body;

		if (!type) {
			return json({
				error: 'Missing signal type',
				message: 'Signal type is required (e.g., "working", "polishing", "review", "completing", "completed")'
			}, { status: 400 });
		}

		// Normalize session name (ensure squad- prefix for tmux session)
		const tmuxSession = sessionName.startsWith('squad-') ? sessionName : `squad-${sessionName}`;

		// Direct write mode - for instant UI feedback
		if (direct) {
			const timestamp = new Date().toISOString();

			// Build the signal payload
			const signalData = typeof data === 'object' ? data : {};
			const signal = {
				type,
				...signalData,
				timestamp
			};

			// 1. Write current signal state to signal file
			const signalFile = `/tmp/squad-signal-tmux-${tmuxSession}.json`;
			writeFileSync(signalFile, JSON.stringify(signal, null, 2));

			// 2. Append to timeline JSONL
			const timelineFile = `/tmp/squad-timeline-${tmuxSession}.jsonl`;
			const timelineEvent = {
				type: 'signal',
				session_id: signalData.sessionId || '',
				tmux_session: tmuxSession,
				timestamp,
				state: type,
				task_id: signalData.taskId || '',
				data: signal
			};
			appendFileSync(timelineFile, JSON.stringify(timelineEvent) + '\n');

			return json({
				success: true,
				sessionName: tmuxSession,
				type,
				data: signal,
				signalFile,
				timelineFile,
				timestamp,
				message: `Signal emitted: ${type} (direct write)`
			});
		}

		// Legacy mode - use squad-signal command
		const payload = typeof data === 'object' ? JSON.stringify(data) : (data || '{}');

		try {
			// Execute squad-signal command
			// The command outputs [SQUAD-SIGNAL:type] payload which is captured by PostToolUse hooks
			const result = await execFileAsync('squad-signal', [type, payload], {
				timeout: 10000,
				env: {
					...process.env,
					// Set session context for the signal
					SQUAD_SESSION: sessionName
				}
			});

			return json({
				success: true,
				sessionName,
				type,
				data,
				stdout: result.stdout,
				message: `Signal emitted: ${type}`
			});
		} catch (execError) {
			const execErr = /** @type {{ stderr?: string, message?: string, code?: string }} */ (execError);

			// Check if squad-signal command not found
			if (execErr.code === 'ENOENT') {
				return json({
					error: 'squad-signal not found',
					message: 'squad-signal command not found in PATH. Ensure squad tools are installed.',
					sessionName
				}, { status: 500 });
			}

			const errorMessage = execErr.stderr || execErr.message || String(execError);

			return json({
				error: 'Signal failed',
				message: errorMessage,
				sessionName
			}, { status: 500 });
		}
	} catch (error) {
		console.error('Error in POST /api/sessions/[name]/signal:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
