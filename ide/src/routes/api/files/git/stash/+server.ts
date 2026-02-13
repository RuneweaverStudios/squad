/**
 * Git Stash API Endpoint
 *
 * GET /api/files/git/stash?project=<name>
 * Returns stash list with messages and dates.
 *
 * POST /api/files/git/stash
 * Body: { project: string, action: 'push' | 'pop' | 'apply' | 'drop', index?: number, message?: string }
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

	const { git } = result;

	try {
		const stashList = await git.stashList();
		const entries = stashList.all.map((entry: any, i: number) => ({
			index: i,
			hash: entry.hash,
			message: entry.message,
			date: entry.date
		}));

		return json({
			project: projectName,
			count: stashList.total,
			entries
		});
	} catch (err) {
		const gitError = formatGitError(err as Error);
		throw error(gitError.status, gitError.error);
	}
};

export const POST: RequestHandler = async ({ request }) => {
	let body: { project?: string; action?: string; index?: number; message?: string };

	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const { project: projectName, action, index = 0, message } = body;

	if (!projectName) {
		throw error(400, 'Missing required parameter: project');
	}

	if (!action || !['push', 'pop', 'apply', 'drop'].includes(action)) {
		throw error(400, 'Invalid action. Must be: push, pop, apply, or drop');
	}

	const result = await getGitForProject(projectName);
	if ('error' in result) {
		throw error(result.status, result.error);
	}

	const { git } = result;

	try {
		switch (action) {
			case 'push': {
				const args = ['stash', 'push', '--include-untracked'];
				if (message) {
					args.push('-m', message);
				}
				await git.raw(args);
				break;
			}
			case 'pop': {
				await git.raw(['stash', 'pop', `stash@{${index}}`]);
				break;
			}
			case 'apply': {
				await git.raw(['stash', 'apply', `stash@{${index}}`]);
				break;
			}
			case 'drop': {
				await git.raw(['stash', 'drop', `stash@{${index}}`]);
				break;
			}
		}

		// Return updated stash list
		const stashList = await git.stashList();
		const entries = stashList.all.map((entry: any, i: number) => ({
			index: i,
			hash: entry.hash,
			message: entry.message,
			date: entry.date
		}));

		return json({
			success: true,
			project: projectName,
			action,
			count: stashList.total,
			entries
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		const gitError = formatGitError(err as Error);
		throw error(gitError.status, gitError.error);
	}
};
