/**
 * Capture Session Log API
 * POST /api/work/[sessionId]/capture-log - Capture and append to unified session log
 *
 * Path params:
 * - sessionId: tmux session name (e.g., "jat-WisePrairie")
 *
 * Body (optional):
 * - taskId: Task ID for context (used in log metadata)
 * - reason: Why capture was triggered (default: "completed")
 *
 * Behavior:
 * 1. Capture full tmux pane content
 * 2. Append to unified session log: .beads/logs/session-{sessionId}.log
 * 3. Return log file path
 *
 * The unified log accumulates all session history across compactions,
 * pauses, completions, and manual captures.
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, appendFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getTasks } from '$lib/server/beads.js';

const execAsync = promisify(exec);

/** @type {import('./$types').RequestHandler} */
export async function POST({ params, request }) {
	try {
		const { sessionId } = params;

		if (!sessionId) {
			return json({
				error: 'Missing session ID',
				message: 'Session ID is required in path'
			}, { status: 400 });
		}

		// Parse optional body
		/** @type {{ taskId?: string, reason?: string }} */
		let body = {};
		try {
			body = await request.json();
		} catch {
			// No body or invalid JSON - that's okay
		}

		const projectPath = process.cwd().replace('/ide', '');
		const logsDir = path.join(projectPath, '.beads', 'logs');
		const reason = body.reason || 'completed';

		// Extract agent name from session name (jat-AgentName -> AgentName)
		const agentName = sessionId.replace(/^jat-/, '');

		// Unified log file path
		const filename = `session-${sessionId}.log`;
		const filepath = path.join(logsDir, filename);

		// Step 1: Check if session exists
		try {
			await execAsync(`tmux has-session -t "${sessionId}" 2>/dev/null`);
		} catch {
			return json({
				error: 'Session not found',
				message: `Session '${sessionId}' does not exist`,
				sessionId
			}, { status: 404 });
		}

		// Step 2: Capture full tmux pane content
		let sessionContent = '';
		try {
			// -p: print to stdout
			// -S -: start from beginning of scrollback
			// -E -: end at bottom of scrollback
			const { stdout } = await execAsync(
				`tmux capture-pane -t "${sessionId}" -p -S - -E -`,
				{ maxBuffer: 50 * 1024 * 1024 } // 50MB buffer for large sessions
			);
			sessionContent = stdout;
		} catch (err) {
			const execErr = /** @type {{ stderr?: string, message?: string }} */ (err);
			const errorMessage = execErr.stderr || (err instanceof Error ? err.message : String(err));
			return json({
				error: 'Failed to capture session',
				message: errorMessage,
				sessionId
			}, { status: 500 });
		}

		if (!sessionContent.trim()) {
			return json({
				error: 'Empty session',
				message: 'Session has no content to capture',
				sessionId
			}, { status: 400 });
		}

		// Step 3: Determine task ID (for metadata, not filename)
		let taskId = body.taskId || null;

		if (!taskId) {
			// Try to find task from agent's in_progress/closed task
			try {
				const allTasks = getTasks({});
				// First look for in_progress task
				let agentTask = allTasks.find(
					t => t.assignee === agentName && t.status === 'in_progress'
				);
				// If not found, look for recently closed task
				if (!agentTask) {
					agentTask = allTasks.find(
						t => t.assignee === agentName && t.status === 'closed'
					);
				}
				if (agentTask) {
					taskId = agentTask.id;
				}
			} catch (err) {
				console.error('Failed to fetch tasks for task ID:', err);
			}
		}

		if (!taskId) {
			taskId = 'unknown';
		}

		// Ensure logs directory exists
		if (!existsSync(logsDir)) {
			await mkdir(logsDir, { recursive: true });
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
		if (!existsSync(filepath)) {
			const header = `# Session Log: ${sessionId}
# Agent: ${agentName}
# Task: ${taskId}
# Created: ${timestamp}
# This file accumulates session history across compactions, pauses, and completions.
================================================================================

`;
			await writeFile(filepath, header, 'utf-8');
		}

		// Append scrollback with separator
		await appendFile(filepath, sessionContent + separator, 'utf-8');

		// Get file size
		const { size } = await import('fs').then(fs =>
			fs.promises.stat(filepath)
		);

		return json({
			success: true,
			sessionId,
			agentName,
			taskId,
			filename,
			filepath,
			size,
			lines: sessionContent.split('\n').length,
			reason,
			message: `Session log appended to ${filename}`,
			timestamp
		});

	} catch (error) {
		console.error('Error in POST /api/work/[sessionId]/capture-log:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
