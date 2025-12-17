/**
 * Work Sessions Store
 * Manages state for active Claude Code work sessions using Svelte 5 runes.
 *
 * ## WebSocket Output Streaming
 * Terminal output is streamed via WebSocket for <50ms latency (replacing 500ms HTTP polling).
 * The server polls tmux sessions every 250ms and broadcasts output changes to subscribers.
 *
 * Interface:
 * - sessions: WorkSession[] - Array of active sessions
 * - isLoading: boolean - Loading state
 * - error: string | null - Error message
 * - fetch(includeUsage) - Fetch all active sessions (uses scrollback preference for lines)
 * - fetchUsage() - Lazy load usage data for all sessions (merges into existing sessions)
 * - spawn(taskId) - Spawn new agent for task
 * - kill(sessionName) - Kill a session
 * - sendInput(sessionName, input) - Send input to session
 * - startPolling(intervalMs, useWebSocket) - Start auto-refresh (WebSocket for output, HTTP for metadata)
 * - stopPolling() - Stop auto-refresh and WebSocket subscription
 * - subscribeToOutputUpdates() - Manually subscribe to WebSocket output channel
 * - unsubscribeFromOutputUpdates() - Manually unsubscribe from WebSocket output channel
 * - isOutputStreamingActive() - Check if WebSocket streaming is active
 */

import { getTerminalScrollback } from '$lib/stores/preferences.svelte';
import { throttledFetch } from '$lib/utils/requestThrottler';
import { subscribe as wsSubscribe, onMessage, isConnected, type WebSocketMessage } from '$lib/stores/websocket.svelte';

/**
 * Sparkline data point for hourly token usage
 */
export interface SparklineDataPoint {
	timestamp: string;
	tokens: number;
	cost: number;
}

/**
 * WorkSession represents an active Claude Code session with task context
 */
export interface WorkSession {
	sessionName: string;
	agentName: string;
	task: {
		id: string;
		title?: string;
		description?: string;
		status?: string;
		priority?: number;
		issue_type?: string;
	} | null;
	/** Most recently closed task by this agent (for completion state display) */
	lastCompletedTask: {
		id: string;
		title?: string;
		description?: string;
		status?: string;
		priority?: number;
		issue_type?: string;
		closedAt?: string;
	} | null;
	output: string;
	lineCount: number;
	tokens: number;
	cost: number;
	sparklineData?: SparklineDataPoint[];
	contextPercent?: number | null;
	created: string;
	attached: boolean;
	/** Real-time state from SSE (working, needs-input, ready-for-review, etc.) */
	_sseState?: string;
	/** Timestamp when SSE state was last updated */
	_sseStateTimestamp?: number;
	/** Whether session is in recovering state (automation rule triggered recovery) */
	_isRecovering?: boolean;
	/** Timestamp when recovering state was set */
	_recoveringTimestamp?: number;
	/** Rule ID that triggered recovery (for display) */
	_recoveringRuleId?: string;
	/** Suggested tasks from jat-signal (via SSE session-signal event) */
	_signalSuggestedTasks?: Array<{
		id?: string;
		type: string;
		title: string;
		description: string;
		priority: number;
		reason?: string;
		project?: string;
		labels?: string;
		depends_on?: string[];
	}>;
	/** Timestamp when signal suggested tasks were last updated */
	_signalSuggestedTasksTimestamp?: number;
	/** Human action from jat-signal (via SSE session-signal event) */
	_signalAction?: {
		action?: string;
		title?: string;
		description?: string;
		message?: string;
		timestamp?: string;
		items?: string[];
	};
	/** Timestamp when signal action was last updated */
	_signalActionTimestamp?: number;
	/** Completion bundle from jat-signal complete (via SSE session-complete event) */
	_completionBundle?: {
		taskId: string;
		agentName: string;
		summary: string[];
		quality: {
			tests: 'passing' | 'failing' | 'none' | 'skipped';
			build: 'clean' | 'warnings' | 'errors';
			preExisting?: string;
		};
		humanActions?: Array<{
			title: string;
			description?: string;
			items?: string[];
		}>;
		suggestedTasks?: Array<{
			id?: string;
			type: string;
			title: string;
			description: string;
			priority: number;
			reason?: string;
			project?: string;
			labels?: string;
			depends_on?: string[];
		}>;
		crossAgentIntel?: {
			files?: string[];
			patterns?: string[];
			gotchas?: string[];
		};
	};
	/** Timestamp when completion bundle was received */
	_completionBundleTimestamp?: number;
	/** Rich signal payload from jat-signal state commands (working, review, needs_input, completing) */
	_richSignalPayload?: {
		type: string;
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
	};
	/** Timestamp when rich signal payload was received */
	_richSignalPayloadTimestamp?: number;
	/** Real-time output activity state (generating/thinking/idle) from monitor script */
	_activityState?: 'generating' | 'thinking' | 'idle';
	/** Timestamp when activity state was last updated */
	_activityStateTimestamp?: number;
}

