/**
 * Message Queue with Retry Logic
 *
 * Provides reliable message delivery for WebSocket broadcasts with:
 * - Per-client message queues for failed deliveries
 * - Exponential backoff retry logic
 * - Dead letter handling for messages that exceed max retries
 * - Priority queues for critical messages
 *
 * Architecture:
 * - Messages that fail to send are queued per-client
 * - A retry processor runs periodically to redeliver queued messages
 * - Messages are removed after successful delivery or max retries
 * - Dead letter callback allows custom handling of failed messages
 *
 * Usage:
 *   import { enqueue, processRetries, getQueueStats } from './messageQueue';
 *
 *   // Queue a message for retry
 *   enqueue(ws, message, { priority: 'high' });
 *
 *   // Process retries (called by connection pool)
 *   processRetries();
 */

import { WebSocket } from 'ws';
import type { Channel, ChannelMessages } from './connectionPool.js';

// ============================================================================
// Types
// ============================================================================

/** Message priority levels */
export type MessagePriority = 'low' | 'normal' | 'high' | 'critical';

/** Queued message with retry metadata */
export interface QueuedMessage<C extends Channel = Channel> {
	id: string;
	channel: C;
	payload: ChannelMessages[C];
	priority: MessagePriority;
	createdAt: Date;
	lastAttemptAt: Date | null;
	attemptCount: number;
	nextRetryAt: Date;
	error?: string;
}

/** Queue options for enqueuing a message */
export interface EnqueueOptions {
	priority?: MessagePriority;
	maxRetries?: number;
}

/** Queue statistics */
export interface QueueStats {
	totalQueued: number;
	byPriority: Record<MessagePriority, number>;
	byChannel: Record<Channel, number>;
	oldestMessage: Date | null;
	totalRetries: number;
	totalDeadLettered: number;
}

/** Dead letter callback function */
type DeadLetterCallback = (clientId: string, message: QueuedMessage) => void;

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1000; // 1 second
const MAX_RETRY_DELAY_MS = 30000; // 30 seconds
const RETRY_PROCESS_INTERVAL_MS = 1000; // Check for retries every second
const MAX_QUEUE_SIZE_PER_CLIENT = 100; // Prevent memory bloat

// Priority weights for sorting (higher = process first)
const PRIORITY_WEIGHTS: Record<MessagePriority, number> = {
	critical: 4,
	high: 3,
	normal: 2,
	low: 1
};

// ============================================================================
// State
// ============================================================================

/** Per-client message queues */
const clientQueues = new Map<WebSocket, QueuedMessage[]>();

/** Client ID mapping (for dead letter callbacks) */
const clientIds = new Map<WebSocket, string>();

/** Dead letter callback */
let deadLetterCallback: DeadLetterCallback | null = null;

/** Max retries per priority */
const maxRetriesByPriority: Record<MessagePriority, number> = {
	critical: 10,
	high: 7,
	low: 3,
	normal: DEFAULT_MAX_RETRIES
};

/** Retry processor interval handle */
let retryInterval: NodeJS.Timeout | null = null;

/** Stats counters */
let totalRetries = 0;
let totalDeadLettered = 0;

/** Message ID counter */
let messageIdCounter = 0;

// ============================================================================
// Queue Operations
// ============================================================================

/**
 * Generate unique message ID
 */
function generateMessageId(): string {
	return `msg-${Date.now()}-${++messageIdCounter}`;
}

/**
 * Calculate next retry time using exponential backoff with jitter
 */
function calculateNextRetryTime(attemptCount: number): Date {
	const exponentialDelay = Math.min(
		BASE_RETRY_DELAY_MS * Math.pow(2, attemptCount),
		MAX_RETRY_DELAY_MS
	);
	// Add jitter (0-25% of delay)
	const jitter = Math.random() * exponentialDelay * 0.25;
	return new Date(Date.now() + exponentialDelay + jitter);
}

/**
 * Enqueue a message for retry delivery
 */
