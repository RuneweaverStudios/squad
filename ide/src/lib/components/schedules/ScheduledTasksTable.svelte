<script lang="ts">
	/**
	 * ScheduledTasksTable - Table of tasks with scheduling configured
	 *
	 * Shows tasks that have schedule_cron or next_run_at set.
	 * Columns: status, task title, command, agent/model, schedule, next run, actions
	 */

	interface ScheduledTask {
		id: string;
		title: string;
		description: string;
		status: string;
		priority: number;
		issue_type: string;
		project: string;
		assignee: string | null;
		command: string | null;
		agent_program: string | null;
		model: string | null;
		schedule_cron: string | null;
		next_run_at: string | null;
		due_date: string | null;
		labels: string[];
		created_at: string;
		updated_at: string;
	}

	let {
		tasks = [],
		loading = false,
		onSpawnNow = (_taskId: string) => {},
		onEditSchedule = (_task: ScheduledTask) => {},
		onPauseSchedule = (_taskId: string) => {},
		onViewTask = (_taskId: string) => {}
	}: {
		tasks: ScheduledTask[];
		loading: boolean;
		onSpawnNow: (taskId: string) => void;
		onEditSchedule: (task: ScheduledTask) => void;
		onPauseSchedule: (taskId: string) => void;
		onViewTask: (taskId: string) => void;
	} = $props();

	let sortField = $state<string>('next_run_at');
	let sortDir = $state<'asc' | 'desc'>('asc');
	let filterStatus = $state<string>('all');

	const filteredTasks = $derived.by(() => {
		let result = [...tasks];

		// Filter by status
		if (filterStatus !== 'all') {
			result = result.filter(t => t.status === filterStatus);
		}

		// Sort
		result.sort((a, b) => {
			let valA: string | number | null = null;
			let valB: string | number | null = null;

			switch (sortField) {
				case 'priority':
					valA = a.priority;
					valB = b.priority;
					break;
				case 'next_run_at':
					valA = a.next_run_at || '';
					valB = b.next_run_at || '';
					break;
				case 'title':
					valA = a.title.toLowerCase();
					valB = b.title.toLowerCase();
					break;
				case 'status':
					valA = a.status;
					valB = b.status;
					break;
				default:
					valA = a.next_run_at || '';
					valB = b.next_run_at || '';
			}

			if (valA === null || valA === '') return 1;
			if (valB === null || valB === '') return -1;
			if (valA < valB) return sortDir === 'asc' ? -1 : 1;
			if (valA > valB) return sortDir === 'asc' ? 1 : -1;
			return 0;
		});

		return result;
	});

	function toggleSort(field: string) {
		if (sortField === field) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortField = field;
			sortDir = 'asc';
		}
	}

	function formatCron(cron: string | null): string {
		if (!cron) return '--';
		// Common cron patterns
		const patterns: Record<string, string> = {
			'* * * * *': 'Every minute',
			'*/5 * * * *': 'Every 5 min',
			'*/15 * * * *': 'Every 15 min',
			'*/30 * * * *': 'Every 30 min',
			'0 * * * *': 'Hourly',
			'0 */2 * * *': 'Every 2 hours',
			'0 */4 * * *': 'Every 4 hours',
			'0 */6 * * *': 'Every 6 hours',
			'0 */12 * * *': 'Every 12 hours',
			'0 0 * * *': 'Daily',
			'0 9 * * *': 'Daily 9am',
			'0 9 * * 1-5': 'Weekdays 9am',
			'0 0 * * 0': 'Weekly',
			'0 0 1 * *': 'Monthly'
		};
		return patterns[cron] || cron;
	}

	function formatNextRun(isoDate: string | null): { text: string; class: string } {
		if (!isoDate) return { text: '--', class: '' };
		const diff = new Date(isoDate).getTime() - Date.now();

		if (diff < 0) {
			const absDiff = Math.abs(diff);
			if (absDiff < 60000) return { text: 'overdue (<1m)', class: 'text-error' };
			if (absDiff < 3600000) return { text: `overdue (${Math.floor(absDiff / 60000)}m)`, class: 'text-error' };
			return { text: `overdue (${Math.floor(absDiff / 3600000)}h)`, class: 'text-error' };
		}
		if (diff < 60000) return { text: 'in <1m', class: 'text-warning' };
		if (diff < 3600000) return { text: `in ${Math.floor(diff / 60000)}m`, class: 'text-info' };
		if (diff < 86400000) {
			const h = Math.floor(diff / 3600000);
			const m = Math.floor((diff % 3600000) / 60000);
			return { text: `in ${h}h ${m}m`, class: '' };
		}
		return { text: `in ${Math.floor(diff / 86400000)}d`, class: '' };
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'open': return 'badge-info';
			case 'in_progress': return 'badge-warning';
			case 'closed': return 'badge-success';
			case 'blocked': return 'badge-error';
			default: return 'badge-ghost';
		}
	}

	function getPriorityLabel(p: number): string {
		const labels: Record<number, string> = { 0: 'P0', 1: 'P1', 2: 'P2', 3: 'P3', 4: 'P4' };
		return labels[p] || `P${p}`;
	}

	function getPriorityColor(p: number): string {
		switch (p) {
			case 0: return 'badge-error';
			case 1: return 'badge-warning';
			case 2: return 'badge-info';
			default: return 'badge-ghost';
		}
	}

	// Unique statuses for filter
	const availableStatuses = $derived(
		[...new Set(tasks.map(t => t.status))].sort()
	);
