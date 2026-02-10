import { BaseAdapter } from '../base.js';
import { createHash } from 'node:crypto';
import tmi from 'tmi.js';

/** @type {import('../base.js').PluginMetadata} */
export const metadata = {
  type: 'twitch',
  name: 'Twitch Chat',
  description: 'Ingest messages from Twitch chat channels via IRC (tmi.js)',
  version: '1.0.0',
  configFields: [
    {
      key: 'secretName',
      label: 'OAuth Token Secret',
      type: 'secret',
      required: true,
      helpText: 'Name of the secret containing the Twitch OAuth token (stored in jat-secret). Token needs chat:read scope.'
    },
    {
      key: 'botUsername',
      label: 'Bot Username',
      type: 'string',
      required: true,
      placeholder: 'my_bot_account',
      helpText: 'Twitch username for the bot account'
    },
    {
      key: 'channels',
      label: 'Channels',
      type: 'string',
      required: true,
      placeholder: '#streamername, #otherchannel',
      helpText: 'Comma-separated Twitch channels to monitor (with or without #)'
    },
    {
      key: 'includeBots',
      label: 'Include Known Bots',
      type: 'boolean',
      default: false,
      helpText: 'Whether to ingest messages from known Twitch bots (Nightbot, StreamElements, etc.)'
    }
  ],
  itemFields: [
    { key: 'username', label: 'Username', type: 'string' },
    { key: 'displayName', label: 'Display Name', type: 'string' },
    { key: 'isMod', label: 'Is Moderator', type: 'boolean' },
    { key: 'isSubscriber', label: 'Is Subscriber', type: 'boolean' },
    { key: 'hasBits', label: 'Has Bits', type: 'boolean' },
    { key: 'emoteCount', label: 'Emote Count', type: 'number' }
  ],
  capabilities: {
    realtime: true
  }
};

// Known bot usernames to filter by default
const KNOWN_BOTS = new Set([
  'nightbot', 'streamelements', 'streamlabs', 'moobot',
  'fossabot', 'wizebot', 'deepbot', 'phantombot',
  'soundalerts', 'pokemoncommunitygame'
]);

export default class TwitchAdapter extends BaseAdapter {
  constructor() {
    super('twitch');
    /** @type {tmi.Client|null} */
    this._client = null;
    this._running = false;
    /** @type {import('../base.js').IngestItem[]} */
    this._buffer = [];
  }

  get supportsRealtime() {
    return true;
  }

  validate(source) {
    if (!source.secretName) {
      return { valid: false, error: 'secretName is required (Twitch OAuth token)' };
    }
    if (!source.botUsername) {
      return { valid: false, error: 'botUsername is required' };
    }
    if (!source.channels) {
      return { valid: false, error: 'channels is required (comma-separated channel names)' };
    }
    const channels = parseChannels(source.channels);
    if (channels.length === 0) {
      return { valid: false, error: 'channels must contain at least one valid channel name' };
    }
    return { valid: true };
  }

  async poll(source, adapterState, getSecret) {
    // Ensure we have an active connection (lazy-connect for poll mode)
    if (!this._client) {
      await this._connectInternal(source, getSecret);
    }

    // Drain the buffer
    const items = this._buffer.splice(0);

    return {
      items,
      state: { ...adapterState, lastPollAt: new Date().toISOString() }
    };
  }

  async test(source, getSecret) {
    const validation = this.validate(source);
    if (!validation.valid) {
      return { ok: false, message: validation.error };
    }

    try {
      const token = getSecret(source.secretName);
      const channels = parseChannels(source.channels);

      // Validate token by calling the Twitch API
      const resp = await fetch('https://id.twitch.tv/oauth2/validate', {
        headers: { 'Authorization': `OAuth ${token}` },
        signal: AbortSignal.timeout(10000)
      });

      if (!resp.ok) {
        return { ok: false, message: `OAuth token validation failed (HTTP ${resp.status})` };
      }

      const data = await resp.json();
      if (!data.login) {
        return { ok: false, message: 'OAuth token is invalid or expired' };
      }

      // Check scopes
      const scopes = data.scopes || [];
      const hasReadScope = scopes.includes('chat:read');

      return {
        ok: true,
        message: `Token valid for user "${data.login}" (${data.user_id}). Scopes: ${scopes.join(', ') || 'none'}. ${hasReadScope ? '' : 'Warning: missing chat:read scope.'}Channels: ${channels.join(', ')}.`
      };
    } catch (err) {
      return { ok: false, message: `Connection test failed: ${err.message}` };
    }
  }

