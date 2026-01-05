<script lang="ts">
	/**
	 * NeedsInputSignalCard Component
	 *
	 * Renders a rich needs_input signal with interactive UI for user response.
	 * Displays question, context, options (if choice type), text input (if text type),
	 * relevant code, file links, and impact information.
	 *
	 * @see shared/rich-signals-plan.md for design documentation
	 * @see src/lib/types/richSignals.ts for type definitions
	 */

	import type { NeedsInputSignal, QuestionOption } from '$lib/types/richSignals';
	import { openInFilesPage } from '$lib/utils/fileLinks';

	interface Props {
		/** The rich needs_input signal data */
		signal: NeedsInputSignal;
		/** Project name for /files page navigation (e.g., 'jat', 'chimaro') */
		projectName?: string;
		/** Callback when user selects an option */
		onSelectOption?: (optionId: string) => void;
		/** Callback when user submits text input */
		onSubmitText?: (text: string) => void;
		/** Callback when user clicks a file link */
		onFileClick?: (filePath: string) => void;
		/** Callback when task ID is clicked */
		onTaskClick?: (taskId: string) => void;
		/** Whether input is being submitted */
		submitting?: boolean;
		/** Whether to show in compact mode (for inline/timeline display) */
		compact?: boolean;
		/** Additional CSS class */
		class?: string;
	}

	let {
		signal,
		projectName = 'jat',
		onSelectOption,
		onSubmitText,
		onFileClick,
		onTaskClick,
		submitting = false,
		compact = false,
		class: className = ''
	}: Props = $props();

	// Local state for text input
	let textInputValue = $state('');
	let selectedOptions = $state<Set<string>>(new Set());

	// Question type determines the input UI
	const isChoiceQuestion = $derived(
		signal.questionType === 'choice' && signal.options && signal.options.length > 0
	);
	const isTextQuestion = $derived(signal.questionType === 'text');
	const isApprovalQuestion = $derived(signal.questionType === 'approval');
	const isClarificationQuestion = $derived(signal.questionType === 'clarification');

	// Handle option selection
	function handleOptionClick(option: QuestionOption, index: number) {
		if (submitting) return;

		if (onSelectOption) {
			// Use option.id if available, otherwise use index+1 (1-based for user-facing)
			onSelectOption(option.id ?? String(index + 1));
		}
	}

	// Handle text submission
	function handleTextSubmit() {
		if (submitting || !textInputValue.trim()) return;

		if (onSubmitText) {
			onSubmitText(textInputValue.trim());
			textInputValue = '';
		}
	}

	// Handle file click - opens in JAT /files page by default
	function handleFileClick(filePath: string) {
		if (onFileClick) {
			onFileClick(filePath);
		} else {
			// Default: open in JAT /files page
			openInFilesPage(filePath, projectName);
		}
	}

	// Get tooltip for file link
	function getFileTooltip(filePath: string): string {
		return `Open ${filePath} in /files`;
	}

	// Get question type badge info - using DaisyUI semantic color classes
	const questionTypeBadge = $derived.by(() => {
		switch (signal.questionType) {
			case 'choice':
				return { label: 'CHOICE', colorClass: 'bg-primary text-primary-content', icon: '🔘' };
			case 'text':
				return { label: 'TEXT', colorClass: 'bg-info text-info-content', icon: '✏️' };
			case 'approval':
				return { label: 'APPROVAL', colorClass: 'bg-success text-success-content', icon: '✅' };
			case 'clarification':
				return { label: 'CLARIFY', colorClass: 'bg-warning text-warning-content', icon: '❓' };
			default:
				return { label: 'INPUT', colorClass: 'bg-secondary text-secondary-content', icon: '💬' };
		}
	});

	// Format timeout display
	const timeoutDisplay = $derived.by(() => {
		if (!signal.timeoutMinutes) return null;
		if (signal.timeoutMinutes >= 60) {
			const hours = Math.floor(signal.timeoutMinutes / 60);
			const mins = signal.timeoutMinutes % 60;
			return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
		}
		return `${signal.timeoutMinutes}m`;
	});
</script>