</script>

<div class="table-container">
	<!-- Filter bar -->
	<div class="filter-bar">
		<div class="filter-group">
			<span class="filter-label">Status:</span>
			<button
				class="filter-chip"
				class:active={filterStatus === 'all'}
				onclick={() => filterStatus = 'all'}
			>All ({tasks.length})</button>
			{#each availableStatuses as status}
				{@const count = tasks.filter(t => t.status === status).length}
				<button
					class="filter-chip"
					class:active={filterStatus === status}
					onclick={() => filterStatus = status}
				>{status} ({count})</button>
			{/each}
		</div>
	</div>

	<!-- Table -->
	{#if loading && tasks.length === 0}
		<div class="skeleton-rows">
			{#each Array(5) as _}
				<div class="skeleton-row">
					<div class="skeleton h-4 w-12 rounded"></div>
					<div class="skeleton h-4 w-48 rounded"></div>
					<div class="skeleton h-4 w-24 rounded"></div>
					<div class="skeleton h-4 w-20 rounded"></div>
					<div class="skeleton h-4 w-28 rounded"></div>
					<div class="skeleton h-4 w-20 rounded"></div>
				</div>
			{/each}
		</div>
	{:else if filteredTasks.length === 0}
		<div class="empty-state">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="empty-icon">
				<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
			</svg>
			<p class="empty-title">No scheduled tasks</p>
			<p class="empty-desc">Tasks with a cron schedule or next run date will appear here.</p>
		</div>
	{:else}
		<div class="table-scroll">
			<table class="sched-table">
				<thead>
					<tr>
						<th class="col-status" onclick={() => toggleSort('status')}>
							Status {sortField === 'status' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
						</th>
						<th class="col-priority" onclick={() => toggleSort('priority')}>
							P {sortField === 'priority' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
						</th>
						<th class="col-title" onclick={() => toggleSort('title')}>
							Task {sortField === 'title' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
						</th>
						<th class="col-command">Command</th>
						<th class="col-agent">Agent / Model</th>
						<th class="col-schedule">Schedule</th>
						<th class="col-nextrun" onclick={() => toggleSort('next_run_at')}>
							Next Run {sortField === 'next_run_at' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
						</th>
						<th class="col-actions">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredTasks as task (task.id)}
						{@const nextRun = formatNextRun(task.next_run_at)}
						<tr class="task-row" class:row-closed={task.status === 'closed'}>
							<td class="col-status">
								<span class="badge badge-sm {getStatusColor(task.status)}">{task.status}</span>
							</td>
							<td class="col-priority">
								<span class="badge badge-sm {getPriorityColor(task.priority)}">{getPriorityLabel(task.priority)}</span>
							</td>
							<td class="col-title">
								<button class="task-title-btn" onclick={() => onViewTask(task.id)} title={task.id}>
									<span class="task-id">{task.id}</span>
									<span class="task-name">{task.title}</span>
								</button>
								{#if task.project}
									<span class="project-badge">{task.project}</span>
								{/if}
							</td>
							<td class="col-command">
								<code class="command-text">{task.command || '/squad:start'}</code>
							</td>
							<td class="col-agent">
								{#if task.agent_program || task.model}
									<span class="agent-info">
										{#if task.agent_program}
											<span class="agent-program">{task.agent_program}</span>
										{/if}
										{#if task.model}
											<span class="agent-model">{task.model}</span>
										{/if}
									</span>
								{:else}
									<span class="text-muted">default</span>
								{/if}
							</td>
							<td class="col-schedule">
								{#if task.schedule_cron}
									<span class="cron-badge" title={task.schedule_cron}>
										{formatCron(task.schedule_cron)}
									</span>
								{:else}
									<span class="oneshot-badge">one-shot</span>
								{/if}
							</td>
							<td class="col-nextrun">
								<span class={nextRun.class}>{nextRun.text}</span>
							</td>
							<td class="col-actions">
								<div class="action-btns">
									<button
										class="action-btn btn-spawn"
										onclick={() => onSpawnNow(task.id)}
										title="Spawn agent now"
										disabled={task.status === 'closed'}
									>
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="action-icon">
											<path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
										</svg>
									</button>
									<button
										class="action-btn btn-edit"
										onclick={() => onEditSchedule(task)}
										title="Edit schedule"
									>
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="action-icon">
											<path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
										</svg>
									</button>
									<button
										class="action-btn btn-pause"
										onclick={() => onPauseSchedule(task.id)}
										title={task.status === 'closed' ? 'Schedule paused (task closed)' : 'Clear schedule'}
									>
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="action-icon">
											<path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
										</svg>
									</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.table-container {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.filter-bar {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0 0.25rem;
	}

	.filter-group {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.filter-label {
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
		font-weight: 500;
	}

	.filter-chip {
		font-size: 0.6875rem;
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		border: 1px solid oklch(0.30 0.02 250);
		background: transparent;
		color: oklch(0.65 0.02 250);
		cursor: pointer;
		transition: all 0.15s;
	}
	.filter-chip:hover {
		background: oklch(0.25 0.02 250);
		color: oklch(0.80 0.02 250);
	}
	.filter-chip.active {
		background: oklch(0.30 0.08 200 / 0.3);
		border-color: oklch(0.50 0.10 200 / 0.5);
		color: oklch(0.80 0.10 200);
	}

	.skeleton-rows {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
	}
	.skeleton-row {
		display: flex;
		gap: 1rem;
		align-items: center;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		gap: 0.75rem;
	}
	.empty-icon {
		width: 48px;
		height: 48px;
		color: oklch(0.40 0.02 250);
	}
	.empty-title {
		font-size: 1rem;
		font-weight: 600;
		color: oklch(0.70 0.02 250);
	}
	.empty-desc {
		font-size: 0.8125rem;
		color: oklch(0.50 0.02 250);
	}

	.table-scroll {
		overflow-x: auto;
	}

	.sched-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8125rem;
	}

	.sched-table thead {
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.sched-table th {
		padding: 0.5rem 0.625rem;
		text-align: left;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: oklch(0.55 0.02 250);
		background: oklch(0.16 0.01 250);
		border-bottom: 1px solid oklch(0.28 0.02 250);
		cursor: pointer;
		user-select: none;
		white-space: nowrap;
	}
	.sched-table th:hover {
		color: oklch(0.75 0.02 250);
	}

	.sched-table td {
		padding: 0.5rem 0.625rem;
		border-bottom: 1px solid oklch(0.22 0.01 250);
		vertical-align: middle;
	}

	.task-row {
		transition: background 0.15s;
	}
	.task-row:hover {
		background: oklch(0.20 0.01 250);
	}
	.task-row.row-closed {
		opacity: 0.5;
	}

	.col-status { width: 80px; }
	.col-priority { width: 48px; }
	.col-title { min-width: 200px; }
	.col-command { width: 120px; }
	.col-agent { width: 140px; }
	.col-schedule { width: 130px; }
	.col-nextrun { width: 120px; }
	.col-actions { width: 100px; }

	.task-title-btn {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.125rem;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		text-align: left;
	}
	.task-title-btn:hover .task-name {
		color: oklch(0.85 0.10 200);
	}

	.task-id {
		font-size: 0.6875rem;
		color: oklch(0.50 0.02 250);
		font-family: monospace;
	}

	.task-name {
		font-size: 0.8125rem;
		color: oklch(0.80 0.02 250);
		font-weight: 500;
		transition: color 0.15s;
	}

	.project-badge {
		font-size: 0.625rem;
		padding: 0 0.375rem;
		border-radius: 9999px;
		background: oklch(0.25 0.04 250);
		color: oklch(0.60 0.04 250);
		font-weight: 500;
		margin-top: 0.125rem;
	}

	.command-text {
		font-size: 0.75rem;
		color: oklch(0.65 0.08 145);
		background: oklch(0.20 0.02 145 / 0.15);
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
	}

	.agent-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.agent-program {
		font-size: 0.75rem;
		color: oklch(0.70 0.02 250);
	}

	.agent-model {
		font-size: 0.6875rem;
		color: oklch(0.55 0.08 200);
		font-weight: 500;
	}

	.text-muted {
		color: oklch(0.45 0.02 250);
		font-size: 0.75rem;
	}

	.cron-badge {
		font-size: 0.75rem;
		color: oklch(0.75 0.12 280);
		background: oklch(0.25 0.06 280 / 0.2);
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		border: 1px solid oklch(0.40 0.08 280 / 0.3);
	}

	.oneshot-badge {
		font-size: 0.75rem;
		color: oklch(0.60 0.08 85);
		background: oklch(0.25 0.04 85 / 0.2);
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		border: 1px solid oklch(0.40 0.06 85 / 0.3);
	}

	.action-btns {
		display: flex;
		gap: 0.25rem;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 0.25rem;
		border: 1px solid oklch(0.28 0.02 250);
		background: transparent;
		cursor: pointer;
		color: oklch(0.55 0.02 250);
		transition: all 0.15s;
	}
	.action-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
	.action-btn:hover:not(:disabled) {
		background: oklch(0.25 0.02 250);
	}

	.btn-spawn:hover:not(:disabled) {
		color: oklch(0.75 0.15 145);
		border-color: oklch(0.45 0.10 145 / 0.4);
	}
	.btn-edit:hover:not(:disabled) {
		color: oklch(0.75 0.12 200);
		border-color: oklch(0.45 0.10 200 / 0.4);
	}
	.btn-pause:hover:not(:disabled) {
		color: oklch(0.75 0.12 85);
		border-color: oklch(0.45 0.10 85 / 0.4);
	}

	.action-icon {
		width: 14px;
		height: 14px;
	}

	.text-error { color: oklch(0.70 0.18 25); }
	.text-warning { color: oklch(0.78 0.15 85); }
	.text-info { color: oklch(0.75 0.12 200); }
</style>
