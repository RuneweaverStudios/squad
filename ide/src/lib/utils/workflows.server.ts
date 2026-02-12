/**
 * Workflow Utilities (Server-Only)
 *
 * Manages workflow files stored in ~/.config/jat/workflows/.
 * Provides CRUD operations, validation, and run history management.
 *
 * This file uses Node.js fs/path/os modules and must only be imported
 * in server-side code (+server.ts files, not browser components).
 *
 * For types that can be used in browser code, import from:
 *   import type { Workflow, WorkflowNode } from '$lib/types/workflow';
 *
 * @example
 * // In +server.ts files:
 * import { getAllWorkflows, saveWorkflow, validateWorkflow } from '$lib/utils/workflows.server';
 */

import { readFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { writeFile, mkdir, unlink, readFile, readdir } from 'fs/promises';
import { homedir } from 'os';
import { join, basename } from 'path';
import type {
	Workflow,
	WorkflowFile,
	WorkflowNode,
	WorkflowEdge,
	WorkflowRun,
	WorkflowRunFile,
	WorkflowSummary,
	ValidationResult,
	ValidationError,
	NodeType,
	NodeCategory,
	Position,
	Port
} from '$lib/types/workflow';
import { NODE_CATEGORIES, getDefaultPorts } from '$lib/types/workflow';

// Re-export types for convenience
export type {
	Workflow,
	WorkflowNode,
	WorkflowEdge,
	WorkflowRun,
	WorkflowSummary,
	ValidationResult
} from '$lib/types/workflow';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Directory where workflows are stored */
export const WORKFLOWS_DIR = join(homedir(), '.config', 'jat', 'workflows');

/** Directory where run history is stored */
export const RUNS_DIR = join(WORKFLOWS_DIR, 'runs');

/** File extension for workflow files */
const WORKFLOW_EXTENSION = '.json';

// =============================================================================
// ID GENERATION
// =============================================================================

/** Regex for valid workflow IDs */
const ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

/** Generate a random workflow ID */
export function generateWorkflowId(): string {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	let id = '';
	for (let i = 0; i < 8; i++) {
		id += chars[Math.floor(Math.random() * chars.length)];
	}
	return `wf-${id}`;
}

/** Generate a random run ID */
export function generateRunId(): string {
	const now = new Date();
	const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	let rand = '';
	for (let i = 0; i < 5; i++) {
		rand += chars[Math.floor(Math.random() * chars.length)];
	}
	return `run-${ts}-${rand}`;
}

/** Generate a random node ID */
export function generateNodeId(): string {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	let id = '';
	for (let i = 0; i < 6; i++) {
		id += chars[Math.floor(Math.random() * chars.length)];
	}
	return `node-${id}`;
}

/** Generate a random edge ID */
export function generateEdgeId(): string {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	let id = '';
	for (let i = 0; i < 6; i++) {
		id += chars[Math.floor(Math.random() * chars.length)];
	}
	return `edge-${id}`;
}

/** Validate a workflow ID */
export function isValidWorkflowId(id: string): boolean {
	return ID_REGEX.test(id) && id.length >= 2 && id.length <= 64;
}

// =============================================================================
// VALIDATION
// =============================================================================

/** All valid node types */
const VALID_NODE_TYPES: NodeType[] = [
	'trigger_cron',
	'trigger_event',
	'trigger_manual',
	'llm_prompt',
	'action_create_task',
	'action_send_message',
	'action_run_bash',
	'action_spawn_agent',
	'action_browser',
	'condition',
	'transform'
];

/**
 * Validate a complete workflow
 */
export function validateWorkflow(workflow: Partial<Workflow>): ValidationResult {
	const errors: ValidationError[] = [];

	// Required fields
	if (!workflow.id || typeof workflow.id !== 'string') {
		errors.push({ path: 'id', message: 'Workflow ID is required' });
	} else if (!isValidWorkflowId(workflow.id)) {
		errors.push({
			path: 'id',
			message: 'ID must be 2-64 characters, alphanumeric with hyphens/underscores'
		});
	}

	if (!workflow.name || typeof workflow.name !== 'string' || workflow.name.trim().length === 0) {
		errors.push({ path: 'name', message: 'Workflow name is required' });
	}

	if (!Array.isArray(workflow.nodes)) {
		errors.push({ path: 'nodes', message: 'Nodes must be an array' });
	} else {
		// Validate each node
		const nodeIds = new Set<string>();
		for (let i = 0; i < workflow.nodes.length; i++) {
			const node = workflow.nodes[i];
			const prefix = `nodes[${i}]`;

			if (!node.id) {
				errors.push({ path: `${prefix}.id`, message: 'Node ID is required' });
			} else if (nodeIds.has(node.id)) {
				errors.push({ path: `${prefix}.id`, message: `Duplicate node ID: ${node.id}` });
			} else {
				nodeIds.add(node.id);
			}

			if (!node.type || !VALID_NODE_TYPES.includes(node.type)) {
				errors.push({
					path: `${prefix}.type`,
					message: `Invalid node type: ${node.type}. Valid: ${VALID_NODE_TYPES.join(', ')}`
				});
			}

			if (
				!node.position ||
				typeof node.position.x !== 'number' ||
				typeof node.position.y !== 'number'
			) {
				errors.push({ path: `${prefix}.position`, message: 'Node position {x, y} is required' });
			}

			if (!node.config || typeof node.config !== 'object') {
				errors.push({ path: `${prefix}.config`, message: 'Node config is required' });
			} else {
				// Validate node-type-specific config
				const configErrors = validateNodeConfig(
					node.type,
					node.config as unknown as Record<string, unknown>,
					`${prefix}.config`
				);
				errors.push(...configErrors);
			}
		}

		// Validate edges reference valid nodes/ports
		if (Array.isArray(workflow.edges)) {
			const edgeIds = new Set<string>();
			for (let i = 0; i < workflow.edges.length; i++) {
				const edge = workflow.edges[i];
				const prefix = `edges[${i}]`;

				if (!edge.id) {
					errors.push({ path: `${prefix}.id`, message: 'Edge ID is required' });
				} else if (edgeIds.has(edge.id)) {
					errors.push({ path: `${prefix}.id`, message: `Duplicate edge ID: ${edge.id}` });
				} else {
					edgeIds.add(edge.id);
				}

				if (!edge.sourceNodeId || !nodeIds.has(edge.sourceNodeId)) {
					errors.push({
						path: `${prefix}.sourceNodeId`,
						message: `Source node not found: ${edge.sourceNodeId}`
					});
				}

				if (!edge.targetNodeId || !nodeIds.has(edge.targetNodeId)) {
					errors.push({
						path: `${prefix}.targetNodeId`,
						message: `Target node not found: ${edge.targetNodeId}`
					});
				}

				if (!edge.sourcePort) {
					errors.push({ path: `${prefix}.sourcePort`, message: 'Source port is required' });
				}

				if (!edge.targetPort) {
					errors.push({ path: `${prefix}.targetPort`, message: 'Target port is required' });
				}

				// Self-loops
				if (edge.sourceNodeId && edge.sourceNodeId === edge.targetNodeId) {
					errors.push({
						path: `${prefix}`,
						message: 'Self-loops are not allowed'
					});
				}
			}
		}
	}

	if (!Array.isArray(workflow.edges)) {
		errors.push({ path: 'edges', message: 'Edges must be an array' });
	}

	return { valid: errors.length === 0, errors };
}

/**
 * Validate node-type-specific configuration
 */
function validateNodeConfig(
	type: NodeType,
	config: Record<string, unknown>,
	pathPrefix: string
): ValidationError[] {
	const errors: ValidationError[] = [];

	switch (type) {
		case 'trigger_cron':
			if (!config.cronExpr || typeof config.cronExpr !== 'string') {
				errors.push({ path: `${pathPrefix}.cronExpr`, message: 'Cron expression is required' });
			}
			break;

		case 'trigger_event':
			if (!config.eventType || typeof config.eventType !== 'string') {
				errors.push({ path: `${pathPrefix}.eventType`, message: 'Event type is required' });
			}
			break;

		case 'trigger_manual':
			// No required config
			break;

		case 'llm_prompt':
			if (!config.prompt || typeof config.prompt !== 'string') {
				errors.push({ path: `${pathPrefix}.prompt`, message: 'Prompt is required' });
			}
			if (!config.model || !['haiku', 'sonnet', 'opus'].includes(config.model as string)) {
				errors.push({
					path: `${pathPrefix}.model`,
					message: 'Model must be haiku, sonnet, or opus'
				});
			}
			break;

		case 'action_create_task':
			if (!config.title || typeof config.title !== 'string') {
				errors.push({ path: `${pathPrefix}.title`, message: 'Task title is required' });
			}
			break;

		case 'action_send_message':
			if (!config.recipient || typeof config.recipient !== 'string') {
				errors.push({ path: `${pathPrefix}.recipient`, message: 'Recipient is required' });
			}
			if (!config.message || typeof config.message !== 'string') {
				errors.push({ path: `${pathPrefix}.message`, message: 'Message is required' });
			}
			break;

		case 'action_run_bash':
			if (!config.command || typeof config.command !== 'string') {
				errors.push({ path: `${pathPrefix}.command`, message: 'Command is required' });
			}
			break;

		case 'action_spawn_agent':
			if (!config.taskId && !config.taskTitle) {
				errors.push({
					path: `${pathPrefix}`,
					message: 'Either taskId or taskTitle is required'
				});
			}
			break;

		case 'action_browser':
			if (!config.action || typeof config.action !== 'string') {
				errors.push({ path: `${pathPrefix}.action`, message: 'Browser action is required' });
			}
			break;

		case 'condition':
			if (!config.expression || typeof config.expression !== 'string') {
				errors.push({
					path: `${pathPrefix}.expression`,
					message: 'Condition expression is required'
				});
			}
			break;

		case 'transform':
			if (!config.functionBody || typeof config.functionBody !== 'string') {
				errors.push({
					path: `${pathPrefix}.functionBody`,
					message: 'Transform function body is required'
				});
			}
			break;
	}

	return errors;
}

// =============================================================================
// FILE OPERATIONS
// =============================================================================

/** Ensure workflows directory exists */
function ensureWorkflowsDir(): void {
	mkdirSync(WORKFLOWS_DIR, { recursive: true });
}

/** Ensure runs directory exists for a workflow */
async function ensureRunsDir(workflowId: string): Promise<string> {
	const dir = join(RUNS_DIR, workflowId);
	await mkdir(dir, { recursive: true });
	return dir;
}

/** Get path to a workflow file */
function getWorkflowPath(id: string): string {
	return join(WORKFLOWS_DIR, `${id}${WORKFLOW_EXTENSION}`);
}

/** Parse a workflow file from disk */
function parseWorkflowFile(content: string, id: string): Workflow | null {
	try {
		const data = JSON.parse(content) as WorkflowFile;
		return {
			id: data.id || id,
			name: data.name || id,
			description: data.description || '',
			nodes: data.nodes || [],
			edges: data.edges || [],
			enabled: data.enabled ?? false,
			createdAt: data.createdAt || new Date().toISOString(),
			updatedAt: data.updatedAt || new Date().toISOString()
		};
	} catch (error) {
		console.error(`[workflows] Failed to parse workflow ${id}:`, error);
		return null;
	}
}

/** Serialize a workflow for disk storage */
function serializeWorkflow(workflow: Workflow): string {
	const data: WorkflowFile = {
		id: workflow.id,
		name: workflow.name,
		description: workflow.description,
		nodes: workflow.nodes,
		edges: workflow.edges,
		enabled: workflow.enabled,
		createdAt: workflow.createdAt,
		updatedAt: workflow.updatedAt
	};
	return JSON.stringify(data, null, 2);
}

// =============================================================================
// PUBLIC API - READ OPERATIONS
// =============================================================================

/** Check if workflows directory exists */
export function workflowsDirectoryExists(): boolean {
	return existsSync(WORKFLOWS_DIR);
}

/** Get all workflow IDs */
export function getWorkflowIds(): string[] {
	if (!workflowsDirectoryExists()) {
		return [];
	}
	try {
		const entries = readdirSync(WORKFLOWS_DIR, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(WORKFLOW_EXTENSION))
			.map((entry) => basename(entry.name, WORKFLOW_EXTENSION));
	} catch {
		return [];
	}
}

/** Get a single workflow by ID (synchronous) */
export function getWorkflowSync(id: string): Workflow | null {
	const path = getWorkflowPath(id);
	if (!existsSync(path)) {
		return null;
	}
	try {
		const content = readFileSync(path, 'utf-8');
		return parseWorkflowFile(content, id);
	} catch {
		return null;
	}
}

/** Get a single workflow by ID (async) */
export async function getWorkflow(id: string): Promise<Workflow | null> {
	const path = getWorkflowPath(id);
	try {
		const content = await readFile(path, 'utf-8');
		return parseWorkflowFile(content, id);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return null;
		}
		return null;
	}
}

