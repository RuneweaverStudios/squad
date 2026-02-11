/**
 * WebSocket Connection Pool Manager
 *
 * Manages persistent WebSocket connections to IDE clients.
 * Supports channel-based message routing for agents, tasks, and output updates.
 *
 * Architecture:
 * - Single WebSocket server instance shared across the app
 * - Clients subscribe to channels (agents, tasks, output, messages)
 * - File watchers and API endpoints broadcast to relevant channels
 * - Connection pool tracks all active clients with metadata
 *
 * Usage:
 *   import { broadcast, subscribe, getStats } from '$lib/server/websocket/connectionPool';
 *
 *   // Server-side: Broadcast an event
 *   broadcast('tasks', { type: 'task-updated', task: {...} });
 *
 *   // Client metadata is tracked per connection
 *   getStats(); // Returns { totalClients, channelSubscribers, uptime }
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server as HttpServer } from 'http';
import {
	enqueue,
	startRetryProcessor,
	stopRetryProcessor,
	registerClient,
	unregisterClient,
	getQueueStats,
	setDeadLetterCallback,
	type MessagePriority
} from './messageQueue.js';

// ============================================================================
// Types
// ============================================================================

/** Supported broadcast channels */
export type Channel = 'agents' | 'tasks' | 'output' | 'messages' | 'sessions' | 'system';

/** Message types for each channel */
export interface ChannelMessages {
	agents: {
		type: 'agent-state-change' | 'agent-usage-update' | 'agent-activity';
		agentName: string;
		data: unknown;
	};
	tasks: {
		type: 'task-change' | 'task-updated' | 'task-created' | 'task-deleted';
		taskId?: string;
		newTasks?: string[];
		removedTasks?: string[];
		data?: unknown;
	};
	output: {
		type: 'output-update';
		sessionName: string;
		output: string;
		lineCount: number;
	};
	messages: {
		type: 'new-message' | 'message-ack';
		agentName: string;
		data: unknown;
	};
	sessions: {
		type: 'session-state' | 'session-output';
		sessionName: string;
		data?: unknown;
	};
	system: {
		type: 'connected' | 'heartbeat' | 'error' | 'subscribed' | 'unsubscribed';
		message?: string;
		channels?: Channel[];
	};
}

/** Client subscription request */
interface SubscribeMessage {
	action: 'subscribe' | 'unsubscribe';
	channels: Channel[];
}

/** Client metadata stored per connection */
interface ClientMetadata {
	id: string;
	connectedAt: Date;
	subscribedChannels: Set<Channel>;
	lastHeartbeat: Date;
	userAgent?: string;
	remoteAddress?: string;
}

// ============================================================================
// Connection Pool State
// ============================================================================

/** WebSocket server instance (singleton) */
let wss: WebSocketServer | null = null;

/** Map of WebSocket connections to their metadata */
const clients = new Map<WebSocket, ClientMetadata>();

/** Channel subscription map for efficient broadcasting */
const channelSubscribers = new Map<Channel, Set<WebSocket>>();

/** Server start time for uptime tracking */
let serverStartTime: Date | null = null;

/** Heartbeat interval handle */
let heartbeatInterval: NodeJS.Timeout | null = null;

/** Unique client ID counter */
let clientIdCounter = 0;

// Initialize channel subscriber sets
const allChannels: Channel[] = ['agents', 'tasks', 'output', 'messages', 'sessions', 'system'];
allChannels.forEach(channel => {
	channelSubscribers.set(channel, new Set());
});

// ============================================================================
// WebSocket Server Setup
// ============================================================================

/**
 * Initialize the WebSocket server on an HTTP server
 * Called by Vite plugin (dev) or custom server (prod)
 */
export function initializeWebSocket(httpServer: HttpServer): WebSocketServer {
	if (wss) {
		console.log('[WS] WebSocket server already initialized');
		return wss;
	}

	console.log('[WS] Initializing WebSocket server...');

	// Create WebSocket server without attaching to httpServer directly
	// This avoids conflicts with SvelteKit's request handling
	wss = new WebSocketServer({ noServer: true });

	serverStartTime = new Date();

	wss.on('connection', handleConnection);
	wss.on('error', (error) => {
		console.error('[WS] Server error:', error);
	});

	// Handle upgrade requests manually before SvelteKit can intercept them
	httpServer.on('upgrade', (request, socket, head) => {
		const url = request.url || '';

		// Only handle /ws path for our WebSocket server
		if (url === '/ws' || url.startsWith('/ws?')) {
			wss!.handleUpgrade(request, socket, head, (ws) => {
				wss!.emit('connection', ws, request);
			});
		}
		// Let other upgrade requests (like Vite HMR) pass through
	});

	// Start heartbeat interval (every 30 seconds)
	heartbeatInterval = setInterval(sendHeartbeats, 30000);

	// Start message retry processor
	startRetryProcessor();

	// Set up dead letter callback for logging
	setDeadLetterCallback((clientId, message) => {
		console.warn(
			`[WS] Dead letter: message ${message.id} to ${clientId} ` +
				`on channel ${message.channel} after ${message.attemptCount} attempts`
		);
	});

	console.log('[WS] WebSocket server ready on /ws');
	return wss;
}

