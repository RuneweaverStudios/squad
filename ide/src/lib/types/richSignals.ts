/**
 * Rich Signal Types
 *
 * Type definitions for the rich signal system that transforms signals from
 * thin state changes into rich, structured payloads enabling interactive IDE UI.
 *
 * @see shared/rich-signals-plan.md for design documentation
 * @see shared/signals.md for signal system overview
 */

import type { SuggestedTask, HumanAction, QualitySignals, CrossAgentIntel } from './signals';

// =============================================================================
// WORKING SIGNAL
// =============================================================================

/**
 * Rich working signal emitted when agent starts work on a task.
 *
 * Contains full task context, work plan, and baseline for rollback.
 *
 * @example
 * ```bash
 * jat-signal working '{
 *   "taskId": "jat-abc",
 *   "taskTitle": "Add user authentication",
 *   "approach": "Implementing OAuth flow using Supabase",
 *   "expectedFiles": ["src/lib/auth/*", "src/routes/login/*"],
 *   ...
 * }'
 * ```
 */
export interface WorkingSignal {
	type: 'working';

	// Task context
	/** Task ID (e.g., "jat-abc") */
	taskId: string;
	/** Task title (e.g., "Add user authentication") */
	taskTitle: string;
	/** Full description from JAT Tasks */
	taskDescription: string;
	/** Priority level: 0-4 (P0=critical, P4=lowest) */
	taskPriority: number;
	/** Task type: feature, bug, task, chore, epic */
	taskType: string;

	// Work plan
	/** How the agent plans to implement (e.g., "Will implement OAuth flow using Supabase") */
	approach: string;
	/** Glob patterns of files expected to be modified */
	expectedFiles: string[];
	/** Estimated scope of work */
	estimatedScope: 'small' | 'medium' | 'large';

	// Baseline (for rollback)
	/** Git SHA where work starts */
	baselineCommit: string;
	/** Current git branch */
	baselineBranch: string;

	// Dependencies
	/** Task IDs this task depends on */
	dependencies: string[];
	/** Known issues or blockers */
	blockers?: string[];
}

// =============================================================================
// REVIEW SIGNAL
// =============================================================================

/**
 * File modification details for review signal.
 */
export interface FileModification {
	/** File path relative to project root */
	path: string;
	/** Type of change */
	changeType: 'added' | 'modified' | 'deleted';
	/** Lines added in this file */
	linesAdded: number;
	/** Lines removed from this file */
	linesRemoved: number;
	/** Optional description of what changed */
	description?: string;
	/** Optional localhost route to view this file's change (e.g., /dashboard, /api/users) */
	localhostRoute?: string;
}

/**
 * Key decision made during implementation.
 */
export interface KeyDecision {
	/** The decision that was made */
	decision: string;
	/** Why this decision was made */
	rationale: string;
}

/**
 * Commit information for review signal.
 */
export interface CommitInfo {
	/** Git commit SHA */
	sha: string;
	/** Commit message */
	message: string;
}

/**
 * Review focus item with optional links.
 *
 * Can be either a simple string or an object with links.
 */
export interface ReviewFocusItem {
	/** Description of the review focus area */
	text: string;
	/** Optional file path related to this focus area */
	filePath?: string;
	/** Optional localhost route to view this area (e.g., /dashboard, /login) */
	localhostRoute?: string;
	/** Optional line number in the file */
	line?: number;
}

/**
 * Rich review signal emitted when agent finishes coding and awaits human review.
 *
 * Contains work summary, file changes, quality status, and review guidance.
 *
 * @example
 * ```bash
 * jat-signal review '{
 *   "taskId": "jat-abc",
 *   "summary": ["Implemented OAuth flow", "Added login page"],
 *   "filesModified": [{"path": "src/lib/auth.ts", "changeType": "added", ...}],
 *   ...
 * }'
 * ```
 */
export interface ReviewSignal {
	type: 'review';

	// Task reference
	/** Task ID that was worked on */
	taskId: string;
	/** Task title */
	taskTitle: string;

	// Work summary
	/** Bullet points of what was accomplished */
	summary: string[];
	/** How the implementation was done */
	approach: string;
	/** Architectural choices made during implementation */
	keyDecisions: KeyDecision[];

	// Changes
	/** Files modified with details */
	filesModified: FileModification[];
	/** Total lines added across all files */
	totalLinesAdded: number;
	/** Total lines removed across all files */
	totalLinesRemoved: number;

