/**
 * File Watchers for WebSocket Event Broadcasting
 *
 * Watches key files and broadcasts changes to WebSocket subscribers.
 * This replaces/complements the existing SSE implementation for tasks.
 *
 * Watched files:
 * - .jat/last-touched - Task mutation sentinel (written by lib/tasks.js on every write)
 * - .claude/sessions/agent-*.txt - Agent state changes
 *
 * Usage:
 *   import { startWatchers, stopWatchers } from '$lib/server/websocket/watchers';
 *
 *   // Start watching (typically called after WebSocket server init)
 *   startWatchers();
 *
 *   // Stop watching (typically called on shutdown)
 *   stopWatchers();
 */

import { watch, type FSWatcher } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { broadcastTaskChange, broadcastTaskUpdate, broadcastAgentState, broadcastOutput, isInitialized, getChannelSubscriberCount } from './connectionPool.js';
// NOTE: Must use relative import (not $lib alias) because this file is transitively
// imported by vite.config.ts via vitePlugin.ts, and $lib isn't available at config time.
import { getTasks } from '../jat-tasks.js';

const execAsync = promisify(exec);

// ============================================================================
// Configuration
// ============================================================================

// IDE runs from /home/jw/code/jat/ide
// Sentinel file is at /home/jw/code/jat/.jat/last-touched (parent directory)
const PROJECT_ROOT = join(process.cwd(), '..');
const JAT_DIR = join(PROJECT_ROOT, '.jat');
const SENTINEL_FILENAME = 'last-touched';

const SESSIONS_DIR = join(PROJECT_ROOT, '.claude', 'sessions');

// ============================================================================
// State
// ============================================================================

let taskWatcher: FSWatcher | null = null;
let sessionsWatcher: FSWatcher | null = null;
let outputPollingInterval: NodeJS.Timeout | null = null;
let debounceTimers: Map<string, NodeJS.Timeout> = new Map();

/** Task snapshot for field-level change detection */
interface TaskSnapshot {
	id: string;
	status: string;
	assignee: string | null;
	priority: number;
}

let previousTaskSnapshots = new Map<string, TaskSnapshot>();
let previousOutputHashes = new Map<string, string>();
let isWatching = false;

// Output polling configuration
const OUTPUT_POLL_INTERVAL = 2000; // Poll every 2 seconds (was 250ms - caused memory leak)
const OUTPUT_LINES = 100; // Number of lines to capture per session
const EXEC_TIMEOUT_MS = 5000; // Timeout for exec commands

// Guard against overlapping polls
let isPolling = false;

// ============================================================================
// Task Watcher (watches .jat/last-touched sentinel)
// ============================================================================

/**
 * Get current task snapshots via lib/tasks.js (reads from SQLite)
 * Returns a map of task ID → snapshot with tracked fields
 */
function getTaskSnapshots(): Map<string, TaskSnapshot> {
	try {
		const tasks = getTasks({});
		const snapshots = new Map<string, TaskSnapshot>();
		for (const t of tasks as any[]) {
			snapshots.set(t.id, {
				id: t.id,
				status: t.status || 'open',
				assignee: t.assignee || null,
				priority: t.priority ?? 999
			});
		}
		return snapshots;
	} catch {
		return new Map();
	}
}

/**
 * Check for task changes and broadcast if any
 * Detects three types of changes:
 * - New tasks (ID didn't exist before) → broadcastTaskChange
 * - Removed tasks (ID no longer exists) → broadcastTaskChange
 * - Updated tasks (field changed on existing task) → broadcastTaskUpdate
 *
 * A task is never broadcast as both new AND updated (no duplicates).
 */
