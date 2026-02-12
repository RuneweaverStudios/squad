/**
 * Workflow Node Type Registry
 *
 * Central registry of all workflow node types with metadata, icons,
 * colors, descriptions, and default configurations. Used by the
 * canvas renderer, node palette, and configuration panels.
 *
 * @see ide/src/lib/types/workflow.ts for TypeScript type definitions
 * @see ide/src/lib/utils/workflows.server.ts for CRUD operations
 */

import type { NodeType, NodeCategory, NodeConfig } from '$lib/types/workflow';

// =============================================================================
// NODE METADATA
// =============================================================================

export interface NodeTypeMeta {
	/** Node type identifier */
	type: NodeType;
	/** Display label */
	label: string;
	/** Short description */
	description: string;
	/** Category for palette grouping */
	category: NodeCategory;
	/** SVG icon path (24x24 viewBox) */
	icon: string;
	/** Accent color (oklch) for node border/header */
	color: string;
	/** Background tint (oklch with alpha) */
	bgColor: string;
	/** Port color for this node's category */
	portColor: string;
	/** Help text shown in config panel */
	helpText: string;
	/** Default config values */
	defaultConfig: Record<string, unknown>;
}

// =============================================================================
// CATEGORY METADATA
// =============================================================================

export interface CategoryMeta {
	label: string;
	description: string;
	color: string;
	icon: string;
}

export const CATEGORY_META: Record<NodeCategory, CategoryMeta> = {
	trigger: {
		label: 'Triggers',
		description: 'Start a workflow on schedule, event, or manually',
		color: 'oklch(0.72 0.17 145)',
		icon: 'M13 10V3L4 14h7v7l9-11h-7z'
	},
	llm: {
		label: 'LLM',
		description: 'Run prompts through language models',
		color: 'oklch(0.72 0.15 280)',
		icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z'
	},
	action: {
		label: 'Actions',
		description: 'Execute tasks, commands, and operations',
		color: 'oklch(0.72 0.17 220)',
		icon: 'M20.24 12.24a6 6 0 00-8.49-8.49L5 10.5V19h8.5l6.74-6.76zM16 8l-4 4'
	},
	logic: {
		label: 'Logic',
		description: 'Branch and transform data flow',
		color: 'oklch(0.72 0.15 55)',
		icon: 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5'
	}
};

// =============================================================================
// SVG ICON PATHS (24x24 viewBox)
// =============================================================================

const ICONS = {
	clock: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z',
	bolt: 'M13 10V3L4 14h7v7l9-11h-7z',
	event: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z',
	play: 'M8 5v14l11-7L8 5z',
	brain: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
	task: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM17.99 9l-1.41-1.42-6.59 6.59-2.58-2.57-1.42 1.41 4 3.99 8-8z',
	mail: 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
	terminal: 'M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zM7.5 16.5L6 15l3-3-3-3 1.5-1.5L12 12 7.5 16.5zM18 17h-5v-2h5v2z',
	agent: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
	browser: 'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8h16v10zM5 5.5c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm3 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z',
	condition: 'M12 2L2 12l10 10 10-10L12 2zm0 3.41L19.59 12 12 19.59 4.41 12 12 5.41z',
	transform: 'M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z'
};

// =============================================================================
// NODE TYPE DEFINITIONS
// =============================================================================

