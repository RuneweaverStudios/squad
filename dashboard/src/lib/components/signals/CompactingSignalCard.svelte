<script lang="ts">
	/**
	 * CompactingSignalCard Component
	 *
	 * Renders a compacting signal showing context summarization in progress:
	 * reason, context size before/after, and items being preserved.
	 *
	 * @see shared/rich-signals-plan.md for design documentation
	 * @see src/lib/types/richSignals.ts for type definitions
	 */

	import type { CompactingSignal } from '$lib/types/richSignals';

	interface Props {
		/** The rich compacting signal data */
		signal: CompactingSignal;
		/** Whether to show in compact mode (for inline/timeline display) */
		compact?: boolean;
		/** Additional CSS class */
		class?: string;
	}

	let {
		signal,
		compact = false,
		class: className = ''
	}: Props = $props();

	// Calculate compression ratio
	const compressionRatio = $derived(
		signal.contextSizeBefore > 0
			? Math.round((1 - signal.estimatedAfter / signal.contextSizeBefore) * 100)
			: 0
	);

	// Format token count for display
	function formatTokens(count: number): string {
		if (count >= 1_000_000) {
			return `${(count / 1_000_000).toFixed(1)}M`;
		}
		if (count >= 1_000) {
			return `${(count / 1_000).toFixed(0)}K`;
		}
		return count.toString();
	}

	// Calculate progress percentage (before → after)
	const progressPercent = $derived(
		signal.contextSizeBefore > 0
			? Math.round((signal.estimatedAfter / signal.contextSizeBefore) * 100)
			: 0
	);
</script>

