/**
 * Single Workflow API
 * GET    /api/workflows/{id} - Get full workflow (nodes, edges, config)
 * PUT    /api/workflows/{id} - Update workflow
 * DELETE /api/workflows/{id} - Delete workflow and its run history
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getWorkflow, updateWorkflow, deleteWorkflow } from '$lib/utils/workflows.server';

/**
 * GET /api/workflows/{id}
 *
 * Returns the full workflow including nodes, edges, and timestamps.
 */
export const GET: RequestHandler = async ({ params }) => {
	const workflow = await getWorkflow(params.id);
	if (!workflow) {
		throw error(404, `Workflow '${params.id}' not found`);
	}
	return json({ workflow });
};

/**
 * PUT /api/workflows/{id}
 *
 * Update an existing workflow. Partial updates supported —
 * only provided fields are changed; omitted fields keep existing values.
 *
 * Body (all optional): {
 *   name?: string,
 *   description?: string,
 *   nodes?: WorkflowNode[],
 *   edges?: WorkflowEdge[],
 *   enabled?: boolean
 * }
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	// Build updates object with only provided fields
	const updates: Record<string, unknown> = {};
	if (body.name !== undefined) {
		if (typeof body.name !== 'string' || body.name.trim().length === 0) {
			throw error(400, '"name" must be a non-empty string');
		}
		updates.name = body.name.trim();
	}
	if (body.description !== undefined) updates.description = body.description;
	if (body.nodes !== undefined) {
		if (!Array.isArray(body.nodes)) throw error(400, '"nodes" must be an array');
		updates.nodes = body.nodes;
	}
	if (body.edges !== undefined) {
		if (!Array.isArray(body.edges)) throw error(400, '"edges" must be an array');
		updates.edges = body.edges;
	}
	if (body.enabled !== undefined) updates.enabled = body.enabled === true;

	try {
		const workflow = await updateWorkflow(params.id, updates);
		return json({ success: true, workflow });
	} catch (err) {
		const message = (err as Error).message;
		if (message.includes('not found')) {
			throw error(404, message);
		}
		if (message.startsWith('Invalid workflow:')) {
			return json({ error: message }, { status: 400 });
		}
		console.error('[workflows API] PUT error:', err);
		throw error(500, `Failed to update workflow: ${message}`);
	}
};

/**
 * DELETE /api/workflows/{id}
 *
 * Delete a workflow and all its run history.
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const deleted = await deleteWorkflow(params.id);
		if (!deleted) {
			throw error(404, `Workflow '${params.id}' not found`);
		}
		return json({ success: true, message: `Workflow '${params.id}' deleted` });
	} catch (err) {
		if ((err as { status?: number }).status === 404) throw err;
		console.error('[workflows API] DELETE error:', err);
		throw error(500, `Failed to delete workflow: ${(err as Error).message}`);
	}
};
