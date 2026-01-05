<script lang="ts">
	/**
	 * FileEditor - Container component with tab bar and Monaco editor
	 *
	 * Features:
	 * - Tab bar for multiple open files (via FileTabBar)
	 * - Monaco editor for file content (via MonacoWrapper)
	 * - Media preview for images, videos, audio, and PDFs
	 * - Auto-detect language from file extension
	 * - Track dirty state per file
	 * - Emits events for file operations
	 */

	import FileTabBar from './FileTabBar.svelte';
	import MonacoWrapper from '$lib/components/config/MonacoWrapper.svelte';
	import MediaPreview from './MediaPreview.svelte';
	import type { OpenFile } from './types';

	// Props
	let {
		openFiles = $bindable([]),
		activeFilePath = $bindable(null),
		project = '',
		onFileClose = () => {},
		onFileSave = () => {},
		onActiveFileChange = () => {},
		onContentChange = () => {},
		onTabReorder = () => {},
		savingFiles = new Set<string>()
	}: {
		openFiles: OpenFile[];
		activeFilePath: string | null;
		project?: string;
		onFileClose?: (path: string) => void;
		onFileSave?: (path: string, content: string) => void;
		onActiveFileChange?: (path: string) => void;
		onContentChange?: (path: string, content: string, dirty: boolean) => void;
		onTabReorder?: (fromIndex: number, toIndex: number) => void;
		savingFiles?: Set<string>;
	} = $props();

	// Derived state: is the active file currently being saved?
	const isActiveSaving = $derived(activeFilePath ? savingFiles.has(activeFilePath) : false);

	// Handle save button click
	function handleSaveClick() {
		if (activeFile && activeFile.dirty && !isActiveSaving) {
			onFileSave(activeFile.path, activeFile.content);
		}
	}

	// Monaco ref for focus/layout
	let monacoRef: { focus: () => void; layout: () => void } | undefined = $state(undefined);

	// Confirmation dialog state
	let confirmClose = $state<{ path: string; filename: string } | null>(null);

	// Get the currently active file
	const activeFile = $derived(openFiles.find((f) => f.path === activeFilePath) || null);

	// Get filename from path
	function getFilename(path: string): string {
		return path.split('/').pop() || path;
	}

	// Get language from file extension for Monaco
	function getLanguage(path: string): string {
		const ext = path.split('.').pop()?.toLowerCase() || '';
		const languageMap: Record<string, string> = {
			ts: 'typescript',
			tsx: 'typescript',
			js: 'javascript',
			jsx: 'javascript',
			mjs: 'javascript',
			cjs: 'javascript',
			json: 'json',
			md: 'markdown',
			css: 'css',
			scss: 'scss',
			less: 'less',
			html: 'html',
			htm: 'html',
			xml: 'xml',
			svg: 'xml',
			yaml: 'yaml',
			yml: 'yaml',
			py: 'python',
			rs: 'rust',
			go: 'go',
			java: 'java',
			c: 'c',
			cpp: 'cpp',
			h: 'c',
			hpp: 'cpp',
			sh: 'shell',
			bash: 'shell',
			zsh: 'shell',
			sql: 'sql',
			graphql: 'graphql',
			gql: 'graphql',
			svelte: 'html', // Monaco doesn't have native Svelte support
			vue: 'html',
			dockerfile: 'dockerfile',
			toml: 'toml',
			ini: 'ini',
			conf: 'ini',
			txt: 'plaintext'
		};
		return languageMap[ext] || 'plaintext';
	}

	// Handle tab selection
	function handleTabSelect(path: string) {
		if (path !== activeFilePath) {
			activeFilePath = path;
			onActiveFileChange(path);
		}
	}

	// Handle tab close request - show confirmation if dirty
	function handleTabClose(path: string) {
		const file = openFiles.find(f => f.path === path);
		if (file?.dirty) {
			confirmClose = { path, filename: getFilename(path) };
		} else {
			onFileClose(path);
		}
	}

	// Handle middle click close (same as regular close)
	function handleTabMiddleClick(path: string) {
		handleTabClose(path);
	}

	// Confirm close without saving
	function handleConfirmClose() {
		if (confirmClose) {
			onFileClose(confirmClose.path);
			confirmClose = null;
		}
	}

	// Save and then close
	function handleSaveAndClose() {
		if (confirmClose) {
			const file = openFiles.find(f => f.path === confirmClose!.path);
			if (file) {
				onFileSave(file.path, file.content);
			}
			onFileClose(confirmClose.path);
			confirmClose = null;
		}
	}

	// Cancel close
	function handleCancelClose() {
		confirmClose = null;
	}

	// Handle content change from Monaco
	function handleContentChange(newContent: string) {
		if (!activeFilePath || !activeFile) return;

		// Check if content has changed from original
		const isDirty = newContent !== activeFile.originalContent;

		// Update the file in the array
		openFiles = openFiles.map((f) => {
			if (f.path === activeFilePath) {
				return { ...f, content: newContent, dirty: isDirty };
			}
			return f;
		});

		// Emit content change event
		onContentChange(activeFilePath, newContent, isDirty);
	}

	// Handle keyboard shortcuts
	function handleKeyDown(e: KeyboardEvent) {
		// Alt+S to save (Alt instead of Ctrl to avoid browser conflict)
		if (e.altKey && e.key === 's') {
			e.preventDefault();
			if (activeFile && activeFile.dirty) {
				onFileSave(activeFile.path, activeFile.content);
			}
		}

		// Alt+W to close tab (Alt instead of Ctrl to avoid browser conflict)
		if (e.altKey && e.key === 'w') {
			e.preventDefault();
			if (activeFilePath) {
				handleTabClose(activeFilePath);
			}
		}

		// Alt+] to switch to next tab
		if (e.altKey && e.key === ']') {
			e.preventDefault();
			switchToNextTab();
		}

		// Alt+[ to switch to previous tab
		if (e.altKey && e.key === '[') {
			e.preventDefault();
			switchToPreviousTab();
		}
	}

	// Switch to next tab
	function switchToNextTab() {
		if (openFiles.length <= 1) return;

		const currentIndex = openFiles.findIndex(f => f.path === activeFilePath);
		const nextIndex = (currentIndex + 1) % openFiles.length;
		const nextFile = openFiles[nextIndex];

		if (nextFile) {
			activeFilePath = nextFile.path;
			onActiveFileChange(nextFile.path);
		}
	}

	// Switch to previous tab
	function switchToPreviousTab() {
		if (openFiles.length <= 1) return;

		const currentIndex = openFiles.findIndex(f => f.path === activeFilePath);
		const prevIndex = currentIndex <= 0 ? openFiles.length - 1 : currentIndex - 1;
		const prevFile = openFiles[prevIndex];

		if (prevFile) {
			activeFilePath = prevFile.path;
			onActiveFileChange(prevFile.path);
		}
	}

	// Focus the editor
	export function focus() {
		monacoRef?.focus();
	}

	// Trigger layout update
	export function layout() {
		monacoRef?.layout();
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="file-editor">
	{#if openFiles.length > 0}
		<!-- Tab Bar with Save Button -->
		<div class="editor-header">
			<FileTabBar
				{openFiles}
				{activeFilePath}
				onTabSelect={handleTabSelect}
				onTabClose={handleTabClose}
				onTabMiddleClick={handleTabMiddleClick}
				{onTabReorder}
			/>
			<!-- Save Button -->
			<button
				class="save-btn"
				class:saving={isActiveSaving}
				class:has-changes={activeFile?.dirty && !isActiveSaving}
				disabled={!activeFile?.dirty || isActiveSaving}
				onclick={handleSaveClick}
				title={isActiveSaving ? 'Saving...' : activeFile?.dirty ? 'Save (Alt+S)' : 'No changes to save'}
			>
				{#if isActiveSaving}
					<span class="save-spinner"></span>
					<span class="save-text">Saving</span>
				{:else}
					<svg class="save-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
					</svg>
					{#if activeFile?.dirty}
						<span class="save-text">Save</span>
					{/if}
				{/if}
			</button>
		</div>

		<!-- Editor Area -->
		<div class="editor-area">
			{#if activeFile}
				{#if activeFile.isMedia && project}
					<!-- Media Preview for images, videos, audio, PDFs -->
					<MediaPreview
						{project}
						path={activeFile.path}
						filename={getFilename(activeFile.path)}
					/>
				{:else}
					<!-- Monaco Editor for text files -->
					{@const language = getLanguage(activeFile.path)}
					<MonacoWrapper bind:this={monacoRef} value={activeFile.content} {language} onchange={handleContentChange} />
				{/if}
			{:else}
				<div class="no-active-file">
					<svg class="w-10 h-10 text-base-content/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="1.5"
							d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
						/>
					</svg>
					<p class="text-base-content/40 mt-2">Select a tab to edit</p>
				</div>
			{/if}
		</div>
	{:else}
		<!-- Empty State -->
		<div class="empty-state">
			<svg class="w-16 h-16 text-base-content/15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1.5"
					d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
				/>
			</svg>
			<h3 class="text-base-content/50 mt-4 font-medium">No files open</h3>
			<p class="text-base-content/35 mt-1 text-sm">Select a file from the explorer to start editing</p>
			<div class="shortcuts mt-4 text-xs text-base-content/30">
				<div class="shortcut">
					<kbd class="kbd kbd-xs">Alt</kbd>
					<span>+</span>
					<kbd class="kbd kbd-xs">S</kbd>
					<span class="ml-2">Save</span>
				</div>
				<div class="shortcut mt-1">
					<kbd class="kbd kbd-xs">Alt</kbd>
					<span>+</span>
					<kbd class="kbd kbd-xs">W</kbd>
					<span class="ml-2">Close Tab</span>
				</div>
				<div class="shortcut mt-1">
					<kbd class="kbd kbd-xs">Alt</kbd>
					<span>+</span>
					<kbd class="kbd kbd-xs">]</kbd>
					<span class="ml-2">Next Tab</span>
				</div>
				<div class="shortcut mt-1">
					<kbd class="kbd kbd-xs">Alt</kbd>
					<span>+</span>
					<kbd class="kbd kbd-xs">P</kbd>
					<span class="ml-2">Quick Open</span>
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- Unsaved Changes Confirmation Dialog -->
{#if confirmClose}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="confirm-overlay" onclick={handleCancelClose}>
		<div class="confirm-dialog" onclick={(e) => e.stopPropagation()}>
			<div class="confirm-icon">
				<svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
				</svg>
			</div>
			<h3 class="confirm-title">Unsaved Changes</h3>
			<p class="confirm-message">
				<strong>{confirmClose.filename}</strong> has unsaved changes. Do you want to save before closing?
			</p>
			<div class="confirm-actions">
				<button class="btn btn-ghost btn-sm" onclick={handleConfirmClose}>
					Don't Save
				</button>
				<button class="btn btn-ghost btn-sm" onclick={handleCancelClose}>
					Cancel
				</button>
				<button class="btn btn-primary btn-sm" onclick={handleSaveAndClose}>
					Save & Close
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.file-editor {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: oklch(0.14 0.01 250);
		border-radius: 0.5rem;
		overflow: hidden;
	}

	.editor-header {
		display: flex;
		align-items: stretch;
		background: oklch(0.16 0.01 250);
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.save-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		padding: 0 0.75rem;
		min-width: 36px;
		background: oklch(0.18 0.01 250);
		border: none;
		border-left: 1px solid oklch(0.22 0.02 250);
		color: oklch(0.45 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.save-btn:hover:not(:disabled) {
		background: oklch(0.22 0.02 250);
		color: oklch(0.70 0.02 250);
	}

	.save-btn.has-changes {
		background: oklch(0.55 0.15 145 / 0.15);
		color: oklch(0.80 0.18 145);
		animation: pulse-save 1.5s infinite;
	}

	.save-btn.has-changes:hover {
		background: oklch(0.55 0.15 145 / 0.25);
		color: oklch(0.85 0.18 145);
	}

	.save-btn.saving {
		color: oklch(0.65 0.15 200);
		background: oklch(0.55 0.15 200 / 0.1);
	}

	.save-btn:disabled:not(.saving):not(.has-changes) {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.save-icon {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
	}

	.save-text {
		font-size: 0.75rem;
		font-weight: 500;
		white-space: nowrap;
	}

	@keyframes pulse-save {
		0%, 100% {
			opacity: 1;
			box-shadow: 0 0 0 0 oklch(0.55 0.18 145 / 0);
		}
		50% {
			opacity: 0.9;
			box-shadow: 0 0 8px 2px oklch(0.55 0.18 145 / 0.3);
		}
	}

	.save-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid oklch(0.30 0.02 250);
		border-top-color: oklch(0.65 0.15 200);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.editor-area {
		flex: 1;
		min-height: 0;
		position: relative;
	}

	.no-active-file {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		text-align: center;
		padding: 2rem;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		text-align: center;
		padding: 2rem;
	}

	.shortcuts {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.shortcut {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.shortcut span {
		opacity: 0.5;
	}

	/* Confirmation Dialog */
	.confirm-overlay {
		position: fixed;
		inset: 0;
		background: oklch(0.08 0.01 250 / 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		animation: fadeIn 0.15s ease;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.confirm-dialog {
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.75rem;
		padding: 1.5rem;
		max-width: 360px;
		width: 90%;
		box-shadow: 0 25px 60px oklch(0.05 0 0 / 0.6);
		animation: slideUp 0.2s ease;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.confirm-icon {
		display: flex;
		justify-content: center;
		margin-bottom: 1rem;
		color: oklch(0.72 0.18 55);
	}

	.confirm-title {
		font-size: 1.1rem;
		font-weight: 600;
		color: oklch(0.92 0.02 250);
		text-align: center;
		margin: 0 0 0.5rem;
	}

	.confirm-message {
		font-size: 0.875rem;
		color: oklch(0.65 0.02 250);
		text-align: center;
		margin: 0 0 1.25rem;
		line-height: 1.5;
	}

	.confirm-message strong {
		color: oklch(0.85 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.confirm-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
	}

	.confirm-actions .btn {
		font-size: 0.8rem;
	}
</style>
