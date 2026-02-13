/**
 * Workflow Execution Engine
 *
 * Walks a workflow graph and runs each node in dependency order.
 * Supports branching (condition nodes), variable substitution,
 * dry-run mode, and pluggable node executors.
 *
 * @see ide/src/lib/types/workflow.ts for type definitions
 * @see ide/src/lib/utils/workflows.server.ts for CRUD operations
 */

import { execFile } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import type {
	Workflow,
	WorkflowNode,
	WorkflowEdge,
	WorkflowRun,
	NodeExecutionResult,
	RunStatus,
	NodeType,
	LlmPromptConfig,
	ActionCreateTaskConfig,
	ActionSendMessageConfig,
	ActionRunBashConfig,
	ActionSpawnAgentConfig,
	ActionBrowserConfig,
	ConditionConfig,
	TransformConfig
} from '$lib/types/workflow';
import { generateRunId, saveRun } from '$lib/utils/workflows.server';

// =============================================================================
// TYPES
// =============================================================================

/** Options for running a workflow */
export interface RunOptions {
	/** How the run was triggered */
	trigger?: 'manual' | 'cron' | 'event';
	/** If true, log what would happen without executing */
	dryRun?: boolean;
	/** Base URL for IDE API calls (e.g., http://127.0.0.1:3333) */
	ideBaseUrl?: string;
	/** Project context for commands that need it */
	project?: string;
	/** Abort signal for cancellation */
	signal?: AbortSignal;
	/** Data from the triggering event (passed as trigger node output) */
	eventData?: Record<string, unknown>;
}

/** Execution context passed to node executors */
export interface ExecutionContext {
	workflowId: string;
	runId: string;
	startedAt: string;
	dryRun: boolean;
	ideBaseUrl: string;
	project?: string;
	/** Results from previously executed nodes */
	nodeResults: Map<string, NodeExecutionResult>;
	/** Log function for dry-run output */
	log: (nodeId: string, message: string) => void;
	/** Abort signal */
	signal?: AbortSignal;
	/** Event data from the triggering event (for event-triggered runs) */
	eventData?: Record<string, unknown>;
}

/** A node executor function */
type NodeExecutor = (
	node: WorkflowNode,
	input: unknown,
	ctx: ExecutionContext
) => Promise<unknown>;

// =============================================================================
// TOPOLOGICAL SORT
// =============================================================================

/**
 * Topological sort of workflow nodes using Kahn's algorithm.
 * Returns nodes in execution order (dependencies first).
 * Throws if the graph has cycles.
 */
export function topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
	const nodeMap = new Map<string, WorkflowNode>();
	for (const node of nodes) {
		nodeMap.set(node.id, node);
	}

	// Build in-degree map and adjacency list
	const inDegree = new Map<string, number>();
	const adjacency = new Map<string, string[]>();

	for (const node of nodes) {
		inDegree.set(node.id, 0);
		adjacency.set(node.id, []);
	}

	for (const edge of edges) {
		const targets = adjacency.get(edge.sourceNodeId);
		if (targets) {
			targets.push(edge.targetNodeId);
		}
		inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) || 0) + 1);
	}

	// Start with nodes that have no incoming edges
	const queue: string[] = [];
	for (const [nodeId, degree] of inDegree) {
		if (degree === 0) {
			queue.push(nodeId);
		}
	}

	const sorted: WorkflowNode[] = [];
	while (queue.length > 0) {
		const nodeId = queue.shift()!;
		const node = nodeMap.get(nodeId);
		if (node) {
			sorted.push(node);
		}

		for (const targetId of adjacency.get(nodeId) || []) {
			const newDegree = (inDegree.get(targetId) || 1) - 1;
			inDegree.set(targetId, newDegree);
			if (newDegree === 0) {
				queue.push(targetId);
			}
		}
	}

	if (sorted.length !== nodes.length) {
		throw new Error('Workflow graph contains a cycle');
	}

	return sorted;
}

// =============================================================================
// VARIABLE SUBSTITUTION
// =============================================================================

