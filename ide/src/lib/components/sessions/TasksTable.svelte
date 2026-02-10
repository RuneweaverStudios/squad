<script lang="ts">
	/**
	 * TasksTable Component
	 *
	 * Unified table for Active, Paused, and Open tasks.
	 * All three sections share the same layout - only the action column differs.
	 */

	import TaskIdBadge from '$lib/components/TaskIdBadge.svelte';
	import StatusActionBadge from '$lib/components/work/StatusActionBadge.svelte';
	import type { SessionState } from '$lib/config/statusColors';

	// Normalized row item that works for all three modes
	interface TableRow {
		id: string;
		taskId: string;
		taskTitle: string;
		taskDescription?: string;
		taskPriority: number;
		taskStatus: string;
		taskType?: string;
		agentName?: string;
		sessionName?: string;
		sessionState?: string;
		elapsed?: number;
		project?: string;
		isNew?: boolean;
		resumed?: boolean;
		attached?: boolean;
	}

	type TableMode = 'active' | 'paused' | 'open';

	// Props
	let {
		rows = [],
		mode = 'open',
		projectColors = {},
		onAction,
		onRowClick,
		onViewTask
	}: {
		rows: TableRow[];
		mode: TableMode;
		projectColors?: Record<string, string>;
		onAction?: (actionId: string, row: TableRow) => Promise<void>;
		onRowClick?: (row: TableRow) => void;
		onViewTask?: (taskId: string) => void;
	} = $props();

	// Action loading state
	let actionLoading = $state<string | null>(null);

	async function handleAction(actionId: string, row: TableRow) {
		if (actionLoading) return;
		actionLoading = row.id;

		try {
			await onAction?.(actionId, row);
		} finally {
			actionLoading = null;
		}
	}

	function handleRowClick(row: TableRow) {
		if (onRowClick) {
			onRowClick(row);
		} else if (onViewTask) {
			onViewTask(row.taskId);
		}
	}

	// Get session state for StatusActionBadge
	function getSessionState(row: TableRow): SessionState {
		if (mode === 'paused') return 'paused';
		if (mode === 'open') return 'ready'; // For "START" button
		return (row.sessionState as SessionState) || 'idle';
	}
</script>

{#if rows.length > 0}
	<div class="tasks-table-wrapper">
		<table class="tasks-table">
			<thead>
				<tr>
					<th class="th-task">Task</th>
					<th class="th-action">Action</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.id)}
					{@const projectColor = projectColors[row.project || ''] || 'oklch(0.70 0.15 200)'}
					{@const task = { id: row.taskId, status: row.taskStatus, priority: row.taskPriority, issue_type: row.taskType, title: row.taskTitle }}
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
					<tr
						class="table-row"
						class:clickable={!!onRowClick || !!onViewTask}
						class:is-new={row.isNew}
						style="--project-color: {projectColor}; border-left: 3px solid {projectColor};"
						onclick={() => handleRowClick(row)}
					>
						<!-- Column 1: TaskIdBadge + Title + Description -->
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
						<td class="td-task" onclick={(e) => e.stopPropagation()}>
							<div class="badge-wrapper">
								<TaskIdBadge
									{task}
									size="sm"
									variant="agentPill"
									agentName={row.agentName}
									resumed={row.resumed}
									attached={row.attached}
									animate={row.isNew}
									onClick={() => onViewTask?.(row.taskId)}
								/>
								<span class="task-title" title={row.taskTitle}>
									{row.taskTitle || row.taskId}
								</span>
							</div>
							{#if row.taskDescription}
								<div class="task-description">
									{row.taskDescription}
								</div>
							{/if}
						</td>

						<!-- Column 3: Action (StatusActionBadge) -->
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
						<td class="td-action" onclick={(e) => e.stopPropagation()}>
							<div class="action-content">
								<StatusActionBadge
									sessionState={getSessionState(row)}
									sessionName={row.sessionName || `task-${row.taskId}`}
									stacked={true}
									alignRight={true}
									animate={row.isNew}
									disabled={actionLoading === row.id}
									onAction={(actionId) => handleAction(actionId, row)}
								/>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<div class="empty-state">
		{#if mode === 'active'}
			No active sessions
		{:else if mode === 'paused'}
			No paused sessions
		{:else}
			No open tasks
		{/if}
	</div>
{/if}

<style>
	.tasks-table-wrapper {
		border-radius: 0.5rem;
		overflow: hidden;
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.25 0.02 250);
	}

	.tasks-table {
		width: 100%;
		border-collapse: collapse;
		table-layout: fixed;
	}

	.tasks-table thead {
		background: oklch(0.20 0.01 250);
		border-bottom: 1px solid oklch(0.28 0.02 250);
	}

	.tasks-table th {
		text-align: left;
		padding: 0.75rem 1rem;
		font-size: 0.7rem;
		font-weight: 600;
		color: oklch(0.55 0.02 250);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.tasks-table td {
		padding: 0.875rem 1rem;
		font-size: 0.85rem;
		color: oklch(0.75 0.02 250);
		vertical-align: middle;
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.table-row:last-child td {
		border-bottom: none;
	}

	.table-row {
		transition: background 0.15s ease;
	}

	.table-row.clickable {
		cursor: pointer;
	}

	.table-row:hover {
		background: oklch(0.20 0.02 250);
	}

	/* Column widths */
	.th-task, .td-task { width: auto; }
	.th-action, .td-action { width: 160px; text-align: right; }

	/* Badge + title row */
	.badge-wrapper {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
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
		max-width: calc(100% - 2rem);
	}

	/* Action content */
	.action-content {
		display: flex;
		justify-content: flex-end;
		align-items: center;
	}

	/* Empty state */
	.empty-state {
		text-align: center;
		padding: 1.5rem;
		color: oklch(0.50 0.02 250);
		font-size: 0.875rem;
	}
</style>
