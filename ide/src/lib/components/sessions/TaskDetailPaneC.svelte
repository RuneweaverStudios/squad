<script lang="ts">
	/**
	 * TaskDetailPaneC Component - CONCEPT C: Collapsible Cards
	 *
	 * Each section is a collapsible card. Notes expanded by default.
	 * Progressive disclosure pattern - show counts, expand for details.
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
		onSaveNotes
	}: {
		task: AgentTask;
		details: ExtendedTaskDetails | null;
		loading?: boolean;
		height?: number;
		onViewTask?: (taskId: string) => void;
		onSaveNotes?: (taskId: string, notes: string) => Promise<void>;
	} = $props();

	// Status colors for badges
	const statusColors: Record<string, string> = {
		'open': 'badge-info',
		'in_progress': 'badge-warning',
		'closed': 'badge-success',
		'blocked': 'badge-error'
	};

	// Collapse states
	let descriptionOpen = $state(false);
	let notesOpen = $state(true);  // Notes open by default
	let depsOpen = $state(false);
	let attachmentsOpen = $state(false);
	let activityOpen = $state(false);

	// Notes editing state
	let notesEditing = $state(false);
	let notesValue = $state('');
	let notesSaving = $state(false);

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

	// Computed counts
	const depsCount = $derived((details?.depends_on?.length || 0) + (details?.blocked_by?.length || 0));
	const blockingCount = $derived(details?.depends_on?.length || 0);
	const blockedByCount = $derived(details?.blocked_by?.length || 0);

	// Description line count
	const descriptionLines = $derived(task.description?.split('\n').length || 0);
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
			<!-- Compact header with metadata + labels -->
			<div class="compact-header">
				{#if details?.assignee}
					<span class="meta-chip">
						<AgentAvatar name={details.assignee} size={12} />
						{details.assignee}
					</span>
				{/if}
				{#if details?.created_at}
					<span class="meta-chip date">
						{new Date(details.created_at).toLocaleDateString()}
					</span>
				{/if}
				{#if details?.updated_at && details.updated_at !== details.created_at}
					<span class="meta-chip date">
						→ {new Date(details.updated_at).toLocaleDateString()}
					</span>
				{/if}
				{#if details?.labels && details.labels.length > 0}
					{#each details.labels as label}
						<span class="badge badge-outline badge-xs">{label}</span>
					{/each}
				{/if}
			</div>

			<!-- Collapsible sections -->
			<div class="collapsible-sections">
				<!-- Description -->
				{#if task.description}
					<div class="collapsible-card">
						<button class="card-header" onclick={() => descriptionOpen = !descriptionOpen}>
							<span class="card-icon" class:open={descriptionOpen}>▸</span>
							<span class="card-title">Description</span>
							<span class="card-meta">({descriptionLines} lines)</span>
						</button>
						{#if descriptionOpen}
							<div class="card-content">
								<p class="description-text">{task.description}</p>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Notes (open by default) -->
				<div class="collapsible-card" class:expanded={notesOpen}>
					<button class="card-header" onclick={() => notesOpen = !notesOpen}>
						<span class="card-icon" class:open={notesOpen}>▸</span>
						<span class="card-title">Notes</span>
						{#if !notesOpen && details?.notes}
							<span class="card-preview">{details.notes.slice(0, 40)}{details.notes.length > 40 ? '...' : ''}</span>
						{/if}
					</button>
					{#if notesOpen}
						<div class="card-content">
							{#if notesEditing}
								<textarea
									class="notes-input"
									bind:value={notesValue}
									onblur={saveNotes}
									placeholder="Add notes..."
									rows="4"
									disabled={notesSaving}
								></textarea>
								{#if notesSaving}
									<span class="saving-indicator">Saving...</span>
								{/if}
							{:else}
								<button
									type="button"
									class="notes-display"
									onclick={() => notesEditing = true}
								>
									{#if details?.notes}
										{details.notes}
									{:else}
										<span class="placeholder">Click to add notes...</span>
									{/if}
								</button>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Dependencies -->
				{#if depsCount > 0}
					<div class="collapsible-card">
						<button class="card-header" onclick={() => depsOpen = !depsOpen}>
							<span class="card-icon" class:open={depsOpen}>▸</span>
							<span class="card-title">Dependencies</span>
							<span class="card-meta">
								({blockingCount} dep{blockingCount !== 1 ? 's' : ''}, {blockedByCount}→)
							</span>
						</button>
						{#if depsOpen}
							<div class="card-content">
								{#if details?.depends_on && details.depends_on.length > 0}
									<div class="dep-section">
										<span class="dep-label">Depends on:</span>
										<div class="dep-list">
											{#each details.depends_on as dep}
												<button class="dep-chip" onclick={() => onViewTask?.(dep.id)}>
													<span class="dep-id">{dep.id}</span>
													<span class="badge badge-xs {statusColors[dep.status] || 'badge-ghost'}">{dep.status}</span>
												</button>
											{/each}
										</div>
									</div>
								{/if}
								{#if details?.blocked_by && details.blocked_by.length > 0}
									<div class="dep-section">
										<span class="dep-label">Blocks:</span>
										<div class="dep-list">
											{#each details.blocked_by as dep}
												<button class="dep-chip" onclick={() => onViewTask?.(dep.id)}>
													<span class="dep-id">{dep.id}</span>
													<span class="badge badge-xs {statusColors[dep.status] || 'badge-ghost'}">{dep.status}</span>
												</button>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/if}

				<!-- Attachments -->
				{#if details?.attachments && details.attachments.length > 0}
					<div class="collapsible-card">
						<button class="card-header" onclick={() => attachmentsOpen = !attachmentsOpen}>
							<span class="card-icon" class:open={attachmentsOpen}>▸</span>
							<span class="card-title">Attachments</span>
							<span class="card-meta">({details.attachments.length} 📎)</span>
						</button>
						{#if attachmentsOpen}
							<div class="card-content">
								<div class="attachments-grid">
									{#each details.attachments as attachment}
										<a
											href={attachment.url}
											target="_blank"
											rel="noopener noreferrer"
											class="attachment-thumb"
											title={attachment.filename}
										>
											<img src={attachment.url} alt={attachment.filename} />
										</a>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Activity -->
				{#if details?.timeline && details.timeline.length > 0}
					<div class="collapsible-card">
						<button class="card-header" onclick={() => activityOpen = !activityOpen}>
							<span class="card-icon" class:open={activityOpen}>▸</span>
							<span class="card-title">Activity</span>
							<span class="card-meta">({details.timelineCounts.total} events)</span>
						</button>
						{#if activityOpen}
							<div class="card-content activity-content">
								{#each details.timeline.slice(0, 10) as event}
									<div class="activity-item" class:task-event={event.type === 'jat_event'} class:message-event={event.type === 'agent_mail'} class:signal-event={event.type === 'signal'}>
										<span class="activity-bullet"></span>
										<span class="activity-time">{new Date(event.timestamp).toLocaleString()}</span>
										<span class="activity-text">
											{#if event.type === 'signal'}
												{event.data?.state || 'signal'}
											{:else}
												{event.event}
											{/if}
										</span>
									</div>
								{/each}
								{#if details.timeline.length > 10}
									<div class="activity-more">+{details.timeline.length - 10} more events</div>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- View full details link -->
			<div class="panel-footer">
				<button class="view-link" onclick={() => onViewTask?.(task.id)}>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
					</svg>
					Full details
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.task-detail-panel {
		background: oklch(0.13 0.01 250);
		border-top: 1px solid oklch(0.22 0.02 250);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.task-panel-content {
		padding: 0.625rem;
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

	/* Compact header */
	.compact-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid oklch(0.20 0.02 250);
	}

	.meta-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.7rem;
		color: oklch(0.65 0.02 250);
	}

	.meta-chip.date {
		color: oklch(0.50 0.02 250);
	}

	/* Collapsible sections */
	.collapsible-sections {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.collapsible-card {
		background: oklch(0.15 0.01 250);
		border: 1px solid oklch(0.20 0.02 250);
		border-radius: 6px;
		overflow: hidden;
	}

	.collapsible-card.expanded {
		border-color: oklch(0.28 0.04 200);
	}

	.card-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		width: 100%;
		padding: 0.5rem 0.625rem;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
		transition: background 0.15s;
	}

	.card-header:hover {
		background: oklch(0.17 0.01 250);
	}

	.card-icon {
		font-size: 0.7rem;
		color: oklch(0.50 0.02 250);
		transition: transform 0.15s;
		width: 0.75rem;
	}

	.card-icon.open {
		transform: rotate(90deg);
	}

	.card-title {
		font-size: 0.75rem;
		font-weight: 600;
		color: oklch(0.75 0.02 250);
	}

	.card-meta {
		font-size: 0.65rem;
		color: oklch(0.50 0.02 250);
		margin-left: auto;
	}

	.card-preview {
		font-size: 0.7rem;
		color: oklch(0.55 0.02 250);
		margin-left: auto;
		font-style: italic;
		max-width: 150px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.card-content {
		padding: 0.5rem 0.625rem;
		border-top: 1px solid oklch(0.20 0.02 250);
	}

	/* Description */
	.description-text {
		font-size: 0.8rem;
		color: oklch(0.70 0.02 250);
		margin: 0;
		line-height: 1.5;
		white-space: pre-wrap;
	}

	/* Notes */
	.notes-input {
		width: 100%;
		font-size: 0.8rem;
		color: oklch(0.85 0.02 250);
		background: oklch(0.12 0.01 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 4px;
		padding: 0.5rem;
		line-height: 1.5;
		resize: vertical;
		min-height: 6rem;
		font-family: inherit;
	}

	.notes-input:focus {
		outline: none;
		border-color: oklch(0.55 0.15 200);
	}

	.notes-display {
		display: flex;
		align-items: flex-start;
		width: 100%;
		font-size: 0.8rem;
		color: oklch(0.70 0.02 250);
		background: oklch(0.12 0.01 250);
		border: 1px dashed oklch(0.22 0.02 250);
		border-radius: 4px;
		padding: 0.5rem;
		text-align: left;
		line-height: 1.5;
		cursor: pointer;
		min-height: 6rem;
		white-space: pre-wrap;
	}

	.notes-display:hover {
		border-color: oklch(0.30 0.02 250);
		background: oklch(0.14 0.01 250);
	}

	.notes-display .placeholder {
		color: oklch(0.45 0.02 250);
		font-style: italic;
	}

	.saving-indicator {
		font-size: 0.7rem;
		color: oklch(0.55 0.02 250);
		font-style: italic;
		margin-top: 0.25rem;
	}

	/* Dependencies */
	.dep-section {
		margin-bottom: 0.5rem;
	}

	.dep-section:last-child {
		margin-bottom: 0;
	}

	.dep-label {
		display: block;
		font-size: 0.65rem;
		color: oklch(0.50 0.02 250);
		margin-bottom: 0.25rem;
	}

	.dep-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.dep-chip {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.2rem 0.4rem;
		background: oklch(0.18 0.02 250);
		border: none;
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.15s;
	}

	.dep-chip:hover {
		background: oklch(0.22 0.04 200);
	}

	.dep-id {
		font-size: 0.7rem;
		font-family: ui-monospace, monospace;
		color: oklch(0.65 0.12 200);
	}

	/* Attachments */
	.attachments-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.attachment-thumb {
		width: 45px;
		height: 45px;
		border-radius: 4px;
		overflow: hidden;
		border: 1px solid oklch(0.22 0.02 250);
	}

	.attachment-thumb:hover {
		border-color: oklch(0.40 0.02 250);
	}

	.attachment-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* Activity */
	.activity-content {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		max-height: 150px;
		overflow-y: auto;
	}

	.activity-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.7rem;
		padding: 0.25rem 0;
	}

	.activity-bullet {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: oklch(0.40 0.02 250);
		flex-shrink: 0;
	}

	.activity-item.task-event .activity-bullet {
		background: oklch(0.60 0.15 200);
	}

	.activity-item.message-event .activity-bullet {
		background: oklch(0.60 0.15 145);
	}

	.activity-item.signal-event .activity-bullet {
		background: oklch(0.65 0.18 85);
	}

	.activity-time {
		color: oklch(0.50 0.02 250);
		font-size: 0.65rem;
		min-width: 120px;
	}

	.activity-text {
		color: oklch(0.65 0.02 250);
	}

	.activity-more {
		font-size: 0.7rem;
		color: oklch(0.50 0.02 250);
		font-style: italic;
		padding: 0.25rem 0;
		text-align: center;
	}

	/* Footer */
	.panel-footer {
		margin-top: auto;
		padding-top: 0.5rem;
		border-top: 1px solid oklch(0.20 0.02 250);
	}

	.view-link {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: oklch(0.65 0.12 200);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: color 0.15s;
	}

	.view-link:hover {
		color: oklch(0.75 0.15 200);
	}
</style>
