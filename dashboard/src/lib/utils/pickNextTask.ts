/**
 * Pick Next Task Utility
 *
 * Intelligently picks the next task to work on using epic-aware logic:
 * 1. Epic-aware: If completed task was part of an epic, find next unblocked sibling
 * 2. Global fallback: Otherwise pick highest-priority ready task from backlog
 *
 * Used by:
 * - StatusActionBadge "Start Next" action (jat-puza.8)
 * - TopBar "Start Next" button (jat-puza.1)
 *
 * Returns: { taskId, source: 'epic' | 'backlog', epicId?: string } | null
 */

export interface NextTaskResult {
	taskId: string;
	taskTitle: string;
	priority: number;
	source: 'epic' | 'backlog';
	epicId?: string;
	epicTitle?: string;
}

export interface Task {
	id: string;
	title: string;
	status: string;
	priority: number;
	issue_type?: string;
	depends_on?: Array<{ id: string; status: string }>;
	parent?: string;
}

export interface Epic {
	id: string;
	title: string;
	dependencies?: Task[];
}

/**
 * Get the parent epic ID from a task ID
 * Task IDs with dots (e.g., jat-puza.8) have parent epic (e.g., jat-puza)
 */
export function getParentEpicId(taskId: string): string | null {
	const dotIndex = taskId.lastIndexOf('.');
	if (dotIndex === -1) return null;
	return taskId.substring(0, dotIndex);
}

/**
 * Check if a task is blocked by unmet dependencies
 */
function isTaskBlocked(task: Task): boolean {
	if (!task.depends_on || task.depends_on.length === 0) {
		return false;
	}
	// Task is blocked if any dependency is not closed
	return task.depends_on.some((dep) => dep.status !== 'closed');
}

/**
 * Check if a task is ready to start
 * Ready = open status + no blocking dependencies
 */
function isTaskReady(task: Task): boolean {
	// Must be open (not in_progress, not closed, not blocked)
	if (task.status !== 'open') {
		return false;
	}
	// Must not have blocking dependencies
	return !isTaskBlocked(task);
}

/**
 * Find the next ready sibling task within the same epic
 * Siblings are tasks with the same parent epic ID (e.g., jat-puza.1, jat-puza.2, etc.)
 */
