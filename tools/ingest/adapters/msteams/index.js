import { BaseAdapter, makeAttachment } from '../base.js';
import * as logger from '../../lib/logger.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const LOGIN_BASE = 'https://login.microsoftonline.com';

// Token cache: { token, expiresAt }
let tokenCache = null;

/** @type {import('../base.js').PluginMetadata} */
export const metadata = {
  type: 'msteams',
  name: 'Microsoft Teams',
  description: 'Ingest messages from Microsoft Teams channels via Graph API',
  version: '1.0.0',
  configFields: [
    {
      key: 'clientId',
      label: 'Application (Client) ID',
      type: 'string',
      required: true,
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      helpText: 'Azure AD app registration client ID'
    },
    {
      key: 'secretName',
      label: 'Client Secret',
      type: 'secret',
      required: true,
      helpText: 'Name of the secret containing the Azure AD client secret (stored in jat-secret)'
    },
    {
      key: 'tenantId',
      label: 'Tenant ID',
      type: 'string',
      required: true,
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      helpText: 'Azure AD tenant ID'
    },
    {
      key: 'teamId',
      label: 'Team ID',
      type: 'string',
      required: true,
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      helpText: 'Microsoft Teams team ID'
    },
    {
      key: 'channelIds',
      label: 'Channel IDs',
      type: 'string',
      required: true,
      placeholder: '19:xxx@thread.tacv2, 19:yyy@thread.tacv2',
      helpText: 'Comma-separated Teams channel IDs'
    }
  ],
  itemFields: [
    { key: 'sender', label: 'Sender', type: 'string' },
    { key: 'channelName', label: 'Channel', type: 'string' },
    { key: 'hasAttachments', label: 'Has Attachments', type: 'boolean' },
    { key: 'importance', label: 'Importance', type: 'enum', values: ['normal', 'high', 'urgent'] },
    { key: 'reactionCount', label: 'Reactions', type: 'number' }
  ]
};

export default class MSTeamsAdapter extends BaseAdapter {
  constructor() {
    super('msteams');
  }

