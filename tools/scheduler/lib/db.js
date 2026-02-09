import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(process.env.HOME, '.local/share/jat/scheduler.db');
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

/**
 * Create a new scheduled action.
 * @param {object} action
 * @param {string} [action.task_id]
 * @param {string} [action.source_id]
 * @param {string} action.project
 * @param {string} action.command
 * @param {string} action.schedule_type - 'once' | 'delay' | 'time' | 'cron'
 * @param {string} action.schedule_value - ISO time, delay seconds, or cron expression
 * @param {string} action.next_run_at - ISO datetime for next execution
 * @returns {object} The created action with id
 */
export function create(action) {
  const stmt = getDb().prepare(
    `INSERT INTO scheduled_actions (task_id, source_id, project, command, schedule_type, schedule_value, next_run_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const result = stmt.run(
    action.task_id || null,
    action.source_id || null,
    action.project,
    action.command,
    action.schedule_type,
    action.schedule_value,
    action.next_run_at
  );
  return get(result.lastInsertRowid);
}

/**
 * Get a single action by ID.
 * @param {number} id
 * @returns {object|undefined}
 */
export function get(id) {
  return getDb().prepare('SELECT * FROM scheduled_actions WHERE id = ?').get(id);
}

/**
 * List actions with optional filters.
 * @param {object} [filters]
 * @param {string} [filters.status]
 * @param {string} [filters.project]
 * @param {number} [filters.limit=100]
 * @returns {object[]}
 */
export function list(filters = {}) {
  const conditions = [];
  const params = [];

  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.project) {
    conditions.push('project = ?');
    params.push(filters.project);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit || 100;
  params.push(limit);

  return getDb().prepare(
    `SELECT * FROM scheduled_actions ${where} ORDER BY next_run_at ASC LIMIT ?`
  ).all(...params);
}

/**
 * Update fields on an existing action.
 * @param {number} id
 * @param {object} updates - Fields to update (schedule_value, next_run_at, status, error, etc.)
 * @returns {object|undefined} Updated action
 */
export function update(id, updates) {
  const allowed = ['task_id', 'source_id', 'project', 'command', 'schedule_type', 'schedule_value', 'next_run_at', 'last_run_at', 'status', 'error'];
  const sets = [];
  const params = [];

  for (const key of allowed) {
    if (key in updates) {
      sets.push(`${key} = ?`);
      params.push(updates[key]);
    }
  }

  if (sets.length === 0) return get(id);

  sets.push("updated_at = datetime('now')");
  params.push(id);

  getDb().prepare(
    `UPDATE scheduled_actions SET ${sets.join(', ')} WHERE id = ?`
  ).run(...params);

  return get(id);
}

/**
 * Cancel an action (set status to 'cancelled').
 * @param {number} id
 * @returns {object|undefined}
 */
export function cancel(id) {
  return update(id, { status: 'cancelled' });
}

/**
 * Get all actions that are due to run (next_run_at <= now, status is 'pending' or 'active').
 * @returns {object[]}
 */
export function getDue() {
  return getDb().prepare(
    `SELECT * FROM scheduled_actions
     WHERE next_run_at <= datetime('now')
       AND status IN ('pending', 'active')
     ORDER BY next_run_at ASC`
  ).all();
}

/**
 * Mark an action as completed after successful execution.
 * For 'once' and 'delay' types, sets status to 'completed'.
 * For 'cron' and 'time' types, updates last_run_at and keeps status 'active'.
 * @param {number} id
 * @param {string} [nextRunAt] - Next run time for recurring actions
 * @returns {object|undefined}
 */
export function markComplete(id, nextRunAt) {
  const action = get(id);
  if (!action) return undefined;

  if (nextRunAt) {
    // Recurring: update last_run_at, set next run, keep active
    return update(id, {
      last_run_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
      next_run_at: nextRunAt,
      status: 'active',
      error: null
    });
  } else {
    // One-shot: mark completed
    return update(id, {
      last_run_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
      status: 'completed',
      error: null
    });
  }
}

/**
 * Mark an action as failed with an error message.
 * @param {number} id
 * @param {string} error
 * @returns {object|undefined}
 */
export function markFailed(id, error) {
  return update(id, {
    last_run_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    status: 'failed',
    error
  });
}
