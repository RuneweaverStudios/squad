import { BaseAdapter, makeAttachment } from '../base.js';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

/** @type {import('../base.js').PluginMetadata} */
export const metadata = {
  type: 'signal',
  name: 'Signal',
  description: 'Ingest messages from Signal via signal-cli',
  version: '1.0.0',
  configFields: [
    {
      key: 'signalNumber',
      label: 'Phone Number',
      type: 'string',
      required: true,
      placeholder: '+12025551234',
      helpText: 'Registered Signal phone number (with country code)'
    },
    {
      key: 'cliPath',
      label: 'signal-cli Path',
      type: 'string',
      required: false,
      default: 'signal-cli',
      placeholder: 'signal-cli',
      helpText: 'Path to the signal-cli binary (default: signal-cli on PATH)'
    },
    {
      key: 'configDir',
      label: 'Config Directory',
      type: 'string',
      required: false,
      placeholder: '~/.local/share/signal-cli',
      helpText: 'signal-cli data directory (omit to use default)'
    },
    {
      key: 'trustAllKnown',
      label: 'Trust All Known Identities',
      type: 'boolean',
      required: false,
      default: true,
      helpText: 'Automatically trust known identity keys (avoids "untrusted identity" errors)'
    }
  ],
  itemFields: [
    { key: 'sender', label: 'Sender Number', type: 'string' },
    { key: 'senderName', label: 'Sender Name', type: 'string' },
    { key: 'isGroup', label: 'Is Group', type: 'boolean' },
    { key: 'groupName', label: 'Group Name', type: 'string' },
    { key: 'hasAttachment', label: 'Has Attachment', type: 'boolean' },
    {
      key: 'messageType',
      label: 'Message Type',
      type: 'enum',
      values: ['text', 'image', 'file']
    }
  ]
};

