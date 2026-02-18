/**
 * API endpoint to read a specific shared documentation file
 *
 * GET /api/docs/[filename]
 * Returns the markdown content of the specified file
 */

import { json, error } from '@sveltejs/kit';
import { readFileSync, existsSync, statSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import type { RequestHandler } from './$types';

/**
 * Get the shared docs directory path
 */
function getSharedDocsPath(): string {
	return join(homedir(), 'code', 'squad', 'shared');
}

/**
 * Validate filename to prevent path traversal
 */
function validateFilename(filename: string): string | null {
	// Must end with .md
	if (!filename.endsWith('.md')) {
		return 'Filename must end with .md';
	}

	// No path traversal
	if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
		return 'Invalid filename: path traversal not allowed';
	}

	// Must be alphanumeric with hyphens/underscores
	const nameWithoutExt = basename(filename, '.md');
	if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(nameWithoutExt)) {
		return 'Invalid filename format';
	}

	return null;
}

/**
 * Extract title from markdown content
 */
function extractTitle(content: string, filename: string): string {
	const match = content.match(/^#\s+(.+)$/m);
	if (match) {
		return match[1].trim();
	}
	return basename(filename, '.md')
		.split('-')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

/**
 * GET /api/docs/[filename]
 *
 * Get the content of a specific documentation file
 */
export const GET: RequestHandler = async ({ params }) => {
	const { filename } = params;

	// Validate filename
	const validationError = validateFilename(filename);
	if (validationError) {
		throw error(400, validationError);
	}

	const docsDir = getSharedDocsPath();
	const filePath = join(docsDir, filename);

	if (!existsSync(filePath)) {
		throw error(404, `Documentation file not found: ${filename}`);
	}

	try {
		const content = readFileSync(filePath, 'utf-8');
		const stats = statSync(filePath);

		return json({
			filename,
			name: basename(filename, '.md'),
			title: extractTitle(content, filename),
			content,
			size: stats.size,
			modifiedAt: stats.mtime.toISOString(),
			path: filePath
		});
	} catch (err) {
		console.error(`Error reading doc ${filename}:`, err);
		throw error(500, `Failed to read documentation: ${(err as Error).message}`);
	}
};

/**
 * PUT /api/docs/[filename]
 *
 * Save content to a documentation file
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	const { filename } = params;

	// Validate filename
	const validationError = validateFilename(filename);
	if (validationError) {
		throw error(400, validationError);
	}

	// Parse request body
	let body: { content: string };
	try {
		body = await request.json();
	} catch (err) {
		throw error(400, 'Invalid JSON body');
	}

	if (typeof body.content !== 'string') {
		throw error(400, 'Content must be a string');
	}

	const docsDir = getSharedDocsPath();
	const filePath = join(docsDir, filename);

	if (!existsSync(filePath)) {
		throw error(404, `Documentation file not found: ${filename}`);
	}

	try {
		writeFileSync(filePath, body.content, 'utf-8');
		const stats = statSync(filePath);

		return json({
			success: true,
			filename,
			modifiedAt: stats.mtime.toISOString(),
			size: stats.size
		});
	} catch (err) {
		console.error(`Error writing doc ${filename}:`, err);
		throw error(500, `Failed to save documentation: ${(err as Error).message}`);
	}
};
