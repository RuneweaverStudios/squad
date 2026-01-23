/**
 * Project Secrets API Endpoint
 *
 * Manages per-project secrets (database URLs, Supabase keys, etc.)
 *
 * Endpoints:
 * - GET: Returns project secrets with masked values
 * - PUT: Set or update a secret
 * - DELETE: Remove a secret
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getMaskedProjectSecrets,
	setProjectSecret,
	deleteProjectSecret,
	getProjectSecret,
	PROJECT_SECRET_TYPES
} from '$lib/utils/credentials';

/**
 * GET /api/config/credentials/[project]
 *
 * Returns project secrets with masked values (safe for browser)
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const { project } = params;

		if (!project) {
			return json(
				{ success: false, error: 'Project key is required' },
				{ status: 400 }
			);
		}

		const secrets = getMaskedProjectSecrets(project);

		return json({
			success: true,
			project,
			secrets,
			secretTypes: PROJECT_SECRET_TYPES
		});
	} catch (error) {
		console.error('Error fetching project secrets:', error);
		return json(
			{
				success: false,
				error: 'Failed to fetch project secrets'
			},
			{ status: 500 }
		);
	}
};

/**
 * PUT /api/config/credentials/[project]
 *
 * Set or update a project secret
 *
 * Body: { secretKey: string, value: string, description?: string }
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const { project } = params;

		if (!project) {
			return json(
				{ success: false, error: 'Project key is required' },
				{ status: 400 }
			);
		}

		const body = await request.json();
		const { secretKey, value, description } = body;

		// Validate secret key
		if (!secretKey || typeof secretKey !== 'string') {
			return json(
				{ success: false, error: 'Secret key is required' },
				{ status: 400 }
			);
		}

		// Validate value
		if (!value || typeof value !== 'string') {
			return json(
				{ success: false, error: 'Secret value is required' },
				{ status: 400 }
			);
		}

		// Validate URL format for URL-type secrets
		const secretType = PROJECT_SECRET_TYPES.find((t) => t.id === secretKey);
		if (secretType?.isUrl) {
			try {
				new URL(value.trim());
			} catch {
				return json(
					{ success: false, error: `Invalid URL format for ${secretType.name}` },
					{ status: 400 }
				);
			}
		}

		// Save the secret
		setProjectSecret(project, secretKey, value.trim(), description);

		// Return updated secrets
		const secrets = getMaskedProjectSecrets(project);

		return json({
			success: true,
			project,
			secrets
		});
	} catch (error) {
		console.error('Error setting project secret:', error);
		return json(
			{
				success: false,
				error: 'Failed to save project secret'
			},
			{ status: 500 }
		);
	}
};

/**
 * DELETE /api/config/credentials/[project]
 *
 * Remove a project secret
 *
 * Query: ?secretKey=database_url
 */
export const DELETE: RequestHandler = async ({ params, url }) => {
	try {
		const { project } = params;
		const secretKey = url.searchParams.get('secretKey');

		if (!project) {
			return json(
				{ success: false, error: 'Project key is required' },
				{ status: 400 }
			);
		}

		if (!secretKey) {
			return json(
				{ success: false, error: 'Secret key is required' },
				{ status: 400 }
			);
		}

		deleteProjectSecret(project, secretKey);

		// Return updated secrets
		const secrets = getMaskedProjectSecrets(project);

		return json({
			success: true,
			project,
			secrets
		});
	} catch (error) {
		console.error('Error deleting project secret:', error);
		return json(
			{
				success: false,
				error: 'Failed to delete project secret'
			},
			{ status: 500 }
		);
	}
};
