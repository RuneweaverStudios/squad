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
 * Session name prefix for JAT agent sessions
 * Sessions are named: jat-{AgentName}
 */
const SESSION_PREFIX = 'jat-';

/**
 * Get the full tmux session name from a name parameter.
 * Handles both:
 * - Agent name (e.g., "DullGrove") → "jat-DullGrove"
 * - Full session name (e.g., "jat-DullGrove") → "jat-DullGrove" (no double prefix)
 * @param {string} name - Agent name or full session name
 * @returns {{ agentName: string, sessionName: string }}
 */
function resolveSessionName(name) {
	if (name.startsWith(SESSION_PREFIX)) {
		// Already has prefix - extract agent name
		return {
			agentName: name.slice(SESSION_PREFIX.length),
			sessionName: name
		};
	}
	// Add prefix
	return {
		agentName: name,
		sessionName: `${SESSION_PREFIX}${name}`
	};
}

/**
 * PATCH /api/sessions/[name]
 * Rename a tmux session
 * Body: { newName: string }
 */
/** @type {import('./$types').RequestHandler} */
export async function PATCH({ params, request }) {
	try {
		const { agentName, sessionName } = resolveSessionName(params.name);
		const body = await request.json();
		const { newName } = body;

		if (!agentName) {
			return json({
				error: 'Missing agent name',
				message: 'Agent name is required'
			}, { status: 400 });
		}

		if (!newName) {
			return json({
				error: 'Missing new name',
				message: 'newName is required in request body'
			}, { status: 400 });
		}

		// Rename the tmux session (add prefix to new name as well)
		const newSessionName = `${SESSION_PREFIX}${newName}`;
		const command = `tmux rename-session -t "${sessionName}" "${newSessionName}" 2>&1`;

		try {
			await execAsync(command);

			return json({
				success: true,
				oldAgentName: agentName,
				newAgentName: newName,
				oldSessionName: sessionName,
				newSessionName,
				message: `Session renamed from '${agentName}' to '${newName}'`,
				timestamp: new Date().toISOString()
			});
		} catch (execError) {
			const execErr = /** @type {{ stderr?: string, stdout?: string, message?: string }} */ (execError);
			// With 2>&1, stderr goes to stdout, so check both
			const errorMessage = execErr.stdout || execErr.stderr || execErr.message || String(execError);

			if (errorMessage.includes("can't find session") || errorMessage.includes('no server running')) {
				return json({
					error: 'Session not found',
					message: `No active session for agent '${agentName}' (looked for tmux session '${sessionName}')`,
					agentName,
					sessionName
				}, { status: 404 });
			}

			if (errorMessage.includes('duplicate session')) {
				return json({
					error: 'Name already exists',
					message: `A session named '${newName}' already exists`,
					agentName,
					newName
				}, { status: 409 });
			}

			return json({
				error: 'Failed to rename session',
				message: errorMessage,
				agentName,
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
		const { agentName, sessionName } = resolveSessionName(params.name);

		if (!agentName) {
			return json({
				error: 'Missing agent name',
				message: 'Agent name is required'
			}, { status: 400 });
		}

		// Kill the tmux session (with jat- prefix)
		const command = `tmux kill-session -t "${sessionName}" 2>&1`;

		try {
			await execAsync(command);

			return json({
				success: true,
				agentName,
				sessionName,
				message: `Session for ${agentName} killed successfully`,
				timestamp: new Date().toISOString()
			});
		} catch (execError) {
			const execErr = /** @type {{ stderr?: string, stdout?: string, message?: string }} */ (execError);
			// With 2>&1, stderr goes to stdout, so check both
			const errorMessage = execErr.stdout || execErr.stderr || execErr.message || String(execError);

			// Check if session not found
			if (errorMessage.includes("can't find session") || errorMessage.includes('no server running')) {
				return json({
					error: 'Session not found',
					message: `No active session for agent '${agentName}' (looked for tmux session '${sessionName}')`,
					agentName,
					sessionName
				}, { status: 404 });
			}

			return json({
				error: 'Failed to kill session',
				message: errorMessage,
				agentName,
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
