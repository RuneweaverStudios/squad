/**
 * Navigation Configuration
 * Unified config for dashboard navigation (replaces page-specific configs)
 *
 * NAVIGATION STRUCTURE:
 *
 * PRIMARY (main nav - always visible):
 *   /tasks    - Tasks (default route, tmux sessions + agent work)
 *   /agents   - Agents (agent dashboard, status, activity)
 *   /servers  - Servers (project server sessions)
 *
 * SECONDARY (collapsible or less prominent):
 *   /projects - Projects (multi-project sessions view)
 *   /triage   - Task triage (needs work, not ready for primetime)
 *   /timeline - Historical view (link from /projects)
 *   /kanban   - Agent kanban (sessions grouped by activity state)
 *   /graph    - Dependency visualization
 *
 * DROPPED (removed):
 *   /         - Replaced by /tasks as default
 */

export interface NavItem {
	id: string; // Unique identifier (e.g., 'work', 'dash', 'projects')
	label: string; // Display text (e.g., 'Tasks', 'Agents', 'Servers')
	href: string; // Navigation target (e.g., '/work', '/dash')
	icon: string; // Icon identifier (matches icon SVG paths in Sidebar.svelte)
	primary?: boolean; // Primary nav items are always visible
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
		// PRIMARY: Main navigation (always visible)
		{
			id: 'tasks',
			label: 'Tasks',
			href: '/tasks',
			icon: 'tasks',
			primary: true
		},
		{
			id: 'agents',
			label: 'Agents',
			href: '/agents',
			icon: 'agents',
			primary: true
		},
		{
			id: 'servers',
			label: 'Servers',
			href: '/servers',
			icon: 'servers',
			primary: true
		},
		// SECONDARY: Less prominent routes
		{
			id: 'projects',
			label: 'Projects',
			href: '/projects',
			icon: 'folders',
			primary: false
		},
		{
			id: 'triage',
			label: 'Triage',
			href: '/triage',
			icon: 'triage',
			primary: false
		},
		{
			id: 'timeline',
			label: 'Timeline',
			href: '/timeline',
			icon: 'timeline',
			primary: false
		},
		{
			id: 'kanban',
			label: 'Kanban',
			href: '/kanban',
			icon: 'columns',
			primary: false
		},
		{
			id: 'graph',
			label: 'Graph',
			href: '/graph',
			icon: 'graph',
			primary: false
		},
		{
			id: 'automation',
			label: 'Automation',
			href: '/automation',
			icon: 'automation',
			primary: false
		}
	],
	showProjectFilter: true,
	showThemeSelector: true
};
