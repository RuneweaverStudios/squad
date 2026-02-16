import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findThreadByParentItemId, updateThreadCursor, deactivateThread } from './dedup.js';
import * as logger from './logger.js';

// Resolve jat root from this file's location (tools/ingest/lib/ → jat/)
const __dirname = dirname(fileURLToPath(import.meta.url));
const JAT_ROOT = join(__dirname, '..', '..', '..');
const TASK_IMAGES_PATH = join(JAT_ROOT, '.jat', 'task-images.json');

const IDE_BASE_URL = process.env.JAT_IDE_URL || 'http://127.0.0.1:3333';

// Messaging/chat source types where /jat:chat is the appropriate default command
const CHAT_SOURCE_TYPES = new Set([
  'telegram', 'slack', 'discord', 'matrix', 'mattermost',
  'line', 'signal', 'whatsapp', 'bluebubbles', 'googlechat'
]);

function isChatSource(source) {
  return CHAT_SOURCE_TYPES.has(source.type) || source.trackReplies === true;
}

/**
 * Create a task via jt create CLI.
 * Returns the created task ID or null on failure.
 */
export function createTask(source, item, downloadedAttachments = []) {
  const defaults = source.taskDefaults || {};
  // Auto-set type to 'chat' for conversational integrations
  const isChat = source.automation?.command === '/jat:chat' || isChatSource(source);
  const type = isChat ? 'chat' : (defaults.type || 'task');
  const priority = String(defaults.priority ?? 2);
  const labels = defaults.labels || [];

  let description = buildDescription(item, downloadedAttachments);

  const args = [
    'create',
    item.title,
    '--type', type,
    '--priority', priority,
    '--description', description
  ];

  if (labels.length > 0) {
    args.push('--labels', labels.join(','));
  }

  if (item.author) {
    args.push('--notes', `Author: ${item.author}`);
  }

  try {
    const output = execFileSync('jt', args, {
      encoding: 'utf-8',
      timeout: 15000,
      cwd: getProjectPath(source.project)
    }).trim();
    // jt create outputs "Created jat-xxxxx: Title" - extract the task ID
    const match = output.match(/^Created\s+(\S+):/);
    const taskId = match ? match[1] : output;

    // Replace TASK_ID placeholder in description with actual task ID
    if (item.origin && taskId) {
      const realDesc = description.replace('TASK_ID', taskId);
      if (realDesc !== description) {
        try {
          execFileSync('jt', ['update', taskId, '--description', realDesc], {
            encoding: 'utf-8', timeout: 15000, cwd: getProjectPath(source.project)
          });
        } catch { /* description update is secondary */ }
      }
    }

    logger.info(`created task ${taskId}: ${item.title.slice(0, 60)}`, source.id);
    return taskId;
  } catch (err) {
    logger.error(`jt create failed: ${err.message}`, source.id);
    return null;
  }
}

function buildDescription(item, attachments) {
  const parts = [];

  if (item.author) {
    parts.push(`From: ${item.author}`);
  }

  if (item.origin) {
    const o = item.origin;
    const channel = o.channelId ? ` channel ${o.channelId}` : '';
    parts.push(`Origin: ${o.adapterType}${channel}`);
    parts.push(`Reply: \`jat-signal reply '{"taskId":"TASK_ID","message":"...","replyType":"ack"}'\``);
  }

  if (item.description) {
    parts.push(item.description);
  }

  if (attachments.length > 0) {
    parts.push('');
    parts.push('Attachments:');
    for (const att of attachments) {
      if (att.localPath) {
        parts.push(`- ${att.localPath}`);
      } else if (att.error) {
        parts.push(`- ${att.error}`);
      }
    }
  }

  if (item.permalink) {
    parts.push('');
    parts.push(`[View in Slack](${item.permalink})`);
  }

  if (item.timestamp) {
    parts.push(`Source: ${item.timestamp}`);
  }

  return parts.join('\n');
}

/**
 * Append one or more replies to a task description in a single read-write cycle.
 * @param {string} taskId
 * @param {Array<{text: string, author: string, timestamp: string}>} replies
 * @param {string} project
 * @returns {boolean}
 */
