<script lang="ts">
	/**
	 * WorkPanel Component
	 * Responsive grid layout for WorkCard components with empty state.
	 *
	 * Features:
	 * - Responsive grid layout for WorkCards
	 * - Sort sessions by task priority (P0 first)
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

	// Work session type
	interface Task {
		id: string;
		title: string;
		status: string;
		priority?: number;
		issue_type?: string;
	}

	interface WorkSession {
		sessionName: string;
		agentName: string;
		task?: Task | null;
		output?: string;
		lineCount?: number;
		tokens?: number;
		cost?: number;
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

	// Sort sessions by task priority (P0 first, then P1, etc.)
	// Sessions without tasks go last
	const sortedSessions = $derived.by(() => {
		return [...workSessions].sort((a, b) => {
			// Get priorities (default to high number if no task/priority)
			const priorityA = a.task?.priority ?? 999;
			const priorityB = b.task?.priority ?? 999;

			// Sort by priority ascending (P0 = 0 comes first)
			if (priorityA !== priorityB) {
				return priorityA - priorityB;
			}

			// Secondary sort by task ID for consistency
			const idA = a.task?.id ?? '';
			const idB = b.task?.id ?? '';
			return idA.localeCompare(idB);
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
		<div class="flex-1 overflow-hidden p-4">
			<!-- Horizontal scrolling row (630px per card for full terminal output) -->
			<div class="flex gap-4 overflow-x-auto h-full pb-2 scrollbar-thin scrollbar-thumb-base-300 scrollbar-track-transparent">
				{#each sortedSessions as session (session.sessionName)}
					<div class="flex-shrink-0 h-full" style="width: 630px;">
					<WorkCard
						sessionName={session.sessionName}
						agentName={session.agentName}
						task={session.task}
						output={session.output}
						lineCount={session.lineCount}
						tokens={session.tokens}
						cost={session.cost}
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
