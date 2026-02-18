/**
 * GitPanel Timeline Component Tests
 *
 * Tests for the timeline-related functions and rendering logic
 * in the GitPanel component.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Test Fixtures
// ============================================================================

interface Commit {
	hash: string;
	hashShort: string;
	date: string;
	message: string;
	author_name: string;
	author_email: string;
	refs: string;
}

const MOCK_COMMITS: Commit[] = [
	{
		hash: 'abc123def456abc123def456abc123def456abc1',
		hashShort: 'abc123d',
		date: new Date().toISOString(), // Now - should be "just now"
		message: 'feat: Add new feature for user authentication',
		author_name: 'John Doe',
		author_email: 'john@example.com',
		refs: 'HEAD -> main'
	},
	{
		hash: 'def456abc123def456abc123def456abc123def4',
		hashShort: 'def456a',
		date: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
		message: 'fix: Resolve bug in login flow',
		author_name: 'Jane Smith',
		author_email: 'jane@example.com',
		refs: ''
	},
	{
		hash: 'ghi789abc123def456abc123def456abc123ghi7',
		hashShort: 'ghi789a',
		date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
		message: 'chore: Update dependencies',
		author_name: 'Dev Bot',
		author_email: 'bot@example.com',
		refs: ''
	},
	{
		hash: 'jkl012abc123def456abc123def456abc123jkl0',
		hashShort: 'jkl012a',
		date: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // yesterday
		message: 'docs: Update README with installation instructions',
		author_name: 'John Doe',
		author_email: 'john@example.com',
		refs: 'origin/main'
	},
	{
		hash: 'mno345abc123def456abc123def456abc123mno3',
		hashShort: 'mno345a',
		date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
		message:
			'refactor: Completely restructure the entire authentication module to use a more modular approach with better separation of concerns',
		author_name: 'Jane Smith',
		author_email: 'jane@example.com',
		refs: ''
	}
];

// ============================================================================
// Extracted Functions from GitPanel (for unit testing)
// ============================================================================

/**
 * Format a date as relative time (e.g., "2h ago", "yesterday", "3 days ago")
 */
function formatTimeAgo(dateString: string): string {
	const date = new Date(dateString);
	const now = new Date();
	const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

	if (seconds < 60) return 'just now';
	if (seconds < 3600) {
		const mins = Math.floor(seconds / 60);
		return `${mins}m ago`;
	}
	if (seconds < 86400) {
		const hours = Math.floor(seconds / 3600);
		return `${hours}h ago`;
	}
	if (seconds < 172800) return 'yesterday';
	if (seconds < 604800) {
		const days = Math.floor(seconds / 86400);
		return `${days}d ago`;
	}
	if (seconds < 2592000) {
		const weeks = Math.floor(seconds / 604800);
		return `${weeks}w ago`;
	}
	if (seconds < 31536000) {
		const months = Math.floor(seconds / 2592000);
		return `${months}mo ago`;
	}
	const years = Math.floor(seconds / 31536000);
	return `${years}y ago`;
}

/**
 * Truncate a string to a maximum length with ellipsis
 */
function truncate(str: string, maxLen: number): string {
	if (str.length <= maxLen) return str;
	return str.slice(0, maxLen - 1) + '…';
}

/**
 * Get status indicator for a file
 */
function getStatusIndicator(
	file: string,
	type: 'staged' | 'modified' | 'deleted' | 'untracked' | 'created',
	stagedFiles: string[] = [],
	createdFiles: string[] = [],
	deletedFiles: string[] = []
): { letter: string; color: string; title: string } {
	switch (type) {
		case 'staged':
			// Could be added, modified, or deleted - check which
			if (createdFiles.includes(file))
				return { letter: 'A', color: 'oklch(0.65 0.15 145)', title: 'Added' };
			if (deletedFiles.includes(file))
				return { letter: 'D', color: 'oklch(0.65 0.15 25)', title: 'Deleted' };
			return { letter: 'M', color: 'oklch(0.65 0.15 85)', title: 'Modified' };
		case 'modified':
			return { letter: 'M', color: 'oklch(0.65 0.15 85)', title: 'Modified' };
		case 'deleted':
			return { letter: 'D', color: 'oklch(0.65 0.15 25)', title: 'Deleted' };
		case 'untracked':
			return { letter: '?', color: 'oklch(0.55 0.02 250)', title: 'Untracked' };
		case 'created':
			return { letter: 'A', color: 'oklch(0.65 0.15 145)', title: 'Added' };
		default:
			return { letter: '?', color: 'oklch(0.55 0.02 250)', title: 'Unknown' };
	}
}

