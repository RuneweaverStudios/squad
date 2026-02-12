/**
 * Workflow discovery and scheduling for jat-scheduler.
 * Reads workflow JSON files from ~/.config/jat/workflows/ and finds
 * enabled workflows with trigger_cron nodes that are due to run.
 *
 * Scheduling state (next_run_at per workflow) is tracked in a separate
 * state file: ~/.config/jat/workflows/.scheduler-state.json
 */

import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const WORKFLOWS_DIR = join(homedir(), '.config', 'jat', 'workflows');
const STATE_FILE = join(WORKFLOWS_DIR, '.scheduler-state.json');

/**
 * Read scheduler state from disk.
 * State tracks next_run_at per workflow ID.
 * @returns {Record<string, string>} workflowId -> ISO datetime
 */
function readState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch { /* ignore corrupt state */ }
  return {};
}

/**
 * Write scheduler state to disk.
 * @param {Record<string, string>} state
 */
function writeState(state) {
  try {
    mkdirSync(WORKFLOWS_DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[scheduler] Failed to write workflow state: ${err.message}`);
  }
}

/**
 * Discover all enabled workflows that have a trigger_cron node.
 * Returns workflow metadata with the cron expression and timezone.
 * @returns {Array<{id: string, name: string, cronExpr: string, timezone?: string}>}
 */
export function discoverCronWorkflows() {
  if (!existsSync(WORKFLOWS_DIR)) return [];

  const workflows = [];
  try {
    const entries = readdirSync(WORKFLOWS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name.startsWith('.')) continue;

      try {
        const filePath = join(WORKFLOWS_DIR, entry.name);
        const data = JSON.parse(readFileSync(filePath, 'utf-8'));

        // Must be enabled
        if (!data.enabled) continue;

        // Find trigger_cron node
        const cronNode = (data.nodes || []).find(n => n.type === 'trigger_cron');
        if (!cronNode || !cronNode.config?.cronExpr) continue;

        workflows.push({
          id: data.id,
          name: data.name || data.id,
          cronExpr: cronNode.config.cronExpr,
          timezone: cronNode.config.timezone,
        });
      } catch { /* skip malformed workflow files */ }
    }
  } catch { /* skip if directory unreadable */ }

  return workflows;
}

/**
 * Get workflows that are due to run now.
 * Checks next_run_at from state file against current time.
 * Workflows without a next_run_at are considered due immediately
 * (first run after being enabled).
 * @returns {Array<{id: string, name: string, cronExpr: string, timezone?: string}>}
 */
export function getDueWorkflows() {
  const workflows = discoverCronWorkflows();
  if (workflows.length === 0) return [];

  const state = readState();
  const now = new Date().toISOString();
  const due = [];

  for (const wf of workflows) {
    const nextRun = state[wf.id];

    // No next_run_at means first run - consider due
    if (!nextRun || nextRun <= now) {
      due.push(wf);
    }
  }

  return due;
}

/**
 * Update the next_run_at for a workflow in the state file.
 * @param {string} workflowId
 * @param {string} nextRunAt - ISO datetime string
 */
export function updateWorkflowNextRun(workflowId, nextRunAt) {
  const state = readState();
  state[workflowId] = nextRunAt;
  writeState(state);
}

/**
 * Remove a workflow from the state file (when it's disabled/deleted).
 * @param {string} workflowId
 */
export function removeWorkflowState(workflowId) {
  const state = readState();
  delete state[workflowId];
  writeState(state);
}

/**
 * Get all tracked workflow scheduling state.
 * @returns {Record<string, string>}
 */
export function getWorkflowState() {
  return readState();
}
