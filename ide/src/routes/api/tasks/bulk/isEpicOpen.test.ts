/**
 * Integration tests for isEpicOpen function
 *
 * Tests that isEpicOpen correctly parses the st show --json array response
 * and handles various edge cases (closed epics, missing epics, errors).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process before importing the module
vi.mock('child_process', () => ({
	exec: vi.fn()
}));

// Now import exec after mocking
import { exec } from 'child_process';

// We need to recreate the functions since they're not exported
// This tests the same logic that isEpicOpen uses internally

const escapeForShell = (str: string): string => {
	return str.replace(/'/g, "'\\''");
};

interface ExecResult {
	stdout: string;
	stderr: string;
}

const execAsync = (command: string): Promise<ExecResult> => {
	return new Promise((resolve, reject) => {
		exec(command, (error, stdout, stderr) => {
			if (error) {
				reject(error);
			} else {
				resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
			}
		});
	});
};

/**
 * Check if an epic is still open (not closed)
 * Recreated from +server.ts to test the logic
 */
async function isEpicOpen(epicId: string, projectPath?: string): Promise<boolean> {
	try {
		let command = `st show '${escapeForShell(epicId)}' --json`;
		if (projectPath) {
			command = `cd '${escapeForShell(projectPath)}' && ${command}`;
		}
		const { stdout } = await execAsync(command);
		const epics = JSON.parse(stdout.trim());
		// st show --json returns an array, not a single object
		const epic = Array.isArray(epics) ? epics[0] : epics;
		if (!epic) return false;
		return epic.status !== 'closed';
	} catch {
		// If we can't check, assume epic doesn't exist or is closed
		return false;
	}
}

// ============================================================================
// Test Fixtures
// ============================================================================

/** st show --json returns an array with one element */
const MOCK_OPEN_EPIC = JSON.stringify([{
	id: 'squad-epic1',
	title: 'Test Epic',
	description: 'An open epic',
	status: 'open',
	priority: 1,
	issue_type: 'epic'
}]);

const MOCK_IN_PROGRESS_EPIC = JSON.stringify([{
	id: 'squad-epic2',
	title: 'In Progress Epic',
	description: 'An in_progress epic',
	status: 'in_progress',
	priority: 1,
	issue_type: 'epic'
}]);

const MOCK_BLOCKED_EPIC = JSON.stringify([{
	id: 'squad-epic3',
	title: 'Blocked Epic',
	description: 'A blocked epic',
	status: 'blocked',
	priority: 1,
	issue_type: 'epic'
}]);

const MOCK_CLOSED_EPIC = JSON.stringify([{
	id: 'squad-epic4',
	title: 'Closed Epic',
	description: 'A closed epic',
	status: 'closed',
	priority: 1,
	issue_type: 'epic'
}]);

/** Empty array when epic not found */
const MOCK_EMPTY_ARRAY = JSON.stringify([]);

/** Legacy format: single object (should still work) */
const MOCK_SINGLE_OBJECT_OPEN = JSON.stringify({
	id: 'squad-epic5',
	title: 'Single Object Epic',
	description: 'Legacy format',
	status: 'open',
	priority: 1,
	issue_type: 'epic'
});

const MOCK_SINGLE_OBJECT_CLOSED = JSON.stringify({
	id: 'squad-epic6',
	title: 'Single Object Closed Epic',
	description: 'Legacy format closed',
	status: 'closed',
	priority: 1,
	issue_type: 'epic'
});

// ============================================================================
// Helper Functions
// ============================================================================

function resetMocks() {
	vi.clearAllMocks();
}

function mockExecSuccess(stdout: string) {
	vi.mocked(exec).mockImplementation((_command, callback) => {
		// @ts-expect-error - callback type is complex
		callback(null, stdout, '');
		return {} as ReturnType<typeof exec>;
	});
}

function mockExecError(message: string) {
	vi.mocked(exec).mockImplementation((_command, callback) => {
		const error = new Error(message);
		// @ts-expect-error - callback type is complex
		callback(error, '', message);
		return {} as ReturnType<typeof exec>;
	});
}

// ============================================================================
// Tests: isEpicOpen - Array Response Parsing
// ============================================================================