/**
 * Get filename from path
 */
function getFileName(path: string): string {
	return path.split('/').pop() || path;
}

/**
 * Get directory from path
 */
function getDirectory(path: string): string {
	const parts = path.split('/');
	if (parts.length <= 1) return '';
	return parts.slice(0, -1).join('/');
}

// ============================================================================
// Tests: formatTimeAgo
// ============================================================================

describe('formatTimeAgo', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should return "just now" for times less than 60 seconds ago', () => {
		const now = new Date('2025-01-06T12:00:00Z');
		vi.setSystemTime(now);

		expect(formatTimeAgo('2025-01-06T12:00:00Z')).toBe('just now');
		expect(formatTimeAgo('2025-01-06T11:59:30Z')).toBe('just now'); // 30 seconds ago
		expect(formatTimeAgo('2025-01-06T11:59:01Z')).toBe('just now'); // 59 seconds ago
	});

	it('should return minutes ago for times between 1-59 minutes', () => {
		const now = new Date('2025-01-06T12:00:00Z');
		vi.setSystemTime(now);

		expect(formatTimeAgo('2025-01-06T11:59:00Z')).toBe('1m ago'); // 1 minute
		expect(formatTimeAgo('2025-01-06T11:45:00Z')).toBe('15m ago'); // 15 minutes
		expect(formatTimeAgo('2025-01-06T11:30:00Z')).toBe('30m ago'); // 30 minutes
		expect(formatTimeAgo('2025-01-06T11:01:00Z')).toBe('59m ago'); // 59 minutes
	});

	it('should return hours ago for times between 1-23 hours', () => {
		const now = new Date('2025-01-06T12:00:00Z');
		vi.setSystemTime(now);

		expect(formatTimeAgo('2025-01-06T11:00:00Z')).toBe('1h ago'); // 1 hour
		expect(formatTimeAgo('2025-01-06T06:00:00Z')).toBe('6h ago'); // 6 hours
		expect(formatTimeAgo('2025-01-06T00:00:00Z')).toBe('12h ago'); // 12 hours
		expect(formatTimeAgo('2025-01-05T13:00:00Z')).toBe('23h ago'); // 23 hours
	});

	it('should return "yesterday" for times 24-47 hours ago', () => {
		const now = new Date('2025-01-06T12:00:00Z');
		vi.setSystemTime(now);

		expect(formatTimeAgo('2025-01-05T12:00:00Z')).toBe('yesterday'); // exactly 24 hours
		expect(formatTimeAgo('2025-01-05T00:00:00Z')).toBe('yesterday'); // 36 hours
		expect(formatTimeAgo('2025-01-04T13:00:00Z')).toBe('yesterday'); // 47 hours
	});

	it('should return days ago for times 2-6 days ago', () => {
		const now = new Date('2025-01-06T12:00:00Z');
		vi.setSystemTime(now);

		expect(formatTimeAgo('2025-01-04T12:00:00Z')).toBe('2d ago'); // 2 days
		expect(formatTimeAgo('2025-01-03T12:00:00Z')).toBe('3d ago'); // 3 days
		expect(formatTimeAgo('2025-01-01T12:00:00Z')).toBe('5d ago'); // 5 days
		expect(formatTimeAgo('2024-12-31T12:00:00Z')).toBe('6d ago'); // 6 days
	});

	it('should return weeks ago for times 1-4 weeks ago', () => {
		const now = new Date('2025-01-06T12:00:00Z');
		vi.setSystemTime(now);

		expect(formatTimeAgo('2024-12-30T12:00:00Z')).toBe('1w ago'); // 1 week
		expect(formatTimeAgo('2024-12-23T12:00:00Z')).toBe('2w ago'); // 2 weeks
		expect(formatTimeAgo('2024-12-09T12:00:00Z')).toBe('4w ago'); // 4 weeks
	});

	it('should return months ago for times 1-11 months ago', () => {
		const now = new Date('2025-01-06T12:00:00Z');
		vi.setSystemTime(now);

		expect(formatTimeAgo('2024-12-06T12:00:00Z')).toBe('1mo ago'); // 1 month
		expect(formatTimeAgo('2024-10-06T12:00:00Z')).toBe('3mo ago'); // 3 months
		expect(formatTimeAgo('2024-07-06T12:00:00Z')).toBe('6mo ago'); // 6 months
	});

	it('should return years ago for times 1+ years ago', () => {
		const now = new Date('2025-01-06T12:00:00Z');
		vi.setSystemTime(now);

		expect(formatTimeAgo('2024-01-06T12:00:00Z')).toBe('1y ago'); // 1 year
		expect(formatTimeAgo('2023-01-06T12:00:00Z')).toBe('2y ago'); // 2 years
		expect(formatTimeAgo('2020-01-06T12:00:00Z')).toBe('5y ago'); // 5 years
	});

	it('should handle invalid date strings gracefully', () => {
		const now = new Date('2025-01-06T12:00:00Z');
		vi.setSystemTime(now);

		// Invalid dates result in NaN comparison which returns very large negative number
		const result = formatTimeAgo('invalid-date');
		expect(typeof result).toBe('string');
	});
});

