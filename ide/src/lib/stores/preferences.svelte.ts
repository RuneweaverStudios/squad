/**
 * Unified User Preferences Store
 *
 * Single reactive store for all user preferences with localStorage persistence.
 * Uses Svelte 5 runes for automatic reactivity - no custom events needed.
 */

import { browser } from '$app/environment';

// Storage keys
const STORAGE_KEYS = {
	sparklineVisible: 'sparkline-visible',
	soundsEnabled: 'ide-sounds-enabled',
	theme: 'theme',
	terminalHeight: 'user-terminal-height',
	sessionMaximizeHeight: 'session-maximize-height',
	taskSaveAction: 'taskDrawer.savePreference', // Match TaskCreationDrawer
	sparklineMode: 'sparkline-multi-series-mode',
	ctrlCIntercept: 'ctrl-c-intercept-enabled',
	terminalFontFamily: 'terminal-font-family',
	terminalFontSize: 'terminal-font-size',
	terminalScrollback: 'terminal-scrollback-lines',
	epicCelebration: 'epic-celebration-enabled',
	epicAutoClose: 'epic-auto-close-enabled',
	maxSessions: 'max-concurrent-sessions',
	collapsedEpics: 'tasktable-collapsed-epics',
	activeProject: 'active-project', // Currently selected project (used across pages)
	notificationsEnabled: 'push-notifications-enabled', // Browser push notifications
	faviconBadgeEnabled: 'favicon-badge-enabled', // Favicon badge with count
	titleBadgeEnabled: 'title-badge-enabled', // Title prefix with count
	sidebarCollapsed: 'sidebar-collapsed', // Sidebar narrow/icon-only mode
	toastNeedsInput: 'toast-needs-input', // Toast when agent needs input
	toastReview: 'toast-review', // Toast when agent ready for review
	toastComplete: 'toast-complete' // Toast when agent completes task
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

// Session maximize height options (percentage of viewport height)
export const SESSION_MAXIMIZE_HEIGHT_OPTIONS = [
	{ value: 50, label: '50%' },
	{ value: 60, label: '60%' },
	{ value: 70, label: '70%' },
	{ value: 80, label: '80%' },
	{ value: 90, label: '90%' }
] as const;

export type SessionMaximizeHeight = 50 | 60 | 70 | 80 | 90;

// Default values
const DEFAULTS = {
	sparklineVisible: true,
	soundsEnabled: false,
	theme: 'squad',
	terminalHeight: 50, // Match UserProfile's DEFAULT_TERMINAL_HEIGHT
	sessionMaximizeHeight: 70 as SessionMaximizeHeight, // Viewport % when clicking to maximize session
	taskSaveAction: 'close' as TaskSaveAction,
	sparklineMode: 'stacked' as SparklineMode,
	ctrlCIntercept: false, // When false, Ctrl+C copies (browser default); when true, Ctrl+C sends interrupt to tmux
	terminalFontFamily: 'jetbrains' as TerminalFontFamily,
	terminalFontSize: 'sm' as TerminalFontSize,
	terminalScrollback: 2000 as TerminalScrollback,
	epicCelebration: true, // Show toast + sound when all epic children complete
	epicAutoClose: false, // Automatically close epic when all children complete
	maxSessions: 12 as MaxSessions, // Maximum concurrent agent sessions
	collapsedEpics: [] as string[], // Task IDs of collapsed epics/groups in TaskTable
	activeProject: null as string | null, // Currently selected project (consistent across pages)
	notificationsEnabled: true, // Browser push notifications (requires permission)
	faviconBadgeEnabled: true, // Show count on favicon when agents need attention
	titleBadgeEnabled: true, // Show count in document title when agents need attention
	sidebarCollapsed: false, // Sidebar narrow/icon-only mode
	toastNeedsInput: true, // Toast when agent needs input
	toastReview: true, // Toast when agent ready for review
	toastComplete: true // Toast when agent completes task
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
let sessionMaximizeHeight = $state<SessionMaximizeHeight>(DEFAULTS.sessionMaximizeHeight);
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
let activeProject = $state<string | null>(DEFAULTS.activeProject);
let notificationsEnabled = $state(DEFAULTS.notificationsEnabled);
let faviconBadgeEnabled = $state(DEFAULTS.faviconBadgeEnabled);
let titleBadgeEnabled = $state(DEFAULTS.titleBadgeEnabled);
let sidebarCollapsed = $state(DEFAULTS.sidebarCollapsed);
let toastNeedsInput = $state(DEFAULTS.toastNeedsInput);
let toastReview = $state(DEFAULTS.toastReview);
let toastComplete = $state(DEFAULTS.toastComplete);
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

	const storedSessionMaxHeight = localStorage.getItem(STORAGE_KEYS.sessionMaximizeHeight);
	const parsedSessionMaxHeight = storedSessionMaxHeight ? parseInt(storedSessionMaxHeight, 10) : null;
	sessionMaximizeHeight = (parsedSessionMaxHeight === 50 || parsedSessionMaxHeight === 60 || parsedSessionMaxHeight === 70 || parsedSessionMaxHeight === 80 || parsedSessionMaxHeight === 90)
		? parsedSessionMaxHeight
		: DEFAULTS.sessionMaximizeHeight;

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

	// Load active project (string or null)
	activeProject = localStorage.getItem(STORAGE_KEYS.activeProject);

	// Load notification preferences
	const storedNotificationsEnabled = localStorage.getItem(STORAGE_KEYS.notificationsEnabled);
	notificationsEnabled = storedNotificationsEnabled === null ? DEFAULTS.notificationsEnabled : storedNotificationsEnabled === 'true';

	const storedFaviconBadgeEnabled = localStorage.getItem(STORAGE_KEYS.faviconBadgeEnabled);
	faviconBadgeEnabled = storedFaviconBadgeEnabled === null ? DEFAULTS.faviconBadgeEnabled : storedFaviconBadgeEnabled === 'true';

	const storedTitleBadgeEnabled = localStorage.getItem(STORAGE_KEYS.titleBadgeEnabled);
	titleBadgeEnabled = storedTitleBadgeEnabled === null ? DEFAULTS.titleBadgeEnabled : storedTitleBadgeEnabled === 'true';

	const storedSidebarCollapsed = localStorage.getItem(STORAGE_KEYS.sidebarCollapsed);
	sidebarCollapsed = storedSidebarCollapsed === null ? DEFAULTS.sidebarCollapsed : storedSidebarCollapsed === 'true';

	// Load signal toast notification preferences
	const storedToastNeedsInput = localStorage.getItem(STORAGE_KEYS.toastNeedsInput);
	toastNeedsInput = storedToastNeedsInput === null ? DEFAULTS.toastNeedsInput : storedToastNeedsInput === 'true';

	const storedToastReview = localStorage.getItem(STORAGE_KEYS.toastReview);
	toastReview = storedToastReview === null ? DEFAULTS.toastReview : storedToastReview === 'true';

	const storedToastComplete = localStorage.getItem(STORAGE_KEYS.toastComplete);
	toastComplete = storedToastComplete === null ? DEFAULTS.toastComplete : storedToastComplete === 'true';

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
// Session Maximize Height (click-to-expand height for session cards)
// ============================================================================

export function getSessionMaximizeHeight(): SessionMaximizeHeight {
	return sessionMaximizeHeight;
}

export function setSessionMaximizeHeight(value: SessionMaximizeHeight): void {
	sessionMaximizeHeight = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEYS.sessionMaximizeHeight, String(value));
	}
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

/**
 * Clean up collapsedEpics by removing IDs that no longer exist in the task list.
 * Call this periodically (e.g., when tasks are fetched) to prevent memory leak.
 *
 * @param existingTaskIds - Set of all current task IDs
 */
export function cleanupCollapsedEpics(existingTaskIds: Set<string>): void {
	const before = collapsedEpics.length;
	const cleaned = collapsedEpics.filter(id => existingTaskIds.has(id));
	if (cleaned.length !== before) {
		setCollapsedEpics(cleaned);
		console.log(`[preferences] Cleaned up ${before - cleaned.length} stale collapsed epic IDs`);
	}
}

// ============================================================================
// Active Project (currently selected project, consistent across pages)
// ============================================================================

export function getActiveProject(): string | null {
	return activeProject;
}

export function setActiveProject(value: string | null): void {
	activeProject = value;
	if (browser) {
		if (value) {
			localStorage.setItem(STORAGE_KEYS.activeProject, value);
		} else {
			localStorage.removeItem(STORAGE_KEYS.activeProject);
		}
	}
}

// ============================================================================
// Notifications (Browser Push Notifications)
// ============================================================================

export function getNotificationsEnabled(): boolean {
	return notificationsEnabled;
}

export function setNotificationsEnabled(value: boolean): void {
	notificationsEnabled = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEYS.notificationsEnabled, String(value));
	}
}

