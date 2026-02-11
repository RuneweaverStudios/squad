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
import { spawn, execFile } from 'child_process';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, normalize, relative } from 'path';
import { getProjectPath } from '$lib/server/projectPaths.js';

/**
 * Execute a shell command and return stdout.
 * @param {string} cmd
 * @param {string[]} args
 * @param {string} cwd
 * @param {number} [timeoutMs=10000]
 * @returns {Promise<string>}
 */
function execCommand(cmd, args, cwd, timeoutMs = 10000) {
	return new Promise((resolve, reject) => {
		execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout) => {
			if (err) reject(err);
			else resolve(stdout);
		});
	});
}

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

// --- Context Providers ---
// Resolve @task:ID, @git:diff, @git:log:N, @git:branch, @mail:THREAD, @url:URL
// Must run BEFORE resolveFileReferences to avoid pattern overlap.

/** @type {Array<{pattern: RegExp, type: string, resolve: (match: RegExpMatchArray, cwd: string) => Promise<{content: string, ref: string}>}>} */
const CONTEXT_PROVIDERS = [
	{
		// @task:ID - inject task details
		pattern: /@task:([\w\-\.]+)/g,
		type: 'task',
		resolve: async (match, cwd) => {
			const taskId = match[1];
			const stdout = await execCommand('jt', ['show', taskId, '--json'], cwd);
			const tasks = JSON.parse(stdout);
			if (!tasks || tasks.length === 0) throw new Error(`Task '${taskId}' not found`);
			const t = tasks[0];
			const lines = [
				`Title: ${t.title}`,
				`Status: ${t.status}`,
				`Priority: P${t.priority}`,
				`Type: ${t.issue_type}`,
				t.assignee ? `Assignee: ${t.assignee}` : null,
				t.labels?.length ? `Labels: ${t.labels.join(', ')}` : null,
				t.description ? `\nDescription:\n${t.description}` : null,
				t.dependencies?.length ? `\nDependencies:\n${t.dependencies.map(d => `  - ${d.id}: ${d.title} [${d.status}]`).join('\n')}` : null,
				t.dependents?.length ? `\nBlocks:\n${t.dependents.map(d => `  - ${d.id}: ${d.title} [${d.status}]`).join('\n')}` : null
			].filter(Boolean);
			return { content: lines.join('\n'), ref: taskId };
		}
	},
	{
		// @git:diff - inject staged + unstaged diff
		pattern: /@git:diff/g,
		type: 'git',
		resolve: async (_match, cwd) => {
			const [unstaged, staged] = await Promise.all([
				execCommand('git', ['diff'], cwd).catch(() => ''),
				execCommand('git', ['diff', '--cached'], cwd).catch(() => '')
			]);
			const parts = [];
			if (staged.trim()) parts.push(`--- Staged changes ---\n${staged.trim()}`);
			if (unstaged.trim()) parts.push(`--- Unstaged changes ---\n${unstaged.trim()}`);
			if (parts.length === 0) return { content: '(no changes)', ref: 'diff' };
			return { content: parts.join('\n\n'), ref: 'diff' };
		}
	},
	{
		// @git:log:N - inject last N commits (default 10)
		pattern: /@git:log(?::(\d+))?/g,
		type: 'git',
		resolve: async (match, cwd) => {
			const n = Math.min(parseInt(match[1] || '10', 10), 100);
			const stdout = await execCommand('git', ['log', `--oneline`, `-${n}`], cwd);
			return { content: stdout.trim() || '(no commits)', ref: `log:${n}` };
		}
	},
	{
		// @git:branch - inject current branch and status
		pattern: /@git:branch/g,
		type: 'git',
		resolve: async (_match, cwd) => {
			const [branch, status] = await Promise.all([
				execCommand('git', ['branch', '--show-current'], cwd),
				execCommand('git', ['status', '--short'], cwd).catch(() => '')
			]);
			const lines = [`Branch: ${branch.trim()}`];
			if (status.trim()) {
				lines.push(`\nStatus:\n${status.trim()}`);
			} else {
				lines.push('Status: clean');
			}
			return { content: lines.join('\n'), ref: 'branch' };
		}
	},
	{
		// @mail:THREAD - inject Agent Mail thread messages
		pattern: /@mail:([\w\-\.]+)/g,
		type: 'mail',
		resolve: async (match, cwd) => {
			const thread = match[1];
			const stdout = await execCommand('am-inbox', ['--thread', thread, '--json', '@all'], cwd);
			const messages = JSON.parse(stdout);
			if (!messages || messages.length === 0) return { content: '(no messages in thread)', ref: thread };
			const formatted = messages.map(m =>
				`[${m.created_at || m.timestamp}] ${m.from_agent} → ${m.to_agent}: ${m.subject}\n${m.body}`
			).join('\n---\n');
			return { content: formatted, ref: thread };
		}
	},
	{
		// @url:URL - fetch URL content (with size limit)
		pattern: /@url:(https?:\/\/[^\s]+)/g,
		type: 'url',
		resolve: async (match, _cwd) => {
			const url = match[1];
			// Security: basic URL validation (no file://, no localhost by default)
			const parsed = new URL(url);
			if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
				throw new Error('Only http/https URLs are allowed');
			}
			// Block internal/private IPs
			const host = parsed.hostname;
			if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.startsWith('192.168.') || host.startsWith('10.') || host.startsWith('172.')) {
				throw new Error('Internal/private URLs are not allowed');
			}

			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), 10000);
			try {
				const res = await fetch(url, {
					signal: controller.signal,
					headers: { 'User-Agent': 'JAT-IDE/1.0' }
				});
				clearTimeout(timer);
				if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
				const text = await res.text();
				// Limit content size (100KB)
				const maxSize = 100 * 1024;
				const content = text.length > maxSize ? text.slice(0, maxSize) + '\n... (truncated)' : text;
				return { content, ref: url };
			} finally {
				clearTimeout(timer);
			}
		}
	}
];

