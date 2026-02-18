<script lang="ts">
	/**
	 * T2 - Priority Matrix View
	 *
	 * Eisenhower-style 2x2 matrix for task prioritization.
	 * Urgent/Important quadrants help focus on what matters.
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
	}

	let tasks = $state<Task[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let selectedTask = $state<Task | null>(null);

	// Quadrant definitions
	const quadrants = [
		{
			id: 'urgent-important',
			title: 'Do First',
			subtitle: 'Urgent & Important',
			color: 'oklch(0.65 0.20 25)',
			icon: '🔥',
			filter: (t: Task) => t.priority <= 1 && ['bug', 'feature'].includes(t.issue_type || '')
		},
		{
			id: 'not-urgent-important',
			title: 'Schedule',
			subtitle: 'Important, Not Urgent',
			color: 'oklch(0.70 0.15 200)',
			icon: '📅',
			filter: (t: Task) => t.priority >= 2 && ['bug', 'feature'].includes(t.issue_type || '')
		},
		{
			id: 'urgent-not-important',
			title: 'Delegate',
			subtitle: 'Urgent, Less Important',
			color: 'oklch(0.75 0.15 85)',
			icon: '👥',
			filter: (t: Task) => t.priority <= 1 && !['bug', 'feature'].includes(t.issue_type || '')
		},
		{
			id: 'not-urgent-not-important',
			title: 'Eliminate',
			subtitle: 'Neither Urgent nor Important',
			color: 'oklch(0.50 0.03 250)',
			icon: '🗑️',
			filter: (t: Task) => t.priority >= 2 && !['bug', 'feature'].includes(t.issue_type || '')
		}
	];

	// Filter to only open tasks
	const openTasks = $derived(tasks.filter(t => t.status !== 'closed'));

	// Get tasks for each quadrant
	function getQuadrantTasks(filter: (t: Task) => boolean): Task[] {
		return openTasks.filter(filter).sort((a, b) => a.priority - b.priority);
	}

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

	onMount(() => {
		fetchTasks();
	});
</script>

<svelte:head>
	<title>T2 Priority Matrix | SQUAD IDE</title>
</svelte:head>

<div class="matrix-page">
	<header class="matrix-header">
		<h1>
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="header-icon">
				<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
			</svg>
			Priority Matrix
		</h1>
		<div class="legend">
			<span class="legend-item">
				<span class="dot urgent"></span>
				P0-P1 = Urgent
			</span>
			<span class="legend-item">
				<span class="dot important"></span>
				Bug/Feature = Important
			</span>
		</div>
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
		<div class="matrix-grid">
			<!-- Axis labels -->
			<div class="axis-y">
				<span class="axis-label high">IMPORTANT</span>
				<span class="axis-label low">LESS IMPORTANT</span>
			</div>
			<div class="axis-x">
				<span class="axis-label high">URGENT</span>
				<span class="axis-label low">NOT URGENT</span>
			</div>

			<!-- Quadrants -->
			{#each quadrants as quadrant, i}
				{@const quadrantTasks = getQuadrantTasks(quadrant.filter)}
				<div
					class="quadrant quadrant-{i + 1}"
					style="--quadrant-color: {quadrant.color}"
				>
					<div class="quadrant-header">
						<span class="quadrant-icon">{quadrant.icon}</span>
						<div class="quadrant-titles">
							<h2>{quadrant.title}</h2>
							<span class="quadrant-subtitle">{quadrant.subtitle}</span>
						</div>
						<span class="quadrant-count">{quadrantTasks.length}</span>
					</div>

					<div class="quadrant-tasks">
						{#each quadrantTasks as task (task.id)}
							<button
								class="task-item"
								class:selected={selectedTask?.id === task.id}
								onclick={() => selectedTask = selectedTask?.id === task.id ? null : task}
							>
								<TaskIdBadge
									{task}
									size="xs"
									showStatus={false}
									copyOnly
								/>
								<span class="task-title">{task.title}</span>
							</button>
						{/each}

						{#if quadrantTasks.length === 0}
							<div class="empty-quadrant">
								<span>No tasks</span>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		<!-- Task detail panel -->
		{#if selectedTask}
			<div class="task-detail">
				<div class="detail-header">
					<TaskIdBadge
						task={selectedTask}
						size="sm"
						copyOnly
					/>
					<button class="close-btn" onclick={() => selectedTask = null}>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
				<h3>{selectedTask.title}</h3>
				{#if selectedTask.description}
					<p class="detail-description">{selectedTask.description}</p>
				{/if}
				{#if selectedTask.assignee}
					<div class="detail-assignee">
						<strong>Assignee:</strong> {selectedTask.assignee}
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	.matrix-page {
		min-height: 100vh;
		background: oklch(0.14 0.01 250);
		padding: 1.5rem;
	}

	.matrix-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.5rem;
	}

	.matrix-header h1 {
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
		color: oklch(0.70 0.15 280);
	}

	.legend {
		display: flex;
		gap: 1.5rem;
		font-size: 0.75rem;
		color: oklch(0.60 0.02 250);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
	}

	.dot.urgent {
		background: oklch(0.65 0.20 25);
	}

	.dot.important {
		background: oklch(0.70 0.15 200);
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
		border-top-color: oklch(0.70 0.15 280);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.matrix-grid {
		display: grid;
		grid-template-columns: 2.5rem 1fr 1fr;
		grid-template-rows: auto 1fr 1fr;
		gap: 0.75rem;
		height: calc(100vh - 10rem);
		position: relative;
	}

	.axis-y {
		grid-column: 1;
		grid-row: 2 / 4;
		display: flex;
		flex-direction: column;
		justify-content: space-around;
		writing-mode: vertical-rl;
		transform: rotate(180deg);
	}

	.axis-x {
		grid-column: 2 / 4;
		grid-row: 1;
		display: flex;
		justify-content: space-around;
	}

	.axis-label {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: oklch(0.50 0.02 250);
	}

	.axis-label.high {
		color: oklch(0.70 0.10 200);
	}

	.quadrant {
		background: oklch(0.18 0.01 250);
		border-radius: 0.75rem;
		border: 1px solid oklch(0.25 0.02 250);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.quadrant-1 { grid-column: 2; grid-row: 2; }
	.quadrant-2 { grid-column: 3; grid-row: 2; }
	.quadrant-3 { grid-column: 2; grid-row: 3; }
	.quadrant-4 { grid-column: 3; grid-row: 3; }

	.quadrant-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border-bottom: 2px solid var(--quadrant-color);
		background: color-mix(in oklch, var(--quadrant-color) 10%, transparent);
	}

	.quadrant-icon {
		font-size: 1.25rem;
	}

	.quadrant-titles {
		flex: 1;
	}

	.quadrant-titles h2 {
		font-size: 0.875rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
	}

	.quadrant-subtitle {
		font-size: 0.6875rem;
		color: oklch(0.55 0.02 250);
	}

	.quadrant-count {
		font-size: 0.875rem;
		font-weight: 600;
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		background: var(--quadrant-color);
		color: oklch(0.15 0.01 250);
	}

	.quadrant-tasks {
		flex: 1;
		padding: 0.5rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.task-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		background: oklch(0.22 0.01 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.15s;
		text-align: left;
	}

	.task-item:hover {
		background: oklch(0.25 0.02 250);
		border-color: oklch(0.35 0.02 250);
	}

	.task-item.selected {
		border-color: var(--quadrant-color);
		background: color-mix(in oklch, var(--quadrant-color) 15%, oklch(0.22 0.01 250));
	}

	.task-title {
		flex: 1;
		font-size: 0.75rem;
		color: oklch(0.85 0.02 250);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.empty-quadrant {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: oklch(0.45 0.02 250);
		font-size: 0.75rem;
		font-style: italic;
	}

	.task-detail {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		width: 320px;
		background: oklch(0.20 0.01 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 0.75rem;
		padding: 1rem;
		box-shadow: 0 8px 32px oklch(0 0 0 / 0.4);
	}

	.detail-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 0.75rem;
	}

	.close-btn {
		padding: 0.25rem;
		background: transparent;
		border: none;
		color: oklch(0.60 0.02 250);
		cursor: pointer;
		border-radius: 0.25rem;
	}

	.close-btn:hover {
		background: oklch(0.30 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	.close-btn svg {
		width: 1rem;
		height: 1rem;
	}

	.task-detail h3 {
		font-size: 0.9375rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0 0 0.75rem 0;
		line-height: 1.4;
	}

	.detail-description {
		font-size: 0.8125rem;
		color: oklch(0.70 0.02 250);
		margin: 0 0 0.75rem 0;
		line-height: 1.5;
	}

	.detail-assignee {
		font-size: 0.75rem;
		color: oklch(0.60 0.02 250);
	}

	.detail-assignee strong {
		color: oklch(0.70 0.02 250);
	}
</style>
