<script lang="ts">
	/**
	 * TaskHistoryDrawer Component
	 *
	 * A sleek drawer showing task completion history with:
	 * - Streak calendar visualization (GitHub-style)
	 * - Daily breakdown with agent attribution
	 * - Clickable tasks for details
	 * - Streak statistics and milestones
	 */

	import { fly, fade } from 'svelte/transition';
	import StreakCalendar from './StreakCalendar.svelte';
	import AnimatedDigits from './AnimatedDigits.svelte';

	interface CompletedTask {
		id: string;
		title: string;
		assignee?: string;
		created_at: string;
		updated_at: string;
		closed_at?: string;
		priority?: number;
		issue_type?: string;
		project?: string;
	}

	interface Props {
		isOpen?: boolean;
		onClose?: () => void;
		onTaskClick?: (taskId: string) => void;
	}

	let {
		isOpen = $bindable(false),
		onClose = () => {},
		onTaskClick = () => {}
	}: Props = $props();

	// State
	let tasks = $state<CompletedTask[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	// Fetch completed tasks when drawer opens
	$effect(() => {
		if (isOpen) {
			fetchTasks();
		}
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

	// Calculate statistics
	const stats = $derived.by(() => {
		if (tasks.length === 0) return {
			totalCompleted: 0,
			todayCount: 0,
			streak: 0,
			bestStreak: 0,
			avgPerDay: 0,
			topAgent: null
		};

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		// Group by date
		const tasksByDate = new Map<string, CompletedTask[]>();
		const agentCounts = new Map<string, number>();

		for (const task of tasks) {
			const dateStr = task.closed_at
				? new Date(task.closed_at).toISOString().split('T')[0]
				: new Date(task.updated_at).toISOString().split('T')[0];

			if (!tasksByDate.has(dateStr)) {
				tasksByDate.set(dateStr, []);
			}
			tasksByDate.get(dateStr)!.push(task);

			// Count by agent
			if (task.assignee) {
				agentCounts.set(task.assignee, (agentCounts.get(task.assignee) || 0) + 1);
			}
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

		// Top agent
		let topAgent: { name: string; count: number } | null = null;
		for (const [name, count] of agentCounts) {
			if (!topAgent || count > topAgent.count) {
				topAgent = { name, count };
			}
		}

		return {
			totalCompleted: tasks.length,
			todayCount,
			streak,
			bestStreak,
			avgPerDay,
			topAgent
		};
	});

	// Group tasks by day for the list view
	interface DayGroup {
		date: string;
		displayDate: string;
		tasks: CompletedTask[];
		agents: Map<string, number>;
	}

	function getTaskDuration(task: CompletedTask): number {
		const end = new Date(task.closed_at || task.updated_at).getTime();
		const start = new Date(task.created_at).getTime();
		return Math.max(0, end - start);
	}

	function formatDuration(ms: number): string {
		const mins = Math.round(ms / 60000);
		if (mins < 1) return "<1m";
		if (mins < 60) return `${mins}m`;
		const h = Math.floor(mins / 60);
		const m = mins % 60;
		return m > 0 ? `${h}h ${m}m` : `${h}h`;
	}

	function getTimelinePos(task: CompletedTask): { left: number; width: number } {
		const startDate = new Date(task.created_at);
		const endDate = new Date(task.closed_at || task.updated_at);
		const endMins = endDate.getHours() * 60 + endDate.getMinutes();
		const sameDay =
			startDate.getFullYear() === endDate.getFullYear() &&
			startDate.getMonth() === endDate.getMonth() &&
			startDate.getDate() === endDate.getDate();
		const startMins = sameDay ? startDate.getHours() * 60 + startDate.getMinutes() : 0;
		const left = (startMins / 1440) * 100;
		const width = Math.max(1.2, ((endMins - startMins) / 1440) * 100);
		return { left, width };
	}

	const tasksByDay = $derived.by(() => {
		const groups = new Map<string, DayGroup>();

		for (const task of tasks) {
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

		// Sort tasks within each day by completion time descending (most recent first)
		for (const group of groups.values()) {
			group.tasks.sort((a, b) => {
				const aTime = new Date(a.closed_at || a.updated_at).getTime();
				const bTime = new Date(b.closed_at || b.updated_at).getTime();
				return bTime - aTime;
			});
		}

		// Sort by date descending
		return Array.from(groups.values())
			.sort((a, b) => b.date.localeCompare(a.date))
			.slice(0, 30); // Show last 30 days with activity
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
			day: 'numeric'
		});
	}

	function formatTime(dateStr: string): string {
		return new Date(dateStr).toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	// Priority colors
	function getPriorityColor(priority: number | undefined): string {
		switch (priority) {
			case 0: return 'oklch(0.70 0.18 25)'; // P0 - Red
			case 1: return 'oklch(0.75 0.15 55)'; // P1 - Orange
			case 2: return 'oklch(0.75 0.12 85)'; // P2 - Yellow
			default: return 'oklch(0.55 0.02 250)'; // P3+ - Gray
		}
	}

	function handleClose() {
		isOpen = false;
		onClose();
	}

	function handleOverlayClick() {
		handleClose();
	}

	function handleTaskClick(taskId: string) {
		onTaskClick(taskId);
	}

	// Handle escape key
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && isOpen) {
			handleClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- Overlay -->
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="drawer-overlay"
		onclick={handleOverlayClick}
		transition:fade={{ duration: 200 }}
	></div>

	<!-- Drawer -->
	<div
		class="history-drawer"
		transition:fly={{ x: 400, duration: 300, opacity: 1 }}
		role="dialog"
		aria-modal="true"
		aria-label="Task History"
	>
		<!-- Header -->
		<header class="drawer-header">
			<div class="flex items-center gap-3">
				<div class="header-icon">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
						<path fill-rule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clip-rule="evenodd" />
					</svg>
				</div>
				<div>
					<h2 class="text-base font-semibold text-base-content font-mono tracking-tight m-0">Task History</h2>
					<p class="text-xs text-base-content/60 m-0">{stats.totalCompleted} tasks completed</p>
				</div>
			</div>
			<button
				class="w-8 h-8 rounded-md bg-transparent border border-base-content/20 text-base-content/60 cursor-pointer flex items-center justify-center transition-all duration-150 hover:bg-base-content/10 hover:text-base-content/80 hover:border-base-content/30"
				onclick={handleClose}
				aria-label="Close"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</header>

		<!-- Content -->
		<div class="drawer-content">
			{#if loading}
				<div class="flex flex-col items-center justify-center py-12 px-4 text-base-content/60 text-center gap-3">
					<span class="loading loading-spinner loading-lg"></span>
					<p>Loading history...</p>
				</div>
			{:else if error}
				<div class="flex flex-col items-center justify-center py-12 px-4 text-base-content/60 text-center gap-3">
					<p>{error}</p>
					<button class="px-4 py-2 bg-base-content/15 border border-base-content/25 rounded-md text-base-content/80 cursor-pointer text-sm transition-all hover:bg-base-content/20" onclick={fetchTasks}>Retry</button>
				</div>
			{:else}
				<!-- Stats Row -->
				<div class="grid grid-cols-4 gap-2">
					<div class="stat-card streak-card fade-in fade-in-delay-0">
						<div class="text-xl">
							<span class="streak-fire">🔥</span>
						</div>
						<div class="flex flex-col items-center">
							<span class="text-xl font-bold text-base-content font-mono leading-none">
								<AnimatedDigits value={stats.streak.toString()} />
							</span>
							<span class="text-[0.65rem] text-base-content/50 uppercase tracking-wide mt-0.5">day streak</span>
						</div>
					</div>

					<div class="stat-card fade-in fade-in-delay-1">
						<div class="flex flex-col items-center">
							<span class="text-xl font-bold text-warning font-mono leading-none">
								<AnimatedDigits value={stats.todayCount.toString()} />
							</span>
							<span class="text-[0.65rem] text-base-content/50 uppercase tracking-wide mt-0.5">today</span>
						</div>
					</div>

					<div class="stat-card fade-in fade-in-delay-2">
						<div class="flex flex-col items-center">
							<span class="text-xl font-bold text-base-content font-mono leading-none">
								<AnimatedDigits value={stats.bestStreak.toString()} />
							</span>
							<span class="text-[0.65rem] text-base-content/50 uppercase tracking-wide mt-0.5">best streak</span>
						</div>
					</div>

					<div class="stat-card fade-in fade-in-delay-3">
						<div class="flex flex-col items-center">
							<span class="text-xl font-bold text-base-content font-mono leading-none">
								{stats.avgPerDay.toFixed(1)}
							</span>
							<span class="text-[0.65rem] text-base-content/50 uppercase tracking-wide mt-0.5">avg/day</span>
						</div>
					</div>
				</div>

				<!-- Calendar Section -->
				<section class="bg-base-200/50 border border-base-content/15 rounded-xl p-4">
					<h3 class="text-[0.7rem] font-semibold text-base-content/60 uppercase tracking-widest mb-3">Activity</h3>
					<div class="overflow-x-auto pb-1">
						<StreakCalendar {tasks} weeks={12} />
					</div>
				</section>

				<!-- Top Contributor -->
				{#if stats.topAgent}
					<div class="flex items-center gap-2 px-3 py-2 bg-success/10 border border-success/20 rounded-md text-xs">
						<span class="text-base-content/60">Top contributor:</span>
						<span class="text-success font-semibold font-mono">{stats.topAgent.name}</span>
						<span class="text-base-content/50">({stats.topAgent.count} tasks)</span>
					</div>
				{/if}

				<!-- Daily Breakdown -->
				<section class="flex-1">
					<h3 class="text-[0.7rem] font-semibold text-base-content/60 uppercase tracking-widest mb-3">Recent Activity</h3>
					<div class="day-list">
						{#each tasksByDay as day, dayIndex}
							<div class="day-group fade-in-left fade-in-delay-{Math.min(dayIndex, 12)}">
								<div class="day-header">
									<span class="text-sm font-semibold text-base-content/85 font-mono">{day.displayDate}</span>
									<span class="text-xs text-base-content/55 px-2 py-0.5 bg-base-content/10 rounded-full">{day.tasks.length} task{day.tasks.length !== 1 ? 's' : ''}</span>
									{#if day.agents.size > 0}
										<div class="day-agents">
											{#each Array.from(day.agents.entries()).slice(0, 3) as [agent, count]}
												<span class="w-6 h-6 rounded bg-info/30 text-info text-[0.6rem] font-semibold font-mono flex items-center justify-center uppercase" title="{agent}: {count} tasks">
													{agent.slice(0, 2)}
												</span>
											{/each}
											{#if day.agents.size > 3}
												<span class="h-6 rounded bg-base-content/10 text-base-content/60 text-[0.55rem] font-mono flex items-center justify-center px-1.5">+{day.agents.size - 3}</span>
											{/if}
										</div>
									{/if}
								</div>
								<div class="day-tasks">
									{#each day.tasks as task}
										{@const duration = getTaskDuration(task)}
										{@const pos = getTimelinePos(task)}
										<button
											class="task-item group"
											onclick={() => handleTaskClick(task.id)}
										>
											<span
												class="task-priority"
												style="background: {getPriorityColor(task.priority)}"
											></span>
											<div class="task-info">
												<span class="text-sm text-base-content/85 whitespace-nowrap overflow-hidden text-ellipsis">{task.title}</span>
												<span class="flex items-center gap-2 text-[0.65rem] text-base-content/50">
													<span class="font-mono text-info/70">{task.id}</span>
													{#if task.assignee}
														<span class="text-success/70">by {task.assignee}</span>
													{/if}
													<span class="ml-auto flex flex-col items-end gap-0.5" title="Duration: {formatDuration(duration)}\nCreated: {new Date(task.created_at).toLocaleString()}{task.closed_at ? '\nCompleted: ' + new Date(task.closed_at).toLocaleString() : ''}">
														<span class="flex items-center gap-1">
															<span class="text-base-content/35">{formatTime(task.created_at)}</span>
															<span class="text-base-content/25">-</span>
															<span class="text-base-content/55">{formatTime(task.closed_at || task.updated_at)}</span>
														</span>
														<span class="relative w-full block" style="height: 3px; background: oklch(from var(--color-base-content) l c h / 6%); border-radius: 1.5px;">
															<span class="absolute top-0" style="left: 50%; width: 1px; height: 100%; background: oklch(from var(--color-base-content) l c h / 10%)"></span>
															<span class="absolute top-0" style="left: {pos.left}%; width: {pos.width}%; height: 100%; border-radius: 1.5px; background: linear-gradient(90deg, oklch(from var(--color-info) l c h / 50%), oklch(from var(--color-info) l c h / 75%))"></span>
														</span>
													</span>
												</span>
											</div>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5 text-base-content/40 shrink-0 transition-all group-hover:text-base-content/60 group-hover:translate-x-0.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
											</svg>
										</button>
									{/each}
								</div>
							</div>
						{/each}

						{#if tasksByDay.length === 0}
							<div class="flex flex-col items-center justify-center py-12 px-4 text-base-content/55 text-center gap-3">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12 text-base-content/40">
									<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								<p>No completed tasks yet</p>
								<p class="text-xs text-base-content/45">Tasks will appear here when marked complete</p>
							</div>
						{/if}
					</div>
				</section>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* Overlay - black with opacity (oklch required for precise dark overlay) */
	.drawer-overlay {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		left: 0;
		backdrop-filter: blur(4px);
		z-index: 998;
		background: oklch(0 0 0 / 0.6);
	}

	/* Main drawer panel */
	.history-drawer {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 100%;
		max-width: 480px;
		z-index: 999;
		display: flex;
		flex-direction: column;
		background-color: var(--color-base-100);
		border-left: 1px solid oklch(from var(--color-base-content) l c h / 0.2);
		box-shadow: -8px 0 32px oklch(0 0 0 / 0.4);
	}

	/* Header */
	.drawer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid oklch(from var(--color-base-content) l c h / 0.15);
		background-color: oklch(from var(--color-base-200) l c h / 0.5);
	}

	/* Header icon - gradient (oklch required for amber-orange gradient) */
	.header-icon {
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, oklch(0.70 0.15 85), oklch(0.60 0.18 55));
		color: oklch(0.15 0.02 85);
	}

	/* Scrollable content */
	.drawer-content {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	/* Stats Row */
	.stat-card {
		background-color: oklch(from var(--color-base-200) l c h / 0.5);
		border: 1px solid oklch(from var(--color-base-content) l c h / 0.15);
		border-radius: 0.5rem;
		padding: 0.75rem 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	/* Streak card - orange/red gradient (oklch required) */
	.streak-card {
		background: linear-gradient(135deg, oklch(0.25 0.08 35), oklch(0.22 0.05 45));
		border-color: oklch(0.40 0.10 35);
	}

	/* Fire emoji glow - drop-shadow (oklch required) */
	.streak-fire {
		filter: drop-shadow(0 0 4px oklch(0.70 0.20 35 / 0.6));
	}

	/* Daily Section */
	.day-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.day-group {
		background-color: oklch(from var(--color-base-200) l c h / 0.5);
		border: 1px solid oklch(from var(--color-base-content) l c h / 0.15);
		border-radius: 0.5rem;
		overflow: hidden;
	}

	.day-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 0.75rem;
		background-color: oklch(from var(--color-base-300) l c h / 0.5);
		border-bottom: 1px solid oklch(from var(--color-base-content) l c h / 0.1);
	}

	.day-agents {
		display: flex;
		gap: 0.25rem;
		margin-left: auto;
	}

	.day-tasks {
		display: flex;
		flex-direction: column;
	}

	.task-item {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem 0.75rem;
		background: transparent;
		border: none;
		cursor: pointer;
		width: 100%;
		text-align: left;
		transition: background-color 0.15s;
		border-bottom: 1px solid oklch(from var(--color-base-content) l c h / 0.08);
	}

	.task-item:last-child {
		border-bottom: none;
	}

	.task-item:hover {
		background-color: oklch(from var(--color-base-content) l c h / 0.05);
	}

	.task-priority {
		width: 3px;
		height: 1.5rem;
		border-radius: 0.125rem;
		flex-shrink: 0;
	}

	.task-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}
</style>
