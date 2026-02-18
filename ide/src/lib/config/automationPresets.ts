/**
 * Automation Presets Library
 *
 * Curated preset packs that bundle related automation rules together.
 * Users can install entire packs with one click.
 *
 * @see ide/src/lib/types/automation.ts for type definitions
 * @see ide/src/lib/config/automationConfig.ts for individual presets
 */

import type { AutomationPreset, RuleCategory } from '$lib/types/automation';
import { generateRuleId } from './automationConfig';

// =============================================================================
// PRESET PACK TYPE
// =============================================================================

/**
 * A collection of related presets that can be installed together
 */
export interface PresetPack {
	/** Unique identifier for the pack */
	id: string;

	/** Display name */
	name: string;

	/** Short description of what the pack does */
	description: string;

	/** Longer description with use cases */
	longDescription: string;

	/** Primary category for the pack */
	category: RuleCategory;

	/** Icon SVG path (Heroicons) */
	icon: string;

	/** Color class for the pack card */
	color: 'success' | 'info' | 'warning' | 'error' | 'secondary' | 'accent';

	/** The presets included in this pack */
	presets: AutomationPreset[];

	/** Tags for filtering/search */
	tags: string[];

	/** Whether presets are enabled by default when pack is installed */
	enabledByDefault: boolean;
}

// =============================================================================
// ERROR RECOVERY PACK
// =============================================================================

