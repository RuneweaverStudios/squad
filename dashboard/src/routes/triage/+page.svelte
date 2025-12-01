<script lang="ts">
	/**
	 * Triage Page - Mission Control for Agent Management
	 *
	 * A dispatch-style interface showing agents that need attention:
	 * - needs-input: Agent blocked, waiting for user clarification (orange)
	 * - ready-for-review: Agent finished work, awaiting review (yellow)
	 *
	 * Clicking a card expands it to show the full WorkCard inline (accordion style).
	 * Agents actively working are shown in a collapsed "working quietly" section.
	 */

	import { onMount, onDestroy } from 'svelte';
	import type { WorkSession } from '$lib/stores/workSessions.svelte.js';
	import WorkCard from '$lib/components/work/WorkCard.svelte';

	// State
	let sessions = $state<WorkSession[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let pollingInterval: ReturnType<typeof setInterval> | null = null;

	// Expanded session tracking (accordion style - only one at a time)
	let expandedSession = $state<string | null>(null);

	// Session state detection (mirrors WorkCard logic)
	type SessionState = 'working' | 'needs-input' | 'ready-for-review' | 'completed' | 'idle';

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

	// WorkCard action handlers
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

	async function handleSendInput(sessionName: string, input: string, type: 'text' | 'key') {
		try {
			const endpoint = type === 'key' ? '/api/work/key' : '/api/work/input';
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sessionName, input, key: input })
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
	<title>Triage | JAT Dashboard</title>
	<!-- Load distinctive fonts -->
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
</svelte:head>

<!-- Mission Control Interface -->
<div
	class="min-h-screen relative overflow-hidden"
	style="
		background: linear-gradient(135deg, oklch(0.13 0.02 260) 0%, oklch(0.10 0.015 250) 50%, oklch(0.12 0.02 240) 100%);
		font-family: 'JetBrains Mono', monospace;
	"
>
	<!-- Subtle grid overlay -->
	<div
		class="absolute inset-0 pointer-events-none opacity-[0.03]"
		style="
			background-image:
				linear-gradient(oklch(0.7 0.1 240) 1px, transparent 1px),
				linear-gradient(90deg, oklch(0.7 0.1 240) 1px, transparent 1px);
			background-size: 40px 40px;
		"
	></div>

	<!-- Scan line effect -->
	<div
		class="absolute inset-0 pointer-events-none opacity-[0.02]"
		style="
			background: repeating-linear-gradient(
				0deg,
				transparent,
				transparent 2px,
				oklch(0.5 0.1 240 / 0.1) 2px,
				oklch(0.5 0.1 240 / 0.1) 4px
			);
		"
	></div>

	<div class="relative z-10 p-6 max-w-7xl mx-auto">
		<!-- Header -->
		<header class="mb-8">
			<div class="flex items-center justify-between">
				<div>
					<h1
						class="text-3xl font-bold tracking-tight"
						style="
							font-family: 'Space Grotesk', sans-serif;
							color: oklch(0.92 0.02 250);
							text-shadow: 0 0 30px oklch(0.7 0.15 240 / 0.3);
						"
					>
						TRIAGE QUEUE
					</h1>
					<p class="mt-1 text-sm tracking-wide" style="color: oklch(0.55 0.02 250);">
						Agent Dispatch Control
					</p>
				</div>

				<!-- Status indicator -->
				<div
					class="flex items-center gap-3 px-4 py-2 rounded-lg"
					style="
						background: oklch(0.15 0.02 250);
						border: 1px solid oklch(0.25 0.02 250);
					"
				>
					{#if isLoading}
						<div
							class="w-3 h-3 border-2 rounded-full animate-spin"
							style="border-color: oklch(0.5 0.1 240); border-top-color: transparent;"
						></div>
						<span class="text-sm font-medium" style="color: oklch(0.55 0.02 250);">
							SCANNING
						</span>
					{:else if totalNeedingAttention > 0}
						<div class="relative">
							<div
								class="w-3 h-3 rounded-full animate-pulse"
								style="background: oklch(0.75 0.20 45); box-shadow: 0 0 12px oklch(0.75 0.20 45);"
							></div>
						</div>
						<span class="text-sm font-medium" style="color: oklch(0.85 0.15 45);">
							{totalNeedingAttention} AWAITING
						</span>
					{:else}
						<div class="w-3 h-3 rounded-full" style="background: oklch(0.65 0.20 145);"></div>
						<span class="text-sm font-medium" style="color: oklch(0.75 0.15 145);">
							ALL CLEAR
						</span>
					{/if}
				</div>
			</div>
		</header>

		{#if isLoading}
			<!-- Loading state -->
			<div class="flex items-center justify-center h-64">
				<div class="flex flex-col items-center gap-4">
					<div
						class="w-8 h-8 border-2 rounded-full animate-spin"
						style="border-color: oklch(0.7 0.15 240); border-top-color: transparent;"
					></div>
					<span class="text-sm" style="color: oklch(0.5 0.02 250);">Scanning sessions...</span>
				</div>
			</div>
		{:else if error}
			<!-- Error state -->
			<div
				class="p-6 rounded-lg text-center"
				style="background: oklch(0.20 0.05 30 / 0.3); border: 1px solid oklch(0.50 0.15 30);"
			>
				<p style="color: oklch(0.80 0.15 30);">{error}</p>
				<button
					onclick={() => { isLoading = true; fetchSessions(); }}
					class="mt-4 px-4 py-2 rounded text-sm font-medium transition-all hover:scale-105"
					style="background: oklch(0.50 0.15 30); color: oklch(0.95 0 0);"
				>
					Retry
				</button>
			</div>
		{:else}
			<!-- Needs Input Section (Orange - Highest Priority) -->
			{#if needsInputSessions.length > 0}
				<section class="mb-8">
					<div class="flex items-center gap-3 mb-4">
						<div
							class="w-2 h-8 rounded-full"
							style="background: linear-gradient(180deg, oklch(0.75 0.20 45), oklch(0.60 0.18 40));"
						></div>
						<h2 class="text-lg font-semibold tracking-wide" style="color: oklch(0.85 0.15 45);">
							NEEDS INPUT
						</h2>
						<span
							class="px-2 py-0.5 rounded text-xs font-bold"
							style="background: oklch(0.75 0.20 45 / 0.2); color: oklch(0.85 0.18 45);"
						>
							{needsInputSessions.length}
						</span>
					</div>

					<div class="grid gap-4">
						{#each needsInputSessions as session (session.sessionName)}
							{@const isExpanded = expandedSession === session.sessionName}
							<div
								class="group relative rounded-xl overflow-hidden transition-all duration-300"
								style="
									background: linear-gradient(135deg, oklch(0.18 0.03 45 / 0.4) 0%, oklch(0.15 0.02 40 / 0.3) 100%);
									border: 1px solid oklch(0.40 0.12 45 / 0.5);
									box-shadow:
										0 4px 20px oklch(0.75 0.20 45 / 0.1),
										inset 0 1px 0 oklch(0.75 0.20 45 / 0.1);
								"
							>
								<!-- Glowing accent bar -->
								<div
									class="absolute left-0 top-0 bottom-0 w-1"
									style="
										background: linear-gradient(180deg, oklch(0.80 0.22 50), oklch(0.65 0.18 40));
										box-shadow: 0 0 15px oklch(0.75 0.20 45 / 0.6);
									"
								></div>

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
												<div
													class="w-2.5 h-2.5 rounded-full animate-pulse"
													style="background: oklch(0.80 0.22 50); box-shadow: 0 0 10px oklch(0.80 0.22 50);"
												></div>
											</div>
											<span class="font-semibold text-base" style="color: oklch(0.92 0.02 250);">
												{session.agentName}
											</span>
											{#if session.task}
												<span
													class="px-2 py-0.5 rounded text-xs font-mono"
													style="background: oklch(0.25 0.02 250); color: oklch(0.70 0.02 250);"
												>
													{session.task.id}
												</span>
											{/if}
										</div>

										<!-- Expand/collapse indicator -->
										<div class="flex items-center gap-2">
											<span
												class="px-2 py-1 rounded text-xs font-medium"
												style="background: oklch(0.70 0.18 45 / 0.2); color: oklch(0.85 0.15 45);"
											>
												{isExpanded ? 'COLLAPSE' : 'RESPOND'}
											</span>
											<svg
												class="w-4 h-4 transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}"
												style="color: oklch(0.70 0.15 45);"
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
										<p class="text-sm mb-3 truncate" style="color: oklch(0.75 0.02 250);">
											{session.task.title}
										</p>
									{/if}

									<!-- Question excerpt (only when collapsed) -->
									{#if !isExpanded && session._question}
										<div
											class="p-3 rounded-lg text-sm"
											style="
												background: oklch(0.12 0.02 250 / 0.8);
												border-left: 2px solid oklch(0.70 0.18 45 / 0.5);
												color: oklch(0.80 0.02 250);
											"
										>
											<span style="color: oklch(0.70 0.15 45);">❓</span>
											{session._question}
										</div>
									{/if}
								</button>

								<!-- Expanded WorkCard -->
								{#if isExpanded}
									<div
										class="border-t px-2 pb-2"
										style="border-color: oklch(0.30 0.05 45 / 0.5); background: oklch(0.10 0.01 250 / 0.5);"
									>
										<WorkCard
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
						<div
							class="w-2 h-8 rounded-full"
							style="background: linear-gradient(180deg, oklch(0.80 0.18 85), oklch(0.65 0.15 80));"
						></div>
						<h2 class="text-lg font-semibold tracking-wide" style="color: oklch(0.85 0.12 85);">
							READY FOR REVIEW
						</h2>
						<span
							class="px-2 py-0.5 rounded text-xs font-bold"
							style="background: oklch(0.80 0.18 85 / 0.2); color: oklch(0.85 0.15 85);"
						>
							{readyForReviewSessions.length}
						</span>
					</div>

					<div class="grid gap-4">
						{#each readyForReviewSessions as session (session.sessionName)}
							{@const isExpanded = expandedSession === session.sessionName}
							<div
								class="group relative rounded-xl overflow-hidden transition-all duration-300"
								style="
									background: linear-gradient(135deg, oklch(0.18 0.03 85 / 0.3) 0%, oklch(0.15 0.02 80 / 0.2) 100%);
									border: 1px solid oklch(0.45 0.12 85 / 0.4);
									box-shadow:
										0 4px 20px oklch(0.80 0.18 85 / 0.08),
										inset 0 1px 0 oklch(0.80 0.18 85 / 0.1);
								"
							>
								<!-- Accent bar -->
								<div
									class="absolute left-0 top-0 bottom-0 w-1"
									style="background: linear-gradient(180deg, oklch(0.85 0.20 90), oklch(0.70 0.16 80));"
								></div>

								<!-- Summary header (clickable) -->
								<button
									onclick={() => toggleExpand(session.sessionName)}
									class="w-full p-5 pl-6 text-left transition-all hover:bg-white/5"
								>
									<!-- Header row -->
									<div class="flex items-start justify-between mb-3">
										<div class="flex items-center gap-3">
											<span class="text-lg">🔍</span>
											<span class="font-semibold text-base" style="color: oklch(0.92 0.02 250);">
												{session.agentName}
											</span>
											{#if session.task}
												<span
													class="px-2 py-0.5 rounded text-xs font-mono"
													style="background: oklch(0.25 0.02 250); color: oklch(0.70 0.02 250);"
												>
													{session.task.id}
												</span>
											{/if}
										</div>

										<!-- Expand/collapse indicator -->
										<div class="flex items-center gap-2">
											<span
												class="px-2 py-1 rounded text-xs font-medium"
												style="background: oklch(0.75 0.16 85 / 0.2); color: oklch(0.85 0.12 85);"
											>
												{isExpanded ? 'COLLAPSE' : 'REVIEW'}
											</span>
											<svg
												class="w-4 h-4 transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}"
												style="color: oklch(0.70 0.12 85);"
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
										<p class="text-sm mb-3 truncate" style="color: oklch(0.75 0.02 250);">
											{session.task.title}
										</p>
									{/if}

									<!-- Changes summary (only when collapsed) -->
									{#if !isExpanded && session._changes}
										<div
											class="p-3 rounded-lg text-sm"
											style="
												background: oklch(0.12 0.02 250 / 0.8);
												border-left: 2px solid oklch(0.70 0.14 85 / 0.5);
												color: oklch(0.80 0.02 250);
											"
										>
											{session._changes}
										</div>
									{/if}
								</button>

								<!-- Expanded WorkCard -->
								{#if isExpanded}
									<div
										class="border-t px-2 pb-2"
										style="border-color: oklch(0.35 0.05 85 / 0.5); background: oklch(0.10 0.01 250 / 0.5);"
									>
										<WorkCard
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
				<div
					class="flex flex-col items-center justify-center py-16 rounded-xl"
					style="
						background: linear-gradient(135deg, oklch(0.15 0.03 145 / 0.2) 0%, oklch(0.12 0.02 140 / 0.1) 100%);
						border: 1px solid oklch(0.35 0.08 145 / 0.3);
					"
				>
					<div
						class="w-16 h-16 rounded-full flex items-center justify-center mb-4"
						style="background: oklch(0.65 0.18 145 / 0.15); border: 2px solid oklch(0.65 0.18 145 / 0.3);"
					>
						<span class="text-3xl">✓</span>
					</div>
					<h3 class="text-xl font-semibold mb-2" style="color: oklch(0.80 0.12 145);">
						All Clear
					</h3>
					<p class="text-sm" style="color: oklch(0.55 0.02 250);">
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
						<div
							class="w-2 h-6 rounded-full transition-all"
							style="background: oklch(0.55 0.12 240);"
						></div>
						<h2 class="text-sm font-medium tracking-wide" style="color: oklch(0.55 0.02 250);">
							WORKING QUIETLY
						</h2>
						<span
							class="px-2 py-0.5 rounded text-xs"
							style="background: oklch(0.25 0.02 250); color: oklch(0.55 0.02 250);"
						>
							{workingSessions.length}
						</span>
						<svg
							class="w-4 h-4 transition-transform {showWorking ? 'rotate-180' : ''}"
							style="color: oklch(0.45 0.02 250);"
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
									class="p-3 rounded-lg text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
									style="
										background: oklch(0.15 0.02 250);
										border: 1px solid oklch(0.25 0.02 250);
									"
								>
									<div class="flex items-center gap-2 mb-1">
										<div
											class="w-1.5 h-1.5 rounded-full"
											style="background: oklch(0.60 0.15 240); box-shadow: 0 0 6px oklch(0.60 0.15 240);"
										></div>
										<span class="text-sm font-medium truncate" style="color: oklch(0.80 0.02 250);">
											{session.agentName}
										</span>
									</div>
									{#if session.task}
										<p class="text-xs truncate" style="color: oklch(0.50 0.02 250);">
											{session.task.title || session.task.id}
										</p>
									{/if}
								</button>
							{/each}
						</div>

						<!-- Expanded WorkCard for working session (if any) -->
						{#each workingSessions as session (session.sessionName)}
							{#if expandedSession === session.sessionName}
								<div
									class="mt-4 rounded-xl overflow-hidden"
									style="
										background: oklch(0.12 0.02 250);
										border: 1px solid oklch(0.30 0.05 240 / 0.5);
									"
								>
									<div class="p-2">
										<WorkCard
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
										class="w-full py-2 text-xs font-medium transition-all hover:bg-white/5"
										style="color: oklch(0.55 0.02 250); border-top: 1px solid oklch(0.25 0.02 250);"
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
						<div class="w-2 h-5 rounded-full" style="background: oklch(0.35 0.02 250);"></div>
						<h2 class="text-sm font-medium tracking-wide" style="color: oklch(0.40 0.02 250);">
							IDLE
						</h2>
						<span
							class="px-2 py-0.5 rounded text-xs"
							style="background: oklch(0.20 0.02 250); color: oklch(0.40 0.02 250);"
						>
							{idleSessions.length}
						</span>
					</div>

					<div class="flex flex-wrap gap-2">
						{#each idleSessions as session (session.sessionName)}
							<button
								onclick={() => toggleExpand(session.sessionName)}
								class="px-3 py-1.5 rounded text-xs transition-all hover:scale-105"
								style="
									background: oklch(0.15 0.01 250);
									border: 1px solid oklch(0.25 0.01 250);
									color: oklch(0.50 0.02 250);
								"
							>
								{session.agentName}
							</button>
						{/each}
					</div>

					<!-- Expanded WorkCard for idle session -->
					{#each idleSessions as session (session.sessionName)}
						{#if expandedSession === session.sessionName}
							<div
								class="mt-4 rounded-xl overflow-hidden"
								style="
									background: oklch(0.12 0.02 250);
									border: 1px solid oklch(0.25 0.02 250);
								"
							>
								<div class="p-2">
									<WorkCard
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
									class="w-full py-2 text-xs font-medium transition-all hover:bg-white/5"
									style="color: oklch(0.55 0.02 250); border-top: 1px solid oklch(0.25 0.02 250);"
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
</style>
