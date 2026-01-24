<script lang="ts">
	/**
	 * InlineDiffViewer - A simple Monaco diff editor for comparing two strings
	 *
	 * Used by FileEditor to show diff between local content and disk content
	 * when external changes are detected.
	 */

	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import loader from '@monaco-editor/loader';
	import type * as Monaco from 'monaco-editor';
	import { getMonacoTheme } from '$lib/utils/themeManager';

	// Props
	let {
		original = '',
		modified = '',
		language = 'plaintext'
	}: {
		original: string;
		modified: string;
		language?: string;
	} = $props();

	// State
	let containerRef: HTMLDivElement | null = $state(null);
	let diffEditor: Monaco.editor.IStandaloneDiffEditor | null = $state(null);
	let monaco: typeof Monaco | null = $state(null);
	let resizeObserver: ResizeObserver | null = null;
	let themeObserver: MutationObserver | null = null;
	let daisyTheme = $state('nord');

	// Derived: Monaco theme
	const effectiveTheme = $derived(getMonacoTheme(daisyTheme));

	// Initialize editor when container is ready
	$effect(() => {
		if (browser && containerRef && !diffEditor) {
			initEditor();
		}
	});

	// Update content when props change
	$effect(() => {
		if (diffEditor && monaco) {
			const model = diffEditor.getModel();
			if (model) {
				// Only update if content actually changed
				if (model.original.getValue() !== original) {
					model.original.setValue(original);
				}
				if (model.modified.getValue() !== modified) {
					model.modified.setValue(modified);
				}
			}
		}
	});

	// Sync theme changes
	$effect(() => {
		if (monaco && diffEditor) {
			monaco.editor.setTheme(effectiveTheme);
		}
	});

	async function initEditor() {
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

			if (!monaco || !containerRef) return;

			// Create models
			const timestamp = Date.now();
			const originalUri = monaco.Uri.parse(`inline-diff-original-${timestamp}://content`);
			const modifiedUri = monaco.Uri.parse(`inline-diff-modified-${timestamp}://content`);

			const originalModel = monaco.editor.createModel(original, language, originalUri);
			const modifiedModel = monaco.editor.createModel(modified, language, modifiedUri);

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

			diffEditor.setModel({
				original: originalModel,
				modified: modifiedModel
			});

			// Set up resize observer
			resizeObserver = new ResizeObserver(() => {
				diffEditor?.layout();
			});
			resizeObserver.observe(containerRef);

		} catch (err) {
			console.error('Failed to initialize Monaco Diff Editor:', err);
		}
	}

	onDestroy(() => {
		themeObserver?.disconnect();
		resizeObserver?.disconnect();
		// Dispose the diff editor - let Monaco handle model cleanup internally
		// Note: We don't manually dispose models or call setModel(null) because:
		// Monaco's editor.dispose() properly cleans up its own model references
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

<div class="inline-diff-viewer" bind:this={containerRef}></div>

<style>
	.inline-diff-viewer {
		width: 100%;
		height: 100%;
		position: relative;
	}

	.inline-diff-viewer :global(.monaco-editor),
	.inline-diff-viewer :global(.monaco-diff-editor) {
		position: absolute !important;
		inset: 0;
	}
</style>
