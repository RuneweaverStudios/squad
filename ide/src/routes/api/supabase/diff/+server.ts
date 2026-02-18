/**
 * GET /api/supabase/diff
 *
 * Returns schema diff between local and remote database.
 * This shows what changes would be needed to make remote match local.
 *
 * Query parameters:
 * - project: Project name (required)
 *
 * Response:
 * - hasDiff: Whether there are differences
 * - diffSql: SQL statements representing the diff
 * - error: Error message if diff failed
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	detectSupabaseConfig,
	getSchemaDiff,
	isSupabaseCliInstalled
} from '$lib/utils/supabase';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Result of getProjectPaths - includes both project root and server path
 */
interface ProjectPaths {
	/** Project root path */
	projectPath: string | null;
	/** Server path (if different from project root, e.g., for monorepos) */
	serverPath: string | null;
}

/**
 * Get project paths from config (both project root and server_path)
 */
function getProjectPaths(projectName: string): ProjectPaths {
	const configPath = join(process.env.HOME || '~', '.config', 'squad', 'projects.json');

	if (!existsSync(configPath)) {
		const defaultPath = join(process.env.HOME || '~', 'code', projectName);
		return {
			projectPath: existsSync(defaultPath) ? defaultPath : null,
			serverPath: null
		};
	}

	try {
		const configContent = readFileSync(configPath, 'utf-8');
		const config = JSON.parse(configContent);
		const projectConfig = config.projects?.[projectName];

		let projectPath: string | null = null;
		let serverPath: string | null = null;

		if (projectConfig?.path) {
			const resolvedPath = projectConfig.path.replace(/^~/, process.env.HOME || '');
			projectPath = existsSync(resolvedPath) ? resolvedPath : null;
		}

		if (projectConfig?.server_path) {
			let resolvedServerPath = projectConfig.server_path.replace(/^~/, process.env.HOME || '');
			if (!resolvedServerPath.startsWith('/') && projectPath) {
				resolvedServerPath = join(projectPath, resolvedServerPath);
			}
			serverPath = existsSync(resolvedServerPath) ? resolvedServerPath : null;
		}

		// Fall back to ~/code/{project} if no path in config
		if (!projectPath) {
			const defaultPath = join(process.env.HOME || '~', 'code', projectName);
			projectPath = existsSync(defaultPath) ? defaultPath : null;
		}

		return { projectPath, serverPath };
	} catch {
		const defaultPath = join(process.env.HOME || '~', 'code', projectName);
		return {
			projectPath: existsSync(defaultPath) ? defaultPath : null,
			serverPath: null
		};
	}
}

export const GET: RequestHandler = async ({ url }) => {
	const projectName = url.searchParams.get('project');

	if (!projectName) {
		return json({ error: 'Missing required parameter: project' }, { status: 400 });
	}

	// Check if CLI is installed
	const cliInstalled = await isSupabaseCliInstalled();
	if (!cliInstalled) {
		return json({
			hasDiff: false,
			diffSql: '',
			error: 'Supabase CLI is not installed'
		}, { status: 503 });
	}

	// Get project paths (both project root and server_path for monorepos)
	const { projectPath, serverPath } = getProjectPaths(projectName);
	if (!projectPath) {
		return json({ error: `Project not found: ${projectName}` }, { status: 404 });
	}

	// Check Supabase configuration - check both project root and server_path
	let config = await detectSupabaseConfig(projectPath);
	let effectivePath = projectPath;

	// If no supabase in project root but there's a server_path, check there too
	if (!config.hasSupabase && serverPath && serverPath !== projectPath) {
		const serverConfig = await detectSupabaseConfig(serverPath);
		if (serverConfig.hasSupabase) {
			config = serverConfig;
			effectivePath = serverPath;
		}
	}

	if (!config.hasSupabase) {
		return json({
			hasDiff: false,
			diffSql: '',
			error: 'Supabase is not initialized in this project'
		}, { status: 400 });
	}

	if (!config.isLinked) {
		return json({
			hasDiff: false,
			diffSql: '',
			error: 'Project is not linked to a remote Supabase project. Run `supabase link` first.'
		}, { status: 400 });
	}

	// Get schema diff (use effectivePath which may be server_path for monorepos)
	const diff = await getSchemaDiff(effectivePath);

	return json({
		hasDiff: diff.hasDiff,
		diffSql: diff.diffSql,
		error: diff.error,
		projectRef: config.projectRef
	});
};
