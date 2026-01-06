<script lang="ts">
	/**
	 * GlobalSearch - Content search modal (Ctrl+Shift+F)
	 *
	 * Features:
	 * - Search file CONTENTS across project (grep-style)
	 * - Regex toggle for pattern matching
	 * - File type filter (glob patterns)
	 * - Results show file, line number, content with context
	 * - Click result → opens file at specific line
	 * - Debounced search (300ms)
	 * - Project selector when multiple projects available
	 */

	import { onMount } from 'svelte';

	interface SearchResult {
		file: string;
		line: number;
		content: string;
		before?: string[];
		after?: string[];
	}

	interface Props {
		isOpen: boolean;
		project: string;
		availableProjects?: string[];
		onClose: () => void;
		onResultSelect: (file: string, line: number, project: string) => void;
		onProjectChange?: (project: string) => void;
	}

	let { isOpen, project, availableProjects = [], onClose, onResultSelect, onProjectChange }: Props = $props();

	// Track the currently selected project (may differ from prop if user changes it)
	let selectedProject = $state(project);

	// Sync selectedProject when project prop changes
	$effect(() => {
		selectedProject = project;
	});

	// State
	let searchQuery = $state('');
	let globFilter = $state('');
	let useRegex = $state(false);
	let caseSensitive = $state(false);
	let results = $state<SearchResult[]>([]);
	let selectedIndex = $state(0);
	let isLoading = $state(false);
	let truncated = $state(false);
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
			truncated = false;
			return;
		}

		// Debounce search (300ms for content search which is heavier)
		debounceTimer = setTimeout(() => {
			performSearch(query);
		}, 300);
	});

	// Focus input when modal opens
	$effect(() => {
		if (isOpen && searchInput) {
			searchInput.focus();
			searchQuery = '';
			results = [];
			selectedIndex = 0;
			truncated = false;
		}
	});

	// Handle project change
	function handleProjectChange(newProject: string) {
		selectedProject = newProject;
		results = [];
		selectedIndex = 0;
		truncated = false;
		onProjectChange?.(newProject);
		// Re-search with new project if query exists
		if (searchQuery.trim()) {
			performSearch(searchQuery.trim());
		}
	}

	// Perform search
	async function performSearch(query: string) {
		isLoading = true;
		try {
			const params = new URLSearchParams({
				project: selectedProject,
				q: query,
				limit: '100',
				context: '1'
			});

			if (globFilter.trim()) {
				params.set('glob', globFilter.trim());
			}
			if (useRegex) {
				params.set('regex', 'true');
			}
			if (caseSensitive) {
				params.set('case', 'true');
			}

			const response = await fetch(`/api/files/grep?${params}`);
			if (!response.ok) {
				const error = await response.json();
				console.error('[GlobalSearch] Search failed:', error);
				results = [];
				truncated = false;
				return;
			}

			const data = await response.json();
			results = data.results || [];
			truncated = data.truncated || false;
			selectedIndex = 0;
		} catch (err) {
			console.error('[GlobalSearch] Search error:', err);
			results = [];
			truncated = false;
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
					scrollSelectedIntoView();
				}
				break;

			case 'ArrowUp':
				e.preventDefault();
				if (results.length > 0) {
					selectedIndex = selectedIndex <= 0 ? results.length - 1 : selectedIndex - 1;
					scrollSelectedIntoView();
				}
				break;

			case 'Enter':
				e.preventDefault();
				if (results.length > 0 && results[selectedIndex]) {
					selectResult(results[selectedIndex]);
				}
				break;

			case 'Escape':
				e.preventDefault();
				onClose();
				break;
		}
	}

	// Scroll selected item into view
	function scrollSelectedIntoView() {
		requestAnimationFrame(() => {
			const selected = document.querySelector('.result-item.selected');
			if (selected) {
				selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
			}
		});
	}

	// Select and open result
	function selectResult(result: SearchResult) {
		onResultSelect(result.file, result.line, selectedProject);
		onClose();
	}

	// Get file icon based on extension
	function getFileIcon(filename: string): string {
		const ext = filename.split('.').pop()?.toLowerCase() || '';
		const name = filename.split('/').pop()?.toLowerCase() || '';

		// Special files
		if (name === 'package.json') return '📦';
		if (name === 'tsconfig.json') return '⚙️';
		if (name === '.gitignore') return '🙈';
		if (name.includes('readme')) return '📖';
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

	// Highlight matching text in content
	function highlightMatch(content: string, query: string): string {
		if (!query || useRegex) {
			// For regex, just escape HTML and return
			return escapeHtml(content);
		}

		const escaped = escapeHtml(content);
		const escapedQuery = escapeHtml(query);

		// Case-insensitive highlight
		const regex = new RegExp(`(${escapeRegex(escapedQuery)})`, caseSensitive ? 'g' : 'gi');
		return escaped.replace(regex, '<mark>$1</mark>');
	}

	function escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function escapeRegex(text: string): string {
		return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	// Common glob patterns for quick filtering
	const commonFilters = [
		{ label: 'All', glob: '' },
		{ label: 'TypeScript', glob: '*.{ts,tsx}' },
		{ label: 'JavaScript', glob: '*.{js,jsx,mjs}' },
		{ label: 'Svelte', glob: '*.svelte' },
		{ label: 'CSS', glob: '*.{css,scss}' },
		{ label: 'JSON', glob: '*.json' },
		{ label: 'Markdown', glob: '*.md' }
	];

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
	<div class="search-overlay" onclick={onClose}>
		<div class="search-container" onclick={(e) => e.stopPropagation()}>
			<!-- Project Selector Row -->
			<div class="project-row">
				<span class="project-label">Searching in:</span>
				{#if availableProjects.length > 1}
					<div class="dropdown dropdown-bottom">
						<button class="project-selector" tabindex="0">
							<span class="project-name">{selectedProject}</span>
							<svg class="dropdown-arrow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
							</svg>
						</button>
						<ul tabindex="-1" class="dropdown-content bg-base-200 rounded-box shadow-xl border border-base-300 max-h-48 overflow-y-auto z-50 p-1 min-w-40">
							{#each availableProjects as proj}
								<li>
									<button
										class="flex items-center gap-2 w-full px-3 py-1.5 rounded-md hover:bg-base-300 transition-colors text-left text-sm"
										class:bg-base-300={selectedProject === proj}
										onclick={() => { handleProjectChange(proj); }}
									>
										{proj}
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{:else}
					<span class="project-name-static">{selectedProject}</span>
				{/if}
			</div>

			<!-- Search Input -->
			<div class="search-header">
				<div class="search-input-row">
					<svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="11" cy="11" r="8" />
						<path d="M21 21l-4.35-4.35" />
					</svg>
					<input
						type="text"
						class="search-input"
						placeholder="Search in files..."
						bind:value={searchQuery}
						bind:this={searchInput}
					/>
					{#if isLoading}
						<span class="loading-indicator"></span>
					{/if}
					<kbd class="kbd kbd-sm escape-hint">ESC</kbd>
				</div>

				<!-- Options Row -->
				<div class="search-options">
					<div class="option-group">
						<label class="option-toggle" title="Use regular expression">
							<input type="checkbox" bind:checked={useRegex} />
							<span class="option-label">.*</span>
							<span class="option-text">Regex</span>
						</label>
						<label class="option-toggle" title="Case sensitive search">
							<input type="checkbox" bind:checked={caseSensitive} />
							<span class="option-label">Aa</span>
							<span class="option-text">Case</span>
						</label>
					</div>

					<div class="filter-group">
						<span class="filter-label">Filter:</span>
						{#each commonFilters as filter}
							<button
								class="filter-btn"
								class:active={globFilter === filter.glob}
								onclick={() => { globFilter = filter.glob; }}
							>
								{filter.label}
							</button>
						{/each}
						<input
							type="text"
							class="glob-input"
							placeholder="*.ext"
							bind:value={globFilter}
							title="Custom glob pattern (e.g., *.ts, src/**/*.js)"
						/>
					</div>
				</div>
			</div>

			<!-- Results List -->
			<div class="search-results">
				{#if !searchQuery.trim()}
					<div class="search-hint">
						<div class="hint-icon">🔍</div>
						<div class="hint-text">Search file contents in {project}</div>
						<div class="hint-examples">
							<span>Examples: <code>function handleClick</code>, <code>TODO:</code>, <code>import.*from</code> (with Regex)</span>
						</div>
					</div>
				{:else if results.length === 0 && !isLoading}
					<div class="search-empty">
						<span>No matches found for "{searchQuery}"</span>
					</div>
				{:else}
					<div class="results-list" role="listbox">
						{#each results as result, index (`${result.file}:${result.line}`)}
							<button
								class="result-item"
								class:selected={index === selectedIndex}
								onclick={() => selectResult(result)}
								onmouseenter={() => { selectedIndex = index; }}
								role="option"
								aria-selected={index === selectedIndex}
							>
								<div class="result-header">
									<span class="result-icon">{getFileIcon(result.file)}</span>
									<span class="result-file">{result.file}</span>
									<span class="result-line">:{result.line}</span>
								</div>
								<div class="result-content">
									{#if result.before && result.before.length > 0}
										{#each result.before as line}
											<div class="context-line">{line}</div>
										{/each}
									{/if}
									<div class="match-line">
										{@html highlightMatch(result.content, searchQuery)}
									</div>
									{#if result.after && result.after.length > 0}
										{#each result.after as line}
											<div class="context-line">{line}</div>
										{/each}
									{/if}
								</div>
							</button>
						{/each}
					</div>

					{#if truncated}
						<div class="truncated-notice">
							Results truncated. Refine your search for more specific results.
						</div>
					{/if}
				{/if}
			</div>

			<!-- Footer -->
			<div class="search-footer">
				<div class="result-count">
					{#if results.length > 0}
						<span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
					{/if}
				</div>
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
	.search-overlay {
		position: fixed;
		inset: 0;
		background: oklch(0.08 0.01 250 / 0.8);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 10vh;
		z-index: 100;
		animation: fadeIn 0.1s ease;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	/* Project Selector Row */
	.project-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid oklch(0.25 0.02 250);
		background: oklch(0.18 0.01 250);
	}

	.project-label {
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
	}

	.project-selector {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem;
		background: oklch(0.22 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.project-selector:hover {
		background: oklch(0.25 0.02 250);
		border-color: oklch(0.35 0.02 250);
	}

	.project-name {
		font-size: 0.8125rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.project-name-static {
		font-size: 0.8125rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.dropdown-arrow {
		width: 0.75rem;
		height: 0.75rem;
		color: oklch(0.50 0.02 250);
	}

	.search-container {
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.75rem;
		width: 95%;
		max-width: 800px;
		max-height: 75vh;
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

	/* Search Header */
	.search-header {
		padding: 0.875rem 1rem 0.75rem;
		border-bottom: 1px solid oklch(0.25 0.02 250);
	}

	.search-input-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.search-icon {
		width: 18px;
		height: 18px;
		color: oklch(0.50 0.02 250);
		flex-shrink: 0;
	}

	.search-input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		font-size: 0.9375rem;
		color: oklch(0.90 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.search-input::placeholder {
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

	/* Options Row */
	.search-options {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 0.625rem;
		flex-wrap: wrap;
	}

	.option-group {
		display: flex;
		gap: 0.5rem;
	}

	.option-toggle {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		background: oklch(0.22 0.02 250);
		border-radius: 0.25rem;
		cursor: pointer;
		font-size: 0.75rem;
		transition: all 0.15s ease;
	}

	.option-toggle:hover {
		background: oklch(0.26 0.02 250);
	}

	.option-toggle input {
		display: none;
	}

	.option-toggle:has(input:checked) {
		background: oklch(0.55 0.12 220 / 0.3);
		border: 1px solid oklch(0.55 0.12 220 / 0.5);
	}

	.option-label {
		font-family: ui-monospace, monospace;
		font-weight: 600;
		color: oklch(0.70 0.02 250);
	}

	.option-toggle:has(input:checked) .option-label {
		color: oklch(0.85 0.12 220);
	}

	.option-text {
		color: oklch(0.55 0.02 250);
	}

	.filter-group {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		flex-wrap: wrap;
	}

	.filter-label {
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
	}

	.filter-btn {
		padding: 0.2rem 0.5rem;
		background: oklch(0.22 0.02 250);
		border: 1px solid transparent;
		border-radius: 0.25rem;
		font-size: 0.6875rem;
		color: oklch(0.70 0.02 250);
		cursor: pointer;
		transition: all 0.1s ease;
	}

	.filter-btn:hover {
		background: oklch(0.26 0.02 250);
	}

	.filter-btn.active {
		background: oklch(0.50 0.15 145 / 0.2);
		border-color: oklch(0.50 0.15 145 / 0.4);
		color: oklch(0.80 0.12 145);
	}

	.glob-input {
		width: 70px;
		padding: 0.2rem 0.4rem;
		background: oklch(0.20 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.25rem;
		font-size: 0.6875rem;
		font-family: ui-monospace, monospace;
		color: oklch(0.80 0.02 250);
		outline: none;
	}

	.glob-input::placeholder {
		color: oklch(0.45 0.02 250);
	}

	.glob-input:focus {
		border-color: oklch(0.55 0.12 220);
	}

	/* Results List */
	.search-results {
		flex: 1;
		overflow-y: auto;
		min-height: 150px;
		max-height: 500px;
	}

	.search-hint {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2.5rem;
		gap: 0.5rem;
		text-align: center;
	}

	.hint-icon {
		font-size: 2rem;
		opacity: 0.5;
	}

	.hint-text {
		color: oklch(0.60 0.02 250);
		font-size: 0.875rem;
	}

	.hint-examples {
		color: oklch(0.45 0.02 250);
		font-size: 0.75rem;
	}

	.hint-examples code {
		background: oklch(0.22 0.02 250);
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		font-family: ui-monospace, monospace;
	}

	.search-empty {
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
		flex-direction: column;
		gap: 0.25rem;
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: transparent;
		border: none;
		border-radius: 0.375rem;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s ease;
		margin-bottom: 0.125rem;
	}

	.result-item:hover,
	.result-item.selected {
		background: oklch(0.55 0.12 220 / 0.1);
	}

	.result-item.selected {
		background: oklch(0.55 0.12 220 / 0.15);
	}

	.result-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.result-icon {
		font-size: 0.875rem;
		flex-shrink: 0;
	}

	.result-file {
		font-size: 0.8125rem;
		color: oklch(0.75 0.12 220);
		font-family: ui-monospace, monospace;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.result-line {
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.result-content {
		font-size: 0.75rem;
		font-family: ui-monospace, monospace;
		background: oklch(0.12 0.01 250);
		border-radius: 0.25rem;
		padding: 0.375rem 0.5rem;
		margin-left: 1.25rem;
		overflow: hidden;
	}

	.context-line {
		color: oklch(0.45 0.02 250);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.match-line {
		color: oklch(0.85 0.02 250);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.match-line :global(mark) {
		background: oklch(0.65 0.15 85 / 0.4);
		color: oklch(0.95 0.05 85);
		border-radius: 2px;
		padding: 0 2px;
		margin: 0 -2px;
	}

	.truncated-notice {
		padding: 0.5rem 1rem;
		background: oklch(0.70 0.12 85 / 0.1);
		border-top: 1px solid oklch(0.70 0.12 85 / 0.2);
		color: oklch(0.75 0.10 85);
		font-size: 0.75rem;
		text-align: center;
	}

	/* Footer */
	.search-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 1rem;
		border-top: 1px solid oklch(0.25 0.02 250);
		background: oklch(0.14 0.01 250);
	}

	.result-count {
		font-size: 0.6875rem;
		color: oklch(0.50 0.02 250);
	}

	.shortcut-hints {
		display: flex;
		gap: 1rem;
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
