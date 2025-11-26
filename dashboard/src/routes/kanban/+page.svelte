<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import KanbanBoard from '$lib/components/graph/KanbanBoard.svelte';
	import TaskDetailDrawer from '$lib/components/TaskDetailDrawer.svelte';

	// Task type
	interface Task {
		id: string;
		title: string;
		description?: string;
		status: string;
		priority: number;
		assignee?: string;
		depends_on?: string[];
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
	let selectedPriorities = $state(new Set(['0', '1', '2', '3'])); // All priorities by default
	let searchQuery = $state('');

	// Read project filter from URL (managed by root layout)
	let selectedProject = $state('All Projects');

	// Sync selectedProject from URL params
	$effect(() => {
		const projectParam = $page.url.searchParams.get('project');
		selectedProject = projectParam || 'All Projects';
	});

	// Toggle priority selection
	function togglePriority(priority: string) {
		if (selectedPriorities.has(priority)) {
			selectedPriorities.delete(priority);
		} else {
			selectedPriorities.add(priority);
		}
		selectedPriorities = new Set(selectedPriorities); // Trigger reactivity
	}

	// Filter tasks by project and priority
	const filteredTasks = $derived(() => {
		let result = allTasks;

		// Filter by project prefix (e.g., "jat-abc" matches "jat")
		if (selectedProject && selectedProject !== 'All Projects') {
			result = result.filter((task) => task.id.startsWith(selectedProject + '-'));
		}

		// Filter by priority (OR logic: task priority must be in selected set)
		if (selectedPriorities.size > 0 && selectedPriorities.size < 4) {
			result = result.filter((task) => selectedPriorities.has(String(task.priority)));
		}

		// Filter by search
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			result = result.filter(
				(task) =>
					task.title?.toLowerCase().includes(query) ||
					task.description?.toLowerCase().includes(query)
			);
		}

		return result;
	});

	// Fetch tasks
	async function fetchTasks() {
		try {
			loading = true;
			error = null;

			const response = await fetch(`/api/tasks`);
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

	// Handle card click in kanban board
	function handleTaskClick(taskId: string) {
		selectedTaskId = taskId;
		drawerOpen = true;
	}

	// Refetch tasks when filters change
	$effect(() => {
		fetchTasks();
	});

	// Update displayed tasks when project filter or allTasks change
	$effect(() => {
		tasks = filteredTasks();
	});

	onMount(() => {
		fetchTasks();
	});
</script>

<div class="flex flex-col h-full bg-base-200">
	<!-- Filters Bar -->
	<div class="bg-base-100 border-b border-base-300 p-4 flex-none">
		<div class="flex flex-wrap items-center gap-4">
			<!-- Priority Filter (Toggle Badges) -->
			<div class="form-control">
				<label class="label py-1">
					<span class="label-text text-sm">Priority ({selectedPriorities.size} selected)</span>
				</label>
				<div class="flex flex-wrap gap-1.5 p-2 bg-base-200 rounded-lg">
					{#each ['0', '1', '2', '3'] as priority}
						<button
							class="badge badge-sm transition-all duration-200 cursor-pointer {selectedPriorities.has(priority) ? 'badge-primary shadow-md' : 'badge-ghost hover:badge-primary/20 hover:shadow-sm hover:scale-105'}"
							onclick={() => togglePriority(priority)}
						>
							P{priority}
							<span class="ml-1 opacity-70">
								({allTasks.filter((task) => String(task.priority) === priority).length})
							</span>
						</button>
					{/each}
				</div>
			</div>

			<!-- Search -->
			<div class="form-control">
				<label class="label py-1" for="search-filter">
					<span class="label-text text-sm">Search</span>
				</label>
				<input
					id="search-filter"
					type="text"
					placeholder="Search tasks..."
					class="input input-bordered input-sm"
					bind:value={searchQuery}
				/>
			</div>
		</div>
	</div>

	<!-- Loading State -->
	{#if loading}
		<div class="flex items-center justify-center h-96">
			<div class="loading loading-spinner loading-lg text-primary"></div>
		</div>

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

	<!-- Main Content: Kanban Board -->
	{:else}
		<div class="flex-1 flex flex-col overflow-hidden">
			<KanbanBoard tasks={filteredTasks()} onTaskClick={handleTaskClick} />
		</div>
	{/if}

	<!-- Task Detail Modal -->
	<TaskDetailDrawer bind:taskId={selectedTaskId} bind:isOpen={drawerOpen} />
</div>
