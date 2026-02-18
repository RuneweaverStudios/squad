#!/usr/bin/env node
/**
 * squad-memory - Memory indexer and search CLI.
 *
 * Reads .squad/memory/*.md files, chunks them, generates embeddings,
 * and stores in SQLite with vector search + FTS5 support.
 *
 * Usage:
 *   squad-memory index [--force] [--project path] [--skip-embeddings] [--verbose]
 *   squad-memory search 'query' [--project path] [--limit N] [--min-score 0.5]
 *   squad-memory status [--project path] [--json]
 *   squad-memory providers
 *   squad-memory --help
 */

import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { indexProject } from './lib/indexer.js';
import { search } from './lib/search.js';
import { openDb, getStats, getConfig } from './lib/db.js';
import { listProviders } from './lib/embeddings.js';

// --- CLI args ---
const args = process.argv.slice(2);
const command = args[0];

function getArg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}
function hasFlag(name) {
  return args.includes(`--${name}`);
}

function resolveProjectPath() {
  const explicit = getArg('project', null);
  if (explicit) return resolve(explicit);

  // Default: current directory
  const cwd = process.cwd();
  if (existsSync(`${cwd}/.squad`)) return cwd;

  // Try parent directories
  let dir = cwd;
  while (dir !== '/') {
    dir = resolve(dir, '..');
    if (existsSync(`${dir}/.squad`)) return dir;
  }

  console.error('Error: No .squad/ directory found. Run "st init" in your project first.');
  process.exit(1);
}

function printHelp() {
  console.log(`squad-memory - Agent memory indexer and search

Usage:
  squad-memory index [options]         Index memory files (chunk, embed, store)
  squad-memory search 'query' [opts]   Hybrid search over memory index
  squad-memory status [options]        Show index statistics
  squad-memory providers               List available embedding providers
  squad-memory --help                  Show this help

Index Options:
  --project <path>      Project path (default: current directory)
  --force               Re-index all files (ignore hashes)
  --skip-embeddings     Skip embedding generation (text search only)
  --target-tokens <n>   Target chunk size in tokens (default: 500)
  --overlap-tokens <n>  Overlap between chunks (default: 50)
  --verbose             Verbose output
  --json                Output results as JSON

Search Options:
  --project <path>      Project path (default: current directory)
  --limit <n>           Max results to return (default: 5)
  --min-score <f>       Minimum RRF score to include (default: 0)
  --candidates <n>      Candidates per search method (default: 20)
  --verbose             Verbose output (debug info to stderr)

Status Options:
  --project <path>      Project path (default: current directory)
  --json                Output as JSON

Memory files are read from: .squad/memory/*.md
Index is stored in: .squad/memory.db`);
}

// --- Commands ---

async function cmdIndex() {
  const projectPath = resolveProjectPath();
  const force = hasFlag('force');
  const skipEmbeddings = hasFlag('skip-embeddings');
  const verbose = hasFlag('verbose');
  const jsonOutput = hasFlag('json');
  const targetTokens = parseInt(getArg('target-tokens', '500'), 10);
  const overlapTokens = parseInt(getArg('overlap-tokens', '50'), 10);

  if (!jsonOutput) {
    console.log(`Indexing memory for: ${basename(projectPath)}`);
    if (force) console.log('  (force re-index)');
  }

  const result = await indexProject({
    projectPath,
    force,
    skipEmbeddings,
    verbose,
    targetTokens,
    overlapTokens,
  });

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('');
    console.log(`  Files indexed: ${result.indexed}`);
    console.log(`  Files removed: ${result.removed}`);
    console.log(`  Files unchanged: ${result.unchanged}`);
    console.log(`  Chunks created: ${result.chunks}`);
    console.log('');
    console.log(`  Total files: ${result.totalFiles}`);
    console.log(`  Total chunks: ${result.totalChunks}`);
    console.log(`  Embedded chunks: ${result.embeddedChunks}`);

    if (result.errors.length > 0) {
      console.log('');
      console.log(`  Errors (${result.errors.length}):`);
      for (const err of result.errors) {
        console.log(`    - ${err}`);
      }
    }

    console.log('');
    console.log(`Done.`);
  }

  process.exit(result.errors.length > 0 ? 1 : 0);
}

