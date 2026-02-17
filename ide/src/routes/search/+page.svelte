<script lang="ts">
	/**
	 * Unified Search Page
	 *
	 * Single search bar that queries tasks, memory, and files from /api/search.
	 * Results grouped by source with tabs to filter. URL-synced state.
	 * Optional AI synthesis panel via /api/search/synthesize.
	 *
	 * Task: jat-tvos9.4
	 */

	import { onMount, tick } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import TaskIdBadge from '$lib/components/TaskIdBadge.svelte';
	import TaskDetailDrawer from '$lib/components/TaskDetailDrawer.svelte';
	import ProjectSelector from '$lib/components/ProjectSelector.svelte';

	// --- Types ---
	interface TaskResult {
		id: string;
		title: string;
		status: string;
		priority: number;
		issue_type?: string;
		description?: string;
		snippet?: string;
		score?: number;
		labels?: string[];
		assignee?: string;
	}

	interface MemoryResult {
		file: string;
		taskId?: string;
		section?: string;
		snippet?: string;
		score?: number;
		agent?: string;
		date?: string;
	}

	interface FileResult {
		path: string;
		line?: number;
		snippet?: string;
		matchType?: string;
		project?: string;
	}

	interface SearchMeta {
		queryTime: number;
		totalResults: number;
		sources: string[];
		query: string;
		limit: number;
	}

	interface SynthesisResult {
		summary: string;
		recommendedAction: string | null;
		keyFiles: string[];
		relatedTasks: string[];
		provider?: string;
		model?: string;
	}

	type SourceTab = 'all' | 'tasks' | 'memory' | 'files';

	// --- State ---
	let query = $state('');
	let activeTab = $state<SourceTab>('all');
	let selectedProject = $state('');

	let taskResults = $state<TaskResult[]>([]);
	let memoryResults = $state<MemoryResult[]>([]);
	let fileResults = $state<FileResult[]>([]);
	let meta = $state<SearchMeta | null>(null);

	let loading = $state(false);
	let error = $state('');

	// Synthesis
	let synthesis = $state<SynthesisResult | null>(null);
	let synthesisLoading = $state(false);
	let synthesisError = $state('');
	let synthesisOpen = $state(false);

	// Projects
	let projects = $state<string[]>([]);

	// Task detail drawer
	let selectedTaskId = $state<string | null>(null);
	let drawerOpen = $state(false);

	// Debounce
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	// Search input ref
	let searchInputEl: HTMLInputElement | undefined;

	// --- URL Sync ---
	// Read state from URL on mount (avoids $effect reactivity issues)
	let initialized = false;

	function updateUrl() {
		const params = new URLSearchParams();
		if (query) params.set('q', query);
		if (activeTab !== 'all') params.set('tab', activeTab);
		if (selectedProject) params.set('project', selectedProject);
		const search = params.toString();
		const newUrl = `/search${search ? '?' + search : ''}`;
		// Only push if different to avoid loop
		if (newUrl !== $page.url.pathname + $page.url.search) {
			goto(newUrl, { replaceState: true, keepFocus: true });
		}
	}

	// --- Data Fetching ---
	async function fetchProjects() {
		try {
			const res = await fetch('/api/projects?visible=true');
			const data = await res.json();
			projects = (data.projects || []).map((p: { name: string }) => p.name);
		} catch {
			// Non-critical
		}
	}

	async function doSearch() {
		if (!query.trim()) {
			taskResults = [];
			memoryResults = [];
			fileResults = [];
			meta = null;
			synthesis = null;
			synthesisOpen = false;
			return;
		}

		loading = true;
		error = '';
		synthesis = null;

		try {
			const params = new URLSearchParams({ q: query.trim(), limit: '10' });

			// Only request active source tab (or all)
			if (activeTab !== 'all') {
				params.set('sources', activeTab);
			}

			if (selectedProject) {
				params.set('project', selectedProject);
			}

			const res = await fetch(`/api/search?${params}`);
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Search failed');
			}

			const data = await res.json();
			taskResults = data.tasks || [];
			memoryResults = data.memory || [];
			fileResults = data.files || [];
			meta = data.meta || null;

			// Auto-synthesize when results are available
			const total = (data.tasks || []).length + (data.memory || []).length + (data.files || []).length;
			if (total > 0) {
				synthesisOpen = true;
				synthesisLoading = true;
				doSynthesis();
			} else {
				synthesisOpen = false;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Search failed';
			taskResults = [];
			memoryResults = [];
			fileResults = [];
		} finally {
			loading = false;
		}
	}

	async function doSynthesis() {
		if (!meta || meta.totalResults === 0) return;

		synthesisLoading = true;
		synthesisError = '';
		synthesisOpen = true;

		try {
			const res = await fetch('/api/search/synthesize', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: query.trim(),
					results: { tasks: taskResults, memory: memoryResults, files: fileResults }
				})
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Synthesis failed');
			}

			synthesis = await res.json();
		} catch (err) {
			synthesisError = err instanceof Error ? err.message : 'Synthesis failed';
		} finally {
			synthesisLoading = false;
		}
	}

	// --- Event Handlers ---
	function handleInput() {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			updateUrl();
			doSearch();
		}, 300);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			if (debounceTimer) clearTimeout(debounceTimer);
			updateUrl();
			doSearch();
		}
		if (e.key === 'Escape') {
			query = '';
			taskResults = [];
			memoryResults = [];
			fileResults = [];
			meta = null;
			synthesis = null;
			updateUrl();
		}
	}

	function switchTab(tab: SourceTab) {
		activeTab = tab;
		updateUrl();
		if (query.trim()) doSearch();
	}

	function selectProject(project: string) {
		selectedProject = project;
		updateUrl();
		if (query.trim()) doSearch();
	}

	function openTask(taskId: string) {
		selectedTaskId = taskId;
		drawerOpen = true;
	}

	function navigateToMemory(file: string) {
		goto(`/memory?file=${encodeURIComponent(file)}`);
	}

	function navigateToFile(path: string, line?: number) {
		const params = new URLSearchParams({ path });
		if (line) params.set('line', String(line));
		goto(`/files?${params}`);
	}

	// Derived counts
	const taskCount = $derived(taskResults.length);
	const memoryCount = $derived(memoryResults.length);
	const fileCount = $derived(fileResults.length);
	const totalCount = $derived(taskCount + memoryCount + fileCount);

	// Has results
	const hasResults = $derived(totalCount > 0);
	const hasSearched = $derived(meta !== null);

	// Status color helper
	function statusColor(status: string): string {
		switch (status) {
			case 'open': return 'oklch(0.70 0.15 200)';
			case 'in_progress': return 'oklch(0.75 0.15 85)';
			case 'closed': return 'oklch(0.65 0.18 145)';
			case 'blocked': return 'oklch(0.65 0.18 25)';
			default: return 'oklch(0.60 0.02 250)';
		}
	}

	function priorityColor(p: number): string {
		switch (p) {
			case 0: return 'oklch(0.65 0.22 25)';
			case 1: return 'oklch(0.75 0.15 85)';
			case 2: return 'oklch(0.70 0.15 200)';
			default: return 'oklch(0.55 0.02 250)';
		}
	}

	// Highlight matched text
	function highlightMatch(text: string, q: string): string {
		if (!q || !text) return escapeHtml(text || '');
		const escaped = escapeHtml(text);
		const pattern = q.split(/\s+/).filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
		if (!pattern) return escaped;
		return escaped.replace(new RegExp(`(${pattern})`, 'gi'), '<mark class="bg-warning/30 text-warning-content rounded px-0.5">$1</mark>');
	}

	function escapeHtml(str: string): string {
		return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	// Truncate with ellipsis
	function truncate(str: string, len: number): string {
		if (!str) return '';
		return str.length > len ? str.slice(0, len) + '...' : str;
	}

	// Global keyboard shortcut: Ctrl+K / Cmd+K
	function handleGlobalKeydown(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
			e.preventDefault();
			searchInputEl?.focus();
			searchInputEl?.select();
		}
	}

	onMount(() => {
		fetchProjects();

		// Initialize from URL params
		const params = new URL(window.location.href).searchParams;
		const tabParam = params.get('tab') as SourceTab | null;
		const projectParam = params.get('project');
		const qParam = params.get('q');

		if (tabParam && ['all', 'tasks', 'memory', 'files'].includes(tabParam)) {
			activeTab = tabParam;
		}
		if (projectParam) {
			selectedProject = projectParam;
		}
		if (qParam) {
			query = qParam;
			// Use tick to ensure state is committed before search
			tick().then(() => doSearch());
		}
		initialized = true;

		// Focus search input on mount
		tick().then(() => searchInputEl?.focus());

		document.addEventListener('keydown', handleGlobalKeydown);
		return () => document.removeEventListener('keydown', handleGlobalKeydown);
	});
