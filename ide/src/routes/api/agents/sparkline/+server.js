/**
 * Sparkline API Endpoint with Caching
 *
 * GET /api/agents/sparkline?range=24h&agent=AgentName&session=sessionId
 * GET /api/agents/sparkline?range=24h&multiProject=true
 * GET /api/agents/sparkline?range=24h&multiProject=true&agent=AgentName
 * GET /api/agents/sparkline?source=sqlite&range=24h  (SQLite data source)
 *
 * Returns time-series token usage data for sparkline visualization.
 *
 * Query Parameters:
 * - range: Time range (24h | 7d | all) - defaults to 24h
 * - agent: Agent name filter (optional, but required with multiProject for per-agent view)
 * - session: Session ID filter (optional)
 * - bucketSize: Time bucket size (30min | hour | session) - defaults to 30min
 * - multiProject: Return multi-project data with per-project breakdown (optional, boolean)
 * - source: Data source (sqlite | jsonl) - defaults to jsonl
 *   - sqlite: Uses pre-aggregated SQLite data (~1-5ms query time)
 *   - jsonl: Parses JSONL files directly (~100-5000ms depending on data volume)
 *   - Falls back to JSONL if SQLite has no data
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
 *   cacheAge: number,
 *   source: string
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
 *   cacheAge: number,
 *   source: string
 * }
 *
 * Caching:
 * - 5-minute TTL per unique query combination
 * - In-memory Map-based cache
 * - Cache key: `${range}-${agent}-${session}-${bucketSize}-${multiProject}-${source}`
 * - Performance: <5ms (cache hit), <100ms (SQLite cache miss), <5000ms (JSONL cache miss)
 */

import { json } from '@sveltejs/kit';
import { getTokenTimeSeries, getMultiProjectTimeSeries, getMultiProjectTimeSeriesAsync, getAgentMultiProjectTimeSeries } from '$lib/utils/tokenUsageTimeSeries.js';
import { getHourlyBreakdown, getUsageByProject, runAggregation, getDatabaseStats } from '$lib/server/tokenUsageDb.js';
import { getAllProjects } from '$lib/utils/projectConfig';

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
 * Prevent unbounded cache growth (session ids can be high-cardinality)
 */
const MAX_CACHE_ENTRIES = 200;

/**
 * Track which keys are currently being refreshed (prevent parallel refreshes)
 * @type {Set<string>}
 */
const refreshingKeys = new Set();

/**
 * Remove expired entries and cap cache size.
 */
