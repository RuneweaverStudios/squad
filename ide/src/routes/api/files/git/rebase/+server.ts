/**
 * Git Rebase API Endpoint - Drop selected commits
 *
 * POST /api/files/git/rebase
 * Body: { project: string, dropCommits: string[], force?: boolean }
 *
 * Uses GIT_SEQUENCE_EDITOR with a sed script to non-interactively
 * change "pick <hash>" to "drop <hash>" for each selected commit.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGitForProject, formatGitError } from '$lib/server/git.js';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';

export const POST: RequestHandler = async ({ request }) => {
	let body: { project?: string; dropCommits?: string[]; force?: boolean };

	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const { project: projectName, dropCommits, force = false } = body;

	if (!projectName) {
		throw error(400, 'Missing required parameter: project');
	}

	if (!dropCommits || !Array.isArray(dropCommits) || dropCommits.length === 0) {
		throw error(400, 'Missing or empty dropCommits array');
	}

	// Validate commit hashes (basic sanitization - alphanumeric only)
	for (const hash of dropCommits) {
		if (!/^[a-f0-9]+$/i.test(hash)) {
			throw error(400, `Invalid commit hash: ${hash}`);
		}
	}

	const result = await getGitForProject(projectName);
	if ('error' in result) {
		throw error(result.status, result.error);
	}

	const { git, projectPath } = result;

	try {
		// Check for uncommitted changes (dirty working tree)
		const status = await git.status();
		const hasChanges = !status.isClean();
		if (hasChanges) {
			return json({
				success: false,
				error: 'Cannot rebase with uncommitted changes. Commit or stash your changes first.'
			}, { status: 409 });
		}

		// Check if we're already in a rebase
		const rebaseInProgress = await git.raw(['rev-parse', '--git-path', 'rebase-merge']).then(
			(p) => existsSync(join(projectPath, p.trim()))
		).catch(() => false);

		if (rebaseInProgress) {
			return json({
				success: false,
				error: 'A rebase is already in progress. Abort it first with git rebase --abort.'
			}, { status: 409 });
		}

		// Get the log to find commit details and validate
		const logResult = await git.log({ maxCount: 100 });
		const allCommits = logResult.all;

		if (allCommits.length === 0) {
			return json({
				success: false,
				error: 'No commits found in repository.'
			}, { status: 400 });
		}

		// Find which commits we're dropping by matching hash prefixes
		const commitMap = new Map<string, typeof allCommits[0]>();
		for (const commit of allCommits) {
			commitMap.set(commit.hash, commit);
			// Also map short hash
			commitMap.set(commit.hash.slice(0, 7), commit);
			commitMap.set(commit.hash.slice(0, 8), commit);
		}

		const resolvedDropHashes: string[] = [];
		for (const hash of dropCommits) {
			// Try exact match first, then prefix match
			const found = commitMap.get(hash) ||
				[...commitMap.values()].find(c => c.hash.startsWith(hash));
			if (!found) {
				return json({
					success: false,
					error: `Commit not found: ${hash}`
				}, { status: 404 });
			}
			resolvedDropHashes.push(found.hash);
		}

		// Check: cannot drop HEAD commit
		const headHash = allCommits[0].hash;
		if (resolvedDropHashes.includes(headHash)) {
			return json({
				success: false,
				error: 'Cannot drop the HEAD commit. Use git reset instead.'
			}, { status: 400 });
		}

		// Check: warn about pushed commits (unless force flag)
		if (!force) {
			// Get remote tracking info
			try {
				const remoteRef = await git.raw(['rev-parse', '--abbrev-ref', '@{upstream}']).catch(() => null);
				if (remoteRef) {
					const remoteBranch = remoteRef.trim();
					// Check if any of the drop commits are on the remote
					for (const hash of resolvedDropHashes) {
						const isOnRemote = await git.raw(['branch', '-r', '--contains', hash])
							.then(out => out.trim().length > 0)
							.catch(() => false);
						if (isOnRemote) {
							return json({
								success: false,
								error: 'Some selected commits exist on the remote. Dropping them will require a force-push. Set force=true to proceed.',
								requiresForce: true
							}, { status: 409 });
						}
					}
				}
			} catch {
				// No remote tracking - all commits are local, proceed
			}
		}

		// Find the oldest commit to drop and compute rebase base
		let oldestDropIndex = -1;
		for (let i = allCommits.length - 1; i >= 0; i--) {
			if (resolvedDropHashes.includes(allCommits[i].hash)) {
				oldestDropIndex = i;
				break;
			}
		}

		if (oldestDropIndex === -1) {
			return json({
				success: false,
				error: 'Could not find commits to drop in history.'
			}, { status: 400 });
		}

		// The rebase base is the parent of the oldest commit to drop
		// If the oldest commit is the last one in our log window, use --root
		let rebaseBase: string;
		if (oldestDropIndex < allCommits.length - 1) {
			rebaseBase = allCommits[oldestDropIndex + 1].hash;
		} else {
			// Oldest commit to drop is at the end of our log - use its parent
			const parents = await git.raw(['rev-parse', `${allCommits[oldestDropIndex].hash}^`])
				.catch(() => null);
			if (parents && parents.trim()) {
				rebaseBase = parents.trim();
			} else {
				// This is the root commit
				rebaseBase = '--root';
			}
		}

		// Build the sed script to change "pick <hash>" to "drop <hash>"
		const sedLines: string[] = [];
		for (const hash of resolvedDropHashes) {
			const shortHash = hash.slice(0, 7);
			// Match both short and long hashes that git rebase might use
			sedLines.push(`s/^pick ${shortHash}/drop ${shortHash}/`);
		}
		const sedScript = sedLines.join('\n') + '\n';

		// Write sed script to temp file
		const tmpFile = join(tmpdir(), `squad-rebase-${randomBytes(4).toString('hex')}.sed`);
		writeFileSync(tmpFile, sedScript, 'utf-8');

		try {
			// Execute the non-interactive rebase
			const rebaseArgs = ['rebase', '-i', rebaseBase];
			const env = {
				...process.env,
				GIT_SEQUENCE_EDITOR: `sed -i -f ${tmpFile}`
			};

			await git.env(env).raw(rebaseArgs);

			// Get updated log
			const newLog = await git.log({ maxCount: 50 });
			const newStatus = await git.status();

			return json({
				success: true,
				project: projectName,
				droppedCount: resolvedDropHashes.length,
				droppedCommits: resolvedDropHashes.map(h => h.slice(0, 7)),
				requiresForcePush: force,
				commits: newLog.all.map(c => ({
					hash: c.hash,
					hashShort: c.hash.slice(0, 7),
					date: c.date,
					message: c.message,
					author_name: c.author_name,
					author_email: c.author_email,
					refs: c.refs || ''
				})),
				status: {
					ahead: newStatus.ahead,
					behind: newStatus.behind
				}
			});
		} catch (rebaseErr) {
			// If rebase failed, try to abort it
			try {
				await git.raw(['rebase', '--abort']);
			} catch {
				// Abort failed too - let the user know
			}

			const message = rebaseErr instanceof Error ? rebaseErr.message : String(rebaseErr);

			if (message.includes('conflict') || message.includes('CONFLICT')) {
				return json({
					success: false,
					error: 'Rebase resulted in conflicts. The rebase has been automatically aborted. Try dropping fewer commits or resolving conflicts manually.',
					conflicted: true
				}, { status: 409 });
			}

			return json({
				success: false,
				error: `Rebase failed: ${message}. The rebase has been automatically aborted.`
			}, { status: 500 });
		} finally {
			// Clean up temp file
			try {
				unlinkSync(tmpFile);
			} catch {
				// Ignore cleanup errors
			}
		}
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		const gitError = formatGitError(err as Error);
		throw error(gitError.status, gitError.error);
	}
};
