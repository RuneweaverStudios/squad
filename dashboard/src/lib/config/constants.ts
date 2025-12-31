/**
 * Dashboard Configuration Constants
 *
 * Centralized configuration for timeouts, display limits, and thresholds.
 * Edit these values to tune dashboard behavior globally.
 */

// =============================================================================
// TIMEOUTS (in milliseconds)
// =============================================================================

export const TIMEOUTS = {
	/**
	 * How long to show success feedback after an action completes
	 * (e.g., "Task assigned!" message)
	 */
	SUCCESS_DISPLAY_MS: 2000,

	/**
	 * How long to show error messages before auto-clearing
	 */
	ERROR_DISPLAY_MS: 5000,

	/**
	 * Maximum time to wait for API assignment before timeout error
	 */
	ASSIGNMENT_TIMEOUT_MS: 30000,

	/**
	 * Polling interval for sparkline data refresh
	 */
	SPARKLINE_POLL_MS: 30000,

	/**
	 * Polling interval for Claude usage bar refresh
	 */
	USAGE_POLL_MS: 30000,

	/**
	 * Polling interval for agent data refresh
	 */
	AGENT_POLL_MS: 5000,

	/**
	 * Delay before retrying failed API requests
	 */
	RETRY_DELAY_MS: 1000
} as const;

// =============================================================================
// STATUSLINE CONFIGURATION
// =============================================================================

export const STATUSLINE = {
	/**
	 * Maximum characters for task title before truncation
	 * Final display: TASK_TITLE_MAX_CHARS + "..." (3 chars)
	 */
	TASK_TITLE_MAX_CHARS: 33,

	/**
	 * Truncation suffix appended to long titles
	 */
	TRUNCATION_SUFFIX: '...'
} as const;

// =============================================================================
// DISPLAY LIMITS
// =============================================================================

export const DISPLAY_LIMITS = {
	/**
	 * Maximum labels to show on task cards before "+N more"
	 */
	LABELS_PER_TASK: 2,

	/**
	 * Maximum labels in queue items before "+N more"
	 */
	LABELS_PER_QUEUE_ITEM: 3,

	/**
	 * Maximum queued tasks visible in AgentCard before "+N more"
	 */
	QUEUED_TASKS_PER_AGENT: 3,

	/**
	 * Maximum file locks to show in AgentCard before "+N more"
	 */
	LOCKS_PER_AGENT: 2,

	/**
	 * Maximum activities to show in history view
	 */
	ACTIVITIES_PER_AGENT: 10,

	/**
	 * Maximum top agents to show in usage summary
	 */
	TOP_AGENTS_COUNT: 3
} as const;

// =============================================================================
// AGENT STATUS THRESHOLDS (in milliseconds)
// =============================================================================

export const AGENT_STATUS_THRESHOLDS = {
	/**
	 * LIVE status: Agent responded within this time
	 * Very recent activity, likely currently working
	 */
	LIVE_MS: 60000, // 1 minute

	/**
	 * WORKING status: Agent has task and was active within this time
	 * Has active work and recent activity
	 */
	WORKING_MS: 600000, // 10 minutes

	/**
	 * IDLE status: Agent was active within this time but no current work
	 * Available for tasks
	 */
	IDLE_MS: 3600000, // 1 hour

	/**
	 * DISCONNECTED status: Session gone but activity within this time
	 * Indicates unexpected session loss (vs intentional shutdown)
	 */
	DISCONNECTED_MS: 900000, // 15 minutes

	/**
	 * STALE status: Activity older than STALE_MINUTES considered stale
	 * Used for highlighting stale activities
	 */
	STALE_MINUTES: 5
} as const;

// =============================================================================
// FILTER DEFAULTS
// =============================================================================

export const FILTER_DEFAULTS = {
	/**
	 * Default priorities selected in task views
	 * All priorities (0-3) selected by default
	 */
	PRIORITIES: ['0', '1', '2', '3'],

	/**
	 * Default statuses selected in TaskTable
	 */
	TASK_TABLE_STATUSES: ['open', 'in_progress'],

	/**
	 * Default statuses selected in TaskQueue
	 */
	TASK_QUEUE_STATUSES: ['open']
} as const;

// =============================================================================
// API & RETRY CONFIGURATION
// =============================================================================

export const API_CONFIG = {
	/**
	 * Maximum retry attempts for failed API calls
	 */
	MAX_RETRIES: 3,

	/**
	 * Base delay between retries (doubles each attempt)
	 */
	RETRY_DELAY_BASE_MS: 1000
} as const;

