/**
 * LLM Service - Centralized LLM provider management
 *
 * Provides a unified interface for making LLM calls across the IDE,
 * handling automatic fallback between Anthropic API and Claude CLI.
 *
 * Features:
 * - Configurable provider mode (auto, api, cli)
 * - Automatic fallback when primary provider unavailable
 * - Centralized error handling
 * - Provider availability detection
 *
 * Usage:
 *   import { llmCall, getLlmProviderStatus } from '$lib/server/llmService';
 *
 *   // Make an LLM call (uses configured provider mode)
 *   const result = await llmCall(prompt, { maxTokens: 500 });
 *
 *   // Check what providers are available
 *   const status = await getLlmProviderStatus();
 *
 * Configuration stored in: ~/.config/squad/projects.json under "llm" key
 *
 * Task: squad-ce8x8 - Implement Claude CLI Fallback Configuration System
 */

import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { getApiKeyWithFallback } from '$lib/utils/credentials';
import { claudeCliCall, isClaudeCliAvailable, type ClaudeCliOptions } from './claudeCli';
import { LLM_PROVIDER_DEFAULTS, type LlmProviderMode } from '$lib/config/constants';

// Configuration path
const CONFIG_PATH = join(homedir(), '.config', 'squad', 'projects.json');

// Response types
export interface LlmResponse {
	/** The response text from the LLM */
	result: string;
	/** Which provider was used */
	provider: 'api' | 'cli';
	/** Token usage (if available) */
	usage?: {
		input_tokens: number;
		output_tokens: number;
		cache_creation_input_tokens?: number;
		cache_read_input_tokens?: number;
	};
	/** Cost in USD (if available, mainly from CLI) */
	cost_usd?: number;
	/** Duration in ms (if available, mainly from CLI) */
	duration_ms?: number;
	/** Model used */
	model?: string;
}

export interface LlmCallOptions {
	/** Maximum tokens for response */
	maxTokens?: number;
	/** Override the model (for API calls: full model ID, for CLI: haiku/sonnet/opus) */
	model?: string;
	/** Override provider mode for this call */
	providerMode?: LlmProviderMode;
	/** Timeout in ms (for CLI calls) */
	timeout?: number;
}

export interface LlmConfig {
	mode: LlmProviderMode;
	api_model: string;
	cli_model: 'haiku' | 'sonnet' | 'opus';
	cli_timeout_ms: number;
	show_provider_status: boolean;
}

export interface LlmProviderStatus {
	/** Currently configured mode */
	mode: LlmProviderMode;
	/** Whether API key is available */
	apiAvailable: boolean;
	/** Whether CLI is available */
	cliAvailable: boolean;
	/** Which provider would be used with current config */
	activeProvider: 'api' | 'cli' | 'none';
	/** Human-readable status message */
	statusMessage: string;
}

/**
 * Load LLM configuration from projects.json
 */
export function getLlmConfig(): LlmConfig {
	try {
		if (!existsSync(CONFIG_PATH)) {
			return { ...LLM_PROVIDER_DEFAULTS };
		}
		const content = readFileSync(CONFIG_PATH, 'utf-8');
		const config = JSON.parse(content);
		const llmConfig = config.llm || {};

		return {
			mode: llmConfig.mode || LLM_PROVIDER_DEFAULTS.mode,
			api_model: llmConfig.api_model || LLM_PROVIDER_DEFAULTS.api_model,
			cli_model: llmConfig.cli_model || LLM_PROVIDER_DEFAULTS.cli_model,
			cli_timeout_ms: llmConfig.cli_timeout_ms ?? LLM_PROVIDER_DEFAULTS.cli_timeout_ms,
			show_provider_status: llmConfig.show_provider_status ?? LLM_PROVIDER_DEFAULTS.show_provider_status
		};
	} catch (err) {
		console.error('[llmService] Failed to load config:', err);
		return { ...LLM_PROVIDER_DEFAULTS };
	}
}

/**
 * Check if API key is available
 */
export function isApiKeyAvailable(): boolean {
	const apiKey = getApiKeyWithFallback('anthropic', 'ANTHROPIC_API_KEY');
	return !!apiKey;
}

/**
 * Get current provider status and availability
 */
export async function getLlmProviderStatus(): Promise<LlmProviderStatus> {
	const config = getLlmConfig();
	const apiAvailable = isApiKeyAvailable();
	const cliAvailable = await isClaudeCliAvailable();

	// Determine which provider would be used
	let activeProvider: 'api' | 'cli' | 'none' = 'none';
	let statusMessage = '';

	switch (config.mode) {
		case 'api':
			if (apiAvailable) {
				activeProvider = 'api';
				statusMessage = 'Using Anthropic API';
			} else {
				statusMessage = 'API mode selected but no API key available';
			}
			break;

		case 'cli':
			if (cliAvailable) {
				activeProvider = 'cli';
				statusMessage = 'Using Claude CLI';
			} else {
				statusMessage = 'CLI mode selected but Claude CLI not available';
			}
			break;

		case 'auto':
		default:
			if (apiAvailable) {
				activeProvider = 'api';
				statusMessage = 'Using Anthropic API (auto mode)';
			} else if (cliAvailable) {
				activeProvider = 'cli';
				statusMessage = 'Using Claude CLI as fallback (no API key)';
			} else {
				statusMessage = 'No LLM provider available - configure API key or install Claude Code';
			}
			break;
	}

	return {
		mode: config.mode,
		apiAvailable,
		cliAvailable,
		activeProvider,
		statusMessage
	};
}

