<script lang="ts">
	/**
	 * TopBar Component - Horizontal utilities bar
	 *
	 * Simplified navigation bar containing only utility components:
	 * - Hamburger toggle (mobile only, for sidebar)
	 * - AgentCountBadge
	 * - TokenUsageBadge (tokens today, cost, sparkline)
	 * - CommandPalette
	 * - UserProfile
	 *
	 * Navigation buttons (List, Graph, Agents) removed - moved to Sidebar
	 * Project filtering removed - handled by TaskTable filter bar
	 *
	 * Props:
	 * - tokensToday: number (total tokens consumed today)
	 * - costToday: number (total cost today in USD)
	 * - sparklineData: DataPoint[] (24h sparkline data)
	 */

	import { page } from '$app/stores';
	import AgentCountBadge from './AgentCountBadge.svelte';
	import TokenUsageBadge from './TokenUsageBadge.svelte';
	import TasksCompletedBadge from './TasksCompletedBadge.svelte';
	import UserProfile from './UserProfile.svelte';
	import CommandPalette from './CommandPalette.svelte';
	import Sparkline from './Sparkline.svelte';
	import { getSparklineVisible } from '$lib/stores/preferences.svelte';
	import WebSocketStatusIndicator from './WebSocketStatusIndicator.svelte';
	import { openTaskDrawer, openTaskDetailDrawer, isSpawnModalOpen } from '$lib/stores/drawerStore';
	import { startSpawning, stopSpawning, startBulkSpawn, endBulkSpawn } from '$lib/stores/spawningTasks';
	import { pickNextTask, type NextTaskResult } from '$lib/utils/pickNextTask';
	import {
		SORT_OPTIONS,
		initSort,
		handleSortClick,
		getSortBy,
		getSortDir,
		type SortOption
	} from '$lib/stores/workSort.svelte.js';
	import {
		AGENT_SORT_OPTIONS,
		initAgentSort,
		handleAgentSortClick,
		getAgentSortBy,
		getAgentSortDir,
		type AgentSortOption
	} from '$lib/stores/agentSort.svelte.js';
	import {
		SERVER_SORT_OPTIONS,
		initServerSort,
		handleServerSortClick,
		getServerSortBy,
		getServerSortDir,
		type ServerSortOption
	} from '$lib/stores/serverSort.svelte.js';
	import { onMount, onDestroy } from 'svelte';
	import { SPAWN_STAGGER_MS } from '$lib/config/spawnConfig';
	import { getMaxSessions } from '$lib/stores/preferences.svelte';

	// Sparkline visibility (reactive from preferences store)
	const sparklineVisible = $derived(getSparklineVisible());

	// Initialize sort stores on mount
	onMount(() => {
		initSort();
		initAgentSort();
		initServerSort();
	});

	// Check which page we're on for showing appropriate sort dropdown
	const isWorkPage = $derived($page.url.pathname === '/work' || $page.url.pathname === '/tasks');
	const isAgentsPage = $derived($page.url.pathname === '/agents');
	const isServersPage = $derived($page.url.pathname === '/servers');

	// Sort dropdown state (shared between work and agent pages)
	let showSortDropdown = $state(false);
	let sortHovered = $state(false);
	let sortDropdownTimeout: ReturnType<typeof setTimeout> | null = null;

	// Get current sort state reactively (work/tasks page)
	const currentSort = $derived(getSortBy());
	const currentDir = $derived(getSortDir());
	const currentSortLabel = $derived(SORT_OPTIONS.find(o => o.value === currentSort)?.label ?? 'Sort');
	const currentSortIcon = $derived(SORT_OPTIONS.find(o => o.value === currentSort)?.icon ?? '🔔');

	// Get current sort state reactively (agents page)
	const currentAgentSort = $derived(getAgentSortBy());
	const currentAgentDir = $derived(getAgentSortDir());
	const currentAgentSortLabel = $derived(AGENT_SORT_OPTIONS.find(o => o.value === currentAgentSort)?.label ?? 'Sort');
	const currentAgentSortIcon = $derived(AGENT_SORT_OPTIONS.find(o => o.value === currentAgentSort)?.icon ?? '🔔');

	// Get current sort state reactively (servers page)
	const currentServerSort = $derived(getServerSortBy());
	const currentServerDir = $derived(getServerSortDir());
	const currentServerSortLabel = $derived(SERVER_SORT_OPTIONS.find(o => o.value === currentServerSort)?.label ?? 'Sort');
	const currentServerSortIcon = $derived(SERVER_SORT_OPTIONS.find(o => o.value === currentServerSort)?.icon ?? '🔔');

	// Handle sort dropdown show/hide with delay
	function showSortMenu() {
		if (sortDropdownTimeout) clearTimeout(sortDropdownTimeout);
		showSortDropdown = true;
	}

	function hideSortMenuDelayed() {
		sortDropdownTimeout = setTimeout(() => {
			showSortDropdown = false;
		}, 150);
	}

	function keepSortMenuOpen() {
		if (sortDropdownTimeout) clearTimeout(sortDropdownTimeout);
	}

	function onSortSelect(value: SortOption) {
		handleSortClick(value);
		showSortDropdown = false;
	}

	function onAgentSortSelect(value: AgentSortOption) {
		handleAgentSortClick(value);
		showSortDropdown = false;
	}

	function onServerSortSelect(value: ServerSortOption) {
		handleServerSortClick(value);
		showSortDropdown = false;
	}

	// Global action loading states
	let newSessionLoading = $state(false);
	let swarmLoading = $state(false);
	let pauseAllLoading = $state(false);
	let broadcastLoading = $state(false);

	// Broadcast input state
	let showBroadcastInput = $state(false);
	let broadcastMessage = $state('');

	// New Session - spawn a planning session in selected project
	async function handleNewSession(projectName: string) {
		newSessionLoading = true;
		showSessionDropdown = false;
		try {
			const projectPath = `/home/jw/code/${projectName}`;
			const response = await fetch('/api/work/spawn', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					attach: true,
					project: projectPath
				})
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.message || 'Failed to spawn session');
			}
			console.log('New session in', projectName, ':', data);
		} catch (error) {
			console.error('New session failed:', error);
			alert(error instanceof Error ? error.message : 'Failed to spawn session');
		} finally {
			newSessionLoading = false;
		}
	}

	// Swarm - spawn one agent per ready task up to MAX_SESSIONS limit
	async function handleSwarm() {
		swarmLoading = true;
		startBulkSpawn(); // Signal bulk spawn started for TaskTable animations
		try {
			// Step 1: Get current active sessions to calculate available slots
			const workResponse = await fetch('/api/work');
			const workData = await workResponse.json();
			const activeSessionCount = workData.count || 0;
			const currentMaxSessions = getMaxSessions(); // Get current preference value
			const availableSlots = Math.max(0, currentMaxSessions - activeSessionCount);

			if (availableSlots === 0) {
				throw new Error(`All ${currentMaxSessions} session slots are in use. Close some sessions first.`);
			}

			// Step 2: Get ready tasks
			const readyResponse = await fetch('/api/tasks/ready');
			const readyData = await readyResponse.json();

			if (!readyResponse.ok || !readyData.tasks?.length) {
				throw new Error('No ready tasks available');
			}

			// Limit tasks to available slots
			const tasksToSpawn = readyData.tasks.slice(0, availableSlots);
			const skippedCount = readyData.tasks.length - tasksToSpawn.length;
			const results = [];

			// Step 3: Spawn an agent for each ready task (up to limit)
			for (let i = 0; i < tasksToSpawn.length; i++) {
				const task = tasksToSpawn[i];
				startSpawning(task.id); // Signal this task is spawning for animation
				try {
					const response = await fetch('/api/work/spawn', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ taskId: task.id })
					});
					const data = await response.json();

					if (!response.ok) {
						results.push({ taskId: task.id, success: false, error: data.message || 'Failed to spawn' });
						stopSpawning(task.id); // Clear animation on failure
					} else {
						results.push({ taskId: task.id, success: true, agentName: data.session?.agentName });
						// Keep spawning animation until TaskTable refreshes and sees the new status
						setTimeout(() => stopSpawning(task.id), 2000);
					}
				} catch (err) {
					results.push({ taskId: task.id, success: false, error: err instanceof Error ? err.message : 'Unknown error' });
					stopSpawning(task.id); // Clear animation on error
				}

				// Stagger between spawns (except last one)
				if (i < tasksToSpawn.length - 1) {
					await new Promise(resolve => setTimeout(resolve, SPAWN_STAGGER_MS));
				}
			}

			const successCount = results.filter(r => r.success).length;
			console.log(`Swarm complete: ${successCount}/${tasksToSpawn.length} agents spawned`, results);

			if (successCount === 0) {
				throw new Error('Failed to spawn any agents');
			}

			// Show info if some tasks were skipped due to limit
			if (skippedCount > 0) {
				console.log(`Note: ${skippedCount} tasks skipped due to max sessions limit (${currentMaxSessions})`);
			}
		} catch (error) {
			console.error('Swarm failed:', error);
			alert(error instanceof Error ? error.message : 'Failed to spawn agents');
		} finally {
			swarmLoading = false;
			endBulkSpawn(); // Signal bulk spawn ended
		}
	}

	// Pause All - send Ctrl+C to all sessions
	async function handlePauseAll() {
		pauseAllLoading = true;
		try {
			const response = await fetch('/api/sessions/pause-all', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.message || 'Failed to pause sessions');
			}
			console.log('Pause all result:', data);
		} catch (error) {
			console.error('Pause all failed:', error);
			alert(error instanceof Error ? error.message : 'Failed to pause sessions');
		} finally {
			pauseAllLoading = false;
		}
	}

	// Broadcast message to all agents
	async function handleBroadcast() {
		if (!broadcastMessage.trim()) return;

		broadcastLoading = true;
		try {
			const response = await fetch('/api/agents/broadcast', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					subject: 'Broadcast',
					body: broadcastMessage
				})
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.message || 'Failed to broadcast message');
			}
			console.log('Broadcast result:', data);
			broadcastMessage = '';
			showBroadcastInput = false;
		} catch (error) {
			console.error('Broadcast failed:', error);
			alert(error instanceof Error ? error.message : 'Failed to broadcast message');
		} finally {
			broadcastLoading = false;
		}
	}

	// Toggle broadcast input
	function toggleBroadcastInput() {
		showBroadcastInput = !showBroadcastInput;
		if (showBroadcastInput) {
			// Focus input after it appears
			setTimeout(() => {
				const input = document.getElementById('broadcast-input');
				if (input) input.focus();
			}, 100);
		}
	}

	interface DataPoint {
		timestamp: string;
		tokens: number;
		cost: number;
	}

	/** Per-project token data from multi-project API */
	interface ProjectTokenData {
		project: string;
		tokens: number;
		cost: number;
		color: string;
	}

	/** Multi-project time-series data point from API */
	interface MultiProjectDataPoint {
		timestamp: string;
		totalTokens: number;
		totalCost: number;
		projects: ProjectTokenData[];
	}

	/** Ready task structure from /api/tasks/ready */
	interface ReadyTask {
		id: string;
		title: string;
		priority: number;
		type: string;
		project: string;
	}

	/** Epic with ready children for Run Epic feature */
	interface EpicWithReady {
		id: string;
		title: string;
		project: string;
		readyCount: number;
		totalCount: number;
	}

	/** Review rule structure */
	interface ReviewRule {
		type: string;
		maxAutoPriority: number;
		note?: string;
	}

	interface StateCounts {
		needsInput: number;
		working: number;
		review: number;
		completed: number;
		starting?: number;
		idle?: number;
	}

	interface Props {
		activeAgentCount?: number;
		totalAgentCount?: number;
		activeAgents?: string[];
		stateCounts?: StateCounts;
		tokensToday?: number;
		costToday?: number;
		sparklineData?: DataPoint[];
		/** Multi-project sparkline data (from ?multiProject=true API) */
		multiProjectData?: MultiProjectDataPoint[];
		/** Project colors map (from API response) */
		projectColors?: Record<string, string>;
		/** Number of ready tasks for Swarm button */
		readyTaskCount?: number;
		/** Ready tasks list for swarm dropdown */
		readyTasks?: ReadyTask[];
		/** Available projects for session spawning */
		projects?: string[];
		/** Currently selected project filter (for auto-detection) */
		selectedProject?: string;
		/** Open epics with ready children */
		epicsWithReady?: EpicWithReady[];
		/** Current review rules */
		reviewRules?: ReviewRule[];
	}

	let {
		activeAgentCount = 0,
		totalAgentCount = 0,
		activeAgents = [],
		stateCounts,
		tokensToday = 0,
		costToday = 0,
		sparklineData = [],
		multiProjectData,
		projectColors = {},
		readyTaskCount = 0,
		readyTasks = [],
		projects = [],
		selectedProject = 'All Projects',
		epicsWithReady = [],
		reviewRules = []
	}: Props = $props();

	// Session dropdown state
	let showSessionDropdown = $state(false);
	let sessionDropdownTimeout: ReturnType<typeof setTimeout> | null = null;

	// Swarm dropdown state
	let showSwarmDropdown = $state(false);
	let swarmDropdownTimeout: ReturnType<typeof setTimeout> | null = null;
	let spawningTaskId = $state<string | null>(null); // Track which single task is being spawned
	let startNextLoading = $state(false); // Track "Start Next" primary button loading

	// Epic submenu state
	let showEpicSubmenu = $state(false);
	let runningEpicId = $state<string | null>(null); // Track which epic is being run

	// Review settings submenu state
	let showReviewSubmenu = $state(false);

	// Task dropdown state
	let showTaskDropdown = $state(false);
	let taskDropdownTimeout: ReturnType<typeof setTimeout> | null = null;

	// Get actual project list (filter out "All Projects")
	const actualProjects = $derived(projects.filter(p => p !== 'All Projects'));

	// Max sessions from user preferences (reactive)
	const maxSessions = $derived(getMaxSessions());

	// Calculate available slots and effective spawn count for Run All Ready
	const availableSlots = $derived(Math.max(0, maxSessions - activeAgentCount));
	const effectiveSpawnCount = $derived(Math.min(readyTaskCount, availableSlots));


	// Handle dropdown show/hide with delay
	function showDropdown() {
		if (sessionDropdownTimeout) clearTimeout(sessionDropdownTimeout);
		showSessionDropdown = true;
	}

	function hideDropdownDelayed() {
		sessionDropdownTimeout = setTimeout(() => {
			showSessionDropdown = false;
		}, 150);
	}

	function keepDropdownOpen() {
		if (sessionDropdownTimeout) clearTimeout(sessionDropdownTimeout);
	}

	// Handle task dropdown show/hide with delay
	function showTaskDropdownMenu() {
		if (taskDropdownTimeout) clearTimeout(taskDropdownTimeout);
		showTaskDropdown = true;
	}

	function hideTaskDropdownDelayed() {
		taskDropdownTimeout = setTimeout(() => {
			showTaskDropdown = false;
		}, 150);
	}

	function keepTaskDropdownOpen() {
		if (taskDropdownTimeout) clearTimeout(taskDropdownTimeout);
	}

	// Handle task creation for selected project
	function handleNewTask(projectName: string) {
		showTaskDropdown = false;
		openTaskDrawer(projectName);
	}

	// Swarm dropdown handlers
	function showSwarmMenu() {
		if (swarmDropdownTimeout) clearTimeout(swarmDropdownTimeout);
		showSwarmDropdown = true;
	}

	function hideSwarmMenuDelayed() {
		swarmDropdownTimeout = setTimeout(() => {
			showSwarmDropdown = false;
		}, 150);
	}

	function keepSwarmMenuOpen() {
		if (swarmDropdownTimeout) clearTimeout(swarmDropdownTimeout);
	}

	// Start Next - spawn single agent on highest-priority ready task
	async function handleStartNext() {
		if (startNextLoading || swarmLoading || readyTaskCount === 0) return;

		startNextLoading = true;
		showSwarmDropdown = false;

		try {
			// Use pickNextTask to get the highest-priority ready task
			const nextTask = await pickNextTask(null, { project: selectedProject });

			if (!nextTask) {
				console.error('No ready tasks available');
				return;
			}

			startSpawning(nextTask.taskId);

			const response = await fetch('/api/work/spawn', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ taskId: nextTask.taskId })
			});
			const data = await response.json();

			if (!response.ok) {
				console.error('Start Next failed:', data.message);
				stopSpawning(nextTask.taskId);
			} else {
				console.log('Started next task:', nextTask.taskId, data);
				setTimeout(() => stopSpawning(nextTask.taskId), 2000);
			}
		} catch (err) {
			console.error('Start Next error:', err);
		} finally {
			startNextLoading = false;
		}
	}

	// Open Swarm Config modal
	function handleOpenSwarmConfig() {
		showSwarmDropdown = false;
		isSpawnModalOpen.set(true);
	}

	// Run Epic - spawn agents for all ready children of an epic
	async function handleRunEpic(epicId: string) {
		if (runningEpicId || swarmLoading) return;

		runningEpicId = epicId;
		showEpicSubmenu = false;
		showSwarmDropdown = false;

		try {
			// Fetch epic's children with ready status
			const response = await fetch(`/api/epics/${epicId}/children`);
			if (!response.ok) {
				throw new Error('Failed to fetch epic children');
			}
			const data = await response.json();

			// Filter to ready children only
			const readyChildren = data.children.filter((c: { isBlocked: boolean; status: string }) =>
				!c.isBlocked && c.status !== 'closed' && c.status !== 'in_progress'
			);

			if (readyChildren.length === 0) {
				console.log('No ready tasks in epic', epicId);
				return;
			}

			startBulkSpawn();

			// Spawn agents for each ready child
			const staggerMs = 6000;
			for (let i = 0; i < readyChildren.length; i++) {
				const task = readyChildren[i];
				startSpawning(task.id);

				try {
					const spawnResponse = await fetch('/api/work/spawn', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ taskId: task.id })
					});

					if (!spawnResponse.ok) {
						console.error('Failed to spawn for', task.id);
						stopSpawning(task.id);
					} else {
						console.log('Spawned agent for epic child:', task.id);
						setTimeout(() => stopSpawning(task.id), 2000);
					}
				} catch (err) {
					console.error('Spawn error for', task.id, err);
					stopSpawning(task.id);
				}

				// Stagger between spawns
				if (i < readyChildren.length - 1) {
					await new Promise(resolve => setTimeout(resolve, staggerMs));
				}
			}

			console.log(`Run Epic complete: spawned ${readyChildren.length} agents for ${epicId}`);
		} catch (err) {
			console.error('Run Epic failed:', err);
		} finally {
			runningEpicId = null;
			endBulkSpawn();
		}
	}

	// Get epics with ready children count
	const epicsWithReadyChildren = $derived(
		epicsWithReady.filter(e => e.readyCount > 0).sort((a, b) => b.readyCount - a.readyCount)
	);

	// Get total ready across all epics
	const totalEpicReadyCount = $derived(
		epicsWithReadyChildren.reduce((sum, e) => sum + e.readyCount, 0)
	);

	// Get review summary for display
	const reviewSummary = $derived.by(() => {
		if (!reviewRules || reviewRules.length === 0) return null;

		// Find the common threshold (most common maxAutoPriority)
		const thresholds = reviewRules.map(r => r.maxAutoPriority);
		const commonThreshold = thresholds[0] ?? 3;

		// Count how many types auto-proceed at each level
		const autoTypes = reviewRules.filter(r => r.maxAutoPriority >= 0).length;
		const reviewAlways = reviewRules.filter(r => r.maxAutoPriority < 0).length;

		return {
			commonThreshold,
			autoTypes,
			reviewAlways,
			description: `P0-P${commonThreshold} auto-proceed`
		};
	});

	// Spawn a single task from the dropdown
	async function handleSpawnSingle(taskId: string) {
		if (spawningTaskId || swarmLoading) return;

		spawningTaskId = taskId;
		startSpawning(taskId);

		try {
			const response = await fetch('/api/work/spawn', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ taskId })
			});
			const data = await response.json();

			if (!response.ok) {
				console.error('Spawn failed:', data.message);
				stopSpawning(taskId);
			} else {
				console.log('Spawned agent for task:', taskId, data);
				// Keep animation briefly then clear
				setTimeout(() => stopSpawning(taskId), 2000);
			}
		} catch (err) {
			console.error('Spawn error:', err);
			stopSpawning(taskId);
		} finally {
			spawningTaskId = null;
		}
	}

	// Group ready tasks by project for the dropdown
	const tasksByProject = $derived.by(() => {
		const groups = new Map<string, ReadyTask[]>();
		for (const task of readyTasks) {
			const project = task.project || 'unknown';
			if (!groups.has(project)) {
				groups.set(project, []);
			}
			groups.get(project)!.push(task);
		}
		// Sort by priority within each group
		for (const tasks of groups.values()) {
			tasks.sort((a, b) => a.priority - b.priority);
		}
		return groups;
	});

	// Get priority badge color
	function getPriorityColor(priority: number): string {
		switch (priority) {
			case 0: return 'oklch(0.65 0.25 25)'; // P0 - red
			case 1: return 'oklch(0.75 0.20 60)'; // P1 - orange
			case 2: return 'oklch(0.70 0.15 200)'; // P2 - blue
			default: return 'oklch(0.55 0.02 250)'; // P3+ - gray
		}
	}

	// Button hover states
	let sessionHovered = $state(false);
	let taskHovered = $state(false);
	let swarmHovered = $state(false);
	let pauseHovered = $state(false);
	let bcastHovered = $state(false);
