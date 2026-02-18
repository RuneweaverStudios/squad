import { BaseAdapter, makeAttachment } from '../base.js';

const REALTIME_TIMEOUT_MS = 30000; // 30s long-poll for realtime connect()
const REQUEST_TIMEOUT_MS = 45000;  // fetch timeout (must exceed long-poll)

/** @type {import('../base.js').PluginMetadata} */
export const metadata = {
  type: 'matrix',
  name: 'Matrix',
  description: 'Ingest messages from Matrix rooms via client-server API',
  version: '1.0.0',
  icon: {
    svg: 'M.632.55v22.9H2.28V24H0V0h2.28v.55zm7.043 7.26v1.157h.033c.309-.443.683-.784 1.117-1.024.433-.245.936-.365 1.5-.365.54 0 1.033.107 1.481.314.448.208.785.582 1.02 1.108.254-.374.6-.706 1.034-.992.434-.287.95-.43 1.546-.43.453 0 .872.056 1.26.167.388.11.716.286.993.53.276.245.489.559.646.951.152.392.23.863.23 1.417v5.728h-2.349V11.52c0-.286-.01-.559-.032-.812a1.755 1.755 0 00-.18-.66 1.106 1.106 0 00-.438-.448c-.194-.11-.457-.166-.785-.166-.332 0-.6.064-.803.189a1.38 1.38 0 00-.48.499 1.946 1.946 0 00-.231.696 5.56 5.56 0 00-.06.785v4.768h-2.35v-4.8c0-.254-.004-.503-.018-.752a2.074 2.074 0 00-.143-.688 1.052 1.052 0 00-.415-.503c-.194-.125-.476-.19-.854-.19-.111 0-.259.024-.439.074-.18.051-.36.143-.53.282-.171.138-.319.337-.439.595-.12.259-.18.6-.18 1.02v4.966H5.46V7.81zm15.693 15.64V.55H21.72V0H24v24h-2.28v-.55z',
    viewBox: '0 0 24 24',
    fill: true,
    color: '#0DBD8B'
  },
  configFields: [
    {
      key: 'homeserver',
      label: 'Homeserver URL',
      type: 'string',
      required: true,
      placeholder: 'https://matrix.org',
      helpText: 'Matrix homeserver base URL'
    },
    {
      key: 'secretName',
      label: 'Access Token Secret',
      type: 'secret',
      required: true,
      helpText: 'Name of the secret containing the Matrix access token (stored in squad-secret)'
    },
    {
      key: 'userId',
      label: 'User ID',
      type: 'string',
      required: true,
      placeholder: '@bot:matrix.org',
      helpText: 'Full Matrix user ID for the bot account'
    },
    {
      key: 'roomIds',
      label: 'Room IDs',
      type: 'string',
      required: false,
      placeholder: '!abc123:matrix.org, !def456:matrix.org',
      helpText: 'Comma-separated room IDs to monitor (leave empty for all joined rooms)'
    },
    {
      key: 'includeEncrypted',
      label: 'Include Encrypted Messages',
      type: 'boolean',
      default: false,
      helpText: 'Include encrypted messages as opaque items (content cannot be decrypted)'
    }
  ],
  itemFields: [
    { key: 'sender', label: 'Sender', type: 'string' },
    { key: 'roomName', label: 'Room', type: 'string' },
    { key: 'roomId', label: 'Room ID', type: 'string' },
    { key: 'isEncrypted', label: 'Encrypted', type: 'boolean' },
    { key: 'hasMedia', label: 'Has Media', type: 'boolean' }
  ]
};

export default class MatrixAdapter extends BaseAdapter {
  constructor() {
    super('matrix');
    this._syncAbort = null;
    this._running = false;
    this._sourceConfig = null;
    this._token = null;
  }

  get supportsRealtime() { return true; }
  get supportsSend() { return true; }

  validate(source) {
    if (!source.homeserver) {
      return { valid: false, error: 'homeserver URL is required' };
    }
    if (!source.secretName) {
      return { valid: false, error: 'secretName is required (Matrix access token)' };
    }
    if (!source.userId) {
      return { valid: false, error: 'userId is required (e.g., @bot:matrix.org)' };
    }
    try {
      new URL(source.homeserver);
    } catch {
      return { valid: false, error: 'homeserver must be a valid URL' };
    }
    return { valid: true };
  }

