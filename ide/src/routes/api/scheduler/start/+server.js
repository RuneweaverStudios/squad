/**
 * Scheduler Start API
 * POST /api/scheduler/start
 *
 * Starts the squad-scheduler service in a tmux session.
 * The scheduler polls for tasks with next_run_at <= now and spawns agents.
 *
 * Returns 200 if started successfully, 409 if already running.
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const execAsync = promisify(exec);

const SCHEDULER_SESSION = 'server-scheduler';

/** @type {import('./$types').RequestHandler} */
export async function POST() {
	try {
		// Check if already running
		try {
			await execAsync(`tmux has-session -t ${SCHEDULER_SESSION} 2>/dev/null`);
			return json(
				{ success: false, message: 'Scheduler is already running' },
				{ status: 409 }
			);
		} catch {
			// Not running, proceed to start
		}

		// Find the scheduler script
		const squadPath = process.cwd().replace(/\/ide$/, '');
		const schedulerScript = join(squadPath, 'tools', 'scheduler', 'run.sh');
		const fallbackScript = join(homedir(), 'code', 'squad', 'tools', 'scheduler', 'run.sh');

		let scriptPath = null;
		if (existsSync(schedulerScript)) {
			scriptPath = schedulerScript;
		} else if (existsSync(fallbackScript)) {
			scriptPath = fallbackScript;
		}

		if (!scriptPath) {
			return json(
				{
					success: false,
					message: 'Scheduler script not found. The squad-scheduler service has not been built yet.',
					hint: 'The scheduler service will be implemented in a future task.'
				},
				{ status: 404 }
			);
		}

		// Start scheduler in tmux session
		await execAsync(
			`tmux new-session -d -s ${SCHEDULER_SESSION} "bash ${scriptPath}"`
		);

		return json({
			success: true,
			message: 'Scheduler started',
			session: SCHEDULER_SESSION,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Failed to start scheduler:', error);
		return json(
			{
				success: false,
				message: error instanceof Error ? error.message : 'Failed to start scheduler'
			},
			{ status: 500 }
		);
	}
}
