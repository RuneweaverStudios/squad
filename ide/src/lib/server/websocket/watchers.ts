/**
 * File Watchers for WebSocket Event Broadcasting
 *
 * Watches key files and broadcasts changes to WebSocket subscribers.
 * This replaces the previous SSE implementation.
 *
 * Watched sources:
 * - .squad/last-touched - Task mutation sentinel (written by lib/tasks.js on every write)
 * - .claude/sessions/agent-*.txt - Agent state changes
 * - /tmp/squad-signal-tmux-*.json - Agent state signals (working, review, complete, etc.)
 * - /tmp/claude-question-tmux-*.json - Agent questions pending user response
 * - tmux session list - Session create/destroy lifecycle events
 * - tmux pane output - Terminal output streaming
 *
 * Architecture:
 * - fs.watch() for instant file updates (~50ms latency): signals, questions, tasks, agent files
 * - Polling for tmux operations (1000ms): output capture, session lifecycle
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

import { watch, readFileSync, existsSync, statSync, readdirSync, type FSWatcher } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
	broadcastTaskChange,
	broadcastTaskUpdate,
	broadcastAgentState,
	broadcastOutput,
	broadcastSessionState,
	broadcastSessionQuestion,
	broadcastSessionSignal,
	broadcastSessionComplete,
	broadcastSessionCreated,
	broadcastSessionDestroyed,
	isInitialized,
	getChannelSubscriberCount
} from './connectionPool.js';
// NOTE: Must use relative import (not $lib alias) because this file is transitively
// imported by vite.config.ts via vitePlugin.ts, and $lib isn't available at config time.
import { getTasks } from '../squad-tasks.js';

const execAsync = promisify(exec);

// ============================================================================
// Configuration
// ============================================================================

// IDE runs from /home/jw/code/squad/ide
// Sentinel file is at /home/jw/code/squad/.squad/last-touched (parent directory)
const PROJECT_ROOT = join(process.cwd(), '..');
const SQUAD_DIR = join(PROJECT_ROOT, '.squad');
const SENTINEL_FILENAME = 'last-touched';

const SESSIONS_DIR = join(PROJECT_ROOT, '.claude', 'sessions');

// Signal TTL configuration (mirrors SIGNAL_TTL from constants.ts)
// Inlined here to avoid importing from $lib which isn't available at vite config time
const SIGNAL_TTL = {
	TRANSIENT_MS: 60 * 1000,         // 1 minute for transitional states
	USER_WAITING_MS: 30 * 60 * 1000, // 30 minutes for states waiting on human
	USER_WAITING_STATES: ['completed', 'review', 'needs_input', 'working', 'planning'] as const
};

// Question file max age
const QUESTION_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

// Signal state mapping (signal short names → SessionCard states)
const SIGNAL_STATE_MAP: Record<string, string> = {
	'working': 'working',
	'review': 'ready-for-review',
	'needs_input': 'needs-input',
	'idle': 'idle',
	'completed': 'completed',
	'starting': 'starting',
	'compacting': 'compacting',
	'completing': 'completing',
	'polishing': 'polishing',
	'planning': 'planning',
};

// ============================================================================
// State
// ============================================================================

let taskWatcher: FSWatcher | null = null;
let sessionsWatcher: FSWatcher | null = null;
let signalWatcher: FSWatcher | null = null;
let outputPollingInterval: NodeJS.Timeout | null = null;
let sessionLifecycleInterval: NodeJS.Timeout | null = null;
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

// Session lifecycle polling interval
const SESSION_LIFECYCLE_POLL_INTERVAL = 1000; // 1 second

// Guard against overlapping polls
let isPolling = false;
let isLifecyclePolling = false;

// Session lifecycle tracking
let knownSessions = new Set<string>();

// Signal file watcher state
const signalFileStates = new Map<string, { state: string | null; completeHash: string | null; payloadHash: string | null }>();
const signalDebounceTimers = new Map<string, NodeJS.Timeout>();
const SIGNAL_DEBOUNCE_MS = 50;

// Question file watcher state
const questionFileStates = new Map<string, { hasQuestion: boolean; questionHash: string | null }>();
const questionDebounceTimers = new Map<string, NodeJS.Timeout>();
const QUESTION_DEBOUNCE_MS = 50;

// Task cache for session lifecycle (avoids expensive JSONL parsing)
interface TaskInfo {
	id: string;
	title?: string;
	status?: string;
	assignee?: string;
}
let cachedTasks: TaskInfo[] = [];
let taskCacheTimestamp = 0;
const TASK_CACHE_TTL_MS = 5000;

// ============================================================================
// Task Watcher (watches .squad/last-touched sentinel)
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
 * Start watching the .squad/last-touched sentinel file for task mutations
 */
