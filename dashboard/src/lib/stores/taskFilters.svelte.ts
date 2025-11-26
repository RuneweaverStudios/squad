/**
 * Task Filters Store
 *
 * Shared filter state management for TaskTable and TaskQueue.
 * Provides reactive filter state with automatic URL synchronization.
 *
 * Consolidates duplicate filter logic from:
 * - TaskTable.svelte: lines 30-132 (filter state + URL sync)
 * - TaskQueue.svelte: lines 13-75 (similar pattern)
 */

import { FILTER_DEFAULTS } from '$lib/config/constants';

/**
 * Filter state interface.
 */
export interface TaskFilterState {
	searchQuery: string;
	selectedProjects: Set<string>;
	selectedPriorities: Set<string>;
	selectedStatuses: Set<string>;
	selectedTypes: Set<string>;
	selectedLabels: Set<string>;
}

/**
 * Filter defaults configuration.
 * Components can provide custom defaults.
 */
export interface FilterDefaults {
	priorities?: readonly string[] | string[];
	statuses?: readonly string[] | string[];
	types?: readonly string[] | string[];
	labels?: readonly string[] | string[];
	projects?: readonly string[] | string[];
}

/**
 * URL parameter mapping for filters.
 */
const URL_PARAM_MAP = {
	searchQuery: 'search',
	selectedProjects: 'projects',
	selectedPriorities: 'priorities',
	selectedStatuses: 'statuses',
	selectedTypes: 'types',
	selectedLabels: 'labels'
} as const;

/**
 * Create initial filter state from defaults.
 *
 * @param defaults - Custom default values
 * @returns Initial filter state
 */
export function createInitialFilterState(defaults: FilterDefaults = {}): TaskFilterState {
	return {
		searchQuery: '',
		selectedProjects: new Set(defaults.projects || []),
		selectedPriorities: new Set(defaults.priorities || FILTER_DEFAULTS.PRIORITIES),
		selectedStatuses: new Set(defaults.statuses || []),
		selectedTypes: new Set(defaults.types || []),
		selectedLabels: new Set(defaults.labels || [])
	};
}

/**
 * Parse URL search params into filter state.
 * Falls back to provided defaults if param not in URL.
 *
 * @param params - URL search params
 * @param defaults - Default values for missing params
 * @returns Parsed filter state
 *
 * @example
 * const params = new URLSearchParams(window.location.search);
 * const filters = parseFiltersFromURL(params, { statuses: ['open'] });
 */
export function parseFiltersFromURL(
	params: URLSearchParams,
	defaults: FilterDefaults = {}
): TaskFilterState {
	const searchQuery = params.get(URL_PARAM_MAP.searchQuery) || '';

	const projectsParam = params.get(URL_PARAM_MAP.selectedProjects);
	const selectedProjects = projectsParam
		? new Set(projectsParam.split(',').filter(Boolean))
		: new Set(defaults.projects || []);

	const prioritiesParam = params.get(URL_PARAM_MAP.selectedPriorities);
	const selectedPriorities = prioritiesParam
		? new Set(prioritiesParam.split(',').filter(Boolean))
		: new Set(defaults.priorities || FILTER_DEFAULTS.PRIORITIES);

	const statusesParam = params.get(URL_PARAM_MAP.selectedStatuses);
	const selectedStatuses = statusesParam
		? new Set(statusesParam.split(',').filter(Boolean))
		: new Set(defaults.statuses || []);

	const typesParam = params.get(URL_PARAM_MAP.selectedTypes);
	const selectedTypes = typesParam
		? new Set(typesParam.split(',').filter(Boolean))
		: new Set(defaults.types || []);

	const labelsParam = params.get(URL_PARAM_MAP.selectedLabels);
	const selectedLabels = labelsParam
		? new Set(labelsParam.split(',').filter(Boolean))
		: new Set(defaults.labels || []);

	return {
		searchQuery,
		selectedProjects,
		selectedPriorities,
		selectedStatuses,
		selectedTypes,
		selectedLabels
	};
}

/**
 * Build URL search params from filter state.
 * Only includes params that differ from defaults or have values.
 *
 * @param filters - Current filter state
 * @param defaults - Default values (omitted from URL if matching)
 * @returns URLSearchParams object
 *
 * @example
 * const params = buildURLFromFilters(filters, { priorities: ['0','1','2','3'] });
 * const newURL = params.toString() ? `?${params.toString()}` : window.location.pathname;
 */
