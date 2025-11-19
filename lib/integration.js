/**
 * Beads + Agent Mail Integration Layer
 *
 * Provides high-level functions that cross-reference Beads tasks with Agent Mail coordination.
 * Enables seamless workflow between task planning (Beads) and agent coordination (Agent Mail).
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { getTaskById, getTasks } from './beads.js';
import { getThreadMessages, getAgents } from './agent-mail.js';

const AGENT_MAIL_DB = join(homedir(), '.agent-mail.db');

/**
 * Get all Agent Mail activity for a specific Beads task
 * @param {string} taskId - Beads task ID (e.g., "jomarchy-agent-tools-abc")
 * @returns {Object} Task with Agent Mail activity
 */
export function getTaskWithActivity(taskId) {
  // Get task details from Beads
  const task = getTaskById(taskId);

  if (!task) {
    return null;
  }

  // Get Agent Mail messages for this task (using task ID as thread ID)
  const messages = getThreadMessages(taskId);

  // Get file reservations for this task
  const reservations = getFileReservationsByTask(taskId);

  // Get agents who have worked on this task
  const agents = getAgentsForTask(taskId);

  return {
    ...task,
    agent_mail: {
      message_count: messages.length,
      messages: messages,
      reservations: reservations,
      agents: agents,
      thread_id: taskId
    }
  };
}

/**
 * Get file reservations linked to a specific task ID
 * @param {string} taskId - Beads task ID
 * @returns {Array<Object>} File reservations with task ID in reason
 */
export function getFileReservationsByTask(taskId) {
  try {
    const db = new Database(AGENT_MAIL_DB, { readonly: true });

    const reservations = db.prepare(`
      SELECT
        r.id,
        r.path_pattern,
        r.exclusive,
        r.reason,
        r.created_ts,
        r.expires_ts,
        a.name AS agent_name,
        a.program,
        a.model
      FROM file_reservations r
      JOIN agents a ON r.agent_id = a.id
      WHERE r.reason LIKE ?
        AND datetime(r.expires_ts) > datetime('now')
        AND r.released_ts IS NULL
      ORDER BY r.created_ts DESC
    `).all(`%${taskId}%`);

    db.close();
    return reservations;
  } catch (error) {
    console.error('Error querying file reservations:', error);
    return [];
  }
}

/**
 * Get agents who have worked on a task (via messages or reservations)
 * @param {string} taskId - Beads task ID
 * @returns {Array<Object>} Unique agents with activity counts
 */
export function getAgentsForTask(taskId) {
  try {
    const db = new Database(AGENT_MAIL_DB, { readonly: true });

    // Get agents from messages
    const messageAgents = db.prepare(`
      SELECT DISTINCT
        a.name,
        a.program,
        a.model,
        COUNT(m.id) AS message_count
      FROM messages m
      JOIN agents a ON m.sender_id = a.id
      WHERE m.thread_id = ?
      GROUP BY a.name, a.program, a.model
    `).all(taskId);

    // Get agents from file reservations
    const reservationAgents = db.prepare(`
      SELECT DISTINCT
        a.name,
        a.program,
        a.model,
        COUNT(r.id) AS reservation_count
      FROM file_reservations r
      JOIN agents a ON r.agent_id = a.id
      WHERE r.reason LIKE ?
      GROUP BY a.name, a.program, a.model
    `).all(`%${taskId}%`);

    db.close();

    // Merge results
    const agentMap = new Map();

    for (const agent of messageAgents) {
      agentMap.set(agent.name, {
        ...agent,
        reservation_count: 0
      });
    }

    for (const agent of reservationAgents) {
      if (agentMap.has(agent.name)) {
        agentMap.get(agent.name).reservation_count = agent.reservation_count;
      } else {
        agentMap.set(agent.name, {
          ...agent,
          message_count: 0
        });
      }
    }

    return Array.from(agentMap.values());
  } catch (error) {
    console.error('Error querying agents for task:', error);
    return [];
  }
}

/**
 * Get all active work (tasks with active reservations)
 * @param {Object} options - Query options
 * @param {string} [options.agentName] - Filter by specific agent
 * @returns {Array<Object>} Tasks with active reservations
 */
