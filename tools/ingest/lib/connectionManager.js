import { isDuplicate, recordItem, getAdapterState, setAdapterState, registerThread } from './dedup.js';
import { downloadAttachments } from './downloader.js';
import { createTask, appendToTask, registerTaskAttachments, applyAutomation } from './taskCreator.js';
import { applyFilter, resolveFilter } from './filterEngine.js';
import * as logger from './logger.js';

const MAX_BACKOFF_MS = 3600000; // 1 hour
const HEALTH_CHECK_INTERVAL_MS = 60000; // 1 minute
const DEFAULT_STALE_THRESHOLD_MS = 300000; // 5 minutes

/**
 * @typedef {Object} ConnectionState
 * @property {string} sourceId
 * @property {Object} source - Source config
 * @property {import('./pluginLoader.js').LoadedPlugin} plugin
 * @property {import('../adapters/base.js').BaseAdapter} adapter
 * @property {'connecting'|'connected'|'disconnecting'|'disconnected'|'reconnecting'} status
 * @property {Date|null} connectedAt
 * @property {Date|null} lastMessageAt
 * @property {number} reconnectCount
 * @property {ReturnType<typeof setTimeout>|null} reconnectTimer
 * @property {number} backoffMs
 */

export class ConnectionManager {
  /**
   * @param {Object} opts
   * @param {Map<string, import('./pluginLoader.js').LoadedPlugin>} opts.plugins
   * @param {(name: string) => string} opts.getSecret
   * @param {boolean} [opts.dryRun=false]
   */
  constructor({ plugins, getSecret, dryRun = false, messageBuffer = null }) {
    this.plugins = plugins;
    this.getSecret = getSecret;
    this.dryRun = dryRun;
    this.messageBuffer = messageBuffer;
    /** @type {Map<string, ConnectionState>} */
    this.connections = new Map();
    this.healthTimer = null;
  }

  /**
   * Determine the effective connection mode for a source.
   * @param {Object} source - Source config
   * @param {import('./pluginLoader.js').LoadedPlugin} plugin
   * @returns {'poll'|'realtime'}
   */
  static resolveMode(source, plugin) {
    const mode = source.mode || 'auto';
    if (mode === 'realtime') return 'realtime';
    if (mode === 'poll') return 'poll';
    // auto: use realtime if adapter supports it, else poll
    const adapter = new plugin.AdapterClass();
    return adapter.supportsRealtime ? 'realtime' : 'poll';
  }

  /**
   * Start a realtime connection for a source.
   * @param {Object} source - Source config
   */
  async startConnection(source) {
    if (this.connections.has(source.id)) {
      logger.warn(`Connection already exists, skipping`, source.id);
      return;
    }

    const plugin = this.plugins.get(source.type);
    if (!plugin) {
      logger.error(`No plugin for type: ${source.type}`, source.id);
      return;
    }

    const adapter = new plugin.AdapterClass();
    if (!adapter.supportsRealtime) {
      logger.error(`Adapter ${source.type} does not support realtime`, source.id);
      return;
    }

    /** @type {ConnectionState} */
    const state = {
      sourceId: source.id,
      source,
      plugin,
      adapter,
      status: 'connecting',
      connectedAt: null,
      lastMessageAt: null,
      reconnectCount: 0,
      reconnectTimer: null,
      backoffMs: 0,
    };
    this.connections.set(source.id, state);

    await this._connect(state);
  }

  /**
   * Stop a single realtime connection.
   * @param {string} sourceId
   */
  async stopConnection(sourceId) {
    const state = this.connections.get(sourceId);
    if (!state) return;

    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }

    if (state.status === 'connected' || state.status === 'connecting') {
      state.status = 'disconnecting';
      try {
        await state.adapter.disconnect();
      } catch (err) {
        logger.warn(`Disconnect error: ${err.message}`, sourceId);
      }
    }

