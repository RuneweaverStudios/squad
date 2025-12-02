/**
 * Work Sort Store
 * Shared state for WorkPanel sort options, used by TopBar and WorkPanel.
 * Persists to localStorage.
 */

import { browser } from '$app/environment';

export type SortOption = 'state' | 'priority' | 'created' | 'cost';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
	value: SortOption;
	label: string;
	icon: string;
	defaultDir: SortDirection;
}

export const SORT_OPTIONS: SortConfig[] = [
	{ value: 'state', label: 'State', icon: '🔔', defaultDir: 'asc' },
	{ value: 'priority', label: 'Priority', icon: '⚡', defaultDir: 'asc' },
	{ value: 'created', label: 'Time', icon: '⏱', defaultDir: 'desc' },
	{ value: 'cost', label: 'Cost', icon: '💰', defaultDir: 'desc' }
];

// Storage keys
const SORT_STORAGE_KEY = 'work-panel-sort';
const SORT_DIR_STORAGE_KEY = 'work-panel-sort-dir';

// Reactive state
let sortBy = $state<SortOption>('state');
let sortDir = $state<SortDirection>('asc');
let initialized = $state(false);

// Initialize from localStorage
export function initSort(): void {
	if (!browser || initialized) return;

	const savedSort = localStorage.getItem(SORT_STORAGE_KEY) as SortOption | null;
	const savedDir = localStorage.getItem(SORT_DIR_STORAGE_KEY) as SortDirection | null;

	if (savedSort && SORT_OPTIONS.some(o => o.value === savedSort)) {
		sortBy = savedSort;
	}
	if (savedDir && (savedDir === 'asc' || savedDir === 'desc')) {
		sortDir = savedDir;
	}

	initialized = true;
}

// Handle sort change - toggle direction if same, switch to new sort otherwise
export function handleSortClick(value: SortOption): void {
	if (sortBy === value) {
		// Same button - toggle direction
		sortDir = sortDir === 'asc' ? 'desc' : 'asc';
	} else {
		// Different button - switch sort and use its default direction
		sortBy = value;
		const opt = SORT_OPTIONS.find(o => o.value === value);
		sortDir = opt?.defaultDir ?? 'asc';
	}

	// Persist
	if (browser) {
		localStorage.setItem(SORT_STORAGE_KEY, sortBy);
		localStorage.setItem(SORT_DIR_STORAGE_KEY, sortDir);
	}
}

// Getters for reactive access
export function getSortBy(): SortOption {
	return sortBy;
}

export function getSortDir(): SortDirection {
	return sortDir;
}

// For direct reactive binding in components
export function getSortState(): { sortBy: SortOption; sortDir: SortDirection } {
	return { sortBy, sortDir };
}
