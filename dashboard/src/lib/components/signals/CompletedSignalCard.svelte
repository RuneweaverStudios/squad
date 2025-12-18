<script lang="ts">
	/**
	 * CompletedSignalCard Component
	 *
	 * Renders a rich completion signal showing task summary, quality badges,
	 * session stats, human actions, suggested tasks, and cross-agent intel.
	 *
	 * @see shared/rich-signals-plan.md for design documentation
	 * @see src/lib/types/richSignals.ts for type definitions
	 */

	import type { CompletedSignal } from '$lib/types/richSignals';
	import type { SuggestedTask, HumanAction } from '$lib/types/signals';

	interface Props {
		/** The rich completed signal data */
		signal: CompletedSignal;
		/** Callback when task ID is clicked */
		onTaskClick?: (taskId: string) => void;
		/** Callback when cleanup/close session is requested */
		onCleanup?: () => void;
		/** Callback when suggested task is clicked to create it */
		onCreateSuggestedTask?: (task: SuggestedTask) => void;
		/** Whether an action is being submitted */
		submitting?: boolean;
		/** Whether to show in compact mode (for inline/timeline display) */
		compact?: boolean;
		/** Additional CSS class */
		class?: string;
	}

	let {
		signal,
		onTaskClick,
		onCleanup,
		onCreateSuggestedTask,
		submitting = false,
		compact = false,
		class: className = ''
	}: Props = $props();

	// UI state
	let suggestedTasksExpanded = $state(true);
	let crossAgentIntelExpanded = $state(false);
	let humanActionsExpanded = $state(true);
	let checkedHumanActions = $state<Set<number>>(new Set());

	// Tests status badge styling
	const testsStatusBadge = $derived.by(() => {
		const status = signal.quality?.tests;
		switch (status) {
			case 'passing':
				return { label: 'PASSING', color: 'oklch(0.55 0.18 145)', icon: '✅', bgColor: 'oklch(0.25 0.10 145 / 0.3)' };
			case 'failing':
				return { label: 'FAILING', color: 'oklch(0.55 0.22 25)', icon: '❌', bgColor: 'oklch(0.25 0.12 25 / 0.3)' };
			case 'skipped':
				return { label: 'SKIPPED', color: 'oklch(0.55 0.15 45)', icon: '⏭️', bgColor: 'oklch(0.25 0.08 45 / 0.3)' };
			case 'none':
			default:
				return { label: 'NO TESTS', color: 'oklch(0.50 0.08 250)', icon: '➖', bgColor: 'oklch(0.25 0.04 250 / 0.3)' };
		}
	});

	// Build status badge styling
	const buildStatusBadge = $derived.by(() => {
		const status = signal.quality?.build;
		switch (status) {
			case 'clean':
				return { label: 'CLEAN', color: 'oklch(0.55 0.18 145)', icon: '✅', bgColor: 'oklch(0.25 0.10 145 / 0.3)' };
			case 'warnings':
				return { label: 'WARNINGS', color: 'oklch(0.55 0.18 45)', icon: '⚠️', bgColor: 'oklch(0.25 0.10 45 / 0.3)' };
			case 'errors':
				return { label: 'ERRORS', color: 'oklch(0.55 0.22 25)', icon: '❌', bgColor: 'oklch(0.25 0.12 25 / 0.3)' };
			default:
				return { label: 'UNKNOWN', color: 'oklch(0.50 0.08 250)', icon: '❓', bgColor: 'oklch(0.25 0.04 250 / 0.3)' };
		}
	});

	// Priority badge styling
	function getPriorityStyle(priority: number) {
		switch (priority) {
			case 0: return { label: 'P0', color: 'oklch(0.60 0.22 25)', bgColor: 'oklch(0.25 0.12 25 / 0.4)' };
			case 1: return { label: 'P1', color: 'oklch(0.65 0.18 45)', bgColor: 'oklch(0.25 0.10 45 / 0.4)' };
			case 2: return { label: 'P2', color: 'oklch(0.65 0.15 85)', bgColor: 'oklch(0.25 0.08 85 / 0.4)' };
			case 3: return { label: 'P3', color: 'oklch(0.60 0.10 200)', bgColor: 'oklch(0.25 0.05 200 / 0.4)' };
			default: return { label: 'P4', color: 'oklch(0.55 0.05 250)', bgColor: 'oklch(0.25 0.03 250 / 0.4)' };
		}
	}

	// Type badge styling
	function getTypeStyle(type: string) {
		switch (type) {
			case 'bug': return { color: 'oklch(0.60 0.20 25)', bgColor: 'oklch(0.25 0.10 25 / 0.4)' };
			case 'feature': return { color: 'oklch(0.60 0.18 145)', bgColor: 'oklch(0.25 0.08 145 / 0.4)' };
			case 'chore': return { color: 'oklch(0.60 0.12 280)', bgColor: 'oklch(0.25 0.06 280 / 0.4)' };
			default: return { color: 'oklch(0.60 0.10 200)', bgColor: 'oklch(0.25 0.05 200 / 0.4)' };
		}
	}

	// Format duration
	function formatDuration(minutes: number | undefined): string {
		if (!minutes) return '--';
		if (minutes < 60) return `${minutes}m`;
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
	}

	// Format tokens
	function formatTokens(tokens: number | undefined): string {
		if (!tokens) return '--';
		if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
		if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
		return tokens.toString();
	}

	// Format commit hash
	function formatCommit(sha: string | undefined): string {
		if (!sha) return '--';
		return sha.slice(0, 7);
	}

	// Toggle human action checkbox
	function toggleHumanAction(index: number) {
		const newSet = new Set(checkedHumanActions);
		if (newSet.has(index)) {
			newSet.delete(index);
		} else {
			newSet.add(index);
		}
		checkedHumanActions = newSet;
	}

	// Human actions progress
	const humanActionsProgress = $derived.by(() => {
		if (!signal.humanActions || signal.humanActions.length === 0) return 100;
		return Math.round((checkedHumanActions.size / signal.humanActions.length) * 100);
	});
