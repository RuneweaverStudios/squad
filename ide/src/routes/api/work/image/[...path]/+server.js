/**
 * File Serve API
 * GET /api/work/image/[...path]
 *
 * Serves files from the temp upload directory.
 * Supports images, PDFs, text files, code files, and data files.
 * Path should be the full file path or just the filename.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';

/**
 * Get persistent storage directory for task images
 * Uses ~/.local/share/squad/task-images/ for persistence across reboots
 * @returns {string} - Path to persistent upload directory
 */
function getPersistentUploadDir() {
	return join(homedir(), '.local', 'share', 'squad', 'task-images');
}

/**
 * Get content type from file extension
 * @param {string} ext - File extension (without dot)
 * @returns {string} - MIME type
 */
function getContentType(ext) {
	/** @type {Record<string, string>} */
	const contentTypes = {
		// Images
		png: 'image/png',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		gif: 'image/gif',
		webp: 'image/webp',
		svg: 'image/svg+xml',
		bmp: 'image/bmp',
		ico: 'image/x-icon',

		// PDF
		pdf: 'application/pdf',

		// Text
		txt: 'text/plain',
		md: 'text/markdown',
		markdown: 'text/markdown',
		rst: 'text/plain',
		log: 'text/plain',

		// Code
		js: 'text/javascript',
		mjs: 'text/javascript',
		ts: 'text/typescript',
		tsx: 'text/typescript',
		jsx: 'text/javascript',
		html: 'text/html',
		htm: 'text/html',
		css: 'text/css',
		py: 'text/x-python',
		java: 'text/x-java',
		c: 'text/x-c',
		cpp: 'text/x-c++',
		h: 'text/x-c',
		go: 'text/x-go',
		rs: 'text/x-rust',
		rb: 'text/x-ruby',
		php: 'text/x-php',
		sh: 'application/x-sh',
		bash: 'application/x-sh',
		sql: 'text/x-sql',
		svelte: 'text/html',
		vue: 'text/html',

		// Data
		json: 'application/json',
		csv: 'text/csv',
		xml: 'application/xml',
		yaml: 'text/yaml',
		yml: 'text/yaml',
		toml: 'text/toml',

		// Documents
		doc: 'application/msword',
		docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		xls: 'application/vnd.ms-excel',
		xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		ppt: 'application/vnd.ms-powerpoint',
		pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
	};

	return contentTypes[ext] || 'application/octet-stream';
}

/**
 * Determine if the content should be displayed inline
 * @param {string} contentType - MIME type
 * @returns {boolean}
 */
function shouldDisplayInline(contentType) {
	// Display images, PDFs, and text-based files inline
	return (
		contentType.startsWith('image/') ||
		contentType === 'application/pdf' ||
		contentType.startsWith('text/')
	);
}

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, url }) {
	try {
		// SvelteKit [...path] strips leading /, restore it for absolute paths
		const rawPath = params.path;
		const requestedPath = rawPath.startsWith('home/') || rawPath.startsWith('tmp/')
			? '/' + rawPath
			: rawPath;

		// Determine actual file path - check persistent storage
		// Location: ~/.local/share/squad/task-images/
		let filePath;
		if (requestedPath.startsWith('/tmp') || requestedPath.startsWith(homedir())) {
			// Full path provided
			filePath = requestedPath;
		} else {
			// Just filename provided - look in persistent upload directory
			const persistentDir = getPersistentUploadDir();
			filePath = join(persistentDir, basename(requestedPath));
		}

		if (!existsSync(filePath)) {
			return new Response('File not found', { status: 404 });
		}

		// Security: Ensure path is within allowed directories
		// Only allow persistent storage - no legacy temp directories
		const allowedDirs = [
			getPersistentUploadDir(),
			join(homedir(), '.local', 'share', 'squad', 'ingest-files')
		];

		const isAllowed = allowedDirs.some((dir) => filePath.startsWith(dir));
		if (!isAllowed) {
			return new Response('Access denied', { status: 403 });
		}

		const buffer = await readFile(filePath);

		// Determine content type from extension
		const ext = filePath.split('.').pop()?.toLowerCase() || '';
		const contentType = getContentType(ext);

		// Check if download is requested
		const download = url.searchParams.get('download') === 'true';
		const disposition = download || !shouldDisplayInline(contentType) ? 'attachment' : 'inline';

		return new Response(buffer, {
			headers: {
				'Content-Type': contentType,
				'Content-Disposition': `${disposition}; filename="${basename(filePath)}"`,
				'Cache-Control': 'public, max-age=3600'
			}
		});
	} catch (error) {
		console.error('Error serving file:', error);
		return new Response('Failed to serve file', { status: 500 });
	}
}