/**
 * Handle new WebSocket connection
 */
function handleConnection(ws: WebSocket, request: IncomingMessage): void {
	const clientId = `client-${++clientIdCounter}`;

	const metadata: ClientMetadata = {
		id: clientId,
		connectedAt: new Date(),
		subscribedChannels: new Set(),
		lastHeartbeat: new Date(),
		userAgent: request.headers['user-agent'],
		remoteAddress: request.socket.remoteAddress
	};

	clients.set(ws, metadata);
	registerClient(ws, clientId);
	console.log(`[WS] Client connected: ${clientId} (total: ${clients.size})`);

	// Send welcome message
	sendToClient(ws, 'system', {
		type: 'connected',
		message: `Connected as ${clientId}`,
		channels: []
	});

	// Handle incoming messages
	ws.on('message', (data) => {
		try {
			const message = JSON.parse(data.toString());
			handleClientMessage(ws, message);
		} catch (error) {
			console.error(`[WS] Failed to parse message from ${clientId}:`, error);
			sendToClient(ws, 'system', {
				type: 'error',
				message: 'Invalid JSON message'
			});
		}
	});

	// Handle pong (heartbeat response)
	ws.on('pong', () => {
		const meta = clients.get(ws);
		if (meta) {
			meta.lastHeartbeat = new Date();
		}
	});

	// Handle disconnection
	ws.on('close', () => {
		handleDisconnection(ws);
	});

	ws.on('error', (error) => {
		console.error(`[WS] Client ${clientId} error:`, error);
	});
}

/**
 * Handle client disconnection - cleanup subscriptions
 */
function handleDisconnection(ws: WebSocket): void {
	const meta = clients.get(ws);
	if (meta) {
		console.log(`[WS] Client disconnected: ${meta.id}`);

		// Remove from all channel subscriptions
		meta.subscribedChannels.forEach(channel => {
			const subscribers = channelSubscribers.get(channel);
			subscribers?.delete(ws);
		});
	}

	// Unregister from message queue (dead letters any pending messages)
	unregisterClient(ws);

	clients.delete(ws);
	console.log(`[WS] Total clients: ${clients.size}`);
}

/**
 * Handle messages from client
 */
function handleClientMessage(ws: WebSocket, message: unknown): void {
	const meta = clients.get(ws);
	if (!meta) return;

	// Type guard for subscribe/unsubscribe messages
	if (isSubscribeMessage(message)) {
		if (message.action === 'subscribe') {
			subscribeClient(ws, message.channels);
		} else if (message.action === 'unsubscribe') {
			unsubscribeClient(ws, message.channels);
		}
	}
}

function isSubscribeMessage(msg: unknown): msg is SubscribeMessage {
	return (
		typeof msg === 'object' &&
		msg !== null &&
		'action' in msg &&
		(msg.action === 'subscribe' || msg.action === 'unsubscribe') &&
		'channels' in msg &&
		Array.isArray((msg as SubscribeMessage).channels)
	);
}

/**
 * Subscribe a client to channels
 */
function subscribeClient(ws: WebSocket, channels: Channel[]): void {
	const meta = clients.get(ws);
	if (!meta) return;

	const subscribedChannels: Channel[] = [];

	channels.forEach(channel => {
		if (allChannels.includes(channel)) {
			meta.subscribedChannels.add(channel);
			channelSubscribers.get(channel)?.add(ws);
			subscribedChannels.push(channel);
		}
	});

	console.log(`[WS] Client ${meta.id} subscribed to: ${subscribedChannels.join(', ')}`);

	sendToClient(ws, 'system', {
		type: 'subscribed',
		message: `Subscribed to ${subscribedChannels.length} channels`,
		channels: subscribedChannels
	});
}

/**
 * Unsubscribe a client from channels
 */
function unsubscribeClient(ws: WebSocket, channels: Channel[]): void {
	const meta = clients.get(ws);
	if (!meta) return;

	const unsubscribedChannels: Channel[] = [];

	channels.forEach(channel => {
		if (meta.subscribedChannels.has(channel)) {
			meta.subscribedChannels.delete(channel);
			channelSubscribers.get(channel)?.delete(ws);
			unsubscribedChannels.push(channel);
		}
	});

	console.log(`[WS] Client ${meta.id} unsubscribed from: ${unsubscribedChannels.join(', ')}`);

	sendToClient(ws, 'system', {
		type: 'unsubscribed',
		message: `Unsubscribed from ${unsubscribedChannels.length} channels`,
		channels: unsubscribedChannels
	});
}

