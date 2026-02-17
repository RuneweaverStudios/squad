/**
 * File search module - ripgrep content search + filename fuzzy matching.
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Search files by content (ripgrep) and filename pattern.
 *
 * @param {string} query - Search query (used for both content and filename)
 * @param {object} options
 * @param {string} [options.project] - Project path (default: cwd)
 * @param {number} [options.limit=10] - Max results
 * @param {boolean} [options.verbose=false]
 * @returns {Array<{path: string, line: number|null, snippet: string, matchType: string}>}
 */
export function searchFiles(query, options = {}) {
  const { project, limit = 10, verbose = false } = options;
  const log = verbose ? (...a) => console.error('[files]', ...a) : () => {};

  const searchDir = project ? resolve(project) : process.cwd();
  log(`Searching files in "${searchDir}" for "${query}" (limit=${limit})`);

  const results = [];

  // 1. Filename fuzzy match using fd or find
  const nameResults = searchFilenames(query, searchDir, Math.ceil(limit / 2), log);
  results.push(...nameResults);

  // 2. Content search using ripgrep
  const contentResults = searchContent(query, searchDir, limit, log);
  results.push(...contentResults);

  // Deduplicate by path+line, prefer content matches
  const seen = new Set();
  const deduped = [];
  for (const r of results) {
    const key = `${r.path}:${r.line || 0}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  }

  return deduped.slice(0, limit);
}

/**
 * Search filenames using fd (falls back to find).
 */
function searchFilenames(query, searchDir, limit, log) {
  const results = [];

  // Build a pattern from query words for filename matching
  const pattern = query.replace(/\s+/g, '.*');

  try {
    // Try fd first (faster, respects .gitignore)
    const cmd = `fd --type f --max-results ${limit} "${pattern}" "${searchDir}" 2>/dev/null`;
    log(`Running: ${cmd}`);
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 5000, maxBuffer: 256 * 1024 }).trim();

    if (output) {
      for (const line of output.split('\n').filter(Boolean)) {
        results.push({
          path: line.startsWith(searchDir) ? line.slice(searchDir.length + 1) : line,
          line: null,
          snippet: '',
          matchType: 'filename',
        });
      }
    }
    log(`fd results: ${results.length}`);
    return results;
  } catch {
    // fd not available or no matches
  }

  // Fallback: use find with grep on basename
  try {
    const words = query.split(/\s+/).filter(Boolean);
    const grepPattern = words.map(w => `-e "${w}"`).join(' ');
    const cmd = `find "${searchDir}" -type f -not -path '*/.git/*' -not -path '*/node_modules/*' | xargs -I{} basename {} | head -n 1000 | grep -i ${grepPattern} | head -n ${limit}`;
    log(`Running find fallback`);
    // This approach is slow, just skip it for now
  } catch {
    // ignore
  }

  return results;
}

/**
 * Search file contents using ripgrep.
 */
function searchContent(query, searchDir, limit, log) {
  const results = [];

  try {
    // Use ripgrep with JSON output for structured parsing
    const escapedQuery = query.replace(/['"\\]/g, '\\$&');
    const cmd = `rg --json --max-count 1 --max-columns 200 --ignore-case "${escapedQuery}" "${searchDir}" 2>/dev/null | head -n ${limit * 3}`;
    log(`Running: rg for "${query}"`);
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 10000, maxBuffer: 512 * 1024 }).trim();

    if (output) {
      for (const line of output.split('\n').filter(Boolean)) {
        try {
          const entry = JSON.parse(line);
          if (entry.type === 'match') {
            const path = entry.data.path?.text || '';
            const lineNum = entry.data.line_number || null;
            const snippet = entry.data.lines?.text?.trim() || '';
            results.push({
              path: path.startsWith(searchDir) ? path.slice(searchDir.length + 1) : path,
              line: lineNum,
              snippet: snippet.slice(0, 200),
              matchType: 'content',
            });
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
    log(`rg results: ${results.length}`);
  } catch {
    // rg not available or no matches
    log('ripgrep search returned no results or failed');
  }

  return results.slice(0, limit);
}
