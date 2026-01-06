<script lang="ts">
	/**
	 * SuggestedTasksSection Component
	 *
	 * Interactive panel for reviewing and editing suggested tasks from agents.
	 * Displays tasks detected via JAT:SUGGESTED_TASKS markers in terminal output.
	 *
	 * Features:
	 * - Checkbox to select/deselect each task
	 * - Visual indicator for task type: 🧑 human vs 🤖 agent
	 * - Priority badge (P0/P1/P2) - editable dropdown
	 * - Editable title field (inline edit on click)
	 * - Expandable description field (edit on expand)
	 * - Select All / Deselect All buttons
	 * - Counter showing 'X of Y selected'
	 * - 'Create Selected Tasks' primary action button
	 * - Collapse/expand toggle to minimize when not actively reviewing
	 *
	 * Styling:
	 * - Orange/amber theme for human tasks
	 * - Blue/cyan theme for agent tasks
	 */

	import { slide } from 'svelte/transition';
	import { getIssueTypeVisual } from '$lib/config/statusColors';
	import type { SuggestedTask } from '$lib/types/signals';
	import SlideOpenButton from '$lib/components/SlideOpenButton.svelte';

	/** Extended SuggestedTask with local UI state */
	interface SuggestedTaskWithState extends SuggestedTask {
		selected: boolean;
		edited: boolean;
		/** Whether this task already exists in Beads (matched by title) */
		alreadyCreated?: boolean;
		/** Task ID if this task was already created (for displaying clickable badge) */
		taskId?: string;
		edits?: {
			type?: string;
			title?: string;
			description?: string;
			priority?: number;
			project?: string;
			labels?: string;
			depends_on?: string[];
		};
	}

	/** Result of a single task creation */
	interface TaskCreationResult {
		title: string;
		taskId?: string;
		success: boolean;
		error?: string;
	}

	interface Props {
		/** Detected suggested tasks with selection state */
		tasks: SuggestedTaskWithState[];
		/** Number of currently selected tasks */
		selectedCount: number;
		/** Callback to toggle selection */
		onToggleSelection: (taskKey: string) => void;
		/** Callback to get task key for a task */
		getTaskKey: (task: SuggestedTask, index: number) => string;
		/** Callback when user wants to create selected tasks */
		onCreateTasks?: (tasks: SuggestedTaskWithState[]) => void;
		/** Callback when user wants to create selected tasks AND start agents */
		onCreateAndStartTasks?: (tasks: SuggestedTaskWithState[]) => void;
		/** Callback to edit a task field */
		onEditTask?: (taskKey: string, edits: Partial<SuggestedTask>) => void;
		/** Callback to clear edits for a task */
		onClearEdits?: (taskKey: string) => void;
		/** Whether task creation is in progress */
		isCreating?: boolean;
		/** Creation results for feedback display */
		createResults?: { success: TaskCreationResult[]; failed: TaskCreationResult[] };
		/** Whether to show the feedback message */
		showFeedback?: boolean;
		/** Callback to dismiss feedback */
		onDismissFeedback?: () => void;
		/** Available projects for dropdown (from parent/store) */
		availableProjects?: string[];
		/** Default project for tasks without explicit project (from current session) */
		defaultProject?: string;
		/** Callback when user clicks a task ID (opens detail drawer) */
		onTaskClick?: (taskId: string) => void;
	}

	let {
		tasks,
		selectedCount,
		onToggleSelection,
		getTaskKey,
		onCreateTasks,
		onCreateAndStartTasks,
		onEditTask,
		onClearEdits,
		isCreating = false,
		createResults = { success: [], failed: [] },
		showFeedback = false,
		onDismissFeedback,
		availableProjects = [],
		defaultProject = '',
		onTaskClick,
	}: Props = $props();

	// Collapsed state for the section
	let isCollapsed = $state(false);

	// Track which task's description is expanded
	let expandedTaskKey = $state<string | null>(null);

	// Track which task's title is being edited
	let editingTitleKey = $state<string | null>(null);
	let editingTitleValue = $state<string>('');

	// Task type options
	const TASK_TYPES = ['feature', 'bug', 'task', 'chore', 'epic'];

	// Priority options with CSS class names (colors defined in style block)
	const PRIORITIES = [
		{ value: 0, label: 'P0', cssClass: 'priority-p0' },
		{ value: 1, label: 'P1', cssClass: 'priority-p1' },
		{ value: 2, label: 'P2', cssClass: 'priority-p2' },
		{ value: 3, label: 'P3', cssClass: 'priority-p3' },
		{ value: 4, label: 'P4', cssClass: 'priority-p4' },
	];

	function toggleCollapse() {
		isCollapsed = !isCollapsed;
	}

	function handleCreateSelected() {
		const selectedTasks = tasks.filter((t) => t.selected);
		if (selectedTasks.length > 0 && onCreateTasks) {
			onCreateTasks(selectedTasks);
		}
	}

	function handleCreateAndStartSelected() {
		const selectedTasks = tasks.filter((t) => t.selected);
		if (selectedTasks.length > 0 && onCreateAndStartTasks) {
			onCreateAndStartTasks(selectedTasks);
		}
	}

	function selectAll() {
		tasks.forEach((task, index) => {
			const key = getTaskKey(task, index);
			if (!task.selected) {
				onToggleSelection(key);
			}
		});
	}

	function deselectAll() {
		tasks.forEach((task, index) => {
			const key = getTaskKey(task, index);
			if (task.selected) {
				onToggleSelection(key);
			}
		});
	}

	// Get effective value considering edits
	function getEffectiveValue<K extends keyof SuggestedTask>(
		task: SuggestedTaskWithState,
		key: K,
	): SuggestedTask[K] {
		return (task.edits?.[key as keyof typeof task.edits] ?? task[key]) as SuggestedTask[K];
	}

	// Determine if task is human vs agent
	// Human tasks: bugs, tasks with "human" in reason, or type explicitly set
	// Agent tasks: features, chores, epics (typically automatable)
	function isHumanTask(task: SuggestedTaskWithState): boolean {
		const type = (getEffectiveValue(task, 'type') || '').toLowerCase();
		const reason = (task.reason || '').toLowerCase();
		return type === 'bug' || reason.includes('human') || reason.includes('manual');
	}

	// Toggle description expansion
	function toggleExpand(taskKey: string, event: MouseEvent) {
		event.stopPropagation();
		expandedTaskKey = expandedTaskKey === taskKey ? null : taskKey;
	}

	// Svelte action to auto-size textarea on mount
	function autosize(node: HTMLTextAreaElement) {
		const resize = () => {
			node.style.height = 'auto';
			node.style.height = node.scrollHeight + 'px';
		};
		// Resize after a tick to ensure content is rendered
		setTimeout(resize, 0);
		return { destroy() {} };
	}

	// Start editing title
	function startEditingTitle(taskKey: string, currentTitle: string, event: MouseEvent) {
		event.stopPropagation();
		editingTitleKey = taskKey;
		editingTitleValue = currentTitle;
	}

	// Save title edit
	function saveTitle(taskKey: string) {
		if (onEditTask && editingTitleValue.trim()) {
			onEditTask(taskKey, { title: editingTitleValue.trim() });
		}
		editingTitleKey = null;
		editingTitleValue = '';
	}

	// Cancel title edit
	function cancelTitleEdit() {
		editingTitleKey = null;
		editingTitleValue = '';
	}

	// Handle title keydown
	function handleTitleKeydown(event: KeyboardEvent, taskKey: string) {
		if (event.key === 'Enter') {
			event.preventDefault();
			saveTitle(taskKey);
		} else if (event.key === 'Escape') {
			cancelTitleEdit();
		}
	}

	// Update priority
	function updatePriority(taskKey: string, priority: number, event: Event) {
		event.stopPropagation();
		if (onEditTask) {
			onEditTask(taskKey, { priority });
		}
	}

	// Update type
	function updateType(taskKey: string, type: string, event: Event) {
		event.stopPropagation();
		if (onEditTask) {
			onEditTask(taskKey, { type });
		}
	}

	// Update description
	function updateDescription(taskKey: string, description: string) {
		if (onEditTask) {
			onEditTask(taskKey, { description });
		}
	}

	// Update project
	function updateProject(taskKey: string, project: string) {
		if (onEditTask) {
			onEditTask(taskKey, { project });
		}
	}

	// Update labels
	function updateLabels(taskKey: string, labels: string) {
		if (onEditTask) {
			onEditTask(taskKey, { labels });
		}
	}

	// Update depends_on (from comma-separated string)
	function updateDependsOn(taskKey: string, dependsOnStr: string) {
		if (onEditTask) {
			const depends_on = dependsOnStr
				.split(',')
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
			onEditTask(taskKey, { depends_on });
		}
	}

	// Clear edits for a task
	function handleClearEdits(taskKey: string, event: MouseEvent) {
		event.stopPropagation();
		if (onClearEdits) {
			onClearEdits(taskKey);
		}
	}

	// Get priority class name
	function getPriorityClass(priority: number): string {
		const p = PRIORITIES.find((p) => p.value === priority) || PRIORITIES[2];
		return p.cssClass;
	}

