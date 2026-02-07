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
	import { bulkApiOperation, fetchWithTimeout, createDeleteRequest, handleApiError, formatBulkResultMessage } from '$lib/utils/bulkApiHelpers';
	import { isHumanTask } from '$lib/utils/badgeHelpers';
	import { AGENT_PRESETS } from '$lib/types/agentProgram';
	import ProviderLogo from '$lib/components/agents/ProviderLogo.svelte';

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

	// === Bulk Selection ===
	let selectedTasks = $state<Set<string>>(new Set());
	let lastClickedTaskId = $state<string | null>(null);
	let bulkActionLoading = $state(false);
	let bulkActionError = $state('');
	let priorityDropdownOpen = $state(false);
	let harnessDropdownOpen = $state(false);

	// === Single-task Harness Picker ===
	let harnessPickerTaskId = $state<string | null>(null);
	let harnessPickerPos = $state({ x: 0, y: 0 });

	const selectionCount = $derived(selectedTasks.size);
	const allVisibleSelected = $derived.by(() => {
		const visible = orderedTasks().filter(e => !e.isExiting);
		return visible.length > 0 && visible.every(e => selectedTasks.has(e.task.id));
	});
	const someVisibleSelected = $derived.by(() => {
		const visible = orderedTasks().filter(e => !e.isExiting);
		return visible.some(e => selectedTasks.has(e.task.id)) && !allVisibleSelected;
	});

	// Clean up stale selections when tasks change
	$effect(() => {
		const openIds = new Set(tasks.filter(t => t.status === 'open').map(t => t.id));
		const stale = [...selectedTasks].filter(id => !openIds.has(id));
		if (stale.length > 0) {
			const next = new Set(selectedTasks);
			for (const id of stale) next.delete(id);
			selectedTasks = next;
		}
	});

	function toggleTask(taskId: string, event?: MouseEvent) {
		const visible = orderedTasks().filter(e => !e.isExiting);
		if (event?.shiftKey && lastClickedTaskId) {
			const ids = visible.map(e => e.task.id);
			const a = ids.indexOf(lastClickedTaskId);
			const b = ids.indexOf(taskId);
			if (a !== -1 && b !== -1) {
				const [start, end] = a < b ? [a, b] : [b, a];
				const next = new Set(selectedTasks);
				for (let i = start; i <= end; i++) next.add(ids[i]);
				selectedTasks = next;
				lastClickedTaskId = taskId;
				return;
			}
		}
		const next = new Set(selectedTasks);
		if (next.has(taskId)) {
			next.delete(taskId);
		} else {
			next.add(taskId);
		}
		selectedTasks = next;
		lastClickedTaskId = taskId;
	}

	function toggleAllVisible() {
		const visible = orderedTasks().filter(e => !e.isExiting).map(e => e.task.id);
		const allSelected = visible.length > 0 && visible.every(id => selectedTasks.has(id));
		if (allSelected) {
			selectedTasks = new Set();
		} else {
			selectedTasks = new Set(visible);
		}
	}

	function clearSelection() {
		selectedTasks = new Set();
		lastClickedTaskId = null;
		priorityDropdownOpen = false;
		harnessDropdownOpen = false;
	}

	async function handleBulkDelete() {
		const ids = [...selectedTasks];
		if (ids.length === 0) return;
		if (!confirm(`Delete ${ids.length} task${ids.length > 1 ? 's' : ''}? This cannot be undone.`)) return;
		bulkActionLoading = true;
		bulkActionError = '';
		try {
			const result = await bulkApiOperation(ids, async (taskId) => {
				const response = await fetchWithTimeout(`/api/tasks/${taskId}`, createDeleteRequest());
				if (!response.ok) {
					throw new Error(await handleApiError(response, `delete task ${taskId}`));
				}
			});
			if (!result.success) {
				bulkActionError = formatBulkResultMessage(result, 'task');
			}
			clearSelection();
			onRetry();
		} catch (err) {
			bulkActionError = err instanceof Error ? err.message : String(err);
		} finally {
			bulkActionLoading = false;
		}
	}

	async function handleBulkClose() {
		const ids = [...selectedTasks];
		if (ids.length === 0) return;
		if (!confirm(`Close ${ids.length} task${ids.length > 1 ? 's' : ''}?`)) return;
		bulkActionLoading = true;
		bulkActionError = '';
		try {
			const result = await bulkApiOperation(ids, async (taskId) => {
				const response = await fetchWithTimeout(`/api/tasks/${taskId}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ status: 'closed' })
				});
				if (!response.ok) {
					throw new Error(await handleApiError(response, `close task ${taskId}`));
				}
			});
			if (!result.success) {
				bulkActionError = formatBulkResultMessage(result, 'task');
			}
			clearSelection();
			onRetry();
		} catch (err) {
			bulkActionError = err instanceof Error ? err.message : String(err);
		} finally {
			bulkActionLoading = false;
		}
	}

	async function handleBulkSpawn() {
		const ids = [...selectedTasks];
		if (ids.length === 0) return;
		if (!confirm(`Spawn ${ids.length} agent${ids.length > 1 ? 's' : ''}? One per selected task.`)) return;
		bulkActionLoading = true;
		bulkActionError = '';
		try {
			for (const taskId of ids) {
				const task = tasks.find(t => t.id === taskId);
				if (task) onSpawnTask(task);
			}
			clearSelection();
		} catch (err) {
			bulkActionError = err instanceof Error ? err.message : String(err);
		} finally {
			bulkActionLoading = false;
		}
	}

	async function handleDeleteTask(taskId: string) {
		closeContextMenu();
		if (!confirm(`Delete task ${taskId}? This cannot be undone.`)) return;
		try {
			const response = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
			if (response.ok) {
				onRetry();
			}
		} catch (err) {
			console.error('Failed to delete task:', err);
		}
	}

	/** Extract harness from task labels (e.g., 'harness:codex-cli' → 'codex-cli') */
	function getTaskHarness(task: Task): string {
		if (!task.labels) return 'claude-code';
		const harnessLabel = task.labels.find(l => l.startsWith('harness:'));
		return harnessLabel ? harnessLabel.replace('harness:', '') : 'claude-code';
	}

	async function handleBulkPriority(priority: number) {
		const ids = [...selectedTasks];
		if (ids.length === 0) return;
		priorityDropdownOpen = false;
		bulkActionLoading = true;
		bulkActionError = '';
		try {
			const result = await bulkApiOperation(ids, async (taskId) => {
				const response = await fetchWithTimeout(`/api/tasks/${taskId}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ priority })
				});
				if (!response.ok) {
					throw new Error(await handleApiError(response, `update priority for ${taskId}`));
				}
			});
			if (!result.success) {
				bulkActionError = formatBulkResultMessage(result, 'task');
			}
			clearSelection();
			onRetry();
		} catch (err) {
			bulkActionError = err instanceof Error ? err.message : String(err);
		} finally {
			bulkActionLoading = false;
		}
	}

	async function handleBulkHarness(agentId: string) {
		const ids = [...selectedTasks];
		if (ids.length === 0) return;
		harnessDropdownOpen = false;
		bulkActionLoading = true;
		bulkActionError = '';
		try {
			const result = await bulkApiOperation(ids, async (taskId) => {
				const task = tasks.find(t => t.id === taskId);
				if (!task) return;
				// Remove existing harness: labels, add new one (or remove if default)
				const otherLabels = (task.labels || []).filter(l => !l.startsWith('harness:'));
				const newLabels = agentId === 'claude-code' ? otherLabels : [...otherLabels, `harness:${agentId}`];
				const response = await fetchWithTimeout(`/api/tasks/${taskId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ labels: newLabels.join(',') })
				});
				if (!response.ok) {
					throw new Error(await handleApiError(response, `update harness for ${taskId}`));
				}
			});
			if (!result.success) {
				bulkActionError = formatBulkResultMessage(result, 'task');
			}
			clearSelection();
			onRetry();
		} catch (err) {
			bulkActionError = err instanceof Error ? err.message : String(err);
		} finally {
			bulkActionLoading = false;
		}
	}

	async function handleSingleHarnessChange(taskId: string, agentId: string) {
		harnessPickerTaskId = null;
		const task = tasks.find(t => t.id === taskId);
		if (!task) return;
		const otherLabels = (task.labels || []).filter(l => !l.startsWith('harness:'));
		const newLabels = agentId === 'claude-code'
			? otherLabels
			: [...otherLabels, `harness:${agentId}`];
		try {
			const resp = await fetchWithTimeout(`/api/tasks/${taskId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ labels: newLabels.join(',') })
			});
			if (!resp.ok) {
				console.error('Failed to update harness:', resp.status, await resp.text());
			}
		} catch (err) {
			console.error('Failed to update harness:', err);
		}
		onRetry();
	}

	// Close single-task harness picker on Escape key
	$effect(() => {
		if (!harnessPickerTaskId) return;

		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === 'Escape') harnessPickerTaskId = null;
		}

		document.addEventListener('keydown', handleKeyDown);

		return () => {
			document.removeEventListener('keydown', handleKeyDown);
		};
	});

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
	// Separate visibility from task data so DOM persists after first use (no re-creation)
	let ctxTask = $state<Task | null>(null);
	let ctxX = $state(0);
	let ctxY = $state(0);
	let ctxVisible = $state(false);
	let statusSubmenuOpen = $state(false);
	let epicSubmenuOpen = $state(false);
	let epics = $state<Epic[]>([]);
	let epicsLoading = $state(false);
	let showCreateEpic = $state(false);
	let newEpicTitle = $state('');
	let creatingEpic = $state(false);
	let newEpicInput: HTMLInputElement;

	function handleContextMenu(task: Task, event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();

		// Calculate position with viewport bounds clamping
		const menuWidth = 200;
		const menuHeight = 280;

		ctxTask = task;
		ctxX = Math.min(event.clientX, window.innerWidth - menuWidth - 8);
		ctxY = Math.min(event.clientY, window.innerHeight - menuHeight - 8);
		ctxVisible = true;
		statusSubmenuOpen = false;
		epicSubmenuOpen = false;
	}

	function closeContextMenu() {
		ctxVisible = false;
		statusSubmenuOpen = false;
		epicSubmenuOpen = false;
		showCreateEpic = false;
		newEpicTitle = '';
		// Note: ctxTask is intentionally NOT cleared so the DOM persists
	}

	// Close context menu on click outside or Escape
	$effect(() => {
		if (!ctxVisible) return;

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

	// Close floating bar dropdowns on click outside
	$effect(() => {
		if (!priorityDropdownOpen && !harnessDropdownOpen) return;

		function handleClickOutside(e: MouseEvent) {
			const target = e.target as HTMLElement;
			if (!target.closest('.floating-dropdown-wrapper')) {
				priorityDropdownOpen = false;
				harnessDropdownOpen = false;
			}
		}

		const timer = setTimeout(() => {
			document.addEventListener('click', handleClickOutside);
		}, 0);

		return () => {
			clearTimeout(timer);
			document.removeEventListener('click', handleClickOutside);
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

	async function handleCreateEpic() {
		if (!ctxTask || creatingEpic || !newEpicTitle.trim()) return;
		creatingEpic = true;
		try {
			const project = getProjectFromTaskId(ctxTask.id);
			const response = await fetch('/api/epics', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: newEpicTitle.trim(),
					project,
					linkTaskId: ctxTask.id
				})
			});
			if (response.ok) {
				newEpicTitle = '';
				showCreateEpic = false;
				closeContextMenu();
				onRetry();
			}
		} catch (err) {
			console.error('Failed to create epic:', err);
		} finally {
			creatingEpic = false;
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

<section class="open-tasks-section" class:no-header={!showHeader} class:has-selection={selectionCount > 0}>
	{#if showHeader}
		<div class="section-header">
			<h2>Open Tasks</h2>
			<span class="task-count">{sortedOpenTasks.length}</span>
			{#if selectionCount > 0}
				<span class="selection-count">{selectionCount} selected</span>
				<button type="button" class="selection-clear-btn" onclick={clearSelection}>Clear</button>
			{/if}

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
		{#if bulkActionError}
			<div class="bulk-error">
				<span>{bulkActionError}</span>
				<button type="button" onclick={() => bulkActionError = ''}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
						<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>
		{/if}
		<div class="tasks-table-wrapper">
			<table class="tasks-table" onmousedown={(e) => { if (e.shiftKey) e.preventDefault(); }}>
				<thead>
					<tr>
						<th class="th-checkbox">
							<input
								type="checkbox"
								class="bulk-checkbox select-all-checkbox"
								checked={allVisibleSelected}
								indeterminate={someVisibleSelected}
								onclick={(e) => { e.stopPropagation(); toggleAllVisible(); }}
							/>
						</th>
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
						{@const isSelected = selectedTasks.has(task.id)}
						{@const harness = getTaskHarness(task)}
						<tr
							class="task-row {isBlocked && !isExiting ? 'opacity-70' : ''} {isNew ? 'animate-slide-in-fwd-center' : ''} {isExiting ? 'animate-slide-out-bck-center' : ''} {isSelected ? 'selected-row' : ''}"
							style="{projectColor ? `border-left: 3px solid ${projectColor};` : ''}{isExiting ? ' pointer-events: none;' : ''}"
							onclick={() => !isExiting && handleRowClick(task.id)}
							oncontextmenu={(e) => !isExiting && handleContextMenu(task, e)}
						>
							<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
							<td class="td-checkbox" style={isExiting ? 'background: transparent;' : ''} onclick={(e) => { e.stopPropagation(); toggleTask(task.id, e); }}>
								<input
									type="checkbox"
									class="bulk-checkbox"
									checked={isSelected}
									style="pointer-events: none;"
								/>
							</td>
							<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
							<td class="td-task" style={isExiting ? 'background: transparent;' : ''} onclick={(e) => e.stopPropagation()}>
								<div class="task-cell-content">
									<div class="agent-badge-row">
										<TaskIdBadge
											{task}
											size="sm"
											variant="agentPill"
											onClick={() => !isExiting && handleRowClick(task.id)}
											animate={isNew}
											{harness}
											onHarnessClick={(e) => {
												harnessPickerTaskId = task.id;
												harnessPickerPos = { x: e.clientX, y: e.clientY };
											}}
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
									{#if isHumanTask(task)}
										<!-- Human task: show person icon (unclickable) instead of rocket -->
										<div
											class="w-7 h-7 flex items-center justify-center opacity-50 cursor-default"
											title="Human task — complete manually"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4" style="color: oklch(0.70 0.18 45);">
												<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
											</svg>
										</div>
									{:else}
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
									{/if}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<!-- Floating Action Bar -->
{#if selectionCount > 0}
	<div class="floating-action-bar" transition:fade={{ duration: 150 }}>
		<span class="floating-count">{selectionCount} selected</span>
		<div class="floating-divider"></div>
		<button type="button" class="floating-btn floating-btn-spawn" onclick={handleBulkSpawn} disabled={bulkActionLoading}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
				<path d="M12 2C12 2 8 6 8 12C8 15 9 17 10 18L10 21C10 21.5 10.5 22 11 22H13C13.5 22 14 21.5 14 21L14 18C15 17 16 15 16 12C16 6 12 2 12 2Z" />
				<circle cx="12" cy="10" r="2" />
			</svg>
			Spawn
		</button>
		<button type="button" class="floating-btn floating-btn-close" onclick={handleBulkClose} disabled={bulkActionLoading}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
				<circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
			</svg>
			Close
		</button>
		<button type="button" class="floating-btn floating-btn-delete" onclick={handleBulkDelete} disabled={bulkActionLoading}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
				<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
			</svg>
			Delete
		</button>
		<div class="floating-divider"></div>
		<!-- Priority dropdown -->
		<div class="floating-dropdown-wrapper" onclick={(e) => e.stopPropagation()}>
			<button type="button" class="floating-btn floating-btn-priority" onclick={() => { priorityDropdownOpen = !priorityDropdownOpen; harnessDropdownOpen = false; }} disabled={bulkActionLoading}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
					<path d="M3 3v18h18" /><path d="M18 9l-5-6-4 4-4 2" />
				</svg>
				Priority
			</button>
			{#if priorityDropdownOpen}
				<div class="floating-dropdown" transition:fade={{ duration: 100 }}>
					{#each [
						{ p: 0, label: 'P0 Critical', color: 'oklch(0.75 0.18 25)' },
						{ p: 1, label: 'P1 High', color: 'oklch(0.80 0.15 85)' },
						{ p: 2, label: 'P2 Medium', color: 'oklch(0.75 0.12 200)' },
						{ p: 3, label: 'P3 Low', color: 'oklch(0.65 0.02 250)' },
						{ p: 4, label: 'P4 Lowest', color: 'oklch(0.55 0.02 250)' }
					] as item}
						<button class="floating-dropdown-item" onclick={() => handleBulkPriority(item.p)}>
							<span class="floating-priority-dot" style="background: {item.color};"></span>
							{item.label}
						</button>
					{/each}
				</div>
			{/if}
		</div>
		<!-- Harness dropdown -->
		<div class="floating-dropdown-wrapper" onclick={(e) => e.stopPropagation()}>
			<button type="button" class="floating-btn floating-btn-harness" onclick={() => { harnessDropdownOpen = !harnessDropdownOpen; priorityDropdownOpen = false; }} disabled={bulkActionLoading}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
					<path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
					<circle cx="12" cy="12" r="3" />
				</svg>
				Harness
			</button>
			{#if harnessDropdownOpen}
				<div class="floating-dropdown" transition:fade={{ duration: 100 }}>
					{#each AGENT_PRESETS as preset}
						<button class="floating-dropdown-item" onclick={() => handleBulkHarness(preset.id)}>
							<ProviderLogo agentId={preset.id} size={14} />
							<span>{preset.name}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
		<div class="floating-divider"></div>
		<button type="button" class="floating-btn floating-btn-clear" onclick={clearSelection} disabled={bulkActionLoading}>
			Clear
		</button>
		{#if bulkActionLoading}
			<div class="floating-spinner"></div>
		{/if}
	</div>
{/if}

<!-- Context Menu -->
{#if ctxTask}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="task-context-menu"
		class:task-context-menu-hidden={!ctxVisible}
		style="left: {ctxX}px; top: {ctxY}px;"
		onclick={(e) => e.stopPropagation()}
	>
		<!-- Launch -->
		<button class="task-context-menu-item" onmouseenter={() => { statusSubmenuOpen = false; epicSubmenuOpen = false; }} onclick={() => { const t = ctxTask!; closeContextMenu(); onSpawnTask(t); ctxTask = null; }}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M12 2C12 2 8 6 8 12C8 15 9 17 10 18L10 21C10 21.5 10.5 22 11 22H13C13.5 22 14 21.5 14 21L14 18C15 17 16 15 16 12C16 6 12 2 12 2Z" />
				<circle cx="12" cy="10" r="2" />
			</svg>
			<span>Launch</span>
		</button>

		<!-- View Details -->
		<button class="task-context-menu-item" onmouseenter={() => { statusSubmenuOpen = false; epicSubmenuOpen = false; }} onclick={() => { const id = ctxTask!.id; closeContextMenu(); onTaskClick(id); ctxTask = null; }}>
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
							class="task-context-menu-item {ctxTask!.status === status.value ? 'task-context-menu-item-active' : ''}"
							onclick={() => handleChangeStatus(ctxTask!.id, status.value)}
						>
							<span class="task-status-dot" style="background: {status.color};"></span>
							<span>{status.label}</span>
							{#if ctxTask!.status === status.value}
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
			onmouseenter={() => { epicSubmenuOpen = true; statusSubmenuOpen = false; if (ctxTask) { const p = getProjectFromTaskId(ctxTask.id); fetchEpics(p); } }}
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
					{:else if epics.length === 0 && !showCreateEpic}
						<div class="task-context-menu-empty" style="padding: 0.25rem 0;">
							<span style="opacity: 0.5; font-size: 0.75rem;">No epics found</span>
						</div>
					{:else}
						{#each epics as epic}
							<button
								class="task-context-menu-item"
								onclick={() => handleLinkToEpic(ctxTask!.id, epic.id)}
							>
								<span class="task-epic-id">{epic.id}</span>
								<span class="task-epic-title">{epic.title}</span>
							</button>
						{/each}
					{/if}
					{#if !epicsLoading}
						{#if showCreateEpic}
							<div style="padding: 0.25rem 0.5rem; display: flex; gap: 0.25rem; align-items: center;">
								<!-- svelte-ignore a11y_autofocus -->
								<input
									bind:this={newEpicInput}
									bind:value={newEpicTitle}
									onkeydown={(e) => { if (e.key === 'Enter' && newEpicTitle.trim()) { e.preventDefault(); handleCreateEpic(); } else if (e.key === 'Escape') { showCreateEpic = false; newEpicTitle = ''; } }}
									placeholder="Epic title..."
									disabled={creatingEpic}
									autofocus
									class="task-epic-create-input"
								/>
								<button
									class="task-epic-create-btn"
									onclick={handleCreateEpic}
									disabled={creatingEpic || !newEpicTitle.trim()}
								>
									{#if creatingEpic}...{:else}+{/if}
								</button>
							</div>
						{:else}
							<div class="task-context-menu-divider"></div>
							<button
								class="task-context-menu-item"
								onclick={() => { showCreateEpic = true; setTimeout(() => newEpicInput?.focus(), 50); }}
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
								</svg>
								<span>Create Epic</span>
							</button>
						{/if}
					{/if}
				</div>
			{/if}
		</div>

		<div class="task-context-menu-divider"></div>

		<!-- Duplicate -->
		<button class="task-context-menu-item" onmouseenter={() => { statusSubmenuOpen = false; epicSubmenuOpen = false; }} onclick={() => handleDuplicateTask(ctxTask!)}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
				<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
			</svg>
			<span>Duplicate</span>
		</button>

		<!-- Close Task -->
		<button class="task-context-menu-item task-context-menu-item-danger" onmouseenter={() => { statusSubmenuOpen = false; epicSubmenuOpen = false; }} onclick={() => handleChangeStatus(ctxTask!.id, 'closed')}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="10" />
				<line x1="15" y1="9" x2="9" y2="15" />
				<line x1="9" y1="9" x2="15" y2="15" />
			</svg>
			<span>Close Task</span>
		</button>

		<!-- Delete Task -->
		<button class="task-context-menu-item task-context-menu-item-danger" onmouseenter={() => { statusSubmenuOpen = false; epicSubmenuOpen = false; }} onclick={() => handleDeleteTask(ctxTask!.id)}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="3 6 5 6 21 6" />
				<path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
				<line x1="10" y1="11" x2="10" y2="17" />
				<line x1="14" y1="11" x2="14" y2="17" />
			</svg>
			<span>Delete Task</span>
		</button>
	</div>
{/if}

<!-- Single-task Harness Picker -->
{#if harnessPickerTaskId}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="harness-picker-backdrop" onclick={() => harnessPickerTaskId = null}></div>
	<div class="harness-picker" style="left: {harnessPickerPos.x}px; top: {harnessPickerPos.y}px;" onclick={(e) => e.stopPropagation()}>
		{#each AGENT_PRESETS as preset}
			{@const pickerTask = tasks.find(t => t.id === harnessPickerTaskId)}
			{@const currentHarness = pickerTask ? getTaskHarness(pickerTask) : 'claude-code'}
			<button
				class="harness-picker-item {currentHarness === preset.id ? 'active' : ''}"
				onclick={() => handleSingleHarnessChange(harnessPickerTaskId!, preset.id)}
			>
				<ProviderLogo agentId={preset.id} size={16} />
				<span>{preset.name}</span>
				{#if currentHarness === preset.id}
					<svg class="w-3 h-3 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<polyline points="20 6 9 17 4 12" />
					</svg>
				{/if}
			</button>
		{/each}
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

	.task-context-menu-hidden {
		display: none;
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

	.task-epic-create-input {
		flex: 1;
		background: oklch(0.14 0.01 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 0.25rem;
		padding: 0.25rem 0.375rem;
		font-size: 0.75rem;
		color: oklch(0.90 0.02 250);
		outline: none;
	}
	.task-epic-create-input:focus {
		border-color: oklch(0.55 0.15 250);
	}
	.task-epic-create-btn {
		background: oklch(0.30 0.02 250);
		border: 1px solid oklch(0.35 0.02 250);
		border-radius: 0.25rem;
		color: oklch(0.80 0.02 250);
		font-size: 0.875rem;
		width: 1.5rem;
		height: 1.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		flex-shrink: 0;
	}
	.task-epic-create-btn:hover:not(:disabled) {
		background: oklch(0.40 0.10 145);
		border-color: oklch(0.50 0.12 145);
	}
	.task-epic-create-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	/* Loading and empty states in submenu */
	.task-context-menu-loading,
	.task-context-menu-empty {
		padding: 0.5rem 0.75rem;
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
		text-align: center;
	}

	/* === Bulk Selection === */

	/* Checkbox columns */
	.th-checkbox, .td-checkbox {
		width: 32px;
		min-width: 32px;
		max-width: 32px;
		text-align: center;
		padding: 0 !important;
	}

	.td-checkbox {
		cursor: pointer;
	}

	/* Checkbox styling */
	.bulk-checkbox {
		width: 14px;
		height: 14px;
		cursor: pointer;
		accent-color: oklch(0.70 0.18 240);
		opacity: 0;
		transition: opacity 0.15s;
	}

	/* Show checkboxes: on row hover, when checked, or when any selection active */
	.task-row:hover .bulk-checkbox,
	.bulk-checkbox:checked,
	.has-selection .bulk-checkbox {
		opacity: 1;
	}

	/* Select-all checkbox always visible when there's a selection */
	.select-all-checkbox {
		opacity: 0;
		transition: opacity 0.15s;
	}

	.has-selection .select-all-checkbox,
	.tasks-table thead:hover .select-all-checkbox {
		opacity: 1;
	}

	/* Selected row highlight */
	.selected-row {
		background: oklch(0.70 0.18 240 / 0.08) !important;
	}

	.selected-row:hover {
		background: oklch(0.70 0.18 240 / 0.12) !important;
	}

	/* Selection count badge in header */
	.selection-count {
		font-size: 0.75rem;
		font-weight: 500;
		padding: 0.125rem 0.5rem;
		background: oklch(0.70 0.18 240 / 0.15);
		border: 1px solid oklch(0.70 0.18 240 / 0.3);
		border-radius: 9999px;
		color: oklch(0.80 0.12 240);
	}

	.selection-clear-btn {
		font-size: 0.6875rem;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		border: 1px solid oklch(0.35 0.02 250);
		background: transparent;
		color: oklch(0.65 0.02 250);
		cursor: pointer;
		transition: all 0.15s;
	}

	.selection-clear-btn:hover {
		background: oklch(0.25 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	/* Bulk error banner */
	.bulk-error {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: oklch(0.55 0.15 30 / 0.12);
		border-bottom: 1px solid oklch(0.55 0.15 30 / 0.25);
		color: oklch(0.75 0.15 30);
		font-size: 0.8125rem;
	}

	.bulk-error span {
		flex: 1;
	}

	.bulk-error button {
		display: flex;
		align-items: center;
		background: transparent;
		border: none;
		color: oklch(0.65 0.10 30);
		cursor: pointer;
		padding: 0.125rem;
		border-radius: 0.25rem;
	}

	.bulk-error button:hover {
		color: oklch(0.80 0.15 30);
		background: oklch(0.55 0.15 30 / 0.15);
	}

	/* === Floating Action Bar === */
	:global(.floating-action-bar) {
		position: fixed;
		bottom: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 50;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 0.75rem;
		box-shadow: 0 8px 32px oklch(0.05 0 0 / 0.6), 0 2px 8px oklch(0.05 0 0 / 0.3);
	}

	:global(.floating-count) {
		font-size: 0.8125rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		white-space: nowrap;
	}

	:global(.floating-divider) {
		width: 1px;
		height: 1.25rem;
		background: oklch(0.30 0.02 250);
	}

	:global(.floating-btn) {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.625rem;
		border: 1px solid transparent;
		border-radius: 0.375rem;
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
		white-space: nowrap;
	}

	:global(.floating-btn:disabled) {
		opacity: 0.5;
		pointer-events: none;
	}

	:global(.floating-btn-spawn) {
		background: oklch(0.65 0.18 250 / 0.15);
		color: oklch(0.82 0.14 250);
		border-color: oklch(0.65 0.18 250 / 0.3);
	}

	:global(.floating-btn-spawn:hover) {
		background: oklch(0.65 0.18 250 / 0.25);
	}

	:global(.floating-btn-close) {
		background: oklch(0.75 0.15 85 / 0.12);
		color: oklch(0.80 0.12 85);
		border-color: oklch(0.75 0.15 85 / 0.25);
	}

	:global(.floating-btn-close:hover) {
		background: oklch(0.75 0.15 85 / 0.22);
	}

	:global(.floating-btn-delete) {
		background: oklch(0.55 0.18 30 / 0.15);
		color: oklch(0.80 0.15 30);
		border-color: oklch(0.55 0.18 30 / 0.3);
	}

	:global(.floating-btn-delete:hover) {
		background: oklch(0.55 0.18 30 / 0.25);
	}

	:global(.floating-btn-clear) {
		background: transparent;
		color: oklch(0.65 0.02 250);
	}

	:global(.floating-btn-clear:hover) {
		background: oklch(0.25 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	:global(.floating-spinner) {
		width: 14px;
		height: 14px;
		border: 2px solid oklch(0.35 0.02 250);
		border-top-color: oklch(0.70 0.15 240);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Priority button */
	:global(.floating-btn-priority) {
		background: oklch(0.55 0.15 200 / 0.15);
		color: oklch(0.80 0.12 200);
		border-color: oklch(0.55 0.15 200 / 0.3);
	}

	:global(.floating-btn-priority:hover) {
		background: oklch(0.55 0.15 200 / 0.25);
	}

	/* Harness button */
	:global(.floating-btn-harness) {
		background: oklch(0.55 0.15 300 / 0.15);
		color: oklch(0.80 0.12 300);
		border-color: oklch(0.55 0.15 300 / 0.3);
	}

	:global(.floating-btn-harness:hover) {
		background: oklch(0.55 0.15 300 / 0.25);
	}

	/* Dropdown wrapper for floating bar */
	:global(.floating-dropdown-wrapper) {
		position: relative;
	}

	/* Dropdown menu above the floating bar */
	:global(.floating-dropdown) {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 50%;
		transform: translateX(-50%);
		min-width: 160px;
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 0.5rem;
		padding: 0.375rem;
		box-shadow: 0 8px 24px oklch(0.05 0 0 / 0.5);
		z-index: 60;
	}

	:global(.floating-dropdown-item) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.375rem 0.625rem;
		border: none;
		background: transparent;
		color: oklch(0.80 0.02 250);
		font-size: 0.75rem;
		text-align: left;
		border-radius: 0.375rem;
		cursor: pointer;
		transition: background 0.1s;
		white-space: nowrap;
	}

	:global(.floating-dropdown-item:hover) {
		background: oklch(0.25 0.02 250);
	}

	:global(.floating-priority-dot) {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	/* === Single-task Harness Picker === */
	.harness-picker-backdrop {
		position: fixed;
		inset: 0;
		z-index: 49;
	}

	.harness-picker {
		position: fixed;
		z-index: 50;
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.30 0.03 250);
		border-radius: 8px;
		padding: 4px;
		box-shadow: 0 8px 32px oklch(0 0 0 / 0.5);
		min-width: 180px;
		animation: contextMenuIn 0.1s ease;
	}

	.harness-picker-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		border-radius: 6px;
		width: 100%;
		color: oklch(0.80 0.02 250);
		font-size: 0.8125rem;
		background: transparent;
		border: none;
		cursor: pointer;
		transition: background 0.1s;
		text-align: left;
	}

	.harness-picker-item:hover {
		background: oklch(0.25 0.03 250);
	}

	.harness-picker-item.active {
		color: oklch(0.85 0.12 200);
	}
</style>
