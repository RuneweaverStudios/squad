<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { replaceState } from '$app/navigation';
	import TaskQueue from '$lib/components/agents/TaskQueue.svelte';
	import AgentGrid from '$lib/components/agents/AgentGrid.svelte';
	import Sparkline from '$lib/components/Sparkline.svelte';
	import TaskDetailDrawer from '$lib/components/TaskDetailDrawer.svelte';
	import {
		getProjectsFromTasks,
		getTaskCountByProject
	} from '$lib/utils/projectUtils';
	import { spawn } from '$lib/stores/workSessions.svelte.js';

	let tasks = $state([]);
	let allTasks = $state([]);  // Unfiltered tasks for project list calculation
	let agents = $state([]);
	let reservations = $state([]);
	let unassignedTasks = $state([]);
	let taskStats = $state(null);
	let selectedProject = $state('All Projects');
	let sparklineData = $state([]);
	let isInitialLoad = $state(true);

	// Drawer state for TaskDetailDrawer
	let drawerOpen = $state(false);
	let selectedTaskId = $state<string | null>(null);

	// Highlighted agent for scroll-to-agent feature
	let highlightedAgent = $state<string | null>(null);

	// Extract unique projects from ALL tasks (unfiltered)
	const projects = $derived(getProjectsFromTasks(allTasks));

	// Get task count per project from ALL tasks (only count 'open' tasks to match TaskQueue default)
	const taskCounts = $derived(getTaskCountByProject(allTasks, 'open'));

	// Handle project selection change
	function handleProjectChange(project: string) {
		selectedProject = project;

		// Update URL parameter using SvelteKit's replaceState
		const url = new URL(window.location.href);
		if (project === 'All Projects') {
			url.searchParams.delete('project');
		} else {
			url.searchParams.set('project', project);
		}
		replaceState(url, {});

		// Refetch data with new project filter
		fetchData();
	}

	// Track previous project to detect actual changes (not initial render)
	let previousProject: string | null = null;

	// Sync selectedProject from URL params AND fetch when project actually changes
	$effect(() => {
		const projectParam = $page.url.searchParams.get('project');
		const newProject = (projectParam && projectParam !== 'All Projects') ? projectParam : 'All Projects';

		// Update selectedProject
		selectedProject = newProject;

		// Only fetch if project actually changed (not on initial render - onMount handles that)
		if (previousProject !== null && previousProject !== newProject) {
			fetchData();
		}
		previousProject = newProject;
	});

	// Fetch agent data from unified API
	async function fetchData() {
		try {
			// Build URL with project filter, token usage, and activities
			let url = '/api/agents?full=true&usage=true&activities=true';
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
			unassignedTasks = data.unassigned_tasks || [];
			taskStats = data.task_stats || null;

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

	// Fetch sparkline data (system-wide, no agent filter)
	async function fetchSparklineData() {
		try {
			const response = await fetch('/api/agents/sparkline?range=24h');
			const result = await response.json();

			if (result.error) {
				console.error('Sparkline API error:', result.error);
				return;
			}

			// Update sparkline data
			sparklineData = result.data || [];
		} catch (error) {
			console.error('Failed to fetch sparkline data:', error);
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

	// Handle spawn for task from TaskQueue
	async function handleSpawnForTask(taskId: string) {
		const session = await spawn(taskId);
		if (session) {
			// Refetch data to show updated task status
			await fetchData();
		}
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

	// Auto-refresh data every 15 seconds (layout also polls at 30s, so total coverage is good)
	$effect(() => {
		const interval = setInterval(fetchData, 15000);
		return () => clearInterval(interval);
	});

	// Auto-refresh sparkline every 30 seconds
	$effect(() => {
		const interval = setInterval(fetchSparklineData, 30000);
		return () => clearInterval(interval);
	});

	// Track previous drawer state to detect close transition
	let wasDrawerOpen = false;

	// Refetch data when drawer closes (to update any changes made in drawer)
	$effect(() => {
		// Only fetch if drawer was open and is now closed (actual close transition)
		if (wasDrawerOpen && !drawerOpen) {
			fetchData();
		}
		// Update tracking for next comparison
		wasDrawerOpen = drawerOpen;
	});

	onMount(() => {
		fetchData();
		fetchSparklineData();
	});
</script>

<div class="min-h-screen bg-base-200">
	<!-- Main Content: Sidebar + Agent Grid -->
	<div class="flex h-[calc(100vh-theme(spacing.20))]">
		<!-- Left Sidebar: Task Queue -->
		<div class="w-100 border-r border-base-300 bg-base-100 flex flex-col">
			{#if isInitialLoad}
				<!-- Loading State for Task Queue -->
				<div class="flex-1 flex items-center justify-center">
					<div class="text-center">
						<span class="loading loading-bars loading-lg mb-4"></span>
						<p class="text-sm text-base-content/60">Loading tasks...</p>
					</div>
				</div>
			{:else}
				<TaskQueue
					tasks={unassignedTasks}
					{agents}
					{reservations}
					{selectedProject}
					ontaskclick={handleTaskClick}
					onspawnfortask={handleSpawnForTask}
				/>
			{/if}
		</div>

		<!-- Right Panel: Agent Grid -->
		<div class="flex-1 overflow-auto flex flex-col">
			{#if isInitialLoad}
				<!-- Loading State for Agent Grid -->
				<div class="flex-1 flex items-center justify-center">
					<div class="text-center">
						<span class="loading loading-bars loading-xl mb-4"></span>
						<p class="text-sm text-base-content/60">Loading agents...</p>
					</div>
				</div>
			{:else}
				<div class="flex-1 overflow-auto">
					<AgentGrid {agents} {tasks} {allTasks} {reservations} {sparklineData} onTaskAssign={handleTaskAssign} ontaskclick={handleTaskClick} {highlightedAgent} />
				</div>
			{/if}
		</div>
	</div>

	<!-- Task Detail Drawer -->
	<TaskDetailDrawer
		bind:taskId={selectedTaskId}
		bind:isOpen={drawerOpen}
		ondelete={fetchData}
	/>
</div>
