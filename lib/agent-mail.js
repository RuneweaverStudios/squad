/**
 * Agent Mail SQLite Query Layer
 *
 * Provides functions to query Agent Mail message database.
 * Queries ~/.agent-mail.db for multi-agent coordination messages.
 */

// @ts-ignore - better-sqlite3 types may not match exactly
import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';

/**
 * @typedef {Object} Message
 * @property {number} id
 * @property {string} thread_id
 * @property {string} subject
 * @property {string} body_md
 * @property {string} importance
 * @property {boolean} ack_required
 * @property {string} created_ts
 * @property {string} sender_name
 * @property {string} sender_program
 * @property {string} sender_model
 * @property {string} project_path
 * @property {string} [read_ts]
 * @property {string} [ack_ts]
 * @property {string} [kind]
 * @property {Array<{agent_name: string, kind: string, read_ts: string, ack_ts: string}>} [recipients]
 */

/**
 * @typedef {Object} Agent
 * @property {number} id
 * @property {string} name
 * @property {string} program
 * @property {string} model
 * @property {string} task_description
 * @property {string} inception_ts
 * @property {string} last_active_ts
 * @property {string} project_path
 */

/**
 * @typedef {Object} Thread
 * @property {string} thread_id
 * @property {number} message_count
 * @property {string} first_message_ts
 * @property {string} last_message_ts
 * @property {string} participants
 */

const DB_PATH = join(homedir(), '.agent-mail.db');

/**
 * Get all messages in a thread
 * @param {string} threadId - The thread ID to retrieve messages for
 * @param {Object} [options] - Query options
 * @param {string} [options.projectPath] - Filter by project path
 * @returns {Message[]} List of messages in the thread
 */
export function getThreadMessages(threadId, options = {}) {
  const { projectPath } = options;

  try {
    const db = new Database(DB_PATH, { readonly: true });

    let query = `
      SELECT
        m.id,
        m.thread_id,
        m.subject,
        m.body_md,
        m.importance,
        m.ack_required,
        m.created_ts,
        sender.name AS sender_name,
        sender.program AS sender_program,
        sender.model AS sender_model,
        p.human_key AS project_path
      FROM messages m
      JOIN agents sender ON m.sender_id = sender.id
      JOIN projects p ON m.project_id = p.id
      WHERE m.thread_id = ?
    `;
    const params = [threadId];

    if (projectPath !== undefined) {
      query += ' AND p.human_key = ?';
      params.push(projectPath);
    }

    query += ' ORDER BY m.created_ts ASC';

    const stmt = db.prepare(query);
    /** @type {Message[]} */
    const messages = /** @type {Message[]} */ (stmt.all(...params));

    // For each message, get recipients
    for (const message of messages) {
      const recipients = db.prepare(`
        SELECT
          a.name AS agent_name,
          mr.kind,
          mr.read_ts,
          mr.ack_ts
        FROM message_recipients mr
        JOIN agents a ON mr.agent_id = a.id
        WHERE mr.message_id = ?
      `).all(message.id);

      message.recipients = /** @type {Array<{agent_name: string, kind: string, read_ts: string, ack_ts: string}>} */ (recipients);
    }

    db.close();
    return messages;
  } catch (error) {
    console.error('Error querying thread messages:', error);
    return [];
  }
}

/**
 * Get inbox messages for a specific thread and agent
 * @param {string} agentName - The agent name to get inbox for
 * @param {string | undefined} [threadId] - Optional thread ID to filter by
 * @param {Object} [options] - Query options
 * @param {boolean} [options.unreadOnly] - Only return unread messages
 * @param {string} [options.projectPath] - Filter by project path
 * @returns {Message[]} List of inbox messages
 */
export function getInboxForThread(agentName, threadId = undefined, options = {}) {
  const { unreadOnly = false, projectPath } = options;

  try {
    const db = new Database(DB_PATH, { readonly: true });

    let query = `
      SELECT
        m.id,
        m.thread_id,
        m.subject,
        m.body_md,
        m.importance,
        m.ack_required,
        m.created_ts,
        sender.name AS sender_name,
        sender.program AS sender_program,
        sender.model AS sender_model,
        p.human_key AS project_path,
        mr.read_ts,
        mr.ack_ts,
        mr.kind
      FROM messages m
      JOIN agents sender ON m.sender_id = sender.id
      JOIN projects p ON m.project_id = p.id
      JOIN message_recipients mr ON m.id = mr.message_id
      JOIN agents recipient ON mr.agent_id = recipient.id
      WHERE recipient.name = ?
    `;
    const params = [agentName];

    if (threadId !== undefined) {
      query += ' AND m.thread_id = ?';
      params.push(threadId);
    }

    if (unreadOnly) {
      query += ' AND mr.read_ts IS NULL';
    }

    if (projectPath !== undefined) {
      query += ' AND p.human_key = ?';
      params.push(projectPath);
    }

    query += ' ORDER BY m.created_ts DESC';

    const stmt = db.prepare(query);
    /** @type {Message[]} */
    const messages = /** @type {Message[]} */ (stmt.all(...params));

    db.close();
    return messages;
  } catch (error) {
    console.error('Error querying inbox for thread:', error);
    return [];
  }
}

