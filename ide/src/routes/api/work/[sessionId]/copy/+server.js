/**
 * Session Copy API - Get formatted session contents for clipboard
 * GET /api/work/[sessionId]/copy - Returns formatted session contents
 *
 * Path params:
 * - sessionId: tmux session name (e.g., "jat-WisePrairie")
 *
 * Returns a formatted text string containing:
 * - Session name
 * - Agent name (from session name)
 * - Task info (from JAT Tasks, if agent has an assigned task)
 * - Terminal output (stripped of ANSI codes)
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getTasks } from '$lib/server/jat-tasks.js';

const execAsync = promisify(exec);

/**
 * Strip ANSI escape codes from a string
 * @param {string} str
 * @returns {string}
 */
function stripAnsi(str) {
	// eslint-disable-next-line no-control-regex
	return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\[[\d;]*m/g, '');
}

/** @type {import('./$types').RequestHandler} */
export async function GET({ params }) {
	try {
		const { sessionId } = params;

		if (!sessionId) {
			return json({
				error: 'Missing session ID',
				message: 'Session ID is required in path'
			}, { status: 400 });
		}

		// Check if session exists
		let sessionExists = false;
		try {
			await execAsync(`tmux has-session -t "${sessionId}" 2>/dev/null`);
			sessionExists = true;
		} catch {
			return json({
				error: 'Session not found',
				message: `Session '${sessionId}' does not exist`
			}, { status: 404 });
		}

		// Detect session type and extract relevant info
		// Agent sessions: jat-{AgentName} (e.g., jat-WisePrairie)
		// Server sessions: {project}-dev or similar (e.g., chimaro-dev, jat-dev)
		const isAgentSession = sessionId.startsWith('jat-') && !sessionId.endsWith('-dev');
		const isServerSession = sessionId.endsWith('-dev') || sessionId.includes('-dev-');

		/** @type {string|null} */
	let agentName = null;
		let task = null;

		if (isAgentSession) {
			// Extract agent name from jat-{AgentName}
			agentName = sessionId.replace(/^jat-/, '');

			// Find task assigned to this agent
			try {
				const allTasks = getTasks({});
				task = allTasks.find(
					t => t.status === 'in_progress' && t.assignee === agentName
				);
			} catch (err) {
				console.error('Failed to fetch tasks:', err);
				// Continue without task info
			}
		}

		// Capture terminal output (full history, stripped of ANSI codes)
		let output = '';
		try {
			// -p: print to stdout
			// -S -500: last 500 lines of history (reasonable amount for copying)
			const { stdout } = await execAsync(
				`tmux capture-pane -t "${sessionId}" -p -S -500`,
				{ maxBuffer: 10 * 1024 * 1024 } // 10MB buffer
			);
			output = stripAnsi(stdout);
		} catch (err) {
			console.error('Failed to capture session output:', err);
			// Continue with empty output
		}

		// Build formatted content
		const lines = [];
		const separator = '─'.repeat(50);

		// Header
		lines.push(`Session: ${sessionId}`);
		lines.push(separator);

		// Session type info
		if (isServerSession) {
			// Extract project name from server session (e.g., chimaro-dev -> chimaro)
			const projectName = sessionId.replace(/-dev(-server)?$/, '');
			lines.push(`Server: ${projectName}`);
		} else if (agentName) {
			lines.push(`Agent: ${agentName}`);
		}

		// Task info
		if (task) {
			lines.push('');
			lines.push(`Task: ${task.id}`);
			if (task.title) {
				lines.push(`Title: ${task.title}`);
			}
			if (task.status) {
				lines.push(`Status: ${task.status}`);
			}
			if (task.priority !== undefined) {
				lines.push(`Priority: P${task.priority}`);
			}
			if (task.description) {
				lines.push(`Description: ${task.description}`);
			}
		}

		// Terminal output
		if (output && output.trim()) {
			lines.push('');
			lines.push(separator);
			lines.push('Terminal Output:');
			lines.push(separator);
			lines.push(output.trim());
		}

		const content = lines.join('\n');

		return json({
			success: true,
			sessionId,
			sessionType: isServerSession ? 'server' : (isAgentSession ? 'agent' : 'unknown'),
			agentName,
			taskId: task?.id || null,
			content,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error in GET /api/work/[sessionId]/copy:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
