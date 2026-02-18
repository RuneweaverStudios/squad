/**
 * Unified Search API Endpoint
 *
 * GET /api/search?q=...&sources=tasks,memory,files&project=...&limit=5&status=...&type=...
 *
 * Returns grouped results from all sources in parallel.
 * Imports search modules directly from tools/search/lib/ for in-process performance.
 *
 * Task: squad-tvos9.3 - Build unified /api/search endpoint
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Import search modules from tools/search/lib/ (shared with squad-search CLI)
// @ts-ignore - JS module without type declarations
import { searchTasks } from '../../../../../tools/search/lib/tasks.js';
// @ts-ignore - JS module without type declarations
import { searchMemory } from '../../../../../tools/search/lib/memory.js';
// @ts-ignore - JS module without type declarations
import { searchFiles } from '../../../../../tools/search/lib/files.js';

const VALID_SOURCES = ['tasks', 'memory', 'files'] as const;
type Source = (typeof VALID_SOURCES)[number];

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim();
	if (!q) {
		return json({ error: 'Missing required parameter: q' }, { status: 400 });
	}

	// Parse sources (default: all three)
	const sourcesParam = url.searchParams.get('sources');
	const sources: Source[] = sourcesParam
		? (sourcesParam.split(',').filter((s) => VALID_SOURCES.includes(s as Source)) as Source[])
		: [...VALID_SOURCES];

	if (sources.length === 0) {
		return json({ error: 'No valid sources specified' }, { status: 400 });
	}

	// Parse other params
	const project = url.searchParams.get('project') || undefined;
	const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '5', 10) || 5, 1), 50);
	const status = url.searchParams.get('status') || undefined;
	const type = url.searchParams.get('type') || undefined;

	// Resolve project path from project name
	const projectPath = project ? resolveProjectPath(project) : undefined;

	const startTime = Date.now();

	try {
		// Run all requested source searches in parallel
		const promises: Record<string, Promise<unknown[]>> = {};

		if (sources.includes('tasks')) {
			promises.tasks = Promise.resolve(
				searchTasks(q, { project: projectPath, limit, verbose: false })
			).then((results) => {
				// Apply additional filters if provided
				let filtered = results;
				if (status) {
					filtered = filtered.filter(
						(t: { status?: string }) => t.status === status
					);
				}
				if (type) {
					filtered = filtered.filter(
						(t: { issue_type?: string }) => t.issue_type === type
					);
				}
				return filtered;
			});
		}

		if (sources.includes('memory')) {
			promises.memory = searchMemory(q, {
				project: projectPath,
				limit,
				verbose: false
			});
		}

		if (sources.includes('files')) {
			promises.files = Promise.resolve(
				searchFiles(q, { project: projectPath, limit, verbose: false })
			);
		}

		// Wait for all searches
		const keys = Object.keys(promises);
		const values = await Promise.all(Object.values(promises));

		const results: Record<string, unknown[]> = {};
		let totalResults = 0;
		for (let i = 0; i < keys.length; i++) {
			results[keys[i]] = values[i] || [];
			totalResults += results[keys[i]].length;
		}

		const queryTime = Date.now() - startTime;

		return json({
			tasks: results.tasks || [],
			memory: results.memory || [],
			files: results.files || [],
			meta: {
				queryTime,
				totalResults,
				sources: keys,
				query: q,
				limit
			}
		});
	} catch (err) {
		console.error('[search] Error:', err);
		return json(
			{ error: `Search failed: ${(err as Error).message}` },
			{ status: 500 }
		);
	}
};

/**
 * Resolve project name to filesystem path.
 * Checks ~/code/{project} for a .squad/ directory.
 */
function resolveProjectPath(project: string): string | undefined {
	const codePath = join(homedir(), 'code', project);
	if (existsSync(join(codePath, '.squad'))) {
		return codePath;
	}
	return undefined;
}
