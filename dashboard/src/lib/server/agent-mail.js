/**
 * Server-side Agent Mail integration
 * Wraps lib/agent-mail.js for use in SvelteKit server routes
 */

import agentMail from '../../../../lib/agent-mail.js';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { listSessions } from './sessions.js';

/**
 * @typedef {import('../../../../lib/agent-mail.js').Message} Message
 * @typedef {import('../../../../lib/agent-mail.js').Agent} Agent
 * @typedef {import('../../../../lib/agent-mail.js').Thread} Thread
 * @typedef {import('../../../../lib/agent-mail.js').Reservation} Reservation
 */

/**
 * @typedef {Object} Activity
 * @property {string} ts
 * @property {string} preview
 * @property {string} content
 * @property {string} type
 * @property {string} [status]
 */

/**
 * Get all messages in a thread
 * @param {string} threadId - Thread identifier
 * @returns {Message[]} - Array of message objects
 */
export function getThreadMessages(threadId) {
	return agentMail.getThreadMessages(threadId);
}

/**
 * Get inbox messages for an agent (optionally filtered by thread)
 * @param {string} agentName - Agent name
 * @param {string | undefined} [threadId] - Thread identifier (undefined for all messages)
 * @param {Object} [options] - Query options
 * @returns {Message[]} - Array of message objects
 */
export function getInboxForThread(agentName, threadId = undefined, options = {}) {
	return agentMail.getInboxForThread(agentName, threadId, options);
}

/**
 * Get recent activities for an agent (last 10 messages)
 * @deprecated Use getBeadsActivities() instead - shows agent's task history, not shared inbox
 * @param {string} agentName - Agent name
 * @returns {Activity[]} - Array of activity objects {ts, preview, content, type}
 */
export function getAgentActivities(agentName) {
	const messages = agentMail.getInboxForThread(agentName, undefined, {});

	// Convert messages to activities format
	// Sort by timestamp (most recent first) and limit to 10
	return messages
		.sort((/** @type {Message} */ a, /** @type {Message} */ b) => new Date(b.created_ts).getTime() - new Date(a.created_ts).getTime())
		.slice(0, 10)
		.map((/** @type {Message} */ msg) => ({
			ts: msg.created_ts,
			preview: msg.subject || 'No subject',
			content: msg.body_md || '',
			type: msg.importance === 'urgent' ? 'urgent' :
			      msg.ack_required ? 'action_required' : 'message'
		}));
}

/**
 * @typedef {import('../../../../lib/beads.js').Task} Task
 */

/**
 * Get recent Beads task activities for an agent (last 10 task updates)
 * Shows tasks the agent worked on, with their status transitions
 * @param {string} agentName - Agent name
 * @param {Task[]} allTasks - All tasks from Beads (from getTasks())
 * @returns {Activity[]} - Array of activity objects {ts, preview, content, type}
 */
export function getBeadsActivities(agentName, allTasks) {
	if (!allTasks || allTasks.length === 0) {
		return [];
	}

	// Filter tasks that were assigned to this agent (current or past)
	const agentTasks = allTasks.filter((/** @type {Task} */ task) => task.assignee === agentName);

	// Convert tasks to activity format
	// Sort by updated_at (most recent first) and limit to 10
	const activities = agentTasks
		.sort((/** @type {Task} */ a, /** @type {Task} */ b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
		.slice(0, 10)
		.map((/** @type {Task} */ task) => {
			// Generate simple preview text (no status prefix)
			const preview = `[${task.id}] ${task.title}`;

			// Determine activity type based on task status
			let type = 'message';
			if (task.status === 'blocked') {
				type = 'urgent';
			} else if (task.status === 'in_progress') {
				type = 'action_required';
			}

			return {
				ts: task.updated_at,
				preview: preview,
				content: task.description || task.title,
				type: type,
				status: task.status  // Include task status for icon rendering
			};
		});

	return activities;
}

/**
 * Get all registered agents
 * @param {string | undefined} [projectPath] - Optional project path to filter by
 * @returns {Agent[]} - Array of agent objects
 */
export function getAgents(projectPath = undefined) {
	return agentMail.getAgents(projectPath);
}

/**
 * Get all message threads
 * @returns {Thread[]} - Array of thread objects
 */
export function getThreads() {
	return agentMail.getThreads();
}

/**
 * Search messages by query string
 * @param {string} query - Search query
 * @returns {Message[]} - Array of matching message objects
 */
export function searchMessages(query) {
	return agentMail.searchMessages(query);
}

/**
 * Get file reservations
 * @param {string | undefined} [agentName] - Optional agent name to filter by
 * @param {string | undefined} [projectPath] - Optional project path to filter by
 * @returns {Reservation[]} - Array of reservation objects
 */
export function getReservations(agentName = undefined, projectPath = undefined) {
	return agentMail.getReservations(agentName, projectPath);
}

/**
 * Get active agents from running tmux sessions
 * Uses actual jat-* tmux sessions instead of stale session files
 * @param {string} projectPath - Project root path (unused, kept for API compat)
 * @returns {{ activeAgents: string[], activeCount: number }} - Active agent info
 */
export function getActiveAgents(projectPath) {
	try {
		// Get actual running jat-* tmux sessions
		const sessions = listSessions();
		const activeAgents = sessions.map(s => s.agentName);

		return {
			activeAgents,
			activeCount: activeAgents.length
		};
	} catch {
		return { activeAgents: [], activeCount: 0 };
	}
}

/**
 * Get agent counts: active (reactive) and total (historical)
 * @param {string} projectPath - Project root path
 * @returns {{ activeCount: number, totalCount: number, activeAgents: string[] }}
 */
export function getAgentCounts(projectPath) {
	// Get total count from Agent Mail DB (all ever registered)
	const allAgents = agentMail.getAgents(undefined); // undefined = no project filter
	const totalCount = allAgents.length;

	// Get active count from session files
	const { activeAgents, activeCount } = getActiveAgents(projectPath);

	return {
		activeCount,
		totalCount,
		activeAgents
	};
}
