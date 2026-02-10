import { BaseAdapter } from '../base.js';
import { createHash } from 'node:crypto';
import { SimplePool } from 'nostr-tools/pool';
import { decode as nip19Decode } from 'nostr-tools/nip19';

// Nostr event kind constants
const KIND_TEXT_NOTE = 1;
const KIND_DM = 4;
const KIND_REPOST = 6;
const KIND_REACTION = 7;

const KIND_MAP = {
  text_note: KIND_TEXT_NOTE,
  dm: KIND_DM,
  repost: KIND_REPOST,
  reaction: KIND_REACTION
};

const KIND_LABEL = {
  [KIND_TEXT_NOTE]: 'text_note',
  [KIND_DM]: 'dm',
  [KIND_REPOST]: 'repost',
  [KIND_REACTION]: 'reaction'
};

// URL pattern for images embedded in note content
const IMAGE_URL_RE = /https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp|svg)(?:\?\S*)?/gi;

/** @type {import('../base.js').PluginMetadata} */
export const metadata = {
  type: 'nostr',
  name: 'Nostr',
  description: 'Ingest events from Nostr relays via WebSocket subscriptions',
  version: '1.0.0',
  configFields: [
    {
      key: 'relays',
      label: 'Relay URLs',
      type: 'string',
      required: true,
      placeholder: 'wss://relay.damus.io, wss://nos.lol',
      helpText: 'Comma-separated Nostr relay WebSocket URLs (wss://)'
    },
    {
      key: 'pubkeys',
      label: 'Public Keys',
      type: 'string',
      required: false,
      placeholder: 'npub1..., hex64...',
      helpText: 'Comma-separated author pubkeys to follow (hex or npub format). Leave empty for all.'
    },
    {
      key: 'kinds',
      label: 'Event Kinds',
      type: 'multiselect',
      required: false,
      default: ['text_note'],
      options: [
        { value: 'text_note', label: 'Text Note (kind:1)' },
        { value: 'dm', label: 'DM (kind:4)' },
        { value: 'repost', label: 'Repost (kind:6)' },
        { value: 'reaction', label: 'Reaction (kind:7)' }
      ],
      helpText: 'Event kinds to ingest'
    },
    {
      key: 'hashtags',
      label: 'Hashtags',
      type: 'string',
      required: false,
      placeholder: 'bitcoin, nostr, tech',
      helpText: 'Comma-separated hashtags to filter by (without #)'
    }
  ],
  itemFields: [
    { key: 'author', label: 'Author', type: 'string' },
    { key: 'authorPubkey', label: 'Author Pubkey', type: 'string' },
    {
      key: 'kind',
      label: 'Kind',
      type: 'enum',
      values: ['text_note', 'dm', 'repost', 'reaction']
    },
    { key: 'hasMedia', label: 'Has Media', type: 'boolean' }
  ],
  capabilities: {
    realtime: true
  }
};

export default class NostrAdapter extends BaseAdapter {
  constructor() {
    super('nostr');
    this._pool = null;
    this._running = false;
    this._subscriptions = [];
  }

  get supportsRealtime() {
    return true;
  }

  validate(source) {
    if (!source.relays) {
      return { valid: false, error: 'relays is required (comma-separated wss:// URLs)' };
    }
    const relays = parseRelays(source.relays);
    if (relays.length === 0) {
      return { valid: false, error: 'At least one valid relay URL is required (wss://)' };
    }
    for (const url of relays) {
      if (!url.startsWith('wss://') && !url.startsWith('ws://')) {
        return { valid: false, error: `Invalid relay URL: ${url} (must start with wss:// or ws://)` };
      }
    }
    // Validate pubkeys if provided
    if (source.pubkeys) {
      const pubkeys = parsePubkeys(source.pubkeys);
      for (const pk of pubkeys) {
        if (!/^[0-9a-f]{64}$/.test(pk)) {
          return { valid: false, error: `Invalid pubkey: ${pk} (must be 64-char hex or npub format)` };
        }
      }
    }
    return { valid: true };
  }

