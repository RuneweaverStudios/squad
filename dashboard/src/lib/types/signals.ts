/**
 * Signal Types
 *
 * Type definitions for the jat-signal system used for agent-to-dashboard communication.
 * These types are used by components that display suggested tasks and human actions.
 *
 * @see shared/signals.md for signal system documentation
 */

// =============================================================================
// SUGGESTED TASK TYPES
// =============================================================================

/**
 * Suggested task from jat-signal tasks command.
 *
 * Agents can suggest tasks for creation via:
 *   jat-signal tasks '[{"type":"feature","title":"...","description":"...","priority":1}]'
 *
 * The dashboard receives this data via SSE and displays it in the SessionCard.
 */
export interface SuggestedTask {
	/** Optional ID if this references an existing task */
	id?: string;
	/** Task type: bug, feature, task, chore, epic */
	type: string;
	/** Task title */
	title: string;
	/** Task description */
	description: string;
	/** Priority level: 0-4 (P0=critical, P4=lowest) */
	priority: number;
	/** Optional reason why this task was suggested */
	reason?: string;
	/** Project identifier (e.g., 'jat', 'chimaro') */
	project?: string;
	/** Comma-separated labels */
	labels?: string;
	/** Task IDs this task depends on */
	depends_on?: string[];
	/** Parent epic ID - if set, task will be linked as a child of this epic */
	epicId?: string;
}

/**
 * Extended SuggestedTask with local UI state for selection and editing.
 * Used in SessionCard, SuggestedTasksSection, and SuggestedTasksModal.
 */
export interface SuggestedTaskWithState extends SuggestedTask {
	/** Whether this task is selected for creation */
	selected: boolean;
	/** Whether user has edited this task */
	edited: boolean;
	/** Local edits (if edited=true, these override the original values) */
	edits?: {
		type?: string;
		title?: string;
		description?: string;
		priority?: number;
		project?: string;
		labels?: string;
		depends_on?: string[];
	};
}

// =============================================================================
// HUMAN ACTION TYPES
// =============================================================================

/**
 * Human action from jat-signal action command.
 *
 * Agents can request human actions via:
 *   jat-signal action '{"title":"Review PR","items":["Check tests","Review code"]}'
 *
 * The dashboard displays these as a checklist on the SessionCard.
 */
export interface HumanAction {
	/** Action title */
	title: string;
	/** Action description */
	description?: string;
	/** Checklist items (if this is a multi-step action) */
	items?: string[];
}

// =============================================================================
// SIGNAL STATE TYPES
// =============================================================================

/**
 * Signal state values that can be set via jat-signal.
 * These map to SessionCard visual states.
 */
export type SignalState =
	| 'working'
	| 'needs_input'
	| 'review'
	| 'completed'
	| 'idle';

/**
 * Full signal data as returned by the signals API.
 */
export interface SignalData {
	/** Signal type: 'state', 'tasks', 'action', 'complete' */
	type: 'state' | 'tasks' | 'action' | 'complete';
	/** Signal data (varies by type) */
	data: SignalState | SuggestedTask[] | HumanAction | CompletionBundle;
	/** Timestamp when signal was received */
	timestamp: number;
	/** Task ID associated with the signal (for 'working' state) */
	taskId?: string;
}

// =============================================================================
// COMPLETION BUNDLE TYPES
// =============================================================================

/**
 * Quality signals from completed task.
 */
export interface QualitySignals {
	/** Test status */
	tests: 'passing' | 'failing' | 'none' | 'skipped';
	/** Build status */
	build: 'clean' | 'warnings' | 'errors';
	/** Note about pre-existing issues */
	preExisting?: string;
}

/**
 * Cross-agent intelligence shared after task completion.
 */
export interface CrossAgentIntel {
	/** Key files modified */
	files?: string[];
	/** Coding patterns/conventions to follow */
	patterns?: string[];
	/** Non-obvious issues or gotchas */
	gotchas?: string[];
}

/**
 * Full completion bundle from jat-signal complete command.
 *
 * This is the structured data agents emit when completing a task,
 * enabling the dashboard to render an interactive completion UI.
 *
 * Agents emit via:
 *   jat-signal complete '{"taskId":"...","agentName":"...","summary":[...],...}'
 */
