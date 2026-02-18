<script lang="ts">
	/**
	 * T4 - Tree/Hierarchy View
	 *
	 * Expandable tree showing epics, children, and dependencies.
	 * Visualize task relationships and project structure.
	 */

	import { onMount } from 'svelte';
	import TaskIdBadge from '$lib/components/TaskIdBadge.svelte';

	interface Task {
		id: string;
		title: string;
		description?: string;
		status: string;
		priority: number;
		issue_type?: string;
		assignee?: string;
		parent_id?: string;
		depends_on?: string[];
		blocked_by?: string[];
	}

	let tasks = $state<Task[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let expandedNodes = $state<Set<string>>(new Set());
	let selectedTask = $state<Task | null>(null);
	let viewMode = $state<'hierarchy' | 'dependencies'>('hierarchy');

	// Status colors
	const statusColors: Record<string, string> = {
		open: 'oklch(0.70 0.15 220)',
		in_progress: 'oklch(0.75 0.15 85)',
		blocked: 'oklch(0.65 0.20 25)',
		closed: 'oklch(0.70 0.15 145)'
	};

	// Build task map for quick lookup
	const taskMap = $derived(() => {
		const map = new Map<string, Task>();
		for (const task of tasks) {
			map.set(task.id, task);
		}
		return map;
	});

	// Get root tasks (epics or tasks without parents)
	const rootTasks = $derived(() => {
		if (viewMode === 'hierarchy') {
			// Show epics first, then standalone tasks
			const epics = tasks.filter(t => t.issue_type === 'epic');
			const standaloneParentIds = new Set(tasks.map(t => t.parent_id).filter(Boolean));
			const standalone = tasks.filter(t =>
				!t.parent_id &&
				t.issue_type !== 'epic' &&
				!standaloneParentIds.has(t.id)
			);
			return [...epics, ...standalone].sort((a, b) => a.priority - b.priority);
		} else {
			// Show tasks that don't depend on anything
			const hasNoDeps = tasks.filter(t =>
				!t.depends_on || t.depends_on.length === 0
			);
			return hasNoDeps.sort((a, b) => a.priority - b.priority);
		}
	});

	// Get children of a task
	function getChildren(taskId: string): Task[] {
		if (viewMode === 'hierarchy') {
			// Children are tasks with this parent_id OR tasks starting with taskId. (e.g., epic-abc → epic-abc.1)
			return tasks
				.filter(t => t.parent_id === taskId || (t.id.startsWith(taskId + '.') && !t.id.slice(taskId.length + 1).includes('.')))
				.sort((a, b) => a.priority - b.priority);
		} else {
			// Tasks that depend on this task
			return tasks
				.filter(t => t.depends_on?.includes(taskId))
				.sort((a, b) => a.priority - b.priority);
		}
	}

	// Check if task has children
	function hasChildren(taskId: string): boolean {
		return getChildren(taskId).length > 0;
	}

	// Toggle node expansion
	function toggleExpand(taskId: string) {
		const newExpanded = new Set(expandedNodes);
		if (newExpanded.has(taskId)) {
			newExpanded.delete(taskId);
		} else {
			newExpanded.add(taskId);
		}
		expandedNodes = newExpanded;
	}

	// Expand all
	function expandAll() {
		const allIds = new Set<string>();
		for (const task of tasks) {
			if (hasChildren(task.id)) {
				allIds.add(task.id);
			}
		}
		expandedNodes = allIds;
	}

	// Collapse all
	function collapseAll() {
		expandedNodes = new Set();
	}

	// Fetch tasks
	async function fetchTasks() {
		try {
			const response = await fetch('/api/tasks');
			if (!response.ok) throw new Error('Failed to fetch tasks');
			const data = await response.json();
			tasks = data.tasks || [];
			error = null;
			// Auto-expand epics
			const epicIds = new Set<string>();
			for (const task of data.tasks || []) {
				if (task.issue_type === 'epic') {
					epicIds.add(task.id);
				}
			}
			expandedNodes = epicIds;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		fetchTasks();
	});
</script>

<svelte:head>
	<title>T4 Tree | SQUAD IDE</title>
</svelte:head>

<div class="tree-page">
	<header class="tree-header">
		<div class="header-left">
			<h1>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="header-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
				</svg>
				Task Tree
			</h1>
		</div>

		<div class="header-controls">
			<div class="view-toggle">
				<button
					class:active={viewMode === 'hierarchy'}
					onclick={() => viewMode = 'hierarchy'}
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 01-1.125-1.125v-3.75zM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-8.25zM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-2.25z" />
					</svg>
					Hierarchy
				</button>
				<button
					class:active={viewMode === 'dependencies'}
					onclick={() => viewMode = 'dependencies'}
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
					</svg>
					Dependencies
				</button>
			</div>

			<div class="expand-controls">
				<button onclick={expandAll} title="Expand all">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
					</svg>
				</button>
				<button onclick={collapseAll} title="Collapse all">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
					</svg>
				</button>
			</div>
		</div>
	</header>

	{#if loading}
		<div class="loading">
			<div class="spinner"></div>
			<span>Loading tasks...</span>
		</div>
	{:else if error}
		<div class="error">
			<span>{error}</span>
			<button onclick={() => fetchTasks()}>Retry</button>
		</div>
	{:else}
		<div class="tree-container">
			<div class="tree-content">
				{#each rootTasks() as task (task.id)}
					{@const children = getChildren(task.id)}
					{@const isExpanded = expandedNodes.has(task.id)}
					{@const hasKids = children.length > 0}

					<div class="tree-node">
						<div
							class="node-row"
							class:selected={selectedTask?.id === task.id}
							class:has-children={hasKids}
						>
							{#if hasKids}
								<button class="expand-btn" onclick={() => toggleExpand(task.id)}>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										stroke-width="2"
										stroke="currentColor"
										class:rotated={isExpanded}
									>
										<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
									</svg>
								</button>
							{:else}
								<span class="expand-spacer"></span>
							{/if}

							<button
								class="node-content"
								onclick={() => selectedTask = selectedTask?.id === task.id ? null : task}
							>
								<span class="status-dot" style="background: {statusColors[task.status]}"></span>
								<TaskIdBadge
									{task}
									size="xs"
									showStatus={false}
									copyOnly
								/>
								<span class="node-title">{task.title}</span>
								{#if task.assignee}
									<span class="node-assignee">{task.assignee}</span>
								{/if}
							</button>
						</div>

						{#if isExpanded && hasKids}
							<div class="node-children">
								{#each children as child (child.id)}
									{@const grandchildren = getChildren(child.id)}
									{@const childExpanded = expandedNodes.has(child.id)}
									{@const childHasKids = grandchildren.length > 0}

									<div class="tree-node child">
										<div
											class="node-row"
											class:selected={selectedTask?.id === child.id}
											class:has-children={childHasKids}
										>
											{#if childHasKids}
												<button class="expand-btn" onclick={() => toggleExpand(child.id)}>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														fill="none"
														viewBox="0 0 24 24"
														stroke-width="2"
														stroke="currentColor"
														class:rotated={childExpanded}
													>
														<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
													</svg>
												</button>
											{:else}
												<span class="expand-spacer"></span>
											{/if}

											<button
												class="node-content"
												onclick={() => selectedTask = selectedTask?.id === child.id ? null : child}
											>
												<span class="status-dot" style="background: {statusColors[child.status]}"></span>
												<TaskIdBadge
													task={child}
													size="xs"
													showStatus={false}
													copyOnly
												/>
												<span class="node-title">{child.title}</span>
												{#if child.assignee}
													<span class="node-assignee">{child.assignee}</span>
												{/if}
											</button>
										</div>

										{#if childExpanded && childHasKids}
											<div class="node-children">
												{#each grandchildren as grandchild (grandchild.id)}
													<div class="tree-node grandchild">
														<div
															class="node-row"
															class:selected={selectedTask?.id === grandchild.id}
														>
															<span class="expand-spacer"></span>
															<button
																class="node-content"
																onclick={() => selectedTask = selectedTask?.id === grandchild.id ? null : grandchild}
															>
																<span class="status-dot" style="background: {statusColors[grandchild.status]}"></span>
																<TaskIdBadge
																	task={grandchild}
																	size="xs"
																	showStatus={false}
																	copyOnly
																/>
																<span class="node-title">{grandchild.title}</span>
															</button>
														</div>
													</div>
												{/each}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/each}

				{#if rootTasks().length === 0}
					<div class="empty-tree">
						<span>No tasks found</span>
					</div>
				{/if}
			</div>

			<!-- Detail sidebar -->
			{#if selectedTask}
				<div class="detail-sidebar">
					<div class="detail-header">
						<TaskIdBadge
							task={selectedTask}
							size="sm"
							copyOnly
						/>
						<button class="close-btn" onclick={() => selectedTask = null}>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
					<h2>{selectedTask.title}</h2>
					{#if selectedTask.description}
						<p class="detail-description">{selectedTask.description}</p>
					{/if}
					<div class="detail-meta">
						{#if selectedTask.assignee}
							<div class="meta-row">
								<span class="meta-label">Assignee</span>
								<span class="meta-value">{selectedTask.assignee}</span>
							</div>
						{/if}
						<div class="meta-row">
							<span class="meta-label">Status</span>
							<span class="meta-value status" style="color: {statusColors[selectedTask.status]}">{selectedTask.status}</span>
						</div>
						{#if selectedTask.depends_on && selectedTask.depends_on.length > 0}
							<div class="meta-row">
								<span class="meta-label">Depends on</span>
								<span class="meta-value">{selectedTask.depends_on.join(', ')}</span>
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.tree-page {
		min-height: 100vh;
		background: oklch(0.14 0.01 250);
		padding: 1.5rem;
	}

	.tree-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.5rem;
	}

	.header-left h1 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.5rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
	}

	.header-icon {
		width: 1.5rem;
		height: 1.5rem;
		color: oklch(0.70 0.15 280);
	}

	.header-controls {
		display: flex;
		gap: 1rem;
	}

	.view-toggle {
		display: flex;
		gap: 0.25rem;
		padding: 0.25rem;
		background: oklch(0.20 0.01 250);
		border-radius: 0.5rem;
	}

	.view-toggle button {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: oklch(0.65 0.02 250);
		background: transparent;
		border: none;
		border-radius: 0.375rem;
		cursor: pointer;
	}

	.view-toggle button:hover {
		color: oklch(0.80 0.02 250);
	}

	.view-toggle button.active {
		background: oklch(0.28 0.02 250);
		color: oklch(0.90 0.02 250);
	}

	.view-toggle button svg {
		width: 1rem;
		height: 1rem;
	}

	.expand-controls {
		display: flex;
		gap: 0.25rem;
	}

	.expand-controls button {
		padding: 0.5rem;
		background: oklch(0.20 0.01 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.375rem;
		color: oklch(0.65 0.02 250);
		cursor: pointer;
	}

	.expand-controls button:hover {
		background: oklch(0.25 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	.expand-controls button svg {
		width: 1rem;
		height: 1rem;
	}

	.loading, .error {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 4rem;
		color: oklch(0.65 0.02 250);
	}

	.spinner {
		width: 2rem;
		height: 2rem;
		border: 2px solid oklch(0.30 0.02 250);
		border-top-color: oklch(0.70 0.15 280);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.tree-container {
		display: flex;
		gap: 1.5rem;
	}

	.tree-content {
		flex: 1;
		background: oklch(0.18 0.01 250);
		border-radius: 0.75rem;
		border: 1px solid oklch(0.25 0.02 250);
		padding: 0.75rem;
	}

	.tree-node {
		margin-bottom: 0.125rem;
	}

	.tree-node.child {
		margin-left: 1.5rem;
		border-left: 1px solid oklch(0.28 0.02 250);
		padding-left: 0.5rem;
	}

	.tree-node.grandchild {
		margin-left: 1.5rem;
		border-left: 1px solid oklch(0.25 0.02 250);
		padding-left: 0.5rem;
	}

	.node-row {
		display: flex;
		align-items: center;
		padding: 0.375rem;
		border-radius: 0.375rem;
		transition: background 0.15s;
	}

	.node-row:hover {
		background: oklch(0.22 0.02 250);
	}

	.node-row.selected {
		background: oklch(0.70 0.15 280 / 0.15);
	}

	.expand-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.25rem;
		height: 1.25rem;
		padding: 0;
		background: transparent;
		border: none;
		color: oklch(0.55 0.02 250);
		cursor: pointer;
		flex-shrink: 0;
	}

	.expand-btn:hover {
		color: oklch(0.80 0.02 250);
	}

	.expand-btn svg {
		width: 0.875rem;
		height: 0.875rem;
		transition: transform 0.15s;
	}

	.expand-btn svg.rotated {
		transform: rotate(90deg);
	}

	.expand-spacer {
		width: 1.25rem;
		flex-shrink: 0;
	}

	.node-content {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		padding: 0;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
	}

	.status-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.node-title {
		flex: 1;
		font-size: 0.8125rem;
		color: oklch(0.88 0.02 250);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.node-assignee {
		font-size: 0.6875rem;
		color: oklch(0.55 0.02 250);
		flex-shrink: 0;
	}

	.node-children {
		margin-top: 0.125rem;
	}

	.empty-tree {
		padding: 3rem;
		text-align: center;
		color: oklch(0.50 0.02 250);
		font-style: italic;
	}

	.detail-sidebar {
		width: 320px;
		background: oklch(0.20 0.01 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.75rem;
		padding: 1rem;
		flex-shrink: 0;
		height: fit-content;
		position: sticky;
		top: 1.5rem;
	}

	.detail-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 0.75rem;
	}

	.close-btn {
		padding: 0.25rem;
		background: transparent;
		border: none;
		color: oklch(0.60 0.02 250);
		cursor: pointer;
		border-radius: 0.25rem;
	}

	.close-btn:hover {
		background: oklch(0.30 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	.close-btn svg {
		width: 1rem;
		height: 1rem;
	}

	.detail-sidebar h2 {
		font-size: 1rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0 0 0.75rem 0;
		line-height: 1.4;
	}

	.detail-description {
		font-size: 0.8125rem;
		color: oklch(0.70 0.02 250);
		margin: 0 0 1rem 0;
		line-height: 1.5;
	}

	.detail-meta {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.meta-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
	}

	.meta-label {
		color: oklch(0.55 0.02 250);
	}

	.meta-value {
		color: oklch(0.80 0.02 250);
	}

	.meta-value.status {
		text-transform: capitalize;
	}
</style>