</script>

{#if compact}
	<!-- Compact mode: minimal completed card for timeline/inline display -->
	<div
		class="rounded-lg px-3 py-2 flex items-center gap-3 {className}"
		style="background: linear-gradient(90deg, oklch(0.25 0.10 145 / 0.3) 0%, oklch(0.22 0.05 145 / 0.1) 100%); border: 1px solid oklch(0.45 0.15 145);"
	>
		<!-- Status indicator -->
		<div class="flex-shrink-0">
			<svg class="w-4 h-4" style="color: oklch(0.75 0.18 145);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
		</div>

		<!-- Task info -->
		<div class="flex-1 min-w-0 flex items-center gap-2">
			<button
				type="button"
				class="text-xs font-mono px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity cursor-pointer"
				style="background: oklch(0.30 0.08 145); color: oklch(0.90 0.12 145); border: 1px solid oklch(0.45 0.12 145);"
				onclick={() => onTaskClick?.(signal.taskId)}
				title="View task {signal.taskId}"
			>
				{signal.taskId}
			</button>
			<span class="text-sm truncate" style="color: oklch(0.90 0.05 145);">
				Task completed
			</span>
		</div>

		<!-- Quality badges -->
		<div class="flex items-center gap-1.5 flex-shrink-0">
			<span
				class="text-[10px] px-1.5 py-0.5 rounded font-mono"
				style="background: {testsStatusBadge.bgColor}; color: {testsStatusBadge.color};"
			>
				{testsStatusBadge.icon}
			</span>
			<span
				class="text-[10px] px-1.5 py-0.5 rounded font-mono"
				style="background: {buildStatusBadge.bgColor}; color: {buildStatusBadge.color};"
			>
				{buildStatusBadge.icon}
			</span>
		</div>
	</div>
{:else}
	<!-- Full mode: detailed completed signal card -->
	<!-- Card sizes based on content, parent container handles max-height and scrolling -->
	<!-- overflow-hidden clips any nested content that might overflow -->
	<div
		class="rounded-lg overflow-hidden flex flex-col {className}"
		style="background: linear-gradient(135deg, oklch(0.22 0.06 145) 0%, oklch(0.18 0.04 140) 100%); border: 1px solid oklch(0.45 0.15 145);"
	>
		<!-- Header - flex-shrink-0 ensures it doesn't shrink when body scrolls -->
		<div
			class="px-3 py-2 flex items-center justify-between gap-2 flex-shrink-0"
			style="background: oklch(0.25 0.08 145); border-bottom: 1px solid oklch(0.40 0.12 145);"
		>
			<div class="flex items-center gap-2">
				<!-- Completed indicator -->
				<svg class="w-4 h-4" style="color: oklch(0.75 0.18 145);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>

				<!-- Badge -->
				<span
					class="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold"
					style="background: oklch(0.55 0.18 145); color: oklch(0.98 0.01 250);"
				>
					✅ COMPLETED
				</span>

				<!-- Task ID -->
				<button
					type="button"
					class="text-[10px] px-1.5 py-0.5 rounded font-mono cursor-pointer hover:opacity-80 transition-opacity"
					style="background: oklch(0.30 0.05 145); color: oklch(0.85 0.10 145); border: 1px solid oklch(0.40 0.10 145);"
					onclick={() => onTaskClick?.(signal.taskId)}
					title="View task {signal.taskId}"
				>
					{signal.taskId}
				</button>

				<!-- Agent name -->
				{#if signal.agentName}
					<span class="text-[10px] opacity-70" style="color: oklch(0.80 0.05 145);">
						by {signal.agentName}
					</span>
				{/if}
			</div>

			<!-- Quality badges -->
			<div class="flex items-center gap-1.5">
				<!-- Tests badge -->
				<span
					class="text-[10px] px-1.5 py-0.5 rounded font-mono flex items-center gap-1"
					style="background: {testsStatusBadge.bgColor}; color: {testsStatusBadge.color}; border: 1px solid {testsStatusBadge.color};"
					title="Tests: {testsStatusBadge.label}"
				>
					{testsStatusBadge.icon}
					<span class="hidden sm:inline">{testsStatusBadge.label}</span>
				</span>

				<!-- Build badge -->
				<span
					class="text-[10px] px-1.5 py-0.5 rounded font-mono flex items-center gap-1"
					style="background: {buildStatusBadge.bgColor}; color: {buildStatusBadge.color}; border: 1px solid {buildStatusBadge.color};"
					title="Build: {buildStatusBadge.label}"
				>
					{buildStatusBadge.icon}
					<span class="hidden sm:inline">{buildStatusBadge.label}</span>
				</span>
			</div>
		</div>

		<!-- Body - content naturally sizes, parent container handles scrolling -->
		<div class="p-3 flex flex-col gap-3">
			<!-- Summary Bullets -->
			{#if signal.summary && signal.summary.length > 0}
				<div class="flex flex-col gap-1.5">
					<div class="text-[10px] font-semibold opacity-70" style="color: oklch(0.75 0.05 145);">
						📋 SUMMARY
					</div>
					<ul class="flex flex-col gap-1">
						{#each signal.summary as item}
							<li class="flex items-start gap-2 text-xs" style="color: oklch(0.90 0.04 145);">
								<span style="color: oklch(0.65 0.18 145);">✓</span>
								<span>{item}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Session Stats -->
			{#if signal.sessionStats}
				<div class="flex flex-wrap gap-3 px-2 py-1.5 rounded" style="background: oklch(0.20 0.03 145);">
					{#if signal.sessionStats.duration}
						<div class="flex items-center gap-1 text-[11px]">
							<span style="color: oklch(0.60 0.05 145);">⏱️</span>
							<span style="color: oklch(0.85 0.05 145);">{formatDuration(signal.sessionStats.duration)}</span>
						</div>
					{/if}
					{#if signal.sessionStats.tokensUsed}
						<div class="flex items-center gap-1 text-[11px]">
							<span style="color: oklch(0.60 0.05 145);">🪙</span>
							<span style="color: oklch(0.85 0.05 145);">{formatTokens(signal.sessionStats.tokensUsed)} tokens</span>
						</div>
					{/if}
					{#if signal.sessionStats.filesModified}
						<div class="flex items-center gap-1 text-[11px]">
							<span style="color: oklch(0.60 0.05 145);">📁</span>
							<span style="color: oklch(0.85 0.05 145);">{signal.sessionStats.filesModified} files</span>
						</div>
					{/if}
					{#if signal.sessionStats.commitsCreated}
						<div class="flex items-center gap-1 text-[11px]">
							<span style="color: oklch(0.60 0.05 145);">📝</span>
							<span style="color: oklch(0.85 0.05 145);">{signal.sessionStats.commitsCreated} commits</span>
						</div>
					{/if}
					{#if signal.finalCommit}
						<div class="flex items-center gap-1 text-[11px]">
							<span style="color: oklch(0.60 0.05 145);">🔖</span>
							<span class="font-mono" style="color: oklch(0.85 0.10 250);">{formatCommit(signal.finalCommit)}</span>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Human Actions (if any) -->
			{#if signal.humanActions && signal.humanActions.length > 0}
				<div
					class="rounded overflow-hidden"
					style="background: oklch(0.20 0.06 45 / 0.3); border: 1px solid oklch(0.50 0.15 45);"
				>
					<button
						type="button"
						onclick={() => humanActionsExpanded = !humanActionsExpanded}
						class="w-full px-2 py-1.5 flex items-center justify-between text-left hover:opacity-90 transition-opacity"
						style="background: oklch(0.25 0.08 45 / 0.4);"
					>
						<div class="flex items-center gap-1.5">
							<span class="text-[10px] font-bold" style="color: oklch(0.85 0.12 45);">
								⚡ ACTION REQUIRED ({signal.humanActions.length})
							</span>
							{#if humanActionsProgress < 100}
								<span class="text-[10px]" style="color: oklch(0.70 0.08 45);">
									{checkedHumanActions.size}/{signal.humanActions.length} done
								</span>
							{:else}
								<span class="text-[10px]" style="color: oklch(0.70 0.12 145);">
									✓ all done
								</span>
							{/if}
						</div>
						<svg
							class="w-3.5 h-3.5 transition-transform duration-200"
							class:rotate-180={humanActionsExpanded}
							style="color: oklch(0.70 0.08 45);"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
						</svg>
					</button>
					{#if humanActionsExpanded}
						<div class="p-2 flex flex-col gap-2">
							{#each signal.humanActions as action, i}
								<button
									type="button"
									onclick={() => toggleHumanAction(i)}
									class="flex items-start gap-2 p-2 rounded text-left transition-all hover:opacity-90"
									style="background: {checkedHumanActions.has(i) ? 'oklch(0.22 0.06 145 / 0.3)' : 'oklch(0.18 0.04 45 / 0.3)'}; border: 1px solid {checkedHumanActions.has(i) ? 'oklch(0.45 0.12 145)' : 'oklch(0.40 0.10 45)'};"
								>
									<!-- Checkbox -->
									<span
										class="w-4 h-4 flex items-center justify-center rounded flex-shrink-0 mt-0.5"
										style="background: {checkedHumanActions.has(i) ? 'oklch(0.50 0.18 145)' : 'oklch(0.30 0.06 45)'}; border: 1px solid {checkedHumanActions.has(i) ? 'oklch(0.55 0.18 145)' : 'oklch(0.45 0.10 45)'};"
									>
										{#if checkedHumanActions.has(i)}
											<svg class="w-2.5 h-2.5" style="color: oklch(0.98 0.01 250);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
												<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
											</svg>
										{/if}
									</span>
									<div class="flex-1">
										<div
											class="text-xs font-semibold"
											class:line-through={checkedHumanActions.has(i)}
											class:opacity-60={checkedHumanActions.has(i)}
											style="color: oklch(0.90 0.06 45);"
										>
											{action.title}
										</div>
										{#if action.description}
											<div
												class="text-[11px] mt-1 whitespace-pre-wrap"
												class:opacity-50={checkedHumanActions.has(i)}
												style="color: oklch(0.75 0.04 45);"
											>
												{action.description}
											</div>
										{/if}
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Suggested Tasks -->
			{#if signal.suggestedTasks && signal.suggestedTasks.length > 0}
				<div
					class="rounded overflow-hidden"
					style="background: oklch(0.20 0.04 200); border: 1px solid oklch(0.40 0.08 200);"
				>
					<button
						type="button"
						onclick={() => suggestedTasksExpanded = !suggestedTasksExpanded}
						class="w-full px-2 py-1.5 flex items-center justify-between text-left hover:opacity-90 transition-opacity"
						style="background: oklch(0.23 0.05 200);"
					>
						<div class="flex items-center gap-1.5">
							<span class="text-[10px] font-bold" style="color: oklch(0.80 0.08 200);">
								💡 SUGGESTED TASKS ({signal.suggestedTasks.length})
							</span>
						</div>
						<svg
							class="w-3.5 h-3.5 transition-transform duration-200"
							class:rotate-180={suggestedTasksExpanded}
							style="color: oklch(0.70 0.05 200);"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
						</svg>
					</button>
					{#if suggestedTasksExpanded}
						<div class="p-2 flex flex-col gap-2">
							{#each signal.suggestedTasks as task, i}
								{@const priorityStyle = getPriorityStyle(task.priority)}
								{@const typeStyle = getTypeStyle(task.type)}
								<div
									class="p-2 rounded flex flex-col gap-1.5"
									style="background: oklch(0.18 0.02 200); border: 1px solid oklch(0.32 0.05 200);"
								>
									<div class="flex items-start gap-2">
										<!-- Priority badge -->
										<span
											class="text-[9px] px-1 py-0.5 rounded font-mono font-bold flex-shrink-0"
											style="background: {priorityStyle.bgColor}; color: {priorityStyle.color};"
										>
											{priorityStyle.label}
										</span>
										<!-- Type badge -->
										<span
											class="text-[9px] px-1 py-0.5 rounded font-mono flex-shrink-0"
											style="background: {typeStyle.bgColor}; color: {typeStyle.color};"
										>
											{task.type}
										</span>
										<!-- Title -->
										<span class="text-xs flex-1" style="color: oklch(0.90 0.04 200);">
											{task.title}
										</span>
										<!-- Create button -->
										{#if onCreateSuggestedTask}
											<button
												type="button"
												onclick={() => onCreateSuggestedTask?.(task)}
												disabled={submitting}
												class="text-[10px] px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity flex-shrink-0"
												style="background: oklch(0.45 0.12 200); color: oklch(0.95 0.05 200); border: 1px solid oklch(0.50 0.10 200);"
												title="Create this task"
											>
												+ Create
											</button>
										{/if}
									</div>
									{#if task.description}
										<div class="text-[11px] pl-1" style="color: oklch(0.75 0.03 200);">
											{task.description}
										</div>
									{/if}
									{#if task.reason}
										<div class="text-[10px] pl-1 italic" style="color: oklch(0.65 0.05 200);">
											💡 {task.reason}
										</div>
									{/if}
									<!-- Labels and dependencies -->
									<div class="flex flex-wrap gap-1 pl-1">
										{#if task.project}
											<span class="text-[9px] px-1 py-0.5 rounded" style="background: oklch(0.30 0.08 280); color: oklch(0.80 0.10 280);">
												📁 {task.project}
											</span>
										{/if}
										{#if task.labels}
											{#each task.labels.split(',').map(l => l.trim()).filter(Boolean) as label}
												<span class="text-[9px] px-1 py-0.5 rounded" style="background: oklch(0.28 0.05 200); color: oklch(0.75 0.06 200);">
													{label}
												</span>
											{/each}
										{/if}
										{#if task.depends_on && task.depends_on.length > 0}
											<span class="text-[9px] px-1 py-0.5 rounded" style="background: oklch(0.28 0.06 45); color: oklch(0.75 0.10 45);">
												⏳ depends on: {task.depends_on.join(', ')}
											</span>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Cross-Agent Intel -->
			{#if signal.crossAgentIntel && (signal.crossAgentIntel.files?.length || signal.crossAgentIntel.patterns?.length || signal.crossAgentIntel.gotchas?.length)}
				<div
					class="rounded overflow-hidden"
					style="background: oklch(0.20 0.04 280); border: 1px solid oklch(0.40 0.08 280);"
				>
					<button
						type="button"
						onclick={() => crossAgentIntelExpanded = !crossAgentIntelExpanded}
						class="w-full px-2 py-1.5 flex items-center justify-between text-left hover:opacity-90 transition-opacity"
						style="background: oklch(0.23 0.05 280);"
					>
						<div class="flex items-center gap-1.5">
							<span class="text-[10px] font-bold" style="color: oklch(0.80 0.10 280);">
								🤝 CROSS-AGENT INTEL
							</span>
						</div>
						<svg
							class="w-3.5 h-3.5 transition-transform duration-200"
							class:rotate-180={crossAgentIntelExpanded}
							style="color: oklch(0.70 0.06 280);"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
						</svg>
					</button>
					{#if crossAgentIntelExpanded}
						<div class="p-2 flex flex-col gap-2">
							{#if signal.crossAgentIntel.files && signal.crossAgentIntel.files.length > 0}
								<div>
									<div class="text-[10px] font-semibold mb-1" style="color: oklch(0.75 0.06 280);">📁 Key Files</div>
									<div class="flex flex-wrap gap-1">
										{#each signal.crossAgentIntel.files as file}
											<span class="text-[10px] px-1.5 py-0.5 rounded font-mono" style="background: oklch(0.25 0.04 280); color: oklch(0.80 0.06 280);">
												{file}
											</span>
										{/each}
									</div>
								</div>
							{/if}
							{#if signal.crossAgentIntel.patterns && signal.crossAgentIntel.patterns.length > 0}
								<div>
									<div class="text-[10px] font-semibold mb-1" style="color: oklch(0.75 0.06 280);">📐 Patterns</div>
									<ul class="text-[11px] list-disc list-inside" style="color: oklch(0.80 0.04 280);">
										{#each signal.crossAgentIntel.patterns as pattern}
											<li>{pattern}</li>
										{/each}
									</ul>
								</div>
							{/if}
							{#if signal.crossAgentIntel.gotchas && signal.crossAgentIntel.gotchas.length > 0}
								<div>
									<div class="text-[10px] font-semibold mb-1" style="color: oklch(0.80 0.12 45);">⚠️ Gotchas</div>
									<ul class="text-[11px] list-disc list-inside" style="color: oklch(0.80 0.06 45);">
										{#each signal.crossAgentIntel.gotchas as gotcha}
											<li>{gotcha}</li>
										{/each}
									</ul>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			<!-- PR Link (if available) -->
			{#if signal.prLink}
				<a
					href={signal.prLink}
					target="_blank"
					rel="noopener noreferrer"
					class="flex items-center gap-2 px-3 py-2 rounded hover:opacity-90 transition-opacity"
					style="background: oklch(0.25 0.08 280); border: 1px solid oklch(0.45 0.12 280);"
				>
					<svg class="w-4 h-4" style="color: oklch(0.80 0.12 280);" fill="currentColor" viewBox="0 0 24 24">
						<path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
					</svg>
					<span class="text-sm" style="color: oklch(0.90 0.08 280);">View Pull Request</span>
					<svg class="w-3 h-3 ml-auto" style="color: oklch(0.70 0.06 280);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
					</svg>
				</a>
			{/if}

			<!-- Cleanup button -->
			{#if onCleanup}
				<div class="flex justify-end pt-2 border-t" style="border-color: oklch(0.35 0.08 145);">
					<button
						type="button"
						onclick={onCleanup}
						disabled={submitting}
						class="btn btn-sm gap-1"
						style="background: oklch(0.50 0.15 145); color: oklch(0.98 0.01 250); border: none;"
					>
						{#if submitting}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
							<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
							</svg>
						{/if}
						Cleanup Session
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
