/**
 * Workflow Run History API
 * GET /api/workflows/{id}/runs - Get execution history for a workflow
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRuns, workflowExists } from '$lib/utils/workflows.server';

/**
 * GET /api/workflows/{id}/runs
 *
 * Returns execution history for a workflow, sorted by most recent first.
 *
 * Query params:
 *   - limit: Max number of runs to return (default: 20, max: 100)
 */
export const GET: RequestHandler = async ({ params, url }) => {
	if (!workflowExists(params.id)) {
		throw error(404, `Workflow '${params.id}' not found`);
	}

	const limitParam = url.searchParams.get('limit');
	let limit = 20;
	if (limitParam) {
		const parsed = parseInt(limitParam, 10);
		if (!isNaN(parsed) && parsed > 0) {
			limit = Math.min(parsed, 100);
		}
	}

	try {
		const runs = await getRuns(params.id, limit);
		return json({ runs, count: runs.length, workflowId: params.id });
	} catch (err) {
		console.error('[workflows API] GET runs error:', err);
		throw error(500, `Failed to get run history: ${(err as Error).message}`);
	}
};
