#!/usr/bin/env node
/**
 * jat-memory - Memory indexer CLI.
 *
 * Reads .jat/memory/*.md files, chunks them, generates embeddings,
 * and stores in SQLite with vector search + FTS5 support.
 *
 * Usage:
 *   jat-memory index [--force] [--project path] [--skip-embeddings] [--verbose]
 *   jat-memory status [--project path] [--json]
 *   jat-memory providers
 *   jat-memory --help
 */

import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { indexProject } from './lib/indexer.js';
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
  if (existsSync(`${cwd}/.jat`)) return cwd;

  // Try parent directories
  let dir = cwd;
  while (dir !== '/') {
    dir = resolve(dir, '..');
    if (existsSync(`${dir}/.jat`)) return dir;
  }

  console.error('Error: No .jat/ directory found. Run "jt init" in your project first.');
  process.exit(1);
}

function printHelp() {
  console.log(`jat-memory - Agent memory indexer

Usage:
  jat-memory index [options]     Index memory files (chunk, embed, store)
  jat-memory status [options]    Show index statistics
  jat-memory providers           List available embedding providers
  jat-memory --help              Show this help

Index Options:
  --project <path>      Project path (default: current directory)
  --force               Re-index all files (ignore hashes)
  --skip-embeddings     Skip embedding generation (text search only)
  --target-tokens <n>   Target chunk size in tokens (default: 500)
  --overlap-tokens <n>  Overlap between chunks (default: 50)
  --verbose             Verbose output
  --json                Output results as JSON

Status Options:
  --project <path>      Project path (default: current directory)
  --json                Output as JSON

Memory files are read from: .jat/memory/*.md
Index is stored in: .jat/memory.db`);
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

  const dbPath = `${projectPath}/.jat/memory.db`;
  if (!existsSync(dbPath)) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'No memory index found. Run: jat-memory index' }));
    } else {
      console.log('No memory index found. Run: jat-memory index');
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
  case 'status':
    cmdStatus();
    break;
  case 'providers':
    cmdProviders();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error('Run "jat-memory --help" for usage');
    process.exit(1);
}
