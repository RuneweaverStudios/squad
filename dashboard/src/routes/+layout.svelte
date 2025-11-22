<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { themeChange } from 'theme-change';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import TaskCreationDrawer from '$lib/components/TaskCreationDrawer.svelte';
	import TopBar from '$lib/components/TopBar.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { getProjectsFromTasks, getTaskCountByProject } from '$lib/utils/projectUtils';

	let { children } = $props();

	// Shared project state for entire app
	let selectedProject = $state('All Projects');
	let allTasks = $state([]);

	// Derived project data
	const projects = $derived(getProjectsFromTasks(allTasks));
	const taskCounts = $derived(getTaskCountByProject(allTasks, 'open'));

	// Sync selected project from URL parameter
	$effect(() => {
		const params = new URLSearchParams($page.url.searchParams);
		const projectParam = params.get('project');
		selectedProject = projectParam || 'All Projects';
	});

	// Initialize theme-change and load all tasks
	onMount(async () => {
		themeChange(false);
		await loadAllTasks();
	});

	// Fetch all tasks to populate project dropdown
	async function loadAllTasks() {
		try {
			const response = await fetch('/api/agents?full=true');
			const data = await response.json();
			allTasks = data.tasks || [];
		} catch (error) {
			console.error('Failed to load tasks:', error);
			allTasks = [];
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

<!-- Global Command Palette (Cmd+K / Ctrl+K) -->
<CommandPalette />

<!-- Task Creation Drawer (opens from command palette) -->
<TaskCreationDrawer />

<!-- Drawer Structure -->
<div class="drawer lg:drawer-open">
	<!-- Drawer toggle (hidden checkbox for mobile sidebar) -->
	<input id="main-drawer" type="checkbox" class="drawer-toggle" />

	<!-- Main content area -->
	<div class="drawer-content flex flex-col">
		<!-- Top Bar -->
		<TopBar
			{projects}
			{selectedProject}
			onProjectChange={handleProjectChange}
			{taskCounts}
		/>

		<!-- Page content -->
		<main class="flex-1 overflow-y-auto">
			{@render children()}
		</main>
	</div>

	<!-- Sidebar -->
	<div class="drawer-side">
		<label for="main-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
		<Sidebar />
	</div>
</div>
