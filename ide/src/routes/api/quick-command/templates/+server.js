/**
 * Quick Command Templates API
 * GET  /api/quick-command/templates - List all templates
 * POST /api/quick-command/templates - Create a new template
 */

import { json } from '@sveltejs/kit';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomBytes } from 'crypto';

const CONFIG_DIR = join(homedir(), '.config', 'jat');
const TEMPLATES_FILE = join(CONFIG_DIR, 'quick-commands.json');

/**
 * Read templates from config file.
 * @returns {Promise<Array<unknown>>}
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
 * @param {Array<unknown>} templates
 */
async function writeTemplates(templates) {
	if (!existsSync(CONFIG_DIR)) {
		await mkdir(CONFIG_DIR, { recursive: true });
	}
	await writeFile(TEMPLATES_FILE, JSON.stringify(templates, null, 2), 'utf-8');
}

/**
 * Generate a short random ID.
 * @returns {string}
 */
function generateId() {
	return randomBytes(4).toString('hex');
}

/** @type {import('./$types').RequestHandler} */
export async function GET() {
	try {
		const templates = await readTemplates();
		return json({
			success: true,
			templates,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('[quick-command/templates] Failed to read templates:', error);
		return json(
			{ error: 'Failed to read templates', message: error instanceof Error ? error.message : String(error) },
			{ status: 500 }
		);
	}
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	try {
		const body = await request.json();
		const { name, prompt, defaultProject, defaultModel = 'haiku', outputAction, variables = [] } = body;

		if (!name || typeof name !== 'string' || name.trim().length === 0) {
			return json(
				{ error: 'Missing required field: name', message: 'Template name is required' },
				{ status: 400 }
			);
		}

		if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
			return json(
				{ error: 'Missing required field: prompt', message: 'Template prompt is required' },
				{ status: 400 }
			);
		}

		const templates = await readTemplates();

		// Check for duplicate names
		if (templates.some((t) => (/** @type {{ name: string }} */ (t)).name.toLowerCase() === name.trim().toLowerCase())) {
			return json(
				{ error: 'Duplicate name', message: `Template '${name}' already exists` },
				{ status: 409 }
			);
		}

		const template = {
			id: generateId(),
			name: name.trim(),
			prompt: prompt.trim(),
			defaultProject: defaultProject || null,
			defaultModel,
			...(outputAction && outputAction !== 'display' && { outputAction }),
			variables: Array.isArray(variables) ? variables : [],
			createdAt: new Date().toISOString()
		};

		templates.push(template);
		await writeTemplates(templates);

		return json({
			success: true,
			template,
			message: `Template '${template.name}' created`,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('[quick-command/templates] Failed to create template:', error);
		return json(
			{ error: 'Failed to create template', message: error instanceof Error ? error.message : String(error) },
			{ status: 500 }
		);
	}
}
