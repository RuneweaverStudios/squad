/**
 * Keycloak (Red Hat) OIDC integration for Squad IDE.
 *
 * Enterprise-grade open-source IAM. Supports OAuth 2.0, OIDC, SAML,
 * social logins, MFA, passwordless, passkeys. Docker-friendly.
 *
 * When KEYCLOAK_* env vars are set, the IDE requires login via Keycloak.
 * When not set, the IDE runs without authentication (default).
 *
 * Uses openid-client v6 (discovery + Configuration + PKCE).
 */

import * as client from 'openid-client';
import type { Configuration } from 'openid-client';
import type { TokenEndpointResponse } from 'oauth4webapi';

const COOKIE_NAME = 'squad_keycloak_session';
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

export interface KeycloakConfig {
	/** Base URL of Keycloak server (e.g. https://auth.example.com) */
	url: string;
	/** Realm name */
	realm: string;
	/** Client ID */
	clientId: string;
	/** Client secret (confidential client) */
	clientSecret: string;
	/** Redirect URI for OAuth callback (e.g. https://ide.example.com/auth/keycloak/callback) */
	redirectUri: string;
	/** Optional: post-logout redirect (defaults to redirectUri origin) */
	postLogoutRedirectUri?: string;
}

export interface KeycloakUser {
	sub: string;
	email?: string;
	name?: string;
	preferred_username?: string;
}

let cachedConfig: Configuration | null = null;

/**
 * Read Keycloak configuration from environment.
 * Returns null if Keycloak is not configured (auth disabled).
 */
export function getKeycloakConfig(): KeycloakConfig | null {
	const url = process.env.KEYCLOAK_URL;
	const realm = process.env.KEYCLOAK_REALM;
	const clientId = process.env.KEYCLOAK_CLIENT_ID;
	const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
	const redirectUri = process.env.KEYCLOAK_REDIRECT_URI;

	if (!url || !realm || !clientId || !clientSecret || !redirectUri) {
		return null;
	}

	const baseUrl = url.replace(/\/$/, '');
	return {
		url: baseUrl,
		realm,
		clientId,
		clientSecret,
		redirectUri,
		postLogoutRedirectUri: process.env.KEYCLOAK_POST_LOGOUT_URI || undefined
	};
}

export function isKeycloakEnabled(): boolean {
	return getKeycloakConfig() !== null;
}

export function getSessionCookieName(): string {
	return COOKIE_NAME;
}

export function getSessionMaxAge(): number {
	return SESSION_MAX_AGE_SEC;
}

/**
 * Get or create OpenID Configuration for Keycloak (cached).
 */
export async function getKeycloakConfiguration(): Promise<Configuration | null> {
	const config = getKeycloakConfig();
	if (!config) return null;

	if (cachedConfig) return cachedConfig;

	const issuerUrl = `${config.url}/realms/${config.realm}`;
	const serverUrl = new URL(issuerUrl);
	const metadata: Partial<client.ClientMetadata> = {
		redirect_uris: [config.redirectUri],
		response_types: ['code'],
		scope: 'openid profile email'
	};
	cachedConfig = await client.discovery(
		serverUrl,
		config.clientId,
		metadata,
		client.ClientSecretPost(config.clientSecret)
	);
	return cachedConfig;
}

/**
 * Build authorization URL for redirecting the user to Keycloak login.
 * Returns { url, state, codeVerifier } — store state and codeVerifier in cookies for the callback.
 */
export async function getAuthorizationUrl(state: string): Promise<{
	url: string;
	codeVerifier: string;
} | null> {
	const config = await getKeycloakConfiguration();
	const kcConfig = getKeycloakConfig();
	if (!config || !kcConfig) return null;

	const codeVerifier = client.randomPKCECodeVerifier();
	const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

	const redirectTo = client.buildAuthorizationUrl(config, {
		redirect_uri: kcConfig.redirectUri,
		scope: 'openid profile email',
		state,
		code_challenge: codeChallenge,
		code_challenge_method: 'S256'
	});
	return { url: redirectTo.toString(), codeVerifier };
}

/**
 * Exchange authorization code for tokens and return user info.
 */
export async function handleCallback(
	requestUrl: URL,
	expectedState: string,
	codeVerifier: string
): Promise<{ user: KeycloakUser; tokenSet: TokenEndpointResponse & { id_token?: string } } | null> {
	const config = await getKeycloakConfiguration();
	if (!config) return null;

	const tokenResponse = await client.authorizationCodeGrant(config, requestUrl, {
		expectedState,
		pkceCodeVerifier: codeVerifier
	});

	const claims = tokenResponse.claims?.();
	if (!claims?.sub) return null;

	const user: KeycloakUser = {
		sub: claims.sub as string,
		email: (claims.email as string) || undefined,
		name: (claims.name as string) || undefined,
		preferred_username: (claims.preferred_username as string) || undefined
	};
	return {
		user,
		tokenSet: tokenResponse as TokenEndpointResponse & { id_token?: string }
	};
}

/**
 * Build end-session (logout) URL for Keycloak.
 * id_token_hint improves single logout behavior when supported.
 */
export function getLogoutUrl(idTokenHint?: string): string | null {
	const config = getKeycloakConfig();
	if (!config) return null;

	const base = `${config.url}/realms/${config.realm}/protocol/openid-connect/logout`;
	const postLogout = config.postLogoutRedirectUri || new URL(config.redirectUri).origin;
	const params = new URLSearchParams({ post_logout_redirect_uri: postLogout });
	if (idTokenHint) params.set('id_token_hint', idTokenHint);
	return `${base}?${params.toString()}`;
}
