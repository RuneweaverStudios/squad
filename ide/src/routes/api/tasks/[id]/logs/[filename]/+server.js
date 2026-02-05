/**
 * Individual Log File API Endpoint
 *
 * GET /api/tasks/{id}/logs/{filename} - Returns content of a specific log file
 */

import { json, text } from '@sveltejs/kit';
import { readFile, stat } from 'fs/promises';
import { join, resolve } from 'path';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, url }) {
	const { id, filename } = params;
	const format = url.searchParams.get('format') || 'text';

	if (!id || !filename) {
		return json({ error: 'Task ID and filename are required' }, { status: 400 });
	}

	// Security: prevent path traversal
	if (filename.includes('..') || filename.includes('/')) {
		return json({ error: 'Invalid filename' }, { status: 400 });
	}

	try {
		// Get the project root (parent of ide)
		const projectRoot = resolve(process.cwd(), '..');
		const logPath = join(projectRoot, '.jat', 'logs', filename);

		// Check file exists
		try {
			await stat(logPath);
		} catch (err) {
			const error = /** @type {{ code?: string }} */ (err);
			if (error.code === 'ENOENT') {
				return json({ error: 'Log file not found' }, { status: 404 });
			}
			throw err;
		}

		// Read the log file
		const content = await readFile(logPath, 'utf-8');

		// Return based on format
		if (format === 'json') {
			// Return as JSON with metadata
			const stats = await stat(logPath);
			return json({
				task_id: id,
				filename: filename,
				size: stats.size,
				modifiedAt: stats.mtime.toISOString(),
				content: content,
				lines: content.split('\n').length
			});
		} else {
			// Return as plain text
			return text(content, {
				headers: {
					'Content-Type': 'text/plain; charset=utf-8',
					'Content-Disposition': `inline; filename="${filename}"`
				}
			});
		}

	} catch (error) {
		const err = /** @type {Error} */ (error);
		console.error('Error reading log file:', err);
		return json({
			error: 'Failed to read log file',
			message: err.message
		}, { status: 500 });
	}
}