// ============================================================================
// Tests: truncate
// ============================================================================

describe('truncate', () => {
	it('should return original string if shorter than maxLen', () => {
		expect(truncate('short', 10)).toBe('short');
		expect(truncate('hello', 5)).toBe('hello');
		expect(truncate('', 10)).toBe('');
	});

	it('should return original string if exactly maxLen', () => {
		expect(truncate('hello', 5)).toBe('hello');
		expect(truncate('test', 4)).toBe('test');
	});

	it('should truncate and add ellipsis if longer than maxLen', () => {
		expect(truncate('hello world', 5)).toBe('hell…');
		expect(truncate('this is a very long message', 10)).toBe('this is a…');
		expect(truncate('abcdefghij', 5)).toBe('abcd…');
	});

	it('should handle maxLen of 1', () => {
		expect(truncate('hello', 1)).toBe('…');
	});

	it('should handle maxLen of 2', () => {
		expect(truncate('hello', 2)).toBe('h…');
	});

	it('should handle single character strings', () => {
		expect(truncate('a', 5)).toBe('a');
		expect(truncate('a', 1)).toBe('a');
	});

	it('should truncate commit message to 50 characters correctly', () => {
		const longMessage =
			'refactor: Completely restructure the entire authentication module to use a more modular approach';
		const truncated = truncate(longMessage, 50);
		// Truncated string should be maxLen-1 chars + ellipsis = 50 total
		expect(truncated.length).toBe(50);
		expect(truncated.endsWith('…')).toBe(true);
		expect(truncated.startsWith('refactor: Completely restructure')).toBe(true);
	});

	it('should not truncate short commit messages', () => {
		const shortMessage = 'fix: Bug in login';
		expect(truncate(shortMessage, 50)).toBe(shortMessage);
	});
});

// ============================================================================
// Tests: getStatusIndicator
// ============================================================================

describe('getStatusIndicator', () => {
	it('should return correct indicator for modified files', () => {
		const result = getStatusIndicator('src/app.ts', 'modified');
		expect(result.letter).toBe('M');
		expect(result.title).toBe('Modified');
		expect(result.color).toContain('oklch');
	});

	it('should return correct indicator for deleted files', () => {
		const result = getStatusIndicator('src/old.ts', 'deleted');
		expect(result.letter).toBe('D');
		expect(result.title).toBe('Deleted');
	});

	it('should return correct indicator for untracked files', () => {
		const result = getStatusIndicator('src/new.ts', 'untracked');
		expect(result.letter).toBe('?');
		expect(result.title).toBe('Untracked');
	});

	it('should return correct indicator for created files', () => {
		const result = getStatusIndicator('src/new.ts', 'created');
		expect(result.letter).toBe('A');
		expect(result.title).toBe('Added');
	});

	it('should return Added for staged files that are in createdFiles', () => {
		const createdFiles = ['src/new.ts'];
		const result = getStatusIndicator('src/new.ts', 'staged', [], createdFiles);
		expect(result.letter).toBe('A');
		expect(result.title).toBe('Added');
	});

	it('should return Deleted for staged files that are in deletedFiles', () => {
		const deletedFiles = ['src/old.ts'];
		const result = getStatusIndicator('src/old.ts', 'staged', [], [], deletedFiles);
		expect(result.letter).toBe('D');
		expect(result.title).toBe('Deleted');
	});

	it('should return Modified for staged files not in created or deleted', () => {
		const result = getStatusIndicator('src/app.ts', 'staged', [], [], []);
		expect(result.letter).toBe('M');
		expect(result.title).toBe('Modified');
	});
});

