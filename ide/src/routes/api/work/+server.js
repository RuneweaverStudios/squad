/**
 * Work API - List Active Work Sessions
 * GET /api/work - Return all active work sessions with task info, output, and token usage
 *
 * Each WorkSession includes:
 * - sessionName: tmux session name (e.g., "jat-WisePrairie")
 * - agentName: Agent name extracted from session (e.g., "WisePrairie")
 * - task: Current in_progress task for this agent (or null)
 * - lastCompletedTask: Most recently closed task by this agent (for completion state display)
 * - output: Recent terminal output with ANSI codes
 * - lineCount: Number of output lines
 * - tokens: Token usage for today
 * - cost: Cost in USD for today
 * - sparklineData: Array of hourly token usage (last 24h) for sparkline rendering
 *   Format: [{ timestamp: ISO string, tokens: number, cost: number }, ...]
 *
 * Query params:
 * - lines: Number of output lines to capture (default: 50, max: 200)
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync, statSync } from 'fs';
import { getTasks } from '$lib/server/jat-tasks.js';
import { getAgentUsageAsync, getAgentHourlyUsageAsync, getAgentContextPercent } from '$lib/utils/tokenUsage.js';
import { apiCache, cacheKey, CACHE_TTL, singleFlight } from '$lib/server/cache.js';
import { SIGNAL_TTL } from '$lib/config/constants.js';

const execAsync = promisify(exec);

/**
 * Map jat-signal states to SessionCard states
 * Signal uses short names, SessionCard expects hyphenated names
 */
/** @type {Record<string, string>} */
const SIGNAL_STATE_MAP = {
	'working': 'working',
	'review': 'ready-for-review',
	'needs_input': 'needs-input',
	'idle': 'idle',
	'completed': 'completed',  // completionMode: 'auto_proceed' in payload triggers auto-spawn of next task
	'starting': 'starting',
	'compacting': 'compacting',
	'completing': 'completing',
	'polishing': 'polishing',  // Post-completion follow-up tweaks
	'planning': 'planning',    // Interactive planning session
	'paused': 'paused',        // Session paused by IDE auto-pause or user action
};

/**
 * Read signal state from /tmp/jat-signal-tmux-{sessionName}.json
 * Handles both state signals (type: "state") and completion bundles (type: "complete")
 * @param {string} sessionName - tmux session name
 * @returns {string|null} Session state or null if no valid signal
 */
function readSignalState(sessionName) {
	const signalFile = `/tmp/jat-signal-tmux-${sessionName}.json`;

	try {
		if (!existsSync(signalFile)) {
			return null;
		}

		const content = readFileSync(signalFile, 'utf-8');
		/** @type {{ type?: string, state?: string }} */
		const signal = JSON.parse(content);

		// Check file age - use different TTL based on signal type
		// See SIGNAL_TTL in constants.ts for configuration
		const stats = statSync(signalFile);
		const ageMs = Date.now() - stats.mtimeMs;
		const isAgentEmittedWaiting = signal.type === 'state' && signal.state && SIGNAL_TTL.USER_WAITING_STATES.includes(/** @type {typeof SIGNAL_TTL.USER_WAITING_STATES[number]} */ (signal.state));
		// IDE-initiated signals use type directly (e.g., { type: 'planning' }) instead of { type: 'state', state: 'planning' }
		const isIdeInitiatedWaiting = signal.type !== 'state' && signal.type !== 'complete' && SIGNAL_TTL.USER_WAITING_STATES.includes(/** @type {typeof SIGNAL_TTL.USER_WAITING_STATES[number]} */ (signal.type));
		const ttl = signal.type === 'complete' || isAgentEmittedWaiting || isIdeInitiatedWaiting ? SIGNAL_TTL.USER_WAITING_MS : SIGNAL_TTL.TRANSIENT_MS;
		if (ageMs > ttl) {
			return null;
		}

		// Handle state signals (working, review, needs_input, etc.)
		if (signal.type === 'state' && signal.state) {
			const state = signal.state;
			return SIGNAL_STATE_MAP[/** @type {keyof typeof SIGNAL_STATE_MAP} */ (state)] || state;
		}

		// Handle completion bundles - these should show as "completed" state
		if (signal.type === 'complete') {
			return 'completed';
		}

		// Handle IDE-initiated signals with direct type (e.g., { type: 'working', data: {...} })
		// These are written by the IDE for instant UI feedback
		if (signal.type && SIGNAL_STATE_MAP[signal.type]) {
			return SIGNAL_STATE_MAP[signal.type];
		}

		return null;
	} catch {
		return null;
	}
}

