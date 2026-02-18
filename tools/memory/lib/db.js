/**
 * Database operations for memory index.
 * Creates and manages .squad/memory.db with chunks, FTS5, and sqlite-vec tables.
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, '..', '..', '..', 'lib', 'memory-schema.sql');

/**
 * Open (or create) the memory database for a project.
 * @param {string} projectPath - Path to project root (contains .squad/)
 * @returns {Database.Database}
 */
export function openDb(projectPath) {
  const dbPath = join(projectPath, '.squad', 'memory.db');
  const db = new Database(dbPath);

  // Load sqlite-vec extension
  sqliteVec.load(db);

  // WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Apply schema (idempotent - uses IF NOT EXISTS)
  const schema = readFileSync(SCHEMA_PATH, 'utf-8');
  // Filter out the commented-out vec0 creation (we handle that dynamically)
  const staticSchema = schema
    .split('\n')
    .filter(line => !line.startsWith('--'))
    .join('\n');
  db.exec(staticSchema);

  return db;
}

/**
 * Ensure the vec_chunks virtual table exists with correct dimension.
 * Called after reading config to know the embedding dimension.
 * @param {Database.Database} db
 * @param {number} dimension - Embedding vector dimension
 */
export function ensureVecTable(db, dimension) {
  // Check if vec_chunks exists
  const exists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='vec_chunks'"
  ).get();

  if (exists) {
    // Verify dimension matches (if possible)
    return;
  }

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
      chunk_id INTEGER PRIMARY KEY,
      embedding float[${dimension}]
    );
  `);
}

/**
 * Get a config value from the config table.
 * @param {Database.Database} db
 * @param {string} key
 * @returns {string|null}
 */
export function getConfig(db, key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row?.value ?? null;
}

/**
 * Set a config value.
 * @param {Database.Database} db
 * @param {string} key
 * @param {string} value
 */
export function setConfig(db, key, value) {
  db.prepare(
    'INSERT INTO config(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
  ).run(key, value, value);
}

/**
 * Get file metadata for change detection.
 * @param {Database.Database} db
 * @param {string} path - Relative path within .squad/memory/
 * @returns {{ path: string, file_hash: string, indexed_at: string } | null}
 */
export function getFileMeta(db, path) {
  return db.prepare('SELECT * FROM file_meta WHERE path = ?').get(path) ?? null;
}

/**
 * Delete all chunks and metadata for a file (before re-indexing).
 * @param {Database.Database} db
 * @param {string} path
 */
export function deleteFileData(db, path) {
  // Check if vec_chunks table exists before trying to delete from it
  const vecExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='vec_chunks'"
  ).get();

  if (vecExists) {
    const chunkIds = db.prepare('SELECT id FROM chunks WHERE path = ?').all(path);
    if (chunkIds.length > 0) {
      const placeholders = chunkIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM vec_chunks WHERE chunk_id IN (${placeholders})`).run(
        ...chunkIds.map(r => r.id)
      );
    }
  }

  db.prepare('DELETE FROM chunks WHERE path = ?').run(path);
  db.prepare('DELETE FROM file_meta WHERE path = ?').run(path);
}

/**
 * Insert a chunk and return its ID.
 * @param {Database.Database} db
 * @param {object} chunk
 * @returns {number} - Inserted chunk ID
 */
export function insertChunk(db, chunk) {
  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO chunks(path, task_id, section, start_line, end_line, content, token_count, created_at, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    chunk.path,
    chunk.taskId,
    chunk.section,
    chunk.startLine,
    chunk.endLine,
    chunk.content,
    chunk.tokenCount,
    now,
    now
  );
  return Number(result.lastInsertRowid);
}

/**
 * Store embedding for a chunk.
 * @param {Database.Database} db
 * @param {number} chunkId
 * @param {Float32Array} embedding
 */
export function storeEmbedding(db, chunkId, embedding) {
  // Store as raw float32 bytes in chunks table
  const blob = Buffer.from(embedding.buffer);
  db.prepare('UPDATE chunks SET embedding = ?, updated_at = ? WHERE id = ?').run(
    blob,
    new Date().toISOString(),
    chunkId
  );

  // Insert into vec_chunks for vector search
  // sqlite-vec requires BigInt for primary key and Buffer for embedding
  db.prepare('INSERT INTO vec_chunks(chunk_id, embedding) VALUES(?, ?)').run(
    BigInt(chunkId),
    Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength)
  );
}

/**
 * Insert or update file metadata.
 * @param {Database.Database} db
 * @param {object} meta
 */
export function upsertFileMeta(db, meta) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO file_meta(path, task_id, project, agent, completed_at, file_hash, chunk_count, indexed_at, tags, labels, files_touched, priority, issue_type, risk)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      task_id = excluded.task_id,
      project = excluded.project,
      agent = excluded.agent,
      completed_at = excluded.completed_at,
      file_hash = excluded.file_hash,
      chunk_count = excluded.chunk_count,
      indexed_at = excluded.indexed_at,
      tags = excluded.tags,
      labels = excluded.labels,
      files_touched = excluded.files_touched,
      priority = excluded.priority,
      issue_type = excluded.issue_type,
      risk = excluded.risk
  `).run(
    meta.path,
    meta.taskId,
    meta.project,
    meta.agent ?? null,
    meta.completedAt ?? null,
    meta.fileHash,
    meta.chunkCount,
    now,
    JSON.stringify(meta.tags ?? []),
    JSON.stringify(meta.labels ?? []),
    JSON.stringify(meta.filesTouched ?? []),
    meta.priority ?? null,
    meta.issueType ?? null,
    meta.risk ?? null
  );
}

/**
 * Get all indexed file paths and their hashes.
 * @param {Database.Database} db
 * @returns {Map<string, string>} path -> file_hash
 */
export function getAllFileHashes(db) {
  const rows = db.prepare('SELECT path, file_hash FROM file_meta').all();
  return new Map(rows.map(r => [r.path, r.file_hash]));
}

/**
 * Get index statistics.
 * @param {Database.Database} db
 * @returns {{ fileCount: number, chunkCount: number, embeddedCount: number }}
 */
export function getStats(db) {
  const fileCount = db.prepare('SELECT COUNT(*) as c FROM file_meta').get().c;
  const chunkCount = db.prepare('SELECT COUNT(*) as c FROM chunks').get().c;
  const embeddedCount = db.prepare('SELECT COUNT(*) as c FROM chunks WHERE embedding IS NOT NULL').get().c;
  return { fileCount, chunkCount, embeddedCount };
}
