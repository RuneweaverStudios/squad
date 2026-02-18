/**
 * Memory search module - wraps squad-memory hybrid search.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { search } from '../../memory/lib/search.js';

/**
 * Search agent memory using hybrid FTS5 + vector search.
 *
 * @param {string} query - Search query
 * @param {object} options
 * @param {string} [options.project] - Project path (default: cwd)
 * @param {number} [options.limit=10] - Max results
 * @param {boolean} [options.verbose=false]
 * @returns {Promise<Array<{file: string, taskId: string, section: string, snippet: string, score: number, startLine: number, endLine: number, source: string}>>}
 */
export async function searchMemory(query, options = {}) {
  const { project, limit = 10, verbose = false } = options;
  const log = verbose ? (...a) => console.error('[memory]', ...a) : () => {};

  const projectPath = resolveProjectPath(project);
  if (!projectPath) {
    log('No .squad/ directory found - skipping memory search');
    return [];
  }

  log(`Searching memory in "${projectPath}" for "${query}" (limit=${limit})`);

  try {
    const results = await search({
      projectPath,
      query,
      limit,
      candidates: Math.max(limit * 4, 20),
      verbose,
    });

    return results.map(r => ({
      file: r.path,
      taskId: r.taskId || null,
      section: r.section || null,
      snippet: r.snippet || '',
      score: r.score,
      startLine: r.startLine,
      endLine: r.endLine,
      source: r.source,
    }));
  } catch (err) {
    log(`Memory search error: ${err.message}`);
    return [];
  }
}

/**
 * Resolve project path, looking for .squad/ directory.
 */
function resolveProjectPath(explicit) {
  if (explicit) {
    const p = resolve(explicit);
    return existsSync(`${p}/.squad`) ? p : null;
  }

  // Walk up from cwd
  let dir = process.cwd();
  while (dir !== '/') {
    if (existsSync(`${dir}/.squad`)) return dir;
    dir = resolve(dir, '..');
  }
  return null;
}
