/**
 * API endpoint for listing directory contents
 *
 * GET /api/files?project=<name>&path=<dir>
 * - Returns array of {name, type: 'file'|'folder', size, modified, path}
 * - Validates project exists in ~/.config/jat/projects.json
 * - Resolves project path and validates requested path is within project
 * - Security: Prevent path traversal (../), resolve symlinks and verify target
 * - Error handling: 404 if path not found, 403 if outside project
 */

import { json, error } from '@sveltejs/kit';
import { readdir, stat, realpath } from 'fs/promises';
import { existsSync, lstatSync } from 'fs';
import { join, resolve, relative, normalize, basename } from 'path';
import { homedir } from 'os';
import type { RequestHandler } from './$types';
import { getProjectPath } from '$lib/server/projectPaths';

interface DirectoryEntry {
	name: string;
	type: 'file' | 'folder';
	size: number;
	modified: string;
	path: string;
}

/**
 * Expand ~ to home directory
 */
function expandHome(path: string): string {
	if (path.startsWith('~')) {
		return path.replace(/^~/, homedir());
	}
	return path;
}

/**
 * Check if a path is safely within the project directory
 * Resolves symlinks and checks the real path is within bounds
 */
async function isPathWithinProject(requestedPath: string, projectPath: string): Promise<boolean> {
	try {
		// Normalize both paths
		const normalizedProject = resolve(expandHome(projectPath));
		const normalizedRequested = resolve(requestedPath);

		// Quick check: does the normalized path start with project path?
		if (!normalizedRequested.startsWith(normalizedProject)) {
			return false;
		}

		// If the path exists, resolve symlinks and check again
		if (existsSync(normalizedRequested)) {
			const realRequested = await realpath(normalizedRequested);
			const realProject = await realpath(normalizedProject);
			return realRequested.startsWith(realProject);
		}

		// Path doesn't exist yet - still check string prefix
		return true;
	} catch {
		return false;
	}
}

/**
 * Check for path traversal attempts
 */
function hasPathTraversal(path: string): boolean {
	// Normalize and check for .. after normalization
	const normalized = normalize(path);

	// Check if normalized path still contains traversal
	if (normalized.includes('..')) {
		return true;
	}

	// Check raw path for various traversal patterns
	const dangerousPatterns = [
		'..', // Parent directory
		'\0', // Null byte injection
		'%2e%2e', // URL encoded ..
		'%252e%252e', // Double URL encoded
		'....', // Some systems allow this
		'.\\', // Windows style
		'./' // Explicit current dir can be used in attacks
	];

	const lowerPath = path.toLowerCase();
	for (const pattern of dangerousPatterns) {
		if (lowerPath.includes(pattern)) {
			return true;
		}
	}

	return false;
}

/**
 * GET /api/files
 *
 * Query params:
 *   - project: Project name (required) - must exist in ~/.config/jat/projects.json
 *   - path: Relative path within project (optional, defaults to project root)
 *   - showHidden: Include hidden files/folders (default: false)
 */
export const GET: RequestHandler = async ({ url }) => {
	// Get project name (required)
	const projectName = url.searchParams.get('project');
	if (!projectName) {
		throw error(400, 'Missing required parameter: project');
	}

	// Get relative path (optional)
	const relativePath = url.searchParams.get('path') || '';

	// Show hidden files (optional)
	const showHidden = url.searchParams.get('showHidden') === 'true';

	// Check for path traversal in the input
	if (hasPathTraversal(relativePath)) {
		throw error(403, 'Path traversal not allowed');
	}

	// Look up project
	const projectInfo = await getProjectPath(projectName);

	if (!projectInfo.exists) {
		throw error(404, `Project not found: ${projectName}`);
	}

	const projectPath = expandHome(projectInfo.path);
	const targetPath = relativePath ? join(projectPath, relativePath) : projectPath;

	// Verify target is within project bounds
	if (!(await isPathWithinProject(targetPath, projectPath))) {
		throw error(403, 'Access denied: path is outside project directory');
	}

	// Check if path exists
	if (!existsSync(targetPath)) {
		throw error(404, `Path not found: ${relativePath || '/'}`);
	}

	// Check if path is a directory
	try {
		const targetStat = await stat(targetPath);
		if (!targetStat.isDirectory()) {
			throw error(400, 'Path is not a directory. Use /api/files/content to read files.');
		}
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		throw error(500, `Failed to stat path: ${(err as Error).message}`);
	}

	// Read directory contents
	try {
		const entries = await readdir(targetPath, { withFileTypes: true });
		const results: DirectoryEntry[] = [];

		for (const entry of entries) {
			// Skip hidden files unless requested
			if (!showHidden && entry.name.startsWith('.')) {
				continue;
			}

			const entryPath = join(targetPath, entry.name);
			const entryRelativePath = relativePath
				? join(relativePath, entry.name)
				: entry.name;

			// Determine type
			let entryType: 'file' | 'folder';
			let size = 0;
			let modified = new Date().toISOString();

			try {
				// Use lstat first to not follow symlinks
				const lstats = lstatSync(entryPath);

				if (lstats.isSymbolicLink()) {
					// For symlinks, check what they point to
					try {
						const realPath = await realpath(entryPath);
						// Verify symlink target is within project
						if (!(await isPathWithinProject(realPath, projectPath))) {
							// Skip symlinks that point outside project
							continue;
						}
						const realStats = await stat(entryPath);
						entryType = realStats.isDirectory() ? 'folder' : 'file';
						size = realStats.size;
						modified = realStats.mtime.toISOString();
					} catch {
						// Broken symlink - skip it
						continue;
					}
				} else if (lstats.isDirectory()) {
					entryType = 'folder';
					size = lstats.size;
					modified = lstats.mtime.toISOString();
				} else if (lstats.isFile()) {
					entryType = 'file';
					size = lstats.size;
					modified = lstats.mtime.toISOString();
				} else {
					// Skip other types (sockets, devices, etc.)
					continue;
				}
			} catch {
				// Skip entries we can't stat
				continue;
			}

			results.push({
				name: entry.name,
				type: entryType,
				size,
				modified,
				path: entryRelativePath
			});
		}

		// Sort: folders first, then alphabetically
		results.sort((a, b) => {
			if (a.type !== b.type) {
				return a.type === 'folder' ? -1 : 1;
			}
			return a.name.localeCompare(b.name);
		});

		return json({
			project: projectName,
			projectPath: projectInfo.path,
			path: relativePath || '/',
			entries: results,
			count: results.length
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		throw error(500, `Failed to read directory: ${(err as Error).message}`);
	}
};
