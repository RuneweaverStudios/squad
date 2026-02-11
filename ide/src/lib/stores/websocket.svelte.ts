/**
 * WebSocket Client Store
 *
 * Manages the WebSocket connection to the IDE server.
 * Provides reactive state for connection status and channel subscriptions.
 * Handles automatic reconnection with exponential backoff.
 *
 * Usage:
 *   import { connect, subscribe, disconnect, getConnectionState } from '$lib/stores/websocket.svelte';
 *
 *   // Connect to server
 *   connect();
 *
 *   // Subscribe to channels
 *   subscribe(['agents', 'tasks']);
 *
 *   // Listen for messages
 *   const unsubscribe = onMessage('tasks', (msg) => {
 *     console.log('Task update:', msg);
 *   });
 *
 *   // Cleanup
 *   unsubscribe();
 *   disconnect();
 */

import { browser } from '$app/environment';

// ============================================================================
// Types
// ============================================================================

/** Supported channels (must match server-side Channel type) */
export type Channel = 'agents' | 'tasks' | 'output' | 'messages' | 'sessions' | 'system';

/** Connection states */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** WebSocket message from server */
export interface WebSocketMessage {
	channel: Channel;
	timestamp: number;
	type: string;
	[key: string]: unknown;
}

/** Message handler function */
type MessageHandler = (message: WebSocketMessage) => void;

// ============================================================================
// State
// ============================================================================

interface WebSocketState {
	connectionState: ConnectionState;
	subscribedChannels: Set<Channel>;
	lastError: string | null;
	reconnectAttempts: number;
	lastMessageTime: Date | null;
}

let state = $state<WebSocketState>({
	connectionState: 'disconnected',
	subscribedChannels: new Set(),
	lastError: null,
	reconnectAttempts: 0,
	lastMessageTime: null
});

// WebSocket instance
let ws: WebSocket | null = null;

// Message handlers per channel
const handlers = new Map<Channel, Set<MessageHandler>>();

// Reconnection config
const RECONNECT_BASE_DELAY = 1000; // 1 second
const RECONNECT_MAX_DELAY = 30000; // 30 seconds
const RECONNECT_MAX_ATTEMPTS = 10;

let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

// Channels to resubscribe after reconnection
let pendingSubscriptions: Channel[] = [];

// ============================================================================
// Connection Management
// ============================================================================

/**
 * Get the WebSocket URL based on current location
 */
function getWebSocketUrl(): string {
	if (!browser) return '';

	const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
	const host = window.location.host;
	return `${protocol}//${host}/ws`;
}

/**
 * Connect to the WebSocket server
 */
export function connect(): void {
	if (!browser) return;

	if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
		console.log('[WS Client] Already connected or connecting');
		return;
	}

	const url = getWebSocketUrl();
	console.log(`[WS Client] Connecting to ${url}...`);
	state.connectionState = 'connecting';
	state.lastError = null;

	try {
		ws = new WebSocket(url);

		ws.onopen = handleOpen;
		ws.onmessage = handleMessage;
		ws.onclose = handleClose;
		ws.onerror = handleError;
	} catch (error) {
		console.error('[WS Client] Failed to create WebSocket:', error);
		state.connectionState = 'disconnected';
		state.lastError = error instanceof Error ? error.message : 'Failed to connect';
		scheduleReconnect();
	}
}

/**
 * Disconnect from the WebSocket server
 */
export function disconnect(): void {
	if (!browser) return;

	console.log('[WS Client] Disconnecting...');

	// Cancel any pending reconnect
	if (reconnectTimeout) {
		clearTimeout(reconnectTimeout);
		reconnectTimeout = null;
	}

	if (ws) {
		ws.onclose = null; // Prevent reconnect on intentional disconnect
		ws.close(1000, 'Client disconnect');
		ws = null;
	}

	state.connectionState = 'disconnected';
	state.subscribedChannels.clear();
	state.reconnectAttempts = 0;
}

/**
 * Handle WebSocket open
 */
function handleOpen(): void {
	console.log('[WS Client] Connected');
	state.connectionState = 'connected';
	state.reconnectAttempts = 0;
	state.lastError = null;

	// Resubscribe to pending channels
	if (pendingSubscriptions.length > 0) {
		subscribe(pendingSubscriptions);
		pendingSubscriptions = [];
	}
}

/**
 * Handle incoming WebSocket message
 */
function handleMessage(event: MessageEvent): void {
	try {
		const message: WebSocketMessage = JSON.parse(event.data);
		state.lastMessageTime = new Date();

		// Route to channel handlers
		const channelHandlers = handlers.get(message.channel);
		if (channelHandlers) {
			channelHandlers.forEach(handler => {
				try {
					handler(message);
				} catch (error) {
					console.error(`[WS Client] Handler error for ${message.channel}:`, error);
				}
			});
		}
	} catch (error) {
		console.error('[WS Client] Failed to parse message:', error);
	}
}