{#if compact}
	<!-- Compact mode: minimal card for timeline/inline display -->
	<div
		class="rounded-lg px-3 py-2 flex items-center gap-3 {className}"
		style="background: linear-gradient(90deg, oklch(0.25 0.10 45 / 0.3) 0%, oklch(0.22 0.05 45 / 0.1) 100%); border: 1px solid oklch(0.45 0.12 45);"
	>
		<!-- Status indicator -->
		<div class="flex-shrink-0">
			<span class="loading loading-spinner loading-xs text-warning"></span>
		</div>

		<!-- Compaction info -->
		<div class="flex-1 min-w-0 flex items-center gap-2">
			<span class="text-sm font-semibold" style="color: oklch(0.90 0.10 45);">
				📦 Compacting
			</span>
			<span class="text-xs opacity-70" style="color: oklch(0.80 0.05 45);">
				{formatTokens(signal.contextSizeBefore)} → {formatTokens(signal.estimatedAfter)}
			</span>
		</div>

		<!-- Compression badge -->
		<span
			class="text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0"
			style="background: oklch(0.55 0.15 145); color: oklch(0.98 0.01 145);"
		>
			-{compressionRatio}%
		</span>
	</div>
{:else}
	<!-- Full mode: detailed compacting signal card -->
	<!-- Card sizes based on content, parent container handles max-height and scrolling -->
	<!-- overflow-hidden clips any nested content that might overflow -->
	<div
		class="rounded-lg overflow-hidden flex flex-col {className}"
		style="background: linear-gradient(135deg, oklch(0.22 0.06 45) 0%, oklch(0.18 0.04 50) 100%); border: 1px solid oklch(0.45 0.12 45);"
	>
		<!-- Header -->
		<div
			class="px-3 py-2 flex items-center justify-between gap-2 flex-shrink-0"
			style="background: oklch(0.25 0.08 45); border-bottom: 1px solid oklch(0.40 0.10 45);"
		>
			<div class="flex items-center gap-2">
				<!-- Compacting indicator -->
				<span class="loading loading-spinner loading-xs text-warning"></span>

				<!-- Title -->
				<span class="font-semibold text-sm" style="color: oklch(0.95 0.10 45);">
					📦 Context Compacting
				</span>

				<!-- Task badge (if available) -->
				{#if signal.taskId}
					<span
						class="text-[10px] px-1.5 py-0.5 rounded font-mono"
						style="background: oklch(0.30 0.06 200); color: oklch(0.85 0.08 200); border: 1px solid oklch(0.40 0.08 200);"
					>
						{signal.taskId}
					</span>
				{/if}
			</div>

			<!-- Compression ratio badge -->
			<span
				class="text-[10px] px-1.5 py-0.5 rounded font-bold"
				style="background: oklch(0.55 0.15 145); color: oklch(0.98 0.01 145);"
			>
				-{compressionRatio}% reduction
			</span>
		</div>

		<!-- Body -->
		<div class="p-3 flex flex-col gap-3">
			<!-- Reason -->
			<div
				class="px-2 py-1.5 rounded text-[11px]"
				style="background: oklch(0.20 0.04 45); color: oklch(0.85 0.06 45); border: 1px solid oklch(0.35 0.06 45);"
			>
				<span class="opacity-60 font-semibold">REASON:</span>
				{signal.reason}
			</div>

			<!-- Context Size Visualization -->
			<div class="flex flex-col gap-2">
				<div class="text-[10px] font-semibold opacity-60" style="color: oklch(0.75 0.05 45);">
					CONTEXT SIZE
				</div>

				<!-- Before/After bars -->
				<div class="flex flex-col gap-1.5">
					<!-- Before -->
					<div class="flex items-center gap-2">
						<span class="text-[10px] w-12 text-right opacity-70" style="color: oklch(0.70 0.05 45);">
							Before
						</span>
						<div class="flex-1 h-4 rounded overflow-hidden" style="background: oklch(0.18 0.02 45);">
							<div
								class="h-full rounded"
								style="width: 100%; background: linear-gradient(90deg, oklch(0.55 0.12 45) 0%, oklch(0.50 0.10 40) 100%);"
							></div>
						</div>
						<span class="text-[11px] font-mono w-12" style="color: oklch(0.85 0.08 45);">
							{formatTokens(signal.contextSizeBefore)}
						</span>
					</div>

					<!-- After -->
					<div class="flex items-center gap-2">
						<span class="text-[10px] w-12 text-right opacity-70" style="color: oklch(0.70 0.05 45);">
							After
						</span>
						<div class="flex-1 h-4 rounded overflow-hidden" style="background: oklch(0.18 0.02 45);">
							<div
								class="h-full rounded"
								style="width: {progressPercent}%; background: linear-gradient(90deg, oklch(0.55 0.15 145) 0%, oklch(0.50 0.12 150) 100%);"
							></div>
						</div>
						<span class="text-[11px] font-mono w-12" style="color: oklch(0.85 0.10 145);">
							{formatTokens(signal.estimatedAfter)}
						</span>
					</div>
				</div>
			</div>

			<!-- Items being preserved -->
			{#if signal.preserving && signal.preserving.length > 0}
				<div class="flex flex-col gap-1.5">
					<div class="text-[10px] font-semibold opacity-60" style="color: oklch(0.75 0.05 145);">
						✓ PRESERVING ({signal.preserving.length})
					</div>
					<div class="flex flex-wrap gap-1">
						{#each signal.preserving as item}
							<span
								class="text-[10px] px-1.5 py-0.5 rounded font-mono truncate max-w-[200px]"
								style="background: oklch(0.25 0.06 145); color: oklch(0.85 0.10 145); border: 1px solid oklch(0.40 0.10 145);"
								title={item}
							>
								{item}
							</span>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Status message -->
			<div class="flex items-center gap-2 mt-auto pt-2" style="border-top: 1px solid oklch(0.30 0.04 45);">
				<span class="loading loading-dots loading-xs text-warning"></span>
				<span class="text-[11px] opacity-70" style="color: oklch(0.80 0.05 45);">
					Summarizing context to free up tokens...
				</span>
			</div>
		</div>
	</div>
{/if}