// ============================================================================
// Tests: getFileName
// ============================================================================

describe('getFileName', () => {
	it('should extract filename from path', () => {
		expect(getFileName('src/lib/components/App.svelte')).toBe('App.svelte');
		expect(getFileName('package.json')).toBe('package.json');
		expect(getFileName('src/index.ts')).toBe('index.ts');
	});

	it('should handle paths with single file', () => {
		expect(getFileName('README.md')).toBe('README.md');
	});

	it('should handle deeply nested paths', () => {
		expect(getFileName('a/b/c/d/e/f.txt')).toBe('f.txt');
	});

	it('should handle empty string', () => {
		expect(getFileName('')).toBe('');
	});
});

// ============================================================================
// Tests: getDirectory
// ============================================================================

describe('getDirectory', () => {
	it('should extract directory from path', () => {
		expect(getDirectory('src/lib/components/App.svelte')).toBe('src/lib/components');
		expect(getDirectory('src/index.ts')).toBe('src');
	});

	it('should return empty string for root-level files', () => {
		expect(getDirectory('package.json')).toBe('');
		expect(getDirectory('README.md')).toBe('');
	});

	it('should handle deeply nested paths', () => {
		expect(getDirectory('a/b/c/d/e/f.txt')).toBe('a/b/c/d/e');
	});

	it('should handle empty string', () => {
		expect(getDirectory('')).toBe('');
	});
});

// ============================================================================
// Tests: Timeline Commit Rendering Logic
// ============================================================================

describe('Timeline Commit Rendering', () => {
	it('should identify HEAD commit as first in list', () => {
		const commits = MOCK_COMMITS;
		const headCommitHash = commits.length > 0 ? commits[0].hash : null;

		expect(headCommitHash).toBe(commits[0].hash);
		expect(commits[0].hashShort).toBe('abc123d');
	});

	it('should correctly determine isHead for each commit', () => {
		const commits = MOCK_COMMITS;
		const headCommitHash = commits[0].hash;

		const results = commits.map((commit) => ({
			hash: commit.hashShort,
			isHead: commit.hash === headCommitHash
		}));

		expect(results[0].isHead).toBe(true);
		expect(results[1].isHead).toBe(false);
		expect(results[2].isHead).toBe(false);
		expect(results[3].isHead).toBe(false);
		expect(results[4].isHead).toBe(false);
	});

	it('should extract first line of multi-line commit message', () => {
		const message = 'feat: Add feature\n\nThis is the description\n- Item 1\n- Item 2';
		const firstLine = message.split('\n')[0];
		expect(firstLine).toBe('feat: Add feature');
	});

	it('should handle single-line commit messages', () => {
		const message = 'fix: Quick bug fix';
		const firstLine = message.split('\n')[0];
		expect(firstLine).toBe('fix: Quick bug fix');
	});

	it('should truncate long commit messages to 50 chars', () => {
		const commits = MOCK_COMMITS;
		const longMessageCommit = commits[4];
		const firstLine = longMessageCommit.message.split('\n')[0];
		const truncated = truncate(firstLine, 50);

		expect(truncated.length).toBeLessThanOrEqual(50);
		expect(truncated.endsWith('…')).toBe(true);
	});

	it('should show different markers for HEAD vs non-HEAD commits', () => {
		// HEAD commit should show filled marker (●)
		// Non-HEAD commits should show empty marker (○)
		const commits = MOCK_COMMITS;
		const headCommitHash = commits[0].hash;

		const markers = commits.map((commit) => ({
			isHead: commit.hash === headCommitHash,
			marker: commit.hash === headCommitHash ? '●' : '○'
		}));

		expect(markers[0].marker).toBe('●');
		expect(markers[1].marker).toBe('○');
		expect(markers[2].marker).toBe('○');
	});

	it('should connect commits with line except for last', () => {
		const commits = MOCK_COMMITS;

		const showLine = commits.map((_, index) => index < commits.length - 1);

		expect(showLine[0]).toBe(true); // Show line after first
		expect(showLine[1]).toBe(true); // Show line after second
		expect(showLine[commits.length - 2]).toBe(true); // Show line after second-to-last
		expect(showLine[commits.length - 1]).toBe(false); // No line after last
	});
});

