<script lang="ts">
	/**
	 * Triage Page - Mission Control for Agent Management
	 *
	 * A dispatch-style interface showing agents that need attention:
	 * - needs-input: Agent blocked, waiting for user clarification (orange)
	 * - ready-for-review: Agent finished work, awaiting review (yellow)
	 *
	 * Clicking a card expands it to show the full SessionCard inline (accordion style).
	 * Agents actively working are shown in a collapsed "working quietly" section.
	 */

	import { onMount, onDestroy } from 'svelte';
	import type { WorkSession } from '$lib/stores/workSessions.svelte.js';
	import SessionCard from '$lib/components/work/SessionCard.svelte';
	import { TriageSkeleton } from '$lib/components/skeleton';
	import { type SessionState } from '$lib/config/statusColors';

	// State
	let sessions = $state<WorkSession[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let pollingInterval: ReturnType<typeof setInterval> | null = null;

	// Expanded session tracking (accordion style - only one at a time)
	let expandedSession = $state<string | null>(null);

	// Session state detection (mirrors SessionCard logic)

	function getSessionState(session: WorkSession): SessionState {
		const recentOutput = session.output ? session.output.slice(-3000) : '';

		// Find LAST position of each marker type (most recent wins)
		const findLastPos = (patterns: RegExp[]): number => {
			let maxPos = -1;
			for (const pattern of patterns) {
				const match = recentOutput.match(new RegExp(pattern.source, 'g'));
				if (match) {
					const lastMatch = match[match.length - 1];
					const pos = recentOutput.lastIndexOf(lastMatch);
					if (pos > maxPos) maxPos = pos;
				}
			}
			return maxPos;
		};

		const needsInputPos = findLastPos([/\[JAT:NEEDS_INPUT\]/, /❓\s*NEED CLARIFICATION/]);
		const workingPos = findLastPos([/\[JAT:WORKING\s+task=/]);
		const reviewPos = findLastPos([/\[JAT:NEEDS_REVIEW\]/, /\[JAT:READY\s+actions=/, /🔍\s*READY FOR REVIEW/]);
		const hasCompletionMarker = /\[JAT:IDLE\]/.test(recentOutput) || /✅\s*TASK COMPLETE/.test(recentOutput);

		if (session.task) {
			const positions = [
				{ state: 'needs-input' as const, pos: needsInputPos },
				{ state: 'working' as const, pos: workingPos },
				{ state: 'ready-for-review' as const, pos: reviewPos },
			].filter(p => p.pos >= 0);

			if (positions.length > 0) {
				positions.sort((a, b) => b.pos - a.pos);
				return positions[0].state;
			}
			return 'working';
		}

		if (session.lastCompletedTask) {
			if (hasCompletionMarker) return 'completed';
			if (session.lastCompletedTask.closedAt) {
				const closedDate = new Date(session.lastCompletedTask.closedAt);
				const now = new Date();
				const hoursSinceClosed = (now.getTime() - closedDate.getTime()) / (1000 * 60 * 60);
				if (hoursSinceClosed < 2) return 'completed';
			}
		}

		return 'idle';
	}

	// Extract question/summary from output for needs-input sessions
	function extractQuestion(output: string): string | null {
		const recentOutput = output.slice(-3000);

		// Look for question patterns after NEEDS_INPUT marker
		const needsInputMatch = recentOutput.match(/\[JAT:NEEDS_INPUT\][\s\S]*?❓\s*Questions?:?\s*([\s\S]*?)(?=\n\n|Please provide|$)/i);
		if (needsInputMatch) {
			return needsInputMatch[1].trim().slice(0, 200);
		}

		// Look for NEED CLARIFICATION section
		const clarificationMatch = recentOutput.match(/❓\s*NEED CLARIFICATION[\s\S]*?\n([\s\S]*?)(?=\n\n|$)/i);
		if (clarificationMatch) {
			return clarificationMatch[1].trim().slice(0, 200);
		}

		return null;
	}

	// Extract changes summary for ready-for-review sessions
	function extractChangesSummary(output: string): string | null {
		const recentOutput = output.slice(-3000);

		// Look for changes made section
		const changesMatch = recentOutput.match(/Changes made:?\s*([\s\S]*?)(?=Next steps|$)/i);
		if (changesMatch) {
			return changesMatch[1].trim().slice(0, 200);
		}

		return null;
	}

	// Categorized sessions
	const needsInputSessions = $derived(
		sessions
			.filter(s => getSessionState(s) === 'needs-input')
			.map(s => ({ ...s, _state: 'needs-input' as const, _question: extractQuestion(s.output) }))
	);

	const readyForReviewSessions = $derived(
		sessions
			.filter(s => getSessionState(s) === 'ready-for-review')
			.map(s => ({ ...s, _state: 'ready-for-review' as const, _changes: extractChangesSummary(s.output) }))
	);

	const workingSessions = $derived(
		sessions.filter(s => getSessionState(s) === 'working')
	);

	const idleSessions = $derived(
		sessions.filter(s => {
			const state = getSessionState(s);
			return state === 'idle' || state === 'completed';
		})
	);

	const totalNeedingAttention = $derived(needsInputSessions.length + readyForReviewSessions.length);

	// Fetch sessions
	async function fetchSessions() {
		try {
			const response = await fetch('/api/work?lines=150');
			if (!response.ok) throw new Error('Failed to fetch sessions');
			const data = await response.json();
			sessions = data.sessions || [];
			error = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			isLoading = false;
		}
	}

	// Toggle expanded session (accordion style)
	function toggleExpand(sessionName: string) {
		if (expandedSession === sessionName) {
			expandedSession = null;
		} else {
			expandedSession = sessionName;
		}
	}

	// SessionCard action handlers
	async function handleKillSession(sessionName: string) {
		try {
			const response = await fetch('/api/work/kill', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sessionName })
			});
			if (!response.ok) throw new Error('Failed to kill session');
			expandedSession = null;
			await fetchSessions();
		} catch (e) {
			console.error('Failed to kill session:', e);
		}
	}

	async function handleInterrupt(sessionName: string) {
		try {
			const response = await fetch('/api/work/interrupt', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sessionName })
			});
			if (!response.ok) throw new Error('Failed to interrupt session');
		} catch (e) {
			console.error('Failed to interrupt session:', e);
		}
	}

	async function handleSendInput(sessionName: string, input: string, type: 'text' | 'key' | 'raw') {
		try {
			// Use the unified session input endpoint
			const response = await fetch(`/api/work/${encodeURIComponent(sessionName)}/input`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ input, type })
			});
			if (!response.ok) throw new Error('Failed to send input');
		} catch (e) {
			console.error('Failed to send input:', e);
		}
	}

	function handleAttachTerminal(sessionName: string) {
		// Open in new terminal - this would need tmux attach
		console.log('Attach terminal:', sessionName);
	}

	onMount(() => {
		fetchSessions();
		// Poll every 2 seconds for responsive updates
		pollingInterval = setInterval(fetchSessions, 2000);
	});

	onDestroy(() => {
		if (pollingInterval) clearInterval(pollingInterval);
	});

	// Collapse state for working section
	let showWorking = $state(false);

	// Auto-collapse expanded session when it changes state (e.g., goes back to working)
	$effect(() => {
		if (expandedSession) {
			const session = sessions.find(s => s.sessionName === expandedSession);
			if (session) {
				const state = getSessionState(session);
				// If it's now working (not needs-input or ready-for-review), collapse it
				if (state === 'working') {
					// Small delay to let user see the transition
					setTimeout(() => {
						if (expandedSession === session.sessionName) {
							const currentState = getSessionState(session);
							if (currentState === 'working') {
								expandedSession = null;
							}
						}
					}, 1500);
				}
			}
		}
	});
