import { BaseAdapter, makeAttachment } from '../base.js';
import * as logger from '../../lib/logger.js';

const API_BASE = 'https://slack.com/api';

// Cache user ID -> display name across poll cycles (only successful lookups)
const userNameCache = new Map();
// Track failed lookups to avoid spamming the API (retry after 10 minutes)
const failedLookups = new Map();
const FAILED_RETRY_MS = 10 * 60 * 1000;
// Cache team URL for permalinks (set once on first poll)
let cachedTeamUrl = null;

/** @type {import('../base.js').PluginMetadata} */
export const metadata = {
  type: 'slack',
  name: 'Slack',
  description: 'Ingest messages from Slack channels',
  version: '1.0.0',
  configFields: [
    {
      key: 'secretName',
      label: 'Bot Token Secret',
      type: 'secret',
      required: true,
      helpText: 'Name of the secret containing the Slack bot token (stored in jat-secret)'
    },
    {
      key: 'channel',
      label: 'Channel ID',
      type: 'string',
      required: true,
      placeholder: 'C0123ABCDEF',
      helpText: 'Slack channel ID (not the channel name)'
    },
    {
      key: 'includeBots',
      label: 'Include Bot Messages',
      type: 'boolean',
      default: false,
      helpText: 'Whether to ingest messages from bots'
    },
    {
      key: 'trackReplies',
      label: 'Track Thread Replies',
      type: 'boolean',
      default: true,
      helpText: 'Poll for and append thread replies to existing tasks'
    }
  ],
  itemFields: [
    { key: 'channel', label: 'Channel', type: 'string' },
    { key: 'isThread', label: 'Is Thread', type: 'boolean' },
    { key: 'hasAttachments', label: 'Has Attachments', type: 'boolean' },
    { key: 'authorName', label: 'Author', type: 'string' }
  ]
};

export default class SlackAdapter extends BaseAdapter {
  constructor() {
    super('slack');
  }

