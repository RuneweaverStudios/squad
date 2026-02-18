/**
 * State Actions Configuration API
 *
 * GET /api/config/state-actions - Get user's state actions configuration
 * PUT /api/config/state-actions - Update state actions configuration
 * DELETE /api/config/state-actions - Reset to defaults
 *
 * Config file location: ~/.config/squad/state-actions.json
 */

import { json } from '@sveltejs/kit';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { RequestHandler } from './$types';
import {
	type StateActionsUserConfig,
	validateUserConfig,
	createDefaultUserConfig,
	getConfigurableStates,
	BUILTIN_ACTIONS_CATALOG
} from '$lib/config/stateActionsConfig';
import { SESSION_STATE_ACTIONS as DEFAULT_ACTIONS } from '$lib/config/statusColors';

const CONFIG_PATH = join(homedir(), '.config', 'squad', 'state-actions.json');

/**
 * Read user config from file
 */
async function readUserConfig(): Promise<StateActionsUserConfig | null> {
	try {
		if (!existsSync(CONFIG_PATH)) {
			return null;
		}
		const content = await readFile(CONFIG_PATH, 'utf-8');
		const parsed = JSON.parse(content);

		if (!validateUserConfig(parsed)) {
			console.warn('[state-actions] Invalid config file, ignoring');
			return null;
		}

		return parsed;
	} catch (err) {
		console.error('[state-actions] Failed to read config:', err);
		return null;
	}
}

/**
 * Write user config to file
 */
async function writeUserConfig(config: StateActionsUserConfig): Promise<void> {
	const dir = dirname(CONFIG_PATH);
	if (!existsSync(dir)) {
		await mkdir(dir, { recursive: true });
	}
	await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * GET /api/config/state-actions
 *
 * Returns the user's state actions configuration along with:
 * - defaults: The default actions for each state
 * - available: Catalog of available built-in actions
 * - states: List of configurable states
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const userConfig = await readUserConfig();
		const includeDefaults = url.searchParams.get('includeDefaults') !== 'false';

		const response: {
			success: boolean;
			config: StateActionsUserConfig | null;
			configPath: string;
			defaults?: Record<string, unknown[]>;
			available?: typeof BUILTIN_ACTIONS_CATALOG;
			states?: string[];
		} = {
			success: true,
			config: userConfig,
			configPath: CONFIG_PATH
		};

		if (includeDefaults) {
			response.defaults = DEFAULT_ACTIONS;
			response.available = BUILTIN_ACTIONS_CATALOG;
			response.states = getConfigurableStates();
		}

		return json(response);
	} catch (error) {
		console.error('[state-actions] GET error:', error);
		return json(
			{
				error: 'Failed to read state actions config',
				message: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
};

/**
 * PUT /api/config/state-actions
 *
 * Update the user's state actions configuration
 *
 * Body: StateActionsUserConfig
 */
export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		if (!validateUserConfig(body)) {
			return json(
				{
					error: 'Invalid configuration',
					message: 'Config must be a valid StateActionsUserConfig object'
				},
				{ status: 400 }
			);
		}

		await writeUserConfig(body);

		return json({
			success: true,
			config: body,
			message: 'State actions configuration saved'
		});
	} catch (error) {
		console.error('[state-actions] PUT error:', error);
		return json(
			{
				error: 'Failed to save state actions config',
				message: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
};

/**
 * PATCH /api/config/state-actions
 *
 * Update a single state's action configuration
 *
 * Body: { state: SessionState, actions: UserActionConfig[], includeDefaults?: boolean }
 */
export const PATCH: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { state, actions, includeDefaults } = body;

		// Validate state
		if (!state || !getConfigurableStates().includes(state)) {
			return json(
				{
					error: 'Invalid state',
					message: `State must be one of: ${getConfigurableStates().join(', ')}`
				},
				{ status: 400 }
			);
		}

		// Validate actions array
		if (!Array.isArray(actions)) {
			return json(
				{
					error: 'Invalid actions',
					message: 'Actions must be an array'
				},
				{ status: 400 }
			);
		}

		// Read existing config or create new
		let config = await readUserConfig();
		if (!config) {
			config = createDefaultUserConfig();
		}

		// Update the specific state
		config.states[state as keyof typeof config.states] = {
			actions,
			includeDefaults: includeDefaults !== false
		};

		await writeUserConfig(config);

		return json({
			success: true,
			config,
			message: `Actions for state "${state}" updated`
		});
	} catch (error) {
		console.error('[state-actions] PATCH error:', error);
		return json(
			{
				error: 'Failed to update state actions',
				message: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
};

/**
 * DELETE /api/config/state-actions
 *
 * Reset configuration to defaults (deletes config file)
 *
 * Query params:
 *   - state: If provided, only reset that state's config
 */
export const DELETE: RequestHandler = async ({ url }) => {
	try {
		const stateParam = url.searchParams.get('state');

		if (stateParam) {
			// Reset single state
			if (!getConfigurableStates().includes(stateParam as any)) {
				return json(
					{
						error: 'Invalid state',
						message: `State must be one of: ${getConfigurableStates().join(', ')}`
					},
					{ status: 400 }
				);
			}

			let config = await readUserConfig();
			if (config && config.states[stateParam as keyof typeof config.states]) {
				delete config.states[stateParam as keyof typeof config.states];
				await writeUserConfig(config);
			}

			return json({
				success: true,
				message: `Actions for state "${stateParam}" reset to defaults`
			});
		} else {
			// Reset all - delete the file
			if (existsSync(CONFIG_PATH)) {
				const { unlink } = await import('fs/promises');
				await unlink(CONFIG_PATH);
			}

			return json({
				success: true,
				message: 'All state actions reset to defaults'
			});
		}
	} catch (error) {
		console.error('[state-actions] DELETE error:', error);
		return json(
			{
				error: 'Failed to reset state actions',
				message: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
};
