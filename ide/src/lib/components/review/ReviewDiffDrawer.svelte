<script lang="ts">
	/**
	 * ReviewDiffDrawer Component
	 *
	 * A unified diff viewer drawer for reviewing all agent changes since baseline.
	 * Shows a file list with change stats and Monaco diff editor for each file.
	 *
	 * Features:
	 * - File list with +/- stats and change type indicators
	 * - Click file to view its diff in Monaco side-by-side editor
	 * - Navigate between files with keyboard (j/k or arrow keys)
	 * - Summary stats header (total files, lines added/removed)
	 * - Approve/Request Changes actions
	 */

	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { slide } from 'svelte/transition';
	import loader from '@monaco-editor/loader';
	import type * as Monaco from 'monaco-editor';
	import { getMonacoTheme } from '$lib/utils/themeManager';
	import type { FileModification, ReviewSignal } from '$lib/types/richSignals';

	// Props
	let {
		isOpen = $bindable(false),
		projectName = $bindable(''),
		baselineCommit = $bindable(''),
		reviewSignal = $bindable<ReviewSignal | null>(null),
		onClose = () => {},
		onApprove = undefined,
		onRequestChanges = undefined
	}: {
		isOpen?: boolean;
		projectName?: string;
		baselineCommit?: string;
		reviewSignal?: ReviewSignal | null;
		onClose?: () => void;
		onApprove?: () => void;
		onRequestChanges?: (feedback: string) => void;
	} = $props();

	// State
	let files = $state<DiffFile[]>([]);
	let selectedFileIndex = $state(0);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let showRequestChangesInput = $state(false);
	let feedbackText = $state('');

	// Monaco state
	let containerRef: HTMLDivElement | null = $state(null);
	let diffEditor: Monaco.editor.IStandaloneDiffEditor | null = $state(null);
	let monaco: typeof Monaco | null = $state(null);
	let monacoReady = $state(false);
	let resizeObserver: ResizeObserver | null = null;
	let themeObserver: MutationObserver | null = null;
	let daisyTheme = $state('nord');

	interface DiffFile {
		path: string;
		additions: number;
		deletions: number;
		changeType: 'added' | 'modified' | 'deleted';
		original?: string;
		modified?: string;
	}

	// Derived: Total stats
	const totalStats = $derived.by(() => {
		let additions = 0;
		let deletions = 0;
		for (const file of files) {
			additions += file.additions;
			deletions += file.deletions;
		}
		return { additions, deletions, fileCount: files.length };
	});

	// Derived: Selected file
	const selectedFile = $derived(files[selectedFileIndex] || null);

	// Derived: Monaco theme
	const effectiveTheme = $derived(getMonacoTheme(daisyTheme));

	// Derived: File extension for language
	const language = $derived.by(() => {
		if (!selectedFile) return 'plaintext';
		const ext = selectedFile.path.split('.').pop()?.toLowerCase() || '';
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

	// Fetch all diffs when drawer opens
	$effect(() => {
		if (isOpen && projectName && baselineCommit) {
			fetchAllDiffs();
		}
	});

	// Reset state when drawer closes
	$effect(() => {
		if (!isOpen) {
			error = null;
			monacoReady = false;
			selectedFileIndex = 0;
			showRequestChangesInput = false;
			feedbackText = '';
			// Dispose editor when closing - let Monaco handle model cleanup internally
			if (diffEditor) {
				try {
					diffEditor.dispose();
				} catch {
					// Ignore errors during disposal
				}
				diffEditor = null;
			}
		} else {
			// Delay Monaco initialization until after slide transition
			const timeout = setTimeout(() => {
				monacoReady = true;
			}, 300);
			return () => clearTimeout(timeout);
		}
	});

	// Initialize Monaco when ready and file is selected
	$effect(() => {
		if (monacoReady && containerRef && !loading && selectedFile?.original !== undefined && selectedFile?.modified !== undefined) {
			initMonacoDiffEditor();
		}
	});

	// Update Monaco content when selected file changes
	$effect(() => {
		if (diffEditor && monaco && selectedFile) {
			updateDiffContent();
		}
	});

	async function fetchAllDiffs() {
		loading = true;
		error = null;
		files = [];

		try {
			// First, fetch the overall diff to get the file list
			const params = new URLSearchParams({
				project: projectName,
				baseline: baselineCommit
			});
			const response = await fetch(`/api/files/git/diff?${params}`);
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to fetch diff');
			}

			// Map parsed files to our structure, determining change type
			const diffFiles: DiffFile[] = (data.files || []).map((f: any) => ({
				path: f.path,
				additions: f.additions || 0,
				deletions: f.deletions || 0,
				changeType: f.additions > 0 && f.deletions === 0 ? 'added' :
				            f.deletions > 0 && f.additions === 0 ? 'deleted' : 'modified'
			}));

			// If reviewSignal has filesModified, use that for changeType hints
			if (reviewSignal?.filesModified) {
				const modMap = new Map(reviewSignal.filesModified.map(f => [f.path, f.changeType]));
				for (const file of diffFiles) {
					const type = modMap.get(file.path);
					if (type) {
						file.changeType = type;
					}
				}
			}

			files = diffFiles;

			// Fetch content for the first file
			if (files.length > 0) {
				await fetchFileContent(0);
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load diffs';
		} finally {
			loading = false;
		}
	}

	async function fetchFileContent(index: number) {
		const file = files[index];
		if (!file || (file.original !== undefined && file.modified !== undefined)) {
			return; // Already loaded
		}

		try {
			const params = new URLSearchParams({
				project: projectName,
				baseline: baselineCommit,
				path: file.path
			});
			const response = await fetch(`/api/files/git/diff?${params}`);
			const data = await response.json();

			if (response.ok) {
				// Update the file in our array
				files = files.map((f, i) => i === index ? {
					...f,
					original: data.original ?? '',
					modified: data.modified ?? ''
				} : f);
			}
		} catch (e) {
			console.error(`Failed to fetch content for ${file.path}:`, e);
		}
	}

	async function selectFile(index: number) {
		if (index < 0 || index >= files.length) return;
		selectedFileIndex = index;
		await fetchFileContent(index);
	}

	async function initMonacoDiffEditor() {
		if (!containerRef || diffEditor) return;

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

			// Create diff editor
			diffEditor = monaco.editor.createDiffEditor(containerRef, {
				theme: effectiveTheme,
				readOnly: true,
				renderSideBySide: true,
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
				}
			});

			// Set up resize observer
			resizeObserver = new ResizeObserver(() => {
				diffEditor?.layout();
			});
			resizeObserver.observe(containerRef);

			// Set initial content
			updateDiffContent();
		} catch (err) {
			console.error('Failed to initialize Monaco Diff Editor:', err);
			error = 'Failed to load diff editor';
		}
	}

	function updateDiffContent() {
		if (!diffEditor || !monaco || !selectedFile) return;

		const filePath = selectedFile.path;
		const originalUri = monaco.Uri.parse(`review-original://${filePath}`);
		const modifiedUri = monaco.Uri.parse(`review-modified://${filePath}`);

		// Dispose existing models
		const existingOriginal = monaco.editor.getModel(originalUri);
		const existingModified = monaco.editor.getModel(modifiedUri);
		if (existingOriginal) existingOriginal.dispose();
		if (existingModified) existingModified.dispose();

		// Create new models
		const originalModel = monaco.editor.createModel(
			selectedFile.original ?? '',
			language,
			originalUri
		);
		const modifiedModel = monaco.editor.createModel(
			selectedFile.modified ?? '',
			language,
			modifiedUri
		);

		diffEditor.setModel({
			original: originalModel,
			modified: modifiedModel
		});
	}

	// Sync theme changes
	$effect(() => {
		if (monaco && diffEditor) {
			monaco.editor.setTheme(effectiveTheme);
		}
	});

	function handleClose() {
		isOpen = false;
		onClose();
	}

	function handleApprove() {
		onApprove?.();
	}

	function handleRequestChanges() {
		if (!feedbackText.trim()) return;
		onRequestChanges?.(feedbackText.trim());
		feedbackText = '';
		showRequestChangesInput = false;
	}

	// Keyboard navigation
	function handleKeyDown(e: KeyboardEvent) {
		if (!isOpen) return;

		// Escape to close
		if (e.key === 'Escape') {
			if (showRequestChangesInput) {
				showRequestChangesInput = false;
			} else {
				e.preventDefault();
				handleClose();
			}
			return;
		}

		// j/k or arrow keys to navigate files
		if ((e.key === 'j' || e.key === 'ArrowDown') && !showRequestChangesInput) {
			e.preventDefault();
			selectFile(Math.min(selectedFileIndex + 1, files.length - 1));
		} else if ((e.key === 'k' || e.key === 'ArrowUp') && !showRequestChangesInput) {
			e.preventDefault();
			selectFile(Math.max(selectedFileIndex - 1, 0));
		}
	}

	function getChangeTypeStyle(changeType: string) {
		switch (changeType) {
			case 'added':
				return { icon: '+', color: 'oklch(0.75 0.15 145)', bg: 'oklch(0.45 0.12 145 / 0.3)' };
			case 'deleted':
				return { icon: '-', color: 'oklch(0.75 0.15 25)', bg: 'oklch(0.45 0.12 25 / 0.3)' };
			case 'modified':
			default:
				return { icon: '~', color: 'oklch(0.75 0.15 85)', bg: 'oklch(0.45 0.12 85 / 0.3)' };
		}
	}

	function formatCommit(sha: string): string {
		return sha.slice(0, 7);
	}

	onDestroy(() => {
		themeObserver?.disconnect();
		resizeObserver?.disconnect();
		// Dispose the diff editor - let Monaco handle model cleanup internally
		if (diffEditor) {
			try {
				diffEditor.dispose();
			} catch {
				// Ignore errors during disposal (component may be unmounting rapidly)
			}
		}
		diffEditor = null;
		monaco = null;
	});
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if isOpen}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 bg-black/60 z-40"
		onclick={handleClose}
		role="button"
		tabindex="-1"
		aria-label="Close review diff drawer"
	></div>

	<!-- Drawer Panel -->
	<div
		class="fixed right-0 top-0 h-screen w-[95vw] max-w-[1400px] z-50 flex flex-col shadow-2xl"
		style="background: oklch(0.14 0.01 250); border-left: 1px solid oklch(0.30 0.02 250);"
		transition:slide={{ axis: 'x', duration: 200 }}
	>
		<!-- Header -->
		<div
			class="flex items-center justify-between px-4 py-3 border-b shrink-0"
			style="background: oklch(0.18 0.01 250); border-color: oklch(0.30 0.02 250);"
		>
			<div class="flex items-center gap-3">
				<!-- Review icon -->
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-5 h-5"
					style="color: oklch(0.70 0.18 200);"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
					<path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
				</svg>

				<div>
					<h2 class="font-semibold text-sm" style="color: oklch(0.85 0.02 250);">
						Review Changes
					</h2>
					<p class="text-xs" style="color: oklch(0.50 0.02 250);">
						{#if reviewSignal?.taskId}
							{reviewSignal.taskId} - {reviewSignal.taskTitle}
						{:else}
							Changes since {formatCommit(baselineCommit)}
						{/if}
					</p>
				</div>

				<!-- Stats badges -->
				<div class="flex items-center gap-2 ml-3">
					<span class="badge badge-sm" style="background: oklch(0.20 0.02 250); color: oklch(0.65 0.02 250); border: 1px solid oklch(0.30 0.02 250);">
						{totalStats.fileCount} files
					</span>
					{#if totalStats.additions > 0}
						<span class="badge badge-sm" style="background: oklch(0.45 0.12 145 / 0.3); color: oklch(0.75 0.15 145); border: none;">
							+{totalStats.additions}
						</span>
					{/if}
					{#if totalStats.deletions > 0}
						<span class="badge badge-sm" style="background: oklch(0.45 0.12 25 / 0.3); color: oklch(0.75 0.15 25); border: none;">
							-{totalStats.deletions}
						</span>
					{/if}
				</div>
			</div>

			<div class="flex items-center gap-2">
				<!-- Approve button -->
				{#if onApprove}
					<button
						onclick={handleApprove}
						class="btn btn-sm btn-success gap-1"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
						Approve
					</button>
				{/if}

				<!-- Request Changes button -->
				{#if onRequestChanges}
					<button
						onclick={() => showRequestChangesInput = !showRequestChangesInput}
						class="btn btn-sm btn-warning gap-1"
						class:btn-active={showRequestChangesInput}
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
						</svg>
						Request Changes
					</button>
				{/if}

				<!-- Close button -->
				<button
					onclick={handleClose}
					class="btn btn-xs btn-ghost"
					title="Close (Escape)"
					style="color: oklch(0.55 0.02 250);"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		</div>

		<!-- Request changes input -->
		{#if showRequestChangesInput}
			<div
				class="px-4 py-3 border-b flex items-center gap-2"
				style="background: oklch(0.16 0.01 250); border-color: oklch(0.30 0.02 250);"
			>
				<input
					type="text"
					bind:value={feedbackText}
					placeholder="Describe the changes you'd like..."
					class="input input-sm flex-1"
					style="background: oklch(0.20 0.02 250); border-color: oklch(0.35 0.02 250); color: oklch(0.85 0.02 250);"
					onkeydown={(e) => e.key === 'Enter' && handleRequestChanges()}
				/>
				<button
					onclick={handleRequestChanges}
					disabled={!feedbackText.trim()}
					class="btn btn-sm btn-warning"
				>
					Send
				</button>
			</div>
		{/if}

		<!-- Main Content Area -->
		<div class="flex-1 flex overflow-hidden">
			<!-- File List (left sidebar) -->
			<div
				class="w-64 shrink-0 flex flex-col border-r overflow-hidden"
				style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250);"
			>
				<div class="px-3 py-2 border-b" style="border-color: oklch(0.25 0.02 250);">
					<span class="text-xs font-semibold" style="color: oklch(0.55 0.02 250);">
						CHANGED FILES
					</span>
				</div>
				<div class="flex-1 overflow-y-auto">
					{#if loading}
						<div class="flex items-center justify-center h-full">
							<span class="loading loading-spinner loading-sm" style="color: oklch(0.65 0.15 200);"></span>
						</div>
					{:else if files.length === 0}
						<div class="p-4 text-center text-sm" style="color: oklch(0.50 0.02 250);">
							No changes found
						</div>
					{:else}
						{#each files as file, index}
							{@const style = getChangeTypeStyle(file.changeType)}
							<button
								class="w-full px-3 py-2 flex items-center gap-2 text-left transition-colors"
								class:selected={index === selectedFileIndex}
								style="background: {index === selectedFileIndex ? 'oklch(0.25 0.03 200 / 0.3)' : 'transparent'}; border-left: 2px solid {index === selectedFileIndex ? 'oklch(0.65 0.15 200)' : 'transparent'};"
								onclick={() => selectFile(index)}
							>
								<!-- Change type indicator -->
								<span
									class="w-5 h-5 flex items-center justify-center rounded text-xs font-bold shrink-0"
									style="background: {style.bg}; color: {style.color};"
								>
									{style.icon}
								</span>

								<!-- File name -->
								<span
									class="flex-1 text-xs font-mono truncate"
									style="color: {index === selectedFileIndex ? 'oklch(0.85 0.02 250)' : 'oklch(0.70 0.02 250)'};"
									title={file.path}
								>
									{file.path.split('/').pop()}
								</span>

								<!-- Line stats -->
								<span class="text-[10px] font-mono shrink-0" style="color: oklch(0.50 0.02 250);">
									{#if file.additions > 0}
										<span style="color: oklch(0.65 0.12 145);">+{file.additions}</span>
									{/if}
									{#if file.deletions > 0}
										<span style="color: oklch(0.65 0.12 25);">-{file.deletions}</span>
									{/if}
								</span>
							</button>
						{/each}
					{/if}
				</div>
			</div>

			<!-- Diff Editor (main area) -->
			<div class="flex-1 flex flex-col overflow-hidden">
				{#if selectedFile}
					<!-- File path header -->
					<div
						class="px-4 py-2 border-b flex items-center justify-between"
						style="background: oklch(0.15 0.01 250); border-color: oklch(0.25 0.02 250);"
					>
						<span class="text-xs font-mono" style="color: oklch(0.65 0.02 250);">
							{selectedFile.path}
						</span>
						<span class="text-[10px]" style="color: oklch(0.45 0.02 250);">
							{language}
						</span>
					</div>
				{/if}

				<!-- Monaco container -->
				<div class="flex-1 overflow-hidden">
					{#if loading || !monacoReady}
						<div class="flex items-center justify-center h-full">
							<div class="flex flex-col items-center gap-3">
								<span class="loading loading-spinner loading-lg" style="color: oklch(0.65 0.15 200);"></span>
								<span class="text-sm font-mono" style="color: oklch(0.55 0.02 250);">Loading diff...</span>
							</div>
						</div>
					{:else if error}
						<div class="flex items-center justify-center h-full p-4">
							<div class="alert alert-error max-w-md">
								<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								<div>
									<h3 class="font-bold">Failed to load diff</h3>
									<p class="text-sm">{error}</p>
								</div>
								<button onclick={fetchAllDiffs} class="btn btn-sm">Retry</button>
							</div>
						</div>
					{:else if files.length === 0}
						<div class="flex items-center justify-center h-full p-4">
							<div class="text-center">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12 mx-auto mb-3" style="color: oklch(0.45 0.02 250);">
									<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
								</svg>
								<p class="text-sm" style="color: oklch(0.55 0.02 250);">No changes to review</p>
							</div>
						</div>
					{:else if selectedFile?.original === undefined || selectedFile?.modified === undefined}
						<div class="flex items-center justify-center h-full">
							<span class="loading loading-spinner loading-md" style="color: oklch(0.65 0.15 200);"></span>
						</div>
					{:else}
						<div class="monaco-diff-wrapper" bind:this={containerRef}></div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Footer -->
		<div
			class="flex items-center justify-between px-4 py-2 border-t text-xs font-mono shrink-0"
			style="background: oklch(0.16 0.01 250); border-color: oklch(0.30 0.02 250); color: oklch(0.45 0.02 250);"
		>
			<div class="flex items-center gap-3">
				<span>Baseline: {formatCommit(baselineCommit)}</span>
				<span>|</span>
				<span>{files.length > 0 ? `${selectedFileIndex + 1}/${files.length}` : '0/0'}</span>
			</div>
			<div class="flex items-center gap-3">
				<span>j/k: Navigate</span>
				<span>|</span>
				<span>Esc: Close</span>
			</div>
		</div>
	</div>
{/if}

<style>
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
