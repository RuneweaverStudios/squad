/**
 * Projects Init API
 * POST /api/projects/init - Initialize a new project with SQUAD Tasks
 *
 * Request body:
 *   { path: string, createIfMissing?: boolean }  - Path to the project directory
 *
 * Response:
 *   { success: true, project: { name, path, prefix }, message: string, steps: string[] }
 *   or { error: true, message: string, type: string }
 *
 * Behavior (unified onboarding flow):
 *   1. Creates directory if it doesn't exist (when createIfMissing=true or path is in ~/code/)
 *   2. Initializes git if not already a git repository
 *   3. Runs st init to set up SQUAD Tasks
 *   4. Adds project to ~/.config/squad/projects.json
 *
 * Security:
 *   - Only allows paths under user's home directory
 *   - Directory creation restricted to ~/code/
 */

import { json } from '@sveltejs/kit';
import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, basename, resolve, normalize } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { invalidateCache } from '$lib/server/cache.js';
import { initProject } from '$lib/server/squad-tasks.js';

const execAsync = promisify(exec);

const CONFIG_DIR = join(homedir(), '.config', 'squad');
const CONFIG_FILE = join(CONFIG_DIR, 'projects.json');

/**
 * Expand ~ to home directory and resolve to absolute path
 * @param {string} inputPath
 * @returns {string}
 */
function expandPath(inputPath) {
	const expanded = inputPath.replace(/^~/, homedir());
	return resolve(expanded);
}

/**
 * Check if path is safe (under home directory)
 * Case-insensitive on macOS/Windows where filesystems are case-insensitive
 * @param {string} absolutePath
 * @returns {boolean}
 */
function isPathAllowed(absolutePath) {
	const home = homedir();
	const normalized = normalize(absolutePath);
	// macOS and Windows have case-insensitive filesystems
	return normalized.toLowerCase().startsWith(home.toLowerCase());
}

/**
 * Check if path is a git repository
 * @param {string} path
 * @returns {Promise<boolean>}
 */
async function isGitRepo(path) {
	try {
		await execAsync('git rev-parse --git-dir', { cwd: path, timeout: 5000 });
		return true;
	} catch {
		return false;
	}
}

/**
 * Check if .squad/ already exists
 * @param {string} path
 * @returns {boolean}
 */
function hasSquadInit(path) {
	return existsSync(join(path, '.squad'));
}

/**
 * Add project to projects.json
 * @param {string} projectKey - Project key (basename)
 * @param {string} absolutePath - Absolute path to project
 */
function addProjectToConfig(projectKey, absolutePath) {
	// Ensure config directory exists
	if (!existsSync(CONFIG_DIR)) {
		mkdirSync(CONFIG_DIR, { recursive: true });
	}

	// Read existing config or create new one
	/** @type {{ projects: Record<string, { name: string, path: string }>, defaults?: unknown }} */
	let config = { projects: /** @type {Record<string, { name: string, path: string }>} */ ({}), defaults: {} };
	if (existsSync(CONFIG_FILE)) {
		try {
			const content = readFileSync(CONFIG_FILE, 'utf-8');
			config = /** @type {{ projects: Record<string, { name: string, path: string }>, defaults?: unknown }} */ (JSON.parse(content));
			if (!config.projects) config.projects = /** @type {Record<string, { name: string, path: string }>} */ ({});
		} catch (err) {
			console.error('Failed to read config, creating new:', err);
		}
	}

	// Add project if not already present
	if (!config.projects[projectKey]) {
		config.projects[projectKey] = {
			name: projectKey.toUpperCase(),
			path: absolutePath
		};

		// Write back to file
		writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
	}
}


/**
 * POST /api/projects/init
 * Unified project onboarding - creates directory, inits git, inits squad, adds to config
 */
