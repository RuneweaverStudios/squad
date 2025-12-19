/**
 * API endpoint for reading/writing CLAUDE.md file content
 *
 * GET /api/claude-md/content?path=<filepath> - Read file content
 * PUT /api/claude-md/content - Write file content (body: { path, content })
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFile, writeFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, basename } from 'path';
import { homedir } from 'os';

// Security: Only allow reading/writing CLAUDE.md files in specific locations
function isAllowedPath(filePath: string): boolean {
	const dashboardDir = process.cwd();
	const projectRoot = dirname(dashboardDir);
	const userClaudeDir = `${homedir()}/.claude`;

	// Must end with CLAUDE.md
	if (!filePath.endsWith('CLAUDE.md')) {
		return false;
	}

	// Must be in one of the allowed directories
	if (
		filePath.startsWith(projectRoot) ||
		filePath.startsWith(userClaudeDir)
	) {
		return true;
	}

	return false;
}

export const GET: RequestHandler = async ({ url }) => {
	const filePath = url.searchParams.get('path');

	if (!filePath) {
		return json({ error: 'Missing path parameter' }, { status: 400 });
	}

	if (!isAllowedPath(filePath)) {
		return json({ error: 'Access denied: invalid file path' }, { status: 403 });
	}

	if (!existsSync(filePath)) {
		return json({ error: 'File not found' }, { status: 404 });
	}

	try {
		const content = await readFile(filePath, 'utf-8');
		const stats = await stat(filePath);

		return json({
			path: filePath,
			content,
			lastModified: stats.mtime.toISOString(),
			size: stats.size
		});
	} catch (error) {
		console.error('Error reading CLAUDE.md file:', error);
		return json({ error: 'Failed to read file' }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { path: filePath, content } = body;

		if (!filePath || content === undefined) {
			return json({ error: 'Missing path or content in request body' }, { status: 400 });
		}

		if (!isAllowedPath(filePath)) {
			return json({ error: 'Access denied: invalid file path' }, { status: 403 });
		}

		// Write the file
		await writeFile(filePath, content, 'utf-8');

		// Get updated stats
		const stats = await stat(filePath);

		return json({
			success: true,
			path: filePath,
			lastModified: stats.mtime.toISOString(),
			size: stats.size
		});
	} catch (error) {
		console.error('Error writing CLAUDE.md file:', error);
		return json({ error: 'Failed to write file' }, { status: 500 });
	}
};