  async poll(source, adapterState, _getSecret) {
    const relays = parseRelays(source.relays);
    const filter = buildFilter(source);
    const since = adapterState.since || null;

    if (since) {
      filter.since = since;
    }
    // Limit to 200 events per poll to avoid overwhelming
    filter.limit = 200;

    const pool = new SimplePool();
    try {
      const events = await pool.querySync(relays, filter);

      // Sort chronologically (oldest first)
      events.sort((a, b) => a.created_at - b.created_at);

      const items = events.map(event => eventToItem(event));

      // New cursor: latest event timestamp + 1 (to avoid re-fetching it)
      let newSince = since;
      if (events.length > 0) {
        newSince = events[events.length - 1].created_at + 1;
      }

      return {
        items,
        state: { ...adapterState, since: newSince }
      };
    } finally {
      pool.close(relays);
    }
  }

  async test(source, _getSecret) {
    const validation = this.validate(source);
    if (!validation.valid) {
      return { ok: false, message: validation.error };
    }

    try {
      const relays = parseRelays(source.relays);
      const filter = buildFilter(source);
      filter.limit = 5;

      const pool = new SimplePool();
      try {
        const events = await pool.querySync(relays, filter);

        if (events.length === 0) {
          return {
            ok: true,
            message: `Connected to ${relays.length} relay(s). No events matched the current filter.`
          };
        }

        const sampleItems = events
          .sort((a, b) => b.created_at - a.created_at)
          .slice(0, 3)
          .map(e => ({
            id: e.id.slice(0, 16),
            title: (e.content || '').slice(0, 100) || `kind:${e.kind} event`,
            timestamp: new Date(e.created_at * 1000).toISOString()
          }));

        return {
          ok: true,
          message: `Connected to ${relays.length} relay(s). Found ${events.length} matching events.`,
          sampleItems
        };
      } finally {
        pool.close(relays);
      }
    } catch (err) {
      return { ok: false, message: `Connection failed: ${err.message}` };
    }
  }

