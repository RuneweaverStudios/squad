/**
 * Navigation Configuration
 * Unified config for IDE navigation (replaces page-specific configs)
 *
 * NAVIGATION STRUCTURE:
 *
 * MAIN (core workflow - always visible):
 *   /tasks    - Tasks (active sessions + open tasks with spawn)
 *   /files    - Files (project file browser)
 *   /source   - Source Control (git changes, diff viewer)
 *   /servers  - Servers (project server sessions)
 *   /integrations - Integrations (external source configuration)
 *   /automation - Automation rules configuration
 *   /memory   - Memory (agent persistent memory browser and search)
 *   /history  - History (completed task history with streak calendar)
 *   /config   - Config (JAT configuration, includes Projects tab)
 *
 * VIEWS (alternative visualizations):
 *   /dash     - Dash (multi-project sessions view with terminal output)
 *   /graph    - Dependency visualization
 *   /timeline - Historical view
 *   /kanban   - Agent kanban (sessions grouped by activity state)
 *
 * LABS (experimental):
 *   /sessions - Sessions (all tmux sessions: agents, servers, other)
 *   /quick-commands - Commands (single-turn quick commands + templates)
 *   /schedules - Schedules (scheduled task management, scheduler service controls)
 *   /swarm    - Swarm attack interface
 */

export interface NavItem {
	id: string; // Unique identifier (e.g., 'dash', 'files', 'servers')
	label: string; // Display text (e.g., 'Work', 'Files', 'Servers')
	href: string; // Navigation target (e.g., '/work', '/files')
	icon: string; // Icon identifier (matches icon SVG paths in Sidebar.svelte)
	category: 'main' | 'views' | 'labs'; // Section grouping
}

export interface UnifiedNavConfig {
	navItems: NavItem[]; // All navigation items (rendered in sidebar)
	showProjectFilter: boolean; // Show project selector dropdown
	showThemeSelector: boolean; // Show theme picker
}

/**
 * Unified Navigation Configuration
 *
 * Defines all navigation items and global nav settings.
 * Sidebar.svelte imports this and renders nav items with active state.
 *
 * Icons used: tasks, agents, servers, timeline, columns, graph
 * (Icon SVG paths defined in Sidebar.svelte)
 */
export const unifiedNavConfig: UnifiedNavConfig = {
	navItems: [
		// MAIN: Core workflow (always visible)
		{
			id: 'tasks',
			label: 'Tasks',
			href: '/tasks',
			icon: 'tasks',
			category: 'main'
		},
		{
			id: 'files',
			label: 'Files',
			href: '/files',
			icon: 'files',
			category: 'main'
		},
		{
			id: 'source',
			label: 'Source',
			href: '/source',
			icon: 'source',
			category: 'main'
		},
		{
			id: 'servers',
			label: 'Servers',
			href: '/servers',
			icon: 'servers',
			category: 'main'
		},
		{
			id: 'integrations',
			label: 'Integrations',
			href: '/integrations',
			icon: 'integrations',
			category: 'main'
		},
		{
			id: 'automation',
			label: 'Automation',
			href: '/automation',
			icon: 'automation',
			category: 'main'
		},
		{
			id: 'memory',
			label: 'Memory',
			href: '/memory',
			icon: 'memory',
			category: 'main'
		},
		{
			id: 'history',
			label: 'History',
			href: '/history',
			icon: 'history',
			category: 'main'
		},
		{
			id: 'config',
			label: 'Config',
			href: '/config',
			icon: 'settings',
			category: 'main'
		},
		// VIEWS: Alternative visualizations
		{
			id: 'dash',
			label: 'Dash',
			href: '/dash',
			icon: 'dashboard',
			category: 'views'
		},
		{
			id: 'graph',
			label: 'Graph',
			href: '/graph',
			icon: 'graph',
			category: 'views'
		},
		{
			id: 'timeline',
			label: 'Timeline',
			href: '/timeline',
			icon: 'timeline',
			category: 'views'
		},
		{
			id: 'kanban',
			label: 'Kanban',
			href: '/kanban',
			icon: 'columns',
			category: 'views'
		},
		// LABS: Experimental features
		{
			id: 'sessions',
			label: 'Sessions',
			href: '/sessions',
			icon: 'tmux',
			category: 'labs'
		},
		{
			id: 'quick-commands',
			label: 'Commands',
			href: '/quick-commands',
			icon: 'terminal',
			category: 'labs'
		},
		{
			id: 'schedules',
			label: 'Schedules',
			href: '/schedules',
			icon: 'schedules',
			category: 'labs'
		},
		{
			id: 'swarm',
			label: 'Swarm',
			href: '/swarm',
			icon: 'swarm',
			category: 'labs'
		}
	],
	showProjectFilter: true,
	showThemeSelector: true
};
