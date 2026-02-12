/**
 * Events API
 *
 * POST /api/events - Emit an event into the event bus
 * GET  /api/events - Retrieve recent events from the ring buffer
 *
 * @see ide/src/lib/utils/eventBus.server.ts for event bus implementation
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { emitEvent, getRecentEvents } from '$lib/utils/eventBus.server';
import type { EventType } from '$lib/utils/eventBus.server';

const VALID_EVENT_TYPES: EventType[] = [
	'task_created',
	'task_closed',
	'task_status_changed',
	'signal_received',
	'file_changed',
	'ingest_item'
];

/**
 * POST /api/events
 * Emit a new event.
 *
 * Body: { type: EventType, source: string, data: object, project?: string }
 */
export const POST: RequestHandler = async ({ request }) => {
	let body: { type?: string; source?: string; data?: Record<string, unknown>; project?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	if (!body.type || !VALID_EVENT_TYPES.includes(body.type as EventType)) {
		return json(
			{ error: `Invalid event type. Must be one of: ${VALID_EVENT_TYPES.join(', ')}` },
			{ status: 400 }
		);
	}

	if (!body.source || typeof body.source !== 'string') {
		return json({ error: 'source is required (string)' }, { status: 400 });
	}

	if (!body.data || typeof body.data !== 'object') {
		return json({ error: 'data is required (object)' }, { status: 400 });
	}

	const event = emitEvent({
		type: body.type as EventType,
		source: body.source,
		data: body.data,
		project: body.project
	});

	return json({ success: true, event }, { status: 201 });
};

/**
 * GET /api/events
 * Retrieve recent events.
 *
 * Query params:
 *   ?limit=50  - Max events to return (default: 50)
 *   ?type=task_closed - Filter by event type
 */
export const GET: RequestHandler = async ({ url }) => {
	const limitParam = url.searchParams.get('limit');
	const typeParam = url.searchParams.get('type');

	const limit = limitParam ? parseInt(limitParam, 10) : 50;
	const type = typeParam && VALID_EVENT_TYPES.includes(typeParam as EventType) ? typeParam : undefined;

	const events = getRecentEvents({ limit, type });

	return json({ events, count: events.length });
};
