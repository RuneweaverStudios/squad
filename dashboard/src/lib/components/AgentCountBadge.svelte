<script lang="ts">
	/**
	 * AgentCountBadge Component
	 * Displays count of active agent sessions
	 *
	 * Shows only active agents with live pulsing indicator
	 */

	import AnimatedDigits from './AnimatedDigits.svelte';

	interface Props {
		activeCount: number;
		totalCount?: number; // Kept for backward compatibility but not displayed
		activeAgents?: string[];
		compact?: boolean;
	}

	let {
		activeCount = 0,
		totalCount = 0,
		activeAgents = [],
		compact = false
	}: Props = $props();

	// Tooltip text showing active agent names
	const activeTooltip = $derived(
		activeAgents.length > 0
			? `Active: ${activeAgents.join(', ')}`
			: 'No active sessions'
	);
</script>

<!-- Industrial Agent Count Badge - Active Only -->
<div class="flex items-center" title={activeTooltip}>
	<span
		class="px-2 py-0.5 rounded text-xs font-mono flex items-center gap-1.5"
		style="
			background: oklch(0.18 0.01 250);
			border: 1px solid {activeCount > 0 ? 'oklch(0.50 0.15 150)' : 'oklch(0.35 0.02 250)'};
			color: {activeCount > 0 ? 'oklch(0.70 0.18 150)' : 'oklch(0.55 0.02 250)'};
		"
	>
		{#if activeCount > 0}
			<!-- Pulsing live indicator inside badge -->
			<span class="relative flex h-2 w-2">
				<span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style="background: oklch(0.70 0.18 150);"></span>
				<span class="relative inline-flex rounded-full h-2 w-2" style="background: oklch(0.70 0.18 150);"></span>
			</span>
		{/if}
		{#if !compact}
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
			</svg>
		{/if}
		<AnimatedDigits value={activeCount.toString()} class="font-medium" />
		{#if !compact}
			<span style="color: oklch(0.50 0.02 250);">agents</span>
		{/if}
	</span>
</div>