<!-- Card sizes based on content, parent container handles max-height and scrolling -->
<!-- overflow-hidden clips any nested content that might overflow -->
<div
	class="rounded-lg overflow-hidden flex flex-col bg-secondary/10 border border-secondary/30 {className}"
>
	<!-- Header - flex-shrink-0 ensures it doesn't shrink when body scrolls -->
	<div
		class="px-3 py-2 flex items-center justify-between gap-2 flex-shrink-0 bg-secondary/20 border-b border-secondary/20"
	>
		<div class="flex items-center gap-2">
			<!-- Question type badge -->
			<span
				class="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold {questionTypeBadge.colorClass}"
			>
				{questionTypeBadge.icon} {questionTypeBadge.label}
			</span>

			<!-- Task reference -->
			{#if signal.taskId}
				<button
					type="button"
					class="text-[10px] px-1.5 py-0.5 rounded font-mono cursor-pointer hover:opacity-80 transition-opacity bg-base-300 text-base-content border border-base-content/20"
					onclick={() => onTaskClick?.(signal.taskId)}
					title="View task {signal.taskId}"
				>
					{signal.taskId}
				</button>
			{/if}
		</div>

		<!-- Timeout indicator -->
		{#if timeoutDisplay}
			<div
				class="flex items-center gap-1 text-[10px] text-warning"
				title={signal.timeoutAction || 'Will proceed automatically after timeout'}
			>
				<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span>{timeoutDisplay}</span>
			</div>
		{/if}
	</div>

	<!-- Body -->
	<div class="p-3 flex flex-col gap-3">
		<!-- Question -->
		<div class="flex flex-col gap-1">
			<div class="text-sm font-semibold text-secondary-content">
				{signal.question}
			</div>
			{#if signal.taskTitle}
				<div class="text-[11px] opacity-70 text-base-content/70">
					Task: {signal.taskTitle}
				</div>
			{/if}
		</div>

		<!-- Context -->
		{#if signal.context}
			<div
				class="text-xs p-2 rounded bg-base-300 text-base-content"
			>
				<div class="text-[10px] font-semibold mb-1 opacity-60">CONTEXT</div>
				{signal.context}
			</div>
		{/if}

		<!-- Relevant Code (syntax highlighted) -->
		{#if signal.relevantCode}
			<div
				class="rounded overflow-hidden bg-base-300 border border-base-content/10"
			>
				<div
					class="px-2 py-1 text-[10px] font-semibold bg-base-200 text-base-content/70 border-b border-base-content/10"
				>
					📄 RELATED CODE
				</div>
				<pre
					class="p-2 text-[11px] overflow-x-auto text-base-content font-mono">{signal.relevantCode}</pre>
			</div>
		{/if}

		<!-- Relevant Files -->
		{#if signal.relevantFiles && signal.relevantFiles.length > 0}
			<div class="flex flex-col gap-1">
				<div class="text-[10px] font-semibold opacity-60 text-base-content/60">
					RELATED FILES
				</div>
				<div class="flex flex-wrap gap-1">
					{#each signal.relevantFiles as file}
						<button
							type="button"
							onclick={() => handleFileClick(file)}
							class="text-[11px] px-2 py-0.5 rounded hover:opacity-80 transition-opacity cursor-pointer flex items-center gap-1 bg-info/20 text-info border border-info/30"
							title={getFileTooltip(file)}
						>
							<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
							</svg>
							{file}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Options (for choice questions) -->
		{#if isChoiceQuestion && signal.options}
			<div class="flex flex-col gap-2">
				<div class="text-[10px] font-semibold opacity-60 text-base-content/60">
					SELECT AN OPTION
				</div>
				<div class="flex flex-col gap-1.5">
					{#each signal.options as option, index (option.id ?? `option-${index}`)}
						<button
							type="button"
							onclick={() => handleOptionClick(option, index)}
							disabled={submitting}
							class="text-left p-2.5 rounded transition-all {option.recommended
								? 'bg-success/20 border border-success/40'
								: 'bg-base-300 border border-base-content/20'}"
							class:opacity-50={submitting}
						>
							<div class="flex items-start gap-2">
								<!-- Option indicator -->
								<span
									class="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 {option.recommended
										? 'bg-success text-success-content'
										: 'bg-base-content/30 text-base-content'}"
								>
									{#if option.recommended}
										<svg
											class="w-3 h-3"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2.5"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M5 13l4 4L19 7"
											/>
										</svg>
									{:else}
										<span class="text-[10px]">○</span>
									{/if}
								</span>

								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2">
										<span
											class="text-xs font-semibold {option.recommended
												? 'text-success'
												: 'text-base-content'}"
										>
											{option.label}
										</span>
										{#if option.recommended}
											<span
												class="text-[9px] px-1 py-0.5 rounded font-bold bg-success text-success-content"
											>
												RECOMMENDED
											</span>
										{/if}
									</div>
									{#if option.description}
										<div
											class="text-[11px] mt-0.5 opacity-80 text-base-content/80"
										>
											{option.description}
										</div>
									{/if}
									{#if option.tradeoffs}
										<div
											class="text-[10px] mt-1 italic opacity-60 text-warning"
										>
											⚖️ {option.tradeoffs}
										</div>
									{/if}
								</div>
							</div>
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Text Input (for text/clarification questions) -->
		{#if isTextQuestion || isClarificationQuestion}
			<div class="flex flex-col gap-2">
				<div class="text-[10px] font-semibold opacity-60 text-base-content/60">
					YOUR RESPONSE
				</div>
				<div class="flex gap-2">
					<input
						type="text"
						bind:value={textInputValue}
						placeholder="Type your response..."
						class="input input-sm flex-1 text-xs bg-base-300 border-secondary/40 text-base-content"
						onkeydown={(e) => {
							if (e.key === 'Enter' && textInputValue.trim()) {
								handleTextSubmit();
							}
						}}
						disabled={submitting}
					/>
					<button
						type="button"
						onclick={handleTextSubmit}
						disabled={submitting || !textInputValue.trim()}
						class="btn btn-sm btn-primary gap-1"
					>
						{#if submitting}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
							<svg
								class="w-3.5 h-3.5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
								/>
							</svg>
						{/if}
						Send
					</button>
				</div>
			</div>
		{/if}

		<!-- Approval Buttons -->
		{#if isApprovalQuestion}
			<div class="flex gap-2">
				<button
					type="button"
					onclick={() => onSelectOption?.('approve')}
					disabled={submitting}
					class="btn btn-sm btn-success flex-1 gap-1"
				>
					{#if submitting}
						<span class="loading loading-spinner loading-xs"></span>
					{:else}
						<svg
							class="w-4 h-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
					{/if}
					Approve
				</button>
				<button
					type="button"
					onclick={() => onSelectOption?.('reject')}
					disabled={submitting}
					class="btn btn-sm btn-error flex-1 gap-1"
				>
					<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
					Reject
				</button>
			</div>
		{/if}

		<!-- Impact Warning -->
		{#if signal.impact}
			<div
				class="flex items-start gap-2 p-2 rounded bg-warning/20 border border-warning/50"
			>
				<svg
					class="w-4 h-4 flex-shrink-0 mt-0.5 text-warning"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
					/>
				</svg>
				<div class="flex-1 min-w-0">
					<div class="text-[10px] font-bold mb-0.5 text-warning">IMPACT</div>
					<div class="text-[11px] text-warning-content">
						{signal.impact}
					</div>
				</div>
			</div>
		{/if}

		<!-- Blocking Items -->
		{#if signal.blocking && signal.blocking.length > 0}
			<div class="flex flex-col gap-1">
				<div class="text-[10px] font-semibold text-error">
					⛔ BLOCKED UNTIL ANSWERED
				</div>
				<div class="flex flex-wrap gap-1">
					{#each signal.blocking as item}
						<span
							class="text-[10px] px-1.5 py-0.5 rounded bg-error/30 text-error border border-error/50"
						>
							{item}
						</span>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Timeout Action -->
		{#if signal.timeoutAction && signal.timeoutMinutes}
			<div
				class="text-[10px] p-1.5 rounded opacity-70 bg-warning/20 text-warning"
			>
				⏰ <strong>Auto-action:</strong>
				{signal.timeoutAction}
			</div>
		{/if}
	</div>
</div>