</script>

<!-- Industrial/Terminal TopBar -->
<nav
	class="w-full h-12 flex items-center relative"
	style="
		background: linear-gradient(180deg, oklch(0.25 0.01 250) 0%, oklch(0.20 0.01 250) 100%);
		border-bottom: 1px solid oklch(0.35 0.02 250);
	"
>
	<!-- Sidebar toggle (industrial) -->
	<label
		for="main-drawer"
		aria-label="open sidebar"
		class="flex items-center justify-center w-7 h-7 ml-3 rounded cursor-pointer transition-all hover:scale-105"
		style="background: oklch(0.30 0.02 250); border: 1px solid oklch(0.40 0.02 250);"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			stroke-linejoin="round"
			stroke-linecap="round"
			stroke-width="2"
			fill="none"
			stroke="currentColor"
			class="w-4 h-4"
			style="color: oklch(0.70 0.18 240);"
		>
			<path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"></path>
			<path d="M9 4v16"></path>
			<path d="M14 10l2 2l-2 2"></path>
		</svg>
	</label>

	<!-- Left side utilities -->
	<div class="flex-1 flex items-center gap-3 px-2">
		<!-- New Session Dropdown (Primary action - pick project, then spawn) -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="relative"
			onmouseenter={showDropdown}
			onmouseleave={hideDropdownDelayed}
		>
			<button
				class="flex items-center gap-1 py-1 rounded font-mono text-[10px] tracking-wider uppercase transition-all duration-200 ease-out overflow-hidden"
				style="
					background: {sessionHovered || showSessionDropdown ? 'linear-gradient(135deg, oklch(0.60 0.22 250) 0%, oklch(0.50 0.20 265) 100%)' : 'linear-gradient(135deg, oklch(0.55 0.20 250) 0%, oklch(0.45 0.18 265) 100%)'};
					border: 1px solid {sessionHovered || showSessionDropdown ? 'oklch(0.70 0.20 250)' : 'oklch(0.60 0.18 250)'};
					color: oklch(0.95 0.02 250);
					text-shadow: 0 0 10px oklch(0.60 0.20 250 / 0.5);
					padding-left: {sessionHovered || showSessionDropdown ? '10px' : '8px'};
					padding-right: {sessionHovered || showSessionDropdown ? '10px' : '8px'};
					box-shadow: {sessionHovered || showSessionDropdown ? '0 0 25px oklch(0.55 0.22 250 / 0.5)' : '0 0 10px oklch(0.55 0.20 250 / 0.2)'};
					transform: {sessionHovered || showSessionDropdown ? 'scale(1.05)' : 'scale(1)'};
				"
				disabled={newSessionLoading}
				title="Start new Claude Code session - pick a project"
				onmouseenter={() => sessionHovered = true}
				onmouseleave={() => sessionHovered = false}
			>
				{#if newSessionLoading}
					<span class="loading loading-spinner loading-xs"></span>
					<span>Starting...</span>
				{:else}
					<svg class="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
					</svg>
					{#if sessionHovered || showSessionDropdown}
						<span class="whitespace-nowrap">New Session</span>
						<svg class="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
						</svg>
					{:else}
						<span class="hidden sm:inline">Session</span>
					{/if}
				{/if}
			</button>

			<!-- Project Dropdown -->
			{#if showSessionDropdown && !newSessionLoading}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="absolute top-full left-0 mt-1 min-w-[180px] rounded-lg shadow-xl z-50 overflow-hidden"
					style="
						background: linear-gradient(180deg, oklch(0.22 0.02 250) 0%, oklch(0.18 0.02 250) 100%);
						border: 1px solid oklch(0.40 0.03 250);
					"
					onmouseenter={keepDropdownOpen}
					onmouseleave={hideDropdownDelayed}
				>
					<div class="px-3 py-2 border-b" style="border-color: oklch(0.30 0.02 250);">
						<span class="text-[9px] font-mono uppercase tracking-wider" style="color: oklch(0.55 0.02 250);">
							Select Project
						</span>
					</div>
					<div class="py-1 max-h-[240px] overflow-y-auto">
						{#if actualProjects.length === 0}
							<div class="px-3 py-2 text-xs" style="color: oklch(0.50 0.02 250);">
								No projects found
							</div>
						{:else}
							{#each actualProjects as project}
								<button
									class="w-full px-3 py-2 text-left text-xs font-mono flex items-center gap-2 transition-colors"
									style="color: oklch(0.80 0.02 250);"
									onmouseenter={(e) => e.currentTarget.style.background = 'oklch(0.30 0.03 250)'}
									onmouseleave={(e) => e.currentTarget.style.background = 'transparent'}
									onclick={() => handleNewSession(project)}
								>
									<span
										class="w-2 h-2 rounded-full flex-shrink-0"
										style="background: {projectColors[project] || 'oklch(0.60 0.15 250)'};"
									></span>
									<span class="flex-1">{project}</span>
								</button>
							{/each}
						{/if}
					</div>
					<!-- Project Settings Link -->
					<div class="border-t" style="border-color: oklch(0.30 0.02 250);">
						<a
							href="/projects"
							class="w-full px-3 py-2 text-left text-xs font-mono flex items-center gap-2 transition-colors"
							style="color: oklch(0.60 0.02 250);"
							onmouseenter={(e) => e.currentTarget.style.background = 'oklch(0.28 0.02 250)'}
							onmouseleave={(e) => e.currentTarget.style.background = 'transparent'}
						>
							<svg class="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.204-.107-.397.165-.71.505-.78.929l-.15.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
								<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
							</svg>
							<span>Project Settings</span>
						</a>
					</div>
				</div>
			{/if}
		</div>

		<!-- Add Task Dropdown (Industrial - pick project first) -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="relative"
			onmouseenter={showTaskDropdownMenu}
			onmouseleave={hideTaskDropdownDelayed}
		>
			<button
				class="flex items-center gap-1 py-1 rounded font-mono text-[10px] tracking-wider uppercase transition-all duration-200 ease-out overflow-hidden"
				style="
					background: {taskHovered || showTaskDropdown ? 'linear-gradient(135deg, oklch(0.75 0.22 145 / 0.35) 0%, oklch(0.75 0.22 145 / 0.2) 100%)' : 'linear-gradient(135deg, oklch(0.75 0.20 145 / 0.2) 0%, oklch(0.75 0.20 145 / 0.1) 100%)'};
					border: 1px solid {taskHovered || showTaskDropdown ? 'oklch(0.80 0.22 145 / 0.6)' : 'oklch(0.75 0.20 145 / 0.4)'};
					color: {taskHovered || showTaskDropdown ? 'oklch(0.90 0.20 145)' : 'oklch(0.80 0.18 145)'};
					text-shadow: 0 0 10px oklch(0.75 0.20 145 / 0.5);
					padding-left: {taskHovered || showTaskDropdown ? '10px' : '8px'};
					padding-right: {taskHovered || showTaskDropdown ? '10px' : '8px'};
					box-shadow: {taskHovered || showTaskDropdown ? '0 0 20px oklch(0.75 0.22 145 / 0.4)' : 'none'};
					transform: {taskHovered || showTaskDropdown ? 'scale(1.05)' : 'scale(1)'};
				"
				title="Create new task - pick a project"
				onmouseenter={() => taskHovered = true}
				onmouseleave={() => taskHovered = false}
			>
				<svg class="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
				</svg>
				{#if taskHovered || showTaskDropdown}
					<span class="whitespace-nowrap">New Task</span>
					<svg class="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
					</svg>
				{:else}
					<span class="hidden sm:inline">Task</span>
				{/if}
			</button>

			<!-- Project Dropdown for Task -->
			{#if showTaskDropdown}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="absolute top-full left-0 mt-1 min-w-[180px] rounded-lg shadow-xl z-50 overflow-hidden"
					style="
						background: linear-gradient(180deg, oklch(0.22 0.02 250) 0%, oklch(0.18 0.02 250) 100%);
						border: 1px solid oklch(0.40 0.03 250);
					"
					onmouseenter={keepTaskDropdownOpen}
					onmouseleave={hideTaskDropdownDelayed}
				>
					<div class="px-3 py-2 border-b" style="border-color: oklch(0.30 0.02 250);">
						<span class="text-[9px] font-mono uppercase tracking-wider" style="color: oklch(0.55 0.02 250);">
							Select Project
						</span>
					</div>
					<div class="py-1 max-h-[240px] overflow-y-auto">
						{#if actualProjects.length === 0}
							<div class="px-3 py-2 text-xs" style="color: oklch(0.50 0.02 250);">
								No projects found
							</div>
						{:else}
							{#each actualProjects as project}
								<button
									class="w-full px-3 py-2 text-left text-xs font-mono flex items-center gap-2 transition-colors"
									style="color: oklch(0.80 0.02 250);"
									onmouseenter={(e) => e.currentTarget.style.background = 'oklch(0.30 0.03 250)'}
									onmouseleave={(e) => e.currentTarget.style.background = 'transparent'}
									onclick={() => handleNewTask(project)}
								>
									<span
										class="w-2 h-2 rounded-full flex-shrink-0"
										style="background: {projectColors[project] || 'oklch(0.60 0.15 145)'};"
									></span>
									<span class="flex-1">{project}</span>
								</button>
							{/each}
						{/if}
					</div>
					<!-- Project Settings Link -->
					<div class="border-t" style="border-color: oklch(0.30 0.02 250);">
						<a
							href="/projects"
							class="w-full px-3 py-2 text-left text-xs font-mono flex items-center gap-2 transition-colors"
							style="color: oklch(0.60 0.02 250);"
							onmouseenter={(e) => e.currentTarget.style.background = 'oklch(0.28 0.02 250)'}
							onmouseleave={(e) => e.currentTarget.style.background = 'transparent'}
						>
							<svg class="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.204-.107-.397.165-.71.505-.78.929l-.15.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
								<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
							</svg>
							<span>Project Settings</span>
						</a>
					</div>
				</div>
			{/if}
		</div>

		<!-- Global Action Buttons (Industrial) -->
		<div class="hidden md:flex items-center gap-1">
			<!-- Start Next - Split button: primary spawns next task, dropdown reveals options -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="relative flex"
				onmouseleave={hideSwarmMenuDelayed}
			>
				<!-- Primary Button: Start Next (spawns single agent on highest-priority task) -->
				<button
					class="flex items-center gap-1 py-1 rounded-l font-mono text-[10px] tracking-wider uppercase transition-all duration-200 ease-out overflow-hidden"
					style="
						background: {swarmHovered || showSwarmDropdown ? 'linear-gradient(135deg, oklch(0.50 0.20 145) 0%, oklch(0.40 0.18 160) 100%)' : 'linear-gradient(135deg, oklch(0.45 0.18 145) 0%, oklch(0.35 0.16 160) 100%)'};
						border: 1px solid {swarmHovered || showSwarmDropdown ? 'oklch(0.55 0.20 145)' : 'oklch(0.50 0.18 145)'};
						border-right: none;
						color: oklch(0.98 0.02 145);
						padding-left: 10px;
						padding-right: 10px;
						box-shadow: {swarmHovered || showSwarmDropdown ? '0 0 20px oklch(0.50 0.20 145 / 0.4)' : '0 0 10px oklch(0.45 0.18 145 / 0.2)'};
					"
					onclick={handleStartNext}
					disabled={startNextLoading || swarmLoading || readyTaskCount === 0}
					title={readyTaskCount > 0 ? `Start highest-priority task (${readyTaskCount} ready)` : 'No ready tasks'}
					onmouseenter={() => swarmHovered = true}
					onmouseleave={() => swarmHovered = false}
				>
					{#if startNextLoading}
						<span class="loading loading-spinner loading-xs"></span>
						<span>Starting...</span>
					{:else}
						<svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
						</svg>
						<span class="whitespace-nowrap">Start Next</span>
						{#if readyTaskCount > 0}
							<span
								class="px-1.5 py-0.5 rounded text-[9px] font-bold"
								style="background: oklch(0.55 0.22 145); color: oklch(0.98 0.02 145);"
							>{readyTaskCount}</span>
						{/if}
					{/if}
				</button>

				<!-- Dropdown Toggle Button -->
				<button
					class="flex items-center justify-center py-1 px-1.5 rounded-r font-mono transition-all duration-200 ease-out"
					style="
						background: {showSwarmDropdown ? 'linear-gradient(135deg, oklch(0.55 0.22 145) 0%, oklch(0.45 0.20 160) 100%)' : 'linear-gradient(135deg, oklch(0.45 0.18 145) 0%, oklch(0.35 0.16 160) 100%)'};
						border: 1px solid {showSwarmDropdown ? 'oklch(0.60 0.22 145)' : 'oklch(0.50 0.18 145)'};
						border-left: 1px solid oklch(0.35 0.12 145);
						color: oklch(0.98 0.02 145);
						box-shadow: {showSwarmDropdown ? '0 0 20px oklch(0.50 0.20 145 / 0.4)' : '0 0 10px oklch(0.45 0.18 145 / 0.2)'};
					"
					onclick={() => showSwarmDropdown = !showSwarmDropdown}
					onmouseenter={showSwarmMenu}
					disabled={swarmLoading}
					title="More spawn options"
				>
					<svg class="w-3 h-3 transition-transform {showSwarmDropdown ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
					</svg>
				</button>

				<!-- Dropdown Panel -->
				{#if showSwarmDropdown && !swarmLoading && !startNextLoading}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="swarm-dropdown-panel"
						onmouseenter={keepSwarmMenuOpen}
						onmouseleave={hideSwarmMenuDelayed}
					>
						<!-- Quick Actions Section -->
						<div class="p-2 border-b" style="border-color: oklch(0.30 0.02 250);">
							<div class="text-[9px] font-mono uppercase tracking-wider mb-2" style="color: oklch(0.55 0.02 250);">
								Quick Actions
							</div>

							<!-- Swarm Config (opens modal) -->
							<button
								class="swarm-menu-item"
								onclick={handleOpenSwarmConfig}
							>
								<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
									<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
								</svg>
								<div class="flex-1">
									<div class="font-semibold">Swarm Config</div>
									<div class="text-[10px]" style="color: oklch(0.55 0.02 250);">Configure multi-agent spawn</div>
								</div>
								<svg class="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
								</svg>
							</button>

							<!-- Run All Ready -->
							<button
								class="swarm-menu-item"
								onclick={handleSwarm}
								disabled={readyTaskCount === 0 || availableSlots === 0}
								title={availableSlots === 0 ? `All ${maxSessions} session slots in use` : `Spawn ${effectiveSpawnCount} agent${effectiveSpawnCount !== 1 ? 's' : ''}`}
							>
								<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
								</svg>
								<div class="flex-1">
									<div class="font-semibold">Run All Ready</div>
									<div class="text-[10px]" style="color: oklch(0.55 0.02 250);">
										{#if availableSlots === 0}
											No slots available (max {maxSessions})
										{:else if readyTaskCount > availableSlots}
											Spawn {availableSlots} of {readyTaskCount} tasks (max {maxSessions})
										{:else}
											Spawn agent per ready task
										{/if}
									</div>
								</div>
								{#if readyTaskCount > 0}
									<span
										class="px-1.5 py-0.5 rounded text-[9px] font-bold"
										style="background: {availableSlots === 0 ? 'oklch(0.35 0.05 250)' : effectiveSpawnCount < readyTaskCount ? 'oklch(0.45 0.15 60)' : 'oklch(0.45 0.15 30)'}; color: oklch(0.95 0.02 30);"
									>{effectiveSpawnCount}{#if effectiveSpawnCount < readyTaskCount}/{readyTaskCount}{/if}</span>
								{/if}
							</button>

							<!-- Run Epic (with submenu) -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="relative"
								onmouseenter={() => showEpicSubmenu = true}
								onmouseleave={() => showEpicSubmenu = false}
							>
								<button
									class="swarm-menu-item w-full"
									disabled={epicsWithReadyChildren.length === 0 || runningEpicId !== null}
								>
									{#if runningEpicId}
										<span class="loading loading-spinner loading-xs"></span>
									{:else}
										<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
											<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
										</svg>
									{/if}
									<div class="flex-1">
										<div class="font-semibold">Run Epic</div>
										<div class="text-[10px]" style="color: oklch(0.55 0.02 250);">Spawn agents for epic tasks</div>
									</div>
									{#if epicsWithReadyChildren.length > 0}
										<span
											class="px-1.5 py-0.5 rounded text-[9px] font-bold"
											style="background: oklch(0.50 0.15 280); color: oklch(0.95 0.02 280);"
										>{epicsWithReadyChildren.length}</span>
									{/if}
									<svg class="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
									</svg>
								</button>

								<!-- Epic Submenu -->
								{#if showEpicSubmenu && epicsWithReadyChildren.length > 0}
									<div
										class="absolute left-full top-0 ml-1 min-w-[220px] rounded-lg shadow-xl z-50 overflow-hidden"
										style="
											background: linear-gradient(180deg, oklch(0.20 0.02 250) 0%, oklch(0.16 0.02 250) 100%);
											border: 1px solid oklch(0.35 0.02 250);
										"
									>
										<div class="px-3 py-2 border-b" style="border-color: oklch(0.28 0.02 250);">
											<span class="text-[9px] font-mono uppercase tracking-wider" style="color: oklch(0.55 0.02 250);">
												Select Epic
											</span>
										</div>
										<div class="py-1 max-h-[200px] overflow-y-auto">
											{#each epicsWithReadyChildren as epic}
												<button
													class="w-full px-3 py-2 text-left text-xs font-mono flex items-center gap-2 transition-colors"
													style="color: oklch(0.80 0.02 250);"
													onmouseenter={(e) => e.currentTarget.style.background = 'oklch(0.28 0.03 250)'}
													onmouseleave={(e) => e.currentTarget.style.background = 'transparent'}
													onclick={() => handleRunEpic(epic.id)}
													disabled={runningEpicId === epic.id}
												>
													<span
														class="w-2 h-2 rounded-full flex-shrink-0"
														style="background: {projectColors[epic.project] || 'oklch(0.60 0.15 280)'};"
													></span>
													<div class="flex-1 min-w-0">
														<div class="truncate" style="color: oklch(0.70 0.10 280);">{epic.id}</div>
														<div class="truncate text-[10px]" style="color: oklch(0.60 0.02 250);">{epic.title}</div>
													</div>
													<span
														class="px-1.5 py-0.5 rounded text-[9px] font-bold flex-shrink-0"
														style="background: oklch(0.45 0.15 145); color: oklch(0.95 0.02 145);"
													>{epic.readyCount}</span>
												</button>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						</div>

						<!-- Review Settings Section -->
						<div class="p-2 border-t" style="border-color: oklch(0.30 0.02 250);">
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="relative"
								onmouseenter={() => showReviewSubmenu = true}
								onmouseleave={() => showReviewSubmenu = false}
							>
								<button class="swarm-menu-item w-full">
									<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
										<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.573-3.007-9.963-7.178z" />
										<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
									</svg>
									<div class="flex-1">
										<div class="font-semibold">Review Settings</div>
										{#if reviewSummary}
											<div class="text-[10px]" style="color: oklch(0.55 0.02 250);">{reviewSummary.description}</div>
										{:else}
											<div class="text-[10px]" style="color: oklch(0.55 0.02 250);">Auto-proceed thresholds</div>
										{/if}
									</div>
									<svg class="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
									</svg>
								</button>

								<!-- Review Submenu -->
								{#if showReviewSubmenu}
									<div
										class="absolute left-full top-0 ml-1 min-w-[240px] rounded-lg shadow-xl z-50 overflow-hidden"
										style="
											background: linear-gradient(180deg, oklch(0.20 0.02 250) 0%, oklch(0.16 0.02 250) 100%);
											border: 1px solid oklch(0.35 0.02 250);
										"
									>
										<div class="px-3 py-2 border-b" style="border-color: oklch(0.28 0.02 250);">
											<span class="text-[9px] font-mono uppercase tracking-wider" style="color: oklch(0.55 0.02 250);">
												Review Rules
											</span>
										</div>
										<div class="p-2">
											<!-- Mini rule display -->
											{#if reviewRules && reviewRules.length > 0}
												<div class="grid grid-cols-2 gap-1 mb-2">
													{#each reviewRules as rule}
														{@const isAutoAll = rule.maxAutoPriority >= 4}
														{@const isReviewAll = rule.maxAutoPriority < 0}
														<div
															class="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono"
															style="background: oklch(0.25 0.02 250);"
														>
															<span class="capitalize" style="color: oklch(0.75 0.02 250);">{rule.type}</span>
															<span
																class="ml-auto px-1 rounded text-[9px]"
																style="
																	background: {isReviewAll ? 'oklch(0.40 0.15 30)' : isAutoAll ? 'oklch(0.40 0.15 145)' : 'oklch(0.35 0.10 200)'};
																	color: {isReviewAll ? 'oklch(0.90 0.12 30)' : isAutoAll ? 'oklch(0.90 0.12 145)' : 'oklch(0.85 0.08 200)'};
																"
															>
																{#if isReviewAll}
																	Review
																{:else if isAutoAll}
																	Auto
																{:else}
																	≤P{rule.maxAutoPriority}
																{/if}
															</span>
														</div>
													{/each}
												</div>
											{:else}
												<div class="text-xs text-center py-2" style="color: oklch(0.50 0.02 250);">
													No rules configured
												</div>
											{/if}

											<!-- Legend -->
											<div class="flex items-center gap-3 text-[9px] mb-2 px-1" style="color: oklch(0.50 0.02 250);">
												<div class="flex items-center gap-1">
													<span class="w-2 h-2 rounded" style="background: oklch(0.40 0.15 145);"></span>
													<span>Auto-proceed</span>
												</div>
												<div class="flex items-center gap-1">
													<span class="w-2 h-2 rounded" style="background: oklch(0.40 0.15 30);"></span>
													<span>Always review</span>
												</div>
											</div>

											<!-- Full settings link -->
											<a
												href="/settings"
												class="flex items-center justify-center gap-1.5 w-full py-1.5 rounded text-[10px] font-mono transition-colors"
												style="background: oklch(0.30 0.03 250); color: oklch(0.75 0.02 250);"
												onmouseenter={(e) => {
													e.currentTarget.style.background = 'oklch(0.35 0.05 250)';
													e.currentTarget.style.color = 'oklch(0.90 0.02 250)';
												}}
												onmouseleave={(e) => {
													e.currentTarget.style.background = 'oklch(0.30 0.03 250)';
													e.currentTarget.style.color = 'oklch(0.75 0.02 250)';
												}}
												onclick={() => { showSwarmDropdown = false; showReviewSubmenu = false; }}
											>
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
													<path stroke-linecap="round" stroke-linejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.204-.107-.397.165-.71.505-.78.929l-.15.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
													<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
												</svg>
												<span>Full Settings</span>
											</a>
										</div>
									</div>
								{/if}
							</div>
						</div>

						<!-- Ready Tasks Section -->
						<div
							class="px-2 py-1.5 flex items-center justify-between"
							style="background: oklch(0.15 0.02 250);"
						>
							<span class="text-[9px] font-mono uppercase tracking-wider" style="color: oklch(0.55 0.02 250);">
								Pick Task
							</span>
							<span class="text-xs font-semibold" style="color: oklch(0.70 0.18 145);">
								{readyTaskCount} ready
							</span>
						</div>

						{#if readyTaskCount === 0}
							<div class="px-3 py-4 text-center text-xs" style="color: oklch(0.50 0.02 250);">
								No tasks ready to spawn
							</div>
						{:else}
							<!-- Task list grouped by project -->
							<div class="max-h-[280px] overflow-y-auto">
								{#each [...tasksByProject.entries()] as [project, tasks]}
									<!-- Project header -->
									<div class="swarm-project-header">
										<span
											class="w-2 h-2 rounded-full flex-shrink-0"
											style="background: {projectColors[project] || 'oklch(0.60 0.15 250)'};"
										></span>
										<span class="swarm-project-label">{project}</span>
										<span class="swarm-project-count">{tasks.length}</span>
									</div>
									<!-- Tasks for this project -->
									{#each tasks as task}
										<div class="swarm-task-row">
											<div class="flex items-start justify-between gap-2 w-full">
												<div class="flex-1 min-w-0 text-left">
													<div class="flex items-center gap-1.5">
														<span
															class="px-1 py-0.5 rounded text-[9px] font-bold"
															style="background: {getPriorityColor(task.priority)}; color: oklch(0.98 0.02 60);"
														>P{task.priority}</span>
														<span class="text-[10px] font-mono" style="color: oklch(0.55 0.10 200);">
															{task.id}
														</span>
													</div>
													<div class="text-xs font-mono truncate mt-0.5" style="color: oklch(0.85 0.02 250);">
														{task.title || task.id}
													</div>
												</div>
												<div class="flex items-center gap-1.5 flex-shrink-0">
													<!-- Info button to view task details -->
													<button
														class="p-1 rounded hover:bg-base-300/50 transition-colors"
														onclick={(e) => {
															e.stopPropagation();
															openTaskDetailDrawer(task.id);
														}}
														title="View task details"
													>
														<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5 opacity-50 hover:opacity-100" style="color: oklch(0.70 0.15 240);">
															<path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
														</svg>
													</button>
													<!-- Spawn button -->
													<button
														class="p-1 rounded hover:bg-base-300/50 transition-colors"
														onclick={() => handleSpawnSingle(task.id)}
														disabled={spawningTaskId === task.id || swarmLoading}
														title="Spawn agent for this task"
													>
														{#if spawningTaskId === task.id}
															<span class="loading loading-spinner loading-xs" style="color: oklch(0.70 0.18 145);"></span>
														{:else}
															<svg class="w-4 h-4 opacity-50 hover:opacity-100" style="color: oklch(0.70 0.18 145);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
																<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
															</svg>
														{/if}
													</button>
												</div>
											</div>
										</div>
									{/each}
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Pause All -->
			<button
				class="flex items-center gap-1 py-1 rounded font-mono text-[10px] tracking-wider uppercase transition-all duration-200 ease-out overflow-hidden"
				style="
					background: {pauseHovered ? 'linear-gradient(135deg, oklch(0.50 0.18 85) 0%, oklch(0.40 0.16 70) 100%)' : 'oklch(0.30 0.02 250)'};
					border: 1px solid {pauseHovered ? 'oklch(0.60 0.18 85)' : 'oklch(0.40 0.02 250)'};
					color: {pauseHovered ? 'oklch(0.95 0.05 85)' : 'oklch(0.70 0.16 85)'};
					padding-left: {pauseHovered ? '12px' : '8px'};
					padding-right: {pauseHovered ? '12px' : '8px'};
					box-shadow: {pauseHovered ? '0 0 20px oklch(0.55 0.18 85 / 0.4)' : 'none'};
					transform: {pauseHovered ? 'scale(1.05)' : 'scale(1)'};
				"
				onclick={handlePauseAll}
				disabled={pauseAllLoading || activeAgentCount === 0}
				title={activeAgentCount > 0 ? `Send Ctrl+C to ${activeAgentCount} session${activeAgentCount !== 1 ? 's' : ''}` : 'No active sessions'}
				onmouseenter={() => pauseHovered = true}
				onmouseleave={() => pauseHovered = false}
			>
				{#if pauseAllLoading}
					<span class="loading loading-spinner loading-xs"></span>
					<span>Pausing...</span>
				{:else}
					<svg class="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
					</svg>
					{#if pauseHovered && activeAgentCount > 0}
						<span class="whitespace-nowrap">Pause {activeAgentCount} Agent{activeAgentCount !== 1 ? 's' : ''}</span>
					{:else if pauseHovered && activeAgentCount === 0}
						<span class="whitespace-nowrap" style="color: oklch(0.60 0.02 250);">No Agents</span>
					{:else}
						<span class="hidden lg:inline">Pause</span>
					{/if}
				{/if}
			</button>

			<!-- Broadcast Toggle -->
			<button
				class="flex items-center gap-1 py-1 rounded font-mono text-[10px] tracking-wider uppercase transition-all duration-200 ease-out overflow-hidden"
				style="
					background: {bcastHovered || showBroadcastInput ? 'linear-gradient(135deg, oklch(0.45 0.18 240) 0%, oklch(0.35 0.16 255) 100%)' : 'oklch(0.30 0.02 250)'};
					border: 1px solid {bcastHovered || showBroadcastInput ? 'oklch(0.55 0.18 240)' : 'oklch(0.40 0.02 250)'};
					color: {bcastHovered || showBroadcastInput ? 'oklch(0.95 0.05 240)' : 'oklch(0.70 0.15 240)'};
					padding-left: {bcastHovered ? '12px' : '8px'};
					padding-right: {bcastHovered ? '12px' : '8px'};
					box-shadow: {bcastHovered ? '0 0 20px oklch(0.50 0.18 240 / 0.4)' : 'none'};
					transform: {bcastHovered ? 'scale(1.05)' : 'scale(1)'};
				"
				onclick={toggleBroadcastInput}
				title="Broadcast message to all agents"
				onmouseenter={() => bcastHovered = true}
				onmouseleave={() => bcastHovered = false}
			>
				<svg class="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
				</svg>
				{#if bcastHovered}
					<span class="whitespace-nowrap">Message All Agents</span>
				{:else}
					<span class="hidden lg:inline">Bcast</span>
				{/if}
			</button>

		</div>

		<!-- Broadcast Input (expandable) -->
		{#if showBroadcastInput}
			<div class="flex items-center gap-1">
				<input
					id="broadcast-input"
					type="text"
					bind:value={broadcastMessage}
					placeholder="Message to all agents..."
					class="input input-xs w-40 font-mono text-xs"
					style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.40 0.02 250); color: oklch(0.85 0.02 250);"
					onkeydown={(e) => e.key === 'Enter' && handleBroadcast()}
				/>
				<button
					class="btn btn-xs"
					style="background: oklch(0.35 0.15 240); border: none; color: oklch(0.95 0.02 250);"
					onclick={handleBroadcast}
					disabled={broadcastLoading || !broadcastMessage.trim()}
				>
					{#if broadcastLoading}
						<span class="loading loading-spinner loading-xs"></span>
					{:else}
						Send
					{/if}
				</button>
			</div>
		{/if}
	</div>

	<!-- Sort Dropdown (on /work or /tasks page) -->
	{#if isWorkPage}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="relative flex-none"
			onmouseenter={showSortMenu}
			onmouseleave={hideSortMenuDelayed}
		>
			<button
				class="flex items-center gap-1 py-1 mr-3 rounded font-mono text-[10px] tracking-wider uppercase transition-all duration-200 ease-out overflow-hidden"
				style="
					background: {sortHovered || showSortDropdown ? 'oklch(0.35 0.03 250)' : 'oklch(0.30 0.02 250)'};
					border: 1px solid {sortHovered || showSortDropdown ? 'oklch(0.50 0.03 250)' : 'oklch(0.40 0.02 250)'};
					color: oklch(0.80 0.02 250);
					padding-left: 8px;
					padding-right: 8px;
				"
				title="Sort work sessions"
				onmouseenter={() => sortHovered = true}
				onmouseleave={() => sortHovered = false}
			>
				<span class="text-xs">{currentSortIcon}</span>
				<span class="hidden sm:inline">{currentSortLabel}</span>
				<span class="text-[9px] opacity-70">{currentDir === 'asc' ? '▲' : '▼'}</span>
				<svg class="w-2.5 h-2.5 ml-0.5 transition-transform {showSortDropdown ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
				</svg>
			</button>

			<!-- Sort Dropdown Menu -->
			{#if showSortDropdown}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="absolute top-full left-0 mt-1 min-w-[160px] rounded-lg shadow-xl z-50 overflow-hidden"
					style="
						background: linear-gradient(180deg, oklch(0.22 0.02 250) 0%, oklch(0.18 0.02 250) 100%);
						border: 1px solid oklch(0.40 0.03 250);
					"
					onmouseenter={keepSortMenuOpen}
					onmouseleave={hideSortMenuDelayed}
				>
					<div class="px-3 py-2 border-b" style="border-color: oklch(0.30 0.02 250);">
						<span class="text-[9px] font-mono uppercase tracking-wider" style="color: oklch(0.55 0.02 250);">
							Sort Sessions
						</span>
					</div>
					<div class="py-1">
						{#each SORT_OPTIONS as opt (opt.value)}
							<button
								class="w-full px-3 py-2 text-left text-xs font-mono flex items-center gap-2 transition-colors"
								style="color: {currentSort === opt.value ? 'oklch(0.90 0.15 250)' : 'oklch(0.75 0.02 250)'}; background: {currentSort === opt.value ? 'oklch(0.30 0.05 250)' : 'transparent'};"
								onmouseenter={(e) => { if (currentSort !== opt.value) e.currentTarget.style.background = 'oklch(0.28 0.02 250)'; }}
								onmouseleave={(e) => { if (currentSort !== opt.value) e.currentTarget.style.background = 'transparent'; }}
								onclick={() => onSortSelect(opt.value)}
							>
								<span class="text-sm">{opt.icon}</span>
								<span class="flex-1">{opt.label}</span>
								{#if currentSort === opt.value}
									<span class="text-[10px] opacity-70">{currentDir === 'asc' ? '▲' : '▼'}</span>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Agent Sort Dropdown (on /agents page) -->
	{#if isAgentsPage}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="relative flex-none"
			onmouseenter={showSortMenu}
			onmouseleave={hideSortMenuDelayed}
		>
			<button
				class="flex items-center gap-1 py-1 mr-3 rounded font-mono text-[10px] tracking-wider uppercase transition-all duration-200 ease-out overflow-hidden"
				style="
					background: {sortHovered || showSortDropdown ? 'oklch(0.35 0.03 250)' : 'oklch(0.30 0.02 250)'};
					border: 1px solid {sortHovered || showSortDropdown ? 'oklch(0.50 0.03 250)' : 'oklch(0.40 0.02 250)'};
					color: oklch(0.80 0.02 250);
					padding-left: 8px;
					padding-right: 8px;
				"
				title="Sort agents"
				onmouseenter={() => sortHovered = true}
				onmouseleave={() => sortHovered = false}
			>
				<span class="text-xs">{currentAgentSortIcon}</span>
				<span class="hidden sm:inline">{currentAgentSortLabel}</span>
				<span class="text-[9px] opacity-70">{currentAgentDir === 'asc' ? '▲' : '▼'}</span>
				<svg class="w-2.5 h-2.5 ml-0.5 transition-transform {showSortDropdown ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
				</svg>
			</button>

			<!-- Agent Sort Dropdown Menu -->
			{#if showSortDropdown}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="absolute top-full left-0 mt-1 min-w-[160px] rounded-lg shadow-xl z-50 overflow-hidden"
					style="
						background: linear-gradient(180deg, oklch(0.22 0.02 250) 0%, oklch(0.18 0.02 250) 100%);
						border: 1px solid oklch(0.40 0.03 250);
					"
					onmouseenter={keepSortMenuOpen}
					onmouseleave={hideSortMenuDelayed}
				>
					<div class="px-3 py-2 border-b" style="border-color: oklch(0.30 0.02 250);">
						<span class="text-[9px] font-mono uppercase tracking-wider" style="color: oklch(0.55 0.02 250);">
							Sort Agents
						</span>
					</div>
					<div class="py-1">
						{#each AGENT_SORT_OPTIONS as opt (opt.value)}
							<button
								class="w-full px-3 py-2 text-left text-xs font-mono flex items-center gap-2 transition-colors"
								style="color: {currentAgentSort === opt.value ? 'oklch(0.90 0.15 250)' : 'oklch(0.75 0.02 250)'}; background: {currentAgentSort === opt.value ? 'oklch(0.30 0.05 250)' : 'transparent'};"
								onmouseenter={(e) => { if (currentAgentSort !== opt.value) e.currentTarget.style.background = 'oklch(0.28 0.02 250)'; }}
								onmouseleave={(e) => { if (currentAgentSort !== opt.value) e.currentTarget.style.background = 'transparent'; }}
								onclick={() => onAgentSortSelect(opt.value)}
							>
								<span class="text-sm">{opt.icon}</span>
								<span class="flex-1">{opt.label}</span>
								{#if currentAgentSort === opt.value}
									<span class="text-[10px] opacity-70">{currentAgentDir === 'asc' ? '▲' : '▼'}</span>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Server Sort Dropdown (on /servers page) -->
	{#if isServersPage}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="relative flex-none"
			onmouseenter={showSortMenu}
			onmouseleave={hideSortMenuDelayed}
		>
			<button
				class="flex items-center gap-1 py-1 mr-3 rounded font-mono text-[10px] tracking-wider uppercase transition-all duration-200 ease-out overflow-hidden"
				style="
					background: {sortHovered || showSortDropdown ? 'oklch(0.35 0.03 250)' : 'oklch(0.30 0.02 250)'};
					border: 1px solid {sortHovered || showSortDropdown ? 'oklch(0.50 0.03 250)' : 'oklch(0.40 0.02 250)'};
					color: oklch(0.80 0.02 250);
					padding-left: 8px;
					padding-right: 8px;
				"
				title="Sort servers"
				onmouseenter={() => sortHovered = true}
				onmouseleave={() => sortHovered = false}
			>
				<span class="text-xs">{currentServerSortIcon}</span>
				<span class="hidden sm:inline">{currentServerSortLabel}</span>
				<span class="text-[9px] opacity-70">{currentServerDir === 'asc' ? '▲' : '▼'}</span>
				<svg class="w-2.5 h-2.5 ml-0.5 transition-transform {showSortDropdown ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
				</svg>
			</button>

			<!-- Server Sort Dropdown Menu -->
			{#if showSortDropdown}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="absolute top-full left-0 mt-1 min-w-[160px] rounded-lg shadow-xl z-50 overflow-hidden"
					style="
						background: linear-gradient(180deg, oklch(0.22 0.02 250) 0%, oklch(0.18 0.02 250) 100%);
						border: 1px solid oklch(0.40 0.03 250);
					"
					onmouseenter={keepSortMenuOpen}
					onmouseleave={hideSortMenuDelayed}
				>
					<div class="px-3 py-2 border-b" style="border-color: oklch(0.30 0.02 250);">
						<span class="text-[9px] font-mono uppercase tracking-wider" style="color: oklch(0.55 0.02 250);">
							Sort Servers
						</span>
					</div>
					<div class="py-1">
						{#each SERVER_SORT_OPTIONS as opt (opt.value)}
							<button
								class="w-full px-3 py-2 text-left text-xs font-mono flex items-center gap-2 transition-colors"
								style="color: {currentServerSort === opt.value ? 'oklch(0.90 0.15 250)' : 'oklch(0.75 0.02 250)'}; background: {currentServerSort === opt.value ? 'oklch(0.30 0.05 250)' : 'transparent'};"
								onmouseenter={(e) => { if (currentServerSort !== opt.value) e.currentTarget.style.background = 'oklch(0.28 0.02 250)'; }}
								onmouseleave={(e) => { if (currentServerSort !== opt.value) e.currentTarget.style.background = 'transparent'; }}
								onclick={() => onServerSortSelect(opt.value)}
							>
								<span class="text-sm">{opt.icon}</span>
								<span class="flex-1">{opt.label}</span>
								{#if currentServerSort === opt.value}
									<span class="text-[10px] opacity-70">{currentServerDir === 'asc' ? '▲' : '▼'}</span>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Middle: Command Palette -->
	<div class="flex-none">
		<CommandPalette />
	</div>

	<!-- Vertical separator -->
	<div class="w-px h-6 mx-3" style="background: linear-gradient(180deg, transparent, oklch(0.45 0.02 250), transparent);"></div>

	<!-- Right side: Sparkline + Stats + User Profile (Industrial) -->
	<div class="flex-none flex items-center gap-2.5 pr-3">
		<!-- Sparkline (positioned LEFT of all badges, visibility controlled by user preference) -->
		{#if sparklineVisible && multiProjectData && multiProjectData.length > 0}
			<div class="hidden sm:block flex-shrink w-[80px] sm:w-[100px] md:w-[120px] lg:w-[150px] h-[20px]">
				<Sparkline
					multiSeriesData={multiProjectData.map((point) => {
						const projects: Record<string, { tokens: number; cost: number }> = {};
						for (const p of point.projects) {
							projects[p.project] = { tokens: p.tokens, cost: p.cost };
						}
						return {
							timestamp: point.timestamp,
							projects,
							total: { tokens: point.totalTokens, cost: point.totalCost }
						};
					})}
					projectMeta={(() => {
						const projectTotals = new Map<string, number>();
						for (const point of multiProjectData) {
							for (const p of point.projects) {
								projectTotals.set(p.project, (projectTotals.get(p.project) || 0) + p.tokens);
							}
						}
						const meta: Array<{ name: string; color: string; totalTokens: number }> = [];
						for (const [name, totalTokens] of projectTotals.entries()) {
							meta.push({
								name,
								color: projectColors[name] || '#888888',
								totalTokens
							});
						}
						return meta.sort((a, b) => b.totalTokens - a.totalTokens);
					})()}
					width="100%"
					height={20}
					showTooltip={true}
					showGrid={false}
					showStyleToolbar={true}
					showLegend={false}
					showLegendInToolbar={true}
				/>
			</div>
		{:else if sparklineVisible && sparklineData && sparklineData.length > 0}
			<div class="hidden sm:block flex-shrink w-[80px] sm:w-[100px] md:w-[120px] lg:w-[150px] h-[20px]">
				<Sparkline
					data={sparklineData}
					width="100%"
					height={20}
					colorMode="usage"
					showTooltip={true}
					showGrid={false}
					showStyleToolbar={true}
				/>
			</div>
		{/if}

		<!-- Agent Count Badge -->
		<div class="hidden sm:flex">
			<AgentCountBadge
				activeCount={activeAgentCount}
				totalCount={totalAgentCount}
				{activeAgents}
				{stateCounts}
				compact={true}
			/>
		</div>

		<!-- Token Usage Badge (without sparkline - moved above) -->
		<div class="hidden sm:flex">
			<TokenUsageBadge
				{tokensToday}
				{costToday}
				sparklineData={[]}
				multiProjectData={undefined}
				{projectColors}
				compact={true}
			/>
		</div>

		<!-- Tasks Completed Today Badge -->
		<div class="flex">
			<TasksCompletedBadge compact={true} />
		</div>

		<!-- WebSocket Status Indicator -->
		<WebSocketStatusIndicator />

		<!-- User Profile -->
		<UserProfile />
	</div>
</nav>

<style>
	/* Swarm Dropdown Panel */
	.swarm-dropdown-panel {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 0.25rem;
		z-index: 50;
		min-width: 320px;
		max-width: 400px;
		border-radius: 0.5rem;
		box-shadow: 0 10px 40px oklch(0 0 0 / 0.4);
		overflow: hidden;
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.35 0.02 250);
		animation: swarm-dropdown-slide 0.2s ease-out;
		transform-origin: top left;
	}

	@keyframes swarm-dropdown-slide {
		from {
			opacity: 0;
			transform: translateY(-8px) scale(0.96);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	/* Project header in dropdown */
	.swarm-project-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.75rem;
		background: oklch(0.14 0.02 250);
		border-bottom: 1px solid oklch(0.25 0.01 250);
		position: sticky;
		top: 0;
		z-index: 1;
	}

	.swarm-project-label {
		font-size: 0.65rem;
		font-weight: 600;
		color: oklch(0.70 0.10 30);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-family: ui-monospace, monospace;
		flex: 1;
	}

	.swarm-project-count {
		font-size: 0.6rem;
		color: oklch(0.50 0.02 250);
		padding: 0.125rem 0.375rem;
		background: oklch(0.22 0.02 250);
		border-radius: 8px;
	}

	/* Task row in dropdown */
	.swarm-task-row {
		display: block;
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: transparent;
		border: none;
		border-bottom: 1px solid oklch(0.25 0.01 250);
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.swarm-task-row:last-of-type {
		border-bottom: none;
	}

	.swarm-task-row:hover:not(:disabled) {
		background: oklch(0.25 0.02 250);
	}

	.swarm-task-row:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Menu item in dropdown (Quick Actions) */
	.swarm-menu-item {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: 100%;
		padding: 0.625rem 0.75rem;
		background: transparent;
		border: none;
		border-radius: 0.375rem;
		color: oklch(0.80 0.02 250);
		font-size: 0.75rem;
		font-family: ui-monospace, monospace;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
	}

	.swarm-menu-item:hover:not(:disabled) {
		background: oklch(0.28 0.03 250);
		color: oklch(0.90 0.02 250);
	}

	.swarm-menu-item:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.swarm-menu-item svg {
		color: oklch(0.65 0.15 145);
		flex-shrink: 0;
	}

	.swarm-menu-item:hover:not(:disabled) svg {
		color: oklch(0.75 0.18 145);
	}
</style>