    state.status = 'disconnected';
    this._persistConnectionState(sourceId);
    this.connections.delete(sourceId);
  }

  /**
   * Stop all realtime connections and the health monitor.
   */
  async stopAll() {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }

    const promises = [...this.connections.keys()].map(id => this.stopConnection(id));
    await Promise.allSettled(promises);
  }

  /**
   * Start periodic health checks for stale connections.
   * @param {number} [intervalMs]
   */
  startHealthMonitor(intervalMs = HEALTH_CHECK_INTERVAL_MS) {
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = setInterval(() => this._checkHealth(), intervalMs);
  }

  /**
   * Get status of all active connections.
   * @returns {Record<string, {status: string, connectedAt: string|null, lastMessageAt: string|null, reconnectCount: number}>}
   */
  getStatus() {
    const result = {};
    for (const [id, state] of this.connections) {
      result[id] = {
        status: state.status,
        connectedAt: state.connectedAt?.toISOString() || null,
        lastMessageAt: state.lastMessageAt?.toISOString() || null,
        reconnectCount: state.reconnectCount,
      };
    }
    return result;
  }

  /**
   * Check if a source has an active connection.
   * @param {string} sourceId
   * @returns {boolean}
   */
  hasConnection(sourceId) {
    return this.connections.has(sourceId);
  }

  // ─── Internal Methods ──────────────────────────────────────────────────────

  /**
   * Establish the realtime connection with callbacks wired up.
   * @param {ConnectionState} state
   */
  async _connect(state) {
    const { source, plugin, adapter } = state;
    const filter = resolveFilter(source.filter, plugin.metadata.defaultFilter);

    const callbacks = {
      onMessage: (item) => this._handleMessage(source, plugin, filter, item),
      onError: (err) => this._handleError(source.id, err),
      onDisconnect: (reason) => this._handleDisconnect(source.id, reason),
    };

    try {
      logger.info(`Connecting realtime...`, source.id);
      await adapter.connect(source, this.getSecret, callbacks);
      state.status = 'connected';
      state.connectedAt = new Date();
      state.backoffMs = 0;
      state.reconnectCount = 0;
      this._persistConnectionState(source.id);
      logger.info(`Connected`, source.id);
    } catch (err) {
      logger.error(`Connection failed: ${err.message}`, source.id);
      state.status = 'disconnected';
      this._scheduleReconnect(source.id);
    }
  }

  /**
   * Handle an incoming realtime message. Runs the same pipeline as poll:
   * filter → dedup → download attachments → create task → record → automation → thread.
   * @param {Object} source
   * @param {import('./pluginLoader.js').LoadedPlugin} plugin
   * @param {import('../adapters/base.js').FilterCondition[]|null} filter
   * @param {import('../adapters/base.js').IngestItem} item
   */
  _handleMessage(source, plugin, filter, item) {
    this._processItem(source, plugin, filter, item).catch(err => {
      logger.error(`Failed to process realtime item: ${err.message}`, source.id);
    });
  }

  /**
   * Process a single item through the ingest pipeline.
   * @param {Object} source
   * @param {import('./pluginLoader.js').LoadedPlugin} plugin
   * @param {import('../adapters/base.js').FilterCondition[]|null} filter
   * @param {import('../adapters/base.js').IngestItem} item
   */
  async _processItem(source, plugin, filter, item) {
    // Update last message timestamp
    const connState = this.connections.get(source.id);
    if (connState) {
      connState.lastMessageAt = new Date();
    }

    // Apply filter
    if (!applyFilter(item, filter)) return;

    // Dedup
    if (isDuplicate(source.id, item.id)) return;

    if (this.dryRun) {
      logger.info(`[dry-run] would create: ${item.title.slice(0, 80)}`, source.id);
      return;
    }

    // Download attachments
    let downloaded = [];
    if (item.attachments?.length > 0) {
      const allLocal = item.attachments.every(a => a.localPath);
      if (allLocal) {
        downloaded = item.attachments;
      } else {
        const authHeaders = _getAuthHeaders(source, this.getSecret);
        downloaded = await downloadAttachments(source.id, item.attachments, authHeaders);
      }
    }

    // Check if debouncing is enabled for this source
    const debounceMs = _getDebounceMs(source);
    if (debounceMs > 0 && this.messageBuffer) {
      const key = _getBufferKey(source.id, item);
      this.messageBuffer.add(key, { item, downloaded, source }, debounceMs);
      return;
    }

    // Create task (immediate, no debounce)
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

    // Register thread for adapters that support replies
    if (taskId && source.trackReplies !== false) {
      const prefix = `${source.type}-`;
      if (item.id.startsWith(prefix)) {
        const threadKey = item.id.slice(prefix.length);
        registerThread(source.id, item.id, threadKey, taskId);
      }
    }

    logger.info(`Realtime → task ${taskId}: ${item.title.slice(0, 60)}`, source.id);
  }

  /**
   * Handle an error from the realtime adapter.
   * @param {string} sourceId
   * @param {Error} err
   */
  _handleError(sourceId, err) {
    logger.error(`Realtime error: ${err.message}`, sourceId);
  }

  /**
   * Handle disconnect from the realtime adapter. Schedules reconnection
   * unless we're intentionally disconnecting.
   * @param {string} sourceId
   * @param {string} reason
   */
  _handleDisconnect(sourceId, reason) {
    const state = this.connections.get(sourceId);
    if (!state) return;

    // Don't reconnect if we initiated the disconnect
    if (state.status === 'disconnecting') return;

    logger.warn(`Disconnected: ${reason}`, sourceId);
    state.status = 'disconnected';
    this._scheduleReconnect(sourceId);
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   * @param {string} sourceId
   */
  _scheduleReconnect(sourceId) {
    const state = this.connections.get(sourceId);
    if (!state) return;

    state.reconnectCount++;
    state.backoffMs = Math.min(
      MAX_BACKOFF_MS,
      Math.pow(2, state.reconnectCount) * 1000
    );

    logger.info(
      `Reconnecting in ${Math.round(state.backoffMs / 1000)}s (attempt ${state.reconnectCount})`,
      sourceId
    );
    state.status = 'reconnecting';
    this._persistConnectionState(sourceId);

    state.reconnectTimer = setTimeout(async () => {
      // Check if connection was removed while waiting
      if (!this.connections.has(sourceId)) return;
      await this._connect(state);
    }, state.backoffMs);
  }

  /**
   * Persist connection metadata into the adapter_state table.
   * Merges with existing adapter state (preserves cursors etc.).
   * @param {string} sourceId
   */
  _persistConnectionState(sourceId) {
    const state = this.connections.get(sourceId);
    if (!state) return;

    try {
      const existing = getAdapterState(sourceId) || {};
      setAdapterState(sourceId, {
        ...existing,
        _connection: {
          status: state.status,
          connectedAt: state.connectedAt?.toISOString() || null,
          lastMessageAt: state.lastMessageAt?.toISOString() || null,
          reconnectCount: state.reconnectCount,
        }
      });
    } catch (err) {
      logger.warn(`Failed to persist connection state: ${err.message}`, sourceId);
    }
  }

  /**
   * Check for stale connections and trigger reconnection.
   * A connection is stale if no messages received within the threshold.
   */
  _checkHealth() {
    const now = Date.now();

    for (const [sourceId, state] of this.connections) {
      if (state.status !== 'connected') continue;

      // Use per-source threshold, or default
      const thresholdMs = (state.source.staleTimeout || 300) * 1000;
      if (thresholdMs <= 0) continue; // Disabled

      // Only check if we've received at least one message
      if (!state.lastMessageAt) continue;

      const staleMs = now - state.lastMessageAt.getTime();
      if (staleMs > thresholdMs) {
        logger.warn(
          `Connection stale (no messages for ${Math.round(staleMs / 1000)}s), reconnecting`,
          sourceId
        );
        // Trigger reconnect via the disconnect handler
        this._handleDisconnect(sourceId, 'stale connection detected');
      }
    }
  }
}

/**
 * Get auth headers for attachment downloads (same logic as scheduler.js).
 * @param {Object} source
 * @param {(name: string) => string} getSecret
 * @returns {Object}
 */
function _getAuthHeaders(source, getSecret) {
  if (source.secretName) {
    try {
      const token = getSecret(source.secretName);
      return { 'Authorization': `Bearer ${token}` };
    } catch { /* fallthrough */ }
  }
  return {};
}

/** Default debounce window when source.debounceMs is true */
const _DEFAULT_DEBOUNCE_MS = 30000;

function _getDebounceMs(source) {
  if (source.debounceMs === undefined || source.debounceMs === null || source.debounceMs === false) return 0;
  if (source.debounceMs === true) return _DEFAULT_DEBOUNCE_MS;
  const ms = Number(source.debounceMs);
  return ms > 0 ? ms : 0;
}

function _getBufferKey(sourceId, item) {
  if (item.threadTs) return `${sourceId}:thread:${item.threadTs}`;
  const channel = item.fields?.channel || item.fields?.chatId || '';
  const sender = item.author || '';
  return `${sourceId}:${channel}:${sender}`;
}