async function findNextEpicSibling(
	completedTaskId: string,
	epicId: string,
	fetchFn: typeof fetch = fetch
): Promise<NextTaskResult | null> {
	try {
		// Fetch the epic with its children (dependencies)
		const response = await fetchFn(`/api/tasks/${epicId}?include=dependencies`);
		if (!response.ok) {
			console.warn(`[pickNextTask] Failed to fetch epic ${epicId}:`, response.status);
			return null;
		}

		const data = await response.json();
		const epic: Epic = data.task;

		if (!epic || !epic.dependencies || epic.dependencies.length === 0) {
			console.log(`[pickNextTask] Epic ${epicId} has no children`);
			return null;
		}

		// Find ready siblings (open, not blocked, not the completed task)
		const readySiblings = epic.dependencies
			.filter((task) => {
				// Skip the just-completed task
				if (task.id === completedTaskId) return false;
				// Must be ready (open and not blocked)
				return isTaskReady(task);
			})
			.sort((a, b) => {
				// Sort by priority (lower = higher priority)
				if (a.priority !== b.priority) return a.priority - b.priority;
				// Then by ID for consistency
				return a.id.localeCompare(b.id);
			});

		if (readySiblings.length === 0) {
			console.log(`[pickNextTask] No ready siblings in epic ${epicId}`);
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
		console.error(`[pickNextTask] Error finding epic siblings:`, error);
		return null;
	}
}

/**
 * Find the highest-priority ready task from the global backlog
 */
async function findFromBacklog(
	fetchFn: typeof fetch = fetch,
	project?: string
): Promise<NextTaskResult | null> {
	try {
		// Use the queue API which returns ready tasks sorted by priority
		let url = '/api/tasks/queue?limit=1&sort=hybrid';
		if (project && project !== 'All Projects') {
			url += `&project=${encodeURIComponent(project)}`;
		}

		const response = await fetchFn(url);
		if (!response.ok) {
			console.warn(`[pickNextTask] Failed to fetch queue:`, response.status);
			return null;
		}

		const data = await response.json();
		if (!data.queue || data.queue.length === 0) {
			console.log(`[pickNextTask] No ready tasks in backlog`);
			return null;
		}

		const nextTask = data.queue[0];
		return {
			taskId: nextTask.id,
			taskTitle: nextTask.title,
			priority: nextTask.priority,
			source: 'backlog'
		};
	} catch (error) {
		console.error(`[pickNextTask] Error fetching backlog:`, error);
		return null;
	}
}

/**
 * Pick the next task to work on
 *
 * Strategy:
 * 1. If completedTaskId provided and is part of an epic, try to find next unblocked sibling
 * 2. Fall back to highest-priority ready task from global backlog
 *
 * @param completedTaskId - The task that was just completed (optional)
 * @param options.project - Filter backlog by project (optional)
 * @param options.preferEpic - If true, prefer epic siblings over higher-priority backlog tasks (default: true)
 * @param options.fetchFn - Custom fetch function for testing (default: global fetch)
 */
export async function pickNextTask(
	completedTaskId?: string | null,
	options: {
		project?: string;
		preferEpic?: boolean;
		fetchFn?: typeof fetch;
	} = {}
): Promise<NextTaskResult | null> {
	const { project, preferEpic = true, fetchFn = fetch } = options;

	// Try epic-aware selection first
	if (completedTaskId && preferEpic) {
		const epicId = getParentEpicId(completedTaskId);
		if (epicId) {
			console.log(`[pickNextTask] Task ${completedTaskId} is part of epic ${epicId}, looking for siblings...`);
			const epicResult = await findNextEpicSibling(completedTaskId, epicId, fetchFn);
			if (epicResult) {
				console.log(`[pickNextTask] Found epic sibling: ${epicResult.taskId}`);
				return epicResult;
			}
		}
	}

	// Fall back to global backlog
	console.log(`[pickNextTask] Falling back to backlog...`);
	return findFromBacklog(fetchFn, project);
}

/**
 * Convenience function to pick next task and spawn an agent for it
 * Returns the spawn result or null if no task available
 */
export async function pickNextTaskAndSpawn(
	completedTaskId?: string | null,
	options: {
		project?: string;
		preferEpic?: boolean;
		cleanupSession?: string; // Session to cleanup before spawning
		fetchFn?: typeof fetch;
	} = {}
): Promise<{ nextTask: NextTaskResult; spawnResult: any } | null> {
	const { cleanupSession, fetchFn = fetch, ...pickOptions } = options;

	// Pick next task
	const nextTask = await pickNextTask(completedTaskId, { ...pickOptions, fetchFn });
	if (!nextTask) {
		console.log(`[pickNextTaskAndSpawn] No next task available`);
		return null;
	}

	// Cleanup previous session if provided
	if (cleanupSession) {
		try {
			await fetchFn(`/api/work/${cleanupSession}`, {
				method: 'DELETE'
			});
			console.log(`[pickNextTaskAndSpawn] Cleaned up session: ${cleanupSession}`);
		} catch (error) {
			console.warn(`[pickNextTaskAndSpawn] Failed to cleanup session ${cleanupSession}:`, error);
			// Continue anyway - spawn is more important
		}
	}

	// Spawn agent for the task
	try {
		const spawnResponse = await fetchFn('/api/work/spawn', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				taskId: nextTask.taskId
			})
		});

		if (!spawnResponse.ok) {
			const errorData = await spawnResponse.json();
			console.error(`[pickNextTaskAndSpawn] Spawn failed:`, errorData);
			return null;
		}

		const spawnResult = await spawnResponse.json();
		return { nextTask, spawnResult };
	} catch (error) {
		console.error(`[pickNextTaskAndSpawn] Error spawning agent:`, error);
		return null;
	}
}
