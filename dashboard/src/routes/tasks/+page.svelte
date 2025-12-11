<script lang="ts">
	/**
	 * Work Page
	 * Shows active Claude Code work sessions with TaskTable below.
	 *
	 * Layout: SessionPanel (horizontal scroll) + Resizable Divider + TaskTable
	 * User can drag divider to adjust split between panels.
	 */

	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import TaskTable from '$lib/components/agents/TaskTable.svelte';
	import SessionPanel from '$lib/components/work/SessionPanel.svelte';
	import TaskDetailDrawer from '$lib/components/TaskDetailDrawer.svelte';
	import AutoAssignmentQueue from '$lib/components/work/AutoAssignmentQueue.svelte';
	import ResizableDivider from '$lib/components/ResizableDivider.svelte';
	import SessionPanelSkeleton from '$lib/components/skeleton/SessionPanelSkeleton.svelte';
	import TaskTableSkeleton from '$lib/components/skeleton/TaskTableSkeleton.svelte';
	import {
		workSessionsState,
		fetch as fetchSessions,
		fetchUsage as fetchSessionUsage,
		spawn,
		kill,
		sendInput,
		interrupt,
		sendEnter
	} from '$lib/stores/workSessions.svelte.js';
	import { broadcastSessionEvent, lastSessionEvent } from '$lib/stores/sessionEvents';
	import { lastTaskEvent } from '$lib/stores/taskEvents';
	import { initSort, getSortBy, getSortDir } from '$lib/stores/workSort.svelte.js';

	// Resizable panel state
	const STORAGE_KEY = 'work-panel-split';
	const DEFAULT_SPLIT = 60; // 60% for work panel, 40% for task table
	const MIN_SPLIT = 20;
	const MAX_SPLIT = 80;
	const SNAP_RESTORE_SIZE = 40; // Restore to 40% when unsnapping

	let splitPercent = $state(DEFAULT_SPLIT);
	let containerHeight = $state(0);
	let containerRef: HTMLDivElement | null = null;

	// Snap-to-collapse state
	let isCollapsed = $state(false);
	let collapsedDirection = $state<'top' | 'bottom' | null>(null);
	let splitBeforeCollapse = $state(DEFAULT_SPLIT);

	// Load saved split from localStorage
	$effect(() => {
		if (browser) {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) {
				const parsed = parseFloat(saved);
				// Check for collapsed states (0 or 100)
				if (parsed === 0) {
					isCollapsed = true;
					collapsedDirection = 'top';
					splitPercent = 0;
				} else if (parsed === 100) {
					isCollapsed = true;
					collapsedDirection = 'bottom';
					splitPercent = 100;
				} else if (!isNaN(parsed) && parsed >= MIN_SPLIT && parsed <= MAX_SPLIT) {
					splitPercent = parsed;
					splitBeforeCollapse = parsed;
				}
			}
		}
	});

	// Save split to localStorage when it changes
	function saveSplit() {
		if (browser) {
			localStorage.setItem(STORAGE_KEY, splitPercent.toString());
		}
	}

	// Handle resize from divider
	function handleResize(deltaY: number) {
		if (!containerHeight) return;

		const deltaPercent = (deltaY / containerHeight) * 100;
		let newSplit = splitPercent + deltaPercent;

		// Snap when user drags past the normal bounds
		// (they're at the edge and still pushing)
		if (newSplit < MIN_SPLIT) {
			// Trying to drag past minimum → snap top panel closed
			splitBeforeCollapse = splitPercent >= MIN_SPLIT ? splitPercent : SNAP_RESTORE_SIZE;
			splitPercent = 0;
			isCollapsed = true;
			collapsedDirection = 'top';
			saveSplit();
			return;
		} else if (newSplit > MAX_SPLIT) {
			// Trying to drag past maximum → snap bottom panel closed
			splitBeforeCollapse = splitPercent <= MAX_SPLIT ? splitPercent : 100 - SNAP_RESTORE_SIZE;
			splitPercent = 100;
			isCollapsed = true;
			collapsedDirection = 'bottom';
			saveSplit();
			return;
		}

		// Normal resize within bounds
		splitPercent = newSplit;
		isCollapsed = false;
		collapsedDirection = null;
		saveSplit();
	}

	// Restore from collapsed state
	function handleRestoreFromCollapse() {
		splitPercent = splitBeforeCollapse;
		isCollapsed = false;
		collapsedDirection = null;
		saveSplit();
	}

	// Update container height on mount and resize
	function updateContainerHeight() {
		if (containerRef) {
			containerHeight = containerRef.clientHeight;
		}
	}

	// Task state
	let tasks = $state<any[]>([]);
	let allTasks = $state<any[]>([]);
	let agents = $state<any[]>([]);
	let reservations = $state<any[]>([]);
	let selectedProject = $state('All Projects');
	let isInitialLoad = $state(true);

	// Derive completed task IDs from active sessions
	// These are tasks that were completed by agents who still have active sessions
	// They should remain visible in TaskTable until the session is closed
	// IMPORTANT: Memoize to avoid triggering TaskTable re-renders on every session update
	let lastCompletedIdsKey = '';
	let lastCompletedIdsSet = new Set<string>();
	const completedTasksFromActiveSessions = $derived.by(() => {
		const completedIds: string[] = [];
		for (const session of workSessionsState.sessions) {
			if (session.lastCompletedTask?.id) {
				completedIds.push(session.lastCompletedTask.id);
			}
		}
		// Only create new Set if content changed (prevents TaskTable re-render cascade)
		const key = completedIds.sort().join(',');
		if (key !== lastCompletedIdsKey) {
			lastCompletedIdsKey = key;
			lastCompletedIdsSet = new Set(completedIds);
		}
		return lastCompletedIdsSet;
	});

	// Drawer state
	let drawerOpen = $state(false);
	let selectedTaskId = $state<string | null>(null);

	// Highlighted agent for scroll-to-agent feature
	let highlightedAgent = $state<string | null>(null);

	// Focused session index for Alt+Left/Right keyboard navigation
	let focusedSessionIndex = $state<number>(-1);

	// Get sort state from shared stores (same as SessionPanel)
	const sortBy = $derived(getSortBy());
	const sortDir = $derived(getSortDir());

	// Work session type for sorting
	interface WorkSession {
		sessionName: string;
		agentName: string;
		task: { id: string; priority?: number } | null;
		lastCompletedTask: any;
		output: string;
		created: string;
		cost: number;
	}

	// Determine session state for sorting (mirrors SessionPanel exactly)
	// State priority: 0 = needs-input, 1 = review, 2 = working, 3 = starting, 4 = completed, 5 = idle
	function getSessionState(session: WorkSession): number {
		const output = session.output || '';
		const recentOutput = output.slice(-3000);

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

		const needsInputPos = findLastPos([
			/\[JAT:NEEDS_INPUT\]/,
			/❓\s*NEED CLARIFICATION/,
			/Enter to select.*Tab\/Arrow keys to navigate.*Esc to cancel/,
			/\[ \].*\n.*\[ \]/,
			/Type something\s*\n\s*Next/,
		]);
		const workingPos = findLastPos([/\[JAT:WORKING\s+task=/]);
		const reviewPos = findLastPos([/\[JAT:NEEDS_REVIEW\]/, /\[JAT:READY\s+actions=/, /🔍\s*READY FOR REVIEW/]);

		if (session.task) {
			const positions = [
				{ state: 0, pos: needsInputPos },
				{ state: 1, pos: reviewPos },
				{ state: 2, pos: workingPos },
			].filter(p => p.pos >= 0);

			if (positions.length > 0) {
				positions.sort((a, b) => b.pos - a.pos);
				return positions[0].state;
			}
			return 3; // starting
		}

		const hasCompletionMarker = /\[JAT:IDLE\]/.test(recentOutput) || /✅\s*TASK COMPLETE/.test(recentOutput);
		if (session.lastCompletedTask || hasCompletionMarker) {
			return 4; // completed
		}
		return 5; // idle
	}

	// Pre-compute session states ONCE before sorting (avoids expensive regex in every comparison)
	// This is critical for performance - getSessionState runs regex on 3000 chars of output
	const sessionStates = $derived.by(() => {
		const states = new Map<string, number>();
		for (const session of workSessionsState.sessions) {
			states.set(session.sessionName, getSessionState(session));
		}
		return states;
	});

	// Sort sessions based on selected sort option (mirrors SessionPanel exactly)
	const sortedSessions = $derived.by(() => {
		const dir = sortDir === 'asc' ? 1 : -1;
		const states = sessionStates; // Use pre-computed states
		return [...workSessionsState.sessions].sort((a, b) => {
			switch (sortBy) {
				case 'state': {
					// Use cached states instead of recomputing for every comparison
					const stateA = states.get(a.sessionName) ?? 5;
					const stateB = states.get(b.sessionName) ?? 5;
					if (stateA !== stateB) return (stateA - stateB) * dir;
					const priorityA = a.task?.priority ?? 999;
					const priorityB = b.task?.priority ?? 999;
					return priorityA - priorityB;
				}
				case 'priority': {
					const priorityA = a.task?.priority ?? 999;
					const priorityB = b.task?.priority ?? 999;
					if (priorityA !== priorityB) return (priorityA - priorityB) * dir;
					return (a.task?.id ?? '').localeCompare(b.task?.id ?? '');
				}
				case 'created': {
					const createdA = a.created ? new Date(a.created).getTime() : 0;
					const createdB = b.created ? new Date(b.created).getTime() : 0;
					return (createdA - createdB) * dir;
				}
				case 'cost': {
					const costA = a.cost || 0;
					const costB = b.cost || 0;
					return (costA - costB) * dir;
				}
				default:
					return 0;
			}
		});
	});

	// Keyboard handler for Alt+Left/Right to cycle through sessions
	function handleKeydown(e: KeyboardEvent) {
		// Ignore if typing in an input (unless Alt is held)
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
			// Allow Alt+Arrow even in input fields to switch cards
			if (!e.altKey) return;
		}

		// Alt+Left or Alt+Right to cycle through session cards
		if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
			e.preventDefault();

			const sessions = sortedSessions;
			if (sessions.length === 0) return;

			// Calculate new index
			let newIndex: number;
			if (e.key === 'ArrowRight') {
				// Move forward (or start at 0 if not focused)
				newIndex = focusedSessionIndex < 0 ? 0 : (focusedSessionIndex + 1) % sessions.length;
			} else {
				// Move backward (or start at last if not focused)
				newIndex = focusedSessionIndex < 0
					? sessions.length - 1
					: (focusedSessionIndex - 1 + sessions.length) % sessions.length;
			}

			focusedSessionIndex = newIndex;
			const session = sessions[newIndex];
			if (!session) return;

			// Scroll to and highlight the session card
			const agentName = session.agentName;
			const workCard = document.querySelector(`[data-agent-name="${agentName}"]`);
			if (workCard) {
				// Scroll the work card into view smoothly
				workCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

				// Set highlighted state to trigger animation
				highlightedAgent = agentName;

				// Focus the textarea within the card after a short delay for scroll
				setTimeout(() => {
					const textarea = workCard.querySelector('textarea');
					if (textarea) {
						textarea.focus();
					}
				}, 100);

				// Clear highlight after animation completes (1.5s matches CSS animation duration)
				setTimeout(() => {
					highlightedAgent = null;
				}, 1500);
			}
		}
	}

	// Sync selectedProject from URL params
	$effect(() => {
		const projectParam = $page.url.searchParams.get('project');
		if (projectParam && projectParam !== 'All Projects') {
			selectedProject = projectParam;
		} else {
			selectedProject = 'All Projects';
		}
	});

	// Refetch data whenever selectedProject changes
	$effect(() => {
		selectedProject;
		fetchTaskData();
	});

	// Listen for task events (created, released, etc.) and refresh immediately
	$effect(() => {
		const unsubscribe = lastTaskEvent.subscribe((event) => {
			if (event) {
				// Refresh task data when any task event occurs
				fetchTaskData();
				// Also refresh work sessions when tasks are updated (status/assignee changes)
				// This ensures SessionCards show the correct task immediately
				if (event.updatedTasks && event.updatedTasks.length > 0) {
					fetchSessions();
				}
			}
		});
		return unsubscribe;
	});

	// Listen for session events (spawn, kill, etc.) and refresh immediately
	// This ensures the session panel updates when an agent is spawned from the drawer
	$effect(() => {
		const unsubscribe = lastSessionEvent.subscribe((event) => {
			if (event) {
				const structuralEvents = ['session-spawned', 'session-created', 'session-destroyed', 'session-killed'];
				if (structuralEvents.includes(event.type)) {
					// Refresh sessions to pick up the new/removed session
					fetchSessions();
				}
			}
		});
		return unsubscribe;
	});

	// Fetch task data
	async function fetchTaskData() {
		try {
			let url = '/api/agents?full=true';
			if (selectedProject && selectedProject !== 'All Projects') {
				url += `&project=${encodeURIComponent(selectedProject)}`;
			}

			const response = await fetch(url);
			const data = await response.json();

			if (data.error) {
				console.error('API error:', data.error);
				return;
			}

			agents = data.agents || [];
			reservations = data.reservations || [];
			tasks = data.tasks || [];

			if (selectedProject === 'All Projects') {
				allTasks = data.tasks || [];
			}
		} catch (error) {
			console.error('Failed to fetch task data:', error);
		} finally {
			isInitialLoad = false;
		}
	}

	// Event Handlers for WorkPanel

	async function handleSpawnForTask(taskId: string) {
		const session = await spawn(taskId);
		if (session) {
			await fetchTaskData();
		}
	}

	async function handleKillSession(sessionName: string) {
		const success = await kill(sessionName);
		if (success) {
			// Broadcast event so other pages (like /dash) know to refresh
			broadcastSessionEvent('session-killed', sessionName);
			await fetchTaskData();
		}
	}

	async function handleInterrupt(sessionName: string) {
		await interrupt(sessionName);
	}

	async function handleContinue(sessionName: string) {
		await sendEnter(sessionName);
	}

	async function handleAttachTerminal(sessionName: string) {
		try {
			const response = await fetch(`/api/work/${sessionName}/attach`, {
				method: 'POST'
			});
			if (!response.ok) {
				console.error('Failed to attach terminal:', await response.text());
			}
		} catch (error) {
			console.error('Failed to attach terminal:', error);
		}
	}

	async function handleSendInput(sessionName: string, input: string, type: 'text' | 'key' | 'raw') {
		if (type === 'raw') {
			// Send raw text without Enter (for live streaming)
			await sendInput(sessionName, input, 'raw');
			return;
		}
		if (type === 'key') {
			// Special keys should be passed as the type, not the input
			const specialKeys = ['ctrl-c', 'ctrl-d', 'ctrl-u', 'enter', 'escape', 'up', 'down', 'tab'];
			if (specialKeys.includes(input)) {
				await sendInput(sessionName, '', input as 'ctrl-c' | 'ctrl-d' | 'ctrl-u' | 'enter' | 'escape' | 'up' | 'down' | 'tab');
				return;
			}
			// Fallback to raw for non-special keys
			await sendInput(sessionName, input, 'raw');
			return;
		}
		await sendInput(sessionName, input, 'text');
	}

	// Handle task click
	function handleTaskClick(taskId: string) {
		selectedTaskId = taskId;
		drawerOpen = true;
	}

	// Handle agent click - scroll to work card and highlight it
	function handleAgentClick(agentName: string) {
		// Find the work card element using data-agent-name attribute
		const workCard = document.querySelector(`[data-agent-name="${agentName}"]`);
		if (workCard) {
			// Scroll the work card into view smoothly
			workCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

			// Set highlighted state to trigger animation
			highlightedAgent = agentName;

			// Clear highlight after animation completes (1.5s matches CSS animation duration)
			setTimeout(() => {
				highlightedAgent = null;
			}, 1500);
		}
	}

	// Refetch on drawer close
	let wasDrawerOpen = false;
	$effect(() => {
		if (wasDrawerOpen && !drawerOpen) {
			fetchTaskData();
			fetchSessions();
		}
		wasDrawerOpen = drawerOpen;
	});

	// DISABLED: SSE via lastTaskEvent already triggers fetchTaskData() on any task change
	// Polling was causing redundant fetches and UI lag
	// $effect(() => {
	// 	const interval = setInterval(fetchTaskData, 15000);
	// 	return () => clearInterval(interval);
	// });

	// DISABLED: Auto-refresh session usage data was overwhelming the server
	// The JSONL parsing is too expensive with many active sessions
	// Token usage will only be fetched once on mount (after 5s delay)
	// $effect(() => {
	// 	const interval = setInterval(() => fetchSessionUsage(), 30000);
	// 	return () => clearInterval(interval);
	// });

	onMount(async () => {
		// Initialize sort stores for keyboard navigation
		initSort();

		// Phase 1: Fast initial load (no usage data)
		fetchTaskData();
		await fetchSessions(); // Initial session fetch - SSE handles subsequent updates
		updateContainerHeight();
		window.addEventListener('resize', updateContainerHeight);
		window.addEventListener('keydown', handleKeydown);

		// Phase 2: Lazy load usage data once after 5 seconds
		// (disabled automatic refresh - too expensive with many sessions)
		setTimeout(() => fetchSessionUsage(), 5000);
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('resize', updateContainerHeight);
			window.removeEventListener('keydown', handleKeydown);
		}
	});
