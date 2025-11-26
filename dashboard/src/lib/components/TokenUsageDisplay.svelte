<script lang="ts">
	/**
	 * TokenUsageDisplay Component
	 *
	 * Unified component for displaying token usage metrics across the dashboard.
	 * Consolidates duplicate token/cost display code from multiple components.
	 *
	 * Display Variants:
	 * - badge: Compact badge format for TopBar/headers
	 * - inline: Horizontal layout for card content
	 * - compact: Minimal single-line display
	 * - detailed: Full breakdown with time ranges
	 *
	 * Used by:
	 * - AgentCard (usage section)
	 * - TokenUsageBadge (TopBar)
	 * - ClaudeUsageBar (system overview)
	 * - agents/+page.svelte (system stats)
	 */

	import { formatTokens, formatCost, getUsageColor } from '$lib/utils/numberFormat';
	import { getTokenColorClass } from '$lib/config/tokenUsageConfig';
	import AnimatedDigits from './AnimatedDigits.svelte';
	import AnimatedCost from './AnimatedCost.svelte';

	// Component Props
	interface Props {
		/** Token count to display */
		tokens?: number;
		/** Cost in USD */
		cost?: number;
		/** Time range label (e.g., 'today', 'week', 'all') */
		timeRange?: 'today' | 'week' | 'all';
		/** Display variant */
		variant?: 'badge' | 'inline' | 'compact' | 'detailed';
		/** Show icon alongside values */
		showIcon?: boolean;
		/** Show both tokens and cost, or just one */
		showTokens?: boolean;
		showCost?: boolean;
		/** Use color coding based on thresholds */
		colorCoded?: boolean;
		/** Optional progress bar (0-100) */
		progress?: number | null;
		/** Custom CSS class */
		class?: string;
	}

	let {
		tokens = 0,
		cost = 0,
		timeRange = 'today',
		variant = 'inline',
		showIcon = false,
		showTokens = true,
		showCost = true,
		colorCoded = true,
		progress = null,
		class: className = ''
	}: Props = $props();

	// Derive color class based on variant preference
	const tokenColorClass = $derived(
		colorCoded ? getTokenColorClass(tokens) : 'text-base-content'
	);

	const usageColorClass = $derived(
		colorCoded ? `text-${getUsageColor(tokens, timeRange === 'week' ? 'week' : 'today')}` : ''
	);

	// Format tokens for compact badge display (e.g., 1.1B, 500M, 50K)
	function formatTokensCompact(tkns: number): string {
		if (!isFinite(tkns) || tkns < 0) return '0';
		if (tkns >= 1_000_000_000) return `${(tkns / 1_000_000_000).toFixed(1)}B`;
		if (tkns >= 1_000_000) return `${(tkns / 1_000_000).toFixed(0)}M`;
		if (tkns >= 1_000) return `${(tkns / 1_000).toFixed(0)}K`;
		return tkns.toString();
	}

	// Format cost for compact badge display (e.g., $695, $1.2K)
	function formatCostCompact(c: number): string {
		if (!isFinite(c) || c < 0) return '$0';
		if (c >= 1_000) return `$${(c / 1_000).toFixed(1)}K`;
		return `$${Math.round(c)}`;
	}

	// Time range labels
	const timeRangeLabel = $derived(
		timeRange === 'today' ? 'Today' : timeRange === 'week' ? 'This Week' : 'Total'
	);
</script>

{#if variant === 'badge'}
	<!-- Badge Variant: Compact badges for TopBar -->
	<div class="flex items-center gap-2 {className}">
		{#if showTokens}
			<span class="badge badge-sm badge-outline border-{usageColorClass.replace('text-', '')} {usageColorClass} gap-1 font-mono">
				{#if showIcon}
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
					</svg>
				{/if}
				<AnimatedDigits value={formatTokensCompact(tokens)} class="font-medium" />
			</span>
		{/if}

		{#if showTokens && showCost}
			<span class="text-base-content/30">|</span>
		{/if}

		{#if showCost}
			<span class="badge badge-sm badge-outline border-{usageColorClass.replace('text-', '')} {usageColorClass} gap-1 font-mono">
				{#if showIcon}
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
				{/if}
				<AnimatedCost value={cost} format={formatCostCompact} class="font-medium" />
			</span>
		{/if}
	</div>

{:else if variant === 'inline'}
	<!-- Inline Variant: Horizontal layout for card content -->
	<div class="flex items-center justify-between text-xs {className}">
		{#if showTokens}
			<span class="font-mono text-base-content/70">
				<AnimatedDigits value={formatTokens(tokens)} />
			</span>
		{/if}
		{#if showCost}
			<AnimatedCost value={cost} format={formatCost} class="font-mono font-medium {tokenColorClass}" />
		{/if}
	</div>

	{#if progress !== null}
		<div class="w-full mt-1">
			<progress
				class="progress progress-{usageColorClass.replace('text-', '')} w-full h-1"
				value={progress}
				max="100"
			></progress>
		</div>
	{/if}

{:else if variant === 'compact'}
	<!-- Compact Variant: Single-line minimal display -->
	<span class="text-xs font-mono {tokenColorClass} {className}">
		{#if showTokens && showCost}
			<AnimatedDigits value={formatTokensCompact(tokens)} /> · <AnimatedCost value={cost} format={formatCostCompact} />
		{:else if showTokens}
			<AnimatedDigits value={formatTokensCompact(tokens)} />
		{:else if showCost}
			<AnimatedCost value={cost} format={formatCostCompact} />
		{/if}
	</span>

{:else if variant === 'detailed'}
	<!-- Detailed Variant: Full breakdown with labels -->
	<div class="space-y-2 {className}">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				{#if showIcon}
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 {usageColorClass}">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
					</svg>
				{/if}
				<span class="text-sm">Tokens {timeRangeLabel}</span>
			</div>
			{#if showTokens}
				<AnimatedDigits value={formatTokens(tokens)} class="font-mono text-sm font-semibold {usageColorClass}" />
			{/if}
		</div>

		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				{#if showIcon}
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 {usageColorClass}">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
				{/if}
				<span class="text-sm">Spend {timeRangeLabel}</span>
			</div>
			{#if showCost}
				<AnimatedCost value={cost} format={formatCost} class="font-mono text-sm font-semibold {usageColorClass}" />
			{/if}
		</div>

		{#if progress !== null}
			<div class="w-full">
				<progress
					class="progress progress-{usageColorClass.replace('text-', '')} w-full h-2"
					value={progress}
					max="100"
				></progress>
				<span class="text-xs text-base-content/60">{progress}% of budget</span>
			</div>
		{/if}
	</div>
{/if}
