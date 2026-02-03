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
	import AgentSelector from '$lib/components/agents/AgentSelector.svelte';

	interface AgentSelection {
		agentId: string | null;
		model: string | null;
	}

	interface Epic {
		id: string;
		title: string;
		status: string;
		priority: number;
	}

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
		onTaskClick = () => {},
		onAddTask = null
	}: {
		tasks: Task[];
		loading: boolean;
		error: string | null;
		spawningTaskId: string | null;
		projectColors: Record<string, string>;
		showHeader?: boolean;
		onSpawnTask: (task: Task, selection?: AgentSelection) => void;
		onRetry: () => void;
		onTaskClick: (taskId: string) => void;
		onAddTask?: (() => void) | null;
	} = $props();

	// Alt key tracking for agent picker
	let altKeyHeld = $state(false);
	let agentPickerOpen = $state(false);
	let agentPickerTask = $state<Task | null>(null);
	// Position for fixed-positioned agent picker (to escape overflow containers)
	// Uses bottom/left to drop up and to the left for better visibility
	let agentPickerPosition = $state<{ bottom: number; left: number } | null>(null);

	// Track Alt key state for visual feedback
	$effect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') {
				altKeyHeld = true;
			}
		}
		function handleKeyUp(e: KeyboardEvent) {
			if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') {
				altKeyHeld = false;
			}
		}
		// Reset when window loses focus
		function handleBlur() {
			altKeyHeld = false;
		}

		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);
		window.addEventListener('blur', handleBlur);

		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
			window.removeEventListener('blur', handleBlur);
		};
	});

	function handleSpawnClick(task: Task, event: MouseEvent) {
		event.stopPropagation();

		// Alt+click opens agent selector
		if (event.altKey) {
			// Calculate fixed position from button - drop up and to the left
			const button = event.currentTarget as HTMLElement;
			const rect = button.getBoundingClientRect();
			// Position to the left, but ensure it stays within viewport
			const preferredLeft = rect.left - 280; // AgentSelector is ~320px wide
			const safeLeft = Math.max(8, preferredLeft); // At least 8px from left edge
			agentPickerPosition = {
				bottom: window.innerHeight - rect.top + 4, // 4px gap above button
				left: safeLeft
			};
			agentPickerTask = task;
			agentPickerOpen = true;
			return;
		}

		// Quick spawn with default agent
		onSpawnTask(task);
	}

	function handleAgentSelect(selection: AgentSelection) {
		if (agentPickerTask) {
			onSpawnTask(agentPickerTask, selection);
		}
		agentPickerOpen = false;
		agentPickerTask = null;
		agentPickerPosition = null;
	}

	function handleAgentPickerCancel() {
		agentPickerOpen = false;
		agentPickerTask = null;
		agentPickerPosition = null;
	}

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

	// === Context Menu ===
	let contextMenu = $state<{ x: number; y: number; task: Task } | null>(null);
	let statusSubmenuOpen = $state(false);
	let epicSubmenuOpen = $state(false);
	let epics = $state<Epic[]>([]);
	let epicsLoading = $state(false);

	function handleContextMenu(task: Task, event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();

		// Calculate position with viewport bounds clamping
		const menuWidth = 200;
		const menuHeight = 280;
		let x = event.clientX;
		let y = event.clientY;

		if (x + menuWidth > window.innerWidth) {
			x = window.innerWidth - menuWidth - 8;
		}
		if (y + menuHeight > window.innerHeight) {
			y = window.innerHeight - menuHeight - 8;
		}

		contextMenu = { x, y, task };
		statusSubmenuOpen = false;
		epicSubmenuOpen = false;
	}

	function closeContextMenu() {
		contextMenu = null;
		statusSubmenuOpen = false;
		epicSubmenuOpen = false;
	}

	// Close context menu on click outside or Escape
	$effect(() => {
		if (!contextMenu) return;

		function handleClick() {
			closeContextMenu();
		}
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === 'Escape') closeContextMenu();
		}

		// Defer adding listener to avoid immediate close from the right-click itself
		const timer = setTimeout(() => {
			document.addEventListener('click', handleClick);
			document.addEventListener('keydown', handleKeyDown);
		}, 0);

		return () => {
			clearTimeout(timer);
			document.removeEventListener('click', handleClick);
			document.removeEventListener('keydown', handleKeyDown);
		};
	});

	// Context menu actions
	async function handleChangeStatus(taskId: string, newStatus: string) {
		closeContextMenu();
		try {
			const response = await fetch(`/api/tasks/${taskId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: newStatus })
			});
			if (response.ok) {
				onRetry(); // Refresh task list
			}
		} catch (err) {
			console.error('Failed to update task status:', err);
		}
	}

	async function fetchEpics(projectName: string) {
		if (!projectName) return;
		epicsLoading = true;
		try {
			const response = await fetch(`/api/epics?project=${projectName}`);
			if (response.ok) {
				const data = await response.json();
				epics = data.epics || [];
			}
		} catch (err) {
			console.error('Failed to fetch epics:', err);
		} finally {
			epicsLoading = false;
		}
	}

	async function handleLinkToEpic(taskId: string, epicId: string) {
		closeContextMenu();
		try {
			const response = await fetch(`/api/tasks/${taskId}/epic`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ epicId })
			});
			if (response.ok) {
				onRetry(); // Refresh task list
			}
		} catch (err) {
			console.error('Failed to link task to epic:', err);
		}
	}

	async function handleDuplicateTask(task: Task) {
		closeContextMenu();
		const projectName = getProjectFromTaskId(task.id);
		try {
			const response = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: task.title,
					description: task.description || '',
					priority: task.priority,
					type: task.issue_type || 'task',
					project: projectName,
					labels: task.labels?.join(',') || ''
				})
			});
			if (response.ok) {
				onRetry(); // Refresh task list
			}
		} catch (err) {
			console.error('Failed to duplicate task:', err);
		}
	}

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
			{#if onAddTask}
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<div class="add-task-button" onclick={onAddTask}>
					<div class="add-task-icon">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
						</svg>
					</div>
					<span class="add-task-label">add task</span>
				</div>
			{:else}
				<span>No open tasks</span>
			{/if}
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
							oncontextmenu={(e) => !isExiting && handleContextMenu(task, e)}
						>
							<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
							<td class="td-task" style={isExiting ? 'background: transparent;' : ''} onclick={(e) => e.stopPropagation()}>
								<div class="task-cell-content">
									<div class="agent-badge-row mx-2">
										<TaskIdBadge
											{task}
											size="sm"
											variant="agentPill"
											onClick={() => !isExiting && handleRowClick(task.id)}
											animate={isNew}
										/>
									</div>
								</div>
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
								<div class="relative flex items-center justify-center">
									<!-- Agent picker dropdown (shown when Alt+click) -->
									{#if agentPickerOpen && agentPickerTask?.id === task.id && agentPickerPosition}
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<!-- Backdrop -->
										<div class="fixed inset-0 z-40" onclick={handleAgentPickerCancel}></div>
										<!-- Agent selector with fixed positioning to escape overflow containers -->
										<!-- Drops up and to the left for better visibility -->
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<div
											class="fixed z-50"
											style="bottom: {agentPickerPosition.bottom}px; left: {agentPickerPosition.left}px;"
											onclick={(e) => e.stopPropagation()}
										>
											<AgentSelector
												task={task}
												onselect={handleAgentSelect}
												oncancel={handleAgentPickerCancel}
											/>
										</div>
									{/if}
									<button
										class="btn btn-xs {altKeyHeld ? 'btn-info' : 'btn-ghost hover:btn-primary'} rocket-btn {spawningTaskId === task.id ? 'rocket-launching' : ''} transition-colors duration-150"
										onclick={(e) => handleSpawnClick(task, e)}
										disabled={spawningTaskId === task.id || isBlocked || isExiting}
										title={altKeyHeld ? 'Click to choose agent/model' : (isBlocked ? blockReason : 'Launch agent (Alt+click for agent picker)')}
									>
										{#if altKeyHeld}
											<!-- Settings/gear icon when Alt is held -->
											<div class="w-5 h-5 flex items-center justify-center">
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
													<path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
													<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
												</svg>
											</div>
										{:else}
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
										{/if}
									</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<!-- Context Menu -->
{#if contextMenu}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="task-context-menu"
		style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
		onclick={(e) => e.stopPropagation()}
	>
		<!-- Launch -->
		<button class="task-context-menu-item" onmouseenter={() => { statusSubmenuOpen = false; epicSubmenuOpen = false; }} onclick={() => { const t = contextMenu!.task; closeContextMenu(); onSpawnTask(t); }}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M12 2C12 2 8 6 8 12C8 15 9 17 10 18L10 21C10 21.5 10.5 22 11 22H13C13.5 22 14 21.5 14 21L14 18C15 17 16 15 16 12C16 6 12 2 12 2Z" />
				<circle cx="12" cy="10" r="2" />
			</svg>
			<span>Launch</span>
		</button>

		<!-- View Details -->
		<button class="task-context-menu-item" onmouseenter={() => { statusSubmenuOpen = false; epicSubmenuOpen = false; }} onclick={() => { const id = contextMenu!.task.id; closeContextMenu(); onTaskClick(id); }}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
				<circle cx="12" cy="12" r="3" />
			</svg>
			<span>View Details</span>
		</button>

		<div class="task-context-menu-divider"></div>

		<!-- Change Status (submenu) -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="task-context-menu-submenu-container"
			onmouseenter={() => { statusSubmenuOpen = true; epicSubmenuOpen = false; }}
			onmouseleave={() => { statusSubmenuOpen = false; }}
		>
			<button class="task-context-menu-item task-context-menu-item-has-submenu">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
					<polyline points="22 4 12 14.01 9 11.01" />
				</svg>
				<span>Change Status</span>
				<svg class="task-context-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="9 18 15 12 9 6" />
				</svg>
			</button>
			{#if statusSubmenuOpen}
				<div class="task-context-submenu">
					{#each [
						{ value: 'open', label: 'Open', color: 'oklch(0.70 0.15 220)' },
						{ value: 'in_progress', label: 'In Progress', color: 'oklch(0.75 0.15 85)' },
						{ value: 'blocked', label: 'Blocked', color: 'oklch(0.65 0.18 30)' },
						{ value: 'closed', label: 'Closed', color: 'oklch(0.65 0.18 145)' }
					] as status}
						<button
							class="task-context-menu-item {contextMenu!.task.status === status.value ? 'task-context-menu-item-active' : ''}"
							onclick={() => handleChangeStatus(contextMenu!.task.id, status.value)}
						>
							<span class="task-status-dot" style="background: {status.color};"></span>
							<span>{status.label}</span>
							{#if contextMenu!.task.status === status.value}
								<svg class="task-context-menu-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
									<polyline points="20 6 9 17 4 12" />
								</svg>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Assign to Epic (submenu) -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="task-context-menu-submenu-container"
			onmouseenter={() => { epicSubmenuOpen = true; statusSubmenuOpen = false; if (contextMenu) { const p = getProjectFromTaskId(contextMenu.task.id); fetchEpics(p); } }}
			onmouseleave={() => { epicSubmenuOpen = false; }}
		>
			<button class="task-context-menu-item task-context-menu-item-has-submenu">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
				</svg>
				<span>Assign to Epic</span>
				<svg class="task-context-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="9 18 15 12 9 6" />
				</svg>
			</button>
			{#if epicSubmenuOpen}
				<div class="task-context-submenu task-context-submenu-epic">
					{#if epicsLoading}
						<div class="task-context-menu-loading">Loading...</div>
					{:else if epics.length === 0}
						<div class="task-context-menu-empty">No epics found</div>
					{:else}
						{#each epics as epic}
							<button
								class="task-context-menu-item"
								onclick={() => handleLinkToEpic(contextMenu!.task.id, epic.id)}
							>
								<span class="task-epic-id">{epic.id}</span>
								<span class="task-epic-title">{epic.title}</span>
							</button>
						{/each}
					{/if}
				</div>
			{/if}
		</div>

		<div class="task-context-menu-divider"></div>

		<!-- Duplicate -->
		<button class="task-context-menu-item" onmouseenter={() => { statusSubmenuOpen = false; epicSubmenuOpen = false; }} onclick={() => handleDuplicateTask(contextMenu!.task)}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
				<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
			</svg>
			<span>Duplicate</span>
		</button>

		<!-- Close Task -->
		<button class="task-context-menu-item task-context-menu-item-danger" onmouseenter={() => { statusSubmenuOpen = false; epicSubmenuOpen = false; }} onclick={() => handleChangeStatus(contextMenu!.task.id, 'closed')}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="10" />
				<line x1="15" y1="9" x2="9" y2="15" />
				<line x1="9" y1="9" x2="15" y2="15" />
			</svg>
			<span>Close Task</span>
		</button>
	</div>
{/if}

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

	/* Add task button - matches mockup design */
	.add-task-button {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		width: 220px;
		height: 160px;
		margin: 0 auto;
		border: 2px dashed oklch(0.60 0.15 50);
		border-radius: 0.5rem;
		cursor: pointer;
		transition: all 0.2s ease;
		background: transparent;
	}

	.add-task-button:hover {
		border-color: oklch(0.70 0.18 50);
		background: oklch(0.70 0.18 50 / 0.08);
	}

	.add-task-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 80px;
		height: 80px;
		border: 2px solid oklch(0.60 0.15 50);
		border-radius: 0.375rem;
		color: oklch(0.65 0.15 50);
		transition: all 0.2s ease;
	}

	.add-task-button:hover .add-task-icon {
		border-color: oklch(0.70 0.18 50);
		color: oklch(0.75 0.18 50);
	}

	.add-task-icon svg {
		width: 40px;
		height: 40px;
	}

	.add-task-label {
		font-size: 1rem;
		font-weight: 500;
		color: oklch(0.65 0.15 50);
		transition: color 0.2s ease;
	}

	.add-task-button:hover .add-task-label {
		color: oklch(0.75 0.18 50);
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
	.th-task, .td-task { width: min-content; white-space: nowrap; text-align: center; }
	.th-title, .td-title { width: auto; padding-right: 2rem; }
	.th-actions, .td-actions { width: 80px; text-align: right; }

	.tasks-table td {
		padding: 0.75rem 1rem;
		vertical-align: middle;
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.task-row {
		transition: background 0.15s;
		cursor: pointer;
	}

	.task-row:hover {
		background: oklch(0.20 0.01 250);
	}

	/* Task cell content - matches TasksActive structure */
	.task-cell-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		width: 100%;
	}

	.agent-badge-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
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

	/* === Context Menu (matches FileTree styling) === */
	.task-context-menu {
		position: fixed;
		z-index: 100;
		min-width: 180px;
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.5rem;
		padding: 0.375rem;
		box-shadow: 0 10px 30px oklch(0.05 0 0 / 0.5);
		animation: contextMenuIn 0.1s ease;
	}

	@keyframes contextMenuIn {
		from { opacity: 0; transform: scale(0.95); }
		to { opacity: 1; transform: scale(1); }
	}

	.task-context-menu-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: none;
		background: transparent;
		color: oklch(0.80 0.02 250);
		font-size: 0.8125rem;
		text-align: left;
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.1s ease;
	}

	.task-context-menu-item:hover {
		background: oklch(0.25 0.02 250);
	}

	.task-context-menu-item svg {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
		color: oklch(0.60 0.02 250);
	}

	.task-context-menu-item:hover svg {
		color: oklch(0.75 0.02 250);
	}

	.task-context-menu-item-danger:hover {
		background: oklch(0.55 0.15 30 / 0.2);
		color: oklch(0.75 0.18 30);
	}

	.task-context-menu-item-danger:hover svg {
		color: oklch(0.70 0.18 30);
	}

	.task-context-menu-divider {
		height: 1px;
		background: oklch(0.28 0.02 250);
		margin: 0.375rem 0;
	}

	/* Submenu container and panel */
	.task-context-menu-submenu-container {
		position: relative;
	}

	.task-context-submenu {
		position: absolute;
		left: 100%;
		top: 0;
		min-width: 150px;
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.5rem;
		padding: 0.375rem;
		box-shadow: 0 10px 30px oklch(0.05 0 0 / 0.5);
		animation: contextMenuIn 0.1s ease;
		margin-left: 2px;
	}

	.task-context-submenu-epic {
		min-width: 220px;
		max-height: 240px;
		overflow-y: auto;
	}

	/* Chevron for submenu indicators */
	.task-context-menu-chevron {
		width: 12px !important;
		height: 12px !important;
		margin-left: auto;
		color: oklch(0.50 0.02 250) !important;
	}

	/* Status dot */
	.task-status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	/* Active status indicator (checkmark) */
	.task-context-menu-item-active {
		color: oklch(0.85 0.02 250);
	}

	.task-context-menu-check {
		width: 14px !important;
		height: 14px !important;
		margin-left: auto;
		color: oklch(0.70 0.15 145) !important;
	}

	/* Epic item styling */
	.task-epic-id {
		font-size: 0.6875rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		color: oklch(0.60 0.02 250);
		flex-shrink: 0;
	}

	.task-epic-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Loading and empty states in submenu */
	.task-context-menu-loading,
	.task-context-menu-empty {
		padding: 0.5rem 0.75rem;
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
		text-align: center;
	}
</style>