// ============================================================================
// Broadcasting
// ============================================================================

/** Broadcast options */
export interface BroadcastOptions {
	/** Message priority for retry queue (default: 'normal') */
	priority?: MessagePriority;
	/** Whether to queue failed messages for retry (default: true) */
	enableRetry?: boolean;
}

/**
 * Broadcast a message to all subscribers of a channel
 *
 * Messages that fail to send are automatically queued for retry with
 * exponential backoff. Use the priority option for important messages.
 *
 * @param channel - The channel to broadcast to
 * @param message - The message payload (will be JSON stringified)
 * @param options - Broadcast options (priority, enableRetry)
 * @returns Object with sent count and queued count
 *
 * @example
 * // Normal broadcast (queues failed messages for retry)
 * broadcast('tasks', { type: 'task-updated', taskId: 'jat-abc', data: {...} });
 *
 * // High priority broadcast (more retries, faster retry)
 * broadcast('agents', { type: 'agent-state-change', ... }, { priority: 'high' });
 *
 * // Fire-and-forget (no retry on failure)
 * broadcast('output', { type: 'output-update', ... }, { enableRetry: false });
 */
export function broadcast<C extends Channel>(
	channel: C,
	message: ChannelMessages[C],
	options: BroadcastOptions = {}
): { sent: number; queued: number } {
	const { priority = 'normal', enableRetry = true } = options;

	const subscribers = channelSubscribers.get(channel);
	if (!subscribers || subscribers.size === 0) {
		return { sent: 0, queued: 0 };
	}

	const payload = JSON.stringify({
		channel,
		timestamp: Date.now(),
		...message
	});

	let sentCount = 0;
	let queuedCount = 0;

	subscribers.forEach(ws => {
		if (ws.readyState === WebSocket.OPEN) {
			try {
				ws.send(payload);
				sentCount++;
			} catch (error) {
				console.error(`[WS] Failed to send to client:`, error);
				if (enableRetry) {
					enqueue(ws, channel, message, { priority });
					queuedCount++;
				}
			}
		} else if (enableRetry && ws.readyState === WebSocket.CONNECTING) {
			// Client is reconnecting, queue for later
			enqueue(ws, channel, message, { priority });
			queuedCount++;
		}
	});

	return { sent: sentCount, queued: queuedCount };
}

/**
 * Send a message to a specific client
 */
function sendToClient<C extends Channel>(
	ws: WebSocket,
	channel: C,
	message: ChannelMessages[C]
): boolean {
	if (ws.readyState !== WebSocket.OPEN) {
		return false;
	}

	try {
		const payload = JSON.stringify({
			channel,
			timestamp: Date.now(),
			...message
		});
		ws.send(payload);
		return true;
	} catch (error) {
		console.error('[WS] Failed to send to client:', error);
		return false;
	}
}

/**
 * Send heartbeat pings to all clients
 * Clients that don't respond are considered dead
 */
function sendHeartbeats(): void {
	const now = new Date();
	const staleThreshold = 60000; // 60 seconds

	clients.forEach((meta, ws) => {
		// Check if client is stale (no pong in 60 seconds)
		if (now.getTime() - meta.lastHeartbeat.getTime() > staleThreshold) {
			console.log(`[WS] Terminating stale client: ${meta.id}`);
			ws.terminate();
			return;
		}

		// Send ping
		if (ws.readyState === WebSocket.OPEN) {
			ws.ping();
		}
	});

	// Also broadcast heartbeat to all system channel subscribers
	broadcast('system', { type: 'heartbeat' });
}

// ============================================================================
// Stats & Utilities
// ============================================================================

/**
 * Get connection pool statistics
 */
export function getStats(): {
	totalClients: number;
	channelStats: Record<Channel, number>;
	uptimeSeconds: number;
	clientDetails: Array<{
		id: string;
		connectedAt: string;
		channels: Channel[];
		lastHeartbeat: string;
	}>;
	messageQueue: ReturnType<typeof getQueueStats>;
} {
	const channelStats: Record<Channel, number> = {} as Record<Channel, number>;
	allChannels.forEach(channel => {
		channelStats[channel] = channelSubscribers.get(channel)?.size || 0;
	});

	const clientDetails = Array.from(clients.entries()).map(([, meta]) => ({
		id: meta.id,
		connectedAt: meta.connectedAt.toISOString(),
		channels: Array.from(meta.subscribedChannels) as Channel[],
		lastHeartbeat: meta.lastHeartbeat.toISOString()
	}));

	return {
		totalClients: clients.size,
		channelStats,
		uptimeSeconds: serverStartTime
			? Math.floor((Date.now() - serverStartTime.getTime()) / 1000)
			: 0,
		clientDetails,
		messageQueue: getQueueStats()
	};
}

