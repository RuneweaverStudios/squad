<script lang="ts">
	/**
	 * SchedulerControls - Service status bar for squad-scheduler
	 *
	 * Shows: running/stopped status, uptime, start/stop button,
	 * scheduled task count, next run info
	 */

	interface SchedulerStatus {
		running: boolean;
		uptime: number | null;
		sessionCreated: string | null;
		scheduledCount: number;
		nextRun: {
			taskId: string;
			taskTitle: string;
			nextRunAt: string;
			scheduleCron: string | null;
		} | null;
		timestamp: string;
	}

	let {
		status = null,
		loading = false,
		onStart = () => {},
		onStop = () => {},
		onRefresh = () => {}
	}: {
		status: SchedulerStatus | null;
		loading: boolean;
		onStart: () => void;
		onStop: () => void;
		onRefresh: () => void;
	} = $props();

	let actionLoading = $state(false);

	function formatUptime(seconds: number | null): string {
		if (seconds === null || seconds === undefined) return '--';
		if (seconds < 60) return `${seconds}s`;
		if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
		const hours = Math.floor(seconds / 3600);
		const mins = Math.floor((seconds % 3600) / 60);
		return `${hours}h ${mins}m`;
	}

	function formatRelativeTime(isoDate: string): string {
		const diff = new Date(isoDate).getTime() - Date.now();
		const absDiff = Math.abs(diff);
		const isPast = diff < 0;

		if (absDiff < 60000) return isPast ? 'just now' : 'in <1m';
		if (absDiff < 3600000) {
			const mins = Math.floor(absDiff / 60000);
			return isPast ? `${mins}m ago` : `in ${mins}m`;
		}
		if (absDiff < 86400000) {
			const hours = Math.floor(absDiff / 3600000);
			return isPast ? `${hours}h ago` : `in ${hours}h`;
		}
		const days = Math.floor(absDiff / 86400000);
		return isPast ? `${days}d ago` : `in ${days}d`;
	}

	async function handleStart() {
		actionLoading = true;
		try {
			await onStart();
		} finally {
			actionLoading = false;
		}
	}

	async function handleStop() {
		actionLoading = true;
		try {
			await onStop();
		} finally {
			actionLoading = false;
		}
	}
</script>

<div class="scheduler-controls">
	<!-- Status indicator -->
	<div class="status-section">
		{#if loading && !status}
			<div class="skeleton h-4 w-20 rounded"></div>
		{:else}
			<div class="status-dot" class:running={status?.running} class:stopped={!status?.running}></div>
			<span class="status-label" class:text-success={status?.running} class:text-error={!status?.running}>
				{status?.running ? 'Running' : 'Stopped'}
			</span>
			{#if status?.running && status.uptime !== null}
				<span class="uptime">({formatUptime(status.uptime)})</span>
			{/if}
		{/if}
	</div>

	<!-- Stats -->
	<div class="stats-section">
		{#if status}
			<div class="stat-item" title="Scheduled tasks">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="stat-icon">
					<path fill-rule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clip-rule="evenodd" />
				</svg>
				<span class="stat-value">{status.scheduledCount}</span>
				<span class="stat-label">scheduled</span>
			</div>

			{#if status.nextRun}
				<div class="stat-divider"></div>
				<div class="stat-item" title="Next run: {status.nextRun.taskTitle} ({status.nextRun.taskId})">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="stat-icon">
						<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clip-rule="evenodd" />
					</svg>
					<span class="stat-value next-run">{formatRelativeTime(status.nextRun.nextRunAt)}</span>
					<span class="stat-label truncate max-w-[160px]" title={status.nextRun.taskTitle}>{status.nextRun.taskTitle}</span>
				</div>
			{/if}
		{/if}
	</div>

	<!-- Actions -->
	<div class="actions-section">
		<button
			class="btn-control btn-refresh"
			onclick={onRefresh}
			title="Refresh status"
			disabled={loading}
		>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="action-icon" class:animate-spin={loading}>
				<path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M21.015 4.353v4.992" />
			</svg>
		</button>

		{#if status?.running}
			<button
				class="btn-control btn-stop"
				onclick={handleStop}
				disabled={actionLoading}
				title="Stop scheduler"
			>
				{#if actionLoading}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="action-icon">
						<path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
					</svg>
				{/if}
				Stop
			</button>
		{:else}
			<button
				class="btn-control btn-start"
				onclick={handleStart}
				disabled={actionLoading}
				title="Start scheduler"
			>
				{#if actionLoading}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="action-icon">
						<path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
					</svg>
				{/if}
				Start
			</button>
		{/if}
	</div>
</div>

<style>
	.scheduler-controls {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 0.625rem 1rem;
		background: oklch(0.18 0.01 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.5rem;
	}

	.status-section {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.status-dot.running {
		background: oklch(0.72 0.19 145);
		box-shadow: 0 0 6px oklch(0.72 0.19 145 / 0.5);
	}
	.status-dot.stopped {
		background: oklch(0.55 0.15 25);
	}

	.status-label {
		font-size: 0.8125rem;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.uptime {
		font-size: 0.75rem;
		color: oklch(0.65 0.02 250);
	}

	.stats-section {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
		min-width: 0;
	}

	.stat-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.stat-icon {
		width: 14px;
		height: 14px;
		color: oklch(0.55 0.02 250);
		flex-shrink: 0;
	}

	.stat-value {
		font-size: 0.8125rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
	}

	.stat-value.next-run {
		color: oklch(0.75 0.12 200);
	}

	.stat-label {
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
	}

	.stat-divider {
		width: 1px;
		height: 16px;
		background: oklch(0.30 0.02 250);
	}

	.actions-section {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.btn-control {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.625rem;
		font-size: 0.75rem;
		font-weight: 500;
		border-radius: 0.375rem;
		border: 1px solid transparent;
		cursor: pointer;
		transition: all 0.15s;
	}
	.btn-control:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-refresh {
		padding: 0.25rem;
		background: transparent;
		color: oklch(0.60 0.02 250);
		border-color: oklch(0.30 0.02 250);
	}
	.btn-refresh:hover:not(:disabled) {
		background: oklch(0.25 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	.btn-start {
		background: oklch(0.35 0.10 145 / 0.3);
		color: oklch(0.80 0.15 145);
		border-color: oklch(0.45 0.10 145 / 0.4);
	}
	.btn-start:hover:not(:disabled) {
		background: oklch(0.40 0.12 145 / 0.4);
	}

	.btn-stop {
		background: oklch(0.35 0.10 25 / 0.3);
		color: oklch(0.80 0.12 25);
		border-color: oklch(0.45 0.10 25 / 0.4);
	}
	.btn-stop:hover:not(:disabled) {
		background: oklch(0.40 0.12 25 / 0.4);
	}

	.action-icon {
		width: 14px;
		height: 14px;
	}
</style>
