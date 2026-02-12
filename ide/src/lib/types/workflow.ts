/**
 * Workflow Types
 *
 * Type definitions for the visual workflow builder system.
 * Workflows are n8n-style automation pipelines with nodes, edges,
 * and execution state. Stored as JSON files in ~/.config/jat/workflows/.
 *
 * @see ide/src/lib/utils/workflows.server.ts for CRUD operations
 * @see ide/src/routes/api/workflows/ for API endpoints
 */

// =============================================================================
// NODE TYPES
// =============================================================================

/**
 * All available node types in the workflow builder
 */
export type NodeType =
	// Triggers
	| 'trigger_cron'
	| 'trigger_event'
	| 'trigger_manual'
	// LLM
	| 'llm_prompt'
	// Actions
	| 'action_create_task'
	| 'action_send_message'
	| 'action_run_bash'
	| 'action_spawn_agent'
	| 'action_browser'
	// Logic
	| 'condition'
	| 'transform';

/**
 * Node type categories for palette grouping
 */
export type NodeCategory = 'trigger' | 'llm' | 'action' | 'logic';

/**
 * Mapping of node types to their categories
 */
export const NODE_CATEGORIES: Record<NodeType, NodeCategory> = {
	trigger_cron: 'trigger',
	trigger_event: 'trigger',
	trigger_manual: 'trigger',
	llm_prompt: 'llm',
	action_create_task: 'action',
	action_send_message: 'action',
	action_run_bash: 'action',
	action_spawn_agent: 'action',
	action_browser: 'action',
	condition: 'logic',
	transform: 'logic'
};

// =============================================================================
// NODE CONFIG SCHEMAS (per node type)
// =============================================================================

/** Cron trigger: fires on a schedule */
export interface TriggerCronConfig {
	/** Cron expression (5-field: minute hour dom month dow) */
	cronExpr: string;
	/** IANA timezone (e.g., "America/New_York"). Defaults to system timezone. */
	timezone?: string;
}

/** Event trigger: fires on a JAT event */
export interface TriggerEventConfig {
	/** Event type to listen for */
	eventType:
		| 'task_created'
		| 'task_closed'
		| 'task_status_changed'
		| 'signal_received'
		| 'file_changed'
		| 'ingest_item';
	/** Optional JS filter expression evaluated against event.data (e.g., "data.priority <= 1") */
	filter?: string;
}

/** Manual trigger: no config needed, fires from Run button */
export interface TriggerManualConfig {
	/** Optional description for the trigger */
	description?: string;
}

/** LLM prompt node: runs a prompt through an LLM */
export interface LlmPromptConfig {
	/** The prompt template. Supports {{input}} for data from previous node. */
	prompt: string;
	/** Model to use */
	model: 'haiku' | 'sonnet' | 'opus';
	/** Template variables (name→default pairs) */
	variables?: Record<string, string>;
	/** Max tokens for response */
	maxTokens?: number;
	/** Project context for the prompt */
	project?: string;
}

/** Create task action */
export interface ActionCreateTaskConfig {
	/** Task title. Supports {{input}} and {{result}} variables. */
	title: string;
	/** Task description */
	description?: string;
	/** Task type */
	type?: 'task' | 'bug' | 'feature' | 'chore';
	/** Priority (0=critical, 4=lowest) */
	priority?: number;
	/** Comma-separated labels */
	labels?: string;
	/** Target project */
	project?: string;
}

/** Send message action */
export interface ActionSendMessageConfig {
	/** Recipient: agent name or "notification" */
	recipient: string;
	/** Message body. Supports {{input}} and {{result}} variables. */
	message: string;
}

/** Run bash command action */
export interface ActionRunBashConfig {
	/** Command to execute. Supports {{input}} variable. */
	command: string;
	/** Working directory */
	cwd?: string;
	/** Timeout in seconds (default: 60) */
	timeout?: number;
}

/** Spawn agent action */
export interface ActionSpawnAgentConfig {
	/** Existing task ID to assign, OR create new task with title */
	taskId?: string;
	/** Title for new task (used if taskId not set) */
	taskTitle?: string;
	/** Task description (used if taskId not set) */
	taskDescription?: string;
	/** Model override */
	model?: 'haiku' | 'sonnet' | 'opus';
	/** Target project */
	project?: string;
}

