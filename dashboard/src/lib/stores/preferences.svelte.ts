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
	terminalFontSize: 'terminal-font-size',
	terminalScrollback: 'terminal-scrollback-lines',
	epicCelebration: 'epic-celebration-enabled',
	epicAutoClose: 'epic-auto-close-enabled',
	maxSessions: 'max-concurrent-sessions',
	collapsedEpics: 'tasktable-collapsed-epics'
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

// Terminal scrollback options (lines to retain)
export const TERMINAL_SCROLLBACK_OPTIONS = [
	{ value: 500, label: '500' },
	{ value: 1000, label: '1K' },
	{ value: 2000, label: '2K' },
	{ value: 5000, label: '5K' },
	{ value: 10000, label: '10K' }
] as const;

// Max concurrent sessions options
export const MAX_SESSIONS_OPTIONS = [
	{ value: 4, label: '4' },
	{ value: 6, label: '6' },
	{ value: 8, label: '8' },
	{ value: 10, label: '10' },
	{ value: 12, label: '12' },
	{ value: 16, label: '16' },
	{ value: 20, label: '20' }
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
	terminalFontSize: 'sm' as TerminalFontSize,
	terminalScrollback: 2000 as TerminalScrollback,
	epicCelebration: true, // Show toast + sound when all epic children complete
	epicAutoClose: false, // Automatically close epic when all children complete
	maxSessions: 12 as MaxSessions, // Maximum concurrent agent sessions
	collapsedEpics: [] as string[] // Task IDs of collapsed epics/groups in TaskTable
};

// Types
// Note: TaskSaveAction matches TaskCreationDrawer's SaveAction type
export type TaskSaveAction = 'close' | 'new' | 'start';
export type SparklineMode = 'stacked' | 'overlaid';
export type TerminalFontFamily = 'jetbrains' | 'fira' | 'cascadia' | 'system';
export type TerminalFontSize = 'xs' | 'sm' | 'base' | 'lg';
export type TerminalScrollback = 500 | 1000 | 2000 | 5000 | 10000;
export type MaxSessions = 4 | 6 | 8 | 10 | 12 | 16 | 20;

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
let terminalScrollback = $state<TerminalScrollback>(DEFAULTS.terminalScrollback);
let epicCelebration = $state(DEFAULTS.epicCelebration);
let epicAutoClose = $state(DEFAULTS.epicAutoClose);
let maxSessions = $state<MaxSessions>(DEFAULTS.maxSessions);
let collapsedEpics = $state<string[]>(DEFAULTS.collapsedEpics);
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

	const storedScrollback = localStorage.getItem(STORAGE_KEYS.terminalScrollback);
	const parsedScrollback = storedScrollback ? parseInt(storedScrollback, 10) : null;
	terminalScrollback = (parsedScrollback === 500 || parsedScrollback === 1000 || parsedScrollback === 2000 || parsedScrollback === 5000 || parsedScrollback === 10000)
		? parsedScrollback
		: DEFAULTS.terminalScrollback;

	const storedEpicCelebration = localStorage.getItem(STORAGE_KEYS.epicCelebration);
	epicCelebration = storedEpicCelebration === null ? DEFAULTS.epicCelebration : storedEpicCelebration === 'true';

	const storedEpicAutoClose = localStorage.getItem(STORAGE_KEYS.epicAutoClose);
	epicAutoClose = storedEpicAutoClose === null ? DEFAULTS.epicAutoClose : storedEpicAutoClose === 'true';

	const storedMaxSessions = localStorage.getItem(STORAGE_KEYS.maxSessions);
	const parsedMaxSessions = storedMaxSessions ? parseInt(storedMaxSessions, 10) : null;
	maxSessions = (parsedMaxSessions === 4 || parsedMaxSessions === 6 || parsedMaxSessions === 8 || parsedMaxSessions === 10 || parsedMaxSessions === 12 || parsedMaxSessions === 16 || parsedMaxSessions === 20)
		? parsedMaxSessions
		: DEFAULTS.maxSessions;

	const storedCollapsedEpics = localStorage.getItem(STORAGE_KEYS.collapsedEpics);
	if (storedCollapsedEpics) {
		try {
			const parsed = JSON.parse(storedCollapsedEpics);
			collapsedEpics = Array.isArray(parsed) ? parsed : DEFAULTS.collapsedEpics;
		} catch {
			collapsedEpics = DEFAULTS.collapsedEpics;
		}
	} else {
		collapsedEpics = DEFAULTS.collapsedEpics;
	}

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
// Terminal Scrollback Limit
// ============================================================================

export function getTerminalScrollback(): TerminalScrollback {
	return terminalScrollback;
}

export function setTerminalScrollback(value: TerminalScrollback): void {
	terminalScrollback = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEYS.terminalScrollback, String(value));
	}
}

// ============================================================================
// Epic Celebration (toast + sound when epic children all complete)
// ============================================================================

export function getEpicCelebration(): boolean {
	return epicCelebration;
}

export function setEpicCelebration(value: boolean): void {
	epicCelebration = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEYS.epicCelebration, String(value));
	}
}

export function toggleEpicCelebration(): boolean {
	setEpicCelebration(!epicCelebration);
	return epicCelebration;
}

// ============================================================================
// Epic Auto-Close (automatically close epic when all children complete)
// ============================================================================

export function getEpicAutoClose(): boolean {
	return epicAutoClose;
}

export function setEpicAutoClose(value: boolean): void {
	epicAutoClose = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEYS.epicAutoClose, String(value));
	}
}

export function toggleEpicAutoClose(): boolean {
	setEpicAutoClose(!epicAutoClose);
	return epicAutoClose;
}

// ============================================================================
// Max Concurrent Sessions (for Run All Ready swarm limit)
// ============================================================================

export function getMaxSessions(): MaxSessions {
	return maxSessions;
}

export function setMaxSessions(value: MaxSessions): void {
	maxSessions = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEYS.maxSessions, String(value));
	}
}

// ============================================================================
// Collapsed Epics (TaskTable group collapse state persistence)
// ============================================================================

export function getCollapsedEpics(): string[] {
	return collapsedEpics;
}

export function setCollapsedEpics(value: string[]): void {
	collapsedEpics = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEYS.collapsedEpics, JSON.stringify(value));
	}
}

export function toggleCollapsedEpic(epicId: string): void {
	const newValue = collapsedEpics.includes(epicId)
		? collapsedEpics.filter(id => id !== epicId)
		: [...collapsedEpics, epicId];
	setCollapsedEpics(newValue);
}

export function isEpicCollapsed(epicId: string): boolean {
	return collapsedEpics.includes(epicId);
}

export function clearCollapsedEpics(): void {
	setCollapsedEpics([]);
}

// ============================================================================
// Utility: Check if preferences are initialized
// ============================================================================

export function isInitialized(): boolean {
	return initialized;
}
