/**
 * Server-side tmux session management
 * Wraps tmux CLI commands for managing jat-{AgentName} sessions
 */

import { execSync, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * @typedef {Object} Session
 * @property {string} name - Session name (e.g., "jat-WisePrairie")
 * @property {string} agentName - Agent name extracted from session name
 * @property {number} windows - Number of windows in session
 * @property {string} created - Creation timestamp
 * @property {boolean} attached - Whether session is currently attached
 */

/**
 * @typedef {Object} SpawnOptions
 * @property {string} [workingDir] - Working directory for the session
 * @property {string} [command] - Initial command to run (default: bash)
 * @property {number} [width] - Terminal width (default: 120)
 * @property {number} [height] - Terminal height (default: 40)
 */

/**
 * Session name prefix for JAT agent sessions
 */
const SESSION_PREFIX = 'jat-';

/**
 * Check if tmux is available
 * @returns {boolean} True if tmux is installed
 */
export function isTmuxAvailable() {
	try {
		execSync('which tmux', { stdio: 'pipe' });
		return true;
	} catch {
		return false;
	}
}

/**
 * List all JAT tmux sessions
 * @returns {Session[]} Array of session objects
 */
export function listSessions() {
	if (!isTmuxAvailable()) {
		return [];
	}

	try {
		// tmux list-sessions format: name:windows:created:attached
		// Using -F for custom format
		const output = execSync(
			`tmux list-sessions -F "#{session_name}:#{session_windows}:#{session_created}:#{session_attached}" 2>/dev/null`,
			{ encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
		).trim();

		if (!output) {
			return [];
		}

		return output
			.split('\n')
			.filter(line => line.startsWith(SESSION_PREFIX))
			// Filter out pending sessions (still being set up, not yet renamed)
			.filter(line => !line.startsWith('jat-pending-'))
			.map(line => {
				const [name, windows, created, attached] = line.split(':');
				return {
					name,
					agentName: name.replace(SESSION_PREFIX, ''),
					windows: parseInt(windows, 10) || 1,
					created: new Date(parseInt(created, 10) * 1000).toISOString(),
					attached: attached === '1'
				};
			});
	} catch {
		// tmux server not running or other error
		return [];
	}
}

/**
 * List all JAT tmux sessions (async version)
 * @returns {Promise<Session[]>} Array of session objects
 */
export async function listSessionsAsync() {
	if (!isTmuxAvailable()) {
		return [];
	}

	try {
		const { stdout } = await execAsync(
			`tmux list-sessions -F "#{session_name}:#{session_windows}:#{session_created}:#{session_attached}" 2>/dev/null`
		);

		if (!stdout.trim()) {
			return [];
		}

		return stdout
			.trim()
			.split('\n')
			.filter(line => line.startsWith(SESSION_PREFIX))
			// Filter out pending sessions (still being set up, not yet renamed)
			.filter(line => !line.startsWith('jat-pending-'))
			.map(line => {
				const [name, windows, created, attached] = line.split(':');
				return {
					name,
					agentName: name.replace(SESSION_PREFIX, ''),
					windows: parseInt(windows, 10) || 1,
					created: new Date(parseInt(created, 10) * 1000).toISOString(),
					attached: attached === '1'
				};
			});
	} catch {
		return [];
	}
}

/**
 * Get session by agent name
 * @param {string} agentName - Agent name (e.g., "WisePrairie")
 * @returns {Session | null} Session object or null if not found
 */
export function getSession(agentName) {
	const sessions = listSessions();
	return sessions.find(s => s.agentName === agentName) || null;
}

/**
 * Check if a session exists for an agent
 * @param {string} agentName - Agent name
 * @returns {boolean} True if session exists
 */
export function sessionExists(agentName) {
	return getSession(agentName) !== null;
}

/**
 * Spawn a new tmux session for an agent
 * @param {string} agentName - Agent name (e.g., "WisePrairie")
 * @param {SpawnOptions} [options] - Session options
 * @returns {{ success: boolean, sessionName: string, error?: string }} Result
 */
export function spawnSession(agentName, options = {}) {
	if (!isTmuxAvailable()) {
		return { success: false, sessionName: '', error: 'tmux not available' };
	}

	const sessionName = `${SESSION_PREFIX}${agentName}`;

	// Check if session already exists
	if (sessionExists(agentName)) {
		return { success: false, sessionName, error: 'Session already exists' };
	}

	const {
		workingDir = process.cwd(),
		command = 'bash',
		width = 120,
		height = 40
	} = options;

	try {
		// Create detached session with specified dimensions
		// -d: detached
		// -s: session name
		// -x: width
		// -y: height
		// -c: starting directory
		execSync(
			`tmux new-session -d -s "${sessionName}" -x ${width} -y ${height} -c "${workingDir}" "${command}"`,
			{ stdio: 'pipe' }
		);

		return { success: true, sessionName };
	} catch (err) {
		return {
			success: false,
			sessionName,
			error: err instanceof Error ? err.message : 'Failed to spawn session'
		};
	}
}

/**
 * Spawn a new tmux session for an agent (async version)
 * @param {string} agentName - Agent name
 * @param {SpawnOptions} [options] - Session options
 * @returns {Promise<{ success: boolean, sessionName: string, error?: string }>} Result
 */
export async function spawnSessionAsync(agentName, options = {}) {
	if (!isTmuxAvailable()) {
		return { success: false, sessionName: '', error: 'tmux not available' };
	}

	const sessionName = `${SESSION_PREFIX}${agentName}`;

	// Check if session already exists
	const sessions = await listSessionsAsync();
	if (sessions.some(s => s.agentName === agentName)) {
		return { success: false, sessionName, error: 'Session already exists' };
	}

	const {
		workingDir = process.cwd(),
		command = 'bash',
		width = 120,
		height = 40
	} = options;

	try {
		await execAsync(
			`tmux new-session -d -s "${sessionName}" -x ${width} -y ${height} -c "${workingDir}" "${command}"`
		);

		return { success: true, sessionName };
	} catch (err) {
		return {
			success: false,
			sessionName,
			error: err instanceof Error ? err.message : 'Failed to spawn session'
		};
	}
}

/**
 * Kill a tmux session by agent name
 * @param {string} agentName - Agent name
 * @returns {{ success: boolean, error?: string }} Result
 */
export function killSession(agentName) {
	if (!isTmuxAvailable()) {
		return { success: false, error: 'tmux not available' };
	}

	const sessionName = `${SESSION_PREFIX}${agentName}`;

	// Check if session exists
	if (!sessionExists(agentName)) {
		return { success: false, error: 'Session does not exist' };
	}

	try {
		execSync(`tmux kill-session -t "${sessionName}"`, { stdio: 'pipe' });
		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : 'Failed to kill session'
		};
	}
}

/**
 * Kill a tmux session by agent name (async version)
 * @param {string} agentName - Agent name
 * @returns {Promise<{ success: boolean, error?: string }>} Result
 */
export async function killSessionAsync(agentName) {
	if (!isTmuxAvailable()) {
		return { success: false, error: 'tmux not available' };
	}

	const sessionName = `${SESSION_PREFIX}${agentName}`;

	// Check if session exists
	const sessions = await listSessionsAsync();
	if (!sessions.some(s => s.agentName === agentName)) {
		return { success: false, error: 'Session does not exist' };
	}

	try {
		await execAsync(`tmux kill-session -t "${sessionName}"`);
		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : 'Failed to kill session'
		};
	}
}

