/**
 * WebSocket Leader Election via BroadcastChannel
 *
 * Ensures only ONE browser tab holds the active WebSocket connection.
 * The leader tab relays received messages to follower tabs via BroadcastChannel.
 * If the leader tab closes, a follower is automatically promoted.
 *
 * Protocol:
 * 1. On init, tab sends CLAIM message
 * 2. Existing leader responds with REJECT (includes leader's tabId)
 * 3. If no REJECT within CLAIM_TIMEOUT, tab becomes leader
 * 4. Leader sends HEARTBEAT every HEARTBEAT_INTERVAL
 * 5. If followers miss heartbeat for HEARTBEAT_TIMEOUT, they re-elect
 * 6. On beforeunload, leader sends RESIGN
 *
 * Message relay:
 * - Leader receives WS messages → relays via BroadcastChannel
 * - Followers receive relayed messages → dispatch to local handlers
 *
 * Subscription aggregation:
 * - Each tab sends SUBSCRIBE/UNSUBSCRIBE with its desired channels
 * - Leader maintains union of all tabs' subscriptions
 * - Leader sends actual subscribe/unsubscribe to WS server
 */

import { browser } from '$app/environment';

// ============================================================================
// Types
// ============================================================================

import type { Channel, WebSocketMessage } from '$lib/stores/websocket.svelte';

/** Messages sent over the BroadcastChannel */
type LeaderMessage =
	| { type: 'CLAIM'; tabId: string; timestamp: number }
	| { type: 'REJECT'; tabId: string; leaderTabId: string }
	| { type: 'HEARTBEAT'; tabId: string; timestamp: number }
	| { type: 'RESIGN'; tabId: string }
	| { type: 'WS_MESSAGE'; message: WebSocketMessage }
	| { type: 'SUBSCRIBE'; tabId: string; channels: Channel[] }
	| { type: 'UNSUBSCRIBE'; tabId: string; channels: Channel[] }
	| { type: 'TAB_CLOSING'; tabId: string }
	| { type: 'SUBSCRIPTION_STATE'; channels: Channel[] };

type Role = 'undecided' | 'leader' | 'follower';

type MessageHandler = (message: WebSocketMessage) => void;
type RoleChangeHandler = (role: Role, previousRole: Role) => void;
type SubscriptionChangeHandler = (channels: Channel[]) => void;

// ============================================================================
// Configuration
// ============================================================================

const CHANNEL_NAME = 'squad-ws-leader';
const CLAIM_TIMEOUT = 300; // ms to wait for REJECT before becoming leader
const HEARTBEAT_INTERVAL = 3000; // ms between leader heartbeats
const HEARTBEAT_TIMEOUT = 8000; // ms without heartbeat before re-election

// ============================================================================
// State
// ============================================================================

let bc: BroadcastChannel | null = null;
let tabId = '';
let role: Role = 'undecided';
let leaderTabId = '';

// Timers
let claimTimeout: ReturnType<typeof setTimeout> | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let heartbeatWatchdog: ReturnType<typeof setTimeout> | null = null;

// Per-tab subscription tracking (leader only)
// Maps tabId → set of channels that tab wants
const tabSubscriptions = new Map<string, Set<Channel>>();

// This tab's desired channels
let localChannels = new Set<Channel>();

// Callbacks
const messageHandlers = new Set<MessageHandler>();
const roleChangeHandlers = new Set<RoleChangeHandler>();
const subscriptionChangeHandlers = new Set<SubscriptionChangeHandler>();

// WS control callbacks (set by websocket.svelte.ts)
let wsConnect: (() => void) | null = null;
let wsDisconnect: (() => void) | null = null;
let wsSubscribe: ((channels: Channel[]) => void) | null = null;
let wsUnsubscribe: ((channels: Channel[]) => void) | null = null;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the leader election system.
 * Call once on app mount. Sets up BroadcastChannel and starts election.
 */
