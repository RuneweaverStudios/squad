/**
 * Session Signal API - Read/Clear Agent Signals
 *
 * GET /api/sessions/[name]/signal
 *   Returns the current signal for a session (from PostToolUse hook)
 *   Signal file: /tmp/jat-signal-tmux-{sessionName}.json
 *
 * DELETE /api/sessions/[name]/signal
 *   Clears the signal file after processing
 *
 * Signal Types:
 *   - state: Session state change (working, review, idle, auto_proceed, needs_input, completed)
 *   - tasks: Suggested follow-up tasks (JSON array)
 *   - action: Human action request (JSON object)
 *   - complete: Full completion bundle (state + tasks + actions)
 */

import { json } from '@sveltejs/kit';
import { readFileSync, unlinkSync, existsSync } from 'fs';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params }) {
	const sessionName = params.name;

	if (!sessionName) {
		return json({ error: 'Missing session name' }, { status: 400 });
	}

	// Try tmux session name first (e.g., "jat-FairBay")
	let signalFile = `/tmp/jat-signal-tmux-${sessionName}.json`;

	// If not found, try session ID format
	if (!existsSync(signalFile)) {
		signalFile = `/tmp/jat-signal-${sessionName}.json`;
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
		`/tmp/jat-signal-tmux-${sessionName}.json`,
		`/tmp/jat-signal-${sessionName}.json`
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
