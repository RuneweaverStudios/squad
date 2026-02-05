/**
 * Git Stage API Endpoint
 *
 * POST /api/files/git/stage
 * Body: { project: string, paths: string[] }
 * Stage files for commit. Handles both existing files and deletions.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGitForProject, formatGitError } from '$lib/server/git.js';
import { existsSync } from 'fs';
import { resolve } from 'path';

export const POST: RequestHandler = async ({ request }) => {
	let body: { project?: string; paths?: string[] };

	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const { project: projectName, paths } = body;

	if (!projectName) {
		throw error(400, 'Missing required parameter: project');
	}

	if (!paths || !Array.isArray(paths) || paths.length === 0) {
		throw error(400, 'Missing required parameter: paths (array of file paths)');
	}

	const result = await getGitForProject(projectName);
	if ('error' in result) {
		throw error(result.status, result.error);
	}

	const { git, projectPath } = result;

	try {
		// Filter out gitignored paths first. Files that were previously tracked
		// but are now in .gitignore show as modified in git status, but git add
		// refuses to stage them. Use git check-ignore to detect and skip them.
		let ignoredSet = new Set<string>();
		try {
			const ignored = await git.raw(['check-ignore', '--no-index', ...paths]);
			for (const line of ignored.split('\n')) {
				const trimmed = line.trim();
				if (trimmed) ignoredSet.add(trimmed);
			}
		} catch {
			// check-ignore exits non-zero when no files are ignored - that's fine
		}

		const filteredPaths = paths.filter(p => !ignoredSet.has(p));
		if (filteredPaths.length === 0) {
			const status = await git.status();
			return json({
				success: true,
				project: projectName,
				projectPath,
				staged: [],
				stagedFiles: status.staged,
				skippedIgnored: paths.length
			});
		}

		// Split paths into existing files and deleted files.
		// 'git add' fails on deleted files (pathspec error), so we use
		// 'git add' for existing files and 'git rm --cached' for deletions.
		const existing: string[] = [];
		const deleted: string[] = [];

		for (const p of filteredPaths) {
			if (existsSync(resolve(projectPath, p))) {
				existing.push(p);
			} else {
				deleted.push(p);
			}
		}

		if (existing.length > 0) {
			await git.add(existing);
		}
		if (deleted.length > 0) {
			// --cached removes from index only (file already gone from disk)
			// --ignore-unmatch prevents error if file is already staged or not tracked
			await git.raw(['rm', '--cached', '--ignore-unmatch', '--', ...deleted]);
		}

		// Get updated status
		const status = await git.status();

		return json({
			success: true,
			project: projectName,
			projectPath,
			staged: paths,
			stagedFiles: status.staged
		});
	} catch (err) {
		const gitError = formatGitError(err as Error);
		throw error(gitError.status, gitError.error);
	}
};
