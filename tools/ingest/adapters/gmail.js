import { BaseAdapter } from './base.js';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import * as logger from '../lib/logger.js';

const ATTACH_BASE = join(process.env.HOME, '.local/share/jat/ingest-files');

export class GmailAdapter extends BaseAdapter {
  constructor() {
    super('gmail');
  }

  validate(source) {
    if (!source.secretName) {
      return { valid: false, error: 'secretName is required (Gmail App Password stored in jat-secret)' };
    }
    if (!source.imapUser) {
      return { valid: false, error: 'imapUser is required (Gmail email address)' };
    }
    if (!source.folder) {
      return { valid: false, error: 'folder is required (Gmail label name, e.g. "JAT" or "Tasks")' };
    }
    return { valid: true };
  }

  _createClient(source, secret) {
    return new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: {
        user: source.imapUser,
        pass: secret
      },
      logger: false
    });
  }

  async poll(source, adapterState, getSecret) {
    const secret = getSecret(source.secretName);
    const client = this._createClient(source, secret);

    try {
      await client.connect();

      const lock = await client.getMailboxLock(source.folder);
      try {
        const mailbox = client.mailbox;

        // If uidValidity changed, reset cursor (mailbox was recreated)
        let lastSeenUid = adapterState.lastSeenUid || 0;
        if (adapterState.uidValidity && Number(adapterState.uidValidity) !== Number(mailbox.uidValidity)) {
          logger.warn('UIDVALIDITY changed, resetting cursor', source.id);
          lastSeenUid = 0;
        }

        // First run: set cursor to current max UID (future only)
        if (lastSeenUid === 0) {
          const state = {
            ...adapterState,
            lastSeenUid: Number(mailbox.uidNext ? mailbox.uidNext - 1 : 0),
            uidValidity: Number(mailbox.uidValidity)
          };
          return { items: [], state };
        }

        // Fetch messages with UID > lastSeenUid
        const range = `${lastSeenUid + 1}:*`;
        const items = [];
        let maxUid = lastSeenUid;

        for await (const msg of client.fetch(range, {
          uid: true,
          envelope: true,
          source: true
        })) {
          if (msg.uid <= lastSeenUid) continue;

          const parsed = await simpleParser(msg.source);

          // Apply optional filters
          if (source.filterFrom) {
            const from = parsed.from?.text || '';
            if (!from.toLowerCase().includes(source.filterFrom.toLowerCase())) continue;
          }
          if (source.filterSubject) {
            const subject = parsed.subject || '';
            try {
              if (!new RegExp(source.filterSubject, 'i').test(subject)) continue;
            } catch {
              // Invalid regex, skip filter
            }
          }

          // Save attachments to disk (MIME blobs, not URLs)
          const attachments = [];
          if (parsed.attachments?.length > 0) {
            const dir = join(ATTACH_BASE, source.id);
            mkdirSync(dir, { recursive: true });

            for (const att of parsed.attachments) {
              try {
                const ext = extname(att.filename || '') || mimeToExt(att.contentType) || '.bin';
                const hash = createHash('md5').update(att.content).digest('hex').slice(0, 12);
                const filename = att.filename
                  ? sanitizeFilename(att.filename)
                  : `${hash}${ext}`;
                const filePath = join(dir, filename);
                writeFileSync(filePath, att.content);
                attachments.push({
                  url: null,
                  type: att.contentType?.startsWith('image/') ? 'image' : 'file',
                  filename: att.filename || filename,
                  localPath: filePath
                });
              } catch (err) {
                logger.warn(`Failed to save attachment: ${err.message}`, source.id);
              }
            }
          }

          const subject = parsed.subject || 'No subject';
          const body = parsed.text || parsed.html?.replace(/<[^>]+>/g, ' ').slice(0, 5000) || '';
          const msgId = parsed.messageId || `gmail-${msg.uid}`;
          const hashInput = `${msgId}${subject}${body.slice(0, 200)}`;

          items.push({
            id: `gmail-${msg.uid}`,
            title: subject.slice(0, 200),
            description: body,
            hash: createHash('sha256').update(hashInput).digest('hex').slice(0, 16),
            author: parsed.from?.text || null,
            timestamp: parsed.date?.toISOString() || new Date().toISOString(),
            attachments
          });

          if (msg.uid > maxUid) maxUid = msg.uid;

          // Mark as read if configured
          if (source.markAsRead) {
            try {
              await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'], { uid: true });
            } catch {
              // Non-critical
            }
          }
        }

        return {
          items,
          state: {
            ...adapterState,
            lastSeenUid: Number(maxUid),
            uidValidity: Number(mailbox.uidValidity)
          }
        };
      } finally {
        lock.release();
      }
    } finally {
      try { await client.logout(); } catch { /* ignore */ }
    }
  }

  async test(source, getSecret) {
    const validation = this.validate(source);
    if (!validation.valid) {
      return { ok: false, message: validation.error };
    }

    try {
      const secret = getSecret(source.secretName);
      const client = this._createClient(source, secret);

      await client.connect();

      let info;
      try {
        const lock = await client.getMailboxLock(source.folder);
        try {
          const mailbox = client.mailbox;
          const total = mailbox.exists || 0;

          // Fetch up to 3 recent messages for samples
          const sampleItems = [];
          if (total > 0) {
            const startSeq = Math.max(1, total - 2);
            for await (const msg of client.fetch(`${startSeq}:*`, {
              uid: true,
              envelope: true,
              source: true
            })) {
              const parsed = await simpleParser(msg.source);
              sampleItems.push({
                id: `gmail-${msg.uid}`,
                title: (parsed.subject || 'No subject').slice(0, 100),
                timestamp: parsed.date?.toISOString() || ''
              });
              if (sampleItems.length >= 3) break;
            }
          }

          info = {
            ok: true,
            message: `Connected to ${source.imapUser}. Folder "${source.folder}" has ${total} message${total !== 1 ? 's' : ''}.`,
            sampleItems
          };
        } finally {
          lock.release();
        }
      } finally {
        try { await client.logout(); } catch { /* ignore */ }
      }

      return info;
    } catch (err) {
      const msg = err.message || String(err);
      const responseText = err.responseText || '';
      const fullMsg = `${msg} ${responseText}`.toLowerCase();
      if (fullMsg.includes('authenticationfailed') || fullMsg.includes('invalid credentials')) {
        return { ok: false, message: 'Authentication failed. Check your email and App Password.' };
      }
      if (err.mailboxMissing || err.serverResponseCode === 'NONEXISTENT' || fullMsg.includes('mailbox not found') || fullMsg.includes('does not exist') || fullMsg.includes('unknown mailbox')) {
        return { ok: false, message: `Folder "${source.folder}" not found. Create this Gmail label first.` };
      }
      return { ok: false, message: `Connection failed: ${responseText || msg}` };
    }
  }
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

function mimeToExt(contentType) {
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'text/html': '.html'
  };
  if (!contentType) return null;
  for (const [type, ext] of Object.entries(map)) {
    if (contentType.startsWith(type)) return ext;
  }
  return null;
}