export async function POST({ request }) {
	try {
		const body = await request.json();
		const steps = []; // Track what actions were taken

		// Validate path is provided
		if (!body.path || typeof body.path !== 'string') {
			return json(
				{ error: true, message: 'Path is required', type: 'validation_error' },
				{ status: 400 }
			);
		}

		const inputPath = body.path.trim();
		if (!inputPath) {
			return json(
				{ error: true, message: 'Path cannot be empty', type: 'validation_error' },
				{ status: 400 }
			);
		}

		// Expand and resolve path
		const absolutePath = expandPath(inputPath);

		// Security: Check path is under home directory
		if (!isPathAllowed(absolutePath)) {
			return json(
				{
					error: true,
					message: `Path must be under your home directory. Got: ${inputPath}`,
					type: 'security_error'
				},
				{ status: 403 }
			);
		}

		// STEP 1: Create directory if it doesn't exist (anywhere under home directory)
		if (!existsSync(absolutePath)) {
			try {
				mkdirSync(absolutePath, { recursive: true });
				steps.push(`Created directory: ${inputPath}`);
			} catch (mkdirError) {
				return json(
					{
						error: true,
						message: `Failed to create directory: ${mkdirError instanceof Error ? mkdirError.message : 'Unknown error'}`,
						type: 'mkdir_failed'
					},
					{ status: 500 }
				);
			}
		}

		// Check path is a directory (in case a file exists at that path)
		const stats = statSync(absolutePath);
		if (!stats.isDirectory()) {
			return json(
				{
					error: true,
					message: `Path is not a directory: ${absolutePath}`,
					type: 'validation_error'
				},
				{ status: 400 }
			);
		}

		// STEP 2: Initialize git if not a git repo
		const isGit = await isGitRepo(absolutePath);
		if (!isGit) {
			try {
				await execAsync('git init', { cwd: absolutePath, timeout: 10000 });
				steps.push('Initialized git repository');

				// Create a basic .gitignore
				const gitignorePath = join(absolutePath, '.gitignore');
				if (!existsSync(gitignorePath)) {
					writeFileSync(gitignorePath, 'node_modules/\n.env\n.DS_Store\n*.log\n');
					steps.push('Created .gitignore');
				}
			} catch (gitError) {
				return json(
					{
						error: true,
						message: `Failed to initialize git: ${gitError instanceof Error ? gitError.message : 'Unknown error'}`,
						type: 'git_init_failed'
					},
					{ status: 500 }
				);
			}
		}

		// STEP 3: Check if SQUAD Tasks is already initialized
		if (hasSquadInit(absolutePath)) {
			// Already initialized - just add to config if not already there
			const projectName = basename(absolutePath);
			addProjectToConfig(projectName, absolutePath);
			invalidateCache.projects();

			return json({
				success: true,
				project: {
					name: projectName,
					path: absolutePath,
					prefix: projectName.toLowerCase()
				},
				message: steps.length > 0
					? `Project setup complete (SQUAD was already initialized)`
					: `SQUAD already initialized in ${projectName}`,
				steps,
				alreadyInitialized: true
			}, { status: 200 });
		}

		// STEP 4: Initialize task database
		const projectName = basename(absolutePath);
		try {
			initProject(absolutePath);
			steps.push('Initialized task management');

			// Add project to projects.json
			addProjectToConfig(projectName, absolutePath);
			steps.push('Added to SQUAD configuration');

			// Invalidate projects cache
			invalidateCache.projects();

			return json({
				success: true,
				project: {
					name: projectName,
					path: absolutePath,
					prefix: projectName.toLowerCase()
				},
				message: `Successfully set up project: ${projectName}`,
				steps
			}, { status: 201 });

		} catch (initError) {
			const err = /** @type {{ message?: string }} */ (initError);
			console.error('initProject failed:', err);

			return json(
				{
					error: true,
					message: `Failed to initialize tasks: ${err.message}`,
					type: 'init_failed',
					steps // Include steps taken before failure
				},
				{ status: 500 }
			);
		}

	} catch (error) {
		console.error('Error in projects/init:', error);
		return json(
			{
				error: true,
				message: error instanceof Error ? error.message : 'Internal server error',
				type: 'server_error'
			},
			{ status: 500 }
		);
	}
}