  async connect(sourceConfig, getSecret, callbacks) {
    this._running = true;

    const token = getSecret(sourceConfig.secretName);
    const channels = parseChannels(sourceConfig.channels);

    const client = new tmi.Client({
      options: { debug: false },
      identity: {
        username: sourceConfig.botUsername,
        password: `oauth:${token.replace(/^oauth:/i, '')}`
      },
      channels,
      connection: {
        reconnect: true,
        secure: true
      }
    });

    this._client = client;

    client.on('message', (_channel, userstate, message, self) => {
      if (!this._running) return;
      if (self) return; // Ignore our own messages

      // Filter known bots unless explicitly included
      if (!sourceConfig.includeBots && KNOWN_BOTS.has(userstate.username?.toLowerCase())) {
        return;
      }

      const item = chatMessageToItem(userstate, message, _channel);
      callbacks.onMessage(item);
    });

    client.on('disconnected', (reason) => {
      if (this._running) {
        callbacks.onDisconnect(reason || 'disconnected');
      }
    });

    try {
      await client.connect();

      // Keep alive until disconnect() is called
      await new Promise((resolve) => {
        const check = setInterval(() => {
          if (!this._running) {
            clearInterval(check);
            resolve();
          }
        }, 1000);
      });
    } catch (err) {
      if (this._running) {
        callbacks.onError(err);
      }
    }
  }

  async disconnect() {
    this._running = false;
    if (this._client) {
      try {
        await this._client.disconnect();
      } catch { /* ignore */ }
      this._client = null;
    }
    this._buffer = [];
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  /**
   * Establish a persistent IRC connection for poll mode.
   * Messages are buffered internally and drained by poll().
   */
  async _connectInternal(source, getSecret) {
    const token = getSecret(source.secretName);
    const channels = parseChannels(source.channels);

    const client = new tmi.Client({
      options: { debug: false },
      identity: {
        username: source.botUsername,
        password: `oauth:${token.replace(/^oauth:/i, '')}`
      },
      channels,
      connection: {
        reconnect: true,
        secure: true
      }
    });

    this._client = client;

    client.on('message', (_channel, userstate, message, self) => {
      if (self) return;

      if (!source.includeBots && KNOWN_BOTS.has(userstate.username?.toLowerCase())) {
        return;
      }

      const item = chatMessageToItem(userstate, message, _channel);
      this._buffer.push(item);

      // Cap buffer to prevent memory leaks if polls are slow
      if (this._buffer.length > 10000) {
        this._buffer.splice(0, this._buffer.length - 10000);
      }
    });

    client.on('disconnected', () => {
      this._client = null;
    });

    await client.connect();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function parseChannels(input) {
  if (!input) return [];
  return input
    .split(',')
    .map(ch => {
      const trimmed = ch.trim().toLowerCase();
      // Strip # prefix if present, tmi.js adds it automatically
      return trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    })
    .filter(ch => ch.length > 0);
}

/**
 * Convert a tmi.js chat message into an IngestItem.
 */
function chatMessageToItem(userstate, message, channel) {
  const username = userstate.username || 'unknown';
  const displayName = userstate['display-name'] || username;
  const isMod = userstate.mod || false;
  const isSubscriber = userstate.subscriber || false;
  const bits = parseInt(userstate.bits || '0', 10);
  const hasBits = bits > 0;

  // Count emotes
  const emotes = userstate.emotes || {};
  let emoteCount = 0;
  for (const positions of Object.values(emotes)) {
    emoteCount += Array.isArray(positions) ? positions.length : 1;
  }

  // Build title: truncated first line of message
  const firstLine = message.split('\n')[0];
  const title = firstLine.length > 200
    ? firstLine.slice(0, 200) + '...'
    : firstLine || 'Twitch message';

  // Build description with context
  let description = message;
  if (hasBits) {
    description = `[${bits} bits] ${description}`;
  }

  const msgId = userstate.id || `${username}-${Date.now()}`;
  const timestamp = userstate['tmi-sent-ts']
    ? new Date(parseInt(userstate['tmi-sent-ts'], 10)).toISOString()
    : new Date().toISOString();

  const hash = createHash('sha256')
    .update(`twitch-${msgId}`)
    .digest('hex')
    .slice(0, 16);

  // Clean channel name (remove # if present)
  const cleanChannel = channel.startsWith('#') ? channel.slice(1) : channel;

  return {
    id: `twitch-${msgId}`,
    title,
    description,
    hash,
    author: displayName,
    timestamp,
    fields: {
      username,
      displayName,
      isMod,
      isSubscriber,
      hasBits,
      emoteCount
    },
    origin: {
      adapterType: 'twitch',
      channelId: cleanChannel,
      senderId: userstate['user-id'] || username,
      threadId: null,
      metadata: {
        badges: userstate.badges || {},
        color: userstate.color || null,
        bits: hasBits ? bits : undefined
      }
    }
  };
}
