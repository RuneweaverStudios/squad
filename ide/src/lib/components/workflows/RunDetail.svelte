<script lang="ts">
	import type { WorkflowRun, WorkflowNode, NodeExecutionResult } from '$lib/types/workflow';

	let {
		run,
		nodes = []
	}: {
		run: WorkflowRun;
		nodes?: WorkflowNode[];
	} = $props();

	// Sort node results by startedAt for execution order
	const sortedResults = $derived(
		Object.entries(run.nodeResults)
			.map(([nodeId, result]) => ({
				nodeId,
				result: result as NodeExecutionResult,
				label: nodes.find((n) => n.id === nodeId)?.label || nodeId
			}))
			.sort((a, b) => new Date(a.result.startedAt).getTime() - new Date(b.result.startedAt).getTime())
	);

	let expandedNodes = $state<Set<string>>(new Set());

	function toggleNode(nodeId: string) {
		const next = new Set(expandedNodes);
		if (next.has(nodeId)) {
			next.delete(nodeId);
		} else {
			next.add(nodeId);
		}
		expandedNodes = next;
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'success':
				return 'oklch(0.72 0.17 145)';
			case 'error':
				return 'oklch(0.65 0.20 25)';
			case 'running':
				return 'oklch(0.75 0.15 200)';
			case 'skipped':
				return 'oklch(0.50 0.02 250)';
			case 'pending':
				return 'oklch(0.45 0.02 250)';
			default:
				return 'oklch(0.55 0.02 250)';
		}
	}

	function getStatusIcon(status: string): string {
		switch (status) {
			case 'success':
				return 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
			case 'error':
				return 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z';
			case 'running':
				return 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M21.015 4.356v4.992';
			case 'skipped':
				return 'M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061A1.125 1.125 0 013 16.811V8.69zM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061a1.125 1.125 0 01-1.683-.977V8.69z';
			default:
				return 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z';
		}
	}

	function formatDuration(ms: number): string {
		if (ms < 1000) return `${ms}ms`;
		if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
		return `${(ms / 60000).toFixed(1)}m`;
	}

	function formatTime(iso: string): string {
		return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	function formatData(data: unknown): string {
		if (data === undefined || data === null) return 'null';
		if (typeof data === 'string') {
			if (data.length > 500) return data.slice(0, 500) + '...';
			return data;
		}
		try {
			const json = JSON.stringify(data, null, 2);
			if (json.length > 500) return json.slice(0, 500) + '...';
			return json;
		} catch {
			return String(data);
		}
	}
</script>

<div class="flex flex-col h-full overflow-hidden">
	<!-- Run header -->
	<div
		class="flex items-center gap-2 px-3 py-1.5 shrink-0"
		style="border-bottom: 1px solid oklch(0.20 0.02 250)"
	>
		<span
			class="text-[10px] font-medium px-1.5 py-0.5 rounded"
			style="background: {getStatusColor(run.status)}15; color: {getStatusColor(run.status)}"
		>
			{run.status}
		</span>

		<span class="text-[10px]" style="color: oklch(0.50 0.02 250)">
			{new Date(run.startedAt).toLocaleString()}
		</span>

		{#if run.durationMs}
			<span class="text-[10px] tabular-nums" style="color: oklch(0.45 0.02 250)">
				{formatDuration(run.durationMs)}
			</span>
		{/if}

		<span class="text-[10px] px-1 rounded" style="background: oklch(0.18 0.01 250); color: oklch(0.45 0.02 250)">
			{run.trigger}
		</span>

		<div class="flex-1"></div>

		<span class="text-[10px] font-mono" style="color: oklch(0.35 0.02 250)">
			{run.id.slice(0, 16)}
		</span>
	</div>

	<!-- Run error -->
	{#if run.error}
		<div class="mx-3 mt-2 p-2 rounded text-xs" style="background: oklch(0.22 0.05 20); color: oklch(0.75 0.15 20)">
			{run.error}
		</div>
	{/if}

	<!-- Node results -->
	<div class="flex-1 overflow-y-auto px-1">
		{#each sortedResults as { nodeId, result, label } (nodeId)}
			{@const isExpanded = expandedNodes.has(nodeId)}
			<div style="border-bottom: 1px solid oklch(0.18 0.01 250)">
				<!-- Node row -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="flex items-center gap-2 px-2 py-1.5 cursor-pointer"
					onclick={() => toggleNode(nodeId)}
					onkeydown={(e) => e.key === 'Enter' && toggleNode(nodeId)}
					onmouseenter={(e) => {
						(e.currentTarget as HTMLElement).style.background = 'oklch(0.17 0.01 250)';
					}}
					onmouseleave={(e) => {
						(e.currentTarget as HTMLElement).style.background = 'transparent';
					}}
				>
					<!-- Expand chevron -->
					<svg
						class="w-3 h-3 shrink-0 transition-transform"
						style="color: oklch(0.40 0.02 250); transform: rotate({isExpanded ? '90deg' : '0deg'})"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M8.25 4.5l7.5 7.5-7.5 7.5" />
					</svg>

					<!-- Status icon -->
					<svg
						class="w-3.5 h-3.5 shrink-0"
						viewBox="0 0 24 24"
						fill="none"
						stroke={getStatusColor(result.status)}
						stroke-width="2"
					>
						<path d={getStatusIcon(result.status)} />
					</svg>

					<!-- Label -->
					<span class="text-xs font-medium flex-1 truncate" style="color: oklch(0.75 0.02 250)">
						{label}
					</span>

					<!-- Status badge -->
					<span
						class="text-[10px] px-1.5 py-0.5 rounded"
						style="background: {getStatusColor(result.status)}15; color: {getStatusColor(result.status)}"
					>
						{result.status}
					</span>

					<!-- Duration -->
					<span class="text-[10px] tabular-nums" style="color: oklch(0.45 0.02 250)">
						{formatDuration(result.durationMs)}
					</span>

					<!-- Time -->
					<span class="text-[10px]" style="color: oklch(0.35 0.02 250)">
						{formatTime(result.startedAt)}
					</span>
				</div>

				<!-- Expanded detail -->
				{#if isExpanded}
					<div class="px-4 pb-2 ml-5" style="border-left: 2px solid {getStatusColor(result.status)}30">
						<!-- Error -->
						{#if result.error}
							<div class="mb-2 p-2 rounded text-xs" style="background: oklch(0.22 0.05 20); color: oklch(0.75 0.15 20)">
								<div class="text-[10px] font-semibold mb-1" style="color: oklch(0.55 0.10 20)">Error</div>
								{result.error}
							</div>
						{/if}

						<!-- Input data -->
						{#if result.input !== undefined}
							<div class="mb-2">
								<div class="text-[10px] font-semibold mb-0.5" style="color: oklch(0.50 0.02 250)">Input</div>
								<pre
									class="text-[10px] p-1.5 rounded overflow-x-auto"
									style="background: oklch(0.16 0.01 250); color: oklch(0.65 0.02 250); max-height: 120px; overflow-y: auto"
								>{formatData(result.input)}</pre>
							</div>
						{/if}

						<!-- Output data -->
						{#if result.output !== undefined}
							<div class="mb-2">
								<div class="text-[10px] font-semibold mb-0.5" style="color: oklch(0.50 0.02 250)">Output</div>
								<pre
									class="text-[10px] p-1.5 rounded overflow-x-auto"
									style="background: oklch(0.16 0.01 250); color: oklch(0.65 0.02 250); max-height: 120px; overflow-y: auto"
								>{formatData(result.output)}</pre>
							</div>
						{/if}

						<!-- Timing -->
						<div class="flex items-center gap-3 text-[10px]" style="color: oklch(0.45 0.02 250)">
							<span>Started: {formatTime(result.startedAt)}</span>
							{#if result.completedAt}
								<span>Completed: {formatTime(result.completedAt)}</span>
							{/if}
							<span>Duration: {formatDuration(result.durationMs)}</span>
						</div>
					</div>
				{/if}
			</div>
		{/each}

		{#if sortedResults.length === 0}
			<div class="text-xs py-4 text-center" style="color: oklch(0.40 0.02 250)">
				No node results
			</div>
		{/if}
	</div>
</div>
