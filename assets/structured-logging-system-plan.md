# Structured Logging System Plan for SQUAD IDE

## Overview

A structured logging system to replace the 947 console statements with a centralized, configurable, production-safe logging solution that provides:
- **Log levels** (debug, info, warn, error, fatal)
- **Contextual metadata** (user, session, request ID, timestamps)
- **Performance metrics** (response times, query durations)
- **Selective output** (different levels for dev vs production)
- **Log aggregation** (centralized storage, searchable)

## Current State

- **947 total console statements** found across the IDE
- Distribution:
  - Routes (API endpoints, pages): ~600 statements
  - Components: ~200 statements
  - Utilities: ~100 statements
  - Test files: ~47 statements

## Proposed Architecture

### Core Logger Setup

```typescript
// src/lib/utils/logger.ts
import pino from 'pino';
import { browser } from '$app/environment';
import { dev } from '$app/environment';

// Browser-safe logger with pretty printing in dev
const logger = pino({
  level: dev ? 'debug' : 'info',
  browser: browser ? {
    asObject: true,
    serialize: true,
    transmit: {
      level: 'error',
      send: (level, logEvent) => {
        // Send errors to monitoring service in production
        if (!dev && level.value >= 50) { // error and above
          fetch('/api/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(logEvent)
          });
        }
      }
    }
  } : undefined,
  transport: !browser && dev ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'HH:MM:ss'
    }
  } : undefined
});

// Typed child loggers for different contexts
export const apiLogger = logger.child({ context: 'api' });
export const dbLogger = logger.child({ context: 'database' });
export const taskLogger = logger.child({ context: 'tasks' });
export const agentLogger = logger.child({ context: 'agents' });
export const wsLogger = logger.child({ context: 'websocket' });

export default logger;
```

## Implementation Examples

### 1. API Endpoint Logging

**Before (console statements):**
```typescript
// src/routes/api/agents/+server.ts
console.log('Fetching agents...');
console.log('Query params:', { full, usage, activities });
try {
  const agents = await getAgents();
  console.log(`Found ${agents.length} agents`);
  return json({ agents });
} catch (error) {
  console.error('Failed to fetch agents:', error);
  throw error(500, 'Failed to fetch agents');
}
```

**After (structured logging):**
```typescript
import { apiLogger } from '$lib/utils/logger';

apiLogger.debug({ params: { full, usage, activities } }, 'Fetching agents');
try {
  const agents = await getAgents();
  apiLogger.info({ count: agents.length }, 'Agents fetched successfully');
  return json({ agents });
} catch (error) {
  apiLogger.error({ err: error, params: { full, usage, activities } }, 'Failed to fetch agents');
  throw error(500, 'Failed to fetch agents');
}
```

### 2. Component Logging

**Before:**
```svelte
<script lang="ts">
  onMount(() => {
    console.log('SessionCard mounted', { sessionName, agentName });
    console.log('Initial state:', state);
  });

  function handleError(err) {
    console.error('Session error:', err);
  }
</script>
```

**After:**
```svelte
<script lang="ts">
  import logger from '$lib/utils/logger';

  const log = logger.child({
    component: 'SessionCard',
    session: sessionName
  });

  onMount(() => {
    log.debug({ agentName, state }, 'Component mounted');
  });

  function handleError(err) {
    log.error({ err }, 'Session error occurred');
  }
</script>
```

## Log Levels Strategy

```typescript
// src/lib/config/logConfig.ts
export const LOG_LEVELS = {
  // Debug: Detailed diagnostic info (dev only)
  debug: [
    'Component lifecycle events',
    'Store state changes',
    'API request/response details',
    'WebSocket messages'
  ],

  // Info: Normal application flow
  info: [
    'Agent registration',
    'Task state transitions',
    'Server starts/stops',
    'User actions (create, update, delete)'
  ],

  // Warn: Recoverable issues
  warn: [
    'Rate limit approaching',
    'Deprecated API usage',
    'Performance degradation',
    'Missing optional config'
  ],

  // Error: Failures requiring attention
  error: [
    'API request failures',
    'Database connection errors',
    'Invalid data validation',
    'Unhandled promise rejections'
  ],

  // Fatal: Application-breaking issues
  fatal: [
    'Database unreachable',
    'Critical configuration missing',
    'Memory exhaustion',
    'Unrecoverable state corruption'
  ]
} as const;
```

