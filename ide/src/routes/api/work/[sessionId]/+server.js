/**
 * Work Session API - Manage individual work sessions
 * DELETE /api/work/[sessionId] - Kill session and close associated task
 *
 * Path params:
 * - sessionId: tmux session name (e.g., "squad-WisePrairie")
 *
 * Behavior:
 * 1. Kill the tmux session
 * 2. If session was working on a task, update task status to closed
 * 3. Return success/failure
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getTasks } from '$lib/server/squad-tasks.js';

const execAsync = promisify(exec);

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ params }) {
	try {
		const { sessionId } = params;

		if (!sessionId) {
			return json({
				error: 'Missing session ID',
				message: 'Session ID is required in path'
			}, { status: 400 });
		}

		const projectPath = process.cwd().replace('/ide', '');

		// Extract agent name from session name (squad-AgentName -> AgentName)
		const agentName = sessionId.replace(/^squad-/, '');

		// Step 1: Check if session exists
		let sessionExists = false;
		try {
			await execAsync(`tmux has-session -t "${sessionId}" 2>/dev/null`);
			sessionExists = true;
		} catch {
			// Session doesn't exist - that's okay, we'll still try to close any task
		}

		// Step 2: Find any in_progress task assigned to this agent
		let taskToClose = null;
		try {
			const allTasks = getTasks({});
			taskToClose = allTasks.find(
				t => t.status === 'in_progress' && t.assignee === agentName
			);
		} catch (err) {
			console.error('Failed to fetch tasks:', err);
			// Continue without task lookup
		}

		// Step 3: Kill the tmux session if it exists
		let sessionKilled = false;
		if (sessionExists) {
			try {
				await execAsync(`tmux kill-session -t "${sessionId}"`);
				sessionKilled = true;
			} catch (err) {
				const execErr = /** @type {{ stderr?: string, message?: string }} */ (err);
				const errorMessage = execErr.stderr || (err instanceof Error ? err.message : String(err));

				// If session doesn't exist anymore, that's fine
				if (!errorMessage.includes("session not found") && !errorMessage.includes("no session")) {
					console.error('Failed to kill session:', errorMessage);
					// Continue anyway - we still want to close the task
				}
			}
		}

		// Step 4: Close the task in SQUAD if one was found
		let taskClosed = false;
		let closedTaskId = null;
		if (taskToClose) {
			try {
				await execAsync(`st update "${taskToClose.id}" --status closed`, {
					cwd: projectPath,
					timeout: 10000
				});
				taskClosed = true;
				closedTaskId = taskToClose.id;
			} catch (err) {
				console.error('Failed to close task:', err);
				// Non-fatal - session is killed, task update just failed
			}
		}

		// Determine overall success
		if (!sessionExists && !taskToClose) {
			return json({
				error: 'Session not found',
				message: `Session '${sessionId}' does not exist and no task found for agent '${agentName}'`,
				sessionId,
				agentName
			}, { status: 404 });
		}

		return json({
			success: true,
			sessionId,
			agentName,
			sessionKilled,
			taskClosed,
			closedTaskId,
			message: taskClosed
				? `Killed session and closed task ${closedTaskId}`
				: sessionKilled
					? `Killed session (no task to close)`
					: `No session to kill, task already closed`,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error in DELETE /api/work/[sessionId]:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
