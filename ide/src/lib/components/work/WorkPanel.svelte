<script lang="ts">
	/**
	 * WorkPanel Component
	 * Responsive grid layout for SessionCard components with empty state.
	 *
	 * Features:
	 * - Responsive grid layout for agent work cards
	 * - Configurable sorting (state, priority, created, cost)
	 * - Empty state with guidance message and drop zone
	 * - Passes through event handlers to SessionCards
	 *
	 * Props:
	 * - workSessions: Array of active work sessions
	 * - onSpawnForTask: Callback when spawning agent for a task
	 * - onKillSession: Callback when killing a session
	 * - onSendInput: Callback when sending input to a session
	 * - onTaskClick: Callback when clicking a task ID
	 */

	import SessionCard from '$lib/components/work/SessionCard.svelte';
	import { initSort, getSortBy, getSortDir } from '$lib/stores/workSort.svelte.js';
	import { onMount } from 'svelte';

	// Work session type - aligned with workSessions.svelte.ts
	interface Task {
		id: string;
		title?: string;
		status?: string;
		priority?: number;
		issue_type?: string;
		closedAt?: string; // For completed tasks
	}

	interface SparklineDataPoint {
		timestamp: string;
		tokens: number;
		cost: number;
	}

	interface WorkSession {
		sessionName: string;
		agentName: string;
		task: Task | null;
		lastCompletedTask: Task | null;
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
		/** Rich signal payload from SSE (for working, review, needs_input, completing states) */
		_richSignalPayload?: {
			type: string;
			[key: string]: unknown;
		};
		/** Timestamp when rich signal payload was last updated */
		_richSignalPayloadTimestamp?: number;
		/** Question data from SSE (instant, bypasses HTTP polling) */
		_questionData?: {
			active: boolean;
			questions: Array<{
				question: string;
				header: string;
				multiSelect: boolean;
				options: Array<{ label: string; description: string }>;
			}>;
		};
		/** Timestamp when question data was received via SSE */
		_questionDataTimestamp?: number;
	}

	interface Props {
		workSessions?: WorkSession[];
		onSpawnForTask?: (taskId: string) => Promise<void>;
		onKillSession?: (sessionName: string) => Promise<void>;
		onInterrupt?: (sessionName: string) => Promise<void>;
		onContinue?: (sessionName: string) => Promise<void>;
		onAttachTerminal?: (sessionName: string) => Promise<void>;
		onSendInput?: (sessionName: string, input: string, type: 'text' | 'key' | 'raw') => Promise<void>;
		onTaskClick?: (taskId: string) => void;
		class?: string;
		/** Currently highlighted agent name (for scroll-to-agent feature) */
		highlightedAgent?: string | null;
	}

	let {
		workSessions = [],
		onSpawnForTask,
		onKillSession,
		onInterrupt,
		onContinue,
		onAttachTerminal,
		onSendInput,
		onTaskClick,
		class: className = '',
		highlightedAgent = null
	}: Props = $props();

	// Animation duration (matches CSS animation: 0.5s)
	const EXIT_ANIMATION_DURATION = 500;
	const ENTRANCE_ANIMATION_DURATION = 500;

	// Map of session data for sessions that are animating out
	// Key: sessionName, Value: frozen session data + isExiting flag
	let exitingSessionsData = $state<Map<string, WorkSession & { _isExiting: true }>>(new Map());

	// Set of session names that are animating in (new sessions)
	let enteringSessionNames = $state<Set<string>>(new Set());

	// Track previous workSessions to detect removals and additions
	let previousWorkSessions = $state<Map<string, WorkSession>>(new Map());

	// Flag to skip entrance animation on initial mount (only animate truly NEW sessions)
	let hasInitialized = $state(false);

	// Detect removed and added sessions, trigger exit/entrance animations
	// Use $effect.pre() so state updates happen BEFORE DOM render (critical for entrance animation)
	$effect.pre(() => {
		const currentNames = new Set(workSessions.map(s => s.sessionName));
		const previousNames = new Set(previousWorkSessions.keys());

		// Find sessions that were in previous but not in current (removed)
		for (const [name, prevSession] of previousWorkSessions) {
			if (!currentNames.has(name) && !exitingSessionsData.has(name)) {
				// Capture session data and mark as exiting
				const newExiting = new Map(exitingSessionsData);
				newExiting.set(name, { ...prevSession, _isExiting: true as const });
				exitingSessionsData = newExiting;

				// Remove from exiting after animation completes
				setTimeout(() => {
					exitingSessionsData = new Map([...exitingSessionsData].filter(([n]) => n !== name));
				}, EXIT_ANIMATION_DURATION);
			}
		}

		// Session came back while animating out - cancel exit
		for (const name of exitingSessionsData.keys()) {
			if (currentNames.has(name)) {
				exitingSessionsData = new Map([...exitingSessionsData].filter(([n]) => n !== name));
			}
		}

		// Find sessions that are in current but not in previous (new sessions)
		// Skip on initial mount - only animate truly NEW sessions after initial load
		if (hasInitialized) {
			for (const name of currentNames) {
				if (!previousNames.has(name) && !enteringSessionNames.has(name)) {
					// Mark session as entering
					console.log('[WorkPanel] Adding to enteringSessionNames:', name);
					enteringSessionNames = new Set([...enteringSessionNames, name]);

					// Remove from entering after animation completes
					setTimeout(() => {
						console.log('[WorkPanel] Removing from enteringSessionNames:', name);
						enteringSessionNames = new Set([...enteringSessionNames].filter(n => n !== name));
					}, ENTRANCE_ANIMATION_DURATION);
				}
			}
		}

		// Update previous for next comparison
		previousWorkSessions = new Map(workSessions.map(s => [s.sessionName, s]));

		// Mark as initialized after first run
		if (!hasInitialized && workSessions.length > 0) {
			hasInitialized = true;
		}
	});

	// Combined sessions: current sessions + exiting sessions (for display)
	const displaySessions = $derived.by(() => {
		// DEBUG: Log entering session names
		if (enteringSessionNames.size > 0) {
			console.log('[WorkPanel] displaySessions - enteringSessionNames:', [...enteringSessionNames]);
		}

		// Start with current sessions, marking entering ones
		const sessions: (WorkSession & { _isExiting?: true; _isEntering?: true })[] = workSessions.map(s => {
			const isEntering = enteringSessionNames.has(s.sessionName);
			if (isEntering) {
				console.log('[WorkPanel] Marking session as entering:', s.sessionName);
			}
			return {
				...s,
				_isEntering: isEntering ? true as const : undefined
			};
		});

		// Add exiting sessions that aren't in current
		for (const [name, exitingSession] of exitingSessionsData) {
			if (!workSessions.some(s => s.sessionName === name)) {
				sessions.push(exitingSession);
			}
		}

		return sessions;
	});

	// Initialize sort store on mount
	onMount(() => {
		initSort();
	});

	// Get sort state from shared store
	const sortBy = $derived(getSortBy());
	const sortDir = $derived(getSortDir());

	// Determine session state for sorting (mirrors WorkCard sessionState logic exactly)
	// State priority for sorting (lower = more attention needed):
	// 0 = needs-input, 1 = review, 2 = working, 3 = starting, 4 = completed, 5 = idle
	function getSessionState(session: WorkSession): number {
		// Use SSE state if available and recent (within 5 seconds)
		const SSE_STATE_TTL_MS = 5000;
		if (session._sseState && session._sseStateTimestamp && (Date.now() - session._sseStateTimestamp) < SSE_STATE_TTL_MS) {
			const stateMap: Record<string, number> = {
				'needs-input': 0,
				'ready-for-review': 1,
				'completing': 1,  // Same priority as review
				'compacting': 2,  // Same priority as working
				'working': 2,
				'starting': 3,
				'completed': 4,
				'idle': 5
			};
			if (session._sseState in stateMap) {
				return stateMap[session._sseState];
			}
		}

		// Fall back to output parsing
		const output = session.output || '';
		const recentOutput = output.slice(-3000);

		// Helper to find last position of regex patterns (matches WorkCard's findLastPos)
		const findLastPos = (patterns: RegExp[]): number => {
			let maxPos = -1;
			for (const pattern of patterns) {
				const match = recentOutput.match(new RegExp(pattern.source, 'g'));
				if (match) {
					const lastMatch = match[match.length - 1];
					const pos = recentOutput.lastIndexOf(lastMatch);
					if (pos > maxPos) maxPos = pos;
				}
			}
			return maxPos;
		};

		// Find positions using same patterns as WorkCard
		const needsInputPos = findLastPos([
			/\[JAT:NEEDS_INPUT\]/,
			/❓\s*NEED CLARIFICATION/,
			// Claude Code's native question UI patterns
			/Enter to select.*Tab\/Arrow keys to navigate.*Esc to cancel/,
			/\[ \].*\n.*\[ \]/,  // Multiple checkbox options
			/Type something\s*\n\s*Next/,  // "Type something" option in questions
		]);
		const workingPos = findLastPos([/\[JAT:WORKING\s+task=/]);
		const reviewPos = findLastPos([/\[JAT:NEEDS_REVIEW\]/, /\[JAT:READY\s+actions=/, /🔍\s*READY FOR REVIEW/]);

		if (session.task) {
			const positions = [
				{ state: 0, pos: needsInputPos },  // needs-input (most urgent)
				{ state: 1, pos: reviewPos },      // ready-for-review
				{ state: 2, pos: workingPos },     // working
			].filter(p => p.pos >= 0);

			if (positions.length > 0) {
				// Sort by position descending (most recent marker wins)
				positions.sort((a, b) => b.pos - a.pos);
				return positions[0].state;
			}
			// No markers found - agent is starting/initializing
			return 3; // starting
		}

		// No active task - check completed vs idle
		const hasCompletionMarker = /\[JAT:IDLE\]/.test(recentOutput) || /✅\s*TASK COMPLETE/.test(recentOutput);
		if (session.lastCompletedTask || hasCompletionMarker) {
			return 4; // completed
		}
		return 5; // idle
	}

	// Pre-compute session states ONCE before sorting (avoids expensive regex in every comparison)
	// This is critical for performance - getSessionState runs regex on 3000 chars of output
	const sessionStates = $derived.by(() => {
		const states = new Map<string, number>();
		for (const session of displaySessions) {
			states.set(session.sessionName, getSessionState(session));
		}
		return states;
	});

	// Sort sessions based on selected sort option and direction
	// Note: Uses displaySessions which includes exiting sessions for animation
	const sortedSessions = $derived.by(() => {
		const dir = sortDir === 'asc' ? 1 : -1;
		const states = sessionStates; // Use pre-computed states
		return [...displaySessions].sort((a, b) => {
			switch (sortBy) {
				case 'state': {
					// Sort by state (asc = attention-needed first, desc = idle first)
					// Use cached states instead of recomputing for every comparison
					const stateA = states.get(a.sessionName) ?? 5;
					const stateB = states.get(b.sessionName) ?? 5;
					if (stateA !== stateB) return (stateA - stateB) * dir;
					// Secondary: priority (always P0 first)
					const priorityA = a.task?.priority ?? 999;
					const priorityB = b.task?.priority ?? 999;
					return priorityA - priorityB;
				}
				case 'priority': {
					// Sort by priority (asc = P0 first, desc = P4 first)
					const priorityA = a.task?.priority ?? 999;
					const priorityB = b.task?.priority ?? 999;
					if (priorityA !== priorityB) return (priorityA - priorityB) * dir;
					// Secondary: task ID
					return (a.task?.id ?? '').localeCompare(b.task?.id ?? '');
				}
				case 'created': {
					// Sort by created time (asc = oldest first, desc = newest first)
					const createdA = a.created ? new Date(a.created).getTime() : 0;
					const createdB = b.created ? new Date(b.created).getTime() : 0;
					return (createdA - createdB) * dir;
				}
				case 'cost': {
					// Sort by cost (asc = lowest first, desc = highest first)
					const costA = a.cost || 0;
					const costB = b.cost || 0;
					return (costA - costB) * dir;
				}
				default:
					return 0;
			}
		});
	});

	// Create session-specific handlers
	function createKillHandler(sessionName: string) {
		return async () => {
			if (onKillSession) {
				await onKillSession(sessionName);
			}
		};
	}

	function createInterruptHandler(sessionName: string) {
		return async () => {
			if (onInterrupt) {
				await onInterrupt(sessionName);
			}
		};
	}

	function createContinueHandler(sessionName: string) {
		return async () => {
			if (onContinue) {
				await onContinue(sessionName);
			}
		};
	}

	function createAttachTerminalHandler(sessionName: string) {
		return async () => {
			if (onAttachTerminal) {
				await onAttachTerminal(sessionName);
			}
		};
	}

	function createSendInputHandler(sessionName: string) {
		return async (input: string, type: 'text' | 'key' | 'raw') => {
			if (onSendInput) {
				await onSendInput(sessionName, input, type);
			}
		};
	}
</script>

<div class="flex flex-col h-full min-h-0 {className}">
	{#if sortedSessions.length === 0}
		<!-- Empty State -->
		<div class="flex-1 flex flex-col items-center justify-center p-8">
			<div class="text-center text-base-content/60">
				<p class="text-sm">No active work sessions</p>
			</div>
		</div>
	{:else}
		<!-- WorkCards -->
		<div class="flex-1 min-h-0 px-2">
			<!-- Horizontal scrolling row (720px per card for full terminal output / 80 columns) -->
			<!-- pt-10 reserves space above cards for agent tabs that use negative margin -->
			<!-- min-h-0 is critical for proper flex height calculation -->
			<!-- Cards fill available height (h-full) so terminal output area can scroll -->
			<div class="flex gap-4 overflow-x-auto h-full pt-10 pb-2 scrollbar-thin scrollbar-thumb-base-300 scrollbar-track-transparent">
				{#each sortedSessions as session (session.sessionName)}
					<!-- Height container - cards fill available height for scrollable terminal -->
					<div class="h-[calc(100%-8px)]">
						<SessionCard
							mode="agent"
							sessionName={session.sessionName}
							agentName={session.agentName}
							task={session.task}
							lastCompletedTask={session.lastCompletedTask}
							output={session.output}
							lineCount={session.lineCount}
							tokens={session.tokens}
							cost={session.cost}
							sparklineData={session.sparklineData}
							contextPercent={session.contextPercent ?? undefined}
							created={session.created}
							attached={session.attached}
							sseState={session._sseState}
							sseStateTimestamp={session._sseStateTimestamp}
							isRecovering={session._isRecovering}
							signalSuggestedTasks={session._signalSuggestedTasks}
							signalSuggestedTasksTimestamp={session._signalSuggestedTasksTimestamp}
							completionBundle={session._completionBundle}
							completionBundleTimestamp={session._completionBundleTimestamp}
							richSignalPayload={session._richSignalPayload}
							richSignalPayloadTimestamp={session._richSignalPayloadTimestamp}
							sseQuestionData={session._questionData}
							sseQuestionDataTimestamp={session._questionDataTimestamp}
							onKillSession={createKillHandler(session.sessionName)}
							onInterrupt={createInterruptHandler(session.sessionName)}
							onContinue={createContinueHandler(session.sessionName)}
							onAttachTerminal={createAttachTerminalHandler(session.sessionName)}
							onSendInput={createSendInputHandler(session.sessionName)}
							{onTaskClick}
							isHighlighted={highlightedAgent === session.agentName}
							isExiting={session._isExiting === true}
							isEntering={session._isEntering === true}
						/>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
