/**
 * Batch Session Activity API - Get activity states for all sessions in one request
 *
 * GET /api/sessions/activity
 *   Returns activity states for all jat-* tmux sessions
 *   This batch endpoint replaces N parallel requests to /api/sessions/[name]/activity
 *   solving the ERR_INSUFFICIENT_RESOURCES browser connection limit issue.
 *
 * Query params:
 *   - sessions: Optional comma-separated list of session names to filter
 *
 * Activity States:
 *   - generating: Agent is actively outputting text (output growing)
 *   - thinking: Agent is processing (output stable for 2+ seconds)
 *   - idle: Agent is waiting (output stable for 30+ seconds)
 */

import { json } from '@sveltejs/kit';
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
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
	// Optional filter by session names
	const sessionsParam = url.searchParams.get('sessions');
	const sessionFilter = sessionsParam ? new Set(sessionsParam.split(',').map(s => s.trim())) : null;

	const results: Record<string, SessionActivity> = {};

	try {
		// Read all activity files from /tmp
		const tmpDir = '/tmp';
		const files = readdirSync(tmpDir);

		// Filter for jat-activity-*.json files
		const activityFiles = files.filter(f => f.startsWith('jat-activity-') && f.endsWith('.json'));

		for (const file of activityFiles) {
			// Extract session name from filename: jat-activity-{sessionName}.json
			const sessionName = file.replace('jat-activity-', '').replace('.json', '');

			// Skip if we have a filter and this session isn't in it
			if (sessionFilter && !sessionFilter.has(sessionName)) {
				continue;
			}

			const filePath = `${tmpDir}/${file}`;

			try {
				const content = readFileSync(filePath, 'utf-8');
				const activity: ActivityState = JSON.parse(content);
				const stats = statSync(filePath);

				results[sessionName] = {
					sessionName,
					hasActivity: true,
					activity,
					fileModifiedAt: stats.mtime.toISOString()
				};
			} catch (err) {
				const error = err as Error;
				results[sessionName] = {
					sessionName,
					hasActivity: false,
					activity: null,
					fileModifiedAt: null,
					error: error.message
				};
			}
		}

		// If we have a filter, also include sessions that don't have activity files (as idle)
		if (sessionFilter) {
			for (const sessionName of sessionFilter) {
				if (!results[sessionName]) {
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
		}

		return json({
			success: true,
			activities: results,
			count: Object.keys(results).length,
			timestamp: new Date().toISOString()
		});
	} catch (err) {
		const error = err as Error;
		return json({
			success: false,
			error: 'Failed to read activity files',
			message: error.message,
			activities: {},
			count: 0,
			timestamp: new Date().toISOString()
		}, { status: 500 });
	}
};
