<script lang="ts">
	/**
	 * Task History Page
	 *
	 * Full page view of task completion history with:
	 * - Search by task title/ID
	 * - Filter by project
	 * - Streak calendar visualization (GitHub-style)
	 * - Daily breakdown with agent attribution
	 * - Clickable tasks for details
	 * - Streak statistics and milestones
	 */

	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import StreakCalendar from '$lib/components/StreakCalendar.svelte';
	import AnimatedDigits from '$lib/components/AnimatedDigits.svelte';
	import TaskDetailDrawer from '$lib/components/TaskDetailDrawer.svelte';
	import { HistorySkeleton } from '$lib/components/skeleton';
	import { getProjectColor, initProjectColors } from '$lib/utils/projectColors';

	interface CompletedTask {
		id: string;
		title: string;
		assignee?: string;
		updated_at: string;
		closed_at?: string;
		priority?: number;
		issue_type?: string;
		project?: string;
	}

	// State
	let tasks = $state<CompletedTask[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Filters
	let searchQuery = $state('');
	let selectedProject = $state('All Projects');

	// Task detail drawer
	let selectedTaskId = $state<string | null>(null);
	let drawerOpen = $state(false);

	// Sync selectedProject from URL params
	$effect(() => {
		const projectParam = $page.url.searchParams.get('project');
		selectedProject = projectParam || 'All Projects';
	});

	// Fetch completed tasks on mount
	onMount(() => {
		initProjectColors();
		fetchTasks();
	});

	async function fetchTasks() {
		loading = true;
		error = null;
		try {
			const response = await fetch('/api/tasks?status=closed');
			if (!response.ok) throw new Error('Failed to fetch tasks');
			const data = await response.json();
			tasks = data.tasks || [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	// Get unique projects from tasks
	const projects = $derived.by(() => {
		const projectSet = new Set<string>();
		for (const task of tasks) {
			const project = task.project || task.id.split('-')[0];
			if (project) projectSet.add(project);
		}
		return ['All Projects', ...Array.from(projectSet).sort()];
	});

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

	// Filtered tasks
	const filteredTasks = $derived.by(() => {
		return tasks.filter((task) => {
			// Project filter
			if (selectedProject !== 'All Projects') {
				const taskProject = task.project || task.id.split('-')[0];
				if (taskProject !== selectedProject) return false;
			}

			// Search filter
			if (searchQuery.trim()) {
				const query = searchQuery.toLowerCase();
				const matchesTitle = task.title.toLowerCase().includes(query);
				const matchesId = task.id.toLowerCase().includes(query);
				if (!matchesTitle && !matchesId) return false;
			}

			return true;
		});
	});

	// Calculate statistics
	const stats = $derived.by(() => {
		if (filteredTasks.length === 0)
			return {
				totalCompleted: 0,
				todayCount: 0,
				streak: 0,
				bestStreak: 0,
				avgPerDay: 0
			};

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		// Group by date
		const tasksByDate = new Map<string, CompletedTask[]>();

		for (const task of filteredTasks) {
			const dateStr = task.closed_at
				? new Date(task.closed_at).toISOString().split('T')[0]
				: new Date(task.updated_at).toISOString().split('T')[0];

			if (!tasksByDate.has(dateStr)) {
				tasksByDate.set(dateStr, []);
			}
			tasksByDate.get(dateStr)!.push(task);
		}

		// Today's count
		const todayStr = today.toISOString().split('T')[0];
		const todayCount = tasksByDate.get(todayStr)?.length || 0;

		// Calculate current streak
		let streak = 0;
		const checkDate = new Date(today);

		for (let i = 0; i < 365; i++) {
			const dateStr = checkDate.toISOString().split('T')[0];
			if (tasksByDate.has(dateStr)) {
				streak++;
			} else if (i > 0) {
				break;
			}
			checkDate.setDate(checkDate.getDate() - 1);
		}

		// Calculate best streak
		const sortedDates = Array.from(tasksByDate.keys()).sort();
		let bestStreak = 0;
		let currentStreak = 0;
		let prevDate: Date | null = null;

		for (const dateStr of sortedDates) {
			const date = new Date(dateStr);
			if (prevDate) {
				const diff = (date.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
				if (diff === 1) {
					currentStreak++;
				} else {
					currentStreak = 1;
				}
			} else {
				currentStreak = 1;
			}
			bestStreak = Math.max(bestStreak, currentStreak);
			prevDate = date;
		}

		// Average per day (last 30 days)
		const thirtyDaysAgo = new Date(today);
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
		let last30Count = 0;
		for (const [dateStr, dateTasks] of tasksByDate) {
			if (new Date(dateStr) >= thirtyDaysAgo) {
				last30Count += dateTasks.length;
			}
		}
		const avgPerDay = last30Count / 30;

		return {
			totalCompleted: filteredTasks.length,
			todayCount,
			streak,
			bestStreak,
			avgPerDay
		};
	});

	// Group tasks by day for the list view
	interface DayGroup {
		date: string;
		displayDate: string;
		tasks: CompletedTask[];
		agents: Map<string, number>;
	}

	const tasksByDay = $derived.by(() => {
		const groups = new Map<string, DayGroup>();

		for (const task of filteredTasks) {
			const dateStr = task.closed_at
				? new Date(task.closed_at).toISOString().split('T')[0]
				: new Date(task.updated_at).toISOString().split('T')[0];

			if (!groups.has(dateStr)) {
				const date = new Date(dateStr);
				groups.set(dateStr, {
					date: dateStr,
					displayDate: formatDisplayDate(date),
					tasks: [],
					agents: new Map()
				});
			}

			const group = groups.get(dateStr)!;
			group.tasks.push(task);
			if (task.assignee) {
				group.agents.set(task.assignee, (group.agents.get(task.assignee) || 0) + 1);
			}
		}

		// Sort by date descending and return all days (not limited to 30)
		return Array.from(groups.values()).sort((a, b) => b.date.localeCompare(a.date));
	});

	function formatDisplayDate(date: Date): string {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		const dateOnly = new Date(date);
		dateOnly.setHours(0, 0, 0, 0);

		if (dateOnly.getTime() === today.getTime()) return 'Today';
		if (dateOnly.getTime() === yesterday.getTime()) return 'Yesterday';

		return date.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
		});
	}

	function formatTime(dateStr: string): string {
		return new Date(dateStr).toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	// Priority CSS classes
	function getPriorityClass(priority: number | undefined): string {
		switch (priority) {
			case 0:
				return 'priority-p0'; // P0 - Critical
			case 1:
				return 'priority-p1'; // P1 - High
			case 2:
				return 'priority-p2'; // P2 - Medium
			default:
				return 'priority-default'; // P3+ - Low
		}
	}

	function handleTaskClick(taskId: string) {
		selectedTaskId = taskId;
		drawerOpen = true;
	}

	// Track which tasks are resuming
	let resumingTasks = $state<Set<string>>(new Set());

	async function handleResumeSession(event: MouseEvent, task: CompletedTask) {
		event.stopPropagation(); // Don't open drawer when clicking resume

		if (!task.assignee) return;

		resumingTasks.add(task.id);
		resumingTasks = new Set(resumingTasks);

		try {
			const response = await fetch(`/api/sessions/${task.assignee}/resume`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			if (!response.ok) {
				const data = await response.json();
				console.error('Failed to resume session:', data.message);
				// Could add a toast notification here
			}
		} catch (error) {
			console.error('Error resuming session:', error);
		} finally {
			resumingTasks.delete(task.id);
			resumingTasks = new Set(resumingTasks);
		}
	}
</script>

<svelte:head>
	<title>Task History | JAT Dashboard</title>
	<link rel="icon" href="/favicons/history.svg" />
</svelte:head>

<div class="history-page min-h-screen bg-base-200">
	<!-- Main Content -->
	<div class="p-6">
		{#if loading}
			<HistorySkeleton dayGroups={5} tasksPerGroup={4} />
		{:else if error}
			<div class="error-state flex flex-col items-center justify-center py-20 gap-3">
				<p class="text-error">{error}</p>
				<button class="btn btn-sm btn-outline" onclick={fetchTasks}>Retry</button>
			</div>
		{:else}
			<!-- Stats Row - Stats + Graph (title on lg+) -->
			<div class="grid grid-cols-[auto_1fr] lg:grid-cols-[auto_auto_1fr] gap-3 items-stretch mb-6">
				<!-- Left: Title (lg+ only) -->
				<div class="mr-10 hidden lg:flex flex-col justify-center pr-2">
					<h1 class="text-xl font-semibold text-base-content font-mono">Task History</h1>
					<p class="text-sm text-base-content/60">{stats.totalCompleted} completed</p>
				</div>

				<!-- Stats cluster -->
				<div class="stats-cluster">
					<div class="stat-card streak-card">
						<div class="stat-icon">
							<span class="streak-fire">🔥</span>
						</div>
						<div class="stat-content">
							<span class="stat-value">
								<AnimatedDigits value={stats.streak.toString()} />
							</span>
							<span class="stat-label">day streak</span>
						</div>
					</div>

					<div class="stat-card">
						<div class="stat-content">
							<span class="stat-value today-value">
								<AnimatedDigits value={stats.todayCount.toString()} />
							</span>
							<span class="stat-label">today</span>
						</div>
					</div>

					<div class="stat-card">
						<div class="stat-content">
							<span class="stat-value">
								<AnimatedDigits value={stats.bestStreak.toString()} />
							</span>
							<span class="stat-label">best streak</span>
						</div>
					</div>

					<div class="stat-card">
						<div class="stat-content">
							<span class="stat-value">
								{stats.avgPerDay.toFixed(1)}
							</span>
							<span class="stat-label">avg/day</span>
						</div>
					</div>
				</div>

				<!-- Right: Activity Graph -->
				<div class="graph-card">
					<StreakCalendar tasks={filteredTasks} weeks={16} />
				</div>
			</div>

			<!-- Daily Breakdown -->
			<section class="daily-section">
				<!-- Filters Section (always visible) -->
				<div class="filters-bar">
					<input
						type="text"
						placeholder="Search tasks..."
						class="industrial-input w-48"
						bind:value={searchQuery}
					/>
					<div class="dropdown dropdown-end">
						<div
							tabindex="0"
							role="button"
							class="filter-trigger"
						>
							{#if selectedProject !== 'All Projects'}
								<span
									class="project-dot"
									style="background: {getProjectColor(selectedProject + '-x')}"
								></span>
							{/if}
							<span>{selectedProject}</span>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5 opacity-50">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
							</svg>
						</div>
						<ul tabindex="0" class="dropdown-content menu rounded-box z-50 min-w-44 w-max p-1 shadow-lg bg-base-200 border border-base-300 max-h-60 overflow-y-auto overflow-x-hidden">
							{#each projects as project}
								<li>
									<button
										type="button"
										class="filter-option {selectedProject === project ? 'active' : ''}"
										onclick={() => { handleProjectChange(project); document.activeElement?.blur(); }}
									>
										{#if project !== 'All Projects'}
											<span
												class="project-dot"
												style="background: {getProjectColor(project + '-x')}"
											></span>
										{/if}
										<span class="flex-1">{project}</span>
									</button>
								</li>
							{/each}
						</ul>
					</div>
					{#if searchQuery || selectedProject !== 'All Projects'}
						<button
							type="button"
							class="btn btn-ghost btn-xs text-base-content/60 hover:text-base-content"
							onclick={() => { searchQuery = ''; handleProjectChange('All Projects'); }}
						>
							Clear filters
						</button>
					{/if}
				</div>

				<div class="day-list">
					{#each tasksByDay as day}
						<div class="day-group">
							<div class="day-header">
								<span class="day-date">{day.displayDate}</span>
								<span class="day-count"
									>{day.tasks.length} task{day.tasks.length !== 1 ? 's' : ''}</span
								>
							</div>
							<div class="day-tasks">
								{#each day.tasks as task}
									<button class="task-item group" onclick={() => handleTaskClick(task.id)}>
										<span class="task-priority {getPriorityClass(task.priority)}"></span>
										<div class="task-info">
											<span class="task-title">{task.title}</span>
											<span class="task-meta">
												<span class="task-id">{task.id}</span>
												{#if task.assignee}
													<span class="task-agent">by {task.assignee}</span>
												{/if}
											</span>
										</div>
										<!-- Right side: resume button + time + arrow -->
										<div class="task-actions">
											<!-- Resume button - shows on hover when task has assignee -->
											{#if task.assignee}
												<button
													type="button"
													class="resume-btn"
													onclick={(e) => handleResumeSession(e, task)}
													title="Resume session with {task.assignee}"
													disabled={resumingTasks.has(task.id)}
												>
													{#if resumingTasks.has(task.id)}
														<span class="loading loading-spinner loading-xs"></span>
													{:else}
														<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
															<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
														</svg>
													{/if}
												</button>
											{/if}
											<span class="task-time">
												{formatTime(task.closed_at || task.updated_at)}
											</span>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												fill="none"
												viewBox="0 0 24 24"
												stroke-width="1.5"
												stroke="currentColor"
												class="task-arrow"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M8.25 4.5l7.5 7.5-7.5 7.5"
												/>
											</svg>
										</div>
									</button>
								{/each}
							</div>
						</div>
					{/each}

					{#if tasksByDay.length === 0}
						<div class="empty-state">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="empty-icon"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							<p>No completed tasks found</p>
							<p class="empty-hint">
								{#if searchQuery || selectedProject !== 'All Projects'}
									Try adjusting your filters
								{:else}
									Tasks will appear here when marked complete
								{/if}
							</p>
						</div>
					{/if}
				</div>
			</section>
		{/if}
	</div>
</div>

<!-- Task Detail Drawer -->
<TaskDetailDrawer bind:taskId={selectedTaskId} bind:isOpen={drawerOpen} />

<style>
	/* Stats cluster - 2x2 grid of stat cards */
	.stats-cluster {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
	}

	.stat-card {
		background: var(--color-base-100);
		border: 1px solid var(--color-base-300);
		border-radius: 8px;
		padding: 0.5rem 0.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		min-width: 80px;
	}

	.graph-card {
		background: var(--color-base-100);
		border: 1px solid var(--color-base-300);
		border-radius: 8px;
		padding: 0.5rem 0.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow-x: auto;
	}

	.streak-card {
		background: linear-gradient(
			135deg,
			color-mix(in oklch, var(--color-warning) 25%, var(--color-base-100)),
			var(--color-base-100)
		);
		border-color: oklch(from var(--color-warning) l c h / 40%);
	}

	.stat-icon {
		font-size: 1.25rem;
	}

	.streak-fire {
		filter: drop-shadow(0 0 6px color-mix(in oklch, var(--color-warning) 60%, transparent));
	}

	.stat-content {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.stat-value {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-base-content);
		font-family: ui-monospace, monospace;
		line-height: 1;
	}

	.today-value {
		color: var(--color-warning);
	}

	.stat-label {
		font-size: 0.65rem;
		color: oklch(from var(--color-base-content) l c h / 55%);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-top: 2px;
	}

	/* Filter Trigger Button */
	.filter-trigger {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.75rem;
		background: var(--color-base-200);
		border: 1px solid var(--color-base-300);
		border-radius: 0.375rem;
		font-size: 0.75rem;
		font-family: ui-monospace, monospace;
		color: var(--color-base-content);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.filter-trigger:hover {
		border-color: oklch(from var(--color-base-content) l c h / 30%);
	}

	/* Project Color Dot */
	.project-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	/* Filter Option in Dropdown */
	.filter-option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0.75rem;
		font-size: 0.75rem;
		font-family: ui-monospace, monospace;
		color: var(--color-base-content);
		opacity: 0.7;
		background: transparent;
		border: none;
		border-left: 2px solid transparent;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.filter-option:hover {
		opacity: 1;
		background: var(--color-base-300);
	}

	.filter-option.active {
		opacity: 1;
		background: oklch(from var(--color-primary) l c h / 15%);
		border-left-color: var(--color-primary);
		color: var(--color-primary);
	}

	/* Daily Section */
	.daily-section {
		flex: 1;
	}

	/* Filters Bar (always visible) */
	.filters-bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
		padding: 0.75rem 1rem;
		background: var(--color-base-100);
		border: 1px solid var(--color-base-300);
		border-radius: 8px;
	}

	.day-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.day-group {
		background: var(--color-base-100);
		border: 1px solid var(--color-base-300);
		border-radius: 10px;
		overflow: hidden;
	}

	.day-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: var(--color-base-200);
		border-bottom: 1px solid var(--color-base-300);
	}

	.day-date {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-base-content);
		font-family: ui-monospace, monospace;
	}

	.day-count {
		font-size: 0.75rem;
		color: oklch(from var(--color-base-content) l c h / 60%);
		padding: 0.125rem 0.5rem;
		background: var(--color-base-300);
		border-radius: 10px;
	}

	.day-tasks {
		display: flex;
		flex-direction: column;
	}

	.task-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 1rem;
		background: transparent;
		border: none;
		cursor: pointer;
		width: 100%;
		text-align: left;
		transition: background 0.15s ease;
		border-bottom: 1px solid oklch(from var(--color-base-300) l c h / 60%);
	}

	.task-item:last-child {
		border-bottom: none;
	}

	.task-item:hover {
		background: var(--color-base-200);
	}

	.task-priority {
		width: 4px;
		height: 28px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	/* Priority indicator colors */
	.task-priority.priority-p0 {
		background: var(--color-error);
	}
	.task-priority.priority-p1 {
		background: var(--color-warning);
	}
	.task-priority.priority-p2 {
		background: var(--color-info);
	}
	.task-priority.priority-default {
		background: oklch(from var(--color-base-content) l c h / 40%);
	}

	.task-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.task-title {
		font-size: 0.85rem;
		color: var(--color-base-content);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.task-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.7rem;
		color: oklch(from var(--color-base-content) l c h / 55%);
	}

	.task-id {
		font-family: ui-monospace, monospace;
		color: var(--color-info);
	}

	.task-agent {
		color: var(--color-success);
	}

	/* Task actions container - groups time, resume button, and arrow */
	.task-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.task-time {
		font-size: 0.7rem;
		color: oklch(from var(--color-base-content) l c h / 55%);
		min-width: 60px;
		text-align: right;
	}

	.task-arrow {
		width: 16px;
		height: 16px;
		color: oklch(from var(--color-base-content) l c h / 45%);
		flex-shrink: 0;
		transition:
			color 0.15s ease,
			transform 0.15s ease;
	}

	.task-item:hover .task-arrow {
		color: oklch(from var(--color-base-content) l c h / 65%);
		transform: translateX(2px);
	}

	/* Resume button - hidden by default, shows on hover */
	.resume-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 6px;
		background: oklch(from var(--color-success) l c h / 15%);
		border: 1px solid oklch(from var(--color-success) l c h / 30%);
		color: var(--color-success);
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.15s ease, background 0.15s ease, transform 0.15s ease;
		flex-shrink: 0;
	}

	.task-item:hover .resume-btn {
		opacity: 1;
	}

	.resume-btn:hover:not(:disabled) {
		background: oklch(from var(--color-success) l c h / 25%);
		border-color: oklch(from var(--color-success) l c h / 50%);
		transform: scale(1.05);
	}

	.resume-btn:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.task-item:hover .resume-btn:disabled {
		opacity: 0.6;
	}

	/* Error & Empty States */
	.error-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 1rem;
		color: oklch(from var(--color-base-content) l c h / 60%);
		text-align: center;
		gap: 0.75rem;
	}

	.empty-icon {
		width: 48px;
		height: 48px;
		color: oklch(from var(--color-base-content) l c h / 45%);
	}

	.empty-hint {
		font-size: 0.8rem;
		color: oklch(from var(--color-base-content) l c h / 50%);
	}
</style>