/**
 * Get all agents in a project
 * @param {string | undefined} [projectPath] - Optional project path to filter by
 * @returns {Agent[]} List of agents
 */
export function getAgents(projectPath = undefined) {
  try {
    const db = new Database(DB_PATH, { readonly: true });

    let query = `
      SELECT
        a.id,
        a.name,
        a.program,
        a.model,
        a.task_description,
        a.inception_ts,
        a.last_active_ts,
        p.human_key AS project_path
      FROM agents a
      JOIN projects p ON a.project_id = p.id
    `;
    const params = [];

    if (projectPath !== undefined) {
      // Match project name against the last segment of the path
      // e.g., "squad" matches "/home/jw/code/squad"
      query += ' WHERE p.human_key LIKE ?';
      params.push(`%/${projectPath}`);
    }

    query += ' ORDER BY a.last_active_ts DESC';

    const stmt = db.prepare(query);
    /** @type {Agent[]} */
    const agents = /** @type {Agent[]} */ (stmt.all(...params));

    db.close();
    return agents;
  } catch (error) {
    console.error('Error querying agents:', error);
    return [];
  }
}

/**
 * Get all threads for a project or agent
 * @param {Object} [options] - Query options
 * @param {string} [options.projectPath] - Filter by project path
 * @param {string} [options.agentName] - Filter by agent participation
 * @returns {Thread[]} List of threads with message counts and participants
 */
export function getThreads(options = {}) {
  const { projectPath, agentName } = options;

  try {
    const db = new Database(DB_PATH, { readonly: true });

    let query = `
      SELECT
        m.thread_id,
        COUNT(DISTINCT m.id) AS message_count,
        MIN(m.created_ts) AS first_message_ts,
        MAX(m.created_ts) AS last_message_ts,
        GROUP_CONCAT(DISTINCT sender.name) AS participants
      FROM messages m
      JOIN agents sender ON m.sender_id = sender.id
      JOIN projects p ON m.project_id = p.id
    `;
    const params = [];
    const whereClauses = [];

    if (projectPath !== undefined) {
      whereClauses.push('p.human_key = ?');
      params.push(projectPath);
    }

    if (agentName !== undefined) {
      query += `
        JOIN message_recipients mr ON m.id = mr.message_id
        JOIN agents recipient ON mr.agent_id = recipient.id
      `;
      whereClauses.push('(sender.name = ? OR recipient.name = ?)');
      params.push(agentName, agentName);
    }

    if (whereClauses.length > 0) {
      query += ' WHERE ' + whereClauses.join(' AND ');
    }

    query += `
      GROUP BY m.thread_id
      ORDER BY last_message_ts DESC
    `;

    const stmt = db.prepare(query);
    /** @type {Thread[]} */
    const threads = /** @type {Thread[]} */ (stmt.all(...params));

    db.close();
    return threads;
  } catch (error) {
    console.error('Error querying threads:', error);
    return [];
  }
}

/**
 * Search messages by text
 * @param {string} searchQuery - Text to search for (uses FTS5)
 * @param {Object} [options] - Query options
 * @param {string} [options.threadId] - Filter by thread ID
 * @param {string} [options.projectPath] - Filter by project path
 * @returns {Message[]} List of matching messages
 */
export function searchMessages(searchQuery, options = {}) {
  const { threadId, projectPath } = options;

  try {
    const db = new Database(DB_PATH, { readonly: true });

    let query = `
      SELECT
        m.id,
        m.thread_id,
        m.subject,
        m.body_md,
        m.importance,
        m.created_ts,
        sender.name AS sender_name,
        p.human_key AS project_path
      FROM messages_fts fts
      JOIN messages m ON fts.rowid = m.id
      JOIN agents sender ON m.sender_id = sender.id
      JOIN projects p ON m.project_id = p.id
      WHERE messages_fts MATCH ?
    `;
    const params = [searchQuery];

    if (threadId !== undefined) {
      query += ' AND m.thread_id = ?';
      params.push(threadId);
    }

    if (projectPath !== undefined) {
      query += ' AND p.human_key = ?';
      params.push(projectPath);
    }

    query += ' ORDER BY m.created_ts DESC';

    const stmt = db.prepare(query);
    /** @type {Message[]} */
    const messages = /** @type {Message[]} */ (stmt.all(...params));

    db.close();
    return messages;
  } catch (error) {
    console.error('Error searching messages:', error);
    return [];
  }
}

export default {
  getThreadMessages,
  getInboxForThread,
  getAgents,
  getThreads,
  searchMessages
};
