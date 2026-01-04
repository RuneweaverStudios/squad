<script lang="ts">
	/**
	 * SlideOpenButton - A button group with a primary action and a secondary action
	 * that slides out on hover.
	 *
	 * Use cases:
	 * - Reopen + Reopen & Start
	 * - Start + Start & Assign
	 * - Delete + Delete & Archive
	 * - Save + Save & Close
	 */

	interface Props {
		// Primary button config
		primaryLabel: string;
		primaryLoadingLabel?: string;
		primaryIcon?: string; // SVG path for the icon
		primaryGradientFrom?: string; // CSS color value (CSS variable or oklch)
		primaryGradientTo?: string; // CSS color value (CSS variable or oklch)

		// Secondary button config
		secondaryLabel: string;
		secondaryIcon?: string; // SVG path for the icon
		secondaryGradientFrom?: string; // CSS color value (CSS variable or oklch)
		secondaryGradientTo?: string; // CSS color value (CSS variable or oklch)
		secondaryTitle?: string; // Tooltip

		// State
		disabled?: boolean;
		loading?: boolean;

		// Border color (shared between buttons)
		borderColor?: string; // CSS color value (CSS variable or oklch)

		// Handlers
		onprimary: () => void;
		onsecondary: () => void;
	}

	let {
		primaryLabel,
		primaryLoadingLabel = 'Loading...',
		primaryIcon,
		primaryGradientFrom = 'var(--color-warning)',
		primaryGradientTo = 'color-mix(in oklch, var(--color-warning) 80%, black)',
		secondaryLabel,
		secondaryIcon,
		secondaryGradientFrom = 'var(--color-success)',
		secondaryGradientTo = 'color-mix(in oklch, var(--color-success) 80%, black)',
		secondaryTitle,
		disabled = false,
		loading = false,
		borderColor = 'color-mix(in oklch, var(--color-base-content) 30%, transparent)',
		onprimary,
		onsecondary
	}: Props = $props();

	let hovered = $state(false);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="flex items-center overflow-hidden rounded-lg"
	style="border: 1px solid {borderColor};"
	onmouseenter={() => (hovered = true)}
	onmouseleave={() => (hovered = false)}
>
	<!-- Secondary: Slide-out Button (slides from LEFT so cursor stays over primary) -->
	<button
		class="btn btn-sm gap-1 rounded-none border-0 transition-all duration-200 ease-out"
		style="
			background: linear-gradient(135deg, {secondaryGradientFrom} 0%, {secondaryGradientTo} 100%);
			color: var(--color-base-100);
			border-right: 1px solid color-mix(in oklch, var(--color-base-content) 20%, transparent);
			max-width: {hovered ? '120px' : '0px'};
			padding: {hovered ? '0.5rem 0.75rem' : '0.5rem 0'};
			opacity: {hovered ? '1' : '0'};
		"
		onclick={onsecondary}
		disabled={disabled || loading}
		title={secondaryTitle}
	>
		{#if secondaryIcon}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="w-3.5 h-3.5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d={secondaryIcon} />
			</svg>
		{/if}
		<span class="whitespace-nowrap text-xs font-medium">{secondaryLabel}</span>
	</button>

	<!-- Primary Button -->
	<button
		class="btn btn-sm gap-2 rounded-none border-0"
		style="
			background: linear-gradient(135deg, {primaryGradientFrom} 0%, {primaryGradientTo} 100%);
			color: var(--color-base-100);
		"
		onclick={onprimary}
		{disabled}
	>
		{#if loading}
			<span class="loading loading-spinner loading-xs"></span>
			{primaryLoadingLabel}
		{:else}
			{#if primaryIcon}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="w-4 h-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d={primaryIcon} />
				</svg>
			{/if}
			{primaryLabel}
		{/if}
	</button>
</div>
