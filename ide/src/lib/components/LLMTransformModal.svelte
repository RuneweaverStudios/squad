<script lang="ts">
	/**
	 * LLMTransformModal
	 *
	 * A modal for transforming selected text through an LLM.
	 * Used by Monaco editor "Send to LLM" context menu action.
	 *
	 * Flow:
	 * 1. User selects text in Monaco editor
	 * 2. Right-clicks and chooses "Send to LLM" (or presses Alt+L)
	 * 3. This modal opens with the selected text
	 * 4. User enters instructions
	 * 5. LLM processes and returns transformed text
	 * 6. User can replace selection or copy result
	 */

	import { successToast, errorToast } from '$lib/stores/toasts.svelte';
	import FilePathPicker from '$lib/components/files/FilePathPicker.svelte';

	interface Props {
		/** Whether the modal is open */
		isOpen: boolean;
		/** The selected text to transform */
		selectedText: string;
		/** Project name for file saves and sessions */
		project?: string;
		/** Base path for file saves (directory containing active file) */
		basePath?: string;
		/** Project root path for path display truncation */
		projectPath?: string;
		/** Callback when modal closes */
		onClose: () => void;
		/** Callback when user wants to replace selection with result */
		onReplace?: (newText: string) => void;
		/** Callback when user wants to insert result after selection */
		onInsert?: (newText: string) => void;
		/** Callback when user wants to save result to a file */
		onSaveToFile?: (filename: string, content: string) => void;
	}

	let {
		isOpen = $bindable(false),
		selectedText,
		project = '',
		basePath = '',
		projectPath = '',
		onClose,
		onReplace,
		onInsert,
		onSaveToFile
	}: Props = $props();

	// State
	let instructions = $state('');
	let isProcessing = $state(false);
	let result = $state<string | null>(null);
	let textareaRef = $state<HTMLTextAreaElement | null>(null);
	let showFilenameInput = $state(false);
	let filename = $state('llm-result.md');

	// Focus textarea when modal opens
	$effect(() => {
		if (isOpen && textareaRef) {
			setTimeout(() => textareaRef?.focus(), 100);
		}
	});

	// Reset state when modal opens
	$effect(() => {
		if (isOpen) {
			result = null;
			instructions = '';
			showFilenameInput = false;
			filename = 'llm-result.md';
		}
	});

	async function handleSubmit() {
		if (!instructions.trim()) {
			errorToast('Please enter instructions for processing');
			return;
		}

		if (!selectedText.trim()) {
			errorToast('No text to process');
			return;
		}

		isProcessing = true;

		try {
			const response = await fetch('/api/llm/process', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					content: selectedText,
					instructions: instructions.trim()
				})
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to process content');
			}

			const data = await response.json();
			result = data.result;
		} catch (err) {
			console.error('[LLMTransformModal] Error:', err);
			errorToast(err instanceof Error ? err.message : 'Failed to process content');
		} finally {
			isProcessing = false;
		}
	}

	function handleReplace() {
		if (result && onReplace) {
			onReplace(result);
			successToast('Text replaced');
			handleClose();
		}
	}

	function handleInsert() {
		if (result && onInsert) {
			onInsert(result);
			successToast('Text inserted');
			handleClose();
		}
	}

	async function handleCopy() {
		if (result) {
			await navigator.clipboard.writeText(result);
			successToast('Copied to clipboard');
		}
	}

	function handleSaveToFile(fullPath?: string, fname?: string) {
		const finalFilename = fname || filename;
		if (result && onSaveToFile && finalFilename.trim()) {
			onSaveToFile(finalFilename.trim(), result);
			successToast(`Opened ${finalFilename.trim()} — save to write to disk`);
			showFilenameInput = false;
			handleClose();
		}
	}

	function handleClose() {
		isOpen = false;
		result = null;
		instructions = '';
		onClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			handleClose();
		} else if (e.key === 'Enter' && e.ctrlKey && !result) {
			handleSubmit();
		}
	}
</script>

