/**
 * Bulk Task Creation API
 * POST /api/tasks/bulk
 *
 * Accepts an array of task objects from JAT:SUGGESTED_TASKS format
 * and creates them via lib/tasks.js direct calls.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createTask as libCreateTask, getTaskById, addDependency } from '$lib/server/beads.js';
import { invalidateCache } from '$lib/server/cache.js';
import { _resetTaskCache } from '../../../api/agents/+server.js';
import { getProjectPath } from '$lib/server/projectPaths.js';

/** Suggested task from JAT:SUGGESTED_TASKS marker */
interface SuggestedTask {
	/** Optional ID if this references an existing task */
	id?: string;
	/** Task type: bug, feature, task, chore, epic */
	type: string;
	/** Task title */
	title: string;
	/** Task description */
	description: string;
	/** Priority level: 0-4 (P0=critical, P4=lowest) */
	priority: number;
	/** Optional labels (comma-separated string or array) */
	labels?: string | string[];
	/** Optional reason why this task was suggested */
	reason?: string;
	/** Optional project (overrides request-level project) */
	project?: string;
	/** Optional task IDs this task depends on */
	depends_on?: string[];
	/** Parent epic ID - if set, task will be linked as a child of this epic */
	epicId?: string;
}

interface BulkCreateRequest {
	tasks: SuggestedTask[];
	/** Optional project name to create tasks in */
	project?: string;
	/** Optional epic ID to link all created tasks to (request-level default) */
	epicId?: string;
}

interface TaskResult {
	title: string;
	taskId?: string;
	success: boolean;
	error?: string;
	/** Whether the task was linked to an epic */
	linkedToEpic?: boolean;
	/** Error when linking to epic (task still created) */
	epicLinkError?: string;
}

interface BulkCreateResponse {
	success: boolean;
	results: TaskResult[];
	created: number;
	failed: number;
	message: string;
}

const VALID_TYPES = ['task', 'bug', 'feature', 'epic', 'chore'];

/**
 * Normalize priority value to a number 0-4.
 * Accepts:
 * - Numbers: 0, 1, 2, 3, 4
 * - Strings: "0", "1", "2", "3", "4"
 * - P-prefixed strings: "P0", "P1", "P2", "P3", "P4" (case-insensitive)
 *
 * @returns number or null if invalid
 */
function normalizePriority(value: unknown): number | null {
	if (value === undefined || value === null) {
		return null; // Will use default
	}

	// Already a number
	if (typeof value === 'number') {
		if (value >= 0 && value <= 4) {
			return value;
		}
		return null;
	}

	// String processing
	if (typeof value === 'string') {
		const str = value.trim().toUpperCase();

		// Handle P-prefixed format (P0, P1, P2, P3, P4)
		if (str.match(/^P[0-4]$/)) {
			return parseInt(str.substring(1), 10);
		}

		// Handle plain numeric string
		const num = parseInt(str, 10);
		if (!isNaN(num) && num >= 0 && num <= 4) {
			return num;
		}
	}

	return null;
}

/**
 * Type aliases to normalize common alternative names to valid types
 */
const TYPE_ALIASES: Record<string, string> = {
	docs: 'chore',
	documentation: 'chore',
	doc: 'chore',
	test: 'chore',
	tests: 'chore',
	testing: 'chore',
	refactor: 'chore',
	refactoring: 'chore',
	cleanup: 'chore',
	improvement: 'feature',
	enhancement: 'feature',
	fix: 'bug',
	hotfix: 'bug',
	story: 'feature',
	spike: 'task',
	research: 'task'
};

/**
 * Normalize task type, mapping aliases to valid types
 */
function normalizeType(type: string): string {
	const lower = type.toLowerCase();
	return TYPE_ALIASES[lower] || lower;
}

/**
 * Validate a single task object
 */
function validateTask(task: unknown, index: number): { valid: boolean; error?: string } {
	if (!task || typeof task !== 'object') {
		return { valid: false, error: `Task at index ${index} is not a valid object` };
	}

	const t = task as Record<string, unknown>;

	// Title is required
	if (!t.title || typeof t.title !== 'string' || t.title.trim() === '') {
		return { valid: false, error: `Task at index ${index} is missing required title` };
	}

	// Type is required and must be valid
	if (!t.type || typeof t.type !== 'string') {
		return { valid: false, error: `Task at index ${index} is missing required type` };
	}

	const normalizedType = normalizeType(t.type as string);
	if (!VALID_TYPES.includes(normalizedType)) {
		return {
			valid: false,
			error: `Task at index ${index} has invalid type "${t.type}". Must be one of: ${VALID_TYPES.join(', ')} (or aliases like docs, test, refactor, fix, etc.)`
		};
	}

	// Priority must be valid if provided (normalize P-prefixed strings like "P3" to 3)
	if (t.priority !== undefined && t.priority !== null) {
		const normalizedPriority = normalizePriority(t.priority);
		if (normalizedPriority === null) {
			return {
				valid: false,
				error: `Task at index ${index} has invalid priority "${t.priority}". Must be 0-4 or P0-P4`
			};
		}
		// Store the normalized value back for createTask to use
		(t as Record<string, unknown>).priority = normalizedPriority;
	}

	return { valid: true };
}

