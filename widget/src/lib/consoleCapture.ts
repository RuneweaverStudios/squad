import type { ConsoleLogEntry } from './types';
import { filterSensitiveData } from './sensitiveFilter';

let maxEntries = 50;
const capturedLogs: ConsoleLogEntry[] = [];
let capturing = false;

const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug,
  trace: console.trace,
};

function safeStringify(arg: unknown): string {
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
  if (typeof arg === 'symbol') return arg.toString();
  if (typeof arg === 'function') return `[Function: ${arg.name || 'anonymous'}]`;

  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}${arg.stack ? '\n' + arg.stack : ''}`;
  }

  if (typeof arg === 'object') {
    try {
      const seen = new WeakSet();
      return JSON.stringify(arg, (_key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return '[Circular]';
          seen.add(value);
        }
        if (typeof value === 'function') return `[Function: ${value.name || 'anonymous'}]`;
        if (value instanceof Error) return `${value.name}: ${value.message}`;
        return value;
      }, 2);
    } catch {
      return '[Object - stringify failed]';
    }
  }

  return String(arg);
}

function captureStackInfo(): { stackTrace?: string; lineNumber?: number; columnNumber?: number; fileName?: string } {
  const stack = new Error().stack;
  if (!stack) return {};

  const lines = stack.split('\n');
  // Skip Error, captureStackInfo, createLogEntry, console override
  const relevantLines = lines.slice(4);
  const stackTrace = relevantLines.join('\n');

  const firstLine = relevantLines[0] || '';
  const locationMatch = firstLine.match(/(?:at\s+(?:\S+\s+)?\()?([^()]+):(\d+):(\d+)\)?/);

  if (locationMatch) {
    return {
      stackTrace,
      fileName: locationMatch[1],
      lineNumber: parseInt(locationMatch[2], 10),
      columnNumber: parseInt(locationMatch[3], 10),
    };
  }

  return { stackTrace };
}

function createLogEntry(type: ConsoleLogEntry['type'], args: unknown[], includeStack: boolean): ConsoleLogEntry {
  const now = new Date();
  const message = filterSensitiveData(args.map(safeStringify).join(' '));

  const entry: ConsoleLogEntry = {
    type,
    message,
    timestamp: now.toISOString(),
    timestampMs: now.getTime(),
    url: window.location.href,
  };

  if (includeStack || type === 'error' || type === 'warn' || type === 'trace') {
    Object.assign(entry, captureStackInfo());
  }

  return entry;
}

function addLogEntry(entry: ConsoleLogEntry) {
  capturedLogs.push(entry);
  while (capturedLogs.length > maxEntries) {
    capturedLogs.shift();
  }
}

export function startConsoleCapture(max?: number) {
  if (capturing) return;
  capturing = true;
  if (max) maxEntries = max;

  console.log = (...args) => {
    originalConsole.log(...args);
    addLogEntry(createLogEntry('log', args, false));
  };

  console.error = (...args) => {
    originalConsole.error(...args);
    addLogEntry(createLogEntry('error', args, true));
  };

  console.warn = (...args) => {
    originalConsole.warn(...args);
    addLogEntry(createLogEntry('warn', args, true));
  };

  console.info = (...args) => {
    originalConsole.info(...args);
    addLogEntry(createLogEntry('info', args, false));
  };

  console.debug = (...args) => {
    originalConsole.debug(...args);
    addLogEntry(createLogEntry('debug', args, false));
  };

  console.trace = (...args) => {
    originalConsole.trace(...args);
    addLogEntry(createLogEntry('trace', args, true));
  };
}

export function stopConsoleCapture() {
  if (!capturing) return;
  capturing = false;

  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
  console.debug = originalConsole.debug;
  console.trace = originalConsole.trace;
}

export function getCapturedLogs(): ConsoleLogEntry[] {
  return [...capturedLogs];
}

export function clearCapturedLogs() {
  capturedLogs.length = 0;
}
