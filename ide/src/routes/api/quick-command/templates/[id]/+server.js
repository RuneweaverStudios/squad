/**
 * Quick Command Template CRUD API
 * GET    /api/quick-command/templates/[id] - Get template by ID
 * PUT    /api/quick-command/templates/[id] - Update template
 * DELETE /api/quick-command/templates/[id] - Delete template
 */

import { json } from '@sveltejs/kit';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_DIR = join(homedir(), '.config', 'jat');
const TEMPLATES_FILE = join(CONFIG_DIR, 'quick-commands.json');

/**
 * Read templates from config file.
 * @returns {Promise<Array>}
 */
async function readTemplates() {
	try {
		if (!existsSync(TEMPLATES_FILE)) return [];
		const content = await readFile(TEMPLATES_FILE, 'utf-8');
		const data = JSON.parse(content);
		return Array.isArray(data) ? data : [];
	} catch {
		return [];
	}
}

/**
 * Write templates to config file.
 * @param {Array} templates
 */
async function writeTemplates(templates) {
	if (!existsSync(CONFIG_DIR)) {
		await mkdir(CONFIG_DIR, { recursive: true });
	}
	await writeFile(TEMPLATES_FILE, JSON.stringify(templates, null, 2), 'utf-8');
}

/** @type {import('./$types').RequestHandler} */
export async function GET({ params }) {
	try {
		const templates = await readTemplates();
		const template = templates.find((t) => t.id === params.id);

		if (!template) {
			return json(
				{ error: 'Template not found', message: `No template with ID '${params.id}'` },
				{ status: 404 }
			);
		}

		return json({
			success: true,
			template,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error(`[quick-command/templates/${params.id}] Failed to read:`, error);
		return json(
			{ error: 'Failed to read template', message: error.message },
			{ status: 500 }
		);
	}
}

/** @type {import('./$types').RequestHandler} */
export async function PUT({ params, request }) {
	try {
		const body = await request.json();
		const templates = await readTemplates();
		const index = templates.findIndex((t) => t.id === params.id);

		if (index === -1) {
			return json(
				{ error: 'Template not found', message: `No template with ID '${params.id}'` },
				{ status: 404 }
			);
		}

		// Check for duplicate name (excluding self)
		if (
			body.name &&
			templates.some(
				(t, i) => i !== index && t.name.toLowerCase() === body.name.trim().toLowerCase()
			)
		) {
			return json(
				{ error: 'Duplicate name', message: `Template '${body.name}' already exists` },
				{ status: 409 }
			);
		}

		// Merge updates
		const existing = templates[index];
		templates[index] = {
			...existing,
			...(body.name && { name: body.name.trim() }),
			...(body.prompt && { prompt: body.prompt.trim() }),
			...(body.defaultProject !== undefined && { defaultProject: body.defaultProject || null }),
			...(body.defaultModel && { defaultModel: body.defaultModel }),
			...(body.outputAction !== undefined && {
				outputAction: body.outputAction && body.outputAction !== 'display' ? body.outputAction : undefined
			}),
			...(body.variables && { variables: body.variables }),
			updatedAt: new Date().toISOString()
		};

		await writeTemplates(templates);

		return json({
			success: true,
			template: templates[index],
			message: `Template '${templates[index].name}' updated`,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error(`[quick-command/templates/${params.id}] Failed to update:`, error);
		return json(
			{ error: 'Failed to update template', message: error.message },
			{ status: 500 }
		);
	}
}

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ params }) {
	try {
		const templates = await readTemplates();
		const index = templates.findIndex((t) => t.id === params.id);

		if (index === -1) {
			return json(
				{ error: 'Template not found', message: `No template with ID '${params.id}'` },
				{ status: 404 }
			);
		}

		const removed = templates.splice(index, 1)[0];
		await writeTemplates(templates);

		return json({
			success: true,
			message: `Template '${removed.name}' deleted`,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error(`[quick-command/templates/${params.id}] Failed to delete:`, error);
		return json(
			{ error: 'Failed to delete template', message: error.message },
			{ status: 500 }
		);
	}
}
