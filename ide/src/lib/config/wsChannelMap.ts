/**
 * Route → WebSocket Channel Mapping for Selective Subscriptions
 *
 * Maps IDE routes to the WS channels they need. Pages only subscribe to
 * channels they actually use, reducing server broadcast overhead.
 *
 * Channel reference:
 * - 'tasks'    : Task CRUD events (low volume, ~1/min) — needed on all pages
 * - 'sessions' : Session lifecycle events (moderate, ~1/5s) — needed for layout badges
 * - 'output'   : Terminal output deltas (HIGH volume, ~1/2s per session) — only /work, /tasks
 * - 'agents'   : Agent state changes (low volume) — currently unused client-side
 * - 'messages'  : Agent Mail events (low volume) — currently unused client-side
 * - 'system'   : System events, heartbeat (low volume)
 */

import type { Channel } from '$lib/stores/websocket.svelte';

/**
 * Channels that EVERY page subscribes to (via layout).
 * These are always active regardless of current route.
 */
export const BASE_CHANNELS: Channel[] = ['tasks', 'sessions'];

/**
 * Additional channels needed per route prefix.
 * Only the ADDITIONAL channels beyond BASE_CHANNELS are listed here.
 * If a route isn't listed, it only gets BASE_CHANNELS.
 */
const ROUTE_CHANNELS: Record<string, Channel[]> = {
	'/work': ['output'],
	'/tasks': ['output'],
};

/**
 * Get the channels needed for a given route path.
 * Returns BASE_CHANNELS + any route-specific channels.
 *
 * @param pathname - The current route pathname (e.g., '/work', '/tasks/squad-abc')
 * @returns Array of channels to subscribe to
 */
export function getChannelsForRoute(pathname: string): Channel[] {
	// Check route prefixes (longest match first)
	for (const [prefix, extraChannels] of Object.entries(ROUTE_CHANNELS)) {
		if (pathname === prefix || pathname.startsWith(prefix + '/')) {
			return [...BASE_CHANNELS, ...extraChannels];
		}
	}

	return [...BASE_CHANNELS];
}

/**
 * Get ONLY the route-specific channels (not including base channels).
 * Useful for determining what to subscribe/unsubscribe on route changes.
 */
export function getExtraChannelsForRoute(pathname: string): Channel[] {
	for (const [prefix, extraChannels] of Object.entries(ROUTE_CHANNELS)) {
		if (pathname === prefix || pathname.startsWith(prefix + '/')) {
			return [...extraChannels];
		}
	}
	return [];
}
