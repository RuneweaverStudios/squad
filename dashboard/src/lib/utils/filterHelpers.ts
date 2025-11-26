/**
 * Filter utility helpers for managing Set-based filter state.
 * Consolidates duplicate toggle/URL sync patterns from TaskTable and TaskQueue.
 */

/**
 * Toggle an item in a Set (add if not present, remove if present).
 * Returns a NEW Set to trigger Svelte reactivity.
 *
 * @param set - The current Set
 * @param item - Item to toggle
 * @returns A new Set with the item toggled
 *
 * @example
 * // In Svelte component:
 * selectedPriorities = toggleSetItem(selectedPriorities, 'P0');
 */
export function toggleSetItem<T>(set: Set<T>, item: T): Set<T> {
	const newSet = new Set(set);
	if (newSet.has(item)) {
		newSet.delete(item);
	} else {
		newSet.add(item);
	}
	return newSet;
}

/**
 * Create a toggle function bound to a specific Set state setter.
 * Useful for creating multiple toggle handlers with less boilerplate.
 *
 * @param getSetter - Function that returns [currentSet, setter] tuple
 * @returns A toggle function for that Set
 *
 * @example
 * // In Svelte component with $state:
 * let selectedPriorities = $state(new Set<string>());
 * const togglePriority = (p: string) => {
 *   selectedPriorities = toggleSetItem(selectedPriorities, p);
 * };
 */

/**
 * Filter configuration for URL serialization.
 * Maps filter names to their URL parameter keys.
 */
export interface FilterConfig {
	[filterName: string]: {
		urlKey: string;
		serialize?: (value: any) => string;
		deserialize?: (value: string) => any;
	};
}

/**
 * Default filter configuration for task filters.
 */
export const DEFAULT_FILTER_CONFIG: FilterConfig = {
	priorities: { urlKey: 'priority' },
	statuses: { urlKey: 'status' },
	types: { urlKey: 'type' },
	labels: { urlKey: 'label' },
	projects: { urlKey: 'project' }
};

/**
 * Default filter values - represents "no active filtering" state.
 * Used to determine when to show the Active Filters row.
 *
 * - Priorities: All priorities selected (P0-P3)
 * - Statuses: Only 'open' selected (default view)
 * - Types: Empty (show all types)
 * - Labels: Empty (no label filtering)
 * - Projects: Empty (show all projects, handled by project selector)
 */
export const DEFAULT_FILTER_VALUES: Record<string, Set<string>> = {
	priorities: new Set(['0', '1', '2', '3']),
	statuses: new Set(['open']),
	types: new Set(),
	labels: new Set(),
	projects: new Set()
};

/**
 * Check if two Sets are equal (same size and same elements).
 */
function setsAreEqual<T>(a: Set<T>, b: Set<T>): boolean {
	if (a.size !== b.size) return false;
	for (const item of a) {
		if (!b.has(item)) return false;
	}
	return true;
}

/**
 * Build URL search params from filter Sets.
 * Each Set value becomes a comma-separated list in the URL.
 *
 * @param filters - Record of filter name to Set of values
 * @param config - Filter configuration (defaults to task filters)
 * @returns URLSearchParams object
 *
 * @example
 * const filters = {
 *   priorities: new Set(['P0', 'P1']),
 *   statuses: new Set(['open'])
 * };
 * const params = buildFilterParams(filters);
 * // → URLSearchParams { priority: 'P0,P1', status: 'open' }
 */
export function buildFilterParams(
	filters: Record<string, Set<any>>,
	config: FilterConfig = DEFAULT_FILTER_CONFIG
): URLSearchParams {
	const params = new URLSearchParams();

	for (const [filterName, filterSet] of Object.entries(filters)) {
		if (filterSet.size > 0 && config[filterName]) {
			const { urlKey, serialize } = config[filterName];
			const values = Array.from(filterSet);
			const serialized = serialize
				? values.map(serialize).join(',')
				: values.join(',');
			params.set(urlKey, serialized);
		}
	}

	return params;
}

