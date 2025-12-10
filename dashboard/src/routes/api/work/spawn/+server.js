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
	AGENT_MAIL_URL
} from '$lib/config/spawnConfig.js';
import { getTaskById } from '$lib/server/beads.js';

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
		// 1. If explicit project provided, use it
		// 2. If taskId provided, infer from prefix (e.g., "jomarchy-abc" → ~/code/jomarchy)
		// 3. Fall back to current project (jat)
		let projectPath = project;
		let inferredFromTaskId = false;

		if (!projectPath && taskId) {
			// Task IDs follow format: {project}-{hash}
			const taskPrefix = taskId.split('-')[0];
			if (taskPrefix && taskPrefix !== 'jat') {
				// Infer project path from task ID prefix
				const inferredPath = `${process.env.HOME}/code/${taskPrefix}`;
				// Validate the inferred directory exists
				if (existsSync(inferredPath)) {
					projectPath = inferredPath;
					inferredFromTaskId = true;
				} else {
					console.warn(`[spawn] Inferred project path ${inferredPath} does not exist, falling back to current project`);
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

		// Build the claude command
		let claudeCmd = `cd "${projectPath}"`;
		claudeCmd += ` && AGENT_MAIL_URL="${AGENT_MAIL_URL}"`;
		claudeCmd += ` claude --model ${model}`;

		if (DANGEROUSLY_SKIP_PERMISSIONS) {
			claudeCmd += ' --dangerously-skip-permissions';
		}

		const createSessionCmd = `tmux new-session -d -s "${sessionName}" -c "${projectPath}" && tmux send-keys -t "${sessionName}" "${claudeCmd}" Enter`;

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

		await new Promise(resolve => setTimeout(resolve, 5000));

		try {
			// Escape special characters for shell - match the pattern from /api/work/[sessionId]/input
			const escapedPrompt = initialPrompt.replace(/"/g, '\\"').replace(/\$/g, '\\$');
			// Send text and Enter as ONE command to avoid race conditions
			// (Previously sent as two separate commands which caused Enter to be lost sometimes)
			await execAsync(`tmux send-keys -t "${sessionName}" -- "${escapedPrompt}" Enter`);
		} catch (err) {
			// Non-fatal - session is created, prompt just failed
			console.error('Failed to send initial prompt:', err);
		}

		// Step 4c: If imagePath provided, wait for agent to start working, then send the image
		// This gives the agent context (e.g., bug screenshot) after it has initialized
		if (imagePath) {
			// Wait for the agent to fully start and be ready for input
			await new Promise(resolve => setTimeout(resolve, 8000));

			try {
				// Send the image path as input - the agent can then view it with Read tool
				// Escape special characters and send text+Enter as ONE command
				const escapedPath = imagePath.replace(/"/g, '\\"').replace(/\$/g, '\\$');
				await execAsync(`tmux send-keys -t "${sessionName}" -- "${escapedPath}" Enter`);
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

		// Step 6: Return WorkSession
		return json({
			success: true,
			session: {
				sessionName,
				agentName,
				task: fullTask,
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
