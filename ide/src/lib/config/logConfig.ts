/**
 * Log Configuration for JAT IDE
 *
 * Defines log levels, event mappings, and environment-specific settings
 * for the structured logging system using pino.
 */

/**
 * Log level definitions and their use cases
 */
export const LOG_LEVELS = {
  /**
   * TRACE (10): Most detailed logging level
   * Used for: Extremely detailed diagnostic information
   */
  trace: 10,

  /**
   * DEBUG (20): Detailed diagnostic information
   * Used for: Development and debugging
   */
  debug: 20,

  /**
   * INFO (30): Normal application flow
   * Used for: Key business events and state changes
   */
  info: 30,

  /**
   * WARN (40): Potentially harmful situations
   * Used for: Recoverable issues that need attention
   */
  warn: 40,

  /**
   * ERROR (50): Error events that allow continued operation
   * Used for: Handled exceptions and failures
   */
  error: 50,

  /**
   * FATAL (60): Severe errors causing premature termination
   * Used for: Unrecoverable errors requiring restart
   */
  fatal: 60,

  /**
   * SILENT (Infinity): Disable all logging
   * Used for: Testing or complete log suppression
   */
  silent: Infinity
} as const;

/**
 * Event categories mapped to appropriate log levels
 */
export const EVENT_CATEGORIES = {
  // Debug Level Events - Detailed diagnostic info (dev only)
  debug: [
    // Component lifecycle
    'component.mount',
    'component.unmount',
    'component.update',
    'component.render',

    // Store operations
    'store.subscribe',
    'store.unsubscribe',
    'store.update',
    'store.derived',

    // API internals
    'api.request.headers',
    'api.response.raw',
    'api.cache.hit',
    'api.cache.miss',

    // WebSocket details
    'ws.message.received',
    'ws.message.sent',
    'ws.heartbeat',
    'ws.buffer.state',

    // Database queries
    'db.query.raw',
    'db.connection.pool',
    'db.transaction.detail',

    // Performance metrics
    'perf.component.render',
    'perf.store.update',
    'perf.derived.compute'
  ],

  // Info Level Events - Normal application flow
  info: [
    // Agent operations
    'agent.register',
    'agent.login',
    'agent.logout',
    'agent.status.change',

    // Task management
    'task.create',
    'task.update',
    'task.assign',
    'task.complete',
    'task.state.transition',

    // Server lifecycle
    'server.start',
    'server.stop',
    'server.restart',
    'server.config.load',

    // User actions
    'user.action.create',
    'user.action.update',
    'user.action.delete',
    'user.action.navigate',

    // Session management
    'session.create',
    'session.resume',
    'session.attach',
    'session.terminate',

    // API operations
    'api.request.success',
    'api.endpoint.accessed',

    // Background jobs
    'job.start',
    'job.complete',
    'job.scheduled',

    // Integration events
    'integration.connect',
    'integration.sync',
    'integration.disconnect'
  ],

  // Warn Level Events - Potentially harmful situations
  warn: [
    // Performance issues
    'perf.slow.api',          // API response > 1000ms
    'perf.slow.db',           // DB query > 500ms
    'perf.slow.render',       // Component render > 16ms
    'perf.memory.high',       // Memory usage > 80%

    // Rate limiting
    'ratelimit.approaching',   // 80% of limit reached
    'ratelimit.throttled',     // Request throttled

    // Deprecated usage
    'deprecated.api',          // Using deprecated endpoint
    'deprecated.method',       // Using deprecated method
    'deprecated.config',       // Using deprecated config

    // Configuration issues
    'config.missing.optional', // Optional config not set
    'config.fallback',        // Using fallback values
    'config.override',        // Config overridden

    // Data validation
    'validation.unexpected',   // Unexpected but valid data
    'validation.coerced',     // Data type coerced

    // Resource issues
    'resource.retry',         // Operation retried
    'resource.fallback',      // Using fallback resource
    'resource.queue.long',    // Queue length > threshold

    // Security notices
    'security.weak.config',   // Weak security settings
    'security.audit',         // Security audit events

    // Browser compatibility
    'browser.unsupported.feature', // Feature not supported
    'browser.fallback'            // Using polyfill/fallback
  ],

  // Error Level Events - Failures requiring attention
  error: [
    // API failures
    'api.request.failed',
    'api.response.invalid',
    'api.timeout',
    'api.network.error',

    // Database errors
    'db.connection.failed',
    'db.query.failed',
    'db.transaction.failed',
    'db.deadlock',

    // Validation failures
    'validation.failed',
    'validation.schema.invalid',
    'validation.type.mismatch',

    // Authentication/Authorization
    'auth.failed',
    'auth.token.invalid',
    'auth.permission.denied',
    'auth.session.expired',

    // WebSocket errors
    'ws.connection.failed',
    'ws.message.invalid',
    'ws.reconnect.failed',

    // File operations
    'file.read.failed',
    'file.write.failed',
    'file.permission.denied',

    // State management
    'state.invalid',
    'state.corruption',
    'state.sync.failed',

    // External service failures
    'service.unavailable',
    'service.timeout',
    'service.response.invalid',

    // Unhandled errors
    'error.unhandled.promise',
    'error.unhandled.exception'
  ],

  // Fatal Level Events - Application-breaking issues
  fatal: [
    // Critical infrastructure
    'db.connection.lost',      // Database completely unreachable
    'db.migration.failed',     // Database migration failure

    // Configuration failures
    'config.missing.critical',  // Required config missing
    'config.invalid.critical',  // Critical config invalid

    // System resources
    'memory.exhausted',         // Out of memory
    'disk.full',               // No disk space
    'process.limit.reached',   // Process limits hit

    // Security breaches
    'security.breach',          // Security violation detected
    'security.token.compromised', // Token compromise detected

    // Data integrity
    'data.corruption.critical', // Unrecoverable data corruption
    'data.loss.detected',       // Data loss confirmed

    // Application state
    'app.state.unrecoverable',  // Cannot recover app state
    'app.initialization.failed', // App failed to start

    // Dependencies
    'dependency.critical.missing', // Critical dependency unavailable
    'dependency.version.conflict'  // Incompatible dependency versions
  ]
} as const;

