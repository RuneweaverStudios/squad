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
		type: 'beads_event' | 'agent_mail' | 'signal';
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
		timelineCounts: { total: number; beads_events: number; agent_mail: number; signals?: number };
	}

	// Props
	let {
		task,
		details,
		loading = false,
		height = 300,
		onViewTask,
		onSaveNotes,
		onAddLabel,
		onRemoveLabel
	}: {
		task: AgentTask;
		details: ExtendedTaskDetails | null;
		loading?: boolean;
		height?: number;
		onViewTask?: (taskId: string) => void;
		onSaveNotes?: (taskId: string, notes: string) => Promise<void>;
		onAddLabel?: (taskId: string, label: string) => Promise<void>;
		onRemoveLabel?: (taskId: string, label: string) => Promise<void>;
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

	// Notes editing state
	let notesEditing = $state(false);
	let notesValue = $state('');
	let notesSaving = $state(false);

	// Attachments expanded
	let attachmentsExpanded = $state(false);

	// Label management state
	let showLabelInput = $state(false);
	let newLabelValue = $state('');
	let labelSaving = $state(false);

	// Initialize notes value when details change
	$effect(() => {
		if (details?.notes !== undefined) {
			notesValue = details.notes || '';
		}
	});

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
						{#if task.description}
							<div class="task-panel-section description-section">
								<span class="task-panel-label">Description</span>
								<p class="task-panel-description">{task.description}</p>
							</div>
						{/if}

						<!-- Middle section: Notes (flex-grow to fill space) -->
						<div class="task-panel-section notes-section">
							<div class="section-header">
								<span class="task-panel-label">Notes</span>
								{#if !notesEditing && details?.notes}
									<button class="edit-btn" onclick={() => notesEditing = true} title="Edit notes">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
											<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
										</svg>
									</button>
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
									class="task-panel-notes-display notes-fill"
									onclick={() => notesEditing = true}
								>
									{#if details?.notes}
										{details.notes}
									{:else}
										<span class="text-base-content/40 italic">Click to add notes...</span>
									{/if}
								</button>
							{/if}
						</div>

						<!-- Bottom section: Labels (pinned to bottom) -->
						<div class="task-panel-section labels-section">
							<div class="section-header">
								<span class="task-panel-label">Labels</span>
								<button
									class="add-label-btn"
									onclick={() => showLabelInput = !showLabelInput}
									title="Add label"
								>
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
										<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
									</svg>
								</button>
							</div>
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
								{/if}
								{#if (!details?.labels || details.labels.length === 0) && !showLabelInput}
									<span class="no-labels-hint">No labels</span>
								{/if}
							</div>
						</div>

						<!-- Attachments (collapsible, below labels) -->
						{#if details?.attachments && details.attachments.length > 0}
							<div class="task-panel-section attachments-section">
								<button class="section-toggle" onclick={() => attachmentsExpanded = !attachmentsExpanded}>
									<span class="task-panel-label">
										Attachments
										<span class="badge badge-xs ml-1">{details.attachments.length}</span>
									</span>
									<span class="toggle-icon" class:expanded={attachmentsExpanded}>
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
											<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
										</svg>
									</button>
								{#if attachmentsExpanded}
									<div class="task-panel-attachments">
										{#each details.attachments as attachment}
											<a
												href={attachment.url}
												target="_blank"
												rel="noopener noreferrer"
												class="task-panel-attachment"
												title={attachment.filename}
											>
												<img
													src={attachment.url}
													alt={attachment.filename}
													class="task-panel-attachment-img"
												/>
											</a>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</div>

				{:else if activeTab === 'activity'}
					<!-- Activity Timeline -->
					{#if details?.timeline && details.timeline.length > 0}
						<div class="task-panel-timeline">
							{#each details.timeline as event}
								<div class="timeline-event" class:task-event={event.type === 'beads_event'} class:message-event={event.type === 'agent_mail'} class:signal-event={event.type === 'signal'}>
									<div class="timeline-event-header">
										<span class="timeline-event-type">
											{#if event.type === 'beads_event'}
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

			<!-- View full details link -->
			<div class="task-panel-actions">
				<button class="task-panel-link" onclick={() => onViewTask?.(task.id)}>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
					</svg>
					View full details
				</button>
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
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding-top: 0.5rem;
	}

	/* Details tab layout - Description at top, Notes fills middle, Labels at bottom */
	.details-layout {
		display: flex;
		flex-direction: column;
		height: 100%;
		gap: 0.75rem;
	}

	.description-section {
		flex-shrink: 0;
	}

	.notes-section {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.labels-section {
		flex-shrink: 0;
		margin-top: auto;
		padding-top: 0.5rem;
		border-top: 1px solid oklch(0.22 0.02 250);
	}

	.attachments-section {
		flex-shrink: 0;
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

	/* Add label button */
	.add-label-btn {
		padding: 0.125rem;
		background: transparent;
		border: 1px dashed oklch(0.30 0.02 250);
		color: oklch(0.50 0.02 250);
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.15s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.add-label-btn:hover {
		background: oklch(0.20 0.02 250);
		border-color: oklch(0.40 0.02 250);
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

	/* Attachments */
	.task-panel-attachments {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.375rem;
	}

	.task-panel-attachment {
		display: block;
		width: 50px;
		height: 50px;
		border-radius: 6px;
		overflow: hidden;
		border: 1px solid oklch(0.25 0.02 250);
		transition: border-color 0.15s;
	}

	.task-panel-attachment:hover {
		border-color: oklch(0.45 0.02 250);
	}

	.task-panel-attachment-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
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

	/* Actions */
	.task-panel-actions {
		margin-top: auto;
		padding-top: 0.5rem;
		border-top: 1px solid oklch(0.22 0.02 250);
	}

	.task-panel-link {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8rem;
		color: oklch(0.70 0.15 200);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: color 0.15s;
	}

	.task-panel-link:hover {
		color: oklch(0.80 0.18 200);
	}
</style>
