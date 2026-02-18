/**
 * GET /auth/keycloak/callback — OAuth callback; exchange code for tokens, set session, redirect.
 */
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handleCallback, getKeycloakConfig } from '$lib/auth/keycloak';
import { createSessionCookie, getSessionCookieName, getSessionMaxAge } from '$lib/auth/session';

const OAUTH_COOKIE = 'squad_keycloak_oauth';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const config = getKeycloakConfig();
	if (!config) {
		return redirect(302, '/login?error=keycloak_not_configured');
	}

	const state = url.searchParams.get('state');
	const oauthCookie = cookies.get(OAUTH_COOKIE);
	if (!state || !oauthCookie) {
		return redirect(302, '/login?error=callback_missing_params');
	}

	let expectedState: string;
	let codeVerifier: string;
	try {
		const parsed = JSON.parse(oauthCookie) as { state: string; codeVerifier: string };
		expectedState = parsed.state;
		codeVerifier = parsed.codeVerifier;
	} catch {
		return redirect(302, '/login?error=callback_invalid_cookie');
	}

	const result = await handleCallback(url, state, codeVerifier);
	if (!result) {
		return redirect(302, '/login?error=callback_failed');
	}

	// Clear OAuth cookie
	cookies.delete(OAUTH_COOKIE, { path: '/' });

	const idToken = 'id_token' in result.tokenSet ? result.tokenSet.id_token : undefined;
	const sessionPayload = createSessionCookie({
		user: result.user,
		idToken,
		exp: Math.floor(Date.now() / 1000) + getSessionMaxAge()
	});

	const isSecure = url.protocol === 'https:';
	cookies.set(getSessionCookieName(), sessionPayload, {
		path: '/',
		httpOnly: true,
		secure: isSecure,
		sameSite: 'lax',
		maxAge: getSessionMaxAge()
	});

	return redirect(302, '/');
};
