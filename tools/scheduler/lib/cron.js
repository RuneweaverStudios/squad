/**
 * Cron expression utilities for squad-scheduler.
 * Uses cron-parser to compute next run times.
 */

import cronParser from 'cron-parser';

/**
 * Compute the next run time from a cron expression.
 * @param {string} cronExpr - Cron expression (e.g., "0 9 * * *")
 * @param {string} [tz='UTC'] - IANA timezone (e.g., "America/New_York")
 * @returns {string} ISO datetime string of next run
 */
export function nextCronRun(cronExpr, tz = 'UTC') {
  const interval = cronParser.parseExpression(cronExpr, {
    currentDate: new Date(),
    tz,
  });
  return interval.next().toISOString();
}

/**
 * Validate a cron expression.
 * @param {string} cronExpr
 * @returns {{valid: boolean, error?: string}}
 */
export function validateCron(cronExpr) {
  try {
    cronParser.parseExpression(cronExpr);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Get the next N run times for a cron expression.
 * Useful for previewing schedules.
 * @param {string} cronExpr
 * @param {number} [count=5]
 * @param {string} [tz='UTC']
 * @returns {string[]} Array of ISO datetime strings
 */
export function nextCronRuns(cronExpr, count = 5, tz = 'UTC') {
  const interval = cronParser.parseExpression(cronExpr, {
    currentDate: new Date(),
    tz,
  });
  const runs = [];
  for (let i = 0; i < count; i++) {
    runs.push(interval.next().toISOString());
  }
  return runs;
}
