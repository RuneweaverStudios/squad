/**
 * Git Log API Endpoint
 *
 * GET /api/files/git/log?project=<name>&limit=<n>
 * Returns recent commits (timeline) with pushed/unpushed status.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGitForProject, formatGitError } from '$lib/server/git.js';

export const GET: RequestHandler = async ({ url }) => {
	const projectName = url.searchParams.get('project');
	const limitParam = url.searchParams.get('limit');
	const limit = limitParam ? parseInt(limitParam, 10) : 20;

	const result = await getGitForProject(projectName);
	if ('error' in result) {
		throw error(result.status, result.error);
	}

	const { git, projectPath } = result;

	try {
		// Get current branch and tracking info
		const status = await git.status();
		const currentBranch = status.current;
		const tracking = status.tracking;

		// Get the list of unpushed commit hashes
		// These are commits that exist locally but not on the remote tracking branch
		let unpushedHashes = new Set<string>();
		let remoteHeadHash: string | null = null;

		if (tracking) {
			try {
				// Get commits that are ahead of remote (unpushed)
				// git log origin/branch..HEAD --format=%H
				const unpushedLog = await git.log({
					from: tracking,
					to: 'HEAD'
				});
				unpushedHashes = new Set(unpushedLog.all.map(c => c.hash));

				// Get the remote HEAD commit hash for reference
				const remoteLog = await git.log({
					maxCount: 1,
					from: tracking,
					to: tracking
				});
				if (remoteLog.latest) {
					remoteHeadHash = remoteLog.latest.hash;
				}
			} catch {
				// If tracking branch doesn't exist on remote yet, all commits are unpushed
				// This happens when you create a new branch that hasn't been pushed
				const allLog = await git.log({ maxCount: limit });
				unpushedHashes = new Set(allLog.all.map(c => c.hash));
			}
		}

		const log = await git.log({ maxCount: limit });

		// Get HEAD commit hash
		const headHash = log.latest?.hash || null;

		return json({
			project: projectName,
			projectPath,
			total: log.total,
			currentBranch,
			tracking,
			headHash,
			remoteHeadHash,
			unpushedCount: unpushedHashes.size,
			commits: log.all.map((commit) => ({
				hash: commit.hash,
				hashShort: commit.hash.substring(0, 7),
				date: commit.date,
				message: commit.message,
				author_name: commit.author_name,
				author_email: commit.author_email,
				refs: commit.refs,
				isHead: commit.hash === headHash,
				isPushed: !unpushedHashes.has(commit.hash),
				isRemoteHead: commit.hash === remoteHeadHash
			}))
		});
	} catch (err) {
		const gitError = formatGitError(err as Error);
		throw error(gitError.status, gitError.error);
	}
};