/** Get all workflows (synchronous) */
export function getAllWorkflowsSync(): Workflow[] {
	const ids = getWorkflowIds();
	const workflows: Workflow[] = [];
	for (const id of ids) {
		const workflow = getWorkflowSync(id);
		if (workflow) {
			workflows.push(workflow);
		}
	}
	workflows.sort((a, b) => a.name.localeCompare(b.name));
	return workflows;
}

/** Get all workflows (async) */
export async function getAllWorkflows(): Promise<Workflow[]> {
	const ids = getWorkflowIds();
	const workflows: Workflow[] = [];
	for (const id of ids) {
		const workflow = await getWorkflow(id);
		if (workflow) {
			workflows.push(workflow);
		}
	}
	workflows.sort((a, b) => a.name.localeCompare(b.name));
	return workflows;
}

/** Get workflow summaries for list views */
export async function getWorkflowSummaries(): Promise<WorkflowSummary[]> {
	const workflows = await getAllWorkflows();
	const summaries: WorkflowSummary[] = [];

	for (const wf of workflows) {
		// Get last run status
		const lastRun = await getLastRun(wf.id);

		summaries.push({
			id: wf.id,
			name: wf.name,
			description: wf.description,
			enabled: wf.enabled,
			nodeCount: wf.nodes.length,
			edgeCount: wf.edges.length,
			lastRunStatus: lastRun?.status,
			lastRunAt: lastRun?.startedAt,
			createdAt: wf.createdAt,
			updatedAt: wf.updatedAt
		});
	}

	return summaries;
}

