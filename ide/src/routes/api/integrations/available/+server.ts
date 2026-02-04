/**
 * Available Integrations API
 *
 * GET /api/integrations/available
 * Returns all discovered plugins from built-in and user directories.
 *
 * Response: { success, plugins: PluginInfo[] }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Built-in adapters directory (relative to repo root) */
function getBuiltinDir(): string {
	// Navigate from ide/src/routes/api/integrations/available/ up to repo root
	const repoRoot = join(__dirname, '..', '..', '..', '..', '..', '..');
	return join(repoRoot, 'tools', 'ingest', 'adapters');
}

/** User plugins directory */
const USER_PLUGINS_DIR = join(homedir(), '.config', 'jat', 'ingest-plugins');

interface PluginInfo {
	type: string;
	name: string;
	description: string;
	version: string;
	path: string;
	isBuiltin: boolean;
	enabled: boolean;
	error?: string;
	configFields?: any[];
	itemFields?: any[];
}

/**
 * List subdirectories in a directory. Returns empty array if directory doesn't exist.
 */
function listPluginDirs(dir: string): string[] {
	if (!existsSync(dir)) return [];
	try {
		return readdirSync(dir)
			.filter(name => !name.startsWith('.'))
			.map(name => join(dir, name))
			.filter(path => {
				try { return statSync(path).isDirectory(); }
				catch { return false; }
			});
	} catch {
		return [];
	}
}

/**
 * Probe a single plugin directory for metadata (without fully loading).
 */
async function probePlugin(pluginPath: string, isBuiltin: boolean): Promise<PluginInfo> {
	const dirName = pluginPath.split('/').pop() || pluginPath;
	const indexPath = join(pluginPath, 'index.js');

	if (!existsSync(indexPath)) {
		return {
			type: dirName,
			name: dirName,
			description: '',
			version: '',
			path: pluginPath,
			isBuiltin,
			enabled: false,
			error: `No index.js found in ${dirName}`
		};
	}

	try {
		const mod = await import(indexPath);
		const metadata = mod.metadata;
		if (!metadata) {
			return {
				type: dirName,
				name: dirName,
				description: '',
				version: '',
				path: pluginPath,
				isBuiltin,
				enabled: false,
				error: 'No metadata export found'
			};
		}

		return {
			type: metadata.type || dirName,
			name: metadata.name || dirName,
			description: metadata.description || '',
			version: metadata.version || '',
			path: pluginPath,
			isBuiltin,
			enabled: true,
			configFields: metadata.configFields,
			itemFields: metadata.itemFields
		};
	} catch (err: any) {
		return {
			type: dirName,
			name: dirName,
			description: '',
			version: '',
			path: pluginPath,
			isBuiltin,
			enabled: false,
			error: `Failed to load: ${err?.message || 'unknown error'}`
		};
	}
}

export const GET: RequestHandler = async () => {
	try {
		const plugins: PluginInfo[] = [];

		// Scan built-in adapters
		const builtinDir = getBuiltinDir();
		for (const dir of listPluginDirs(builtinDir)) {
			// Skip base.js directory (it's the base class, not a plugin)
			if (dir.endsWith('/base') || dir.endsWith('/base.js')) continue;
			plugins.push(await probePlugin(dir, true));
		}

		// Scan user plugins
		for (const dir of listPluginDirs(USER_PLUGINS_DIR)) {
			plugins.push(await probePlugin(dir, false));
		}

		return json({ success: true, plugins });
	} catch (error) {
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to list available plugins'
			},
			{ status: 500 }
		);
	}
};
