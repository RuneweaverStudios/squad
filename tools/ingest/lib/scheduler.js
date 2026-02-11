import { getEnabledSources, getConfig, getSecret } from './config.js';
import { isDuplicate, recordItem, getAdapterState, setAdapterState, logPoll, registerThread, getActiveThreads, updateThreadCursor } from './dedup.js';
import { downloadAttachments } from './downloader.js';
import { createTask, appendToTask, registerTaskAttachments, applyAutomation, handleThreadReply } from './taskCreator.js';
import { discoverPlugins } from './pluginLoader.js';
import { applyFilter, resolveFilter } from './filterEngine.js';
import { ConnectionManager } from './connectionManager.js';
import * as logger from './logger.js';

const STAGGER_MS = 2000;
const CONFIG_CHECK_INTERVAL = 30000;
const MAX_BACKOFF_MS = 3600000; // 1 hour
const DEFAULT_DEBOUNCE_MS = 30000; // 30 seconds
const MAX_BUFFER_SIZE = 10;

// Track per-source backoff and timers (poll mode only)
const sourceState = new Map();

/** @type {Map<string, import('./pluginLoader.js').LoadedPlugin>} */
let plugins = new Map();

/** @type {ConnectionManager|null} */
let connectionManager = null;

let running = false;
let configCheckTimer = null;
let dryRun = false;

/** @type {MessageBuffer|null} */
let messageBuffer = null;