// ============================================================================
// Task Cache - getTasks() is expensive (parses 800+ line JSONL on each call)
// Cache for 5 seconds to prevent constant re-parsing during frequent polling
// ============================================================================
/** @type {Task[]} */
let cachedTasks = [];
let taskCacheTimestamp = 0;
const TASK_CACHE_TTL_MS = 5000;

function getCachedTasks() {
	const now = Date.now();
	if (now - taskCacheTimestamp > TASK_CACHE_TTL_MS || cachedTasks.length === 0) {
		try {
			cachedTasks = getTasks({});
			taskCacheTimestamp = now;
		} catch (err) {
			console.error('Failed to fetch tasks:', err);
			// Return stale cache on error
		}
	}
	return cachedTasks;
}

/**
 * @typedef {Object} SparklineDataPoint
 * @property {string} timestamp - ISO timestamp for the hour
 * @property {number} tokens - Token count for this hour
 * @property {number} cost - Cost in USD for this hour
 */

/**
 * @typedef {Object} WorkSession
 * @property {string} sessionName - tmux session name (e.g., "jat-WisePrairie")
 * @property {string} agentName - Agent name (e.g., "WisePrairie")
 * @property {Object|null} task - Current in_progress task
 * @property {Object|null} lastCompletedTask - Most recently closed task by this agent
 * @property {string} output - Terminal output with ANSI codes
 * @property {number} lineCount - Number of output lines
 * @property {number} tokens - Token usage for today
 * @property {number} cost - Cost in USD for today
 * @property {SparklineDataPoint[]} sparklineData - Hourly token usage (last 24h)
 * @property {number|null} contextPercent - Context remaining percentage (0-100)
 * @property {string} created - Session creation timestamp
 * @property {boolean} attached - Whether session is attached
 * @property {string} sessionState - Detected session state (starting, working, needs-input, ready-for-review, completing, completed, idle)
 */

/**
 * @typedef {Object} StateCounts
 * @property {number} needsInput - Agents waiting for user input
 * @property {number} working - Agents actively working
 * @property {number} review - Agents waiting for review
 * @property {number} completed - Agents with completed tasks
 * @property {number} starting - Agents that are starting up
 * @property {number} idle - Agents with no active task
 */

/**
 * @typedef {Object} TaskDep
 * @property {string} id - Dependency task ID
 * @property {string} [status] - Dependency status
 * @property {string} [title] - Dependency title
 * @property {number} [priority] - Dependency priority
 * @property {string} [issue_type] - Dependency type
 */

/**
 * @typedef {Object} Task
 * @property {string} id - Task ID
 * @property {string} [status] - Task status
 * @property {string} [title] - Task title
 * @property {string} [description] - Task description
 * @property {number} [priority] - Task priority (0-4)
 * @property {string} [assignee] - Task assignee
 * @property {string} [issue_type] - Task type
 * @property {string} [closedAt] - When task was closed
 * @property {string} [updated_at] - Last update timestamp
 * @property {TaskDep[]} [depends_on] - Task dependencies
 */

/**
 * Extract context remaining percentage from Claude Code's terminal output
 * Looks for patterns like "Context left until auto-compact: 5%" or status line visual indicator
 * @param {string} output - Terminal output
 * @returns {number|null} Context remaining percentage (0-100) or null if not found
 */
