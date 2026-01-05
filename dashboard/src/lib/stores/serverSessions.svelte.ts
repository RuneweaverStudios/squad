/**
 * Server Sessions Store
 * Manages state for dev server tmux sessions using Svelte 5 runes.
 *
 * Server sessions are tmux sessions running dev servers (npm run dev, etc.)
 * This store tracks their output, status, and provides control actions.
 *
 * Interface:
 * - sessions: ServerSession[] - Array of active server sessions
 * - isLoading: boolean - Loading state
 * - error: string | null - Error message
 * - fetch(lines) - Fetch all active server sessions
 * - start(projectName) - Start dev server for project
 * - stop(sessionName) - Stop a server session
 * - restart(sessionName) - Restart a server session
 * - sendInput(sessionName, input, type) - Send input to session
 * - startPolling(intervalMs) - Start auto-refresh
 * - stopPolling() - Stop auto-refresh
 */

import type { ServerState } from '$lib/config/statusColors';

/**
 * ServerSession represents an active dev server tmux session
 */
export interface ServerSession {
	/** Mode identifier - always 'server' for server sessions */
	mode: 'server';
	/** Tmux session name (e.g., 'chimaro-dev', 'jat-dev') */
	sessionName: string;
	/** Project name (e.g., 'chimaro', 'jat') */
	projectName: string;
	/** Display name shown in UI (e.g., 'Chimaro Dev Server') */
	displayName: string;
	/** Port the server is running on (e.g., 5173) */
	port: number | null;
	/** Whether the port is actively listening */
	portRunning: boolean;
	/** Server status: 'running' | 'starting' | 'stopped' */
	status: ServerState;
	/** Recent terminal output */
	output: string;
	/** Total line count from session */
	lineCount: number;
	/** Session creation timestamp */
	created: string;
	/** Whether a terminal is attached to this session */
	attached: boolean;
	/** Project directory path */
	projectPath?: string;
	/** Server command being run (e.g., 'npm run dev') */
	command?: string;
}

interface ServerSessionsState {
	sessions: ServerSession[];
	isLoading: boolean;
	error: string | null;
	lastFetch: Date | null;
}

// Reactive state using Svelte 5 runes
let state = $state<ServerSessionsState>({
	sessions: [],
	isLoading: true, // Start true to show skeleton until first fetch completes
	error: null,
	lastFetch: null
});

// Activity history tracking (output changes per poll interval)
// Key: sessionName, Value: array of activity values (0 = no change, 1+ = lines changed)
const MAX_ACTIVITY_HISTORY = 30; // Keep last 30 data points
let activityHistory = $state<Map<string, number[]>>(new Map());
let previousOutputHashes = new Map<string, string>();

// Simple hash function for output comparison
function hashOutput(output: string): string {
	// Use last 2000 chars to detect recent changes
	const sample = output.slice(-2000);
	let hash = 0;
	for (let i = 0; i < sample.length; i++) {
		hash = ((hash << 5) - hash) + sample.charCodeAt(i);
		hash = hash & hash; // Convert to 32-bit int
	}
	return hash.toString(36);
}

// Polling interval reference
let pollingInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Fetch all active server sessions from the API
 * Uses smart merging to avoid unnecessary re-renders when data hasn't changed.
 * @param lines - Number of output lines to capture (default: 50)
 */
export async function fetch(lines: number = 50): Promise<void> {
	// Don't set isLoading on subsequent fetches to avoid flashing
	// Only set it on initial load when there are no sessions
	if (state.sessions.length === 0) {
		state.isLoading = true;
	}
	state.error = null;

	try {
		const response = await globalThis.fetch(`/api/servers?lines=${lines}`);
		const data = await response.json();

		if (!response.ok) {
			throw new Error(data.message || data.error || 'Failed to fetch server sessions');
		}

		const newSessions: ServerSession[] = data.sessions || [];

		// Track activity by detecting output changes
		for (const session of newSessions) {
			const currentHash = hashOutput(session.output || '');
			const prevHash = previousOutputHashes.get(session.sessionName);

			// Activity: 0 = no change, 1 = output changed (could enhance with diff size later)
			const hasActivity = prevHash !== undefined && prevHash !== currentHash;
			const activityValue = hasActivity ? 1 : 0;

			// Update previous hash
			previousOutputHashes.set(session.sessionName, currentHash);

			// Update activity history - create new array for reactivity
			const oldHistory = activityHistory.get(session.sessionName) ?? [];
			const newHistory = [...oldHistory, activityValue].slice(-MAX_ACTIVITY_HISTORY);

			activityHistory.set(session.sessionName, newHistory);
		}

		// Clean up history for sessions that no longer exist
		const activeSessionNames = new Set(newSessions.map((s) => s.sessionName));
		for (const sessionName of activityHistory.keys()) {
			if (!activeSessionNames.has(sessionName)) {
				activityHistory.delete(sessionName);
				previousOutputHashes.delete(sessionName);
			}
		}

		// Trigger reactivity by creating new Map
		activityHistory = new Map(activityHistory);

		// SMART MERGE: Use in-place mutation to avoid re-rendering unchanged components
		// Only replace the array when sessions are added/removed
		const existingSessionMap = new Map(state.sessions.map((s, i) => [s.sessionName, { session: s, index: i }]));
		const newSessionNames = new Set(newSessions.map(s => s.sessionName));

		// Check if we need to add/remove sessions (requires new array)
		const sessionsAdded = newSessions.some(s => !existingSessionMap.has(s.sessionName));
		const sessionsRemoved = state.sessions.some(s => !newSessionNames.has(s.sessionName));

		if (sessionsAdded || sessionsRemoved) {
			// Sessions added or removed - need new array
			state.sessions = newSessions;
		} else {
			// Same sessions - update in-place for fine-grained reactivity
			for (const newSession of newSessions) {
				const existing = existingSessionMap.get(newSession.sessionName);
				if (existing) {
					const idx = existing.index;
					// Only update fields that changed (Svelte 5 $state tracks individual properties)
					if (state.sessions[idx].status !== newSession.status) {
						state.sessions[idx].status = newSession.status;
					}
					if (state.sessions[idx].portRunning !== newSession.portRunning) {
						state.sessions[idx].portRunning = newSession.portRunning;
					}
					if (state.sessions[idx].port !== newSession.port) {
						state.sessions[idx].port = newSession.port;
					}
					if (state.sessions[idx].lineCount !== newSession.lineCount) {
						state.sessions[idx].lineCount = newSession.lineCount;
					}
					if (state.sessions[idx].attached !== newSession.attached) {
						state.sessions[idx].attached = newSession.attached;
					}
					if (state.sessions[idx].output !== newSession.output) {
						state.sessions[idx].output = newSession.output;
					}
					if (state.sessions[idx].created !== newSession.created) {
						state.sessions[idx].created = newSession.created;
					}
				}
			}
		}

		state.lastFetch = new Date();
	} catch (err) {
		state.error = err instanceof Error ? err.message : 'Failed to fetch server sessions';
		console.error('serverSessions.fetch error:', err);
	} finally {
		state.isLoading = false;
	}
}

