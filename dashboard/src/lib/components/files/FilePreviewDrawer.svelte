<script lang="ts">
	/**
	 * FilePreviewDrawer Component
	 * Slide-in drawer for quick file preview/editing without losing context
	 *
	 * Features:
	 * - Right-side drawer (doesn't block main content)
	 * - Monaco editor with syntax highlighting
	 * - Read-only by default, toggle to edit mode
	 * - Line number deep linking (scrolls to line)
	 * - Save functionality in edit mode
	 * - Open in /files button for full experience
	 */

	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { slide } from 'svelte/transition';
	import MonacoWrapper from '$lib/components/config/MonacoWrapper.svelte';
	import { generateFilesPageUrl } from '$lib/utils/fileLinks';

	// Props
	let {
		isOpen = $bindable(false),
		filePath = $bindable(''),
		projectName = $bindable(''),
		lineNumber = $bindable<number | null>(null),
		onClose = () => {}
	}: {
		isOpen?: boolean;
		filePath?: string;
		projectName?: string;
		lineNumber?: number | null;
		onClose?: () => void;
	} = $props();

	// State
	let content = $state('');
	let originalContent = $state('');
	let language = $state('plaintext');
	let loading = $state(false);

	/**
	 * Map language IDs to Monaco-supported languages.
	 * Monaco doesn't have native support for some languages,
	 * so we map them to the closest equivalent.
	 */
	function toMonacoLanguage(lang: string): string {
		const monacoMapping: Record<string, string> = {
			svelte: 'html',
			vue: 'html',
			astro: 'html'
		};
		return monacoMapping[lang] || lang;
	}
	let error = $state<string | null>(null);
	let isEditing = $state(false);
	let isSaving = $state(false);
	let saveError = $state<string | null>(null);
	let lastSaved = $state<Date | null>(null);
	let monacoRef: { focus: () => void; layout: () => void } | undefined = $state(undefined);
	// Monaco needs to be mounted AFTER the drawer animation completes
	let monacoReady = $state(false);

	// Derived: Is content modified?
	const isDirty = $derived(content !== originalContent);

	// Derived: File name from path
	const fileName = $derived(filePath.split('/').pop() || filePath);

	// Derived: URL to open in full /files page
	const filesPageUrl = $derived(generateFilesPageUrl(filePath, projectName));

	// Fetch file content when path changes
	$effect(() => {
		if (isOpen && filePath && projectName) {
			fetchFileContent();
		}
	});

	// Reset state when drawer closes, delay Monaco mount when opening
	$effect(() => {
		if (!isOpen) {
			isEditing = false;
			error = null;
			saveError = null;
			monacoReady = false;
		} else {
			// Delay Monaco initialization until after slide transition (200ms) completes
			const timeout = setTimeout(() => {
				monacoReady = true;
			}, 250);
			return () => clearTimeout(timeout);
		}
	});

	// Scroll to line when monaco is ready and line number is set
	$effect(() => {
		if (monacoRef && lineNumber && !loading) {
			// Monaco line scrolling is handled via the Monaco API
			// For now, we'll rely on the initial value positioning
			// A more robust implementation would expose a goToLine method
			setTimeout(() => {
				monacoRef?.focus();
			}, 100);
		}
	});

	async function fetchFileContent() {
		loading = true;
		error = null;

		try {
			const url = `/api/files/content?project=${encodeURIComponent(projectName)}&path=${encodeURIComponent(filePath)}`;
			const response = await fetch(url);
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to fetch file');
			}

			content = data.content;
			originalContent = data.content;
			language = data.language || 'plaintext';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load file';
			content = '';
			originalContent = '';
		} finally {
			loading = false;
		}
	}

	async function saveFile() {
		if (!isDirty || isSaving) return;

		isSaving = true;
		saveError = null;

		try {
			const url = `/api/files/content?project=${encodeURIComponent(projectName)}&path=${encodeURIComponent(filePath)}`;
			const response = await fetch(url, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content })
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to save file');
			}

			originalContent = content;
			lastSaved = new Date();

			// Auto-switch back to view mode after save
			isEditing = false;
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Failed to save file';
		} finally {
			isSaving = false;
		}
	}

	function handleContentChange(newContent: string) {
		content = newContent;
	}

	function toggleEditMode() {
		if (isEditing && isDirty) {
			// If switching from edit to view with unsaved changes, confirm
			if (!confirm('You have unsaved changes. Discard them?')) {
				return;
			}
			content = originalContent;
		}
		isEditing = !isEditing;
	}

	function handleClose() {
		if (isDirty) {
			if (!confirm('You have unsaved changes. Close anyway?')) {
				return;
			}
			content = originalContent;
		}
		isOpen = false;
		onClose();
	}

	function openInFilesPage() {
		window.open(filesPageUrl, '_blank');
	}

	// Handle keyboard shortcuts
	function handleKeyDown(e: KeyboardEvent) {
		if (!isOpen) return;

		// Escape to close (unless editing with unsaved changes)
		if (e.key === 'Escape') {
			e.preventDefault();
			handleClose();
		}

		// Ctrl+S to save (in edit mode)
		if ((e.ctrlKey || e.metaKey) && e.key === 's' && isEditing) {
			e.preventDefault();
			saveFile();
		}

		// Ctrl+E to toggle edit mode
		if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
			e.preventDefault();
			toggleEditMode();
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if isOpen}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 bg-black/50 z-40"
		onclick={handleClose}
		role="button"
		tabindex="-1"
		aria-label="Close file preview"
	></div>

	<!-- Drawer Panel -->
	<div
		class="fixed right-0 top-0 h-screen w-[700px] max-w-[90vw] z-50 flex flex-col shadow-2xl"
		style="background: oklch(0.14 0.01 250); border-left: 1px solid oklch(0.30 0.02 250);"
		transition:slide={{ axis: 'x', duration: 200 }}
	>
		<!-- Header -->
		<div
			class="flex items-center justify-between px-4 py-3 border-b shrink-0"
			style="background: oklch(0.18 0.01 250); border-color: oklch(0.30 0.02 250);"
		>
			<div class="flex items-center gap-3 min-w-0">
				<!-- File icon -->
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-5 h-5 shrink-0"
					style="color: oklch(0.70 0.18 200);"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
				</svg>

				<!-- File name and path -->
				<div class="min-w-0">
					<h2 class="font-mono text-sm font-semibold truncate" style="color: oklch(0.85 0.02 250);">
						{fileName}
					</h2>
					<p class="text-xs truncate" style="color: oklch(0.50 0.02 250);">
						{filePath}
					</p>
				</div>

				<!-- Dirty indicator -->
				{#if isDirty}
					<span class="badge badge-sm badge-warning">unsaved</span>
				{/if}
			</div>

			<div class="flex items-center gap-2">
				<!-- Edit/View toggle -->
				<button
					onclick={toggleEditMode}
					class="btn btn-xs"
					class:btn-primary={isEditing}
					class:btn-ghost={!isEditing}
					title={isEditing ? 'Switch to View mode (Ctrl+E)' : 'Switch to Edit mode (Ctrl+E)'}
				>
					{#if isEditing}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
							<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
						<span>View</span>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
						</svg>
						<span>Edit</span>
					{/if}
				</button>

				<!-- Save button (only in edit mode with changes) -->
				{#if isEditing && isDirty}
					<button
						onclick={saveFile}
						class="btn btn-xs btn-success"
						disabled={isSaving}
						title="Save (Ctrl+S)"
					>
						{#if isSaving}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3" />
							</svg>
						{/if}
						<span>Save</span>
					</button>
				{/if}

				<!-- Open in /files button -->
				<button
					onclick={openInFilesPage}
					class="btn btn-xs btn-ghost"
					title="Open in /files page (full editor)"
					style="color: oklch(0.60 0.02 250);"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
					</svg>
				</button>

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

		<!-- Save status bar -->
		{#if saveError}
			<div class="px-4 py-2 border-b" style="background: oklch(0.25 0.10 25); border-color: oklch(0.40 0.15 25);">
				<span class="text-xs" style="color: oklch(0.75 0.15 25);">
					Error: {saveError}
				</span>
			</div>
		{:else if lastSaved}
			<div class="px-4 py-1 border-b" style="background: oklch(0.20 0.08 150); border-color: oklch(0.30 0.10 150);">
				<span class="text-xs" style="color: oklch(0.70 0.12 150);">
					Saved {lastSaved.toLocaleTimeString()}
				</span>
			</div>
		{/if}

		<!-- Content Area -->
		<div class="flex-1 overflow-hidden">
			{#if loading || !monacoReady}
				<div class="flex items-center justify-center h-full">
					<div class="flex flex-col items-center gap-3">
						<span class="loading loading-spinner loading-lg" style="color: oklch(0.65 0.15 200);"></span>
						<span class="text-sm font-mono" style="color: oklch(0.55 0.02 250);">Loading file...</span>
					</div>
				</div>
			{:else if error}
				<div class="flex items-center justify-center h-full p-4">
					<div class="alert alert-error max-w-md">
						<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<div>
							<h3 class="font-bold">Failed to load file</h3>
							<p class="text-sm">{error}</p>
						</div>
						<button onclick={fetchFileContent} class="btn btn-sm">Retry</button>
					</div>
				</div>
			{:else}
				<MonacoWrapper
					bind:this={monacoRef}
					value={content}
					language={toMonacoLanguage(language)}
					readonly={!isEditing}
					onchange={handleContentChange}
				/>
			{/if}
		</div>

		<!-- Footer -->
		<div
			class="flex items-center justify-between px-4 py-2 border-t text-xs font-mono shrink-0"
			style="background: oklch(0.16 0.01 250); border-color: oklch(0.30 0.02 250); color: oklch(0.45 0.02 250);"
		>
			<div class="flex items-center gap-3">
				<span>{language}</span>
				{#if lineNumber}
					<span>Line {lineNumber}</span>
				{/if}
			</div>
			<div class="flex items-center gap-2">
				<span class:text-warning={isEditing}>
					{isEditing ? 'Editing' : 'Read-only'}
				</span>
				<span>|</span>
				<span>Ctrl+E: Toggle Edit</span>
				{#if isEditing}
					<span>|</span>
					<span>Ctrl+S: Save</span>
				{/if}
			</div>
		</div>
	</div>
{/if}
