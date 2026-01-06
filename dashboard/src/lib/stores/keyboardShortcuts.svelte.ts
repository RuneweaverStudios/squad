/**
 * Keyboard Shortcuts Store
 *
 * Manages keyboard shortcut assignments for:
 * 1. Global app shortcuts (Alt+N, Alt+E, etc.) - configurable with defaults
 * 2. Slash command shortcuts (user-assigned)
 *
 * Uses localStorage for persistence and Svelte 5 runes for reactivity.
 *
 * @see dashboard/src/lib/types/config.ts for SlashCommand type
 */

import { browser } from '$app/environment';

// Storage keys for localStorage
const STORAGE_KEY = 'command-keyboard-shortcuts';
const GLOBAL_STORAGE_KEY = 'global-keyboard-shortcuts';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Map of command invocation (e.g., "/jat:complete") to shortcut string (e.g., "Alt+C")
 */
export type ShortcutMap = Record<string, string>;

/**
 * Parsed keyboard shortcut for matching
 */
export interface ParsedShortcut {
	key: string;        // The main key (lowercase)
	alt: boolean;
	ctrl: boolean;
	shift: boolean;
	meta: boolean;      // Command key on Mac
}

/**
 * Global shortcut definition with metadata
 */
export interface GlobalShortcutDef {
	id: string;              // Unique identifier (e.g., 'new-task')
	description: string;     // Human-readable description
	defaultShortcut: string; // Default key combination (e.g., 'Alt+N')
	context?: string;        // Where this shortcut works (e.g., 'Hovered session')
	category: 'global' | 'session' | 'navigation';  // Grouping for UI
}

/**
 * Default global shortcuts - these are the factory defaults
 * Users can override these in localStorage
 */
export const DEFAULT_GLOBAL_SHORTCUTS: GlobalShortcutDef[] = [
	// Global actions (work from anywhere)
	{ id: 'new-task', description: 'Create New Task', defaultShortcut: 'Alt+N', category: 'global' },
	{ id: 'epic-swarm', description: 'Open Epic Swarm Modal', defaultShortcut: 'Alt+E', category: 'global' },
	{ id: 'start-next', description: 'Open Start Next Dropdown', defaultShortcut: 'Alt+S', category: 'global' },
	{ id: 'add-project', description: 'Add New Project', defaultShortcut: 'Alt+Shift+P', category: 'global' },
	{ id: 'toggle-terminal', description: 'Toggle Terminal Drawer', defaultShortcut: 'Ctrl+Shift+T', category: 'global' },

	// Session actions (require hovered session)
	{ id: 'attach-terminal', description: 'Attach Terminal to Session', defaultShortcut: 'Alt+A', context: 'Hovered session', category: 'session' },
	{ id: 'kill-session', description: 'Kill Session', defaultShortcut: 'Alt+K', context: 'Hovered session', category: 'session' },
	{ id: 'interrupt-session', description: 'Interrupt Session (Ctrl+C)', defaultShortcut: 'Alt+I', context: 'Hovered session', category: 'session' },
	{ id: 'pause-session', description: 'Pause Session', defaultShortcut: 'Alt+P', context: 'Hovered session', category: 'session' },
	{ id: 'restart-session', description: 'Restart Session', defaultShortcut: 'Alt+R', context: 'Hovered session', category: 'session' },
	{ id: 'copy-session', description: 'Copy Session Contents', defaultShortcut: 'Alt+Shift+C', context: 'Hovered session', category: 'session' },
];

// =============================================================================
// STATE
// =============================================================================

// Reactive state (module-level $state)
let shortcuts = $state<ShortcutMap>({});
let globalShortcuts = $state<ShortcutMap>({});  // User overrides for global shortcuts
let initialized = $state(false);

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize shortcuts from localStorage.
 * Call once in +layout.svelte onMount.
 */