/**
 * Check if an epic is still open (not closed)
 */
function isEpicOpen(epicId: string): boolean {
	try {
		const epic = getTaskById(epicId);
		if (!epic) return false;
		return epic.status !== 'closed';
	} catch {
		return false;
	}
}

/**
 * Link a task to an epic by adding epic->child dependency
 * Uses addDependency with CORRECT direction: epic depends on child (not child depends on epic)
 * This ensures child is READY and epic is BLOCKED until child completes
 *
 * IMPORTANT: This function checks if the epic is still open before linking.
 * Tasks will NOT be linked to closed epics (prevents stale epic state bugs).
 */
function linkTaskToEpic(
	epicId: string,
	childId: string,
	projectPath?: string
): { success: boolean; error?: string; skipped?: boolean } {
	try {
		// Check if epic is still open before linking
		const epicOpen = isEpicOpen(epicId);
		if (!epicOpen) {
			console.warn(
				`Skipping epic link: Epic ${epicId} is closed or not found. ` +
					`Task ${childId} was NOT linked. This can happen when IDE epic state ` +
					`becomes stale after an epic is closed by an agent.`
			);
			return {
				success: true,
				skipped: true,
				error: `Epic ${epicId} is closed - task not linked`
			};
		}

		// CRITICAL: Dependency direction is epic depends on child
		// This makes child READY (can be worked on) and epic BLOCKED (until children complete)
		addDependency(epicId, childId, projectPath);
		return { success: true };
	} catch (err) {
		const error = err as Error;
		console.error(`Error linking task ${childId} to epic ${epicId}:`, error);

		const errorMessage = error.message || 'Unknown error';

		// Handle "already linked" case gracefully (UNIQUE constraint)
		if (errorMessage.includes('UNIQUE constraint failed')) {
			console.log(`Task ${childId} already linked to epic ${epicId}`);
			return { success: true };
		}

		return { success: false, error: errorMessage };
	}
}

/**
 * Create a single task using lib/tasks.js createTask
 */
async function createTask(
	task: SuggestedTask,
	defaultProject?: string,
	defaultEpicId?: string
): Promise<TaskResult> {
	try {
		const title = task.title.trim();
		const description = task.description?.trim() || '';
		const type = normalizeType(task.type);

		// Validate description length
		if (description.length > 50_000) {
			return {
				title,
				success: false,
				error: `Description too long (${description.length} chars). Maximum is 50,000.`
			};
		}
		const priority = task.priority ?? 2;
		// Use task-level project if provided, otherwise use default
		const project = task.project || defaultProject;
		// Use task-level epicId if provided, otherwise use request-level default
		const epicId = task.epicId || defaultEpicId;

		// Resolve project path
		let projectPath: string | undefined;
		if (project) {
			const projectInfo = await getProjectPath(project);

			if (!projectInfo.exists) {
				return {
					title: task.title,
					success: false,
					error: `Project directory not found: ${projectInfo.path}. Add the project to ~/.config/jat/projects.json with the correct path.`
				};
			}

			projectPath = projectInfo.path;
		}

		// If no project, use IDE's parent directory
		if (!projectPath) {
			projectPath = process.cwd().replace(/\/ide$/, '');
		}

		// Build labels array
		let labels: string[] = [];
		if (task.labels) {
			if (Array.isArray(task.labels)) {
				labels = task.labels
					.filter((l): l is string => typeof l === 'string' && l.trim() !== '')
					.map((l) => l.trim());
			} else if (typeof task.labels === 'string') {
				labels = task.labels
					.split(',')
					.map((l) => l.trim())
					.filter(Boolean);
			}
		}

		// Build deps array
		let deps: string[] = [];
		if (task.depends_on && Array.isArray(task.depends_on) && task.depends_on.length > 0) {
			deps = task.depends_on
				.filter((d): d is string => typeof d === 'string' && d.trim() !== '')
				.map((d) => d.trim());
		}

		// Create the task directly via lib/tasks.js
		const createdTask = libCreateTask({
			projectPath,
			title,
			description,
			type,
			priority,
			labels,
			deps,
			assignee: null,
			notes: ''
		});

		const taskId = createdTask.id;

		// Task created successfully - now link to epic if epicId is provided
		const taskResult: TaskResult = {
			title,
			taskId,
			success: true
		};

		if (epicId) {
			const linkResult = linkTaskToEpic(epicId, taskId, projectPath);
			if (linkResult.success && !linkResult.skipped) {
				taskResult.linkedToEpic = true;
				console.log(`Linked task ${taskId} to epic ${epicId}`);
			} else if (linkResult.skipped) {
				// Epic was closed - task created but not linked (this is expected, not an error)
				taskResult.linkedToEpic = false;
				console.log(
					`Task ${taskId} created but not linked to epic ${epicId} (epic is closed)`
				);
			} else {
				taskResult.epicLinkError = linkResult.error;
				console.error(`Failed to link task ${taskId} to epic ${epicId}: ${linkResult.error}`);
			}
		}

		return taskResult;
	} catch (err) {
		const error = err as Error;
		console.error('Error creating task:', error);

		let errorMessage = error.message || 'Unknown error';

		// Check for "no .jat/ database" error - project not initialized
		if (errorMessage.includes('No .jat/ database') || errorMessage.includes('Run initProject()')) {
			const projectName = defaultProject || task.project || 'this project';
			errorMessage = `Project "${projectName}" has not been initialized for task tracking. Run "bd init" in the project directory, or use the "Add Project" button on the Projects page.`;
		}

		return {
			title: task.title,
			success: false,
			error: errorMessage
		};
	}
}

