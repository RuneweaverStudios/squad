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
	import TopBar from '$lib/components/TopBar.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { getProjectsFromTasks, getTaskCountByProject } from '$lib/utils/projectUtils';
	import { initAudioOnInteraction, areSoundsEnabled, enableSounds, disableSounds } from '$lib/utils/soundEffects';

	let { children } = $props();

	// Shared project state for entire app
	let selectedProject = $state('All Projects');
	let allTasks = $state([]);

	// Agent count state
	let activeAgentCount = $state(0);
	let totalAgentCount = $state(0);
	let activeAgents = $state<string[]>([]);

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

	// Derived project data
	const projects = $derived(getProjectsFromTasks(allTasks));
	const taskCounts = $derived(getTaskCountByProject(allTasks, 'open'));

	// Sync selected project from URL parameter
	$effect(() => {
		const params = new URLSearchParams($page.url.searchParams);
		const projectParam = params.get('project');
		selectedProject = projectParam || 'All Projects';
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

	// Initialize theme-change and load all tasks
	onMount(() => {
		themeChange(false);
		Promise.all([loadAllTasks(), loadSparklineData()]);

		// Set up polling for token usage and sparkline (every 30 seconds)
		const interval = setInterval(() => {
			loadAllTasks();
			loadSparklineData();
		}, 30_000);

		return () => clearInterval(interval);
	});

	// Fetch all tasks to populate project dropdown and agent counts
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

	// Fetch sparkline data for TopBar (multi-project mode)
	async function loadSparklineData() {
		try {
			const response = await fetch('/api/agents/sparkline?range=24h&multiProject=true');
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
			console.error('Failed to fetch sparkline data:', error);
			sparklineData = [];
			multiProjectData = [];
			projectColors = {};
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

</script>

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
			{projects}
			{selectedProject}
			onProjectChange={handleProjectChange}
			{taskCounts}
			{activeAgentCount}
			{totalAgentCount}
			{activeAgents}
			{tokensToday}
			{costToday}
			{sparklineData}
			{multiProjectData}
			{projectColors}
		/>

		<!-- Page content -->
		<main class="flex-1 overflow-y-auto">
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
