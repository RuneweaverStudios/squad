/**
 * Request Throttler
 *
 * Prevents browser connection exhaustion (ERR_INSUFFICIENT_RESOURCES) by:
 * 1. Limiting max concurrent requests per domain
 * 2. Queueing excess requests
 * 3. Deduplicating identical in-flight requests
 *
 * Browser limits are typically:
 * - Chrome: 6 concurrent connections per domain
 * - Firefox: 6 concurrent connections per domain
 * - Safari: 6 concurrent connections per domain
 *
 * We limit to 4 to leave headroom for other requests (WebSocket, etc.)
 */

const MAX_CONCURRENT_REQUESTS = 4;
const REQUEST_TIMEOUT_MS = 30000; // 30 second timeout

// Debug logging disabled - console statements removed

interface QueuedRequest {
	url: string;
	options: RequestInit;
	resolve: (response: Response) => void;
	reject: (error: Error) => void;
	timestamp: number;
}

// Module-level state (shared across all components)
let activeRequests = 0;
const requestQueue: QueuedRequest[] = [];
const inFlightRequests = new Map<string, Promise<Response>>();

/**
 * Creates a cache key from URL and relevant options
 */
function getCacheKey(url: string, options?: RequestInit): string {
	const method = options?.method || 'GET';
	// Only cache GET requests
	if (method !== 'GET') {
		return `${method}:${url}:${Date.now()}:${Math.random()}`;
	}
	return `GET:${url}`;
}

/**
 * Process the next request in the queue
 */
function processQueue(): void {
	if (activeRequests >= MAX_CONCURRENT_REQUESTS || requestQueue.length === 0) {
		return;
	}

	const request = requestQueue.shift();
	if (!request) return;

	// Check if request has timed out while waiting in queue
	if (Date.now() - request.timestamp > REQUEST_TIMEOUT_MS) {
		request.reject(new Error('Request timed out in queue'));
		processQueue();
		return;
	}

	executeRequest(request);
}

/**
 * Execute a request and manage concurrency
 */
async function executeRequest(request: QueuedRequest): Promise<void> {
	activeRequests++;

	try {
		// Check if signal is already aborted before making request
		const signal = request.options.signal;
		if (signal?.aborted) {
			throw new DOMException('The operation was aborted.', 'AbortError');
		}

		const response = await globalThis.fetch(request.url, {
			...request.options,
			signal: signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});
		request.resolve(response);
	} catch (error) {
		request.reject(error instanceof Error ? error : new Error(String(error)));
	} finally {
		activeRequests--;
		processQueue();
	}
}

/**
 * Throttled fetch - queues requests when at capacity
 * Deduplicates identical GET requests that are in-flight
 */
export async function throttledFetch(url: string, options?: RequestInit): Promise<Response> {
	const cacheKey = getCacheKey(url, options);
	const method = options?.method || 'GET';

	// For GET requests, check if we already have this request in-flight
	if (method === 'GET') {
		const existing = inFlightRequests.get(cacheKey);
		if (existing) {
			// Return the existing promise - deduplicate the request
			// Create a new promise that:
			// 1. Clones successful responses (so each caller gets their own)
			// 2. Properly handles rejections without losing error info
			// 3. Has its own rejection handler to prevent uncaught warnings
			return new Promise<Response>((resolve, reject) => {
				existing
					.then(r => resolve(r.clone()))
					.catch(err => {
						// Reject with the same error so caller can handle it
						reject(err);
					});
			});
		}
	}

	// Create the request promise
	const requestPromise = new Promise<Response>((resolve, reject) => {
		const queuedRequest: QueuedRequest = {
			url,
			options: options || {},
			resolve,
			reject,
			timestamp: Date.now()
		};

		// If signal is already aborted, reject immediately
		const signal = options?.signal;
		if (signal?.aborted) {
			reject(new DOMException('The operation was aborted.', 'AbortError'));
			return;
		}

		if (activeRequests < MAX_CONCURRENT_REQUESTS) {
			executeRequest(queuedRequest);
		} else {
			// For queued requests, listen for abort to reject early
			if (signal) {
				const abortHandler = () => {
					const index = requestQueue.indexOf(queuedRequest);
					if (index !== -1) {
						requestQueue.splice(index, 1);
						reject(new DOMException('The operation was aborted.', 'AbortError'));
					}
				};
				signal.addEventListener('abort', abortHandler, { once: true });
			}
			requestQueue.push(queuedRequest);
		}
	});

	// Track GET requests for deduplication
	if (method === 'GET') {
		inFlightRequests.set(cacheKey, requestPromise);
		// Chain catch → finally to prevent "Uncaught (in promise)" browser warnings.
		// IMPORTANT: These must be chained (not branched off requestPromise separately)
		// because .finally() creates a new promise that re-rejects with the original
		// error — if branched directly off requestPromise, that rejection is unhandled.
		// Chaining ensures .catch() swallows the rejection before .finally() sees it.
		// The actual error handling is done by the caller via the returned requestPromise.
		requestPromise
			.catch(() => {})
			.finally(() => {
				inFlightRequests.delete(cacheKey);
			});
	}

	return requestPromise;
}

/**
 * Get current queue status (for debugging)
 */
export function getQueueStatus(): { active: number; queued: number; inFlight: number } {
	return {
		active: activeRequests,
		queued: requestQueue.length,
		inFlight: inFlightRequests.size
	};
}

/**
 * Clear the queue (useful for cleanup)
 */
export function clearQueue(): void {
	while (requestQueue.length > 0) {
		const request = requestQueue.pop();
		if (request) {
			request.reject(new Error('Queue cleared'));
		}
	}
	inFlightRequests.clear();
}
