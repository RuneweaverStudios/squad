/**
 * Time-Series Token Usage Aggregation Tests
 *
 * Tests for tokenUsageTimeSeries.ts module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	getTokenTimeSeries,
	getSystemTimeSeries,
	getAgentTimeSeries,
	type TimeSeriesOptions,
	type TimeSeriesResult
} from './tokenUsageTimeSeries';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('fs/promises', () => ({
	readdir: vi.fn(),
	readFile: vi.fn()
}));

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

// Helper to create JSONL entry with usage
function createJSONLEntry(timestamp: string, tokens: {
	input?: number;
	cache_creation?: number;
	cache_read?: number;
	output?: number;
}): string {
	return JSON.stringify({
		type: 'request',
		message: {
			usage: {
				input_tokens: tokens.input || 0,
				cache_creation_input_tokens: tokens.cache_creation || 0,
				cache_read_input_tokens: tokens.cache_read || 0,
				output_tokens: tokens.output || 0
			}
		},
		timestamp
	});
}

// Create JSONL with entries at specific times
function createMockJSONL(entries: Array<{ timestamp: string; tokens: any }>): string {
	return entries.map(e => createJSONLEntry(e.timestamp, e.tokens)).join('\n');
}

// Get timestamp N minutes ago
function minutesAgo(minutes: number): Date {
	return new Date(Date.now() - minutes * 60 * 1000);
}

// Get timestamp N hours ago
function hoursAgo(hours: number): Date {
	return new Date(Date.now() - hours * 60 * 60 * 1000);
}

// ============================================================================
// Helper Functions
// ============================================================================

function resetMocks() {
	vi.clearAllMocks();
}

// ============================================================================
// Tests: Time Bucket Aggregation (30-min buckets)
// ============================================================================

describe('getTokenTimeSeries - 30-minute buckets', () => {
	beforeEach(resetMocks);

	it('should aggregate tokens into 30-minute buckets', async () => {
		// Create entries at different times within same 30-min bucket
		const now = new Date();
		const entries = [
			{ timestamp: new Date(now.getTime() - 5 * 60 * 1000).toISOString(), tokens: { input: 100, output: 50 } }, // 5 min ago
			{ timestamp: new Date(now.getTime() - 15 * 60 * 1000).toISOString(), tokens: { input: 200, output: 100 } }, // 15 min ago
			{ timestamp: new Date(now.getTime() - 25 * 60 * 1000).toISOString(), tokens: { input: 300, output: 150 } } // 25 min ago
		];

		vi.mocked(readdir).mockResolvedValue(['session1.jsonl'] as any);
		vi.mocked(readFile)
			.mockResolvedValueOnce('' as any) // buildSessionAgentMap (empty)
			.mockResolvedValueOnce(createMockJSONL(entries)); // session1.jsonl

		const result = await getTokenTimeSeries({ range: '24h', bucketSize: '30min', projectPath: '/test' });

		// All three entries should be in the same 30-min bucket
		const nonZeroBuckets = result.data.filter(d => d.tokens > 0);
		expect(nonZeroBuckets.length).toBeGreaterThan(0);

		// Check first non-zero bucket has aggregated all tokens
		const firstBucket = nonZeroBuckets[0];
		expect(firstBucket.tokens).toBe(900); // 150 + 300 + 450 (input + output for each)
	});

	it('should create separate buckets for entries 30+ minutes apart', async () => {
		const now = new Date();
		const entries = [
			{ timestamp: new Date(now.getTime() - 5 * 60 * 1000).toISOString(), tokens: { input: 100 } }, // 5 min ago (bucket 1)
			{ timestamp: new Date(now.getTime() - 35 * 60 * 1000).toISOString(), tokens: { input: 200 } }, // 35 min ago (bucket 2)
			{ timestamp: new Date(now.getTime() - 65 * 60 * 1000).toISOString(), tokens: { input: 300 } } // 65 min ago (bucket 3)
		];

		vi.mocked(readdir).mockResolvedValue(['session1.jsonl'] as any);
		vi.mocked(readFile)
			.mockResolvedValueOnce('' as any) // buildSessionAgentMap
			.mockResolvedValueOnce(createMockJSONL(entries)); // session1.jsonl

		const result = await getTokenTimeSeries({ range: '24h', bucketSize: '30min', projectPath: '/test' });

		const nonZeroBuckets = result.data.filter(d => d.tokens > 0);
		expect(nonZeroBuckets.length).toBe(3); // 3 separate buckets
	});

	it('should fill missing buckets with zeros for 24h range', async () => {
		const now = new Date();
		const entries = [
			{ timestamp: now.toISOString(), tokens: { input: 100 } }
		];

		vi.mocked(readdir).mockResolvedValue(['session1.jsonl'] as any);
		vi.mocked(readFile)
			.mockResolvedValueOnce('' as any)
			.mockResolvedValueOnce(createMockJSONL(entries));

		const result = await getTokenTimeSeries({ range: '24h', bucketSize: '30min', projectPath: '/test' });

		// 24 hours = 48 × 30-minute buckets
		expect(result.bucketCount).toBe(48);

		// Most buckets should be zero
		const zeroBuckets = result.data.filter(d => d.tokens === 0);
		expect(zeroBuckets.length).toBe(47); // All except the one with data
	});
});

// ============================================================================
// Tests: Session-Based Aggregation
// ============================================================================

describe('getTokenTimeSeries - session-based buckets', () => {
	beforeEach(resetMocks);

	it('should use exact timestamps for session-based buckets', async () => {
		const entries = [
			{ timestamp: '2025-11-21T10:00:00Z', tokens: { input: 100 } },
			{ timestamp: '2025-11-21T10:05:00Z', tokens: { input: 200 } },
			{ timestamp: '2025-11-21T10:10:00Z', tokens: { input: 300 } }
		];

		vi.mocked(readdir).mockResolvedValue(['session1.jsonl'] as any);
		vi.mocked(readFile)
			.mockResolvedValueOnce('' as any)
			.mockResolvedValueOnce(createMockJSONL(entries));

		const result = await getTokenTimeSeries({ bucketSize: 'session', range: 'all', projectPath: '/test' });

		// Should have 3 buckets (one per entry, no aggregation)
		expect(result.data.length).toBe(3);
		expect(result.data[0].timestamp).toBe('2025-11-21T10:00:00.000Z');
		expect(result.data[0].tokens).toBe(100);
		expect(result.data[1].timestamp).toBe('2025-11-21T10:05:00.000Z');
		expect(result.data[1].tokens).toBe(200);
		expect(result.data[2].timestamp).toBe('2025-11-21T10:10:00.000Z');
		expect(result.data[2].tokens).toBe(300);
	});

	it('should not fill missing buckets for session-based aggregation', async () => {
		const entries = [
			{ timestamp: '2025-11-21T10:00:00Z', tokens: { input: 100 } },
			{ timestamp: '2025-11-21T12:00:00Z', tokens: { input: 200 } } // 2 hours later
		];

		vi.mocked(readdir).mockResolvedValue(['session1.jsonl'] as any);
		vi.mocked(readFile)
			.mockResolvedValueOnce('' as any)
			.mockResolvedValueOnce(createMockJSONL(entries));

		const result = await getTokenTimeSeries({ bucketSize: 'session', range: 'all', projectPath: '/test' });

		// Should only have 2 buckets (no zero-filling between them)
		expect(result.data.length).toBe(2);
	});
});

// ============================================================================
// Tests: Filtering
// ============================================================================

describe('getTokenTimeSeries - filtering', () => {
	beforeEach(resetMocks);

	it('should filter by agent name', async () => {
		vi.mocked(readdir)
			.mockResolvedValueOnce(['agent-session1.txt', 'agent-session2.txt'] as any) // buildSessionAgentMap
			.mockResolvedValueOnce(['session1.jsonl', 'session2.jsonl'] as any); // getAllSessionIds

		vi.mocked(readFile)
			.mockResolvedValueOnce('AgentAlpha') // session1 agent
			.mockResolvedValueOnce('AgentBeta') // session2 agent
			.mockResolvedValueOnce(createMockJSONL([
				{ timestamp: new Date().toISOString(), tokens: { input: 100 } }
			])) // session1.jsonl
			.mockResolvedValueOnce(createMockJSONL([
				{ timestamp: new Date().toISOString(), tokens: { input: 200 } }
			])); // session2.jsonl (should be filtered out)

		const result = await getTokenTimeSeries({
			agentName: 'AgentAlpha',
			bucketSize: 'session',
			range: 'all',
			projectPath: '/test'
		});

		// Should only include tokens from AgentAlpha (session1)
		expect(result.totalTokens).toBe(100);
	});

	it('should filter by date range (24h)', async () => {
		const now = new Date();
		const entries = [
			{ timestamp: now.toISOString(), tokens: { input: 100 } }, // Today (included)
			{ timestamp: hoursAgo(25).toISOString(), tokens: { input: 200 } }, // 25 hours ago (excluded)
			{ timestamp: hoursAgo(48).toISOString(), tokens: { input: 300 } } // 48 hours ago (excluded)
		];

		vi.mocked(readdir).mockResolvedValue(['session1.jsonl'] as any);
		vi.mocked(readFile)
			.mockResolvedValueOnce('' as any)
			.mockResolvedValueOnce(createMockJSONL(entries));

		const result = await getTokenTimeSeries({ range: '24h', bucketSize: 'session', projectPath: '/test' });

		// Should only include the entry from last 24 hours
		expect(result.totalTokens).toBe(100);
	});

	it('should filter by specific session ID', async () => {
		vi.mocked(readdir).mockResolvedValue(['session1.jsonl', 'session2.jsonl'] as any);
		vi.mocked(readFile)
			.mockResolvedValueOnce('' as any) // buildSessionAgentMap
			.mockResolvedValueOnce(createMockJSONL([
				{ timestamp: new Date().toISOString(), tokens: { input: 100 } }
			])); // session1.jsonl only

		const result = await getTokenTimeSeries({
			sessionId: 'session1',
			bucketSize: 'session',
			range: 'all',
			projectPath: '/test'
		});

		// Should only process session1
		expect(result.totalTokens).toBe(100);
		expect(readFile).toHaveBeenCalledTimes(2); // buildSessionAgentMap + session1.jsonl (not session2)
	});
});

// ============================================================================
// Tests: Edge Cases
// ============================================================================

describe('getTokenTimeSeries - edge cases', () => {
	beforeEach(resetMocks);

	it('should handle empty JSONL files', async () => {
		vi.mocked(readdir).mockResolvedValue(['session1.jsonl'] as any);
		vi.mocked(readFile)
			.mockResolvedValueOnce('' as any)
			.mockResolvedValueOnce(''); // Empty JSONL

		const result = await getTokenTimeSeries({ range: '24h', bucketSize: '30min', projectPath: '/test' });

		expect(result.totalTokens).toBe(0);
		expect(result.bucketCount).toBe(48); // Still creates 48 buckets, all zeros
	});

	it('should handle missing timestamps', async () => {
		const entriesWithMissingTimestamp = [
			createJSONLEntry('2025-11-21T10:00:00Z', { input: 100 }),
			JSON.stringify({ type: 'request', message: { usage: { input_tokens: 200 } } }), // No timestamp
			createJSONLEntry('2025-11-21T11:00:00Z', { input: 300 })
		].join('\n');

		vi.mocked(readdir).mockResolvedValue(['session1.jsonl'] as any);
		vi.mocked(readFile)
			.mockResolvedValueOnce('' as any)
			.mockResolvedValueOnce(entriesWithMissingTimestamp);

		const result = await getTokenTimeSeries({ bucketSize: 'session', range: 'all', projectPath: '/test' });

		// Should skip entry without timestamp, include the other two
		expect(result.data.length).toBe(2);
		expect(result.totalTokens).toBe(400); // 100 + 300 (skipped 200)
	});

	it('should handle malformed JSON lines gracefully', async () => {
		const malformedJSONL = [
			createJSONLEntry('2025-11-21T10:00:00Z', { input: 100 }),
			'{this is not valid JSON}',
			createJSONLEntry('2025-11-21T11:00:00Z', { input: 300 })
		].join('\n');

		vi.mocked(readdir).mockResolvedValue(['session1.jsonl'] as any);
		vi.mocked(readFile)
			.mockResolvedValueOnce('' as any)
			.mockResolvedValueOnce(malformedJSONL);

		const result = await getTokenTimeSeries({ bucketSize: 'session', range: 'all', projectPath: '/test' });

		// Should skip malformed line, include the other two
		expect(result.data.length).toBe(2);
		expect(result.totalTokens).toBe(400); // 100 + 300
	});

	it('should handle missing usage data in entries', async () => {
		const entriesWithoutUsage = [
			createJSONLEntry('2025-11-21T10:00:00Z', { input: 100 }),
			JSON.stringify({ type: 'response', timestamp: '2025-11-21T10:30:00Z' }), // No message.usage
			createJSONLEntry('2025-11-21T11:00:00Z', { input: 300 })
		].join('\n');

		vi.mocked(readdir).mockResolvedValue(['session1.jsonl'] as any);
		vi.mocked(readFile)
			.mockResolvedValueOnce('' as any)
			.mockResolvedValueOnce(entriesWithoutUsage);

		const result = await getTokenTimeSeries({ bucketSize: 'session', range: 'all', projectPath: '/test' });

		// Should skip entry without usage, include the other two
		expect(result.data.length).toBe(2);
		expect(result.totalTokens).toBe(400);
	});

	it('should handle file read errors gracefully', async () => {
		vi.mocked(readdir).mockResolvedValue(['session1.jsonl', 'session2.jsonl'] as any);
		vi.mocked(readFile)
			.mockResolvedValueOnce('' as any) // buildSessionAgentMap
			.mockResolvedValueOnce(createMockJSONL([{ timestamp: new Date().toISOString(), tokens: { input: 100 } }])) // session1 succeeds
			.mockRejectedValueOnce(new Error('Permission denied')); // session2 fails

		const result = await getTokenTimeSeries({ bucketSize: 'session', range: 'all', projectPath: '/test' });

		// Should include data from session1, skip session2
		expect(result.totalTokens).toBe(100);
	});

	it('should return empty result when projects directory does not exist', async () => {
		vi.mocked(readdir).mockRejectedValue(new Error('Directory not found'));

		const result = await getTokenTimeSeries({ range: '24h', bucketSize: '30min', projectPath: '/test' });

		expect(result.data).toEqual([]);
		expect(result.totalTokens).toBe(0);
		expect(result.bucketCount).toBe(0);
	});
});

// ============================================================================
// Tests: Cost Calculation
// ============================================================================

describe('getTokenTimeSeries - cost calculation', () => {
	beforeEach(resetMocks);

	it('should calculate cost correctly per bucket', async () => {
		const entries = [
			{
				timestamp: '2025-11-21T10:00:00Z',
				tokens: {
					input: 1_000_000,
					cache_creation: 500_000,
					cache_read: 2_000_000,
					output: 500_000
				}
			}
		];

		vi.mocked(readdir).mockResolvedValue(['session1.jsonl'] as any);
		vi.mocked(readFile)
			.mockResolvedValueOnce('' as any)
			.mockResolvedValueOnce(createMockJSONL(entries));

		const result = await getTokenTimeSeries({ bucketSize: 'session', range: 'all', projectPath: '/test' });

		// Expected cost: (1M * $3) + (0.5M * $3.75) + (2M * $0.30) + (0.5M * $15)
		// = $3 + $1.875 + $0.60 + $7.50 = $12.975
		expect(result.data[0].cost).toBeCloseTo(12.975, 3);
		expect(result.totalCost).toBeCloseTo(12.975, 3);
	});

	it('should sum costs across multiple buckets', async () => {
		const entries = [
			{ timestamp: '2025-11-21T10:00:00Z', tokens: { input: 100_000, output: 50_000 } },
			{ timestamp: '2025-11-21T11:00:00Z', tokens: { input: 200_000, output: 100_000 } }
		];

		vi.mocked(readdir).mockResolvedValue(['session1.jsonl'] as any);
		vi.mocked(readFile)
			.mockResolvedValueOnce('' as any)
			.mockResolvedValueOnce(createMockJSONL(entries));

		const result = await getTokenTimeSeries({ bucketSize: 'session', range: 'all', projectPath: '/test' });

		// Total cost should be sum of both buckets
		const expectedCost1 = (100_000 / 1_000_000) * 3 + (50_000 / 1_000_000) * 15; // $1.05
		const expectedCost2 = (200_000 / 1_000_000) * 3 + (100_000 / 1_000_000) * 15; // $2.10
		expect(result.totalCost).toBeCloseTo(expectedCost1 + expectedCost2, 3);
	});
});

// ============================================================================
// Tests: Convenience Functions
// ============================================================================

describe('Convenience functions', () => {
	beforeEach(resetMocks);

	it('getSystemTimeSeries should use 24h range and 30min buckets', async () => {
		vi.mocked(readdir).mockResolvedValue([] as any);
		vi.mocked(readFile).mockResolvedValue('' as any);

		const result = await getSystemTimeSeries('/test');

		expect(result.bucketSize).toBe('30min');
		expect(result.bucketCount).toBe(48); // 24 hours / 30 min
	});

	it('getAgentTimeSeries should use session buckets and all range', async () => {
		vi.mocked(readdir)
			.mockResolvedValueOnce(['agent-session1.txt'] as any) // buildSessionAgentMap
			.mockResolvedValueOnce(['session1.jsonl'] as any); // getAllSessionIds

		vi.mocked(readFile)
			.mockResolvedValueOnce('TestAgent') // session1 agent
			.mockResolvedValueOnce(createMockJSONL([
				{ timestamp: '2025-11-21T10:00:00Z', tokens: { input: 100 } }
			])); // session1.jsonl

		const result = await getAgentTimeSeries('TestAgent', '/test');

		expect(result.bucketSize).toBe('session');
		// Should include data from all time (not filtered by 24h)
		expect(result.totalTokens).toBe(100);
	});
});

// ============================================================================
// Tests: Token Breakdown
// ============================================================================

describe('getTokenTimeSeries - token breakdown', () => {
	beforeEach(resetMocks);

	it('should include token breakdown in data points', async () => {
		const entries = [
			{
				timestamp: '2025-11-21T10:00:00Z',
				tokens: {
					input: 100,
					cache_creation: 50,
					cache_read: 25,
					output: 200
				}
			}
		];

		vi.mocked(readdir).mockResolvedValue(['session1.jsonl'] as any);
		vi.mocked(readFile)
			.mockResolvedValueOnce('' as any)
			.mockResolvedValueOnce(createMockJSONL(entries));

		const result = await getTokenTimeSeries({ bucketSize: 'session', range: 'all', projectPath: '/test' });

		expect(result.data[0].breakdown).toEqual({
			input: 100,
			cache_creation: 50,
			cache_read: 25,
			output: 200
		});
		expect(result.data[0].tokens).toBe(375); // Sum of breakdown
	});

	it('should aggregate breakdown across entries in same bucket', async () => {
		const now = new Date();
		const entries = [
			{ timestamp: new Date(now.getTime() - 5 * 60 * 1000).toISOString(), tokens: { input: 100, output: 50 } },
			{ timestamp: new Date(now.getTime() - 15 * 60 * 1000).toISOString(), tokens: { input: 200, cache_read: 100 } }
		];

		vi.mocked(readdir).mockResolvedValue(['session1.jsonl'] as any);
		vi.mocked(readFile)
			.mockResolvedValueOnce('' as any)
			.mockResolvedValueOnce(createMockJSONL(entries));

		const result = await getTokenTimeSeries({ range: '24h', bucketSize: '30min', projectPath: '/test' });

		const nonZeroBucket = result.data.find(d => d.tokens > 0);
		expect(nonZeroBucket?.breakdown).toEqual({
			input: 300, // 100 + 200
			cache_creation: 0,
			cache_read: 100,
			output: 50
		});
	});
});
