/**
 * Hybrid search: vector (sqlite-vec) + FTS5 (BM25) with reciprocal rank fusion.
 *
 * Pipeline:
 *   1. Query → generate embedding (if embeddings available)
 *   2. Vector search (cosine distance) → top K candidates
 *   3. BM25 full-text search (FTS5) → top K candidates
 *   4. Reciprocal rank fusion to merge ranked lists
 *   5. Return top N results with scores and citations
 */

import {
  openDb, getConfig,
} from './db.js';
import { embed, resolveApiKey } from './embeddings.js';

/**
 * Default RRF constant (k). Higher values give more weight to lower-ranked items.
 * Standard value from the original RRF paper (Cormack et al., 2009).
 */
const RRF_K = 60;

/**
 * Run hybrid search over the memory index.
 *
 * @param {object} options
 * @param {string} options.projectPath - Project root (contains .jat/)
 * @param {string} options.query - Search query text
 * @param {number} [options.limit=5] - Max results to return
 * @param {number} [options.candidates=20] - Candidates per search method
 * @param {number} [options.minScore=0] - Minimum RRF score to include
 * @param {boolean} [options.verbose=false] - Print debug info
 * @returns {Promise<Array<{path: string, snippet: string, score: number, startLine: number, endLine: number, source: string, section: string, taskId: string}>>}
 */
export async function search(options) {
  const {
    projectPath,
    query,
    limit = 5,
    candidates = 20,
    minScore = 0,
    verbose = false,
  } = options;

  const log = verbose ? (...args) => console.error('[search]', ...args) : () => {};

  const db = openDb(projectPath);

  try {
    // --- FTS5 search ---
    const ftsResults = searchFts(db, query, candidates);
    log(`FTS5 results: ${ftsResults.length}`);

    // --- Vector search ---
    const vecResults = await searchVector(db, query, candidates, log);
    log(`Vector results: ${vecResults.length}`);

    // --- Reciprocal rank fusion ---
    const merged = reciprocalRankFusion(ftsResults, vecResults, RRF_K);
    log(`Merged results: ${merged.length}`);

    // --- Hydrate and filter ---
    const results = hydrateResults(db, merged, limit, minScore);
    log(`Final results: ${results.length}`);

    return results;
  } finally {
    db.close();
  }
}

/**
 * BM25 full-text search via FTS5.
 * @param {import('better-sqlite3').Database} db
 * @param {string} query
 * @param {number} limit
 * @returns {Array<{chunkId: number, rank: number}>}
 */
function searchFts(db, query, limit) {
  // FTS5 MATCH query — escape special characters for safety
  const safeQuery = escapeFtsQuery(query);

  try {
    const rows = db.prepare(`
      SELECT rowid AS chunkId, rank
      FROM chunks_fts
      WHERE chunks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(safeQuery, limit);

    // FTS5 rank is negative (lower = better match), convert to positive ranking
    return rows.map((row, idx) => ({
      chunkId: row.chunkId,
      rank: idx + 1,
      ftsScore: -row.rank, // Make positive for display
    }));
  } catch {
    // FTS query parse error — fall back to simpler query
    try {
      // Try with each word as a separate token (implicit AND)
      const words = query.split(/\s+/).filter(w => w.length > 1).map(w => `"${w}"`);
      if (words.length === 0) return [];

      const fallbackQuery = words.join(' ');
      const rows = db.prepare(`
        SELECT rowid AS chunkId, rank
        FROM chunks_fts
        WHERE chunks_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(fallbackQuery, limit);

      return rows.map((row, idx) => ({
        chunkId: row.chunkId,
        rank: idx + 1,
        ftsScore: -row.rank,
      }));
    } catch {
      return [];
    }
  }
}

/**
 * Escape an FTS5 query to avoid syntax errors.
 * Wraps each token in quotes if it contains special chars.
 * @param {string} query
 * @returns {string}
 */
function escapeFtsQuery(query) {
  // Split into words, wrap each in quotes to avoid operator interpretation
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '""';

  // If only simple alphanumeric tokens, use as-is for natural ranking
  const isSimple = tokens.every(t => /^[a-zA-Z0-9_-]+$/.test(t));
  if (isSimple) return tokens.join(' ');

  // Otherwise quote each token
  return tokens.map(t => `"${t.replace(/"/g, '""')}"`).join(' ');
}

