/**
 * Project Rename API
 * POST /api/projects/rename
 *
 * Renames a project including:
 * 1. Filesystem directory (~/code/old → ~/code/new)
 * 2. projects.json key and path
 * 3. Project secrets in credentials.json
 * 4. Kills any running agents on the project
 *
 * Request body:
 * {
 *   oldKey: string,  // Current project key
 *   newKey: string   // New project key (lowercase, alphanumeric, hyphens)
 * }
 *
 * Response:
 * {
 *   success: true,
 *   oldKey: string,
 *   newKey: string,
 *   newPath: string,
 *   killedAgents: string[]  // Names of agents that were stopped
 * }
 */

import { json } from '@sveltejs/kit';
import { readFile, writeFile, rename as fsRename, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join, dirname, basename } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { invalidateCache } from '$lib/server/cache.js';
import {
	getCredentials,
	saveCredentials
} from '$lib/utils/credentials';

const execAsync = promisify(exec);

// Paths
const CONFIG_DIR = join(homedir(), '.config', 'squad');
const CONFIG_FILE = join(CONFIG_DIR, 'projects.json');

/**
 * Validate project key format
 * Must be lowercase alphanumeric with hyphens, 2-50 chars
 */
function validateProjectKey(key: string): { valid: boolean; error?: string } {
	if (!key || typeof key !== 'string') {
		return { valid: false, error: 'Project key is required' };
	}
	const trimmed = key.trim();
	if (trimmed.length < 2 || trimmed.length > 50) {
		return { valid: false, error: 'Project key must be 2-50 characters' };
	}
	if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]{1,2}$/.test(trimmed)) {
		return { valid: false, error: 'Project key must be lowercase alphanumeric with optional hyphens (not at start/end)' };
	}
	return { valid: true };
}

/**
 * Read SQUAD projects config
 */
async function readSquadConfig(): Promise<Record<string, unknown> | null> {
	try {
		if (!existsSync(CONFIG_FILE)) {
			return null;
		}
		const content = await readFile(CONFIG_FILE, 'utf-8');
		return JSON.parse(content);
	} catch (error) {
		console.error('Failed to read SQUAD config:', error);
		return null;
	}
}

/**
 * Write SQUAD config back to file
 */
async function writeSquadConfig(config: Record<string, unknown>): Promise<boolean> {
	try {
		await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
		return true;
	} catch (error) {
		console.error('Failed to write SQUAD config:', error);
		return false;
	}
}

/**
 * Find and kill any running agents working on the project
 * Returns array of agent names that were killed
 */
async function killProjectAgents(projectPath: string): Promise<string[]> {
	const killedAgents: string[] = [];

	try {
		// Get all tmux sessions with squad-* prefix
		const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}" 2>/dev/null', {
			timeout: 5000
		});

		const sessions = stdout.trim().split('\n').filter(s => s.startsWith('squad-') && !s.startsWith('squad-pending'));

		// Check each session to see if it's working on this project
		for (const sessionName of sessions) {
			const agentName = sessionName.replace('squad-', '');

			// Check if agent has a session file in this project
			const sessionsDir = join(projectPath, '.claude', 'sessions');
			let foundInProject = false;

			if (existsSync(sessionsDir)) {
				try {
					const entries = await readdir(sessionsDir);
					for (const file of entries.filter(f => f.startsWith('agent-') && f.endsWith('.txt'))) {
						const content = await readFile(join(sessionsDir, file), 'utf-8');
						if (content.trim() === agentName) {
							foundInProject = true;
							break;
						}
					}
				} catch {
					// Ignore errors reading session files
				}
			}

			// Also check legacy location
			if (!foundInProject) {
				const claudeDir = join(projectPath, '.claude');
				if (existsSync(claudeDir)) {
					try {
						const entries = await readdir(claudeDir);
						for (const file of entries.filter(f => f.startsWith('agent-') && f.endsWith('.txt'))) {
							const content = await readFile(join(claudeDir, file), 'utf-8');
							if (content.trim() === agentName) {
								foundInProject = true;
								break;
							}
						}
					} catch {
						// Ignore errors
					}
				}
			}

			if (foundInProject) {
				// Kill this tmux session
				try {
					await execAsync(`tmux kill-session -t "${sessionName}" 2>/dev/null`, { timeout: 3000 });
					killedAgents.push(agentName);
					console.log(`Killed agent session: ${sessionName}`);
				} catch {
					// Session might already be gone
				}

				// Clean up signal files for this session
				try {
					const signalFile = `/tmp/squad-signal-tmux-${sessionName}.json`;
					const timelineFile = `/tmp/squad-timeline-${sessionName}.jsonl`;
					if (existsSync(signalFile)) {
						await import('fs/promises').then(fs => fs.unlink(signalFile));
					}
					if (existsSync(timelineFile)) {
						await import('fs/promises').then(fs => fs.unlink(timelineFile));
					}
				} catch {
					// Ignore cleanup errors
				}
			}
		}
	} catch {
		// tmux not available or no sessions - continue
	}

	return killedAgents;
}

