/**
 * API endpoint for listing discoverable CLAUDE.md files
 *
 * GET /api/claude-md - Returns list of CLAUDE.md files with metadata
 *
 * Discovers files from:
 * - Project root CLAUDE.md
 * - dashboard/CLAUDE.md
 * - User's ~/.claude/CLAUDE.md
 * - Other project subdirectories with CLAUDE.md
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { homedir } from 'os';

interface ClaudeMdFile {
	path: string;
	displayName: string;
	location: 'project' | 'dashboard' | 'user' | 'subdirectory';
	lastModified: string;
	size: number;
}

async function getFileMetadata(filePath: string): Promise<{ lastModified: string; size: number } | null> {
	try {
		const stats = await stat(filePath);
		return {
			lastModified: stats.mtime.toISOString(),
			size: stats.size
		};
	} catch {
		return null;
	}
}

export const GET: RequestHandler = async () => {
	try {
		// Get project root (dashboard parent directory)
		const dashboardDir = process.cwd();
		const projectRoot = dirname(dashboardDir);
		const userClaudeDir = join(homedir(), '.claude');

		const files: ClaudeMdFile[] = [];

		// 1. Check project root CLAUDE.md
		const projectClaudeMd = join(projectRoot, 'CLAUDE.md');
		if (existsSync(projectClaudeMd)) {
			const metadata = await getFileMetadata(projectClaudeMd);
			if (metadata) {
				files.push({
					path: projectClaudeMd,
					displayName: 'Project CLAUDE.md',
					location: 'project',
					...metadata
				});
			}
		}

		// 2. Check dashboard CLAUDE.md
		const dashboardClaudeMd = join(dashboardDir, 'CLAUDE.md');
		if (existsSync(dashboardClaudeMd)) {
			const metadata = await getFileMetadata(dashboardClaudeMd);
			if (metadata) {
				files.push({
					path: dashboardClaudeMd,
					displayName: 'Dashboard CLAUDE.md',
					location: 'dashboard',
					...metadata
				});
			}
		}

		// 3. Check user's ~/.claude/CLAUDE.md
		const userClaudeMd = join(userClaudeDir, 'CLAUDE.md');
		if (existsSync(userClaudeMd)) {
			const metadata = await getFileMetadata(userClaudeMd);
			if (metadata) {
				files.push({
					path: userClaudeMd,
					displayName: 'User CLAUDE.md',
					location: 'user',
					...metadata
				});
			}
		}

		// 4. Check for other CLAUDE.md files in project subdirectories (1 level deep)
		const { readdirSync } = await import('fs');
		try {
			const entries = readdirSync(projectRoot, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dashboard') {
					const subClaudeMd = join(projectRoot, entry.name, 'CLAUDE.md');
					if (existsSync(subClaudeMd)) {
						const metadata = await getFileMetadata(subClaudeMd);
						if (metadata) {
							files.push({
								path: subClaudeMd,
								displayName: `${entry.name}/CLAUDE.md`,
								location: 'subdirectory',
								...metadata
							});
						}
					}
				}
			}
		} catch (e) {
			console.error('Error scanning subdirectories:', e);
		}

		return json({ files });
	} catch (error) {
		console.error('Error listing CLAUDE.md files:', error);
		return json({ error: 'Failed to list CLAUDE.md files' }, { status: 500 });
	}
};
