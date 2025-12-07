/**
 * Next Task API Endpoint
 *
 * GET /api/tasks/next → Find the next best task to work on
 * POST /api/tasks/next → Find next task AND spawn an agent for it
 *
 * Query Parameters:
 * - completedTaskId: The task that was just completed (optional, enables epic-aware selection)
 * - project: Filter backlog by project (optional)
 * - preferEpic: If "false", skip epic-aware selection (default: true)
 *
 * POST Body:
 * - completedTaskId: The task that was just completed (optional)
 * - project: Filter backlog by project (optional)
 * - preferEpic: If false, skip epic-aware selection (default: true)
 * - cleanupSession: Session name to cleanup before spawning (optional)
 *
 * Response:
 * - nextTask: { taskId, taskTitle, priority, source: 'epic' | 'backlog', epicId?, epicTitle? }
 * - spawnResult: (POST only) Result from /api/work/spawn
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * @typedef {{ id: string, title: string, status: string, priority: number, depends_on?: Array<{ id: string, status: string }> }} Task
 * @typedef {{ taskId: string, taskTitle: string, priority: number, source: 'epic' | 'backlog', epicId?: string, epicTitle?: string }} NextTaskResult
 * @typedef {{ project?: string | null, preferEpic?: boolean }} PickNextTaskOptions
 */

/**
 * Get the parent epic ID from a task ID
 * Task IDs with dots (e.g., jat-puza.8) have parent epic (e.g., jat-puza)
 * @param {string} taskId
 * @returns {string | null}
 */
function getParentEpicId(taskId) {
	const dotIndex = taskId.lastIndexOf('.');
	if (dotIndex === -1) return null;
	return taskId.substring(0, dotIndex);
}

/**
 * Check if a task is ready to start
 * Ready = open status + no blocking dependencies
 * @param {Task} task
 * @returns {boolean}
 */
function isTaskReady(task) {
	// Must be open (not in_progress, not closed, not blocked)
	if (task.status !== 'open') {
		return false;
	}
	// Must not have blocking dependencies
	if (task.depends_on && task.depends_on.length > 0) {
		const hasBlockingDep = task.depends_on.some((dep) => dep.status !== 'closed');
		if (hasBlockingDep) return false;
	}
	return true;
}

/**
 * Find the next ready sibling task within the same epic
 * @param {string} completedTaskId
 * @param {string} epicId
 * @param {string} projectPath
 * @returns {Promise<NextTaskResult | null>}
 */
async function findNextEpicSibling(completedTaskId, epicId, projectPath) {
	try {
		// Fetch the epic with its children using bd show
		const { stdout } = await execAsync(`bd show "${epicId}" --json`, {
			cwd: projectPath,
			timeout: 10000
		});

		const epicData = JSON.parse(stdout);
		const epic = Array.isArray(epicData) ? epicData[0] : epicData;

		if (!epic || !epic.dependencies || epic.dependencies.length === 0) {
			console.log(`[next] Epic ${epicId} has no children`);
			return null;
		}

		// Find ready siblings (open, not blocked, not the completed task)
		const readySiblings = epic.dependencies
			.filter((/** @type {Task} */ task) => {
				// Skip the just-completed task
				if (task.id === completedTaskId) return false;
				// Must be ready (open and not blocked)
				return isTaskReady(task);
			})
			.sort((/** @type {Task} */ a, /** @type {Task} */ b) => {
				// Sort by priority (lower = higher priority)
				if (a.priority !== b.priority) return a.priority - b.priority;
				// Then by ID for consistency
				return a.id.localeCompare(b.id);
			});

		if (readySiblings.length === 0) {
			console.log(`[next] No ready siblings in epic ${epicId}`);
			return null;
		}

		const nextTask = readySiblings[0];
		return {
			taskId: nextTask.id,
			taskTitle: nextTask.title,
			priority: nextTask.priority,
			source: 'epic',
			epicId: epic.id,
			epicTitle: epic.title
		};
	} catch (error) {
		console.error(`[next] Error finding epic siblings:`, error);
		return null;
	}
}

/**
 * Find the highest-priority ready task from the global backlog
 * @param {string} projectPath
 * @param {string | null | undefined} project
 * @returns {Promise<NextTaskResult | null>}
 */
