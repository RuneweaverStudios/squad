/**
 * Session Attach API
 * POST /api/sessions/[name]/attach - Attach to an existing tmux session
 *
 * Creates a new window in the parent tmux session (server-jat or configurable)
 * that attaches to the specified agent session. This keeps all sessions organized
 * within tmux for IDE tracking.
 *
 * Unlike resume, this assumes the session already exists (agent is online).
 */

import { json } from '@sveltejs/kit';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const execAsync = promisify(exec);

/**
 * Session name prefix for JAT agent sessions
 */
const SESSION_PREFIX = 'jat-';

/**
 * Default parent session names to try (in order of preference)
 * server-jat is the naming convention for the IDE dev server
 */
const DEFAULT_PARENT_SESSIONS = ['server-jat', 'jat'];

/**
 * Get the full tmux session name from a name parameter.
 * @param {string} name - Agent name or full session name
 * @returns {{ agentName: string, sessionName: string }}
 */
function resolveSessionName(name) {
	if (name.startsWith(SESSION_PREFIX)) {
		return {
			agentName: name.slice(SESSION_PREFIX.length),
			sessionName: name
		};
	}
	return {
		agentName: name,
		sessionName: `${SESSION_PREFIX}${name}`
	};
}

/**
 * Check if a tmux session exists
 * @param {string} sessionName - tmux session name
 * @returns {Promise<boolean>}
 */
async function sessionExists(sessionName) {
	try {
		await execAsync(`tmux has-session -t "${sessionName}" 2>/dev/null`);
		return true;
	} catch {
		return false;
	}
}

/**
 * Find the parent tmux session to create windows in
 * @param {string[]} candidates - Session names to try
 * @returns {Promise<string | null>}
 */
async function findParentSession(candidates) {
	for (const name of candidates) {
		if (await sessionExists(name)) {
			return name;
		}
	}
	return null;
}

/**
 * Find the project for a session by looking up agent files across projects
 * @param {string} agentName - Agent name to look up
 * @returns {Promise<string | null>} Project name or null
 */
async function findProjectForAgent(agentName) {
	const codeDir = join(homedir(), 'code');
	if (!existsSync(codeDir)) return null;

	try {
		const projects = readdirSync(codeDir, { withFileTypes: true })
			.filter(d => d.isDirectory() && !d.name.startsWith('.'))
			.map(d => d.name);

		for (const project of projects) {
			const sessionsDir = join(codeDir, project, '.claude', 'sessions');
			const claudeDir = join(codeDir, project, '.claude');

			// Check sessions directory
			if (existsSync(sessionsDir)) {
				const files = readdirSync(sessionsDir)
					.filter(f => f.startsWith('agent-') && f.endsWith('.txt'));
				for (const file of files) {
					const content = readFileSync(join(sessionsDir, file), 'utf-8').trim();
					if (content === agentName) {
						return project;
					}
				}
			}

			// Check legacy location
			if (existsSync(claudeDir)) {
				const files = readdirSync(claudeDir)
					.filter(f => f.startsWith('agent-') && f.endsWith('.txt'));
				for (const file of files) {
					const content = readFileSync(join(claudeDir, file), 'utf-8').trim();
					if (content === agentName) {
						return project;
					}
				}
			}
		}
	} catch {
		// Ignore errors
	}

	return null;
}

/**
 * Check if Hyprland is available
 */
async function isHyprlandAvailable() {
	try {
		await execAsync('command -v hyprctl', { timeout: 1000 });
		return true;
	} catch {
		return false;
	}
}

/**
 * Get all Hyprland window addresses
 * @returns {Promise<Set<string>>}
 */
async function getHyprlandWindowAddresses() {
	try {
		const { stdout } = await execAsync('hyprctl clients -j', { timeout: 5000 });
		const clients = JSON.parse(stdout);
		return new Set(clients.map((/** @type {{address: string}} */ c) => c.address));
	} catch {
		return new Set();
	}
}