/**
 * POST /api/tasks/bulk
 * Creates multiple tasks from an array of suggested tasks
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as BulkCreateRequest;

		// Validate request structure
		if (!body.tasks || !Array.isArray(body.tasks)) {
			return json(
				{
					success: false,
					results: [],
					created: 0,
					failed: 0,
					message: 'Request must include a "tasks" array'
				} satisfies BulkCreateResponse,
				{ status: 400 }
			);
		}

		if (body.tasks.length === 0) {
			return json(
				{
					success: true,
					results: [],
					created: 0,
					failed: 0,
					message: 'No tasks provided'
				} satisfies BulkCreateResponse,
				{ status: 200 }
			);
		}

		// Limit bulk creation to prevent abuse
		const MAX_TASKS = 500;
		if (body.tasks.length > MAX_TASKS) {
			return json(
				{
					success: false,
					results: [],
					created: 0,
					failed: 0,
					message: `Too many tasks. Maximum is ${MAX_TASKS}, got ${body.tasks.length}`
				} satisfies BulkCreateResponse,
				{ status: 400 }
			);
		}

		// Validate all tasks first
		const validationErrors: string[] = [];
		for (let i = 0; i < body.tasks.length; i++) {
			const validation = validateTask(body.tasks[i], i);
			if (!validation.valid && validation.error) {
				validationErrors.push(validation.error);
			}
		}

		if (validationErrors.length > 0) {
			return json(
				{
					success: false,
					results: [],
					created: 0,
					failed: validationErrors.length,
					message: `Validation failed: ${validationErrors.join('; ')}`
				} satisfies BulkCreateResponse,
				{ status: 400 }
			);
		}

		// Create tasks sequentially
		const results: TaskResult[] = [];
		let created = 0;
		let failed = 0;

		for (const task of body.tasks) {
			const result = await createTask(task, body.project, body.epicId);
			results.push(result);

			if (result.success) {
				created++;
			} else {
				failed++;
			}
		}

		const allSucceeded = failed === 0;
		const message = allSucceeded
			? `Successfully created ${created} task${created !== 1 ? 's' : ''}`
			: `Created ${created} task${created !== 1 ? 's' : ''}, ${failed} failed`;

		// Invalidate task-related caches since we created tasks
		// Also reset module-level task cache in agents endpoint
		if (created > 0) {
			invalidateCache.tasks();
			invalidateCache.agents(); // Agent data includes task counts
			_resetTaskCache();
		}

		return json(
			{
				success: allSucceeded,
				results,
				created,
				failed,
				message
			} satisfies BulkCreateResponse,
			{ status: allSucceeded ? 201 : 207 } // 207 Multi-Status for partial success
		);
	} catch (err) {
		console.error('Bulk task creation error:', err);
		const error = err as Error;

		return json(
			{
				success: false,
				results: [],
				created: 0,
				failed: 0,
				message: error.message || 'Internal server error'
			} satisfies BulkCreateResponse,
			{ status: 500 }
		);
	}
};
