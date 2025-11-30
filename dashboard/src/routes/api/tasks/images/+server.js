/**
 * Task Images List API Route
 * Returns all task images in one call for efficient loading
 * Supports multiple images per task (array format)
 *
 * GET /api/tasks/images - Get all task images
 */
import { json } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

// Path to store task image mappings
const getImageStorePath = () => {
	const projectPath = process.cwd().replace('/dashboard', '');
	return join(projectPath, '.beads', 'task-images.json');
};

/**
 * GET - Get all task images
 * Returns: { images: { [taskId]: ImageData[] } }
 * Handles migration from old format (single object) to new format (array)
 */
/** @type {import('./$types').RequestHandler} */
export async function GET() {
	try {
		const storePath = getImageStorePath();

		if (!existsSync(storePath)) {
			return json({ images: {} });
		}

		const content = await readFile(storePath, 'utf-8');
		const data = JSON.parse(content);

		// Migrate old format (single object) to new format (array)
		const migratedImages = {};
		for (const [taskId, value] of Object.entries(data)) {
			if (Array.isArray(value)) {
				migratedImages[taskId] = value;
			} else if (value && typeof value === 'object' && value.path) {
				// Old format: single object - convert to array
				migratedImages[taskId] = [{
					...value,
					id: value.id || `img-migrated-${Date.now()}`
				}];
			}
		}

		return json({ images: migratedImages });
	} catch (err) {
		console.error('Error loading task images:', err);
		return json({ error: 'Failed to load task images', images: {} }, { status: 500 });
	}
}