/**
 * Handle WebSocket close
 */
function handleClose(event: CloseEvent): void {
	console.log(`[WS Client] Disconnected: ${event.code} ${event.reason}`);

	ws = null;

	// Store current subscriptions for reconnection
	pendingSubscriptions = Array.from(state.subscribedChannels);
	state.subscribedChannels.clear();

	// Schedule reconnection if not intentional close
	if (event.code !== 1000) {
		scheduleReconnect();
	} else {
		state.connectionState = 'disconnected';
	}
}

/**
 * Handle WebSocket error
 */
function handleError(event: Event): void {
	console.error('[WS Client] Error:', event);
	state.lastError = 'WebSocket error';
}

/**
 * Schedule a reconnection attempt with exponential backoff
 */
function scheduleReconnect(): void {
	if (state.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
		console.log('[WS Client] Max reconnect attempts reached');
		state.connectionState = 'disconnected';
		state.lastError = 'Max reconnection attempts reached';
		return;
	}

	state.connectionState = 'reconnecting';
	state.reconnectAttempts++;

	// Exponential backoff with jitter
	const baseDelay = Math.min(
		RECONNECT_BASE_DELAY * Math.pow(2, state.reconnectAttempts - 1),
		RECONNECT_MAX_DELAY
	);
	const jitter = Math.random() * 1000;
	const delay = baseDelay + jitter;

	console.log(`[WS Client] Reconnecting in ${Math.round(delay)}ms (attempt ${state.reconnectAttempts})`);

	reconnectTimeout = setTimeout(() => {
		reconnectTimeout = null;
		connect();
	}, delay);
}

// ============================================================================
// Channel Subscriptions
// ============================================================================

/**
 * Subscribe to channels
 */
export function subscribe(channels: Channel[]): void {
	if (!browser) return;

	if (!ws || ws.readyState !== WebSocket.OPEN) {
		// Store for later when connected
		pendingSubscriptions = [...new Set([...pendingSubscriptions, ...channels])];
		console.log('[WS Client] Queued subscription for:', channels);
		return;
	}

	const message = {
		action: 'subscribe',
		channels
	};

	ws.send(JSON.stringify(message));
	channels.forEach(ch => state.subscribedChannels.add(ch));
	console.log('[WS Client] Subscribed to:', channels);
}

/**
 * Unsubscribe from channels
 */
export function unsubscribe(channels: Channel[]): void {
	if (!browser) return;

	if (!ws || ws.readyState !== WebSocket.OPEN) {
		return;
	}

	const message = {
		action: 'unsubscribe',
		channels
	};

	ws.send(JSON.stringify(message));
	channels.forEach(ch => state.subscribedChannels.delete(ch));
	console.log('[WS Client] Unsubscribed from:', channels);
}

// ============================================================================
// Message Handlers
// ============================================================================

/**
 * Register a handler for messages on a specific channel
 * Returns an unsubscribe function
 */
export function onMessage(channel: Channel, handler: MessageHandler): () => void {
	if (!handlers.has(channel)) {
		handlers.set(channel, new Set());
	}

	handlers.get(channel)!.add(handler);

	return () => {
		handlers.get(channel)?.delete(handler);
	};
}

/**
 * Remove all handlers for a channel
 */
export function clearHandlers(channel: Channel): void {
	handlers.get(channel)?.clear();
}

// ============================================================================
// Reactive Getters
// ============================================================================

/**
 * Get current connection state
 */
export function getConnectionState(): ConnectionState {
	return state.connectionState;
}

/**
 * Get subscribed channels
 */
export function getSubscribedChannels(): Channel[] {
	return Array.from(state.subscribedChannels);
}

/**
 * Get last error message
 */
export function getLastError(): string | null {
	return state.lastError;
}

/**
 * Get reconnect attempt count
 */
export function getReconnectAttempts(): number {
	return state.reconnectAttempts;
}

/**
 * Get last message time
 */
export function getLastMessageTime(): Date | null {
	return state.lastMessageTime;
}

/**
 * Check if connected
 */
export function isConnected(): boolean {
	return state.connectionState === 'connected';
}

// Export state for direct reactive access
export { state as websocketState };

// ============================================================================
// Auto-connect DISABLED - now managed by +layout.svelte via connectionManager
// ============================================================================

// Previously auto-connected on module import, but this caused issues with multiple tabs.
// Each tab would create a WebSocket connection immediately, exhausting the browser's
// connection limit (typically 6 per domain). Now managed centrally via connectionManager
// which only connects when the tab is visible.
//
// Connection is initiated in +layout.svelte:
//   registerConnection('websocket', connect, disconnect, 5);
