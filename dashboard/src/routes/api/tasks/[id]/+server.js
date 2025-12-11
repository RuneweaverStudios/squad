/**
 * Task Detail API Route
 * Provides individual task details including dependencies and enables
 */
import { json } from '@sveltejs/kit';
import { getTaskById } from '../../../../../../lib/beads.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { invalidateCache } from '$lib/server/cache.js';
import { _resetTaskCache } from '../../../api/agents/+server.js';

const execAsync = promisify(exec);

// Path to task images store
const getImageStorePath = () => {
	const projectPath = process.cwd().replace('/dashboard', '');
	return join(projectPath, '.beads', 'task-images.json');
};

/**
 * Clean up attachments for a task
 * Removes image files and clears entry from task-images.json
 * @param {string} taskId
 */
async function cleanupTaskAttachments(taskId) {
	try {
		const storePath = getImageStorePath();
		if (!existsSync(storePath)) return;

		const content = await readFile(storePath, 'utf-8');
		const images = JSON.parse(content);

		if (!images[taskId]) return;

		// Delete actual image files
		const taskImages = Array.isArray(images[taskId]) ? images[taskId] : [images[taskId]];
		for (const img of taskImages) {
			if (img.path && existsSync(img.path)) {
				try {
					await unlink(img.path);
					console.log(`Deleted attachment: ${img.path}`);
				} catch (err) {
					const error = /** @type {Error} */ (err);
					console.error(`Failed to delete attachment ${img.path}:`, error.message);
				}
			}
		}

		// Remove from task-images.json
		delete images[taskId];
		await writeFile(storePath, JSON.stringify(images, null, 2), 'utf-8');
		console.log(`Cleaned up attachments for task ${taskId}`);
	} catch (err) {
		console.error('Error cleaning up attachments:', err);
	}
}

/** @type {import('./$types').RequestHandler} */
export async function GET({ params }) {
	const taskId = params.id;

	const task = getTaskById(taskId);

	if (!task) {
		return json({ error: 'Task not found' }, { status: 404 });
	}

	return json({ task });
}

/** @type {import('./$types').RequestHandler} */
export async function PUT({ params, request }) {
	const taskId = params.id;
	const updates = await request.json();

	try {
		// Get existing task to find project path
		const existingTask = getTaskById(taskId);
		if (!existingTask) {
			return json({ error: 'Task not found' }, { status: 404 });
		}

		// Build bd update command
		const args = [];

		// Update title if changed
		if (updates.title !== undefined) {
			args.push(`--title "${updates.title.replace(/"/g, '\\"')}"`);
		}

		// Update description if changed
		if (updates.description !== undefined) {
			args.push(`--description "${updates.description.replace(/"/g, '\\"')}"`);
		}

		// Update priority if changed
		if (updates.priority !== undefined) {
			args.push(`--priority ${updates.priority}`);
		}

		// Update status if changed
		if (updates.status !== undefined) {
			args.push(`--status ${updates.status}`);
		}

		// Update assignee if changed (including clearing with null)
		if (updates.assignee !== undefined) {
			const sanitizedAssignee = updates.assignee ? updates.assignee.trim() : '';
			args.push(`--assignee "${sanitizedAssignee.replace(/"/g, '\\"')}"`);
		}

		// Execute bd update command in correct project directory
		if (args.length > 0) {
			const projectPath = existingTask.project_path;
			const command = `cd "${projectPath}" && bd update ${taskId} ${args.join(' ')}`;
			const { stdout, stderr } = await execAsync(command);

			// Check for errors in stderr (bd CLI uses stderr for some output like warnings)
			if (stderr && stderr.includes('Error:')) {
				console.error('bd update error:', stderr);
				return json({ error: 'Failed to update task', details: stderr }, { status: 500 });
			}
		}

		// Invalidate related caches (both apiCache and module-level task cache in agents endpoint)
		invalidateCache.tasks();
		invalidateCache.agents();
		_resetTaskCache();

		// Get updated task
		const updatedTask = getTaskById(taskId);

		if (!updatedTask) {
			return json({ error: 'Task not found after update' }, { status: 404 });
		}

		return json({ task: updatedTask });
	} catch (error) {
		const err = /** @type {Error} */ (error);
		console.error('Error updating task:', err);
		return json({ error: 'Failed to update task', details: err.message }, { status: 500 });
	}
}

/**
 * Update task fields (partial updates supported)
 * Supports updating: title, description, priority, status, assignee, dependencies
 * Note: Labels are NOT supported by bd update command (only settable during creation)
 * @type {import('./$types').RequestHandler}
 */