/**
 * Resolve a dot-separated path against an object.
 * e.g. resolvePath({ a: { b: "c" } }, "a.b") → "c"
 * Returns undefined if any segment is missing.
 */
function resolvePath(obj: unknown, path: string): unknown {
	let current: unknown = obj;
	for (const key of path.split('.')) {
		if (current == null || typeof current !== 'object') return undefined;
		current = (current as Record<string, unknown>)[key];
	}
	return current;
}

/** Stringify a value for template substitution */
function toSubstitutionString(value: unknown): string {
	if (value === undefined || value === null) return '';
	if (typeof value === 'string') return value;
	return JSON.stringify(value);
}

/**
 * Replace template placeholders in a string:
 *   {{input}}          – full input value
 *   {{input.field}}    – dot-path into input (if input is object/JSON)
 *   {{result}}         – alias for {{input}}
 *   {{result.field}}   – alias for {{input.field}}
 *   {{nodeId.output}}  – specific node's output by ID
 */
function substituteVariables(template: string, input: unknown, ctx: ExecutionContext): string {
	let result = template;

	// Parse input into an object if it's a JSON string (for dot-path access)
	let inputObj: unknown = input;
	if (typeof input === 'string') {
		try { inputObj = JSON.parse(input); } catch { /* keep as string */ }
	}

	const inputStr = toSubstitutionString(input);

	// Replace {{input.path}} and {{result.path}} with dot-path resolution (before bare {{input}})
	result = result.replace(/\{\{(input|result)\.([a-zA-Z_][\w.]*)\}\}/g, (_match, _prefix, path) => {
		const value = resolvePath(inputObj, path);
		return toSubstitutionString(value);
	});

	// Replace bare {{input}} and {{result}} with the full input
	result = result.replace(/\{\{input\}\}/g, inputStr);
	result = result.replace(/\{\{result\}\}/g, inputStr);

	// Replace {{nodeId.output}} with specific node outputs
	result = result.replace(/\{\{(\w[\w-]*?)\.output\}\}/g, (_match, nodeId) => {
		const nodeResult = ctx.nodeResults.get(nodeId);
		if (nodeResult?.output !== undefined) {
			return toSubstitutionString(nodeResult.output);
		}
		return '';
	});

	return result;
}

// =============================================================================
// INPUT RESOLUTION
// =============================================================================

/**
 * Resolve the input for a node by looking at incoming edges and
 * gathering output from source nodes.
 */
function resolveNodeInput(
	node: WorkflowNode,
	edges: WorkflowEdge[],
	ctx: ExecutionContext,
	skippedNodes: Set<string>
): { input: unknown; shouldSkip: boolean } {
	const incomingEdges = edges.filter((e) => e.targetNodeId === node.id);

	if (incomingEdges.length === 0) {
		// Trigger nodes or nodes with no inputs
		// For trigger nodes, inject eventData from context if available
		if (ctx.eventData && node.type.startsWith('trigger_')) {
			return { input: ctx.eventData, shouldSkip: false };
		}
		return { input: undefined, shouldSkip: false };
	}

	// Check if ALL incoming edges come from skipped or errored nodes
	const activeEdges = incomingEdges.filter((e) => {
		if (skippedNodes.has(e.sourceNodeId)) return false;
		const result = ctx.nodeResults.get(e.sourceNodeId);
		if (result && result.status === 'error') return false;
		return true;
	});

	if (activeEdges.length === 0) {
		// All sources are skipped or errored - skip this node too
		return { input: undefined, shouldSkip: true };
	}

	// Check for condition node routing
	for (const edge of activeEdges) {
		const sourceResult = ctx.nodeResults.get(edge.sourceNodeId);
		if (!sourceResult || sourceResult.status !== 'success') {
			continue;
		}

		// If source is a condition node, check which branch is active
		const sourceNode = findNode(edge.sourceNodeId, ctx);
		if (sourceNode?.type === 'condition') {
			const conditionOutput = sourceResult.output as { branch: string } | undefined;
			const activeBranch = conditionOutput?.branch;

			// Map port types to branch names
			const isTrue = edge.sourcePort === 'true_out';
			const isFalse = edge.sourcePort === 'false_out';

			if (isTrue && activeBranch !== 'true') {
				// This edge is from the inactive true branch
				return { input: undefined, shouldSkip: true };
			}
			if (isFalse && activeBranch !== 'false') {
				// This edge is from the inactive false branch
				return { input: undefined, shouldSkip: true };
			}

			// Use the condition node's input (pass-through) as this node's input
			return { input: sourceResult.input, shouldSkip: false };
		}
	}

	// Normal case: use the first active source's output
	for (const edge of activeEdges) {
		const sourceResult = ctx.nodeResults.get(edge.sourceNodeId);
		if (sourceResult && sourceResult.status === 'success') {
			return { input: sourceResult.output, shouldSkip: false };
		}
	}

	// If we get here, no source has succeeded yet but we're not skipped
	return { input: undefined, shouldSkip: false };
}

