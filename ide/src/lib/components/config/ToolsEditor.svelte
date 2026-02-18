<script lang="ts">
	/**
	 * ToolsEditor Component
	 *
	 * Monaco editor for viewing and editing SQUAD tool files.
	 * Shows file path, type badge, and save button.
	 *
	 * @see ide/src/routes/config/+page.svelte for usage
	 */

	import MonacoWrapper from './MonacoWrapper.svelte';

	interface Props {
		/** Relative path to the tool file (from SQUAD root) */
		toolPath?: string | null;
		/** Display name for the tool */
		displayName?: string;
		/** Tool type for syntax highlighting */
		toolType?: 'bash' | 'js' | 'markdown' | 'unknown';
		/** Called after successful save */
		onSave?: () => void;
	}

	let {
		toolPath = null,
		displayName = '',
		toolType = 'bash',
		onSave = () => {}
	}: Props = $props();

	// State
	let content = $state('');
	let originalContent = $state('');
	let absolutePath = $state<string | null>(null);
	let isLoading = $state(false);
	let isSaving = $state(false);
	let error = $state<string | null>(null);
	let saveSuccess = $state(false);

	// Derived state
	const hasChanges = $derived(content !== originalContent);
	const canSave = $derived(hasChanges && !isSaving && toolPath);

	// Get Monaco language from tool type
	const monacoLanguage = $derived(() => {
		switch (toolType) {
			case 'js':
				return 'javascript';
			case 'markdown':
				return 'markdown';
			case 'bash':
			default:
				return 'shell';
		}
	});

	// Type badge config
	const typeBadges: Record<string, { label: string; color: string }> = {
		bash: { label: 'BASH', color: 'oklch(0.75 0.15 140)' },
		js: { label: 'JS', color: 'oklch(0.75 0.15 80)' },
		markdown: { label: 'MD', color: 'oklch(0.75 0.15 200)' },
		unknown: { label: '?', color: 'oklch(0.5 0 0)' }
	};

	// Load tool content
	async function loadTool() {
		if (!toolPath) {
			content = '';
			originalContent = '';
			absolutePath = null;
			return;
		}

		isLoading = true;
		error = null;

		try {
			const response = await fetch(`/api/tools/content?path=${encodeURIComponent(toolPath)}`);
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || `HTTP ${response.status}`);
			}
			const data = await response.json();
			content = data.content;
			originalContent = data.content;
			absolutePath = data.absolutePath;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load tool';
			content = '';
			originalContent = '';
		} finally {
			isLoading = false;
		}
	}

	// Save tool content
	async function saveTool() {
		if (!canSave) return;

		isSaving = true;
		error = null;
		saveSuccess = false;

		try {
			const response = await fetch(`/api/tools/content?path=${encodeURIComponent(toolPath!)}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ content })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || `HTTP ${response.status}`);
			}

			originalContent = content;
			saveSuccess = true;
			onSave();

			// Clear success message after 3 seconds
			setTimeout(() => {
				saveSuccess = false;
			}, 3000);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to save tool';
		} finally {
			isSaving = false;
		}
	}

	// Discard changes
	function discardChanges() {
		content = originalContent;
	}

	// Handle content change from Monaco
	function handleContentChange(newContent: string) {
		content = newContent;
	}

	// Keyboard shortcut for save (Cmd/Ctrl+S)
	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			saveTool();
		}
	}

	// Load tool when path changes
	$effect(() => {
		if (toolPath) {
			loadTool();
		} else {
			content = '';
			originalContent = '';
			absolutePath = null;
		}
	});
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="tools-editor">
	{#if !toolPath}
		<div class="empty-state">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="empty-icon"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
				/>
			</svg>
			<span>Select a tool to view</span>
		</div>
	{:else}
		<!-- Header -->
		<div class="editor-header">
			<div class="file-info">
				<div class="file-title">
					<h3 class="file-name">{displayName || toolPath}</h3>
					<span
						class="type-badge"
						style="background: {typeBadges[toolType]?.color || 'oklch(0.5 0 0)'}"
					>
						{typeBadges[toolType]?.label || toolType}
					</span>
				</div>
				<span class="file-path" title={absolutePath || toolPath}>{absolutePath || toolPath}</span>
			</div>
			<div class="header-actions">
				{#if error}
					<span class="error-badge">{error}</span>
				{/if}
				{#if saveSuccess}
					<span class="success-badge">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="2"
							stroke="currentColor"
							class="success-icon"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
						</svg>
						Saved
					</span>
				{/if}
				{#if hasChanges}
					<span class="unsaved-badge">Unsaved changes</span>
					<button class="discard-btn" onclick={discardChanges} title="Discard changes">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="discard-icon"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
							/>
						</svg>
					</button>
				{/if}
				<button class="save-btn" onclick={saveTool} disabled={!canSave}>
					{#if isSaving}
						<div class="save-spinner"></div>
						Saving...
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="save-icon"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
							/>
						</svg>
						Save
					{/if}
				</button>
			</div>
		</div>

		<!-- Editor -->
		<div class="editor-container">
			{#if isLoading}
				<div class="loading-state">
					<div class="loading-spinner"></div>
					<span>Loading tool...</span>
				</div>
			{:else}
				<MonacoWrapper
					bind:value={content}
					language={monacoLanguage()}
					onchange={handleContentChange}
				/>
			{/if}
		</div>
	{/if}
</div>

<style>
	.tools-editor {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 400px;
		background: oklch(0.14 0.01 250);
		border: 1px solid oklch(0.22 0.02 250);
		border-radius: 12px;
		overflow: hidden;
	}

	/* Empty state */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		flex: 1;
		color: oklch(0.50 0.02 250);
		font-size: 0.85rem;
	}

	.empty-icon {
		width: 48px;
		height: 48px;
		color: oklch(0.35 0.02 250);
	}

	/* Header */
	.editor-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem;
		background: oklch(0.16 0.01 250);
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.file-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
		flex: 1;
	}

	.file-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.file-name {
		font-size: 1rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
		font-family: ui-monospace, monospace;
	}

	.type-badge {
		font-size: 0.6rem;
		font-weight: 600;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		color: oklch(0.15 0 0);
		flex-shrink: 0;
	}

	.file-path {
		font-size: 0.7rem;
		color: oklch(0.50 0.02 250);
		font-family: ui-monospace, monospace;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-shrink: 0;
	}

	.error-badge {
		font-size: 0.7rem;
		font-weight: 500;
		padding: 0.25rem 0.5rem;
		background: oklch(0.30 0.10 25);
		border: 1px solid oklch(0.45 0.12 25);
		border-radius: 4px;
		color: oklch(0.85 0.10 25);
	}

	.success-badge {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.7rem;
		font-weight: 500;
		padding: 0.25rem 0.5rem;
		background: oklch(0.30 0.10 145);
		border: 1px solid oklch(0.45 0.12 145);
		border-radius: 4px;
		color: oklch(0.85 0.10 145);
	}

	.success-icon {
		width: 14px;
		height: 14px;
	}

	.unsaved-badge {
		font-size: 0.7rem;
		font-weight: 500;
		padding: 0.25rem 0.5rem;
		background: oklch(0.30 0.10 85);
		border: 1px solid oklch(0.45 0.12 85);
		border-radius: 4px;
		color: oklch(0.85 0.10 85);
	}

	.discard-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: oklch(0.25 0.05 25);
		border: 1px solid oklch(0.35 0.08 25);
		border-radius: 6px;
		color: oklch(0.75 0.10 25);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.discard-btn:hover {
		background: oklch(0.30 0.08 25);
		color: oklch(0.85 0.10 25);
	}

	.discard-icon {
		width: 16px;
		height: 16px;
	}

	.save-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		font-size: 0.8rem;
		font-weight: 500;
		background: oklch(0.35 0.12 200);
		border: 1px solid oklch(0.45 0.14 200);
		border-radius: 6px;
		color: oklch(0.95 0.02 200);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.save-btn:hover:not(:disabled) {
		background: oklch(0.40 0.14 200);
	}

	.save-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.save-icon {
		width: 16px;
		height: 16px;
	}

	.save-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid oklch(0.60 0.02 200);
		border-top-color: oklch(0.95 0.02 200);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	/* Editor container */
	.editor-container {
		flex: 1;
		display: flex;
		position: relative;
		min-height: 300px;
	}

	.loading-state {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		background: oklch(0.18 0.01 250);
		color: oklch(0.55 0.02 250);
		font-size: 0.85rem;
	}

	.loading-spinner {
		width: 28px;
		height: 28px;
		border: 3px solid oklch(0.30 0.02 250);
		border-top-color: oklch(0.65 0.15 200);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.editor-header {
			flex-direction: column;
		}

		.header-actions {
			width: 100%;
			justify-content: flex-end;
		}
	}
</style>
