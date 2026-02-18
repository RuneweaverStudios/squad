/**
 * Task Signals API Endpoint
 *
 * GET /api/tasks/{id}/signals - Returns signal timeline for a task
 *
 * Reads from .squad/signals/{taskId}.jsonl which is populated by
 * the PostToolUse hook (post-bash-squad-signal.sh) whenever an agent
 * emits a signal with that task ID.
 *
 * The signal timeline provides a structured history of:
 * - When the task was started (working signal)
 * - Progress updates and state changes
 * - When review was requested
 * - When the task was completed
 * - Any human actions or suggested tasks
 *
 * This replaces the old session logs approach which searched for
 * task IDs in raw terminal output logs.
 */

import { json } from '@sveltejs/kit';
import { readFile, access } from 'fs/promises';
import { join, resolve } from 'path';
import type { RequestHandler } from './$types';
import { getProjectPath } from '$lib/utils/projectUtils';

interface TimelineEvent {
	type: string;
	state?: string;
	session_id: string;
	tmux_session: string;
	timestamp: string;
	task_id?: string;
	data?: Record<string, unknown>;
	git_sha?: string;
	agent_name?: string;
}

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	if (!id) {
		return json({ error: 'Task ID is required' }, { status: 400 });
	}

	try {
		// Get the project root from the task ID prefix (e.g., "steelbridge-xyz" -> "/home/user/code/steelbridge")
		// Falls back to parent of IDE if task ID doesn't have a recognizable project prefix
		const projectRoot = getProjectPath(id) || resolve(process.cwd(), '..');
		const signalsDir = join(projectRoot, '.squad', 'signals');
		const signalFile = join(signalsDir, `${id}.jsonl`);

		// Check if signal file exists
		try {
			await access(signalFile);
		} catch {
			// No signals for this task yet
			return json({
				task_id: id,
				signals: [],
				count: 0,
				message: 'No signals found for this task',
				timestamp: new Date().toISOString()
			});
		}

		// Read and parse the JSONL file
		const content = await readFile(signalFile, 'utf-8');
		const lines = content.trim().split('\n').filter(line => line.trim());

		const signals: TimelineEvent[] = [];
		for (const line of lines) {
			try {
				const event = JSON.parse(line) as TimelineEvent;
				signals.push(event);
			} catch (parseErr) {
				console.warn(`Skipping malformed signal line: ${line}`);
			}
		}

		// Sort by timestamp (oldest first for timeline display)
		signals.sort((a, b) =>
			new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
		);

		// Extract summary stats
		const stats = {
			startTime: signals[0]?.timestamp,
			endTime: signals[signals.length - 1]?.timestamp,
			agents: [...new Set(signals.map(s => s.agent_name).filter(Boolean))],
			stateChanges: signals.filter(s => s.type === 'state').length,
			hasCompletion: signals.some(s => s.state === 'completed' || s.type === 'complete'),
			hasReview: signals.some(s => s.state === 'review'),
			hasSuggestedTasks: signals.some(s => s.type === 'tasks' || s.data?.suggestedTasks)
		};

		return json({
			task_id: id,
			signals,
			count: signals.length,
			stats,
			timestamp: new Date().toISOString()
		});

	} catch (error) {
		const err = error as Error;
		console.error('Error fetching task signals:', err);
		return json({
			error: 'Failed to fetch task signals',
			message: err.message
		}, { status: 500 });
	}
};
