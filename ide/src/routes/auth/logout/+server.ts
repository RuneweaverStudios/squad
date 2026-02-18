/**
 * GET /auth/logout — Clear session and redirect to Keycloak end-session (optional).
 */
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLogoutUrl, getKeycloakConfig } from '$lib/auth/keycloak';
import { getSessionCookieName, getSessionFromCookie } from '$lib/auth/session';

export const GET: RequestHandler = async ({ cookies, url }) => {
	const cookieName = getSessionCookieName();
	const cookieValue = cookies.get(cookieName);
	let idTokenHint: string | undefined;

	if (cookieValue) {
		const session = await getSessionFromCookie(cookieValue);
		if (session?.idToken) idTokenHint = session.idToken;
	}

	cookies.delete(cookieName, { path: '/' });

	const config = getKeycloakConfig();
	if (!config) {
		return redirect(302, '/');
	}

	const logoutUrl = getLogoutUrl(idTokenHint);
	if (logoutUrl) {
		return redirect(302, logoutUrl);
	}

	return redirect(302, '/');
};
