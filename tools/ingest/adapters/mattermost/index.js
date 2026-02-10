import { BaseAdapter, makeAttachment } from '../base.js';
import { createHash } from 'node:crypto';
import * as logger from '../../lib/logger.js';

// Cache user ID -> display name across poll cycles
const userNameCache = new Map();
// Cache channel ID -> display name
const channelNameCache = new Map();

/** @type {import('../base.js').PluginMetadata} */
export const metadata = {
  type: 'mattermost',
  name: 'Mattermost',
  description: 'Ingest messages from Mattermost channels via REST API',
  version: '1.0.0',
  configFields: [
    {
      key: 'serverUrl',
      label: 'Server URL',
      type: 'string',
      required: true,
      placeholder: 'https://mattermost.example.com',
      helpText: 'Mattermost server base URL (no trailing slash)'
    },
    {
      key: 'secretName',
      label: 'Access Token Secret',
      type: 'secret',
      required: true,
      helpText: 'Name of the secret containing a personal access token or bot token (stored in jat-secret)'
    },
    {
      key: 'channelIds',
      label: 'Channel IDs',
      type: 'string',
      required: true,
      placeholder: 'abc123def456,xyz789ghi012',
      helpText: 'Comma-separated Mattermost channel IDs to monitor'
    },
    {
      key: 'includeBots',
      label: 'Include Bot Messages',
      type: 'boolean',
      default: false,
      helpText: 'Whether to ingest messages posted by bots'
    }
  ],
  itemFields: [
    { key: 'sender', label: 'Sender', type: 'string' },
    { key: 'channelName', label: 'Channel', type: 'string' },
    { key: 'hasFiles', label: 'Has Files', type: 'boolean' },
    {
      key: 'messageType',
      label: 'Message Type',
      type: 'enum',
      values: ['regular', 'system', 'join']
    }
  ],
  capabilities: {
    realtime: true,
    send: true
  }
};

export default class MattermostAdapter extends BaseAdapter {
  constructor() {
    super('mattermost');
  }

  get supportsRealtime() {
    return true;
  }

  get supportsSend() {
    return true;
  }

