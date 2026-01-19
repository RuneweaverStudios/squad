<script lang="ts">
	/**
	 * ScriptEditorDrawer - Drawer for viewing/editing hook script files
	 *
	 * Opens from the right side and displays a file in a Monaco editor
	 * with shell syntax highlighting. Supports loading and saving files.
	 */

	import MonacoWrapper from './MonacoWrapper.svelte';

	// Props
	let {
		isOpen = $bindable(false),
		filePath = '',
		onClose = () => {},
		onSave = () => {}
	}: {
		isOpen: boolean;
		filePath: string;
		onClose?: () => void;
		onSave?: (path: string, content: string) => void;
	} = $props();

	// State
	let content = $state('');
	let originalContent = $state('');
	let loading = $state(true); // Start true - file must be loaded when drawer opens
	let saving = $state(false);
	let error = $state<string | null>(null);
	let saveSuccess = $state(false);

	// Derived
	const isDirty = $derived(content !== originalContent);
	const filename = $derived(filePath.split('/').pop() || filePath);

	// Get language from file extension
	function getLanguage(path: string): string {
		const ext = path.split('.').pop()?.toLowerCase() || '';
		const languageMap: Record<string, string> = {
			sh: 'shell',
			bash: 'shell',
			zsh: 'shell',
			js: 'javascript',
			ts: 'typescript',
			py: 'python',
			json: 'json',
			yaml: 'yaml',
			yml: 'yaml',
			md: 'markdown'
		};
		return languageMap[ext] || 'shell'; // Default to shell for hook scripts
	}

	const language = $derived(getLanguage(filePath));

	// Load file content when drawer opens
	// Use setTimeout to ensure drawer animation completes and DOM is ready for Monaco
	$effect(() => {
		if (isOpen && filePath) {
			setTimeout(() => loadFile(), 50);
		}
	});

	// Reset state when drawer closes
	$effect(() => {
		if (!isOpen) {
			content = '';
			originalContent = '';
			loading = true; // Reset to true so next open shows loading state
			error = null;
			saveSuccess = false;
		}
	});

	async function loadFile() {
		if (!filePath) return;

		loading = true;
		error = null;

		try {
			const response = await fetch(`/api/files/content?path=${encodeURIComponent(filePath)}`);
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to load file');
			}

			content = data.content || '';
			originalContent = content;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load file';
			content = '';
			originalContent = '';
		} finally {
			loading = false;
		}
	}

	async function saveFile() {
		if (!filePath || !isDirty) return;

		saving = true;
		error = null;
		saveSuccess = false;

		try {
			const response = await fetch(`/api/files/content?path=${encodeURIComponent(filePath)}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content })
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to save file');
			}

			originalContent = content;
			saveSuccess = true;
			onSave(filePath, content);

			// Clear success message after 2 seconds
			setTimeout(() => {
				saveSuccess = false;
			}, 2000);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save file';
		} finally {
			saving = false;
		}
	}

	function handleContentChange(newContent: string) {
		content = newContent;
	}

	function handleClose() {
		if (isDirty) {
			// Could add a confirmation dialog here
			// For now, just close
		}
		isOpen = false;
		onClose();
	}

	function handleOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			handleClose();
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (!isOpen) return;

		// Escape to close
		if (e.key === 'Escape') {
			e.preventDefault();
			handleClose();
		}

		// Ctrl+S to save
		if ((e.ctrlKey || e.metaKey) && e.key === 's') {
			e.preventDefault();
			saveFile();
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if isOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="drawer-overlay" onclick={handleOverlayClick}>
		<div class="drawer-panel">
			<!-- Header -->
			<div class="drawer-header">
				<div class="header-title">
					<svg class="w-5 h-5 text-base-content/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
					</svg>
					<span class="font-semibold">{filename}</span>
					{#if isDirty}
						<span class="dirty-indicator" title="Unsaved changes"></span>
					{/if}
				</div>
				<div class="header-path" title={filePath}>
					{filePath}
				</div>
				<button class="close-btn" onclick={handleClose} title="Close (Esc)">
					<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Content -->
			<div class="drawer-content">
				{#if loading}
					<div class="loading-state">
						<span class="loading loading-spinner loading-md"></span>
						<span>Loading file...</span>
					</div>
				{:else if error}
					<div class="error-state">
						<svg class="w-8 h-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<span class="text-error">{error}</span>
						<button class="btn btn-sm btn-ghost" onclick={loadFile}>Retry</button>
					</div>
				{:else}
					<MonacoWrapper
						value={content}
						{language}
						onchange={handleContentChange}
					/>
				{/if}
			</div>

			<!-- Footer -->
			<div class="drawer-footer">
				{#if saveSuccess}
					<div class="save-success">
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
						</svg>
						<span>Saved</span>
					</div>
				{/if}
				<div class="footer-actions">
					<button class="btn btn-sm btn-ghost" onclick={handleClose}>
						Close
					</button>
					<button
						class="btn btn-sm btn-primary"
						class:btn-disabled={!isDirty || saving}
						disabled={!isDirty || saving}
						onclick={saveFile}
					>
						{#if saving}
							<span class="loading loading-spinner loading-xs"></span>
							Saving...
						{:else}
							Save
						{/if}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.drawer-overlay {
		position: fixed;
		inset: 0;
		background: oklch(0.08 0.01 250 / 0.75);
		z-index: 50;
		animation: fadeIn 0.15s ease;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.drawer-panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 700px;
		max-width: 90vw;
		background: oklch(0.16 0.01 250);
		border-left: 1px solid oklch(0.25 0.02 250);
		display: flex;
		flex-direction: column;
		animation: slideIn 0.2s ease;
		box-shadow: -10px 0 40px oklch(0.05 0 0 / 0.5);
	}

	@keyframes slideIn {
		from {
			transform: translateX(100%);
		}
		to {
			transform: translateX(0);
		}
	}

	.drawer-header {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 1rem 1.25rem;
		background: oklch(0.18 0.02 250);
		border-bottom: 1px solid oklch(0.25 0.02 250);
		position: relative;
	}

	.header-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: oklch(0.92 0.02 250);
		font-size: 1rem;
	}

	.header-path {
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
		font-family: ui-monospace, monospace;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding-right: 2.5rem;
	}

	.dirty-indicator {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: oklch(0.75 0.18 55);
		animation: pulse-dirty 2s ease infinite;
	}

	@keyframes pulse-dirty {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}

	.close-btn {
		position: absolute;
		top: 1rem;
		right: 1rem;
		padding: 0.375rem;
		border-radius: 0.375rem;
		background: transparent;
		border: none;
		color: oklch(0.55 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.close-btn:hover {
		background: oklch(0.25 0.02 250);
		color: oklch(0.85 0.02 250);
	}

	.drawer-content {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.loading-state,
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: 1rem;
		color: oklch(0.65 0.02 250);
	}

	.drawer-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1.25rem;
		background: oklch(0.18 0.02 250);
		border-top: 1px solid oklch(0.25 0.02 250);
	}

	.save-success {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		color: oklch(0.75 0.18 145);
		font-size: 0.875rem;
		animation: fadeIn 0.2s ease;
	}

	.footer-actions {
		display: flex;
		gap: 0.5rem;
		margin-left: auto;
	}
</style>
