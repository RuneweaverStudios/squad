/**
 * Task Migration API Route
 * Migrates a task from one project to another by:
 * 1. Creating a new task in the target project with all the original data
 * 2. Closing the original task with a migration note
 *
 * POST /api/tasks/{taskId}/migrate
 * Body: { targetProject: "chimaro" }
 * Response: { success: true, oldTaskId: "jat-abc", newTaskId: "chimaro-xyz", targetProject: "chimaro" }
 */
import { json } from '@sveltejs/kit';
import { getTaskById, getProjects } from '../../../../../../../lib/beads.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { existsSync } from 'fs';
import { readFile as readFileAsync, writeFile as writeFileAsync } from 'fs/promises';

const execAsync = promisify(exec);

/**
 * Get the project prefix from a task ID
 * @param {string} taskId - Task ID like "jat-abc"
 * @returns {string|null} Project prefix like "jat" or null if invalid
 */
function getProjectFromTaskId(taskId) {
	if (!taskId || typeof taskId !== 'string') return null;
	const dashIndex = taskId.indexOf('-');
	if (dashIndex === -1 || dashIndex === 0) return null;
	return taskId.substring(0, dashIndex);
}

/**
 * Get project path from project name
 * @param {string} projectName - Project name like "chimaro"
 * @returns {string|null} Project path or null if not found
 */
function getProjectPath(projectName) {
	const projects = getProjects();
	const project = projects.find((p) => p.name === projectName);
	return project ? project.path : null;
}

/**
 * Escape shell argument safely
 * @param {string} arg - Argument to escape
 * @returns {string} Escaped argument
 */