export function appendToTask(taskId, replies, project) {
  if (!replies || replies.length === 0) return false;
  const cwd = getProjectPath(project);

  // Read current task description once
  let currentDesc = '';
  try {
    const showOutput = execFileSync('jt', ['show', taskId, '--json'], {
      encoding: 'utf-8',
      timeout: 15000,
      cwd
    });
    const parsed = JSON.parse(showOutput);
    const task = Array.isArray(parsed) ? parsed[0] : parsed;
    currentDesc = task?.description || '';
  } catch (err) {
    logger.error(`jt show failed for ${taskId}: ${err.message}`);
    return false;
  }

  // Format all reply blocks at once
  let newDesc = currentDesc;
  for (const reply of replies) {
    const ts = reply.timestamp || new Date().toISOString();
    const author = reply.author || 'unknown';
    newDesc += `\n---\n**Reply from ${author}** (${ts}):\n${reply.text}`;
    if (reply.downloaded?.length > 0) {
      for (const att of reply.downloaded) {
        if (att.localPath) {
          newDesc += `\n- ${att.localPath}`;
        }
      }
    }
  }

  // Single write with all replies
  try {
    execFileSync('jt', ['update', taskId, '--description', newDesc], {
      encoding: 'utf-8',
      timeout: 15000,
      cwd
    });
    logger.info(`appended ${replies.length} reply(s) to ${taskId}`, project);
    return true;
  } catch (err) {
    logger.error(`jt update failed for ${taskId}: ${err.message}`);
    return false;
  }
}

/**
 * Resume an existing agent session for a task, injecting the reply text.
 * Returns { resumed: true, sessionName } on success, { resumed: false, reason } on failure.
 *
 * @param {string} taskId - Task ID to resume
 * @param {string} replyText - Text from the user reply to inject
 * @param {string} project - Project name
 * @returns {Promise<{ resumed: boolean, sessionName?: string, reason?: string }>}
 */
export async function resumeSession(taskId, replyText, project) {
  const cwd = getProjectPath(project);

  // 1. Look up task assignee
  let assignee;
  try {
    const showOutput = execFileSync('jt', ['show', taskId, '--json'], {
      encoding: 'utf-8', timeout: 15000, cwd
    });
    const parsed = JSON.parse(showOutput);
    const task = Array.isArray(parsed) ? parsed[0] : parsed;
    assignee = task?.assignee;
  } catch (err) {
    return { resumed: false, reason: `jt show failed: ${err.message}` };
  }

  if (!assignee) {
    return { resumed: false, reason: 'no-assignee' };
  }

  const sessionName = `jat-${assignee}`;
  const injectionText = `The user replied on the originating channel (e.g. Telegram). You MUST send your response back using jat-signal reply (not just text output). Their message: ${replyText}`;

  // 2. Check if tmux session still exists (agent still running)
  let sessionActive = false;
  try {
    execFileSync('tmux', ['has-session', '-t', sessionName], { timeout: 5000 });
    sessionActive = true;
  } catch {
    // Session doesn't exist — will need to resume
  }

  // 2a. If session is active, inject text directly via IDE input API
  if (sessionActive) {
    try {
      const res = await fetch(`${IDE_BASE_URL}/api/sessions/${encodeURIComponent(sessionName)}/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'text', input: injectionText }),
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        logger.info(`Injected reply into active session ${sessionName} for ${taskId}`, project);
        return { resumed: true, sessionName };
      }
      logger.warn(`Input API returned ${res.status} for ${sessionName}`, project);
    } catch (err) {
      logger.warn(`Failed to inject reply into active session ${sessionName}: ${err.message}`, project);
    }
    // If input API fails, fall through to try tmux directly
    try {
      injectTextViaTmux(sessionName, injectionText);
      logger.info(`Injected reply via tmux into active session ${sessionName} for ${taskId}`, project);
      return { resumed: true, sessionName };
    } catch (err) {
      logger.warn(`Failed to inject reply via tmux into ${sessionName}: ${err.message}`, project);
      return { resumed: false, reason: 'session-active-injection-failed' };
    }
  }

  // 3. Check if session is paused (has signal file with resumable state)
  try {
    const res = await fetch(`${IDE_BASE_URL}/api/sessions/${encodeURIComponent(sessionName)}/pause`, {
      signal: AbortSignal.timeout(10000)
    });
    if (res.ok) {
      const data = await res.json();
      if (!data.paused) {
        return { resumed: false, reason: 'not-paused' };
      }
    }
  } catch (err) {
    return { resumed: false, reason: `pause-check-failed: ${err.message}` };
  }

  // 4. Call resume API
  try {
    const res = await fetch(`${IDE_BASE_URL}/api/sessions/${encodeURIComponent(sessionName)}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project }),
      signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { resumed: false, reason: `resume-api-${res.status}: ${body.message || body.error || ''}` };
    }
  } catch (err) {
    return { resumed: false, reason: `resume-api-failed: ${err.message}` };
  }

  // 5. Poll for session readiness, then inject reply text
  // Claude Code with -r can take 10-20s to start; poll every 2s for up to 30s
  const maxWait = 30000;
  const pollInterval = 2000;
  let ready = false;
  for (let elapsed = 0; elapsed < maxWait; elapsed += pollInterval) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    try {
      execFileSync('tmux', ['has-session', '-t', sessionName], { timeout: 5000 });
      ready = true;
      break;
    } catch {
      // Session not ready yet, keep polling
    }
  }

  if (!ready) {
    logger.warn(`Session ${sessionName} not ready after ${maxWait / 1000}s`, project);
    return { resumed: true, sessionName }; // Still counts as resumed, text just wasn't injected
  }

  // Wait a bit more for Claude to finish initializing within the tmux session
  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    injectTextViaTmux(sessionName, injectionText);
  } catch (err) {
    logger.warn(`Failed to inject reply into ${sessionName}: ${err.message}`, project);
    // Session resumed but injection failed — still counts as resumed
  }

  logger.info(`Resumed session ${sessionName} with reply for ${taskId}`, project);
  return { resumed: true, sessionName };
}

