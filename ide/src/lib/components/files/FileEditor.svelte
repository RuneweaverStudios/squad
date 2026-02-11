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

	import { onMount } from 'svelte';
	import FileTabBar from './FileTabBar.svelte';
	import MonacoWrapper from '$lib/components/config/MonacoWrapper.svelte';
	import MediaPreview from './MediaPreview.svelte';
	import InlineDiffViewer from './InlineDiffViewer.svelte';
	import LLMTransformModal from '$lib/components/LLMTransformModal.svelte';
	import { openTaskDrawer } from '$lib/stores/drawerStore';
	import type { OpenFile } from './types';

	// Props
	let {
		openFiles = $bindable([]),
		activeFilePath = $bindable(null),
		project = '',
		projectPath = '',
		onFileClose = () => {},
		onFileSave = () => {},
		onActiveFileChange = () => {},
		onContentChange = () => {},
		onTabReorder = () => {},
		onAcceptDiskChange = () => {},
		onDiscardDiskChange = () => {},
		savingFiles = new Set<string>()
	}: {
		openFiles: OpenFile[];
		activeFilePath: string | null;
		project?: string;
		projectPath?: string;
		onFileClose?: (path: string) => void;
		onFileSave?: (path: string, content: string) => void;
		onActiveFileChange?: (path: string) => void;
		onContentChange?: (path: string, content: string, dirty: boolean) => void;
		onTabReorder?: (fromIndex: number, toIndex: number) => void;
		onAcceptDiskChange?: (path: string) => void;
		onDiscardDiskChange?: (path: string) => void;
		savingFiles?: Set<string>;
	} = $props();

	// Derived: base path for file save (directory of active file)
	const llmBasePath = $derived(() => {
		if (!activeFilePath) return projectPath || '';
		const lastSlash = activeFilePath.lastIndexOf('/');
		if (lastSlash > 0) {
			return activeFilePath.slice(0, lastSlash);
		}
		return projectPath || '';
	});

	// Derived state: is the active file currently being saved?
	const isActiveSaving = $derived(activeFilePath ? savingFiles.has(activeFilePath) : false);

	// State: which file is showing the diff view (path or null)
	let showingDiffForPath = $state<string | null>(null);

	// Handle save button click
	function handleSaveClick() {
		if (activeFile && activeFile.dirty && !isActiveSaving) {
			onFileSave(activeFile.path, activeFile.content);
		}
	}

	// Handle disk change indicator click on tab - show the diff view
	function handleDiskChangeClick(path: string) {
		if (showingDiffForPath === path) {
			// Toggle off if already showing
			showingDiffForPath = null;
		} else {
			showingDiffForPath = path;
		}
	}

	// Handle accepting disk changes - update the file content to match disk
	function handleAcceptDiskChange() {
		if (activeFile && activeFilePath) {
			onAcceptDiskChange(activeFilePath);
			showingDiffForPath = null;
		}
	}

	// Handle discarding disk changes - keep the current content
	function handleDiscardDiskChange() {
		if (activeFile && activeFilePath) {
			onDiscardDiskChange(activeFilePath);
			showingDiffForPath = null;
		}
	}

	// Monaco ref
	let monacoRef: {
		focus: () => void;
		layout: () => void;
		scrollToLine: (line: number) => void;
		undo: () => void;
		redo: () => void;
		replaceText: (search: string, replacement: string) => boolean;
		insertAfter: (search: string, text: string) => boolean;
	} | undefined = $state(undefined);

	// Confirmation dialog state
	let confirmClose = $state<{ path: string; filename: string } | null>(null);

	// Help modal state
	let showHelpModal = $state(false);

	function toggleHelp() {
		showHelpModal = !showHelpModal;
	}

	// LLM Transform modal state
	let llmModalOpen = $state(false);
	let llmSelectedText = $state('');

	function handleSendToLLM(selectedText: string) {
		llmSelectedText = selectedText;
		llmModalOpen = true;
	}

	function handleCreateTask(selectedText: string) {
		openTaskDrawer(project, selectedText.trim());
	}

	function handleLLMReplace(newText: string) {
		// Replace via Monaco executeEdits (preserves undo stack)
		if (monacoRef?.replaceText(llmSelectedText, newText)) return;
		// Fallback: direct content mutation if Monaco not available
		if (activeFile && activeFilePath) {
			const content = activeFile.content;
			const index = content.indexOf(llmSelectedText);
			if (index !== -1) {
				const newContent = content.slice(0, index) + newText + content.slice(index + llmSelectedText.length);
				handleContentChange(newContent);
			}
		}
	}

	function handleLLMInsert(newText: string) {
		// Insert via Monaco executeEdits (preserves undo stack)
		if (monacoRef?.insertAfter(llmSelectedText, newText)) return;
		// Fallback: direct content mutation if Monaco not available
		if (activeFile && activeFilePath) {
			const content = activeFile.content;
			const index = content.indexOf(llmSelectedText);
			if (index !== -1) {
				const insertPoint = index + llmSelectedText.length;
				const newContent = content.slice(0, insertPoint) + '\n' + newText + content.slice(insertPoint);
				handleContentChange(newContent);
			}
		}
	}

	function handleLLMSaveToFile(filename: string, content: string) {
		// Get the directory of the currently active file, or use project root
		let basePath = '';
		if (activeFilePath) {
			const lastSlash = activeFilePath.lastIndexOf('/');
			if (lastSlash > 0) {
				basePath = activeFilePath.slice(0, lastSlash + 1);
			}
		}

		// Create a new file with the content
		const newPath = basePath + filename;

		// Add to open files
		const newFile: OpenFile = {
			path: newPath,
			content,
			dirty: true,
			originalContent: ''
		};

		// Check if file already exists in open files
		const existingIndex = openFiles.findIndex(f => f.path === newPath);
		if (existingIndex >= 0) {
			// Update existing file
			openFiles = openFiles.map((f, i) =>
				i === existingIndex ? { ...f, content, dirty: true } : f
			);
		} else {
			// Add new file
			openFiles = [...openFiles, newFile];
		}

		// Set as active
		activeFilePath = newPath;
		onActiveFileChange(newPath);
	}

	// Get the currently active file
	const activeFile = $derived(openFiles.find((f) => f.path === activeFilePath) || null);

	// Derived: is the active file currently showing the diff view?
	const isShowingDiff = $derived(showingDiffForPath === activeFilePath && activeFile?.hasDiskChanges);

	// Get filename from path
	function getFilename(path: string): string {
		return path.split('/').pop() || path;
	}

	// Get language from file extension for Monaco
	function getLanguage(path: string): string {
		const filename = path.split('/').pop()?.toLowerCase() || '';

		// Special filename detection
		if (filename === '.env' || filename.startsWith('.env.')) return 'dotenv';
		if (filename === 'dockerfile' || filename.startsWith('dockerfile.')) return 'dockerfile';

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
		// Escape to close help modal
		if (e.key === 'Escape' && showHelpModal) {
			e.preventDefault();
			showHelpModal = false;
			return;
		}

		// ? to open help (when not typing in an input)
		if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) {
			const target = e.target as HTMLElement;
			if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable) {
				e.preventDefault();
				showHelpModal = true;
				return;
			}
		}

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

	// Scroll to a specific line in the editor
	export function scrollToLine(lineNumber: number) {
		monacoRef?.scrollToLine(lineNumber);
	}

	// Listen for scroll-to-line custom events (from global search)
	onMount(() => {
		function handleScrollToLine(e: Event) {
			const event = e as CustomEvent<{ line: number }>;
			if (event.detail?.line) {
				// Small delay to ensure the editor has rendered the file
				setTimeout(() => {
					monacoRef?.scrollToLine(event.detail.line);
				}, 50);
			}
		}

		window.addEventListener('scroll-to-line', handleScrollToLine);
		return () => {
			window.removeEventListener('scroll-to-line', handleScrollToLine);
		};
	});
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
				onDiskChangeClick={handleDiskChangeClick}
			/>
			<!-- Help Button -->
			<button
				class="help-btn"
				onclick={toggleHelp}
				title="Keyboard shortcuts (?)"
			>
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
			</button>
			<!-- Undo/Redo Buttons (only for text files with Monaco) -->
			{#if activeFile && !activeFile.isMedia}
				<button
					class="header-btn"
					onclick={() => monacoRef?.undo()}
					title="Undo (Ctrl+Z)"
				>
					<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
					</svg>
				</button>
				<button
					class="header-btn"
					onclick={() => monacoRef?.redo()}
					title="Redo (Ctrl+Shift+Z)"
				>
					<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
					</svg>
				</button>
			{/if}
			<!-- Save Button -->
			<button
				class="save-btn"
				class:saving={isActiveSaving}
				class:has-changes={activeFile?.dirty && !isActiveSaving}
				disabled={!activeFile?.dirty || isActiveSaving}
				onclick={handleSaveClick}
				title={isActiveSaving ? 'Saving...' : activeFile?.dirty ? 'Save (Ctrl+S)' : 'No changes to save'}
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
				{#if isShowingDiff && activeFile.diskContent !== undefined}
					{@const diffLanguage = getLanguage(activeFile.path)}
					<!-- Diff View: comparing current content with disk content -->
					<div class="diff-view-container">
						<div class="diff-view-header">
							<div class="diff-view-title">
								<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
								</svg>
								<span>File changed on disk</span>
							</div>
							<div class="diff-view-labels">
								<span class="diff-label diff-label-local">Your Version</span>
								<span class="diff-label diff-label-disk">Disk Version</span>
							</div>
							<div class="diff-view-actions">
								<button class="btn btn-sm btn-ghost" onclick={() => showingDiffForPath = null}>
									<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
									</svg>
									Close Diff
								</button>
								<button class="btn btn-sm btn-warning" onclick={handleDiscardDiskChange}>
									Save Your Version
								</button>
								<button class="btn btn-sm btn-success" onclick={handleAcceptDiskChange}>
									Use Disk Version
								</button>
							</div>
						</div>
						<div class="diff-view-editor">
							<InlineDiffViewer
								original={activeFile.content}
								modified={activeFile.diskContent}
								language={diffLanguage}
							/>
						</div>
					</div>
				{:else if activeFile.isMedia && project}
					<!-- Media Preview for images, videos, audio, PDFs -->
					<MediaPreview
						{project}
						path={activeFile.path}
						filename={getFilename(activeFile.path)}
					/>
				{:else}
					<!-- Monaco Editor for text files -->
					{@const language = getLanguage(activeFile.path)}
					<MonacoWrapper
						bind:this={monacoRef}
						value={activeFile.content}
						{language}
						onchange={handleContentChange}
						onSendToLLM={handleSendToLLM}
						onCreateTask={handleCreateTask}
					/>
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
					<kbd class="kbd kbd-xs">Ctrl</kbd>
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
					<kbd class="kbd kbd-xs">P</kbd>
					<span class="ml-2">Quick Open</span>
				</div>
				<div class="shortcut mt-1">
					<kbd class="kbd kbd-xs">?</kbd>
					<span class="ml-2">Show All Shortcuts</span>
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- Unsaved Changes Confirmation Dialog -->
{#if confirmClose}
	<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
	<div class="confirm-overlay" onclick={handleCancelClose} onkeydown={(e) => { if (e.key === 'Escape') handleCancelClose(); }} role="presentation">
		<div class="confirm-dialog" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
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

<!-- Help Guide Modal -->
{#if showHelpModal}
	<div class="modal modal-open">
		<div class="modal-box max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
			<!-- Header -->
			<div class="flex items-center justify-between mb-4">
				<h3 class="text-xl font-bold">Keyboard Shortcuts</h3>
				<button
					class="btn btn-sm btn-circle btn-ghost"
					onclick={toggleHelp}
					aria-label="Close help"
				>
					✕
				</button>
			</div>

			<!-- Content -->
			<div class="overflow-y-auto flex-1 space-y-6">
				<!-- File Operations -->
				<div>
					<h4 class="text-sm font-semibold text-base-content/70 uppercase tracking-wide mb-3">File Operations</h4>
					<div class="space-y-2">
						<div class="flex items-center justify-between py-1.5 px-3 rounded bg-base-200/50">
							<span class="text-sm">Save current file</span>
							<div class="flex gap-1">
								<kbd class="kbd kbd-sm">Ctrl</kbd>
								<span class="text-base-content/50">+</span>
								<kbd class="kbd kbd-sm">S</kbd>
							</div>
						</div>
						<div class="flex items-center justify-between py-1.5 px-3 rounded bg-base-200/50">
							<span class="text-sm">Quick file finder</span>
							<div class="flex gap-1">
								<kbd class="kbd kbd-sm">Alt</kbd>
								<span class="text-base-content/50">+</span>
								<kbd class="kbd kbd-sm">P</kbd>
							</div>
						</div>
						<div class="flex items-center justify-between py-1.5 px-3 rounded bg-base-200/50">
							<span class="text-sm">Global file search</span>
							<div class="flex gap-1">
								<kbd class="kbd kbd-sm">Ctrl</kbd>
								<span class="text-base-content/50">+</span>
								<kbd class="kbd kbd-sm">Shift</kbd>
								<span class="text-base-content/50">+</span>
								<kbd class="kbd kbd-sm">F</kbd>
							</div>
						</div>
					</div>
				</div>

				<!-- Tab Navigation -->
				<div>
					<h4 class="text-sm font-semibold text-base-content/70 uppercase tracking-wide mb-3">Tab Navigation</h4>
					<div class="space-y-2">
						<div class="flex items-center justify-between py-1.5 px-3 rounded bg-base-200/50">
							<span class="text-sm">Close current tab</span>
							<div class="flex gap-1">
								<kbd class="kbd kbd-sm">Alt</kbd>
								<span class="text-base-content/50">+</span>
								<kbd class="kbd kbd-sm">W</kbd>
							</div>
						</div>
						<div class="flex items-center justify-between py-1.5 px-3 rounded bg-base-200/50">
							<span class="text-sm">Next tab</span>
							<div class="flex gap-1">
								<kbd class="kbd kbd-sm">Alt</kbd>
								<span class="text-base-content/50">+</span>
								<kbd class="kbd kbd-sm">]</kbd>
							</div>
						</div>
						<div class="flex items-center justify-between py-1.5 px-3 rounded bg-base-200/50">
							<span class="text-sm">Previous tab</span>
							<div class="flex gap-1">
								<kbd class="kbd kbd-sm">Alt</kbd>
								<span class="text-base-content/50">+</span>
								<kbd class="kbd kbd-sm">[</kbd>
							</div>
						</div>
					</div>
				</div>

				<!-- AI Tools -->
				<div>
					<h4 class="text-sm font-semibold text-base-content/70 uppercase tracking-wide mb-3">AI Tools</h4>
					<div class="space-y-2">
						<div class="flex items-center justify-between py-1.5 px-3 rounded bg-base-200/50">
							<span class="text-sm">Send selection to LLM</span>
							<div class="flex gap-1">
								<kbd class="kbd kbd-sm">Alt</kbd>
								<span class="text-base-content/50">+</span>
								<kbd class="kbd kbd-sm">L</kbd>
							</div>
						</div>
					</div>
				</div>

				<!-- General -->
				<div>
					<h4 class="text-sm font-semibold text-base-content/70 uppercase tracking-wide mb-3">General</h4>
					<div class="space-y-2">
						<div class="flex items-center justify-between py-1.5 px-3 rounded bg-base-200/50">
							<span class="text-sm">Show this help</span>
							<div class="flex gap-1">
								<kbd class="kbd kbd-sm">?</kbd>
							</div>
						</div>
						<div class="flex items-center justify-between py-1.5 px-3 rounded bg-base-200/50">
							<span class="text-sm">Close help / Cancel</span>
							<div class="flex gap-1">
								<kbd class="kbd kbd-sm">Esc</kbd>
							</div>
						</div>
					</div>
				</div>

				<!-- Tips -->
				<div class="mt-4 p-3 rounded-lg bg-info/10 border border-info/20">
					<div class="flex gap-2">
						<svg class="w-5 h-5 text-info shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<div class="text-sm text-base-content/70">
							<strong class="text-base-content/90">Tip:</strong> Middle-click on a tab to close it quickly. Drag tabs to reorder them.
						</div>
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div class="modal-action mt-4">
				<button class="btn btn-sm" onclick={toggleHelp}>Close</button>
			</div>
		</div>
		<div class="modal-backdrop bg-black/50" onclick={toggleHelp} onkeydown={(e) => { if (e.key === 'Escape') toggleHelp(); }} role="presentation"></div>
	</div>
{/if}

<!-- LLM Transform Modal -->
<LLMTransformModal
	bind:isOpen={llmModalOpen}
	selectedText={llmSelectedText}
	{project}
	basePath={llmBasePath()}
	{projectPath}
	onClose={() => { llmModalOpen = false; }}
	onReplace={handleLLMReplace}
	onInsert={handleLLMInsert}
	onSaveToFile={handleLLMSaveToFile}
/>

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

	.help-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 0.5rem;
		background: oklch(0.18 0.01 250);
		border: none;
		border-left: 1px solid oklch(0.22 0.02 250);
		color: oklch(0.45 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.help-btn:hover {
		background: oklch(0.22 0.02 250);
		color: oklch(0.70 0.02 250);
	}

	.header-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 0.375rem;
		background: oklch(0.18 0.01 250);
		border: none;
		border-left: 1px solid oklch(0.22 0.02 250);
		color: oklch(0.45 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.header-btn:hover:not(:disabled) {
		background: oklch(0.22 0.02 250);
		color: oklch(0.70 0.02 250);
	}

	.header-btn:disabled {
		cursor: not-allowed;
		opacity: 0.35;
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

	/* Uses global @keyframes fadeIn from app.css */

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

	/* Uses global @keyframes slideUp from app.css */

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

	/* Diff View Styles */
	.diff-view-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: oklch(0.14 0.01 250);
	}

	.diff-view-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: oklch(0.18 0.02 250);
		border-bottom: 1px solid oklch(0.25 0.02 250);
		flex-shrink: 0;
	}

	.diff-view-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: oklch(0.75 0.15 200);
		font-size: 0.875rem;
		font-weight: 500;
	}

	.diff-view-labels {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.75rem;
	}

	.diff-label {
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		font-weight: 500;
	}

	.diff-label-local {
		background: oklch(0.50 0.12 200 / 0.2);
		color: oklch(0.75 0.15 200);
	}

	.diff-label-disk {
		background: oklch(0.50 0.12 145 / 0.2);
		color: oklch(0.75 0.15 145);
	}

	.diff-view-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.diff-view-editor {
		flex: 1;
		min-height: 0;
		position: relative;
	}
</style>