function escapeShellArg(arg) {
	if (!arg) return '""';
	// Replace single quotes with escaped version and wrap in single quotes
	return "'" + arg.replace(/'/g, "'\\''") + "'";
}

/**
 * POST handler - Migrate task to a different project
 */
export async function POST({ params, request }) {
	const { id: taskId } = params;

	try {
		// Parse request body
		const body = await request.json();
		const { targetProject } = body;

		if (!targetProject) {
			return json(
				{ error: true, message: 'Missing required field: targetProject' },
				{ status: 400 }
			);
		}

		// Get current task to find source project
		const task = await getTaskById(taskId);
		if (!task) {
			return json({ error: true, message: `Task not found: ${taskId}` }, { status: 404 });
		}

		const sourceProject = getProjectFromTaskId(taskId);
		if (!sourceProject) {
			return json(
				{ error: true, message: `Cannot determine source project from task ID: ${taskId}` },
				{ status: 400 }
			);
		}

		// Check if task is already in target project
		if (sourceProject === targetProject) {
			return json(
				{ error: true, message: `Task is already in project: ${targetProject}` },
				{ status: 400 }
			);
		}

		// Get project paths
		const sourcePath = getProjectPath(sourceProject);
		const targetPath = getProjectPath(targetProject);

		if (!sourcePath) {
			return json(
				{ error: true, message: `Source project not found: ${sourceProject}` },
				{ status: 404 }
			);
		}

		if (!targetPath) {
			return json(
				{ error: true, message: `Target project not found: ${targetProject}` },
				{ status: 404 }
			);
		}

		console.log(`Migrating task ${taskId} from ${sourceProject} (${sourcePath}) to ${targetProject} (${targetPath})`);

		// Step 1: Create the new task in the target project
		// Build the bd create command with all the task data
		const descriptionWithNote = `[Migrated from ${taskId}]\n\n${task.description || ''}`;
		const title = escapeShellArg(task.title || 'Untitled');
		const description = escapeShellArg(descriptionWithNote);
		const type = task.issue_type || 'task';
		const priority = task.priority ?? 2;
		const status = task.status === 'closed' ? 'closed' : 'open'; // Preserve closed state, otherwise open
		const assignee = task.assignee ? `--assignee ${escapeShellArg(task.assignee)}` : '';
		const labels = task.labels && task.labels.length > 0
			? `--labels ${escapeShellArg(task.labels.join(','))}`
			: '';

		const createCommand = `cd "${targetPath}" && bd create ${title} --type ${type} --priority ${priority} --description ${description} ${assignee} ${labels} --json 2>&1`;

		console.log(`Running: ${createCommand}`);

		let newTaskId = null;
		try {
			const { stdout: createOutput } = await execAsync(createCommand, { timeout: 30000 });
			console.log('Create output:', createOutput);

			// Parse JSON output to get the new task ID
			try {
				const createdTask = JSON.parse(createOutput);
				if (createdTask && createdTask.id) {
					newTaskId = createdTask.id;
				} else if (Array.isArray(createdTask) && createdTask[0]?.id) {
					newTaskId = createdTask[0].id;
				}
			} catch (parseError) {
				// Try to extract ID from text output
				const idMatch = createOutput.match(/Created(?:\s+issue)?:?\s*(\S+-[a-z0-9]+)/i);
				if (idMatch) {
					newTaskId = idMatch[1];
				}
			}
		} catch (createError) {
			console.error('Create error:', createError);
			const execErr = /** @type {{ stderr?: string, message?: string }} */ (createError);
			return json(
				{
					error: true,
					message: 'Failed to create task in target project',
					details: execErr.stderr || execErr.message
				},
				{ status: 500 }
			);
		}

		if (!newTaskId) {
			return json(
				{
					error: true,
					message: 'Task created but could not determine new task ID'
				},
				{ status: 500 }
			);
		}

		console.log(`Created new task: ${newTaskId}`);

		// Step 2: Migrate dependencies (cross-project deps are preserved as-is)
		if (task.depends_on && task.depends_on.length > 0) {
			console.log(`Migrating ${task.depends_on.length} dependencies...`);
			for (const dep of task.depends_on) {
				const depId = dep.id || dep;
				try {
					const depCommand = `cd "${targetPath}" && bd dep add ${newTaskId} ${depId} 2>&1`;
					await execAsync(depCommand, { timeout: 10000 });
					console.log(`Added dependency: ${newTaskId} -> ${depId}`);
				} catch (depError) {
					const err = /** @type {Error} */ (depError);
					console.error(`Failed to add dependency ${depId}:`, err.message);
					// Non-fatal - continue with other dependencies
				}
			}
		}

		// Step 3: Update the new task's status if it was in_progress
		if (task.status === 'in_progress') {
			const updateCommand = `cd "${targetPath}" && bd update ${newTaskId} --status in_progress 2>&1`;
			try {
				await execAsync(updateCommand, { timeout: 10000 });
				console.log(`Updated ${newTaskId} status to in_progress`);
			} catch (updateError) {
				console.error('Failed to update status:', updateError);
				// Non-fatal - continue with migration
			}
		}

		// Step 4: Close the original task with a migration note
		const closeReason = escapeShellArg(`Migrated to ${newTaskId} in ${targetProject}`);
		const closeCommand = `cd "${sourcePath}" && bd close ${taskId} --reason ${closeReason} 2>&1`;

		try {
			await execAsync(closeCommand, { timeout: 10000 });
			console.log(`Closed original task ${taskId}`);
		} catch (closeError) {
			console.error('Failed to close original task:', closeError);
			// Non-fatal - the migration still succeeded
		}

		// Step 5: Migrate task attachments (if any)
		await migrateTaskAttachments(taskId, newTaskId, sourcePath, targetPath);

		// Return success with old and new task IDs
		return json({
			success: true,
			oldTaskId: taskId,
			newTaskId: newTaskId,
			sourceProject: sourceProject,
			targetProject: targetProject,
			message: `Task migrated successfully: ${taskId} -> ${newTaskId}`
		});
	} catch (error) {
		console.error('Migration error:', error);
		const execErr = /** @type {{ stderr?: string, stdout?: string, message?: string }} */ (error);
		return json(
			{
				error: true,
				message: execErr.message || 'Unknown error during migration',
				details: execErr.stderr || execErr.stdout || ''
			},
			{ status: 500 }
		);
	}
}

/**
 * Migrate task attachments from source to target project
 * Copies both the metadata and the actual image files
 * @param {string} oldTaskId - Original task ID
 * @param {string} newTaskId - New task ID after migration
 * @param {string} sourcePath - Source project path
 * @param {string} targetPath - Target project path
 */
async function migrateTaskAttachments(oldTaskId, newTaskId, sourcePath, targetPath) {
	try {
		const sourceImagesPath = join(sourcePath, '.beads', 'task-images.json');
		const targetImagesPath = join(targetPath, '.beads', 'task-images.json');

		// Check if source has attachments for this task
		if (!existsSync(sourceImagesPath)) {
			return;
		}

		const sourceContent = await readFileAsync(sourceImagesPath, 'utf-8');
		const sourceImages = JSON.parse(sourceContent);

		if (!sourceImages[oldTaskId]) {
			return; // No attachments for this task
		}

		// Load or create target images store
		/** @type {Record<string, object | object[]>} */
		let targetImages = {};
		if (existsSync(targetImagesPath)) {
			const targetContent = await readFileAsync(targetImagesPath, 'utf-8');
			targetImages = JSON.parse(targetContent);
		}

		// Get the attachments for this task
		const attachments = Array.isArray(sourceImages[oldTaskId])
			? sourceImages[oldTaskId]
			: [sourceImages[oldTaskId]];

		// Copy each image file and update paths
		const migratedAttachments = [];
		for (const attachment of attachments) {
			if (!attachment || !attachment.path) continue;

			const oldPath = attachment.path;
			if (!existsSync(oldPath)) {
				console.warn(`Attachment file not found: ${oldPath}`);
				continue;
			}

			// Create target images directory for this task
			const targetImagesDir = join(targetPath, '.beads', 'images', newTaskId);
			await execAsync(`mkdir -p "${targetImagesDir}"`);

			// Get just the filename
			const filename = oldPath.split('/').pop();
			const newPath = join(targetImagesDir, filename);

			// Copy the file
			try {
				await execAsync(`cp "${oldPath}" "${newPath}"`);
				console.log(`Copied attachment: ${oldPath} -> ${newPath}`);

				// Update attachment with new path
				migratedAttachments.push({
					...attachment,
					path: newPath
				});

				// Delete the old file
				await execAsync(`rm "${oldPath}"`);
			} catch (copyErr) {
				const err = /** @type {Error} */ (copyErr);
				console.error(`Failed to copy attachment ${oldPath}:`, err.message);
				// Keep the old path as fallback
				migratedAttachments.push(attachment);
			}
		}

		// Save migrated attachments to target
		if (migratedAttachments.length > 0) {
			/** @type {Record<string, object | object[]>} */
			const typedTargetImages = targetImages;
			typedTargetImages[newTaskId] = migratedAttachments.length === 1
				? migratedAttachments[0]
				: migratedAttachments;
			await writeFileAsync(targetImagesPath, JSON.stringify(typedTargetImages, null, 2), 'utf-8');
		}

		// Remove from source images
		delete sourceImages[oldTaskId];
		await writeFileAsync(sourceImagesPath, JSON.stringify(sourceImages, null, 2), 'utf-8');

		// Try to clean up empty source directory
		const sourceImagesDir = join(sourcePath, '.beads', 'images', oldTaskId);
		if (existsSync(sourceImagesDir)) {
			try {
				await execAsync(`rmdir "${sourceImagesDir}" 2>/dev/null || true`);
			} catch (e) {
				// Directory not empty or doesn't exist, ignore
			}
		}

		console.log(`Migrated ${migratedAttachments.length} attachment(s) for ${oldTaskId} -> ${newTaskId}`);
	} catch (err) {
		const error = /** @type {Error} */ (err);
		console.error('Failed to migrate attachments:', error.message);
		// Don't fail the migration if attachments fail
	}
}
