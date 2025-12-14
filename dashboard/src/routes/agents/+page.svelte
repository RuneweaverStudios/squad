<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import TaskTable from '$lib/components/agents/TaskTable.svelte';
	import AgentGrid from '$lib/components/agents/AgentGrid.svelte';
	import TaskDetailDrawer from '$lib/components/TaskDetailDrawer.svelte';
	import ResizableDivider from '$lib/components/ResizableDivider.svelte';
	import { lastSessionEvent } from '$lib/stores/sessionEvents';
	import { lastTaskEvent } from '$lib/stores/taskEvents';
	import AgentGridSkeleton from '$lib/components/skeleton/AgentGridSkeleton.svelte';
	import TaskTableSkeleton from '$lib/components/skeleton/TaskTableSkeleton.svelte';

	let tasks = $state<any[]>([]);
	let allTasks = $state<any[]>([]);  // Unfiltered tasks for project list calculation
	let agents = $state<any[]>([]);
	let reservations = $state<any[]>([]);
	let selectedProject = $state('All Projects');
	let isInitialLoad = $state(true);

	// Drawer state for TaskDetailDrawer
	let drawerOpen = $state(false);
	let selectedTaskId = $state<string | null>(null);

	// Highlighted agent for scroll-to-agent feature
	let highlightedAgent = $state<string | null>(null);

	// Resizable panel state
	const STORAGE_KEY = 'dash-panel-split';
	const DEFAULT_SPLIT = 40; // 40% for AgentGrid, 60% for TaskTable
	const MIN_SPLIT = 20;
	const MAX_SPLIT = 80;
	const SNAP_RESTORE_SIZE = 40; // Restore to 40% when unsnapping

	let splitPercent = $state(DEFAULT_SPLIT);
	let containerHeight = $state(0);
	let containerRef: HTMLDivElement | null = null;

	// Snap-to-collapse state
	let isCollapsed = $state(false);
	let collapsedDirection = $state<'top' | 'bottom' | null>(null);
	let splitBeforeCollapse = $state(DEFAULT_SPLIT);

	// Load saved split from localStorage
	$effect(() => {
		if (browser) {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) {
				const parsed = parseFloat(saved);
				// Check for collapsed states (0 or 100)
				if (parsed === 0) {
					isCollapsed = true;
					collapsedDirection = 'top';
					splitPercent = 0;
				} else if (parsed === 100) {
					isCollapsed = true;
					collapsedDirection = 'bottom';
					splitPercent = 100;
				} else if (!isNaN(parsed) && parsed >= MIN_SPLIT && parsed <= MAX_SPLIT) {
					splitPercent = parsed;
					splitBeforeCollapse = parsed;
				}
			}
		}
	});

	// Save split to localStorage when it changes
	function saveSplit() {
		if (browser) {
			localStorage.setItem(STORAGE_KEY, splitPercent.toString());
		}
	}

	// Handle resize from divider
	function handleResize(deltaY: number) {
		if (!containerHeight) return;

		const deltaPercent = (deltaY / containerHeight) * 100;
		let newSplit = splitPercent + deltaPercent;

		// Snap when user drags past the normal bounds
		// (they're at the edge and still pushing)
		if (newSplit < MIN_SPLIT) {
			// Trying to drag past minimum → snap top panel closed
			splitBeforeCollapse = splitPercent >= MIN_SPLIT ? splitPercent : SNAP_RESTORE_SIZE;
			splitPercent = 0;
			isCollapsed = true;
			collapsedDirection = 'top';
			saveSplit();
			return;
		} else if (newSplit > MAX_SPLIT) {
			// Trying to drag past maximum → snap bottom panel closed
			splitBeforeCollapse = splitPercent <= MAX_SPLIT ? splitPercent : 100 - SNAP_RESTORE_SIZE;
			splitPercent = 100;
			isCollapsed = true;
			collapsedDirection = 'bottom';
			saveSplit();
			return;
		}

		// Normal resize within bounds
		splitPercent = newSplit;
		isCollapsed = false;
		collapsedDirection = null;
		saveSplit();
	}

	// Restore from collapsed state
	function handleRestoreFromCollapse() {
		splitPercent = splitBeforeCollapse;
		isCollapsed = false;
		collapsedDirection = null;
		saveSplit();
	}

	// Update container height on mount and resize
	function updateContainerHeight() {
		if (containerRef) {
			containerHeight = containerRef.clientHeight;
		}
	}

	// Sync selectedProject from URL params (REACTIVE using $page store)
	$effect(() => {
		const projectParam = $page.url.searchParams.get('project');
		if (projectParam && projectParam !== 'All Projects') {
			selectedProject = projectParam;
		} else {
			selectedProject = 'All Projects';
		}
	});

	// Refetch data whenever selectedProject changes (triggered by URL or dropdown)
	$effect(() => {
		// This effect depends on selectedProject, so it re-runs when it changes
		selectedProject; // Read selectedProject to create dependency
		fetchData();
	});

	// Fetch agent data from unified API
	// Phase 1: Fast load without usage data (agents, tasks, reservations)
	// Phase 2: Lazy load usage data separately for displayed agents
	async function fetchData(includeUsage = false) {
		try {
			// Build URL with project filter and activities
			// Only include usage=true if explicitly requested (for background refresh)
			let url = `/api/agents?full=true&activities=true${includeUsage ? '&usage=true' : ''}`;
			if (selectedProject && selectedProject !== 'All Projects') {
				url += `&project=${encodeURIComponent(selectedProject)}`;
			}

			const response = await fetch(url);
			const data = await response.json();

			if (data.error) {
				console.error('API error:', data.error);
				return;
			}

			// Update state with real data
			agents = data.agents || [];
			reservations = data.reservations || [];
			tasks = data.tasks || [];

			// Update allTasks when viewing all projects (for dropdown options)
			if (selectedProject === 'All Projects') {
				allTasks = data.tasks || [];
			}
		} catch (error) {
			console.error('Failed to fetch agent data:', error);
		} finally {
			// Only set to false after first load completes
			isInitialLoad = false;
		}
	}

	// Fetch usage data separately (runs after initial load completes)
	async function fetchUsageData() {
		try {
			const response = await fetch('/api/agents?full=true&usage=true');
			const data = await response.json();

			if (data.error || !data.agents) return;

			// Merge usage data (including sparklineData and contextPercent) into existing agents
			const usageMap = new Map(data.agents.map((a: { name: string; usage?: unknown; sparklineData?: unknown; contextPercent?: number }) => [a.name, { usage: a.usage, sparklineData: a.sparklineData, contextPercent: a.contextPercent }]));
			agents = agents.map(agent => {
				const usageData = usageMap.get(agent.name);
				if (usageData) {
					return {
						...agent,
						usage: usageData.usage || agent.usage,
						sparklineData: usageData.sparklineData || agent.sparklineData,
						contextPercent: usageData.contextPercent ?? agent.contextPercent
					};
				}
				return agent;
			});
		} catch (error) {
			console.error('Failed to fetch usage data:', error);
		}
	}

	// Handle task assignment via drag-and-drop
	async function handleTaskAssign(taskId: string, agentName: string) {
		try {
			const response = await fetch('/api/agents', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ taskId, agentName })
			});

			const result = await response.json();

			if (!response.ok || result.error) {
				console.error('Failed to assign task:', result.error || result.message);
				throw new Error(result.message || 'Failed to assign task');
			}

			// Immediately refresh data to show updated assignment
			await fetchData();
		} catch (error) {
			console.error('Error assigning task:', error);
			throw error;
		}
	}

	// Handle task click from TaskQueue - open drawer
	function handleTaskClick(taskId: string) {
		selectedTaskId = taskId;
		drawerOpen = true;
	}

	// Handle agent click - scroll to agent card and highlight it
	function handleAgentClick(agentName: string) {
		// Find the agent card element using data-agent-name attribute
		const agentCard = document.querySelector(`[data-agent-name="${agentName}"]`);
		if (agentCard) {
			// Scroll the agent card into view smoothly
			agentCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

			// Set highlighted state to trigger animation
			highlightedAgent = agentName;

			// Clear highlight after animation completes (1.5s matches CSS animation duration)
			setTimeout(() => {
				highlightedAgent = null;
			}, 1500);
		}
	}

	// Auto-refresh data every 30 seconds (reduced from 15s since SSE handles state updates)
	// Include usage data on background refresh (user won't notice delay)
	$effect(() => {
		const interval = setInterval(() => fetchData(true), 30000);
		return () => clearInterval(interval);
	});

	// React to session events from SSE
	// Only refetch for structural changes (create/destroy), not state changes
	// State changes are handled in real-time via SSE → sessionEvents store
	$effect(() => {
		const event = $lastSessionEvent;
		if (event) {
			// Only refresh for structural changes that affect agent/task list
			const structuralEvents = ['session-created', 'session-destroyed', 'session-killed', 'session-spawned'];
			if (structuralEvents.includes(event.type)) {
				fetchData();
			}
			// session-state and session-output are handled by SSE real-time updates
			// No need to refetch the entire agent list for state changes
		}
	});

	// React to task events from SSE (status/assignee changes)
	// This ensures AgentGrid and TaskTable update immediately when tasks are assigned
	$effect(() => {
		const unsubscribe = lastTaskEvent.subscribe((event) => {
			if (event) {
				fetchData();
			}
		});
		return unsubscribe;
	});

	// Track previous drawer state to detect close transition
	let wasDrawerOpen = false;

	// Refetch data when drawer closes (to update any changes made in drawer)
	$effect(() => {
		if (wasDrawerOpen && !drawerOpen) {
			fetchData();
		}
		wasDrawerOpen = drawerOpen;
	});

	onMount(async () => {
		// Phase 1: Quick initial load (no usage data) - don't wait for sparkline
		await fetchData();
		updateContainerHeight();

		// Phase 2: Load usage data in background (don't block UI)
		setTimeout(() => fetchUsageData(), 5000);
	});
