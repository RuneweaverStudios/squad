/**
 * Agent Models API Endpoint
 *
 * Fetches available models dynamically from provider APIs.
 * Supports: Anthropic, OpenAI, Google, OpenRouter
 *
 * Endpoints:
 * - GET: Fetch models for an agent program with caching
 *
 * Storage: In-memory cache (5-10 min TTL)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AGENT_PRESETS, type AgentModel } from '$lib/types/agentProgram';
import { getAgentProgram } from '$lib/utils/agentConfig';
import { getApiKeyWithFallback } from '$lib/utils/credentials';

// In-memory cache for model lists
interface CacheEntry {
	models: AgentModel[];
	timestamp: number;
	provider: string;
}

const modelCache = new Map<string, CacheEntry>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes in milliseconds

// Provider API configurations
const PROVIDER_APIS: Record<string, {
	url: string;
	headers: (apiKey: string) => Record<string, string>;
	transform: (data: unknown) => AgentModel[];
}> = {
	anthropic: {
		url: 'https://api.anthropic.com/v1/models',
		headers: (apiKey) => ({
			'x-api-key': apiKey,
			'anthropic-version': '2023-06-01'
		}),
		transform: (data) => {
			const response = data as { data?: Array<{ id: string; display_name?: string }> };
			if (!response.data || !Array.isArray(response.data)) return [];

			return response.data
				.filter((m) => m.id && !m.id.includes('embed'))
				.map((m) => {
					const context = (m as { max_tokens?: number; context_window?: number; context_length?: number }).max_tokens
						|| (m as { context_window?: number }).context_window
						|| (m as { context_length?: number }).context_length;
					return {
						id: m.id,
						shortName: m.id,
						name: m.display_name || m.id,
						costTier: estimateCostTier(m.id),
						description: formatContextDescription(context)
					};
				});
		}
	},
	openai: {
		url: 'https://api.openai.com/v1/models',
		headers: (apiKey) => ({
			'Authorization': `Bearer ${apiKey}`
		}),
		transform: (data) => {
			const response = data as { data?: Array<{ id: string }> };
			if (!response.data || !Array.isArray(response.data)) return [];

			return response.data
				.filter((m) => m.id && (m.id.includes('gpt') || m.id.includes('o1') || m.id.includes('o3') || m.id.includes('o4') || m.id.includes('codex')))
				.map((m) => ({
					id: m.id,
					shortName: m.id,
					name: m.id,
					costTier: estimateCostTier(m.id)
				}));
		}
	},
	google: {
		url: 'https://generativelanguage.googleapis.com/v1beta/models',
		headers: () => ({}), // API key is in query param
		transform: (data) => {
			const response = data as { models?: Array<{ name: string; displayName?: string }> };
			if (!response.models || !Array.isArray(response.models)) return [];

			return response.models
				.filter((m) => m.name && m.name.includes('gemini'))
				.map((m) => {
					const id = m.name.replace('models/', '');
					const inputLimit = (m as { inputTokenLimit?: number }).inputTokenLimit;
					const outputLimit = (m as { outputTokenLimit?: number }).outputTokenLimit;
					const contextDescription = inputLimit || outputLimit
						? `Context: ${inputLimit ? `${inputLimit.toLocaleString()} in` : ''}${inputLimit && outputLimit ? ' / ' : ''}${outputLimit ? `${outputLimit.toLocaleString()} out` : ''}`
						: undefined;
					return {
						id,
						shortName: id,
						name: m.displayName || id,
						costTier: estimateCostTier(id),
						description: contextDescription
					};
				});
		}
	},
	openrouter: {
		url: 'https://openrouter.ai/api/v1/models',
		headers: (apiKey) => ({
			'Authorization': `Bearer ${apiKey}`
		}),
		transform: (data) => {
			const response = data as { data?: Array<{ id: string; name?: string; pricing?: { prompt?: number; completion?: number } }> };
			if (!response.data || !Array.isArray(response.data)) return [];

			return response.data
				.filter((m) => m.id)
				.map((m) => {
					const context = (m as { context_length?: number }).context_length;
					const fullId = `openrouter/${m.id}`;
					return {
						id: fullId,
						shortName: fullId,
						name: m.name || m.id,
						costTier: estimateOpenRouterCostTier(m.pricing),
						description: formatContextDescription(context)
					};
				});
		}
	},
};

/**
 * Format context window description
 */
function formatContextDescription(context?: number): string | undefined {
	if (!context || Number.isNaN(context)) return undefined;
	return `Context: ${context.toLocaleString()} tokens`;
}

/**
 * Estimate cost tier based on model ID heuristics
 */
function estimateCostTier(modelId: string): 'low' | 'medium' | 'high' {
	const id = modelId.toLowerCase();

	// Low cost indicators
	if (id.includes('haiku') || id.includes('mini') || id.includes('flash') || id.includes('lite')) {
		return 'low';
	}

	// High cost indicators
	if (id.includes('opus') || id.includes('o1-') || id.includes('o3') || id.includes('pro') || id.includes('preview')) {
		return 'high';
	}

	// Medium is default
	return 'medium';
}

/**
 * Estimate OpenRouter cost tier based on pricing
 */
