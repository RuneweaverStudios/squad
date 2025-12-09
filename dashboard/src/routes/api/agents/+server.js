/**
 * Unified Agents API Endpoint
 *
 * GET /api/agents              → Simple agent list (lightweight, for dropdowns/lists)
 * GET /api/agents?full=true    → Full orchestration data (agents + tasks + reservations + stats + activities)
 * GET /api/agents?orchestration=true → Alias for full orchestration data
 * GET /api/agents?usage=true   → Include token usage data for each agent
 * POST /api/agents             → Assign task to agent (body: { taskId, agentName })
 *
 * Date Range Filtering:
 * - from: ISO date string (e.g., 2024-01-01) - start of range (inclusive)
 * - to: ISO date string (e.g., 2024-01-07) - end of range (inclusive)
 * - range: Quick preset ('today', 'yesterday', 'week', 'month', 'all')
 *
 * When date range is provided:
 * - Agents are filtered by activity within date range
 * - Activity includes: task updates, messages, reservations
 * - Response includes: meta.dateRange with parsed from/to dates
 * - Each agent includes: activityInRange (count), lastActiveInRange (timestamp)
 *
 * Each agent in full mode includes an 'activities' array with recent Beads task history:
 * - ts: timestamp (ISO 8601)
 * - preview: task status update (e.g., "[jat-abc] Completed: Task title")
 * - content: task description
 * - type: 'urgent' | 'action_required' | 'message' (based on task status)
 */

import { json } from '@sveltejs/kit';
import { getAgents, getReservations, getBeadsActivities, getAgentCounts } from '$lib/server/agent-mail.js';
import { getTasks } from '$lib/server/beads.js';
import { getAllAgentUsageAsync, getHourlyUsageAsync } from '$lib/utils/tokenUsage.js';
import { apiCache, cacheKey, CACHE_TTL, invalidateCache } from '$lib/server/cache.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================================
// Task Cache - getTasks() is expensive (parses 800+ line JSONL on each call)
// Cache for 5 seconds to prevent constant re-parsing during frequent polling
// ============================================================================
/** @type {Task[]} */
let cachedTasks = [];
/** @type {string | null} */
let cachedTasksProject = null;
let taskCacheTimestamp = 0;
const TASK_CACHE_TTL_MS = 5000;

/**
 * Get tasks with caching (5s TTL)
 * @param {string|null} projectName - Optional project filter
 * @returns {Task[]} Cached or fresh tasks
 */
function getCachedTasks(projectName = null) {
	const now = Date.now();
	// Cache miss if: expired, empty, or different project filter
	if (now - taskCacheTimestamp > TASK_CACHE_TTL_MS || cachedTasks.length === 0 || cachedTasksProject !== projectName) {
		try {
			cachedTasks = getTasks({ projectName: projectName ?? undefined });
			cachedTasksProject = projectName;
			taskCacheTimestamp = now;
		} catch (err) {
			console.error('Failed to fetch tasks from Beads:', err);
			// Return stale cache on error
		}
	}
	return cachedTasks;
}

/**
 * Parse date range from query parameters
 * @param {URLSearchParams} searchParams - URL search params
 * @returns {{ from: Date | null, to: Date | null, hasRange: boolean }}
 */
function parseDateRange(searchParams) {
	const rangePreset = searchParams.get('range');
	let fromParam = searchParams.get('from');
	let toParam = searchParams.get('to');

	// Handle quick presets
	if (rangePreset && rangePreset !== 'all') {
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

		switch (rangePreset) {
			case 'today':
				fromParam = today.toISOString();
				toParam = now.toISOString();
				break;
			case 'yesterday': {
				const yesterday = new Date(today);
				yesterday.setDate(yesterday.getDate() - 1);
				fromParam = yesterday.toISOString();
				toParam = today.toISOString();
				break;
			}
			case 'week': {
				const weekAgo = new Date(today);
				weekAgo.setDate(weekAgo.getDate() - 7);
				fromParam = weekAgo.toISOString();
				toParam = now.toISOString();
				break;
			}
			case 'month': {
				const monthAgo = new Date(today);
				monthAgo.setMonth(monthAgo.getMonth() - 1);
				fromParam = monthAgo.toISOString();
				toParam = now.toISOString();
				break;
			}
		}
	}

	// Parse dates
	const from = fromParam ? new Date(fromParam) : null;
	const to = toParam ? new Date(toParam) : null;

	// Validate dates
	const hasRange = (from !== null && !isNaN(from.getTime())) ||
	                 (to !== null && !isNaN(to.getTime()));

	return {
		from: from && !isNaN(from.getTime()) ? from : null,
		to: to && !isNaN(to.getTime()) ? to : null,
		hasRange
	};
}

