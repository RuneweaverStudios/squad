<script lang="ts">
	/**
	 * TerminalDrawer Component
	 * Global slide-out drawer for ad-hoc terminal sessions.
	 *
	 * Features:
	 * - Tab bar for terminal session selection
	 * - New tab button to spawn terminals
	 * - Terminal output display with auto-scroll
	 * - Text input with Enter to send
	 * - Keyboard shortcut: Ctrl+` to toggle (configured externally)
	 * - Persists open/closed state in localStorage
	 */

	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { slide, fade } from 'svelte/transition';
	import { ansiToHtml } from '$lib/utils/ansiToHtml';
	import { isTerminalDrawerOpen } from '$lib/stores/drawerStore';
	import TerminalInput from '$lib/components/work/TerminalInput.svelte';

	// State
	let isOpen = $state(false);
	let sessions = $state<
		Array<{
			name: string;
			displayName: string;
			output: string;
			lineCount: number;
			lastUpdated: string;
		}>
	>([]);
	let selectedSession = $state<string | null>(null);
	let error = $state<string | null>(null);
	let autoScroll = $state(true);
	let scrollContainerRef: HTMLDivElement | null = null;
	let inputText = $state('');
	let isCreatingSession = $state(false);
	let pollInterval: ReturnType<typeof setInterval> | null = null;
	let terminalInputRef: ReturnType<typeof TerminalInput> | null = null;

	// Get currently selected session data
	const currentSession = $derived(() => {
		if (!sessions.length) return null;
		const found = sessions.find((s) => s.name === selectedSession);
		if (found) return found;
		return sessions[0];
	});

	// Load persisted state and set up global listeners
	onMount(() => {
		if (browser) {
			// Subscribe to store to sync state (enables keyboard shortcut to work)
			const unsubscribe = isTerminalDrawerOpen.subscribe((value) => {
				isOpen = value;
			});

			// Also check localStorage for persisted state on initial load
			const persisted = localStorage.getItem('terminal-drawer-open');
			if (persisted === 'true' && !isOpen) {
				isOpen = true;
				isTerminalDrawerOpen.set(true);
			}

			// Add global keydown listener for Escape (capture phase to handle before other handlers)
			window.addEventListener('keydown', handleGlobalKeydown, true);

			return () => {
				unsubscribe();
				window.removeEventListener('keydown', handleGlobalKeydown, true);
			};
		}
	});

	// Save state changes to localStorage
	$effect(() => {
		if (browser) {
			localStorage.setItem('terminal-drawer-open', String(isOpen));
		}
	});

	// Fetch sessions and output when open
	$effect(() => {
		if (isOpen) {
			fetchSessions();
			// Poll for output updates
			pollInterval = setInterval(fetchSessionOutputs, 500);
		} else {
			if (pollInterval) {
				clearInterval(pollInterval);
				pollInterval = null;
			}
		}
	});

	// Auto-focus input when drawer opens
	$effect(() => {
		if (isOpen && terminalInputRef) {
			// Small delay to ensure DOM is ready after transition starts
			requestAnimationFrame(() => {
				terminalInputRef?.focus();
			});
		}
	});

	onDestroy(() => {
		if (pollInterval) {
			clearInterval(pollInterval);
		}
	});

	// Fetch list of terminal sessions
	async function fetchSessions() {
		try {
			const response = await fetch('/api/terminal');
			const data = await response.json();

			if (data.success) {
				// Preserve existing output when refreshing session list
				const existingOutputs = new Map(sessions.map((s) => [s.name, s.output]));

				sessions = data.sessions.map(
					(s: { name: string; displayName: string; created: string }) => ({
						name: s.name,
						displayName: s.displayName,
						output: existingOutputs.get(s.name) || '',
						lineCount: 0,
						lastUpdated: s.created || new Date().toISOString()
					})
				);

				// Auto-select first session if none selected
				if (!selectedSession && sessions.length > 0) {
					selectedSession = sessions[0].name;
				}

				// Fetch output for all sessions
				await fetchSessionOutputs();
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to fetch terminal sessions';
		}
	}

	// Fetch output for all sessions
	async function fetchSessionOutputs() {
		if (!sessions.length) return;

		try {
			const outputs = await Promise.all(
				sessions.map(async (session) => {
					try {
						const response = await fetch(
							`/api/sessions/${session.name}/output?lines=500&history=true`
						);
						const data = await response.json();
						return {
							name: session.name,
							output: data.success ? data.output : session.output,
							lineCount: data.success ? data.lineCount : session.lineCount
						};
					} catch {
						return {
							name: session.name,
							output: session.output,
							lineCount: session.lineCount
						};
					}
				})
			);

			// Update sessions with new output
			sessions = sessions.map((s) => {
				const updated = outputs.find((o) => o.name === s.name);
				if (updated) {
					return {
						...s,
						output: updated.output,
						lineCount: updated.lineCount,
						lastUpdated: new Date().toISOString()
					};
				}
				return s;
			});

			// Auto-scroll if enabled
			if (autoScroll && scrollContainerRef) {
				requestAnimationFrame(() => {
					if (scrollContainerRef) {
						scrollContainerRef.scrollTop = scrollContainerRef.scrollHeight;
					}
				});
			}
		} catch (e) {
			console.error('Failed to fetch terminal outputs:', e);
		}
	}

	// Create new terminal session
	async function createSession() {
		if (isCreatingSession) return;
		isCreatingSession = true;

		try {
			const response = await fetch('/api/terminal', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});
			const data = await response.json();

			if (data.success) {
				await fetchSessions();
				selectedSession = data.sessionName;
			} else {
				error = data.message || 'Failed to create terminal session';
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to create terminal session';
		} finally {
			isCreatingSession = false;
		}
	}

	// Close terminal session
	async function closeSession(sessionName: string) {
		try {
			await fetch(`/api/terminal?name=${encodeURIComponent(sessionName)}`, {
				method: 'DELETE'
			});

			// Remove from local state
			sessions = sessions.filter((s) => s.name !== sessionName);

			// Select another session if we closed the current one
			if (selectedSession === sessionName) {
				selectedSession = sessions[0]?.name || null;
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to close terminal session';
		}
	}

	// Send input to session (used by TerminalInput component)
	async function handleSendInput(input: string, type: 'text' | 'key') {
		const target = currentSession();
		if (!target) return;

		try {
			if (type === 'text') {
				await fetch(`/api/sessions/${target.name}/input`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ type: 'text', input })
				});
			} else {
				await fetch(`/api/sessions/${target.name}/input`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ type: input })
				});
			}
			// Fetch output immediately after sending
			setTimeout(fetchSessionOutputs, 100);
		} catch (e) {
			if (type === 'text') {
				error = e instanceof Error ? e.message : 'Failed to send input';
			} else {
				console.error(`Failed to send ${input}:`, e);
			}
		}
	}

	// Handle global keyboard events for the drawer
	function handleGlobalKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && isOpen) {
			e.preventDefault();
			e.stopPropagation(); // Prevent other handlers (like /work collapse)
			isOpen = false;
			isTerminalDrawerOpen.set(false);
		}
	}

	// Hover-to-focus: focus input when mouse enters the drawer
	// Skip if user is actively typing in another input (like search boxes)
	function handleDrawerMouseEnter() {
		const inputRef = terminalInputRef?.getInputRef?.();
		const activeEl = document.activeElement as HTMLElement | null;
		const isOtherInput =
			activeEl &&
			(activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') &&
			activeEl !== inputRef;

		if (!isOtherInput && terminalInputRef) {
			terminalInputRef.focus();
		}
	}

	// Handle scroll
	function handleScroll(event: Event) {
		const target = event.target as HTMLDivElement;
		// Disable auto-scroll if user scrolled up
		if (target.scrollTop < target.scrollHeight - target.clientHeight - 50) {
			autoScroll = false;
		}
	}

	// Toggle drawer
	function toggleDrawer() {
		isOpen = !isOpen;
		isTerminalDrawerOpen.set(isOpen);
	}

	// Select session
	function selectSession(name: string) {
		selectedSession = name;
	}

	// Toggle auto-scroll
	function toggleAutoScroll() {
		autoScroll = !autoScroll;
		if (autoScroll && scrollContainerRef) {
			scrollContainerRef.scrollTop = scrollContainerRef.scrollHeight;
		}
	}

	// Export toggle function for external keyboard shortcut
	export function toggle() {
		toggleDrawer();
	}

	export function open() {
		isOpen = true;
		isTerminalDrawerOpen.set(true);
	}

	export function close() {
		isOpen = false;
		isTerminalDrawerOpen.set(false);
	}
</script>

<!-- Toggle Button (always visible on right edge) -->
<button
	onclick={toggleDrawer}
	class="fixed right-0 top-1/2 -translate-y-1/2 z-40 btn btn-sm h-auto py-4 rounded-l-lg rounded-r-none"
	style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.35 0.02 250); border-right: none; writing-mode: vertical-rl; text-orientation: mixed; margin-top: 60px;"
	title={isOpen ? 'Close Terminal Panel (Ctrl+`)' : 'Open Terminal Panel (Ctrl+`)'}
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		fill="none"
		viewBox="0 0 24 24"
		stroke-width="1.5"
		stroke="currentColor"
		class="w-4 h-4 mb-1"
		style="color: oklch(0.70 0.18 145);"
	>
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
		/>
	</svg>
	<span class="text-xs font-mono" style="color: oklch(0.65 0.02 250);">TERMINAL</span>
	{#if sessions.length > 0}
		<span
			class="badge badge-sm mt-1"
			style="background: oklch(0.35 0.15 145); color: oklch(0.90 0.02 250);"
			>{sessions.length}</span
		>
	{/if}
</button>

<!-- Click-outside overlay -->
{#if isOpen}
	<button
		class="fixed inset-0 z-40 bg-black/20 cursor-default"
		onclick={() => {
			isOpen = false;
			isTerminalDrawerOpen.set(false);
		}}
		aria-label="Close terminal drawer"
		transition:fade={{ duration: 150 }}
	></button>
{/if}

<!-- Drawer Panel -->
{#if isOpen}
	<div
		class="fixed right-0 top-0 h-screen w-[680px] z-50 flex flex-col shadow-2xl"
		style="background: oklch(0.14 0.01 250); border-left: 1px solid oklch(0.30 0.02 250);"
		transition:slide={{ axis: 'x', duration: 200 }}
		onmouseenter={handleDrawerMouseEnter}
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
					style="color: oklch(0.70 0.18 145);"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
					/>
				</svg>
				<h2 class="font-mono text-sm font-semibold" style="color: oklch(0.85 0.02 250);">
					Terminal
				</h2>
				<span
					class="badge badge-sm"
					style="background: oklch(0.25 0.02 250); color: oklch(0.60 0.02 250);"
				>
					{sessions.length} session{sessions.length !== 1 ? 's' : ''}
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
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="w-4 h-4"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3"
						/>
					</svg>
				</button>

				<!-- Close button -->
				<button
					onclick={toggleDrawer}
					class="btn btn-xs btn-ghost"
					title="Close (Esc or Ctrl+`)"
					style="color: oklch(0.55 0.02 250);"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="w-4 h-4"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		</div>

		<!-- Tab Bar -->
		<div
			class="flex gap-1 px-2 py-2 items-center border-b"
			style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250);"
		>
			{#each sessions as session (session.name)}
				<div class="flex items-center group">
					<button
						onclick={() => selectSession(session.name)}
						class="flex-shrink-0 px-3 py-1.5 rounded-l-md font-mono text-xs transition-all"
						style={selectedSession === session.name
							? 'background: oklch(0.30 0.15 145); color: oklch(0.95 0.02 250);'
							: 'background: oklch(0.20 0.01 250); color: oklch(0.60 0.02 250);'}
					>
						{session.displayName}
					</button>
					<button
						onclick={() => closeSession(session.name)}
						class="px-1.5 py-1.5 rounded-r-md transition-all opacity-60 hover:opacity-100"
						style={selectedSession === session.name
							? 'background: oklch(0.28 0.12 145); color: oklch(0.90 0.02 250);'
							: 'background: oklch(0.18 0.01 250); color: oklch(0.50 0.02 250);'}
						title="Close tab"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="2"
							stroke="currentColor"
							class="w-3 h-3"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
			{/each}

			<!-- New tab button -->
			<button
				onclick={createSession}
				disabled={isCreatingSession}
				class="btn btn-xs btn-ghost ml-1"
				style="color: oklch(0.60 0.02 250);"
				title="New terminal (spawns tmux session)"
			>
				{#if isCreatingSession}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="2"
						stroke="currentColor"
						class="w-4 h-4"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
					</svg>
				{/if}
			</button>
		</div>

		<!-- Content -->
		<div
			bind:this={scrollContainerRef}
			onscroll={handleScroll}
			class="flex-1 overflow-y-auto p-3"
			style="background: oklch(0.12 0.01 250);"
		>
			{#if error}
				<div class="alert alert-error mb-3">
					<span>{error}</span>
					<button onclick={() => (error = null)} class="btn btn-xs btn-ghost">Dismiss</button>
				</div>
			{/if}

			{#if sessions.length === 0}
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
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
						/>
					</svg>
					<p class="text-sm font-mono" style="color: oklch(0.45 0.02 250);">No terminal sessions</p>
					<p class="text-xs mt-1 mb-4" style="color: oklch(0.35 0.02 250);">
						Click + to spawn a new terminal
					</p>
					<button onclick={createSession} class="btn btn-sm btn-primary" disabled={isCreatingSession}>
						{#if isCreatingSession}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
							New Terminal
						{/if}
					</button>
				</div>
			{:else if currentSession()}
				<!-- Terminal Output -->
				<div
					class="rounded-lg p-3 overflow-x-auto"
					style="background: oklch(0.10 0.01 250); border: 1px solid oklch(0.25 0.02 250);"
				>
					<pre
						class="text-xs font-mono whitespace-pre leading-relaxed"
						style="color: oklch(0.75 0.02 250);">{@html ansiToHtml(currentSession()?.output || '')}{#if !currentSession()?.output}<span
								style="color: oklch(0.40 0.02 250);">Terminal ready. Type a command below...</span
							>{/if}</pre>
				</div>
			{/if}
		</div>

		<!-- Input Section -->
		{#if sessions.length > 0 && currentSession()}
			<div onmouseenter={handleDrawerMouseEnter}>
				<TerminalInput
					bind:this={terminalInputRef}
					bind:inputText
					sessionName={currentSession()?.name || ''}
					onSendInput={handleSendInput}
					placeholder="Type command and press Enter..."
					multiline={false}
				/>
			</div>
		{/if}

		<!-- Footer -->
		<div
			class="flex items-center justify-between px-4 py-1 border-t text-xs font-mono"
			style="background: oklch(0.16 0.01 250); border-color: oklch(0.30 0.02 250); color: oklch(0.45 0.02 250);"
		>
			<span>Polling: 500ms</span>
			<span>Ctrl+` to toggle • Esc to close</span>
		</div>
	</div>
{/if}

<style>
	/* Custom scrollbar for terminal output */
	.overflow-y-auto::-webkit-scrollbar {
		width: 8px;
	}
	.overflow-y-auto::-webkit-scrollbar-track {
		background: transparent;
	}
	.overflow-y-auto::-webkit-scrollbar-thumb {
		background: oklch(0.30 0.02 250);
		border-radius: 4px;
	}
	.overflow-y-auto::-webkit-scrollbar-thumb:hover {
		background: oklch(0.35 0.02 250);
	}
</style>