/**
 * Migrate project secrets from old key to new key
 */
function migrateProjectSecrets(oldKey: string, newKey: string): void {
	const creds = getCredentials();

	if (creds.projectSecrets?.[oldKey]) {
		// Move secrets to new key
		if (!creds.projectSecrets) {
			creds.projectSecrets = {};
		}
		creds.projectSecrets[newKey] = creds.projectSecrets[oldKey];
		delete creds.projectSecrets[oldKey];
		saveCredentials(creds);
		console.log(`Migrated project secrets from ${oldKey} to ${newKey}`);
	}
}

export async function POST({ request }) {
	try {
		const body = await request.json();
		const { oldKey, newKey } = body;

		// Validate inputs
		if (!oldKey || typeof oldKey !== 'string') {
			return json({ error: 'oldKey is required' }, { status: 400 });
		}

		const newKeyValidation = validateProjectKey(newKey);
		if (!newKeyValidation.valid) {
			return json({ error: newKeyValidation.error }, { status: 400 });
		}

		const normalizedNewKey = newKey.trim().toLowerCase();

		// Don't allow renaming to same key
		if (oldKey.toLowerCase() === normalizedNewKey) {
			return json({ error: 'New key must be different from current key' }, { status: 400 });
		}

		// Read current config
		const squadConfig = await readSquadConfig();
		if (!squadConfig) {
			return json({ error: 'Failed to read projects configuration' }, { status: 500 });
		}

		const projects = squadConfig.projects as Record<string, { path?: string; name?: string; [key: string]: unknown }> | undefined;
		if (!projects) {
			return json({ error: 'No projects found in configuration' }, { status: 404 });
		}

		// Check old project exists
		if (!projects[oldKey]) {
			return json({ error: `Project '${oldKey}' not found` }, { status: 404 });
		}

		// Check new key doesn't exist
		if (projects[normalizedNewKey]) {
			return json({ error: `Project '${normalizedNewKey}' already exists` }, { status: 409 });
		}

		const oldConfig = projects[oldKey];
		const oldPath = oldConfig.path?.replace(/^~/, homedir()) || join(homedir(), 'code', oldKey);

		// Verify source directory exists
		if (!existsSync(oldPath)) {
			return json({ error: `Source directory does not exist: ${oldPath}` }, { status: 404 });
		}

		// Calculate new path
		const parentDir = dirname(oldPath);
		const newPath = join(parentDir, normalizedNewKey);

		// Check new path doesn't exist
		if (existsSync(newPath)) {
			return json({ error: `Destination directory already exists: ${newPath}` }, { status: 409 });
		}

		// Kill any running agents on this project before renaming
		const killedAgents = await killProjectAgents(oldPath);

		// Rename the filesystem directory
		try {
			await fsRename(oldPath, newPath);
		} catch (error) {
			return json({
				error: `Failed to rename directory: ${error instanceof Error ? error.message : String(error)}`
			}, { status: 500 });
		}

		// Update projects.json
		// Create new entry with updated path
		const newConfig = {
			...oldConfig,
			path: newPath.replace(homedir(), '~'),
			name: normalizedNewKey.toUpperCase() // Update display name
		};

		// Remove old entry and add new one
		delete projects[oldKey];
		projects[normalizedNewKey] = newConfig;

		// Save config
		const configSaved = await writeSquadConfig(squadConfig);
		if (!configSaved) {
			// Try to rollback filesystem rename
			try {
				await fsRename(newPath, oldPath);
			} catch {
				// Rollback failed - log for manual intervention
				console.error(`CRITICAL: Config save failed and rollback failed. Manual intervention required.`);
				console.error(`Directory renamed from ${oldPath} to ${newPath} but config not updated.`);
			}
			return json({ error: 'Failed to save configuration' }, { status: 500 });
		}

		// Migrate project secrets
		migrateProjectSecrets(oldKey, normalizedNewKey);

		// Invalidate caches
		invalidateCache.projects();

		return json({
			success: true,
			oldKey,
			newKey: normalizedNewKey,
			oldPath,
			newPath,
			killedAgents
		});

	} catch (error) {
		console.error('Failed to rename project:', error);
		return json({
			error: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
