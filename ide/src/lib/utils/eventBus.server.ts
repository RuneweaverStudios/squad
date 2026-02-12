/**
 * Event Bus (Server-side)
 *
 * Central event bus that receives events from various sources (task API,
 * scheduler, automation, file watcher, ingest), stores them in a ring buffer,
 * and dispatches matching events to workflows with trigger_event nodes.
 *
 * @see ide/src/lib/types/workflow.ts for TriggerEventConfig
 * @see ide/src/routes/api/events/+server.ts for REST endpoint
 */

import { nanoid } from 'nanoid';
import { getAllWorkflowsSync } from '$lib/utils/workflows.server';
import { executeWorkflow } from '$lib/utils/workflowEngine';
import type { TriggerEventConfig, Workflow, WorkflowNode } from '$lib/types/workflow';

// =============================================================================
// TYPES
// =============================================================================

/** All event types the bus can handle */
export type EventType =
	| 'task_created'
	| 'task_closed'
	| 'task_status_changed'
	| 'signal_received'
	| 'file_changed'
	| 'ingest_item';

/** A JAT event flowing through the bus */
export interface JatEvent {
	/** Unique event ID */
	id: string;
	/** Event type */
	type: EventType;
	/** ISO timestamp */
	timestamp: string;
	/** Origin of the event */
	source: string;
	/** Event-specific payload */
	data: Record<string, unknown>;
	/** Project context (if applicable) */
	project?: string;
}

// =============================================================================
// RING BUFFER
// =============================================================================

const MAX_EVENTS = 200;
const events: JatEvent[] = [];

// =============================================================================
// PER-WORKFLOW COOLDOWN
// =============================================================================

/** workflowId -> last fired timestamp (ms) */
const lastFired = new Map<string, number>();
const WORKFLOW_COOLDOWN_MS = 10_000; // 10 seconds

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Emit an event into the bus.
 * Stores in ring buffer and dispatches to matching workflows.
 */
export function emitEvent(
	event: Omit<JatEvent, 'id' | 'timestamp'>
): JatEvent {
	const fullEvent: JatEvent = {
		...event,
		id: nanoid(10),
		timestamp: new Date().toISOString()
	};

	// Push to ring buffer
	events.push(fullEvent);
	if (events.length > MAX_EVENTS) {
		events.splice(0, events.length - MAX_EVENTS);
	}

	// Fire-and-forget dispatch (don't block the caller)
	matchAndDispatch(fullEvent).catch((err) => {
		console.error('[eventBus] matchAndDispatch error:', err);
	});

	return fullEvent;
}

/**
 * Get recent events from the ring buffer.
 */
export function getRecentEvents(opts?: { limit?: number; type?: string }): JatEvent[] {
	let result = [...events];

	if (opts?.type) {
		result = result.filter((e) => e.type === opts.type);
	}

	// Most recent first
	result.reverse();

	if (opts?.limit && opts.limit > 0) {
		result = result.slice(0, opts.limit);
	}

	return result;
}

// =============================================================================
// WORKFLOW MATCHING & DISPATCH
// =============================================================================

/**
 * Match an event against all enabled workflows' trigger_event nodes
 * and execute matching workflows.
 */
export async function matchAndDispatch(event: JatEvent): Promise<void> {
	let workflows: Workflow[];
	try {
		workflows = getAllWorkflowsSync();
	} catch (err) {
		console.error('[eventBus] Failed to load workflows:', err);
		return;
	}

	for (const workflow of workflows) {
		if (!workflow.enabled) continue;

		// Find trigger_event nodes in this workflow
		const triggerNodes = workflow.nodes.filter(
			(n: WorkflowNode) => n.type === 'trigger_event'
		);

		for (const triggerNode of triggerNodes) {
			const config = triggerNode.config as TriggerEventConfig;
			if (!config.eventType) continue;

			// Check event type match
			if (config.eventType !== event.type) continue;

			// Check optional filter expression
			if (config.filter) {
				try {
					const filterFn = new Function('data', `return Boolean(${config.filter})`);
					if (!filterFn(event.data)) continue;
				} catch (err) {
					console.warn(
						`[eventBus] Filter expression error in workflow ${workflow.id}:`,
						err
					);
					continue;
				}
			}

			// Check cooldown
			const lastTime = lastFired.get(workflow.id);
			if (lastTime && Date.now() - lastTime < WORKFLOW_COOLDOWN_MS) {
				continue;
			}

			// Fire the workflow
			lastFired.set(workflow.id, Date.now());

			console.log(
				`[eventBus] Event ${event.type} matched workflow "${workflow.name}" (${workflow.id})`
			);

			try {
				await executeWorkflow(workflow, {
					trigger: 'event',
					eventData: event.data,
					project: event.project
				});
			} catch (err) {
				console.error(
					`[eventBus] Failed to execute workflow ${workflow.id}:`,
					err
				);
			}
		}
	}
}