</script>

<svelte:head>
	<title>Tasks | JAT Dashboard</title>
</svelte:head>

<svelte:window onresize={updateContainerHeight} />

<div
	bind:this={containerRef}
	class="h-full bg-base-200 flex flex-col overflow-hidden"
>
	<!-- Work Sessions (horizontal scroll) + Auto-Assignment Queue -->
	<!-- min-h-0 allows proper flex shrinking; overflow-x-hidden clips horizontal overflow while scroll container handles horizontal scroll -->
	<div
		class="min-h-0 bg-base-100 flex flex-col transition-all duration-150 -mb-4 relative"
		style="height: {splitPercent}%; overflow-x: hidden;"
		class:hidden={collapsedDirection === 'top'}
	>
		{#if isInitialLoad}
			<SessionPanelSkeleton cards={3} />
		{:else}
			<!-- Auto-Assignment Queue - positioned in top-right corner -->
			<div class="absolute top-2 right-2 z-10 w-80">
				<AutoAssignmentQueue
					{selectedProject}
					limit={5}
					onTaskClick={handleTaskClick}
					onSpawnForTask={handleSpawnForTask}
				/>
			</div>

			<SessionPanel
				workSessions={workSessionsState.sessions}
				onSpawnForTask={handleSpawnForTask}
				onKillSession={handleKillSession}
				onInterrupt={handleInterrupt}
				onContinue={handleContinue}
				onAttachTerminal={handleAttachTerminal}
				onSendInput={handleSendInput}
				onTaskClick={handleTaskClick}
				{highlightedAgent}
				class="flex-1"
			/>
		{/if}
	</div>

	<!-- Resizable Divider -->
	<ResizableDivider
		onResize={handleResize}
		{isCollapsed}
		{collapsedDirection}
		onCollapsedClick={handleRestoreFromCollapse}
		class="h-2 bg-base-300 hover:bg-primary/20 border-y border-base-300 flex-shrink-0"
	/>

	<!-- Task Table -->
	<div
		class="overflow-auto bg-base-100 flex-1 transition-all duration-150"
		style="height: {100 - splitPercent}%;"
		class:hidden={collapsedDirection === 'bottom'}
	>
		{#if isInitialLoad}
			<TaskTableSkeleton rows={8} showFilters={true} />
		{:else}
			<TaskTable
				{tasks}
				{allTasks}
				{agents}
				{reservations}
				{completedTasksFromActiveSessions}
				ontaskclick={handleTaskClick}
				onagentclick={handleAgentClick}
			/>
		{/if}
	</div>

	<!-- Task Detail Drawer -->
	<TaskDetailDrawer
		bind:taskId={selectedTaskId}
		bind:isOpen={drawerOpen}
	/>
</div>
