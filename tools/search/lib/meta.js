/**
 * Meta search - aggregates results from tasks, memory, and files.
 * Optional --summarize flag pipes results through LLM for synthesis.
 */

import { searchTasks } from './tasks.js';
import { searchMemory } from './memory.js';
import { searchFiles } from './files.js';
import { execSync } from 'node:child_process';

/**
 * Run meta search across all sources.
 *
 * @param {string} query - Search query
 * @param {object} options
 * @param {string} [options.project] - Project path
 * @param {number} [options.limit=5] - Max results per source
 * @param {boolean} [options.verbose=false]
 * @param {boolean} [options.summarize=false] - LLM synthesis
 * @returns {Promise<{query: string, tasks: Array, memory: Array, files: Array, synthesis?: object}>}
 */
export async function metaSearch(query, options = {}) {
  const { project, limit = 5, verbose = false, summarize = false } = options;
  const log = verbose ? (...a) => console.error('[meta]', ...a) : () => {};

  log(`Meta search for "${query}" (limit=${limit}/source, summarize=${summarize})`);

  // Run all searches in parallel
  const [tasks, memory, files] = await Promise.all([
    Promise.resolve(searchTasks(query, { project, limit, verbose })),
    searchMemory(query, { project, limit, verbose }),
    Promise.resolve(searchFiles(query, { project, limit, verbose })),
  ]);

  log(`Results: tasks=${tasks.length} memory=${memory.length} files=${files.length}`);

  const result = { query, tasks, memory, files };

  // Optional LLM synthesis
  if (summarize && (tasks.length + memory.length + files.length > 0)) {
    log('Running LLM synthesis...');
    result.synthesis = await synthesize(query, result, log);
  }

  return result;
}

/**
 * Synthesize search results through LLM (claude -p or API).
 */
async function synthesize(query, results, log) {
  const prompt = buildSynthesisPrompt(query, results);

  try {
    // Try claude CLI first (uses subscription auth, no API key needed)
    const escaped = prompt.replace(/'/g, "'\\''");
    const output = execSync(
      `echo '${escaped}' | claude -p --output-format json 2>/dev/null`,
      { encoding: 'utf-8', timeout: 30000, maxBuffer: 512 * 1024 }
    ).trim();

    // Try to parse as JSON
    try {
      return JSON.parse(output);
    } catch {
      // claude -p might return plain text
      return {
        summary: output.slice(0, 500),
        recommendedAction: null,
        keyFiles: [],
        relatedTasks: [],
      };
    }
  } catch (err) {
    log(`LLM synthesis failed: ${err.message}`);
    return null;
  }
}

/**
 * Build the prompt for LLM synthesis.
 */
function buildSynthesisPrompt(query, results) {
  const parts = [`Search query: "${query}"\n`];

  if (results.tasks.length > 0) {
    parts.push('=== TASK RESULTS ===');
    for (const t of results.tasks) {
      parts.push(`- ${t.id} [${t.status}] P${t.priority}: ${t.title}`);
      if (t.snippet) parts.push(`  ${t.snippet.slice(0, 150)}`);
    }
    parts.push('');
  }

  if (results.memory.length > 0) {
    parts.push('=== MEMORY RESULTS ===');
    for (const m of results.memory) {
      parts.push(`- ${m.file} [${m.taskId || 'unknown'}] §${m.section || 'unknown'} (score: ${m.score})`);
      if (m.snippet) parts.push(`  ${m.snippet.slice(0, 150)}`);
    }
    parts.push('');
  }

  if (results.files.length > 0) {
    parts.push('=== FILE RESULTS ===');
    for (const f of results.files) {
      const loc = f.line ? `${f.path}:${f.line}` : f.path;
      parts.push(`- ${loc} (${f.matchType})`);
      if (f.snippet) parts.push(`  ${f.snippet.slice(0, 150)}`);
    }
    parts.push('');
  }

  parts.push(`Synthesize these search results for the query "${query}".`);
  parts.push('Return a JSON object with these fields:');
  parts.push('- summary: 1-2 sentence summary of what was found');
  parts.push('- recommendedAction: suggested next step based on results');
  parts.push('- keyFiles: array of the most relevant file paths');
  parts.push('- relatedTasks: array of related task IDs');

  return parts.join('\n');
}
