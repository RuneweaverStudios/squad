/**
 * Server-side response caching utility
 *
 * Provides TTL-based caching for API responses to reduce expensive operations
 * like JSONL parsing, tmux calls, and file I/O.
 *
 * Usage:
 *   import { apiCache, cacheKey } from '$lib/server/cache';
 *
 *   // In API endpoint
 *   const key = cacheKey('agents', { full: 'true', usage: 'true' });
 *   const cached = apiCache.get<AgentData[]>(key);
 *   if (cached) return json(cached);
 *
 *   // ... expensive operation
 *   apiCache.set(key, result, 2000); // 2 second TTL
 */

interface CacheEntry<T> {
	value: T;
	expires: number;
}

/**
 * Generic TTL cache with automatic expiration
 */
class TTLCache {
	private cache = new Map<string, CacheEntry<unknown>>();
	private cleanupInterval: ReturnType<typeof setInterval> | null = null;

	constructor() {
		// Cleanup expired entries every 30 seconds
		this.cleanupInterval = setInterval(() => this.cleanup(), 30000);
	}

	/**
	 * Get a cached value if not expired
	 */
	get<T>(key: string): T | null {
		const entry = this.cache.get(key);
		if (!entry) return null;

		if (Date.now() > entry.expires) {
			this.cache.delete(key);
			return null;
		}

		return entry.value as T;
	}

	/**
	 * Set a value with TTL in milliseconds
	 */
	set<T>(key: string, value: T, ttlMs: number): void {
		this.cache.set(key, {
			value,
			expires: Date.now() + ttlMs
		});
	}

	/**
	 * Check if a key exists and is not expired
	 */
	has(key: string): boolean {
		return this.get(key) !== null;
	}

	/**
	 * Delete a specific key
	 */
	delete(key: string): boolean {
		return this.cache.delete(key);
	}

	/**
	 * Invalidate all keys matching a pattern
	 * Pattern supports simple prefix matching with '*'
	 */
	invalidate(pattern: string): number {
		let count = 0;
		const prefix = pattern.replace('*', '');

		for (const key of this.cache.keys()) {
			if (pattern.endsWith('*') ? key.startsWith(prefix) : key === pattern) {
				this.cache.delete(key);
				count++;
			}
		}

		return count;
	}

	/**
	 * Clear all cached entries
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Get cache statistics
	 */
	stats(): { size: number; keys: string[] } {
		this.cleanup(); // Clean expired entries first
		return {
			size: this.cache.size,
			keys: Array.from(this.cache.keys())
		};
	}

	/**
	 * Remove expired entries
	 */
	private cleanup(): void {
		const now = Date.now();
		for (const [key, entry] of this.cache.entries()) {
			if (now > entry.expires) {
				this.cache.delete(key);
			}
		}
	}

	/**
	 * Stop the cleanup interval (for testing/cleanup)
	 */
	destroy(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
	}
}

/**
 * Singleton cache instance for API responses
 */
export const apiCache = new TTLCache();

/**
 * Generate a cache key from endpoint and query parameters
 *
 * @param endpoint - API endpoint name (e.g., 'agents', 'work', 'projects')
 * @param params - Query parameters object
 * @returns Deterministic cache key string
 *
 * @example
 * cacheKey('agents', { full: 'true', usage: 'true' })
 * // Returns: 'agents:full=true&usage=true'
 */
export function cacheKey(
	endpoint: string,
	params?: Record<string, string | undefined | null>
): string {
	if (!params || Object.keys(params).length === 0) {
		return endpoint;
	}

	// Sort params for deterministic keys
	const sortedParams = Object.entries(params)
		.filter(([, v]) => v !== undefined && v !== null)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, v]) => `${k}=${v}`)
		.join('&');

	return sortedParams ? `${endpoint}:${sortedParams}` : endpoint;
}

/**
 * Cache TTL presets (in milliseconds)
 */
