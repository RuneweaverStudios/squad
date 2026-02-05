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

	import { onMount } from "svelte";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import StreakCalendar from "$lib/components/StreakCalendar.svelte";
	import AnimatedDigits from "$lib/components/AnimatedDigits.svelte";
	import TaskDetailDrawer from "$lib/components/TaskDetailDrawer.svelte";
	import { HistorySkeleton } from "$lib/components/skeleton";
	import { getProjectColor, initProjectColors } from "$lib/utils/projectColors";
	import ProjectSelector from "$lib/components/ProjectSelector.svelte";
	import AgentAvatar from "$lib/components/AgentAvatar.svelte";
	import { getIssueTypeVisual } from "$lib/config/statusColors";

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

	interface Project {
		name: string;
		activeColor?: string;
	}

	// State
	let tasks = $state<CompletedTask[]>([]);
	let projects = $state<Project[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Filters
	let searchQuery = $state("");
	let selectedProject = $state("All Projects");

	// Task detail drawer
	let selectedTaskId = $state<string | null>(null);
	let drawerOpen = $state(false);

	// Sync selectedProject from URL params
	$effect(() => {
		const projectParam = $page.url.searchParams.get("project");
		selectedProject = projectParam || "All Projects";
	});

	// Fetch data on mount
	onMount(() => {
		initProjectColors();
		fetchProjects();
		fetchTasks();
	});

	async function fetchProjects() {
		try {
			// Include stats=true to get projects sorted by last activity (most recent first)
			const response = await fetch("/api/projects?visible=true&stats=true");
			if (!response.ok) throw new Error("Failed to fetch projects");
			const data = await response.json();
			projects = data.projects || [];
		} catch (e) {
			console.error("Failed to fetch projects:", e);
		}
	}

	async function fetchTasks() {
		loading = true;
		error = null;
		try {
			const response = await fetch("/api/tasks?status=closed");
			if (!response.ok) throw new Error("Failed to fetch tasks");
			const data = await response.json();
			tasks = data.tasks || [];
		} catch (e) {
			error = e instanceof Error ? e.message : "Unknown error";
		} finally {
			loading = false;
		}
	}

	// Project names derived from actual closed tasks (only show projects with history)
	const projectNames = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const task of tasks) {
			const proj = task.project || task.id.split("-")[0];
			counts.set(proj, (counts.get(proj) || 0) + 1);
		}
		// Sort by task count descending
		const sorted = Array.from(counts.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([name]) => name);
		return ["All Projects", ...sorted];
	});

	// Project colors map for ProjectSelector
	const projectColorsMap = $derived(
		new Map(projects.map(p => [p.name, p.activeColor || "oklch(0.60 0.15 145)"]))
	);

	// Handle project selection change - update URL
	function handleProjectChange(project: string) {
		selectedProject = project;
		const url = new URL(window.location.href);
		if (project === "All Projects") {
			url.searchParams.delete("project");
		} else {
			url.searchParams.set("project", project);
		}
		goto(url.toString(), {
			replaceState: true,
			noScroll: true,
			keepFocus: true,
		});
	}

	// Filtered tasks
	const filteredTasks = $derived.by(() => {
		return tasks.filter((task) => {
			// Project filter
			if (selectedProject !== "All Projects") {
				const taskProject = task.project || task.id.split("-")[0];
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
				avgPerDay: 0,
			};

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		// Group by date
		const tasksByDate = new Map<string, CompletedTask[]>();

		for (const task of filteredTasks) {
			const dateStr = task.closed_at
				? new Date(task.closed_at).toISOString().split("T")[0]
				: new Date(task.updated_at).toISOString().split("T")[0];

			if (!tasksByDate.has(dateStr)) {
				tasksByDate.set(dateStr, []);
			}
			tasksByDate.get(dateStr)!.push(task);
		}

		// Today's count
		const todayStr = today.toISOString().split("T")[0];
		const todayCount = tasksByDate.get(todayStr)?.length || 0;

		// Calculate current streak
		let streak = 0;
		const checkDate = new Date(today);

		for (let i = 0; i < 365; i++) {
			const dateStr = checkDate.toISOString().split("T")[0];
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
				const diff =
					(date.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
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
			avgPerDay,
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

	/** Position a task on a 24h midnight-to-midnight timeline */
	function getTimelinePos(task: CompletedTask): { left: number; width: number; crossDay: boolean } {
		const startDate = new Date(task.created_at);
		const endDate = new Date(task.closed_at || task.updated_at);

		const endMins = endDate.getHours() * 60 + endDate.getMinutes();

		// If task spans multiple days, clamp start to midnight of completion day
		const sameDay =
			startDate.getFullYear() === endDate.getFullYear() &&
			startDate.getMonth() === endDate.getMonth() &&
			startDate.getDate() === endDate.getDate();
		const startMins = sameDay
			? startDate.getHours() * 60 + startDate.getMinutes()
			: 0;

		const left = (startMins / 1440) * 100;
		const width = Math.max(1.2, ((endMins - startMins) / 1440) * 100);

		return { left, width, crossDay: !sameDay };
	}

	const tasksByDay = $derived.by(() => {
		const groups = new Map<string, DayGroup>();

		for (const task of filteredTasks) {
			const dateStr = task.closed_at
				? new Date(task.closed_at).toISOString().split("T")[0]
				: new Date(task.updated_at).toISOString().split("T")[0];

			if (!groups.has(dateStr)) {
				const date = new Date(dateStr);
				groups.set(dateStr, {
					date: dateStr,
					displayDate: formatDisplayDate(date),
					tasks: [],
					agents: new Map(),
				});
			}

			const group = groups.get(dateStr)!;
			group.tasks.push(task);
			if (task.assignee) {
				group.agents.set(
					task.assignee,
					(group.agents.get(task.assignee) || 0) + 1,
				);
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

		// Sort by date descending and return all days (not limited to 30)
		return Array.from(groups.values()).sort((a, b) =>
			b.date.localeCompare(a.date),
		);
	});

	function formatDisplayDate(date: Date): string {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		const dateOnly = new Date(date);
		dateOnly.setHours(0, 0, 0, 0);

		if (dateOnly.getTime() === today.getTime()) return "Today";
		if (dateOnly.getTime() === yesterday.getTime()) return "Yesterday";

		return date.toLocaleDateString("en-US", {
			weekday: "short",
			month: "short",
			day: "numeric",
			year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
		});
	}

	function formatTime(dateStr: string): string {
		return new Date(dateStr).toLocaleTimeString("en-US", {
			hour: "numeric",
			minute: "2-digit",
		});
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
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});

			if (!response.ok) {
				const data = await response.json();
				console.error("Failed to resume session:", data.message);
				// Could add a toast notification here
			}
		} catch (error) {
			console.error("Error resuming session:", error);
		} finally {
			resumingTasks.delete(task.id);
			resumingTasks = new Set(resumingTasks);
		}
	}
</script>

<svelte:head>
	<title>Task History | JAT IDE</title>
	<meta name="description" content="View completed task history with streak calendar and productivity metrics." />
	<meta property="og:title" content="Task History | JAT IDE" />
	<meta property="og:description" content="View completed task history with streak calendar and productivity metrics." />
	<meta property="og:image" content="/favicons/history.svg" />
	<link rel="icon" href="/favicons/history.svg" />
</svelte:head>

<div class="history-page min-h-screen bg-base-200">
	<!-- Main Content -->
	<div class="p-6">
		{#if loading}
			<HistorySkeleton dayGroups={5} tasksPerGroup={4} />
		{:else if error}
			<div
				class="error-state flex flex-col items-center justify-center py-20 gap-3"
			>
				<p class="text-error">{error}</p>
				<button class="btn btn-sm btn-outline" onclick={fetchTasks}
					>Retry</button
				>
			</div>
		{:else}
			<!-- Stats Row - Stats + Graph (title on lg+) -->
			<div
				class="grid grid-cols-[auto_1fr] lg:grid-cols-[auto_auto_1fr] gap-3 items-stretch mb-6"
			>
				<!-- Left: Title (lg+ only) -->
				<div class="mr-10 hidden lg:flex flex-col justify-center pr-2">
					<h1 class="text-xl font-semibold text-base-content font-mono">
						Task History
					</h1>
					<p class="text-sm text-base-content/60">
						{stats.totalCompleted} completed
					</p>
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
					<div class="w-48">
						<ProjectSelector
							projects={projectNames}
							{selectedProject}
							onProjectChange={handleProjectChange}
							showColors={true}
							projectColors={projectColorsMap}
							compact={true}
						/>
					</div>
					{#if searchQuery || selectedProject !== "All Projects"}
						<button
							type="button"
							class="btn btn-ghost btn-xs text-base-content/60 hover:text-base-content"
							onclick={() => {
								searchQuery = "";
								handleProjectChange("All Projects");
							}}
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
									>{day.tasks.length} task{day.tasks.length !== 1
										? "s"
										: ""}</span
								>
							</div>
							<div class="day-tasks">
								{#each day.tasks as task}
									{@const duration = getTaskDuration(task)}
									{@const pos = getTimelinePos(task)}
									{@const color = getProjectColor(task.project || task.id.split('-')[0])}
									{@const typeVis = getIssueTypeVisual(task.issue_type)}
									{@const pColors = { 0: { bg: 'oklch(0.55 0.20 25 / 0.25)', text: 'oklch(0.75 0.18 25)', border: 'oklch(0.55 0.20 25 / 0.5)' }, 1: { bg: 'oklch(0.55 0.18 85 / 0.25)', text: 'oklch(0.80 0.15 85)', border: 'oklch(0.55 0.18 85 / 0.5)' }, 2: { bg: 'oklch(0.55 0.15 200 / 0.20)', text: 'oklch(0.75 0.12 200)', border: 'oklch(0.55 0.15 200 / 0.4)' }, 3: { bg: 'oklch(0.35 0.02 250 / 0.30)', text: 'oklch(0.65 0.02 250)', border: 'oklch(0.35 0.02 250 / 0.5)' } }}
									{@const pc = pColors[task.priority as keyof typeof pColors] || pColors[3]}
									<button
										class="task-item group"
										onclick={() => handleTaskClick(task.id)}
									>
										<div class="task-badge" style="--pc: {color}">
											<span class="task-badge-avatar" title={task.assignee || 'Unassigned'}>
												{#if task.assignee}
													<AgentAvatar name={task.assignee} size={28} />
												{:else}
													<span class="task-badge-initials">??</span>
												{/if}
											</span>
											<div class="task-badge-info">
												<span class="task-badge-id">{task.id}</span>
												<span class="task-badge-tags mt-0.5">
													{#if task.issue_type}
														<span class="task-badge-type">{typeVis.icon}</span>
													{/if}
													{#if task.priority != null}
														<span class="task-badge-priority ml-0.5" style="background: {pc.bg}; color: {pc.text}; border: 1px solid {pc.border};">P{task.priority}</span>
													{/if}
												</span>
											</div>
										</div>
										<div class="task-info">
											<span class="task-title">{task.title}</span>
											{#if task.assignee}
												<span class="task-meta">
													<span class="task-agent">by {task.assignee}</span>
												</span>
											{/if}
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
														<span class="loading loading-spinner loading-xs"
														></span>
													{:else}
														<svg
															xmlns="http://www.w3.org/2000/svg"
															fill="none"
															viewBox="0 0 24 24"
															stroke-width="1.5"
															stroke="currentColor"
															class="w-4 h-4"
														>
															<path
																stroke-linecap="round"
																stroke-linejoin="round"
																d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
															/>
														</svg>
													{/if}
												</button>
											{/if}
										<div class="task-time-col" title="Duration: {formatDuration(duration)}\nCreated: {new Date(task.created_at).toLocaleString()}{task.closed_at ? '\nCompleted: ' + new Date(task.closed_at).toLocaleString() : ''}">
											<span class="task-time">
												<span class="task-time-start">{formatTime(task.created_at)}</span>
												<span class="task-time-sep">-</span>
												<span class="task-time-end">{formatTime(task.closed_at || task.updated_at)}</span>
												<span class="task-time-duration">{formatDuration(duration)}</span>
											</span>
											<div class="task-duration-track">
												<div class="task-duration-noon"></div>
												{#if pos.crossDay}
													<div class="task-duration-overflow-cap"></div>
												{/if}
												<div
													class="task-duration-fill"
													class:task-duration-overflow={pos.crossDay}
													style="left: {pos.left}%; width: {pos.width}%"
												></div>
											</div>
										</div>
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
								{#if searchQuery || selectedProject !== "All Projects"}
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
		filter: drop-shadow(
			0 0 6px color-mix(in oklch, var(--color-warning) 60%, transparent)
		);
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

	/* Task badge - matches /tasks TaskIdBadge layout */
	.task-badge {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}

	.task-badge-avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		background: color-mix(in oklch, var(--pc) 15%, var(--color-base-200));
		border: 1.5px solid color-mix(in oklch, var(--pc) 35%, transparent);
		flex-shrink: 0;
	}

	.task-badge-initials {
		font-size: 0.55rem;
		font-weight: 700;
		font-family: ui-monospace, monospace;
		text-transform: uppercase;
		color: var(--pc);
	}

	.task-badge-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.task-badge-id {
		font-size: 0.75rem;
		font-family: ui-monospace, monospace;
		font-weight: 600;
		line-height: 1;
		color: var(--pc);
	}

	.task-badge-tags {
		display: flex;
		align-items: center;
		gap: 3px;
	}

	.task-badge-type {
		font-size: 0.75rem;
		line-height: 1;
	}

	.task-badge-priority {
		font-size: 0.6rem;
		font-weight: 600;
		padding: 0 4px;
		border-radius: 3px;
		line-height: 1.5;
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

	.task-time-col {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 3px;
		min-width: 130px;
	}

	.task-time {
		font-size: 0.7rem;
		color: oklch(from var(--color-base-content) l c h / 55%);
		display: flex;
		align-items: center;
		gap: 0.25rem;
		white-space: nowrap;
	}

	.task-time-start {
		color: oklch(from var(--color-base-content) l c h / 40%);
	}

	.task-time-sep {
		color: oklch(from var(--color-base-content) l c h / 30%);
	}

	.task-time-end {
		color: oklch(from var(--color-base-content) l c h / 60%);
	}

	.task-time-duration {
		color: oklch(from var(--color-base-content) l c h / 40%);
		font-family: ui-monospace, monospace;
		font-size: 0.6rem;
	}

	.task-duration-track {
		position: relative;
		width: 100%;
		height: 3px;
		background: oklch(from var(--color-base-content) l c h / 6%);
		border-radius: 1.5px;
	}

	.task-duration-noon {
		position: absolute;
		left: 50%;
		top: 0;
		width: 1px;
		height: 100%;
		background: oklch(from var(--color-base-content) l c h / 10%);
	}

	.task-duration-fill {
		position: absolute;
		top: 0;
		height: 100%;
		border-radius: 1.5px;
		background: linear-gradient(
			90deg,
			oklch(from var(--color-info) l c h / 50%),
			oklch(from var(--color-info) l c h / 75%)
		);
	}

	.task-duration-fill.task-duration-overflow {
		background: linear-gradient(
			90deg,
			oklch(from var(--color-warning) l c h / 70%),
			oklch(from var(--color-info) l c h / 55%)
		);
	}

	.task-duration-overflow-cap {
		position: absolute;
		left: 0;
		top: -1px;
		width: 2px;
		height: calc(100% + 2px);
		background: oklch(from var(--color-warning) l c h / 85%);
		border-radius: 1px;
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
		transition:
			opacity 0.15s ease,
			background 0.15s ease,
			transform 0.15s ease;
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
