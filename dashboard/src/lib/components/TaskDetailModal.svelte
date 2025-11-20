<script lang="ts">
	import { onMount } from 'svelte';

	// Props
	let { taskId = null, onClose = null } = $props();

	// State
	let task = $state(null);
	let loading = $state(false);
	let error = $state(null);

	// Fetch task details
	async function fetchTask(id) {
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
		} catch (err) {
			error = err.message;
			console.error('Error fetching task:', err);
		} finally {
			loading = false;
		}
	}

	// Status badge colors
	const statusColors = {
		open: 'badge-info',
		in_progress: 'badge-warning',
		closed: 'badge-success',
		blocked: 'badge-error'
	};

	// Priority badge colors
	const priorityColors = {
		0: 'badge-error',    // P0 - Critical
		1: 'badge-warning',  // P1 - High
		2: 'badge-info',     // P2 - Medium
		3: 'badge-ghost'     // P3 - Low
	};

	// Fetch task when taskId changes
	$effect(() => {
		if (taskId) {
			fetchTask(taskId);
		}
	});

	function formatDate(dateString) {
		if (!dateString) return 'N/A';
		return new Date(dateString).toLocaleString();
	}

	function handleClose() {
		if (onClose) onClose();
	}
</script>

{#if taskId}
	<div class="modal modal-open">
		<div class="modal-box max-w-3xl">
			{#if loading}
				<div class="flex items-center justify-center py-8">
					<span class="loading loading-spinner loading-lg"></span>
				</div>
			{:else if error}
				<div class="alert alert-error">
					<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<span>{error}</span>
				</div>
			{:else if task}
				<h3 class="font-bold text-lg mb-4">{task.title}</h3>

				<!-- Task ID and badges -->
				<div class="flex flex-wrap gap-2 mb-4">
					<div class="badge badge-outline">{task.id}</div>
					<div class="badge {statusColors[task.status] || 'badge-ghost'}">
						{task.status || 'unknown'}
					</div>
					<div class="badge {priorityColors[task.priority] || 'badge-ghost'}">
						P{task.priority ?? '?'}
					</div>
					{#if task.project}
						<div class="badge badge-primary">{task.project}</div>
					{/if}
				</div>

				<!-- Labels -->
				{#if task.labels && task.labels.length > 0}
					<div class="mb-4">
						<h4 class="text-sm font-semibold mb-2">Labels</h4>
						<div class="flex flex-wrap gap-2">
							{#each task.labels as label}
								<span class="badge badge-sm badge-outline">{label}</span>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Description -->
				{#if task.description}
					<div class="mb-4">
						<h4 class="text-sm font-semibold mb-2">Description</h4>
						<p class="text-sm whitespace-pre-wrap">{task.description}</p>
					</div>
				{/if}

				<!-- Dependencies -->
				{#if task.depends_on && task.depends_on.length > 0}
					<div class="mb-4">
						<h4 class="text-sm font-semibold mb-2">Depends On</h4>
						<div class="space-y-2">
							{#each task.depends_on as dep}
								<div class="flex items-center gap-2 text-sm">
									<span class="badge badge-sm {statusColors[dep.status] || 'badge-ghost'}">
										{dep.status || 'unknown'}
									</span>
									<span class="badge badge-sm {priorityColors[dep.priority] || 'badge-ghost'}">
										P{dep.priority ?? '?'}
									</span>
									<span class="font-mono text-xs">{dep.id}</span>
									<span>{dep.title || 'Untitled'}</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Dependents (blocked by) -->
				{#if task.blocked_by && task.blocked_by.length > 0}
					<div class="mb-4">
						<h4 class="text-sm font-semibold mb-2">Blocks</h4>
						<div class="space-y-2">
							{#each task.blocked_by as dep}
								<div class="flex items-center gap-2 text-sm">
									<span class="badge badge-sm {statusColors[dep.status] || 'badge-ghost'}">
										{dep.status || 'unknown'}
									</span>
									<span class="badge badge-sm {priorityColors[dep.priority] || 'badge-ghost'}">
										P{dep.priority ?? '?'}
									</span>
									<span class="font-mono text-xs">{dep.id}</span>
									<span>{dep.title || 'Untitled'}</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Metadata -->
				<div class="text-xs text-base-content/60 mt-6 space-y-1">
					<div><strong>Created:</strong> {formatDate(task.created_at)}</div>
					<div><strong>Updated:</strong> {formatDate(task.updated_at)}</div>
					{#if task.assignee}
						<div><strong>Assignee:</strong> {task.assignee}</div>
					{/if}
				</div>

				<!-- Actions -->
				<div class="modal-action">
					<button class="btn btn-sm" onclick={handleClose}>Close</button>
					{#if task.project_path}
						<a href={`vscode://file${task.project_path}/.beads/beads.base.jsonl`} class="btn btn-sm btn-primary">
							Open in VS Code
						</a>
					{/if}
				</div>
			{/if}
		</div>
		<div class="modal-backdrop" onclick={handleClose}></div>
	</div>
{/if}
