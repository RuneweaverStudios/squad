import { getEnabledSources, getConfig, getSecret } from './config.js';
import { isDuplicate, recordItem, getAdapterState, setAdapterState, logPoll, registerThread, getActiveThreads, updateThreadCursor } from './dedup.js';
import { downloadAttachments } from './downloader.js';
import { createTask, appendToTask, registerTaskAttachments, applyAutomation } from './taskCreator.js';
import { discoverPlugins } from './pluginLoader.js';
import { applyFilter, resolveFilter } from './filterEngine.js';
import { ConnectionManager } from './connectionManager.js';
import * as logger from './logger.js';

const STAGGER_MS = 2000;
const CONFIG_CHECK_INTERVAL = 30000;
const MAX_BACKOFF_MS = 3600000; // 1 hour

// Track per-source backoff and timers (poll mode only)
const sourceState = new Map();

/** @type {Map<string, import('./pluginLoader.js').LoadedPlugin>} */
let plugins = new Map();

/** @type {ConnectionManager|null} */
let connectionManager = null;

let running = false;
let configCheckTimer = null;
let dryRun = false;

export async function start(opts = {}) {
  running = true;
  dryRun = opts.dryRun || false;

  // Discover plugins dynamically instead of hardcoded imports
  plugins = await discoverPlugins();
  if (plugins.size === 0) {
    logger.warn('No plugins discovered');
  } else {
    logger.info(`Discovered ${plugins.size} plugin(s): ${[...plugins.keys()].join(', ')}`);
  }

  // Initialize connection manager for realtime sources
  connectionManager = new ConnectionManager({ plugins, getSecret, dryRun });
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

      // Create task
      const taskId = createTask(source, item, downloaded);

      // Record to dedup db
      recordItem(source.id, item.id, item.hash, taskId, item.title);

      // Register downloaded files as task attachments
      if (taskId && downloaded.length > 0) {
        registerTaskAttachments(taskId, downloaded, source.project);
      }

      // Apply automation (spawn agent, schedule, or delay)
      if (taskId && source.automation) {
        applyAutomation(taskId, source);
      }

      // Register thread for adapters that support replies
      if (taskId && source.trackReplies !== false) {
        // Extract thread key from item ID (e.g. "slack-1234.5678" → "1234.5678")
        const prefix = `${source.type}-`;
        if (item.id.startsWith(prefix)) {
          const threadKey = item.id.slice(prefix.length);
          registerThread(source.id, item.id, threadKey, taskId);
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