/**
 * Check if WebSocket server is initialized
 */
export function isInitialized(): boolean {
	return wss !== null;
}

/**
 * Get subscriber count for a specific channel
 */
export function getChannelSubscriberCount(channel: Channel): number {
	return channelSubscribers.get(channel)?.size || 0;
}

/**
 * Shutdown WebSocket server gracefully
 */
export function shutdown(): Promise<void> {
	return new Promise((resolve) => {
		if (heartbeatInterval) {
			clearInterval(heartbeatInterval);
			heartbeatInterval = null;
		}

		// Stop message retry processor
		stopRetryProcessor();

		if (!wss) {
			resolve();
			return;
		}

		// Notify all clients of shutdown (fire-and-forget, no retry needed)
		broadcast('system', { type: 'error', message: 'Server shutting down' }, { enableRetry: false });

		// Close all connections (this will dead-letter queued messages)
		clients.forEach((meta, ws) => {
			unregisterClient(ws);
			ws.close(1001, 'Server shutdown');
		});
		clients.clear();

		// Reset channel subscribers
		allChannels.forEach(channel => {
			channelSubscribers.get(channel)?.clear();
		});

		wss.close(() => {
			console.log('[WS] WebSocket server closed');
			wss = null;
			serverStartTime = null;
			resolve();
		});
	});
}

// ============================================================================
// Convenience Functions for Specific Channels
// ============================================================================

/**
 * Broadcast agent state change (high priority - state changes are important)
 */
export function broadcastAgentState(
	agentName: string,
	state: string,
	data?: unknown
): { sent: number; queued: number } {
	return broadcast(
		'agents',
		{
			type: 'agent-state-change',
			agentName,
			data: { state, ...((data as object) || {}) }
		},
		{ priority: 'high' }
	);
}

/**
 * Broadcast agent usage update (normal priority)
 */
export function broadcastAgentUsage(
	agentName: string,
	usage: { tokens: number; cost: number }
): { sent: number; queued: number } {
	return broadcast('agents', {
		type: 'agent-usage-update',
		agentName,
		data: usage
	});
}

/**
 * Broadcast task change event (high priority - task changes are important)
 */
export function broadcastTaskChange(
	newTasks: string[] = [],
	removedTasks: string[] = []
): { sent: number; queued: number } {
	return broadcast(
		'tasks',
		{
			type: 'task-change',
			newTasks,
			removedTasks
		},
		{ priority: 'high' }
	);
}

/**
 * Broadcast task update (normal priority)
 */
export function broadcastTaskUpdate(
	taskId: string,
	data: unknown
): { sent: number; queued: number } {
	return broadcast('tasks', {
		type: 'task-updated',
		taskId,
		data
	});
}

/**
 * Broadcast output update for a session (low priority, fire-and-forget)
 * Output updates are high volume and not critical - missing one is okay
 */
export function broadcastOutput(
	sessionName: string,
	output: string,
	lineCount: number
): { sent: number; queued: number } {
	return broadcast(
		'output',
		{
			type: 'output-update',
			sessionName,
			output,
			lineCount
		},
		{ priority: 'low', enableRetry: false }
	);
}

/**
 * Broadcast new agent mail message (high priority - messages are important)
 */
export function broadcastNewMessage(
	agentName: string,
	messageData: unknown
): { sent: number; queued: number } {
	return broadcast(
		'messages',
		{
			type: 'new-message',
			agentName,
			data: messageData
		},
		{ priority: 'high' }
	);
}

/**
 * Broadcast session state change (high priority - state changes are important)
 * Used by watchers.ts to push session state over WS instead of SSE
 */
export function broadcastSessionState(
	sessionName: string,
	state: string,
	data?: unknown
): { sent: number; queued: number } {
	return broadcast(
		'sessions',
		{
			type: 'session-state',
			sessionName,
			data: { state, ...((data as object) || {}) }
		},
		{ priority: 'high' }
	);
}

/**
 * Broadcast session output update (low priority, fire-and-forget)
 * Output updates are high volume and not critical - missing one is okay
 */
export function broadcastSessionOutput(
	sessionName: string,
	delta: string,
	lineCount: number
): { sent: number; queued: number } {
	return broadcast(
		'sessions',
		{
			type: 'session-output',
			sessionName,
			data: { delta, lineCount }
		},
		{ priority: 'low', enableRetry: false }
	);
}
