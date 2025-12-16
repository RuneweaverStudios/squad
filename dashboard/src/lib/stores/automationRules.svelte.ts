/**
 * Automation Rules Store
 *
 * Manages automation rules state using Svelte 5 runes.
 * Persists rules to localStorage and provides CRUD operations.
 *
 * @see dashboard/src/lib/types/automation.ts for type definitions
 * @see dashboard/src/lib/config/automationConfig.ts for presets
 */

import type {
	AutomationRule,
	AutomationConfig,
	AutomationActivityEvent,
	RuleTriggerRecord,
	AutomationRulesState,
	RuleCategory
} from '$lib/types/automation';
import {
	DEFAULT_AUTOMATION_CONFIG,
	AUTOMATION_PRESETS,
	generateRuleId,
	createRuleFromPreset
} from '$lib/config/automationConfig';

// =============================================================================
// CONSTANTS
// =============================================================================

const STORAGE_KEY = 'jat-automation-rules';
const CONFIG_STORAGE_KEY = 'jat-automation-config';

// =============================================================================
// STATE
// =============================================================================

/**
 * Reactive state using Svelte 5 runes
 */
let state = $state<AutomationRulesState>({
	rules: [],
	config: { ...DEFAULT_AUTOMATION_CONFIG },
	triggerRecords: new Map(),
	activityEvents: [],
	initialized: false
});

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize the store from localStorage
 * Should be called once on app mount
 */
export function initializeStore(): void {
	if (typeof window === 'undefined') return; // SSR guard
	if (state.initialized) return;

	try {
		// Load config
		const storedConfig = localStorage.getItem(CONFIG_STORAGE_KEY);
		if (storedConfig) {
			const parsedConfig = JSON.parse(storedConfig);
			state.config = { ...DEFAULT_AUTOMATION_CONFIG, ...parsedConfig };
		}

		// Load rules
		const storedRules = localStorage.getItem(STORAGE_KEY);
		if (storedRules) {
			const parsedRules = JSON.parse(storedRules);
			if (Array.isArray(parsedRules) && parsedRules.length > 0) {
				state.rules = parsedRules;
			} else {
				// First run - load enabled presets as default rules
				loadDefaultPresets();
			}
		} else {
			// First run - load enabled presets as default rules
			loadDefaultPresets();
		}
	} catch (err) {
		console.error('[automationRules] Failed to load from localStorage:', err);
		loadDefaultPresets();
	}

	state.initialized = true;
	console.log('[automationRules] Store initialized with', state.rules.length, 'rules');
}

/**
 * Load default presets as initial rules
 */
function loadDefaultPresets(): void {
	state.rules = AUTOMATION_PRESETS
		.filter(p => p.rule.enabled) // Only load presets that are enabled by default
		.map(createRuleFromPreset);
}

/**
 * Persist current rules to localStorage
 */
function persistRules(): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state.rules));
	} catch (err) {
		console.error('[automationRules] Failed to persist rules:', err);
	}
}

/**
 * Persist config to localStorage
 */
function persistConfig(): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(state.config));
	} catch (err) {
		console.error('[automationRules] Failed to persist config:', err);
	}
}

// =============================================================================
// RULE CRUD OPERATIONS
// =============================================================================

/**
 * Add a new rule
 */
export function addRule(rule: Omit<AutomationRule, 'id'>): AutomationRule {
	const newRule: AutomationRule = {
		...rule,
		id: generateRuleId()
	};
	state.rules = [...state.rules, newRule];
	persistRules();
	return newRule;
}

/**
 * Update an existing rule
 */
export function updateRule(ruleId: string, updates: Partial<AutomationRule>): boolean {
	const index = state.rules.findIndex(r => r.id === ruleId);
	if (index === -1) return false;

	state.rules = state.rules.map((rule, i) =>
		i === index ? { ...rule, ...updates } : rule
	);
	persistRules();
	return true;
}

/**
 * Delete a rule
 */
export function deleteRule(ruleId: string): boolean {
	const index = state.rules.findIndex(r => r.id === ruleId);
	if (index === -1) return false;

	state.rules = state.rules.filter(r => r.id !== ruleId);
	persistRules();
	return true;
}

/**
 * Toggle rule enabled state
 */
export function toggleRuleEnabled(ruleId: string): boolean {
	const rule = state.rules.find(r => r.id === ruleId);
	if (!rule) return false;

	return updateRule(ruleId, { enabled: !rule.enabled });
}

/**
 * Reorder rules (for drag-to-reorder)
 */
