<script lang="ts">
	/**
	 * /schedules - Scheduled Tasks Management
	 *
	 * Top bar: scheduler service status (running/stopped), Start/Stop button
	 * Main content: filtered table of tasks with scheduling configured
	 * Actions: edit schedule, pause/resume, spawn now
	 */

	import { onMount } from 'svelte';
	import SchedulerControls from '$lib/components/schedules/SchedulerControls.svelte';
	import ScheduledTasksTable from '$lib/components/schedules/ScheduledTasksTable.svelte';
	import TaskDetailDrawer from '$lib/components/TaskDetailDrawer.svelte';
	import { successToast, errorToast } from '$lib/stores/toasts.svelte';

	// State
	let schedulerStatus = $state<any>(null);
	let scheduledTasks = $state<any[]>([]);
	let statusLoading = $state(true);
	let tasksLoading = $state(true);
	// Task detail drawer
	let selectedTaskId = $state<string | null>(null);
	let drawerOpen = $state(false);

	// Schedule edit modal
	let editingTask = $state<any>(null);
	let editCron = $state('');
	let editNextRun = $state('');
	let editCommand = $state('');
	let editAgentProgram = $state('');
	let editModel = $state('');
	let editSaving = $state(false);

	async function fetchSchedulerStatus() {
		try {
			const res = await fetch('/api/scheduler/status');
			schedulerStatus = await res.json();
		} catch (e) {
			console.error('Failed to fetch scheduler status:', e);
		} finally {
			statusLoading = false;
		}
	}

	async function fetchScheduledTasks() {
		try {
			const res = await fetch('/api/tasks?scheduled=true');
			const data = await res.json();
			scheduledTasks = data.tasks || [];
		} catch (e) {
			console.error('Failed to fetch scheduled tasks:', e);
		} finally {
			tasksLoading = false;
		}
	}

	async function handleStartScheduler() {
		try {
			const res = await fetch('/api/scheduler/start', { method: 'POST' });
			const data = await res.json();
			if (res.ok) {
				showToast('Scheduler started', 'success');
			} else {
				showToast(data.message || 'Failed to start scheduler', 'error');
			}
		} catch (e) {
			showToast('Failed to start scheduler', 'error');
		}
		await fetchSchedulerStatus();
	}

	async function handleStopScheduler() {
		try {
			const res = await fetch('/api/scheduler/stop', { method: 'POST' });
			const data = await res.json();
			if (res.ok) {
				showToast('Scheduler stopped', 'success');
			} else {
				showToast(data.message || 'Failed to stop scheduler', 'error');
			}
		} catch (e) {
			showToast('Failed to stop scheduler', 'error');
		}
		await fetchSchedulerStatus();
	}

	async function handleRefresh() {
		statusLoading = true;
		tasksLoading = true;
		await Promise.all([fetchSchedulerStatus(), fetchScheduledTasks()]);
	}

	async function handleSpawnNow(taskId: string) {
		try {
			const res = await fetch('/api/work/spawn', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ taskId })
			});
			const data = await res.json();
			if (res.ok) {
				showToast(`Spawned agent for ${taskId}`, 'success');
			} else {
				showToast(data.message || `Failed to spawn: ${taskId}`, 'error');
			}
		} catch (e) {
			showToast(`Failed to spawn: ${taskId}`, 'error');
		}
	}

	function handleEditSchedule(task: any) {
		editingTask = task;
		editCron = task.schedule_cron || '';
		editNextRun = task.next_run_at ? formatDateForInput(task.next_run_at) : '';
		editCommand = task.command || '/squad:start';
		editAgentProgram = task.agent_program || '';
		editModel = task.model || '';
	}

	function formatDateForInput(iso: string): string {
		const d = new Date(iso);
		// Format as YYYY-MM-DDTHH:MM for datetime-local input
		const pad = (n: number) => n.toString().padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	async function handleSaveSchedule() {
		if (!editingTask) return;
		editSaving = true;

		try {
			const body: Record<string, any> = {
				schedule_cron: editCron || null,
				next_run_at: editNextRun ? new Date(editNextRun).toISOString() : null,
				command: editCommand || '/squad:start',
				agent_program: editAgentProgram || null,
				model: editModel || null
			};

			const res = await fetch(`/api/tasks/${editingTask.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (res.ok) {
				showToast(`Updated schedule for ${editingTask.id}`, 'success');
				editingTask = null;
				await fetchScheduledTasks();
			} else {
				const data = await res.json();
				showToast(data.error || 'Failed to update schedule', 'error');
			}
		} catch (e) {
			showToast('Failed to update schedule', 'error');
		} finally {
			editSaving = false;
		}
	}

	async function handlePauseSchedule(taskId: string) {
		try {
			const res = await fetch(`/api/tasks/${taskId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					schedule_cron: null,
					next_run_at: null
				})
			});

			if (res.ok) {
				showToast(`Cleared schedule for ${taskId}`, 'success');
				await fetchScheduledTasks();
			} else {
				showToast('Failed to clear schedule', 'error');
			}
		} catch (e) {
			showToast('Failed to clear schedule', 'error');
		}
	}

	function handleViewTask(taskId: string) {
		selectedTaskId = taskId;
		drawerOpen = true;
	}

	function showToast(message: string, type: 'success' | 'error') {
		if (type === 'error') {
			errorToast(message);
		} else {
			successToast(message);
		}
	}

	// Polling
	let pollInterval: ReturnType<typeof setInterval>;

	onMount(() => {
		fetchSchedulerStatus();
		fetchScheduledTasks();

		// Poll every 15 seconds
		pollInterval = setInterval(() => {
			fetchSchedulerStatus();
			fetchScheduledTasks();
		}, 15000);

		return () => {
			if (pollInterval) clearInterval(pollInterval);
		};
	});
