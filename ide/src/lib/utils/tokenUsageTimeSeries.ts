/**
 * Time-Series Token Usage Aggregation Utility
 *
 * Aggregates Claude Code token usage into time buckets for sparkline visualization.
 *
 * Features:
 * - System-wide 24-hour view (48 × 30-minute buckets)
 * - Per-agent session-based view (variable bucket size based on session duration)
 * - Filtering by agent, session, date range
 * - Performance optimized (<100ms for 24h aggregation)
 *
 * Usage:
 * ```typescript
 * // System-wide 24-hour view
 * const systemData = await getTokenTimeSeries({ range: '24h', bucketSize: '30min' });
 *
 * // Per-agent session view
 * const agentData = await getTokenTimeSeries({ agentName: 'MyAgent', bucketSize: 'session' });
 *
 * // Specific session
 * const sessionData = await getTokenTimeSeries({ sessionId: 'abc123' });
 * ```
 */

import { readdir, readFile } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { parseSessionUsage, buildSessionAgentMap, calculateCost } from './tokenUsage';
import type { TimeRange, SessionUsage, TokenUsage } from './tokenUsage';
import { getAllProjects, getProjectColor } from './projectConfig';
import type { ProjectConfig } from './projectConfig';

// ============================================================================
// Types
// ============================================================================

/**
 * Time bucket size options
 */
export type BucketSize = '30min' | 'hour' | 'session';

/**
 * Time-series data point
 */
export interface TimeSeriesDataPoint {
	/** Bucket timestamp (start of bucket) */
	timestamp: string;
	/** Total tokens in this bucket */
	tokens: number;
	/** Cost in USD for this bucket */
	cost: number;
	/** Token breakdown */
	breakdown?: {
		input: number;
		cache_creation: number;
		cache_read: number;
		output: number;
	};
}

/**
 * Options for time-series aggregation
 */
export interface TimeSeriesOptions {
	/** Time range filter */
	range?: '24h' | '7d' | 'all';
	/** Filter by agent name */
	agentName?: string;
	/** Filter by specific session ID */
	sessionId?: string;
	/** Bucket size for aggregation */
	bucketSize?: BucketSize;
	/** Project path (defaults to cwd) */
	projectPath?: string;
}

/**
 * Time-series aggregation result
 */
export interface TimeSeriesResult {
	/** Array of data points sorted by timestamp */
	data: TimeSeriesDataPoint[];
	/** Total tokens across all buckets */
	totalTokens: number;
	/** Total cost across all buckets */
	totalCost: number;
	/** Number of buckets */
	bucketCount: number;
	/** Bucket size used */
	bucketSize: BucketSize;
	/** Start timestamp of range */
	startTime: string;
	/** End timestamp of range */
	endTime: string;
}

/**
 * Per-project token data for a time bucket
 */
export interface ProjectTokenData {
	/** Project key (e.g., 'squad', 'chimaro') */
	project: string;
	/** Total tokens for this project in this bucket */
	tokens: number;
	/** Cost in USD for this project in this bucket */
	cost: number;
	/** Hex color for this project (from config) */
	color: string;
}

/**
 * Multi-project time-series data point
 */
export interface MultiProjectTimeSeriesPoint {
	/** Bucket timestamp (start of bucket) */
	timestamp: string;
	/** Total tokens across all projects in this bucket */
	totalTokens: number;
	/** Total cost across all projects in this bucket */
	totalCost: number;
	/** Per-project breakdown */
	projects: ProjectTokenData[];
}

/**
 * Options for multi-project time-series aggregation
 */
export interface MultiProjectTimeSeriesOptions {
	/** Time range filter */
	range?: '24h' | '7d' | 'all';
	/** Bucket size for aggregation */
	bucketSize?: BucketSize;
}

/**
 * Multi-project time-series result
 */
