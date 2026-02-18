/**
 * Quick Command Pipelines API
 * GET  /api/quick-command/pipelines - List all pipelines
 * POST /api/quick-command/pipelines - Create a new pipeline
 */

import { json } from '@sveltejs/kit';
import { randomBytes } from 'crypto';
import { readPipelines, writePipelines } from './lib.js';

function generateId() {
	return randomBytes(4).toString('hex');
}

/** @type {import('./$types').RequestHandler} */
export async function GET() {
	try {
		const pipelines = await readPipelines();
		return json({
			success: true,
			pipelines,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('[quick-command/pipelines] Failed to read pipelines:', error);
		return json(
			{ error: 'Failed to read pipelines', message: error instanceof Error ? error.message : String(error) },
			{ status: 500 }
		);
	}
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	try {
		const body = await request.json();
		const { name, description = '', steps = [], defaultProject } = body;

		if (!name || typeof name !== 'string' || name.trim().length === 0) {
			return json(
				{ error: 'Missing required field: name', message: 'Pipeline name is required' },
				{ status: 400 }
			);
		}

		if (!Array.isArray(steps) || steps.length < 2) {
			return json(
				{ error: 'Invalid steps', message: 'Pipeline must have at least 2 steps' },
				{ status: 400 }
			);
		}

		// Validate each step has either templateId or prompt
		for (let i = 0; i < steps.length; i++) {
			const step = steps[i];
			if (!step.templateId && (!step.prompt || step.prompt.trim().length === 0)) {
				return json(
					{ error: 'Invalid step', message: `Step ${i + 1} must have either a template or a prompt` },
					{ status: 400 }
				);
			}
		}

		const pipelines = await readPipelines();

		if (pipelines.some((/** @type {{ name: string }} */ p) => p.name.toLowerCase() === name.trim().toLowerCase())) {
			return json(
				{ error: 'Duplicate name', message: `Pipeline '${name}' already exists` },
				{ status: 409 }
			);
		}

		const pipeline = {
			id: generateId(),
			name: name.trim(),
			description: description.trim(),
			steps: steps.map((s, i) => ({
				id: s.id || generateId(),
				order: i,
				templateId: s.templateId || null,
				prompt: s.prompt?.trim() || null,
				model: s.model || null,
				label: s.label?.trim() || `Step ${i + 1}`
			})),
			defaultProject: defaultProject || null,
			createdAt: new Date().toISOString()
		};

		pipelines.push(pipeline);
		await writePipelines(pipelines);

		return json({
			success: true,
			pipeline,
			message: `Pipeline '${pipeline.name}' created`,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('[quick-command/pipelines] Failed to create pipeline:', error);
		return json(
			{ error: 'Failed to create pipeline', message: error instanceof Error ? error.message : String(error) },
			{ status: 500 }
		);
	}
}
