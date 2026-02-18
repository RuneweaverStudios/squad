/**
 * Centralized logging configuration using Pino
 * Provides structured logging with proper levels, context tracking, and browser support
 *
 * Integrates with logConfig.ts for environment-aware configuration
 * and sensitive data redaction.
 */

import pino from 'pino';
import { browser, dev } from '$app/environment';
import logConfig, { getLogLevel, type Environment } from '../config/logConfig';

// Determine current environment
const currentEnvironment: Environment = dev ? 'development' : 'production';

// Browser-safe logger with configuration from logConfig
const logger = pino({
  name: 'squad-ide',
  level: getLogLevel(currentEnvironment),

  // Browser configuration
  browser: browser ? {
    asObject: true,
    serialize: true,
    transmit: {
      level: 'error',
      send: (level, logEvent) => {
        // Send errors to monitoring service in production
        if (!dev && (level as any).value >= 50) { // error and above
          fetch('/api/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(logEvent)
          }).catch(() => {
            // Silently fail if logging endpoint is unavailable
          });
        }
      }
    }
  } : undefined,

  // Pretty printing for server-side dev environment
  transport: !browser && dev ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'HH:MM:ss',
      messageFormat: '{context} | {msg}'
    }
  } : undefined,

  // Standard serializers with redaction support
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req: (req: any) => {
      const serialized = pino.stdSerializers.req(req);
      return !dev ? redactSensitiveData(serialized) : serialized;
    },
    res: pino.stdSerializers.res
  },

  // Base properties for all log entries
  base: {
    env: currentEnvironment,
    platform: browser ? 'browser' : 'server'
  }
});

// Helper function to redact sensitive data
function redactSensitiveData(data: any): any {
  if (!data || typeof data !== 'object') return data;

  // Don't redact in development mode
  if (dev) return data;

  const redacted = Array.isArray(data) ? [...data] : { ...data };

  for (const key in redacted) {
    if (logConfig.shouldRedact(key)) {
      redacted[key] = logConfig.production.redact.censor;
    } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
      redacted[key] = redactSensitiveData(redacted[key]);
    }
  }

  return redacted;
}

// Typed child loggers for different contexts with environment-specific levels
export const apiLogger = logger.child({
  context: 'api',
  level: getLogLevel(currentEnvironment, 'api')
});

export const dbLogger = logger.child({
  context: 'database',
  level: getLogLevel(currentEnvironment, 'database')
});

export const taskLogger = logger.child({ context: 'tasks' });
export const agentLogger = logger.child({ context: 'agents' });

export const wsLogger = logger.child({
  context: 'websocket',
  level: getLogLevel(currentEnvironment, 'websocket')
});

export const storeLogger = logger.child({ context: 'stores' });
export const componentLogger = logger.child({ context: 'components' });
export const authLogger = logger.child({ context: 'auth' });

export const perfLogger = logger.child({
  context: 'performance',
  level: getLogLevel(currentEnvironment, 'performance')
});

// Helper to create component-specific loggers
export function createComponentLogger(componentName: string) {
  return componentLogger.child({ component: componentName });
}

// Helper to create API endpoint loggers with sampling
export function createApiLogger(endpoint: string) {
  const samplingRate = logConfig.getSamplingRate(endpoint);

  // Apply sampling in production
  if (!dev && Math.random() > samplingRate) {
    // Return a no-op logger for sampled-out requests
    return {
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      fatal: () => {},
      child: () => createApiLogger(endpoint)
    } as any;
  }

  return apiLogger.child({ endpoint });
}

// Helper to create store-specific loggers
export function createStoreLogger(storeName: string) {
  return storeLogger.child({ store: storeName });
}

// Performance tracking helper with threshold warnings
export function trackPerformance(
  operation: string,
  context: 'api' | 'database' | 'render' = 'api'
): { end: (metadata?: Record<string, any>) => number } {
  const start = performance.now();
  const thresholds = logConfig.production.performanceThresholds[context];

  return {
    end: (metadata?: Record<string, any>) => {
      const duration = performance.now() - start;
      const durationMs = Math.round(duration);

      const logData = {
        operation,
        duration: durationMs,
        context,
        ...redactSensitiveData(metadata)
      };

      // Check against thresholds and log appropriately
      if (thresholds) {
        if (duration > thresholds.error) {
          perfLogger.error({ ...logData }, `Slow ${context} operation: ${operation}`);
        } else if (duration > thresholds.warn) {
          perfLogger.warn({ ...logData }, `${context} operation exceeding warning threshold: ${operation}`);
        } else {
          perfLogger.debug({ ...logData }, `${context} operation completed: ${operation}`);
        }
      } else {
        perfLogger.debug({ ...logData }, `Operation completed: ${operation}`);
      }

      return duration;
    }
  };
}

// Validate configuration on initialization
if (dev && browser) {
  const isValid = logConfig.validateLogConfig();
  if (!isValid) {
    logger.warn('Invalid log configuration detected. Check logConfig.ts');
  }
}

export default logger;