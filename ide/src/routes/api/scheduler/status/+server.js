/**
 * Scheduler Status API
 * GET /api/scheduler/status
 *
 * Returns the current state of the jat-scheduler service:
 * - running: whether the scheduler tmux session exists
 * - uptime: seconds since session started (if running)
 * - scheduledCount: number of tasks with schedule_cron or next_run_at
 * - nextRun: ISO datetime of the next scheduled task
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getScheduledTasks } from '$lib/server/jat-tasks.js';

const execAsync = promisify(exec);

const SCHEDULER_SESSION = 'server-scheduler';

/** @type {import('./$types').RequestHandler} */
export async function GET() {
	try {
		// Check if scheduler tmux session exists
		let running = false;
		let uptime = null;
		let sessionCreated = null;

		try {
			const { stdout } = await execAsync(
				`tmux list-sessions -F '#{session_name}:#{session_created}' 2>/dev/null | grep '^${SCHEDULER_SESSION}:'`
			);
			if (stdout.trim()) {
				running = true;
				const parts = stdout.trim().split(':');
				if (parts[1]) {
					const createdEpoch = parseInt(parts[1]);
					sessionCreated = new Date(createdEpoch * 1000).toISOString();
					uptime = Math.floor(Date.now() / 1000) - createdEpoch;
				}
			}
		} catch {
			// tmux session not found - scheduler not running
		}

		// Get scheduled tasks count and next run
		const scheduledTasks = getScheduledTasks();
		const scheduledCount = scheduledTasks.length;

		// Find the nearest next_run_at
		let nextRun = null;
		const now = new Date().toISOString();
		const upcoming = scheduledTasks
			.filter((t) => t.next_run_at && t.next_run_at > now && t.status !== 'closed')
			.sort((a, b) => (a.next_run_at || '').localeCompare(b.next_run_at || ''));

		if (upcoming.length > 0) {
			nextRun = {
				taskId: upcoming[0].id,
				taskTitle: upcoming[0].title,
				nextRunAt: upcoming[0].next_run_at,
				scheduleCron: upcoming[0].schedule_cron
			};
		}

		return json({
			running,
			uptime,
			sessionCreated,
			scheduledCount,
			nextRun,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Failed to get scheduler status:', error);
		return json(
			{
				running: false,
				uptime: null,
				sessionCreated: null,
				scheduledCount: 0,
				nextRun: null,
				error: error instanceof Error ? error.message : 'Failed to get scheduler status',
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
}
