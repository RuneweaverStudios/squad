/**
 * Performance tracking utilities for the JAT IDE
 * Provides timing, metrics collection, and performance monitoring
 */

import { perfLogger } from './logger';
import {
  PRODUCTION_CONFIG
} from '$lib/config/logConfig';
import { browser } from '$app/environment';

/**
 * Performance metrics tracker
 */
interface PerformanceMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

/**
 * Active performance trackers
 */
const activeTrackers = new Map<string, PerformanceMetrics>();

/**
 * Track API endpoint performance
 */
export function trackApiPerformance(endpoint: string, metadata?: Record<string, any>) {
  const trackerId = `api:${endpoint}:${Date.now()}`;
  const start = performance.now();

  activeTrackers.set(trackerId, {
    startTime: start,
    metadata
  });

  return {
    trackerId,
    end: (additionalMetadata?: Record<string, any>) => {
      const tracker = activeTrackers.get(trackerId);
      if (!tracker) {
        perfLogger.warn({ trackerId }, 'Performance tracker not found');
        return;
      }

      const duration = performance.now() - tracker.startTime;
      // Categorize performance based on duration
      const thresholds = PRODUCTION_CONFIG.performanceThresholds.api;
      let category = 'good';
      if (duration > thresholds.error) {
        category = 'critical';
      } else if (duration > thresholds.warn) {
        category = 'slow';
      }

      // Log performance data
      const logData: Record<string, any> = {
        endpoint,
        duration,
        category,
        ...tracker.metadata,
        ...additionalMetadata
      };

      // Choose log level based on performance
      if (category === 'critical') {
        perfLogger.error(logData, `Critical performance issue: ${endpoint}`);
      } else if (category === 'slow') {
        perfLogger.warn(logData, `Slow API request: ${endpoint}`);
      } else {
        perfLogger.info(logData, `API request completed: ${endpoint}`);
      }

      // Clean up tracker
      activeTrackers.delete(trackerId);

      return {
        duration,
        category
      };
    }
  };
}

/**
 * Track database query performance
 */
export function trackDatabasePerformance(query: string, table?: string) {
  const trackerId = `db:${table || 'query'}:${Date.now()}`;
  const start = performance.now();

  activeTrackers.set(trackerId, {
    startTime: start,
    metadata: { query, table }
  });

  return {
    trackerId,
    end: (rowsAffected?: number) => {
      const tracker = activeTrackers.get(trackerId);
      if (!tracker) {
        perfLogger.warn({ trackerId }, 'Database tracker not found');
        return;
      }

      const duration = performance.now() - tracker.startTime;
      const thresholds = PRODUCTION_CONFIG.performanceThresholds.database;

      // Determine if slow
      const isSlow = duration > thresholds.warn;
      const isCritical = duration > thresholds.error;

      // Log query performance
      const logData = {
        query: tracker.metadata?.query,
        table: tracker.metadata?.table,
        duration,
        rowsAffected,
        slow: isSlow,
        critical: isCritical
      };

      if (isCritical) {
        perfLogger.error(logData, 'Critical database performance issue');
      } else if (isSlow) {
        perfLogger.warn(logData, 'Slow database query detected');
      } else {
        perfLogger.debug(logData, 'Database query completed');
      }

      activeTrackers.delete(trackerId);

      return {
        duration,
        isSlow,
        isCritical
      };
    }
  };
}

/**
 * Track component render performance (browser only)
 */
export function trackRenderPerformance(componentName: string) {
  if (!browser) return { end: () => {} };

  const trackerId = `render:${componentName}:${Date.now()}`;
  const start = performance.now();

  activeTrackers.set(trackerId, {
    startTime: start,
    metadata: { componentName }
  });

  return {
    trackerId,
    end: () => {
      const tracker = activeTrackers.get(trackerId);
      if (!tracker) return;

      const duration = performance.now() - tracker.startTime;
      const thresholds = PRODUCTION_CONFIG.performanceThresholds.render;

      // Check if render is slow
      const isSlow = duration > thresholds.warn;
      const isCritical = duration > thresholds.error;

      if (isCritical) {
        perfLogger.error(
          { component: componentName, duration },
          `Critical render performance: ${componentName}`
        );
      } else if (isSlow) {
        perfLogger.warn(
          { component: componentName, duration },
          `Slow render detected: ${componentName}`
        );
      } else {
        perfLogger.debug(
          { component: componentName, duration },
          `Component rendered: ${componentName}`
        );
      }

      activeTrackers.delete(trackerId);

      return { duration, isSlow, isCritical };
    }
  };
}

/**
 * Track memory usage (browser only)
 */
export function trackMemoryUsage(context?: string) {
  if (!browser) return null;

  // Check if performance.memory is available (Chrome only)
  const perf = performance as any;
  if (!perf.memory) {
    perfLogger.debug('Memory tracking not available in this browser');
    return null;
  }

  const memoryInfo = {
    usedJSHeapSize: perf.memory.usedJSHeapSize,
    totalJSHeapSize: perf.memory.totalJSHeapSize,
    jsHeapSizeLimit: perf.memory.jsHeapSizeLimit
  };

  const usageRatio = memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit;
  const thresholds = PRODUCTION_CONFIG.performanceThresholds.memory;

  const logData = {
    context,
    ...memoryInfo,
    usageRatio,
    usagePercent: (usageRatio * 100).toFixed(2) + '%'
  };

  if (usageRatio > thresholds.error) {
    perfLogger.error(logData, 'Critical memory usage detected');
  } else if (usageRatio > thresholds.warn) {
    perfLogger.warn(logData, 'High memory usage detected');
  } else {
    perfLogger.debug(logData, 'Memory usage check');
  }

  return {
    ...memoryInfo,
    usageRatio,
    isHigh: usageRatio > thresholds.warn,
    isCritical: usageRatio > thresholds.error
  };
}

