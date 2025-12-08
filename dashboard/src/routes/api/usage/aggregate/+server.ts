/**
 * Token Usage Aggregation API Endpoint
 *
 * POST /api/usage/aggregate - Run the aggregation job
 * GET /api/usage/aggregate - Get aggregation status and stats
 *
 * This endpoint triggers the background job that processes JSONL files
 * and updates the SQLite database.
 *
 * Response (POST):
 * {
 *   success: true,
 *   filesProcessed: number,
 *   entriesProcessed: number,
 *   durationMs: number
 * }
 *
 * Response (GET):
 * {
 *   stats: { totalRows, uniqueSessions, uniqueAgents, ... },
 *   lastAggregation: { ... } // If available
 * }
 */

import { json } from '@sveltejs/kit';
import { runAggregation, getDatabaseStats, getDatabase } from '$lib/server/tokenUsageDb';

// Track last aggregation result
let lastAggregationResult: {
	timestamp: string;
	filesProcessed: number;
	entriesProcessed: number;
	durationMs: number;
} | null = null;

// Track if aggregation is in progress
let aggregationInProgress = false;

export async function POST() {
	if (aggregationInProgress) {
		return json(
			{
				error: 'Aggregation already in progress',
				lastAggregation: lastAggregationResult
			},
			{ status: 409 }
		);
	}

	try {
		aggregationInProgress = true;
		const result = await runAggregation();

		lastAggregationResult = {
			timestamp: new Date().toISOString(),
			...result
		};

		return json({
			success: true,
			...result,
			timestamp: lastAggregationResult.timestamp
		});
	} catch (error) {
		console.error('[Aggregation API] Error:', error);
		return json(
			{
				error: 'Aggregation failed',
				message: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	} finally {
		aggregationInProgress = false;
	}
}

export async function GET() {
	try {
		const stats = getDatabaseStats();

		// Get aggregation state info
		const db = getDatabase();
		const stateCount = db.prepare('SELECT COUNT(*) as count FROM aggregation_state').get() as { count: number };
		const recentState = db.prepare(
			'SELECT file_path, processed_at FROM aggregation_state ORDER BY processed_at DESC LIMIT 1'
		).get() as { file_path: string; processed_at: string } | undefined;

		return json({
			stats,
			aggregationState: {
				trackedFiles: stateCount.count,
				lastProcessedFile: recentState?.file_path,
				lastProcessedAt: recentState?.processed_at
			},
			lastAggregation: lastAggregationResult,
			isRunning: aggregationInProgress
		});
	} catch (error) {
		console.error('[Aggregation API] Error getting stats:', error);
		return json(
			{
				error: 'Failed to get stats',
				message: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
}
