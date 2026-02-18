<script lang="ts">
	/**
	 * ToolsList Component
	 *
	 * Displays categorized list of SQUAD tools.
	 * Each category is collapsible, tools are selectable for editing.
	 *
	 * @see ide/src/routes/config/+page.svelte for usage
	 */

	import { onMount } from 'svelte';

	interface Tool {
		name: string;
		path: string;
		absolutePath: string;
		type: 'bash' | 'js' | 'markdown' | 'unknown';
		size: number;
		modified: string;
	}

	interface ToolCategory {
		id: string;
		name: string;
		description: string;
		icon: string;
		tools: Tool[];
	}

	interface Props {
		/** Currently selected tool path */
		selectedPath?: string | null;
		/** Called when a tool is selected */
		onSelect?: (tool: Tool) => void;
	}

	let { selectedPath = null, onSelect = () => {} }: Props = $props();

	// State
	let categories = $state<ToolCategory[]>([]);
	let squadPath = $state<string | null>(null);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let expandedCategories = $state<Set<string>>(new Set(['mail', 'browser'])); // Default expanded

	// Type badges
	const typeBadges: Record<string, { label: string; color: string }> = {
		bash: { label: 'bash', color: 'oklch(0.75 0.15 140)' },
		js: { label: 'js', color: 'oklch(0.75 0.15 80)' },
		markdown: { label: 'md', color: 'oklch(0.75 0.15 200)' },
		unknown: { label: '?', color: 'oklch(0.5 0 0)' }
	};

	// Format file size
	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	// Toggle category expansion
	function toggleCategory(categoryId: string) {
		const newExpanded = new Set(expandedCategories);
		if (newExpanded.has(categoryId)) {
			newExpanded.delete(categoryId);
		} else {
			newExpanded.add(categoryId);
		}
		expandedCategories = newExpanded;
	}

	// Fetch tools
	async function fetchTools() {
		isLoading = true;
		error = null;

		try {
			const response = await fetch('/api/tools');
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || `HTTP ${response.status}`);
			}
			const data = await response.json();
			categories = data.categories || [];
			squadPath = data.squadPath;

			// Auto-select first tool if none selected
			if (!selectedPath && categories.length > 0) {
				const firstCategory = categories.find((c) => c.tools.length > 0);
				if (firstCategory) {
					onSelect(firstCategory.tools[0]);
				}
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load tools';
		} finally {
			isLoading = false;
		}
	}

	// Count total tools
	const totalTools = $derived(categories.reduce((sum, c) => sum + c.tools.length, 0));

	onMount(() => {
		fetchTools();
	});
</script>

