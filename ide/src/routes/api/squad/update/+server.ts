import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join, dirname, resolve } from 'path';

const execAsync = promisify(exec);

/**
 * Detect SQUAD installation path dynamically.
 * The IDE runs from {squad}/ide, so we go up one level from cwd.
 */
function getSquadPath(): string {
	// process.cwd() is the IDE directory when running dev server
	// Go up one level to get SQUAD root
	const cwd = process.cwd();

	// If we're in the IDE directory, go up one level
	if (cwd.endsWith('/ide') || cwd.endsWith('\\ide')) {
		return dirname(cwd);
	}

	// If cwd already is SQUAD root (has tools/scripts), use it directly
	if (existsSync(join(cwd, 'tools', 'scripts', 'symlink-tools.sh'))) {
		return cwd;
	}

	// Fallback: check if ide is a subdirectory
	const parentPath = dirname(cwd);
	if (existsSync(join(parentPath, 'tools', 'scripts', 'symlink-tools.sh'))) {
		return parentPath;
	}

	return cwd; // Last resort, will fail validation
}

/**
 * POST /api/squad/update
 *
 * Updates SQUAD by:
 * 1. Running git pull in the SQUAD directory
 * 2. Running symlink-tools.sh to update symlinks (non-interactive)
 *
 * Returns success/failure with message
 */
export async function POST() {
	const squadPath = getSquadPath();

	// Verify SQUAD directory exists and has expected structure
	if (!existsSync(squadPath) || !existsSync(join(squadPath, 'tools', 'scripts', 'symlink-tools.sh'))) {
		return json({
			success: false,
			error: `SQUAD installation not found or incomplete at ${squadPath}`
		}, { status: 404 });
	}

	try {
		// Step 1: Git pull
		const { stdout: pullOutput } = await execAsync('git pull', {
			cwd: squadPath,
			timeout: 30000 // 30 second timeout
		});

		// Check if already up to date
		const isUpToDate = pullOutput.includes('Already up to date');

		// Step 2: Run symlink-tools.sh directly (non-interactive, unlike install.sh)
		const { stdout: symlinkOutput } = await execAsync('bash tools/scripts/symlink-tools.sh', {
			cwd: squadPath,
			timeout: 30000
		});

		// Build result message
		let message: string;
		if (isUpToDate) {
			message = 'Already up to date. Symlinks refreshed.';
		} else {
			// Extract commit info from pull output
			const commitMatch = pullOutput.match(/([a-f0-9]+)\.\.([a-f0-9]+)/);
			if (commitMatch) {
				message = `Updated to ${commitMatch[2].substring(0, 7)}. Symlinks refreshed.`;
			} else {
				message = 'Updated successfully. Symlinks refreshed.';
			}
		}

		return json({
			success: true,
			message,
			details: {
				gitPull: pullOutput.trim(),
				symlinks: symlinkOutput.substring(0, 500)
			}
		});

	} catch (err: any) {
		// Handle specific error cases
		const errorMessage = err.stderr || err.message || 'Unknown error';

		if (errorMessage.includes('uncommitted changes') || errorMessage.includes('unstaged changes')) {
			return json({
				success: false,
				error: 'Cannot update: uncommitted changes in SQUAD repo. Please commit or stash first.'
			}, { status: 409 });
		}

		if (errorMessage.includes('CONFLICT')) {
			return json({
				success: false,
				error: 'Merge conflict during git pull. Manual resolution required.'
			}, { status: 409 });
		}

		return json({
			success: false,
			error: `Update failed: ${errorMessage.substring(0, 200)}`
		}, { status: 500 });
	}
}