/**
 * Environment-specific log level configuration
 */
export const ENVIRONMENT_LOG_LEVELS = {
  // Development: Maximum verbosity for debugging
  development: {
    default: 'debug' as const,
    browser: 'debug' as const,
    server: 'trace' as const,
    database: 'debug' as const,
    api: 'debug' as const,
    websocket: 'debug' as const,
    performance: 'info' as const
  },

  // Staging: Balanced logging for testing
  staging: {
    default: 'info' as const,
    browser: 'info' as const,
    server: 'info' as const,
    database: 'warn' as const,
    api: 'info' as const,
    websocket: 'info' as const,
    performance: 'warn' as const
  },

  // Production: Minimal logging for performance
  production: {
    default: 'warn' as const,
    browser: 'error' as const,
    server: 'warn' as const,
    database: 'error' as const,
    api: 'warn' as const,
    websocket: 'warn' as const,
    performance: 'error' as const
  },

  // Test: Minimal output during testing
  test: {
    default: 'error' as const,
    browser: 'silent' as const,
    server: 'error' as const,
    database: 'error' as const,
    api: 'error' as const,
    websocket: 'silent' as const,
    performance: 'silent' as const
  }
} as const;

/**
 * Production-specific configuration
 */
export const PRODUCTION_CONFIG = {
  /**
   * Sensitive fields to redact from logs
   */
  redact: {
    // Authentication & Security
    paths: [
      'password',
      'passwd',
      'pass',
      'secret',
      'token',
      'api_key',
      'apiKey',
      'api-key',
      'access_token',
      'accessToken',
      'refresh_token',
      'refreshToken',
      'private_key',
      'privateKey',
      'client_secret',
      'clientSecret',
      'authorization',
      'cookie',
      'session',
      'sessionId',
      'session_id',

      // Personal Information
      'email',
      'phone',
      'ssn',
      'social_security',
      'credit_card',
      'creditCard',
      'card_number',
      'cardNumber',
      'cvv',
      'pin',

      // Database
      'db_password',
      'database_url',
      'connection_string',
      'connectionString',

      // Request/Response
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'res.headers["set-cookie"]',

      // Nested paths
      '*.password',
      '*.token',
      '*.secret',
      'credentials.*',
      'auth.*'
    ],

    // Redaction string
    censor: '[REDACTED]'
  },

  /**
   * Log sampling configuration for high-volume endpoints
   * Value represents the sampling rate (0.0 to 1.0)
   */
  sampling: {
    // High-frequency endpoints - sample aggressively
    // Note: Uses prefix matching, so /api/sessions matches /api/sessions/*/signal too
    '/api/signals': 0.01,          // 1% of signal logs
    '/api/work/poll': 0.05,        // 5% of polling logs
    '/api/agents/status': 0.1,     // 10% of status checks
    '/api/sessions': 0.01,         // 1% of all session endpoints (signal, activity, output)

    // Medium-frequency endpoints
    '/api/agents': 0.25,           // 25% of agent operations
    '/api/tasks': 0.25,            // 25% of task operations
    '/api/work': 0.25,             // 25% of work operations

    // Low-frequency endpoints - log everything
    '/api/auth': 1.0,              // 100% of auth operations
    '/api/errors': 1.0,            // 100% of errors
    '/api/admin': 1.0              // 100% of admin operations
  },

  /**
   * Performance thresholds for automatic warning/error logging
   */
  performanceThresholds: {
    api: {
      warn: 1000,   // Warn if API call takes > 1s
      error: 5000   // Error if API call takes > 5s
    },
    database: {
      warn: 500,    // Warn if DB query takes > 500ms
      error: 2000   // Error if DB query takes > 2s
    },
    render: {
      warn: 16,     // Warn if render takes > 16ms (60fps threshold)
      error: 50     // Error if render takes > 50ms
    },
    memory: {
      warn: 0.8,    // Warn at 80% memory usage
      error: 0.95   // Error at 95% memory usage
    }
  },

  /**
   * Error reporting configuration
   */
  errorReporting: {
    // Automatically capture these error types
    captureErrors: [
      'TypeError',
      'ReferenceError',
      'RangeError',
      'SyntaxError',
      'NetworkError',
      'TimeoutError',
      'DatabaseError',
      'ValidationError',
      'AuthenticationError',
      'AuthorizationError'
    ],

    // Ignore these error messages
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',  // Browser quirk
      'Non-Error promise rejection captured', // Expected behavior
      'Network request failed',              // Handled offline mode
      'Load failed',                         // Resource loading handled
      'ChunkLoadError'                       // Code splitting handled
    ],

    // Additional context to include
    contextKeys: [
      'user_id',
      'agent_name',
      'task_id',
      'session_id',
      'request_id',
      'environment',
      'version',
      'browser',
      'os'
    ]
  },

  /**
   * Log retention policies
   */
  retention: {
    trace: '1h',    // Keep trace logs for 1 hour
    debug: '6h',    // Keep debug logs for 6 hours
    info: '7d',     // Keep info logs for 7 days
    warn: '30d',    // Keep warning logs for 30 days
    error: '90d',   // Keep error logs for 90 days
    fatal: '1y'     // Keep fatal logs for 1 year
  }
} as const;

