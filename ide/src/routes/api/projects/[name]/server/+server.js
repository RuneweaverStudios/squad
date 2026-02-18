/**
 * Project Server API
 * POST /api/projects/[name]/server - Start dev server in tmux
 * DELETE /api/projects/[name]/server - Stop dev server
 * GET /api/projects/[name]/server - Check server status
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);

// Path to SQUAD config
const CONFIG_FILE = join(homedir(), '.config', 'squad', 'projects.json');

/**
 * Read project config
 * @param {string} projectName
 */
async function getProjectConfig(projectName) {
	try {
		if (!existsSync(CONFIG_FILE)) {
			return null;
		}
		const content = await readFile(CONFIG_FILE, 'utf-8');
		const config = JSON.parse(content);
		return config.projects?.[projectName] || null;
	} catch (error) {
		console.error('Failed to read project config:', error);
		return null;
	}
}

/**
 * Check if a port is in use
 * @param {number|null} port
 */
async function checkPortStatus(port) {
	if (!port) return false;
	try {
		const { stdout } = await execAsync(`ss -tlnp 2>/dev/null | grep -q ":${port} " && echo "running" || echo "stopped"`, {
			timeout: 2000
		});
		return stdout.trim() === 'running';
	} catch {
		return false;
	}
}

/**
 * Check if tmux session exists
 * @param {string} sessionName
 */
async function tmuxSessionExists(sessionName) {
	try {
		await execAsync(`tmux has-session -t "${sessionName}" 2>/dev/null`);
		return true;
	} catch {
		return false;
	}
}

/**
 * Get tmux session name for a project server
 * Uses server-{projectName} format to match /api/servers endpoint detection
 * @param {string} projectName
 */
function getSessionName(projectName) {
	return `server-${projectName}`;
}

/**
 * GET - Check server status
 */
export async function GET({ params }) {
	const { name } = params;

	const config = await getProjectConfig(name);
	if (!config) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const sessionName = getSessionName(name);
	const [sessionExists, portRunning] = await Promise.all([
		tmuxSessionExists(sessionName),
		checkPortStatus(config.port)
	]);

	// Determine status:
	// - If port is configured and listening: 'running'
	// - If port is configured but not listening and session exists: 'starting'
	// - If no port configured but session exists: 'running' (we assume it's working)
	// - If no session: 'stopped'
	let status = 'stopped';
	if (sessionExists) {
		if (config.port) {
			status = portRunning ? 'running' : 'starting';
		} else {
			// No port configured - if session exists, assume running
			status = 'running';
		}
	}

	return json({
		project: name,
		port: config.port,
		sessionName,
		sessionExists,
		portRunning,
		status
	});
}

/**
 * POST - Start dev server in tmux
 */
export async function POST({ params }) {
	const { name } = params;

	const config = await getProjectConfig(name);
	if (!config) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const projectPath = config.path?.replace(/^~/, homedir());
	if (!projectPath || !existsSync(projectPath)) {
		return json({ error: 'Project path not found' }, { status: 404 });
	}

	const sessionName = getSessionName(name);

	// Check if session already exists
	if (await tmuxSessionExists(sessionName)) {
		const portRunning = await checkPortStatus(config.port);
		// If no port configured, assume running; otherwise check port status
		const status = config.port ? (portRunning ? 'running' : 'starting') : 'running';
		return json({
			success: true,
			message: 'Server session already exists',
			sessionName,
			port: config.port,
			status
		});
	}

	// Determine the start command based on what exists in the project
	let startCommand = 'npm run dev';

	// Check for package.json scripts
	const packageJsonPath = join(projectPath, 'package.json');
	if (existsSync(packageJsonPath)) {
		try {
			const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
			if (packageJson.scripts?.dev) {
				startCommand = 'npm run dev';
			} else if (packageJson.scripts?.start) {
				startCommand = 'npm run start';
			}
		} catch {
			// Use default
		}
	}

	// Add port flag if configured
	if (config.port && !startCommand.includes('--port')) {
		startCommand = `${startCommand} -- --port ${config.port}`;
	}

	try {
		// Create tmux session and run dev server
		// Using -d for detached, -x 80 -y 40 for consistent terminal width
		// Setting window name to match project
		const tmuxCommand = `tmux new-session -d -s "${sessionName}" -x 80 -y 40 -n "dev" "cd '${projectPath}' && ${startCommand}; exec bash"`;

		await execAsync(tmuxCommand, { timeout: 5000 });

		// Wait a moment for the server to start
		await new Promise(resolve => setTimeout(resolve, 1000));

		const portRunning = await checkPortStatus(config.port);
		// If no port configured, assume running; otherwise check port status
		const status = config.port ? (portRunning ? 'running' : 'starting') : 'running';

		return json({
			success: true,
			message: `Started dev server in tmux session: ${sessionName}`,
			sessionName,
			port: config.port,
			command: startCommand,
			status,
			attach: `tmux attach -t ${sessionName}`
		});
	} catch (error) {
		console.error('Failed to start server:', error);
		return json({
			error: 'Failed to start server',
			details: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}

/**
 * DELETE - Stop dev server
 */
export async function DELETE({ params }) {
	const { name } = params;

	const config = await getProjectConfig(name);
	if (!config) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const sessionName = getSessionName(name);

	// Check if session exists
	if (!(await tmuxSessionExists(sessionName))) {
		return json({
			success: true,
			message: 'Server session not running',
			sessionName
		});
	}

	try {
		// Kill the tmux session
		await execAsync(`tmux kill-session -t "${sessionName}"`, { timeout: 5000 });

		// Wait for port to be released
		await new Promise(resolve => setTimeout(resolve, 500));
		const portRunning = await checkPortStatus(config.port);

		return json({
			success: true,
			message: `Stopped server session: ${sessionName}`,
			sessionName,
			port: config.port,
			status: portRunning ? 'stopping' : 'stopped'
		});
	} catch (error) {
		console.error('Failed to stop server:', error);
		return json({
			error: 'Failed to stop server',
			details: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