/**
 * Inject text into a tmux session using literal mode.
 * Uses -l flag for literal key interpretation and sends Enter separately.
 * This matches the IDE input API behavior (ide/src/routes/api/sessions/[name]/input/+server.js).
 *
 * @param {string} sessionName - tmux session name (e.g., 'jat-AgentName')
 * @param {string} text - Text to inject
 */
function injectTextViaTmux(sessionName, text) {
  // Send text with -l (literal mode) and -- (stop option parsing)
  // This prevents tmux from interpreting special characters as key names
  execFileSync('tmux', ['send-keys', '-t', sessionName, '-l', '--', text], {
    timeout: 10000
  });
  // Send Enter separately to submit the text
  execFileSync('tmux', ['send-keys', '-t', sessionName, 'Enter'], {
    timeout: 5000
  });
}

/**
 * Check if an item is a reply to a tracked thread and append it if so.
 * For sources with immediate automation, attempts to resume the original agent session first.
 * Returns { handled: true, taskId } if the reply was routed, { handled: false } otherwise.
 *
 * @param {Object} source - Source config
 * @param {Object} item - Ingested item (must have replyTo set)
 * @param {Array} downloaded - Downloaded attachments
 * @returns {Promise<{ handled: boolean, taskId?: string, resumed?: boolean }>}
 */
export async function handleThreadReply(source, item, downloaded = []) {
  if (!item.replyTo) return { handled: false };

  const thread = findThreadByParentItemId(source.id, item.replyTo);
  if (!thread) return { handled: false };

  const taskId = thread.task_id;
  const replyText = item.description || item.title;
  const cwd = getProjectPath(source.project);

  // Check if the task is closed — if so, reopen it before proceeding
  let taskClosed = false;
  try {
    const showOutput = execFileSync('jt', ['show', taskId, '--json'], {
      encoding: 'utf-8', timeout: 15000, cwd
    });
    const parsed = JSON.parse(showOutput);
    const task = Array.isArray(parsed) ? parsed[0] : parsed;
    if (task?.status === 'closed') {
      taskClosed = true;
      execFileSync('jt', ['update', taskId, '--status', 'open'], {
        encoding: 'utf-8', timeout: 15000, cwd
      });
      logger.info(`Reopened closed task ${taskId} for follow-up reply`, source.id);
    }
  } catch (err) {
    logger.warn(`Failed to check/reopen task ${taskId}: ${err.message}`, source.id);
  }

  // Always append reply to task description for history/audit trail
  const reply = {
    text: replyText,
    author: item.author || 'unknown',
    timestamp: item.timestamp || new Date().toISOString(),
    downloaded
  };

  const appendOk = appendToTask(taskId, [reply], source.project);
  if (appendOk) {
    updateThreadCursor(source.id, thread.parent_item_id, item.timestamp || new Date().toISOString());
  }

  if (taskId && downloaded.length > 0) {
    registerTaskAttachments(taskId, downloaded, source.project);
  }

  // If source has immediate automation, try to resume/inject into the session
  if (source.automation?.action === 'immediate') {
    // If task was closed (no session to resume), spawn a fresh agent
    if (taskClosed) {
      logger.info(`Task ${taskId} was closed, spawning new agent for follow-up reply`, source.id);
      spawnAgent(taskId, source.project, source.id);
      return { handled: true, taskId, resumed: true };
    }

    const result = await resumeSession(taskId, replyText, source.project);
    if (result.resumed) {
      logger.info(`Resumed session for reply → task ${taskId} (${result.sessionName})`, source.id);
      return { handled: true, taskId, resumed: true };
    }
    logger.info(`Resume/inject failed (${result.reason}), reply appended to ${taskId}`, source.id);
  }

  logger.info(`Routed reply to thread → task ${taskId}`, source.id);
  return { handled: true, taskId };
}