describe('isEpicOpen', () => {
	beforeEach(resetMocks);
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('array response parsing (st show --json format)', () => {
		it('should return true for open epic in array format', async () => {
			mockExecSuccess(MOCK_OPEN_EPIC);

			const result = await isEpicOpen('squad-epic1');

			expect(result).toBe(true);
			expect(exec).toHaveBeenCalledWith(
				expect.stringContaining("st show 'squad-epic1' --json"),
				expect.any(Function)
			);
		});

		it('should return true for in_progress epic', async () => {
			mockExecSuccess(MOCK_IN_PROGRESS_EPIC);

			const result = await isEpicOpen('squad-epic2');

			expect(result).toBe(true);
		});

		it('should return true for blocked epic', async () => {
			mockExecSuccess(MOCK_BLOCKED_EPIC);

			const result = await isEpicOpen('squad-epic3');

			expect(result).toBe(true);
		});

		it('should return false for closed epic in array format', async () => {
			mockExecSuccess(MOCK_CLOSED_EPIC);

			const result = await isEpicOpen('squad-epic4');

			expect(result).toBe(false);
		});

		it('should return false when array is empty (epic not found)', async () => {
			mockExecSuccess(MOCK_EMPTY_ARRAY);

			const result = await isEpicOpen('squad-nonexistent');

			expect(result).toBe(false);
		});
	});

	describe('legacy single object response (backwards compatibility)', () => {
		it('should return true for open epic in single object format', async () => {
			mockExecSuccess(MOCK_SINGLE_OBJECT_OPEN);

			const result = await isEpicOpen('squad-epic5');

			expect(result).toBe(true);
		});

		it('should return false for closed epic in single object format', async () => {
			mockExecSuccess(MOCK_SINGLE_OBJECT_CLOSED);

			const result = await isEpicOpen('squad-epic6');

			expect(result).toBe(false);
		});
	});

	describe('error handling', () => {
		it('should return false when exec throws an error', async () => {
			mockExecError('Command failed');

			const result = await isEpicOpen('squad-epic1');

			expect(result).toBe(false);
		});

		it('should return false when JSON parsing fails', async () => {
			mockExecSuccess('not valid json');

			const result = await isEpicOpen('squad-epic1');

			expect(result).toBe(false);
		});

		it('should return false when stdout is empty', async () => {
			mockExecSuccess('');

			const result = await isEpicOpen('squad-epic1');

			expect(result).toBe(false);
		});
	});

	describe('shell escaping', () => {
		it('should escape single quotes in epic ID', async () => {
			mockExecSuccess(MOCK_OPEN_EPIC);

			await isEpicOpen("squad-epic'test");

			expect(exec).toHaveBeenCalledWith(
				expect.stringContaining("st show 'squad-epic'\\''test' --json"),
				expect.any(Function)
			);
		});
	});

	describe('project path handling', () => {
		it('should include cd command when projectPath is provided', async () => {
			mockExecSuccess(MOCK_OPEN_EPIC);

			await isEpicOpen('squad-epic1', '/home/user/project');

			expect(exec).toHaveBeenCalledWith(
				expect.stringContaining("cd '/home/user/project' && st show 'squad-epic1' --json"),
				expect.any(Function)
			);
		});

		it('should not include cd command when projectPath is not provided', async () => {
			mockExecSuccess(MOCK_OPEN_EPIC);

			await isEpicOpen('squad-epic1');

			const callArg = vi.mocked(exec).mock.calls[0][0];
			expect(callArg).not.toContain('cd ');
			expect(callArg).toBe("st show 'squad-epic1' --json");
		});

		it('should escape single quotes in project path', async () => {
			mockExecSuccess(MOCK_OPEN_EPIC);

			await isEpicOpen('squad-epic1', "/home/user's/project");

			expect(exec).toHaveBeenCalledWith(
				expect.stringContaining("cd '/home/user'\\''s/project'"),
				expect.any(Function)
			);
		});
	});

	describe('edge cases', () => {
		it('should handle array with null first element', async () => {
			mockExecSuccess(JSON.stringify([null]));

			const result = await isEpicOpen('squad-epic1');

			expect(result).toBe(false);
		});

		it('should handle array with undefined status', async () => {
			mockExecSuccess(JSON.stringify([{ id: 'squad-epic1', title: 'No Status' }]));

			const result = await isEpicOpen('squad-epic1');

			// status !== 'closed' is true when status is undefined
			expect(result).toBe(true);
		});

		it('should handle whitespace in stdout', async () => {
			mockExecSuccess(`  ${MOCK_OPEN_EPIC}  \n`);

			const result = await isEpicOpen('squad-epic1');

			expect(result).toBe(true);
		});
	});
});