## Performance Tracking

```typescript
// src/lib/utils/performance.ts
import { apiLogger } from './logger';

export function trackApiPerformance(endpoint: string) {
  const start = performance.now();

  return {
    end: (metadata?: Record<string, any>) => {
      const duration = performance.now() - start;
      apiLogger.info({
        endpoint,
        duration,
        ...metadata
      }, 'API request completed');

      // Alert on slow requests
      if (duration > 1000) {
        apiLogger.warn({
          endpoint,
          duration,
          threshold: 1000
        }, 'Slow API request detected');
      }
    }
  };
}

// Usage in API endpoint
export async function GET({ url }) {
  const perf = trackApiPerformance('/api/agents');

  try {
    const agents = await fetchAgents();
    perf.end({ count: agents.length });
    return json({ agents });
  } catch (error) {
    perf.end({ error: error.message });
    throw error;
  }
}
```

## Request Context Tracking

```typescript
// src/hooks.server.ts
import { randomUUID } from 'crypto';
import logger from '$lib/utils/logger';

export async function handle({ event, resolve }) {
  // Generate request ID for tracing
  const requestId = randomUUID();
  event.locals.requestId = requestId;

  // Create request-scoped logger
  event.locals.logger = logger.child({
    requestId,
    path: event.url.pathname,
    method: event.request.method
  });

  const start = Date.now();

  try {
    const response = await resolve(event);

    event.locals.logger.info({
      status: response.status,
      duration: Date.now() - start
    }, 'Request completed');

    return response;
  } catch (error) {
    event.locals.logger.error({
      err: error,
      duration: Date.now() - start
    }, 'Request failed');

    throw error;
  }
}
```

## Browser Console Integration

For development, maintain browser console output while adding structure:

```typescript
// src/lib/utils/browserLogger.ts
class BrowserLogger {
  private enabled = dev || localStorage.getItem('debug') === 'true';

  debug(data: any, message?: string) {
    if (!this.enabled) return;

    console.group(`🔍 ${message || 'Debug'}`);
    console.log(data);
    console.groupEnd();
  }

  info(data: any, message?: string) {
    if (!this.enabled) return;

    console.info(`ℹ️ ${message || 'Info'}:`, data);
  }

  warn(data: any, message?: string) {
    console.warn(`⚠️ ${message || 'Warning'}:`, data);
  }

  error(data: any, message?: string) {
    console.error(`❌ ${message || 'Error'}:`, data);

    // Also send to error tracking
    if (typeof window !== 'undefined' && window.errorReporter) {
      window.errorReporter.captureException(data);
    }
  }
}

export const browserLog = new BrowserLogger();
```

## Migration Strategy

### Phase 1: Setup Infrastructure
```bash
npm install pino pino-pretty
npm install -D @types/pino
```

Create base logger configuration and child loggers for each context.

### Phase 2: Critical Path Migration
Replace console statements in:
1. API endpoints (`/api/**/*.ts`)
2. Database utilities (`$lib/utils/db*.ts`)
3. WebSocket/SSE handlers
4. Error boundaries

### Phase 3: Component Migration
Systematic replacement in components:
1. High-traffic components (SessionCard, TaskTable, AgentCard)
2. State management (stores)
3. UI components (lower priority)

### Phase 4: Production Configuration

```typescript
// src/lib/config/logger.prod.ts
export const PRODUCTION_CONFIG = {
  // Log levels per environment
  levels: {
    development: 'debug',
    staging: 'info',
    production: 'warn'
  },

  // Sensitive data redaction
  redact: [
    'password',
    'api_key',
    'token',
    'authorization',
    'cookie',
    'session'
  ],

  // Sampling for high-volume logs
  sampling: {
    '/api/agents': 0.1,  // Log 10% of requests
    '/api/work': 0.1,
    '/api/signals': 0.01  // Log 1% of signals
  }
};
```