/**
 * Handle an emoji reaction on a tracked message (e.g. thumbs-up to close a chat task).
 * Looks up the reacted message → task mapping, closes the task, and deactivates the thread.
 *
 * @param {Object} source - Source config
 * @param {Object} item - Reaction item (has item.reaction and item.replyTo)
 * @returns {Promise<{ handled: boolean, taskId?: string }>}
 */
export async function handleReaction(source, item) {
  if (!item.replyTo || !item.reaction) return { handled: false };

  const thread = findThreadByParentItemId(source.id, item.replyTo);
  if (!thread) return { handled: false };

  const taskId = thread.task_id;
  const cwd = getProjectPath(source.project);

  // Close the task
  try {
    execFileSync('jt', ['close', taskId, '--reason', `Closed via ${item.reaction} reaction by ${item.author || 'user'}`], {
      encoding: 'utf-8', timeout: 15000, cwd
    });
    logger.info(`Closed task ${taskId} via ${item.reaction} reaction`, source.id);
  } catch (err) {
    // Task may already be closed
    logger.warn(`Failed to close task ${taskId} via reaction: ${err.message}`, source.id);
  }

  // Kill the agent session if it's still running (paused sessions have a tmux session)
  let assignee;
  try {
    const showOutput = execFileSync('jt', ['show', taskId, '--json'], {
      encoding: 'utf-8', timeout: 15000, cwd
    });
    const parsed = JSON.parse(showOutput);
    const task = Array.isArray(parsed) ? parsed[0] : parsed;
    assignee = task?.assignee;
  } catch { /* ignore */ }

  if (assignee) {
    const sessionName = `jat-${assignee}`;
    try {
      execFileSync('tmux', ['kill-session', '-t', sessionName], { timeout: 5000 });
      logger.info(`Killed session ${sessionName} after reaction close`, source.id);
    } catch {
      // Session may not exist (already paused/killed)
    }
  }

  // Deactivate thread so future replies don't route to this closed task
  deactivateThread(source.id, thread.parent_item_id);

  // Send confirmation back to the channel
  try {
    const router = join(dirname(fileURLToPath(import.meta.url)), '..', 'jat-reply-router');
    execFileSync(router, ['--task-id', taskId, '--message', `Task closed. ${item.reaction}`, '--type', 'completion'], {
      encoding: 'utf-8', timeout: 15000
    });
  } catch {
    // Confirmation is best-effort
  }

  return { handled: true, taskId };
}

/**
 * Register downloaded files as task attachments in .jat/task-images.json
 * so they appear in the IDE's ATTACHMENTS section.
 */
