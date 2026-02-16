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
import { readFileSync, statSync } from 'fs';
import { apiCache, cacheKey, CACHE_TTL, singleFlight } from '$lib/server/cache.js';

const execAsync = promisify(exec);

/** @type {object|null} */
let _projectsConfig = null;
/** @type {number} */
let _projectsConfigMtime = 0;

/**
 * Load projects.json config with simple mtime-based caching.
 * Avoids spawning a jq subprocess per server session.
 * @returns {object|null}
 */
function loadProjectsConfig() {
	const configPath = `${process.env.HOME}/.config/jat/projects.json`;
	try {
		const { mtimeMs } = statSync(configPath);
		if (_projectsConfig && mtimeMs === _projectsConfigMtime) {
			return _projectsConfig;
		}
		_projectsConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
		_projectsConfigMtime = mtimeMs;
		return _projectsConfig;
	} catch {
		return null;
	}
}

/**
 * Get project config for a given project name from cached config.
 * @param {string} projectName
 * @returns {{ path?: string, server_path?: string, port?: number }|null}
 */
function getProjectConfig(projectName) {
	const config = loadProjectsConfig();
	if (!config?.projects?.[projectName]) return null;
	return config.projects[projectName];
}

/**
 * Batch check which ports are listening.
 * Single `ss` call parsed for all ports instead of one call per port.
 * @param {number[]} ports - Ports to check
 * @returns {Promise<Set<number>>} - Set of ports that are listening
 */
async function getListeningPorts(ports) {
	if (ports.length === 0) return new Set();
	try {
		const { stdout } = await execAsync('ss -tlnp 2>/dev/null', { maxBuffer: 64 * 1024 });
		const listeningPorts = new Set();
		for (const port of ports) {
			if (stdout.includes(`:${port} `)) {
				listeningPorts.add(port);
			}
		}
		return listeningPorts;
	} catch {
		return new Set();
	}
}

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

// isPortListening removed — replaced by batched getListeningPorts() above

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

		// singleFlight: cache + deduplication in one call.
		// If 5 concurrent requests arrive, only the first computes;
		// the rest share that result. Cache TTL = 15s.
		const key = cacheKey('servers', { lines: String(lines) });
		const responseData = await singleFlight(key, () => computeServersData(lines), 15000);
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

/**
 * Core computation for server session data.
 * Extracted to enable singleFlight deduplication.
 * @param {number} lines
 */
async function computeServersData(lines) {
		// Step 1: List server-* tmux sessions
		const sessionsCommand = `tmux list-sessions -F "#{session_name}:#{session_created}:#{session_attached}" 2>/dev/null || echo ""`;

		let sessionsOutput = '';
		try {
			const { stdout } = await execAsync(sessionsCommand);
			sessionsOutput = stdout.trim();
		} catch {
			// No tmux server or no sessions - return empty
			return {
				success: true,
				sessions: [],
				count: 0,
				timestamp: new Date().toISOString()
			};
		}

		if (!sessionsOutput) {
			return {
				success: true,
				sessions: [],
				count: 0,
				timestamp: new Date().toISOString()
			};
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
			return {
				success: true,
				sessions: [],
				count: 0,
				timestamp: new Date().toISOString()
			};
		}

		// Step 2: Capture output from all sessions in parallel
		// One tmux call per session (down from 3) — capture with ANSI for display,
		// use same output for port detection. History line count derived from output.
		const captureResults = await Promise.all(
			rawSessions.map(async (session) => {
				try {
					// Single capture: deep enough for port detection (200 lines), with ANSI for display
					const captureCommand = `tmux capture-pane -p -e -t "${session.name}" -S -${Math.max(lines, 200)}`;
					const { stdout } = await execAsync(captureCommand, { maxBuffer: 512 * 1024 });
					return { name: session.name, output: stdout };
				} catch {
					return { name: session.name, output: '' };
				}
			})
		);

		// Step 3: Detect ports from output + config (no subprocesses)
		const sessionPorts = captureResults.map(({ name, output }) => {
			const projectName = name.replace(/^server-/, '');
			let port = detectPort(output);
			// Fall back to config port
			if (!port) {
				const config = getProjectConfig(projectName);
				if (config?.port) port = config.port;
			}
			return port;
		});

		// Step 4: Batch port check — single ss call for all ports
		const uniquePorts = [...new Set(sessionPorts.filter(Boolean))];
		const listeningPorts = await getListeningPorts(uniquePorts);

		// Step 5: Build ServerSession objects (no more subprocess calls)
		const serverSessions = rawSessions.map((session, i) => {
			const projectName = session.name.replace(/^server-/, '');
			const fullOutput = captureResults[i].output;
			// For display, take only the requested number of lines from the end
			const outputLines = fullOutput.split('\n');
			const output = outputLines.length > lines
				? outputLines.slice(-lines).join('\n')
				: fullOutput;
			const lineCount = outputLines.length;

			const port = sessionPorts[i];
			const portRunning = port ? listeningPorts.has(port) : false;

			// Get project path from config (no subprocess)
			let projectPath = null;
			const config = getProjectConfig(projectName);
			if (config) {
				let effectiveServerPath = config.server_path;
				const pathPart = config.path;
				if (effectiveServerPath && !effectiveServerPath.startsWith('/') && !effectiveServerPath.startsWith('~') && pathPart) {
					const resolvedBase = pathPart.replace(/^~/, process.env.HOME || '');
					effectiveServerPath = `${resolvedBase}/${effectiveServerPath}`;
				}
				const effectivePath = effectiveServerPath || pathPart;
				projectPath = effectivePath ? effectivePath.replace(/^~/, process.env.HOME || '') : null;
			}
			if (!projectPath) {
				projectPath = `${process.env.HOME}/code/${projectName}`;
			}

			const status = detectStatus(output, portRunning);
			const command = detectCommand(output);
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
		});

		// Build response
		return {
			success: true,
			sessions: serverSessions,
			count: serverSessions.length,
			timestamp: new Date().toISOString()
		};
}