export function reorderRules(ruleIds: string[]): void {
	const ruleMap = new Map(state.rules.map(r => [r.id, r]));
	state.rules = ruleIds
		.map(id => ruleMap.get(id))
		.filter((r): r is AutomationRule => r !== undefined);
	persistRules();
}

/**
 * Clone a rule
 */
export function cloneRule(ruleId: string): AutomationRule | null {
	const rule = state.rules.find(r => r.id === ruleId);
	if (!rule) return null;

	const clonedRule = addRule({
		...rule,
		name: `${rule.name} (Copy)`,
		isPreset: false,
		presetId: undefined
	});

	return clonedRule;
}

// =============================================================================
// PRESET OPERATIONS
// =============================================================================

/**
 * Add a preset to active rules
 */
export function addPreset(presetId: string): AutomationRule | null {
	const preset = AUTOMATION_PRESETS.find(p => p.id === presetId);
	if (!preset) return null;

	// Check if already added
	const existing = state.rules.find(r => r.presetId === presetId);
	if (existing) return existing;

	const rule = createRuleFromPreset(preset);
	state.rules = [...state.rules, rule];
	persistRules();
	return rule;
}

/**
 * Remove a preset from active rules
 */
export function removePreset(presetId: string): boolean {
	const rule = state.rules.find(r => r.presetId === presetId);
	if (!rule) return false;

	return deleteRule(rule.id);
}

/**
 * Check if a preset is active
 */
export function isPresetActive(presetId: string): boolean {
	return state.rules.some(r => r.presetId === presetId);
}

/**
 * Reset presets to defaults
 */
export function resetPresetsToDefaults(): void {
	// Remove all preset-based rules
	state.rules = state.rules.filter(r => !r.isPreset);

	// Add default presets
	const defaultRules = AUTOMATION_PRESETS
		.filter(p => p.rule.enabled)
		.map(createRuleFromPreset);

	state.rules = [...state.rules, ...defaultRules];
	persistRules();
}

// =============================================================================
// CONFIG OPERATIONS
// =============================================================================

/**
 * Update global config
 */
export function updateConfig(updates: Partial<AutomationConfig>): void {
	state.config = { ...state.config, ...updates };
	persistConfig();
}

/**
 * Toggle master automation enable/disable
 */
export function toggleAutomation(): boolean {
	state.config.enabled = !state.config.enabled;
	persistConfig();
	return state.config.enabled;
}

/**
 * Reset config to defaults
 */
export function resetConfig(): void {
	state.config = { ...DEFAULT_AUTOMATION_CONFIG };
	persistConfig();
}

// =============================================================================
// TRIGGER TRACKING
// =============================================================================

/**
 * Get trigger record key
 */
function getTriggerKey(ruleId: string, sessionName: string): string {
	return `${ruleId}:${sessionName}`;
}

/**
 * Check if a rule is on cooldown for a session
 */
export function isOnCooldown(ruleId: string, sessionName: string): boolean {
	const key = getTriggerKey(ruleId, sessionName);
	const record = state.triggerRecords.get(key);
	if (!record) return false;

	const rule = state.rules.find(r => r.id === ruleId);
	if (!rule) return false;

	const cooldownMs = rule.cooldownSeconds * 1000;
	const elapsed = Date.now() - record.lastTriggeredAt;
	return elapsed < cooldownMs;
}

/**
 * Check if a rule has exceeded max triggers for a session
 */
export function hasExceededMaxTriggers(ruleId: string, sessionName: string): boolean {
	const rule = state.rules.find(r => r.id === ruleId);
	if (!rule || rule.maxTriggersPerSession === 0) return false;

	const key = getTriggerKey(ruleId, sessionName);
	const record = state.triggerRecords.get(key);
	if (!record) return false;

	return record.triggerCount >= rule.maxTriggersPerSession;
}

/**
 * Record a rule trigger
 */
export function recordTrigger(ruleId: string, sessionName: string): void {
	const key = getTriggerKey(ruleId, sessionName);
	const existing = state.triggerRecords.get(key);

	state.triggerRecords.set(key, {
		ruleId,
		sessionName,
		lastTriggeredAt: Date.now(),
		triggerCount: existing ? existing.triggerCount + 1 : 1
	});
}

/**
 * Clear trigger records for a session (e.g., when session ends)
 */
