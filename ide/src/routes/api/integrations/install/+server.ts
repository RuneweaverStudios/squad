/**
 * Plugin Installation API
 *
 * POST /api/integrations/install
 * Clones a git repository into ~/.config/jat/ingest-plugins/{name}/
 * and validates the plugin format.
 *
 * Body: { repoUrl: string }
 * Returns: { success, plugin: { type, name, version } } or { success: false, error }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

const USER_PLUGINS_DIR = join(homedir(), '.config', 'jat', 'ingest-plugins');

/**
 * Extract a plugin name from a git repo URL.
 * e.g., https://github.com/user/jat-ingest-cloudflare → cloudflare
 *       https://github.com/user/jat-ingest-cloudflare.git → cloudflare
 */
function extractPluginName(repoUrl: string): string {
	let name = basename(repoUrl);
	// Remove .git suffix
	if (name.endsWith('.git')) name = name.slice(0, -4);
	// Remove common prefixes
	if (name.startsWith('jat-ingest-')) name = name.slice('jat-ingest-'.length);
	if (name.startsWith('jat-')) name = name.slice('jat-'.length);
	return name || 'plugin';
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { repoUrl } = body;

		if (!repoUrl) {
			return json(
				{ success: false, error: 'repoUrl is required' },
				{ status: 400 }
			);
		}

		// Basic URL validation
		if (!repoUrl.startsWith('https://') && !repoUrl.startsWith('git@')) {
			return json(
				{ success: false, error: 'repoUrl must start with https:// or git@' },
				{ status: 400 }
			);
		}

		const pluginName = extractPluginName(repoUrl);
		const pluginDir = join(USER_PLUGINS_DIR, pluginName);

		// Check if already installed
		if (existsSync(pluginDir)) {
			return json(
				{ success: false, error: `Plugin "${pluginName}" already installed at ${pluginDir}. Remove it first to reinstall.` },
				{ status: 409 }
			);
		}

		// Ensure plugins directory exists
		mkdirSync(USER_PLUGINS_DIR, { recursive: true });

		// Clone the repository
		try {
			execSync(`git clone --depth 1 ${repoUrl} ${pluginDir}`, {
				timeout: 30000,
				stdio: 'pipe'
			});
		} catch (err: any) {
			// Clean up partial clone
			if (existsSync(pluginDir)) {
				rmSync(pluginDir, { recursive: true, force: true });
			}
			return json(
				{ success: false, error: `Failed to clone repository: ${err?.stderr?.toString() || err?.message || 'unknown error'}` },
				{ status: 500 }
			);
		}

		// Run npm install if package.json exists
		const packageJsonPath = join(pluginDir, 'package.json');
		if (existsSync(packageJsonPath)) {
			try {
				execSync('npm install --production', {
					cwd: pluginDir,
					timeout: 60000,
					stdio: 'pipe'
				});
			} catch (err: any) {
				// Don't fail the install for npm errors - plugin might still work
				console.warn(`npm install warning for ${pluginName}: ${err?.message}`);
			}
		}

		// Validate the plugin
		const indexPath = join(pluginDir, 'index.js');
		if (!existsSync(indexPath)) {
			// Clean up invalid plugin
			rmSync(pluginDir, { recursive: true, force: true });
			return json(
				{ success: false, error: `Invalid plugin: no index.js found in repository` },
				{ status: 400 }
			);
		}

		// Try to load and validate metadata
		try {
			const mod = await import(indexPath);
			const metadata = mod.metadata;
			if (!metadata) {
				rmSync(pluginDir, { recursive: true, force: true });
				return json(
					{ success: false, error: 'Invalid plugin: no metadata export in index.js' },
					{ status: 400 }
				);
			}

			if (!metadata.type || !metadata.name) {
				rmSync(pluginDir, { recursive: true, force: true });
				return json(
					{ success: false, error: 'Invalid plugin: metadata must have type and name fields' },
					{ status: 400 }
				);
			}

			if (!mod.default) {
				rmSync(pluginDir, { recursive: true, force: true });
				return json(
					{ success: false, error: 'Invalid plugin: no default export (adapter class) in index.js' },
					{ status: 400 }
				);
			}

			return json({
				success: true,
				plugin: {
					type: metadata.type,
					name: metadata.name,
					version: metadata.version || '0.0.0',
					description: metadata.description || '',
					path: pluginDir
				}
			});
		} catch (err: any) {
			rmSync(pluginDir, { recursive: true, force: true });
			return json(
				{ success: false, error: `Invalid plugin: failed to load index.js: ${err?.message || 'unknown error'}` },
				{ status: 400 }
			);
		}
	} catch (error) {
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to install plugin'
			},
			{ status: 500 }
		);
	}
};