  /**
   * Make an authenticated request to the Mattermost API.
   */
  async apiFetch(serverUrl, path, token, options = {}) {
    const url = `${serverUrl.replace(/\/$/, '')}/api/v4${path}`;
    const resp = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      },
      signal: options.signal || AbortSignal.timeout(15000)
    });

    if (resp.status === 429) {
      const retryAfter = resp.headers.get('Retry-After');
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000;
      await new Promise(r => setTimeout(r, Math.min(waitMs, 30000)));
      return this.apiFetch(serverUrl, path, token, options);
    }

    return resp;
  }

  /**
   * Resolve a user ID to a display name, with caching.
   */
  async resolveUserName(userId, serverUrl, token) {
    if (userNameCache.has(userId)) return userNameCache.get(userId);

    try {
      const resp = await this.apiFetch(serverUrl, `/users/${userId}`, token);
      if (resp.ok) {
        const user = await resp.json();
        const name = user.nickname || user.first_name
          ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username
          : user.username;
        userNameCache.set(userId, name);
        return name;
      }
    } catch (err) {
      logger.warn(`mattermost: failed to resolve user ${userId}: ${err.message}`);
    }

    return userId;
  }

  /**
   * Resolve a channel ID to a display name, with caching.
   */
  async resolveChannelName(channelId, serverUrl, token) {
    if (channelNameCache.has(channelId)) return channelNameCache.get(channelId);

    try {
      const resp = await this.apiFetch(serverUrl, `/channels/${channelId}`, token);
      if (resp.ok) {
        const channel = await resp.json();
        const name = channel.display_name || channel.name || channelId;
        channelNameCache.set(channelId, name);
        return name;
      }
    } catch (err) {
      logger.warn(`mattermost: failed to resolve channel ${channelId}: ${err.message}`);
    }

    return channelId;
  }

  validate(source) {
    if (!source.serverUrl) {
      return { valid: false, error: 'serverUrl is required (Mattermost server base URL)' };
    }
    if (!source.secretName) {
      return { valid: false, error: 'secretName is required (personal or bot access token)' };
    }
    if (!source.channelIds) {
      return { valid: false, error: 'channelIds is required (comma-separated channel IDs)' };
    }
    const ids = parseChannelIds(source.channelIds);
    if (ids.length === 0) {
      return { valid: false, error: 'channelIds must contain at least one valid ID' };
    }
    try {
      new URL(source.serverUrl);
    } catch {
      return { valid: false, error: 'serverUrl must be a valid URL' };
    }
    return { valid: true };
  }

  async poll(source, adapterState, getSecret) {
    const token = getSecret(source.secretName);
    const serverUrl = source.serverUrl;
    const channelIds = parseChannelIds(source.channelIds);
    // Per-channel cursor: { [channelId]: lastPostTimestamp }
    const cursors = adapterState.cursors || {};
    const items = [];
    const newCursors = { ...cursors };

    for (const channelId of channelIds) {
      try {
        const channelItems = await this.pollChannel(
          serverUrl, token, channelId, cursors[channelId], source
        );
        for (const item of channelItems) {
          items.push(item);
          // Track highest create_at as cursor
          if (!newCursors[channelId] || item._createAt > newCursors[channelId]) {
            newCursors[channelId] = item._createAt;
          }
        }
      } catch (err) {
        logger.warn(`mattermost: failed to poll channel ${channelId}: ${err.message}`);
      }
    }

    // Strip internal tracking fields
    for (const item of items) {
      delete item._createAt;
    }

    return {
      items,
      state: { ...adapterState, cursors: newCursors }
    };
  }

  /**
   * Poll a single channel for new posts since the last cursor.
   * Uses the /channels/{id}/posts endpoint with `since` parameter.
   */
  async pollChannel(serverUrl, token, channelId, sinceTs, source) {
    const params = new URLSearchParams({ per_page: '100' });
    if (sinceTs) {
      params.set('since', String(sinceTs));
    }

    const resp = await this.apiFetch(
      serverUrl,
      `/channels/${channelId}/posts?${params}`,
      token
    );

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${text}`);
    }

    const data = await resp.json();
    // Mattermost returns { order: [...ids], posts: { id: post, ... } }
    const order = data.order || [];
    const posts = data.posts || {};

    const channelName = await this.resolveChannelName(channelId, serverUrl, token);
    const items = [];

    // Process in chronological order (order is newest-first)
    for (const postId of [...order].reverse()) {
      const post = posts[postId];
      if (!post) continue;

      // Skip system messages unless they're join messages we want to classify
      const msgType = classifyMessageType(post.type);
      if (msgType === 'system' && post.type !== 'system_join_channel') continue;
      if (msgType === 'join') continue; // Skip join/leave messages

      // Skip bot posts unless explicitly included
      if (post.props?.from_bot === 'true' && !source.includeBots) continue;
      if (post.props?.from_webhook === 'true' && !source.includeBots) continue;

      // Skip if this is an edit of a post we already saw (same create_at)
      if (sinceTs && post.create_at <= sinceTs) continue;

      const item = await this.postToItem(post, channelName, serverUrl, token);
      if (item) items.push(item);
    }

    return items;
  }

  /**
   * Convert a Mattermost post to an IngestItem.
   */
  async postToItem(post, channelName, serverUrl, token) {
    const text = post.message || '';
    const hasFiles = (post.file_ids?.length || 0) > 0;

    if (!text && !hasFiles) return null;

    const firstLine = text.split('\n')[0];
    const title = firstLine.length > 200
      ? firstLine.slice(0, 200) + '...'
      : firstLine || 'Mattermost message';

    // Resolve sender name
    const sender = post.user_id
      ? await this.resolveUserName(post.user_id, serverUrl, token)
      : 'unknown';

    // Process file attachments
    const attachments = [];
    if (post.file_ids?.length > 0 && post.metadata?.files) {
      for (const file of post.metadata.files) {
        const fileUrl = `${serverUrl.replace(/\/$/, '')}/api/v4/files/${file.id}`;
        const isImage = file.mime_type?.startsWith('image/');
        attachments.push(makeAttachment(fileUrl, isImage ? 'image' : 'file', file.name));
      }
    }

    const hash = createHash('sha256')
      .update(`mattermost-${post.id}-${post.channel_id}`)
      .digest('hex')
      .slice(0, 16);

    return {
      id: `mattermost-${post.id}`,
      title,
      description: text,
      hash,
      author: sender,
      timestamp: new Date(post.create_at).toISOString(),
      attachments,
      replyTo: post.root_id ? `mattermost-${post.root_id}` : undefined,
      fields: {
        sender,
        channelName,
        hasFiles: attachments.length > 0,
        messageType: classifyMessageType(post.type)
      },
      origin: {
        adapterType: 'mattermost',
        channelId: post.channel_id,
        senderId: post.user_id,
        threadId: post.root_id || post.id,
        metadata: { serverUrl }
      },
      // Internal tracking (stripped before returning from poll)
      _createAt: post.create_at
    };
  }

  async test(source, getSecret) {
    const validation = this.validate(source);
    if (!validation.valid) {
      return { ok: false, message: validation.error };
    }

    try {
      const token = getSecret(source.secretName);
      const serverUrl = source.serverUrl;

      // Verify token by fetching current user
      const meResp = await this.apiFetch(serverUrl, '/users/me', token);
      if (!meResp.ok) {
        const text = await meResp.text();
        return { ok: false, message: `Auth failed (HTTP ${meResp.status}): ${text}` };
      }
      const me = await meResp.json();

      // Verify first channel access
      const channelIds = parseChannelIds(source.channelIds);
      const postsResp = await this.apiFetch(
        serverUrl,
        `/channels/${channelIds[0]}/posts?per_page=3`,
        token
      );

      if (!postsResp.ok) {
        const text = await postsResp.text();
        return { ok: false, message: `Channel access failed (HTTP ${postsResp.status}): ${text}` };
      }

      const postsData = await postsResp.json();
      const order = postsData.order || [];
      const posts = postsData.posts || {};

      const sampleItems = order.slice(0, 3).map(id => {
        const post = posts[id];
        return {
          id: post?.id,
          title: (post?.message || '').slice(0, 100) || 'Empty message',
          timestamp: post ? new Date(post.create_at).toISOString() : null
        };
      });

      return {
        ok: true,
        message: `Connected as ${me.username} (${me.first_name || ''} ${me.last_name || ''}).`.trim()
          + ` Testing ${channelIds.length} channel(s). First channel has ${order.length} recent posts.`,
        sampleItems
      };
    } catch (err) {
      return { ok: false, message: `Connection failed: ${err.message}` };
    }
  }

  // ─── Realtime stubs (future: Mattermost WebSocket API) ────────────

  async connect(_sourceConfig, _getSecret, _callbacks) {
    // Future: open WebSocket to {serverUrl}/api/v4/websocket
    // - Authenticate with token via authentication_challenge
    // - Listen for 'posted' events on configured channels
    // - Call callbacks.onMessage() for each new post
    // - Handle reconnection and ping/pong
    throw new Error('mattermost: realtime not yet implemented (use polling mode)');
  }

  async disconnect() {
    // Future: close WebSocket gracefully
  }

  async send(target, message, getSecret) {
    const token = getSecret(target._secretName || target.secretName);
    const serverUrl = target._serverUrl || target.serverUrl;
    const channelId = target.channelId;
    if (!channelId) throw new Error('mattermost: send() requires target.channelId');
    if (!serverUrl) throw new Error('mattermost: send() requires target.serverUrl');

    const body = {
      channel_id: channelId,
      message: message.text
    };
    if (target.threadId) {
      body.root_id = target.threadId;
    }

    const resp = await this.apiFetch(serverUrl, '/posts', token, {
      method: 'POST',
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(`mattermost: send() failed (HTTP ${resp.status}): ${err.message || err.detailed_error || 'unknown'}`);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function parseChannelIds(input) {
  if (!input) return [];
  return input
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
}

/**
 * Classify a Mattermost post type into our simplified enum.
 */
function classifyMessageType(type) {
  if (!type || type === '') return 'regular';
  if (type === 'system_join_channel' || type === 'system_leave_channel' ||
      type === 'system_add_to_channel' || type === 'system_remove_from_channel') {
    return 'join';
  }
  if (type.startsWith('system_')) return 'system';
  return 'regular';
}