export async function PATCH({ params, request }) {
	const taskId = params.id;

	try {
		// Check if task exists first
		const existingTask = getTaskById(taskId);
		if (!existingTask) {
			return json(
				{ error: true, message: `Task '${taskId}' not found` },
				{ status: 404 }
			);
		}

		// Parse request body
		const updates = await request.json();

		// Validate that at least one field is provided
		if (!updates || Object.keys(updates).length === 0) {
			return json(
				{ error: true, message: 'No update fields provided. Provide at least one field to update.' },
				{ status: 400 }
			);
		}

		// Validate individual fields if provided
		const validationErrors = [];

		// Validate title (if provided, must be non-empty string)
		if (updates.title !== undefined) {
			if (typeof updates.title !== 'string' || updates.title.trim() === '') {
				validationErrors.push('title: Must be a non-empty string');
			}
		}

		// Validate priority (if provided, must be 0-3)
		if (updates.priority !== undefined && updates.priority !== null) {
			const priority = parseInt(updates.priority);
			if (isNaN(priority) || priority < 0 || priority > 3) {
				validationErrors.push('priority: Must be 0 (P0), 1 (P1), 2 (P2), or 3 (P3)');
			}
		}

		// Validate status (if provided, must be valid enum value)
		if (updates.status !== undefined) {
			const validStatuses = ['open', 'in_progress', 'blocked', 'closed', 'reopened'];
			if (!validStatuses.includes(updates.status)) {
				validationErrors.push(`status: Must be one of: ${validStatuses.join(', ')}`);
			}
		}

		// Note: Labels are not supported by bd update command (skip validation)
		// Labels can only be set during task creation with bd create --labels

		// Validate dependencies (if provided, must be array of task IDs)
		if (updates.dependencies !== undefined && updates.dependencies !== null) {
			if (!Array.isArray(updates.dependencies)) {
				validationErrors.push('dependencies: Must be an array of task IDs (e.g., ["jat-abc", "jat-xyz"])');
			}
		}

		// Return validation errors if any
		if (validationErrors.length > 0) {
			return json(
				{
					error: true,
					message: 'Validation failed',
					errors: validationErrors
				},
				{ status: 400 }
			);
		}

		// Build bd update command with provided fields
		const args = [];

		// Update title
		if (updates.title !== undefined) {
			const sanitizedTitle = updates.title.trim();
			args.push(`--title "${sanitizedTitle.replace(/"/g, '\\"')}"`);
		}

		// Update description
		if (updates.description !== undefined) {
			const sanitizedDesc = updates.description ? updates.description.trim() : '';
			args.push(`--description "${sanitizedDesc.replace(/"/g, '\\"')}"`);
		}

		// Update priority
		if (updates.priority !== undefined && updates.priority !== null) {
			args.push(`--priority ${parseInt(updates.priority)}`);
		}

		// Update status
		if (updates.status !== undefined) {
			args.push(`--status ${updates.status}`);
		}

		// Update assignee
		if (updates.assignee !== undefined) {
			const sanitizedAssignee = updates.assignee ? updates.assignee.trim() : '';
			args.push(`--assignee "${sanitizedAssignee.replace(/"/g, '\\"')}"`);
		}

		// Update notes (used for image attachments and other metadata)
		if (updates.notes !== undefined) {
			const sanitizedNotes = updates.notes ? updates.notes.trim() : '';
			args.push(`--notes "${sanitizedNotes.replace(/"/g, '\\"')}"`);
		}

		// Note: Labels are NOT supported by bd update command
		// Labels can only be set during task creation (bd create --labels)
		// To update labels, you would need to use a different bd command (if available)
		// For now, we skip labels updates in PATCH requests

		// Execute bd update command (only if we have args)
		if (args.length > 0) {
			const projectPath = existingTask.project_path;
			const command = `cd "${projectPath}" && bd update ${taskId} ${args.join(' ')}`;
			const { stdout, stderr } = await execAsync(command);

			// Check for errors in stderr (bd CLI uses stderr for some output)
			if (stderr && stderr.includes('Error:')) {
				console.error('bd update error:', stderr);
				return json(
					{
						error: true,
						message: 'Failed to update task',
						details: stderr.trim()
					},
					{ status: 500 }
				);
			}
		}

		// Handle dependencies separately using bd dep add/remove
		// Note: bd CLI doesn't support --deps flag for updates, need to use bd dep add
		if (updates.dependencies !== undefined && Array.isArray(updates.dependencies)) {
			// Get current dependencies - cast task to include dependencies property
			/** @type {{ dependencies?: string[] }} */
			const taskWithDeps = /** @type {{ dependencies?: string[] }} */ (existingTask);
			/** @type {string[]} */
			const currentDeps = taskWithDeps.dependencies || [];
			/** @type {string[]} */
			const newDeps = updates.dependencies;

			// Find deps to add (in new but not in current)
			const depsToAdd = newDeps.filter((/** @type {string} */ d) => !currentDeps.includes(d));

			// Find deps to remove (in current but not in new)
			const depsToRemove = currentDeps.filter((/** @type {string} */ d) => !newDeps.includes(d));

			// Add new dependencies
			for (const depId of depsToAdd) {
				try {
					const projectPath = existingTask.project_path;
					const addDepCommand = `cd "${projectPath}" && bd dep add ${taskId} ${depId}`;
					await execAsync(addDepCommand);
				} catch (err) {
					const error = /** @type {Error} */ (err);
					console.error(`Failed to add dependency ${depId}:`, error.message);
					// Continue with other deps even if one fails
				}
			}

			// Remove old dependencies
			for (const depId of depsToRemove) {
				try {
					const projectPath = existingTask.project_path;
					const removeDepCommand = `cd "${projectPath}" && bd dep remove ${taskId} ${depId}`;
					await execAsync(removeDepCommand);
				} catch (err) {
					const error = /** @type {Error} */ (err);
					console.error(`Failed to remove dependency ${depId}:`, error.message);
					// Continue with other deps even if one fails
				}
			}
		}

		// Handle review_override update (stored in notes field via bd-set-review-override)
		if (updates.review_override !== undefined) {
			try {
				const projectPath = existingTask.project_path;
				const value = updates.review_override;
				if (value === 'always_review' || value === 'always_auto') {
					const overrideCommand = `cd "${projectPath}" && ${process.env.HOME}/code/jat/tools/bd-set-review-override ${taskId} ${value}`;
					await execAsync(overrideCommand);
				} else if (value === null || value === '' || value === 'null') {
					// Clear the override
					const clearCommand = `cd "${projectPath}" && ${process.env.HOME}/code/jat/tools/bd-set-review-override ${taskId} --clear`;
					await execAsync(clearCommand);
				}
			} catch (err) {
				const error = /** @type {Error} */ (err);
				console.error('Failed to update review_override:', error.message);
				// Continue without failing - main update succeeded
			}
		}

		// Invalidate related caches (both apiCache and module-level task cache in agents endpoint)
		invalidateCache.tasks();
		invalidateCache.agents();
		_resetTaskCache();

		// Fetch and return updated task
		const updatedTask = getTaskById(taskId);

		if (!updatedTask) {
			return json(
				{
					error: true,
					message: 'Task was updated but failed to retrieve updated data'
				},
				{ status: 500 }
			);
		}

		return json({
			success: true,
			task: updatedTask,
			message: `Task ${taskId} updated successfully`
		});

	} catch (err) {
		console.error('Error updating task:', err);

		// Check if it's a validation error from bd CLI
		const execErr = /** @type {{ stderr?: string, message?: string }} */ (err);
		if (execErr.stderr && execErr.stderr.includes('Error:')) {
			return json(
				{
					error: true,
					message: execErr.stderr.trim(),
					type: 'validation_error'
				},
				{ status: 400 }
			);
		}

		return json(
			{
				error: true,
				message: execErr.message || 'Internal server error updating task',
				type: 'server_error'
			},
			{ status: 500 }
		);
	}
}