export function initKeyboardShortcuts(): void {
	if (!browser || initialized) return;

	// Load command shortcuts
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored) {
		try {
			const parsed = JSON.parse(stored);
			if (typeof parsed === 'object' && parsed !== null) {
				shortcuts = parsed;
			}
		} catch {
			// Invalid JSON, start fresh
			shortcuts = {};
		}
	}

	// Load global shortcut overrides
	const globalStored = localStorage.getItem(GLOBAL_STORAGE_KEY);
	if (globalStored) {
		try {
			const parsed = JSON.parse(globalStored);
			if (typeof parsed === 'object' && parsed !== null) {
				globalShortcuts = parsed;
			}
		} catch {
			// Invalid JSON, start fresh
			globalShortcuts = {};
		}
	}

	initialized = true;
}

/**
 * Save command shortcuts to localStorage
 */
function saveToStorage(): void {
	if (!browser) return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
}

/**
 * Save global shortcuts to localStorage
 */
function saveGlobalToStorage(): void {
	if (!browser) return;
	localStorage.setItem(GLOBAL_STORAGE_KEY, JSON.stringify(globalShortcuts));
}

// =============================================================================
// GETTERS
// =============================================================================

/**
 * Get shortcut for a command invocation
 */
export function getShortcut(invocation: string): string | undefined {
	return shortcuts[invocation];
}

/**
 * Get all shortcuts as a readonly map
 */
export function getAllShortcuts(): Readonly<ShortcutMap> {
	return shortcuts;
}

/**
 * Check if a shortcut is already assigned to another command
 * Returns the invocation that has this shortcut, or undefined
 */
export function findCommandWithShortcut(shortcut: string): string | undefined {
	const normalized = normalizeShortcut(shortcut);
	for (const [invocation, assigned] of Object.entries(shortcuts)) {
		if (normalizeShortcut(assigned) === normalized) {
			return invocation;
		}
	}
	return undefined;
}

/**
 * Check if initialized
 */
export function isInitialized(): boolean {
	return initialized;
}

// =============================================================================
// GLOBAL SHORTCUT GETTERS
// =============================================================================

/**
 * Get the effective shortcut for a global action
 * Returns user override if set, otherwise the default
 */
export function getGlobalShortcut(id: string): string {
	// Check for user override first
	if (globalShortcuts[id]) {
		return globalShortcuts[id];
	}
	// Fall back to default
	const def = DEFAULT_GLOBAL_SHORTCUTS.find(s => s.id === id);
	return def?.defaultShortcut || '';
}

/**
 * Get all global shortcuts (merged defaults with user overrides)
 */
export function getAllGlobalShortcuts(): Array<GlobalShortcutDef & { currentShortcut: string; isCustom: boolean }> {
	return DEFAULT_GLOBAL_SHORTCUTS.map(def => ({
		...def,
		currentShortcut: globalShortcuts[def.id] || def.defaultShortcut,
		isCustom: !!globalShortcuts[def.id]
	}));
}

/**
 * Get just the user overrides for global shortcuts
 */
export function getGlobalShortcutOverrides(): Readonly<ShortcutMap> {
	return globalShortcuts;
}

/**
 * Check if a shortcut conflicts with an existing global shortcut
 * Returns the conflicting shortcut id, or undefined
 */
export function findGlobalShortcutConflict(shortcut: string, excludeId?: string): string | undefined {
	const normalized = normalizeShortcut(shortcut);

	for (const def of DEFAULT_GLOBAL_SHORTCUTS) {
		if (def.id === excludeId) continue;
		const currentShortcut = globalShortcuts[def.id] || def.defaultShortcut;
		if (normalizeShortcut(currentShortcut) === normalized) {
			return def.id;
		}
	}

	return undefined;
}

/**
 * Find global shortcut that matches a keyboard event
 * Returns the shortcut id or undefined
 */
export function findMatchingGlobalShortcut(event: KeyboardEvent): string | undefined {
	for (const def of DEFAULT_GLOBAL_SHORTCUTS) {
		const currentShortcut = globalShortcuts[def.id] || def.defaultShortcut;
		if (matchesShortcut(event, currentShortcut)) {
			return def.id;
		}
	}
	return undefined;
}

// =============================================================================
// SETTERS
// =============================================================================

/**
 * Set or update shortcut for a command
 * Pass empty string or undefined to remove
 */
