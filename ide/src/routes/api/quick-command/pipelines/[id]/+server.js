/**
 * Quick Command Pipeline CRUD API
 * GET    /api/quick-command/pipelines/[id] - Get pipeline by ID
 * PUT    /api/quick-command/pipelines/[id] - Update pipeline
 * DELETE /api/quick-command/pipelines/[id] - Delete pipeline
 */

import { json } from '@sveltejs/kit';
import { readPipelines, writePipelines } from '../lib.js';
import { randomBytes } from 'crypto';

function generateId() {
	return randomBytes(4).toString('hex');
}

/** @type {import('./$types').RequestHandler} */
export async function GET({ params }) {
	try {
		const pipelines = await readPipelines();
		const pipeline = pipelines.find((p) => p.id === params.id);

		if (!pipeline) {
			return json(
				{ error: 'Pipeline not found', message: `No pipeline with ID '${params.id}'` },
				{ status: 404 }
			);
		}

		return json({
			success: true,
			pipeline,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error(`[quick-command/pipelines/${params.id}] Failed to read:`, error);
		return json(
			{ error: 'Failed to read pipeline', message: error.message },
			{ status: 500 }
		);
	}
}

/** @type {import('./$types').RequestHandler} */
export async function PUT({ params, request }) {
	try {
		const body = await request.json();
		const pipelines = await readPipelines();
		const index = pipelines.findIndex((p) => p.id === params.id);

		if (index === -1) {
			return json(
				{ error: 'Pipeline not found', message: `No pipeline with ID '${params.id}'` },
				{ status: 404 }
			);
		}

		// Check for duplicate name (excluding self)
		if (
			body.name &&
			pipelines.some(
				(p, i) => i !== index && p.name.toLowerCase() === body.name.trim().toLowerCase()
			)
		) {
			return json(
				{ error: 'Duplicate name', message: `Pipeline '${body.name}' already exists` },
				{ status: 409 }
			);
		}

		// Validate steps if provided
		if (body.steps) {
			if (!Array.isArray(body.steps) || body.steps.length < 2) {
				return json(
					{ error: 'Invalid steps', message: 'Pipeline must have at least 2 steps' },
					{ status: 400 }
				);
			}

			for (let i = 0; i < body.steps.length; i++) {
				const step = body.steps[i];
				if (!step.templateId && (!step.prompt || step.prompt.trim().length === 0)) {
					return json(
						{ error: 'Invalid step', message: `Step ${i + 1} must have either a template or a prompt` },
						{ status: 400 }
					);
				}
			}
		}

		const existing = pipelines[index];
		pipelines[index] = {
			...existing,
			...(body.name && { name: body.name.trim() }),
			...(body.description !== undefined && { description: (body.description || '').trim() }),
			...(body.steps && {
				steps: body.steps.map((s, i) => ({
					id: s.id || generateId(),
					order: i,
					templateId: s.templateId || null,
					prompt: s.prompt?.trim() || null,
					model: s.model || null,
					label: s.label?.trim() || `Step ${i + 1}`
				}))
			}),
			...(body.defaultProject !== undefined && { defaultProject: body.defaultProject || null }),
			updatedAt: new Date().toISOString()
		};

		await writePipelines(pipelines);

		return json({
			success: true,
			pipeline: pipelines[index],
			message: `Pipeline '${pipelines[index].name}' updated`,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error(`[quick-command/pipelines/${params.id}] Failed to update:`, error);
		return json(
			{ error: 'Failed to update pipeline', message: error.message },
			{ status: 500 }
		);
	}
}

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ params }) {
	try {
		const pipelines = await readPipelines();
		const index = pipelines.findIndex((p) => p.id === params.id);

		if (index === -1) {
			return json(
				{ error: 'Pipeline not found', message: `No pipeline with ID '${params.id}'` },
				{ status: 404 }
			);
		}

		const removed = pipelines.splice(index, 1)[0];
		await writePipelines(pipelines);

		return json({
			success: true,
			message: `Pipeline '${removed.name}' deleted`,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error(`[quick-command/pipelines/${params.id}] Failed to delete:`, error);
		return json(
			{ error: 'Failed to delete pipeline', message: error.message },
			{ status: 500 }
		);
	}
}