/**
 * Delete task (closes task in Beads)
 * @type {import('./$types').RequestHandler}
 */
export async function DELETE({ params }) {
	const taskId = params.id;

	try {
		// Check if task exists first
		const existingTask = getTaskById(taskId);
		if (!existingTask) {
			return json(
				{ error: true, message: `Task '${taskId}' not found` },
				{ status: 404 }
			);
		}

		// Close the task using bd close command in the correct project directory
		// Note: We use "close" rather than "delete" to preserve task history
		const projectPath = existingTask.project_path;
		const command = `cd "${projectPath}" && bd close ${taskId} --reason "Deleted via dashboard"`;
		const { stdout, stderr } = await execAsync(command);

		// Check for errors in stderr
		if (stderr && stderr.includes('Error:')) {
			console.error('bd close error:', stderr);
			return json(
				{
					error: true,
					message: 'Failed to delete task',
					details: stderr.trim()
				},
				{ status: 500 }
			);
		}

		// Permanently delete attachments since this is a DELETE (not just close)
		await cleanupTaskAttachments(taskId);

		// Invalidate related caches (both apiCache and module-level task cache in agents endpoint)
		invalidateCache.tasks();
		invalidateCache.agents();
		_resetTaskCache();

		return json({
			success: true,
			message: `Task ${taskId} deleted successfully`
		});

	} catch (err) {
		console.error('Error deleting task:', err);

		// Check if it's a validation error from bd CLI
		const execErr = /** @type {{ stderr?: string, message?: string }} */ (err);
		if (execErr.stderr && execErr.stderr.includes('Error:')) {
			return json(
				{
					error: true,
					message: execErr.stderr.trim(),
					type: 'validation_error'
				},
				{ status: 400 }
			);
		}

		return json(
			{
				error: true,
				message: execErr.message || 'Internal server error deleting task',
				type: 'server_error'
			},
			{ status: 500 }
		);
	}
}
