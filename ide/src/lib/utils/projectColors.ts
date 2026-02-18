/**
 * Project Color Utilities
 * Provides consistent, visually distinct colors for projects
 *
 * Colors are fetched from the API (/api/projects/colors) which reads from
 * ~/.config/squad/projects.json. Fetched colors are cached and refresh periodically.
 * Unknown projects fall back to hash-based color assignment.
 */

// Dynamic project colors fetched from API (cached)
let dynamicProjectColors: Record<string, string> = {};
let colorsFetched = false;
let fetchPromise: Promise<void> | null = null;
let lastFetchTime = 0;
const CACHE_DURATION_MS = 30000; // Refresh colors every 30 seconds

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
 * Fetch project colors from API (cached)
 * Called automatically by getProjectColor when colors are needed
 */
async function fetchProjectColors(): Promise<void> {
	const now = Date.now();

	// Check if we need to refresh the cache
	if (colorsFetched && now - lastFetchTime < CACHE_DURATION_MS) {
		return;
	}

	// If already fetching, wait for that request
	if (fetchPromise) {
		await fetchPromise;
		return;
	}

	// Start fetch
	fetchPromise = (async () => {
		try {
			const response = await fetch('/api/projects/colors');
			if (response.ok) {
				const data = await response.json();
				dynamicProjectColors = data.colors || {};
				colorsFetched = true;
				lastFetchTime = now;
			}
		} catch (err) {
			console.warn('Failed to fetch project colors:', err);
		} finally {
			fetchPromise = null;
		}
	})();

	await fetchPromise;
}

/**
 * Initialize project colors - call this early in app lifecycle
 * This pre-fetches colors so they're ready when needed
 */
export function initProjectColors(): void {
	fetchProjectColors();
}

/**
 * Get color from hash for unknown projects
 */
function getHashColor(projectPrefix: string): string {
	let hash = 0;
	for (let i = 0; i < projectPrefix.length; i++) {
		hash = projectPrefix.charCodeAt(i) + ((hash << 5) - hash);
	}
	const index = Math.abs(hash) % fallbackColorPalette.length;
	return fallbackColorPalette[index];
}

/**
 * Get consistent color for a project (synchronous version)
 * Uses cached colors first, falls back to hash-based for unknown projects
 */
export function getProjectColor(taskId: string): string {
	if (!taskId) return '#6b7280'; // gray for unknown

	// Extract project prefix (e.g., "squad-abc" → "squad")
	const projectPrefix = taskId.split('-')[0].toLowerCase();

	// Check cached dynamic colors first
	if (dynamicProjectColors[projectPrefix]) {
		return dynamicProjectColors[projectPrefix];
	}

	// Trigger background fetch if we haven't fetched yet or cache is stale
	const now = Date.now();
	if (!colorsFetched || now - lastFetchTime >= CACHE_DURATION_MS) {
		fetchProjectColors();
	}

	// Fall back to hash-based color assignment
	return getHashColor(projectPrefix);
}

/**
 * Get project color async - ensures colors are fetched first
 * Use this when you can await and want guaranteed fresh colors
 */
export async function getProjectColorAsync(taskId: string): Promise<string> {
	if (!taskId) return '#6b7280';

	// Ensure colors are fetched
	await fetchProjectColors();

	// Extract project prefix
	const projectPrefix = taskId.split('-')[0].toLowerCase();

	// Check dynamic colors
	if (dynamicProjectColors[projectPrefix]) {
		return dynamicProjectColors[projectPrefix];
	}

	// Fall back to hash-based
	return getHashColor(projectPrefix);
}

/**
 * Update a project's color in the cache
 * Call this after saving a color via API to immediately reflect changes
 */
export function updateProjectColorCache(projectName: string, hexColor: string): void {
	dynamicProjectColors[projectName.toLowerCase()] = hexColor.toLowerCase();
}

/**
 * Clear the color cache (forces re-fetch on next call)
 */
export function clearProjectColorCache(): void {
	colorsFetched = false;
	lastFetchTime = 0;
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

/**
 * Get all currently cached project colors
 */
export function getCachedProjectColors(): Record<string, string> {
	return { ...dynamicProjectColors };
}

/**
 * Fetch project colors and return them - for use in reactive contexts
 * Returns the colors object after ensuring they're fetched
 */
export async function fetchAndGetProjectColors(): Promise<Record<string, string>> {
	await fetchProjectColors();
	return { ...dynamicProjectColors };
}
