/**
 * GET /api/agents/[name]/usage
 *
 * Returns token usage data for a specific agent.
 *
 * Query parameters:
 * - range: 'today' | 'week' | 'all' (default: 'all')
 *
 * Response:
 * {
 *   agent: string,
 *   range: string,
 *   usage: {
 *     input_tokens: number,
 *     cache_creation_input_tokens: number,
 *     cache_read_input_tokens: number,
 *     output_tokens: number,
 *     total_tokens: number,
 *     cost: number,
 *     sessionCount: number
 *   },
 *   cached: boolean,
 *   timestamp: string
 * }
 */

import { json } from '@sveltejs/kit';
import { getAgentUsage } from '$lib/utils/tokenUsage';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Simple in-memory cache with 1-minute TTL
const cache = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute
const MAX_CACHE_ENTRIES = 200;

function pruneCache() {
	const now = Date.now();
	for (const [key, entry] of cache.entries()) {
		if (now - entry.timestamp > CACHE_TTL) {
			cache.delete(key);
		}
	}

	if (cache.size <= MAX_CACHE_ENTRIES) return;

	const entries = Array.from(cache.entries())
		.sort((a, b) => a[1].timestamp - b[1].timestamp);
	const excess = cache.size - MAX_CACHE_ENTRIES;
	for (let i = 0; i < excess; i++) {
		cache.delete(entries[i][0]);
	}
}

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, url }) {
	const agentName = params.name;
	const range = url.searchParams.get('range') || 'all';

	// Validate range parameter
	if (!['today', 'week', 'all'].includes(range)) {
		return json(
			{
				error: 'Invalid range parameter. Must be one of: today, week, all'
			},
			{ status: 400 }
		);
	}

	pruneCache();

	// Check cache
	const cacheKey = `${agentName}:${range}`;
	const cached = cache.get(cacheKey);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		return json({
			...cached.data,
			cached: true
		});
	}

	try {
		// Verify agent exists using am-agents
		const { stdout } = await execAsync('am-agents --json');
		/** @type {Array<{name: string}>} */
		const agents = JSON.parse(stdout);
		const agentExists = agents.some((/** @type {{name: string}} */ agent) => agent.name === agentName);

		if (!agentExists) {
			return json(
				{
					error: `Agent '${agentName}' not found`,
					availableAgents: agents.map((/** @type {{name: string}} */ a) => a.name)
				},
				{ status: 404 }
			);
		}

		// Get project path (parent of ide directory)
		const projectPath = process.cwd().replace('/ide', '');

		// Get token usage for agent
		const usage = await getAgentUsage(agentName, /** @type {'today'|'week'|'all'} */ (range), projectPath);

		const response = {
			agent: agentName,
			range,
			usage: {
				input_tokens: usage.input_tokens,
				cache_creation_input_tokens: usage.cache_creation_input_tokens,
				cache_read_input_tokens: usage.cache_read_input_tokens,
				output_tokens: usage.output_tokens,
				total_tokens: usage.total_tokens,
				cost: usage.cost,
				sessionCount: usage.sessionCount
			},
			cached: false,
			timestamp: new Date().toISOString()
		};

		// Cache the response
		cache.set(cacheKey, {
			data: response,
			timestamp: Date.now()
		});

		return json(response);
	} catch (error) {
		console.error(`Error fetching usage for agent ${agentName}:`, error);
		const err = error instanceof Error ? error : new Error(String(error));

		// Handle specific error types
		if (err.message?.includes('ENOENT')) {
			return json(
				{
					error: 'Token usage data not found',
					details: 'No JSONL session files found for this agent',
					agent: agentName,
					range
				},
				{ status: 404 }
			);
		}

		if (err.message?.includes('JSON')) {
			return json(
				{
					error: 'Failed to parse token usage data',
					details: 'JSONL files may be malformed',
					agent: agentName,
					range
				},
				{ status: 500 }
			);
		}

		// Generic error
		return json(
			{
				error: 'Failed to fetch token usage',
				details: err.message,
				agent: agentName,
				range
			},
			{ status: 500 }
		);
	}
}