</script>

<svelte:head>
	<title>Agents | JAT Dashboard</title>
</svelte:head>

<svelte:window onresize={updateContainerHeight} />

<div
	bind:this={containerRef}
	class="h-full bg-base-200 flex flex-col overflow-hidden"
>
	<!-- Agent Grid -->
	<div
		class="overflow-hidden bg-base-100 flex flex-col transition-all duration-150"
		style="height: {splitPercent}%;"
		class:hidden={collapsedDirection === 'top'}
	>
		{#if isInitialLoad}
			<AgentGridSkeleton cards={4} />
		{:else}
			<AgentGrid {agents} {tasks} onTaskClick={handleTaskClick} {highlightedAgent} />
		{/if}
	</div>

	<!-- Resizable Divider -->
	<ResizableDivider
		onResize={handleResize}
		{isCollapsed}
		{collapsedDirection}
		onCollapsedClick={handleRestoreFromCollapse}
		class="h-2 bg-base-300 hover:bg-primary/20 border-y border-base-300 flex-shrink-0"
	/>

	<!-- Task Section -->
	<div
		class="overflow-auto bg-base-100 flex-1 transition-all duration-150"
		style="height: {100 - splitPercent}%;"
		class:hidden={collapsedDirection === 'bottom'}
	>
		{#if isInitialLoad}
			<TaskTableSkeleton rows={8} showFilters={true} />
		{:else}
			<TaskTable
				{tasks}
				{allTasks}
				{agents}
				{reservations}
				ontaskclick={handleTaskClick}
				onagentclick={handleAgentClick}
			/>
		{/if}
	</div>

	<!-- Task Detail Drawer -->
	<TaskDetailDrawer
		bind:taskId={selectedTaskId}
		bind:isOpen={drawerOpen}
	/>
</div>