export function getActiveWork(options = {}) {
  const { agentName } = options;

  try {
    const db = new Database(AGENT_MAIL_DB, { readonly: true });

    // Get active reservations
    let query = `
      SELECT
        r.reason,
        r.path_pattern,
        r.created_ts,
        r.expires_ts,
        a.name AS agent_name
      FROM file_reservations r
      JOIN agents a ON r.agent_id = a.id
      WHERE datetime(r.expires_ts) > datetime('now')
        AND r.released_ts IS NULL
    `;
    const params = [];

    if (agentName !== undefined) {
      query += ' AND a.name = ?';
      params.push(agentName);
    }

    query += ' ORDER BY r.created_ts DESC';

    const reservations = db.prepare(query).all(...params);
    db.close();

    // Extract task IDs from reasons (format: "task-id: description")
    const taskIds = new Set();
    for (const res of reservations) {
      const match = res.reason.match(/^([a-zA-Z0-9-]+):/);
      if (match) {
        taskIds.add(match[1]);
      }
    }

    // Get task details for each task ID
    const tasks = [];
    for (const taskId of taskIds) {
      const task = getTaskWithActivity(taskId);
      if (task) {
        tasks.push(task);
      }
    }

    return tasks;
  } catch (error) {
    console.error('Error querying active work:', error);
    return [];
  }
}

/**
 * Get task handoff history (who worked on it and when)
 * @param {string} taskId - Beads task ID
 * @returns {Array<Object>} Chronological history of agent activity
 */
export function getTaskHandoffHistory(taskId) {
  try {
    const db = new Database(AGENT_MAIL_DB, { readonly: true });

    // Get all activity (messages + reservations) in chronological order
    const activity = db.prepare(`
      SELECT
        'message' AS type,
        m.id,
        m.created_ts AS timestamp,
        m.subject,
        m.body_md AS content,
        a.name AS agent_name
      FROM messages m
      JOIN agents a ON m.sender_id = a.id
      WHERE m.thread_id = ?

      UNION ALL

      SELECT
        'reservation' AS type,
        r.id,
        r.created_ts AS timestamp,
        'Reserved: ' || r.path_pattern AS subject,
        r.reason AS content,
        a.name AS agent_name
      FROM file_reservations r
      JOIN agents a ON r.agent_id = a.id
      WHERE r.reason LIKE ?
        AND r.released_ts IS NULL

      ORDER BY timestamp ASC
    `).all(taskId, `%${taskId}%`);

    db.close();
    return activity;
  } catch (error) {
    console.error('Error querying task handoff history:', error);
    return [];
  }
}

/**
 * Get summary statistics for Beads + Agent Mail integration
 * @returns {Object} Summary statistics
 */
export function getIntegrationStats() {
  // Get all tasks
  const tasks = getTasks();

  // Get all agents
  const agents = getAgents();

  // Get active reservations
  const activeWork = getActiveWork();

  // Calculate stats
  const tasksWithActivity = tasks.filter(task => {
    const messages = getThreadMessages(task.id);
    return messages.length > 0;
  });

  return {
    total_tasks: tasks.length,
    tasks_with_agent_activity: tasksWithActivity.length,
    total_agents: agents.length,
    active_work_items: activeWork.length,
    integration_adoption_rate: tasks.length > 0
      ? (tasksWithActivity.length / tasks.length * 100).toFixed(1) + '%'
      : '0%'
  };
}

/**
 * Find related tasks by Agent Mail thread
 * Useful when agents are discussing multiple related tasks
 * @param {string} threadId - Agent Mail thread ID
 * @returns {Array<Object>} Beads tasks mentioned in the thread
 */
export function getTasksByThread(threadId) {
  const messages = getThreadMessages(threadId);
  const taskIds = new Set();

  // Extract task IDs from message subjects and bodies
  const taskIdPattern = /\b([a-zA-Z0-9-]+-[a-z0-9]{3})\b/g;

  for (const msg of messages) {
    // Check subject
    const subjectMatches = msg.subject?.matchAll(taskIdPattern) || [];
    for (const match of subjectMatches) {
      taskIds.add(match[1]);
    }

    // Check body
    const bodyMatches = msg.body_md?.matchAll(taskIdPattern) || [];
    for (const match of bodyMatches) {
      taskIds.add(match[1]);
    }
  }

  // Get task details for each task ID
  const tasks = [];
  for (const taskId of taskIds) {
    const task = getTaskById(taskId);
    if (task) {
      tasks.push(task);
    }
  }

  return tasks;
}
