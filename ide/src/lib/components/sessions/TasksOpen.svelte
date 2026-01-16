<script lang="ts">
	/**
	 * TasksOpen Component
	 *
	 * Displays open tasks that are ready to spawn with a rocket button.
	 * Used on /tasks2 page below the active sessions section.
	 */

	import { untrack, onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import TaskIdBadge from '$lib/components/TaskIdBadge.svelte';
	import { getProjectColor } from '$lib/utils/projectColors';

	const STORAGE_KEY = 'jat-open-tasks-project-filter';

	interface Dependency {
		id: string;
		title?: string;
		status: string;
		priority?: number;
	}

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
		depends_on?: Dependency[];
	}

	let {
		tasks = [],
		loading = false,
		error = null,
		spawningTaskId = null,
		projectColors = {},
		showHeader = true,
		onSpawnTask = () => {},
		onRetry = () => {},
		onTaskClick = () => {}
	}: {
		tasks: Task[];
		loading: boolean;
		error: string | null;
		spawningTaskId: string | null;
		projectColors: Record<string, string>;
		showHeader?: boolean;
		onSpawnTask: (task: Task) => void;
		onRetry: () => void;
		onTaskClick: (taskId: string) => void;
	} = $props();

	function handleRowClick(taskId: string) {
		onTaskClick(taskId);
	}

	// State for project filter
	let selectedProject = $state<string | null>(null);

	// Load persisted filter on mount
	onMount(() => {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			selectedProject = saved;
		}
	});

	// Persist filter changes
	$effect(() => {
		if (selectedProject === null) {
			localStorage.removeItem(STORAGE_KEY);
		} else {
			localStorage.setItem(STORAGE_KEY, selectedProject);
		}
	});

	// Track task IDs for animations - maintains order so exiting tasks stay in position
	let previousTaskObjects = $state<Map<string, Task>>(new Map());
	let taskOrder = $state<string[]>([]); // Tracks order for position preservation
	let newTaskIds = $state<string[]>([]);
	let exitingTaskIds = $state<Set<string>>(new Set());

	// Track filter-based animations (separate from data changes)
	let filterExitingTaskIds = $state<Set<string>>(new Set());
	let filterEnteringTaskIds = $state<string[]>([]);
	let previousSelectedProject = $state<string | null | undefined>(undefined); // undefined = not initialized

	// Effect to detect new and exiting tasks while preserving order
	$effect(() => {
		const openTasks = tasks.filter(t => t.status === 'open');
		const currentIds = new Set(openTasks.map(t => t.id));

		// Use untrack to read previous state without creating a dependency
		const prevObjects = untrack(() => previousTaskObjects);
		const prevOrder = untrack(() => taskOrder);
		const prevExiting = untrack(() => exitingTaskIds);

		// Build current task object map
		const currentObjects = new Map<string, Task>();
		for (const task of openTasks) {
			currentObjects.set(task.id, task);
		}

		// Skip on initial load - just set initial order (sorted by priority)
		if (prevOrder.length === 0 && openTasks.length > 0) {
			taskOrder = openTasks.sort((a, b) => a.priority - b.priority).map(t => t.id);
			previousTaskObjects = currentObjects;
			return;
		}

		// Find new tasks (in current but not in previous order)
		const newIds: string[] = [];
		for (const id of currentIds) {
			if (!prevOrder.includes(id)) {
				newIds.push(id);
			}
		}

		// Find exiting tasks (in previous order but not in current)
		const exitIds = new Set<string>();
		for (const id of prevOrder) {
			if (!currentIds.has(id) && !prevExiting.has(id)) {
				exitIds.add(id);
			}
		}

		// Update order: keep existing order (preserve positions), add new tasks sorted by priority
		let newOrder = [...prevOrder];
		// Sort new tasks by priority and add them
		const newTasksSorted = newIds
			.map(id => currentObjects.get(id))
			.filter((t): t is Task => t !== undefined)
			.sort((a, b) => a.priority - b.priority);
		for (const task of newTasksSorted) {
			// Insert at correct position based on priority
			const insertIndex = newOrder.findIndex(existingId => {
				const existing = currentObjects.get(existingId) || prevObjects.get(existingId);
				return existing && existing.priority > task.priority;
			});
			if (insertIndex === -1) {
				newOrder.push(task.id);
			} else {
				newOrder.splice(insertIndex, 0, task.id);
			}
		}

		// Remove tasks that have finished exiting
		newOrder = newOrder.filter(id => currentIds.has(id) || exitIds.has(id) || prevExiting.has(id));

		if (newIds.length > 0) {
			newTaskIds = newIds;
			setTimeout(() => {
				newTaskIds = [];
			}, 600);
		}

		if (exitIds.size > 0) {
			exitingTaskIds = new Set([...prevExiting, ...exitIds]);
			setTimeout(() => {
				exitingTaskIds = new Set([...exitingTaskIds].filter(id => !exitIds.has(id)));
				taskOrder = taskOrder.filter(id => !exitIds.has(id));
			}, 600);
		}

		taskOrder = newOrder;
		// Merge previous objects with current (keep exiting task objects available)
		const mergedObjects = new Map(prevObjects);
		for (const [id, task] of currentObjects) {
			mergedObjects.set(id, task);
		}
		previousTaskObjects = mergedObjects;
	});

	// Effect to detect filter changes and animate tasks being filtered in/out
	$effect(() => {
		// Track the current selectedProject
		const currentFilter = selectedProject;

		// Use untrack to read previous state without creating dependencies
		const prevFilter = untrack(() => previousSelectedProject);
		const currentOrder = untrack(() => taskOrder);
		const taskObjects = untrack(() => previousTaskObjects);
		const currentTasks = untrack(() => tasks);
		const prevFilterExiting = untrack(() => filterExitingTaskIds);

		// Skip filter animations when embedded (no header means no filter UI)
		if (!showHeader) {
			previousSelectedProject = currentFilter;
			return;
		}

		// Skip on initial load (undefined means not initialized yet)
		if (prevFilter === undefined) {
			previousSelectedProject = currentFilter;
			return;
		}

		// If filter hasn't changed, nothing to do
		if (prevFilter === currentFilter) {
			return;
		}

		// Helper to check if a task passes the filter
		const passesFilter = (taskId: string, filter: string | null): boolean => {
			if (filter === null) return true;
			return getProjectFromTaskId(taskId) === filter;
		};

		// Get all open task IDs that exist in our order
		const openTaskIds = currentOrder.filter(id => {
			const task = currentTasks.find(t => t.id === id && t.status === 'open') || taskObjects.get(id);
			return task !== undefined;
		});

		// Find tasks that were visible before but not now (filter exit)
		const exitingIds = new Set<string>();
		for (const id of openTaskIds) {
			const wasVisible = passesFilter(id, prevFilter) && !prevFilterExiting.has(id);
			const isVisible = passesFilter(id, currentFilter);
			if (wasVisible && !isVisible) {
				exitingIds.add(id);
			}
		}

		// Find tasks that were not visible before but are now (filter enter)
		const enteringIds: string[] = [];
		for (const id of openTaskIds) {
			const wasVisible = passesFilter(id, prevFilter);
			const isVisible = passesFilter(id, currentFilter);
			if (!wasVisible && isVisible) {
				enteringIds.push(id);
			}
		}

		// Update animation states
		if (exitingIds.size > 0) {
			filterExitingTaskIds = new Set([...prevFilterExiting, ...exitingIds]);
			setTimeout(() => {
				filterExitingTaskIds = new Set([...filterExitingTaskIds].filter(id => !exitingIds.has(id)));
			}, 600);
		}

		if (enteringIds.length > 0) {
			filterEnteringTaskIds = enteringIds;
			setTimeout(() => {
				filterEnteringTaskIds = [];
			}, 600);
		}

		// Update previous filter
		previousSelectedProject = currentFilter;
	});

	// Derived: tasks to render in order (includes exiting tasks in their original position)
	const orderedTasks = $derived(() => {
		const result: Array<{ task: Task; isExiting: boolean; isNew: boolean }> = [];
		for (const id of taskOrder) {
			const task = tasks.find(t => t.id === id && t.status === 'open') || previousTaskObjects.get(id);
			if (task) {
				const taskProject = getProjectFromTaskId(task.id);
				// Only apply project filter when header is shown (filter UI is visible)
				const matchesFilter = !showHeader || selectedProject === null || taskProject === selectedProject;
				const isFilterExiting = filterExitingTaskIds.has(id);

				// Include task if it matches filter OR if it's animating out due to filter change
				if (!matchesFilter && !isFilterExiting) {
					continue;
				}

				// Task is exiting if: data-removed OR filter-removed
				const isExiting = exitingTaskIds.has(id) || isFilterExiting;
				// Task is new if: data-added OR filter-added
				const isNew = newTaskIds.includes(id) || filterEnteringTaskIds.includes(id);

				result.push({
					task,
					isExiting,
					isNew
				});
			}
		}
		return result;
	});

	// Extract project from task ID (prefix before first hyphen)
	function getProjectFromTaskId(taskId: string): string {
		const match = taskId.match(/^([a-zA-Z0-9_-]+?)-/);
		return match ? match[1].toLowerCase() : 'unknown';
	}

	// Get unique projects from all tasks
	const uniqueProjects = $derived(() => {
		const projects = new Set<string>();
		for (const task of tasks) {
			if (task.status === 'open') {
				projects.add(getProjectFromTaskId(task.id));
			}
		}
		return Array.from(projects).sort();
	});

	// Derived: open tasks sorted by priority, filtered by project (only when header is shown)
	const sortedOpenTasks = $derived(
		tasks
			.filter(t => t.status === 'open')
			.filter(t => !showHeader || selectedProject === null || getProjectFromTaskId(t.id) === selectedProject)
			.sort((a, b) => a.priority - b.priority)
	);

	function getProjectColorReactive(taskIdOrProject: string): string | null {
		if (!taskIdOrProject) return null;
		const projectPrefix = taskIdOrProject.split('-')[0].toLowerCase();
		return projectColors[projectPrefix] || getProjectColor(taskIdOrProject);
	}

	function hasUnresolvedBlockers(task: Task): boolean {
		if (!task.depends_on || task.depends_on.length === 0) return false;
		return task.depends_on.some(dep => dep.status !== 'closed');
	}

	function getBlockingReason(task: Task): string {
		if (!task.depends_on) return '';
		const unresolvedDeps = task.depends_on.filter(dep => dep.status !== 'closed');
		if (unresolvedDeps.length === 0) return '';
		if (unresolvedDeps.length === 1) {
			return `Blocked by ${unresolvedDeps[0].id}`;
		}
		return `Blocked by ${unresolvedDeps.length} dependencies`;
	}

	// Pre-computed map: task.id → tasks that depend on it (for "Blocks" indicator)
	// Maps a task ID to all tasks that have it in their depends_on
	const blockedByMap = $derived.by(() => {
		const map = new Map<string, Task[]>();
		for (const task of tasks) {
			if (task.status === 'closed') continue; // Only track open blockers
			if (!task.depends_on) continue;
			for (const dep of task.depends_on) {
				if (!map.has(dep.id)) {
					map.set(dep.id, []);
				}
				map.get(dep.id)!.push(task);
			}
		}
		return map;
	});
