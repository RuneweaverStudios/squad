/**
 * Connection Manager - Manages persistent connections based on page visibility
 *
 * Problem: Browsers limit concurrent connections per domain (typically 6 for HTTP/1.1).
 * Each browser tab creates persistent WebSocket connections.
 * With 3+ tabs open, connections can pile up and interfere with HTTP requests.
 *
 * Solution: Use the Page Visibility API to pause connections in background tabs.
 * Only the visible/focused tab maintains active connections.
 *
 * Usage:
 *   import { registerConnection, unregisterConnection, isPageVisible } from '$lib/utils/connectionManager';
 *
 *   // Register a connection with connect/disconnect callbacks
 *   const id = registerConnection('websocket', connectWS, disconnectWS);
 *
 *   // On cleanup
 *   unregisterConnection(id);
 */

import { browser } from '$app/environment';

// ============================================================================
// Types
// ============================================================================

interface Connection {
	id: string;
	name: string;
	connect: () => void;
	disconnect: () => void;
	priority: number; // Lower = higher priority (connects first on visibility)
}

// ============================================================================
// State
// ============================================================================

let connections = new Map<string, Connection>();
let connectionIdCounter = 0;
let isVisible = true;
let visibilityListenerRegistered = false;

// ============================================================================
// Page Visibility
// ============================================================================

/**
 * Check if the page is currently visible
 */
export function isPageVisible(): boolean {
	if (!browser) return true;
	return document.visibilityState === 'visible';
}

/**
 * Handle visibility change - connect/disconnect all registered connections
 */
function handleVisibilityChange(): void {
	const wasVisible = isVisible;
	isVisible = document.visibilityState === 'visible';

	if (wasVisible === isVisible) return;

	console.log(`[ConnectionManager] Visibility changed: ${isVisible ? 'visible' : 'hidden'}`);

	if (isVisible) {
		// Tab became visible - reconnect all connections (sorted by priority)
		const sorted = Array.from(connections.values()).sort((a, b) => a.priority - b.priority);
		sorted.forEach(conn => {
			console.log(`[ConnectionManager] Connecting: ${conn.name}`);
			try {
				conn.connect();
			} catch (err) {
				console.error(`[ConnectionManager] Failed to connect ${conn.name}:`, err);
			}
		});
	} else {
		// Tab became hidden - disconnect all connections
		connections.forEach(conn => {
			console.log(`[ConnectionManager] Disconnecting: ${conn.name}`);
			try {
				conn.disconnect();
			} catch (err) {
				console.error(`[ConnectionManager] Failed to disconnect ${conn.name}:`, err);
			}
		});
	}
}

/**
 * Initialize visibility listener (called once)
 */
function initVisibilityListener(): void {
	if (!browser || visibilityListenerRegistered) return;

	isVisible = document.visibilityState === 'visible';
	document.addEventListener('visibilitychange', handleVisibilityChange);
	visibilityListenerRegistered = true;

	console.log(`[ConnectionManager] Initialized, page is ${isVisible ? 'visible' : 'hidden'}`);
}

// ============================================================================
// Connection Registration
// ============================================================================

/**
 * Register a connection to be managed by visibility state
 *
 * @param name - Human-readable name for logging
 * @param connect - Function to establish the connection
 * @param disconnect - Function to close the connection
 * @param priority - Connection priority (lower = connects first). Default: 10
 * @returns Connection ID for unregistering
 */
export function registerConnection(
	name: string,
	connect: () => void,
	disconnect: () => void,
	priority: number = 10
): string {
	if (!browser) return '';

	// Initialize listener on first registration
	initVisibilityListener();

	const id = `conn-${++connectionIdCounter}`;

	connections.set(id, {
		id,
		name,
		connect,
		disconnect,
		priority
	});

	console.log(`[ConnectionManager] Registered: ${name} (id=${id}, priority=${priority})`);

	// If page is visible, connect immediately
	if (isVisible) {
		console.log(`[ConnectionManager] Page visible, connecting ${name} immediately`);
		try {
			connect();
		} catch (err) {
			console.error(`[ConnectionManager] Failed to connect ${name}:`, err);
		}
	} else {
		console.log(`[ConnectionManager] Page hidden, deferring ${name} connection`);
	}

	return id;
}

/**
 * Unregister a connection and disconnect if connected
 */
export function unregisterConnection(id: string): void {
	if (!browser || !id) return;

	const conn = connections.get(id);
	if (conn) {
		console.log(`[ConnectionManager] Unregistering: ${conn.name}`);
		try {
			conn.disconnect();
		} catch (err) {
			console.error(`[ConnectionManager] Failed to disconnect ${conn.name}:`, err);
		}
		connections.delete(id);
	}
}

/**
 * Get the number of registered connections
 */
export function getConnectionCount(): number {
	return connections.size;
}

/**
 * Get names of all registered connections (for debugging)
 */
export function getConnectionNames(): string[] {
	return Array.from(connections.values()).map(c => c.name);
}

// ============================================================================
// Manual Control (for testing/debugging)
// ============================================================================

/**
 * Manually trigger all connections to connect
 */
export function connectAll(): void {
	if (!browser) return;

	connections.forEach(conn => {
		console.log(`[ConnectionManager] Manual connect: ${conn.name}`);
		try {
			conn.connect();
		} catch (err) {
			console.error(`[ConnectionManager] Failed to connect ${conn.name}:`, err);
		}
	});
}

/**
 * Manually trigger all connections to disconnect
 */
export function disconnectAll(): void {
	if (!browser) return;

	connections.forEach(conn => {
		console.log(`[ConnectionManager] Manual disconnect: ${conn.name}`);
		try {
			conn.disconnect();
		} catch (err) {
			console.error(`[ConnectionManager] Failed to disconnect ${conn.name}:`, err);
		}
	});
}
