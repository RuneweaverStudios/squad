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
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);

/**
 * Get the project path for a given project name from projects.json config
 * @param {string} projectName - Project name (e.g., "steelbridge", "squad")
 * @returns {string} - Full path to project directory
 */
function getProjectPath(projectName) {
	const configPath = join(homedir(), '.config/squad/projects.json');
	const defaultPath = process.cwd().replace('/ide', '');

	if (!existsSync(configPath)) {
		return defaultPath;
	}

	try {
		const config = JSON.parse(readFileSync(configPath, 'utf-8'));
		const projectConfig = config.projects?.[projectName.toLowerCase()];
		if (projectConfig?.path) {
			// Expand ~ to home directory
			return projectConfig.path.replace(/^~/, homedir());
		}
	} catch (err) {
		console.warn(`[next] Could not read projects config:`, err);
	}

	return defaultPath;
}

/**
 * @typedef {{ id: string, title: string, status: string, priority: number, depends_on?: Array<{ id: string, status: string }> }} Task
 * @typedef {{ taskId: string, taskTitle: string, priority: number, source: 'epic' | 'backlog', epicId?: string, epicTitle?: string }} NextTaskResult
 * @typedef {{ project?: string | null, preferEpic?: boolean }} PickNextTaskOptions
 */

/**
 * Get the parent epic ID from a task ID (dot notation only)
 * Task IDs with dots (e.g., squad-puza.8) have parent epic (e.g., squad-puza)
 * For non-dot notation tasks, use findEpicContainingTask() instead
 * @param {string} taskId
 * @returns {string | null}
 */
function getParentEpicIdFromDotNotation(taskId) {
	const dotIndex = taskId.lastIndexOf('.');
	if (dotIndex === -1) return null;
	return taskId.substring(0, dotIndex);
}

/**
 * Find the epic that contains a given task in its dependencies
 * This handles tasks with squad-{hash} format that don't use dot notation
 * @param {string} taskId
 * @param {string} projectPath
 * @returns {Promise<{epicId: string, epicTitle: string} | null>}
 */
async function findEpicContainingTask(taskId, projectPath) {
	try {
		// First, check if the task itself has a parent field
		const { stdout: taskStdout } = await execAsync(`st show "${taskId}" --json`, {
			cwd: projectPath,
			timeout: 10000
		});

		const taskData = JSON.parse(taskStdout);
		const task = Array.isArray(taskData) ? taskData[0] : taskData;

		if (task?.parent) {
			// Task has a parent field - fetch the parent to get its title
			try {
				const { stdout: parentStdout } = await execAsync(`st show "${task.parent}" --json`, {
					cwd: projectPath,
					timeout: 10000
				});
				const parentData = JSON.parse(parentStdout);
				const parent = Array.isArray(parentData) ? parentData[0] : parentData;
				if (parent) {
					console.log(`[next] Task ${taskId} has parent ${task.parent}`);
					return { epicId: parent.id, epicTitle: parent.title };
				}
			} catch (err) {
				console.warn(`[next] Could not fetch parent ${task.parent}:`, err);
			}
		}

		// No parent field - search for epics that have this task as a dependency
		// Use st list to find epics in the same project
		const projectPrefix = taskId.split('-')[0];
		const { stdout: epicsStdout } = await execAsync(
			`st list --type epic --status open --json`,
			{
				cwd: projectPath,
				timeout: 10000
			}
		);

		const epics = JSON.parse(epicsStdout);

		// Check each epic's dependencies for this task
		for (const epic of epics) {
			// Only check epics from the same project
			if (!epic.id.startsWith(projectPrefix + '-')) continue;

			// Fetch full epic with dependencies
			try {
				const { stdout: epicFullStdout } = await execAsync(`st show "${epic.id}" --json`, {
					cwd: projectPath,
					timeout: 5000
				});
				const epicFull = JSON.parse(epicFullStdout);
				const epicData = Array.isArray(epicFull) ? epicFull[0] : epicFull;

				if (epicData?.dependencies) {
					const hasTask = epicData.dependencies.some(
						(/** @type {{ id: string }} */ dep) => dep.id === taskId
					);
					if (hasTask) {
						console.log(`[next] Task ${taskId} found in epic ${epicData.id} dependencies`);
						return { epicId: epicData.id, epicTitle: epicData.title };
					}
				}
			} catch (err) {
				// Skip this epic if we can't fetch it
				continue;
			}
		}

		return null;
	} catch (error) {
		console.error(`[next] Error finding epic for task ${taskId}:`, error);
		return null;
	}
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
 * @param {string | null | undefined} project - Filter siblings by project
 * @returns {Promise<NextTaskResult | null>}
 */
async function findNextEpicSibling(completedTaskId, epicId, projectPath, project) {
	try {
		// Fetch the epic with its children using st show
		const { stdout } = await execAsync(`st show "${epicId}" --json`, {
			cwd: projectPath,
			timeout: 10000
		});

		const epicData = JSON.parse(stdout);
		const epic = Array.isArray(epicData) ? epicData[0] : epicData;

		if (!epic || !epic.dependencies || epic.dependencies.length === 0) {
			console.log(`[next] Epic ${epicId} has no children`);
			return null;
		}

		// Find ready siblings (open, not blocked, not the completed task, same project)
		const readySiblings = epic.dependencies
			.filter((/** @type {Task} */ task) => {
				// Skip the just-completed task
				if (task.id === completedTaskId) return false;
				// Filter by project if specified
				if (project && project !== 'All Projects') {
					const taskProject = task.id.split('-')[0];
					if (taskProject !== project) return false;
				}
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
		// Use st ready which returns ready tasks sorted by priority
		// When filtering by project, we need to fetch more tasks since the top task might not be from the target project
		const limit = (project && project !== 'All Projects') ? 50 : 1;
		const { stdout } = await execAsync(`st ready --json --limit ${limit} --sort hybrid`, {
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
			console.log(`[next] No ready tasks in backlog${project ? ` for project ${project}` : ''}`);
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
	// Use the project-specific path from config, or fall back to current directory
	const projectPath = project ? getProjectPath(project) : process.cwd().replace('/ide', '');
	console.log(`[next] Using project path: ${projectPath} for project: ${project || 'default'}`);

	// Try epic-aware selection first
	if (completedTaskId && preferEpic) {
		// First try dot notation (e.g., squad-puza.8 → squad-puza)
		let epicId = getParentEpicIdFromDotNotation(completedTaskId);
		let epicTitle = undefined;

		// If no dot notation, try database lookup for epic membership
		if (!epicId) {
			const epicInfo = await findEpicContainingTask(completedTaskId, projectPath);
			if (epicInfo) {
				epicId = epicInfo.epicId;
				epicTitle = epicInfo.epicTitle;
			}
		}

		if (epicId) {
			console.log(
				`[next] Task ${completedTaskId} is part of epic ${epicId}, looking for siblings...`
			);
			const epicResult = await findNextEpicSibling(completedTaskId, epicId, projectPath, project);
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
			// Return 200 with null task - this is not an error condition
			// Having no ready tasks is expected when all work is done
			return json({
				nextTask: null,
				message: 'No ready tasks available',
				timestamp: new Date().toISOString()
			});
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
			// Return 200 with null task - this is not an error condition
			// Having no ready tasks is expected when all work is done
			return json({
				nextTask: null,
				spawnResult: null,
				message: 'No ready tasks available',
				timestamp: new Date().toISOString()
			});
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
