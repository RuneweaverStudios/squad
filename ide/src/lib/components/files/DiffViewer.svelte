<script lang="ts">
	/**
	 * DiffViewer Component
	 * Reusable Monaco diff editor for showing git diffs
	 *
	 * Features:
	 * - Monaco diff editor with side-by-side view
	 * - Supports staged and unstaged changes
	 * - Responsive layout (side-by-side or inline based on width)
	 * - Stage/Unstage actions
	 */

	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import loader from '@monaco-editor/loader';
	import type * as Monaco from 'monaco-editor';
	import { getMonacoTheme } from '$lib/utils/themeManager';
	import LLMTransformModal from '$lib/components/LLMTransformModal.svelte';
	import { openTaskDrawer } from '$lib/stores/drawerStore';

	// Props
	let {
		filePath = '',
		projectName = '',
		isStaged = false,
		commitHash = null,
		onStage = undefined,
		onUnstage = undefined,
		onClose = undefined,
		sideBySide = true
	}: {
		filePath?: string;
		projectName?: string;
		isStaged?: boolean;
		commitHash?: string | null;
		onStage?: (path: string) => Promise<void>;
		onUnstage?: (path: string) => Promise<void>;
		onClose?: () => void;
		sideBySide?: boolean;
	} = $props();

	// State
	let originalContent = $state('');
	let modifiedContent = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);
	let additions = $state(0);
	let deletions = $state(0);
	let isStaging = $state(false);

	// LLM Transform modal state
	let llmModalOpen = $state(false);
	let llmSelectedText = $state('');

	// Metadata about changes (mode change, binary, etc.)
	let modeChange = $state<{ oldMode: string; newMode: string } | null>(null);
	let isBinaryFile = $state(false);

	// Monaco state
	let containerRef: HTMLDivElement | null = $state(null);
	let diffEditor: Monaco.editor.IStandaloneDiffEditor | null = $state(null);
	let monaco: typeof Monaco | null = $state(null);
	let monacoReady = $state(false);
	let editorInitialized = $state(false); // Prevents re-initialization attempts
	let resizeObserver: ResizeObserver | null = null;
	let themeObserver: MutationObserver | null = null;
	let daisyTheme = $state('nord');

	// Derived: File name from path
	const fileName = $derived(filePath.split('/').pop() || filePath);

	// Derived: Monaco theme
	const effectiveTheme = $derived(getMonacoTheme(daisyTheme));

	// Derived: File extension for language
	const language = $derived(() => {
		const ext = filePath.split('.').pop()?.toLowerCase() || '';
		const langMap: Record<string, string> = {
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
			h: 'c',
			cpp: 'cpp',
			hpp: 'cpp',
			sh: 'shell',
			bash: 'shell',
			zsh: 'shell',
			sql: 'sql',
			svelte: 'html',
			vue: 'html'
		};
		return langMap[ext] || 'plaintext';
	});

	// Derived: Check if this is a metadata-only change
	const hasMetadataOnlyChange = $derived(
		!loading &&
			!error &&
			additions === 0 &&
			deletions === 0 &&
			(modeChange !== null ||
				isBinaryFile ||
				(originalContent !== '' && modifiedContent !== '' && originalContent === modifiedContent))
	);

	// Derived: Generate a user-friendly message for metadata-only changes
	const metadataChangeMessage = $derived(() => {
		if (modeChange) {
			const formatMode = (mode: string) => {
				const shortMode = mode.slice(-3);
				const isExecutable = shortMode.includes('7') || shortMode.includes('5');
				return isExecutable ? `${shortMode} (executable)` : shortMode;
			};
			return `File mode changed from ${formatMode(modeChange.oldMode)} to ${formatMode(modeChange.newMode)}`;
		}
		if (isBinaryFile) {
			return 'Binary file (cannot show text diff)';
		}
		if (originalContent === modifiedContent && originalContent !== '') {
			return 'File is marked as modified but content appears identical. This may be due to line ending differences (CRLF/LF) or other whitespace changes not visible in diff.';
		}
		return 'No content changes to display';
	});

	// Fetch diff content when path changes
	$effect(() => {
		if (filePath && projectName) {
			fetchDiffContent();
		}
	});

	// Track if initial content has been loaded (to trigger first-time init)
	let contentLoaded = $state(false);

	// Initialize Monaco when container is ready (only once)
	// We check contentLoaded but NOT the actual content values to avoid re-running on content changes
	$effect(() => {
		if (containerRef && !editorInitialized && !loading && contentLoaded) {
			// Small delay to ensure container is properly sized
			const timeout = setTimeout(() => {
				monacoReady = true;
			}, 100);
			return () => clearTimeout(timeout);
		}
	});

	// Initialize Monaco diff editor when ready (only once)
	$effect(() => {
		if (monacoReady && containerRef && !editorInitialized) {
			initMonacoDiffEditor();
		}
	});

	function handleSendToLLM(selectedText: string) {
		llmSelectedText = selectedText;
		llmModalOpen = true;
	}

	function handleCreateTask(selectedText: string) {
		openTaskDrawer(projectName ?? '', selectedText.trim());
	}

	/** Add custom context menu actions (Send to LLM, Create Task) to a Monaco editor instance */
	function addCustomActions(ed: Monaco.editor.ICodeEditor, m: typeof Monaco) {
		// Cast to IStandaloneCodeEditor which has addAction (diff sub-editors support it at runtime)
		const standaloneEd = ed as Monaco.editor.IStandaloneCodeEditor;

		standaloneEd.addAction({
			id: 'editor.action.sendToLLM',
			label: 'Send to LLM',
			keybindings: [m.KeyMod.Alt | m.KeyCode.KeyL],
			contextMenuGroupId: 'modification',
			contextMenuOrder: 1.5,
			precondition: 'editorHasSelection',
			run: (e: Monaco.editor.ICodeEditor) => {
				const selection = e.getSelection();
				if (selection && !selection.isEmpty()) {
					const model = e.getModel();
					if (model) {
						const text = model.getValueInRange(selection);
						if (text) handleSendToLLM(text);
					}
				}
			}
		});

		standaloneEd.addAction({
			id: 'editor.action.createTask',
			label: 'Create Task from Selection',
			keybindings: [m.KeyMod.Alt | m.KeyCode.KeyT],
			contextMenuGroupId: 'modification',
			contextMenuOrder: 1.6,
			precondition: 'editorHasSelection',
			run: (e: Monaco.editor.ICodeEditor) => {
				const selection = e.getSelection();
				if (selection && !selection.isEmpty()) {
					const model = e.getModel();
					if (model) {
						const text = model.getValueInRange(selection);
						if (text) handleCreateTask(text);
					}
				}
			}
		});
	}

	async function initMonacoDiffEditor() {
		// Guard: only initialize once
		if (!containerRef || diffEditor || editorInitialized) return;

		// Mark as initializing to prevent concurrent attempts
		editorInitialized = true;

		try {
			// Initialize DaisyUI theme
			daisyTheme = document.documentElement.getAttribute('data-theme') || 'nord';

			// Watch for theme changes
			themeObserver = new MutationObserver((mutations) => {
				for (const mutation of mutations) {
					if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
						const newTheme = document.documentElement.getAttribute('data-theme') || 'nord';
						if (newTheme !== daisyTheme) {
							daisyTheme = newTheme;
						}
					}
				}
			});
			themeObserver.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ['data-theme']
			});

			// Load Monaco
			monaco = await loader.init();

			if (!monaco) {
				throw new Error('Failed to load Monaco');
			}

			// Create URIs for the models
			const timestamp = Date.now();
			const originalUri = monaco.Uri.parse(`original-${timestamp}://${filePath}`);
			const modifiedUri = monaco.Uri.parse(`modified-${timestamp}://${filePath}`);

			// Create original model
			const originalModel = monaco.editor.createModel(
				originalContent,
				language(),
				originalUri
			);

			// Create modified model
			const modifiedModel = monaco.editor.createModel(
				modifiedContent,
				language(),
				modifiedUri
			);

			// Create diff editor
			diffEditor = monaco.editor.createDiffEditor(containerRef, {
				theme: effectiveTheme,
				readOnly: true,
				renderSideBySide: sideBySide,
				enableSplitViewResizing: true,
				ignoreTrimWhitespace: false,
				renderIndicators: true,
				originalEditable: false,
				minimap: { enabled: false },
				scrollBeyondLastLine: false,
				fontSize: 13,
				lineNumbers: 'on',
				lineDecorationsWidth: 8,
				lineNumbersMinChars: 3,
				padding: { top: 8, bottom: 8 },
				scrollbar: {
					useShadows: false,
					verticalScrollbarSize: 10,
					horizontalScrollbarSize: 10
				},
				useShadowDOM: false
			});

			diffEditor.setModel({
				original: originalModel,
				modified: modifiedModel
			});

			// Add custom context menu actions to both sub-editors
			addCustomActions(diffEditor.getOriginalEditor(), monaco);
			addCustomActions(diffEditor.getModifiedEditor(), monaco);

			// Set up resize observer
			resizeObserver = new ResizeObserver(() => {
				diffEditor?.layout();
			});
			resizeObserver.observe(containerRef);

		} catch (err) {
			console.error('Failed to initialize Monaco Diff Editor:', err);
			error = 'Failed to load diff editor';
			// Reset flag so retry is possible
			editorInitialized = false;
		}
	}

	// Sync theme changes
	$effect(() => {
		if (monaco && diffEditor) {
			monaco.editor.setTheme(effectiveTheme);
		}
	});

	async function fetchDiffContent() {
		loading = true;
		error = null;

		try {
			const params = new URLSearchParams({
				project: projectName,
				path: filePath
			});
			if (commitHash) {
				params.set('commit', commitHash);
			} else {
				params.set('staged', isStaged.toString());
			}
			const response = await fetch(`/api/files/git/diff?${params}`);
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to fetch diff');
			}

			originalContent = data.original ?? '';
			modifiedContent = data.modified ?? '';

			// Mark content as loaded (triggers first-time Monaco initialization)
			if (!contentLoaded) {
				contentLoaded = true;
			}

			// Extract stats and metadata from parsed diff
			if (data.files && data.files.length > 0) {
				const fileData = data.files[0];
				additions = fileData.additions || 0;
				deletions = fileData.deletions || 0;
				modeChange = fileData.modeChange || null;
				isBinaryFile = fileData.isBinary || false;
			} else {
				additions = 0;
				deletions = 0;
				modeChange = null;
				isBinaryFile = false;
			}

			// Update existing diff editor models if editor exists (like DiffPreviewDrawer)
			// This avoids disposing and recreating the editor, preventing Monaco race conditions
			if (diffEditor && monaco) {
				const model = diffEditor.getModel();
				if (model) {
					try {
						model.original.setValue(originalContent);
						model.modified.setValue(modifiedContent);
					} catch {
						// Monaco can throw "Illegal value for lineNumber" when restoring
						// cursor position after setValue() if new content has fewer lines
					}
				}
			}

		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load diff';
			originalContent = '';
			modifiedContent = '';
		} finally {
			loading = false;
		}
	}

	async function handleStageToggle() {
		if (isStaging) return;

		isStaging = true;
		try {
			if (isStaged && onUnstage) {
				await onUnstage(filePath);
			} else if (!isStaged && onStage) {
				await onStage(filePath);
			}
		} finally {
			isStaging = false;
		}
	}

	onDestroy(() => {
		themeObserver?.disconnect();
		resizeObserver?.disconnect();
		// Dispose the diff editor - let Monaco handle model cleanup internally
		// Note: We don't manually dispose models or call setModel(null) because:
		// 1. DiffEditorWidget internally fires events during disposal
		// 2. Manually disposing models first causes "TextModel got disposed before DiffEditorWidget model got reset"
		// 3. Monaco's editor.dispose() properly cleans up its own model references
		if (diffEditor) {
			try {
				diffEditor.dispose();
			} catch {
				// Ignore errors during disposal (component may be unmounting rapidly)
			}
		}
		diffEditor = null;
		editorInitialized = false;
		monacoReady = false;
		monaco = null;
	});
