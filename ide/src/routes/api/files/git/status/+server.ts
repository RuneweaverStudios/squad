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
			renamed: status.renamed,
			created: status.created,
			not_added: status.not_added,
			conflicted: status.conflicted,
			isClean: status.isClean()
		});
	} catch (err) {
		const gitError = formatGitError(err as Error);
		throw error(gitError.status, gitError.error);
	}
};
