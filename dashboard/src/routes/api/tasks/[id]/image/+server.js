/**
 * Task Image API Route
 * Stores and retrieves image attachments for tasks
 * Supports MULTIPLE images per task
 * Images are stored per-task and persist across browser sessions
 *
 * GET /api/tasks/[id]/image - Get all images for a task
 * PUT /api/tasks/[id]/image - Add an image to a task
 * DELETE /api/tasks/[id]/image - Remove a specific image from a task
 */
import { json } from '@sveltejs/kit';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Path to store task image mappings
const getImageStorePath = () => {
	const projectPath = process.cwd().replace('/dashboard', '');
	return join(projectPath, '.beads', 'task-images.json');
};

/**
 * @typedef {{ path: string; uploadedAt: string; id: string }} ImageData
 */

/**
 * Load task images from storage
 * @returns {Promise<Record<string, ImageData[]>>}
 */
async function loadTaskImages() {
	const storePath = getImageStorePath();
	try {
		if (!existsSync(storePath)) {
			return {};
		}
		const content = await readFile(storePath, 'utf-8');
		const data = JSON.parse(content);

		// Migrate old format (single object) to new format (array)
		/** @type {Record<string, ImageData[]>} */
		const migrated = {};
		for (const [taskId, value] of Object.entries(data)) {
			if (Array.isArray(value)) {
				migrated[taskId] = value;
			} else if (value && typeof value === 'object' && /** @type {{ path?: string }} */ (value).path) {
				// Old format: single object
				const oldValue = /** @type {{ path: string; uploadedAt?: string; id?: string }} */ (value);
				migrated[taskId] = [{
					path: oldValue.path,
					uploadedAt: oldValue.uploadedAt || new Date().toISOString(),
					id: oldValue.id || `img-migrated-${Date.now()}`
				}];
			}
		}
		return migrated;
	} catch (err) {
		console.error('Failed to load task images:', err);
		return {};
	}
}

/**
 * Save task images to storage
 * @param {Record<string, ImageData[]>} images
 */
async function saveTaskImages(images) {
	const storePath = getImageStorePath();
	try {
		// Ensure directory exists
		const storeDir = dirname(storePath);
		if (!existsSync(storeDir)) {
			await mkdir(storeDir, { recursive: true });
		}
		await writeFile(storePath, JSON.stringify(images, null, 2), 'utf-8');
	} catch (err) {
		console.error('Failed to save task images:', err);
		throw err;
	}
}

/**
 * Sync image paths to task's notes field so agents can see them via `bd show`
 * @param {string} taskId
 * @param {ImageData[]} taskImages
 */
async function syncNotesToTask(taskId, taskImages) {
	try {
		const projectPath = process.cwd().replace('/dashboard', '');

		if (!taskImages || taskImages.length === 0) {
			// Clear notes if no images
			const command = `cd "${projectPath}" && bd update ${taskId} --notes ""`;
			await execAsync(command);
			return;
		}

		// Build notes string with image paths
		const imageList = taskImages
			.map((img, i) => `  ${i + 1}. ${img.path}`)
			.join('\n');

		const notes = `📷 Attached screenshots:\n${imageList}\n(Use Read tool to view these images)`;

		// Escape for shell
		const escapedNotes = notes.replace(/"/g, '\\"');
		const command = `cd "${projectPath}" && bd update ${taskId} --notes "${escapedNotes}"`;

		await execAsync(command);
		console.log(`Synced ${taskImages.length} image(s) to task ${taskId} notes`);
	} catch (err) {
		console.error('Failed to sync notes to task:', err);
		// Don't throw - image storage succeeded, notes sync is secondary
	}
}

/**
 * GET - Get all images for a task
 */
/** @type {import('./$types').RequestHandler} */
export async function GET({ params }) {
	const taskId = params.id;

	try {
		const images = await loadTaskImages();
		const taskImages = images[taskId] || [];

		return json({
			taskId,
			images: taskImages
		});
	} catch (err) {
		console.error('Error getting task images:', err);
		return json({ error: 'Failed to get task images' }, { status: 500 });
	}
}

/**
 * PUT - Add an image to a task
 * Body: { path: string, id: string, action?: 'add' | 'replace' }
 * action='add' (default): Appends to existing images
 * action='replace': Replaces all images with this one
 */
/** @type {import('./$types').RequestHandler} */
export async function PUT({ params, request }) {
	const taskId = params.id;

	try {
		const body = await request.json();
		const { path, id, action = 'add' } = body;

		if (!path || typeof path !== 'string') {
			return json({ error: 'Image path is required' }, { status: 400 });
		}

		const imageId = id || `img-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
		const newImage = {
			path,
			uploadedAt: new Date().toISOString(),
			id: imageId
		};

		const images = await loadTaskImages();

		if (action === 'replace') {
			// Replace all images with this one
			images[taskId] = [newImage];
		} else {
			// Append to existing images
			const existingImages = images[taskId] || [];
			images[taskId] = [...existingImages, newImage];
		}

		await saveTaskImages(images);

		// Sync image paths to task notes so agents see them via `bd show`
		await syncNotesToTask(taskId, images[taskId]);

		return json({
			success: true,
			taskId,
			image: newImage,
			totalImages: images[taskId].length
		});
	} catch (err) {
		console.error('Error adding task image:', err);
		return json({ error: 'Failed to add task image' }, { status: 500 });
	}
}

/**
 * DELETE - Remove a specific image from a task
 * Body: { id: string } - ID of the image to remove
 * If no body/id provided, removes ALL images for the task
 */
/** @type {import('./$types').RequestHandler} */
export async function DELETE({ params, request }) {
	const taskId = params.id;

	try {
		let imageId = null;
		try {
			const body = await request.json();
			imageId = body.id;
		} catch {
			// No body - will remove all images
		}

		const images = await loadTaskImages();
		const taskImages = images[taskId] || [];

		if (taskImages.length === 0) {
			return json({ success: true, message: 'No images to remove' });
		}

		if (imageId) {
			// Remove specific image by ID
			const filteredImages = taskImages.filter(img => img.id !== imageId);
			if (filteredImages.length === taskImages.length) {
				return json({ success: true, message: 'Image not found' });
			}

			if (filteredImages.length > 0) {
				images[taskId] = filteredImages;
			} else {
				delete images[taskId];
			}

			await saveTaskImages(images);

			// Sync notes to reflect remaining images
			await syncNotesToTask(taskId, filteredImages);

			return json({
				success: true,
				message: `Image ${imageId} removed from task ${taskId}`,
				remainingImages: filteredImages.length
			});
		} else {
			// Remove all images for this task
			delete images[taskId];
			await saveTaskImages(images);

			// Clear notes since no images remain
			await syncNotesToTask(taskId, []);

			return json({
				success: true,
				message: `All images removed from task ${taskId}`
			});
		}
	} catch (err) {
		console.error('Error removing task image:', err);
		return json({ error: 'Failed to remove task image' }, { status: 500 });
	}
}
