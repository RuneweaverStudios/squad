<script lang="ts">
	/**
	 * Minimap Prototypes Page
	 *
	 * Displays three different minimap implementations side by side,
	 * all connected to the most recent open tmux session.
	 */
	import { onMount } from 'svelte';
	import { ansiToHtml } from '$lib/utils/ansiToHtml';
	import MinimapCssScale from '$lib/components/minimap/MinimapCssScale.svelte';
	import MinimapCanvas from '$lib/components/minimap/MinimapCanvas.svelte';
	import MinimapBlocks from '$lib/components/minimap/MinimapBlocks.svelte';

	// State
	let sessions = $state<any[]>([]);
	let selectedSession = $state<string | null>(null);
	let terminalOutput = $state('');
	let loading = $state(true);
	let error = $state<string | null>(null);
	let pollingInterval: ReturnType<typeof setInterval> | null = null;

	// Terminal scroll state
	let terminalContainer: HTMLDivElement;
	let scrollPercent = $state(0);
	let visiblePercent = $state(20);

	// Minimap refs for syncing viewport
	let cssScaleRef: { setViewportPosition: (scroll: number, visible: number) => void };
	let canvasRef: { setViewportPosition: (scroll: number, visible: number) => void };
	let blocksRef: { setViewportPosition: (scroll: number, visible: number) => void };

	// Fetch available sessions
	async function fetchSessions() {
		try {
			const response = await fetch('/api/sessions');
			if (!response.ok) throw new Error('Failed to fetch sessions');

			const data = await response.json();
			sessions = data.sessions || [];

			// Auto-select most recent squad- session
			if (!selectedSession && sessions.length > 0) {
				const squadSessions = sessions.filter((s: any) => s.name.startsWith('squad-'));
				if (squadSessions.length > 0) {
					selectedSession = squadSessions[squadSessions.length - 1].name;
				} else {
					selectedSession = sessions[sessions.length - 1].name;
				}
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		}
	}

	// Fetch terminal output for selected session
	async function fetchOutput() {
		if (!selectedSession) return;

		try {
			const response = await fetch(
				`/api/sessions/${encodeURIComponent(selectedSession)}/output?lines=2000&history=true`
			);

			if (!response.ok) throw new Error('Failed to fetch output');

			const data = await response.json();
			terminalOutput = data.output || '';
			loading = false;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
			loading = false;
		}
	}

	// Handle terminal scroll
	function handleTerminalScroll() {
		if (!terminalContainer) return;

		const { scrollTop, scrollHeight, clientHeight } = terminalContainer;
		const maxScroll = scrollHeight - clientHeight;

		if (maxScroll > 0) {
			scrollPercent = (scrollTop / maxScroll) * 100;
			visiblePercent = (clientHeight / scrollHeight) * 100;
		} else {
			scrollPercent = 0;
			visiblePercent = 100;
		}

		// Sync minimap viewports
		cssScaleRef?.setViewportPosition(scrollPercent, visiblePercent);
		canvasRef?.setViewportPosition(scrollPercent, visiblePercent);
		blocksRef?.setViewportPosition(scrollPercent, visiblePercent);
	}

	// Handle minimap click - scroll terminal to position
	function handleMinimapClick(percent: number) {
		if (!terminalContainer) return;

		const { scrollHeight, clientHeight } = terminalContainer;
		const maxScroll = scrollHeight - clientHeight;
		const targetScroll = (percent / 100) * maxScroll;

		terminalContainer.scrollTo({
			top: targetScroll,
			behavior: 'smooth'
		});
	}

	// Start polling
	function startPolling() {
		fetchSessions();
		fetchOutput();

		pollingInterval = setInterval(() => {
			fetchOutput();
		}, 1000);
	}

	// Stop polling
	function stopPolling() {
		if (pollingInterval) {
			clearInterval(pollingInterval);
			pollingInterval = null;
		}
	}

	onMount(() => {
		startPolling();
		return () => stopPolling();
	});

	// Re-fetch when session changes
	$effect(() => {
		if (selectedSession) {
			fetchOutput();
		}
	});

	// Derived HTML for terminal
	const terminalHtml = $derived(ansiToHtml(terminalOutput));

	// Line count for stats
	const lineCount = $derived(terminalOutput.split('\n').length);
</script>

<svelte:head>
	<title>Minimap Prototypes - SQUAD IDE</title>
</svelte:head>

<div class="page-container">
	<!-- Header -->
	<header class="page-header">
		<div class="header-left">
			<h1 class="page-title">Minimap Prototypes</h1>
			<p class="page-description">
				Three approaches to terminal minimap navigation
			</p>
		</div>

		<div class="header-right">
			<!-- Session selector -->
			<div class="session-selector">
				<label for="session-select" class="sr-only">Select Session</label>
				<select
					id="session-select"
					bind:value={selectedSession}
					class="select select-bordered select-sm"
				>
					{#each sessions as session}
						<option value={session.name}>{session.name}</option>
					{/each}
				</select>
			</div>

			<!-- Stats -->
			<div class="stats-badge">
				<span class="stat-label">Lines:</span>
				<span class="stat-value">{lineCount.toLocaleString()}</span>
			</div>

			<!-- Refresh button -->
			<button class="btn btn-ghost btn-sm" onclick={() => fetchOutput()}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
					/>
				</svg>
			</button>
		</div>
	</header>

	<!-- Main content -->
	<div class="content-grid">
		<!-- Terminal output -->
		<div class="terminal-section">
			<div class="section-header">
				<h2 class="section-title">Terminal Output</h2>
				<span class="section-subtitle">{selectedSession || 'No session selected'}</span>
			</div>

			<div
				class="terminal-container"
				bind:this={terminalContainer}
				onscroll={handleTerminalScroll}
			>
				{#if loading}
					<div class="loading-state">
						<span class="loading loading-spinner loading-md"></span>
						<span>Loading terminal output...</span>
					</div>
				{:else if error}
					<div class="error-state">
						<span class="error-icon">!</span>
						<span>{error}</span>
						<button class="btn btn-ghost btn-xs" onclick={() => fetchOutput()}>Retry</button>
					</div>
				{:else}
					<pre class="terminal-output">{@html terminalHtml}</pre>
				{/if}
			</div>

			<!-- Scroll indicator -->
			<div class="scroll-indicator">
				<div class="scroll-track">
					<div
						class="scroll-thumb"
						style="top: {scrollPercent}%; height: {visiblePercent}%;"
					></div>
				</div>
				<span class="scroll-percent">{Math.round(scrollPercent)}%</span>
			</div>
		</div>

		<!-- Minimap prototypes -->
		<div class="minimaps-section">
			<div class="section-header">
				<h2 class="section-title">Minimap Implementations</h2>
				<span class="section-subtitle">Click or drag to navigate</span>
			</div>

			<div class="minimaps-stack">
				<!-- CSS Scale Minimap -->
				<MinimapCssScale
					bind:this={cssScaleRef}
					output={terminalOutput}
					height={180}
					scale={0.06}
					onPositionClick={handleMinimapClick}
				/>

				<!-- Canvas Minimap -->
				<MinimapCanvas
					bind:this={canvasRef}
					output={terminalOutput}
					height={180}
					lineHeight={2}
					onPositionClick={handleMinimapClick}
				/>

				<!-- Block-based Minimap -->
				<MinimapBlocks
					bind:this={blocksRef}
					output={terminalOutput}
					height={220}
					barHeight={3}
					sampleEvery={1}
					onPositionClick={handleMinimapClick}
				/>
			</div>
		</div>
	</div>

	<!-- Implementation notes -->
	<div class="notes-section">
		<h3 class="notes-title">Implementation Comparison</h3>

		<div class="notes-grid">
			<div class="note-card css-scale">
				<h4>CSS Scale</h4>
				<p class="pros">
					<strong>Pros:</strong> Real text, preserves ANSI colors, simple implementation
				</p>
				<p class="cons">
					<strong>Cons:</strong> Performance degrades with long output, may have rendering artifacts
				</p>
			</div>

			<div class="note-card canvas">
				<h4>Canvas</h4>
				<p class="pros">
					<strong>Pros:</strong> Fast rendering, handles huge outputs, smooth scrolling
				</p>
				<p class="cons">
					<strong>Cons:</strong> Complex implementation, loses text fidelity at small scales
				</p>
			</div>

			<div class="note-card blocks">
				<h4>Block-based</h4>
				<p class="pros">
					<strong>Pros:</strong> Great performance, semantic colors show errors/success at a glance
				</p>
				<p class="cons">
					<strong>Cons:</strong> Approximation only, doesn't show actual text content
				</p>
			</div>
		</div>
	</div>
</div>

<style>
	.page-container {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		background: oklch(0.13 0.01 250);
		padding: 1.5rem;
		gap: 1.5rem;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-bottom: 1rem;
		border-bottom: 1px solid oklch(0.25 0.02 250);
	}

	.page-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: oklch(0.95 0.02 250);
		margin: 0;
	}

	.page-description {
		font-size: 0.875rem;
		color: oklch(0.65 0.02 250);
		margin: 0.25rem 0 0;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.session-selector select {
		min-width: 180px;
		background: oklch(0.18 0.01 250);
		border-color: oklch(0.30 0.02 250);
	}

	.stats-badge {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.75rem;
		background: oklch(0.18 0.01 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 0.375rem;
		font-size: 0.75rem;
	}

	.stat-label {
		color: oklch(0.55 0.02 250);
	}

	.stat-value {
		color: oklch(0.85 0.05 200);
		font-family: monospace;
		font-weight: 600;
	}

	.content-grid {
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 1.5rem;
		flex: 1;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 0.75rem;
	}

	.section-title {
		font-size: 1rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
	}

	.section-subtitle {
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
	}

	.terminal-section {
		display: flex;
		flex-direction: column;
		position: relative;
	}

	.terminal-container {
		flex: 1;
		background: oklch(0.10 0.01 250);
		border: 1px solid oklch(0.22 0.02 250);
		border-radius: 0.5rem;
		overflow: auto;
		min-height: 500px;
		max-height: calc(100vh - 300px);
	}

	.terminal-output {
		margin: 0;
		padding: 1rem;
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
		font-size: 13px;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-all;
		color: oklch(0.85 0.02 250);
	}

	.loading-state,
	.error-state {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 3rem;
		color: oklch(0.60 0.02 250);
	}

	.error-state {
		color: oklch(0.70 0.15 25);
	}

	.error-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		background: oklch(0.55 0.20 25);
		color: white;
		border-radius: 50%;
		font-weight: 700;
		font-size: 0.875rem;
	}

	.scroll-indicator {
		position: absolute;
		right: 0.5rem;
		top: 3rem;
		bottom: 0.5rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		width: 20px;
	}

	.scroll-track {
		flex: 1;
		width: 4px;
		background: oklch(0.25 0.02 250);
		border-radius: 2px;
		position: relative;
	}

	.scroll-thumb {
		position: absolute;
		left: 0;
		right: 0;
		background: oklch(0.55 0.10 220);
		border-radius: 2px;
		min-height: 20px;
	}

	.scroll-percent {
		font-size: 0.625rem;
		color: oklch(0.55 0.02 250);
		font-family: monospace;
	}

	.minimaps-section {
		display: flex;
		flex-direction: column;
	}

	.minimaps-stack {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.notes-section {
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 0.5rem;
		padding: 1.25rem;
	}

	.notes-title {
		font-size: 1rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0 0 1rem;
	}

	.notes-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
	}

	.note-card {
		padding: 1rem;
		background: oklch(0.14 0.01 250);
		border-radius: 0.375rem;
		border-left: 3px solid;
	}

	.note-card.css-scale {
		border-color: oklch(0.65 0.15 200);
	}

	.note-card.canvas {
		border-color: oklch(0.65 0.18 145);
	}

	.note-card.blocks {
		border-color: oklch(0.65 0.18 300);
	}

	.note-card h4 {
		margin: 0 0 0.5rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
	}

	.note-card p {
		margin: 0.25rem 0;
		font-size: 0.75rem;
		line-height: 1.5;
		color: oklch(0.70 0.02 250);
	}

	.note-card .pros strong {
		color: oklch(0.70 0.15 145);
	}

	.note-card .cons strong {
		color: oklch(0.70 0.12 45);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@media (max-width: 1024px) {
		.content-grid {
			grid-template-columns: 1fr;
		}

		.minimaps-stack {
			flex-direction: row;
			flex-wrap: wrap;
		}

		.minimaps-stack > :global(*) {
			flex: 1;
			min-width: 280px;
		}

		.notes-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