/**
 * Context providers for structured logging
 */
export const LOG_CONTEXTS = {
  // API context fields
  api: [
    'method',
    'path',
    'status',
    'duration',
    'user_agent',
    'ip',
    'request_id'
  ],

  // Database context fields
  database: [
    'query',
    'table',
    'operation',
    'duration',
    'rows_affected',
    'transaction_id'
  ],

  // Agent context fields
  agent: [
    'agent_name',
    'agent_id',
    'status',
    'task_id',
    'session_id',
    'model'
  ],

  // Task context fields
  task: [
    'task_id',
    'title',
    'status',
    'priority',
    'assignee',
    'project'
  ],

  // WebSocket context fields
  websocket: [
    'connection_id',
    'event_type',
    'room',
    'user_id',
    'latency'
  ],

  // Performance context fields
  performance: [
    'operation',
    'duration',
    'memory_used',
    'cpu_usage',
    'timestamp'
  ]
} as const;

/**
 * Log format configurations
 */
export const LOG_FORMATS = {
  // Development format - human readable
  development: {
    prettyPrint: true,
    colorize: true,
    translateTime: 'HH:MM:ss.l',
    ignore: 'pid,hostname',
    messageFormat: '{context} | {msg}'
  },

  // Production format - JSON structured
  production: {
    prettyPrint: false,
    colorize: false,
    translateTime: false,
    messageFormat: false
  }
} as const;

