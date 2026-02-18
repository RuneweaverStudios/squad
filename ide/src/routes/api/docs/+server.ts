/**
 * API endpoint to list and search shared SQUAD documentation files
 *
 * GET /api/docs
 * Lists all .md files in ~/code/squad/shared/
 *
 * Query params:
 *   ?search=term - Filter docs by content/title matching search term
 */

import { json, error } from '@sveltejs/kit';
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import type { RequestHandler } from './$types';

export interface DocFile {
	name: string; // filename without .md
	filename: string; // full filename with .md
	path: string; // full path
	title: string; // extracted from first # heading or filename
	description: string; // first paragraph or subtitle
	size: number; // file size in bytes
	modifiedAt: string; // ISO date string
}

/**
 * Extract title from markdown content
 * Looks for first # heading or uses filename
 */
function extractTitle(content: string, filename: string): string {
	const match = content.match(/^#\s+(.+)$/m);
	if (match) {
		return match[1].trim();
	}
	// Fall back to filename without extension
	return basename(filename, '.md')
		.split('-')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

/**
 * Extract description from markdown content
 * Looks for first paragraph after title or ## subtitle
 */
function extractDescription(content: string): string {
	// Try to find first paragraph after heading
	const lines = content.split('\n');
	let foundHeading = false;
	let description = '';

	for (const line of lines) {
		const trimmed = line.trim();

		// Skip empty lines
		if (!trimmed) continue;

		// Found a heading
		if (trimmed.startsWith('#')) {
			foundHeading = true;
			continue;
		}

		// After heading, take first non-empty, non-code line as description
		if (foundHeading && !trimmed.startsWith('```') && !trimmed.startsWith('- ')) {
			description = trimmed;
			break;
		}
	}

	// Limit to first 150 chars
	if (description.length > 150) {
		description = description.substring(0, 147) + '...';
	}

	return description;
}

/**
 * Check if content matches search term
 */
function matchesSearch(doc: DocFile, content: string, searchTerm: string): boolean {
	const lower = searchTerm.toLowerCase();
	return (
		doc.name.toLowerCase().includes(lower) ||
		doc.title.toLowerCase().includes(lower) ||
		doc.description.toLowerCase().includes(lower) ||
		content.toLowerCase().includes(lower)
	);
}

/**
 * Get the shared docs directory path
 */
function getSharedDocsPath(): string {
	// Use the squad project path
	return join(homedir(), 'code', 'squad', 'shared');
}

/**
 * GET /api/docs
 *
 * List all shared documentation files
 */
export const GET: RequestHandler = async ({ url }) => {
	const docsDir = getSharedDocsPath();
	const searchTerm = url.searchParams.get('search') || '';

	if (!existsSync(docsDir)) {
		return json({
			docs: [],
			count: 0,
			path: docsDir,
			error: 'Shared docs directory not found'
		});
	}

	try {
		const entries = readdirSync(docsDir, { withFileTypes: true });
		const docs: DocFile[] = [];

		for (const entry of entries) {
			if (!entry.name.endsWith('.md') || !entry.isFile()) {
				continue;
			}

			const filePath = join(docsDir, entry.name);
			const stats = statSync(filePath);
			const content = readFileSync(filePath, 'utf-8');

			const doc: DocFile = {
				name: basename(entry.name, '.md'),
				filename: entry.name,
				path: filePath,
				title: extractTitle(content, entry.name),
				description: extractDescription(content),
				size: stats.size,
				modifiedAt: stats.mtime.toISOString()
			};

			// Apply search filter if provided
			if (searchTerm && !matchesSearch(doc, content, searchTerm)) {
				continue;
			}

			docs.push(doc);
		}

		// Sort by name
		docs.sort((a, b) => a.name.localeCompare(b.name));

		return json({
			docs,
			count: docs.length,
			path: docsDir,
			search: searchTerm || undefined
		});
	} catch (err) {
		console.error('Error reading shared docs:', err);
		throw error(500, `Failed to read shared docs: ${(err as Error).message}`);
	}
};
