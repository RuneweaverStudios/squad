/**
 * Automation Configuration
 *
 * Default values and preset library for the session automation rules system.
 *
 * @see ide/src/lib/types/automation.ts for type definitions
 */

import type {
	AutomationConfig,
	AutomationPreset,
	RuleCategory
} from '$lib/types/automation';

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Default global automation configuration
 */
export const DEFAULT_AUTOMATION_CONFIG: AutomationConfig = {
	enabled: true,
	maxActionsPerMinute: 30,
	defaultCooldownSeconds: 30,
	maxActivityEvents: 100,
	showNotifications: true,
	debugLogging: false
};

// =============================================================================
// CATEGORY METADATA
// =============================================================================

/**
 * Metadata for rule categories (for UI display)
 */
export const RULE_CATEGORY_META: Record<
	RuleCategory,
	{ label: string; description: string; icon: string; color: string }
> = {
	recovery: {
		label: 'Recovery',
		description: 'Auto-recover from API errors, rate limits, and transient failures',
		icon: 'M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903m-2.019 8.924a7.5 7.5 0 01-12.548 3.364L2.536 18.982m0-10.5L.5 10.5l2.036-2.036m0 10.536L.5 17l2.036 2.036M19.5 10.5l2.036-2.036m0 10.536l2.036 2.036M21.5 17l-2.036 2.036',
		color: 'text-success'
	},
	prompt: {
		label: 'Prompts',
		description: 'Auto-respond to yes/no prompts, continue confirmations, etc.',
		icon: 'M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z',
		color: 'text-info'
	},
	stall: {
		label: 'Stall Detection',
		description: 'Detect and recover from stalled or unresponsive sessions',
		icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
		color: 'text-warning'
	},
	notification: {
		label: 'Notifications',
		description: 'Send notifications for specific events without taking action',
		icon: 'M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0',
		color: 'text-secondary'
	},
	custom: {
		label: 'Custom',
		description: 'User-defined automation rules',
		icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z',
		color: 'text-accent'
	}
};

// =============================================================================
// PRESET LIBRARY
// =============================================================================

/**
 * Built-in automation presets
 * Users can enable these directly or clone and customize them
 */
