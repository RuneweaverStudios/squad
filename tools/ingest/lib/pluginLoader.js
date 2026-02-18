/**
 * Plugin loader with dynamic discovery from built-in and user directories.
 *
 * Scans two directories for plugins:
 *   1. Built-in: tools/ingest/adapters/{name}/index.js
 *   2. User:     ~/.config/squad/ingest-plugins/{name}/index.js
 *
 * User plugins override built-in if they share the same type.
 * Broken plugins log warnings but never crash the loader.
 */

import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateMetadata, validateAdapterClass } from './pluginSchema.js';
import * as logger from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Built-in adapters directory */
const BUILTIN_DIR = join(__dirname, '..', 'adapters');

/** User plugins directory */
const USER_DIR = join(process.env.HOME, '.config', 'squad', 'ingest-plugins');

/**
 * @typedef {Object} LoadedPlugin
 * @property {import('../adapters/base.js').PluginMetadata} metadata
 * @property {Function} AdapterClass - The adapter constructor
 * @property {string} path - Absolute path to the plugin directory
 * @property {boolean} isBuiltin - Whether this is a built-in adapter
 */

/**
 * @typedef {Object} PluginInfo
 * @property {string} type - Plugin type identifier
 * @property {string} name - Display name
 * @property {string} description
 * @property {string} version
 * @property {string} path - Plugin directory path
 * @property {boolean} isBuiltin
 * @property {boolean} enabled - True if loaded successfully
 * @property {string} [error] - Error message if loading failed
 */

/**
 * Load a single plugin from a directory path.
 *
 * Imports the plugin's index.js, validates metadata and adapter class.
 * Returns null with a logged warning on any failure.
 *
 * @param {string} pluginPath - Absolute path to the plugin directory
 * @returns {Promise<{metadata: import('../adapters/base.js').PluginMetadata, AdapterClass: Function} | null>}
 */
export async function loadPlugin(pluginPath) {
  const indexPath = join(pluginPath, 'index.js');

  if (!existsSync(indexPath)) {
    logger.warn(`No index.js found in ${pluginPath}`);
    return null;
  }

  let mod;
  try {
    mod = await import(indexPath);
  } catch (err) {
    logger.warn(`Failed to import ${indexPath}: ${err.message}`);
    return null;
  }

  // Validate metadata export
  const metadata = mod.metadata;
  if (!metadata) {
    logger.warn(`Plugin at ${pluginPath} has no 'metadata' export`);
    return null;
  }

  const metaResult = validateMetadata(metadata);
  if (!metaResult.valid) {
    logger.warn(`Invalid metadata in ${pluginPath}: ${metaResult.errors.join('; ')}`);
    return null;
  }

  // Validate adapter class (default export)
  const AdapterClass = mod.default;
  if (!AdapterClass) {
    logger.warn(`Plugin at ${pluginPath} has no default export (adapter class)`);
    return null;
  }

  const classResult = validateAdapterClass(AdapterClass);
  if (!classResult.valid) {
    logger.warn(`Invalid adapter in ${pluginPath}: ${classResult.errors.join('; ')}`);
    return null;
  }

  return { metadata, AdapterClass };
}

/**
 * List subdirectories in a directory. Returns empty array if directory doesn't exist.
 *
 * @param {string} dir
 * @returns {string[]} Absolute paths to subdirectories
 */
function listPluginDirs(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  try {
    return readdirSync(dir)
      .filter(name => !name.startsWith('.'))
      .map(name => join(dir, name))
      .filter(path => {
        try {
          return statSync(path).isDirectory();
        } catch {
          return false;
        }
      });
  } catch (err) {
    logger.warn(`Failed to read directory ${dir}: ${err.message}`);
    return [];
  }
}

/**
 * Discover and load plugins from both built-in and user directories.
 *
 * Scans:
 *   1. Built-in: tools/ingest/adapters/{name}/index.js
 *   2. User:     ~/.config/squad/ingest-plugins/{name}/index.js
 *
 * User plugins override built-in if they share the same type.
 *
 * @returns {Promise<Map<string, LoadedPlugin>>} Map keyed by metadata.type
 */
export async function discoverPlugins() {
  /** @type {Map<string, LoadedPlugin>} */
  const plugins = new Map();

  // 1. Load built-in adapters
  const builtinDirs = listPluginDirs(BUILTIN_DIR);
  for (const dir of builtinDirs) {
    const result = await loadPlugin(dir);
    if (result) {
      plugins.set(result.metadata.type, {
        metadata: result.metadata,
        AdapterClass: result.AdapterClass,
        path: dir,
        isBuiltin: true
      });
      logger.info(`Loaded built-in plugin: ${result.metadata.type} (${result.metadata.name} v${result.metadata.version})`);
    }
  }

  // 2. Load user plugins (override built-in on collision)
  const userDirs = listPluginDirs(USER_DIR);
  for (const dir of userDirs) {
    const result = await loadPlugin(dir);
    if (result) {
      const type = result.metadata.type;
      if (plugins.has(type)) {
        logger.info(`User plugin "${type}" overrides built-in (from ${dir})`);
      }
      plugins.set(type, {
        metadata: result.metadata,
        AdapterClass: result.AdapterClass,
        path: dir,
        isBuiltin: false
      });
      logger.info(`Loaded user plugin: ${type} (${result.metadata.name} v${result.metadata.version})`);
    }
  }

  return plugins;
}

/**
 * Get a summary of all installed plugins for IDE API consumption.
 *
 * Includes both successfully loaded plugins and broken ones (with error flag).
 *
 * @returns {Promise<PluginInfo[]>}
 */
export async function getInstalledPlugins() {
  /** @type {PluginInfo[]} */
  const results = [];

  // Scan built-in
  for (const dir of listPluginDirs(BUILTIN_DIR)) {
    results.push(await probePlugin(dir, true));
  }

  // Scan user
  for (const dir of listPluginDirs(USER_DIR)) {
    results.push(await probePlugin(dir, false));
  }

  return results;
}

/**
 * Probe a single plugin directory and return info (even if broken).
 *
 * @param {string} pluginPath
 * @param {boolean} isBuiltin
 * @returns {Promise<PluginInfo>}
 */
async function probePlugin(pluginPath, isBuiltin) {
  const dirName = pluginPath.split('/').pop();

  const result = await loadPlugin(pluginPath);
  if (result) {
    return {
      type: result.metadata.type,
      name: result.metadata.name,
      description: result.metadata.description,
      version: result.metadata.version,
      path: pluginPath,
      isBuiltin,
      enabled: true
    };
  }

  // Plugin failed to load - return with error info
  return {
    type: dirName,
    name: dirName,
    description: '',
    version: '',
    path: pluginPath,
    isBuiltin,
    enabled: false,
    error: `Failed to load plugin from ${pluginPath}`
  };
}
