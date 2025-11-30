<script lang="ts">
	import { page } from '$app/stores';
	import { replaceState } from '$app/navigation';
	import { onMount } from 'svelte';
	import WorkingAgentBadge from '$lib/components/WorkingAgentBadge.svelte';
	import FilterDropdown from '$lib/components/FilterDropdown.svelte';
	import LabelBadges from '$lib/components/LabelBadges.svelte';
	import TaskIdBadge from '$lib/components/TaskIdBadge.svelte';
	import { analyzeDependencies } from '$lib/utils/dependencyUtils';
	import { getProjectFromTaskId, extractParentId } from '$lib/utils/projectUtils';
	import { getProjectColor } from '$lib/utils/projectColors';
	import { getPriorityBadge, getTaskStatusBadge, getTypeBadge } from '$lib/utils/badgeHelpers';
	import { formatRelativeTime, formatFullDate, normalizeTimestamp, getAgeColorClass } from '$lib/utils/dateFormatters';
	import { toggleSetItem } from '$lib/utils/filterHelpers';
	import { getTaskStatusVisual, STATUS_ICONS, getIssueTypeVisual, getGroupHeaderInfo, type GroupingMode } from '$lib/config/statusColors';
	import { getElapsedTimeColor, getFireScale, formatElapsedTime } from '$lib/config/rocketConfig';
	import { isAgentWorking as checkAgentWorking, computeAgentStatus } from '$lib/utils/agentStatusUtils';
	import TaskActionButton from './TaskActionButton.svelte';
	import {
		bulkApiOperation,
		fetchWithTimeout,
		handleApiError,
		createPutRequest,
		createDeleteRequest
	} from '$lib/utils/bulkApiHelpers';
	import { playNewTaskChime, playTaskExitSound, playTaskStartSound, playTaskCompleteSound } from '$lib/utils/soundEffects';

	// Type definitions for task images
	interface TaskImage {
		blob: Blob;
		preview: string; // Object URL for thumbnail
		path: string;    // Server path after upload
		id: string;      // Unique ID for this image (for removal)
	}

	// Type definitions
	interface Task {
		id: string;
		title?: string;
		description?: string;
		status: string;
		priority: number;
		issue_type?: string;
		assignee?: string;
		labels?: string[];
		depends_on?: Array<{ id: string; status?: string; title?: string; priority?: number; issue_type?: string; assignee?: string }>;
		created_at?: string;
		updated_at?: string;
	}

	interface Agent {
		name: string;
		last_active_ts?: string;
		task?: string | null;
	}

	interface Reservation {
		agent_name: string;
		path_pattern: string;
		expires_ts: string;
	}

	// Grouping mode for task table - determines how tasks are grouped in the view
	// Type imported from statusColors.ts: type GroupingMode = 'type' | 'parent' | 'label';

	interface Props {
		tasks?: Task[];
		allTasks?: Task[];
		agents?: Agent[];
		reservations?: Reservation[];
		ontaskclick?: (taskId: string) => void;
		/** Callback when user clicks on an agent avatar/name */
		onagentclick?: (agentName: string) => void;
	}

	let { tasks = [], allTasks = [], agents = [], reservations = [], ontaskclick = () => {}, onagentclick }: Props = $props();

	// Track previously seen task IDs and statuses for animations
	// Using regular variables (not $state) to avoid effect loops
	let previousTaskIds: Set<string> = new Set();
	let previousTasksMap: Map<string, Task> = new Map();
	let previousStatusMap: Map<string, string> = new Map();
	let isInitialLoad = true;
	// Use arrays instead of Sets for better Svelte reactivity
	let newTaskIds = $state<string[]>([]);
	let exitingTasks = $state<Task[]>([]);
	let startingTaskIds = $state<string[]>([]);
	let completedTaskIds = $state<string[]>([]);

	// Timer state for elapsed time display under rockets
	let now = $state(Date.now());

	// Update timer every 30 seconds
	onMount(() => {
		const timerInterval = setInterval(() => {
			now = Date.now();
		}, 30000);
		return () => clearInterval(timerInterval);
	});

	// Calculate elapsed time from a timestamp with color coding
	// Uses config from $lib/config/rocketConfig.ts
	function getElapsedTime(timestamp: string | undefined): { display: string; color: string; minutes: number } | null {
		if (!timestamp) return null;
		const start = new Date(timestamp).getTime();
		const elapsed = now - start;
		if (elapsed < 0 || isNaN(elapsed)) return null;

		const totalMinutes = Math.floor(elapsed / 60000);
		const color = getElapsedTimeColor(totalMinutes);
		const display = formatElapsedTime(totalMinutes);

		return { display, color, minutes: totalMinutes };
	}

	// Grouping mode - how tasks are grouped in the table view
	// 'type' - group by issue_type (bug, task, feature, etc.)
	// 'parent' - group by parent task ID (for epic/subtask hierarchies)
	// 'label' - group by first label
	let groupingMode = $state<GroupingMode>('parent');

	// Track collapsed groups (by group key)
	let collapsedGroups = $state<Set<string | null>>(new Set());

	// Toggle group collapse state
	function toggleGroupCollapse(groupKey: string | null) {
		const newSet = new Set(collapsedGroups);
		if (newSet.has(groupKey)) {
			newSet.delete(groupKey);
		} else {
			newSet.add(groupKey);
		}
		collapsedGroups = newSet;
	}

	// Reset collapsed groups when grouping mode changes
	$effect(() => {
		groupingMode; // dependency
		collapsedGroups = new Set();
	});

	// Initialize groupingMode from URL on mount
	$effect(() => {
		const groupByParam = $page.url.searchParams.get('groupBy');
		if (groupByParam && ['type', 'parent', 'label'].includes(groupByParam)) {
			groupingMode = groupByParam as GroupingMode;
		}
	});

	/**
	 * Set grouping mode and sync to URL
	 * @param mode - The grouping mode to set ('type', 'parent', 'label')
	 */
	function setGroupingMode(mode: GroupingMode) {
		groupingMode = mode;

		// Sync to URL
		const url = new URL(window.location.href);
		if (mode === 'type') {
			// 'type' is default, remove param
			url.searchParams.delete('groupBy');
		} else {
			url.searchParams.set('groupBy', mode);
		}
		replaceState(url, {});
	}

	// Detect new, removed, and status-changed tasks when tasks array changes
	// Using $effect.pre to set animation state BEFORE rendering
	$effect.pre(() => {
		const taskIds = tasks.map(t => t.id);
		const currentIds = new Set(taskIds);

		// Skip animation on initial load
		if (isInitialLoad) {
			previousTaskIds = currentIds;
			previousTasksMap = new Map(tasks.map(t => [t.id, t]));
			previousStatusMap = new Map(tasks.map(t => [t.id, t.status]));
			isInitialLoad = false;
			return;
		}

		// Find tasks that weren't in the previous set (new tasks)
		const newIds = new Set<string>();
		for (const id of currentIds) {
			if (!previousTaskIds.has(id)) {
				newIds.add(id);
			}
		}

		// Find tasks that were removed
		const removedTasks: Task[] = [];
		for (const id of previousTaskIds) {
			if (!currentIds.has(id)) {
				const task = previousTasksMap.get(id);
				if (task) {
					removedTasks.push(task);
				}
			}
		}

		// Find tasks that changed status to in_progress (started working)
		const startedIds: string[] = [];
		for (const task of tasks) {
			const prevStatus = previousStatusMap.get(task.id);
			if (prevStatus && prevStatus !== 'in_progress' && task.status === 'in_progress') {
				startedIds.push(task.id);
			}
		}

		// Find tasks that changed status to closed (completed)
		const closedIds: string[] = [];
		for (const task of tasks) {
			const prevStatus = previousStatusMap.get(task.id);
			if (prevStatus && prevStatus !== 'closed' && task.status === 'closed') {
				closedIds.push(task.id);
			}
		}

		// Update tracking for next comparison
		previousTaskIds = currentIds;
		previousTasksMap = new Map(tasks.map(t => [t.id, t]));
		previousStatusMap = new Map(tasks.map(t => [t.id, t.status]));

		// If we found new tasks, trigger animation and sound
		if (newIds.size > 0) {
			newTaskIds = Array.from(newIds);
			playNewTaskChime();

			// Clear the new task highlight after animation completes
			setTimeout(() => {
				newTaskIds = [];
			}, 1500);
		}

		// If tasks were removed, trigger exit animation and sound
		if (removedTasks.length > 0) {
			// Check allTasks for current status (task might be closed but filtered out of `tasks`)
			const allTasksMap = new Map(allTasks.map(t => [t.id, t]));

			// Update removed tasks with current status from allTasks
			const exitTasksWithStatus = removedTasks.map(t => {
				const currentTask = allTasksMap.get(t.id);
				if (currentTask && currentTask.status === 'closed') {
					return { ...t, status: 'closed' };
				}
				// Also check closedIds in case allTasks isn't updated yet
				if (closedIds.includes(t.id)) {
					return { ...t, status: 'closed' };
				}
				return t;
			});
			exitingTasks = exitTasksWithStatus;

			// Only play exit sound for non-completed tasks (completed tasks have their own sound)
			const nonCompletedExits = exitTasksWithStatus.filter(t => t.status !== 'closed');
			if (nonCompletedExits.length > 0) {
				playTaskExitSound();
			}

			// Clear exiting tasks after animation completes
			// Use longer timeout if any tasks are completed (to allow landing animation)
			const hasCompletedTasks = exitTasksWithStatus.some(t => t.status === 'closed');
			setTimeout(() => {
				exitingTasks = [];
			}, hasCompletedTasks ? 2000 : 600);
		}

		// If tasks started (status -> in_progress), play start sound
		if (startedIds.length > 0) {
			startingTaskIds = startedIds;
			playTaskStartSound();

			// Clear starting highlight after animation
			setTimeout(() => {
				startingTaskIds = [];
			}, 1500);
		}

		// If tasks completed (status -> closed), play completion sound and trigger landing animation
		if (closedIds.length > 0) {
			completedTaskIds = closedIds;
			playTaskCompleteSound();

			// Add completed tasks to exitingTasks so they show landing animation
			// (since they get filtered out of the main table view)
			const completedTasks = tasks.filter(t => closedIds.includes(t.id));
			if (completedTasks.length > 0) {
				// Add to existing exitingTasks (don't overwrite removed tasks)
				exitingTasks = [...exitingTasks.filter(t => !closedIds.includes(t.id)), ...completedTasks];
			}

			// Clear completed highlight and exitingTasks after landing animation
			// (0.8s landing + 0.6s delay + 0.4s checkmark + 1.7s linger)
			setTimeout(() => {
				completedTaskIds = [];
				exitingTasks = exitingTasks.filter(t => !closedIds.includes(t.id));
			}, 3500);
		}
	});

	// Check if an agent is actively working (uses shared utility)
	function isAgentWorking(agentName: string | undefined | null): boolean {
		if (!agentName || !agents.length) return false;
		const agent = agents.find(a => a.name === agentName);
		if (!agent) return false;
		return checkAgentWorking(agent);
	}

	// Initialize filters from URL params (default to open + in_progress tasks)
	let searchQuery = $state('');
	let selectedProjects = $state<Set<string>>(new Set());
	let selectedPriorities = $state<Set<string>>(new Set(['0', '1', '2', '3']));
	let selectedStatuses = $state<Set<string>>(new Set(['open', 'in_progress']));
	let selectedTypes = $state<Set<string>>(new Set());
	let selectedLabels = $state<Set<string>>(new Set());

	// Sorting state
	let sortColumn = $state('priority');
	let sortDirection = $state('asc'); // 'asc' or 'desc'

	// Selection state
	let selectedTasks = $state<Set<string>>(new Set());

	// Toggle single task selection
	function toggleTask(taskId: string) {
		if (selectedTasks.has(taskId)) {
			selectedTasks.delete(taskId);
		} else {
			selectedTasks.add(taskId);
		}
		selectedTasks = new Set(selectedTasks); // trigger reactivity
	}

	// Toggle all visible tasks
	function toggleAll() {
		if (allSelected) {
			selectedTasks = new Set(); // deselect all
		} else {
			selectedTasks = new Set(sortedTasks.map(t => t.id)); // select all visible
		}
	}

	// Clear selection
	function clearSelection() {
		selectedTasks = new Set();
	}

	// Sync filters with URL on mount and page changes
	$effect(() => {
		const params = new URLSearchParams(window.location.search);
		searchQuery = params.get('search') || '';

		const projects = params.get('projects');
		if (projects) {
			selectedProjects = new Set(projects.split(','));
		} else {
			selectedProjects = new Set();
		}

		const priorities = params.get('priorities');
		if (priorities) {
			selectedPriorities = new Set(priorities.split(','));
		} else {
			selectedPriorities = new Set(['0', '1', '2', '3']);
		}

		const statuses = params.get('statuses');
		if (statuses) {
			selectedStatuses = new Set(statuses.split(','));
		} else {
			selectedStatuses = new Set(['open', 'in_progress']);
		}

		const types = params.get('types');
		if (types) {
			selectedTypes = new Set(types.split(','));
		} else {
			selectedTypes = new Set();
		}

		const labels = params.get('labels');
		if (labels) {
			selectedLabels = new Set(labels.split(','));
		} else {
			selectedLabels = new Set();
		}
	});

	// Update URL when filters change
	function updateURL() {
		const params = new URLSearchParams();

		if (searchQuery) params.set('search', searchQuery);
		if (selectedProjects.size > 0) {
			params.set('projects', Array.from(selectedProjects).join(','));
		}
		if (selectedPriorities.size > 0 && selectedPriorities.size < 4) {
			params.set('priorities', Array.from(selectedPriorities).join(','));
		}
		if (selectedStatuses.size > 0) {
			params.set('statuses', Array.from(selectedStatuses).join(','));
		}
		if (selectedTypes.size > 0) {
			params.set('types', Array.from(selectedTypes).join(','));
		}
		if (selectedLabels.size > 0) {
			params.set('labels', Array.from(selectedLabels).join(','));
		}

		const newURL = params.toString() ? `?${params.toString()}` : window.location.pathname;
		window.history.replaceState({}, '', newURL);
	}

	// Compute filtered tasks
	const filteredTasks = $derived.by(() => {
		let result = tasks;

		// Filter by search
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			result = result.filter(
				(task) =>
					task.title?.toLowerCase().includes(query) ||
					task.description?.toLowerCase().includes(query) ||
					task.id?.toLowerCase().includes(query)
			);
		}

		// Filter by project
		if (selectedProjects.size > 0) {
			result = result.filter((task) => {
				const project = getProjectFromTaskId(task.id);
				return project && selectedProjects.has(project);
			});
		}

		// Filter by priority
		if (selectedPriorities.size > 0 && selectedPriorities.size < 4) {
			result = result.filter((task) => selectedPriorities.has(String(task.priority)));
		}

		// Filter by status
		if (selectedStatuses.size > 0) {
			result = result.filter((task) => selectedStatuses.has(task.status));
		}

		// Filter by type
		if (selectedTypes.size > 0) {
			result = result.filter((task) => task.issue_type && selectedTypes.has(task.issue_type));
		}

		// Filter by labels
		if (selectedLabels.size > 0) {
			result = result.filter((task) => {
				const taskLabels = task.labels || [];
				return Array.from(selectedLabels).every((label) => taskLabels.includes(label));
			});
		}

		return result;
	});

	// Type order for grouping (BUG first, then features, tasks, chores, epics, no type last)
	const typeOrder = ['bug', 'feature', 'task', 'chore', 'epic', null];

	// Sort function used within each group
	// Priority: 1) Tasks with working agents first, 2) Then by selected sort column
	function sortTasks(tasksToSort: Task[]): Task[] {
		return [...tasksToSort].sort((a, b) => {
			// First priority: tasks with working agents come first
			const aWorking = isAgentWorking(a.assignee);
			const bWorking = isAgentWorking(b.assignee);
			if (aWorking && !bWorking) return -1;
			if (!aWorking && bWorking) return 1;

			// Second priority: tasks with any assignee come before unassigned
			const aAssigned = !!a.assignee;
			const bAssigned = !!b.assignee;
			if (aAssigned && !bAssigned) return -1;
			if (!aAssigned && bAssigned) return 1;

			// Third priority: apply regular sort column
			let aVal, bVal;

			switch (sortColumn) {
				case 'id':
					aVal = a.id || '';
					bVal = b.id || '';
					break;
				case 'title':
					aVal = a.title || '';
					bVal = b.title || '';
					break;
				case 'priority':
					aVal = a.priority ?? 99;
					bVal = b.priority ?? 99;
					break;
				case 'status':
					aVal = a.status || '';
					bVal = b.status || '';
					break;
				case 'type':
					aVal = a.issue_type || '';
					bVal = b.issue_type || '';
					break;
				case 'assignee':
					aVal = a.assignee || '';
					bVal = b.assignee || '';
					break;
				case 'updated':
					aVal = a.updated_at || '';
					bVal = b.updated_at || '';
					break;
				default:
					return 0;
			}

			if (typeof aVal === 'number' && typeof bVal === 'number') {
				return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
			}

			const comparison = String(aVal).localeCompare(String(bVal));
			return sortDirection === 'asc' ? comparison : -comparison;
		});
	}

	/**
	 * Get the grouping key for a task based on current groupingMode
	 */
	function getGroupKey(task: Task): string | null {
		switch (groupingMode) {
			case 'type':
				return task.issue_type || null;
			case 'parent':
				// Extract parent ID from hierarchical task IDs (e.g., jat-abc.1 → jat-abc)
				// Tasks without a parent (epics or standalone) use their own ID as the group
				const parentId = extractParentId(task.id);
				return parentId || task.id; // Use own ID if no parent (standalone/epic)
			case 'label':
				// Group by first label, or null if no labels
				return task.labels && task.labels.length > 0 ? task.labels[0] : null;
			default:
				return task.issue_type || null;
		}
	}

	// Grouped tasks based on groupingMode (for sticky headers)
	const groupedTasks = $derived.by(() => {
		const groups = new Map<string | null, Task[]>();

		// For 'type' mode, initialize groups in order
		if (groupingMode === 'type') {
			for (const type of typeOrder) {
				groups.set(type, []);
			}
		}

		// Group tasks by the appropriate key
		for (const task of filteredTasks) {
			const key = getGroupKey(task);
			if (!groups.has(key)) {
				groups.set(key, []);
			}
			groups.get(key)!.push(task);
		}

		// Sort tasks within each group
		for (const [key, groupTasks] of groups) {
			groups.set(key, sortTasks(groupTasks));
		}

		// For parent mode, sort groups: epics first (those with children), then standalone tasks
		if (groupingMode === 'parent') {
			const sortedEntries = Array.from(groups.entries()).sort(([keyA, tasksA], [keyB, tasksB]) => {
				// Groups with more tasks (epics with children) come first
				const sizeA = tasksA.length;
				const sizeB = tasksB.length;
				if (sizeA !== sizeB) return sizeB - sizeA;
				// Then alphabetically by key
				return (keyA || '').localeCompare(keyB || '');
			});
			return new Map(sortedEntries);
		}

		return groups;
	});

	// Flattened list of all visible tasks (for select-all and backward compatibility)
	const sortedTasks = $derived.by(() => {
		const allTasks = [];
		for (const [type, tasks] of groupedTasks) {
			allTasks.push(...tasks);
		}
		return allTasks;
	});

	// Derived: are all visible tasks selected?
	const allSelected = $derived(
		sortedTasks.length > 0 &&
		sortedTasks.every(t => selectedTasks.has(t.id))
	);

	// Derived: is selection partial (some but not all)?
	const partialSelected = $derived(
		selectedTasks.size > 0 && !allSelected
	);

	// Get unique labels and types from tasks
	const availableLabels = $derived.by(() => {
		const labelsSet = new Set<string>();
		tasks.forEach((task) => {
			task.labels?.forEach((label: string) => labelsSet.add(label));
		});
		return Array.from(labelsSet).sort();
	});

	const availableTypes = $derived.by(() => {
		const typesSet = new Set<string>();
		tasks.forEach((task) => {
			if (task.issue_type) typesSet.add(task.issue_type);
		});
		return Array.from(typesSet).sort();
	});

	const availableProjects = $derived.by(() => {
		const projectsSet = new Set<string>();
		tasks.forEach((task) => {
			const project = getProjectFromTaskId(task.id);
			if (project) projectsSet.add(project);
		});
		return Array.from(projectsSet).sort();
	});

	// Filter options for FilterDropdown components
	const projectOptions = $derived(availableProjects.map(p => ({
		value: p,
		label: p,
		count: tasks.filter(t => getProjectFromTaskId(t.id) === p).length
	})));

	const priorityOptions = $derived(['0', '1', '2', '3'].map(p => ({
		value: p,
		label: `P${p}`,
		count: tasks.filter(t => String(t.priority) === p).length
	})));

	const statusOptions = $derived(['open', 'in_progress', 'blocked', 'closed'].map(s => ({
		value: s,
		label: s.replace('_', ' '),
		count: tasks.filter(t => t.status === s).length
	})));

	const typeOptions = $derived(availableTypes.map(t => ({
		value: t,
		label: t,
		count: tasks.filter(task => task.issue_type === t).length
	})));

	const labelOptions = $derived(availableLabels.map(l => ({
		value: l,
		label: l,
		count: tasks.filter(t => t.labels?.includes(l)).length
	})));

	// Toggle functions using shared helper
	function toggleProject(project: string) {
		selectedProjects = toggleSetItem(selectedProjects, project);
		updateURL();
	}

	function togglePriority(priority: string) {
		selectedPriorities = toggleSetItem(selectedPriorities, priority);
		updateURL();
	}

	function toggleStatus(status: string) {
		selectedStatuses = toggleSetItem(selectedStatuses, status);
		updateURL();
	}

	function toggleType(type: string) {
		selectedTypes = toggleSetItem(selectedTypes, type);
		updateURL();
	}

	function toggleLabel(label: string) {
		selectedLabels = toggleSetItem(selectedLabels, label);
		updateURL();
	}

	function clearAllFilters() {
		searchQuery = '';
		selectedProjects = new Set();
		selectedPriorities = new Set(['0', '1', '2', '3']);
		selectedStatuses = new Set(['open', 'in_progress']);
		selectedTypes = new Set();
		selectedLabels = new Set();
		updateURL();
	}

	// Sorting
	function handleSort(column: string) {
		if (sortColumn === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column;
			sortDirection = 'asc';
		}
	}

	// Copy to clipboard
	let copiedTaskId = $state<string | null>(null);
	async function copyTaskId(taskId: string, event: MouseEvent) {
		event.stopPropagation(); // Don't trigger row click
		try {
			await navigator.clipboard.writeText(taskId);
			copiedTaskId = taskId;
			setTimeout(() => {
				copiedTaskId = null;
			}, 1500);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}


	// Handle row click
	function handleRowClick(taskId: string) {
		ontaskclick(taskId);
	}

	// Bulk action state
	let bulkActionLoading = $state(false);
	let bulkActionError = $state('');

	// Spawn operation state
	let spawningSingle = $state<string | null>(null); // Task ID being spawned, or null
	let spawningBulk = $state(false); // True when bulk spawn is in progress

	// Task images state - tracks images attached to tasks (for bug screenshots etc.)
	let taskImages = $state<Map<string, TaskImage[]>>(new Map());
	let uploadingImage = $state<string | null>(null); // Task ID currently uploading image
	let dragOverTask = $state<string | null>(null); // Task ID being dragged over

	/**
	 * Spawn a single agent to work on a specific task
	 * Calls POST /api/work/spawn with the task ID
	 * If an image is attached to the task, it will be passed to the agent
	 * @param taskId - The ID of the task to spawn an agent for
	 * @returns Promise that resolves when spawn completes
	 */
	async function handleSpawnSingle(taskId: string): Promise<boolean> {
		if (spawningSingle || spawningBulk) return false; // Prevent concurrent spawns

		spawningSingle = taskId;
		try {
			// Check if this task has attached images
			const taskImageArray = taskImages.get(taskId) || [];
			const imagePaths = taskImageArray.map(img => img.path).filter(Boolean);
			// Pass first image for backward compatibility, all images stored in task notes
			const imagePath = imagePaths.length > 0 ? imagePaths[0] : null;

			const response = await fetch('/api/work/spawn', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ taskId, imagePath })
			});

			const data = await response.json();

			if (!response.ok) {
				console.error('Spawn failed:', data.error || data.message);
				return false;
			}

			// Success - the API has already:
			// 1. Registered a new agent
			// 2. Updated task status to in_progress
			// 3. Created tmux session with Claude Code
			// 4. Sent the image path if one was attached
			// Parent page polling will pick up the updated task state
			console.log(`Spawned agent ${data.session?.agentName} for task ${taskId}${imagePath ? ' (with image)' : ''}`);

			// Clear the image after successful spawn (it's been sent)
			if (imagePath) {
				removeTaskImage(taskId, new MouseEvent('click'));
			}

			return true;
		} catch (err) {
			console.error('Spawn request failed:', err);
			return false;
		} finally {
			spawningSingle = null;
		}
	}

	/**
	 * Spawn agents for all selected tasks with staggered timing
	 * Spawns agents sequentially with 2s delay between each to avoid overwhelming the system
	 * @returns Promise that resolves when all spawns complete
	 */
	async function handleBulkSpawn(): Promise<void> {
		if (spawningBulk || spawningSingle) return; // Prevent concurrent spawns
		if (selectedTasks.size === 0) return;

		spawningBulk = true;
		const taskIds = Array.from(selectedTasks);
		const results: { taskId: string; success: boolean }[] = [];

		try {
			for (let i = 0; i < taskIds.length; i++) {
				const taskId = taskIds[i];

				// Spawn agent for this task
				const response = await fetch('/api/work/spawn', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ taskId })
				});

				const data = await response.json();
				const success = response.ok;

				results.push({ taskId, success });

				if (success) {
					console.log(`Spawned agent ${data.session?.agentName} for task ${taskId}`);
				} else {
					console.error(`Failed to spawn for ${taskId}:`, data.error || data.message);
				}

				// Stagger delay between spawns (2s), except after last one
				if (i < taskIds.length - 1) {
					await new Promise(resolve => setTimeout(resolve, 2000));
				}
			}

			// Log summary
			const successCount = results.filter(r => r.success).length;
			console.log(`Bulk spawn complete: ${successCount}/${taskIds.length} succeeded`);

			// Clear selection on success
			if (successCount > 0) {
				clearSelection();
			}
		} catch (err) {
			console.error('Bulk spawn failed:', err);
		} finally {
			spawningBulk = false;
		}
	}

	// Helper to run bulk operations with consistent state management
	async function runBulkOperation(operation: (taskId: string) => Promise<void>) {
		bulkActionLoading = true;
		bulkActionError = '';

		const result = await bulkApiOperation(
			Array.from(selectedTasks),
			operation,
			{ continueOnError: false }
		);

		if (result.success) {
			clearSelection();
		} else {
			bulkActionError = result.errors[0] || 'Operation failed';
		}

		bulkActionLoading = false;
	}

	// Bulk action handlers using shared utilities
	async function handleBulkDelete() {
		if (!confirm(`Delete ${selectedTasks.size} task(s)? This cannot be undone.`)) return;

		await runBulkOperation(async (taskId: string) => {
			const response = await fetchWithTimeout(`/api/tasks/${taskId}`, createDeleteRequest());
			if (!response.ok) {
				throw new Error(await handleApiError(response, `delete task ${taskId}`));
			}
		});
	}

	async function handleBulkRelease() {
		await runBulkOperation(async (taskId: string) => {
			const response = await fetchWithTimeout(
				`/api/tasks/${taskId}`,
				createPutRequest({ assignee: null, status: 'open' })
			);
			if (!response.ok) {
				throw new Error(await handleApiError(response, `release task ${taskId}`));
			}
		});
	}

	async function handleBulkAssign() {
		const agentName = prompt('Enter agent name to assign tasks to:');
		if (!agentName) return;

		await runBulkOperation(async (taskId: string) => {
			const response = await fetchWithTimeout(
				`/api/tasks/${taskId}`,
				createPutRequest({ assignee: agentName, status: 'in_progress' })
			);
			if (!response.ok) {
				throw new Error(await handleApiError(response, `assign task ${taskId}`));
			}
		});
	}

	async function handleBulkChangePriority(priority: number) {
		await runBulkOperation(async (taskId: string) => {
			const response = await fetchWithTimeout(
				`/api/tasks/${taskId}`,
				createPutRequest({ priority })
			);
			if (!response.ok) {
				throw new Error(await handleApiError(response, `update priority for ${taskId}`));
			}
		});
	}

	async function handleBulkChangeStatus(status: string) {
		await runBulkOperation(async (taskId: string) => {
			const response = await fetchWithTimeout(
				`/api/tasks/${taskId}`,
				createPutRequest({ status })
			);
			if (!response.ok) {
				throw new Error(await handleApiError(response, `update status for ${taskId}`));
			}
		});
	}

	async function handleBulkAddLabel() {
		const label = prompt('Enter label to add to selected tasks:');
		if (!label) return;

		await runBulkOperation(async (taskId) => {
			// First get current task to get existing labels
			const getResponse = await fetchWithTimeout(`/api/tasks/${taskId}`);
			if (!getResponse.ok) {
				throw new Error(await handleApiError(getResponse, `fetch task ${taskId}`));
			}
			const taskData = await getResponse.json();
			const currentLabels = taskData.task?.labels || [];

			// Add new label if not already present
			if (!currentLabels.includes(label)) {
				const response = await fetchWithTimeout(
					`/api/tasks/${taskId}`,
					createPutRequest({ labels: [...currentLabels, label] })
				);
				if (!response.ok) {
					throw new Error(await handleApiError(response, `add label to ${taskId}`));
				}
			}
		});
	}

	// ========== Task Image Handling ==========

	/**
	 * Load all task images from server on mount
	 * Enables cross-session reactivity - images persist across browser sessions
	 * Supports multiple images per task
	 */
	async function loadTaskImagesFromServer() {
		try {
			const response = await fetch('/api/tasks/images');
			if (!response.ok) {
				console.warn('Failed to load task images from server');
				return;
			}
			const { images } = await response.json();

			// Convert server images to local state format
			const newMap = new Map<string, TaskImage[]>();
			for (const [taskId, imageData] of Object.entries(images)) {
				// Handle both old format (single object) and new format (array)
				const dataArray = Array.isArray(imageData) ? imageData : [imageData];
				const taskImageArray: TaskImage[] = dataArray.map((data: { path: string; uploadedAt: string; id?: string }, index: number) => ({
					blob: new Blob(), // Placeholder - actual file is on disk
					preview: `/api/work/image${data.path}`, // API endpoint serves the image
					path: data.path,
					id: data.id || `img-${index}-${Date.now()}`
				}));
				if (taskImageArray.length > 0) {
					newMap.set(taskId, taskImageArray);
				}
			}
			taskImages = newMap;
		} catch (err) {
			console.error('Error loading task images:', err);
		}
	}

	/**
	 * Save task image path to server for persistence
	 * Appends to existing images for this task
	 */
	async function saveTaskImageToServer(taskId: string, path: string, imageId: string) {
		try {
			await fetch(`/api/tasks/${taskId}/image`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path, id: imageId, action: 'add' })
			});
		} catch (err) {
			console.error('Failed to save task image to server:', err);
		}
	}

	/**
	 * Remove a specific task image from server
	 */
	async function removeTaskImageFromServer(taskId: string, imageId: string) {
		try {
			await fetch(`/api/tasks/${taskId}/image`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: imageId })
			});
		} catch (err) {
			console.error('Failed to remove task image from server:', err);
		}
	}

	// Load task images on mount
	onMount(() => {
		loadTaskImagesFromServer();
	});

	// Track last image refresh time to avoid excessive reloads
	let lastImageRefreshTime = 0;
	const IMAGE_REFRESH_INTERVAL = 10000; // 10 seconds minimum between refreshes

	// Periodically refresh task images for cross-session reactivity
	// This runs when tasks update (from parent polling) but throttles refreshes
	$effect(() => {
		// Dependency on tasks array (when parent fetches new tasks)
		const taskCount = tasks.length;
		if (taskCount > 0) {
			const now = Date.now();
			if (now - lastImageRefreshTime >= IMAGE_REFRESH_INTERVAL) {
				lastImageRefreshTime = now;
				loadTaskImagesFromServer();
			}
		}
	});

	/**
	 * Handle image drop on a task row
	 * Uploads the image and stores the path for use when spawning
	 */
	async function handleImageDrop(event: DragEvent, taskId: string) {
		event.preventDefault();
		event.stopPropagation();
		dragOverTask = null;

		if (!event.dataTransfer) return;

		// Get ALL image files from the drop
		const files = Array.from(event.dataTransfer.files);
		const imageFiles = files.filter(f => f.type.startsWith('image/'));

		if (imageFiles.length > 0) {
			// Upload all image files sequentially
			for (const imageFile of imageFiles) {
				await uploadTaskImage(taskId, imageFile);
			}
			return;
		}

		// Check for image data (e.g., pasted from clipboard via drag)
		const items = Array.from(event.dataTransfer.items);
		for (const item of items) {
			if (item.type.startsWith('image/')) {
				const blob = item.getAsFile();
				if (blob) {
					await uploadTaskImage(taskId, blob);
				}
			}
		}
	}

	/**
	 * Upload an image for a task and store the path
	 * Appends to existing images (supports multiple images per task)
	 * Also saves to server for cross-session persistence
	 */
	async function uploadTaskImage(taskId: string, blob: Blob) {
		uploadingImage = taskId;

		try {
			// Create preview URL
			const preview = URL.createObjectURL(blob);

			// Upload to server
			const formData = new FormData();
			formData.append('image', blob, `task-${taskId}-${Date.now()}.png`);
			formData.append('sessionName', `task-${taskId}`);

			const response = await fetch('/api/work/upload-image', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				throw new Error('Failed to upload image');
			}

			const { filePath } = await response.json();

			// Generate unique ID for this image
			const imageId = `img-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

			// Create new image object
			const newImage: TaskImage = { blob, preview, path: filePath, id: imageId };

			// Append to existing images for this task
			const newMap = new Map(taskImages);
			const existingImages = newMap.get(taskId) || [];
			newMap.set(taskId, [...existingImages, newImage]);
			taskImages = newMap;

			// Save to server for persistence across browser sessions
			await saveTaskImageToServer(taskId, filePath, imageId);

			// Update task notes with all image paths
			await updateTaskNotesWithImages(taskId);

			console.log(`Attached image to task ${taskId}: ${filePath} (total: ${existingImages.length + 1})`);
		} catch (err) {
			console.error('Failed to upload task image:', err);
		} finally {
			uploadingImage = null;
		}
	}

	/**
	 * Update task notes with all image paths so agents see them via bd show
	 */
	async function updateTaskNotesWithImages(taskId: string) {
		try {
			const images = taskImages.get(taskId) || [];
			if (images.length === 0) {
				// Clear notes if no images
				await fetch(`/api/tasks/${taskId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ notes: '' })
				});
				return;
			}

			const imagePaths = images.map((img, i) => `  ${i + 1}. ${img.path}`).join('\n');
			const noteText = `📷 Attached screenshots:\n${imagePaths}\n(Use Read tool to view these images)`;
			await fetch(`/api/tasks/${taskId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ notes: noteText })
			});
		} catch (err) {
			console.error('Failed to update task notes with images:', err);
		}
	}

	/**
	 * Remove a specific image from a task
	 * Also removes from server for cross-session persistence
	 */
	async function removeTaskImage(taskId: string, imageId: string, event: MouseEvent) {
		event.stopPropagation();

		const images = taskImages.get(taskId) || [];
		const imgToRemove = images.find(img => img.id === imageId);

		// Revoke object URL if it's not a file path
		if (imgToRemove && imgToRemove.preview && !imgToRemove.preview.startsWith('/api')) {
			URL.revokeObjectURL(imgToRemove.preview);
		}

		// Filter out the removed image
		const newMap = new Map(taskImages);
		const remainingImages = images.filter(img => img.id !== imageId);
		if (remainingImages.length > 0) {
			newMap.set(taskId, remainingImages);
		} else {
			newMap.delete(taskId);
		}
		taskImages = newMap;

		// Remove from server for persistence
		await removeTaskImageFromServer(taskId, imageId);

		// Update task notes
		await updateTaskNotesWithImages(taskId);
	}

	/**
	 * Handle drag over a task row
	 */
	function handleImageDragOver(event: DragEvent, taskId: string) {
		event.preventDefault();
		event.stopPropagation();

		// Check if dragging an image
		if (event.dataTransfer) {
			const hasImage = Array.from(event.dataTransfer.types).some(t =>
				t === 'Files' || t.startsWith('image/')
			);
			if (hasImage) {
				event.dataTransfer.dropEffect = 'copy';
				dragOverTask = taskId;
			}
		}
	}

	/**
	 * Handle drag leave from a task row
	 */
	function handleImageDragLeave(event: DragEvent) {
		event.preventDefault();
		dragOverTask = null;
	}
</script>

<div class="flex flex-col h-full">
	<!-- Filter Bar - Industrial Style -->
	<div
		class="p-4 overflow-visible relative"
		style="
			background: linear-gradient(180deg, oklch(0.22 0.01 250) 0%, oklch(0.20 0.01 250) 100%);
			border: 1px solid oklch(0.35 0.02 250);
			border-left: none;
		"
	>
		<!-- Left accent bar -->
		<div
			class="absolute left-0 top-0 bottom-0 w-1"
			style="background: linear-gradient(180deg, oklch(0.70 0.18 240) 0%, oklch(0.70 0.18 240 / 0.3) 100%);"
		></div>

		<div class="flex flex-wrap items-center gap-3">
			<!-- Search - Industrial -->
			<div class="relative">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2"
					style="color: oklch(0.55 0.02 250);"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
				</svg>
				<input
					type="text"
					placeholder="Search {sortedTasks.length} of {tasks.length} tasks..."
					class="pl-9 pr-3 py-1.5 min-w-40 max-w-64 shrink rounded font-mono text-sm"
					style="
						background: oklch(0.18 0.01 250);
						border: 1px solid oklch(0.35 0.02 250);
						color: oklch(0.75 0.02 250);
					"
					bind:value={searchQuery}
					oninput={() => updateURL()}
				/>
			</div>

			<!-- Project Filter -->
			{#if projectOptions.length > 0}
				<FilterDropdown
					label="Project"
					options={projectOptions}
					selected={selectedProjects}
					onToggle={toggleProject}
					emptyMeansAll={true}
					style="checkbox"
					menuWidth="w-44"
				/>
			{/if}

			<!-- Priority Filter -->
			<FilterDropdown
				label="Priority"
				options={priorityOptions}
				selected={selectedPriorities}
				onToggle={togglePriority}
				style="checkbox"
				menuWidth="w-40"
			/>

			<!-- Status Filter -->
			<FilterDropdown
				label="Status"
				options={statusOptions}
				selected={selectedStatuses}
				onToggle={toggleStatus}
				style="checkbox"
				menuWidth="w-44"
			/>

			<!-- Type Filter -->
			{#if typeOptions.length > 0}
				<FilterDropdown
					label="Type"
					options={typeOptions}
					selected={selectedTypes}
					onToggle={toggleType}
					emptyMeansAll={true}
					style="checkbox"
					menuWidth="w-40"
				/>
			{/if}

			<!-- Labels Filter -->
			{#if labelOptions.length > 0}
				<FilterDropdown
					label="Labels"
					options={labelOptions}
					selected={selectedLabels}
					onToggle={toggleLabel}
					emptyMeansAll={true}
					style="checkbox"
					menuWidth="w-48"
					maxHeight="max-h-60"
				/>
			{/if}

			<!-- Grouping Mode Toggle - Industrial btn-group -->
			<div class="join rounded" style="border: 1px solid oklch(0.35 0.02 250);">
				<!-- Parent grouping (folder icon) - DEFAULT -->
				<button
					class="join-item btn btn-xs px-2"
					style={groupingMode === 'parent'
						? 'background: oklch(0.50 0.18 240); color: oklch(0.95 0.02 250); border: none;'
						: 'background: oklch(0.22 0.01 250); color: oklch(0.55 0.02 250); border: none;'}
					onclick={() => setGroupingMode('parent')}
					title="Group by Parent Epic"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
					</svg>
				</button>
				<!-- Type grouping (list icon) -->
				<button
					class="join-item btn btn-xs px-2"
					style={groupingMode === 'type'
						? 'background: oklch(0.50 0.18 240); color: oklch(0.95 0.02 250); border: none;'
						: 'background: oklch(0.22 0.01 250); color: oklch(0.55 0.02 250); border: none;'}
					onclick={() => setGroupingMode('type')}
					title="Group by Type"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
					</svg>
				</button>
				<!-- Label grouping (tag icon) -->
				<button
					class="join-item btn btn-xs px-2"
					style={groupingMode === 'label'
						? 'background: oklch(0.50 0.18 240); color: oklch(0.95 0.02 250); border: none;'
						: 'background: oklch(0.22 0.01 250); color: oklch(0.55 0.02 250); border: none;'}
					onclick={() => setGroupingMode('label')}
					title="Group by Label"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6z" />
					</svg>
				</button>
			</div>

			<!-- Clear Filters - Industrial -->
			{#if searchQuery || selectedProjects.size > 0 || selectedPriorities.size < 4 || selectedStatuses.size !== 2 || !selectedStatuses.has('open') || !selectedStatuses.has('in_progress') || selectedTypes.size > 0 || selectedLabels.size > 0}
				<button
					class="px-3 py-1 rounded font-mono text-xs tracking-wider uppercase transition-all industrial-hover"
					style="
						color: oklch(0.70 0.20 25);
						border: 1px solid oklch(0.70 0.20 25 / 0.3);
					"
					onclick={clearAllFilters}
				>
					Clear
				</button>
			{/if}

			<!-- Right side: Selection controls or task count -->
			<div class="ml-auto flex items-center gap-2">
				{#if selectedTasks.size > 0}
					<!-- Selection mode - Industrial -->
					<span
						class="font-mono text-xs tracking-wider"
						style="color: oklch(0.70 0.18 240);"
					>
						{selectedTasks.size} SELECTED
					</span>
					<div class="dropdown dropdown-end">
						<div
							tabindex="0"
							role="button"
							class="px-3 py-1.5 rounded font-mono text-xs tracking-wider uppercase cursor-pointer transition-all industrial-hover flex items-center gap-1"
							style="
								background: linear-gradient(135deg, oklch(0.70 0.18 240 / 0.2) 0%, oklch(0.70 0.18 240 / 0.1) 100%);
								border: 1px solid oklch(0.70 0.18 240 / 0.4);
								color: oklch(0.80 0.15 240);
							"
						>
							Bulk Actions
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
							</svg>
						</div>
						<ul
							tabindex="0"
							class="dropdown-content z-50 menu p-2 shadow rounded-box w-52"
							style="
								background: oklch(0.20 0.01 250);
								border: 1px solid oklch(0.35 0.02 250);
							"
						>
							<li><button onclick={handleBulkAssign} class="gap-2">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
									<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
								</svg>
								Assign to...
							</button></li>
							<li><button onclick={handleBulkRelease} class="gap-2">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
									<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
								</svg>
								Release
							</button></li>
							<li><button onclick={handleBulkSpawn} class="gap-2" disabled={spawningBulk || spawningSingle !== null}>
								{#if spawningBulk}
									<span class="loading loading-spinner loading-xs"></span>
								{:else}
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
										<path stroke-linecap="round" stroke-linejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
									</svg>
								{/if}
								Spawn Agents
							</button></li>
							<li>
								<details>
									<summary class="gap-2">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0l-3.75-3.75M17.25 21l3.75-3.75" />
										</svg>
										Change Priority
									</summary>
									<ul class="bg-base-100 rounded-box">
										<li><button onclick={() => handleBulkChangePriority(0)}>P0 - Critical</button></li>
										<li><button onclick={() => handleBulkChangePriority(1)}>P1 - High</button></li>
										<li><button onclick={() => handleBulkChangePriority(2)}>P2 - Medium</button></li>
										<li><button onclick={() => handleBulkChangePriority(3)}>P3 - Low</button></li>
									</ul>
								</details>
							</li>
							<li>
								<details>
									<summary class="gap-2">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
										</svg>
										Change Status
									</summary>
									<ul class="bg-base-100 rounded-box">
										<li><button onclick={() => handleBulkChangeStatus('open')}>Open</button></li>
										<li><button onclick={() => handleBulkChangeStatus('in_progress')}>In Progress</button></li>
										<li><button onclick={() => handleBulkChangeStatus('blocked')}>Blocked</button></li>
										<li><button onclick={() => handleBulkChangeStatus('closed')}>Closed</button></li>
									</ul>
								</details>
							</li>
							<li><button onclick={handleBulkAddLabel} class="gap-2">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
									<path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
									<path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6z" />
								</svg>
								Add Label
							</button></li>
							<div class="divider my-1"></div>
							<li><button onclick={handleBulkDelete} class="gap-2 text-error hover:bg-error/10">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
									<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
								</svg>
								Delete
							</button></li>
						</ul>
					</div>
					<button
						class="px-2 py-1 rounded font-mono text-xs tracking-wider uppercase transition-all industrial-hover"
						style="color: oklch(0.60 0.02 250);"
						onclick={clearSelection}
					>
						Clear
					</button>
				{/if}
			</div>
		</div>
	</div>

	<!-- Bulk Action Error -->
	{#if bulkActionError}
		<div class="alert alert-error mx-4 mt-2">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
			</svg>
			<span>{bulkActionError}</span>
			<button class="btn btn-sm btn-ghost" onclick={() => bulkActionError = ''}>Dismiss</button>
		</div>
	{/if}

	<!-- Bulk Action Loading Overlay -->
	{#if bulkActionLoading}
		<div class="mx-4 mt-2">
			<div class="alert">
				<span class="loading loading-spinner loading-sm"></span>
				<span>Processing {selectedTasks.size} task(s)...</span>
			</div>
		</div>
	{/if}

	<!-- Table - Industrial Style -->
	<!-- ondragover/ondrop prevent browser from navigating to dropped files -->
	<div
		class="flex-1 overflow-x-auto overflow-y-auto"
		style="background: oklch(0.16 0.01 250);"
		ondragover={(e) => e.preventDefault()}
		ondrop={(e) => e.preventDefault()}
	>
		<table class="table table-xs table-pin-rows table-pin-cols w-full">
			<!-- Main column headers (always pinned at top) - Industrial -->
			<thead>
				<tr style="background: linear-gradient(180deg, oklch(0.20 0.01 250) 0%, oklch(0.18 0.01 250) 100%);">
					<th class="w-10" style="background: inherit;">
						<input
							type="checkbox"
							class="checkbox checkbox-sm"
							checked={allSelected}
							indeterminate={partialSelected}
							onchange={toggleAll}
							onclick={(e) => e.stopPropagation()}
							style="border-color: oklch(0.45 0.02 250);"
						/>
					</th>
					<th
						class="cursor-pointer w-auto min-w-32 industrial-hover"
						style="background: inherit;"
						onclick={() => handleSort('id')}
					>
						<div class="flex items-center gap-1 font-mono text-xs tracking-wider uppercase" style="color: oklch(0.60 0.02 250);">
							ID
							{#if sortColumn === 'id'}
								<span style="color: oklch(0.70 0.18 240);">{sortDirection === 'asc' ? '▲' : '▼'}</span>
							{/if}
						</div>
					</th>
					<td class="w-10" style="background: inherit;">
						<span class="font-mono text-xs tracking-wider uppercase" style="color: oklch(0.60 0.02 250);"></span>
					</td>
					<td
						class="cursor-pointer industrial-hover"
						style="background: inherit;"
						onclick={() => handleSort('title')}
					>
						<div class="flex items-center gap-1 font-mono text-xs tracking-wider uppercase" style="color: oklch(0.60 0.02 250);">
							Title
							{#if sortColumn === 'title'}
								<span style="color: oklch(0.70 0.18 240);">{sortDirection === 'asc' ? '▲' : '▼'}</span>
							{/if}
						</div>
					</td>
					<th class="w-28" style="background: inherit;">
						<span class="font-mono text-xs tracking-wider uppercase" style="color: oklch(0.60 0.02 250);" title="Drag & drop images to attach screenshots">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
							</svg>
						</span>
					</th>
					<td
						class="cursor-pointer w-16 text-center industrial-hover"
						style="background: inherit;"
						onclick={() => handleSort('priority')}
					>
						<div class="flex items-center justify-center gap-1 font-mono text-xs tracking-wider uppercase" style="color: oklch(0.60 0.02 250);">
							P
							{#if sortColumn === 'priority'}
								<span style="color: oklch(0.70 0.18 240);">{sortDirection === 'asc' ? '▲' : '▼'}</span>
							{/if}
						</div>
					</td>
					<td class="w-32" style="background: inherit;">
						<span class="font-mono text-xs tracking-wider uppercase" style="color: oklch(0.60 0.02 250);">Labels</span>
					</td>
					<td
						class="cursor-pointer w-16 industrial-hover"
						style="background: inherit;"
						onclick={() => handleSort('updated')}
					>
						<div class="flex items-center gap-1 font-mono text-xs tracking-wider uppercase" style="color: oklch(0.60 0.02 250);">
							Age
							{#if sortColumn === 'updated'}
								<span style="color: oklch(0.70 0.18 240);">{sortDirection === 'asc' ? '▲' : '▼'}</span>
							{/if}
						</div>
					</td>
				</tr>
			</thead>

			{#if sortedTasks.length === 0}
				<!-- Empty state - Mission Control Style -->
				<tbody>
					<tr>
						<td colspan="8" class="p-0">
							<div
								class="relative flex flex-col items-center justify-center py-16 overflow-hidden"
								style="
									background:
										radial-gradient(circle at 50% 50%, oklch(0.20 0.02 240 / 0.3) 0%, transparent 50%),
										linear-gradient(180deg, oklch(0.14 0.01 250) 0%, oklch(0.12 0.01 250) 100%);
								"
							>
								<!-- Subtle grid pattern -->
								<div
									class="absolute inset-0 opacity-[0.03]"
									style="
										background-image:
											linear-gradient(oklch(0.70 0.18 240) 1px, transparent 1px),
											linear-gradient(90deg, oklch(0.70 0.18 240) 1px, transparent 1px);
										background-size: 40px 40px;
									"
								></div>

								<!-- Radar container -->
								<div class="relative w-32 h-32 mb-6">
									<!-- Outer ring -->
									<div
										class="absolute inset-0 rounded-full"
										style="
											border: 1px solid oklch(0.70 0.18 240 / 0.2);
											box-shadow: 0 0 20px oklch(0.70 0.18 240 / 0.1);
										"
									></div>

									<!-- Middle ring -->
									<div
										class="absolute inset-4 rounded-full"
										style="border: 1px solid oklch(0.70 0.18 240 / 0.15);"
									></div>

									<!-- Inner ring -->
									<div
										class="absolute inset-8 rounded-full"
										style="border: 1px solid oklch(0.70 0.18 240 / 0.1);"
									></div>

									<!-- Cross hairs -->
									<div
										class="absolute top-1/2 left-0 right-0 h-px"
										style="background: oklch(0.70 0.18 240 / 0.1);"
									></div>
									<div
										class="absolute left-1/2 top-0 bottom-0 w-px"
										style="background: oklch(0.70 0.18 240 / 0.1);"
									></div>

									<!-- Radar sweep -->
									<div
										class="absolute inset-0 rounded-full radar-sweep"
										style="
											background: conic-gradient(
												from 0deg,
												transparent 0deg,
												oklch(0.70 0.18 240 / 0.3) 30deg,
												transparent 60deg
											);
										"
									></div>

									<!-- Center dot (pulsing) -->
									<div class="absolute inset-0 flex items-center justify-center">
										<div
											class="w-2 h-2 rounded-full radar-pulse"
											style="background: oklch(0.70 0.18 240); box-shadow: 0 0 10px oklch(0.70 0.18 240);"
										></div>
									</div>
								</div>

								<!-- Status text -->
								<div class="relative z-10 text-center">
									<p
										class="font-mono text-sm tracking-widest uppercase mb-1"
										style="color: oklch(0.70 0.18 240);"
									>
										All Clear
									</p>
									<p
										class="font-mono text-xs tracking-wide"
										style="color: oklch(0.50 0.02 250);"
									>
										No tasks matching current filters
									</p>
								</div>

								<!-- Action buttons -->
								{#if searchQuery || selectedProjects.size > 0 || selectedPriorities.size < 4 || selectedStatuses.size !== 2 || !selectedStatuses.has('open') || !selectedStatuses.has('in_progress') || selectedTypes.size > 0 || selectedLabels.size > 0}
									<button
										class="relative z-10 mt-6 px-4 py-2 rounded font-mono text-xs tracking-wider uppercase transition-all"
										style="
											background: oklch(0.70 0.18 240 / 0.1);
											border: 1px solid oklch(0.70 0.18 240 / 0.3);
											color: oklch(0.70 0.18 240);
										"
										onmouseenter={(e) => e.currentTarget.style.background = 'oklch(0.70 0.18 240 / 0.2)'}
										onmouseleave={(e) => e.currentTarget.style.background = 'oklch(0.70 0.18 240 / 0.1)'}
										onclick={clearAllFilters}
									>
										Clear Filters
									</button>
								{/if}

								<!-- Decorative corner accents -->
								<div class="absolute top-4 left-4 w-8 h-8">
									<div class="absolute top-0 left-0 w-full h-px" style="background: linear-gradient(90deg, oklch(0.70 0.18 240 / 0.3), transparent);"></div>
									<div class="absolute top-0 left-0 h-full w-px" style="background: linear-gradient(180deg, oklch(0.70 0.18 240 / 0.3), transparent);"></div>
								</div>
								<div class="absolute top-4 right-4 w-8 h-8">
									<div class="absolute top-0 right-0 w-full h-px" style="background: linear-gradient(270deg, oklch(0.70 0.18 240 / 0.3), transparent);"></div>
									<div class="absolute top-0 right-0 h-full w-px" style="background: linear-gradient(180deg, oklch(0.70 0.18 240 / 0.3), transparent);"></div>
								</div>
								<div class="absolute bottom-4 left-4 w-8 h-8">
									<div class="absolute bottom-0 left-0 w-full h-px" style="background: linear-gradient(90deg, oklch(0.70 0.18 240 / 0.3), transparent);"></div>
									<div class="absolute bottom-0 left-0 h-full w-px" style="background: linear-gradient(0deg, oklch(0.70 0.18 240 / 0.3), transparent);"></div>
								</div>
								<div class="absolute bottom-4 right-4 w-8 h-8">
									<div class="absolute bottom-0 right-0 w-full h-px" style="background: linear-gradient(270deg, oklch(0.70 0.18 240 / 0.3), transparent);"></div>
									<div class="absolute bottom-0 right-0 h-full w-px" style="background: linear-gradient(0deg, oklch(0.70 0.18 240 / 0.3), transparent);"></div>
								</div>
							</div>
						</td>
					</tr>
				</tbody>
			{:else}
				<!-- Grouped tasks with sticky headers -->
				{#each Array.from(groupedTasks.entries()) as [groupKey, typeTasks]}
					{#if typeTasks.length > 0}
						<!-- Group header (pinned when scrolling) - Industrial/Terminal style -->
						{@const typeVisual = getGroupHeaderInfo(groupingMode, groupKey)}
						{@const parentTask = groupingMode === 'parent' && groupKey ? [...(allTasks.length > 0 ? allTasks : tasks)].find(t => t.id === groupKey) : null}
						{@const isCollapsed = collapsedGroups.has(groupKey)}
						{@const workingAgents = [...new Set(typeTasks.filter(t => t.status === 'in_progress' && t.assignee).map(t => t.assignee))]}
						<thead>
							<tr
								class="cursor-pointer select-none hover:brightness-110 transition-all"
								onclick={() => toggleGroupCollapse(groupKey)}
								title={isCollapsed ? 'Click to expand' : 'Click to collapse'}
							>
								<th
									colspan="8"
									class="p-0 border-b border-base-content/10"
									style="background: linear-gradient(90deg, {typeVisual.bgTint} 0%, transparent 60%);"
								>
									<div class="flex items-center gap-0">
										<!-- Bold accent bar -->
										<div
											class="w-1 self-stretch"
											style="background: {typeVisual.accent};"
										></div>

										<!-- Collapse/Expand chevron -->
										<div
											class="flex items-center justify-center w-6 h-9 text-base-content/40 transition-transform duration-200"
											style="transform: rotate({isCollapsed ? '-90deg' : '0deg'});"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
												<path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
											</svg>
										</div>

										<!-- Icon container with subtle glow -->
										<div
											class="flex items-center justify-center w-8 h-9 text-lg"
											style="text-shadow: 0 0 8px {typeVisual.accent};"
										>
											{typeVisual.icon}
										</div>

										<!-- Type label - monospace, uppercase, tracked -->
										<span
											class="font-mono font-bold text-xs tracking-[0.2em] uppercase"
											style="color: {typeVisual.accent};"
										>
											{typeVisual.label}
										</span>

										<!-- Parent task title (shown in parent mode) -->
										{#if groupingMode === 'parent' && parentTask?.title}
											<span class="ml-2 text-sm text-base-content/70 truncate max-w-md" title={parentTask.title}>
												{parentTask.title}
											</span>
										{/if}

										<!-- Working agents avatars -->
										{#if workingAgents.length > 0}
											<div class="flex items-center -space-x-1 ml-3">
												{#each workingAgents.slice(0, 4) as agentName}
													<WorkingAgentBadge
														name={agentName || ''}
														size={20}
														isWorking={true}
														variant="avatar"
														onClick={onagentclick}
													/>
												{/each}
												{#if workingAgents.length > 4}
													<div class="avatar placeholder w-5">
														<div class="bg-neutral text-neutral-content w-5 rounded-full text-[9px] font-mono">
															+{workingAgents.length - 4}
														</div>
													</div>
												{/if}
											</div>
										{/if}

										<!-- Decorative line -->
										<div
											class="flex-1 h-px mx-3 opacity-30"
											style="background: linear-gradient(90deg, {typeVisual.accent}, transparent);"
										></div>

										<!-- Count badge -->
										<div class="pr-3 flex items-center gap-1.5">
											<span class="font-mono text-xs text-base-content/40">{typeTasks.length}</span>
											<span class="text-base-content/30 text-xs">
												{typeTasks.length === 1 ? 'task' : 'tasks'}
											</span>
										</div>
									</div>
								</th>
							</tr>
						</thead>
						{#if !isCollapsed}
						<tbody>
							{#each typeTasks as task (task.id)}
								{@const depStatus = analyzeDependencies(task)}
									{@const taskIsActive = task.status === 'in_progress' && task.assignee}
									{@const isNewTask = newTaskIds.includes(task.id)}
									{@const isStarting = startingTaskIds.includes(task.id)}
									{@const isCompleted = completedTaskIds.includes(task.id)}
									{@const unresolvedBlockers = task.depends_on?.filter(d => d.status !== 'closed') || []}
									{@const allTasksList = allTasks.length > 0 ? allTasks : tasks}
									{@const blockedTasks = allTasksList.filter(t => t.depends_on?.some(d => d.id === task.id) && t.status !== 'closed')}
									{@const elapsed = task.status === 'in_progress' ? getElapsedTime(task.updated_at) : null}
									{@const fireScale = elapsed ? getFireScale(elapsed.minutes) : 1}
									<!-- Main task row -->
									<tr
										class="cursor-pointer group overflow-visible industrial-row {depStatus.hasBlockers ? 'opacity-70' : ''} {isNewTask ? 'task-new-entrance' : ''} {isStarting ? 'task-starting' : ''} {isCompleted ? 'task-completed' : ''}"
										style="
											background: {dragOverTask === task.id ? 'oklch(0.70 0.18 240 / 0.15)' : selectedTasks.has(task.id) ? 'oklch(0.70 0.18 240 / 0.1)' : taskIsActive ? 'oklch(0.70 0.18 240 / 0.05)' : 'oklch(0.16 0.01 250)'};
											border-bottom: 1px solid oklch(0.25 0.01 250);
											border-left: 2px solid {dragOverTask === task.id ? 'oklch(0.70 0.18 240)' : selectedTasks.has(task.id) ? 'oklch(0.70 0.18 240)' : unresolvedBlockers.length > 0 ? 'oklch(0.55 0.18 30 / 0.4)' : taskIsActive ? 'oklch(0.70 0.18 240 / 0.5)' : 'transparent'};
										"
										onclick={() => handleRowClick(task.id)}
										ondrop={(e) => handleImageDrop(e, task.id)}
										ondragover={(e) => handleImageDragOver(e, task.id)}
										ondragleave={handleImageDragLeave}
										title={depStatus.hasBlockers ? `Blocked: ${depStatus.blockingReason}` : ''}
									>
										<th
											style="background: inherit;"
											onclick={(e) => e.stopPropagation()}
										>
											<input
												type="checkbox"
												class="checkbox checkbox-sm"
												checked={selectedTasks.has(task.id)}
												onchange={() => toggleTask(task.id)}
												style="border-color: oklch(0.45 0.02 250);"
											/>
										</th>
										<th style="background: inherit;">
											<TaskIdBadge
												{task}
												size="xs"
												showType={false}
												showAssignee={false}
												{elapsed}
												copyOnly
												blockedBy={unresolvedBlockers}
												blocks={blockedTasks}
												showDependencies={true}
												onOpenTask={handleRowClick}
												onAgentClick={onagentclick}
											/>
										</th>
										<td style="background: inherit;" onclick={(e) => e.stopPropagation()}>
											<TaskActionButton
												{task}
												{agents}
												spawning={spawningSingle === task.id}
												hasBlockers={depStatus.hasBlockers}
												blockingReason={depStatus.blockingReason}
												onspawn={handleSpawnSingle}
												{fireScale}
												onattach={(sessionName) => {
													// Open tmux session in new terminal
													const command = `tmux attach-session -t "${sessionName}"`;
													navigator.clipboard.writeText(command);
													alert(`Command copied to clipboard:\n${command}\n\nPaste in terminal to attach.`);
												}}
											/>
										</td>
										<td style="background: inherit;">
											<div>
												<div class="font-medium text-sm" style="color: oklch(0.85 0.02 250);">{task.title}</div>
												{#if task.description}
													<div class="text-xs" style="color: oklch(0.55 0.02 250);">
														{task.description}
													</div>
												{/if}
											</div>
										</td>
										<!-- Image drop zone cell - supports multiple images -->
										<td
											style="background: inherit;"
											onclick={(e) => e.stopPropagation()}
											ondrop={(e) => handleImageDrop(e, task.id)}
											ondragover={(e) => handleImageDragOver(e, task.id)}
											ondragleave={handleImageDragLeave}
											class="relative w-28"
										>
											<div class="flex items-center gap-1 overflow-x-auto">
												{#if uploadingImage === task.id}
													<!-- Uploading state -->
													<div class="w-6 h-6 flex items-center justify-center">
														<span class="loading loading-spinner loading-xs"></span>
													</div>
												{/if}
												{#each taskImages.get(task.id) || [] as img (img.id)}
													<!-- Image thumbnail with remove button -->
													<div class="relative group flex-shrink-0">
														<img
															src={img.preview}
															alt="Task attachment"
															class="w-6 h-6 object-cover rounded border border-base-content/20 cursor-pointer hover:border-primary transition-colors"
															title={img.path || 'Attached image'}
														/>
														<!-- Remove button on hover -->
														<button
															class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-error text-error-content flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[8px] leading-none"
															onclick={(e) => removeTaskImage(task.id, img.id, e)}
															title="Remove image"
														>
															×
														</button>
													</div>
												{/each}
												<!-- Add more button / empty drop zone -->
												<div
													class="w-6 h-6 rounded border border-dashed flex items-center justify-center transition-all flex-shrink-0"
													style="border-color: {dragOverTask === task.id ? 'oklch(0.70 0.18 240)' : 'oklch(0.35 0.02 250)'}; background: {dragOverTask === task.id ? 'oklch(0.70 0.18 240 / 0.1)' : 'transparent'};"
													title={(taskImages.get(task.id) || []).length > 0 ? 'Drop to add another image' : 'Drop image here to attach'}
												>
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3" style="color: {dragOverTask === task.id ? 'oklch(0.70 0.18 240)' : 'oklch(0.45 0.02 250)'};">
														<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
													</svg>
												</div>
											</div>
										</td>
									<td class="text-center" style="background: inherit;">
										<span class="badge badge-sm {getPriorityBadge(task.priority)}">
											P{task.priority}
										</span>
									</td>
									<td style="background: inherit;">
										{#if task.labels && task.labels.length > 0}
											<LabelBadges labels={task.labels} maxDisplay={2} />
										{:else}
											<span style="color: oklch(0.40 0.02 250);">-</span>
										{/if}
									</td>
									<td style="background: inherit;">
										<span class="text-xs font-mono {getAgeColorClass(task.updated_at)}" title={formatFullDate(task.updated_at)}>
											{formatRelativeTime(task.updated_at)}
										</span>
									</td>
								</tr>
							{/each}
						</tbody>
						{/if}
					{/if}
				{/each}

				<!-- Render exiting tasks with exit animation -->
				{#if exitingTasks.length > 0}
					<tbody>
						{#each exitingTasks as task (task.id)}
							{@const isTaskCompleted = task.status === 'closed'}
							<tr
								class="{isTaskCompleted ? 'task-completed-exit' : 'task-exit'}"
								style="
									background: {isTaskCompleted ? 'oklch(0.70 0.19 145 / 0.1)' : 'oklch(0.70 0.20 25 / 0.1)'};
									border-bottom: 1px solid oklch(0.25 0.01 250);
									border-left: 2px solid {isTaskCompleted ? 'oklch(0.70 0.19 145 / 0.5)' : 'oklch(0.70 0.20 25 / 0.5)'};
								"
							>
								<th style="background: inherit;"></th>
								<th style="background: inherit;">
									<TaskIdBadge {task} size="xs" showType={false} showAssignee={false} copyOnly />
								</th>
								<td style="background: inherit;">
									{#if isTaskCompleted}
										<!-- Rocket landing animation for completed tasks -->
										<div class="rocket-btn rocket-landing">
											<div class="relative w-5 h-5 flex items-center justify-center overflow-visible">
												<!-- Rocket body -->
												<svg class="rocket-icon w-4 h-4" viewBox="0 0 24 24" fill="none">
													<path d="M12 2C12 2 8 6 8 12C8 15 9 17 10 18L10 21C10 21.5 10.5 22 11 22H13C13.5 22 14 21.5 14 21L14 18C15 17 16 15 16 12C16 6 12 2 12 2Z" fill="currentColor" />
													<circle cx="12" cy="10" r="2" fill="oklch(0.75 0.15 200)" />
													<path d="M8 14L5 17L6 18L8 16Z" fill="currentColor" />
													<path d="M16 14L19 17L18 18L16 16Z" fill="currentColor" />
												</svg>
												<!-- Fire (fading out) -->
												<div class="rocket-fire absolute bottom-0 left-1/2 -translate-x-1/2 w-2 origin-top opacity-0">
													<svg viewBox="0 0 12 20" class="w-full">
														<path d="M6 0 L9 8 L7 6 L6 12 L5 6 L3 8 Z" fill="url(#fireGradientExit-{task.id})" />
														<defs>
															<linearGradient id="fireGradientExit-{task.id}" x1="0%" y1="0%" x2="0%" y2="100%">
																<stop offset="0%" style="stop-color:#f0932b" />
																<stop offset="50%" style="stop-color:#f39c12" />
																<stop offset="100%" style="stop-color:#e74c3c" />
															</linearGradient>
														</defs>
													</svg>
												</div>
												<!-- Landing sparkle -->
												<div class="landing-sparkle absolute w-4 h-4 rounded-full left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0" style="background: radial-gradient(circle, oklch(0.85 0.2 145) 0%, transparent 70%);"></div>
												<!-- Checkmark -->
												<svg class="landing-checkmark absolute w-4 h-4 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none">
													<path d="M5 13l4 4L19 7" stroke="oklch(0.72 0.19 145)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
												</svg>
											</div>
										</div>
									{/if}
								</td>
								<td style="background: inherit;">
									<div class="font-medium text-sm" style="color: oklch(0.65 0.02 250);">{task.title}</div>
								</td>
								<td class="w-28" style="background: inherit;"></td><!-- Image column -->
								<td class="text-center" style="background: inherit;">
									<span class="badge badge-sm {getPriorityBadge(task.priority)}">
										P{task.priority}
									</span>
								</td>
								<td style="background: inherit;"></td>
								<td style="background: inherit;"></td>
								<td style="background: inherit;"></td>
							</tr>
						{/each}
					</tbody>
				{/if}
			{/if}
		</table>
	</div>
</div>