export function registerTaskAttachments(taskId, downloadedFiles, project) {
  if (!downloadedFiles?.length) return;

  // Write to jat's .jat/task-images.json (where the IDE reads from)
  const storePath = TASK_IMAGES_PATH;

  // Load existing
  let images = {};
  try {
    if (existsSync(storePath)) {
      images = JSON.parse(readFileSync(storePath, 'utf-8'));
    }
  } catch { /* start fresh */ }

  const existing = Array.isArray(images[taskId]) ? images[taskId] : [];

  for (const file of downloadedFiles) {
    if (!file.localPath) continue;
    // Skip if already registered
    if (existing.some(img => img.path === file.localPath)) continue;

    existing.push({
      path: file.localPath,
      uploadedAt: new Date().toISOString(),
      id: `img-ingest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    });
  }

  images[taskId] = existing;

  try {
    mkdirSync(dirname(storePath), { recursive: true });
    writeFileSync(storePath, JSON.stringify(images, null, 2), 'utf-8');
  } catch (err) {
    logger.error(`Failed to register attachments for ${taskId}: ${err.message}`);
    return;
  }

  // Sync to task notes so agents see them via jt show
  const imageList = existing.map((img, i) => `  ${i + 1}. ${img.path}`).join('\n');
  const notes = `Author: ${project}\n📷 Attached files:\n${imageList}\n(Use Read tool to view)`;
  try {
    execFileSync('jt', ['update', taskId, '--notes', notes], {
      encoding: 'utf-8',
      timeout: 15000,
      cwd: getProjectPath(project)
    });
  } catch { /* notes sync is secondary */ }

  logger.info(`registered ${downloadedFiles.length} attachment(s) for ${taskId}`, project);
}

/**
 * Apply automation config from source after task creation.
 * - 'immediate': call IDE spawn API to start an agent now
 * - 'schedule': set next_run_at to next occurrence of scheduled time
 * - 'delay': set next_run_at to now + delay
 * Also sets the command column if automation specifies one.
 */
export function applyAutomation(taskId, source) {
  const auto = source.automation;
  if (!auto || auto.action === 'none') return;

  const cwd = getProjectPath(source.project);
  const command = auto.command || (isChatSource(source) ? '/jat:chat' : '/jat:start');

  if (auto.action === 'immediate') {
    // Set command on task, then fire-and-forget spawn API call
    try {
      execFileSync('jt', ['update', taskId, '--command', command], {
        encoding: 'utf-8', timeout: 15000, cwd
      });
    } catch (err) {
      logger.warn(`Failed to set command on ${taskId}: ${err.message}`, source.id);
    }

    spawnAgent(taskId, source.project, source.id);
    return;
  }

  // For schedule/delay, compute next_run_at and set on the task
  let nextRunAt;

  if (auto.action === 'schedule' && auto.schedule) {
    nextRunAt = computeNextScheduleTime(auto.schedule);
  } else if (auto.action === 'delay') {
    const delayMs = computeDelayMs(auto.delay || 0, auto.delayUnit || 'minutes');
    nextRunAt = new Date(Date.now() + delayMs).toISOString();
  }

  if (!nextRunAt) return;

  try {
    const args = ['update', taskId, '--command', command, '--next-run-at', nextRunAt];
    execFileSync('jt', args, { encoding: 'utf-8', timeout: 15000, cwd });
    logger.info(`scheduled ${taskId} for ${nextRunAt} (${auto.action})`, source.id);
  } catch (err) {
    logger.error(`Failed to set schedule on ${taskId}: ${err.message}`, source.id);
  }
}

/**
 * Fire-and-forget call to IDE spawn API to start an agent for a task.
 * Non-blocking: uses native fetch, logs result but doesn't block the poll loop.
 */
function spawnAgent(taskId, project, sourceId) {
  fetch(`${IDE_BASE_URL}/api/work/spawn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, project }),
    signal: AbortSignal.timeout(30000)
  }).then(res => {
    if (res.ok) {
      logger.info(`spawned agent for ${taskId}`, sourceId);
    } else {
      logger.warn(`Spawn API returned ${res.status} for ${taskId}`, sourceId);
    }
  }).catch(err => {
    logger.warn(`Spawn API call failed for ${taskId} (IDE may be offline): ${err.message}`, sourceId);
  });
}

/**
 * Compute the next occurrence of a HH:MM time string.
 * If the time has already passed today, returns tomorrow's time.
 */
function computeNextScheduleTime(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);

  // If time already passed today, schedule for tomorrow
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  return target.toISOString();
}

/**
 * Convert delay + unit to milliseconds.
 */
function computeDelayMs(delay, unit) {
  const multiplier = unit === 'hours' ? 3600000 : 60000;
  return delay * multiplier;
}

export function getProjectPath(projectName) {
  if (!projectName) return process.cwd();

  // Check common project locations
  const home = process.env.HOME;
  const candidates = [
    `${home}/code/${projectName}`,
    `${home}/projects/${projectName}`,
    `${home}/${projectName}`
  ];

  for (const p of candidates) {
    try {
      execFileSync('test', ['-d', `${p}/.jat`], { timeout: 1000 });
      return p;
    } catch { /* skip */ }
  }

  // Fallback to ~/code/project
  return `${home}/code/${projectName}`;
}