function extractContextPercentFromOutput(output) {
	if (!output) return null;

	// Strip ANSI codes for cleaner matching
	const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '');

	// Look for Claude's "Context left until auto-compact: X%" message
	// This appears in Claude's responses when context is running low
	const autoCompactMatch = cleanOutput.match(/Context left until auto-compact:\s*(\d+)%/i);
	if (autoCompactMatch) {
		return parseInt(autoCompactMatch[1], 10);
	}

	// Look for status line visual indicator using filled/unfilled squares
	// Pattern: ▪▪▪▪▪▪▫▫▫▫ (filled squares = context remaining, unfilled = context used)
	// This appears in the custom JAT statusline
	// We want the LAST (most recent) match since context decreases over time
	const visualMatches = cleanOutput.match(/[▪▫]{5,15}/g);
	if (visualMatches && visualMatches.length > 0) {
		// Use the last match (most recent in output)
		const indicator = visualMatches[visualMatches.length - 1];
		const filled = (indicator.match(/▪/g) || []).length;
		const unfilled = (indicator.match(/▫/g) || []).length;
		const total = filled + unfilled;
		if (total > 0) {
			// filled squares = context remaining, unfilled = context used
			// So 6 filled out of 10 = 60% remaining
			return Math.round((filled / total) * 100);
		}
	}

	// Look for context percentage in Claude Code's status line format
	// Pattern: "Context: X% remaining" or similar
	const contextMatch = cleanOutput.match(/Context:\s*(\d+)%/i);
	if (contextMatch) {
		return parseInt(contextMatch[1], 10);
	}

	// Look for patterns like "X% context" or "context X%"
	const percentMatch = cleanOutput.match(/(\d+)%\s*context|context\s*(\d+)%/i);
	if (percentMatch) {
		return parseInt(percentMatch[1] || percentMatch[2], 10);
	}

	return null;
}

/**
 * Detect session state - prefers signal file over marker parsing
 * @param {string} output - Terminal output
 * @param {Task|null} task - Current task
 * @param {Task|null} lastCompletedTask - Last completed task
 * @param {string} [sessionName] - tmux session name (for signal lookup)
 * @returns {string} Session state
 */
function detectSessionState(output, task, lastCompletedTask, sessionName) {
	// First, try to read state from signal file (authoritative source)
	if (sessionName) {
		const signalState = readSignalState(sessionName);
		if (signalState) {
			return signalState;
		}
	}

	// Fall back to marker parsing for legacy support
	return detectSessionStateFromOutput(output, task, lastCompletedTask, sessionName);
}

/**
 * Detect session state from terminal output (legacy fallback)
 * Uses the same logic as SessionCard.svelte for consistency
 * @param {string} output - Terminal output
 * @param {Task|null} task - Current task
 * @param {Task|null} lastCompletedTask - Last completed task
 * @param {string} [sessionName] - tmux session name (for timeline check)
 * @returns {string} Session state
 */
