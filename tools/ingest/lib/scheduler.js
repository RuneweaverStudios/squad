import { getEnabledSources, getConfig, getSecret } from './config.js';
import { isDuplicate, recordItem, getAdapterState, setAdapterState, logPoll, registerThread, getActiveThreads, updateThreadCursor } from './dedup.js';
import { downloadAttachments } from './downloader.js';
import { createTask, appendToTask, registerTaskAttachments } from './taskCreator.js';
import * as logger from './logger.js';

import RssAdapter from '../adapters/rss/index.js';
import TelegramAdapter from '../adapters/telegram/index.js';
import SlackAdapter from '../adapters/slack/index.js';
import GmailAdapter from '../adapters/gmail/index.js';

const adapters = {
  rss: new RssAdapter(),
  telegram: new TelegramAdapter(),
  slack: new SlackAdapter(),
  gmail: new GmailAdapter()
};

const STAGGER_MS = 2000;
const CONFIG_CHECK_INTERVAL = 30000;
const MAX_BACKOFF_MS = 3600000; // 1 hour

// Track per-source backoff and timers
const sourceState = new Map();

let running = false;
let configCheckTimer = null;
let dryRun = false;

export function start(opts = {}) {
  running = true;
  dryRun = opts.dryRun || false;

  const sources = opts.sourceId
    ? getEnabledSources().filter(s => s.id === opts.sourceId)
    : getEnabledSources();

  if (sources.length === 0) {
    logger.warn('No enabled sources found');
    return;
  }

  logger.ready(sources.length);

  // Stagger source startup
  sources.forEach((source, i) => {
    const delay = i * STAGGER_MS;
    setTimeout(() => {
      if (running) schedulePoll(source, true);
    }, delay);
  });

  // Periodically check for config changes
  configCheckTimer = setInterval(() => {
    if (!running) return;
    try {
      const freshSources = getEnabledSources();
      reconcileSources(freshSources);
    } catch (err) {
      logger.warn(`Config check failed: ${err.message}`);
    }
  }, CONFIG_CHECK_INTERVAL);
}

export function stop() {
  running = false;
  logger.shutting();

  if (configCheckTimer) {
    clearInterval(configCheckTimer);
    configCheckTimer = null;
  }

  for (const [id, state] of sourceState) {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }
  sourceState.clear();
}

function schedulePoll(source, immediate = false) {
  if (!running) return;

  const state = sourceState.get(source.id) || {
    timer: null,
    backoffMs: 0,
    consecutiveErrors: 0
  };

  const intervalMs = (source.pollInterval || 60) * 1000;
  const delay = immediate ? 0 : Math.max(intervalMs, state.backoffMs);

  state.timer = setTimeout(async () => {
    if (!running) return;
    await pollSource(source);
    schedulePoll(source);
  }, delay);

  sourceState.set(source.id, state);
}

async function pollSource(source) {
  const adapter = adapters[source.type];
  if (!adapter) {
    logger.error(`No adapter for type: ${source.type}`, source.id);
    return;
  }

  const startTime = Date.now();
  let itemsFound = 0;
  let itemsNew = 0;
  let error = null;

  try {
    const adapterState = getAdapterState(source.id);
    const result = await adapter.poll(source, adapterState, getSecret);

    itemsFound = result.items.length;

    for (const item of result.items) {
      if (isDuplicate(source.id, item.id)) continue;

      itemsNew++;

      if (dryRun) {
        logger.info(`[dry-run] would create: ${item.title.slice(0, 80)}`, source.id);
        continue;
      }

      // Download attachments (skip if already saved locally, e.g. Gmail MIME attachments)
      let downloaded = [];
      if (item.attachments?.length > 0) {
        const allLocal = item.attachments.every(a => a.localPath);
        if (allLocal) {
          downloaded = item.attachments;
        } else {
          const authHeaders = getAuthHeaders(source);
          downloaded = await downloadAttachments(source.id, item.attachments, authHeaders);
        }
      }

      // Create task
      const taskId = createTask(source, item, downloaded);

      // Record to dedup db
      recordItem(source.id, item.id, item.hash, taskId, item.title);

      // Register downloaded files as task attachments
      if (taskId && downloaded.length > 0) {
        registerTaskAttachments(taskId, downloaded, source.project);
      }

      // Register thread for Slack messages that have a task
      if (taskId && source.type === 'slack' && source.trackReplies !== false) {
        const tsMatch = item.id.match(/^slack-(.+)$/);
        if (tsMatch) {
          registerThread(source.id, item.id, tsMatch[1], taskId);
        }
      }
    }

    // Process thread replies (Slack only, wrapped in try/catch)
    try {
      if (source.type === 'slack' && source.trackReplies !== false) {
        const threads = getActiveThreads(source.id, source.maxTrackedThreads || 50);
        if (threads.length > 0) {
          const threadResults = await adapter.pollReplies(source, threads, getSecret);
          for (const { thread, replies } of threadResults) {
            // Download attachments for replies that have them
            const authHeaders = getAuthHeaders(source);
            for (const reply of replies) {
              if (reply.attachments?.length > 0) {
                reply.downloaded = await downloadAttachments(source.id, reply.attachments, authHeaders);
              }
            }
            // Register reply attachments with the task
            for (const reply of replies) {
              if (reply.downloaded?.length > 0) {
                registerTaskAttachments(thread.task_id, reply.downloaded, source.project);
              }
            }
            // Batch all replies into a single read-write cycle
            const ok = appendToTask(thread.task_id, replies, source.project);
            if (ok) {
              // Update cursor to the latest reply ts
              const lastReply = replies[replies.length - 1];
              updateThreadCursor(source.id, thread.parent_item_id, lastReply.ts);
            }
          }
        }
      }
    } catch (replyErr) {
      logger.warn(`Thread reply processing failed: ${replyErr.message}`, source.id);
    }

    // Persist adapter state
    setAdapterState(source.id, result.state);

    // Reset backoff on success
    const state = sourceState.get(source.id);
    if (state) {
      state.backoffMs = 0;
      state.consecutiveErrors = 0;
    }

    if (itemsFound > 0 || itemsNew > 0) {
      logger.polled(source.id, itemsNew, itemsFound - itemsNew);
    }
  } catch (err) {
    error = err.message;
    logger.error(err.message, source.id);

    // Exponential backoff
    const state = sourceState.get(source.id);
    if (state) {
      state.consecutiveErrors++;
      state.backoffMs = Math.min(
        MAX_BACKOFF_MS,
        Math.pow(2, state.consecutiveErrors) * 1000
      );
      logger.warn(`Backoff: ${Math.round(state.backoffMs / 1000)}s`, source.id);
    }
  }

  const durationMs = Date.now() - startTime;
  logPoll(source.id, itemsFound, itemsNew, error, durationMs);
}

function getAuthHeaders(source) {
  if (source.type === 'slack' && source.secretName) {
    try {
      const token = getSecret(source.secretName);
      return { 'Authorization': `Bearer ${token}` };
    } catch { /* fallthrough */ }
  }
  return {};
}

function reconcileSources(freshSources) {
  const freshIds = new Set(freshSources.map(s => s.id));

  // Stop removed/disabled sources
  for (const [id, state] of sourceState) {
    if (!freshIds.has(id)) {
      logger.info(`Source removed/disabled, stopping`, id);
      if (state.timer) clearTimeout(state.timer);
      sourceState.delete(id);
    }
  }

  // Start new sources
  for (const source of freshSources) {
    if (!sourceState.has(source.id)) {
      logger.info(`New source detected, starting`, source.id);
      schedulePoll(source);
    }
  }
}
