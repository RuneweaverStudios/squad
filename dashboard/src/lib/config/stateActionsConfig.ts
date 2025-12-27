/**
 * State Actions Configuration
 *
 * User-configurable mapping of session states to dropdown actions.
 * Users can customize which commands appear in the StatusActionBadge dropdown
 * for each session state.
 *
 * Config file location: ~/.config/jat/state-actions.json
 *
 * The system supports:
 * - Built-in actions (complete, cleanup, attach, etc.)
 * - Custom slash commands (e.g., /jat:complete, /jat:pause)
 * - Per-state customization
 * - Priority ordering
 */

import { SESSION_STATE_ACTIONS, type SessionStateAction, type SessionState } from './statusColors';

// =============================================================================
// TYPES
// =============================================================================

/**
 * A custom action that runs a slash command
 */
export interface CustomCommandAction extends SessionStateAction {
	type: 'command';
	command: string; // The slash command to run (e.g., "/jat:complete")
}

/**
 * Built-in action reference (uses existing action by ID)
 */
export interface BuiltinActionRef {
	type: 'builtin';
	id: string; // Reference to built-in action ID (e.g., "complete", "attach")
}

/**
 * User-defined action configuration for a single action
 */
export type UserActionConfig = CustomCommandAction | BuiltinActionRef;

/**
 * User configuration for a single state's actions
 */
export interface StateActionConfig {
	/** Actions to show (in order) */
	actions: UserActionConfig[];
	/** Whether to include default actions not in the list (at the end) */
	includeDefaults?: boolean;
}

/**
 * Full user configuration for state actions
 */
export interface StateActionsUserConfig {
	/** Version for future migrations */
	version: 1;
	/** Per-state action configurations */
	states: Partial<Record<SessionState, StateActionConfig>>;
}

/**
 * Available built-in action definition (for UI picker)
 */
export interface AvailableBuiltinAction {
	id: string;
	label: string;
	description: string;
	icon: string;
	variant: SessionStateAction['variant'];
	/** Which states this action is typically used in */
	defaultStates: SessionState[];
}

// =============================================================================
// BUILT-IN ACTIONS CATALOG
// =============================================================================

/**
 * Catalog of all available built-in actions
 * Used by the UI to show what actions can be added to states
 */
