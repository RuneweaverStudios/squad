/**
 * GET /auth/keycloak — Redirect to Keycloak login.
 */
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthorizationUrl, getKeycloakConfig } from '$lib/auth/keycloak';
import { randomBytes } from 'crypto';

const OAUTH_COOKIE = 'squad_keycloak_oauth';

export const GET: RequestHandler = async ({ cookies, url }) => {
	const config = getKeycloakConfig();
	if (!config) {
		return redirect(302, '/login?error=keycloak_not_configured');
	}

	const state = randomBytes(24).toString('hex');
	const authUrlResult = await getAuthorizationUrl(state);
	if (!authUrlResult) {
		return redirect(302, '/login?error=keycloak_init');
	}

	// Store state + PKCE code_verifier for callback (short-lived)
	const oauthPayload = JSON.stringify({ state, codeVerifier: authUrlResult.codeVerifier });
	cookies.set(OAUTH_COOKIE, oauthPayload, {
		path: '/',
		httpOnly: true,
		secure: url.protocol === 'https:',
		sameSite: 'lax',
		maxAge: 600
	});

	return redirect(302, authUrlResult.url);
};
