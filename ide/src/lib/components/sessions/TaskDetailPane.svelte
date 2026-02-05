<script lang="ts">
	/**
	 * TaskDetailPane Component
	 *
	 * Extracted detail pane for displaying task information.
	 * Used by TasksActive and can be swapped with variant implementations.
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

	// Notes editing state
	let notesEditing = $state(false);
	let notesValue = $state('');
	let notesSaving = $state(false);

	// Timeline filter
	let timelineFilter = $state<'all' | 'tasks' | 'messages'>('all');

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
			<!-- Metadata (compact row at top) -->
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

			<!-- Description -->
			{#if task.description}
				<div class="task-panel-section">
					<span class="task-panel-label">Description</span>
					<p class="task-panel-description">{task.description}</p>
				</div>
			{/if}

			<!-- Notes -->
			<div class="task-panel-section">
				<span class="task-panel-label">Notes</span>
				{#if notesEditing}
					<textarea
						class="task-panel-notes-input"
						bind:value={notesValue}
						onblur={saveNotes}
						placeholder="Add notes..."
						rows="3"
						disabled={notesSaving}
					></textarea>
				{:else}
					<button
						type="button"
						class="task-panel-notes-display"
						onclick={() => { notesEditing = true; }}
					>
						{#if details?.notes}
							{details.notes}
						{:else}
							<span class="text-base-content/40 italic">Click to add notes...</span>
						{/if}
					</button>
				{/if}
				{#if notesSaving}
					<span class="task-panel-notes-saving">Saving...</span>
				{/if}
			</div>

			<!-- Labels -->
			{#if details?.labels && details.labels.length > 0}
				<div class="task-panel-section">
					<span class="task-panel-label">Labels</span>
					<div class="task-panel-labels">
						{#each details.labels as label}
							<span class="badge badge-outline badge-sm">{label}</span>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Attachments -->
			{#if details?.attachments && details.attachments.length > 0}
				<div class="task-panel-section">
					<span class="task-panel-label">
						Attachments
						<span class="badge badge-xs ml-1">{details.attachments.length}</span>
					</span>
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
				</div>
			{/if}

			<!-- Dependencies -->
			{#if (details?.depends_on && details.depends_on.length > 0) || (details?.blocked_by && details.blocked_by.length > 0)}
				<div class="task-panel-section">
					<span class="task-panel-label">Dependencies</span>
					<div class="task-panel-dependencies">
						{#if details?.depends_on && details.depends_on.length > 0}
							<div class="dep-group">
								<span class="dep-label">Depends on:</span>
								{#each details.depends_on as dep}
									<button
										class="dep-item"
										onclick={() => onViewTask?.(dep.id)}
									>
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
									<button
										class="dep-item"
										onclick={() => onViewTask?.(dep.id)}
									>
										<span class="dep-id">{dep.id}</span>
										<span class="badge badge-xs {statusColors[dep.status] || 'badge-ghost'}">{dep.status}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Activity Timeline -->
			{#if details?.timeline && details.timeline.length > 0}
				<div class="task-panel-section task-panel-timeline-section">
					<div class="timeline-header">
						<span class="task-panel-label">Activity Timeline</span>
						<div class="timeline-tabs">
							<button
								class="timeline-tab"
								class:active={timelineFilter === 'all'}
								onclick={() => timelineFilter = 'all'}
							>
								All ({details.timelineCounts.total})
							</button>
							<button
								class="timeline-tab"
								class:active={timelineFilter === 'tasks'}
								onclick={() => timelineFilter = 'tasks'}
							>
								Tasks ({details.timelineCounts.jat_events})
							</button>
							<button
								class="timeline-tab"
								class:active={timelineFilter === 'messages'}
								onclick={() => timelineFilter = 'messages'}
							>
								Messages ({details.timelineCounts.agent_mail})
							</button>
						</div>
					</div>
					<div class="task-panel-timeline">
						{#each details.timeline.filter(e =>
							timelineFilter === 'all' ||
							(timelineFilter === 'tasks' && (e.type === 'jat_event' || e.type === 'signal')) ||
							(timelineFilter === 'messages' && e.type === 'agent_mail')
						) as event}
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
											Completing task (step: {event.data?.currentStep || ''})
										{:else if event.data?.state === 'completed'}
											Task completed
										{:else}
											State: {event.data?.state || 'unknown'}
										{/if}
									</p>
									{#if event.data?.agentName}
										<div class="timeline-event-meta">
											<span class="badge badge-xs badge-outline">@{event.data.agentName}</span>
										</div>
									{/if}
								{:else}
									<p class="timeline-event-desc">{event.description}</p>
									{#if event.metadata}
										<div class="timeline-event-meta">
											{#if event.metadata.status}
												<span class="badge badge-xs {statusColors[event.metadata.status]}">{event.metadata.status}</span>
											{/if}
											{#if event.metadata.assignee}
												<span class="badge badge-xs badge-outline">@{event.metadata.assignee}</span>
											{/if}
											{#if event.metadata.from_agent}
												<span class="badge badge-xs badge-outline">from: {event.metadata.from_agent}</span>
											{/if}
										</div>
									{/if}
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- View full details link -->
			<div class="task-panel-actions">
				<button
					class="task-panel-link"
					onclick={() => onViewTask?.(task.id)}
				>
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
		overflow-y: auto;
	}

	.task-panel-content {
		padding: 0.75rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		height: 100%;
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

	.task-panel-section {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.task-panel-label {
		font-size: 0.65rem;
		font-weight: 600;
		color: oklch(0.55 0.02 250);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.task-panel-description {
		font-size: 0.8rem;
		color: oklch(0.70 0.02 250);
		margin: 0;
		line-height: 1.5;
		white-space: pre-wrap;
	}

	.task-panel-notes-input {
		width: 100%;
		font-size: 0.8rem;
		color: oklch(0.85 0.02 250);
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.375rem;
		padding: 0.5rem 0.625rem;
		line-height: 1.5;
		resize: vertical;
		min-height: 6rem;
		font-family: inherit;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	.task-panel-notes-input:focus {
		outline: none;
		border-color: oklch(0.60 0.15 200);
		box-shadow: 0 0 0 2px oklch(0.60 0.15 200 / 0.2);
	}

	.task-panel-notes-input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
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

	.task-panel-notes-saving {
		display: block;
		font-size: 0.7rem;
		color: oklch(0.55 0.02 250);
		margin-top: 0.25rem;
		font-style: italic;
	}

	.task-panel-labels {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.task-panel-attachments {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.task-panel-attachment {
		display: block;
		width: 60px;
		height: 60px;
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

	.task-panel-dependencies {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
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
	}

	.dep-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem;
		background: oklch(0.20 0.02 250);
		border-radius: 4px;
		text-decoration: none;
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

	/* Metadata bar (compact single row at top) */
	.task-panel-metadata-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		padding-bottom: 0.625rem;
		margin-bottom: 0.5rem;
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

	/* Activity Timeline section */
	.task-panel-timeline-section {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.timeline-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}

	.timeline-tabs {
		display: flex;
		gap: 0.25rem;
	}

	.timeline-tab {
		padding: 0.25rem 0.5rem;
		font-size: 0.65rem;
		border: none;
		background: transparent;
		color: oklch(0.55 0.02 250);
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.15s;
	}

	.timeline-tab:hover {
		background: oklch(0.20 0.02 250);
		color: oklch(0.70 0.02 250);
	}

	.timeline-tab.active {
		background: oklch(0.25 0.04 200);
		color: oklch(0.85 0.02 250);
	}

	.task-panel-timeline {
		flex: 1;
		overflow-y: auto;
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

	.timeline-event-meta {
		display: flex;
		gap: 0.375rem;
		margin-top: 0.375rem;
		flex-wrap: wrap;
	}

	.task-panel-actions {
		margin-top: auto;
		padding-top: 0.75rem;
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
		text-decoration: none;
		transition: color 0.15s;
	}

	.task-panel-link:hover {
		color: oklch(0.80 0.18 200);
	}
</style>