/**
 * Check if a timestamp is within a date range
 * @param {string | Date} timestamp - Timestamp to check
 * @param {Date | null} from - Range start (inclusive)
 * @param {Date | null} to - Range end (inclusive)
 * @returns {boolean}
 */
function isInDateRange(timestamp, from, to) {
	if (!timestamp) return false;

	const date = new Date(timestamp);
	if (isNaN(date.getTime())) return false;

	if (from && date < from) return false;
	if (to && date > to) return false;

	return true;
}

/**
 * @typedef {{ ts: string, preview: string, content: string, type: string, status?: string }} Activity
 * @typedef {{ id: number, name: string, program: string, model: string, task_description: string, inception_ts: string, last_active_ts: string, project_path: string }} Agent
 * @typedef {{ id: number, path_pattern: string, exclusive: boolean, reason: string, created_ts: string, expires_ts: string, released_ts: string, agent_name: string, project_path: string }} Reservation
 * @typedef {{ id: string, title: string, description: string, status: string, priority: number, issue_type: string, assignee: string, created_at: string, updated_at: string, project: string, project_path: string, labels: string[], depends_on: any[], blocked_by: any[], comments?: any[] }} Task
 */

/**
 * Filter activities by date range
 * @param {Activity[]} activities - Activities array
 * @param {Date | null} from - Range start
 * @param {Date | null} to - Range end
 * @returns {Activity[]} Filtered activities
 */
