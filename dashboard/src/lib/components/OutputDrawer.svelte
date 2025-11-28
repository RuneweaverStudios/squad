<script lang="ts">
	/**
	 * OutputDrawer Component
	 * Global slide-out drawer showing output from active Claude Code sessions.
	 *
	 * Features:
	 * - Tab bar for session selection (horizontal scrollable)
	 * - Single session view (no collapsing, cleaner UI)
	 * - Auto-scroll with pause toggle
	 * - Polls all sessions every 500ms when open
	 * - Syncs selected session with store for targeting
	 * - Persists open/closed state in localStorage
	 */

	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { slide } from 'svelte/transition';
	import {
		isOutputDrawerOpen,
		toggleOutputDrawer,
		selectedOutputSession,
		clearOutputSessionSelection
	} from '$lib/stores/drawerStore';

	// Drawer open state - synced with store
	let isOpen = $state(false);

	// Selected session - synced with store (null = auto-select first)
	let selectedSession = $state<string | null>(null);

	// Sync open state with store
	$effect(() => {
		const unsubscribe = isOutputDrawerOpen.subscribe(value => {
			isOpen = value;
		});
		return unsubscribe;
	});

	// Sync selected session with store
	$effect(() => {
		const unsubscribe = selectedOutputSession.subscribe(value => {
			if (value) {
				selectedSession = value;
			}
		});
		return unsubscribe;
	});

	// Session data
	interface SessionOutput {
		name: string;
		agentName: string;
		output: string;
		lineCount: number;
		lastUpdated: string;
	}
	let sessions = $state<SessionOutput[]>([]);
	let error = $state<string | null>(null);

	// Auto-scroll state
	let autoScroll = $state(true);
	let scrollContainerRef: HTMLDivElement | null = null;

	// Polling interval reference
	let pollInterval: ReturnType<typeof setInterval> | null = null;

	// Get currently selected session data
	const currentSession = $derived(() => {
		if (!sessions.length) return null;
		// If selected session exists in sessions, return it
		const found = sessions.find(s => s.name === selectedSession);
		if (found) return found;
		// Otherwise return first session (auto-select)
		return sessions[0];
	});

	// Load persisted state from localStorage
	onMount(() => {
		if (browser) {
			const persisted = localStorage.getItem('output-drawer-open');
			if (persisted === 'true') {
				isOutputDrawerOpen.set(true);
			}
		}
	});

	// Save open state when it changes
	$effect(() => {
		if (browser) {
			localStorage.setItem('output-drawer-open', String(isOpen));
		}
	});

	// Start/stop polling based on open state
	$effect(() => {
		if (isOpen) {
			// Initial fetch
			fetchAllSessions();
			// Start polling
			pollInterval = setInterval(fetchAllSessions, 500);
		} else {
			// Stop polling
			if (pollInterval) {
				clearInterval(pollInterval);
				pollInterval = null;
			}
		}
	});

	// Handle selected session disappearing
	$effect(() => {
		if (selectedSession && sessions.length > 0) {
			const exists = sessions.some(s => s.name === selectedSession);
			if (!exists) {
				// Selected session disappeared, auto-select first
				selectedSession = sessions[0]?.name || null;
				selectedOutputSession.set(selectedSession);
			}
		}
	});

	// Cleanup on unmount
	onDestroy(() => {
		if (pollInterval) {
			clearInterval(pollInterval);
		}
	});

	// Fetch all active sessions and their output
	async function fetchAllSessions() {
		try {
			// First get list of sessions
			const sessionsResponse = await fetch('/api/sessions?filter=jat');
			const sessionsData = await sessionsResponse.json();

			if (!sessionsData.success || !sessionsData.sessions?.length) {
				sessions = [];
				return;
			}

			// Fetch output for each session in parallel
			const outputPromises = sessionsData.sessions.map(async (session: { name: string }) => {
				try {
					const outputResponse = await fetch(`/api/sessions/${session.name}/output?lines=100`);
					const outputData = await outputResponse.json();

					return {
						name: session.name,
						agentName: session.name.replace('jat-', ''),
						output: outputData.success ? outputData.output : '',
						lineCount: outputData.success ? outputData.lineCount : 0,
						lastUpdated: new Date().toISOString()
					};
				} catch (e) {
					return {
						name: session.name,
						agentName: session.name.replace('jat-', ''),
						output: '',
						lineCount: 0,
						lastUpdated: new Date().toISOString()
					};
				}
			});

			const results = await Promise.all(outputPromises);
			sessions = results;
			error = null;

			// Auto-select first session if none selected
			if (!selectedSession && sessions.length > 0) {
				selectedSession = sessions[0].name;
				selectedOutputSession.set(selectedSession);
			}

			// Auto-scroll to bottom if enabled
			if (autoScroll && scrollContainerRef) {
				requestAnimationFrame(() => {
					if (scrollContainerRef) {
						scrollContainerRef.scrollTop = scrollContainerRef.scrollHeight;
					}
				});
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to fetch sessions';
		}
	}

	// Toggle drawer open/closed
	function toggleDrawer() {
		toggleOutputDrawer();
	}

	// Select a session
	function selectSession(sessionName: string) {
		selectedSession = sessionName;
		selectedOutputSession.set(sessionName);
	}

	// Toggle auto-scroll
	function toggleAutoScroll() {
		autoScroll = !autoScroll;
	}

	// Input state
	let inputText = $state('');
	let sendingInput = $state(false);

	// Send input to selected session
	async function sendInput(type: 'text' | 'ctrl-c' | 'raw' = 'text') {
		if (type === 'text' && !inputText.trim()) return;
		const target = currentSession();
		if (!target) return;

		sendingInput = true;

		try {
			const body = type === 'ctrl-c'
				? { type: 'ctrl-c' }
				: { type, input: inputText };

			await fetch(`/api/sessions/${target.name}/input`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			// Clear input after sending
			if (type === 'text') {
				inputText = '';
			}
		} catch (e) {
			console.error('Failed to send input:', e);
		} finally {
			sendingInput = false;
		}
	}

	// Quick send "1" (Yes)
	async function sendYes() {
		inputText = '1';
		await sendInput('text');
	}

	// Handle Enter key in input
	function handleInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendInput('text');
		}
	}
