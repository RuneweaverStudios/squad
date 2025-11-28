/**
 * Avatar API Endpoint
 *
 * GET /api/avatar/[name] → Serve SVG avatar for agent (auto-generates if missing)
 *
 * Returns:
 * - 200: SVG content with proper Content-Type and caching
 * - 500: Failed to generate or read avatar
 */

import { error } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { env } from '$env/dynamic/private';

const execAsync = promisify(exec);
const AVATARS_DIR = '/home/jw/code/jat/avatars';
const AVATAR_GENERATE_SCRIPT = '/home/jw/code/jat/media/avatar-generate';

// Track in-flight generation requests to prevent duplicates
const generatingAvatars = new Set();

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, url }) {
	const { name } = params;
	const version = url.searchParams.get('v');
	console.log(`[Avatar API] Request: ${name} (v=${version})`);


	// Sanitize name to prevent path traversal
	if (!name || name.includes('/') || name.includes('..') || name.includes('\\')) {
		throw error(400, 'Invalid avatar name');
	}

	const avatarPath = `${AVATARS_DIR}/${name}.svg`;

	// Check if avatar exists
	if (!existsSync(avatarPath)) {
		// Auto-generate avatar if missing
		if (generatingAvatars.has(name)) {
			// Already generating - return 202 Accepted
			return new Response('Avatar generation in progress', {
				status: 202,
				headers: { 'Content-Type': 'text/plain' }
			});
		}

		try {
			generatingAvatars.add(name);
			console.log(`Auto-generating avatar for: ${name}`);

			// Use ANTHROPIC_API_KEY from SvelteKit's env (loaded from .env)
			const apiKey = env.ANTHROPIC_API_KEY;
			if (!apiKey) {
				console.warn('ANTHROPIC_API_KEY not set - using fallback avatar');
				throw new Error('No API key');
			}

			await execAsync(`${AVATAR_GENERATE_SCRIPT} "${name}"`, {
				timeout: 30000, // 30 second timeout
				env: { ...process.env, ANTHROPIC_API_KEY: apiKey }
			});

			console.log(`Avatar generated for: ${name}`);
		} catch (err) {
			console.error(`Failed to generate avatar for ${name}:`, err.message);
			// Return a simple fallback SVG instead of error
			const fallbackSvg = generateFallbackSvg(name);
			return new Response(fallbackSvg, {
				status: 200,
				headers: {
					'Content-Type': 'image/svg+xml',
					'Cache-Control': 'public, max-age=60' // Short cache for fallback
				}
			});
		} finally {
			generatingAvatars.delete(name);
		}
	}

	try {
		const svgContent = await readFile(avatarPath, 'utf-8');
		console.log(`[Avatar API] Serving ${name}: ${svgContent.length} bytes, hasText=${svgContent.includes('<text')}`);

		return new Response(svgContent, {
			status: 200,
			headers: {
				'Content-Type': 'image/svg+xml',
				'Cache-Control': 'public, max-age=86400',  // 1 day instead of 1 year
				'Vary': 'Accept'  // Vary by Accept header for proper cache handling
			}
		});
	} catch (err) {
		console.error(`Error reading avatar ${name}:`, err);
		throw error(500, 'Failed to read avatar');
	}
}

/**
 * Generate a simple fallback SVG with initials
 */
function generateFallbackSvg(name) {
	// Extract initials from PascalCase name (e.g., "BlueStream" -> "BS")
	const initials = name.replace(/([a-z])([A-Z])/g, '$1 $2')
		.split(' ')
		.map(w => w[0])
		.join('')
		.substring(0, 2)
		.toUpperCase();

	// Generate a color based on name hash
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = name.charCodeAt(i) + ((hash << 5) - hash);
	}
	const hue = Math.abs(hash) % 360;

	return `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" rx="4" fill="hsl(${hue}, 40%, 25%)"/>
  <text x="16" y="21" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="hsl(${hue}, 50%, 70%)">${initials}</text>
</svg>`;
}
