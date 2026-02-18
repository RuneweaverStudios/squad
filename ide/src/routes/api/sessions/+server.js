/**
 * Sessions API - List and Spawn Sessions
 * GET /api/sessions - List all tmux sessions (optionally filtered by jat- prefix)
 * POST /api/sessions - Spawn a new Claude Code session
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync } from 'fs';
import {
	DEFAULT_MODEL,
	AGENT_MAIL_URL
} from '$lib/config/spawnConfig.js';
import { getJatDefaults } from '$lib/server/projectPaths.js';
import { CLAUDE_READY_PATTERNS, SHELL_PROMPT_PATTERNS } from '$lib/server/shellPatterns.js';
import { stripAnsi } from '$lib/utils/ansiToHtml.js';
import { singleFlight, cacheKey } from '$lib/server/cache.js';

const execAsync = promisify(exec);

/**
 * Check if session is a resumed session
 * @param {string} sessionName - tmux session name
 * @returns {{ resumed: boolean, originalSessionId?: string, resumedAt?: string } | null}
 */
function getResumeInfo(sessionName) {
	const resumeFile = `/tmp/jat-resumed-${sessionName}.json`;
	try {
		if (!existsSync(resumeFile)) {
			return null;
		}
		const content = readFileSync(resumeFile, 'utf-8');
		const data = JSON.parse(content);
		return {
			resumed: true,
			originalSessionId: data.originalSessionId,
			resumedAt: data.resumedAt
		};
	} catch {
		return null;
	}
}

/**
 * Read project from signal file for a session
 * @param {string} sessionName - tmux session name
 * @returns {string|null} Project name or null if not found
 */
