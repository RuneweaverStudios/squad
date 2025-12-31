/**
 * File Search API
 * GET /api/files/search?project=<name>&query=<search>&limit=<max>
 *
 * Returns a list of files matching the search query (fuzzy match on filename).
 * Used by the Quick File Finder (Ctrl+P) feature.
 *
 * Response: { files: [{ path, name, folder }], count: number }
 */

import { json } from '@sveltejs/kit';
import { readdir, stat, realpath } from 'fs/promises';
import { existsSync, lstatSync } from 'fs';
import { join, resolve, basename, dirname, relative } from 'path';
import { homedir } from 'os';
import type { RequestHandler } from './$types';
import { getProjectPath } from '$lib/server/projectPaths';

interface FileResult {
	path: string;
	name: string;
	folder: string;
}

// Folders to skip during search (common large/generated directories)
const SKIP_FOLDERS = new Set([
	'node_modules',
	'.git',
	'.svelte-kit',
	'dist',
	'build',
	'.next',
	'.nuxt',
	'__pycache__',
	'.pytest_cache',
	'venv',
	'.venv',
	'target',
	'.cargo',
	'vendor',
	'.idea',
	'.vscode',
	'coverage',
	'.nyc_output'
]);

// Maximum files to return
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// Maximum depth to search
const MAX_DEPTH = 15;

// Maximum files to scan before stopping (performance limit)
const MAX_FILES_SCANNED = 10000;

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
 * Simple fuzzy match - checks if query characters appear in order in the filename
 */
function fuzzyMatch(query: string, filename: string): { match: boolean; score: number } {
	const queryLower = query.toLowerCase();
	const filenameLower = filename.toLowerCase();

	// Exact match gets highest score
	if (filenameLower === queryLower) {
		return { match: true, score: 1000 };
	}

	// Starts with query
	if (filenameLower.startsWith(queryLower)) {
		return { match: true, score: 500 + (queryLower.length / filenameLower.length) * 100 };
	}

	// Contains query as substring
	if (filenameLower.includes(queryLower)) {
		const index = filenameLower.indexOf(queryLower);
		return { match: true, score: 200 - index };
	}

	// Fuzzy character matching
	let queryIndex = 0;
	let score = 0;
	let lastMatchIndex = -1;

	for (let i = 0; i < filenameLower.length && queryIndex < queryLower.length; i++) {
		if (filenameLower[i] === queryLower[queryIndex]) {
			// Consecutive matches get bonus
			if (lastMatchIndex === i - 1) {
				score += 10;
			}
			// Matching at word boundary gets bonus
			if (i === 0 || /[^a-z0-9]/.test(filenameLower[i - 1])) {
				score += 5;
			}
			score += 1;
			lastMatchIndex = i;
			queryIndex++;
		}
	}

	if (queryIndex === queryLower.length) {
		// All query characters matched
		return { match: true, score };
	}

	return { match: false, score: 0 };
}

/**
 * Recursively scan directory for files
 */
async function scanDirectory(
	dir: string,
	projectPath: string,
	query: string,
	results: FileResult[],
	limit: number,
	filesScanned: { count: number },
	depth: number = 0
): Promise<void> {
	// Stop conditions
	if (depth > MAX_DEPTH) return;
	if (results.length >= limit) return;
	if (filesScanned.count >= MAX_FILES_SCANNED) return;

	try {
		const entries = await readdir(dir, { withFileTypes: true });

		for (const entry of entries) {
			// Stop if we have enough results
			if (results.length >= limit) return;
			if (filesScanned.count >= MAX_FILES_SCANNED) return;

			// Skip hidden files/folders
			if (entry.name.startsWith('.')) continue;

			// Skip known large directories
			if (entry.isDirectory() && SKIP_FOLDERS.has(entry.name)) continue;

			const entryPath = join(dir, entry.name);
			filesScanned.count++;

			if (entry.isDirectory()) {
				// Recurse into subdirectory
				await scanDirectory(
					entryPath,
					projectPath,
					query,
					results,
					limit,
					filesScanned,
					depth + 1
				);
			} else if (entry.isFile()) {
				// Check if file matches query
				const { match, score } = fuzzyMatch(query, entry.name);
				if (match) {
					const relativePath = relative(projectPath, entryPath);
					const folder = dirname(relativePath);
					results.push({
						path: relativePath,
						name: entry.name,
						folder: folder === '.' ? '' : folder
					});

					// Store score for sorting later
					(results[results.length - 1] as FileResult & { score?: number }).score = score;
				}
			}
		}
	} catch {
		// Ignore permission errors and other issues
	}
}

/**
 * GET /api/files/search
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const projectName = url.searchParams.get('project');
		const query = url.searchParams.get('query') || '';
		const limitParam = parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
		const limit = Math.min(Math.max(1, limitParam), MAX_LIMIT);

		if (!projectName) {
			return json({ error: 'Project name is required' }, { status: 400 });
		}

		// Get project path
		const projectInfo = await getProjectPath(projectName);
		if (!projectInfo.exists) {
			return json({ error: `Project '${projectName}' not found` }, { status: 404 });
		}

		const projectPath = expandHome(projectInfo.path);

		// If no query, return empty results (don't list all files)
		if (!query.trim()) {
			return json({
				files: [],
				count: 0,
				query: ''
			});
		}

		// Search for files
		const results: (FileResult & { score?: number })[] = [];
		const filesScanned = { count: 0 };

		await scanDirectory(
			projectPath,
			projectPath,
			query.trim(),
			results,
			limit * 2, // Get more results for sorting, then trim
			filesScanned
		);

		// Sort by score (highest first)
		results.sort((a, b) => (b.score || 0) - (a.score || 0));

		// Trim to limit and remove score
		const finalResults = results.slice(0, limit).map(({ path, name, folder }) => ({
			path,
			name,
			folder
		}));

		return json({
			files: finalResults,
			count: finalResults.length,
			query: query.trim(),
			scanned: filesScanned.count
		});
	} catch (error) {
		console.error('[Files Search API] Error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Search failed' },
			{ status: 500 }
		);
	}
};
