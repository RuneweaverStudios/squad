<script lang="ts">
	/**
	 * QuickFileFinder - Fuzzy file search modal (Ctrl+P)
	 *
	 * Features:
	 * - Fuzzy search across all files in project
	 * - Arrow keys to navigate results
	 * - Enter to open selected file
	 * - Shows relative path and file icon
	 * - Debounced search input
	 */

	import { onMount } from 'svelte';

	interface FileResult {
		path: string;
		name: string;
		folder: string;
	}

	interface Props {
		isOpen: boolean;
		project: string;
		onClose: () => void;
		onFileSelect: (path: string) => void;
	}

	let { isOpen, project, onClose, onFileSelect }: Props = $props();

	// State
	let searchQuery = $state('');
	let results = $state<FileResult[]>([]);
	let selectedIndex = $state(0);
	let isLoading = $state(false);
	let searchInput: HTMLInputElement | null = $state(null);

	// Debounce timer
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	// Search when query changes
	$effect(() => {
		if (!isOpen) return;

		// Clear previous timer
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}

		const query = searchQuery.trim();

		if (!query) {
			results = [];
			selectedIndex = 0;
			return;
		}

		// Debounce search
		debounceTimer = setTimeout(() => {
			performSearch(query);
		}, 150);
	});

	// Focus input when modal opens
	$effect(() => {
		if (isOpen && searchInput) {
			searchInput.focus();
			searchQuery = '';
			results = [];
			selectedIndex = 0;
		}
	});

	// Perform search
	async function performSearch(query: string) {
		isLoading = true;
		try {
			const params = new URLSearchParams({
				project,
				query,
				limit: '50'
			});

			const response = await fetch(`/api/files/search?${params}`);
			if (!response.ok) {
				console.error('[QuickFileFinder] Search failed:', response.status);
				results = [];
				return;
			}

			const data = await response.json();
			results = data.files || [];
			selectedIndex = 0;
		} catch (err) {
			console.error('[QuickFileFinder] Search error:', err);
			results = [];
		} finally {
			isLoading = false;
		}
	}

	// Handle keyboard navigation
	function handleKeyDown(e: KeyboardEvent) {
		if (!isOpen) return;

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				if (results.length > 0) {
					selectedIndex = (selectedIndex + 1) % results.length;
				}
				break;

			case 'ArrowUp':
				e.preventDefault();
				if (results.length > 0) {
					selectedIndex = selectedIndex <= 0 ? results.length - 1 : selectedIndex - 1;
				}
				break;

			case 'Enter':
				e.preventDefault();
				if (results.length > 0 && results[selectedIndex]) {
					selectFile(results[selectedIndex]);
				}
				break;

			case 'Escape':
				e.preventDefault();
				onClose();
				break;
		}
	}

	// Select and open file
	function selectFile(file: FileResult) {
		onFileSelect(file.path);
		onClose();
	}

	// Get file icon based on extension
	function getFileIcon(filename: string): string {
		const ext = filename.split('.').pop()?.toLowerCase() || '';
		const name = filename.toLowerCase();

		// Special files
		if (name === 'package.json') return '📦';
		if (name === 'tsconfig.json') return '⚙️';
		if (name === '.gitignore') return '🙈';
		if (name === 'readme.md') return '📖';
		if (name === 'dockerfile') return '🐳';

		// By extension
		const iconMap: Record<string, string> = {
			ts: '🔷',
			tsx: '⚛️',
			js: '🟨',
			jsx: '⚛️',
			svelte: '🔶',
			vue: '💚',
			html: '🌐',
			css: '🎨',
			scss: '🎨',
			json: '📋',
			yaml: '📋',
			yml: '📋',
			md: '📝',
			py: '🐍',
			go: '🐹',
			rs: '🦀',
			sh: '🐚',
			sql: '🗃️'
		};

		return iconMap[ext] || '📄';
	}

	// Highlight matching parts of filename
	function highlightMatch(text: string, query: string): string {
		if (!query) return text;

		const lowerText = text.toLowerCase();
		const lowerQuery = query.toLowerCase();

		// Find and highlight substring match
		const index = lowerText.indexOf(lowerQuery);
		if (index !== -1) {
			const before = text.substring(0, index);
			const match = text.substring(index, index + query.length);
			const after = text.substring(index + query.length);
			return `${before}<mark>${match}</mark>${after}`;
		}

		return text;
	}

	onMount(() => {
		// Clean up on unmount
		return () => {
			if (debounceTimer) {
				clearTimeout(debounceTimer);
			}
		};
	});
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if isOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="finder-overlay" onclick={onClose}>
		<div class="finder-container" onclick={(e) => e.stopPropagation()}>
			<!-- Search Input -->
			<div class="finder-input-container">
				<svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="11" cy="11" r="8" />
					<path d="M21 21l-4.35-4.35" />
				</svg>
				<input
					type="text"
					class="finder-input"
					placeholder="Search files by name..."
					bind:value={searchQuery}
					bind:this={searchInput}
				/>
				{#if isLoading}
					<span class="loading-indicator"></span>
				{/if}
				<kbd class="kbd kbd-sm escape-hint">ESC</kbd>
			</div>

			<!-- Results List -->
			<div class="finder-results">
				{#if !searchQuery.trim()}
					<div class="finder-hint">
						<span>Type to search files in {project}</span>
					</div>
				{:else if results.length === 0 && !isLoading}
					<div class="finder-empty">
						<span>No files found matching "{searchQuery}"</span>
					</div>
				{:else}
					<div class="results-list" role="listbox">
						{#each results as result, index (result.path)}
							<button
								class="result-item"
								class:selected={index === selectedIndex}
								onclick={() => selectFile(result)}
								onmouseenter={() => { selectedIndex = index; }}
								role="option"
								aria-selected={index === selectedIndex}
							>
								<span class="result-icon">{getFileIcon(result.name)}</span>
								<div class="result-info">
									<span class="result-name">
										{@html highlightMatch(result.name, searchQuery)}
									</span>
									{#if result.folder}
										<span class="result-folder">{result.folder}</span>
									{/if}
								</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="finder-footer">
				<div class="shortcut-hints">
					<span class="hint">
						<kbd class="kbd kbd-xs">↑</kbd>
						<kbd class="kbd kbd-xs">↓</kbd>
						<span>Navigate</span>
					</span>
					<span class="hint">
						<kbd class="kbd kbd-xs">Enter</kbd>
						<span>Open</span>
					</span>
					<span class="hint">
						<kbd class="kbd kbd-xs">Esc</kbd>
						<span>Close</span>
					</span>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.finder-overlay {
		position: fixed;
		inset: 0;
		background: oklch(0.08 0.01 250 / 0.75);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 15vh;
		z-index: 100;
		animation: fadeIn 0.1s ease;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.finder-container {
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.75rem;
		width: 90%;
		max-width: 600px;
		max-height: 60vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 25px 60px oklch(0.05 0 0 / 0.6);
		animation: slideDown 0.15s ease;
		overflow: hidden;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Search Input */
	.finder-input-container {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		border-bottom: 1px solid oklch(0.25 0.02 250);
	}

	.search-icon {
		width: 18px;
		height: 18px;
		color: oklch(0.50 0.02 250);
		flex-shrink: 0;
	}

	.finder-input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		font-size: 0.9375rem;
		color: oklch(0.90 0.02 250);
	}

	.finder-input::placeholder {
		color: oklch(0.50 0.02 250);
	}

	.loading-indicator {
		width: 16px;
		height: 16px;
		border: 2px solid oklch(0.30 0.02 250);
		border-top-color: oklch(0.65 0.12 220);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.escape-hint {
		font-size: 0.625rem;
		opacity: 0.5;
		flex-shrink: 0;
	}

	/* Results List */
	.finder-results {
		flex: 1;
		overflow-y: auto;
		min-height: 100px;
		max-height: 400px;
	}

	.finder-hint,
	.finder-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		color: oklch(0.50 0.02 250);
		font-size: 0.875rem;
	}

	.results-list {
		padding: 0.25rem;
	}

	.result-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		padding: 0.625rem 0.75rem;
		background: transparent;
		border: none;
		border-radius: 0.375rem;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s ease;
	}

	.result-item:hover,
	.result-item.selected {
		background: oklch(0.65 0.12 220 / 0.15);
	}

	.result-item.selected {
		background: oklch(0.65 0.12 220 / 0.2);
	}

	.result-icon {
		font-size: 1rem;
		flex-shrink: 0;
	}

	.result-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
		flex: 1;
	}

	.result-name {
		font-size: 0.875rem;
		color: oklch(0.90 0.02 250);
		font-family: ui-monospace, monospace;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.result-name :global(mark) {
		background: oklch(0.65 0.15 85 / 0.4);
		color: inherit;
		border-radius: 2px;
		padding: 0 2px;
		margin: 0 -2px;
	}

	.result-folder {
		font-size: 0.75rem;
		color: oklch(0.50 0.02 250);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Footer */
	.finder-footer {
		padding: 0.5rem 1rem;
		border-top: 1px solid oklch(0.25 0.02 250);
		background: oklch(0.16 0.01 250);
	}

	.shortcut-hints {
		display: flex;
		gap: 1rem;
		justify-content: center;
	}

	.hint {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.6875rem;
		color: oklch(0.50 0.02 250);
	}

	.hint .kbd {
		font-size: 0.5625rem;
		padding: 0.125rem 0.25rem;
		min-height: 0;
		height: auto;
	}
</style>
