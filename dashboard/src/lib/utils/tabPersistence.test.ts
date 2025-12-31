/**
 * Unit Tests for tabPersistence.ts
 *
 * Tests tab order storage and retrieval for the /files page,
 * including drag-drop reordering persistence.
 */

import { describe, it, expect } from 'vitest';
import {
	getStorageKey,
	reorderTabs,
	getNextActiveFile
} from './tabPersistence';

// ============================================================================
// NOTE: Storage functions (saveTabsToStorage, loadTabsFromStorage, etc.)
// require a browser environment with localStorage. These are tested via
// integration tests in the browser. These unit tests focus on pure functions.
// ============================================================================

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

	it('should handle paths with special characters', () => {
		const paths = ['/src/@types/index.d.ts', '/path with spaces/file.ts', '/文件.ts'];
		const result = reorderTabs(paths, 0, 2);
		expect(result).toEqual(['/path with spaces/file.ts', '/文件.ts', '/src/@types/index.d.ts']);
	});

	it('should handle many items', () => {
		const paths = Array.from({ length: 100 }, (_, i) => `/file${i}.ts`);
		const result = reorderTabs(paths, 0, 99);
		expect(result[0]).toBe('/file1.ts');
		expect(result[99]).toBe('/file0.ts');
		expect(result).toHaveLength(100);
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

	it('should work with unicode paths', () => {
		const paths = ['/src/文件.ts', '/src/αβγ.ts', '/src/normal.ts'];
		const result = getNextActiveFile(paths, '/src/αβγ.ts', '/src/αβγ.ts');
		expect(result).toBe('/src/文件.ts');
	});
});

// ============================================================================
// Integration: Pure functions working together
// ============================================================================

describe('Integration: reorder + next active', () => {
	it('should work together for tab close after reorder', () => {
		// Start with tabs, reorder them, then close one
		let paths = ['/a.ts', '/b.ts', '/c.ts'];

		// Reorder: move /a.ts to end
		paths = reorderTabs(paths, 0, 2);
		expect(paths).toEqual(['/b.ts', '/c.ts', '/a.ts']);

		// Close /c.ts which is now in the middle
		const nextActive = getNextActiveFile(paths, '/c.ts', '/c.ts');
		expect(nextActive).toBe('/b.ts'); // Previous neighbor
	});

	it('should handle multiple reorders correctly', () => {
		let paths = ['/1.ts', '/2.ts', '/3.ts', '/4.ts'];

		// Multiple reorders
		paths = reorderTabs(paths, 0, 3); // [2, 3, 4, 1]
		expect(paths).toEqual(['/2.ts', '/3.ts', '/4.ts', '/1.ts']);

		paths = reorderTabs(paths, 1, 0); // [3, 2, 4, 1]
		expect(paths).toEqual(['/3.ts', '/2.ts', '/4.ts', '/1.ts']);

		paths = reorderTabs(paths, 3, 2); // [3, 2, 1, 4]
		expect(paths).toEqual(['/3.ts', '/2.ts', '/1.ts', '/4.ts']);
	});

	it('should correctly select next active after reorder and close', () => {
		// Simulate: Open A, B, C. Reorder to B, A, C. Active is A. Close A.
		let paths = ['/a.ts', '/b.ts', '/c.ts'];
		let active = '/a.ts';

		// Reorder: move /a.ts to middle position (index 0 to index 1)
		paths = reorderTabs(paths, 0, 1);
		expect(paths).toEqual(['/b.ts', '/a.ts', '/c.ts']);
		// Active is still /a.ts, which is now at index 1

		// Close active (/a.ts at index 1)
		const newActive = getNextActiveFile(paths, '/a.ts', active);
		// Should pick /b.ts (previous neighbor, index 0)
		expect(newActive).toBe('/b.ts');

		// Verify remaining paths
		const remaining = paths.filter((p) => p !== '/a.ts');
		expect(remaining).toEqual(['/b.ts', '/c.ts']);
	});
});
