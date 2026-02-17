<script lang="ts">
	/**
	 * T5 - Compact List View
	 *
	 * Dense, keyboard-navigable list for quick triage.
	 * Vim-style navigation (j/k), inline actions, rapid workflow.
	 */

	import { onMount, onDestroy } from 'svelte';
	import TaskIdBadge from '$lib/components/TaskIdBadge.svelte';

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
	}

	let tasks = $state<Task[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let selectedIndex = $state(0);
	let filterStatus = $state<string>('all');
	let filterType = $state<string>('all');
	let searchQuery = $state('');
	let showHelp = $state(false);

	// Status colors
	const statusColors: Record<string, string> = {
		open: 'oklch(0.70 0.15 220)',
		in_progress: 'oklch(0.75 0.15 85)',
		blocked: 'oklch(0.65 0.20 25)',
		closed: 'oklch(0.70 0.15 145)'
	};

	// Priority colors
	const priorityColors: Record<number, string> = {
		0: 'oklch(0.65 0.20 25)',
		1: 'oklch(0.75 0.15 85)',
		2: 'oklch(0.70 0.15 220)',
		3: 'oklch(0.55 0.03 250)',
		4: 'oklch(0.45 0.02 250)'
	};

	// Filtered tasks
	const filteredTasks = $derived(() => {
		let result = tasks;

		// Status filter
		if (filterStatus !== 'all') {
			result = result.filter(t => t.status === filterStatus);
		}

		// Type filter
		if (filterType !== 'all') {
			result = result.filter(t => t.issue_type === filterType);
		}

		// Search filter
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			result = result.filter(t =>
				t.title.toLowerCase().includes(q) ||
				t.id.toLowerCase() === q ||
				t.assignee?.toLowerCase().includes(q)
			);
		}

		return result.sort((a, b) => a.priority - b.priority);
	});

	// Selected task
	const selectedTask = $derived(() => filteredTasks()[selectedIndex] || null);

	// Keyboard handler
	function handleKeydown(e: KeyboardEvent) {
		// Don't handle if in input
		if (e.target instanceof HTMLInputElement) return;

		const tasks = filteredTasks();

		switch (e.key) {
			case 'j':
			case 'ArrowDown':
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, tasks.length - 1);
				scrollToSelected();
				break;
			case 'k':
			case 'ArrowUp':
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, 0);
				scrollToSelected();
				break;
			case 'g':
				if (e.shiftKey) {
					e.preventDefault();
					selectedIndex = tasks.length - 1;
					scrollToSelected();
				} else {
					e.preventDefault();
					selectedIndex = 0;
					scrollToSelected();
				}
				break;
			case 'o':
				e.preventDefault();
				filterStatus = 'open';
				selectedIndex = 0;
				break;
			case 'p':
				e.preventDefault();
				filterStatus = 'in_progress';
				selectedIndex = 0;
				break;
			case 'c':
				e.preventDefault();
				filterStatus = 'closed';
				selectedIndex = 0;
				break;
			case 'a':
				e.preventDefault();
				filterStatus = 'all';
				selectedIndex = 0;
				break;
			case '/':
				e.preventDefault();
				document.getElementById('search-input')?.focus();
				break;
			case 'Escape':
				e.preventDefault();
				searchQuery = '';
				(document.activeElement as HTMLElement)?.blur();
				break;
			case '?':
				e.preventDefault();
				showHelp = !showHelp;
				break;
		}
	}

	// Scroll selected row into view
	function scrollToSelected() {
		setTimeout(() => {
			const row = document.querySelector('.task-row.selected');
			row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}, 10);
	}

	// Update task status
	async function updateStatus(taskId: string, newStatus: string) {
		try {
			await fetch(`/api/tasks/${taskId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: newStatus })
			});
			await fetchTasks();
		} catch (err) {
			console.error('Failed to update task:', err);
		}
	}

	// Fetch tasks
	async function fetchTasks() {
		try {
			const response = await fetch('/api/tasks');
			if (!response.ok) throw new Error('Failed to fetch tasks');
			const data = await response.json();
			tasks = data.tasks || [];
			error = null;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		fetchTasks();
		window.addEventListener('keydown', handleKeydown);
	});

	onDestroy(() => {
		window.removeEventListener('keydown', handleKeydown);
	});
</script>

<svelte:head>
	<title>T5 Compact | JAT IDE</title>
</svelte:head>

<div class="compact-page">
	<header class="compact-header">
		<div class="header-left">
			<h1>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="header-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
				</svg>
				Compact List
			</h1>
			<span class="task-count">{filteredTasks().length} / {tasks.length}</span>
		</div>

		<div class="header-controls">
			<div class="search-box">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="search-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
				</svg>
				<input
					id="search-input"
					type="text"
					placeholder="Search... (/)"
					bind:value={searchQuery}
				/>
			</div>

			<button class="help-btn" onclick={() => showHelp = !showHelp} title="Keyboard shortcuts (?)">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
				</svg>
			</button>
		</div>
	</header>

	<!-- Filter bar -->
	<div class="filter-bar">
		<div class="filter-group">
			<span class="filter-label">Status:</span>
			<button class:active={filterStatus === 'all'} onclick={() => { filterStatus = 'all'; selectedIndex = 0; }}>All (a)</button>
			<button class:active={filterStatus === 'open'} onclick={() => { filterStatus = 'open'; selectedIndex = 0; }}>Open (o)</button>
			<button class:active={filterStatus === 'in_progress'} onclick={() => { filterStatus = 'in_progress'; selectedIndex = 0; }}>In Progress (p)</button>
			<button class:active={filterStatus === 'closed'} onclick={() => { filterStatus = 'closed'; selectedIndex = 0; }}>Closed (c)</button>
		</div>

		<div class="filter-group">
			<span class="filter-label">Type:</span>
			<button class:active={filterType === 'all'} onclick={() => { filterType = 'all'; selectedIndex = 0; }}>All</button>
			<button class:active={filterType === 'bug'} onclick={() => { filterType = 'bug'; selectedIndex = 0; }}>Bugs</button>
			<button class:active={filterType === 'feature'} onclick={() => { filterType = 'feature'; selectedIndex = 0; }}>Features</button>
			<button class:active={filterType === 'task'} onclick={() => { filterType = 'task'; selectedIndex = 0; }}>Tasks</button>
			<button class:active={filterType === 'epic'} onclick={() => { filterType = 'epic'; selectedIndex = 0; }}>Epics</button>
		</div>
	</div>

	{#if loading}
		<div class="loading">
			<div class="spinner"></div>
		</div>
	{:else if error}
		<div class="error">
			<span>{error}</span>
		</div>
	{:else}
		<div class="task-list">
			{#each filteredTasks() as task, index (task.id)}
				<div
					class="task-row"
					class:selected={index === selectedIndex}
					onclick={() => selectedIndex = index}
					role="row"
				>
					<span class="row-priority" style="background: {priorityColors[task.priority]}">P{task.priority}</span>
					<span class="row-status" style="color: {statusColors[task.status]}">{task.status.replace('_', ' ')}</span>
					<TaskIdBadge
						{task}
						size="xs"
						showStatus={false}
						copyOnly
					/>
					<span class="row-title">{task.title}</span>
					{#if task.assignee}
						<span class="row-assignee">{task.assignee}</span>
					{/if}

					<!-- Quick actions (visible on hover/select) -->
					<div class="row-actions">
						{#if task.status !== 'in_progress'}
							<button
								class="action-btn start"
								onclick={(e) => { e.stopPropagation(); updateStatus(task.id, 'in_progress'); }}
								title="Start"
							>▶</button>
						{/if}
						{#if task.status !== 'closed'}
							<button
								class="action-btn close"
								onclick={(e) => { e.stopPropagation(); updateStatus(task.id, 'closed'); }}
								title="Close"
							>✓</button>
						{/if}
					</div>
				</div>
			{/each}

			{#if filteredTasks().length === 0}
				<div class="empty-list">
					<span>No tasks match filters</span>
				</div>
			{/if}
		</div>

		<!-- Detail panel for selected task -->
		{#if selectedTask()}
			<div class="detail-panel">
				<div class="detail-content">
					<div class="detail-header">
						<TaskIdBadge
							task={selectedTask()}
							size="sm"
							copyOnly
						/>
					</div>
					<h2>{selectedTask().title}</h2>
					{#if selectedTask().description}
						<p class="detail-description">{selectedTask().description}</p>
					{/if}
					{#if selectedTask().labels && selectedTask().labels.length > 0}
						<div class="detail-labels">
							{#each selectedTask().labels as label}
								<span class="label">{label}</span>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}
	{/if}

	<!-- Help overlay -->
	{#if showHelp}
		<div class="help-overlay" onclick={() => showHelp = false} role="dialog">
			<div class="help-modal" onclick={(e) => e.stopPropagation()}>
				<h3>Keyboard Shortcuts</h3>
				<div class="shortcuts-grid">
					<div class="shortcut"><kbd>j</kbd> / <kbd>↓</kbd> <span>Next task</span></div>
					<div class="shortcut"><kbd>k</kbd> / <kbd>↑</kbd> <span>Previous task</span></div>
					<div class="shortcut"><kbd>g</kbd> <span>Go to top</span></div>
					<div class="shortcut"><kbd>G</kbd> <span>Go to bottom</span></div>
					<div class="shortcut"><kbd>/</kbd> <span>Focus search</span></div>
					<div class="shortcut"><kbd>Esc</kbd> <span>Clear search</span></div>
					<div class="shortcut"><kbd>o</kbd> <span>Filter: Open</span></div>
					<div class="shortcut"><kbd>p</kbd> <span>Filter: In Progress</span></div>
					<div class="shortcut"><kbd>c</kbd> <span>Filter: Closed</span></div>
					<div class="shortcut"><kbd>a</kbd> <span>Filter: All</span></div>
					<div class="shortcut"><kbd>?</kbd> <span>Toggle help</span></div>
				</div>
				<button class="close-help" onclick={() => showHelp = false}>Close</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.compact-page {
		min-height: 100vh;
		background: oklch(0.14 0.01 250);
		display: flex;
		flex-direction: column;
	}

	.compact-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.header-left h1 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.25rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
	}

	.header-icon {
		width: 1.25rem;
		height: 1.25rem;
		color: oklch(0.70 0.15 85);
	}

	.task-count {
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
		padding: 0.25rem 0.5rem;
		background: oklch(0.20 0.01 250);
		border-radius: 0.25rem;
	}

	.header-controls {
		display: flex;
		gap: 0.75rem;
	}

	.search-box {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.75rem;
		background: oklch(0.20 0.01 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.375rem;
	}

	.search-box:focus-within {
		border-color: oklch(0.70 0.15 85);
	}

	.search-icon {
		width: 0.875rem;
		height: 0.875rem;
		color: oklch(0.50 0.02 250);
	}

	.search-box input {
		background: transparent;
		border: none;
		outline: none;
		font-size: 0.8125rem;
		color: oklch(0.90 0.02 250);
		width: 180px;
	}

	.search-box input::placeholder {
		color: oklch(0.45 0.02 250);
	}

	.help-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		background: oklch(0.20 0.01 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.375rem;
		color: oklch(0.55 0.02 250);
		cursor: pointer;
	}

	.help-btn:hover {
		background: oklch(0.25 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	.help-btn svg {
		width: 1rem;
		height: 1rem;
	}

	.filter-bar {
		display: flex;
		gap: 2rem;
		padding: 0.75rem 1.5rem;
		background: oklch(0.16 0.01 250);
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.filter-group {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.filter-label {
		font-size: 0.6875rem;
		color: oklch(0.50 0.02 250);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-right: 0.25rem;
	}

	.filter-group button {
		padding: 0.25rem 0.5rem;
		font-size: 0.6875rem;
		color: oklch(0.60 0.02 250);
		background: transparent;
		border: 1px solid transparent;
		border-radius: 0.25rem;
		cursor: pointer;
	}

	.filter-group button:hover {
		color: oklch(0.80 0.02 250);
		background: oklch(0.22 0.02 250);
	}

	.filter-group button.active {
		color: oklch(0.90 0.02 250);
		background: oklch(0.28 0.02 250);
		border-color: oklch(0.35 0.02 250);
	}

	.loading, .error {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 3rem;
		color: oklch(0.60 0.02 250);
	}

	.spinner {
		width: 1.5rem;
		height: 1.5rem;
		border: 2px solid oklch(0.30 0.02 250);
		border-top-color: oklch(0.70 0.15 85);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.task-list {
		flex: 1;
		overflow-y: auto;
	}

	.task-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1.5rem;
		border-bottom: 1px solid oklch(0.18 0.01 250);
		cursor: pointer;
		transition: background 0.1s;
	}

	.task-row:hover {
		background: oklch(0.18 0.01 250);
	}

	.task-row.selected {
		background: oklch(0.70 0.15 85 / 0.1);
		border-left: 3px solid oklch(0.70 0.15 85);
		padding-left: calc(1.5rem - 3px);
	}

	.row-priority {
		font-size: 0.625rem;
		font-weight: 700;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		color: oklch(0.15 0.01 250);
		flex-shrink: 0;
	}

	.row-status {
		font-size: 0.625rem;
		font-weight: 500;
		text-transform: uppercase;
		width: 70px;
		flex-shrink: 0;
	}

	.row-title {
		flex: 1;
		font-size: 0.8125rem;
		color: oklch(0.88 0.02 250);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-assignee {
		font-size: 0.6875rem;
		color: oklch(0.50 0.02 250);
		flex-shrink: 0;
	}

	.row-actions {
		display: flex;
		gap: 0.25rem;
		opacity: 0;
		transition: opacity 0.15s;
	}

	.task-row:hover .row-actions,
	.task-row.selected .row-actions {
		opacity: 1;
	}

	.action-btn {
		width: 1.5rem;
		height: 1.5rem;
		padding: 0;
		font-size: 0.75rem;
		border: none;
		border-radius: 0.25rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.action-btn.start {
		background: oklch(0.70 0.15 85 / 0.2);
		color: oklch(0.70 0.15 85);
	}

	.action-btn.start:hover {
		background: oklch(0.70 0.15 85);
		color: oklch(0.15 0.01 250);
	}

	.action-btn.close {
		background: oklch(0.70 0.15 145 / 0.2);
		color: oklch(0.70 0.15 145);
	}

	.action-btn.close:hover {
		background: oklch(0.70 0.15 145);
		color: oklch(0.15 0.01 250);
	}

	.empty-list {
		padding: 3rem;
		text-align: center;
		color: oklch(0.45 0.02 250);
		font-style: italic;
	}

	.detail-panel {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background: oklch(0.18 0.01 250);
		border-top: 1px solid oklch(0.28 0.02 250);
		max-height: 200px;
		overflow-y: auto;
	}

	.detail-content {
		padding: 1rem 1.5rem;
	}

	.detail-header {
		margin-bottom: 0.5rem;
	}

	.detail-content h2 {
		font-size: 0.9375rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0 0 0.5rem 0;
	}

	.detail-description {
		font-size: 0.8125rem;
		color: oklch(0.70 0.02 250);
		margin: 0 0 0.75rem 0;
		line-height: 1.5;
	}

	.detail-labels {
		display: flex;
		gap: 0.375rem;
	}

	.label {
		font-size: 0.625rem;
		padding: 0.125rem 0.375rem;
		background: oklch(0.28 0.02 250);
		border-radius: 0.25rem;
		color: oklch(0.70 0.02 250);
	}

	.help-overlay {
		position: fixed;
		inset: 0;
		background: oklch(0 0 0 / 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.help-modal {
		background: oklch(0.20 0.01 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 0.75rem;
		padding: 1.5rem;
		min-width: 320px;
		box-shadow: 0 8px 32px oklch(0 0 0 / 0.4);
	}

	.help-modal h3 {
		font-size: 1rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0 0 1rem 0;
	}

	.shortcuts-grid {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.shortcut {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		color: oklch(0.70 0.02 250);
	}

	.shortcut kbd {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.5rem;
		height: 1.5rem;
		padding: 0 0.375rem;
		background: oklch(0.28 0.02 250);
		border: 1px solid oklch(0.35 0.02 250);
		border-radius: 0.25rem;
		font-family: monospace;
		font-size: 0.75rem;
		color: oklch(0.85 0.02 250);
	}

	.shortcut span {
		margin-left: auto;
		color: oklch(0.55 0.02 250);
	}

	.close-help {
		width: 100%;
		padding: 0.5rem;
		background: oklch(0.28 0.02 250);
		border: 1px solid oklch(0.35 0.02 250);
		border-radius: 0.375rem;
		color: oklch(0.85 0.02 250);
		font-size: 0.8125rem;
		cursor: pointer;
	}

	.close-help:hover {
		background: oklch(0.32 0.02 250);
	}
</style>
