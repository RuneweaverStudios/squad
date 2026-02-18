/**
 * Tab Persistence Utilities for the Files Page
 *
 * Handles saving and restoring open file tabs to/from localStorage,
 * including tab order for drag-drop reordering.
 *
 * Storage format:
 * - Key: `squad-files-open-{project}`
 * - Value: { openFiles: [{ path }], activeFilePath: string | null }
 */

// Re-export the OpenFile type from files index
export interface PersistedTab {
	path: string;
}

export interface PersistedTabState {
	openFiles: PersistedTab[];
	activeFilePath: string | null;
}

/**
 * Generate a localStorage key for a project's open files.
 *
 * @param project - The project name (e.g., "squad", "chimaro")
 * @returns The localStorage key string
 *
 * @example
 * getStorageKey("squad") // "squad-files-open-squad"
 * getStorageKey("my-project") // "squad-files-open-my-project"
 */
export function getStorageKey(project: string): string {
	return `squad-files-open-${project}`;
}

/**
 * Check if localStorage is available.
 * Returns false in SSR context or when storage is blocked.
 */
export function isStorageAvailable(): boolean {
	if (typeof window === 'undefined') return false;
	try {
		const test = '__storage_test__';
		window.localStorage.setItem(test, test);
		window.localStorage.removeItem(test);
		return true;
	} catch {
		return false;
	}
}

/**
 * Save open file tabs to localStorage.
 * Preserves tab order (important for drag-drop reordering).
 *
 * @param project - The project name
 * @param openFilePaths - Array of file paths in display order
 * @param activeFilePath - Currently active file path (or null)
 *
 * @example
 * saveTabsToStorage("squad", ["/src/a.ts", "/src/b.ts"], "/src/a.ts");
 */
export function saveTabsToStorage(
	project: string,
	openFilePaths: string[],
	activeFilePath: string | null
): void {
	if (!isStorageAvailable()) return;

	const key = getStorageKey(project);

	if (openFilePaths.length === 0) {
		// Remove from storage when no files open
		window.localStorage.removeItem(key);
		return;
	}

	const data: PersistedTabState = {
		openFiles: openFilePaths.map((path) => ({ path })),
		activeFilePath
	};

	window.localStorage.setItem(key, JSON.stringify(data));
}

/**
 * Load saved tab state from localStorage.
 *
 * @param project - The project name
 * @returns The persisted tab state, or null if not found/invalid
 *
 * @example
 * const state = loadTabsFromStorage("squad");
 * if (state) {
 *   for (const tab of state.openFiles) {
 *     await openFile(tab.path);
 *   }
 *   setActiveFile(state.activeFilePath);
 * }
 */
export function loadTabsFromStorage(project: string): PersistedTabState | null {
	if (!isStorageAvailable()) return null;

	const key = getStorageKey(project);
	const stored = window.localStorage.getItem(key);

	if (!stored) return null;

	try {
		const data = JSON.parse(stored);

		// Validate structure
		if (!data || typeof data !== 'object') return null;
		if (!Array.isArray(data.openFiles)) return null;

		// Validate each entry has a path string
		const openFiles: PersistedTab[] = [];
		for (const entry of data.openFiles) {
			if (entry && typeof entry.path === 'string' && entry.path.length > 0) {
				openFiles.push({ path: entry.path });
			}
		}

		// Validate activeFilePath
		const activeFilePath =
			typeof data.activeFilePath === 'string' && data.activeFilePath.length > 0
				? data.activeFilePath
				: null;

		return { openFiles, activeFilePath };
	} catch {
		// Invalid JSON or structure - clear corrupted data
		window.localStorage.removeItem(key);
		return null;
	}
}

/**
 * Clear saved tabs for a project.
 *
 * @param project - The project name
 */
export function clearTabsFromStorage(project: string): void {
	if (!isStorageAvailable()) return;
	const key = getStorageKey(project);
	window.localStorage.removeItem(key);
}

/**
 * Get all projects that have saved tabs.
 *
 * @returns Array of project names with saved tab state
 */
export function getProjectsWithSavedTabs(): string[] {
	if (!isStorageAvailable()) return [];

	const prefix = 'squad-files-open-';
	const projects: string[] = [];

	for (let i = 0; i < window.localStorage.length; i++) {
		const key = window.localStorage.key(i);
		if (key && key.startsWith(prefix)) {
			projects.push(key.slice(prefix.length));
		}
	}

	return projects;
}

/**
 * Reorder tabs by moving a tab from one index to another.
 * Returns a new array with the reordered paths.
 *
 * @param paths - Current array of file paths
 * @param fromIndex - Index to move from
 * @param toIndex - Index to move to
 * @returns New array with reordered paths, or original if indices invalid
 *
 * @example
 * reorderTabs(["/a.ts", "/b.ts", "/c.ts"], 0, 2)
 * // Returns ["/b.ts", "/c.ts", "/a.ts"]
 */
export function reorderTabs(paths: string[], fromIndex: number, toIndex: number): string[] {
	if (fromIndex === toIndex) return paths;
	if (fromIndex < 0 || fromIndex >= paths.length) return paths;
	if (toIndex < 0 || toIndex >= paths.length) return paths;

	const reordered = [...paths];
	const [movedItem] = reordered.splice(fromIndex, 1);
	reordered.splice(toIndex, 0, movedItem);

	return reordered;
}

/**
 * Get the next active file when closing a tab.
 *
 * @param paths - Current array of file paths
 * @param closingPath - Path of the file being closed
 * @param currentActive - Currently active file path
 * @returns The new active file path, or null if no files left
 *
 * @example
 * getNextActiveFile(["/a.ts", "/b.ts", "/c.ts"], "/b.ts", "/b.ts")
 * // Returns "/a.ts" (previous neighbor)
 */
export function getNextActiveFile(
	paths: string[],
	closingPath: string,
	currentActive: string | null
): string | null {
	// If we're not closing the active file, keep current
	if (currentActive !== closingPath) {
		return currentActive;
	}

	const index = paths.indexOf(closingPath);
	if (index === -1) return currentActive;

	// Filter out the closing path
	const remaining = paths.filter((p) => p !== closingPath);
	if (remaining.length === 0) return null;

	// Pick the previous tab, or the first one
	const newIndex = Math.min(index, remaining.length - 1);
	return remaining[newIndex];
}
