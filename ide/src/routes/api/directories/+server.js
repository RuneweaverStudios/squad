/**
 * Directories API
 * GET /api/directories - List folders for project selection
 *
 * Query params:
 *   ?path=/custom/path - Scan a specific directory (default: ~/code)
 *
 * Returns: { directories: [{ path, name, isGitRepo, hasSquad }], basePath: string }
 *
 * Security: Only allows paths under user's home directory.
 * Used by CreateProjectDrawer path picker.
 */

import { json } from '@sveltejs/kit';
import { readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join, resolve, normalize } from 'path';

/**
 * Expand ~ to home directory and normalize path
 * @param {string} inputPath
 * @returns {string}
 */
function expandPath(inputPath) {
	if (inputPath.startsWith('~')) {
		return join(homedir(), inputPath.slice(1));
	}
	return resolve(inputPath);
}

/**
 * Check if path is safe (under home directory)
 * Case-insensitive on macOS/Windows where filesystems are case-insensitive
 * @param {string} targetPath
 * @returns {boolean}
 */
function isPathSafe(targetPath) {
	const home = homedir();
	const normalized = normalize(targetPath);
	// macOS and Windows have case-insensitive filesystems
	// Linux is case-sensitive, but being lenient here is safer than blocking valid paths
	return normalized.toLowerCase().startsWith(home.toLowerCase());
}

/**
 * Check if a directory is a git repository
 * @param {string} dirPath
 * @returns {boolean}
 */
function isGitRepo(dirPath) {
	return existsSync(join(dirPath, '.git'));
}

/**
 * Check if a directory has SQUAD initialized
 * @param {string} dirPath
 * @returns {boolean}
 */
function hasSquad(dirPath) {
	return existsSync(join(dirPath, '.squad'));
}

export async function GET({ url }) {
	try {
		// Get path from query param, default to ~/code
		const pathParam = url.searchParams.get('path');
		const scanDir = pathParam ? expandPath(pathParam) : join(homedir(), 'code');

		// Security check: only allow paths under home directory
		if (!isPathSafe(scanDir)) {
			return json(
				{
					directories: [],
					error: 'Access denied: path must be under home directory'
				},
				{ status: 403 }
			);
		}

		// Check if directory exists
		if (!existsSync(scanDir)) {
			return json({
				directories: [],
				basePath: scanDir,
				homeDir: homedir(),
				error: 'Path not found',
				message: `Directory does not exist: ${scanDir}`
			}, { status: 404 });
		}

		// Read all entries in the directory
		const entries = await readdir(scanDir, { withFileTypes: true });

		// Filter to directories only, excluding hidden folders
		const directories = entries
			.filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
			.map(entry => {
				const fullPath = join(scanDir, entry.name);
				return {
					path: fullPath,
					name: entry.name,
					isGitRepo: isGitRepo(fullPath),
					hasSquad: hasSquad(fullPath)
				};
			})
			// Sort alphabetically by name
			.sort((a, b) => a.name.localeCompare(b.name));

		return json({
			directories,
			basePath: scanDir
		});
	} catch (error) {
		console.error('[Directories API] Error:', error);
		return json(
			{
				directories: [],
				error: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
}
