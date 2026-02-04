/**
 * Git Fetch API Endpoint
 *
 * POST /api/files/git/fetch
 * Body: { project: string, remote?: string, prune?: boolean }
 * Fetch updates from remote.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGitForProject, formatGitError } from '$lib/server/git.js';

export const POST: RequestHandler = async ({ request }) => {
	let body: { project?: string; remote?: string; prune?: boolean };

	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const { project: projectName, remote = 'origin', prune = false } = body;

	if (!projectName) {
		throw error(400, 'Missing required parameter: project');
	}

	const result = await getGitForProject(projectName);
	if ('error' in result) {
		throw error(result.status, result.error);
	}

	const { git, projectPath } = result;

	try {
		// Build fetch options
		const fetchOptions: string[] = [];
		if (prune) {
			fetchOptions.push('--prune');
		}

		// Fetch
		const fetchResult = await git.fetch(remote, fetchOptions);

		// Get updated status to show ahead/behind
		const status = await git.status();

		return json({
			success: true,
			project: projectName,
			projectPath,
			remote,
			raw: fetchResult?.raw || '',
			ahead: status.ahead,
			behind: status.behind,
			tracking: status.tracking
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		const gitError = formatGitError(err as Error);
		throw error(gitError.status, gitError.error);
	}
};
