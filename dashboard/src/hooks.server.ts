/**
 * SvelteKit Server Hooks
 *
 * This file runs on server startup and handles background tasks.
 *
 * Features:
 * - Runs token usage aggregation on startup
 * - Schedules periodic aggregation every 5 minutes
 */

import { runAggregation } from '$lib/server/tokenUsageDb';

// Track aggregation interval
let aggregationInterval: ReturnType<typeof setInterval> | null = null;

// Run aggregation on server startup
async function initializeAggregation() {
	console.log('[Token Aggregation] Running initial aggregation...');
	try {
		const result = await runAggregation();
		console.log(
			`[Token Aggregation] Initial aggregation complete: ${result.filesProcessed} files, ${result.entriesProcessed} entries in ${result.durationMs}ms`
		);
	} catch (error) {
		console.error('[Token Aggregation] Initial aggregation failed:', error);
	}

	// Schedule periodic aggregation every 5 minutes
	if (!aggregationInterval) {
		const FIVE_MINUTES = 5 * 60 * 1000;
		aggregationInterval = setInterval(async () => {
			try {
				const result = await runAggregation();
				if (result.entriesProcessed > 0) {
					console.log(
						`[Token Aggregation] Periodic update: ${result.filesProcessed} files, ${result.entriesProcessed} entries in ${result.durationMs}ms`
					);
				}
			} catch (error) {
				console.error('[Token Aggregation] Periodic aggregation failed:', error);
			}
		}, FIVE_MINUTES);

		console.log('[Token Aggregation] Scheduled periodic aggregation every 5 minutes');
	}
}

// Initialize aggregation when the server starts
initializeAggregation();

// Export empty handle function (required by SvelteKit)
export const handle = async ({ event, resolve }) => {
	return resolve(event);
};
