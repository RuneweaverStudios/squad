/**
 * Task Epic API - Link or unlink a task to/from an epic
 *
 * POST /api/tasks/[id]/epic - Link task to an epic
 * DELETE /api/tasks/[id]/epic - Unlink task from an epic
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTaskById, updateTask, addDependency, removeDependency, getDependencyTree } from '$lib/server/jat-tasks.js';
import { invalidateCache } from '$lib/server/cache.js';
import { _resetTaskCache } from '../../../agents/+server.js';

interface EpicInfo {
	exists: boolean;
	isEpic: boolean;
	isClosed: boolean;
}

/**
 * Get info about an epic (exists, type, status)
 */
function getEpicInfo(epicId: string): EpicInfo {
	try {
		const epic = getTaskById(epicId);
		if (!epic) return { exists: false, isEpic: false, isClosed: false };
		return {
			exists: true,
			isEpic: epic.issue_type === 'epic',
			isClosed: epic.status === 'closed'
		};
	} catch {
		return { exists: false, isEpic: false, isClosed: false };
	}
}

/**
 * Reopen a closed epic
 */
function reopenEpic(epicId: string, projectPath?: string): boolean {
	try {
		updateTask(epicId, { status: 'open', projectPath });
		console.log(`[task-epic] Reopened closed epic ${epicId}`);
		return true;
	} catch (error) {
		console.error(`[task-epic] Failed to reopen epic ${epicId}:`, error);
		return false;
	}
}

/**
 * Find the epic(s) that a task is currently linked to (parent epics that depend on this task)
 */
function findParentEpics(taskId: string, projectPath?: string): string[] {
	try {
		// getDependencyTree with reverse=true shows what depends ON this task
		const result = getDependencyTree(taskId, { reverse: true, projectPath });

		// Result is an array of tasks. depth=0 is the task itself, depth>0 are parents.
		// Filter to only return epics at depth > 0 (direct parent epics)
		const parentEpics: string[] = [];
		if (Array.isArray(result)) {
			for (const item of result) {
				// depth=1 means direct parent (epic depends on this task)
				if (item.depth === 1 && item.issue_type === 'epic') {
					parentEpics.push(item.id);
				}
			}
		}

		return parentEpics;
	} catch {
		// If function fails (e.g., no dependencies), return empty array
		return [];
	}
}

/**
 * Check if a task has a backwards dependency on an epic (task depends on epic).
 * This is the wrong direction - the correct direction is epic depends on task.
 * Returns true if such a backwards dep exists for the given epicId.
 */
function hasBackwardsDependency(taskId: string, epicId: string, projectPath?: string): boolean {
	try {
		// getDependencyTree without reverse shows what this task depends ON
		const result = getDependencyTree(taskId, { reverse: false, projectPath });
		if (Array.isArray(result)) {
			return result.some(item => item.id === epicId && item.depth === 1);
		}
		return false;
	} catch {
		return false;
	}
}

/**
 * Remove a task from an epic (remove the epic->task dependency)
 */
function unlinkFromEpic(taskId: string, epicId: string, projectPath?: string): boolean {
	try {
		removeDependency(epicId, taskId, projectPath);
		console.log(`[task-epic] Removed task ${taskId} from epic ${epicId}`);
		return true;
	} catch (error) {
		console.error(`[task-epic] Failed to remove task ${taskId} from epic ${epicId}:`, error);
		return false;
	}
}

