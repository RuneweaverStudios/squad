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
	import StreakCalendar from "$lib/components/StreakCalendar.svelte";
	import AnimatedDigits from "$lib/components/AnimatedDigits.svelte";
	import TaskDetailDrawer from "$lib/components/TaskDetailDrawer.svelte";
	import { HistorySkeleton } from "$lib/components/skeleton";
	import { initProjectColors } from "$lib/utils/projectColors";
	import { openTaskDrawer } from "$lib/stores/drawerStore";
	import CompletedDayGroup from "$lib/components/history/CompletedDayGroup.svelte";
	import {
		type CompletedTask,
		toLocalDateStr,
		parseLocalDate,
		groupTasksByDay,
	} from "$lib/utils/completedTaskHelpers";

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
	let selectedProject = $state("");

	// Task detail drawer
	let selectedTaskId = $state<string | null>(null);
	let drawerOpen = $state(false);

	// Memory
	let memoryMap = $state<Map<string, string>>(new Map());
	let memoryViewerOpen = $state(false);
	let memoryContent = $state("");
	let memoryTitle = $state("");

	// Sync selectedProject from URL params
	$effect(() => {
		const projectParam = $page.url.searchParams.get("project");
		if (projectParam) selectedProject = projectParam;
	});

	// Fetch data on mount
	onMount(() => {
		initProjectColors();
		fetchProjects();
		fetchTasks();
		fetchMemory();
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

	async function fetchMemory() {
		try {
			const response = await fetch("/api/projects?visible=true");
			if (!response.ok) return;
			const data = await response.json();
			const projectNames: string[] = (data.projects || []).map((p: Project) => p.name);

			const map = new Map<string, string>();
			await Promise.all(
				projectNames.map(async (name) => {
					try {
						const res = await fetch(`/api/memory?action=browse&project=${encodeURIComponent(name)}`);
						if (!res.ok) return;
						const memData = await res.json();
						for (const file of memData.files || []) {
							if (file.task) {
								map.set(file.task, file.filename);
							}
						}
					} catch {}
				})
			);
			memoryMap = map;
		} catch (e) {
			console.error("Failed to fetch memory:", e);
		}
	}

	async function handleMemoryClick(event: MouseEvent, filename: string, task: CompletedTask) {
		event.stopPropagation();
		const project = task.project || task.id.split("-")[0];
		try {
			const res = await fetch(`/api/memory?action=file&project=${encodeURIComponent(project)}&filename=${encodeURIComponent(filename)}`);
			if (!res.ok) return;
			const data = await res.json();
			memoryTitle = filename.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "");
			memoryContent = data.content || "";
			memoryViewerOpen = true;
		} catch (e) {
			console.error("Failed to fetch memory file:", e);
		}
	}

	// Filtered tasks
	const filteredTasks = $derived.by(() => {
		return tasks.filter((task) => {
			// Project filter
			if (selectedProject) {
				const taskProject = task.project || task.id.split("-")[0];
				if (taskProject !== selectedProject) return false;
			}

			// Search filter
			if (searchQuery.trim()) {
				const query = searchQuery.toLowerCase();
				const matchesTitle = task.title.toLowerCase().includes(query);
				// Exact match for task IDs to avoid parent matching all children
			// (e.g. searching "squad-abc" would otherwise match "squad-abc.1", "squad-abc.2")
			const matchesId = task.id.toLowerCase() === query;
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
			const dateStr = toLocalDateStr(task.closed_at || task.updated_at);

			if (!tasksByDate.has(dateStr)) {
				tasksByDate.set(dateStr, []);
			}
			tasksByDate.get(dateStr)!.push(task);
		}

		// Today's count
		const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
		const todayCount = tasksByDate.get(todayStr)?.length || 0;

		// Calculate current streak
		let streak = 0;
		const checkDate = new Date(today);

		for (let i = 0; i < 365; i++) {
			const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;
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
			const date = parseLocalDate(dateStr);
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
			if (parseLocalDate(dateStr) >= thirtyDaysAgo) {
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
	const tasksByDay = $derived(groupTasksByDay(filteredTasks));

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

	async function handleReopenTask(event: MouseEvent, task: CompletedTask) {
		event.stopPropagation();
		try {
			const response = await fetch(`/api/tasks/${task.id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: "open" }),
			});
			if (response.ok) {
				// Remove from local tasks list and re-derive
				tasks = tasks.filter((t) => t.id !== task.id);
			}
		} catch (error) {
			console.error("Error reopening task:", error);
		}
	}

	function handleDuplicateTask(event: MouseEvent, task: CompletedTask) {
		event.stopPropagation();
		const project = task.project || task.id.split("-")[0];
		openTaskDrawer(project, task.title, "task", task.issue_type);
	}
</script>

<svelte:head>
	<title>Task History | SQUAD IDE</title>
	<meta name="description" content="View completed task history with streak calendar and productivity metrics." />
	<meta property="og:title" content="Task History | SQUAD IDE" />
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
					{#if searchQuery}
						<button
							type="button"
							class="btn btn-ghost btn-xs text-base-content/60 hover:text-base-content"
							onclick={() => {
								searchQuery = "";
							}}
						>
							Clear filters
						</button>
					{/if}
				</div>

				<div class="day-list">
					{#each tasksByDay as day (day.date)}
						<CompletedDayGroup
							{day}
							onTaskClick={handleTaskClick}
							onResumeSession={handleResumeSession}
							onMemoryClick={handleMemoryClick}
							onReopenTask={handleReopenTask}
							onDuplicateTask={handleDuplicateTask}
							{resumingTasks}
							{memoryMap}
						/>
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
								{#if searchQuery}
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

<!-- Memory Viewer Modal -->
{#if memoryViewerOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="memory-overlay" onclick={() => (memoryViewerOpen = false)} onkeydown={(e) => e.key === "Escape" && (memoryViewerOpen = false)}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="memory-panel" onclick={(e) => e.stopPropagation()}>
			<div class="memory-header">
				<h3 class="memory-header-title">{memoryTitle}</h3>
				<button type="button" class="memory-close" onclick={() => (memoryViewerOpen = false)}>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
			<pre class="memory-body">{memoryContent}</pre>
		</div>
	</div>
{/if}

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

	/* Memory Viewer Modal */
	.memory-overlay {
		position: fixed;
		inset: 0;
		background: oklch(0 0 0 / 50%);
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}

	.memory-panel {
		background: var(--color-base-100);
		border: 1px solid var(--color-base-300);
		border-radius: 12px;
		max-width: 700px;
		width: 100%;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 25px 50px oklch(0 0 0 / 25%);
	}

	.memory-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--color-base-300);
	}

	.memory-header-title {
		font-size: 0.85rem;
		font-weight: 600;
		font-family: ui-monospace, monospace;
		color: var(--color-base-content);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.memory-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 6px;
		border: none;
		background: transparent;
		color: oklch(from var(--color-base-content) l c h / 50%);
		cursor: pointer;
		flex-shrink: 0;
	}

	.memory-close:hover {
		background: var(--color-base-200);
		color: var(--color-base-content);
	}

	.memory-body {
		padding: 1rem;
		overflow-y: auto;
		font-size: 0.8rem;
		line-height: 1.6;
		color: oklch(from var(--color-base-content) l c h / 80%);
		font-family: ui-monospace, monospace;
		white-space: pre-wrap;
		word-break: break-word;
		margin: 0;
	}
</style>
