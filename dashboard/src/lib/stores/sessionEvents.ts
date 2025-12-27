/**
 * Session event broadcasting for real-time session updates
 *
 * Two modes of operation:
 * 1. SSE connection to /api/sessions/events for real-time server events
 * 2. BroadcastChannel API for cross-tab communication
 *
 * Events handled from SSE:
 * - connected: Initial connection acknowledgment
 * - session-output: Terminal output changed → update workSessions store
 * - session-state: Session state changed → update state in workSessions store
 * - session-question: Agent asked a question → update question data
 * - session-created: New session appeared → add to workSessions store
 * - session-destroyed: Session ended → remove from workSessions store
 *
 * Integration:
 * - Call connectSessionEvents() in +layout.svelte onMount
 * - Disconnect on unmount with disconnectSessionEvents()
 * - Components can subscribe to lastSessionEvent for reactive updates
 */

import { writable } from 'svelte/store';
import { workSessionsState, type WorkSession } from './workSessions.svelte';
import { processSessionOutput, onAutomationTrigger, clearRecoveringState } from '$lib/utils/automationEngine';
import { initializeStore as initAutomationStore, clearSessionTriggers, getRuleById } from '$lib/stores/automationRules.svelte';

// Event types: original cross-tab events + new SSE events
export type SessionEventType =
	| 'session-killed'
	| 'session-spawned'
	| 'session-changed'
	| 'connected'
	| 'session-output'
	| 'session-state'
	| 'session-question'
	| 'session-signal'
	| 'session-complete'
	| 'session-created'
	| 'session-destroyed'
	| 'session-auto-proceed';