/**
 * Make a direct API call to Anthropic
 */
async function callApi(
	prompt: string,
	options: {
		apiKey: string;
		model: string;
		maxTokens: number;
	}
): Promise<LlmResponse> {
	const response = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': options.apiKey,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model: options.model,
			max_tokens: options.maxTokens,
			messages: [{ role: 'user', content: prompt }]
		})
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Anthropic API error: ${response.status} - ${errorText.slice(0, 200)}`);
	}

	const result = await response.json();
	const textContent = result.content?.find((c: { type?: string; text?: string }) => c.type === 'text');

	if (!textContent?.text) {
		throw new Error('No text response from Anthropic API');
	}

	return {
		result: textContent.text,
		provider: 'api',
		usage: result.usage ? {
			input_tokens: result.usage.input_tokens || 0,
			output_tokens: result.usage.output_tokens || 0,
			cache_creation_input_tokens: result.usage.cache_creation_input_tokens,
			cache_read_input_tokens: result.usage.cache_read_input_tokens
		} : undefined,
		model: options.model
	};
}

/**
 * Make an LLM call using the configured provider
 *
 * @param prompt - The prompt to send to the LLM
 * @param options - Optional overrides for model, tokens, provider mode
 * @returns The response with result, provider info, and usage stats
 * @throws Error if no provider is available or call fails
 */
export async function llmCall(prompt: string, options?: LlmCallOptions): Promise<LlmResponse> {
	const config = getLlmConfig();
	const mode = options?.providerMode || config.mode;
	const maxTokens = options?.maxTokens || 1024;

	// Check availability
	const apiKey = getApiKeyWithFallback('anthropic', 'ANTHROPIC_API_KEY');
	const apiAvailable = !!apiKey;

	// Determine provider based on mode
	switch (mode) {
		case 'api':
			if (!apiAvailable) {
				throw new Error('API mode selected but no Anthropic API key available. Configure in Settings → API Keys or set ANTHROPIC_API_KEY environment variable.');
			}
			return callApi(prompt, {
				apiKey: apiKey!,
				model: options?.model || config.api_model,
				maxTokens
			});

		case 'cli': {
			const cliAvailable = await isClaudeCliAvailable();
			if (!cliAvailable) {
				throw new Error('CLI mode selected but Claude CLI not available. Install Claude Code or switch to API mode.');
			}
			const cliModel = (options?.model as ClaudeCliOptions['model']) || config.cli_model;
			const cliResponse = await claudeCliCall(prompt, {
				model: cliModel,
				timeout: options?.timeout || config.cli_timeout_ms
			});
			return {
				result: cliResponse.result,
				provider: 'cli',
				usage: cliResponse.usage,
				cost_usd: cliResponse.cost_usd,
				duration_ms: cliResponse.duration_ms,
				model: cliResponse.model
			};
		}

		case 'auto':
		default:
			// Try API first, fall back to CLI
			if (apiAvailable) {
				try {
					return await callApi(prompt, {
						apiKey: apiKey!,
						model: options?.model || config.api_model,
						maxTokens
					});
				} catch (apiError) {
					console.warn('[llmService] API call failed, trying CLI fallback:', apiError);
					// Fall through to CLI
				}
			}

			// Try CLI as fallback
			const cliAvailable = await isClaudeCliAvailable();
			if (cliAvailable) {
				try {
					const cliModel = (options?.model as ClaudeCliOptions['model']) || config.cli_model;
					const cliResponse = await claudeCliCall(prompt, {
						model: cliModel,
						timeout: options?.timeout || config.cli_timeout_ms
					});
					return {
						result: cliResponse.result,
						provider: 'cli',
						usage: cliResponse.usage,
						cost_usd: cliResponse.cost_usd,
						duration_ms: cliResponse.duration_ms,
						model: cliResponse.model
					};
				} catch (cliError) {
					throw new Error(`Both API and CLI failed. API: ${apiAvailable ? 'failed' : 'no key'}. CLI error: ${(cliError as Error).message}`);
				}
			}

			// Neither available
			throw new Error(
				'No LLM provider available. Either:\n' +
				'1. Configure Anthropic API key in Settings → API Keys\n' +
				'2. Install Claude Code CLI (https://claude.ai/code)\n' +
				'3. Set ANTHROPIC_API_KEY environment variable'
			);
	}
}

/**
 * Strip markdown code blocks from LLM response (common with JSON output)
 */
export function stripCodeBlocks(text: string): string {
	let result = text.trim();
	if (result.startsWith('```')) {
		result = result.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
	}
	return result;
}

/**
 * Parse JSON from LLM response, handling common formatting issues
 */
export function parseJsonResponse<T>(text: string): T {
	const cleaned = stripCodeBlocks(text);
	return JSON.parse(cleaned);
}
