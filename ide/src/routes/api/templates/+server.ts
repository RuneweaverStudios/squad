/**
 * API endpoints for user templates management
 *
 * Templates are stored in ~/.config/squad/templates/ as JSON files.
 *
 * Endpoints:
 *   GET  /api/templates          - List all user templates
 *   POST /api/templates          - Create a new template
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getAllUserTemplates,
	saveUserTemplate,
	userTemplateExists,
	getTemplatesDirectory,
	templatesDirectoryExists
} from '$lib/utils/userTemplates.server';

/**
 * GET /api/templates
 *
 * List all user templates
 *
 * Query params:
 *   - debug: Include debug info (default: false)
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const templates = await getAllUserTemplates();
		const debug = url.searchParams.has('debug');

		return json({
			templates,
			count: templates.length,
			...(debug && {
				debug: {
					directory: getTemplatesDirectory(),
					directoryExists: templatesDirectoryExists()
				}
			})
		});
	} catch (err) {
		console.error('[templates API] GET error:', err);
		throw error(500, `Failed to list templates: ${(err as Error).message}`);
	}
};

/**
 * POST /api/templates
 *
 * Create a new template
 *
 * Body: {
 *   id: string,        // Required: unique identifier
 *   name: string,      // Required: display name
 *   content: string,   // Required: template content
 *   description?: string,
 *   icon?: string,
 *   useCase?: string,
 *   frontmatter?: { ... },
 *   variables?: [...]
 * }
 *
 * Query params:
 *   - overwrite: Allow overwriting existing template (default: false)
 */
export const POST: RequestHandler = async ({ url, request }) => {
	let body: Record<string, unknown>;

	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	// Validate required fields
	if (!body.id || typeof body.id !== 'string') {
		throw error(400, 'Request body must contain "id" field (template identifier)');
	}

	if (!body.name || typeof body.name !== 'string') {
		throw error(400, 'Request body must contain "name" field (display name)');
	}

	if (!body.content || typeof body.content !== 'string') {
		throw error(400, 'Request body must contain "content" field (template content)');
	}

	const overwrite = url.searchParams.get('overwrite') === 'true';

	// Check if template exists
	if (!overwrite && userTemplateExists(body.id)) {
		throw error(
			409,
			`Template '${body.id}' already exists. Use ?overwrite=true or PUT /api/templates/${body.id} to update.`
		);
	}

	try {
		const template = await saveUserTemplate(
			{
				id: body.id,
				name: body.name,
				content: body.content,
				description: (body.description as string) || '',
				icon: (body.icon as string) || '📄',
				useCase: (body.useCase as string) || '',
				frontmatter: (body.frontmatter as Record<string, string>) || {},
				variables: body.variables as Array<{
					name: string;
					label: string;
					placeholder?: string;
					defaultValue?: string;
					multiline?: boolean;
					hint?: string;
					required?: boolean;
				}>
			},
			{ overwrite }
		);

		return json(
			{
				success: true,
				template,
				message: `Template '${template.id}' ${overwrite ? 'updated' : 'created'} successfully`
			},
			{ status: overwrite ? 200 : 201 }
		);
	} catch (err) {
		console.error('[templates API] POST error:', err);
		throw error(500, `Failed to save template: ${(err as Error).message}`);
	}
};
