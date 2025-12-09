/**
 * File Upload API for Work Sessions
 * POST /api/work/upload-image (legacy name, supports all file types)
 *
 * Receives a file from the dashboard, saves it to a temp directory,
 * and returns the file path so it can be sent to Claude Code.
 *
 * Supports: Images, PDFs, text files, code files, data files
 */

import { json } from '@sveltejs/kit';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname } from 'path';
import { tmpdir } from 'os';

/**
 * Get file extension from MIME type or filename
 * @param {string} mimeType - MIME type of the file
 * @param {string} [filename] - Original filename (optional)
 * @returns {string} - File extension without dot
 */
function getExtension(mimeType, filename) {
	// Try to get extension from filename first
	if (filename) {
		const ext = extname(filename).slice(1).toLowerCase();
		if (ext) return ext;
	}

	// Fall back to MIME type mapping
	/** @type {Record<string, string>} */
	const mimeToExt = {
		// Images
		'image/png': 'png',
		'image/jpeg': 'jpg',
		'image/gif': 'gif',
		'image/webp': 'webp',
		'image/svg+xml': 'svg',
		'image/bmp': 'bmp',
		// PDF
		'application/pdf': 'pdf',
		// Text
		'text/plain': 'txt',
		'text/markdown': 'md',
		// Code
		'text/javascript': 'js',
		'application/javascript': 'js',
		'text/typescript': 'ts',
		'text/html': 'html',
		'text/css': 'css',
		// Data
		'application/json': 'json',
		'text/csv': 'csv',
		'application/xml': 'xml',
		'text/xml': 'xml',
		'text/yaml': 'yaml'
	};

	return mimeToExt[mimeType] || mimeType.split('/')[1] || 'bin';
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	try {
		const formData = await request.formData();
		// Accept both 'image' (legacy) and 'file' field names
		const file = formData.get('file') || formData.get('image');
		const sessionName = formData.get('sessionName');
		const originalFilename = formData.get('filename');

		if (!file || !(file instanceof Blob)) {
			return json(
				{
					error: 'Missing file',
					message: 'File is required'
				},
				{ status: 400 }
			);
		}

		// Create a temp directory for uploaded files
		const uploadDir = join(tmpdir(), 'claude-dashboard-files');
		if (!existsSync(uploadDir)) {
			await mkdir(uploadDir, { recursive: true });
		}

		// Generate unique filename
		const timestamp = Date.now();
		const randomId = Math.random().toString(36).substring(2, 8);
		const extension = getExtension(file.type, originalFilename?.toString());
		const filename = `upload-${sessionName || 'unknown'}-${timestamp}-${randomId}.${extension}`;
		const filePath = join(uploadDir, filename);

		// Write the file to disk
		const buffer = Buffer.from(await file.arrayBuffer());
		await writeFile(filePath, buffer);

		console.log(`[upload-file] Saved: ${filePath} (${buffer.length} bytes, ${file.type})`);

		return json({
			success: true,
			filePath,
			filename,
			originalFilename: originalFilename?.toString() || null,
			size: buffer.length,
			type: file.type,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error in POST /api/work/upload-image:', error);
		return json(
			{
				error: 'Failed to upload file',
				message: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
}
