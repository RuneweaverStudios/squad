/**
 * SQUAD Tasks + Agent Mail Integration Layer
 *
 * Provides high-level functions that cross-reference SQUAD tasks with Agent Mail coordination.
 * Enables seamless workflow between task planning (SQUAD Tasks) and agent coordination (Agent Mail).
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { getTaskById, getTasks } from './tasks.js';
import { getThreadMessages, getAgents } from './agent-mail.js';

const AGENT_MAIL_DB = join(homedir(), '.agent-mail.db');

/**
 * Get all Agent Mail activity for a specific SQUAD task
 * @param {string} taskId - SQUAD task ID (e.g., "squad-abc")
 * @returns {Object} Task with Agent Mail activity
 */
export function getTaskWithActivity(taskId) {
  // Get task details from SQUAD Tasks
  const task = getTaskById(taskId);

  if (!task) {
    return null;
  }

  // Get Agent Mail messages for this task (using task ID as thread ID)
  const messages = getThreadMessages(taskId);

  // Get agents who have worked on this task
  const agents = getAgentsForTask(taskId);

  return {
    ...task,
    agent_mail: {
      message_count: messages.length,
      messages: messages,
      agents: agents,
      thread_id: taskId
    }
  };
}

/**
 * Get agents who have worked on a task (via messages)
 * @param {string} taskId - SQUAD task ID
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

    db.close();

    return messageAgents;
  } catch (error) {
    console.error('Error querying agents for task:', error);
    return [];
  }
}

/**
 * Get all active work.
 * Reservations are now tracked on the tasks table (reserved_files column),
 * so this function returns an empty array. Kept for API compatibility.
 * @param {Object} options - Query options
 * @param {string} [options.agentName] - Filter by specific agent
 * @returns {Array<Object>} Always returns empty array
 */
export function getActiveWork(options = {}) {
  // Reservations are now tracked on the tasks table via reserved_files column.
  return [];
}

/**
 * Get task handoff history (who worked on it and when)
 * @param {string} taskId - SQUAD task ID
 * @returns {Array<Object>} Chronological history of agent activity
 */
export function getTaskHandoffHistory(taskId) {
  try {
    const db = new Database(AGENT_MAIL_DB, { readonly: true });

    // Get all activity (messages) in chronological order
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
      ORDER BY timestamp ASC
    `).all(taskId);

    db.close();
    return activity;
  } catch (error) {
    console.error('Error querying task handoff history:', error);
    return [];
  }
}

/**
 * Get summary statistics for SQUAD Tasks + Agent Mail integration
 * @returns {Object} Summary statistics
 */
export function getIntegrationStats() {
  // Get all tasks
  const tasks = getTasks();

  // Get all agents
  const agents = getAgents();

  // Calculate stats
  const tasksWithActivity = tasks.filter(task => {
    const messages = getThreadMessages(task.id);
    return messages.length > 0;
  });

  return {
    total_tasks: tasks.length,
    tasks_with_agent_activity: tasksWithActivity.length,
    total_agents: agents.length,
    integration_adoption_rate: tasks.length > 0
      ? (tasksWithActivity.length / tasks.length * 100).toFixed(1) + '%'
      : '0%'
  };
}

/**
 * Find related tasks by Agent Mail thread
 * Useful when agents are discussing multiple related tasks
 * @param {string} threadId - Agent Mail thread ID
 * @returns {Array<Object>} SQUAD tasks mentioned in the thread
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
