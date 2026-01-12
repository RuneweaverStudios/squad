/**
 * SSE endpoint for real-time session events
 *
 * ## Architecture
 *
 * Uses a hybrid approach for optimal responsiveness:
 *
 * 1. **fs.watch() for instant file updates (~50ms latency)**
 *    - Signal files: /tmp/jat-signal-tmux-*.json (state, tasks, actions, completion)
 *    - Question files: /tmp/claude-question-tmux-*.json (agent questions)
 *    - These are the PRIMARY source for state/question updates
 *
 * 2. **Polling for terminal output and session lifecycle (1000ms interval)**
 *    - tmux pane capture (can't be file-watched)
 *    - Session creation/destruction detection
 *    - Fallback state detection from output markers (when no signal file)
 *
 * ## Events Emitted
 *
 * - connected: Initial connection acknowledgment
 * - session-output: { sessionName, output, lineCount, isDelta?, timestamp }
 * - session-state: { sessionName, state, previousState, timestamp }
 * - session-question: { sessionName, question, timestamp }
 * - session-signal: { sessionName, signalType, suggestedTasks?, action?, timestamp }
 * - session-complete: { sessionName, completionBundle: { taskId, agentName, summary, quality, ... } }
 * - session-created: { sessionName, agentName, task, timestamp }
 * - session-destroyed: { sessionName, timestamp }
 *
 * ## Performance Notes
 *
 * - Signal/question file watching eliminates 1-second polling delay for state changes
 * - Output changes are debounced (configurable, default 250ms)
 * - Delta updates for output minimize bandwidth
 * - Watcher only runs when at least one client is connected
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync, statSync, readdirSync, watch, type FSWatcher } from 'fs';
import { join } from 'path';
import { getTasks } from '$lib/server/beads.js';
import { persistCompletionBundle } from '$lib/server/completionBundles.js';
import { SIGNAL_TTL } from '$lib/config/constants.js';

const execAsync = promisify(exec);

// ============================================================================
// Configuration
// ============================================================================

const PROJECT_ROOT = process.cwd().replace('/ide', '');
const DEFAULT_DEBOUNCE_MS = 250;
const DEFAULT_OUTPUT_LINES = 100;
// INCREASED from 250ms to 1000ms - polling 4x/second was parsing 802 tasks
// from JSONL on each poll, causing server CPU spikes and browser freezes
const POLL_INTERVAL_MS = 1000;
const QUESTION_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

// Delta update configuration
// When enabled, sends only new lines instead of full buffer (bandwidth optimization)
const DELTA_UPDATES_ENABLED = true;

// Cache for tasks - getTasks() is expensive (parses JSONL)
let cachedTasks: Task[] = [];
let taskCacheTimestamp = 0;
const TASK_CACHE_TTL_MS = 5000; // 5 second cache for tasks

// ============================================================================
// Types
// ============================================================================

interface SessionInfo {
	name: string;
	created: string;
	attached: boolean;
}

interface SuggestedTask {
	id?: string;
	type: string;
	title: string;
	description: string;
	priority: number;
	reason?: string;
	project?: string;
	labels?: string;
	depends_on?: string[];
}

interface HumanAction {
	action?: string;
	title?: string;
	description?: string;
	message?: string;
	timestamp?: string;
}

interface QualitySignals {
	tests: 'passing' | 'failing' | 'none' | 'skipped';
	build: 'clean' | 'warnings' | 'errors';
	preExisting?: string;
}

interface CrossAgentIntel {
	files?: string[];
	patterns?: string[];
	gotchas?: string[];
}

interface CompletionBundle {
	taskId: string;
	agentName: string;
	summary: string[];
	quality: QualitySignals;
	humanActions?: HumanAction[];
	suggestedTasks?: SuggestedTask[];
	crossAgentIntel?: CrossAgentIntel;
	// Completion mode determines IDE behavior
	completionMode?: 'review_required' | 'auto_proceed';
	// For auto_proceed mode: next task to spawn
	nextTaskId?: string;
	nextTaskTitle?: string;
}

interface SessionState {
	output: string;
	outputHash: string;
	lineCount: number;
	state: string;
	hasQuestion: boolean;
	questionData?: unknown;
	task?: {
		id: string;
		title?: string;
		status?: string;
	} | null;
	agentName: string;
	suggestedTasks?: SuggestedTask[];
	suggestedTasksHash?: string;
}

interface Task {
	id: string;
	title?: string;
	status?: string;
	assignee?: string;
}

// ============================================================================
// State Management
// ============================================================================

// Track connected clients with their cursor positions for delta updates
interface ClientState {
	controller: ReadableStreamDefaultController;
	// Per-session cursor positions (line count last sent to this client)
	// Key: sessionName, Value: { linesSent: number, outputHash: string }
	cursors: Map<string, { linesSent: number; outputHash: string }>;
	// Whether this client has received initial full buffer for each session
	initializedSessions: Set<string>;
}

// Track connected clients (controller -> state for delta updates)
const clients = new Set<ReadableStreamDefaultController>();
const clientStates = new Map<ReadableStreamDefaultController, ClientState>();

// Track session state for change detection
const sessionStates = new Map<string, SessionState>();

// Track known sessions for create/destroy detection
let knownSessions = new Set<string>();

// Polling interval handle
let pollInterval: ReturnType<typeof setInterval> | null = null;

// Debounce timers for output changes
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Signal file watcher
let signalWatcher: FSWatcher | null = null;

// Track signal file states for change detection (keyed by sessionName)
const signalFileStates = new Map<string, { state: string | null; completeHash: string | null }>();

// Debounce timers for signal file changes (prevents multiple events for same write)
const signalDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const SIGNAL_DEBOUNCE_MS = 50; // Quick debounce for file write completion

// Track question file states for change detection (keyed by sessionName)
const questionFileStates = new Map<string, { hasQuestion: boolean; questionHash: string | null }>();

// Debounce timers for question file changes
const questionDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const QUESTION_DEBOUNCE_MS = 50; // Quick debounce for question file writes

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Simple hash for change detection
 */