/**
 * Send input/keys to a tmux session
 * @param {string} agentName - Agent name
 * @param {string} input - Input to send (can include special keys like Enter)
 * @param {boolean} [pressEnter=true] - Whether to press Enter after input
 * @returns {{ success: boolean, error?: string }} Result
 */
export function sendInput(agentName, input, pressEnter = true) {
	if (!isTmuxAvailable()) {
		return { success: false, error: 'tmux not available' };
	}

	const sessionName = `${SESSION_PREFIX}${agentName}`;

	// Check if session exists
	if (!sessionExists(agentName)) {
		return { success: false, error: 'Session does not exist' };
	}

	try {
		// Escape special characters for tmux send-keys
		// Use -l for literal string (no special key parsing)
		const escapedInput = input.replace(/"/g, '\\"');

		if (pressEnter) {
			// Send input followed by Enter key
			execSync(`tmux send-keys -t "${sessionName}" -l "${escapedInput}"`, { stdio: 'pipe' });
			execSync(`tmux send-keys -t "${sessionName}" Enter`, { stdio: 'pipe' });
		} else {
			execSync(`tmux send-keys -t "${sessionName}" -l "${escapedInput}"`, { stdio: 'pipe' });
		}

		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : 'Failed to send input'
		};
	}
}

/**
 * Send input/keys to a tmux session (async version)
 * @param {string} agentName - Agent name
 * @param {string} input - Input to send
 * @param {boolean} [pressEnter=true] - Whether to press Enter after input
 * @returns {Promise<{ success: boolean, error?: string }>} Result
 */
