/**
 * Work API - List Active Work Sessions
 * GET /api/work - Return all active work sessions with task info, output, and token usage
 *
 * Each WorkSession includes:
 * - sessionName: tmux session name (e.g., "jat-WisePrairie")
 * - agentName: Agent name extracted from session (e.g., "WisePrairie")
 * - task: Current in_progress task for this agent (or null)
 * - output: Recent terminal output with ANSI codes
 * - lineCount: Number of output lines
 * - tokens: Token usage for today
 * - cost: Cost in USD for today
 *
 * Query params:
 * - lines: Number of output lines to capture (default: 50, max: 500)
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getTasks } from '$lib/server/beads.js';
import { getAgentUsage } from '$lib/utils/tokenUsage.js';

const execAsync = promisify(exec);

/**
 * @typedef {Object} WorkSession
 * @property {string} sessionName - tmux session name (e.g., "jat-WisePrairie")
 * @property {string} agentName - Agent name (e.g., "WisePrairie")
 * @property {Object|null} task - Current in_progress task
 * @property {string} output - Terminal output with ANSI codes
 * @property {number} lineCount - Number of output lines
 * @property {number} tokens - Token usage for today
 * @property {number} cost - Cost in USD for today
 * @property {string} created - Session creation timestamp
 * @property {boolean} attached - Whether session is attached
 */

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
	try {
		const linesParam = url.searchParams.get('lines');
		const lines = Math.min(Math.max(parseInt(linesParam || '50', 10) || 50, 1), 500);

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

		// Parse sessions and filter for jat-* prefix
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
			.filter(session => session.name.startsWith('jat-'));

		if (rawSessions.length === 0) {
			return json({
				success: true,
				sessions: [],
				count: 0,
				timestamp: new Date().toISOString()
			});
		}

		// Step 2: Get all tasks from Beads (for lookup)
		/** @type {Array<{id: string, title: string, status: string, priority: number, assignee: string, issue_type?: string}>} */
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
					status: t.status,
					priority: t.priority,
					issue_type: t.issue_type
				});
			});

		// Step 3: Get project path for token usage
		const projectPath = process.cwd().replace('/dashboard', '');

		// Step 4: Build WorkSession for each tmux session
		/** @type {WorkSession[]} */
		const workSessions = await Promise.all(
			rawSessions.map(async (session) => {
				// Extract agent name from session name (jat-AgentName -> AgentName)
				const agentName = session.name.replace(/^jat-/, '');

				// Get task for this agent
				const task = agentTaskMap.get(agentName) || null;

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

				// Get token usage for today
				let tokens = 0;
				let cost = 0;
				try {
					const usage = await getAgentUsage(agentName, 'today', projectPath);
					tokens = usage.total_tokens || 0;
					cost = usage.cost || 0;
				} catch (err) {
					// No usage data available
				}

				return {
					sessionName: session.name,
					agentName,
					task,
					output,
					lineCount,
					tokens,
					cost,
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