export async function start(opts = {}) {
  running = true;
  dryRun = opts.dryRun || false;

  // Initialize message buffer for debouncing per-sender messages
  messageBuffer = new MessageBuffer({ onFlush: handleBufferFlush });

  // Discover plugins dynamically instead of hardcoded imports
  plugins = await discoverPlugins();
  if (plugins.size === 0) {
    logger.warn('No plugins discovered');
  } else {
    logger.info(`Discovered ${plugins.size} plugin(s): ${[...plugins.keys()].join(', ')}`);
  }

  // Initialize connection manager for realtime sources
  connectionManager = new ConnectionManager({ plugins, getSecret, dryRun, messageBuffer });
  connectionManager.startHealthMonitor();

  const sources = opts.sourceId
    ? getEnabledSources().filter(s => s.id === opts.sourceId)
    : getEnabledSources();

  if (sources.length === 0) {
    logger.warn('No enabled sources found');
    return;
  }

  logger.ready(sources.length);

  // Stagger source startup, routing by mode
  sources.forEach((source, i) => {
    const delay = i * STAGGER_MS;
    setTimeout(() => {
      if (!running) return;
      startSource(source);
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

export async function stop() {
  running = false;
  logger.shutting();

  // Flush pending message buffers before stopping
  if (messageBuffer) {
    const pending = messageBuffer.pendingCount;
    if (pending > 0) {
      logger.info(`Flushing ${pending} buffered message(s)`);
    }
    messageBuffer.flushAll();
    messageBuffer = null;
  }

  if (configCheckTimer) {
    clearInterval(configCheckTimer);
    configCheckTimer = null;
  }

  // Stop all poll timers
  for (const [id, state] of sourceState) {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }
  sourceState.clear();

  // Disconnect all realtime connections
  if (connectionManager) {
    await connectionManager.stopAll();
    connectionManager = null;
  }
}

/**
 * Start a source in the appropriate mode (poll or realtime).
 * @param {Object} source - Source config
 */
function startSource(source) {
  const plugin = plugins.get(source.type);
  if (!plugin) {
    logger.error(`No plugin for type: ${source.type}`, source.id);
    return;
  }

  const mode = ConnectionManager.resolveMode(source, plugin);

  if (mode === 'realtime') {
    logger.info(`Starting in realtime mode`, source.id);
    connectionManager.startConnection(source).catch(err => {
      logger.error(`Failed to start realtime connection: ${err.message}`, source.id);
    });
  } else {
    schedulePoll(source, true);
  }
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
  const plugin = plugins.get(source.type);
  if (!plugin) {
    logger.error(`No plugin for type: ${source.type}`, source.id);
    return;
  }

  const adapter = new plugin.AdapterClass();
  const startTime = Date.now();
  let itemsFound = 0;
  let itemsNew = 0;
  let itemsFiltered = 0;
  let error = null;

  try {
    const adapterState = getAdapterState(source.id);
    const result = await adapter.poll(source, adapterState, getSecret);

    itemsFound = result.items.length;

    // Resolve filter: source config override > plugin default > pass all
    const filter = resolveFilter(source.filter, plugin.metadata.defaultFilter);

    for (const item of result.items) {
      // Apply filter before dedup check
      if (!applyFilter(item, filter)) {
        itemsFiltered++;
        continue;
      }

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

      // Check if debouncing is enabled for this source
      const debounceMs = getSourceDebounceMs(source);
      if (debounceMs > 0 && messageBuffer) {
        // Buffer for batched task creation
        const key = getBufferKey(source.id, item);
        messageBuffer.add(key, { item, downloaded, source }, debounceMs);
      } else {
        // Check if this is a reply to a tracked thread
        const threadResult = await handleThreadReply(source, item, downloaded);
        if (threadResult.handled) {
          recordItem(source.id, item.id, item.hash, threadResult.taskId, item.title, item.origin);
          continue;
        }

        // Immediate task creation (default behavior)
        const taskId = createTask(source, item, downloaded);

        // Record to dedup db (with origin for two-way reply routing)
        recordItem(source.id, item.id, item.hash, taskId, item.title, item.origin);

        // Register downloaded files as task attachments
        if (taskId && downloaded.length > 0) {
          registerTaskAttachments(taskId, downloaded, source.project);
        }

        // Apply automation (spawn agent, schedule, or delay)
        if (taskId && source.automation) {
          applyAutomation(taskId, source);
        }

        // Register thread for reply tracking
        if (taskId && source.trackReplies !== false) {
          registerThread(source.id, item.id, item.origin?.threadId || item.id, taskId);
        }
      }
    }

    // Process thread replies for any adapter that implements pollReplies
    try {
      if (source.trackReplies !== false) {
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

/**
 * Get auth headers for attachment downloads.
 * Generic: looks up secretName from source config and returns Bearer token.
 * Adapters handle their own auth for API calls; this is only for the downloader.
 */
function getAuthHeaders(source) {
  if (source.secretName) {
    try {
      const token = getSecret(source.secretName);
      return { 'Authorization': `Bearer ${token}` };
    } catch { /* fallthrough */ }
  }
  return {};
}

function reconcileSources(freshSources) {
  const freshIds = new Set(freshSources.map(s => s.id));

  // Stop removed/disabled poll sources
  for (const [id, state] of sourceState) {
    if (!freshIds.has(id)) {
      logger.info(`Source removed/disabled, stopping poll`, id);
      if (state.timer) clearTimeout(state.timer);
      sourceState.delete(id);
    }
  }

  // Stop removed/disabled realtime sources
  if (connectionManager) {
    for (const [id] of connectionManager.connections) {
      if (!freshIds.has(id)) {
        logger.info(`Source removed/disabled, stopping realtime`, id);
        connectionManager.stopConnection(id).catch(err => {
          logger.warn(`Failed to stop realtime connection: ${err.message}`, id);
        });
      }
    }
  }

  // Start new sources (route by mode)
  for (const source of freshSources) {
    const isPolling = sourceState.has(source.id);
    const isRealtime = connectionManager?.hasConnection(source.id);
    if (!isPolling && !isRealtime) {
      logger.info(`New source detected, starting`, source.id);
      startSource(source);
    }
  }
}

// ─── Message Debouncing ────────────────────────────────────────────────────

/**
 * Per-sender message buffer that batches rapid messages into single tasks.
 * Buffer key groups messages by source + channel + sender (or thread).
 * Flushes when the debounce window expires or max buffer count is reached.
 */
class MessageBuffer {
  /**
   * @param {Object} opts
   * @param {(key: string, entries: Array<{item: Object, downloaded: Array, source: Object}>) => void} opts.onFlush
   */
  constructor({ onFlush }) {
    this.onFlush = onFlush;
    /** @type {Map<string, {items: Array, timer: ReturnType<typeof setTimeout>|null}>} */
    this.buffers = new Map();
  }

  /**
   * Add an item to the buffer. Resets the debounce timer (sliding window).
   * @param {string} key - Buffer key (sourceId:channel:sender)
   * @param {{item: Object, downloaded: Array, source: Object}} entry
   * @param {number} debounceMs - Debounce window in milliseconds
   */
  add(key, entry, debounceMs) {
    if (!this.buffers.has(key)) {
      this.buffers.set(key, { items: [], timer: null });
    }

    const buf = this.buffers.get(key);
    buf.items.push(entry);

    // Reset timer on each new item (sliding window)
    if (buf.timer) clearTimeout(buf.timer);

    // Flush immediately if max buffer size reached
    if (buf.items.length >= MAX_BUFFER_SIZE) {
      this._flush(key);
      return;
    }

    buf.timer = setTimeout(() => this._flush(key), debounceMs);
  }

  _flush(key) {
    const buf = this.buffers.get(key);
    if (!buf || buf.items.length === 0) return;

    if (buf.timer) clearTimeout(buf.timer);

    const entries = [...buf.items];
    this.buffers.delete(key);

    try {
      this.onFlush(key, entries);
    } catch (err) {
      logger.error(`Buffer flush failed for ${key}: ${err.message}`);
    }
  }

  /** Flush all pending buffers (called on shutdown). */
  flushAll() {
    for (const key of [...this.buffers.keys()]) {
      this._flush(key);
    }
  }

  /** Total number of items across all pending buffers. */
  get pendingCount() {
    let count = 0;
    for (const buf of this.buffers.values()) count += buf.items.length;
    return count;
  }
}

/**
 * Compute buffer key for grouping messages.
 * Slack threads: sourceId:thread:threadTs
 * General: sourceId:channelId:senderId
 */
function getBufferKey(sourceId, item) {
  if (item.threadTs) {
    return `${sourceId}:thread:${item.threadTs}`;
  }
  const channel = item.fields?.channel || item.fields?.chatId || '';
  const sender = item.author || '';
  return `${sourceId}:${channel}:${sender}`;
}

/**
 * Get effective debounce window for a source.
 * Returns 0 if debouncing is disabled (default).
 */
function getSourceDebounceMs(source) {
  if (source.debounceMs === undefined || source.debounceMs === null || source.debounceMs === false) {
    return 0;
  }
  if (source.debounceMs === true) return DEFAULT_DEBOUNCE_MS;
  const ms = Number(source.debounceMs);
  return ms > 0 ? ms : 0;
}

/**
 * Handle flushed buffer entries: merge items into a single task.
 * Called by MessageBuffer when debounce window expires or max count reached.
 */
async function handleBufferFlush(key, entries) {
  if (entries.length === 0) return;

  const { source } = entries[0];

  // Merge items: first title (with count suffix), concatenated descriptions
  const firstItem = entries[0].item;
  let mergedItem;

  if (entries.length === 1) {
    mergedItem = firstItem;
  } else {
    const descriptions = entries.map(e => e.item.description).filter(Boolean);
    mergedItem = {
      ...firstItem,
      title: `${firstItem.title} (+${entries.length - 1} more)`,
      description: descriptions.join('\n---\n'),
      attachments: entries.flatMap(e => e.item.attachments || []),
    };
  }

  let allDownloaded = entries.flatMap(e => e.downloaded || []);

  if (dryRun) {
    logger.info(`[dry-run] would batch ${entries.length} → ${mergedItem.title.slice(0, 80)}`, source.id);
    return;
  }

  // Check if any entry is a reply to a tracked thread
  for (const entry of entries) {
    const threadResult = await handleThreadReply(source, entry.item, entry.downloaded || []);
    if (threadResult.handled) {
      recordItem(source.id, entry.item.id, entry.item.hash, threadResult.taskId, entry.item.title, entry.item.origin);
      // Remove handled entries from the batch
      const idx = entries.indexOf(entry);
      entries.splice(idx, 1);
    }
  }

  // If all entries were replies, nothing left to create
  if (entries.length === 0) return;

  // Rebuild merged item if entries changed
  const finalFirst = entries[0].item;
  if (entries.length === 1) {
    mergedItem = finalFirst;
  } else {
    const descriptions = entries.map(e => e.item.description).filter(Boolean);
    mergedItem = {
      ...finalFirst,
      title: `${finalFirst.title} (+${entries.length - 1} more)`,
      description: descriptions.join('\n---\n'),
      attachments: entries.flatMap(e => e.item.attachments || []),
    };
  }
  allDownloaded = entries.flatMap(e => e.downloaded || []);

  // Create single task for the batch
  const taskId = createTask(source, mergedItem, allDownloaded);

  // Record ALL original items in dedup db (first item's origin used for reply routing)
  for (const entry of entries) {
    recordItem(source.id, entry.item.id, entry.item.hash, taskId, entry.item.title, entry.item.origin);
  }

  // Register attachments
  if (taskId && allDownloaded.length > 0) {
    registerTaskAttachments(taskId, allDownloaded, source.project);
  }

  // Apply automation
  if (taskId && source.automation) {
    applyAutomation(taskId, source);
  }

  // Register threads for all original items
  if (taskId && source.trackReplies !== false) {
    for (const entry of entries) {
      registerThread(source.id, entry.item.id, entry.item.origin?.threadId || entry.item.id, taskId);
    }
  }

  if (entries.length > 1) {
    logger.info(`Batched ${entries.length} message(s) → task ${taskId}`, source.id);
  }
}