  async connect(sourceConfig, _getSecret, callbacks) {
    const relays = parseRelays(sourceConfig.relays);
    const filter = buildFilter(sourceConfig);
    // Only get events from now onwards for realtime
    filter.since = Math.floor(Date.now() / 1000);

    this._pool = new SimplePool();
    this._running = true;

    try {
      const sub = this._pool.subscribeMany(relays, [filter], {
        onevent: (event) => {
          if (!this._running) return;
          const item = eventToItem(event);
          callbacks.onMessage(item);
        },
        oneose: () => {
          // End of stored events - now streaming live
        }
      });

      this._subscriptions.push(sub);

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

    callbacks.onDisconnect('stopped');
  }

  async disconnect() {
    this._running = false;
    for (const sub of this._subscriptions) {
      try { sub.close(); } catch { /* ignore */ }
    }
    this._subscriptions = [];
    if (this._pool) {
      try {
        const relays = [...(this._pool._relays?.keys?.() || [])];
        if (relays.length > 0) this._pool.close(relays);
      } catch { /* ignore */ }
      this._pool = null;
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function parseRelays(input) {
  if (!input) return [];
  return input
    .split(',')
    .map(s => s.trim())
    .filter(s => s.startsWith('wss://') || s.startsWith('ws://'));
}

/**
 * Parse pubkeys from comma-separated input.
 * Accepts both hex (64-char) and npub (bech32) formats.
 */
function parsePubkeys(input) {
  if (!input) return [];
  return input
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(pk => {
      // npub format: decode to hex
      if (pk.startsWith('npub1')) {
        try {
          const decoded = nip19Decode(pk);
          if (decoded.type === 'npub') return decoded.data;
        } catch {
          // Fall through to return as-is
        }
      }
      return pk;
    });
}

function parseHashtags(input) {
  if (!input) return [];
  return input
    .split(',')
    .map(s => s.trim().replace(/^#/, '').toLowerCase())
    .filter(Boolean);
}

/**
 * Build a nostr-tools filter from source config.
 */
function buildFilter(source) {
  const filter = {};

  // Event kinds
  const kinds = Array.isArray(source.kinds) && source.kinds.length > 0
    ? source.kinds
    : ['text_note'];
  filter.kinds = kinds.map(k => KIND_MAP[k]).filter(n => n !== undefined);

  // Author pubkeys
  const pubkeys = parsePubkeys(source.pubkeys);
  if (pubkeys.length > 0) {
    filter.authors = pubkeys;
  }

  // Hashtag filter (NIP-12: #t tag)
  const hashtags = parseHashtags(source.hashtags);
  if (hashtags.length > 0) {
    filter['#t'] = hashtags;
  }

  return filter;
}

/**
 * Convert a Nostr event to an IngestItem.
 */
function eventToItem(event) {
  const content = event.content || '';
  const kindLabel = KIND_LABEL[event.kind] || `kind_${event.kind}`;
  const shortPubkey = event.pubkey.slice(0, 8) + '...' + event.pubkey.slice(-8);

  // Extract display name from profile metadata if available in tags
  const authorName = extractAuthorName(event) || shortPubkey;

  // Detect image URLs in content
  const imageUrls = content.match(IMAGE_URL_RE) || [];
  const hasMedia = imageUrls.length > 0;
  const attachments = imageUrls.map(url => ({ url, type: 'image', filename: null }));

  // Build title from first line of content
  let title;
  if (event.kind === KIND_REACTION) {
    title = `Reaction: ${content || '+'}`;
  } else if (event.kind === KIND_REPOST) {
    title = 'Repost';
  } else if (event.kind === KIND_DM) {
    title = '[Encrypted DM]';
  } else {
    const firstLine = content.split('\n')[0];
    title = firstLine.length > 200 ? firstLine.slice(0, 200) + '...' : firstLine;
    title = title || `kind:${event.kind} event`;
  }

  // Build description
  let description = content;
  if (event.kind === KIND_REPOST && !content) {
    // Repost: the reposted event ID is in the 'e' tag
    const eTag = event.tags.find(t => t[0] === 'e');
    description = eTag ? `Repost of event ${eTag[1]}` : 'Repost';
  }

  // NIP-10: detect reply via 'e' tag with 'reply' marker (or last 'e' tag as fallback)
  let replyTo;
  const eTags = event.tags.filter(t => t[0] === 'e');
  const replyTag = eTags.find(t => t[3] === 'reply');
  const parentEventId = replyTag ? replyTag[1] : (eTags.length > 0 ? eTags[eTags.length - 1][1] : null);
  if (parentEventId) {
    replyTo = `nostr-${parentEventId}`;
  }

  const hash = createHash('sha256')
    .update(`nostr-${event.id}`)
    .digest('hex')
    .slice(0, 16);

  return {
    id: `nostr-${event.id}`,
    title,
    description,
    hash,
    author: authorName,
    timestamp: new Date(event.created_at * 1000).toISOString(),
    attachments: attachments.length > 0 ? attachments : undefined,
    replyTo,
    fields: {
      author: authorName,
      authorPubkey: event.pubkey,
      kind: kindLabel,
      hasMedia
    },
    origin: {
      adapterType: 'nostr',
      channelId: null,
      senderId: event.pubkey,
      threadId: event.id,
      metadata: null
    }
  };
}

/**
 * Try to extract author display name from event tags.
 * Some clients include a 'client' tag; NIP-31 mentions 'alt' tag.
 * No reliable name extraction without a profile lookup, so we use shortened pubkey.
 */
function extractAuthorName(event) {
  // Check if there's a delegation tag with a profile name (rare)
  // For most cases, we just return null and use shortened pubkey
  return null;
}
