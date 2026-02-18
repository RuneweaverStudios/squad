<script lang="ts">
	/**
	 * T1 - Kanban Board View
	 *
	 * Drag-and-drop task board with columns by status.
	 * Visual task management with priority colors and quick actions.
	 */

	import { onMount } from 'svelte';
	import TaskIdBadge from '$lib/components/TaskIdBadge.svelte';

	interface Task {
		id: string;
		title: string;
		description?: string;
		status: string;
		priority: number;
		issue_type?: string;
		assignee?: string;
		labels?: string[];
		created_at?: string;
		updated_at?: string;
	}

	// State
	let tasks = $state<Task[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let draggedTask = $state<Task | null>(null);
	let dragOverColumn = $state<string | null>(null);

	// Columns configuration
	const columns = [
		{ id: 'open', label: 'Open', color: 'oklch(0.70 0.15 220)' },
		{ id: 'in_progress', label: 'In Progress', color: 'oklch(0.75 0.15 85)' },
		{ id: 'blocked', label: 'Blocked', color: 'oklch(0.65 0.20 25)' },
		{ id: 'closed', label: 'Closed', color: 'oklch(0.70 0.15 145)' }
	];

	// Priority colors
	const priorityColors: Record<number, string> = {
		0: 'oklch(0.65 0.20 25)',   // P0 - Red/Critical
		1: 'oklch(0.75 0.15 85)',   // P1 - Amber/High
		2: 'oklch(0.70 0.15 220)',  // P2 - Blue/Medium
		3: 'oklch(0.60 0.05 250)',  // P3 - Gray/Low
		4: 'oklch(0.50 0.03 250)'   // P4 - Dim/Lowest
	};

	// Group tasks by status
	const tasksByStatus = $derived(() => {
		const grouped: Record<string, Task[]> = {};
		for (const col of columns) {
			grouped[col.id] = tasks
				.filter(t => t.status === col.id)
				.sort((a, b) => a.priority - b.priority);
		}
		return grouped;
	});

	// Fetch tasks
	async function fetchTasks() {
		try {
			const response = await fetch('/api/tasks');
			if (!response.ok) throw new Error('Failed to fetch tasks');
			const data = await response.json();
			tasks = data.tasks || [];
			error = null;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	// Update task status
	async function updateTaskStatus(taskId: string, newStatus: string) {
		try {
			const response = await fetch(`/api/tasks/${taskId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: newStatus })
			});
			if (!response.ok) throw new Error('Failed to update task');
			await fetchTasks();
		} catch (err) {
			console.error('Failed to update task:', err);
		}
	}

	// Drag handlers
	function handleDragStart(task: Task) {
		draggedTask = task;
	}

	function handleDragOver(e: DragEvent, columnId: string) {
		e.preventDefault();
		dragOverColumn = columnId;
	}

	function handleDragLeave() {
		dragOverColumn = null;
	}

	function handleDrop(columnId: string) {
		if (draggedTask && draggedTask.status !== columnId) {
			updateTaskStatus(draggedTask.id, columnId);
		}
		draggedTask = null;
		dragOverColumn = null;
	}

	function handleDragEnd() {
		draggedTask = null;
		dragOverColumn = null;
	}

	onMount(() => {
		fetchTasks();
	});
</script>

<svelte:head>
	<title>T1 Kanban | SQUAD IDE</title>
</svelte:head>

<div class="kanban-page">
	<header class="kanban-header">
		<h1>
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="header-icon">
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
			</svg>
			Kanban Board
		</h1>
		<span class="task-count">{tasks.length} tasks</span>
	</header>

	{#if loading}
		<div class="loading">
			<div class="spinner"></div>
			<span>Loading tasks...</span>
		</div>
	{:else if error}
		<div class="error">
			<span>{error}</span>
			<button onclick={() => fetchTasks()}>Retry</button>
		</div>
	{:else}
		<div class="kanban-board">
			{#each columns as column}
				{@const columnTasks = tasksByStatus()[column.id] || []}
				<div
					class="kanban-column"
					class:drag-over={dragOverColumn === column.id}
					ondragover={(e) => handleDragOver(e, column.id)}
					ondragleave={handleDragLeave}
					ondrop={() => handleDrop(column.id)}
					role="list"
				>
					<div class="column-header" style="border-color: {column.color}">
						<span class="column-title">{column.label}</span>
						<span class="column-count" style="background: {column.color}">{columnTasks.length}</span>
					</div>

					<div class="column-cards">
						{#each columnTasks as task (task.id)}
							<div
								class="task-card"
								class:dragging={draggedTask?.id === task.id}
								draggable="true"
								ondragstart={() => handleDragStart(task)}
								ondragend={handleDragEnd}
								role="listitem"
							>
								<div class="card-header">
									<TaskIdBadge
										{task}
										size="xs"
										showStatus={false}
										copyOnly
									/>
									<span
										class="priority-dot"
										style="background: {priorityColors[task.priority] || priorityColors[2]}"
										title="P{task.priority}"
									></span>
								</div>
								<h3 class="card-title">{task.title}</h3>
								{#if task.assignee}
									<div class="card-assignee">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="assignee-icon">
											<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
										</svg>
										<span>{task.assignee}</span>
									</div>
								{/if}
								{#if task.labels && task.labels.length > 0}
									<div class="card-labels">
										{#each task.labels.slice(0, 3) as label}
											<span class="label">{label}</span>
										{/each}
									</div>
								{/if}
							</div>
						{/each}

						{#if columnTasks.length === 0}
							<div class="empty-column">
								<span>No tasks</span>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.kanban-page {
		min-height: 100vh;
		background: oklch(0.14 0.01 250);
		padding: 1.5rem;
	}

	.kanban-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.kanban-header h1 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.5rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
	}

	.header-icon {
		width: 1.5rem;
		height: 1.5rem;
		color: oklch(0.70 0.15 200);
	}

	.task-count {
		font-size: 0.875rem;
		color: oklch(0.60 0.02 250);
		padding: 0.25rem 0.75rem;
		background: oklch(0.20 0.01 250);
		border-radius: 9999px;
	}

	.loading, .error {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 4rem;
		color: oklch(0.65 0.02 250);
	}

	.spinner {
		width: 2rem;
		height: 2rem;
		border: 2px solid oklch(0.30 0.02 250);
		border-top-color: oklch(0.70 0.15 200);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.error button {
		padding: 0.5rem 1rem;
		background: oklch(0.25 0.02 250);
		border: 1px solid oklch(0.35 0.02 250);
		border-radius: 0.375rem;
		color: oklch(0.80 0.02 250);
		cursor: pointer;
	}

	.kanban-board {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1rem;
		min-height: calc(100vh - 8rem);
	}

	.kanban-column {
		background: oklch(0.18 0.01 250);
		border-radius: 0.75rem;
		border: 1px solid oklch(0.25 0.02 250);
		display: flex;
		flex-direction: column;
		transition: border-color 0.15s, background 0.15s;
	}

	.kanban-column.drag-over {
		border-color: oklch(0.70 0.15 200);
		background: oklch(0.20 0.02 250);
	}

	.column-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem 1rem;
		border-bottom: 2px solid;
		border-top-left-radius: 0.75rem;
		border-top-right-radius: 0.75rem;
	}

	.column-title {
		font-weight: 600;
		font-size: 0.875rem;
		color: oklch(0.85 0.02 250);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.column-count {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		color: oklch(0.15 0.01 250);
	}

	.column-cards {
		flex: 1;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		overflow-y: auto;
	}

	.task-card {
		background: oklch(0.22 0.01 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.5rem;
		padding: 0.75rem;
		cursor: grab;
		transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
	}

	.task-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px oklch(0 0 0 / 0.3);
		border-color: oklch(0.35 0.02 250);
	}

	.task-card.dragging {
		opacity: 0.5;
		cursor: grabbing;
	}

	.card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}

	.priority-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
	}

	.card-title {
		font-size: 0.8125rem;
		font-weight: 500;
		color: oklch(0.88 0.02 250);
		margin: 0 0 0.5rem 0;
		line-height: 1.4;
	}

	.card-assignee {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		color: oklch(0.60 0.02 250);
		margin-bottom: 0.5rem;
	}

	.assignee-icon {
		width: 0.875rem;
		height: 0.875rem;
	}

	.card-labels {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.label {
		font-size: 0.625rem;
		padding: 0.125rem 0.375rem;
		background: oklch(0.30 0.02 250);
		border-radius: 0.25rem;
		color: oklch(0.70 0.02 250);
	}

	.empty-column {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: oklch(0.45 0.02 250);
		font-size: 0.8125rem;
		font-style: italic;
	}

	@media (max-width: 1024px) {
		.kanban-board {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 640px) {
		.kanban-board {
			grid-template-columns: 1fr;
		}
	}
</style>