export function clearSessionTriggers(sessionName: string): void {
	const keysToDelete: string[] = [];
	state.triggerRecords.forEach((_, key) => {
		if (key.endsWith(`:${sessionName}`)) {
			keysToDelete.push(key);
		}
	});
	keysToDelete.forEach(key => state.triggerRecords.delete(key));
}

/**
 * Get trigger count for a rule/session
 */
export function getTriggerCount(ruleId: string, sessionName: string): number {
	const key = getTriggerKey(ruleId, sessionName);
	const record = state.triggerRecords.get(key);
	return record?.triggerCount ?? 0;
}

// =============================================================================
// ACTIVITY EVENTS
// =============================================================================

/**
 * Add an activity event
 */
export function addActivityEvent(event: Omit<AutomationActivityEvent, 'id' | 'timestamp'>): void {
	const newEvent: AutomationActivityEvent = {
		...event,
		id: `activity-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
		timestamp: Date.now()
	};

	state.activityEvents = [newEvent, ...state.activityEvents];

	// Trim to max events
	if (state.activityEvents.length > state.config.maxActivityEvents) {
		state.activityEvents = state.activityEvents.slice(0, state.config.maxActivityEvents);
	}
}

/**
 * Get recent activity events
 */
export function getRecentActivity(limit: number = 10): AutomationActivityEvent[] {
	return state.activityEvents.slice(0, limit);
}

/**
 * Get activity events for a specific session
 */
export function getSessionActivity(sessionName: string, limit: number = 10): AutomationActivityEvent[] {
	return state.activityEvents
		.filter(e => e.sessionName === sessionName)
		.slice(0, limit);
}

/**
 * Clear all activity events
 */
export function clearActivityEvents(): void {
	state.activityEvents = [];
}

// =============================================================================
// QUERY HELPERS
// =============================================================================

/**
 * Get all enabled rules sorted by priority
 */
export function getEnabledRules(): AutomationRule[] {
	return state.rules
		.filter(r => r.enabled)
		.sort((a, b) => b.priority - a.priority);
}

/**
 * Get rules by category
 */
export function getRulesByCategory(category: RuleCategory): AutomationRule[] {
	return state.rules.filter(r => r.category === category);
}

/**
 * Get a rule by ID
 */
export function getRuleById(ruleId: string): AutomationRule | undefined {
	return state.rules.find(r => r.id === ruleId);
}

/**
 * Check if any rules match a session name filter
 */
export function getRulesForSession(sessionName: string): AutomationRule[] {
	return getEnabledRules().filter(rule => {
		// If no session filter, match all
		if (!rule.sessionFilter || rule.sessionFilter.length === 0) {
			return true;
		}

		// Check if session name matches any filter (glob patterns)
		return rule.sessionFilter.some(filter => {
			// Simple glob matching: * matches anything
			const regex = new RegExp(
				'^' + filter.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
			);
			return regex.test(sessionName);
		});
	});
}

// =============================================================================
// EXPORT/IMPORT
// =============================================================================

/**
 * Export rules to JSON string
 */
export function exportRules(): string {
	return JSON.stringify({
		version: 1,
		rules: state.rules,
		config: state.config,
		exportedAt: new Date().toISOString()
	}, null, 2);
}

/**
 * Import rules from JSON string
 */
export function importRules(jsonString: string, merge: boolean = false): boolean {
	try {
		const data = JSON.parse(jsonString);
		if (!data.rules || !Array.isArray(data.rules)) {
			throw new Error('Invalid rules format');
		}

		if (merge) {
			// Merge imported rules with existing (avoid duplicates by ID)
			const existingIds = new Set(state.rules.map(r => r.id));
			const newRules = data.rules.filter((r: AutomationRule) => !existingIds.has(r.id));
			state.rules = [...state.rules, ...newRules];
		} else {
			// Replace all rules
			state.rules = data.rules;
		}

		if (data.config) {
			state.config = { ...DEFAULT_AUTOMATION_CONFIG, ...data.config };
			persistConfig();
		}

		persistRules();
		return true;
	} catch (err) {
		console.error('[automationRules] Failed to import rules:', err);
		return false;
	}
}

// =============================================================================
// REACTIVE GETTERS
// =============================================================================

export function getRules(): AutomationRule[] {
	return state.rules;
}

export function getConfig(): AutomationConfig {
	return state.config;
}

export function isAutomationEnabled(): boolean {
	return state.config.enabled;
}

export function getActivityEvents(): AutomationActivityEvent[] {
	return state.activityEvents;
}

export function isInitialized(): boolean {
	return state.initialized;
}

// Export state for direct reactive access
export { state as automationRulesState };
