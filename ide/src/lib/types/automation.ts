/**
 * Automation Types
 *
 * Type definitions for the session automation rules system.
 * Enables pattern detection in terminal output and automated action execution.
 *
 * @see ide/src/lib/config/automationConfig.ts for default values
 * @see ide/src/lib/stores/automationRules.svelte.ts for store
 * @see ide/src/lib/utils/automationEngine.ts for engine
 */

// =============================================================================
// PATTERN TYPES
// =============================================================================

/**
 * Pattern matching mode for automation rules
 */
export type PatternMode = 'string' | 'regex';

/**
 * Pattern definition for matching terminal output
 */
export interface AutomationPattern {
	/** The pattern string (literal or regex) */
	pattern: string;
	/** How to match: 'string' for literal, 'regex' for regular expression */
	mode: PatternMode;
	/** Case sensitive matching (default: false) */
	caseSensitive?: boolean;
}

// =============================================================================
// ACTION TYPES
// =============================================================================

/**
 * Action types available for automation rules
 */
export type ActionType =
	| 'send_text'          // Send text to session (like typing)
	| 'send_keys'          // Send special keys (Enter, Escape, Tab)
	| 'tmux_command'       // Run arbitrary tmux command
	| 'signal'             // Emit jat-signal
	| 'notify_only'        // Show toast notification only
	| 'show_question_ui'   // Show custom question UI with options defined in the rule
	| 'run_command'        // Run a Claude agent slash command
	| 'execute_workflow';  // Execute a workflow by ID

/**
 * Special keys that can be sent via send_keys action
 */
export type SpecialKey =
	| 'Enter'
	| 'Escape'
	| 'Tab'
	| 'Up'
	| 'Down'
	| 'Left'
	| 'Right'
	| 'C-c'      // Ctrl+C
	| 'C-d'      // Ctrl+D
	| 'C-u';     // Ctrl+U

/**
 * Option for show_question_ui action
 */
export interface QuestionUIOption {
	/** Display label shown to user */
	label: string;
	/** Value sent to session when selected */
	value: string;
	/** Optional description */
	description?: string;
}

/**
 * Configuration for show_question_ui action
 */
export interface QuestionUIConfig {
	/** Question text to display */
	question: string;
	/** Type of question: choice (single select), confirm (yes/no), input (free text) */
	questionType: 'choice' | 'confirm' | 'input';
	/** Options for choice-type questions */
	options?: QuestionUIOption[];
	/** Optional timeout in seconds */
	timeout?: number;
}

/**
 * Action to execute when a pattern matches
 */
export interface AutomationAction {
	/** Type of action to perform */
	type: ActionType;

	/**
	 * Action payload (varies by type):
	 * - send_text: The text to send
	 * - send_keys: The special key to send
	 * - tmux_command: The tmux command (e.g., "send-keys -t {session} 'text'")
	 * - signal: The signal type and data (e.g., "working {\"taskId\":\"...\"}")
	 * - notify_only: The notification message
	 * - show_question_ui: JSON string of QuestionUIConfig (parsed at runtime)
	 * - run_command: The slash command to run (e.g., "/jat:complete" or "jat:start")
	 * - execute_workflow: The workflow ID to execute
	 */
	payload: string;

	/** Delay in milliseconds before executing action (default: 0) */
	delay?: number;

	/**
	 * Structured configuration for show_question_ui action type.
	 * When type is 'show_question_ui', this takes precedence over payload.
	 */
	questionUIConfig?: QuestionUIConfig;
}

// =============================================================================
// RULE TYPES
// =============================================================================

/**
 * Automation rule combining pattern matching with action execution
 */
export interface AutomationRule {
	/** Unique identifier for the rule */
	id: string;

	/** Human-readable name for the rule */
	name: string;

	/** Optional description of what this rule does */
	description?: string;

	/** Whether the rule is currently active */
	enabled: boolean;

	/** Pattern(s) to match against terminal output */
	patterns: AutomationPattern[];

