/**
 * Session Activity API - Real-time output activity state
 *
 * GET /api/sessions/[name]/activity
 *   Returns the current activity state for a session (from monitor-output.sh)
 *   Activity file: /tmp/squad-activity-{sessionName}.json
 *
 * Activity States:
 *   - generating: Agent is actively outputting text (output growing)
 *   - thinking: Agent is processing (output stable for 2+ seconds)
 *   - idle: Agent is waiting (output stable for 30+ seconds)
 *
 * Used by SessionCard to control shimmer text animation.
 */

import { json } from '@sveltejs/kit';
import { readFileSync, existsSync, statSync } from 'fs';
import type { RequestHandler } from './$types';

interface ActivityState {
	state: 'generating' | 'thinking' | 'idle';
	since: string;
	tmux_session: string;
}

export const GET: RequestHandler = async ({ params }) => {
	const sessionName = params.name;

	if (!sessionName) {
		return json({ error: 'Missing session name' }, { status: 400 });
	}

	// Activity file is keyed by tmux session name
	const activityFile = `/tmp/squad-activity-${sessionName}.json`;

	if (!existsSync(activityFile)) {
		// No activity file = no monitor running = idle
		return json({
			hasActivity: true,
			sessionName,
			activity: {
				state: 'idle',
				since: new Date().toISOString(),
				tmux_session: sessionName
			},
			fileModifiedAt: new Date().toISOString()
		});
	}

	try {
		const content = readFileSync(activityFile, 'utf-8');
		const activity: ActivityState = JSON.parse(content);

		// Include file modification time for staleness checking
		// This is more reliable than 'since' because 'since' only updates on state changes,
		// but file mtime updates whenever the monitor writes (even if state doesn't change)
		const stats = statSync(activityFile);
		const fileModifiedAt = stats.mtime.toISOString();

		return json({
			hasActivity: true,
			sessionName,
			activity,
			fileModifiedAt
		});
	} catch (err) {
		const error = err as Error;
		return json({
			hasActivity: false,
			sessionName,
			error: 'Failed to read activity file',
			message: error.message
		}, { status: 500 });
	}
};