</script>

<div class="flex flex-col h-full overflow-hidden" style="background: oklch(0.16 0.01 250);">
	<!-- Header: Search bar + filters -->
	<div class="flex-none px-6 pt-5 pb-3" style="background: oklch(0.18 0.01 250); border-bottom: 1px solid oklch(0.25 0.02 250);">
		<!-- Search input -->
		<div class="relative max-w-4xl mx-auto">
			<div class="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style="color: oklch(0.50 0.02 250);">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
				</svg>
			</div>
			<input
				bind:this={searchInputEl}
				bind:value={query}
				oninput={handleInput}
				onkeydown={handleKeydown}
				type="text"
				placeholder="Search tasks, memory, and files... (Ctrl+K)"
				class="w-full pl-11 pr-4 py-3 rounded-lg text-sm font-mono outline-none transition-all duration-200"
				style="
					background: oklch(0.14 0.01 250);
					border: 1px solid oklch(0.30 0.02 250);
					color: oklch(0.90 0.02 250);
				"
				onfocus={(e) => { (e.target as HTMLInputElement).style.borderColor = 'oklch(0.55 0.15 200)'; (e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px oklch(0.55 0.15 200 / 0.15)'; }}
				onblur={(e) => { (e.target as HTMLInputElement).style.borderColor = 'oklch(0.30 0.02 250)'; (e.target as HTMLInputElement).style.boxShadow = 'none'; }}
			/>
			{#if query}
				<button
					onclick={() => { query = ''; taskResults = []; memoryResults = []; fileResults = []; meta = null; synthesis = null; updateUrl(); searchInputEl?.focus(); }}
					class="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors hover:bg-base-300/30"
					style="color: oklch(0.50 0.02 250);"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			{/if}
		</div>

		<!-- Tabs + Project filter row -->
		<div class="flex items-center justify-between max-w-4xl mx-auto mt-3">
			<!-- Source tabs -->
			<div class="flex gap-1">
				{#each [
					{ id: 'all' as SourceTab, label: 'All', count: totalCount },
					{ id: 'tasks' as SourceTab, label: 'Tasks', count: taskCount },
					{ id: 'memory' as SourceTab, label: 'Memory', count: memoryCount },
					{ id: 'files' as SourceTab, label: 'Files', count: fileCount }
				] as tab}
					<button
						onclick={() => switchTab(tab.id)}
						class="px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150"
						style="
							background: {activeTab === tab.id ? 'oklch(0.30 0.04 200)' : 'transparent'};
							color: {activeTab === tab.id ? 'oklch(0.90 0.10 200)' : 'oklch(0.55 0.02 250)'};
							border: 1px solid {activeTab === tab.id ? 'oklch(0.40 0.08 200)' : 'transparent'};
						"
					>
						{tab.label}
						{#if hasSearched && tab.count > 0}
							<span
								class="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
								style="background: oklch(0.30 0.05 200); color: oklch(0.80 0.10 200);"
							>{tab.count}</span>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Project filter -->
			{#if projects.length > 1}
				<ProjectSelector
					{projects}
					{selectedProject}
					onProjectChange={selectProject}
					compact
					showColors
				/>
			{/if}
		</div>
	</div>

	<!-- Results area -->
	<div class="flex-1 overflow-y-auto px-4 py-4">
		{#if loading}
			<!-- Loading skeleton — 3-column -->
			<div class="grid grid-cols-3 gap-3">
				{#each [1, 2, 3] as _}
					<div class="space-y-2">
						<div class="skeleton h-3 w-16 rounded" style="background: oklch(0.25 0.02 250);"></div>
						{#each [1, 2, 3] as __}
							<div class="rounded-md p-3" style="background: oklch(0.20 0.01 250); border: 1px solid oklch(0.25 0.02 250);">
								<div class="skeleton h-3 w-full rounded mb-2" style="background: oklch(0.25 0.02 250);"></div>
								<div class="skeleton h-3 w-2/3 rounded" style="background: oklch(0.22 0.02 250);"></div>
							</div>
						{/each}
					</div>
				{/each}
			</div>
		{:else if error}
			<div class="max-w-2xl mx-auto rounded-lg p-4" style="background: oklch(0.22 0.08 25 / 0.15); border: 1px solid oklch(0.50 0.15 25 / 0.3);">
				<p class="text-sm" style="color: oklch(0.70 0.15 25);">{error}</p>
			</div>
		{:else if hasSearched && !hasResults}
			<!-- No results -->
			<div class="text-center py-12">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12 mx-auto mb-3" style="color: oklch(0.40 0.02 250);">
					<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
				</svg>
				<p class="text-sm font-medium" style="color: oklch(0.55 0.02 250);">No results found for "{query}"</p>
				<p class="text-xs mt-1" style="color: oklch(0.45 0.02 250);">Try different keywords or broaden your search</p>
			</div>
		{:else if !hasSearched}
			<!-- Empty state -->
			<div class="text-center py-16">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" class="w-16 h-16 mx-auto mb-4" style="color: oklch(0.30 0.02 250);">
					<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
				</svg>
				<p class="text-sm" style="color: oklch(0.45 0.02 250);">Search across tasks, memory, and files</p>
				<p class="text-xs mt-2" style="color: oklch(0.35 0.02 250);">
					<kbd class="px-1.5 py-0.5 rounded text-[10px] font-mono" style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.30 0.02 250);">Ctrl+K</kbd>
					to focus from anywhere
				</p>
			</div>
		{:else}
			<!-- Meta info -->
			{#if meta}
				<div class="flex items-center justify-between mb-3">
					<p class="text-xs" style="color: oklch(0.50 0.02 250);">
						{meta.totalResults} result{meta.totalResults !== 1 ? 's' : ''} in {meta.queryTime}ms
					</p>
				</div>
			{/if}

			<!-- AI Synthesis Panel (80% width, centered above columns) -->
			{#if synthesisOpen}
				<div class="rounded-lg overflow-hidden mb-3 mx-auto" style="width: 80%; background: oklch(0.20 0.03 280 / 0.3); border: 1px solid oklch(0.35 0.06 280 / 0.4);">
					<button
						onclick={() => synthesisOpen = !synthesisOpen}
						class="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium"
						style="color: oklch(0.80 0.10 280);"
					>
						<span class="flex items-center gap-2">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
							</svg>
							AI Synthesis
						</span>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
					<div class="px-4 pb-4">
						{#if synthesisLoading}
							<div class="flex items-center gap-2 py-3">
								<span class="loading loading-dots loading-sm" style="color: oklch(0.70 0.10 280);"></span>
								<span class="text-xs" style="color: oklch(0.60 0.06 280);">Synthesizing results...</span>
							</div>
						{:else if synthesisError}
							<p class="text-xs py-2" style="color: oklch(0.70 0.15 25);">{synthesisError}</p>
						{:else if synthesis}
							<div class="space-y-3">
								<p class="text-sm leading-relaxed" style="color: oklch(0.85 0.04 280);">{synthesis.summary}</p>
								{#if synthesis.recommendedAction}
									<div class="rounded-md px-3 py-2" style="background: oklch(0.22 0.04 280 / 0.4); border: 1px solid oklch(0.35 0.06 280 / 0.3);">
										<p class="text-xs font-medium mb-0.5" style="color: oklch(0.70 0.10 280);">Recommended Action</p>
										<p class="text-sm" style="color: oklch(0.80 0.04 250);">{synthesis.recommendedAction}</p>
									</div>
								{/if}
								{#if synthesis.keyFiles.length > 0}
									<div>
										<p class="text-xs font-medium mb-1" style="color: oklch(0.60 0.06 280);">Key Files</p>
										<div class="flex flex-wrap gap-1">
											{#each synthesis.keyFiles as file}
												<button
													onclick={() => navigateToFile(file)}
													class="text-[11px] font-mono px-2 py-0.5 rounded transition-colors"
													style="background: oklch(0.22 0.02 250); color: oklch(0.70 0.10 200); border: 1px solid oklch(0.30 0.04 200 / 0.3);"
												>{file}</button>
											{/each}
										</div>
									</div>
								{/if}
								{#if synthesis.relatedTasks.length > 0}
									<div>
										<p class="text-xs font-medium mb-1" style="color: oklch(0.60 0.06 280);">Related Tasks</p>
										<div class="flex flex-wrap gap-1.5">
											{#each synthesis.relatedTasks as taskId}
												<button onclick={() => openTask(taskId)}>
													<TaskIdBadge
														task={{ id: taskId, status: 'open' }}
														size="xs"
														minimal
													/>
												</button>
											{/each}
										</div>
									</div>
								{/if}
								{#if synthesis.provider}
									<p class="text-[10px]" style="color: oklch(0.40 0.02 250);">via {synthesis.provider}{synthesis.model ? ` (${synthesis.model})` : ''}</p>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Trinity layout: 3-column grid when 'all' tab, single column when filtered -->
			{#if activeTab === 'all'}
				<div class="grid grid-cols-3 gap-3 items-start">
					<!-- TASKS Column -->
					<div class="min-w-0">
						<h3 class="text-[11px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5 px-1" style="color: oklch(0.55 0.02 250);">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3 flex-none">
								<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
							</svg>
							Tasks
							<span class="text-[10px] font-normal" style="color: oklch(0.45 0.02 250);">({taskCount})</span>
						</h3>
						{#if taskResults.length > 0}
							<div class="space-y-1">
								{#each taskResults as task}
									<button
										onclick={() => openTask(task.id)}
										class="w-full text-left rounded-md px-2.5 py-2 transition-all duration-150 group"
										style="background: oklch(0.20 0.01 250); border: 1px solid oklch(0.25 0.02 250);"
										onmouseenter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'oklch(0.35 0.06 200)'; (e.currentTarget as HTMLElement).style.background = 'oklch(0.22 0.02 250)'; }}
										onmouseleave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'oklch(0.25 0.02 250)'; (e.currentTarget as HTMLElement).style.background = 'oklch(0.20 0.01 250)'; }}
									>
										<div class="flex items-center gap-1.5 min-w-0">
											<div class="flex-none">
												<TaskIdBadge {task} size="xs" />
											</div>
											<p class="text-xs font-medium truncate min-w-0" style="color: oklch(0.88 0.02 250);">{task.title}</p>
										</div>
										{#if task.snippet || task.description}
											<p class="text-[11px] mt-1 line-clamp-2" style="color: oklch(0.50 0.02 250);">
												{@html highlightMatch(truncate(task.snippet || task.description || '', 150), query)}
											</p>
										{/if}
									</button>
								{/each}
							</div>
						{:else}
							<p class="text-[11px] px-1" style="color: oklch(0.40 0.02 250);">No task matches</p>
						{/if}
					</div>

					<!-- MEMORY Column -->
					<div class="min-w-0">
						<h3 class="text-[11px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5 px-1" style="color: oklch(0.55 0.02 250);">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3 flex-none">
								<path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
							</svg>
							Memory
							<span class="text-[10px] font-normal" style="color: oklch(0.45 0.02 250);">({memoryCount})</span>
						</h3>
						{#if memoryResults.length > 0}
							<div class="space-y-1">
								{#each memoryResults as mem}
									<button
										onclick={() => navigateToMemory(mem.file)}
										class="w-full text-left rounded-md px-2.5 py-2 transition-all duration-150"
										style="background: oklch(0.20 0.01 250); border: 1px solid oklch(0.25 0.02 250);"
										onmouseenter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'oklch(0.35 0.06 145)'; (e.currentTarget as HTMLElement).style.background = 'oklch(0.22 0.02 250)'; }}
										onmouseleave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'oklch(0.25 0.02 250)'; (e.currentTarget as HTMLElement).style.background = 'oklch(0.20 0.01 250)'; }}
									>
										<div class="flex items-center gap-1.5 flex-wrap">
											{#if mem.taskId}
												<TaskIdBadge task={{ id: mem.taskId, status: 'closed' }} size="xs" minimal />
											{/if}
											{#if mem.agent}
												<span class="text-[10px] font-medium" style="color: oklch(0.65 0.10 200);">{mem.agent}</span>
											{/if}
											{#if mem.section}
												<span class="text-[10px] px-1 py-0.5 rounded" style="background: oklch(0.25 0.04 145 / 0.3); color: oklch(0.65 0.12 145);">{mem.section}</span>
											{/if}
										</div>
										<p class="text-[11px] font-mono truncate mt-0.5" style="color: oklch(0.55 0.02 250);">{mem.file.split('/').pop()}</p>
										{#if mem.snippet}
											<p class="text-[11px] mt-1 line-clamp-2" style="color: oklch(0.50 0.02 250);">
												{@html highlightMatch(truncate(mem.snippet, 150), query)}
											</p>
										{/if}
									</button>
								{/each}
							</div>
						{:else}
							<p class="text-[11px] px-1" style="color: oklch(0.40 0.02 250);">No memory matches</p>
						{/if}
					</div>

					<!-- FILES Column -->
					<div class="min-w-0">
						<h3 class="text-[11px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5 px-1" style="color: oklch(0.55 0.02 250);">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3 flex-none">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
							</svg>
							Files
							<span class="text-[10px] font-normal" style="color: oklch(0.45 0.02 250);">({fileCount})</span>
						</h3>
						{#if fileResults.length > 0}
							<div class="space-y-1">
								{#each fileResults as file}
									<button
										onclick={() => navigateToFile(file.path, file.line)}
										class="w-full text-left rounded-md px-2.5 py-2 transition-all duration-150"
										style="background: oklch(0.20 0.01 250); border: 1px solid oklch(0.25 0.02 250);"
										onmouseenter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'oklch(0.35 0.06 85)'; (e.currentTarget as HTMLElement).style.background = 'oklch(0.22 0.02 250)'; }}
										onmouseleave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'oklch(0.25 0.02 250)'; (e.currentTarget as HTMLElement).style.background = 'oklch(0.20 0.01 250)'; }}
									>
										<p class="text-[11px] font-mono truncate" style="color: oklch(0.70 0.10 85);">
											{file.path.split('/').pop()}{file.line ? `:${file.line}` : ''}
										</p>
										<p class="text-[10px] font-mono truncate" style="color: oklch(0.40 0.02 250);">{file.path}</p>
										{#if file.snippet}
											<pre class="text-[11px] mt-1 overflow-hidden whitespace-pre-wrap break-all line-clamp-2 font-mono" style="color: oklch(0.50 0.02 250);">{@html highlightMatch(truncate(file.snippet, 200), query)}</pre>
										{/if}
									</button>
								{/each}
							</div>
						{:else}
							<p class="text-[11px] px-1" style="color: oklch(0.40 0.02 250);">No file matches</p>
						{/if}
					</div>
				</div>
			{:else}
				<!-- Single-source filtered view (full width) -->
				<div class="max-w-3xl mx-auto">
					<!-- TASKS (filtered) -->
					{#if activeTab === 'tasks' && taskResults.length > 0}
						<div class="space-y-1">
							{#each taskResults as task}
								<button
									onclick={() => openTask(task.id)}
									class="w-full text-left rounded-md px-3 py-2.5 transition-all duration-150 group"
									style="background: oklch(0.20 0.01 250); border: 1px solid oklch(0.25 0.02 250);"
									onmouseenter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'oklch(0.35 0.06 200)'; (e.currentTarget as HTMLElement).style.background = 'oklch(0.22 0.02 250)'; }}
									onmouseleave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'oklch(0.25 0.02 250)'; (e.currentTarget as HTMLElement).style.background = 'oklch(0.20 0.01 250)'; }}
								>
									<div class="flex items-center gap-2 min-w-0">
										<div class="flex-none">
											<TaskIdBadge {task} size="xs" />
										</div>
										<p class="text-sm font-medium truncate min-w-0" style="color: oklch(0.88 0.02 250);">{task.title}</p>
									</div>
									{#if task.snippet || task.description}
										<p class="text-xs mt-1 line-clamp-2" style="color: oklch(0.55 0.02 250);">
											{@html highlightMatch(truncate(task.snippet || task.description || '', 200), query)}
										</p>
									{/if}
								</button>
							{/each}
						</div>
					{/if}

					<!-- MEMORY (filtered) -->
					{#if activeTab === 'memory' && memoryResults.length > 0}
						<div class="space-y-1">
							{#each memoryResults as mem}
								<button
									onclick={() => navigateToMemory(mem.file)}
									class="w-full text-left rounded-md px-3 py-2.5 transition-all duration-150"
									style="background: oklch(0.20 0.01 250); border: 1px solid oklch(0.25 0.02 250);"
									onmouseenter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'oklch(0.35 0.06 145)'; (e.currentTarget as HTMLElement).style.background = 'oklch(0.22 0.02 250)'; }}
									onmouseleave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'oklch(0.25 0.02 250)'; (e.currentTarget as HTMLElement).style.background = 'oklch(0.20 0.01 250)'; }}
								>
									<div class="flex items-center gap-2 flex-wrap">
										{#if mem.taskId}
											<TaskIdBadge task={{ id: mem.taskId, status: 'closed' }} size="xs" minimal />
										{/if}
										{#if mem.agent}
											<span class="text-[10px] font-medium" style="color: oklch(0.65 0.10 200);">{mem.agent}</span>
										{/if}
										{#if mem.section}
											<span class="text-[10px] px-1.5 py-0.5 rounded" style="background: oklch(0.25 0.04 145 / 0.3); color: oklch(0.65 0.12 145);">{mem.section}</span>
										{/if}
									</div>
									<p class="text-xs font-mono truncate mt-0.5" style="color: oklch(0.60 0.02 250);">{mem.file}</p>
									{#if mem.snippet}
										<p class="text-xs mt-1 line-clamp-2" style="color: oklch(0.55 0.02 250);">
											{@html highlightMatch(truncate(mem.snippet, 200), query)}
										</p>
									{/if}
								</button>
							{/each}
						</div>
					{/if}

					<!-- FILES (filtered) -->
					{#if activeTab === 'files' && fileResults.length > 0}
						<div class="space-y-1">
							{#each fileResults as file}
								<button
									onclick={() => navigateToFile(file.path, file.line)}
									class="w-full text-left rounded-md px-3 py-2.5 transition-all duration-150"
									style="background: oklch(0.20 0.01 250); border: 1px solid oklch(0.25 0.02 250);"
									onmouseenter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'oklch(0.35 0.06 85)'; (e.currentTarget as HTMLElement).style.background = 'oklch(0.22 0.02 250)'; }}
									onmouseleave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'oklch(0.25 0.02 250)'; (e.currentTarget as HTMLElement).style.background = 'oklch(0.20 0.01 250)'; }}
								>
									<div class="flex items-center gap-2">
										<span class="text-xs font-mono truncate" style="color: oklch(0.70 0.10 85);">
											{file.path}{file.line ? `:${file.line}` : ''}
										</span>
										{#if file.matchType}
											<span class="text-[10px] px-1.5 py-0.5 rounded" style="background: oklch(0.25 0.04 85 / 0.3); color: oklch(0.65 0.10 85);">{file.matchType}</span>
										{/if}
									</div>
									{#if file.snippet}
										<pre class="text-[11px] mt-1 overflow-hidden whitespace-pre-wrap break-all line-clamp-3 font-mono" style="color: oklch(0.55 0.02 250);">{@html highlightMatch(truncate(file.snippet, 300), query)}</pre>
									{/if}
								</button>
							{/each}
						</div>
					{/if}

					<!-- No results for filtered tab -->
					{#if (activeTab === 'tasks' && taskResults.length === 0) || (activeTab === 'memory' && memoryResults.length === 0) || (activeTab === 'files' && fileResults.length === 0)}
						<div class="text-center py-8">
							<p class="text-sm" style="color: oklch(0.50 0.02 250);">No {activeTab} results for "{query}"</p>
						</div>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
</div>

<!-- Task Detail Drawer -->
<TaskDetailDrawer bind:taskId={selectedTaskId} bind:isOpen={drawerOpen} />
