/**
 * Recovery API - Detect and recover crashed agent sessions
 *
 * GET /api/recovery
 *   Detects sessions that can be recovered after a crash/reboot:
 *   - Tasks in_progress with an assignee
 *   - Agent session file exists (.claude/sessions/agent-{sessionId}.txt)
 *   - No active tmux session jat-{agentName}
 *
 * POST /api/recovery
 *   Batch recover all recoverable sessions
 *   Body: { sessions?: string[] } - Optional list of specific agent names to recover
 *
 * POST /api/recovery/[agentName]
 *   Recover a single session by agent name
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { RequestHandler } from './$types';

const execAsync = promisify(exec);

/**
 * Convert a project path to Claude's project slug format
 * @param projectPath - e.g., "/home/jw/code/jat"
 * @returns e.g., "-home-jw-code-jat"
 */
function getProjectSlug(projectPath: string): string {
	return projectPath.replace(/\//g, '-');
}

/**
 * Search Claude JSONL session files for an agent's most recent session
 * This is a fallback when no .claude/sessions/agent-*.txt file exists
 */
function findSessionIdFromJsonl(agentName: string, projectPath: string): { sessionId: string; lastActivity: string } | null {
	const homeDir = process.env.HOME || '';
	const projectSlug = getProjectSlug(projectPath);
	const claudeProjectDir = join(homeDir, '.claude', 'projects', projectSlug);

	if (!existsSync(claudeProjectDir)) {
		return null;
	}

	try {
		const files = readdirSync(claudeProjectDir)
			.filter(f => f.endsWith('.jsonl'))
			.map(f => ({
				name: f,
				path: join(claudeProjectDir, f),
				sessionId: f.replace('.jsonl', ''),
				mtime: statSync(join(claudeProjectDir, f)).mtime
			}))
			.sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // Newest first

		// Search for agent name in multiple patterns:
		// 1. "agentName":"AgentName" in tool output - from jat-signal
		// 2. <command-args>AgentName in early messages - from /jat:start command
		const signalPattern = new RegExp(`"agentName"\\s*:\\s*"${agentName}"`, 'i');
		const commandPattern = new RegExp(`<command-args>${agentName}\\s`, 'i');

		for (const file of files) {
			try {
				const content = readFileSync(file.path, 'utf-8');

				// Check signal pattern anywhere in file (reliable - from tool output)
				if (signalPattern.test(content)) {
					return { sessionId: file.sessionId, lastActivity: file.mtime.toISOString() };
				}

				// Check command pattern only in first 5 lines (session start)
				const lines = content.split('\n').slice(0, 5).join('\n');
				if (commandPattern.test(lines)) {
					return { sessionId: file.sessionId, lastActivity: file.mtime.toISOString() };
				}
			} catch {
				// Skip unreadable files
			}
		}
	} catch (e) {
		console.error(`Failed to scan Claude projects dir ${claudeProjectDir}:`, e);
	}

	return null;
}

interface RecoverableSession {
	agentName: string;
	sessionId: string | null;  // null = orphaned (no session file found)
	resumable: boolean;         // true = can resume with claude -r, false = needs restart
	taskId: string;
	taskTitle: string;
	taskPriority: number;
	project: string;
	projectPath: string;
	lastActivity: string;
}

interface Task {
	id: string;
	title: string;
	status: string;
	priority: number;
	assignee?: string;
}

/**
 * Get list of active tmux sessions
 */
async function getActiveTmuxSessions(): Promise<Set<string>> {
	try {
		const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}" 2>/dev/null');
		const sessions = new Set(
			stdout
				.trim()
				.split('\n')
				.filter((s) => s.startsWith('jat-'))
				.map((s) => s.replace('jat-', ''))
		);
		return sessions;
	} catch {
		// No tmux server running = no active sessions
		return new Set();
	}
}

/**
 * Get tasks that are in_progress with an assignee
 */
async function getInProgressTasks(projectPath: string): Promise<Task[]> {
	try {
		const { stdout } = await execAsync(`cd "${projectPath}" && jt list --status in_progress --json`);
		const tasks: Task[] = JSON.parse(stdout);
		return tasks.filter((t) => t.assignee);
	} catch {
		return [];
	}
}

/**
 * Build a map of agent name -> session ID from .claude/sessions/agent-*.txt files
 */