  async resolveUserName(userId, token) {
    if (userNameCache.has(userId)) return userNameCache.get(userId);

    // Don't retry recently failed lookups (avoid API spam)
    const failedAt = failedLookups.get(userId);
    if (failedAt && Date.now() - failedAt < FAILED_RETRY_MS) return userId;

    try {
      const resp = await fetch(`${API_BASE}/users.info?user=${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(5000)
      });
      const data = await resp.json();
      if (data.ok && data.user) {
        const name = data.user.profile?.display_name
          || data.user.real_name
          || data.user.name
          || userId;
        userNameCache.set(userId, name);
        failedLookups.delete(userId);
        return name;
      }
      // API returned an error (e.g., missing users:read scope)
      logger.warn(`users.info failed for ${userId}: ${data.error || `HTTP ${resp.status}`}`);
    } catch (err) {
      logger.warn(`users.info error for ${userId}: ${err.message}`);
    }

    failedLookups.set(userId, Date.now());
    return userId;
  }

  async getTeamUrl(token) {
    if (cachedTeamUrl) return cachedTeamUrl;
    try {
      const resp = await fetch(`${API_BASE}/auth.test`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(5000)
      });
      const data = await resp.json();
      if (data.ok && data.url) {
        cachedTeamUrl = data.url.replace(/\/$/, '');
        return cachedTeamUrl;
      }
    } catch { /* fall through */ }
    return null;
  }

  /**
   * Convert Slack mrkdwn to readable text:
   *  <@U123>       -> @DisplayName
   *  <#C123|name>  -> #name
   *  <url|label>   -> [label](url)
   *  <url>         -> url
   */
  async formatSlackText(text, token) {
    if (!text) return text;

    // Collect all user IDs that need resolving
    const userMentions = [...text.matchAll(/<@(U[A-Z0-9]+)>/g)];
    for (const match of userMentions) {
      const name = await this.resolveUserName(match[1], token);
      text = text.replace(match[0], `@${name}`);
    }

    // Channel references: <#C123|channel-name> -> #channel-name
    text = text.replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1');

    // Links with labels: <url|label> -> [label](url)
    text = text.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, '[$2]($1)');

    // Bare links: <url> -> url
    text = text.replace(/<(https?:\/\/[^>]+)>/g, '$1');

    return text;
  }

  validate(source) {
    if (!source.secretName) {
      return { valid: false, error: 'secretName is required (Slack bot token)' };
    }
    if (!source.channel) {
      return { valid: false, error: 'channel is required (Slack channel ID, e.g., C0123ABCDEF)' };
    }
    return { valid: true };
  }

  async poll(source, adapterState, getSecret) {
    const token = getSecret(source.secretName);
    // Default to "now" on first run so we only get new messages going forward.
    // Using '0' would pull the entire channel history.
    const oldest = adapterState.oldest || String(Date.now() / 1000);

    const params = new URLSearchParams({
      channel: source.channel,
      oldest,
      limit: '100',
      inclusive: 'false'
    });

    const resp = await fetch(`${API_BASE}/conversations.history?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(15000)
    });

    if (!resp.ok) {
      throw new Error(`Slack API HTTP ${resp.status}`);
    }

    const data = await resp.json();
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    const messages = data.messages || [];
    const items = [];
    let newestTs = oldest;

    for (const msg of messages) {
      // Skip bot messages unless explicitly included
      if (msg.subtype === 'bot_message' && !source.includeBots) continue;
      // Skip join/leave messages
      if (msg.subtype && ['channel_join', 'channel_leave', 'channel_topic'].includes(msg.subtype)) continue;

      const item = messageToItem(msg, source);
      if (item) {
        const authorName = item.author
          ? await this.resolveUserName(item.author, token)
          : '';
        item.author = authorName || item.author;
        item.description = await this.formatSlackText(item.description, token);
        item.title = await this.formatSlackText(item.title, token);
        // Add permalink to original Slack message
        const teamUrl = await this.getTeamUrl(token);
        if (teamUrl) {
          item.permalink = `${teamUrl}/archives/${source.channel}/p${msg.ts.replace('.', '')}`;
        }
        // Populate filterable fields
        item.fields = {
          channel: source.channel,
          isThread: !!(msg.thread_ts && msg.reply_count > 0),
          hasAttachments: (item.attachments?.length || 0) > 0,
          authorName: authorName || ''
        };
        items.push(item);
      }

      if (parseFloat(msg.ts) > parseFloat(newestTs)) {
        newestTs = msg.ts;
      }
    }

    return {
      items,
      state: { ...adapterState, oldest: newestTs }
    };
  }

  async pollReplies(source, threads, getSecret) {
    const token = getSecret(source.secretName);
    const results = [];

    for (const thread of threads) {
      try {
        const params = new URLSearchParams({
          channel: source.channel,
          ts: thread.parent_ts,
          limit: '100'
        });

        // Use cursor-based dedup: only fetch replies newer than last seen
        if (thread.last_reply_ts) {
          params.set('oldest', thread.last_reply_ts);
          params.set('inclusive', 'false');
        }

        const resp = await fetch(`${API_BASE}/conversations.replies?${params}`, {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: AbortSignal.timeout(15000)
        });

        if (!resp.ok) continue;

        const data = await resp.json();
        if (!data.ok) continue;

        const messages = data.messages || [];
        const replies = [];

        for (const msg of messages) {
          // Skip the parent message itself
          if (msg.ts === thread.parent_ts) continue;
          // If we had a cursor, the API already filters, but double-check
          if (thread.last_reply_ts && parseFloat(msg.ts) <= parseFloat(thread.last_reply_ts)) continue;

          const attachments = [];
          if (msg.files?.length > 0) {
            for (const file of msg.files) {
              attachments.push(makeAttachment(
                file.url_private_download || file.url_private,
                file.mimetype?.startsWith('image/') ? 'image' : 'file',
                file.name
              ));
            }
          }

          const author = msg.user
            ? await this.resolveUserName(msg.user, token)
            : 'unknown';
          const formattedText = await this.formatSlackText(msg.text || '', token);

          replies.push({
            text: formattedText,
            author,
            ts: msg.ts,
            timestamp: new Date(parseFloat(msg.ts) * 1000).toISOString(),
            attachments
          });
        }

        if (replies.length > 0) {
          results.push({ thread, replies });
        }
      } catch {
        // Skip this thread on error, don't break the whole loop
        continue;
      }
    }

    return results;
  }

