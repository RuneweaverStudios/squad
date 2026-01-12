/**
 * Navigation Configuration
 * Unified config for IDE navigation (replaces page-specific configs)
 *
 * NAVIGATION STRUCTURE:
 *
 * MAIN (core workflow - always visible):
 *   /work     - Work (default route, multi-project sessions view)
 *   /files    - Explorer (project file browser + git)
 *   /servers  - Servers (project server sessions)
 *   /config   - Config (JAT configuration files editor)
 *   /projects - Projects (project configuration & management)
 *
 * VIEWS (alternative visualizations):
 *   /history  - History (completed task history with streak calendar)
 *   /graph    - Dependency visualization
 *   /timeline - Historical view
 *   /kanban   - Agent kanban (sessions grouped by activity state)
 *
 * LABS (experimental, not production-ready):
 *   /automation - Automation rules configuration
 *   /triage   - Task triage (needs work)
 *   /swarm    - Swarm attack interface (experimental)
 *
 * DROPPED (removed):
 *   /         - Replaced by /work as default
 *   /tasks    - Redundant with /work (removed)
 *   /agents   - Redundant with /work (removed)
 */

export interface NavItem {
	id: string; // Unique identifier (e.g., 'work', 'files', 'servers')
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
 * Icons used: tasks, agents, servers, triage, timeline, columns, graph
 * (Icon SVG paths defined in Sidebar.svelte)
 */
export const unifiedNavConfig: UnifiedNavConfig = {
	navItems: [
		// MAIN: Core workflow (always visible)
		{
			id: 'work',
			label: 'Work',
			href: '/work',
			icon: 'tasks',
			category: 'main'
		},
		{
			id: 'files',
			label: 'Explorer',
			href: '/files',
			icon: 'files',
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
			id: 'config',
			label: 'Config',
			href: '/config',
			icon: 'settings',
			category: 'main'
		},
		{
			id: 'projects',
			label: 'Projects',
			href: '/projects',
			icon: 'projects',
			category: 'main'
		},
		// VIEWS: Alternative visualizations
		{
			id: 'tmux',
			label: 'Tmux',
			href: '/tmux',
			icon: 'tmux',
			category: 'views'
		},
		{
			id: 'history',
			label: 'History',
			href: '/history',
			icon: 'history',
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
		// LABS: Experimental features (not production-ready)
		{
			id: 'automation',
			label: 'Automation',
			href: '/automation',
			icon: 'automation',
			category: 'labs'
		},
		{
			id: 'triage',
			label: 'Triage',
			href: '/triage',
			icon: 'triage',
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