</script>

<section class="open-tasks-section" class:no-header={!showHeader}>
	{#if showHeader}
		<div class="section-header">
			<h2>Open Tasks</h2>
			<span class="task-count">{sortedOpenTasks.length}</span>

			{#if uniqueProjects().length > 1}
				<div class="project-filter">
					{#each uniqueProjects() as project}
						{@const color = projectColors[project] || getProjectColor(project) || 'oklch(0.65 0.15 250)'}
						{#if selectedProject === null || selectedProject === project}
							<button
								type="button"
								class="project-filter-btn {selectedProject === project ? 'active' : ''}"
								style="--project-color: {color};"
								onclick={() => selectedProject = selectedProject === project ? null : project}
								transition:fade={{ duration: 200 }}
							>
								{project}
							</button>
						{/if}
					{/each}
					{#if selectedProject !== null}
						<button
							type="button"
							class="project-filter-btn all-btn"
							onclick={() => selectedProject = null}
							transition:fade={{ duration: 200 }}
						>
							All
						</button>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	{#if loading && tasks.length === 0}
		<div class="loading-skeleton">
			{#each [1, 2, 3, 4] as _}
				<div class="skeleton-row">
					<div class="skeleton h-5 w-40 rounded"></div>
					<div class="skeleton h-8 w-20 rounded"></div>
				</div>
			{/each}
		</div>
	{:else if error}
		<div class="error-state">
			<span>{error}</span>
			<button onclick={() => onRetry()}>Retry</button>
		</div>
	{:else if sortedOpenTasks.length === 0}
		<div class="empty-state">
			<span>No open tasks</span>
		</div>
	{:else}
		<div class="tasks-table-wrapper">
			<table class="tasks-table">
				<thead>
					<tr>
						<th class="th-task">Task</th>
						<th class="th-title">Title</th>
						<th class="th-actions">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each orderedTasks() as { task, isExiting, isNew } (task.id)}
						{@const projectColor = getProjectColorReactive(task.id)}
						{@const isBlocked = hasUnresolvedBlockers(task)}
						{@const blockReason = isBlocked ? getBlockingReason(task) : ''}
						{@const unresolvedBlockers = task.depends_on?.filter(d => d.status !== 'closed') || []}
						{@const blockedTasks = blockedByMap.get(task.id) || []}
						<tr
							class="task-row {isBlocked && !isExiting ? 'opacity-70' : ''} {isNew ? 'animate-slide-in-fwd-center' : ''} {isExiting ? 'animate-slide-out-bck-center' : ''}"
							style="{projectColor ? `border-left: 3px solid ${projectColor};` : ''}{isExiting ? ' pointer-events: none;' : ''}"
							onclick={() => !isExiting && handleRowClick(task.id)}
						>
							<td class="td-task" style={isExiting ? 'background: transparent;' : ''}>
								<TaskIdBadge
									{task}
									size="xs"
									showType={true}
									copyOnly
									blockedBy={unresolvedBlockers}
									blocks={blockedTasks}
									showDependencies={true}
									onOpenTask={handleRowClick}
									animate={isNew}
								/>
							</td>
							<td class="td-title" style={isExiting ? 'background: transparent;' : ''}>
								<span class="task-title {isNew ? 'tracking-in-expand' : ''}" style={isNew ? 'animation-delay: 100ms;' : ''} title={task.title}>
									{task.title}
								</span>
								{#if task.description}
									<div class="task-description {isNew ? 'tracking-in-expand' : ''}" style={isNew ? 'animation-delay: 100ms;' : ''}>
										{task.description}
									</div>
								{/if}
							</td>
							<td class="td-actions" style={isExiting ? 'background: transparent;' : ''}>
								<button
									class="btn btn-xs btn-ghost hover:btn-primary rocket-btn {spawningTaskId === task.id ? 'rocket-launching' : ''}"
									onclick={(e) => { e.stopPropagation(); onSpawnTask(task); }}
									disabled={spawningTaskId === task.id || isBlocked || isExiting}
									title={isBlocked ? blockReason : 'Launch agent'}
								>
									<div class="relative w-5 h-5 flex items-center justify-center overflow-visible">
										<!-- Debris/particles -->
										<div class="rocket-debris-1 absolute w-1 h-1 rounded-full bg-warning/80 left-1/2 top-1/2 opacity-0"></div>
										<div class="rocket-debris-2 absolute w-0.5 h-0.5 rounded-full bg-info/60 left-1/2 top-1/3 opacity-0"></div>
										<div class="rocket-debris-3 absolute w-1 h-0.5 rounded-full bg-base-content/40 left-1/2 top-2/3 opacity-0"></div>

										<!-- Smoke puffs -->
										<div class="rocket-smoke absolute w-2 h-2 rounded-full bg-base-content/30 bottom-0 left-1/2 -translate-x-1/2 opacity-0"></div>
										<div class="rocket-smoke-2 absolute w-1.5 h-1.5 rounded-full bg-base-content/20 bottom-0 left-1/2 -translate-x-1/2 translate-x-1 opacity-0"></div>

										<!-- Engine sparks -->
										<div class="engine-spark-1 absolute w-1.5 h-1.5 rounded-full bg-orange-400 left-1/2 top-1/2 opacity-0"></div>
										<div class="engine-spark-2 absolute w-1 h-1 rounded-full bg-yellow-300 left-1/2 top-1/2 opacity-0"></div>
										<div class="engine-spark-3 absolute w-[5px] h-[5px] rounded-full bg-amber-500 left-1/2 top-1/2 opacity-0"></div>
										<div class="engine-spark-4 absolute w-1 h-1 rounded-full bg-red-400 left-1/2 top-1/2 opacity-0"></div>

										<!-- Fire/exhaust -->
										<div class="rocket-fire absolute bottom-0 left-1/2 -translate-x-1/2 w-2 origin-top opacity-0">
											<svg viewBox="0 0 12 20" class="w-full">
												<path d="M6 0 L9 8 L7 6 L6 12 L5 6 L3 8 Z" fill="url(#fireGradient-{task.id})" />
												<defs>
													<linearGradient id="fireGradient-{task.id}" x1="0%" y1="0%" x2="0%" y2="100%">
														<stop offset="0%" style="stop-color:#f0932b" />
														<stop offset="50%" style="stop-color:#f39c12" />
														<stop offset="100%" style="stop-color:#e74c3c" />
													</linearGradient>
												</defs>
											</svg>
										</div>

										<!-- Rocket body -->
										<svg class="rocket-icon w-4 h-4" viewBox="0 0 24 24" fill="none">
											<path d="M12 2C12 2 8 6 8 12C8 15 9 17 10 18L10 21C10 21.5 10.5 22 11 22H13C13.5 22 14 21.5 14 21L14 18C15 17 16 15 16 12C16 6 12 2 12 2Z" fill="currentColor" />
											<circle cx="12" cy="10" r="2" fill="oklch(0.75 0.15 200)" />
											<path d="M8 14L5 17L6 18L8 16Z" fill="currentColor" />
											<path d="M16 14L19 17L18 18L16 16Z" fill="currentColor" />
											<path d="M12 2C12 2 10 5 10 8" stroke="oklch(0.9 0.05 200)" stroke-width="0.5" stroke-linecap="round" opacity="0.5" />
										</svg>
									</div>
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<style>
	/* Section styling */
	.open-tasks-section {
		background: oklch(0.18 0.01 250);
		border-radius: 0.75rem;
		border: 1px solid oklch(0.25 0.02 250);
	}

	.open-tasks-section.no-header {
		background: transparent;
		border: none;
		border-radius: 0;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		border-bottom: 1px solid oklch(0.25 0.02 250);
	}

	.section-header h2 {
		font-size: 0.9375rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		margin: 0;
	}

	.task-count {
		font-size: 0.75rem;
		font-weight: 500;
		padding: 0.125rem 0.5rem;
		background: oklch(0.25 0.02 250);
		border-radius: 9999px;
		color: oklch(0.70 0.02 250);
	}

	/* Project filter */
	.project-filter {
		margin-left: auto;
		display: flex;
		gap: 0.375rem;
	}

	.project-filter-btn {
		font-size: 0.6875rem;
		font-weight: 500;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		text-transform: lowercase;
		padding: 0.25rem 0.5rem;
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.15s ease;
		/* Use CSS custom property for project color */
		background: color-mix(in oklch, var(--project-color) 15%, transparent);
		border: 1px solid color-mix(in oklch, var(--project-color) 35%, transparent);
		color: var(--project-color);
	}

	.project-filter-btn:hover {
		background: color-mix(in oklch, var(--project-color) 25%, transparent);
		border-color: color-mix(in oklch, var(--project-color) 50%, transparent);
	}

	.project-filter-btn.active {
		background: color-mix(in oklch, var(--project-color) 30%, transparent);
		border-color: color-mix(in oklch, var(--project-color) 60%, transparent);
		box-shadow: 0 0 8px color-mix(in oklch, var(--project-color) 30%, transparent);
	}

	.project-filter-btn.all-btn {
		--project-color: oklch(0.70 0.02 250);
	}

	/* Loading skeleton */
	.loading-skeleton {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.skeleton-row {
		display: flex;
		gap: 1rem;
	}

	.skeleton {
		background: oklch(0.25 0.02 250);
		animation: pulse 1.5s infinite;
	}

	/* Error and empty states */
	.error-state,
	.empty-state {
		padding: 2rem;
		text-align: center;
		color: oklch(0.60 0.02 250);
	}

	.error-state button {
		margin-top: 0.75rem;
		padding: 0.375rem 0.75rem;
		background: oklch(0.25 0.02 250);
		border: 1px solid oklch(0.35 0.02 250);
		border-radius: 0.375rem;
		color: oklch(0.80 0.02 250);
		cursor: pointer;
	}

	/* Table styling */
	.tasks-table-wrapper {
		overflow-x: auto;
	}

	.tasks-table {
		width: 100%;
		border-collapse: collapse;
		table-layout: fixed;
	}

	.tasks-table th {
		text-align: left;
		padding: 0.625rem 1rem;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: oklch(0.55 0.02 250);
		background: oklch(0.16 0.01 250);
		border-bottom: 1px solid oklch(0.25 0.02 250);
	}

	/* Three-column layout widths to match TasksActive */
	/* Task: fixed width for TaskIdBadge */
	.th-task, .td-task { width: 210px; }
	.th-title, .td-title { width: auto; }
	.th-actions, .td-actions { width: 80px; text-align: right; }

	.tasks-table td {
		padding: 0.75rem 1rem;
		vertical-align: top;
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.task-row {
		transition: background 0.15s;
		cursor: pointer;
	}

	.task-row:hover {
		background: oklch(0.20 0.01 250);
	}

	/* Task info */
	.task-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.task-title {
		font-size: 0.8125rem;
		color: oklch(0.88 0.02 250);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.task-description {
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
		margin-top: 0.375rem;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* Actions column - center the rocket button */
	.td-actions {
		text-align: center;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.th-task {
			width: 60%;
		}

		.th-actions {
			width: 40%;
		}
	}
</style>
