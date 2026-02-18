/**
 * Servers API - Restart Server Session
 * POST /api/servers/{sessionName}/restart - Restart a server session
 *
 * Sends Ctrl+C to stop the current process, then re-runs the server command.
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/** @type {import('./$types').RequestHandler} */
export async function POST({ params }) {
	const { sessionName } = params;

	if (!sessionName) {
		return json(
			{ error: 'Missing session name' },
			{ status: 400 }
		);
	}

	// Validate session name format (must start with server-)
	if (!sessionName.startsWith('server-')) {
		return json(
			{
				error: 'Invalid session name',
				message: 'Server sessions must have names starting with "server-"'
			},
			{ status: 400 }
		);
	}

	try {
		// Check if session exists
		const { stdout: checkOutput } = await execAsync(
			`tmux has-session -t "${sessionName}" 2>/dev/null && echo "exists" || echo "no"`
		);

		if (checkOutput.trim() !== 'exists') {
			return json(
				{
					error: 'Session not found',
					message: `Server session "${sessionName}" does not exist`
				},
				{ status: 404 }
			);
		}

		// Get the project name from session name
		const projectName = sessionName.replace(/^server-/, '');

		// Get project config (path and port) from squad config
		let projectPath = null;
		let configPort = null;
		let detectedPort = null;

		// First, try to detect port from current output (most accurate - shows what's actually running)
		try {
			const { stdout: outputStdout } = await execAsync(
				`tmux capture-pane -p -t "${sessionName}" -S -500`
			);
			// Look for port patterns - prioritize localhost:port and --port patterns
			const portPatterns = [
				/localhost:(\d+)/,
				/127\.0\.0\.1:(\d+)/,
				/--port\s+(\d+)/,
				/port\s+(\d+)/i
			];
			for (const pattern of portPatterns) {
				const match = outputStdout.match(pattern);
				if (match && match[1]) {
					const port = parseInt(match[1], 10);
					if (port >= 1024 && port <= 65535) {
						detectedPort = port;
						break;
					}
				}
			}
		} catch {
			// Ignore detection errors
		}

		// Get project config as fallback
		let serverPath = null;
		try {
			const configPath = `${process.env.HOME}/.config/squad/projects.json`;
			// Note: Using "" fallback instead of empty - empty causes jq to suppress
			// the entire output if ANY field is null/empty (e.g., when port is not set)
			const { stdout: configOutput } = await execAsync(
				`jq -r '.projects["${projectName}"] | "\\(.path // "")|\\(.server_path // "")|\\(.port // "")"' "${configPath}" 2>/dev/null`
			);
			const [pathPart, serverPathPart, portPart] = configOutput.trim().split('|');
			if (pathPart) {
				projectPath = pathPart.replace(/^~/, process.env.HOME || '');
			}
			if (serverPathPart) {
				serverPath = serverPathPart.replace(/^~/, process.env.HOME || '');
				// Resolve relative server_path against project path
				if (serverPath && !serverPath.startsWith('/') && projectPath) {
					serverPath = `${projectPath}/${serverPath}`;
				}
			}
			if (portPart && portPart !== 'null') {
				configPort = parseInt(portPart, 10);
			}
		} catch {
			// Config not available
		}

		// Fall back to default path
		if (!projectPath) {
			projectPath = `${process.env.HOME}/code/${projectName}`;
		}

		// Use detected port first, then config port as fallback
		const port = detectedPort || configPort;

		// Determine restart command and working directory
		let restartCommand;
		let workDir;

		if (projectName === 'ingest') {
			// Special handling for ingest daemon
			restartCommand = 'node squad-ingest';
			// Resolve the ingest directory directly from the squad-ingest symlink
			workDir = await (async () => {
				try {
					const { stdout } = await execAsync('readlink -f "$(which squad-ingest)" 2>/dev/null');
					const resolved = stdout.trim();
					if (resolved) {
						const { stdout: dirOut } = await execAsync(`dirname "${resolved}"`);
						return dirOut.trim();
					}
				} catch { /* fall through */ }
				const fallbacks = [
					`${process.env.SQUAD_INSTALL_DIR || ''}/tools/ingest`,
					`${process.env.HOME}/.local/share/squad/tools/ingest`,
					`${process.env.HOME}/code/squad/tools/ingest`
				];
				for (const p of fallbacks) {
					if (!p.startsWith('/tools')) {
						try {
							const { stdout } = await execAsync(`test -d "${p}" && echo "yes" || echo "no"`);
							if (stdout.trim() === 'yes') return p;
						} catch { /* continue */ }
					}
				}
				return `${process.env.HOME}/code/squad/tools/ingest`;
			})();
		} else {
			// Standard project: build the restart command with port if available
			const portArg = port ? ` -- --port ${port}` : '';
			restartCommand = `npm run dev${portArg}`;

			// Determine the correct working directory
			// Use server_path if specified, otherwise check for ide subdirectory
			workDir = serverPath || projectPath;
			if (!serverPath) {
				try {
					const { stdout: checkResult } = await execAsync(
						`test -f "${projectPath}/ide/package.json" && echo "ide" || echo "root"`
					);
					if (checkResult.trim() === 'ide') {
						workDir = `${projectPath}/ide`;
					}
				} catch {
					// Use projectPath as-is
				}
			}
		}

		// Create a restart script that runs in the background
		// This survives even if we're restarting the server handling this request
		// Note: Server sessions use 80x40 dimensions for consistent output width
		// Sleep after session creation allows shell to initialize before sending keys
		// Without this delay, the shell may not be ready and keys are lost (race condition)
		const restartScript = `
			sleep 0.5
			tmux kill-session -t "${sessionName}" 2>/dev/null || true
			sleep 0.5
			tmux new-session -d -s "${sessionName}" -x 80 -y 40 -c "${workDir}"
			sleep 0.3
			tmux send-keys -t "${sessionName}" "${restartCommand}" Enter
		`;

		// Run in background with nohup so it survives if this server dies
		await execAsync(`nohup bash -c '${restartScript}' >/dev/null 2>&1 &`);

		// Return immediately - the restart happens in the background
		const output = 'Restarting server in background...';
		const lineCount = 1;

		return json({
			success: true,
			message: `Restarted server session: ${sessionName}`,
			command: restartCommand,
			session: {
				mode: 'server',
				sessionName,
				projectName,
				port,
				status: 'starting',
				output,
				lineCount,
				timestamp: new Date().toISOString()
			}
		});
	} catch (error) {
		console.error('Error in POST /api/servers/[sessionName]/restart:', error);
		return json(
			{
				error: 'Failed to restart server session',
				message: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
}