/**
 * Resolve context provider references in prompt.
 * @param {string} prompt
 * @param {string} projectPath
 * @returns {Promise<{resolved: string, providers: Array<{type: string, ref: string, size: number}>, errors: string[]}>}
 */
async function resolveContextProviders(prompt, projectPath) {
	const providers = [];
	const errors = [];
	let resolved = prompt;

	for (const provider of CONTEXT_PROVIDERS) {
		// Collect all matches for this provider
		const matches = [];
		let m;
		// Reset regex state
		const regex = new RegExp(provider.pattern.source, provider.pattern.flags);
		while ((m = regex.exec(resolved)) !== null) {
			matches.push({ full: m[0], groups: m, index: m.index });
		}

		if (matches.length === 0) continue;

		// Process in reverse order to preserve indices
		for (let i = matches.length - 1; i >= 0; i--) {
			const match = matches[i];
			try {
				const result = await provider.resolve(match.groups, projectPath);
				const replacement = `<context type="${provider.type}" ref="${result.ref}">\n${result.content}\n</context>`;
				resolved = resolved.slice(0, match.index) + replacement + resolved.slice(match.index + match.full.length);
				providers.push({ type: provider.type, ref: result.ref, size: result.content.length });
			} catch (err) {
				errors.push(`@${provider.type}:${match.groups[1] || ''}: ${err.message}`);
			}
		}
	}

	return { resolved, providers, errors };
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

		// Resolve context providers FIRST (@task:, @git:, @mail:, @url:)
		// Must run before file references to avoid pattern overlap
		const providerResult = await resolveContextProviders(resolvedPrompt, projectInfo.path);
		resolvedPrompt = providerResult.resolved;

		if (providerResult.errors.length > 0) {
			console.warn('[quick-command] Provider resolution warnings:', providerResult.errors);
		}

		if (providerResult.providers.length > 0) {
			console.log(
				`[quick-command] Resolved ${providerResult.providers.length} provider(s):`,
				providerResult.providers.map((p) => `${p.type}:${p.ref}`)
			);
		}

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
			fileErrors: fileResult.errors,
			resolvedProviders: providerResult.providers,
			providerErrors: providerResult.errors
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