/**
 * Start a dev server for a project
 * @param projectName - Name of the project to start server for
 * @param command - Optional command to run (default: 'npm run dev')
 */
export async function start(projectName: string, command?: string): Promise<ServerSession | null> {
	try {
		const response = await globalThis.fetch('/api/servers/start', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ projectName, command })
		});

		const data = await response.json();

		if (!response.ok) {
			throw new Error(data.message || data.error || 'Failed to start server');
		}

		// Add the new session to state
		if (data.session) {
			state.sessions = [...state.sessions, data.session];
		}

		return data.session || null;
	} catch (err) {
		state.error = err instanceof Error ? err.message : 'Failed to start server';
		console.error('serverSessions.start error:', err);
		return null;
	}
}

/**
 * Stop a server session
 * @param sessionName - Name of the tmux session to stop
 */
export async function stop(sessionName: string): Promise<boolean> {
	try {
		const response = await globalThis.fetch(`/api/servers/${sessionName}`, {
			method: 'DELETE'
		});

		if (!response.ok) {
			const data = await response.json();
			throw new Error(data.message || data.error || 'Failed to stop server');
		}

		// Remove from state
		state.sessions = state.sessions.filter((s) => s.sessionName !== sessionName);
		return true;
	} catch (err) {
		state.error = err instanceof Error ? err.message : 'Failed to stop server';
		console.error('serverSessions.stop error:', err);
		return false;
	}
}

/**
 * Restart a server session
 * @param sessionName - Name of the tmux session to restart
 */
export async function restart(sessionName: string): Promise<boolean> {
	try {
		const response = await globalThis.fetch(`/api/servers/${sessionName}/restart`, {
			method: 'POST'
		});

		if (!response.ok) {
			const data = await response.json();
			throw new Error(data.message || data.error || 'Failed to restart server');
		}

		// Refresh to get updated state
		await fetch();
		return true;
	} catch (err) {
		state.error = err instanceof Error ? err.message : 'Failed to restart server';
		console.error('serverSessions.restart error:', err);
		return false;
	}
}

/**
 * Send input to a server session
 * @param sessionName - Name of the tmux session
 * @param input - Input text to send
 * @param type - Input type: 'text' (default), 'enter', 'ctrl-c', 'ctrl-d', 'raw'
 */
export async function sendInput(
	sessionName: string,
	input: string,
	type: 'text' | 'enter' | 'ctrl-c' | 'ctrl-d' | 'raw' = 'text'
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
		console.error('serverSessions.sendInput error:', err);
		return false;
	}
}

/**
 * Send Ctrl+C to interrupt/stop a server
 */
export async function interrupt(sessionName: string): Promise<boolean> {
	return sendInput(sessionName, '', 'ctrl-c');
}

/**
 * Start polling for session updates
 * @param intervalMs - Polling interval in milliseconds (default: 2000)
 */
export function startPolling(intervalMs: number = 2000): void {
	stopPolling(); // Clear any existing interval

	// Initial fetch
	fetch();

	// Set up polling - servers don't need as frequent updates as work sessions
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
export function getSession(sessionName: string): ServerSession | undefined {
	return state.sessions.find((s) => s.sessionName === sessionName);
}

/**
 * Get session by project name
 */
export function getSessionByProject(projectName: string): ServerSession | undefined {
	return state.sessions.find((s) => s.projectName === projectName);
}

// Export reactive getters
export function getSessions(): ServerSession[] {
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

/**
 * Get activity history for a session
 * @param sessionName - Name of the session
 * @returns Array of activity values (line deltas per poll)
 */
export function getActivityHistory(sessionName: string): number[] {
	return activityHistory.get(sessionName) ?? [];
}

/**
 * Get activity history map (for reactive access)
 */
export function getActivityHistoryMap(): Map<string, number[]> {
	return activityHistory;
}

// Export state for direct reactive access in components
// Note: activityHistory is not exported directly since it's reassigned; use getActivityHistory() or getActivityHistoryMap() instead
export { state as serverSessionsState };
