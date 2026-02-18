// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { Logger } from 'pino';
import type { KeycloakUser } from '$lib/auth/keycloak';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			requestId: string;
			logger: Logger;
			/** Set when Keycloak auth is enabled and user is logged in */
			user?: KeycloakUser;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