	// Quality
	/** Test status */
	testsStatus: 'passing' | 'failing' | 'none' | 'skipped';
	/** Number of tests run (if applicable) */
	testsRun?: number;
	/** Number of tests passed (if applicable) */
	testsPassed?: number;
	/** Build status */
	buildStatus: 'clean' | 'warnings' | 'errors';
	/** Build warning messages (if any) */
	buildWarnings?: string[];

	// Review guidance
	/** Areas to focus review on - can be strings or objects with links */
	reviewFocus: (string | ReviewFocusItem)[];
	/** Known limitations or edge cases not handled */
	knownLimitations?: string[];

	// Commits
	/** Commits made during this work */
	commits: CommitInfo[];
}

// =============================================================================
// NEEDS INPUT SIGNAL
// =============================================================================

/**
 * Question option for needs_input signal.
 */
export interface QuestionOption {
	/** Unique identifier for this option */
	id: string;
	/** Display label */
	label: string;
	/** Optional value (alias for id, used by some signal formats) */
	value?: string;
	/** Description of what this option means */
	description: string;
	/** Whether this is the recommended option */
	recommended?: boolean;
	/** Trade-offs of choosing this option */
	tradeoffs?: string;
}

/**
 * Rich needs_input signal emitted when agent is blocked waiting for human input.
 *
 * Contains the question, context, options, and impact information.
 *
 * @example
 * ```bash
 * jat-signal needs_input '{
 *   "taskId": "jat-abc",
 *   "question": "Which authentication method should we use?",
 *   "options": [{"id": "oauth", "label": "OAuth", ...}],
 *   ...
 * }'
 * ```
 */
export interface NeedsInputSignal {
	type: 'needs_input';

	// Task reference
	/** Task ID being worked on */
	taskId: string;
	/** Task title */
	taskTitle: string;

	// Question
	/** The actual question being asked */
	question: string;
	/** Type of question */
	questionType: 'choice' | 'text' | 'approval' | 'clarification';

	// Context
	/** Why this question arose */
	context: string;
	/** Relevant code snippet (if applicable) */
	relevantCode?: string;
	/** Files related to the question */
	relevantFiles?: string[];

	// Options (for choice questions)
	/** Available options to choose from */
	options?: QuestionOption[];

	// Impact
	/** What happens based on the answer */
	impact: string;
	/** What is blocked until this is answered */
	blocking: string[];

	// Timeout
	/** What agent will do if no response is received */
	timeoutAction?: string;
	/** Minutes until timeout action is taken */
	timeoutMinutes?: number;
}

// =============================================================================
// COMPLETING SIGNAL
// =============================================================================

/**
 * Completion step identifier.
 */
export type CompletionStep = 'verifying' | 'committing' | 'closing' | 'releasing';

/**
 * Rich completing signal emitted during completion steps.
 *
 * Provides progress through the completion workflow.
 *
 * @example
 * ```bash
 * jat-signal completing '{
 *   "taskId": "jat-abc",
 *   "currentStep": "committing",
 *   "progress": 40,
 *   ...
 * }'
 * ```
 */
export interface CompletingSignal {
	type: 'completing';

	/** Task ID being completed */
	taskId: string;
	/** Task title */
	taskTitle: string;

	// Progress
	/** Current step in the completion workflow */
	currentStep: CompletionStep;
	/** Steps that have been completed */
	stepsCompleted: CompletionStep[];
	/** Steps remaining to be done */
	stepsRemaining: CompletionStep[];
	/** Overall progress percentage (0-100) */
	progress: number;

	// Current step details
	/** Human-readable description of current step */
	stepDescription: string;
	/** ISO timestamp when current step started */
	stepStartedAt: string;
}

// =============================================================================
// COMPLETED SIGNAL (Enhanced)
// =============================================================================

/**
 * Session statistics for completed signal.
 */
export interface SessionStats {
	/** Minutes spent working on the task */
	duration: number;
	/** API tokens consumed during the session */
	tokensUsed: number;
	/** Number of files modified */
	filesModified: number;
	/** Total lines changed (added + removed) */
	linesChanged: number;
	/** Number of commits created */
	commitsCreated: number;
}

