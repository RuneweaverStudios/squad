/**
 * Media File Serving Endpoint
 * GET /api/files/media?project=<name>&path=<file>
 *
 * Serves binary media files (images, videos, audio) with proper content types.
 * Does NOT parse or validate content - streams raw bytes to the client.
 *
 * Security:
 * - Validates path is under project directory
 * - Prevents path traversal attacks
 * - Only serves known media file types
 */

import { error } from '@sveltejs/kit';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join, resolve, normalize, extname } from 'path';
import type { RequestHandler } from './$types';

// Maximum media file size (50MB for videos)
const MAX_MEDIA_SIZE = 50 * 1024 * 1024;

// MIME types for known media extensions
const MEDIA_TYPES: Record<string, string> = {
	// Images
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.bmp': 'image/bmp',
	'.avif': 'image/avif',

	// Videos
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.ogg': 'video/ogg',
	'.mov': 'video/quicktime',
	'.avi': 'video/x-msvideo',
	'.mkv': 'video/x-matroska',

	// Audio
	'.mp3': 'audio/mpeg',
	'.wav': 'audio/wav',
	'.flac': 'audio/flac',
	'.aac': 'audio/aac',
	'.m4a': 'audio/mp4',
	'.opus': 'audio/opus',

	// Documents (PDFs can be previewed in browser)
	'.pdf': 'application/pdf'
};

// Path to SQUAD config for project lookup
const CONFIG_FILE = join(homedir(), '.config', 'squad', 'projects.json');

/**
 * Read SQUAD projects config
 */
async function readSquadConfig(): Promise<{ projects?: Record<string, { path?: string }> } | null> {
	try {
		if (!existsSync(CONFIG_FILE)) {
			return null;
		}
		const content = await readFile(CONFIG_FILE, 'utf-8');
		return JSON.parse(content);
	} catch {
		return null;
	}
}

/**
 * Get project path from name
 */
async function getProjectPath(projectName: string): Promise<string | null> {
	const config = await readSquadConfig();

	// Check SQUAD config first
	if (config?.projects?.[projectName]?.path) {
		return config.projects[projectName].path.replace(/^~/, homedir());
	}

	// Fallback to ~/code/{project}
	const defaultPath = join(homedir(), 'code', projectName);
	if (existsSync(defaultPath)) {
		return defaultPath;
	}

	return null;
}

/**
 * Validate and resolve file path, preventing path traversal
 */
function validatePath(
	projectPath: string,
	filePath: string
): { valid: boolean; resolved?: string; error?: string } {
	try {
		// Normalize and resolve the full path
		const resolved = resolve(projectPath, filePath);
		const normalizedProject = normalize(projectPath);

		// Ensure the resolved path is under the project directory
		if (!resolved.startsWith(normalizedProject + '/') && resolved !== normalizedProject) {
			return { valid: false, error: 'Path traversal detected' };
		}

		return { valid: true, resolved };
	} catch {
		return { valid: false, error: 'Invalid path' };
	}
}

/**
 * Check if a file extension is a supported media type
 */
function isMediaFile(filePath: string): boolean {
	const ext = extname(filePath).toLowerCase();
	return ext in MEDIA_TYPES;
}

/**
 * Get MIME type for a file
 */
function getMimeType(filePath: string): string | null {
	const ext = extname(filePath).toLowerCase();
	return MEDIA_TYPES[ext] || null;
}

/**
 * GET /api/files/media - Serve media file
 */
export const GET: RequestHandler = async ({ url }) => {
	const projectName = url.searchParams.get('project');
	const filePath = url.searchParams.get('path');

	if (!projectName) {
		throw error(400, 'Project name is required');
	}

	if (!filePath) {
		throw error(400, 'File path is required');
	}

	// Get project path
	const projectPath = await getProjectPath(projectName);
	if (!projectPath) {
		throw error(404, `Project '${projectName}' not found`);
	}

	// Validate and resolve path
	const validation = validatePath(projectPath, filePath);
	if (!validation.valid) {
		throw error(403, validation.error || 'Invalid path');
	}

	const resolvedPath = validation.resolved!;

	// Check if file exists
	if (!existsSync(resolvedPath)) {
		throw error(404, 'File not found');
	}

	// Verify it's a media file
	if (!isMediaFile(resolvedPath)) {
		throw error(415, 'Not a supported media file type');
	}

	// Get MIME type
	const mimeType = getMimeType(resolvedPath);
	if (!mimeType) {
		throw error(415, 'Unknown media type');
	}

	// Get file stats
	const stats = await stat(resolvedPath);

	if (!stats.isFile()) {
		throw error(400, 'Path is not a file');
	}

	// Check file size
	if (stats.size > MAX_MEDIA_SIZE) {
		throw error(413, `File too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB exceeds ${MAX_MEDIA_SIZE / 1024 / 1024}MB limit`);
	}

	// Read the file as binary
	const buffer = await readFile(resolvedPath);

	// Return the file with proper headers
	return new Response(buffer, {
		status: 200,
		headers: {
			'Content-Type': mimeType,
			'Content-Length': stats.size.toString(),
			'Cache-Control': 'private, max-age=3600', // Cache for 1 hour
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
