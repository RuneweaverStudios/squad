/**
 * Memory indexer orchestrator.
 * Scans .squad/memory/*.md files, detects changes, chunks, embeds, and stores.
 */

import { readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import {
  openDb, ensureVecTable, getConfig, setConfig,
  getFileMeta, deleteFileData, insertChunk, storeEmbedding,
  upsertFileMeta, getAllFileHashes, getStats,
} from './db.js';
import { chunkMemoryFile } from './chunker.js';
import { embed, getDimension, getProvider, resolveApiKey, listProviders } from './embeddings.js';

/**
 * Hash file content for change detection.
 * @param {string} content
 * @returns {string} SHA-256 hex digest
 */
function hashContent(content) {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Discover memory files in a project.
 * @param {string} projectPath
 * @returns {string[]} Array of filenames (relative to .squad/memory/)
 */
function discoverFiles(projectPath) {
  const memoryDir = join(projectPath, '.squad', 'memory');
  if (!existsSync(memoryDir)) return [];

  return readdirSync(memoryDir)
    .filter(f => f.endsWith('.md'))
    .sort();
}

/**
 * Determine which files need (re-)indexing.
 * @param {string} projectPath
 * @param {Database} db
 * @param {boolean} force - Force re-index all files
 * @returns {{ toIndex: string[], toRemove: string[], unchanged: string[] }}
 */
function diffFiles(projectPath, db, force) {
  const memoryDir = join(projectPath, '.squad', 'memory');
  const diskFiles = discoverFiles(projectPath);
  const indexedHashes = getAllFileHashes(db);

  const toIndex = [];
  const unchanged = [];
  const toRemove = [];

  // Check disk files against index
  for (const filename of diskFiles) {
    if (force) {
      toIndex.push(filename);
      continue;
    }

    const content = readFileSync(join(memoryDir, filename), 'utf-8');
    const hash = hashContent(content);
    const existing = indexedHashes.get(filename);

    if (!existing || existing !== hash) {
      toIndex.push(filename);
    } else {
      unchanged.push(filename);
    }
  }

  // Check for deleted files (in index but not on disk)
  const diskSet = new Set(diskFiles);
  for (const [path] of indexedHashes) {
    if (!diskSet.has(path)) {
      toRemove.push(path);
    }
  }

  return { toIndex, toRemove, unchanged };
}

/**
 * Resolve embedding configuration.
 * Reads from db config, env vars, or defaults.
 * @param {Database} db
 * @returns {{ provider: string, model: string, dimension: number, apiKey: string|null }}
 */
function resolveEmbeddingConfig(db) {
  // Check db config first
  let provider = getConfig(db, 'embedding_provider');
  let model = getConfig(db, 'embedding_model');

  // Auto-detect provider: try resolving API keys (env vars + squad-secret)
  if (!provider) {
    for (const candidate of ['openai', 'gemini', 'voyage']) {
      if (resolveApiKey(candidate)) {
        provider = candidate;
        break;
      }
    }
  }

  // Default to gemini (free tier available)
  if (!provider) provider = 'gemini';

  const providerConfig = getProvider(provider);
  if (!model) model = providerConfig.defaultModel;

  const dimension = getDimension(provider, model);

  // Resolve API key from env vars and squad-secret
  const apiKey = resolveApiKey(provider);

  return { provider, model, dimension, apiKey };
}

/**
 * Run the indexing pipeline.
 * @param {object} options
 * @param {string} options.projectPath - Path to project root
 * @param {boolean} [options.force=false] - Force re-index all files
 * @param {boolean} [options.skipEmbeddings=false] - Skip embedding generation
 * @param {boolean} [options.verbose=false] - Verbose output
 * @param {number} [options.targetTokens=500] - Target chunk size in tokens
 * @param {number} [options.overlapTokens=50] - Overlap between chunks
 * @returns {{ indexed: number, removed: number, unchanged: number, chunks: number, errors: string[] }}
 */
export async function indexProject(options) {
  const {
    projectPath,
    force = false,
    skipEmbeddings = false,
    verbose = false,
    targetTokens = 500,
    overlapTokens = 50,
  } = options;

  const log = verbose ? (...args) => console.error('[indexer]', ...args) : () => {};
  const errors = [];

  // Ensure .squad/memory/ directory exists
  const memoryDir = join(projectPath, '.squad', 'memory');
  if (!existsSync(memoryDir)) {
    mkdirSync(memoryDir, { recursive: true });
    log('Created .squad/memory/ directory');
  }

  // Open database
  const db = openDb(projectPath);
  log('Opened database:', join(projectPath, '.squad', 'memory.db'));

  // Resolve embedding config
  let embeddingConfig = null;
  if (!skipEmbeddings) {
    try {
      embeddingConfig = resolveEmbeddingConfig(db);
      log(`Embedding provider: ${embeddingConfig.provider} (${embeddingConfig.model}, dim=${embeddingConfig.dimension})`);

      // Ensure vec table exists with correct dimension
      ensureVecTable(db, embeddingConfig.dimension);

      // Save config to db
      setConfig(db, 'embedding_provider', embeddingConfig.provider);
      setConfig(db, 'embedding_model', embeddingConfig.model);
      setConfig(db, 'embedding_dimension', String(embeddingConfig.dimension));
    } catch (err) {
      log(`Warning: Could not configure embeddings: ${err.message}`);
      log('Proceeding without embeddings (text search only)');
      skipEmbeddings || (embeddingConfig = null);
    }
  }

  // Save chunk config
  setConfig(db, 'chunk_target_tokens', String(targetTokens));
  setConfig(db, 'chunk_overlap_tokens', String(overlapTokens));

  // Diff files
  const { toIndex, toRemove, unchanged } = diffFiles(projectPath, db, force);
  log(`Files: ${toIndex.length} to index, ${toRemove.length} to remove, ${unchanged.length} unchanged`);

  // Remove deleted files
  const removeTransaction = db.transaction(() => {
    for (const path of toRemove) {
      log(`  Removing: ${path}`);
      deleteFileData(db, path);
    }
  });
  removeTransaction();

  // Derive project name from path
  const projectName = basename(projectPath);

  // Index each file
  let totalChunks = 0;
  const allNewChunks = []; // { chunkId, content } for batch embedding

  for (const filename of toIndex) {
    try {
      log(`  Indexing: ${filename}`);
      const content = readFileSync(join(memoryDir, filename), 'utf-8');
      const hash = hashContent(content);

      // Delete old data for this file (if re-indexing)
      const indexTransaction = db.transaction(() => {
        deleteFileData(db, filename);

        // Chunk the file
        const { frontmatter, chunks } = chunkMemoryFile(content, filename, { targetTokens, overlapTokens });
        log(`    ${chunks.length} chunk(s) from ${filename}`);

        // Insert chunks
        for (const chunk of chunks) {
          const chunkId = insertChunk(db, chunk);
          allNewChunks.push({ chunkId, content: chunk.content });
          totalChunks++;
        }

        // Insert/update file metadata
        upsertFileMeta(db, {
          path: filename,
          taskId: frontmatter.task ?? '',
          project: frontmatter.project ?? projectName,
          agent: frontmatter.agent ?? null,
          completedAt: frontmatter.completed ?? null,
          fileHash: hash,
          chunkCount: chunks.length,
          tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
          labels: Array.isArray(frontmatter.labels) ? frontmatter.labels : [],
          filesTouched: Array.isArray(frontmatter.files) ? frontmatter.files : [],
          priority: frontmatter.priority != null ? Number(frontmatter.priority) : null,
          issueType: frontmatter.issue_type ?? null,
          risk: frontmatter.risk ?? null,
        });
      });

      indexTransaction();
    } catch (err) {
      const msg = `Error indexing ${filename}: ${err.message}`;
      log(`    ERROR: ${msg}`);
      errors.push(msg);
    }
  }

  // Generate embeddings in batches
  if (embeddingConfig?.apiKey && allNewChunks.length > 0) {
    log(`Generating embeddings for ${allNewChunks.length} chunks...`);
    const EMBED_BATCH = 50; // Process 50 chunks at a time

    for (let i = 0; i < allNewChunks.length; i += EMBED_BATCH) {
      const batch = allNewChunks.slice(i, i + EMBED_BATCH);
      const texts = batch.map(c => c.content);

      try {
        const embeddings = await embed(
          texts,
          embeddingConfig.provider,
          embeddingConfig.model,
          embeddingConfig.apiKey
        );

        const storeTransaction = db.transaction(() => {
          for (let j = 0; j < batch.length; j++) {
            storeEmbedding(db, batch[j].chunkId, embeddings[j]);
          }
        });
        storeTransaction();

        log(`  Embedded batch ${Math.floor(i / EMBED_BATCH) + 1}/${Math.ceil(allNewChunks.length / EMBED_BATCH)}`);
      } catch (err) {
        const msg = `Embedding error (batch ${Math.floor(i / EMBED_BATCH) + 1}): ${err.message}`;
        log(`  ERROR: ${msg}`);
        errors.push(msg);
      }
    }
  } else if (allNewChunks.length > 0 && !embeddingConfig?.apiKey) {
    log('Skipping embeddings (no API key). Text search (FTS5) still available.');
  }

  // Get final stats
  const stats = getStats(db);
  db.close();

  return {
    indexed: toIndex.length,
    removed: toRemove.length,
    unchanged: unchanged.length,
    chunks: totalChunks,
    totalFiles: stats.fileCount,
    totalChunks: stats.chunkCount,
    embeddedChunks: stats.embeddedCount,
    errors,
  };
}
