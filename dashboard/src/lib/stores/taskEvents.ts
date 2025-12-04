/**
 * Task event broadcasting for cross-component communication
 * Allows components to react to task creation, updates, etc.
 *
 * Supports two modes:
 * 1. Local broadcast (broadcastTaskEvent) - for in-browser events
 * 2. SSE connection (connectTaskEvents) - for real-time server events (e.g., CLI task creation)
 */

import { writable } from 'svelte/store';

export type TaskEventType = 'task-created' | 'task-updated' | 'task-released' | 'task-start-requested' | 'task-change';

export interface TaskEvent {
	type: TaskEventType;
	taskId?: string;
	newTasks?: string[];
	removedTasks?: string[];
	timestamp: number;
}

// Store for reactive updates - components can subscribe to this
export const lastTaskEvent = writable<TaskEvent | null>(null);

// SSE connection state
export const taskEventsConnected = writable(false);

let eventSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000;

/**
 * Connect to the task events SSE endpoint for real-time updates
 * Call this once on app mount (in +layout.svelte)
 */
export function connectTaskEvents() {
	if (typeof window === 'undefined') return; // SSR guard
	if (eventSource) {
		console.log('[TaskEvents] Already connected, skipping');
		return;
	}

	console.log('[TaskEvents] Connecting to SSE...');

	try {
		eventSource = new EventSource('/api/tasks/events');

		eventSource.onopen = () => {
			console.log('[TaskEvents] SSE connected!');
			taskEventsConnected.set(true);
			reconnectAttempts = 0;
		};

		eventSource.onmessage = (event) => {
			console.log('[TaskEvents] Received event:', event.data);
			try {
				const data = JSON.parse(event.data);

				// Convert SSE event to TaskEvent format
				if (data.type === 'task-change') {
					console.log('[TaskEvents] Task change detected:', data.newTasks, data.removedTasks);
					lastTaskEvent.set({
						type: 'task-change',
						newTasks: data.newTasks || [],
						removedTasks: data.removedTasks || [],
						timestamp: data.timestamp || Date.now()
					});
				}
			} catch (err) {
				console.error('[TaskEvents] Failed to parse task event:', err);
			}
		};

		eventSource.onerror = (err) => {
			console.error('[TaskEvents] SSE error:', err);
			taskEventsConnected.set(false);

			// Close and attempt reconnect
			if (eventSource) {
				eventSource.close();
				eventSource = null;
			}

			if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
				reconnectAttempts++;
				console.log(`[TaskEvents] Reconnecting (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
				reconnectTimer = setTimeout(() => {
					connectTaskEvents();
				}, RECONNECT_DELAY);
			} else {
				console.error('[TaskEvents] Max reconnect attempts reached');
			}
		};
	} catch (err) {
		console.error('[TaskEvents] Failed to connect to task events:', err);
	}
}

/**
 * Disconnect from task events SSE
 * Call this on app unmount
 */
export function disconnectTaskEvents() {
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}

	if (eventSource) {
		eventSource.close();
		eventSource = null;
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
