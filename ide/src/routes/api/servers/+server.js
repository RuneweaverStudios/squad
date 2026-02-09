/**
 * Servers API - List Active Server Sessions
 * GET /api/servers - Return all active dev server tmux sessions with output
 *
 * Server sessions are tmux sessions running dev servers (npm run dev, etc.)
 * They use the naming convention: server-{projectName} (e.g., "server-chimaro")
 *
 * Each ServerSession includes:
 * - mode: 'server' (constant)
 * - sessionName: tmux session name (e.g., "server-chimaro")
 * - projectName: Project name extracted from session (e.g., "chimaro")
 * - displayName: Human-readable display name
 * - port: Detected port from output (e.g., 5173)
 * - portRunning: Whether the port is actively listening
 * - status: 'running' | 'starting' | 'stopped'
 * - output: Recent terminal output with ANSI codes
 * - lineCount: Number of output lines
 * - created: Session creation timestamp
 * - attached: Whether session is attached
 * - projectPath: Path to project directory
 * - command: Command being run (detected from output)
 *
 * Query params:
 * - lines: Number of output lines to capture (default: 50, max: 500)
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { apiCache, cacheKey, CACHE_TTL } from '$lib/server/cache.js';

const execAsync = promisify(exec);

/**
 * Strip ANSI escape codes from text
 * @param {string} text - Text with ANSI codes
 * @returns {string} - Clean text
 */
