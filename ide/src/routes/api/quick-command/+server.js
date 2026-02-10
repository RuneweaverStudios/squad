/**
 * Quick Command Execution API
 * POST /api/quick-command
 *
 * Executes a single-turn agent command without full sessions.
 * Uses: claude -p '{prompt}' --model {model}
 *
 * No tmux session, no agent registration, no task creation.
 */

import { json } from '@sveltejs/kit';
import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, normalize, relative } from 'path';
import { getProjectPath } from '$lib/server/projectPaths.js';

/**
 * Replace {varName} placeholders in prompt with variable values.
 * @param {string} prompt
 * @param {Record<string, string>} variables
 * @returns {string}
 */
function substituteVariables(prompt, variables) {
	if (!variables || Object.keys(variables).length === 0) return prompt;

	let result = prompt;
	for (const [key, value] of Object.entries(variables)) {
		// Replace {key} but not {{key}} (escaped)
		result = result.replace(new RegExp(`(?<!\\{)\\{${key}\\}(?!\\})`, 'g'), value);
	}
	return result;
}

// Resolve file references (e.g. @readme.md, @src/lib/utils.ts) in prompt.
// Matches @path where path looks like a file (contains a dot or slash).
// Files are injected as XML blocks with path attribute.
/** @param {string} prompt */
/** @param {string} projectPath */
async function resolveFileReferences(prompt, projectPath) {
	// Match @path patterns where path looks like a file path
	// Requires at least one dot or slash to distinguish from plain words/emails
	// Won't match emails because emails have @ followed by domain (no dot before the @-word ends)
	const FILE_REF_PATTERN = /@([\w\-\.\/]+\.[\w\-\.\/]+)/g;
	const files = [];
	const errors = [];

	// Collect all matches first
	const matches = [];
	let match;
	while ((match = FILE_REF_PATTERN.exec(prompt)) !== null) {
		matches.push({ full: match[0], path: match[1], index: match.index });
	}

	if (matches.length === 0) {
		return { resolved: prompt, files, errors };
	}

	let resolved = prompt;
	// Process in reverse order to preserve string indices
	for (let i = matches.length - 1; i >= 0; i--) {
		const m = matches[i];
		const filePath = join(projectPath, m.path);
		const normalizedPath = normalize(filePath);

		// Security: ensure path stays within project
		const rel = relative(projectPath, normalizedPath);
		if (rel.startsWith('..') || rel.includes('..')) {
			errors.push(`${m.path}: path traversal not allowed`);
			continue;
		}

		if (!existsSync(normalizedPath)) {
			errors.push(`${m.path}: file not found`);
			continue;
		}

		try {
			const content = await readFile(normalizedPath, 'utf-8');
			const replacement = `<file path="${m.path}">\n${content}\n</file>`;
			resolved = resolved.slice(0, m.index) + replacement + resolved.slice(m.index + m.full.length);
			files.push({ path: m.path, size: content.length });
		} catch (err) {
			errors.push(`${m.path}: ${err.message}`);
		}
	}

	return { resolved, files, errors };
}

/**
 * Map short model names to CLI-compatible names.
 * @param {string} model
 * @returns {string}
 */
function resolveModel(model) {
	const modelMap = {
		haiku: 'haiku',
		sonnet: 'sonnet',
		opus: 'opus'
	};
	return modelMap[model] || model;
}

/**
 * Execute claude -p with prompt piped via stdin.
 * Uses spawn to pipe stdin (execFile doesn't support input option).
 * @param {string} prompt
 * @param {string} model
 * @param {string} cwd
 * @param {number} timeoutMs
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function execClaude(prompt, model, cwd, timeoutMs) {
	return new Promise((resolve, reject) => {
		const args = ['-p', '--model', model];
		const proc = spawn('claude', args, {
			cwd,
			env: { ...process.env },
			stdio: ['pipe', 'pipe', 'pipe']
		});

		let stdout = '';
		let stderr = '';
		let killed = false;

		const timer = setTimeout(() => {
			killed = true;
			proc.kill('SIGTERM');
		}, timeoutMs);

		proc.stdout.on('data', (data) => {
			stdout += data;
		});

		proc.stderr.on('data', (data) => {
			stderr += data;
		});

		proc.on('close', (code) => {
			clearTimeout(timer);
			if (killed) {
				reject(Object.assign(new Error('Timeout'), { killed: true }));
			} else if (code === 0) {
				resolve({ stdout, stderr });
			} else {
				reject(
					Object.assign(new Error(stderr || `claude exited with code ${code}`), {
						stderr,
						code
					})
				);
			}
		});

		proc.on('error', (err) => {
			clearTimeout(timer);
			reject(err);
		});

		// Pipe prompt via stdin
		proc.stdin.write(prompt);
		proc.stdin.end();
	});
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	const startTime = Date.now();

	try {
		const body = await request.json();
		const { prompt, project, model = 'haiku', variables = {}, timeout = 60000 } = body;

		// Validate required fields
		if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
			return json(
				{
					error: 'Missing required field: prompt',
					message: 'Prompt must be a non-empty string'
				},
				{ status: 400 }
			);
		}

		if (!project || typeof project !== 'string') {
			return json(
				{ error: 'Missing required field: project', message: 'Project name is required' },
				{ status: 400 }
			);
		}

		// Resolve project path
		const projectInfo = await getProjectPath(project);
		if (!projectInfo.exists) {
			return json(
				{
					error: 'Project not found',
					message: `Project '${project}' not found at ${projectInfo.path}`
				},
				{ status: 404 }
			);
		}

		// Substitute variables in prompt
		let resolvedPrompt = substituteVariables(prompt, variables);

		// Resolve @file references (inject file contents into prompt)
		const fileResult = await resolveFileReferences(resolvedPrompt, projectInfo.path);
		resolvedPrompt = fileResult.resolved;

		if (fileResult.errors.length > 0) {
			console.warn('[quick-command] File resolution warnings:', fileResult.errors);
		}

		if (fileResult.files.length > 0) {
			console.log(
				`[quick-command] Resolved ${fileResult.files.length} file(s):`,
				fileResult.files.map((f) => f.path)
			);
		}

		// Resolve model name
		const resolvedModel = resolveModel(model);

		// Validate timeout (5s min, 5min max)
		const timeoutMs = Math.min(Math.max(Number(timeout) || 60000, 5000), 300000);

		// Execute
		console.log(
			`[quick-command] Executing: model=${resolvedModel}, project=${project}, prompt=${resolvedPrompt.substring(0, 100)}...`
		);

		const { stdout } = await execClaude(resolvedPrompt, resolvedModel, projectInfo.path, timeoutMs);

		const durationMs = Date.now() - startTime;
		const result = stdout.trim();

		console.log(
			`[quick-command] Completed in ${durationMs}ms, result length: ${result.length}`
		);

		return json({
			success: true,
			result,
			model: resolvedModel,
			durationMs,
			timestamp: new Date().toISOString(),
			resolvedFiles: fileResult.files,
			fileErrors: fileResult.errors
		});
	} catch (error) {
		const durationMs = Date.now() - startTime;

		if (error.killed) {
			console.error(`[quick-command] Timeout after ${durationMs}ms`);
			return json(
				{
					error: 'Command timed out',
					message: 'Command exceeded timeout limit',
					durationMs
				},
				{ status: 408 }
			);
		}

		console.error('[quick-command] Execution failed:', error.message);
		return json(
			{
				error: 'Execution failed',
				message: error.stderr || error.message || 'Unknown error',
				durationMs
			},
			{ status: 500 }
		);
	}
}