/** Check if a workflow exists */
export function workflowExists(id: string): boolean {
	return existsSync(getWorkflowPath(id));
}

// =============================================================================
// PUBLIC API - WRITE OPERATIONS
// =============================================================================

/**
 * Save a workflow to disk
 */
export async function saveWorkflow(
	workflow: Omit<Workflow, 'createdAt' | 'updatedAt'> & {
		createdAt?: string;
		updatedAt?: string;
	},
	options: { overwrite?: boolean } = {}
): Promise<Workflow> {
	const validation = validateWorkflow(workflow as Partial<Workflow>);
	if (!validation.valid) {
		throw new Error(`Invalid workflow: ${validation.errors.map((e) => e.message).join(', ')}`);
	}

	const exists = workflowExists(workflow.id);
	if (exists && !options.overwrite) {
		throw new Error(`Workflow '${workflow.id}' already exists. Use overwrite option to update.`);
	}

	ensureWorkflowsDir();

	const now = new Date().toISOString();
	const saved: Workflow = {
		id: workflow.id,
		name: workflow.name,
		description: workflow.description || '',
		nodes: workflow.nodes,
		edges: workflow.edges,
		enabled: workflow.enabled ?? false,
		createdAt: exists ? workflow.createdAt || now : now,
		updatedAt: now
	};

	const path = getWorkflowPath(workflow.id);
	await writeFile(path, serializeWorkflow(saved), 'utf-8');
	return saved;
}

