/**
 * Token Usage Tracking Utility Tests
 *
 * Tests for tokenUsage.ts module that parses Claude Code JSONL session files
 * to aggregate token usage and costs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	buildSessionAgentMap,
	parseSessionUsage,
	calculateCost,
	getAgentUsage,
	getAllAgentUsage,
	getSystemUsage,
	type TokenUsage,
	type SessionUsage
} from './tokenUsage';

// ============================================================================
// Mocks
// ============================================================================

// Mock fs/promises
vi.mock('fs/promises', () => ({
	readdir: vi.fn(),
	readFile: vi.fn()
}));

// Mock os module
vi.mock('os', () => ({
	default: {
		homedir: () => '/mock/home'
	},
	homedir: () => '/mock/home'
}));

import { readdir, readFile } from 'fs/promises';

// ============================================================================
// Test Fixtures
// ============================================================================

const MOCK_JSONL_VALID = `{"type":"request","message":{"usage":{"input_tokens":100,"cache_creation_input_tokens":50,"cache_read_input_tokens":25,"output_tokens":200}},"timestamp":"2025-11-21T10:00:00Z"}
{"type":"response","message":{"usage":{"input_tokens":150,"cache_creation_input_tokens":75,"cache_read_input_tokens":30,"output_tokens":250}},"timestamp":"2025-11-21T11:00:00Z"}`;

const MOCK_JSONL_MALFORMED = `{"type":"request","message":{"usage":{"input_tokens":100}},"timestamp":"2025-11-21T10:00:00Z"}
{this is not valid JSON}
{"type":"response","message":{"usage":{"output_tokens":50}},"timestamp":"2025-11-21T11:00:00Z"}`;

const MOCK_JSONL_EMPTY = ``;

const MOCK_JSONL_NO_USAGE = `{"type":"request","timestamp":"2025-11-21T10:00:00Z"}
{"type":"response","timestamp":"2025-11-21T11:00:00Z"}`;

// ============================================================================
// Helper Functions
// ============================================================================

function resetMocks() {
	vi.clearAllMocks();
}

// ============================================================================
// Tests: buildSessionAgentMap
// ============================================================================

describe('buildSessionAgentMap', () => {
	beforeEach(resetMocks);

	it('should build map from agent files', async () => {
		vi.mocked(readdir).mockResolvedValue([
			'agent-abc123.txt',
			'agent-xyz789.txt',
			'other-file.txt'
		] as any);

		vi.mocked(readFile)
			.mockResolvedValueOnce('AgentAlpha')
			.mockResolvedValueOnce('AgentBeta');

		const map = await buildSessionAgentMap('/test/project');

		expect(map.size).toBe(2);
		expect(map.get('abc123')).toBe('AgentAlpha');
		expect(map.get('xyz789')).toBe('AgentBeta');
	});

	it('should handle empty .claude directory', async () => {
		vi.mocked(readdir).mockResolvedValue([] as any);

		const map = await buildSessionAgentMap('/test/project');

		expect(map.size).toBe(0);
	});

	it('should skip files that cannot be read', async () => {
		vi.mocked(readdir).mockResolvedValue([
			'agent-abc123.txt',
			'agent-xyz789.txt'
		] as any);

		vi.mocked(readFile)
			.mockResolvedValueOnce('AgentAlpha')
			.mockRejectedValueOnce(new Error('Permission denied'));

		const map = await buildSessionAgentMap('/test/project');

		expect(map.size).toBe(1);
		expect(map.get('abc123')).toBe('AgentAlpha');
		expect(map.has('xyz789')).toBe(false);
	});

	it('should skip empty agent names', async () => {
		vi.mocked(readdir).mockResolvedValue([
			'agent-abc123.txt',
			'agent-xyz789.txt'
		] as any);

		vi.mocked(readFile)
			.mockResolvedValueOnce('AgentAlpha')
			.mockResolvedValueOnce('   '); // Empty after trim

		const map = await buildSessionAgentMap('/test/project');

		expect(map.size).toBe(1);
		expect(map.get('abc123')).toBe('AgentAlpha');
		expect(map.has('xyz789')).toBe(false);
	});

	it('should handle missing .claude directory', async () => {
		vi.mocked(readdir).mockRejectedValue(new Error('Directory not found'));

		const map = await buildSessionAgentMap('/test/project');

		expect(map.size).toBe(0);
	});
});

// ============================================================================
// Tests: parseSessionUsage
// ============================================================================

describe('parseSessionUsage', () => {
	beforeEach(resetMocks);

	it('should parse valid JSONL file', async () => {
		vi.mocked(readFile).mockResolvedValue(MOCK_JSONL_VALID);

		const usage = await parseSessionUsage('session-abc', '/test/project');

		expect(usage).not.toBeNull();
		expect(usage?.sessionId).toBe('session-abc');
		expect(usage?.tokens.input).toBe(250); // 100 + 150
		expect(usage?.tokens.cache_creation).toBe(125); // 50 + 75
		expect(usage?.tokens.cache_read).toBe(55); // 25 + 30
		expect(usage?.tokens.output).toBe(450); // 200 + 250
		expect(usage?.tokens.total).toBe(880); // Sum of all
		expect(usage?.timestamp).toBe('2025-11-21T11:00:00Z'); // Last timestamp
		expect(usage?.cost).toBeGreaterThan(0);
	});

	it('should handle malformed JSONL lines gracefully', async () => {
		vi.mocked(readFile).mockResolvedValue(MOCK_JSONL_MALFORMED);

		const usage = await parseSessionUsage('session-abc', '/test/project');

		expect(usage).not.toBeNull();
		expect(usage?.tokens.input).toBe(100); // Only first line parsed
		expect(usage?.tokens.output).toBe(50); // Third line parsed
	});

	it('should handle empty JSONL file', async () => {
		vi.mocked(readFile).mockResolvedValue(MOCK_JSONL_EMPTY);

		const usage = await parseSessionUsage('session-abc', '/test/project');

		expect(usage).not.toBeNull();
		expect(usage?.tokens.total).toBe(0);
		expect(usage?.cost).toBe(0);
	});

	it('should handle JSONL with no usage data', async () => {
		vi.mocked(readFile).mockResolvedValue(MOCK_JSONL_NO_USAGE);

		const usage = await parseSessionUsage('session-abc', '/test/project');

		expect(usage).not.toBeNull();
		expect(usage?.tokens.total).toBe(0);
		expect(usage?.cost).toBe(0);
	});

	it('should return null when file not found', async () => {
		vi.mocked(readFile).mockRejectedValue(new Error('File not found'));

		const usage = await parseSessionUsage('session-abc', '/test/project');

		expect(usage).toBeNull();
	});

	it('should handle missing token fields gracefully', async () => {
		const partialUsage = `{"type":"request","message":{"usage":{"input_tokens":100}},"timestamp":"2025-11-21T10:00:00Z"}`;
		vi.mocked(readFile).mockResolvedValue(partialUsage);

		const usage = await parseSessionUsage('session-abc', '/test/project');

		expect(usage).not.toBeNull();
		expect(usage?.tokens.input).toBe(100);
		expect(usage?.tokens.cache_creation).toBe(0);
		expect(usage?.tokens.cache_read).toBe(0);
		expect(usage?.tokens.output).toBe(0);
	});

	it('should convert project path to slug correctly', async () => {
		vi.mocked(readFile).mockResolvedValue(MOCK_JSONL_VALID);

		await parseSessionUsage('session-abc', '/home/user/my/project');

		// Check that readFile was called with correct path
		// /home/user/my/project -> -home-user-my-project
		expect(readFile).toHaveBeenCalledWith(
			'/mock/home/.claude/projects/-home-user-my-project/session-abc.jsonl',
			'utf-8'
		);
	});
});

// ============================================================================
// Tests: calculateCost
// ============================================================================

describe('calculateCost', () => {
	it('should calculate cost correctly for typical usage', () => {
		const usage: TokenUsage = {
			input_tokens: 1_000_000, // 1M tokens
			cache_creation_input_tokens: 500_000, // 0.5M tokens
			cache_read_input_tokens: 2_000_000, // 2M tokens
			output_tokens: 500_000, // 0.5M tokens
			total_tokens: 4_000_000,
			cost: 0,
			sessionCount: 1
		};

		const cost = calculateCost(usage);

		// Expected: (1M * $3) + (0.5M * $3.75) + (2M * $0.30) + (0.5M * $15)
		// = $3 + $1.875 + $0.60 + $7.50 = $12.975
		expect(cost).toBeCloseTo(12.975, 3);
	});

	it('should calculate cost for zero tokens', () => {
		const usage: TokenUsage = {
			input_tokens: 0,
			cache_creation_input_tokens: 0,
			cache_read_input_tokens: 0,
			output_tokens: 0,
			total_tokens: 0,
			cost: 0,
			sessionCount: 0
		};

		const cost = calculateCost(usage);

		expect(cost).toBe(0);
	});

	it('should handle small token counts', () => {
		const usage: TokenUsage = {
			input_tokens: 100,
			cache_creation_input_tokens: 50,
			cache_read_input_tokens: 25,
			output_tokens: 200,
			total_tokens: 375,
			cost: 0,
			sessionCount: 1
		};

		const cost = calculateCost(usage);

		// Expected: (100 * $3/1M) + (50 * $3.75/1M) + (25 * $0.30/1M) + (200 * $15/1M)
		// = $0.0003 + $0.0001875 + $0.0000075 + $0.003 = $0.0034950
		expect(cost).toBeCloseTo(0.003495, 6);
	});

	it('should handle large token counts', () => {
		const usage: TokenUsage = {
			input_tokens: 100_000_000, // 100M tokens
			cache_creation_input_tokens: 50_000_000,
			cache_read_input_tokens: 200_000_000,
			output_tokens: 50_000_000,
			total_tokens: 400_000_000,
			cost: 0,
			sessionCount: 10
		};

		const cost = calculateCost(usage);

		// Expected: (100M * $3) + (50M * $3.75) + (200M * $0.30) + (50M * $15)
		// = $300 + $187.50 + $60 + $750 = $1297.50
		expect(cost).toBeCloseTo(1297.5, 2);
	});

	it('should use correct Claude Sonnet 4.5 pricing', () => {
		// Verify pricing constants are used correctly
		const usage: TokenUsage = {
			input_tokens: 1_000_000,
			cache_creation_input_tokens: 0,
			cache_read_input_tokens: 0,
			output_tokens: 0,
			total_tokens: 1_000_000,
			cost: 0,
			sessionCount: 1
		};

		expect(calculateCost(usage)).toBe(3.0); // Input: $3/M

		usage.input_tokens = 0;
		usage.cache_creation_input_tokens = 1_000_000;
		expect(calculateCost(usage)).toBe(3.75); // Cache creation: $3.75/M

		usage.cache_creation_input_tokens = 0;
		usage.cache_read_input_tokens = 1_000_000;
		expect(calculateCost(usage)).toBe(0.30); // Cache read: $0.30/M

		usage.cache_read_input_tokens = 0;
		usage.output_tokens = 1_000_000;
		expect(calculateCost(usage)).toBe(15.0); // Output: $15/M
	});
});

// ============================================================================
// Tests: getAgentUsage
// ============================================================================

describe('getAgentUsage', () => {
	beforeEach(resetMocks);

	it('should aggregate usage for an agent', async () => {
		// Mock buildSessionAgentMap
		vi.mocked(readdir).mockResolvedValueOnce([
			'agent-session1.txt',
			'agent-session2.txt'
		] as any);

		vi.mocked(readFile)
			.mockResolvedValueOnce('AgentAlpha') // agent-session1.txt
			.mockResolvedValueOnce('AgentAlpha') // agent-session2.txt
			.mockResolvedValueOnce(MOCK_JSONL_VALID) // session1.jsonl
			.mockResolvedValueOnce(MOCK_JSONL_VALID); // session2.jsonl

		const usage = await getAgentUsage('AgentAlpha', 'all', '/test/project');

		expect(usage.input_tokens).toBe(500); // 250 * 2
		expect(usage.cache_creation_input_tokens).toBe(250); // 125 * 2
		expect(usage.cache_read_input_tokens).toBe(110); // 55 * 2
		expect(usage.output_tokens).toBe(900); // 450 * 2
		expect(usage.total_tokens).toBe(1760); // 880 * 2
		expect(usage.sessionCount).toBe(2);
	});

	it('should return zero usage for non-existent agent', async () => {
		vi.mocked(readdir).mockResolvedValue([] as any);

		const usage = await getAgentUsage('NonExistentAgent', 'all', '/test/project');

		expect(usage.input_tokens).toBe(0);
		expect(usage.total_tokens).toBe(0);
		expect(usage.sessionCount).toBe(0);
		expect(usage.cost).toBe(0);
	});

	it('should filter by time range (today)', async () => {
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		const todaySession = `{"type":"request","message":{"usage":{"input_tokens":100,"output_tokens":200}},"timestamp":"${today.toISOString()}"}`;
		const yesterdaySession = `{"type":"request","message":{"usage":{"input_tokens":100,"output_tokens":200}},"timestamp":"${yesterday.toISOString()}"}`;

		vi.mocked(readdir).mockResolvedValueOnce([
			'agent-session1.txt',
			'agent-session2.txt'
		] as any);

		vi.mocked(readFile)
			.mockResolvedValueOnce('AgentAlpha')
			.mockResolvedValueOnce('AgentAlpha')
			.mockResolvedValueOnce(todaySession)
			.mockResolvedValueOnce(yesterdaySession);

		const usage = await getAgentUsage('AgentAlpha', 'today', '/test/project');

		// Should only include today's session
		expect(usage.sessionCount).toBe(1);
		expect(usage.input_tokens).toBe(100);
		expect(usage.output_tokens).toBe(200);
	});

	it('should handle sessions with missing JSONL files', async () => {
		vi.mocked(readdir).mockResolvedValueOnce([
			'agent-session1.txt',
			'agent-session2.txt'
		] as any);

		vi.mocked(readFile)
			.mockResolvedValueOnce('AgentAlpha')
			.mockResolvedValueOnce('AgentAlpha')
			.mockResolvedValueOnce(MOCK_JSONL_VALID) // session1.jsonl exists
			.mockRejectedValueOnce(new Error('File not found')); // session2.jsonl missing

		const usage = await getAgentUsage('AgentAlpha', 'all', '/test/project');

		expect(usage.sessionCount).toBe(1); // Only one session parsed
		expect(usage.input_tokens).toBe(250);
	});
});

// ============================================================================
// Tests: getAllAgentUsage
// ============================================================================

describe('getAllAgentUsage', () => {
	beforeEach(resetMocks);

	it('should get usage for all agents', async () => {
		// getAllAgentUsage calls buildSessionAgentMap once, then getAgentUsage for each agent
		// Each getAgentUsage also calls buildSessionAgentMap
		// So we need: 1 initial + 2 for each agent = 3 readdir calls total

		vi.mocked(readdir)
			.mockResolvedValueOnce(['agent-session1.txt', 'agent-session2.txt'] as any) // Initial buildSessionAgentMap
			.mockResolvedValueOnce(['agent-session1.txt', 'agent-session2.txt'] as any) // AgentAlpha's getAgentUsage
			.mockResolvedValueOnce(['agent-session1.txt', 'agent-session2.txt'] as any); // AgentBeta's getAgentUsage

		vi.mocked(readFile)
			.mockResolvedValueOnce('AgentAlpha') // Initial: session1
			.mockResolvedValueOnce('AgentBeta') // Initial: session2
			.mockResolvedValueOnce('AgentAlpha') // AgentAlpha's buildSessionAgentMap: session1
			.mockResolvedValueOnce('AgentBeta') // AgentAlpha's buildSessionAgentMap: session2
			.mockResolvedValueOnce(MOCK_JSONL_VALID) // AgentAlpha's parseSessionUsage: session1.jsonl
			.mockResolvedValueOnce('AgentAlpha') // AgentBeta's buildSessionAgentMap: session1
			.mockResolvedValueOnce('AgentBeta') // AgentBeta's buildSessionAgentMap: session2
			.mockResolvedValueOnce(MOCK_JSONL_VALID); // AgentBeta's parseSessionUsage: session2.jsonl

		const usageMap = await getAllAgentUsage('all', '/test/project');

		expect(usageMap.size).toBe(2);
		expect(usageMap.has('AgentAlpha')).toBe(true);
		expect(usageMap.has('AgentBeta')).toBe(true);

		const alphaUsage = usageMap.get('AgentAlpha');
		expect(alphaUsage?.sessionCount).toBe(1);
		expect(alphaUsage?.total_tokens).toBe(880);

		const betaUsage = usageMap.get('AgentBeta');
		expect(betaUsage?.sessionCount).toBe(1);
		expect(betaUsage?.total_tokens).toBe(880);
	});

	it('should return empty map when no agents exist', async () => {
		vi.mocked(readdir).mockResolvedValue([] as any);

		const usageMap = await getAllAgentUsage('all', '/test/project');

		expect(usageMap.size).toBe(0);
	});
});

// ============================================================================
// Tests: getSystemUsage
// ============================================================================

describe('getSystemUsage', () => {
	beforeEach(resetMocks);

	it('should aggregate total usage across all agents', async () => {
		// getSystemUsage calls getAllAgentUsage, which calls buildSessionAgentMap + getAgentUsage per agent
		// Same mocking pattern as getAllAgentUsage test
		vi.mocked(readdir)
			.mockResolvedValueOnce(['agent-session1.txt', 'agent-session2.txt'] as any) // Initial buildSessionAgentMap
			.mockResolvedValueOnce(['agent-session1.txt', 'agent-session2.txt'] as any) // AgentAlpha's getAgentUsage
			.mockResolvedValueOnce(['agent-session1.txt', 'agent-session2.txt'] as any); // AgentBeta's getAgentUsage

		vi.mocked(readFile)
			.mockResolvedValueOnce('AgentAlpha') // Initial: session1
			.mockResolvedValueOnce('AgentBeta') // Initial: session2
			.mockResolvedValueOnce('AgentAlpha') // AgentAlpha's buildSessionAgentMap: session1
			.mockResolvedValueOnce('AgentBeta') // AgentAlpha's buildSessionAgentMap: session2
			.mockResolvedValueOnce(MOCK_JSONL_VALID) // AgentAlpha's parseSessionUsage: session1.jsonl
			.mockResolvedValueOnce('AgentAlpha') // AgentBeta's buildSessionAgentMap: session1
			.mockResolvedValueOnce('AgentBeta') // AgentBeta's buildSessionAgentMap: session2
			.mockResolvedValueOnce(MOCK_JSONL_VALID); // AgentBeta's parseSessionUsage: session2.jsonl

		const totalUsage = await getSystemUsage('all', '/test/project');

		expect(totalUsage.input_tokens).toBe(500); // 250 * 2
		expect(totalUsage.total_tokens).toBe(1760); // 880 * 2
		expect(totalUsage.sessionCount).toBe(2);
		expect(totalUsage.cost).toBeGreaterThan(0);
	});

	it('should return zero usage when no agents exist', async () => {
		vi.mocked(readdir).mockResolvedValue([] as any);

		const totalUsage = await getSystemUsage('all', '/test/project');

		expect(totalUsage.input_tokens).toBe(0);
		expect(totalUsage.total_tokens).toBe(0);
		expect(totalUsage.sessionCount).toBe(0);
		expect(totalUsage.cost).toBe(0);
	});
});
