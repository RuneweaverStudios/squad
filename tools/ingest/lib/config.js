import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import * as logger from './logger.js';

const CONFIG_PATH = join(process.env.HOME, '.config/jat/feeds.json');

let cachedConfig = null;
let cachedMtime = 0;

const VALID_TYPES = ['telegram', 'slack', 'rss', 'gmail'];

export function loadConfig() {
  let raw;
  try {
    raw = readFileSync(CONFIG_PATH, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      logger.error(`Config not found: ${CONFIG_PATH}`);
      logger.info('Create it with: jat-ingest-test --init');
      return { version: 1, sources: [] };
    }
    throw err;
  }

  const config = JSON.parse(raw);
  validate(config);
  return config;
}

export function getConfig(forceReload = false) {
  try {
    const st = statSync(CONFIG_PATH);
    const mtime = st.mtimeMs;
    if (!forceReload && cachedConfig && mtime === cachedMtime) {
      return cachedConfig;
    }
    cachedConfig = loadConfig();
    cachedMtime = mtime;
    return cachedConfig;
  } catch (err) {
    if (cachedConfig) {
      logger.warn(`Config reload failed, using cached: ${err.message}`);
      return cachedConfig;
    }
    return loadConfig();
  }
}

export function getEnabledSources() {
  const config = getConfig();
  return config.sources.filter(s => s.enabled !== false);
}

function validate(config) {
  if (!config.sources || !Array.isArray(config.sources)) {
    throw new Error('feeds.json must have a "sources" array');
  }
  const ids = new Set();
  for (const src of config.sources) {
    if (!src.id) throw new Error('Each source must have an "id"');
    if (ids.has(src.id)) throw new Error(`Duplicate source id: ${src.id}`);
    ids.add(src.id);

    if (!VALID_TYPES.includes(src.type)) {
      throw new Error(`Invalid source type "${src.type}" for ${src.id}. Must be: ${VALID_TYPES.join(', ')}`);
    }
    if (!src.project) {
      throw new Error(`Source ${src.id} must have a "project" field`);
    }
    if (src.type === 'rss' && !src.feedUrl) {
      throw new Error(`RSS source ${src.id} must have a "feedUrl"`);
    }
    if (src.type === 'telegram' && !src.chatId) {
      throw new Error(`Telegram source ${src.id} must have a "chatId"`);
    }
    if (src.type === 'slack' && !src.channel) {
      throw new Error(`Slack source ${src.id} must have a "channel"`);
    }
    if (src.type === 'gmail' && !src.imapUser) {
      throw new Error(`Gmail source ${src.id} must have an "imapUser" (email address)`);
    }
    if (src.type === 'gmail' && !src.folder) {
      throw new Error(`Gmail source ${src.id} must have a "folder" (Gmail label name)`);
    }
  }
}

export function getSecret(secretName) {
  try {
    const value = execFileSync('jat-secret', [secretName], {
      encoding: 'utf-8',
      timeout: 5000
    }).trim();
    if (!value) throw new Error('empty value');
    return value;
  } catch (err) {
    throw new Error(`Failed to get secret "${secretName}": ${err.message}. Configure via Settings -> API Keys -> Custom Keys`);
  }
}

export function configPath() {
  return CONFIG_PATH;
}