/** Helper to find a node by ID from context */
function findNode(nodeId: string, ctx: ExecutionContext): WorkflowNode | undefined {
	// This is set during execution
	return (ctx as ExecutionContext & { _nodes?: WorkflowNode[] })._nodes?.find(
		(n) => n.id === nodeId
	);
}

// =============================================================================
// NODE EXECUTORS
// =============================================================================

/** Execute a shell command and return stdout */
function execCommand(cmd: string, args: string[], cwd: string, timeoutMs = 30000): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout) => {
			if (err) reject(err);
			else resolve(stdout.trim());
		});
	});
}

/** Trigger nodes pass through event data (if provided) or emit a basic trigger signal */
async function executeTrigger(
	_node: WorkflowNode,
	input: unknown,
	ctx: ExecutionContext
): Promise<unknown> {
	ctx.log(_node.id, `Trigger ${_node.type} fired`);
	// If input contains event data (from event-triggered run), pass it through
	if (input && typeof input === 'object' && Object.keys(input as object).length > 0) {
		return input;
	}
	return { triggered: true, timestamp: new Date().toISOString() };
}

/** LLM Prompt: run a prompt through Claude CLI */
async function executeLlmPrompt(
	node: WorkflowNode,
	input: unknown,
	ctx: ExecutionContext
): Promise<unknown> {
	const config = node.config as LlmPromptConfig;
	const prompt = substituteVariables(config.prompt, input, ctx);
	const model = config.model || 'sonnet';

	ctx.log(node.id, `LLM prompt (${model}): ${prompt.slice(0, 100)}...`);

	if (ctx.dryRun) {
		return `[DRY RUN] Would send to ${model}: ${prompt.slice(0, 200)}`;
	}

	const modelMap: Record<string, string> = {
		haiku: 'haiku',
		sonnet: 'sonnet',
		opus: 'opus'
	};

	const args = ['-p', prompt, '--model', modelMap[model] || 'sonnet'];
	if (config.maxTokens) {
		args.push('--max-turns', '1');
	}

	const cwd = ctx.project
		? join(homedir(), 'code', ctx.project)
		: process.cwd().replace('/ide', '');

	const result = await execCommand('claude', args, cwd, 120000);
	return result;
}

/** Create Task: run jt create */
async function executeCreateTask(
	node: WorkflowNode,
	input: unknown,
	ctx: ExecutionContext
): Promise<unknown> {
	const config = node.config as ActionCreateTaskConfig;
	const title = substituteVariables(config.title, input, ctx);
	const description = config.description
		? substituteVariables(config.description, input, ctx)
		: undefined;

	ctx.log(node.id, `Create task: "${title}"`);

	if (ctx.dryRun) {
		return { dryRun: true, title, description, type: config.type, priority: config.priority };
	}

	const args = ['create', title];
	if (config.type) args.push('--type', config.type);
	if (config.priority !== undefined) args.push('--priority', String(config.priority));
	if (description) args.push('--description', description);
	if (config.labels) args.push('--labels', config.labels);

	const cwd = config.project
		? join(homedir(), 'code', config.project)
		: ctx.project
			? join(homedir(), 'code', ctx.project)
			: process.cwd().replace('/ide', '');

	const result = await execCommand('jt', args, cwd);
	return result;
}

