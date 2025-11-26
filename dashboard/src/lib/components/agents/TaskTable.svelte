<script>
	import { page } from '$app/stores';
	import DependencyIndicator from '$lib/components/DependencyIndicator.svelte';
	import { analyzeDependencies } from '$lib/utils/dependencyUtils';

	let { tasks = [], allTasks = [], agents = [], reservations = [], ontaskclick = () => {} } = $props();

	// Initialize filters from URL params (default to open tasks)
	let searchQuery = $state('');
	let selectedPriorities = $state(new Set(['0', '1', '2', '3']));
	let selectedStatuses = $state(new Set(['open']));
	let selectedTypes = $state(new Set());
	let selectedLabels = $state(new Set());

	// Sorting state
	let sortColumn = $state('priority');
	let sortDirection = $state('asc'); // 'asc' or 'desc'

	// Sync filters with URL on mount and page changes
	$effect(() => {
		const params = new URLSearchParams(window.location.search);
		searchQuery = params.get('search') || '';

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
			selectedStatuses = new Set(['open']);
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
			result = result.filter((task) => selectedTypes.has(task.issue_type));
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

	// Sorted tasks
	const sortedTasks = $derived.by(() => {
		return [...filteredTasks].sort((a, b) => {
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
				case 'created':
					aVal = a.created_at || '';
					bVal = b.created_at || '';
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
	});

	// Get unique labels and types from tasks
	const availableLabels = $derived.by(() => {
		const labelsSet = new Set();
		tasks.forEach((task) => {
			task.labels?.forEach((label) => labelsSet.add(label));
		});
		return Array.from(labelsSet).sort();
	});

	const availableTypes = $derived.by(() => {
		const typesSet = new Set();
		tasks.forEach((task) => {
			if (task.issue_type) typesSet.add(task.issue_type);
		});
		return Array.from(typesSet).sort();
	});

	// Toggle functions
	function togglePriority(priority) {
		if (selectedPriorities.has(priority)) {
			selectedPriorities.delete(priority);
		} else {
			selectedPriorities.add(priority);
		}
		selectedPriorities = new Set(selectedPriorities);
		updateURL();
	}

	function toggleStatus(status) {
		if (selectedStatuses.has(status)) {
			selectedStatuses.delete(status);
		} else {
			selectedStatuses.add(status);
		}
		selectedStatuses = new Set(selectedStatuses);
		updateURL();
	}

	function toggleType(type) {
		if (selectedTypes.has(type)) {
			selectedTypes.delete(type);
		} else {
			selectedTypes.add(type);
		}
		selectedTypes = new Set(selectedTypes);
		updateURL();
	}

	function toggleLabel(label) {
		if (selectedLabels.has(label)) {
			selectedLabels.delete(label);
		} else {
			selectedLabels.add(label);
		}
		selectedLabels = new Set(selectedLabels);
		updateURL();
	}

	function clearAllFilters() {
		searchQuery = '';
		selectedPriorities = new Set(['0', '1', '2', '3']);
		selectedStatuses = new Set(['open']);
		selectedTypes = new Set();
		selectedLabels = new Set();
		updateURL();
	}

	// Sorting
	function handleSort(column) {
		if (sortColumn === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column;
			sortDirection = 'asc';
		}
	}

	// Badge helpers
	function getPriorityBadge(priority) {
		switch (priority) {
			case 0: return 'badge-error';
			case 1: return 'badge-warning';
			case 2: return 'badge-info';
			default: return 'badge-ghost';
		}
	}

	function getStatusBadge(status) {
		switch (status) {
			case 'open': return 'badge-info';
			case 'in_progress': return 'badge-warning';
			case 'blocked': return 'badge-error';
			case 'closed': return 'badge-success';
			default: return 'badge-ghost';
		}
	}

	function getTypeBadge(type) {
		switch (type) {
			case 'bug': return 'badge-error';
			case 'feature': return 'badge-success';
			case 'epic': return 'badge-primary';
			case 'chore': return 'badge-ghost';
			default: return 'badge-info';
		}
	}

	// Format date
	function formatDate(dateStr) {
		if (!dateStr) return '-';
		const date = new Date(dateStr);
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function formatDateTime(dateStr) {
		if (!dateStr) return '-';
		const date = new Date(dateStr);
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Handle row click
	function handleRowClick(taskId) {
		ontaskclick(taskId);
	}
</script>

<div class="flex flex-col h-full">
	<!-- Filter Bar -->
	<div class="p-4 border-b border-base-300 bg-base-100">
		<div class="flex flex-wrap items-center gap-3">
			<!-- Search -->
			<input
				type="text"
				placeholder="Search tasks..."
				class="input input-bordered input-sm w-64"
				bind:value={searchQuery}
				oninput={() => updateURL()}
			/>

			<!-- Priority Filter -->
			<div class="dropdown dropdown-hover">
				<div tabindex="0" role="button" class="btn btn-sm btn-ghost gap-1">
					Priority
					<span class="badge badge-sm badge-primary">{selectedPriorities.size}</span>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
					</svg>
				</div>
				<ul tabindex="0" class="dropdown-content z-50 menu p-2 shadow bg-base-100 rounded-box w-40">
					{#each ['0', '1', '2', '3'] as priority}
						<li>
							<label class="label cursor-pointer justify-start gap-2">
								<input
									type="checkbox"
									class="checkbox checkbox-sm"
									checked={selectedPriorities.has(priority)}
									onchange={() => togglePriority(priority)}
								/>
								<span>P{priority}</span>
								<span class="text-xs opacity-60">({tasks.filter(t => String(t.priority) === priority).length})</span>
							</label>
						</li>
					{/each}
				</ul>
			</div>

			<!-- Status Filter -->
			<div class="dropdown dropdown-hover">
				<div tabindex="0" role="button" class="btn btn-sm btn-ghost gap-1">
					Status
					<span class="badge badge-sm badge-primary">{selectedStatuses.size}</span>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
					</svg>
				</div>
				<ul tabindex="0" class="dropdown-content z-50 menu p-2 shadow bg-base-100 rounded-box w-44">
					{#each ['open', 'in_progress', 'blocked', 'closed'] as status}
						<li>
							<label class="label cursor-pointer justify-start gap-2">
								<input
									type="checkbox"
									class="checkbox checkbox-sm"
									checked={selectedStatuses.has(status)}
									onchange={() => toggleStatus(status)}
								/>
								<span>{status.replace('_', ' ')}</span>
								<span class="text-xs opacity-60">({tasks.filter(t => t.status === status).length})</span>
							</label>
						</li>
					{/each}
				</ul>
			</div>

			<!-- Type Filter -->
			{#if availableTypes.length > 0}
				<div class="dropdown dropdown-hover">
					<div tabindex="0" role="button" class="btn btn-sm btn-ghost gap-1">
						Type
						<span class="badge badge-sm {selectedTypes.size > 0 ? 'badge-primary' : 'badge-ghost'}">{selectedTypes.size || 'all'}</span>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
						</svg>
					</div>
					<ul tabindex="0" class="dropdown-content z-50 menu p-2 shadow bg-base-100 rounded-box w-40">
						{#each availableTypes as type}
							<li>
								<label class="label cursor-pointer justify-start gap-2">
									<input
										type="checkbox"
										class="checkbox checkbox-sm"
										checked={selectedTypes.has(type)}
										onchange={() => toggleType(type)}
									/>
									<span>{type}</span>
									<span class="text-xs opacity-60">({tasks.filter(t => t.issue_type === type).length})</span>
								</label>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Labels Filter -->
			{#if availableLabels.length > 0}
				<div class="dropdown dropdown-hover">
					<div tabindex="0" role="button" class="btn btn-sm btn-ghost gap-1">
						Labels
						<span class="badge badge-sm {selectedLabels.size > 0 ? 'badge-primary' : 'badge-ghost'}">{selectedLabels.size || 'all'}</span>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
						</svg>
					</div>
					<ul tabindex="0" class="dropdown-content z-50 menu p-2 shadow bg-base-100 rounded-box w-48 max-h-60 overflow-y-auto">
						{#each availableLabels as label}
							<li>
								<label class="label cursor-pointer justify-start gap-2">
									<input
										type="checkbox"
										class="checkbox checkbox-sm"
										checked={selectedLabels.has(label)}
										onchange={() => toggleLabel(label)}
									/>
									<span class="truncate">{label}</span>
								</label>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Clear Filters -->
			{#if searchQuery || selectedPriorities.size < 4 || selectedStatuses.size !== 1 || !selectedStatuses.has('open') || selectedTypes.size > 0 || selectedLabels.size > 0}
				<button class="btn btn-sm btn-ghost text-error" onclick={clearAllFilters}>
					Clear filters
				</button>
			{/if}

			<!-- Task count -->
			<div class="ml-auto text-sm text-base-content/60">
				{sortedTasks.length} of {tasks.length} tasks
			</div>
		</div>
	</div>

	<!-- Table -->
	<div class="flex-1 overflow-auto">
		<table class="table table-sm table-pin-rows">
			<thead>
				<tr class="bg-base-200">
					<th class="cursor-pointer hover:bg-base-300 w-28" onclick={() => handleSort('id')}>
						<div class="flex items-center gap-1">
							ID
							{#if sortColumn === 'id'}
								<span class="text-primary">{sortDirection === 'asc' ? '▲' : '▼'}</span>
							{/if}
						</div>
					</th>
					<th class="cursor-pointer hover:bg-base-300" onclick={() => handleSort('title')}>
						<div class="flex items-center gap-1">
							Title
							{#if sortColumn === 'title'}
								<span class="text-primary">{sortDirection === 'asc' ? '▲' : '▼'}</span>
							{/if}
						</div>
					</th>
					<th class="cursor-pointer hover:bg-base-300 w-16 text-center" onclick={() => handleSort('priority')}>
						<div class="flex items-center justify-center gap-1">
							P
							{#if sortColumn === 'priority'}
								<span class="text-primary">{sortDirection === 'asc' ? '▲' : '▼'}</span>
							{/if}
						</div>
					</th>
					<th class="cursor-pointer hover:bg-base-300 w-28" onclick={() => handleSort('status')}>
						<div class="flex items-center gap-1">
							Status
							{#if sortColumn === 'status'}
								<span class="text-primary">{sortDirection === 'asc' ? '▲' : '▼'}</span>
							{/if}
						</div>
					</th>
					<th class="cursor-pointer hover:bg-base-300 w-24" onclick={() => handleSort('type')}>
						<div class="flex items-center gap-1">
							Type
							{#if sortColumn === 'type'}
								<span class="text-primary">{sortDirection === 'asc' ? '▲' : '▼'}</span>
							{/if}
						</div>
					</th>
					<th class="cursor-pointer hover:bg-base-300 w-28" onclick={() => handleSort('assignee')}>
						<div class="flex items-center gap-1">
							Assignee
							{#if sortColumn === 'assignee'}
								<span class="text-primary">{sortDirection === 'asc' ? '▲' : '▼'}</span>
							{/if}
						</div>
					</th>
					<th class="w-32">Labels</th>
					<th class="w-10">Deps</th>
					<th class="cursor-pointer hover:bg-base-300 w-24" onclick={() => handleSort('created')}>
						<div class="flex items-center gap-1">
							Created
							{#if sortColumn === 'created'}
								<span class="text-primary">{sortDirection === 'asc' ? '▲' : '▼'}</span>
							{/if}
						</div>
					</th>
					<th class="cursor-pointer hover:bg-base-300 w-24" onclick={() => handleSort('updated')}>
						<div class="flex items-center gap-1">
							Updated
							{#if sortColumn === 'updated'}
								<span class="text-primary">{sortDirection === 'asc' ? '▲' : '▼'}</span>
							{/if}
						</div>
					</th>
				</tr>
			</thead>
			<tbody>
				{#if sortedTasks.length === 0}
					<tr>
						<td colspan="10" class="text-center py-12">
							<div class="text-base-content/50">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12 mx-auto mb-2 opacity-30">
									<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
								</svg>
								<p>No tasks found</p>
								{#if searchQuery || selectedPriorities.size < 4 || selectedStatuses.size !== 1 || !selectedStatuses.has('open') || selectedTypes.size > 0 || selectedLabels.size > 0}
									<button class="btn btn-sm btn-ghost mt-2" onclick={clearAllFilters}>
										Clear filters
									</button>
								{/if}
							</div>
						</td>
					</tr>
				{:else}
					{#each sortedTasks as task (task.id)}
						{@const depStatus = analyzeDependencies(task)}
						<tr
							class="hover:bg-base-200 cursor-pointer transition-colors {depStatus.hasBlockers ? 'opacity-60' : ''}"
							onclick={() => handleRowClick(task.id)}
							title={depStatus.hasBlockers ? `Blocked: ${depStatus.blockingReason}` : ''}
						>
							<td>
								<span class="font-mono text-xs text-base-content/70">{task.id}</span>
							</td>
							<td>
								<div class="max-w-md">
									<div class="font-medium truncate" title={task.title}>{task.title}</div>
									{#if task.description}
										<div class="text-xs text-base-content/50 truncate" title={task.description}>
											{task.description}
										</div>
									{/if}
								</div>
							</td>
							<td class="text-center">
								<span class="badge badge-sm {getPriorityBadge(task.priority)}">
									P{task.priority}
								</span>
							</td>
							<td>
								<span class="badge badge-sm {getStatusBadge(task.status)}">
									{task.status?.replace('_', ' ')}
								</span>
							</td>
							<td>
								{#if task.issue_type}
									<span class="badge badge-sm badge-outline {getTypeBadge(task.issue_type)}">
										{task.issue_type}
									</span>
								{:else}
									<span class="text-base-content/30">-</span>
								{/if}
							</td>
							<td>
								{#if task.assignee}
									<span class="text-sm">{task.assignee}</span>
								{:else}
									<span class="text-base-content/30">-</span>
								{/if}
							</td>
							<td>
								{#if task.labels && task.labels.length > 0}
									<div class="flex flex-wrap gap-0.5">
										{#each task.labels.slice(0, 2) as label}
											<span class="badge badge-ghost badge-xs">{label}</span>
										{/each}
										{#if task.labels.length > 2}
											<span class="badge badge-ghost badge-xs">+{task.labels.length - 2}</span>
										{/if}
									</div>
								{:else}
									<span class="text-base-content/30">-</span>
								{/if}
							</td>
							<td>
								<DependencyIndicator {task} allTasks={allTasks.length > 0 ? allTasks : tasks} size="sm" />
							</td>
							<td>
								<span class="text-xs text-base-content/60" title={task.created_at}>
									{formatDate(task.created_at)}
								</span>
							</td>
							<td>
								<span class="text-xs text-base-content/60" title={task.updated_at}>
									{formatDate(task.updated_at)}
								</span>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</div>
