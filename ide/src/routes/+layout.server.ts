/**
 * Layout server load: pass auth state to client.
 */
import type { LayoutServerLoad } from './$types';
import { isKeycloakEnabled } from '$lib/auth/keycloak';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user ?? null,
		keycloakEnabled: isKeycloakEnabled()
	};
};