function buildAgentSessionMap(projectPath: string): Map<string, { sessionId: string; lastActivity: string }> {
	const sessionsDir = join(projectPath, '.claude', 'sessions');
	const map = new Map<string, { sessionId: string; lastActivity: string }>();

	if (!existsSync(sessionsDir)) {
		return map;
	}

	try {
		const files = readdirSync(sessionsDir);
		for (const file of files) {
			// Match agent-{sessionId}.txt but not agent-*-activity.jsonl
			const match = file.match(/^agent-([a-f0-9-]+)\.txt$/);
			if (!match) continue;

			const sessionId = match[1];
			const filePath = join(sessionsDir, file);

			try {
				const agentName = readFileSync(filePath, 'utf-8').trim();
				const stats = statSync(filePath);
				const lastActivity = stats.mtime.toISOString();

				// Keep the most recent session for each agent
				const existing = map.get(agentName);
				if (!existing || new Date(lastActivity) > new Date(existing.lastActivity)) {
					map.set(agentName, { sessionId, lastActivity });
				}
			} catch {
				// Skip unreadable files
			}
		}
	} catch {
		// Directory read error
	}

	return map;
}

/**
 * Extract project name from task ID
 * Handles both regular tasks (project-hash) and epic children (project-hash.N)
 */
function getProjectFromTaskId(taskId: string): string {
	// Match project prefix before the first hyphen followed by the hash
	// Examples: jat-abc -> jat, steelbridge-b2y.15 -> steelbridge
	const match = taskId.match(/^([a-zA-Z0-9_-]+)-[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)*$/);
	return match ? match[1] : 'unknown';
}

/**
 * Get configured projects from ~/.config/jat/projects.json
 */
