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
	import WorkDropZone from './WorkDropZone.svelte';

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
		onSendInput?: (sessionName: string, input: string, type: 'text' | 'key') => Promise<void>;
		onTaskClick?: (taskId: string) => void;
		class?: string;
	}

	let {
		workSessions = [],
		onSpawnForTask,
		onKillSession,
		onInterrupt,
		onContinue,
		onSendInput,
		onTaskClick,
		class: className = ''
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

	// Track if any session is spawning (disable drop zone during spawn)
	let isSpawning = $state(false);

	// Wrap onSpawnForTask to track spawning state
	async function handleSpawnForTask(taskId: string) {
		if (!onSpawnForTask) return;
		isSpawning = true;
		try {
			await onSpawnForTask(taskId);
		} finally {
			isSpawning = false;
		}
	}

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

	function createSendInputHandler(sessionName: string) {
		return async (input: string, type: 'text' | 'key') => {
			if (onSendInput) {
				await onSendInput(sessionName, input, type);
			}
		};
	}
</script>

<div class="flex flex-col h-full {className}">
	{#if sortedSessions.length === 0}
		<!-- Empty State -->
		<div class="flex-1 flex flex-col items-center justify-center p-8">
			<div class="max-w-md w-full">
				<!-- Drop Zone for spawning -->
				<WorkDropZone
					onSpawnForTask={handleSpawnForTask}
					disabled={isSpawning}
					class="mb-6"
				/>

				<!-- Guidance Message -->
				<div class="text-center">
					<h3 class="text-lg font-semibold text-base-content/80 mb-2">
						No Active Work Sessions
					</h3>
					<p class="text-sm text-base-content/60 mb-4">
						Drag a task from the sidebar to start work, or spawn an agent from the task queue.
					</p>
					<div class="flex flex-wrap justify-center gap-2 text-xs text-base-content/50">
						<span class="badge badge-ghost badge-sm">Drag tasks to drop zone</span>
						<span class="badge badge-ghost badge-sm">Auto-spawns agent</span>
						<span class="badge badge-ghost badge-sm">View output in real-time</span>
					</div>
				</div>
			</div>
		</div>
	{:else}
		<!-- WorkCards Grid -->
		<div class="flex-1 overflow-auto p-4">
			<!-- Drop Zone at top for adding more sessions -->
			<WorkDropZone
				onSpawnForTask={handleSpawnForTask}
				disabled={isSpawning}
				class="mb-4 min-h-[80px]"
			/>

			<!-- Horizontal scrolling row (630px per card for full terminal output) -->
			<div class="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-base-300 scrollbar-track-transparent">
				{#each sortedSessions as session (session.sessionName)}
					<div class="flex-shrink-0" style="width: 630px;">
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
						onSendInput={createSendInputHandler(session.sessionName)}
						onTaskClick={onTaskClick}
					/>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
