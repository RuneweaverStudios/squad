/**
 * Auto-Assign Tasks API
 * POST /api/agents/auto-assign - Assign ready tasks to idle agents
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { listSessionsAsync } from '$lib/server/sessions.js';
import { getAgents } from '$lib/server/agent-mail.js';

const execAsync = promisify(exec);

/**
 * POST /api/agents/auto-assign
 * Automatically assign ready tasks to idle agents
 * Body:
 * - maxAssignments: Maximum number of assignments to make (default: 10)
 * - dryRun: If true, only show what would be assigned (default: false)
 * - priorityThreshold: Only assign tasks with priority <= this value (default: 4)
 */
/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const {
			maxAssignments = 10,
			dryRun = false,
			priorityThreshold = 4
		} = body;

		// Get ready tasks from JAT
		let readyTasks = [];
		try {
			const { stdout } = await execAsync('jt ready --json');
			readyTasks = JSON.parse(stdout);
		} catch {
			// No ready tasks or jt not available
			readyTasks = [];
		}

		// Filter by priority threshold
		readyTasks = readyTasks.filter((/** @type {{ priority?: number }} */ t) =>
			(t.priority ?? 4) <= priorityThreshold
		);

		if (readyTasks.length === 0) {
			return json({
				success: true,
				message: 'No ready tasks to assign',
				assigned: 0,
				readyTasks: 0,
				idleAgents: 0,
				timestamp: new Date().toISOString()
			});
		}

		// Get all registered agents
		const allAgents = getAgents();
		const agentNames = allAgents.map(a => a.name);

		// Get agents with active sessions
		const activeSessions = await listSessionsAsync();
		const activeAgentNames = new Set(activeSessions.map(s => s.agentName));

		// Get agents currently working on tasks
		let busyAgents = new Set();
		try {
			const { stdout } = await execAsync('jt list --json');
			const allTasks = JSON.parse(stdout);
			const inProgressTasks = allTasks.filter((/** @type {{ status?: string }} */ t) =>
				t.status === 'in_progress'
			);
			busyAgents = new Set(
				inProgressTasks
					.map((/** @type {{ assignee?: string }} */ t) => t.assignee)
					.filter(Boolean)
			);
		} catch {
			// Ignore errors
		}

		// Find idle agents (have session but no in_progress task)
		const idleAgents = agentNames.filter(name =>
			activeAgentNames.has(name) && !busyAgents.has(name)
		);

		if (idleAgents.length === 0) {
			return json({
				success: true,
				message: 'No idle agents available',
				assigned: 0,
				readyTasks: readyTasks.length,
				idleAgents: 0,
				activeAgents: activeAgentNames.size,
				busyAgents: busyAgents.size,
				timestamp: new Date().toISOString()
			});
		}

		// Calculate how many assignments to make
		const assignmentCount = Math.min(maxAssignments, readyTasks.length, idleAgents.length);

		const assignments = [];
		for (let i = 0; i < assignmentCount; i++) {
			const task = readyTasks[i];
			const agent = idleAgents[i];

			if (dryRun) {
				assignments.push({
					taskId: task.id,
					taskTitle: task.title,
					taskPriority: task.priority,
					agentName: agent,
					dryRun: true
				});
			} else {
				// Actually assign the task
				try {
					await execAsync(`jt update "${task.id}" --assignee "${agent}" --status in_progress`);
					assignments.push({
						taskId: task.id,
						taskTitle: task.title,
						taskPriority: task.priority,
						agentName: agent,
						success: true
					});
				} catch (err) {
					assignments.push({
						taskId: task.id,
						taskTitle: task.title,
						agentName: agent,
						success: false,
						error: err instanceof Error ? err.message : String(err)
					});
				}
			}
		}

		const successCount = assignments.filter(a => a.success !== false).length;

		return json({
			success: true,
			dryRun,
			assigned: successCount,
			attempted: assignments.length,
			readyTasks: readyTasks.length,
			idleAgents: idleAgents.length,
			activeAgents: activeAgentNames.size,
			busyAgents: busyAgents.size,
			assignments,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error in POST /api/agents/auto-assign:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}

/**
 * GET /api/agents/auto-assign
 * Preview what would be auto-assigned (dry run)
 */
/** @type {import('./$types').RequestHandler} */
export async function GET() {
	// Redirect to POST with dryRun=true
	const mockRequest = {
		json: async () => ({ dryRun: true })
	};

	// @ts-ignore - simplified GET handler
	return POST({ request: mockRequest });
}
