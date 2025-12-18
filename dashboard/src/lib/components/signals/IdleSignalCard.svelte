<script lang="ts">
	/**
	 * IdleSignalCard Component
	 *
	 * Renders an idle signal showing session summary, suggested next task,
	 * and controls for starting new work.
	 *
	 * @see shared/rich-signals-plan.md for design documentation
	 * @see src/lib/types/richSignals.ts for type definitions
	 */

	import type { IdleSignal } from '$lib/types/richSignals';

	interface AvailableTask {
		id: string;
		title: string;
		priority?: number;
		issue_type?: string;
	}

	interface Props {
		/** The rich idle signal data */
		signal: IdleSignal;
		/** List of available tasks to assign */
		availableTasks?: AvailableTask[];
		/** Callback when task ID is clicked */
		onTaskClick?: (taskId: string) => void;
		/** Callback when suggested task "Start" is clicked */
		onStartSuggested?: () => Promise<void>;
		/** Callback when a task is selected from the dropdown */
		onAssignTask?: (taskId: string) => Promise<void>;
		/** Callback when "/jat:start" is clicked without a specific task */
		onStartIdle?: () => Promise<void>;
		/** Whether an action is being submitted */
		submitting?: boolean;
		/** Whether to show in compact mode (for inline/timeline display) */
		compact?: boolean;
		/** Additional CSS class */
		class?: string;
	}

	let {
		signal,
		availableTasks = [],
		onTaskClick,
		onStartSuggested,
		onAssignTask,
		onStartIdle,
		submitting = false,
		compact = false,
		class: className = ''
	}: Props = $props();

	// UI State
	let showTaskDropdown = $state(false);
	let selectedTaskId = $state<string | null>(null);

	// Format duration from minutes
	function formatDuration(minutes: number): string {
		if (minutes < 60) {
			return `${minutes}m`;
		}
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
	}

	// Format token count
	function formatTokens(tokens: number): string {
		if (tokens >= 1_000_000) {
			return `${(tokens / 1_000_000).toFixed(1)}M`;
		}
		if (tokens >= 1_000) {
			return `${(tokens / 1_000).toFixed(0)}K`;
		}
		return tokens.toString();
	}

	// Handle start suggested task
	async function handleStartSuggested() {
		if (submitting || !onStartSuggested) return;
		await onStartSuggested();
	}

	// Handle assign task from dropdown
	async function handleAssignTask() {
		if (submitting || !onAssignTask || !selectedTaskId) return;
		await onAssignTask(selectedTaskId);
		showTaskDropdown = false;
		selectedTaskId = null;
	}

	// Handle idle start (no specific task)
	async function handleStartIdle() {
		if (submitting || !onStartIdle) return;
		await onStartIdle();
	}

	// Priority badge styling
	function getPriorityBadge(priority?: number) {
		if (priority === 0) return { label: 'P0', color: 'oklch(0.55 0.22 25)' };
		if (priority === 1) return { label: 'P1', color: 'oklch(0.60 0.18 45)' };
		if (priority === 2) return { label: 'P2', color: 'oklch(0.55 0.15 85)' };
		if (priority === 3) return { label: 'P3', color: 'oklch(0.50 0.10 200)' };
		return { label: 'P4', color: 'oklch(0.45 0.08 250)' };
	}
</script>