/**
 * Parse URL search params into filter Sets.
 *
 * @param params - URLSearchParams to parse
 * @param config - Filter configuration (defaults to task filters)
 * @returns Record of filter name to Set of values
 *
 * @example
 * const params = new URLSearchParams('priority=P0,P1&status=open');
 * const filters = parseFilterParams(params);
 * // → { priorities: Set(['P0', 'P1']), statuses: Set(['open']), ... }
 */
export function parseFilterParams(
	params: URLSearchParams,
	config: FilterConfig = DEFAULT_FILTER_CONFIG
): Record<string, Set<any>> {
	const filters: Record<string, Set<any>> = {};

	for (const [filterName, { urlKey, deserialize }] of Object.entries(config)) {
		const value = params.get(urlKey);
		if (value) {
			const values = value.split(',').filter(Boolean);
			filters[filterName] = new Set(
				deserialize ? values.map(deserialize) : values
			);
		} else {
			filters[filterName] = new Set();
		}
	}

	return filters;
}

/**
 * Update URL with current filter state without triggering navigation.
 * Uses replaceState to update URL in place.
 *
 * @param filters - Current filter state
 * @param config - Filter configuration
 * @param baseUrl - Base URL to update (defaults to current location)
 */
export function syncFiltersToURL(
	filters: Record<string, Set<any>>,
	config: FilterConfig = DEFAULT_FILTER_CONFIG,
	baseUrl?: URL
): void {
	const url = baseUrl || new URL(window.location.href);

	// Clear existing filter params
	for (const { urlKey } of Object.values(config)) {
		url.searchParams.delete(urlKey);
	}

	// Add current filter params
	const newParams = buildFilterParams(filters, config);
	newParams.forEach((value, key) => {
		url.searchParams.set(key, value);
	});

	// Update URL without navigation
	window.history.replaceState({}, '', url.toString());
}

/**
 * Check if any filters are active (differ from default values).
 * This is smarter than checking if filters are non-empty - it compares
 * against the baseline "default" state to determine if user has actively filtered.
 *
 * @param filters - Record of filter Sets
 * @param defaults - Default filter values to compare against (defaults to DEFAULT_FILTER_VALUES)
 * @returns true if any filter differs from its default value
 *
 * @example
 * // With default priorities (all selected) - NOT active
 * hasActiveFilters({ priorities: new Set(['0', '1', '2', '3']), statuses: new Set(['open']) })
 * // → false
 *
 * // With filtered priorities - IS active
 * hasActiveFilters({ priorities: new Set(['0', '1']), statuses: new Set(['open']) })
 * // → true
 */
export function hasActiveFilters(
	filters: Record<string, Set<any>>,
	defaults: Record<string, Set<any>> = DEFAULT_FILTER_VALUES
): boolean {
	for (const [filterName, filterSet] of Object.entries(filters)) {
		const defaultSet = defaults[filterName] || new Set();
		if (!setsAreEqual(filterSet, defaultSet)) {
			return true;
		}
	}
	return false;
}

/**
 * Check if any filters have ANY values (simple non-empty check).
 * Use this when you need the simpler "any values present" logic.
 *
 * @param filters - Record of filter Sets
 * @returns true if at least one filter has values
 */
export function hasAnyFilterValues(filters: Record<string, Set<any>>): boolean {
	return Object.values(filters).some(set => set.size > 0);
}

/**
 * Clear all filters (return empty Sets).
 *
 * @param config - Filter configuration to determine which filters to clear
 * @returns Record with empty Sets for each filter
 */
export function clearAllFilters(
	config: FilterConfig = DEFAULT_FILTER_CONFIG
): Record<string, Set<any>> {
	const cleared: Record<string, Set<any>> = {};
	for (const filterName of Object.keys(config)) {
		cleared[filterName] = new Set();
	}
	return cleared;
}

/**
 * Count total number of active filter values.
 *
 * @param filters - Record of filter Sets
 * @returns Total count of filter values across all filters
 */
export function countActiveFilters(filters: Record<string, Set<any>>): number {
	return Object.values(filters).reduce((sum, set) => sum + set.size, 0);
}

/**
 * Represents a single active filter chip for UI display.
 */
