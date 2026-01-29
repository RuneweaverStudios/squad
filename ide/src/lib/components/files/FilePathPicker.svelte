<script lang="ts">
	/**
	 * FilePathPicker Component
	 *
	 * A reusable component for selecting/entering file paths with directory context.
	 * Used by:
	 * - LLMTransformModal (save LLM results to file)
	 * - FileTree (new file/folder creation)
	 * - Other file creation workflows
	 *
	 * Features:
	 * - Shows current directory context ("In: /path/to/dir/")
	 * - Filename input with validation
	 * - Real-time path validation (checks if dirs exist, warns on overwrite)
	 * - File type icon preview
	 */

	import { fade } from 'svelte/transition';

	type ValidationStatus = 'idle' | 'checking' | 'valid' | 'warning' | 'error';

	interface Props {
		/** Current directory path (where file will be created) */
		basePath: string;
		/** Project root path for display truncation */
		projectPath?: string;
		/** Project name for API calls */
		project?: string;
		/** Initial filename value */
		filename?: string;
		/** Type of item being created */
		type?: 'file' | 'folder';
		/** Placeholder text for input */
		placeholder?: string;
		/** Whether the input should be focused on mount */
		autofocus?: boolean;
		/** Whether to validate the path as user types */
		validatePath?: boolean;
		/** Callback when filename changes */
		onFilenameChange?: (filename: string) => void;
		/** Callback when confirmed (Enter or button) */
		onConfirm?: (fullPath: string, filename: string) => void;
		/** Callback when cancelled */
		onCancel?: () => void;
		/** Error message to display */
		error?: string;
		/** Whether to show the confirm/cancel buttons */
		showButtons?: boolean;
		/** Confirm button text */
		confirmText?: string;
		/** Whether confirm is disabled */
		confirmDisabled?: boolean;
	}

	let {
		basePath = '',
		projectPath = '',
		project = '',
		filename = $bindable(''),
		type = 'file',
		placeholder = 'filename.ext',
		autofocus = true,
		validatePath = true,
		onFilenameChange,
		onConfirm,
		onCancel,
		error = '',
		showButtons = true,
		confirmText = 'Create',
		confirmDisabled = false
	}: Props = $props();

	let inputRef = $state<HTMLInputElement | null>(null);
	let hasInitialized = $state(false);

	// Validation state
	let validationStatus = $state<ValidationStatus>('idle');
	let validationMessage = $state<string | null>(null);
	let validationTimeout: ReturnType<typeof setTimeout>;

	// Validate the path when filename changes
	async function validateFilePath() {
		if (!validatePath || !filename.trim() || !project) {
			validationStatus = 'idle';
			validationMessage = null;
			return;
		}

		validationStatus = 'checking';
		validationMessage = null;

		try {
			const pathToCheck = fullPath();
			const response = await fetch(
				`/api/files/validate?path=${encodeURIComponent(pathToCheck)}&project=${encodeURIComponent(project)}&type=${type}`,
				{ signal: AbortSignal.timeout(5000) }
			);

			if (!response.ok) {
				const data = await response.json();
				validationStatus = 'error';
				validationMessage = data.error || 'Invalid path';
				return;
			}

			const data = await response.json();

			if (data.exists) {
				// File/folder already exists
				validationStatus = 'warning';
				validationMessage = type === 'folder'
					? 'Folder already exists'
					: 'File exists - will overwrite';
			} else if (data.parentExists === false) {
				// Parent directory doesn't exist - will be created
				validationStatus = 'warning';
				validationMessage = `Will create: ${data.newDirs || 'new directories'}`;
			} else {
				validationStatus = 'valid';
				validationMessage = null;
			}
		} catch (err) {
			if (err instanceof Error && err.name === 'AbortError') {
				validationStatus = 'idle';
			} else {
				console.error('[FilePathPicker] Validation error:', err);
				validationStatus = 'idle'; // Don't block on validation errors
			}
		}
	}

	// Debounced validation
	function triggerValidation() {
		clearTimeout(validationTimeout);
		validationTimeout = setTimeout(validateFilePath, 400);
	}

	// Compute display path (truncated from project root)
	const displayBasePath = $derived(() => {
		if (!basePath) return '/';
		if (projectPath && basePath.startsWith(projectPath)) {
			const relative = basePath.slice(projectPath.length);
			return relative.startsWith('/') ? relative : '/' + relative;
		}
		return basePath;
	});

	// Compute full path
	const fullPath = $derived(() => {
		const base = basePath.endsWith('/') ? basePath : basePath + '/';
		return base + filename;
	});

	// Compute display full path (shows what will be created, truncated from project root)
	const displayFullPath = $derived(() => {
		const full = fullPath();
		if (projectPath && full.startsWith(projectPath)) {
			const relative = full.slice(projectPath.length);
			return relative.startsWith('/') ? relative : '/' + relative;
		}
		return full;
	});

	// Check if filename includes subdirectories
	const hasSubdirs = $derived(() => filename.includes('/'));

	// Get just the filename part (after last /)
	const justFilename = $derived(() => {
		const parts = filename.split('/');
		return parts[parts.length - 1] || '';
	});

	// Compute file extension for icon (from the actual filename, not path)
	const extension = $derived(() => {
		if (type === 'folder') return 'folder';
		const fname = justFilename();
		const parts = fname.split('.');
		return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
	});

	// Handle keydown
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && filename.trim() && !confirmDisabled) {
			e.preventDefault();
			onConfirm?.(fullPath(), filename);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onCancel?.();
		}
	}

	// Focus input on mount (only once)
	$effect(() => {
		if (autofocus && inputRef && !hasInitialized) {
			hasInitialized = true;
			inputRef.focus();
			// Select filename without extension for easier renaming
			const currentFilename = filename;
			if (currentFilename && type === 'file') {
				const dotIndex = currentFilename.lastIndexOf('.');
				if (dotIndex > 0) {
					inputRef.setSelectionRange(0, dotIndex);
				} else {
					inputRef.select();
				}
			}
		}
	});

	// Notify parent of filename changes and trigger validation
	$effect(() => {
		if (hasInitialized) {
			onFilenameChange?.(filename);
			triggerValidation();
		}
	});

	// Get icon color based on extension
	function getIconColor(ext: string): string {
		const colors: Record<string, string> = {
			ts: 'oklch(0.65 0.15 230)',      // Blue
			tsx: 'oklch(0.65 0.15 230)',
			js: 'oklch(0.75 0.15 85)',       // Yellow
			jsx: 'oklch(0.75 0.15 85)',
			json: 'oklch(0.70 0.15 145)',    // Green
			md: 'oklch(0.60 0.02 250)',      // Gray
			css: 'oklch(0.65 0.15 320)',     // Pink
			scss: 'oklch(0.65 0.15 320)',
			svelte: 'oklch(0.65 0.18 25)',   // Orange
			vue: 'oklch(0.65 0.15 145)',     // Green
			html: 'oklch(0.65 0.15 25)',     // Orange
			folder: 'oklch(0.75 0.15 85)'    // Yellow
		};
		return colors[ext] || 'oklch(0.55 0.02 250)';
	}