/**
 * Enhanced completed signal with session statistics.
 *
 * Extends the existing CompletionBundle with additional metrics.
 *
 * @example
 * ```bash
 * jat-signal complete '{
 *   "taskId": "jat-abc",
 *   "agentName": "WisePrairie",
 *   "summary": ["Implemented feature", "Added tests"],
 *   "sessionStats": {"duration": 45, "tokensUsed": 15000, ...},
 *   ...
 * }'
 * ```
 */
export interface CompletedSignal {
	type: 'completed';

	// Existing fields (from CompletionBundle)
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
	suggestedTasks: SuggestedTask[]; // Now required
	/** Intel for other agents working in the codebase */
	crossAgentIntel?: CrossAgentIntel;

	// NEW: Session stats
	/** Statistics about the session */
	sessionStats: SessionStats;

	// NEW: Final state
	/** Git SHA of final state */
	finalCommit: string;
	/** Pull request link if one was created */
	prLink?: string;

	// Completion mode fields
	/** Completion mode determines task spawning behavior (Epic Swarm)
	 * - 'review_required': Don't auto-spawn next task
	 * - 'auto_proceed': Spawn next task from epic queue
	 *
	 * NOTE: Session lifecycle (kill) is tracked separately by IDE via pendingAutoKill store.
	 */
	completionMode?: 'review_required' | 'auto_proceed';
	/** Next task to spawn (if auto_proceed mode) */
	nextTaskId?: string;
	/** Title of the next task */
	nextTaskTitle?: string;

	// Task rename suggestion
	/** AI-suggested new title for the task (if task evolved/pivoted during work) */
	suggestedRename?: string;

	// AI-generated insights
	/** AI-suggested labels based on actual work done */
	suggestedLabels?: string[];
	/** Risk level assessment for the changes */
	riskLevel?: 'low' | 'medium' | 'high';
	/** List of breaking changes introduced (null/empty if none) */
	breakingChanges?: string[];
	/** Documentation that needs updating based on changes */
	documentationNeeds?: string[];
}

// =============================================================================
// IDLE SIGNAL (Enhanced)
// =============================================================================

/**
 * Session summary for idle signal.
 */
export interface IdleSessionSummary {
	/** Task IDs completed this session */
	tasksCompleted: string[];
	/** Total minutes worked in this session */
	totalDuration: number;
	/** Total tokens used in this session */
	tokensUsed: number;
	/** Total files modified in this session */
	filesModified: number;
}

/**
 * Suggested next task for idle signal.
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
 * Emitted when session has no active task.
 *
 * @example
 * ```bash
 * jat-signal idle '{
 *   "sessionSummary": {"tasksCompleted": ["jat-abc"], "totalDuration": 120, ...},
 *   "suggestedNextTask": {"taskId": "jat-def", "title": "Add tests", ...},
 *   ...
 * }'
 * ```
 */
export interface IdleSignal {
	type: 'idle';

	// Session summary (if tasks were completed)
	/** Summary of work done this session */
	sessionSummary?: IdleSessionSummary;

	// Recommendations
	/** Suggested next task to work on */
	suggestedNextTask?: SuggestedNextTask;

	// Status
	/** Whether agent can accept new work */
	readyForWork: boolean;
	/** If not ready, why (e.g., "Waiting for PR review") */
	blockedReason?: string;
}

// =============================================================================
// STARTING SIGNAL (Enhanced)
// =============================================================================

/**
 * Enhanced starting signal with agent capabilities and context.
 *
 * Emitted when session initializes.
 *
 * @example
 * ```bash
 * jat-signal starting '{
 *   "agentName": "WisePrairie",
 *   "project": "jat",
 *   "model": "sonnet-4.5",
 *   ...
 * }'
 * ```
 */
export interface StartingSignal {
	type: 'starting';

	/** Agent name for this session */
	agentName: string;
	/** Project being worked on */
	project: string;
	/** Claude Code session ID */
	sessionId: string;
	/** Task ID if starting on a specific task */
	taskId?: string;
	/** Task title if starting on a specific task */
	taskTitle?: string;

	// Capabilities
	/** Model being used (e.g., "claude-opus-4-5-20251101") */
	model: string;
	/** Available tools in this session */
	tools: string[];

	// Context
	/** Current git branch */
	gitBranch: string;
	/** Whether working tree is clean */
	gitStatus: 'clean' | 'dirty';
	/** List of uncommitted files (if dirty) */
	uncommittedFiles?: string[];
}