/**
 * Apply border color directly to a window by address
 * @param {string} address - Window address
 * @param {string} activeColor - Active border color
 * @param {string} inactiveColor - Inactive border color
 */
async function applyBorderColorToWindow(address, activeColor, inactiveColor) {
	try {
		if (activeColor) {
			await execAsync(
				`hyprctl dispatch setprop "address:${address}" activebordercolor "${activeColor}"`,
				{ timeout: 2000 }
			);
		}
		if (inactiveColor) {
			await execAsync(
				`hyprctl dispatch setprop "address:${address}" inactivebordercolor "${inactiveColor}"`,
				{ timeout: 2000 }
			);
		}
		return true;
	} catch {
		return false;
	}
}

/**
 * Get project colors from config
 * @param {string} projectName
 * @returns {Promise<{activeColor: string, inactiveColor: string} | null>}
 */
async function getProjectColors(projectName) {
	try {
		const configPath = join(homedir(), '.config', 'jat', 'projects.json');
		if (!existsSync(configPath)) return null;

		const config = JSON.parse(readFileSync(configPath, 'utf-8'));
		const projectConfig = config.projects?.[projectName];
		if (!projectConfig?.active_color) return null;

		// Normalize colors to rgb() format
		const normalize = (/** @type {string} */ c) => {
			if (!c) return '';
			if (c.startsWith('rgb(')) return c;
			if (c.startsWith('#')) return `rgb(${c.slice(1)})`;
			return `rgb(${c})`;
		};

		return {
			activeColor: normalize(projectConfig.active_color),
			inactiveColor: normalize(projectConfig.inactive_color)
		};
	} catch {
		return null;
	}
}

/**
 * Get the currently active/focused Hyprland window address
 * @returns {Promise<string | null>}
 */
async function getActiveWindowAddress() {
	try {
		const { stdout } = await execAsync('hyprctl activewindow -j', { timeout: 2000 });
		const activeWindow = JSON.parse(stdout);
		return activeWindow?.address || null;
	} catch {
		return null;
	}
}

/**
 * Find Hyprland window by matching tmux client PID
 * @param {string} parentSession - tmux session name to find client for
 * @returns {Promise<string | null>} Window address or null
 */
