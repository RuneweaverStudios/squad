#!/usr/bin/env node
/**
 * jat-search - Unified search across tasks, memory, and files.
 *
 * Usage:
 *   jat-search "query"                        Meta search (all sources)
 *   jat-search tasks "query" [options]         Deep task search (FTS5)
 *   jat-search memory "query" [options]        Memory search (FTS5 + vector)
 *   jat-search files "query" [options]         File search (ripgrep + filename)
 *
 * Options:
 *   --project PATH    Project path (default: cwd)
 *   --limit N         Max results per source (meta: 5, individual: 10)
 *   --json            JSON output (default for meta search)
 *   --summarize       Pipe results through LLM for synthesis (meta only)
 *   --verbose         Debug info to stderr
 *   --help            Show help
 */

import { searchTasks } from './lib/tasks.js';
import { searchMemory } from './lib/memory.js';
import { searchFiles } from './lib/files.js';
import { metaSearch } from './lib/meta.js';

// --- CLI arg parsing ---
const args = process.argv.slice(2);

function getArg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}
function hasFlag(name) {
  return args.includes(`--${name}`);
}

// Detect subcommand vs meta search
const SUBCOMMANDS = ['tasks', 'memory', 'files'];
let subcommand = null;
let query = null;

if (args.length === 0 || hasFlag('help')) {
  printHelp();
  process.exit(0);
}

// First non-flag arg: either a subcommand or the query
const firstArg = args.find(a => !a.startsWith('--'));
if (firstArg && SUBCOMMANDS.includes(firstArg)) {
  subcommand = firstArg;
  // Query is the next non-flag arg after the subcommand
  const subIdx = args.indexOf(firstArg);
  query = args.slice(subIdx + 1).find(a => !a.startsWith('--'));
} else {
  // Meta search: first non-flag arg is the query
  query = firstArg;
}

if (!query) {
  console.error('Error: No search query provided.');
  console.error('Usage: jat-search "query" or jat-search tasks "query"');
  process.exit(1);
}

const project = getArg('project', null);
const verbose = hasFlag('verbose');
const jsonOutput = hasFlag('json');
const summarize = hasFlag('summarize');
const limit = parseInt(getArg('limit', subcommand ? '10' : '5'), 10);
const log = verbose ? (...a) => console.error('[jat-search]', ...a) : () => {};

log(`subcommand=${subcommand || 'meta'} query="${query}" limit=${limit}`);

// --- Dispatch ---
try {
  if (subcommand === 'tasks') {
    const results = searchTasks(query, { project, limit, verbose });
    outputResults(results, jsonOutput);
  } else if (subcommand === 'memory') {
    const results = await searchMemory(query, { project, limit, verbose });
    outputResults(results, jsonOutput);
  } else if (subcommand === 'files') {
    const results = searchFiles(query, { project, limit, verbose });
    outputResults(results, jsonOutput);
  } else {
    // Meta search
    const results = await metaSearch(query, { project, limit, verbose, summarize });
    // Meta search always outputs JSON
    console.log(JSON.stringify(results, null, 2));
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  if (verbose) console.error(err.stack);
  process.exit(1);
}

function outputResults(results, asJson) {
  if (asJson) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    // Human-readable output
    if (!results || results.length === 0) {
      console.log('No results found.');
      return;
    }
    for (const r of results) {
      printResult(r);
    }
    console.log(`\n${results.length} result(s) found.`);
  }
}

function printResult(r) {
  // Task result
  if (r.id && r.title) {
    const status = r.status ? ` [${r.status}]` : '';
    const prio = r.priority !== undefined ? ` P${r.priority}` : '';
    const score = r.relevance ? ` (${r.relevance})` : (r.score ? ` (${r.score})` : '');
    console.log(`  ${r.id}${prio}${status} ${r.title}${score}`);
    if (r.snippet) console.log(`    ${r.snippet.slice(0, 120)}`);
    return;
  }
  // Memory result
  if ((r.file || r.path) && r.section) {
    const score = r.score ? ` (${r.score})` : '';
    const task = r.taskId ? ` [${r.taskId}]` : '';
    const file = r.file || r.path;
    console.log(`  ${file}:${r.startLine || '?'}${task} §${r.section}${score}`);
    if (r.snippet) console.log(`    ${firstLine(r.snippet, 120)}`);
    return;
  }
  // File result
  if (r.path) {
    const line = r.line ? `:${r.line}` : '';
    console.log(`  ${r.path}${line}`);
    if (r.snippet) console.log(`    ${firstLine(r.snippet, 120)}`);
    return;
  }
  // Fallback
  console.log(`  ${JSON.stringify(r)}`);
}

function firstLine(text, maxLen = 120) {
  const line = text.split('\n')[0].trim();
  return line.length > maxLen ? line.slice(0, maxLen) + '...' : line;
}

function printHelp() {
  console.log(`jat-search - Unified search across tasks, memory, and files

Usage:
  jat-search "query"                        Meta search (all sources)
  jat-search tasks "query" [options]        Deep task search (FTS5)
  jat-search memory "query" [options]       Memory search (FTS5 + vector)
  jat-search files "query" [options]        File search (ripgrep + filename)

Options:
  --project PATH    Project path (default: current directory)
  --limit N         Max results (meta: 5/source, individual: 10)
  --json            JSON output (default for meta search)
  --summarize       LLM synthesis of meta results
  --verbose         Debug info to stderr
  --help            Show this help

Examples:
  jat-search "authentication"               Search everything
  jat-search tasks "OAuth timeout" --json    Search tasks only
  jat-search memory "browser automation"     Search memory
  jat-search files "searchTasks"             Search file contents
  jat-search "auth" --summarize              Meta search with LLM synthesis`);
}