function cmdStatus() {
  const projectPath = resolveProjectPath();
  const jsonOutput = hasFlag('json');

  const dbPath = `${projectPath}/.squad/memory.db`;
  if (!existsSync(dbPath)) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'No memory index found. Run: squad-memory index' }));
    } else {
      console.log('No memory index found. Run: squad-memory index');
    }
    return;
  }

  const db = openDb(projectPath);
  const stats = getStats(db);
  const provider = getConfig(db, 'embedding_provider');
  const model = getConfig(db, 'embedding_model');
  const dimension = getConfig(db, 'embedding_dimension');
  db.close();

  if (jsonOutput) {
    console.log(JSON.stringify({
      project: basename(projectPath),
      dbPath,
      ...stats,
      embedding: { provider, model, dimension: dimension ? Number(dimension) : null },
    }, null, 2));
  } else {
    console.log(`Memory index: ${basename(projectPath)}`);
    console.log(`  Database: ${dbPath}`);
    console.log(`  Files: ${stats.fileCount}`);
    console.log(`  Chunks: ${stats.chunkCount}`);
    console.log(`  Embedded: ${stats.embeddedCount}`);
    if (provider) {
      console.log(`  Provider: ${provider} (${model}, dim=${dimension})`);
    } else {
      console.log(`  Provider: not configured`);
    }
  }
}

async function cmdSearch() {
  const projectPath = resolveProjectPath();
  const verbose = hasFlag('verbose');
  const limit = parseInt(getArg('limit', '5'), 10);
  const minScore = parseFloat(getArg('min-score', '0'));
  const candidates = parseInt(getArg('candidates', '20'), 10);

  // Query is the first non-flag argument after 'search'
  const query = args.slice(1).find(a => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') === false)
    ?? args.find((a, i) => i > 0 && !a.startsWith('--') && !args[i - 1]?.startsWith('--'));

  if (!query) {
    console.error('Error: Search query required.');
    console.error('Usage: squad-memory search "your query here" [--limit 5] [--min-score 0]');
    process.exit(1);
  }

  const dbPath = `${projectPath}/.squad/memory.db`;
  if (!existsSync(dbPath)) {
    console.error('No memory index found. Run: squad-memory index');
    process.exit(1);
  }

  const results = await search({
    projectPath,
    query,
    limit,
    minScore,
    candidates,
    verbose,
  });

  // Always output JSON (designed for agent consumption)
  console.log(JSON.stringify(results, null, 2));
}

function cmdProviders() {
  const providers = listProviders();
  const jsonOutput = hasFlag('json');

  if (jsonOutput) {
    console.log(JSON.stringify(providers, null, 2));
    return;
  }

  console.log('Available embedding providers:');
  console.log('');
  for (const p of providers) {
    const status = p.available ? '✓' : '✗';
    console.log(`  ${status} ${p.name} (${p.id})`);
    console.log(`    Model: ${p.defaultModel}`);
    console.log(`    Env: ${p.envVar} ${p.available ? '(set)' : '(not set)'}`);
    console.log('');
  }
}

// --- Entry point ---

if (hasFlag('help') || hasFlag('h') || command === 'help' || !command) {
  printHelp();
  process.exit(0);
}

switch (command) {
  case 'index':
    cmdIndex().catch(err => {
      console.error(`Fatal: ${err.message}`);
      process.exit(1);
    });
    break;
  case 'search':
    cmdSearch().catch(err => {
      console.error(`Fatal: ${err.message}`);
      process.exit(1);
    });
    break;
  case 'status':
    cmdStatus();
    break;
  case 'providers':
    cmdProviders();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error('Run "squad-memory --help" for usage');
    process.exit(1);
}
