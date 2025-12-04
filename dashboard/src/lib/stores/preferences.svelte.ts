/**
 * Unified User Preferences Store
 *
 * Single reactive store for all user preferences with localStorage persistence.
 * Uses Svelte 5 runes for automatic reactivity - no custom events needed.
 */

import { browser } from '$app/environment';

// Storage keys (matching existing localStorage keys for backward compatibility)
const STORAGE_KEYS = {
	sparklineVisible: 'sparkline-visible',
	soundsEnabled: 'dashboard-sounds-enabled',
	theme: 'theme',
	terminalHeight: 'user-terminal-height',
	outputDrawerOpen: 'output-drawer-open',
	taskSaveAction: 'taskDrawer.savePreference', // Match TaskCreationDrawer
	sparklineMode: 'sparkline-multi-series-mode',
	ctrlCIntercept: 'ctrl-c-intercept-enabled'
} as const;

// Default values
const DEFAULTS = {
	sparklineVisible: true,
	soundsEnabled: false,
	theme: 'nord',
	terminalHeight: 50, // Match UserProfile's DEFAULT_TERMINAL_HEIGHT
	outputDrawerOpen: false,
	taskSaveAction: 'close' as TaskSaveAction,
	sparklineMode: 'stacked' as SparklineMode,
	ctrlCIntercept: true // When true, Ctrl+C sends interrupt to tmux; when false, Ctrl+C copies
};

// Types
// Note: TaskSaveAction matches TaskCreationDrawer's SaveAction type
export type TaskSaveAction = 'close' | 'new' | 'start';
export type SparklineMode = 'stacked' | 'overlaid';

// Reactive state (module-level $state)
let sparklineVisible = $state(DEFAULTS.sparklineVisible);
let soundsEnabled = $state(DEFAULTS.soundsEnabled);
let theme = $state(DEFAULTS.theme);
let terminalHeight = $state(DEFAULTS.terminalHeight);
let outputDrawerOpen = $state(DEFAULTS.outputDrawerOpen);
let taskSaveAction = $state<TaskSaveAction>(DEFAULTS.taskSaveAction);
let sparklineMode = $state<SparklineMode>(DEFAULTS.sparklineMode);
let ctrlCIntercept = $state(DEFAULTS.ctrlCIntercept);
let initialized = $state(false);

/**
 * Initialize preferences from localStorage.
 * Call once in +layout.svelte onMount.
 */
export function initPreferences(): void {
	if (!browser || initialized) return;

	// Load all preferences from localStorage
	const storedSparkline = localStorage.getItem(STORAGE_KEYS.sparklineVisible);
	sparklineVisible = storedSparkline === null ? DEFAULTS.sparklineVisible : storedSparkline === 'true';

	soundsEnabled = localStorage.getItem(STORAGE_KEYS.soundsEnabled) === 'true';

	theme = localStorage.getItem(STORAGE_KEYS.theme) || DEFAULTS.theme;

	const storedHeight = localStorage.getItem(STORAGE_KEYS.terminalHeight);
	terminalHeight = storedHeight ? parseInt(storedHeight, 10) || DEFAULTS.terminalHeight : DEFAULTS.terminalHeight;

	outputDrawerOpen = localStorage.getItem(STORAGE_KEYS.outputDrawerOpen) === 'true';

	const storedSaveAction = localStorage.getItem(STORAGE_KEYS.taskSaveAction);
	taskSaveAction = (storedSaveAction === 'close' || storedSaveAction === 'new' || storedSaveAction === 'start')
		? storedSaveAction
		: DEFAULTS.taskSaveAction;

	const storedSparklineMode = localStorage.getItem(STORAGE_KEYS.sparklineMode);
	sparklineMode = (storedSparklineMode === 'stacked' || storedSparklineMode === 'overlaid')
		? storedSparklineMode
		: DEFAULTS.sparklineMode;

	const storedCtrlCIntercept = localStorage.getItem(STORAGE_KEYS.ctrlCIntercept);
	ctrlCIntercept = storedCtrlCIntercept === null ? DEFAULTS.ctrlCIntercept : storedCtrlCIntercept === 'true';

	initialized = true;
}

// ============================================================================
// Sparkline Visibility
// ============================================================================

export function getSparklineVisible(): boolean {
	return sparklineVisible;
}

export function setSparklineVisible(value: boolean): void {
	sparklineVisible = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEYS.sparklineVisible, String(value));
	}
}

export function toggleSparklineVisible(): boolean {
	setSparklineVisible(!sparklineVisible);
	return sparklineVisible;
}

// ============================================================================
// Sounds
// ============================================================================

export function getSoundsEnabled(): boolean {
	return soundsEnabled;
}

export function setSoundsEnabled(value: boolean): void {
	soundsEnabled = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEYS.soundsEnabled, String(value));
	}
}

export function toggleSoundsEnabled(): boolean {
	setSoundsEnabled(!soundsEnabled);
	return soundsEnabled;
}

// ============================================================================
// Theme
// ============================================================================

export function getTheme(): string {
	return theme;
}

export function setTheme(value: string): void {
	theme = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEYS.theme, value);
		// Theme also needs to update DOM attribute
		document.documentElement.setAttribute('data-theme', value);
	}
}

// ============================================================================
// Terminal Height
// ============================================================================

export function getTerminalHeight(): number {
	return terminalHeight;
}

export function setTerminalHeight(value: number): void {
	terminalHeight = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEYS.terminalHeight, String(value));
	}
}

// ============================================================================
// Output Drawer
// ============================================================================

export function getOutputDrawerOpen(): boolean {
	return outputDrawerOpen;
}

export function setOutputDrawerOpen(value: boolean): void {
	outputDrawerOpen = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEYS.outputDrawerOpen, String(value));
	}
}

export function toggleOutputDrawerOpen(): boolean {
	setOutputDrawerOpen(!outputDrawerOpen);
	return outputDrawerOpen;
}

// ============================================================================
// Task Save Action
// ============================================================================

export function getTaskSaveAction(): TaskSaveAction {
	return taskSaveAction;
}

export function setTaskSaveAction(value: TaskSaveAction): void {
	taskSaveAction = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEYS.taskSaveAction, value);
	}
}

// ============================================================================
// Sparkline Mode (multi-series display)
// ============================================================================

export function getSparklineMode(): SparklineMode {
	return sparklineMode;
}

export function setSparklineMode(value: SparklineMode): void {
	sparklineMode = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEYS.sparklineMode, value);
	}
}

export function toggleSparklineMode(): SparklineMode {
	const newMode = sparklineMode === 'stacked' ? 'overlaid' : 'stacked';
	setSparklineMode(newMode);
	return sparklineMode;
}

// ============================================================================
// Ctrl+C Intercept (interrupt vs copy behavior)
// ============================================================================

export function getCtrlCIntercept(): boolean {
	return ctrlCIntercept;
}

export function setCtrlCIntercept(value: boolean): void {
	ctrlCIntercept = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEYS.ctrlCIntercept, String(value));
	}
}

export function toggleCtrlCIntercept(): boolean {
	setCtrlCIntercept(!ctrlCIntercept);
	return ctrlCIntercept;
}

// ============================================================================
// Utility: Check if preferences are initialized
// ============================================================================

export function isInitialized(): boolean {
	return initialized;
}