export const AUTOMATION_PRESETS: AutomationPreset[] = [
	// -------------------------------------------------------------------------
	// Recovery Presets
	// -------------------------------------------------------------------------
	{
		id: 'preset-api-overloaded',
		name: 'API Overloaded Recovery',
		description: 'Automatically retry when Claude API returns overloaded error',
		category: 'recovery',
		rule: {
			name: 'API Overloaded Recovery',
			description: 'Retry when API is overloaded (529 error)',
			enabled: true,
			patterns: [
				{
					pattern: 'overloaded_error|529|API is temporarily overloaded',
					mode: 'regex',
					caseSensitive: false
				}
			],
			actions: [
				{
					type: 'notify_only',
					payload: 'API overloaded, waiting to retry...'
				},
				{
					type: 'send_keys',
					payload: 'Enter',
					delay: 5000
				}
			],
			cooldownSeconds: 30,
			maxTriggersPerSession: 10,
			category: 'recovery',
			priority: 100
		}
	},
	{
		id: 'preset-rate-limit',
		name: 'Rate Limit Recovery',
		description: 'Wait and retry when hitting API rate limits',
		category: 'recovery',
		rule: {
			name: 'Rate Limit Recovery',
			description: 'Wait and retry when rate limited (429 error)',
			enabled: true,
			patterns: [
				{
					pattern: 'rate_limit|429|Rate limit exceeded|too many requests',
					mode: 'regex',
					caseSensitive: false
				}
			],
			actions: [
				{
					type: 'notify_only',
					payload: 'Rate limited, waiting 60s before retry...'
				},
				{
					type: 'send_keys',
					payload: 'Enter',
					delay: 60000
				}
			],
			cooldownSeconds: 120,
			maxTriggersPerSession: 5,
			category: 'recovery',
			priority: 100
		}
	},
	{
		id: 'preset-network-error',
		name: 'Network Error Recovery',
		description: 'Retry on network connectivity issues',
		category: 'recovery',
		rule: {
			name: 'Network Error Recovery',
			description: 'Retry when network errors occur',
			enabled: false,
			patterns: [
				{
					pattern: 'ECONNRESET|ETIMEDOUT|ECONNREFUSED|network error|connection refused',
					mode: 'regex',
					caseSensitive: false
				}
			],
			actions: [
				{
					type: 'notify_only',
					payload: 'Network error detected, retrying...'
				},
				{
					type: 'send_keys',
					payload: 'Enter',
					delay: 3000
				}
			],
			cooldownSeconds: 15,
			maxTriggersPerSession: 20,
			category: 'recovery',
			priority: 90
		}
	},
	{
		id: 'preset-yolo-accept',
		name: 'YOLO Mode Auto-Accept',
		description: 'Automatically accept the --dangerously-skip-permissions prompt for first-time users',
		category: 'recovery',
		rule: {
			name: 'YOLO Mode Auto-Accept',
			description: 'Auto-accept bypass permissions mode on first run (option 2 is pre-selected)',
			enabled: true,
			patterns: [
				{
					pattern: 'Claude Code running in Bypass Permissions mode|Yes, I accept|Do you wish to proceed\\?',
					mode: 'regex',
					caseSensitive: false
				}
			],
			actions: [
				{
					type: 'notify_only',
					payload: 'YOLO mode acceptance detected, auto-accepting...'
				},
				{
					type: 'send_keys',
					payload: 'Enter',
					delay: 1000
				}
			],
			cooldownSeconds: 60,
			maxTriggersPerSession: 2,
			category: 'recovery',
			priority: 95
		}
	},

	// -------------------------------------------------------------------------
	// Prompt Response Presets
	// -------------------------------------------------------------------------
	{
		id: 'preset-yes-continue',
		name: 'Auto-Continue Prompts',
		description: 'Automatically press Enter on "Press Enter to continue" prompts',
		category: 'prompt',
		rule: {
			name: 'Auto-Continue Prompts',
			description: 'Press Enter on continue prompts',
			enabled: false,
			patterns: [
				{
					pattern: 'Press Enter to continue|press enter to proceed',
					mode: 'regex',
					caseSensitive: false
				}
			],
			actions: [
				{
					type: 'send_keys',
					payload: 'Enter',
					delay: 500
				}
			],
			cooldownSeconds: 5,
			maxTriggersPerSession: 50,
			category: 'prompt',
			priority: 50
		}
	},
	{
		id: 'preset-retry-prompt',
		name: 'Auto-Retry on Failure',
		description: 'Automatically select retry when tool execution fails',
		category: 'prompt',
		rule: {
			name: 'Auto-Retry on Failure',
			description: 'Select retry option when prompted',
			enabled: false,
			patterns: [
				{
					pattern: 'Would you like to retry\\?|Retry\\?|Try again\\?',
					mode: 'regex',
					caseSensitive: false
				}
			],
			actions: [
				{
					type: 'send_text',
					payload: 'y',
					delay: 1000
				}
			],
			cooldownSeconds: 10,
			maxTriggersPerSession: 10,
			category: 'prompt',
			priority: 60
		}
	},
	{
		id: 'preset-auto-proceed',
		name: 'Auto-Proceed Confirmation',
		description: 'Automatically accept "Do you want to proceed?" prompts from AskUserQuestion tool',
		category: 'prompt',
		rule: {
			name: 'Auto-Proceed Confirmation',
			description: 'Auto-accept proceed confirmation dialogs (selects "Yes" option)',
			enabled: true,
			patterns: [
				{
					// Match "Do you want to proceed?" within Claude Code AskUserQuestion UI
					// The pattern matches the question followed by numbered Yes option
					// Note: ❯ or > indicates the cursor, 1. Yes is first option
					// Using [\s\S] for multiline matching (terminal output has newlines)
					pattern: 'Do you want to proceed\\?[\\s\\S]*?1\\.\\s*Yes',
					mode: 'regex',
					caseSensitive: false
				}
			],
			actions: [
				{
					type: 'notify_only',
					payload: 'Auto-accepting proceed confirmation...'
				},
				{
					type: 'send_keys',
					payload: 'Enter',
					delay: 500
				}
			],
			cooldownSeconds: 5,
			maxTriggersPerSession: 50,
			category: 'prompt',
			priority: 55
		}
	},

	{
		id: 'preset-auto-pause-after-reply',
		name: 'Auto-Pause After Reply',
		description:
			'Pause the agent session after it sends a reply via jat-signal, enabling conversational resume when the user responds',
		category: 'prompt',
		rule: {
			name: 'Auto-Pause After Reply',
			description:
				'Detects when an agent emits a reply signal and pauses the session so it can be resumed when the user responds',
			enabled: false,
			patterns: [
				{
					pattern: 'jat-signal reply',
					mode: 'contains',
					caseSensitive: false
				}
			],
			actions: [
				{
					type: 'notify_only',
					payload: 'Agent sent reply, pausing for conversational resume...'
				},
				{
					type: 'send_text',
					payload: '/jat:pause',
					delay: 3000
				}
			],
			cooldownSeconds: 10,
			maxTriggersPerSession: 50,
			category: 'prompt',
			priority: 45
		}
	},

	// -------------------------------------------------------------------------
	// Stall Detection Presets
	// -------------------------------------------------------------------------
	{
		id: 'preset-waiting-input',
		name: 'Waiting for Input Detection',
		description: 'Notify when session appears to be waiting for user input',
		category: 'stall',
		rule: {
			name: 'Waiting for Input Detection',
			description: 'Detect when Claude Code is waiting for input',
			enabled: true,
			patterns: [
				{
					// The ⎿ character is the Claude Code input prompt indicator
					pattern: '⎿',
					mode: 'string',
					caseSensitive: true
				}
			],
			actions: [
				{
					type: 'notify_only',
					payload: 'Session is waiting for user input'
				}
			],
			cooldownSeconds: 60,
			maxTriggersPerSession: 100,
			category: 'stall',
			priority: 30
		}
	},

	// -------------------------------------------------------------------------
	// Notification Presets
	// -------------------------------------------------------------------------
	{
		id: 'preset-task-complete',
		name: 'Task Completion Notification',
		description: 'Notify when an agent completes a task',
		category: 'notification',
		rule: {
			name: 'Task Completion Notification',
			description: 'Detect task completion signals',
			enabled: true,
			patterns: [
				{
					pattern: '✓ Task.*completed|jat-signal.*completed|Task closed successfully',
					mode: 'regex',
					caseSensitive: false
				}
			],
			actions: [
				{
					type: 'notify_only',
					payload: 'Task completed!'
				}
			],
			cooldownSeconds: 5,
			maxTriggersPerSession: 100,
			category: 'notification',
			priority: 20
		}
	},
	{
		id: 'preset-error-notification',
		name: 'Error Detection Notification',
		description: 'Notify when errors are detected in session output',
		category: 'notification',
		rule: {
			name: 'Error Detection Notification',
			description: 'Detect error patterns in output',
			enabled: false,
			patterns: [
				{
					pattern: 'Error:|FATAL:|CRITICAL:|Unhandled exception',
					mode: 'regex',
					caseSensitive: false
				}
			],
			actions: [
				{
					type: 'notify_only',
					payload: 'Error detected in session output'
				}
			],
			cooldownSeconds: 30,
			maxTriggersPerSession: 50,
			category: 'notification',
			priority: 40
		}
	}
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get a preset by ID
 */
export function getPresetById(presetId: string): AutomationPreset | undefined {
	return AUTOMATION_PRESETS.find(p => p.id === presetId);
}

/**
 * Get all presets in a category
 */
export function getPresetsByCategory(category: RuleCategory): AutomationPreset[] {
	return AUTOMATION_PRESETS.filter(p => p.category === category);
}

/**
 * Generate a unique rule ID
 */
export function generateRuleId(): string {
	return `rule-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a new rule from a preset
 */
export function createRuleFromPreset(preset: AutomationPreset): import('$lib/types/automation').AutomationRule {
	return {
		id: generateRuleId(),
		...preset.rule,
		isPreset: true,
		presetId: preset.id
	};
}