interface WorkSessionsState {
	sessions: WorkSession[];
	isLoading: boolean;
	error: string | null;
	lastFetch: Date | null;
}

// Reactive state using Svelte 5 runes
let state = $state<WorkSessionsState>({
	sessions: [],
	isLoading: false,
	error: null,
	lastFetch: null
});

// Polling interval reference
let pollingInterval: ReturnType<typeof setInterval> | null = null;

// Track consecutive fetch failures for exponential backoff
let fetchFailureCount = 0;
let fetchBackoffUntil = 0;
const FETCH_MAX_BACKOFF_MS = 60000; // Max 1 minute backoff
const FETCH_BASE_BACKOFF_MS = 2000;  // Start with 2 second backoff

// Abort controller to cancel pending fetch requests
let fetchAbortController: AbortController | null = null;
// Track if a fetch is currently in progress to prevent concurrent calls
let fetchInProgress = false;
// Flag to bust server-side cache on next fetch (set after spawn to ensure fresh task data)
let bustCacheOnNextFetch = false;

/**
 * Fetch all active work sessions from the API
 * Uses the terminal scrollback preference for line count
 * Implements exponential backoff when requests fail to prevent browser overload
 * @param includeUsage - Whether to include token usage/sparkline data (slow, default: false)
 */
export async function fetch(includeUsage: boolean = false): Promise<void> {
	// Wrap entire function in try-catch to ensure no unhandled rejections escape
	try {
		// Check if we're in backoff period
		const now = Date.now();
		if (now < fetchBackoffUntil) {
			// Skip this request - server is overloaded
			return;
		}

		// Skip if a fetch is already in progress - this prevents the abort-rejection
		// issue where aborting a pending request causes an "Uncaught (in promise)" error
		if (fetchInProgress) {
			return;
		}
		fetchInProgress = true;

		const controller = new AbortController();
		fetchAbortController = controller;

		state.isLoading = true;
		state.error = null;
		// Use scrollback preference for line count (defaults to 2000 if not initialized)
		const lines = getTerminalScrollback() || 2000;
		// Add cache-busting parameter to prevent request deduplication in throttler
		// This ensures each poll gets its own request that can be safely aborted
		let url = `/api/work?lines=${lines}&_t=${Date.now()}`;
		if (includeUsage) {
			url += '&usage=true';
		}
		// Add bust param to invalidate server-side task cache (used after spawn)
		if (bustCacheOnNextFetch) {
			url += '&bust=true';
			bustCacheOnNextFetch = false; // Only bust once
		}

		// Use a shorter timeout for polling requests (10s instead of 30s default)
		// Capture controller in closure so we only abort our own request
		const timeoutMs = 10000;
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		// Create the fetch promise and attach a no-op catch handler synchronously
		// This prevents "Uncaught (in promise) DOMException" during HMR/navigation
		// when the abort fires but the promise chain has been garbage collected
		const fetchPromise = throttledFetch(url, { signal: controller.signal });
		fetchPromise.catch(() => {}); // Prevent unhandled rejection

		const response = await fetchPromise;
		clearTimeout(timeoutId);
		const data = await response.json();

		if (!response.ok) {
			throw new Error(data.message || data.error || 'Failed to fetch sessions');
		}

		// Success - reset failure count
		fetchFailureCount = 0;

		const newSessions: WorkSession[] = (data.sessions || []).map((session: WorkSession & { sessionState?: string }) => ({
			...session,
			// Map sessionState from HTTP API to _sseState for SessionCard consumption
			// This ensures completion state from signal files is displayed even without SSE events
			_sseState: session.sessionState || session._sseState,
			_sseStateTimestamp: session.sessionState ? Date.now() : session._sseStateTimestamp
		}));

		// When not including usage data, preserve existing tokens/cost/sparklineData/contextPercent
		// to avoid overwriting data from fetchUsage() with zeros
		if (!includeUsage && state.sessions.length > 0) {
			const existingUsageMap = new Map(
				state.sessions.map(s => [s.sessionName, {
					tokens: s.tokens,
					cost: s.cost,
					sparklineData: s.sparklineData,
					contextPercent: s.contextPercent
				}])
			);

			state.sessions = newSessions.map(session => {
				const existingUsage = existingUsageMap.get(session.sessionName);
				if (existingUsage && (existingUsage.tokens > 0 || existingUsage.sparklineData?.length || existingUsage.contextPercent != null)) {
					return {
						...session,
						tokens: existingUsage.tokens,
						cost: existingUsage.cost,
						sparklineData: existingUsage.sparklineData,
						contextPercent: existingUsage.contextPercent
					};
				}
				return session;
			});
		} else {
			state.sessions = newSessions;
		}

		state.lastFetch = new Date();
	} catch (err: unknown) {
		// Silently ignore aborted requests (they're intentional when a new poll starts)
		// Check all possible abort error types
		if (err instanceof Error) {
			if (err.name === 'AbortError' || err.message?.includes('aborted') || err.message?.includes('abort')) {
				return;
			}
		}
		// DOMException is a separate class from Error
		if (err instanceof DOMException) {
			if (err.name === 'AbortError' || err.message?.includes('aborted') || err.message?.includes('abort')) {
				return;
			}
		}
		// Catch-all for any other abort-like errors (duck typing)
		if (typeof err === 'object' && err !== null && 'name' in err && (err as { name: string }).name === 'AbortError') {
			return;
		}

		// Increment failure count and calculate backoff
		fetchFailureCount++;
		const backoffMs = Math.min(FETCH_BASE_BACKOFF_MS * Math.pow(2, fetchFailureCount - 1), FETCH_MAX_BACKOFF_MS);
		fetchBackoffUntil = Date.now() + backoffMs;

		state.error = err instanceof Error ? err.message : 'Failed to fetch sessions';
		console.error(`workSessions.fetch error (backing off ${backoffMs / 1000}s):`, err);
	} finally {
		state.isLoading = false;
		fetchInProgress = false;
	}
}

