/**
 * Workflow Toggle API
 * POST /api/workflows/{id}/toggle - Enable/disable a workflow
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { toggleWorkflow } from '$lib/utils/workflows.server';

/**
 * POST /api/workflows/{id}/toggle
 *
 * Toggles the workflow's enabled state.
 * Returns the updated workflow with the new enabled value.
 */
export const POST: RequestHandler = async ({ params }) => {
	try {
		const workflow = await toggleWorkflow(params.id);
		return json({
			success: true,
			workflow,
			enabled: workflow.enabled,
			message: `Workflow '${params.id}' ${workflow.enabled ? 'enabled' : 'disabled'}`
		});
	} catch (err) {
		const message = (err as Error).message;
		if (message.includes('not found')) {
			throw error(404, message);
		}
		console.error('[workflows API] toggle error:', err);
		throw error(500, `Failed to toggle workflow: ${message}`);
	}
};
