<script lang="ts">
	/**
	 * WorkingAgentBadge Component
	 * Displays an agent avatar with working indicator ring and optional name/timer.
	 *
	 * Variants:
	 * - 'avatar': Just the avatar with ring
	 * - 'name': Avatar with ring + agent name
	 * - 'timer': Avatar with ring + agent name + working duration
	 */
	import { onMount, onDestroy } from 'svelte';
	import AgentAvatar from '$lib/components/AgentAvatar.svelte';
	import { getSessionStateVisual } from '$lib/config/statusColors';
	import { getSessionByAgent } from '$lib/stores/workSessions.svelte';

	interface Props {
		/** Agent name */
		name: string;
		/** Avatar size in pixels */
		size?: number;
		/** Whether agent is currently working (shows ring) */
		isWorking?: boolean;
		/** Session state for ring color (e.g., 'working', 'ready-for-review') - uses SESSION_STATE_VISUALS colors */
		sessionState?: string;
		/** Start time for the working timer (ISO string or timestamp) */
		startTime?: string | number | null;
		/** Display variant: 'avatar' | 'name' | 'timer' */
		variant?: 'avatar' | 'name' | 'timer';
		/** Callback when badge is clicked */
		onClick?: (agentName: string) => void;
		/** Additional CSS classes */
		class?: string;
		/** Play exit animation */
		exiting?: boolean;
	}

	let {
		name,
		size = 20,
		isWorking = true,
		sessionState,
		startTime = null,
		variant = 'timer',
		onClick,
		class: className = '',
		exiting = false
	}: Props = $props();

	// Effective session state for ring color
	// Priority: 1) explicit sessionState prop, 2) lookup from workSessionsState store, 3) fallback to 'working'
	const effectiveState = $derived.by(() => {
		if (sessionState) return sessionState;
		// Look up from global store if not provided
		const session = getSessionByAgent(name);
		return session?._sseState || 'working';
	});

	// Get the ring color from SESSION_STATE_VISUALS
	const ringColor = $derived.by(() => {
		if (!isWorking) return null;
		return getSessionStateVisual(effectiveState).accent;
	});

	function handleClick(event: MouseEvent) {
		if (onClick) {
			event.stopPropagation();
			onClick(name);
		}
	}

	// Working time counter
	let now = $state(Date.now());
	let timerInterval: ReturnType<typeof setInterval> | null = null;

	onMount(() => {
		if (variant === 'timer' && startTime) {
			// Update every 30 seconds for the working timer
			timerInterval = setInterval(() => {
				now = Date.now();
			}, 30000);
		}
	});

	onDestroy(() => {
		if (timerInterval) clearInterval(timerInterval);
	});

	// Calculate working duration
	const workingDuration = $derived.by(() => {
		if (variant !== 'timer' || !startTime) return null;
		const start = typeof startTime === 'string' ? new Date(startTime).getTime() : startTime;
		const elapsed = now - start;
		if (elapsed < 0 || isNaN(elapsed)) return null;

		const minutes = Math.floor(elapsed / 60000);
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;

		if (hours > 0) {
			return { hours, mins, display: `${hours}h${mins > 0 ? ` ${mins}m` : ''}` };
		}
		return { hours: 0, mins: minutes, display: `${minutes}m` };
	});

	// Tooltip text
	const tooltipText = $derived(
		workingDuration
			? `${name} - working for ${workingDuration.display}`
			: name
	);
</script>

{#if variant === 'avatar'}
	<!-- Avatar only with ring -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="{onClick ? 'cursor-pointer hover:scale-110 transition-transform' : ''} {className}"
		title={tooltipText}
		onclick={handleClick}
	>
		<AgentAvatar {name} {size} showRing={isWorking} sessionState={effectiveState} {exiting} />
	</div>
{:else}
	<!-- Avatar + name (+ timer if variant === 'timer') -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="inline-flex items-center gap-1.5 {onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''} {className}"
		onclick={handleClick}
	>
		<AgentAvatar {name} {size} showRing={isWorking} sessionState={effectiveState} {exiting} />
		<span class="font-medium text-xs" style={ringColor ? `color: ${ringColor};` : 'color: oklch(0.70 0.18 250);'}>{name}</span>
		{#if variant === 'timer' && workingDuration}
			<span class="countdown font-mono text-xs tabular-nums text-info/70" title="Working for {workingDuration.display}">
				{#if workingDuration.hours > 0}
					<span style="--value:{workingDuration.hours};"></span>h
					<span style="--value:{workingDuration.mins};"></span>m
				{:else}
					<span style="--value:{workingDuration.mins};"></span>m
				{/if}
			</span>
		{/if}
	</div>
{/if}
