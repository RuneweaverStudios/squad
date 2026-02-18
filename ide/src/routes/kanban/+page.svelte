<script lang="ts">
	/**
	 * Agent Kanban Page
	 *
	 * Kanban board grouping active Claude Code sessions by their activity state.
	 * Unlike the task kanban (/kanban) which groups tasks by status,
	 * this view groups agents by what they're doing (working, needs-input, etc.)
	 */

	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import AgentKanbanBoard from '$lib/components/agent/kanban/AgentKanbanBoard.svelte';
	import TaskDetailDrawer from '$lib/components/TaskDetailDrawer.svelte';
	import {
		fetch as fetchSessions,
		fetchUsage as fetchSessionUsage,
		kill as killSession,
		sendInput,
		interrupt as interruptSession,
		getSessions,
		getIsLoading,
		getError
	} from '$lib/stores/workSessions.svelte.js';
	import { KanbanSkeleton } from '$lib/components/skeleton';

	// Drawer state
	let drawerOpen = $state(false);
	let selectedTaskId = $state<string | null>(null);

	// Filters
	let selectedProject = $state('All Projects');
	let selectedPriorities = $state(new Set([0, 1, 2, 3]));
	let searchQuery = $state('');

	// Get sessions from store (reactive)
	const sessions = $derived(getSessions());
	const isLoading = $derived(getIsLoading());
	const error = $derived(getError());

	// Sync project filter from URL
	$effect(() => {
		const projectParam = $page.url.searchParams.get('project');
		selectedProject = projectParam || 'All Projects';
	});

	// Toggle priority selection
	function togglePriority(priority: number) {
		if (selectedPriorities.has(priority)) {
			selectedPriorities.delete(priority);
		} else {
			selectedPriorities.add(priority);
		}
		selectedPriorities = new Set(selectedPriorities);
	}

	// Event handlers
	async function handleKillSession(sessionName: string) {
		await killSession(sessionName);
	}

	async function handleInterrupt(sessionName: string) {
		await interruptSession(sessionName);
	}

	async function handleContinue(sessionName: string) {
		await sendInput(sessionName, 'continue', 'text');
	}

	async function handleAttachTerminal(sessionName: string) {
		// Open terminal in new window via API
		const response = await fetch(`/api/sessions/${sessionName}/attach`, {
			method: 'POST'
		});
		if (!response.ok) {
			console.error('Failed to attach terminal');
		}
	}

	async function handleSendInput(sessionName: string, input: string, type: 'text' | 'key' | 'raw') {
		if (type === 'raw') {
			await sendInput(sessionName, input, 'raw');
			return;
		}
		if (type === 'key') {
			const specialKeys = ['ctrl-c', 'ctrl-d', 'ctrl-u', 'enter', 'escape', 'up', 'down', 'left', 'right', 'tab', 'delete', 'backspace', 'space'];
			if (specialKeys.includes(input)) {
				await sendInput(sessionName, '', input as 'ctrl-c' | 'ctrl-d' | 'ctrl-u' | 'enter' | 'escape' | 'up' | 'down' | 'left' | 'right' | 'tab' | 'delete' | 'backspace' | 'space');
				return;
			}
			await sendInput(sessionName, input, 'raw');
			return;
		}
		await sendInput(sessionName, input, 'text');
	}

	function handleTaskClick(taskId: string) {
		selectedTaskId = taskId;
		drawerOpen = true;
	}

	// Initial fetch on mount - WS handles all real-time updates
	onMount(async () => {
		// Phase 1: Fast initial fetch (no usage data)
		await fetchSessions();

		// Phase 2: Lazy load usage data once (after 5s delay)
		setTimeout(() => fetchSessionUsage(), 5000);
	});

	// No polling needed - WS via sessionEvents provides real-time updates
</script>

<svelte:head>
	<title>Kanban | SQUAD IDE</title>
	<meta name="description" content="Agent kanban board. Sessions organized by activity state: starting, working, needs input, review, completed." />
	<meta property="og:title" content="Kanban | SQUAD IDE" />
	<meta property="og:description" content="Agent kanban board. Sessions organized by activity state: starting, working, needs input, review, completed." />
	<meta property="og:image" content="/favicons/kanban.svg" />
	<link rel="icon" href="/favicons/kanban.svg" />
</svelte:head>

<div class="flex flex-col h-full bg-base-200">
	<!-- Filters Bar -->
	<div class="bg-base-100 border-b border-base-300 p-3 flex-none">
		<div class="flex flex-wrap items-center gap-4">
			<!-- Title -->
			<div class="flex items-center gap-2">
				<svg
					class="w-5 h-5 text-primary"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
					/>
				</svg>
				<span class="font-semibold text-sm">Agent Kanban</span>
				<span class="text-xs text-base-content/50">({sessions.length} sessions)</span>
			</div>

			<!-- Spacer -->
			<div class="flex-1"></div>

			<!-- Priority Filter -->
			<div class="flex items-center gap-1.5">
				<span class="industrial-label mb-0">Priority</span>
				{#each [0, 1, 2, 3] as priority}
					<button
						class="badge badge-sm cursor-pointer transition-all {selectedPriorities.has(priority)
							? 'badge-primary shadow-sm'
							: 'badge-ghost hover:badge-primary/20'}"
						onclick={() => togglePriority(priority)}
					>
						P{priority}
					</button>
				{/each}
			</div>

			<!-- Search -->
			<div class="flex flex-col">
				<label class="industrial-label" for="kanban-search">Search</label>
				<input
					id="kanban-search"
					type="text"
					placeholder="Search agents/tasks..."
					class="industrial-input w-48"
					bind:value={searchQuery}
				/>
			</div>
		</div>
	</div>

	<!-- Loading State -->
	{#if isLoading && sessions.length === 0}
		<KanbanSkeleton columns={4} cardsPerColumn={3} />

	<!-- Error State -->
	{:else if error}
		<div class="alert alert-error m-4">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="stroke-current shrink-0 h-6 w-6"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span>Error: {error}</span>
		</div>

	<!-- Empty State -->
	{:else if sessions.length === 0}
		<div class="flex flex-col items-center justify-center flex-1 p-8">
			<div class="text-center">
				<svg
					class="w-16 h-16 mx-auto mb-4 text-base-content/20"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="1.5"
						d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
					/>
				</svg>
				<h3 class="text-lg font-medium mb-2 text-base-content/60">No Active Sessions</h3>
				<p class="text-sm text-base-content/40 max-w-md">
					Claude Code sessions will appear here when agents start working.
					Use the <code class="text-xs px-1 py-0.5 bg-base-300 rounded">/squad:start</code> command to begin.
				</p>
			</div>
		</div>

	<!-- Main Content: Kanban Board -->
	{:else}
		<div class="flex-1 overflow-hidden">
			<AgentKanbanBoard
				{sessions}
				onKillSession={handleKillSession}
				onInterrupt={handleInterrupt}
				onContinue={handleContinue}
				onAttachTerminal={handleAttachTerminal}
				onSendInput={handleSendInput}
				onTaskClick={handleTaskClick}
				projectFilter={selectedProject}
				priorityFilter={selectedPriorities}
				{searchQuery}
			/>
		</div>
	{/if}

	<!-- Task Detail Drawer -->
	<TaskDetailDrawer bind:taskId={selectedTaskId} bind:isOpen={drawerOpen} />
</div>
