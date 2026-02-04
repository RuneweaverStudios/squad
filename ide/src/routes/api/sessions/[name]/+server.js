/**
 * Session Management API
 * DELETE /api/sessions/[name] - Kill a session (and release task)
 * PATCH /api/sessions/[name] - Rename a session
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { appendFile, mkdir, access, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getTasks } from '$lib/server/beads.js';

const execAsync = promisify(exec);

/**
 * Capture session scrollback and append to unified session log
 * @param {string} sessionName - tmux session name
 * @param {string} reason - compacted | paused | killed | completed
 */
async function captureSessionLog(sessionName, reason) {
	const projectPath = process.cwd().replace('/ide', '');
	const logsDir = path.join(projectPath, '.beads', 'logs');
	const logFile = path.join(logsDir, `session-${sessionName}.log`);

	// Ensure logs directory exists
	if (!existsSync(logsDir)) {
		await mkdir(logsDir, { recursive: true });
	}

	// Check if session exists
	try {
		await execAsync(`tmux has-session -t "${sessionName}" 2>/dev/null`);
	} catch {
		return null; // Session doesn't exist
	}

	// Capture scrollback
	let scrollback = '';
	try {
		const { stdout } = await execAsync(
			`tmux capture-pane -t "${sessionName}" -p -S - -E -`,
			{ maxBuffer: 10 * 1024 * 1024 }
		);
		scrollback = stdout;
	} catch {
		return null;
	}

	if (!scrollback.trim()) {
		return null;
	}

	const timestamp = new Date().toISOString();

	// Determine separator based on reason
	/** @type {Record<string, string>} */
	const separators = {
		compacted: '📦 CONTEXT COMPACTED',
		paused: '⏸️ SESSION PAUSED',
		killed: '💀 SESSION KILLED',
		completed: '✅ TASK COMPLETED'
	};
	const label = separators[reason] || '📝 LOG CAPTURED';

	const separator = `
════════════════════════════════════════════════════════════════════════════════
${label} at ${timestamp}
════════════════════════════════════════════════════════════════════════════════
`;

	// If log file doesn't exist, add header
	if (!existsSync(logFile)) {
		const header = `# Session Log: ${sessionName}
# Created: ${timestamp}
# This file accumulates session history across compactions, pauses, and completions.
================================================================================

`;
		await writeFile(logFile, header, 'utf-8');
	}

	// Append scrollback with separator
	await appendFile(logFile, scrollback + separator, 'utf-8');

	return logFile;
}

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

		// IMPORTANT: Capture scrollback BEFORE killing the session
		// This preserves the session history in the unified log
		let logCaptured = null;
		try {
			logCaptured = await captureSessionLog(sessionName, 'killed');
		} catch (err) {
			console.error('Failed to capture session log before kill:', err);
			// Non-fatal - continue with kill
		}

		// Kill the tmux session (with jat- prefix)
		const killCommand = `tmux kill-session -t "${sessionName}" 2>&1`;
		let sessionKilled = false;

		try {
			await execAsync(killCommand);
			sessionKilled = true;
		} catch (execError) {
			const execErr = /** @type {{ stderr?: string, stdout?: string, message?: string }} */ (execError);
			const errorMessage = execErr.stdout || execErr.stderr || execErr.message || String(execError);

			// Check if session not found - that's ok, continue to release task
			if (!errorMessage.includes("can't find session") && !errorMessage.includes('no server running')) {
				return json({
					error: 'Failed to kill session',
					message: errorMessage,
					agentName,
					sessionName
				}, { status: 500 });
			}
		}

		// Release the task assigned to this agent (search across ALL projects)
		// Find tasks where assignee = agentName and status = in_progress, set back to open with no assignee
		let taskReleased = false;
		let releasedTaskId = null;

		try {
			// Use beads.js to find tasks across all projects
			const allTasks = getTasks({ status: 'in_progress' });
			const agentTask = allTasks.find(t => t.assignee === agentName);

			if (agentTask) {
				// Release the task: set status back to open and clear assignee
				// Run bd update in the task's project directory
				await execAsync(`bd update "${agentTask.id}" --status open --assignee ""`, {
					cwd: agentTask.project_path,
					timeout: 10000
				});
				taskReleased = true;
				releasedTaskId = agentTask.id;
			}
		} catch (err) {
			// Non-fatal - session is killed, task release just failed
			console.error('Failed to release task:', err);
		}

		if (!sessionKilled && !taskReleased) {
			return json({
				error: 'Session not found',
				message: `No active session for agent '${agentName}' and no task to release`,
				agentName,
				sessionName
			}, { status: 404 });
		}

		return json({
			success: true,
			agentName,
			sessionName,
			sessionKilled,
			taskReleased,
			releasedTaskId,
			logCaptured: logCaptured ? true : false,
			logFile: logCaptured || null,
			message: taskReleased
				? `Session killed and task ${releasedTaskId} released`
				: `Session for ${agentName} killed successfully`,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error in DELETE /api/sessions/[name]:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