</script>

<!-- Toggle Button (always visible) -->
<button
	onclick={toggleDrawer}
	class="fixed right-0 top-1/2 -translate-y-1/2 z-40 btn btn-sm h-auto py-4 rounded-l-lg rounded-r-none"
	style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.35 0.02 250); border-right: none; writing-mode: vertical-rl; text-orientation: mixed;"
	title={isOpen ? 'Close Output Panel' : 'Open Output Panel'}
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		fill="none"
		viewBox="0 0 24 24"
		stroke-width="1.5"
		stroke="currentColor"
		class="w-4 h-4 mb-1"
		style="color: oklch(0.70 0.18 240);"
	>
		<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
	</svg>
	<span class="text-xs font-mono" style="color: oklch(0.65 0.02 250);">OUTPUT</span>
	{#if sessions.length > 0}
		<span class="badge badge-sm mt-1" style="background: oklch(0.35 0.15 240); color: oklch(0.90 0.02 250);">{sessions.length}</span>
	{/if}
</button>

<!-- Drawer Panel -->
{#if isOpen}
	<div
		class="fixed right-0 top-0 h-screen w-[500px] z-50 flex flex-col shadow-2xl"
		style="background: oklch(0.14 0.01 250); border-left: 1px solid oklch(0.30 0.02 250);"
		transition:slide={{ axis: 'x', duration: 200 }}
	>
		<!-- Header -->
		<div
			class="flex items-center justify-between px-4 py-3 border-b"
			style="background: oklch(0.18 0.01 250); border-color: oklch(0.30 0.02 250);"
		>
			<div class="flex items-center gap-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-5 h-5"
					style="color: oklch(0.70 0.18 240);"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
				</svg>
				<h2 class="font-mono text-sm font-semibold" style="color: oklch(0.85 0.02 250);">
					Session Output
				</h2>
				<span class="badge badge-sm" style="background: oklch(0.25 0.02 250); color: oklch(0.60 0.02 250);">
					{sessions.length} active
				</span>
			</div>

			<div class="flex items-center gap-1">
				<!-- Auto-scroll toggle -->
				<button
					onclick={toggleAutoScroll}
					class="btn btn-xs"
					class:btn-primary={autoScroll}
					class:btn-ghost={!autoScroll}
					title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
					</svg>
				</button>

				<!-- Close button -->
				<button
					onclick={toggleDrawer}
					class="btn btn-xs btn-ghost"
					title="Close"
					style="color: oklch(0.55 0.02 250);"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		</div>

		<!-- Tab Bar -->
		{#if sessions.length > 0}
			<div
				class="flex gap-1 px-2 py-2 overflow-x-auto border-b"
				style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250);"
			>
				{#each sessions as session (session.name)}
					<button
						onclick={() => selectSession(session.name)}
						class="flex-shrink-0 px-3 py-1.5 rounded-md font-mono text-xs transition-all"
						class:active-tab={selectedSession === session.name}
						style={selectedSession === session.name
							? 'background: oklch(0.30 0.15 240); color: oklch(0.95 0.02 250);'
							: 'background: oklch(0.20 0.01 250); color: oklch(0.60 0.02 250); hover:background: oklch(0.25 0.02 250);'
						}
					>
						{session.agentName}
					</button>
				{/each}
			</div>
		{/if}

		<!-- Content -->
		<div
			bind:this={scrollContainerRef}
			class="flex-1 overflow-y-auto p-3"
			style="background: oklch(0.12 0.01 250);"
		>
			{#if error}
				<div class="alert alert-error">
					<span>{error}</span>
				</div>
			{:else if sessions.length === 0}
				<!-- Empty State -->
				<div class="flex flex-col items-center justify-center h-full text-center p-4">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1"
						stroke="currentColor"
						class="w-12 h-12 mb-3"
						style="color: oklch(0.35 0.02 250);"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
					</svg>
					<p class="text-sm font-mono" style="color: oklch(0.45 0.02 250);">
						No active sessions
					</p>
					<p class="text-xs mt-1" style="color: oklch(0.35 0.02 250);">
						Sessions will appear when agents start working
					</p>
				</div>
			{:else if currentSession()}
				<!-- Single Session Output -->
				<div class="rounded-lg p-3" style="background: oklch(0.16 0.01 250); border: 1px solid oklch(0.25 0.02 250);">
					<div class="flex items-center justify-between mb-2">
						<span class="font-mono text-sm font-semibold" style="color: oklch(0.80 0.15 200);">
							{currentSession()?.agentName}
						</span>
						<span class="text-xs font-mono" style="color: oklch(0.45 0.02 250);">
							{currentSession()?.lineCount} lines
						</span>
					</div>
					<pre
						class="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed"
						style="color: oklch(0.70 0.02 250);"
					>{currentSession()?.output || 'No output yet...'}</pre>
				</div>
			{/if}
		</div>

		<!-- Input Section -->
		<div
			class="border-t px-3 py-2"
			style="background: oklch(0.18 0.01 250); border-color: oklch(0.30 0.02 250);"
		>
			<!-- Target display + Quick actions -->
			<div class="flex items-center gap-2 mb-2">
				<div
					class="flex-1 px-2 py-1 rounded text-xs font-mono"
					style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.60 0.02 250);"
				>
					To: <span style="color: oklch(0.80 0.15 200);">{currentSession()?.agentName || 'No session'}</span>
				</div>

				<!-- Quick action buttons -->
				<button
					onclick={sendYes}
					class="btn btn-xs"
					style="background: oklch(0.30 0.10 150); border: none; color: oklch(0.95 0.02 250);"
					title="Send '1' (Yes) to answer prompts"
					disabled={sendingInput || !currentSession()}
				>
					Yes
				</button>
				<button
					onclick={() => sendInput('ctrl-c')}
					class="btn btn-xs"
					style="background: oklch(0.30 0.10 25); border: none; color: oklch(0.95 0.02 250);"
					title="Send Ctrl+C (interrupt)"
					disabled={sendingInput || !currentSession()}
				>
					Ctrl+C
				</button>
			</div>

			<!-- Text input -->
			<div class="flex gap-2">
				<input
					type="text"
					bind:value={inputText}
					onkeydown={handleInputKeydown}
					placeholder="Type message and press Enter..."
					class="input input-xs flex-1 font-mono"
					style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.80 0.02 250);"
					disabled={sendingInput || !currentSession()}
				/>
				<button
					onclick={() => sendInput('text')}
					class="btn btn-xs btn-primary"
					disabled={sendingInput || !inputText.trim() || !currentSession()}
				>
					{#if sendingInput}
						<span class="loading loading-spinner loading-xs"></span>
					{:else}
						Send
					{/if}
				</button>
			</div>
		</div>

		<!-- Footer -->
		<div
			class="flex items-center justify-between px-4 py-1 border-t text-xs font-mono"
			style="background: oklch(0.16 0.01 250); border-color: oklch(0.30 0.02 250); color: oklch(0.45 0.02 250);"
		>
			<span>Polling: 500ms</span>
			<span>{autoScroll ? 'Auto-scroll ON' : 'Auto-scroll paused'}</span>
		</div>
	</div>
{/if}

<style>
	.active-tab {
		box-shadow: 0 0 8px oklch(0.50 0.15 240 / 0.3);
	}
</style>
