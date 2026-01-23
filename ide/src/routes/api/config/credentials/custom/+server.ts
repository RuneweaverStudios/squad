/**
 * Custom API Keys API Endpoint
 *
 * Manages user-defined custom API keys that can be accessed as environment variables.
 *
 * Endpoints:
 * - GET: List all custom API keys (masked)
 * - PUT: Create or update a custom API key
 * - DELETE: Remove a custom API key
 *
 * Security:
 * - Full key values never sent to browser
 * - Keys masked for display
 * - File stored with 0600 permissions
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getCustomApiKeys,
	setCustomApiKey,
	deleteCustomApiKey,
	validateCustomKeyName,
	validateEnvVarName
} from '$lib/utils/credentials';

/**
 * GET /api/config/credentials/custom
 *
 * Returns all custom API keys with masked values
 */
export const GET: RequestHandler = async () => {
	try {
		const customKeys = getCustomApiKeys();

		return json({
			success: true,
			customKeys
		});
	} catch (error) {
		console.error('Error fetching custom API keys:', error);
		return json(
			{
				success: false,
				error: 'Failed to fetch custom API keys'
			},
			{ status: 500 }
		);
	}
};

/**
 * PUT /api/config/credentials/custom
 *
 * Create or update a custom API key
 *
 * Body: { name: string, value: string, envVar: string, description?: string }
 */
export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { name, value, envVar, description } = body;

		// Validate name
		const nameCheck = validateCustomKeyName(name);
		if (!nameCheck.valid) {
			return json({ success: false, error: nameCheck.error }, { status: 400 });
		}

		// Validate value
		if (!value || typeof value !== 'string' || value.trim().length === 0) {
			return json({ success: false, error: 'API key value is required' }, { status: 400 });
		}

		// Validate env var name
		const envVarCheck = validateEnvVarName(envVar);
		if (!envVarCheck.valid) {
			return json({ success: false, error: envVarCheck.error }, { status: 400 });
		}

		// Save the key
		setCustomApiKey(name.trim(), value.trim(), envVar.trim(), description?.trim());

		// Return updated list
		const customKeys = getCustomApiKeys();

		return json({
			success: true,
			customKeys
		});
	} catch (error) {
		console.error('Error setting custom API key:', error);
		return json(
			{
				success: false,
				error: 'Failed to save custom API key'
			},
			{ status: 500 }
		);
	}
};

/**
 * DELETE /api/config/credentials/custom
 *
 * Remove a custom API key
 *
 * Query: ?name=my-key
 */
export const DELETE: RequestHandler = async ({ url }) => {
	try {
		const name = url.searchParams.get('name');

		if (!name) {
			return json({ success: false, error: 'Name is required' }, { status: 400 });
		}

		deleteCustomApiKey(name);

		// Return updated list
		const customKeys = getCustomApiKeys();

		return json({
			success: true,
			customKeys
		});
	} catch (error) {
		console.error('Error deleting custom API key:', error);
		return json(
			{
				success: false,
				error: 'Failed to delete custom API key'
			},
			{ status: 500 }
		);
	}
};
