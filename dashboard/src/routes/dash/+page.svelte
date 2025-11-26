<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { replaceState } from '$app/navigation';
	import TaskQueue from '$lib/components/agents/TaskQueue.svelte';
	import TaskTable from '$lib/components/agents/TaskTable.svelte';
	import AgentGrid from '$lib/components/agents/AgentGrid.svelte';
	import TaskDetailDrawer from '$lib/components/TaskDetailDrawer.svelte';
	import ClaudeUsageBar from '$lib/components/ClaudeUsageBar.svelte';
	import {
		getProjectsFromTasks,
		getTaskCountByProject,
		filterTasksByProjects
	} from '$lib/utils/projectUtils';
	import ProjectBadgeFilter from '$lib/components/ProjectBadgeFilter.svelte';

	let tasks = $state([]);
	let allTasks = $state([]);  // Unfiltered tasks for project list calculation
	let agents = $state([]);
	let reservations = $state([]);
	let unassignedTasks = $state([]);
	let taskStats = $state(null);
	let selectedProject = $state('All Projects');
	let selectedProjects = $state(new Set<string>()); // Multi-project filter for badge filter
	let sparklineData = $state([]);
	let isInitialLoad = $state(true);
	let viewMode = $state('cards'); // 'cards' or 'table'

	// Drawer state for TaskDetailDrawer
	let drawerOpen = $state(false);
	let selectedTaskId = $state(null);
	let drawerMode = $state('view');

	// Extract unique projects from ALL tasks (unfiltered)
	const projects = $derived(getProjectsFromTasks(allTasks));

	// Get task count per project from ALL tasks (only count 'open' tasks to match TaskQueue default)
	const taskCounts = $derived(getTaskCountByProject(allTasks, 'open'));

	// Filter tasks by selected projects (multi-select)
	const filteredTasks = $derived(filterTasksByProjects(tasks, selectedProjects));
	const filteredUnassignedTasks = $derived(filterTasksByProjects(unassignedTasks, selectedProjects));

	// Handle project badge filter change (multi-select)
	function handleProjectFilterChange(newProjects: Set<string>) {
		// Create a new Set to ensure reactivity
		selectedProjects = new Set(newProjects);
		// Update URL to reflect selected projects (comma-separated)
		const url = new URL(window.location.href);
		if (newProjects.size === 0) {
			url.searchParams.delete('projects');
		} else {
			url.searchParams.set('projects', Array.from(newProjects).join(','));
		}
		replaceState(url, {});
	}

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

	// Sync selectedProject from URL params (REACTIVE using $page store)
	$effect(() => {
		const projectParam = $page.url.searchParams.get('project');
		if (projectParam && projectParam !== 'All Projects') {
			selectedProject = projectParam;
		} else {
			selectedProject = 'All Projects';
		}
	});

	// NOTE: Removed URL sync effect - it was racing with handleProjectFilterChange
	// The state is managed directly by handleProjectFilterChange, URL is just for bookmarking
	// On page load, we sync from URL once in onMount instead

	// Refetch data whenever selectedProject changes (triggered by URL or dropdown)
	$effect(() => {
		// This effect depends on selectedProject, so it re-runs when it changes
		selectedProject; // Read selectedProject to create dependency
		fetchData();
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
	async function handleTaskAssign(taskId, agentName) {
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
	function handleTaskClick(taskId) {
		selectedTaskId = taskId;
		drawerMode = 'view';
		drawerOpen = true;
	}

	// Auto-refresh data every 5 seconds using Svelte reactivity
	$effect(() => {
		const interval = setInterval(fetchData, 5000);
		return () => clearInterval(interval);
	});

	// Auto-refresh sparkline every 30 seconds
	$effect(() => {
		const interval = setInterval(fetchSparklineData, 30000);
		return () => clearInterval(interval);
	});

	// Refetch data when drawer closes (to update any changes)
	$effect(() => {
		if (!drawerOpen && selectedTaskId) {
			// Drawer just closed, refresh data
			fetchData();
		}
	});

	onMount(() => {
		// Sync selectedProjects from URL on initial load
		const projectsParam = new URLSearchParams(window.location.search).get('projects');
		if (projectsParam) {
			selectedProjects = new Set(projectsParam.split(','));
		}

		fetchData();
		fetchSparklineData();
	});
</script>

<div class="min-h-screen bg-base-200 flex flex-col">
	<!-- Top Row: Projects (50%) | Claude Usage (50%) -->
	<div class="flex border-b border-base-300 bg-base-100">
		<!-- Projects Filter -->
		<div class="w-1/2 px-4 py-2 border-r border-base-300">
			<label class="text-xs font-semibold text-base-content/60 mb-1 block">
				Projects {selectedProjects.size > 0 ? `(${selectedProjects.size} selected)` : '(all)'}
			</label>
			<ProjectBadgeFilter
				{projects}
				{selectedProjects}
				{taskCounts}
				onFilterChange={handleProjectFilterChange}
			/>
		</div>
		<!-- Claude Usage -->
		<div class="w-1/2 px-4 py-2">
			<label class="text-xs font-semibold text-base-content/60 mb-1 block">
				Claude Usage
			</label>
			<ClaudeUsageBar mode="inline" agentsProp={agents} />
		</div>
	</div>

	<!-- Agent Grid -->
	<div class="border-b border-base-300 bg-base-100">
		{#if isInitialLoad}
			<!-- Loading State for Agent Grid -->
			<div class="flex items-center justify-center h-48">
				<div class="text-center">
					<span class="loading loading-bars loading-lg mb-4"></span>
					<p class="text-sm text-base-content/60">Loading agents...</p>
				</div>
			</div>
		{:else}
			<AgentGrid {agents} tasks={filteredTasks} {allTasks} {reservations} {sparklineData} onTaskAssign={handleTaskAssign} ontaskclick={handleTaskClick} />
		{/if}
	</div>

	<!-- Task Section with View Toggle -->
	<div class="flex-1 overflow-auto bg-base-100 flex flex-col">
		<!-- View Toggle Header -->
		<div class="flex items-center justify-between px-4 py-2 border-b border-base-300 bg-base-100">
			<h2 class="text-sm font-semibold text-base-content/70">Tasks</h2>
			<div class="join">
				<button
					class="join-item btn btn-sm {viewMode === 'cards' ? 'btn-primary' : 'btn-ghost'}"
					onclick={() => viewMode = 'cards'}
					title="Card View"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
					</svg>
					<span class="hidden sm:inline ml-1">Cards</span>
				</button>
				<button
					class="join-item btn btn-sm {viewMode === 'table' ? 'btn-primary' : 'btn-ghost'}"
					onclick={() => viewMode = 'table'}
					title="Table View"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 14.625c0-.621.504-1.125 1.125-1.125" />
					</svg>
					<span class="hidden sm:inline ml-1">Table</span>
				</button>
			</div>
		</div>

		<!-- Task Content -->
		<div class="flex-1 overflow-auto">
			{#if isInitialLoad}
				<!-- Loading State -->
				<div class="flex items-center justify-center h-48">
					<div class="text-center">
						<span class="loading loading-bars loading-lg mb-4"></span>
						<p class="text-sm text-base-content/60">Loading tasks...</p>
					</div>
				</div>
			{:else if viewMode === 'cards'}
				<TaskQueue
					tasks={filteredUnassignedTasks}
					{agents}
					{reservations}
					{selectedProject}
					ontaskclick={handleTaskClick}
				/>
			{:else}
				<TaskTable
					tasks={filteredUnassignedTasks}
					{allTasks}
					{agents}
					{reservations}
					ontaskclick={handleTaskClick}
				/>
			{/if}
		</div>
	</div>

	<!-- Task Detail Drawer -->
	<TaskDetailDrawer
		bind:taskId={selectedTaskId}
		bind:mode={drawerMode}
		bind:isOpen={drawerOpen}
	/>
</div>
