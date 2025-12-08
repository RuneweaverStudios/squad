/**
 * Token Usage API Endpoint (SQLite-based)
 *
 * GET /api/usage - Get aggregated token usage
 *
 * Query Parameters:
 * - range: 'today' | 'week' | '24h' | 'all' (default: 'today')
 * - project: Filter by project name
 * - agent: Filter by agent name
 * - breakdown: 'hourly' | 'project' | 'agent' - Include breakdowns
 *
 * Response:
 * {
 *   usage: { total_tokens, input_tokens, ..., cost_usd, session_count },
 *   breakdown?: [...],  // If requested
 *   cached: false,
 *   source: 'sqlite',
 *   timestamp: string
 * }
 */

import { json } from '@sveltejs/kit';
import {
	getTodayUsage,
	getWeekUsage,
	getUsageForRange,
	getLast24HoursHourly,
	getUsageByProject,
	getUsageByAgent,
	getDatabaseStats
} from '$lib/server/tokenUsageDb';

export async function GET({ url }) {
	const range = url.searchParams.get('range') || 'today';
	const project = url.searchParams.get('project') || undefined;
	const agent = url.searchParams.get('agent') || undefined;
	const breakdown = url.searchParams.get('breakdown');

	try {
		let usage;
		const now = new Date();

		switch (range) {
			case 'today':
				usage = getTodayUsage({ project, agent });
				break;
			case 'week':
				usage = getWeekUsage({ project, agent });
				break;
			case '24h': {
				const start24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
				usage = getUsageForRange(start24h, now, { project, agent });
				break;
			}
			case 'all': {
				// All time - use very early start date
				const startAll = new Date(0);
				usage = getUsageForRange(startAll, now, { project, agent });
				break;
			}
			default:
				return json({ error: `Invalid range: ${range}` }, { status: 400 });
		}

		const response: Record<string, unknown> = {
			usage,
			source: 'sqlite',
			timestamp: now.toISOString()
		};

		// Add breakdown if requested
		if (breakdown === 'hourly') {
			response.breakdown = getLast24HoursHourly({ project, agent });
		} else if (breakdown === 'project') {
			const start = range === 'today'
				? new Date(now.getFullYear(), now.getMonth(), now.getDate())
				: range === '24h'
					? new Date(now.getTime() - 24 * 60 * 60 * 1000)
					: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
			response.breakdown = getUsageByProject(start, now);
		} else if (breakdown === 'agent') {
			const start = range === 'today'
				? new Date(now.getFullYear(), now.getMonth(), now.getDate())
				: range === '24h'
					? new Date(now.getTime() - 24 * 60 * 60 * 1000)
					: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
			response.breakdown = getUsageByAgent(start, now, { project });
		}

		return json(response);
	} catch (error) {
		console.error('[Usage API] Error:', error);
		return json(
			{
				error: 'Failed to fetch usage data',
				message: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
}
