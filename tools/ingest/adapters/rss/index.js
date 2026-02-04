import RssParser from 'rss-parser';
import { createHash } from 'node:crypto';
import { BaseAdapter, makeAttachment } from '../base.js';

const parser = new RssParser({
  timeout: 15000,
  headers: {
    'User-Agent': 'jat-ingest/1.0'
  }
});

/** @type {import('../base.js').PluginMetadata} */
export const metadata = {
  type: 'rss',
  name: 'RSS Feed',
  description: 'Ingest items from RSS and Atom feeds',
  version: '1.0.0',
  configFields: [
    {
      key: 'feedUrl',
      label: 'Feed URL',
      type: 'string',
      required: true,
      placeholder: 'https://example.com/feed.xml',
      helpText: 'The URL of the RSS or Atom feed'
    }
  ],
  itemFields: [
    { key: 'category', label: 'Category', type: 'string' },
    { key: 'author', label: 'Author', type: 'string' },
    { key: 'hasImage', label: 'Has Image', type: 'boolean' }
  ]
};

export default class RssAdapter extends BaseAdapter {
  constructor() {
    super('rss');
  }

  validate(source) {
    if (!source.feedUrl) {
      return { valid: false, error: 'feedUrl is required' };
    }
    try {
      new URL(source.feedUrl);
    } catch {
      return { valid: false, error: `Invalid feedUrl: ${source.feedUrl}` };
    }
    return { valid: true };
  }

  async poll(source, adapterState, _getSecret) {
    const fetchOpts = {};
    if (adapterState.etag) {
      fetchOpts.headers = { ...fetchOpts.headers, 'If-None-Match': adapterState.etag };
    }
    if (adapterState.lastModified) {
      fetchOpts.headers = { ...fetchOpts.headers, 'If-Modified-Since': adapterState.lastModified };
    }

    let feed;
    try {
      feed = await parser.parseURL(source.feedUrl);
    } catch (err) {
      if (err.message?.includes('304')) {
        return { items: [], state: adapterState };
      }
      throw err;
    }

    const lastSeenId = adapterState.lastSeenId || null;
    const lastSeenDate = adapterState.lastSeenDate || null;
    const items = [];
    let newestId = lastSeenId;
    let newestDate = lastSeenDate;

    for (const entry of feed.items || []) {
      const itemId = entry.guid || entry.link || entry.id;
      if (!itemId) continue;

      // Skip items we've already seen by ID
      if (itemId === lastSeenId) break;

      // Skip items older than what we've seen
      const pubDate = entry.pubDate || entry.isoDate;
      if (lastSeenDate && pubDate) {
        try {
          if (new Date(pubDate) <= new Date(lastSeenDate)) continue;
        } catch { /* ignore bad dates */ }
      }

      const attachments = extractImages(entry);
      const hash = createHash('sha256')
        .update(itemId + (entry.title || '') + (entry.contentSnippet || ''))
        .digest('hex')
        .slice(0, 16);

      const category = entry.categories?.[0] || null;
      const author = entry.creator || entry.author || null;

      items.push({
        id: itemId,
        title: entry.title || 'Untitled',
        description: buildDescription(entry),
        hash,
        author,
        timestamp: pubDate || new Date().toISOString(),
        attachments,
        fields: {
          category: category || '',
          author: author || '',
          hasImage: attachments.length > 0
        }
      });

      if (!newestId) {
        newestId = itemId;
        newestDate = pubDate || new Date().toISOString();
      }
    }

    const newState = {
      ...adapterState,
      lastSeenId: newestId || lastSeenId,
      lastSeenDate: newestDate || lastSeenDate
    };

    return { items, state: newState };
  }

  async test(source, _getSecret) {
    const validation = this.validate(source);
    if (!validation.valid) {
      return { ok: false, message: validation.error };
    }

    try {
      const feed = await parser.parseURL(source.feedUrl);
      const sampleItems = (feed.items || []).slice(0, 3).map(entry => ({
        id: entry.guid || entry.link || entry.id || 'unknown',
        title: entry.title || 'Untitled',
        description: (entry.contentSnippet || '').slice(0, 200),
        timestamp: entry.pubDate || entry.isoDate || null
      }));

      return {
        ok: true,
        message: `Feed "${feed.title || source.feedUrl}" has ${feed.items?.length || 0} items`,
        sampleItems
      };
    } catch (err) {
      return { ok: false, message: `Feed error: ${err.message}` };
    }
  }
}

function extractImages(entry) {
  const images = [];

  // Check enclosures
  if (entry.enclosure?.url && isImageUrl(entry.enclosure.url)) {
    images.push(makeAttachment(entry.enclosure.url, 'image'));
  }

  // Check media content (Media RSS)
  const media = entry['media:content'] || entry.media;
  if (media?.$.url && isImageUrl(media.$.url)) {
    images.push(makeAttachment(media.$.url, 'image'));
  }

  // Extract first image from HTML content
  const content = entry.content || entry['content:encoded'] || '';
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch && !images.some(a => a.url === imgMatch[1])) {
    images.push(makeAttachment(imgMatch[1], 'image'));
  }

  return images;
}

function isImageUrl(url) {
  return /\.(jpg|jpeg|png|gif|webp|svg|avif)(\?|$)/i.test(url);
}

function buildDescription(entry) {
  const parts = [];

  if (entry.contentSnippet) {
    parts.push(entry.contentSnippet.slice(0, 1000));
  } else if (entry.content) {
    // Strip HTML for plain text
    const text = entry.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    parts.push(text.slice(0, 1000));
  }

  if (entry.link) {
    parts.push(`\nSource: ${entry.link}`);
  }

  return parts.join('\n') || 'No description';
}