// Suggested task interface (from jat-signal)
export interface SuggestedTask {
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

// Human action interface (from jat-signal action type)
export interface HumanAction {
	title: string;
	description?: string;
	items?: string[];
	// Legacy fields still supported in signal events
	action?: string;
	message?: string;
	timestamp?: string;
}

// Quality signals from completed task
export interface QualitySignals {
	tests: 'passing' | 'failing' | 'none' | 'skipped';
	build: 'clean' | 'warnings' | 'errors';
	preExisting?: string;
}

// Cross-agent intelligence from completed task
export interface CrossAgentIntel {
	files?: string[];
	patterns?: string[];
	gotchas?: string[];
}

// Full completion bundle from jat-signal complete
export interface CompletionBundle {
	taskId: string;
	agentName: string;
	summary: string[];
	quality: QualitySignals;
	humanActions?: HumanAction[];
	suggestedTasks?: SuggestedTask[];
	crossAgentIntel?: CrossAgentIntel;
}

// Rich signal payload from jat-signal commands (working, review, needs_input, completing)
// Contains the full structured data for rendering signal cards
export interface RichSignalPayload {
	type: string; // 'working' | 'review' | 'needs_input' | 'completing' | etc.
	// Working signal fields
	taskId?: string;
	taskTitle?: string;
	taskDescription?: string;
	taskPriority?: number;
	taskType?: string;
	approach?: string;
	expectedFiles?: string[];
	estimatedScope?: 'small' | 'medium' | 'large';
	baselineCommit?: string;
	baselineBranch?: string;
	dependencies?: string[];
	blockers?: string[];
	// Review signal fields
	summary?: string[];
	filesModified?: Array<{
		path: string;
		changeType: 'added' | 'modified' | 'deleted';
		linesAdded: number;
		linesRemoved: number;
		description?: string;
	}>;
	totalLinesAdded?: number;
	totalLinesRemoved?: number;
	keyDecisions?: Array<{ decision: string; rationale: string }>;
	testsStatus?: 'passing' | 'failing' | 'none' | 'skipped';
	testsRun?: number;
	testsPassed?: number;
	buildStatus?: 'clean' | 'warnings' | 'errors';
	buildWarnings?: string[];
	reviewFocus?: string[];
	knownLimitations?: string[];
	commits?: Array<{ sha: string; message: string }>;
	// Needs input signal fields
	question?: string;
	questionType?: 'choice' | 'text' | 'approval' | 'clarification';
	context?: string;
	relevantCode?: string;
	relevantFiles?: string[];
	options?: Array<{
		id: string;
		label: string;
		description: string;
		recommended?: boolean;
		tradeoffs?: string;
	}>;
	impact?: string;
	blocking?: string[];
	timeoutAction?: string;
	timeoutMinutes?: number;
	// Completing signal fields
	currentStep?: 'verifying' | 'committing' | 'closing' | 'releasing' | 'announcing';
	stepsCompleted?: string[];
	stepsRemaining?: string[];
	progress?: number;
	stepDescription?: string;
	stepStartedAt?: string;
}

export interface SessionEvent {
	type: SessionEventType;
	sessionName?: string;
	agentName?: string;
	timestamp: number;
	// SSE event-specific fields
	output?: string;
	lineCount?: number;
	state?: string;
	previousState?: string | null;
	question?: unknown;
	task?: {
		id: string;
		title?: string;
		status?: string;
	} | null;
	// Signal event fields (from jat-signal)
	signalType?: string;
	suggestedTasks?: SuggestedTask[];
	action?: HumanAction;
	// Rich signal payload (from jat-signal state commands: working, review, needs_input, completing)
	signalPayload?: RichSignalPayload;
	// Completion bundle fields (from jat-signal complete)
	completionBundle?: CompletionBundle;
	// Delta update fields (bandwidth optimization)
	isDelta?: boolean;          // true = output contains only new lines to append
	deltaLineCount?: number;    // Number of new lines in delta
	cursorPosition?: number;    // Server's current cursor position
	// Connection info
	deltaUpdatesEnabled?: boolean; // Server capability flag
}

// Store for reactive updates - components can subscribe to this
export const lastSessionEvent = writable<SessionEvent | null>(null);

// SSE connection state
export const sessionEventsConnected = writable(false);

// ============================================================================
// SSE Connection
// ============================================================================

let eventSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000;

/**
 * Handle session-output event: update terminal output for a session
 *
 * Supports two modes:
 * 1. Full buffer (isDelta: false) - Replace entire output
 * 2. Delta update (isDelta: true) - Append new lines to existing output
 *
 * PERFORMANCE: Uses in-place mutation to trigger fine-grained reactivity.
 * Creating new arrays with .map() triggers ALL SessionCard's $derived computations.
 * In-place mutation only triggers reactivity for the specific session that changed.
 *
 * AUTOMATION: Passes output through automationEngine for pattern matching
 */
function handleSessionOutput(data: SessionEvent): void {
	const { sessionName, output, lineCount, isDelta, agentName } = data;
	if (!sessionName || output === undefined) return;

	let sessionIndex = workSessionsState.sessions.findIndex(s => s.sessionName === sessionName);

	// Create session on-the-fly if it doesn't exist
	// This ensures automation works for sessions that were running before SSE connected
	if (sessionIndex === -1) {
		const newSession: WorkSession = {
			sessionName,
			agentName: agentName || sessionName.replace(/^jat-/, ''),
			task: null,
			lastCompletedTask: null,
			output: '',
			lineCount: 0,
			tokens: 0,
			cost: 0,
			created: new Date().toISOString(),
			attached: false
		};
		workSessionsState.sessions = [...workSessionsState.sessions, newSession];
		sessionIndex = workSessionsState.sessions.length - 1;
		console.log(`[SessionEvents] Auto-created session for automation: ${sessionName}`);
	}

	const currentSession = workSessionsState.sessions[sessionIndex];
	let newOutput: string;

	// Handle delta update: append new lines to existing buffer
	if (isDelta) {
		const currentOutput = currentSession.output || '';
		// Append delta to existing output
		// If current output is empty, just use the delta
		// Otherwise, add newline separator and delta
		newOutput = currentOutput ? `${currentOutput}\n${output}` : output;

		// Check if output actually changed before triggering re-render
		if (currentSession.output === newOutput) {
			return; // No change, skip update
		}

		// PERFORMANCE: Mutate in-place for fine-grained reactivity (Svelte 5 $state)
		workSessionsState.sessions[sessionIndex].output = newOutput;
		if (lineCount !== undefined) {
			workSessionsState.sessions[sessionIndex].lineCount = lineCount;
		}

		// AUTOMATION: Process delta output for pattern matching
		// Use the delta (new lines) for matching, not the full buffer
		processSessionOutput(
			sessionName,
			output,
			agentName || currentSession.agentName
		).catch(err => {
			console.error('[SessionEvents] Automation engine error:', err);
		});

		return;
	}

	// Full buffer update: replace entire output
	// PERFORMANCE: Check if output actually changed before triggering re-render
	if (currentSession.output === output && currentSession.lineCount === (lineCount ?? currentSession.lineCount)) {
		return; // No change, skip update
	}

	// Detect new content for automation by comparing to previous output
	const previousOutput = currentSession.output || '';
	const hasNewContent = output.length > previousOutput.length;

	// PERFORMANCE: Mutate in-place for fine-grained reactivity (Svelte 5 $state)
	// This only triggers reactivity for components that depend on THIS session
	workSessionsState.sessions[sessionIndex].output = output;
	if (lineCount !== undefined) {
		workSessionsState.sessions[sessionIndex].lineCount = lineCount;
	}

	// AUTOMATION: Process new output for pattern matching
	// Only process if there's actually new content (not just a refresh)
	if (hasNewContent) {
		// Extract the new content (difference between new and old)
		const newContent = output.substring(previousOutput.length);
		if (newContent.trim()) {
			processSessionOutput(
				sessionName,
				newContent,
				agentName || currentSession.agentName
			).catch(err => {
				console.error('[SessionEvents] Automation engine error:', err);
			});
		}
	}
}

/**
 * Handle session-state event: update session state
 * Updates the workSessions store with the new state for real-time UI updates
 *
 * PERFORMANCE: Uses in-place mutation for fine-grained reactivity.
 */
function handleSessionState(data: SessionEvent): void {
	const { sessionName, state, signalPayload } = data;
	if (!sessionName || !state) return;

	// Special handling for auto_proceed - spawn next task
	if (state === 'auto_proceed') {
		handleAutoProceed(data);
		return;
	}

	// Update the session state in workSessions store
	const sessionIndex = workSessionsState.sessions.findIndex(s => s.sessionName === sessionName);
	if (sessionIndex === -1) {
		// Session not in state yet - might be new, will be added by session-created
		return;
	}

	// PERFORMANCE: Check if state actually changed before triggering re-render
	const currentSession = workSessionsState.sessions[sessionIndex];
	if (currentSession._sseState === state && !signalPayload) {
		return; // No change, skip update
	}

	// PERFORMANCE: Mutate in-place for fine-grained reactivity (Svelte 5 $state)
	workSessionsState.sessions[sessionIndex]._sseState = state;
	workSessionsState.sessions[sessionIndex]._sseStateTimestamp = data.timestamp;

	// Store the rich signal payload if present (for rendering signal cards)
	if (signalPayload) {
		workSessionsState.sessions[sessionIndex]._richSignalPayload = signalPayload;
		workSessionsState.sessions[sessionIndex]._richSignalPayloadTimestamp = data.timestamp;
	}
}

/**
 * Handle session-question event: update question data for a session
 * Note: Question data is polled separately, this just notifies that new data is available
 */
function handleSessionQuestion(_data: SessionEvent): void {
	// Question data is polled separately via /api/work/{sessionId}/question
	// This event notifies components that new question data is available
	// Components subscribed to lastSessionEvent can refetch if needed
}

/**
 * Handle session-signal event: update suggested tasks or actions from jat-signal
 * These are real-time signals from agents via the signal system
 *
 * Signal types:
 * - 'tasks': Suggested task list from agent
 * - 'action': Human action message from agent
 *
 * PERFORMANCE: Uses in-place mutation for fine-grained reactivity.
 */
function handleSessionSignal(data: SessionEvent): void {
	const { sessionName, signalType, suggestedTasks, action } = data;
	if (!sessionName) return;

	const sessionIndex = workSessionsState.sessions.findIndex(s => s.sessionName === sessionName);
	if (sessionIndex === -1) {
		return;
	}

	// Handle tasks signal type
	if (signalType === 'tasks') {
		// PERFORMANCE: Mutate in-place for fine-grained reactivity (Svelte 5 $state)
		workSessionsState.sessions[sessionIndex]._signalSuggestedTasks = suggestedTasks || [];
		workSessionsState.sessions[sessionIndex]._signalSuggestedTasksTimestamp = data.timestamp;
	}

	// Handle action signal type
	if (signalType === 'action' && action) {
		// Store the action for display in SessionCard
		workSessionsState.sessions[sessionIndex]._signalAction = action;
		workSessionsState.sessions[sessionIndex]._signalActionTimestamp = data.timestamp;
	}
}

/**
 * Handle session-complete event: update session with full completion bundle
 * This event contains the structured completion data from jat-signal complete
 *
 * PERFORMANCE: Uses in-place mutation for fine-grained reactivity.
 */
function handleSessionComplete(data: SessionEvent): void {
	const { sessionName, completionBundle } = data;
	if (!sessionName || !completionBundle) return;

	console.log('[SessionEvents] handleSessionComplete called:', sessionName);
	console.log('[SessionEvents] Available sessions:', workSessionsState.sessions.map(s => s.sessionName));

	const sessionIndex = workSessionsState.sessions.findIndex(s => s.sessionName === sessionName);
	if (sessionIndex === -1) {
		console.log('[SessionEvents] Session not found:', sessionName);
		return;
	}
	console.log('[SessionEvents] Found session at index:', sessionIndex);

	// Store the completion bundle for display in SessionCard
	workSessionsState.sessions[sessionIndex]._completionBundle = completionBundle;
	workSessionsState.sessions[sessionIndex]._completionBundleTimestamp = data.timestamp;

	// Also update SSE state to 'completed' if not already
	if (workSessionsState.sessions[sessionIndex]._sseState !== 'completed') {
		workSessionsState.sessions[sessionIndex]._sseState = 'completed';
		workSessionsState.sessions[sessionIndex]._sseStateTimestamp = data.timestamp;
	}

	// Extract suggested tasks to the signal tasks field for consistency
	if (completionBundle.suggestedTasks && completionBundle.suggestedTasks.length > 0) {
		workSessionsState.sessions[sessionIndex]._signalSuggestedTasks = completionBundle.suggestedTasks;
		workSessionsState.sessions[sessionIndex]._signalSuggestedTasksTimestamp = data.timestamp;
	}
}

/**
 * Handle session-created event: add new session to store
 */
function handleSessionCreated(data: SessionEvent): void {
	const { sessionName, agentName, task, timestamp } = data;
	if (!sessionName) return;

	// Check if session already exists
	const exists = workSessionsState.sessions.some(s => s.sessionName === sessionName);
	if (exists) return;

	// Create new session entry
	const newSession: WorkSession = {
		sessionName,
		agentName: agentName || sessionName.replace(/^jat-/, ''),
		task: task || null,
		lastCompletedTask: null,
		output: '',
		lineCount: 0,
		tokens: 0,
		cost: 0,
		created: new Date(timestamp).toISOString(),
		attached: false
	};

	workSessionsState.sessions = [...workSessionsState.sessions, newSession];
}

/**
 * Handle session-destroyed event: remove session from store
 */
function handleSessionDestroyed(data: SessionEvent): void {
	const { sessionName } = data;
	if (!sessionName) return;

	// Clear automation trigger records for this session
	clearSessionTriggers(sessionName);

	workSessionsState.sessions = workSessionsState.sessions.filter(s => s.sessionName !== sessionName);
}

/**
 * Handle auto_proceed signal: spawn next task automatically
 *
 * When an agent emits auto_proceed signal, this handler:
 * 1. Updates session state to show "auto-proceeding"
 * 2. Calls /api/sessions/next to spawn a new session for the next ready task
 * 3. The new session will appear via session-created event
 */
async function handleAutoProceed(data: SessionEvent): Promise<void> {
	const { sessionName, signalPayload } = data;
	if (!sessionName) return;

	const sessionIndex = workSessionsState.sessions.findIndex(s => s.sessionName === sessionName);
	if (sessionIndex === -1) return;

	// Extract task info from signal payload
	const taskId = signalPayload?.taskId || '';
	const nextTaskId = (signalPayload as { nextTaskId?: string })?.nextTaskId;
	const nextTaskTitle = (signalPayload as { nextTaskTitle?: string })?.nextTaskTitle;

	console.log(`[SessionEvents] Auto-proceed: ${sessionName} completed ${taskId}, spawning ${nextTaskId || 'next ready task'}`);

	// Update session state to show auto-proceeding
	workSessionsState.sessions[sessionIndex]._sseState = 'auto-proceeding';
	workSessionsState.sessions[sessionIndex]._sseStateTimestamp = data.timestamp;
	workSessionsState.sessions[sessionIndex]._autoProceedNextTaskId = nextTaskId || undefined;
	workSessionsState.sessions[sessionIndex]._autoProceedNextTaskTitle = nextTaskTitle || undefined;

	// Call the spawn API
	try {
		const response = await fetch('/api/sessions/next', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				completedTaskId: taskId,
				completedSessionName: sessionName,
				nextTaskId
			})
		});

		const result = await response.json();

		if (result.success) {
			console.log(`[SessionEvents] Spawned next session: ${result.sessionName} for task ${result.nextTaskId}`);
			// The new session will appear via session-created SSE event
			// The old session will be removed when tmux session is killed
		} else {
			console.warn(`[SessionEvents] No ready tasks to spawn: ${result.reason}`);
			// Update state to completed instead of auto-proceeding
			workSessionsState.sessions[sessionIndex]._sseState = 'completed';
		}
	} catch (error) {
		console.error('[SessionEvents] Auto-proceed spawn failed:', error);
		// Fall back to completed state on error
		workSessionsState.sessions[sessionIndex]._sseState = 'completed';
	}
}