/**
 * Update an existing workflow
 */
export async function updateWorkflow(
	id: string,
	updates: Partial<Omit<Workflow, 'id' | 'createdAt'>>
): Promise<Workflow> {
	const existing = await getWorkflow(id);
	if (!existing) {
		throw new Error(`Workflow '${id}' not found`);
	}

	const merged: Workflow = {
		...existing,
		...updates,
		id: existing.id,
		createdAt: existing.createdAt
	};

	return saveWorkflow(merged, { overwrite: true });
}

/**
 * Delete a workflow and its run history
 */
export async function deleteWorkflow(id: string): Promise<boolean> {
	const path = getWorkflowPath(id);
	try {
		await unlink(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return false;
		}
		throw error;
	}

	// Clean up runs directory
	const runsDir = join(RUNS_DIR, id);
	if (existsSync(runsDir)) {
		try {
			const runFiles = readdirSync(runsDir);
			for (const f of runFiles) {
				await unlink(join(runsDir, f));
			}
			// Remove directory after emptying
			const { rmdir } = await import('fs/promises');
			await rmdir(runsDir);
		} catch {
			// Best effort cleanup
		}
	}

	return true;
}

/**
 * Toggle workflow enabled state
 */
export async function toggleWorkflow(id: string): Promise<Workflow> {
	const existing = await getWorkflow(id);
	if (!existing) {
		throw new Error(`Workflow '${id}' not found`);
	}
	return updateWorkflow(id, { enabled: !existing.enabled });
}