/** Send Message: run am-send */
async function executeSendMessage(
	node: WorkflowNode,
	input: unknown,
	ctx: ExecutionContext
): Promise<unknown> {
	const config = node.config as ActionSendMessageConfig;
	const message = substituteVariables(config.message, input, ctx);

	ctx.log(node.id, `Send message to ${config.recipient}: "${message.slice(0, 80)}..."`);

	if (ctx.dryRun) {
		return { dryRun: true, recipient: config.recipient, message };
	}

	const args = [
		'--from',
		'workflow',
		'--to',
		config.recipient,
		'--thread',
		`workflow-${ctx.workflowId}`,
		message
	];

	const result = await execCommand('am-send', args, process.cwd());
	return result;
}

/** Run Bash: execute a shell command */
async function executeRunBash(
	node: WorkflowNode,
	input: unknown,
	ctx: ExecutionContext
): Promise<unknown> {
	const config = node.config as ActionRunBashConfig;
	const command = substituteVariables(config.command, input, ctx);
	const timeoutMs = (config.timeout || 60) * 1000;

	ctx.log(node.id, `Run bash: ${command.slice(0, 100)}`);

	if (ctx.dryRun) {
		return { dryRun: true, command, cwd: config.cwd, timeout: config.timeout };
	}

	const cwd = config.cwd || (ctx.project ? join(homedir(), 'code', ctx.project) : process.cwd());
	const result = await execCommand('bash', ['-c', command], cwd, timeoutMs);
	return result;
}

