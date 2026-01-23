/**
 * Credentials API Endpoint
 *
 * Manages API keys and service credentials.
 *
 * Endpoints:
 * - GET: Returns credentials with masked API keys
 * - PUT: Set or update an API key
 * - DELETE: Remove an API key
 *
 * Security:
 * - Full keys never sent to browser
 * - Keys masked as sk-ant-...7x4k format
 * - File stored with 0600 permissions
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getMaskedCredentials,
	setApiKey,
	deleteApiKey,
	getApiKey,
	verifyApiKey,
	updateKeyVerification,
	validateKeyFormat,
	API_KEY_PROVIDERS
} from '$lib/utils/credentials';

/**
 * GET /api/config/credentials
 *
 * Returns credentials with masked API keys (safe for browser)
 */
export const GET: RequestHandler = async () => {
	try {
		const credentials = getMaskedCredentials();

		return json({
			success: true,
			credentials,
			providers: API_KEY_PROVIDERS
		});
	} catch (error) {
		console.error('Error fetching credentials:', error);
		return json(
			{
				success: false,
				error: 'Failed to fetch credentials'
			},
			{ status: 500 }
		);
	}
};

/**
 * PUT /api/config/credentials
 *
 * Set or update an API key
 *
 * Body: { provider: string, key: string, verify?: boolean }
 */
export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { provider, key, verify = true } = body;

		// Validate provider
		if (!provider || typeof provider !== 'string') {
			return json(
				{ success: false, error: 'Provider is required' },
				{ status: 400 }
			);
		}

		// Validate key
		if (!key || typeof key !== 'string') {
			return json(
				{ success: false, error: 'API key is required' },
				{ status: 400 }
			);
		}

		// Validate key format
		const formatCheck = validateKeyFormat(provider, key);
		if (!formatCheck.valid) {
			return json(
				{ success: false, error: formatCheck.error },
				{ status: 400 }
			);
		}

		// Optionally verify the key works
		let verificationResult: { success: boolean; error?: string } = { success: true };
		if (verify) {
			verificationResult = await verifyApiKey(provider, key.trim());
		}

		// Save the key (even if verification failed - user might want to save anyway)
		setApiKey(provider, key.trim());

		// Update verification status
		if (verify) {
			updateKeyVerification(provider, verificationResult.success, verificationResult.error);
		}

		// Return updated credentials
		const credentials = getMaskedCredentials();

		return json({
			success: true,
			verified: verificationResult.success,
			verificationError: verificationResult.error,
			credentials
		});
	} catch (error) {
		console.error('Error setting API key:', error);
		return json(
			{
				success: false,
				error: 'Failed to save API key'
			},
			{ status: 500 }
		);
	}
};

/**
 * DELETE /api/config/credentials
 *
 * Remove an API key
 *
 * Query: ?provider=anthropic
 */
export const DELETE: RequestHandler = async ({ url }) => {
	try {
		const provider = url.searchParams.get('provider');

		if (!provider) {
			return json(
				{ success: false, error: 'Provider is required' },
				{ status: 400 }
			);
		}

		deleteApiKey(provider);

		// Return updated credentials
		const credentials = getMaskedCredentials();

		return json({
			success: true,
			credentials
		});
	} catch (error) {
		console.error('Error deleting API key:', error);
		return json(
			{
				success: false,
				error: 'Failed to delete API key'
			},
			{ status: 500 }
		);
	}
};

/**
 * POST /api/config/credentials
 *
 * Verify an existing API key
 *
 * Body: { provider: string }
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { provider } = body;

		if (!provider || typeof provider !== 'string') {
			return json(
				{ success: false, error: 'Provider is required' },
				{ status: 400 }
			);
		}

		// Get the stored key
		const key = getApiKey(provider);
		if (!key) {
			return json(
				{ success: false, error: 'No API key found for this provider' },
				{ status: 404 }
			);
		}

		// Verify the key
		const result = await verifyApiKey(provider, key);

		// Update verification status
		updateKeyVerification(provider, result.success, result.error);

		// Return updated credentials
		const credentials = getMaskedCredentials();

		return json({
			success: true,
			verified: result.success,
			verificationError: result.error,
			credentials
		});
	} catch (error) {
		console.error('Error verifying API key:', error);
		return json(
			{
				success: false,
				error: 'Failed to verify API key'
			},
			{ status: 500 }
		);
	}
};