// Track consecutive usage fetch failures for exponential backoff
let usageFailureCount = 0;
let usageBackoffUntil = 0;
const MAX_BACKOFF_MS = 120000; // Max 2 minute backoff
const BASE_BACKOFF_MS = 5000;  // Start with 5 second backoff

/**
 * Fetch usage data for all sessions (lazy load after initial fetch)
 * Implements exponential backoff when requests fail to prevent server overload
 */
export async function fetchUsage(): Promise<void> {
	// Check if we're in backoff period
	const now = Date.now();
	if (now < usageBackoffUntil) {
		// Skip this request - server is overloaded
		return;
	}

	try {
		const lines = getTerminalScrollback() || 2000;
		const response = await throttledFetch(`/api/work?lines=${lines}&usage=true`);
		const data = await response.json();

		if (!response.ok || !data.sessions) return;

		// Success - reset failure count
		usageFailureCount = 0;

		// Merge usage data into existing sessions
		type UsageData = { tokens: number; cost: number; sparklineData: SparklineDataPoint[]; contextPercent: number | null };
		const usageMap = new Map<string, UsageData>(
			data.sessions.map((s: WorkSession) => [s.sessionName, { tokens: s.tokens, cost: s.cost, sparklineData: s.sparklineData || [], contextPercent: s.contextPercent ?? null }])
		);

		state.sessions = state.sessions.map(session => {
			const usage = usageMap.get(session.sessionName);
			if (usage) {
				return {
					...session,
					tokens: usage.tokens,
					cost: usage.cost,
					sparklineData: usage.sparklineData,
					contextPercent: usage.contextPercent
				};
			}
			return session;
		});
	} catch (err) {
		// Increment failure count and calculate backoff
		usageFailureCount++;
		const backoffMs = Math.min(BASE_BACKOFF_MS * Math.pow(2, usageFailureCount - 1), MAX_BACKOFF_MS);
		usageBackoffUntil = Date.now() + backoffMs;
		console.error(`workSessions.fetchUsage error (backing off ${backoffMs / 1000}s):`, err);
	}
}

// ============================================================================
// WebSocket Output Streaming
// ============================================================================

let wsOutputUnsubscribe: (() => void) | null = null;

