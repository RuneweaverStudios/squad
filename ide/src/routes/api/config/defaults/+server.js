/**
 * SQUAD Defaults API
 * GET /api/config/defaults - Read SQUAD defaults from ~/.config/squad/projects.json
 * PUT /api/config/defaults - Update SQUAD defaults
 */

import { json } from '@sveltejs/kit';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { SQUAD_DEFAULTS } from '$lib/config/constants';
import { singleFlight, apiCache } from '$lib/server/cache.js';

const CONFIG_PATH = join(homedir(), '.config', 'squad', 'projects.json');

/**
 * Read the full config file
 * @returns {Promise<{projects?: object, defaults?: object}>}
 */
async function readConfig() {
	try {
		if (!existsSync(CONFIG_PATH)) {
			return { projects: {}, defaults: {} };
		}
		const content = await readFile(CONFIG_PATH, 'utf-8');
		return JSON.parse(content);
	} catch (err) {
		console.error('[config/defaults] Failed to read config:', err);
		return { projects: {}, defaults: {} };
	}
}

/**
 * Write the full config file
 * @param {object} config
 */
async function writeConfig(config) {
	// Ensure directory exists
	const dir = dirname(CONFIG_PATH);
	if (!existsSync(dir)) {
		await mkdir(dir, { recursive: true });
	}
	await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * GET /api/config/defaults
 * Returns current defaults merged with default values
 */
/** @type {import('./$types').RequestHandler} */
export async function GET() {
	try {
		// singleFlight: cache + deduplication. Config rarely changes;
		// avoid redundant file reads during event-loop pressure.
		const responseData = await singleFlight('config-defaults', async () => {
			const config = await readConfig();
			const defaults = config.defaults || {};

			// Merge with default values (user values override defaults)
			const merged = { ...SQUAD_DEFAULTS, ...defaults };

			return {
				success: true,
				defaults: merged,
				configPath: CONFIG_PATH
			};
		}, 30000); // 30s TTL — config file changes infrequently

		return json(responseData);
	} catch (error) {
		console.error('[config/defaults] GET error:', error);
		return json({
			error: 'Failed to read defaults',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}

/**
 * PUT /api/config/defaults
 * Update defaults in the config file
 */
/** @type {import('./$types').RequestHandler} */
export async function PUT({ request }) {
	try {
		const body = await request.json();
		const { defaults: newDefaults } = body;

		if (!newDefaults || typeof newDefaults !== 'object') {
			return json({
				error: 'Invalid request',
				message: 'Request body must include a "defaults" object'
			}, { status: 400 });
		}

		// Validate numeric fields
		const numericFields = ['agent_stagger', 'claude_startup_timeout', 'projects_session_height', 'projects_task_height', 'auto_kill_delay', 'max_sessions', 'default_agent_count'];
		for (const field of numericFields) {
			if (field in newDefaults && typeof newDefaults[field] !== 'number') {
				return json({
					error: 'Invalid value',
					message: `${field} must be a number`
				}, { status: 400 });
			}
		}

		// Validate boolean fields
		const booleanFields = ['auto_kill_enabled', 'auto_kill_p0', 'auto_kill_p1', 'auto_kill_p2', 'auto_kill_p3', 'auto_kill_p4', 'skip_permissions', 'ingest_autostart'];
		for (const field of booleanFields) {
			if (field in newDefaults && typeof newDefaults[field] !== 'boolean') {
				return json({
					error: 'Invalid value',
					message: `${field} must be a boolean`
				}, { status: 400 });
			}
		}

		// Validate string array fields
		const stringArrayFields = ['file_watcher_ignored_dirs'];
		for (const field of stringArrayFields) {
			if (field in newDefaults) {
				if (!Array.isArray(newDefaults[field])) {
					return json({
						error: 'Invalid value',
						message: `${field} must be an array`
					}, { status: 400 });
				}
				// Ensure all items are strings
				if (!newDefaults[field].every((item) => typeof item === 'string')) {
					return json({
						error: 'Invalid value',
						message: `${field} must contain only strings`
					}, { status: 400 });
				}
			}
		}

		// Validate model field
		const validModels = ['opus', 'sonnet', 'haiku'];
		if (newDefaults.model && !validModels.includes(newDefaults.model)) {
			return json({
				error: 'Invalid value',
				message: `model must be one of: ${validModels.join(', ')}`
			}, { status: 400 });
		}

		// Read existing config to preserve projects
		const config = await readConfig();

		// Update defaults (merge with existing)
		config.defaults = { ...config.defaults, ...newDefaults };

		// Write back
		await writeConfig(config);

		// Invalidate cached GET response
		apiCache.delete('config-defaults');

		return json({
			success: true,
			defaults: config.defaults,
			message: 'Defaults updated successfully'
		});
	} catch (error) {
		console.error('[config/defaults] PUT error:', error);
		return json({
			error: 'Failed to update defaults',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}

/**
 * DELETE /api/config/defaults
 * Reset defaults to factory values by removing the defaults section from config
 */
/** @type {import('./$types').RequestHandler} */
export async function DELETE() {
	try {
		// Read existing config to preserve projects
		const config = await readConfig();

		// Remove the defaults section entirely - GET will merge with SQUAD_DEFAULTS
		delete config.defaults;

		// Write back (preserves projects and other sections)
		await writeConfig(config);

		// Invalidate cached GET response
		apiCache.delete('config-defaults');

		return json({
			success: true,
			defaults: SQUAD_DEFAULTS,
			message: 'Defaults reset to factory values'
		});
	} catch (error) {
		console.error('[config/defaults] DELETE error:', error);
		return json({
			error: 'Failed to reset defaults',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
