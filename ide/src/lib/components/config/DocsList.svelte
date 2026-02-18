<script lang="ts">
	/**
	 * DocsList Component
	 *
	 * Displays a list of shared documentation files with:
	 * - Search functionality
	 * - File list with titles and descriptions
	 * - Click to select (parent handles display)
	 *
	 * Pattern matches ClaudeMdList for consistency.
	 *
	 * @see ide/src/routes/api/docs/+server.ts for API
	 * @see ide/src/lib/components/config/ClaudeMdList.svelte for pattern
	 */

	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';

	interface DocFile {
		name: string;
		filename: string;
		path: string;
		title: string;
		description: string;
		size: number;
		modifiedAt: string;
	}

	interface Props {
		/** Currently selected file path */
		selectedPath?: string | null;
		/** Called when a file is selected */
		onSelect?: (file: DocFile) => void;
		/** Custom class */
		class?: string;
	}

	let { selectedPath = null, onSelect = () => {}, class: className = '' }: Props = $props();

	// State
	let docs = $state<DocFile[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let searchQuery = $state('');

	// Filtered docs based on search
	const filteredDocs = $derived(() => {
		if (!searchQuery.trim()) {
			return docs;
		}
		const lower = searchQuery.toLowerCase();
		return docs.filter(
			(doc) =>
				doc.name.toLowerCase().includes(lower) ||
				doc.title.toLowerCase().includes(lower) ||
				doc.description.toLowerCase().includes(lower)
		);
	});

	// Load docs list
	async function loadDocs() {
		isLoading = true;
		error = null;

		try {
			const response = await fetch('/api/docs');
			if (!response.ok) {
				throw new Error('Failed to load docs');
			}
			const data = await response.json();
			docs = data.docs || [];
		} catch (err) {
			error = (err as Error).message;
		} finally {
			isLoading = false;
		}
	}

	// Handle doc click
	function handleDocClick(doc: DocFile) {
		onSelect(doc);
	}

	// Format file size
	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	// Format date
	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	// Highlight search matches
	function highlightMatch(text: string, query: string): { text: string; isMatch: boolean }[] {
		if (!query.trim()) {
			return [{ text, isMatch: false }];
		}
		const lowerText = text.toLowerCase();
		const lowerQuery = query.toLowerCase();
		const index = lowerText.indexOf(lowerQuery);
		if (index === -1) {
			return [{ text, isMatch: false }];
		}
		const result: { text: string; isMatch: boolean }[] = [];
		if (index > 0) result.push({ text: text.substring(0, index), isMatch: false });
		result.push({ text: text.substring(index, index + query.length), isMatch: true });
		if (index + query.length < text.length)
			result.push({ text: text.substring(index + query.length), isMatch: false });
		return result;
	}

	onMount(() => {
		loadDocs();
	});
</script>

<div class="docs-list {className}">
	<!-- Search bar -->
	<div class="search-bar">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			stroke-width="1.5"
			stroke="currentColor"
			class="search-icon"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
			/>
		</svg>
		<input
			type="text"
			class="search-input"
			placeholder="Search documentation..."
			bind:value={searchQuery}
		/>
		{#if searchQuery}
			<button class="clear-btn" onclick={() => (searchQuery = '')} aria-label="Clear search">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="clear-icon"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		{/if}
	</div>

	<!-- Doc count -->
	<div class="docs-count">
		{filteredDocs().length} document{filteredDocs().length !== 1 ? 's' : ''}
		{#if searchQuery}
			<span class="search-note">matching "{searchQuery}"</span>
		{/if}
	</div>

	<!-- Loading state -->
	{#if isLoading}
		<div class="loading-state">
			<div class="loading-spinner"></div>
			<p class="loading-text">Loading documentation...</p>
		</div>
	{:else if error}
		<div class="error-state">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="error-icon"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
				/>
			</svg>
			<p class="error-title">Failed to load documentation</p>
			<p class="error-message">{error}</p>
			<button class="retry-btn" onclick={loadDocs}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-4 h-4"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
					/>
				</svg>
				Retry
			</button>
		</div>
	{:else if filteredDocs().length === 0}
		<div class="empty-state">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="empty-icon"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
				/>
			</svg>
			<p class="empty-title">
				{searchQuery ? 'No matching documents' : 'No documentation found'}
			</p>
			<p class="empty-hint">
				{searchQuery ? 'Try a different search term' : 'Add .md files to ~/code/squad/shared/'}
			</p>
		</div>
	{:else}
		<!-- Docs list -->
		<div class="docs-grid">
			{#each filteredDocs() as doc (doc.filename)}
				<button
					class="doc-card"
					class:selected={selectedPath === doc.path}
					onclick={() => handleDocClick(doc)}
					transition:fade={{ duration: 100 }}
				>
					<div class="doc-header">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="doc-icon"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
							/>
						</svg>
						<span class="doc-title">
							{#each highlightMatch(doc.title, searchQuery) as segment}
								{#if segment.isMatch}
									<mark class="search-highlight">{segment.text}</mark>
								{:else}
									{segment.text}
								{/if}
							{/each}
						</span>
					</div>

					<span class="doc-filename">{doc.filename}</span>

					{#if doc.description}
						<p class="doc-description">
							{#each highlightMatch(doc.description, searchQuery) as segment}
								{#if segment.isMatch}
									<mark class="search-highlight">{segment.text}</mark>
								{:else}
									{segment.text}
								{/if}
							{/each}
						</p>
					{/if}

					<div class="doc-meta">
						<span class="doc-size">{formatSize(doc.size)}</span>
						<span class="doc-date">{formatDate(doc.modifiedAt)}</span>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.docs-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		width: 320px;
		flex-shrink: 0;
		overflow: hidden;
	}

	/* Search bar */
	.search-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 0.875rem;
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 8px;
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
		font-size: 0.85rem;
		color: oklch(0.85 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.search-input::placeholder {
		color: oklch(0.45 0.02 250);
	}

	.clear-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		background: oklch(0.25 0.02 250);
		border: none;
		border-radius: 4px;
		color: oklch(0.55 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.clear-btn:hover {
		background: oklch(0.30 0.02 250);
		color: oklch(0.75 0.02 250);
	}

	.clear-icon {
		width: 14px;
		height: 14px;
	}

	/* Doc count */
	.docs-count {
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
		font-family: ui-monospace, monospace;
		padding: 0 0.25rem;
	}

	.search-note {
		color: oklch(0.70 0.08 200);
	}

	/* Docs grid */
	.docs-grid {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		overflow-y: auto;
		flex: 1;
		padding-right: 0.25rem;
	}

	/* Scrollbar styling */
	.docs-grid::-webkit-scrollbar {
		width: 6px;
	}

	.docs-grid::-webkit-scrollbar-track {
		background: oklch(0.16 0.01 250);
		border-radius: 3px;
	}

	.docs-grid::-webkit-scrollbar-thumb {
		background: oklch(0.30 0.02 250);
		border-radius: 3px;
	}

	.docs-grid::-webkit-scrollbar-thumb:hover {
		background: oklch(0.40 0.02 250);
	}

	/* Doc card */
	.doc-card {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding: 0.75rem;
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
	}

	.doc-card:hover {
		background: oklch(0.18 0.02 250);
		border-color: oklch(0.35 0.02 250);
	}

	.doc-card.selected {
		background: oklch(0.20 0.05 200);
		border-color: oklch(0.45 0.10 200);
	}

	.doc-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.doc-icon {
		width: 18px;
		height: 18px;
		color: oklch(0.65 0.10 200);
		flex-shrink: 0;
	}

	.doc-title {
		font-size: 0.9rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		font-family: ui-monospace, monospace;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.doc-filename {
		font-size: 0.7rem;
		color: oklch(0.50 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.doc-description {
		font-size: 0.75rem;
		color: oklch(0.60 0.02 250);
		line-height: 1.4;
		margin: 0;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.doc-meta {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.65rem;
		color: oklch(0.45 0.02 250);
		font-family: ui-monospace, monospace;
		margin-top: 0.25rem;
	}

	/* States */
	.loading-state,
	.error-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		gap: 0.75rem;
		text-align: center;
	}

	.loading-spinner {
		width: 32px;
		height: 32px;
		border: 3px solid oklch(0.30 0.02 250);
		border-top-color: oklch(0.65 0.15 200);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.loading-text {
		font-size: 0.85rem;
		color: oklch(0.55 0.02 250);
		margin: 0;
	}

	.error-icon,
	.empty-icon {
		width: 48px;
		height: 48px;
		margin-bottom: 0.5rem;
	}

	.error-icon {
		color: oklch(0.60 0.15 25);
	}

	.empty-icon {
		color: oklch(0.40 0.02 250);
	}

	.error-title,
	.empty-title {
		font-size: 0.9rem;
		font-weight: 500;
		margin: 0;
	}

	.error-title {
		color: oklch(0.70 0.12 25);
	}

	.empty-title {
		color: oklch(0.55 0.02 250);
	}

	.error-message,
	.empty-hint {
		font-size: 0.75rem;
		color: oklch(0.50 0.02 250);
		margin: 0;
	}

	.retry-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-top: 0.5rem;
		padding: 0.5rem 1rem;
		font-size: 0.8rem;
		font-weight: 500;
		background: oklch(0.30 0.08 200);
		border: 1px solid oklch(0.40 0.10 200);
		border-radius: 6px;
		color: oklch(0.85 0.08 200);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.retry-btn:hover {
		background: oklch(0.35 0.10 200);
	}

	/* Search highlight */
	.search-highlight {
		background: oklch(0.50 0.15 85 / 0.4);
		color: oklch(0.95 0.10 85);
		padding: 0 0.125rem;
		border-radius: 2px;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.docs-list {
			width: 100%;
			max-height: 250px;
		}
	}
</style>
