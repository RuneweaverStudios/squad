import { json } from '@sveltejs/kit';
import { readFileSync, existsSync, statSync } from 'fs';
import type { RequestHandler } from './$types';

export interface TimelineEvent {
	type: string;
	session_id: string;
	tmux_session: string;
	timestamp: string;
	state?: string;
	task_id?: string;
	data?: any;
	git_sha?: string;
	validation_warning?: string;
}

export interface TimelineResponse {
	session: string;
	events: TimelineEvent[];
	count: number;
	oldest?: string;
	newest?: string;
}

/**
 * GET /api/sessions/[name]/timeline
 *
 * Returns the signal timeline for a session (JSONL log).
 *
 * Query params:
 * - limit: Max events to return (default 50, max 500)
 * - offset: Skip N events from the end (for pagination)
 * - since: ISO timestamp - only return events after this time
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const sessionName = params.name;

	if (!sessionName) {
		return json({ error: 'Session name required' }, { status: 400 });
	}

	// Parse query params
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500);
	const offset = parseInt(url.searchParams.get('offset') || '0');
	const since = url.searchParams.get('since');

	// Timeline file is named by tmux session (with jat- prefix if not present)
	const tmuxSession = sessionName.startsWith('jat-') ? sessionName : `jat-${sessionName}`;
	const timelineFile = `/tmp/jat-timeline-${tmuxSession}.jsonl`;

	if (!existsSync(timelineFile)) {
		return json({
			session: sessionName,
			events: [],
			count: 0
		} satisfies TimelineResponse);
	}

	try {
		const content = readFileSync(timelineFile, 'utf-8');
		const lines = content.trim().split('\n').filter(line => line.trim());

		// Parse all events
		let events: TimelineEvent[] = [];
		for (const line of lines) {
			try {
				const event = JSON.parse(line) as TimelineEvent;
				events.push(event);
			} catch {
				// Skip malformed lines
			}
		}

		// Filter by timestamp if 'since' provided
		if (since) {
			const sinceDate = new Date(since);
			events = events.filter(e => new Date(e.timestamp) > sinceDate);
		}

		// Get total count before pagination
		const totalCount = events.length;

		// Apply pagination (from end - most recent first)
		// Events are in chronological order, so we reverse for most-recent-first
		events = events.reverse();

		if (offset > 0) {
			events = events.slice(offset);
		}

		if (limit > 0) {
			events = events.slice(0, limit);
		}

		// Get time range
		const oldest = events.length > 0 ? events[events.length - 1].timestamp : undefined;
		const newest = events.length > 0 ? events[0].timestamp : undefined;

		return json({
			session: sessionName,
			events,
			count: totalCount,
			oldest,
			newest
		} satisfies TimelineResponse);

	} catch (err: any) {
		return json({
			error: 'Failed to read timeline',
			details: err.message
		}, { status: 500 });
	}
};

/**
 * DELETE /api/sessions/[name]/timeline
 *
 * Clears the timeline log for a session.
 * Useful for cleanup or starting fresh.
 */
export const DELETE: RequestHandler = async ({ params }) => {
	const sessionName = params.name;

	if (!sessionName) {
		return json({ error: 'Session name required' }, { status: 400 });
	}

	const tmuxSession = sessionName.startsWith('jat-') ? sessionName : `jat-${sessionName}`;
	const timelineFile = `/tmp/jat-timeline-${tmuxSession}.jsonl`;

	if (!existsSync(timelineFile)) {
		return json({ success: true, message: 'Timeline already empty' });
	}

	try {
		const { unlinkSync } = await import('fs');
		unlinkSync(timelineFile);
		return json({ success: true, message: 'Timeline cleared' });
	} catch (err: any) {
		return json({
			error: 'Failed to clear timeline',
			details: err.message
		}, { status: 500 });
	}
};
