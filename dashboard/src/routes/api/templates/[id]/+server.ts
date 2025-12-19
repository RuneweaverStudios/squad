/**
 * API endpoints for individual template operations
 *
 * Endpoints:
 *   GET    /api/templates/[id]  - Get a single template
 *   PUT    /api/templates/[id]  - Update a template
 *   DELETE /api/templates/[id]  - Delete a template
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getUserTemplate,
	updateUserTemplate,
	deleteUserTemplate,
	isValidTemplateId
} from '$lib/utils/userTemplates';

/**
 * Validate template ID parameter
 */
function validateId(id: string): void {
	if (!id || !isValidTemplateId(id)) {
		throw error(
			400,
			'Invalid template ID. Must be 2-64 characters, alphanumeric with hyphens/underscores.'
		);
	}
}

/**
 * GET /api/templates/[id]
 *
 * Get a single template by ID
 */
export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;
	validateId(id);

	try {
		const template = await getUserTemplate(id);

		if (!template) {
			throw error(404, `Template '${id}' not found`);
		}

		return json({
			template
		});
	} catch (err) {
		// Re-throw SvelteKit errors
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		console.error(`[templates API] GET ${id} error:`, err);
		throw error(500, `Failed to get template: ${(err as Error).message}`);
	}
};

/**
 * PUT /api/templates/[id]
 *
 * Update an existing template
 *
 * Body: {
 *   name?: string,
 *   content?: string,
 *   description?: string,
 *   icon?: string,
 *   useCase?: string,
 *   frontmatter?: { ... },
 *   variables?: [...]
 * }
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	const { id } = params;
	validateId(id);

	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	try {
		// Build updates object from body, filtering out undefined values
		const updates: Record<string, unknown> = {};

		if (body.name !== undefined) updates.name = body.name;
		if (body.content !== undefined) updates.content = body.content;
		if (body.description !== undefined) updates.description = body.description;
		if (body.icon !== undefined) updates.icon = body.icon;
		if (body.useCase !== undefined) updates.useCase = body.useCase;
		if (body.frontmatter !== undefined) updates.frontmatter = body.frontmatter;
		if (body.variables !== undefined) updates.variables = body.variables;

		const template = await updateUserTemplate(id, updates);

		return json({
			success: true,
			template,
			message: `Template '${id}' updated successfully`
		});
	} catch (err) {
		// Re-throw SvelteKit errors
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		// Handle not found
		if ((err as Error).message?.includes('not found')) {
			throw error(404, `Template '${id}' not found`);
		}

		console.error(`[templates API] PUT ${id} error:`, err);
		throw error(500, `Failed to update template: ${(err as Error).message}`);
	}
};

/**
 * DELETE /api/templates/[id]
 *
 * Delete a template
 */
export const DELETE: RequestHandler = async ({ params }) => {
	const { id } = params;
	validateId(id);

	try {
		const deleted = await deleteUserTemplate(id);

		if (!deleted) {
			throw error(404, `Template '${id}' not found`);
		}

		return json({
			success: true,
			message: `Template '${id}' deleted successfully`
		});
	} catch (err) {
		// Re-throw SvelteKit errors
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		console.error(`[templates API] DELETE ${id} error:`, err);
		throw error(500, `Failed to delete template: ${(err as Error).message}`);
	}
};