/**
 * POST /api/tasks/[id]/epic
 * Link a task to an epic by adding epic->child dependency
 * Body: { epicId: string }
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const taskId = params.id;

	try {
		const body = await request.json();
		const { epicId } = body;

		if (!epicId) {
			return json(
				{ success: false, error: 'epicId is required' },
				{ status: 400 }
			);
		}

		// Get the task to find project path
		const task = getTaskById(taskId);
		if (!task) {
			return json(
				{ success: false, error: `Task '${taskId}' not found` },
				{ status: 404 }
			);
		}

		const projectPath = task.project_path;

		// Verify the epic exists
		const epicInfo = getEpicInfo(epicId);
		if (!epicInfo.exists || !epicInfo.isEpic) {
			return json(
				{ success: false, error: `Epic '${epicId}' not found` },
				{ status: 400 }
			);
		}

		// If epic is closed, auto-reopen it since user is adding work to it
		let epicReopened = false;
		if (epicInfo.isClosed) {
			epicReopened = reopenEpic(epicId, projectPath);
			if (!epicReopened) {
				return json(
					{ success: false, error: `Failed to reopen closed epic '${epicId}'` },
					{ status: 500 }
				);
			}
		}

		// Check if task is already in an epic (support "move" between epics)
		const currentEpics = findParentEpics(taskId, projectPath);
		let movedFrom: string | null = null;

		// If already in the target epic, return early
		if (currentEpics.includes(epicId)) {
			return json({
				success: true,
				message: `Task ${taskId} is already linked to epic ${epicId}`,
				taskId,
				epicId,
				alreadyLinked: true
			});
		}

		// If in a different epic, remove from the old one first (move operation)
		if (currentEpics.length > 0) {
			for (const oldEpicId of currentEpics) {
				const removed = unlinkFromEpic(taskId, oldEpicId, projectPath);
				if (removed) {
					movedFrom = oldEpicId;
					console.log(`[task-epic] Moving task ${taskId} from epic ${oldEpicId} to ${epicId}`);
				}
			}
		}

		// Check for backwards dependency (task depends on epic - wrong direction from --parent flag)
		// If found, auto-fix by removing the wrong dep before adding the correct one
		if (hasBackwardsDependency(taskId, epicId, projectPath)) {
			try {
				removeDependency(taskId, epicId, projectPath);
				console.log(`[task-epic] Fixed backwards dependency: removed ${taskId} -> ${epicId}`);
			} catch (fixError) {
				console.error(`[task-epic] Failed to remove backwards dependency:`, fixError);
			}
		}

		// CRITICAL: Dependency direction is epic depends on child
		// This makes child READY (can be worked on) and epic BLOCKED (until children complete)
		try {
			addDependency(epicId, taskId, projectPath);
		} catch (depError) {
			const errorMessage = depError instanceof Error ? depError.message : String(depError);

			// Handle "already linked" case gracefully (UNIQUE constraint)
			if (errorMessage.includes('UNIQUE constraint failed')) {
				console.log(`[task-epic] Task ${taskId} already linked to epic ${epicId}`);
				return json({
					success: true,
					message: `Task ${taskId} is already linked to epic ${epicId}`,
					taskId,
					epicId,
					alreadyLinked: true
				});
			}

			// Handle cycle detection gracefully (409 Conflict, not 500)
			if (errorMessage.includes('cycle')) {
				console.warn(`[task-epic] Cycle detected: ${errorMessage}`);
				return json(
					{ success: false, error: `Cannot link: would create a circular dependency` },
					{ status: 409 }
				);
			}

			console.error('[task-epic] addDependency error:', errorMessage);
			return json(
				{ success: false, error: errorMessage },
				{ status: 500 }
			);
		}

		// Invalidate caches
		invalidateCache.tasks();
		invalidateCache.agents();
		_resetTaskCache();

		// Build log message
		let logMsg = `[task-epic] `;
		if (movedFrom) {
			logMsg += `Moved task ${taskId} from epic ${movedFrom} to ${epicId}`;
		} else {
			logMsg += `Linked task ${taskId} to epic ${epicId}`;
		}
		if (epicReopened) logMsg += ' (epic was reopened)';
		console.log(logMsg);

		// Build response message
		let message: string;
		if (movedFrom) {
			message = `Task ${taskId} moved from ${movedFrom} to ${epicId}`;
		} else if (epicReopened) {
			message = `Task ${taskId} linked to epic ${epicId} (epic was reopened)`;
		} else {
			message = `Task ${taskId} linked to epic ${epicId}`;
		}

		return json({
			success: true,
			message,
			taskId,
			epicId,
			epicReopened,
			movedFrom
		});

	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		// Handle "already linked" case gracefully (UNIQUE constraint)
		if (errorMessage.includes('UNIQUE constraint failed')) {
			console.log(`[task-epic] Task ${taskId} already linked to an epic (duplicate dependency)`);
			return json({
				success: true,
				message: `Task ${taskId} is already linked to this epic`,
				taskId,
				alreadyLinked: true
			});
		}

		console.error('[task-epic] Error linking task to epic:', error);
		return json(
			{
				success: false,
				error: 'Failed to link task to epic',
				message: errorMessage
			},
			{ status: 500 }
		);
	}
};

/**
 * DELETE /api/tasks/[id]/epic
 * Unlink a task from an epic by removing epic->child dependency
 * Body: { epicId: string }
 */
export const DELETE: RequestHandler = async ({ params, request }) => {
	const taskId = params.id;

	try {
		const body = await request.json();
		const { epicId } = body;

		if (!epicId) {
			return json(
				{ success: false, error: 'epicId is required' },
				{ status: 400 }
			);
		}

		// Get the task to find project path
		const task = getTaskById(taskId);
		if (!task) {
			return json(
				{ success: false, error: `Task '${taskId}' not found` },
				{ status: 404 }
			);
		}

		const projectPath = task.project_path;

		// Remove the dependency: epic depends on child
		try {
			removeDependency(epicId, taskId, projectPath);
		} catch (depError) {
			const errorMessage = depError instanceof Error ? depError.message : String(depError);
			// "not found" is fine - dependency already removed
			if (!errorMessage.includes('not found')) {
				console.error('[task-epic] removeDependency error:', errorMessage);
				return json(
					{ success: false, error: errorMessage },
					{ status: 500 }
				);
			}
		}

		// Invalidate caches
		invalidateCache.tasks();
		invalidateCache.agents();
		_resetTaskCache();

		console.log(`[task-epic] Unlinked task ${taskId} from epic ${epicId}`);

		return json({
			success: true,
			message: `Task ${taskId} unlinked from epic ${epicId}`,
			taskId,
			epicId
		});

	} catch (error) {
		console.error('[task-epic] Error unlinking task from epic:', error);
		return json(
			{
				success: false,
				error: 'Failed to unlink task from epic',
				message: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
};