// =============================================================================
// UI ANIMATION DELAYS
// =============================================================================

export const ANIMATIONS = {
	/**
	 * Delay before auto-closing success modals/toasts
	 */
	SUCCESS_CLOSE_DELAY_MS: 2000,

	/**
	 * Delay before clearing error state
	 */
	ERROR_CLEAR_DELAY_MS: 5000
} as const;

// =============================================================================
// JAT DEFAULTS (stored in ~/.config/jat/projects.json)
// =============================================================================

export const JAT_DEFAULTS = {
	/** Terminal emulator for new sessions */
	terminal: 'alacritty',
	/** Code editor command */
	editor: 'code',
	/** Path to JAT tools directory */
	tools_path: '~/.local/bin',
	/** CLI flags passed to claude command */
	claude_flags: '--dangerously-skip-permissions',
	/** Default Claude model: opus, sonnet, haiku */
	model: 'opus',
	/** Seconds between batch agent spawns */
	agent_stagger: 15,
	/** Seconds to wait for Claude TUI to start */
	claude_startup_timeout: 20,
	/** Maximum concurrent tmux sessions */
	max_sessions: 12,
	/** Default number of agents to spawn in swarm */
	default_agent_count: 4,
	/** Default height for sessions panel on /work page (px) */
	projects_session_height: 400,
	/** Default height for tasks panel on /work page (px) */
	projects_task_height: 400,
	/** Auto-cleanup completed sessions (disabled by default - powerful feature) */
	auto_kill_enabled: false,
	/** Seconds to wait before killing completed session */
	auto_kill_delay: 60,
	/** Per-priority auto-kill enabled flags (P0=critical, P4=lowest) */
	auto_kill_p0: false,
	auto_kill_p1: false,
	auto_kill_p2: false,
	auto_kill_p3: true,
	auto_kill_p4: true
} as const;

// =============================================================================
// SIGNAL TTL CONFIGURATION
// =============================================================================

export const SIGNAL_TTL = {
	/**
	 * Short TTL for transitional states (working, starting, idle)
	 * These states change frequently as agent works, so stale signals expire quickly
	 */
	TRANSIENT_MS: 60 * 1000, // 1 minute

	/**
	 * Long TTL for states waiting on human action
	 * User may step away - signal should persist until they return
	 */
	USER_WAITING_MS: 30 * 60 * 1000, // 30 minutes

	/**
	 * States that use the longer USER_WAITING_MS TTL
	 * - completed: waiting for user to acknowledge/cleanup
	 * - review: waiting for user to approve and run /jat:complete
	 * - needs_input: waiting for user to answer a question
	 */
	USER_WAITING_STATES: ['completed', 'review', 'needs_input'] as const
} as const;

// =============================================================================
// AUTO-KILL CONFIGURATION
// =============================================================================

export const AUTO_KILL = {
	/**
	 * Enable auto-kill for completed sessions globally.
	 * When true, sessions will be automatically terminated after completion.
	 */
	ENABLED: true,

	/**
	 * Default delay in seconds before killing a completed session.
	 * Set to 0 for immediate kill (not recommended - allows no review time).
	 * Set to null to disable auto-kill (session persists until manually closed).
	 */
	DEFAULT_DELAY_SECONDS: 60,

	/**
	 * Per-priority delay overrides (in seconds).
	 * Higher priority tasks may warrant more review time before cleanup.
	 * Set to null to use DEFAULT_DELAY_SECONDS for that priority.
	 * Set to 0 for immediate kill (no delay).
	 *
	 * Priority meanings:
	 * - P0: Critical/urgent - longer review time
	 * - P1: High priority - moderate review time
	 * - P2: Medium priority - standard review time
	 * - P3: Low priority - quick cleanup
	 */
	PRIORITY_DELAYS: {
		0: 90,   // P0: 90 seconds - more time to review critical work
		1: 75,   // P1: 75 seconds
		2: 60,   // P2: 60 seconds (same as default)
		3: 30    // P3: 30 seconds - quick tasks, quick cleanup
	} as Record<number, number | null>,

	/**
	 * Maximum delay allowed (in seconds).
	 * Prevents excessively long delays from being set.
	 */
	MAX_DELAY_SECONDS: 300 // 5 minutes
} as const;

// =============================================================================
// HELPER TYPE EXPORTS
// =============================================================================

export type AgentStatus = 'live' | 'working' | 'active' | 'idle' | 'offline';
