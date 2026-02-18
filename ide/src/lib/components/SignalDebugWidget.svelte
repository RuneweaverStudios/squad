<script lang="ts">
	/**
	 * SignalDebugWidget
	 *
	 * Debug panel that shows raw signal files from /tmp/squad-signal-*.json
	 * Useful for troubleshooting agent state detection and signal flow.
	 *
	 * Features:
	 * - Auto-refresh every 2 seconds
	 * - Shows all signal files with timestamps
	 * - Color-coded by state (working, review, needs_input, etc.)
	 * - Expandable raw JSON view
	 * - Manual refresh button
	 * - Clear all signals button
	 */

	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	interface Signal {
		sessionName: string;
		type: string;
		session_id: string;
		tmux_session?: string;
		timestamp: string;
		state?: string;
		task_id?: string;
		suggestedTasks?: any[];
		humanActions?: any[];
		_file: string;
	}

	interface SignalResponse {
		count: number;
		signals: Signal[];
		filters: {
			type: string | null;
			state: string | null;
		};
	}

	let signals = $state<Signal[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let expandedSignals = $state<Set<string>>(new Set());
	let autoRefresh = $state(true);
	let lastFetch = $state<Date | null>(null);
	let pollInterval: ReturnType<typeof setInterval> | null = null;

	// State color mapping
	const stateColors: Record<string, { bg: string; text: string; border: string }> = {
		working: {
			bg: 'oklch(0.75 0.15 85 / 0.15)',
			text: 'oklch(0.80 0.15 85)',
			border: 'oklch(0.75 0.15 85 / 0.4)'
		},
		review: {
			bg: 'oklch(0.75 0.12 200 / 0.15)',
			text: 'oklch(0.80 0.12 200)',
			border: 'oklch(0.75 0.12 200 / 0.4)'
		},
		needs_input: {
			bg: 'oklch(0.65 0.15 310 / 0.15)',
			text: 'oklch(0.75 0.15 310)',
			border: 'oklch(0.65 0.15 310 / 0.4)'
		},
		completed: {
			bg: 'oklch(0.65 0.18 145 / 0.15)',
			text: 'oklch(0.75 0.18 145)',
			border: 'oklch(0.65 0.18 145 / 0.4)'
		},
		idle: {
			bg: 'oklch(0.40 0.02 250 / 0.15)',
			text: 'oklch(0.60 0.02 250)',
			border: 'oklch(0.40 0.02 250 / 0.4)'
		},
		starting: {
			bg: 'oklch(0.60 0.15 200 / 0.15)',
			text: 'oklch(0.75 0.15 200)',
			border: 'oklch(0.60 0.15 200 / 0.4)'
		}
	};

	const defaultColors = {
		bg: 'oklch(0.25 0.02 250 / 0.5)',
		text: 'oklch(0.70 0.02 250)',
		border: 'oklch(0.35 0.02 250 / 0.5)'
	};

	function getStateColors(state: string | undefined, type?: string) {
		// If no explicit state, check if type implies completed
		if (!state && type === 'complete') {
			return stateColors['completed'];
		}
		if (!state) return defaultColors;
		return stateColors[state] || defaultColors;
	}

	function getDisplayState(signal: Signal): string | undefined {
		// Show state if present, or derive from type
		if (signal.state) return signal.state;
		if (signal.type === 'complete') return 'COMPLETE';
		return undefined;
	}

	async function fetchSignals() {
		try {
			const response = await fetch('/api/signals');
			if (!response.ok) {
				throw new Error(`Failed to fetch signals: ${response.status}`);
			}
			const data: SignalResponse = await response.json();
			signals = data.signals;
			lastFetch = new Date();
			error = null;
		} catch (err: any) {
			error = err.message || 'Failed to fetch signals';
		} finally {
			loading = false;
		}
	}

	async function clearAllSignals() {
		if (!confirm('Clear all signal files? This cannot be undone.')) return;

		try {
			const response = await fetch('/api/signals', { method: 'DELETE' });
			if (!response.ok) {
				throw new Error('Failed to clear signals');
			}
			await fetchSignals();
		} catch (err: any) {
			error = err.message || 'Failed to clear signals';
		}
	}

	function toggleExpanded(sessionName: string) {
		const newSet = new Set(expandedSignals);
		if (newSet.has(sessionName)) {
			newSet.delete(sessionName);
		} else {
			newSet.add(sessionName);
		}
		expandedSignals = newSet;
	}

	function formatTimestamp(ts: string): string {
		try {
			const date = new Date(ts);
			const now = new Date();
			const diff = now.getTime() - date.getTime();
			const seconds = Math.floor(diff / 1000);
			const minutes = Math.floor(seconds / 60);
			const hours = Math.floor(minutes / 60);

			if (seconds < 60) return `${seconds}s ago`;
			if (minutes < 60) return `${minutes}m ago`;
			if (hours < 24) return `${hours}h ago`;
			return date.toLocaleString();
		} catch {
			return ts;
		}
	}

	function formatFilename(filepath: string): string {
		return filepath.split('/').pop() || filepath;
	}

	function toggleAutoRefresh() {
		autoRefresh = !autoRefresh;
		if (autoRefresh) {
			startPolling();
		} else {
			stopPolling();
		}
	}

	function startPolling() {
		if (pollInterval) clearInterval(pollInterval);
		pollInterval = setInterval(fetchSignals, 5000);
	}

	function stopPolling() {
		if (pollInterval) {
			clearInterval(pollInterval);
			pollInterval = null;
		}
	}

	onMount(() => {
		fetchSignals();
		if (autoRefresh) {
			startPolling();
		}
	});

	onDestroy(() => {
		stopPolling();
	});
</script>

<div class="bg-base-200 rounded-lg border border-base-300 overflow-hidden">
	<!-- Header -->
	<div
		class="px-4 py-3 flex items-center justify-between"
		style="background: oklch(0.22 0.01 250); border-bottom: 1px solid oklch(0.30 0.02 250);"
	>
		<div class="flex items-center gap-3">
			<h3 class="font-mono text-sm font-semibold" style="color: oklch(0.85 0.02 250);">
				Signal Debug
			</h3>
			<span
				class="px-2 py-0.5 rounded text-[10px] font-mono"
				style="background: oklch(0.30 0.02 250); color: oklch(0.65 0.02 250);"
			>
				{signals.length} files
			</span>
		</div>

		<div class="flex items-center gap-2">
			<!-- Auto-refresh toggle -->
			<button
				class="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono transition-colors"
				style="
					background: {autoRefresh ? 'oklch(0.40 0.12 145 / 0.3)' : 'oklch(0.30 0.02 250)'};
					color: {autoRefresh ? 'oklch(0.75 0.15 145)' : 'oklch(0.55 0.02 250)'};
				"
				onclick={toggleAutoRefresh}
				title={autoRefresh ? 'Auto-refresh ON (2s)' : 'Auto-refresh OFF'}
			>
				<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
					/>
				</svg>
				{autoRefresh ? 'Auto' : 'Off'}
			</button>

			<!-- Manual refresh -->
			<button
				class="p-1.5 rounded transition-colors hover:bg-base-300/30"
				style="color: oklch(0.65 0.02 250);"
				onclick={fetchSignals}
				title="Refresh now"
			>
				<svg
					class="w-4 h-4 {loading ? 'animate-spin' : ''}"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
					/>
				</svg>
			</button>

			<!-- Clear all -->
			<button
				class="p-1.5 rounded transition-colors hover:bg-error/20"
				style="color: oklch(0.65 0.12 25);"
				onclick={clearAllSignals}
				title="Clear all signals"
			>
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
					/>
				</svg>
			</button>
		</div>
	</div>

	<!-- Error message -->
	{#if error}
		<div
			class="mx-4 mt-3 px-3 py-2 rounded font-mono text-xs"
			style="background: oklch(0.25 0.10 25 / 0.3); border: 1px solid oklch(0.50 0.15 25 / 0.5); color: oklch(0.80 0.10 25);"
		>
			{error}
		</div>
	{/if}

	<!-- Content -->
	<div class="p-4 max-h-[500px] overflow-y-auto">
		{#if loading && signals.length === 0}
			<div class="flex items-center justify-center py-8">
				<span class="loading loading-spinner loading-sm"></span>
				<span class="ml-2 font-mono text-xs" style="color: oklch(0.55 0.02 250);">
					Loading signals...
				</span>
			</div>
		{:else if signals.length === 0}
			<div class="text-center py-8">
				<p class="font-mono text-sm" style="color: oklch(0.55 0.02 250);">No signal files found</p>
				<p class="font-mono text-xs mt-2" style="color: oklch(0.45 0.02 250);">
					Signals appear when agents run <code class="px-1 py-0.5 rounded bg-base-300"
						>squad-signal</code
					> commands
				</p>
			</div>
		{:else}
			<div class="space-y-2">
				{#each signals as signal (signal._file)}
					{@const colors = getStateColors(signal.state, signal.type)}
					{@const displayState = getDisplayState(signal)}
					{@const isExpanded = expandedSignals.has(signal.sessionName)}
					<div
						class="rounded-lg overflow-hidden transition-all"
						style="
							background: {colors.bg};
							border: 1px solid {colors.border};
						"
					>
						<!-- Signal header (clickable) -->
						<button
							class="w-full px-3 py-2 flex items-center justify-between text-left"
							onclick={() => toggleExpanded(signal.sessionName)}
						>
							<div class="flex items-center gap-3">
								<!-- State badge -->
								{#if displayState}
									<span
										class="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold"
										style="background: {colors.border}; color: {colors.text};"
									>
										{displayState}
									</span>
								{/if}

								<!-- Session name -->
								<span class="font-mono text-sm" style="color: {colors.text};">
									{signal.tmux_session || signal.sessionName}
								</span>

								<!-- Task ID if present -->
								{#if signal.task_id}
									<span
										class="px-1.5 py-0.5 rounded text-[10px] font-mono"
										style="background: oklch(0.30 0.02 250); color: oklch(0.70 0.02 250);"
									>
										{signal.task_id}
									</span>
								{/if}
							</div>

							<div class="flex items-center gap-2">
								<!-- Timestamp -->
								<span class="font-mono text-[10px]" style="color: oklch(0.55 0.02 250);">
									{formatTimestamp(signal.timestamp)}
								</span>

								<!-- Expand arrow -->
								<svg
									class="w-4 h-4 transition-transform {isExpanded ? 'rotate-180' : ''}"
									style="color: oklch(0.55 0.02 250);"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
								</svg>
							</div>
						</button>

						<!-- Expanded content -->
						{#if isExpanded}
							<div
								class="px-3 pb-3 pt-1"
								style="border-top: 1px solid oklch(0.30 0.02 250 / 0.3);"
							>
								<!-- File path -->
								<div class="flex items-center gap-2 mb-2">
									<span class="font-mono text-[10px]" style="color: oklch(0.45 0.02 250);">
										File:
									</span>
									<code
										class="font-mono text-[10px] px-1.5 py-0.5 rounded"
										style="background: oklch(0.20 0.01 250); color: oklch(0.65 0.02 250);"
									>
										{formatFilename(signal._file)}
									</code>
								</div>

								<!-- Raw JSON -->
								<pre
									class="font-mono text-[10px] p-3 rounded overflow-x-auto"
									style="background: oklch(0.15 0.01 250); color: oklch(0.70 0.02 250); max-height: 200px;">{JSON.stringify(
										signal,
										null,
										2
									)}</pre>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Footer with last fetch time -->
	{#if lastFetch}
		<div
			class="px-4 py-2 text-center font-mono text-[10px]"
			style="background: oklch(0.18 0.01 250); color: oklch(0.45 0.02 250); border-top: 1px solid oklch(0.25 0.02 250);"
		>
			Last updated: {lastFetch.toLocaleTimeString()}
		</div>
	{/if}
</div>
