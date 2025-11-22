<script lang="ts">
	/**
	 * TopBar Component - Horizontal utilities bar
	 *
	 * Simplified navigation bar containing only utility components:
	 * - Hamburger toggle (mobile only, for sidebar)
	 * - ProjectSelector
	 * - ClaudeUsageBar
	 * - UserProfile
	 *
	 * Navigation buttons (List, Graph, Agents) removed - moved to Sidebar
	 *
	 * Props:
	 * - projects: string[] (for project dropdown)
	 * - selectedProject: string (current project selection)
	 * - onProjectChange: (project: string) => void
	 * - taskCounts: Map<string, number> (optional task counts per project)
	 */

	import ProjectSelector from './ProjectSelector.svelte';
	import ClaudeUsageBar from './ClaudeUsageBar.svelte';
	import UserProfile from './UserProfile.svelte';
	import CommandPalette from './CommandPalette.svelte';

	interface Props {
		projects?: string[];
		selectedProject?: string;
		onProjectChange?: (project: string) => void;
		taskCounts?: Map<string, number> | null;
	}

	let {
		projects = [],
		selectedProject = 'All Projects',
		onProjectChange = () => {},
		taskCounts = null
	}: Props = $props();
</script>

<nav class="navbar w-full bg-base-100 border-b border-base-300">
	<!-- Sidebar toggle icon -->
	<label for="main-drawer" aria-label="open sidebar" class="btn btn-square btn-ghost">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			stroke-linejoin="round"
			stroke-linecap="round"
			stroke-width="2"
			fill="none"
			stroke="currentColor"
			class="my-1.5 inline-block size-4"
		>
			<path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"></path>
			<path d="M9 4v16"></path>
			<path d="M14 10l2 2l-2 2"></path>
		</svg>
	</label>

	<!-- Left side utilities -->
	<div class="flex-1 gap-2 px-4">
		{#if projects.length > 0}
			<div class="w-36 sm:w-40 md:w-48">
				<ProjectSelector
					{projects}
					{selectedProject}
					{onProjectChange}
					{taskCounts}
					compact={true}
				/>
			</div>
		{/if}
	</div>

	<!-- Middle: Command Palette -->
	<div class="flex-none">
		<CommandPalette />
	</div>

	<!-- Right side utilities -->
	<div class="flex-none flex items-center gap-2">
		<!-- Claude Usage Bar -->
		<ClaudeUsageBar />

		<!-- User Profile -->
		<UserProfile />
	</div>
</nav>
