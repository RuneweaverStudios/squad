#!/usr/bin/env node
/**
 * jat-scheduler - Polls task databases for scheduled tasks and spawns agents.
 *
 * Scans all projects in ~/code/ that have .jat/tasks.db for tasks where:
 *   next_run_at <= now AND status = 'open'
 *
 * For recurring tasks (schedule_cron set):
 *   - Creates a child instance task inheriting command/agent_program/model
 *   - Spawns it via /api/work/spawn
 *   - Computes next next_run_at from cron expression
 *
 * For one-shot tasks (no schedule_cron, but next_run_at set):
 *   - Spawns directly using task's command/agent_program/model
 *   - Clears next_run_at after spawn
 *
 * Usage:
 *   node index.js [--poll-interval 30] [--port 3334] [--verbose] [--dry-run]
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import { discoverProjects, getDueTasks, updateNextRun, createChildTask } from './lib/db.js';
import { nextCronRun } from './lib/cron.js';

// --- CLI args ---
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}
const POLL_INTERVAL = parseInt(getArg('poll-interval', '30'), 10) * 1000;
const HTTP_PORT = parseInt(getArg('port', '3334'), 10);
const IDE_URL = getArg('ide-url', 'http://127.0.0.1:3333');
const VERBOSE = args.includes('--verbose');
const DRY_RUN = args.includes('--dry-run');

// --- State ---
let running = true;
let pollCount = 0;
let lastPoll = null;
let spawned = [];  // recent spawn log [{taskId, project, time, childId?}]
let pollTimer = null;

function log(msg) { console.log(`[scheduler] ${new Date().toISOString().slice(11, 19)} ${msg}`); }
function debug(msg) { if (VERBOSE) log(msg); }

// --- Read timezone from projects.json ---
function getTimezone() {
  try {
    const configPath = join(homedir(), '.config/jat/projects.json');
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      return config.defaults?.timezone || 'UTC';
    }
  } catch { /* ignore */ }
  return 'UTC';
}

// --- Spawn via IDE API ---
async function spawnTask(taskId, project, model, agentProgram) {
  const body = { taskId, project };
  if (model) body.model = model;
  if (agentProgram) body.agentId = agentProgram;

  debug(`Spawning task ${taskId} for project ${project} (model=${model || 'default'})`);

  if (DRY_RUN) {
    log(`[DRY-RUN] Would spawn ${taskId} in ${project}`);
    return { success: true, dryRun: true };
  }

  try {
    const res = await fetch(`${IDE_URL}/api/work/spawn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      log(`Spawn failed for ${taskId}: ${data.message || res.statusText}`);
      return { success: false, error: data.message || res.statusText };
    }
    log(`Spawned ${taskId} → agent ${data.session?.agentName || 'unknown'}`);
    return { success: true, ...data };
  } catch (err) {
    log(`Spawn error for ${taskId}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// --- Main poll loop ---
async function poll() {
  pollCount++;
  const tz = getTimezone();
  debug(`Poll #${pollCount} (tz=${tz})`);

  const projects = discoverProjects();
  debug(`Found ${projects.length} project(s)`);

  for (const proj of projects) {
    const dueTasks = getDueTasks(proj.dbPath);
    if (dueTasks.length === 0) continue;

    debug(`${proj.name}: ${dueTasks.length} due task(s)`);

    for (const task of dueTasks) {
      if (task.schedule_cron) {
        // Recurring: create child instance task, spawn child, update next_run_at
        const childId = createChildTask(proj.dbPath, task);
        log(`Created child ${childId} from recurring ${task.id} (cron: ${task.schedule_cron})`);

        const result = await spawnTask(childId, proj.name, task.model, task.agent_program);

        // Compute next run regardless of spawn result
        const nextRun = nextCronRun(task.schedule_cron, tz);
        updateNextRun(proj.dbPath, task.id, nextRun);
        debug(`Next run for ${task.id}: ${nextRun}`);

        spawned.push({
          taskId: task.id,
          childId,
          project: proj.name,
          time: new Date().toISOString(),
          result: result.success ? 'ok' : 'failed',
        });
      } else {
        // One-shot: spawn directly, clear next_run_at
        const result = await spawnTask(task.id, proj.name, task.model, task.agent_program);

        // Clear next_run_at so it won't fire again
        updateNextRun(proj.dbPath, task.id, null);

        spawned.push({
          taskId: task.id,
          project: proj.name,
          time: new Date().toISOString(),
          result: result.success ? 'ok' : 'failed',
        });
      }
    }
  }

  lastPoll = new Date().toISOString();

  // Trim spawn log to last 100 entries
  if (spawned.length > 100) spawned = spawned.slice(-100);
}

// --- HTTP control API ---
function startHttpServer() {
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'GET' && req.url === '/status') {
      res.end(JSON.stringify({
        running,
        pollInterval: POLL_INTERVAL / 1000,
        pollCount,
        lastPoll,
        recentSpawns: spawned.slice(-10),
        projectCount: discoverProjects().length,
        uptime: process.uptime(),
      }));
    } else if (req.method === 'POST' && req.url === '/start') {
      if (!running) {
        running = true;
        schedulePoll();
        log('Resumed polling');
      }
      res.end(JSON.stringify({ running: true }));
    } else if (req.method === 'POST' && req.url === '/stop') {
      running = false;
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
      log('Paused polling');
      res.end(JSON.stringify({ running: false }));
    } else if (req.method === 'POST' && req.url === '/poll') {
      // Trigger immediate poll
      poll().then(() => {
        res.end(JSON.stringify({ success: true, lastPoll }));
      }).catch(err => {
        res.statusCode = 500;
        res.end(JSON.stringify({ success: false, error: err.message }));
      });
      return; // Don't end res here, it's handled in the .then()
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      log(`Port ${HTTP_PORT} in use, running without HTTP API (polling still active)`);
    } else {
      log(`HTTP server error: ${err.message}`);
    }
  });

  server.listen(HTTP_PORT, '127.0.0.1', () => {
    log(`HTTP control API on http://127.0.0.1:${HTTP_PORT}`);
    log(`  GET  /status  - scheduler status`);
    log(`  POST /start   - resume polling`);
    log(`  POST /stop    - pause polling`);
    log(`  POST /poll    - trigger immediate poll`);
  });
}

// --- Scheduling ---
function schedulePoll() {
  if (!running) return;
  pollTimer = setTimeout(async () => {
    try {
      await poll();
    } catch (err) {
      log(`Poll error: ${err.message}`);
    }
    schedulePoll();
  }, POLL_INTERVAL);
}

// --- Entry point ---
log(`Starting jat-scheduler (poll=${POLL_INTERVAL / 1000}s, ide=${IDE_URL}, port=${HTTP_PORT})`);
if (DRY_RUN) log('[DRY-RUN] No tasks will actually be spawned');

startHttpServer();

// Run first poll immediately, then schedule
poll().catch(err => log(`Initial poll error: ${err.message}`));
schedulePoll();

// Graceful shutdown
process.on('SIGINT', () => { log('Shutting down...'); process.exit(0); });
process.on('SIGTERM', () => { log('Shutting down...'); process.exit(0); });
