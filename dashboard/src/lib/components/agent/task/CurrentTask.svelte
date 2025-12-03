<script lang="ts">
	/**
	 * CurrentTask Component
	 *
	 * Displays the current task assigned to an agent.
	 * Supports inline editing in expanded mode.
	 */

	import type { Task, ActivityState } from '$lib/types/agent';
	import { getPriorityVisual, getIssueTypeVisual } from '$lib/config/statusColors';
	import TaskIdBadge from '$lib/components/TaskIdBadge.svelte';

	interface Props {
		task: Task | null;
		editable?: boolean;
		showDetails?: boolean;
		onClick?: (taskId: string) => void;
		onTitleChange?: (newTitle: string) => Promise<void>;
		/** Activity state for color styling */
		activityState?: ActivityState;
		/** Use compact styling (mono font, state-based colors) */
		compact?: boolean;
		class?: string;
	}

	let {
		task,
		editable = false,
		showDetails = false,
		onClick,
		onTitleChange,
		activityState,
		compact = false,
		class: className = ''
	}: Props = $props();

	// Title color based on activity state
	const titleColor = $derived(
		activityState === 'completed' ? 'oklch(0.75 0.02 250)' : 'oklch(0.90 0.02 250)'
	);

	let isEditing = $state(false);
	let editedTitle = $state('');
	let isSaving = $state(false);

	// Priority and type visuals
	const priorityVisual = $derived(task ? getPriorityVisual(task.priority) : null);
	const typeVisual = $derived(task ? getIssueTypeVisual(task.issue_type) : null);

	function startEditing() {
		if (!editable || !task) return;
		editedTitle = task.title;
		isEditing = true;
	}

	async function saveTitle() {
		if (!task || !onTitleChange || editedTitle === task.title) {
			isEditing = false;
			return;
		}

		isSaving = true;
		try {
			await onTitleChange(editedTitle);
		} finally {
			isSaving = false;
			isEditing = false;
		}
	}

	function cancelEdit() {
		isEditing = false;
		editedTitle = task?.title || '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			saveTitle();
		} else if (e.key === 'Escape') {
			cancelEdit();
		}
	}

	function handleClick() {
		if (!isEditing && task && onClick) {
			onClick(task.id);
		}
	}
</script>

{#if task}
	<div class="flex flex-col gap-1 {className}">
		<!-- Task header: ID + badges -->
		<div class="flex items-center gap-2 flex-wrap">
			{#if compact}
				<!-- Compact mode: Use TaskIdBadge with project colors -->
				<TaskIdBadge
					task={{ id: task.id, status: task.status || 'in_progress', issue_type: task.issue_type, title: task.title }}
					size="xs"
					showType={false}
					showStatus={false}
					onOpenTask={onClick}
				/>
				<!-- Priority badge -->
				{#if priorityVisual}
					<span class="badge badge-xs {priorityVisual.badge}">
						{priorityVisual.label}
					</span>
				{/if}
				<!-- Type badge -->
				{#if typeVisual}
					<span class="badge badge-xs badge-ghost" title={task.issue_type}>
						{typeVisual.icon}
					</span>
				{/if}
			{:else}
				<!-- Standard mode: Simple badges -->
				<span class="badge badge-sm badge-outline font-mono opacity-70">
					{task.id}
				</span>
				<!-- Priority badge -->
				{#if priorityVisual}
					<span class="badge badge-sm {priorityVisual.badge}">
						{priorityVisual.label}
					</span>
				{/if}
				<!-- Type badge -->
				{#if typeVisual}
					<span class="badge badge-sm badge-ghost" title={task.issue_type}>
						{typeVisual.icon}
					</span>
				{/if}
			{/if}
		</div>

		<!-- Task title -->
		<div class="flex items-start gap-2">
			{#if isEditing}
				<!-- Edit mode -->
				<div class="flex-1 flex items-center gap-2">
					<input
						type="text"
						class="input input-sm input-bordered flex-1"
						bind:value={editedTitle}
						onkeydown={handleKeydown}
						disabled={isSaving}
						autofocus
					/>
					<button
						type="button"
						class="btn btn-sm btn-success btn-square"
						onclick={saveTitle}
						disabled={isSaving}
					>
						{#if isSaving}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
							<svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
							</svg>
						{/if}
					</button>
					<button
						type="button"
						class="btn btn-sm btn-ghost btn-square"
						onclick={cancelEdit}
						disabled={isSaving}
					>
						<svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
							<path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
						</svg>
					</button>
				</div>
			{:else}
				<!-- View mode -->
				{#if compact}
					<button
						type="button"
						class="flex-1 text-left font-mono font-bold text-sm tracking-wide truncate hover:border-b hover:border-dashed hover:border-base-content/30"
						style="color: {titleColor};"
						class:cursor-pointer={onClick}
						onclick={handleClick}
						ondblclick={editable ? startEditing : undefined}
						title={editable ? 'Double-click to edit' : task.title}
					>
						{task.title}
					</button>
				{:else}
					<button
						type="button"
						class="flex-1 text-left font-medium hover:text-primary transition-colors truncate"
						class:cursor-pointer={onClick}
						onclick={handleClick}
						ondblclick={editable ? startEditing : undefined}
						title={editable ? 'Double-click to edit' : task.title}
					>
						{task.title}
					</button>
				{/if}

				{#if editable}
					<button
						type="button"
						class="btn btn-ghost btn-xs btn-square opacity-50 hover:opacity-100"
						onclick={startEditing}
						title="Edit title"
					>
						<svg class="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
							<path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
						</svg>
					</button>
				{/if}
			{/if}
		</div>

		<!-- Task details (if showDetails is true) -->
		{#if showDetails && task.description}
			<p class="text-sm text-base-content/60 line-clamp-2">
				{task.description}
			</p>
		{/if}

		<!-- Labels -->
		{#if showDetails && task.labels && task.labels.length > 0}
			<div class="flex flex-wrap gap-1 mt-1">
				{#each task.labels.slice(0, 3) as label}
					<span class="badge badge-xs badge-outline">{label}</span>
				{/each}
				{#if task.labels.length > 3}
					<span class="badge badge-xs badge-ghost">+{task.labels.length - 3}</span>
				{/if}
			</div>
		{/if}
	</div>
{:else}
	<!-- No task state -->
	<div class="text-sm text-base-content/50 italic {className}">
		No active task
	</div>
{/if}
