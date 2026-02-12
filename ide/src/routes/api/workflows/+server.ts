/**
 * Workflow Collection API
 * GET  /api/workflows - List all workflows (summaries)
 * POST /api/workflows - Create a new workflow
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getWorkflowSummaries,
	saveWorkflow,
	generateWorkflowId,
	workflowExists
} from '$lib/utils/workflows.server';

/**
 * GET /api/workflows
 *
 * Returns workflow summaries (id, name, enabled, lastRun, node/edge counts).
 */
export const GET: RequestHandler = async () => {
	try {
		const summaries = await getWorkflowSummaries();
		return json({ workflows: summaries, count: summaries.length });
	} catch (err) {
		console.error('[workflows API] GET error:', err);
		throw error(500, `Failed to list workflows: ${(err as Error).message}`);
	}
};

/**
 * POST /api/workflows
 *
 * Create a new workflow.
 *
 * Body: {
 *   name: string,          // Required
 *   description?: string,
 *   id?: string,           // Optional (auto-generated if omitted)
 *   nodes?: WorkflowNode[],
 *   edges?: WorkflowEdge[],
 *   enabled?: boolean
 * }
 */
export const POST: RequestHandler = async ({ request }) => {
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
		throw error(400, 'Request body must contain a non-empty "name" field');
	}

	const id = (body.id as string) || generateWorkflowId();

	if (workflowExists(id)) {
		throw error(409, `Workflow '${id}' already exists`);
	}

	try {
		const workflow = await saveWorkflow({
			id,
			name: body.name.trim(),
			description: (body.description as string) || '',
			nodes: Array.isArray(body.nodes) ? body.nodes : [],
			edges: Array.isArray(body.edges) ? body.edges : [],
			enabled: body.enabled === true
		});

		return json({ success: true, workflow }, { status: 201 });
	} catch (err) {
		const message = (err as Error).message;
		if (message.startsWith('Invalid workflow:')) {
			return json({ error: message }, { status: 400 });
		}
		console.error('[workflows API] POST error:', err);
		throw error(500, `Failed to create workflow: ${message}`);
	}
};
