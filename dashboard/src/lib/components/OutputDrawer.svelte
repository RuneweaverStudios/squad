<script lang="ts">
	/**
	 * OutputDrawer Component
	 * Global slide-out drawer showing combined output from all active Claude Code sessions.
	 *
	 * Features:
	 * - Collapsible sections per session
	 * - Auto-scroll with pause toggle
	 * - Polls all sessions every 500ms when open
	 * - Persists open/closed state in localStorage
	 */

	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { slide } from 'svelte/transition';

	// Drawer open state
	let isOpen = $state(false);

	// Session data
	interface SessionOutput {
		name: string;
		agentName: string;
		output: string;
		lineCount: number;
		lastUpdated: string;
		collapsed: boolean;
	}
	let sessions = $state<SessionOutput[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	// Auto-scroll state
	let autoScroll = $state(true);
	let scrollContainerRef: HTMLDivElement | null = null;

	// Polling interval reference
	let pollInterval: ReturnType<typeof setInterval> | null = null;

	// Load persisted state from localStorage
	onMount(() => {
		if (browser) {
			const persisted = localStorage.getItem('output-drawer-open');
			if (persisted === 'true') {
				isOpen = true;
			}

			// Load collapsed state per session
			const collapsedState = localStorage.getItem('output-drawer-collapsed');
			if (collapsedState) {
				try {
					const parsed = JSON.parse(collapsedState);
					// Will apply when sessions load
				} catch (e) {
					// Ignore parse errors
				}
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
					const outputResponse = await fetch(`/api/sessions/${session.name}/output?lines=50`);
					const outputData = await outputResponse.json();

					// Find existing session to preserve collapsed state
					const existing = sessions.find(s => s.name === session.name);

					return {
						name: session.name,
						agentName: session.name.replace('jat-', ''),
						output: outputData.success ? outputData.output : '',
						lineCount: outputData.success ? outputData.lineCount : 0,
						lastUpdated: new Date().toISOString(),
						collapsed: existing?.collapsed ?? false
					};
				} catch (e) {
					// Return empty output on error
					const existing = sessions.find(s => s.name === session.name);
					return {
						name: session.name,
						agentName: session.name.replace('jat-', ''),
						output: '',
						lineCount: 0,
						lastUpdated: new Date().toISOString(),
						collapsed: existing?.collapsed ?? false
					};
				}
			});

			const results = await Promise.all(outputPromises);
			sessions = results;
			error = null;

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
		isOpen = !isOpen;
	}

	// Toggle session collapsed state
	function toggleSession(sessionName: string) {
		sessions = sessions.map(s => {
			if (s.name === sessionName) {
				return { ...s, collapsed: !s.collapsed };
			}
			return s;
		});

		// Persist collapsed state
		if (browser) {
			const collapsedState: Record<string, boolean> = {};
			sessions.forEach(s => {
				collapsedState[s.name] = s.collapsed;
			});
			localStorage.setItem('output-drawer-collapsed', JSON.stringify(collapsedState));
		}
	}

	// Toggle auto-scroll
	function toggleAutoScroll() {
		autoScroll = !autoScroll;
	}

	// Expand all sessions
	function expandAll() {
		sessions = sessions.map(s => ({ ...s, collapsed: false }));
	}

	// Collapse all sessions
	function collapseAll() {
		sessions = sessions.map(s => ({ ...s, collapsed: true }));
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
				<!-- Expand/Collapse All -->
				<button
					onclick={expandAll}
					class="btn btn-xs btn-ghost"
					title="Expand All"
					style="color: oklch(0.55 0.02 250);"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
					</svg>
				</button>
				<button
					onclick={collapseAll}
					class="btn btn-xs btn-ghost"
					title="Collapse All"
					style="color: oklch(0.55 0.02 250);"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
					</svg>
				</button>

				<div class="divider divider-horizontal mx-0"></div>

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

		<!-- Content -->
		<div
			bind:this={scrollContainerRef}
			class="flex-1 overflow-y-auto p-2"
			style="background: oklch(0.12 0.01 250);"
		>
			{#if error}
				<div class="alert alert-error m-2">
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
			{:else}
				<!-- Session Sections -->
				{#each sessions as session (session.name)}
					<div
						class="mb-2 rounded-lg overflow-hidden"
						style="background: oklch(0.16 0.01 250); border: 1px solid oklch(0.25 0.02 250);"
					>
						<!-- Session Header -->
						<button
							onclick={() => toggleSession(session.name)}
							class="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-opacity-80 transition-colors"
							style="background: oklch(0.20 0.01 250);"
						>
							<div class="flex items-center gap-2">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="w-4 h-4 transition-transform"
									class:rotate-90={!session.collapsed}
									style="color: oklch(0.55 0.02 250);"
								>
									<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
								</svg>
								<span class="font-mono text-sm font-semibold" style="color: oklch(0.80 0.15 200);">
									{session.agentName}
								</span>
							</div>
							<span class="text-xs font-mono" style="color: oklch(0.45 0.02 250);">
								{session.lineCount} lines
							</span>
						</button>

						<!-- Session Output -->
						{#if !session.collapsed}
							<div
								class="p-2 overflow-x-auto"
								transition:slide={{ duration: 150 }}
							>
								<pre
									class="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed"
									style="color: oklch(0.70 0.02 250);"
								>{session.output || 'No output yet...'}</pre>
							</div>
						{/if}
					</div>
				{/each}
			{/if}
		</div>

		<!-- Footer -->
		<div
			class="flex items-center justify-between px-4 py-2 border-t text-xs font-mono"
			style="background: oklch(0.18 0.01 250); border-color: oklch(0.30 0.02 250); color: oklch(0.45 0.02 250);"
		>
			<span>Polling: 500ms</span>
			<span>{autoScroll ? 'Auto-scroll ON' : 'Auto-scroll paused'}</span>
		</div>
	</div>
{/if}
