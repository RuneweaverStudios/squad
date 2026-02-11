/**
 * Task event broadcasting for cross-component communication
 * Allows components to react to task creation, updates, etc.
 *
 * Supports two modes:
 * 1. Local broadcast (broadcastTaskEvent) - for in-browser events
 * 2. WebSocket channel subscription to 'tasks' - for real-time server events (e.g., CLI task creation)
 */

import { writable } from 'svelte/store';
import { onMessage, subscribe, unsubscribe, type WebSocketMessage } from '$lib/stores/websocket.svelte';

export type TaskEventType = 'task-created' | 'task-updated' | 'task-released' | 'task-start-requested' | 'task-change' | 'session-resumed';

export interface TaskEvent {
	type: TaskEventType;
	taskId?: string;
	newTasks?: string[];
	removedTasks?: string[];
	updatedTasks?: string[];  // Tasks with status/assignee changes
	timestamp: number;
}

// Store for reactive updates - components can subscribe to this
export const lastTaskEvent = writable<TaskEvent | null>(null);

// Connection state (true when subscribed to WS 'tasks' channel)
export const taskEventsConnected = writable(false);

// Cleanup functions for WS subscriptions
let unsubTasksChannel: (() => void) | null = null;

/**
 * Handle incoming WebSocket messages on 'tasks' channel.
 * Transforms WS message format to TaskEvent format.
 *
 * WS wire format (from broadcastTaskChange):
 *   { channel: 'tasks', type: 'task-change', newTasks, removedTasks, timestamp }
 * WS wire format (from broadcastTaskUpdate):
 *   { channel: 'tasks', type: 'task-updated', taskId, data, timestamp }
 */
function handleWebSocketTaskMessage(msg: WebSocketMessage): void {
	const wsData = msg as Record<string, unknown>;

	if (wsData.type === 'task-change') {
		console.log('[TaskEvents] Task change detected:', {
			new: wsData.newTasks,
			removed: wsData.removedTasks,
			updated: wsData.updatedTasks
		});
		lastTaskEvent.set({
			type: 'task-change',
			newTasks: (wsData.newTasks as string[]) || [],
			removedTasks: (wsData.removedTasks as string[]) || [],
			updatedTasks: (wsData.updatedTasks as string[]) || [],
			timestamp: (wsData.timestamp as number) || Date.now()
		});
	} else if (wsData.type === 'task-updated') {
		lastTaskEvent.set({
			type: 'task-updated',
			taskId: wsData.taskId as string,
			updatedTasks: [wsData.taskId as string],
			timestamp: (wsData.timestamp as number) || Date.now()
		});
	}
}

/**
 * Subscribe to the 'tasks' WebSocket channel for real-time updates.
 * Call this once on app mount (in +layout.svelte).
 */
export function connectTaskEvents() {
	if (typeof window === 'undefined') return; // SSR guard
	if (unsubTasksChannel) {
		console.log('[TaskEvents] Already subscribed, skipping');
		return;
	}

	console.log('[TaskEvents] Subscribing to WS tasks channel...');

	subscribe(['tasks']);
	unsubTasksChannel = onMessage('tasks', handleWebSocketTaskMessage);

	taskEventsConnected.set(true);
}

/**
 * Unsubscribe from task events WS channel.
 * Call this on app unmount.
 */
export function disconnectTaskEvents() {
	unsubscribe(['tasks']);

	if (unsubTasksChannel) {
		unsubTasksChannel();
		unsubTasksChannel = null;
	}

	taskEventsConnected.set(false);
}

/**
 * Broadcast a task event to all listening components (local, in-browser)
 */
export function broadcastTaskEvent(type: TaskEventType, taskId: string) {
	const event: TaskEvent = {
		type,
		taskId,
		timestamp: Date.now()
	};

	lastTaskEvent.set(event);
}
