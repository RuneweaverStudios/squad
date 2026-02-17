import { BaseAdapter, makeAttachment } from '../base.js';
import { createSign, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as logger from '../../lib/logger.js';

const API_BASE = 'https://chat.googleapis.com/v1';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/chat.messages.readonly';

/** @type {import('../base.js').PluginMetadata} */
export const metadata = {
  type: 'googlechat',
  name: 'Google Chat',
  description: 'Ingest messages from Google Chat spaces via service account',
  version: '1.0.0',
  icon: {
    svg: 'M1.637 0C.733 0 0 .733 0 1.637v16.5c0 .904.733 1.636 1.637 1.636h3.955v3.323c0 .804.97 1.207 1.539.638l3.963-3.96h11.27c.903 0 1.636-.733 1.636-1.637V5.592L18.408 0zm3.955 5.592h12.816v8.59H8.455l-2.863 2.863z',
    viewBox: '0 0 24 24',
    fill: true,
    color: '#00AC47'
  },
  configFields: [
    {
      key: 'secretName',
      label: 'Credentials Secret',
      type: 'secret',
      required: true,
      helpText: 'Name of the secret containing the service account JSON key (stored in jat-secret). Value can be JSON content or a file path.'
    },
    {
      key: 'spaceIds',
      label: 'Space IDs',
      type: 'string',
      required: true,
      placeholder: 'spaces/AAAA1234,spaces/BBBB5678',
      helpText: 'Comma-separated Google Chat space resource names. The Chat app must be added to each space.'
    },
    {
      key: 'includeBotMessages',
      label: 'Include Bot Messages',
      type: 'boolean',
      default: false,
      helpText: 'Whether to ingest messages from Chat apps and bots'
    }
  ],
  itemFields: [
    { key: 'sender', label: 'Sender', type: 'string' },
    { key: 'spaceName', label: 'Space', type: 'string' },
    { key: 'isThread', label: 'Is Thread Reply', type: 'boolean' },
    { key: 'hasAttachments', label: 'Has Attachments', type: 'boolean' }
  ]
};

export default class GoogleChatAdapter extends BaseAdapter {
  constructor() {
    super('googlechat');
    this._cachedToken = null;
    this._tokenExpiresAt = 0;
  }

  /**
   * Parse credentials from secret value.
   * Supports both raw JSON content and a file path.
   */
  _parseCredentials(secretValue) {
    const trimmed = secretValue.trim();
    if (trimmed.startsWith('{')) {
      return JSON.parse(trimmed);
    }
    return JSON.parse(readFileSync(trimmed, 'utf-8'));
  }

  /**
   * Create a signed JWT for Google service account auth (RS256).
   */
  _createJWT(credentials) {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: credentials.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600
    };

    const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const unsigned = `${b64url(header)}.${b64url(payload)}`;

    const sign = createSign('RSA-SHA256');
    sign.update(unsigned);
    const signature = sign.sign(credentials.private_key, 'base64url');

    return `${unsigned}.${signature}`;
  }

  /**
   * Get or refresh access token using service account credentials.
   * Caches token for reuse across poll cycles (valid ~1 hour).
   */
  async _getAccessToken(credentials) {
    if (this._cachedToken && Date.now() < this._tokenExpiresAt - 300_000) {
      return this._cachedToken;
    }

    const jwt = this._createJWT(credentials);
    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      }),
      signal: AbortSignal.timeout(10000)
    });

    const data = await resp.json();
    if (data.error) {
      throw new Error(`OAuth error: ${data.error_description || data.error}`);
    }

    this._cachedToken = data.access_token;
    this._tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    return this._cachedToken;
  }

  validate(source) {
    if (!source.secretName) {
      return { valid: false, error: 'secretName is required (service account JSON key)' };
    }
    if (!source.spaceIds) {
      return { valid: false, error: 'spaceIds is required (comma-separated space resource names)' };
    }
    const spaces = parseSpaceIds(source.spaceIds);
    if (spaces.length === 0) {
      return { valid: false, error: 'At least one space ID is required' };
    }
    for (const space of spaces) {
      if (!space.startsWith('spaces/')) {
        return { valid: false, error: `Invalid space ID "${space}": must start with "spaces/" (e.g., spaces/AAAA1234)` };
      }
    }
    return { valid: true };
  }

  async poll(source, adapterState, getSecret) {
    const secretValue = getSecret(source.secretName);
    const credentials = this._parseCredentials(secretValue);
    const token = await this._getAccessToken(credentials);
    const spaces = parseSpaceIds(source.spaceIds);

    const allItems = [];
    const newState = { ...adapterState };

    for (const spaceId of spaces) {
      const stateKey = `cursor_${spaceId.replace(/\//g, '_')}`;
      // Default to "now" on first run (future-only, like Slack)
      const lastCreateTime = adapterState[stateKey] || new Date().toISOString();

      let newestTime = lastCreateTime;
      let pageToken = null;

      do {
        const params = new URLSearchParams({
          pageSize: '1000',
          orderBy: 'createTime asc',
          filter: `createTime > "${lastCreateTime}"`
        });
        if (pageToken) params.set('pageToken', pageToken);

        const url = `${API_BASE}/${spaceId}/messages?${params}`;
        const resp = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: AbortSignal.timeout(15000)
        });

        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          throw new Error(`Google Chat API HTTP ${resp.status} for ${spaceId}: ${errText}`);
        }

        const data = await resp.json();
        const messages = data.messages || [];

        for (const msg of messages) {
          // Skip bot messages unless configured to include
          if (!source.includeBotMessages && msg.sender?.type === 'BOT') continue;

          const item = messageToItem(msg, spaceId);
          if (item) allItems.push(item);

          if (msg.createTime && msg.createTime > newestTime) {
            newestTime = msg.createTime;
          }
        }

        pageToken = data.nextPageToken || null;
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
      const secretValue = getSecret(source.secretName);
      const credentials = this._parseCredentials(secretValue);
      const token = await this._getAccessToken(credentials);

      const spaces = parseSpaceIds(source.spaceIds);
      const sampleItems = [];
      const spaceNames = [];

      for (const spaceId of spaces) {
        // Verify space access
        const spaceResp = await fetch(`${API_BASE}/${spaceId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: AbortSignal.timeout(10000)
        });
        if (!spaceResp.ok) {
          return { ok: false, message: `Failed to access ${spaceId}: HTTP ${spaceResp.status}` };
        }
        const spaceData = await spaceResp.json();
        spaceNames.push(spaceData.displayName || spaceId);

        // Fetch a few recent messages as samples
        const params = new URLSearchParams({ pageSize: '3' });
        const msgResp = await fetch(`${API_BASE}/${spaceId}/messages?${params}`, {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: AbortSignal.timeout(10000)
        });
        if (!msgResp.ok) continue;

        const msgData = await msgResp.json();
        for (const msg of (msgData.messages || []).slice(0, 3)) {
          sampleItems.push({
            id: msg.name,
            title: (msg.text || '').slice(0, 100) || 'Empty message',
            timestamp: msg.createTime || ''
          });
        }
      }

      return {
        ok: true,
        message: `Connected as ${credentials.client_email}. Spaces: ${spaceNames.join(', ')}.`,
        sampleItems
      };
    } catch (err) {
      return { ok: false, message: `Connection failed: ${err.message}` };
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseSpaceIds(spaceIds) {
  return spaceIds.split(',').map(s => s.trim()).filter(Boolean);
}

function messageToItem(msg, spaceId) {
  const text = msg.text || msg.formattedText || '';
  if (!text && !(msg.attachment?.length > 0)) return null;

  const firstLine = text.split('\n')[0];
  const title = (firstLine.length > 200
    ? firstLine.slice(0, 200) + '...'
    : firstLine) || 'Google Chat message';

  const attachments = [];
  if (msg.attachment?.length > 0) {
    for (const att of msg.attachment) {
      attachments.push(makeAttachment(
        att.downloadUri || att.thumbnailUri || '',
        att.contentType?.startsWith('image/') ? 'image' : 'file',
        att.contentName || null
      ));
    }
  }

  const senderName = msg.sender?.displayName || msg.sender?.name || 'unknown';
  const msgId = msg.name?.split('/').pop() || '';
  const hashInput = `${msg.name}${text.slice(0, 200)}`;

  // Thread detection: top-level messages create threads where thread ID
  // matches the message ID; replies reference a different thread
  const threadId = msg.thread?.name?.split('/').pop() || '';
  const isThreadReply = threadId && msgId && threadId !== msgId;

  return {
    id: `gchat-${msgId}`,
    title,
    description: text,
    hash: createHash('sha256').update(hashInput).digest('hex').slice(0, 16),
    author: senderName,
    timestamp: msg.createTime || new Date().toISOString(),
    attachments,
    fields: {
      sender: senderName,
      spaceName: spaceId,
      isThread: isThreadReply,
      hasAttachments: attachments.length > 0
    }
  };
}
