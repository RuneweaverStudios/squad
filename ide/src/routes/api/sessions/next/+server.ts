/**
 * Next Session API - Spawn session for next ready task
 *
 * POST /api/sessions/next
 * Purpose: After completed signal with completionMode: 'auto_proceed',
 *          spawn a new session for the next ready task
 *
 * Input: { completedTaskId, completedSessionName, nextTaskId?, project? }
 * Output: { success, nextTaskId, nextTaskTitle, sessionName } or { success: false, reason }
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getReadyTasks } from '$lib/server/jat-tasks.js';
import {
	DEFAULT_MODEL,
	AGENT_MAIL_URL
} from '$lib/config/spawnConfig.js';
import { getJatDefaults } from '$lib/server/projectPaths.js';
import { CLAUDE_READY_PATTERNS, SHELL_PROMPT_PATTERNS } from '$lib/server/shellPatterns.js';
import type { RequestHandler } from './$types';

const execAsync = promisify(exec);

// Default tmux dimensions
const TMUX_INITIAL_WIDTH = 80;
const TMUX_INITIAL_HEIGHT = 40;

interface NextSessionRequest {
	completedTaskId: string;
	completedSessionName: string;
	nextTaskId?: string;
	project?: string;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body: NextSessionRequest = await request.json();
		const { completedTaskId, completedSessionName, nextTaskId, project } = body;

		// 1. Find next ready task
		let nextTask;
		if (nextTaskId) {
			// If nextTaskId provided, use it (from signal)
			const readyTasks = getReadyTasks();
			nextTask = readyTasks.find(t => t.id === nextTaskId);
			if (!nextTask) {
				// Task ID was provided but not found in ready list - it may have been taken
				console.log(`[next] Provided nextTaskId ${nextTaskId} not ready, finding alternative`);
				nextTask = readyTasks[0];
			}
		} else {
			// Find first ready task
			const readyTasks = getReadyTasks();
			nextTask = readyTasks[0];
		}

		if (!nextTask) {
			return json({
				success: false,
				reason: 'no_ready_tasks',
				message: 'No ready tasks available to spawn',
				completedTaskId,
				timestamp: new Date().toISOString()
			});
		}

		// 2. Kill the completed session (optional - cleanup old session)
		if (completedSessionName) {
			try {
				await execAsync(`tmux kill-session -t "${completedSessionName}" 2>/dev/null || true`);
				console.log(`[next] Killed completed session: ${completedSessionName}`);
			} catch {
				// Ignore errors - session may already be dead
			}

			// Clean up signal files
			try {
				await execAsync(`rm -f /tmp/jat-signal-tmux-${completedSessionName}.json 2>/dev/null || true`);
			} catch {
				// Ignore cleanup errors
			}
		}

		// 3. Apply configurable delay before spawning (allows user to see completion)
		const jatDefaults = await getJatDefaults();
		const autoProceedDelay = jatDefaults.auto_proceed_delay || 2;
		if (autoProceedDelay > 0) {
			console.log(`[next] Waiting ${autoProceedDelay}s before spawning next task...`);
			await new Promise(resolve => setTimeout(resolve, autoProceedDelay * 1000));
		}

		// 4. Spawn new session for next task
		const projectPath = nextTask.project_path || project || process.cwd().replace('/ide', '');
		const sessionName = `jat-pending-${Date.now()}`;

		// Build the claude command
		let claudeCmd = `cd "${projectPath}"`;
		claudeCmd += ` && AGENT_MAIL_URL="${AGENT_MAIL_URL}"`;
		claudeCmd += ` claude --model ${DEFAULT_MODEL}`;
		// Only pass --dangerously-skip-permissions if user has explicitly enabled it
		// User must accept the YOLO warning manually first, then set skip_permissions: true in config
		if (jatDefaults.skip_permissions) {
			claudeCmd += ' --dangerously-skip-permissions';
		}

		const initialPrompt = `/jat:start ${nextTask.id}`;

		// Create tmux session
		const command = `tmux new-session -d -s "${sessionName}" -x ${TMUX_INITIAL_WIDTH} -y ${TMUX_INITIAL_HEIGHT} -c "${projectPath}" && sleep 0.3 && tmux send-keys -t "${sessionName}" "${claudeCmd}" Enter`;

		try {
			await execAsync(command);
		} catch (execError) {
			const err = execError as { stderr?: string; message?: string };
			return json({
				success: false,
				reason: 'spawn_failed',
				message: err.stderr || err.message || String(execError),
				completedTaskId,
				nextTaskId: nextTask.id,
				timestamp: new Date().toISOString()
			}, { status: 500 });
		}

		// 5. Wait for Claude to start and send initial prompt
		const maxWaitSeconds = jatDefaults.claude_startup_timeout || 20;
		const checkIntervalMs = 500;
		let claudeReady = false;

		for (let waited = 0; waited < maxWaitSeconds * 1000 && !claudeReady; waited += checkIntervalMs) {
			await new Promise(resolve => setTimeout(resolve, checkIntervalMs));

			try {
				const { stdout: paneOutput } = await execAsync(
					`tmux capture-pane -t "${sessionName}" -p 2>/dev/null`
				);

				const hasClaudePatterns = CLAUDE_READY_PATTERNS.some(p => paneOutput.includes(p));
				const outputLowercase = paneOutput.toLowerCase();
				const hasShellPatterns = SHELL_PROMPT_PATTERNS.some(p => paneOutput.includes(p));
				const mentionsClaude = outputLowercase.includes('claude');
				const isLikelyShellPrompt = hasShellPatterns && !mentionsClaude && waited > 3000;

				if (hasClaudePatterns) {
					claudeReady = true;
					console.log(`[next] Claude Code ready after ${waited}ms`);
				} else if (isLikelyShellPrompt && waited > 5000) {
					console.error(`[next] Claude Code failed to start - detected shell prompt`);
					break;
				}
			} catch {
				// Session might not exist yet, continue waiting
			}
		}

		if (!claudeReady) {
			console.warn(`[next] Claude Code may not have started properly after ${maxWaitSeconds}s`);
		}

		// Send initial prompt
		const escapedPrompt = initialPrompt.replace(/"/g, '\\"').replace(/\$/g, '\\$');
		try {
			await execAsync(`tmux send-keys -t "${sessionName}" -- "${escapedPrompt}"`);
			await new Promise(resolve => setTimeout(resolve, 100));
			await execAsync(`tmux send-keys -t "${sessionName}" Enter`);
			console.log(`[next] Sent initial prompt: ${initialPrompt}`);
		} catch (err) {
			console.error(`[next] Failed to send initial prompt:`, err);
		}

		return json({
			success: true,
			completedTaskId,
			nextTaskId: nextTask.id,
			nextTaskTitle: nextTask.title,
			sessionName,
			project: projectPath,
			message: `Spawned session for task ${nextTask.id}`,
			timestamp: new Date().toISOString()
		});

	} catch (error) {
		console.error('Error in POST /api/sessions/next:', error);
		return json({
			success: false,
			reason: 'internal_error',
			message: error instanceof Error ? error.message : String(error),
			timestamp: new Date().toISOString()
		}, { status: 500 });
	}
};
