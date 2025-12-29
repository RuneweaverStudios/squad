/**
 * Active Epic API - Track which epic swarm is currently running
 *
 * This file is read by agents in /jat:complete to prevent them from
 * auto-proceeding to tasks that belong to an active epic swarm.
 *
 * POST /api/epics/active - Set the active epic
 * DELETE /api/epics/active - Clear the active epic
 * GET /api/epics/active - Check if an epic is active
 */

import { json } from '@sveltejs/kit';
import { writeFile, unlink, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import type { RequestHandler } from './$types';

const ACTIVE_EPIC_FILE = '/tmp/jat-epic-active.json';

interface ActiveEpicData {
	epicId: string;
	epicTitle: string;
	taskIds: string[];
	reviewThreshold: string;
	startedAt: string;
}

/**
 * POST /api/epics/active
 * Set the active epic swarm - writes file that agents check before auto-proceeding
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { epicId, epicTitle, taskIds, reviewThreshold } = body;

		if (!epicId || !taskIds || !Array.isArray(taskIds)) {
			return json({ error: 'Missing required fields: epicId, taskIds' }, { status: 400 });
		}

		const data: ActiveEpicData = {
			epicId,
			epicTitle: epicTitle || '',
			taskIds,
			reviewThreshold: reviewThreshold || 'p0-p1',
			startedAt: new Date().toISOString()
		};

		await writeFile(ACTIVE_EPIC_FILE, JSON.stringify(data, null, 2));
		console.log(`[active-epic] Set active epic: ${epicId} with ${taskIds.length} tasks`);

		return json({ success: true, data });
	} catch (error) {
		console.error('[active-epic] Error setting active epic:', error);
		return json(
			{ error: 'Failed to set active epic', message: String(error) },
			{ status: 500 }
		);
	}
};

/**
 * DELETE /api/epics/active
 * Clear the active epic swarm
 */
export const DELETE: RequestHandler = async () => {
	try {
		if (existsSync(ACTIVE_EPIC_FILE)) {
			await unlink(ACTIVE_EPIC_FILE);
			console.log('[active-epic] Cleared active epic');
		}
		return json({ success: true });
	} catch (error) {
		console.error('[active-epic] Error clearing active epic:', error);
		return json(
			{ error: 'Failed to clear active epic', message: String(error) },
			{ status: 500 }
		);
	}
};

/**
 * GET /api/epics/active
 * Check if an epic swarm is currently active
 */
export const GET: RequestHandler = async () => {
	try {
		if (!existsSync(ACTIVE_EPIC_FILE)) {
			return json({ active: false });
		}

		const content = await readFile(ACTIVE_EPIC_FILE, 'utf-8');
		const data = JSON.parse(content) as ActiveEpicData;

		return json({
			active: true,
			...data
		});
	} catch (error) {
		console.error('[active-epic] Error reading active epic:', error);
		return json({ active: false, error: String(error) });
	}
};