/**
 * Helper function to get environment-specific log level
 */
export function getLogLevel(
  environment: keyof typeof ENVIRONMENT_LOG_LEVELS = 'development',
  context?: keyof typeof ENVIRONMENT_LOG_LEVELS['development']
): string {
  const envConfig = ENVIRONMENT_LOG_LEVELS[environment];
  return context ? envConfig[context] : envConfig.default;
}

/**
 * Helper function to check if an event should be logged
 */
export function shouldLog(
  eventType: string,
  currentLevel: keyof typeof LOG_LEVELS
): boolean {
  // Find the event's category
  for (const [level, events] of Object.entries(EVENT_CATEGORIES)) {
    if ((events as readonly string[]).includes(eventType)) {
      // Check if event level is >= current level
      return LOG_LEVELS[level as keyof typeof LOG_LEVELS] >= LOG_LEVELS[currentLevel];
    }
  }

  // Default to logging if event type is unknown
  return true;
}

/**
 * Helper function to get sampling rate for an endpoint
 * Uses prefix matching for dynamic path segments (e.g., /api/sessions/[name]/signal)
 */
export function getSamplingRate(endpoint: string): number {
  const sampling = PRODUCTION_CONFIG.sampling;

  // Check for exact match first
  if (endpoint in sampling) {
    return sampling[endpoint as keyof typeof sampling];
  }

  // Check for prefix matches (handles dynamic segments like /api/sessions/[name]/signal)
  for (const [pattern, rate] of Object.entries(sampling)) {
    if (endpoint.startsWith(pattern)) {
      return rate;
    }
  }

  return 1.0;
}

/**
 * Helper function to check if a field should be redacted
 */
export function shouldRedact(fieldPath: string): boolean {
  const lowerPath = fieldPath.toLowerCase();

  return PRODUCTION_CONFIG.redact.paths.some(pattern => {
    // Handle wildcard patterns
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(lowerPath);
    }

    // Handle exact matches
    return lowerPath === pattern.toLowerCase() ||
           lowerPath.endsWith(`.${pattern.toLowerCase()}`);
  });
}

/**
 * Type exports for TypeScript
 */
export type LogLevel = keyof typeof LOG_LEVELS;
export type LogContext = keyof typeof LOG_CONTEXTS;
export type Environment = keyof typeof ENVIRONMENT_LOG_LEVELS;
export type EventCategory = keyof typeof EVENT_CATEGORIES;

/**
 * Configuration validation
 */
export function validateLogConfig(): boolean {
  // Ensure all event categories have valid log levels
  for (const level of Object.keys(EVENT_CATEGORIES)) {
    if (!(level in LOG_LEVELS)) {
      console.error(`Invalid event category level: ${level}`);
      return false;
    }
  }

  // Ensure all environment configs have valid log levels
  for (const env of Object.values(ENVIRONMENT_LOG_LEVELS)) {
    for (const level of Object.values(env)) {
      if (!(level in LOG_LEVELS)) {
        console.error(`Invalid environment log level: ${level}`);
        return false;
      }
    }
  }

  return true;
}

// Export default configuration object
export default {
  levels: LOG_LEVELS,
  categories: EVENT_CATEGORIES,
  environments: ENVIRONMENT_LOG_LEVELS,
  production: PRODUCTION_CONFIG,
  contexts: LOG_CONTEXTS,
  formats: LOG_FORMATS,

  // Helper functions
  getLogLevel,
  shouldLog,
  getSamplingRate,
  shouldRedact,
  validateLogConfig
};