// =============================================================================
// RUN HISTORY
// =============================================================================

/**
 * Save a workflow run
 */
export async function saveRun(run: WorkflowRun): Promise<void> {
	const dir = await ensureRunsDir(run.workflowId);
	const path = join(dir, `${run.id}${WORKFLOW_EXTENSION}`);
	const data: WorkflowRunFile = {
		id: run.id,
		workflowId: run.workflowId,
		trigger: run.trigger,
		status: run.status,
		startedAt: run.startedAt,
		completedAt: run.completedAt,
		durationMs: run.durationMs,
		nodeResults: run.nodeResults,
		error: run.error
	};
	await writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Get runs for a workflow
 */
export async function getRuns(
	workflowId: string,
	limit: number = 20
): Promise<WorkflowRun[]> {
	const dir = join(RUNS_DIR, workflowId);
	if (!existsSync(dir)) {
		return [];
	}

	try {
		const files = await readdir(dir);
		const runs: WorkflowRun[] = [];

		for (const file of files) {
			if (!file.endsWith(WORKFLOW_EXTENSION)) continue;
			try {
				const content = await readFile(join(dir, file), 'utf-8');
				const data = JSON.parse(content) as WorkflowRunFile;
				runs.push({
					id: data.id,
					workflowId: data.workflowId,
					trigger: data.trigger,
					status: data.status,
					startedAt: data.startedAt,
					completedAt: data.completedAt,
					durationMs: data.durationMs,
					nodeResults: data.nodeResults || {},
					error: data.error
				});
			} catch {
				// Skip malformed run files
			}
		}

		// Sort by startedAt descending (newest first)
		runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
		return runs.slice(0, limit);
	} catch {
		return [];
	}
}

/**
 * Get the most recent run for a workflow
 */
export async function getLastRun(workflowId: string): Promise<WorkflowRun | null> {
	const runs = await getRuns(workflowId, 1);
	return runs[0] || null;
}

/**
 * Get a specific run by ID
 */
export async function getRun(workflowId: string, runId: string): Promise<WorkflowRun | null> {
	const path = join(RUNS_DIR, workflowId, `${runId}${WORKFLOW_EXTENSION}`);
	try {
		const content = await readFile(path, 'utf-8');
		const data = JSON.parse(content) as WorkflowRunFile;
		return {
			id: data.id,
			workflowId: data.workflowId,
			trigger: data.trigger,
			status: data.status,
			startedAt: data.startedAt,
			completedAt: data.completedAt,
			durationMs: data.durationMs,
			nodeResults: data.nodeResults || {},
			error: data.error
		};
	} catch {
		return null;
	}
}

// =============================================================================
// HELPER: CREATE NODE
// =============================================================================

/**
 * Create a new node with default config and ports
 */
export function createNode(
	type: NodeType,
	position: Position,
	label?: string
): WorkflowNode {
	const ports = getDefaultPorts(type);
	const defaultConfig = getDefaultConfig(type);

	return {
		id: generateNodeId(),
		type,
		position,
		config: defaultConfig,
		label: label || getDefaultLabel(type),
		inputs: ports.inputs,
		outputs: ports.outputs
	};
}

/** Get default config for a node type */
function getDefaultConfig(type: NodeType): Record<string, unknown> {
	switch (type) {
		case 'trigger_cron':
			return { cronExpr: '0 9 * * *' };
		case 'trigger_event':
			return { eventType: 'task_completed' };
		case 'trigger_manual':
			return {};
		case 'llm_prompt':
			return { prompt: '', model: 'sonnet' };
		case 'action_create_task':
			return { title: '' };
		case 'action_send_message':
			return { recipient: '', message: '' };
		case 'action_run_bash':
			return { command: '', timeout: 60 };
		case 'action_spawn_agent':
			return { taskTitle: '', model: 'sonnet' };
		case 'action_browser':
			return { action: 'navigate', url: '' };
		case 'condition':
			return { expression: '' };
		case 'transform':
			return { functionBody: 'return input' };
		default:
			return {};
	}
}

/** Get default display label for a node type */
function getDefaultLabel(type: NodeType): string {
	const labels: Record<NodeType, string> = {
		trigger_cron: 'Cron Trigger',
		trigger_event: 'Event Trigger',
		trigger_manual: 'Manual Trigger',
		llm_prompt: 'LLM Prompt',
		action_create_task: 'Create Task',
		action_send_message: 'Send Message',
		action_run_bash: 'Run Command',
		action_spawn_agent: 'Spawn Agent',
		action_browser: 'Browser Action',
		condition: 'Condition',
		transform: 'Transform'
	};
	return labels[type] || type;
}

// =============================================================================
// HELPER: CREATE BLANK WORKFLOW
// =============================================================================

/**
 * Create a new blank workflow with a manual trigger
 */
export function createBlankWorkflow(name: string): Workflow {
	const trigger = createNode('trigger_manual', { x: 100, y: 200 }, 'Start');

	return {
		id: generateWorkflowId(),
		name,
		description: '',
		nodes: [trigger],
		edges: [],
		enabled: false,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString()
	};
}

// =============================================================================
// EXAMPLE WORKFLOW
// =============================================================================

/**
 * Generate an example workflow for testing.
 * This creates a "Daily Code Review" workflow:
 *   Cron Trigger → LLM Prompt → Condition → Create Task (if issues found)
 */
export function createExampleWorkflow(): Workflow {
	const triggerId = 'node-trigger';
	const llmId = 'node-llm';
	const conditionId = 'node-condition';
	const taskId = 'node-create-task';

	const nodes: WorkflowNode[] = [
		{
			id: triggerId,
			type: 'trigger_cron',
			position: { x: 100, y: 200 },
			config: { cronExpr: '0 9 * * 1-5', timezone: 'America/New_York' },
			label: 'Weekday 9 AM',
			inputs: [],
			outputs: [{ id: 'trigger_out', type: 'trigger', label: 'Trigger' }]
		},
		{
			id: llmId,
			type: 'llm_prompt',
			position: { x: 400, y: 200 },
			config: {
				prompt:
					'Review the git log from the last 24 hours. Summarize changes and flag any issues.',
				model: 'sonnet',
				maxTokens: 2000
			},
			label: 'Review Changes',
			inputs: [{ id: 'data_in', type: 'data', label: 'Input' }],
			outputs: [{ id: 'data_out', type: 'data', label: 'Result' }]
		},
		{
			id: conditionId,
			type: 'condition',
			position: { x: 700, y: 200 },
			config: { expression: "input.includes('issue') || input.includes('bug')" },
			label: 'Issues Found?',
			inputs: [{ id: 'data_in', type: 'data', label: 'Input' }],
			outputs: [
				{ id: 'true_out', type: 'condition_true', label: 'True' },
				{ id: 'false_out', type: 'condition_false', label: 'False' }
			]
		},
		{
			id: taskId,
			type: 'action_create_task',
			position: { x: 1000, y: 150 },
			config: {
				title: 'Review flagged issues from daily code review',
				description: '{{input}}',
				type: 'task',
				priority: 2,
				labels: 'review,automated'
			},
			label: 'Create Review Task',
			inputs: [{ id: 'data_in', type: 'data', label: 'Input' }],
			outputs: [{ id: 'data_out', type: 'data', label: 'Result' }]
		}
	];

	const edges: WorkflowEdge[] = [
		{
			id: 'edge-1',
			sourceNodeId: triggerId,
			sourcePort: 'trigger_out',
			targetNodeId: llmId,
			targetPort: 'data_in'
		},
		{
			id: 'edge-2',
			sourceNodeId: llmId,
			sourcePort: 'data_out',
			targetNodeId: conditionId,
			targetPort: 'data_in'
		},
		{
			id: 'edge-3',
			sourceNodeId: conditionId,
			sourcePort: 'true_out',
			targetNodeId: taskId,
			targetPort: 'data_in'
		}
	];

	return {
		id: 'wf-daily-review',
		name: 'Daily Code Review',
		description:
			'Runs every weekday at 9 AM. Reviews git changes, flags issues, and creates a task if problems found.',
		nodes,
		edges,
		enabled: false,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString()
	};
}