function pruneCache() {
	const now = Date.now();
	for (const [key, entry] of cache.entries()) {
		if (now - entry.timestamp > CACHE_MAX_STALE_MS) {
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
 * @param {string} [params.source] - Data source (sqlite or jsonl)
 * @returns {string} Cache key
 */
function getCacheKey(params) {
	const { range = '24h', agent = '', session = '', bucketSize = '30min', multiProject = false, source = 'jsonl' } = params;
	return `${range}-${agent}-${session}-${bucketSize}-${multiProject}-${source}`;
}

// ============================================================================
// SQLite Query Functions
// ============================================================================

/**
 * Get project colors from SQUAD config
 * Falls back to a default color for unknown projects
 * @returns {Record<string, string>}
 */
function getProjectColors() {
	const projects = getAllProjects();
	/** @type {Record<string, string>} */
	const colors = {};
	for (const [key, config] of projects) {
		colors[key] = config.activeColor || '#888888';
	}
	colors.other = '#8b5cf6'; // Fallback for unknown projects
	return colors;
}

/**
 * Get time range boundaries based on range parameter
 * @param {'24h' | '7d' | 'all'} range
 * @returns {{ startTime: Date, endTime: Date }}
 */
function getTimeRange(range) {
	const now = new Date();
	let startTime;

	switch (range) {
		case '24h':
			startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
			break;
		case '7d':
			startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
			break;
		case 'all':
			// Start from 30 days ago for 'all' range
			startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
			break;
		default:
			startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
	}

	return { startTime, endTime: now };
}

/**
 * @typedef {Object} SparklineResult
 * @property {any[]} data - Time series data
 * @property {number} totalTokens - Total tokens
 * @property {number} totalCost - Total cost
 * @property {number} bucketCount - Number of buckets
 * @property {string} bucketSize - Bucket size
 * @property {string} startTime - Start time ISO string
 * @property {string} endTime - End time ISO string
 * @property {string[]} [projectKeys] - Project keys (multiProject only)
 * @property {Record<string, string>} [projectColors] - Project colors (multiProject only)
 */

/**
 * Fetch sparkline data from SQLite database
 *
 * @param {Object} options
 * @param {'24h' | '7d' | 'all'} options.range - Time range
 * @param {'30min' | 'hour' | 'session'} options.bucketSize - Bucket size
 * @param {string} [options.agentName] - Agent name filter
 * @param {boolean} [options.multiProject] - Multi-project mode
 * @returns {Promise<SparklineResult|null>} Sparkline result or null if no data
 */
async function fetchFromSQLite({ range, bucketSize, agentName, multiProject }) {
	const { startTime, endTime } = getTimeRange(range);

	// Convert bucketSize to minutes for getHourlyBreakdown
	const bucketMinutes = bucketSize === '30min' ? 30 : 60;

	if (multiProject) {
		// Multi-project mode: get usage by project
		const PROJECT_COLORS = getProjectColors(); // Get colors from SQUAD config
		const projectData = getUsageByProject(startTime, endTime);

		if (!projectData || projectData.length === 0) {
			return null;
		}

		// Group by timestamp and aggregate per-project data
		/** @type {Map<string, { totalTokens: number, totalCost: number, projects: Array<{ project: string, tokens: number, cost: number, color: string }> }>} */
		const bucketMap = new Map();
		/** @type {Set<string>} */
		const projectSet = new Set();

		for (const row of projectData) {
			projectSet.add(row.project);

			let bucket = bucketMap.get(row.timestamp);
			if (!bucket) {
				bucket = { totalTokens: 0, totalCost: 0, projects: [] };
				bucketMap.set(row.timestamp, bucket);
			}

			bucket.totalTokens += row.total_tokens;
			bucket.totalCost += row.cost_usd;
			bucket.projects.push({
				project: row.project,
				tokens: row.total_tokens,
				cost: row.cost_usd,
				color: PROJECT_COLORS[row.project] || PROJECT_COLORS.other
			});
		}

		// Convert to array sorted by timestamp
		const data = Array.from(bucketMap.entries())
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([timestamp, bucket]) => ({
				timestamp,
				totalTokens: bucket.totalTokens,
				totalCost: bucket.totalCost,
				projects: bucket.projects
			}));

		// Calculate totals
		let totalTokens = 0;
		let totalCost = 0;
		for (const bucket of data) {
			totalTokens += bucket.totalTokens;
			totalCost += bucket.totalCost;
		}

		// Build project keys and colors
		// projectKeys = only projects with activity (for data filtering)
		// projectColors = ALL configured projects (for consistent UI colors)
		const projectKeys = Array.from(projectSet).sort();
		/** @type {Record<string, string>} */
		const projectColors = { ...PROJECT_COLORS };
		// Also add colors for any active projects not in config (use fallback)
		for (const project of projectKeys) {
			if (!projectColors[project]) {
				projectColors[project] = PROJECT_COLORS.other;
			}
		}

		return {
			data,
			totalTokens,
			totalCost,
			bucketCount: data.length,
			bucketSize,
			startTime: startTime.toISOString(),
			endTime: endTime.toISOString(),
			projectKeys,
			projectColors
		};
	} else {
		// Single-project or agent-filtered mode
		const hourlyData = getHourlyBreakdown(startTime, endTime, {
			agent: agentName,
			bucketMinutes
		});

		if (!hourlyData || hourlyData.length === 0) {
			return null;
		}

		// Calculate totals
		let totalTokens = 0;
		let totalCost = 0;

		const data = hourlyData.map(row => {
			totalTokens += row.total_tokens;
			totalCost += row.cost_usd;

			return {
				timestamp: row.timestamp,
				tokens: row.total_tokens,
				cost: row.cost_usd,
				breakdown: {
					input: 0,
					cacheCreation: 0,
					cacheRead: 0,
					output: 0
				}
			};
		});

		return {
			data,
			totalTokens,
			totalCost,
			bucketCount: data.length,
			bucketSize,
			startTime: startTime.toISOString(),
			endTime: endTime.toISOString()
		};
	}
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
		const source = url.searchParams.get('source') || 'jsonl'; // 'sqlite' or 'jsonl'

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

		if (!['sqlite', 'jsonl'].includes(source)) {
			return json(
				{
					error: 'Invalid source parameter',
					message: 'Source must be: sqlite or jsonl',
					validValues: ['sqlite', 'jsonl']
				},
				{ status: 400 }
			);
		}

		pruneCache();

		// Generate cache key (includes source)
		const cacheKey = getCacheKey({ range, agent: agentName, session: sessionId, bucketSize, multiProject, source });

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

		/** @type {SparklineResult | null} */
		let result = null;

		// Cast range and bucketSize to expected types since we validated them above
		/** @type {'24h' | '7d' | 'all'} */
		const validatedRange = /** @type {'24h' | '7d' | 'all'} */ (range);
		/** @type {'30min' | 'hour' | 'session'} */
		const validatedBucketSize = /** @type {'30min' | 'hour' | 'session'} */ (bucketSize);

		// SQLite source: use pre-aggregated data from tokenUsageDb
		if (source === 'sqlite') {
			const sqliteResult = await fetchFromSQLite({
				range: validatedRange,
				bucketSize: validatedBucketSize,
				agentName,
				multiProject
			});

			// Check if SQLite has data, fall back to JSONL if empty
			if (sqliteResult && sqliteResult.bucketCount > 0) {
				result = sqliteResult;
				const queryDuration = Date.now() - startTime;
				console.log(
					`[Sparkline API] SQLite query: ${sqliteResult.bucketCount} buckets in ${queryDuration}ms (${sqliteResult.totalTokens.toLocaleString()} tokens)${multiProject ? ' [multi-project]' : ''}`
				);
			} else {
				console.log(`[Sparkline API] SQLite returned no data, falling back to JSONL...`);
				// Fall through to JSONL path below
			}
		}

		// JSONL source (default or fallback from SQLite)
		if (!result) {
			if (multiProject && agentName) {
				// Per-agent multi-project mode: filter multi-project data by agent's sessions
				result = await getAgentMultiProjectTimeSeries({
					agentName,
					range: validatedRange,
					bucketSize: validatedBucketSize
				});
			} else if (multiProject) {
				// System-wide multi-project mode: aggregate across all projects from squad config
				// Using async worker thread version to avoid blocking the event loop
				result = await getMultiProjectTimeSeriesAsync({
					range: validatedRange,
					bucketSize: validatedBucketSize
				});
			} else {
				// Single-project mode: use existing logic
				// Get project path (IDE runs from /ide subdirectory)
				const projectPath = process.cwd().replace(/\/ide$/, '');

				result = await getTokenTimeSeries({
					range: validatedRange,
					agentName,
					sessionId,
					bucketSize: validatedBucketSize,
					projectPath
				});
			}
		}

		// At this point result is guaranteed to be non-null (either from SQLite or JSONL fallback)
		if (!result) {
			throw new Error('No sparkline data available from any source');
		}

		const fetchDuration = Date.now() - startTime;
		console.log(
			`[Sparkline API] Fetched ${result.bucketCount} buckets in ${fetchDuration}ms (${result.totalTokens.toLocaleString()} tokens)${multiProject ? ' [multi-project]' : ''} [source: ${source}]`
		);

		// Cache the result
		setCache(cacheKey, result);

		// Return result with cache metadata
		return json({
			...result,
			cached: false,
			cacheAge: 0,
			fetchDuration,
			source
		});
	} catch (error) {
		console.error('[Sparkline API] Error (returning empty data):', error);
		// Return 200 with empty data so layout and usage bar don't break when DB/config missing
		const multiProject = url.searchParams.get('multiProject') === 'true';
		return json({
			data: [],
			totalTokens: 0,
			totalCost: 0,
			bucketCount: 0,
			bucketSize: '30min',
			startTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
			endTime: new Date().toISOString(),
			...(multiProject ? { projectKeys: [], projectColors: {} } : {}),
			cached: false,
			cacheAge: 0,
			source: 'none'
		});
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
