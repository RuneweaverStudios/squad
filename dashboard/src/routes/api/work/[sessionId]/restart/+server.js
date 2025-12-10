/**
 * Work Session Restart API
 * POST /api/work/[sessionId]/restart
 *
 * Restarts a work session by:
 * 1. Getting the current task assigned to the session's agent
 * 2. Killing the tmux session
 * 3. Spawning a new session with the same task
 *
 * This allows recovery from stuck or misbehaving Claude Code sessions
 * without losing the task assignment.
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { getTasks } from '$lib/server/beads.js';
import {
	DEFAULT_MODEL,
	DANGEROUSLY_SKIP_PERMISSIONS,
	AGENT_MAIL_URL
} from '$lib/config/spawnConfig.js';

const execAsync = promisify(exec);

/** @type {import('./$types').RequestHandler} */
export async function POST({ params }) {
	try {
		const { sessionId } = params;

		if (!sessionId) {
			return json({
				error: 'Missing session ID',
				message: 'Session ID is required in path'
			}, { status: 400 });
		}

		// Extract agent name from session name (jat-AgentName -> AgentName)
		const agentName = sessionId.replace(/^jat-/, '');

		// Step 1: Find in_progress task assigned to this agent
		let currentTask = null;
		let projectPath = null;
		try {
			const allTasks = getTasks({});
			currentTask = allTasks.find(
				t => t.status === 'in_progress' && t.assignee === agentName
			);
			if (currentTask) {
				projectPath = currentTask.project_path;
			}
		} catch (err) {
			console.error('Failed to fetch tasks:', err);
		}

		// If no task found, try to infer project from session or use default
		if (!projectPath) {
			projectPath = process.cwd().replace('/dashboard', '');
		}

		// Validate project path exists
		if (!existsSync(projectPath)) {
			return json({
				error: 'Project path not found',
				message: `Project directory does not exist: ${projectPath}`,
				sessionId
			}, { status: 400 });
		}

		// Step 2: Kill the existing tmux session
		try {
			await execAsync(`tmux kill-session -t "${sessionId}" 2>/dev/null`);
		} catch {
			// Session may not exist, that's okay - we'll create a new one
		}

		// Small delay to ensure session is fully killed
		await new Promise(resolve => setTimeout(resolve, 500));

		// Step 3: Create new tmux session with Claude Code
		// Build the claude command
		let claudeCmd = `cd "${projectPath}"`;
		claudeCmd += ` && AGENT_MAIL_URL="${AGENT_MAIL_URL}"`;
		claudeCmd += ` claude --model ${DEFAULT_MODEL}`;

		if (DANGEROUSLY_SKIP_PERMISSIONS) {
			claudeCmd += ' --dangerously-skip-permissions';
		}

		const createSessionCmd = `tmux new-session -d -s "${sessionId}" -c "${projectPath}" && tmux send-keys -t "${sessionId}" "${claudeCmd}" Enter`;

		try {
			await execAsync(createSessionCmd);
		} catch (err) {
			const execErr = /** @type {{ stderr?: string, message?: string }} */ (err);
			const errorMessage = execErr.stderr || (err instanceof Error ? err.message : String(err));

			return json({
				error: 'Failed to create session',
				message: errorMessage,
				sessionId,
				agentName
			}, { status: 500 });
		}

		// Step 4: Wait for Claude to initialize, then send /jat:start {agentName} [taskId]
		const initialPrompt = currentTask
			? `/jat:start ${agentName} ${currentTask.id}`
			: `/jat:start ${agentName}`;

		await new Promise(resolve => setTimeout(resolve, 5000));

		try {
			// Escape special characters and send text+Enter as ONE command to avoid race conditions
			const escapedPrompt = initialPrompt.replace(/"/g, '\\"').replace(/\$/g, '\\$');
			await execAsync(`tmux send-keys -t "${sessionId}" -- "${escapedPrompt}" Enter`);
		} catch (err) {
			// Non-fatal - session is created, prompt just failed
			console.error('Failed to send initial prompt:', err);
		}

		return json({
			success: true,
			sessionId,
			agentName,
			taskId: currentTask?.id || null,
			projectPath,
			message: currentTask
				? `Restarted session ${sessionId} with task ${currentTask.id}`
				: `Restarted session ${sessionId} (no task assigned)`,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error in POST /api/work/[sessionId]/restart:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
