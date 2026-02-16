/**
 * Shared API Response Types
 *
 * Centralized type definitions for all IDE API responses.
 * Import these types in components for better type safety and IDE support.
 *
 * @example
 * import type { Agent, Task, AgentsApiResponse } from '$lib/types/api.types';
 */

// =============================================================================
// CORE ENTITY TYPES
// =============================================================================

/**
 * Agent activity event from Agent Mail logs
 */
export interface AgentActivity {
	ts: string;
	agent: string;
	type: 'command' | 'prompt' | 'tool' | 'status';
	preview?: string;
	content?: string;
	cmd?: string;
	task?: string;
	tool?: string;
	file?: string;
	status?: string;
}

/**
 * Registered agent with stats
 */
export interface Agent {
	id: number;
	name: string;
	program: string;
	model: string;
	task_description: string;
	last_active_ts: string;
	task_count: number;
	open_tasks: number;
	in_progress_tasks: number;
	active: boolean;
	hasSession?: boolean;  // True if agent has an active tmux session (jat-{name})
	activities?: AgentActivity[];
	current_activity?: AgentActivity | null;
}

/**
 * Task dependency reference
 */
export interface TaskDependency {
	id: string;
	title: string;
	status: string;
	priority: number;
}

/**
 * JAT task
 */
export interface Task {
	id: string;
	title: string;
	description: string;
	status: 'open' | 'in_progress' | 'blocked' | 'closed';
	priority: number;
	issue_type: 'task' | 'bug' | 'feature' | 'epic' | 'chore';
	project: string;
	assignee?: string;
	labels: string[];
	depends_on?: TaskDependency[];
	blocked_by?: TaskDependency[];
	command?: string | null;
	agent_program?: string | null;
	model?: string | null;
	schedule_cron?: string | null;
	next_run_at?: string | null;
	due_date?: string | null;
	created_ts?: string;
	updated_ts?: string;
}

/**
 * Agent inbox message
 */
export interface InboxMessage {
	id: number;
	from_agent: string;
	to_agent: string;
	subject: string;
	body: string;
	thread_id?: string;
	priority: 'low' | 'normal' | 'high' | 'urgent';
	sent_ts: string;
	read_ts?: string;
	acked_ts?: string;
	requires_ack: boolean;
}

// =============================================================================
// TOKEN USAGE TYPES
// =============================================================================

/**
 * Token usage breakdown
 */
export interface TokenUsage {
	input_tokens: number;
	cache_creation_input_tokens: number;
	cache_read_input_tokens: number;
	output_tokens: number;
	total_tokens: number;
	cost: number;
	sessionCount: number;
}

/**
 * Agent usage for a time range
 */
export interface AgentUsage {
	today: TokenUsage;
	week: TokenUsage;
}

/**
 * Agent with usage data
 */
export interface AgentWithUsage extends Agent {
	usage?: AgentUsage;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

/**
 * Task statistics summary
 */
export interface TaskStats {
	total: number;
	open: number;
	in_progress: number;
	blocked: number;
	closed: number;
	by_priority: {
		p0: number;
		p1: number;
		p2: number;
		p3: number;
		p4: number;
	};
}

/**
 * API metadata
 */
export interface ApiMeta {
	poll_interval_ms: number;
	data_sources: string[];
	cache_ttl_ms: number;
}

/**
 * GET /api/agents response
 */
export interface AgentsApiResponse {
	agents: Agent[];
	tasks: Task[];
	unassigned_tasks: Task[];
	task_stats: TaskStats;
	tasks_with_deps_count: number;
	tasks_with_deps: Task[];
	timestamp: string;
	meta: ApiMeta;
}

/**
 * GET /api/agents/[name]/usage response
 */
export interface AgentUsageApiResponse {
	agent: string;
	range: 'today' | 'week' | 'all';
	usage: TokenUsage;
	cached: boolean;
	timestamp: string;
}

/**
 * GET /api/agents/[name]/inbox response
 */
export interface InboxApiResponse {
	agent: string;
	messages: InboxMessage[];
	unread_count: number;
}

/**
 * GET /api/tasks response
 */
export interface TasksApiResponse {
	tasks: Task[];
	total: number;
	filtered: number;
}

/**
 * GET /api/tasks/[id] response
 */
export interface TaskDetailApiResponse {
	task: Task;
	history?: Array<{
		ts: string;
		action: string;
		actor: string;
		details?: string;
	}>;
}

/**
 * Bulk operation response
 */
export interface BulkApiResponse {
	success: string[];
	failed: Array<{
		id: string;
		error: string;
	}>;
	total: number;
	succeeded: number;
}

/**
 * Generic error response
 */
export interface ApiErrorResponse {
	error: string;
	details?: string;
	code?: string;
}

// =============================================================================
// SPARKLINE TYPES
// =============================================================================

/**
 * Single sparkline data point
 */
export interface SparklinePoint {
	date: string;
	tokens: number;
	cost?: number;
}

/**
 * Multi-project sparkline data
 */
export interface MultiProjectSparklineData {
	[project: string]: SparklinePoint[];
}

/**
 * GET /api/agents/sparkline response
 */
export interface SparklineApiResponse {
	agent?: string;
	range: string;
	data: SparklinePoint[] | MultiProjectSparklineData;
	multiProject?: boolean;
	timestamp: string;
}