export interface MultiProjectTimeSeriesResult {
	/** Array of data points sorted by timestamp */
	data: MultiProjectTimeSeriesPoint[];
	/** Total tokens across all projects and buckets */
	totalTokens: number;
	/** Total cost across all projects and buckets */
	totalCost: number;
	/** Number of buckets */
	bucketCount: number;
	/** Bucket size used */
	bucketSize: BucketSize;
	/** Start timestamp of range */
	startTime: string;
	/** End timestamp of range */
	endTime: string;
	/** List of all projects found */
	projectKeys: string[];
	/** Map of project key to hex color */
	projectColors: Record<string, string>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get bucket duration in milliseconds
 */
function getBucketDurationMs(bucketSize: BucketSize): number {
	switch (bucketSize) {
		case '30min':
			return 30 * 60 * 1000;
		case 'hour':
			return 60 * 60 * 1000;
		case 'session':
			return 0; // Special case: variable bucket size
	}
}

/**
 * Round timestamp down to bucket start
 */
function roundToBucketStart(timestamp: Date, bucketSize: BucketSize): Date {
	if (bucketSize === 'session') {
		return timestamp; // Session-based: use exact timestamp
	}

	const ms = timestamp.getTime();
	const bucketMs = getBucketDurationMs(bucketSize);
	const roundedMs = Math.floor(ms / bucketMs) * bucketMs;
	return new Date(roundedMs);
}

/**
 * Generate bucket key for grouping
 */
function getBucketKey(timestamp: Date, bucketSize: BucketSize): string {
	if (bucketSize === 'session') {
		return timestamp.toISOString(); // Exact timestamp for session-based
	}

	const rounded = roundToBucketStart(timestamp, bucketSize);
	return rounded.toISOString();
}

/**
 * Calculate date range boundaries
 */
function getDateRange(range: TimeSeriesOptions['range']): { start: Date; end: Date } {
	const now = new Date();
	let start: Date;

	switch (range) {
		case '24h':
			start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
			break;
		case '7d':
			start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
			break;
		case 'all':
		default:
			// Start from a very early date (effectively no filtering)
			start = new Date(0);
			break;
	}

	return { start, end: now };
}

/**
 * Fill missing buckets with zero values
 */
function fillMissingBuckets(
	data: Map<string, TimeSeriesDataPoint>,
	bucketSize: BucketSize,
	startTime: Date,
	endTime: Date
): TimeSeriesDataPoint[] {
	if (bucketSize === 'session') {
		// Session-based: don't fill gaps, use actual data only
		return Array.from(data.values()).sort((a, b) =>
			new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
		);
	}

	const bucketMs = getBucketDurationMs(bucketSize);
	const filledData: TimeSeriesDataPoint[] = [];

	// Generate all bucket timestamps in range
	let currentBucketStart = roundToBucketStart(startTime, bucketSize);
	const endBucketStart = roundToBucketStart(endTime, bucketSize);

	while (currentBucketStart <= endBucketStart) {
		const key = getBucketKey(currentBucketStart, bucketSize);

		if (data.has(key)) {
			filledData.push(data.get(key)!);
		} else {
			// Fill missing bucket with zeros
			filledData.push({
				timestamp: currentBucketStart.toISOString(),
				tokens: 0,
				cost: 0,
				breakdown: {
					input: 0,
					cache_creation: 0,
					cache_read: 0,
					output: 0
				}
			});
		}

		// Move to next bucket
		currentBucketStart = new Date(currentBucketStart.getTime() + bucketMs);
	}

	return filledData;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Aggregate token usage into time-series data for sparkline visualization
 *
 * @param options - Aggregation options
 * @returns Time-series result with bucketed data
 */
export async function getTokenTimeSeries(
	options: TimeSeriesOptions = {}
): Promise<TimeSeriesResult> {
	const {
		range = '24h',
		agentName,
		sessionId,
		bucketSize = '30min',
		projectPath = process.cwd()
	} = options;

	const homeDir = os.homedir();
	// Strip /ide suffix if present (when running from IDE directory)
	const actualProjectPath = projectPath.replace(/\/ide$/, '');
	const projectSlug = actualProjectPath.replace(/\//g, '-');
	const projectsDir = path.join(homeDir, '.claude', 'projects', projectSlug);

	// Get date range boundaries
	const { start: startTime, end: endTime } = getDateRange(range);

	// Build session-agent map for filtering
	const sessionAgentMap = await buildSessionAgentMap(projectPath);

	// Get all session IDs to process
	let sessionIds: string[] = [];

	if (sessionId) {
		// Specific session
		sessionIds = [sessionId];
	} else {
		// Get all sessions
		try {
			const files = await readdir(projectsDir);
			sessionIds = files
				.filter((file) => file.endsWith('.jsonl'))
				.map((file) => file.replace('.jsonl', ''));
		} catch (error) {
			console.warn('Could not read projects directory:', error);
			return {
				data: [],
				totalTokens: 0,
				totalCost: 0,
				bucketCount: 0,
				bucketSize,
				startTime: startTime.toISOString(),
				endTime: endTime.toISOString()
			};
		}
	}

	// Filter sessions by agent if specified
	if (agentName) {
		sessionIds = sessionIds.filter((id) => sessionAgentMap.get(id) === agentName);
	}

	// Map to store aggregated data by bucket
	const buckets = new Map<string, TimeSeriesDataPoint>();

	// Process each session
	for (const sid of sessionIds) {
		const jsonlPath = path.join(projectsDir, `${sid}.jsonl`);

		try {
			const content = await readFile(jsonlPath, 'utf-8');
			const lines = content.split('\n').filter((line) => line.trim());

			// Parse each JSONL line
			for (const line of lines) {
				try {
					const entry = JSON.parse(line);

					// Skip entries without usage data or timestamp
					if (!entry.message?.usage || !entry.timestamp) {
						continue;
					}

					const timestamp = new Date(entry.timestamp);

					// Filter by date range
					if (timestamp < startTime || timestamp > endTime) {
						continue;
					}

					const usage = entry.message.usage;
					const inputTokens = usage.input_tokens || 0;
					const cacheCreation = usage.cache_creation_input_tokens || 0;
					const cacheRead = usage.cache_read_input_tokens || 0;
					const outputTokens = usage.output_tokens || 0;
					const totalTokens = inputTokens + cacheCreation + cacheRead + outputTokens;

					// Calculate cost for this entry
					const cost = calculateCost({
						input_tokens: inputTokens,
						cache_creation_input_tokens: cacheCreation,
						cache_read_input_tokens: cacheRead,
						output_tokens: outputTokens,
						total_tokens: totalTokens,
						cost: 0,
						sessionCount: 1
					});

					// Determine bucket
					const bucketKey = getBucketKey(timestamp, bucketSize);

					// Add to bucket (or create new bucket)
					if (buckets.has(bucketKey)) {
						const bucket = buckets.get(bucketKey)!;
						bucket.tokens += totalTokens;
						bucket.cost += cost;
						if (bucket.breakdown) {
							bucket.breakdown.input += inputTokens;
							bucket.breakdown.cache_creation += cacheCreation;
							bucket.breakdown.cache_read += cacheRead;
							bucket.breakdown.output += outputTokens;
						}
					} else {
						buckets.set(bucketKey, {
							timestamp: bucketKey,
							tokens: totalTokens,
							cost,
							breakdown: {
								input: inputTokens,
								cache_creation: cacheCreation,
								cache_read: cacheRead,
								output: outputTokens
							}
						});
					}
				} catch (parseError) {
					// Skip malformed JSON lines
					continue;
				}
			}
		} catch (error) {
			// Skip sessions that can't be read
			console.warn(`Could not read JSONL file for session ${sid}:`, error);
			continue;
		}
	}

	// Fill missing buckets and sort by timestamp
	const filledData = fillMissingBuckets(buckets, bucketSize, startTime, endTime);

	// Calculate totals
	const totalTokens = filledData.reduce((sum, point) => sum + point.tokens, 0);
	const totalCost = filledData.reduce((sum, point) => sum + point.cost, 0);

	return {
		data: filledData,
		totalTokens,
		totalCost,
		bucketCount: filledData.length,
		bucketSize,
		startTime: startTime.toISOString(),
		endTime: endTime.toISOString()
	};
}

/**
 * Get time-series data for system-wide 24-hour view
 *
 * Convenience function for the most common use case.
 *
 * @param projectPath - Project path (defaults to cwd)
 * @returns Time-series result with 48 × 30-minute buckets
 */
export async function getSystemTimeSeries(projectPath?: string): Promise<TimeSeriesResult> {
	return getTokenTimeSeries({
		range: '24h',
		bucketSize: '30min',
		projectPath
	});
}

/**
 * Get time-series data for per-agent session view
 *
 * Convenience function for agent-specific views.
 *
 * @param agentName - Agent name
 * @param projectPath - Project path (defaults to cwd)
 * @returns Time-series result with session-based buckets
 */
export async function getAgentTimeSeries(
	agentName: string,
	projectPath?: string
): Promise<TimeSeriesResult> {
	return getTokenTimeSeries({
		agentName,
		bucketSize: 'session',
		range: 'all',
		projectPath
	});
}

// ============================================================================
// Multi-Project Time Series
// ============================================================================

/**
 * Options for per-agent multi-project time-series aggregation
 */
export interface AgentMultiProjectTimeSeriesOptions {
	/** Agent name to filter by (required) */
	agentName: string;
	/** Time range filter */
	range?: '24h' | '7d' | 'all';
	/** Bucket size for aggregation */
	bucketSize?: BucketSize;
}

/**
 * Get time-series data for a specific agent across ALL projects
 *
 * Filters multi-project data to only include sessions belonging to the specified agent.
 * Useful for AgentCard sparklines showing per-agent multi-project activity.
 *
 * @param options - Aggregation options (agentName required)
 * @returns Multi-project time-series result filtered by agent
 *
 * @example
 * const data = await getAgentMultiProjectTimeSeries({
 *   agentName: 'WisePrairie',
 *   range: '24h',
 *   bucketSize: '30min'
 * });
 * // data.data[0].projects = [
 * //   { project: 'squad', tokens: 50000, cost: 0.15, color: '#5588ff' },
 * //   { project: 'chimaro', tokens: 30000, cost: 0.09, color: '#00d4aa' }
 * // ]
 * // Only includes sessions where this agent worked
 */
export async function getAgentMultiProjectTimeSeries(
	options: AgentMultiProjectTimeSeriesOptions
): Promise<MultiProjectTimeSeriesResult> {
	const { agentName, range = '24h', bucketSize = '30min' } = options;

	const homeDir = os.homedir();

	// Get all projects from config
	const projects = getAllProjects();
	const projectKeys = Array.from(projects.keys());

	// Build project colors map
	const projectColors: Record<string, string> = {};
	for (const [key, config] of projects) {
		projectColors[key] = config.activeColor;
	}

	// Get date range boundaries
	const { start: startTime, end: endTime } = getDateRange(range);

	// Map: bucketKey -> projectKey -> { tokens, cost }
	const bucketProjectData = new Map<string, Map<string, { tokens: number; cost: number }>>();

	// Track which projects this agent actually worked on
	const agentProjectKeys = new Set<string>();

	// Process each project
	for (const [projectKey, projectConfig] of projects) {
		const projectPath = projectConfig.path;
		const projectSlug = projectPath.replace(/\//g, '-');
		const projectsDir = path.join(homeDir, '.claude', 'projects', projectSlug);

		// Build session-agent map for this project
		const sessionAgentMap = await buildSessionAgentMap(projectPath);

		// Get all session files for this project
		let sessionIds: string[] = [];
		try {
			const files = await readdir(projectsDir);
			sessionIds = files
				.filter((file) => file.endsWith('.jsonl'))
				.map((file) => file.replace('.jsonl', ''));
		} catch {
			// Project directory doesn't exist or can't be read - skip
			continue;
		}

		// Filter sessions to only those belonging to this agent
		const agentSessions = sessionIds.filter((sid) => sessionAgentMap.get(sid) === agentName);

		// Skip this project if agent has no sessions here
		if (agentSessions.length === 0) {
			continue;
		}

		// Process each session belonging to this agent
		for (const sid of agentSessions) {
			const jsonlPath = path.join(projectsDir, `${sid}.jsonl`);

			try {
				const content = await readFile(jsonlPath, 'utf-8');
				const lines = content.split('\n').filter((line) => line.trim());

				// Parse each JSONL line
				for (const line of lines) {
					try {
						const entry = JSON.parse(line);

						// Skip entries without usage data or timestamp
						if (!entry.message?.usage || !entry.timestamp) {
							continue;
						}

						const timestamp = new Date(entry.timestamp);

						// Filter by date range
						if (timestamp < startTime || timestamp > endTime) {
							continue;
						}

						const usage = entry.message.usage;
						const inputTokens = usage.input_tokens || 0;
						const cacheCreation = usage.cache_creation_input_tokens || 0;
						const cacheRead = usage.cache_read_input_tokens || 0;
						const outputTokens = usage.output_tokens || 0;
						const totalTokens = inputTokens + cacheCreation + cacheRead + outputTokens;

						// Calculate cost for this entry
						const cost = calculateCost({
							input_tokens: inputTokens,
							cache_creation_input_tokens: cacheCreation,
							cache_read_input_tokens: cacheRead,
							output_tokens: outputTokens,
							total_tokens: totalTokens,
							cost: 0,
							sessionCount: 1
						});

						// Track that this agent worked on this project
						agentProjectKeys.add(projectKey);

						// Determine bucket
						const bucketKey = getBucketKey(timestamp, bucketSize);

						// Get or create bucket data
						if (!bucketProjectData.has(bucketKey)) {
							bucketProjectData.set(bucketKey, new Map());
						}
						const projectMap = bucketProjectData.get(bucketKey)!;

						// Add to project data in bucket
						if (projectMap.has(projectKey)) {
							const existing = projectMap.get(projectKey)!;
							existing.tokens += totalTokens;
							existing.cost += cost;
						} else {
							projectMap.set(projectKey, { tokens: totalTokens, cost });
						}
					} catch {
						// Skip malformed JSON lines
						continue;
					}
				}
			} catch {
				// Skip sessions that can't be read
				continue;
			}
		}
	}

	// Only include projects this agent actually worked on
	const filteredProjectKeys = Array.from(agentProjectKeys);

	// Convert to MultiProjectTimeSeriesPoint array with filled buckets
	const result: MultiProjectTimeSeriesPoint[] = [];

	if (bucketSize === 'session') {
		// Session-based: use actual data only, no gap filling
		const sortedKeys = Array.from(bucketProjectData.keys()).sort();
		for (const bucketKey of sortedKeys) {
			const projectMap = bucketProjectData.get(bucketKey)!;
			const projectsData: ProjectTokenData[] = [];
			let totalTokens = 0;
			let totalCost = 0;

			for (const [projectKey, data] of projectMap) {
				projectsData.push({
					project: projectKey,
					tokens: data.tokens,
					cost: data.cost,
					color: projectColors[projectKey] || '#888888'
				});
				totalTokens += data.tokens;
				totalCost += data.cost;
			}

			result.push({
				timestamp: bucketKey,
				totalTokens,
				totalCost,
				projects: projectsData
			});
		}
	} else {
		// Time-based: fill gaps with zero values
		const bucketMs = getBucketDurationMs(bucketSize);
		let currentBucketStart = roundToBucketStart(startTime, bucketSize);
		const endBucketStart = roundToBucketStart(endTime, bucketSize);

		while (currentBucketStart <= endBucketStart) {
			const key = getBucketKey(currentBucketStart, bucketSize);
			const projectMap = bucketProjectData.get(key);

			const projectsData: ProjectTokenData[] = [];
			let totalTokens = 0;
			let totalCost = 0;

			// Only include projects this agent worked on (not all projects)
			for (const projectKey of filteredProjectKeys) {
				const data = projectMap?.get(projectKey);
				const tokens = data?.tokens || 0;
				const cost = data?.cost || 0;

				projectsData.push({
					project: projectKey,
					tokens,
					cost,
					color: projectColors[projectKey] || '#888888'
				});
				totalTokens += tokens;
				totalCost += cost;
			}

			result.push({
				timestamp: currentBucketStart.toISOString(),
				totalTokens,
				totalCost,
				projects: projectsData
			});

			// Move to next bucket
			currentBucketStart = new Date(currentBucketStart.getTime() + bucketMs);
		}
	}

	// Calculate totals
	const grandTotalTokens = result.reduce((sum, point) => sum + point.totalTokens, 0);
	const grandTotalCost = result.reduce((sum, point) => sum + point.totalCost, 0);

	return {
		data: result,
		totalTokens: grandTotalTokens,
		totalCost: grandTotalCost,
		bucketCount: result.length,
		bucketSize,
		startTime: startTime.toISOString(),
		endTime: endTime.toISOString(),
		projectKeys: filteredProjectKeys,
		projectColors
	};
}

/**
 * Get time-series data aggregated across ALL projects from squad config
 *
 * Scans all project paths from ~/.config/squad/projects.json and aggregates
 * token usage into time buckets with per-project breakdown and colors.
 *
 * @param options - Aggregation options
 * @returns Multi-project time-series result with per-project breakdown
 *
 * @example
 * const data = await getMultiProjectTimeSeries({ range: '24h', bucketSize: '30min' });
 * // data.data[0].projects = [
 * //   { project: 'squad', tokens: 50000, cost: 0.15, color: '#5588ff' },
 * //   { project: 'chimaro', tokens: 30000, cost: 0.09, color: '#00d4aa' }
 * // ]
 */
export async function getMultiProjectTimeSeries(
	options: MultiProjectTimeSeriesOptions = {}
): Promise<MultiProjectTimeSeriesResult> {
	const { range = '24h', bucketSize = '30min' } = options;

	const homeDir = os.homedir();

	// Get all projects from config
	const projects = getAllProjects();
	const projectKeys = Array.from(projects.keys());

	// Build project colors map
	const projectColors: Record<string, string> = {};
	for (const [key, config] of projects) {
		projectColors[key] = config.activeColor;
	}

	// Get date range boundaries
	const { start: startTime, end: endTime } = getDateRange(range);

	// Map: bucketKey -> projectKey -> { tokens, cost }
	const bucketProjectData = new Map<string, Map<string, { tokens: number; cost: number }>>();

	// Process each project
	for (const [projectKey, projectConfig] of projects) {
		const projectPath = projectConfig.path;
		const projectSlug = projectPath.replace(/\//g, '-');
		const projectsDir = path.join(homeDir, '.claude', 'projects', projectSlug);

		// Get all session files for this project
		let sessionIds: string[] = [];
		try {
			const files = await readdir(projectsDir);
			sessionIds = files
				.filter((file) => file.endsWith('.jsonl'))
				.map((file) => file.replace('.jsonl', ''));
		} catch {
			// Project directory doesn't exist or can't be read - skip
			continue;
		}

		// Process each session
		for (const sid of sessionIds) {
			const jsonlPath = path.join(projectsDir, `${sid}.jsonl`);

			try {
				const content = await readFile(jsonlPath, 'utf-8');
				const lines = content.split('\n').filter((line) => line.trim());

				// Parse each JSONL line
				for (const line of lines) {
					try {
						const entry = JSON.parse(line);

						// Skip entries without usage data or timestamp
						if (!entry.message?.usage || !entry.timestamp) {
							continue;
						}

						const timestamp = new Date(entry.timestamp);

						// Filter by date range
						if (timestamp < startTime || timestamp > endTime) {
							continue;
						}

						const usage = entry.message.usage;
						const inputTokens = usage.input_tokens || 0;
						const cacheCreation = usage.cache_creation_input_tokens || 0;
						const cacheRead = usage.cache_read_input_tokens || 0;
						const outputTokens = usage.output_tokens || 0;
						const totalTokens = inputTokens + cacheCreation + cacheRead + outputTokens;

						// Calculate cost for this entry
						const cost = calculateCost({
							input_tokens: inputTokens,
							cache_creation_input_tokens: cacheCreation,
							cache_read_input_tokens: cacheRead,
							output_tokens: outputTokens,
							total_tokens: totalTokens,
							cost: 0,
							sessionCount: 1
						});

						// Determine bucket
						const bucketKey = getBucketKey(timestamp, bucketSize);

						// Get or create bucket data
						if (!bucketProjectData.has(bucketKey)) {
							bucketProjectData.set(bucketKey, new Map());
						}
						const projectMap = bucketProjectData.get(bucketKey)!;

						// Add to project data in bucket
						if (projectMap.has(projectKey)) {
							const existing = projectMap.get(projectKey)!;
							existing.tokens += totalTokens;
							existing.cost += cost;
						} else {
							projectMap.set(projectKey, { tokens: totalTokens, cost });
						}
					} catch {
						// Skip malformed JSON lines
						continue;
					}
				}
			} catch {
				// Skip sessions that can't be read
				continue;
			}
		}
	}

	// Convert to MultiProjectTimeSeriesPoint array with filled buckets
	const result: MultiProjectTimeSeriesPoint[] = [];

	if (bucketSize === 'session') {
		// Session-based: use actual data only, no gap filling
		const sortedKeys = Array.from(bucketProjectData.keys()).sort();
		for (const bucketKey of sortedKeys) {
			const projectMap = bucketProjectData.get(bucketKey)!;
			const projectsData: ProjectTokenData[] = [];
			let totalTokens = 0;
			let totalCost = 0;

			for (const [projectKey, data] of projectMap) {
				projectsData.push({
					project: projectKey,
					tokens: data.tokens,
					cost: data.cost,
					color: projectColors[projectKey] || '#888888'
				});
				totalTokens += data.tokens;
				totalCost += data.cost;
			}

			result.push({
				timestamp: bucketKey,
				totalTokens,
				totalCost,
				projects: projectsData
			});
		}
	} else {
		// Time-based: fill gaps with zero values
		const bucketMs = getBucketDurationMs(bucketSize);
		let currentBucketStart = roundToBucketStart(startTime, bucketSize);
		const endBucketStart = roundToBucketStart(endTime, bucketSize);

		while (currentBucketStart <= endBucketStart) {
			const key = getBucketKey(currentBucketStart, bucketSize);
			const projectMap = bucketProjectData.get(key);

			const projectsData: ProjectTokenData[] = [];
			let totalTokens = 0;
			let totalCost = 0;

			// Include all projects (even with zero tokens for consistency)
			for (const projectKey of projectKeys) {
				const data = projectMap?.get(projectKey);
				const tokens = data?.tokens || 0;
				const cost = data?.cost || 0;

				projectsData.push({
					project: projectKey,
					tokens,
					cost,
					color: projectColors[projectKey] || '#888888'
				});
				totalTokens += tokens;
				totalCost += cost;
			}

			result.push({
				timestamp: currentBucketStart.toISOString(),
				totalTokens,
				totalCost,
				projects: projectsData
			});

			// Move to next bucket
			currentBucketStart = new Date(currentBucketStart.getTime() + bucketMs);
		}
	}

	// Calculate totals
	const grandTotalTokens = result.reduce((sum, point) => sum + point.totalTokens, 0);
	const grandTotalCost = result.reduce((sum, point) => sum + point.totalCost, 0);

	return {
		data: result,
		totalTokens: grandTotalTokens,
		totalCost: grandTotalCost,
		bucketCount: result.length,
		bucketSize,
		startTime: startTime.toISOString(),
		endTime: endTime.toISOString(),
		projectKeys,
		projectColors
	};
}

// ============================================================================
// Worker Thread-Based Functions (Non-Blocking)
// ============================================================================

/**
 * Get multi-project time series using worker threads (non-blocking)
 *
 * This is the preferred method for the sparkline API as it doesn't block
 * the main event loop during JSONL parsing. The heavy parsing work is
 * offloaded to worker threads.
 *
 * @param options - Aggregation options
 * @returns Multi-project time-series result with per-project breakdown
 */
export async function getMultiProjectTimeSeriesAsync(
	options: MultiProjectTimeSeriesOptions = {}
): Promise<MultiProjectTimeSeriesResult> {
	const { range = '24h', bucketSize = '30min' } = options;

	try {
		// Dynamically import worker pool to avoid issues in non-server contexts
		const { parseAllProjectsAsync } = await import('$lib/server/workers');

		// Get all projects from config
		const projects = getAllProjects();
		const projectKeys = Array.from(projects.keys());

		// Build project colors map
		const projectColors: Record<string, string> = {};
		for (const [key, config] of projects) {
			projectColors[key] = config.activeColor;
		}

		// Prepare project paths for worker
		const projectPaths = Array.from(projects.entries()).map(([key, config]) => ({
			key,
			path: config.path,
			color: config.activeColor
		}));

		// Calculate bucket size in milliseconds
		const bucketSizeMs = bucketSize === '30min' ? 30 * 60 * 1000 :
		                     bucketSize === 'hour' ? 60 * 60 * 1000 :
		                     0; // session mode

		// Offload heavy parsing to worker thread
		const workerResult = await parseAllProjectsAsync(projectPaths, range, bucketSizeMs);

		// Get date range boundaries
		const { start: startTime, end: endTime } = getDateRange(range);

		// Convert worker result to MultiProjectTimeSeriesPoint array
		const result: MultiProjectTimeSeriesPoint[] = [];

		if (bucketSize === 'session') {
			// Session-based: use actual data only
			const sortedKeys = Object.keys(workerResult.buckets).sort();
			for (const bucketKey of sortedKeys) {
				const projectMap = workerResult.buckets[bucketKey];
				const projectsData: ProjectTokenData[] = [];
				let totalTokens = 0;
				let totalCost = 0;

				for (const [projectKey, data] of Object.entries(projectMap)) {
					projectsData.push({
						project: projectKey,
						tokens: data.tokens,
						cost: data.cost,
						color: projectColors[projectKey] || '#888888'
					});
					totalTokens += data.tokens;
					totalCost += data.cost;
				}

				result.push({
					timestamp: bucketKey,
					totalTokens,
					totalCost,
					projects: projectsData
				});
			}
		} else {
			// Time-based: fill gaps with zero values
			let currentBucketStart = roundToBucketStart(startTime, bucketSize);
			const endBucketStart = roundToBucketStart(endTime, bucketSize);

			while (currentBucketStart <= endBucketStart) {
				const key = getBucketKey(currentBucketStart, bucketSize);
				const projectMap = workerResult.buckets[key];

				const projectsData: ProjectTokenData[] = [];
				let totalTokens = 0;
				let totalCost = 0;

				for (const projectKey of projectKeys) {
					const data = projectMap?.[projectKey];
					const tokens = data?.tokens || 0;
					const cost = data?.cost || 0;

					projectsData.push({
						project: projectKey,
						tokens,
						cost,
						color: projectColors[projectKey] || '#888888'
					});
					totalTokens += tokens;
					totalCost += cost;
				}

				result.push({
					timestamp: currentBucketStart.toISOString(),
					totalTokens,
					totalCost,
					projects: projectsData
				});

				currentBucketStart = new Date(currentBucketStart.getTime() + getBucketDurationMs(bucketSize));
			}
		}

		// Calculate totals
		const grandTotalTokens = result.reduce((sum, point) => sum + point.totalTokens, 0);
		const grandTotalCost = result.reduce((sum, point) => sum + point.totalCost, 0);

		return {
			data: result,
			totalTokens: grandTotalTokens,
			totalCost: grandTotalCost,
			bucketCount: result.length,
			bucketSize,
			startTime: startTime.toISOString(),
			endTime: endTime.toISOString(),
			projectKeys: workerResult.projectKeys.length > 0 ? workerResult.projectKeys : projectKeys,
			projectColors
		};
	} catch (error) {
		console.warn('[tokenUsageTimeSeries] Worker thread failed, falling back to sync:', error);
		// Fall back to synchronous version
		return getMultiProjectTimeSeries(options);
	}
}
