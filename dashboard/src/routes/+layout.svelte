<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { themeChange } from 'theme-change';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import TaskCreationDrawer from '$lib/components/TaskCreationDrawer.svelte';
	import SpawnModal from '$lib/components/SpawnModal.svelte';
	import OutputDrawer from '$lib/components/OutputDrawer.svelte';
	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import TopBar from '$lib/components/TopBar.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import TaskDetailDrawer from '$lib/components/TaskDetailDrawer.svelte';
	import { getTaskCountByProject } from '$lib/utils/projectUtils';
	import { initAudioOnInteraction, areSoundsEnabled, enableSounds, disableSounds, playNewTaskChime } from '$lib/utils/soundEffects';
	import { initSessionEvents, closeSessionEvents, connectSessionEvents, disconnectSessionEvents, lastSessionEvent } from '$lib/stores/sessionEvents';
	import { connectTaskEvents, disconnectTaskEvents, lastTaskEvent } from '$lib/stores/taskEvents';
	import { availableProjects, openTaskDrawer, isTaskDetailDrawerOpen, taskDetailDrawerTaskId, closeTaskDetailDrawer } from '$lib/stores/drawerStore';
	import { hoveredSessionName, triggerCompleteFlash, jumpToSession } from '$lib/stores/hoveredSession';
	import { get } from 'svelte/store';
	import { initPreferences } from '$lib/stores/preferences.svelte';
	import { getSessions as getWorkSessions } from '$lib/stores/workSessions.svelte';
	import { getSessions as getServerSessions } from '$lib/stores/serverSessions.svelte';

	let { children } = $props();

	// Shared project state for entire app
	let selectedProject = $state('All Projects');
	let allTasks = $state([]);
	let configProjects = $state<string[]>([]); // Projects from JAT config (visible ones)

	// Agent count state
	let activeAgentCount = $state(0);
	let totalAgentCount = $state(0);
	let activeAgents = $state<string[]>([]);

	// Agent state counts for badge display
	interface StateCounts {
		needsInput: number;
		working: number;
		review: number;
		completed: number;
		starting: number;
		idle: number;
	}
	let stateCounts = $state<StateCounts>({ needsInput: 0, working: 0, review: 0, completed: 0, starting: 0, idle: 0 });

	// Ready task count and list for Swarm button dropdown
	let readyTaskCount = $state(0);
	let readyTasks = $state<Array<{ id: string; title: string; priority: number; type: string; project: string }>>([]);

	// Epics with ready children for Run Epic feature
	interface EpicWithReady {
		id: string;
		title: string;
		project: string;
		readyCount: number;
		totalCount: number;
	}
	let epicsWithReady = $state<EpicWithReady[]>([]);

	// Review rules for settings preview
	interface ReviewRule {
		type: string;
		maxAutoPriority: number;
		note?: string;
	}
	let reviewRules = $state<ReviewRule[]>([]);

	// Token usage state for TopBar
	let tokensToday = $state(0);
	let costToday = $state(0);
	let sparklineData = $state<Array<{ timestamp: string; tokens: number; cost: number }>>([]);

	// Multi-project sparkline state
	interface ProjectTokenData {
		project: string;
		tokens: number;
		cost: number;
		color: string;
	}
	interface MultiProjectDataPoint {
		timestamp: string;
		totalTokens: number;
		totalCost: number;
		projects: ProjectTokenData[];
	}
	let multiProjectData = $state<MultiProjectDataPoint[]>([]);
	let projectColors = $state<Record<string, string>>({});

	// React to real-time task events from SSE (plays sound and refreshes data instantly)
	$effect(() => {
		const event = $lastTaskEvent;
		if (!event) return;

		if (event.type === 'task-change') {
			// Play sound for new tasks
			if (event.newTasks && event.newTasks.length > 0) {
				playNewTaskChime();
			}

			// Refresh task data immediately (fast version without usage data)
			loadAllTasksFast();
			loadReadyTaskCount();
			loadEpicsWithReady();
		}
	});

	// Derived project data
	// Use config projects (from JAT config) with "All Projects" prepended
	const projects = $derived(['All Projects', ...configProjects]);
	const taskCounts = $derived(getTaskCountByProject(allTasks, 'open'));

	// Sync selected project from URL parameter
	$effect(() => {
		const params = new URLSearchParams($page.url.searchParams);
		const projectParam = params.get('project');
		selectedProject = projectParam || 'All Projects';
	});

	// Sync available projects to drawer store (for TaskCreationDrawer)
	$effect(() => {
		// Use config projects directly (already excludes "All Projects")
		availableProjects.set(configProjects);
	});

	// Track if audio has been initialized and permission prompt state
	let audioInitialized = false;
	let showSoundPrompt = $state(false);
	let soundsEnabledState = $state(false);

	// Check sound preference on mount
	$effect(() => {
		if (typeof window !== 'undefined') {
			const preference = localStorage.getItem('dashboard-sounds-enabled');
			// Show prompt only if user hasn't made a choice yet
			if (preference === null) {
				showSoundPrompt = true;
			}
			soundsEnabledState = preference === 'true';
		}
	});

	// Handle user enabling sounds
	function handleEnableSounds() {
		enableSounds();
		soundsEnabledState = true;
		showSoundPrompt = false;
		// Play a test chime so user knows it works
		import('$lib/utils/soundEffects').then(({ playNewTaskChime }) => {
			playNewTaskChime();
		});
	}

	// Handle user dismissing sounds
	function handleDismissSounds() {
		disableSounds();
		soundsEnabledState = false;
		showSoundPrompt = false;
	}

	// Initialize audio on first user click (browser requirement)
	function handleFirstInteraction() {
		if (!audioInitialized) {
			initAudioOnInteraction();
			audioInitialized = true;
		}
	}

	// Initialize theme-change, SSE, preferences, and load all tasks
	onMount(() => {
		initPreferences(); // Initialize unified preferences store
		themeChange(false);
		initSessionEvents(); // Initialize cross-page session events (BroadcastChannel)
		connectSessionEvents(); // Connect to real-time session events SSE
		connectTaskEvents(); // Connect to real-time task events SSE
		// Load critical data first (tasks, projects, state counts)
		// Sparkline is deferred to avoid blocking the initial page render
		Promise.all([loadAllTasks(), loadReadyTaskCount(), loadConfigProjects(), loadStateCounts(), loadEpicsWithReady(), loadReviewRules()]);

		// DISABLED: All polling removed - SSE handles real-time updates
		// - Sparkline disabled (too slow, 5+ seconds)
		// - stateCountsInterval disabled (SSE triggers loadStateCounts on session events)

		return () => {
			closeSessionEvents(); // Close cross-page BroadcastChannel
			disconnectSessionEvents(); // Disconnect from session events SSE
			disconnectTaskEvents(); // Disconnect from task events SSE
		};
	});

	// React to session events from other pages/tabs (e.g., session killed on /work)
	// ONLY refresh on session-created/session-destroyed, NOT on frequent events like session-output
	$effect(() => {
		const event = $lastSessionEvent;
		if (!event) return;

		// Only refresh data on significant session lifecycle events
		// session-output and session-state fire every 1-2 seconds and would cause constant lag
		if (event.type === 'session-created' || event.type === 'session-destroyed') {
			loadAllTasksFast(); // Use fast version without usage data
			loadReadyTaskCount();
			loadStateCounts();
			loadEpicsWithReady();
		}
	});

	// Fetch all tasks to populate project dropdown and agent counts
	// Fast task loader - no usage data, ~100ms (for reactive updates)
	async function loadAllTasksFast() {
		try {
			const response = await fetch('/api/agents?full=true');
			const data = await response.json();
			allTasks = data.tasks || [];

			// Update agent counts
			if (data.agent_counts) {
				activeAgentCount = data.agent_counts.activeCount || 0;
				totalAgentCount = data.agent_counts.totalCount || 0;
				activeAgents = data.agent_counts.activeAgents || [];
			}
		} catch (error) {
			console.error('Failed to load tasks (fast):', error);
			allTasks = [];
		}
	}

	// Full task loader - includes usage data, ~2-4s (for initial load + background refresh)
	async function loadAllTasks() {
		try {
			const response = await fetch('/api/agents?full=true&usage=true');
			const data = await response.json();
			allTasks = data.tasks || [];

			// Update agent counts
			if (data.agent_counts) {
				activeAgentCount = data.agent_counts.activeCount || 0;
				totalAgentCount = data.agent_counts.totalCount || 0;
				activeAgents = data.agent_counts.activeAgents || [];
			}

			// Calculate token usage from agents
			const agents = data.agents || [];
			let totalTokens = 0;
			let totalCost = 0;

			agents.forEach((agent: any) => {
				if (agent.usage?.today) {
					totalTokens += agent.usage.today.total_tokens || 0;
					totalCost += agent.usage.today.cost || 0;
				}
			});

			tokensToday = totalTokens;
			costToday = totalCost;
		} catch (error) {
			console.error('Failed to load tasks:', error);
			allTasks = [];
		}
	}

	// Fetch agent session state counts for badge display
	async function loadStateCounts() {
		try {
			const response = await fetch('/api/work?lines=50');
			const data = await response.json();

			if (data.stateCounts) {
				stateCounts = data.stateCounts;
			}
		} catch (error) {
			console.error('Failed to load state counts:', error);
		}
	}

	// Fetch sparkline data for TopBar (multi-project mode)
	// Uses AbortController with timeout to prevent indefinite blocking
	let sparklineAbortController: AbortController | null = null;

	async function loadSparklineData() {
		// Abort any in-flight sparkline request
		if (sparklineAbortController) {
			sparklineAbortController.abort();
		}
		sparklineAbortController = new AbortController();

		try {
			// 15-second timeout - sparkline can take 5+ seconds but shouldn't hang forever
			const timeoutId = setTimeout(() => sparklineAbortController?.abort(), 15000);

			const response = await fetch('/api/agents/sparkline?range=24h&multiProject=true', {
				signal: sparklineAbortController.signal
			});

			clearTimeout(timeoutId);

			const result = await response.json();

			if (result.error) {
				console.error('Sparkline API error:', result.error);
				sparklineData = [];
				multiProjectData = [];
				projectColors = {};
				return;
			}

			// Multi-project response
			multiProjectData = result.data || [];
			projectColors = result.projectColors || {};

			// Update total tokens/cost from multi-project data
			tokensToday = result.totalTokens || 0;
			costToday = result.totalCost || 0;

			// Also create single-series sparkline for backward compatibility
			// (in case any component needs it)
			sparklineData = (result.data || []).map((point: MultiProjectDataPoint) => ({
				timestamp: point.timestamp,
				tokens: point.totalTokens,
				cost: point.totalCost
			}));
		} catch (error) {
			// Ignore abort errors (expected when navigating away or refreshing)
			if (error instanceof Error && error.name === 'AbortError') {
				return;
			}
			console.error('Failed to fetch sparkline data:', error);
			sparklineData = [];
			multiProjectData = [];
			projectColors = {};
		}
	}

	// Fetch ready task count and list for Swarm button
	async function loadReadyTaskCount() {
		try {
			const response = await fetch('/api/tasks/ready');
			const data = await response.json();
			readyTaskCount = data.count || 0;
			readyTasks = data.tasks || [];
		} catch (error) {
			console.error('Failed to fetch ready task count:', error);
			readyTaskCount = 0;
			readyTasks = [];
		}
	}

	// Fetch epics with ready children for Run Epic feature
	async function loadEpicsWithReady() {
		try {
			// Get all tasks and filter for open epics
			const response = await fetch('/api/tasks?status=open');
			const data = await response.json();
			const epics = (data.tasks || []).filter((t: any) => t.issue_type === 'epic');

			// For each epic, get its ready children count
			const epicsData: EpicWithReady[] = [];

			for (const epic of epics) {
				try {
					const childResponse = await fetch(`/api/epics/${epic.id}/children`);
					if (childResponse.ok) {
						const childData = await childResponse.json();
						if (childData.summary?.ready > 0) {
							epicsData.push({
								id: epic.id,
								title: epic.title,
								project: epic.project || epic.id.split('-')[0],
								readyCount: childData.summary.ready,
								totalCount: childData.summary.total
							});
						}
					}
				} catch {
					// Skip epics we can't fetch children for
				}
			}

			epicsWithReady = epicsData.sort((a, b) => b.readyCount - a.readyCount);
		} catch (error) {
			console.error('Failed to fetch epics with ready:', error);
			epicsWithReady = [];
		}
	}

	// Fetch review rules for settings preview
	async function loadReviewRules() {
		try {
			const response = await fetch('/api/review-rules');
			const data = await response.json();
			reviewRules = data.rules || [];
		} catch (error) {
			console.error('Failed to fetch review rules:', error);
			reviewRules = [];
		}
	}

	// Fetch visible projects from JAT config (with stats for sorting by activity)
	async function loadConfigProjects() {
		try {
			const response = await fetch('/api/projects?visible=true&stats=true');
			const data = await response.json();
			// Extract project names from the config (already sorted by last activity)
			configProjects = (data.projects || []).map((p: { name: string }) => p.name);
		} catch (error) {
			console.error('Failed to fetch config projects:', error);
			configProjects = [];
		}
	}

	// Handle project selection change
	function handleProjectChange(project: string) {
		selectedProject = project;

		// Update URL parameter (use goto to trigger reactivity in child pages)
		const url = new URL(window.location.href);
		if (project === 'All Projects') {
			url.searchParams.delete('project');
		} else {
			url.searchParams.set('project', project);
		}
		goto(url.toString(), { replaceState: true, noScroll: true, keepFocus: true });
	}

	// Global keyboard shortcuts
	async function handleGlobalKeydown(event: KeyboardEvent) {
		// Alt+N = Open new task drawer (works from anywhere, even in inputs)
		if (event.altKey && event.code === 'KeyN') {
			event.preventDefault();
			openTaskDrawer();
			return;
		}

		// Alt+A = Attach terminal to hovered session
		if (event.altKey && event.code === 'KeyA') {
			event.preventDefault();
			const sessionName = get(hoveredSessionName);
			if (sessionName) {
				try {
					const response = await fetch(`/api/work/${encodeURIComponent(sessionName)}/attach`, {
						method: 'POST'
					});
					if (!response.ok) {
						console.error('Failed to attach to session:', await response.text());
					}
				} catch (err) {
					console.error('Error attaching to session:', err);
				}
			}
			return;
		}

		// Alt+C = Complete task for hovered session (sends /jat:complete command)
		if (event.altKey && event.code === 'KeyC') {
			event.preventDefault();
			const sessionName = get(hoveredSessionName);
			if (sessionName) {
				// Trigger visual feedback immediately
				triggerCompleteFlash(sessionName);
				try {
					// Send Ctrl+C first to clear any stray characters in input
					await fetch(`/api/work/${encodeURIComponent(sessionName)}/input`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ type: 'ctrl-c' })
					});
					await new Promise((r) => setTimeout(r, 50));
					// Send the command text (API appends Enter for type='text')
					const response = await fetch(`/api/work/${encodeURIComponent(sessionName)}/input`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							type: 'text',
							input: '/jat:complete'
						})
					});
					if (!response.ok) {
						console.error('Failed to send complete command:', await response.text());
					} else {
						// Send extra Enter after delay - Claude Code needs double Enter for slash commands
						await new Promise((r) => setTimeout(r, 100));
						await fetch(`/api/work/${encodeURIComponent(sessionName)}/input`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ type: 'enter' })
						});
					}
				} catch (err) {
					console.error('Error sending complete command:', err);
				}
			}
			return;
		}

		// Alt+S = Spawn new session for first project (most recent)
		if (event.altKey && event.code === 'KeyS') {
			event.preventDefault();
			// Get project path from /api/projects (sorted by recent activity)
			try {
				const projectsResponse = await fetch('/api/projects?visible=true&stats=true');
				const projectsData = await projectsResponse.json();
				const firstProject = projectsData.projects?.[0];
				if (firstProject?.path) {
					const response = await fetch('/api/work/spawn', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							project: firstProject.path,
							attach: true
						})
					});
					if (!response.ok) {
						console.error('Failed to spawn session:', await response.text());
					}
				}
			} catch (err) {
				console.error('Error spawning session:', err);
			}
			return;
		}

		// Alt+K = Kill hovered session (closes task and kills tmux session)
		if (event.altKey && event.code === 'KeyK') {
			event.preventDefault();
			const sessionName = get(hoveredSessionName);
			if (sessionName) {
				try {
					const response = await fetch(`/api/work/${encodeURIComponent(sessionName)}`, {
						method: 'DELETE'
					});
					if (!response.ok) {
						console.error('Failed to kill session:', await response.text());
					}
				} catch (err) {
					console.error('Error killing session:', err);
				}
			}
			return;
		}

		// Alt+I = Interrupt hovered session (send Ctrl+C)
		if (event.altKey && event.code === 'KeyI') {
			event.preventDefault();
			const sessionName = get(hoveredSessionName);
			if (sessionName) {
				try {
					const response = await fetch(`/api/work/${encodeURIComponent(sessionName)}/input`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ type: 'ctrl-c' })
					});
					if (!response.ok) {
						console.error('Failed to interrupt session:', await response.text());
					}
				} catch (err) {
					console.error('Error interrupting session:', err);
				}
			}
			return;
		}

		// Alt+P = Pause hovered session (send /jat:pause command)
		if (event.altKey && event.code === 'KeyP') {
			event.preventDefault();
			const sessionName = get(hoveredSessionName);
			if (sessionName) {
				try {
					// Send Ctrl+C first to clear any stray characters in input
					await fetch(`/api/work/${encodeURIComponent(sessionName)}/input`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ type: 'ctrl-c' })
					});
					await new Promise((r) => setTimeout(r, 50));
					// Send the pause command
					const response = await fetch(`/api/work/${encodeURIComponent(sessionName)}/input`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							type: 'text',
							input: '/jat:pause'
						})
					});
					if (!response.ok) {
						console.error('Failed to send pause command:', await response.text());
					} else {
						// Send extra Enter after delay - Claude Code needs double Enter for slash commands
						await new Promise((r) => setTimeout(r, 100));
						await fetch(`/api/work/${encodeURIComponent(sessionName)}/input`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ type: 'enter' })
						});
					}
				} catch (err) {
					console.error('Error sending pause command:', err);
				}
			}
			return;
		}

		// Alt+R = Restart hovered session (kill and respawn with same task)
		if (event.altKey && event.code === 'KeyR') {
			event.preventDefault();
			const sessionName = get(hoveredSessionName);
			if (sessionName) {
				try {
					const response = await fetch(`/api/work/${encodeURIComponent(sessionName)}/restart`, {
						method: 'POST'
					});
					if (!response.ok) {
						console.error('Failed to restart session:', await response.text());
					}
				} catch (err) {
					console.error('Error restarting session:', err);
				}
			}
			return;
		}

		// Alt+1 through Alt+9 = Jump to Nth session (work sessions first, then server sessions)
		if (event.altKey && event.code >= 'Digit1' && event.code <= 'Digit9') {
			event.preventDefault();
			const index = parseInt(event.code.replace('Digit', ''), 10) - 1; // 0-indexed

			// Get combined session list: work sessions first, then server sessions
			const workSessions = getWorkSessions();
			const serverSessions = getServerSessions();

			// Combine sessions with work sessions first
			const allSessions: Array<{ sessionName: string; agentName?: string; type: 'work' | 'server' }> = [
				...workSessions.map(s => ({ sessionName: s.sessionName, agentName: s.agentName, type: 'work' as const })),
				...serverSessions.map(s => ({ sessionName: s.sessionName, type: 'server' as const }))
			];

			if (index < allSessions.length) {
				const session = allSessions[index];
				jumpToSession(session.sessionName, session.agentName);
			}
			return;
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<!-- Drawer Structure -->
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="drawer lg:drawer-open" onclick={handleFirstInteraction}>
	<!-- Drawer toggle (hidden checkbox for mobile sidebar) -->
	<input id="main-drawer" type="checkbox" class="drawer-toggle" />

	<!-- Main content area -->
	<div class="drawer-content flex flex-col h-screen">
		<!-- Top Bar -->
		<TopBar
			{activeAgentCount}
			{totalAgentCount}
			{activeAgents}
			{stateCounts}
			{tokensToday}
			{costToday}
			sparklineData={[]}
			multiProjectData={[]}
			projectColors={{}}
			{readyTaskCount}
			{readyTasks}
			{projects}
			{selectedProject}
			{epicsWithReady}
			{reviewRules}
		/>

		<!-- Page content -->
		<main class="flex-1 min-h-0 overflow-y-auto">
			{@render children()}
		</main>

		<!-- Task Creation Drawer (must be inside drawer-content for proper positioning) -->
		<TaskCreationDrawer />
	</div>

	<!-- Spawn Modal (must be inside drawer for proper z-index) -->
	<SpawnModal />

	<!-- Sidebar (Sidebar component provides the drawer-side wrapper) -->
	<Sidebar />
</div>

<!-- Output Drawer (global session output panel) -->
<OutputDrawer />

<!-- Global Task Detail Drawer (for inspecting tasks from anywhere) -->
<TaskDetailDrawer
	bind:taskId={$taskDetailDrawerTaskId}
	bind:isOpen={$isTaskDetailDrawerOpen}
/>

<!-- Global Toast Notifications -->
<ToastContainer />

<!-- Sound Permission Toast -->
{#if showSoundPrompt}
	<div class="toast toast-end toast-bottom z-50">
		<div class="alert shadow-lg" style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.35 0.02 250);">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6" style="color: oklch(0.70 0.18 240);">
				<path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
			</svg>
			<div>
				<h3 class="font-bold text-sm" style="color: oklch(0.85 0.02 250);">Enable Sound Notifications?</h3>
				<p class="text-xs" style="color: oklch(0.60 0.02 250);">Play chimes when tasks are added/removed</p>
			</div>
			<div class="flex gap-2">
				<button class="btn btn-sm btn-ghost" onclick={handleDismissSounds}>
					No thanks
				</button>
				<button class="btn btn-sm btn-primary" onclick={handleEnableSounds}>
					Enable
				</button>
			</div>
		</div>
	</div>
{/if}