/**
 * Connect to the session events SSE endpoint for real-time updates
 * Call this once on app mount (in +layout.svelte)
 */
export function connectSessionEvents(): void {
	if (typeof window === 'undefined') return; // SSR guard
	if (eventSource) {
		console.log('[SessionEvents] Already connected, skipping');
		return;
	}

	// Initialize automation rules store (loads rules from localStorage)
	initAutomationStore();

	// Subscribe to automation triggers to update recovering state in workSessions
	const unsubAutomation = onAutomationTrigger((sessionName, rule, match, results) => {
		// Only set recovering state for recovery category rules
		if (rule.category === 'recovery') {
			const sessionIndex = workSessionsState.sessions.findIndex(s => s.sessionName === sessionName);
			if (sessionIndex !== -1) {
				workSessionsState.sessions[sessionIndex]._isRecovering = true;
				workSessionsState.sessions[sessionIndex]._recoveringTimestamp = Date.now();
				workSessionsState.sessions[sessionIndex]._recoveringRuleId = rule.id;

				// Clear recovering state after 5 seconds
				setTimeout(() => {
					const idx = workSessionsState.sessions.findIndex(s => s.sessionName === sessionName);
					if (idx !== -1) {
						workSessionsState.sessions[idx]._isRecovering = false;
					}
				}, 5000);
			}
		}
	});

	console.log('[SessionEvents] Connecting to SSE...');

	try {
		eventSource = new EventSource('/api/sessions/events');

		eventSource.onopen = () => {
			console.log('[SessionEvents] SSE connected!');
			sessionEventsConnected.set(true);
			reconnectAttempts = 0;
		};

		eventSource.onmessage = (event) => {
			try {
				const data: SessionEvent = JSON.parse(event.data);
				const eventType = data.type;

				// Only log significant events (not frequent output/state updates)

				// Handle event based on type
				switch (eventType) {
					case 'connected':
						// Initial connection acknowledgment
						break;
					case 'session-output':
						handleSessionOutput(data);
						break;
					case 'session-state':
						handleSessionState(data);
						break;
					case 'session-question':
						handleSessionQuestion(data);
						break;
					case 'session-signal':
						handleSessionSignal(data);
						break;
					case 'session-complete':
						handleSessionComplete(data);
						break;
					case 'session-created':
						handleSessionCreated(data);
						break;
					case 'session-destroyed':
						handleSessionDestroyed(data);
						break;
				}

				// Broadcast event to any listening components
				lastSessionEvent.set(data);
			} catch (err) {
				console.error('[SessionEvents] Failed to parse session event:', err);
			}
		};

		eventSource.onerror = (err) => {
			console.error('[SessionEvents] SSE error:', err);
			sessionEventsConnected.set(false);

			// Close and attempt reconnect
			if (eventSource) {
				eventSource.close();
				eventSource = null;
			}

			if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
				reconnectAttempts++;
				console.log(
					`[SessionEvents] Reconnecting (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`
				);
				reconnectTimer = setTimeout(() => {
					connectSessionEvents();
				}, RECONNECT_DELAY);
			} else {
				console.error('[SessionEvents] Max reconnect attempts reached');
			}
		};
	} catch (err) {
		console.error('[SessionEvents] Failed to connect to session events:', err);
	}
}

