/**
 * Agent Mail SQLite Query Layer
 *
 * Provides functions to query Agent Mail message database.
 * Queries ~/.agent-mail.db for multi-agent coordination messages.
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';

const DB_PATH = join(homedir(), '.agent-mail.db');

/**
 * Get all messages in a thread
 * @param {string} threadId - The thread ID to retrieve messages for
 * @param {Object} options - Query options
 * @param {string} [options.projectPath] - Filter by project path
 * @returns {Array<Object>} List of messages in the thread
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
    const messages = stmt.all(...params);

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

      message.recipients = recipients;
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
 * @param {string} [threadId] - Optional thread ID to filter by
 * @param {Object} options - Query options
 * @param {boolean} [options.unreadOnly] - Only return unread messages
 * @param {string} [options.projectPath] - Filter by project path
 * @returns {Array<Object>} List of inbox messages
 */
export function getInboxForThread(agentName, threadId = null, options = {}) {
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

    if (threadId !== null) {
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
    const messages = stmt.all(...params);

    db.close();
    return messages;
  } catch (error) {
    console.error('Error querying inbox for thread:', error);
    return [];
  }
}

/**
 * Get all agents in a project
 * @param {string} [projectPath] - Optional project path to filter by
 * @returns {Array<Object>} List of agents
 */
export function getAgents(projectPath = null) {
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

    if (projectPath !== null) {
      query += ' WHERE p.human_key = ?';
      params.push(projectPath);
    }

    query += ' ORDER BY a.last_active_ts DESC';

    const stmt = db.prepare(query);
    const agents = stmt.all(...params);

    db.close();
    return agents;
  } catch (error) {
    console.error('Error querying agents:', error);
    return [];
  }
}

/**
 * Get all threads for a project or agent
 * @param {Object} options - Query options
 * @param {string} [options.projectPath] - Filter by project path
 * @param {string} [options.agentName] - Filter by agent participation
 * @returns {Array<Object>} List of threads with message counts and participants
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
    const threads = stmt.all(...params);

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
 * @param {Object} options - Query options
 * @param {string} [options.threadId] - Filter by thread ID
 * @param {string} [options.projectPath] - Filter by project path
 * @returns {Array<Object>} List of matching messages
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
    const messages = stmt.all(...params);

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
