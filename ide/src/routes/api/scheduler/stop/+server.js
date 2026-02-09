/**
 * Scheduler Stop API
 * POST /api/scheduler/stop
 *
 * Stops the jat-scheduler service by killing its tmux session.
 * Returns 200 if stopped successfully, 404 if not running.
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const SCHEDULER_SESSION = 'server-scheduler';

/** @type {import('./$types').RequestHandler} */
export async function POST() {
	try {
		// Check if running
		try {
			await execAsync(`tmux has-session -t ${SCHEDULER_SESSION} 2>/dev/null`);
		} catch {
			return json(
				{ success: false, message: 'Scheduler is not running' },
				{ status: 404 }
			);
		}

		// Kill the scheduler session
		await execAsync(`tmux kill-session -t ${SCHEDULER_SESSION}`);

		return json({
			success: true,
			message: 'Scheduler stopped',
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Failed to stop scheduler:', error);
		return json(
			{
				success: false,
				message: error instanceof Error ? error.message : 'Failed to stop scheduler'
			},
			{ status: 500 }
		);
	}
}