/**
 * Subscribe to WebSocket output updates for real-time terminal streaming
 * This replaces HTTP polling for output, providing <50ms latency
 */
export function subscribeToOutputUpdates(): () => void {
	// Already subscribed?
	if (wsOutputUnsubscribe) {
		return wsOutputUnsubscribe;
	}

	// Subscribe to the output channel
	wsSubscribe(['output']);

	// Handle incoming output messages
	wsOutputUnsubscribe = onMessage('output', (msg: WebSocketMessage) => {
		if (msg.type !== 'output-update') return;

		const sessionName = msg.sessionName as string;
		const output = msg.output as string;
		const lineCount = msg.lineCount as number;

		// Find and update the matching session
		const sessionIndex = state.sessions.findIndex(s => s.sessionName === sessionName);
		if (sessionIndex === -1) {
			// Session not in state yet - might be a new session
			// The next HTTP poll will pick it up with full metadata
			return;
		}

		// PERFORMANCE: Check if output actually changed before triggering re-render
		// Creating a new array causes all SessionCard $derived computations to re-run
		const currentSession = state.sessions[sessionIndex];
		if (currentSession.output === output && currentSession.lineCount === lineCount) {
			return; // No change, skip expensive array update
		}

		// Update the session output in place for reactivity
		state.sessions = state.sessions.map((session, idx) => {
			if (idx === sessionIndex) {
				return {
					...session,
					output,
					lineCount
				};
			}
			return session;
		});
	});

	console.log('[workSessions] Subscribed to WebSocket output updates');
	return wsOutputUnsubscribe;
}

/**
 * Unsubscribe from WebSocket output updates
 */
export function unsubscribeFromOutputUpdates(): void {
	if (wsOutputUnsubscribe) {
		wsOutputUnsubscribe();
		wsOutputUnsubscribe = null;
		console.log('[workSessions] Unsubscribed from WebSocket output updates');
	}
}

/**
 * Check if WebSocket output streaming is active
 */
export function isOutputStreamingActive(): boolean {
	return wsOutputUnsubscribe !== null && isConnected();
}

/**
 * Spawn a new agent for a specific task
 * After spawn, the next fetch() will bust the server-side task cache to ensure
 * the new task assignment is visible immediately.
 */
export async function spawn(taskId: string): Promise<WorkSession | null> {
	try {
		const response = await globalThis.fetch('/api/work/spawn', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ taskId })
		});

		const data = await response.json();

		if (!response.ok) {
			throw new Error(data.message || data.error || 'Failed to spawn agent');
		}

		// Add the new session to state with full task data from spawn response
		if (data.session) {
			state.sessions = [...state.sessions, data.session];
			// Flag to bust cache on next fetch so subsequent polls get fresh task data
			// This handles the race condition where the task was just assigned but
			// the server-side 5-second cache still has stale data
			bustCacheOnNextFetch = true;
		}

		return data.session || null;
	} catch (err) {
		state.error = err instanceof Error ? err.message : 'Failed to spawn agent';
		console.error('workSessions.spawn error:', err);
		return null;
	}
}

/**
 * Kill a tmux session
 */
export async function kill(sessionName: string): Promise<boolean> {
	try {
		const response = await globalThis.fetch(`/api/sessions/${sessionName}`, {
			method: 'DELETE'
		});

		if (!response.ok) {
			const data = await response.json();
			throw new Error(data.message || data.error || 'Failed to kill session');
		}

		// Remove from state
		state.sessions = state.sessions.filter(s => s.sessionName !== sessionName);
		return true;
	} catch (err) {
		state.error = err instanceof Error ? err.message : 'Failed to kill session';
		console.error('workSessions.kill error:', err);
		return false;
	}
}

/**
 * Send input to a session (e.g., "continue", "yes", or arbitrary text)
 * @param type - Input type: 'text' (default), 'enter', 'up', 'down', 'escape', 'ctrl-c', 'ctrl-d', 'ctrl-u', 'tab', 'raw'
 */