</script>

<div class="file-path-picker" transition:fade={{ duration: 100 }}>
	<!-- Path context - shows full path preview when typing subdirs -->
	<div class="path-context">
		{#if hasSubdirs() || filename}
			<span class="path-label">Path:</span>
			<span class="path-value path-preview" title={fullPath()}>
				{displayFullPath() || '/'}
			</span>
		{:else}
			<span class="path-label">In:</span>
			<span class="path-value" title={basePath}>
				{displayBasePath() || '/'}
			</span>
		{/if}
	</div>

	<!-- Input row -->
	<div class="input-row">
		<!-- File/folder icon -->
		<div class="icon" style="color: {getIconColor(extension())}">
			{#if type === 'folder'}
				<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
					<path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z"/>
				</svg>
			{:else}
				<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
				</svg>
			{/if}
		</div>

		<!-- Filename input -->
		<input
			bind:this={inputRef}
			type="text"
			bind:value={filename}
			onkeydown={handleKeydown}
			{placeholder}
			class="filename-input"
			class:has-error={!!error || validationStatus === 'error'}
			class:has-warning={validationStatus === 'warning'}
			class:has-valid={validationStatus === 'valid'}
		/>

		<!-- Validation status indicator -->
		{#if validationStatus === 'checking'}
			<div class="validation-indicator checking" title="Validating path...">
				<svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10" stroke-opacity="0.25" />
					<path d="M12 2a10 10 0 0 1 10 10" />
				</svg>
			</div>
		{:else if validationStatus === 'valid'}
			<div class="validation-indicator valid" title="Path is valid" transition:fade={{ duration: 100 }}>
				<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
				</svg>
			</div>
		{:else if validationStatus === 'warning'}
			<div class="validation-indicator warning" title={validationMessage || 'Warning'} transition:fade={{ duration: 100 }}>
				<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
					<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
				</svg>
			</div>
		{:else if validationStatus === 'error'}
			<div class="validation-indicator error" title={validationMessage || 'Error'} transition:fade={{ duration: 100 }}>
				<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
					<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
				</svg>
			</div>
		{/if}
	</div>

	<!-- Validation message -->
	{#if validationMessage && (validationStatus === 'warning' || validationStatus === 'error')}
		<div class="validation-message {validationStatus}" transition:fade={{ duration: 100 }}>
			{validationMessage}
		</div>
	{/if}

	<!-- Error message (from parent) -->
	{#if error}
		<div class="error-message" transition:fade={{ duration: 100 }}>
			{error}
		</div>
	{/if}

	<!-- Action buttons -->
	{#if showButtons}
		<div class="actions">
			<button type="button" class="btn-cancel" onclick={() => onCancel?.()}>
				Cancel
			</button>
			<button
				type="button"
				class="btn-confirm"
				onclick={() => onConfirm?.(fullPath(), filename)}
				disabled={!filename.trim() || confirmDisabled}
			>
				{confirmText}
			</button>
		</div>
	{/if}
</div>

<style>
	.file-path-picker {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem;
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.5rem;
	}

	.path-context {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		color: oklch(0.65 0.02 250);
	}

	.path-label {
		font-weight: 500;
		color: oklch(0.55 0.02 250);
	}

	.path-value {
		font-family: ui-monospace, monospace;
		color: oklch(0.70 0.08 200);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 280px;
	}

	.path-preview {
		color: oklch(0.75 0.12 145);
	}

	.input-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.filename-input {
		flex: 1;
		padding: 0.5rem 0.75rem;
		font-size: 0.875rem;
		font-family: ui-monospace, monospace;
		background: oklch(0.14 0.01 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 0.375rem;
		color: oklch(0.90 0.02 250);
		outline: none;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	.filename-input:focus {
		border-color: oklch(0.60 0.15 220);
		box-shadow: 0 0 0 2px oklch(0.60 0.15 220 / 0.2);
	}

	.filename-input.has-error {
		border-color: oklch(0.60 0.18 25);
	}

	.filename-input.has-warning {
		border-color: oklch(0.70 0.15 85);
	}

	.filename-input.has-valid {
		border-color: oklch(0.60 0.15 145);
	}

	.filename-input::placeholder {
		color: oklch(0.45 0.02 250);
	}

	/* Validation indicator */
	.validation-indicator {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.25rem;
		height: 1.25rem;
	}

	.validation-indicator.checking {
		color: oklch(0.65 0.12 220);
	}

	.validation-indicator.valid {
		color: oklch(0.65 0.18 145);
	}

	.validation-indicator.warning {
		color: oklch(0.75 0.15 85);
	}

	.validation-indicator.error {
		color: oklch(0.65 0.18 25);
	}

	/* Validation message */
	.validation-message {
		font-size: 0.75rem;
		padding: 0.25rem 0;
	}

	.validation-message.warning {
		color: oklch(0.75 0.12 85);
	}

	.validation-message.error {
		color: oklch(0.70 0.15 25);
	}

	.error-message {
		font-size: 0.75rem;
		color: oklch(0.70 0.15 25);
		padding: 0.25rem 0;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.25rem;
	}

	.btn-cancel,
	.btn-confirm {
		padding: 0.375rem 0.75rem;
		font-size: 0.8125rem;
		font-weight: 500;
		border-radius: 0.375rem;
		cursor: pointer;
		transition: background-color 0.15s, opacity 0.15s;
	}

	.btn-cancel {
		background: oklch(0.25 0.02 250);
		border: 1px solid oklch(0.32 0.02 250);
		color: oklch(0.75 0.02 250);
	}

	.btn-cancel:hover {
		background: oklch(0.30 0.02 250);
	}

	.btn-confirm {
		background: oklch(0.55 0.15 145);
		border: 1px solid oklch(0.60 0.15 145);
		color: oklch(0.98 0.01 145);
	}

	.btn-confirm:hover:not(:disabled) {
		background: oklch(0.60 0.15 145);
	}

	.btn-confirm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
