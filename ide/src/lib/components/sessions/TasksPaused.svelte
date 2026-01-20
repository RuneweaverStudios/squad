<script lang="ts">
	/**
	 * TasksPaused Component
	 *
	 * Displays paused (resumable) sessions in a table format.
	 * Similar to TasksActive but simpler - no expandable rows.
	 * Each row shows: Task ID badge, agent avatar, task title, priority, StatusActionBadge with Resume.
	 */

	import TaskIdBadge from '$lib/components/TaskIdBadge.svelte';
	import AgentAvatar from '$lib/components/AgentAvatar.svelte';
	import StatusActionBadge from '$lib/components/work/StatusActionBadge.svelte';

	// Types
	interface PausedSession {
		agentName: string;
		sessionId: string;
		taskId: string;
		taskTitle: string;
		taskPriority: number;
		project: string;
		lastActivity?: string;
	}

	// Props
	let {
		sessions = [],
		projectColors = {},
		onResumeSession,
		onViewTask
	}: {
		sessions: PausedSession[];
		projectColors: Record<string, string>;
		onResumeSession?: (agentName: string, sessionId: string) => Promise<void>;
		onViewTask?: (taskId: string) => void;
	} = $props();

	// Priority colors
	const priorityColors: Record<number, string> = {
		0: 'text-error font-bold',     // P0 - Critical
		1: 'text-warning',              // P1 - High
		2: 'text-info',                 // P2 - Medium
		3: 'text-base-content/70',      // P3 - Low
		4: 'text-base-content/50'       // P4 - Lowest
	};

	// Action loading state
	let actionLoading = $state<string | null>(null);

	async function handleAction(actionId: string, session: PausedSession) {
		if (actionLoading) return;
		actionLoading = session.agentName;

		try {
			if (actionId === 'resume' && onResumeSession) {
				await onResumeSession(session.agentName, session.sessionId);
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
		<table class="table table-sm w-full">
			<thead>
				<tr class="text-base-content/60 text-xs uppercase tracking-wider">
					<th class="w-[120px]">Task</th>
					<th class="w-[140px]">Agent</th>
					<th>Title</th>
					<th class="w-[60px] text-center">Priority</th>
					<th class="w-[140px] text-right">Action</th>
				</tr>
			</thead>
			<tbody>
				{#each sessions as session (session.sessionId)}
					{@const projectColor = projectColors[session.project] || 'oklch(0.70 0.15 200)'}
					<tr class="paused-row" style="--project-color: {projectColor}">
						<td>
							<TaskIdBadge
								task={{ id: session.taskId, status: 'in_progress' }}
								size="sm"
								showState={false}
								onClick={() => onViewTask?.(session.taskId)}
							/>
						</td>
						<td>
							<div class="flex items-center gap-2">
								<AgentAvatar name={session.agentName} size={24} />
								<span class="text-sm font-medium text-base-content/80">{session.agentName}</span>
							</div>
						</td>
						<td>
							<span class="text-sm text-base-content/90 line-clamp-1">{session.taskTitle}</span>
						</td>
						<td class="text-center">
							<span class="text-sm font-mono {priorityColors[session.taskPriority] || 'text-base-content/70'}">
								P{session.taskPriority}
							</span>
						</td>
						<td class="text-right">
							<StatusActionBadge
								sessionState="paused"
								sessionName={`jat-${session.agentName}`}
								disabled={actionLoading === session.agentName}
								onAction={(actionId) => handleAction(actionId, session)}
								alignRight={true}
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
		background: oklch(0.18 0.01 250 / 0.5);
		border: 1px solid oklch(0.30 0.02 250 / 0.5);
	}

	.paused-sessions-table :global(thead tr) {
		background: oklch(0.15 0.01 250 / 0.8);
	}

	.paused-sessions-table :global(th) {
		padding: 0.75rem 1rem;
		font-weight: 500;
		border-bottom: 1px solid oklch(0.25 0.02 250 / 0.5);
	}

	.paused-row {
		background: linear-gradient(90deg, oklch(0.65 0.18 300 / 0.06), transparent 50%);
		border-left: 3px solid oklch(0.65 0.18 300 / 0.5);
		transition: background 0.15s ease;
	}

	.paused-row:hover {
		background: linear-gradient(90deg, oklch(0.65 0.18 300 / 0.12), oklch(0.20 0.01 250 / 0.3) 50%);
	}

	.paused-row :global(td) {
		padding: 0.75rem 1rem;
		border-bottom: 1px solid oklch(0.22 0.02 250 / 0.4);
		vertical-align: middle;
	}

	.paused-row:last-child :global(td) {
		border-bottom: none;
	}
</style>
