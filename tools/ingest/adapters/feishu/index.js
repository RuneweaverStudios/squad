import { BaseAdapter, makeAttachment } from '../base.js';
import { createHash } from 'node:crypto';
import * as logger from '../../lib/logger.js';

// Feishu (China) and Lark (International) share the same API shape
const FEISHU_BASE = 'https://open.feishu.cn/open-apis';
const LARK_BASE = 'https://open.larksuite.com/open-apis';

/** @type {import('../base.js').PluginMetadata} */
export const metadata = {
  type: 'feishu',
  name: 'Feishu / Lark',
  description: 'Ingest messages from Feishu or Lark group chats via app credentials',
  version: '1.0.0',
  icon: {
    svg: 'M2.9 6.98c1.58-3.53 4.16-5.53 6.71-6.62l.19.42c-1.45 2.1-2.36 4.65-2.36 7.41 0 3.73 1.66 7.06 4.27 9.32l.02.01c2.14 1.85 4.93 2.98 7.98 2.98 1.37 0 2.67-.24 3.87-.66-1.9 2.57-5.42 4.16-9.09 4.16C6.93 24 0 18.63 0 12.37 0 10.39 1.06 8.58 2.9 6.98z',
    viewBox: '0 0 24 24',
    fill: true,
    color: '#3370FF'
  },
  configFields: [
    {
      key: 'appIdSecret',
      label: 'App ID Secret',
      type: 'secret',
      required: true,
      helpText: 'Name of the secret containing the Feishu/Lark App ID (stored in jat-secret)'
    },
    {
      key: 'appSecretSecret',
      label: 'App Secret Secret',
      type: 'secret',
      required: true,
      helpText: 'Name of the secret containing the Feishu/Lark App Secret (stored in jat-secret)'
    },
    {
      key: 'chatIds',
      label: 'Chat IDs',
      type: 'string',
      required: true,
      placeholder: 'oc_abc123,oc_def456',
      helpText: 'Comma-separated group chat IDs to monitor. The app must be added to each chat.'
    },
    {
      key: 'platform',
      label: 'Platform',
      type: 'select',
      required: false,
      default: 'feishu',
      options: [
        { value: 'feishu', label: 'Feishu (China)' },
        { value: 'lark', label: 'Lark (International)' }
      ],
      helpText: 'Choose Feishu for China deployments, Lark for international'
    },
    {
      key: 'includeBots',
      label: 'Include Bot Messages',
      type: 'boolean',
      default: false,
      helpText: 'Whether to ingest messages from bots'
    }
  ],
  itemFields: [
    { key: 'sender', label: 'Sender', type: 'string' },
    { key: 'chatName', label: 'Chat', type: 'string' },
    {
      key: 'messageType',
      label: 'Message Type',
      type: 'enum',
      values: ['text', 'rich_text', 'image', 'file', 'other']
    },
    { key: 'hasAttachments', label: 'Has Attachments', type: 'boolean' }
  ],
  capabilities: {
    realtime: false,
    send: false,
    threads: false
  }
};

// Cache chat ID -> name across poll cycles
const chatNameCache = new Map();
// Cache user open_id -> display name
const userNameCache = new Map();
const failedUserLookups = new Map();
const FAILED_RETRY_MS = 10 * 60 * 1000;

export default class FeishuAdapter extends BaseAdapter {
  constructor() {
    super('feishu');
    this._cachedToken = null;
    this._tokenExpiresAt = 0;
  }

  _getApiBase(source) {
    return source.platform === 'lark' ? LARK_BASE : FEISHU_BASE;
  }

  /**
   * Get or refresh tenant_access_token using app credentials.
   * Token is cached for reuse (~2 hours validity, refresh at 5 min before expiry).
   */
  async _getTenantToken(apiBase, appId, appSecret) {
    if (this._cachedToken && Date.now() < this._tokenExpiresAt - 300_000) {
      return this._cachedToken;
    }

    const resp = await fetch(`${apiBase}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      signal: AbortSignal.timeout(10000)
    });

    const data = await resp.json();
    if (data.code !== 0) {
      throw new Error(`Feishu auth error (${data.code}): ${data.msg}`);
    }

    this._cachedToken = data.tenant_access_token;
    // API returns expire in seconds (typically 7200 = 2 hours)
    this._tokenExpiresAt = Date.now() + (data.expire || 7200) * 1000;
    return this._cachedToken;
  }

  /**
   * Authenticated fetch against Feishu/Lark API.
   */
  async _apiFetch(apiBase, path, token, options = {}) {
    const resp = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
        ...options.headers
      },
      signal: options.signal || AbortSignal.timeout(15000)
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Feishu API HTTP ${resp.status}: ${errText}`);
    }

