/**
 * Git Branch API Endpoint
 *
 * GET /api/files/git/branch?project=<name>
 * Returns current branch and list of branches.
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
		const branchSummary = await git.branch();

		return json({
			project: projectName,
			projectPath,
			current: branchSummary.current,
			detached: branchSummary.detached,
			branches: Object.entries(branchSummary.branches).map(([name, branch]) => ({
				name,
				current: branch.current,
				commit: branch.commit,
				label: branch.label
			}))
		});
	} catch (err) {
		const gitError = formatGitError(err as Error);
		throw error(gitError.status, gitError.error);
	}
};
