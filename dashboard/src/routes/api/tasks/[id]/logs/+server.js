/**
 * Task Session Logs API Endpoint
 *
 * GET /api/tasks/{id}/logs - Returns session logs related to a task
 *
 * Searches .beads/logs/ for log files that contain the task ID.
 * Task ID is detected via:
 * - [JAT:WORKING task=X] markers
 * - [JAT:READY ...] markers after task work
 * - bd update/show commands referencing the task
 * - Git commit messages with task ID
 */

import { json } from '@sveltejs/kit';
import { readdir, readFile, stat } from 'fs/promises';
import { join, resolve } from 'path';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params }) {
	const { id } = params;

	if (!id) {
		return json({ error: 'Task ID is required' }, { status: 400 });
	}

	try {
		// Get the project root (parent of dashboard)
		const projectRoot = resolve(process.cwd(), '..');
		const logsDir = join(projectRoot, '.beads', 'logs');

		// Check if logs directory exists
		let logFiles = [];
		try {
			logFiles = await readdir(logsDir);
		} catch (err) {
			const error = /** @type {{ code?: string }} */ (err);
			if (error.code === 'ENOENT') {
				// Logs directory doesn't exist yet
				return json({
					task_id: id,
					logs: [],
					count: 0,
					message: 'No session logs available yet',
					timestamp: new Date().toISOString()
				});
			}
			throw err;
		}

		// Filter to only .log files
		logFiles = logFiles.filter(f => f.endsWith('.log'));

		if (logFiles.length === 0) {
			return json({
				task_id: id,
				logs: [],
				count: 0,
				message: 'No session logs found',
				timestamp: new Date().toISOString()
			});
		}

		// Search each log file for the task ID
		const matchingLogs = [];

		for (const logFile of logFiles) {
			const logPath = join(logsDir, logFile);

			try {
				// Get file stats for size and modification time
				const stats = await stat(logPath);

				// Read file content
				const content = await readFile(logPath, 'utf-8');

				// Check if this log contains the task ID
				// Look for various patterns where task ID appears
				// IMPORTANT: All patterns must include the full task ID to avoid false positives
				const patterns = [
					// JAT markers (must include task ID)
					`[JAT:WORKING task=${id}]`,
					`[JAT:READY task=${id}]`,
					`[JAT:NEEDS_REVIEW task=${id}]`,
					`[JAT:COMPLETED task=${id}]`,
					// Beads commands
					`bd show ${id}`,
					`bd update ${id}`,
					`bd close ${id}`,
					// Task references in text (with task ID)
					`task: ${id}`,
					`Task: ${id}`,
					`Starting: ${id}`,
					`Completed: ${id}`,
					// Log header pattern (most reliable - each log has this)
					`# Task: ${id}`,
				];

				// Also check if the task ID appears in the filename (session-...-{taskId}-...)
				const hasTaskInFilename = logFile.includes(`-${id}-`) || logFile.includes(`-${id}.`);

				const containsTask = hasTaskInFilename || patterns.some(pattern => content.includes(pattern));

				if (containsTask) {
					// Extract agent name from filename or content
					// Filename format: session-{session-name}-{timestamp}.log
					// or: session-jat-{AgentName}-{timestamp}.log
					let agentName = extractAgentFromFilename(logFile);
					if (!agentName) {
						agentName = extractAgentFromContent(content);
					}

					// Extract session timestamp from filename
					const sessionTime = extractTimeFromFilename(logFile);

					// Count occurrences of task ID to gauge relevance
					const occurrences = countOccurrences(content, id);

					matchingLogs.push({
						filename: logFile,
						path: `/api/tasks/${id}/logs/${encodeURIComponent(logFile)}`,
						size: stats.size,
						sizeFormatted: formatBytes(stats.size),
						modifiedAt: stats.mtime.toISOString(),
						sessionTime: sessionTime,
						agentName: agentName,
						taskReferences: occurrences,
						// Include first occurrence context (helpful for preview)
						preview: extractPreview(content, id)
					});
				}
			} catch (err) {
				console.error(`Error reading log file ${logFile}:`, err);
				// Continue with other files
			}
		}

		// Sort by modification time (newest first)
		matchingLogs.sort((a, b) =>
			new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
		);

		return json({
			task_id: id,
			logs: matchingLogs,
			count: matchingLogs.length,
			timestamp: new Date().toISOString()
		});

	} catch (error) {
		const err = /** @type {Error} */ (error);
		console.error('Error fetching task logs:', err);
		return json({
			error: 'Failed to fetch task logs',
			message: err.message
		}, { status: 500 });
	}
}

/**
 * Extract agent name from log filename
 * Format: session-jat-{AgentName}-{timestamp}.log
 * @param {string} filename
 * @returns {string|null}
 */
function extractAgentFromFilename(filename) {
	// Pattern: session-jat-AgentName-20251129-123456.log
	const match = filename.match(/session-jat-([A-Z][a-zA-Z]+)-\d{8}/);
	if (match) {
		return match[1];
	}
	return null;
}

/**
 * Extract agent name from log content
 * Look for agent registration or statusline patterns
 * @param {string} content
 * @returns {string|null}
 */
function extractAgentFromContent(content) {
	// Look for agent name patterns in content
	const patterns = [
		/Agent: ([A-Z][a-zA-Z]+)/,
		/agent_name[=:]?\s*"?([A-Z][a-zA-Z]+)"?/,
		/am-register.*--name[= ]"?([A-Z][a-zA-Z]+)"?/,
		/\[JAT:.*\].*([A-Z][a-zA-Z]+)/
	];

	for (const pattern of patterns) {
		const match = content.match(pattern);
		if (match) {
			return match[1];
		}
	}
	return null;
}

/**
 * Extract session start time from filename
 * Format: session-...-YYYYMMDD-HHMMSS.log
 * @param {string} filename
 * @returns {string|null}
 */
function extractTimeFromFilename(filename) {
	const match = filename.match(/(\d{8})-(\d{6})\.log$/);
	if (match) {
		const dateStr = match[1];
		const timeStr = match[2];
		// Parse YYYYMMDD-HHMMSS
		const year = dateStr.slice(0, 4);
		const month = dateStr.slice(4, 6);
		const day = dateStr.slice(6, 8);
		const hour = timeStr.slice(0, 2);
		const min = timeStr.slice(2, 4);
		const sec = timeStr.slice(4, 6);
		return `${year}-${month}-${day}T${hour}:${min}:${sec}`;
	}
	return null;
}

/**
 * Count occurrences of a string in content
 * @param {string} content
 * @param {string} searchStr
 * @returns {number}
 */
function countOccurrences(content, searchStr) {
	let count = 0;
	let pos = 0;
	while ((pos = content.indexOf(searchStr, pos)) !== -1) {
		count++;
		pos += searchStr.length;
	}
	return count;
}

/**
 * Extract a preview snippet around the first occurrence of task ID
 * @param {string} content
 * @param {string} taskId
 * @returns {string|null}
 */
function extractPreview(content, taskId) {
	const index = content.indexOf(taskId);
	if (index === -1) return null;

	// Get surrounding context (100 chars before and after)
	const start = Math.max(0, index - 100);
	const end = Math.min(content.length, index + taskId.length + 100);

	let preview = content.slice(start, end);

	// Clean up: replace newlines with spaces, trim
	preview = preview.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

	// Add ellipsis if truncated
	if (start > 0) preview = '...' + preview;
	if (end < content.length) preview = preview + '...';

	return preview;
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
