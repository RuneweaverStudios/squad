<script lang="ts">
	/**
	 * CompletingSignalCard.svelte
	 *
	 * Displays completion progress when an agent is running /jat:complete.
	 * Shows a progress bar with step indicators, current step highlighted,
	 * animated spinner on active step, and step descriptions.
	 *
	 * @see shared/rich-signals-plan.md for design documentation
	 * @see src/lib/types/richSignals.ts for type definitions
	 */

	import type { CompletingSignal, CompletionStep } from '$lib/types/richSignals';

	interface Props {
		/** The completing signal data */
		signal: CompletingSignal;
		/** Whether to show in compact mode (for inline display) */
		compact?: boolean;
	}

	let { signal, compact = false }: Props = $props();

	// All completion steps in order
	const ALL_STEPS: { id: CompletionStep; label: string; icon: string }[] = [
		{ id: 'verifying', label: 'Verifying', icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
		{ id: 'committing', label: 'Committing', icon: 'M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5' },
		{ id: 'closing', label: 'Closing', icon: 'M6 18L18 6M6 6l12 12' },
		{ id: 'releasing', label: 'Releasing', icon: 'M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z' },
		{ id: 'announcing', label: 'Announcing', icon: 'M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46' }
	];

	// Get step status
	function getStepStatus(stepId: CompletionStep): 'completed' | 'current' | 'pending' {
		if (signal.stepsCompleted.includes(stepId)) return 'completed';
		if (signal.currentStep === stepId) return 'current';
		return 'pending';
	}

	// Calculate visual progress (where to position in the progress bar)
	const currentStepIndex = $derived(ALL_STEPS.findIndex(s => s.id === signal.currentStep));

	// Format elapsed time for current step
	function formatElapsed(startedAt: string | undefined): string {
		if (!startedAt) return '';

		const started = new Date(startedAt);
		if (isNaN(started.getTime())) return '';

		const now = new Date();
		const seconds = Math.floor((now.getTime() - started.getTime()) / 1000);

		if (!isFinite(seconds) || seconds < 0) return '';
		if (seconds < 60) return `${seconds}s`;
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes}m ${remainingSeconds}s`;
	}

	// Auto-update elapsed time
	let elapsedTime = $state(formatElapsed(signal.stepStartedAt) || '');
	$effect(() => {
		const interval = setInterval(() => {
			elapsedTime = formatElapsed(signal.stepStartedAt);
		}, 1000);
		return () => clearInterval(interval);
	});

	// Safe progress value (fallback to 0 if not a valid number)
	const progressValue = $derived(
		typeof signal.progress === 'number' && isFinite(signal.progress) ? signal.progress : 0
	);
</script>

{#if compact}
	<!-- Compact mode: inline progress indicator -->
	<div class="flex items-center gap-2 text-sm">
		<span class="loading loading-spinner loading-xs text-info"></span>
		<span class="text-base-content/70">
			{signal.currentStep}
			<span class="text-base-content/50">({progressValue}%)</span>
		</span>
	</div>
{:else}
	<!-- Full mode: detailed progress card -->
	<!-- Card sizes based on content, parent container handles max-height and scrolling -->
	<!-- overflow-hidden clips any nested content that might overflow -->
	<div class="card bg-base-200 shadow-sm overflow-hidden flex flex-col">
		<div class="card-body p-4 flex-1 min-h-0 overflow-y-auto">
			<!-- Header -->
			<div class="flex items-center justify-between mb-4">
				<div class="flex items-center gap-2">
					<span class="loading loading-spinner loading-sm text-info"></span>
					<h3 class="font-semibold text-base-content">Completing Task</h3>
				</div>
				<div class="badge badge-info badge-outline font-mono text-xs">
					{signal.taskId}
				</div>
			</div>

			<!-- Task title -->
			{#if signal.taskTitle}
				<p class="text-sm text-base-content/80 mb-4 line-clamp-1">
					{signal.taskTitle}
				</p>
			{/if}

			<!-- Progress bar -->
			<div class="w-full mb-4">
				<div class="flex justify-between text-xs text-base-content/50 mb-1">
					<span>Progress</span>
					<span>{progressValue}%</span>
				</div>
				<progress
					class="progress progress-info w-full h-2"
					value={progressValue}
					max="100"
				></progress>
			</div>

			<!-- Step indicators -->
			<div class="flex flex-col gap-1">
				{#each ALL_STEPS as step, index}
					{@const status = getStepStatus(step.id)}
					<div
						class="flex items-center gap-3 py-1.5 px-2 rounded-lg transition-all duration-300
							{status === 'current' ? 'bg-info/10' : ''}
							{status === 'completed' ? 'opacity-60' : ''}
							{status === 'pending' ? 'opacity-40' : ''}"
					>
						<!-- Step icon/spinner -->
						<div class="w-5 h-5 flex items-center justify-center">
							{#if status === 'current'}
								<span class="loading loading-spinner loading-xs text-info"></span>
							{:else if status === 'completed'}
								<svg
									class="w-4 h-4 text-success"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M5 13l4 4L19 7"
									></path>
								</svg>
							{:else}
								<svg
									class="w-4 h-4 text-base-content/30"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="1.5"
										d={step.icon}
									></path>
								</svg>
							{/if}
						</div>

						<!-- Step label -->
						<span
							class="text-sm flex-1
								{status === 'current' ? 'font-medium text-info' : ''}
								{status === 'completed' ? 'text-success' : ''}
								{status === 'pending' ? 'text-base-content/50' : ''}"
						>
							{step.label}
						</span>

						<!-- Current step description and elapsed time -->
						{#if status === 'current' && signal.stepDescription}
							<span class="text-xs text-base-content/50 max-w-[150px] truncate">
								{elapsedTime}
							</span>
						{/if}
					</div>
				{/each}
			</div>

			<!-- Current step description -->
			{#if signal.stepDescription}
				<div class="mt-3 pt-3 border-t border-base-300">
					<p class="text-xs text-base-content/60 italic">
						{signal.stepDescription}
					</p>
				</div>
			{/if}
		</div>
	</div>
{/if}
