<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import DependencyGraph from '$lib/components/DependencyGraph.svelte';
	import TaskDetailDrawer from '$lib/components/TaskDetailDrawer.svelte';
	import { GraphSkeleton } from '$lib/components/skeleton';
	import ProjectSelector from '$lib/components/ProjectSelector.svelte';
	import { getProjectsFromTasks, getTaskCountByProject } from '$lib/utils/projectUtils';

	// Task type compatible with DependencyGraph component
	interface Task {
		id: string;
		title?: string;
		description?: string;
		status?: string;
		priority?: number;
		project?: string;
		assignee?: string;
		depends_on?: Array<{ id?: string; depends_on_id?: string; type?: string }>;
		labels?: string[];
	}

	// Task data
	let tasks = $state<Task[]>([]);
	let allTasks = $state<Task[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let selectedTaskId = $state<string | null>(null);
	let drawerOpen = $state(false);

	// Filters
	let selectedPriority = $state('all');
	let selectedStatus = $state('open');
	let searchQuery = $state('');

	// Read project filter from URL (managed by root layout)
	let selectedProject = $state('All Projects');

	// Sync selectedProject from URL params
	$effect(() => {
		const projectParam = $page.url.searchParams.get('project');
		selectedProject = projectParam || 'All Projects';
	});

	// Derive projects list from all tasks
	const projects = $derived(getProjectsFromTasks(allTasks));

	// Derive task counts per project for display in dropdown
	const taskCounts = $derived(getTaskCountByProject(allTasks, selectedStatus));

	// Filter tasks by project (fixed: $derived without function wrapper)
	const filteredTasks = $derived(
		!selectedProject || selectedProject === 'All Projects'
			? allTasks
			: allTasks.filter((task) => task.id.startsWith(selectedProject + '-'))
	);

	// Handle project selection change - update URL
	function handleProjectChange(project: string) {
		selectedProject = project;
		const url = new URL(window.location.href);
		if (project === 'All Projects') {
			url.searchParams.delete('project');
		} else {
			url.searchParams.set('project', project);
		}
		goto(url.toString(), { replaceState: true, noScroll: true, keepFocus: true });
	}

	// Fetch tasks
	async function fetchTasks() {
		try {
			loading = true;
			error = null;

			const params = new URLSearchParams();
			if (selectedStatus !== 'all') params.append('status', selectedStatus);
			if (selectedPriority !== 'all') params.append('priority', selectedPriority);

			const response = await fetch(`/api/tasks?${params}`);
			if (!response.ok) throw new Error('Failed to fetch tasks');

			const data = await response.json();
			allTasks = data.tasks || [];
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : 'Unknown error';
			console.error('Failed to fetch tasks:', err);
		} finally {
			loading = false;
		}
	}

	// Handle node click in graph
	function handleNodeClick(taskId: string) {
		selectedTaskId = taskId;
		drawerOpen = true;
	}

	// Refetch tasks when filters change
	$effect(() => {
		fetchTasks();
	});

	// Update displayed tasks when project filter or allTasks change
	$effect(() => {
		tasks = filteredTasks;
	});

	onMount(() => {
		fetchTasks();
	});
</script>

<svelte:head>
	<title>Graph | JAT Dashboard</title>
</svelte:head>

<div class="min-h-screen bg-base-200">
	<!-- Filters Bar -->
	<div class="bg-base-100 border-b border-base-300 p-4">
		<div class="flex flex-wrap items-center gap-4">
			<!-- Project Filter -->
			<div class="flex flex-col">
				<label class="industrial-label" for="project-filter">Project</label>
				<div class="w-40" id="project-filter">
					<ProjectSelector
						{projects}
						{selectedProject}
						onProjectChange={handleProjectChange}
						{taskCounts}
						compact={true}
					/>
				</div>
			</div>

			<!-- Filters -->
			<div class="flex flex-col">
				<label class="industrial-label" for="priority-filter">Priority</label>
				<select
					id="priority-filter"
					class="industrial-select"
					bind:value={selectedPriority}
				>
					<option value="all">All Priorities</option>
					<option value="0">P0 (Critical)</option>
					<option value="1">P1 (High)</option>
					<option value="2">P2 (Medium)</option>
					<option value="3">P3 (Low)</option>
				</select>
			</div>

			<div class="flex flex-col">
				<label class="industrial-label" for="status-filter">Status</label>
				<select
					id="status-filter"
					class="industrial-select"
					bind:value={selectedStatus}
				>
					<option value="all">All Statuses</option>
					<option value="open">Open</option>
					<option value="in_progress">In Progress</option>
					<option value="blocked">Blocked</option>
					<option value="closed">Closed</option>
				</select>
			</div>

			<div class="flex flex-col">
				<label class="industrial-label" for="search-filter">Search</label>
				<input
					id="search-filter"
					type="text"
					placeholder="Search tasks..."
					class="industrial-input"
					bind:value={searchQuery}
				/>
			</div>
		</div>
	</div>

	<!-- Loading State -->
	{#if loading}
		<GraphSkeleton nodes={8} />

	<!-- Error State -->
	{:else if error}
		<div class="alert alert-error m-4">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="stroke-current shrink-0 h-6 w-6"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span>Error: {error}</span>
		</div>

	<!-- Main Content: Dependency Graph -->
	{:else}
		<div class="p-4">
			<DependencyGraph {tasks} onNodeClick={handleNodeClick} />
		</div>
	{/if}

	<!-- Task Detail Modal -->
	<TaskDetailDrawer bind:taskId={selectedTaskId} bind:isOpen={drawerOpen} />
</div>
