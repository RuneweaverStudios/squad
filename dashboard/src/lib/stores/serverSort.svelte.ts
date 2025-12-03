/**
 * Server Sort Store
 * Shared state for SessionPanel (server mode) sort options, used by TopBar and SessionPanel.
 * Persists to localStorage.
 */

import { browser } from '$app/environment';

export type ServerSortOption = 'status' | 'name' | 'port' | 'created';
export type SortDirection = 'asc' | 'desc';

export interface ServerSortConfig {
	value: ServerSortOption;
	label: string;
	icon: string;
	defaultDir: SortDirection;
}

export const SERVER_SORT_OPTIONS: ServerSortConfig[] = [
	{ value: 'status', label: 'Status', icon: '🔔', defaultDir: 'asc' },
	{ value: 'name', label: 'Name', icon: '🔤', defaultDir: 'asc' },
	{ value: 'port', label: 'Port', icon: '🔌', defaultDir: 'asc' },
	{ value: 'created', label: 'Uptime', icon: '⏱', defaultDir: 'desc' }
];

// Storage keys
const SORT_STORAGE_KEY = 'server-panel-sort';
const SORT_DIR_STORAGE_KEY = 'server-panel-sort-dir';

// Reactive state
let sortBy = $state<ServerSortOption>('status');
let sortDir = $state<SortDirection>('asc');
let initialized = $state(false);

// Initialize from localStorage
export function initServerSort(): void {
	if (!browser || initialized) return;

	const savedSort = localStorage.getItem(SORT_STORAGE_KEY) as ServerSortOption | null;
	const savedDir = localStorage.getItem(SORT_DIR_STORAGE_KEY) as SortDirection | null;

	if (savedSort && SERVER_SORT_OPTIONS.some(o => o.value === savedSort)) {
		sortBy = savedSort;
	}
	if (savedDir && (savedDir === 'asc' || savedDir === 'desc')) {
		sortDir = savedDir;
	}

	initialized = true;
}

// Handle sort change - toggle direction if same, switch to new sort otherwise
export function handleServerSortClick(value: ServerSortOption): void {
	if (sortBy === value) {
		// Same button - toggle direction
		sortDir = sortDir === 'asc' ? 'desc' : 'asc';
	} else {
		// Different button - switch sort and use its default direction
		sortBy = value;
		const opt = SERVER_SORT_OPTIONS.find(o => o.value === value);
		sortDir = opt?.defaultDir ?? 'asc';
	}

	// Persist
	if (browser) {
		localStorage.setItem(SORT_STORAGE_KEY, sortBy);
		localStorage.setItem(SORT_DIR_STORAGE_KEY, sortDir);
	}
}

// Getters for reactive access
export function getServerSortBy(): ServerSortOption {
	return sortBy;
}

export function getServerSortDir(): SortDirection {
	return sortDir;
}

// For direct reactive binding in components
export function getServerSortState(): { sortBy: ServerSortOption; sortDir: SortDirection } {
	return { sortBy, sortDir };
}
