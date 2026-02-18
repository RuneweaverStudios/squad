/**
 * Task Sessions API
 * GET /api/tasks/[id]/sessions - Get all sessions that have worked on a task
 *
 * Returns list of agent sessions with their session IDs for resuming.
 * Data sourced from:
 * 1. Timeline files in /tmp/squad-timeline-*.jsonl (cleared on reboot)
 * 2. Signal files in /tmp/squad-signal-*.json (cleared on reboot)
 * 3. Persistent session files in .claude/sessions/agent-*.txt
 */

import { json } from '@sveltejs/kit';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import type { RequestHandler } from './$types';

interface TaskSession {
	agentName: string;
	sessionId: string | null;
	lastActivity: string | null;
	signalCount: number;
	isOnline: boolean;
}

/**
 * Get project path (parent of ide)
 */
function getProjectPath(): string {
	return process.cwd().replace(/\/ide$/, '');
}

/**
 * Check if an agent has an active tmux session
 */
function isAgentOnline(agentName: string): boolean {
	try {
		const { execSync } = require('child_process');
		const result = execSync(`tmux has-session -t "squad-${agentName}" 2>/dev/null && echo "yes" || echo "no"`, {
			encoding: 'utf-8'
		}).trim();
		return result === 'yes';
	} catch {
		return false;
	}
}

/**
 * Find session ID for an agent from signal files
 */
function findSessionIdForAgent(agentName: string, projectPath: string): string | null {
	// Try signal file first
	const signalFile = `/tmp/squad-signal-tmux-squad-${agentName}.json`;
	if (existsSync(signalFile)) {
		try {
			const data = JSON.parse(readFileSync(signalFile, 'utf-8'));
			if (data.session_id) {
				return data.session_id;
			}
		} catch {
			// Continue to fallback
		}
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
 * Scan timeline files to find all agents that worked on a task
 */
function findSessionsForTask(taskId: string, projectPath: string): TaskSession[] {
	const sessions: Map<string, TaskSession> = new Map();

	// Scan all timeline files
	const timelinePattern = /^squad-timeline-squad-(.+)\.jsonl$/;
	const tmpDir = '/tmp';

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

				let signalCount = 0;
				let lastActivity: string | null = null;

				for (const line of lines) {
					if (!line.includes(taskId)) continue;

					try {
						const event = JSON.parse(line);

						// Check if this event is related to our task
						if (event.data?.taskId === taskId ||
							(event.type === 'ide_input' && line.includes(taskId))) {
							signalCount++;

							// Track latest activity
							if (event.timestamp) {
								if (!lastActivity || event.timestamp > lastActivity) {
									lastActivity = event.timestamp;
								}
							}
						}
					} catch {
						// Skip malformed lines
					}
				}

				if (signalCount > 0) {
					const sessionId = findSessionIdForAgent(agentName, projectPath);
					const isOnline = isAgentOnline(agentName);

					sessions.set(agentName, {
						agentName,
						sessionId,
						lastActivity,
						signalCount,
						isOnline
					});
				}
			} catch {
				// Skip unreadable files
			}
		}
	} catch {
		// /tmp not readable
	}

	// Also check signal files directly for working/starting signals
	try {
		const signalFiles = readdirSync(tmpDir).filter(f => f.startsWith('squad-signal-tmux-'));

		for (const file of signalFiles) {
			const filePath = join(tmpDir, file);
			try {
				const content = readFileSync(filePath, 'utf-8');
				const data = JSON.parse(content);

				if (data.data?.taskId === taskId && data.data?.agentName) {
					const agentName = data.data.agentName;

					if (!sessions.has(agentName)) {
						sessions.set(agentName, {
							agentName,
							sessionId: data.session_id || null,
							lastActivity: data.timestamp || null,
							signalCount: 1,
							isOnline: isAgentOnline(agentName)
						});
					} else {
						// Update session ID if we have it
						const existing = sessions.get(agentName)!;
						if (!existing.sessionId && data.session_id) {
							existing.sessionId = data.session_id;
						}
					}
				}
			} catch {
				// Skip invalid files
			}
		}
	} catch {
		// /tmp not readable
	}

	// Sort by last activity (most recent first), then by signal count
	return Array.from(sessions.values()).sort((a, b) => {
		// Online agents first
		if (a.isOnline && !b.isOnline) return -1;
		if (!a.isOnline && b.isOnline) return 1;

		// Then by last activity
		if (a.lastActivity && b.lastActivity) {
			return b.lastActivity.localeCompare(a.lastActivity);
		}
		if (a.lastActivity) return -1;
		if (b.lastActivity) return 1;

		// Then by signal count
		return b.signalCount - a.signalCount;
	});
}

export const GET: RequestHandler = async ({ params }) => {
	const taskId = params.id;

	if (!taskId) {
		return json({ error: 'Task ID is required' }, { status: 400 });
	}

	const projectPath = getProjectPath();
	const sessions = findSessionsForTask(taskId, projectPath);

	return json({
		taskId,
		sessions,
		count: sessions.length
	});
};
