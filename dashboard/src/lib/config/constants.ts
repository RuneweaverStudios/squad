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
// HELPER TYPE EXPORTS
// =============================================================================

export type AgentStatus = 'live' | 'working' | 'active' | 'idle' | 'offline';