function checkTaskChanges(): void {
	if (!isInitialized()) return;

	const currentSnapshots = getTaskSnapshots();

	// Find new tasks
	const newTasks: string[] = [];
	for (const id of currentSnapshots.keys()) {
		if (!previousTaskSnapshots.has(id)) {
			newTasks.push(id);
		}
	}

	// Find removed tasks
	const removedTasks: string[] = [];
	for (const id of previousTaskSnapshots.keys()) {
		if (!currentSnapshots.has(id)) {
			removedTasks.push(id);
		}
	}

	// Find updated tasks (field changes on tasks that already existed and aren't new)
	const updatedTasks: Array<{ id: string; changes: Record<string, { from: unknown; to: unknown }> }> = [];
	for (const [id, current] of currentSnapshots) {
		// Skip newly created tasks (they'll be in newTasks)
		if (!previousTaskSnapshots.has(id)) continue;

		const previous = previousTaskSnapshots.get(id)!;
		const changes: Record<string, { from: unknown; to: unknown }> = {};

		if (previous.status !== current.status) {
			changes.status = { from: previous.status, to: current.status };
		}
		if (previous.assignee !== current.assignee) {
			changes.assignee = { from: previous.assignee, to: current.assignee };
		}
		if (previous.priority !== current.priority) {
			changes.priority = { from: previous.priority, to: current.priority };
		}

		if (Object.keys(changes).length > 0) {
			updatedTasks.push({ id, changes });
		}
	}

	previousTaskSnapshots = currentSnapshots;

	// Broadcast create/delete events
	if (newTasks.length > 0 || removedTasks.length > 0) {
		console.log(`[WS Watcher] Task changes: +${newTasks.length} -${removedTasks.length}`);
		broadcastTaskChange(newTasks, removedTasks);
	}

	// Broadcast field-level updates (separate from create/delete)
	for (const { id, changes } of updatedTasks) {
		const changedFields = Object.keys(changes).join(', ');
		console.log(`[WS Watcher] Task updated: ${id} (${changedFields})`);
		broadcastTaskUpdate(id, changes);
	}
}

/**
 * Start watching the .jat/last-touched sentinel file for task mutations
 */
function startTaskWatcher(): void {
	if (taskWatcher) {
		console.log('[WS Watcher] Task watcher already running');
		return;
	}

	console.log(`[WS Watcher] Starting task watcher: ${JAT_DIR}`);

	// Initialize previous task snapshots
	previousTaskSnapshots = getTaskSnapshots();
	console.log(`[WS Watcher] Initialized with ${previousTaskSnapshots.size} existing tasks`);

	try {
		// Watch the .jat/ directory for last-touched changes
		taskWatcher = watch(JAT_DIR, { persistent: false }, (eventType, filename) => {
			if (filename === SENTINEL_FILENAME || filename === null) {
				// Debounce rapid changes
				const existingTimer = debounceTimers.get('tasks');
				if (existingTimer) clearTimeout(existingTimer);

				debounceTimers.set('tasks', setTimeout(() => {
					checkTaskChanges();
					debounceTimers.delete('tasks');
				}, 100));
			}
		});

		taskWatcher.on('error', (err) => {
			console.error('[WS Watcher] Task watcher error:', err);
		});

		console.log('[WS Watcher] Task watcher started');
	} catch (err) {
		console.error('[WS Watcher] Failed to start task watcher:', err);
	}
}

// ============================================================================
// Agent Sessions Watcher
// ============================================================================

/**
 * Parse agent name from session file
 */
async function readAgentName(filepath: string): Promise<string | null> {
	try {
		const content = await readFile(filepath, 'utf-8');
		return content.trim() || null;
	} catch {
		return null;
	}
}

/**
 * Handle agent session file change
 */
async function handleSessionChange(filename: string): Promise<void> {
	if (!isInitialized()) return;

	// Extract session ID from filename (agent-{sessionId}.txt)
	const match = filename.match(/^agent-(.+)\.txt$/);
	if (!match) return;

	const sessionId = match[1];
	const filepath = join(SESSIONS_DIR, filename);
	const agentName = await readAgentName(filepath);

	if (agentName) {
		console.log(`[WS Watcher] Agent session change: ${agentName} (${sessionId})`);
		broadcastAgentState(agentName, 'active', { sessionId });
	}
}

/**
 * Start watching agent session files
 */
function startSessionsWatcher(): void {
	if (sessionsWatcher) {
		console.log('[WS Watcher] Sessions watcher already running');
		return;
	}

	console.log(`[WS Watcher] Starting sessions watcher: ${SESSIONS_DIR}`);

	try {
		sessionsWatcher = watch(SESSIONS_DIR, { persistent: false }, (eventType, filename) => {
			if (filename && filename.startsWith('agent-') && filename.endsWith('.txt')) {
				// Debounce per-file
				const key = `session-${filename}`;
				const existingTimer = debounceTimers.get(key);
				if (existingTimer) clearTimeout(existingTimer);

				debounceTimers.set(key, setTimeout(() => {
					handleSessionChange(filename);
					debounceTimers.delete(key);
				}, 100));
			}
		});

		sessionsWatcher.on('error', (err) => {
			// Sessions directory might not exist initially
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
				console.log('[WS Watcher] Sessions directory does not exist yet');
			} else {
				console.error('[WS Watcher] Sessions watcher error:', err);
			}
		});

		console.log('[WS Watcher] Sessions watcher started');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			console.log('[WS Watcher] Sessions directory does not exist yet');
		} else {
			console.error('[WS Watcher] Failed to start sessions watcher:', err);
		}
	}
}

