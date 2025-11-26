/**
 * Project Color Utilities
 * Provides consistent, visually distinct colors for projects
 *
 * Known projects use colors from ~/.config/jat/projects.json (synced here for client-side use).
 * Unknown projects fall back to hash-based color assignment.
 */

// Known project colors from ~/.config/jat/projects.json
// This provides client-side access to config colors without requiring fs module
const knownProjectColors: Record<string, string> = {
	'chezwizper': '#8572d6',
	'chezwizper-fork': '#3df1ae',
	'chimaro': '#00d4aa',
	'dirt': '#c90b11',
	'flush': '#bb66ff',
	'genesis': '#44ff44',
	'jat': '#5588ff',
	'jomarchy': '#ffdd00',
	'jomarchy-machines': '#17ace6',
	'mcp_agent_mail': '#97b7fd',
	'steelbridge': '#ff9933',
	'linux': '#ff5555'
};

// Fallback color palette for unknown projects (hash-based assignment)
const fallbackColorPalette = [
	'#3b82f6', // blue
	'#8b5cf6', // purple
	'#ec4899', // pink
	'#f59e0b', // amber
	'#10b981', // emerald
	'#06b6d4', // cyan
	'#f97316', // orange
	'#6366f1', // indigo
	'#14b8a6', // teal
	'#a855f7', // violet
	'#84cc16', // lime
	'#22d3ee', // sky
	'#fb923c', // orange-400
	'#4ade80', // green-400
	'#c084fc', // purple-400
	'#fb7185' // rose-400
];

/**
 * Get consistent color for a project
 * Uses known project colors first, falls back to hash-based for unknown projects
 */
export function getProjectColor(taskId: string): string {
	if (!taskId) return '#6b7280'; // gray for unknown

	// Extract project prefix (e.g., "jat-abc" → "jat")
	const projectPrefix = taskId.split('-')[0].toLowerCase();

	// Check known project colors first
	if (knownProjectColors[projectPrefix]) {
		return knownProjectColors[projectPrefix];
	}

	// Fall back to hash-based color assignment for unknown projects
	let hash = 0;
	for (let i = 0; i < projectPrefix.length; i++) {
		hash = projectPrefix.charCodeAt(i) + ((hash << 5) - hash);
	}

	// Map hash to fallback palette index
	const index = Math.abs(hash) % fallbackColorPalette.length;
	return fallbackColorPalette[index];
}

/**
 * Get all unique projects from task list with their colors
 */
export function getProjectColorMap(tasks: Array<{ id: string }>): Map<string, string> {
	const map = new Map<string, string>();

	tasks.forEach((task) => {
		const projectPrefix = task.id.split('-')[0];
		if (!map.has(projectPrefix)) {
			map.set(projectPrefix, getProjectColor(task.id));
		}
	});

	return map;
}
