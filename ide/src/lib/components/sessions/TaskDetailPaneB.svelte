<script lang="ts">
	/**
	 * TaskDetailPaneB Component - CONCEPT B: Notes as Separate Tab
	 *
	 * Based on TaskDetailPaneA but with Notes moved to its own tab.
	 * Tabs: [Details] [Notes] [Activity] [Deps]
	 *
	 * Key differences from TaskDetailPaneA:
	 * - Notes section is a separate tab (not inside Details)
	 * - Created/Updated metadata moved into Notes tab
	 * - Metadata bar at top only shows assignee + "Details" link
	 */

	import AgentAvatar from '$lib/components/AgentAvatar.svelte';
	import MonacoWrapper from '$lib/components/config/MonacoWrapper.svelte';
	import SlideOpenButton from '$lib/components/SlideOpenButton.svelte';

	// Types
	interface AgentTask {
		id: string;
		status: string;
		issue_type?: string;
		title?: string;
		priority?: number;
		description?: string;
		notes?: string;
	}

	interface TaskAttachment {
		id: string;
		path: string;
		filename: string;
		url: string;
	}

	interface TaskDependency {
		id: string;
		title: string;
		status: string;
		priority: number;
	}

	interface TimelineEvent {
		type: 'jat_event' | 'agent_mail' | 'signal';
		event?: string;
		timestamp: string;
		description?: string;
		metadata?: Record<string, any>;
		data?: Record<string, any>;
	}

	interface ExtendedTaskDetails {
		labels?: string[];
		assignee?: string;
		notes?: string;
		depends_on?: TaskDependency[];
		blocked_by?: TaskDependency[];
		created_at?: string;
		updated_at?: string;
		attachments: TaskAttachment[];
		timeline: TimelineEvent[];
		timelineCounts: { total: number; jat_events: number; agent_mail: number; signals?: number };
	}

	// Props
	let {
		task,
		details,
		loading = false,
		height = 300,
		onViewTask,
		onSaveDescription,
		onSaveNotes,
		onAddLabel,
		onRemoveLabel,
		onUploadAttachment,
		onRemoveAttachment
	}: {
		task: AgentTask;
		details: ExtendedTaskDetails | null;
		loading?: boolean;
		height?: number;
		onViewTask?: (taskId: string) => void;
		onSaveDescription?: (taskId: string, description: string) => Promise<void>;
		onSaveNotes?: (taskId: string, notes: string) => Promise<void>;
		onAddLabel?: (taskId: string, label: string) => Promise<void>;
		onRemoveLabel?: (taskId: string, label: string) => Promise<void>;
		onUploadAttachment?: (taskId: string, file: File) => Promise<void>;
		onRemoveAttachment?: (taskId: string, attachmentId: string) => Promise<void>;
	} = $props();

	// Status colors for badges
	const statusColors: Record<string, string> = {
		'open': 'badge-info',
		'in_progress': 'badge-warning',
		'closed': 'badge-success',
		'blocked': 'badge-error'
	};

	// Active tab - now includes 'notes' and 'summary' as separate tabs
	let activeTab = $state<'details' | 'notes' | 'activity' | 'deps' | 'summary'>('details');

	// Summary state
	interface TaskSummary {
		taskId: string;
		title: string;
		summary: string[];
		outcome: 'completed' | 'incomplete' | 'blocked';
		duration?: string;
		agent?: string;
		keyChanges: string[];
		quality?: {
			tests?: string;
			build?: string;
		};
		suggestedTasks?: Array<{
			type: string;
			title: string;
			description: string;
			priority: number;
		}>;
		humanActions?: Array<{
			title: string;
			description: string;
		}>;
		crossAgentIntel?: {
			files?: string[];
			patterns?: string[];
			gotchas?: string[];
		};
		riskLevel?: 'low' | 'medium' | 'high';
		breakingChanges?: string[];
		generatedAt: string;
	}

	let summaryData = $state<TaskSummary | null>(null);
	let summaryLoading = $state(false);
	let summaryError = $state<string | null>(null);
	let previousSummaryTaskId = $state<string | null>(null);

	// Suggested task creation state
	let creatingTaskIndex = $state<number | null>(null);
	let createdTaskIds = $state<Map<number, string>>(new Map());
	let taskCreationError = $state<string | null>(null);

	// Description editing state
	let descriptionEditing = $state(false);
	let descriptionValue = $state('');
	let descriptionSaving = $state(false);

	// Notes editing state
	let notesEditing = $state(false);
	let notesValue = $state('');
	let notesSaving = $state(false);
	let notesEditorRef: { focus: () => void } | undefined;

	// Attachment management state
	let isDragOver = $state(false);
	let attachmentUploading = $state(false);
	let fileInputRef: HTMLInputElement;
	let attachmentsExpanded = $state(true);

	// Label management state
	let showLabelInput = $state(false);
	let newLabelValue = $state('');
	let labelSaving = $state(false);

	// Initialize description value when task changes
	$effect(() => {
		if (task?.description !== undefined) {
			descriptionValue = task.description || '';
		}
	});

	// Initialize notes value when details change
	$effect(() => {
		if (details?.notes !== undefined) {
			notesValue = details.notes || '';
		}
	});

	// Track previous tab to save notes when leaving notes tab
	let previousTab = $state<'details' | 'notes' | 'activity' | 'deps' | 'summary'>('details');

	// Save notes when switching away from notes tab
	$effect(() => {
		const currentTab = activeTab;
		if (previousTab === 'notes' && currentTab !== 'notes') {
			// Left the notes tab - save if changed
			const currentNotes = details?.notes || '';
			if (notesValue !== currentNotes) {
				saveNotes();
			}
		}
		previousTab = currentTab;
	});

	async function saveDescription() {
		if (!task?.id || descriptionSaving) return;

		const currentDescription = task?.description || '';
		if (descriptionValue === currentDescription) {
			descriptionEditing = false;
			return;
		}

		descriptionSaving = true;
		try {
			if (onSaveDescription) {
				await onSaveDescription(task.id, descriptionValue);
			}
		} finally {
			descriptionSaving = false;
			descriptionEditing = false;
		}
	}

	async function saveNotes() {
		if (!task?.id || notesSaving) return;

		const currentNotes = details?.notes || '';
		if (notesValue === currentNotes) {
			return; // No changes to save
		}

		notesSaving = true;
		try {
			if (onSaveNotes) {
				await onSaveNotes(task.id, notesValue);
			}
		} finally {
			notesSaving = false;
		}
	}

	async function addLabel() {
		const label = newLabelValue.trim();
		if (!label || !task?.id || labelSaving) return;

		// Don't add if already exists
		if (details?.labels?.includes(label)) {
			newLabelValue = '';
			showLabelInput = false;
			return;
		}

		labelSaving = true;
		try {
			if (onAddLabel) {
				await onAddLabel(task.id, label);
			}
			newLabelValue = '';
			showLabelInput = false;
		} finally {
			labelSaving = false;
		}
	}

	async function removeLabel(label: string) {
		if (!task?.id || labelSaving) return;

		labelSaving = true;
		try {
			if (onRemoveLabel) {
				await onRemoveLabel(task.id, label);
			}
		} finally {
			labelSaving = false;
		}
	}

	// Svelte action to focus textarea on mount
	function autoResizeTextarea(node: HTMLTextAreaElement) {
		// Use requestAnimationFrame to ensure the DOM is ready
		requestAnimationFrame(() => {
			node.focus();
		});
	}

	function handleLabelKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			addLabel();
		} else if (e.key === 'Escape') {
			newLabelValue = '';
			showLabelInput = false;
		}
	}

	// Copy to clipboard
	let copiedField = $state<'description' | 'notes' | null>(null);
	async function copyToClipboard(text: string, field: 'description' | 'notes') {
		try {
			await navigator.clipboard.writeText(text);
			copiedField = field;
			setTimeout(() => copiedField = null, 1500);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	// Attachment handling
	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();

		// CRITICAL: Must set dropEffect for browser to allow the drop
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'copy';
		}
		isDragOver = true;
	}

	function handleDragEnter(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();

		// Only set to false if leaving the dropzone entirely
		// Check if we're leaving to a child element
		const relatedTarget = e.relatedTarget as HTMLElement | null;
		const dropzone = e.currentTarget as HTMLElement;
		if (!relatedTarget || !dropzone.contains(relatedTarget)) {
			isDragOver = false;
		}
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragOver = false;

		const files = e.dataTransfer?.files;
		if (!files || files.length === 0) return;

		for (const file of files) {
			await uploadFile(file);
		}
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = input.files;
		if (!files || files.length === 0) return;

		for (const file of files) {
			uploadFile(file);
		}
		// Reset input so same file can be selected again
		input.value = '';
	}

	async function uploadFile(file: File) {
		if (!task?.id || attachmentUploading) return;

		attachmentUploading = true;
		try {
			if (onUploadAttachment) {
				await onUploadAttachment(task.id, file);
			}
		} finally {
			attachmentUploading = false;
		}
	}

	async function removeAttachment(attachmentId: string) {
		if (!task?.id) return;

		try {
			if (onRemoveAttachment) {
				await onRemoveAttachment(task.id, attachmentId);
			}
		} catch (err) {
			console.error('Failed to remove attachment:', err);
		}
	}

	// Computed counts
	const depsCount = $derived((details?.depends_on?.length || 0) + (details?.blocked_by?.length || 0));
	const activityCount = $derived(details?.timelineCounts?.total || 0);

	// Fetch summary when switching to summary tab or when task changes
	async function fetchSummary(regenerate = false) {
		if (!task?.id) return;

		summaryLoading = true;
		summaryError = null;

		try {
			const url = `/api/tasks/${encodeURIComponent(task.id)}/summary${regenerate ? '?regenerate=true' : ''}`;
			const response = await fetch(url);
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || data.message || 'Failed to fetch summary');
			}

			summaryData = data.summary;
		} catch (err) {
			summaryError = err instanceof Error ? err.message : 'Failed to fetch summary';
			summaryData = null;
		} finally {
			summaryLoading = false;
		}
	}

	// Fetch summary automatically when tab is activated for closed tasks
	// (in_progress tasks require manual generation via button)
	$effect(() => {
		if (activeTab === 'summary' && task?.status === 'closed' && !summaryData && !summaryLoading) {
			fetchSummary();
		}
	});

	// Clear summary when task changes (only when task ID actually changes)
	$effect(() => {
		const currentTaskId = task?.id;
		if (currentTaskId && currentTaskId !== previousSummaryTaskId) {
			summaryData = null;
			summaryError = null;
			previousSummaryTaskId = currentTaskId;
			// Reset creation state when task changes
			createdTaskIds = new Map();
			taskCreationError = null;
		}
	});

	// Extract project from task ID (e.g., "jat-abc" -> "jat")
	function getProjectFromTaskId(taskId: string): string {
		const match = taskId.match(/^([a-z0-9_-]+)-[a-z0-9]+$/i);
		return match ? match[1].toLowerCase() : 'jat';
	}

	// Create a suggested task in JAT
	async function createSuggestedTask(index: number, andStart = false) {
		if (!summaryData?.suggestedTasks?.[index]) return;

		const suggestedTask = summaryData.suggestedTasks[index];
		const project = getProjectFromTaskId(task.id);

		creatingTaskIndex = index;
		taskCreationError = null;

		try {
			// Create the task via API
			const response = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: suggestedTask.title,
					type: suggestedTask.type || 'task',
					priority: suggestedTask.priority ?? 2,
					description: suggestedTask.description || '',
					project
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Failed to create task');
			}

			const data = await response.json();
			const newTaskId = data.task?.id;

			if (newTaskId) {
				// Track that this task was created
				createdTaskIds.set(index, newTaskId);
				createdTaskIds = new Map(createdTaskIds); // trigger reactivity

				// If "Add & Start", spawn an agent for the task
				if (andStart) {
					const spawnResponse = await fetch('/api/work/spawn', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							taskId: newTaskId,
							project
						})
					});

					if (!spawnResponse.ok) {
						const spawnError = await spawnResponse.json();
						console.error('Failed to spawn agent:', spawnError);
						// Task was created, but spawn failed - still show as created
					}
				}
			}
		} catch (err) {
			taskCreationError = err instanceof Error ? err.message : 'Failed to create task';
			console.error('Task creation error:', err);
		} finally {
			creatingTaskIndex = null;
		}
	}