export function setShortcut(invocation: string, shortcut: string | undefined): void {
	if (!shortcut || shortcut.trim() === '') {
		// Remove shortcut
		const { [invocation]: _, ...rest } = shortcuts;
		shortcuts = rest;
	} else {
		// Add/update shortcut
		shortcuts = {
			...shortcuts,
			[invocation]: normalizeShortcut(shortcut)
		};
	}
	saveToStorage();
}

/**
 * Remove shortcut for a command
 */
export function removeShortcut(invocation: string): void {
	setShortcut(invocation, undefined);
}

/**
 * Clear all shortcuts
 */
export function clearAllShortcuts(): void {
	shortcuts = {};
	saveToStorage();
}

// =============================================================================
// GLOBAL SHORTCUT SETTERS
// =============================================================================

/**
 * Set a custom shortcut for a global action
 * Pass empty string or undefined to reset to default
 */
export function setGlobalShortcut(id: string, shortcut: string | undefined): void {
	if (!shortcut || shortcut.trim() === '') {
		// Remove override (reset to default)
		const { [id]: _, ...rest } = globalShortcuts;
		globalShortcuts = rest;
	} else {
		// Add/update override
		globalShortcuts = {
			...globalShortcuts,
			[id]: normalizeShortcut(shortcut)
		};
	}
	saveGlobalToStorage();
}

/**
 * Reset a global shortcut to its default value
 */
export function resetGlobalShortcut(id: string): void {
	setGlobalShortcut(id, undefined);
}

/**
 * Reset all global shortcuts to defaults
 */
export function resetAllGlobalShortcuts(): void {
	globalShortcuts = {};
	saveGlobalToStorage();
}

// =============================================================================
// SHORTCUT PARSING & NORMALIZATION
// =============================================================================

/**
 * Normalize a shortcut string to consistent format
 * e.g., "alt+c" -> "Alt+C", "Ctrl+Shift+s" -> "Ctrl+Shift+S"
 */
export function normalizeShortcut(shortcut: string): string {
	const parsed = parseShortcut(shortcut);
	return formatShortcut(parsed);
}

/**
 * Parse a shortcut string into components
 */
export function parseShortcut(shortcut: string): ParsedShortcut {
	const parts = shortcut.toLowerCase().split('+').map(p => p.trim());

	const result: ParsedShortcut = {
		key: '',
		alt: false,
		ctrl: false,
		shift: false,
		meta: false
	};

	for (const part of parts) {
		switch (part) {
			case 'alt':
			case 'option':
				result.alt = true;
				break;
			case 'ctrl':
			case 'control':
				result.ctrl = true;
				break;
			case 'shift':
				result.shift = true;
				break;
			case 'meta':
			case 'cmd':
			case 'command':
			case 'win':
			case 'windows':
				result.meta = true;
				break;
			default:
				// This is the main key
				result.key = part;
		}
	}

	return result;
}

/**
 * Format a parsed shortcut back to string
 */
export function formatShortcut(parsed: ParsedShortcut): string {
	const parts: string[] = [];

	if (parsed.ctrl) parts.push('Ctrl');
	if (parsed.alt) parts.push('Alt');
	if (parsed.shift) parts.push('Shift');
	if (parsed.meta) parts.push('Meta');

	if (parsed.key) {
		// Capitalize single letter keys, otherwise keep as-is
		const displayKey = parsed.key.length === 1
			? parsed.key.toUpperCase()
			: parsed.key.charAt(0).toUpperCase() + parsed.key.slice(1);
		parts.push(displayKey);
	}

	return parts.join('+');
}

/**
 * Check if a keyboard event matches a shortcut string
 */
export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
	const parsed = parseShortcut(shortcut);

	// Check modifier keys
	if (parsed.alt !== event.altKey) return false;
	if (parsed.ctrl !== event.ctrlKey) return false;
	if (parsed.shift !== event.shiftKey) return false;
	if (parsed.meta !== event.metaKey) return false;

	// Check main key (case-insensitive)
	const eventKey = event.key.toLowerCase();
	const shortcutKey = parsed.key.toLowerCase();

	// Direct key match
	if (eventKey === shortcutKey) return true;

	// Fallback: check event.code for single letter keys (more reliable with Alt modifier)
	// Alt+key can produce special characters on some systems, but event.code is consistent
	if (shortcutKey.length === 1 && /^[a-z]$/.test(shortcutKey)) {
		const expectedCode = `Key${shortcutKey.toUpperCase()}`;
		if (event.code === expectedCode) return true;
	}

	return false;
}