/**
 * Batch performance tracker for multiple operations
 */
export class BatchPerformanceTracker {
  private operations: Map<string, PerformanceMetrics> = new Map();
  private batchStart: number;
  private batchName: string;

  constructor(name: string) {
    this.batchName = name;
    this.batchStart = performance.now();
  }

  startOperation(operationName: string) {
    this.operations.set(operationName, {
      startTime: performance.now()
    });
  }

  endOperation(operationName: string, metadata?: Record<string, any>) {
    const operation = this.operations.get(operationName);
    if (!operation) {
      perfLogger.warn({ operationName }, 'Operation not found in batch tracker');
      return;
    }

    const endTime = performance.now();
    operation.endTime = endTime;
    operation.duration = endTime - operation.startTime;
    operation.metadata = metadata;
  }

  complete() {
    const totalDuration = performance.now() - this.batchStart;
    const operations = Array.from(this.operations.entries()).map(([name, metrics]) => ({
      name,
      duration: metrics.duration,
      metadata: metrics.metadata
    }));

    perfLogger.info({
      batch: this.batchName,
      totalDuration,
      operationCount: operations.length,
      operations
    }, `Batch operation completed: ${this.batchName}`);

    return {
      totalDuration,
      operations
    };
  }
}

/**
 * Measure function execution time
 */
export function measureExecutionTime<T>(
  fn: () => T,
  name: string,
  logLevel: 'debug' | 'info' | 'warn' = 'debug'
): T {
  const start = performance.now();

  try {
    const result = fn();
    const duration = performance.now() - start;

    perfLogger[logLevel]({ name, duration }, `Function executed: ${name}`);

    return result;
  } catch (error) {
    const duration = performance.now() - start;

    perfLogger.error(
      { name, duration, error },
      `Function execution failed: ${name}`
    );

    throw error;
  }
}

/**
 * Async version of measureExecutionTime
 */
export async function measureAsyncExecutionTime<T>(
  fn: () => Promise<T>,
  name: string,
  logLevel: 'debug' | 'info' | 'warn' = 'debug'
): Promise<T> {
  const start = performance.now();

  try {
    const result = await fn();
    const duration = performance.now() - start;

    perfLogger[logLevel]({ name, duration }, `Async function executed: ${name}`);

    return result;
  } catch (error) {
    const duration = performance.now() - start;

    perfLogger.error(
      { name, duration, error },
      `Async function execution failed: ${name}`
    );

    throw error;
  }
}

/**
 * Create a performance observer for long tasks (browser only)
 */
export function observeLongTasks(threshold = 50) {
  if (!browser || !window.PerformanceObserver) {
    perfLogger.debug('PerformanceObserver not available');
    return null;
  }

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        perfLogger.warn({
          taskName: entry.name,
          duration: entry.duration,
          startTime: entry.startTime
        }, `Long task detected (>${threshold}ms)`);
      }
    });

    observer.observe({ entryTypes: ['longtask'] });

    return observer;
  } catch (error) {
    perfLogger.error({ error }, 'Failed to create PerformanceObserver');
    return null;
  }
}

/**
 * Web Vitals tracking (browser only)
 */
export function trackWebVitals() {
  if (!browser) return;

  // Track First Contentful Paint (FCP)
  if (window.PerformanceObserver) {
    try {
      const fcpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            perfLogger.info({
              metric: 'FCP',
              value: entry.startTime,
              rating: entry.startTime < 1800 ? 'good' : entry.startTime < 3000 ? 'needs-improvement' : 'poor'
            }, 'First Contentful Paint measured');
          }
        }
      });
      fcpObserver.observe({ entryTypes: ['paint'] });
    } catch (error) {
      perfLogger.debug({ error }, 'Failed to track FCP');
    }
  }

  // Track page load time
  window.addEventListener('load', () => {
    const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;

    perfLogger.info({
      metric: 'pageLoad',
      value: loadTime,
      rating: loadTime < 3000 ? 'good' : loadTime < 5000 ? 'needs-improvement' : 'poor'
    }, 'Page load time measured');
  });
}

/**
 * Export performance report
 */
export function generatePerformanceReport(): Record<string, any> {
  if (!browser) {
    return { error: 'Performance report only available in browser' };
  }

  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
  const paint = performance.getEntriesByType('paint');

  return {
    navigation: navigation ? {
      domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
      loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
      domInteractive: navigation.domInteractive - navigation.fetchStart,
      redirectTime: navigation.redirectEnd - navigation.redirectStart,
      dnsTime: navigation.domainLookupEnd - navigation.domainLookupStart,
      ttfb: navigation.responseStart - navigation.requestStart
    } : null,
    paint: paint.map(entry => ({
      name: entry.name,
      startTime: entry.startTime
    })),
    memory: (performance as any).memory ? {
      usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
      totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
      jsHeapSizeLimit: (performance as any).memory.jsHeapSizeLimit
    } : null,
    timestamp: new Date().toISOString()
  };
}