function getConfiguredProjects(): string[] {
	const homeDir = process.env.HOME || '';
	const configPath = join(homeDir, '.config', 'jat', 'projects.json');
	const projects: string[] = [];

	if (!existsSync(configPath)) {
		return projects;
	}

	try {
		const config = JSON.parse(readFileSync(configPath, 'utf-8'));
		if (config.projects) {
			for (const [name, projectConfig] of Object.entries(config.projects)) {
				const projConfig = projectConfig as { path?: string; hidden?: boolean };
				// Skip hidden projects
				if (projConfig.hidden) continue;

				// Get path from config, or default to ~/code/{name}
				let projectPath = projConfig.path || join(homeDir, 'code', name);
				// Expand ~ to home directory
				if (projectPath.startsWith('~')) {
					projectPath = join(homeDir, projectPath.slice(2));
				}

				// Only include if it has a .jat directory
				if (existsSync(join(projectPath, '.jat'))) {
					projects.push(projectPath);
				}
			}
		}
	} catch {
		// Ignore errors
	}

	return projects;
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		// Check if we should scan all projects or just one
		const singleProject = url.searchParams.get('project');
		const projectPaths = singleProject
			? [singleProject]
			: getConfiguredProjects();

		// Get active tmux sessions
		const activeSessions = await getActiveTmuxSessions();

		// Find recoverable sessions across ALL projects
		const recoverable: RecoverableSession[] = [];
		let totalInProgressTasks = 0;

		for (const projectPath of projectPaths) {
			// Get in_progress tasks with assignees for this project
			const inProgressTasks = await getInProgressTasks(projectPath);
			totalInProgressTasks += inProgressTasks.length;

			// Build agent -> session mapping for this project
			const agentSessionMap = buildAgentSessionMap(projectPath);

			// Find recoverable sessions:
			// - Task is in_progress with an assignee
			// - Agent session file exists (we have the session ID) OR can find via JSONL
			// - No active tmux session for this agent
			for (const task of inProgressTasks) {
				const agentName = task.assignee;
				if (!agentName) continue;

				// Check if tmux session is NOT active
				if (activeSessions.has(agentName)) continue;

				// Check if we have a session ID for this agent (from agent-*.txt files)
				let sessionInfo = agentSessionMap.get(agentName);

				// Fallback: search JSONL files if no agent-*.txt mapping exists
				if (!sessionInfo) {
					sessionInfo = findSessionIdFromJsonl(agentName, projectPath) || undefined;
				}

				// Include task even without session ID - it's still "paused" (orphaned)
				recoverable.push({
					agentName,
					sessionId: sessionInfo?.sessionId || null,
					resumable: !!sessionInfo,
					taskId: task.id,
					taskTitle: task.title,
					taskPriority: task.priority,
					project: getProjectFromTaskId(task.id),
					projectPath,
					lastActivity: sessionInfo?.lastActivity || new Date().toISOString()
				});
			}
		}

		// Sort by priority (lower = higher priority), then by last activity (most recent first)
		recoverable.sort((a, b) => {
			if (a.taskPriority !== b.taskPriority) {
				return a.taskPriority - b.taskPriority;
			}
			return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
		});

		return json({
			count: recoverable.length,
			sessions: recoverable,
			activeTmuxCount: activeSessions.size,
			inProgressTaskCount: totalInProgressTasks,
			projectsScanned: projectPaths.length,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error in GET /api/recovery:', error);
		return json(
			{
				error: 'Failed to detect recoverable sessions',
				message: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
};

export const POST: RequestHandler = async ({ request, url, fetch }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const specificSessions: string[] | undefined = body.sessions;

		// Scan all projects (same as GET)
		const singleProject = url.searchParams.get('project');
		const projectPaths = singleProject
			? [singleProject]
			: getConfiguredProjects();

		// Get recoverable sessions across all projects
		const activeSessions = await getActiveTmuxSessions();
		const recoverable: RecoverableSession[] = [];

		for (const projectPath of projectPaths) {
			const inProgressTasks = await getInProgressTasks(projectPath);
			const agentSessionMap = buildAgentSessionMap(projectPath);

			for (const task of inProgressTasks) {
				const agentName = task.assignee;
				if (!agentName) continue;
				if (activeSessions.has(agentName)) continue;

				// Check if we have a session ID for this agent (from agent-*.txt files)
				let sessionInfo = agentSessionMap.get(agentName);

				// Fallback: search JSONL files if no agent-*.txt mapping exists
				if (!sessionInfo) {
					sessionInfo = findSessionIdFromJsonl(agentName, projectPath) || undefined;
				}

				// If specific sessions requested, filter
				if (specificSessions && !specificSessions.includes(agentName)) continue;

				// Include task even without session ID - it's still "paused" (orphaned)
				recoverable.push({
					agentName,
					sessionId: sessionInfo?.sessionId || null,
					resumable: !!sessionInfo,
					taskId: task.id,
					taskTitle: task.title,
					taskPriority: task.priority,
					project: getProjectFromTaskId(task.id),
					projectPath,
					lastActivity: sessionInfo?.lastActivity || new Date().toISOString()
				});
			}
		}

		// Sort by priority
		recoverable.sort((a, b) => a.taskPriority - b.taskPriority);

		// Recover each session with staggered delays
		const results: Array<{
			agentName: string;
			taskId: string;
			success: boolean;
			error?: string;
		}> = [];
		const staggerMs = 3000; // 3 seconds between recoveries

		// Only attempt to resume sessions that have a session ID
		const resumableSessions = recoverable.filter(s => s.resumable);

		for (let i = 0; i < resumableSessions.length; i++) {
			const session = resumableSessions[i];

			try {
				// Call the existing resume API with project path for reliable lookup
				// Use relative URL with event.fetch for proper internal request handling
				const resumeUrl = `/api/sessions/${session.agentName}/resume`;
				console.log(`[Recovery] Calling resume API: ${resumeUrl} for ${session.agentName}`);
				console.log(`[Recovery] Session ID: ${session.sessionId}, Project: ${session.projectPath}`);

				const response = await fetch(resumeUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						session_id: session.sessionId,
						project: session.projectPath
					})
				});

				const responseData = await response.json();

				if (response.ok) {
					console.log(`[Recovery] Resume successful for ${session.agentName}:`, responseData);
					results.push({
						agentName: session.agentName,
						taskId: session.taskId,
						success: true
					});
				} else {
					console.error(`[Recovery] Resume failed for ${session.agentName}:`, responseData);
					results.push({
						agentName: session.agentName,
						taskId: session.taskId,
						success: false,
						error: responseData.message || responseData.error || 'Resume failed'
					});
				}
			} catch (err) {
				console.error(`[Recovery] Exception resuming ${session.agentName}:`, err);
				results.push({
					agentName: session.agentName,
					taskId: session.taskId,
					success: false,
					error: err instanceof Error ? err.message : 'Unknown error'
				});
			}

			// Stagger between recoveries (except for last one)
			if (i < resumableSessions.length - 1) {
				await new Promise((resolve) => setTimeout(resolve, staggerMs));
			}
		}

		const successCount = results.filter((r) => r.success).length;
		const failCount = results.filter((r) => !r.success).length;

		return json({
			success: failCount === 0,
			recovered: successCount,
			failed: failCount,
			results,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error in POST /api/recovery:', error);
		return json(
			{
				error: 'Failed to recover sessions',
				message: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
};