/** Spawn Agent: POST to /api/work/spawn */
async function executeSpawnAgent(
	node: WorkflowNode,
	input: unknown,
	ctx: ExecutionContext
): Promise<unknown> {
	const config = node.config as ActionSpawnAgentConfig;

	ctx.log(node.id, `Spawn agent: task=${config.taskId || config.taskTitle}, model=${config.model}`);

	if (ctx.dryRun) {
		return { dryRun: true, taskId: config.taskId, taskTitle: config.taskTitle, model: config.model };
	}

	const body: Record<string, unknown> = {};
	if (config.taskId) {
		body.taskId = config.taskId;
	}
	if (config.model) {
		body.model = config.model;
	}
	if (config.project) {
		body.project = config.project;
	}

	const response = await fetch(`${ctx.ideBaseUrl}/api/work/spawn`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Spawn failed (${response.status}): ${text}`);
	}

	return await response.json();
}

/** Browser Action: call browser-* tools */
async function executeBrowser(
	node: WorkflowNode,
	input: unknown,
	ctx: ExecutionContext
): Promise<unknown> {
	const config = node.config as ActionBrowserConfig;
	const url = config.url ? substituteVariables(config.url, input, ctx) : undefined;

	ctx.log(node.id, `Browser ${config.action}: ${url || config.selector || config.jsCode || ''}`);

	if (ctx.dryRun) {
		return { dryRun: true, action: config.action, url, selector: config.selector };
	}

	const cwd = process.cwd();

	switch (config.action) {
		case 'navigate': {
			if (!url) throw new Error('URL required for navigate action');
			return await execCommand('browser-nav.js', [url], cwd);
		}
		case 'screenshot': {
			const output = `/tmp/workflow-screenshot-${Date.now()}.png`;
			await execCommand('browser-screenshot.js', ['--output', output], cwd);
			return { screenshotPath: output };
		}
		case 'eval': {
			if (!config.jsCode) throw new Error('jsCode required for eval action');
			const code = substituteVariables(config.jsCode, input, ctx);
			return await execCommand('browser-eval.js', [code], cwd);
		}
		case 'click': {
			if (!config.selector) throw new Error('selector required for click action');
			return await execCommand('browser-pick.js', ['--selector', config.selector], cwd);
		}
		case 'wait': {
			const args: string[] = [];
			if (config.selector) args.push('--selector', config.selector);
			if (config.timeout) args.push('--timeout', String(config.timeout));
			return await execCommand('browser-wait.js', args, cwd);
		}
		default:
			throw new Error(`Unknown browser action: ${config.action}`);
	}
}

/** Condition: evaluate JS expression against input */
async function executeCondition(
	node: WorkflowNode,
	input: unknown,
	ctx: ExecutionContext
): Promise<unknown> {
	const config = node.config as ConditionConfig;

	ctx.log(node.id, `Condition: ${config.expression}`);

	if (ctx.dryRun) {
		return { dryRun: true, expression: config.expression, branch: 'true' };
	}

	// Evaluate the expression in a sandboxed function
	// Wrap in try-catch to handle undefined/null input gracefully
	const fn = new Function('input', `try { return Boolean(${config.expression}); } catch(e) { return false; }`);
	const result = fn(input ?? '');

	ctx.log(node.id, `Condition result: ${result} → branch: ${result ? 'true' : 'false'}`);

	return { branch: result ? 'true' : 'false', value: result };
}

/** Transform: apply JS transform to input data */
async function executeTransform(
	node: WorkflowNode,
	input: unknown,
	ctx: ExecutionContext
): Promise<unknown> {
	const config = node.config as TransformConfig;

	ctx.log(node.id, `Transform: ${config.functionBody.slice(0, 80)}`);

	if (ctx.dryRun) {
		return { dryRun: true, functionBody: config.functionBody, input };
	}

	const fn = new Function('input', config.functionBody);
	return fn(input);
}

// =============================================================================
// EXECUTOR REGISTRY
// =============================================================================

const EXECUTORS: Record<NodeType, NodeExecutor> = {
	trigger_cron: executeTrigger,
	trigger_event: executeTrigger,
	trigger_manual: executeTrigger,
	llm_prompt: executeLlmPrompt,
	action_create_task: executeCreateTask,
	action_send_message: executeSendMessage,
	action_run_bash: executeRunBash,
	action_spawn_agent: executeSpawnAgent,
	action_browser: executeBrowser,
	condition: executeCondition,
	transform: executeTransform
};

// =============================================================================
// MAIN ENGINE
// =============================================================================

/**
 * Execute a workflow.
 *
 * 1. Topological sort nodes by edges
 * 2. Execute each node in order, passing outputs as inputs
 * 3. Handle condition nodes by routing to true/false branches
 * 4. Capture timing, errors, and outputs per node
 * 5. Save run history to disk
 *
 * @returns The completed WorkflowRun with all node results
 */
export async function executeWorkflow(
	workflow: Workflow,
	options: RunOptions = {}
): Promise<WorkflowRun> {
	const {
		trigger = 'manual',
		dryRun = false,
		ideBaseUrl = 'http://127.0.0.1:3333',
		project,
		signal,
		eventData
	} = options;

	const runId = generateRunId();
	const startedAt = new Date().toISOString();
	const logs: string[] = [];

	// Initialize execution context
	const ctx: ExecutionContext & { _nodes?: WorkflowNode[] } = {
		workflowId: workflow.id,
		runId,
		startedAt,
		dryRun,
		ideBaseUrl,
		project,
		nodeResults: new Map(),
		log: (nodeId: string, message: string) => {
			logs.push(`[${nodeId}] ${message}`);
		},
		signal,
		eventData,
		_nodes: workflow.nodes
	};

	// Sort nodes in execution order
	let sortedNodes: WorkflowNode[];
	try {
		sortedNodes = topologicalSort(workflow.nodes, workflow.edges);
	} catch (err) {
		const run: WorkflowRun = {
			id: runId,
			workflowId: workflow.id,
			trigger,
			status: 'failed',
			startedAt,
			completedAt: new Date().toISOString(),
			durationMs: 0,
			nodeResults: {},
			error: err instanceof Error ? err.message : String(err)
		};
		await saveRun(run);
		return run;
	}

	// Track skipped nodes (from inactive condition branches)
	const skippedNodes = new Set<string>();
	let hasErrors = false;

	// Execute each node in order
	for (const node of sortedNodes) {
		// Check for abort
		if (signal?.aborted) {
			const nodeResult: NodeExecutionResult = {
				nodeId: node.id,
				status: 'skipped',
				durationMs: 0,
				startedAt: new Date().toISOString(),
				error: 'Run was cancelled'
			};
			ctx.nodeResults.set(node.id, nodeResult);
			skippedNodes.add(node.id);
			continue;
		}

		const nodeStartedAt = new Date();

		// Resolve input from upstream nodes
		const { input, shouldSkip } = resolveNodeInput(node, workflow.edges, ctx, skippedNodes);

		if (shouldSkip) {
			const nodeResult: NodeExecutionResult = {
				nodeId: node.id,
				status: 'skipped',
				durationMs: 0,
				startedAt: nodeStartedAt.toISOString()
			};
			ctx.nodeResults.set(node.id, nodeResult);
			skippedNodes.add(node.id);
			ctx.log(node.id, `Skipped (inactive branch)`);
			continue;
		}

		// Get executor for this node type
		const executor = EXECUTORS[node.type];
		if (!executor) {
			const nodeResult: NodeExecutionResult = {
				nodeId: node.id,
				status: 'error',
				input,
				durationMs: Date.now() - nodeStartedAt.getTime(),
				startedAt: nodeStartedAt.toISOString(),
				completedAt: new Date().toISOString(),
				error: `No executor for node type: ${node.type}`
			};
			ctx.nodeResults.set(node.id, nodeResult);
			hasErrors = true;
			continue;
		}

		// Execute the node
		try {
			ctx.log(node.id, `Executing ${node.type} "${node.label}"`);
			const output = await executor(node, input, ctx);
			const completedAt = new Date();

			const nodeResult: NodeExecutionResult = {
				nodeId: node.id,
				status: 'success',
				output,
				input,
				durationMs: completedAt.getTime() - nodeStartedAt.getTime(),
				startedAt: nodeStartedAt.toISOString(),
				completedAt: completedAt.toISOString()
			};
			ctx.nodeResults.set(node.id, nodeResult);
			ctx.log(node.id, `Completed in ${nodeResult.durationMs}ms`);
		} catch (err) {
			const completedAt = new Date();
			const errorMessage = err instanceof Error ? err.message : String(err);

			const nodeResult: NodeExecutionResult = {
				nodeId: node.id,
				status: 'error',
				input,
				durationMs: completedAt.getTime() - nodeStartedAt.getTime(),
				startedAt: nodeStartedAt.toISOString(),
				completedAt: completedAt.toISOString(),
				error: errorMessage
			};
			ctx.nodeResults.set(node.id, nodeResult);
			hasErrors = true;
			ctx.log(node.id, `Error: ${errorMessage}`);

			// Don't abort the whole run - downstream nodes will be skipped
			// if they depend on this node's output
		}
	}

	// Build final run result
	const completedAt = new Date();
	const nodeResults: Record<string, NodeExecutionResult> = {};
	for (const [nodeId, result] of ctx.nodeResults) {
		nodeResults[nodeId] = result;
	}

	// Determine overall status
	const allSkipped = Object.values(nodeResults).every((r) => r.status === 'skipped');
	const allSuccess = Object.values(nodeResults).every(
		(r) => r.status === 'success' || r.status === 'skipped'
	);

	let status: RunStatus;
	if (allSkipped) {
		status = 'failed';
	} else if (allSuccess) {
		status = 'success';
	} else if (hasErrors) {
		// Some succeeded, some failed
		const anySuccess = Object.values(nodeResults).some((r) => r.status === 'success');
		status = anySuccess ? 'partial' : 'failed';
	} else {
		status = 'success';
	}

	const run: WorkflowRun = {
		id: runId,
		workflowId: workflow.id,
		trigger,
		status,
		startedAt,
		completedAt: completedAt.toISOString(),
		durationMs: completedAt.getTime() - new Date(startedAt).getTime(),
		nodeResults
	};

	// Save run to disk
	await saveRun(run);

	return run;
}
