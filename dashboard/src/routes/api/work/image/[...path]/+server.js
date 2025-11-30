/**
 * Image Serve API
 * GET /api/work/image/[...path]
 *
 * Serves images from the temp upload directory.
 * Path should be the full file path or just the filename.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename } from 'path';
import { tmpdir } from 'os';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params }) {
	try {
		const requestedPath = params.path;

		// Determine actual file path
		let filePath;
		if (requestedPath.startsWith('/tmp')) {
			// Full path provided
			filePath = requestedPath;
		} else {
			// Just filename provided - look in upload directory
			const uploadDir = join(tmpdir(), 'claude-dashboard-images');
			filePath = join(uploadDir, basename(requestedPath));
		}

		if (!existsSync(filePath)) {
			return new Response('Image not found', { status: 404 });
		}

		// Security: Ensure path is within allowed directories
		const uploadDir = join(tmpdir(), 'claude-dashboard-images');
		if (!filePath.startsWith(uploadDir) && !filePath.startsWith('/tmp/claude-dashboard-images')) {
			return new Response('Access denied', { status: 403 });
		}

		const buffer = await readFile(filePath);

		// Determine content type from extension
		const ext = filePath.split('.').pop()?.toLowerCase();
		const contentTypes = {
			png: 'image/png',
			jpg: 'image/jpeg',
			jpeg: 'image/jpeg',
			gif: 'image/gif',
			webp: 'image/webp',
			svg: 'image/svg+xml'
		};
		const contentType = contentTypes[ext || ''] || 'application/octet-stream';

		return new Response(buffer, {
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'public, max-age=3600'
			}
		});
	} catch (error) {
		console.error('Error serving image:', error);
		return new Response('Failed to serve image', { status: 500 });
	}
}
