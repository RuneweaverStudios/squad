<script lang="ts">
	import { onDestroy } from 'svelte';
	import { slide } from 'svelte/transition';
	import MonacoWrapper from '$lib/components/config/MonacoWrapper.svelte';
	import MarkdownPreview from '$lib/components/files/MarkdownPreview.svelte';
	import { openTaskDrawer } from '$lib/stores/drawerStore';

	// Props
	let {
		projectName,
		notes = '',
		isCollapsed = false,
		projectColor = 'oklch(0.70 0.15 200)'
	}: {
		projectName: string;
		notes?: string;
		isCollapsed?: boolean;
		projectColor?: string;
	} = $props();

	// Internal collapse state (not bound to parent)
	let internalCollapsed = $state(isCollapsed);

	// State
	let localNotes = $state('');
	let isSaving = $state(false);
	let isDirty = $state(false);
	let saveError = $state<string | null>(null);
	let saveTimeout: ReturnType<typeof setTimeout> | null = null;
	let copySuccess = $state(false);
	let showPreview = $state(false);
	let monacoRef: { focus: () => void; focusEnd: () => void; layout: () => void; getSelection: () => string; deleteSelection: () => boolean } | undefined;

	// Auto-size constants
	const MIN_HEIGHT = 100;
	const LINE_HEIGHT_ESTIMATE = 20; // Approximate pixels per line

	// Calculate height based on content
	let editorHeight = $derived.by(() => {
		// Empty notes get minimum height
		if (!localNotes || localNotes.trim() === '') {
			return MIN_HEIGHT;
		}

		const lineCount = localNotes.split('\n').length;
		const estimatedHeight = lineCount * LINE_HEIGHT_ESTIMATE + 40; // 40px padding

		// Clamp between MIN_HEIGHT and 70vh (calculated at render time via CSS)
		return Math.max(MIN_HEIGHT, estimatedHeight);
	});

	// Track dirty state - compare to originalNotes which is set on load
	let originalNotes = $state('');

	// Track which project we've synced to avoid overwriting user edits
	let syncedProjectName = $state('');

	// Sync notes from props to local state ONLY when project changes
	$effect(() => {
		if (projectName !== syncedProjectName) {
			syncedProjectName = projectName;
			localNotes = notes;
			originalNotes = notes;
			isDirty = false;
		}
	});

	// Track dirty state
	$effect(() => {
		isDirty = localNotes !== originalNotes;
	});

	// Trigger Monaco layout when height changes
	$effect(() => {
		// Access editorHeight to create dependency
		const _ = editorHeight;
		setTimeout(() => monacoRef?.layout(), 0);
	});

	// Auto-save with debounce
	function handleNotesChange(newValue: string) {
		localNotes = newValue;
		saveError = null;

		// Cancel previous timeout
		if (saveTimeout) {
			clearTimeout(saveTimeout);
		}

		// Debounce save
		saveTimeout = setTimeout(() => {
			saveNotes();
		}, 1000);
	}

	// Save notes to API
	async function saveNotes() {
		if (!projectName || localNotes === originalNotes) return;

		isSaving = true;
		saveError = null;

		try {
			const response = await fetch('/api/projects', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project: projectName,
					notes: localNotes
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to save notes');
			}

			// Update the original notes to mark as clean
			originalNotes = localNotes;
			isDirty = false;
		} catch (error) {
			saveError = error instanceof Error ? error.message : 'Failed to save';
			console.error('Failed to save project notes:', error);
		} finally {
			isSaving = false;
		}
	}

	// Copy notes to clipboard
	async function copyNotes() {
		if (!localNotes) return;

		try {
			await navigator.clipboard.writeText(localNotes);
			copySuccess = true;
			setTimeout(() => {
				copySuccess = false;
			}, 2000);
		} catch (error) {
			console.error('Failed to copy notes:', error);
		}
	}

	// Download notes as markdown file
	function downloadNotes() {
		if (!localNotes) return;

		const blob = new Blob([localNotes], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${projectName}-notes.md`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	// Create task from notes (selection or full content)
	function createTaskFromNotes() {
		// Get selection if any, otherwise use full notes
		const selection = monacoRef?.getSelection() || '';
		const hasSelection = selection.trim().length > 0;
		const text = hasSelection ? selection.trim() : localNotes.trim();

		if (!text) return;

		// Open task drawer with the text - it will parse first line as title, rest as description
		openTaskDrawer(projectName, text);

		// If we used a selection, delete it from the editor
		if (hasSelection) {
			monacoRef?.deleteSelection();
		}
	}

	// Clear notes
	async function clearNotes() {
		localNotes = '';
		// Cancel any pending save
		if (saveTimeout) {
			clearTimeout(saveTimeout);
		}
		// Save immediately
		await saveNotes();
	}

	// Toggle collapse
	function toggleCollapse() {
		internalCollapsed = !internalCollapsed;
		// Trigger Monaco layout and focus at end after animation when expanding
		if (!internalCollapsed) {
			setTimeout(() => {
				monacoRef?.layout();
				monacoRef?.focusEnd();
			}, 300);
		}
	}

	// Cleanup
	onDestroy(() => {
		if (saveTimeout) {
			clearTimeout(saveTimeout);
		}
	});
</script>

<div class="project-notes" style="--project-color: {projectColor}">
	<div class="notes-header">
		<button
			class="notes-toggle"
			onclick={toggleCollapse}
			aria-expanded={!internalCollapsed}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="2"
				stroke="currentColor"
				class="collapse-icon"
				class:collapsed={internalCollapsed}
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
			</svg>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="notes-icon"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
				/>
			</svg>
			<span class="notes-title">Project Notes</span>
			{#if internalCollapsed && localNotes && localNotes.trim()}
				<span class="has-notes-indicator" title="Has notes">
					<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke="none">
						<circle cx="12" cy="12" r="4" />
					</svg>
				</span>
			{/if}
			{#if isDirty}
				<span class="dirty-indicator" title="Unsaved changes"></span>
			{/if}
			{#if isSaving}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			{#if saveError}
				<span class="save-error" title={saveError}>Error</span>
			{/if}
		</button>

		<div class="header-actions">
			<button
				class="action-btn"
				class:preview-active={showPreview}
				onclick={() => { showPreview = !showPreview; }}
				disabled={!localNotes}
				title={showPreview ? 'Show editor' : 'Preview markdown'}
			>
				{#if showPreview}
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
					</svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
					</svg>
				{/if}
			</button>
			<button
				class="action-btn"
				onclick={copyNotes}
				disabled={!localNotes}
				title="Copy to clipboard"
			>
				{#if copySuccess}
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
					</svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
					</svg>
				{/if}
			</button>
			<button
				class="action-btn"
				onclick={downloadNotes}
				disabled={!localNotes}
				title="Download as markdown"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
				</svg>
			</button>
			<button
				class="action-btn create-task"
				onclick={createTaskFromNotes}
				disabled={!localNotes}
				title="Create task from notes (uses selection if any)"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
				</svg>
			</button>
			<button
				class="action-btn danger"
				onclick={clearNotes}
				disabled={!localNotes}
				title="Clear notes"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
				</svg>
			</button>
		</div>
	</div>

	{#if !internalCollapsed}
		<div class="notes-content" transition:slide={{ duration: 200 }}>
			{#if showPreview}
				<div class="notes-preview" style="height: min({editorHeight}px, 70vh);">
					<MarkdownPreview content={localNotes} />
				</div>
			{:else}
				<div class="notes-editor" style="height: min({editorHeight}px, 70vh);">
					<MonacoWrapper
						bind:this={monacoRef}
						bind:value={localNotes}
						language="markdown"
						onchange={handleNotesChange}
						disableSuggestions={true}
					/>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.project-notes {
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 0.75rem;
		margin-bottom: 1rem;
		overflow: hidden;
	}

	.notes-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem 0.5rem 1rem;
		background: transparent;
	}

	.notes-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		padding: 0.25rem 0;
		background: transparent;
		border: none;
		cursor: pointer;
		color: oklch(0.75 0.02 250);
		font-size: 0.875rem;
		font-weight: 500;
		text-align: left;
		transition: color 0.15s ease;
	}

	.notes-toggle:hover {
		color: oklch(0.90 0.02 250);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 0.375rem;
		cursor: pointer;
		color: oklch(0.55 0.02 250);
		transition: all 0.15s ease;
	}

	.action-btn svg {
		width: 1rem;
		height: 1rem;
	}

	.action-btn:hover:not(:disabled) {
		background: oklch(0.22 0.02 250);
		color: oklch(0.85 0.02 250);
		border-color: oklch(0.30 0.02 250);
	}

	.action-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.action-btn.danger:hover:not(:disabled) {
		background: oklch(0.55 0.15 30 / 0.15);
		color: oklch(0.70 0.18 30);
		border-color: oklch(0.55 0.15 30 / 0.3);
	}

	.action-btn.create-task:hover:not(:disabled) {
		background: oklch(0.55 0.15 145 / 0.15);
		color: oklch(0.70 0.18 145);
		border-color: oklch(0.55 0.15 145 / 0.3);
	}

	.collapse-icon {
		width: 1rem;
		height: 1rem;
		color: oklch(0.55 0.02 250);
		transition: transform 0.2s ease;
		flex-shrink: 0;
	}

	.collapse-icon.collapsed {
		transform: rotate(-90deg);
	}

	.notes-icon {
		width: 1.125rem;
		height: 1.125rem;
		color: var(--project-color);
		flex-shrink: 0;
	}

	.notes-title {
		flex: 1;
		color: oklch(0.85 0.02 250);
	}

	.has-notes-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--project-color);
		opacity: 0.8;
	}

	.has-notes-indicator svg {
		width: 0.5rem;
		height: 0.5rem;
	}

	.dirty-indicator {
		width: 0.5rem;
		height: 0.5rem;
		background: oklch(0.75 0.18 85);
		border-radius: 50%;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}

	.save-error {
		font-size: 0.75rem;
		color: oklch(0.70 0.18 30);
		background: oklch(0.70 0.18 30 / 0.15);
		padding: 0.125rem 0.5rem;
		border-radius: 0.25rem;
	}

	.notes-content {
		border-top: 1px solid oklch(0.22 0.02 250);
	}

	.notes-editor {
		min-height: 100px;
		transition: height 0.2s ease-out;
	}

	.notes-preview {
		min-height: 100px;
		overflow-y: auto;
		transition: height 0.2s ease-out;
	}

	.action-btn.preview-active {
		background: oklch(0.55 0.15 200 / 0.15);
		color: oklch(0.80 0.15 200);
		border-color: oklch(0.55 0.15 200 / 0.3);
	}

	.action-btn.preview-active:hover:not(:disabled) {
		background: oklch(0.55 0.15 200 / 0.25);
		color: oklch(0.85 0.15 200);
	}
</style>