export function buildURLFromFilters(
	filters: TaskFilterState,
	defaults: FilterDefaults = {}
): URLSearchParams {
	const params = new URLSearchParams();

	// Search query
	if (filters.searchQuery) {
		params.set(URL_PARAM_MAP.searchQuery, filters.searchQuery);
	}

	// Projects (include if any selected)
	if (filters.selectedProjects.size > 0) {
		params.set(URL_PARAM_MAP.selectedProjects, Array.from(filters.selectedProjects).join(','));
	}

	// Priorities (only include if different from default "all")
	const defaultPriorities = defaults.priorities || FILTER_DEFAULTS.PRIORITIES;
	if (filters.selectedPriorities.size > 0 && filters.selectedPriorities.size < defaultPriorities.length) {
		params.set(URL_PARAM_MAP.selectedPriorities, Array.from(filters.selectedPriorities).join(','));
	}

	// Statuses (include if any selected)
	if (filters.selectedStatuses.size > 0) {
		params.set(URL_PARAM_MAP.selectedStatuses, Array.from(filters.selectedStatuses).join(','));
	}

	// Types (include if any selected)
	if (filters.selectedTypes.size > 0) {
		params.set(URL_PARAM_MAP.selectedTypes, Array.from(filters.selectedTypes).join(','));
	}

	// Labels (include if any selected)
	if (filters.selectedLabels.size > 0) {
		params.set(URL_PARAM_MAP.selectedLabels, Array.from(filters.selectedLabels).join(','));
	}

	return params;
}

/**
 * Sync filter state to URL without triggering navigation.
 * Uses replaceState to update URL in place.
 *
 * @param filters - Current filter state
 * @param defaults - Default values
 */
export function syncFiltersToURL(
	filters: TaskFilterState,
	defaults: FilterDefaults = {}
): void {
	const params = buildURLFromFilters(filters, defaults);
	const newURL = params.toString() ? `?${params.toString()}` : window.location.pathname;
	window.history.replaceState({}, '', newURL);
}

/**
 * Toggle an item in a Set (add if not present, remove if present).
 * Returns a NEW Set to trigger Svelte reactivity.
 *
 * @param set - The current Set
 * @param item - Item to toggle
 * @returns A new Set with the item toggled
 */
export function toggleFilterItem<T>(set: Set<T>, item: T): Set<T> {
	const newSet = new Set(set);
	if (newSet.has(item)) {
		newSet.delete(item);
	} else {
		newSet.add(item);
	}
	return newSet;
}

/**
 * Check if any filters are active (beyond defaults).
 *
 * @param filters - Current filter state
 * @param defaults - Default values to compare against
 * @returns true if any filter has non-default values
 */
export function hasActiveFilters(
	filters: TaskFilterState,
	defaults: FilterDefaults = {}
): boolean {
	// Search query is active if non-empty
	if (filters.searchQuery.trim()) return true;

	// Projects are active if any selected (default is none)
	if (filters.selectedProjects.size > 0 && !defaults.projects?.length) return true;

	// Priorities are active if different from default
	const defaultPriorities = new Set(defaults.priorities || FILTER_DEFAULTS.PRIORITIES);
	if (filters.selectedPriorities.size !== defaultPriorities.size) return true;
	for (const p of filters.selectedPriorities) {
		if (!defaultPriorities.has(p)) return true;
	}

	// Statuses are active if different from default
	const defaultStatuses = new Set(defaults.statuses || []);
	if (filters.selectedStatuses.size !== defaultStatuses.size) return true;
	for (const s of filters.selectedStatuses) {
		if (!defaultStatuses.has(s)) return true;
	}

	// Types are active if any selected
	if (filters.selectedTypes.size > 0) return true;

	// Labels are active if any selected
	if (filters.selectedLabels.size > 0) return true;

	return false;
}

/**
 * Clear all filters to defaults.
 *
 * @param defaults - Default values to reset to
 * @returns Reset filter state
 */
export function clearFilters(defaults: FilterDefaults = {}): TaskFilterState {
	return createInitialFilterState(defaults);
}

/**
 * Count total number of active filter selections.
 *
 * @param filters - Current filter state
 * @returns Total count of selected items across all filters
 */
export function countFilterSelections(filters: TaskFilterState): number {
	let count = 0;
	if (filters.searchQuery.trim()) count++;
	count += filters.selectedProjects.size;
	count += filters.selectedPriorities.size;
	count += filters.selectedStatuses.size;
	count += filters.selectedTypes.size;
	count += filters.selectedLabels.size;
	return count;
}

/**
 * Preset configurations for different components.
 */
export const FILTER_PRESETS = {
	/**
	 * TaskTable defaults: show open + in_progress tasks
	 */
	taskTable: {
		priorities: FILTER_DEFAULTS.PRIORITIES,
		statuses: FILTER_DEFAULTS.TASK_TABLE_STATUSES
	} as FilterDefaults,

	/**
	 * TaskQueue defaults: show open tasks only
	 */
	taskQueue: {
		priorities: FILTER_DEFAULTS.PRIORITIES,
		statuses: FILTER_DEFAULTS.TASK_QUEUE_STATUSES
	} as FilterDefaults
} as const;
