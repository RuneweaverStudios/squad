<script lang="ts">
	/**
	 * TokenUsageBadge Component
	 *
	 * Compact inline display of token usage metrics for TopBar integration.
	 * Shows: [Tokens: 1.1B] | [$695] | [sparkline]
	 *
	 * Follows AgentCountBadge pattern with similar styling.
	 */

	import { formatTokens, formatCost, getUsageColor } from '$lib/utils/numberFormat';
	import Sparkline from './Sparkline.svelte';

	interface DataPoint {
		timestamp: string;
		tokens: number;
		cost: number;
	}

	interface Props {
		/** Total tokens consumed today */
		tokensToday?: number;
		/** Total cost today in USD */
		costToday?: number;
		/** Sparkline data points (24h hourly) */
		sparklineData?: DataPoint[];
		/** Compact mode (no labels, smaller) */
		compact?: boolean;
	}

	let {
		tokensToday = 0,
		costToday = 0,
		sparklineData = [],
		compact = false
	}: Props = $props();

	// Format tokens for compact display (e.g., 1.1B, 500M, 50K)
	function formatTokensCompact(tokens: number): string {
		if (!isFinite(tokens) || tokens < 0) return '0';

		if (tokens >= 1_000_000_000) {
			return `${(tokens / 1_000_000_000).toFixed(1)}B`;
		}
		if (tokens >= 1_000_000) {
			return `${(tokens / 1_000_000).toFixed(0)}M`;
		}
		if (tokens >= 1_000) {
			return `${(tokens / 1_000).toFixed(0)}K`;
		}
		return tokens.toString();
	}

	// Format cost for compact display (e.g., $695, $1.2K)
	function formatCostCompact(cost: number): string {
		if (!isFinite(cost) || cost < 0) return '$0';

		if (cost >= 1_000) {
			return `$${(cost / 1_000).toFixed(1)}K`;
		}
		return `$${Math.round(cost)}`;
	}

	// Get color based on token usage - use outline style for better readability
	const tokenColor = $derived(getUsageColor(tokensToday, 'today'));

	// Tooltip text
	const tooltipText = $derived(
		`Today: ${formatTokens(tokensToday)} tokens (${formatCost(costToday)})`
	);
</script>

<div class="flex items-center gap-2" title={tooltipText}>
	<!-- Tokens Badge - use outline for better readability -->
	<span class="badge badge-sm badge-outline border-{tokenColor} text-{tokenColor} gap-1 font-mono">
		{#if !compact}
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
				<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
			</svg>
		{/if}
		<span class="font-medium">{formatTokensCompact(tokensToday)}</span>
	</span>

	<!-- Separator -->
	<span class="text-base-content/30">|</span>

	<!-- Cost Badge - use outline for better readability -->
	<span class="badge badge-sm badge-outline border-{tokenColor} text-{tokenColor} gap-1 font-mono">
		{#if !compact}
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
		{/if}
		<span class="font-medium">{formatCostCompact(costToday)}</span>
	</span>

	<!-- Sparkline (if data available) -->
	{#if sparklineData && sparklineData.length > 0}
		<!-- Separator -->
		<span class="text-base-content/30">|</span>

		<!-- Mini Sparkline (60x20px as per spec) -->
		<div class="hidden sm:block w-[60px] h-[20px]">
			<Sparkline
				data={sparklineData}
				width={60}
				height={20}
				colorMode="usage"
				showTooltip={false}
				showGrid={false}
				showStyleToolbar={false}
			/>
		</div>
	{/if}
</div>
