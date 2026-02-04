/**
 * Git Show API Endpoint
 *
 * GET /api/files/git/show?project=<name>&hash=<commit_hash>
 * Returns detailed commit information including file changes.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGitForProject, formatGitError } from '$lib/server/git.js';

interface FileChange {
	path: string;
	type: 'A' | 'M' | 'D' | 'R' | 'C' | 'U';
	additions: number;
	deletions: number;
	binary: boolean;
}

export const GET: RequestHandler = async ({ url }) => {
	const projectName = url.searchParams.get('project');
	if (!projectName) {
		throw error(400, 'Missing required parameter: project');
	}
	const commitHash = url.searchParams.get('hash');

	if (!commitHash) {
		throw error(400, 'Missing required parameter: hash');
	}

	const result = await getGitForProject(projectName);
	if ('error' in result) {
		throw error(result.status, result.error);
	}

	const { git, projectPath } = result;

	try {
		// Get commit details using git show
		const showResult = await git.show([
			commitHash,
			'--format=%H%n%h%n%an%n%ae%n%aI%n%cn%n%ce%n%cI%n%B%n---END_MESSAGE---',
			'--numstat'
		]);

		// Parse the output
		const lines = showResult.split('\n');
		const fullHash = lines[0];
		const shortHash = lines[1];
		const authorName = lines[2];
		const authorEmail = lines[3];
		const authorDate = lines[4];
		const committerName = lines[5];
		const committerEmail = lines[6];
		const committerDate = lines[7];

		// Find the message between line 8 and ---END_MESSAGE---
		const messageStart = 8;
		const messageEndIndex = lines.findIndex((line, idx) => idx >= messageStart && line === '---END_MESSAGE---');
		const message = lines.slice(messageStart, messageEndIndex).join('\n').trim();

		// Parse file changes (numstat format: additions\tdeletions\tfilepath)
		const fileChanges: FileChange[] = [];
		const statsStartIndex = messageEndIndex + 1;

		for (let i = statsStartIndex; i < lines.length; i++) {
			const line = lines[i].trim();
			if (!line) continue;

			// numstat format: "10\t5\tpath/to/file" or "-\t-\tbinary/file"
			const match = line.match(/^(-|\d+)\t(-|\d+)\t(.+)$/);
			if (match) {
				const additions = match[1] === '-' ? 0 : parseInt(match[1], 10);
				const deletions = match[2] === '-' ? 0 : parseInt(match[2], 10);
				const filePath = match[3];
				const isBinary = match[1] === '-' && match[2] === '-';

				fileChanges.push({
					path: filePath,
					type: 'M', // Will be updated below
					additions,
					deletions,
					binary: isBinary
				});
			}
		}

		// Get file change types using diff-tree
		if (fileChanges.length > 0) {
			try {
				const diffTreeResult = await git.raw([
					'diff-tree',
					'--no-commit-id',
					'--name-status',
					'-r',
					commitHash
				]);

				const statusLines = diffTreeResult.split('\n').filter(l => l.trim());
				const statusMap = new Map<string, 'A' | 'M' | 'D' | 'R' | 'C' | 'U'>();

				for (const line of statusLines) {
					// Format: "M\tpath/to/file" or "R100\told\tnew"
					const parts = line.split('\t');
					if (parts.length >= 2) {
						const status = parts[0].charAt(0) as 'A' | 'M' | 'D' | 'R' | 'C' | 'U';
						const filePath = parts.length === 3 ? parts[2] : parts[1]; // Handle renames
						statusMap.set(filePath, status);
					}
				}

				// Update file change types
				for (const change of fileChanges) {
					const status = statusMap.get(change.path);
					if (status) {
						change.type = status;
					}
				}
			} catch {
				// Ignore errors getting status types - we still have the numstat data
			}
		}

		// Get parent commits for context
		let parents: string[] = [];
		try {
			const parentResult = await git.raw(['rev-parse', `${commitHash}^@`]);
			parents = parentResult.split('\n').filter(p => p.trim());
		} catch {
			// No parents (initial commit) or error - that's fine
		}

		return json({
			project: projectName,
			projectPath,
			commit: {
				hash: fullHash,
				hashShort: shortHash,
				author: {
					name: authorName,
					email: authorEmail,
					date: authorDate
				},
				committer: {
					name: committerName,
					email: committerEmail,
					date: committerDate
				},
				message,
				parents,
				files: fileChanges,
				stats: {
					totalFiles: fileChanges.length,
					additions: fileChanges.reduce((sum, f) => sum + f.additions, 0),
					deletions: fileChanges.reduce((sum, f) => sum + f.deletions, 0)
				}
			}
		});
	} catch (err) {
		const gitError = formatGitError(err as Error);
		throw error(gitError.status, gitError.error);
	}
};
