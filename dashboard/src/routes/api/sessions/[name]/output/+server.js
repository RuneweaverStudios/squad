/**
 * Session Output API - Capture Session Output
 * GET /api/sessions/[name]/output
 *
 * Captures the current visible output from a tmux session pane.
 * Query params:
 * - lines: Number of lines to capture (default: 100, max: 10000)
 * - history: Include scrollback history (default: false)
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, url }) {
	try {
		const sessionName = params.name;

		if (!sessionName) {
			return json({
				error: 'Missing session name',
				message: 'Session name is required'
			}, { status: 400 });
		}

		// Parse query params
		const linesParam = url.searchParams.get('lines');
		const historyParam = url.searchParams.get('history');

		const lines = Math.min(Math.max(parseInt(linesParam || '100', 10) || 100, 1), 10000);
		const includeHistory = historyParam === 'true';

		// Build tmux capture-pane command
		// -p: Print to stdout
		// -e: Include escape sequences (ANSI colors)
		// -t: Target session
		// -S: Start line (negative = history, 0 = visible start)
		// -E: End line (empty = end of visible)
		let command;
		if (includeHistory) {
			// Capture from start of history to current position
			command = `tmux capture-pane -p -e -t "${sessionName}" -S -${lines}`;
		} else {
			// Capture only visible pane content
			command = `tmux capture-pane -p -e -t "${sessionName}"`;
		}

		try {
			const { stdout } = await execAsync(command, { maxBuffer: 1024 * 1024 * 10 }); // 10MB buffer

			// Split into lines and optionally limit
			let outputLines = stdout.split('\n');
			if (outputLines.length > lines) {
				outputLines = outputLines.slice(-lines);
			}

			return json({
				success: true,
				sessionName,
				output: outputLines.join('\n'),
				lineCount: outputLines.length,
				truncated: stdout.split('\n').length > lines,
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

			// Check if pane not found
			if (errorMessage.includes("can't find pane")) {
				return json({
					error: 'Pane not found',
					message: `No active pane in session '${sessionName}'`,
					sessionName
				}, { status: 404 });
			}

			return json({
				error: 'Failed to capture output',
				message: errorMessage,
				sessionName
			}, { status: 500 });
		}
	} catch (error) {
		console.error('Error in GET /api/sessions/[name]/output:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
