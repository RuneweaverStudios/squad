/**
 * Projects Init API
 * POST /api/projects/init - Initialize a new project with Beads
 *
 * Request body:
 *   { path: string }  - Path to the project directory (must be under home directory)
 *
 * Response:
 *   { success: true, project: { name, path, prefix }, message: string }
 *   or { error: true, message: string, type: string }
 *
 * Security:
 *   - Only allows paths under user's home directory
 *   - Validates path exists and is a directory
 *   - Validates path is a git repository
 */

import { json } from '@sveltejs/kit';
import { existsSync, statSync } from 'fs';
import { homedir } from 'os';
import { join, basename, resolve, normalize } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { invalidateCache } from '$lib/server/cache.js';

const execAsync = promisify(exec);

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
 * Check if .beads/ already exists
 * @param {string} path
 * @returns {boolean}
 */
function hasBeadsInit(path) {
	return existsSync(join(path, '.beads'));
}

/**
 * POST /api/projects/init
 * Initialize a new project with Beads (bd init)
 */
export async function POST({ request }) {
	try {
		const body = await request.json();

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

		// Check path exists
		if (!existsSync(absolutePath)) {
			return json(
				{
					error: true,
					message: `Path does not exist: ${absolutePath}`,
					type: 'not_found'
				},
				{ status: 404 }
			);
		}

		// Check path is a directory
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

		// Check path is a git repository
		const isGit = await isGitRepo(absolutePath);
		if (!isGit) {
			return json(
				{
					error: true,
					message: `Path is not a git repository: ${absolutePath}. Run 'git init' first.`,
					type: 'not_git_repo'
				},
				{ status: 400 }
			);
		}

		// Check if already initialized
		if (hasBeadsInit(absolutePath)) {
			return json(
				{
					error: true,
					message: `Beads already initialized in: ${absolutePath}`,
					type: 'already_initialized'
				},
				{ status: 409 }
			);
		}

		// Get project name from directory name
		const projectName = basename(absolutePath);

		// Run bd init
		try {
			const { stdout, stderr } = await execAsync('bd init --quiet', {
				cwd: absolutePath,
				timeout: 30000 // 30 second timeout
			});

			// Invalidate projects cache so the new project appears in the dashboard
			invalidateCache.projects();

			return json({
				success: true,
				project: {
					name: projectName,
					path: absolutePath,
					prefix: projectName.toLowerCase()
				},
				message: `Successfully initialized Beads in ${projectName}`,
				stdout: stdout || undefined,
				stderr: stderr || undefined
			}, { status: 201 });

		} catch (initError) {
			const err = /** @type {{ message?: string, stderr?: string }} */ (initError);
			console.error('bd init failed:', err);

			return json(
				{
					error: true,
					message: `Failed to initialize Beads: ${err.stderr || err.message}`,
					type: 'init_failed'
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