export async function sendInputAsync(agentName, input, pressEnter = true) {
	if (!isTmuxAvailable()) {
		return { success: false, error: 'tmux not available' };
	}

	const sessionName = `${SESSION_PREFIX}${agentName}`;

	// Check if session exists
	const sessions = await listSessionsAsync();
	if (!sessions.some(s => s.agentName === agentName)) {
		return { success: false, error: 'Session does not exist' };
	}

	try {
		const escapedInput = input.replace(/"/g, '\\"');

		if (pressEnter) {
			await execAsync(`tmux send-keys -t "${sessionName}" -l "${escapedInput}"`);
			await execAsync(`tmux send-keys -t "${sessionName}" Enter`);
		} else {
			await execAsync(`tmux send-keys -t "${sessionName}" -l "${escapedInput}"`);
		}

		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : 'Failed to send input'
		};
	}
}

/**
 * Capture output from a tmux session pane
 * @param {string} agentName - Agent name
 * @param {Object} [options] - Capture options
 * @param {number} [options.lines=100] - Number of lines to capture (from bottom)
 * @param {boolean} [options.escapeSequences=false] - Include ANSI escape sequences
 * @returns {{ success: boolean, output?: string, error?: string }} Result
 */
export function captureOutput(agentName, options = {}) {
	if (!isTmuxAvailable()) {
		return { success: false, error: 'tmux not available' };
	}

	const sessionName = `${SESSION_PREFIX}${agentName}`;

	// Check if session exists
	if (!sessionExists(agentName)) {
		return { success: false, error: 'Session does not exist' };
	}

	const { lines = 100, escapeSequences = false } = options;

	try {
		// -p: print to stdout
		// -S: start line (negative for history)
		// -e: include escape sequences (if requested)
		let cmd = `tmux capture-pane -t "${sessionName}" -p -S -${lines}`;
		if (escapeSequences) {
			cmd += ' -e';
		}

		const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

		return { success: true, output: output.trimEnd() };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : 'Failed to capture output'
		};
	}
}

/**
 * Capture output from a tmux session pane (async version)
 * @param {string} agentName - Agent name
 * @param {Object} [options] - Capture options
 * @param {number} [options.lines=100] - Number of lines to capture
 * @param {boolean} [options.escapeSequences=false] - Include ANSI escape sequences
 * @returns {Promise<{ success: boolean, output?: string, error?: string }>} Result
 */
export async function captureOutputAsync(agentName, options = {}) {
	if (!isTmuxAvailable()) {
		return { success: false, error: 'tmux not available' };
	}

	const sessionName = `${SESSION_PREFIX}${agentName}`;

	// Check if session exists
	const sessions = await listSessionsAsync();
	if (!sessions.some(s => s.agentName === agentName)) {
		return { success: false, error: 'Session does not exist' };
	}

	const { lines = 100, escapeSequences = false } = options;

	try {
		let cmd = `tmux capture-pane -t "${sessionName}" -p -S -${lines}`;
		if (escapeSequences) {
			cmd += ' -e';
		}

		const { stdout } = await execAsync(cmd);

		return { success: true, output: stdout.trimEnd() };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : 'Failed to capture output'
		};
	}
}

/**
 * Get the current pane content (visible area only)
 * @param {string} agentName - Agent name
 * @returns {{ success: boolean, output?: string, error?: string }} Result
 */
export function getVisibleContent(agentName) {
	return captureOutput(agentName, { lines: 0 });
}

/**
 * Send a special key to a session (e.g., Ctrl-C, Escape)
 * @param {string} agentName - Agent name
 * @param {string} key - Special key name (e.g., "C-c" for Ctrl-C, "Escape", "Enter")
 * @returns {{ success: boolean, error?: string }} Result
 */
export function sendKey(agentName, key) {
	if (!isTmuxAvailable()) {
		return { success: false, error: 'tmux not available' };
	}

	const sessionName = `${SESSION_PREFIX}${agentName}`;

	if (!sessionExists(agentName)) {
		return { success: false, error: 'Session does not exist' };
	}

	try {
		// send-keys without -l interprets special key names
		execSync(`tmux send-keys -t "${sessionName}" ${key}`, { stdio: 'pipe' });
		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : 'Failed to send key'
		};
	}
}

/**
 * Send interrupt signal (Ctrl-C) to a session
 * @param {string} agentName - Agent name
 * @returns {{ success: boolean, error?: string }} Result
 */
export function sendInterrupt(agentName) {
	return sendKey(agentName, 'C-c');
}
