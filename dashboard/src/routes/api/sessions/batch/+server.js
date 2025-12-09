/**
 * Batch Session Spawn API
 * POST /api/sessions/batch - Spawn N agents for N ready tasks
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { listSessionsAsync } from '$lib/server/sessions.js';

const execAsync = promisify(exec);

/**
 * Load JAT config defaults
 * @returns {{ model: string, claude_flags: string, agent_stagger: number }}
 */
function loadJatDefaults() {
	const configPath = join(homedir(), '.config/jat/projects.json');
	const defaults = {
		model: 'opus',
		claude_flags: '--dangerously-skip-permissions',
		agent_stagger: 30
	};

	if (existsSync(configPath)) {
		try {
			const config = JSON.parse(readFileSync(configPath, 'utf-8'));
			if (config.defaults) {
				if (config.defaults.model) defaults.model = config.defaults.model;
				if (config.defaults.claude_flags) defaults.claude_flags = config.defaults.claude_flags;
				if (config.defaults.agent_stagger) defaults.agent_stagger = config.defaults.agent_stagger;
			}
		} catch (err) {
			console.error('Failed to load JAT config:', err);
		}
	}

	return defaults;
}

/**
 * POST /api/sessions/batch
 * Spawn N new Claude Code sessions, each auto-attacking a ready task
 * Body:
 * - count: Number of agents to spawn (required, 1-10)
 * - project: Project path (default: current project)
 * - model: Model to use (default: from JAT config, fallback opus-4.5)
 * - stagger: Delay between spawns in ms (default: from JAT config agent_stagger * 1000)
 * - autoStart: Whether to run /jat:start auto (default: true)
 */
/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	try {
		const jatDefaults = loadJatDefaults();
		const body = await request.json();
		const {
			count = 1,
			project,
			model = jatDefaults.model,
			stagger = jatDefaults.agent_stagger * 1000,
			autoStart = true,
			claudeFlags = jatDefaults.claude_flags
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
			/** @type {string} */
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
				// Build the claude command with model and flags
				let claudeCmd = `cd "${projectPath}" && claude`;
				if (model) claudeCmd += ` --model ${model}`;
				if (claudeFlags) claudeCmd += ` ${claudeFlags}`;

				// Create tmux session
				const command = `tmux new-session -d -s "${sessionName}" -c "${projectPath}" && tmux send-keys -t "${sessionName}" "${claudeCmd}" Enter`;
				await execAsync(command);

				// Wait for Claude to fully start (5s minimum - Claude Code takes time to initialize)
				if (prompt) {
					await new Promise(resolve => setTimeout(resolve, 5000));
					const escapedPrompt = prompt.replace(/"/g, '\\"');
					await execAsync(`tmux send-keys -t "${sessionName}" -- "${escapedPrompt}" Enter`);
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
			claudeFlags,
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
