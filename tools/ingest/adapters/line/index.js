import { BaseAdapter, makeAttachment } from '../base.js';
import { createHash, createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import * as logger from '../../lib/logger.js';

const API_BASE = 'https://api.line.me/v2';
const DATA_API = 'https://api-data.line.me/v2';
const DEFAULT_WEBHOOK_PORT = 3400;

/** @type {import('../base.js').PluginMetadata} */
export const metadata = {
  type: 'line',
  name: 'LINE',
  description: 'Ingest messages from LINE via Messaging API webhook',
  version: '1.0.0',
  capabilities: { realtime: true, send: true },
  configFields: [
    {
      key: 'channelAccessTokenSecret',
      label: 'Channel Access Token Secret',
      type: 'secret',
      required: true,
      helpText: 'Name of the secret containing the LINE channel access token (stored in jat-secret)'
    },
    {
      key: 'channelSecretSecret',
      label: 'Channel Secret Secret',
      type: 'secret',
      required: true,
      helpText: 'Name of the secret containing the LINE channel secret for webhook signature verification (stored in jat-secret)'
    },
    {
      key: 'webhookPort',
      label: 'Webhook Port',
      type: 'number',
      required: false,
      default: DEFAULT_WEBHOOK_PORT,
      helpText: `HTTP port for receiving LINE webhook events (default: ${DEFAULT_WEBHOOK_PORT})`
    },
    {
      key: 'webhookPath',
      label: 'Webhook Path',
      type: 'string',
      required: false,
      default: '/webhook',
      placeholder: '/webhook',
      helpText: 'URL path for the webhook endpoint (default: /webhook)'
    }
  ],
  itemFields: [
    { key: 'sender', label: 'Sender ID', type: 'string' },
    { key: 'senderName', label: 'Sender Name', type: 'string' },
    { key: 'isGroup', label: 'Is Group', type: 'boolean' },
    { key: 'groupName', label: 'Group Name', type: 'string' },
    {
      key: 'messageType',
      label: 'Message Type',
      type: 'enum',
      values: ['text', 'image', 'video', 'sticker', 'audio', 'file', 'location']
    }
  ]
};

export default class LineAdapter extends BaseAdapter {
  constructor() {
    super('line');
    /** @type {import('node:http').Server | null} */
    this._server = null;
    /** @type {import('../base.js').IngestItem[]} */
    this._buffer = [];
    /** @type {import('../base.js').RealtimeCallbacks | null} */
    this._callbacks = null;
    /** @type {string} */
    this._channelSecret = '';
    /** @type {string} */
    this._channelAccessToken = '';
    /** @type {Map<string, string>} Profile name cache */
    this._profileCache = new Map();
    /** @type {Map<string, string>} Group name cache */
    this._groupCache = new Map();
  }

  get supportsRealtime() {
    return true;
  }

  get supportsSend() {
    return true;
  }

  // ─── Validate ─────────────────────────────────────────────────────────

  validate(source) {
    if (!source.channelAccessTokenSecret) {
      return { valid: false, error: 'channelAccessTokenSecret is required' };
    }
    if (!source.channelSecretSecret) {
      return { valid: false, error: 'channelSecretSecret is required' };
    }
    const port = source.webhookPort || DEFAULT_WEBHOOK_PORT;
    if (typeof port !== 'number' || port < 1 || port > 65535) {
      return { valid: false, error: 'webhookPort must be between 1 and 65535' };
    }
    return { valid: true };
  }

  // ─── Webhook Server ───────────────────────────────────────────────────

  /**
   * Ensure the webhook HTTP server is running.
   * @param {Object} source
   * @param {(name: string) => string} getSecret
   */
  async _ensureServer(source, getSecret) {
    if (this._server) return;

    this._channelAccessToken = getSecret(source.channelAccessTokenSecret);
    this._channelSecret = getSecret(source.channelSecretSecret);

    const port = source.webhookPort || DEFAULT_WEBHOOK_PORT;
    const path = source.webhookPath || '/webhook';

    this._server = createServer((req, res) => {
      if (req.method === 'POST' && req.url === path) {
        this._handleWebhook(req, res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    await new Promise((resolve, reject) => {
      this._server.once('error', reject);
      this._server.listen(port, () => {
        logger.info(`LINE webhook server listening on port ${port}${path}`);
        resolve();
      });
    });
  }

  /**
   * Handle an incoming LINE webhook request.
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  _handleWebhook(req, res) {
    const chunks = [];

    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      const body = Buffer.concat(chunks);

      // Verify signature
      const signature = req.headers['x-line-signature'];
      if (!signature || !this._verifySignature(body, signature)) {
        logger.warn('LINE webhook: invalid signature');
        res.writeHead(403);
        res.end('Invalid signature');
        return;
      }

      // Respond 200 immediately (LINE expects fast response)
      res.writeHead(200);
      res.end('OK');

      // Process events asynchronously
      try {
        const payload = JSON.parse(body.toString('utf8'));
        await this._processEvents(payload.events || []);
      } catch (err) {
        logger.warn(`LINE webhook processing error: ${err.message}`);
      }
    });
  }

  /**
   * Verify LINE webhook signature using HMAC-SHA256.
   * @param {Buffer} body
   * @param {string} signature
   * @returns {boolean}
   */
  _verifySignature(body, signature) {
    const hmac = createHmac('sha256', this._channelSecret);
    hmac.update(body);
    const digest = hmac.digest('base64');
    return digest === signature;
  }

  /**
   * Process an array of LINE webhook events.
   * @param {Object[]} events
   */
  async _processEvents(events) {
    for (const event of events) {
      if (event.type !== 'message') continue;

      try {
        const item = await this._eventToItem(event);
        if (!item) continue;

        if (this._callbacks) {
          this._callbacks.onMessage(item);
        } else {
          this._buffer.push(item);
        }
      } catch (err) {
        logger.warn(`LINE event processing error: ${err.message}`);
      }
    }
  }

  // ─── Event → Item Conversion ──────────────────────────────────────────

  /**
   * Convert a LINE message event to an IngestItem.
   * @param {Object} event
   * @returns {Promise<import('../base.js').IngestItem | null>}
   */
  async _eventToItem(event) {
    const msg = event.message;
    if (!msg) return null;

    const source = event.source || {};
    const isGroup = source.type === 'group' || source.type === 'room';
    const senderId = source.userId || '';

    // Get sender display name
    const senderName = await this._getProfileName(senderId, source);

    // Get group name
    let groupName = '';
    if (isGroup && source.groupId) {
      groupName = await this._getGroupName(source.groupId);
    }

    // Extract text and attachments based on message type
    let text = '';
    let messageType = msg.type || 'text';
    const attachments = [];

    switch (msg.type) {
      case 'text':
        text = msg.text || '';
        break;

      case 'image':
      case 'video':
      case 'audio':
      case 'file': {
        const contentUrl = `${DATA_API}/bot/message/${msg.id}/content`;
        attachments.push(makeAttachment(
          contentUrl,
          msg.type === 'image' ? 'image' : 'file',
          msg.fileName || null
        ));
        text = msg.text || '';
        break;
      }

      case 'sticker':
        text = `[Sticker: ${msg.packageId}/${msg.stickerId}]`;
        break;

      case 'location':
        text = `[Location: ${msg.title || ''} ${msg.address || ''} (${msg.latitude}, ${msg.longitude})]`.trim();
        messageType = 'location';
        break;

      default:
        return null;
    }

    // Skip empty messages with no attachments
    if (!text && attachments.length === 0) return null;

    const timestamp = event.timestamp
      ? new Date(event.timestamp).toISOString()
      : new Date().toISOString();

    const firstLine = text.split('\n')[0];
    const title = firstLine
      ? (firstLine.length > 200 ? firstLine.slice(0, 200) + '...' : firstLine)
      : `LINE ${messageType}`;

    const hashInput = `${msg.id}:${senderId}:${text.slice(0, 200)}`;
    const hash = createHash('sha256').update(hashInput).digest('hex').slice(0, 16);

    return {
      id: `line-${msg.id}`,
      title,
      description: text,
      hash,
      author: senderName || senderId,
      timestamp,
      attachments,
      fields: {
        sender: senderId,
        senderName: senderName || '',
        isGroup,
        groupName,
        messageType
      }
    };
  }

  // ─── LINE API Helpers ─────────────────────────────────────────────────

  /**
   * Make an authenticated request to the LINE API.
   * @param {string} url
   * @param {Object} [options]
   * @returns {Promise<Response>}
   */
  _apiRequest(url, options = {}) {
    return fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this._channelAccessToken}`,
        ...options.headers
      },
      signal: AbortSignal.timeout(10000)
    });
  }

  /**
   * Get a user's display name. Caches results.
   * @param {string} userId
   * @param {Object} source - Event source object (for group context)
   * @returns {Promise<string>}
   */
  async _getProfileName(userId, source) {
    if (!userId) return '';
    if (this._profileCache.has(userId)) return this._profileCache.get(userId);

    try {
      let url;
      if (source.groupId) {
        url = `${API_BASE}/bot/group/${source.groupId}/member/${userId}`;
      } else if (source.roomId) {
        url = `${API_BASE}/bot/room/${source.roomId}/member/${userId}`;
      } else {
        url = `${API_BASE}/bot/profile/${userId}`;
      }

      const resp = await this._apiRequest(url);
      if (!resp.ok) return '';

      const profile = await resp.json();
      const name = profile.displayName || '';
      if (name) this._profileCache.set(userId, name);
      return name;
    } catch {
      return '';
    }
  }

  /**
   * Get a group's name. Caches results.
   * @param {string} groupId
   * @returns {Promise<string>}
   */
  async _getGroupName(groupId) {
    if (!groupId) return '';
    if (this._groupCache.has(groupId)) return this._groupCache.get(groupId);

    try {
      const resp = await this._apiRequest(`${API_BASE}/bot/group/${groupId}/summary`);
      if (!resp.ok) return '';

      const data = await resp.json();
      const name = data.groupName || '';
      if (name) this._groupCache.set(groupId, name);
      return name;
    } catch {
      return '';
    }
  }

  // ─── Poll Interface ───────────────────────────────────────────────────

  async poll(source, adapterState, getSecret) {
    await this._ensureServer(source, getSecret);

    // Drain the buffer
    const items = this._buffer.splice(0);

    return {
      items,
      state: {
        ...adapterState,
        lastPollAt: new Date().toISOString()
      }
    };
  }

  // ─── Test ─────────────────────────────────────────────────────────────

  async test(source, getSecret) {
    const validation = this.validate(source);
    if (!validation.valid) {
      return { ok: false, message: validation.error };
    }

    try {
      const token = getSecret(source.channelAccessTokenSecret);

      // Verify bot credentials by calling the bot info endpoint
      const resp = await fetch(`${API_BASE}/bot/info`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(10000)
      });

      if (!resp.ok) {
        const text = await resp.text();
        return { ok: false, message: `LINE API ${resp.status}: ${text}` };
      }

      const bot = await resp.json();
      const port = source.webhookPort || DEFAULT_WEBHOOK_PORT;
      const path = source.webhookPath || '/webhook';

      return {
        ok: true,
        message: `Connected to LINE bot "${bot.displayName}" (${bot.userId}). Configure webhook URL to point to port ${port}${path}`
      };
    } catch (err) {
      return { ok: false, message: `LINE test failed: ${err.message}` };
    }
  }

  // ─── Realtime Interface ───────────────────────────────────────────────

  async connect(source, getSecret, callbacks) {
    this._callbacks = callbacks;
    try {
      await this._ensureServer(source, getSecret);
    } catch (err) {
      this._callbacks = null;
      throw err;
    }
  }

  async disconnect() {
    this._callbacks = null;
    if (this._server) {
      await new Promise((resolve) => {
        this._server.close(() => {
          logger.info('LINE webhook server stopped');
          resolve();
        });
      });
      this._server = null;
    }
    this._profileCache.clear();
    this._groupCache.clear();
    this._buffer.length = 0;
    this._channelAccessToken = '';
    this._channelSecret = '';
  }

  // ─── Send (Two-Way) ──────────────────────────────────────────────────

  async send(target, message, getSecret) {
    if (!this._channelAccessToken) {
      throw new Error('LINE: not connected. Call connect() or poll() first.');
    }

    const to = target.userId || target.channelId;
    if (!to) {
      throw new Error('LINE send: userId or channelId is required');
    }

    const messages = [];

    // Text message
    if (message.text) {
      messages.push({ type: 'text', text: message.text });
    }

    // Attachment messages
    if (message.attachments?.length) {
      for (const att of message.attachments) {
        if (att.type === 'image' && att.url) {
          messages.push({
            type: 'image',
            originalContentUrl: att.url,
            previewImageUrl: att.url
          });
        }
      }
    }

    if (messages.length === 0) return;

    // Use push message API
    const resp = await this._apiRequest(`${API_BASE}/bot/message/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, messages })
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`LINE push message failed ${resp.status}: ${text}`);
    }
  }
}