export interface FilterChip {
	/** Filter category (e.g., 'priorities', 'statuses') */
	filterName: string;
	/** The specific value being filtered */
	value: string;
	/** Human-readable label for display */
	label: string;
	/** Badge CSS class for styling */
	badgeClass?: string;
}

/**
 * Get active filter chips that differ from default values.
 * Returns an array of chips representing active filters for UI display.
 *
 * @param filters - Current filter state
 * @param defaults - Default filter values to compare against
 * @param labelFn - Optional function to generate human-readable labels
 * @returns Array of FilterChip objects for rendering
 *
 * @example
 * const chips = getActiveFilterChips(
 *   { priorities: new Set(['0', '1']), statuses: new Set(['open']) },
 *   DEFAULT_FILTER_VALUES,
 *   (filterName, value) => filterName === 'priorities' ? `P${value}` : value
 * );
 * // → [{ filterName: 'priorities', value: '2', label: 'P2' }, ...]
 */
export function getActiveFilterChips(
	filters: Record<string, Set<any>>,
	defaults: Record<string, Set<any>> = DEFAULT_FILTER_VALUES,
	labelFn?: (filterName: string, value: string) => string
): FilterChip[] {
	const chips: FilterChip[] = [];

	for (const [filterName, filterSet] of Object.entries(filters)) {
		const defaultSet = defaults[filterName] || new Set();

		// For priorities: chip shows what's EXCLUDED (defaults minus current)
		// For other filters: chip shows what's INCLUDED (current values)
		if (filterName === 'priorities') {
			// Show chips for priorities that are filtered OUT
			for (const defaultValue of defaultSet) {
				if (!filterSet.has(defaultValue)) {
					const label = labelFn
						? labelFn(filterName, defaultValue)
						: `P${defaultValue}`;
					chips.push({
						filterName,
						value: defaultValue,
						label: `−${label}`, // Minus sign indicates "excluded"
						badgeClass: 'badge-ghost'
					});
				}
			}
		} else if (filterName === 'statuses') {
			// For statuses: show non-default selections
			// If default is 'open' only and user selected more/different, show them
			if (!setsAreEqual(filterSet, defaultSet)) {
				for (const value of filterSet) {
					if (!defaultSet.has(value)) {
						const label = labelFn
							? labelFn(filterName, value)
							: formatStatusLabel(value);
						chips.push({
							filterName,
							value,
							label,
							badgeClass: 'badge-info'
						});
					}
				}
				// Also show if default status is excluded
				for (const defaultValue of defaultSet) {
					if (!filterSet.has(defaultValue)) {
						const label = labelFn
							? labelFn(filterName, defaultValue)
							: formatStatusLabel(defaultValue);
						chips.push({
							filterName,
							value: defaultValue,
							label: `−${label}`,
							badgeClass: 'badge-ghost'
						});
					}
				}
			}
		} else {
			// For types, labels, projects: show all active values
			for (const value of filterSet) {
				const label = labelFn
					? labelFn(filterName, value)
					: formatFilterLabel(filterName, value);
				chips.push({
					filterName,
					value,
					label,
					badgeClass: getBadgeClassForFilter(filterName)
				});
			}
		}
	}

	return chips;
}

/**
 * Format a status value for display.
 */
function formatStatusLabel(status: string): string {
	switch (status) {
		case 'open': return 'Open';
		case 'in_progress': return 'In Progress';
		case 'blocked': return 'Blocked';
		case 'closed': return 'Closed';
		default: return status;
	}
}

/**
 * Format a filter value for display based on filter type.
 */
function formatFilterLabel(filterName: string, value: string): string {
	switch (filterName) {
		case 'types':
			return value.charAt(0).toUpperCase() + value.slice(1);
		case 'labels':
		case 'projects':
			return value;
		default:
			return value;
	}
}

/**
 * Get badge CSS class for a filter type.
 */
function getBadgeClassForFilter(filterName: string): string {
	switch (filterName) {
		case 'types': return 'badge-secondary';
		case 'labels': return 'badge-accent';
		case 'projects': return 'badge-primary';
		default: return 'badge-ghost';
	}
}
