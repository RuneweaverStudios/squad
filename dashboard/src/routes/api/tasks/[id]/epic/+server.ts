/**
 * Task Epic API - Link or unlink a task to/from an epic
 *
 * POST /api/tasks/[id]/epic - Link task to an epic
 * DELETE /api/tasks/[id]/epic - Unlink task from an epic
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getTaskById } from '../../../../../../../lib/beads.js';
import { invalidateCache } from '$lib/server/cache.js';
import { _resetTaskCache } from '../../../agents/+server.js';

const execAsync = promisify(exec);

/**
 * Escape a string for safe shell usage
 */
function escapeForShell(str: string): string {
	return str.replace(/'/g, "'\\''");
}

/**
 * Check if an epic exists and is open
 */
async function isEpicOpen(epicId: string, projectPath?: string): Promise<boolean> {
	try {
		let command = `bd show '${escapeForShell(epicId)}' --json`;
		if (projectPath) {
			command = `cd '${escapeForShell(projectPath)}' && ${command}`;
		}

		const { stdout } = await execAsync(command, { timeout: 10000 });
		const epics = JSON.parse(stdout.trim());
		const epic = Array.isArray(epics) ? epics[0] : epics;

		if (!epic) return false;
		return epic.status !== 'closed' && epic.issue_type === 'epic';
	} catch {
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

		// Verify the epic exists and is open
		const epicOpen = await isEpicOpen(epicId, projectPath);
		if (!epicOpen) {
			return json(
				{ success: false, error: `Epic '${epicId}' not found or is closed` },
				{ status: 400 }
			);
		}

		// CRITICAL: Dependency direction is epic depends on child
		// This makes child READY (can be worked on) and epic BLOCKED (until children complete)
		// The command is: bd dep add [A] [B] meaning "A depends on B"
		const command = `cd '${escapeForShell(projectPath)}' && bd dep add '${escapeForShell(epicId)}' '${escapeForShell(taskId)}'`;

		const { stderr } = await execAsync(command, { timeout: 10000 });

		// Check for errors
		if (stderr && (stderr.includes('Error:') || stderr.includes('error:'))) {
			// Handle "already linked" case gracefully (UNIQUE constraint)
			if (stderr.includes('UNIQUE constraint failed')) {
				console.log(`[task-epic] Task ${taskId} already linked to epic ${epicId}`);
				return json({
					success: true,
					message: `Task ${taskId} is already linked to epic ${epicId}`,
					taskId,
					epicId,
					alreadyLinked: true
				});
			}

			console.error('[task-epic] bd dep add error:', stderr);
			return json(
				{ success: false, error: stderr.trim() },
				{ status: 500 }
			);
		}

		// Invalidate caches
		invalidateCache.tasks();
		invalidateCache.agents();
		_resetTaskCache();

		console.log(`[task-epic] Linked task ${taskId} to epic ${epicId}`);

		return json({
			success: true,
			message: `Task ${taskId} linked to epic ${epicId}`,
			taskId,
			epicId
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
		const command = `cd '${escapeForShell(projectPath)}' && bd dep remove '${escapeForShell(epicId)}' '${escapeForShell(taskId)}'`;

		const { stderr } = await execAsync(command, { timeout: 10000 });

		// Check for errors (but not "not found" which is fine)
		if (stderr && stderr.includes('Error:') && !stderr.includes('not found')) {
			console.error('[task-epic] bd dep remove error:', stderr);
			return json(
				{ success: false, error: stderr.trim() },
				{ status: 500 }
			);
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
