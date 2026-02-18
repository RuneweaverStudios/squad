/**
 * Pause All Sessions API
 * POST /api/sessions/pause-all - Send Ctrl+C to all active sessions
 */

import { json } from '@sveltejs/kit';
import { listSessionsAsync, sendKey } from '$lib/server/sessions.js';

/**
 * POST /api/sessions/pause-all
 * Send Ctrl+C (interrupt) to all active SQUAD sessions
 * Body:
 * - filter: Optional array of agent names to target (default: all sessions)
 * - exclude: Optional array of agent names to exclude
 */
/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const { filter, exclude = [] } = body;

		// Get all active sessions
		const sessions = await listSessionsAsync();

		if (sessions.length === 0) {
			return json({
				success: true,
				message: 'No active sessions to pause',
				paused: 0,
				sessions: [],
				timestamp: new Date().toISOString()
			});
		}

		// Filter sessions based on request
		let targetSessions = sessions;

		if (filter && Array.isArray(filter) && filter.length > 0) {
			const filterSet = new Set(filter);
			targetSessions = sessions.filter(s => filterSet.has(s.agentName));
		}

		if (exclude && Array.isArray(exclude) && exclude.length > 0) {
			const excludeSet = new Set(exclude);
			targetSessions = targetSessions.filter(s => !excludeSet.has(s.agentName));
		}

		// Send Ctrl+C to each session
		const results = [];
		for (const session of targetSessions) {
			const result = sendKey(session.agentName, 'C-c');
			results.push({
				agentName: session.agentName,
				sessionName: session.name,
				success: result.success,
				error: result.error
			});
		}

		const successCount = results.filter(r => r.success).length;
		const failCount = results.filter(r => !r.success).length;

		return json({
			success: failCount === 0,
			paused: successCount,
			failed: failCount,
			total: sessions.length,
			targeted: targetSessions.length,
			results,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error in POST /api/sessions/pause-all:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
