<script lang="ts">
	/**
	 * Sidebar Component - Vertical navigation using DaisyUI drawer sidebar pattern
	 *
	 * Features:
	 * - Vertical nav menu with 5 main routes (List, Dependency, Timeline, Kanban, Agents)
	 * - Active state highlighting based on current route
	 * - Icon + label layout with tooltips when collapsed
	 * - Responsive: Full-width on desktop (lg:drawer-open), collapsible on mobile
	 * - Bottom utilities: Help button, Theme selector
	 * - Smooth transitions between collapsed/open states
	 *
	 * Usage: Place inside drawer-side div in root layout
	 *
	 * Collapsible Sidebar:
	 * - Uses isSidebarCollapsed store for desktop collapse state
	 * - When collapsed: narrow width (w-14), shows tooltips on hover
	 * - When expanded: full width (w-64), shows labels
	 * - Toggle via hamburger button in TopBar
	 */

	import { page } from '$app/stores';
	import { unifiedNavConfig } from '$lib/config/navConfig';
	import { isSidebarCollapsed, gitChangesCount, activeSessionsCount, runningServersCount, activeAgentSessionsCount, fileChangesCount } from '$lib/stores/drawerStore';

	// Helper to check if nav item is active
	function isActive(href: string): boolean {
		const currentPath = $page.url.pathname;
		// Prefix match for routes (e.g., /work, /dash, /projects)
		// Note: No root route (/) in nav anymore - redirects to /work
		if (currentPath.startsWith(href)) {
			return true;
		}
		return false;
	}

	// Icon SVG paths (Heroicons outline)
	const icons: Record<string, string> = {
		// MAIN: Core workflow
		tasks: 'M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
		files: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
		source: 'M6 3v12M6 21a3 3 0 100-6 3 3 0 000 6zM18 9a3 3 0 100-6 3 3 0 000 6zM18 9a9 9 0 01-9 9',
		servers: 'M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z',
		integrations: 'M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z',
		tmux: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
		dashboard: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
		automation: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
		history: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
		settings: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
		projects: 'M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z',
		// VIEWS: Alternative visualizations
		graph: 'M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z',
		timeline: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
		columns: 'M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z',
		// LABS: Experimental features
		swarm: 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
		beaker: 'M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 5.607c.28 1.12-.62 2.093-1.772 2.093H4.57c-1.152 0-2.052-.973-1.772-2.093L5 14.5',
		// Utilities
		help: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
	};

	// Filter nav items by category
	const mainItems = unifiedNavConfig.navItems.filter((item) => item.category === 'main');
	const viewsItems = unifiedNavConfig.navItems.filter((item) => item.category === 'views');
	const labsItems = unifiedNavConfig.navItems.filter((item) => item.category === 'labs');

	// Help modal state
	let showHelpModal = $state(false);
	let activeHelpTab = $state('keyboard'); // 'keyboard', 'commands', 'readme'

	function toggleHelp() {
		showHelpModal = !showHelpModal;
	}

	function setHelpTab(tab: string) {
		activeHelpTab = tab;
	}
</script>