</script>

<div class="diff-viewer">
	<!-- Header -->
	<div class="diff-header">
		<div class="diff-header-left">
			<!-- Diff icon -->
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="diff-icon"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
			</svg>

			<!-- File name and path -->
			<div class="diff-file-info">
				<h2 class="diff-file-name">{fileName}</h2>
				<p class="diff-file-path">{filePath}</p>
			</div>

			<!-- Stats badges -->
			{#if additions > 0 || deletions > 0}
				<div class="diff-stats">
					{#if additions > 0}
						<span class="diff-badge diff-badge-add">+{additions}</span>
					{/if}
					{#if deletions > 0}
						<span class="diff-badge diff-badge-del">-{deletions}</span>
					{/if}
				</div>
			{/if}

			<!-- Commit hash or staged indicator -->
			{#if commitHash}
				<span class="diff-badge diff-badge-commit">{commitHash.slice(0, 7)}</span>
			{:else if isStaged}
				<span class="badge badge-sm badge-success">Staged</span>
			{/if}
		</div>

		<div class="diff-header-right">
			<!-- Stage/Unstage button -->
			{#if !commitHash && ((onStage && !isStaged) || (onUnstage && isStaged))}
				<button
					onclick={handleStageToggle}
					class="btn btn-xs"
					class:btn-success={!isStaged}
					class:btn-warning={isStaged}
					disabled={isStaging}
					title={isStaged ? 'Unstage this file' : 'Stage this file'}
				>
					{#if isStaging}
						<span class="loading loading-spinner loading-xs"></span>
					{:else if isStaged}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
							<line x1="5" y1="12" x2="19" y2="12" />
						</svg>
						<span>Unstage</span>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
							<line x1="12" y1="5" x2="12" y2="19" />
							<line x1="5" y1="12" x2="19" y2="12" />
						</svg>
						<span>Stage</span>
					{/if}
				</button>
			{/if}

			<!-- Close button (if onClose provided) -->
			{#if onClose}
				<button
					onclick={onClose}
					class="btn btn-xs btn-ghost diff-close-btn"
					title="Close"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			{/if}
		</div>
	</div>

	<!-- Content Area -->
	<div class="diff-content">
		<!-- Monaco container is ALWAYS mounted to prevent editor detachment issues -->
		<!-- We show/hide it and overlay other states on top -->
		<div
			class="monaco-diff-wrapper"
			bind:this={containerRef}
			style:display={!filePath || error || hasMetadataOnlyChange || (originalContent === '' && modifiedContent === '' && !loading) ? 'none' : 'block'}
		></div>

		<!-- Overlay states on top of Monaco container -->
		{#if loading}
			<div class="diff-overlay diff-loading">
				<span class="loading loading-spinner loading-lg" style="color: oklch(0.65 0.15 200);"></span>
				<span class="diff-loading-text">Loading diff...</span>
			</div>
		{:else if error}
			<div class="diff-overlay diff-error">
				<div class="alert alert-error max-w-md">
					<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<div>
						<h3 class="font-bold">Failed to load diff</h3>
						<p class="text-sm">{error}</p>
					</div>
					<button onclick={fetchDiffContent} class="btn btn-sm">Retry</button>
				</div>
			</div>
		{:else if !filePath}
			<div class="diff-overlay diff-empty">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="diff-empty-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
				</svg>
				<p class="diff-empty-text">Select a file to view diff</p>
			</div>
		{:else if originalContent === '' && modifiedContent === ''}
			<div class="diff-overlay diff-empty">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="diff-empty-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
				</svg>
				<p class="diff-empty-text">No changes to display</p>
			</div>
		{:else if hasMetadataOnlyChange}
			<div class="diff-overlay diff-metadata">
				{#if modeChange}
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="diff-metadata-icon diff-metadata-icon-mode">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
					</svg>
					<p class="diff-metadata-title">File Mode Changed</p>
				{:else if isBinaryFile}
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="diff-metadata-icon diff-metadata-icon-binary">
						<path stroke-linecap="round" stroke-linejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
					</svg>
					<p class="diff-metadata-title">Binary File</p>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="diff-metadata-icon diff-metadata-icon-ws">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
					</svg>
					<p class="diff-metadata-title">Whitespace Changes Only</p>
				{/if}
				<p class="diff-metadata-desc">{metadataChangeMessage()}</p>
			</div>
		{/if}
	</div>

	<!-- Footer -->
	<div class="diff-footer">
		<div class="diff-footer-left">
			<span>{language()}</span>
			<span>|</span>
			<span>{commitHash ? `Commit ${commitHash.slice(0, 7)}` : isStaged ? 'Staged changes' : 'Working tree changes'}</span>
		</div>
	</div>
</div>

<LLMTransformModal
	bind:isOpen={llmModalOpen}
	selectedText={llmSelectedText}
	project={projectName ?? ''}
	onClose={() => { llmModalOpen = false; }}
/>

<style>
	.diff-viewer {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: oklch(0.14 0.01 250);
		border-radius: 0.5rem;
		overflow: hidden;
		border: 1px solid oklch(0.22 0.02 250);
	}

	.diff-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		background: oklch(0.17 0.01 250);
		border-bottom: 1px solid oklch(0.22 0.02 250);
		flex-shrink: 0;
	}

	.diff-header-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	.diff-header-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.diff-icon {
		width: 1.125rem;
		height: 1.125rem;
		flex-shrink: 0;
		color: oklch(0.70 0.18 200);
	}

	.diff-file-info {
		min-width: 0;
	}

	.diff-file-name {
		font-family: ui-monospace, monospace;
		font-size: 0.8125rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.diff-file-path {
		font-size: 0.6875rem;
		color: oklch(0.50 0.02 250);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.diff-stats {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-left: 0.375rem;
	}

	.diff-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.125rem 0.375rem;
		font-size: 0.6875rem;
		font-weight: 600;
		border-radius: 0.25rem;
	}

	.diff-badge-add {
		background: oklch(0.45 0.12 145 / 0.3);
		color: oklch(0.75 0.15 145);
	}

	.diff-badge-del {
		background: oklch(0.45 0.12 25 / 0.3);
		color: oklch(0.75 0.15 25);
	}

	.diff-badge-commit {
		background: oklch(0.45 0.12 200 / 0.3);
		color: oklch(0.75 0.15 200);
	}

	.diff-close-btn {
		color: oklch(0.55 0.02 250);
	}

	.diff-content {
		flex: 1;
		overflow: hidden;
		position: relative;
	}

	/* Overlay states that appear on top of (or instead of) Monaco */
	.diff-overlay {
		position: absolute;
		inset: 0;
		background: oklch(0.14 0.01 250);
		z-index: 10;
	}

	.diff-loading,
	.diff-error,
	.diff-empty,
	.diff-metadata {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		padding: 1rem;
	}

	.diff-loading-text {
		margin-top: 0.75rem;
		font-size: 0.875rem;
		font-family: ui-monospace, monospace;
		color: oklch(0.55 0.02 250);
	}

	.diff-empty-icon {
		width: 3rem;
		height: 3rem;
		color: oklch(0.45 0.02 250);
		margin-bottom: 0.75rem;
	}

	.diff-empty-text {
		font-size: 0.875rem;
		color: oklch(0.55 0.02 250);
	}

	.diff-metadata-icon {
		width: 3rem;
		height: 3rem;
		margin-bottom: 0.75rem;
	}

	.diff-metadata-icon-mode {
		color: oklch(0.60 0.15 200);
	}

	.diff-metadata-icon-binary {
		color: oklch(0.60 0.10 45);
	}

	.diff-metadata-icon-ws {
		color: oklch(0.60 0.15 145);
	}

	.diff-metadata-title {
		font-size: 0.875rem;
		font-weight: 500;
		color: oklch(0.70 0.10 200);
		margin-bottom: 0.5rem;
	}

	.diff-metadata-desc {
		font-size: 0.8125rem;
		color: oklch(0.55 0.02 250);
		text-align: center;
		max-width: 24rem;
	}

	.diff-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.375rem 0.75rem;
		background: oklch(0.16 0.01 250);
		border-top: 1px solid oklch(0.22 0.02 250);
		flex-shrink: 0;
	}

	.diff-footer-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.6875rem;
		font-family: ui-monospace, monospace;
		color: oklch(0.45 0.02 250);
	}

	.monaco-diff-wrapper {
		width: 100%;
		height: 100%;
		position: relative;
	}

	.monaco-diff-wrapper :global(.monaco-editor),
	.monaco-diff-wrapper :global(.monaco-diff-editor) {
		position: absolute !important;
		inset: 0;
	}
</style>
