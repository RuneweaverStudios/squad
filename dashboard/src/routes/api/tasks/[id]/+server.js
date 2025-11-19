/**
 * Task Detail API Route
 * Provides individual task details including dependencies and enables
 */
import { json } from '@sveltejs/kit';
import { getTaskById } from '$lib/../../../../lib/beads.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params }) {
	const taskId = params.id;

	const task = getTaskById(taskId);

	if (!task) {
		return json({ error: 'Task not found' }, { status: 404 });
	}

	return json(task);
}