export function enqueue<C extends Channel>(
	ws: WebSocket,
	channel: C,
	payload: ChannelMessages[C],
	options: EnqueueOptions = {}
): QueuedMessage<C> {
	const { priority = 'normal' } = options;

	// Get or create client queue
	let queue = clientQueues.get(ws);
	if (!queue) {
		queue = [];
		clientQueues.set(ws, queue);
	}

	// Enforce queue size limit (drop oldest low-priority messages)
	if (queue.length >= MAX_QUEUE_SIZE_PER_CLIENT) {
		// Sort by priority (low first) then by age (oldest first)
		queue.sort((a, b) => {
			const priorityDiff = PRIORITY_WEIGHTS[a.priority] - PRIORITY_WEIGHTS[b.priority];
			if (priorityDiff !== 0) return priorityDiff;
			return a.createdAt.getTime() - b.createdAt.getTime();
		});

		// Remove oldest low-priority message
		const dropped = queue.shift();
		if (dropped) {
			handleDeadLetter(ws, dropped, 'Queue size limit exceeded');
		}
	}

	const message: QueuedMessage<C> = {
		id: generateMessageId(),
		channel,
		payload,
		priority,
		createdAt: new Date(),
		lastAttemptAt: null,
		attemptCount: 0,
		nextRetryAt: calculateNextRetryTime(0)
	};

	queue.push(message);
	return message;
}

/**
 * Remove a message from the queue (on successful delivery)
 */
export function dequeue(ws: WebSocket, messageId: string): boolean {
	const queue = clientQueues.get(ws);
	if (!queue) return false;

	const index = queue.findIndex((m) => m.id === messageId);
	if (index === -1) return false;

	queue.splice(index, 1);

	// Clean up empty queues
	if (queue.length === 0) {
		clientQueues.delete(ws);
	}

	return true;
}

/**
 * Handle dead letter (message that exceeded max retries)
 */
function handleDeadLetter(ws: WebSocket, message: QueuedMessage, reason: string): void {
	totalDeadLettered++;
	message.error = reason;

	const clientId = clientIds.get(ws) || 'unknown';
	console.warn(`[MessageQueue] Dead letter: ${message.id} for ${clientId} - ${reason}`);

	if (deadLetterCallback) {
		try {
			deadLetterCallback(clientId, message);
		} catch (error) {
			console.error('[MessageQueue] Dead letter callback error:', error);
		}
	}
}

// ============================================================================
// Retry Processing
// ============================================================================

/**
 * Process retry queue for a single client
 * Returns number of messages successfully sent
 */
function processClientRetries(ws: WebSocket): number {
	const queue = clientQueues.get(ws);
	if (!queue || queue.length === 0) return 0;

	const now = new Date();
	let successCount = 0;
	const toRemove: string[] = [];

	// Sort by priority (highest first) then by next retry time
	queue.sort((a, b) => {
		const priorityDiff = PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority];
		if (priorityDiff !== 0) return priorityDiff;
		return a.nextRetryAt.getTime() - b.nextRetryAt.getTime();
	});

	for (const message of queue) {
		// Skip if not ready for retry
		if (message.nextRetryAt > now) continue;

		// Check if client is ready
		if (ws.readyState !== WebSocket.OPEN) {
			// Reschedule for later
			message.nextRetryAt = calculateNextRetryTime(message.attemptCount);
			continue;
		}

		// Attempt delivery
		message.attemptCount++;
		message.lastAttemptAt = now;
		totalRetries++;

		try {
			const payload = JSON.stringify({
				channel: message.channel,
				timestamp: Date.now(),
				_retryAttempt: message.attemptCount,
				...message.payload
			});

			ws.send(payload);
			successCount++;
			toRemove.push(message.id);
		} catch (error) {
			const maxRetries = maxRetriesByPriority[message.priority];

			if (message.attemptCount >= maxRetries) {
				handleDeadLetter(ws, message, `Max retries (${maxRetries}) exceeded`);
				toRemove.push(message.id);
			} else {
				// Schedule next retry
				message.nextRetryAt = calculateNextRetryTime(message.attemptCount);
				message.error = error instanceof Error ? error.message : 'Send failed';
			}
		}
	}

	// Remove processed messages
	for (const id of toRemove) {
		dequeue(ws, id);
	}

	return successCount;
}