	/** Action(s) to execute when pattern matches */
	actions: AutomationAction[];

	/** Only trigger for specific session names (glob patterns) */
	sessionFilter?: string[];

	/** Cooldown in seconds before rule can trigger again for same session */
	cooldownSeconds: number;

	/** Maximum number of times this rule can trigger per session (0 = unlimited) */
	maxTriggersPerSession: number;

	/** Category for organization (e.g., 'recovery', 'prompt', 'error') */
	category?: RuleCategory;

	/** Priority for ordering (higher = processed first) */
	priority: number;

	/** Whether this is a built-in preset (not user-editable) */
	isPreset?: boolean;

	/** Preset ID if this rule was cloned from a preset */
	presetId?: string;
}

/**
 * Categories for organizing automation rules
 */
export type RuleCategory =
	| 'recovery'    // Auto-recovery from errors (API errors, rate limits)
	| 'prompt'      // Auto-respond to prompts (y/n, continue, etc.)
	| 'stall'       // Detect and recover from stalled sessions
	| 'notification' // Notify user of events
	| 'custom';     // User-defined rules

// =============================================================================
// TRIGGER TRACKING
// =============================================================================

/**
 * Track rule trigger history for cooldowns and limits
 */
export interface RuleTriggerRecord {
	/** Rule ID */
	ruleId: string;

	/** Session name where rule triggered */
	sessionName: string;

	/** Timestamp of last trigger */
	lastTriggeredAt: number;

	/** Total trigger count for this session */
	triggerCount: number;
}

// =============================================================================
// ACTIVITY LOG TYPES
// =============================================================================

/**
 * Log entry for automation activity
 */
export interface AutomationActivityEvent {
	/** Unique ID for the event */
	id: string;

	/** Timestamp when event occurred */
	timestamp: number;

	/** Session name where activity occurred */
	sessionName: string;

	/** Agent name (if known) */
	agentName?: string;

	/** Rule that triggered */
	ruleId: string;

	/** Rule name for display */
	ruleName: string;

	/** The matched pattern */
	matchedPattern: string;

	/** The output text that triggered the match */
	matchedText: string;

	/** Action(s) that were executed */
	actionsExecuted: AutomationAction[];

	/** Whether actions succeeded */
	success: boolean;

	/** Error message if actions failed */
	error?: string;
}

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

/**
 * Global automation configuration
 */
export interface AutomationConfig {
	/** Master enable/disable switch */
	enabled: boolean;

	/** Maximum actions to execute per minute globally (rate limit) */
	maxActionsPerMinute: number;

	/** Default cooldown between same rule triggers (seconds) */
	defaultCooldownSeconds: number;

	/** Maximum activity events to keep in memory */
	maxActivityEvents: number;

	/** Whether to show toast notifications for triggered rules */
	showNotifications: boolean;

	/** Whether to log automation activity to console */
	debugLogging: boolean;
}

// =============================================================================
// STORE STATE TYPES
// =============================================================================

/**
 * State shape for automation rules store
 */
export interface AutomationRulesState {
	/** All automation rules (user-defined + presets) */
	rules: AutomationRule[];

	/** Global configuration */
	config: AutomationConfig;

	/** Active trigger records for cooldown tracking */
	triggerRecords: Map<string, RuleTriggerRecord>;

	/** Recent activity events for ActivityLog display */
	activityEvents: AutomationActivityEvent[];

	/** Whether the store has been initialized from localStorage */
	initialized: boolean;
}

// =============================================================================
// PRESET TYPES
// =============================================================================

/**
 * Preset library entry
 */
export interface AutomationPreset {
	/** Unique preset ID */
	id: string;

	/** Display name */
	name: string;

	/** Description of what this preset does */
	description: string;

	/** Category */
	category: RuleCategory;

	/** The preset rule definition (without id, which is generated) */
	rule: Omit<AutomationRule, 'id' | 'isPreset' | 'presetId'>;
}