## Log Aggregation Options

### Option 1: Local File Storage
```typescript
// src/lib/utils/fileLogger.ts
import { createWriteStream } from 'fs';
import { join } from 'path';

const logStream = createWriteStream(
  join(process.cwd(), 'logs', `ide-${new Date().toISOString().split('T')[0]}.log`),
  { flags: 'a' }
);

export const fileLogger = pino({
  level: 'info'
}, logStream);
```

### Option 2: Database Storage
```typescript
// src/lib/utils/dbLogger.ts
async function persistLog(log: LogEntry) {
  await db.logs.create({
    data: {
      level: log.level,
      message: log.msg,
      context: log.context,
      metadata: log,
      timestamp: new Date(log.time)
    }
  });
}
```

### Option 3: External Service Integration
```typescript
// src/lib/utils/externalLogger.ts
import { Logtail } from '@logtail/node';

const logtail = new Logtail(process.env.LOGTAIL_TOKEN);

export function shipLogs(logs: LogEntry[]) {
  return logtail.log(logs);
}
```

## IDE Log Viewer

Create a `/logs` route for viewing logs in development:

```svelte
<!-- src/routes/logs/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  let logs = $state<LogEntry[]>([]);
  let filter = $state({
    level: 'all',
    context: 'all',
    search: ''
  });

  onMount(() => {
    // Subscribe to SSE for real-time logs
    const eventSource = new EventSource('/api/logs/stream');
    eventSource.onmessage = (event) => {
      logs = [JSON.parse(event.data), ...logs].slice(0, 1000);
    };
  });

  const filteredLogs = $derived(() => {
    return logs.filter(log => {
      if (filter.level !== 'all' && log.level !== filter.level) return false;
      if (filter.context !== 'all' && log.context !== filter.context) return false;
      if (filter.search && !JSON.stringify(log).includes(filter.search)) return false;
      return true;
    });
  });
</script>

<div class="log-viewer">
  <!-- Filters -->
  <div class="filters">
    <select bind:value={filter.level}>
      <option value="all">All Levels</option>
      <option value="debug">Debug</option>
      <option value="info">Info</option>
      <option value="warn">Warn</option>
      <option value="error">Error</option>
    </select>
  </div>

  <!-- Log entries -->
  {#each filteredLogs as log}
    <div class="log-entry level-{log.level}">
      <span class="timestamp">{formatTime(log.time)}</span>
      <span class="level">{log.level}</span>
      <span class="message">{log.msg}</span>
      {#if log.metadata}
        <pre class="metadata">{JSON.stringify(log.metadata, null, 2)}</pre>
      {/if}
    </div>
  {/each}
</div>
```

## Benefits of This Approach

1. **Production Safety**: No console spam, controlled output
2. **Debugging Power**: Rich context, request tracing, performance metrics
3. **Selective Verbosity**: Different log levels per environment
4. **Error Tracking**: Automatic error aggregation and alerting
5. **Performance Monitoring**: Built-in timing and slow query detection
6. **Audit Trail**: Complete record of user actions and system events
7. **Real-time Monitoring**: SSE-based log streaming to IDE

## Implementation Timeline

- **Week 1**: Install dependencies, create base logger configuration
- **Week 2**: Migrate critical API endpoints and error handlers
- **Week 3**: Implement performance tracking and request context
- **Week 4**: Create log viewer UI and complete component migration

## Success Metrics

- Zero console statements in production builds
- < 50ms overhead from logging operations
- 100% error capture rate
- Searchable logs for debugging production issues
- Reduced time to diagnose issues by 50%

## Notes

- This plan addresses the 947 console statements found in the IDE
- Priority given to high-traffic paths (API endpoints, database operations)
- Browser compatibility maintained through pino's browser adapter
- Development experience enhanced with pretty printing and real-time viewer