<div class="tools-list">
	<div class="list-header">
		<h3 class="list-title">SQUAD Tools</h3>
		<button class="refresh-btn" onclick={fetchTools} disabled={isLoading}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="refresh-icon"
				class:spinning={isLoading}
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
				/>
			</svg>
		</button>
	</div>

	{#if squadPath}
		<div class="squad-path" title={squadPath}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="path-icon"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
				/>
			</svg>
			<span class="path-text">{squadPath}</span>
		</div>
	{/if}

	{#if isLoading}
		<div class="loading-state">
			<div class="loading-spinner"></div>
			<span>Loading tools...</span>
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
			<span>{error}</span>
			<button class="retry-btn" onclick={fetchTools}>Retry</button>
		</div>
	{:else if categories.length === 0}
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
					d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
				/>
			</svg>
			<span>No tools found</span>
		</div>
	{:else}
		<div class="tools-count">{totalTools} tools</div>
		<div class="category-list">
			{#each categories as category (category.id)}
				<div class="category-section">
					<button class="category-header" onclick={() => toggleCategory(category.id)}>
						<div class="category-left">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="category-icon"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d={category.icon} />
							</svg>
							<div class="category-info">
								<span class="category-name">{category.name}</span>
								<span class="category-count">{category.tools.length}</span>
							</div>
						</div>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="2"
							stroke="currentColor"
							class="chevron-icon"
							class:expanded={expandedCategories.has(category.id)}
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
						</svg>
					</button>

					{#if expandedCategories.has(category.id)}
						<div class="tools-grid">
							{#each category.tools as tool (tool.path)}
								<button
									class="tool-item"
									class:selected={selectedPath === tool.path}
									onclick={() => onSelect(tool)}
								>
									<div class="tool-main">
										<span class="tool-name">{tool.name}</span>
										<span
											class="type-badge"
											style="background: {typeBadges[tool.type]?.color || 'oklch(0.5 0 0)'}"
										>
											{typeBadges[tool.type]?.label || tool.type}
										</span>
									</div>
									<div class="tool-meta">
										<span class="tool-size">{formatSize(tool.size)}</span>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.tools-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		min-width: 280px;
		max-width: 360px;
		background: oklch(0.14 0.01 250);
		border: 1px solid oklch(0.22 0.02 250);
		border-radius: 12px;
		padding: 1rem;
		overflow-y: auto;
		max-height: 100%;
	}

	.list-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.list-title {
		font-size: 0.9rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		margin: 0;
		font-family: ui-monospace, monospace;
	}

	.refresh-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: transparent;
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 6px;
		color: oklch(0.60 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.refresh-btn:hover:not(:disabled) {
		background: oklch(0.20 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	.refresh-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.refresh-icon {
		width: 16px;
		height: 16px;
	}

	.refresh-icon.spinning {
		animation: spin 1s linear infinite;
	}

	/* SQUAD Path indicator */
	.squad-path {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: oklch(0.18 0.02 250);
		border-radius: 6px;
		font-size: 0.7rem;
		color: oklch(0.55 0.02 250);
		overflow: hidden;
	}

	.path-icon {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
	}

	.path-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: ui-monospace, monospace;
	}

	/* Tools count */
	.tools-count {
		font-size: 0.75rem;
		color: oklch(0.50 0.02 250);
		text-align: right;
	}

	/* States */
	.loading-state,
	.error-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 2rem 1rem;
		color: oklch(0.55 0.02 250);
		font-size: 0.8rem;
	}

	.loading-spinner {
		width: 24px;
		height: 24px;
		border: 2px solid oklch(0.30 0.02 250);
		border-top-color: oklch(0.65 0.15 200);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.error-icon,
	.empty-icon {
		width: 32px;
		height: 32px;
		color: oklch(0.45 0.02 250);
	}

	.error-state {
		color: oklch(0.65 0.12 25);
	}

	.error-state .error-icon {
		color: oklch(0.60 0.15 25);
	}

	.retry-btn {
		margin-top: 0.5rem;
		padding: 0.375rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 500;
		background: oklch(0.25 0.06 200);
		border: 1px solid oklch(0.35 0.08 200);
		border-radius: 6px;
		color: oklch(0.85 0.08 200);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.retry-btn:hover {
		background: oklch(0.30 0.08 200);
	}

	/* Category list */
	.category-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.category-section {
		display: flex;
		flex-direction: column;
	}

	.category-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.625rem 0.75rem;
		background: oklch(0.18 0.01 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
		width: 100%;
		text-align: left;
	}

	.category-header:hover {
		background: oklch(0.22 0.02 250);
		border-color: oklch(0.30 0.04 200);
	}

	.category-left {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	.category-icon {
		width: 18px;
		height: 18px;
		color: oklch(0.65 0.10 200);
	}

	.category-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.category-name {
		font-size: 0.8rem;
		font-weight: 500;
		color: oklch(0.85 0.02 250);
	}

	.category-count {
		font-size: 0.65rem;
		padding: 0.125rem 0.375rem;
		background: oklch(0.25 0.02 250);
		border-radius: 4px;
		color: oklch(0.55 0.02 250);
	}

	.chevron-icon {
		width: 16px;
		height: 16px;
		color: oklch(0.50 0.02 250);
		transition: transform 0.2s ease;
	}

	.chevron-icon.expanded {
		transform: rotate(180deg);
	}

	/* Tools grid */
	.tools-grid {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.5rem 0 0 1.5rem;
	}

	.tool-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.5rem 0.625rem;
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.22 0.02 250);
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
		width: 100%;
	}

	.tool-item:hover {
		background: oklch(0.20 0.02 250);
		border-color: oklch(0.30 0.04 200);
	}

	.tool-item.selected {
		background: oklch(0.22 0.05 200);
		border-color: oklch(0.45 0.12 200);
	}

	.tool-main {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.tool-name {
		font-size: 0.8rem;
		font-weight: 500;
		color: oklch(0.88 0.02 250);
		font-family: ui-monospace, monospace;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.type-badge {
		font-size: 0.6rem;
		font-weight: 600;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		color: oklch(0.15 0 0);
		flex-shrink: 0;
		text-transform: uppercase;
	}

	.tool-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.65rem;
		color: oklch(0.50 0.02 250);
	}
</style>