/**
 * Vector similarity search via sqlite-vec.
 * @param {import('better-sqlite3').Database} db
 * @param {string} query
 * @param {number} limit
 * @param {Function} log
 * @returns {Promise<Array<{chunkId: number, rank: number, distance: number}>>}
 */
async function searchVector(db, query, limit, log) {
  // Check if vec_chunks table exists
  const vecExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='vec_chunks'"
  ).get();

  if (!vecExists) {
    log('No vec_chunks table — skipping vector search');
    return [];
  }

  // Check if there are any embedded chunks
  const count = db.prepare('SELECT COUNT(*) as c FROM vec_chunks').get();
  if (count.c === 0) {
    log('No embeddings in vec_chunks — skipping vector search');
    return [];
  }

  // Resolve embedding config from DB
  const provider = getConfig(db, 'embedding_provider');
  const model = getConfig(db, 'embedding_model');

  if (!provider) {
    log('No embedding provider configured — skipping vector search');
    return [];
  }

  const apiKey = resolveApiKey(provider);
  if (!apiKey) {
    log(`No API key for ${provider} — skipping vector search`);
    return [];
  }

  // Generate query embedding
  log(`Embedding query with ${provider}/${model}...`);
  let queryEmbedding;
  try {
    const embeddings = await embed([query], provider, model, apiKey);
    queryEmbedding = embeddings[0];
  } catch (err) {
    log(`Embedding error: ${err.message} — skipping vector search`);
    return [];
  }

  // Search with sqlite-vec cosine distance
  const queryBuffer = Buffer.from(queryEmbedding.buffer, queryEmbedding.byteOffset, queryEmbedding.byteLength);

  const rows = db.prepare(`
    SELECT chunk_id AS chunkId, distance
    FROM vec_chunks
    WHERE embedding MATCH ?
    ORDER BY distance
    LIMIT ?
  `).all(queryBuffer, limit);

  return rows.map((row, idx) => ({
    chunkId: Number(row.chunkId),
    rank: idx + 1,
    distance: row.distance,
  }));
}

/**
 * Reciprocal Rank Fusion: merge two ranked lists into one.
 *
 * RRF score for item i = sum over all lists: 1 / (k + rank_i)
 *
 * @param {Array<{chunkId: number, rank: number}>} listA - FTS results
 * @param {Array<{chunkId: number, rank: number}>} listB - Vector results
 * @param {number} k - RRF constant (default 60)
 * @returns {Array<{chunkId: number, score: number, sources: string[]}>}
 */
function reciprocalRankFusion(listA, listB, k = RRF_K) {
  const scores = new Map(); // chunkId -> { score, sources }

  for (const item of listA) {
    const existing = scores.get(item.chunkId) || { score: 0, sources: [] };
    existing.score += 1 / (k + item.rank);
    existing.sources.push('fts');
    scores.set(item.chunkId, existing);
  }

  for (const item of listB) {
    const existing = scores.get(item.chunkId) || { score: 0, sources: [] };
    existing.score += 1 / (k + item.rank);
    existing.sources.push('vector');
    scores.set(item.chunkId, existing);
  }

  // Sort by RRF score descending
  return Array.from(scores.entries())
    .map(([chunkId, data]) => ({
      chunkId,
      score: data.score,
      sources: data.sources,
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Hydrate merged results with full chunk data.
 * @param {import('better-sqlite3').Database} db
 * @param {Array<{chunkId: number, score: number, sources: string[]}>} merged
 * @param {number} limit
 * @param {number} minScore
 * @returns {Array<{path: string, snippet: string, score: number, startLine: number, endLine: number, source: string, section: string, taskId: string}>}
 */
function hydrateResults(db, merged, limit, minScore) {
  const results = [];

  for (const item of merged) {
    if (results.length >= limit) break;
    if (item.score < minScore) break; // Sorted desc, so all remaining are lower

    const chunk = db.prepare(`
      SELECT path, content, start_line, end_line, section, task_id
      FROM chunks
      WHERE id = ?
    `).get(item.chunkId);

    if (!chunk) continue;

    results.push({
      path: chunk.path,
      snippet: chunk.content,
      score: Math.round(item.score * 10000) / 10000, // 4 decimal places
      startLine: chunk.start_line,
      endLine: chunk.end_line,
      source: item.sources.join('+'),
      section: chunk.section,
      taskId: chunk.task_id,
    });
  }

  return results;
}
