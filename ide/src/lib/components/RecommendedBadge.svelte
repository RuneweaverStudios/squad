<script lang="ts">
	/**
	 * RecommendedBadge - Subtle badge indicating a task is recommended
	 *
	 * Shows a small star/sparkle badge with tooltip explaining why
	 * Uses success-ish colors that stand out but aren't overwhelming
	 *
	 * Task: squad-puza.4 - Smart recommendations badges in TaskTable
	 */

	interface Props {
		/** Recommendation reasons (e.g., ["Unblocks 3", "Active epic"]) */
		reasons: string[];
		/** Size variant */
		size?: 'xs' | 'sm' | 'md';
		/** Show as compact icon only (no text) */
		iconOnly?: boolean;
	}

	let { reasons = [], size = 'sm', iconOnly = false }: Props = $props();

	const sizeClasses: Record<string, { container: string; icon: string; text: string }> = {
		xs: { container: 'px-1 py-0.5 gap-0.5', icon: 'w-3 h-3', text: 'text-[10px]' },
		sm: { container: 'px-1.5 py-0.5 gap-1', icon: 'w-3.5 h-3.5', text: 'text-xs' },
		md: { container: 'px-2 py-1 gap-1.5', icon: 'w-4 h-4', text: 'text-sm' }
	};

	const classes = $derived(sizeClasses[size] || sizeClasses.sm);

	// Build tooltip text
	const tooltip = $derived(
		reasons.length > 0
			? `Recommended: ${reasons.join(', ')}`
			: 'Recommended task'
	);
</script>

{#if iconOnly}
	<!-- Icon-only mode: just the sparkle -->
	<span
		class="inline-flex items-center justify-center shrink-0"
		title={tooltip}
		style="color: oklch(0.70 0.17 145);"
	>
		<svg
			class={classes.icon}
			viewBox="0 0 24 24"
			fill="currentColor"
		>
			<!-- Sparkle/star icon -->
			<path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
		</svg>
	</span>
{:else}
	<!-- Badge mode: icon + optional label -->
	<span
		class="inline-flex items-center rounded {classes.container}"
		title={tooltip}
		style="color: oklch(0.70 0.17 145); background: oklch(0.70 0.17 145 / 0.12); border: 1px solid oklch(0.70 0.17 145 / 0.25);"
	>
		<svg
			class={classes.icon}
			viewBox="0 0 24 24"
			fill="currentColor"
		>
			<path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
		</svg>
		{#if reasons.length > 0}
			<span class="{classes.text} font-medium whitespace-nowrap">
				{reasons[0]}{reasons.length > 1 ? ` +${reasons.length - 1}` : ''}
			</span>
		{:else}
			<span class="{classes.text} font-medium">Recommended</span>
		{/if}
	</span>
{/if}