// ============================================================================
// Output Polling (for WebSocket streaming)
// ============================================================================

/**
 * Simple hash function for change detection
 * We only need to detect if output changed, not cryptographic security
 */
function simpleHash(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return hash.toString(36);
}

/**
 * Get list of active jat-* tmux sessions
 */
async function getTmuxSessions(): Promise<string[]> {
	try {
		const { stdout } = await execAsync(
			'tmux list-sessions -F "#{session_name}" 2>/dev/null || echo ""',
			{ timeout: EXEC_TIMEOUT_MS }
		);
		return stdout
			.trim()
			.split('\n')
			.filter(name => name.startsWith('jat-') && !name.startsWith('jat-pending-'));
	} catch {
		return [];
	}
}

/**
 * Capture output from a single tmux session
 */
async function captureSessionOutput(sessionName: string): Promise<{ output: string; lineCount: number } | null> {
	try {
		const { stdout } = await execAsync(
			`tmux capture-pane -p -e -t "${sessionName}" -S -${OUTPUT_LINES}`,
			{ maxBuffer: 1024 * 1024, timeout: EXEC_TIMEOUT_MS }
		);
		return {
			output: stdout,
			lineCount: stdout.split('\n').length
		};
	} catch {
		return null;
	}
}

/**
 * Poll all tmux sessions and broadcast output changes
 */
async function pollOutputs(): Promise<void> {
	// Guard against overlapping polls (prevents child process accumulation)
	if (isPolling) {
		return;
	}

	if (!isInitialized()) return;

	// Only poll if there are subscribers to the output channel
	const subscriberCount = getChannelSubscriberCount('output');
	if (subscriberCount === 0) {
		return;
	}

	isPolling = true;

	try {
		const sessions = await getTmuxSessions();

		// Process sessions in parallel with a concurrency limit
		const batchSize = 4;
		for (let i = 0; i < sessions.length; i += batchSize) {
			const batch = sessions.slice(i, i + batchSize);
			await Promise.all(batch.map(async (sessionName) => {
				const result = await captureSessionOutput(sessionName);
				if (!result) return;

				// Check if output changed using hash
				const hash = simpleHash(result.output);
				const previousHash = previousOutputHashes.get(sessionName);

				if (hash !== previousHash) {
					previousOutputHashes.set(sessionName, hash);

					// Broadcast the change
					broadcastOutput(sessionName, result.output, result.lineCount);
				}
			}));
		}

		// Clean up hashes for sessions that no longer exist
		for (const sessionName of previousOutputHashes.keys()) {
			if (!sessions.includes(sessionName)) {
				previousOutputHashes.delete(sessionName);
			}
		}
	} finally {
		isPolling = false;
	}
}

/**
 * Start output polling
 */
function startOutputPolling(): void {
	if (outputPollingInterval) {
		console.log('[WS Watcher] Output polling already running');
		return;
	}

	console.log(`[WS Watcher] Starting output polling (${OUTPUT_POLL_INTERVAL}ms interval)`);

	// Initial poll
	pollOutputs();

	// Set up interval
	outputPollingInterval = setInterval(() => {
		pollOutputs();
	}, OUTPUT_POLL_INTERVAL);

	console.log('[WS Watcher] Output polling started');
}

/**
 * Stop output polling
 */
function stopOutputPolling(): void {
	if (outputPollingInterval) {
		clearInterval(outputPollingInterval);
		outputPollingInterval = null;
		previousOutputHashes.clear();
		isPolling = false;
		console.log('[WS Watcher] Output polling stopped');
	}
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Start all file watchers
 * Call this after WebSocket server is initialized
 */
export function startWatchers(): void {
	if (isWatching) {
		console.log('[WS Watcher] Watchers already running');
		return;
	}

	console.log('[WS Watcher] Starting all watchers...');
	startTaskWatcher();
	startSessionsWatcher();
	startOutputPolling();
	isWatching = true;
}

/**
 * Stop all file watchers
 * Call this on server shutdown
 */
export function stopWatchers(): void {
	console.log('[WS Watcher] Stopping all watchers...');

	// Clear all debounce timers
	debounceTimers.forEach(timer => clearTimeout(timer));
	debounceTimers.clear();

	// Stop output polling
	stopOutputPolling();

	// Close watchers
	if (taskWatcher) {
		taskWatcher.close();
		taskWatcher = null;
	}

	if (sessionsWatcher) {
		sessionsWatcher.close();
		sessionsWatcher = null;
	}

	isWatching = false;
	console.log('[WS Watcher] All watchers stopped');
}

/**
 * Check if watchers are running
 */
export function isWatchersRunning(): boolean {
	return isWatching;
}
