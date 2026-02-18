<script lang="ts">
	/**
	 * TaskDetailPaneA Component - CONCEPT A: Tabbed Sections
	 *
	 * Reduces vertical scroll by grouping content into tabs:
	 * [Details] [Activity] [Deps]
	 */

	import AgentAvatar from '$lib/components/AgentAvatar.svelte';

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
		type: 'squad_event' | 'agent_mail' | 'signal';
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
		timelineCounts: { total: number; squad_events: number; agent_mail: number; signals?: number };
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

	// Active tab
	let activeTab = $state<'details' | 'activity' | 'deps'>('details');

	// Description editing state
	let descriptionEditing = $state(false);
	let descriptionValue = $state('');
	let descriptionSaving = $state(false);

	// Notes editing state
	let notesEditing = $state(false);
	let notesValue = $state('');
	let notesSaving = $state(false);

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
			notesEditing = false;
			return;
		}

		notesSaving = true;
		try {
			if (onSaveNotes) {
				await onSaveNotes(task.id, notesValue);
			}
		} finally {
			notesSaving = false;
			notesEditing = false;
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
			<!-- Metadata bar at top -->
			<div class="task-panel-metadata-bar">
				{#if details?.assignee}
					<span class="meta-item">
						<AgentAvatar name={details.assignee} size={14} />
						{details.assignee}
					</span>
				{/if}
				{#if details?.created_at}
					<span class="meta-item">
						<span class="meta-label-inline">Created</span>
						{new Date(details.created_at).toLocaleDateString()}
					</span>
				{/if}
				{#if details?.updated_at}
					<span class="meta-item">
						<span class="meta-label-inline">Updated</span>
						{new Date(details.updated_at).toLocaleDateString()}
					</span>
				{/if}
				<!-- View full details link - aligned right -->
				<button class="task-panel-link-compact" onclick={() => onViewTask?.(task.id)}>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
					</svg>
					Details
				</button>
			</div>

			<!-- Tabs -->
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
			</div>

			<!-- Tab content -->
			<div class="tab-content">
				{#if activeTab === 'details'}
					<!-- Details tab: Description at top, Notes fills middle, Labels pinned at bottom -->
					<div class="details-layout">
						<!-- Top section: Description -->
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
									placeholder="Add description..."
									disabled={descriptionSaving}
								></textarea>
								{#if descriptionSaving}
									<span class="task-panel-saving">Saving...</span>
								{/if}
							{:else}
								<button
									type="button"
									class="task-panel-description-display" class:draggable-field={task.description}
									onclick={() => descriptionEditing = true}
									draggable={task.description ? "true" : "false"}
									ondragstart={(e) => {
										if (task.description) {
											e.dataTransfer?.setData('text/plain', task.description);
											e.dataTransfer?.setData('application/x-squad-text', JSON.stringify({
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
								</button>
							{/if}
						</div>

						<!-- Middle section: Notes (flex-grow to fill space) -->
						<div class="task-panel-section notes-section">
							<div class="section-header">
								<span class="task-panel-label">Notes</span>
								{#if !notesEditing && details?.notes}
									<div class="header-actions">
										<button
											class="copy-btn"
											onclick={() => copyToClipboard(details?.notes || '', 'notes')}
											title="Copy notes"
										>
											{#if copiedField === 'notes'}
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
													<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
												</svg>
											{:else}
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
													<path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
												</svg>
											{/if}
										</button>
										<button class="edit-btn" onclick={() => notesEditing = true} title="Edit notes">
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
												<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
											</svg>
										</button>
									</div>
								{/if}
							</div>
							{#if notesEditing}
								<textarea
									class="task-panel-notes-input notes-fill"
									bind:value={notesValue}
									onblur={saveNotes}
									placeholder="Add notes..."
									disabled={notesSaving}
								></textarea>
								{#if notesSaving}
									<span class="task-panel-notes-saving">Saving...</span>
								{/if}
							{:else}
								<button
									type="button"
									class="task-panel-notes-display notes-fill" class:draggable-field={details?.notes}
									onclick={() => notesEditing = true}
									draggable={details?.notes ? "true" : "false"}
									ondragstart={(e) => {
										if (details?.notes) {
											e.dataTransfer?.setData('text/plain', details.notes);
											e.dataTransfer?.setData('application/x-squad-text', JSON.stringify({
												type: 'notes',
												taskId: task.id,
												content: details.notes
											}));
											if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
										}
									}}
									title={details?.notes ? "Click to edit, drag to SessionCard to paste" : "Click to add notes..."}
								>
									{#if details?.notes}
										<span class="drag-handle" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></span>{details.notes}
									{:else}
										<span class="text-base-content/40 italic">Click to add notes...</span>
									{/if}
								</button>
							{/if}
						</div>

						<!-- Attachments section with drop zone -->
						<div class="task-panel-section attachments-section">
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
														console.log('[TaskDetailPaneA] DragStart on thumbnail', attachment.path);
														e.dataTransfer?.setData('text/plain', attachment.path);
														e.dataTransfer?.setData('application/x-squad-image', JSON.stringify({
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

						<!-- Bottom section: Labels (pinned to bottom) -->
						<div class="task-panel-section labels-section">
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
					</div>

				{:else if activeTab === 'activity'}
					<!-- Activity Timeline -->
					{#if details?.timeline && details.timeline.length > 0}
						<div class="task-panel-timeline">
							{#each details.timeline as event}
								<div class="timeline-event" class:task-event={event.type === 'squad_event'} class:message-event={event.type === 'agent_mail'} class:signal-event={event.type === 'signal'}>
									<div class="timeline-event-header">
										<span class="timeline-event-type">
											{#if event.type === 'squad_event'}
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

	/* Details tab layout - Description at top, Notes fills middle, Labels at bottom */
	.details-layout {
		display: flex;
		flex-direction: column;
		height: 100%;
		gap: 0.75rem;
		min-width: 0; /* Allow layout to shrink below content size */
		overflow: hidden; /* Prevent overflow */
	}

	.description-section {
		flex-shrink: 0;
		min-width: 0; /* Allow section to shrink below content size */
		overflow: hidden;
	}

	.notes-section {
		flex: 1;
		min-height: 0;
		min-width: 0; /* Allow section to shrink below content size */
		display: flex;
		flex-direction: column;
		overflow: hidden; /* Prevent content overflow */
	}

	.labels-section {
		flex-shrink: 0;
		margin-top: auto;
		padding-top: 0.5rem;
		border-top: 1px solid oklch(0.22 0.02 250);
	}

	.attachments-section {
		flex-shrink: 0;
		min-width: 0; /* Allow section to shrink below content size */
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

	.section-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0;
		background: transparent;
		border: none;
		cursor: pointer;
	}

	.toggle-icon {
		color: oklch(0.50 0.02 250);
		transition: transform 0.15s;
	}

	.toggle-icon.expanded {
		transform: rotate(90deg);
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
		resize: vertical;
		font-family: inherit;
		transition: border-color 0.15s, box-shadow 0.15s;
		field-sizing: content;
		min-height: calc(4 * 1.5em + 1rem);
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
		height: calc(4 * 1.5em + 1rem);
		overflow: hidden;
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
</style>
