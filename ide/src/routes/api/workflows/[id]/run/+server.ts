/**
 * Workflow Run API
 * POST /api/workflows/{id}/run
 *
 * Executes a workflow by ID. Supports manual trigger, dry-run mode,
 * and project context override.
 *
 * Request body (all optional):
 *   { dryRun?: boolean, project?: string, trigger?: 'manual' | 'cron' | 'event' }
 *
 * Response:
 *   200: WorkflowRun object with all node results
 *   404: Workflow not found
 *   400: Invalid workflow (validation errors)
 *   500: Execution error
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getWorkflow, validateWorkflow } from '$lib/utils/workflows.server';
import { executeWorkflow } from '$lib/utils/workflowEngine';

export const POST: RequestHandler = async ({ params, request, url }) => {
	const workflowId = params.id;

	// Load workflow
	const workflow = await getWorkflow(workflowId);
	if (!workflow) {
		throw error(404, `Workflow '${workflowId}' not found`);
	}

	// Validate workflow before execution
	const validation = validateWorkflow(workflow);
	if (!validation.valid) {
		return json(
			{
				error: 'Workflow has validation errors',
				validationErrors: validation.errors
			},
			{ status: 400 }
		);
	}

	// Parse request body
	let body: { dryRun?: boolean; project?: string; trigger?: string } = {};
	try {
		const text = await request.text();
		if (text) {
			body = JSON.parse(text);
		}
	} catch {
		// Empty body is fine - all fields are optional
	}

	const dryRun = body.dryRun === true;
	const trigger = (body.trigger as 'manual' | 'cron' | 'event') || 'manual';
	const project = body.project;

	// Determine IDE base URL from the request
	const ideBaseUrl = `${url.protocol}//${url.host}`;

	try {
		const run = await executeWorkflow(workflow, {
			trigger,
			dryRun,
			ideBaseUrl,
			project
		});

		return json(run);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json(
			{
				error: 'Workflow execution failed',
				message
			},
			{ status: 500 }
		);
	}
};
