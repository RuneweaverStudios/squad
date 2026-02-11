<script lang="ts">
	/**
	 * TasksPaused Component
	 *
	 * Displays paused (resumable) sessions in a table format.
	 * Similar to TasksActive but simpler - no expandable rows.
	 * Each row shows: Task ID badge (with agent avatar), task title, StatusActionBadge with Resume.
	 */

	import TaskIdBadge from '$lib/components/TaskIdBadge.svelte';
	import StatusActionBadge from '$lib/components/work/StatusActionBadge.svelte';

	// Types
	interface PausedSession {
		agentName: string;
		sessionId: string | null;
		resumable: boolean;
		taskId: string;
		taskTitle: string;
		taskPriority: number;
		taskType?: string;
		taskDescription?: string;
		project: string;
		lastActivity?: string;
	}

	// Props
	let {
		sessions = [],
		projectColors = {},
		onResumeSession,
		onRestartTask,
		onUnassignTask,
		onViewTask
	}: {
		sessions: PausedSession[];
		projectColors: Record<string, string>;
		onResumeSession?: (agentName: string, sessionId: string) => Promise<void>;
		onRestartTask?: (taskId: string) => Promise<void>;
		onUnassignTask?: (taskId: string, agentName: string) => Promise<void>;
		onViewTask?: (taskId: string) => void;
	} = $props();

	// Action loading state
	let actionLoading = $state<string | null>(null);

	// Timer tick for elapsed time updates
	let tick = $state(0);

	// Update elapsed time every second
	$effect(() => {
		if (sessions.length === 0) return;
		const interval = setInterval(() => {
			tick++;
		}, 1000);
		return () => clearInterval(interval);
	});

	// Calculate elapsed time since lastActivity (how long the task has been paused/aging)
	function getElapsedFormatted(lastActivityISO: string | undefined): { hours: string; minutes: string; seconds: string; showHours: boolean } | null {
		// Use tick to trigger reactivity
		void tick;
		if (!lastActivityISO) return null;
		const lastActivity = new Date(lastActivityISO).getTime();
		const now = Date.now();
		const elapsedMs = now - lastActivity;
		if (elapsedMs < 0) return { hours: '00', minutes: '00', seconds: '00', showHours: false };
		const totalSeconds = Math.floor(elapsedMs / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		return {
			hours: hours.toString().padStart(2, '0'),
			minutes: minutes.toString().padStart(2, '0'),
			seconds: seconds.toString().padStart(2, '0'),
			showHours: hours > 0
		};
	}

	async function handleAction(actionId: string, session: PausedSession) {
		if (actionLoading) return;
		actionLoading = session.agentName;

		try {
			if (actionId === 'resume' && onResumeSession && session.sessionId) {
				await onResumeSession(session.agentName, session.sessionId);
			} else if (actionId === 'restart' && onRestartTask) {
				await onRestartTask(session.taskId);
			} else if (actionId === 'unassign' && onUnassignTask) {
				await onUnassignTask(session.taskId, session.agentName);
			} else if (actionId === 'view-task' && onViewTask) {
				onViewTask(session.taskId);
			}
		} finally {
			actionLoading = null;
		}
	}
</script>

{#if sessions.length > 0}
	<div class="paused-sessions-table">
		<table class="paused-table">
			<thead>
				<tr>
					<th class="th-task">Task</th>
					<th class="th-action">Action</th>
				</tr>
			</thead>
			<tbody>
				{#each sessions as session (session.taskId)}
					{@const projectColor = projectColors[session.project] || 'oklch(0.70 0.15 200)'}
					{@const isChat = session.taskType === 'chat'}
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
					<tr class="paused-row clickable" class:chat-row={isChat} style="--project-color: {projectColor}" onclick={() => onViewTask?.(session.taskId)}>
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
						<td class="td-task" onclick={(e) => e.stopPropagation()}>
							<div class="task-cell-content">
								<div class="badge-and-text">
									<TaskIdBadge
										task={{ id: session.taskId, status: 'in_progress', priority: session.taskPriority, issue_type: session.taskType }}
										size="sm"
										variant="agentPill"
										agentName={session.agentName}
										onClick={() => onViewTask?.(session.taskId)}
									/>
									<div class="text-column">
										<span class="task-title" title={session.taskTitle}>
											{session.taskTitle || session.taskId}
										</span>
										{#if session.taskDescription}
											<div class="task-description">
												{session.taskDescription}
											</div>
										{/if}
									</div>
								</div>
							</div>
						</td>
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
						<td class="td-action text-right" onclick={(e) => e.stopPropagation()}>
							<StatusActionBadge
								sessionState={session.resumable ? 'paused' : 'orphaned'}
								sessionName={`jat-${session.agentName}`}
								disabled={actionLoading === session.agentName}
								onAction={(actionId) => handleAction(actionId, session)}
								alignRight={true}
								elapsed={getElapsedFormatted(session.lastActivity)}
								stacked={true}
							/>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<div class="text-center py-6 text-base-content/50 text-sm">
		No paused sessions
	</div>
{/if}

<style>
	.paused-sessions-table {
		border-radius: 0.5rem;
		overflow: hidden;
		max-width: 100%;
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.25 0.02 250);
	}

	.paused-table {
		width: 100%;
		max-width: 100%;
		border-collapse: collapse;
		table-layout: fixed;
	}

	.paused-table thead {
		background: oklch(0.20 0.01 250);
		border-bottom: 1px solid oklch(0.28 0.02 250);
	}

	.paused-table th {
		text-align: left;
		padding: 0.75rem 1rem;
		font-size: 0.7rem;
		font-weight: 600;
		color: oklch(0.55 0.02 250);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.paused-table td {
		padding: 0.875rem 1rem;
		font-size: 0.85rem;
		color: oklch(0.75 0.02 250);
		vertical-align: middle;
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.paused-row:last-child td {
		border-bottom: none;
	}

	.paused-row {
		background: linear-gradient(90deg, oklch(0.65 0.18 300 / 0.06), transparent 50%);
		border-left: 3px solid oklch(0.65 0.18 300 / 0.5);
		transition: background 0.15s ease;
	}

	.paused-row.clickable {
		cursor: pointer;
	}

	.paused-row:hover {
		background: linear-gradient(90deg, oklch(0.65 0.18 300 / 0.12), oklch(0.20 0.01 250 / 0.3) 50%);
	}

	/* Chat rows use conversational blue instead of purple */
	.paused-row.chat-row {
		background: linear-gradient(90deg, oklch(0.72 0.16 200 / 0.06), transparent 50%);
		border-left: 3px solid oklch(0.72 0.16 200 / 0.5);
	}

	.paused-row.chat-row:hover {
		background: linear-gradient(90deg, oklch(0.72 0.16 200 / 0.12), oklch(0.20 0.01 250 / 0.3) 50%);
	}

	/* Column widths matching TasksActive - wider action column for stacked elapsed time */
	.th-task, .td-task { width: auto; padding-left: 0.25rem; padding-right: 0.25rem; }
	.th-action, .td-action { width: 200px; text-align: right; overflow: hidden; }

	/* Task cell content - matches TasksActive structure exactly */
	.task-cell-content {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.25rem;
		min-width: 0;
		width: 100%;
	}

	/* Badge + text side by side */
	.badge-and-text {
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
		min-width: 0;
		width: 100%;
	}

	.text-column {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
		flex: 1;
		padding-top: 0.125rem;
	}

	.task-title {
		font-size: 0.9375rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		min-width: 0;
	}

	.task-description {
		font-size: 0.75rem;
		color: oklch(0.65 0.05 200);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