export default class SignalAdapter extends BaseAdapter {
  constructor() {
    super('signal');
    /** @type {import('node:child_process').ChildProcess | null} */
    this._proc = null;
    /** @type {number} */
    this._rpcId = 0;
    /** @type {Map<number, {resolve: Function, reject: Function}>} */
    this._pending = new Map();
    /** @type {import('../base.js').RealtimeCallbacks | null} */
    this._callbacks = null;
    /** @type {string} */
    this._lineBuf = '';
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  /**
   * Build base args for signal-cli commands.
   * @param {Object} source
   * @returns {string[]}
   */
  _baseArgs(source) {
    const args = [];
    if (source.configDir) {
      args.push('--config', source.configDir);
    }
    if (source.trustAllKnown) {
      args.push('--trust-new-identities', 'always');
    }
    args.push('-a', source.signalNumber, '-o', 'json');
    return args;
  }

  /**
   * Resolve the signal-cli binary path.
   * @param {Object} source
   * @returns {string}
   */
  _cli(source) {
    return source.cliPath || 'signal-cli';
  }

  // ─── Required: validate ───────────────────────────────────────────────

  validate(source) {
    if (!source.signalNumber) {
      return { valid: false, error: 'signalNumber is required' };
    }
    if (!/^\+\d{7,15}$/.test(source.signalNumber)) {
      return { valid: false, error: 'signalNumber must be E.164 format (e.g. +12025551234)' };
    }
    return { valid: true };
  }

  // ─── Required: poll ───────────────────────────────────────────────────

  async poll(source, adapterState, _getSecret) {
    const cli = this._cli(source);
    const args = [...this._baseArgs(source), 'receive', '--json', '--timeout', '1'];

    const output = await runCli(cli, args, 15_000);
    const lines = output.split('\n').filter(l => l.trim());

    const lastTimestamp = adapterState.lastTimestamp || 0;
    let newestTimestamp = lastTimestamp;
    const items = [];

    for (const line of lines) {
      let envelope;
      try {
        const parsed = JSON.parse(line);
        envelope = parsed.envelope || parsed;
      } catch {
        continue;
      }

      const item = envelopeToItem(envelope);
      if (!item) continue;

      const ts = new Date(item.timestamp).getTime();
      if (ts <= lastTimestamp) continue;
      if (ts > newestTimestamp) newestTimestamp = ts;

      items.push(item);
    }

    return {
      items,
      state: { ...adapterState, lastTimestamp: newestTimestamp }
    };
  }

  // ─── Required: test ───────────────────────────────────────────────────

  async test(source, _getSecret) {
    const validation = this.validate(source);
    if (!validation.valid) {
      return { ok: false, message: validation.error };
    }

    try {
      const cli = this._cli(source);

      // Check if signal-cli is installed
      let version;
      try {
        version = execFileSync(cli, ['--version'], { timeout: 10_000, encoding: 'utf8' }).trim();
      } catch {
        return { ok: false, message: `signal-cli not found at "${cli}". Install from https://github.com/AsamK/signal-cli` };
      }

      // Check if the number is registered
      const baseArgs = [];
      if (source.configDir) baseArgs.push('--config', source.configDir);
      baseArgs.push('-o', 'json');

      let accounts;
      try {
        const output = execFileSync(cli, [...baseArgs, 'listAccounts'], {
          timeout: 10_000,
          encoding: 'utf8'
        }).trim();
        accounts = output ? JSON.parse(output) : [];
      } catch {
        accounts = [];
      }

      const registered = Array.isArray(accounts) &&
        accounts.some(a => a.number === source.signalNumber);

      if (!registered) {
        return {
          ok: false,
          message: `Number ${source.signalNumber} is not registered with signal-cli (${version}). Run: signal-cli -a ${source.signalNumber} register`
        };
      }

      return {
        ok: true,
        message: `signal-cli ${version} — account ${source.signalNumber} registered`
      };
    } catch (err) {
      return { ok: false, message: `Test failed: ${err.message}` };
    }
  }

  // ─── Realtime Interface ───────────────────────────────────────────────

  get supportsRealtime() {
    return true;
  }

  get supportsSend() {
    return true;
  }

  async connect(source, _getSecret, callbacks) {
    if (this._proc) {
      await this.disconnect();
    }

    this._callbacks = callbacks;
    const cli = this._cli(source);
    const args = [...this._baseArgs(source), 'jsonRpc'];

    this._proc = spawn(cli, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    this._lineBuf = '';

    this._proc.stdout.on('data', (chunk) => {
      this._lineBuf += chunk.toString();
      let newlineIdx;
      while ((newlineIdx = this._lineBuf.indexOf('\n')) !== -1) {
        const line = this._lineBuf.slice(0, newlineIdx).trim();
        this._lineBuf = this._lineBuf.slice(newlineIdx + 1);
        if (line) this._handleRpcLine(line);
      }
    });

    this._proc.stderr.on('data', (chunk) => {
      const msg = chunk.toString().trim();
      if (msg && callbacks.onError) {
        callbacks.onError(new Error(`signal-cli stderr: ${msg}`));
      }
    });

    this._proc.on('close', (code) => {
      this._proc = null;
      if (callbacks.onDisconnect) {
        callbacks.onDisconnect(`signal-cli exited with code ${code}`);
      }
    });

    this._proc.on('error', (err) => {
      this._proc = null;
      if (callbacks.onError) {
        callbacks.onError(err);
      }
    });
  }

  async disconnect() {
    if (this._proc) {
      this._proc.stdin.end();
      this._proc.kill('SIGTERM');
      this._proc = null;
    }
    this._pending.clear();
    this._callbacks = null;
    this._lineBuf = '';
  }

  async send(target, message, _getSecret) {
    if (!this._proc) {
      throw new Error('signal: not connected. Call connect() first or use poll mode.');
    }

    const params = { message: message.text };

    if (target.channelId) {
      // channelId is treated as a group ID (base64 encoded)
      params.groupId = target.channelId;
    } else if (target.userId) {
      params.recipient = [target.userId];
    } else {
      throw new Error('signal: send() requires target.channelId (group) or target.userId (number)');
    }

    if (message.attachments?.length) {
      params.attachments = message.attachments
        .filter(a => a.localPath)
        .map(a => a.localPath);
    }

    await this._rpcCall('send', params);
  }

  // ─── JSON-RPC internals ───────────────────────────────────────────────

  /**
   * Send a JSON-RPC request and wait for the response.
   * @param {string} method
   * @param {Object} params
   * @returns {Promise<*>}
   */
  _rpcCall(method, params) {
    if (!this._proc?.stdin?.writable) {
      return Promise.reject(new Error('signal-cli process not running'));
    }

    const id = ++this._rpcId;
    const request = JSON.stringify({ jsonrpc: '2.0', method, params, id });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`signal-cli RPC timeout for ${method}`));
      }, 30_000);

      this._pending.set(id, {
        resolve: (result) => { clearTimeout(timer); resolve(result); },
        reject: (err) => { clearTimeout(timer); reject(err); }
      });

      this._proc.stdin.write(request + '\n');
    });
  }

  /**
   * Handle a single line of JSON-RPC output.
   * @param {string} line
   */
  _handleRpcLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }

    // Response to a request we made
    if (msg.id != null && this._pending.has(msg.id)) {
      const { resolve, reject } = this._pending.get(msg.id);
      this._pending.delete(msg.id);
      if (msg.error) {
        reject(new Error(`RPC error ${msg.error.code}: ${msg.error.message}`));
      } else {
        resolve(msg.result);
      }
      return;
    }

    // Incoming notification (received message)
    if (msg.method === 'receive' && msg.params?.envelope) {
      const item = envelopeToItem(msg.params.envelope);
      if (item && this._callbacks?.onMessage) {
        this._callbacks.onMessage(item);
      }
    }
  }
}