export async function sendInput(
	sessionName: string,
	input: string,
	type: 'text' | 'enter' | 'up' | 'down' | 'escape' | 'ctrl-c' | 'ctrl-d' | 'ctrl-u' | 'tab' | 'raw' = 'text'
): Promise<boolean> {
	try {
		// Use a 30-second timeout for input requests
		// This is longer because user actions should complete even if server is slow
		// Uses fetch with keepalive to give it priority over polling requests
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 30000);

		const response = await globalThis.fetch(`/api/sessions/${sessionName}/input`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ input, type }),
			signal: controller.signal,
			keepalive: true // Priority hint for browser
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			const data = await response.json();
			throw new Error(data.message || data.error || 'Failed to send input');
		}

		return true;
	} catch (err) {
		// Handle abort errors specially
		if (err instanceof Error && err.name === 'AbortError') {
			state.error = 'Request timed out - server may be overloaded';
			console.error('workSessions.sendInput timeout:', sessionName);
		} else {
			state.error = err instanceof Error ? err.message : 'Failed to send input';
			console.error('workSessions.sendInput error:', err);
		}
		return false;
	}
}

/**
 * Send Ctrl+C to interrupt a session
 */
export async function interrupt(sessionName: string): Promise<boolean> {
	return sendInput(sessionName, '', 'ctrl-c');
}

/**
 * Send Enter key to accept highlighted option
 */
export async function sendEnter(sessionName: string): Promise<boolean> {
	return sendInput(sessionName, '', 'enter');
}

/**
 * Send Escape key
 */
export async function sendEscape(sessionName: string): Promise<boolean> {
	return sendInput(sessionName, '', 'escape');
}

/**
 * Start polling for session updates
 *
 * With WebSocket streaming enabled (default), this function:
 * - Subscribes to WebSocket 'output' channel for real-time terminal updates (<50ms latency)
 * - Uses HTTP polling only for metadata (tasks, tokens, session list) every 5 seconds
 * - Starts activity polling for shimmer effect (200ms interval)
 *
 * Without WebSocket (fallback), uses HTTP polling at the specified interval.
 *
 * @param intervalMs - Polling interval in ms (default: 5000ms for metadata, min: 2000ms)
 * @param useWebSocket - Whether to use WebSocket for output (default: true)
 */
export function startPolling(intervalMs: number = 5000, useWebSocket: boolean = true): void {
	stopPolling(); // Clear any existing interval

	// Initial fetch to populate sessions
	fetch().catch(() => {}); // Errors handled by backoff, suppress unhandled rejections

	// Subscribe to WebSocket for real-time output streaming
	if (useWebSocket) {
		subscribeToOutputUpdates();
	}

	// Start activity polling for shimmer effect (200ms for responsive updates)
	startActivityPolling(200);

	// Set up polling for metadata (task changes, token usage, new/removed sessions)
	// With WebSocket, we only need occasional HTTP polls for metadata
	// Without WebSocket, this is the only update mechanism
	const safeInterval = Math.max(intervalMs, useWebSocket ? 2000 : 1000);
	pollingInterval = setInterval(() => {
		// Catch errors silently - backoff handles retries, we don't need unhandled rejections
		fetch().catch(() => {});
	}, safeInterval);
}

/**
 * Stop polling and WebSocket subscription
 */
export function stopPolling(): void {
	if (pollingInterval) {
		clearInterval(pollingInterval);
		pollingInterval = null;
	}

	// Also unsubscribe from WebSocket output updates
	unsubscribeFromOutputUpdates();

	// Stop activity polling
	stopActivityPolling();
}

/**
 * Clear error state
 */
export function clearError(): void {
	state.error = null;
}

/**
 * Get a specific session by name
 */
export function getSession(sessionName: string): WorkSession | undefined {
	return state.sessions.find(s => s.sessionName === sessionName);
}

/**
 * Get session by agent name
 */
export function getSessionByAgent(agentName: string): WorkSession | undefined {
	return state.sessions.find(s => s.agentName === agentName);
}

// Export reactive getters
export function getSessions(): WorkSession[] {
	return state.sessions;
}

export function getIsLoading(): boolean {
	return state.isLoading;
}

export function getError(): string | null {
	return state.error;
}

export function getLastFetch(): Date | null {
	return state.lastFetch;
}

// ============================================================================
// Activity State Polling (shimmer effect)
// ============================================================================

let activityPollingInterval: ReturnType<typeof setInterval> | null = null;
const ACTIVITY_STALE_MS = 30000; // Treat activity older than 30s as stale

// Track consecutive activity fetch failures for exponential backoff
let activityFailureCount = 0;
let activityBackoffUntil = 0;
const ACTIVITY_MAX_BACKOFF_MS = 30000; // Max 30 second backoff
const ACTIVITY_BASE_BACKOFF_MS = 1000; // Start with 1 second backoff

