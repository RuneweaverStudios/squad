/**
 * Work Session Restart API
 * POST /api/work/[sessionId]/restart
 *
 * Restarts a work session by:
 * 1. Getting the current task assigned to the session's agent
 * 2. Killing the tmux session
 * 3. Spawning a new session with the same task
 *
 * This allows recovery from stuck or misbehaving Claude Code sessions
 * without losing the task assignment.
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { getTasks } from '$lib/server/beads.js';
import {
	DEFAULT_MODEL,
	DANGEROUSLY_SKIP_PERMISSIONS,
	AGENT_MAIL_URL
} from '$lib/config/spawnConfig.js';

const execAsync = promisify(exec);

/** @type {import('./$types').RequestHandler} */
export async function POST({ params }) {
	try {
		const { sessionId } = params;

		if (!sessionId) {
			return json({
				error: 'Missing session ID',
				message: 'Session ID is required in path'
			}, { status: 400 });
		}

		// Extract agent name from session name (jat-AgentName -> AgentName)
		const agentName = sessionId.replace(/^jat-/, '');

		// Step 1: Find in_progress task assigned to this agent
		let currentTask = null;
		let projectPath = null;
		try {
			const allTasks = getTasks({});
			currentTask = allTasks.find(
				t => t.status === 'in_progress' && t.assignee === agentName
			);
			if (currentTask) {
				projectPath = currentTask.project_path;
			}
		} catch (err) {
			console.error('Failed to fetch tasks:', err);
		}

		// If no task found, try to infer project from session or use default
		if (!projectPath) {
			projectPath = process.cwd().replace('/dashboard', '');
		}

		// Validate project path exists
		if (!existsSync(projectPath)) {
			return json({
				error: 'Project path not found',
				message: `Project directory does not exist: ${projectPath}`,
				sessionId
			}, { status: 400 });
		}

		// Step 2: Kill the existing tmux session
		try {
			await execAsync(`tmux kill-session -t "${sessionId}" 2>/dev/null`);
		} catch {
			// Session may not exist, that's okay - we'll create a new one
		}

		// Small delay to ensure session is fully killed
		await new Promise(resolve => setTimeout(resolve, 500));

		// Step 3: Create new tmux session with Claude Code
		// Default tmux dimensions for proper terminal output width
		// 80 columns is the standard terminal width that Claude Code expects
		// 40 rows provides good vertical context for terminal output
		const TMUX_INITIAL_WIDTH = 80;
		const TMUX_INITIAL_HEIGHT = 40;

		// Build the claude command
		let claudeCmd = `cd "${projectPath}"`;
		claudeCmd += ` && AGENT_MAIL_URL="${AGENT_MAIL_URL}"`;
		claudeCmd += ` claude --model ${DEFAULT_MODEL}`;

		if (DANGEROUSLY_SKIP_PERMISSIONS) {
			claudeCmd += ' --dangerously-skip-permissions';
		}

		// Create session with explicit dimensions to ensure proper terminal width
		// Sleep allows shell to initialize before sending keys - prevents race condition
		const createSessionCmd = `tmux new-session -d -s "${sessionId}" -x ${TMUX_INITIAL_WIDTH} -y ${TMUX_INITIAL_HEIGHT} -c "${projectPath}" && sleep 0.3 && tmux send-keys -t "${sessionId}" "${claudeCmd}" Enter`;

		try {
			await execAsync(createSessionCmd);
		} catch (err) {
			const execErr = /** @type {{ stderr?: string, message?: string }} */ (err);
			const errorMessage = execErr.stderr || (err instanceof Error ? err.message : String(err));

			return json({
				error: 'Failed to create session',
				message: errorMessage,
				sessionId,
				agentName
			}, { status: 500 });
		}

		// Step 4: Wait for Claude to initialize, then send /jat:start {agentName} [taskId]
		const initialPrompt = currentTask
			? `/jat:start ${agentName} ${currentTask.id}`
			: `/jat:start ${agentName}`;

		// Wait for Claude to initialize with verification
		// Check that Claude Code TUI is running (not just bash prompt)
		const CLAUDE_READY_PATTERNS = ['Claude Code', '╭', '> ', 'claude-opus', 'claude-sonnet', 'Opus', 'Sonnet', 'Type to stream'];
		// Shell prompt patterns - detect when Claude hasn't started
		const SHELL_PROMPT_PATTERNS = [
			'-bash:',           // bash error prefix
			'$ ',               // common bash prompt
			'bash-',            // bash version prefix
			'❯',                // zsh/powerline prompt
			'➜',                // oh-my-zsh default
			'%',                // zsh default prompt
			' on ',             // starship/powerline "dir on branch" format
			'master [',         // git branch indicators
			'main [',           // git branch indicators
			'jat on',           // specific to this user's prompt
			'No such file or directory'  // bash error
		];
		const maxWaitSeconds = 20;
		const checkIntervalMs = 500;
		let claudeReady = false;
		let shellPromptDetected = false;

		for (let waited = 0; waited < maxWaitSeconds * 1000 && !claudeReady; waited += checkIntervalMs) {
			await new Promise(resolve => setTimeout(resolve, checkIntervalMs));

			try {
				const { stdout: paneOutput } = await execAsync(
					`tmux capture-pane -t "${sessionId}" -p 2>/dev/null`
				);

				const hasClaudePatterns = CLAUDE_READY_PATTERNS.some(p => paneOutput.includes(p));
				const outputLowercase = paneOutput.toLowerCase();
				const hasShellPatterns = SHELL_PROMPT_PATTERNS.some(p => paneOutput.includes(p));
				const mentionsClaude = outputLowercase.includes('claude');
				const isLikelyShellPrompt = hasShellPatterns && !mentionsClaude && waited > 3000;

				if (hasClaudePatterns) {
					claudeReady = true;
					console.log(`[restart] Claude Code ready after ${waited}ms`);
				} else if (isLikelyShellPrompt && waited > 5000) {
					shellPromptDetected = true;
					console.error(`[restart] Claude Code failed to start - detected shell prompt`);
					console.error(`[restart] Terminal output (last 300 chars): ${paneOutput.slice(-300)}`);
					break;
				}
			} catch {
				// Session might not exist yet, continue waiting
			}
		}

		// CRITICAL: Don't send /jat:start if Claude isn't ready - it will go to bash!
		if (!claudeReady) {
			if (shellPromptDetected) {
				console.error(`[restart] ABORTING: Claude Code did not start (shell prompt detected)`);
				return json({
					error: 'Claude Code failed to start',
					message: 'Claude Code did not start within the timeout period. The session was created but Claude is not running. Try attaching to the terminal manually.',
					sessionId,
					agentName,
					recoveryHint: `Try: tmux attach-session -t ${sessionId}`
				}, { status: 500 });
			}
			console.warn(`[restart] Claude Code may not have started properly after ${maxWaitSeconds}s, proceeding with caution`);
		}

		/**
		 * Send the initial prompt with retry logic
		 * Sometimes Claude isn't ready to accept input even after the wait,
		 * so we verify the command executed and retry if needed.
		 */
		const escapedPrompt = initialPrompt.replace(/"/g, '\\"').replace(/\$/g, '\\$');
		const maxRetries = 3;
		let commandSent = false;

		for (let attempt = 1; attempt <= maxRetries && !commandSent; attempt++) {
			try {
				// CRITICAL: Send text and Enter SEPARATELY - Claude Code's TUI
				// doesn't reliably process Enter when combined with text
				await execAsync(`tmux send-keys -t "${sessionId}" -- "${escapedPrompt}"`);
				await new Promise(resolve => setTimeout(resolve, 100));
				await execAsync(`tmux send-keys -t "${sessionId}" Enter`);

				// Wait a moment for the command to be processed
				await new Promise(resolve => setTimeout(resolve, 1500));

				// Check if the command was executed by looking for "is running" in output
				const { stdout: paneOutput } = await execAsync(
					`tmux capture-pane -t "${sessionId}" -p 2>/dev/null | tail -20`
				);

				if (paneOutput.includes('is running') || paneOutput.includes('STARTING')) {
					commandSent = true;
					console.log(`[restart] Initial prompt sent successfully on attempt ${attempt}`);
				} else if (attempt < maxRetries) {
					// Command might not have executed - use Ctrl-C to clear
					console.log(`[restart] Attempt ${attempt}: Command may not have executed, retrying...`);
					await execAsync(`tmux send-keys -t "${sessionId}" C-c`);
					await new Promise(resolve => setTimeout(resolve, 500));
				}
			} catch (err) {
				console.error(`[restart] Attempt ${attempt} failed:`, err);
				if (attempt < maxRetries) {
					await new Promise(resolve => setTimeout(resolve, 1000));
				}
			}
		}

		if (!commandSent) {
			console.warn(`[restart] Initial prompt may not have been executed after ${maxRetries} attempts`);
		}

		return json({
			success: true,
			sessionId,
			agentName,
			taskId: currentTask?.id || null,
			projectPath,
			message: currentTask
				? `Restarted session ${sessionId} with task ${currentTask.id}`
				: `Restarted session ${sessionId} (no task assigned)`,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error in POST /api/work/[sessionId]/restart:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