/**
 * Process all client retry queues
 * Called periodically by the retry processor
 */
export function processRetries(): { processed: number; succeeded: number } {
	let processed = 0;
	let succeeded = 0;

	const clients = Array.from(clientQueues.entries());
	for (const [ws, queue] of clients) {
		// Skip closed connections
		if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
			// Move all messages to dead letter
			for (const message of queue) {
				handleDeadLetter(ws, message, 'Client disconnected');
			}
			clientQueues.delete(ws);
			clientIds.delete(ws);
			continue;
		}

		if (queue) {
			processed += queue.length;
			succeeded += processClientRetries(ws);
		}
	}

	return { processed, succeeded };
}

// ============================================================================
// Lifecycle Management
// ============================================================================

/**
 * Start the retry processor
 * Should be called when WebSocket server starts
 */
export function startRetryProcessor(): void {
	if (retryInterval) {
		console.log('[MessageQueue] Retry processor already running');
		return;
	}

	console.log('[MessageQueue] Starting retry processor');
	retryInterval = setInterval(() => {
		const { processed, succeeded } = processRetries();
		if (processed > 0) {
			console.log(`[MessageQueue] Processed ${processed} queued messages, ${succeeded} succeeded`);
		}
	}, RETRY_PROCESS_INTERVAL_MS);
}

/**
 * Stop the retry processor
 * Should be called when WebSocket server shuts down
 */
export function stopRetryProcessor(): void {
	if (retryInterval) {
		clearInterval(retryInterval);
		retryInterval = null;
		console.log('[MessageQueue] Retry processor stopped');
	}
}

/**
 * Register a client with an ID (for dead letter tracking)
 */
export function registerClient(ws: WebSocket, clientId: string): void {
	clientIds.set(ws, clientId);
}

/**
 * Unregister a client (cleanup on disconnect)
 */
export function unregisterClient(ws: WebSocket): void {
	// Dead letter any remaining messages
	const queue = clientQueues.get(ws);
	if (queue) {
		for (const message of queue) {
			handleDeadLetter(ws, message, 'Client unregistered');
		}
	}

	clientQueues.delete(ws);
	clientIds.delete(ws);
}

/**
 * Set the dead letter callback
 */
export function setDeadLetterCallback(callback: DeadLetterCallback | null): void {
	deadLetterCallback = callback;
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get queue statistics
 */
export function getQueueStats(): QueueStats {
	const byPriority: Record<MessagePriority, number> = {
		critical: 0,
		high: 0,
		normal: 0,
		low: 0
	};

	const byChannel: Record<Channel, number> = {
		agents: 0,
		tasks: 0,
		output: 0,
		messages: 0,
		sessions: 0,
		system: 0
	};

	let totalQueued = 0;
	let oldestMessage: Date | null = null;

	const allQueues = Array.from(clientQueues.values());
	for (const queue of allQueues) {
		for (const message of queue) {
			totalQueued++;
			byPriority[message.priority]++;
			byChannel[message.channel]++;

			if (!oldestMessage || message.createdAt < oldestMessage) {
				oldestMessage = message.createdAt;
			}
		}
	}

	return {
		totalQueued,
		byPriority,
		byChannel,
		oldestMessage,
		totalRetries,
		totalDeadLettered
	};
}

/**
 * Get queue for a specific client
 */
export function getClientQueue(ws: WebSocket): QueuedMessage[] {
	return clientQueues.get(ws) || [];
}

/**
 * Clear all queues (for testing or reset)
 */
export function clearAllQueues(): void {
	clientQueues.clear();
	clientIds.clear();
	totalRetries = 0;
	totalDeadLettered = 0;
	console.log('[MessageQueue] All queues cleared');
}
