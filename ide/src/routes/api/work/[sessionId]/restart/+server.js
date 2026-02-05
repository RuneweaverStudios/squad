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
import { getTasks } from '$lib/server/jat-tasks.js';
import {
	DEFAULT_MODEL,
	AGENT_MAIL_URL
} from '$lib/config/spawnConfig.js';
import { getJatDefaults } from '$lib/server/projectPaths.js';
import { CLAUDE_READY_PATTERNS, SHELL_PROMPT_PATTERNS, isYoloWarningDialog } from '$lib/server/shellPatterns.js';
import { stripAnsi } from '$lib/utils/ansiToHtml.js';

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
			projectPath = process.cwd().replace('/ide', '');
		}

		// Validate project path exists
		if (!existsSync(projectPath)) {
			return json({
				error: 'Project path not found',
				message: `Project directory does not exist: ${projectPath}`,
				sessionId
			}, { status: 400 });
		}

		// Get JAT config defaults (used for skip_permissions, timeout, etc.)
		const jatDefaults = await getJatDefaults();

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

		// Only pass --dangerously-skip-permissions if user has explicitly enabled it
		// User must accept the YOLO warning manually first, then set skip_permissions: true in config
		if (jatDefaults.skip_permissions) {
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
		const maxWaitSeconds = jatDefaults.claude_startup_timeout || 20;
		const checkIntervalMs = 500;
		let claudeReady = false;
		let shellPromptDetected = false;
		for (let waited = 0; waited < maxWaitSeconds * 1000 && !claudeReady; waited += checkIntervalMs) {
			await new Promise(resolve => setTimeout(resolve, checkIntervalMs));

			try {
				const { stdout: paneOutput } = await execAsync(
					`tmux capture-pane -t "${sessionId}" -p 2>/dev/null`
				);

				// Check for YOLO warning dialog (first-time --dangerously-skip-permissions)
				// This dialog blocks startup and expects user to select "1" (No) or "2" (Yes)
				// We do NOT auto-accept for liability reasons - user must read and accept themselves
				if (isYoloWarningDialog(paneOutput)) {
					console.log(`[restart] YOLO permission warning detected - waiting for user to accept in terminal...`);
					// Return error so IDE can notify user to accept manually
					return json({
						error: 'Permission warning requires user acceptance',
						code: 'YOLO_WARNING_PENDING',
						message: 'Claude Code is showing a permissions warning dialog. Please open the terminal and accept it to continue.',
						sessionId,
						agentName,
						recoveryHint: `Run: tmux attach-session -t ${sessionId}`
					}, { status: 202 }); // 202 Accepted - request received but needs user action
				}

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
					console.error(`[restart] Terminal output (last 300 chars): ${stripAnsi(paneOutput.slice(-300))}`);
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

				// Wait for the command to be accepted by Claude Code
				// We need enough time for the slash command to start executing
				// but NOT so aggressive that we interrupt commands in progress
				await new Promise(resolve => setTimeout(resolve, 2000));

				// Check if the command was received
				// We look for signs the command is executing OR has been received
				// DO NOT use Ctrl-C retry - it interrupts in-flight bash commands
				// causing "Interrupted by user" errors (jat-t45zv)
				//
				// Use -S -40 -E -4 to capture agent output area only, skipping:
				// - Last 1-2 lines: statusline ("bypass permissions", JAT status)
				// - Last 2-3 lines: input prompt area
				const { stdout: paneOutput } = await execAsync(
					`tmux capture-pane -t "${sessionId}" -p -S -40 -E -4 2>/dev/null`
				);

				// Signs the command is executing or was received:
				// 1. "is running" - Claude Code shows this for slash commands
				// 2. "STARTING" - JAT signal state
				// 3. "Bash(" - Tool execution has started
				// 4. "● " - Tool execution indicator
				const commandReceived =
					paneOutput.includes('is running') ||
					paneOutput.includes('STARTING') ||
					paneOutput.includes('Bash(') ||
					paneOutput.includes('● ');

				if (commandReceived) {
					commandSent = true;
					console.log(`[restart] Initial prompt sent successfully on attempt ${attempt}`);
				} else if (attempt < maxRetries) {
					// Check if command is still sitting in input buffer (separate capture for input area)
					// Use -S -4 -E -1 to capture just the input line area (skip only statusline)
					const { stdout: inputArea } = await execAsync(
						`tmux capture-pane -t "${sessionId}" -p -S -4 -E -1 2>/dev/null`
					);

					const inputStillVisible = inputArea.includes(initialPrompt) &&
						!inputArea.includes('is running');

					if (inputStillVisible) {
						// Command is still in input buffer - try sending Enter again
						console.log(`[restart] Attempt ${attempt}: Command visible in input, sending Enter again...`);
						await execAsync(`tmux send-keys -t "${sessionId}" Enter`);
						await new Promise(resolve => setTimeout(resolve, 500));
					} else {
						// Command was likely received, just taking time to show "is running"
						// DO NOT send Ctrl-C - it will interrupt in-flight bash commands
						console.log(`[restart] Attempt ${attempt}: Command likely in progress, waiting...`);
						await new Promise(resolve => setTimeout(resolve, 2000));
					}
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
