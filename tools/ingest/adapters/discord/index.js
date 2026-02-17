import { BaseAdapter, makeAttachment } from '../base.js';
import { createHash } from 'node:crypto';

const API_BASE = 'https://discord.com/api/v10';

/** @type {import('../base.js').PluginMetadata} */
export const metadata = {
  type: 'discord',
  name: 'Discord',
  description: 'Ingest messages from Discord channels via bot API',
  version: '1.0.0',
  icon: {
    svg: 'M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z',
    viewBox: '0 0 24 24',
    fill: true,
    color: '#5865F2'
  },
  configFields: [
    {
      key: 'secretName',
      label: 'Bot Token Secret',
      type: 'secret',
      required: true,
      helpText: 'Name of the secret containing the Discord bot token (stored in jat-secret)'
    },
    {
      key: 'guildId',
      label: 'Server (Guild) ID',
      type: 'string',
      required: true,
      placeholder: '123456789012345678',
      helpText: 'Discord server ID (right-click server → Copy Server ID)'
    },
    {
      key: 'channelIds',
      label: 'Channel IDs',
      type: 'string',
      required: true,
      placeholder: '111111111111111111,222222222222222222',
      helpText: 'Comma-separated channel IDs to monitor'
    },
    {
      key: 'includeThreads',
      label: 'Include Threads',
      type: 'boolean',
      default: false,
      helpText: 'Also poll active threads in the configured channels'
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
    { key: 'author', label: 'Author', type: 'string' },
    { key: 'channelName', label: 'Channel', type: 'string' },
    { key: 'hasAttachments', label: 'Has Attachments', type: 'boolean' },
    { key: 'isThread', label: 'Is Thread', type: 'boolean' },
    {
      key: 'messageType',
      label: 'Message Type',
      type: 'enum',
      values: ['default', 'reply', 'thread']
    }
  ]
};

// Cache channel ID -> name across polls
const channelNameCache = new Map();

export default class DiscordAdapter extends BaseAdapter {
  constructor() {
    super('discord');
  }

  get supportsRealtime() {
    return true;
  }

  get supportsSend() {
    return true;
  }

  validate(source) {
    if (!source.secretName) {
      return { valid: false, error: 'secretName is required (Discord bot token)' };
    }
    if (!source.guildId) {
      return { valid: false, error: 'guildId is required (Discord server ID)' };
    }
    if (!source.channelIds) {
      return { valid: false, error: 'channelIds is required (comma-separated channel IDs)' };
    }
    const ids = parseChannelIds(source.channelIds);
    if (ids.length === 0) {
      return { valid: false, error: 'channelIds must contain at least one valid ID' };
    }
    return { valid: true };
  }

  async poll(source, adapterState, getSecret) {
    const token = getSecret(source.secretName);
    const channelIds = parseChannelIds(source.channelIds);
    // Per-channel cursor: { [channelId]: lastMessageId }
    const cursors = adapterState.cursors || {};
    const items = [];
    const newCursors = { ...cursors };

    for (const channelId of channelIds) {
      const channelItems = await this._pollChannel(
        channelId, cursors[channelId], token, source
      );
      for (const item of channelItems) {
        items.push(item);
        // Track highest message ID as cursor
        const rawId = item._discordMessageId;
        if (!newCursors[channelId] || BigInt(rawId) > BigInt(newCursors[channelId])) {
          newCursors[channelId] = rawId;
        }
      }
    }

    // Optionally poll active threads
    if (source.includeThreads) {
      for (const channelId of channelIds) {
        const threadItems = await this._pollThreads(
          channelId, source.guildId, cursors, token, source
        );
        for (const item of threadItems) {
          items.push(item);
          const threadId = item._discordChannelId;
          const rawId = item._discordMessageId;
          if (!newCursors[threadId] || BigInt(rawId) > BigInt(newCursors[threadId])) {
            newCursors[threadId] = rawId;
          }
        }
      }
    }

    // Strip internal tracking fields before returning
    for (const item of items) {
      delete item._discordMessageId;
      delete item._discordChannelId;
    }

    return {
      items,
      state: { ...adapterState, cursors: newCursors }
    };
  }

  async _pollChannel(channelId, afterId, token, source) {
    const params = new URLSearchParams({ limit: '100' });
    if (afterId) params.set('after', afterId);

    const resp = await discordFetch(`/channels/${channelId}/messages?${params}`, token);
    const messages = await resp.json();

    if (!Array.isArray(messages)) {
      const errMsg = messages.message || JSON.stringify(messages);
      throw new Error(`Discord API error for channel ${channelId}: ${errMsg}`);
    }

    // API returns newest-first; reverse to process chronologically
    messages.reverse();

    const channelName = await this._resolveChannelName(channelId, token);
    const items = [];

    for (const msg of messages) {
      if (msg.author?.bot && !source.includeBots) continue;

      const item = messageToItem(msg, channelName);
      if (item) items.push(item);
    }

    return items;
  }

  async _pollThreads(parentChannelId, guildId, cursors, token, source) {
    try {
      const resp = await discordFetch(
        `/guilds/${guildId}/threads/active`, token
      );
      const data = await resp.json();
      const threads = (data.threads || []).filter(
        t => t.parent_id === parentChannelId
      );

      const items = [];
      for (const thread of threads) {
        const threadItems = await this._pollChannel(
          thread.id, cursors[thread.id], token, source
        );
        for (const item of threadItems) {
          item.fields.isThread = true;
          item.fields.messageType = 'thread';
          item.fields.channelName = thread.name || item.fields.channelName;
          item._discordChannelId = thread.id;
          items.push(item);
        }
      }
      return items;
    } catch {
      // Thread polling is best-effort; don't fail the whole poll
      return [];
    }
  }

  async _resolveChannelName(channelId, token) {
    if (channelNameCache.has(channelId)) return channelNameCache.get(channelId);
    try {
      const resp = await discordFetch(`/channels/${channelId}`, token);
      const data = await resp.json();
      const name = data.name || channelId;
      channelNameCache.set(channelId, name);
      return name;
    } catch {
      return channelId;
    }
  }

  async test(source, getSecret) {
    const validation = this.validate(source);
    if (!validation.valid) {
      return { ok: false, message: validation.error };
    }

    try {
      const token = getSecret(source.secretName);

      // Verify bot token by fetching current user
      const meResp = await discordFetch('/users/@me', token);
      const me = await meResp.json();
      if (me.code || me.message) {
        return { ok: false, message: `Auth failed: ${me.message || 'invalid token'}` };
      }

      // Verify guild access
      const guildResp = await discordFetch(`/guilds/${source.guildId}`, token);
      const guild = await guildResp.json();
      if (guild.code || guild.message) {
        return { ok: false, message: `Guild access failed: ${guild.message || 'unknown error'}` };
      }

      // Test first channel access
      const channelIds = parseChannelIds(source.channelIds);
      const params = new URLSearchParams({ limit: '3' });
      const msgResp = await discordFetch(
        `/channels/${channelIds[0]}/messages?${params}`, token
      );
      const messages = await msgResp.json();

      if (!Array.isArray(messages)) {
        return { ok: false, message: `Channel access failed: ${messages.message || 'unknown error'}` };
      }

      const sampleItems = messages.slice(0, 3).map(msg => ({
        id: msg.id,
        title: (msg.content || '').slice(0, 100) || 'Empty message',
        timestamp: msg.timestamp
      }));

      return {
        ok: true,
        message: `Connected as ${me.username} to ${guild.name}. Channel has ${messages.length} recent messages.`,
        sampleItems
      };
    } catch (err) {
      return { ok: false, message: `Connection failed: ${err.message}` };
    }
  }

  // ─── Realtime stubs (future: Discord Gateway WebSocket) ─────────────

  async connect(_sourceConfig, _getSecret, _callbacks) {
    // Future: open Discord Gateway WebSocket connection
    // - Authenticate with bot token via Identify payload
    // - Subscribe to MESSAGE_CREATE events for configured channels
    // - Call callbacks.onMessage() for each new message
    // - Handle heartbeat, resume, reconnect
    throw new Error('discord: realtime not yet implemented (use polling mode)');
  }

  async disconnect() {
    // Future: close Gateway WebSocket gracefully
  }

  async send(target, message, getSecret) {
    const token = getSecret(target._secretName || 'discord');
    const channelId = target.channelId;
    if (!channelId) throw new Error('discord: send() requires target.channelId');

    const body = { content: message.text };
    if (target.threadId) {
      body.message_reference = { message_id: target.threadId };
    }

    const resp = await fetch(`${API_BASE}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(`discord: send() failed: ${err.message || resp.status}`);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function parseChannelIds(input) {
  if (!input) return [];
  return input
    .split(',')
    .map(id => id.trim())
    .filter(id => /^\d+$/.test(id));
}

async function discordFetch(path, token) {
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Authorization': `Bot ${token}`,
      'User-Agent': 'JAT-Ingest/1.0'
    },
    signal: AbortSignal.timeout(15000)
  });

  if (resp.status === 429) {
    const retryAfter = resp.headers.get('Retry-After');
    const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : 5000;
    await new Promise(r => setTimeout(r, waitMs));
    return discordFetch(path, token);
  }

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(`Discord API ${resp.status}: ${body.message || resp.statusText}`);
  }

  return resp;
}

function messageToItem(msg, channelName) {
  const text = msg.content || '';
  const hasEmbeds = (msg.embeds?.length || 0) > 0;
  const hasFiles = (msg.attachments?.length || 0) > 0;

  // Skip empty messages with no attachments or embeds
  if (!text && !hasFiles && !hasEmbeds) return null;

  const firstLine = text.split('\n')[0];
  const title = (firstLine.length > 200 ? firstLine.slice(0, 200) + '...' : firstLine)
    || 'Discord message';

  // Build description: message text + embed summaries
  let description = text;
  if (hasEmbeds) {
    const embedTexts = msg.embeds
      .map(e => [e.title, e.description].filter(Boolean).join(': '))
      .filter(Boolean);
    if (embedTexts.length > 0) {
      description += (description ? '\n\n' : '') + embedTexts.join('\n');
    }
  }

  // Process attachments
  const attachments = [];
  if (msg.attachments?.length > 0) {
    for (const att of msg.attachments) {
      const isImage = att.content_type?.startsWith('image/');
      attachments.push(makeAttachment(
        att.url,
        isImage ? 'image' : 'file',
        att.filename
      ));
    }
  }
  // Embed images
  if (msg.embeds?.length > 0) {
    for (const embed of msg.embeds) {
      if (embed.image?.url) {
        attachments.push(makeAttachment(embed.image.url, 'image'));
      }
      if (embed.thumbnail?.url) {
        attachments.push(makeAttachment(embed.thumbnail.url, 'image'));
      }
    }
  }

  const isReply = !!msg.message_reference;
  const authorName = msg.author?.global_name
    || msg.author?.username
    || 'unknown';

  const hash = createHash('sha256')
    .update(`discord-${msg.id}-${msg.channel_id}`)
    .digest('hex')
    .slice(0, 16);

  return {
    id: `discord-${msg.id}`,
    title,
    description,
    hash,
    author: authorName,
    timestamp: msg.timestamp,
    attachments,
    replyTo: msg.message_reference?.message_id
      ? `discord-${msg.message_reference.message_id}`
      : undefined,
    fields: {
      author: authorName,
      channelName,
      hasAttachments: attachments.length > 0,
      isThread: false,
      messageType: isReply ? 'reply' : 'default'
    },
    origin: {
      adapterType: 'discord',
      channelId: msg.channel_id,
      senderId: msg.author?.id || null,
      threadId: msg.id,
      metadata: { guildId: msg.guild_id || null }
    },
    // Internal tracking (stripped before returning from poll)
    _discordMessageId: msg.id,
    _discordChannelId: msg.channel_id
  };
}
