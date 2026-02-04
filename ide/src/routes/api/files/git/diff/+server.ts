/**
 * Git Diff API Endpoint
 *
 * GET /api/files/git/diff?project=<name>&path=<file>
 * Returns diff for a specific file or all changes if no path specified.
 *
 * Query parameters:
 * - project: Project name (required)
 * - path: Specific file path (optional - if omitted, returns all changes)
 * - staged: 'true' for staged changes (optional)
 * - baseline: Git ref to compare against (optional - e.g., commit SHA, branch name)
 * - commit: Specific commit hash to show changes from (optional)
 *           When provided, shows the diff for that commit (parent -> commit)
 *
 * When path is specified, also returns original (baseline/HEAD) and modified (working tree)
 * content for use with Monaco diff editor.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGitForProject, formatGitError } from '$lib/server/git.js';
import { readFile } from 'fs/promises';
import { join } from 'path';

export const GET: RequestHandler = async ({ url }) => {
	const projectName = url.searchParams.get('project');
	if (!projectName) {
		throw error(400, 'Missing required parameter: project');
	}
	const filePath = url.searchParams.get('path');
	const staged = url.searchParams.get('staged') === 'true';
	const baseline = url.searchParams.get('baseline'); // New: baseline commit for comparison
	const commit = url.searchParams.get('commit'); // Specific commit to show diff for

	const result = await getGitForProject(projectName);
	if ('error' in result) {
		throw error(result.status, result.error);
	}

	const { git, projectPath } = result;

	try {
		let diff: string;

		if (commit) {
			// Show diff for a specific commit (parent -> commit)
			// Use commit~1 (parent) as the base for comparison
			diff = filePath
				? await git.diff([`${commit}~1`, commit, '--', filePath])
				: await git.diff([`${commit}~1`, commit]);
		} else if (baseline) {
			// Compare against baseline commit (for review diffs)
			// This shows all changes from baseline to current working tree
			diff = filePath
				? await git.diff([baseline, '--', filePath])
				: await git.diff([baseline]);
		} else if (staged) {
			// Staged changes (--cached)
			diff = filePath ? await git.diff(['--cached', '--', filePath]) : await git.diff(['--cached']);
		} else {
			// Unstaged changes
			diff = filePath ? await git.diff(['--', filePath]) : await git.diff();
		}

		// Parse diff into structured format
		const files = parseDiff(diff);

		// If a specific file path is requested, also fetch original and modified content
		// for Monaco diff editor
		let original: string | null = null;
		let modified: string | null = null;

		if (filePath) {
			try {
				if (commit) {
					// For commit diff: original is parent commit, modified is the commit itself
					try {
						original = await git.show([`${commit}~1:${filePath}`]);
					} catch {
						// New file in this commit - no original
						original = '';
					}
					try {
						modified = await git.show([`${commit}:${filePath}`]);
					} catch {
						// Deleted file in this commit - no modified content
						modified = '';
					}
				} else if (baseline) {
					// For baseline diff: original is baseline commit, modified is working tree
					try {
						original = await git.show([`${baseline}:${filePath}`]);
					} catch {
						// New file since baseline - no original
						original = '';
					}
					// Read current working tree content
					const fullPath = join(projectPath, filePath);
					try {
						modified = await readFile(fullPath, 'utf-8');
					} catch {
						// Deleted file - no modified content
						modified = '';
					}
				} else if (staged) {
					// For staged diff: original is HEAD, modified is staged content
					original = await git.show([`HEAD:${filePath}`]);
					modified = await git.show([`:${filePath}`]); // Index/staged content
				} else {
					// For unstaged diff: original is HEAD (or staged if exists), modified is working tree
					try {
						// Try to get from staged area first
						original = await git.show([`:${filePath}`]);
					} catch {
						// Fall back to HEAD if not staged
						try {
							original = await git.show([`HEAD:${filePath}`]);
						} catch {
							// New file - no original
							original = '';
						}
					}
					// Read current working tree content
					const fullPath = join(projectPath, filePath);
					try {
						modified = await readFile(fullPath, 'utf-8');
					} catch {
						// Deleted file - no modified content
						modified = '';
					}
				}
			} catch (err) {
				// If we can't get content, that's okay - the raw diff is still useful
				console.warn(`Could not fetch file contents for diff: ${err}`);
			}
		}

		return json({
			project: projectName,
			projectPath,
			path: filePath || null,
			staged,
			baseline: baseline || null, // Include baseline ref if provided
			commit: commit || null, // Include commit hash if provided
			raw: diff,
			files,
			// Include original and modified content for Monaco diff editor
			original,
			modified
		});
	} catch (err) {
		const gitError = formatGitError(err as Error);
		throw error(gitError.status, gitError.error);
	}
};

interface DiffFile {
	path: string;
	additions: number;
	deletions: number;
	chunks: DiffChunk[];
	// Metadata changes (mode, rename, etc.)
	modeChange?: { oldMode: string; newMode: string };
	isNewFile?: boolean;
	isDeletedFile?: boolean;
	isBinary?: boolean;
}

interface DiffChunk {
	header: string;
	changes: DiffChange[];
}

interface DiffChange {
	type: 'add' | 'delete' | 'normal';
	line: string;
	lineNumber?: number;
}

/**
 * Parse git diff output into structured format
 */
