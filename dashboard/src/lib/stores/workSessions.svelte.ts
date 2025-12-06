/**
 * Work Sessions Store
 * Manages state for active Claude Code work sessions using Svelte 5 runes.
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
 * - startPolling(intervalMs) - Start auto-refresh
 * - stopPolling() - Stop auto-refresh
 */

import { getTerminalScrollback } from '$lib/stores/preferences.svelte';

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

/**
 * Fetch all active work sessions from the API
 * Uses the terminal scrollback preference for line count
 * @param includeUsage - Whether to include token usage/sparkline data (slow, default: false)
 */
export async function fetch(includeUsage: boolean = false): Promise<void> {
	state.isLoading = true;
	state.error = null;

	try {
		// Use scrollback preference for line count (defaults to 2000 if not initialized)
		const lines = getTerminalScrollback() || 2000;
		let url = `/api/work?lines=${lines}`;
		if (includeUsage) {
			url += '&usage=true';
		}
		const response = await globalThis.fetch(url);
		const data = await response.json();

		if (!response.ok) {
			throw new Error(data.message || data.error || 'Failed to fetch sessions');
		}

		const newSessions: WorkSession[] = data.sessions || [];

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
	} catch (err) {
		state.error = err instanceof Error ? err.message : 'Failed to fetch sessions';
		console.error('workSessions.fetch error:', err);
	} finally {
		state.isLoading = false;
	}
}

/**
 * Fetch usage data for all sessions (lazy load after initial fetch)
 */
export async function fetchUsage(): Promise<void> {
	try {
		const lines = getTerminalScrollback() || 2000;
		const response = await globalThis.fetch(`/api/work?lines=${lines}&usage=true`);
		const data = await response.json();

		if (!response.ok || !data.sessions) return;

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
		console.error('workSessions.fetchUsage error:', err);
	}
}

/**
 * Spawn a new agent for a specific task
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

		// Add the new session to state
		if (data.session) {
			state.sessions = [...state.sessions, data.session];
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
		const response = await globalThis.fetch(`/api/sessions/${sessionName}/input`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ input, type })
		});

		if (!response.ok) {
			const data = await response.json();
			throw new Error(data.message || data.error || 'Failed to send input');
		}

		return true;
	} catch (err) {
		state.error = err instanceof Error ? err.message : 'Failed to send input';
		console.error('workSessions.sendInput error:', err);
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
 */
export function startPolling(intervalMs: number = 500): void {
	stopPolling(); // Clear any existing interval

	// Initial fetch
	fetch();

	// Set up polling
	pollingInterval = setInterval(() => {
		fetch();
	}, intervalMs);
}

/**
 * Stop polling
 */
export function stopPolling(): void {
	if (pollingInterval) {
		clearInterval(pollingInterval);
		pollingInterval = null;
	}
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

// Export state for direct reactive access in components
export { state as workSessionsState };
