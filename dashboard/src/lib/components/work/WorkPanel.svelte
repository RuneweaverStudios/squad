<script lang="ts">
	/**
	 * WorkPanel Component
	 * Responsive grid layout for WorkCard components with empty state.
	 *
	 * Features:
	 * - Responsive grid layout for WorkCards
	 * - Configurable sorting (state, priority, created, cost)
	 * - Empty state with guidance message and drop zone
	 * - Passes through event handlers to WorkCards
	 *
	 * Props:
	 * - workSessions: Array of active work sessions
	 * - onSpawnForTask: Callback when spawning agent for a task
	 * - onKillSession: Callback when killing a session
	 * - onSendInput: Callback when sending input to a session
	 * - onTaskClick: Callback when clicking a task ID
	 */

	import WorkCard from './WorkCard.svelte';
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
		created: string;
		attached: boolean;
	}

	interface Props {
		workSessions?: WorkSession[];
		onSpawnForTask?: (taskId: string) => Promise<void>;
		onKillSession?: (sessionName: string) => Promise<void>;
		onInterrupt?: (sessionName: string) => Promise<void>;
		onContinue?: (sessionName: string) => Promise<void>;
		onAttachTerminal?: (sessionName: string) => Promise<void>;
		onSendInput?: (sessionName: string, input: string, type: 'text' | 'key') => Promise<void>;
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

	// Sort sessions based on selected sort option and direction
	const sortedSessions = $derived.by(() => {
		const dir = sortDir === 'asc' ? 1 : -1;
		return [...workSessions].sort((a, b) => {
			switch (sortBy) {
				case 'state': {
					// Sort by state (asc = attention-needed first, desc = idle first)
					const stateA = getSessionState(a);
					const stateB = getSessionState(b);
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
		return async (input: string, type: 'text' | 'key') => {
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
			<!-- Horizontal scrolling row (640px per card for full terminal output) -->
			<!-- pt-10 reserves space above cards for agent tabs that use negative margin -->
			<!-- min-h-0 is critical for proper flex height calculation -->
			<div class="flex gap-4 overflow-x-auto h-full pt-10 pb-2 scrollbar-thin scrollbar-thumb-base-300 scrollbar-track-transparent">
				{#each sortedSessions as session (session.sessionName)}
					<div class="flex-shrink-0" style="width: 640px; height: calc(100% - 8px);">
					<WorkCard
						sessionName={session.sessionName}
						agentName={session.agentName}
						task={session.task}
						lastCompletedTask={session.lastCompletedTask}
						output={session.output}
						lineCount={session.lineCount}
						tokens={session.tokens}
						cost={session.cost}
						sparklineData={session.sparklineData}
						startTime={session.created ? new Date(session.created) : null}
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
			</div>
		</div>
	{/if}
</div>
