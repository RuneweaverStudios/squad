/**
 * SQLite-Based Sparkline API Endpoint
 *
 * GET /api/usage/sparkline
 *
 * Returns time-series token usage data for sparkline visualization.
 * Data is pre-aggregated in SQLite for fast queries (<100ms vs 109s).
 *
 * Query Parameters:
 * - range: Time range (24h | 7d | all) - defaults to 24h
 * - agent: Agent name filter (optional)
 * - project: Project name filter (optional)
 * - bucketSize: Time bucket size (30min | hour) - defaults to hour (SQLite granularity)
 * - multiProject: Return multi-project data with per-project breakdown (optional, boolean)
 *
 * Response Format (single project / default):
 * {
 *   data: [{ timestamp, tokens, cost }, ...],
 *   totalTokens: number,
 *   totalCost: number,
 *   bucketCount: number,
 *   bucketSize: string,
 *   startTime: string,
 *   endTime: string,
 *   source: 'sqlite'
 * }
 *
 * Response Format (multiProject=true):
 * {
 *   data: [{ timestamp, totalTokens, totalCost, projects: [{ project, tokens, cost, color }] }, ...],
 *   totalTokens: number,
 *   totalCost: number,
 *   bucketCount: number,
 *   bucketSize: string,
 *   startTime: string,
 *   endTime: string,
 *   projectKeys: string[],
 *   projectColors: Record<string, string>,
 *   source: 'sqlite'
 * }
 */

import { json } from '@sveltejs/kit';
import {
	getHourlyBreakdown,
	getUsageByProject,
	getUsageForRange
} from '$lib/server/tokenUsageDb';
import { getAllProjects } from '$lib/utils/projectConfig';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get date range from range parameter
 */
function getDateRange(range: string): { start: Date; end: Date } {
	const now = new Date();

	switch (range) {
		case '24h':
			return {
				start: new Date(now.getTime() - 24 * 60 * 60 * 1000),
				end: now
			};
		case '7d':
			return {
				start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
				end: now
			};
		case 'all':
		default:
			return {
				start: new Date(0),
				end: now
			};
	}
}

/**
 * Fill missing hourly buckets with zeros
 */
function fillMissingBuckets(
	data: Array<{ timestamp: string; total_tokens: number; cost_usd: number }>,
	startTime: Date,
	endTime: Date
): Array<{ timestamp: string; tokens: number; cost: number }> {
	// Create a map of existing data
	const dataMap = new Map<string, { tokens: number; cost: number }>();
	for (const point of data) {
		dataMap.set(point.timestamp, {
			tokens: point.total_tokens,
			cost: point.cost_usd
		});
	}

	// Generate all hour buckets
	const result: Array<{ timestamp: string; tokens: number; cost: number }> = [];
	const bucketMs = 60 * 60 * 1000; // 1 hour

	// Round start to hour
	const startHour = new Date(startTime);
	startHour.setMinutes(0, 0, 0);

	let currentBucket = startHour;
	while (currentBucket <= endTime) {
		const key = currentBucket.toISOString();
		const existing = dataMap.get(key);

		result.push({
			timestamp: key,
			tokens: existing?.tokens ?? 0,
			cost: existing?.cost ?? 0
		});

		currentBucket = new Date(currentBucket.getTime() + bucketMs);
	}

	return result;
}

// ============================================================================
// API Handler
// ============================================================================

export async function GET({ url }) {
	try {
		const range = url.searchParams.get('range') || '24h';
		const agentName = url.searchParams.get('agent') || undefined;
		const project = url.searchParams.get('project') || undefined;
		const multiProject = url.searchParams.get('multiProject') === 'true';

		// Validate range
		if (!['24h', '7d', 'all'].includes(range)) {
			return json(
				{
					error: 'Invalid range parameter',
					message: 'Range must be: 24h, 7d, or all',
					validValues: ['24h', '7d', 'all']
				},
				{ status: 400 }
			);
		}

		const { start, end } = getDateRange(range);
		const startTime = Date.now();

		if (multiProject) {
			// Multi-project mode: get per-project breakdown
			const rawData = getUsageByProject(start, end);

			// Get project colors from config
			const projects = getAllProjects();
			const projectColors: Record<string, string> = {};
			for (const [key, config] of projects) {
				projectColors[key] = config.activeColor;
			}

			// Group by timestamp
			const bucketMap = new Map<string, Map<string, { tokens: number; cost: number }>>();
			const allProjects = new Set<string>();

			for (const row of rawData) {
				allProjects.add(row.project);

				if (!bucketMap.has(row.timestamp)) {
					bucketMap.set(row.timestamp, new Map());
				}
				bucketMap.get(row.timestamp)!.set(row.project, {
					tokens: row.total_tokens,
					cost: row.cost_usd
				});
			}

			// Fill missing buckets and convert to response format
			const bucketMs = 60 * 60 * 1000;
			const startHour = new Date(start);
			startHour.setMinutes(0, 0, 0);

			const data: Array<{
				timestamp: string;
				totalTokens: number;
				totalCost: number;
				projects: Array<{ project: string; tokens: number; cost: number; color: string }>;
			}> = [];

			let currentBucket = startHour;
			while (currentBucket <= end) {
				const key = currentBucket.toISOString();
				const projectMap = bucketMap.get(key);

				const projectsData: Array<{ project: string; tokens: number; cost: number; color: string }> = [];
				let totalTokens = 0;
				let totalCost = 0;

				for (const projectKey of allProjects) {
					const projectData = projectMap?.get(projectKey);
					const tokens = projectData?.tokens ?? 0;
					const cost = projectData?.cost ?? 0;

					projectsData.push({
						project: projectKey,
						tokens,
						cost,
						color: projectColors[projectKey] || '#888888'
					});
					totalTokens += tokens;
					totalCost += cost;
				}

				data.push({
					timestamp: key,
					totalTokens,
					totalCost,
					projects: projectsData
				});

				currentBucket = new Date(currentBucket.getTime() + bucketMs);
			}

			const grandTotalTokens = data.reduce((sum, p) => sum + p.totalTokens, 0);
			const grandTotalCost = data.reduce((sum, p) => sum + p.totalCost, 0);

			const fetchDuration = Date.now() - startTime;
			console.log(`[SQLite Sparkline] Multi-project: ${data.length} buckets in ${fetchDuration}ms`);

			return json({
				data,
				totalTokens: grandTotalTokens,
				totalCost: grandTotalCost,
				bucketCount: data.length,
				bucketSize: 'hour',
				startTime: start.toISOString(),
				endTime: end.toISOString(),
				projectKeys: Array.from(allProjects),
				projectColors,
				source: 'sqlite',
				fetchDuration
			});
		}

		// Single-project/agent mode
		const rawData = getHourlyBreakdown(start, end, { project, agent: agentName });
		const data = fillMissingBuckets(rawData, start, end);

		const totalTokens = data.reduce((sum, p) => sum + p.tokens, 0);
		const totalCost = data.reduce((sum, p) => sum + p.cost, 0);

		const fetchDuration = Date.now() - startTime;
		console.log(`[SQLite Sparkline] Single: ${data.length} buckets in ${fetchDuration}ms (${totalTokens.toLocaleString()} tokens)`);

		return json({
			data,
			totalTokens,
			totalCost,
			bucketCount: data.length,
			bucketSize: 'hour',
			startTime: start.toISOString(),
			endTime: end.toISOString(),
			source: 'sqlite',
			fetchDuration
		});
	} catch (error) {
		console.error('[SQLite Sparkline] Error:', error);
		return json(
			{
				error: 'Failed to fetch sparkline data',
				message: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
}
