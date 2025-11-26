<script lang="ts">
	import { page } from '$app/stores';
	import DependencyIndicator from '$lib/components/DependencyIndicator.svelte';
	import FilterDropdown from '$lib/components/FilterDropdown.svelte';
	import LabelBadges from '$lib/components/LabelBadges.svelte';
	import TaskIdBadge from '$lib/components/TaskIdBadge.svelte';
	import { analyzeDependencies } from '$lib/utils/dependencyUtils';
	import { getProjectFromTaskId } from '$lib/utils/projectUtils';
	import { getProjectColor } from '$lib/utils/projectColors';
	import { getPriorityBadge, getTaskStatusBadge, getTypeBadge } from '$lib/utils/badgeHelpers';
	import { formatRelativeTime, formatFullDate, normalizeTimestamp, getAgeColorClass } from '$lib/utils/dateFormatters';
	import { toggleSetItem } from '$lib/utils/filterHelpers';
	import { getTaskStatusVisual, STATUS_ICONS } from '$lib/config/statusColors';
	import { isAgentWorking as checkAgentWorking } from '$lib/utils/agentStatusUtils';
	import {
		bulkApiOperation,
		fetchWithTimeout,
		handleApiError,
		createPutRequest,
		createDeleteRequest
	} from '$lib/utils/bulkApiHelpers';

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

	interface Props {
		tasks?: Task[];
		allTasks?: Task[];
		agents?: Agent[];
		reservations?: Reservation[];
		ontaskclick?: (taskId: string) => void;
	}

	let { tasks = [], allTasks = [], agents = [], reservations = [], ontaskclick = () => {} }: Props = $props();

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

	// Grouped tasks by issue_type (for sticky type headers)
	const groupedTasks = $derived.by(() => {
		const groups = new Map();

		// Initialize groups in order
		for (const type of typeOrder) {
			groups.set(type, []);
		}

		// Group tasks by issue_type
		for (const task of filteredTasks) {
			const type = task.issue_type || null;
			if (!groups.has(type)) {
				groups.set(type, []);
			}
			groups.get(type).push(task);
		}

		// Sort tasks within each group
		for (const [type, tasks] of groups) {
			groups.set(type, sortTasks(tasks));
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

	// Track task IDs that are shown as dependencies (to avoid duplicate rendering)
	const shownAsDeps = $derived.by(() => {
		const depIds = new Set();
		for (const task of sortedTasks) {
			if (task.depends_on && task.depends_on.length > 0) {
				for (const dep of task.depends_on) {
					depIds.add(dep.id);
				}
			}
		}
		return depIds;
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
</script>

<div class="flex flex-col h-full">
	<!-- Filter Bar -->
	<div class="p-4 border-b border-base-300 bg-base-100 overflow-visible">
		<div class="flex flex-wrap items-center gap-3">
			<!-- Search -->
			<input
				type="text"
				placeholder="Search {sortedTasks.length} of {tasks.length} tasks..."
				class="input input-bordered input-sm min-w-40 max-w-64 shrink"
				bind:value={searchQuery}
				oninput={() => updateURL()}
			/>

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

			<!-- Clear Filters -->
			{#if searchQuery || selectedProjects.size > 0 || selectedPriorities.size < 4 || selectedStatuses.size !== 2 || !selectedStatuses.has('open') || !selectedStatuses.has('in_progress') || selectedTypes.size > 0 || selectedLabels.size > 0}
				<button class="btn btn-sm btn-ghost text-error" onclick={clearAllFilters}>
					Clear filters
				</button>
			{/if}

			<!-- Right side: Selection controls or task count -->
			<div class="ml-auto flex items-center gap-2">
				{#if selectedTasks.size > 0}
					<!-- Selection mode -->
					<span class="text-sm font-medium">{selectedTasks.size} selected</span>
					<div class="dropdown dropdown-end">
						<div tabindex="0" role="button" class="btn btn-sm btn-primary gap-1">
							Bulk Actions
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
							</svg>
						</div>
						<ul tabindex="0" class="dropdown-content z-50 menu p-2 shadow bg-base-100 rounded-box w-52 border border-base-300">
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
					<button class="btn btn-sm btn-ghost" onclick={clearSelection}>
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

	<!-- Table -->
	<div class="flex-1 overflow-x-auto overflow-y-auto">
		<table class="table table-xs table-pin-rows table-pin-cols w-full">
			<!-- Main column headers (always pinned at top) -->
			<thead>
				<tr class="bg-base-200">
					<th class="w-10 bg-base-200">
						<input
							type="checkbox"
							class="checkbox checkbox-sm"
							checked={allSelected}
							indeterminate={partialSelected}
							onchange={toggleAll}
							onclick={(e) => e.stopPropagation()}
						/>
					</th>
					<th class="cursor-pointer hover:bg-base-300 w-28 bg-base-200" onclick={() => handleSort('id')}>
						<div class="flex items-center gap-1">
							ID
							{#if sortColumn === 'id'}
								<span class="text-primary">{sortDirection === 'asc' ? '▲' : '▼'}</span>
							{/if}
						</div>
					</th>
					<td class="cursor-pointer hover:bg-base-300" onclick={() => handleSort('title')}>
						<div class="flex items-center gap-1">
							Title
							{#if sortColumn === 'title'}
								<span class="text-primary">{sortDirection === 'asc' ? '▲' : '▼'}</span>
							{/if}
						</div>
					</td>
					<td class="cursor-pointer hover:bg-base-300 w-16 text-center" onclick={() => handleSort('priority')}>
						<div class="flex items-center justify-center gap-1">
							P
							{#if sortColumn === 'priority'}
								<span class="text-primary">{sortDirection === 'asc' ? '▲' : '▼'}</span>
							{/if}
						</div>
					</td>
					<td class="w-32">Labels</td>
					<td class="w-10 whitespace-nowrap">Deps</td>
					<td class="cursor-pointer hover:bg-base-300 w-16" onclick={() => handleSort('updated')}>
						<div class="flex items-center gap-1">
							Age
							{#if sortColumn === 'updated'}
								<span class="text-primary">{sortDirection === 'asc' ? '▲' : '▼'}</span>
							{/if}
						</div>
					</td>
				</tr>
			</thead>

			{#if sortedTasks.length === 0}
				<!-- Empty state -->
				<tbody>
					<tr>
						<td colspan="7" class="text-center py-12">
							<div class="text-base-content/50">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12 mx-auto mb-2 opacity-30">
									<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
								</svg>
								<p>No tasks found</p>
								{#if searchQuery || selectedProjects.size > 0 || selectedPriorities.size < 4 || selectedStatuses.size !== 2 || !selectedStatuses.has('open') || !selectedStatuses.has('in_progress') || selectedTypes.size > 0 || selectedLabels.size > 0}
									<button class="btn btn-sm btn-ghost mt-2" onclick={clearAllFilters}>
										Clear filters
									</button>
								{/if}
							</div>
						</td>
					</tr>
				</tbody>
			{:else}
				<!-- Grouped tasks by type with sticky headers -->
				{#each Array.from(groupedTasks.entries()) as [type, typeTasks]}
					{#if typeTasks.length > 0}
						<!-- Type group header (pinned when scrolling) -->
						<thead>
							<tr>
								<th colspan="7" class="bg-base-300 text-base-content font-bold text-sm py-2">
									<div class="flex items-center gap-2">
										<span class="badge {getTypeBadge(type)} badge-sm">{type || 'no type'}</span>
										<span class="text-base-content/60 font-normal">({typeTasks.length})</span>
									</div>
								</th>
							</tr>
						</thead>
						<tbody>
							{#each typeTasks as task (task.id)}
								<!-- Skip if this task is shown as a dependency of another -->
								{#if !shownAsDeps.has(task.id)}
									{@const depStatus = analyzeDependencies(task)}
									{@const taskIsActive = task.status === 'in_progress' && task.assignee}
									<tr
										class="hover:bg-base-200/50 cursor-pointer transition-colors group overflow-visible {depStatus.hasBlockers ? 'opacity-60' : ''} {selectedTasks.has(task.id) ? 'bg-primary/10' : ''} {taskIsActive ? 'bg-info/10' : ''}"
										onclick={() => handleRowClick(task.id)}
										title={depStatus.hasBlockers ? `Blocked: ${depStatus.blockingReason}` : ''}
									>
										<th class="border-l-2 border-l-transparent group-hover:border-l-primary group-hover:bg-base-200/50 transition-colors {taskIsActive ? 'bg-info/10' : ''}" onclick={(e) => e.stopPropagation()}>
											<input
												type="checkbox"
												class="checkbox checkbox-sm"
												checked={selectedTasks.has(task.id)}
												onchange={() => toggleTask(task.id)}
											/>
										</th>
										<th class="group-hover:bg-base-200/50 {taskIsActive ? 'bg-info/10' : ''}">
											<TaskIdBadge {task} size="xs" showType={false} showAssignee={true} copyOnly />
										</th>
										<td class="{taskIsActive ? 'bg-info/10' : ''}">
											<div>
												<div class="font-medium text-sm">{task.title}</div>
												{#if task.description}
													<div class="text-xs text-base-content/50">
														{task.description}
													</div>
												{/if}
											</div>
										</td>
									<td class="text-center {taskIsActive ? 'bg-info/10' : ''}">
										<span class="badge badge-sm {getPriorityBadge(task.priority)}">
											P{task.priority}
										</span>
									</td>
									<td class="{taskIsActive ? 'bg-info/10' : ''}">
										{#if task.labels && task.labels.length > 0}
											<LabelBadges labels={task.labels} maxDisplay={2} />
										{:else}
											<span class="text-base-content/30">-</span>
										{/if}
									</td>
									<td class="whitespace-nowrap {taskIsActive ? 'bg-info/10' : ''}">
										<DependencyIndicator {task} allTasks={allTasks.length > 0 ? allTasks : tasks} size="sm" />
									</td>
									<td class="{taskIsActive ? 'bg-info/10' : ''}">
										<span class="text-xs {getAgeColorClass(task.updated_at)}" title={formatFullDate(task.updated_at)}>
											{formatRelativeTime(task.updated_at)}
										</span>
									</td>
								</tr>
								<!-- Render dependencies as indented child rows -->
								{#if task.depends_on && task.depends_on.length > 0}
									{#each task.depends_on as dep, depIndex (dep.id)}
										{@const depIsActive = dep.status === 'in_progress' && dep.assignee}
										<tr
											class="hover:bg-base-200/50 cursor-pointer transition-colors group {depIsActive ? 'bg-info/10' : 'opacity-80 bg-base-200/20'}"
											onclick={() => handleRowClick(dep.id)}
											title="Dependency: {dep.title}"
										>
											<th class="border-l-2 border-l-transparent group-hover:border-l-primary group-hover:bg-base-200/50 transition-colors {depIsActive ? 'bg-info/10' : ''}"></th>
											<th class="group-hover:bg-base-200/50 {depIsActive ? 'bg-info/10' : ''}">
												<div class="flex items-center gap-1">
													<span class="text-base-content/50 font-mono text-xs">{depIndex === task.depends_on.length - 1 ? '└──' : '├──'}</span>
													<TaskIdBadge task={{ id: dep.id, status: dep.status, issue_type: dep.issue_type, assignee: dep.assignee }} size="xs" showType={false} showAssignee={true} copyOnly />
												</div>
											</th>
											<td class="{depIsActive ? 'bg-info/10' : ''}">
												<div class="pl-4">
													<div class="text-xs text-base-content/70">{dep.title}</div>
												</div>
											</td>
											<td class="text-center {depIsActive ? 'bg-info/10' : ''}">
												<span class="badge badge-sm badge-ghost {getPriorityBadge(dep.priority)}">
													P{dep.priority}
												</span>
											</td>
											<td class="{depIsActive ? 'bg-info/10' : ''}"></td>
											<td class="{depIsActive ? 'bg-info/10' : ''}"></td>
											<td class="{depIsActive ? 'bg-info/10' : ''}"></td>
										</tr>
									{/each}
								{/if}
								{/if}
							{/each}
						</tbody>
					{/if}
				{/each}
			{/if}
		</table>
	</div>
</div>
