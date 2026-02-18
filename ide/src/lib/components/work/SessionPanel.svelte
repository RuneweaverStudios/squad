<script lang="ts">
	/**
	 * SessionPanel Component
	 * Responsive grid layout for SessionCard components with empty state.
	 *
	 * Supports both agent work sessions and server sessions via mode prop.
	 *
	 * Features:
	 * - Responsive grid layout for SessionCards
	 * - Configurable sorting (state, priority, created, cost) - agent mode
	 * - Empty state with guidance message
	 * - Passes through event handlers to SessionCards
	 *
	 * Props:
	 * - mode: 'agent' | 'server' (default: 'agent')
	 * - workSessions: Array of active work sessions (agent mode)
	 * - serverSessions: Array of server sessions (server mode)
	 * - onSpawnForTask: Callback when spawning agent for a task
	 * - onKillSession: Callback when killing a session
	 * - onSendInput: Callback when sending input to a session
	 * - onTaskClick: Callback when clicking a task ID
	 */

	import SessionCard from './SessionCard.svelte';
	import { initSort, getSortBy, getSortDir } from '$lib/stores/workSort.svelte.js';
	import { initServerSort, getServerSortBy, getServerSortDir } from '$lib/stores/serverSort.svelte.js';
	import { getActivityHistory } from '$lib/stores/serverSessions.svelte';
	import { onMount } from 'svelte';
	import type { ServerState } from '$lib/config/statusColors';

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

	// Suggested task interface (from squad-signal)
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

	// Human action interface for completion bundle (title required)
	interface CompletionHumanAction {
		title: string;
		description?: string;
		items?: string[];
	}

	// Human action interface for signal events (title optional for backwards compat)
	interface SignalAction {
		action?: string;
		title?: string;
		description?: string;
		message?: string;
		timestamp?: string;
		items?: string[];
	}

	// Quality signals from completed task
	interface QualitySignals {
		tests: 'passing' | 'failing' | 'none' | 'skipped';
		build: 'clean' | 'warnings' | 'errors';
		preExisting?: string;
	}

	// Cross-agent intelligence from completed task
	interface CrossAgentIntel {
		files?: string[];
		patterns?: string[];
		gotchas?: string[];
	}

	// Full completion bundle from squad-signal complete
	interface CompletionBundle {
		taskId: string;
		agentName: string;
		summary: string[];
		quality: QualitySignals;
		humanActions?: CompletionHumanAction[];
		suggestedTasks?: SuggestedTask[];
		crossAgentIntel?: CrossAgentIntel;
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
		/** Real-time state from WS (working, needs-input, ready-for-review, etc.) */
		_sseState?: string;
		/** Timestamp when WS state was last updated */
		_sseStateTimestamp?: number;
		/** Suggested tasks from squad-signal (via WS session-signal event) */
		_signalSuggestedTasks?: SuggestedTask[];
		/** Timestamp when signal suggested tasks were last updated */
		_signalSuggestedTasksTimestamp?: number;
		/** Human action from squad-signal (via WS session-signal event) */
		_signalAction?: SignalAction;
		/** Timestamp when signal action was last updated */
		_signalActionTimestamp?: number;
		/** Completion bundle from squad-signal complete (via WS session-complete event) */
		_completionBundle?: CompletionBundle;
		/** Timestamp when completion bundle was received */
		_completionBundleTimestamp?: number;
		/** Question data from WS (instant, bypasses HTTP polling) */
		_questionData?: {
			active: boolean;
			questions: Array<{
				question: string;
				header: string;
				multiSelect: boolean;
				options: Array<{ label: string; description: string }>;
			}>;
		};
		/** Timestamp when question data was received via WS */
		_questionDataTimestamp?: number;
	}

	// Server session type - aligned with serverSessions.svelte.ts
	interface ServerSession {
		mode: 'server';
		sessionName: string;
		projectName: string;
		displayName: string;
		port: number | null;
		portRunning: boolean;
		status: ServerState;
		output: string;
		lineCount: number;
		created: string;
		attached: boolean;
		projectPath?: string;
		command?: string;
	}

	interface Props {
		/** Mode: 'agent' for work sessions, 'server' for dev server sessions */
		mode?: 'agent' | 'server';
		// Agent mode props
		workSessions?: WorkSession[];
		onSpawnForTask?: (taskId: string) => Promise<void>;
		onTaskClick?: (taskId: string) => void;
		highlightedAgent?: string | null;
		// Server mode props
		serverSessions?: ServerSession[];
		highlightedSession?: string | null;
		onStopServer?: (sessionName: string) => Promise<void>;
		onRestartServer?: (sessionName: string) => Promise<void>;
		onStartServer?: (projectName: string) => Promise<void>;
		// Shared props
		onKillSession?: (sessionName: string) => Promise<void>;
		onInterrupt?: (sessionName: string) => Promise<void>;
		onContinue?: (sessionName: string) => Promise<void>;
		onAttachTerminal?: (sessionName: string) => Promise<void>;
		onSendInput?: (sessionName: string, input: string, type: 'text' | 'key' | 'raw') => Promise<void>;
		class?: string;
	}

	let {
		mode = 'agent',
		// Agent mode
		workSessions = [],
		onSpawnForTask,
		onTaskClick,
		highlightedAgent = null,
		// Server mode
		serverSessions = [],
		highlightedSession = null,
		onStopServer,
		onRestartServer,
		onStartServer,
		// Shared
		onKillSession,
		onInterrupt,
		onContinue,
		onAttachTerminal,
		onSendInput,
		class: className = ''
	}: Props = $props();

	// Derived mode helpers
	const isAgentMode = $derived(mode === 'agent');
	const isServerMode = $derived(mode === 'server');

	// Initialize sort stores on mount
	onMount(() => {
		initSort();
		initServerSort();
	});

	// Get sort state from shared stores
	const sortBy = $derived(getSortBy());
	const sortDir = $derived(getSortDir());
	const serverSortBy = $derived(getServerSortBy());
	const serverSortDir = $derived(getServerSortDir());

	// Determine session state for sorting (mirrors SessionCard sessionState logic exactly)
	// State priority for sorting (lower = more attention needed):
	// 0 = needs-input, 1 = review, 2 = working, 3 = starting, 4 = completed, 5 = idle
	function getSessionState(session: WorkSession): number {
		const output = session.output || '';
		const recentOutput = output.slice(-3000);

		// Helper to find last position of regex patterns (matches SessionCard's findLastPos)
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

		// Find positions using same patterns as SessionCard
		const needsInputPos = findLastPos([
			/\[SQUAD:NEEDS_INPUT\]/,
			/❓\s*NEED CLARIFICATION/,
			// Claude Code's native question UI patterns
			/Enter to select.*Tab\/Arrow keys to navigate.*Esc to cancel/,
			/\[ \].*\n.*\[ \]/,  // Multiple checkbox options
			/Type something\s*\n\s*Next/,  // "Type something" option in questions
		]);
		const workingPos = findLastPos([/\[SQUAD:WORKING\s+task=/]);
		const reviewPos = findLastPos([/\[SQUAD:NEEDS_REVIEW\]/, /\[SQUAD:READY\s+actions=/, /🔍\s*READY FOR REVIEW/]);

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
		const hasCompletionMarker = /\[SQUAD:IDLE\]/.test(recentOutput) || /✅\s*TASK COMPLETE/.test(recentOutput);
		if (session.lastCompletedTask || hasCompletionMarker) {
			return 4; // completed
		}
		return 5; // idle
	}

	// Pre-compute session states ONCE before sorting (avoids expensive regex in every comparison)
	// This is critical for performance - getSessionState runs regex on 3000 chars of output
	const sessionStates = $derived.by(() => {
		const states = new Map<string, number>();
		for (const session of workSessions) {
			states.set(session.sessionName, getSessionState(session));
		}
		return states;
	});

	// Sort sessions based on selected sort option and direction
	const sortedSessions = $derived.by(() => {
		const dir = sortDir === 'asc' ? 1 : -1;
		const states = sessionStates; // Use pre-computed states
		return [...workSessions].sort((a, b) => {
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

	// Server status priority for sorting (lower = more attention needed)
	// Status priority: running=1, starting=2, stopped=3
	function getServerStatusPriority(status: ServerState): number {
		const priorities: Record<ServerState, number> = {
			running: 1,
			starting: 2,
			stopped: 3
		};
		return priorities[status] ?? 999;
	}

	// Sort server sessions based on selected sort option and direction
	const sortedServerSessions = $derived.by(() => {
		const dir = serverSortDir === 'asc' ? 1 : -1;
		return [...serverSessions].sort((a, b) => {
			switch (serverSortBy) {
				case 'status': {
					// Sort by status (asc = running first, desc = stopped first)
					const priorityA = getServerStatusPriority(a.status);
					const priorityB = getServerStatusPriority(b.status);
					if (priorityA !== priorityB) return (priorityA - priorityB) * dir;
					// Secondary: name
					return a.displayName.localeCompare(b.displayName);
				}
				case 'name': {
					// Sort by display name (asc = A-Z, desc = Z-A)
					return a.displayName.localeCompare(b.displayName) * dir;
				}
				case 'port': {
					// Sort by port number (asc = lowest first, desc = highest first)
					const portA = a.port ?? 99999;
					const portB = b.port ?? 99999;
					if (portA !== portB) return (portA - portB) * dir;
					// Secondary: name
					return a.displayName.localeCompare(b.displayName);
				}
				case 'created': {
					// Sort by created time / uptime (asc = oldest first, desc = newest first)
					const createdA = a.created ? new Date(a.created).getTime() : 0;
					const createdB = b.created ? new Date(b.created).getTime() : 0;
					return (createdA - createdB) * dir;
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

	// Server-specific handlers
	function createStopServerHandler(sessionName: string) {
		return async () => {
			if (onStopServer) {
				await onStopServer(sessionName);
			}
		};
	}

	function createRestartServerHandler(sessionName: string) {
		return async () => {
			if (onRestartServer) {
				await onRestartServer(sessionName);
			}
		};
	}

	function createStartServerHandler(projectName: string) {
		return async () => {
			if (onStartServer) {
				await onStartServer(projectName);
			}
		};
	}

	// Get the sessions to display based on mode (using sorted arrays)
	const displaySessions = $derived(isAgentMode ? sortedSessions : sortedServerSessions);

	// Empty state message based on mode
	const emptyMessage = $derived(isAgentMode ? 'No active work sessions' : 'No active server sessions');
</script>

<div class="flex flex-col h-full min-h-0 {className}">
	{#if displaySessions.length === 0}
		<!-- Empty State -->
		<div class="flex-1 flex flex-col items-center justify-center p-8">
			<div class="text-center text-base-content/60">
				<p class="text-sm">{emptyMessage}</p>
			</div>
		</div>
	{:else}
		<!-- SessionCards -->
		<div class="flex-1 min-h-0 px-2">
			<!-- Horizontal scrolling row (720px per card for full terminal output / 80 columns) -->
			<!-- pt-10 reserves space above cards for agent tabs that use negative margin -->
			<!-- min-h-0 is critical for proper flex height calculation -->
			<div class="flex gap-3 overflow-x-auto h-full pt-2 scrollbar-thin scrollbar-thumb-base-300 scrollbar-track-transparent">
				{#if isAgentMode}
					<!-- Agent Mode: Work Sessions -->
					{#each sortedSessions as session (session.sessionName)}
						<!-- Height container - SessionCard controls its own width via cardWidth prop or default 720px -->
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
								startTime={session.created ? new Date(session.created) : null}
								sseState={session._sseState}
								sseStateTimestamp={session._sseStateTimestamp}
								signalSuggestedTasks={session._signalSuggestedTasks}
								signalSuggestedTasksTimestamp={session._signalSuggestedTasksTimestamp}
								completionBundle={session._completionBundle}
								completionBundleTimestamp={session._completionBundleTimestamp}
								sseQuestionData={session._questionData}
								sseQuestionDataTimestamp={session._questionDataTimestamp}
								onKillSession={createKillHandler(session.sessionName)}
								onInterrupt={createInterruptHandler(session.sessionName)}
								onContinue={createContinueHandler(session.sessionName)}
								onAttachTerminal={createAttachTerminalHandler(session.sessionName)}
								onSendInput={createSendInputHandler(session.sessionName)}
								onTaskClick={onTaskClick}
								isHighlighted={highlightedAgent === session.agentName}
							/>
						</div>
					{/each}
				{:else}
					<!-- Server Mode: Server Sessions (sorted) -->
					{#each sortedServerSessions as session (session.sessionName)}
						<div class="h-[calc(100%-8px)]" data-session-name={session.sessionName}>
							<SessionCard
								mode="server"
								sessionName={session.sessionName}
								projectName={session.projectName}
								displayName={session.displayName}
								port={session.port}
								portRunning={session.portRunning}
								serverStatus={session.status}
								projectPath={session.projectPath}
								command={session.command}
								output={session.output}
								lineCount={session.lineCount}
								created={session.created}
								attached={session.attached}
								activityData={getActivityHistory(session.sessionName)}
								onKillSession={createKillHandler(session.sessionName)}
								onAttachTerminal={createAttachTerminalHandler(session.sessionName)}
								onSendInput={createSendInputHandler(session.sessionName)}
								onStopServer={createStopServerHandler(session.sessionName)}
								onRestartServer={createRestartServerHandler(session.sessionName)}
								onStartServer={createStartServerHandler(session.projectName)}
								isHighlighted={highlightedSession === session.sessionName}
							/>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>
