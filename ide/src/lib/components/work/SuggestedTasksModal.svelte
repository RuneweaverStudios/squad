<script lang="ts">
	/**
	 * SuggestedTasksModal Component
	 *
	 * Modal for reviewing and creating tasks from JAT:SUGGESTED_TASKS markers.
	 * Opened by clicking the suggested tasks badge on SessionCard.
	 *
	 * Features:
	 * - List all suggested tasks with type icon, priority badge, title, description
	 * - Checkbox selection for each task
	 * - 'Create in JAT' button for individual tasks
	 * - 'Create All' bulk action
	 * - Select All / Deselect All quick actions
	 * - Inline editing of priority and type
	 */

	import { slide } from 'svelte/transition';
	import { getIssueTypeVisual } from '$lib/config/statusColors';
	import type { SuggestedTask } from '$lib/types/signals';

	/** Extended SuggestedTask with local UI state */
	export interface SuggestedTaskWithState extends SuggestedTask {
		selected: boolean;
		edited: boolean;
		/** Whether this task already exists in JAT (matched by title) */
		alreadyCreated?: boolean;
		/** Task ID if this task was already created (for displaying clickable badge) */
		taskId?: string;
		edits?: {
			type?: string;
			title?: string;
			description?: string;
			priority?: number;
		};
	}

	interface Props {
		/** Whether the modal is open */
		isOpen: boolean;
		/** Callback to close the modal */
		onClose: () => void;
		/** Suggested tasks to display */
		tasks: SuggestedTaskWithState[];
		/** Callback when tasks are created */
		onCreateTasks: (tasks: SuggestedTaskWithState[]) => Promise<void>;
		/** Agent name for context */
		agentName?: string;
		/** Session name for context */
		sessionName?: string;
		/** Callback when user clicks a task ID (opens detail drawer) */
		onTaskClick?: (taskId: string) => void;
	}

	let {
		isOpen = false,
		onClose,
		tasks,
		onCreateTasks,
		agentName = '',
		sessionName = '',
		onTaskClick
	}: Props = $props();

	// Local state for selections and edits (keyed by task title+index)
	let selections = $state<Map<string, boolean>>(new Map());
	let edits = $state<Map<string, Partial<SuggestedTask>>>(new Map());

	// Creating state
	let isCreating = $state(false);
	let createError = $state<string | null>(null);
	let createSuccess = $state<string | null>(null);

	// Expanded task for full description view
	let expandedTaskKey = $state<string | null>(null);

	// Task type options
	const TASK_TYPES = ['feature', 'bug', 'task', 'chore', 'epic'];

	// Priority options
	const PRIORITIES = [
		{ value: 0, label: 'P0' },
		{ value: 1, label: 'P1' },
		{ value: 2, label: 'P2' },
		{ value: 3, label: 'P3' },
		{ value: 4, label: 'P4' }
	];

	// Get task key for state tracking
	function getTaskKey(task: SuggestedTask, index: number): string {
		return `${task.title || ''}-${index}`;
	}

	// Get effective value considering edits
	function getEffectiveValue<K extends keyof SuggestedTask>(
		task: SuggestedTask,
		index: number,
		key: K
	): SuggestedTask[K] {
		const taskKey = getTaskKey(task, index);
		const taskEdits = edits.get(taskKey);
		if (taskEdits && key in taskEdits) {
			return taskEdits[key as keyof typeof taskEdits] as SuggestedTask[K];
		}
		return task[key];
	}

	// Check if task is selected
	function isSelected(task: SuggestedTask, index: number): boolean {
		return selections.get(getTaskKey(task, index)) ?? false;
	}

	// Toggle task selection
	function toggleSelection(task: SuggestedTask, index: number) {
		const key = getTaskKey(task, index);
		const newSelections = new Map(selections);
		newSelections.set(key, !newSelections.get(key));
		selections = newSelections;
	}

	// Select all tasks (skip already-created ones)
	function selectAll() {
		const newSelections = new Map(selections);
		tasks.forEach((task, index) => {
			if (!task.alreadyCreated) {
				newSelections.set(getTaskKey(task, index), true);
			}
		});
		selections = newSelections;
	}

	// Deselect all tasks
	function deselectAll() {
		selections = new Map();
	}

	// Update task field
	function updateTaskField(
		task: SuggestedTask,
		index: number,
		field: keyof SuggestedTask,
		value: unknown
	) {
		const key = getTaskKey(task, index);
		const newEdits = new Map(edits);
		const existing = newEdits.get(key) || {};
		newEdits.set(key, { ...existing, [field]: value });
		edits = newEdits;
	}

	// Get priority CSS class
	function getPriorityClass(priority: number): string {
		const classes: Record<number, string> = {
			0: 'priority-p0',
			1: 'priority-p1',
			2: 'priority-p2',
			3: 'priority-p3',
			4: 'priority-p4'
		};
		return classes[priority] || 'priority-p2';
	}

	// Count selected tasks (excluding already-created)
	const selectedCount = $derived(
		tasks.filter((task, index) => isSelected(task, index) && !task.alreadyCreated).length
	);

	// Count tasks that can still be created (not already created)
	const creatableCount = $derived(
		tasks.filter((task) => !task.alreadyCreated).length
	);

	// Count already created tasks
	const alreadyCreatedCount = $derived(
		tasks.filter((task) => task.alreadyCreated).length
	);

	// Get selected tasks with edits applied (excluding already-created)
	function getSelectedTasksWithEdits(): SuggestedTaskWithState[] {
		return tasks
			.map((task, index) => {
				if (!isSelected(task, index) || task.alreadyCreated) return null;
				const key = getTaskKey(task, index);
				const taskEdits = edits.get(key);
				return {
					...task,
					...(taskEdits || {}),
					selected: true,
					edited: !!taskEdits,
					edits: taskEdits
				} as SuggestedTaskWithState;
			})
			.filter((t): t is SuggestedTaskWithState => t !== null);
	}

	// Create selected tasks
	async function handleCreateSelected() {
		const selectedTasks = getSelectedTasksWithEdits();
		if (selectedTasks.length === 0) return;

		isCreating = true;
		createError = null;
		createSuccess = null;

		try {
			await onCreateTasks(selectedTasks);
			createSuccess = `Created ${selectedTasks.length} task${selectedTasks.length > 1 ? 's' : ''}`;

			// Clear selections for created tasks
			const newSelections = new Map(selections);
			selectedTasks.forEach((task, index) => {
				const key = getTaskKey(task, index);
				newSelections.delete(key);
			});
			selections = newSelections;

			// Close modal after short delay
			setTimeout(() => {
				onClose();
			}, 1500);
		} catch (err) {
			createError = err instanceof Error ? err.message : 'Failed to create tasks';
		} finally {
			isCreating = false;
		}
	}

	// Create single task
	async function handleCreateSingle(task: SuggestedTask, index: number) {
		const key = getTaskKey(task, index);
		const taskEdits = edits.get(key);
		const taskWithEdits: SuggestedTaskWithState = {
			...task,
			...(taskEdits || {}),
			selected: true,
			edited: !!taskEdits,
			edits: taskEdits
		};

		isCreating = true;
		createError = null;
		createSuccess = null;

		try {
			await onCreateTasks([taskWithEdits]);
			createSuccess = `Created task: ${task.title}`;

			// Remove this task from the list visually (it will be filtered out on next render)
			const newSelections = new Map(selections);
			newSelections.delete(key);
			selections = newSelections;
		} catch (err) {
			createError = err instanceof Error ? err.message : 'Failed to create task';
		} finally {
			isCreating = false;
		}
	}

	// Toggle expand
	function toggleExpand(task: SuggestedTask, index: number) {
		const key = getTaskKey(task, index);
		expandedTaskKey = expandedTaskKey === key ? null : key;
	}

	// Check if task is human type (bug or explicitly human-tagged)
	function isHumanTask(task: SuggestedTask): boolean {
		const type = (task.type || '').toLowerCase();
		const reason = (task.reason || '').toLowerCase();
		return type === 'bug' || reason.includes('human') || reason.includes('manual');
	}

	// Handle modal close
	function handleClose() {
		if (!isCreating) {
			createError = null;
			createSuccess = null;
			onClose();
		}
	}

	// Handle backdrop click
	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			handleClose();
		}
	}
