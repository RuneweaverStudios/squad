/**
 * Batch Task Sessions API
 * POST /api/tasks/sessions - Get sessions for multiple tasks at once
 *
 * Body: { taskIds: string[] }
 * Returns: { sessions: { [taskId: string]: TaskSession[] } }
 */

import { json } from '@sveltejs/kit';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import type { RequestHandler } from './$types';

interface TaskSession {
	agentName: string;
	sessionId: string | null;
	lastActivity: string | null;
	signalCount: number;
	isOnline: boolean;
}

/**
 * Get project path (parent of dashboard)
 */
function getProjectPath(): string {
	return process.cwd().replace(/\/dashboard$/, '');
}

/**
 * Check which agents have active tmux sessions (batch check)
 */
function getOnlineAgents(): Set<string> {
	const online = new Set<string>();
	try {
		const result = execSync('tmux list-sessions -F "#{session_name}" 2>/dev/null || true', {
			encoding: 'utf-8'
		}).trim();

		for (const line of result.split('\n')) {
			if (line.startsWith('jat-')) {
				online.add(line.replace('jat-', ''));
			}
		}
	} catch {
		// No tmux or error
	}
	return online;
}

/**
 * Find session ID for an agent from signal files
 */
function findSessionIdForAgent(agentName: string, projectPath: string, signalCache: Map<string, any>): string | null {
	// Check cache first
	const cached = signalCache.get(agentName);
	if (cached?.session_id) {
		return cached.session_id;
	}

	// Try persistent session files
	const sessionsDir = join(projectPath, '.claude', 'sessions');
	if (existsSync(sessionsDir)) {
		try {
			const files = readdirSync(sessionsDir)
				.filter(f => f.startsWith('agent-') && f.endsWith('.txt'))
				.map(f => ({
					name: f,
					path: join(sessionsDir, f),
					mtime: statSync(join(sessionsDir, f)).mtime.getTime()
				}))
				.sort((a, b) => b.mtime - a.mtime);

			for (const file of files) {
				try {
					const content = readFileSync(file.path, 'utf-8').trim();
					if (content === agentName) {
						const match = file.name.match(/^agent-(.+)\.txt$/);
						if (match) {
							return match[1];
						}
					}
				} catch {
					// Skip unreadable files
				}
			}
		} catch {
			// Continue
		}
	}

	return null;
}

/**
 * Scan all timeline files once and build task->sessions map
 */
function buildTaskSessionsMap(taskIds: Set<string>, projectPath: string): Map<string, TaskSession[]> {
	const taskSessions = new Map<string, Map<string, TaskSession>>();
	const onlineAgents = getOnlineAgents();
	const signalCache = new Map<string, any>();

	// Initialize maps for requested tasks
	for (const taskId of taskIds) {
		taskSessions.set(taskId, new Map());
	}

	const tmpDir = '/tmp';
	const timelinePattern = /^jat-timeline-jat-(.+)\.jsonl$/;

	// First, cache all signal files for session ID lookup
	try {
		const signalFiles = readdirSync(tmpDir).filter(f => f.startsWith('jat-signal-tmux-jat-'));
		for (const file of signalFiles) {
			const agentMatch = file.match(/^jat-signal-tmux-jat-(.+)\.json$/);
			if (agentMatch) {
				try {
					const content = readFileSync(join(tmpDir, file), 'utf-8');
					const data = JSON.parse(content);
					signalCache.set(agentMatch[1], data);
				} catch {
					// Skip invalid files
				}
			}
		}
	} catch {
		// /tmp not readable
	}

	// Scan timeline files
	try {
		const files = readdirSync(tmpDir).filter(f => timelinePattern.test(f));

		for (const file of files) {
			const match = file.match(timelinePattern);
			if (!match) continue;

			const agentName = match[1];
			const filePath = join(tmpDir, file);

			try {
				const content = readFileSync(filePath, 'utf-8');
				const lines = content.trim().split('\n');

				// Track which tasks this agent worked on
				const agentTaskActivity = new Map<string, { count: number; lastActivity: string | null }>();

				for (const line of lines) {
					// Quick check if any of our task IDs appear in this line
					let foundTaskId: string | null = null;
					for (const taskId of taskIds) {
						if (line.includes(taskId)) {
							foundTaskId = taskId;
							break;
						}
					}

					if (!foundTaskId) continue;

					try {
						const event = JSON.parse(line);
						const eventTaskId = event.data?.taskId;

						// Verify it's actually our task (not just substring match)
						if (eventTaskId && taskIds.has(eventTaskId)) {
							const activity = agentTaskActivity.get(eventTaskId) || { count: 0, lastActivity: null };
							activity.count++;
							if (event.timestamp && (!activity.lastActivity || event.timestamp > activity.lastActivity)) {
								activity.lastActivity = event.timestamp;
							}
							agentTaskActivity.set(eventTaskId, activity);
						}
					} catch {
						// Skip malformed lines
					}
				}

				// Add this agent's sessions to the task maps
				for (const [taskId, activity] of agentTaskActivity) {
					const sessionMap = taskSessions.get(taskId);
					if (sessionMap && activity.count > 0) {
						const sessionId = findSessionIdForAgent(agentName, projectPath, signalCache);
						sessionMap.set(agentName, {
							agentName,
							sessionId,
							lastActivity: activity.lastActivity,
							signalCount: activity.count,
							isOnline: onlineAgents.has(agentName)
						});
					}
				}
			} catch {
				// Skip unreadable files
			}
		}
	} catch {
		// /tmp not readable
	}

	// Also check signal files for current task assignments
	for (const [agentName, data] of signalCache) {
		if (data.data?.taskId && taskIds.has(data.data.taskId)) {
			const sessionMap = taskSessions.get(data.data.taskId);
			if (sessionMap && !sessionMap.has(agentName)) {
				sessionMap.set(agentName, {
					agentName,
					sessionId: data.session_id || null,
					lastActivity: data.timestamp || null,
					signalCount: 1,
					isOnline: onlineAgents.has(agentName)
				});
			}
		}
	}

	// Convert to sorted arrays
	const result = new Map<string, TaskSession[]>();
	for (const [taskId, sessionMap] of taskSessions) {
		const sessions = Array.from(sessionMap.values()).sort((a, b) => {
			// Online agents first
			if (a.isOnline && !b.isOnline) return -1;
			if (!a.isOnline && b.isOnline) return 1;
			// Then by last activity
			if (a.lastActivity && b.lastActivity) {
				return b.lastActivity.localeCompare(a.lastActivity);
			}
			if (a.lastActivity) return -1;
			if (b.lastActivity) return 1;
			return b.signalCount - a.signalCount;
		});
		result.set(taskId, sessions);
	}

	return result;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const taskIds: string[] = body.taskIds || [];

		if (!Array.isArray(taskIds) || taskIds.length === 0) {
			return json({ sessions: {} });
		}

		// Limit to prevent abuse
		const limitedTaskIds = taskIds.slice(0, 100);
		const taskIdSet = new Set(limitedTaskIds);

		const projectPath = getProjectPath();
		const sessionsMap = buildTaskSessionsMap(taskIdSet, projectPath);

		// Convert Map to object for JSON response
		const sessions: { [taskId: string]: TaskSession[] } = {};
		for (const [taskId, taskSessions] of sessionsMap) {
			if (taskSessions.length > 0) {
				sessions[taskId] = taskSessions;
			}
		}

		return json({ sessions });
	} catch (error) {
		console.error('Error fetching task sessions:', error);
		return json({ error: 'Failed to fetch sessions' }, { status: 500 });
	}
};