export const NODE_TYPE_META: Record<NodeType, NodeTypeMeta> = {
	// ── TRIGGERS ──────────────────────────────────────────────────────────────

	trigger_cron: {
		type: 'trigger_cron',
		label: 'Cron Trigger',
		description: 'Fires on a schedule using cron expressions',
		category: 'trigger',
		icon: ICONS.clock,
		color: 'oklch(0.72 0.17 145)',
		bgColor: 'oklch(0.72 0.17 145 / 0.08)',
		portColor: 'oklch(0.72 0.17 145)',
		helpText: 'Runs the workflow on a recurring schedule. Uses standard 5-field cron expressions (minute hour day-of-month month day-of-week).',
		defaultConfig: { cronExpr: '0 9 * * *' }
	},

	trigger_event: {
		type: 'trigger_event',
		label: 'Event Trigger',
		description: 'Fires when a JAT event occurs',
		category: 'trigger',
		icon: ICONS.event,
		color: 'oklch(0.72 0.17 145)',
		bgColor: 'oklch(0.72 0.17 145 / 0.08)',
		portColor: 'oklch(0.72 0.17 145)',
		helpText: 'Triggers the workflow when a specific system event occurs, such as task completion or agent idle.',
		defaultConfig: { eventType: 'task_completed' }
	},

	trigger_manual: {
		type: 'trigger_manual',
		label: 'Manual Trigger',
		description: 'Triggered by clicking the Run button',
		category: 'trigger',
		icon: ICONS.play,
		color: 'oklch(0.72 0.17 145)',
		bgColor: 'oklch(0.72 0.17 145 / 0.08)',
		portColor: 'oklch(0.72 0.17 145)',
		helpText: 'No configuration needed. Run the workflow manually from the toolbar.',
		defaultConfig: {}
	},

	// ── LLM ──────────────────────────────────────────────────────────────────

	llm_prompt: {
		type: 'llm_prompt',
		label: 'LLM Prompt',
		description: 'Run a prompt through a language model',
		category: 'llm',
		icon: ICONS.brain,
		color: 'oklch(0.72 0.15 280)',
		bgColor: 'oklch(0.72 0.15 280 / 0.08)',
		portColor: 'oklch(0.72 0.15 280)',
		helpText: 'Sends a prompt to Claude and returns the response. Use {{input}} to reference data from the previous node.',
		defaultConfig: { prompt: '', model: 'sonnet' }
	},

	// ── ACTIONS ───────────────────────────────────────────────────────────────

	action_create_task: {
		type: 'action_create_task',
		label: 'Create Task',
		description: 'Create a new task in JAT',
		category: 'action',
		icon: ICONS.task,
		color: 'oklch(0.72 0.17 220)',
		bgColor: 'oklch(0.72 0.17 220 / 0.08)',
		portColor: 'oklch(0.72 0.17 220)',
		helpText: 'Creates a task in the project task database. Fields support {{input}} and {{result}} template variables.',
		defaultConfig: { title: '' }
	},

	action_send_message: {
		type: 'action_send_message',
		label: 'Send Message',
		description: 'Send a message to an agent or notification',
		category: 'action',
		icon: ICONS.mail,
		color: 'oklch(0.72 0.17 220)',
		bgColor: 'oklch(0.72 0.17 220 / 0.08)',
		portColor: 'oklch(0.72 0.17 220)',
		helpText: 'Sends a message to a specific agent or broadcasts a notification. Message body supports {{variables}}.',
		defaultConfig: { recipient: '', message: '' }
	},

	action_run_bash: {
		type: 'action_run_bash',
		label: 'Run Command',
		description: 'Execute a bash command',
		category: 'action',
		icon: ICONS.terminal,
		color: 'oklch(0.72 0.17 220)',
		bgColor: 'oklch(0.72 0.17 220 / 0.08)',
		portColor: 'oklch(0.72 0.17 220)',
		helpText: 'Runs a bash command and captures stdout. Use {{input}} to reference data from the previous node. Set a timeout to prevent runaway processes.',
		defaultConfig: { command: '', timeout: 60 }
	},

	action_spawn_agent: {
		type: 'action_spawn_agent',
		label: 'Spawn Agent',
		description: 'Launch a new agent session',
		category: 'action',
		icon: ICONS.agent,
		color: 'oklch(0.72 0.17 220)',
		bgColor: 'oklch(0.72 0.17 220 / 0.08)',
		portColor: 'oklch(0.72 0.17 220)',
		helpText: 'Spawns a new agent session for an existing task or creates a new task. The agent works independently.',
		defaultConfig: { taskTitle: '', model: 'sonnet' }
	},

	action_browser: {
		type: 'action_browser',
		label: 'Browser Action',
		description: 'Automate browser interactions',
		category: 'action',
		icon: ICONS.browser,
		color: 'oklch(0.72 0.17 220)',
		bgColor: 'oklch(0.72 0.17 220 / 0.08)',
		portColor: 'oklch(0.72 0.17 220)',
		helpText: 'Performs browser automation via CDP. Navigate to URLs, take screenshots, evaluate JavaScript, click elements, or wait for conditions.',
		defaultConfig: { action: 'navigate', url: '' }
	},

	// ── LOGIC ─────────────────────────────────────────────────────────────────

	condition: {
		type: 'condition',
		label: 'Condition',
		description: 'Branch based on an expression',
		category: 'logic',
		icon: ICONS.condition,
		color: 'oklch(0.72 0.15 55)',
		bgColor: 'oklch(0.72 0.15 55 / 0.08)',
		portColor: 'oklch(0.72 0.15 55)',
		helpText: 'Evaluates a JavaScript expression against the input data. Routes to the True or False output port based on the result.',
		defaultConfig: { expression: '' }
	},

	transform: {
		type: 'transform',
		label: 'Transform',
		description: 'Map, filter, or reshape data',
		category: 'logic',
		icon: ICONS.transform,
		color: 'oklch(0.72 0.15 55)',
		bgColor: 'oklch(0.72 0.15 55 / 0.08)',
		portColor: 'oklch(0.72 0.15 55)',
		helpText: 'Transforms input data using a JavaScript function body. Receives `input` variable and must return the transformed value.',
		defaultConfig: { functionBody: 'return input' }
	}
};