const errorRecoveryPresets: AutomationPreset[] = [
	{
		id: 'pack-recovery-api-overloaded',
		name: 'API Overloaded Recovery',
		description: 'Automatically retry when Claude API returns overloaded error (529)',
		category: 'recovery',
		rule: {
			name: 'API Overloaded Recovery',
			description: 'Retry when API is overloaded (529 error). Waits 5 seconds before sending Enter to retry.',
			enabled: true,
			patterns: [
				{
					pattern: 'overloaded_error|529|API is temporarily overloaded|Service temporarily unavailable',
					mode: 'regex',
					caseSensitive: false
				}
			],
			actions: [
				{
					type: 'notify_only',
					payload: 'API overloaded, waiting 5s to retry...'
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
		id: 'pack-recovery-rate-limit',
		name: 'Rate Limit Recovery',
		description: 'Wait and retry when hitting API rate limits (429)',
		category: 'recovery',
		rule: {
			name: 'Rate Limit Recovery',
			description: 'Wait 60 seconds and retry when rate limited (429 error). Prevents hammering the API.',
			enabled: true,
			patterns: [
				{
					pattern: 'rate_limit|429|Rate limit exceeded|too many requests|quota exceeded',
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
		id: 'pack-recovery-network-error',
		name: 'Network Error Recovery',
		description: 'Retry on network connectivity issues',
		category: 'recovery',
		rule: {
			name: 'Network Error Recovery',
			description: 'Retry when network errors occur (ECONNRESET, ETIMEDOUT, etc.)',
			enabled: true,
			patterns: [
				{
					pattern: 'ECONNRESET|ETIMEDOUT|ECONNREFUSED|network error|connection refused|socket hang up|ENETUNREACH',
					mode: 'regex',
					caseSensitive: false
				}
			],
			actions: [
				{
					type: 'notify_only',
					payload: 'Network error detected, retrying in 3s...'
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
		id: 'pack-recovery-dormant-session',
		name: 'Dormant Session Recovery',
		description: 'Detect and nudge sessions that appear stuck or dormant',
		category: 'recovery',
		rule: {
			name: 'Dormant Session Recovery',
			description: 'Sends a gentle nudge when session output shows no activity for extended period',
			enabled: true,
			patterns: [
				{
					pattern: 'session.*dormant|connection.*idle|no activity detected|heartbeat.*missed',
					mode: 'regex',
					caseSensitive: false
				}
			],
			actions: [
				{
					type: 'notify_only',
					payload: 'Session appears dormant, nudging...'
				},
				{
					type: 'send_keys',
					payload: 'Enter',
					delay: 2000
				}
			],
			cooldownSeconds: 300,
			maxTriggersPerSession: 5,
			category: 'recovery',
			priority: 80
		}
	},
	{
		id: 'pack-recovery-context-exceeded',
		name: 'Context Window Recovery',
		description: 'Handle context window exceeded errors gracefully',
		category: 'recovery',
		rule: {
			name: 'Context Window Recovery',
			description: 'Notifies when context window is exceeded - may need manual intervention',
			enabled: true,
			patterns: [
				{
					pattern: 'context.*exceeded|context.*too long|token limit|max.*tokens|context length',
					mode: 'regex',
					caseSensitive: false
				}
			],
			actions: [
				{
					type: 'notify_only',
					payload: 'Context window exceeded - session may need restart'
				}
			],
			cooldownSeconds: 60,
			maxTriggersPerSession: 3,
			category: 'recovery',
			priority: 95
		}
	}
];

export const ERROR_RECOVERY_PACK: PresetPack = {
	id: 'error-recovery-pack',
	name: 'Error Recovery Pack',
	description: 'Automatic recovery from API errors, rate limits, and dormant sessions',
	longDescription:
		'This pack includes rules to automatically handle common transient errors that occur during agent operation. ' +
		'Includes recovery from API overload (529), rate limits (429), network errors, dormant sessions, and context window issues. ' +
		'All rules include appropriate delays and cooldowns to prevent aggressive retry loops.',
	category: 'recovery',
	icon: 'M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903m-2.019 8.924a7.5 7.5 0 01-12.548 3.364L2.536 18.982m0-10.5L.5 10.5l2.036-2.036m0 10.536L.5 17l2.036 2.036M19.5 10.5l2.036-2.036m0 10.536l2.036 2.036M21.5 17l-2.036 2.036',
	color: 'success',
	presets: errorRecoveryPresets,
	tags: ['api', 'error', 'retry', 'network', 'rate-limit', 'recovery'],
	enabledByDefault: true
};

// =============================================================================
// AUTO-CONFIRM PACK
// =============================================================================

const autoConfirmPresets: AutomationPreset[] = [
	{
		id: 'pack-confirm-yes-no',
		name: 'Yes/No Prompt Auto-Response',
		description: 'Automatically respond "yes" to yes/no confirmation prompts',
		category: 'prompt',
		rule: {
			name: 'Yes/No Prompt Auto-Response',
			description: 'Responds "y" to yes/no prompts. Use with caution - only enable when you trust the agent.',
			enabled: false,
			patterns: [
				{
					pattern: '\\(y\\/n\\)|\\[y\\/N\\]|\\[Y\\/n\\]|yes or no|confirm\\?|proceed\\?',
					mode: 'regex',
					caseSensitive: false
				}
			],
			actions: [
				{
					type: 'send_text',
					payload: 'y',
					delay: 500
				},
				{
					type: 'send_keys',
					payload: 'Enter',
					delay: 100
				}
			],
			cooldownSeconds: 5,
			maxTriggersPerSession: 50,
			category: 'prompt',
			priority: 50
		}
	},
	{
		id: 'pack-confirm-enter-continue',
		name: 'Press Enter to Continue',
		description: 'Automatically press Enter on "press Enter to continue" prompts',
		category: 'prompt',
		rule: {
			name: 'Press Enter to Continue',
			description: 'Automatically advances past "press Enter" prompts',
			enabled: true,
			patterns: [
				{
					pattern: 'press enter to continue|press enter to proceed|hit enter|press return',
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
			maxTriggersPerSession: 100,
			category: 'prompt',
			priority: 50
		}
	},
	{
		id: 'pack-confirm-retry',
		name: 'Auto-Retry on Failure',
		description: 'Automatically select retry when tool execution fails',
		category: 'prompt',
		rule: {
			name: 'Auto-Retry on Failure',
			description: 'Responds "y" when asked to retry a failed operation',
			enabled: true,
			patterns: [
				{
					pattern: 'would you like to retry|retry\\?|try again\\?|attempt again',
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
		id: 'pack-confirm-overwrite',
		name: 'Auto-Confirm Overwrite',
		description: 'Automatically confirm file overwrite prompts',
		category: 'prompt',
		rule: {
			name: 'Auto-Confirm Overwrite',
			description: 'Responds "y" to file overwrite confirmations. Disabled by default for safety.',
			enabled: false,
			patterns: [
				{
					pattern: 'overwrite\\?|replace existing|already exists.*overwrite|file exists.*replace',
					mode: 'regex',
					caseSensitive: false
				}
			],
			actions: [
				{
					type: 'send_text',
					payload: 'y',
					delay: 500
				},
				{
					type: 'send_keys',
					payload: 'Enter',
					delay: 100
				}
			],
			cooldownSeconds: 5,
			maxTriggersPerSession: 20,
			category: 'prompt',
			priority: 40
		}
	},
	{
		id: 'pack-confirm-npm-install',
		name: 'NPM Install Confirmation',
		description: 'Auto-confirm npm install prompts',
		category: 'prompt',
		rule: {
			name: 'NPM Install Confirmation',
			description: 'Automatically confirms npm install dependency prompts',
			enabled: true,
			patterns: [
				{
					pattern: 'npm.*install|install.*dependencies|npm.*WARN|peer dependency',
					mode: 'regex',
					caseSensitive: false
				}
			],
			actions: [
				{
					type: 'send_keys',
					payload: 'Enter',
					delay: 1000
				}
			],
			cooldownSeconds: 30,
			maxTriggersPerSession: 10,
			category: 'prompt',
			priority: 45
		}
	}
];

export const AUTO_CONFIRM_PACK: PresetPack = {
	id: 'auto-confirm-pack',
	name: 'Auto-Confirm Pack',
	description: 'Automatic responses to common confirmation prompts',
	longDescription:
		'This pack includes rules to automatically respond to common confirmation prompts that interrupt agent workflows. ' +
		'Includes yes/no prompts, Enter to continue, retry prompts, and file overwrite confirmations. ' +
		'Some rules are disabled by default for safety - review and enable based on your trust level.',
	category: 'prompt',
	icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
	color: 'info',
	presets: autoConfirmPresets,
	tags: ['prompt', 'confirm', 'yes', 'no', 'enter', 'continue'],
	enabledByDefault: true
};

// =============================================================================
// NOTIFICATION PACK
// =============================================================================

const notificationPresets: AutomationPreset[] = [
	{
		id: 'pack-notify-build-error',
		name: 'Build Error Notification',
		description: 'Notify when build errors are detected in session output',
		category: 'notification',
		rule: {
			name: 'Build Error Notification',
			description: 'Alerts when build/compile errors occur',
			enabled: true,
			patterns: [
				{
					pattern: 'Build failed|Compilation failed|build error|Failed to compile|error TS\\d+|SyntaxError:|TypeError:',
					mode: 'regex',
					caseSensitive: false
				}
			],
			actions: [
				{
					type: 'notify_only',
					payload: 'Build error detected in session'
				}
			],
			cooldownSeconds: 30,
			maxTriggersPerSession: 20,
			category: 'notification',
			priority: 70
		}
	},
	{
		id: 'pack-notify-test-failure',
		name: 'Test Failure Notification',
		description: 'Notify when test failures are detected',
		category: 'notification',
		rule: {
			name: 'Test Failure Notification',
			description: 'Alerts when tests fail',
			enabled: true,
			patterns: [
				{
					pattern: 'FAIL|test.*failed|\\d+ failing|tests? failed|AssertionError|expect.*toBe|test suite failed',
					mode: 'regex',
					caseSensitive: false
				}
			],
			actions: [
				{
					type: 'notify_only',
					payload: 'Test failure detected'
				}
			],
			cooldownSeconds: 15,
			maxTriggersPerSession: 50,
			category: 'notification',
			priority: 65
		}
	},
	{
		id: 'pack-notify-git-conflict',
		name: 'Git Conflict Notification',
		description: 'Notify when git merge conflicts are detected',
		category: 'notification',
		rule: {
			name: 'Git Conflict Notification',
			description: 'Alerts when git merge conflicts occur',
			enabled: true,
			patterns: [
				{
					pattern: 'CONFLICT|merge conflict|Automatic merge failed|<<<<<<< HEAD|=======$|>>>>>>>',
					mode: 'regex',
					caseSensitive: false
				}
			],
			actions: [
				{
					type: 'notify_only',
					payload: 'Git merge conflict detected - manual resolution may be required'
				}
			],
			cooldownSeconds: 60,
			maxTriggersPerSession: 10,
			category: 'notification',
			priority: 80
		}
	},
	{
		id: 'pack-notify-lint-error',
		name: 'Lint Error Notification',
		description: 'Notify when linting errors are detected',
		category: 'notification',
		rule: {
			name: 'Lint Error Notification',
			description: 'Alerts when ESLint/Prettier errors occur',
			enabled: true,
			patterns: [
				{
					pattern: 'eslint.*error|prettier.*error|\\d+ error|lint.*failed|Parsing error:',
					mode: 'regex',
					caseSensitive: false
				}
			],
			actions: [
				{
					type: 'notify_only',
					payload: 'Linting error detected'
				}
			],
			cooldownSeconds: 30,
			maxTriggersPerSession: 30,
			category: 'notification',
			priority: 55
		}
	},
	{
		id: 'pack-notify-task-complete',
		name: 'Task Completion Notification',
		description: 'Notify when an agent completes a task',
		category: 'notification',
		rule: {
			name: 'Task Completion Notification',
			description: 'Alerts when task completion is signaled',
			enabled: true,
			patterns: [
				{
					pattern: 'squad-signal.*completed|Task.*completed|✓ Task closed|st close.*completed',
					mode: 'regex',
					caseSensitive: false
				}
			],
			actions: [
				{
					type: 'notify_only',
					payload: 'Task completed successfully!'
				}
			],
			cooldownSeconds: 5,
			maxTriggersPerSession: 100,
			category: 'notification',
			priority: 20
		}
	},
	{
		id: 'pack-notify-security-warning',
		name: 'Security Warning Notification',
		description: 'Notify when security-related warnings are detected',
		category: 'notification',
		rule: {
			name: 'Security Warning Notification',
			description: 'Alerts on security vulnerabilities or warnings',
			enabled: true,
			patterns: [
				{
					pattern: 'security.*vulnerabilit|CVE-\\d+|npm audit|high severity|critical severity|security warning',
					mode: 'regex',
					caseSensitive: false
				}
			],
			actions: [
				{
					type: 'notify_only',
					payload: 'Security warning detected - review recommended'
				}
			],
			cooldownSeconds: 120,
			maxTriggersPerSession: 10,
			category: 'notification',
			priority: 90
		}
	}
];

export const NOTIFICATION_PACK: PresetPack = {
	id: 'notification-pack',
	name: 'Notification Pack',
	description: 'Alerts for build errors, test failures, and git conflicts',
	longDescription:
		'This pack includes notification rules to alert you about important events in agent sessions. ' +
		'Covers build errors, test failures, git merge conflicts, lint errors, task completions, and security warnings. ' +
		'All rules are notification-only - they alert but do not take automatic action.',
	category: 'notification',
	icon: 'M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0',
	color: 'warning',
	presets: notificationPresets,
	tags: ['notification', 'alert', 'build', 'test', 'git', 'error'],
	enabledByDefault: true
};

// =============================================================================
// ALL PACKS
// =============================================================================

/**
 * All available preset packs
 */
export const ALL_PRESET_PACKS: PresetPack[] = [
	ERROR_RECOVERY_PACK,
	AUTO_CONFIRM_PACK,
	NOTIFICATION_PACK
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get a preset pack by ID
 */
export function getPackById(packId: string): PresetPack | undefined {
	return ALL_PRESET_PACKS.find((p) => p.id === packId);
}

/**
 * Get all packs in a category
 */
export function getPacksByCategory(category: RuleCategory): PresetPack[] {
	return ALL_PRESET_PACKS.filter((p) => p.category === category);
}

/**
 * Search packs by tag
 */
export function getPacksByTag(tag: string): PresetPack[] {
	return ALL_PRESET_PACKS.filter((p) => p.tags.includes(tag.toLowerCase()));
}

/**
 * Get all presets from a pack as installable rules
 */
export function getPackRules(
	pack: PresetPack,
	enabledOverride?: boolean
): import('$lib/types/automation').AutomationRule[] {
	return pack.presets.map((preset) => ({
		id: generateRuleId(),
		...preset.rule,
		enabled: enabledOverride !== undefined ? enabledOverride : (pack.enabledByDefault && preset.rule.enabled),
		isPreset: true,
		presetId: preset.id
	}));
}

/**
 * Check if a pack's rules are already installed (by preset ID)
 */
export function isPackInstalled(
	pack: PresetPack,
	existingRules: import('$lib/types/automation').AutomationRule[]
): boolean {
	const installedPresetIds = new Set(existingRules.filter((r) => r.presetId).map((r) => r.presetId));
	return pack.presets.every((preset) => installedPresetIds.has(preset.id));
}

/**
 * Check how many rules from a pack are already installed
 */
export function getPackInstallStatus(
	pack: PresetPack,
	existingRules: import('$lib/types/automation').AutomationRule[]
): { installed: number; total: number } {
	const installedPresetIds = new Set(existingRules.filter((r) => r.presetId).map((r) => r.presetId));
	const installed = pack.presets.filter((preset) => installedPresetIds.has(preset.id)).length;
	return { installed, total: pack.presets.length };
}

/**
 * Get summary of all available packs
 */
export function getPacksSummary(): {
	packId: string;
	name: string;
	presetCount: number;
	category: RuleCategory;
}[] {
	return ALL_PRESET_PACKS.map((pack) => ({
		packId: pack.id,
		name: pack.name,
		presetCount: pack.presets.length,
		category: pack.category
	}));
}
