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
	ctrlCIntercept: 'ctrl-c-intercept-enabled',
	terminalFontFamily: 'terminal-font-family',
	terminalFontSize: 'terminal-font-size'
} as const;

// Terminal font family options
export const TERMINAL_FONT_OPTIONS = [
	{ value: 'jetbrains', label: 'JetBrains Mono', css: "'JetBrainsMono Nerd Font Mono', 'JetBrains Mono', monospace" },
	{ value: 'fira', label: 'Fira Code', css: "'Fira Code', 'FiraCode Nerd Font', monospace" },
	{ value: 'cascadia', label: 'Cascadia Code', css: "'Cascadia Code', 'CaskaydiaCove Nerd Font', monospace" },
	{ value: 'system', label: 'System Mono', css: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace" }
] as const;

// Terminal font size options
export const TERMINAL_FONT_SIZE_OPTIONS = [
	{ value: 'xs', label: 'XS', css: '0.75rem' },  // 12px
	{ value: 'sm', label: 'SM', css: '0.875rem' }, // 14px
	{ value: 'base', label: 'Base', css: '1rem' }, // 16px
	{ value: 'lg', label: 'LG', css: '1.125rem' }  // 18px
] as const;

// Default values
const DEFAULTS = {
	sparklineVisible: true,
	soundsEnabled: false,
	theme: 'nord',
	terminalHeight: 50, // Match UserProfile's DEFAULT_TERMINAL_HEIGHT
	outputDrawerOpen: false,
	taskSaveAction: 'close' as TaskSaveAction,
	sparklineMode: 'stacked' as SparklineMode,
	ctrlCIntercept: true, // When true, Ctrl+C sends interrupt to tmux; when false, Ctrl+C copies
	terminalFontFamily: 'jetbrains' as TerminalFontFamily,
	terminalFontSize: 'sm' as TerminalFontSize
};

// Types
// Note: TaskSaveAction matches TaskCreationDrawer's SaveAction type
export type TaskSaveAction = 'close' | 'new' | 'start';
export type SparklineMode = 'stacked' | 'overlaid';
export type TerminalFontFamily = 'jetbrains' | 'fira' | 'cascadia' | 'system';
export type TerminalFontSize = 'xs' | 'sm' | 'base' | 'lg';

// Reactive state (module-level $state)
let sparklineVisible = $state(DEFAULTS.sparklineVisible);
let soundsEnabled = $state(DEFAULTS.soundsEnabled);
let theme = $state(DEFAULTS.theme);
let terminalHeight = $state(DEFAULTS.terminalHeight);
let outputDrawerOpen = $state(DEFAULTS.outputDrawerOpen);
let taskSaveAction = $state<TaskSaveAction>(DEFAULTS.taskSaveAction);
let sparklineMode = $state<SparklineMode>(DEFAULTS.sparklineMode);
let ctrlCIntercept = $state(DEFAULTS.ctrlCIntercept);
let terminalFontFamily = $state<TerminalFontFamily>(DEFAULTS.terminalFontFamily);
let terminalFontSize = $state<TerminalFontSize>(DEFAULTS.terminalFontSize);
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

	const storedFontFamily = localStorage.getItem(STORAGE_KEYS.terminalFontFamily);
	terminalFontFamily = (storedFontFamily === 'jetbrains' || storedFontFamily === 'fira' || storedFontFamily === 'cascadia' || storedFontFamily === 'system')
		? storedFontFamily
		: DEFAULTS.terminalFontFamily;

	const storedFontSize = localStorage.getItem(STORAGE_KEYS.terminalFontSize);
	terminalFontSize = (storedFontSize === 'xs' || storedFontSize === 'sm' || storedFontSize === 'base' || storedFontSize === 'lg')
		? storedFontSize
		: DEFAULTS.terminalFontSize;

	// Apply terminal font CSS variables to document
	updateTerminalFontCSSVars();

	initialized = true;
}

/**
 * Update CSS custom properties for terminal font.
 * Called on init and when font settings change.
 */
function updateTerminalFontCSSVars(
	fontFamily: TerminalFontFamily = terminalFontFamily,
	fontSize: TerminalFontSize = terminalFontSize
): void {
	if (!browser) return;

	const fontOption = TERMINAL_FONT_OPTIONS.find(f => f.value === fontFamily);
	const sizeOption = TERMINAL_FONT_SIZE_OPTIONS.find(s => s.value === fontSize);

	if (fontOption) {
		document.documentElement.style.setProperty('--terminal-font', fontOption.css);
	}
	if (sizeOption) {
		document.documentElement.style.setProperty('--terminal-font-size', sizeOption.css);
	}
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
// Terminal Font Family
// ============================================================================

export function getTerminalFontFamily(): TerminalFontFamily {
	return terminalFontFamily;
}

export function setTerminalFontFamily(value: TerminalFontFamily): void {
	terminalFontFamily = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEYS.terminalFontFamily, value);
		updateTerminalFontCSSVars(value, terminalFontSize);
	}
}

// ============================================================================
// Terminal Font Size
// ============================================================================

export function getTerminalFontSize(): TerminalFontSize {
	return terminalFontSize;
}

export function setTerminalFontSize(value: TerminalFontSize): void {
	terminalFontSize = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEYS.terminalFontSize, value);
		updateTerminalFontCSSVars(terminalFontFamily, value);
	}
}

// ============================================================================
// Utility: Check if preferences are initialized
// ============================================================================

export function isInitialized(): boolean {
	return initialized;
}