async function findFromBacklog(projectPath, project) {
	try {
		// Use bd ready which returns ready tasks sorted by priority
		const { stdout } = await execAsync(`bd ready --json --limit 1 --sort hybrid`, {
			cwd: projectPath,
			timeout: 10000
		});

		/** @type {Task[]} */
		const tasks = JSON.parse(stdout);

		// Filter by project if specified
		let filteredTasks = tasks;
		if (project && project !== 'All Projects') {
			filteredTasks = tasks.filter((t) => t.id.startsWith(`${project}-`));
		}

		if (filteredTasks.length === 0) {
			console.log(`[next] No ready tasks in backlog`);
			return null;
		}

		const nextTask = filteredTasks[0];
		return {
			taskId: nextTask.id,
			taskTitle: nextTask.title,
			priority: nextTask.priority,
			source: 'backlog'
		};
	} catch (error) {
		console.error(`[next] Error fetching backlog:`, error);
		return null;
	}
}

/**
 * Pick the next task to work on
 * @param {string | null | undefined} completedTaskId
 * @param {PickNextTaskOptions} options
 * @returns {Promise<NextTaskResult | null>}
 */
async function pickNextTask(completedTaskId, options = {}) {
	const { project = null, preferEpic = true } = options;
	const projectPath = process.cwd().replace('/dashboard', '');

	// Try epic-aware selection first
	if (completedTaskId && preferEpic) {
		const epicId = getParentEpicId(completedTaskId);
		if (epicId) {
			console.log(
				`[next] Task ${completedTaskId} is part of epic ${epicId}, looking for siblings...`
			);
			const epicResult = await findNextEpicSibling(completedTaskId, epicId, projectPath);
			if (epicResult) {
				console.log(`[next] Found epic sibling: ${epicResult.taskId}`);
				return epicResult;
			}
		}
	}

	// Fall back to global backlog
	console.log(`[next] Falling back to backlog...`);
	return findFromBacklog(projectPath, project);
}

/**
 * GET /api/tasks/next
 * Find the next best task to work on (no spawn)
 */
/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
	try {
		const completedTaskId = url.searchParams.get('completedTaskId') || null;
		const project = url.searchParams.get('project') || null;
		const preferEpic = url.searchParams.get('preferEpic') !== 'false';

		const nextTask = await pickNextTask(completedTaskId, { project, preferEpic });

		if (!nextTask) {
			return json(
				{
					nextTask: null,
					message: 'No ready tasks available',
					timestamp: new Date().toISOString()
				},
				{ status: 404 }
			);
		}

		return json({
			nextTask,
			message: `Next task: ${nextTask.taskId} (${nextTask.source})`,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error in GET /api/tasks/next:', error);
		return json(
			{
				error: 'Internal server error',
				message: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
}

/**
 * POST /api/tasks/next
 * Find next task AND spawn an agent for it
 */
/** @type {import('./$types').RequestHandler} */
export async function POST({ request, fetch }) {
	try {
		const body = await request.json();
		const {
			completedTaskId = null,
			project = null,
			preferEpic = true,
			cleanupSession = null
		} = body;

		// Find next task
		const nextTask = await pickNextTask(completedTaskId, { project, preferEpic });

		if (!nextTask) {
			return json(
				{
					nextTask: null,
					spawnResult: null,
					message: 'No ready tasks available',
					timestamp: new Date().toISOString()
				},
				{ status: 404 }
			);
		}

		// Cleanup previous session if provided
		if (cleanupSession) {
			try {
				await fetch(`/api/work/${encodeURIComponent(cleanupSession)}`, {
					method: 'DELETE'
				});
				console.log(`[next] Cleaned up session: ${cleanupSession}`);
			} catch (error) {
				console.warn(`[next] Failed to cleanup session ${cleanupSession}:`, error);
				// Continue anyway - spawn is more important
			}
		}

		// Spawn agent for the task
		const spawnResponse = await fetch('/api/work/spawn', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				taskId: nextTask.taskId
			})
		});

		if (!spawnResponse.ok) {
			const errorData = await spawnResponse.json();
			return json(
				{
					nextTask,
					spawnResult: null,
					error: 'Spawn failed',
					message: errorData.message || 'Failed to spawn agent',
					timestamp: new Date().toISOString()
				},
				{ status: 500 }
			);
		}

		const spawnResult = await spawnResponse.json();

		return json({
			nextTask,
			spawnResult,
			message: `Spawned agent for ${nextTask.taskId} (${nextTask.source}${nextTask.epicId ? ` in epic ${nextTask.epicId}` : ''})`,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error in POST /api/tasks/next:', error);
		return json(
			{
				error: 'Internal server error',
				message: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
}