/**
 * Disconnect from session events SSE
 * Call this on app unmount
 */
export function disconnectSessionEvents(): void {
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}

	if (eventSource) {
		eventSource.close();
		eventSource = null;
	}

	sessionEventsConnected.set(false);
	reconnectAttempts = 0;
	console.log('[SessionEvents] Disconnected');
}

/**
 * Check if SSE connection is active
 */
export function isSessionEventsConnected(): boolean {
	return eventSource !== null && eventSource.readyState === EventSource.OPEN;
}

/**
 * Manually trigger reconnection (e.g., after network recovery)
 */
export function reconnectSessionEvents(): void {
	disconnectSessionEvents();
	reconnectAttempts = 0;
	connectSessionEvents();
}

// ============================================================================
// BroadcastChannel for cross-tab communication (existing functionality)
// ============================================================================

let channel: BroadcastChannel | null = null;

/**
 * Initialize the broadcast channel (call once on app mount)
 */
export function initSessionEvents() {
	if (typeof window === 'undefined') return; // SSR guard

	if (!channel) {
		channel = new BroadcastChannel('jat-session-events');

		// Listen for events from other tabs/pages
		channel.onmessage = (event: MessageEvent<SessionEvent>) => {
			lastSessionEvent.set(event.data);
		};
	}
}

/**
 * Broadcast a session event to all tabs/pages
 */
export function broadcastSessionEvent(
	type: SessionEventType,
	sessionName: string,
	agentName?: string
) {
	const event: SessionEvent = {
		type,
		sessionName,
		agentName: agentName || sessionName.replace('jat-', ''),
		timestamp: Date.now()
	};

	// Update local store
	lastSessionEvent.set(event);

	// Broadcast to other tabs/pages
	if (channel) {
		channel.postMessage(event);
	}
}

/**
 * Cleanup broadcast channel (call on app unmount)
 */
export function closeSessionEvents() {
	if (channel) {
		channel.close();
		channel = null;
	}
}
