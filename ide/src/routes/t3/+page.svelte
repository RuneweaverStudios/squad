<script lang="ts">
	/**
	 * T3 - Timeline View
	 *
	 * Horizontal timeline showing task activity over time.
	 * See when tasks were created, started, and completed.
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
		created_at?: string;
		updated_at?: string;
	}

	let tasks = $state<Task[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let timeRange = $state<'today' | 'week' | 'month'>('week');

	// Status colors
	const statusColors: Record<string, string> = {
		open: 'oklch(0.70 0.15 220)',
		in_progress: 'oklch(0.75 0.15 85)',
		blocked: 'oklch(0.65 0.20 25)',
		closed: 'oklch(0.70 0.15 145)'
	};

	// Get date range based on selection
	function getDateRange(): { start: Date; end: Date } {
		const end = new Date();
		const start = new Date();

		switch (timeRange) {
			case 'today':
				start.setHours(0, 0, 0, 0);
				break;
			case 'week':
				start.setDate(start.getDate() - 7);
				break;
			case 'month':
				start.setMonth(start.getMonth() - 1);
				break;
		}

		return { start, end };
	}

	// Group tasks by date
	const tasksByDate = $derived(() => {
		const { start, end } = getDateRange();
		const grouped: Record<string, Task[]> = {};

		// Create date buckets
		const current = new Date(start);
		while (current <= end) {
			const dateKey = current.toISOString().split('T')[0];
			grouped[dateKey] = [];
			current.setDate(current.getDate() + 1);
		}

		// Add tasks to buckets based on created_at
		for (const task of tasks) {
			if (!task.created_at) continue;
			const taskDate = new Date(task.created_at);
			if (taskDate >= start && taskDate <= end) {
				const dateKey = taskDate.toISOString().split('T')[0];
				if (grouped[dateKey]) {
					grouped[dateKey].push(task);
				}
			}
		}

		return grouped;
	});

	// Get sorted date keys
	const sortedDates = $derived(
		Object.keys(tasksByDate()).sort((a, b) => a.localeCompare(b))
	);

	// Format date for display
	function formatDate(dateStr: string): { day: string; weekday: string; month: string } {
		const date = new Date(dateStr + 'T00:00:00');
		return {
			day: date.getDate().toString(),
			weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
			month: date.toLocaleDateString('en-US', { month: 'short' })
		};
	}

	// Check if date is today
	function isToday(dateStr: string): boolean {
		const today = new Date().toISOString().split('T')[0];
		return dateStr === today;
	}

	// Stats
	const stats = $derived(() => {
		const allTasks = Object.values(tasksByDate()).flat();
		return {
			total: allTasks.length,
			open: allTasks.filter(t => t.status === 'open').length,
			in_progress: allTasks.filter(t => t.status === 'in_progress').length,
			closed: allTasks.filter(t => t.status === 'closed').length
		};
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

	onMount(() => {
		fetchTasks();
	});
</script>

<svelte:head>
	<title>T3 Timeline | SQUAD IDE</title>
</svelte:head>

<div class="timeline-page">
	<header class="timeline-header">
		<div class="header-left">
			<h1>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="header-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
				</svg>
				Timeline
			</h1>
		</div>

		<div class="header-controls">
			<div class="time-range-selector">
				<button
					class:active={timeRange === 'today'}
					onclick={() => timeRange = 'today'}
				>Today</button>
				<button
					class:active={timeRange === 'week'}
					onclick={() => timeRange = 'week'}
				>Week</button>
				<button
					class:active={timeRange === 'month'}
					onclick={() => timeRange = 'month'}
				>Month</button>
			</div>
		</div>
	</header>

	<!-- Stats bar -->
	<div class="stats-bar">
		<div class="stat">
			<span class="stat-value">{stats().total}</span>
			<span class="stat-label">Total</span>
		</div>
		<div class="stat">
			<span class="stat-value" style="color: {statusColors.open}">{stats().open}</span>
			<span class="stat-label">Open</span>
		</div>
		<div class="stat">
			<span class="stat-value" style="color: {statusColors.in_progress}">{stats().in_progress}</span>
			<span class="stat-label">In Progress</span>
		</div>
		<div class="stat">
			<span class="stat-value" style="color: {statusColors.closed}">{stats().closed}</span>
			<span class="stat-label">Closed</span>
		</div>
	</div>

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
		<div class="timeline-container">
			<div class="timeline">
				{#each sortedDates as dateStr (dateStr)}
					{@const dateTasks = tasksByDate()[dateStr] || []}
					{@const formatted = formatDate(dateStr)}
					{@const today = isToday(dateStr)}

					<div class="timeline-day" class:today>
						<div class="day-marker">
							<div class="day-date">
								<span class="day-weekday">{formatted.weekday}</span>
								<span class="day-number">{formatted.day}</span>
								<span class="day-month">{formatted.month}</span>
							</div>
							<div class="day-line"></div>
						</div>

						<div class="day-tasks">
							{#each dateTasks as task (task.id)}
								<div
									class="task-card"
									style="--status-color: {statusColors[task.status] || statusColors.open}"
								>
									<div class="card-status-bar"></div>
									<div class="card-content">
										<TaskIdBadge
											{task}
											size="xs"
											showStatus={false}
											copyOnly
										/>
										<h3 class="task-title">{task.title}</h3>
										{#if task.assignee}
											<span class="task-assignee">{task.assignee}</span>
										{/if}
									</div>
								</div>
							{/each}

							{#if dateTasks.length === 0}
								<div class="empty-day">
									<span>No activity</span>
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.timeline-page {
		min-height: 100vh;
		background: oklch(0.14 0.01 250);
		padding: 1.5rem;
	}

	.timeline-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	.header-left h1 {
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
		color: oklch(0.70 0.15 145);
	}

	.time-range-selector {
		display: flex;
		gap: 0.25rem;
		padding: 0.25rem;
		background: oklch(0.20 0.01 250);
		border-radius: 0.5rem;
	}

	.time-range-selector button {
		padding: 0.375rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: oklch(0.65 0.02 250);
		background: transparent;
		border: none;
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.time-range-selector button:hover {
		color: oklch(0.80 0.02 250);
	}

	.time-range-selector button.active {
		background: oklch(0.28 0.02 250);
		color: oklch(0.90 0.02 250);
	}

	.stats-bar {
		display: flex;
		gap: 2rem;
		padding: 1rem 1.5rem;
		background: oklch(0.18 0.01 250);
		border-radius: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: oklch(0.90 0.02 250);
	}

	.stat-label {
		font-size: 0.6875rem;
		color: oklch(0.55 0.02 250);
		text-transform: uppercase;
		letter-spacing: 0.05em;
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
		border-top-color: oklch(0.70 0.15 145);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.timeline-container {
		overflow-x: auto;
		padding-bottom: 1rem;
	}

	.timeline {
		display: flex;
		gap: 0;
		min-width: max-content;
	}

	.timeline-day {
		display: flex;
		flex-direction: column;
		min-width: 200px;
		border-right: 1px solid oklch(0.22 0.02 250);
	}

	.timeline-day:last-child {
		border-right: none;
	}

	.timeline-day.today .day-marker {
		background: oklch(0.70 0.15 145 / 0.1);
	}

	.timeline-day.today .day-number {
		color: oklch(0.70 0.15 145);
	}

	.day-marker {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.75rem 1rem;
		background: oklch(0.18 0.01 250);
		border-bottom: 1px solid oklch(0.25 0.02 250);
	}

	.day-date {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.day-weekday {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		color: oklch(0.50 0.02 250);
		letter-spacing: 0.05em;
	}

	.day-number {
		font-size: 1.5rem;
		font-weight: 700;
		color: oklch(0.85 0.02 250);
		line-height: 1.2;
	}

	.day-month {
		font-size: 0.6875rem;
		color: oklch(0.55 0.02 250);
	}

	.day-line {
		width: 2px;
		height: 0.5rem;
		background: oklch(0.30 0.02 250);
		border-radius: 1px;
	}

	.day-tasks {
		flex: 1;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-height: 300px;
	}

	.task-card {
		display: flex;
		background: oklch(0.22 0.01 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.5rem;
		overflow: hidden;
		transition: all 0.15s;
	}

	.task-card:hover {
		border-color: oklch(0.35 0.02 250);
		transform: translateY(-1px);
	}

	.card-status-bar {
		width: 4px;
		background: var(--status-color);
	}

	.card-content {
		flex: 1;
		padding: 0.625rem;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.task-title {
		font-size: 0.75rem;
		font-weight: 500;
		color: oklch(0.88 0.02 250);
		margin: 0;
		line-height: 1.4;
	}

	.task-assignee {
		font-size: 0.6875rem;
		color: oklch(0.55 0.02 250);
	}

	.empty-day {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: oklch(0.40 0.02 250);
		font-size: 0.75rem;
		font-style: italic;
	}
</style>
