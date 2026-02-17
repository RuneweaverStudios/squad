/**
 * Context Provider Autocomplete Search API
 * GET /api/context-providers/search?provider=<type>&query=<search>&project=<name>
 *
 * Returns autocomplete suggestions for context providers.
 *
 * Providers:
 * - task: Search tasks by ID or title
 * - git: List available git subcommands
 * - memory: Search project memory entries
 * - url: No autocomplete (returns empty)
 */

import { json } from '@sveltejs/kit';
import { execFile } from 'child_process';
import type { RequestHandler } from './$types';
import { getProjectPath } from '$lib/server/projectPaths';

interface ProviderResult {
	value: string;
	label: string;
	description?: string;
}

function execCommand(cmd: string, args: string[], cwd: string, timeoutMs = 10000): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout) => {
			if (err) reject(err);
			else resolve(stdout);
		});
	});
}

async function searchTasks(query: string, cwd: string): Promise<ProviderResult[]> {
	try {
		const stdout = await execCommand('jt', ['search', query, '--limit', '10', '--json'], cwd);
		const tasks = JSON.parse(stdout);
		return tasks.map((t: { id: string; title: string; status: string; priority: number }) => ({
			value: t.id,
			label: t.id,
			description: `[P${t.priority}] ${t.title} (${t.status})`
		}));
	} catch {
		// Fallback: list ready tasks if search fails
		try {
			const stdout = await execCommand('jt', ['list', '--status', 'open', '--json'], cwd);
			const tasks = JSON.parse(stdout);
			const filtered = query
				? tasks.filter((t: { id: string; title: string }) =>
					t.id.toLowerCase() === query.toLowerCase() ||
					t.title.toLowerCase().includes(query.toLowerCase())
				)
				: tasks;
			return filtered.slice(0, 10).map((t: { id: string; title: string; status: string; priority: number }) => ({
				value: t.id,
				label: t.id,
				description: `[P${t.priority}] ${t.title} (${t.status})`
			}));
		} catch {
			return [];
		}
	}
}

function getGitSubcommands(): ProviderResult[] {
	return [
		{ value: 'diff', label: 'diff', description: 'Staged + unstaged changes' },
		{ value: 'log', label: 'log', description: 'Recent commit messages (default: 10)' },
		{ value: 'log:5', label: 'log:5', description: 'Last 5 commits' },
		{ value: 'log:20', label: 'log:20', description: 'Last 20 commits' },
		{ value: 'branch', label: 'branch', description: 'Current branch name and status' }
	];
}

async function searchMemory(query: string, cwd: string): Promise<ProviderResult[]> {
	try {
		const searchQuery = query || '*';
		const stdout = await execCommand('jat-memory', ['search', searchQuery, '--limit', '10', '--json'], cwd, 15000);
		const results = JSON.parse(stdout);
		if (!Array.isArray(results)) return [];
		// Deduplicate by value (same taskId can appear in multiple sections)
		const seen = new Set<string>();
		return results
			.map((r: { taskId?: string; path?: string; section?: string; snippet?: string; score?: number }) => ({
				value: r.taskId || r.path || '',
				label: r.taskId || r.path || '',
				description: r.snippet ? r.snippet.slice(0, 80) : (r.section || '')
			}))
			.filter(r => {
				if (!r.value || seen.has(r.value)) return false;
				seen.add(r.value);
				return true;
			});
	} catch {
		return [];
	}
}

export const GET: RequestHandler = async ({ url }) => {
	const provider = url.searchParams.get('provider') || '';
	const query = url.searchParams.get('query') || '';
	const projectName = url.searchParams.get('project') || '';

	if (!provider) {
		return json({ error: 'Missing provider parameter' }, { status: 400 });
	}

	// Get project path for CLI commands
	let cwd = process.cwd().replace(/\/ide$/, '');
	if (projectName) {
		const projectInfo = await getProjectPath(projectName);
		if (projectInfo.exists) {
			cwd = projectInfo.path;
		}
	}

	let results: ProviderResult[] = [];

	switch (provider) {
		case 'task':
			results = await searchTasks(query, cwd);
			break;
		case 'git':
			results = getGitSubcommands().filter(cmd =>
				!query || cmd.value.toLowerCase().includes(query.toLowerCase())
			);
			break;
		case 'memory':
			results = await searchMemory(query, cwd);
			break;
		case 'url':
			// No autocomplete for URLs
			results = [];
			break;
		default:
			return json({ error: `Unknown provider: ${provider}` }, { status: 400 });
	}

	return json({ provider, query, results });
};