export function initLeaderElection(): void {
	if (!browser) return;

	tabId = crypto.randomUUID();
	bc = new BroadcastChannel(CHANNEL_NAME);
	bc.onmessage = handleBroadcastMessage;

	// Listen for tab close to resign leadership
	window.addEventListener('beforeunload', handleBeforeUnload);

	// Start claiming leadership
	claim();

	console.log(`[LeaderElection] Initialized tab ${tabId.slice(0, 8)}`);
}

/**
 * Destroy the leader election system.
 * Call on app unmount.
 */
export function destroyLeaderElection(): void {
	if (!browser) return;

	window.removeEventListener('beforeunload', handleBeforeUnload);

	if (role === 'leader') {
		broadcast({ type: 'RESIGN', tabId });
		stopHeartbeat();
		wsDisconnect?.();
	}

	clearTimers();

	bc?.close();
	bc = null;
	role = 'undecided';
	leaderTabId = '';
	tabSubscriptions.clear();
	localChannels.clear();
	messageHandlers.clear();
	roleChangeHandlers.clear();
	subscriptionChangeHandlers.clear();
}

// ============================================================================
// Election Protocol
// ============================================================================

function claim(): void {
	broadcast({ type: 'CLAIM', tabId, timestamp: Date.now() });

	// Wait for REJECT from existing leader
	claimTimeout = setTimeout(() => {
		claimTimeout = null;
		becomeLeader();
	}, CLAIM_TIMEOUT);
}

function becomeLeader(): void {
	const previousRole = role;
	role = 'leader';
	leaderTabId = tabId;

	console.log(`[LeaderElection] ${tabId.slice(0, 8)} is now LEADER`);

	// Start heartbeat
	startHeartbeat();

	// Connect actual WebSocket
	wsConnect?.();

	// Restore this tab's subscriptions + any pending from followers
	recomputeSubscriptions();

	// Notify role change listeners
	notifyRoleChange(previousRole);
}

function becomeFollower(newLeaderTabId: string): void {
	const previousRole = role;
	role = 'follower';
	leaderTabId = newLeaderTabId;

	console.log(`[LeaderElection] ${tabId.slice(0, 8)} is FOLLOWER (leader: ${newLeaderTabId.slice(0, 8)})`);

	// Disconnect actual WebSocket if we had one (role transition from leader)
	if (previousRole === 'leader') {
		stopHeartbeat();
		wsDisconnect?.();
	}

	// Start watching for leader heartbeats
	resetHeartbeatWatchdog();

	// Send our subscriptions to the new leader
	if (localChannels.size > 0) {
		broadcast({ type: 'SUBSCRIBE', tabId, channels: Array.from(localChannels) });
	}

	// Notify role change listeners
	notifyRoleChange(previousRole);
}

// ============================================================================
// Heartbeat
// ============================================================================

function startHeartbeat(): void {
	stopHeartbeat();
	heartbeatInterval = setInterval(() => {
		broadcast({ type: 'HEARTBEAT', tabId, timestamp: Date.now() });
	}, HEARTBEAT_INTERVAL);

	// Send immediate heartbeat
	broadcast({ type: 'HEARTBEAT', tabId, timestamp: Date.now() });
}

function stopHeartbeat(): void {
	if (heartbeatInterval) {
		clearInterval(heartbeatInterval);
		heartbeatInterval = null;
	}
}

function resetHeartbeatWatchdog(): void {
	if (heartbeatWatchdog) {
		clearTimeout(heartbeatWatchdog);
	}
	heartbeatWatchdog = setTimeout(() => {
		console.log(`[LeaderElection] Leader heartbeat timeout, re-electing...`);
		leaderTabId = '';
		claim();
	}, HEARTBEAT_TIMEOUT);
}

// ============================================================================
// Message Handling
// ============================================================================

