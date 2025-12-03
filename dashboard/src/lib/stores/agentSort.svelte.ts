/**
 * Agent Sort Store
 * Shared state for AgentGrid sort options, used by TopBar and AgentGrid.
 * Persists to localStorage.
 */

import { browser } from '$app/environment';

export type AgentSortOption = 'status' | 'name' | 'tasks' | 'cost';
export type SortDirection = 'asc' | 'desc';

export interface AgentSortConfig {
	value: AgentSortOption;
	label: string;
	icon: string;
	defaultDir: SortDirection;
}

export const AGENT_SORT_OPTIONS: AgentSortConfig[] = [
	{ value: 'status', label: 'Status', icon: '🔔', defaultDir: 'asc' },
	{ value: 'name', label: 'Name', icon: '🔤', defaultDir: 'asc' },
	{ value: 'tasks', label: 'Tasks', icon: '📋', defaultDir: 'desc' },
	{ value: 'cost', label: 'Cost', icon: '💰', defaultDir: 'desc' }
];

// Storage keys
const SORT_STORAGE_KEY = 'agent-grid-sort';
const SORT_DIR_STORAGE_KEY = 'agent-grid-sort-dir';

// Reactive state
let sortBy = $state<AgentSortOption>('status');
let sortDir = $state<SortDirection>('asc');
let initialized = $state(false);

// Initialize from localStorage
export function initAgentSort(): void {
	if (!browser || initialized) return;

	const savedSort = localStorage.getItem(SORT_STORAGE_KEY) as AgentSortOption | null;
	const savedDir = localStorage.getItem(SORT_DIR_STORAGE_KEY) as SortDirection | null;

	if (savedSort && AGENT_SORT_OPTIONS.some(o => o.value === savedSort)) {
		sortBy = savedSort;
	}
	if (savedDir && (savedDir === 'asc' || savedDir === 'desc')) {
		sortDir = savedDir;
	}

	initialized = true;
}

// Handle sort change - toggle direction if same, switch to new sort otherwise
export function handleAgentSortClick(value: AgentSortOption): void {
	if (sortBy === value) {
		// Same button - toggle direction
		sortDir = sortDir === 'asc' ? 'desc' : 'asc';
	} else {
		// Different button - switch sort and use its default direction
		sortBy = value;
		const opt = AGENT_SORT_OPTIONS.find(o => o.value === value);
		sortDir = opt?.defaultDir ?? 'asc';
	}

	// Persist
	if (browser) {
		localStorage.setItem(SORT_STORAGE_KEY, sortBy);
		localStorage.setItem(SORT_DIR_STORAGE_KEY, sortDir);
	}
}

// Getters for reactive access
export function getAgentSortBy(): AgentSortOption {
	return sortBy;
}

export function getAgentSortDir(): SortDirection {
	return sortDir;
}

// For direct reactive binding in components
export function getAgentSortState(): { sortBy: AgentSortOption; sortDir: SortDirection } {
	return { sortBy, sortDir };
}