// =============================================================================
// COMPACTING SIGNAL
// =============================================================================

/**
 * Compacting signal emitted when context is being summarized.
 *
 * Provides visibility into context compaction process.
 *
 * @example
 * ```bash
 * jat-signal compacting '{
 *   "reason": "Context limit approaching",
 *   "contextSizeBefore": 180000,
 *   "estimatedAfter": 50000,
 *   ...
 * }'
 * ```
 */
export interface CompactingSignal {
	type: 'compacting';

	/** Task ID if currently working on a task */
	taskId?: string;

	/** Why compaction is happening */
	reason: string;
	/** Token count before compaction */
	contextSizeBefore: number;
	/** Expected token count after compaction */
	estimatedAfter: number;
	/** Key context items being preserved */
	preserving: string[];
}

// =============================================================================
// PAUSED SIGNAL
// =============================================================================

/**
 * Paused signal emitted when a session is deliberately paused.
 *
 * Allows tracking of paused sessions in history/timeline.
 *
 * @example
 * ```bash
 * jat-signal paused '{
 *   "taskId": "jat-abc",
 *   "taskTitle": "Add authentication",
 *   "reason": "Waiting for design review",
 *   "resumable": true
 * }'
 * ```
 */
export interface PausedSignal {
	type: 'paused';

	/** Task ID that was being worked on */
	taskId: string;
	/** Task title */
	taskTitle?: string;
	/** Agent name */
	agentName?: string;
	/** Reason for pausing (optional) */
	reason?: string;
	/** Whether the session can be resumed */
	resumable: boolean;
	/** Session ID for resumption */
	sessionId?: string;
	/** Project name */
	project?: string;
}

// =============================================================================
// UNION TYPE
// =============================================================================

/**
 * Union type of all rich signal types.
 *
 * Use for type-safe signal handling:
 *
 * @example
 * ```typescript
 * function handleSignal(signal: RichSignal) {
 *   switch (signal.type) {
 *     case 'working':
 *       console.log(`Started ${signal.taskId}`);
 *       break;
 *     case 'review':
 *       console.log(`Ready for review: ${signal.summary.join(', ')}`);
 *       break;
 *     // ... other cases
 *   }
 * }
 * ```
 */
export type RichSignal =
	| WorkingSignal
	| ReviewSignal
	| NeedsInputSignal
	| CompletingSignal
	| CompletedSignal
	| IdleSignal
	| StartingSignal
	| CompactingSignal
	| PausedSignal;

/**
 * Type guard to check if a signal is a specific type.
 */
export function isWorkingSignal(signal: RichSignal): signal is WorkingSignal {
	return signal.type === 'working';
}

export function isReviewSignal(signal: RichSignal): signal is ReviewSignal {
	return signal.type === 'review';
}

export function isNeedsInputSignal(signal: RichSignal): signal is NeedsInputSignal {
	return signal.type === 'needs_input';
}

export function isCompletingSignal(signal: RichSignal): signal is CompletingSignal {
	return signal.type === 'completing';
}

export function isCompletedSignal(signal: RichSignal): signal is CompletedSignal {
	return signal.type === 'completed';
}

export function isIdleSignal(signal: RichSignal): signal is IdleSignal {
	return signal.type === 'idle';
}

export function isStartingSignal(signal: RichSignal): signal is StartingSignal {
	return signal.type === 'starting';
}

export function isCompactingSignal(signal: RichSignal): signal is CompactingSignal {
	return signal.type === 'compacting';
}

export function isPausedSignal(signal: RichSignal): signal is PausedSignal {
	return signal.type === 'paused';
}

/**
 * Check if a completed signal has auto-proceed enabled.
 * Auto-proceed signals have completionMode: 'auto_proceed'.
 */
export function isAutoProceedSignal(signal: RichSignal): signal is CompletedSignal {
	return signal.type === 'completed' && (signal as CompletedSignal).completionMode === 'auto_proceed';
}

// =============================================================================
// SIGNAL FORMAT
// =============================================================================

/**
 * All signals require JSON payloads.
 *
 * Signal format: [JAT-SIGNAL:<type>] <json-payload>
 * Example: jat-signal working '{"taskId":"jat-abc","taskTitle":"Add auth"}'
 *
 * There is no backward-compatible thin signal format.
 */
