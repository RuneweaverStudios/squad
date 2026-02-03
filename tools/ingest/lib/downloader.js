import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { createHash } from 'node:crypto';
import * as logger from './logger.js';

const BASE_DIR = join(process.env.HOME, '.local/share/jat/ingest-files');
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export async function downloadAttachments(sourceId, attachments, authHeaders = {}) {
  if (!attachments?.length) return [];

  const dir = join(BASE_DIR, sourceId);
  mkdirSync(dir, { recursive: true });

  const results = [];
  for (const att of attachments) {
    const result = await downloadWithRetry(att.url, dir, authHeaders, sourceId, att.name);
    results.push({ ...att, localPath: result.path, error: result.error });
  }
  return results;
}

async function downloadWithRetry(url, dir, headers, sourceId, attName) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const path = await downloadFile(url, dir, headers, attName);
      logger.info(`downloaded ${basename(path)} (${statSync(path).size} bytes)`, sourceId);
      return { path, error: null };
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        logger.warn(`Download retry ${attempt}/${MAX_RETRIES} for ${url}: ${err.message}`, sourceId);
        await sleep(RETRY_DELAY_MS * attempt);
      } else {
        logger.error(`Download failed after ${MAX_RETRIES} retries: ${url}: ${err.message}`, sourceId);
        return { path: null, error: `[IMAGE_DOWNLOAD_FAILED: ${url}]` };
      }
    }
  }
}

async function downloadFile(url, dir, headers, attName) {
  const resp = await fetch(url, {
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(30000)
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
  }

  // Generate filename: prefer attachment name from API, fall back to URL basename
  let filename = attName ? sanitizeFilename(attName) : sanitizeFilename(basename(new URL(url).pathname));
  if (!filename || filename === '/' || filename === 'download' || filename.length > 100) {
    const hash = createHash('md5').update(url).digest('hex').slice(0, 12);
    const contentType = resp.headers.get('content-type') || '';
    const ext = contentTypeToExt(contentType) || extname(new URL(url).pathname) || '.bin';
    filename = `${hash}${ext}`;
  }

  const filePath = join(dir, filename);
  const buffer = Buffer.from(await resp.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error(`Downloaded empty response for ${filename}`);
  }
  writeFileSync(filePath, buffer);
  return filePath;
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

function contentTypeToExt(ct) {
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'application/pdf': '.pdf'
  };
  for (const [type, ext] of Object.entries(map)) {
    if (ct.startsWith(type)) return ext;
  }
  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
