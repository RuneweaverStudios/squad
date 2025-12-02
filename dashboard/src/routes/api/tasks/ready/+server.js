/**
 * Ready Tasks API - Get count and list of ready tasks
 * GET /api/tasks/ready
 *
 * Returns tasks that are ready to be worked on (no unmet dependencies)
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/** @type {import('./$types').RequestHandler} */
export async function GET() {
	try {
		const projectPath = process.cwd().replace('/dashboard', '');

		// Get ready tasks from Beads
		const { stdout } = await execAsync('bd ready --json', {
			cwd: projectPath,
			timeout: 10000
		});

		let tasks = [];
		try {
			tasks = JSON.parse(stdout.trim() || '[]');
		} catch {
			tasks = [];
		}

		return json({
			count: tasks.length,
			tasks: tasks.map((t) => ({
				id: t.id,
				title: t.title,
				priority: t.priority,
				type: t.type
			})),
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Failed to get ready tasks:', error);
		return json({
			count: 0,
			tasks: [],
			error: error instanceof Error ? error.message : 'Failed to get ready tasks',
			timestamp: new Date().toISOString()
		});
	}
}