</script>

<div
	class="suggested-tasks-section rounded-lg overflow-hidden bg-base-200 border border-base-300"
>
	<!-- Header (always visible, click to collapse/expand) -->
	<button
		type="button"
		class="w-full flex items-center justify-between px-3 py-2 cursor-pointer hover:brightness-110 transition-all"
		onclick={toggleCollapse}
	>
		<div class="flex items-center gap-2">
			<!-- Lightbulb icon -->
			<svg
				class="w-4 h-4 text-primary"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
				/>
			</svg>
			<span class="font-semibold text-sm text-base-content">
				Suggested Tasks
			</span>
			<!-- Count badge -->
			<span class="badge badge-sm badge-neutral font-mono pt-1">
				{tasks.length}
			</span>
			{#if selectedCount > 0 && isCollapsed}
				<span class="badge badge-sm badge-success font-mono">
					{selectedCount} selected
				</span>
			{/if}
		</div>

		<!-- Collapse/Expand chevron -->
		<svg
			class="w-4 h-4 transition-transform duration-200 text-base-content/60"
			class:rotate-180={!isCollapsed}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	<!-- Collapsible content -->
	{#if !isCollapsed}
		<div class="px-3 pb-3 space-y-2" transition:slide={{ duration: 200 }}>
			<!-- Bulk actions -->
			<div class="flex items-center justify-between text-xs text-base-content/60">
				<div class="flex items-center gap-2">
					<button
						type="button"
						class="hover:underline hover:text-primary transition-colors"
						onclick={selectAll}
					>
						Select all
					</button>
					<span class="opacity-50">|</span>
					<button
						type="button"
						class="hover:underline hover:text-primary transition-colors"
						onclick={deselectAll}
					>
						Clear
					</button>
				</div>
				{#if selectedCount > 0}
					<span class="text-success">
						{selectedCount} of {tasks.length} selected
					</span>
				{/if}
			</div>

			<!-- Task list -->
			<div class="space-y-1.5">
				{#each tasks as task, index (getTaskKey(task, index))}
					{@const taskKey = getTaskKey(task, index)}
					{@const isHuman = isHumanTask(task)}
					{@const isExpanded = expandedTaskKey === taskKey}
					{@const effectiveType = getEffectiveValue(task, 'type') || 'task'}
					{@const effectiveTitle = getEffectiveValue(task, 'title') || ''}
					{@const effectiveDescription = getEffectiveValue(task, 'description') || ''}
					{@const effectivePriority = getEffectiveValue(task, 'priority') ?? 2}
					{@const effectiveProject = getEffectiveValue(task, 'project') || defaultProject}
					{@const effectiveLabels = getEffectiveValue(task, 'labels') || ''}
					{@const effectiveDependsOn = getEffectiveValue(task, 'depends_on') || []}
					{@const priorityClass = getPriorityClass(effectivePriority)}
					{@const typeVisual = getIssueTypeVisual(effectiveType)}

					<div
						class="task-card rounded-md transition-all border {task.alreadyCreated
							? 'task-card-created'
							: task.selected
								? isHuman
									? 'task-card-human-selected'
									: 'task-card-agent-selected'
								: 'task-card-default'}"
					>
						<!-- Main task row -->
						<div
							class="flex items-start gap-2 p-2 {task.alreadyCreated ? '' : 'cursor-pointer'} group"
							onclick={() => !task.alreadyCreated && onToggleSelection(taskKey)}
							onkeydown={(e) => e.key === 'Enter' && !task.alreadyCreated && onToggleSelection(taskKey)}
							role="checkbox"
							aria-checked={task.alreadyCreated ? true : task.selected}
							tabindex="0"
						>
							<!-- Checkbox (or Created indicator) -->
							<div
								class="task-checkbox flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 transition-colors {task.alreadyCreated
									? 'checkbox-created'
									: task.selected
										? isHuman
											? 'checkbox-human-selected'
											: 'checkbox-agent-selected'
										: 'checkbox-default'}"
								title={task.alreadyCreated ? 'Already created in Beads' : ''}
							>
								{#if task.alreadyCreated || task.selected}
									<svg
										class="w-3 h-3 {task.alreadyCreated ? 'text-success' : 'text-base-100'}"
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
							</div>

							<!-- Human/Agent indicator -->
							<span
								class="flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold mt-0.5 text-base-100 {isHuman ? 'badge-human' : 'badge-agent'}"
								title={isHuman
									? 'Human task (requires manual action)'
									: 'Agent task (can be automated)'}
							>
								{isHuman ? '🧑' : '🤖'}
							</span>

							<!-- Task content -->
							<div class="flex-1 min-w-0">
								<!-- Type + Priority + Title row -->
								<div class="flex items-center gap-1.5 flex-wrap">
									<!-- Priority dropdown -->
									<select
										class="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold cursor-pointer appearance-none priority-select {priorityClass}"
										value={effectivePriority}
										onclick={(e) => e.stopPropagation()}
										onchange={(e) =>
											updatePriority(taskKey, parseInt(e.currentTarget.value), e)}
									>
										{#each PRIORITIES as p}
											<option value={p.value}>{p.label}</option>
										{/each}
									</select>

									<!-- Type dropdown -->
									<select
										class="text-[9px] px-1.5 py-0.5 rounded font-mono cursor-pointer appearance-none capitalize type-select bg-base-300 text-base-content border border-base-content/20"
										value={effectiveType}
										onclick={(e) => e.stopPropagation()}
										onchange={(e) => updateType(taskKey, e.currentTarget.value, e)}
									>
										{#each TASK_TYPES as t}
											<option value={t}>{t}</option>
										{/each}
									</select>

									<!-- Type icon -->
									<span class="text-sm opacity-70" title={typeVisual.label}>
										{typeVisual.icon}
									</span>

									<!-- Title (inline editable) -->
									{#if editingTitleKey === taskKey}
										<input
											type="text"
											bind:value={editingTitleValue}
											onblur={() => saveTitle(taskKey)}
											onkeydown={(e) => handleTitleKeydown(e, taskKey)}
											onclick={(e) => e.stopPropagation()}
											class="flex-1 min-w-0 text-xs px-1.5 py-0.5 rounded bg-base-300 text-base-content border border-info"
											autofocus
										/>
									{:else}
										<button
											type="button"
											onclick={(e) => e.stopPropagation()}
											ondblclick={(e) => startEditingTitle(taskKey, effectiveTitle, e)}
											class="flex-1 min-w-0 text-xs text-left font-medium truncate hover:underline text-base-content"
											title="Double-click to edit title"
										>
											{effectiveTitle}
										</button>
										<!-- Edit icon for title -->
										<button
											type="button"
											onclick={(e) => startEditingTitle(taskKey, effectiveTitle, e)}
											class="text-[10px] p-0.5 rounded opacity-40 hover:opacity-100 transition-opacity text-info"
											title="Edit title"
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
													d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
												/>
											</svg>
										</button>
									{/if}

									<!-- Already Created indicator with clickable task ID -->
									{#if task.alreadyCreated}
										{#if task.taskId && onTaskClick}
											<button
												type="button"
												onclick={(e) => { e.stopPropagation(); onTaskClick(task.taskId!); }}
												class="badge badge-xs badge-success font-mono gap-1 cursor-pointer hover:brightness-110 transition-all"
												title="Click to view task {task.taskId}"
											>
												<svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
													<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
												</svg>
												{task.taskId}
											</button>
										{:else}
											<span
												class="badge badge-xs badge-success font-mono gap-1"
												title="This task already exists in Beads"
											>
												<svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
													<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
												</svg>
												Created
											</span>
										{/if}
									{/if}

									<!-- Edited indicator with revert button -->
									{#if task.edited && !task.alreadyCreated}
										<span class="badge badge-xs badge-warning font-mono">
											edited
										</span>
										{#if onClearEdits}
											<button
												type="button"
												onclick={(e) => handleClearEdits(taskKey, e)}
												class="text-[10px] opacity-60 hover:opacity-100 transition-opacity"
												title="Revert changes"
											>
												↩
											</button>
										{/if}
									{/if}

									<!-- Expand toggle for description -->
									<button
										type="button"
										onclick={(e) => toggleExpand(taskKey, e)}
										class="text-[10px] p-0.5 rounded opacity-50 hover:opacity-100 transition-opacity"
										title={isExpanded ? 'Collapse description' : 'Expand description'}
									>
										<svg
											class="w-3.5 h-3.5 transition-transform {isExpanded
												? 'rotate-180'
												: ''}"
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
								</div>

								<!-- Description preview (when collapsed) - click to expand and edit -->
								{#if !isExpanded && effectiveDescription}
									<button
										type="button"
										onclick={(e) => toggleExpand(taskKey, e)}
										class="text-xs mt-0.5 line-clamp-2 text-left hover:underline cursor-pointer w-full text-base-content/60"
										title="Click to expand and edit description"
									>
										{effectiveDescription}
									</button>
								{/if}

								<!-- Reason (if provided) -->
								{#if task.reason && !isExpanded}
									<p class="text-xs mt-1 italic text-info/80">
										💡 {task.reason}
									</p>
								{/if}
							</div>
						</div>

						<!-- Expanded task editor (all fields) -->
						{#if isExpanded}
							<div
								class="px-2 pb-2 pt-1 ml-7 space-y-2"
								transition:slide={{ duration: 150 }}
								onclick={(e) => e.stopPropagation()}
							>
								<!-- Description -->
								<div>
									<label class="text-[9px] font-semibold opacity-60 block mb-0.5 text-base-content/60">
										Description
									</label>
									<textarea
										value={effectiveDescription}
										oninput={(e) => {
											const textarea = e.currentTarget;
											textarea.style.height = 'auto';
											textarea.style.height = textarea.scrollHeight + 'px';
											updateDescription(taskKey, textarea.value);
										}}
										use:autosize
										class="w-full text-[11px] p-2 rounded resize-none overflow-hidden bg-base-300 text-base-content border border-base-content/20 min-h-[50px]"
										placeholder="Task description..."
									></textarea>
								</div>

								<!-- Project and Labels row -->
								<div class="grid grid-cols-2 gap-2">
									<div>
										<label class="text-[9px] font-semibold opacity-60 block mb-0.5 text-base-content/60">
											Project
										</label>
										{#if availableProjects.length > 0}
											<select
												value={effectiveProject}
												onchange={(e) => updateProject(taskKey, e.currentTarget.value)}
												class="w-full text-[11px] px-2 py-1 rounded cursor-pointer project-select bg-base-300 text-base-content border border-base-content/20"
											>
												<option value="">Select project...</option>
												{#each availableProjects as project}
													<option value={project}>{project}</option>
												{/each}
											</select>
										{:else}
											<input
												type="text"
												value={effectiveProject}
												oninput={(e) => updateProject(taskKey, e.currentTarget.value)}
												class="w-full text-[11px] px-2 py-1 rounded bg-base-300 text-base-content border border-base-content/20"
												placeholder="e.g., jat, chimaro"
											/>
										{/if}
									</div>
									<div>
										<label class="text-[9px] font-semibold opacity-60 block mb-0.5 text-base-content/60">
											Labels
										</label>
										<input
											type="text"
											value={effectiveLabels}
											oninput={(e) => updateLabels(taskKey, e.currentTarget.value)}
											class="w-full text-[11px] px-2 py-1 rounded bg-base-300 text-base-content border border-base-content/20"
											placeholder="label1, label2, ..."
										/>
									</div>
								</div>

								<!-- Dependencies -->
								<div>
									<label class="text-[9px] font-semibold opacity-60 block mb-0.5 text-base-content/60">
										Depends On (task IDs)
									</label>
									<input
										type="text"
										value={effectiveDependsOn.join(', ')}
										oninput={(e) => updateDependsOn(taskKey, e.currentTarget.value)}
										class="w-full text-[11px] px-2 py-1 rounded bg-base-300 text-base-content border border-base-content/20"
										placeholder="jat-abc, jat-xyz, ..."
									/>
								</div>

								{#if task.reason}
									<p class="text-[9px] mt-1 opacity-60 text-info/80">
										💡 Reason: {task.reason}
									</p>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<!-- Create button (when tasks are selected) -->
			{#if selectedCount > 0 && onCreateTasks}
				<div class="pt-2 flex justify-end">
					<SlideOpenButton
						primaryLabel="Create {selectedCount} Task{selectedCount > 1 ? 's' : ''}"
						primaryLoadingLabel="Creating..."
						primaryIcon="M12 4.5v15m7.5-7.5h-15"
						primaryGradientFrom="oklch(0.55 0.18 145)"
						primaryGradientTo="oklch(0.45 0.15 145)"
						secondaryLabel="& Start"
						secondaryIcon="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
						secondaryTitle="Create tasks and spawn agent sessions"
						secondaryGradientFrom="oklch(0.50 0.15 200)"
						secondaryGradientTo="oklch(0.40 0.12 200)"
						borderColor="oklch(0.55 0.15 145)"
						disabled={isCreating}
						loading={isCreating}
						onprimary={handleCreateSelected}
						onsecondary={handleCreateAndStartSelected}
					/>
				</div>
			{/if}

			<!-- Feedback message after task creation -->
			{#if showFeedback && (createResults.success.length > 0 || createResults.failed.length > 0)}
				<div
					class="mt-2 p-2 rounded-lg text-xs {createResults.failed.length > 0 ? 'alert alert-error' : 'alert alert-success'}"
					transition:slide={{ duration: 200 }}
				>
					<!-- Success message -->
					{#if createResults.success.length > 0}
						<svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
						<span>Created {createResults.success.length} task{createResults.success.length > 1 ? 's' : ''}:</span>
						{#each createResults.success.filter(r => r.taskId) as result}
							{#if onTaskClick}
								<button
									type="button"
									onclick={() => onTaskClick(result.taskId!)}
									class="badge badge-sm badge-outline font-mono hover:badge-primary cursor-pointer transition-all"
									title="Click to view task details"
								>
									{result.taskId}
								</button>
							{:else}
								<span class="badge badge-sm badge-outline font-mono">{result.taskId}</span>
							{/if}
						{/each}
					{/if}

					<!-- Error message -->
					{#if createResults.failed.length > 0}
						<svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
						</svg>
						<div>
							<span>Failed to create {createResults.failed.length} task{createResults.failed.length > 1 ? 's' : ''}:</span>
							<ul class="list-disc list-inside mt-1 opacity-80 text-[10px]">
								{#each createResults.failed as failure}
									<li>
										<span class="font-medium">{failure.title}</span>
										{#if failure.error}
											<span class="opacity-60">- {failure.error}</span>
										{/if}
									</li>
								{/each}
							</ul>
						</div>
					{/if}

					<!-- Dismiss button -->
					{#if onDismissFeedback}
						<div class="flex justify-end mt-2">
							<button
								type="button"
								onclick={onDismissFeedback}
								class="text-[10px] px-2 py-0.5 rounded opacity-70 hover:opacity-100 transition-opacity bg-base-300 text-base-content"
							>
								Dismiss
							</button>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Hint -->
			<p class="text-[9px] mt-1 text-center opacity-40 text-base-content/50">
				Double-click or ✏️ to edit title • Click description to edit • Dropdowns for priority/type
			</p>
		</div>
	{/if}
</div>

<style>
	.suggested-tasks-section {
		/* Prevent text selection on rapid clicks */
		user-select: none;
	}

	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* Dropdown arrow styling */
	.priority-select,
	.type-select,
	.project-select {
		padding-right: 1rem;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%23888' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E");
		background-position: right 0.25rem center;
		background-repeat: no-repeat;
		background-size: 0.8rem;
	}

	.type-select {
		min-width: 60px;
	}

	.project-select {
		appearance: none;
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
		background: var(--color-success) / 0.4;
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
		background: var(--color-warning);
	}

	.badge-agent {
		background: var(--color-info);
	}

	/* Priority classes */
	.priority-p0 {
		background: var(--color-error) / 0.3;
		color: var(--color-error);
		border: none;
		min-width: 36px;
	}

	.priority-p1 {
		background: var(--color-warning) / 0.3;
		color: var(--color-warning);
		border: none;
		min-width: 36px;
	}

	.priority-p2 {
		background: var(--color-info) / 0.3;
		color: var(--color-info);
		border: none;
		min-width: 36px;
	}

	.priority-p3 {
		background: var(--color-base-content) / 0.2;
		color: var(--color-base-content) / 0.7;
		border: none;
		min-width: 36px;
	}

	.priority-p4 {
		background: var(--color-base-content) / 0.15;
		color: var(--color-base-content) / 0.5;
		border: none;
		min-width: 36px;
	}

	.priority-select {
		min-width: 36px;
	}
</style>
