/**
 * Batch Session Activity API - Get activity states for all sessions in one request
 *
 * GET /api/sessions/activity
 *   Returns activity states for all requested jat-* tmux sessions.
 *   Builds file paths directly from session names (avoids scanning /tmp).
 *
 * Query params:
 *   - sessions: Comma-separated list of session names to check
 *
 * Activity States:
 *   - generating: Agent is actively outputting text (output growing)
 *   - thinking: Agent is processing (output stable for 2+ seconds)
 *   - idle: Agent is waiting (output stable for 30+ seconds)
 */

import { json } from '@sveltejs/kit';
import { readFileSync, statSync } from 'fs';
import { singleFlight, cacheKey } from '$lib/server/cache.js';
import type { RequestHandler } from './$types';

interface ActivityState {
	state: 'generating' | 'thinking' | 'idle';
	since: string;
	tmux_session: string;
}

interface SessionActivity {
	sessionName: string;
	hasActivity: boolean;
	activity: ActivityState | null;
	fileModifiedAt: string | null;
	error?: string;
}

export const GET: RequestHandler = async ({ url }) => {
	const sessionsParam = url.searchParams.get('sessions');
	if (!sessionsParam) {
		return json({
			success: true,
			activities: {},
			count: 0,
			timestamp: new Date().toISOString()
		});
	}

	const sessionNames = sessionsParam.split(',').map(s => s.trim()).filter(Boolean);
	const key = cacheKey('activity', { sessions: sessionNames.sort().join(',') });

	// singleFlight: cache + deduplication. Activity is polled every few seconds
	// by the client — avoid redundant FS reads for concurrent/rapid requests.
	const responseData = await singleFlight(key, async () => {
		const results: Record<string, SessionActivity> = {};

		// Build file paths directly from session names — no /tmp directory scan
		for (const sessionName of sessionNames) {
			const filePath = `/tmp/jat-activity-${sessionName}.json`;

			try {
				const stats = statSync(filePath);
				const content = readFileSync(filePath, 'utf-8');
				const activity: ActivityState = JSON.parse(content);

				results[sessionName] = {
					sessionName,
					hasActivity: true,
					activity,
					fileModifiedAt: stats.mtime.toISOString()
				};
			} catch {
				// File doesn't exist or can't be read — session is idle
				results[sessionName] = {
					sessionName,
					hasActivity: true,
					activity: {
						state: 'idle',
						since: new Date().toISOString(),
						tmux_session: sessionName
					},
					fileModifiedAt: new Date().toISOString()
				};
			}
		}

		return {
			success: true,
			activities: results,
			count: Object.keys(results).length,
			timestamp: new Date().toISOString()
		};
	}, 2000); // 2s TTL — activity files update every ~1s, 2s cache is sufficient

	return json(responseData);
};