// =============================================================================
// HELPERS
// =============================================================================

/** Get metadata for a node type */
export function getNodeMeta(type: NodeType): NodeTypeMeta {
	return NODE_TYPE_META[type];
}

/** Get all node types in a category */
export function getNodesByCategory(category: NodeCategory): NodeTypeMeta[] {
	return Object.values(NODE_TYPE_META).filter((n) => n.category === category);
}

/** Get all categories with their nodes */
export function getCategorizedNodes(): { category: CategoryMeta; nodes: NodeTypeMeta[] }[] {
	const categories: NodeCategory[] = ['trigger', 'llm', 'action', 'logic'];
	return categories.map((cat) => ({
		category: CATEGORY_META[cat],
		nodes: getNodesByCategory(cat)
	}));
}

/** Cron preset expressions */
export const CRON_PRESETS: { label: string; expr: string }[] = [
	{ label: 'Every minute', expr: '* * * * *' },
	{ label: 'Every 5 minutes', expr: '*/5 * * * *' },
	{ label: 'Every 15 minutes', expr: '*/15 * * * *' },
	{ label: 'Every 30 minutes', expr: '*/30 * * * *' },
	{ label: 'Every hour', expr: '0 * * * *' },
	{ label: 'Daily at 9 AM', expr: '0 9 * * *' },
	{ label: 'Daily at midnight', expr: '0 0 * * *' },
	{ label: 'Weekdays at 9 AM', expr: '0 9 * * 1-5' },
	{ label: 'Weekly on Sunday', expr: '0 0 * * 0' },
	{ label: 'Monthly on the 1st', expr: '0 0 1 * *' }
];

/** Event types for the event trigger */
export const EVENT_TYPES: { value: string; label: string; description: string }[] = [
	{ value: 'task_completed', label: 'Task Completed', description: 'Fires when any task is closed' },
	{ value: 'task_created', label: 'Task Created', description: 'Fires when a new task is created' },
	{ value: 'agent_idle', label: 'Agent Idle', description: 'Fires when an agent has no active task' },
	{ value: 'signal_received', label: 'Signal Received', description: 'Fires on a specific JAT signal' }
];

/** Browser action types */
export const BROWSER_ACTIONS: { value: string; label: string; description: string }[] = [
	{ value: 'navigate', label: 'Navigate', description: 'Go to a URL' },
	{ value: 'screenshot', label: 'Screenshot', description: 'Capture the page' },
	{ value: 'eval', label: 'Evaluate JS', description: 'Run JavaScript code' },
	{ value: 'click', label: 'Click', description: 'Click an element by selector' },
	{ value: 'wait', label: 'Wait', description: 'Wait for a condition' }
];

/** Model options for LLM and agent nodes */
export const MODEL_OPTIONS: { value: string; label: string; description: string }[] = [
	{ value: 'haiku', label: 'Haiku', description: 'Fast, low cost' },
	{ value: 'sonnet', label: 'Sonnet', description: 'Balanced speed and quality' },
	{ value: 'opus', label: 'Opus', description: 'Most capable' }
];

/** Task type options */
export const TASK_TYPES: { value: string; label: string }[] = [
	{ value: 'task', label: 'Task' },
	{ value: 'bug', label: 'Bug' },
	{ value: 'feature', label: 'Feature' },
	{ value: 'chore', label: 'Chore' }
];

/** Priority options */
export const PRIORITY_OPTIONS: { value: number; label: string }[] = [
	{ value: 0, label: 'P0 - Critical' },
	{ value: 1, label: 'P1 - High' },
	{ value: 2, label: 'P2 - Medium' },
	{ value: 3, label: 'P3 - Low' },
	{ value: 4, label: 'P4 - Lowest' }
];