  async poll(source, adapterState, getSecret) {
    const token = getSecret(source.secretName);
    const hs = source.homeserver.replace(/\/$/, '');
    const since = adapterState.since || null;

    const filter = buildSyncFilter(source);
    const params = new URLSearchParams({ timeout: '0' });
    if (since) params.set('since', since);
    params.set('filter', JSON.stringify(filter));

    const resp = await matrixFetch(hs, '/_matrix/client/v3/sync', token, params);
    const data = await resp.json();

    const items = [];
    const rooms = data.rooms?.join || {};
    const targetRooms = parseRoomIds(source.roomIds);

    for (const [roomId, roomData] of Object.entries(rooms)) {
      if (targetRooms.length > 0 && !targetRooms.includes(roomId)) continue;
      const roomName = extractRoomName(roomData) || roomId;
      for (const event of (roomData.timeline?.events || [])) {
        const item = eventToItem(event, roomId, roomName, hs, source);
        if (item) items.push(item);
      }
    }

    return {
      items,
      state: { ...adapterState, since: data.next_batch }
    };
  }

  async test(source, getSecret) {
    const validation = this.validate(source);
    if (!validation.valid) {
      return { ok: false, message: validation.error };
    }

    try {
      const token = getSecret(source.secretName);
      const hs = source.homeserver.replace(/\/$/, '');

      const whoami = await matrixFetch(hs, '/_matrix/client/v3/account/whoami', token);
      const whoamiData = await whoami.json();
      if (!whoamiData.user_id) {
        return { ok: false, message: 'Invalid access token' };
      }

      const joined = await matrixFetch(hs, '/_matrix/client/v3/joined_rooms', token);
      const joinedData = await joined.json();
      const roomCount = joinedData.joined_rooms?.length || 0;

      return {
        ok: true,
        message: `Authenticated as ${whoamiData.user_id}. Joined ${roomCount} room(s).`
      };
    } catch (err) {
      return { ok: false, message: `Connection failed: ${err.message}` };
    }
  }

  async connect(sourceConfig, getSecret, callbacks) {
    const token = getSecret(sourceConfig.secretName);
    const hs = sourceConfig.homeserver.replace(/\/$/, '');
    const filter = buildSyncFilter(sourceConfig);
    const targetRooms = parseRoomIds(sourceConfig.roomIds);

    this._running = true;
    this._sourceConfig = sourceConfig;
    this._token = token;

    // Initial sync to get the since token (skip historical messages)
    let since;
    try {
      const params = new URLSearchParams({ timeout: '0', filter: JSON.stringify(filter) });
      const resp = await matrixFetch(hs, '/_matrix/client/v3/sync', token, params);
      const data = await resp.json();
      since = data.next_batch;
    } catch (err) {
      callbacks.onError(err);
      return;
    }

    // Long-polling loop
    while (this._running) {
      try {
        this._syncAbort = new AbortController();
        const params = new URLSearchParams({
          since,
          timeout: String(REALTIME_TIMEOUT_MS),
          filter: JSON.stringify(filter)
        });

        const resp = await fetch(`${hs}/_matrix/client/v3/sync?${params}`, {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: this._syncAbort.signal
        });

        if (!resp.ok) {
          throw new Error(`Matrix sync ${resp.status}: ${await resp.text()}`);
        }

        const data = await resp.json();
        since = data.next_batch;

        const rooms = data.rooms?.join || {};
        for (const [roomId, roomData] of Object.entries(rooms)) {
          if (targetRooms.length > 0 && !targetRooms.includes(roomId)) continue;
          const roomName = extractRoomName(roomData) || roomId;
          for (const event of (roomData.timeline?.events || [])) {
            const item = eventToItem(event, roomId, roomName, hs, sourceConfig);
            if (item) callbacks.onMessage(item);
          }
        }
      } catch (err) {
        if (!this._running) break;
        callbacks.onError(err);
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    callbacks.onDisconnect('stopped');
  }

  async disconnect() {
    this._running = false;
    if (this._syncAbort) {
      this._syncAbort.abort();
      this._syncAbort = null;
    }
  }

  async send(target, message, _getSecret) {
    if (!this._sourceConfig || !this._token) {
      throw new Error('matrix: send() requires an active connection (call connect() first)');
    }
    if (!target.channelId) {
      throw new Error('matrix: channelId (room ID) is required');
    }

    const hs = this._sourceConfig.homeserver.replace(/\/$/, '');
    const roomId = encodeURIComponent(target.channelId);
    const txnId = `squad-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const body = { msgtype: 'm.text', body: message.text };

    // Reply threading via m.relates_to
    if (target.threadId) {
      body['m.relates_to'] = {
        'm.in_reply_to': {
          event_id: target.threadId
        }
      };
    }

    const resp = await fetch(
      `${hs}/_matrix/client/v3/rooms/${roomId}/send/m.room.message/${txnId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this._token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000)
      }
    );

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Matrix send ${resp.status}: ${text}`);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSyncFilter(source) {
  const timelineTypes = ['m.room.message'];
  if (source.includeEncrypted) timelineTypes.push('m.room.encrypted');

  const filter = {
    room: {
      timeline: { limit: 50, types: timelineTypes },
      state: { types: ['m.room.name'] },
      ephemeral: { types: [] }
    },
    presence: { types: [] },
    account_data: { types: [] }
  };

  const targetRooms = parseRoomIds(source.roomIds);
  if (targetRooms.length > 0) {
    filter.room.rooms = targetRooms;
  }

  return filter;
}

function parseRoomIds(roomIdsStr) {
  if (!roomIdsStr) return [];
  return roomIdsStr.split(',').map(s => s.trim()).filter(Boolean);
}

function extractRoomName(roomData) {
  const nameEvent = roomData.state?.events?.find(e => e.type === 'm.room.name');
  return nameEvent?.content?.name || null;
}

async function matrixFetch(hs, path, token, params = null) {
  const url = params ? `${hs}${path}?${params}` : `${hs}${path}`;
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Matrix API ${resp.status}: ${text}`);
  }
  return resp;
}