</script>

<svelte:head>
	<title>Triage | JAT IDE</title>
	<meta name="description" content="Mission control for agent management. View agents needing attention, input requests, and review queues." />
	<meta property="og:title" content="Triage | JAT IDE" />
	<meta property="og:description" content="Mission control for agent management. View agents needing attention, input requests, and review queues." />
	<meta property="og:image" content="/favicons/triage.svg" />
	<link rel="icon" href="/favicons/triage.svg" />
	<!-- Load distinctive fonts -->
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
</svelte:head>

<!-- Mission Control Interface -->
<div
	class="triage-bg min-h-screen relative overflow-hidden"
	style="font-family: 'JetBrains Mono', monospace;"
>
	<!-- Subtle grid overlay -->
	<div class="triage-grid-overlay absolute inset-0 pointer-events-none opacity-[0.03]"></div>

	<!-- Scan line effect -->
	<div class="triage-scanlines absolute inset-0 pointer-events-none opacity-[0.02]"></div>

	<div class="relative z-10 p-6 max-w-7xl mx-auto">
		<!-- Header -->
		<header class="mb-8">
			<div class="flex items-center justify-between">
				<div>
					<h1
						class="triage-title text-3xl font-bold tracking-tight"
						style="font-family: 'Space Grotesk', sans-serif;"
					>
						TRIAGE QUEUE
					</h1>
					<p class="triage-text-muted mt-1 text-sm tracking-wide">
						Agent Dispatch Control
					</p>
				</div>

				<!-- Status indicator -->
				<div class="triage-status-container flex items-center gap-3 px-4 py-2 rounded-lg">
					{#if isLoading}
						<div class="triage-spinner w-3 h-3 border-2 rounded-full animate-spin"></div>
						<span class="triage-status-scanning text-sm font-medium">
							SCANNING
						</span>
					{:else if totalNeedingAttention > 0}
						<div class="relative">
							<div class="triage-status-awaiting-dot w-3 h-3 rounded-full animate-pulse"></div>
						</div>
						<span class="triage-status-awaiting text-sm font-medium">
							{totalNeedingAttention} AWAITING
						</span>
					{:else}
						<div class="triage-status-clear-dot w-3 h-3 rounded-full"></div>
						<span class="triage-status-clear text-sm font-medium">
							ALL CLEAR
						</span>
					{/if}
				</div>
			</div>
		</header>

		{#if isLoading}
			<TriageSkeleton cards={4} />
		{:else if error}
			<!-- Error state -->
			<div class="triage-error p-6 rounded-lg text-center">
				<p>{error}</p>
				<button
					onclick={() => { isLoading = true; fetchSessions(); }}
					class="triage-error-btn mt-4 px-4 py-2 rounded text-sm font-medium transition-all hover:scale-105"
				>
					Retry
				</button>
			</div>
		{:else}
			<!-- Needs Input Section (Orange - Highest Priority) -->
			{#if needsInputSessions.length > 0}
				<section class="mb-8">
					<div class="flex items-center gap-3 mb-4">
						<div class="triage-input-accent-bar w-2 h-8 rounded-full"></div>
						<h2 class="triage-input-header text-lg font-semibold tracking-wide">
							NEEDS INPUT
						</h2>
						<span class="triage-input-count px-2 py-0.5 rounded text-xs font-bold">
							{needsInputSessions.length}
						</span>
					</div>

					<div class="grid gap-4">
						{#each needsInputSessions as session (session.sessionName)}
							{@const isExpanded = expandedSession === session.sessionName}
							<div class="triage-input-card group relative rounded-xl overflow-hidden transition-all duration-300">
								<!-- Glowing accent bar -->
								<div class="triage-input-card-accent absolute left-0 top-0 bottom-0 w-1"></div>

								<!-- Summary header (clickable) -->
								<button
									onclick={() => toggleExpand(session.sessionName)}
									class="w-full p-5 pl-6 text-left transition-all hover:bg-white/5"
								>
									<!-- Header row -->
									<div class="flex items-start justify-between mb-3">
										<div class="flex items-center gap-3">
											<!-- Pulsing indicator -->
											<div class="relative">
												<div class="triage-input-dot w-2.5 h-2.5 rounded-full animate-pulse"></div>
											</div>
											<span class="triage-agent-name font-semibold text-base">
												{session.agentName}
											</span>
											{#if session.task}
												<span class="triage-task-id px-2 py-0.5 rounded text-xs font-mono">
													{session.task.id}
												</span>
											{/if}
										</div>

										<!-- Expand/collapse indicator -->
										<div class="flex items-center gap-2">
											<span class="triage-input-respond px-2 py-1 rounded text-xs font-medium">
												{isExpanded ? 'COLLAPSE' : 'RESPOND'}
											</span>
											<svg
												class="triage-input-chevron w-4 h-4 transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
											</svg>
										</div>
									</div>

									<!-- Task title -->
									{#if session.task?.title}
										<p class="triage-task-title text-sm mb-3 truncate">
											{session.task.title}
										</p>
									{/if}

									<!-- Question excerpt (only when collapsed) -->
									{#if !isExpanded && session._question}
										<div class="triage-input-question p-3 rounded-lg text-sm">
											<span class="triage-input-question-icon">❓</span>
											{session._question}
										</div>
									{/if}
								</button>

								<!-- Expanded SessionCard - Fixed height so SessionCard's internal scroll works -->
								{#if isExpanded}
									<div class="triage-input-expanded border-t px-2 pb-2" style="height: 60vh;">
										<SessionCard
											sessionName={session.sessionName}
											agentName={session.agentName}
											task={session.task}
											lastCompletedTask={session.lastCompletedTask}
											output={session.output}
											lineCount={session.lineCount}
											tokens={session.tokens}
											cost={session.cost}
											onKillSession={() => handleKillSession(session.sessionName)}
											onInterrupt={() => handleInterrupt(session.sessionName)}
											onSendInput={(input, type) => handleSendInput(session.sessionName, input, type)}
											onAttachTerminal={() => handleAttachTerminal(session.sessionName)}
										/>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Ready for Review Section (Yellow) -->
			{#if readyForReviewSessions.length > 0}
				<section class="mb-8">
					<div class="flex items-center gap-3 mb-4">
						<div class="triage-review-accent-bar w-2 h-8 rounded-full"></div>
						<h2 class="triage-review-header text-lg font-semibold tracking-wide">
							READY FOR REVIEW
						</h2>
						<span class="triage-review-count px-2 py-0.5 rounded text-xs font-bold">
							{readyForReviewSessions.length}
						</span>
					</div>

					<div class="grid gap-4">
						{#each readyForReviewSessions as session (session.sessionName)}
							{@const isExpanded = expandedSession === session.sessionName}
							<div class="triage-review-card group relative rounded-xl overflow-hidden transition-all duration-300">
								<!-- Accent bar -->
								<div class="triage-review-card-accent absolute left-0 top-0 bottom-0 w-1"></div>

								<!-- Summary header (clickable) -->
								<button
									onclick={() => toggleExpand(session.sessionName)}
									class="w-full p-5 pl-6 text-left transition-all hover:bg-white/5"
								>
									<!-- Header row -->
									<div class="flex items-start justify-between mb-3">
										<div class="flex items-center gap-3">
											<span class="text-lg">🔍</span>
											<span class="triage-agent-name font-semibold text-base">
												{session.agentName}
											</span>
											{#if session.task}
												<span class="triage-task-id px-2 py-0.5 rounded text-xs font-mono">
													{session.task.id}
												</span>
											{/if}
										</div>

										<!-- Expand/collapse indicator -->
										<div class="flex items-center gap-2">
											<span class="triage-review-btn px-2 py-1 rounded text-xs font-medium">
												{isExpanded ? 'COLLAPSE' : 'REVIEW'}
											</span>
											<svg
												class="triage-review-chevron w-4 h-4 transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
											</svg>
										</div>
									</div>

									<!-- Task title -->
									{#if session.task?.title}
										<p class="triage-task-title text-sm mb-3 truncate">
											{session.task.title}
										</p>
									{/if}

									<!-- Changes summary (only when collapsed) -->
									{#if !isExpanded && session._changes}
										<div class="triage-review-summary p-3 rounded-lg text-sm">
											{session._changes}
										</div>
									{/if}
								</button>

								<!-- Expanded SessionCard -->
								{#if isExpanded}
									<div class="triage-review-expanded border-t px-2 pb-2" style="height: 60vh;">
										<SessionCard
											sessionName={session.sessionName}
											agentName={session.agentName}
											task={session.task}
											lastCompletedTask={session.lastCompletedTask}
											output={session.output}
											lineCount={session.lineCount}
											tokens={session.tokens}
											cost={session.cost}
											onKillSession={() => handleKillSession(session.sessionName)}
											onInterrupt={() => handleInterrupt(session.sessionName)}
											onSendInput={(input, type) => handleSendInput(session.sessionName, input, type)}
											onAttachTerminal={() => handleAttachTerminal(session.sessionName)}
										/>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Empty state when no agents need attention -->
			{#if totalNeedingAttention === 0}
				<div class="triage-empty flex flex-col items-center justify-center py-16 rounded-xl">
					<div class="triage-empty-icon w-16 h-16 rounded-full flex items-center justify-center mb-4">
						<span class="text-3xl">✓</span>
					</div>
					<h3 class="triage-empty-title text-xl font-semibold mb-2">
						All Clear
					</h3>
					<p class="triage-text-muted text-sm">
						No agents need attention right now
					</p>
				</div>
			{/if}

			<!-- Working Quietly Section (Collapsible) -->
			{#if workingSessions.length > 0}
				<section class="mt-8">
					<button
						onclick={() => showWorking = !showWorking}
						class="flex items-center gap-3 mb-4 group"
					>
						<div class="bg-info w-2 h-6 rounded-full transition-all"></div>
						<h2 class="text-base-content/60 text-sm font-medium tracking-wide">
							WORKING QUIETLY
						</h2>
						<span class="bg-base-content/[0.18] text-base-content/60 px-2 py-0.5 rounded text-xs">
							{workingSessions.length}
						</span>
						<svg
							class="text-base-content/50 w-4 h-4 transition-transform {showWorking ? 'rotate-180' : ''}"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
						</svg>
					</button>

					{#if showWorking}
						<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
							{#each workingSessions as session (session.sessionName)}
								<button
									onclick={() => toggleExpand(session.sessionName)}
									class="bg-base-200 border border-base-content/[0.18] p-3 rounded-lg text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
								>
									<div class="flex items-center gap-2 mb-1">
										<div class="bg-info w-1.5 h-1.5 rounded-full"></div>
										<span class="text-base-content/85 text-sm font-medium truncate">
											{session.agentName}
										</span>
									</div>
									{#if session.task}
										<p class="text-base-content/55 text-xs truncate">
											{session.task.title || session.task.id}
										</p>
									{/if}
								</button>
							{/each}
						</div>

						<!-- Expanded SessionCard for working session (if any) -->
						{#each workingSessions as session (session.sessionName)}
							{#if expandedSession === session.sessionName}
								<div class="bg-base-300/60 border border-info/25 mt-4 rounded-xl overflow-hidden" style="height: 60vh;">
									<div class="p-2">
										<SessionCard
											sessionName={session.sessionName}
											agentName={session.agentName}
											task={session.task}
											lastCompletedTask={session.lastCompletedTask}
											output={session.output}
											lineCount={session.lineCount}
											tokens={session.tokens}
											cost={session.cost}
											onKillSession={() => handleKillSession(session.sessionName)}
											onInterrupt={() => handleInterrupt(session.sessionName)}
											onSendInput={(input, type) => handleSendInput(session.sessionName, input, type)}
											onAttachTerminal={() => handleAttachTerminal(session.sessionName)}
										/>
									</div>
									<button
										onclick={() => expandedSession = null}
										class="text-base-content/60 border-t border-base-content/[0.18] w-full py-2 text-xs font-medium transition-all hover:bg-white/5"
									>
										COLLAPSE
									</button>
								</div>
							{/if}
						{/each}
					{/if}
				</section>
			{/if}

			<!-- Idle/Completed Section -->
			{#if idleSessions.length > 0}
				<section class="mt-6">
					<div class="flex items-center gap-3 mb-3">
						<div class="bg-base-content/30 w-2 h-5 rounded-full"></div>
						<h2 class="text-base-content/50 text-sm font-medium tracking-wide">
							IDLE
						</h2>
						<span class="bg-base-content/[0.15] text-base-content/50 px-2 py-0.5 rounded text-xs">
							{idleSessions.length}
						</span>
					</div>

					<div class="flex flex-wrap gap-2">
						{#each idleSessions as session (session.sessionName)}
							<button
								onclick={() => toggleExpand(session.sessionName)}
								class="bg-base-200 text-base-content/60 border border-base-content/[0.15] px-3 py-1.5 rounded text-xs transition-all hover:scale-105"
							>
								{session.agentName}
							</button>
						{/each}
					</div>

					<!-- Expanded SessionCard for idle session -->
					{#each idleSessions as session (session.sessionName)}
						{#if expandedSession === session.sessionName}
							<div class="bg-base-300/40 border border-base-content/[0.15] mt-4 rounded-xl overflow-hidden" style="height: 60vh;">
								<div class="p-2">
									<SessionCard
										sessionName={session.sessionName}
										agentName={session.agentName}
										task={session.task}
										lastCompletedTask={session.lastCompletedTask}
										output={session.output}
										lineCount={session.lineCount}
										tokens={session.tokens}
										cost={session.cost}
										onKillSession={() => handleKillSession(session.sessionName)}
										onInterrupt={() => handleInterrupt(session.sessionName)}
										onSendInput={(input, type) => handleSendInput(session.sessionName, input, type)}
										onAttachTerminal={() => handleAttachTerminal(session.sessionName)}
									/>
								</div>
								<button
									onclick={() => expandedSession = null}
									class="text-base-content/60 border-t border-base-content/[0.18] w-full py-2 text-xs font-medium transition-all hover:bg-white/5"
								>
									COLLAPSE
								</button>
							</div>
						{/if}
					{/each}
				</section>
			{/if}
		{/if}
	</div>
</div>

<style>
	/* Custom animations */
	@keyframes pulse-glow {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}

	/* === TRIAGE PAGE THEMED STYLES === */
	/* NOTE: Classes retained here use color-mix for gradients, box-shadows,
	   or other patterns that cannot be expressed with Tailwind opacity classes.
	   Simple text/bg/border opacity patterns were moved to inline Tailwind classes. */

	/* Mission control background gradient - mixing two semantic colors */
	.triage-bg {
		background: linear-gradient(
			135deg,
			color-mix(in oklch, var(--color-base-300) 80%, var(--color-info) 20%) 0%,
			var(--color-base-300) 50%,
			color-mix(in oklch, var(--color-base-300) 85%, var(--color-info) 15%) 100%
		);
	}

	/* Grid overlay - color-mix in gradient */
	.triage-grid-overlay {
		background-image:
			linear-gradient(color-mix(in oklch, var(--color-info) 70%, transparent) 1px, transparent 1px),
			linear-gradient(90deg, color-mix(in oklch, var(--color-info) 70%, transparent) 1px, transparent 1px);
		background-size: 40px 40px;
	}

	/* Scan line effect - color-mix in repeating gradient */
	.triage-scanlines {
		background: repeating-linear-gradient(
			0deg,
			transparent,
			transparent 2px,
			color-mix(in oklch, var(--color-info) 10%, transparent) 2px,
			color-mix(in oklch, var(--color-info) 10%, transparent) 4px
		);
	}

	/* Title styling - text-shadow with color-mix */
	.triage-title {
		text-shadow: 0 0 30px color-mix(in oklch, var(--color-info) 30%, transparent);
	}

	/* Spinner */
	.triage-spinner {
		border-color: var(--color-info);
		border-top-color: transparent;
	}

	/* === NEEDS INPUT (WARNING) SECTION === */

	/* Needs input accent bar - gradient mixing two colors */
	.triage-input-accent-bar {
		background: linear-gradient(180deg, var(--color-warning), color-mix(in oklch, var(--color-warning) 75%, var(--color-error) 25%));
	}

	/* Needs input card - gradient mixing two colors + box-shadow */
	.triage-input-card {
		background: linear-gradient(
			135deg,
			color-mix(in oklch, var(--color-warning) 25%, var(--color-base-300)) 0%,
			color-mix(in oklch, var(--color-warning) 15%, var(--color-base-300)) 100%
		);
		border: 1px solid color-mix(in oklch, var(--color-warning) 40%, transparent);
		box-shadow:
			0 4px 20px color-mix(in oklch, var(--color-warning) 10%, transparent),
			inset 0 1px 0 color-mix(in oklch, var(--color-warning) 10%, transparent);
	}

	/* Needs input card accent bar - gradient with box-shadow */
	.triage-input-card-accent {
		background: linear-gradient(180deg, var(--color-warning), color-mix(in oklch, var(--color-warning) 80%, transparent));
		box-shadow: 0 0 15px color-mix(in oklch, var(--color-warning) 60%, transparent);
	}

	/* Needs input pulsing dot - box-shadow */
	.triage-input-dot {
		background: var(--color-warning);
		box-shadow: 0 0 10px var(--color-warning);
	}

	/* === READY FOR REVIEW (SECONDARY) SECTION === */

	/* Review accent bar - gradient with color-mix */
	.triage-review-accent-bar {
		background: linear-gradient(180deg, var(--color-secondary), color-mix(in oklch, var(--color-secondary) 70%, transparent));
	}

	/* Review card - gradient mixing two colors + box-shadow */
	.triage-review-card {
		background: linear-gradient(
			135deg,
			color-mix(in oklch, var(--color-secondary) 20%, var(--color-base-300)) 0%,
			color-mix(in oklch, var(--color-secondary) 10%, var(--color-base-300)) 100%
		);
		border: 1px solid color-mix(in oklch, var(--color-secondary) 35%, transparent);
		box-shadow:
			0 4px 20px color-mix(in oklch, var(--color-secondary) 8%, transparent),
			inset 0 1px 0 color-mix(in oklch, var(--color-secondary) 10%, transparent);
	}

	/* Review card accent bar - gradient with color-mix */
	.triage-review-card-accent {
		background: linear-gradient(180deg, var(--color-secondary), color-mix(in oklch, var(--color-secondary) 75%, transparent));
	}

	/* === EMPTY STATE === */

	/* Empty state container - gradient mixing two colors */
	.triage-empty {
		background: linear-gradient(
			135deg,
			color-mix(in oklch, var(--color-success) 15%, var(--color-base-300)) 0%,
			color-mix(in oklch, var(--color-success) 8%, var(--color-base-300)) 100%
		);
		border: 1px solid color-mix(in oklch, var(--color-success) 25%, transparent);
	}

	/* === STATUS INDICATOR === */

	/* Status awaiting dot - box-shadow */
	.triage-status-awaiting-dot {
		background: var(--color-warning);
		box-shadow: 0 0 12px var(--color-warning);
	}
</style>
