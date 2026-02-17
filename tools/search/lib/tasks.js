/**
 * Task search module - wraps lib/tasks.js searchTasks with project filtering.
 */

import { searchTasks as _searchTasks } from '../../../lib/tasks.js';

/**
 * Search tasks using FTS5 full-text search.
 *
 * @param {string} query - Search query
 * @param {object} options
 * @param {string} [options.project] - Project path (null = all projects)
 * @param {number} [options.limit=10] - Max results
 * @param {boolean} [options.verbose=false]
 * @returns {Array<{id: string, title: string, status: string, priority: number, snippet: string, score: number, issue_type: string, labels: string[]}>}
 */
export function searchTasks(query, options = {}) {
  const { project, limit = 10, verbose = false } = options;
  const log = verbose ? (...a) => console.error('[tasks]', ...a) : () => {};

  log(`Searching tasks for "${query}" (limit=${limit})`);

  // When filtering by project, fetch more results to ensure we have enough after filtering
  const fetchLimit = project ? limit * 5 : limit;
  const results = _searchTasks(query, { limit: fetchLimit });

  // Filter to specific project if requested
  let filtered = results;
  if (project) {
    const projName = projectNameFromPath(project);
    if (projName) {
      filtered = results.filter(t => t.id.startsWith(projName + '-')).slice(0, limit);
      log(`Filtered to project "${projName}": ${filtered.length} results`);
    }
  }

  return filtered.map(t => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    issue_type: t.issue_type,
    snippet: (t.description || '').slice(0, 200),
    score: t.relevance || 0,
    labels: t.labels || [],
    assignee: t.assignee || null,
    updated_at: t.updated_at,
  }));
}

/**
 * Extract project name from path (last directory component).
 */
function projectNameFromPath(projectPath) {
  if (!projectPath) return null;
  const resolved = projectPath.replace(/\/+$/, '');
  return resolved.split('/').pop();
}