export function toggleNotificationsEnabled(): boolean {
	setNotificationsEnabled(!notificationsEnabled);
	return notificationsEnabled;
}

// ============================================================================
// Favicon Badge (Show count on favicon)
// ============================================================================

export function getFaviconBadgeEnabled(): boolean {
	return faviconBadgeEnabled;
}

export function setFaviconBadgeEnabled(value: boolean): void {
	faviconBadgeEnabled = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEYS.faviconBadgeEnabled, String(value));
	}
}

export function toggleFaviconBadgeEnabled(): boolean {
	setFaviconBadgeEnabled(!faviconBadgeEnabled);
	return faviconBadgeEnabled;
}

// ============================================================================
// Title Badge (Show count in document title)
// ============================================================================

export function getTitleBadgeEnabled(): boolean {
	return titleBadgeEnabled;
}

export function setTitleBadgeEnabled(value: boolean): void {
	titleBadgeEnabled = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEYS.titleBadgeEnabled, String(value));
	}
}

export function toggleTitleBadgeEnabled(): boolean {
	setTitleBadgeEnabled(!titleBadgeEnabled);
	return titleBadgeEnabled;
}

// ============================================================================
// Sidebar Collapsed (narrow icon-only mode)
// ============================================================================

export function getSidebarCollapsed(): boolean {
	return sidebarCollapsed;
}

