/**
 * Ready Tasks API - Get count and list of ready tasks
 * GET /api/tasks/ready
 *
 * Returns tasks that are ready to be worked on (no unmet dependencies)
 * across ALL projects (not just the current one).
 */

import { json } from '@sveltejs/kit';
import { getReadyTasks } from '$lib/server/jat-tasks.js';

/** @type {import('./$types').RequestHandler} */
export async function GET() {
	try {
		// Get ready tasks from all projects using the jat-tasks.js library
		const tasks = getReadyTasks();

		return json({
			count: tasks.length,
			tasks: tasks.map((t) => ({
				id: t.id,
				title: t.title,
				priority: t.priority,
				type: t.issue_type,
				project: t.project
			})),
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Failed to get ready tasks:', error);
		return json({
			count: 0,
			tasks: [],
			error: error instanceof Error ? error.message : 'Failed to get ready tasks',
			timestamp: new Date().toISOString()
		});
	}
}