function parseDiff(diff: string): DiffFile[] {
	if (!diff.trim()) {
		return [];
	}

	const files: DiffFile[] = [];
	const fileDiffs = diff.split(/^diff --git /m).filter(Boolean);

	for (const fileDiff of fileDiffs) {
		const lines = fileDiff.split('\n');

		// Extract file path from first line (a/path b/path)
		const firstLine = lines[0];
		const pathMatch = firstLine.match(/a\/(.+?) b\//);
		const path = pathMatch ? pathMatch[1] : 'unknown';

		let additions = 0;
		let deletions = 0;
		const chunks: DiffChunk[] = [];
		let currentChunk: DiffChunk | null = null;

		// Metadata detection
		let modeChange: { oldMode: string; newMode: string } | undefined;
		let isNewFile = false;
		let isDeletedFile = false;
		let isBinary = false;

		for (let i = 1; i < lines.length; i++) {
			const line = lines[i];

			// Detect mode changes
			if (line.startsWith('old mode ')) {
				const oldMode = line.substring(9).trim();
				// Look for new mode on next line
				const nextLine = lines[i + 1];
				if (nextLine && nextLine.startsWith('new mode ')) {
					const newMode = nextLine.substring(9).trim();
					modeChange = { oldMode, newMode };
					i++; // Skip the next line since we processed it
				}
				continue;
			}
			if (line.startsWith('new mode ')) {
				// Standalone new mode (shouldn't happen but handle gracefully)
				continue;
			}

			// Detect new/deleted files
			if (line.startsWith('new file mode')) {
				isNewFile = true;
				continue;
			}
			if (line.startsWith('deleted file mode')) {
				isDeletedFile = true;
				continue;
			}

			// Detect binary files
			if (line.includes('Binary files') || line.startsWith('Binary files')) {
				isBinary = true;
				continue;
			}

			// Chunk header
			if (line.startsWith('@@')) {
				if (currentChunk) {
					chunks.push(currentChunk);
				}
				currentChunk = {
					header: line,
					changes: []
				};
				continue;
			}

			// Skip diff metadata lines
			if (
				line.startsWith('index ') ||
				line.startsWith('---') ||
				line.startsWith('+++')
			) {
				continue;
			}

			// Parse changes
			if (currentChunk) {
				if (line.startsWith('+')) {
					currentChunk.changes.push({ type: 'add', line: line.substring(1) });
					additions++;
				} else if (line.startsWith('-')) {
					currentChunk.changes.push({ type: 'delete', line: line.substring(1) });
					deletions++;
				} else if (line.startsWith(' ') || line === '') {
					currentChunk.changes.push({ type: 'normal', line: line.substring(1) || '' });
				}
			}
		}

		if (currentChunk) {
			chunks.push(currentChunk);
		}

		files.push({
			path,
			additions,
			deletions,
			chunks,
			modeChange,
			isNewFile,
			isDeletedFile,
			isBinary
		});
	}

	return files;
}
