<script lang="ts">
	/**
	 * WorkingSignalCard Component
	 *
	 * Renders a rich working signal showing the agent's current task context,
	 * planned approach, expected files to modify, and baseline for rollback.
	 *
	 * @see shared/rich-signals-plan.md for design documentation
	 * @see src/lib/types/richSignals.ts for type definitions
	 */

	import type { WorkingSignal } from '$lib/types/richSignals';
	import { openInVSCode, isGlobPattern, getFileLink, openInFilesPage } from '$lib/utils/fileLinks';

	interface Props {
		/** The rich working signal data */
		signal: WorkingSignal;
		/** Agent name to display in the header */
		agentName?: string;
		/** Project name for file links (e.g., 'jat', 'chimaro') - required for /files navigation */
		projectName?: string;
		/** Callback when task ID is clicked */
		onTaskClick?: (taskId: string) => void;
		/** Callback when a file path is clicked */
		onFileClick?: (filePath: string) => void;
		/** Callback when baseline commit is clicked (for rollback) */
		onRollbackClick?: (commit: string) => void;
		/** Callback when interrupt (Ctrl+C) is clicked - cancels current operation */
		onInterrupt?: () => Promise<void>;
		/** Callback when pause is clicked - runs /jat:pause to pause work */
		onPause?: () => Promise<void>;
		/** Whether an action is being submitted */
		submitting?: boolean;
		/** Whether to show in compact mode (for inline/timeline display) */
		compact?: boolean;
		/** Additional CSS class */
		class?: string;
	}

	let {
		signal,
		agentName,
		projectName,
		onTaskClick,
		onFileClick,
		onRollbackClick,
		onInterrupt,
		onPause,
		submitting = false,
		compact = false,
		class: className = ''
	}: Props = $props();

	// Handle interrupt action (Ctrl+C)
	async function handleInterrupt() {
		if (submitting || !onInterrupt) return;
		await onInterrupt();
	}

	// Handle pause action
	async function handlePause() {
		if (submitting || !onPause) return;
		await onPause();
	}

	// Whether approach section is expanded (default collapsed in compact mode)
	let approachExpanded = $state(!compact);

	// Task type badge styling - using DaisyUI semantic color classes
	const taskTypeBadge = $derived.by(() => {
		switch (signal.taskType?.toLowerCase()) {
			case 'bug':
				return { label: 'BUG', colorClass: 'bg-error text-error-content', icon: '🐛' };
			case 'feature':
				return { label: 'FEATURE', colorClass: 'bg-success text-success-content', icon: '✨' };
			case 'task':
				return { label: 'TASK', colorClass: 'bg-primary text-primary-content', icon: '📋' };
			case 'chore':
				return { label: 'CHORE', colorClass: 'bg-base-300 text-base-content', icon: '🔧' };
			case 'epic':
				return { label: 'EPIC', colorClass: 'bg-secondary text-secondary-content', icon: '🎯' };
			default:
				return { label: 'TASK', colorClass: 'bg-primary text-primary-content', icon: '📋' };
		}
	});

	// Priority badge styling - using DaisyUI semantic color classes
	const priorityBadge = $derived.by(() => {
		const p = signal.taskPriority;
		if (p === 0) return { label: 'P0', colorClass: 'bg-error text-error-content', urgent: true };
		if (p === 1) return { label: 'P1', colorClass: 'bg-warning text-warning-content', urgent: true };
		if (p === 2) return { label: 'P2', colorClass: 'bg-info text-info-content', urgent: false };
		if (p === 3) return { label: 'P3', colorClass: 'bg-base-300 text-base-content', urgent: false };
		return { label: 'P4', colorClass: 'bg-base-300 text-base-content/70', urgent: false };
	});

	// Scope badge styling - using DaisyUI semantic color classes
	const scopeBadge = $derived.by(() => {
		switch (signal.estimatedScope) {
			case 'small':
				return { label: 'SMALL', colorClass: 'bg-success text-success-content', icon: '📏' };
			case 'medium':
				return { label: 'MEDIUM', colorClass: 'bg-warning text-warning-content', icon: '📐' };
			case 'large':
				return { label: 'LARGE', colorClass: 'bg-error text-error-content', icon: '📊' };
			default:
				return null;
		}
	});

	// Format commit hash for display
	function formatCommit(sha: string): string {
		return sha.slice(0, 7);
	}

	// Handle file click - opens in JAT /files page by default
	function handleFileClick(filePath: string) {
		if (onFileClick) {
			onFileClick(filePath);
		} else if (!isGlobPattern(filePath)) {
			// Default: open in JAT /files page if projectName is available
			if (projectName) {
				openInFilesPage(filePath, projectName);
			} else {
				// Fallback: open in JAT file editor (without project context)
				openInVSCode(filePath);
			}
		}
	}

	// Get tooltip for file link
	function getFileTooltip(filePath: string): string {
		if (isGlobPattern(filePath)) {
			return `Pattern: ${filePath}`;
		}
		if (projectName) {
			return `Open ${filePath.split('/').pop()} in editor`;
		}
		const link = getFileLink(filePath);
		return link.description;
	}

	// Toggle approach section
	function toggleApproach() {
		approachExpanded = !approachExpanded;
	}
