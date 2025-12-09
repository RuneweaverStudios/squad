/**
 * Claude API Usage Metrics Endpoint
 *
 * Returns Claude API usage metrics including:
 * - Subscription tier (from ~/.claude/.credentials.json)
 * - Rate limits for the tier
 * - Session context (placeholder - requires API integration)
 * - Agent metrics (placeholder - requires am-agents integration)
 *
 * Task: jat-sk1 - Claude API usage data fetching
 */

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getClaudeUsageMetrics } from '$lib/utils/claudeUsageMetrics';

export async function GET({ request }) {
	try {
		// Set environment variable for utility to access
		// SvelteKit requires using $env/dynamic/private to access .env variables
		if (env.ANTHROPIC_API_KEY) {
			process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
		}

		// Fetch metrics using server-side utility
		const metrics = await getClaudeUsageMetrics();

		return json(metrics);
	} catch (error) {
		const err = /** @type {Error} */ (error);
		console.error('Error fetching Claude usage metrics:', err);

		// Return error response with fallback data
		return json({
			tier: 'free',
			tierLimits: {
				tokensPerMin: 50_000,
				tokensPerDay: 150_000,
				requestsPerMin: 50,
				requestsPerDay: 100
			},
			sessionContext: null,
			agentMetrics: null,
			burnRate: null,
			lastUpdated: new Date(),
			cacheHit: false,
			errors: [err.message || 'Failed to fetch metrics']
		}, { status: 500 });
	}
}
