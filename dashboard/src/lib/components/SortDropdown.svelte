<script lang="ts">
	/**
	 * SortDropdown Component - Reusable sort dropdown with optional filter input
	 *
	 * A standardized dropdown for sorting lists with:
	 * - Sort button showing current option icon, label, and direction indicator
	 * - Dropdown menu with configurable sort options
	 * - Optional filter input for search/filtering
	 *
	 * Props:
	 * - options: Array of sort options with value, label, icon, defaultDir
	 * - sortBy: Current sort option value
	 * - sortDir: Current sort direction ('asc' | 'desc')
	 * - filterValue: Current filter input value (optional)
	 * - showFilter: Whether to show the filter input (default: false)
	 * - filterPlaceholder: Placeholder text for filter input (default: 'Filter...')
	 * - size: Button size variant (default: 'xs')
	 * - onSortChange: Callback when sort changes (value: string, dir: 'asc' | 'desc')
	 * - onFilterChange: Callback when filter changes (value: string)
	 */

	import { SORT_OPTIONS, type SortOption as WorkSortOption, type SortConfig } from '$lib/stores/workSort.svelte.js';

	type SortDirection = 'asc' | 'desc';

	interface Props {
		/** Sort options array. If not provided, uses SORT_OPTIONS from workSort.svelte */
		options?: SortConfig[];
		/** Current sort value */
		sortBy: string;
		/** Current sort direction */
		sortDir: SortDirection;
		/** Current filter input value */
		filterValue?: string;
		/** Whether to show the filter input */
		showFilter?: boolean;
		/** Placeholder text for filter input */
		filterPlaceholder?: string;
		/** Button size variant */
		size?: 'xs' | 'sm' | 'md';
		/** Show label on small screens */
		showLabelOnMobile?: boolean;
		/** Callback when sort changes */
		onSortChange?: (value: string, dir: SortDirection) => void;
		/** Callback when filter changes */
		onFilterChange?: (value: string) => void;
	}

	let {
		options = SORT_OPTIONS,
		sortBy,
		sortDir,
		filterValue = '',
		showFilter = false,
		filterPlaceholder = 'Filter...',
		size = 'xs',
		showLabelOnMobile = false,
		onSortChange,
		onFilterChange
	}: Props = $props();

	// Find current sort option
	const currentOption = $derived(options.find(o => o.value === sortBy));
	const currentIcon = $derived(currentOption?.icon || '🔔');
	const currentLabel = $derived(currentOption?.label || 'Sort');

	// Handle sort option click
	function handleSortClick(value: string) {
		if (sortBy === value) {
			// Same option - toggle direction
			onSortChange?.(value, sortDir === 'asc' ? 'desc' : 'asc');
		} else {
			// Different option - switch to it with default direction
			const opt = options.find(o => o.value === value);
			onSortChange?.(value, opt?.defaultDir ?? 'asc');
		}
	}

	// Handle filter input change
	function handleFilterInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		onFilterChange?.(target.value);
	}

	// Size classes
	const buttonSizeClass = $derived({
		xs: 'btn-xs',
		sm: 'btn-sm',
		md: ''
	}[size]);

	const menuSizeClass = $derived({
		xs: 'menu-xs',
		sm: 'menu-sm',
		md: ''
	}[size]);

	const inputSizeClass = $derived({
		xs: 'input-xs',
		sm: 'input-sm',
		md: ''
	}[size]);

	const inputWidthClass = $derived({
		xs: 'w-20 focus:w-32',
		sm: 'w-24 focus:w-36',
		md: 'w-32 focus:w-44'
	}[size]);
</script>

<div class="flex items-center gap-1">
	<!-- Sort dropdown -->
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="dropdown dropdown-end flex-shrink-0" onclick={(e) => e.stopPropagation()}>
		<button
			tabindex="0"
			class="btn {buttonSizeClass} btn-ghost gap-1 font-mono text-[10px] uppercase tracking-wider opacity-70 hover:opacity-100"
			title="Sort sessions"
		>
			<span>{currentIcon}</span>
			<span class="{showLabelOnMobile ? '' : 'hidden sm:inline'}">{currentLabel}</span>
			<span class="text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
		</button>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<ul tabindex="0" class="dropdown-content menu {menuSizeClass} bg-base-200 rounded-box z-40 w-36 p-1 shadow-lg border border-base-300">
			{#each options as opt (opt.value)}
				<li>
					<button
						class="flex items-center gap-2 {sortBy === opt.value ? 'active' : ''}"
						onclick={() => handleSortClick(opt.value)}
					>
						<span>{opt.icon}</span>
						<span class="flex-1">{opt.label}</span>
						{#if sortBy === opt.value}
							<span class="text-[9px] opacity-70">{sortDir === 'asc' ? '▲' : '▼'}</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	</div>

	<!-- Filter input (optional) -->
	{#if showFilter}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="flex-shrink-0" onclick={(e) => e.stopPropagation()}>
			<input
				type="text"
				placeholder={filterPlaceholder}
				value={filterValue}
				oninput={handleFilterInput}
				class="input {inputSizeClass} input-bordered {inputWidthClass} transition-all duration-200 bg-base-200/50"
			/>
		</div>
	{/if}
</div>