export function setSidebarCollapsed(value: boolean): void {
	sidebarCollapsed = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEYS.sidebarCollapsed, String(value));
	}
}

export function toggleSidebarCollapsed(): boolean {
	setSidebarCollapsed(!sidebarCollapsed);
	return sidebarCollapsed;
}

// ============================================================================
// Toast: Needs Input (signal-based notification)
// ============================================================================

export function getToastNeedsInput(): boolean {
	return toastNeedsInput;
}

export function setToastNeedsInput(value: boolean): void {
	toastNeedsInput = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEYS.toastNeedsInput, String(value));
	}
}

export function toggleToastNeedsInput(): boolean {
	setToastNeedsInput(!toastNeedsInput);
	return toastNeedsInput;
}

// ============================================================================
// Toast: Review (signal-based notification)
// ============================================================================

export function getToastReview(): boolean {
	return toastReview;
}

export function setToastReview(value: boolean): void {
	toastReview = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEYS.toastReview, String(value));
	}
}

export function toggleToastReview(): boolean {
	setToastReview(!toastReview);
	return toastReview;
}

// ============================================================================
// Toast: Complete (signal-based notification)
// ============================================================================

export function getToastComplete(): boolean {
	return toastComplete;
}

export function setToastComplete(value: boolean): void {
	toastComplete = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEYS.toastComplete, String(value));
	}
}

export function toggleToastComplete(): boolean {
	setToastComplete(!toastComplete);
	return toastComplete;
}

// ============================================================================
// Utility: Check if preferences are initialized
// ============================================================================

export function isInitialized(): boolean {
	return initialized;
}