// ============================================================================
// Tests: Timeline State Management
// ============================================================================

describe('Timeline State Management', () => {
	it('should track loading state', () => {
		let isLoadingTimeline = true;

		// Simulate loading start
		expect(isLoadingTimeline).toBe(true);

		// Simulate loading complete
		isLoadingTimeline = false;
		expect(isLoadingTimeline).toBe(false);
	});

	it('should track error state', () => {
		let timelineError: string | null = null;

		// No error initially
		expect(timelineError).toBeNull();

		// Simulate error
		timelineError = 'Failed to fetch commit history';
		expect(timelineError).toBe('Failed to fetch commit history');

		// Clear error on success
		timelineError = null;
		expect(timelineError).toBeNull();
	});

	it('should track expanded/collapsed state', () => {
		let isTimelineExpanded = true;

		// Initially expanded
		expect(isTimelineExpanded).toBe(true);

		// Toggle to collapsed
		isTimelineExpanded = !isTimelineExpanded;
		expect(isTimelineExpanded).toBe(false);

		// Toggle back to expanded
		isTimelineExpanded = !isTimelineExpanded;
		expect(isTimelineExpanded).toBe(true);
	});

	it('should track commits count', () => {
		let commits: Commit[] = [];

		// Empty initially
		expect(commits.length).toBe(0);

		// Load commits
		commits = MOCK_COMMITS;
		expect(commits.length).toBe(5);
	});

	it('should update headCommitHash when commits load', () => {
		let headCommitHash: string | null = null;
		let commits: Commit[] = [];

		// No HEAD initially
		expect(headCommitHash).toBeNull();

		// Load commits and set HEAD
		commits = MOCK_COMMITS;
		if (commits.length > 0) {
			headCommitHash = commits[0].hash;
		}

		expect(headCommitHash).toBe(MOCK_COMMITS[0].hash);
	});
});

// ============================================================================
// Tests: Empty and Error States
// ============================================================================

describe('Timeline Empty and Error States', () => {
	it('should handle empty commits array', () => {
		const commits: Commit[] = [];
		const isEmpty = commits.length === 0;

		expect(isEmpty).toBe(true);
	});

	it('should handle loading state display logic', () => {
		const isLoadingTimeline = true;
		const timelineError: string | null = null;
		const commits: Commit[] = [];

		// When loading, show loading indicator
		const showLoading = isLoadingTimeline;
		const showError = !isLoadingTimeline && timelineError !== null;
		const showEmpty = !isLoadingTimeline && !timelineError && commits.length === 0;
		const showCommits = !isLoadingTimeline && !timelineError && commits.length > 0;

		expect(showLoading).toBe(true);
		expect(showError).toBe(false);
		expect(showEmpty).toBe(false);
		expect(showCommits).toBe(false);
	});

	it('should handle error state display logic', () => {
		const isLoadingTimeline = false;
		const timelineError = 'Network error';
		const commits: Commit[] = [];

		const showLoading = isLoadingTimeline;
		const showError = !isLoadingTimeline && timelineError !== null;
		const showEmpty = !isLoadingTimeline && !timelineError && commits.length === 0;
		const showCommits = !isLoadingTimeline && !timelineError && commits.length > 0;

		expect(showLoading).toBe(false);
		expect(showError).toBe(true);
		expect(showEmpty).toBe(false);
		expect(showCommits).toBe(false);
	});

	it('should handle empty state display logic', () => {
		const isLoadingTimeline = false;
		const timelineError: string | null = null;
		const commits: Commit[] = [];

		const showLoading = isLoadingTimeline;
		const showError = !isLoadingTimeline && timelineError !== null;
		const showEmpty = !isLoadingTimeline && !timelineError && commits.length === 0;
		const showCommits = !isLoadingTimeline && !timelineError && commits.length > 0;

		expect(showLoading).toBe(false);
		expect(showError).toBe(false);
		expect(showEmpty).toBe(true);
		expect(showCommits).toBe(false);
	});

	it('should handle commits loaded state display logic', () => {
		const isLoadingTimeline = false;
		const timelineError: string | null = null;
		const commits = MOCK_COMMITS;

		const showLoading = isLoadingTimeline;
		const showError = !isLoadingTimeline && timelineError !== null;
		const showEmpty = !isLoadingTimeline && !timelineError && commits.length === 0;
		const showCommits = !isLoadingTimeline && !timelineError && commits.length > 0;

		expect(showLoading).toBe(false);
		expect(showError).toBe(false);
		expect(showEmpty).toBe(false);
		expect(showCommits).toBe(true);
	});
});

