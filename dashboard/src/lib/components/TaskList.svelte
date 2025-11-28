<script>
	/**
	 * TaskList Component
	 * Displays Beads tasks with filtering using Svelte 5 $derived runes
	 */

	import TaskDetailDrawer from './TaskDetailDrawer.svelte';
	import TaskIdBadge from './TaskIdBadge.svelte';

	// Props
	let {
		selectedProject = $bindable('all'),
		selectedPriority = $bindable('all'),
		selectedStatus = $bindable('all'),
		searchQuery = $bindable('')
	} = $props();

	// State
	let tasks = $state([]);
	let projects = $state([]);
	let loading = $state(true);
	let error = $state(null);
	let lastUpdated = $state(null);

	// Drawer state (replacing modal)
	let selectedTaskId = $state(null);
	let drawerOpen = $state(false);

	// Priority badge classes - using DaisyUI semantic colors
	const priorityClasses = {
		0: 'badge-error',  // P0 = Critical = Red
		1: 'badge-warning', // P1 = High = Orange/Yellow
		2: 'badge-info',    // P2 = Medium = Blue
		3: 'badge-success', // P3 = Low = Green
		4: 'badge-ghost'    // P4 = Lowest = Gray
	};

	const priorityLabels = {
		0: 'P0',
		1: 'P1',
		2: 'P2',
		3: 'P3',
		4: 'P4'
	};

	// Reactive filtered tasks using $derived
	const filteredTasks = $derived(
		tasks.filter((task) => {
			if (selectedProject !== 'all' && task.project !== selectedProject) return false;
			if (selectedPriority !== 'all' && task.priority !== parseInt(selectedPriority)) return false;
			if (selectedStatus !== 'all' && task.status !== selectedStatus) return false;

			// Search filter: match against title or description
			if (searchQuery && searchQuery.trim()) {
				const query = searchQuery.toLowerCase();
				const matchTitle = task.title.toLowerCase().includes(query);
				const matchDesc = task.description?.toLowerCase().includes(query);
				if (!matchTitle && !matchDesc) return false;
			}

			return true;
		})
	);

	// Fetch tasks
	async function fetchTasks(silent = false) {
		if (!silent) loading = true;
		error = null;
		try {
			const response = await fetch('/api/tasks');
			if (!response.ok) throw new Error('Failed to fetch tasks');
			const data = await response.json();
			tasks = data.tasks;
			projects = data.projects;
			lastUpdated = new Date();
		} catch (err) {
			error = err.message;
		} finally {
			if (!silent) loading = false;
		}
	}

	// Handle task click - open drawer (drawer fetches data itself)
	function handleTaskClick(taskId) {
		selectedTaskId = taskId;
		drawerOpen = true;
	}

	// Handle keyboard events for accessibility
	function handleKeyDown(event, taskId) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleTaskClick(taskId);
		}
	}

	// Load tasks on mount and set up auto-refresh
	$effect(() => {
		// Initial load
		fetchTasks();

		// Set up polling for real-time updates (every 15 seconds)
		const interval = setInterval(() => {
			fetchTasks(true); // Silent refresh (no loading indicator)
		}, 15000);

		// Cleanup: clear interval when component unmounts
		return () => {
			clearInterval(interval);
		};
	});
</script>

<div class="w-full max-w-7xl mx-auto p-4">
	{#if loading}
		<div class="flex justify-center items-center p-8">
			<span class="loading loading-spinner loading-lg"></span>
		</div>
	{:else if error}
		<div class="alert alert-error">
			<span>Error: {error}</span>
		</div>
	{:else}
		<div class="flex items-center gap-2 mb-4 text-sm text-base-content/70">
			<span>{filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}</span>
			{#if lastUpdated}
				<span class="opacity-60">
					• Updated {lastUpdated.toLocaleTimeString()}
				</span>
			{/if}
		</div>

		<div class="flex flex-col gap-3">
			{#each filteredTasks as task (task.id)}
				{@const priorityClass = priorityClasses[task.priority] || priorityClasses[2]}
				{@const priorityLabel = priorityLabels[task.priority] || 'P2'}

				<div
					class="card bg-base-100 border border-base-300 hover:shadow-lg transition-shadow cursor-pointer"
					onclick={() => handleTaskClick(task.id)}
					onkeydown={(e) => handleKeyDown(e, task.id)}
					role="button"
					tabindex="0"
				>
					<div class="card-body p-4">
						<div class="flex items-center gap-2 mb-2 flex-wrap">
							<TaskIdBadge {task} size="xs" showStatus={false} showType={false} copyOnly />
							<span class="badge {priorityClass} badge-sm">
								{priorityLabel}
							</span>
							<span class="badge {task.status === 'open' ? 'badge-primary' : 'badge-success'} badge-sm ml-auto">
								{task.status}
							</span>
						</div>

						<h3 class="card-title text-base">{task.title}</h3>

						{#if task.description}
							<p class="text-sm text-base-content/70 line-clamp-2">
								{task.description}
							</p>
						{/if}

						<div class="flex items-center gap-2 mt-2 flex-wrap">
							<span class="badge badge-outline badge-sm">
								{task.project}
							</span>
							{#if task.labels && task.labels.length > 0}
								{#each task.labels.slice(0, 3) as label}
									<span class="badge badge-ghost badge-sm">{label}</span>
								{/each}
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<TaskDetailDrawer bind:taskId={selectedTaskId} bind:isOpen={drawerOpen} />
</div>

