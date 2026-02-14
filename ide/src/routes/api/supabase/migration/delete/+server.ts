/**
 * DELETE /api/supabase/migration/delete
 *
 * Deletes a local (unpushed) migration file.
 *
 * Query parameters:
 * - project: Project name (required)
 *
 * Request body:
 * - filename: Migration filename to delete (required)
 *
 * Response:
 * - success: Whether deletion succeeded
 * - filename: Deleted migration filename
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { detectSupabaseConfig } from '$lib/utils/supabase';
import { existsSync, readFileSync, unlinkSync, statSync } from 'fs';
import { join, basename } from 'path';

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

export const DELETE: RequestHandler = async ({ url, request }) => {
	const projectName = url.searchParams.get('project');

	if (!projectName) {
		return json({ error: 'Missing required parameter: project' }, { status: 400 });
	}

	// Parse request body
	let body: { filename?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const filename = body.filename?.trim();
	if (!filename) {
		return json({ error: 'Missing required field: filename' }, { status: 400 });
	}

	// Validate filename format (should be timestamp_name.sql)
	if (!filename.match(/^\d{14}_[a-z0-9_]+\.sql$/)) {
		return json({ error: 'Invalid migration filename format' }, { status: 400 });
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
			error: 'Supabase is not initialized in this project.'
		}, { status: 400 });
	}

	// Build path to migration file
	const migrationPath = join(effectivePath, 'supabase', 'migrations', filename);

	// Check if file exists
	if (!existsSync(migrationPath)) {
		return json({
			error: `Migration file not found: ${filename}`
		}, { status: 404 });
	}

	// Verify it's a file, not a directory
	const stat = statSync(migrationPath);
	if (!stat.isFile()) {
		return json({
			error: 'Path is not a file'
		}, { status: 400 });
	}

	// Delete the migration file
	try {
		unlinkSync(migrationPath);

		return json({
			success: true,
			filename: basename(migrationPath),
			message: `Deleted migration: ${filename}`
		});
	} catch (error) {
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Failed to delete migration'
		}, { status: 500 });
	}
};
