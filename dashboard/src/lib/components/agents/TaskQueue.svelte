<script lang="ts">
	import { dndzone } from 'svelte-dnd-action';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import DependencyIndicator from '$lib/components/DependencyIndicator.svelte';
	import FilterDropdown from '$lib/components/FilterDropdown.svelte';
	import LabelBadges from '$lib/components/LabelBadges.svelte';
	import { analyzeDependencies } from '$lib/utils/dependencyUtils';
	import { getPriorityBadge } from '$lib/utils/badgeHelpers';
	import { toggleSetItem } from '$lib/utils/filterHelpers';
	import AnimatedDigits from '$lib/components/AnimatedDigits.svelte';
	import TaskIdBadge from '$lib/components/TaskIdBadge.svelte';
	import type { Task, Agent, Reservation } from '$lib/stores/agents.svelte';

	// Types
	interface FilterOption {
		value: string;
		label: string;
		count: number;
	}

	interface Props {
		tasks?: Task[];
		agents?: Agent[];
		reservations?: Reservation[];
		selectedProject?: string;
		ontaskclick?: (taskId: string) => void;
		onspawnfortask?: (taskId: string) => Promise<void>;
	}

	let { tasks = [], agents = [], reservations = [], selectedProject = 'All Projects', ontaskclick, onspawnfortask }: Props = $props();

	// Initialize filters from URL params (default to open tasks)
	let searchQuery = $state<string>('');
	let selectedPriorities = $state<Set<string>>(new Set(['0', '1', '2', '3'])); // All priorities by default
	let selectedStatuses = $state<Set<string>>(new Set(['open'])); // Default to open tasks only
	let selectedTypes = $state<Set<string>>(new Set()); // Empty = all types
	let selectedLabels = $state<Set<string>>(new Set());
	let dragDisabled = $state<boolean>(true);
	let isDragging = $state<boolean>(false);

	// Sync filters with URL on mount and page changes
	$effect(() => {
		const params = new URLSearchParams(window.location.search);
		searchQuery = params.get('search') || '';

		const priorities = params.get('priorities');
		if (priorities) {
			selectedPriorities = new Set(priorities.split(','));
		} else {
			selectedPriorities = new Set(['0', '1', '2', '3']); // Default: all priorities
		}

		const statuses = params.get('statuses');
		if (statuses) {
			selectedStatuses = new Set(statuses.split(','));
		} else {
			selectedStatuses = new Set(['open']); // Default: open only
		}

		const types = params.get('types');
		if (types) {
			selectedTypes = new Set(types.split(','));
		} else {
			selectedTypes = new Set(); // Default: all types
		}

		const labels = params.get('labels');
		if (labels) {
			selectedLabels = new Set(labels.split(','));
		} else {
			selectedLabels = new Set();
		}
	});

	// Update URL when filters change
	function updateURL(): void {
		const params = new URLSearchParams();

		if (searchQuery) params.set('search', searchQuery);
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

	// Compute filtered tasks using $derived.by()
	const filteredTasks = $derived.by(() => {
		let result = tasks;

		// Filter by search
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			result = result.filter(
				(task) =>
					task.title?.toLowerCase().includes(query) ||
					task.description?.toLowerCase().includes(query)
			);
		}

		// Filter by priority (OR logic: task priority must be in selected set)
		if (selectedPriorities.size > 0 && selectedPriorities.size < 4) {
			result = result.filter((task) => selectedPriorities.has(String(task.priority)));
		}

		// Filter by status (OR logic: task status must be in selected set)
		if (selectedStatuses.size > 0) {
			result = result.filter((task) => selectedStatuses.has(task.status));
		}

		// Filter by type (OR logic: task type must be in selected set)
		if (selectedTypes.size > 0) {
			result = result.filter((task) => selectedTypes.has(task.issue_type));
		}

		// Filter by labels (AND logic: task must have ALL selected labels)
		if (selectedLabels.size > 0) {
			result = result.filter((task) => {
				const taskLabels = task.labels || [];
				return Array.from(selectedLabels).every((label) => taskLabels.includes(label));
			});
		}

		return result;
	});

	// Get unique labels from tasks
	const availableLabels = $derived.by((): string[] => {
		const labelsSet = new Set<string>();
		tasks.forEach((task) => {
			task.labels?.forEach((label: string) => labelsSet.add(label));
		});
		return Array.from(labelsSet).sort();
	});

	// Get unique types from tasks
	const availableTypes = $derived.by((): string[] => {
		const typesSet = new Set<string>();
		tasks.forEach((task) => {
			if (task.issue_type) typesSet.add(task.issue_type);
		});
		return Array.from(typesSet).sort();
	});

	// Filter options for FilterDropdown components
	const priorityOptions = $derived(['0', '1', '2', '3'].map(p => ({
		value: p,
		label: `P${p}`,
		count: tasks.filter(t => String(t.priority) === p).length
	})));

	const statusOptions = $derived(['open', 'in_progress', 'blocked', 'closed'].map(s => ({
		value: s,
		label: s,
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
	function togglePriority(priority: string): void {
		selectedPriorities = toggleSetItem(selectedPriorities, priority);
		updateURL();
	}

	function toggleStatus(status: string): void {
		selectedStatuses = toggleSetItem(selectedStatuses, status);
		updateURL();
	}

	function toggleType(type: string): void {
		selectedTypes = toggleSetItem(selectedTypes, type);
		updateURL();
	}

	function toggleLabel(label: string): void {
		selectedLabels = toggleSetItem(selectedLabels, label);
		updateURL();
	}

	// Clear all filters
	function clearAllFilters(): void {
		searchQuery = '';
		selectedPriorities = new Set(['0', '1', '2', '3']); // Reset to all priorities
		selectedStatuses = new Set(['open']); // Reset to open only
		selectedTypes = new Set(); // Reset to all types
		selectedLabels = new Set();
		updateURL();
	}

	// Handle drag start - enable dragging
	function handleDragStart(event: DragEvent): void {
		isDragging = true;
		dragDisabled = false;
		// Store task data for drop handling
		const target = event.target as HTMLElement;
		const taskId = target.closest('[data-task-id]')?.getAttribute('data-task-id');
		if (taskId && event.dataTransfer) {
			event.dataTransfer.setData('text/plain', taskId);
			event.dataTransfer.effectAllowed = 'move';
		}
	}

	// Handle drag end - disable dragging
	function handleDragEnd(): void {
		dragDisabled = true;
		// Delay resetting isDragging to prevent click event firing
		setTimeout(() => {
			isDragging = false;
		}, 100);
	}

	// Handle task click - open drawer
	function handleTaskClick(taskId: string): void {
		// Don't trigger click if we're dragging
		if (isDragging) return;

		// Emit event to parent component
		if (ontaskclick) {
			ontaskclick(taskId);
		}
	}

	// Copy to clipboard
	let copiedTaskId = $state<string | null>(null);

	async function copyTaskId(taskId: string, event: MouseEvent): Promise<void> {
		event.stopPropagation(); // Don't trigger card click
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

	// Start Work button state
	let spawningTaskId = $state<string | null>(null);

	async function handleStartWork(taskId: string, event: MouseEvent): Promise<void> {
		event.stopPropagation(); // Don't trigger card click
		if (!onspawnfortask || spawningTaskId) return;

		spawningTaskId = taskId;
		try {
			await onspawnfortask(taskId);
		} catch (err) {
			console.error('Failed to start work:', err);
		} finally {
			spawningTaskId = null;
		}
	}
</script>

<div class="flex flex-col h-full">
	<!-- Header -->
	<div class="p-4 pb-1 border-b border-base-300">
		<input
			type="text"
			placeholder="Search {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}..."
			class="industrial-input w-full mb-3"
			bind:value={searchQuery}
			oninput={() => updateURL()}
		/>

		<!-- Filters -->
		<div class="flex flex-col gap-1">
			<!-- Priority Filter -->
			<div class="flex flex-col">
				<span class="industrial-label flex items-center gap-0.5">Priority (<AnimatedDigits value={selectedPriorities.size.toString()} /> selected)</span>
				<div class="p-2 bg-base-200 rounded-lg">
					<FilterDropdown
						label="Priority"
						options={priorityOptions}
						selected={selectedPriorities}
						onToggle={togglePriority}
						mode="inline"
					/>
				</div>
			</div>

			<!-- Status Filter -->
			<div class="flex flex-col">
				<span class="industrial-label flex items-center gap-0.5">Status (<AnimatedDigits value={selectedStatuses.size.toString()} /> selected)</span>
				<div class="p-2 bg-base-200 rounded-lg">
					<FilterDropdown
						label="Status"
						options={statusOptions}
						selected={selectedStatuses}
						onToggle={toggleStatus}
						mode="inline"
					/>
				</div>
			</div>

			<!-- Type Filter -->
			{#if typeOptions.length > 0}
				<div class="flex flex-col">
					<span class="industrial-label flex items-center gap-0.5">Type (<AnimatedDigits value={selectedTypes.size > 0 ? selectedTypes.size.toString() : 'all'} /> selected)</span>
					<div class="p-2 bg-base-200 rounded-lg">
						<FilterDropdown
							label="Type"
							options={typeOptions}
							selected={selectedTypes}
							onToggle={toggleType}
							mode="inline"
						/>
					</div>
				</div>
			{/if}

			<!-- Labels Filter -->
			{#if labelOptions.length > 0}
				<div class="flex flex-col">
					<span class="industrial-label flex items-center gap-0.5">Labels (<AnimatedDigits value={selectedLabels.size.toString()} /> selected)</span>
					<div class="p-2 bg-base-200 rounded-lg max-h-40 overflow-y-auto">
						<FilterDropdown
							label="Labels"
							options={labelOptions}
							selected={selectedLabels}
							onToggle={toggleLabel}
							mode="inline"
						/>
					</div>
				</div>
			{/if}
		</div>

		<!-- Active Filters as Badges -->
		{#if searchQuery || selectedPriorities.size < 4 || selectedStatuses.size > 0 || selectedTypes.size > 0 || selectedLabels.size > 0}
			<div class="mt-3 mb-2">
				<div class="text-xs text-base-content/50 mb-1">Active Filters:</div>
				<div class="flex flex-wrap gap-1">
					{#if searchQuery}
						<span class="badge badge-sm badge-primary gap-1">
							🔍 {searchQuery}
							<button
								class="btn btn-ghost btn-xs p-0 h-auto min-h-0"
								onclick={() => {
									searchQuery = '';
									updateURL();
								}}
							>
								✕
							</button>
						</span>
					{/if}

					{#each Array.from(selectedPriorities) as priority}
						<span class="badge badge-sm badge-warning gap-1">
							P{priority}
							<button
								class="btn btn-ghost btn-xs p-0 h-auto min-h-0"
								onclick={() => togglePriority(priority)}
							>
								✕
							</button>
						</span>
					{/each}

					{#each Array.from(selectedStatuses) as status}
						<span class="badge badge-sm badge-info gap-1">
							{status}
							<button
								class="btn btn-ghost btn-xs p-0 h-auto min-h-0"
								onclick={() => toggleStatus(status)}
							>
								✕
							</button>
						</span>
					{/each}

					{#each Array.from(selectedTypes) as type}
						<span class="badge badge-sm badge-accent gap-1">
							{type}
							<button
								class="btn btn-ghost btn-xs p-0 h-auto min-h-0"
								onclick={() => toggleType(type)}
							>
								✕
							</button>
						</span>
					{/each}

					{#each Array.from(selectedLabels) as label}
						<span class="badge badge-sm badge-ghost gap-1">
							{label}
							<button
								class="btn btn-ghost btn-xs p-0 h-auto min-h-0"
								onclick={() => toggleLabel(label)}
							>
								✕
							</button>
						</span>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<!-- Task List -->
	<div class="flex-1 overflow-y-auto p-4">
		{#if filteredTasks.length === 0}
			<div class="text-center py-8 text-base-content/50">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-12 h-12 mx-auto mb-2 opacity-30"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
					/>
				</svg>
				<p>No tasks found</p>
				{#if searchQuery || selectedPriorities.size < 4 || selectedStatuses.size > 0 || selectedTypes.size > 0 || selectedLabels.size > 0}
					<button class="btn btn-sm btn-ghost mt-2" onclick={clearAllFilters}>
						Clear filters
					</button>
				{/if}
			</div>
		{:else}
			{#each filteredTasks as task (task.id)}
				{@const depStatus = analyzeDependencies(task)}
				<div
					class="card bg-base-100 border border-base-300 hover:border-primary cursor-pointer transition-all mb-4 {!dragDisabled ? 'opacity-50' : ''} {depStatus.hasBlockers ? 'opacity-60 border-error/30' : ''}"
					draggable="true"
					data-task-id={task.id}
					ondragstart={handleDragStart}
					ondragend={handleDragEnd}
					onclick={() => handleTaskClick(task.id)}
					title={depStatus.hasBlockers ? `⚠️ ${depStatus.blockingReason}` : ''}
				>
					<div class="card-body p-3 relative">
						<!-- Task ID badge on left -->
						<div class="absolute -top-2 left-2">
							<TaskIdBadge {task} size="xs" showStatus={false} showType={false} copyOnly />
						</div>

						<!-- Priority and Dependency badges on right -->
						<div class="absolute -top-2 right-2 flex items-center gap-1">
							<DependencyIndicator {task} allTasks={tasks} size="sm" />
							<span class="badge badge-sm {getPriorityBadge(task.priority)}">
								P{task.priority}
							</span>
						</div>

						<!-- Task Title -->
						<div class="mt-1.5 -mb-1">
							<h3 class="font-medium text-sm text-base-content truncate" title={task.title}>
								{task.title}
							</h3>
						</div>

						<!-- Task Description (truncated) -->
						{#if task.description}
							<p class="text-xs text-base-content/70 line-clamp-4">
								{task.description}
							</p>
						{/if}

						<!-- Labels -->
						{#if task.labels && task.labels.length > 0}
							<LabelBadges labels={task.labels} maxDisplay={3} class="mt-2" />
						{/if}

						<!-- Start Work Button -->
						{#if onspawnfortask && !depStatus.hasBlockers}
							<div class="mt-2 flex justify-end">
								<button
									class="btn btn-xs btn-primary gap-1"
									onclick={(e) => handleStartWork(task.id, e)}
									disabled={spawningTaskId === task.id}
									title="Start work on this task"
								>
									{#if spawningTaskId === task.id}
										<span class="loading loading-spinner loading-xs"></span>
										Starting...
									{:else}
										<!-- Play icon -->
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
											<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
										</svg>
										Start Work
									{/if}
								</button>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>
