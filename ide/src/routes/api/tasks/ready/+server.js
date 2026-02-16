/**
 * Ready Tasks API - Get count and list of ready tasks
 * GET /api/tasks/ready
 *
 * Returns tasks that are ready to be worked on (no unmet dependencies)
 * across ALL projects (not just the current one).
 */

import { json } from '@sveltejs/kit';
import { getReadyTasks } from '$lib/server/jat-tasks.js';
import { apiCache, cacheKey, CACHE_TTL } from '$lib/server/cache.js';

/** @type {import('./$types').RequestHandler} */
export async function GET() {
	try {
		const key = cacheKey('tasks-ready');
		const cached = apiCache.get(key);
		if (cached) {
			return json(cached);
		}

		// Get ready tasks from all projects using the jat-tasks.js library
		const tasks = getReadyTasks();

		const responseData = {
			count: tasks.length,
			tasks: tasks.map((t) => ({
				id: t.id,
				title: t.title,
				priority: t.priority,
				type: t.issue_type,
				project: t.project
			})),
			timestamp: new Date().toISOString()
		};

		apiCache.set(key, responseData, CACHE_TTL.SHORT);
		return json(responseData);
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
