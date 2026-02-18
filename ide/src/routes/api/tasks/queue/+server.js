/**
 * Auto-Assignment Queue API Endpoint
 *
 * GET /api/tasks/queue → Returns ready tasks for auto-assignment queue
 *
 * Query Parameters:
 * - limit: Maximum number of tasks to return (default: 5)
 * - sort: Sort policy (hybrid, priority, oldest) (default: hybrid)
 * - project: Filter by project name
 *
 * Response includes:
 * - queue: Array of ready tasks (no blockers, open or in-progress)
 * - stats: Queue statistics (count by priority, total)
 * - timestamp: Response timestamp
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * @typedef {{ id: string, title: string, description?: string, status: string, priority: number, issue_type?: string, assignee?: string }} Task
 */

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
	try {
		const limit = parseInt(url.searchParams.get('limit') || '5', 10);
		const sortParam = url.searchParams.get('sort') || 'hybrid';
		const project = url.searchParams.get('project');

		// Validate sort parameter - only allow valid values
		const validSorts = ['hybrid', 'priority', 'oldest'];
		const sort = validSorts.includes(sortParam) ? sortParam : 'hybrid';

		// Build st ready command
		let command = `st ready --json --limit ${limit} --sort ${sort}`;

		// Execute st ready to get queue
		const { stdout } = await execAsync(command);
		/** @type {Task[]} */
		const tasks = JSON.parse(stdout);

		// Filter by project if specified
		/** @type {Task[]} */
		let filteredTasks = tasks;
		if (project && project !== 'All Projects') {
			filteredTasks = tasks.filter((t) => t.id.startsWith(`${project}-`));
		}

		// Calculate queue stats
		const stats = {
			total: filteredTasks.length,
			by_priority: {
				p0: filteredTasks.filter((t) => t.priority === 0).length,
				p1: filteredTasks.filter((t) => t.priority === 1).length,
				p2: filteredTasks.filter((t) => t.priority === 2).length,
				p3: filteredTasks.filter((t) => t.priority === 3).length
			}
		};

		return json({
			queue: filteredTasks,
			stats,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error fetching queue:', error);
		return json(
			{
				error: 'Failed to fetch queue',
				message: error instanceof Error ? error.message : String(error),
				queue: [],
				stats: { total: 0, by_priority: { p0: 0, p1: 0, p2: 0, p3: 0 } },
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
}
