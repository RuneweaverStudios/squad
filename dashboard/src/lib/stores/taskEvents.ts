/**
 * Task event broadcasting for cross-component communication
 * Allows components to react to task creation, updates, etc.
 */

import { writable } from 'svelte/store';

export type TaskEventType = 'task-created' | 'task-updated' | 'task-released';

export interface TaskEvent {
	type: TaskEventType;
	taskId: string;
	timestamp: number;
}

// Store for reactive updates - components can subscribe to this
export const lastTaskEvent = writable<TaskEvent | null>(null);

/**
 * Broadcast a task event to all listening components
 */
export function broadcastTaskEvent(type: TaskEventType, taskId: string) {
	const event: TaskEvent = {
		type,
		taskId,
		timestamp: Date.now()
	};

	lastTaskEvent.set(event);
}
