<script lang="ts">
	/**
	 * FilterDropdown Component
	 * Reusable multi-select dropdown for filter bar
	 * Uses DaisyUI dropdown pattern with badge grid content
	 */

	interface FilterOption {
		value: string;
		label: string;
		count: number;
	}

	interface Props {
		label: string;
		options: FilterOption[];
		selected: Set<string>;
		onToggle: (value: string) => void;
		colorFn?: (value: string, isSelected: boolean) => string;
		allSelectedText?: string;
		emptyMeansAll?: boolean;
	}

	let {
		label,
		options,
		selected,
		onToggle,
		colorFn = () => 'badge-primary',
		allSelectedText = 'all',
		emptyMeansAll = false
	}: Props = $props();

	// Compute display text for the button
	const displayText = $derived.by(() => {
		if (emptyMeansAll && selected.size === 0) {
			return allSelectedText;
		}
		if (selected.size === options.length && options.length > 0) {
			return allSelectedText;
		}
		return String(selected.size);
	});

	// Handle option toggle
	function handleToggle(value: string) {
		onToggle(value);
	}

	// Handle keyboard navigation
	function handleKeydown(e: KeyboardEvent, value: string) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handleToggle(value);
		}
	}
</script>

<div class="dropdown">
	<!-- Trigger Button -->
	<button
		tabindex="0"
		class="btn btn-sm btn-ghost gap-1 px-2"
	>
		<span class="text-xs opacity-70">{label}</span>
		<span class="badge badge-xs badge-primary">{displayText}</span>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			stroke-width="1.5"
			stroke="currentColor"
			class="w-3 h-3 opacity-50"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
		</svg>
	</button>

	<!-- Dropdown Content - tabindex required for DaisyUI dropdown behavior -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		tabindex="0"
		role="menu"
		class="dropdown-content bg-base-100 rounded-box shadow-lg border border-base-300 p-2 z-50 min-w-48 mt-1"
	>
		<div class="flex flex-wrap gap-1.5">
			{#each options as opt}
				<button
					class="badge badge-sm transition-all duration-200 cursor-pointer {selected.has(opt.value)
						? colorFn(opt.value, true) + ' shadow-md'
						: 'badge-ghost hover:badge-primary/20 hover:shadow-sm hover:scale-105'}"
					onclick={() => handleToggle(opt.value)}
					onkeydown={(e) => handleKeydown(e, opt.value)}
				>
					{opt.label}
					<span class="ml-1 opacity-70">({opt.count})</span>
				</button>
			{/each}
		</div>
	</div>
</div>
