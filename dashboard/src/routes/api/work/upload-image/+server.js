/**
 * Image Upload API for Work Sessions
 * POST /api/work/upload-image
 *
 * Receives an image from the dashboard, saves it to a temp file,
 * and returns the file path so it can be sent to Claude Code.
 */

import { json } from '@sveltejs/kit';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	try {
		const formData = await request.formData();
		const image = formData.get('image');
		const sessionName = formData.get('sessionName');

		if (!image || !(image instanceof Blob)) {
			return json({
				error: 'Missing image',
				message: 'Image file is required'
			}, { status: 400 });
		}

		// Create a temp directory for pasted images
		const uploadDir = join(tmpdir(), 'claude-dashboard-images');
		if (!existsSync(uploadDir)) {
			await mkdir(uploadDir, { recursive: true });
		}

		// Generate unique filename
		const timestamp = Date.now();
		const randomId = Math.random().toString(36).substring(2, 8);
		const extension = image.type.split('/')[1] || 'png';
		const filename = `pasted-${sessionName || 'unknown'}-${timestamp}-${randomId}.${extension}`;
		const filePath = join(uploadDir, filename);

		// Write the image to disk
		const buffer = Buffer.from(await image.arrayBuffer());
		await writeFile(filePath, buffer);

		console.log(`[upload-image] Saved image: ${filePath} (${buffer.length} bytes)`);

		return json({
			success: true,
			filePath,
			filename,
			size: buffer.length,
			type: image.type,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error in POST /api/work/upload-image:', error);
		return json({
			error: 'Failed to upload image',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
