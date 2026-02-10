import { BaseAdapter, makeAttachment } from '../base.js';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as logger from '../../lib/logger.js';

const ATTACH_BASE = join(process.env.HOME, '.local/share/jat/ingest-files');
const DEFAULT_AUTH_DIR = join(process.env.HOME, '.config/jat/whatsapp-auth');

/** @type {import('../base.js').PluginMetadata} */
export const metadata = {
  type: 'whatsapp',
  name: 'WhatsApp',
  description: 'Ingest messages from WhatsApp via Baileys (QR pairing, no official API needed)',
  version: '1.0.0',
  configFields: [
    {
      key: 'phoneNumber',
      label: 'Phone Number',
      type: 'string',
      placeholder: '+1234567890',
      helpText: 'Your WhatsApp phone number (display only, pairing is via QR code)'
    },
    {
      key: 'authDir',
      label: 'Auth State Directory',
      type: 'string',
      default: DEFAULT_AUTH_DIR,
      helpText: 'Directory to store WhatsApp session auth files (persists across restarts)'
    },
    {
      key: 'chatFilter',
      label: 'Chat Filter',
      type: 'select',
      default: 'all',
      options: [
        { value: 'all', label: 'All Chats' },
        { value: 'groups', label: 'Groups Only' },
        { value: 'dms', label: 'DMs Only' },
        { value: 'allowlist', label: 'Allowlist Only' }
      ],
      helpText: 'Which chats to ingest messages from'
    },
    {
      key: 'allowlist',
      label: 'Allowlist',
      type: 'string',
      placeholder: '+1234567890, +0987654321, groupJid@g.us',
      helpText: 'Comma-separated phone numbers or group JIDs (only used when filter is "Allowlist Only")'
    }
  ],
  itemFields: [
    { key: 'sender', label: 'Sender', type: 'string' },
    { key: 'senderName', label: 'Sender Name', type: 'string' },
    { key: 'isGroup', label: 'Is Group', type: 'boolean' },
    { key: 'groupName', label: 'Group Name', type: 'string' },
    { key: 'hasMedia', label: 'Has Media', type: 'boolean' },
    {
      key: 'messageType',
      label: 'Message Type',
      type: 'enum',
      values: ['text', 'image', 'video', 'document', 'audio', 'sticker', 'other']
    }
  ]
};

export default class WhatsAppAdapter extends BaseAdapter {
  constructor() {
    super('whatsapp');
    /** @type {import('@whiskeysockets/baileys').WASocket | null} */
    this._sock = null;
    /** @type {import('../base.js').IngestItem[]} */
    this._buffer = [];
    /** @type {import('../base.js').RealtimeCallbacks | null} */
    this._callbacks = null;
    this._connected = false;
    this._qrCode = null;
    this._sourceConfig = null;
  }

  get supportsRealtime() {
    return true;
  }

  get supportsSend() {
    return true;
  }

  validate(source) {
    if (source.chatFilter === 'allowlist' && !source.allowlist?.trim()) {
      return { valid: false, error: 'Allowlist is required when chat filter is set to "Allowlist Only"' };
    }
    return { valid: true };
  }

  /**
   * Ensure Baileys connection is alive. Creates one if needed.
   * In poll mode this keeps the socket open between poll() calls.
   */
  async _ensureConnection(source, adapterState) {
    if (this._sock && this._connected) return;

    const baileys = await import('@whiskeysockets/baileys');
    const makeWASocket = baileys.default;
    const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;

    const authDir = source.authDir || DEFAULT_AUTH_DIR;
    mkdirSync(authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    this._sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: { level: 'silent', child: () => ({ level: 'silent' }) }
    });

    this._sourceConfig = source;

    this._sock.ev.on('creds.update', saveCreds);