/**
 * Find command invocation that matches a keyboard event
 * Returns undefined if no match
 */
export function findMatchingCommand(event: KeyboardEvent): string | undefined {
	for (const [invocation, shortcut] of Object.entries(shortcuts)) {
		if (matchesShortcut(event, shortcut)) {
			return invocation;
		}
	}
	return undefined;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate a shortcut string
 * Returns error message or undefined if valid
 */
export function validateShortcut(shortcut: string): string | undefined {
	if (!shortcut || shortcut.trim() === '') {
		return undefined; // Empty is valid (means no shortcut)
	}

	const parsed = parseShortcut(shortcut);

	// Must have at least one modifier key
	if (!parsed.alt && !parsed.ctrl && !parsed.meta) {
		return 'Shortcut must include Alt, Ctrl, or Meta/Cmd modifier';
	}

	// Must have a main key
	if (!parsed.key) {
		return 'Shortcut must include a key (e.g., A, B, 1, etc.)';
	}

	// Main key should be a single character or known special key
	const validSpecialKeys = ['escape', 'enter', 'tab', 'space', 'backspace', 'delete',
		'up', 'down', 'left', 'right', 'home', 'end', 'pageup', 'pagedown',
		'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12'];

	if (parsed.key.length > 1 && !validSpecialKeys.includes(parsed.key.toLowerCase())) {
		return `Invalid key: "${parsed.key}"`;
	}

	return undefined;
}

/**
 * Check if a shortcut conflicts with common browser/system shortcuts
 * Returns warning message or undefined
 */
export function checkShortcutConflict(shortcut: string): string | undefined {
	const parsed = parseShortcut(shortcut);
	const key = parsed.key.toLowerCase();

	// Common browser shortcuts to warn about
	const browserConflicts: Record<string, string> = {
		// Ctrl shortcuts
		'ctrl+c': 'copy',
		'ctrl+v': 'paste',
		'ctrl+x': 'cut',
		'ctrl+z': 'undo',
		'ctrl+y': 'redo',
		'ctrl+a': 'select all',
		'ctrl+s': 'save',
		'ctrl+f': 'find',
		'ctrl+p': 'print',
		'ctrl+n': 'new window',
		'ctrl+t': 'new tab',
		'ctrl+w': 'close tab',
		'ctrl+r': 'refresh',
		// Alt shortcuts are generally safe for custom use
	};

	const normalized = normalizeShortcut(shortcut).toLowerCase();
	const conflict = browserConflicts[normalized];

	if (conflict) {
		return `Warning: ${normalizeShortcut(shortcut)} conflicts with browser "${conflict}" shortcut`;
	}

	return undefined;
}

// =============================================================================
// DISPLAY HELPERS
// =============================================================================

/**
 * Get a display-friendly version of a shortcut
 * Uses platform-appropriate symbols (⌘ for Mac, Ctrl for Windows/Linux)
 */
export function getDisplayShortcut(shortcut: string): string {
	if (!browser) return shortcut;

	const parsed = parseShortcut(shortcut);
	const isMac = navigator.platform.toLowerCase().includes('mac');

	const parts: string[] = [];

	if (parsed.ctrl) parts.push(isMac ? '⌃' : 'Ctrl');
	if (parsed.alt) parts.push(isMac ? '⌥' : 'Alt');
	if (parsed.shift) parts.push(isMac ? '⇧' : 'Shift');
	if (parsed.meta) parts.push(isMac ? '⌘' : 'Win');

	if (parsed.key) {
		const displayKey = parsed.key.length === 1
			? parsed.key.toUpperCase()
			: parsed.key.charAt(0).toUpperCase() + parsed.key.slice(1);
		parts.push(displayKey);
	}

	return isMac ? parts.join('') : parts.join('+');
}
