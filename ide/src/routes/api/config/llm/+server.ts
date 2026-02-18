/**
 * LLM Configuration API Endpoint
 *
 * GET /api/config/llm - Get current LLM configuration and provider status
 * PUT /api/config/llm - Update LLM configuration
 *
 * Configuration stored in: ~/.config/squad/projects.json under "llm" key
 *
 * Task: squad-ce8x8 - Implement Claude CLI Fallback Configuration System
 */

import { json } from '@sveltejs/kit';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import type { RequestHandler } from './$types';
import { getLlmConfig, getLlmProviderStatus } from '$lib/server/llmService';
import { LLM_PROVIDER_DEFAULTS, type LlmProviderMode } from '$lib/config/constants';

const CONFIG_PATH = join(homedir(), '.config', 'squad', 'projects.json');

/**
 * GET - Retrieve current LLM configuration and provider status
 */
export const GET: RequestHandler = async () => {
	try {
		const config = getLlmConfig();
		const status = await getLlmProviderStatus();

		return json({
			config,
			status
		});
	} catch (err) {
		console.error('[api/config/llm] Error getting config:', err);
		return json(
			{ error: 'Failed to get LLM configuration' },
			{ status: 500 }
		);
	}
};

/**
 * PUT - Update LLM configuration
 */
export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		// Validate mode
		const validModes: LlmProviderMode[] = ['auto', 'api', 'cli'];
		if (body.mode && !validModes.includes(body.mode)) {
			return json(
				{ error: `Invalid mode: ${body.mode}. Must be one of: ${validModes.join(', ')}` },
				{ status: 400 }
			);
		}

		// Validate CLI model
		const validCliModels = ['haiku', 'sonnet', 'opus'];
		if (body.cli_model && !validCliModels.includes(body.cli_model)) {
			return json(
				{ error: `Invalid CLI model: ${body.cli_model}. Must be one of: ${validCliModels.join(', ')}` },
				{ status: 400 }
			);
		}

		// Validate timeout
		if (body.cli_timeout_ms !== undefined) {
			const timeout = parseInt(body.cli_timeout_ms, 10);
			if (isNaN(timeout) || timeout < 5000 || timeout > 120000) {
				return json(
					{ error: 'CLI timeout must be between 5000 and 120000 milliseconds' },
					{ status: 400 }
				);
			}
		}

		// Load existing config
		let fullConfig: Record<string, unknown> = {};
		if (existsSync(CONFIG_PATH)) {
			try {
				fullConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
			} catch {
				// Start fresh if parse fails
			}
		}

		// Update LLM section
		const llmConfig = {
			mode: body.mode || LLM_PROVIDER_DEFAULTS.mode,
			api_model: body.api_model || LLM_PROVIDER_DEFAULTS.api_model,
			cli_model: body.cli_model || LLM_PROVIDER_DEFAULTS.cli_model,
			cli_timeout_ms: body.cli_timeout_ms ?? LLM_PROVIDER_DEFAULTS.cli_timeout_ms,
			show_provider_status: body.show_provider_status ?? LLM_PROVIDER_DEFAULTS.show_provider_status
		};

		fullConfig.llm = llmConfig;

		// Ensure directory exists
		const configDir = dirname(CONFIG_PATH);
		if (!existsSync(configDir)) {
			mkdirSync(configDir, { recursive: true });
		}

		// Write config
		writeFileSync(CONFIG_PATH, JSON.stringify(fullConfig, null, 2));

		// Get updated status
		const status = await getLlmProviderStatus();

		return json({
			success: true,
			config: llmConfig,
			status
		});
	} catch (err) {
		console.error('[api/config/llm] Error saving config:', err);
		return json(
			{ error: 'Failed to save LLM configuration' },
			{ status: 500 }
		);
	}
};
