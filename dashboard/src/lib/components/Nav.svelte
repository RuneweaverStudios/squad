<script lang="ts">
	/**
	 * Nav Component - Reusable navigation bar for dashboard pages
	 *
	 * Fixes 3-row wrapping issue with:
	 * - flex-nowrap on controls container
	 * - Optimized spacing (gap-1.5 instead of gap-2)
	 * - Responsive design with hidden labels on small screens
	 * - Single-row layout guaranteed
	 *
	 * Props:
	 * - context: 'home' | 'agents' | 'api-demo'
	 * - projects: string[] (for project dropdown)
	 * - selectedProject: string (current project selection)
	 * - onProjectChange: (project: string) => void
	 * - taskCounts: Map<string, number> (optional task counts per project)
	 * - showProjectFilter: boolean (show project selector, default: false)
	 * - viewMode: 'list' | 'graph' (for home page toggle)
	 * - onViewModeChange: (mode: string) => void
	 */

	import ThemeSelector from './ThemeSelector.svelte';
	import ProjectSelector from './ProjectSelector.svelte';
	import Breadcrumbs from './Breadcrumbs.svelte';

	interface Props {
		context: 'home' | 'agents' | 'api-demo';
		projects?: string[];
		selectedProject?: string;
		onProjectChange?: (project: string) => void;
		taskCounts?: Map<string, number> | null;
		showProjectFilter?: boolean;
		viewMode?: 'list' | 'graph';
		onViewModeChange?: (mode: string) => void;
	}

	let {
		context,
		projects = [],
		selectedProject = 'All Projects',
		onProjectChange = () => {},
		taskCounts = null,
		showProjectFilter = false,
		viewMode = 'list',
		onViewModeChange = () => {}
	}: Props = $props();

	// Context-specific configuration
	const contextConfig = {
		home: {
			title: 'Beads Task Dashboard',
			subtitle: 'Multi-project task management powered by Beads + Agent Mail',
			links: [
				{ href: '/agents', label: 'Agents', icon: 'users' }
			],
			showViewToggle: true
		},
		agents: {
			title: 'Agents',
			subtitle: 'Task assignment and agent coordination powered by Agent Mail + Beads',
			links: [
				{ href: '/', label: 'Home', icon: 'list' }
			],
			showViewToggle: false
		},
		'api-demo': {
			title: 'API Demo',
			subtitle: 'Interactive API testing and exploration',
			links: [
				{ href: '/', label: 'Home', icon: 'list' },
				{ href: '/agents', label: 'Agents', icon: 'users' }
			],
			showViewToggle: false
		}
	};

	const config = $derived(contextConfig[context]);

	// Icon SVG paths
	const icons: Record<string, string> = {
		list: 'M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z',
		graph: 'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5',
		users: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z'
	};
</script>

<div class="navbar bg-base-100 border-b border-base-300">
	<!-- Left: Title, Subtitle & Breadcrumbs -->
	<div class="flex-1 min-w-0">
		<div class="w-full">
			<h1 class="text-2xl font-bold text-base-content truncate">{config.title}</h1>
			<p class="text-sm text-base-content/70 hidden sm:block truncate">
				{config.subtitle}
			</p>
			<!-- Breadcrumbs (only show on non-home pages) -->
			{#if context !== 'home'}
				<div class="mt-1">
					<Breadcrumbs {context} />
				</div>
			{/if}
		</div>
	</div>

	<!-- Right: Controls (flex-nowrap prevents wrapping) -->
	<div class="flex-none flex flex-nowrap items-center gap-1.5">
		<!-- View Mode Toggle (Home page only) -->
		{#if config.showViewToggle}
			<div class="join">
				<button
					class="btn btn-sm join-item {viewMode === 'list' ? 'btn-primary' : 'btn-ghost'}"
					onclick={() => onViewModeChange('list')}
					aria-label="List view"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="w-4 h-4"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d={icons.list} />
					</svg>
					<span class="hidden md:inline ml-1">List</span>
				</button>
				<button
					class="btn btn-sm join-item {viewMode === 'graph' ? 'btn-primary' : 'btn-ghost'}"
					onclick={() => onViewModeChange('graph')}
					aria-label="Graph view"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="w-4 h-4"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d={icons.graph} />
					</svg>
					<span class="hidden md:inline ml-1">Graph</span>
				</button>
			</div>
		{/if}

		<!-- Navigation Links -->
		{#each config.links as link}
			<a href={link.href} class="btn btn-sm btn-ghost" aria-label={link.label}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-4 h-4"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d={icons[link.icon]} />
				</svg>
				<span class="hidden lg:inline ml-1">{link.label}</span>
			</a>
		{/each}

		<!-- Project Filter (Agents page only) -->
		{#if showProjectFilter && projects.length > 0}
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

		<!-- Theme Selector -->
		<ThemeSelector />
	</div>
</div>
