/**
 * JAT Task Database Layer
 *
 * Uses .jat/ directory with SQLite (via better-sqlite3) as source of truth.
 * Scans ~/code/PROJECT/.jat/ for project databases.
 */

// @ts-ignore - better-sqlite3 types may not match exactly
import Database from 'better-sqlite3';
import { readdirSync, existsSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { randomBytes } from 'crypto';

// ---------------------------------------------------------------------------
// Types (JSDoc)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Project
 * @property {string} name
 * @property {string} path
 * @property {string} dbPath
 */

/**
 * @typedef {Object} Dependency
 * @property {string} id
 * @property {string} type
 * @property {string} title
 * @property {string} status
 * @property {number} priority
 */

/**
 * @typedef {Object} Comment
 * @property {number} id
 * @property {string} author
 * @property {string} text
 * @property {string} created_at
 */

/**
 * @typedef {Object} Task
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string} notes
 * @property {string} status
 * @property {number} priority
 * @property {string} issue_type
 * @property {string} assignee
 * @property {string} created_at
 * @property {string} updated_at
 * @property {string} closed_at
 * @property {string} close_reason
 * @property {string} project
 * @property {string} project_path
 * @property {string[]} labels
 * @property {Dependency[]} depends_on
 * @property {Dependency[]} blocked_by
 * @property {Comment[]} [comments]
 * @property {string|null} [review_override]
 */

// ---------------------------------------------------------------------------
// Schema (embedded for initProject)
// ---------------------------------------------------------------------------

const SCHEMA_PATH = new URL('./tasks-schema.sql', import.meta.url);
let _schemaSQL = null;

function getSchemaSQL() {
  if (!_schemaSQL) {
    _schemaSQL = readFileSync(SCHEMA_PATH, 'utf-8');
  }
  return _schemaSQL;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse review_override from notes field.
 * Format: [REVIEW_OVERRIDE:value] in notes
 * @param {string|null|undefined} notes
 * @returns {string|null}
 */
function parseReviewOverride(notes) {
  if (!notes) return null;
  const match = notes.match(/\[REVIEW_OVERRIDE:(always_review|always_auto)\]/);
  return match ? match[1] : null;
}

/**
 * Read JAT config (~/.config/jat/projects.json)
 * @returns {any|null}
 */
function readJatConfig() {
  const configPath = join(homedir(), '.config', 'jat', 'projects.json');
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Touch .jat/last-touched to notify file watchers of a mutation.
 * @param {string} projectPath
 */
function touchLastTouched(projectPath) {
  const sentinel = join(projectPath, '.jat', 'last-touched');
  writeFileSync(sentinel, String(Date.now()));
}

/**
 * Open a database connection with WAL mode and foreign keys enabled.
 * @param {string} dbPath
 * @param {boolean} [readonly=false]
 * @returns {import('better-sqlite3').Database}
 */
function openDb(dbPath, readonly = false) {
  const db = new Database(dbPath, { readonly });
  if (!readonly) {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * Generate an ISO timestamp for now.
 * @returns {string}
 */
function now() {
  return new Date().toISOString();
}

/**
 * Generate a random task ID: {prefix}-{5 alphanumeric chars}
 * @param {string} prefix - Project prefix (e.g. "jat")
 * @returns {string}
 */
export function generateTaskId(prefix) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(5);
  let id = '';
  for (let i = 0; i < 5; i++) {
    id += chars[bytes[i] % chars.length];
  }
  return `${prefix}-${id}`;
}

// ---------------------------------------------------------------------------
// Project Discovery
// ---------------------------------------------------------------------------

/**
 * Get all projects that have JAT task databases (.jat/tasks.db).
 * @returns {Project[]}
 */
export function getProjects() {
  const projects = [];
  const seenPaths = new Set();

  // 1. Check custom paths from JAT config
  const jatConfig = readJatConfig();
  if (jatConfig?.projects) {
    for (const [name, config] of Object.entries(jatConfig.projects)) {
      const projectPath = /** @type {any} */ (config).path?.replace(/^~/, homedir());
      if (!projectPath) continue;

      const jatDb = join(projectPath, '.jat', 'tasks.db');

      if (existsSync(jatDb)) {
        projects.push({ name, path: projectPath, dbPath: jatDb });
        seenPaths.add(projectPath);
      }
    }
  }

  // 2. Scan ~/code/ for projects not in config
  const codeDir = join(homedir(), 'code');
  if (existsSync(codeDir)) {
    try {
      for (const entry of readdirSync(codeDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const projectPath = join(codeDir, entry.name);
        if (seenPaths.has(projectPath)) continue;

        const jatDb = join(projectPath, '.jat', 'tasks.db');

        if (existsSync(jatDb)) {
          projects.push({ name: entry.name, path: projectPath, dbPath: jatDb });
        }
      }
    } catch (error) {
      console.error('Error scanning projects:', error);
    }
  }

  return projects;
}

// ---------------------------------------------------------------------------
// Internal: Load task data from a single DB
// ---------------------------------------------------------------------------

/**
 * Determine the correct table name for the tasks table.
 * @param {string} dbPath
 * @returns {string}
 */
function getTasksTable(dbPath) {
  return 'tasks';
}

/**
 * Load labels for a task.
 * @param {import('better-sqlite3').Database} db
 * @param {string} taskId
 * @returns {string[]}
 */
function loadLabels(db, taskId) {
  const rows = db.prepare('SELECT label FROM labels WHERE issue_id = ?').all(taskId);
  return rows.map((/** @type {any} */ r) => r.label);
}

/**
 * Load dependencies (tasks this task depends on).
 * @param {import('better-sqlite3').Database} db
 * @param {string} taskId
 * @param {string} table
 * @returns {Dependency[]}
 */
function loadDependsOn(db, taskId, table) {
  const rows = db.prepare(`
    SELECT d.depends_on_id, d.type, t.title, t.status, t.priority
    FROM dependencies d
    LEFT JOIN ${table} t ON d.depends_on_id = t.id
    WHERE d.issue_id = ?
  `).all(taskId);
  return rows.map((/** @type {any} */ r) => ({
    id: r.depends_on_id,
    type: r.type,
    title: r.title,
    status: r.status,
    priority: r.priority,
  }));
}

/**
 * Load dependents (tasks that depend on this task).
 * @param {import('better-sqlite3').Database} db
 * @param {string} taskId
 * @param {string} table
 * @returns {Dependency[]}
 */
function loadBlockedBy(db, taskId, table) {
  const rows = db.prepare(`
    SELECT d.issue_id, d.type, t.title, t.status, t.priority
    FROM dependencies d
    LEFT JOIN ${table} t ON d.issue_id = t.id
    WHERE d.depends_on_id = ?
  `).all(taskId);
  return rows.map((/** @type {any} */ r) => ({
    id: r.issue_id,
    type: r.type,
    title: r.title,
    status: r.status,
    priority: r.priority,
  }));
}

/**
 * Load comments for a task.
 * @param {import('better-sqlite3').Database} db
 * @param {string} taskId
 * @returns {Comment[]}
 */
function loadComments(db, taskId) {
  return /** @type {Comment[]} */ (db.prepare(
    'SELECT id, author, text, created_at FROM comments WHERE issue_id = ? ORDER BY created_at ASC'
  ).all(taskId));
}

/**
 * Enrich a raw task row with labels, deps, review_override, project info.
 * @param {import('better-sqlite3').Database} db
 * @param {any} row
 * @param {string} table
 * @param {string} projectName
 * @param {string} projectPath
 * @param {Object} [options]
 * @param {boolean} [options.includeComments]
 * @returns {Task}
 */
function enrichTask(db, row, table, projectName, projectPath, options = {}) {
  row.project = projectName;
  row.project_path = projectPath;
  row.labels = loadLabels(db, row.id);
  row.depends_on = loadDependsOn(db, row.id, table);
  row.blocked_by = loadBlockedBy(db, row.id, table);
  row.review_override = parseReviewOverride(row.notes);
  if (options.includeComments) {
    row.comments = loadComments(db, row.id);
  }
  return /** @type {Task} */ (row);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Get all tasks from all projects.
 * @param {Object} [options]
 * @param {string} [options.status]
 * @param {number} [options.priority]
 * @param {string} [options.projectName] - Filter by task ID prefix
 * @returns {Task[]}
 */
export function getTasks(options = {}) {
  const { status, priority, projectName } = options;
  const projects = getProjects();
  const allTasks = [];

  for (const project of projects) {
    try {
      const db = openDb(project.dbPath, true);
      const table = getTasksTable(project.dbPath);

      let query = `SELECT * FROM ${table} WHERE 1=1`;
      const params = [];

      if (status !== undefined) {
        query += ' AND status = ?';
        params.push(status);
      }
      if (priority !== undefined) {
        query += ' AND priority = ?';
        params.push(priority);
      }
      query += ' ORDER BY priority ASC, created_at DESC';

      const rows = db.prepare(query).all(...params);
      for (const row of rows) {
        allTasks.push(enrichTask(db, row, table, project.name, project.path));
      }
      db.close();
    } catch (error) {
      console.error(`Error querying project ${project.name}:`, error);
    }
  }

  // Sort globally
  allTasks.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Filter by task ID prefix if projectName specified
  if (projectName) {
    return allTasks.filter((task) => {
      const match = task.id.match(/^([a-zA-Z0-9_-]+?)-([a-zA-Z0-9.]+)$/);
      return match ? match[1] === projectName : false;
    });
  }

  return allTasks;
}

/**
 * Get a specific task by ID (searches all projects).
 * @param {string} taskId
 * @returns {Task|null}
 */
export function getTaskById(taskId) {
  const projects = getProjects();

  for (const project of projects) {
    try {
      const db = openDb(project.dbPath, true);
      const table = getTasksTable(project.dbPath);

      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(taskId);
      if (row) {
        const task = enrichTask(db, row, table, project.name, project.path, { includeComments: true });
        db.close();
        return task;
      }
      db.close();
    } catch (error) {
      console.error(`Error querying task ${taskId} in project ${project.name}:`, error);
    }
  }
  return null;
}

/**
 * Get tasks that are ready to work on (open, all deps closed).
 * @returns {Task[]}
 */
export function getReadyTasks() {
  const allTasks = getTasks({ status: 'open' });
  const readyTasks = [];

  for (const task of allTasks) {
    const fullTask = getTaskById(task.id);
    if (!fullTask) continue;

    if (!fullTask.depends_on || fullTask.depends_on.length === 0) {
      readyTasks.push(fullTask);
    } else {
      const hasBlockers = fullTask.depends_on.some((dep) => dep.status !== 'closed');
      if (!hasBlockers) {
        readyTasks.push(fullTask);
      }
    }
  }

  return readyTasks;
}

// ---------------------------------------------------------------------------
// Writes (new)
// ---------------------------------------------------------------------------

/**
 * Find the project DB for a given task ID.
 * Searches all discovered projects.
 * @param {string} taskId
 * @param {string} [projectPath] - If provided, use this project directly
 * @returns {{ db: import('better-sqlite3').Database, project: Project, table: string } | null}
 */
function findProjectForTask(taskId, projectPath) {
  // Fast path: caller knows the project
  if (projectPath) {
    const jatDb = join(projectPath, '.jat', 'tasks.db');
    const dbPath = existsSync(jatDb) ? jatDb : null;
    if (dbPath) {
      const db = openDb(dbPath);
      const table = getTasksTable(dbPath);
      const name = projectPath.split('/').pop() || 'unknown';
      return { db, project: { name, path: projectPath, dbPath }, table };
    }
  }

  // Discovery path: search all projects
  const projects = getProjects();
  for (const project of projects) {
    try {
      const db = openDb(project.dbPath);
      const table = getTasksTable(project.dbPath);
      const exists = db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(taskId);
      if (exists) {
        return { db, project, table };
      }
      db.close();
    } catch {
      // continue
    }
  }
  return null;
}

/**
 * Find a writable .jat/ DB for a project path, or by task ID prefix.
 * @param {string} projectPath
 * @returns {{ db: import('better-sqlite3').Database, project: Project, table: string }}
 */
function getWritableDb(projectPath) {
  const dbPath = join(projectPath, '.jat', 'tasks.db');
  if (!existsSync(dbPath)) {
    throw new Error(`No .jat/ database at ${projectPath}. Run initProject() first.`);
  }
  const db = openDb(dbPath);
  const projectName = projectPath.split('/').pop() || 'unknown';
  return {
    db,
    project: { name: projectName, path: projectPath, dbPath },
    table: 'tasks',
  };
}

/**
 * Create a new task.
 * @param {Object} opts
 * @param {string} opts.projectPath - Absolute path to the project
 * @param {string} opts.title
 * @param {string} [opts.description]
 * @param {string} [opts.type] - issue_type (default: 'task')
 * @param {number} [opts.priority] - 0-4 (default: 2)
 * @param {string[]} [opts.labels]
 * @param {string[]} [opts.deps] - Task IDs this task depends on
 * @param {string} [opts.assignee]
 * @param {string} [opts.notes]
 * @param {string} [opts.id] - Optional explicit ID (for child tasks like jat-abc.1)
 * @returns {Task}
 */
export function createTask(opts) {
  const { projectPath, title, description = '', type = 'task', priority = 2, labels = [], deps = [], assignee = null, notes = '', id: explicitId } = opts;
  const { db, project, table } = getWritableDb(projectPath);

  const prefix = project.name;
  const id = explicitId || generateTaskId(prefix);
  const ts = now();

  try {
    db.prepare(`
      INSERT INTO ${table} (id, title, description, notes, status, priority, issue_type, assignee, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)
    `).run(id, title, description, notes, priority, type, assignee, ts, ts);

    // Insert labels
    const insertLabel = db.prepare('INSERT INTO labels (issue_id, label) VALUES (?, ?)');
    for (const label of labels) {
      insertLabel.run(id, label.trim());
    }

    // Insert dependencies
    const insertDep = db.prepare('INSERT INTO dependencies (issue_id, depends_on_id, type) VALUES (?, ?, ?)');
    for (const depId of deps) {
      insertDep.run(id, depId, 'blocks');
    }

    touchLastTouched(projectPath);

    const task = enrichTask(db, db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id), table, project.name, projectPath, { includeComments: true });
    db.close();
    return task;
  } catch (error) {
    db.close();
    throw error;
  }
}

/**
 * Update a task's fields.
 * @param {string} taskId
 * @param {Object} updates - Fields to update
 * @param {string} [updates.title]
 * @param {string} [updates.description]
 * @param {string} [updates.notes]
 * @param {string} [updates.status]
 * @param {number} [updates.priority]
 * @param {string} [updates.issue_type]
 * @param {string} [updates.assignee]
 * @param {string[]} [updates.labels] - Replace all labels
 * @param {string} [updates.projectPath] - Optional project path hint
 * @returns {Task}
 */
export function updateTask(taskId, updates) {
  const found = findProjectForTask(taskId, updates.projectPath);
  if (!found) throw new Error(`Task not found: ${taskId}`);
  const { db, project, table } = found;

  try {
    const allowedFields = ['title', 'description', 'notes', 'status', 'priority', 'issue_type', 'assignee'];
    const sets = [];
    const params = [];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        sets.push(`${field} = ?`);
        params.push(updates[field]);
      }
    }

    // Handle status transitions
    if (updates.status === 'closed') {
      sets.push('closed_at = ?');
      params.push(now());
    } else if (updates.status && updates.status !== 'closed') {
      sets.push('closed_at = NULL');
    }

    if (sets.length > 0) {
      sets.push('updated_at = ?');
      params.push(now());
      params.push(taskId);
      db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    }

    // Replace labels if provided
    if (updates.labels !== undefined) {
      db.prepare('DELETE FROM labels WHERE issue_id = ?').run(taskId);
      const insertLabel = db.prepare('INSERT INTO labels (issue_id, label) VALUES (?, ?)');
      for (const label of updates.labels) {
        if (label.trim()) insertLabel.run(taskId, label.trim());
      }
      // Update updated_at even if only labels changed
      if (sets.length === 0) {
        db.prepare(`UPDATE ${table} SET updated_at = ? WHERE id = ?`).run(now(), taskId);
      }
    }

    touchLastTouched(project.path);

    const task = enrichTask(db, db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(taskId), table, project.name, project.path, { includeComments: true });
    db.close();
    return task;
  } catch (error) {
    db.close();
    throw error;
  }
}

/**
 * Close a task.
 * @param {string} taskId
 * @param {string} [reason]
 * @param {string} [projectPath] - Optional project path hint
 * @returns {Task}
 */
export function closeTask(taskId, reason = '', projectPath) {
  const found = findProjectForTask(taskId, projectPath);
  if (!found) throw new Error(`Task not found: ${taskId}`);
  const { db, project, table } = found;

  try {
    const ts = now();
    db.prepare(`UPDATE ${table} SET status = 'closed', closed_at = ?, close_reason = ?, updated_at = ? WHERE id = ?`)
      .run(ts, reason, ts, taskId);

    touchLastTouched(project.path);

    const task = enrichTask(db, db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(taskId), table, project.name, project.path, { includeComments: true });
    db.close();
    return task;
  } catch (error) {
    db.close();
    throw error;
  }
}

/**
 * Delete a task (hard delete).
 * @param {string} taskId
 * @param {string} [projectPath] - Optional project path hint
 * @returns {boolean}
 */
export function deleteTask(taskId, projectPath) {
  const found = findProjectForTask(taskId, projectPath);
  if (!found) throw new Error(`Task not found: ${taskId}`);
  const { db, project, table } = found;

  try {
    // CASCADE handles labels, deps, comments
    const result = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(taskId);
    touchLastTouched(project.path);
    db.close();
    return result.changes > 0;
  } catch (error) {
    db.close();
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/**
 * Add a dependency (taskId depends on dependsOnId).
 * Performs cycle detection before inserting.
 * @param {string} taskId
 * @param {string} dependsOnId
 * @param {string} [projectPath] - Optional project path hint
 * @returns {boolean}
 */
export function addDependency(taskId, dependsOnId, projectPath) {
  if (taskId === dependsOnId) {
    throw new Error('A task cannot depend on itself');
  }

  const found = findProjectForTask(taskId, projectPath);
  if (!found) throw new Error(`Task not found: ${taskId}`);
  const { db, project } = found;

  try {
    // Cycle detection: check if dependsOnId already (transitively) depends on taskId
    const wouldCycle = db.prepare(`
      WITH RECURSIVE chain(id) AS (
        SELECT ?
        UNION ALL
        SELECT d.depends_on_id FROM dependencies d
        JOIN chain c ON d.issue_id = c.id
      )
      SELECT 1 FROM chain WHERE id = ? LIMIT 1
    `).get(dependsOnId, taskId);

    if (wouldCycle) {
      db.close();
      throw new Error(`Adding dependency would create a cycle: ${taskId} -> ${dependsOnId}`);
    }

    db.prepare('INSERT OR IGNORE INTO dependencies (issue_id, depends_on_id, type) VALUES (?, ?, ?)')
      .run(taskId, dependsOnId, 'blocks');

    touchLastTouched(project.path);
    db.close();
    return true;
  } catch (error) {
    db.close();
    throw error;
  }
}

/**
 * Remove a dependency.
 * @param {string} taskId
 * @param {string} dependsOnId
 * @param {string} [projectPath] - Optional project path hint
 * @returns {boolean}
 */
export function removeDependency(taskId, dependsOnId, projectPath) {
  const found = findProjectForTask(taskId, projectPath);
  if (!found) throw new Error(`Task not found: ${taskId}`);
  const { db, project } = found;

  try {
    const result = db.prepare('DELETE FROM dependencies WHERE issue_id = ? AND depends_on_id = ?')
      .run(taskId, dependsOnId);
    touchLastTouched(project.path);
    db.close();
    return result.changes > 0;
  } catch (error) {
    db.close();
    throw error;
  }
}

/**
 * Get dependency tree using recursive CTE.
 * @param {string} taskId
 * @param {Object} [options]
 * @param {boolean} [options.reverse] - If true, get dependents (what depends on this task)
 * @param {string} [options.projectPath] - Optional project path hint
 * @returns {Array<{id: string, title: string, status: string, priority: number, depth: number}>}
 */
export function getDependencyTree(taskId, options = {}) {
  const found = findProjectForTask(taskId, options.projectPath);
  if (!found) return [];
  const { db, table } = found;

  try {
    let result;
    if (options.reverse) {
      // What depends on this task (dependents/blocked_by)
      result = db.prepare(`
        WITH RECURSIVE tree(id, depth) AS (
          SELECT issue_id, 1 FROM dependencies WHERE depends_on_id = ?
          UNION ALL
          SELECT d.issue_id, t.depth + 1 FROM dependencies d
          JOIN tree t ON d.depends_on_id = t.id
          WHERE t.depth < 20
        )
        SELECT DISTINCT tree.id, tree.depth, tsk.title, tsk.status, tsk.priority
        FROM tree
        LEFT JOIN ${table} tsk ON tree.id = tsk.id
        ORDER BY tree.depth ASC, tsk.priority ASC
      `).all(taskId);
    } else {
      // What this task depends on
      result = db.prepare(`
        WITH RECURSIVE tree(id, depth) AS (
          SELECT depends_on_id, 1 FROM dependencies WHERE issue_id = ?
          UNION ALL
          SELECT d.depends_on_id, t.depth + 1 FROM dependencies d
          JOIN tree t ON d.issue_id = t.id
          WHERE t.depth < 20
        )
        SELECT DISTINCT tree.id, tree.depth, tsk.title, tsk.status, tsk.priority
        FROM tree
        LEFT JOIN ${table} tsk ON tree.id = tsk.id
        ORDER BY tree.depth ASC, tsk.priority ASC
      `).all(taskId);
    }

    db.close();
    return result;
  } catch (error) {
    db.close();
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Search tasks by title/description across all projects.
 * @param {string} query
 * @param {Object} [options]
 * @param {string} [options.updatedAfter] - ISO date string
 * @param {number} [options.limit]
 * @returns {Task[]}
 */
export function searchTasks(query, options = {}) {
  const { updatedAfter, limit = 50 } = options;
  const projects = getProjects();
  const results = [];

  const likeTerm = `%${query}%`;

  for (const project of projects) {
    try {
      const db = openDb(project.dbPath, true);
      const table = getTasksTable(project.dbPath);

      let sql = `SELECT * FROM ${table} WHERE (title LIKE ? OR description LIKE ?)`;
      const params = [likeTerm, likeTerm];

      if (updatedAfter) {
        sql += ' AND updated_at >= ?';
        params.push(updatedAfter);
      }

      sql += ' ORDER BY updated_at DESC LIMIT ?';
      params.push(limit);

      const rows = db.prepare(sql).all(...params);
      for (const row of rows) {
        results.push(enrichTask(db, row, table, project.name, project.path));
      }
      db.close();
    } catch (error) {
      console.error(`Error searching project ${project.name}:`, error);
    }
  }

  return results.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Project Init
// ---------------------------------------------------------------------------

/**
 * Initialize a project's .jat/ directory with empty database.
 * @param {string} projectPath - Absolute path to the project
 * @returns {{ dbPath: string }}
 */
export function initProject(projectPath) {
  const jatDir = join(projectPath, '.jat');
  const dbPath = join(jatDir, 'tasks.db');

  if (!existsSync(jatDir)) {
    mkdirSync(jatDir, { recursive: true });
  }

  // Write .gitignore for .jat/
  const gitignorePath = join(jatDir, '.gitignore');
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, 'tasks.db\ntasks.db-wal\ntasks.db-shm\n');
  }

  // Create or open database and apply schema
  const db = openDb(dbPath);
  db.exec(getSchemaSQL());
  db.close();

  // Create last-touched sentinel
  touchLastTouched(projectPath);

  return { dbPath };
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/**
 * Add a comment to a task.
 * @param {string} taskId
 * @param {string} author
 * @param {string} text
 * @param {string} [projectPath] - Optional project path hint
 * @returns {Comment}
 */
export function addComment(taskId, author, text, projectPath) {
  const found = findProjectForTask(taskId, projectPath);
  if (!found) throw new Error(`Task not found: ${taskId}`);
  const { db, project } = found;

  try {
    const ts = now();
    const result = db.prepare('INSERT INTO comments (issue_id, author, text, created_at) VALUES (?, ?, ?, ?)')
      .run(taskId, author, text, ts);

    touchLastTouched(project.path);
    const comment = /** @type {Comment} */ ({ id: result.lastInsertRowid, author, text, created_at: ts });
    db.close();
    return comment;
  } catch (error) {
    db.close();
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------

export default {
  // Project discovery
  getProjects,
  // Reads
  getTasks,
  getTaskById,
  getReadyTasks,
  searchTasks,
  // Writes
  createTask,
  updateTask,
  closeTask,
  deleteTask,
  // Dependencies
  addDependency,
  removeDependency,
  getDependencyTree,
  // Comments
  addComment,
  // Helpers
  generateTaskId,
  initProject,
};
