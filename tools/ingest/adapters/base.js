/**
 * Base adapter interface. All adapters must implement:
 *
 * poll(sourceConfig, adapterState, getSecret) -> { items[], state }
 *   - items: Array of { id, title, description, hash, author, timestamp, attachments[] }
 *   - state: Updated adapter state to persist (offsets, cursors, etc.)
 *
 * validate(sourceConfig) -> { valid: boolean, error?: string }
 *   - Check config has required fields without making network calls
 *
 * test(sourceConfig, getSecret) -> { ok: boolean, message: string, sampleItems?: item[] }
 *   - Make a real connection and return sample items
 */

export class BaseAdapter {
  constructor(type) {
    this.type = type;
  }

  async poll(_sourceConfig, _adapterState, _getSecret) {
    throw new Error(`${this.type}: poll() not implemented`);
  }

  validate(_sourceConfig) {
    return { valid: true };
  }

  async test(_sourceConfig, _getSecret) {
    throw new Error(`${this.type}: test() not implemented`);
  }

  async pollReplies(_source, _threads, _getSecret) {
    return [];
  }
}

/**
 * Create an attachment object for items.
 */
export function makeAttachment(url, type = 'image', filename = null) {
  return { url, type, filename };
}
