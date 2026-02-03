import { BaseAdapter, makeAttachment } from './base.js';

const API_BASE = 'https://api.telegram.org/bot';

export class TelegramAdapter extends BaseAdapter {
  constructor() {
    super('telegram');
  }

  validate(source) {
    if (!source.secretName) {
      return { valid: false, error: 'secretName is required (Telegram bot token)' };
    }
    if (!source.chatId) {
      return { valid: false, error: 'chatId is required' };
    }
    return { valid: true };
  }

  async poll(source, adapterState, getSecret) {
    const token = getSecret(source.secretName);
    const offset = adapterState.offset || 0;

    const params = new URLSearchParams({
      offset: String(offset),
      limit: '100',
      timeout: '0'
    });

    // Filter to specific chat if configured
    if (source.chatId) {
      params.set('allowed_updates', JSON.stringify(['message']));
    }

    const resp = await fetch(`${API_BASE}${token}/getUpdates?${params}`, {
      signal: AbortSignal.timeout(15000)
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Telegram API ${resp.status}: ${text}`);
    }

    const data = await resp.json();
    if (!data.ok) {
      throw new Error(`Telegram API error: ${data.description}`);
    }

    const updates = data.result || [];
    const items = [];
    let newOffset = offset;

    // Group media messages by media_group_id
    const mediaGroups = new Map();

    for (const update of updates) {
      newOffset = Math.max(newOffset, update.update_id + 1);

      const msg = update.message;
      if (!msg) continue;

      // Filter to target chat
      if (source.chatId && String(msg.chat.id) !== String(source.chatId)) continue;

      // Handle media groups (multiple photos in one message)
      if (msg.media_group_id) {
        if (!mediaGroups.has(msg.media_group_id)) {
          mediaGroups.set(msg.media_group_id, {
            messages: [],
            firstMsg: msg
          });
        }
        mediaGroups.get(msg.media_group_id).messages.push(msg);
        continue;
      }

      // Regular message
      const item = await messageToItem(msg, token);
      if (item) items.push(item);
    }

    // Process media groups into single items
    for (const [groupId, group] of mediaGroups) {
      const item = await mediaGroupToItem(group, token);
      if (item) items.push(item);
    }

    return {
      items,
      state: { ...adapterState, offset: newOffset }
    };
  }

  async test(source, getSecret) {
    const validation = this.validate(source);
    if (!validation.valid) {
      return { ok: false, message: validation.error };
    }

    try {
      const token = getSecret(source.secretName);
      const resp = await fetch(`${API_BASE}${token}/getMe`, {
        signal: AbortSignal.timeout(10000)
      });
      const data = await resp.json();

      if (!data.ok) {
        return { ok: false, message: `Bot error: ${data.description}` };
      }

      return {
        ok: true,
        message: `Connected to bot @${data.result.username} (${data.result.first_name})`
      };
    } catch (err) {
      return { ok: false, message: `Connection failed: ${err.message}` };
    }
  }
}

async function messageToItem(msg, token) {
  const text = msg.text || msg.caption || '';
  if (!text && !msg.photo && !msg.document) return null;

  const attachments = [];

  // Get largest photo
  if (msg.photo?.length > 0) {
    const largest = msg.photo[msg.photo.length - 1];
    const url = await getFileUrl(token, largest.file_id);
    if (url) attachments.push(makeAttachment(url, 'image'));
  }

  // Get document
  if (msg.document) {
    const url = await getFileUrl(token, msg.document.file_id);
    if (url) attachments.push(makeAttachment(url, 'file', msg.document.file_name));
  }

  const title = text.split('\n')[0].slice(0, 120) || 'Telegram message';
  const author = formatAuthor(msg.from);

  return {
    id: `tg-${msg.message_id}-${msg.chat.id}`,
    title,
    description: text,
    hash: null,
    author,
    timestamp: new Date(msg.date * 1000).toISOString(),
    attachments
  };
}

async function mediaGroupToItem(group, token) {
  const firstMsg = group.firstMsg;
  const allMsgs = group.messages;

  // Caption comes from any message in the group
  const text = allMsgs.map(m => m.caption).filter(Boolean).join('\n') || '';
  const title = text.split('\n')[0].slice(0, 120) || 'Telegram media group';

  const attachments = [];
  for (const msg of allMsgs) {
    if (msg.photo?.length > 0) {
      const largest = msg.photo[msg.photo.length - 1];
      const url = await getFileUrl(token, largest.file_id);
      if (url) attachments.push(makeAttachment(url, 'image'));
    }
  }

  return {
    id: `tg-group-${firstMsg.media_group_id}`,
    title,
    description: text,
    hash: null,
    author: formatAuthor(firstMsg.from),
    timestamp: new Date(firstMsg.date * 1000).toISOString(),
    attachments
  };
}

async function getFileUrl(token, fileId) {
  try {
    const resp = await fetch(`${API_BASE}${token}/getFile?file_id=${fileId}`, {
      signal: AbortSignal.timeout(10000)
    });
    const data = await resp.json();
    if (!data.ok || !data.result.file_path) return null;
    return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
  } catch {
    return null;
  }
}

function formatAuthor(from) {
  if (!from) return null;
  return from.username
    ? `@${from.username}`
    : [from.first_name, from.last_name].filter(Boolean).join(' ');
}
