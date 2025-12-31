/**
 * Work Spawn API - Auto-spawn agent + session
 * POST /api/work/spawn
 *
 * Creates a NEW agent + tmux session:
 * 1. Generate agent name via am-register
 * 2. Create tmux session jat-{AgentName}
 * 3. If taskId provided: Assign task to agent in Beads (bd update)
 * 4. Run Claude Code with /jat:start (with agent name, optionally with task)
 * 5. Return new WorkSession
 *
 * Body:
 * - taskId: Task ID to assign (optional - if omitted, creates planning session)
 * - model: Model to use (default from spawnConfig)
 * - attach: If true, immediately open terminal attached to session (default: false)
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import {
	DEFAULT_MODEL,
	DANGEROUSLY_SKIP_PERMISSIONS,
	AGENT_MAIL_URL,
	CLAUDE_STARTUP_TIMEOUT_SECONDS
} from '$lib/config/spawnConfig.js';
import { getTaskById } from '$lib/server/beads.js';
import { getProjectPath, getJatDefaults } from '$lib/server/projectPaths.js';
import { CLAUDE_READY_PATTERNS, SHELL_PROMPT_PATTERNS } from '$lib/server/shellPatterns.js';
import { stripAnsi } from '$lib/utils/ansiToHtml.js';

const execAsync = promisify(exec);

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	try {
		const body = await request.json();
		const { taskId, model = DEFAULT_MODEL, attach = false, imagePath = null, project = null } = body;

		// taskId is now optional - if not provided, creates a planning session
		// imagePath is optional - if provided, will be sent to the session after startup
		// project is optional - if provided, use that path; otherwise infer from task ID prefix

		// Determine project path:
		// 1. If explicit project provided, look it up in JAT config
		// 2. If taskId provided, infer from prefix and look up in JAT config
		// 3. Fall back to current project (jat)
		let projectPath = null;
		let inferredFromTaskId = false;

		if (project) {
			// Explicit project provided - look up its path
			const projectInfo = await getProjectPath(project);
			if (projectInfo.exists) {
				projectPath = projectInfo.path;
			}
		}

		if (!projectPath && taskId) {
			// Task IDs follow format: {project}-{hash}
			// Handle underscores in project names (e.g., "Community_Connect-abc")
			const lastDashIndex = taskId.lastIndexOf('-');
			const taskPrefix = lastDashIndex > 0 ? taskId.substring(0, lastDashIndex) : taskId.split('-')[0];

			if (taskPrefix && taskPrefix.toLowerCase() !== 'jat') {
				// Look up project path from JAT config (supports custom paths)
				const projectInfo = await getProjectPath(taskPrefix);
				if (projectInfo.exists) {
					projectPath = projectInfo.path;
					inferredFromTaskId = true;
				} else {
					console.warn(`[spawn] Project ${taskPrefix} not found at ${projectInfo.path}, falling back to current project`);
				}
			}
		}

		// Fall back to current project (jat) if no valid path determined
		projectPath = projectPath || process.cwd().replace('/dashboard', '');

		// Final validation: ensure project path exists
		if (!existsSync(projectPath)) {
			return json({
				error: 'Project path not found',
				message: `Project directory does not exist: ${projectPath}`,
				taskId
			}, { status: 400 });
		}

		// Validate beads database exists in project
		const beadsPath = `${projectPath}/.beads`;
		if (!existsSync(beadsPath)) {
			return json({
				error: 'Beads database not found',
				message: `No .beads directory found in ${projectPath}. Run 'bd init' to initialize.`,
				projectPath,
				taskId
			}, { status: 400 });
		}

		console.log('[spawn] Project path:', projectPath, inferredFromTaskId ? '(inferred from task ID)' : '');

		// Step 1: Generate new agent name via am-register
		let agentName;
		try {
			const registerResult = await execAsync(`am-register --json`, {
				cwd: projectPath,
				timeout: 10000
			});
			// am-register --json returns an array with the registered agent
			const registerData = JSON.parse(registerResult.stdout.trim());
			const agentRecord = Array.isArray(registerData) ? registerData[0] : registerData;
			agentName = agentRecord?.name;

			if (!agentName) {
				throw new Error('am-register did not return agent name');
			}
		} catch (err) {
			console.error('Failed to register agent:', err);
			return json({
				error: 'Failed to register agent',
				message: err instanceof Error ? err.message : String(err)
			}, { status: 500 });
		}

		// Step 2: Assign task to new agent in Beads (if taskId provided)
		if (taskId) {
			try {
				await execAsync(`bd update "${taskId}" --status in_progress --assignee "${agentName}"`, {
					cwd: projectPath,
					timeout: 10000
				});
				console.log(`[spawn] Assigned task ${taskId} to ${agentName} in ${projectPath}`);
			} catch (err) {
				// Provide detailed error context for debugging
				const execErr = /** @type {{ stderr?: string, stdout?: string, message?: string }} */ (err);
				const errorDetail = execErr.stderr || execErr.stdout || (err instanceof Error ? err.message : String(err));

				console.error(`[spawn] Failed to assign task ${taskId}:`, {
					error: errorDetail,
					projectPath,
					agentName
				});

				return json({
					error: 'Failed to assign task',
					message: errorDetail,
					detail: `Task ${taskId} may not exist in ${projectPath}/.beads`,
					agentName,
					taskId,
					projectPath
				}, { status: 500 });
			}
		}

		// Step 3: Create tmux session with Claude Code
		const sessionName = `jat-${agentName}`;

		// Default tmux dimensions for proper terminal output width
		// 80 columns is the standard terminal width that Claude Code expects
		// 40 rows provides good vertical context for terminal output
		const TMUX_INITIAL_WIDTH = 80;
		const TMUX_INITIAL_HEIGHT = 40;

		// Build the claude command
		let claudeCmd = `cd "${projectPath}"`;
		claudeCmd += ` && AGENT_MAIL_URL="${AGENT_MAIL_URL}"`;
		claudeCmd += ` claude --model ${model}`;

		if (DANGEROUSLY_SKIP_PERMISSIONS) {
			claudeCmd += ' --dangerously-skip-permissions';
		}

		// JAT bootstrap prompt - minimal identity, commands load full docs on-demand
		// This is added via --append-system-prompt so only dashboard-spawned agents get it
		const jatBootstrap = `You are a JAT agent. Run /jat:start to begin work.`;
		claudeCmd += ` --append-system-prompt '${jatBootstrap}'`;


		// Create session with explicit dimensions to ensure proper terminal width from the start
		// Without -x and -y, tmux uses default 80x24 which may not match dashboard card width
		// Use sleep to allow shell to initialize before sending keys - without this delay,
		// the shell may not be ready and keys are lost (race condition)
		const createSessionCmd = `tmux new-session -d -s "${sessionName}" -x ${TMUX_INITIAL_WIDTH} -y ${TMUX_INITIAL_HEIGHT} -c "${projectPath}" && sleep 0.3 && tmux send-keys -t "${sessionName}" "${claudeCmd}" Enter`;

		try {
			await execAsync(createSessionCmd);
		} catch (err) {
			const execErr = /** @type {{ stderr?: string, message?: string }} */ (err);
			const errorMessage = execErr.stderr || (err instanceof Error ? err.message : String(err));

			// If session already exists, that's a conflict
			if (errorMessage.includes('duplicate session')) {
				return json({
					error: 'Session already exists',
					message: `Session '${sessionName}' already exists`,
					sessionName,
					agentName
				}, { status: 409 });
			}

			return json({
				error: 'Failed to create session',
				message: errorMessage,
				sessionName,
				agentName
			}, { status: 500 });
		}

		// Step 4: Wait for Claude to initialize, then send /jat:start {agentName} [taskId]
		// Pass the agent name explicitly so /jat:start resumes the existing agent
		// instead of creating a new one with a different name
		// If taskId provided, include BOTH agent name and task ID so the agent:
		// 1. Uses the pre-created agent name (no duplicate creation)
		// 2. Starts working on the specific task immediately
		const initialPrompt = taskId
			? `/jat:start ${agentName} ${taskId}`  // Agent name + task (prevents duplicate agent)
			: `/jat:start ${agentName}`;  // Planning mode - just register agent

		// Wait for Claude to initialize with verification
		// Check that Claude Code TUI is running (not just bash prompt)
		// Get configurable timeout from JAT config (defaults to CLAUDE_STARTUP_TIMEOUT_SECONDS)
		const jatDefaults = await getJatDefaults();
		const maxWaitSeconds = jatDefaults.claude_startup_timeout || 20;
		const checkIntervalMs = 500;
		let claudeReady = false;
		let shellPromptDetected = false;

		for (let waited = 0; waited < maxWaitSeconds * 1000 && !claudeReady; waited += checkIntervalMs) {
			await new Promise(resolve => setTimeout(resolve, checkIntervalMs));

			try {
				const { stdout: paneOutput } = await execAsync(
					`tmux capture-pane -t "${sessionName}" -p 2>/dev/null`
				);

				// Check if Claude is running (has Claude Code patterns)
				const hasClaudePatterns = CLAUDE_READY_PATTERNS.some(p => paneOutput.includes(p));

				// Check if we're at a shell prompt (Claude never started or exited)
				// Only flag as shell prompt if:
				// 1. We see shell patterns
				// 2. The output does NOT contain 'claude' (to avoid false positives during startup)
				// 3. We've waited at least 3 seconds (give claude command time to start)
				const outputLowercase = paneOutput.toLowerCase();
				const hasShellPatterns = SHELL_PROMPT_PATTERNS.some(p => paneOutput.includes(p));
				const mentionsClaude = outputLowercase.includes('claude');
				const isLikelyShellPrompt = hasShellPatterns && !mentionsClaude && waited > 3000;

				if (hasClaudePatterns) {
					claudeReady = true;
					console.log(`[spawn] Claude Code ready after ${waited}ms`);
				} else if (isLikelyShellPrompt && waited > 5000) {
					// If we see shell prompt after 5s, Claude likely failed to start
					shellPromptDetected = true;
					console.error(`[spawn] Claude Code failed to start - detected shell prompt`);
					console.error(`[spawn] Terminal output (last 300 chars): ${stripAnsi(paneOutput.slice(-300))}`);
					break;
				}
			} catch {
				// Session might not exist yet, continue waiting
			}
		}

		// CRITICAL: Don't send /jat:start if Claude isn't ready - it will go to bash!
		if (!claudeReady) {
			if (shellPromptDetected) {
				// Shell prompt detected - Claude definitely didn't start
				console.error(`[spawn] ABORTING: Claude Code did not start (shell prompt detected)`);
				return json({
					error: 'Claude Code failed to start',
					message: 'Claude Code did not start within the timeout period. The session was created but Claude is not running. Try attaching to the terminal manually.',
					sessionName,
					agentName,
					taskId,
					recoveryHint: `Try: tmux attach-session -t ${sessionName}`
				}, { status: 500 });
			}
			// No shell prompt but no Claude patterns either - might still be starting
			console.warn(`[spawn] Claude Code may not have started properly after ${maxWaitSeconds}s, proceeding with caution`);
		}

		/**
		 * Send the initial prompt with retry logic
		 *
		 * CRITICAL: Claude Code's TUI doesn't reliably process Enter when sent
		 * in the same tmux send-keys command as the text. The fix is to:
		 * 1. Send text first (without Enter)
		 * 2. Brief delay for text to be fully typed
		 * 3. Send Enter separately
		 *
		 * This mimics how a human would type - text first, then press Enter.
		 */
		const escapedPrompt = initialPrompt.replace(/"/g, '\\"').replace(/\$/g, '\\$');
		const maxRetries = 3;
		let commandSent = false;

		for (let attempt = 1; attempt <= maxRetries && !commandSent; attempt++) {
			try {
				// Step 1: Send text WITHOUT Enter
				await execAsync(`tmux send-keys -t "${sessionName}" -- "${escapedPrompt}"`);

				// Step 2: Brief delay for text to be fully received by Claude's TUI
				await new Promise(resolve => setTimeout(resolve, 100));

				// Step 3: Send Enter SEPARATELY - this is the key fix!
				await execAsync(`tmux send-keys -t "${sessionName}" Enter`);

				// Wait a moment for the command to be processed
				await new Promise(resolve => setTimeout(resolve, 1500));

				// Check if the command was executed by looking for "is running" in output
				// (Claude Code shows "jat:start is running…" when slash command executes)
				const { stdout: paneOutput } = await execAsync(
					`tmux capture-pane -t "${sessionName}" -p 2>/dev/null | tail -20`
				);

				if (paneOutput.includes('is running') || paneOutput.includes('STARTING')) {
					commandSent = true;
					console.log(`[spawn] Initial prompt sent successfully on attempt ${attempt}`);
				} else if (attempt < maxRetries) {
					// Command might not have executed - use Ctrl-C to clear input then retry
					console.log(`[spawn] Attempt ${attempt}: Command may not have executed, retrying...`);
					await execAsync(`tmux send-keys -t "${sessionName}" C-c`);  // Clear with Ctrl-C
					await new Promise(resolve => setTimeout(resolve, 500));
				}
			} catch (err) {
				// Non-fatal - session is created, prompt just failed
				console.error(`[spawn] Attempt ${attempt} failed:`, err);
				if (attempt < maxRetries) {
					await new Promise(resolve => setTimeout(resolve, 1000));
				}
			}
		}

		if (!commandSent) {
			console.warn(`[spawn] Initial prompt may not have been executed after ${maxRetries} attempts`);
		}

		// Step 4c: If imagePath provided, wait for agent to start working, then send the image
		// This gives the agent context (e.g., bug screenshot) after it has initialized
		if (imagePath) {
			// Wait for the agent to fully start and be ready for input
			await new Promise(resolve => setTimeout(resolve, 8000));

			try {
				// Send the image path as input - the agent can then view it with Read tool
				// Use same pattern as above: text first, then Enter separately
				const escapedPath = imagePath.replace(/"/g, '\\"').replace(/\$/g, '\\$');
				await execAsync(`tmux send-keys -t "${sessionName}" -- "${escapedPath}"`);
				await new Promise(resolve => setTimeout(resolve, 100));
				await execAsync(`tmux send-keys -t "${sessionName}" Enter`);
				console.log(`[spawn] Sent image path to session ${sessionName}: ${imagePath}`);
			} catch (err) {
				// Non-fatal - image send failed but session is still running
				console.error('Failed to send image path:', err);
			}
		}

		// Step 4b: If attach requested, open terminal window
		if (attach) {
			try {
				// Find available terminal
				const { stdout: whichResult } = await execAsync('which alacritty kitty gnome-terminal konsole xterm 2>/dev/null | head -1 || true');
				const terminalPath = whichResult.trim();

				if (terminalPath) {
					const { spawn } = await import('child_process');
					let child;

					if (terminalPath.includes('alacritty')) {
						child = spawn('alacritty', ['--title', `tmux: ${sessionName}`, '-e', 'tmux', 'attach-session', '-t', sessionName], {
							detached: true,
							stdio: 'ignore'
						});
					} else if (terminalPath.includes('kitty')) {
						child = spawn('kitty', ['--title', `tmux: ${sessionName}`, 'tmux', 'attach-session', '-t', sessionName], {
							detached: true,
							stdio: 'ignore'
						});
					} else if (terminalPath.includes('gnome-terminal')) {
						child = spawn('gnome-terminal', ['--title', `tmux: ${sessionName}`, '--', 'tmux', 'attach-session', '-t', sessionName], {
							detached: true,
							stdio: 'ignore'
						});
					} else if (terminalPath.includes('konsole')) {
						child = spawn('konsole', ['--new-tab', '-e', 'tmux', 'attach-session', '-t', sessionName], {
							detached: true,
							stdio: 'ignore'
						});
					} else {
						child = spawn('xterm', ['-title', `tmux: ${sessionName}`, '-e', 'tmux', 'attach-session', '-t', sessionName], {
							detached: true,
							stdio: 'ignore'
						});
					}

					child.unref();
				}
			} catch (err) {
				// Non-fatal - session is created, terminal just didn't open
				console.error('Failed to attach terminal:', err);
			}
		}

		// Step 5: Get full task data from Beads (if taskId provided)
		// This ensures the response has complete task info (title, description, etc.)
		// which allows the SessionCard to display immediately without waiting for cache refresh
		let fullTask = null;
		if (taskId) {
			try {
				const foundTask = getTaskById(taskId);
				if (foundTask) {
					fullTask = {
						id: foundTask.id,
						title: foundTask.title,
						description: foundTask.description,
						status: foundTask.status,
						priority: foundTask.priority,
						issue_type: foundTask.issue_type
					};
				}
			} catch (err) {
				// Non-fatal - fall back to minimal task data
				console.warn('[spawn] Could not fetch full task data:', err);
				fullTask = { id: taskId };
			}
		}

		// Step 6: Determine project name from projectPath for session grouping
		// Extract project name from path (e.g., "/home/jw/code/jat" -> "jat")
		const projectName = projectPath.split('/').filter(Boolean).pop() || null;

		// Step 7: Return WorkSession
		return json({
			success: true,
			session: {
				sessionName,
				agentName,
				task: fullTask,
				project: projectName,  // Include project for session grouping on /work page
				imagePath: imagePath || null,
				output: '',
				lineCount: 0,
				tokens: 0,
				cost: 0,
				created: new Date().toISOString(),
				attached: attach
			},
			message: taskId
				? `Spawned agent ${agentName} for task ${taskId}${imagePath ? ' (with attached image)' : ''}`
				: `Spawned planning session for agent ${agentName}`,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error in POST /api/work/spawn:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
