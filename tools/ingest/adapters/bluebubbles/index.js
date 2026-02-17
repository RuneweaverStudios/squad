import { BaseAdapter, makeAttachment } from '../base.js';

/** @type {import('../base.js').PluginMetadata} */
export const metadata = {
  type: 'bluebubbles',
  name: 'BlueBubbles (iMessage)',
  description: 'Ingest iMessage conversations via BlueBubbles server REST API',
  version: '1.0.0',
  icon: {
    svg: 'M5.285 0A5.273 5.273 0 000 5.285v13.43A5.273 5.273 0 005.285 24h13.43A5.273 5.273 0 0024 18.715V5.285A5.273 5.273 0 0018.715 0ZM12 4.154a8.809 7.337 0 018.809 7.338A8.809 7.337 0 0112 18.828a8.809 7.337 0 01-2.492-.303A8.656 7.337 0 015.93 19.93a9.929 7.337 0 001.54-2.155 8.809 7.337 0 01-4.279-6.283A8.809 7.337 0 0112 4.154',
    viewBox: '0 0 24 24',
    fill: true,
    color: '#34DA50'
  },
  configFields: [
    {
      key: 'serverUrl',
      label: 'Server URL',
      type: 'string',
      required: true,
      placeholder: 'http://192.168.1.100:1234',
      helpText: 'BlueBubbles server URL (e.g. http://host:port or https://your-server.ngrok.io)'
    },
    {
      key: 'secretName',
      label: 'Server Password Secret',
      type: 'secret',
      required: true,
      helpText: 'Name of the secret containing the BlueBubbles server password (stored in jat-secret)'
    },
    {
      key: 'chatFilter',
      label: 'Chat Filter',
      type: 'select',
      default: 'all',
      options: [
        { value: 'all', label: 'All chats' },
        { value: 'groups', label: 'Group chats only' },
        { value: 'dms', label: 'Direct messages only' }
      ],
      helpText: 'Which chat types to ingest'
    },
    {
      key: 'specificChats',
      label: 'Specific Chats',
      type: 'string',
      placeholder: '+15555550123, chat12345',
      helpText: 'Comma-separated chat identifiers to limit ingestion (leave blank for all)'
    }
  ],
  itemFields: [
    { key: 'sender', label: 'Sender', type: 'string' },
    { key: 'isGroup', label: 'Is Group', type: 'boolean' },
    { key: 'groupName', label: 'Group Name', type: 'string' },
    { key: 'hasAttachments', label: 'Has Attachments', type: 'boolean' },
    { key: 'isFromMe', label: 'From Me', type: 'boolean' }
  ]
};

export default class BlueBubblesAdapter extends BaseAdapter {
  constructor() {
    super('bluebubbles');
  }

  get supportsRealtime() {
    return true;
  }

  validate(source) {
    if (!source.serverUrl) {
      return { valid: false, error: 'serverUrl is required (BlueBubbles server URL)' };
    }
    if (!source.secretName) {
      return { valid: false, error: 'secretName is required (BlueBubbles server password)' };
    }
    try {
      new URL(source.serverUrl);
    } catch {
      return { valid: false, error: 'serverUrl must be a valid URL' };
    }
    return { valid: true };
  }

