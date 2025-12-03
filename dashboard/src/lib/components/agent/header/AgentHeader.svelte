<script lang="ts">
	/**
	 * AgentHeader Component
	 *
	 * Displays agent identity: avatar with activity state ring, name, and connection dot.
	 * Used across all display modes of UnifiedAgentCard.
	 *
	 * Features:
	 * - Activity state ring (starting, working, needs-input, etc.)
	 * - Connection status dot (connected, disconnected, offline)
	 * - Responsive sizes (sm, md, lg)
	 * - Optional inline sparkline and token/cost display (compact mode)
	 */

	import AgentAvatar from '$lib/components/AgentAvatar.svelte';
	import Sparkline from '$lib/components/Sparkline.svelte';
	import type { ConnectionState, ActivityState, SparklinePoint } from '$lib/types/agent';
	import { formatTokens, formatCost } from '$lib/utils/numberFormat';

	interface Props {
		name: string;
		connection?: ConnectionState;
		activityState?: ActivityState;
		isHighlighted?: boolean;
		size?: 'sm' | 'md' | 'lg';
		showConnectionDot?: boolean;
		showActivityRing?: boolean;
		/** Accent color for name (from stateVisual) */
		accentColor?: string;
		/** Glow color for name text-shadow (from stateVisual) */
		glowColor?: string;
		/** Use styled name (mono font, uppercase, glowing) */
		styledName?: boolean;
		/** Sparkline data (for compact mode inline display) */
		sparklineData?: SparklinePoint[];
		/** Token count (for compact mode) */
		tokens?: number;
		/** Cost in USD (for compact mode) */
		cost?: number;
		/** Show inline usage stats (sparkline + tokens + cost) */
		showInlineUsage?: boolean;
		class?: string;
	}

	let {
		name,
		connection = 'connected',
		activityState,
		isHighlighted = false,
		size = 'md',
		showConnectionDot = true,
		showActivityRing = true,
		accentColor,
		glowColor,
		styledName = false,
		sparklineData = [],
		tokens = 0,
		cost = 0,
		showInlineUsage = false,
		class: className = ''
	}: Props = $props();

	// Size mappings
	const sizeConfig = {
		sm: { avatar: 18, text: 'text-sm', dot: 'w-1.5 h-1.5', ring: 'ring-1 ring-offset-1' },
		md: { avatar: 24, text: 'text-base', dot: 'w-2 h-2', ring: 'ring-2 ring-offset-1' },
		lg: { avatar: 32, text: 'text-lg', dot: 'w-2.5 h-2.5', ring: 'ring-2 ring-offset-2' }
	};

	const config = $derived(sizeConfig[size]);

	// Connection state colors (for dot)
	const connectionColors: Record<ConnectionState, string> = {
		connected: 'bg-success',
		disconnected: 'bg-warning',
		offline: 'bg-error'
	};

	const connectionColor = $derived(connectionColors[connection]);

	// Activity state ring colors - matches SessionCard styling
	const activityRingColors: Record<ActivityState, string> = {
		starting: 'ring-secondary',
		working: 'ring-info',
		'needs-input': 'ring-warning',
		'ready-for-review': 'ring-accent',
		completing: 'ring-primary',
		completed: 'ring-success',
		idle: ''
	};

	const activityRingColor = $derived(activityState ? activityRingColors[activityState] : '');
	const hasActivityRing = $derived(showActivityRing && activityState && activityState !== 'idle');
</script>

<div class="flex items-center gap-2 {className}">
	<!-- Avatar with activity ring and connection indicator -->
	<div class="relative flex-shrink-0 flex items-center justify-center">
		<div
			class="rounded-full flex items-center justify-center {hasActivityRing ? `${config.ring} ${activityRingColor}` : ''}"
			class:ring-2={isHighlighted && !hasActivityRing}
			class:ring-primary={isHighlighted && !hasActivityRing}
		>
			<AgentAvatar {name} size={config.avatar} />
		</div>

		{#if showConnectionDot}
			<!-- Connection status dot -->
			<div
				class="absolute -bottom-0.5 -right-0.5 {config.dot} {connectionColor} rounded-full border border-base-100"
				class:animate-pulse={connection === 'connected'}
				title={connection === 'connected' ? 'Online' : connection === 'disconnected' ? 'Disconnected' : 'Offline'}
			></div>
		{/if}
	</div>

	<!-- Agent name and optional inline usage -->
	{#if styledName && accentColor}
		<div class="flex flex-col min-w-0">
			<!-- Row 1: Name + Sparkline -->
			<div class="flex items-center gap-1">
				<span
					class="font-mono text-[11px] font-semibold tracking-wider uppercase truncate"
					style="color: {accentColor}; text-shadow: 0 0 12px {glowColor || accentColor};"
					title={name}
				>
					{name}
				</span>
				{#if showInlineUsage && sparklineData && sparklineData.length > 0}
					<div class="-mt-3 flex-shrink-0" style="width: 45px; height: 14px;">
						<Sparkline
							data={sparklineData.map(d => ({ timestamp: d.date, tokens: d.tokens, cost: d.cost || 0 }))}
							height={14}
							showTooltip={true}
							showStyleToolbar={false}
							defaultTimeRange="24h"
							animate={false}
						/>
					</div>
				{/if}
			</div>
			<!-- Row 2: Tokens + Cost (SessionCard style) -->
			{#if showInlineUsage && (tokens > 0 || cost > 0)}
				<div
					class="flex items-center gap-1 font-mono text-[9px]"
					style="color: oklch(0.55 0.03 250);"
				>
					<span style="color: oklch(0.60 0.05 250);">{formatTokens(tokens)}</span>
					<span class="opacity-40">·</span>
					<span style="color: oklch(0.65 0.10 145);">${cost.toFixed(2)}</span>
				</div>
			{/if}
		</div>
	{:else}
		<span class="-mt-1 font-semibold {config.text} truncate" title={name}>
			{name}
		</span>
	{/if}
</div>