  /**
   * Acquire an OAuth2 access token using client credentials grant.
   * Cached until 5 minutes before expiry.
   */
  async acquireToken(source, getSecret) {
    if (tokenCache && tokenCache.expiresAt > Date.now() + 300_000) {
      return tokenCache.token;
    }

    const clientSecret = getSecret(source.secretName);
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: source.clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default'
    });

    const resp = await fetch(`${LOGIN_BASE}/${source.tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10000)
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Token acquisition failed (HTTP ${resp.status}): ${text}`);
    }

    const data = await resp.json();
    tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in * 1000)
    };
    return tokenCache.token;
  }

  /**
   * Strip HTML tags and decode common entities to plain text.
   */
  htmlToText(html) {
    if (!html) return '';
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Convert a Graph API message object to an IngestItem.
   */
  messageToItem(msg, channelId) {
    // Skip system/event messages (e.g., member added, topic changed)
    if (msg.messageType && msg.messageType !== 'message') return null;

    const body = msg.body?.contentType === 'html'
      ? this.htmlToText(msg.body?.content || '')
      : (msg.body?.content || '');

    if (!body && !(msg.attachments?.length > 0)) return null;

    const firstLine = body.split('\n')[0];
    const title = firstLine.length > 200
      ? firstLine.slice(0, 200) + '...'
      : firstLine || 'Teams message';

    const attachments = [];
    if (msg.attachments?.length > 0) {
      for (const att of msg.attachments) {
        if (att.contentUrl) {
          const type = att.contentType?.startsWith('image/') ? 'image' : 'file';
          attachments.push(makeAttachment(att.contentUrl, type, att.name));
        }
      }
    }
    if (msg.hostedContents?.length > 0) {
      for (const hc of msg.hostedContents) {
        if (hc.contentBytes && hc.contentType?.startsWith('image/')) {
          const dataUrl = `data:${hc.contentType};base64,${hc.contentBytes}`;
          attachments.push(makeAttachment(dataUrl, 'image'));
        }
      }
    }

    const sender = msg.from?.user?.displayName
      || msg.from?.application?.displayName
      || 'unknown';
    const reactionCount = msg.reactions?.length || 0;

    return {
      id: `teams-${msg.id}`,
      title,
      description: body,
      hash: null,
      author: sender,
      timestamp: msg.createdDateTime || new Date().toISOString(),
      attachments,
      fields: {
        sender,
        channelName: channelId,
        hasAttachments: attachments.length > 0,
        importance: msg.importance || 'normal',
        reactionCount
      }
    };
  }

  validate(source) {
    if (!source.clientId) {
      return { valid: false, error: 'clientId is required (Azure AD application ID)' };
    }
    if (!source.secretName) {
      return { valid: false, error: 'secretName is required (Azure AD client secret)' };
    }
    if (!source.tenantId) {
      return { valid: false, error: 'tenantId is required (Azure AD tenant ID)' };
    }
    if (!source.teamId) {
      return { valid: false, error: 'teamId is required (Teams team ID)' };
    }
    if (!source.channelIds) {
      return { valid: false, error: 'channelIds is required (comma-separated channel IDs)' };
    }
    return { valid: true };
  }

  async poll(source, adapterState, getSecret) {
    const token = await this.acquireToken(source, getSecret);
    const channels = source.channelIds.split(',').map(c => c.trim()).filter(Boolean);
    const items = [];
    const newState = { ...adapterState, deltaLinks: { ...(adapterState.deltaLinks || {}) } };

    for (const channelId of channels) {
      try {
        const channelItems = await this.pollChannel(token, source.teamId, channelId, newState);
        items.push(...channelItems);
      } catch (err) {
        logger.warn(`msteams: failed to poll channel ${channelId}: ${err.message}`);
      }
    }

    return { items, state: newState };
  }

  /**
   * Poll a single channel using Graph API delta queries.
   * Delta links are stored per-channel in adapterState for incremental fetching.
   */
  async pollChannel(token, teamId, channelId, state) {
    const items = [];
    const deltaKey = `delta_${channelId}`;
    let url = state.deltaLinks?.[deltaKey];

    if (!url) {
      // First poll: establish delta baseline
      url = `${GRAPH_BASE}/teams/${teamId}/channels/${channelId}/messages/delta`;
    }

    let pageCount = 0;
    const MAX_PAGES = 10;

    while (url && pageCount < MAX_PAGES) {
      pageCount++;

      const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(15000)
      });

      if (!resp.ok) {
        // Delta token expired (410 Gone) - reset and start fresh
        if (resp.status === 410) {
          logger.warn(`msteams: delta token expired for channel ${channelId}, resetting`);
          delete state.deltaLinks[deltaKey];
          url = `${GRAPH_BASE}/teams/${teamId}/channels/${channelId}/messages/delta`;
          continue;
        }
        const text = await resp.text();
        throw new Error(`Graph API HTTP ${resp.status}: ${text}`);
      }

      const data = await resp.json();
      const messages = data.value || [];

      for (const msg of messages) {
        const item = this.messageToItem(msg, channelId);
        if (item) items.push(item);
      }

      if (data['@odata.nextLink']) {
        url = data['@odata.nextLink'];
      } else if (data['@odata.deltaLink']) {
        state.deltaLinks[deltaKey] = data['@odata.deltaLink'];
        url = null;
      } else {
        url = null;
      }
    }

    return items;
  }

  async test(source, getSecret) {
    const validation = this.validate(source);
    if (!validation.valid) {
      return { ok: false, message: validation.error };
    }

    try {
      const token = await this.acquireToken(source, getSecret);

      // Verify team access
      const teamResp = await fetch(`${GRAPH_BASE}/teams/${source.teamId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(10000)
      });

      if (!teamResp.ok) {
        const text = await teamResp.text();
        return { ok: false, message: `Team access failed (HTTP ${teamResp.status}): ${text}` };
      }

      const teamData = await teamResp.json();
      const channels = source.channelIds.split(',').map(c => c.trim()).filter(Boolean);

      // Verify first channel access
      const channelId = channels[0];
      const msgResp = await fetch(
        `${GRAPH_BASE}/teams/${source.teamId}/channels/${channelId}/messages?$top=3`,
        {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: AbortSignal.timeout(10000)
        }
      );

      if (!msgResp.ok) {
        const text = await msgResp.text();
        return { ok: false, message: `Channel access failed (HTTP ${msgResp.status}): ${text}` };
      }

      const msgData = await msgResp.json();
      const sampleItems = (msgData.value || []).slice(0, 3).map(msg => {
        const body = msg.body?.contentType === 'html'
          ? this.htmlToText(msg.body?.content || '')
          : (msg.body?.content || '');
        return {
          id: msg.id,
          title: (body || '').slice(0, 100) || 'Empty message',
          timestamp: msg.createdDateTime
        };
      });

      return {
        ok: true,
        message: `Connected to team "${teamData.displayName}". Testing ${channels.length} channel(s). First channel has ${msgData.value?.length || 0} recent messages.`,
        sampleItems
      };
    } catch (err) {
      return { ok: false, message: `Connection failed: ${err.message}` };
    }
  }
}
