/**
 * POST /api/supabase/pull
 *
 * Pulls schema from remote database, creating a new migration file.
 *
 * Query parameters:
 * - project: Project name (required)
 *
 * Response:
 * - success: Whether pull succeeded
 * - output: CLI output
 * - error: Error message if pull failed
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	detectSupabaseConfig,
	pullSchema,
	isSupabaseCliInstalled
} from '$lib/utils/supabase';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

interface ProjectPaths {
	projectPath: string | null;
	serverPath: string | null;
}

function getProjectPaths(projectName: string): ProjectPaths {
	const configPath = join(process.env.HOME || '~', '.config', 'jat', 'projects.json');

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
			const resolvedServerPath = projectConfig.server_path.replace(/^~/, process.env.HOME || '');
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

	// Pull schema (use effectivePath for monorepos)
	const result = await pullSchema(effectivePath);

	if (result.exitCode !== 0) {
		return json({
			success: false,
			output: result.stdout,
			error: result.stderr || 'Pull failed'
		}, { status: 500 });
	}

	return json({
		success: true,
		output: result.stdout,
		projectRef: config.projectRef
	});
};