  get supportsSend() {
    return true;
  }

  async send(target, message, getSecret) {
    const token = getSecret(target._secretName || 'slack');
    const body = {
      channel: target.channelId,
      text: message.text
    };
    if (target.threadId) {
      body.thread_ts = target.threadId;
    }
    const resp = await fetch(`${API_BASE}/chat.postMessage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`slack: send() failed ${resp.status}: ${text}`);
    }
    const data = await resp.json();
    if (!data.ok) {
      throw new Error(`slack: send() API error: ${data.error}`);
    }
  }

  async test(source, getSecret) {
    const validation = this.validate(source);
    if (!validation.valid) {
      return { ok: false, message: validation.error };
    }

    try {
      const token = getSecret(source.secretName);

      // Test auth
      const authResp = await fetch(`${API_BASE}/auth.test`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(10000)
      });
      const authData = await authResp.json();
      if (!authData.ok) {
        return { ok: false, message: `Auth failed: ${authData.error}` };
      }

      // Test channel access
      const params = new URLSearchParams({
        channel: source.channel,
        limit: '3'
      });
      const histResp = await fetch(`${API_BASE}/conversations.history?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(10000)
      });
      const histData = await histResp.json();
      if (!histData.ok) {
        return { ok: false, message: `Channel access failed: ${histData.error}` };
      }

      const sampleItems = (histData.messages || []).slice(0, 3).map(msg => ({
        id: msg.ts,
        title: (msg.text || '').slice(0, 100) || 'Empty message',
        timestamp: new Date(parseFloat(msg.ts) * 1000).toISOString()
      }));

      return {
        ok: true,
        message: `Connected as ${authData.user} to team ${authData.team}. Channel has ${histData.messages?.length || 0} recent messages.`,
        sampleItems
      };
    } catch (err) {
      return { ok: false, message: `Connection failed: ${err.message}` };
    }
  }
}

function messageToItem(msg, source) {
  const text = msg.text || '';
  if (!text && !msg.files?.length) return null;

  const firstLine = text.split('\n')[0];
  const title = (firstLine.length > 200 ? firstLine.slice(0, 200) + '...' : firstLine) || 'Slack message';
  const attachments = [];

  // Process file attachments
  if (msg.files?.length > 0) {
    for (const file of msg.files) {
      if (file.mimetype?.startsWith('image/')) {
        // Use url_private_download for files (requires token auth)
        attachments.push(makeAttachment(
          file.url_private_download || file.url_private,
          'image',
          file.name
        ));
      } else {
        attachments.push(makeAttachment(
          file.url_private_download || file.url_private,
          'file',
          file.name
        ));
      }
    }
  }

  return {
    id: `slack-${msg.ts}`,
    title,
    description: text,
    hash: null,
    author: msg.user || null,
    timestamp: new Date(parseFloat(msg.ts) * 1000).toISOString(),
    attachments,
    replyTo: (msg.thread_ts && msg.thread_ts !== msg.ts)
      ? { id: `slack-${msg.thread_ts}`, platform: 'slack' }
      : undefined,
    origin: {
      adapterType: 'slack',
      channelId: source.channel,
      senderId: msg.user || null,
      threadId: msg.ts,
      metadata: { hasThread: !!(msg.thread_ts && msg.reply_count > 0) }
    }
  };
}
