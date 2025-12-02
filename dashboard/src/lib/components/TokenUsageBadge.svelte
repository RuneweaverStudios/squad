<script lang="ts">
	/**
	 * TokenUsageBadge Component
	 *
	 * Compact inline display of token usage metrics for TopBar integration.
	 * Shows: [Tokens: 1.1B] | [$695] | [sparkline] | [legend]
	 *
	 * Supports both single-project and multi-project sparklines.
	 * Multi-project mode shows stacked/overlay chart with per-project colors.
	 *
	 * Follows AgentCountBadge pattern with similar styling.
	 */

	import { formatTokens, formatCost, getUsageColor } from '$lib/utils/numberFormat';
	import Sparkline from './Sparkline.svelte';
	import AnimatedDigits from './AnimatedDigits.svelte';
	import AnimatedCost from './AnimatedCost.svelte';
	import type { MultiSeriesDataPoint, ProjectMeta } from './Sparkline.svelte';

	interface DataPoint {
		timestamp: string;
		tokens: number;
		cost: number;
	}

	/** Per-project token data from API */
	interface ProjectTokenData {
		project: string;
		tokens: number;
		cost: number;
		color: string;
	}

	/** Multi-project time-series data point from API */
	interface MultiProjectDataPoint {
		timestamp: string;
		totalTokens: number;
		totalCost: number;
		projects: ProjectTokenData[];
	}

	interface Props {
		/** Total tokens consumed today */
		tokensToday?: number;
		/** Total cost today in USD */
		costToday?: number;
		/** Sparkline data points (24h hourly) - single-project mode */
		sparklineData?: DataPoint[];
		/** Multi-project sparkline data (from ?multiProject=true API) */
		multiProjectData?: MultiProjectDataPoint[];
		/** Project colors map (from API response) */
		projectColors?: Record<string, string>;
		/** Compact mode (no labels, smaller) */
		compact?: boolean;
	}

	let {
		tokensToday = 0,
		costToday = 0,
		sparklineData = [],
		multiProjectData,
		projectColors = {},
		compact = false
	}: Props = $props();

	// Transform multi-project API data to Sparkline's expected format
	const multiSeriesData = $derived.by(() => {
		if (!multiProjectData || multiProjectData.length === 0) return undefined;

		return multiProjectData.map((point): MultiSeriesDataPoint => {
			const projects: Record<string, { tokens: number; cost: number }> = {};
			for (const p of point.projects) {
				projects[p.project] = { tokens: p.tokens, cost: p.cost };
			}
			return {
				timestamp: point.timestamp,
				projects,
				total: { tokens: point.totalTokens, cost: point.totalCost }
			};
		});
	});

	// Build project metadata for Sparkline
	const projectMeta = $derived.by(() => {
		if (!multiProjectData || multiProjectData.length === 0) return undefined;

		// Collect all project names and sum their tokens
		const projectTotals = new Map<string, number>();
		for (const point of multiProjectData) {
			for (const p of point.projects) {
				projectTotals.set(p.project, (projectTotals.get(p.project) || 0) + p.tokens);
			}
		}

		// Build metadata array sorted by total tokens (descending)
		const meta: ProjectMeta[] = [];
		for (const [name, totalTokens] of projectTotals.entries()) {
			meta.push({
				name,
				color: projectColors[name] || '#888888',
				totalTokens
			});
		}

		return meta.sort((a, b) => b.totalTokens - a.totalTokens);
	});

	// Check if we're in multi-project mode
	const isMultiProject = $derived(multiSeriesData && multiSeriesData.length > 0);

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

<!-- Industrial Token Usage Badge -->
<div class="flex items-center gap-2" title={tooltipText}>
	<!-- Tokens Badge - Industrial -->
	<span
		class="px-2 py-0.5 rounded text-xs font-mono flex items-center gap-1"
		style="
			background: oklch(0.18 0.01 250);
			border: 1px solid oklch(0.35 0.02 250);
			color: oklch(0.70 0.18 240);
		"
	>
		{#if !compact}
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3" style="color: oklch(0.70 0.18 240);">
				<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
			</svg>
		{/if}
		<AnimatedDigits value={formatTokensCompact(tokensToday)} class="font-medium" />
	</span>

	<!-- Cost Badge - Industrial -->
	<span
		class="px-2 py-0.5 rounded text-xs font-mono flex items-center gap-1"
		style="
			background: oklch(0.18 0.01 250);
			border: 1px solid oklch(0.35 0.02 250);
			color: oklch(0.70 0.15 150);
		"
	>
		{#if !compact}
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3" style="color: oklch(0.70 0.15 150);">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
		{/if}
		<AnimatedCost value={costToday} format={formatCostCompact} class="font-medium" />
	</span>

	<!-- Sparkline (multi-project or single-project) - Industrial -->
	{#if isMultiProject}
		<!-- Multi-project sparkline with stacked/overlay chart -->
		<div class="hidden sm:block flex-shrink w-[120px] min-w-[60px] h-[20px]">
			<Sparkline
				{multiSeriesData}
				{projectMeta}
				width="100%"
				height={20}
				showTooltip={true}
				showGrid={false}
				showStyleToolbar={true}
				showLegend={false}
				showLegendInToolbar={true}
			/>
		</div>
	{:else if sparklineData && sparklineData.length > 0}
		<!-- Single-project sparkline (original behavior) - Industrial -->
		<div class="hidden sm:block flex-shrink w-[120px] min-w-[60px] h-[20px]">
			<Sparkline
				data={sparklineData}
				width="100%"
				height={20}
				colorMode="usage"
				showTooltip={true}
				showGrid={false}
				showStyleToolbar={true}
			/>
		</div>
	{/if}
</div>
