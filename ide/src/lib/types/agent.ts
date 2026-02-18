/**
 * Unified Agent Types
 *
 * Consolidated type definitions for the UnifiedAgentCard component.
 * Combines types from api.types.ts with new unified state types.
 *
 * @see docs/unified-agent-card-refactor-plan.md
 */

import type { Agent, Task, TokenUsage, AgentUsage, SparklinePoint } from './api.types';

// Re-export core types for convenience
export type { Agent, Task, TokenUsage, AgentUsage, SparklinePoint };

// =============================================================================
// DISPLAY MODE TYPES
// =============================================================================

/**
 * Display modes for UnifiedAgentCard
 *
 * - mini: Minimal display for kanban swimlane items
 * - compact: Summary card with actions (kanban cards)
 * - standard: Full card without terminal (agent grid)
 * - expanded: Full terminal view (work sessions)
 */
export type DisplayMode = 'mini' | 'compact' | 'standard' | 'expanded';

/**
 * Configuration for what to show in each display mode
 */
export interface DisplayModeConfig {
	showAvatar: boolean;
	showStateBadge: boolean;
	showTask: boolean;
	showTaskDetails: boolean; // description, labels
	showQueue: boolean;
	showTerminal: boolean;
	showInput: boolean;
	showQuestionUI: boolean;
	showTokenUsage: boolean;
	showSparkline: boolean;
	showActivityFeed: boolean;
	showSessionControls: boolean;
	showQuickActions: boolean;
	allowResize: boolean;
	allowDragDrop: boolean; // queue drag-drop
}

// =============================================================================
// CONNECTION STATE
// =============================================================================

/**
 * Connection state - is the tmux session alive?
 *
 * - connected: Session exists and is responsive
 * - disconnected: Session lost unexpectedly (was active recently)
 * - offline: No session (expected state when not working)
 */
export type ConnectionState = 'connected' | 'disconnected' | 'offline';

// =============================================================================
// ACTIVITY STATE (SESSION STATE)
// =============================================================================

/**
 * Activity state - what is the agent doing?
 *
 * Detected from output parsing when connected,
 * inferred from timestamps when disconnected.
 */
export type ActivityState =
	| 'starting' // Session just created, initializing
	| 'working' // Actively coding
	| 'needs-input' // Waiting for user response
	| 'ready-for-review' // Asking to mark complete
	| 'completing' // Running /squad:complete
	| 'completed' // Task finished
	| 'polishing' // Post-completion follow-up tweaks
	| 'idle'; // No active task

// =============================================================================
// UNIFIED AGENT STATE
// =============================================================================

/**
 * Unified agent state combining connection + activity
 */
export interface UnifiedAgentState {
	// Core state
	connection: ConnectionState;
	activity: ActivityState;

	// Derived convenience properties
	isOnline: boolean; // connection === 'connected'
	isWorking: boolean; // activity === 'working'
	isBlocked: boolean; // activity === 'needs-input'
	needsAttention: boolean; // needs-input || ready-for-review
	canInteract: boolean; // isOnline && activity !== 'completing'
	canAssignTasks: boolean; // isOnline && (idle || completed)

	// For UI display
	stateLabel: string; // "Working", "Needs Input", etc.
	stateIcon: string; // SVG path or icon identifier
	stateColor: string; // oklch color
	statePulse: boolean; // Should badge pulse?
}

// =============================================================================
// UNIFIED AGENT CARD PROPS
// =============================================================================

/**
 * Input type for terminal input
 */
export type InputType = 'text' | 'key' | 'paste' | 'image';

/**
 * Props for UnifiedAgentCard component
 */
export interface UnifiedAgentCardProps {
	// Required
	agent: Agent;
	mode: DisplayMode;

	// Optional data (mode determines what's used)
	tasks?: Task[]; // For queue display
	allTasks?: Task[]; // For conflict detection
	output?: string; // Terminal output
	lastCompletedTask?: Task; // For completion state
	sparklineData?: SparklinePoint[];
	usage?: AgentUsage;

	// Event handlers
	onTaskClick?: (taskId: string) => void;
	onTaskAssign?: (taskId: string, agentName: string) => Promise<void>;
	onKillSession?: () => void;
	onInterrupt?: () => void;
	onContinue?: () => void;
	onSendInput?: (input: string, type: InputType) => Promise<void>;
	onAttachTerminal?: () => void;
	onDismiss?: () => void;

	// Drag-drop
	draggedTaskId?: string | null;

	// Display options
	isHighlighted?: boolean;
	cardWidth?: number;
	onWidthChange?: (width: number) => void;
	class?: string;
}

// =============================================================================
// AGENT DATA EXTENSIONS
// =============================================================================

/**
 * Extended agent data with computed state
 */
export interface AgentWithState extends Agent {
	unifiedState: UnifiedAgentState;
	output?: string;
	usage?: AgentUsage;
	sparklineData?: SparklinePoint[];
}

/**
 * Work session data (from /api/work)
 */
export interface WorkSession {
	session: string; // tmux session name
	agent: string; // agent name
	task?: Task;
	output?: string;
	lastCompletedTask?: Task;
	usage?: AgentUsage;
	sparklineData?: SparklinePoint[];
}

// =============================================================================
// CONFLICT DETECTION TYPES
// =============================================================================

/**
 * Result of conflict detection
 */
export interface ConflictResult {
	hasConflict: boolean;
	reasons: string[];
}

/**
 * Dependency block result
 */
export interface DependencyBlockResult {
	isBlocked: boolean;
	blockingTask?: Task;
	blockingReason?: string;
}

// =============================================================================
// QUESTION UI TYPES
// =============================================================================

/**
 * Option in a question
 */
export interface QuestionOption {
	label: string;
	description?: string;
}

/**
 * Question data from Claude Code
 */
export interface QuestionData {
	questions: Array<{
		question: string;
		header?: string;
		multiSelect: boolean;
		options: QuestionOption[];
	}>;
	timestamp?: string;
}

// =============================================================================
// WORKFLOW COMMAND TYPES
// =============================================================================

/**
 * Workflow command button
 */
export interface WorkflowCommand {
	id: string;
	label: string;
	command: string;
	variant: 'success' | 'warning' | 'error' | 'info' | 'default';
	icon?: string;
}
