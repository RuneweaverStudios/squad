<script lang="ts">
	/**
	 * Work Page
	 * Shows active Claude Code work sessions with TaskTable below.
	 *
	 * Layout: WorkPanel (horizontal scroll) + Resizable Divider + TaskTable
	 * User can drag divider to adjust split between panels.
	 */

	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import TaskTable from '$lib/components/agents/TaskTable.svelte';
	import WorkPanel from '$lib/components/work/WorkPanel.svelte';
	import TaskDetailDrawer from '$lib/components/TaskDetailDrawer.svelte';
	import ResizableDivider from '$lib/components/ResizableDivider.svelte';
	import {
		workSessionsState,
		fetch as fetchSessions,
		spawn,
		kill,
		sendInput,
		interrupt,
		sendEnter,
		startPolling,
		stopPolling
	} from '$lib/stores/workSessions.svelte.js';
	import { broadcastSessionEvent } from '$lib/stores/sessionEvents';

	// Resizable panel state
	const STORAGE_KEY = 'work-panel-split';
	const DEFAULT_SPLIT = 60; // 60% for work panel, 40% for task table
	const MIN_SPLIT = 20;
	const MAX_SPLIT = 80;

	let splitPercent = $state(DEFAULT_SPLIT);
	let containerHeight = $state(0);
	let containerRef: HTMLDivElement | null = null;

	// Load saved split from localStorage
	$effect(() => {
		if (browser) {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) {
				const parsed = parseFloat(saved);
				if (!isNaN(parsed) && parsed >= MIN_SPLIT && parsed <= MAX_SPLIT) {
					splitPercent = parsed;
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
		const newSplit = Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, splitPercent + deltaPercent));
		splitPercent = newSplit;
		saveSplit();
	}

	// Update container height on mount and resize
	function updateContainerHeight() {
		if (containerRef) {
			containerHeight = containerRef.clientHeight;
		}
	}

	// Task state
	let tasks = $state<any[]>([]);
	let allTasks = $state<any[]>([]);
	let agents = $state<any[]>([]);
	let reservations = $state<any[]>([]);
	let selectedProject = $state('All Projects');
	let isInitialLoad = $state(true);

	// Drawer state
	let drawerOpen = $state(false);
	let selectedTaskId = $state<string | null>(null);

	// Highlighted agent for scroll-to-agent feature
	let highlightedAgent = $state<string | null>(null);

	// Sync selectedProject from URL params
	$effect(() => {
		const projectParam = $page.url.searchParams.get('project');
		if (projectParam && projectParam !== 'All Projects') {
			selectedProject = projectParam;
		} else {
			selectedProject = 'All Projects';
		}
	});

	// Refetch data whenever selectedProject changes
	$effect(() => {
		selectedProject;
		fetchTaskData();
	});

	// Fetch task data
	async function fetchTaskData() {
		try {
			let url = '/api/agents?full=true';
			if (selectedProject && selectedProject !== 'All Projects') {
				url += `&project=${encodeURIComponent(selectedProject)}`;
			}

			const response = await fetch(url);
			const data = await response.json();

			if (data.error) {
				console.error('API error:', data.error);
				return;
			}

			agents = data.agents || [];
			reservations = data.reservations || [];
			tasks = data.tasks || [];

			if (selectedProject === 'All Projects') {
				allTasks = data.tasks || [];
			}
		} catch (error) {
			console.error('Failed to fetch task data:', error);
		} finally {
			isInitialLoad = false;
		}
	}

	// Event Handlers for WorkPanel

	async function handleSpawnForTask(taskId: string) {
		const session = await spawn(taskId);
		if (session) {
			await fetchTaskData();
		}
	}

	async function handleKillSession(sessionName: string) {
		const success = await kill(sessionName);
		if (success) {
			// Broadcast event so other pages (like /dash) know to refresh
			broadcastSessionEvent('session-killed', sessionName);
			await fetchTaskData();
		}
	}

	async function handleInterrupt(sessionName: string) {
		await interrupt(sessionName);
	}

	async function handleContinue(sessionName: string) {
		await sendEnter(sessionName);
	}

	async function handleAttachTerminal(sessionName: string) {
		try {
			const response = await fetch(`/api/work/${sessionName}/attach`, {
				method: 'POST'
			});
			if (!response.ok) {
				console.error('Failed to attach terminal:', await response.text());
			}
		} catch (error) {
			console.error('Failed to attach terminal:', error);
		}
	}

	async function handleSendInput(sessionName: string, input: string, type: 'text' | 'key') {
		const inputType = type === 'key' ? 'raw' : 'text';
		await sendInput(sessionName, input, inputType);
	}

	// Handle task click
	function handleTaskClick(taskId: string) {
		selectedTaskId = taskId;
		drawerOpen = true;
	}

	// Handle agent click - scroll to work card and highlight it
	function handleAgentClick(agentName: string) {
		// Find the work card element using data-agent-name attribute
		const workCard = document.querySelector(`[data-agent-name="${agentName}"]`);
		if (workCard) {
			// Scroll the work card into view smoothly
			workCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

			// Set highlighted state to trigger animation
			highlightedAgent = agentName;

			// Clear highlight after animation completes (1.5s matches CSS animation duration)
			setTimeout(() => {
				highlightedAgent = null;
			}, 1500);
		}
	}

	// Refetch on drawer close
	let wasDrawerOpen = false;
	$effect(() => {
		if (wasDrawerOpen && !drawerOpen) {
			fetchTaskData();
			fetchSessions();
		}
		wasDrawerOpen = drawerOpen;
	});

	// Auto-refresh task data every 15 seconds
	$effect(() => {
		const interval = setInterval(fetchTaskData, 15000);
		return () => clearInterval(interval);
	});

	onMount(() => {
		fetchTaskData();
		startPolling(500);
		updateContainerHeight();
		window.addEventListener('resize', updateContainerHeight);
	});

	onDestroy(() => {
		stopPolling();
		if (browser) {
			window.removeEventListener('resize', updateContainerHeight);
		}
	});
</script>

<svelte:window onresize={updateContainerHeight} />

<div
	bind:this={containerRef}
	class="h-screen bg-base-200 flex flex-col overflow-hidden"
>
	<!-- Work Sessions (horizontal scroll) -->
	<div
		class="overflow-hidden bg-base-100 flex flex-col"
		style="height: {splitPercent}%;"
	>
		{#if isInitialLoad}
			<div class="flex items-center justify-center flex-1">
				<div class="text-center">
					<span class="loading loading-bars loading-lg mb-4"></span>
					<p class="text-sm text-base-content/60">Loading work sessions...</p>
				</div>
			</div>
		{:else}
			<WorkPanel
				workSessions={workSessionsState.sessions}
				onSpawnForTask={handleSpawnForTask}
				onKillSession={handleKillSession}
				onInterrupt={handleInterrupt}
				onContinue={handleContinue}
				onAttachTerminal={handleAttachTerminal}
				onSendInput={handleSendInput}
				onTaskClick={handleTaskClick}
				{highlightedAgent}
				class="flex-1"
			/>
		{/if}
	</div>

	<!-- Resizable Divider -->
	<ResizableDivider
		onResize={handleResize}
		class="h-2 bg-base-300 hover:bg-primary/20 border-y border-base-300 flex-shrink-0"
	/>

	<!-- Task Table -->
	<div
		class="overflow-auto bg-base-100 flex-1"
		style="height: {100 - splitPercent}%;"
	>
		{#if isInitialLoad}
			<div class="flex items-center justify-center h-48">
				<div class="text-center">
					<span class="loading loading-bars loading-lg mb-4"></span>
					<p class="text-sm text-base-content/60">Loading tasks...</p>
				</div>
			</div>
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
