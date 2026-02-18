/**
 * Task Dependencies API Route
 * Returns dependency graph data for a task: what blocks it and what it unblocks
 */
import { json } from '@sveltejs/kit';
import { getTaskById } from '$lib/server/squad-tasks.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params }) {
	const taskId = params.id;

	const task = getTaskById(taskId);

	if (!task) {
		return json({ error: 'Task not found' }, { status: 404 });
	}

	// Build dependency graph response
	// depends_on = tasks that block this task (must be done first)
	// blocked_by = tasks waiting on this task (will be unblocked when this completes)
	const graph = {
		task: {
			id: task.id,
			title: task.title,
			status: task.status,
			priority: task.priority,
			issue_type: task.issue_type
		},
		// Tasks that must be completed before this task (blockers)
		blockedBy: (task.depends_on || []).map(dep => ({
			id: dep.id,
			title: dep.title,
			status: dep.status,
			priority: dep.priority,
			isBlocking: dep.status !== 'closed' // Still blocking if not closed
		})),
		// Tasks waiting on this task (will be unblocked)
		unblocks: (task.blocked_by || []).map(dep => ({
			id: dep.id,
			title: dep.title,
			status: dep.status,
			priority: dep.priority,
			isWaiting: dep.status !== 'closed' // Still waiting if not closed
		}))
	};

	return json(graph);
}
