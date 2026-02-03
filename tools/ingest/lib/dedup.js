import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(process.env.HOME, '.local/share/jat/ingest.db');
const SCHEMA_PATH = join(__dirname, '..', 'schema.sql');

let db = null;

export function getDb() {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

export function isDuplicate(sourceId, itemId) {
  const row = getDb().prepare(
    'SELECT 1 FROM ingested_items WHERE source_id = ? AND item_id = ?'
  ).get(sourceId, itemId);
  return !!row;
}

export function recordItem(sourceId, itemId, itemHash, taskId, title) {
  getDb().prepare(
    `INSERT OR IGNORE INTO ingested_items (source_id, item_id, item_hash, task_id, title)
     VALUES (?, ?, ?, ?, ?)`
  ).run(sourceId, itemId, itemHash, taskId, title);
}

export function getAdapterState(sourceId) {
  const row = getDb().prepare(
    'SELECT state_json FROM adapter_state WHERE source_id = ?'
  ).get(sourceId);
  return row ? JSON.parse(row.state_json) : {};
}

export function setAdapterState(sourceId, state) {
  getDb().prepare(
    `INSERT INTO adapter_state (source_id, state_json, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(source_id) DO UPDATE SET
       state_json = excluded.state_json,
       updated_at = excluded.updated_at`
  ).run(sourceId, JSON.stringify(state));
}

export function logPoll(sourceId, itemsFound, itemsNew, error, durationMs) {
  getDb().prepare(
    `INSERT INTO poll_log (source_id, items_found, items_new, error, duration_ms)
     VALUES (?, ?, ?, ?, ?)`
  ).run(sourceId, itemsFound, itemsNew, error || null, durationMs);
}

export function getRecentPolls(sourceId, limit = 10) {
  return getDb().prepare(
    `SELECT * FROM poll_log WHERE source_id = ?
     ORDER BY poll_at DESC LIMIT ?`
  ).all(sourceId, limit);
}

export function getItemCount(sourceId) {
  const row = getDb().prepare(
    'SELECT COUNT(*) as count FROM ingested_items WHERE source_id = ?'
  ).get(sourceId);
  return row.count;
}

export function getLastPoll(sourceId) {
  return getDb().prepare(
    `SELECT * FROM poll_log WHERE source_id = ?
     ORDER BY poll_at DESC LIMIT 1`
  ).get(sourceId);
}

export function getAllSourceStats() {
  return getDb().prepare(
    `SELECT
       source_id,
       COUNT(*) as total_items,
       MAX(ingested_at) as last_ingested
     FROM ingested_items
     GROUP BY source_id`
  ).all();
}

export function registerThread(sourceId, parentItemId, parentTs, taskId) {
  getDb().prepare(
    `INSERT OR IGNORE INTO thread_replies (source_id, parent_item_id, parent_ts, task_id)
     VALUES (?, ?, ?, ?)`
  ).run(sourceId, parentItemId, parentTs, taskId);
}

export function getActiveThreads(sourceId, limit = 50) {
  return getDb().prepare(
    `SELECT * FROM thread_replies
     WHERE source_id = ? AND active = 1
     ORDER BY created_at DESC LIMIT ?`
  ).all(sourceId, limit);
}

export function updateThreadCursor(sourceId, parentItemId, lastReplyTs) {
  getDb().prepare(
    `UPDATE thread_replies
     SET last_reply_ts = ?, reply_count = reply_count + 1, updated_at = datetime('now')
     WHERE source_id = ? AND parent_item_id = ?`
  ).run(lastReplyTs, sourceId, parentItemId);
}

export function deactivateThread(sourceId, parentItemId) {
  getDb().prepare(
    `UPDATE thread_replies SET active = 0, updated_at = datetime('now')
     WHERE source_id = ? AND parent_item_id = ?`
  ).run(sourceId, parentItemId);
}
