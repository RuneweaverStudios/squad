/**
 * POST /api/supabase/push
 *
 * Pushes local migrations to the remote database.
 *
 * Query parameters:
 * - project: Project name (required)
 * - dryRun: If "true", only show what would be done (optional)
 * - includeSeed: If "true", also run seed.sql on the remote database (optional)
 *
 * Response:
 * - success: Whether push succeeded
 * - output: CLI output
 * - error: Error message if push failed
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	detectSupabaseConfig,
	pushMigrations,
	isSupabaseCliInstalled
} from '$lib/utils/supabase';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

interface ProjectPaths {
	projectPath: string | null;
	serverPath: string | null;
}

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

export const POST: RequestHandler = async ({ url }) => {
	const projectName = url.searchParams.get('project');
	const dryRun = url.searchParams.get('dryRun') === 'true';
	const includeSeed = url.searchParams.get('includeSeed') === 'true';

	if (!projectName) {
		return json({ error: 'Missing required parameter: project' }, { status: 400 });
	}

	// Check if CLI is installed
	const cliInstalled = await isSupabaseCliInstalled();
	if (!cliInstalled) {
		return json({ error: 'Supabase CLI is not installed' }, { status: 503 });
	}

	// Get project paths
	const { projectPath, serverPath } = getProjectPaths(projectName);
	if (!projectPath) {
		return json({ error: `Project not found: ${projectName}` }, { status: 404 });
	}

	// Check Supabase configuration - check both project root and server_path
	let config = await detectSupabaseConfig(projectPath);
	let effectivePath = projectPath;

	if (!config.hasSupabase && serverPath && serverPath !== projectPath) {
		const serverConfig = await detectSupabaseConfig(serverPath);
		if (serverConfig.hasSupabase) {
			config = serverConfig;
			effectivePath = serverPath;
		}
	}

	if (!config.hasSupabase) {
		return json({
			error: 'Supabase is not initialized in this project'
		}, { status: 400 });
	}

	if (!config.isLinked) {
		return json({
			error: 'Project is not linked to a remote Supabase project. Run `supabase link` first.'
		}, { status: 400 });
	}

	// Push migrations (use effectivePath for monorepos)
	const result = await pushMigrations(effectivePath, dryRun, includeSeed);

	if (result.exitCode !== 0) {
		return json({
			success: false,
			output: result.stdout,
			error: result.stderr || 'Push failed',
			dryRun,
			includeSeed
		}, { status: 500 });
	}

	return json({
		success: true,
		output: result.stdout,
		dryRun,
		includeSeed,
		projectRef: config.projectRef
	});
};
