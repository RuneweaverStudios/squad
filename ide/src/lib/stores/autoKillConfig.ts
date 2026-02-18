/**
 * Auto-Kill Configuration Store
 *
 * Manages runtime configuration for auto-killing completed sessions.
 * This store is loaded from the API at startup and updated when the user saves settings.
 *
 * ## Two Types of Auto-Kill
 *
 * 1. **User Intent (pendingAutoKill)** - When user clicks "Complete & Kill" button,
 *    we track that they explicitly want the session killed after completion.
 *    This is checked when the complete signal arrives.
 *
 * 2. **Auto-Complete (priority-based)** - When review rules say "auto" for a task,
 *    the IDE auto-triggers /squad:complete and then auto-kills based on
 *    the autoKillConfig settings.
 *
 * The pendingAutoKill store takes precedence: if user clicked "Complete & Kill",
 * we kill regardless of priority settings.
 */

import { writable, get } from 'svelte/store';
import { AUTO_KILL } from '$lib/config/constants';

export interface AutoKillConfig {
	enabled: boolean;
	defaultDelaySeconds: number;
	priorityDelays: Record<number, number | null>;
	maxDelaySeconds: number;
	/** Per-priority enabled flags - if false, that priority won't auto-kill */
	priorityEnabled: Record<number, boolean>;
}

// Default config from constants (used as fallback)
const defaultConfig: AutoKillConfig = {
	enabled: false, // Disabled by default - users opt-in to this powerful feature
	defaultDelaySeconds: AUTO_KILL.DEFAULT_DELAY_SECONDS,
	priorityDelays: { ...AUTO_KILL.PRIORITY_DELAYS },
	maxDelaySeconds: AUTO_KILL.MAX_DELAY_SECONDS,
	priorityEnabled: { 0: false, 1: false, 2: false, 3: true, 4: true }
};

// Create the store with default values
export const autoKillConfig = writable<AutoKillConfig>(defaultConfig);

/**
 * Load auto-kill configuration from the API
 * Called on IDE startup
 */
export async function loadAutoKillConfig(): Promise<void> {
	try {
		const response = await fetch('/api/config/defaults');
		if (!response.ok) {
			console.warn('Failed to load auto-kill config, using defaults');
			return;
		}

		const data = await response.json();
		const defaults = data.defaults || {};

		// Update the store with loaded values, falling back to constants
		autoKillConfig.set({
			enabled: defaults.auto_kill_enabled ?? AUTO_KILL.ENABLED,
			defaultDelaySeconds: defaults.auto_kill_delay ?? AUTO_KILL.DEFAULT_DELAY_SECONDS,
			priorityDelays: { ...AUTO_KILL.PRIORITY_DELAYS },
			maxDelaySeconds: AUTO_KILL.MAX_DELAY_SECONDS,
			priorityEnabled: {
				0: defaults.auto_kill_p0 ?? true,
				1: defaults.auto_kill_p1 ?? true,
				2: defaults.auto_kill_p2 ?? true,
				3: defaults.auto_kill_p3 ?? true,
				4: defaults.auto_kill_p4 ?? true
			}
		});
	} catch (error) {
		console.warn('Error loading auto-kill config:', error);
		// Keep default values
	}
}

/**
 * Update auto-kill configuration
 * Called when user saves settings in DefaultsEditor
 */
export function updateAutoKillConfig(updates: Partial<AutoKillConfig>): void {
	autoKillConfig.update(current => ({
		...current,
		...updates
	}));
}

/**
 * Get the current auto-kill configuration synchronously
 */
export function getAutoKillConfig(): AutoKillConfig {
	return get(autoKillConfig);
}

/**
 * Check if auto-kill is enabled
 */
export function isAutoKillEnabled(): boolean {
	return get(autoKillConfig).enabled;
}

/**
 * Get the delay for a specific task priority
 * Returns null if auto-kill is disabled or if the priority is not enabled
 */
export function getAutoKillDelayForPriority(priority: number | null | undefined): number | null {
	const config = get(autoKillConfig);

	if (!config.enabled) return null;

	// Check if this priority is enabled for auto-kill
	if (priority !== null && priority !== undefined) {
		// If this specific priority is disabled, don't auto-kill
		if (config.priorityEnabled[priority] === false) {
			return null;
		}
	}

	// Use the user-configured delay for all enabled priorities
	if (config.defaultDelaySeconds === null) return null;
	return Math.min(config.defaultDelaySeconds, config.maxDelaySeconds);
}

// ============================================================================
// Pending Auto-Kill Intent Store
// ============================================================================

/**
 * Tracks which sessions have pending auto-kill intent from user action.
 *
 * When user clicks "Complete & Kill" in SessionCard:
 * 1. setPendingAutoKill(sessionName, true) is called
 * 2. /squad:complete --kill is sent to the session
 * 3. When complete signal arrives, sessionEvents checks this store
 * 4. If pending, session is killed regardless of priority settings
 * 5. clearPendingAutoKill(sessionName) cleans up
 *
 * This separates "user explicitly wants kill" from "auto-kill based on config".
 */
const pendingAutoKillMap = writable<Map<string, boolean>>(new Map());

/**
 * Set pending auto-kill intent for a session.
 * Call this when user clicks "Complete & Kill" button.
 */
export function setPendingAutoKill(sessionName: string, shouldKill: boolean): void {
	pendingAutoKillMap.update((map) => {
		const newMap = new Map(map);
		if (shouldKill) {
			newMap.set(sessionName, true);
		} else {
			newMap.delete(sessionName);
		}
		return newMap;
	});
}

/**
 * Check if a session has pending auto-kill intent.
 * Returns true if user clicked "Complete & Kill" and signal hasn't arrived yet.
 */
export function hasPendingAutoKill(sessionName: string): boolean {
	return get(pendingAutoKillMap).get(sessionName) === true;
}

/**
 * Clear pending auto-kill intent for a session.
 * Call this after the session has been killed or the intent is no longer valid.
 */
export function clearPendingAutoKill(sessionName: string): void {
	pendingAutoKillMap.update((map) => {
		const newMap = new Map(map);
		newMap.delete(sessionName);
		return newMap;
	});
}

/**
 * Get all sessions with pending auto-kill intent.
 * Useful for debugging or status display.
 */
export function getPendingAutoKillSessions(): string[] {
	return Array.from(get(pendingAutoKillMap).keys());
}
