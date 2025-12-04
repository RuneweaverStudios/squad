<script lang="ts">
	/**
	 * AgentCountBadge Component
	 * Displays count of active agent sessions by state
	 *
	 * Shows colored dots matching session states (in urgency order):
	 * - Red (pulsing): needs attention (needs-input)
	 * - Yellow (pulsing): waiting review (ready-for-review)
	 * - Orange: being worked (working)
	 * - Blue/Cyan: starting up (starting)
	 * - Green: complete/ready to close (completed)
	 * - Grey: no active task (idle)
	 */

	import AnimatedDigits from './AnimatedDigits.svelte';

	interface StateCounts {
		needsInput: number;
		working: number;
		review: number;
		completed: number;
		starting?: number;
		idle?: number;
	}

	interface Props {
		activeCount: number;
		totalCount?: number; // Kept for backward compatibility but not displayed
		activeAgents?: string[];
		stateCounts?: StateCounts;
		compact?: boolean;
	}

	let {
		activeCount = 0,
		totalCount = 0,
		activeAgents = [],
		stateCounts,
		compact = false
	}: Props = $props();

	// Check if we have any state data to display (including starting and idle)
	const hasStateCounts = $derived(
		stateCounts && (
			stateCounts.needsInput > 0 ||
			stateCounts.working > 0 ||
			stateCounts.review > 0 ||
			stateCounts.completed > 0 ||
			(stateCounts.starting && stateCounts.starting > 0) ||
			(stateCounts.idle && stateCounts.idle > 0)
		)
	);

	// Tooltip text showing state breakdown
	const stateTooltip = $derived(() => {
		if (!stateCounts) {
			return activeAgents.length > 0
				? `Active: ${activeAgents.join(', ')}`
				: 'No active sessions';
		}

		const parts = [];
		if (stateCounts.needsInput > 0) parts.push(`${stateCounts.needsInput} needs input`);
		if (stateCounts.review > 0) parts.push(`${stateCounts.review} in review`);
		if (stateCounts.working > 0) parts.push(`${stateCounts.working} working`);
		if (stateCounts.starting && stateCounts.starting > 0) parts.push(`${stateCounts.starting} starting`);
		if (stateCounts.completed > 0) parts.push(`${stateCounts.completed} completed`);
		if (stateCounts.idle && stateCounts.idle > 0) parts.push(`${stateCounts.idle} idle`);

		return parts.length > 0 ? parts.join(', ') : 'No active sessions';
	});

	// Colors matching session states
	const STATE_COLORS = {
		needsInput: 'oklch(0.65 0.25 25)',      // Red - needs attention
		review: 'oklch(0.78 0.18 85)',           // Yellow - waiting review
		working: 'oklch(0.75 0.20 60)',          // Orange - being worked
		starting: 'oklch(0.70 0.15 220)',        // Blue/Cyan - starting up
		completed: 'oklch(0.70 0.20 145)',       // Green - complete
		idle: 'oklch(0.55 0.02 250)'             // Grey - no active task
	};
</script>

<!-- Industrial Agent Count Badge with State Dots -->
<div class="flex items-center" title={stateTooltip()}>
	<span
		class="px-2 py-0.5 rounded text-xs font-mono flex items-center gap-1"
		style="
			background: oklch(0.18 0.01 250);
			border: 1px solid {activeCount > 0 ? 'oklch(0.45 0.10 200)' : 'oklch(0.35 0.02 250)'};
			color: {activeCount > 0 ? 'oklch(0.75 0.10 200)' : 'oklch(0.55 0.02 250)'};
		"
	>
		{#if hasStateCounts && stateCounts}
			<!-- State-colored dots with counts (ordered by urgency) -->
			<div class="flex items-center gap-0.5">
				{#if stateCounts.needsInput > 0}
					<!-- Red pulsing - needs attention -->
					<div class="flex items-center gap-0.5" title="{stateCounts.needsInput} needs input">
						<span class="relative flex h-2 w-2">
							<span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style="background: {STATE_COLORS.needsInput};"></span>
							<span class="relative inline-flex rounded-full h-2 w-2" style="background: {STATE_COLORS.needsInput};"></span>
						</span>
						<span class="text-[10px] font-bold" style="color: {STATE_COLORS.needsInput};">{stateCounts.needsInput}</span>
					</div>
				{/if}
				{#if stateCounts.review > 0}
					<!-- Yellow pulsing - in review -->
					<div class="flex items-center gap-0.5" title="{stateCounts.review} in review">
						<span class="relative flex h-2 w-2">
							<span class="animate-pulse absolute inline-flex h-full w-full rounded-full opacity-75" style="background: {STATE_COLORS.review};"></span>
							<span class="relative inline-flex rounded-full h-2 w-2" style="background: {STATE_COLORS.review};"></span>
						</span>
						<span class="text-[10px] font-bold" style="color: {STATE_COLORS.review};">{stateCounts.review}</span>
					</div>
				{/if}
				{#if stateCounts.working > 0}
					<!-- Orange - working -->
					<div class="flex items-center gap-0.5" title="{stateCounts.working} working">
						<span class="inline-flex rounded-full h-2 w-2" style="background: {STATE_COLORS.working};"></span>
						<span class="text-[10px] font-bold" style="color: {STATE_COLORS.working};">{stateCounts.working}</span>
					</div>
				{/if}
				{#if stateCounts.starting && stateCounts.starting > 0}
					<!-- Blue/Cyan - starting -->
					<div class="flex items-center gap-0.5" title="{stateCounts.starting} starting">
						<span class="inline-flex rounded-full h-2 w-2" style="background: {STATE_COLORS.starting};"></span>
						<span class="text-[10px] font-bold" style="color: {STATE_COLORS.starting};">{stateCounts.starting}</span>
					</div>
				{/if}
				{#if stateCounts.completed > 0}
					<!-- Green - completed -->
					<div class="flex items-center gap-0.5" title="{stateCounts.completed} completed">
						<span class="inline-flex rounded-full h-2 w-2" style="background: {STATE_COLORS.completed};"></span>
						<span class="text-[10px] font-bold" style="color: {STATE_COLORS.completed};">{stateCounts.completed}</span>
					</div>
				{/if}
				{#if stateCounts.idle && stateCounts.idle > 0}
					<!-- Grey - idle -->
					<div class="flex items-center gap-0.5" title="{stateCounts.idle} idle">
						<span class="inline-flex rounded-full h-2 w-2" style="background: {STATE_COLORS.idle};"></span>
						<span class="text-[10px] font-bold" style="color: {STATE_COLORS.idle};">{stateCounts.idle}</span>
					</div>
				{/if}
			</div>
		{:else if activeCount > 0}
			<!-- Fallback: Show single green dot with total count (legacy mode) -->
			<span class="relative flex h-2 w-2">
				<span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style="background: oklch(0.70 0.18 150);"></span>
				<span class="relative inline-flex rounded-full h-2 w-2" style="background: oklch(0.70 0.18 150);"></span>
			</span>
			{#if !compact}
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
					<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
				</svg>
			{/if}
			<AnimatedDigits value={activeCount.toString()} class="font-medium" />
		{:else}
			<!-- No active sessions -->
			{#if !compact}
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3 opacity-50">
					<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
				</svg>
			{/if}
			<span class="opacity-50">0</span>
		{/if}
		{#if !compact && !hasStateCounts}
			<span style="color: oklch(0.50 0.02 250);">agents</span>
		{/if}
	</span>
</div>
