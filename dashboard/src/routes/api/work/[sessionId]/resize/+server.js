/**
 * Resize tmux session window
 * POST /api/work/[sessionId]/resize
 *
 * Resizes the tmux window to match the SessionCard display width.
 * This allows Claude Code's output (statusline, prompts) to format correctly
 * for the dashboard display.
 *
 * Body:
 * - width: Target width in columns (required)
 * - height: Target height in rows (optional, default: 40)
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/** @type {import('./$types').RequestHandler} */
export async function POST({ params, request }) {
	const { sessionId } = params;

	if (!sessionId) {
		return json({ error: 'Session ID is required' }, { status: 400 });
	}

	// Validate session ID format (jat-AgentName)
	if (!sessionId.startsWith('jat-')) {
		return json({ error: 'Invalid session ID format' }, { status: 400 });
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { width, height = 40 } = body;

	if (!width || typeof width !== 'number' || width < 40 || width > 500) {
		return json({
			error: 'Invalid width',
			message: 'Width must be a number between 40 and 500 columns'
		}, { status: 400 });
	}

	if (typeof height !== 'number' || height < 10 || height > 200) {
		return json({
			error: 'Invalid height',
			message: 'Height must be a number between 10 and 200 rows'
		}, { status: 400 });
	}

	try {
		// Check if session exists
		try {
			await execAsync(`tmux has-session -t "${sessionId}" 2>/dev/null`);
		} catch {
			return json({
				error: 'Session not found',
				message: `Session '${sessionId}' does not exist`
			}, { status: 404 });
		}

		// Resize the window
		await execAsync(`tmux resize-window -t "${sessionId}" -x ${Math.floor(width)} -y ${Math.floor(height)}`);

		// Get the new dimensions to confirm
		const { stdout } = await execAsync(
			`tmux display-message -p -t "${sessionId}" '#{window_width}x#{window_height}'`
		);
		const [newWidth, newHeight] = stdout.trim().split('x').map(Number);

		return json({
			success: true,
			sessionId,
			dimensions: {
				width: newWidth,
				height: newHeight
			}
		});
	} catch (error) {
		console.error('Error resizing session:', error);
		return json({
			error: 'Failed to resize session',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}

/**
 * Get current tmux session dimensions
 * GET /api/work/[sessionId]/resize
 */
export async function GET({ params }) {
	const { sessionId } = params;

	if (!sessionId) {
		return json({ error: 'Session ID is required' }, { status: 400 });
	}

	try {
		// Check if session exists
		try {
			await execAsync(`tmux has-session -t "${sessionId}" 2>/dev/null`);
		} catch {
			return json({
				error: 'Session not found',
				message: `Session '${sessionId}' does not exist`
			}, { status: 404 });
		}

		// Get current dimensions
		const { stdout } = await execAsync(
			`tmux display-message -p -t "${sessionId}" '#{window_width}x#{window_height}'`
		);
		const [width, height] = stdout.trim().split('x').map(Number);

		return json({
			sessionId,
			dimensions: {
				width,
				height
			}
		});
	} catch (error) {
		console.error('Error getting session dimensions:', error);
		return json({
			error: 'Failed to get session dimensions',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
