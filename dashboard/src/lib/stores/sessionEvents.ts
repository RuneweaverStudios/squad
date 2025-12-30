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
import { getIsActive as isEpicSwarmActive, getChildren as getEpicChildren, getNextReadyTask as getNextEpicTask } from './epicQueueStore.svelte';
import { getAutoKillDelayForPriority, isAutoKillEnabled, hasPendingAutoKill, clearPendingAutoKill } from './autoKillConfig';
import { addToast } from './toasts.svelte';

// Track scheduled auto-kill timers by session name
// Allows cancellation if user interacts with session before kill occurs
interface ScheduledAutoKill {
	timeout: ReturnType<typeof setTimeout>;
	interval: ReturnType<typeof setInterval>;
}
const scheduledAutoKills = new Map<string, ScheduledAutoKill>();

// Store for auto-kill countdown state (sessionName -> seconds remaining)
export const autoKillCountdowns = writable<Map<string, number>>(new Map());

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

// Human action interface (from jat-signal complete payload's humanActions field)
export interface HumanAction {
	title: string;
	description?: string;
	items?: string[];
	// Alternative field names for flexibility
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
	/** Completion mode from agent - controls auto-kill/auto-spawn behavior */
	completionMode?: 'review_required' | 'auto_proceed';
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

// ============================================================================
// Auto-Kill Functions
// ============================================================================

/**
 * Get the auto-kill delay for a session based on task priority
 * Returns delay in seconds, or null if auto-kill is disabled
 * Now uses the autoKillConfig store for user-configurable settings
 */
function getAutoKillDelay(taskPriority: number | null | undefined): number | null {
	return getAutoKillDelayForPriority(taskPriority);
}

/**
 * Schedule an auto-kill for a completed session
 * Sets up countdown timer and stores timeout ID for potential cancellation
 */
function scheduleAutoKill(sessionName: string, delaySeconds: number): void {
	// Cancel any existing scheduled kill for this session
	cancelAutoKill(sessionName);

	console.log(`[AutoKill] Scheduling kill for ${sessionName} in ${delaySeconds}s`);

	// Update countdown store
	autoKillCountdowns.update(map => {
		map.set(sessionName, delaySeconds);
		return map;
	});

	// Start countdown interval (updates every second)
	let remaining = delaySeconds;
	const countdownInterval = setInterval(() => {
		remaining--;
		autoKillCountdowns.update(map => {
			if (remaining > 0) {
				map.set(sessionName, remaining);
			} else {
				map.delete(sessionName);
			}
			return map;
		});
		if (remaining <= 0) {
			clearInterval(countdownInterval);
		}
	}, 1000);

	// Schedule the actual kill
	const timeoutId = setTimeout(async () => {
		clearInterval(countdownInterval);
		scheduledAutoKills.delete(sessionName);
		autoKillCountdowns.update(map => {
			map.delete(sessionName);
			return map;
		});

		console.log(`[AutoKill] Executing kill for ${sessionName}`);

		try {
			const response = await fetch(`/api/sessions/${encodeURIComponent(sessionName.replace(/^jat-/, ''))}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				console.log(`[AutoKill] Successfully killed ${sessionName}`);
			} else {
				console.warn(`[AutoKill] Failed to kill ${sessionName}: ${response.status}`);
			}
		} catch (error) {
			console.error(`[AutoKill] Error killing ${sessionName}:`, error);
		}
	}, delaySeconds * 1000);

	// Store both the timeout and interval for cancellation
	scheduledAutoKills.set(sessionName, { timeout: timeoutId, interval: countdownInterval });
}

/**
 * Cancel a scheduled auto-kill for a session
 * Called when user interacts with the session (e.g., clicks to view)
 */
export function cancelAutoKill(sessionName: string): void {
	const scheduled = scheduledAutoKills.get(sessionName);
	if (scheduled) {
		clearTimeout(scheduled.timeout);
		clearInterval(scheduled.interval);
		scheduledAutoKills.delete(sessionName);
		autoKillCountdowns.update(map => {
			map.delete(sessionName);
			return map;
		});
		console.log(`[AutoKill] Cancelled scheduled kill for ${sessionName}`);

		// Extract agent name from session name (e.g., "jat-AgentName" -> "AgentName")
		const agentName = sessionName.startsWith('jat-') ? sessionName.slice(4) : sessionName;
		addToast({
			message: `Auto-kill cancelled for ${agentName}`,
			type: 'info',
			duration: 2000 // Brief feedback - 2 seconds
		});
	}
}

/**
 * Check if a session has an auto-kill scheduled
 */
export function hasScheduledAutoKill(sessionName: string): boolean {
	return scheduledAutoKills.has(sessionName);
}

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

	// Auto-proceed: auto_proceed signal type triggers spawn of next task
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
 * Handle session-signal event: reserved for future signal types
 *
 * Note: The 'tasks' and 'action' signal types were removed as they were never
 * actually emitted. Suggested tasks and human actions are now only delivered
 * via the 'complete' signal's embedded suggestedTasks and humanActions fields,
 * which are handled by handleSessionComplete().
 *
 * This handler remains as a placeholder for potential future signal types.
 */
function handleSessionSignal(_data: SessionEvent): void {
	// Currently unused - all signals come via session-complete or session-state
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

	// Clear the rich signal payload only if it's a "completing" type
	// (the signal that shows the announcing progress bar)
	// This allows the CompletedSignalCard to render instead
	const currentPayload = workSessionsState.sessions[sessionIndex]._richSignalPayload;
	if (currentPayload?.type === 'completing') {
		workSessionsState.sessions[sessionIndex]._richSignalPayload = undefined;
		workSessionsState.sessions[sessionIndex]._richSignalPayloadTimestamp = undefined;
	}

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

	// Schedule auto-kill for completed session
	// Three sources determine auto-kill behavior:
	// 1. User clicked "Complete & Kill" button (tracked in pendingAutoKill store) → immediate kill
	// 2. completionMode from signal:
	//    - 'auto_proceed' (Epic Swarm): use priority-based auto-kill
	//    - 'review_required' (one-off task): no auto-kill, wait for user review
	// 3. Priority-based auto-kill (only if completionMode === 'auto_proceed' or not set)
	const session = workSessionsState.sessions[sessionIndex];
	const taskPriority = session.task?.priority ?? null;
	const userWantsKill = hasPendingAutoKill(sessionName);
	const completionMode = completionBundle.completionMode;

	// User intent takes precedence over everything
	let autoKillDelay: number | null;
	if (userWantsKill) {
		// User explicitly wants kill - use immediate or very short delay
		autoKillDelay = 0;
		console.log(`[AutoKill] User intent: ${sessionName} will be killed immediately`);
		// Clear the pending intent
		clearPendingAutoKill(sessionName);
	} else if (completionMode === 'review_required') {
		// Agent signaled review_required - no auto-kill, user must explicitly kill
		autoKillDelay = null;
		console.log(`[AutoKill] completionMode=review_required: ${sessionName} will wait for user action`);
	} else {
		// completionMode is 'auto_proceed' or not set - use priority-based settings
		autoKillDelay = getAutoKillDelay(taskPriority);
	}

	if (autoKillDelay !== null && autoKillDelay > 0) {
		scheduleAutoKill(sessionName, autoKillDelay);
	} else if (autoKillDelay === 0) {
		// Immediate kill (delay of 0)
		console.log(`[AutoKill] Immediate kill for ${sessionName} (delay=0)`);
		fetch(`/api/sessions/${encodeURIComponent(sessionName.replace(/^jat-/, ''))}`, {
			method: 'DELETE'
		}).catch(error => {
			console.error(`[AutoKill] Error killing ${sessionName}:`, error);
		});
	}
	// If autoKillDelay is null, auto-kill is disabled - session persists
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
 * Handle auto-proceed: spawn next task automatically (Epic Swarm scoped)
 *
 * When an agent completes with completionMode='auto_proceed' in their complete signal bundle:
 * 1. Checks if there's an active Epic Swarm
 * 2. Verifies the next task is a child of the active epic
 * 3. Updates session state to show "auto-proceeding"
 * 4. Calls /api/sessions/next to spawn a new session
 *
 * IMPORTANT: Auto-proceed only works within an active Epic Swarm.
 * Without an epic, agents complete normally without auto-spawning.
 *
 * Triggered by: jat-signal complete '{"completionMode":"auto_proceed","nextTaskId":"...","nextTaskTitle":"...",...}'
 */
async function handleAutoProceed(data: SessionEvent): Promise<void> {
	const { sessionName, signalPayload } = data;
	if (!sessionName) return;

	// Check if there's an active epic swarm - auto-proceed is ONLY for epic execution
	if (!isEpicSwarmActive()) {
		console.log(`[SessionEvents] Auto-proceed skipped for ${sessionName} - no active epic swarm`);
		// Update to completed state (no auto-spawn outside of epic)
		const idx = workSessionsState.sessions.findIndex(s => s.sessionName === sessionName);
		if (idx !== -1) {
			workSessionsState.sessions[idx]._sseState = 'completed';
			workSessionsState.sessions[idx]._sseStateTimestamp = data.timestamp;
		}
		return;
	}

	const sessionIndex = workSessionsState.sessions.findIndex(s => s.sessionName === sessionName);
	if (sessionIndex === -1) return;

	// Extract task info from signal payload
	const taskId = signalPayload?.taskId || '';
	let nextTaskId = (signalPayload as { nextTaskId?: string })?.nextTaskId;
	let nextTaskTitle = (signalPayload as { nextTaskTitle?: string })?.nextTaskTitle;

	// If no nextTaskId provided, get next ready task from epic children
	if (!nextTaskId) {
		const nextEpicTask = getNextEpicTask();
		if (nextEpicTask) {
			nextTaskId = nextEpicTask.id;
			nextTaskTitle = nextEpicTask.title;
		}
	}

	// Verify the next task is part of the active epic's children
	const epicChildren = getEpicChildren();
	const isEpicChild = nextTaskId ? epicChildren.some(c => c.id === nextTaskId) : false;

	if (!isEpicChild) {
		console.log(`[SessionEvents] Auto-proceed skipped for ${sessionName} - next task ${nextTaskId || '(none)'} is not an epic child`);
		// Update state to completed instead of auto-proceeding
		workSessionsState.sessions[sessionIndex]._sseState = 'completed';
		workSessionsState.sessions[sessionIndex]._sseStateTimestamp = data.timestamp;
		return;
	}

	console.log(`[SessionEvents] Auto-proceed: ${sessionName} completed ${taskId}, spawning epic child ${nextTaskId}`);

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
			console.log(`[SessionEvents] Spawned next session: ${result.sessionName} for epic task ${result.nextTaskId}`);
			// The new session will appear via session-created SSE event
			// The old session will be removed when tmux session is killed
		} else {
			console.warn(`[SessionEvents] Failed to spawn epic task: ${result.reason}`);
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
