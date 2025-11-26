<script lang="ts">
	/**
	 * TaskDetailDrawer Component
	 * DaisyUI drawer for viewing task details with inline editing
	 *
	 * Features:
	 * - Side panel drawer (doesn't block view)
	 * - All fields editable inline (click to edit)
	 * - Auto-save on field changes (debounced 500ms)
	 * - Fetches task data on mount
	 * - Optimistic updates with rollback
	 * - Keyboard shortcuts (Esc, M, ?)
	 */

	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { formatDate } from '$lib/utils/dateFormatters';
	import InlineEdit from '$lib/components/InlineEdit.svelte';
	import InlineSelect from '$lib/components/InlineSelect.svelte';

	// Props
	let { taskId = $bindable(null), isOpen = $bindable(false) } = $props();

	// Task data state
	let task = $state(null);
	let originalTask = $state(null); // Track original task to prevent infinite save loops
	let loading = $state(false);
	let error = $state(null);

	// Task history state
	interface TimelineEvent {
		type: 'beads_event' | 'agent_mail';
		event: string;
		timestamp: string;
		description: string;
		metadata: Record<string, any>;
	}

	interface TaskHistory {
		task_id: string;
		task_title: string;
		timeline: TimelineEvent[];
		count: {
			total: number;
			beads_events: number;
			agent_mail: number;
		};
		timestamp: string;
	}

	let taskHistory = $state<TaskHistory | null>(null);
	let historyLoading = $state(false);
	let historyError = $state<string | null>(null);


	// Auto-save state
	let isSaving = $state(false);
	let saveError = $state(null);
	let lastSaved = $state<Date | null>(null);
	let saveTimeout: ReturnType<typeof setTimeout> | null = null;
	let isUpdatingFromServer = $state(false); // Flag to prevent effect loops during server updates

	// UI state
	let toastMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let showHelp = $state(false);
	let copiedTaskId = $state(false);

	// Timeline filter state
	let timelineFilter = $state<'all' | 'tasks' | 'messages'>('all');

	// Filtered timeline based on selected tab
	const filteredTimeline = $derived((): TimelineEvent[] => {
		if (!taskHistory?.timeline) return [];
		if (timelineFilter === 'all') return taskHistory.timeline;
		if (timelineFilter === 'tasks') return taskHistory.timeline.filter(e => e.type === 'beads_event');
		return taskHistory.timeline.filter(e => e.type === 'agent_mail');
	});

	// Status badge colors
	const statusColors = {
		open: 'badge-info',
		in_progress: 'badge-warning',
		closed: 'badge-success',
		blocked: 'badge-error'
	};

	// Priority badge colors
	const priorityColors = {
		0: 'badge-error', // P0 - Critical
		1: 'badge-warning', // P1 - High
		2: 'badge-info', // P2 - Medium
		3: 'badge-ghost', // P3 - Low
		4: 'badge-ghost' // P4 - Lowest
	};

	// Available options
	const priorityOptions = [
		{ value: 0, label: 'P0 (Critical)' },
		{ value: 1, label: 'P1 (High)' },
		{ value: 2, label: 'P2 (Medium)' },
		{ value: 3, label: 'P3 (Low)' },
		{ value: 4, label: 'P4 (Lowest)' }
	];

	const typeOptions = [
		{ value: 'task', label: 'Task' },
		{ value: 'bug', label: 'Bug' },
		{ value: 'feature', label: 'Feature' },
		{ value: 'epic', label: 'Epic' },
		{ value: 'chore', label: 'Chore' }
	];

	const statusOptions = [
		{ value: 'open', label: 'Open' },
		{ value: 'in_progress', label: 'In Progress' },
		{ value: 'blocked', label: 'Blocked' },
		{ value: 'closed', label: 'Closed' }
	];

	const projectOptions = ['jat', 'chimaro', 'jomarchy'];

	// Fetch task details
	async function fetchTask(id: string) {
		if (!id) return;

		loading = true;
		error = null;

		try {
			const response = await fetch(`/api/tasks/${id}`);
			if (!response.ok) {
				throw new Error(`Failed to fetch task: ${response.statusText}`);
			}
			const data = await response.json();
			task = data.task;
			originalTask = { ...data.task };

			// Fetch task history in parallel
			fetchTaskHistory(id);
		} catch (err: any) {
			error = err.message;
			console.error('Error fetching task:', err);
		} finally {
			loading = false;
		}
	}

	// Fetch task history
	async function fetchTaskHistory(id: string) {
		if (!id) return;

		historyLoading = true;
		historyError = null;

		try {
			const response = await fetch(`/api/tasks/${id}/history`);
			if (!response.ok) {
				throw new Error(`Failed to fetch task history: ${response.statusText}`);
			}
			const data = await response.json();
			taskHistory = data;
		} catch (err: any) {
			historyError = err.message;
			console.error('Error fetching task history:', err);
		} finally {
			historyLoading = false;
		}
	}

	// Watch for taskId changes
	$effect(() => {
		if (taskId && isOpen) {
			fetchTask(taskId);
		}
	});


	// Show toast notification
	function showToast(type: 'success' | 'error', text: string) {
		toastMessage = { type, text };
		setTimeout(() => {
			toastMessage = null;
		}, 3000); // Hide after 3 seconds
	}

	// Copy task ID to clipboard
	async function copyTaskIdToClipboard() {
		if (!task?.id) return;
		try {
			await navigator.clipboard.writeText(task.id);
			copiedTaskId = true;
			setTimeout(() => {
				copiedTaskId = false;
			}, 1500);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	// Debounced auto-save function
	async function autoSave(field: string, value: any) {
		// Clear any pending save
		if (saveTimeout) {
			clearTimeout(saveTimeout);
		}

		// Debounce for 500ms
		saveTimeout = setTimeout(async () => {
			isSaving = true;
			isUpdatingFromServer = true;
			saveError = null;

			// Create backup of current task for rollback
			const taskBackup = task ? { ...task } : null;

			try {
				// Optimistic update - update UI immediately
				if (task) {
					task = { ...task, [field]: value };
				}

				// Prepare PATCH request body (only the changed field)
				const updateData: Record<string, any> = {};
				updateData[field] = value;

				// Make PATCH request
				const response = await fetch(`/api/tasks/${taskId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(updateData)
				});

				if (!response.ok) {
					const errorData = await response.json();
					throw new Error(errorData.message || 'Failed to save');
				}

				const data = await response.json();

				// Update task with server response
				task = data.task;

				// Update originalTask to match saved state
				originalTask = { ...task };

				lastSaved = new Date();

				// Show success toast
				showToast('success', '✓ Saved');

			} catch (error: any) {
				// Rollback on error
				if (taskBackup) {
					task = taskBackup;
				}
				saveError = error.message;

				// Show error toast
				showToast('error', `✗ ${error.message}`);
			} finally {
				isSaving = false;
				isUpdatingFromServer = false;
			}
		}, 500);
	}


	// Delete task with confirmation
	async function handleDelete() {
		if (!task || !taskId) return;

		// Confirm deletion
		const confirmed = confirm(
			`Are you sure you want to delete task "${task.title}"?\n\nThis action cannot be undone.`
		);

		if (!confirmed) return;

		isUpdatingFromServer = true;

		try {
			const response = await fetch(`/api/tasks/${taskId}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				// Parse error response to get specific error message
				const errorData = await response.json();
				const errorMessage = errorData.message || 'Failed to delete task';
				throw new Error(errorMessage);
			}

			// Show success message
			showToast('success', '✓ Task deleted');

			// Close drawer after short delay
			setTimeout(() => {
				handleClose();
				// Trigger page reload to update task list
				window.location.reload();
			}, 500);
		} catch (error: any) {
			console.error('Delete error:', error);
			showToast('error', `✗ ${error.message}`);
		} finally {
			isUpdatingFromServer = false;
		}
	}


	// Keyboard shortcut handler
	function handleKeyDown(event: KeyboardEvent) {
		// Only handle shortcuts when drawer is open
		if (!isOpen) return;

		// Ignore keyboard shortcuts when typing in inputs
		const target = event.target as HTMLElement;
		const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

		// Escape: Close drawer (always works, even in inputs)
		if (event.key === 'Escape') {
			event.preventDefault();
			handleClose();
			return;
		}

		// Don't handle other shortcuts when typing
		if (isTyping) return;

		// ?: Toggle help panel
		if (event.key === '?' && !event.shiftKey) {
			event.preventDefault();
			showHelp = !showHelp;
			return;
		}

		// M: Mark complete (close task)
		if (event.key === 'm' || event.key === 'M') {
			if (!loading && !error && task) {
				event.preventDefault();
				markComplete();
			}
			return;
		}
	}

	// Mark task as complete
	async function markComplete() {
		if (!task || isSaving) return;

		isSaving = true;
		saveError = null;

		try {
			const response = await fetch(`/api/tasks/${taskId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: 'closed' })
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to close task');
			}

			const data = await response.json();
			task = data.task;
			originalTask = { ...data.task };

			showToast('success', '✓ Task marked as complete');
		} catch (error: any) {
			console.error('Mark complete error:', error);
			saveError = error.message;
			showToast('error', `✗ ${error.message}`);
		} finally {
			isSaving = false;
		}
	}

	// Handle drawer close
	function handleClose() {
		// Clear any pending save
		if (saveTimeout) {
			clearTimeout(saveTimeout);
			saveTimeout = null;
		}

		if (!isSaving) {
			isOpen = false;
			task = null;
			originalTask = null;
			error = null;
			saveError = null;
			toastMessage = null;
			lastSaved = null;
			showHelp = false;
		}
	}

	// Setup keyboard listener on mount
	onMount(() => {
		if (browser) {
			window.addEventListener('keydown', handleKeyDown);
		}
	});

	// Cleanup on destroy
	onDestroy(() => {
		if (browser) {
			window.removeEventListener('keydown', handleKeyDown);
		}
	});
</script>

<!-- DaisyUI Drawer -->
<div class="drawer drawer-end z-50">
	<input id="task-detail-drawer" type="checkbox" class="drawer-toggle" bind:checked={isOpen} />

	<!-- Drawer side -->
	<div class="drawer-side">
		<label
			aria-label="close sidebar"
			class="drawer-overlay"
			onclick={handleClose}
		></label>

		<!-- Drawer Panel (fixed height, header/footer sticky, content scrolls) -->
		<div class="bg-base-100 h-full w-full max-w-2xl flex flex-col shadow-2xl">
			<!-- Header -->
			<div class="flex items-center justify-between p-6 border-b border-base-300">
				<div class="flex-1">
					<div class="flex items-center gap-3">
						<h2 class="text-2xl font-bold text-base-content">Task Details</h2>
						{#if task}
							<button
								class="badge badge-lg badge-outline gap-1 cursor-pointer hover:badge-primary transition-colors"
								onclick={copyTaskIdToClipboard}
								title="Click to copy task ID"
							>
								{task.id}
								{#if copiedTaskId}
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 text-success">
										<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
									</svg>
								{:else}
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5">
										<path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
									</svg>
								{/if}
							</button>
						{/if}
					</div>
					<p class="text-sm text-base-content/70 mt-1">
						{#if isSaving}
							<span class="loading loading-spinner loading-xs"></span>
							Saving...
						{:else if lastSaved}
							✓ Saved {new Date().getTime() - lastSaved.getTime() < 60000
								? 'just now'
								: 'at ' + lastSaved.toLocaleTimeString()}
						{:else}
							Click any field to edit
						{/if}
					</p>
				</div>
				<div class="flex items-center gap-2">
					<!-- Delete button -->
					{#if !loading && !error && task}
						<div class="tooltip tooltip-bottom" data-tip="Delete task">
							<button
								class="btn btn-sm btn-circle btn-ghost text-error hover:btn-error"
								onclick={handleDelete}
								disabled={isSaving}
								aria-label="Delete task"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
									/>
								</svg>
							</button>
						</div>
					{/if}
					<!-- Help button -->
					<div class="tooltip tooltip-bottom" data-tip="Show shortcuts (?)">
						<button
							class="btn btn-sm btn-circle btn-ghost"
							onclick={() => (showHelp = !showHelp)}
							aria-label="Show keyboard shortcuts (?)"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
						</button>
					</div>
					<!-- Close button -->
					<div class="tooltip tooltip-bottom" data-tip="Close (Esc)">
						<button
							class="btn btn-sm btn-circle btn-ghost"
							onclick={handleClose}
							disabled={isSaving}
							aria-label="Close drawer (Esc)"
						>
							✕
						</button>
					</div>
				</div>
			</div>

			<!-- Content (scrollable area between sticky header and footer) -->
			<div class="flex-1 overflow-y-auto p-6 flex flex-col min-h-0">
				{#if loading}
					<!-- Loading state -->
					<div class="flex items-center justify-center py-12">
						<span class="loading loading-spinner loading-lg"></span>
					</div>
				{:else if error}
					<!-- Error state -->
					<div class="alert alert-error">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="stroke-current shrink-0 h-6 w-6"
							fill="none"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span>{error}</span>
					</div>
					<div class="mt-4">
						<button class="btn btn-primary" onclick={() => fetchTask(taskId)}>
							Retry
						</button>
					</div>
				{:else if task}
					<!-- View Mode -->
					<div class="flex flex-col gap-6 h-full">
						<!-- Title (Inline Editable) -->
						<div>
							<InlineEdit
								value={task.title || ''}
								onSave={async (newValue) => {
									await autoSave('title', newValue);
								}}
								type="text"
								placeholder="Enter task title..."
								disabled={isSaving}
								class="text-xl font-bold"
							/>
						</div>

						<!-- Badges (left) + Metadata (right) -->
						<div class="flex items-start justify-between gap-4">
							<!-- Badges (Inline Editable) -->
							<div class="flex flex-wrap gap-2 items-center">
								<!-- Status -->
								<InlineSelect
									value={task.status || 'open'}
									options={statusOptions}
									onSave={async (newValue) => {
										await autoSave('status', newValue);
									}}
									disabled={isSaving}
								>
									<div class="badge {statusColors[task.status] || 'badge-ghost'}">
										{task.status || 'unknown'}
									</div>
								</InlineSelect>

								<!-- Priority -->
								<InlineSelect
									value={String(task.priority ?? 1)}
									options={priorityOptions.map(o => ({ value: String(o.value), label: o.label }))}
									onSave={async (newValue) => {
										await autoSave('priority', parseInt(newValue, 10));
									}}
									disabled={isSaving}
								>
									<div class="badge {priorityColors[task.priority] || 'badge-ghost'}">
										P{task.priority ?? '?'}
									</div>
								</InlineSelect>

								<!-- Type -->
								<InlineSelect
									value={task.type || 'task'}
									options={typeOptions}
									onSave={async (newValue) => {
										await autoSave('type', newValue);
									}}
									disabled={isSaving}
								>
									<div class="badge badge-outline">{task.type || 'task'}</div>
								</InlineSelect>

								<!-- Project -->
								<InlineSelect
									value={task.project || ''}
									options={[{ value: '', label: 'No project' }, ...projectOptions.map(p => ({ value: p, label: p }))]}
									onSave={async (newValue) => {
										await autoSave('project', newValue);
									}}
									disabled={isSaving}
								>
									{#if task.project}
										<div class="badge badge-primary">{task.project}</div>
									{:else}
										<div class="badge badge-ghost badge-outline">No project</div>
									{/if}
								</InlineSelect>
							</div>
							<!-- Metadata (compact, right-aligned) -->
							<div class="text-xs text-base-content/60 text-right shrink-0">
								<div><span class="text-base-content/40">Created:</span> {formatDate(task.created_at)}</div>
								<div><span class="text-base-content/40">Updated:</span> {formatDate(task.updated_at)}</div>
								<div class="flex items-center justify-end gap-1">
									<span class="text-base-content/40">Assignee:</span>
									<InlineEdit
										value={task.assignee || ''}
										onSave={async (newValue) => {
											await autoSave('assignee', newValue);
										}}
										type="text"
										placeholder="Unassigned"
										disabled={isSaving}
										class="text-xs"
									/>
								</div>
							</div>
						</div>

						<!-- Labels (Inline Editable) -->
						<div>
							<h4 class="text-sm font-semibold mb-2 text-base-content/70">Labels</h4>
							<InlineEdit
								value={task.labels ? task.labels.join(', ') : ''}
								onSave={async (newValue) => {
									const labelsArray = newValue
										.split(',')
										.map((l) => l.trim())
										.filter((l) => l.length > 0);
									await autoSave('labels', labelsArray);
								}}
								type="text"
								placeholder="Add labels (comma-separated)..."
								disabled={isSaving}
								class="text-sm"
							/>
							{#if task.labels && task.labels.length > 0}
								<div class="flex flex-wrap gap-2 mt-2">
									{#each task.labels as label}
										<span class="badge badge-sm badge-outline">{label}</span>
									{/each}
								</div>
							{/if}
						</div>

						<!-- Description (Inline Editable) -->
						<div>
							<h4 class="text-sm font-semibold mb-2 text-base-content/70">Description</h4>
							<InlineEdit
								value={task.description || ''}
								onSave={async (newValue) => {
									await autoSave('description', newValue);
								}}
								type="textarea"
								placeholder="No description"
								disabled={isSaving}
								rows={4}
								class="text-sm"
							/>
						</div>

						<!-- Dependencies -->
						{#if task.depends_on && task.depends_on.length > 0}
							<div>
								<h4 class="text-sm font-semibold mb-2 text-base-content/70">Depends On</h4>
								<div class="space-y-2">
									{#each task.depends_on as dep}
										<div class="flex items-center gap-2 text-sm p-2 bg-base-200 rounded">
											<span class="badge badge-sm {statusColors[dep.status] || 'badge-ghost'}">
												{dep.status || 'unknown'}
											</span>
											<span class="badge badge-sm {priorityColors[dep.priority] || 'badge-ghost'}">
												P{dep.priority ?? '?'}
											</span>
											<span class="font-mono text-xs">{dep.id}</span>
											<span class="flex-1">{dep.title || 'Untitled'}</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Blocks (dependents) -->
						{#if task.blocked_by && task.blocked_by.length > 0}
							<div>
								<h4 class="text-sm font-semibold mb-2 text-base-content/70">Blocks</h4>
								<div class="space-y-2">
									{#each task.blocked_by as dep}
										<div class="flex items-center gap-2 text-sm p-2 bg-base-200 rounded">
											<span class="badge badge-sm {statusColors[dep.status] || 'badge-ghost'}">
												{dep.status || 'unknown'}
											</span>
											<span class="badge badge-sm {priorityColors[dep.priority] || 'badge-ghost'}">
												P{dep.priority ?? '?'}
											</span>
											<span class="font-mono text-xs">{dep.id}</span>
											<span class="flex-1">{dep.title || 'Untitled'}</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Activity Timeline (Task Events on Left, Messages on Right) -->
						<div class="border-t border-base-300 pt-4 flex-1 flex flex-col min-h-0">
							<!-- Header with filter tabs -->
							<div class="flex items-center justify-between mb-3">
								<h4 class="text-sm font-semibold text-base-content/70">Activity Timeline</h4>

								<!-- Filter tabs -->
								<div class="tabs tabs-boxed tabs-xs bg-base-200">
									<button
										class="tab {timelineFilter === 'all' ? 'tab-active' : ''}"
										onclick={() => timelineFilter = 'all'}
									>
										All ({taskHistory?.count?.total || 0})
									</button>
									<button
										class="tab {timelineFilter === 'tasks' ? 'tab-active' : ''}"
										onclick={() => timelineFilter = 'tasks'}
									>
										Tasks ({taskHistory?.count?.beads_events || 0})
									</button>
									<button
										class="tab {timelineFilter === 'messages' ? 'tab-active' : ''}"
										onclick={() => timelineFilter = 'messages'}
									>
										Messages ({taskHistory?.count?.agent_mail || 0})
									</button>
								</div>
							</div>

							{#if historyLoading}
								<!-- Loading state -->
								<div class="flex items-center justify-center py-6">
									<span class="loading loading-spinner loading-sm"></span>
									<span class="ml-2 text-xs">Loading timeline...</span>
								</div>
							{:else if historyError}
								<!-- Error state -->
								<div class="alert alert-warning py-2">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="stroke-current shrink-0 h-4 w-4"
										fill="none"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
										/>
									</svg>
									<span class="text-xs">{historyError}</span>
								</div>
							{:else if filteredTimeline().length > 0}
								<!-- Centered DaisyUI Timeline: Task events on left (30%), Messages on right (70%) -->
								<ul class="timeline timeline-vertical flex-1 overflow-y-auto w-full">
									{#each filteredTimeline() as event, i}
										<li style="grid-template-columns: 30% min-content 1fr;">
											<!-- Top connector (skip for first item) -->
											{#if i > 0}
												<hr class="{event.type === 'beads_event' ? 'bg-info' : 'bg-warning'}" />
											{/if}

											{#if event.type === 'beads_event'}
												<!-- Task events on LEFT side (timeline-start) -->
												<div class="timeline-start timeline-box text-xs mb-4 border-info/30 bg-info/5">
													<!-- Event description -->
													<div class="font-semibold text-base-content">
														{event.description}
													</div>

													<!-- Timestamp -->
													<div class="text-base-content/60 mt-1">
														{formatDate(event.timestamp)}
													</div>

													<!-- Task event metadata badges -->
													<div class="mt-2 flex flex-wrap gap-1">
														{#if event.metadata.status}
															<span class="badge badge-xs {statusColors[event.metadata.status]}">
																{event.metadata.status}
															</span>
														{/if}
														{#if event.metadata.priority !== undefined}
															<span class="badge badge-xs {priorityColors[event.metadata.priority]}">
																P{event.metadata.priority}
															</span>
														{/if}
														{#if event.metadata.type}
															<span class="badge badge-xs badge-outline">
																{event.metadata.type}
															</span>
														{/if}
														{#if event.metadata.assignee}
															<span class="badge badge-xs badge-ghost">
																@{event.metadata.assignee}
															</span>
														{/if}
													</div>
												</div>

												<!-- Timeline middle icon -->
												<div class="timeline-middle">
													<!-- Database icon for task events -->
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="h-4 w-4 text-info"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
														/>
													</svg>
												</div>

												<!-- Empty timeline-end to balance the layout -->
												<div class="timeline-end"></div>
											{:else}
												<!-- Messages on RIGHT side (timeline-end) -->
												<!-- Empty timeline-start to balance the layout -->
												<div class="timeline-start"></div>

												<!-- Timeline middle icon -->
												<div class="timeline-middle">
													<!-- Mail icon for agent mail -->
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="h-4 w-4 text-warning"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
														/>
													</svg>
												</div>

												<div class="timeline-end timeline-box text-xs mb-4 border-warning/30 bg-warning/5">
													<!-- Event description -->
													<div class="font-semibold text-base-content">
														{event.description}
													</div>

													<!-- Timestamp -->
													<div class="text-base-content/60 mt-1">
														{formatDate(event.timestamp)}
													</div>

													<!-- Agent mail metadata -->
													<div class="mt-2 space-y-1">
														{#if event.metadata.from_agent}
															<div class="text-base-content/70">
																<strong>From:</strong> {event.metadata.from_agent}
															</div>
														{/if}
														{#if event.metadata.body}
															<div class="text-base-content/80 whitespace-pre-wrap max-h-64 overflow-y-auto text-xs bg-base-100 p-2 rounded mt-1">
																{event.metadata.body}
															</div>
														{/if}
														<div class="flex gap-1 mt-1">
															{#if event.metadata.importance === 'urgent'}
																<span class="badge badge-xs badge-error">urgent</span>
															{/if}
															{#if event.metadata.ack_required}
																<span class="badge badge-xs badge-warning">ack required</span>
															{/if}
														</div>
													</div>
												</div>
											{/if}

											<!-- Bottom connector (skip for last item) -->
											{#if i < filteredTimeline().length - 1}
												<hr class="{filteredTimeline()[i + 1]?.type === 'beads_event' ? 'bg-info' : 'bg-warning'}" />
											{/if}
										</li>
									{/each}
								</ul>
							{:else}
								<!-- Empty state -->
								<div class="text-xs text-base-content/60 py-4 text-center">
									No activity yet
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Keyboard Shortcuts Help Panel -->
				{#if showHelp}
					<div class="mt-6 p-4 bg-base-200 border border-base-300 rounded-lg">
						<h4 class="text-sm font-semibold mb-3 text-base-content flex items-center gap-2">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
								/>
							</svg>
							Keyboard Shortcuts
						</h4>
						<div class="space-y-2 text-sm">
							<!-- General -->
							<div>
								<div class="flex justify-between items-center py-1">
									<span>Close drawer</span>
									<kbd class="kbd kbd-sm">Esc</kbd>
								</div>
								<div class="flex justify-between items-center py-1">
									<span>Show/hide shortcuts</span>
									<kbd class="kbd kbd-sm">?</kbd>
								</div>
								<div class="flex justify-between items-center py-1">
									<span>Mark task complete</span>
									<kbd class="kbd kbd-sm">M</kbd>
								</div>
							</div>

							<!-- Tip -->
							<div class="divider my-2"></div>
							<div class="alert alert-info py-2 text-xs">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									class="stroke-current shrink-0 w-4 h-4"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
									></path>
								</svg>
								<span>Click any field to edit inline</span>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Footer Actions -->
			{#if !loading && !error && task}
				<div class="p-6 border-t border-base-300 bg-base-200">
					<div class="flex justify-end">
						<button type="button" class="btn btn-ghost" onclick={handleClose}>
							Close
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Toast Notification (Fixed position, bottom-right) -->
	{#if toastMessage}
		<div class="toast toast-end toast-bottom z-[60]">
			<div class="alert {toastMessage.type === 'success' ? 'alert-success' : 'alert-error'}">
				<span>{toastMessage.text}</span>
			</div>
		</div>
	{/if}
</div>