</script>

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal modal-open" onclick={handleBackdropClick}>
		<div
			class="modal-box max-w-2xl max-h-[85vh] flex flex-col bg-base-200 border border-base-300"
		>
			<!-- Header -->
			<div class="flex items-center justify-between mb-4 flex-shrink-0">
				<div>
					<div class="flex items-center gap-2">
						<span class="text-lg">💡</span>
						<h3
							class="text-lg font-bold font-mono text-base-content"
						>
							Suggested Tasks
						</h3>
						<span
							class="badge badge-sm badge-primary font-mono"
						>
							{tasks.length}
						</span>
					</div>
					{#if agentName}
						<p class="text-xs mt-1 text-base-content/50">
							From agent: <span class="font-mono">{agentName}</span>
						</p>
					{/if}
				</div>
				<button
					class="btn btn-sm btn-circle btn-ghost"
					onclick={handleClose}
					disabled={isCreating}
					aria-label="Close modal"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			<!-- Bulk actions bar -->
			<div
				class="flex items-center justify-between px-2 py-2 mb-3 rounded-lg flex-shrink-0 bg-base-300 border border-base-content/20"
			>
				<div class="flex items-center gap-3 text-xs text-base-content/60">
					<button
						type="button"
						class="hover:text-primary transition-colors"
						onclick={selectAll}
						disabled={isCreating}
					>
						Select All
					</button>
					<span class="opacity-40">|</span>
					<button
						type="button"
						class="hover:text-primary transition-colors"
						onclick={deselectAll}
						disabled={isCreating}
					>
						Clear
					</button>
				</div>
				{#if alreadyCreatedCount > 0}
					<span class="text-xs font-mono text-success/70">
						{alreadyCreatedCount} already created
					</span>
				{/if}
				{#if selectedCount > 0}
					<span class="text-xs font-mono text-success">
						{selectedCount} of {creatableCount} selected
					</span>
				{/if}
			</div>

			<!-- Task list (scrollable) -->
			<div class="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
				{#each tasks as task, index (getTaskKey(task, index))}
					{@const taskKey = getTaskKey(task, index)}
					{@const selected = isSelected(task, index)}
					{@const isHuman = isHumanTask(task)}
					{@const isExpanded = expandedTaskKey === taskKey}
					{@const effectiveType = getEffectiveValue(task, index, 'type') || 'task'}
					{@const effectivePriority = getEffectiveValue(task, index, 'priority') ?? 2}
					{@const effectiveDescription = getEffectiveValue(task, index, 'description') || ''}
					{@const priorityClass = getPriorityClass(effectivePriority)}
					{@const typeVisual = getIssueTypeVisual(effectiveType)}

					<div
						class="rounded-lg transition-all border fade-in-left fade-in-delay-{Math.min(index, 12)} {task.alreadyCreated
							? 'task-card-created'
							: selected
								? isHuman
									? 'task-card-human-selected'
									: 'task-card-agent-selected'
								: 'task-card-default'}"
					>
						<!-- Main task row -->
						<div class="flex items-start gap-3 p-3">
							<!-- Checkbox (disabled for already-created tasks) -->
							{#if task.alreadyCreated}
								<div
									class="flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 checkbox-created"
									title="Already created in JAT"
								>
									<svg
										class="w-3 h-3 text-success"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="3"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M5 13l4 4L19 7"
										/>
									</svg>
								</div>
							{:else}
								<button
									type="button"
									class="flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 transition-colors cursor-pointer {selected
										? isHuman
											? 'checkbox-human-selected'
											: 'checkbox-agent-selected'
										: 'checkbox-default'}"
									onclick={() => toggleSelection(task, index)}
									disabled={isCreating}
									aria-label={selected ? 'Deselect task' : 'Select task'}
								>
									{#if selected}
										<svg
											class="w-3 h-3 text-white"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="3"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M5 13l4 4L19 7"
											/>
										</svg>
									{/if}
								</button>
							{/if}

							<!-- Task content -->
							<div class="flex-1 min-w-0">
								<!-- Type, Priority, Title row -->
								<div class="flex items-center gap-2 flex-wrap">
									<!-- Human/Agent indicator -->
									<span
										class="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold {isHuman ? 'badge-human' : 'badge-agent'}"
										title={isHuman
											? 'Human task (requires manual action)'
											: 'Agent task (can be automated)'}
									>
										{isHuman ? '🧑' : '🤖'}
									</span>

									<!-- Priority dropdown -->
									<select
										class="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold cursor-pointer appearance-none select-arrow {priorityClass}"
										value={effectivePriority}
										onchange={(e) =>
											updateTaskField(task, index, 'priority', parseInt(e.currentTarget.value))}
										disabled={isCreating}
									>
										{#each PRIORITIES as p}
											<option value={p.value}>{p.label}</option>
										{/each}
									</select>

									<!-- Type dropdown -->
									<select
										class="text-[10px] px-1.5 py-0.5 rounded font-mono cursor-pointer appearance-none capitalize select-arrow bg-base-300 text-base-content border border-base-content/20"
										value={effectiveType}
										onchange={(e) =>
											updateTaskField(task, index, 'type', e.currentTarget.value)}
										disabled={isCreating}
									>
										{#each TASK_TYPES as t}
											<option value={t}>{t}</option>
										{/each}
									</select>

									<!-- Type icon -->
									<span class="text-sm opacity-70" title={typeVisual.label}>
										{typeVisual.icon}
									</span>

									<!-- Title -->
									<span
										class="flex-1 min-w-0 text-sm font-medium truncate text-base-content"
										title={task.title}
									>
										{task.title}
									</span>

									<!-- Expand/collapse button -->
									<button
										type="button"
										class="flex-shrink-0 p-1 rounded opacity-60 hover:opacity-100 transition-opacity"
										onclick={() => toggleExpand(task, index)}
										title={isExpanded ? 'Collapse' : 'Expand description'}
									>
										<svg
											class="w-4 h-4 transition-transform {isExpanded ? 'rotate-180' : ''}"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M19 9l-7 7-7-7"
											/>
										</svg>
									</button>

									<!-- Create single button OR Created badge -->
									{#if task.alreadyCreated}
										{#if task.taskId && onTaskClick}
											<button
												type="button"
												class="flex-shrink-0 badge badge-sm badge-success gap-1 cursor-pointer hover:brightness-110 transition-all"
												onclick={() => onTaskClick(task.taskId!)}
												title="Click to view task {task.taskId}"
											>
												<svg
													class="w-3 h-3"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
													stroke-width="2"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M5 13l4 4L19 7"
													/>
												</svg>
												{task.taskId}
											</button>
										{:else}
											<span
												class="flex-shrink-0 badge badge-sm badge-success gap-1"
												title="This task already exists in JAT"
											>
												<svg
													class="w-3 h-3"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
													stroke-width="2"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M5 13l4 4L19 7"
													/>
												</svg>
												Created
											</span>
										{/if}
									{:else}
										<button
											type="button"
											class="flex-shrink-0 btn btn-xs btn-success gap-1"
											onclick={() => handleCreateSingle(task, index)}
											disabled={isCreating}
											title="Create this task in JAT"
										>
											<svg
												class="w-3 h-3"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												stroke-width="2"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M12 4.5v15m7.5-7.5h-15"
												/>
											</svg>
											Create
										</button>
									{/if}
								</div>

								<!-- Description preview (when collapsed) -->
								{#if !isExpanded && effectiveDescription}
									<p
										class="text-xs mt-1.5 line-clamp-2 text-base-content/60"
										title={effectiveDescription}
									>
										{effectiveDescription}
									</p>
								{/if}

								<!-- Reason if provided -->
								{#if task.reason && !isExpanded}
									<p
										class="text-xs mt-1 italic text-info/80"
									>
										💡 {task.reason}
									</p>
								{/if}
							</div>
						</div>

						<!-- Expanded description -->
						{#if isExpanded}
							<div class="px-3 pb-3 ml-8" transition:slide={{ duration: 150 }}>
								<div
									class="p-2 rounded text-xs whitespace-pre-wrap bg-base-300 text-base-content/80 border border-base-content/20"
								>
									{effectiveDescription || 'No description provided.'}
								</div>
								{#if task.reason}
									<p
										class="text-[10px] mt-2 opacity-60 text-base-content/60"
									>
										💡 Reason: {task.reason}
									</p>
								{/if}
							</div>
						{/if}
					</div>
				{/each}

				{#if tasks.length === 0}
					<div
						class="text-center py-8 text-base-content/50"
					>
						<p>No suggested tasks found.</p>
					</div>
				{/if}
			</div>

			<!-- Error/Success messages -->
			{#if createError}
				<div
					class="mt-3 p-3 rounded-lg text-sm flex-shrink-0 alert alert-error"
				>
					<div class="flex items-center gap-2">
						<svg
							class="w-4 h-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span>{createError}</span>
					</div>
				</div>
			{/if}

			{#if createSuccess}
				<div
					class="mt-3 p-3 rounded-lg text-sm flex-shrink-0 alert alert-success"
				>
					<div class="flex items-center gap-2">
						<svg
							class="w-4 h-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span>{createSuccess}</span>
					</div>
				</div>
			{/if}

			<!-- Footer actions -->
			<div class="flex items-center justify-between mt-4 pt-3 border-t border-base-content/20 flex-shrink-0">
				<p class="text-[10px] text-base-content/50">
					Tasks will be created in JAT with the current project context.
				</p>
				<div class="flex gap-2">
					<button
						class="btn btn-ghost btn-sm"
						onclick={handleClose}
						disabled={isCreating}
					>
						Cancel
					</button>
					<button
						class="btn btn-sm btn-success gap-2"
						onclick={handleCreateSelected}
						disabled={selectedCount === 0 || isCreating}
					>
						{#if isCreating}
							<span class="loading loading-spinner loading-xs"></span>
							Creating...
						{:else}
							<svg
								class="w-4 h-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M12 4.5v15m7.5-7.5h-15"
								/>
							</svg>
							Create {selectedCount > 0 ? selectedCount : 'Selected'} Task{selectedCount !== 1 ? 's' : ''}
						{/if}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* Task card states */
	.task-card-default {
		background: var(--color-base-300) / 0.5;
		border-color: var(--color-base-content) / 0.2;
	}

	.task-card-created {
		background: var(--color-success) / 0.2;
		border-color: var(--color-success) / 0.5;
		opacity: 0.75;
	}

	.task-card-human-selected {
		background: var(--color-warning) / 0.3;
		border-color: var(--color-warning) / 0.5;
	}

	.task-card-agent-selected {
		background: var(--color-info) / 0.3;
		border-color: var(--color-info) / 0.5;
	}

	/* Checkbox states */
	.checkbox-default {
		background: transparent;
		border-color: var(--color-base-content) / 0.4;
	}

	.checkbox-created {
		background: var(--color-success) / 0.3;
		border-color: var(--color-success);
	}

	.checkbox-human-selected {
		background: var(--color-warning);
		border-color: var(--color-warning);
	}

	.checkbox-agent-selected {
		background: var(--color-info);
		border-color: var(--color-info);
	}

	/* Human/Agent badges */
	.badge-human {
		background: var(--color-warning) / 0.8;
		color: var(--color-warning-content);
	}

	.badge-agent {
		background: var(--color-info) / 0.8;
		color: var(--color-info-content);
	}

	/* Priority classes */
	.priority-p0 {
		background: var(--color-error) / 0.3;
		color: var(--color-error);
		border: none;
		min-width: 38px;
		padding-right: 1rem;
	}

	.priority-p1 {
		background: var(--color-warning) / 0.3;
		color: var(--color-warning);
		border: none;
		min-width: 38px;
		padding-right: 1rem;
	}

	.priority-p2 {
		background: var(--color-success) / 0.3;
		color: var(--color-success);
		border: none;
		min-width: 38px;
		padding-right: 1rem;
	}

	.priority-p3 {
		background: var(--color-info) / 0.3;
		color: var(--color-info);
		border: none;
		min-width: 38px;
		padding-right: 1rem;
	}

	.priority-p4 {
		background: var(--color-base-content) / 0.2;
		color: var(--color-base-content);
		border: none;
		min-width: 38px;
		padding-right: 1rem;
	}

	/* Select dropdown arrow */
	.select-arrow {
		background-image: url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 20 20%27%3E%3Cpath stroke=%27%23888%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%271.5%27 d=%27M6 8l4 4 4-4%27/%3E%3C/svg%3E');
		background-position: right 0.1rem center;
		background-repeat: no-repeat;
		background-size: 0.8rem;
	}
</style>
