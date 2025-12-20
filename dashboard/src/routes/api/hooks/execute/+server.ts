/**
 * Hook Execution API
 *
 * POST /api/hooks/execute - Execute a hook script with sample input (preview/dry-run)
 *
 * Runs the hook script in a subprocess, passing the provided JSON as stdin,
 * and returns stdout, stderr, and exit code.
 *
 * Security notes:
 * - Only executes scripts that exist on disk
 * - Resolves relative paths from project root
 * - Runs with a timeout to prevent hanging
 * - Does NOT actually affect Claude Code (it's just a preview)
 */

import { json } from '@sveltejs/kit';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import type { RequestHandler } from './$types';

// Get the project root directory (parent of dashboard)
function getProjectRoot(): string {
	return process.cwd().replace('/dashboard', '');
}

// Resolve hook command path (handles relative paths)
function resolveHookPath(command: string): string {
	const projectRoot = getProjectRoot();

	// Handle relative paths starting with ./
	if (command.startsWith('./')) {
		return path.join(projectRoot, command);
	}

	// Handle relative paths starting with .claude/
	if (command.startsWith('.claude/')) {
		return path.join(projectRoot, command);
	}

	// Absolute paths or commands in PATH
	return command;
}

// Execute a command with input on stdin
async function executeHook(
	command: string,
	input: string,
	timeoutMs: number = 10000
): Promise<{
	stdout: string;
	stderr: string;
	exitCode: number | null;
	timedOut: boolean;
	error?: string;
}> {
	return new Promise((resolve) => {
		const resolvedPath = resolveHookPath(command);

		// Check if file exists
		if (!existsSync(resolvedPath)) {
			resolve({
				stdout: '',
				stderr: `Hook script not found: ${resolvedPath}`,
				exitCode: 127,
				timedOut: false,
				error: 'Script not found'
			});
			return;
		}

		let stdout = '';
		let stderr = '';
		let timedOut = false;

		// Spawn the hook script
		const proc = spawn(resolvedPath, [], {
			cwd: getProjectRoot(),
			env: {
				...process.env,
				// Mark this as a preview/dry-run execution
				JAT_HOOK_PREVIEW: 'true',
				// Provide a mock session ID for hooks that need it
				CLAUDE_SESSION_ID: 'preview-session-' + Date.now()
			},
			shell: true
		});

		// Set timeout
		const timeout = setTimeout(() => {
			timedOut = true;
			proc.kill('SIGKILL');
		}, timeoutMs);

		// Collect stdout
		proc.stdout?.on('data', (data) => {
			stdout += data.toString();
		});

		// Collect stderr
		proc.stderr?.on('data', (data) => {
			stderr += data.toString();
		});

		// Handle process exit
		proc.on('close', (code) => {
			clearTimeout(timeout);
			resolve({
				stdout: stdout.trim(),
				stderr: stderr.trim(),
				exitCode: code,
				timedOut
			});
		});

		// Handle process errors
		proc.on('error', (err) => {
			clearTimeout(timeout);
			resolve({
				stdout: stdout.trim(),
				stderr: err.message,
				exitCode: 1,
				timedOut: false,
				error: err.message
			});
		});

		// Write input to stdin
		if (proc.stdin) {
			proc.stdin.write(input);
			proc.stdin.end();
		}
	});
}

/**
 * POST /api/hooks/execute
 *
 * Request body:
 * {
 *   command: string,     // Path to hook script (e.g., "./.claude/hooks/post-bash-jat-signal.sh")
 *   input: object,       // JSON object to pass as stdin
 *   timeout?: number     // Optional timeout in ms (default: 10000)
 * }
 *
 * Response:
 * {
 *   stdout: string,      // Script stdout
 *   stderr: string,      // Script stderr
 *   exitCode: number,    // Exit code (null if killed)
 *   timedOut: boolean,   // True if timeout was reached
 *   duration: number,    // Execution time in ms
 *   error?: string       // Error message if failed to execute
 * }
 */
export const POST: RequestHandler = async ({ request }) => {
	const startTime = Date.now();

	try {
		const body = await request.json();
		const { command, input, timeout = 10000 } = body as {
			command: string;
			input: Record<string, unknown>;
			timeout?: number;
		};

		// Validate command
		if (!command || typeof command !== 'string') {
			return json({ error: 'Missing or invalid command' }, { status: 400 });
		}

		// Validate input
		if (input === undefined || input === null) {
			return json({ error: 'Missing input object' }, { status: 400 });
		}

		// Serialize input to JSON string for stdin
		const inputJson = JSON.stringify(input);

		// Execute the hook
		const result = await executeHook(command, inputJson, Math.min(timeout, 30000));

		const duration = Date.now() - startTime;

		return json({
			...result,
			duration,
			command,
			resolvedPath: resolveHookPath(command)
		});
	} catch (error) {
		console.error('[hooks/execute API] Error:', error);
		return json(
			{
				error: 'Failed to execute hook',
				details: error instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			},
			{ status: 500 }
		);
	}
};
