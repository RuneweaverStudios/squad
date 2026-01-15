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
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import Database from 'better-sqlite3';
import {
	DEFAULT_MODEL,
	AGENT_MAIL_URL,
	CLAUDE_STARTUP_TIMEOUT_SECONDS
} from '$lib/config/spawnConfig.js';
import { getTaskById } from '$lib/server/beads.js';
import { getProjectPath, getJatDefaults } from '$lib/server/projectPaths.js';
import { CLAUDE_READY_PATTERNS, SHELL_PROMPT_PATTERNS, isYoloWarningDialog } from '$lib/server/shellPatterns.js';
import { stripAnsi } from '$lib/utils/ansiToHtml.js';

const DB_PATH = process.env.AGENT_MAIL_DB || `${process.env.HOME}/.agent-mail.db`;

// Name components - nature/geography themed words
// 72 adjectives × 72 nouns = 5,184 unique combinations
const ADJECTIVES = [
	// Temperature/Texture (16)
	'Swift', 'Calm', 'Warm', 'Cool', 'Soft', 'Hard', 'Smooth', 'Rough',
	'Sharp', 'Dense', 'Thin', 'Thick', 'Crisp', 'Mild', 'Brisk', 'Gentle',
	// Light/Color (16)
	'Bright', 'Dark', 'Light', 'Pale', 'Vivid', 'Muted', 'Stark', 'Dim',
	'Gold', 'Silver', 'Azure', 'Amber', 'Russet', 'Ivory', 'Jade', 'Coral',
	// Size/Scale (16)
	'Grand', 'Great', 'Vast', 'Wide', 'Broad', 'Deep', 'High', 'Tall',
	'Long', 'Far', 'Near', 'Open', 'Steep', 'Sheer', 'Flat', 'Round',
	// Quality/Character (16)
	'Bold', 'Keen', 'Wise', 'Fair', 'True', 'Pure', 'Free', 'Wild',
	'Clear', 'Fresh', 'Fine', 'Good', 'Rich', 'Full', 'Whole', 'Prime',
	// Weather/Time (8)
	'Sunny', 'Misty', 'Windy', 'Rainy', 'Early', 'Late', 'First', 'Last'
];

const NOUNS = [
	// Water Bodies (16)
	'River', 'Ocean', 'Lake', 'Stream', 'Creek', 'Brook', 'Pond', 'Falls',
	'Bay', 'Cove', 'Gulf', 'Inlet', 'Fjord', 'Strait', 'Marsh', 'Spring',
	// Land Features (16)
	'Mountain', 'Valley', 'Canyon', 'Gorge', 'Ravine', 'Basin', 'Plateau', 'Mesa',
	'Hill', 'Ridge', 'Cliff', 'Bluff', 'Ledge', 'Shelf', 'Slope', 'Terrace',
	// Vegetation (16)
	'Forest', 'Woods', 'Grove', 'Glade', 'Thicket', 'Copse', 'Orchard', 'Garden',
	'Prairie', 'Meadow', 'Field', 'Plain', 'Heath', 'Moor', 'Steppe', 'Savanna',
	// Coastal (8)
	'Shore', 'Coast', 'Beach', 'Dune', 'Cape', 'Point', 'Isle', 'Reef',
	// Atmospheric (8)
	'Cloud', 'Storm', 'Wind', 'Mist', 'Frost', 'Dawn', 'Dusk', 'Horizon',
	// Geological (8)
	'Stone', 'Rock', 'Boulder', 'Pebble', 'Sand', 'Clay', 'Slate', 'Granite'
];

/**
 * Get existing agent names from database for collision checking
 * @returns {Set<string>} Set of existing agent names (lowercase)
 */
function getExistingAgentNames() {
	try {
		const db = new Database(DB_PATH, { readonly: true });
		const agents = /** @type {{ name: string }[]} */ (
			db.prepare('SELECT name FROM agents').all()
		);
		db.close();
		return new Set(agents.map(a => a.name.toLowerCase()));
	} catch {
		return new Set();
	}
}

/**
 * Generate a unique agent name
 * @param {Set<string>} existingNames - Set of existing agent names (lowercase)
 * @param {number} maxAttempts - Maximum generation attempts
 * @returns {string} A unique agent name
 */