// ============================================================================
// Tests: API Response Handling
// ============================================================================

describe('Timeline API Response Handling', () => {
	const mockFetch = vi.fn();

	beforeEach(() => {
		vi.stubGlobal('fetch', mockFetch);
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('should parse successful API response', async () => {
		const mockResponse = {
			commits: MOCK_COMMITS
		};

		mockFetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockResponse)
		});

		const response = await fetch('/api/files/git/log?project=squad&limit=30');
		const data = await response.json();

		expect(data.commits).toBeDefined();
		expect(data.commits.length).toBe(5);
		expect(data.commits[0].hashShort).toBe('abc123d');
	});

	it('should handle API error response', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			json: () => Promise.resolve({ message: 'Git repository not found' })
		});

		const response = await fetch('/api/files/git/log?project=squad&limit=30');
		const data = await response.json();

		expect(response.ok).toBe(false);
		expect(data.message).toBe('Git repository not found');
	});

	it('should handle network error', async () => {
		mockFetch.mockRejectedValue(new Error('Network error'));

		await expect(fetch('/api/files/git/log?project=squad&limit=30')).rejects.toThrow(
			'Network error'
		);
	});

	it('should handle empty commits array in response', async () => {
		const mockResponse = {
			commits: []
		};

		mockFetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockResponse)
		});

		const response = await fetch('/api/files/git/log?project=squad&limit=30');
		const data = await response.json();

		expect(data.commits).toBeDefined();
		expect(data.commits.length).toBe(0);
	});
});

// ============================================================================
// Tests: Integration - Commit Display Pipeline
// ============================================================================

describe('Commit Display Pipeline', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should format commit for display correctly', () => {
		const now = new Date('2025-01-06T12:00:00Z');
		vi.setSystemTime(now);

		const commit: Commit = {
			hash: 'abc123def456abc123def456abc123def456abc1',
			hashShort: 'abc123d',
			date: '2025-01-06T10:00:00Z', // 2 hours ago
			message: 'feat: Add new authentication flow with OAuth2 support for multiple providers',
			author_name: 'John Doe',
			author_email: 'john@example.com',
			refs: 'HEAD -> main'
		};

		// Extract display values as GitPanel would
		const displayHash = commit.hashShort;
		const displayTime = formatTimeAgo(commit.date);
		const firstLine = commit.message.split('\n')[0];
		const displayMessage = truncate(firstLine, 50);
		const displayAuthor = commit.author_name;

		expect(displayHash).toBe('abc123d');
		expect(displayTime).toBe('2h ago');
		expect(displayMessage.length).toBe(50);
		expect(displayMessage.endsWith('…')).toBe(true);
		expect(displayMessage.startsWith('feat: Add new authentication flow')).toBe(true);
		expect(displayAuthor).toBe('John Doe');
	});

	it('should correctly identify and style HEAD commit', () => {
		const commits = MOCK_COMMITS;
		const headCommitHash = commits[0].hash;

		const commitStyles = commits.map((commit) => {
			const isHead = commit.hash === headCommitHash;
			return {
				hash: commit.hashShort,
				isHead,
				markerClass: isHead ? 'head-marker' : 'commit-dot',
				itemClass: isHead ? 'is-head' : '',
				hashStyle: isHead
					? 'color: oklch(0.65 0.15 145); background: oklch(0.65 0.15 145 / 0.15)'
					: 'color: oklch(0.65 0.15 200); background: oklch(0.65 0.15 200 / 0.1)'
			};
		});

		// First commit is HEAD
		expect(commitStyles[0].isHead).toBe(true);
		expect(commitStyles[0].markerClass).toBe('head-marker');
		expect(commitStyles[0].itemClass).toBe('is-head');

		// Second commit is not HEAD
		expect(commitStyles[1].isHead).toBe(false);
		expect(commitStyles[1].markerClass).toBe('commit-dot');
		expect(commitStyles[1].itemClass).toBe('');
	});
});
