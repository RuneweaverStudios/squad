/**
 * Task History API Endpoint
 *
 * GET /api/tasks/{id}/history - Returns unified timeline of task events
 *
 * Combines:
 * - Beads task state changes (created, status updates, assignee changes, etc.)
 * - Agent Mail coordination messages (filtered by thread_id = task.id)
 *
 * Returns chronological timeline with visual distinction between event types.
 */

import { json } from '@sveltejs/kit';
import { getTaskById } from '$lib/server/beads.js';
import { getThreadMessages } from '$lib/server/agent-mail.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params }) {
	const { id } = params;

	if (!id) {
		return json({ error: 'Task ID is required' }, { status: 400 });
	}

	try {
		// Fetch task data from Beads
		const task = getTaskById(id);

		if (!task) {
			return json({ error: 'Task not found' }, { status: 404 });
		}

		// Fetch Agent Mail messages for this task thread
		/** @type {Array<{ created_ts?: string, subject?: string, from_agent?: string, to_agents?: string, body_md?: string, body_text?: string, importance?: string | number, ack_required?: boolean, id?: number }>} */
		let mailMessages = [];
		try {
			mailMessages = getThreadMessages(id);
		} catch (error) {
			console.error(`Failed to fetch Agent Mail messages for task ${id}:`, error);
			// Continue with empty messages array
		}

		// Build unified timeline
		const timeline = [];

		// 1. Add Beads events

		// Task created event
		/** @type {{ type?: string, closed_at?: string, created_at?: string, updated_at?: string, priority?: number, status?: string, assignee?: string, title?: string }} */
		const taskData = task;
		if (taskData.created_at) {
			timeline.push({
				type: 'beads_event',
				event: 'task_created',
				timestamp: taskData.created_at,
				description: 'Task created',
				metadata: {
					status: 'open',
					priority: taskData.priority,
					type: taskData.type
				}
			});
		}

		// Task updated event (if different from created)
		if (taskData.updated_at && taskData.updated_at !== taskData.created_at) {
			timeline.push({
				type: 'beads_event',
				event: 'task_updated',
				timestamp: taskData.updated_at,
				description: 'Task updated',
				metadata: {
					status: taskData.status,
					assignee: taskData.assignee
				}
			});
		}

		// Task closed event (if applicable)
		if (taskData.closed_at) {
			timeline.push({
				type: 'beads_event',
				event: 'task_closed',
				timestamp: taskData.closed_at,
				description: 'Task closed',
				metadata: {
					status: 'closed'
				}
			});
		}

		// 2. Add Agent Mail messages
		mailMessages.forEach(msg => {
			timeline.push({
				type: 'agent_mail',
				event: 'message',
				timestamp: msg.created_ts,
				description: msg.subject || 'No subject',
				metadata: {
					from_agent: msg.from_agent,
					to_agents: msg.to_agents,
					body: msg.body_md || msg.body_text || '',
					importance: msg.importance,
					ack_required: msg.ack_required,
					message_id: msg.id
				}
			});
		});

		// 3. Sort timeline by timestamp (newest first)
		timeline.sort((a, b) => {
			const timeA = new Date(a.timestamp).getTime();
			const timeB = new Date(b.timestamp).getTime();
			return timeB - timeA; // Descending order (newest first)
		});

		return json({
			task_id: id,
			task_title: taskData.title,
			timeline: timeline,
			count: {
				total: timeline.length,
				beads_events: timeline.filter(e => e.type === 'beads_event').length,
				agent_mail: timeline.filter(e => e.type === 'agent_mail').length
			},
			timestamp: new Date().toISOString()
		});

	} catch (error) {
		const err = /** @type {Error} */ (error);
		console.error('Error fetching task history:', err);
		console.error('Error stack:', err.stack);

		return json({
			error: 'Failed to fetch task history',
			message: err.message,
			stack: err.stack
		}, { status: 500 });
	}
}
