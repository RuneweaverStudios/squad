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
	import type { SuggestedTask } from '$lib/utils/markerParser';

	/** Extended SuggestedTask with local UI state */
	interface SuggestedTaskWithState extends SuggestedTask {
		selected: boolean;
		edited: boolean;
		edits?: {
			type?: string;
			title?: string;
			description?: string;
			priority?: number;
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
	}

	let {
		tasks,
		selectedCount,
		onToggleSelection,
		getTaskKey,
		onCreateTasks,
		onEditTask,
		onClearEdits,
		isCreating = false,
		createResults = { success: [], failed: [] },
		showFeedback = false,
		onDismissFeedback,
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

	// Priority options with colors
	const PRIORITIES = [
		{ value: 0, label: 'P0', color: 'oklch(0.65 0.25 25)', textColor: 'oklch(0.15 0.02 250)' },
		{ value: 1, label: 'P1', color: 'oklch(0.70 0.20 50)', textColor: 'oklch(0.15 0.02 250)' },
		{ value: 2, label: 'P2', color: 'oklch(0.75 0.15 85)', textColor: 'oklch(0.15 0.02 250)' },
		{ value: 3, label: 'P3', color: 'oklch(0.70 0.08 250)', textColor: 'oklch(0.95 0.02 250)' },
		{ value: 4, label: 'P4', color: 'oklch(0.65 0.05 250)', textColor: 'oklch(0.95 0.02 250)' },
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

	// Clear edits for a task
	function handleClearEdits(taskKey: string, event: MouseEvent) {
		event.stopPropagation();
		if (onClearEdits) {
			onClearEdits(taskKey);
		}
	}

	// Get priority color
	function getPriorityColor(priority: number): { bg: string; text: string } {
		const p = PRIORITIES.find((p) => p.value === priority) || PRIORITIES[2];
		return { bg: p.color, text: p.textColor };
	}

	// Truncate description to a sensible length
	function truncateDescription(desc: string, maxLen = 100): string {
		if (!desc || desc.length <= maxLen) return desc || '';
		return desc.slice(0, maxLen).trimEnd() + '…';
	}
</script>

<div
	class="suggested-tasks-section rounded-lg overflow-hidden"
	style="
		background: linear-gradient(135deg, oklch(0.24 0.04 280) 0%, oklch(0.20 0.03 280) 100%);
		border: 1px solid oklch(0.40 0.08 280 / 0.5);
	"
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
				class="w-4 h-4"
				style="color: oklch(0.80 0.15 280);"
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
			<span class="font-semibold text-sm" style="color: oklch(0.90 0.10 280);">
				Suggested Tasks
			</span>
			<!-- Count badge -->
			<span
				class="badge badge-sm font-mono"
				style="background: oklch(0.35 0.12 280); color: oklch(0.95 0.05 280); border: none;"
			>
				{tasks.length}
			</span>
			{#if selectedCount > 0 && isCollapsed}
				<span
					class="badge badge-sm font-mono"
					style="background: oklch(0.50 0.18 145); color: oklch(0.98 0 0); border: none;"
				>
					{selectedCount} selected
				</span>
			{/if}
		</div>

		<!-- Collapse/Expand chevron -->
		<svg
			class="w-4 h-4 transition-transform duration-200"
			class:rotate-180={!isCollapsed}
			style="color: oklch(0.70 0.05 280);"
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
			<div
				class="flex items-center justify-between text-xs"
				style="color: oklch(0.70 0.03 280);"
			>
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
					<span style="color: oklch(0.75 0.15 145);">
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
					{@const priorityColors = getPriorityColor(effectivePriority)}
					{@const typeVisual = getIssueTypeVisual(effectiveType)}

					<div
						class="rounded-md transition-all"
						style="
							background: {task.selected
							? isHuman
								? 'oklch(0.28 0.08 50 / 0.4)'
								: 'oklch(0.30 0.08 220 / 0.35)'
							: 'oklch(0.20 0.02 280 / 0.5)'};
							border: 1px solid {task.selected
							? isHuman
								? 'oklch(0.55 0.15 50 / 0.6)'
								: 'oklch(0.50 0.15 220 / 0.5)'
							: 'oklch(0.35 0.03 280 / 0.3)'};
						"
					>
						<!-- Main task row -->
						<div
							class="flex items-start gap-2 p-2 cursor-pointer group"
							onclick={() => onToggleSelection(taskKey)}
							onkeydown={(e) => e.key === 'Enter' && onToggleSelection(taskKey)}
							role="checkbox"
							aria-checked={task.selected}
							tabindex="0"
						>
							<!-- Checkbox -->
							<div
								class="flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 transition-colors"
								style="
									background: {task.selected
									? isHuman
										? 'oklch(0.55 0.18 50)'
										: 'oklch(0.55 0.18 220)'
									: 'transparent'};
									border-color: {task.selected
									? isHuman
										? 'oklch(0.55 0.18 50)'
										: 'oklch(0.55 0.18 220)'
									: 'oklch(0.50 0.05 280)'};
								"
							>
								{#if task.selected}
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
							</div>

							<!-- Human/Agent indicator -->
							<span
								class="flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold mt-0.5"
								style="background: {isHuman
									? 'oklch(0.45 0.18 50)'
									: 'oklch(0.45 0.15 220)'}; color: oklch(0.98 0.02 250);"
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
										class="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold cursor-pointer appearance-none priority-select"
										style="background: {priorityColors.bg}; color: {priorityColors.text}; border: none; min-width: 36px;"
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
										class="text-[9px] px-1.5 py-0.5 rounded font-mono cursor-pointer appearance-none capitalize type-select"
										style="background: oklch(0.35 0.04 250); color: oklch(0.85 0.02 250); border: 1px solid oklch(0.45 0.02 250);"
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
											class="flex-1 min-w-0 text-xs px-1.5 py-0.5 rounded"
											style="background: oklch(0.35 0.02 250); color: oklch(0.95 0.02 250); border: 1px solid oklch(0.55 0.15 220);"
											autofocus
										/>
									{:else}
										<button
											type="button"
											ondblclick={(e) => startEditingTitle(taskKey, effectiveTitle, e)}
											class="flex-1 min-w-0 text-xs text-left font-medium truncate hover:underline"
											style="color: oklch(0.92 0.03 280);"
											title="Double-click to edit title"
										>
											{effectiveTitle}
										</button>
										<!-- Edit icon for title -->
										<button
											type="button"
											onclick={(e) => startEditingTitle(taskKey, effectiveTitle, e)}
											class="text-[10px] p-0.5 rounded opacity-40 hover:opacity-100 transition-opacity"
											style="color: oklch(0.70 0.08 220);"
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

									<!-- Edited indicator with revert button -->
									{#if task.edited}
										<span
											class="badge badge-xs font-mono"
											style="background: oklch(0.50 0.15 45); color: oklch(0.95 0.05 45); border: none;"
										>
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

								<!-- Description preview (when collapsed) -->
								{#if !isExpanded && effectiveDescription}
									<p
										class="text-xs mt-0.5 line-clamp-2"
										style="color: oklch(0.70 0.03 280);"
										title={effectiveDescription}
									>
										{truncateDescription(effectiveDescription)}
									</p>
								{/if}

								<!-- Reason (if provided) -->
								{#if task.reason && !isExpanded}
									<p class="text-xs mt-1 italic" style="color: oklch(0.65 0.08 200);">
										💡 {task.reason}
									</p>
								{/if}
							</div>
						</div>

						<!-- Expanded description editor -->
						{#if isExpanded}
							<div
								class="px-2 pb-2 pt-0 ml-7"
								transition:slide={{ duration: 150 }}
								onclick={(e) => e.stopPropagation()}
							>
								<textarea
									value={effectiveDescription}
									oninput={(e) => updateDescription(taskKey, e.currentTarget.value)}
									class="w-full text-[11px] p-2 rounded resize-none"
									style="background: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250); border: 1px solid oklch(0.40 0.02 250); min-height: 60px;"
									placeholder="Task description..."
								></textarea>
								{#if task.reason}
									<p
										class="text-[9px] mt-1.5 opacity-60"
										style="color: oklch(0.65 0.02 250);"
									>
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
					<button
						type="button"
						class="btn btn-sm gap-2"
						style="
							background: linear-gradient(135deg, oklch(0.50 0.18 145) 0%, oklch(0.45 0.15 160) 100%);
							color: oklch(0.98 0 0);
							border: none;
							box-shadow: 0 2px 8px oklch(0.50 0.18 145 / 0.3);
						"
						onclick={handleCreateSelected}
						disabled={isCreating}
					>
						{#if isCreating}
							<svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
								<circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								></circle>
								<path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								></path>
							</svg>
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
							Create {selectedCount} Task{selectedCount > 1 ? 's' : ''}
						{/if}
					</button>
				</div>
			{/if}

			<!-- Feedback message after task creation -->
			{#if showFeedback && (createResults.success.length > 0 || createResults.failed.length > 0)}
				<div
					class="mt-2 p-2 rounded-lg text-xs"
					style="
						background: {createResults.failed.length > 0
							? 'oklch(0.30 0.10 25 / 0.3)'
							: 'oklch(0.30 0.12 145 / 0.3)'};
						border: 1px solid {createResults.failed.length > 0
							? 'oklch(0.50 0.15 25 / 0.5)'
							: 'oklch(0.50 0.15 145 / 0.5)'};
					"
					transition:slide={{ duration: 200 }}
				>
					<!-- Success message -->
					{#if createResults.success.length > 0}
						<div class="flex items-center gap-2" style="color: oklch(0.75 0.15 145);">
							<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
							</svg>
							<span>
								Created {createResults.success.length} task{createResults.success.length > 1 ? 's' : ''}
								{#if createResults.success.some(r => r.taskId)}
									<span class="opacity-70">
										({createResults.success.filter(r => r.taskId).map(r => r.taskId).join(', ')})
									</span>
								{/if}
							</span>
						</div>
					{/if}

					<!-- Error message -->
					{#if createResults.failed.length > 0}
						<div class="flex items-start gap-2 mt-1" style="color: oklch(0.75 0.15 25);">
							<svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
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
						</div>
					{/if}

					<!-- Dismiss button -->
					{#if onDismissFeedback}
						<div class="flex justify-end mt-2">
							<button
								type="button"
								onclick={onDismissFeedback}
								class="text-[10px] px-2 py-0.5 rounded opacity-70 hover:opacity-100 transition-opacity"
								style="background: oklch(0.35 0.02 250); color: oklch(0.85 0.02 250);"
							>
								Dismiss
							</button>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Hint -->
			<p class="text-[9px] mt-1 text-center opacity-40" style="color: oklch(0.60 0.02 280);">
				Double-click or ✏️ to edit title • Dropdowns to change priority/type • Expand for description
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
	.type-select {
		padding-right: 1rem;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%23888' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E");
		background-position: right 0.1rem center;
		background-repeat: no-repeat;
		background-size: 0.8rem;
	}

	.type-select {
		min-width: 60px;
	}
</style>