export const BUILTIN_ACTIONS_CATALOG: AvailableBuiltinAction[] = [
	{
		id: 'complete',
		label: 'Mark Done',
		description: 'Run /jat:complete to finish task',
		icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
		variant: 'success',
		defaultStates: ['ready-for-review']
	},
	{
		id: 'start',
		label: 'Pick Task',
		description: 'Run /jat:start to pick a task (not used in one-task-one-session model)',
		icon: 'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z',
		variant: 'success',
		defaultStates: []  // Empty: one task = one session = one agent philosophy
	},
	{
		id: 'start-next',
		label: 'Start Next',
		description: 'Cleanup and spawn agent for next task',
		icon: 'M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061A1.125 1.125 0 013 16.811V8.69zM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061a1.125 1.125 0 01-1.683-.977V8.69z',
		variant: 'success',
		defaultStates: ['completed']
	},
	{
		id: 'cleanup',
		label: 'Cleanup Session',
		description: 'Close tmux session and remove from list',
		icon: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
		variant: 'default',
		defaultStates: ['completed', 'idle']
	},
	{
		id: 'attach',
		label: 'Attach Terminal',
		description: 'Open session in terminal',
		icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
		variant: 'info',
		defaultStates: ['working', 'needs-input', 'ready-for-review', 'completing', 'completed', 'starting', 'idle']
	},
	{
		id: 'view-task',
		label: 'View Task',
		description: 'Open task details',
		icon: 'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
		variant: 'default',
		defaultStates: ['completed']
	},
	{
		id: 'interrupt',
		label: 'Interrupt',
		description: 'Send Ctrl+C to interrupt',
		icon: 'M15.75 5.25v13.5m-7.5-13.5v13.5',
		variant: 'warning',
		defaultStates: ['working', 'starting']
	},
	{
		id: 'escape',
		label: 'Send Escape',
		description: 'Send Esc key to cancel prompt',
		icon: 'M9 9l6 6m0-6l-6 6m12-3a9 9 0 11-18 0 9 9 0 0118 0z',
		variant: 'default',
		defaultStates: ['needs-input']
	},
	{
		id: 'kill',
		label: 'Kill Session',
		description: 'Terminate tmux session',
		icon: 'M6 18L18 6M6 6l12 12',
		variant: 'error',
		defaultStates: ['working', 'needs-input', 'ready-for-review', 'completing', 'starting']
	}
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get a built-in action by ID
 *
 * First checks the state-specific defaults (which have full action definitions),
 * then falls back to the catalog (which can be used in any state).
 */
export function getBuiltinAction(id: string, state: SessionState): SessionStateAction | null {
	// First, check if the action exists in this state's defaults (preferred - has full styling)
	const defaultActions = SESSION_STATE_ACTIONS[state];
	if (defaultActions) {
		const fromDefaults = defaultActions.find((a) => a.id === id);
		if (fromDefaults) return fromDefaults;
	}

	// Fall back to catalog - action can be used in any state
	const catalogAction = BUILTIN_ACTIONS_CATALOG.find((a) => a.id === id);
	if (catalogAction) {
		// Convert catalog action to SessionStateAction
		return {
			id: catalogAction.id,
			label: catalogAction.label,
			icon: catalogAction.icon,
			variant: catalogAction.variant,
			description: catalogAction.description
		};
	}

	return null;
}

/**
 * Get a built-in action from the catalog
 */
export function getBuiltinActionFromCatalog(id: string): AvailableBuiltinAction | null {
	return BUILTIN_ACTIONS_CATALOG.find((a) => a.id === id) || null;
}

/**
 * Convert a user action config to a SessionStateAction
 */
export function resolveUserAction(
	config: UserActionConfig,
	state: SessionState
): SessionStateAction | null {
	if (config.type === 'builtin') {
		// Look up builtin action
		return getBuiltinAction(config.id, state);
	} else if (config.type === 'command') {
		// Custom command action - preserve all fields including command for execution
		return {
			id: config.id,
			label: config.label,
			icon: config.icon,
			variant: config.variant,
			description: config.description,
			command: config.command
		};
	}
	return null;
}

/**
 * Merge user config with defaults for a specific state
 */
export function getActionsForState(
	state: SessionState,
	userConfig?: StateActionsUserConfig
): SessionStateAction[] {
	const defaultActions = SESSION_STATE_ACTIONS[state] || [];

	// No user config - return defaults
	if (!userConfig?.states?.[state]) {
		return defaultActions;
	}

	const stateConfig = userConfig.states[state]!;
	const resolvedActions: SessionStateAction[] = [];
	const usedIds = new Set<string>();

	// Resolve user-configured actions
	for (const actionConfig of stateConfig.actions) {
		const resolved = resolveUserAction(actionConfig, state);
		if (resolved) {
			resolvedActions.push(resolved);
			usedIds.add(resolved.id);
		}
	}

	// Append defaults if includeDefaults is true (default behavior)
	if (stateConfig.includeDefaults !== false) {
		for (const defaultAction of defaultActions) {
			if (!usedIds.has(defaultAction.id)) {
				resolvedActions.push(defaultAction);
			}
		}
	}

	return resolvedActions;
}

/**
 * Get all states that support configuration
 */
export function getConfigurableStates(): SessionState[] {
	return Object.keys(SESSION_STATE_ACTIONS) as SessionState[];
}

/**
 * Create a default/empty user config
 */
export function createDefaultUserConfig(): StateActionsUserConfig {
	return {
		version: 1,
		states: {}
	};
}

/**
 * Validate user config structure
 */
export function validateUserConfig(config: unknown): config is StateActionsUserConfig {
	if (!config || typeof config !== 'object') return false;

	const c = config as StateActionsUserConfig;
	if (c.version !== 1) return false;
	if (!c.states || typeof c.states !== 'object') return false;

	// Validate each state config
	for (const [state, stateConfig] of Object.entries(c.states)) {
		if (!getConfigurableStates().includes(state as SessionState)) {
			console.warn(`Invalid state in config: ${state}`);
			continue;
		}

		if (!stateConfig || typeof stateConfig !== 'object') return false;
		if (!Array.isArray(stateConfig.actions)) return false;

		// Validate each action
		for (const action of stateConfig.actions) {
			if (!action || typeof action !== 'object') return false;
			if (action.type !== 'builtin' && action.type !== 'command') return false;

			if (action.type === 'builtin') {
				if (typeof action.id !== 'string') return false;
			} else if (action.type === 'command') {
				if (typeof action.id !== 'string') return false;
				if (typeof action.label !== 'string') return false;
				if (typeof action.command !== 'string') return false;
			}
		}
	}

	return true;
}
