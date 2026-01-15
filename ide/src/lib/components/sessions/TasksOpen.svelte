<script lang="ts">
	/**
	 * TasksOpen Component
	 *
	 * Displays open tasks that are ready to spawn with a rocket button.
	 * Used on /tasks2 page below the active sessions section.
	 */

	import TaskIdBadge from '$lib/components/TaskIdBadge.svelte';
	import { getProjectColor } from '$lib/utils/projectColors';

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
		onSpawnTask = () => {},
		onRetry = () => {},
		onTaskClick = () => {}
	}: {
		tasks: Task[];
		loading: boolean;
		error: string | null;
		spawningTaskId: string | null;
		projectColors: Record<string, string>;
		onSpawnTask: (task: Task) => void;
		onRetry: () => void;
		onTaskClick: (taskId: string) => void;
	} = $props();

	function handleRowClick(taskId: string) {
		onTaskClick(taskId);
	}

	// Derived: open tasks sorted by priority
	const sortedOpenTasks = $derived(
		tasks
			.filter(t => t.status === 'open')
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

<section class="open-tasks-section">
	<div class="section-header">
		<h2>Open Tasks</h2>
		<span class="task-count">{sortedOpenTasks.length}</span>
	</div>

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
					{#each sortedOpenTasks as task (task.id)}
						{@const projectColor = getProjectColorReactive(task.id)}
						{@const isBlocked = hasUnresolvedBlockers(task)}
						{@const blockReason = isBlocked ? getBlockingReason(task) : ''}
						{@const unresolvedBlockers = task.depends_on?.filter(d => d.status !== 'closed') || []}
						{@const blockedTasks = blockedByMap.get(task.id) || []}
						<tr
							class="task-row {isBlocked ? 'opacity-70' : ''}"
							style={projectColor ? `border-left: 3px solid ${projectColor};` : ''}
							onclick={() => handleRowClick(task.id)}
						>
							<td class="td-task">
								<TaskIdBadge
									{task}
									size="xs"
									variant="projectPill"
									showType={true}
									blockedBy={unresolvedBlockers}
									blocks={blockedTasks}
									showDependencies={true}
									onOpenTask={handleRowClick}
								/>
							</td>
							<td class="td-title">
								<span class="task-title" title={task.title}>
									{task.title}
								</span>
								{#if task.description}
									<div class="task-description">
										{task.description}
									</div>
								{/if}
							</td>
							<td class="td-actions">
								<button
									class="btn btn-xs btn-ghost hover:btn-primary rocket-btn {spawningTaskId === task.id ? 'rocket-launching' : ''}"
									onclick={(e) => { e.stopPropagation(); onSpawnTask(task); }}
									disabled={spawningTaskId === task.id || isBlocked}
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

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
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
	.th-task, .td-task { width: 200px; }
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
