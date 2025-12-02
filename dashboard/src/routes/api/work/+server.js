/**
 * Work API - List Active Work Sessions
 * GET /api/work - Return all active work sessions with task info, output, and token usage
 *
 * Each WorkSession includes:
 * - sessionName: tmux session name (e.g., "jat-WisePrairie")
 * - agentName: Agent name extracted from session (e.g., "WisePrairie")
 * - task: Current in_progress task for this agent (or null)
 * - lastCompletedTask: Most recently closed task by this agent (for completion state display)
 * - output: Recent terminal output with ANSI codes
 * - lineCount: Number of output lines
 * - tokens: Token usage for today
 * - cost: Cost in USD for today
 * - sparklineData: Array of hourly token usage (last 24h) for sparkline rendering
 *   Format: [{ timestamp: ISO string, tokens: number, cost: number }, ...]
 *
 * Query params:
 * - lines: Number of output lines to capture (default: 50, max: 500)
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getTasks } from '$lib/server/beads.js';
import { getAgentUsage, getAgentHourlyUsage } from '$lib/utils/tokenUsage.js';

const execAsync = promisify(exec);

/**
 * @typedef {Object} SparklineDataPoint
 * @property {string} timestamp - ISO timestamp for the hour
 * @property {number} tokens - Token count for this hour
 * @property {number} cost - Cost in USD for this hour
 */

/**
 * @typedef {Object} WorkSession
 * @property {string} sessionName - tmux session name (e.g., "jat-WisePrairie")
 * @property {string} agentName - Agent name (e.g., "WisePrairie")
 * @property {Object|null} task - Current in_progress task
 * @property {Object|null} lastCompletedTask - Most recently closed task by this agent
 * @property {string} output - Terminal output with ANSI codes
 * @property {number} lineCount - Number of output lines
 * @property {number} tokens - Token usage for today
 * @property {number} cost - Cost in USD for today
 * @property {SparklineDataPoint[]} sparklineData - Hourly token usage (last 24h)
 * @property {string} created - Session creation timestamp
 * @property {boolean} attached - Whether session is attached
 */

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
	try {
		const linesParam = url.searchParams.get('lines');
		const lines = Math.min(Math.max(parseInt(linesParam || '50', 10) || 50, 1), 500);
		// Only fetch token usage/sparkline if requested (slow operation)
		const includeUsage = url.searchParams.get('usage') === 'true';

		// Step 1: List jat-* tmux sessions
		const sessionsCommand = `tmux list-sessions -F "#{session_name}:#{session_created}:#{session_attached}" 2>/dev/null || echo ""`;

		let sessionsOutput = '';
		try {
			const { stdout } = await execAsync(sessionsCommand);
			sessionsOutput = stdout.trim();
		} catch (err) {
			// No tmux server or no sessions - return empty
			return json({
				success: true,
				sessions: [],
				count: 0,
				timestamp: new Date().toISOString()
			});
		}

		if (!sessionsOutput) {
			return json({
				success: true,
				sessions: [],
				count: 0,
				timestamp: new Date().toISOString()
			});
		}

		// Parse sessions and filter for jat-* prefix (excluding jat-pending-* which are still being set up)
		const rawSessions = sessionsOutput
			.split('\n')
			.filter(line => line.length > 0)
			.map(line => {
				const [name, created, attached] = line.split(':');
				return {
					name,
					created: new Date(parseInt(created, 10) * 1000).toISOString(),
					attached: attached === '1'
				};
			})
			.filter(session => session.name.startsWith('jat-'))
			// Filter out pending sessions (still being set up, not yet renamed to jat-{AgentName})
			.filter(session => !session.name.startsWith('jat-pending-'));

		if (rawSessions.length === 0) {
			return json({
				success: true,
				sessions: [],
				count: 0,
				timestamp: new Date().toISOString()
			});
		}

		// Step 2: Get all tasks from Beads (for lookup)
		/** @type {Array<{id: string, title: string, description?: string, status: string, priority: number, assignee: string, issue_type?: string, updated_at?: string}>} */
		let allTasks = [];
		try {
			allTasks = getTasks({});
		} catch (err) {
			console.error('Failed to fetch tasks from Beads:', err);
			// Continue without tasks
		}

		// Create a map of agent -> in_progress task
		/** @type {Map<string, Object>} */
		const agentTaskMap = new Map();
		allTasks
			.filter(t => t.status === 'in_progress' && t.assignee)
			.forEach(t => {
				agentTaskMap.set(t.assignee, {
					id: t.id,
					title: t.title,
					description: t.description,
					status: t.status,
					priority: t.priority,
					issue_type: t.issue_type
				});
			});

		// Create a map of agent -> most recently closed task
		// This helps show completion context when agent finishes work
		/** @type {Map<string, Object>} */
		const agentLastCompletedMap = new Map();
		allTasks
			.filter(t => t.status === 'closed' && t.assignee)
			// Sort by updated_at descending to get most recent first
			.sort((a, b) => {
				const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
				const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
				return dateB - dateA;
			})
			.forEach(t => {
				// Only keep the first (most recent) closed task per agent
				if (!agentLastCompletedMap.has(t.assignee)) {
					agentLastCompletedMap.set(t.assignee, {
						id: t.id,
						title: t.title,
						description: t.description,
						status: t.status,
						priority: t.priority,
						issue_type: t.issue_type,
						closedAt: t.updated_at
					});
				}
			});

		// Step 3: Get project path for token usage
		const projectPath = process.cwd().replace('/dashboard', '');

		// Step 4: Build WorkSession for each tmux session
		/** @type {WorkSession[]} */
		const workSessions = await Promise.all(
			rawSessions.map(async (session) => {
				// Extract agent name from session name (jat-AgentName -> AgentName)
				// The tmux session name is the authoritative source since /jat:start
				// renames the tmux session when registering the agent
				const agentName = session.name.replace(/^jat-/, '');

				// Get task for this agent
				const task = agentTaskMap.get(agentName) || null;

				// Get last completed task for this agent (for completion state display)
				const lastCompletedTask = agentLastCompletedMap.get(agentName) || null;

				// Capture output
				let output = '';
				let lineCount = 0;
				try {
					const captureCommand = `tmux capture-pane -p -e -t "${session.name}" -S -${lines}`;
					const { stdout } = await execAsync(captureCommand, { maxBuffer: 1024 * 1024 * 5 });
					output = stdout;
					lineCount = stdout.split('\n').length;
				} catch (err) {
					// Session might have closed, continue with empty output
					output = '';
					lineCount = 0;
				}

				// Get token usage for today (only if requested - slow operation)
				let tokens = 0;
				let cost = 0;
				/** @type {SparklineDataPoint[]} */
				let sparklineData = [];

				if (includeUsage) {
					try {
						const usage = await getAgentUsage(agentName, 'today', projectPath);
						tokens = usage.total_tokens || 0;
						cost = usage.cost || 0;
					} catch (err) {
						// No usage data available
					}

					// Get hourly sparkline data (last 24h)
					try {
						sparklineData = await getAgentHourlyUsage(agentName, projectPath);
					} catch (err) {
						// No sparkline data available
					}
				}

				return {
					sessionName: session.name,
					agentName,
					task,
					lastCompletedTask,
					output,
					lineCount,
					tokens,
					cost,
					sparklineData,
					created: session.created,
					attached: session.attached
				};
			})
		);

		return json({
			success: true,
			sessions: workSessions,
			count: workSessions.length,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error in GET /api/work:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
