/**
 * Navigation Configuration
 * Unified config for dashboard navigation (replaces page-specific configs)
 *
 * NAVIGATION STRUCTURE:
 *
 * PRIMARY (main nav - always visible):
 *   /projects - Projects (default route, multi-project sessions view)
 *   /servers  - Servers (project server sessions)
 *   /automation - Automation rules configuration
 *   /history  - History (completed task history with streak calendar)
 *   /config   - Config (JAT configuration files editor)
 *
 * SECONDARY (collapsible or less prominent):
 *   /graph    - Dependency visualization
 *   /timeline - Historical view (link from /projects)
 *   /kanban   - Agent kanban (sessions grouped by activity state)
 *   /triage   - Task triage (needs work, not ready for primetime)
 *
 * DROPPED (removed):
 *   /         - Replaced by /projects as default
 *   /tasks    - Redundant with /projects (removed)
 *   /agents   - Redundant with /projects (removed)
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
			id: 'projects',
			label: 'Projects',
			href: '/projects',
			icon: 'folders',
			primary: true
		},
		{
			id: 'servers',
			label: 'Servers',
			href: '/servers',
			icon: 'servers',
			primary: true
		},
		{
			id: 'automation',
			label: 'Automation',
			href: '/automation',
			icon: 'automation',
			primary: true
		},
		{
			id: 'history',
			label: 'History',
			href: '/history',
			icon: 'history',
			primary: true
		},
		{
			id: 'config',
			label: 'Config',
			href: '/config',
			icon: 'settings',
			primary: true
		},
		// SECONDARY: Less prominent routes
		{
			id: 'graph',
			label: 'Graph',
			href: '/graph',
			icon: 'graph',
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
			id: 'triage',
			label: 'Triage',
			href: '/triage',
			icon: 'triage',
			primary: false
		}
	],
	showProjectFilter: true,
	showThemeSelector: true
};