function estimateOpenRouterCostTier(pricing?: { prompt?: number; completion?: number }): 'low' | 'medium' | 'high' {
	if (!pricing) return 'medium';

	const promptCost = pricing.prompt || 0;
	const completionCost = pricing.completion || 0;
	const avgCost = (promptCost + completionCost) / 2;

	// Less than $0.50 per million tokens
	if (avgCost < 0.5) return 'low';

	// More than $5 per million tokens
	if (avgCost > 5) return 'high';

	return 'medium';
}

/**
 * Fetch models from a provider API
 */
async function fetchModelsFromProvider(provider: string, apiKey: string): Promise<AgentModel[]> {
	const config = PROVIDER_APIS[provider];
	if (!config) {
		throw new Error(`Unknown provider: ${provider}`);
	}

	// Special handling for Google (API key in query param)
	let url = config.url;
	if (provider === 'google') {
		url = `${url}?key=${encodeURIComponent(apiKey)}`;
	}

	const response = await fetch(url, {
		method: 'GET',
		headers: config.headers(apiKey)
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`API error: ${response.status} - ${errorText.slice(0, 200)}`);
	}

	const data = await response.json();
	return config.transform(data);
}

/**
 * Infer the provider for an agent when apiKeyProvider is not set.
 * Maps agent IDs/commands to their expected provider APIs.
 */
function inferProvider(agentId: string, command?: string): string {
	const id = agentId.toLowerCase();
	const cmd = (command || '').toLowerCase();

	if (id.includes('codex') || cmd === 'codex') return 'openai';
	if (id.includes('gemini') || cmd === 'gemini') return 'google';
	if (id.includes('openrouter')) return 'openrouter';
	if (id.includes('claude') || cmd === 'claude') return 'anthropic';
	if (id.includes('aider') || cmd === 'aider') return 'anthropic';
	if (id.includes('opencode') || cmd === 'opencode') return 'openrouter';

	return 'anthropic'; // default fallback
}

/**
 * GET /api/config/agents/[id]/models
 *
 * Fetch available models for an agent program.
 * Returns cached results if available and fresh.
 *
 * Query params:
 * - provider: Override provider (e.g., 'openrouter')
 * - force: Force refresh cache
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const agentId = params.id;
	const forceRefresh = url.searchParams.get('force') === 'true';
	const overrideProvider = url.searchParams.get('provider');

	try {
		// Get the agent program
		const agent = getAgentProgram(agentId);
		if (!agent) {
			return json(
				{ success: false, error: `Agent program '${agentId}' not found` },
				{ status: 404 }
			);
		}

		// Determine which provider to use
		const provider = overrideProvider || agent.apiKeyProvider || inferProvider(agentId, agent.command);

		// Check cache
		const cacheKey = `${agentId}:${provider}`;
		const cached = modelCache.get(cacheKey);
		const now = Date.now();

		if (!forceRefresh && cached && (now - cached.timestamp) < CACHE_TTL) {
			return json({
				success: true,
				models: cached.models,
				source: 'cache',
				cachedAt: new Date(cached.timestamp).toISOString(),
				provider
			});
		}

		// Standard provider flow: requires API key
		const apiKeyEnvVar = provider === 'openrouter' ? 'OPENROUTER_API_KEY' :
			provider === 'google' ? 'GOOGLE_API_KEY' :
			`${provider.toUpperCase()}_API_KEY`;

		const apiKey = getApiKeyWithFallback(provider, apiKeyEnvVar);

		// If no API key, fall back to hardcoded models
		if (!apiKey) {
			// Get preset models as fallback
			const preset = AGENT_PRESETS.find((p) => p.id === agentId);
			const fallbackModels = preset?.config.models || agent.models || [];

			return json({
				success: true,
				models: fallbackModels,
				source: 'fallback',
				reason: `No API key configured for ${provider}`,
				provider
			});
		}

		// Fetch from provider API
		const models = await fetchModelsFromProvider(provider, apiKey);

		// Cache the results
		modelCache.set(cacheKey, {
			models,
			timestamp: now,
			provider
		});

		return json({
			success: true,
			models,
			source: 'api',
			provider,
			count: models.length
		});

	} catch (error) {
		console.error(`Error fetching models for agent ${agentId}:`, error);

		// Fall back to hardcoded models on error
		const agent = getAgentProgram(agentId);
		const preset = AGENT_PRESETS.find((p) => p.id === agentId);
		const fallbackModels = preset?.config.models || agent?.models || [];

		return json({
			success: true,
			models: fallbackModels,
			source: 'fallback',
			reason: error instanceof Error ? error.message : 'Unknown error',
			provider: agent?.apiKeyProvider || 'unknown'
		});
	}
};

/**
 * Clear the model cache (useful for testing or admin operations)
 * Note: Exported with underscore prefix as it's not a SvelteKit endpoint export
 */
export function _clearModelCache(): void {
	modelCache.clear();
}

/**
 * Get cache statistics
 * Note: Exported with underscore prefix as it's not a SvelteKit endpoint export
 */
export function _getCacheStats(): { size: number; entries: string[] } {
	return {
		size: modelCache.size,
		entries: Array.from(modelCache.keys())
	};
}
