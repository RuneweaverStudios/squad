/**
 * Agent status computation utilities.
 *
 * Consolidates duplicate agent status logic from:
 * - TaskTable.svelte: isAgentWorking() function (lines 14-31)
 * - AgentCard.svelte: agentStatus computed (lines 52-87)
 *
 * Uses thresholds from constants.ts for consistency.
 */

import { AGENT_STATUS_THRESHOLDS } from '$lib/config/constants';
import { getTimeSinceMs } from '$lib/utils/dateFormatters';

/**
 * Agent status type.
 * Order reflects priority: live > working > active > idle > connecting > disconnected > offline
 * - connecting: session exists but very new and no activity yet (still initializing)
 * - disconnected: no session but recent activity (unexpected termination)
 * - offline: no session and no recent activity (expected state)
 */
export type AgentStatus = 'live' | 'working' | 'active' | 'idle' | 'connecting' | 'disconnected' | 'offline';

/**
 * Minimal agent interface for status computation.
 * Matches the shape returned by /api/agents.
 */
export interface AgentStatusInput {
	last_active_ts?: string | null;
	reservation_count?: number;
	in_progress_tasks?: number;
	hasSession?: boolean;
	/** Session creation timestamp (ms since epoch) for "connecting" state detection */
	session_created_ts?: number | null;
}

/**
 * Compute agent status based on session and activity.
 *
 * Priority order:
 * 0a. DISCONNECTED - No session but recent activity <15min (unexpected termination)
 * 0b. OFFLINE - No session and no recent activity (expected state)
 * 1. WORKING - Has active task or file locks (takes priority - agent is engaged)
 * 1.5 CONNECTING - Session exists but very new (<10min) with no activity yet
 * 2. LIVE - Very recent activity (< 1 minute) without active work
 * 3. ACTIVE - Recent activity (< 10 minutes) or has locks within 1 hour
 * 4. IDLE - Within 1 hour but no activity indicators
 * 5. OFFLINE - Over 1 hour or never active
 *
 * @param agent - Agent data with status indicators
 * @returns Agent status string
 *
 * @example
 * const status = computeAgentStatus({
 *   last_active_ts: new Date().toISOString(),
 *   reservation_count: 2,
 *   in_progress_tasks: 1
 * });
 * // → 'working' (has in-progress task)
 */
export function computeAgentStatus(agent: AgentStatusInput): AgentStatus {
	const timeSinceActive = getTimeSinceMs(agent.last_active_ts);

	// Priority 0: No tmux session - determine if disconnected or offline
	// hasSession is undefined for backwards compat; only treat explicit false
	if (agent.hasSession === false) {
		// Disconnected: session gone but was active within 15 min (unexpected)
		if (timeSinceActive < AGENT_STATUS_THRESHOLDS.DISCONNECTED_MS) {
			return 'disconnected';
		}
		// Offline: no session and not recently active (expected)
		return 'offline';
	}

	const hasActiveLocks = (agent.reservation_count || 0) > 0;
	const hasInProgressTask = (agent.in_progress_tasks || 0) > 0;

	// Priority 1: WORKING - Has active task or file locks
	// Agent has work in progress (takes priority over recency)
	if (hasInProgressTask || hasActiveLocks) {
		return 'working';
	}

	// Priority 1.5: CONNECTING - Session exists but still initializing
	// Session was created recently (<10 min) but no meaningful activity yet
	if (agent.session_created_ts && agent.hasSession !== false) {
		const sessionAge = Date.now() - agent.session_created_ts;
		const CONNECTING_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

		// Session is new AND (no activity OR activity is not recent)
		if (sessionAge < CONNECTING_THRESHOLD_MS && timeSinceActive >= AGENT_STATUS_THRESHOLDS.WORKING_MS) {
			return 'connecting';
		}
	}

	// Priority 2: LIVE - Very recent activity (< 1 minute) without active work
	// Agent is truly responsive right now but not actively working
	if (timeSinceActive < AGENT_STATUS_THRESHOLDS.LIVE_MS) {
		return 'live';
	}

	// Priority 3: ACTIVE - Recent activity (< 10 minutes) but no current work
	// OR has locks but not super recent
	if (timeSinceActive < AGENT_STATUS_THRESHOLDS.WORKING_MS) {
		return 'active';
	}
	if (hasActiveLocks && timeSinceActive < AGENT_STATUS_THRESHOLDS.IDLE_MS) {
		return 'active';
	}

	// Priority 4: IDLE - Within 1 hour but not active
	if (timeSinceActive < AGENT_STATUS_THRESHOLDS.IDLE_MS) {
		return 'idle';
	}

	// Priority 5: OFFLINE - Over 1 hour or never active
	return 'offline';
}

/**
 * Check if an agent is actively working (live or working status).
 * Useful for determining if agent can take new tasks.
 *
 * @param agent - Agent data with status indicators
 * @returns true if agent is live or working
 *
 * @example
 * // In TaskTable to show agent availability:
 * const working = isAgentWorking(agent);
 * // → true if agent is currently engaged
 */
export function isAgentWorking(agent: AgentStatusInput): boolean {
	const status = computeAgentStatus(agent);
	return status === 'live' || status === 'working';
}

/**
 * Check if an agent is available for new work (live, working, or active).
 * More permissive than isAgentWorking - includes recently active agents.
 *
 * @param agent - Agent data with status indicators
 * @returns true if agent is available for assignments
 */
export function isAgentAvailable(agent: AgentStatusInput): boolean {
	const status = computeAgentStatus(agent);
	return status === 'live' || status === 'working' || status === 'active';
}

/**
 * Get a human-readable description of the agent status.
 * Useful for tooltips and accessibility.
 *
 * @param status - Agent status string
 * @returns Description of what the status means
 */
export function getAgentStatusDescription(status: AgentStatus): string {
	switch (status) {
		case 'live':
			return 'Agent is responsive and ready (active within 1 minute)';
		case 'working':
			return 'Agent is actively working on tasks or holding file locks';
		case 'active':
			return 'Agent was recently active (within 10 minutes)';
		case 'idle':
			return 'Agent is available but has been quiet (within 1 hour)';
		case 'connecting':
			return 'Agent session is starting up (created within 10 minutes)';
		case 'disconnected':
			return 'Agent session ended unexpectedly (was active within 15 minutes)';
		case 'offline':
			return 'Agent has not been active for over 1 hour';
		default:
			return 'Unknown status';
	}
}
