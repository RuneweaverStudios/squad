/**
 * Commit Message Configuration API
 *
 * GET /api/config/commit-message - Read commit message settings
 * PUT /api/config/commit-message - Update commit message settings
 * DELETE /api/config/commit-message - Reset to defaults
 *
 * Settings are stored in ~/.config/jat/projects.json under commit_message key
 */

import { json } from '@sveltejs/kit';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { COMMIT_MESSAGE_DEFAULTS, type CommitMessageStyle, type CommitMessageModel } from '$lib/config/constants';
import type { RequestHandler } from './$types';

const CONFIG_PATH = join(homedir(), '.config', 'jat', 'projects.json');

interface CommitMessageConfig {
	model?: CommitMessageModel;
	style?: CommitMessageStyle;
	max_tokens?: number;
	include_body?: boolean;
	subject_max_length?: number;
	custom_instructions?: string;
}

interface JatConfig {
	projects?: Record<string, unknown>;
	defaults?: Record<string, unknown>;
	commit_message?: CommitMessageConfig;
}

/**
 * Read the full config file
 */
async function readConfig(): Promise<JatConfig> {
	try {
		if (!existsSync(CONFIG_PATH)) {
			return { projects: {}, defaults: {}, commit_message: {} };
		}
		const content = await readFile(CONFIG_PATH, 'utf-8');
		return JSON.parse(content);
	} catch (err) {
		console.error('[config/commit-message] Failed to read config:', err);
		return { projects: {}, defaults: {}, commit_message: {} };
	}
}

/**
 * Write the full config file
 */
async function writeConfig(config: JatConfig): Promise<void> {
	const dir = dirname(CONFIG_PATH);
	if (!existsSync(dir)) {
		await mkdir(dir, { recursive: true });
	}
	await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Validate model value
 */
function isValidModel(model: string): model is CommitMessageModel {
	return ['claude-3-5-haiku-20241022', 'claude-sonnet-4-20250514'].includes(model);
}

/**
 * Validate style value
 */
function isValidStyle(style: string): style is CommitMessageStyle {
	return ['conventional', 'descriptive', 'imperative', 'gitmoji'].includes(style);
}

/**
 * GET /api/config/commit-message
 * Returns current commit message settings merged with defaults
 */
export const GET: RequestHandler = async () => {
	try {
		const config = await readConfig();
		const commitMessageConfig = config.commit_message || {};

		// Merge with defaults (user values override defaults)
		const merged = { ...COMMIT_MESSAGE_DEFAULTS, ...commitMessageConfig };

		return json({
			success: true,
			config: merged,
			configPath: CONFIG_PATH
		});
	} catch (error) {
		console.error('[config/commit-message] GET error:', error);
		return json({
			error: 'Failed to read commit message configuration',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
};

/**
 * PUT /api/config/commit-message
 * Update commit message settings
 */
export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { config: newConfig } = body;

		if (!newConfig || typeof newConfig !== 'object') {
			return json({
				error: 'Invalid request',
				message: 'Request body must include a "config" object'
			}, { status: 400 });
		}

		// Validate model if provided
		if (newConfig.model !== undefined && !isValidModel(newConfig.model)) {
			return json({
				error: 'Invalid value',
				message: 'model must be one of: claude-3-5-haiku-20241022, claude-sonnet-4-20250514'
			}, { status: 400 });
		}

		// Validate style if provided
		if (newConfig.style !== undefined && !isValidStyle(newConfig.style)) {
			return json({
				error: 'Invalid value',
				message: 'style must be one of: conventional, descriptive, imperative, gitmoji'
			}, { status: 400 });
		}

		// Validate max_tokens if provided
		if (newConfig.max_tokens !== undefined) {
			if (typeof newConfig.max_tokens !== 'number' || newConfig.max_tokens < 100 || newConfig.max_tokens > 2000) {
				return json({
					error: 'Invalid value',
					message: 'max_tokens must be a number between 100 and 2000'
				}, { status: 400 });
			}
		}

		// Validate subject_max_length if provided
		if (newConfig.subject_max_length !== undefined) {
			if (typeof newConfig.subject_max_length !== 'number' || newConfig.subject_max_length < 20 || newConfig.subject_max_length > 120) {
				return json({
					error: 'Invalid value',
					message: 'subject_max_length must be a number between 20 and 120'
				}, { status: 400 });
			}
		}

		// Validate include_body if provided
		if (newConfig.include_body !== undefined && typeof newConfig.include_body !== 'boolean') {
			return json({
				error: 'Invalid value',
				message: 'include_body must be a boolean'
			}, { status: 400 });
		}

		// Validate custom_instructions if provided
		if (newConfig.custom_instructions !== undefined && typeof newConfig.custom_instructions !== 'string') {
			return json({
				error: 'Invalid value',
				message: 'custom_instructions must be a string'
			}, { status: 400 });
		}

		// Read existing config to preserve other sections
		const config = await readConfig();

		// Update commit_message section (merge with existing)
		config.commit_message = { ...config.commit_message, ...newConfig };

		// Write back
		await writeConfig(config);

		// Return merged with defaults for the response
		const merged = { ...COMMIT_MESSAGE_DEFAULTS, ...config.commit_message };

		return json({
			success: true,
			config: merged,
			message: 'Commit message settings updated successfully'
		});
	} catch (error) {
		console.error('[config/commit-message] PUT error:', error);
		return json({
			error: 'Failed to update commit message configuration',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
};

/**
 * DELETE /api/config/commit-message
 * Reset to defaults by removing the commit_message section
 */
export const DELETE: RequestHandler = async () => {
	try {
		// Read existing config to preserve other sections
		const config = await readConfig();

		// Remove the commit_message section
		delete config.commit_message;

		// Write back
		await writeConfig(config);

		return json({
			success: true,
			config: COMMIT_MESSAGE_DEFAULTS,
			message: 'Commit message settings reset to defaults'
		});
	} catch (error) {
		console.error('[config/commit-message] DELETE error:', error);
		return json({
			error: 'Failed to reset commit message configuration',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
};
