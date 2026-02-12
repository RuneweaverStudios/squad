<script lang="ts">
	import type { WorkflowRun, RunStatus } from '$lib/types/workflow';

	let {
		workflowId,
		selectedRunId = $bindable<string | null>(null),
		onRunSelect
	}: {
		workflowId: string;
		selectedRunId?: string | null;
		onRunSelect?: (run: WorkflowRun | null) => void;
	} = $props();

	let runs = $state<WorkflowRun[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let statusFilter = $state<RunStatus | 'all'>('all');

	const filteredRuns = $derived(
		statusFilter === 'all' ? runs : runs.filter((r) => r.status === statusFilter)
	);

	export async function refresh() {
		await loadRuns();
	}

	async function loadRuns() {
		loading = true;
		error = null;
		try {
			const res = await fetch(`/api/workflows/${workflowId}/runs?limit=50`);
			if (!res.ok) throw new Error('Failed to load runs');
			const data = await res.json();
			runs = data.runs || [];
		} catch (err) {
			error = (err as Error).message;
		} finally {
			loading = false;
		}
	}

	function selectRun(run: WorkflowRun) {
		if (selectedRunId === run.id) {
			selectedRunId = null;
			onRunSelect?.(null);
		} else {
			selectedRunId = run.id;
			onRunSelect?.(run);
		}
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'success':
				return 'oklch(0.72 0.17 145)';
			case 'error':
			case 'failed':
				return 'oklch(0.65 0.20 25)';
			case 'partial':
				return 'oklch(0.75 0.15 85)';
			case 'running':
				return 'oklch(0.75 0.15 200)';
			default:
				return 'oklch(0.55 0.02 250)';
		}
	}

	function getStatusIcon(status: string): string {
		switch (status) {
			case 'success':
				return 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
			case 'error':
			case 'failed':
				return 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z';
			case 'partial':
				return 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z';
			case 'running':
				return 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M21.015 4.356v4.992';
			default:
				return 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z';
		}
	}

	function getTriggerIcon(trigger: string): string {
		switch (trigger) {
			case 'manual':
				return 'M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59';
			case 'cron':
				return 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z';
			case 'event':
				return 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z';
			default:
				return 'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z';
		}
	}

	function formatDuration(ms: number): string {
		if (ms < 1000) return `${ms}ms`;
		if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
		return `${(ms / 60000).toFixed(1)}m`;
	}

	function formatTime(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	function formatDate(iso: string): string {
		const d = new Date(iso);
		const now = new Date();
		const diff = now.getTime() - d.getTime();
		const days = Math.floor(diff / 86400000);

		if (days === 0) return 'Today';
		if (days === 1) return 'Yesterday';
		if (days < 7) return `${days}d ago`;
		return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
	}

	function getNodeCount(run: WorkflowRun): { success: number; error: number; total: number } {
		const results = Object.values(run.nodeResults);
		return {
			success: results.filter((r) => r.status === 'success').length,
			error: results.filter((r) => r.status === 'error').length,
			total: results.length
		};
	}

	// Load runs when workflowId changes
	$effect(() => {
		if (workflowId) {
			loadRuns();
		}
	});
</script>

<div class="flex flex-col h-full overflow-hidden">
	<!-- Header with filter -->
	<div
		class="flex items-center gap-2 px-3 py-1.5 shrink-0"
		style="border-bottom: 1px solid oklch(0.20 0.02 250)"
	>
		<span class="text-xs font-medium" style="color: oklch(0.60 0.02 250)">Runs</span>
		<span class="text-[10px] tabular-nums px-1 rounded" style="background: oklch(0.20 0.02 250); color: oklch(0.50 0.02 250)">
			{filteredRuns.length}
		</span>

		<div class="flex-1"></div>

		<!-- Status filter -->
		<select
			class="select select-xs"
			style="background: oklch(0.18 0.01 250); color: oklch(0.70 0.02 250); border-color: oklch(0.25 0.02 250); font-size: 0.65rem; min-height: 1.5rem; height: 1.5rem; padding-right: 1.25rem"
			bind:value={statusFilter}
		>
			<option value="all">All</option>
			<option value="success">Success</option>
			<option value="failed">Failed</option>
			<option value="partial">Partial</option>
			<option value="running">Running</option>
		</select>

		<!-- Refresh button -->
		<button
			class="btn btn-ghost btn-xs btn-square"
			style="color: oklch(0.50 0.02 250); min-height: 1.5rem; height: 1.5rem; width: 1.5rem"
			onclick={() => loadRuns()}
			title="Refresh"
		>
			<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M21.015 4.356v4.992" />
			</svg>
		</button>
	</div>

	<!-- Run list -->
	<div class="flex-1 overflow-y-auto">
		{#if loading && runs.length === 0}
			<div class="flex items-center justify-center py-8">
				<span class="loading loading-spinner loading-sm" style="color: oklch(0.55 0.15 200)"></span>
			</div>
		{:else if error}
			<div class="px-3 py-4 text-center">
				<p class="text-xs" style="color: oklch(0.65 0.15 25)">{error}</p>
				<button class="btn btn-ghost btn-xs mt-2" style="color: oklch(0.55 0.15 200)" onclick={() => loadRuns()}>
					Retry
				</button>
			</div>
		{:else if filteredRuns.length === 0}
			<div class="px-3 py-6 text-center">
				<p class="text-xs" style="color: oklch(0.40 0.02 250)">
					{statusFilter === 'all' ? 'No runs yet' : `No ${statusFilter} runs`}
				</p>
			</div>
		{:else}
			{#each filteredRuns as run (run.id)}
				{@const counts = getNodeCount(run)}
				{@const isSelected = selectedRunId === run.id}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="flex items-start gap-2 px-3 py-2 cursor-pointer transition-colors"
					style="
						background: {isSelected ? 'oklch(0.20 0.03 200)' : 'transparent'};
						border-left: 2px solid {isSelected ? 'oklch(0.60 0.15 200)' : 'transparent'};
						border-bottom: 1px solid oklch(0.18 0.01 250);
					"
					onclick={() => selectRun(run)}
					onkeydown={(e) => e.key === 'Enter' && selectRun(run)}
					onmouseenter={(e) => {
						if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'oklch(0.17 0.01 250)';
					}}
					onmouseleave={(e) => {
						if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
					}}
				>
					<!-- Status icon -->
					<svg
						class="w-3.5 h-3.5 shrink-0 mt-0.5"
						viewBox="0 0 24 24"
						fill="none"
						stroke={getStatusColor(run.status)}
						stroke-width="2"
					>
						<path d={getStatusIcon(run.status)} />
					</svg>

					<!-- Run info -->
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-1.5">
							<!-- Status badge -->
							<span
								class="text-[10px] font-medium px-1.5 py-0.5 rounded"
								style="background: {getStatusColor(run.status)}15; color: {getStatusColor(run.status)}"
							>
								{run.status}
							</span>

							<!-- Trigger icon -->
							<span title={run.trigger}>
								<svg
									class="w-2.5 h-2.5"
									viewBox="0 0 24 24"
									fill="none"
									stroke="oklch(0.45 0.02 250)"
									stroke-width="2"
								>
									<path d={getTriggerIcon(run.trigger)} />
								</svg>
							</span>

							<div class="flex-1"></div>

							<!-- Duration -->
							{#if run.durationMs}
								<span class="text-[10px] tabular-nums" style="color: oklch(0.45 0.02 250)">
									{formatDuration(run.durationMs)}
								</span>
							{/if}
						</div>

						<!-- Timestamp and node counts -->
						<div class="flex items-center gap-1.5 mt-0.5">
							<span class="text-[10px]" style="color: oklch(0.40 0.02 250)">
								{formatDate(run.startedAt)} {formatTime(run.startedAt)}
							</span>

							<div class="flex-1"></div>

							<!-- Node result summary -->
							{#if counts.total > 0}
								<span class="text-[10px] tabular-nums" style="color: oklch(0.45 0.02 250)">
									{#if counts.error > 0}
										<span style="color: oklch(0.65 0.20 25)">{counts.error}err</span>
									{/if}
									{#if counts.success > 0}
										<span style="color: oklch(0.60 0.12 145)">{counts.success}/{counts.total}</span>
									{/if}
								</span>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>