export interface CompletionBundle {
	/** Task ID that was completed */
	taskId: string;
	/** Agent name that completed the task */
	agentName: string;
	/** Array of accomplishment bullet points */
	summary: string[];
	/** Quality signals (tests, build status) */
	quality: QualitySignals;
	/** Human actions required (manual steps for user) */
	humanActions?: HumanAction[];
	/** Follow-up tasks discovered during work */
	suggestedTasks?: SuggestedTask[];
	/** Intel for other agents working in the codebase */
	crossAgentIntel?: CrossAgentIntel;
}

// =============================================================================
// IDLE SIGNAL TYPES
// =============================================================================

/**
 * Session summary for idle signal.
 *
 * Provides a summary of what the agent accomplished during the session,
 * useful for dashboard display and analytics.
 */
export interface IdleSessionSummary {
	/** Task IDs completed during this session */
	tasksCompleted?: string[];
	/** Total minutes worked in this session */
	totalDuration?: number;
	/** Total API tokens used in this session */
	tokensUsed?: number;
	/** Total files modified in this session */
	filesModified?: number;
}

/**
 * Suggested next task for idle signal.
 *
 * When an agent becomes idle, it can recommend the next task to work on
 * based on its understanding of the codebase and task dependencies.
 */
export interface SuggestedNextTask {
	/** Task ID to work on next */
	taskId: string;
	/** Task title */
	title: string;
	/** Why this task is recommended next */
	reason: string;
}

/**
 * Enhanced idle signal with session summary and recommendations.
 *
 * Agents emit this when they become idle (no active task):
 *   jat-signal idle '{"readyForWork":true,"sessionSummary":{...},"suggestedNextTask":{...}}'
 *
 * The dashboard uses this to show:
 * - Whether the agent can accept new work
 * - What the agent accomplished in the session
 * - What task the agent recommends picking up next
 */
export interface IdleSignal {
	/** Whether agent can accept new work */
	readyForWork: boolean;
	/** Summary of what was accomplished in this session */
	sessionSummary?: IdleSessionSummary;
	/** Recommended next task to work on */
	suggestedNextTask?: SuggestedNextTask;
	/** If not ready, explanation of why (e.g., "Waiting for PR review") */
	blockedReason?: string;
}

// =============================================================================
// QUESTION SIGNAL TYPES
// =============================================================================

/**
 * Type of question being asked by an agent.
 */
export type QuestionType = 'choice' | 'confirm' | 'input';

/**
 * Single option for a question.
 *
 * Used in QuestionSignal to define selectable options for choice-type questions.
 */
export interface QuestionOption {
	/** Display label shown to user */
	label: string;
	/** Value returned when this option is selected */
	value: string;
	/** Optional description explaining what this option means */
	description?: string;
}

/**
 * Question signal emitted when agent needs user input.
 *
 * This is a structured representation of questions that agents ask during workflows.
 * The dashboard can use this to render rich question UIs instead of plain text prompts.
 *
 * Agents emit via:
 *   jat-signal question '{"question":"Which approach?","questionType":"choice","options":[...]}'
 *
 * @example Choice question
 * {
 *   question: "Which authentication method should we use?",
 *   questionType: "choice",
 *   options: [
 *     { label: "OAuth 2.0", value: "oauth", description: "Industry standard, supports SSO" },
 *     { label: "API Keys", value: "apikey", description: "Simple but less secure" }
 *   ]
 * }
 *
 * @example Confirm question
 * {
 *   question: "Should I proceed with the migration?",
 *   questionType: "confirm"
 * }
 *
 * @example Input question
 * {
 *   question: "What should the new component be named?",
 *   questionType: "input",
 *   timeout: 300
 * }
 */
export interface QuestionSignal {
	/** The question text being asked */
	question: string;
	/** Type of question: choice (select from options), confirm (yes/no), input (free text) */
	questionType: QuestionType;
	/** Available options for choice-type questions */
	options?: QuestionOption[];
	/** Optional timeout in seconds after which agent may take default action */
	timeout?: number;
}