/**
 * Fetch activity state for all active sessions and update the store
 * Uses batch endpoint to fetch all activities in one request, solving
 * the ERR_INSUFFICIENT_RESOURCES browser connection limit issue.
 */
export async function fetchActivityStates(): Promise<void> {
	// Get current session names
	const sessions = state.sessions;
	if (sessions.length === 0) return;

	// Check if we're in backoff period
	const now = Date.now();
	if (now < activityBackoffUntil) {
		return;
	}

	try {
		// Build comma-separated list of session names for the batch endpoint
		const sessionNames = sessions.map(s => s.sessionName).join(',');
		const response = await globalThis.fetch(`/api/sessions/activity?sessions=${encodeURIComponent(sessionNames)}`);

		if (!response.ok) {
			throw new Error(`Activity fetch failed: ${response.status}`);
		}

		const data = await response.json();

		// Success - reset failure count
		activityFailureCount = 0;

		if (!data.success || !data.activities) {
			return;
		}

		// Build a map for quick lookup from the batch response
		const activityMap = new Map<string, 'generating' | 'thinking' | 'idle'>();

		for (const [sessionName, activityData] of Object.entries(data.activities)) {
			const activity = activityData as {
				hasActivity: boolean;
				activity: { state: string } | null;
				fileModifiedAt: string | null;
			};

			if (activity.hasActivity && activity.activity?.state) {
				// Check if activity file is stale (not updated in 30s)
				const fileModified = activity.fileModifiedAt ? new Date(activity.fileModifiedAt).getTime() : 0;
				const age = Date.now() - fileModified;
				if (age > ACTIVITY_STALE_MS) {
					activityMap.set(sessionName, 'idle');
				} else {
					activityMap.set(sessionName, activity.activity.state as 'generating' | 'thinking' | 'idle');
				}
			} else {
				activityMap.set(sessionName, 'idle');
			}
		}

		// Update sessions with activity state
		let hasChanges = false;
		const updatedSessions = state.sessions.map((session) => {
			const newState = activityMap.get(session.sessionName) || 'idle';
			if (session._activityState !== newState) {
				hasChanges = true;
				return {
					...session,
					_activityState: newState,
					_activityStateTimestamp: Date.now()
				};
			}
			return session;
		});

		// Only update state if there are actual changes (avoid re-renders)
		if (hasChanges) {
			state.sessions = updatedSessions;
		}
	} catch (err) {
		// Increment failure count and calculate backoff
		activityFailureCount++;
		const backoffMs = Math.min(ACTIVITY_BASE_BACKOFF_MS * Math.pow(2, activityFailureCount - 1), ACTIVITY_MAX_BACKOFF_MS);
		activityBackoffUntil = Date.now() + backoffMs;

		// Only log on first failure or after long backoff
		if (activityFailureCount === 1 || activityFailureCount % 5 === 0) {
			console.error(`workSessions.fetchActivityStates error (backing off ${backoffMs / 1000}s):`, err);
		}
	}
}

/**
 * Start polling for activity states
 * @param intervalMs - Polling interval in milliseconds (default: 200ms for responsive shimmer)
 */
export function startActivityPolling(intervalMs: number = 200): void {
	stopActivityPolling();

	// Initial fetch
	fetchActivityStates().catch(() => {});

	// Set up polling
	activityPollingInterval = setInterval(() => {
		fetchActivityStates().catch(() => {});
	}, intervalMs);
}

/**
 * Stop polling for activity states
 */
export function stopActivityPolling(): void {
	if (activityPollingInterval) {
		clearInterval(activityPollingInterval);
		activityPollingInterval = null;
	}
}

/**
 * Get the activity state for a specific session
 */
export function getActivityState(sessionName: string): 'generating' | 'thinking' | 'idle' {
	const session = state.sessions.find((s) => s.sessionName === sessionName);
	return session?._activityState || 'idle';
}

/**
 * Get the SSE state for a specific session
 */
export function getSseState(sessionName: string): string | undefined {
	const session = state.sessions.find((s) => s.sessionName === sessionName);
	return session?._sseState;
}

/**
 * Check if a session is actively generating (for shimmer effect)
 */
export function isGenerating(sessionName: string): boolean {
	return getActivityState(sessionName) === 'generating';
}

// Export state for direct reactive access in components
export { state as workSessionsState };
