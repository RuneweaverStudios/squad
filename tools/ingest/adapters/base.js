// ─── Plugin Metadata Types ──────────────────────────────────────────────────

/**
 * @typedef {'string' | 'number' | 'boolean' | 'secret' | 'select' | 'multiselect'} ConfigFieldType
 */

/**
 * A field descriptor for source-specific configuration.
 * These drive dynamic form rendering in the IDE.
 *
 * @typedef {Object} ConfigField
 * @property {string} key - Unique key (used in source config object)
 * @property {string} label - Human-readable label for the form
 * @property {ConfigFieldType} type - Field type
 * @property {boolean} [required=false] - Whether the field is required
 * @property {*} [default] - Default value
 * @property {Array<{value: string, label: string}>} [options] - For select/multiselect types
 * @property {string} [placeholder] - Input placeholder text
 * @property {string} [helpText] - Small text displayed below the input
 */

/**
 * @typedef {'string' | 'enum' | 'number' | 'boolean'} ItemFieldType
 */

/**
 * A field descriptor for filterable properties on ingested items.
 * Declared by the plugin, used by the filter engine and filter UI.
 *
 * @typedef {Object} ItemField
 * @property {string} key - Field key (matches key in item.fields)
 * @property {string} label - Human-readable label
 * @property {ItemFieldType} type - Field type
 * @property {string[]} [values] - Allowed values (required for enum type)
 */

/**
 * @typedef {Object} FilterCondition
 * @property {string} field - Field key (must match an itemField key)
 * @property {'equals' | 'not_equals' | 'contains' | 'starts_with' | 'ends_with' | 'regex' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in'} operator
 * @property {*} value - Comparison value
 */

/**
 * Plugin metadata. Every plugin must export this as `metadata`.
 *
 * @typedef {Object} PluginMetadata
 * @property {string} type - Unique identifier (e.g. 'rss', 'slack', 'cloudflare')
 * @property {string} name - Display name (e.g. 'RSS Feed')
 * @property {string} description - Short description of what this plugin ingests
 * @property {string} version - Semver version string (e.g. '1.0.0')
 * @property {string} [author] - Plugin author
 * @property {ConfigField[]} configFields - Source-specific configuration fields
 * @property {ItemField[]} itemFields - Filterable fields on ingested items
 * @property {FilterCondition[]} [defaultFilter] - Default filter conditions
 */

// ─── Item Types ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Attachment
 * @property {string} url - Resource URL
 * @property {string} [type='image'] - Attachment type (image, file, etc.)
 * @property {string} [filename] - Original filename
 * @property {string} [localPath] - Path if already downloaded locally
 */

/**
 * An ingested item returned by poll().
 *
 * @typedef {Object} IngestItem
 * @property {string} id - Unique item identifier (within this source)
 * @property {string} title - Item title
 * @property {string} description - Item body/description
 * @property {string} hash - Content hash for dedup (hex string)
 * @property {string} [author] - Item author
 * @property {string} timestamp - ISO 8601 timestamp
 * @property {Attachment[]} [attachments] - Attached media
 * @property {Record<string, string|number|boolean>} [fields] - Plugin-declared filterable fields
 */

/**
 * Result from poll().
 *
 * @typedef {Object} PollResult
 * @property {IngestItem[]} items - New items found
 * @property {Object} state - Updated adapter state to persist
 */

/**
 * Result from validate().
 *
 * @typedef {Object} ValidateResult
 * @property {boolean} valid
 * @property {string} [error] - Error message if invalid
 */

/**
 * Result from test().
 *
 * @typedef {Object} TestResult
 * @property {boolean} ok
 * @property {string} message
 * @property {IngestItem[]} [sampleItems]
 */

// ─── Base Adapter ───────────────────────────────────────────────────────────

/**
 * Base adapter class. All plugin adapters must extend this.
 *
 * A plugin module exports:
 *   export const metadata = { type, name, description, version, configFields, itemFields, ... };
 *   export default class MyAdapter extends BaseAdapter { ... }
 *
 * Required methods to implement:
 * - poll(sourceConfig, adapterState, getSecret) -> PollResult
 * - test(sourceConfig, getSecret) -> TestResult
 *
 * Optional overrides:
 * - validate(sourceConfig) -> ValidateResult
 * - pollReplies(source, threads, getSecret) -> replies[]
 */
export class BaseAdapter {
  /** @param {string} type - Adapter type identifier */
  constructor(type) {
    this.type = type;
  }

  /**
   * Poll for new items from the source.
   *
   * @param {Object} sourceConfig - Source configuration (from integrations.json)
   * @param {Object} adapterState - Persisted adapter state (cursors, offsets)
   * @param {(name: string) => string} getSecret - Retrieve a secret by name
   * @returns {Promise<PollResult>}
   */
  async poll(_sourceConfig, _adapterState, _getSecret) {
    throw new Error(`${this.type}: poll() not implemented`);
  }

  /**
   * Validate source configuration without making network calls.
   *
   * @param {Object} sourceConfig - Source configuration to validate
   * @returns {ValidateResult}
   */
  validate(_sourceConfig) {
    return { valid: true };
  }

  /**
   * Test the connection by making a real request and returning sample items.
   *
   * @param {Object} sourceConfig - Source configuration
   * @param {(name: string) => string} getSecret - Retrieve a secret by name
   * @returns {Promise<TestResult>}
   */
  async test(_sourceConfig, _getSecret) {
    throw new Error(`${this.type}: test() not implemented`);
  }

  /**
   * Poll for replies to tracked threads (optional, used by Slack).
   *
   * @param {Object} source - Source configuration
   * @param {Array} threads - Active threads to check
   * @param {(name: string) => string} getSecret - Retrieve a secret by name
   * @returns {Promise<Array>}
   */
  async pollReplies(_source, _threads, _getSecret) {
    return [];
  }
}

/**
 * Create an attachment object for items.
 *
 * @param {string} url - Resource URL
 * @param {string} [type='image'] - Attachment type
 * @param {string} [filename=null] - Original filename
 * @returns {Attachment}
 */
export function makeAttachment(url, type = 'image', filename = null) {
  return { url, type, filename };
}