export const CACHE_TTL = {
	/** Very short TTL for frequently changing data */
	FAST: 500,

	/** Short TTL for agent/session data (2 seconds) */
	SHORT: 2000,

	/** Medium TTL for project/server data (5 seconds) */
	MEDIUM: 5000,

	/** Long TTL for expensive calculations like token usage (30 seconds) */
	LONG: 30000,

	/** Extra long TTL for rarely changing data (60 seconds) */
	EXTRA_LONG: 60000
} as const;

/**
 * Recommended TTLs per endpoint
 */
export const ENDPOINT_TTL = {
	// Agent orchestration data - changes frequently with activity
	'agents': CACHE_TTL.SHORT,
	'agents:usage': CACHE_TTL.LONG,

	// Work sessions - needs faster updates for terminal output
	'work': CACHE_TTL.FAST,
	'work:usage': CACHE_TTL.LONG,

	// Project data - relatively static
	'projects': CACHE_TTL.MEDIUM,
	'projects:stats': CACHE_TTL.LONG,

	// Server data - changes infrequently
	'servers': CACHE_TTL.MEDIUM,

	// Session list - fast operation, short cache
	'sessions': CACHE_TTL.SHORT,

	// Task data - moderate change frequency
	'tasks': CACHE_TTL.SHORT,
	'tasks:deps': CACHE_TTL.MEDIUM
} as const;

/**
 * Helper to get or compute cached value
 *
 * @example
 * const agents = await getOrCompute(
 *   cacheKey('agents', params),
 *   async () => fetchAgentsExpensive(),
 *   CACHE_TTL.SHORT
 * );
 */
export async function getOrCompute<T>(
	key: string,
	compute: () => Promise<T>,
	ttlMs: number
): Promise<T> {
	const cached = apiCache.get<T>(key);
	if (cached !== null) {
		return cached;
	}

	const result = await compute();
	apiCache.set(key, result, ttlMs);
	return result;
}

// ============================================================================
// Single-flight / Request Deduplication
// ============================================================================

/**
 * In-flight request map for deduplication.
 * Prevents thundering herd: if 5 requests arrive for the same key while the
 * first is still computing, the other 4 wait for that result instead of each
 * starting their own expensive computation (e.g., 33 tmux captures).
 */
const inflight = new Map<string, Promise<unknown>>();

/**
 * Get cached value, or compute it with request deduplication.
 *
 * Unlike getOrCompute, this coalesces concurrent requests: if a computation
 * is already in-flight for the same key, callers share its result.
 *
 * @example
 * const data = await singleFlight(
 *   cacheKey('work', { lines: '50' }),
 *   async () => expensiveWorkComputation(),
 *   5000
 * );
 */
export async function singleFlight<T>(
	key: string,
	compute: () => Promise<T>,
	ttlMs: number
): Promise<T> {
	// 1. Check cache first
	const cached = apiCache.get<T>(key);
	if (cached !== null) {
		return cached;
	}

	// 2. Check if there's already an in-flight request for this key
	const existing = inflight.get(key);
	if (existing) {
		return existing as Promise<T>;
	}

	// 3. Start computation and register it
	const promise = compute()
		.then((result) => {
			apiCache.set(key, result, ttlMs);
			return result;
		})
		.finally(() => {
			inflight.delete(key);
		});

	inflight.set(key, promise);
	return promise;
}

/**
 * Invalidation helpers for common patterns
 */
export const invalidateCache = {
	/** Invalidate all agent-related cache entries */
	agents: () => apiCache.invalidate('agents*'),

	/** Invalidate all work session cache entries */
	work: () => apiCache.invalidate('work*'),

	/** Invalidate all project cache entries */
	projects: () => apiCache.invalidate('projects*'),

	/** Invalidate all server cache entries */
	servers: () => apiCache.invalidate('servers*'),

	/** Invalidate all task cache entries */
	tasks: () => apiCache.invalidate('tasks*'),

	/** Invalidate all session cache entries */
	sessions: () => apiCache.invalidate('sessions*'),

	/** Invalidate everything */
	all: () => apiCache.clear()
};