function getProjectFromSignal(sessionName) {
	const signalFile = `/tmp/jat-signal-tmux-${sessionName}.json`;
	try {
		if (!existsSync(signalFile)) {
			return null;
		}
		const content = readFileSync(signalFile, 'utf-8');
		const signal = JSON.parse(content);

		// Try direct project field (from startingSignal)
		if (signal.project) {
			return signal.project;
		}

		// Try extracting from taskId (e.g., "steelbridge-abc" -> "steelbridge")
		if (signal.taskId && signal.taskId.includes('-')) {
			return signal.taskId.split('-')[0];
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * Get project from tmux session's working directory
 * @param {string} sessionName - tmux session name
 * @returns {Promise<string|null>} Project name or null
 */
async function getProjectFromTmuxCwd(sessionName) {
	try {
		const { stdout } = await execAsync(`tmux display-message -t "${sessionName}" -p '#{pane_current_path}'`);
		const cwd = stdout.trim();
		// Extract project name from path like /home/user/code/steelbridge -> steelbridge
		if (cwd && cwd.includes('/code/')) {
			const parts = cwd.split('/code/');
			if (parts[1]) {
				// Get first path segment after /code/
				return parts[1].split('/')[0];
			}
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * GET /api/sessions
 * List all tmux sessions
 * Query params:
 * - filter: 'jat' to only show jat-* sessions (default), 'all' for all sessions
 */
/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
	let filter = 'jat';
	try {
		filter = url.searchParams.get('filter') || 'jat';
		const key = cacheKey('sessions', { filter });

		// singleFlight: cache + deduplication. Sessions endpoint runs tmux
		// display-message per session for project detection — expensive with 33 sessions.
		const responseData = await singleFlight(key, async () => {
			// List tmux sessions with format: name:created:attached:windows
			const command = `tmux list-sessions -F "#{session_name}:#{session_created}:#{session_attached}:#{session_windows}"`;

			try {
				const { stdout } = await execAsync(command);

				const rawSessions = stdout
					.trim()
					.split('\n')
					.filter(line => line.length > 0)
					.map(line => {
						const [name, created, attached, windows] = line.split(':');
						return {
							name,
							created: new Date(parseInt(created, 10) * 1000).toISOString(),
							attached: parseInt(attached, 10) > 0,
							windows: parseInt(windows, 10) || 1
						};
					})
					.filter(session => {
						if (filter === 'all') return true;
						return session.name.startsWith('jat-');
					});

				// Get project and resume info for each session
				const sessions = await Promise.all(
					rawSessions.map(async (session) => {
						// Try signal file first (fast, sync)
						let project = getProjectFromSignal(session.name);
						// Fall back to tmux working directory (slower, async)
						if (!project && session.name.startsWith('jat-')) {
							project = await getProjectFromTmuxCwd(session.name);
						}
						// Check if this is a resumed session
						const resumeInfo = getResumeInfo(session.name);
						return {
							...session,
							project,
							...(resumeInfo || {})
						};
					})
				);

				return {
					success: true,
					sessions,
					count: sessions.length,
					filter,
					timestamp: new Date().toISOString()
				};
			} catch (execError) {
				const execErr = /** @type {{ stderr?: string, stdout?: string, message?: string }} */ (execError);
				const errorMessage = execErr.stderr || execErr.stdout || execErr.message || String(execError);

				if (errorMessage.includes('no server running') || errorMessage.includes('no sessions')) {
					return {
						success: true,
						sessions: [],
						count: 0,
						filter,
						timestamp: new Date().toISOString()
					};
				}

				throw execError;
			}
		}, 2000); // 2s TTL — sessions change infrequently

		return json(responseData);
	} catch (error) {
		// Graceful degradation: when tmux isn't running or any other failure, return empty sessions
		const err = /** @type {Error & { code?: string }} */ (error);
		const msg = err.message || String(error);
		if (
			msg.includes('no server running') ||
			msg.includes('no sessions') ||
			msg.includes('tmux') ||
			err.code === 'ENOENT'
		) {
			return json({
				success: true,
				sessions: [],
				count: 0,
				filter,
				timestamp: new Date().toISOString()
			});
		}
		console.error('Error in GET /api/sessions:', error);
		return json({
			error: 'Internal server error',
			message: msg
		}, { status: 500 });
	}
}

/**
 * POST /api/sessions
 * Spawn a new Claude Code session
 * Body:
 * - agentName: Name for the agent (optional - will auto-generate if not provided)
 * - project: Project path (default: current project from cwd)
 * - model: Model to use (sonnet-4.5, opus-4.5, haiku)
 * - task: Optional task ID to auto-start
 * - prompt: Optional initial prompt (e.g., '/jat:start auto')
 */
/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	try {
		const body = await request.json();

		// Get JAT config defaults for skip_permissions setting
		const jatDefaults = await getJatDefaults();

		const {
			agentName,
			project,
			model = DEFAULT_MODEL,
			task,
			prompt,
			skipPermissions = jatDefaults.skip_permissions
		} = body;

		// Determine project path
		const projectPath = project || process.cwd().replace('/ide', '');

		// Generate session name
		// If agentName provided, use it directly (caller is responsible for registration)
		// Otherwise, use jat-pending-* naming so /jat:start can register and rename
		const sessionName = agentName ? `jat-${agentName}` : `jat-pending-${Date.now()}`;

		// Default tmux dimensions for proper terminal output width
		// 80 columns is the standard terminal width that Claude Code expects
		// 40 rows provides good vertical context for terminal output
		const TMUX_INITIAL_WIDTH = 80;
		const TMUX_INITIAL_HEIGHT = 40;

		// Build the claude command with proper flags
		let claudeCmd = `cd "${projectPath}"`;

		// Set AGENT_MAIL_URL environment variable
		claudeCmd += ` && AGENT_MAIL_URL="${AGENT_MAIL_URL}"`;

		// Claude with model
		claudeCmd += ` claude --model ${model}`;

		// Add dangerous skip permissions for autonomous operation
		if (skipPermissions) {
			claudeCmd += ' --dangerously-skip-permissions';
		}

		// Build initial prompt - task takes priority, then prompt, then default auto
		let initialPrompt;
		if (task) {
			initialPrompt = `/jat:start ${task}`;
		} else if (prompt) {
			initialPrompt = prompt;
		} else {
			initialPrompt = '/jat:start auto';
		}

		// Create tmux session with Claude Code with explicit dimensions
		// Use send-keys to run claude after session creation
		// Sleep allows shell to initialize before sending keys - prevents race condition
		// where keys are sent before shell is ready to receive them
		const command = `tmux new-session -d -s "${sessionName}" -x ${TMUX_INITIAL_WIDTH} -y ${TMUX_INITIAL_HEIGHT} -c "${projectPath}" && sleep 0.3 && tmux send-keys -t "${sessionName}" "${claudeCmd}" Enter`;

		try {
			await execAsync(command);

			// Wait for Claude to fully start, then send the initial prompt
			// Verify Claude Code TUI is running before sending prompt
			if (initialPrompt) {
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

						const hasClaudePatterns = CLAUDE_READY_PATTERNS.some(p => paneOutput.includes(p));
						const outputLowercase = paneOutput.toLowerCase();
						const hasShellPatterns = SHELL_PROMPT_PATTERNS.some(p => paneOutput.includes(p));
						const mentionsClaude = outputLowercase.includes('claude');
						const isLikelyShellPrompt = hasShellPatterns && !mentionsClaude && waited > 3000;

						if (hasClaudePatterns) {
							claudeReady = true;
							console.log(`[sessions] Claude Code ready after ${waited}ms`);
						} else if (isLikelyShellPrompt && waited > 5000) {
							shellPromptDetected = true;
							console.error(`[sessions] Claude Code failed to start - detected shell prompt`);
							console.error(`[sessions] Terminal output (last 300 chars): ${stripAnsi(paneOutput.slice(-300))}`);
							break;
						}
					} catch {
						// Session might not exist yet, continue waiting
					}
				}

				// CRITICAL: Don't send /jat:start if Claude isn't ready - it will go to bash!
				if (!claudeReady) {
					if (shellPromptDetected) {
						console.error(`[sessions] ABORTING: Claude Code did not start (shell prompt detected)`);
						return json({
							error: 'Claude Code failed to start',
							message: 'Claude Code did not start within the timeout period. The session was created but Claude is not running. Try attaching to the terminal manually.',
							sessionName,
							agentName: agentName || sessionName.replace('jat-', ''),
							recoveryHint: `Try: tmux attach-session -t ${sessionName}`
						}, { status: 500 });
					}
					console.warn(`[sessions] Claude Code may not have started properly after ${maxWaitSeconds}s, proceeding with caution`);
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
						await execAsync(`tmux send-keys -t "${sessionName}" -- "${escapedPrompt}"`);
						await new Promise(resolve => setTimeout(resolve, 100));
						await execAsync(`tmux send-keys -t "${sessionName}" Enter`);

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
							`tmux capture-pane -t "${sessionName}" -p -S -40 -E -4 2>/dev/null`
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
							console.log(`[sessions] Initial prompt sent successfully on attempt ${attempt}`);
						} else if (attempt < maxRetries) {
							// Check if command is still sitting in input buffer (separate capture for input area)
							// Use -S -4 -E -1 to capture just the input line area (skip only statusline)
							const { stdout: inputArea } = await execAsync(
								`tmux capture-pane -t "${sessionName}" -p -S -4 -E -1 2>/dev/null`
							);

							const inputStillVisible = inputArea.includes(initialPrompt) &&
								!inputArea.includes('is running');

							if (inputStillVisible) {
								// Command is still in input buffer - try sending Enter again
								console.log(`[sessions] Attempt ${attempt}: Command visible in input, sending Enter again...`);
								await execAsync(`tmux send-keys -t "${sessionName}" Enter`);
								await new Promise(resolve => setTimeout(resolve, 500));
							} else {
								// Command was likely received, just taking time to show "is running"
								// DO NOT send Ctrl-C - it will interrupt in-flight bash commands
								console.log(`[sessions] Attempt ${attempt}: Command likely in progress, waiting...`);
								await new Promise(resolve => setTimeout(resolve, 2000));
							}
						}
					} catch (err) {
						console.error(`[sessions] Attempt ${attempt} failed:`, err);
						if (attempt < maxRetries) {
							await new Promise(resolve => setTimeout(resolve, 1000));
						}
					}
				}

				if (!commandSent) {
					console.warn(`[sessions] Initial prompt may not have been executed after ${maxRetries} attempts`);
				}
			}

			return json({
				success: true,
				sessionName,
				agentName: agentName || sessionName.replace('jat-', ''),
				project: projectPath,
				model,
				task: task || null,
				prompt: initialPrompt,
				message: `Session ${sessionName} created successfully`,
				timestamp: new Date().toISOString()
			});
		} catch (execError) {
			const execErr = /** @type {{ stderr?: string, message?: string }} */ (execError);
			const errorMessage = execErr.stderr || execErr.message || String(execError);

			// Check if session already exists
			if (errorMessage.includes('duplicate session')) {
				return json({
					error: 'Session already exists',
					message: `Session '${sessionName}' already exists`,
					sessionName
				}, { status: 409 });
			}

			return json({
				error: 'Failed to create session',
				message: errorMessage,
				sessionName
			}, { status: 500 });
		}
	} catch (error) {
		console.error('Error in POST /api/sessions:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