</script>

<div class="task-detail-panel" style="height: {height}px;">
	<div class="task-panel-content">
		<!-- Loading state -->
		{#if loading}
			<div class="task-panel-loading">
				<span class="loading loading-spinner loading-sm"></span>
				<span>Loading task details...</span>
			</div>
		{:else}
			<!-- Tabs - now includes Notes as separate tab -->
			<div class="pane-tabs">
				<button
					class="pane-tab"
					class:active={activeTab === 'details'}
					onclick={() => activeTab = 'details'}
				>
					Details
				</button>
				<button
					class="pane-tab"
					class:active={activeTab === 'notes'}
					onclick={() => activeTab = 'notes'}
				>
					Notes
				</button>
				<button
					class="pane-tab"
					class:active={activeTab === 'activity'}
					onclick={() => activeTab = 'activity'}
				>
					Activity
					{#if activityCount > 0}
						<span class="tab-count">{activityCount}</span>
					{/if}
				</button>
				<button
					class="pane-tab"
					class:active={activeTab === 'deps'}
					onclick={() => activeTab = 'deps'}
				>
					Deps
					{#if depsCount > 0}
						<span class="tab-count">{depsCount}</span>
					{/if}
				</button>
				{#if task?.status === 'closed' || task?.status === 'in_progress'}
					<button
						class="pane-tab"
						class:active={activeTab === 'summary'}
						onclick={() => activeTab = 'summary'}
					>
						Summary
						{#if summaryData}
							<span class="tab-count tab-count-success">✓</span>
						{/if}
					</button>
				{/if}
			</div>

			<!-- Tab content -->
			<div class="tab-content">
				{#if activeTab === 'details'}
					<!-- Details tab: Assignee/Link, Metadata, Description, Attachments, Labels -->
					<div class="details-layout">
						<!-- Top row: Assignee + Details link + Created/Updated -->
						<div class="details-header-row">
							{#if details?.assignee}
								<span class="details-assignee">
									<AgentAvatar name={details.assignee} size={16} showRing={true} />
									<span class="assignee-name">{details.assignee}</span>
								</span>
							{/if}
							<div class="details-header-meta">
								{#if details?.created_at}
									<span class="header-meta-item">
										<span class="header-meta-label">Created</span>
										<span class="header-meta-value">{new Date(details.created_at).toLocaleDateString()}</span>
									</span>
								{/if}
								{#if details?.updated_at}
									<span class="header-meta-item">
										<span class="header-meta-label">Updated</span>
										<span class="header-meta-value">{new Date(details.updated_at).toLocaleDateString()}</span>
									</span>
								{/if}
							</div>
							<button class="details-link-btn" onclick={() => onViewTask?.(task.id)}>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
								</svg>
								Details
							</button>
						</div>

						<!-- Description section -->
						<div class="task-panel-section description-section">
							<div class="section-header">
								<span class="task-panel-label">Description</span>
								{#if !descriptionEditing && task.description}
									<div class="header-actions">
										<button
											class="copy-btn"
											onclick={() => copyToClipboard(task.description || '', 'description')}
											title="Copy description"
										>
											{#if copiedField === 'description'}
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
													<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
												</svg>
											{:else}
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
													<path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
												</svg>
											{/if}
										</button>
										<button class="edit-btn" onclick={() => descriptionEditing = true} title="Edit description">
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
												<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
											</svg>
										</button>
									</div>
								{/if}
							</div>
							{#if descriptionEditing}
								<textarea
									class="task-panel-description-input"
									bind:value={descriptionValue}
									onblur={saveDescription}
									use:autoResizeTextarea
									placeholder="Add description..."
									disabled={descriptionSaving}
								></textarea>
								{#if descriptionSaving}
									<span class="task-panel-saving">Saving...</span>
								{/if}
							{:else}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="task-panel-description-display" class:draggable-field={task.description}
									onclick={() => descriptionEditing = true}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											descriptionEditing = true;
										}
									}}
									role="button"
									tabindex="0"
									draggable={task.description ? "true" : "false"}
									ondragstart={(e) => {
										if (task.description) {
											e.dataTransfer?.setData('text/plain', task.description);
											e.dataTransfer?.setData('application/x-jat-text', JSON.stringify({
												type: 'description',
												taskId: task.id,
												content: task.description
											}));
											if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
										}
									}}
									title={task.description ? "Click to edit, drag to SessionCard to paste" : "Click to add description"}
								>
									{#if task.description}
										<span class="drag-handle" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></span>{task.description}
									{:else}
										<span class="text-base-content/40 italic">Click to add description...</span>
									{/if}
								</div>
							{/if}
						</div>

						<!-- Labels section (after description) -->
						<div class="task-panel-section labels-section-inline">
							<span class="task-panel-label">Labels</span>
							<div class="task-panel-labels">
								{#if details?.labels && details.labels.length > 0}
									{#each details.labels as label}
										<span class="label-badge">
											{label}
											<button
												class="label-remove-btn"
												onclick={() => removeLabel(label)}
												title="Remove label"
												disabled={labelSaving}
											>
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-2.5 h-2.5">
													<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
												</svg>
											</button>
										</span>
									{/each}
								{/if}
								{#if showLabelInput}
									<div class="label-input-wrapper">
										<input
											type="text"
											class="label-input"
											placeholder="New label..."
											bind:value={newLabelValue}
											onkeydown={handleLabelKeydown}
											onblur={() => { if (!newLabelValue.trim()) showLabelInput = false; }}
											disabled={labelSaving}
										/>
										{#if newLabelValue.trim()}
											<button
												class="label-add-confirm"
												onclick={addLabel}
												disabled={labelSaving}
												title="Add"
											>
												{#if labelSaving}
													<span class="loading loading-spinner loading-xs"></span>
												{:else}
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
														<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
													</svg>
												{/if}
											</button>
										{/if}
									</div>
								{:else}
									<!-- Add button inline after labels -->
									<button
										class="add-label-btn-inline"
										onclick={() => showLabelInput = true}
										title="Add label"
									>
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
											<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
										</svg>
									</button>
								{/if}
								{#if (!details?.labels || details.labels.length === 0) && !showLabelInput}
									<span class="no-labels-hint">No labels</span>
								{/if}
							</div>
						</div>

						<!-- Attachments section with drop zone (fills remaining space) -->
						<div class="task-panel-section attachments-section-flex">
							<span class="task-panel-label">
								Attachments
								{#if details?.attachments && details.attachments.length > 0}
									<span class="badge badge-xs ml-1">{details.attachments.length}</span>
								{/if}
							</span>
							<div
								class="attachments-dropzone"
								class:drag-over={isDragOver}
								class:has-attachments={details?.attachments && details.attachments.length > 0}
								ondrop={handleDrop}
								ondragover={handleDragOver}
								ondragenter={handleDragEnter}
								ondragleave={handleDragLeave}
								role="button"
								tabindex="0"
								onclick={() => fileInputRef?.click()}
								onkeydown={(e) => e.key === 'Enter' && fileInputRef?.click()}
							>
								<input
									type="file"
									bind:this={fileInputRef}
									onchange={handleFileSelect}
									accept="image/*"
									multiple
									class="hidden"
								/>

								{#if details?.attachments && details.attachments.length > 0}
									<!-- Show thumbnails when attachments exist -->
									<div class="attachments-thumbnails">
										{#each details.attachments as attachment}
											<div class="attachment-thumbnail-wrapper">
												<div
													class="attachment-thumbnail draggable-field"
													title={`${attachment.filename} (click to open, drag to SessionCard to attach)`}
													role="button"
													tabindex="0"
													onclick={(e) => {
														e.stopPropagation();
														window.open(attachment.url, '_blank');
													}}
													onkeydown={(e) => {
														if (e.key === 'Enter' || e.key === ' ') {
															e.preventDefault();
															window.open(attachment.url, '_blank');
														}
													}}
													draggable="true"
													ondragstart={(e) => {
														e.stopPropagation();
														console.log('[TaskDetailPaneB] DragStart on thumbnail', attachment.path);
														e.dataTransfer?.setData('text/plain', attachment.path);
														e.dataTransfer?.setData('application/x-jat-image', JSON.stringify({
															path: attachment.path,
															filename: attachment.filename,
															url: attachment.url
														}));
														if (e.dataTransfer) {
															e.dataTransfer.effectAllowed = 'copy';
														}
													}}
												>
													<img
														src={attachment.url}
														alt={attachment.filename}
														class="attachment-thumbnail-img"
														draggable="false"
													/>
													<span class="drag-handle" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></span>
												</div>
												<button
													class="attachment-remove-btn"
													onclick={(e) => { e.stopPropagation(); removeAttachment(attachment.id); }}
													title="Remove attachment"
												>
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
														<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
													</svg>
												</button>
											</div>
										{/each}
										<!-- Add more button within thumbnails -->
										<button
											class="attachment-add-btn"
											onclick={(e) => { e.stopPropagation(); fileInputRef?.click(); }}
											title="Add attachment"
										>
											{#if attachmentUploading}
												<span class="loading loading-spinner loading-xs"></span>
											{:else}
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
													<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
												</svg>
											{/if}
										</button>
									</div>
								{:else}
									<!-- Empty drop zone state -->
									<div class="dropzone-empty pointer-events-none">
										{#if attachmentUploading}
											<span class="loading loading-spinner loading-sm"></span>
											<span class="dropzone-text">Uploading...</span>
										{:else if isDragOver}
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 dropzone-icon">
												<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
											</svg>
											<span class="dropzone-text">Drop files here</span>
										{:else}
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 dropzone-icon">
												<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
											</svg>
											<span class="dropzone-text">Drop images or click to upload</span>
										{/if}
									</div>
								{/if}
							</div>
						</div>
					</div>

				{:else if activeTab === 'notes'}
					<!-- Notes tab: Always-edit Monaco editor (Sublime-style) -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="notes-editor-container" onmouseenter={() => notesEditorRef?.focus()}>
						{#if notesSaving}
							<div class="notes-saving-indicator">
								<span class="loading loading-spinner loading-xs"></span>
								<span>Saving...</span>
							</div>
						{/if}
						<MonacoWrapper
							bind:this={notesEditorRef}
							bind:value={notesValue}
							language="markdown"
							disableSuggestions={true}
						/>
					</div>

				{:else if activeTab === 'activity'}
					<!-- Activity Timeline -->
					{#if details?.timeline && details.timeline.length > 0}
						<div class="task-panel-timeline">
							{#each details.timeline as event}
								<div class="timeline-event" class:task-event={event.type === 'jat_event'} class:message-event={event.type === 'agent_mail'} class:signal-event={event.type === 'signal'}>
									<div class="timeline-event-header">
										<span class="timeline-event-type">
											{#if event.type === 'jat_event'}
												{event.event}
											{:else if event.type === 'signal'}
												{event.data?.state || 'signal'}
											{:else}
												{event.event}
											{/if}
										</span>
										<span class="timeline-event-time">
											{new Date(event.timestamp).toLocaleString()}
										</span>
									</div>
									{#if event.type === 'signal'}
										<p class="timeline-event-desc">
											{#if event.data?.state === 'starting'}
												Agent {event.data?.agentName || ''} started working
											{:else if event.data?.state === 'working'}
												Working on: {event.data?.taskTitle || event.data?.taskId || ''}
											{:else if event.data?.state === 'review'}
												Ready for review
											{:else if event.data?.state === 'needs_input'}
												{event.data?.question || 'Waiting for input'}
											{:else if event.data?.state === 'completing'}
												Completing task
											{:else if event.data?.state === 'completed'}
												Task completed
											{:else}
												State: {event.data?.state || 'unknown'}
											{/if}
										</p>
									{:else}
										<p class="timeline-event-desc">{event.description}</p>
									{/if}
								</div>
							{/each}
						</div>
					{:else}
						<div class="empty-tab">No activity yet</div>
					{/if}

				{:else if activeTab === 'deps'}
					<!-- Dependencies -->
					{#if depsCount > 0}
						<div class="task-panel-dependencies">
							{#if details?.depends_on && details.depends_on.length > 0}
								<div class="dep-group">
									<span class="dep-label">Depends on:</span>
									{#each details.depends_on as dep}
										<button class="dep-item" onclick={() => onViewTask?.(dep.id)}>
											<span class="dep-id">{dep.id}</span>
											<span class="badge badge-xs {statusColors[dep.status] || 'badge-ghost'}">{dep.status}</span>
										</button>
									{/each}
								</div>
							{/if}
							{#if details?.blocked_by && details.blocked_by.length > 0}
								<div class="dep-group">
									<span class="dep-label">Blocks:</span>
									{#each details.blocked_by as dep}
										<button class="dep-item" onclick={() => onViewTask?.(dep.id)}>
											<span class="dep-id">{dep.id}</span>
											<span class="badge badge-xs {statusColors[dep.status] || 'badge-ghost'}">{dep.status}</span>
										</button>
									{/each}
								</div>
							{/if}
						</div>
					{:else}
						<div class="empty-tab">No dependencies</div>
					{/if}

				{:else if activeTab === 'summary'}
					<!-- Task Completion Summary - Rich Visual Report -->
					<div class="summary-container">
						{#if summaryLoading}
							<div class="summary-loading">
								<span class="loading loading-spinner loading-sm"></span>
								<span>Generating summary...</span>
							</div>
						{:else if summaryError}
							<div class="summary-error">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
								</svg>
								<span>{summaryError}</span>
								<button class="btn btn-xs btn-ghost" onclick={() => fetchSummary(true)}>Retry</button>
							</div>
						{:else if summaryData}
							<!-- Header Card with Task ID, Outcome, Agent -->
							<div class="report-header-card" class:completed={summaryData.outcome === 'completed'} class:incomplete={summaryData.outcome === 'incomplete'} class:blocked={summaryData.outcome === 'blocked'}>
								<div class="report-header-top">
									<span class="report-task-id">{summaryData.taskId}</span>
									<div class="report-outcome-badge" class:completed={summaryData.outcome === 'completed'} class:incomplete={summaryData.outcome === 'incomplete'} class:blocked={summaryData.outcome === 'blocked'}>
										{#if summaryData.outcome === 'completed'}
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
											</svg>
										{:else if summaryData.outcome === 'blocked'}
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
											</svg>
										{:else}
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
											</svg>
										{/if}
										<span>{summaryData.outcome.toUpperCase()}</span>
									</div>
									<button class="summary-refresh-btn" onclick={() => fetchSummary(true)} title="Regenerate summary">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5">
											<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
										</svg>
									</button>
								</div>
								<div class="report-header-meta">
									{#if summaryData.agent}
										<span class="report-agent">
											<AgentAvatar name={summaryData.agent} size={16} showRing={true} />
											<span>{summaryData.agent}</span>
										</span>
									{/if}
									{#if summaryData.duration}
										<span class="report-duration">
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
											</svg>
											{summaryData.duration}
										</span>
									{/if}
									{#if summaryData.riskLevel}
										<span class="report-risk" class:low={summaryData.riskLevel === 'low'} class:medium={summaryData.riskLevel === 'medium'} class:high={summaryData.riskLevel === 'high'}>
											{#if summaryData.riskLevel === 'high'}
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
													<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
												</svg>
											{/if}
											{summaryData.riskLevel.toUpperCase()} RISK
										</span>
									{/if}
								</div>
							</div>

							<!-- What Was Accomplished -->
							{#if summaryData.summary && summaryData.summary.length > 0}
								<div class="report-card">
									<div class="report-card-header">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
										</svg>
										<span>What Was Accomplished</span>
									</div>
									<ul class="report-bullets">
										{#each summaryData.summary as bullet}
											<li>{bullet}</li>
										{/each}
									</ul>
								</div>
							{/if}

							<!-- Files Changed / Key Changes -->
							{#if summaryData.keyChanges && summaryData.keyChanges.length > 0}
								<div class="report-card">
									<div class="report-card-header">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
										</svg>
										<span>Files Changed</span>
										<span class="report-count">{summaryData.keyChanges.length}</span>
									</div>
									<div class="report-files">
										{#each summaryData.keyChanges as file}
											<span class="file-badge">{file}</span>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Quality Status -->
							{#if summaryData.quality}
								<div class="report-card">
									<div class="report-card-header">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
										</svg>
										<span>Quality Status</span>
									</div>
									<div class="report-quality">
										{#if summaryData.quality.tests}
											<div class="quality-item" class:passing={summaryData.quality.tests === 'passing'} class:failing={summaryData.quality.tests === 'failing'} class:none={summaryData.quality.tests === 'none'}>
												<span class="quality-icon">
													{#if summaryData.quality.tests === 'passing'}
														<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
															<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
														</svg>
													{:else if summaryData.quality.tests === 'failing'}
														<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
															<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
														</svg>
													{:else}
														<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
															<path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14" />
														</svg>
													{/if}
												</span>
												<span class="quality-label">Tests</span>
												<span class="quality-value">{summaryData.quality.tests}</span>
											</div>
										{/if}
										{#if summaryData.quality.build}
											<div class="quality-item" class:clean={summaryData.quality.build === 'clean'} class:warnings={summaryData.quality.build === 'warnings'} class:errors={summaryData.quality.build === 'errors'}>
												<span class="quality-icon">
													{#if summaryData.quality.build === 'clean'}
														<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
															<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
														</svg>
													{:else if summaryData.quality.build === 'errors'}
														<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
															<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
														</svg>
													{:else}
														<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
															<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
														</svg>
													{/if}
												</span>
												<span class="quality-label">Build</span>
												<span class="quality-value">{summaryData.quality.build}</span>
											</div>
										{/if}
									</div>
								</div>
							{/if}

							<!-- Breaking Changes -->
							{#if summaryData.breakingChanges && summaryData.breakingChanges.length > 0}
								<div class="report-card report-card-warning">
									<div class="report-card-header report-card-header-warning">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
										</svg>
										<span>Breaking Changes</span>
									</div>
									<ul class="report-bullets report-bullets-warning">
										{#each summaryData.breakingChanges as change}
											<li>{change}</li>
										{/each}
									</ul>
								</div>
							{/if}

							<!-- Human Actions Needed -->
							{#if summaryData.humanActions && summaryData.humanActions.length > 0}
								<div class="report-card report-card-action">
									<div class="report-card-header report-card-header-action">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
										</svg>
										<span>Human Actions Required</span>
									</div>
									<div class="report-actions">
										{#each summaryData.humanActions as action}
											<div class="action-card">
												<span class="action-card-title">{action.title}</span>
												<span class="action-card-desc">{action.description}</span>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Cross-Agent Intel -->
							{#if summaryData.crossAgentIntel && (summaryData.crossAgentIntel.patterns?.length || summaryData.crossAgentIntel.gotchas?.length)}
								<div class="report-card report-card-intel">
									<div class="report-card-header report-card-header-intel">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
										</svg>
										<span>Cross-Agent Intel</span>
									</div>
									<div class="intel-content">
										{#if summaryData.crossAgentIntel.patterns && summaryData.crossAgentIntel.patterns.length > 0}
											<div class="intel-section">
												<span class="intel-label">Patterns</span>
												<ul class="intel-list">
													{#each summaryData.crossAgentIntel.patterns as pattern}
														<li>{pattern}</li>
													{/each}
												</ul>
											</div>
										{/if}
										{#if summaryData.crossAgentIntel.gotchas && summaryData.crossAgentIntel.gotchas.length > 0}
											<div class="intel-section">
												<span class="intel-label">Gotchas</span>
												<ul class="intel-list intel-list-warning">
													{#each summaryData.crossAgentIntel.gotchas as gotcha}
														<li>{gotcha}</li>
													{/each}
												</ul>
											</div>
										{/if}
									</div>
								</div>
							{/if}

							<!-- Suggested Tasks -->
							{#if summaryData.suggestedTasks && summaryData.suggestedTasks.length > 0}
								<div class="report-card">
									<div class="report-card-header">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
										</svg>
										<span>Follow-up Tasks</span>
										<span class="report-count">{summaryData.suggestedTasks.length}</span>
									</div>
									<div class="report-tasks">
										{#each summaryData.suggestedTasks as suggestedTask, index}
											{@const isCreating = creatingTaskIndex === index}
											{@const createdId = createdTaskIds.get(index)}
											<div class="task-card" class:task-card-created={!!createdId}>
												<div class="task-card-header">
													<div class="task-card-badges">
														<span class="task-type-badge">{suggestedTask.type}</span>
														<span class="task-priority-badge">P{suggestedTask.priority}</span>
													</div>
													{#if createdId}
														<!-- Task was created - show the ID -->
														<span class="task-created-badge" title="Task created">
															<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
																<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
															</svg>
															{createdId}
														</span>
													{:else}
														<!-- Action buttons -->
														<div class="task-card-actions">
															<SlideOpenButton
																primaryLabel="Add"
																primaryLoadingLabel="Adding..."
																secondaryLabel="& Start"
																loading={isCreating}
																disabled={isCreating}
																onprimary={() => createSuggestedTask(index, false)}
																onsecondary={() => createSuggestedTask(index, true)}
															/>
														</div>
													{/if}
												</div>
												<span class="task-card-title">{suggestedTask.title}</span>
												{#if suggestedTask.description}
													<span class="task-card-desc">{suggestedTask.description}</span>
												{/if}
											</div>
										{/each}
										{#if taskCreationError}
											<div class="task-creation-error">
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
													<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
												</svg>
												{taskCreationError}
											</div>
										{/if}
									</div>
								</div>
							{/if}

							<!-- Generated Footer -->
							<div class="report-footer">
								<span class="report-generated">
									Generated {new Date(summaryData.generatedAt).toLocaleString()}
								</span>
							</div>
						{:else}
							<div class="empty-tab">
								<button class="btn btn-sm btn-ghost" onclick={() => fetchSummary()}>
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
										<path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
									</svg>
									Generate Summary
								</button>
							</div>
						{/if}
					</div>
				{/if}
			</div>

		{/if}
	</div>
</div>

<style>
	.task-detail-panel {
		background: oklch(0.14 0.01 250);
		border-top: 1px solid oklch(0.22 0.02 250);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.task-panel-content {
		padding: 0.75rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		height: 100%;
		overflow: hidden;
		min-width: 0; /* Allow content to shrink below child content size */
	}

	.task-panel-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 2rem;
		color: oklch(0.60 0.02 250);
		font-size: 0.8rem;
	}

	/* Metadata bar */
	.task-panel-metadata-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid oklch(0.22 0.02 250);
		font-size: 0.7rem;
		color: oklch(0.60 0.02 250);
	}

	.meta-item {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}

	.meta-label-inline {
		color: oklch(0.50 0.02 250);
	}

	/* Tabs */
	.pane-tabs {
		display: flex;
		gap: 0.25rem;
		padding: 0.25rem 0;
		border-bottom: 1px solid oklch(0.20 0.02 250);
	}

	.pane-tab {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 500;
		border: none;
		background: transparent;
		color: oklch(0.55 0.02 250);
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.15s;
	}

	.pane-tab:hover {
		background: oklch(0.18 0.02 250);
		color: oklch(0.70 0.02 250);
	}

	.pane-tab.active {
		background: oklch(0.22 0.04 200);
		color: oklch(0.90 0.02 250);
	}

	.tab-count {
		font-size: 0.65rem;
		padding: 0.125rem 0.375rem;
		background: oklch(0.25 0.02 250);
		border-radius: 10px;
		color: oklch(0.65 0.02 250);
	}

	.pane-tab.active .tab-count {
		background: oklch(0.30 0.04 200);
		color: oklch(0.85 0.02 250);
	}

	/* Tab content */
	.tab-content {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden; /* Prevent horizontal overflow */
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding-top: 0.5rem;
		min-width: 0; /* Allow content to shrink */
	}

	/* Details tab layout - Description at top, Attachments fills middle, Labels at bottom */
	.details-layout {
		display: flex;
		flex-direction: column;
		height: 100%;
		gap: 0.75rem;
		min-width: 0; /* Allow layout to shrink below content size */
		overflow: hidden; /* Prevent overflow */
	}

	.description-section {
		flex: 1; /* Take remaining space */
		min-width: 0; /* Allow section to shrink below content size */
		min-height: 80px; /* Minimum height for description */
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* Notes layout for Notes tab */
	.notes-layout {
		display: flex;
		flex-direction: column;
		height: 100%;
		gap: 0.75rem;
		min-width: 0;
		overflow: hidden;
	}

	/* Details tab header row (assignee + created/updated + link) */
	.details-header-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.375rem 0.5rem;
		background: oklch(0.14 0.01 250);
		border-radius: 0.375rem;
		border: 1px solid oklch(0.20 0.02 250);
		margin-bottom: 0.5rem;
	}

	.details-assignee {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8rem;
		color: oklch(0.75 0.02 250);
	}

	.assignee-name {
		font-weight: 500;
	}

	.details-header-meta {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-left: auto;
	}

	.header-meta-item {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.7rem;
	}

	.header-meta-label {
		color: oklch(0.50 0.02 250);
	}

	.header-meta-value {
		color: oklch(0.65 0.02 250);
	}

	.details-link-btn {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		font-size: 0.7rem;
		color: oklch(0.65 0.10 220);
		background: transparent;
		border: 1px solid oklch(0.30 0.05 220);
		border-radius: 0.25rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.details-link-btn:hover {
		background: oklch(0.25 0.05 220);
		border-color: oklch(0.40 0.08 220);
		color: oklch(0.80 0.12 220);
	}

	/* Notes tab - Monaco editor container */
	.notes-editor-container {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		position: relative;
		border-radius: 0.375rem;
		overflow: hidden;
		border: 1px solid oklch(0.25 0.02 250);
	}

	.notes-saving-indicator {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem;
		background: oklch(0.20 0.02 250 / 0.9);
		border-radius: 0.25rem;
		font-size: 0.7rem;
		color: oklch(0.70 0.02 250);
	}


	.notes-section {
		flex: 1;
		min-height: 0;
		min-width: 0; /* Allow section to shrink below content size */
		display: flex;
		flex-direction: column;
		overflow: hidden; /* Prevent content overflow */
	}

	.labels-section-inline {
		flex-shrink: 0;
	}

	/* Attachments section - fixed height for 1-2 rows of thumbnails */
	.attachments-section-flex {
		flex-shrink: 0;
		min-height: 100px;
		max-height: 180px; /* Enough for ~2 rows of thumbnails */
		min-width: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.empty-tab {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		color: oklch(0.45 0.02 250);
		font-size: 0.8rem;
		font-style: italic;
	}

	/* Sections */
	.task-panel-section {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.task-panel-label {
		font-size: 0.65rem;
		font-weight: 600;
		color: oklch(0.55 0.02 250);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.edit-btn {
		padding: 0.25rem;
		background: transparent;
		border: none;
		color: oklch(0.55 0.02 250);
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.15s;
	}

	.edit-btn:hover {
		background: oklch(0.22 0.02 250);
		color: oklch(0.75 0.02 250);
	}

	.copy-btn {
		padding: 0.25rem;
		background: transparent;
		border: none;
		color: oklch(0.55 0.02 250);
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.15s;
	}

	.copy-btn:hover {
		background: oklch(0.22 0.02 250);
		color: oklch(0.75 0.02 250);
	}

	.task-panel-description {
		font-size: 0.8rem;
		color: oklch(0.70 0.02 250);
		margin: 0;
		line-height: 1.5;
		white-space: pre-wrap;
	}

	.task-panel-description-input {
		width: 100%;
		font-size: 0.8rem;
		color: oklch(0.85 0.02 250);
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.375rem;
		padding: 0.5rem 0.625rem;
		line-height: 1.5;
		resize: none;
		font-family: inherit;
		transition: border-color 0.15s, box-shadow 0.15s;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.task-panel-description-input:focus {
		outline: none;
		border-color: oklch(0.60 0.15 200);
		box-shadow: 0 0 0 2px oklch(0.60 0.15 200 / 0.2);
	}

	.task-panel-description-display {
		display: block;
		width: 100%;
		font-size: 0.8rem;
		color: oklch(0.70 0.02 250);
		background: oklch(0.14 0.01 250);
		border: 1px dashed oklch(0.25 0.02 250);
		border-radius: 0.375rem;
		padding: 0.5rem 0.625rem;
		text-align: left;
		line-height: 1.5;
		cursor: pointer;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		white-space: pre-wrap;
		word-break: break-word; /* Prevent long words from causing overflow */
		transition: border-color 0.15s, background-color 0.15s;
	}

	.task-panel-description-display:hover {
		border-color: oklch(0.35 0.02 250);
		background: oklch(0.16 0.01 250);
	}

	.task-panel-saving {
		font-size: 0.7rem;
		color: oklch(0.55 0.02 250);
		font-style: italic;
	}

	/* Notes */
	.task-panel-notes-input {
		width: 100%;
		font-size: 0.8rem;
		color: oklch(0.85 0.02 250);
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.375rem;
		padding: 0.5rem 0.625rem;
		line-height: 1.5;
		resize: none;
		min-height: 6rem;
		font-family: inherit;
		transition: border-color 0.15s, box-shadow 0.15s;
		word-break: break-word; /* Prevent long words from causing overflow */
	}

	.task-panel-notes-input:focus {
		outline: none;
		border-color: oklch(0.60 0.15 200);
		box-shadow: 0 0 0 2px oklch(0.60 0.15 200 / 0.2);
	}

	.task-panel-notes-display {
		display: flex;
		align-items: flex-start;
		width: 100%;
		font-size: 0.8rem;
		color: oklch(0.70 0.02 250);
		background: oklch(0.14 0.01 250);
		border: 1px dashed oklch(0.25 0.02 250);
		border-radius: 0.375rem;
		padding: 0.5rem 0.625rem;
		text-align: left;
		line-height: 1.5;
		cursor: pointer;
		min-height: 6rem;
		white-space: pre-wrap;
		word-break: break-word; /* Prevent long words from causing overflow */
		overflow: hidden; /* Hide any overflow */
		transition: border-color 0.15s, background-color 0.15s;
	}

	.task-panel-notes-display:hover {
		border-color: oklch(0.35 0.02 250);
		background: oklch(0.16 0.01 250);
	}

	/* Notes fill available space */
	.notes-fill {
		flex: 1;
		min-height: 4rem;
	}

	.task-panel-notes-saving {
		font-size: 0.7rem;
		color: oklch(0.55 0.02 250);
		font-style: italic;
	}

	/* Add label button - inline with labels */
	.add-label-btn-inline {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.125rem 0.375rem;
		background: transparent;
		border: 1px dashed oklch(0.30 0.02 250);
		color: oklch(0.45 0.02 250);
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.15s;
		height: 1.5rem;
	}

	.add-label-btn-inline:hover {
		background: oklch(0.20 0.02 250);
		border-color: oklch(0.45 0.02 250);
		color: oklch(0.70 0.02 250);
	}

	/* Labels */
	.task-panel-labels {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		align-items: center;
	}

	/* Label badge with remove button */
	.label-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.125rem 0.5rem;
		font-size: 0.75rem;
		background: oklch(0.20 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 4px;
		color: oklch(0.75 0.02 250);
		transition: all 0.15s;
	}

	.label-badge:hover {
		border-color: oklch(0.40 0.02 250);
	}

	.label-remove-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.125rem;
		background: transparent;
		border: none;
		color: oklch(0.45 0.02 250);
		cursor: pointer;
		border-radius: 2px;
		opacity: 0;
		transition: all 0.15s;
		margin-left: 0.125rem;
		margin-right: -0.25rem;
	}

	.label-badge:hover .label-remove-btn {
		opacity: 1;
	}

	.label-remove-btn:hover {
		background: oklch(0.55 0.15 30 / 0.3);
		color: oklch(0.70 0.15 30);
	}

	.label-remove-btn:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	/* Label input */
	.label-input-wrapper {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}

	.label-input {
		width: 100px;
		padding: 0.125rem 0.375rem;
		font-size: 0.75rem;
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.35 0.02 250);
		border-radius: 4px;
		color: oklch(0.85 0.02 250);
		outline: none;
		transition: border-color 0.15s;
	}

	.label-input:focus {
		border-color: oklch(0.55 0.15 200);
	}

	.label-input::placeholder {
		color: oklch(0.45 0.02 250);
	}

	.label-add-confirm {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.25rem;
		background: oklch(0.55 0.15 145 / 0.2);
		border: none;
		color: oklch(0.70 0.15 145);
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.15s;
	}

	.label-add-confirm:hover {
		background: oklch(0.55 0.15 145 / 0.3);
	}

	.label-add-confirm:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.no-labels-hint {
		font-size: 0.75rem;
		color: oklch(0.45 0.02 250);
		font-style: italic;
	}

	/* Attachments Drop Zone */
	.attachments-dropzone {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 60px;
		min-width: 80px; /* Ensure minimum width for at least one thumbnail + padding */
		padding: 0.5rem;
		border: 2px dashed oklch(0.30 0.02 250);
		border-radius: 0.5rem;
		background: oklch(0.14 0.01 250);
		cursor: pointer;
		transition: all 0.2s;
		overflow: hidden; /* Prevent overflow */
	}

	.attachments-dropzone:hover {
		border-color: oklch(0.40 0.02 250);
		background: oklch(0.16 0.01 250);
	}

	.attachments-dropzone.drag-over {
		border-color: oklch(0.60 0.15 200);
		background: oklch(0.60 0.15 200 / 0.1);
		border-style: solid;
	}

	.attachments-dropzone.has-attachments {
		min-height: auto;
		cursor: default;
	}

	.dropzone-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		padding: 0.5rem;
		color: oklch(0.50 0.02 250);
		flex: 1;
	}

	.dropzone-icon {
		color: oklch(0.45 0.02 250);
	}

	.drag-over .dropzone-icon {
		color: oklch(0.60 0.15 200);
	}

	.dropzone-text {
		font-size: 0.75rem;
		color: oklch(0.50 0.02 250);
	}

	.drag-over .dropzone-text {
		color: oklch(0.70 0.15 200);
	}

	/* Attachments Thumbnails */
	.attachments-thumbnails {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		max-width: 100%; /* Prevent horizontal overflow */
		overflow: hidden;
	}

	.attachment-thumbnail-wrapper {
		position: relative;
		animation: attachment-pop-in 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
	}

	@keyframes attachment-pop-in {
		0% {
			opacity: 0;
			transform: scale(0.5);
		}
		100% {
			opacity: 1;
			transform: scale(1);
		}
	}

	.attachment-thumbnail {
		display: block;
		width: 56px;
		height: 56px;
		border-radius: 6px;
		overflow: hidden;
		border: 1px solid oklch(0.28 0.02 250);
		transition: all 0.15s;
		cursor: pointer;
	}

	.attachment-thumbnail:hover {
		border-color: oklch(0.45 0.02 250);
		transform: scale(1.02);
	}

	.attachment-thumbnail-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.attachment-remove-btn {
		position: absolute;
		top: -6px;
		right: -6px;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		background: oklch(0.55 0.15 30);
		border: none;
		color: oklch(0.95 0.02 250);
		cursor: pointer;
		border-radius: 50%;
		opacity: 0;
		transition: all 0.15s;
	}

	.attachment-thumbnail-wrapper:hover .attachment-remove-btn {
		opacity: 1;
	}

	.attachment-remove-btn:hover {
		background: oklch(0.60 0.18 30);
		transform: scale(1.1);
	}

	/* Drag handle for draggable fields */
	.drag-handle {
		position: absolute;
		top: 4px;
		right: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2px;
		background: oklch(0.25 0.02 250 / 0.9);
		border-radius: 3px;
		color: oklch(0.50 0.02 250);
		opacity: 0;
		transition: all 0.15s;
		pointer-events: none;
	}

	.draggable-field {
		position: relative;
		cursor: grab;
	}

	.draggable-field:hover .drag-handle {
		opacity: 1;
		color: oklch(0.70 0.12 200);
	}

	.draggable-field:active {
		cursor: grabbing;
	}

	/* Thumbnail-specific drag handle positioning */
	.attachment-thumbnail .drag-handle {
		top: 2px;
		right: 2px;
		padding: 1px;
		background: oklch(0.15 0.02 250 / 0.85);
	}

	.attachment-add-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		border: 2px dashed oklch(0.30 0.02 250);
		border-radius: 6px;
		background: transparent;
		color: oklch(0.45 0.02 250);
		cursor: pointer;
		transition: all 0.15s;
	}

	.attachment-add-btn:hover {
		border-color: oklch(0.45 0.02 250);
		color: oklch(0.65 0.02 250);
		background: oklch(0.18 0.01 250);
	}

	/* Dependencies */
	.task-panel-dependencies {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.dep-group {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.375rem;
	}

	.dep-label {
		font-size: 0.7rem;
		color: oklch(0.55 0.02 250);
		width: 100%;
		margin-bottom: 0.25rem;
	}

	.dep-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem;
		background: oklch(0.20 0.02 250);
		border-radius: 4px;
		border: none;
		cursor: pointer;
		transition: all 0.15s;
	}

	.dep-item:hover {
		background: oklch(0.25 0.04 200);
	}

	.dep-id {
		font-size: 0.75rem;
		font-family: ui-monospace, monospace;
		color: oklch(0.70 0.12 200);
	}

	/* Timeline */
	.task-panel-timeline {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.timeline-event {
		padding: 0.5rem;
		background: oklch(0.16 0.01 250);
		border-radius: 6px;
		border-left: 3px solid oklch(0.30 0.02 250);
	}

	.timeline-event.task-event {
		border-left-color: oklch(0.60 0.15 200);
	}

	.timeline-event.message-event {
		border-left-color: oklch(0.60 0.15 145);
	}

	.timeline-event.signal-event {
		border-left-color: oklch(0.65 0.18 85);
	}

	.timeline-event-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.25rem;
	}

	.timeline-event-type {
		font-size: 0.7rem;
		font-weight: 600;
		color: oklch(0.75 0.02 250);
		text-transform: capitalize;
	}

	.timeline-event-time {
		font-size: 0.65rem;
		color: oklch(0.50 0.02 250);
	}

	.timeline-event-desc {
		font-size: 0.75rem;
		color: oklch(0.65 0.02 250);
		margin: 0;
		line-height: 1.4;
	}

	/* Compact link in metadata bar */
	.task-panel-link-compact {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		margin-left: auto;
		font-size: 0.7rem;
		color: oklch(0.60 0.15 200);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: color 0.15s;
	}

	.task-panel-link-compact:hover {
		color: oklch(0.75 0.18 200);
	}

	/* Summary tab count badge - success variant */
	.tab-count-success {
		background: oklch(0.55 0.15 145 / 0.3);
		color: oklch(0.75 0.15 145);
	}

	/* Summary tab styles */
	.summary-container {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		height: 100%;
		overflow-y: auto;
	}

	.summary-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 2rem;
		color: oklch(0.60 0.02 250);
		font-size: 0.8rem;
	}

	.summary-error {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 1.5rem;
		color: oklch(0.70 0.15 30);
		font-size: 0.8rem;
		background: oklch(0.55 0.15 30 / 0.1);
		border-radius: 0.375rem;
	}

	.summary-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem;
		background: oklch(0.16 0.01 250);
		border-radius: 0.375rem;
		border: 1px solid oklch(0.22 0.02 250);
	}

	/* Report Header Card */
	.report-header-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem;
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.22 0.02 250);
		border-radius: 8px;
		margin-bottom: 0.75rem;
	}

	.report-header-card.completed {
		background: linear-gradient(135deg, oklch(0.55 0.15 145 / 0.1), oklch(0.16 0.01 250));
		border-color: oklch(0.55 0.15 145 / 0.4);
	}

	.report-header-card.incomplete {
		background: linear-gradient(135deg, oklch(0.65 0.12 85 / 0.1), oklch(0.16 0.01 250));
		border-color: oklch(0.65 0.15 85 / 0.4);
	}

	.report-header-card.blocked {
		background: linear-gradient(135deg, oklch(0.55 0.15 30 / 0.1), oklch(0.16 0.01 250));
		border-color: oklch(0.55 0.15 30 / 0.4);
	}

	.report-header-top {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.report-task-id {
		font-family: ui-monospace, monospace;
		font-size: 0.8rem;
		font-weight: 600;
		color: oklch(0.80 0.02 250);
	}

	.report-outcome-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.02em;
	}

	.report-outcome-badge.completed {
		background: oklch(0.55 0.15 145 / 0.25);
		color: oklch(0.75 0.15 145);
	}

	.report-outcome-badge.incomplete {
		background: oklch(0.65 0.15 85 / 0.25);
		color: oklch(0.78 0.15 85);
	}

	.report-outcome-badge.blocked {
		background: oklch(0.55 0.15 30 / 0.25);
		color: oklch(0.72 0.15 30);
	}

	.summary-refresh-btn {
		margin-left: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.25rem;
		background: transparent;
		border: none;
		color: oklch(0.50 0.02 250);
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.15s;
	}

	.summary-refresh-btn:hover {
		background: oklch(0.22 0.02 250);
		color: oklch(0.70 0.02 250);
	}

	.report-header-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.75rem;
	}

	.report-agent {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		color: oklch(0.72 0.02 250);
	}

	.report-duration {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		color: oklch(0.60 0.02 250);
	}

	.report-risk {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.report-risk.low {
		background: oklch(0.55 0.15 145 / 0.15);
		color: oklch(0.70 0.15 145);
	}

	.report-risk.medium {
		background: oklch(0.65 0.15 85 / 0.15);
		color: oklch(0.75 0.15 85);
	}

	.report-risk.high {
		background: oklch(0.55 0.15 30 / 0.2);
		color: oklch(0.72 0.15 30);
	}

	/* Report Cards */
	.report-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.625rem;
		background: oklch(0.15 0.01 250);
		border: 1px solid oklch(0.20 0.02 250);
		border-radius: 6px;
		margin-bottom: 0.5rem;
	}

	.report-card-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.7rem;
		font-weight: 600;
		color: oklch(0.60 0.02 250);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.report-card-header svg {
		color: oklch(0.55 0.12 200);
	}

	.report-count {
		margin-left: auto;
		padding: 0 0.375rem;
		background: oklch(0.20 0.02 250);
		border-radius: 10px;
		font-size: 0.65rem;
		color: oklch(0.65 0.02 250);
	}

	/* Bullets list */
	.report-bullets {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.8rem;
		color: oklch(0.78 0.02 250);
		line-height: 1.6;
	}

	.report-bullets li {
		margin-bottom: 0.25rem;
	}

	.report-bullets li::marker {
		color: oklch(0.55 0.12 145);
	}

	.report-bullets-warning li::marker {
		color: oklch(0.70 0.15 30);
	}

	/* Files list */
	.report-files {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.file-badge {
		display: inline-flex;
		padding: 0.125rem 0.5rem;
		font-size: 0.7rem;
		font-family: ui-monospace, monospace;
		background: oklch(0.18 0.04 200);
		color: oklch(0.72 0.12 200);
		border-radius: 4px;
		border: 1px solid oklch(0.25 0.04 200);
	}

	/* Quality Status */
	.report-quality {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.quality-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.625rem;
		background: oklch(0.18 0.02 250);
		border-radius: 6px;
		border: 1px solid oklch(0.22 0.02 250);
	}

	.quality-item.passing,
	.quality-item.clean {
		background: oklch(0.55 0.15 145 / 0.12);
		border-color: oklch(0.55 0.15 145 / 0.3);
	}

	.quality-item.passing .quality-icon,
	.quality-item.clean .quality-icon {
		color: oklch(0.70 0.15 145);
	}

	.quality-item.failing,
	.quality-item.errors {
		background: oklch(0.55 0.15 30 / 0.12);
		border-color: oklch(0.55 0.15 30 / 0.3);
	}

	.quality-item.failing .quality-icon,
	.quality-item.errors .quality-icon {
		color: oklch(0.70 0.15 30);
	}

	.quality-item.warnings {
		background: oklch(0.65 0.15 85 / 0.12);
		border-color: oklch(0.65 0.15 85 / 0.3);
	}

	.quality-item.warnings .quality-icon {
		color: oklch(0.75 0.15 85);
	}

	.quality-item.none .quality-icon {
		color: oklch(0.50 0.02 250);
	}

	.quality-icon {
		display: flex;
		align-items: center;
		color: oklch(0.55 0.02 250);
	}

	.quality-label {
		font-size: 0.7rem;
		font-weight: 500;
		color: oklch(0.65 0.02 250);
	}

	.quality-value {
		font-size: 0.7rem;
		font-weight: 600;
		color: oklch(0.80 0.02 250);
		text-transform: capitalize;
	}

	/* Warning card variant */
	.report-card-warning {
		background: oklch(0.55 0.15 30 / 0.08);
		border-color: oklch(0.55 0.15 30 / 0.3);
	}

	.report-card-header-warning {
		color: oklch(0.72 0.15 30);
	}

	.report-card-header-warning svg {
		color: oklch(0.70 0.15 30);
	}

	/* Action card variant */
	.report-card-action {
		background: oklch(0.65 0.15 85 / 0.08);
		border-color: oklch(0.65 0.15 85 / 0.3);
	}

	.report-card-header-action {
		color: oklch(0.78 0.15 85);
	}

	.report-card-header-action svg {
		color: oklch(0.75 0.15 85);
	}

	.report-actions {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.action-card {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		padding: 0.5rem 0.625rem;
		background: oklch(0.65 0.15 85 / 0.1);
		border-left: 3px solid oklch(0.70 0.15 85);
		border-radius: 0 4px 4px 0;
	}

	.action-card-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: oklch(0.82 0.02 250);
	}

	.action-card-desc {
		font-size: 0.75rem;
		color: oklch(0.65 0.02 250);
		line-height: 1.4;
	}

	/* Intel card variant */
	.report-card-intel {
		background: oklch(0.55 0.12 280 / 0.08);
		border-color: oklch(0.55 0.12 280 / 0.3);
	}

	.report-card-header-intel {
		color: oklch(0.72 0.12 280);
	}

	.report-card-header-intel svg {
		color: oklch(0.68 0.15 280);
	}

	.intel-content {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.intel-section {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.intel-label {
		font-size: 0.65rem;
		font-weight: 600;
		color: oklch(0.60 0.08 280);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.intel-list {
		margin: 0;
		padding-left: 1.125rem;
		font-size: 0.75rem;
		color: oklch(0.75 0.02 250);
		line-height: 1.5;
	}

	.intel-list li {
		margin-bottom: 0.125rem;
	}

	.intel-list li::marker {
		color: oklch(0.55 0.12 280);
	}

	.intel-list-warning li::marker {
		color: oklch(0.70 0.15 85);
	}

	/* Suggested Tasks */
	.report-tasks {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.task-card {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.5rem 0.625rem;
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.22 0.02 250);
		border-radius: 6px;
	}

	.task-card-badges {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.task-type-badge {
		padding: 0.0625rem 0.375rem;
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		background: oklch(0.20 0.02 250);
		color: oklch(0.65 0.02 250);
		border-radius: 3px;
	}

	.task-priority-badge {
		padding: 0.0625rem 0.25rem;
		font-size: 0.6rem;
		font-weight: 700;
		background: oklch(0.55 0.15 200 / 0.15);
		color: oklch(0.72 0.15 200);
		border-radius: 3px;
	}

	.task-card-title {
		font-size: 0.8rem;
		font-weight: 500;
		color: oklch(0.82 0.02 250);
	}

	.task-card-desc {
		font-size: 0.72rem;
		color: oklch(0.60 0.02 250);
		line-height: 1.4;
	}

	.task-card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.task-card-actions {
		flex-shrink: 0;
	}

	.task-card-created {
		border-color: oklch(0.45 0.12 145 / 0.4);
		background: oklch(0.18 0.02 145 / 0.3);
	}

	.task-created-badge {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.125rem 0.375rem;
		font-size: 0.65rem;
		font-weight: 600;
		font-family: ui-monospace, monospace;
		background: oklch(0.45 0.12 145 / 0.2);
		color: oklch(0.72 0.15 145);
		border-radius: 4px;
	}

	.task-created-badge svg {
		color: oklch(0.65 0.18 145);
	}

	.task-creation-error {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.625rem;
		font-size: 0.72rem;
		color: oklch(0.72 0.15 30);
		background: oklch(0.22 0.04 30 / 0.3);
		border: 1px solid oklch(0.45 0.12 30 / 0.4);
		border-radius: 6px;
	}

	.task-creation-error svg {
		flex-shrink: 0;
		color: oklch(0.65 0.18 30);
	}

	/* Report Footer */
	.report-footer {
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid oklch(0.20 0.02 250);
	}

	.report-generated {
		font-size: 0.65rem;
		color: oklch(0.45 0.02 250);
		font-style: italic;
	}
</style>
