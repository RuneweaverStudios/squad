import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { existsSync, statSync } from 'fs';
import { dirname, resolve, normalize } from 'path';
import { getProjectPath } from '$lib/utils/projectConfig';

/**
 * Validate a file path before creation
 *
 * GET /api/files/validate?path=/full/path&project=projectName&type=file|folder
 *
 * Returns:
 * - exists: boolean - whether the target already exists
 * - parentExists: boolean - whether the parent directory exists
 * - newDirs: string - directories that will be created (if any)
 * - valid: boolean - whether the path is valid for creation
 */
export const GET: RequestHandler = async ({ url }) => {
	const path = url.searchParams.get('path');
	const project = url.searchParams.get('project');
	const type = url.searchParams.get('type') || 'file';

	if (!path) {
		return json({ error: 'Missing required parameter: path' }, { status: 400 });
	}

	if (!project) {
		return json({ error: 'Missing required parameter: project' }, { status: 400 });
	}

	// Get project path
	const projectPath = getProjectPath(project);
	if (!projectPath) {
		return json({ error: `Project not found: ${project}` }, { status: 404 });
	}

	// Resolve and normalize the path
	const resolvedPath = resolve(path);
	const normalizedProjectPath = normalize(projectPath);

	// Security check: ensure path is within project
	if (!resolvedPath.startsWith(normalizedProjectPath)) {
		return json({ error: 'Path is outside project directory' }, { status: 403 });
	}

	// Check for path traversal attempts
	if (path.includes('..')) {
		return json({ error: 'Path traversal not allowed' }, { status: 403 });
	}

	try {
		// Check if the target path already exists
		const exists = existsSync(resolvedPath);

		if (exists) {
			const stats = statSync(resolvedPath);
			const isDirectory = stats.isDirectory();

			return json({
				exists: true,
				isDirectory,
				parentExists: true,
				newDirs: null,
				valid: true
			});
		}

		// Target doesn't exist - check parent directory
		const parentDir = dirname(resolvedPath);
		const parentExists = existsSync(parentDir);

		// Calculate what directories will need to be created
		let newDirs: string | null = null;
		if (!parentExists) {
			// Find the first existing parent
			let currentPath = parentDir;
			const dirsToCreate: string[] = [];

			while (currentPath !== normalizedProjectPath && !existsSync(currentPath)) {
				const dirName = currentPath.split('/').pop() || '';
				if (dirName) {
					dirsToCreate.unshift(dirName);
				}
				currentPath = dirname(currentPath);
			}

			if (dirsToCreate.length > 0) {
				newDirs = dirsToCreate.join('/');
			}
		}

		return json({
			exists: false,
			isDirectory: type === 'folder',
			parentExists,
			newDirs,
			valid: true
		});

	} catch (err) {
		console.error('[validate] Error:', err);
		return json({
			error: err instanceof Error ? err.message : 'Failed to validate path'
		}, { status: 500 });
	}
};