function eventToItem(event, roomId, roomName, hs, source) {
  // Skip own messages (from the bot user)
  if (event.sender === source.userId) return null;

  if (event.type === 'm.room.encrypted') {
    if (!source.includeEncrypted) return null;
    return {
      id: `matrix-${event.event_id}`,
      title: '[Encrypted message]',
      description: 'This message is end-to-end encrypted and cannot be decrypted by the ingest adapter.',
      hash: null,
      author: event.sender,
      timestamp: new Date(event.origin_server_ts).toISOString(),
      replyTo: event.content?.['m.relates_to']?.['m.in_reply_to']?.event_id
        ? `matrix-${event.content['m.relates_to']['m.in_reply_to'].event_id}`
        : undefined,
      fields: {
        sender: event.sender,
        roomName,
        roomId,
        isEncrypted: true,
        hasMedia: false
      },
      origin: {
        adapterType: 'matrix',
        channelId: roomId,
        senderId: event.sender,
        threadId: event.event_id,
        metadata: { homeserver: hs }
      }
    };
  }

  if (event.type !== 'm.room.message') return null;

  const content = event.content;
  if (!content) return null;

  const msgtype = content.msgtype;
  const body = content.body || '';
  const attachments = [];
  let hasMedia = false;

  if (['m.image', 'm.file', 'm.video', 'm.audio'].includes(msgtype)) {
    hasMedia = true;
    if (content.url) {
      const httpUrl = mxcToHttp(content.url, hs);
      const type = msgtype === 'm.image' ? 'image' : 'file';
      attachments.push(makeAttachment(httpUrl, type, content.body));
    }
  }

  const firstLine = body.split('\n')[0];
  const title = (firstLine.length > 200 ? firstLine.slice(0, 200) + '...' : firstLine) || 'Matrix message';

  return {
    id: `matrix-${event.event_id}`,
    title,
    description: body,
    hash: null,
    author: event.sender,
    timestamp: new Date(event.origin_server_ts).toISOString(),
    attachments,
    replyTo: content['m.relates_to']?.['m.in_reply_to']?.event_id
      ? `matrix-${content['m.relates_to']['m.in_reply_to'].event_id}`
      : undefined,
    fields: {
      sender: event.sender,
      roomName,
      roomId,
      isEncrypted: false,
      hasMedia
    },
    origin: {
      adapterType: 'matrix',
      channelId: roomId,
      senderId: event.sender,
      threadId: event.event_id,
      metadata: { homeserver: hs }
    }
  };
}

function mxcToHttp(mxcUrl, homeserver) {
  const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
  if (!match) return mxcUrl;
  return `${homeserver}/_matrix/media/v3/download/${match[1]}/${match[2]}`;
}
