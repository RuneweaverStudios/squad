/**
 * Memory API
 *
 * GET /api/memory?action=status          - Index stats across all projects
 * GET /api/memory?action=search&q=...    - Search memory entries
 * GET /api/memory?action=browse&project= - Browse memory files
 * POST /api/memory                       - Reindex (body: { project?, force? })
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const execAsync = promisify(exec);

/**
 * Discover all projects with .squad/memory/ directories
 * @returns {Promise<Array<{name: string, path: string, hasIndex: boolean, hasMemoryDir: boolean}>>}
 */
async function discoverMemoryProjects() {
	const codeDir = join(homedir(), 'code');
	if (!existsSync(codeDir)) return [];

	const entries = await readdir(codeDir, { withFileTypes: true });
	const projects = [];

	for (const entry of entries) {
		if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
		const projectPath = join(codeDir, entry.name);
		const squadDir = join(projectPath, '.squad');
		if (!existsSync(squadDir)) continue;

		const memoryDir = join(squadDir, 'memory');
		const memoryDb = join(squadDir, 'memory.db');

		projects.push({
			name: entry.name,
			path: projectPath,
			hasIndex: existsSync(memoryDb),
			hasMemoryDir: existsSync(memoryDir)
		});
	}

	return projects;
}

/**
 * Get memory status for a single project using squad-memory CLI
 * @param {string} projectPath
 * @returns {Promise<Record<string, any>|null>}
 */
async function getProjectStatus(projectPath) {
	try {
		const { stdout } = await execAsync(
			`squad-memory status --project "${projectPath}" --json`,
			{ timeout: 10000 }
		);
		return JSON.parse(stdout.trim());
	} catch {
		return null;
	}
}

/**
 * Browse memory files in a project's .squad/memory/ directory
 * @param {string} projectPath
 * @returns {Promise<Array<object>>}
 */