/** Browser automation action */
export interface ActionBrowserConfig {
	/** URL to navigate to */
	url?: string;
	/** Action to perform */
	action: 'navigate' | 'screenshot' | 'eval' | 'click' | 'wait';
	/** CSS selector (for click/wait) */
	selector?: string;
	/** JavaScript code (for eval) */
	jsCode?: string;
	/** Wait timeout in ms */
	timeout?: number;
}

/** Condition node: routes to true/false branch */
export interface ConditionConfig {
	/** JavaScript expression. Evaluates against `input` variable.
	 *  e.g., "input.includes('FAIL')" or "input.length > 100" */
	expression: string;
}

/** Transform node: maps/filters/transforms data */
export interface TransformConfig {
	/** JavaScript function body. Receives `input`, must return transformed value.
	 *  e.g., "return input.split('\\n').filter(l => l.includes('error'))" */
	functionBody: string;
}

/**
 * Union of all node config types
 */
export type NodeConfig =
	| TriggerCronConfig
	| TriggerEventConfig
	| TriggerManualConfig
	| LlmPromptConfig
	| ActionCreateTaskConfig
	| ActionSendMessageConfig
	| ActionRunBashConfig
	| ActionSpawnAgentConfig
	| ActionBrowserConfig
	| ConditionConfig
	| TransformConfig;

/**
 * Map node types to their config interfaces
 */
export interface NodeConfigMap {
	trigger_cron: TriggerCronConfig;
	trigger_event: TriggerEventConfig;
	trigger_manual: TriggerManualConfig;
	llm_prompt: LlmPromptConfig;
	action_create_task: ActionCreateTaskConfig;
	action_send_message: ActionSendMessageConfig;
	action_run_bash: ActionRunBashConfig;
	action_spawn_agent: ActionSpawnAgentConfig;
	action_browser: ActionBrowserConfig;
	condition: ConditionConfig;
	transform: TransformConfig;
}

// =============================================================================
// PORT TYPES
// =============================================================================

/** Port type determines what kind of data flows through the connection */
export type PortType = 'data' | 'trigger' | 'condition_true' | 'condition_false';

/** Port definition on a node */
export interface Port {
	/** Unique port ID within the node */
	id: string;
	/** Port type */
	type: PortType;
	/** Human-readable label */
	label?: string;
}

// =============================================================================
// CORE ENTITIES
// =============================================================================

/** Position on the canvas */
export interface Position {
	x: number;
	y: number;
}

/**
 * A node in the workflow graph
 */
export interface WorkflowNode {
	/** Unique node ID */
	id: string;
	/** Node type determines behavior and config schema */
	type: NodeType;
	/** Position on the canvas */
	position: Position;
	/** Type-specific configuration */
	config: NodeConfig;
	/** Display label (defaults to node type name) */
	label: string;
	/** Input ports */
	inputs: Port[];
	/** Output ports */
	outputs: Port[];
}

/**
 * An edge connecting two nodes
 */
export interface WorkflowEdge {
	/** Unique edge ID */
	id: string;
	/** Source node ID */
	sourceNodeId: string;
	/** Source port ID */
	sourcePort: string;
	/** Target node ID */
	targetNodeId: string;
	/** Target port ID */
	targetPort: string;
}

/**
 * A complete workflow definition
 */
export interface Workflow {
	/** Unique workflow ID */
	id: string;
	/** Human-readable name */
	name: string;
	/** Optional description */
	description?: string;
	/** Nodes in the workflow */
	nodes: WorkflowNode[];
	/** Edges connecting nodes */
	edges: WorkflowEdge[];
	/** Whether the workflow is active (for cron triggers) */
	enabled: boolean;
	/** ISO timestamp of creation */
	createdAt: string;
	/** ISO timestamp of last modification */
	updatedAt: string;
}

// =============================================================================
// EXECUTION STATE
// =============================================================================

/** Status of a single node execution */
export type NodeExecutionStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped';

/** Result of executing a single node */
export interface NodeExecutionResult {
	/** Node ID */
	nodeId: string;
	/** Execution status */
	status: NodeExecutionStatus;
	/** Output data from the node */
	output?: unknown;
	/** Input data received by the node */
	input?: unknown;
	/** Duration in milliseconds */
	durationMs: number;
	/** Error message if status is 'error' */
	error?: string;
	/** ISO timestamp when node started */
	startedAt: string;
	/** ISO timestamp when node completed */
	completedAt?: string;
}