</script>

<div class="schedules-page">
	<!-- Header -->
	<div class="page-header">
		<div class="header-left">
			<h1 class="page-title">Schedules</h1>
			<span class="task-count">{scheduledTasks.length} tasks</span>
		</div>
	</div>

	<!-- Scheduler Service Controls -->
	<SchedulerControls
		status={schedulerStatus}
		loading={statusLoading}
		onStart={handleStartScheduler}
		onStop={handleStopScheduler}
		onRefresh={handleRefresh}
	/>

	<!-- Scheduled Tasks Table -->
	<div class="table-section">
		<ScheduledTasksTable
			tasks={scheduledTasks}
			loading={tasksLoading}
			onSpawnNow={handleSpawnNow}
			onEditSchedule={handleEditSchedule}
			onPauseSchedule={handlePauseSchedule}
			onViewTask={handleViewTask}
		/>
	</div>
</div>

<!-- Schedule Edit Modal -->
{#if editingTask}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={() => editingTask = null} role="dialog" aria-modal="true">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-panel" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h3 class="modal-title">Edit Schedule</h3>
				<span class="modal-task-id">{editingTask.id}</span>
				<button class="modal-close" onclick={() => editingTask = null} aria-label="Close">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style="width:16px;height:16px">
						<path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
					</svg>
				</button>
			</div>

			<div class="modal-body">
				<p class="modal-task-title">{editingTask.title}</p>

				<div class="form-group">
					<label class="form-label" for="edit-cron">Cron Expression</label>
					<input
						id="edit-cron"
						type="text"
						class="form-input"
						bind:value={editCron}
						placeholder="e.g., 0 9 * * * (daily at 9am)"
					/>
					<span class="form-hint">Leave empty for one-shot schedule</span>
				</div>

				<div class="form-group">
					<label class="form-label" for="edit-next-run">Next Run At</label>
					<input
						id="edit-next-run"
						type="datetime-local"
						class="form-input"
						bind:value={editNextRun}
					/>
					<span class="form-hint">When the task should next be triggered</span>
				</div>

				<div class="form-group">
					<label class="form-label" for="edit-command">Command</label>
					<input
						id="edit-command"
						type="text"
						class="form-input"
						bind:value={editCommand}
						placeholder="/squad:start"
					/>
				</div>

				<div class="form-row">
					<div class="form-group flex-1">
						<label class="form-label" for="edit-agent">Agent Program</label>
						<select id="edit-agent" class="form-input" bind:value={editAgentProgram}>
							<option value="">Default</option>
							<option value="claude-code">Claude Code</option>
							<option value="codex-cli">Codex CLI</option>
							<option value="gemini">Gemini</option>
							<option value="aider">Aider</option>
						</select>
					</div>
					<div class="form-group flex-1">
						<label class="form-label" for="edit-model">Model</label>
						<select id="edit-model" class="form-input" bind:value={editModel}>
							<option value="">Default</option>
							<option value="opus">Opus</option>
							<option value="sonnet">Sonnet</option>
							<option value="haiku">Haiku</option>
						</select>
					</div>
				</div>
			</div>

			<div class="modal-footer">
				<button class="btn-cancel" onclick={() => editingTask = null}>Cancel</button>
				<button class="btn-save" onclick={handleSaveSchedule} disabled={editSaving}>
					{#if editSaving}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					Save
				</button>
			</div>
		</div>
	</div>
{/if}


<!-- Task Detail Drawer -->
<TaskDetailDrawer bind:taskId={selectedTaskId} bind:isOpen={drawerOpen} />

<style>
	.schedules-page {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.25rem 1.5rem;
		max-width: 1400px;
		height: 100%;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.header-left {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
	}

	.page-title {
		font-size: 1.25rem;
		font-weight: 700;
		color: oklch(0.90 0.02 250);
		letter-spacing: -0.01em;
	}

	.task-count {
		font-size: 0.8125rem;
		color: oklch(0.50 0.02 250);
	}

	.table-section {
		flex: 1;
		min-height: 0;
		overflow: auto;
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 0.5rem;
		padding: 0.75rem;
	}

	/* Modal */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: oklch(0 0 0 / 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 50;
	}

	.modal-panel {
		background: oklch(0.20 0.01 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 0.75rem;
		width: 480px;
		max-width: 90vw;
		max-height: 85vh;
		overflow-y: auto;
		box-shadow: 0 20px 60px oklch(0 0 0 / 0.4);
	}

	.modal-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid oklch(0.28 0.02 250);
	}

	.modal-title {
		font-size: 1rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
	}

	.modal-task-id {
		font-size: 0.6875rem;
		font-family: monospace;
		color: oklch(0.55 0.02 250);
		background: oklch(0.25 0.02 250);
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
	}

	.modal-close {
		margin-left: auto;
		background: none;
		border: none;
		color: oklch(0.50 0.02 250);
		cursor: pointer;
		padding: 0.25rem;
		border-radius: 0.25rem;
	}
	.modal-close:hover {
		color: oklch(0.80 0.02 250);
		background: oklch(0.25 0.02 250);
	}

	.modal-body {
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.modal-task-title {
		font-size: 0.875rem;
		color: oklch(0.70 0.02 250);
		margin-bottom: 0.25rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.form-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: oklch(0.65 0.02 250);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.form-input {
		padding: 0.5rem 0.625rem;
		font-size: 0.8125rem;
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 0.375rem;
		color: oklch(0.85 0.02 250);
		outline: none;
	}
	.form-input:focus {
		border-color: oklch(0.50 0.10 200);
	}

	.form-hint {
		font-size: 0.6875rem;
		color: oklch(0.45 0.02 250);
	}

	.form-row {
		display: flex;
		gap: 0.75rem;
	}

	.flex-1 {
		flex: 1;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		padding: 0.75rem 1.25rem;
		border-top: 1px solid oklch(0.28 0.02 250);
	}

	.btn-cancel {
		padding: 0.375rem 0.75rem;
		font-size: 0.8125rem;
		background: transparent;
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 0.375rem;
		color: oklch(0.65 0.02 250);
		cursor: pointer;
	}
	.btn-cancel:hover {
		background: oklch(0.25 0.02 250);
	}

	.btn-save {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		font-size: 0.8125rem;
		background: oklch(0.35 0.10 200 / 0.3);
		border: 1px solid oklch(0.50 0.10 200 / 0.4);
		border-radius: 0.375rem;
		color: oklch(0.85 0.10 200);
		cursor: pointer;
	}
	.btn-save:hover:not(:disabled) {
		background: oklch(0.40 0.12 200 / 0.4);
	}
	.btn-save:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

</style>