</script>

{#if compact}
	<!-- Compact mode: minimal task card for timeline/inline display -->
	<div
		class="rounded-lg px-3 py-2 flex items-center gap-3 bg-warning/20 border border-warning/50 {className}"
	>
		<!-- Status indicator -->
		<div class="flex-shrink-0">
			<span class="loading loading-spinner loading-xs text-warning"></span>
		</div>

		<!-- Task info -->
		<div class="flex-1 min-w-0 flex items-center gap-2">
			<button
				type="button"
				class="text-xs font-mono px-1.5 py-0.5 rounded bg-warning/30 text-warning-content border border-warning/40 hover:opacity-80 transition-opacity cursor-pointer"
				onclick={() => onTaskClick?.(signal.taskId)}
				title="View task {signal.taskId}"
			>
				{signal.taskId}
			</button>
			<span class="text-sm truncate text-warning-content/90">
				{signal.taskTitle}
			</span>
		</div>

		<!-- Priority badge -->
		<span
			class="text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 {priorityBadge.colorClass}"
		>
			{priorityBadge.label}
		</span>
	</div>
{:else}
	<!-- Full mode: detailed working signal card -->
	<!-- Card sizes based on content, parent container handles max-height and scrolling -->
	<!-- overflow-hidden clips any nested content that might overflow -->
	<div
		class="rounded-lg overflow-hidden flex flex-col bg-warning/10 border border-warning/50 {className}"
	>
		<!-- Header - flex-shrink-0 ensures it doesn't shrink when body scrolls -->
		<div
			class="px-3 py-2 flex items-center justify-between gap-2 flex-shrink-0 bg-warning/20 border-b border-warning/30"
		>
			<div class="flex items-center gap-2">
				<!-- Working indicator -->
				<span class="loading loading-spinner loading-xs text-warning"></span>

				<!-- Agent name (if provided) -->
				{#if agentName}
					<span
						class="text-[11px] px-2 py-0.5 rounded font-mono font-bold bg-info/30 text-info border border-info/40"
						title="Agent working on this task"
					>
						{agentName}
					</span>
				{/if}

				<!-- Task type badge -->
				<span
					class="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold {taskTypeBadge.colorClass}"
				>
					{taskTypeBadge.icon} {taskTypeBadge.label}
				</span>

				<!-- Task ID -->
				<button
					type="button"
					class="text-[10px] px-1.5 py-0.5 rounded font-mono cursor-pointer hover:opacity-80 transition-opacity bg-warning/20 text-warning-content border border-warning/30"
					onclick={() => onTaskClick?.(signal.taskId)}
					title="View task {signal.taskId}"
				>
					{signal.taskId}
				</button>
			</div>

			<div class="flex items-center gap-1.5">
				<!-- Priority badge -->
				<span
					class="text-[10px] px-1.5 py-0.5 rounded font-bold {priorityBadge.colorClass}"
					class:animate-pulse={priorityBadge.urgent}
				>
					{priorityBadge.label}
				</span>

				<!-- Scope badge -->
				{#if scopeBadge}
					<span
						class="text-[10px] px-1.5 py-0.5 rounded font-mono {scopeBadge.colorClass}"
					>
						{scopeBadge.icon} {scopeBadge.label}
					</span>
				{/if}
			</div>
		</div>

		<!-- Body -->
		<div class="p-3 flex flex-col gap-3">
			<!-- Task Title & Description -->
			<div class="flex flex-col gap-1">
				<div class="text-sm font-semibold text-warning-content">
					{signal.taskTitle}
				</div>
				{#if signal.taskDescription}
					<div class="text-[11px] opacity-80 line-clamp-2 text-warning-content/80">
						{signal.taskDescription}
					</div>
				{/if}
			</div>

			<!-- Approach Section (collapsible) -->
			{#if signal.approach}
				<div
					class="rounded overflow-hidden bg-base-300 border border-base-content/20"
				>
					<button
						type="button"
						onclick={toggleApproach}
						class="w-full px-2 py-1.5 flex items-center justify-between text-left hover:opacity-90 transition-opacity bg-base-300"
					>
						<div class="flex items-center gap-1.5">
							<span class="text-[10px] font-bold text-warning">
								🎯 APPROACH
							</span>
						</div>
						<svg
							class="w-3.5 h-3.5 transition-transform duration-200 text-base-content/60"
							class:rotate-180={approachExpanded}
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
						</svg>
					</button>
					{#if approachExpanded}
						<div class="px-2 py-2 text-xs text-base-content/90">
							{signal.approach}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Expected Files -->
			{#if signal.expectedFiles && signal.expectedFiles.length > 0}
				<div class="flex flex-col gap-1.5">
					<div class="text-[10px] font-semibold text-base-content/60">
						📁 EXPECTED FILES
					</div>
					<div class="flex flex-wrap gap-1">
						{#each signal.expectedFiles as file}
							{@const isGlob = isGlobPattern(file)}
							<button
								type="button"
								onclick={() => handleFileClick(file)}
								class="text-[11px] px-2 py-0.5 rounded transition-opacity flex items-center gap-1 bg-info/20 text-info border border-info/30"
								class:hover:opacity-80={!isGlob}
								class:cursor-pointer={!isGlob}
								class:cursor-default={isGlob}
								class:opacity-70={isGlob}
								title={getFileTooltip(file)}
							>
								{#if isGlob}
									<!-- Glob pattern icon -->
									<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
										<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
									</svg>
								{:else}
									<!-- File icon -->
									<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
										<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
									</svg>
								{/if}
								{file}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Dependencies -->
			{#if signal.dependencies && signal.dependencies.length > 0}
				<div class="flex flex-col gap-1.5">
					<div class="text-[10px] font-semibold text-base-content/60">
						🔗 DEPENDS ON
					</div>
					<div class="flex flex-wrap gap-1">
						{#each signal.dependencies as dep}
							<button
								type="button"
								onclick={() => onTaskClick?.(dep)}
								class="text-[11px] px-2 py-0.5 rounded hover:opacity-80 transition-opacity cursor-pointer bg-secondary/20 text-secondary border border-secondary/30"
								title="View dependency {dep}"
							>
								{dep}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Blockers -->
			{#if signal.blockers && signal.blockers.length > 0}
				<div
					class="flex flex-col gap-1.5 p-2 rounded bg-error/20 border border-error/50"
				>
					<div class="text-[10px] font-bold text-error">
						⚠️ BLOCKERS
					</div>
					<ul class="text-[11px] list-disc list-inside text-error-content">
						{#each signal.blockers as blocker}
							<li>{blocker}</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Baseline (for rollback) -->
			{#if signal.baselineCommit}
				<div
					class="flex items-center justify-between px-2 py-1.5 rounded bg-base-200 border border-base-content/20"
				>
					<div class="flex items-center gap-2">
						<span class="text-[10px] font-semibold text-base-content/50">
							⏪ BASELINE
						</span>
						<span class="font-mono text-[11px] text-base-content/70">
							{formatCommit(signal.baselineCommit)}
						</span>
						{#if signal.baselineBranch}
							<span
								class="text-[10px] px-1 py-0.5 rounded bg-success/20 text-success"
							>
								{signal.baselineBranch}
							</span>
						{/if}
					</div>
					{#if onRollbackClick}
						<button
							type="button"
							onclick={() => onRollbackClick?.(signal.baselineCommit)}
							class="text-[10px] px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity bg-error/30 text-error border border-error/40"
							title="Rollback to {formatCommit(signal.baselineCommit)}"
						>
							Rollback
						</button>
					{/if}
				</div>
			{/if}

			<!-- Action Buttons -->
			{#if onInterrupt || onPause}
				<div class="flex gap-2 pt-2 border-t border-warning/30">
					{#if onInterrupt}
						<button
							type="button"
							onclick={handleInterrupt}
							disabled={submitting}
							class="btn btn-sm btn-error flex-1 gap-1"
							title="Send Ctrl+C to interrupt current operation"
						>
							{#if submitting}
								<span class="loading loading-spinner loading-xs"></span>
							{:else}
								<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
								</svg>
							{/if}
							Interrupt
						</button>
					{/if}
					{#if onPause}
						<button
							type="button"
							onclick={handlePause}
							disabled={submitting}
							class="btn btn-sm btn-warning flex-1 gap-1"
							title="Pause work on this task"
						>
							{#if submitting}
								<span class="loading loading-spinner loading-xs"></span>
							{:else}
								<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
								</svg>
							{/if}
							Pause
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}