function generateUniqueName(existingNames, maxAttempts = 100) {
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
		const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
		const name = adj + noun;

		if (!existingNames.has(name.toLowerCase())) {
			return name;
		}
	}

	// Fallback: append random suffix
	const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
	const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
	const suffix = Math.floor(Math.random() * 1000);
	return `${adj}${noun}${suffix}`;
}

/**
 * Get or create project in Agent Mail database
 * @param {import('better-sqlite3').Database} db - Database connection
 * @param {string} projectPath - Full project path
 * @returns {number} Project ID
 */
function getOrCreateProject(db, projectPath) {
	// Use project name as slug (last segment of path)
	const slug = projectPath.split('/').filter(Boolean).pop() || 'unknown';

	// Check if project exists
	const existing = /** @type {{ id: number } | undefined} */ (
		db.prepare('SELECT id FROM projects WHERE human_key = ?').get(projectPath)
	);
	if (existing) {
		return existing.id;
	}

	// Create project
	const result = db.prepare(
		'INSERT INTO projects (slug, human_key) VALUES (?, ?)'
	).run(slug, projectPath);

	return /** @type {number} */ (result.lastInsertRowid);
}

/**
 * Register agent in Agent Mail database
 * @param {string} agentName - Agent name
 * @param {string} projectPath - Project path
 * @param {string} model - Model name (e.g., "opus", "sonnet")
 * @returns {{ success: boolean, agentId?: number, error?: string }}
 */
