/**
 * Session Management API
 * DELETE /api/sessions/[name] - Kill a session
 * PATCH /api/sessions/[name] - Rename a session
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * PATCH /api/sessions/[name]
 * Rename a tmux session
 * Body: { newName: string }
 */
/** @type {import('./$types').RequestHandler} */
export async function PATCH({ params, request }) {
	try {
		const sessionName = params.name;
		const body = await request.json();
		const { newName } = body;

		if (!sessionName) {
			return json({
				error: 'Missing session name',
				message: 'Session name is required'
			}, { status: 400 });
		}

		if (!newName) {
			return json({
				error: 'Missing new name',
				message: 'newName is required in request body'
			}, { status: 400 });
		}

		// Rename the tmux session
		const command = `tmux rename-session -t "${sessionName}" "${newName}" 2>&1`;

		try {
			await execAsync(command);

			return json({
				success: true,
				oldName: sessionName,
				newName,
				message: `Session renamed from '${sessionName}' to '${newName}'`,
				timestamp: new Date().toISOString()
			});
		} catch (execError) {
			const execErr = /** @type {{ stderr?: string, message?: string }} */ (execError);
			const errorMessage = execErr.stderr || execErr.message || String(execError);

			if (errorMessage.includes("can't find session") || errorMessage.includes('no server running')) {
				return json({
					error: 'Session not found',
					message: `Session '${sessionName}' does not exist`,
					sessionName
				}, { status: 404 });
			}

			if (errorMessage.includes('duplicate session')) {
				return json({
					error: 'Name already exists',
					message: `A session named '${newName}' already exists`,
					sessionName,
					newName
				}, { status: 409 });
			}

			return json({
				error: 'Failed to rename session',
				message: errorMessage,
				sessionName
			}, { status: 500 });
		}
	} catch (error) {
		console.error('Error in PATCH /api/sessions/[name]:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ params }) {
	try {
		const sessionName = params.name;

		if (!sessionName) {
			return json({
				error: 'Missing session name',
				message: 'Session name is required'
			}, { status: 400 });
		}

		// Kill the tmux session
		const command = `tmux kill-session -t "${sessionName}" 2>&1`;

		try {
			await execAsync(command);

			return json({
				success: true,
				sessionName,
				message: `Session ${sessionName} killed successfully`,
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
				error: 'Failed to kill session',
				message: errorMessage,
				sessionName
			}, { status: 500 });
		}
	} catch (error) {
		console.error('Error in DELETE /api/sessions/[name]:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