<!-- Industrial/Terminal Sidebar -->
<div class="drawer-side {$isSidebarCollapsed ? 'overflow-visible' : ''}">
	<!-- Drawer overlay -->
	<label for="main-drawer" aria-label="close sidebar" class="drawer-overlay"></label>

	<!-- Sidebar content -->
	<div
		class="flex h-screen flex-col transition-all duration-200 relative z-40 {$isSidebarCollapsed ? 'w-14 overflow-visible' : 'w-40 overflow-hidden'}"
		style="
			background: linear-gradient(180deg, oklch(0.22 0.01 250) 0%, oklch(0.18 0.01 250) 100%);
		"
	>
		<!-- Right accent bar (acts as border) -->
		<div
			class="absolute right-0 top-0 bottom-0 w-px"
			style="background: oklch(0.35 0.02 250);"
		></div>

		<!-- Logo (Industrial) -->
		<div class="py-4 flex justify-center relative">
			<a
				href="https://github.com/joewinke/jat"
				target="_blank"
				rel="noopener noreferrer"
				class="group transition-all duration-200 hover:scale-105"
			>
				<div
					class="px-1.5 py-1.5 rounded font-mono font-bold text-sm tracking-widest"
					style="
						background: linear-gradient(135deg, oklch(0.70 0.18 240 / 0.15) 0%, oklch(0.70 0.18 240 / 0.05) 100%);
						border: 1px solid oklch(0.70 0.18 240 / 0.3);
						color: oklch(0.75 0.16 240);
						text-shadow: 0 0 15px oklch(0.70 0.18 240 / 0.5);
					"
				>
					JAT
				</div>
			</a>
			<!-- Decorative line under logo -->
			<div
				class="absolute bottom-0 left-3 right-3 h-px"
				style="background: linear-gradient(90deg, transparent, oklch(0.45 0.02 250), transparent);"
			></div>
		</div>

		<!-- Main navigation items -->
		<nav class="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
			<!-- MAIN: Core workflow -->
			{#each mainItems as navItem, index}
				{@const active = isActive(navItem.href)}
				<a
					href={navItem.href}
					class="w-full flex items-center gap-3 px-3 py-2.5 rounded transition-all duration-200 group relative
						{$isSidebarCollapsed ? 'justify-center tooltip tooltip-right fade-in-left fade-in-delay-' + index : ''}
						{active ? '' : 'industrial-hover'}"
					style="
						background: {active ? 'linear-gradient(90deg, oklch(0.70 0.18 240 / 0.2) 0%, transparent 100%)' : 'transparent'};
						border-left: 2px solid {active ? 'oklch(0.70 0.18 240)' : 'transparent'};
						color: {active ? 'oklch(0.80 0.15 240)' : 'oklch(0.65 0.02 250)'};
						text-decoration: none;
					"
					data-tip={navItem.label}
				>
					<!-- Icon with glow on active -->
					<div
						class="flex items-center justify-center w-6 h-6 rounded transition-all {$isSidebarCollapsed ? 'puff-in-center' : ''}"
						style="
							background: {active ? 'oklch(0.70 0.18 240 / 0.15)' : 'transparent'};
							box-shadow: {active ? '0 0 10px oklch(0.70 0.18 240 / 0.3)' : 'none'};
						"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width={active ? 2 : 1.5}
							stroke="currentColor"
							class="w-4.5 h-4.5 transition-all {active ? '' : 'group-hover:scale-110'}"
							style="color: {active ? 'oklch(0.75 0.16 240)' : 'oklch(0.55 0.02 250)'};"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d={icons[navItem.icon]} />
						</svg>
					</div>

					<!-- Label (hidden when collapsed) -->
					{#if !$isSidebarCollapsed}
						<span
							class="fade-in font-mono text-xs tracking-wider uppercase transition-colors
								{active ? '' : 'group-hover:text-base-content/80'}"
							style="text-shadow: {active ? '0 0 10px oklch(0.70 0.18 240 / 0.4)' : 'none'};"
						>
							<span class="tracking-in-expand">{navItem.label}</span>
						</span>

						<!-- Git changes badge for Source (VSCode convention: show changed files count on source control) -->
						{#if navItem.id === 'source' && $gitChangesCount > 0}
							<span
								class="font-mono text-[10px] px-1.5 py-0.5 rounded-full ml-auto"
								style="
									background: oklch(0.55 0.15 220 / 0.25);
									color: oklch(0.80 0.12 220);
									border: 1px solid oklch(0.55 0.15 220 / 0.4);
								"
								title="{$gitChangesCount} file{$gitChangesCount === 1 ? '' : 's'} with changes"
							>
								{$gitChangesCount}
							</span>
						{/if}

						<!-- Active sessions badge for Sessions -->
						{#if navItem.id === 'sessions' && $activeSessionsCount > 0}
							<span
								class="font-mono text-[10px] px-1.5 py-0.5 rounded-full ml-auto"
								style="
									background: oklch(0.55 0.15 145 / 0.25);
									color: oklch(0.75 0.15 145);
									border: 1px solid oklch(0.55 0.15 145 / 0.4);
								"
								title="{$activeSessionsCount} active session{$activeSessionsCount === 1 ? '' : 's'}"
							>
								{$activeSessionsCount}
							</span>
						{/if}

						<!-- Running servers badge for Servers -->
						{#if navItem.id === 'servers' && $runningServersCount > 0}
							<span
								class="font-mono text-[10px] px-1.5 py-0.5 rounded-full ml-auto"
								style="
									background: oklch(0.50 0.02 250 / 0.3);
									color: oklch(0.75 0.02 250);
									border: 1px solid oklch(0.50 0.02 250 / 0.4);
								"
								title="{$runningServersCount} running server{$runningServersCount === 1 ? '' : 's'}"
							>
								{$runningServersCount}
							</span>
						{/if}

						<!-- Active agent sessions badge for Tasks (agents working on tasks) -->
						{#if navItem.id === 'tasks' && $activeAgentSessionsCount > 0}
							<span
								class="font-mono text-[10px] px-1.5 py-0.5 rounded-full ml-auto"
								style="
									background: oklch(0.55 0.15 85 / 0.25);
									color: oklch(0.80 0.15 85);
									border: 1px solid oklch(0.55 0.15 85 / 0.4);
								"
								title="{$activeAgentSessionsCount} active agent{$activeAgentSessionsCount === 1 ? '' : 's'}"
							>
								{$activeAgentSessionsCount}
							</span>
						{/if}

						<!-- File tree changes badge for Files (external changes detected) -->
						{#if navItem.id === 'files' && $fileChangesCount > 0}
							<span
								class="font-mono text-[10px] px-1.5 py-0.5 rounded-full ml-auto"
								style="
									background: oklch(0.55 0.18 310 / 0.25);
									color: oklch(0.80 0.15 310);
									border: 1px solid oklch(0.55 0.18 310 / 0.4);
								"
								title="{$fileChangesCount} file{$fileChangesCount === 1 ? '' : 's'} changed on disk"
							>
								{$fileChangesCount}
							</span>
						{/if}

						<!-- Active indicator line (extended) -->
						{#if active && !(navItem.id === 'source' && $gitChangesCount > 0) && !(navItem.id === 'sessions' && $activeSessionsCount > 0) && !(navItem.id === 'servers' && $runningServersCount > 0) && !(navItem.id === 'tasks' && $activeAgentSessionsCount > 0) && !(navItem.id === 'files' && $fileChangesCount > 0)}
							<div
								class="flex-1 h-px"
								style="background: linear-gradient(90deg, oklch(0.70 0.18 240 / 0.4), transparent);"
							></div>
						{/if}
					{:else if navItem.id === 'source' && $gitChangesCount > 0}
						<!-- Changes badge shown when sidebar is collapsed (as dot indicator on Source) -->
						<span
							class="absolute top-1 right-0 w-2.5 h-2.5 rounded-full"
							style="background: oklch(0.75 0.12 220); box-shadow: 0 0 6px oklch(0.75 0.12 220 / 0.6);"
							title="{$gitChangesCount} file{$gitChangesCount === 1 ? '' : 's'} with changes"
						></span>
					{:else if navItem.id === 'sessions' && $activeSessionsCount > 0}
						<!-- Sessions badge shown when sidebar is collapsed (as dot indicator) -->
						<span
							class="absolute top-1 right-0 w-2.5 h-2.5 rounded-full"
							style="background: oklch(0.70 0.15 145); box-shadow: 0 0 6px oklch(0.70 0.15 145 / 0.6);"
							title="{$activeSessionsCount} active session{$activeSessionsCount === 1 ? '' : 's'}"
						></span>
					{:else if navItem.id === 'servers' && $runningServersCount > 0}
						<!-- Servers badge shown when sidebar is collapsed (as dot indicator) -->
						<span
							class="absolute top-1 right-0 w-2.5 h-2.5 rounded-full"
							style="background: oklch(0.65 0.02 250); box-shadow: 0 0 6px oklch(0.65 0.02 250 / 0.6);"
							title="{$runningServersCount} running server{$runningServersCount === 1 ? '' : 's'}"
						></span>
					{:else if navItem.id === 'tasks' && $activeAgentSessionsCount > 0}
						<!-- Tasks badge shown when sidebar is collapsed (as dot indicator for active agents) -->
						<span
							class="absolute top-1 right-0 w-2.5 h-2.5 rounded-full"
							style="background: oklch(0.75 0.15 85); box-shadow: 0 0 6px oklch(0.75 0.15 85 / 0.6);"
							title="{$activeAgentSessionsCount} active agent{$activeAgentSessionsCount === 1 ? '' : 's'}"
						></span>
					{:else if navItem.id === 'files' && $fileChangesCount > 0}
						<!-- Files badge shown when sidebar is collapsed (as dot indicator for external changes) -->
						<span
							class="absolute top-1 right-0 w-2.5 h-2.5 rounded-full"
							style="background: oklch(0.75 0.18 310); box-shadow: 0 0 6px oklch(0.75 0.18 310 / 0.6);"
							title="File tree has external changes"
						></span>
					{/if}
				</a>
			{/each}

			<!-- VIEWS section header -->
			{#if !$isSidebarCollapsed}
				<div class="pt-4 pb-1 px-3">
					<span class="font-mono text-[9px] tracking-widest uppercase" style="color: oklch(0.45 0.02 250);">
						Views
					</span>
				</div>
			{:else}
				<div class="h-px mx-2 my-2" style="background: oklch(0.30 0.02 250);"></div>
			{/if}

			<!-- VIEWS: Alternative visualizations -->
			{#each viewsItems as navItem, index}
				{@const active = isActive(navItem.href)}
				<a
					href={navItem.href}
					class="w-full flex items-center gap-3 px-3 py-2 rounded transition-all duration-200 group relative
						{$isSidebarCollapsed ? 'justify-center tooltip tooltip-right fade-in-left fade-in-delay-' + (mainItems.length + index) : ''}
						{active ? '' : 'industrial-hover'}"
					style="
						background: {active ? 'linear-gradient(90deg, oklch(0.70 0.18 240 / 0.15) 0%, transparent 100%)' : 'transparent'};
						border-left: 2px solid {active ? 'oklch(0.70 0.18 240 / 0.7)' : 'transparent'};
						color: {active ? 'oklch(0.75 0.12 240)' : 'oklch(0.55 0.02 250)'};
						text-decoration: none;
					"
					data-tip={navItem.label}
				>
					<!-- Icon (smaller for views) -->
					<div
						class="flex items-center justify-center w-5 h-5 rounded transition-all {$isSidebarCollapsed ? 'puff-in-center' : ''}"
						style="
							background: {active ? 'oklch(0.70 0.18 240 / 0.1)' : 'transparent'};
						"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width={active ? 1.75 : 1.5}
							stroke="currentColor"
							class="w-4 h-4 transition-all {active ? '' : 'group-hover:scale-110'}"
							style="color: {active ? 'oklch(0.70 0.14 240)' : 'oklch(0.50 0.02 250)'};"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d={icons[navItem.icon]} />
						</svg>
					</div>

					<!-- Label (hidden when collapsed) -->
					{#if !$isSidebarCollapsed}
						<span
							class="fade-in font-mono text-[10px] tracking-wider uppercase transition-colors
								{active ? '' : 'group-hover:text-base-content/70'}"
							style="color: {active ? 'oklch(0.70 0.10 240)' : 'oklch(0.50 0.02 250)'};"
						>
							<span class="tracking-in-expand">{navItem.label}</span>
						</span>

						<!-- Active sessions badge for Sessions -->
						{#if navItem.id === 'sessions' && $activeSessionsCount > 0}
							<span
								class="font-mono text-[10px] px-1.5 py-0.5 rounded-full ml-auto"
								style="
									background: oklch(0.55 0.15 145 / 0.25);
									color: oklch(0.75 0.15 145);
									border: 1px solid oklch(0.55 0.15 145 / 0.4);
								"
								title="{$activeSessionsCount} active session{$activeSessionsCount === 1 ? '' : 's'}"
							>
								{$activeSessionsCount}
							</span>
						{/if}

						<!-- Active indicator line (extended) -->
						{#if active && !(navItem.id === 'sessions' && $activeSessionsCount > 0)}
							<div
								class="flex-1 h-px"
								style="background: linear-gradient(90deg, oklch(0.70 0.18 240 / 0.3), transparent);"
							></div>
						{/if}
					{:else if navItem.id === 'sessions' && $activeSessionsCount > 0}
						<!-- Sessions badge shown when sidebar is collapsed (as dot indicator) -->
						<span
							class="absolute top-1 right-0 w-2.5 h-2.5 rounded-full"
							style="background: oklch(0.70 0.15 145); box-shadow: 0 0 6px oklch(0.70 0.15 145 / 0.6);"
							title="{$activeSessionsCount} active session{$activeSessionsCount === 1 ? '' : 's'}"
						></span>
					{/if}
				</a>
			{/each}

			<!-- LABS section header with beaker icon -->
			{#if !$isSidebarCollapsed}
				<div class="pt-4 pb-1 px-3 flex items-center gap-1.5">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="w-3 h-3"
						style="color: oklch(0.50 0.12 300);"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d={icons.beaker} />
					</svg>
					<span class="font-mono text-[9px] tracking-widest uppercase" style="color: oklch(0.50 0.12 300);">
						Labs
					</span>
				</div>
			{:else}
				<div class="h-px mx-2 my-2" style="background: oklch(0.35 0.08 300);"></div>
			{/if}

			<!-- LABS: Experimental features (dimmed styling) -->
			{#each labsItems as navItem, index}
				{@const active = isActive(navItem.href)}
				<a
					href={navItem.href}
					class="w-full flex items-center gap-3 px-3 py-2 rounded transition-all duration-200 group
						{$isSidebarCollapsed ? 'justify-center tooltip tooltip-right fade-in-left fade-in-delay-' + (mainItems.length + viewsItems.length + index) : ''}
						{active ? '' : 'industrial-hover'}"
					style="
						background: {active ? 'linear-gradient(90deg, oklch(0.55 0.12 300 / 0.15) 0%, transparent 100%)' : 'transparent'};
						border-left: 2px solid {active ? 'oklch(0.55 0.12 300 / 0.7)' : 'transparent'};
						color: {active ? 'oklch(0.65 0.10 300)' : 'oklch(0.45 0.02 250)'};
						opacity: {active ? 1 : 0.7};
						text-decoration: none;
					"
					data-tip="{navItem.label} (experimental)"
				>
					<!-- Icon (smaller, dimmed for labs) -->
					<div
						class="flex items-center justify-center w-5 h-5 rounded transition-all {$isSidebarCollapsed ? 'puff-in-center' : ''}"
						style="
							background: {active ? 'oklch(0.55 0.12 300 / 0.1)' : 'transparent'};
						"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width={active ? 1.75 : 1.5}
							stroke="currentColor"
							class="w-4 h-4 transition-all {active ? '' : 'group-hover:scale-110'}"
							style="color: {active ? 'oklch(0.60 0.10 300)' : 'oklch(0.45 0.05 300)'};"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d={icons[navItem.icon]} />
						</svg>
					</div>

					<!-- Label (hidden when collapsed) -->
					{#if !$isSidebarCollapsed}
						<span
							class="fade-in font-mono text-[10px] tracking-wider uppercase transition-colors
								{active ? '' : 'group-hover:text-base-content/60'}"
							style="color: {active ? 'oklch(0.60 0.08 300)' : 'oklch(0.45 0.02 250)'};"
						>
							<span class="tracking-in-expand">{navItem.label}</span>
						</span>

						<!-- Active indicator line (extended, purple tint for labs) -->
						{#if active}
							<div
								class="flex-1 h-px"
								style="background: linear-gradient(90deg, oklch(0.55 0.12 300 / 0.3), transparent);"
							></div>
						{/if}
					{/if}
				</a>
			{/each}
		</nav>

		<!-- Bottom utilities -->
		<div class="px-2 py-3 space-y-1">
			<!-- Separator -->
			<div
				class="h-px mx-2 mb-3"
				style="background: linear-gradient(90deg, transparent, oklch(0.45 0.02 250), transparent);"
			></div>

			<!-- Help button (Industrial) -->
			<button
				onclick={toggleHelp}
				aria-label="Show help guide"
				class="w-full flex items-center gap-3 px-3 py-2.5 rounded transition-all duration-200 group
					{$isSidebarCollapsed ? 'justify-center tooltip tooltip-right fade-in-left fade-in-delay-' + (mainItems.length + viewsItems.length + labsItems.length) : ''}
					industrial-hover"
				style="color: oklch(0.60 0.02 250);"
				data-tip="Help & Shortcuts"
			>
				<div class="flex items-center justify-center w-6 h-6 {$isSidebarCollapsed ? 'puff-in-center' : ''}">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="w-4.5 h-4.5 group-hover:scale-110 transition-transform"
						style="color: oklch(0.55 0.02 250);"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d={icons.help} />
					</svg>
				</div>
				{#if !$isSidebarCollapsed}
					<span class="fade-in font-mono text-xs tracking-wider uppercase group-hover:text-base-content/70">
						<span class="tracking-in-expand">Help</span>
					</span>
				{/if}
			</button>
		</div>

		<!-- Bottom glow accent -->
		<div
			class="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
			style="background: linear-gradient(180deg, transparent, oklch(0.70 0.18 240 / 0.05));"
		></div>
	</div>
</div>

<!-- Help Guide Modal -->
{#if showHelpModal}
	<div class="modal modal-open">
		<div class="modal-box max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
			<!-- Header -->
			<div class="flex items-center justify-between mb-4">
				<h3 class="text-2xl font-bold">Help & Reference</h3>
				<button
					class="btn btn-sm btn-circle btn-ghost"
					onclick={toggleHelp}
					aria-label="Close help"
				>
					✕
				</button>
			</div>

			<!-- Tabs -->
			<div role="tablist" class="tabs tabs-lifted mb-4">
				<button
					role="tab"
					class="tab {activeHelpTab === 'commands' ? 'tab-active' : ''}"
					onclick={() => setHelpTab('commands')}
				>
					Agent Commands
				</button>
				<button
					role="tab"
					class="tab {activeHelpTab === 'keyboard' ? 'tab-active' : ''}"
					onclick={() => setHelpTab('keyboard')}
				>
					Keyboard Shortcuts
				</button>
				<button
					role="tab"
					class="tab {activeHelpTab === 'readme' ? 'tab-active' : ''}"
					onclick={() => setHelpTab('readme')}
				>
					README
				</button>
			</div>

			<!-- Tab Content (scrollable) -->
			<div class="flex-1 overflow-y-auto">
				<!-- Agent Commands Tab -->
				{#if activeHelpTab === 'commands'}
					<div class="space-y-6">
						<div class="alert alert-info">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								class="stroke-current shrink-0 w-5 h-5"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
								></path>
							</svg>
							<span class="text-sm"
								>7 commands for multi-agent orchestration. See full docs in COMMANDS.md</span
							>
						</div>

						<!-- Core Workflow Commands -->
						<div>
							<h4 class="text-lg font-semibold mb-3">Core Workflow (4 commands)</h4>

							<!-- /jat:start -->
							<div class="mb-4">
								<h5 class="text-md font-semibold mb-2">/jat:start - Get to Work</h5>
								<div class="mockup-code text-xs mb-2">
									<pre><code>/jat:start                    # Auto-create new agent (fast!)</code></pre>
									<pre><code>/jat:start resume             # Choose from logged-out agents</code></pre>
									<pre><code>/jat:start GreatWind          # Resume specific agent by name</code></pre>
									<pre><code>/jat:start quick              # Start highest priority task immediately</code></pre>
									<pre><code>/jat:start task-abc           # Start specific task (with checks)</code></pre>
									<pre><code>/jat:start task-abc quick     # Start specific task (skip checks)</code></pre>
								</div>
								<p class="text-sm text-base-content/70">
									Smart registration (auto-create or resume) → Session persistence → Task selection
									→ Conflict detection → Actually starts work
								</p>
							</div>

							<!-- /jat:complete -->
							<div class="mb-4">
								<h5 class="text-md font-semibold mb-2">
									/jat:complete - Finish Task Properly
								</h5>
								<div class="mockup-code text-xs mb-2">
									<pre><code>/jat:complete                 # Full verify + commit + close task</code></pre>
								</div>
								<p class="text-sm text-base-content/70">
									Completes the current task with full verification. Session ends after completion.
									Spawn a new agent for the next task.
								</p>
							</div>

							<!-- /jat:pause -->
							<div class="mb-4">
								<h5 class="text-md font-semibold mb-2">
									/jat:pause - Quick Pivot (Context Switch)
								</h5>
								<div class="mockup-code text-xs mb-2">
									<pre><code>/jat:pause                    # Quick exit + show menu</code></pre>
								</div>
								<p class="text-sm text-base-content/70">
									Quick commit/stash → Acknowledge Mail → Release locks → Show available tasks menu.
									Use for emergency exit or context switch.
								</p>
							</div>
						</div>

						<!-- Support Commands -->
						<div>
							<h4 class="text-lg font-semibold mb-3">Support Commands (3 commands)</h4>

							<!-- /jat:status -->
							<div class="mb-4">
								<h5 class="text-md font-semibold mb-2">/jat:status - Check Current Work</h5>
								<div class="mockup-code text-xs mb-2">
									<pre><code>/jat:status                   # Shows current task, locks, messages</code></pre>
								</div>
								<p class="text-sm text-base-content/70">
									Shows current task progress, active file reservations, unread Agent Mail messages,
									and team sync.
								</p>
							</div>

							<!-- /jat:verify -->
							<div class="mb-4">
								<h5 class="text-md font-semibold mb-2">/jat:verify - Quality Checks</h5>
								<div class="mockup-code text-xs mb-2">
									<pre><code>/jat:verify                   # Verify current task</code></pre>
									<pre><code>/jat:verify task-abc          # Verify specific task</code></pre>
								</div>
								<p class="text-sm text-base-content/70">
									Runs tests, lint, security checks, and browser tests (if applicable). Must pass
									before /jat:complete.
								</p>
							</div>

							<!-- /jat:plan -->
							<div class="mb-4">
								<h5 class="text-md font-semibold mb-2">
									/jat:plan - Convert Planning to Tasks
								</h5>
								<div class="mockup-code text-xs mb-2">
									<pre><code>/jat:plan                     # Analyze conversation/PRD, create tasks</code></pre>
								</div>
								<p class="text-sm text-base-content/70">
									Analyzes conversation history OR written PRD, breaks work into atomic tasks,
									creates Beads tasks with proper dependency chains.
								</p>
							</div>
						</div>

						<!-- Quick Tips -->
						<div>
							<h4 class="text-lg font-semibold mb-3">Quick Tips</h4>
							<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
								<div class="alert alert-success">
									<span class="text-sm"
										><strong>Speed:</strong> Use `/jat:start quick` to skip conflict checks and start
										immediately</span
									>
								</div>
								<div class="alert alert-info">
									<span class="text-sm"
										><strong>Model:</strong> One agent = one session = one task. Spawn new agents for
										new tasks</span
									>
								</div>
								<div class="alert alert-warning">
									<span class="text-sm"
										><strong>Quality:</strong> Always run `/jat:verify` before `/jat:complete` for
										critical work</span
									>
								</div>
								<div class="alert">
									<span class="text-sm"
										><strong>Coordination:</strong> All commands acknowledge Agent Mail and announce
										completion</span
									>
								</div>
							</div>
						</div>
					</div>
				{/if}

				<!-- Keyboard Shortcuts Tab -->
				{#if activeHelpTab === 'keyboard'}
					<div class="space-y-6">
						<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
							<!-- Global Shortcuts -->
							<div>
								<h4 class="text-lg font-semibold mb-3 flex items-center gap-2">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
									Global
								</h4>
								<div class="space-y-2">
									<div class="flex justify-between items-center">
										<span class="text-sm">Open command palette</span>
										<span class="flex gap-1">
											<kbd class="kbd kbd-sm">Cmd</kbd>
											<span>+</span>
											<kbd class="kbd kbd-sm">K</kbd>
										</span>
									</div>
									<div class="flex justify-between items-center">
										<span class="text-sm">Show help guide</span>
										<span class="flex gap-1">
											<kbd class="kbd kbd-sm">Ctrl</kbd>
											<span>+</span>
											<kbd class="kbd kbd-sm">/</kbd>
										</span>
									</div>
									<div class="flex justify-between items-center">
										<span class="text-sm">New task</span>
										<span class="flex gap-1">
											<kbd class="kbd kbd-sm">Alt</kbd>
											<span>+</span>
											<kbd class="kbd kbd-sm">N</kbd>
										</span>
									</div>
									<div class="flex justify-between items-center">
										<span class="text-sm">Add project</span>
										<span class="flex gap-1">
											<kbd class="kbd kbd-sm">Alt</kbd>
											<span>+</span>
											<kbd class="kbd kbd-sm">Shift</kbd>
											<span>+</span>
											<kbd class="kbd kbd-sm">P</kbd>
										</span>
									</div>
									<div class="flex justify-between items-center">
										<span class="text-sm">Spawn session</span>
										<span class="flex gap-1">
											<kbd class="kbd kbd-sm">Alt</kbd>
											<span>+</span>
											<kbd class="kbd kbd-sm">S</kbd>
										</span>
									</div>
									<div class="flex justify-between items-center">
										<span class="text-sm">Global file search</span>
										<span class="flex gap-1">
											<kbd class="kbd kbd-sm">Ctrl</kbd>
											<span>+</span>
											<kbd class="kbd kbd-sm">Shift</kbd>
											<span>+</span>
											<kbd class="kbd kbd-sm">F</kbd>
										</span>
									</div>
									<div class="flex justify-between items-center">
										<span class="text-sm opacity-70">Attach to hovered session</span>
										<span class="flex gap-1">
											<kbd class="kbd kbd-sm">Alt</kbd>
											<span>+</span>
											<kbd class="kbd kbd-sm">A</kbd>
										</span>
									</div>
									<div class="flex justify-between items-center">
										<span class="text-sm opacity-70">Complete hovered session</span>
										<span class="flex gap-1">
											<kbd class="kbd kbd-sm">Alt</kbd>
											<span>+</span>
											<kbd class="kbd kbd-sm">C</kbd>
										</span>
									</div>
								</div>
							</div>

							<!-- Task Drawer Shortcuts -->
							<div>
								<h4 class="text-lg font-semibold mb-3 flex items-center gap-2">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
										/>
									</svg>
									Task Drawer
								</h4>
								<div class="space-y-2">
									<div class="flex justify-between items-center">
										<span class="text-sm">Close drawer</span>
										<kbd class="kbd kbd-sm">Esc</kbd>
									</div>
									<div class="flex justify-between items-center">
										<span class="text-sm">Toggle edit mode</span>
										<kbd class="kbd kbd-sm">E</kbd>
									</div>
									<div class="flex justify-between items-center">
										<span class="text-sm">Mark complete</span>
										<kbd class="kbd kbd-sm">M</kbd>
									</div>
								</div>
							</div>

							<!-- Navigation Shortcuts -->
							<div>
								<h4 class="text-lg font-semibold mb-3 flex items-center gap-2">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M13 10V3L4 14h7v7l9-11h-7z"
										/>
									</svg>
									Navigation
								</h4>
								<div class="space-y-2">
									<div class="flex justify-between items-center">
										<span class="text-sm">Go to List view</span>
										<kbd class="kbd kbd-sm">G</kbd>
										<span>then</span>
										<kbd class="kbd kbd-sm">L</kbd>
									</div>
									<div class="flex justify-between items-center">
										<span class="text-sm">Go to Agents view</span>
										<kbd class="kbd kbd-sm">G</kbd>
										<span>then</span>
										<kbd class="kbd kbd-sm">A</kbd>
									</div>
								</div>
							</div>

							<!-- Status Indicators -->
							<div>
								<h4 class="text-lg font-semibold mb-3 flex items-center gap-2">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
										/>
									</svg>
									Status Indicators
								</h4>
								<div class="space-y-2">
									<div class="flex justify-between items-center">
										<span class="text-sm">Open</span>
										<span class="badge badge-info">open</span>
									</div>
									<div class="flex justify-between items-center">
										<span class="text-sm">In Progress</span>
										<span class="badge badge-warning">in_progress</span>
									</div>
									<div class="flex justify-between items-center">
										<span class="text-sm">Blocked</span>
										<span class="badge badge-error">blocked</span>
									</div>
									<div class="flex justify-between items-center">
										<span class="text-sm">Closed</span>
										<span class="badge badge-success">closed</span>
									</div>
								</div>
							</div>
						</div>

						<!-- Divider -->
						<div class="divider my-6"></div>

						<!-- Tips Section -->
						<div>
							<h4 class="text-lg font-semibold mb-3">Tips</h4>
							<div class="space-y-2">
								<div class="alert alert-info">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										class="stroke-current shrink-0 w-5 h-5"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
										></path>
									</svg>
									<span class="text-sm"
										>Use <kbd class="kbd kbd-sm">Cmd+K</kbd> to quickly navigate, search tasks, and
										perform actions.</span
									>
								</div>
								<div class="alert alert-info">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										class="stroke-current shrink-0 w-5 h-5"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
										></path>
									</svg>
									<span class="text-sm"
										>Click any task card to open details. Press <kbd class="kbd kbd-sm">?</kbd> inside
										the drawer for more shortcuts.</span
									>
								</div>
							</div>
						</div>
					</div>
				{/if}

				<!-- README Tab -->
				{#if activeHelpTab === 'readme'}
					<div class="space-y-6">
						<!-- Quick Start -->
						<div>
							<h4 class="text-lg font-semibold mb-3">Quick Start</h4>
							<div class="mockup-code text-xs">
								<pre><code># 1. Install (run in your terminal/bash)</code></pre>
								<pre><code>curl -fsSL https://raw.githubusercontent.com/joewinke/jat/master/install.sh | bash</code></pre>
								<pre><code></code></pre>
								<pre><code># 2. Initialize Beads in your project</code></pre>
								<pre><code>bd init</code></pre>
								<pre><code></code></pre>
								<pre><code># 3. Start working (registers agent + picks task)</code></pre>
								<pre><code>/jat:start</code></pre>
							</div>
						</div>

						<!-- What Is This -->
						<div>
							<h4 class="text-lg font-semibold mb-3">What Is JAT?</h4>
							<p class="text-sm text-base-content/70 mb-3">
								Jomarchy Agent Tools is a <strong>self-contained AI development environment</strong> that
								gives your AI coding assistants (Claude Code, Cline, Codex, etc.) the ability to:
							</p>
							<ul class="list-disc list-inside text-sm text-base-content/70 space-y-1">
								<li>
									<strong>Command</strong> agent swarms with high-level coordination primitives
								</li>
								<li>
									<strong>Coordinate</strong> across multiple agents without conflicts (Agent Mail messaging
									+ file locks)
								</li>
								<li>
									<strong>Transcend</strong> project folders and context window bounds with persistent state
								</li>
								<li>
									<strong>Plan</strong> work with dependency-aware task management (Beads)
								</li>
								<li>
									<strong>Execute</strong> with 28 composable bash tools (no HTTP servers, no running daemons)
								</li>
								<li><strong>Scale</strong> infinitely - add agents without coordination overhead</li>
							</ul>
						</div>

						<!-- Architecture -->
						<div>
							<h4 class="text-lg font-semibold mb-3">Architecture</h4>
							<div class="mockup-code text-xs">
								<pre><code>┌─────────────────────────────────────────┐</code></pre>
								<pre><code>│      AI Coding Assistants (Any)         │</code></pre>
								<pre><code>└─────────────┬───────────────────────────┘</code></pre>
								<pre><code>              ▼</code></pre>
								<pre><code>    ┌────────────────────┐</code></pre>
								<pre><code>    │ Coordination Layer │</code></pre>
								<pre><code>    │  7 Slash Commands  │</code></pre>
								<pre><code>    └────────┬───────────┘</code></pre>
								<pre><code>             │</code></pre>
								<pre><code>  ┌──────────┼──────────┐</code></pre>
								<pre><code>  ▼          ▼          ▼</code></pre>
								<pre><code>Agent    Beads    28 Tools</code></pre>
								<pre><code> Mail      CLI     (bash)</code></pre>
							</div>
						</div>

						<!-- Key Features -->
						<div>
							<h4 class="text-lg font-semibold mb-3">Key Features</h4>
							<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
								<div class="alert alert-info">
									<span class="text-sm"
										><strong>Agent Mail:</strong> Multi-agent coordination with messaging + file locks</span
									>
								</div>
								<div class="alert alert-success">
									<span class="text-sm"
										><strong>Beads:</strong> Dependency-aware task planning with CLI</span
									>
								</div>
								<div class="alert alert-warning">
									<span class="text-sm"
										><strong>28 Tools:</strong> Database, browser, monitoring, dev tools</span
									>
								</div>
								<div class="alert">
									<span class="text-sm"
										><strong>IDE:</strong> Real-time multi-project task visualization</span
									>
								</div>
							</div>
						</div>

						<!-- Common Workflows -->
						<div>
							<h4 class="text-lg font-semibold mb-3">Common Workflows</h4>

							<h5 class="text-md font-semibold mb-2">Standard Workflow (One Agent = One Task)</h5>
							<div class="mockup-code text-xs mb-3">
								<pre><code>/jat:start task-abc           # Create agent, start task</code></pre>
								<pre><code># ... work on task ...</code></pre>
								<pre><code>/jat:complete                 # Complete task, session ends</code></pre>
								<pre><code># Close terminal, spawn new agent for next task</code></pre>
							</div>

							<h5 class="text-md font-semibold mb-2">Quick Start (Skip Checks)</h5>
							<div class="mockup-code text-xs mb-3">
								<pre><code>/jat:start task-abc quick     # Skip conflict checks</code></pre>
								<pre><code># ... work on task ...</code></pre>
								<pre><code>/jat:complete                 # Complete task</code></pre>
							</div>
						</div>

						<!-- Links -->
						<div>
							<h4 class="text-lg font-semibold mb-3">Learn More</h4>
							<div class="flex flex-col gap-2">
								<a
									href="https://github.com/joewinke/jat"
									target="_blank"
									class="btn btn-sm btn-primary"
								>
									GitHub Repository
								</a>
								<a href="/COMMANDS.md" target="_blank" class="btn btn-sm btn-outline">
									Full Command Reference
								</a>
								<a href="/README.md" target="_blank" class="btn btn-sm btn-outline">
									Complete README
								</a>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="modal-action">
				<button class="btn" onclick={toggleHelp}>Close</button>
			</div>
		</div>
	</div>
{/if}