function registerAgentInDb(agentName, projectPath, model) {
	try {
		const db = new Database(DB_PATH);

		try {
			const projectId = getOrCreateProject(db, projectPath);

			// Check if agent already exists for this project
			const existing = /** @type {{ id: number } | undefined} */ (
				db.prepare(
					'SELECT id FROM agents WHERE project_id = ? AND name = ?'
				).get(projectId, agentName)
			);

			if (existing) {
				// Update last_active_ts for existing agent
				db.prepare(
					"UPDATE agents SET last_active_ts = datetime('now'), model = ? WHERE id = ?"
				).run(model, existing.id);
				return { success: true, agentId: existing.id };
			}

			// Insert new agent
			const result = db.prepare(`
				INSERT INTO agents (project_id, name, program, model, task_description)
				VALUES (?, ?, 'claude-code', ?, '')
			`).run(projectId, agentName, model);

			return { success: true, agentId: /** @type {number} */ (result.lastInsertRowid) };
		} finally {
			db.close();
		}
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

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
		projectPath = projectPath || process.cwd().replace('/ide', '');

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

		// Get JAT config defaults (used for skip_permissions, timeout, etc.)
		const jatDefaults = await getJatDefaults();

		// Step 1: Generate unique agent name and register in Agent Mail database
		const existingNames = getExistingAgentNames();
		const agentName = generateUniqueName(existingNames);

		// Register agent in Agent Mail SQLite database
		const registerResult = registerAgentInDb(agentName, projectPath, model);
		if (!registerResult.success) {
			console.error('Failed to register agent:', registerResult.error);
			return json({
				error: 'Failed to register agent',
				message: registerResult.error
			}, { status: 500 });
		}
		console.log(`[spawn] Registered agent ${agentName} in Agent Mail database (id: ${registerResult.agentId})`)

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

		// Step 3a: Write agent identity file for session-start hook to restore
		// The hook (session-start-restore-agent.sh) uses this to set up .claude/sessions/agent-{sessionId}.txt
		// We use tmux session name as the key since that's known before Claude starts
		try {
			const sessionsDir = `${projectPath}/.claude/sessions`;
			mkdirSync(sessionsDir, { recursive: true });

			// Write a file that maps tmux session name to agent name
			// The hook can look this up using: tmux display-message -p '#S' to get session name
			const tmuxAgentFile = `${sessionsDir}/.tmux-agent-${sessionName}`;
			writeFileSync(tmuxAgentFile, agentName, 'utf-8');
			console.log(`[spawn] Wrote agent identity file: ${tmuxAgentFile}`);
		} catch (err) {
			// Non-fatal - hook will still work through other mechanisms
			console.warn('[spawn] Failed to write agent identity file:', err);
		}

		// Default tmux dimensions for proper terminal output width
		// 80 columns is the standard terminal width that Claude Code expects
		// 40 rows provides good vertical context for terminal output
		const TMUX_INITIAL_WIDTH = 80;
		const TMUX_INITIAL_HEIGHT = 40;

		// Build the claude command
		let claudeCmd = `cd "${projectPath}"`;
		claudeCmd += ` && AGENT_MAIL_URL="${AGENT_MAIL_URL}"`;
		claudeCmd += ` claude --model ${model}`;

		// Only pass --dangerously-skip-permissions if user has explicitly enabled it
		// User must accept the YOLO warning manually first, then set skip_permissions: true in config
		if (jatDefaults.skip_permissions) {
			claudeCmd += ' --dangerously-skip-permissions';
		}

		// JAT bootstrap prompt - minimal identity, commands load full docs on-demand
		// This is added via --append-system-prompt so only IDE-spawned agents get it
		const jatBootstrap = `You are a JAT agent. Run /jat:start to begin work.`;
		claudeCmd += ` --append-system-prompt '${jatBootstrap}'`;


		// Create session with explicit dimensions to ensure proper terminal width from the start
		// Without -x and -y, tmux uses default 80x24 which may not match IDE card width
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

				// Check for YOLO warning dialog (first-time --dangerously-skip-permissions)
				// This dialog blocks startup and expects user to select "1" (No) or "2" (Yes)
				// We do NOT auto-accept for liability reasons - user must read and accept themselves
				if (isYoloWarningDialog(paneOutput)) {
					console.log(`[spawn] YOLO permission warning detected - waiting for user to accept in terminal...`);
					// Return error so IDE can notify user to accept manually
					return json({
						error: 'Permission warning requires user acceptance',
						code: 'YOLO_WARNING_PENDING',
						message: 'Claude Code is showing a permissions warning dialog. Please open the terminal and accept it to continue.',
						sessionName,
						agentName,
						recoveryHint: `Run: tmux attach-session -t ${sessionName}`
					}, { status: 202 }); // 202 Accepted - request received but needs user action
				}

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

					// Use project name in title format like "JAT: Claude" for Hyprland color matching
					// The CLI uses this pattern and apply_border_color matches on "{PROJECT}:" prefix
					const displayName = projectName ? projectName.toUpperCase() : 'JAT';
					const windowTitle = `${displayName}: ${sessionName}`;

					if (terminalPath.includes('alacritty')) {
						child = spawn('alacritty', ['--title', windowTitle, '-e', 'tmux', 'attach-session', '-t', sessionName], {
							detached: true,
							stdio: 'ignore'
						});
					} else if (terminalPath.includes('kitty')) {
						child = spawn('kitty', ['--title', windowTitle, 'tmux', 'attach-session', '-t', sessionName], {
							detached: true,
							stdio: 'ignore'
						});
					} else if (terminalPath.includes('gnome-terminal')) {
						child = spawn('gnome-terminal', ['--title', windowTitle, '--', 'tmux', 'attach-session', '-t', sessionName], {
							detached: true,
							stdio: 'ignore'
						});
					} else if (terminalPath.includes('konsole')) {
						child = spawn('konsole', ['--new-tab', '-e', 'tmux', 'attach-session', '-t', sessionName], {
							detached: true,
							stdio: 'ignore'
						});
					} else {
						child = spawn('xterm', ['-title', windowTitle, '-e', 'tmux', 'attach-session', '-t', sessionName], {
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

		// Step 4d: Apply Hyprland border colors for the project
		// This colors the terminal window based on project config
		// Do this after terminal is opened (attach mode) or immediately (non-attach mode)
		// Best-effort - don't fail spawn if coloring fails
		try {
			const colorProjectName = projectName || (taskId ? taskId.split('-')[0] : null);
			if (colorProjectName) {
				// Small delay to allow terminal window to be created
				setTimeout(async () => {
					try {
						const colorResponse = await globalThis.fetch(
							`http://localhost:${process.env.PORT || 3333}/api/sessions/${sessionName}/hyprland-color?project=${colorProjectName}`,
							{ method: 'POST' }
						);
						if (colorResponse.ok) {
							const colorResult = await colorResponse.json();
							console.log(`[spawn] Hyprland colors applied: ${colorResult.windowsUpdated || 0} windows`);
						}
					} catch (err) {
						// Silent - Hyprland coloring is optional
					}
				}, 1000);
			}
		} catch {
			// Silent - Hyprland coloring is optional
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
