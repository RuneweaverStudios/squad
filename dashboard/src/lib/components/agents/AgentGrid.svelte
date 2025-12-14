<script lang="ts">
	import SessionCard from '$lib/components/work/SessionCard.svelte';
	import { playAgentJoinSound } from '$lib/utils/soundEffects';
	import { fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { onMount } from 'svelte';
	import type { Agent, Task } from '$lib/stores/agents.svelte';
	import {
		initAgentSort,
		getAgentSortBy,
		getAgentSortDir,
		type AgentSortOption
	} from '$lib/stores/agentSort.svelte.js';

	// Props with types - simplified for one task : one agent model
	interface Props {
		agents?: Agent[];
		tasks?: Task[];
		onTaskClick?: (taskId: string) => void;
		/** Currently highlighted agent name (for scroll-to-agent feature) */
		highlightedAgent?: string | null;
	}

	let { agents = [], tasks = [], onTaskClick = () => {}, highlightedAgent = null }: Props = $props();

	// Initialize agent sort store on mount
	onMount(() => {
		initAgentSort();
	});

	// Get sort state from shared store
	const sortBy = $derived(getAgentSortBy());
	const sortDir = $derived(getAgentSortDir());

	// Track previously seen agent names for entrance animation
	// Using regular variables (not $state) to avoid effect loops
	let previousAgentNames: Set<string> = new Set();
	let isInitialLoad = true;

	// Reactive state for animation triggers
	let newAgentNames = $state<string[]>([]);

	// Detect new agents when agents array changes
	// Using $effect.pre to set animation state BEFORE rendering
	$effect.pre(() => {
		const currentNames = new Set(agents.map(a => a.name));

		// Skip animation on initial load
		if (isInitialLoad) {
			previousAgentNames = currentNames;
			isInitialLoad = false;
			return;
		}

		// Find agents that weren't in the previous set (new agents)
		const newNames: string[] = [];
		for (const name of currentNames) {
			if (!previousAgentNames.has(name)) {
				newNames.push(name);
			}
		}

		// Update tracking for next comparison
		previousAgentNames = currentNames;

		// If we found new agents, trigger animation and sound
		if (newNames.length > 0) {
			newAgentNames = newNames;
			playAgentJoinSound();

			// Clear the new agent highlight after animation completes
			setTimeout(() => {
				newAgentNames = [];
			}, 1500);
		}
	});

	// Get agent's current task (if any)
	function getAgentTask(agent: Agent): Task | null {
		return tasks.find(t => t.assignee === agent.name && t.status === 'in_progress') || null;
	}

	// Agent status type
	type AgentStatus = 'live' | 'working' | 'active' | 'idle' | 'offline';

	// Helper to compute agent status (matches AgentCard.svelte and store logic)
	function getAgentStatus(agent: Agent): AgentStatus {
		const hasActiveLocks = agent.reservation_count > 0;
		const hasInProgressTask = agent.in_progress_tasks > 0;

		let timeSinceActive = Infinity;
		if (agent.last_active_ts) {
			const isoTimestamp = agent.last_active_ts.includes('T')
				? agent.last_active_ts
				: agent.last_active_ts.replace(' ', 'T') + 'Z';
			const lastActivity = new Date(isoTimestamp);
			timeSinceActive = Date.now() - lastActivity.getTime();
		}

		// Priority 1: WORKING - Has active task or locks (regardless of time)
		// Show "working" if agent has actual work assigned, even if recently active
		if (hasInProgressTask || hasActiveLocks) {
			return 'working';
		}

		// Priority 2: LIVE - Very recent activity (< 1 minute) but no task
		if (timeSinceActive < 60000) {
			return 'live';
		}

		// Priority 3: ACTIVE - Recent activity (< 10 minutes)
		if (timeSinceActive < 600000) {
			return 'active';
		}

		// Priority 4: IDLE - Within 1 hour
		if (timeSinceActive < 3600000) {
			return 'idle';
		}

		// Priority 5: OFFLINE
		return 'offline';
	}

	// Status priority for sorting (lower number = higher priority)
	function getStatusPriority(status: AgentStatus): number {
		const priorities: Record<AgentStatus, number> = {
			live: 1,
			working: 2,
			active: 3,
			idle: 4,
			offline: 5
		};
		return priorities[status] || 999;
	}

	// Filter out offline agents (> 1 hour inactive) - they just add clutter
	// Users can manage offline agents through agent-mail CLI if needed
	const activeAgents = $derived.by(() => {
		return agents.filter(a => getAgentStatus(a) !== 'offline');
	});

	// Count of hidden offline agents (for UI feedback)
	const offlineCount = $derived.by(() => agents.length - activeAgents.length);

	// Sort agents based on selected sort option and direction
	const sortedAgents = $derived.by(() => {
		const dir = sortDir === 'asc' ? 1 : -1;
		return [...activeAgents].sort((a, b) => {
			switch (sortBy) {
				case 'status': {
					// Sort by status priority (asc = live first, desc = idle first)
					const statusA = getAgentStatus(a);
					const statusB = getAgentStatus(b);
					const priorityA = getStatusPriority(statusA);
					const priorityB = getStatusPriority(statusB);
					if (priorityA !== priorityB) return (priorityA - priorityB) * dir;
					// Secondary: last activity (most recent first)
					if (a.last_active_ts && b.last_active_ts) {
						return new Date(b.last_active_ts).getTime() - new Date(a.last_active_ts).getTime();
					}
					return a.name.localeCompare(b.name);
				}
				case 'name': {
					// Sort by name (asc = A-Z, desc = Z-A)
					return a.name.localeCompare(b.name) * dir;
				}
				case 'tasks': {
					// Sort by in-progress task count (asc = least first, desc = most first)
					const tasksA = a.in_progress_tasks || 0;
					const tasksB = b.in_progress_tasks || 0;
					if (tasksA !== tasksB) return (tasksA - tasksB) * dir;
					// Secondary: name
					return a.name.localeCompare(b.name);
				}
				case 'cost': {
					// Sort by token usage/cost (asc = least first, desc = most first)
					// Note: usage may be present in API response but not in base Agent type
					const costA = (a as { usage?: { today?: { cost?: number } } }).usage?.today?.cost || 0;
					const costB = (b as { usage?: { today?: { cost?: number } } }).usage?.today?.cost || 0;
					if (costA !== costB) return (costA - costB) * dir;
					// Secondary: name
					return a.name.localeCompare(b.name);
				}
				default:
					return 0;
			}
		});
	});

</script>

<!-- Industrial Agent Grid -->
<div class="flex flex-col h-full">
	<!-- Agent Grid - Horizontal Scrolling Row - Industrial -->
	<div class="p-4 h-full" style="background: oklch(0.14 0.01 250);">
		{#if sortedAgents.length === 0}
			<!-- Empty State - Industrial -->
			<div
				class="flex flex-col items-center justify-center h-48 text-center rounded-lg"
				style="
					background: oklch(0.16 0.01 250);
					border: 1px dashed oklch(0.30 0.02 250);
				"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-16 h-16 mb-4"
					style="color: oklch(0.30 0.02 250);"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
					/>
				</svg>
				<h3 class="text-lg font-medium font-mono mb-2" style="color: oklch(0.55 0.02 250);">No Active Agents</h3>
				<p class="text-sm max-w-md" style="color: oklch(0.45 0.02 250);">
					{#if offlineCount > 0}
						{offlineCount} agent{offlineCount === 1 ? '' : 's'} offline (inactive > 1 hour).
						Active agents will appear here when they start working.
					{:else}
						Agents will appear here when they register and start working. Use Agent Mail's
						<code class="text-xs px-1 py-0.5 rounded font-mono" style="background: oklch(0.22 0.01 250); color: oklch(0.70 0.18 240);">am-register</code> command to create agents.
					{/if}
				</p>
			</div>
		{:else}
			<!-- Horizontal Scrolling Row - Industrial -->
			<div class="flex gap-4 overflow-x-auto pb-2 h-full scrollbar-thin scrollbar-thumb-base-300 scrollbar-track-transparent">
				{#each sortedAgents as agent (agent.id || agent.name)}
					{@const agentTask = getAgentTask(agent)}
					<div
						class="flex-shrink-0 w-72 {newAgentNames.includes(agent.name) ? 'agent-new-entrance' : ''}"
						animate:flip={{ duration: 300 }}
						in:fly={{ x: -50, duration: 400, delay: 100 }}
					>
						<SessionCard
							mode="compact"
							sessionName={`jat-${agent.name}`}
							agentName={agent.name}
							task={agentTask ? {
								id: agentTask.id,
								title: agentTask.title,
								status: agentTask.status,
								priority: agentTask.priority,
								issue_type: agentTask.issue_type
							} : null}
							tokens={(agent as any).usage?.today?.total_tokens || 0}
							cost={(agent as any).usage?.today?.cost || 0}
							sparklineData={(agent as any).sparklineData}
							contextPercent={(agent as any).contextPercent}
							created={agent.last_active_ts || ''}
							attached={agent.hasSession || false}
							{onTaskClick}
							isHighlighted={highlightedAgent === agent.name}
						/>
					</div>
				{/each}
				<!-- Offline count indicator -->
				{#if offlineCount > 0}
					<div class="flex-shrink-0 w-48 h-full flex items-center justify-center">
						<div class="text-center p-4 rounded-lg" style="background: oklch(0.16 0.01 250); border: 1px dashed oklch(0.25 0.02 250);">
							<p class="font-mono text-2xl mb-1" style="color: oklch(0.40 0.02 250);">{offlineCount}</p>
							<p class="font-mono text-xs uppercase tracking-wider" style="color: oklch(0.35 0.02 250);">offline</p>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
