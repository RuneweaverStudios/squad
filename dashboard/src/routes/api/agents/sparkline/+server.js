/**
 * Sparkline API Endpoint with Caching
 *
 * GET /api/agents/sparkline?range=24h&agent=AgentName&session=sessionId
 * GET /api/agents/sparkline?range=24h&multiProject=true
 * GET /api/agents/sparkline?range=24h&multiProject=true&agent=AgentName  (NEW!)
 *
 * Returns time-series token usage data for sparkline visualization.
 *
 * Query Parameters:
 * - range: Time range (24h | 7d | all) - defaults to 24h
 * - agent: Agent name filter (optional, but required with multiProject for per-agent view)
 * - session: Session ID filter (optional)
 * - bucketSize: Time bucket size (30min | hour | session) - defaults to 30min
 * - multiProject: Return multi-project data with per-project breakdown (optional, boolean)
 *
 * Mode combinations:
 * - agent only: Single-project sparkline for that agent
 * - multiProject only: System-wide multi-project sparkline (all agents)
 * - multiProject + agent: Per-agent multi-project sparkline (only projects this agent worked on)
 *
 * Response Format (single project / default):
 * {
 *   data: [{ timestamp, tokens, cost, breakdown }, ...],
 *   totalTokens: number,
 *   totalCost: number,
 *   bucketCount: number,
 *   bucketSize: string,
 *   startTime: string,
 *   endTime: string,
 *   cached: boolean,
 *   cacheAge: number
 * }
 *
 * Response Format (multiProject=true):
 * {
 *   data: [{ timestamp, totalTokens, totalCost, projects: [{ project, tokens, cost, color }] }, ...],
 *   totalTokens: number,
 *   totalCost: number,
 *   bucketCount: number,
 *   bucketSize: string,
 *   startTime: string,
 *   endTime: string,
 *   projectKeys: string[],
 *   projectColors: Record<string, string>,
 *   cached: boolean,
 *   cacheAge: number
 * }
 *
 * Caching:
 * - 30-second TTL per unique query combination
 * - In-memory Map-based cache
 * - Cache key: `${range}-${agent}-${session}-${bucketSize}-${multiProject}`
 * - Performance: <5ms (cache hit), <100ms (cache miss)
 */

import { json } from '@sveltejs/kit';
import { getTokenTimeSeries, getMultiProjectTimeSeries, getMultiProjectTimeSeriesAsync, getAgentMultiProjectTimeSeries } from '$lib/utils/tokenUsageTimeSeries.js';

// ============================================================================
// In-Memory Cache
// ============================================================================

/**
 * Cache entry structure
 * @typedef {Object} CacheEntry
 * @property {any} data - Cached response data
 * @property {number} timestamp - Cache creation timestamp
 */

/**
 * In-memory cache for sparkline data
 * Key format: `${range}-${agent}-${session}-${bucketSize}`
 * @type {Map<string, CacheEntry>}
 */
const cache = new Map();

/**
 * Cache TTL in milliseconds (5 minutes) - after this, cache is "stale"
 * Stale data can still be returned while revalidating in background
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Maximum stale age in milliseconds (30 minutes)
 * After this, stale data is too old to return even while revalidating
 */
const CACHE_MAX_STALE_MS = 30 * 60 * 1000;

/**
 * Track which keys are currently being refreshed (prevent parallel refreshes)
 * @type {Set<string>}
 */
const refreshingKeys = new Set();

/**
 * Get cached data with stale-while-revalidate semantics
 *
 * @param {string} key - Cache key
 * @returns {{data: any, age: number, isStale: boolean}|null} Cached data or null if missing/too old
 */
function getCached(key) {
	const entry = cache.get(key);
	if (!entry) {
		return null;
	}

	const age = Date.now() - entry.timestamp;

	// If too old (beyond max stale), don't return
	if (age > CACHE_MAX_STALE_MS) {
		cache.delete(key);
		return null;
	}

	// Return data with stale flag
	return {
		data: entry.data,
		age,
		isStale: age > CACHE_TTL_MS
	};
}

/**
 * Store data in cache
 *
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 */
function setCache(key, data) {
	cache.set(key, {
		data,
		timestamp: Date.now()
	});
}

/**
 * Generate cache key from query parameters
 *
 * @param {Object} params - Query parameters
 * @param {string} [params.range] - Time range
 * @param {string} [params.agent] - Agent name
 * @param {string} [params.session] - Session ID
 * @param {string} [params.bucketSize] - Bucket size
 * @param {boolean} [params.multiProject] - Multi-project mode
 * @returns {string} Cache key
 */
