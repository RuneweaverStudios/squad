/**
 * Git Pull API Endpoint
 *
 * POST /api/files/git/pull
 * Body: { project: string, remote?: string, branch?: string, rebase?: boolean }
 * Pull from remote, optionally with --rebase.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGitForProject, formatGitError } from '$lib/server/git.js';

export const POST: RequestHandler = async ({ request }) => {
	let body: { project?: string; remote?: string; branch?: string; rebase?: boolean };

	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const { project: projectName, remote = 'origin', branch, rebase = false } = body;

	if (!projectName) {
		throw error(400, 'Missing required parameter: project');
	}

	const result = await getGitForProject(projectName);
	if ('error' in result) {
		throw error(result.status, result.error);
	}

	const { git, projectPath } = result;

	try {
		let pullResult;

		if (rebase) {
			// git pull --rebase [remote] [branch]
			const args = ['pull', '--rebase'];
			if (remote) args.push(remote);
			if (branch) args.push(branch);
			await git.raw(args);

			// raw() doesn't return structured pull result, so get summary from status
			const status = await git.status();
			pullResult = {
				files: [],
				insertions: {},
				deletions: {},
				summary: {
					changes: 0,
					insertions: 0,
					deletions: 0
				}
			};
		} else {
			// Standard merge pull
			pullResult = await git.pull(
				remote || undefined,
				branch || undefined
			);
		}

		return json({
			success: true,
			project: projectName,
			projectPath,
			remote,
			branch: branch || null,
			rebase,
			files: pullResult.files,
			insertions: pullResult.insertions,
			deletions: pullResult.deletions,
			summary: {
				changes: pullResult.summary.changes,
				insertions: pullResult.summary.insertions,
				deletions: pullResult.summary.deletions
			}
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		const gitError = formatGitError(err as Error);
		throw error(gitError.status, gitError.error);
	}
};