function simpleHash(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash;
	}
	return hash.toString(36);
}

/**
 * Map jat-signal states to SessionCard states
 * Signal uses short names, SessionCard expects hyphenated names
 */
const SIGNAL_STATE_MAP: Record<string, string> = {
	'working': 'working',
	'review': 'ready-for-review',
	'needs_input': 'needs-input',
	'idle': 'idle',
	'completed': 'completed',  // completionMode: 'auto_proceed' in payload triggers auto-spawn of next task
	'starting': 'starting',
	'compacting': 'compacting',
	'completing': 'completing',
};

/**
 * Read signal state from /tmp/jat-signal-tmux-{sessionName}.json
 * Handles both state signals (type: "state") and completion bundles (type: "complete")
 * Returns null if no valid signal file exists or signal is stale
 */
function readSignalState(sessionName: string): string | null {
	const signalFile = `/tmp/jat-signal-tmux-${sessionName}.json`;

	try {
		if (!existsSync(signalFile)) {
			return null;
		}

		const content = readFileSync(signalFile, 'utf-8');
		const signal = JSON.parse(content);

		// Check file age - use different TTL based on signal type
		// See SIGNAL_TTL in constants.ts for configuration
		const stats = statSync(signalFile);
		const ageMs = Date.now() - stats.mtimeMs;
		const isUserWaitingState = signal.type === 'state' && SIGNAL_TTL.USER_WAITING_STATES.includes(signal.state);
		const ttl = signal.type === 'complete' || isUserWaitingState ? SIGNAL_TTL.USER_WAITING_MS : SIGNAL_TTL.TRANSIENT_MS;
		if (ageMs > ttl) {
			return null;
		}

		// Handle state signals (working, review, needs_input, etc.)
		if (signal.type === 'state' && signal.state) {
			// Map signal state to SessionCard state
			return SIGNAL_STATE_MAP[signal.state] || signal.state;
		}

		// Handle completion bundles - these should show as "completed" state
		if (signal.type === 'complete') {
			return 'completed';
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * Read suggested tasks from completion bundle signal file
 * Returns array of SuggestedTask or null if not available
 * Uses longer TTL since suggested tasks should persist until user acts
 *
 * Note: Suggested tasks are only emitted as part of 'complete' signals.
 * The standalone 'tasks' signal type was removed as it was never used.
 */
function readSignalSuggestedTasks(sessionName: string): SuggestedTask[] | null {
	const signalFile = `/tmp/jat-signal-tmux-${sessionName}.json`;

	try {
		if (!existsSync(signalFile)) {
			return null;
		}

		// Suggested tasks use longer TTL since they wait for user action
		const stats = statSync(signalFile);
		const ageMs = Date.now() - stats.mtimeMs;
		if (ageMs > SIGNAL_TTL.USER_WAITING_MS) {
			return null;
		}

		const content = readFileSync(signalFile, 'utf-8');
		const signal = JSON.parse(content);

		// Suggested tasks come from complete signal with embedded suggestedTasks
		if (signal.type === 'complete' && signal.data?.suggestedTasks) {
			return signal.data.suggestedTasks.map((t: Partial<SuggestedTask>) => ({
				id: t.id,
				type: t.type || 'task',
				title: t.title || '',
				description: t.description || '',
				priority: typeof t.priority === 'number' ? t.priority : 2,
				reason: t.reason,
				project: t.project,
				labels: t.labels,
				depends_on: t.depends_on
			}));
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * Read completion bundle from signal file
 * Returns full CompletionBundle or null if not a complete signal
 * Uses longer TTL since completion data should persist until user acts
 */
function readCompletionBundle(sessionName: string): CompletionBundle | null {
	const signalFile = `/tmp/jat-signal-tmux-${sessionName}.json`;

	try {
		if (!existsSync(signalFile)) {
			return null;
		}

		// Completion bundles use longer TTL since they wait for user action
		const stats = statSync(signalFile);
		const ageMs = Date.now() - stats.mtimeMs;
		if (ageMs > SIGNAL_TTL.USER_WAITING_MS) {
			return null;
		}

		const content = readFileSync(signalFile, 'utf-8');
		const signal = JSON.parse(content);

		// Only handle complete signals with full bundle
		if (signal.type === 'complete' && signal.data) {
			const data = signal.data;
			return {
				taskId: data.taskId || '',
				agentName: data.agentName || '',
				summary: Array.isArray(data.summary) ? data.summary : [],
				quality: data.quality || { tests: 'none', build: 'clean' },
				humanActions: Array.isArray(data.humanActions) ? data.humanActions : undefined,
				suggestedTasks: Array.isArray(data.suggestedTasks) ? data.suggestedTasks.map((t: Partial<SuggestedTask>) => ({
					id: t.id,
					type: t.type || 'task',
					title: t.title || '',
					description: t.description || '',
					priority: typeof t.priority === 'number' ? t.priority : 2,
					reason: t.reason,
					project: t.project,
					labels: t.labels,
					depends_on: t.depends_on
				})) : undefined,
				crossAgentIntel: data.crossAgentIntel || undefined,
				// Extract completion mode and next task info
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
 * Read full signal file content for processing
 * Returns parsed signal or null
 */
function readSignalFile(sessionName: string): { type: string; state?: string; data?: unknown; timestamp?: string } | null {
	const signalFile = `/tmp/jat-signal-tmux-${sessionName}.json`;

	try {
		if (!existsSync(signalFile)) {
			return null;
		}

		// Read and parse first to determine signal type
		const content = readFileSync(signalFile, 'utf-8');
		const signal = JSON.parse(content);

		// Apply TTL based on signal type - see SIGNAL_TTL in constants.ts
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
 * Process a signal file change and broadcast appropriate events
 */
function processSignalFileChange(sessionName: string): void {
	if (clients.size === 0) return;

	const signal = readSignalFile(sessionName);
	if (!signal) return;

	const prevFileState = signalFileStates.get(sessionName) || { state: null, completeHash: null };
	const currentFileState = { state: prevFileState.state, completeHash: prevFileState.completeHash };

	// Handle state signals (working, review, needs_input, etc.)
	// Include the full signal data payload for rich signal card rendering
	if (signal.type === 'state' && signal.state) {
		const mappedState = SIGNAL_STATE_MAP[signal.state] || signal.state;
		if (mappedState !== prevFileState.state) {
			currentFileState.state = mappedState;
			broadcast('session-state', {
				sessionName,
				state: mappedState,
				previousState: prevFileState.state,
				// Include the full signal payload for rich signal cards
				signalPayload: signal.data ? { type: signal.state, ...signal.data } : undefined
			});
			console.log(`[SSE Signal] State change for ${sessionName}: ${prevFileState.state} -> ${mappedState}${signal.data ? ' (with payload)' : ''}`);
		}
	}

	// Handle complete signals (full completion bundle)
	if (signal.type === 'complete') {
		const bundle = readCompletionBundle(sessionName);
		const completeHash = bundle ? simpleHash(JSON.stringify(bundle)) : null;
		if (completeHash !== prevFileState.completeHash) {
			currentFileState.completeHash = completeHash;
			if (bundle) {
				// Persist the completion bundle to .beads/completions.json
				// This ensures the bundle survives session restarts
				if (bundle.taskId) {
					const persistResult = persistCompletionBundle(bundle.taskId, bundle, sessionName);
					if (persistResult.success) {
						console.log(`[SSE Signal] Persisted completion bundle for task ${bundle.taskId}`);
					} else {
						console.error(`[SSE Signal] Failed to persist bundle for ${bundle.taskId}: ${persistResult.error}`);
					}
				}

				// Broadcast the full completion bundle (wrapped for client extraction)
				broadcast('session-complete', {
					sessionName,
					completionBundle: bundle
				});
				console.log(`[SSE Signal] Complete bundle for ${sessionName}: ${bundle.summary?.length || 0} summary items, ${bundle.suggestedTasks?.length || 0} tasks, ${bundle.humanActions?.length || 0} actions`);

				// Check if this is an auto-proceed completion
				if (bundle.completionMode === 'auto_proceed') {
					// Emit auto_proceed state to trigger IDE auto-spawn
					currentFileState.state = 'auto_proceed';
					broadcast('session-state', {
						sessionName,
						state: 'auto_proceed',
						previousState: prevFileState.state,
						signalPayload: {
							taskId: bundle.taskId,
							nextTaskId: bundle.nextTaskId,
							nextTaskTitle: bundle.nextTaskTitle
						}
					});
					console.log(`[SSE Signal] Auto-proceed triggered for ${sessionName}: next task ${bundle.nextTaskId}`);
				} else {
					// Standard completion - awaiting review
					currentFileState.state = 'completed';
					broadcast('session-state', {
						sessionName,
						state: 'completed',
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
 * This ensures clients get current state when connecting/reconnecting
 */
function processExistingSignalFiles(): void {
	try {
		const files = readdirSync('/tmp').filter(f =>
			f.startsWith('jat-signal-tmux-') && f.endsWith('.json')
		);

		// Clear previous state so all files get broadcast
		signalFileStates.clear();

		for (const filename of files) {
			const sessionName = filename.replace('jat-signal-tmux-', '').replace('.json', '');
			if (sessionName) {
				processSignalFileChange(sessionName);
			}
		}

		console.log(`[SSE Signal] Processed ${files.length} existing signal files`);
	} catch (err) {
		console.error('[SSE Signal] Failed to process existing files:', err);
	}
}

/**
 * Process a question file change and broadcast if question appeared/changed
 */
function processQuestionFileChange(sessionName: string): void {
	if (clients.size === 0) return;

	const { hasQuestion, questionData } = readQuestionData(sessionName);
	const questionHash = hasQuestion && questionData ? simpleHash(JSON.stringify(questionData)) : null;

	const prevState = questionFileStates.get(sessionName) || { hasQuestion: false, questionHash: null };

	// Only broadcast if question appeared or changed
	if (hasQuestion && (!prevState.hasQuestion || questionHash !== prevState.questionHash)) {
		broadcast('session-question', {
			sessionName,
			question: questionData
		});
		console.log(`[SSE Question] Question appeared/changed for ${sessionName}`);
	}

	// Update tracked state
	questionFileStates.set(sessionName, { hasQuestion, questionHash });
}

/**
 * Start watching signal and question files in /tmp for real-time updates
 */
function startSignalWatcher(): void {
	if (signalWatcher) return;

	console.log('[SSE Signal] Starting file watcher on /tmp for signals and questions');

	// Process existing signal files first (broadcasts current state to clients)
	processExistingSignalFiles();

	try {
		signalWatcher = watch('/tmp', (eventType, filename) => {
			// Debug: log all .json file events
			if (filename?.endsWith('.json')) {
				console.log(`[SSE Signal] fs.watch event: ${eventType} ${filename}`);
			}
			if (!filename || !filename.endsWith('.json')) return;

			// Handle signal files: jat-signal-tmux-{sessionName}.json
			if (filename.startsWith('jat-signal-tmux-')) {
				const sessionName = filename.replace('jat-signal-tmux-', '').replace('.json', '');
				if (!sessionName) return;

				// Debounce to handle rapid file writes (file systems may emit multiple events)
				const existingTimer = signalDebounceTimers.get(sessionName);
				if (existingTimer) {
					clearTimeout(existingTimer);
				}

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

				// Debounce to handle rapid file writes
				const existingTimer = questionDebounceTimers.get(sessionName);
				if (existingTimer) {
					clearTimeout(existingTimer);
				}

				questionDebounceTimers.set(sessionName, setTimeout(() => {
					questionDebounceTimers.delete(sessionName);
					processQuestionFileChange(sessionName);
				}, QUESTION_DEBOUNCE_MS));
			}
		});

		signalWatcher.on('error', (err) => {
			console.error('[SSE Signal] Watcher error:', err);
		});
	} catch (err) {
		console.error('[SSE Signal] Failed to start watcher:', err);
	}
}

/**
 * Stop the signal file watcher
 */
function stopSignalWatcher(): void {
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

	console.log('[SSE Signal] Stopped signal file watcher');
}

/**
 * Detect session state - prefers signal file over marker parsing
 *
 * State priority:
 * 1. Signal file (authoritative - written by jat-signal hook)
 * 2. Marker parsing (fallback - legacy support)
 */
function detectSessionState(output: string, task: Task | null, sessionName?: string): string {
	// First, try to read state from signal file (authoritative source)
	if (sessionName) {
		const signalState = readSignalState(sessionName);
		if (signalState) {
			return signalState;
		}
	}

	// Fall back to marker parsing for legacy support
	return detectSessionStateFromOutput(output, task);
}

/**
 * Detect session state from terminal output (legacy fallback)
 * Uses the same logic as /api/work for consistency
 */
function detectSessionStateFromOutput(output: string, task: Task | null): string {
	const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');
	const recentOutput = output ? stripAnsi(output.slice(-3000)) : '';

	// Find positions of state markers
	const completedPos = recentOutput.lastIndexOf('[JAT:COMPLETED]');
	const idlePos = recentOutput.lastIndexOf('[JAT:IDLE]');

	// Question UI patterns
	const questionUIPatterns = [
		'Enter to select',
		'Tab/Arrow keys to navigate',
		'Type something',
		'[ ]'
	];
	let needsInputPos = recentOutput.lastIndexOf('[JAT:NEEDS_INPUT]');
	for (const pattern of questionUIPatterns) {
		const pos = recentOutput.lastIndexOf(pattern);
		if (pos > needsInputPos) needsInputPos = pos;
	}

	const reviewPos = Math.max(
		recentOutput.lastIndexOf('[JAT:NEEDS_REVIEW]'),
		recentOutput.lastIndexOf('[JAT:READY]'),
		recentOutput.lastIndexOf('ready to mark complete'),
		recentOutput.lastIndexOf('Ready to mark complete'),
		recentOutput.lastIndexOf('shall I mark'),
		recentOutput.lastIndexOf('Shall I mark'),
		recentOutput.lastIndexOf('ready for review'),
		recentOutput.lastIndexOf('Ready for Review')
	);

	const completingPos = Math.max(
		recentOutput.lastIndexOf('jat:complete is running'),
		recentOutput.lastIndexOf('Marking task complete')
	);

	const workingPos = recentOutput.lastIndexOf('[JAT:WORKING');
	const compactingPos = recentOutput.lastIndexOf('[JAT:COMPACTING]');

	if (task) {
		// Build list of detected states with positions
		const positions = [
			{ state: 'needs-input', pos: needsInputPos },
			{ state: 'ready-for-review', pos: reviewPos },
			{ state: 'completing', pos: completingPos },
			{ state: 'compacting', pos: compactingPos },
			{ state: 'working', pos: workingPos }
		];

		// Most recent marker wins
		const sorted = positions.filter(p => p.pos >= 0).sort((a, b) => b.pos - a.pos);
		if (sorted.length > 0) {
			return sorted[0].state;
		}

		return 'working';
	}

	// No task - check for completion markers
	const hasCompletionMarker = completedPos >= 0 || idlePos >= 0 ||
		/✅\s*TASK COMPLETE/.test(recentOutput);

	if (hasCompletionMarker) {
		return 'completed';
	}

	if (recentOutput.length < 500) {
		return 'starting';
	}

	return 'idle';
}

/**
 * Read question data for a session
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
 * Get list of jat-* tmux sessions
 */
async function getTmuxSessions(): Promise<SessionInfo[]> {
	try {
		const { stdout } = await execAsync(
			'tmux list-sessions -F "#{session_name}:#{session_created}:#{session_attached}" 2>/dev/null || echo ""'
		);

		return stdout
			.trim()
			.split('\n')
			.filter(line => line.length > 0 && line.startsWith('jat-') && !line.startsWith('jat-pending-'))
			.map(line => {
				const [name, created, attached] = line.split(':');
				return {
					name,
					created: new Date(parseInt(created, 10) * 1000).toISOString(),
					attached: parseInt(attached, 10) > 0
				};
			});
	} catch {
		return [];
	}
}

/**
 * Capture output from a tmux session
 */
async function captureOutput(sessionName: string, lines: number): Promise<string> {
	try {
		const { stdout } = await execAsync(
			`tmux capture-pane -p -e -t "${sessionName}" -S -${lines}`,
			{ maxBuffer: 1024 * 1024 * 5 }
		);
		return stdout;
	} catch {
		return '';
	}
}

/**
 * Broadcast an SSE event to all connected clients
 */
function broadcast(eventType: string, data: unknown): void {
	const message = `data: ${JSON.stringify({ type: eventType, ...data as object, timestamp: Date.now() })}\n\n`;
	const encoded = new TextEncoder().encode(message);

	for (const controller of clients) {
		try {
			controller.enqueue(encoded);
		} catch (err) {
			console.error('[SSE Sessions] Failed to send to client:', err);
		}
	}
}

/**
 * Send output update to a single client (used for delta updates)
 */
function sendToClient(controller: ReadableStreamDefaultController, eventType: string, data: unknown): void {
	const message = `data: ${JSON.stringify({ type: eventType, ...data as object, timestamp: Date.now() })}\n\n`;
	const encoded = new TextEncoder().encode(message);

	try {
		controller.enqueue(encoded);
	} catch (err) {
		console.error('[SSE Sessions] Failed to send to client:', err);
	}
}

/**
 * Calculate and send delta output update to each client
 *
 * Delta update protocol:
 * - Each client maintains cursor position per session (lines they've received)
 * - On first connect or reconnect, client gets full buffer (isDelta: false)
 * - On subsequent updates, client gets only new lines (isDelta: true)
 * - Client maintains local buffer and appends delta lines
 *
 * Event format:
 * {
 *   type: 'session-output',
 *   sessionName: string,
 *   output: string,           // Full buffer or delta lines
 *   lineCount: number,        // Total lines in session buffer
 *   isDelta: boolean,         // true = append these lines, false = replace buffer
 *   deltaLineCount?: number,  // Number of new lines in delta (when isDelta=true)
 *   cursorPosition: number    // Current cursor position (for debugging/sync)
 * }
 */
function broadcastOutputWithDelta(sessionName: string, output: string, outputHash: string): void {
	const lines = output.split('\n');
	const totalLineCount = lines.length;

	for (const controller of clients) {
		const clientState = clientStates.get(controller);
		if (!clientState) {
			// Fallback: send full buffer if client state missing
			sendToClient(controller, 'session-output', {
				sessionName,
				output,
				lineCount: totalLineCount,
				isDelta: false,
				cursorPosition: totalLineCount
			});
			continue;
		}

		const cursor = clientState.cursors.get(sessionName);
		const isInitialized = clientState.initializedSessions.has(sessionName);

		if (!isInitialized || !cursor) {
			// First time this client sees this session: send full buffer
			clientState.cursors.set(sessionName, { linesSent: totalLineCount, outputHash });
			clientState.initializedSessions.add(sessionName);

			sendToClient(controller, 'session-output', {
				sessionName,
				output,
				lineCount: totalLineCount,
				isDelta: false,
				cursorPosition: totalLineCount
			});
			continue;
		}

		// Check if buffer was truncated/rewound (e.g., terminal cleared, buffer scrolled)
		// This happens when the new output has fewer lines than what we've sent,
		// or when the hash changed but line count is same (content changed, not appended)
		const bufferRewound = totalLineCount < cursor.linesSent;
		const contentChanged = cursor.outputHash !== outputHash && totalLineCount <= cursor.linesSent;

		if (bufferRewound || contentChanged) {
			// Buffer was truncated or content changed - send full buffer
			clientState.cursors.set(sessionName, { linesSent: totalLineCount, outputHash });

			sendToClient(controller, 'session-output', {
				sessionName,
				output,
				lineCount: totalLineCount,
				isDelta: false,
				cursorPosition: totalLineCount
			});
			continue;
		}

		// Calculate delta: new lines since last sent
		const newLines = totalLineCount - cursor.linesSent;

		if (newLines <= 0) {
			// No new lines (shouldn't happen often due to hash check, but just in case)
			continue;
		}

		// Extract only the new lines
		const deltaLines = lines.slice(cursor.linesSent);
		const deltaOutput = deltaLines.join('\n');

		// Update cursor position
		clientState.cursors.set(sessionName, { linesSent: totalLineCount, outputHash });

		// Send delta update
		sendToClient(controller, 'session-output', {
			sessionName,
			output: deltaOutput,
			lineCount: totalLineCount,
			isDelta: true,
			deltaLineCount: newLines,
			cursorPosition: totalLineCount
		});
	}
}

// ============================================================================
// Session Polling
// ============================================================================

/**
 * Poll sessions and emit events for changes
 */
/**
 * Get tasks with caching to avoid expensive JSONL parsing on every poll
 */
function getCachedTasks(): Task[] {
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

async function pollSessions(outputLines: number, debounceMs: number): Promise<void> {
	if (clients.size === 0) return;

	// Get current sessions
	const sessions = await getTmuxSessions();
	const currentSessionNames = new Set(sessions.map(s => s.name));

	// Get all tasks for agent lookup (cached to avoid expensive JSONL parsing)
	const allTasks = getCachedTasks();

	// Create agent -> task map
	const agentTaskMap = new Map<string, Task>();
	allTasks
		.filter((t: Task) => t.status === 'in_progress' && t.assignee)
		.forEach((t: Task) => {
			agentTaskMap.set(t.assignee!, t);
		});

	// Detect new sessions
	for (const sessionName of currentSessionNames) {
		if (!knownSessions.has(sessionName)) {
			const agentName = sessionName.replace(/^jat-/, '');
			const task = agentTaskMap.get(agentName) || null;

			broadcast('session-created', {
				sessionName,
				agentName,
				task: task ? { id: task.id, title: task.title, status: task.status } : null
			});
		}
	}

	// Detect destroyed sessions
	for (const sessionName of knownSessions) {
		if (!currentSessionNames.has(sessionName)) {
			broadcast('session-destroyed', { sessionName });
			sessionStates.delete(sessionName);
		}
	}

	knownSessions = currentSessionNames;

	// Process each session
	// NOTE: Signal file state (working/review/completed) and suggested tasks are handled
	// by the fs.watch() signal watcher (startSignalWatcher) for instant ~50ms updates.
	// This polling loop only handles: terminal output, questions, and session metadata.
	for (const session of sessions) {
		const agentName = session.name.replace(/^jat-/, '');
		const task = agentTaskMap.get(agentName) || null;

		// Capture output
		const output = await captureOutput(session.name, outputLines);
		const outputHash = simpleHash(output);
		const lineCount = output.split('\n').length;

		// Detect state from output markers (fallback when signal file not present)
		// Signal file state is handled instantly by fs.watch() watcher
		const state = detectSessionStateFromOutput(output, task);

		// Read question data
		const { hasQuestion, questionData } = readQuestionData(session.name);

		// Get previous state
		const prevState = sessionStates.get(session.name);

		// Update stored state (without signal file data - that's handled by watcher)
		sessionStates.set(session.name, {
			output,
			outputHash,
			lineCount,
			state,
			hasQuestion,
			questionData,
			task,
			agentName,
			suggestedTasks: prevState?.suggestedTasks,
			suggestedTasksHash: prevState?.suggestedTasksHash
		});

		// Check for output changes (debounced)
		if (!prevState || prevState.outputHash !== outputHash) {
			// Clear existing debounce timer
			const existingTimer = debounceTimers.get(session.name);
			if (existingTimer) clearTimeout(existingTimer);

			// Set new debounce timer
			debounceTimers.set(session.name, setTimeout(() => {
				if (DELTA_UPDATES_ENABLED) {
					// Use delta updates for bandwidth optimization
					broadcastOutputWithDelta(session.name, output, outputHash);
				} else {
					// Legacy: send full buffer
					broadcast('session-output', {
						sessionName: session.name,
						output,
						lineCount
					});
				}
				debounceTimers.delete(session.name);
			}, debounceMs));
		}

		// Check for state changes from output markers (fallback detection)
		// NOTE: Signal file state changes are broadcast instantly by fs.watch() watcher
		if (!prevState || prevState.state !== state) {
			broadcast('session-state', {
				sessionName: session.name,
				state,
				previousState: prevState?.state || null
			});
		}

		// Check for question changes (immediate)
		if (hasQuestion && (!prevState || !prevState.hasQuestion)) {
			broadcast('session-question', {
				sessionName: session.name,
				question: questionData
			});
		}

		// NOTE: Suggested tasks are now handled exclusively by fs.watch() watcher
		// No need to poll signal files every second - watcher broadcasts within ~50ms
	}
}

/**
 * Start polling when first client connects
 */
function startPolling(outputLines: number, debounceMs: number): void {
	if (pollInterval) return;

	console.log(`[SSE Sessions] Starting polling (${POLL_INTERVAL_MS}ms interval, ${debounceMs}ms debounce)`);

	// Initialize known sessions
	getTmuxSessions().then(sessions => {
		knownSessions = new Set(sessions.map(s => s.name));
		console.log(`[SSE Sessions] Initialized with ${sessions.length} sessions`);
	});

	// Start signal file watcher for real-time signal updates
	startSignalWatcher();

	pollInterval = setInterval(() => {
		pollSessions(outputLines, debounceMs).catch(err => {
			console.error('[SSE Sessions] Poll error:', err);
		});
	}, POLL_INTERVAL_MS);
}

/**
 * Stop polling when no clients connected
 */
function stopPolling(): void {
	if (!pollInterval) return;

	clearInterval(pollInterval);
	pollInterval = null;

	// Stop signal file watcher
	stopSignalWatcher();

	// Clear all debounce timers
	debounceTimers.forEach(timer => clearTimeout(timer));
	debounceTimers.clear();

	// Clear state
	sessionStates.clear();
	knownSessions.clear();

	console.log('[SSE Sessions] Stopped polling');
}

// ============================================================================
// SSE Endpoint
// ============================================================================

export function GET({ url }: { url: URL }) {
	// Parse query parameters
	const debounceMs = parseInt(url.searchParams.get('debounce') || String(DEFAULT_DEBOUNCE_MS), 10);
	const outputLines = parseInt(url.searchParams.get('lines') || String(DEFAULT_OUTPUT_LINES), 10);

	console.log(`[SSE Sessions] New client connecting (debounce: ${debounceMs}ms, lines: ${outputLines})`);

	let thisController: ReadableStreamDefaultController | null = null;

	const stream = new ReadableStream({
		start(controller) {
			thisController = controller;
			clients.add(controller);

			// Initialize client state for delta updates
			if (DELTA_UPDATES_ENABLED) {
				clientStates.set(controller, {
					controller,
					cursors: new Map(),
					initializedSessions: new Set()
				});
			}

			console.log(`[SSE Sessions] Client connected. Total clients: ${clients.size}`);

			// Start polling if this is the first client
			if (clients.size === 1) {
				startPolling(outputLines, debounceMs);
			}

			// Send initial connection message with delta support flag
			const connectMsg = `data: ${JSON.stringify({
				type: 'connected',
				timestamp: Date.now(),
				deltaUpdatesEnabled: DELTA_UPDATES_ENABLED
			})}\n\n`;
			controller.enqueue(new TextEncoder().encode(connectMsg));
		},
		cancel() {
			console.log('[SSE Sessions] Client disconnected');
			if (thisController) {
				clients.delete(thisController);
				// Clean up client state
				clientStates.delete(thisController);
			}
			console.log(`[SSE Sessions] Remaining clients: ${clients.size}`);

			// Stop polling if no clients left
			if (clients.size === 0) {
				stopPolling();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive'
		}
	});
}