async function browseMemoryFiles(projectPath) {
	const memoryDir = join(projectPath, '.squad', 'memory');
	if (!existsSync(memoryDir)) return [];

	const files = await readdir(memoryDir);
	const mdFiles = files.filter((f) => f.endsWith('.md')).sort().reverse();

	const results = [];
	for (const filename of mdFiles) {
		const filePath = join(memoryDir, filename);
		const stats = await stat(filePath);
		const content = await readFile(filePath, 'utf-8');

		// Parse frontmatter
		const frontmatter = parseFrontmatter(content);
		// Get first heading or filename as title
		const titleMatch = content.match(/^#\s+(.+)$/m);
		const title = titleMatch?.[1] || filename.replace('.md', '');

		// Get summary section
		const summaryMatch = content.match(/## Summary\n([\s\S]*?)(?=\n## |\n---|\Z)/);
		const summary = summaryMatch?.[1]?.trim()?.slice(0, 200) || '';

		results.push({
			filename,
			path: filePath,
			title,
			summary,
			size: stats.size,
			modified: stats.mtime.toISOString(),
			...frontmatter
		});
	}

	return results;
}

/**
 * Parse YAML-like frontmatter from a markdown file
 * @param {string} content
 * @returns {Record<string, string | string[]>}
 */
function parseFrontmatter(content) {
	const match = content.match(/^---\n([\s\S]*?)\n---/);
	if (!match) return {};

	/** @type {Record<string, string | string[]>} */
	const fm = {};
	const lines = match[1].split('\n');
	for (const line of lines) {
		const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.+)$/);
		if (!kvMatch) continue;

		const [, key, rawValue] = kvMatch;
		const value = rawValue.trim();

		// Parse arrays: [item1, item2]
		if (value.startsWith('[') && value.endsWith(']')) {
			fm[key] = value
				.slice(1, -1)
				.split(',')
				.map((v) => v.trim());
		} else {
			fm[key] = value;
		}
	}

	return fm;
}

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
	const action = url.searchParams.get('action') || 'status';

	try {
		if (action === 'status') {
			const projects = await discoverMemoryProjects();
			const statuses = [];

			for (const project of projects) {
				if (!project.hasMemoryDir && !project.hasIndex) continue;

				const status = project.hasIndex ? await getProjectStatus(project.path) : null;
				const memoryDir = join(project.path, '.squad', 'memory');
				let fileCount = 0;
				if (existsSync(memoryDir)) {
					const files = await readdir(memoryDir);
					fileCount = files.filter((f) => f.endsWith('.md')).length;
				}

				statuses.push({
					project: project.name,
					path: project.path,
					hasIndex: project.hasIndex,
					fileCount,
					...(status?.error ? { error: status.error } : status || {})
				});
			}

			return json({ projects: statuses, timestamp: new Date().toISOString() });
		}

		if (action === 'search') {
			const query = url.searchParams.get('q');
			if (!query) {
				return json({ error: 'Missing query parameter: q' }, { status: 400 });
			}

			const project = url.searchParams.get('project');
			const limit = parseInt(url.searchParams.get('limit') || '10');

			// Search across specified project or all projects
			const projects = await discoverMemoryProjects();
			const searchTargets = project
				? projects.filter((p) => p.name === project && p.hasIndex)
				: projects.filter((p) => p.hasIndex);

			const allResults = [];
			for (const proj of searchTargets) {
				try {
					const safeQuery = query.replace(/'/g, "'\\''");
					const { stdout } = await execAsync(
						`squad-memory search '${safeQuery}' --project "${proj.path}" --limit ${limit} --json`,
						{ timeout: 15000 }
					);
					const results = JSON.parse(stdout.trim());
					if (Array.isArray(results)) {
						allResults.push(
							...results.map((r) => ({
								...r,
								project: proj.name
							}))
						);
					}
				} catch {
					// Skip projects that fail to search
				}
			}

			// Sort by score descending
			allResults.sort((a, b) => (b.score || 0) - (a.score || 0));

			return json({
				results: allResults.slice(0, limit),
				query,
				totalResults: allResults.length,
				timestamp: new Date().toISOString()
			});
		}

		if (action === 'browse') {
			const projectName = url.searchParams.get('project');
			if (!projectName) {
				return json({ error: 'Missing parameter: project' }, { status: 400 });
			}

			const projectPath = join(homedir(), 'code', projectName);
			if (!existsSync(join(projectPath, '.squad'))) {
				return json({ error: `Project not found: ${projectName}` }, { status: 404 });
			}

			const files = await browseMemoryFiles(projectPath);
			return json({ files, project: projectName, timestamp: new Date().toISOString() });
		}

		if (action === 'file') {
			const projectName = url.searchParams.get('project');
			const filename = url.searchParams.get('filename');
			if (!projectName || !filename) {
				return json({ error: 'Missing parameters: project, filename' }, { status: 400 });
			}

			// Security: prevent path traversal
			if (filename.includes('..') || filename.includes('/')) {
				return json({ error: 'Invalid filename' }, { status: 400 });
			}

			const filePath = join(homedir(), 'code', projectName, '.squad', 'memory', filename);
			if (!existsSync(filePath)) {
				return json({ error: 'File not found' }, { status: 404 });
			}

			const content = await readFile(filePath, 'utf-8');
			const frontmatter = parseFrontmatter(content);
			return json({ content, frontmatter, filename, project: projectName });
		}

		return json({ error: `Unknown action: ${action}` }, { status: 400 });
	} catch (error) {
		console.error('Memory API error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Memory API error' },
			{ status: 500 }
		);
	}
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	try {
		const body = await request.json();
		const { project, force = false } = body;

		const projects = await discoverMemoryProjects();
		const targets = project
			? projects.filter((p) => p.name === project)
			: projects.filter((p) => p.hasMemoryDir);

		if (targets.length === 0) {
			return json({ error: 'No projects with memory files found' }, { status: 404 });
		}

		const results = [];
		for (const proj of targets) {
			try {
				const flags = force ? '--force --skip-embeddings --json' : '--skip-embeddings --json';
				const { stdout } = await execAsync(
					`squad-memory index --project "${proj.path}" ${flags}`,
					{ timeout: 60000 }
				);
				const result = JSON.parse(stdout.trim());
				results.push({ project: proj.name, ...result });
			} catch (err) {
				results.push({
					project: proj.name,
					error: err instanceof Error ? err.message : 'Index failed'
				});
			}
		}

		return json({ results, timestamp: new Date().toISOString() });
	} catch (error) {
		console.error('Memory reindex error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Reindex failed' },
			{ status: 500 }
		);
	}
}