{#if compact}
	<!-- Compact mode: minimal idle card for timeline/inline display -->
	<div
		class="rounded-lg px-3 py-2 flex items-center gap-3 {className}"
		style="background: linear-gradient(90deg, oklch(0.25 0.05 250 / 0.3) 0%, oklch(0.22 0.03 250 / 0.1) 100%); border: 1px solid oklch(0.40 0.06 250);"
	>
		<!-- Status indicator -->
		<div class="flex-shrink-0">
			<svg class="w-4 h-4" style="color: oklch(0.65 0.08 250);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
		</div>

		<!-- Status info -->
		<div class="flex-1 min-w-0 flex items-center gap-2">
			<span
				class="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold"
				style="background: oklch(0.45 0.08 250); color: oklch(0.98 0.01 250);"
			>
				💤 IDLE
			</span>
			{#if signal.blockedReason}
				<span class="text-xs truncate" style="color: oklch(0.75 0.08 45);">
					{signal.blockedReason}
				</span>
			{:else if signal.readyForWork}
				<span class="text-xs truncate" style="color: oklch(0.80 0.08 145);">
					Ready for work
				</span>
			{/if}
		</div>

		<!-- Start button (if ready) -->
		{#if signal.readyForWork && onStartIdle}
			<button
				type="button"
				onclick={handleStartIdle}
				disabled={submitting}
				class="btn btn-xs gap-1"
				style="background: oklch(0.50 0.15 250); color: oklch(0.98 0.01 250); border: none;"
			>
				{#if submitting}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
					</svg>
				{/if}
				Start
			</button>
		{/if}
	</div>
{:else}
	<!-- Full mode: detailed idle signal card -->
	<!-- Card sizes based on content, parent container handles max-height and scrolling -->
	<!-- overflow-hidden clips any nested content that might overflow -->
	<div
		class="rounded-lg overflow-hidden flex flex-col {className}"
		style="background: linear-gradient(135deg, oklch(0.22 0.04 250) 0%, oklch(0.18 0.03 245) 100%); border: 1px solid oklch(0.40 0.08 250);"
	>
		<!-- Header - flex-shrink-0 ensures it doesn't shrink when body scrolls -->
		<div
			class="px-3 py-2 flex items-center justify-between gap-2 flex-shrink-0"
			style="background: oklch(0.25 0.05 250); border-bottom: 1px solid oklch(0.35 0.06 250);"
		>
			<div class="flex items-center gap-2">
				<!-- Idle indicator -->
				<svg class="w-4 h-4" style="color: oklch(0.65 0.08 250);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>

				<!-- Badge -->
				<span
					class="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold"
					style="background: oklch(0.45 0.08 250); color: oklch(0.98 0.01 250);"
				>
					💤 IDLE
				</span>
			</div>

			<!-- Status badge -->
			{#if signal.readyForWork}
				<span
					class="text-[10px] px-1.5 py-0.5 rounded"
					style="background: oklch(0.25 0.08 145 / 0.3); color: oklch(0.80 0.12 145); border: 1px solid oklch(0.45 0.12 145);"
				>
					Ready
				</span>
			{:else}
				<span
					class="text-[10px] px-1.5 py-0.5 rounded"
					style="background: oklch(0.25 0.08 45 / 0.3); color: oklch(0.80 0.12 45); border: 1px solid oklch(0.45 0.12 45);"
				>
					Blocked
				</span>
			{/if}
		</div>

		<!-- Body -->
		<div class="p-3 flex flex-col gap-3">
			<!-- Blocked Reason -->
			{#if signal.blockedReason}
				<div
					class="flex items-start gap-2 p-2 rounded"
					style="background: oklch(0.25 0.08 45 / 0.2); border: 1px solid oklch(0.45 0.12 45);"
				>
					<svg class="w-4 h-4 flex-shrink-0 mt-0.5" style="color: oklch(0.80 0.15 45);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
					</svg>
					<div class="flex-1 min-w-0">
						<div class="text-[10px] font-bold mb-0.5" style="color: oklch(0.85 0.12 45);">BLOCKED</div>
						<div class="text-xs" style="color: oklch(0.90 0.08 45);">
							{signal.blockedReason}
						</div>
					</div>
				</div>
			{/if}

			<!-- Session Summary -->
			{#if signal.sessionSummary}
				<div class="flex flex-col gap-1.5">
					<div class="text-[10px] font-semibold opacity-70" style="color: oklch(0.75 0.05 250);">
						📊 SESSION SUMMARY
					</div>
					<div class="grid grid-cols-2 gap-2">
						<!-- Tasks Completed -->
						<div
							class="px-2 py-1.5 rounded"
							style="background: oklch(0.20 0.03 250); border: 1px solid oklch(0.30 0.04 250);"
						>
							<div class="text-[10px] opacity-60" style="color: oklch(0.70 0.03 250);">Tasks</div>
							<div class="text-sm font-bold" style="color: oklch(0.90 0.08 145);">
								{signal.sessionSummary.tasksCompleted.length}
							</div>
						</div>
						<!-- Duration -->
						<div
							class="px-2 py-1.5 rounded"
							style="background: oklch(0.20 0.03 250); border: 1px solid oklch(0.30 0.04 250);"
						>
							<div class="text-[10px] opacity-60" style="color: oklch(0.70 0.03 250);">Duration</div>
							<div class="text-sm font-bold" style="color: oklch(0.90 0.05 250);">
								{formatDuration(signal.sessionSummary.totalDuration)}
							</div>
						</div>
						<!-- Tokens Used -->
						<div
							class="px-2 py-1.5 rounded"
							style="background: oklch(0.20 0.03 250); border: 1px solid oklch(0.30 0.04 250);"
						>
							<div class="text-[10px] opacity-60" style="color: oklch(0.70 0.03 250);">Tokens</div>
							<div class="text-sm font-bold" style="color: oklch(0.90 0.05 250);">
								{formatTokens(signal.sessionSummary.tokensUsed)}
							</div>
						</div>
						<!-- Files Modified -->
						<div
							class="px-2 py-1.5 rounded"
							style="background: oklch(0.20 0.03 250); border: 1px solid oklch(0.30 0.04 250);"
						>
							<div class="text-[10px] opacity-60" style="color: oklch(0.70 0.03 250);">Files</div>
							<div class="text-sm font-bold" style="color: oklch(0.90 0.05 250);">
								{signal.sessionSummary.filesModified}
							</div>
						</div>
					</div>
					<!-- Completed Task IDs -->
					{#if signal.sessionSummary.tasksCompleted.length > 0}
						<div class="flex flex-wrap gap-1 mt-1">
							{#each signal.sessionSummary.tasksCompleted as taskId}
								<button
									type="button"
									onclick={() => onTaskClick?.(taskId)}
									class="text-[10px] px-1.5 py-0.5 rounded font-mono hover:opacity-80 transition-opacity cursor-pointer"
									style="background: oklch(0.28 0.08 145); color: oklch(0.85 0.10 145); border: 1px solid oklch(0.40 0.10 145);"
									title="View completed task {taskId}"
								>
									✓ {taskId}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Suggested Next Task -->
			{#if signal.suggestedNextTask && signal.readyForWork}
				<div
					class="rounded overflow-hidden"
					style="background: oklch(0.20 0.05 200); border: 1px solid oklch(0.38 0.10 200);"
				>
					<div
						class="px-2 py-1.5"
						style="background: oklch(0.23 0.06 200); border-bottom: 1px solid oklch(0.35 0.08 200);"
					>
						<div class="text-[10px] font-bold" style="color: oklch(0.80 0.10 200);">
							✨ SUGGESTED NEXT
						</div>
					</div>
					<div class="p-2 flex flex-col gap-2">
						<div class="flex items-start justify-between gap-2">
							<div class="flex-1 min-w-0">
								<button
									type="button"
									onclick={() => onTaskClick?.(signal.suggestedNextTask!.taskId)}
									class="text-xs font-mono px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity cursor-pointer mb-1"
									style="background: oklch(0.28 0.06 200); color: oklch(0.88 0.10 200); border: 1px solid oklch(0.38 0.10 200);"
									title="View task {signal.suggestedNextTask.taskId}"
								>
									{signal.suggestedNextTask.taskId}
								</button>
								<div class="text-xs font-semibold" style="color: oklch(0.92 0.06 200);">
									{signal.suggestedNextTask.title}
								</div>
							</div>
							{#if onStartSuggested}
								<button
									type="button"
									onclick={handleStartSuggested}
									disabled={submitting}
									class="btn btn-xs gap-1 flex-shrink-0"
									style="background: oklch(0.50 0.15 200); color: oklch(0.98 0.01 250); border: none;"
									title="Start working on {signal.suggestedNextTask.taskId}"
								>
									{#if submitting}
										<span class="loading loading-spinner loading-xs"></span>
									{:else}
										<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
										</svg>
									{/if}
									Start
								</button>
							{/if}
						</div>
						{#if signal.suggestedNextTask.reason}
							<div class="text-[11px] opacity-80" style="color: oklch(0.80 0.05 200);">
								💡 {signal.suggestedNextTask.reason}
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Assign Task Dropdown -->
			{#if signal.readyForWork && availableTasks.length > 0}
				<div class="flex flex-col gap-1.5">
					<div class="text-[10px] font-semibold opacity-70" style="color: oklch(0.75 0.05 250);">
						📋 ASSIGN TASK
					</div>
					<div class="flex gap-2">
						<select
							bind:value={selectedTaskId}
							class="select select-sm flex-1 text-xs"
							style="background: oklch(0.18 0.02 250); border-color: oklch(0.35 0.05 250); color: oklch(0.90 0.02 250);"
							disabled={submitting}
						>
							<option value={null}>Select a task...</option>
							{#each availableTasks as task}
								{@const priorityBadge = getPriorityBadge(task.priority)}
								<option value={task.id}>
									[{priorityBadge.label}] {task.id} - {task.title}
								</option>
							{/each}
						</select>
						<button
							type="button"
							onclick={handleAssignTask}
							disabled={submitting || !selectedTaskId}
							class="btn btn-sm gap-1"
							style="background: oklch(0.50 0.15 250); color: oklch(0.98 0.01 250); border: none;"
							title={selectedTaskId ? `Start working on ${selectedTaskId}` : 'Select a task first'}
						>
							{#if submitting}
								<span class="loading loading-spinner loading-xs"></span>
							{:else}
								<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
								</svg>
							{/if}
							Assign
						</button>
					</div>
				</div>
			{/if}

			<!-- Start Idle Action (if no suggested task and ready for work) -->
			{#if signal.readyForWork && !signal.suggestedNextTask && onStartIdle}
				<div class="pt-2 border-t" style="border-color: oklch(0.35 0.05 250);">
					<button
						type="button"
						onclick={handleStartIdle}
						disabled={submitting}
						class="btn btn-sm w-full gap-1"
						style="background: oklch(0.45 0.12 250); color: oklch(0.98 0.01 250); border: none;"
						title="Start agent to pick a task"
					>
						{#if submitting}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
							<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
							</svg>
						{/if}
						Start (/jat:start)
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