    const data = await resp.json();
    if (data.code !== 0) {
      throw new Error(`Feishu API error (${data.code}): ${data.msg}`);
    }

    return data;
  }

  /**
   * Resolve a user's open_id to a display name.
   */
  async _resolveUserName(openId, apiBase, token) {
    if (!openId) return 'unknown';
    if (userNameCache.has(openId)) return userNameCache.get(openId);

    const failedAt = failedUserLookups.get(openId);
    if (failedAt && Date.now() - failedAt < FAILED_RETRY_MS) return openId;

    try {
      const data = await this._apiFetch(
        apiBase,
        `/contact/v3/users/${openId}?user_id_type=open_id`,
        token
      );
      const user = data.data?.user;
      const name = user?.name || user?.en_name || openId;
      userNameCache.set(openId, name);
      failedUserLookups.delete(openId);
      return name;
    } catch (err) {
      logger.warn(`feishu: user lookup failed for ${openId}: ${err.message}`);
      failedUserLookups.set(openId, Date.now());
      return openId;
    }
  }

  /**
   * Resolve a chat ID to its display name.
   */
  async _resolveChatName(chatId, apiBase, token) {
    if (chatNameCache.has(chatId)) return chatNameCache.get(chatId);

    try {
      const data = await this._apiFetch(apiBase, `/im/v1/chats/${chatId}`, token);
      const name = data.data?.name || chatId;
      chatNameCache.set(chatId, name);
      return name;
    } catch {
      return chatId;
    }
  }

  validate(source) {
    if (!source.appIdSecret) {
      return { valid: false, error: 'appIdSecret is required (Feishu/Lark App ID)' };
    }
    if (!source.appSecretSecret) {
      return { valid: false, error: 'appSecretSecret is required (Feishu/Lark App Secret)' };
    }
    if (!source.chatIds) {
      return { valid: false, error: 'chatIds is required (comma-separated group chat IDs)' };
    }
    const ids = parseChatIds(source.chatIds);
    if (ids.length === 0) {
      return { valid: false, error: 'chatIds must contain at least one valid chat ID' };
    }
    return { valid: true };
  }

  async poll(source, adapterState, getSecret) {
    const apiBase = this._getApiBase(source);
    const appId = getSecret(source.appIdSecret);
    const appSecret = getSecret(source.appSecretSecret);
    const token = await this._getTenantToken(apiBase, appId, appSecret);
    const chatIds = parseChatIds(source.chatIds);

    const allItems = [];
    const newState = { ...adapterState };

    for (const chatId of chatIds) {
      const stateKey = `cursor_${chatId}`;
      // Default: start from "now" on first poll (future-only, like other adapters)
      const startTime = adapterState[stateKey] || String(Math.floor(Date.now() / 1000));

      let pageToken = null;
      let newestTime = startTime;

      do {
        const params = new URLSearchParams({
          container_id_type: 'chat',
          container_id: chatId,
          start_time: startTime,
          sort_type: 'ByCreateTimeAsc',
          page_size: '50'
        });
        if (pageToken) params.set('page_token', pageToken);

        const data = await this._apiFetch(
          apiBase,
          `/im/v1/messages?${params}`,
          token
        );

        const messages = data.data?.items || [];
        const chatName = await this._resolveChatName(chatId, apiBase, token);

        for (const msg of messages) {
          // Skip bot messages unless configured
          if (!source.includeBots && msg.sender?.sender_type === 'app') continue;

          const senderName = await this._resolveUserName(
            msg.sender?.id, apiBase, token
          );
          const item = messageToItem(msg, chatId, chatName, senderName);
          if (item) allItems.push(item);

          // Track newest create_time (Unix seconds string)
          const msgTime = msg.create_time;
          if (msgTime && msgTime > newestTime) {
            newestTime = msgTime;
          }
        }

        pageToken = data.data?.page_token || null;
      } while (pageToken);

      newState[stateKey] = newestTime;
    }

    return { items: allItems, state: newState };
  }

  async test(source, getSecret) {
    const validation = this.validate(source);
    if (!validation.valid) {
      return { ok: false, message: validation.error };
    }

    try {
      const apiBase = this._getApiBase(source);
      const appId = getSecret(source.appIdSecret);
      const appSecret = getSecret(source.appSecretSecret);
      const token = await this._getTenantToken(apiBase, appId, appSecret);

      const chatIds = parseChatIds(source.chatIds);
      const sampleItems = [];
      const chatNames = [];

      for (const chatId of chatIds) {
        // Verify chat access
        const chatName = await this._resolveChatName(chatId, apiBase, token);
        chatNames.push(chatName);

        // Fetch a few recent messages as samples
        const params = new URLSearchParams({
          container_id_type: 'chat',
          container_id: chatId,
          sort_type: 'ByCreateTimeDesc',
          page_size: '3'
        });

        try {
          const data = await this._apiFetch(apiBase, `/im/v1/messages?${params}`, token);
          for (const msg of (data.data?.items || []).slice(0, 3)) {
            const body = extractTextContent(msg);
            sampleItems.push({
              id: msg.message_id,
              title: (body || '').slice(0, 100) || 'Empty message',
              timestamp: msg.create_time
                ? new Date(parseInt(msg.create_time) * 1000).toISOString()
                : ''
            });
          }
        } catch {
          // Non-fatal: we confirmed auth works, just couldn't list messages
        }
      }

      return {
        ok: true,
        message: `Connected to ${source.platform === 'lark' ? 'Lark' : 'Feishu'}. Chats: ${chatNames.join(', ')}.`,
        sampleItems
      };
    } catch (err) {
      return { ok: false, message: `Connection failed: ${err.message}` };
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseChatIds(input) {
  if (!input) return [];
  return input
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
}

/**
 * Extract plain text from a Feishu message body.
 * Message content is JSON-encoded in msg.body.content.
 * Text messages: {"text": "hello"}
 * Rich text messages: {"title": "...", "content": [[{tag: "text", text: "..."}]]}
 */
function extractTextContent(msg) {
  if (!msg.body?.content) return '';

  try {
    const content = JSON.parse(msg.body.content);
    const msgType = msg.msg_type;

    if (msgType === 'text') {
      return content.text || '';
    }

    if (msgType === 'post' || msgType === 'rich_text') {
      // Rich text: nested array of elements with tags
      const parts = [];
      if (content.title) parts.push(content.title);
      const blocks = content.content || [];
      for (const line of blocks) {
        if (!Array.isArray(line)) continue;
        const lineText = line
          .filter(el => el.tag === 'text' || el.tag === 'a')
          .map(el => el.text || el.href || '')
          .join('');
        if (lineText) parts.push(lineText);
      }
      return parts.join('\n');
    }

    if (msgType === 'image') {
      return '[Image]';
    }

    if (msgType === 'file') {
      return `[File: ${content.file_name || 'attachment'}]`;
    }

    // Interactive cards, merge_forward, etc.
    return content.text || content.title || `[${msgType}]`;
  } catch {
    return '';
  }
}

/**
 * Map Feishu msg_type to our simplified enum.
 */
function normalizeMessageType(msgType) {
  switch (msgType) {
    case 'text': return 'text';
    case 'post': return 'rich_text';
    case 'image': return 'image';
    case 'file':
    case 'media':
    case 'audio': return 'file';
    default: return 'other';
  }
}

function messageToItem(msg, chatId, chatName, senderName) {
  const text = extractTextContent(msg);
  const msgType = msg.msg_type || 'text';

  // Skip truly empty messages (no text and no file/image type)
  if (!text && !['image', 'file', 'media'].includes(msgType)) return null;

  const firstLine = text.split('\n')[0];
  const title = (firstLine.length > 200 ? firstLine.slice(0, 200) + '...' : firstLine)
    || 'Feishu message';

  // Build attachments from image/file messages
  const attachments = [];
  if (msgType === 'image') {
    try {
      const content = JSON.parse(msg.body?.content || '{}');
      if (content.image_key) {
        attachments.push(makeAttachment(
          content.image_key,  // Image key (needs API call to download)
          'image',
          null
        ));
      }
    } catch { /* skip */ }
  } else if (msgType === 'file' || msgType === 'media') {
    try {
      const content = JSON.parse(msg.body?.content || '{}');
      attachments.push(makeAttachment(
        content.file_key || content.media_key || '',
        'file',
        content.file_name || null
      ));
    } catch { /* skip */ }
  }

  const hashInput = `feishu-${msg.message_id}-${chatId}`;
  const hash = createHash('sha256').update(hashInput).digest('hex').slice(0, 16);

  return {
    id: `feishu-${msg.message_id}`,
    title,
    description: text,
    hash,
    author: senderName,
    timestamp: msg.create_time
      ? new Date(parseInt(msg.create_time) * 1000).toISOString()
      : new Date().toISOString(),
    attachments,
    fields: {
      sender: senderName,
      chatName,
      messageType: normalizeMessageType(msgType),
      hasAttachments: attachments.length > 0
    }
  };
}
