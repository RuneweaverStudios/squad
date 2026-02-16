/**
 * Tools Content API - Read and write tool file contents
 *
 * GET /api/tools/content?path=mail/am-register
 * Returns file content for the specified tool path.
 *
 * PUT /api/tools/content?path=mail/am-register
 * Body: { content: string }
 * Saves content to the tool file.
 *
 * Security:
 * - Path must be within JAT directory
 * - No path traversal allowed
 * - Only allows editing known tool directories
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFile, writeFile } from 'fs/promises';
import { join, normalize, dirname } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';

// Allowed tool directories (relative to JAT root)
const ALLOWED_DIRECTORIES = ['tools/mail', 'tools/browser', 'tools/core', 'tools/scripts', 'tools/media', 'tools/signal', 'commands/jat'];

/**
 * Find JAT installation directory (same as in parent +server.ts)
 */
function findJatPath(): string | null {
	const candidates = [
		join(homedir(), 'code', 'jat'),
		join(homedir(), 'projects', 'jat'),
		join(homedir(), '.local', 'share', 'jat'),
		join(process.cwd(), '..'),
		process.cwd().replace('/ide', '')
	];

	for (const candidate of candidates) {
		if (
			existsSync(candidate) &&
			existsSync(join(candidate, 'tools', 'mail')) &&
			existsSync(join(candidate, 'tools', 'browser'))
		) {
			return candidate;
		}
	}

	return null;
}

/**
 * Validate that path is safe and within allowed directories
 */
function validatePath(
	path: string,
	jatPath: string
): { valid: boolean; absolutePath?: string; error?: string } {
	if (!path) {
		return { valid: false, error: 'Path is required' };
	}

	// Normalize and check for traversal
	const normalizedPath = normalize(path);
	if (normalizedPath.includes('..') || normalizedPath.startsWith('/')) {
		return { valid: false, error: 'Invalid path: traversal not allowed' };
	}

	// Check if path is in an allowed directory
	const isAllowed = ALLOWED_DIRECTORIES.some(
		(dir) => normalizedPath.startsWith(dir + '/') || normalizedPath === dir
	);

	if (!isAllowed) {
		return { valid: false, error: 'Path not in allowed directories' };
	}

	// Resolve absolute path
	const absolutePath = join(jatPath, normalizedPath);

	// Verify it's still within JAT directory (belt and suspenders)
	const resolvedJat = normalize(jatPath);
	const resolvedPath = normalize(absolutePath);
	if (!resolvedPath.startsWith(resolvedJat)) {
		return { valid: false, error: 'Path escapes JAT directory' };
	}

	return { valid: true, absolutePath };
}

/**
 * GET - Read tool content
 */
export const GET: RequestHandler = async ({ url }) => {
	const path = url.searchParams.get('path');

	if (!path) {
		return json({ error: 'path parameter is required' }, { status: 400 });
	}

	const jatPath = findJatPath();
	if (!jatPath) {
		return json({ error: 'JAT installation not found' }, { status: 404 });
	}

	const validation = validatePath(path, jatPath);
	if (!validation.valid) {
		return json({ error: validation.error }, { status: 403 });
	}

	const absolutePath = validation.absolutePath!;

	if (!existsSync(absolutePath)) {
		return json({ error: 'File not found' }, { status: 404 });
	}

	try {
		const content = await readFile(absolutePath, 'utf-8');

		return json({
			path,
			absolutePath,
			content,
			size: content.length
		});
	} catch (err) {
		console.error('[Tools Content API] Read error:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to read file' },
			{ status: 500 }
		);
	}
};

/**
 * PUT - Write tool content
 */
export const PUT: RequestHandler = async ({ url, request }) => {
	const path = url.searchParams.get('path');

	if (!path) {
		return json({ error: 'path parameter is required' }, { status: 400 });
	}

	const jatPath = findJatPath();
	if (!jatPath) {
		return json({ error: 'JAT installation not found' }, { status: 404 });
	}

	const validation = validatePath(path, jatPath);
	if (!validation.valid) {
		return json({ error: validation.error }, { status: 403 });
	}

	const absolutePath = validation.absolutePath!;

	// Parse request body
	let body: { content?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	if (typeof body.content !== 'string') {
		return json({ error: 'content field is required' }, { status: 400 });
	}

	// Check if file exists (we only allow editing existing files, not creating new ones)
	if (!existsSync(absolutePath)) {
		return json({ error: 'File not found. Creating new tools is not supported.' }, { status: 404 });
	}

	try {
		await writeFile(absolutePath, body.content, 'utf-8');

		return json({
			success: true,
			path,
			absolutePath,
			size: body.content.length
		});
	} catch (err) {
		console.error('[Tools Content API] Write error:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to write file' },
			{ status: 500 }
		);
	}
};
