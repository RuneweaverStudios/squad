/**
 * Capture Session Log API
 * POST /api/work/[sessionId]/capture-log - Capture and save session transcript
 *
 * Path params:
 * - sessionId: tmux session name (e.g., "jat-WisePrairie")
 *
 * Body (optional):
 * - taskId: Override task ID for filename (otherwise detected from session)
 *
 * Behavior:
 * 1. Capture full tmux pane content
 * 2. Determine task ID from agent's task or session output
 * 3. Save to .beads/logs/session-{taskId}-{timestamp}.log
 * 4. Return log file path
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir } from 'fs/promises';
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
		/** @type {{ taskId?: string }} */
		let body = {};
		try {
			body = await request.json();
		} catch {
			// No body or invalid JSON - that's okay
		}

		const projectPath = process.cwd().replace('/dashboard', '');
		const logsDir = path.join(projectPath, '.beads', 'logs');

		// Extract agent name from session name (jat-AgentName -> AgentName)
		const agentName = sessionId.replace(/^jat-/, '');

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

		// Step 3: Determine task ID
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
			// Try to extract task ID from session content
			// Look for patterns like [JAT:WORKING task=xxx] or "Task: xxx"
			const taskPatterns = [
				/\[JAT:WORKING task=([^\]]+)\]/,
				/\[JAT:COMPLETED\].*?([a-z]+-[a-z0-9]+)/i,
				/Task[:\s]+([a-z]+-[a-z0-9]+)/i,
				/Starting work:?\s*([a-z]+-[a-z0-9]+)/i
			];

			for (const pattern of taskPatterns) {
				const match = sessionContent.match(pattern);
				if (match && match[1]) {
					taskId = match[1];
					break;
				}
			}
		}

		// Default task ID if still not found
		if (!taskId) {
			taskId = 'unknown';
		}

		// Step 4: Generate filename and save
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const filename = `session-${sessionId}-${taskId}-${timestamp}.log`;
		const filepath = path.join(logsDir, filename);

		// Ensure logs directory exists
		if (!existsSync(logsDir)) {
			await mkdir(logsDir, { recursive: true });
		}

		// Build log content with metadata header
		const logHeader = `# Session Log
# Session: ${sessionId}
# Agent: ${agentName}
# Task: ${taskId}
# Captured: ${new Date().toISOString()}
# Lines: ${sessionContent.split('\n').length}
${'='.repeat(80)}

`;
		const fullContent = logHeader + sessionContent;

		await writeFile(filepath, fullContent, 'utf-8');

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
			message: `Session log saved to ${filename}`,
			timestamp: new Date().toISOString()
		});

	} catch (error) {
		console.error('Error in POST /api/work/[sessionId]/capture-log:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
