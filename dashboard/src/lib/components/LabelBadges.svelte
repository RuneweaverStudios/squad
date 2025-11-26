<script lang="ts">
	/**
	 * LabelBadges Component
	 *
	 * Displays a list of labels as badges with configurable max display count.
	 * Shows first N labels plus a "+X more" badge if there are additional labels.
	 *
	 * @example
	 * ```svelte
	 * <LabelBadges labels={['bug', 'urgent', 'frontend']} maxDisplay={2} />
	 * <!-- Renders: [bug] [urgent] [+1] -->
	 * ```
	 */

	interface Props {
		/** Array of label strings to display */
		labels: string[];
		/** Maximum number of labels to show before "+N more" (default: 3) */
		maxDisplay?: number;
		/** Badge size: 'xs' | 'sm' | 'md' (default: 'xs') */
		size?: 'xs' | 'sm' | 'md';
		/** Additional CSS classes for the container */
		class?: string;
	}

	let { labels, maxDisplay = 3, size = 'xs', class: className = '' }: Props = $props();

	// Derived values
	const visibleLabels = $derived(labels?.slice(0, maxDisplay) ?? []);
	const remainingCount = $derived(Math.max(0, (labels?.length ?? 0) - maxDisplay));
	const hasMore = $derived(remainingCount > 0);

	// Size class mapping
	const sizeClasses = {
		xs: 'badge-xs',
		sm: 'badge-sm',
		md: 'badge-md'
	};
</script>

{#if labels && labels.length > 0}
	<div class="flex flex-wrap gap-0.5 {className}">
		{#each visibleLabels as label}
			<span class="badge badge-ghost {sizeClasses[size]}">{label}</span>
		{/each}
		{#if hasMore}
			<span class="badge badge-ghost {sizeClasses[size]}">+{remainingCount}</span>
		{/if}
	</div>
{/if}
