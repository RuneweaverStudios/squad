/**
 * GET /api/supabase/status
 *
 * Returns Supabase configuration and migration status for a project.
 *
 * Query parameters:
 * - project: Project name (required)
 *
 * Response:
 * - hasSupabase: Whether supabase/ folder exists
 * - isLinked: Whether project is linked to remote
 * - projectRef: Supabase project reference (if linked)
 * - cliInstalled: Whether Supabase CLI is installed
 * - cliVersion: Supabase CLI version (if installed)
 * - migrations: Array of migration status objects
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	detectSupabaseConfig,
	getMigrationList,
	isSupabaseCliInstalled,
	getSupabaseCliVersion,
	type MigrationStatus
} from '$lib/utils/supabase';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';

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
	const configPath = join(process.env.HOME || '~', '.config', 'jat', 'projects.json');

	if (!existsSync(configPath)) {
		// Fall back to ~/code/{project}
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

		// Fall back to ~/code/{project} if no path in config
		if (!projectPath) {
			const defaultPath = join(process.env.HOME || '~', 'code', projectName);
			projectPath = existsSync(defaultPath) ? defaultPath : null;
		}

		return { projectPath, serverPath };
	} catch {
		// Fall back to ~/code/{project}
		const defaultPath = join(process.env.HOME || '~', 'code', projectName);
		return {
			projectPath: existsSync(defaultPath) ? defaultPath : null,
			serverPath: null
		};
	}
}

/**
 * Read local migration files to get names
 */
function getLocalMigrationFiles(projectPath: string): Map<string, { name: string; filename: string }> {
	const migrationsPath = join(projectPath, 'supabase', 'migrations');
	const result = new Map<string, { name: string; filename: string }>();

	if (!existsSync(migrationsPath)) {
		return result;
	}

	try {
		const files = readdirSync(migrationsPath);
		for (const file of files) {
			if (!file.endsWith('.sql')) continue;

			// Parse filename: 20241114184005_remote_schema.sql
			const match = file.match(/^(\d+)_(.+)\.sql$/);
			if (match) {
				result.set(match[1], {
					name: match[2],
					filename: file
				});
			}
		}
	} catch {
		// Ignore errors
	}

	return result;
}

/**
 * Read database password from project .env files
 * Checks common env var names: SUPABASE_DB_PASSWORD, DATABASE_PASSWORD, POSTGRES_PASSWORD
 */
function getPasswordFromEnv(projectPath: string, serverPath?: string): string | null {
	const envVarNames = ['SUPABASE_DB_PASSWORD', 'DATABASE_PASSWORD', 'POSTGRES_PASSWORD'];

	// Check paths in order: server_path first (for monorepos), then project root
	const pathsToCheck = [serverPath, projectPath].filter(Boolean) as string[];

	for (const basePath of pathsToCheck) {
		const envPath = join(basePath, '.env');
		if (!existsSync(envPath)) continue;

		try {
			const envContent = readFileSync(envPath, 'utf-8');
			for (const varName of envVarNames) {
				const match = envContent.match(new RegExp(`^${varName}=(.+)$`, 'm'));
				if (match) {
					// Remove surrounding quotes if present
					return match[1].replace(/^["']|["']$/g, '').trim();
				}
			}
		} catch {
			continue;
		}
	}

	return null;
}

export const GET: RequestHandler = async ({ url }) => {
	const projectName = url.searchParams.get('project');

	if (!projectName) {
		return json({ error: 'Missing required parameter: project' }, { status: 400 });
	}

	// Check if CLI is installed first
	const cliInstalled = await isSupabaseCliInstalled();
	const cliVersion = cliInstalled ? await getSupabaseCliVersion() : null;

	if (!cliInstalled) {
		return json({
			hasSupabase: false,
			isLinked: false,
			cliInstalled: false,
			cliVersion: null,
			migrations: [],
			error: 'Supabase CLI is not installed. Install it with: npm install -g supabase'
		});
	}

	// Get project paths (both project root and server_path for monorepos)
	const { projectPath, serverPath } = getProjectPaths(projectName);

	if (!projectPath) {
		return json(
			{ error: `Project not found: ${projectName}` },
			{ status: 404 }
		);
	}

	// Detect Supabase configuration - check both project root and server_path
	// (for projects like marduk where supabase is in a subdirectory like marketing/)
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
			hasSupabase: false,
			isLinked: false,
			cliInstalled,
			cliVersion,
			projectPath,
			serverPath,
			migrations: [],
			hint: 'Run `supabase init` in the project directory to initialize Supabase'
		});
	}

	// Get migration list (use effectivePath which may be server_path for monorepos)
	let migrations: MigrationStatus[] = [];
	let migrationsError: string | undefined;

	if (config.isLinked) {
		try {
			migrations = await getMigrationList(effectivePath);

			// Enrich migrations with local file names
			const localFiles = getLocalMigrationFiles(effectivePath);
			migrations = migrations.map((m) => {
				const localFile = localFiles.get(m.version);
				return {
					...m,
					name: localFile?.name || m.name,
					filename: localFile?.filename || `${m.version}.sql`
				};
			});

			// Also add any local-only migrations that weren't in the list
			for (const [version, info] of localFiles) {
				if (!migrations.find((m) => m.version === version)) {
					migrations.push({
						version,
						name: info.name,
						filename: info.filename,
						local: true,
						remote: false,
						status: 'local-only'
					});
				}
			}

			// Sort by version (timestamp) descending
			migrations.sort((a, b) => b.version.localeCompare(a.version));
		} catch (error) {
			migrationsError = error instanceof Error ? error.message : 'Failed to get migrations';
		}
	} else {
		// Not linked - just show local migrations
		const localFiles = getLocalMigrationFiles(effectivePath);
		migrations = Array.from(localFiles.entries()).map(([version, info]) => ({
			version,
			name: info.name,
			filename: info.filename,
			local: true,
			remote: false,
			status: 'local-only' as const
		}));
		migrations.sort((a, b) => b.version.localeCompare(a.version));
	}

	// Count statistics
	const syncedCount = migrations.filter((m) => m.status === 'synced').length;
	const localOnlyCount = migrations.filter((m) => m.status === 'local-only').length;
	const remoteOnlyCount = migrations.filter((m) => m.status === 'remote-only').length;

	// Check if .env has database password (for SQL executor UI)
	const serverPathForEnv = config.supabasePath ? dirname(config.supabasePath) : undefined;
	const hasEnvPassword = !!getPasswordFromEnv(projectPath, serverPathForEnv);

	return json({
		hasSupabase: config.hasSupabase,
		isLinked: config.isLinked,
		projectRef: config.projectRef,
		cliInstalled,
		cliVersion,
		projectPath,
		serverPath,
		effectivePath,
		supabasePath: config.supabasePath,
		hasEnvPassword,
		migrations,
		migrationsError,
		stats: {
			total: migrations.length,
			synced: syncedCount,
			localOnly: localOnlyCount,
			remoteOnly: remoteOnlyCount,
			unpushed: localOnlyCount
		},
		hint: config.isLinked
			? undefined
			: 'Run `supabase link` in the project directory to connect to your remote project'
	});
};