function handleBroadcastMessage(event: MessageEvent<LeaderMessage>): void {
	const msg = event.data;

	switch (msg.type) {
		case 'CLAIM':
			if (role === 'leader') {
				// Reject the claim - we're already leader
				broadcast({ type: 'REJECT', tabId: msg.tabId, leaderTabId: tabId });
			}
			break;

		case 'REJECT':
			if (msg.tabId === tabId && role === 'undecided') {
				// Our claim was rejected, become follower
				if (claimTimeout) {
					clearTimeout(claimTimeout);
					claimTimeout = null;
				}
				becomeFollower(msg.leaderTabId);
			}
			break;

		case 'HEARTBEAT':
			if (role === 'follower' && msg.tabId === leaderTabId) {
				resetHeartbeatWatchdog();
			}
			break;

		case 'RESIGN':
			if (msg.tabId === leaderTabId) {
				console.log(`[LeaderElection] Leader resigned, re-electing...`);
				leaderTabId = '';
				if (heartbeatWatchdog) {
					clearTimeout(heartbeatWatchdog);
					heartbeatWatchdog = null;
				}
				claim();
			}
			break;

		case 'WS_MESSAGE':
			if (role === 'follower') {
				// Dispatch relayed WS message to local handlers
				dispatchToHandlers(msg.message);
			}
			break;

		case 'SUBSCRIBE':
			if (role === 'leader') {
				handleFollowerSubscribe(msg.tabId, msg.channels);
			}
			break;

		case 'UNSUBSCRIBE':
			if (role === 'leader') {
				handleFollowerUnsubscribe(msg.tabId, msg.channels);
			}
			break;

		case 'TAB_CLOSING':
			if (role === 'leader') {
				// Remove closed tab's subscriptions
				tabSubscriptions.delete(msg.tabId);
				recomputeSubscriptions();
			}
			break;

		case 'SUBSCRIPTION_STATE':
			// Leader broadcasting current subscription state to followers
			// (followers can use this to verify sync)
			break;
	}
}

function handleBeforeUnload(): void {
	if (role === 'leader') {
		broadcast({ type: 'RESIGN', tabId });
	} else {
		broadcast({ type: 'TAB_CLOSING', tabId });
	}
}

// ============================================================================
// Subscription Aggregation (Leader Only)
// ============================================================================

function handleFollowerSubscribe(followerTabId: string, channels: Channel[]): void {
	if (!tabSubscriptions.has(followerTabId)) {
		tabSubscriptions.set(followerTabId, new Set());
	}
	const tabChans = tabSubscriptions.get(followerTabId)!;
	channels.forEach(ch => tabChans.add(ch));
	recomputeSubscriptions();
}

function handleFollowerUnsubscribe(followerTabId: string, channels: Channel[]): void {
	const tabChans = tabSubscriptions.get(followerTabId);
	if (tabChans) {
		channels.forEach(ch => tabChans.delete(ch));
		if (tabChans.size === 0) {
			tabSubscriptions.delete(followerTabId);
		}
	}
	recomputeSubscriptions();
}

/** Currently subscribed channels on the WS */
let currentWsChannels = new Set<Channel>();

