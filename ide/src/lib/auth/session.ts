/**
 * Session handling for Keycloak auth.
 * Stores encrypted session payload in HTTP-only cookie; validates JWT from Keycloak.
 */

import * as jose from 'jose';
import {
	getKeycloakConfig,
	getSessionCookieName,
	getSessionMaxAge,
	type KeycloakUser
} from './keycloak';

const ALG = 'RS256';
let cachedJwks: jose.JWTVerifyGetKey | null = null;

export interface SessionPayload {
	user: KeycloakUser;
	/** id_token from Keycloak (for logout hint) */
	idToken?: string;
	exp: number;
}

/**
 * Fetch Keycloak JWKS and return a key getter for jose.
 */
async function getJwksGetter(): Promise<jose.JWTVerifyGetKey | null> {
	const config = getKeycloakConfig();
	if (!config) return null;
	if (cachedJwks) return cachedJwks;

	const jwksUrl = `${config.url}/realms/${config.realm}/protocol/openid-connect/certs`;
	const jwks = jose.createRemoteJWKSet(new URL(jwksUrl));
	cachedJwks = jwks;
	return jwks;
}

/**
 * Create session cookie value: store user + id_token + exp.
 * We store the id_token so we can pass it as id_token_hint on logout.
 * Cookie value is base64(JSON) for simplicity (cookie is HTTP-only and same-site).
 * For stronger integrity you could sign with HMAC; here we rely on Keycloak's id_token signature.
 */
export function createSessionCookie(payload: SessionPayload): string {
	const maxAge = getSessionMaxAge();
	const exp = Math.floor(Date.now() / 1000) + maxAge;
	const data: SessionPayload = {
		user: payload.user,
		idToken: payload.idToken,
		exp
	};
	return Buffer.from(JSON.stringify(data), 'utf-8').toString('base64url');
}

/**
 * Parse and validate session cookie. Returns null if missing/invalid/expired.
 */
export async function getSessionFromCookie(cookieValue: string | undefined): Promise<SessionPayload | null> {
	if (!cookieValue) return null;

	try {
		const raw = Buffer.from(cookieValue, 'base64url').toString('utf-8');
		const data = JSON.parse(raw) as SessionPayload;
		if (!data.user?.sub || !data.exp) return null;
		if (data.exp < Math.floor(Date.now() / 1000)) return null;
		return data;
	} catch {
		return null;
	}
}

/**
 * Verify Keycloak ID token and return user. Used after callback before setting cookie.
 */
export async function verifyIdToken(idToken: string): Promise<KeycloakUser | null> {
	const config = getKeycloakConfig();
	if (!config) return null;

	const jwks = await getJwksGetter();
	if (!jwks) return null;

	try {
		const { payload } = await jose.jwtVerify(idToken, jwks, {
			issuer: `${config.url}/realms/${config.realm}`,
			audience: config.clientId
		});
		return {
			sub: payload.sub as string,
			email: (payload.email as string) || undefined,
			name: (payload.name as string) || undefined,
			preferred_username: (payload.preferred_username as string) || undefined
		};
	} catch {
		return null;
	}
}

export { getSessionCookieName, getSessionMaxAge };
