import { readFileSync, statSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import * as logger from './logger.js';

const CONFIG_DIR = join(process.env.HOME, '.config/squad');
const CONFIG_PATH = join(CONFIG_DIR, 'integrations.json');
const LEGACY_PATH = join(CONFIG_DIR, 'feeds.json');

let cachedConfig = null;
let cachedMtime = 0;

/** Resolve config path with automatic migration from feeds.json */
function resolveConfigPath() {
  if (existsSync(CONFIG_PATH)) return CONFIG_PATH;
  if (existsSync(LEGACY_PATH)) {
    logger.info(`Migrating ${LEGACY_PATH} → ${CONFIG_PATH}`);
    copyFileSync(LEGACY_PATH, CONFIG_PATH);
    return CONFIG_PATH;
  }
  return CONFIG_PATH;
}

export function loadConfig() {
  const path = resolveConfigPath();
  let raw;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      logger.error(`Config not found: ${path}`);
      logger.info('Create it with: squad-ingest-test --init');
      return { version: 1, sources: [] };
    }
    throw err;
  }

  const config = JSON.parse(raw);
  validate(config);
  return config;
}

export function getConfig(forceReload = false) {
  const path = resolveConfigPath();
  try {
    const st = statSync(path);
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
    throw new Error('integrations.json must have a "sources" array');
  }
  const ids = new Set();
  for (const src of config.sources) {
    if (!src.id) throw new Error('Each source must have an "id"');
    if (ids.has(src.id)) throw new Error(`Duplicate source id: ${src.id}`);
    ids.add(src.id);

    if (!src.type) {
      throw new Error(`Source ${src.id} must have a "type" field`);
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
    if (src.debounceMs !== undefined && src.debounceMs !== true && src.debounceMs !== false) {
      const ms = Number(src.debounceMs);
      if (isNaN(ms) || ms < 0) {
        throw new Error(`Source ${src.id}: debounceMs must be a non-negative number, true, or false`);
      }
    }
  }
}

export function getSecret(secretName) {
  try {
    const value = execFileSync('squad-secret', [secretName], {
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
