/**
 * SvelteKit Server Hooks
 *
 * This file runs on server startup and handles background tasks.
 *
 * Features:
 * - Cleans up stale JAT signal files on startup
 * - Runs token usage aggregation on startup
 * - Schedules periodic aggregation every 5 minutes
 */

import { runAggregation } from '$lib/server/tokenUsageDb';
import { readdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';

// Track aggregation interval
let aggregationInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Clean up stale JAT signal/activity files from /tmp
 *
 * These files are ephemeral state indicators for agent sessions.
 * When the dashboard restarts, old session states are stale and useless.
 * Cleaning on startup prevents accumulation over time.
 *
 * File patterns cleaned:
 * - jat-signal-*.json - Signal files by session UUID
 * - jat-signal-tmux-*.json - Signal files by tmux session name
 * - jat-activity-*.json - Activity files
 * - jat-timeline-*.jsonl - Timeline logs
 * - jat-question-*.json - Question files
 * - jat-monitor-*.pid - Monitor PID files
 * - claude-*-cwd - Claude Code working directory markers (hex IDs)
 */
function cleanupStaleSignalFiles(): { cleaned: number; errors: number } {
	const tmpDir = '/tmp';
	const patterns = [
		/^jat-signal-.*\.json$/,
		/^jat-activity-.*\.json$/,
		/^jat-timeline-.*\.jsonl$/,
		/^jat-question-.*\.json$/,
		/^jat-monitor-.*\.pid$/,
		/^claude-[0-9a-f]+-cwd$/ // Claude Code working directory markers
	];

	let cleaned = 0;
	let errors = 0;

	try {
		const files = readdirSync(tmpDir);

		for (const file of files) {
			// Check if file matches any of our patterns
			const matches = patterns.some((pattern) => pattern.test(file));
			if (!matches) continue;

			try {
				const filePath = join(tmpDir, file);
				// Only delete files, not directories
				const stat = statSync(filePath);
				if (stat.isFile()) {
					unlinkSync(filePath);
					cleaned++;
				}
			} catch {
				// File may have been deleted between readdir and unlink, ignore
				errors++;
			}
		}
	} catch (err) {
		console.error('[Signal Cleanup] Failed to read /tmp directory:', err);
	}

	return { cleaned, errors };
}

// Run startup tasks (cleanup + aggregation)
async function initializeStartupTasks() {
	// Run signal file cleanup immediately (non-blocking, fast)
	console.log('[Signal Cleanup] Cleaning stale temp files from /tmp...');
	const cleanupResult = cleanupStaleSignalFiles();
	if (cleanupResult.cleaned > 0) {
		console.log(
			`[Signal Cleanup] Removed ${cleanupResult.cleaned} stale files${cleanupResult.errors > 0 ? ` (${cleanupResult.errors} errors)` : ''}`
		);
	} else {
		console.log('[Signal Cleanup] No stale files to clean');
	}

	// Defer aggregation by 2 seconds to let server start serving requests first
	setTimeout(async () => {
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
	}, 2000);
}

// Initialize startup tasks when the server starts
initializeStartupTasks();

// Export empty handle function (required by SvelteKit)
export const handle = async ({ event, resolve }) => {
	return resolve(event);
};
