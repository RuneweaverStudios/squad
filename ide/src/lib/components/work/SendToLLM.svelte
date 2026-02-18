<script lang="ts">
	/**
	 * SendToLLM Component
	 *
	 * A popover component that allows users to send terminal output (or selected text)
	 * to an LLM with custom instructions. Results can be:
	 * 1. Saved to the task's NOTES field
	 * 2. Saved to a new file (opens in Monaco editor drawer)
	 *
	 * Design:
	 * - Hover/click the sparkle button next to copy button
	 * - Popover appears with instruction textarea and submit dropdown
	 * - Submit sends content + instructions to /api/llm/process
	 * - Result routed based on user selection
	 *
	 * Task: squad-a7372 - add send terminal to llm button to sessioncard.svelte
	 */

	import { fade, fly } from 'svelte/transition';
	import { successToast, errorToast } from '$lib/stores/toasts.svelte';
	import { signalNotesUpdate } from '$lib/stores/taskNotesUpdate.svelte';

	interface Props {
		/** The content to process (terminal output) */
		content: string;
		/** Currently selected text (if any) */
		selectedText?: string;
		/** Task ID for saving to notes */
		taskId?: string;
		/** Project for the task */
		project?: string;
		/** Callback when notes are updated */
		onNotesUpdated?: () => void;
		/** Callback when file result is ready (opens editor drawer) */
		onFileResult?: (filename: string, content: string) => void;
		/** Whether the button is disabled */
		disabled?: boolean;
	}

	let {
		content,
		selectedText = '',
		taskId,
		project,
		onNotesUpdated,
		onFileResult,
		disabled = false
	}: Props = $props();

	// State
	let isOpen = $state(false);
	let instructions = $state('');
	let isProcessing = $state(false);
	let showRouteMenu = $state(false);
	let successFlash = $state(false);

	// Refs
	let textareaRef = $state<HTMLTextAreaElement | null>(null);
	let notesButtonRef = $state<HTMLButtonElement | null>(null);
	let fileButtonRef = $state<HTMLButtonElement | null>(null);

	// Derived
	const textToProcess = $derived(selectedText || content);
	const hasTask = $derived(!!taskId);

	// Routes for the result
	type Route = 'notes' | 'file';

	function togglePopover() {
		if (disabled) return;
		isOpen = !isOpen;
		if (!isOpen) {
			showRouteMenu = false;
		} else {
			// Focus textarea when popover opens (after render)
			setTimeout(() => textareaRef?.focus(), 50);
		}
	}

	function closePopover() {
		isOpen = false;
		showRouteMenu = false;
	}

	async function handleSubmit(route: Route) {
		if (!instructions.trim()) {
			errorToast('Please enter instructions for processing');
			return;
		}

		if (!textToProcess.trim()) {
			errorToast('No content to process');
			return;
		}

		isProcessing = true;
		showRouteMenu = false;

		try {
			const response = await fetch('/api/llm/process', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					content: textToProcess,
					instructions: instructions.trim(),
					suggestFilename: route === 'file'
				})
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to process content');
			}

			const result = await response.json();

			if (route === 'notes') {
				await saveToNotes(result.result);
			} else {
				openFileEditor(result.result, result.suggestedFilename);
			}

			// Clear instructions on success
			instructions = '';
			closePopover();
		} catch (err) {
			console.error('[SendToLLM] Error:', err);
			errorToast(err instanceof Error ? err.message : 'Failed to process content');
		} finally {
			isProcessing = false;
		}
	}

	async function saveToNotes(result: string) {
		if (!taskId || !project) {
			errorToast('No task selected - cannot save to notes');
			return;
		}

		try {
			// Fetch current task to get existing notes
			const taskResponse = await fetch(`/api/tasks/${taskId}?project=${project}`);
			if (!taskResponse.ok) {
				throw new Error('Failed to fetch task');
			}
			const taskData = await taskResponse.json();
			const existingNotes = taskData.task?.notes || '';

			// Append new content
			const timestamp = new Date().toISOString().split('T')[0];
			const separator = existingNotes ? '\n\n---\n\n' : '';
			const newNotes = `${existingNotes}${separator}## LLM Analysis (${timestamp})\n\n${result}`;

			// Update task notes
			const updateResponse = await fetch(`/api/tasks/${taskId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project,
					notes: newNotes
				})
			});

			if (!updateResponse.ok) {
				throw new Error('Failed to update task notes');
			}

			successToast('Analysis saved to task notes');

			// Trigger success flash on button
			successFlash = true;
			setTimeout(() => { successFlash = false; }, 1500);

			// Signal notes update for reactive refresh in other components
			signalNotesUpdate(taskId);

			onNotesUpdated?.();
		} catch (err) {
			console.error('[SendToLLM] Failed to save notes:', err);
			throw err;
		}
	}

	function openFileEditor(result: string, suggestedFilename?: string) {
		const filename = suggestedFilename || 'llm-result.md';
		onFileResult?.(filename, result);
		successToast(`Result ready: ${filename}`);
	}

	// Close popover when clicking outside
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.send-to-llm-container')) {
			closePopover();
		}
	}

	// Exported function to open popover from parent (e.g., keyboard shortcut)
	export function open() {
		if (disabled) return;
		if (!isOpen) {
			isOpen = true;
			setTimeout(() => textareaRef?.focus(), 50);
		} else {
			textareaRef?.focus();
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="send-to-llm-container relative">
	<!-- Trigger Button -->
	<button
		type="button"
		class="btn btn-xs btn-ghost {successFlash ? 'notes-saved-flash' : ''}"
		onclick={togglePopover}
		title={disabled ? 'No content to process' : 'Send to LLM for analysis'}
		{disabled}
	>
		{#if isProcessing}
			<span class="loading loading-spinner loading-xs"></span>
		{:else if successFlash}
			<!-- Checkmark icon during success flash -->
			<svg
				class="w-3 h-3 text-success"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M4.5 12.75l6 6 9-13.5"
				/>
			</svg>
		{:else}
			<!-- Sparkle/AI icon -->
			<svg
				class="w-3 h-3"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
				/>
			</svg>
		{/if}
	</button>

	<!-- Popover -->
	{#if isOpen}
		<div
			class="absolute left-0 bottom-full mb-2 z-50"
			role="dialog"
			aria-label="Send to LLM"
			transition:fly={{ y: 10, duration: 150 }}
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.key === 'Escape' && closePopover()}
		>
			<div
				class="card bg-base-300 shadow-xl border border-base-content/10 w-80"
				style="background: oklch(0.18 0.02 250);"
			>
				<div class="card-body p-3 gap-2">
					<!-- Header -->
					<div class="flex items-center justify-between">
						<h3 class="text-sm font-semibold text-base-content/80">Send to LLM</h3>
						<button
							type="button"
							class="btn btn-ghost btn-xs btn-circle"
							onclick={closePopover}
							aria-label="Close"
						>
							<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>

					<!-- Content indicator -->
					<div class="text-xs text-base-content/50 flex items-center gap-1.5">
						{#if selectedText}
							<span class="badge badge-xs badge-info">Selected text</span>
							<span>{selectedText.length} chars</span>
						{:else}
							<span class="badge badge-xs badge-ghost">Full output</span>
							<span>{content.length} chars</span>
						{/if}
					</div>

					<!-- Instructions textarea -->
					<textarea
						bind:this={textareaRef}
						bind:value={instructions}
						placeholder="Enter instructions for the LLM..."
						class="textarea textarea-bordered textarea-sm w-full font-mono text-xs"
						rows="4"
						disabled={isProcessing}
						style="background: oklch(0.14 0.01 250); border-color: oklch(0.25 0.02 250);"
					></textarea>

					<!-- Submit with route dropdown -->
					<div class="relative">
						<div class="flex gap-1">
							<!-- Main submit button -->
							<button
								type="button"
								class="btn btn-sm btn-primary flex-1"
								onclick={() => {
									showRouteMenu = !showRouteMenu;
									if (!showRouteMenu) return;
									// Focus first route option when menu opens
									setTimeout(() => {
										if (hasTask && notesButtonRef) {
											notesButtonRef.focus();
										} else if (fileButtonRef) {
											fileButtonRef.focus();
										}
									}, 50);
								}}
								disabled={isProcessing || !instructions.trim()}
							>
								{#if isProcessing}
									<span class="loading loading-spinner loading-xs"></span>
									Processing...
								{:else}
									Process
									<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
									</svg>
								{/if}
							</button>
						</div>

						<!-- Route dropdown menu -->
						{#if showRouteMenu && !isProcessing}
							<div
								class="absolute left-0 right-0 bottom-full mb-1 z-10"
								transition:fade={{ duration: 100 }}
								onkeydown={(e) => {
									if (e.key === 'Escape') {
										showRouteMenu = false;
									} else if (e.key === 'ArrowDown') {
										e.preventDefault();
										if (document.activeElement === notesButtonRef && fileButtonRef) {
											fileButtonRef.focus();
										}
									} else if (e.key === 'ArrowUp') {
										e.preventDefault();
										if (document.activeElement === fileButtonRef && hasTask && notesButtonRef) {
											notesButtonRef.focus();
										}
									}
								}}
							>
								<ul class="menu bg-base-200 rounded-box shadow-lg border border-base-content/10 p-1">
									{#if hasTask}
										<li>
											<button
												bind:this={notesButtonRef}
												type="button"
												class="text-xs"
												onclick={() => handleSubmit('notes')}
											>
												<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
												</svg>
												Save to task notes
											</button>
										</li>
									{/if}
									<li>
										<button
											bind:this={fileButtonRef}
											type="button"
											class="text-xs"
											onclick={() => handleSubmit('file')}
										>
											<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
											</svg>
											Open as file
										</button>
									</li>
								</ul>
							</div>
						{/if}
					</div>

					<!-- Help text -->
					<p class="text-xs text-base-content/40">
						Examples: "Summarize as markdown", "Extract key findings", "Format as table"
					</p>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Success flash animation for notes saved */
	.notes-saved-flash {
		animation: notes-saved-glow 1.5s ease-out;
	}

	@keyframes notes-saved-glow {
		0% {
			box-shadow: 0 0 0 0 oklch(0.70 0.20 145 / 0.7);
			background-color: oklch(0.70 0.20 145 / 0.3);
		}
		20% {
			box-shadow: 0 0 15px 5px oklch(0.70 0.20 145 / 0.5);
			background-color: oklch(0.70 0.20 145 / 0.4);
		}
		50% {
			box-shadow: 0 0 20px 8px oklch(0.70 0.20 145 / 0.3);
			background-color: oklch(0.70 0.20 145 / 0.2);
		}
		100% {
			box-shadow: 0 0 0 0 oklch(0.70 0.20 145 / 0);
			background-color: transparent;
		}
	}
</style>