{#if isOpen}
	<!-- Modal backdrop -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		onclick={handleClose}
		onkeydown={handleKeydown}
		role="dialog"
		aria-modal="true"
		aria-labelledby="llm-transform-title"
	>
		<!-- Modal content -->
		<div
			class="bg-base-300 rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col relative"
			style="background: oklch(0.18 0.02 250);"
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Header -->
			<div class="flex items-center justify-between px-4 py-3 border-b border-base-content/10">
				<h3 id="llm-transform-title" class="text-base font-semibold text-base-content/90">
					Send to LLM
				</h3>
				<button
					type="button"
					class="btn btn-ghost btn-sm btn-circle"
					onclick={handleClose}
					aria-label="Close"
				>
					<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Body -->
			<div class="flex-1 overflow-auto p-4 space-y-4">
				<!-- Selected text preview -->
				<div>
					<label class="label py-1">
						<span class="label-text text-xs text-base-content/60">Selected Text</span>
						<span class="label-text-alt text-xs text-base-content/40">{selectedText.length} chars</span>
					</label>
					<div
						class="font-mono text-xs p-3 rounded border border-base-content/10 max-h-32 overflow-auto whitespace-pre-wrap"
						style="background: oklch(0.14 0.01 250);"
					>
						{selectedText.slice(0, 500)}{selectedText.length > 500 ? '...' : ''}
					</div>
				</div>

				<!-- Instructions input -->
				<div>
					<label class="label py-1">
						<span class="label-text text-xs text-base-content/60">Instructions</span>
						<span class="label-text-alt text-xs text-base-content/40">Ctrl+Enter to submit</span>
					</label>
					<textarea
						bind:this={textareaRef}
						bind:value={instructions}
						placeholder="Enter instructions for the LLM..."
						class="textarea textarea-bordered w-full font-mono text-sm"
						rows="3"
						disabled={isProcessing || !!result}
						style="background: oklch(0.14 0.01 250); border-color: oklch(0.25 0.02 250);"
					></textarea>
				</div>

				<!-- Result display (when available) -->
				{#if result}
					<div>
						<label class="label py-1">
							<span class="label-text text-xs text-success">Result</span>
							<span class="label-text-alt text-xs text-base-content/40">{result.length} chars</span>
						</label>
						<div
							class="font-mono text-xs p-3 rounded border border-success/30 max-h-48 overflow-auto whitespace-pre-wrap"
							style="background: oklch(0.14 0.01 250);"
						>
							{result}
						</div>
					</div>
				{/if}
			</div>

			<!-- Save file picker overlay -->
			{#if showFilenameInput}
				<div class="absolute inset-0 bg-black/50 flex items-center justify-center z-10 rounded-lg">
					<div class="w-80">
						<FilePathPicker
							{basePath}
							{projectPath}
							{project}
							bind:filename
							type="file"
							placeholder="filename.md or path/to/file.md"
							confirmText="Save"
							onConfirm={handleSaveToFile}
							onCancel={() => showFilenameInput = false}
						/>
					</div>
				</div>
			{/if}

			<!-- Footer -->
			<div class="px-4 py-3 border-t border-base-content/10 flex items-center justify-between gap-2">
				{#if result}
					<!-- Left side actions -->
					<div class="flex items-center gap-1">
						<button type="button" class="btn btn-sm btn-ghost" onclick={() => { result = null; }} title="Process again with different instructions">
							<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
							</svg>
							Try Again
						</button>
					</div>

					<!-- Right side actions -->
					<div class="flex items-center gap-1">
						<button type="button" class="btn btn-sm btn-ghost" onclick={handleCopy} title="Copy to clipboard">
							<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
							</svg>
							Copy
						</button>
						{#if onSaveToFile}
							<button type="button" class="btn btn-sm btn-ghost" onclick={() => showFilenameInput = true} title="Save to file">
								<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
								</svg>
								Save File
							</button>
						{/if}
						{#if onInsert}
							<button type="button" class="btn btn-sm btn-info" onclick={handleInsert} title="Insert result after selection">
								<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
								</svg>
								Insert After
							</button>
						{/if}
						{#if onReplace}
							<button type="button" class="btn btn-sm btn-primary" onclick={handleReplace} title="Replace selected text with result">
								<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
								</svg>
								Replace
							</button>
						{/if}
					</div>
				{:else}
					<!-- Submit buttons -->
					<div></div>
					<div class="flex items-center gap-2">
						<button type="button" class="btn btn-sm btn-ghost" onclick={handleClose}>
							Cancel
						</button>
						<button
							type="button"
							class="btn btn-sm btn-primary"
							onclick={handleSubmit}
							disabled={isProcessing || !instructions.trim()}
						>
							{#if isProcessing}
								<span class="loading loading-spinner loading-xs"></span>
								Processing...
							{:else}
								<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
								</svg>
								Process
							{/if}
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