    this._sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this._qrCode = qr;
        logger.info('WhatsApp QR code generated, scan to pair');
      }

      if (connection === 'open') {
        this._connected = true;
        this._qrCode = null;
        logger.info('WhatsApp connection opened');
      }

      if (connection === 'close') {
        this._connected = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        if (loggedOut) {
          logger.warn('WhatsApp logged out, session invalidated');
          this._sock = null;
          if (this._callbacks) {
            this._callbacks.onDisconnect('logged_out');
          }
        } else {
          logger.info(`WhatsApp connection closed (code ${statusCode}), will reconnect`);
          // Auto-reconnect after a short delay
          setTimeout(() => {
            if (!this._connected && this._sourceConfig) {
              this._ensureConnection(this._sourceConfig, {}).catch(err => {
                logger.warn(`WhatsApp reconnect failed: ${err.message}`);
                if (this._callbacks) {
                  this._callbacks.onError(err);
                }
              });
            }
          }, 3000);
        }
      }
    });

    this._sock.ev.on('messages.upsert', async (event) => {
      for (const msg of event.messages) {
        // Skip status broadcasts
        if (msg.key.remoteJid === 'status@broadcast') continue;
        // Skip own messages
        if (msg.key.fromMe) continue;

        if (!this._passesFilter(msg, source)) continue;

        try {
          const item = await this._messageToItem(msg, source);
          if (!item) continue;

          if (this._callbacks) {
            // Realtime mode: deliver immediately
            this._callbacks.onMessage(item);
          } else {
            // Poll mode: buffer for next poll() call
            this._buffer.push(item);
          }
        } catch (err) {
          logger.warn(`WhatsApp message processing error: ${err.message}`);
        }
      }
    });

    // Wait for connection (with timeout)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WhatsApp connection timeout (30s). If first run, use test() to get QR code.'));
      }, 30000);

      const handler = (update) => {
        if (update.connection === 'open') {
          clearTimeout(timeout);
          this._sock.ev.off('connection.update', handler);
          resolve();
        }
        if (update.connection === 'close') {
          const statusCode = update.lastDisconnect?.error?.output?.statusCode;
          if (statusCode === DisconnectReason.loggedOut) {
            clearTimeout(timeout);
            this._sock.ev.off('connection.update', handler);
            reject(new Error('WhatsApp session logged out. Re-pair via test().'));
          }
        }
      };

      // If already connected (cached creds), resolve immediately
      if (this._connected) {
        clearTimeout(timeout);
        resolve();
        return;
      }

      this._sock.ev.on('connection.update', handler);
    });
  }

  /**
   * Check if a message passes the configured chat filter.
   */
  _passesFilter(msg, source) {
    const jid = msg.key.remoteJid;
    if (!jid) return false;

    const isGroup = jid.endsWith('@g.us');
    const filter = source.chatFilter || 'all';

    switch (filter) {
      case 'groups':
        return isGroup;
      case 'dms':
        return !isGroup;
      case 'allowlist': {
        const allowlist = (source.allowlist || '').split(',').map(s => s.trim()).filter(Boolean);
        // Match by JID directly or by phone number (strip + and @s.whatsapp.net)
        return allowlist.some(entry => {
          if (jid === entry) return true;
          // Normalize phone: remove +, compare with JID's number part
          const normalized = entry.replace(/^\+/, '');
          return jid.startsWith(normalized + '@');
        });
      }
      default: // 'all'
        return true;
    }
  }

  /**
   * Convert a Baileys WAMessage to an IngestItem.
   */
  async _messageToItem(msg, source) {
    const jid = msg.key.remoteJid;
    const isGroup = jid.endsWith('@g.us');
    const msgContent = msg.message;
    if (!msgContent) return null;

    // Determine message type and extract text
    let text = '';
    let messageType = 'other';
    const attachments = [];

    if (msgContent.conversation) {
      text = msgContent.conversation;
      messageType = 'text';
    } else if (msgContent.extendedTextMessage) {
      text = msgContent.extendedTextMessage.text || '';
      messageType = 'text';
    } else if (msgContent.imageMessage) {
      text = msgContent.imageMessage.caption || '';
      messageType = 'image';
      const saved = await this._saveMedia(msg, source, 'image');
      if (saved) attachments.push(saved);
    } else if (msgContent.videoMessage) {
      text = msgContent.videoMessage.caption || '';
      messageType = 'video';
      const saved = await this._saveMedia(msg, source, 'video');
      if (saved) attachments.push(saved);
    } else if (msgContent.documentMessage) {
      text = msgContent.documentMessage.caption || '';
      messageType = 'document';
      const saved = await this._saveMedia(msg, source, 'file');
      if (saved) attachments.push(saved);
    } else if (msgContent.audioMessage) {
      messageType = 'audio';
      const saved = await this._saveMedia(msg, source, 'audio');
      if (saved) attachments.push(saved);
    } else if (msgContent.stickerMessage) {
      messageType = 'sticker';
    }

    // Skip empty messages (no text and no media)
    if (!text && attachments.length === 0 && messageType === 'other') return null;

    const sender = isGroup
      ? (msg.key.participant || jid)
      : jid;
    const senderName = msg.pushName || sender.split('@')[0];

    const firstLine = text.split('\n')[0];
    const title = firstLine
      ? (firstLine.length > 200 ? firstLine.slice(0, 200) + '...' : firstLine)
      : `WhatsApp ${messageType}`;

    const timestamp = msg.messageTimestamp
      ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
      : new Date().toISOString();

    const hashInput = `${msg.key.id}${jid}${text.slice(0, 200)}`;

    // Detect reply-to (quoted message)
    const contextInfo = msgContent.extendedTextMessage?.contextInfo
      || msgContent.imageMessage?.contextInfo
      || msgContent.videoMessage?.contextInfo
      || msgContent.documentMessage?.contextInfo;
    const stanzaId = contextInfo?.stanzaId;

    return {
      id: `wa-${msg.key.id}`,
      title,
      description: text,
      hash: createHash('sha256').update(hashInput).digest('hex').slice(0, 16),
      author: senderName,
      timestamp,
      attachments,
      replyTo: stanzaId ? `wa-${stanzaId}` : undefined,
      fields: {
        sender: sender.split('@')[0],
        senderName,
        isGroup,
        groupName: isGroup ? (await this._getGroupName(jid)) : '',
        hasMedia: attachments.length > 0 || ['image', 'video', 'document', 'audio', 'sticker'].includes(messageType),
        messageType
      },
      origin: {
        adapterType: 'whatsapp',
        channelId: jid,
        senderId: sender,
        threadId: msg.key.id,
        metadata: { isGroup }
      }
    };
  }

  /**
   * Download and save media from a message.
   */
  async _saveMedia(msg, source, type) {
    if (!this._sock) return null;

    try {
      const baileys = await import('@whiskeysockets/baileys');
      const { downloadMediaMessage } = baileys;

      const buffer = await downloadMediaMessage(msg, 'buffer', {});
      if (!buffer || buffer.length === 0) return null;

      const dir = join(ATTACH_BASE, source.id || 'whatsapp');
      mkdirSync(dir, { recursive: true });

      const hash = createHash('md5').update(buffer).digest('hex').slice(0, 12);
      const ext = getMediaExt(msg.message, type);
      const filename = `${hash}${ext}`;
      const filePath = join(dir, filename);
      writeFileSync(filePath, buffer);

      return {
        url: null,
        type: type === 'image' ? 'image' : 'file',
        filename,
        localPath: filePath
      };
    } catch (err) {
      logger.warn(`WhatsApp media download failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Get group name from JID (cached on socket).
   */
  async _getGroupName(jid) {
    if (!this._sock) return '';
    try {
      const metadata = await this._sock.groupMetadata(jid);
      return metadata?.subject || '';
    } catch {
      return '';
    }
  }

  // ─── Poll Interface ───────────────────────────────────────────────────────

  async poll(source, adapterState, _getSecret) {
    await this._ensureConnection(source, adapterState);

    // Drain the buffer
    const items = this._buffer.splice(0);

    return {
      items,
      state: {
        ...adapterState,
        lastPollAt: new Date().toISOString(),
        connected: this._connected
      }
    };
  }

  async test(source, _getSecret) {
    const validation = this.validate(source);
    if (!validation.valid) {
      return { ok: false, message: validation.error };
    }

    try {
      const baileys = await import('@whiskeysockets/baileys');
      const makeWASocket = baileys.default;
      const { useMultiFileAuthState, fetchLatestBaileysVersion } = baileys;

      const authDir = source.authDir || DEFAULT_AUTH_DIR;
      mkdirSync(authDir, { recursive: true });

      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      const { version } = await fetchLatestBaileysVersion();

      let qrGenerated = null;

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: { level: 'silent', child: () => ({ level: 'silent' }) }
      });

      sock.ev.on('creds.update', saveCreds);

      const result = await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          try { sock.end(undefined); } catch { /* ignore */ }
          if (qrGenerated) {
            resolve({
              ok: true,
              message: `QR code generated. Scan with WhatsApp to pair.\n\nQR Data: ${qrGenerated}\n\nUse a QR code renderer to display this, or set printQRInTerminal in your Baileys config.`
            });
          } else {
            resolve({ ok: false, message: 'Connection timeout (20s). No QR code or auth state found.' });
          }
        }, 20000);

        sock.ev.on('connection.update', (update) => {
          if (update.qr) {
            qrGenerated = update.qr;
          }

          if (update.connection === 'open') {
            clearTimeout(timeout);
            // Get some basic info then close
            const user = sock.user;
            try { sock.end(undefined); } catch { /* ignore */ }
            resolve({
              ok: true,
              message: `Connected to WhatsApp as ${user?.name || user?.id || 'unknown'}. Session is paired and ready.`
            });
          }

          if (update.connection === 'close') {
            const code = update.lastDisconnect?.error?.output?.statusCode;
            if (code === baileys.DisconnectReason.loggedOut) {
              clearTimeout(timeout);
              resolve({ ok: false, message: 'Session was logged out. Delete auth directory and re-pair.' });
            }
          }
        });
      });

      return result;
    } catch (err) {
      return { ok: false, message: `WhatsApp test failed: ${err.message}` };
    }
  }

  // ─── Realtime Interface ───────────────────────────────────────────────────

  async connect(source, _getSecret, callbacks) {
    this._callbacks = callbacks;
    try {
      await this._ensureConnection(source, {});
    } catch (err) {
      this._callbacks = null;
      throw err;
    }
  }

  async disconnect() {
    this._callbacks = null;
    this._connected = false;
    if (this._sock) {
      try {
        this._sock.end(undefined);
      } catch { /* ignore */ }
      this._sock = null;
    }
  }

  async send(target, message, _getSecret) {
    if (!this._sock || !this._connected) {
      throw new Error('WhatsApp: not connected. Call connect() or poll() first.');
    }

    // Build the target JID
    let jid = target.channelId || target.userId;
    if (!jid) {
      throw new Error('WhatsApp send: channelId or userId is required');
    }

    // Normalize: add @s.whatsapp.net if it looks like a phone number
    if (!jid.includes('@')) {
      jid = jid.replace(/^\+/, '') + '@s.whatsapp.net';
    }

    const sendOpts = {};
    if (target.threadId) {
      // Reply to a specific message (quoted)
      sendOpts.quoted = { key: { remoteJid: jid, id: target.threadId } };
    }

    // Send text
    if (message.text) {
      await this._sock.sendMessage(jid, { text: message.text }, sendOpts);
    }

    // Send attachments
    if (message.attachments?.length > 0) {
      for (const att of message.attachments) {
        const mediaPayload = {};
        const source = att.localPath
          ? { url: att.localPath }
          : (att.url ? { url: att.url } : null);

        if (!source) continue;

        if (att.type === 'image') {
          mediaPayload.image = source;
          if (!message.text) mediaPayload.caption = '';
        } else {
          mediaPayload.document = source;
          mediaPayload.fileName = att.filename || 'file';
        }

        await this._sock.sendMessage(jid, mediaPayload, sendOpts);
      }
    }
  }
}

/**
 * Determine file extension from message content type.
 */
function getMediaExt(msgContent, fallbackType) {
  if (!msgContent) return '.bin';

  if (msgContent.imageMessage) {
    const mime = msgContent.imageMessage.mimetype || '';
    if (mime.includes('png')) return '.png';
    if (mime.includes('gif')) return '.gif';
    if (mime.includes('webp')) return '.webp';
    return '.jpg';
  }
  if (msgContent.videoMessage) return '.mp4';
  if (msgContent.audioMessage) {
    const mime = msgContent.audioMessage.mimetype || '';
    if (mime.includes('ogg')) return '.ogg';
    return '.mp3';
  }
  if (msgContent.documentMessage) {
    const filename = msgContent.documentMessage.fileName || '';
    const dotIdx = filename.lastIndexOf('.');
    if (dotIdx > 0) return filename.slice(dotIdx);
    return '.bin';
  }
  if (msgContent.stickerMessage) return '.webp';

  return '.bin';
}
