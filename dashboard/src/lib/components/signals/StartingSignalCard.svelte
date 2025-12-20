<script lang="ts">
	/**
	 * StartingSignalCard Component
	 *
	 * Renders a starting signal showing agent initialization context:
	 * agent name, project, session ID, model, git branch/status, and tools.
	 *
	 * @see shared/rich-signals-plan.md for design documentation
	 * @see src/lib/types/richSignals.ts for type definitions
	 */

	import type { StartingSignal } from '$lib/types/richSignals';

	interface Props {
		/** The rich starting signal data */
		signal: StartingSignal;
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

	// Copy session ID to clipboard
	let copied = $state(false);
	async function copySessionId() {
		try {
			await navigator.clipboard.writeText(signal.sessionId);
			copied = true;
			setTimeout(() => { copied = false; }, 1500);
		} catch (e) {
			console.error('Failed to copy session ID:', e);
		}
	}

	// Model badge styling - using DaisyUI semantic color classes
	const modelBadge = $derived.by(() => {
		const model = signal.model?.toLowerCase() || '';
		if (model.includes('opus')) {
			return { label: signal.model, colorClass: 'bg-secondary text-secondary-content', icon: '🎭' };
		}
		if (model.includes('sonnet')) {
			return { label: signal.model, colorClass: 'bg-info text-info-content', icon: '🎵' };
		}
		if (model.includes('haiku')) {
			return { label: signal.model, colorClass: 'bg-success text-success-content', icon: '🌸' };
		}
		return { label: signal.model || 'Unknown', colorClass: 'bg-base-300 text-base-content', icon: '🤖' };
	});

	// Git status badge - using DaisyUI semantic color classes
	const gitStatusBadge = $derived.by(() => {
		if (signal.gitStatus === 'clean') {
			return { label: 'CLEAN', colorClass: 'bg-success/20 text-success border-success/40', icon: '✓' };
		}
		return { label: 'DIRTY', colorClass: 'bg-warning/20 text-warning border-warning/40', icon: '●' };
	});

	// Format session ID for display (truncate middle)
	function formatSessionId(id: string): string {
		if (!id || id.length <= 16) return id;
		return `${id.slice(0, 8)}...${id.slice(-8)}`;
	}

	// Tools expanded state
	let toolsExpanded = $state(false);
</script>

{#if compact}
	<!-- Compact mode: minimal card for timeline/inline display -->
	<div
		class="rounded-lg px-3 py-2 flex items-center gap-3 bg-info/10 border border-info/30 {className}"
	>
		<!-- Status indicator -->
		<div class="flex-shrink-0">
			<span class="loading loading-spinner loading-xs text-info"></span>
		</div>

		<!-- Agent info -->
		<div class="flex-1 min-w-0 flex items-center gap-2">
			<span class="text-sm font-semibold text-info">
				{signal.agentName}
			</span>
			<span class="text-xs opacity-60 text-base-content/60">
				starting...
			</span>
		</div>

		<!-- Model badge -->
		<span
			class="text-[10px] px-1.5 py-0.5 rounded font-mono flex-shrink-0 {modelBadge.colorClass}"
		>
			{modelBadge.icon} {modelBadge.label}
		</span>
	</div>
{:else}
	<!-- Full mode: detailed starting signal card -->
	<!-- Card sizes based on content, parent container handles max-height and scrolling -->
	<!-- overflow-hidden clips any nested content that might overflow -->
	<div
		class="rounded-lg overflow-hidden flex flex-col bg-info/10 border border-info/30 {className}"
	>
		<!-- Header -->
		<div
			class="px-3 py-2 flex items-center justify-between gap-2 flex-shrink-0 bg-info/20 border-b border-info/20"
		>
			<div class="flex items-center gap-2">
				<!-- Starting indicator -->
				<span class="loading loading-spinner loading-xs text-info"></span>

				<!-- Agent name -->
				<span class="font-semibold text-sm text-info">
					{signal.agentName}
				</span>

				<!-- Project badge -->
				<span
					class="text-[10px] px-1.5 py-0.5 rounded font-mono bg-success/20 text-success border border-success/30"
				>
					{signal.project}
				</span>
			</div>

			<!-- Model badge -->
			<span
				class="text-[10px] px-1.5 py-0.5 rounded font-mono {modelBadge.colorClass}"
			>
				{modelBadge.icon} {modelBadge.label}
			</span>
		</div>

		<!-- Body -->
		<div class="p-3 flex flex-col gap-3">
			<!-- Session ID (copyable) -->
			<div class="flex items-center gap-2">
				<span class="text-[10px] font-semibold opacity-60 text-base-content/60">
					SESSION
				</span>
				<button
					type="button"
					onclick={copySessionId}
					class="text-[11px] font-mono px-2 py-0.5 rounded hover:opacity-80 transition-opacity cursor-pointer flex items-center gap-1 bg-base-300 text-base-content border border-base-content/20"
					title="Click to copy full session ID"
				>
					{formatSessionId(signal.sessionId)}
					{#if copied}
						<svg class="w-3 h-3 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
					{:else}
						<svg class="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
						</svg>
					{/if}
				</button>
			</div>

			<!-- Git Status -->
			<div
				class="flex items-center justify-between px-2 py-1.5 rounded bg-base-300 border border-base-content/10"
			>
				<div class="flex items-center gap-2">
					<svg class="w-4 h-4 opacity-60 text-base-content/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
					</svg>
					<span class="text-[11px] font-mono text-base-content">
						{signal.gitBranch}
					</span>
				</div>
				<span
					class="text-[10px] px-1.5 py-0.5 rounded font-bold border {gitStatusBadge.colorClass}"
				>
					{gitStatusBadge.icon} {gitStatusBadge.label}
				</span>
			</div>

			<!-- Uncommitted files (if dirty) -->
			{#if signal.gitStatus === 'dirty' && signal.uncommittedFiles && signal.uncommittedFiles.length > 0}
				<div class="flex flex-col gap-1.5">
					<div class="text-[10px] font-semibold opacity-60 text-warning">
						⚠️ UNCOMMITTED ({signal.uncommittedFiles.length})
					</div>
					<div class="flex flex-wrap gap-1">
						{#each signal.uncommittedFiles.slice(0, 5) as file}
							<span
								class="text-[10px] px-1.5 py-0.5 rounded font-mono truncate max-w-[200px] bg-warning/20 text-warning border border-warning/40"
								title={file}
							>
								{file}
							</span>
						{/each}
						{#if signal.uncommittedFiles.length > 5}
							<span class="text-[10px] opacity-60 text-warning/70">
								+{signal.uncommittedFiles.length - 5} more
							</span>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Tools (collapsible) -->
			{#if signal.tools && signal.tools.length > 0}
				<div
					class="rounded overflow-hidden bg-base-300 border border-base-content/10"
				>
					<button
						type="button"
						onclick={() => toolsExpanded = !toolsExpanded}
						class="w-full px-2 py-1.5 flex items-center justify-between text-left hover:opacity-90 transition-opacity bg-base-200"
					>
						<div class="flex items-center gap-1.5">
							<span class="text-[10px] font-bold text-base-content">
								🔧 TOOLS ({signal.tools.length})
							</span>
						</div>
						<svg
							class="w-3.5 h-3.5 transition-transform duration-200 text-base-content/60"
							class:rotate-180={toolsExpanded}
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
						</svg>
					</button>
					{#if toolsExpanded}
						<div class="px-2 py-2 flex flex-wrap gap-1">
							{#each signal.tools as tool}
								<span
									class="text-[10px] px-1.5 py-0.5 rounded font-mono bg-base-content/10 text-base-content border border-base-content/10"
								>
									{tool}
								</span>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Status message -->
			<div class="flex items-center gap-2 mt-auto pt-2 border-t border-base-content/10">
				<span class="loading loading-dots loading-xs text-info"></span>
				<span class="text-[11px] opacity-70 text-base-content/70">
					Initializing session...
				</span>
			</div>
		</div>
	</div>
{/if}