function stripAnsi(text) {
	// eslint-disable-next-line no-control-regex
	return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

/**
 * Detect port from server output
 * Looks for common patterns like "localhost:5173", ":5173", "port 5173"
 * @param {string} output - Terminal output (may contain ANSI codes)
 * @returns {number|null} - Detected port or null
 */
function detectPort(output) {
	// Strip ANSI codes before pattern matching
	const cleanOutput = stripAnsi(output);

	// Common patterns for port detection (order matters - most specific first)
	const patterns = [
		/localhost:(\d+)/i,
		/127\.0\.0\.1:(\d+)/i,
		/0\.0\.0\.0:(\d+)/i,
		/http:\/\/[^:]+:(\d+)/i,
		/https:\/\/[^:]+:(\d+)/i,
		/port\s*[=:]\s*(\d+)/i,
		/--port\s+(\d+)/i,
		/listening\s+(?:on\s+)?(?:port\s+)?(\d+)/i
		// Removed generic /:(\d{4,5})\b/ - too greedy, matches line counts and timestamps
	];

	for (const pattern of patterns) {
		const match = cleanOutput.match(pattern);
		if (match && match[1]) {
			const port = parseInt(match[1], 10);
			// Only return valid port numbers (1024-65535 for user ports)
			if (port >= 1024 && port <= 65535) {
				return port;
			}
		}
	}
	return null;
}

/**
 * Check if a port is actively listening
 * @param {number} port - Port number to check
 * @returns {Promise<boolean>} - Whether port is listening
 */
async function isPortListening(port) {
	try {
		// Use ss (faster) or netstat to check if port is listening
		const { stdout } = await execAsync(
			`ss -tlnp 2>/dev/null | grep -q ":${port} " && echo "yes" || echo "no"`
		);
		return stdout.trim() === 'yes';
	} catch {
		return false;
	}
}

/**
 * Detect server status from output
 * @param {string} output - Terminal output
 * @param {boolean} portRunning - Whether detected port is listening
 * @returns {'running' | 'starting' | 'stopped'}
 */
function detectStatus(output, portRunning) {
	// If port is actively listening, server is definitely running
	// This takes precedence over error pattern detection since many servers
	// log errors (API errors, validation errors) while still running fine
	if (portRunning) {
		return 'running';
	}

	// Strip ANSI codes before pattern matching
	const recentOutput = stripAnsi(output.slice(-2000));

	// Check for fatal error patterns (server actually stopped/crashed)
	// Be specific - avoid matching general API errors or validation errors
	const fatalErrorPatterns = [
		/EADDRINUSE/i,           // Port already in use
		/failed to start/i,      // Server failed to start
		/npm err!/i,             // npm error
		/exit code \d+/i,        // Process exited with error code
		/crashed/i,              // Server crashed
		/terminated/i,           // Process terminated
		/exited unexpectedly/i,  // Process exited
		/build failed/i,         // Build error
		/cannot find module/i    // Module not found
	];

	// Check for ready patterns - these indicate current running state
	const readyPatterns = [
		/ready in/i,
		/ready - polling/i,
		/listening on/i,
		/server running/i,
		/local:/i,
		/network:/i,
		/started server/i
	];

	// Check for startup patterns
	const startingPatterns = [
		/starting/i,
		/compiling/i,
		/building/i,
		/bundling/i,
		/waiting for/i,
		/preparing/i
	];

	// Use the LAST few lines to determine current state, since older output
	// may contain stale patterns (e.g. "starting" from a previous boot cycle
	// while the server is now "ready - polling")
	const lines = recentOutput.split('\n').filter(l => l.trim());
	const lastLines = lines.slice(-10).join('\n');

	// Check last lines first for definitive current state
	for (const pattern of fatalErrorPatterns) {
		if (pattern.test(lastLines)) {
			return 'stopped';
		}
	}

	for (const pattern of readyPatterns) {
		if (pattern.test(lastLines)) {
			return 'running';
		}
	}

	// Fall back to full recent output scan - fatal errors first, then
	// starting, then ready
	for (const pattern of fatalErrorPatterns) {
		if (pattern.test(recentOutput)) {
			return 'stopped';
		}
	}

	for (const pattern of readyPatterns) {
		if (pattern.test(recentOutput)) {
			return 'running';
		}
	}

	for (const pattern of startingPatterns) {
		if (pattern.test(recentOutput)) {
			return 'starting';
		}
	}

	// Default to starting if we have output but no clear status
	return output.length > 0 ? 'starting' : 'stopped';
}

/**
 * Detect command being run from output or process
 * @param {string} output - Terminal output
 * @returns {string} - Detected command
 */
function detectCommand(output) {
	// Strip ANSI codes and look for npm/pnpm/yarn commands in first few lines
	const firstLines = stripAnsi(output.slice(0, 500));

	if (/npm run dev/i.test(firstLines)) return 'npm run dev';
	if (/pnpm dev/i.test(firstLines)) return 'pnpm dev';
	if (/yarn dev/i.test(firstLines)) return 'yarn dev';
	if (/vite/i.test(firstLines)) return 'vite';
	if (/next dev/i.test(firstLines)) return 'next dev';
	if (/svelte.*dev/i.test(firstLines)) return 'svelte dev';

	return 'npm run dev'; // Default assumption
}

/**
 * Generate display name from project name
 * @param {string} projectName - Project name (e.g., "chimaro")
 * @returns {string} - Display name (e.g., "Chimaro Dev Server")
 */
function generateDisplayName(projectName) {
	if (projectName === 'ingest') return 'Integrations';
	if (projectName === 'scheduler') return 'Scheduler';
	const capitalized = projectName.charAt(0).toUpperCase() + projectName.slice(1);
	return `${capitalized} Dev Server`;
}

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
	try {
		const linesParam = url.searchParams.get('lines');
		const lines = Math.min(Math.max(parseInt(linesParam || '50', 10) || 50, 1), 500);

		// Build cache key (servers don't change often, 5s cache)
		const key = cacheKey('servers', { lines: String(lines) });

		// Check cache
		const cached = apiCache.get(key);
		if (cached) {
			return json(cached);
		}

		// Step 1: List server-* tmux sessions
		const sessionsCommand = `tmux list-sessions -F "#{session_name}:#{session_created}:#{session_attached}" 2>/dev/null || echo ""`;

		let sessionsOutput = '';
		try {
			const { stdout } = await execAsync(sessionsCommand);
			sessionsOutput = stdout.trim();
		} catch {
			// No tmux server or no sessions - return empty
			return json({
				success: true,
				sessions: [],
				count: 0,
				timestamp: new Date().toISOString()
			});
		}

		if (!sessionsOutput) {
			return json({
				success: true,
				sessions: [],
				count: 0,
				timestamp: new Date().toISOString()
			});
		}

		// Parse sessions and filter for server-* prefix
		const rawSessions = sessionsOutput
			.split('\n')
			.filter((line) => line.length > 0)
			.map((line) => {
				const [name, created, attached] = line.split(':');
				return {
					name,
					created: new Date(parseInt(created, 10) * 1000).toISOString(),
					attached: attached === '1'
				};
			})
			.filter((session) => session.name.startsWith('server-'));

		if (rawSessions.length === 0) {
			return json({
				success: true,
				sessions: [],
				count: 0,
				timestamp: new Date().toISOString()
			});
		}

		// Step 2: Build ServerSession for each tmux session
		const serverSessions = await Promise.all(
			rawSessions.map(async (session) => {
				// Extract project name from session name (server-projectName -> projectName)
				const projectName = session.name.replace(/^server-/, '');

				// Capture output - two captures:
				// 1. Deep capture for port detection (startup line may have scrolled)
				// 2. Recent capture for display
				// 3. Get total history line count for activity tracking
				let output = '';
				let deepOutput = '';
				let lineCount = 0;
				try {
					// Deep capture for port detection (200 lines back - ports appear in first ~20 lines)
					const deepCaptureCommand = `tmux capture-pane -p -t "${session.name}" -S -200`;
					const { stdout: deepStdout } = await execAsync(deepCaptureCommand, { maxBuffer: 512 * 1024 });
					deepOutput = deepStdout;

					// Recent capture for display (with ANSI codes for colors)
					const captureCommand = `tmux capture-pane -p -e -t "${session.name}" -S -${lines}`;
					const { stdout } = await execAsync(captureCommand, { maxBuffer: 512 * 1024 });
					output = stdout;

					// Get total history line count from tmux for activity tracking
					// This counts all lines ever written, not just visible buffer
					const historyCommand = `tmux display-message -p -t "${session.name}" '#{history_size}'`;
					try {
						const { stdout: historyStdout } = await execAsync(historyCommand);
						lineCount = parseInt(historyStdout.trim(), 10) || 0;
					} catch {
						// Fallback to deep output line count
						lineCount = deepOutput.split('\n').length;
					}
				} catch {
					// Session might have closed, continue with empty output
					output = '';
					deepOutput = '';
					lineCount = 0;
				}

				// Detect port from deep output (better chance of finding startup line)
				let port = detectPort(deepOutput || output);

				// Try to get project config (path, server_path, and port) from jat config
				let projectPath = null;
				let configPort = null;
				try {
					const configPath = `${process.env.HOME}/.config/jat/projects.json`;
					// Note: \\( creates literal \( for jq interpolation
					const { stdout: configOutput } = await execAsync(
						`jq -r '.projects["${projectName}"] | "\\(.path // empty)|\\(.server_path // empty)|\\(.port // empty)"' "${configPath}" 2>/dev/null`
					);
					const [pathPart, serverPathPart, portPart] = configOutput.trim().split('|');
					// Use server_path if available, otherwise use path
					const effectivePath = serverPathPart || pathPart;
					projectPath = effectivePath ? effectivePath.replace(/^~/, process.env.HOME || '') : null;
					configPort = portPart ? parseInt(portPart, 10) : null;
				} catch {
					// Config not available, use default path
					projectPath = `${process.env.HOME}/code/${projectName}`;
				}

				// Use config port if output detection failed
				if (!port && configPort) {
					port = configPort;
				}

				// Check if port is actually listening
				const portRunning = port ? await isPortListening(port) : false;

				// Detect status
				const status = detectStatus(output, portRunning);

				// Detect command
				const command = detectCommand(output);

				// Generate display name
				const displayName = generateDisplayName(projectName);

				return {
					mode: 'server',
					sessionName: session.name,
					projectName,
					displayName,
					port,
					portRunning,
					status,
					output,
					lineCount,
					created: session.created,
					attached: session.attached,
					projectPath,
					command
				};
			})
		);

		// Build response
		const responseData = {
			success: true,
			sessions: serverSessions,
			count: serverSessions.length,
			timestamp: new Date().toISOString()
		};

		// Cache for 5 seconds (servers are relatively static)
		apiCache.set(key, responseData, CACHE_TTL.MEDIUM);

		return json(responseData);
	} catch (error) {
		console.error('Error in GET /api/servers:', error);
		return json(
			{
				error: 'Internal server error',
				message: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
}