// ─── Shared Helpers ───────────────────────────────────────────────────────

/**
 * Run signal-cli as a subprocess and return stdout.
 * @param {string} cli - Path to signal-cli
 * @param {string[]} args
 * @param {number} timeoutMs
 * @returns {Promise<string>}
 */
function runCli(cli, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cli, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`signal-cli timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`signal-cli exited ${code}: ${stderr.trim()}`));
      } else {
        resolve(stdout);
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Convert a signal-cli envelope to an IngestItem.
 * Returns null for envelopes that aren't user messages (receipts, typing, etc.).
 *
 * @param {Object} envelope
 * @returns {import('../base.js').IngestItem | null}
 */
function envelopeToItem(envelope) {
  const data = envelope.dataMessage;
  if (!data) return null;

  const text = data.message || '';
  const hasAttachments = Array.isArray(data.attachments) && data.attachments.length > 0;

  // Skip empty messages with no attachments
  if (!text && !hasAttachments) return null;

  const source = envelope.sourceNumber || envelope.source || '';
  const sourceName = envelope.sourceName || '';
  const timestamp = data.timestamp
    ? new Date(data.timestamp).toISOString()
    : new Date().toISOString();

  // Group info
  const groupInfo = data.groupInfo || null;
  const isGroup = !!groupInfo;
  const groupName = groupInfo?.groupName || groupInfo?.name || '';
  const groupId = groupInfo?.groupId || '';

  // Build unique ID
  const idBase = `signal-${source}-${data.timestamp || Date.now()}`;

  // Attachments
  const attachments = [];
  let messageType = 'text';

  if (hasAttachments) {
    for (const att of data.attachments) {
      const contentType = att.contentType || '';
      const isImage = contentType.startsWith('image/');
      const type = isImage ? 'image' : 'file';

      if (isImage && messageType === 'text') messageType = 'image';
      if (!isImage && messageType === 'text') messageType = 'file';

      attachments.push(makeAttachment(
        att.id || att.filename || '',
        type,
        att.filename || null
      ));
    }
  }

  const firstLine = text.split('\n')[0];
  const title = firstLine
    ? (firstLine.length > 200 ? firstLine.slice(0, 200) + '...' : firstLine)
    : (hasAttachments ? 'Signal attachment' : 'Signal message');

  const hash = createHash('sha256')
    .update(`${source}:${data.timestamp}:${text}`)
    .digest('hex');

  // Detect reply (quoted message)
  const quote = data.quote;
  let replyTo;
  if (quote?.id && quote?.author) {
    replyTo = `signal-${quote.author}-${quote.id}`;
  }

  return {
    id: idBase,
    title,
    description: text,
    hash,
    author: sourceName || source,
    timestamp,
    attachments,
    replyTo,
    fields: {
      sender: source,
      senderName: sourceName,
      isGroup,
      groupName: isGroup ? groupName : '',
      hasAttachment: hasAttachments,
      messageType
    },
    origin: {
      adapterType: 'signal',
      channelId: isGroup ? groupId : null,
      senderId: source,
      threadId: data.timestamp ? String(data.timestamp) : null,
      metadata: { isGroup }
    }
  };
}
