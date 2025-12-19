<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import loader from '@monaco-editor/loader';
	import type * as Monaco from 'monaco-editor';

	// Props
	let {
		value = $bindable(''),
		language = 'markdown',
		theme = 'vs-dark',
		readonly = false,
		onchange = undefined
	}: {
		value?: string;
		language?: string;
		theme?: string;
		readonly?: boolean;
		onchange?: (value: string) => void;
	} = $props();

	// State
	let containerRef: HTMLDivElement | null = $state(null);
	let editor: Monaco.editor.IStandaloneCodeEditor | null = $state(null);
	let monaco: typeof Monaco | null = $state(null);
	let isReady = $state(false);
	let resizeObserver: ResizeObserver | null = null;

	// Initialize Monaco Editor
	onMount(async () => {
		if (!containerRef) return;

		try {
			// Load Monaco using the loader
			monaco = await loader.init();

			// Create editor instance
			editor = monaco.editor.create(containerRef, {
				value: value,
				language: language,
				theme: theme,
				readOnly: readonly,
				// Editor options per spec
				minimap: { enabled: false },
				wordWrap: 'on',
				lineNumbers: 'on',
				fontSize: 14,
				// Additional helpful options
				scrollBeyondLastLine: false,
				automaticLayout: false, // We handle resize ourselves
				tabSize: 2,
				insertSpaces: false,
				renderWhitespace: 'selection',
				folding: true,
				lineDecorationsWidth: 8,
				lineNumbersMinChars: 3,
				padding: { top: 8, bottom: 8 },
				scrollbar: {
					useShadows: false,
					verticalScrollbarSize: 10,
					horizontalScrollbarSize: 10
				}
			});

			// Listen for content changes
			editor.onDidChangeModelContent(() => {
				const newValue = editor?.getValue() ?? '';
				if (newValue !== value) {
					value = newValue;
					onchange?.(newValue);
				}
			});

			// Set up resize observer for auto-layout
			resizeObserver = new ResizeObserver(() => {
				editor?.layout();
			});
			resizeObserver.observe(containerRef);

			isReady = true;
		} catch (error) {
			console.error('Failed to initialize Monaco Editor:', error);
		}
	});

	// Handle cleanup
	onDestroy(() => {
		resizeObserver?.disconnect();
		editor?.dispose();
		editor = null;
		monaco = null;
	});

	// Sync external value changes to editor
	$effect(() => {
		if (editor && isReady) {
			const currentValue = editor.getValue();
			if (value !== currentValue) {
				// Preserve cursor position when syncing external changes
				const position = editor.getPosition();
				editor.setValue(value);
				if (position) {
					editor.setPosition(position);
				}
			}
		}
	});

	// Sync language changes
	$effect(() => {
		if (editor && monaco && isReady) {
			const model = editor.getModel();
			if (model) {
				monaco.editor.setModelLanguage(model, language);
			}
		}
	});

	// Sync theme changes
	$effect(() => {
		if (monaco && isReady) {
			monaco.editor.setTheme(theme);
		}
	});

	// Sync readonly changes
	$effect(() => {
		if (editor && isReady) {
			editor.updateOptions({ readOnly: readonly });
		}
	});

	// Expose focus method
	export function focus() {
		editor?.focus();
	}

	// Expose layout method for manual resize triggers
	export function layout() {
		editor?.layout();
	}
</script>

<div class="monaco-wrapper" bind:this={containerRef}>
	{#if !isReady}
		<div class="loading-placeholder">
			<span class="loading loading-spinner loading-md"></span>
			<span class="ml-2 text-base-content/60">Loading editor...</span>
		</div>
	{/if}
</div>

<style>
	.monaco-wrapper {
		width: 100%;
		height: 100%;
		min-height: 200px;
		position: relative;
	}

	.loading-placeholder {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: oklch(0.25 0.02 260);
		border-radius: 0.5rem;
	}

	/* Ensure Monaco fills the container */
	.monaco-wrapper :global(.monaco-editor) {
		position: absolute !important;
		inset: 0;
	}
</style>
