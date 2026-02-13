/**
 * Git Status API Endpoint
 *
 * GET /api/files/git/status?project=<name>
 * Returns staged, unstaged, and untracked files.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGitForProject, formatGitError } from '$lib/server/git.js';

export const GET: RequestHandler = async ({ url }) => {
	const projectName = url.searchParams.get('project');
	if (!projectName) {
		throw error(400, 'Missing required parameter: project');
	}

	const result = await getGitForProject(projectName);
	if ('error' in result) {
		throw error(result.status, result.error);
	}

	const { git, projectPath } = result;

	try {
		const status = await git.status();

		// simple-git's status.renamed includes BOTH staged and unstaged renames
		// without distinguishing them. Parse porcelain output to find which
		// renames are already staged (index column = 'R') so we can exclude them.
		const stagedRenameSet = new Set<string>();
		try {
			const porcelain = await git.raw(['status', '--porcelain', '-z']);
			// -z format for renames: "XY newpath\0oldpath\0"
			const entries = porcelain.split('\0');
			for (let i = 0; i < entries.length; i++) {
				const entry = entries[i];
				if (!entry || entry.length < 3) continue;
				const x = entry[0]; // index status
				const y = entry[1]; // working tree status
				if (x === 'R' && y === ' ') {
					// Staged rename, no unstaged changes
					// entry.slice(3) = new path, entries[i+1] = old path
					const newPath = entry.slice(3);
					const oldPath = entries[i + 1];
					// simple-git uses from=old, to=new
					if (oldPath) stagedRenameSet.add(`${oldPath}\t${newPath}`);
					i++; // skip the old path entry
				}
			}
		} catch {
			// Fall through - porcelain parsing is best-effort
		}

		// Filter out already-staged renames from the renamed list
		const unstagedRenamed = status.renamed.filter(r => {
			const key = `${r.from}\t${r.to}`;
			return !stagedRenameSet.has(key);
		});

		// Get stash count
		let stashCount = 0;
		try {
			const stashList = await git.stashList();
			stashCount = stashList.total;
		} catch {
			// Stash list may fail on fresh repos with no stash
		}

		return json({
			project: projectName,
			projectPath,
			current: status.current,
			tracking: status.tracking,
			ahead: status.ahead,
			behind: status.behind,
			staged: status.staged,
			modified: status.modified,
			deleted: status.deleted,
			renamed: unstagedRenamed,
			created: status.created,
			not_added: status.not_added,
			conflicted: status.conflicted,
			isClean: status.isClean(),
			stashCount
		});
	} catch (err) {
		const gitError = formatGitError(err as Error);
		throw error(gitError.status, gitError.error);
	}
};