function getCacheKey(params) {
	const { range = '24h', agent = '', session = '', bucketSize = '30min', multiProject = false } = params;
	return `${range}-${agent}-${session}-${bucketSize}-${multiProject}`;
}

// ============================================================================
// API Handler
// ============================================================================

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
	try {
		// Extract query parameters
		const range = url.searchParams.get('range') || '24h';
		const agentName = url.searchParams.get('agent') || undefined;
		const sessionId = url.searchParams.get('session') || undefined;
		const bucketSize = url.searchParams.get('bucketSize') || '30min';
		const multiProject = url.searchParams.get('multiProject') === 'true';

		// Validate parameters
		if (!['24h', '7d', 'all'].includes(range)) {
			return json(
				{
					error: 'Invalid range parameter',
					message: 'Range must be: 24h, 7d, or all',
					validValues: ['24h', '7d', 'all']
				},
				{ status: 400 }
			);
		}

		if (!['30min', 'hour', 'session'].includes(bucketSize)) {
			return json(
				{
					error: 'Invalid bucketSize parameter',
					message: 'Bucket size must be: 30min, hour, or session',
					validValues: ['30min', 'hour', 'session']
				},
				{ status: 400 }
			);
		}

		// Generate cache key
		const cacheKey = getCacheKey({ range, agent: agentName, session: sessionId, bucketSize, multiProject });

		// Check cache
		const cached = getCached(cacheKey);
		if (cached) {
			console.log(`[Sparkline API] Cache HIT for ${cacheKey} (age: ${cached.age}ms)`);

			return json({
				...cached.data,
				cached: true,
				cacheAge: cached.age
			});
		}

		console.log(`[Sparkline API] Cache MISS for ${cacheKey}, fetching data...`);

		// Fetch data (cache miss)
		const startTime = Date.now();

		let result;

		// Cast range and bucketSize to expected types since we validated them above
		/** @type {'24h' | '7d' | 'all'} */
		const validatedRange = /** @type {'24h' | '7d' | 'all'} */ (range);
		/** @type {'30min' | 'hour' | 'session'} */
		const validatedBucketSize = /** @type {'30min' | 'hour' | 'session'} */ (bucketSize);

		if (multiProject && agentName) {
			// Per-agent multi-project mode: filter multi-project data by agent's sessions
			result = await getAgentMultiProjectTimeSeries({
				agentName,
				range: validatedRange,
				bucketSize: validatedBucketSize
			});
		} else if (multiProject) {
			// System-wide multi-project mode: aggregate across all projects from jat config
			// Using async worker thread version to avoid blocking the event loop
			result = await getMultiProjectTimeSeriesAsync({
				range: validatedRange,
				bucketSize: validatedBucketSize
			});
		} else {
			// Single-project mode: use existing logic
			// Get project path (dashboard runs from /dashboard subdirectory)
			const projectPath = process.cwd().replace(/\/dashboard$/, '');

			result = await getTokenTimeSeries({
				range: validatedRange,
				agentName,
				sessionId,
				bucketSize: validatedBucketSize,
				projectPath
			});
		}

		const fetchDuration = Date.now() - startTime;
		console.log(
			`[Sparkline API] Fetched ${result.bucketCount} buckets in ${fetchDuration}ms (${result.totalTokens.toLocaleString()} tokens)${multiProject ? ' [multi-project]' : ''}`
		);

		// Cache the result
		setCache(cacheKey, result);

		// Return result with cache metadata
		return json({
			...result,
			cached: false,
			cacheAge: 0,
			fetchDuration
		});
	} catch (error) {
		console.error('[Sparkline API] Error:', error);
		const err = /** @type {Error} */ (error);
		console.error('[Sparkline API] Error stack:', err.stack);

		return json(
			{
				error: 'Failed to fetch sparkline data',
				message: err.message || 'Unknown error',
				stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
			},
			{ status: 500 }
		);
	}
}

/**
 * Clear cache (for testing/debugging)
 *
 * DELETE /api/agents/sparkline
 */
export async function DELETE() {
	const cacheSize = cache.size;
	cache.clear();

	return json({
		success: true,
		message: `Cache cleared (${cacheSize} entries removed)`,
		clearedEntries: cacheSize
	});
}