  async poll(source, adapterState, getSecret) {
    const password = getSecret(source.secretName);
    const baseUrl = source.serverUrl.replace(/\/$/, '');

    // Use epoch ms timestamp cursor; default to "now" on first run
    const after = adapterState.after || Date.now();

    const body = {
      after,
      sort: 'ASC',
      limit: 100,
      with: ['chat', 'attachment', 'handle']
    };

    // Filter to a specific chat if configured
    const specificChats = parseSpecificChats(source.specificChats);
    if (specificChats.length === 1) {
      body.chatGuid = specificChats[0];
    }

    const resp = await fetch(`${baseUrl}/api/v1/message/query?password=${encodeURIComponent(password)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`BlueBubbles API ${resp.status}: ${text}`);
    }

    const data = await resp.json();
    const messages = data.data || [];
    const items = [];
    let newestTs = after;

    for (const msg of messages) {
      // Skip service/system messages
      if (msg.isServiceMessage || msg.isSystemMessage) continue;

      // Skip tapback/reaction messages (they reference another message)
      if (msg.associatedMessageGuid && msg.associatedMessageType) continue;

      // Determine chat properties from first chat entry
      const chat = msg.chats?.[0] || {};
      const chatGuid = chat.guid || '';
      const isGroup = chatGuid.includes(';+;');

      // Apply chat type filter
      if (source.chatFilter === 'groups' && !isGroup) continue;
      if (source.chatFilter === 'dms' && isGroup) continue;

      // Apply specific chats filter (if multiple were configured)
      if (specificChats.length > 1 && !matchesSpecificChat(chatGuid, specificChats)) continue;

      const item = messageToItem(msg, chat, isGroup, baseUrl, password);
      if (item) {
        items.push(item);
      }

      if (msg.dateCreated > newestTs) {
        newestTs = msg.dateCreated;
      }
    }

    return {
      items,
      state: { ...adapterState, after: newestTs }
    };
  }

  async test(source, getSecret) {
    const validation = this.validate(source);
    if (!validation.valid) {
      return { ok: false, message: validation.error };
    }

    try {
      const password = getSecret(source.secretName);
      const baseUrl = source.serverUrl.replace(/\/$/, '');

      // Test connectivity with ping
      const pingResp = await fetch(`${baseUrl}/api/v1/ping?password=${encodeURIComponent(password)}`, {
        signal: AbortSignal.timeout(10000)
      });

      if (!pingResp.ok) {
        return { ok: false, message: `Server responded with ${pingResp.status}` };
      }

      // Fetch a few recent messages as sample
      const queryResp = await fetch(`${baseUrl}/api/v1/message/query?password=${encodeURIComponent(password)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sort: 'DESC',
          limit: 3,
          with: ['chat', 'handle']
        }),
        signal: AbortSignal.timeout(10000)
      });

      if (!queryResp.ok) {
        return { ok: false, message: `Message query failed with ${queryResp.status}` };
      }

      const data = await queryResp.json();
      const msgs = data.data || [];

      const sampleItems = msgs.map(msg => ({
        id: msg.guid,
        title: (msg.text || '').slice(0, 100) || 'Empty message',
        timestamp: new Date(msg.dateCreated).toISOString()
      }));

      return {
        ok: true,
        message: `Connected to BlueBubbles server. Found ${msgs.length} recent message(s).`,
        sampleItems
      };
    } catch (err) {
      return { ok: false, message: `Connection failed: ${err.message}` };
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a BlueBubbles message object to an IngestItem.
 *
 * @param {Object} msg - BlueBubbles message
 * @param {Object} chat - Associated chat object
 * @param {boolean} isGroup - Whether this is a group chat
 * @param {string} baseUrl - Server base URL (for attachment downloads)
 * @param {string} password - Server password (for attachment auth)
 * @returns {import('../base.js').IngestItem | null}
 */
function messageToItem(msg, chat, isGroup, baseUrl, password) {
  const text = msg.text || '';
  const hasAttachments = (msg.attachments?.length || 0) > 0;

  if (!text && !hasAttachments) return null;

  // Build attachment list
  const attachments = [];
  if (msg.attachments?.length > 0) {
    for (const att of msg.attachments) {
      if (att.guid) {
        const downloadUrl = `${baseUrl}/api/v1/attachment/${encodeURIComponent(att.guid)}/download?password=${encodeURIComponent(password)}`;
        const type = att.mimeType?.startsWith('image/') ? 'image' : 'file';
        attachments.push(makeAttachment(downloadUrl, type, att.transferName || null));
      }
    }
  }

  // Sender address from handle
  const sender = msg.isFromMe
    ? 'me'
    : (msg.handle?.address || 'unknown');

  const firstLine = text.split('\n')[0];
  const title = (firstLine.length > 200 ? firstLine.slice(0, 200) + '...' : firstLine) || 'iMessage';

  return {
    id: `bb-${msg.guid}`,
    title,
    description: text,
    hash: null,
    author: sender,
    timestamp: new Date(msg.dateCreated).toISOString(),
    attachments,
    fields: {
      sender,
      isGroup,
      groupName: isGroup ? (chat.displayName || '') : '',
      hasAttachments,
      isFromMe: !!msg.isFromMe
    }
  };
}

/**
 * Parse comma-separated specific chat identifiers.
 * Users may enter phone numbers, emails, or full chat GUIDs.
 *
 * @param {string} [raw]
 * @returns {string[]}
 */
function parseSpecificChats(raw) {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Check if a chat GUID matches any of the specific chat identifiers.
 * Matches either exact GUID or partial identifier within the GUID.
 *
 * @param {string} chatGuid - e.g. "iMessage;-;+15555550123" or "iMessage;+;chat12345"
 * @param {string[]} filters - User-provided identifiers
 * @returns {boolean}
 */
function matchesSpecificChat(chatGuid, filters) {
  for (const filter of filters) {
    if (chatGuid === filter) return true;
    // Allow partial match: user enters "+15555550123" which appears in "iMessage;-;+15555550123"
    if (chatGuid.includes(filter)) return true;
  }
  return false;
}
