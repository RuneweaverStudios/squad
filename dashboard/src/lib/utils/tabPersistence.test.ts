/**
 * Unit Tests for tabPersistence.ts
 *
 * Tests tab order storage and retrieval for the /files page,
 * including drag-drop reordering persistence.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
	getStorageKey,
	isStorageAvailable,
	saveTabsToStorage,
	loadTabsFromStorage,
	clearTabsFromStorage,
	getProjectsWithSavedTabs,
	reorderTabs,
	getNextActiveFile,
	type PersistedTabState
} from './tabPersistence';

// ============================================================================
// Setup and teardown using jsdom's localStorage
// ============================================================================

beforeEach(() => {
	// Clear localStorage before each test
	window.localStorage.clear();
});

// ============================================================================
// getStorageKey Tests
// ============================================================================

describe('getStorageKey', () => {
	it('should return correct key for simple project name', () => {
		expect(getStorageKey('jat')).toBe('jat-files-open-jat');
	});

	it('should return correct key for hyphenated project name', () => {
		expect(getStorageKey('my-project')).toBe('jat-files-open-my-project');
	});

	it('should return correct key for project name with underscores', () => {
		expect(getStorageKey('my_cool_project')).toBe('jat-files-open-my_cool_project');
	});

	it('should handle numeric project names', () => {
		expect(getStorageKey('project123')).toBe('jat-files-open-project123');
	});

	it('should handle empty string (edge case)', () => {
		expect(getStorageKey('')).toBe('jat-files-open-');
	});

	it('should handle project names with special characters', () => {
		expect(getStorageKey('proj@ect')).toBe('jat-files-open-proj@ect');
	});
});

// ============================================================================
// isStorageAvailable Tests
// ============================================================================

describe('isStorageAvailable', () => {
	it('should return true when localStorage is available', () => {
		expect(isStorageAvailable()).toBe(true);
	});

	// Note: Testing window undefined is not practical in jsdom environment
	// since jsdom always provides window. The function correctly handles this
	// case in SSR/Node environments where window is genuinely undefined.
});

// ============================================================================
// saveTabsToStorage Tests
// ============================================================================

describe('saveTabsToStorage', () => {
	it('should save tabs with correct key and structure', () => {
		const paths = ['/src/a.ts', '/src/b.ts'];
		saveTabsToStorage('myproject', paths, '/src/a.ts');

		const stored = window.localStorage.getItem('jat-files-open-myproject');
		expect(stored).not.toBeNull();

		const data = JSON.parse(stored!);
		expect(data.openFiles).toHaveLength(2);
		expect(data.openFiles[0].path).toBe('/src/a.ts');
		expect(data.openFiles[1].path).toBe('/src/b.ts');
		expect(data.activeFilePath).toBe('/src/a.ts');
	});

	it('should preserve tab order for drag-drop reordering', () => {
		// Original order
		saveTabsToStorage('project', ['/a.ts', '/b.ts', '/c.ts'], '/a.ts');

		// Simulate reordering (user dragged /a.ts to the end)
		saveTabsToStorage('project', ['/b.ts', '/c.ts', '/a.ts'], '/a.ts');

		const data = JSON.parse(window.localStorage.getItem('jat-files-open-project')!);
		expect(data.openFiles[0].path).toBe('/b.ts');
		expect(data.openFiles[1].path).toBe('/c.ts');
		expect(data.openFiles[2].path).toBe('/a.ts');
	});

	it('should handle null activeFilePath', () => {
		saveTabsToStorage('project', ['/src/file.ts'], null);

		const data = JSON.parse(window.localStorage.getItem('jat-files-open-project')!);
		expect(data.activeFilePath).toBeNull();
	});

	it('should remove from storage when no files open', () => {
		// First save some tabs
		saveTabsToStorage('project', ['/src/file.ts'], '/src/file.ts');
		expect(window.localStorage.getItem('jat-files-open-project')).not.toBeNull();

		// Now save empty array
		saveTabsToStorage('project', [], null);
		expect(window.localStorage.getItem('jat-files-open-project')).toBeNull();
	});

	it('should overwrite previous saved state', () => {
		saveTabsToStorage('project', ['/old.ts'], '/old.ts');
		saveTabsToStorage('project', ['/new.ts'], '/new.ts');

		const data = JSON.parse(window.localStorage.getItem('jat-files-open-project')!);
		expect(data.openFiles).toHaveLength(1);
		expect(data.openFiles[0].path).toBe('/new.ts');
	});

	it('should handle paths with spaces', () => {
		saveTabsToStorage('project', ['/path with spaces/file.ts'], '/path with spaces/file.ts');

		const data = JSON.parse(window.localStorage.getItem('jat-files-open-project')!);
		expect(data.openFiles[0].path).toBe('/path with spaces/file.ts');
	});

	it('should handle paths with special characters', () => {
		saveTabsToStorage('project', ['/src/@types/index.d.ts'], '/src/@types/index.d.ts');

		const data = JSON.parse(window.localStorage.getItem('jat-files-open-project')!);
		expect(data.openFiles[0].path).toBe('/src/@types/index.d.ts');
	});
});

// ============================================================================
// loadTabsFromStorage Tests
// ============================================================================

describe('loadTabsFromStorage', () => {
	it('should load saved tabs correctly', () => {
		const data: PersistedTabState = {
			openFiles: [{ path: '/src/a.ts' }, { path: '/src/b.ts' }],
			activeFilePath: '/src/a.ts'
		};
		window.localStorage.setItem('jat-files-open-project', JSON.stringify(data));

		const result = loadTabsFromStorage('project');
		expect(result).not.toBeNull();
		expect(result!.openFiles).toHaveLength(2);
		expect(result!.openFiles[0].path).toBe('/src/a.ts');
		expect(result!.openFiles[1].path).toBe('/src/b.ts');
		expect(result!.activeFilePath).toBe('/src/a.ts');
	});

	it('should return null when no saved data', () => {
		const result = loadTabsFromStorage('nonexistent');
		expect(result).toBeNull();
	});

	it('should return null and clear storage on invalid JSON', () => {
		window.localStorage.setItem('jat-files-open-project', 'not valid json');

		const result = loadTabsFromStorage('project');
		expect(result).toBeNull();
		expect(window.localStorage.getItem('jat-files-open-project')).toBeNull();
	});

	it('should return null when openFiles is not an array', () => {
		window.localStorage.setItem(
			'jat-files-open-project',
			JSON.stringify({
				openFiles: 'not an array',
				activeFilePath: null
			})
		);

		const result = loadTabsFromStorage('project');
		expect(result).toBeNull();
	});

	it('should filter out entries without valid path', () => {
		window.localStorage.setItem(
			'jat-files-open-project',
			JSON.stringify({
				openFiles: [{ path: '/valid.ts' }, { path: '' }, { path: null }, { noPath: true }],
				activeFilePath: '/valid.ts'
			})
		);

		const result = loadTabsFromStorage('project');
		expect(result).not.toBeNull();
		expect(result!.openFiles).toHaveLength(1);
		expect(result!.openFiles[0].path).toBe('/valid.ts');
	});

	it('should handle null activeFilePath', () => {
		window.localStorage.setItem(
			'jat-files-open-project',
			JSON.stringify({
				openFiles: [{ path: '/file.ts' }],
				activeFilePath: null
			})
		);

		const result = loadTabsFromStorage('project');
		expect(result!.activeFilePath).toBeNull();
	});

	it('should treat empty string activeFilePath as null', () => {
		window.localStorage.setItem(
			'jat-files-open-project',
			JSON.stringify({
				openFiles: [{ path: '/file.ts' }],
				activeFilePath: ''
			})
		);

		const result = loadTabsFromStorage('project');
		expect(result!.activeFilePath).toBeNull();
	});

	it('should preserve tab order from storage', () => {
		const data: PersistedTabState = {
			openFiles: [{ path: '/c.ts' }, { path: '/a.ts' }, { path: '/b.ts' }],
			activeFilePath: '/a.ts'
		};
		window.localStorage.setItem('jat-files-open-project', JSON.stringify(data));

		const result = loadTabsFromStorage('project');
		expect(result!.openFiles[0].path).toBe('/c.ts');
		expect(result!.openFiles[1].path).toBe('/a.ts');
		expect(result!.openFiles[2].path).toBe('/b.ts');
	});
});

// ============================================================================
// clearTabsFromStorage Tests
// ============================================================================

describe('clearTabsFromStorage', () => {
	it('should remove saved tabs for project', () => {
		window.localStorage.setItem('jat-files-open-project', '{"openFiles":[]}');
		clearTabsFromStorage('project');
		expect(window.localStorage.getItem('jat-files-open-project')).toBeNull();
	});

	it('should not affect other projects', () => {
		window.localStorage.setItem('jat-files-open-project1', '{"openFiles":[]}');
		window.localStorage.setItem('jat-files-open-project2', '{"openFiles":[]}');

		clearTabsFromStorage('project1');

		expect(window.localStorage.getItem('jat-files-open-project1')).toBeNull();
		expect(window.localStorage.getItem('jat-files-open-project2')).not.toBeNull();
	});

	it('should be safe to call when no data exists', () => {
		expect(() => clearTabsFromStorage('nonexistent')).not.toThrow();
	});
});

// ============================================================================
// getProjectsWithSavedTabs Tests
// ============================================================================

describe('getProjectsWithSavedTabs', () => {
	it('should return empty array when no saved tabs', () => {
		const result = getProjectsWithSavedTabs();
		expect(result).toEqual([]);
	});

	it('should return project names with saved tabs', () => {
		window.localStorage.setItem('jat-files-open-project1', '{}');
		window.localStorage.setItem('jat-files-open-project2', '{}');

		const result = getProjectsWithSavedTabs();
		expect(result).toContain('project1');
		expect(result).toContain('project2');
		expect(result).toHaveLength(2);
	});

	it('should not include unrelated localStorage keys', () => {
		window.localStorage.setItem('jat-files-open-myproject', '{}');
		window.localStorage.setItem('other-key', '{}');
		window.localStorage.setItem('jat-other-setting', '{}');

		const result = getProjectsWithSavedTabs();
		expect(result).toEqual(['myproject']);
	});

	it('should handle project names with hyphens', () => {
		window.localStorage.setItem('jat-files-open-my-cool-project', '{}');

		const result = getProjectsWithSavedTabs();
		expect(result).toContain('my-cool-project');
	});
});

// ============================================================================
// reorderTabs Tests
// ============================================================================

describe('reorderTabs', () => {
	it('should move tab from beginning to end', () => {
		const result = reorderTabs(['/a.ts', '/b.ts', '/c.ts'], 0, 2);
		expect(result).toEqual(['/b.ts', '/c.ts', '/a.ts']);
	});

	it('should move tab from end to beginning', () => {
		const result = reorderTabs(['/a.ts', '/b.ts', '/c.ts'], 2, 0);
		expect(result).toEqual(['/c.ts', '/a.ts', '/b.ts']);
	});

	it('should move tab to middle position', () => {
		const result = reorderTabs(['/a.ts', '/b.ts', '/c.ts', '/d.ts'], 0, 2);
		expect(result).toEqual(['/b.ts', '/c.ts', '/a.ts', '/d.ts']);
	});

	it('should return same array when fromIndex equals toIndex', () => {
		const original = ['/a.ts', '/b.ts'];
		const result = reorderTabs(original, 1, 1);
		expect(result).toBe(original); // Same reference
	});

	it('should return original array for invalid fromIndex', () => {
		const original = ['/a.ts', '/b.ts'];
		expect(reorderTabs(original, -1, 1)).toBe(original);
		expect(reorderTabs(original, 5, 1)).toBe(original);
	});

	it('should return original array for invalid toIndex', () => {
		const original = ['/a.ts', '/b.ts'];
		expect(reorderTabs(original, 0, -1)).toBe(original);
		expect(reorderTabs(original, 0, 5)).toBe(original);
	});

	it('should not mutate original array', () => {
		const original = ['/a.ts', '/b.ts', '/c.ts'];
		const copy = [...original];
		reorderTabs(original, 0, 2);
		expect(original).toEqual(copy);
	});

	it('should handle single element array', () => {
		const result = reorderTabs(['/only.ts'], 0, 0);
		expect(result).toEqual(['/only.ts']);
	});

	it('should handle adjacent swap (forward)', () => {
		const result = reorderTabs(['/a.ts', '/b.ts', '/c.ts'], 0, 1);
		expect(result).toEqual(['/b.ts', '/a.ts', '/c.ts']);
	});

	it('should handle adjacent swap (backward)', () => {
		const result = reorderTabs(['/a.ts', '/b.ts', '/c.ts'], 1, 0);
		expect(result).toEqual(['/b.ts', '/a.ts', '/c.ts']);
	});
});

// ============================================================================
// getNextActiveFile Tests
// ============================================================================

describe('getNextActiveFile', () => {
	it('should keep current active when not closing active file', () => {
		const result = getNextActiveFile(['/a.ts', '/b.ts', '/c.ts'], '/b.ts', '/a.ts');
		expect(result).toBe('/a.ts');
	});

	it('should select previous neighbor when closing active file', () => {
		// Closing /b.ts which is at index 1, should select /a.ts (index 0)
		const result = getNextActiveFile(['/a.ts', '/b.ts', '/c.ts'], '/b.ts', '/b.ts');
		expect(result).toBe('/a.ts');
	});

	it('should select first remaining when closing first file', () => {
		const result = getNextActiveFile(['/a.ts', '/b.ts', '/c.ts'], '/a.ts', '/a.ts');
		expect(result).toBe('/b.ts');
	});

	it('should select last remaining when closing last file', () => {
		const result = getNextActiveFile(['/a.ts', '/b.ts', '/c.ts'], '/c.ts', '/c.ts');
		expect(result).toBe('/b.ts');
	});

	it('should return null when closing the only file', () => {
		const result = getNextActiveFile(['/only.ts'], '/only.ts', '/only.ts');
		expect(result).toBeNull();
	});

	it('should return currentActive when closingPath not found', () => {
		const result = getNextActiveFile(['/a.ts', '/b.ts'], '/nonexistent.ts', '/a.ts');
		expect(result).toBe('/a.ts');
	});

	it('should return currentActive when currentActive is null and not closing', () => {
		const result = getNextActiveFile(['/a.ts', '/b.ts'], '/a.ts', null);
		expect(result).toBeNull();
	});

	it('should handle two-file scenario when closing active', () => {
		const result = getNextActiveFile(['/a.ts', '/b.ts'], '/a.ts', '/a.ts');
		expect(result).toBe('/b.ts');
	});
});

// ============================================================================
// Integration Tests: Save then Load
// ============================================================================

describe('Integration: save and load roundtrip', () => {
	it('should preserve exact tab order after save/load', () => {
		const paths = ['/z.ts', '/a.ts', '/m.ts', '/b.ts'];
		saveTabsToStorage('project', paths, '/a.ts');

		const loaded = loadTabsFromStorage('project');
		expect(loaded!.openFiles.map((f) => f.path)).toEqual(paths);
		expect(loaded!.activeFilePath).toBe('/a.ts');
	});

	it('should handle reorder then save/load', () => {
		// Original order
		const original = ['/a.ts', '/b.ts', '/c.ts'];
		saveTabsToStorage('project', original, '/a.ts');

		// Reorder
		const reordered = reorderTabs(original, 0, 2);
		saveTabsToStorage('project', reordered, '/a.ts');

		// Load and verify
		const loaded = loadTabsFromStorage('project');
		expect(loaded!.openFiles.map((f) => f.path)).toEqual(['/b.ts', '/c.ts', '/a.ts']);
	});

	it('should survive multiple reorders', () => {
		let paths = ['/1.ts', '/2.ts', '/3.ts', '/4.ts'];

		// Multiple reorders
		paths = reorderTabs(paths, 0, 3); // [2, 3, 4, 1]
		paths = reorderTabs(paths, 1, 0); // [3, 2, 4, 1]
		paths = reorderTabs(paths, 3, 2); // [3, 2, 1, 4]

		saveTabsToStorage('project', paths, '/3.ts');

		const loaded = loadTabsFromStorage('project');
		expect(loaded!.openFiles.map((f) => f.path)).toEqual(['/3.ts', '/2.ts', '/1.ts', '/4.ts']);
	});

	it('should handle close then save/load', () => {
		const paths = ['/a.ts', '/b.ts', '/c.ts'];
		const closingPath = '/b.ts';
		const newActive = getNextActiveFile(paths, closingPath, '/b.ts');

		const remaining = paths.filter((p) => p !== closingPath);
		saveTabsToStorage('project', remaining, newActive);

		const loaded = loadTabsFromStorage('project');
		expect(loaded!.openFiles.map((f) => f.path)).toEqual(['/a.ts', '/c.ts']);
		expect(loaded!.activeFilePath).toBe('/a.ts');
	});
});

// ============================================================================
// Edge Cases and Robustness Tests
// ============================================================================

describe('Edge cases', () => {
	it('should handle very long file paths', () => {
		const longPath =
			'/' + 'very/deep/nested/'.repeat(50) + 'file.ts';
		saveTabsToStorage('project', [longPath], longPath);

		const loaded = loadTabsFromStorage('project');
		expect(loaded!.openFiles[0].path).toBe(longPath);
	});

	it('should handle unicode in file paths', () => {
		const unicodePath = '/src/文件/ファイル/αβγ.ts';
		saveTabsToStorage('project', [unicodePath], unicodePath);

		const loaded = loadTabsFromStorage('project');
		expect(loaded!.openFiles[0].path).toBe(unicodePath);
	});

	it('should handle many open tabs', () => {
		const paths = Array.from({ length: 100 }, (_, i) => `/file${i}.ts`);
		saveTabsToStorage('project', paths, paths[50]);

		const loaded = loadTabsFromStorage('project');
		expect(loaded!.openFiles).toHaveLength(100);
		expect(loaded!.activeFilePath).toBe('/file50.ts');
	});

	it('should handle concurrent project saves', () => {
		saveTabsToStorage('project1', ['/a.ts'], '/a.ts');
		saveTabsToStorage('project2', ['/b.ts'], '/b.ts');
		saveTabsToStorage('project3', ['/c.ts'], '/c.ts');

		expect(loadTabsFromStorage('project1')!.openFiles[0].path).toBe('/a.ts');
		expect(loadTabsFromStorage('project2')!.openFiles[0].path).toBe('/b.ts');
		expect(loadTabsFromStorage('project3')!.openFiles[0].path).toBe('/c.ts');
	});
});
