/**
 * JAT Defaults API
 * GET /api/config/defaults - Read JAT defaults from ~/.config/jat/projects.json
 * PUT /api/config/defaults - Update JAT defaults
 */

import { json } from '@sveltejs/kit';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const CONFIG_PATH = join(homedir(), '.config', 'jat', 'projects.json');

// Default values
const DEFAULT_CONFIG = {
	terminal: 'alacritty',
	editor: 'code',
	tools_path: '~/.local/bin',
	claude_flags: '--dangerously-skip-permissions',
	model: 'opus',
	agent_stagger: 15,
	claude_startup_timeout: 20
};

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
		const config = await readConfig();
		const defaults = config.defaults || {};

		// Merge with default values (user values override defaults)
		const merged = { ...DEFAULT_CONFIG, ...defaults };

		return json({
			success: true,
			defaults: merged,
			configPath: CONFIG_PATH
		});
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
		const numericFields = ['agent_stagger', 'claude_startup_timeout'];
		for (const field of numericFields) {
			if (field in newDefaults && typeof newDefaults[field] !== 'number') {
				return json({
					error: 'Invalid value',
					message: `${field} must be a number`
				}, { status: 400 });
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

		// Remove the defaults section entirely - GET will merge with DEFAULT_CONFIG
		delete config.defaults;

		// Write back (preserves projects and other sections)
		await writeConfig(config);

		return json({
			success: true,
			defaults: DEFAULT_CONFIG,
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