async function findWindowByTmuxClient(parentSession) {
	try {
		// Get the PID of the terminal attached to the parent session
		const { stdout: clientInfo } = await execAsync(
			`tmux list-clients -t "${parentSession}" -F '#{client_pid}' 2>/dev/null | head -1`,
			{ timeout: 2000 }
		);
		const clientPid = clientInfo.trim();
		if (!clientPid) return null;

		// Get all Hyprland windows
		const { stdout: clientsJson } = await execAsync('hyprctl clients -j', { timeout: 5000 });
		const clients = JSON.parse(clientsJson);

		// Find window with matching PID (or parent PID for terminal emulators)
		for (const client of clients) {
			if (client.pid && (
				client.pid.toString() === clientPid ||
				client.pid.toString() === clientPid.split('\n')[0]
			)) {
				return client.address;
			}
		}

		// Also try finding by checking if client PID is a child of window PID
		// (terminal emulators spawn shells as children)
		for (const client of clients) {
			if (client.pid && client.class?.toLowerCase().includes('alacritty')) {
				try {
					const { stdout: ppid } = await execAsync(
						`ps -o ppid= -p ${clientPid} 2>/dev/null | tr -d ' '`,
						{ timeout: 1000 }
					);
					if (ppid.trim() === client.pid.toString()) {
						return client.address;
					}
				} catch {
					// Ignore
				}
			}
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * Apply Hyprland border colors to the parent session's terminal window
 * @param {string} parentSession - tmux session name
 * @param {string} projectName - Project name for colors
 */
async function applyColorsToParentSession(parentSession, projectName) {
	if (!await isHyprlandAvailable()) return;

	const colors = await getProjectColors(projectName);
	if (!colors) return;

	// Small delay to let tmux window switch complete
	await new Promise(r => setTimeout(r, 200));

	// Try to find window by tmux client
	const address = await findWindowByTmuxClient(parentSession);
	if (address) {
		const success = await applyBorderColorToWindow(address, colors.activeColor, colors.inactiveColor);
		if (success) {
			console.log(`[attach] Applied Hyprland colors to parent session window ${address}`);
		}
		return;
	}

	// Fallback: try active window (in case user focused the terminal)
	const activeAddress = await getActiveWindowAddress();
	if (activeAddress) {
		const success = await applyBorderColorToWindow(activeAddress, colors.activeColor, colors.inactiveColor);
		if (success) {
			console.log(`[attach] Applied Hyprland colors to active window ${activeAddress} (fallback)`);
		}
	}
}

/**
 * Apply Hyprland border colors to a newly spawned window
 * Waits for the window to appear and applies colors directly by address
 * @param {Set<string>} windowsBefore - Window addresses before spawn
 * @param {string} projectName - Project name for colors
 */
async function applyHyprlandColorsToNewWindow(windowsBefore, projectName) {
	if (!await isHyprlandAvailable()) return;

	const colors = await getProjectColors(projectName);
	if (!colors) return;

	// Poll for new window (up to 3 seconds)
	for (let i = 0; i < 6; i++) {
		await new Promise(r => setTimeout(r, 500));

		const windowsAfter = await getHyprlandWindowAddresses();
		const newWindows = [...windowsAfter].filter(addr => !windowsBefore.has(addr));

		if (newWindows.length > 0) {
			// Apply colors to all new windows (usually just one)
			for (const address of newWindows) {
				const success = await applyBorderColorToWindow(address, colors.activeColor, colors.inactiveColor);
				if (success) {
					console.log(`[attach] Applied Hyprland colors to new window ${address}`);
				}
			}
			return;
		}
	}

	console.log('[attach] No new Hyprland window detected');
}

/**
 * POST /api/sessions/[name]/attach
 * Attach to an existing tmux session by creating a window in the parent session
 */
/** @type {import('./$types').RequestHandler} */
export async function POST({ params }) {
	try {
		const { agentName, sessionName } = resolveSessionName(params.name);

		if (!agentName) {
			return json({
				error: 'Missing agent name',
				message: 'Agent name is required'
			}, { status: 400 });
		}

		// Verify the agent session exists
		const exists = await sessionExists(sessionName);
		if (!exists) {
			return json({
				error: 'Session not found',
				message: `tmux session '${sessionName}' does not exist. The agent may be offline.`,
				agentName,
				sessionName
			}, { status: 404 });
		}

		// Get config
		let terminal = 'auto';
		let parentSessionConfig = null;
		const configPath = `${process.env.HOME}/.config/jat/projects.json`;
		if (existsSync(configPath)) {
			try {
				const config = JSON.parse(readFileSync(configPath, 'utf-8'));
				terminal = config.defaults?.terminal || 'auto';
				parentSessionConfig = config.defaults?.parent_session || null;
			} catch (e) {
				// Use defaults
			}
		}
		// Resolve 'auto' to platform default
		if (terminal === 'auto') {
			if (process.platform === 'darwin') {
				if (existsSync('/Applications/Ghostty.app')) {
					terminal = 'ghostty';
				} else {
					terminal = existsSync('/Applications/iTerm.app') ? 'iterm2' : 'apple-terminal';
				}
			} else {
				terminal = 'alacritty';
			}
		}

		// Build list of parent session candidates
		const parentCandidates = parentSessionConfig
			? [parentSessionConfig, ...DEFAULT_PARENT_SESSIONS]
			: DEFAULT_PARENT_SESSIONS;

		// Find the parent session
		const parentSession = await findParentSession(parentCandidates);

		if (parentSession) {
			// Create a new window in the parent session that attaches to the agent session
			// The window title shows the agent name for easy identification
			const windowName = agentName;
			const attachCommand = `tmux attach-session -t "${sessionName}"`;

			try {
				await execAsync(`tmux new-window -t "${parentSession}" -n "${windowName}" "bash -c '${attachCommand}'"`);

				// Apply Hyprland colors to the parent session's terminal window
				const projectName = await findProjectForAgent(agentName);
				if (projectName) {
					// Run in background - don't block response
					applyColorsToParentSession(parentSession, projectName);
				}

				return json({
					success: true,
					agentName,
					sessionName,
					parentSession,
					windowName,
					method: 'tmux-window',
					message: `Created window '${windowName}' in ${parentSession} attached to ${sessionName}`,
					timestamp: new Date().toISOString()
				});
			} catch (e) {
				console.error('Failed to create tmux window:', e);
				// Fall through to terminal fallback
			}
		}

		// Fallback: spawn new terminal window if no parent session found
		const attachCommand = `tmux attach-session -t "${sessionName}"`;
		// Find project for this agent to use project-specific title
		const foundProject = await findProjectForAgent(agentName);
		const displayName = foundProject ? foundProject.toUpperCase() : 'JAT';
		const windowTitle = `${displayName}: ${sessionName}`;

		// Capture window addresses before spawning terminal for color application
		const windowsBeforeTerminal = await getHyprlandWindowAddresses();

		let child;
		switch (terminal) {
			case 'apple-terminal':
				child = spawn('osascript', ['-e', `
					tell application "Terminal"
						do script "bash -c '${attachCommand}'"
						set custom title of front window to "${windowTitle}"
						activate
					end tell
				`], { detached: true, stdio: 'ignore' });
				break;
			case 'iterm2':
				child = spawn('osascript', ['-e', `
					tell application "iTerm"
						create window with default profile command "bash -c '${attachCommand}'"
						tell current session of current window
							set name to "${windowTitle}"
						end tell
					end tell
				`], { detached: true, stdio: 'ignore' });
				break;
			case 'ghostty':
				if (process.platform === 'darwin') {
					child = spawn('ghostty', ['+new-window', '-e', 'bash', '-c', attachCommand], {
						detached: true, stdio: 'ignore'
					});
				} else {
					child = spawn('ghostty', ['--title=' + windowTitle, '-e', 'bash', '-c', attachCommand], {
						detached: true, stdio: 'ignore'
					});
				}
				break;
			case 'alacritty':
				child = spawn('alacritty', ['-T', windowTitle, '-e', 'bash', '-c', attachCommand], {
					detached: true,
					stdio: 'ignore'
				});
				break;
			case 'kitty':
				child = spawn('kitty', ['--title', windowTitle, 'bash', '-c', attachCommand], {
					detached: true,
					stdio: 'ignore'
				});
				break;
			case 'gnome-terminal':
				child = spawn('gnome-terminal', ['--title', windowTitle, '--', 'bash', '-c', attachCommand], {
					detached: true,
					stdio: 'ignore'
				});
				break;
			case 'konsole':
				child = spawn('konsole', ['-p', `tabtitle=${windowTitle}`, '-e', 'bash', '-c', attachCommand], {
					detached: true,
					stdio: 'ignore'
				});
				break;
			default:
				child = spawn('xterm', ['-T', windowTitle, '-e', 'bash', '-c', attachCommand], {
					detached: true,
					stdio: 'ignore'
				});
		}

		child.unref();

		// Apply Hyprland colors to new window (detect by address diff)
		if (foundProject) {
			// Run in background - don't block response
			applyHyprlandColorsToNewWindow(windowsBeforeTerminal, foundProject);
		}

		return json({
			success: true,
			agentName,
			sessionName,
			terminal,
			method: 'terminal',
			message: `Opened terminal attached to ${sessionName}`,
			timestamp: new Date().toISOString()
		});

	} catch (error) {
		console.error('Error in POST /api/sessions/[name]/attach:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
