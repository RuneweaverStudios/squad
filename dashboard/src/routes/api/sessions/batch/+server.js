/**
 * Batch Session Spawn API
 * POST /api/sessions/batch - Spawn N agents for N ready tasks
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { listSessionsAsync } from '$lib/server/sessions.js';

const execAsync = promisify(exec);

/**
 * POST /api/sessions/batch
 * Spawn N new Claude Code sessions, each auto-attacking a ready task
 * Body:
 * - count: Number of agents to spawn (required, 1-10)
 * - project: Project path (default: current project)
 * - model: Model to use (default: sonnet-4.5)
 * - stagger: Delay between spawns in ms (default: 15000)
 * - autoStart: Whether to run /jat:start auto (default: true)
 */
/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	try {
		const body = await request.json();
		const {
			count = 1,
			project,
			model = 'sonnet-4.5',
			stagger = 15000,
			autoStart = true
		} = body;

		// Validate count
		const agentCount = Math.min(Math.max(parseInt(count, 10) || 1, 1), 10);

		// Get project path
		const projectPath = project || process.cwd().replace('/dashboard', '');

		// Get existing sessions to avoid name conflicts
		const existingSessions = await listSessionsAsync();
		const existingNames = new Set(existingSessions.map(s => s.agentName));

		// Generate unique agent names
		const agentNames = [];
		try {
			const { stdout } = await execAsync('am-generate-name --count ' + agentCount);
			const names = stdout.trim().split('\n').filter(n => n.length > 0);
			for (const name of names) {
				if (!existingNames.has(name)) {
					agentNames.push(name);
					existingNames.add(name);
				}
			}
		} catch {
			// Fallback to timestamp-based names
			for (let i = 0; i < agentCount; i++) {
				agentNames.push(`Agent${Date.now()}${i}`);
			}
		}

		// Ensure we have enough names
		while (agentNames.length < agentCount) {
			const fallbackName = `Agent${Date.now()}${agentNames.length}`;
			agentNames.push(fallbackName);
		}

		// Spawn sessions with staggered timing
		// Use jat-pending-* naming so /jat:start can register and rename sessions
		// This ensures dashboard tracks sessions correctly after agent registration
		const results = [];
		const prompt = autoStart ? '/jat:start auto' : '';

		for (let i = 0; i < agentCount; i++) {
			// Use pending naming - /jat:start will register agent and rename session
			const sessionName = `jat-pending-${Date.now()}-${i}`;

			try {
				// Build the claude command
				let claudeCmd = `cd "${projectPath}" && claude`;
				if (model) claudeCmd += ` --model ${model}`;

				// Create tmux session
				const command = `tmux new-session -d -s "${sessionName}" -c "${projectPath}" && tmux send-keys -t "${sessionName}" "${claudeCmd}" Enter`;
				await execAsync(command);

				// Wait for Claude to start, then send prompt
				if (prompt) {
					await new Promise(resolve => setTimeout(resolve, 2000));
					const escapedPrompt = prompt.replace(/"/g, '\\"');
					await execAsync(`tmux send-keys -t "${sessionName}" "${escapedPrompt}" Enter`);
				}

				results.push({
					success: true,
					sessionName,
					agentName: null, // Will be assigned by /jat:start after registration
					index: i + 1
				});
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : String(err);
				results.push({
					success: false,
					sessionName,
					agentName: null,
					index: i + 1,
					error: errorMessage
				});
			}

			// Stagger between spawns (except last one)
			if (i < agentCount - 1 && stagger > 0) {
				await new Promise(resolve => setTimeout(resolve, stagger));
			}
		}

		const successCount = results.filter(r => r.success).length;
		const failCount = results.filter(r => !r.success).length;

		return json({
			success: failCount === 0,
			requested: agentCount,
			spawned: successCount,
			failed: failCount,
			results,
			project: projectPath,
			model,
			stagger,
			autoStart,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error in POST /api/sessions/batch:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