/** Overall run status */
export type RunStatus = 'running' | 'success' | 'partial' | 'failed';

/**
 * A single execution run of a workflow
 */
export interface WorkflowRun {
	/** Unique run ID */
	id: string;
	/** Workflow ID this run belongs to */
	workflowId: string;
	/** How the run was triggered */
	trigger: 'manual' | 'cron' | 'event';
	/** Overall run status */
	status: RunStatus;
	/** ISO timestamp when run started */
	startedAt: string;
	/** ISO timestamp when run completed */
	completedAt?: string;
	/** Total duration in milliseconds */
	durationMs?: number;
	/** Per-node execution results */
	nodeResults: Record<string, NodeExecutionResult>;
	/** Error message if the entire run failed */
	error?: string;
}

// =============================================================================
// FILE FORMAT (for JSON storage)
// =============================================================================

/**
 * Shape of a workflow JSON file on disk (~/.config/jat/workflows/{id}.json)
 */
export interface WorkflowFile {
	id: string;
	name: string;
	description?: string;
	nodes: WorkflowNode[];
	edges: WorkflowEdge[];
	enabled: boolean;
	createdAt: string;
	updatedAt: string;
}

/**
 * Shape of a workflow run JSON file on disk
 * (~/.config/jat/workflows/runs/{workflowId}/{runId}.json)
 */
export interface WorkflowRunFile {
	id: string;
	workflowId: string;
	trigger: 'manual' | 'cron' | 'event';
	status: RunStatus;
	startedAt: string;
	completedAt?: string;
	durationMs?: number;
	nodeResults: Record<string, NodeExecutionResult>;
	error?: string;
}

// =============================================================================
// VALIDATION
// =============================================================================

/** Validation error with path information */
export interface ValidationError {
	/** Dot-path to the invalid field (e.g., "nodes[0].config.cronExpr") */
	path: string;
	/** Human-readable error message */
	message: string;
}

/** Result of validating a workflow */
export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
}

// =============================================================================
// WORKFLOW SUMMARY (for list views)
// =============================================================================

/** Lightweight summary for workflow list views */
export interface WorkflowSummary {
	id: string;
	name: string;
	description?: string;
	enabled: boolean;
	nodeCount: number;
	edgeCount: number;
	/** Last run status (if any) */
	lastRunStatus?: RunStatus;
	/** Last run timestamp (if any) */
	lastRunAt?: string;
	createdAt: string;
	updatedAt: string;
}

// =============================================================================
// DEFAULT PORTS PER NODE TYPE
// =============================================================================

/**
 * Get default input/output ports for a given node type
 */
export function getDefaultPorts(type: NodeType): { inputs: Port[]; outputs: Port[] } {
	switch (type) {
		// Triggers have no inputs, output a trigger signal
		case 'trigger_cron':
		case 'trigger_event':
		case 'trigger_manual':
			return {
				inputs: [],
				outputs: [{ id: 'trigger_out', type: 'trigger', label: 'Trigger' }]
			};

		// LLM has data in, data out
		case 'llm_prompt':
			return {
				inputs: [{ id: 'data_in', type: 'data', label: 'Input' }],
				outputs: [{ id: 'data_out', type: 'data', label: 'Result' }]
			};

		// Actions have data in, data out
		case 'action_create_task':
		case 'action_send_message':
		case 'action_run_bash':
		case 'action_spawn_agent':
		case 'action_browser':
			return {
				inputs: [{ id: 'data_in', type: 'data', label: 'Input' }],
				outputs: [{ id: 'data_out', type: 'data', label: 'Result' }]
			};

		// Condition has data in, true/false outputs
		case 'condition':
			return {
				inputs: [{ id: 'data_in', type: 'data', label: 'Input' }],
				outputs: [
					{ id: 'true_out', type: 'condition_true', label: 'True' },
					{ id: 'false_out', type: 'condition_false', label: 'False' }
				]
			};

		// Transform has data in, data out
		case 'transform':
			return {
				inputs: [{ id: 'data_in', type: 'data', label: 'Input' }],
				outputs: [{ id: 'data_out', type: 'data', label: 'Result' }]
			};
	}
}