function recomputeSubscriptions(): void {
	// Build union of all tabs' desired channels
	const desired = new Set<Channel>();

	// Leader's own channels
	localChannels.forEach(ch => desired.add(ch));

	// Follower tabs' channels
	for (const channels of tabSubscriptions.values()) {
		channels.forEach(ch => desired.add(ch));
	}

	// Compute diff
	const toSubscribe = [...desired].filter(ch => !currentWsChannels.has(ch));
	const toUnsubscribe = [...currentWsChannels].filter(ch => !desired.has(ch));

	if (toSubscribe.length > 0) {
		wsSubscribe?.(toSubscribe);
		toSubscribe.forEach(ch => currentWsChannels.add(ch));
	}

	if (toUnsubscribe.length > 0) {
		wsUnsubscribe?.(toUnsubscribe);
		toUnsubscribe.forEach(ch => currentWsChannels.delete(ch));
	}

	if (toSubscribe.length > 0 || toUnsubscribe.length > 0) {
		console.log(`[LeaderElection] Subscriptions updated: [${[...currentWsChannels].join(', ')}]`);
		// Notify followers of current subscription state
		broadcast({ type: 'SUBSCRIPTION_STATE', channels: [...currentWsChannels] });
		// Notify local subscription change handlers
		subscriptionChangeHandlers.forEach(h => h([...currentWsChannels]));
	}
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Register WS control callbacks. Called by websocket.svelte.ts.
 * Leader election uses these to control the actual WS connection.
 */
export function setWsCallbacks(callbacks: {
	connect: () => void;
	disconnect: () => void;
	subscribe: (channels: Channel[]) => void;
	unsubscribe: (channels: Channel[]) => void;
}): void {
	wsConnect = callbacks.connect;
	wsDisconnect = callbacks.disconnect;
	wsSubscribe = callbacks.subscribe;
	wsUnsubscribe = callbacks.unsubscribe;
}

/**
 * Relay a WebSocket message to follower tabs.
 * Called by websocket.svelte.ts when the leader receives a WS message.
 */
export function relayToFollowers(message: WebSocketMessage): void {
	if (role !== 'leader') return;
	broadcast({ type: 'WS_MESSAGE', message });
}

/**
 * Register a handler for relayed WebSocket messages.
 * Handlers fire for BOTH leader (direct WS) and follower (relayed) messages.
 * Returns an unsubscribe function.
 */
export function onRelayedMessage(handler: MessageHandler): () => void {
	messageHandlers.add(handler);
	return () => messageHandlers.delete(handler);
}

/**
 * Register a handler for role changes (leader ↔ follower).
 * Returns an unsubscribe function.
 */
export function onRoleChange(handler: RoleChangeHandler): () => void {
	roleChangeHandlers.add(handler);
	return () => roleChangeHandlers.delete(handler);
}

/**
 * Register a handler for subscription changes.
 * Returns an unsubscribe function.
 */
export function onSubscriptionChange(handler: SubscriptionChangeHandler): () => void {
	subscriptionChangeHandlers.add(handler);
	return () => subscriptionChangeHandlers.delete(handler);
}

/**
 * Request channel subscriptions for THIS tab.
 * If leader: subscribes directly on WS (after aggregation).
 * If follower: sends request to leader via BroadcastChannel.
 */
export function requestSubscribe(channels: Channel[]): void {
	channels.forEach(ch => localChannels.add(ch));

	if (role === 'leader') {
		recomputeSubscriptions();
	} else if (role === 'follower') {
		broadcast({ type: 'SUBSCRIBE', tabId, channels });
	}
	// If undecided, channels are stored in localChannels and will be
	// sent when role is determined
}

/**
 * Remove channel subscriptions for THIS tab.
 * If leader: unsubscribes on WS (after aggregation).
 * If follower: sends request to leader via BroadcastChannel.
 */
export function requestUnsubscribe(channels: Channel[]): void {
	channels.forEach(ch => localChannels.delete(ch));

	if (role === 'leader') {
		recomputeSubscriptions();
	} else if (role === 'follower') {
		broadcast({ type: 'UNSUBSCRIBE', tabId, channels });
	}
}

/**
 * Get the current role of this tab.
 */
export function getRole(): Role {
	return role;
}

/**
 * Check if this tab is the leader.
 */
export function isLeader(): boolean {
	return role === 'leader';
}

/**
 * Get this tab's unique ID.
 */
export function getTabId(): string {
	return tabId;
}

// ============================================================================
// Internal Helpers
// ============================================================================

function broadcast(msg: LeaderMessage): void {
	try {
		bc?.postMessage(msg);
	} catch {
		// BroadcastChannel may be closed
	}
}

function dispatchToHandlers(message: WebSocketMessage): void {
	messageHandlers.forEach(handler => {
		try {
			handler(message);
		} catch (error) {
			console.error('[LeaderElection] Handler error:', error);
		}
	});
}

function notifyRoleChange(previousRole: Role): void {
	roleChangeHandlers.forEach(handler => {
		try {
			handler(role, previousRole);
		} catch (error) {
			console.error('[LeaderElection] Role change handler error:', error);
		}
	});
}

function clearTimers(): void {
	if (claimTimeout) {
		clearTimeout(claimTimeout);
		claimTimeout = null;
	}
	stopHeartbeat();
	if (heartbeatWatchdog) {
		clearTimeout(heartbeatWatchdog);
		heartbeatWatchdog = null;
	}
}
