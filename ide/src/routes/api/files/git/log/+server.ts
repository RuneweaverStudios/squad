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
	if (!projectName) {
		throw error(400, 'Missing required parameter: project');
	}
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
		let incomingCommits: Array<{
			hash: string;
			hashShort: string;
			date: string;
			message: string;
			author_name: string;
			author_email: string;
			refs: string;
			isIncoming: true;
		}> = [];

		if (tracking) {
			try {
				// Get commits that are ahead of remote (unpushed)
				// git log origin/branch..HEAD --format=%H
				const unpushedLog = await git.log({
					from: tracking,
					to: 'HEAD'
				});
				unpushedHashes = new Set(unpushedLog.all.map(c => c.hash));

				// Get the remote HEAD commit hash using rev-parse
				// This correctly gets the hash of the tracking branch
				try {
					remoteHeadHash = await git.revparse([tracking]);
				} catch {
					// Tracking branch ref might not exist locally
					remoteHeadHash = null;
				}

				// Get commits on remote that are NOT in local history (need to be pulled)
				// Must use raw() with two-dot syntax: HEAD..origin/branch
				// simple-git's log({ from, to }) generates three-dot (symmetric diff) which
				// includes BOTH sides of divergence — we only want the remote-only side.
				try {
					const incomingRaw = await git.raw([
						'log', `HEAD..${tracking}`,
						'--format=%H%x1f%aI%x1f%s%x1f%an%x1f%ae%x1f%D',
						'--max-count=50'
					]);
					if (incomingRaw.trim()) {
						incomingCommits = incomingRaw.trim().split('\n').map(line => {
							const [hash, date, message, author_name, author_email, refs] = line.split('\x1f');
							return {
								hash,
								hashShort: hash.substring(0, 7),
								date,
								message,
								author_name,
								author_email,
								refs: refs || '',
								isIncoming: true as const
							};
						});
					}
				} catch {
					// No incoming commits or tracking branch issue
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

		// Find merge-base with default branch (for branch divergence indicator)
		let mergeBaseHash: string | null = null;
		let defaultBranch: string | null = null;

		if (currentBranch && currentBranch !== 'master' && currentBranch !== 'main') {
			for (const candidate of ['master', 'main']) {
				try {
					const result = await git.raw(['merge-base', 'HEAD', candidate]);
					mergeBaseHash = result.trim();
					defaultBranch = candidate;
					break;
				} catch {
					// Branch doesn't exist, try next
				}
			}
		}

		return json({
			project: projectName,
			projectPath,
			total: log.total,
			currentBranch,
			tracking,
			headHash,
			remoteHeadHash,
			mergeBaseHash,
			defaultBranch,
			unpushedCount: unpushedHashes.size,
			behindCount: incomingCommits.length,
			incomingCommits,
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
