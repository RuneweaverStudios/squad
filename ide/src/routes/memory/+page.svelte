<script lang="ts">
	/**
	 * Memory Page - Search and browse agent memory entries
	 *
	 * Features:
	 * - Search across all project memory indexes (hybrid FTS + vector)
	 * - Browse memory files per project
	 * - View memory file contents with frontmatter
	 * - Index status and rebuild controls
	 */

	import { onMount } from 'svelte';

	// --- State ---
	let activeTab = $state<'search' | 'browse' | 'status'>('search');

	// Search state
	let searchQuery = $state('');
	let searchResults = $state<any[]>([]);
	let searchLoading = $state(false);
	let searchError = $state('');
	let lastSearchQuery = $state('');

	// Browse state
	let browseProject = $state('');
	let browseFiles = $state<any[]>([]);
	let browseLoading = $state(false);

	// Status state
	let projectStatuses = $state<any[]>([]);
	let statusLoading = $state(true);

	// File viewer state
	let viewingFile = $state<{ content: string; frontmatter: any; filename: string; project: string } | null>(null);
	let fileLoading = $state(false);

	// Reindex state
	let reindexing = $state(false);
	let reindexResults = $state<any[] | null>(null);

	// --- Data Fetching ---
	async function fetchStatus() {
		statusLoading = true;
		try {
			const res = await fetch('/api/memory?action=status');
			const data = await res.json();
			projectStatuses = data.projects || [];
			// Set default browse project
			if (!browseProject && projectStatuses.length > 0) {
				browseProject = projectStatuses[0].project;
			}
		} catch (err) {
			console.error('Failed to fetch memory status:', err);
		} finally {
			statusLoading = false;
		}
	}

	async function handleSearch() {
		if (!searchQuery.trim()) return;
		searchLoading = true;
		searchError = '';
		try {
			const params = new URLSearchParams({ action: 'search', q: searchQuery, limit: '20' });
			const res = await fetch(`/api/memory?${params}`);
			const data = await res.json();
			if (data.error) {
				searchError = data.error;
				searchResults = [];
			} else {
				searchResults = data.results || [];
				lastSearchQuery = searchQuery;
			}
		} catch (err) {
			searchError = err instanceof Error ? err.message : 'Search failed';
			searchResults = [];
		} finally {
			searchLoading = false;
		}
	}

	async function fetchBrowseFiles() {
		if (!browseProject) return;
		browseLoading = true;
		try {
			const params = new URLSearchParams({ action: 'browse', project: browseProject });
			const res = await fetch(`/api/memory?${params}`);
			const data = await res.json();
			browseFiles = data.files || [];
		} catch (err) {
			console.error('Failed to browse files:', err);
			browseFiles = [];
		} finally {
			browseLoading = false;
		}
	}

	async function viewFile(project: string, filename: string) {
		fileLoading = true;
		try {
			const params = new URLSearchParams({ action: 'file', project, filename });
			const res = await fetch(`/api/memory?${params}`);
			const data = await res.json();
			if (data.error) {
				console.error('Failed to load file:', data.error);
			} else {
				viewingFile = data;
			}
		} catch (err) {
			console.error('Failed to view file:', err);
		} finally {
			fileLoading = false;
		}
	}

	async function handleReindex(project?: string) {
		reindexing = true;
		reindexResults = null;
		try {
			const res = await fetch('/api/memory', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ project, force: false })
			});
			const data = await res.json();
			reindexResults = data.results || [];
			// Refresh status
			await fetchStatus();
		} catch (err) {
			console.error('Reindex failed:', err);
		} finally {
			reindexing = false;
		}
	}

	function handleSearchKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') handleSearch();
	}

	function closeFileViewer() {
		viewingFile = null;
	}

	function formatDate(dateStr: string | undefined) {
		if (!dateStr) return '';
		const d = new Date(dateStr);
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function formatSize(bytes: number) {
		if (bytes < 1024) return `${bytes}B`;
		return `${(bytes / 1024).toFixed(1)}KB`;
	}

	// Total stats
	let totalFiles = $derived(projectStatuses.reduce((sum, p) => sum + (p.fileCount || 0), 0));
	let totalChunks = $derived(projectStatuses.reduce((sum, p) => sum + (p.chunkCount || 0), 0));
	let indexedProjects = $derived(projectStatuses.filter((p) => p.hasIndex).length);

	// Fetch on browse project change
	$effect(() => {
		if (browseProject) fetchBrowseFiles();
	});

	onMount(() => {
		fetchStatus();
	});
</script>

<div class="flex flex-col h-full overflow-hidden" style="background: oklch(0.14 0.01 250);">
	<!-- Header -->
	<div
		class="flex items-center justify-between px-6 py-4 border-b shrink-0"
		style="
			background: linear-gradient(180deg, oklch(0.18 0.01 250) 0%, oklch(0.16 0.01 250) 100%);
			border-color: oklch(0.25 0.02 250);
		"
	>
		<div class="flex items-center gap-4">
			<div class="flex items-center gap-2.5">
				<div
					class="p-1.5 rounded"
					style="background: oklch(0.65 0.15 280 / 0.15); border: 1px solid oklch(0.65 0.15 280 / 0.3);"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5" style="color: oklch(0.75 0.15 280);">
						<path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
					</svg>
				</div>
				<h1 class="text-lg font-bold font-mono tracking-wide" style="color: oklch(0.85 0.05 250);">
					MEMORY
				</h1>
			</div>

			<!-- Quick stats -->
			{#if !statusLoading}
				<div class="flex items-center gap-3 ml-4">
					<span class="font-mono text-xs px-2 py-0.5 rounded" style="background: oklch(0.25 0.02 250); color: oklch(0.65 0.05 250);">
						{totalFiles} file{totalFiles !== 1 ? 's' : ''}
					</span>
					<span class="font-mono text-xs px-2 py-0.5 rounded" style="background: oklch(0.25 0.02 250); color: oklch(0.65 0.05 250);">
						{totalChunks} chunk{totalChunks !== 1 ? 's' : ''}
					</span>
					<span class="font-mono text-xs px-2 py-0.5 rounded" style="background: oklch(0.25 0.02 250); color: oklch(0.65 0.05 250);">
						{indexedProjects} project{indexedProjects !== 1 ? 's' : ''}
					</span>
				</div>
			{/if}
		</div>

		<!-- Reindex button -->
		<button
			class="flex items-center gap-2 px-3 py-1.5 rounded font-mono text-xs transition-all"
			style="
				background: oklch(0.55 0.15 145 / 0.15);
				border: 1px solid oklch(0.55 0.15 145 / 0.3);
				color: oklch(0.75 0.12 145);
			"
			disabled={reindexing}
			onclick={() => handleReindex()}
		>
			{#if reindexing}
				<span class="loading loading-spinner loading-xs"></span>
				Indexing...
			{:else}
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
					<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
				</svg>
				Rebuild Index
			{/if}
		</button>
	</div>

	<!-- Tab bar -->
	<div class="flex gap-1 px-6 py-2 border-b shrink-0" style="border-color: oklch(0.22 0.02 250); background: oklch(0.16 0.01 250);">
		{#each [
			{ id: 'search', label: 'Search', icon: 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z' },
			{ id: 'browse', label: 'Browse', icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' },
			{ id: 'status', label: 'Status', icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z' }
		] as tab}
			<button
				class="flex items-center gap-2 px-3 py-1.5 rounded font-mono text-xs transition-all"
				style="
					background: {activeTab === tab.id ? 'oklch(0.65 0.15 280 / 0.15)' : 'transparent'};
					border: 1px solid {activeTab === tab.id ? 'oklch(0.65 0.15 280 / 0.3)' : 'transparent'};
					color: {activeTab === tab.id ? 'oklch(0.80 0.12 280)' : 'oklch(0.55 0.02 250)'};
				"
				onclick={() => { activeTab = tab.id as typeof activeTab; }}
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
					<path stroke-linecap="round" stroke-linejoin="round" d={tab.icon} />
				</svg>
				{tab.label}
			</button>
		{/each}
	</div>

	<!-- Content area -->
	<div class="flex-1 overflow-y-auto">
		<!-- SEARCH TAB -->
		{#if activeTab === 'search'}
			<div class="p-6 max-w-5xl mx-auto space-y-6">
				<!-- Search bar -->
				<div class="flex gap-3">
					<div class="flex-1 relative">
						<input
							type="text"
							bind:value={searchQuery}
							onkeydown={handleSearchKeydown}
							placeholder="Search memory entries..."
							class="w-full px-4 py-3 rounded-lg font-mono text-sm outline-none transition-all"
							style="
								background: oklch(0.20 0.01 250);
								border: 1px solid oklch(0.30 0.02 250);
								color: oklch(0.85 0.05 250);
							"
						/>
						{#if searchLoading}
							<span class="loading loading-spinner loading-sm absolute right-3 top-3.5" style="color: oklch(0.65 0.15 280);"></span>
						{/if}
					</div>
					<button
						class="px-5 py-3 rounded-lg font-mono text-sm font-bold transition-all"
						style="
							background: oklch(0.55 0.15 280 / 0.2);
							border: 1px solid oklch(0.55 0.15 280 / 0.4);
							color: oklch(0.80 0.12 280);
						"
						disabled={searchLoading || !searchQuery.trim()}
						onclick={handleSearch}
					>
						Search
					</button>
				</div>

				<!-- Search results -->
				{#if searchError}
					<div class="px-4 py-3 rounded-lg font-mono text-sm" style="background: oklch(0.50 0.15 30 / 0.15); border: 1px solid oklch(0.50 0.15 30 / 0.3); color: oklch(0.75 0.12 30);">
						{searchError}
					</div>
				{/if}

				{#if searchResults.length > 0}
					<div class="space-y-3">
						<div class="font-mono text-xs" style="color: oklch(0.55 0.02 250);">
							{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{lastSearchQuery}"
						</div>
						{#each searchResults as result}
							<button
								class="w-full text-left p-4 rounded-lg transition-all hover:scale-[1.005]"
								style="
									background: oklch(0.18 0.01 250);
									border: 1px solid oklch(0.25 0.02 250);
								"
								onclick={() => {
									const filename = result.path?.split('/').pop();
									if (filename && result.project) viewFile(result.project, filename);
								}}
							>
								<div class="flex items-center gap-2 mb-2">
									<span class="font-mono text-xs px-1.5 py-0.5 rounded" style="background: oklch(0.55 0.15 280 / 0.15); color: oklch(0.75 0.12 280);">
										{result.project}
									</span>
									{#if result.taskId}
										<span class="font-mono text-xs px-1.5 py-0.5 rounded" style="background: oklch(0.55 0.15 200 / 0.15); color: oklch(0.75 0.12 200);">
											{result.taskId}
										</span>
									{/if}
									{#if result.section}
										<span class="font-mono text-xs" style="color: oklch(0.50 0.02 250);">
											{result.section}
										</span>
									{/if}
									<span class="ml-auto font-mono text-xs" style="color: oklch(0.50 0.02 250);">
										score: {result.score?.toFixed(4)}
									</span>
								</div>
								<div class="font-mono text-sm whitespace-pre-wrap line-clamp-3" style="color: oklch(0.75 0.03 250);">
									{result.snippet}
								</div>
								{#if result.source}
									<div class="mt-2 font-mono text-[10px]" style="color: oklch(0.45 0.02 250);">
										via {result.source} | lines {result.startLine}-{result.endLine}
									</div>
								{/if}
							</button>
						{/each}
					</div>
				{:else if lastSearchQuery && !searchLoading && !searchError}
					<div class="text-center py-12 font-mono text-sm" style="color: oklch(0.50 0.02 250);">
						No results found for "{lastSearchQuery}"
					</div>
				{:else if !lastSearchQuery && !searchLoading}
					<div class="text-center py-16 space-y-4">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" class="w-16 h-16 mx-auto" style="color: oklch(0.35 0.02 250);">
							<path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
						</svg>
						<p class="font-mono text-sm" style="color: oklch(0.50 0.02 250);">
							Search agent memory across all projects
						</p>
						<p class="font-mono text-xs" style="color: oklch(0.40 0.02 250);">
							Hybrid search: full-text (BM25) + vector (cosine) with reciprocal rank fusion
						</p>
					</div>
				{/if}
			</div>
		{/if}

		<!-- BROWSE TAB -->
		{#if activeTab === 'browse'}
			<div class="p-6 max-w-5xl mx-auto space-y-4">
				<!-- Project selector -->
				<div class="flex items-center gap-3">
					<span class="font-mono text-xs" style="color: oklch(0.55 0.02 250);">Project:</span>
					<select
						bind:value={browseProject}
						class="px-3 py-1.5 rounded font-mono text-sm outline-none"
						style="background: oklch(0.20 0.01 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.80 0.05 250);"
					>
						{#each projectStatuses as proj}
							<option value={proj.project}>{proj.project} ({proj.fileCount} files)</option>
						{/each}
					</select>
				</div>

				{#if browseLoading}
					<div class="flex items-center gap-2 py-8 justify-center">
						<span class="loading loading-spinner loading-sm" style="color: oklch(0.65 0.15 280);"></span>
						<span class="font-mono text-sm" style="color: oklch(0.55 0.02 250);">Loading...</span>
					</div>
				{:else if browseFiles.length === 0}
					<div class="text-center py-12 space-y-3">
						<p class="font-mono text-sm" style="color: oklch(0.50 0.02 250);">
							No memory files in {browseProject}
						</p>
						<p class="font-mono text-xs" style="color: oklch(0.40 0.02 250);">
							Memory files are created when tasks complete via /jat:complete
						</p>
					</div>
				{:else}
					<div class="space-y-2">
						{#each browseFiles as file}
							<button
								class="w-full text-left p-4 rounded-lg transition-all hover:scale-[1.003]"
								style="
									background: oklch(0.18 0.01 250);
									border: 1px solid oklch(0.25 0.02 250);
								"
								onclick={() => viewFile(browseProject, file.filename)}
							>
								<div class="flex items-center gap-2 mb-1.5">
									<span class="font-bold font-mono text-sm" style="color: oklch(0.85 0.05 250);">
										{file.title}
									</span>
									{#if file.task}
										<span class="font-mono text-xs px-1.5 py-0.5 rounded" style="background: oklch(0.55 0.15 200 / 0.15); color: oklch(0.75 0.12 200);">
											{file.task}
										</span>
									{/if}
									<span class="ml-auto font-mono text-[10px]" style="color: oklch(0.45 0.02 250);">
										{formatSize(file.size)} | {formatDate(file.completed_at || file.modified)}
									</span>
								</div>
								{#if file.summary}
									<p class="font-mono text-xs line-clamp-2 mb-2" style="color: oklch(0.60 0.03 250);">
										{file.summary}
									</p>
								{/if}
								<div class="flex items-center gap-2 flex-wrap">
									{#if file.agent}
										<span class="font-mono text-[10px] px-1.5 py-0.5 rounded" style="background: oklch(0.55 0.15 85 / 0.12); color: oklch(0.70 0.10 85);">
											{file.agent}
										</span>
									{/if}
									{#if Array.isArray(file.tags)}
										{#each file.tags.slice(0, 5) as tag}
											<span class="font-mono text-[10px] px-1.5 py-0.5 rounded" style="background: oklch(0.30 0.02 250); color: oklch(0.60 0.03 250);">
												{tag}
											</span>
										{/each}
									{/if}
									{#if file.risk}
										<span class="font-mono text-[10px] px-1.5 py-0.5 rounded ml-auto" style="
											background: {file.risk === 'high' ? 'oklch(0.50 0.15 30 / 0.15)' : file.risk === 'medium' ? 'oklch(0.55 0.15 85 / 0.12)' : 'oklch(0.30 0.02 250)'};
											color: {file.risk === 'high' ? 'oklch(0.75 0.12 30)' : file.risk === 'medium' ? 'oklch(0.70 0.10 85)' : 'oklch(0.60 0.03 250)'};
										">
											risk: {file.risk}
										</span>
									{/if}
								</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- STATUS TAB -->
		{#if activeTab === 'status'}
			<div class="p-6 max-w-5xl mx-auto space-y-6">
				{#if statusLoading}
					<div class="flex items-center gap-2 py-8 justify-center">
						<span class="loading loading-spinner loading-sm" style="color: oklch(0.65 0.15 280);"></span>
						<span class="font-mono text-sm" style="color: oklch(0.55 0.02 250);">Loading status...</span>
					</div>
				{:else if projectStatuses.length === 0}
					<div class="text-center py-12 space-y-3">
						<p class="font-mono text-sm" style="color: oklch(0.50 0.02 250);">
							No projects with memory directories found
						</p>
						<p class="font-mono text-xs" style="color: oklch(0.40 0.02 250);">
							Memory files are stored in .jat/memory/ within each project
						</p>
					</div>
				{:else}
					<!-- Reindex results -->
					{#if reindexResults}
						<div class="p-4 rounded-lg" style="background: oklch(0.55 0.15 145 / 0.1); border: 1px solid oklch(0.55 0.15 145 / 0.25);">
							<div class="font-mono text-xs font-bold mb-2" style="color: oklch(0.75 0.12 145);">Reindex Complete</div>
							{#each reindexResults as r}
								<div class="font-mono text-xs" style="color: oklch(0.65 0.05 250);">
									{r.project}: {r.error ? `Error: ${r.error}` : `${r.indexed || 0} indexed, ${r.chunks || r.totalChunks || 0} chunks`}
								</div>
							{/each}
						</div>
					{/if}

					<!-- Project cards -->
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						{#each projectStatuses as proj}
							<div
								class="p-4 rounded-lg"
								style="
									background: oklch(0.18 0.01 250);
									border: 1px solid oklch(0.25 0.02 250);
								"
							>
								<div class="flex items-center justify-between mb-3">
									<div class="flex items-center gap-2">
										<span class="font-bold font-mono text-sm" style="color: oklch(0.85 0.05 250);">
											{proj.project}
										</span>
										{#if proj.hasIndex}
											<span class="font-mono text-[10px] px-1.5 py-0.5 rounded" style="background: oklch(0.55 0.15 145 / 0.15); color: oklch(0.70 0.10 145);">
												indexed
											</span>
										{:else}
											<span class="font-mono text-[10px] px-1.5 py-0.5 rounded" style="background: oklch(0.55 0.15 85 / 0.12); color: oklch(0.70 0.10 85);">
												not indexed
											</span>
										{/if}
									</div>
									<button
										class="font-mono text-[10px] px-2 py-1 rounded transition-all"
										style="background: oklch(0.25 0.02 250); color: oklch(0.60 0.05 250);"
										disabled={reindexing}
										onclick={() => handleReindex(proj.project)}
									>
										Reindex
									</button>
								</div>

								<div class="grid grid-cols-3 gap-3">
									<div>
										<div class="font-mono text-[10px] uppercase tracking-wider mb-1" style="color: oklch(0.45 0.02 250);">Files</div>
										<div class="font-mono text-lg font-bold" style="color: oklch(0.80 0.05 250);">{proj.fileCount || 0}</div>
									</div>
									<div>
										<div class="font-mono text-[10px] uppercase tracking-wider mb-1" style="color: oklch(0.45 0.02 250);">Chunks</div>
										<div class="font-mono text-lg font-bold" style="color: oklch(0.80 0.05 250);">{proj.chunkCount || 0}</div>
									</div>
									<div>
										<div class="font-mono text-[10px] uppercase tracking-wider mb-1" style="color: oklch(0.45 0.02 250);">Embedded</div>
										<div class="font-mono text-lg font-bold" style="color: oklch(0.80 0.05 250);">{proj.embeddedCount || 0}</div>
									</div>
								</div>

								{#if proj.error}
									<div class="mt-3 font-mono text-xs" style="color: oklch(0.65 0.10 30);">
										{proj.error}
									</div>
								{/if}
							</div>
						{/each}
					</div>

					<!-- Info -->
					<div class="p-4 rounded-lg" style="background: oklch(0.16 0.01 250); border: 1px solid oklch(0.22 0.02 250);">
						<div class="font-mono text-xs space-y-1" style="color: oklch(0.50 0.02 250);">
							<p>Memory files: <code style="color: oklch(0.65 0.10 280);">.jat/memory/*.md</code></p>
							<p>Index database: <code style="color: oklch(0.65 0.10 280);">.jat/memory.db</code></p>
							<p>CLI: <code style="color: oklch(0.65 0.10 280);">jat-memory index | search | status | providers</code></p>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- File Viewer Drawer -->
	{#if viewingFile || fileLoading}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="fixed inset-0 z-50 flex justify-end"
			onclick={(e) => { if (e.target === e.currentTarget) closeFileViewer(); }}
		>
			<!-- Overlay -->
			<div class="absolute inset-0" style="background: oklch(0 0 0 / 0.5);"></div>

			<!-- Drawer panel -->
			<div
				class="relative w-full max-w-3xl h-full overflow-y-auto shadow-2xl"
				style="background: oklch(0.16 0.01 250);"
			>
				{#if fileLoading}
					<div class="flex items-center gap-2 p-8 justify-center">
						<span class="loading loading-spinner loading-sm" style="color: oklch(0.65 0.15 280);"></span>
					</div>
				{:else if viewingFile}
					<!-- Header -->
					<div class="sticky top-0 flex items-center justify-between px-6 py-4 border-b z-10" style="background: oklch(0.18 0.01 250); border-color: oklch(0.25 0.02 250);">
						<div class="flex items-center gap-2">
							<span class="font-mono text-xs px-1.5 py-0.5 rounded" style="background: oklch(0.55 0.15 280 / 0.15); color: oklch(0.75 0.12 280);">
								{viewingFile.project}
							</span>
							<span class="font-mono text-sm font-bold" style="color: oklch(0.85 0.05 250);">
								{viewingFile.filename}
							</span>
						</div>
						<button
							class="p-1.5 rounded transition-all"
							style="color: oklch(0.55 0.02 250);"
							onclick={closeFileViewer}
							aria-label="Close file viewer"
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>

					<!-- Frontmatter badges -->
					{#if viewingFile.frontmatter && Object.keys(viewingFile.frontmatter).length > 0}
						<div class="flex flex-wrap gap-2 px-6 py-3 border-b" style="border-color: oklch(0.22 0.02 250);">
							{#each Object.entries(viewingFile.frontmatter) as [key, value]}
								<span class="font-mono text-[10px] px-2 py-0.5 rounded" style="background: oklch(0.25 0.02 250); color: oklch(0.65 0.05 250);">
									{key}: {Array.isArray(value) ? value.join(', ') : value}
								</span>
							{/each}
						</div>
					{/if}

					<!-- Content -->
					<div class="px-6 py-4">
						<pre class="font-mono text-sm whitespace-pre-wrap leading-relaxed" style="color: oklch(0.80 0.03 250);">{viewingFile.content}</pre>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