function detectSessionStateFromOutput(output, task, lastCompletedTask, sessionName) {
	// Strip ANSI escape codes before pattern matching (they can appear mid-marker)
	/** @param {string} str */
	const stripAnsi = (str) => str.replace(/\x1b\[[0-9;]*m/g, '');
	const recentOutput = output ? stripAnsi(output.slice(-3000)) : '';

	// Find LAST position of each marker type (most recent wins)
	const completedPos = recentOutput.lastIndexOf('[JAT:COMPLETED]');
	const idlePos = recentOutput.lastIndexOf('[JAT:IDLE]');
	// Claude Code question UI patterns (more specific than just ⎿ which appears in all tool results)
	const questionUIPatterns = [
		'Enter to select',           // Question selection UI
		'Tab/Arrow keys to navigate', // Navigation hint
		'Type something',            // Free-form input option
		'[ ]',                       // Checkbox option
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

	// If there's an active task, use marker-based detection
	if (task) {
		// Build list of detected states with their positions (excluding idle - handled below)
		const positions = [
			{ state: 'needs-input', pos: needsInputPos },
			{ state: 'ready-for-review', pos: reviewPos },
			{ state: 'completing', pos: completingPos },
			{ state: 'compacting', pos: compactingPos },
			{ state: 'working', pos: workingPos }
		];

		// Sort by position descending (most recent marker wins)
		const sorted = positions.filter(p => p.pos >= 0).sort((a, b) => b.pos - a.pos);

		if (sorted.length > 0) {
			return sorted[0].state;
		}

		// No markers found and no fresh signal - but agent HAS an active task
		// Since the task is in_progress, the agent is working even if signal is stale
		// (Agents may work for extended periods without emitting new signals)
		return 'working';
	}

	// No active task - check if we just completed something
	// This matches SessionCard.svelte logic for consistency
	if (lastCompletedTask) {
		// Check for completion evidence in output
		// [JAT:IDLE] appears AFTER task completion, so it indicates recently completed
		const hasCompletionMarker = completedPos >= 0 || idlePos >= 0 ||
			/✅\s*TASK COMPLETE/.test(recentOutput);
		const hasReviewMarker = reviewPos >= 0;

		if (hasCompletionMarker || hasReviewMarker) {
			return 'completed';
		}

		// If the lastCompletedTask was updated recently (within 2 hours), still show completed
		if (lastCompletedTask.closedAt) {
			const closedDate = new Date(lastCompletedTask.closedAt);
			const now = new Date();
			const hoursSinceClosed = (now.getTime() - closedDate.getTime()) / (1000 * 60 * 60);
			if (hoursSinceClosed < 2) {
				return 'completed';
			}
		}
	}

	// Check if agent just started (no markers, very little output)
	if (recentOutput.length < 500) {
		return 'starting';
	}

	return 'idle';
}

/**
 * Cache key for per-agent usage data
 * @param {string} agentName - Agent name
 * @returns {string} Cache key
 */
function agentUsageCacheKey(agentName) {
	return `work:agent-usage:${agentName}`;
}

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
	try {
		const linesParam = url.searchParams.get('lines');
		// Cap at 200 lines max (down from 500). WebSocket streams real-time output,
		// so HTTP polling only needs enough for state detection + initial display.
		const lines = Math.min(Math.max(parseInt(linesParam || '50', 10) || 50, 1), 200);
		// Only fetch token usage/sparkline if requested (slow operation)
		const includeUsage = url.searchParams.get('usage') === 'true';
		// Force task cache refresh (used after spawn to ensure new task assignments are visible)
		const bustCache = url.searchParams.get('bust') === 'true';

		if (bustCache) {
			// Reset cache timestamp to force refresh
			taskCacheTimestamp = 0;
			apiCache.invalidate('work*');
		}

		const responseCacheKey = cacheKey('work', {
			lines: String(lines),
			usage: includeUsage ? 'true' : undefined
		});

		// Bust cache: skip cached result but still deduplicate concurrent requests
		if (bustCache) {
			apiCache.delete(responseCacheKey);
		}

		// singleFlight: cache + request deduplication in one call.
		// Prevents thundering herd when multiple polls arrive concurrently.
		const responseData = await singleFlight(
			responseCacheKey,
			() => computeWorkData(lines, includeUsage),
			CACHE_TTL.MEDIUM // 5s — SSE handles real-time updates
		);

		return json(responseData);
	} catch (error) {
		console.error('Error in GET /api/work:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}

/**
 * Core computation for work session data.
 * Extracted to enable single-flight deduplication.
 * @param {number} lines
 * @param {boolean} includeUsage
 */
async function computeWorkData(lines, includeUsage) {
	// Step 1: List jat-* tmux sessions
		const sessionsCommand = `tmux list-sessions -F "#{session_name}:#{session_created}:#{session_attached}" 2>/dev/null || echo ""`;

		let sessionsOutput = '';
		try {
			const { stdout } = await execAsync(sessionsCommand);
			sessionsOutput = stdout.trim();
		} catch (err) {
			// No tmux server or no sessions - return empty
			return {
				success: true,
				sessions: [],
				count: 0,
				stateCounts: { needsInput: 0, working: 0, review: 0, completed: 0, starting: 0, idle: 0 },
				timestamp: new Date().toISOString()
			};
		}

		if (!sessionsOutput) {
			return {
				success: true,
				sessions: [],
				count: 0,
				stateCounts: { needsInput: 0, working: 0, review: 0, completed: 0, starting: 0, idle: 0 },
				timestamp: new Date().toISOString()
			};
		}

		// Parse sessions and filter for jat-* prefix (excluding jat-pending-* which are still being set up)
		const rawSessions = sessionsOutput
			.split('\n')
			.filter(line => line.length > 0)
			.map(line => {
				const [name, created, attached] = line.split(':');
				return {
					name,
					created: new Date(parseInt(created, 10) * 1000).toISOString(),
					attached: attached === '1'
				};
			})
			.filter(session => session.name.startsWith('jat-'))
			// Filter out pending sessions (still being set up, not yet renamed to jat-{AgentName})
			.filter(session => !session.name.startsWith('jat-pending-'));

		if (rawSessions.length === 0) {
			return {
				success: true,
				sessions: [],
				count: 0,
				stateCounts: { needsInput: 0, working: 0, review: 0, completed: 0, starting: 0, idle: 0 },
				timestamp: new Date().toISOString()
			};
		}

		// Step 1b: Skip terminal resize - now handled at session creation time
		// (Previously ran tmux resize-window for every session on every request, causing ~200ms overhead)

		// Step 2: Get all tasks from JAT (for lookup) - uses cache to avoid expensive JSONL parsing
		const allTasks = getCachedTasks();

		// Create a map of agent -> in_progress task
		/** @type {Map<string, Task>} */
		const agentTaskMap = new Map();
		allTasks
			.filter((/** @type {Task} */ t) => t.status === 'in_progress' && t.assignee)
			.forEach((/** @type {Task} */ t) => {
				if (t.assignee) {
					agentTaskMap.set(t.assignee, {
						id: t.id,
						title: t.title,
						description: t.description,
						status: t.status,
						priority: t.priority,
						issue_type: t.issue_type,
						depends_on: t.depends_on || [],
						labels: t.labels || [],
						created_at: t.created_at
					});
				}
			});

		// Create a map of agent -> most recently closed task
		// This helps show completion context when agent finishes work
		/** @type {Map<string, Object>} */
		const agentLastCompletedMap = new Map();
		allTasks
			.filter((/** @type {Task} */ t) => t.status === 'closed' && t.assignee)
			// Sort by updated_at descending to get most recent first
			.sort((/** @type {Task} */ a, /** @type {Task} */ b) => {
				const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
				const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
				return dateB - dateA;
			})
			.forEach((/** @type {Task} */ t) => {
				// Only keep the first (most recent) closed task per agent
				if (t.assignee && !agentLastCompletedMap.has(t.assignee)) {
					agentLastCompletedMap.set(t.assignee, {
						id: t.id,
						title: t.title,
						description: t.description,
						status: t.status,
						priority: t.priority,
						issue_type: t.issue_type,
						closedAt: t.updated_at,
						created_at: t.created_at
					});
				}
			});

		// Step 3: Get project path for token usage
		const projectPath = process.cwd().replace('/ide', '');

		// Step 3b: Pre-read signal states for all sessions (cheap sync FS reads).
		// This lets us skip terminal capture for idle/completed sessions, which is
		// the single biggest optimization: with 29 sessions, ~15 may be idle and
		// capturing their terminal output is wasted work.
		/** @type {Map<string, string>} */
		const preSignalStates = new Map();
		/** @type {Set<string>} */
		const activeSessionNames = new Set();

		for (const session of rawSessions) {
			const agentName = session.name.replace(/^jat-/, '');
			const signalState = readSignalState(session.name);
			if (signalState) {
				preSignalStates.set(session.name, signalState);
			}

			// Session is "active" (needs terminal capture) if:
			// 1. It has an in_progress task, OR
			// 2. Its signal state indicates active work (not idle/completed), OR
			// 3. It has no signal AND no task — but was recently completed (has lastCompleted)
			//    → skip capture, it's idle
			// 4. It has no signal AND no task AND no lastCompleted — unknown, capture to detect
			const hasActiveTask = agentTaskMap.has(agentName);
			const hasCompletedRecently = agentLastCompletedMap.has(agentName);

			if (hasActiveTask) {
				// Has in_progress task — definitely active
				activeSessionNames.add(session.name);
			} else if (signalState) {
				// Has signal — check if it's an active state
				if (!['idle', 'completed'].includes(signalState)) {
					activeSessionNames.add(session.name);
				}
			} else if (!hasCompletedRecently) {
				// No task, no signal, no recent completion — unknown state,
				// capture to detect (might be starting up or in an unusual state)
				activeSessionNames.add(session.name);
			}
			// else: no task + no signal + recently completed = idle, skip capture
		}

		// Step 4: Capture terminal output ONLY for active sessions.
		// Idle/completed sessions get empty output — no need to capture their
		// terminal when they're just sitting at a prompt doing nothing.
		// Previously captured ALL sessions (29+), now only active ones (~10-15).
		/** @type {Map<string, { output: string, lineCount: number }>} */
		const captureMap = new Map();

		{
			const sessionsToCap = rawSessions
				.filter(s => activeSessionNames.has(s.name))
				.map(s => s.name);

			if (sessionsToCap.length > 0) {
				// Build a single shell command that captures active sessions with delimiters.
				const DELIM = '___JAT_SESSION_DELIM___';
				const captureScript = sessionsToCap.map(name =>
					`echo '${DELIM}${name}${DELIM}'; tmux capture-pane -p -e -t '${name}' -S -${lines} 2>/dev/null || true`
				).join('; ');

				try {
					const { stdout } = await execAsync(captureScript, {
						maxBuffer: 512 * 1024 * Math.max(sessionsToCap.length, 1)
					});

					// Parse the delimited output into per-session data
					const sections = stdout.split(DELIM);
					// sections format: ['', sessionName1, '\noutput1', sessionName2, '\noutput2', ...]
					for (let i = 1; i < sections.length - 1; i += 2) {
						const name = sections[i];
						const rawOutput = sections[i + 1] || '';
						// Trim leading newline from output (echo adds \n after delimiter line)
						const output = rawOutput.startsWith('\n') ? rawOutput.slice(1) : rawOutput;
						captureMap.set(name, {
							output,
							lineCount: output.split('\n').length
						});
					}
				} catch {
					// If batch capture fails, initialize empty entries
				}
			}

			// Ensure all sessions have entries — active ones that failed get empty,
			// idle/completed ones always get empty (no capture attempted)
			for (const session of rawSessions) {
				if (!captureMap.has(session.name)) {
					captureMap.set(session.name, { output: '', lineCount: 0 });
				}
			}
		}

		// Step 5: Build WorkSession for each tmux session (no more subprocess calls in here)
		/** @type {WorkSession[]} */
		const workSessions = await Promise.all(
			rawSessions.map(async (session) => {
				// Extract agent name from session name (jat-AgentName -> AgentName)
				// The tmux session name is the authoritative source since /jat:start
				// renames the tmux session when registering the agent
				const agentName = session.name.replace(/^jat-/, '');

				// Get task for this agent
				/** @type {Task|null} */
				const task = /** @type {Task|undefined} */ (agentTaskMap.get(agentName)) || null;

				// Get last completed task for this agent (for completion state display)
				/** @type {Task|null} */
				const lastCompletedTask = /** @type {Task|undefined} */ (agentLastCompletedMap.get(agentName)) || null;

				// Use pre-captured output from Step 4
				const captured = captureMap.get(session.name) || { output: '', lineCount: 0 };
				const output = captured.output;
				const lineCount = captured.lineCount;

				// Get token usage for today (only if requested - slow operation)
				let tokens = 0;
				let cost = 0;
				/** @type {SparklineDataPoint[]} */
				let sparklineData = [];
				/** @type {number|null} */
				let contextPercent = null;

				// Always extract context % from Claude's terminal output (fast, most accurate)
				contextPercent = extractContextPercentFromOutput(output);

				if (includeUsage) {
					// Check cache for per-agent usage data (expensive JSONL parsing)
					const usageCacheKey = agentUsageCacheKey(agentName);
					const cachedUsage = apiCache.get(usageCacheKey);

					if (cachedUsage) {
						// Use cached usage data
						tokens = cachedUsage.tokens || 0;
						cost = cachedUsage.cost || 0;
						sparklineData = cachedUsage.sparklineData || [];
						if (contextPercent === null) {
							contextPercent = cachedUsage.contextPercent;
						}
					} else {
						// Fetch fresh usage data (using worker threads to avoid blocking)
						try {
							const usage = await getAgentUsageAsync(agentName, 'today', projectPath);
							tokens = usage.total_tokens || 0;
							cost = usage.cost || 0;
						} catch (err) {
							// No usage data available
						}

						// Get hourly sparkline data (last 24h, using worker threads)
						try {
							sparklineData = await getAgentHourlyUsageAsync(agentName, projectPath);
						} catch (err) {
							// No sparkline data available
						}

						// Fall back to token-based calculation if not found in output
						let fetchedContextPercent = null;
						if (contextPercent === null) {
							try {
								fetchedContextPercent = await getAgentContextPercent(agentName, projectPath);
								contextPercent = fetchedContextPercent;
							} catch (err) {
								// No context data available
							}
						}

						// Cache the usage data for 30 seconds (reduces JSONL parsing)
						apiCache.set(usageCacheKey, {
							tokens,
							cost,
							sparklineData,
							contextPercent: fetchedContextPercent
						}, CACHE_TTL.LONG);
					}
				}

				// Detect session state - for skipped (idle) sessions, use pre-read
				// signal or infer from task data. For active sessions, do full detection.
				let sessionState;
				if (!activeSessionNames.has(session.name)) {
					// Skipped session — use pre-read signal or infer idle/completed
					const preSignal = preSignalStates.get(session.name);
					sessionState = preSignal || (lastCompletedTask ? 'completed' : 'idle');
				} else {
					sessionState = detectSessionState(output, task, lastCompletedTask, session.name);
				}

				return {
					sessionName: session.name,
					agentName,
					task,
					lastCompletedTask,
					output,
					lineCount,
					tokens,
					cost,
					sparklineData,
					contextPercent,
					created: session.created,
					attached: session.attached,
					sessionState
				};
			})
		);

		// Calculate state counts
		/** @type {StateCounts} */
		const stateCounts = {
			needsInput: 0,
			working: 0,
			review: 0,
			completed: 0,
			starting: 0,
			idle: 0
		};

		workSessions.forEach(session => {
			switch (session.sessionState) {
				case 'needs-input':
					stateCounts.needsInput++;
					break;
				case 'working':
				case 'compacting':
					stateCounts.working++;
					break;
				case 'ready-for-review':
					stateCounts.review++;
					break;
				case 'completed':
				case 'completing':
					stateCounts.completed++;
					break;
				case 'starting':
					stateCounts.starting++;
					break;
				case 'idle':
				default:
					stateCounts.idle++;
					break;
			}
		});

		return {
			success: true,
			sessions: workSessions,
			count: workSessions.length,
			stateCounts,
			timestamp: new Date().toISOString()
		};
}
