import { json } from '@sveltejs/kit';
import { getAgents, getReservations } from '$lib/server/agent-mail.js';
import { getTasks } from '$lib/server/beads.js';

/**
 * Unified Agent Orchestration API
 * Returns combined data for agent coordination view
 */

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
	try {
		const projectFilter = url.searchParams.get('project') ?? undefined;
		const agentFilter = url.searchParams.get('agent') ?? undefined;

		// Fetch all data sources
		const agents = getAgents(projectFilter);
		const reservations = getReservations(agentFilter, projectFilter);
		const tasks = getTasks({ projectName: projectFilter });

		// Calculate agent statistics
		const agentStats = agents.map(agent => {
			// Count reservations per agent
			const agentReservations = reservations.filter(r => r.agent_name === agent.name);

			// Count tasks assigned to agent
			const agentTasks = tasks.filter(t => t.assignee === agent.name);
			const openTasks = agentTasks.filter(t => t.status === 'open').length;
			const inProgressTasks = agentTasks.filter(t => t.status === 'in_progress').length;

			return {
				...agent,
				reservation_count: agentReservations.length,
				task_count: agentTasks.length,
				open_tasks: openTasks,
				in_progress_tasks: inProgressTasks,
				active: agentReservations.length > 0 || inProgressTasks > 0
			};
		});

		// Calculate reservation statistics
		/** @type {Record<string, typeof reservations>} */
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
				p3: tasks.filter(t => t.priority === 3).length
			}
		};

		// Find tasks with dependencies
		const tasksWithDeps = tasks.filter(t =>
			(t.depends_on && t.depends_on.length > 0) ||
			(t.blocked_by && t.blocked_by.length > 0)
		);

		return json({
			agents: agentStats,
			reservations,
			reservations_by_agent: reservationsByAgent,
			tasks: tasks.slice(0, 50), // Limit to 50 most recent tasks
			task_stats: taskStats,
			tasks_with_deps: tasksWithDeps.length,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error fetching agent data:', error);
		return json({
			error: 'Failed to fetch agent data',
			message: error instanceof Error ? error.message : String(error),
			agents: [],
			reservations: [],
			tasks: [],
			task_stats: {},
			timestamp: new Date().toISOString()
		}, { status: 500 });
	}
}