function startTaskWatcher(): void {
	if (taskWatcher) {
		console.log('[WS Watcher] Task watcher already running');
		return;
	}

	console.log(`[WS Watcher] Starting task watcher: ${SQUAD_DIR}`);

	// Initialize previous task snapshots
	previousTaskSnapshots = getTaskSnapshots();
	console.log(`[WS Watcher] Initialized with ${previousTaskSnapshots.size} existing tasks`);

	try {
		// Watch the .squad/ directory for last-touched changes
		taskWatcher = watch(SQUAD_DIR, { persistent: false }, (eventType, filename) => {
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
// Agent Sessions Watcher (watches .claude/sessions/agent-*.txt)
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
// Signal & Question File Watcher (watches /tmp for squad-signal-* and claude-question-*)
// ============================================================================

/**
 * Simple hash function for change detection
 * We only need to detect if content changed, not cryptographic security
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
 * Read and parse a signal file, returning null if stale or invalid
 */
function readSignalFile(sessionName: string): { type: string; state?: string; data?: unknown; timestamp?: string } | null {
	const signalFile = `/tmp/squad-signal-tmux-${sessionName}.json`;

	try {
		if (!existsSync(signalFile)) {
			return null;
		}

		const content = readFileSync(signalFile, 'utf-8');
		const signal = JSON.parse(content);

		// Apply TTL based on signal type
		const stats = statSync(signalFile);
		const ageMs = Date.now() - stats.mtimeMs;
		const isUserWaitingState = signal.type === 'state' && SIGNAL_TTL.USER_WAITING_STATES.includes(signal.state);
		const ttl = signal.type === 'complete' || isUserWaitingState ? SIGNAL_TTL.USER_WAITING_MS : SIGNAL_TTL.TRANSIENT_MS;

		if (ageMs > ttl) {
			return null;
		}

		return signal;
	} catch {
		return null;
	}
}

/**
 * Read completion bundle from signal file
 * Returns full bundle data or null if not a complete signal
 */
function readCompletionBundle(sessionName: string): Record<string, unknown> | null {
	const signalFile = `/tmp/squad-signal-tmux-${sessionName}.json`;

	try {
		if (!existsSync(signalFile)) {
			return null;
		}

		const stats = statSync(signalFile);
		const ageMs = Date.now() - stats.mtimeMs;
		if (ageMs > SIGNAL_TTL.USER_WAITING_MS) {
			return null;
		}

		const content = readFileSync(signalFile, 'utf-8');
		const signal = JSON.parse(content);

		if (signal.type === 'complete' && signal.data) {
			const data = signal.data;
			return {
				taskId: data.taskId || '',
				agentName: data.agentName || '',
				summary: Array.isArray(data.summary) ? data.summary : (typeof data.summary === 'string' ? [data.summary] : []),
				quality: data.quality || { tests: 'none', build: 'clean' },
				humanActions: Array.isArray(data.humanActions) ? data.humanActions : undefined,
				suggestedTasks: Array.isArray(data.suggestedTasks) ? data.suggestedTasks : undefined,
				crossAgentIntel: data.crossAgentIntel || undefined,
				completionMode: data.completionMode || 'review_required',
				nextTaskId: data.nextTaskId || undefined,
				nextTaskTitle: data.nextTaskTitle || undefined
			};
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * Process a signal file change and broadcast appropriate events
 */
function processSignalFileChange(sessionName: string): void {
	if (!isInitialized()) return;

	// Check if anyone is subscribed to sessions channel
	const subscriberCount = getChannelSubscriberCount('sessions');
	if (subscriberCount === 0) return;

	const signal = readSignalFile(sessionName);
	if (!signal) return;

	const prevFileState = signalFileStates.get(sessionName) || { state: null, completeHash: null, payloadHash: null };
	const currentFileState = { state: prevFileState.state, completeHash: prevFileState.completeHash, payloadHash: prevFileState.payloadHash };

	// Handle state signals (working, review, needs_input, etc.)
	if (signal.type === 'state' && signal.state) {
		const mappedState = SIGNAL_STATE_MAP[signal.state] || signal.state;
		const newPayloadHash = signal.data ? simpleHash(JSON.stringify(signal.data)) : null;
		const stateChanged = mappedState !== prevFileState.state;
		const payloadChanged = newPayloadHash !== prevFileState.payloadHash;

		if (stateChanged || payloadChanged) {
			currentFileState.state = mappedState;
			currentFileState.payloadHash = newPayloadHash;
			broadcastSessionState(sessionName, mappedState, {
				previousState: prevFileState.state,
				signalPayload: signal.data ? { type: signal.state, ...signal.data as object } : undefined
			});
			if (stateChanged) {
				console.log(`[WS Watcher] Signal state change for ${sessionName}: ${prevFileState.state} -> ${mappedState}${signal.data ? ' (with payload)' : ''}`);
			} else {
				console.log(`[WS Watcher] Signal payload update for ${sessionName}: ${mappedState} (data changed)`);
			}
		}
	}

	// Handle IDE-initiated signals with direct type (e.g., { type: 'completing', currentStep: 'verifying', ... })
	// These are flat-format signals written by the IDE signal API, not nested {type: 'state', state: ..., data: ...}
	if (signal.type && SIGNAL_STATE_MAP[signal.type] && signal.type !== 'state' && signal.type !== 'complete') {
		const mappedState = SIGNAL_STATE_MAP[signal.type];
		// Extract payload from flat IDE signal (everything except type and timestamp)
		const { type: _type, timestamp: _ts, ...idePayloadData } = signal as Record<string, unknown>;
		const hasPayload = Object.keys(idePayloadData).length > 0;
		const newPayloadHash = hasPayload ? simpleHash(JSON.stringify(idePayloadData)) : null;
		const stateChanged = mappedState !== prevFileState.state;
		const payloadChanged = newPayloadHash !== prevFileState.payloadHash;

		if (stateChanged || payloadChanged) {
			currentFileState.state = mappedState;
			currentFileState.payloadHash = newPayloadHash;
			broadcastSessionState(sessionName, mappedState, {
				previousState: prevFileState.state,
				signalPayload: hasPayload ? { type: signal.type as string, ...idePayloadData } : undefined
			});
			if (stateChanged) {
				console.log(`[WS Watcher] IDE signal state for ${sessionName}: ${prevFileState.state} -> ${mappedState}${hasPayload ? ' (with payload)' : ''}`);
			} else {
				console.log(`[WS Watcher] IDE signal payload update for ${sessionName}: ${mappedState} (data changed)`);
			}
		}
	}

	// Handle complete signals (full completion bundle)
	if (signal.type === 'complete') {
		const bundle = readCompletionBundle(sessionName);
		const completeHash = bundle ? simpleHash(JSON.stringify(bundle)) : null;
		if (completeHash !== prevFileState.completeHash) {
			currentFileState.completeHash = completeHash;
			if (bundle) {
				// Persist the completion bundle (lazy import to avoid $lib at config time)
				if (bundle.taskId) {
					try {
						// Dynamic import since completionBundles uses $lib
						import('../completionBundles.js').then(({ persistCompletionBundle }) => {
							const result = persistCompletionBundle(bundle.taskId as string, bundle as Parameters<typeof persistCompletionBundle>[1], sessionName);
							if (result.success) {
								console.log(`[WS Watcher] Persisted completion bundle for task ${bundle.taskId}`);
							} else {
								console.error(`[WS Watcher] Failed to persist bundle for ${bundle.taskId}: ${result.error}`);
							}
						}).catch(() => {
							// Silently fail if module not available
						});
					} catch {
						// Silently fail
					}
				}

				// Broadcast completion bundle
				broadcastSessionComplete(sessionName, bundle);
				console.log(`[WS Watcher] Complete bundle for ${sessionName}: ${(bundle.summary as string[])?.length || 0} summary items`);

				// Also broadcast the appropriate state change
				if ((bundle.completionMode as string) === 'auto_proceed') {
					currentFileState.state = 'auto_proceed';
					broadcastSessionState(sessionName, 'auto_proceed', {
						previousState: prevFileState.state,
						signalPayload: {
							taskId: bundle.taskId,
							nextTaskId: bundle.nextTaskId,
							nextTaskTitle: bundle.nextTaskTitle
						}
					});
					console.log(`[WS Watcher] Auto-proceed triggered for ${sessionName}: next task ${bundle.nextTaskId}`);
				} else {
					currentFileState.state = 'completed';
					broadcastSessionState(sessionName, 'completed', {
						previousState: prevFileState.state
					});
				}
			}
		}
	}

	signalFileStates.set(sessionName, currentFileState);
}

/**
 * Process all existing signal files on startup
 * Ensures clients get current state when connecting
 */
function processExistingSignalFiles(): void {
	try {
		const files = readdirSync('/tmp').filter(f =>
			f.startsWith('squad-signal-tmux-') && f.endsWith('.json')
		);

		signalFileStates.clear();

		for (const filename of files) {
			const sessionName = filename.replace('squad-signal-tmux-', '').replace('.json', '');
			if (sessionName) {
				processSignalFileChange(sessionName);
			}
		}

		console.log(`[WS Watcher] Processed ${files.length} existing signal files`);
	} catch (err) {
		console.error('[WS Watcher] Failed to process existing signal files:', err);
	}
}

/**
 * Read question data for a session from /tmp/claude-question-tmux-{sessionName}.json
 */
function readQuestionData(sessionName: string): { hasQuestion: boolean; questionData?: unknown } {
	const questionFile = `/tmp/claude-question-tmux-${sessionName}.json`;

	try {
		if (!existsSync(questionFile)) {
			return { hasQuestion: false };
		}

		const stats = statSync(questionFile);
		const ageMs = Date.now() - stats.mtimeMs;

		if (ageMs > QUESTION_MAX_AGE_MS) {
			return { hasQuestion: false };
		}

		const content = readFileSync(questionFile, 'utf-8');
		const questionData = JSON.parse(content);

		return { hasQuestion: true, questionData };
	} catch {
		return { hasQuestion: false };
	}
}

/**
 * Process a question file change and broadcast if question appeared/changed
 */
function processQuestionFileChange(sessionName: string): void {
	if (!isInitialized()) return;

	const subscriberCount = getChannelSubscriberCount('sessions');
	if (subscriberCount === 0) return;

	const { hasQuestion, questionData } = readQuestionData(sessionName);
	const questionHash = hasQuestion && questionData ? simpleHash(JSON.stringify(questionData)) : null;

	const prevState = questionFileStates.get(sessionName) || { hasQuestion: false, questionHash: null };

	// Only broadcast if question appeared or changed
	if (hasQuestion && (!prevState.hasQuestion || questionHash !== prevState.questionHash)) {
		broadcastSessionQuestion(sessionName, questionData);
		console.log(`[WS Watcher] Question appeared/changed for ${sessionName}`);
	}

	questionFileStates.set(sessionName, { hasQuestion, questionHash });
}

/**
 * Start watching /tmp for signal and question file changes
 * Provides instant (~50ms) updates for state changes and questions
 */
function startSignalAndQuestionWatcher(): void {
	if (signalWatcher) {
		console.log('[WS Watcher] Signal/question watcher already running');
		return;
	}

	console.log('[WS Watcher] Starting signal/question file watcher on /tmp');

	// Process existing signal files first
	processExistingSignalFiles();

	try {
		signalWatcher = watch('/tmp', { persistent: false }, (_eventType, filename) => {
			if (!filename || !filename.endsWith('.json')) return;

			// Handle signal files: squad-signal-tmux-{sessionName}.json
			if (filename.startsWith('squad-signal-tmux-')) {
				const sessionName = filename.replace('squad-signal-tmux-', '').replace('.json', '');
				if (!sessionName) return;

				const existingTimer = signalDebounceTimers.get(sessionName);
				if (existingTimer) clearTimeout(existingTimer);

				signalDebounceTimers.set(sessionName, setTimeout(() => {
					signalDebounceTimers.delete(sessionName);
					processSignalFileChange(sessionName);
				}, SIGNAL_DEBOUNCE_MS));
				return;
			}

			// Handle question files: claude-question-tmux-{sessionName}.json
			if (filename.startsWith('claude-question-tmux-')) {
				const sessionName = filename.replace('claude-question-tmux-', '').replace('.json', '');
				if (!sessionName) return;

				const existingTimer = questionDebounceTimers.get(sessionName);
				if (existingTimer) clearTimeout(existingTimer);

				questionDebounceTimers.set(sessionName, setTimeout(() => {
					questionDebounceTimers.delete(sessionName);
					processQuestionFileChange(sessionName);
				}, QUESTION_DEBOUNCE_MS));
			}
		});

		signalWatcher.on('error', (err) => {
			console.error('[WS Watcher] Signal/question watcher error:', err);
		});

		console.log('[WS Watcher] Signal/question file watcher started');
	} catch (err) {
		console.error('[WS Watcher] Failed to start signal/question watcher:', err);
	}
}

/**
 * Stop the signal/question file watcher
 */
function stopSignalAndQuestionWatcher(): void {
	if (!signalWatcher) return;

	signalWatcher.close();
	signalWatcher = null;

	// Clear signal debounce timers
	signalDebounceTimers.forEach(timer => clearTimeout(timer));
	signalDebounceTimers.clear();

	// Clear question debounce timers
	questionDebounceTimers.forEach(timer => clearTimeout(timer));
	questionDebounceTimers.clear();

	// Clear tracked state
	signalFileStates.clear();
	questionFileStates.clear();

	console.log('[WS Watcher] Signal/question watcher stopped');
}

// ============================================================================
// Session Lifecycle Watcher (detects tmux session create/destroy)
// ============================================================================

/**
 * Get list of active squad-* tmux sessions
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
			.filter(name => name.startsWith('squad-') && !name.startsWith('squad-pending-'));
	} catch {
		return [];
	}
}

/**
 * Get tasks with caching to avoid expensive JSONL parsing on every poll
 */
function getCachedTasks(): TaskInfo[] {
	const now = Date.now();
	if (now - taskCacheTimestamp > TASK_CACHE_TTL_MS || cachedTasks.length === 0) {
		try {
			cachedTasks = getTasks({});
			taskCacheTimestamp = now;
		} catch {
			// Continue with stale cache on error
		}
	}
	return cachedTasks;
}

/**
 * Poll for tmux session create/destroy events
 */
async function pollSessionLifecycle(): Promise<void> {
	if (isLifecyclePolling) return;
	if (!isInitialized()) return;

	// Only poll if there are subscribers to the sessions channel
	const subscriberCount = getChannelSubscriberCount('sessions');
	if (subscriberCount === 0) return;

	isLifecyclePolling = true;

	try {
		const sessions = await getTmuxSessions();
		const currentSessionNames = new Set(sessions);

		// Get task info for agent lookup
		const allTasks = getCachedTasks();
		const agentTaskMap = new Map<string, TaskInfo>();
		allTasks
			.filter((t: TaskInfo) => t.status === 'in_progress' && t.assignee)
			.forEach((t: TaskInfo) => {
				agentTaskMap.set(t.assignee!, t);
			});

		// Detect new sessions
		for (const sessionName of currentSessionNames) {
			if (!knownSessions.has(sessionName)) {
				const agentName = sessionName.replace(/^squad-/, '');
				const task = agentTaskMap.get(agentName) || null;

				broadcastSessionCreated(
					sessionName,
					agentName,
					task ? { id: task.id, title: task.title, status: task.status } : null
				);
				console.log(`[WS Watcher] Session created: ${sessionName}`);
			}
		}

		// Detect destroyed sessions
		for (const sessionName of knownSessions) {
			if (!currentSessionNames.has(sessionName)) {
				broadcastSessionDestroyed(sessionName);
				console.log(`[WS Watcher] Session destroyed: ${sessionName}`);

				// Clean up tracked state for this session
				signalFileStates.delete(sessionName);
				questionFileStates.delete(sessionName);
				previousOutputHashes.delete(sessionName);

				// Clean up debounce timers for this session
				const signalTimer = signalDebounceTimers.get(sessionName);
				if (signalTimer) {
					clearTimeout(signalTimer);
					signalDebounceTimers.delete(sessionName);
				}
				const questionTimer = questionDebounceTimers.get(sessionName);
				if (questionTimer) {
					clearTimeout(questionTimer);
					questionDebounceTimers.delete(sessionName);
				}
			}
		}

		knownSessions = currentSessionNames;
	} finally {
		isLifecyclePolling = false;
	}
}

/**
 * Start session lifecycle polling
 */
function startSessionLifecyclePolling(): void {
	if (sessionLifecycleInterval) {
		console.log('[WS Watcher] Session lifecycle polling already running');
		return;
	}

	console.log(`[WS Watcher] Starting session lifecycle polling (${SESSION_LIFECYCLE_POLL_INTERVAL}ms interval)`);

	// Initialize known sessions
	getTmuxSessions().then(sessions => {
		knownSessions = new Set(sessions);
		console.log(`[WS Watcher] Initialized with ${sessions.length} known tmux sessions`);
	});

	sessionLifecycleInterval = setInterval(() => {
		pollSessionLifecycle();
	}, SESSION_LIFECYCLE_POLL_INTERVAL);

	console.log('[WS Watcher] Session lifecycle polling started');
}

/**
 * Stop session lifecycle polling
 */
function stopSessionLifecyclePolling(): void {
	if (sessionLifecycleInterval) {
		clearInterval(sessionLifecycleInterval);
		sessionLifecycleInterval = null;
		knownSessions.clear();
		isLifecyclePolling = false;
		console.log('[WS Watcher] Session lifecycle polling stopped');
	}
}

// ============================================================================
// Output Polling (for WebSocket streaming)
// ============================================================================

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
	startSignalAndQuestionWatcher();
	startSessionLifecyclePolling();
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

	// Stop polling
	stopOutputPolling();
	stopSessionLifecyclePolling();

	// Stop file watchers
	stopSignalAndQuestionWatcher();

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