function filterActivitiesByDateRange(activities, from, to) {
	if (!from && !to) return activities;

	return activities.filter(activity => isInDateRange(activity.ts, from, to));
}

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
	// Check if full orchestration data requested
	const fullData = url.searchParams.get('full') === 'true' ||
	                 url.searchParams.get('orchestration') === 'true';

	if (!fullData) {
		// Simple agent list (backward compatible) - no caching needed (very fast)
		try {
			const projectFilter = url.searchParams.get('project') ?? undefined;
			const agents = getAgents(projectFilter);
			return json({ agents });
		} catch (error) {
			console.error('Error fetching agents:', error);
			return json({ error: 'Failed to fetch agents', agents: [] }, { status: 500 });
		}
	}

	// Full orchestration data - use caching
	const projectFilter = url.searchParams.get('project') ?? undefined;
	const agentFilter = url.searchParams.get('agent') ?? undefined;
	const includeUsage = url.searchParams.get('usage') === 'true';
	const includeHourly = url.searchParams.get('hourly') === 'true';
	const includeActivities = url.searchParams.get('activities') === 'true';
	const rangeParam = url.searchParams.get('range') ?? undefined;

	// Build cache key from relevant parameters
	const key = cacheKey('agents', {
		full: 'true',
		project: projectFilter,
		agent: agentFilter,
		usage: includeUsage ? 'true' : undefined,
		hourly: includeHourly ? 'true' : undefined,
		activities: includeActivities ? 'true' : undefined,
		range: rangeParam
	});

	// Determine TTL based on whether usage is included (expensive operation)
	const ttl = includeUsage ? CACHE_TTL.LONG : CACHE_TTL.SHORT;

	// Check cache
	const cached = apiCache.get(key);
	if (cached) {
		return json(cached);
	}

	try {
		// Parse date range parameters
		const dateRange = parseDateRange(url.searchParams);

		const projectPath = process.cwd().replace('/dashboard', '');

		// Fetch core data (agents, reservations, tasks) - always needed
		/** @type {Agent[]} */
		const agents = getAgents(undefined);  // Show all agents (don't filter by project)
		/** @type {Reservation[]} */
		const reservations = getReservations(agentFilter, undefined);  // Show all reservations
		/** @type {Task[]} */
		const tasks = getCachedTasks(projectFilter);  // Filter tasks only (cached to avoid expensive JSONL parsing)

		// Fetch tmux session status to determine which agents have active sessions
		// Also get session creation time for "connecting" state detection
		/** @type {Map<string, number>} */
		const agentSessionCreatedAt = new Map();
		try {
			const { stdout } = await execAsync(
				'tmux list-sessions -F "#{session_name}:#{session_created}" 2>/dev/null'
			);
			stdout.trim().split('\n').forEach(line => {
				const [sessionName, createdUnix] = line.split(':');
				// Extract agent name from session name (jat-AgentName -> AgentName)
				if (sessionName.startsWith('jat-')) {
					const agentName = sessionName.replace('jat-', '');
					// Store creation timestamp (unix seconds)
					agentSessionCreatedAt.set(agentName, parseInt(createdUnix, 10) * 1000);
				}
			});
		} catch {
			// No tmux server or no sessions - that's fine, map will be empty
		}
		// For backward compat: create Set for hasSession check
		const agentsWithSessions = new Set(agentSessionCreatedAt.keys());

		// Optionally fetch token usage data (using worker threads to avoid blocking)
		/** @type {Map<string, import('$lib/utils/tokenUsage.js').TokenUsage> | null} */
		let usageToday = null;
		/** @type {Map<string, import('$lib/utils/tokenUsage.js').TokenUsage> | null} */
		let usageWeek = null;
		if (includeUsage) {
			[usageToday, usageWeek] = await Promise.all([
				getAllAgentUsageAsync('today', projectPath),
				getAllAgentUsageAsync('week', projectPath)
			]);
		}

		// Optionally fetch hourly token usage data (raw data for sparklines, using worker threads)
		/** @type {import('$lib/utils/tokenUsage.js').HourlyUsage[] | null} */
		let hourlyUsage = null;
		if (includeHourly) {
			hourlyUsage = await getHourlyUsageAsync(projectPath);
		}

		// Calculate agent statistics
		const agentStats = agents.map(agent => {
			// Count reservations per agent
			const agentReservations = reservations.filter(r => r.agent_name === agent.name);

			// Count tasks assigned to agent
			const agentTasks = tasks.filter(t => t.assignee === agent.name);
			const openTasks = agentTasks.filter(t => t.status === 'open').length;
			const inProgressTasks = agentTasks.filter(t => t.status === 'in_progress').length;

			// Determine if agent is active based on reservations or active tasks
			const hasActiveReservations = agentReservations.some(r => {
				const expiresAt = new Date(r.expires_ts);
				return expiresAt > new Date() && !r.released_ts;
			});

			// Get recent activities from Beads task history (last 10 task updates)
			/** @type {Activity[]} */
			let activities = [];
			if (includeActivities) {
				try {
					activities = getBeadsActivities(agent.name, tasks);
				} catch (err) {
					console.error(`Failed to fetch activities for agent ${agent.name}:`, err);
					// Continue with empty activities array
				}
			}

			// Apply date range filtering to activities if requested
			/** @type {Activity[]} */
			let filteredActivities = activities;
			/** @type {number | null} */
			let activityInRange = null;
			/** @type {string | null} */
			let lastActiveInRange = null;

			if (dateRange.hasRange && activities.length > 0) {
				filteredActivities = filterActivitiesByDateRange(activities, dateRange.from, dateRange.to);
				activityInRange = filteredActivities.length;

				// Find the most recent activity in range
				if (filteredActivities.length > 0) {
					const sorted = [...filteredActivities].sort((a, b) =>
						new Date(b.ts).getTime() - new Date(a.ts).getTime()
					);
					lastActiveInRange = sorted[0]?.ts || null;
				}
			}

			// Also check task updates within range
			if (dateRange.hasRange) {
				const tasksInRange = agentTasks.filter(t =>
					isInDateRange(t.updated_at, dateRange.from, dateRange.to)
				);

				// Update activity count to include tasks if higher
				const taskActivityCount = tasksInRange.length;
				if (activityInRange === null) {
					activityInRange = taskActivityCount;
				} else {
					activityInRange = Math.max(activityInRange, taskActivityCount);
				}

				// Update last active if a task was updated more recently
				const lastTaskUpdate = tasksInRange
					.map(t => new Date(t.updated_at))
					.sort((a, b) => b.getTime() - a.getTime())[0];

				if (lastTaskUpdate) {
					if (!lastActiveInRange || new Date(lastTaskUpdate) > new Date(lastActiveInRange)) {
						lastActiveInRange = lastTaskUpdate.toISOString();
					}
				}
			}

			// Check reservations in date range
			if (dateRange.hasRange) {
				const reservationsInRange = agentReservations.filter(r =>
					isInDateRange(r.created_ts, dateRange.from, dateRange.to)
				);

				if (reservationsInRange.length > 0) {
					activityInRange = (activityInRange || 0) + reservationsInRange.length;

					const lastReservation = reservationsInRange
						.map(r => new Date(r.created_ts))
						.sort((a, b) => b.getTime() - a.getTime())[0];

					if (lastReservation) {
						if (!lastActiveInRange || lastReservation > new Date(lastActiveInRange)) {
							lastActiveInRange = lastReservation.toISOString();
						}
					}
				}
			}

			/** @type {any} */
			const baseStats = {
				...agent,
				reservation_count: agentReservations.length,
				task_count: agentTasks.length,
				open_tasks: openTasks,
				in_progress_tasks: inProgressTasks,
				active: hasActiveReservations || inProgressTasks > 0,
				hasSession: agentsWithSessions.has(agent.name),
				// Session creation timestamp for "connecting" state detection
				session_created_ts: agentSessionCreatedAt.get(agent.name) || null,
				activities: filteredActivities
			};

			// Add date range specific stats if applicable
			if (dateRange.hasRange) {
				baseStats.activityInRange = activityInRange || 0;
				baseStats.lastActiveInRange = lastActiveInRange;
			}

			// Optionally include token usage data
			if (includeUsage && usageToday && usageWeek) {
				const todayUsage = usageToday.get(agent.name);
				const weekUsage = usageWeek.get(agent.name);

				baseStats.usage = {
					today: todayUsage ? {
						total_tokens: todayUsage.total_tokens,
						cost: todayUsage.cost,
						sessionCount: todayUsage.sessionCount
					} : { total_tokens: 0, cost: 0, sessionCount: 0 },
					week: weekUsage ? {
						total_tokens: weekUsage.total_tokens,
						cost: weekUsage.cost,
						sessionCount: weekUsage.sessionCount
					} : { total_tokens: 0, cost: 0, sessionCount: 0 }
				};
			}

			return baseStats;
		});

		// Group reservations by agent for easy lookup
		/** @type {Record<string, Reservation[]>} */
		const reservationsByAgent = {};
		reservations.forEach(r => {
			if (!reservationsByAgent[r.agent_name]) {
				reservationsByAgent[r.agent_name] = [];
			}
			reservationsByAgent[r.agent_name].push(r);
		});

		// Calculate task statistics
		const taskStats = {
			total: tasks.length,
			open: tasks.filter(t => t.status === 'open').length,
			in_progress: tasks.filter(t => t.status === 'in_progress').length,
			blocked: tasks.filter(t => t.status === 'blocked').length,
			closed: tasks.filter(t => t.status === 'closed').length,
			by_priority: {
				p0: tasks.filter(t => t.priority === 0).length,
				p1: tasks.filter(t => t.priority === 1).length,
				p2: tasks.filter(t => t.priority === 2).length,
				p3: tasks.filter(t => t.priority === 3).length,
				p4: tasks.filter(t => t.priority === 4).length
			}
		};

		// Find tasks with dependencies for visualization
		const tasksWithDeps = tasks.filter(t =>
			(t.depends_on && t.depends_on.length > 0) ||
			(t.blocked_by && t.blocked_by.length > 0)
		);

		// Find unassigned tasks (ready for assignment)
		const unassignedTasks = tasks.filter(t =>
			!t.assignee && t.status === 'open'
		);

		// Build meta object with optional date range
		/** @type {{ poll_interval_ms: number, data_sources: string[], cache_ttl_ms: number, dateRange?: { from: string | null, to: string | null } }} */
		const meta = {
			poll_interval_ms: 3000, // Recommended poll interval for frontend
			data_sources: ['agent-mail', 'beads'],
			cache_ttl_ms: 2000 // Data freshness guarantee
		};

		// Include date range in meta if filtering was applied
		if (dateRange.hasRange) {
			meta.dateRange = {
				from: dateRange.from ? dateRange.from.toISOString() : null,
				to: dateRange.to ? dateRange.to.toISOString() : null
			};
		}

		// Optionally filter agents to only those with activity in range
		let filteredAgentStats = agentStats;
		if (dateRange.hasRange) {
			// Only include agents who had activity in the date range
			filteredAgentStats = agentStats.filter(agent =>
				agent.activityInRange > 0 || agent.active
			);
		}

		// Get agent counts (active sessions vs total registered)
		const agentCounts = getAgentCounts(projectPath);

		// Build response data
		const responseData = {
			agents: filteredAgentStats,
			reservations,
			reservations_by_agent: reservationsByAgent,
			tasks: tasks, // Return all tasks (frontend handles pagination/filtering)
			unassigned_tasks: unassignedTasks,
			task_stats: taskStats,
			tasks_with_deps_count: tasksWithDeps.length,
			tasks_with_deps: tasksWithDeps,
			hourlyUsage: hourlyUsage, // Raw hourly token usage (last 24 hours)
			agent_counts: agentCounts, // Active vs total agent counts
			timestamp: new Date().toISOString(),
			meta
		};

		// Cache the response
		apiCache.set(key, responseData, ttl);

		return json(responseData);
	} catch (error) {
		console.error('Error fetching agent data:', error);
		const errorMsg = error instanceof Error ? error.message : String(error);
		const errorStack = error instanceof Error ? error.stack : undefined;
		console.error('Error stack:', errorStack);

		return json({
			error: 'Failed to fetch agent data',
			message: errorMsg,
			stack: errorStack,
			agents: [],
			reservations: [],
			reservations_by_agent: {},
			tasks: [],
			unassigned_tasks: [],
			task_stats: {
				total: 0,
				open: 0,
				in_progress: 0,
				blocked: 0,
				closed: 0,
				by_priority: { p0: 0, p1: 0, p2: 0, p3: 0, p4: 0 }
			},
			tasks_with_deps_count: 0,
			tasks_with_deps: [],
			timestamp: new Date().toISOString()
		}, { status: 500 });
	}
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	try {
		const { taskId, agentName } = await request.json();

		// Validate input
		if (!taskId || !agentName) {
			return json({
				error: 'Missing required fields',
				message: 'Both taskId and agentName are required'
			}, { status: 400 });
		}

		// Validate task ID format (project-xxx)
		if (!/^[a-z]+-[a-z0-9]{3}$/.test(taskId)) {
			return json({
				error: 'Invalid task ID format',
				message: 'Task ID must be in format: project-xxx (e.g., jat-abc)'
			}, { status: 400 });
		}

		// Verify task exists before assigning
		try {
			const { stdout } = await execAsync(`bd show "${taskId}" --json`);
			const taskData = JSON.parse(stdout);
			if (!taskData || taskData.length === 0) {
				return json({
					error: 'Task not found',
					message: `Task ${taskId} does not exist`
				}, { status: 404 });
			}
		} catch (error) {
			return json({
				error: 'Task not found',
				message: `Task ${taskId} does not exist or could not be retrieved`
			}, { status: 404 });
		}

		// Assign task to agent using bd CLI
		try {
			await execAsync(
				`bd update "${taskId}" --assignee "${agentName}"`
			);

			// Invalidate caches since task assignment changed
			invalidateCache.agents();
			invalidateCache.tasks();

			// Get updated task data
			const { stdout: updatedTaskJson } = await execAsync(`bd show "${taskId}" --json`);
			const updatedTask = JSON.parse(updatedTaskJson);

			return json({
				success: true,
				message: `Task ${taskId} assigned to ${agentName}`,
				task: updatedTask[0]
			});
		} catch (err) {
			console.error('Failed to assign task:', err);
			return json({
				error: 'Failed to assign task',
				message: err instanceof Error ? err.message : 'Unknown error occurred'
			}, { status: 500 });
		}
	} catch (err) {
		console.error('Error in POST /api/agents:', err);
		return json({
			error: 'Invalid request',
			message: err instanceof Error ? err.message : 'Failed to parse request body'
		}, { status: 400 });
	}
}
