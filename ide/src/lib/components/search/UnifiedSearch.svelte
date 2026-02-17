<script lang="ts">
	/**
	 * UnifiedSearch - Single search component for both /search route and Ctrl+K modal.
	 *
	 * 5 tabs: All | Tasks | Memory | Filenames | Content
	 * - All: trinity layout (tasks + memory + files columns) with AI synthesis
	 * - Tasks/Memory: focused results via /api/search?sources=...
	 * - Filenames: fuzzy filename matching via /api/files/search
	 * - Content: ripgrep content search via /api/files/grep (with regex/case/glob options)
	 *
	 * Two rendering modes:
	 * - route: full page, URL-synced state
	 * - modal: overlay triggered by Ctrl+K or topbar icon
	 *
	 * Task: jat-fqaqf
	 */

	import { onMount, tick } from 'svelte';
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

	interface FilenameResult {
		path: string;
		name: string;
		folder: string;
	}

	interface ContentResult {
		file: string;
		line: number;
		content: string;
		before?: string[];
		after?: string[];
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

	type SourceTab = 'all' | 'tasks' | 'memory' | 'filenames' | 'content';

	const TABS: { id: SourceTab; label: string; icon: string }[] = [
		{ id: 'all', label: 'All', icon: 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5' },
		{ id: 'tasks', label: 'Tasks', icon: 'M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z' },
		{ id: 'memory', label: 'Memory', icon: 'M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125' },
		{ id: 'filenames', label: 'Filenames', icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' },
		{ id: 'content', label: 'Content', icon: 'M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5' },
	];

	// --- Props ---
	interface Props {
		mode: 'route' | 'modal';
		isOpen?: boolean;
		onClose?: () => void;
		projects?: string[];
		selectedProject?: string;
		onProjectChange?: (project: string) => void;
		initialQuery?: string;
		initialTab?: SourceTab;
		/** Callback when a file result is selected (for /files page integration) */
		onFileSelect?: (path: string, line: number, project: string) => void;
	}

	let {
		mode,
		isOpen = $bindable(false),
		onClose,
		projects = [],
		selectedProject: projectProp = '',
		onProjectChange,
		initialQuery = '',
		initialTab = 'all',
		onFileSelect,
	}: Props = $props();

	// --- State ---
	let query = $state(initialQuery);
	let activeTab = $state<SourceTab>(initialTab);
	let selectedProject = $state(projectProp);

	// All/Tasks/Memory results (from /api/search)
	let taskResults = $state<TaskResult[]>([]);
	let memoryResults = $state<MemoryResult[]>([]);
	let fileResults = $state<FileResult[]>([]);
	let meta = $state<SearchMeta | null>(null);

	// Filenames tab results (from /api/files/search)
	let filenameResults = $state<FilenameResult[]>([]);
	let filenameLoading = $state(false);

	// Content tab results (from /api/files/grep)
	let contentResults = $state<ContentResult[]>([]);
	let contentLoading = $state(false);
	let contentTruncated = $state(false);

	// Content tab options
	let useRegex = $state(false);
	let caseSensitive = $state(false);
	let globFilter = $state('');

	let loading = $state(false);
	let error = $state('');

	// Synthesis
	let synthesis = $state<SynthesisResult | null>(null);
	let synthesisLoading = $state(false);
	let synthesisError = $state('');
	let synthesisOpen = $state(false);

	// Keyboard navigation for filenames/content results
	let selectedResultIndex = $state(-1);

	// Task detail drawer
	let selectedTaskId = $state<string | null>(null);
	let drawerOpen = $state(false);

	// Debounce
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	// Refs
	let searchInputEl: HTMLInputElement | undefined;
	let resultsContainerEl: HTMLDivElement | undefined;
	let columnsContainerEl: HTMLDivElement | undefined;

	// --- Sync props ---
	$effect(() => {
		selectedProject = projectProp;
	});

	// Focus input when modal opens
	$effect(() => {
		if (mode === 'modal' && isOpen) {
			query = '';
			taskResults = [];
			memoryResults = [];
			fileResults = [];
			filenameResults = [];
			contentResults = [];
			meta = null;
			synthesis = null;
			activeTab = 'all';
			selectedResultIndex = -1;
			// tick alone isn't enough — modal DOM mounts async after isOpen changes
			tick().then(() => searchInputEl?.focus());
			setTimeout(() => searchInputEl?.focus(), 50);
			setTimeout(() => searchInputEl?.focus(), 150);
		}
	});

	// --- Derived ---
	const taskCount = $derived(taskResults.length);
	const memoryCount = $derived(memoryResults.length);
	const fileCount = $derived(fileResults.length);
	const filenameCount = $derived(filenameResults.length);
	const contentCount = $derived(contentResults.length);
	const allCount = $derived(taskCount + memoryCount + filenameCount + contentCount);

	function tabCount(tab: SourceTab): number {
		switch (tab) {
			case 'all': return allCount;
			case 'tasks': return taskCount;
			case 'memory': return memoryCount;
			case 'filenames': return filenameCount;
			case 'content': return contentCount;
		}
	}

	const hasSearched = $derived(meta !== null || filenameResults.length > 0 || contentResults.length > 0);
	const currentTabHasResults = $derived(
		tabCount(activeTab) > 0 ||
		// On "all" tab, don't show "no results" while some searches are still loading
		(activeTab === 'all' && (filenameLoading || contentLoading))
	);

	// --- Search Functions ---
	async function doUnifiedSearch() {
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

			// For individual tabs, only request that source
			if (activeTab === 'tasks') {
				params.set('sources', 'tasks');
			} else if (activeTab === 'memory') {
				params.set('sources', 'memory');
			}
			// 'all' requests everything (default)

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

			// Auto-synthesize on All tab when results are available
			if (activeTab === 'all') {
				const total = taskResults.length + memoryResults.length + fileResults.length;
				if (total > 0) {
					synthesisOpen = true;
					synthesisLoading = true;
					doSynthesis();
				} else {
					synthesisOpen = false;
				}
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

	async function doFilenameSearch() {
		if (!query.trim() || !selectedProject) {
			filenameResults = [];
			return;
		}

		filenameLoading = true;
		try {
			const params = new URLSearchParams({
				project: selectedProject,
				query: query.trim(),
				limit: '30'
			});
			const res = await fetch(`/api/files/search?${params}`);
			if (res.ok) {
				const data = await res.json();
				filenameResults = data.files || [];
			} else {
				filenameResults = [];
			}
		} catch {
			filenameResults = [];
		} finally {
			filenameLoading = false;
		}
	}

	async function doContentSearch() {
		if (!query.trim() || !selectedProject) {
			contentResults = [];
			contentTruncated = false;
			return;
		}

		contentLoading = true;
		try {
			const params = new URLSearchParams({
				project: selectedProject,
				q: query.trim(),
				limit: '100',
				context: '1'
			});

			if (globFilter.trim()) params.set('glob', globFilter.trim());
			if (useRegex) params.set('regex', 'true');
			if (caseSensitive) params.set('case', 'true');

			const res = await fetch(`/api/files/grep?${params}`);
			if (res.ok) {
				const data = await res.json();
				contentResults = data.results || [];
				contentTruncated = data.truncated || false;
			} else {
				contentResults = [];
				contentTruncated = false;
			}
		} catch {
			contentResults = [];
			contentTruncated = false;
		} finally {
			contentLoading = false;
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

	function doSearchForActiveTab() {
		selectedResultIndex = -1;
		focusedColumn = null;
		if (activeTab === 'all') {
			// Fire all searches in parallel for the 4-column layout
			doUnifiedSearch();
			doFilenameSearch();
			doContentSearch();
		} else if (activeTab === 'filenames') {
			doFilenameSearch();
		} else if (activeTab === 'content') {
			doContentSearch();
		} else {
			doUnifiedSearch();
		}
	}

	// --- URL Sync (route mode only) ---
	function updateUrl() {
		if (mode !== 'route') return;
		const params = new URLSearchParams();
		if (query) params.set('q', query);
		if (activeTab !== 'all') params.set('tab', activeTab);
		if (selectedProject) params.set('project', selectedProject);
		const search = params.toString();
		const newUrl = `/search${search ? '?' + search : ''}`;
		goto(newUrl, { replaceState: true, keepFocus: true });
	}

	// --- Event Handlers ---
	function handleInput() {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			if (mode === 'route') updateUrl();
			doSearchForActiveTab();
		}, 300);
	}

	function activeTabResultCount(): number {
		switch (activeTab) {
			case 'tasks': return taskResults.length;
			case 'memory': return memoryResults.length;
			case 'filenames': return filenameResults.length;
			case 'content': return contentResults.length;
			default: return 0;
		}
	}

	function openSelectedResult(): boolean {
		if (selectedResultIndex < 0) return false;
		if (activeTab === 'tasks' && selectedResultIndex < taskResults.length) {
			openTask(taskResults[selectedResultIndex].id);
			return true;
		}
		if (activeTab === 'memory' && selectedResultIndex < memoryResults.length) {
			navigateToMemory(memoryResults[selectedResultIndex].file);
			return true;
		}
		if (activeTab === 'filenames' && selectedResultIndex < filenameResults.length) {
			openFilename(filenameResults[selectedResultIndex]);
			return true;
		}
		if (activeTab === 'content' && selectedResultIndex < contentResults.length) {
			openContentResult(contentResults[selectedResultIndex]);
			return true;
		}
		return false;
	}

	// --- Tab cycling helpers ---
	function cycleTab(direction: number): SourceTab {
		const currentIndex = TABS.findIndex(t => t.id === activeTab);
		const nextIndex = (currentIndex + direction + TABS.length) % TABS.length;
		const newTab = TABS[nextIndex].id;
		focusedColumn = null;
		activeTab = newTab;
		selectedResultIndex = -1;
		if (mode === 'route') updateUrl();
		if (query.trim()) doSearchForActiveTab();
		if (newTab === 'all' && columnsContainerEl) {
			columnsContainerEl.scrollLeft = 0;
		}
		return newTab;
	}

	function focusTabButton(tabId: SourceTab) {
		tick().then(() => {
			const btn = document.querySelector(`[data-tab="${tabId}"]`) as HTMLElement;
			btn?.focus();
		});
	}

	// --- Keyboard: 3-zone navigation (Input ↔ Tab Bar ↔ Results) ---
	function handleKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		const isInput = target === searchInputEl;
		const isTabButton = !!target.getAttribute?.('data-tab');

		// When focused on tab bar, redirect typing to search input
		if (isTabButton && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
			searchInputEl?.focus();
			return;
		}

		if (e.key === 'Enter') {
			if (debounceTimer) clearTimeout(debounceTimer);

			// If a result is selected, open it
			if (openSelectedResult()) {
				e.preventDefault();
				return;
			}

			if (mode === 'route') updateUrl();
			doSearchForActiveTab();
		}

		if (e.key === 'Escape') {
			if (mode === 'modal') {
				onClose?.();
			} else if (isTabButton) {
				searchInputEl?.focus();
			} else {
				query = '';
				taskResults = [];
				memoryResults = [];
				fileResults = [];
				filenameResults = [];
				contentResults = [];
				meta = null;
				synthesis = null;
				updateUrl();
			}
		}

		// Arrow down/up: zone navigation (Input → Tab Bar → Results)
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			if (e.key === 'ArrowDown') {
				if (isInput) {
					if (activeTab !== 'all' && selectedResultIndex >= 0) {
						// Continue navigating results downward
						e.preventDefault();
						const maxIndex = activeTabResultCount();
						if (selectedResultIndex < maxIndex - 1) {
							selectedResultIndex += 1;
							scrollSelectedIntoView();
						} else {
							// Past last result: deselect and return to tab bar
							selectedResultIndex = -1;
							focusTabButton(activeTab);
						}
					} else {
						// From input (no result selected): move focus to tab bar
						e.preventDefault();
						focusTabButton(activeTab);
					}
				} else if (isTabButton) {
					// From tab bar: enter result navigation (non-all tabs only)
					e.preventDefault();
					if (activeTab !== 'all') {
						const maxIndex = activeTabResultCount();
						if (maxIndex > 0) {
							selectedResultIndex = 0;
							scrollSelectedIntoView();
							searchInputEl?.focus(); // keep input focused for continued key nav
						}
					}
				}
			} else { // ArrowUp
				if (isInput) {
					if (activeTab !== 'all' && selectedResultIndex > 0) {
						e.preventDefault();
						selectedResultIndex -= 1;
						scrollSelectedIntoView();
					} else if (activeTab !== 'all' && selectedResultIndex === 0) {
						// At first result: deselect and return to tab bar
						e.preventDefault();
						selectedResultIndex = -1;
						focusTabButton(activeTab);
					}
				} else if (isTabButton) {
					// From tab bar: return to input
					e.preventDefault();
					searchInputEl?.focus();
				}
			}
		}

		// Arrow left/right: tab cycling
		if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
			const direction = e.key === 'ArrowLeft' ? -1 : 1;

			if (isTabButton) {
				// Smooth tab cycling from tab bar — focus follows selection
				e.preventDefault();
				const newTab = cycleTab(direction);
				focusTabButton(newTab);
			} else if (isInput) {
				// Only cycle tabs when cursor is at input boundary
				const input = target as HTMLInputElement;
				const atStart = !input.value || (input.selectionStart === 0 && input.selectionEnd === 0);
				const atEnd = !input.value || (input.selectionStart === input.value.length && input.selectionEnd === input.value.length);
				if ((e.key === 'ArrowLeft' && atStart) || (e.key === 'ArrowRight' && atEnd)) {
					e.preventDefault();
					cycleTab(direction);
				}
			}
		}
	}

	function scrollSelectedIntoView() {
		requestAnimationFrame(() => {
			const el = resultsContainerEl?.querySelector('.result-selected');
			el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		});
	}

	// Track which column is "focused" in the All tab's cover-flow
	let focusedColumn = $state<SourceTab | null>(null);

	// Direct scrollLeft assignment — scrollTo() and rAF both silently fail from Svelte 5 reactivity
	function scrollToFocusedColumn(col: SourceTab) {
		const container = columnsContainerEl || document.querySelector('.us-columns-scroll') as HTMLElement | null;
		if (!container) return;
		const colEl = container.querySelector(`[data-column="${col}"]`) as HTMLElement | null;
		if (!colEl) return;
		const containerRect = container.getBoundingClientRect();
		const colRect = colEl.getBoundingClientRect();
		const target = Math.max(0, container.scrollLeft + (colRect.left - containerRect.left) - (containerRect.width / 2) + (colRect.width / 2));
		container.scrollLeft = target;
	}

	$effect(() => {
		const col = focusedColumn;
		if (!col) return;
		// Multiple retries to survive layout shifts from async rendering
		const timers = [
			setTimeout(() => scrollToFocusedColumn(col), 50),
			setTimeout(() => scrollToFocusedColumn(col), 200),
		];
		return () => timers.forEach(clearTimeout);
	});

	function switchTab(tab: SourceTab) {
		// Cover-flow behavior: clicking a tab while on "All" scrolls to that column
		if (activeTab === 'all' && tab !== 'all') {
			if (focusedColumn === tab) {
				// Double-click: switch to the dedicated tab view
				focusedColumn = null;
				activeTab = tab;
				selectedResultIndex = -1;
				if (mode === 'route') updateUrl();
				if (query.trim()) doSearchForActiveTab();
			} else {
				// First click: scroll to column, stay on All
				focusedColumn = tab;
			}
			return;
		}

		// Normal tab switching
		focusedColumn = null;
		activeTab = tab;
		selectedResultIndex = -1;
		if (mode === 'route') updateUrl();
		if (query.trim()) doSearchForActiveTab();

		if (tab === 'all' && columnsContainerEl) {
			columnsContainerEl.scrollLeft = 0;
		}
	}

	function handleProjectSelect(project: string) {
		selectedProject = project;
		onProjectChange?.(project);
		if (mode === 'route') updateUrl();
		if (query.trim()) doSearchForActiveTab();
	}

	// --- Navigation ---
	function closeModal() {
		if (mode === 'modal') {
			isOpen = false;
			onClose?.();
		}
	}

	function openTask(taskId: string) {
		selectedTaskId = taskId;
		drawerOpen = true;
		closeModal();
	}

	function navigateToMemory(file: string) {
		window.open(`/memory?file=${encodeURIComponent(file)}`, '_blank');
	}

	function navigateToFile(path: string, line?: number) {
		if (onFileSelect && selectedProject) {
			onFileSelect(path, line || 1, selectedProject);
			closeModal();
			return;
		}
		const params = new URLSearchParams({ path });
		if (line) params.set('line', String(line));
		if (selectedProject) params.set('project', selectedProject);
		window.open(`/files?${params}`, '_blank');
	}

	function openFilename(file: FilenameResult) {
		navigateToFile(file.path, 1);
	}

	function openContentResult(result: ContentResult) {
		navigateToFile(result.file, result.line);
	}

	// --- Utility Functions ---
	function highlightMatch(text: string, q: string): string {
		if (!q || !text) return escapeHtml(text || '');
		const escaped = escapeHtml(text);
		const pattern = q.split(/\s+/).filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
		if (!pattern) return escaped;
		return escaped.replace(new RegExp(`(${pattern})`, 'gi'), '<mark class="search-highlight">$1</mark>');
	}

	function escapeHtml(str: string): string {
		return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	function truncate(str: string, len: number): string {
		if (!str) return '';
		return str.length > len ? str.slice(0, len) + '...' : str;
	}

	function getFileIcon(filename: string): string {
		const ext = filename.split('.').pop()?.toLowerCase() || '';
		const name = filename.split('/').pop()?.toLowerCase() || '';
		if (name === 'package.json') return '📦';
		if (name === 'tsconfig.json') return '⚙️';
		if (name.includes('readme')) return '📖';
		const iconMap: Record<string, string> = {
			ts: '🔷', tsx: '⚛️', js: '🟨', jsx: '⚛️', svelte: '🔶',
			html: '🌐', css: '🎨', scss: '🎨', json: '📋', yaml: '📋', yml: '📋',
			md: '📝', py: '🐍', go: '🐹', rs: '🦀', sh: '🐚', sql: '🗃️'
		};
		return iconMap[ext] || '📄';
	}

	const GLOB_PRESETS = [
		{ label: 'All', glob: '' },
		{ label: 'TS', glob: '*.{ts,tsx}' },
		{ label: 'JS', glob: '*.{js,jsx,mjs}' },
		{ label: 'Svelte', glob: '*.svelte' },
		{ label: 'CSS', glob: '*.{css,scss}' },
		{ label: 'JSON', glob: '*.json' },
		{ label: 'MD', glob: '*.md' }
	];

	// --- Lifecycle ---
	onMount(() => {
		if (mode === 'route') {
			const params = new URL(window.location.href).searchParams;
			const tabParam = params.get('tab') as SourceTab | null;
			const projectParam = params.get('project');
			const qParam = params.get('q');

			if (tabParam && TABS.some(t => t.id === tabParam)) {
				activeTab = tabParam;
			}
			if (projectParam) selectedProject = projectParam;
			if (qParam) {
				query = qParam;
				tick().then(() => doSearchForActiveTab());
			}
			tick().then(() => searchInputEl?.focus());
		}

		return () => {
			if (debounceTimer) clearTimeout(debounceTimer);
		};
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->

{#if mode === 'route'}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="flex flex-col h-full overflow-hidden" style="background: oklch(0.16 0.01 250);" onkeydown={handleKeydown}>
		{@render searchUI(false)}
	</div>
{:else if isOpen}
	<div class="us-overlay" onkeydown={handleKeydown} onclick={onClose}>
		<div class="us-modal" onclick={(e) => e.stopPropagation()}>
			{@render searchUI(true)}
		</div>
	</div>
{/if}

{#snippet searchUI(isModal: boolean)}
	<!-- Header: Search bar + tabs -->
	<div class="flex-none" style="background: {isModal ? 'oklch(0.16 0.02 250)' : 'oklch(0.18 0.01 250)'}; border-bottom: 1px solid oklch(0.25 0.02 250); {isModal ? 'border-radius: 0.75rem 0.75rem 0 0;' : 'padding: 0 1.5rem;'}">
		<!-- AI Synthesis (above search bar) -->
		{#if activeTab === 'all'}
			<div class="{isModal ? 'px-4 pt-3' : 'pt-3 max-w-4xl mx-auto'}" style="{synthesisOpen ? '' : 'display:none;'}">
				{@render synthesisPanel()}
			</div>
		{/if}

		<!-- Search input -->
		<div class="{isModal ? 'px-4 pt-3' : 'pt-5 max-w-4xl mx-auto'}" style="{activeTab === 'all' && synthesisOpen ? 'padding-top: 0.5rem;' : ''}">
			<div class="relative">
				<div class="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style="color: oklch(0.50 0.02 250);">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
					</svg>
				</div>
				<input
					bind:this={searchInputEl}
					bind:value={query}
					oninput={handleInput}
					type="text"
					placeholder="Search tasks, memory, and files...{isModal ? '' : ' (Ctrl+K)'}"
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
						tabindex={-1}
						onclick={() => { query = ''; taskResults = []; memoryResults = []; fileResults = []; filenameResults = []; contentResults = []; meta = null; synthesis = null; if (mode === 'route') updateUrl(); searchInputEl?.focus(); }}
						class="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors hover:bg-base-300/30"
						style="color: oklch(0.50 0.02 250);"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				{/if}
				{#if isModal}
					<kbd class="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] font-mono" style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.50 0.02 250); {query ? 'display:none;' : ''}">ESC</kbd>
				{/if}
			</div>
		</div>

		<!-- Tabs + project filter row -->
		<div class="flex items-center justify-between {isModal ? 'px-4' : 'max-w-4xl mx-auto'} mt-2 pb-2">
			<!-- Source tabs -->
			<div class="flex gap-0.5">
				{#each TABS as tab}
					{@const isActive = activeTab === tab.id}
					{@const isFocused = activeTab === 'all' && focusedColumn === tab.id}
					<button
						data-tab={tab.id}
						onclick={() => switchTab(tab.id)}
						class="px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150 flex items-center gap-1"
						style="
							background: {isActive ? 'oklch(0.30 0.04 200)' : isFocused ? 'oklch(0.24 0.03 200)' : 'transparent'};
							color: {isActive ? 'oklch(0.90 0.10 200)' : isFocused ? 'oklch(0.78 0.08 200)' : 'oklch(0.55 0.02 250)'};
							border: 1px solid {isActive ? 'oklch(0.40 0.08 200)' : isFocused ? 'oklch(0.35 0.06 200)' : 'transparent'};
						"
						title={activeTab === 'all' && tab.id !== 'all' ? (focusedColumn === tab.id ? 'Click again to view all' : 'Scroll to column') : ''}
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3 flex-none">
							<path stroke-linecap="round" stroke-linejoin="round" d={tab.icon} />
						</svg>
						{tab.label}
						{#if hasSearched && tabCount(tab.id) > 0}
							<span
								class="px-1 py-0.5 rounded-full text-[9px] font-bold leading-none"
								style="background: oklch(0.30 0.05 200); color: oklch(0.80 0.10 200);"
							>{tabCount(tab.id)}</span>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Project filter -->
			{#if projects.length > 1}
				<ProjectSelector
					{projects}
					{selectedProject}
					onProjectChange={handleProjectSelect}
					compact
					showColors
				/>
			{/if}
		</div>

		<!-- Content tab options (regex, case, glob) -->
		{#if activeTab === 'content'}
			<div class="flex items-center gap-2 {isModal ? 'px-4' : 'max-w-4xl mx-auto'} pb-2 flex-wrap">
				<label class="flex items-center gap-1 px-2 py-1 rounded text-[11px] cursor-pointer transition-colors" style="background: {useRegex ? 'oklch(0.55 0.12 220 / 0.3)' : 'oklch(0.22 0.02 250)'}; border: 1px solid {useRegex ? 'oklch(0.55 0.12 220 / 0.5)' : 'transparent'}; color: {useRegex ? 'oklch(0.85 0.12 220)' : 'oklch(0.65 0.02 250)'};">
					<input type="checkbox" bind:checked={useRegex} class="hidden" />
					<span class="font-mono font-semibold">.*</span> Regex
				</label>
				<label class="flex items-center gap-1 px-2 py-1 rounded text-[11px] cursor-pointer transition-colors" style="background: {caseSensitive ? 'oklch(0.55 0.12 220 / 0.3)' : 'oklch(0.22 0.02 250)'}; border: 1px solid {caseSensitive ? 'oklch(0.55 0.12 220 / 0.5)' : 'transparent'}; color: {caseSensitive ? 'oklch(0.85 0.12 220)' : 'oklch(0.65 0.02 250)'};">
					<input type="checkbox" bind:checked={caseSensitive} class="hidden" />
					<span class="font-mono font-semibold">Aa</span> Case
				</label>
				<div class="flex items-center gap-1">
					{#each GLOB_PRESETS as preset}
						<button
							class="px-1.5 py-0.5 rounded text-[10px] transition-colors"
							style="background: {globFilter === preset.glob ? 'oklch(0.50 0.15 145 / 0.2)' : 'oklch(0.22 0.02 250)'}; border: 1px solid {globFilter === preset.glob ? 'oklch(0.50 0.15 145 / 0.4)' : 'transparent'}; color: {globFilter === preset.glob ? 'oklch(0.80 0.12 145)' : 'oklch(0.60 0.02 250)'};"
							onclick={() => { globFilter = preset.glob; if (query.trim()) doContentSearch(); }}
						>{preset.label}</button>
					{/each}
					<input
						type="text"
						class="w-16 px-1.5 py-0.5 rounded text-[10px] font-mono outline-none"
						style="background: oklch(0.20 0.02 250); border: 1px solid oklch(0.28 0.02 250); color: oklch(0.80 0.02 250);"
						placeholder="*.ext"
						bind:value={globFilter}
						onchange={() => { if (query.trim()) doContentSearch(); }}
					/>
				</div>
			</div>
		{/if}
	</div>

	<!-- Results area -->
	<div bind:this={resultsContainerEl} class="{isModal ? 'us-results-modal' : 'flex-1 overflow-y-auto px-4 py-4'}">
		{#if loading || filenameLoading || contentLoading}
			{@render loadingSkeleton()}
		{:else if error}
			<div class="max-w-2xl mx-auto rounded-lg p-4" style="background: oklch(0.22 0.08 25 / 0.15); border: 1px solid oklch(0.50 0.15 25 / 0.3);">
				<p class="text-sm" style="color: oklch(0.70 0.15 25);">{error}</p>
			</div>
		{:else if hasSearched && !currentTabHasResults}
			<div class="text-center py-{isModal ? '8' : '12'}">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-10 h-10 mx-auto mb-2" style="color: oklch(0.40 0.02 250);">
					<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
				</svg>
				<p class="text-sm" style="color: oklch(0.55 0.02 250);">No {activeTab === 'all' ? '' : activeTab + ' '}results for "{query}"</p>
			</div>
		{:else if !hasSearched}
			{@render emptyState(isModal)}
		{:else}
			<!-- Meta info -->
			{#if meta && (activeTab === 'all' || activeTab === 'tasks' || activeTab === 'memory')}
				<div class="flex items-center justify-between mb-2 {isModal ? 'px-3' : ''}">
					<p class="text-[11px]" style="color: oklch(0.50 0.02 250);">
						{meta.totalResults} result{meta.totalResults !== 1 ? 's' : ''} in {meta.queryTime}ms
					</p>
				</div>
			{/if}

			<!-- Tab-specific content -->
			{#if activeTab === 'all'}
				{@render trinityLayout()}
			{:else if activeTab === 'tasks'}
				{@render tasksList(isModal)}
			{:else if activeTab === 'memory'}
				{@render memoryList(isModal)}
			{:else if activeTab === 'filenames'}
				{@render filenamesList(isModal)}
			{:else if activeTab === 'content'}
				{@render contentList(isModal)}
			{/if}
		{/if}
	</div>

	<!-- Footer (modal only) -->
	{#if isModal}
		<div class="flex items-center justify-between px-3 py-2" style="border-top: 1px solid oklch(0.25 0.02 250); background: oklch(0.14 0.01 250); border-radius: 0 0 0.75rem 0.75rem;">
			<span class="text-[11px]" style="color: oklch(0.45 0.02 250);">
				{#if !query.trim()}Use arrows to switch tabs{:else if activeTab !== 'all'}<kbd class="px-1 py-0.5 rounded text-[9px] font-mono" style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.30 0.02 250);">↑↓</kbd> navigate <kbd class="px-1 py-0.5 rounded text-[9px] font-mono" style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.30 0.02 250);">↵</kbd> open <kbd class="px-1 py-0.5 rounded text-[9px] font-mono" style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.30 0.02 250);">←→</kbd> tabs{/if}
			</span>
			<span class="text-[11px]" style="color: oklch(0.45 0.02 250);">
				<kbd class="px-1 py-0.5 rounded text-[9px] font-mono" style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.30 0.02 250);">esc</kbd> close
			</span>
		</div>
	{/if}
{/snippet}

<!-- === SNIPPETS: Result Renderers === -->

{#snippet loadingSkeleton()}
	<div class="us-columns-scroll">
		{#each ['Tasks', 'Memory', 'Filenames', 'Content'] as label}
			<div class="us-column">
				<div class="flex items-center gap-1.5 px-1 pb-2">
					<div class="skeleton w-1.5 h-1.5 rounded-full" style="background: oklch(0.30 0.02 250);"></div>
					<div class="skeleton h-2.5 w-12 rounded" style="background: oklch(0.25 0.02 250);"></div>
				</div>
				{#each [1, 2] as __}
					<div class="rounded-md p-2.5 mb-1" style="background: oklch(0.20 0.01 250); border: 1px solid oklch(0.25 0.02 250);">
						<div class="skeleton h-2.5 w-full rounded mb-1.5" style="background: oklch(0.25 0.02 250);"></div>
						<div class="skeleton h-2.5 w-2/3 rounded" style="background: oklch(0.22 0.02 250);"></div>
					</div>
				{/each}
			</div>
		{/each}
	</div>
{/snippet}

{#snippet emptyState(isModal: boolean)}
	<div class="text-center py-{isModal ? '10' : '16'}">
		<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" class="w-14 h-14 mx-auto mb-3" style="color: oklch(0.30 0.02 250);">
			<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
		</svg>
		<p class="text-sm" style="color: oklch(0.45 0.02 250);">Search across tasks, memory, and files</p>
		<p class="text-xs mt-2" style="color: oklch(0.35 0.02 250);">
			{#if !isModal}
				<kbd class="px-1.5 py-0.5 rounded text-[10px] font-mono" style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.30 0.02 250);">Ctrl+K</kbd>
				to open search from anywhere
			{:else}
				Type to search &middot; <kbd class="px-1 py-0.5 rounded text-[10px] font-mono" style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.30 0.02 250);">←→</kbd> to switch tabs
			{/if}
		</p>
	</div>
{/snippet}

{#snippet synthesisPanel()}
	{#if synthesisOpen}
		<div class="rounded-lg overflow-hidden" style="background: oklch(0.20 0.03 280 / 0.3); border: 1px solid oklch(0.35 0.06 280 / 0.4);">
			<button
				onclick={() => synthesisOpen = false}
				class="w-full flex items-center justify-between px-4 py-2 text-xs font-medium"
				style="color: oklch(0.80 0.10 280);"
			>
				<span class="flex items-center gap-2">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
					</svg>
					AI Synthesis
				</span>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
			<div class="px-4 pb-3">
				{#if synthesisLoading}
					<div class="flex items-center gap-2 py-2">
						<span class="loading loading-dots loading-sm" style="color: oklch(0.70 0.10 280);"></span>
						<span class="text-xs" style="color: oklch(0.60 0.06 280);">Synthesizing...</span>
					</div>
				{:else if synthesisError}
					<p class="text-xs py-1" style="color: oklch(0.70 0.15 25);">{synthesisError}</p>
				{:else if synthesis}
					<div class="space-y-2">
						<p class="text-sm leading-relaxed" style="color: oklch(0.85 0.04 280);">{synthesis.summary}</p>
						{#if synthesis.recommendedAction}
							<div class="rounded-md px-3 py-2" style="background: oklch(0.22 0.04 280 / 0.4); border: 1px solid oklch(0.35 0.06 280 / 0.3);">
								<p class="text-[11px] font-medium mb-0.5" style="color: oklch(0.70 0.10 280);">Recommended</p>
								<p class="text-xs" style="color: oklch(0.80 0.04 250);">{synthesis.recommendedAction}</p>
							</div>
						{/if}
						{#if synthesis.keyFiles.length > 0}
							<div class="flex flex-wrap gap-1">
								{#each synthesis.keyFiles as file}
									<button
										onclick={() => navigateToFile(file)}
										class="text-[10px] font-mono px-1.5 py-0.5 rounded"
										style="background: oklch(0.22 0.02 250); color: oklch(0.70 0.10 200); border: 1px solid oklch(0.30 0.04 200 / 0.3);"
									>{file}</button>
								{/each}
							</div>
						{/if}
						{#if synthesis.relatedTasks.length > 0}
							<div class="flex flex-wrap gap-1">
								{#each synthesis.relatedTasks as taskId}
									<button onclick={() => openTask(taskId)}>
										<TaskIdBadge task={{ id: taskId, status: 'open' }} size="xs" minimal />
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}
{/snippet}

{#snippet trinityLayout()}
	<div bind:this={columnsContainerEl} class="us-columns-scroll">
		<!-- TASKS Column -->
		<div class="us-column" data-column="tasks">
			<h3 class="us-column-header">
				<span class="us-column-dot" style="background: oklch(0.65 0.15 220);"></span>
				Tasks <span class="text-[10px] font-normal" style="color: oklch(0.45 0.02 250);">({taskCount})</span>
			</h3>
			{#if taskResults.length > 0}
				<div class="space-y-1">
					{#each taskResults as task}
						{@render taskCard(task)}
					{/each}
				</div>
			{:else if !loading}
				<p class="text-[11px] px-1" style="color: oklch(0.40 0.02 250);">No matches</p>
			{/if}
		</div>

		<!-- MEMORY Column -->
		<div class="us-column" data-column="memory">
			<h3 class="us-column-header">
				<span class="us-column-dot" style="background: oklch(0.65 0.15 145);"></span>
				Memory <span class="text-[10px] font-normal" style="color: oklch(0.45 0.02 250);">({memoryCount})</span>
			</h3>
			{#if memoryResults.length > 0}
				<div class="space-y-1">
					{#each memoryResults as mem}
						{@render memoryCard(mem)}
					{/each}
				</div>
			{:else if !loading}
				<p class="text-[11px] px-1" style="color: oklch(0.40 0.02 250);">No matches</p>
			{/if}
		</div>

		<!-- FILENAMES Column -->
		<div class="us-column" data-column="filenames">
			<h3 class="us-column-header">
				<span class="us-column-dot" style="background: oklch(0.65 0.15 85);"></span>
				Filenames <span class="text-[10px] font-normal" style="color: oklch(0.45 0.02 250);">({filenameCount})</span>
			</h3>
			{#if filenameLoading}
				<div class="space-y-1.5">
					{#each [1, 2, 3] as _}
						<div class="skeleton h-6 w-full rounded" style="background: oklch(0.25 0.02 250);"></div>
					{/each}
				</div>
			{:else if filenameResults.length > 0}
				<div class="space-y-0.5">
					{#each filenameResults.slice(0, 15) as file}
						{@render filenameCard(file)}
					{/each}
					{#if filenameResults.length > 15}
						<button onclick={() => switchTab('filenames')} class="text-[10px] px-1 mt-1 transition-colors" style="color: oklch(0.60 0.12 220);">
							+{filenameResults.length - 15} more...
						</button>
					{/if}
				</div>
			{:else}
				<p class="text-[11px] px-1" style="color: oklch(0.40 0.02 250);">No matches</p>
			{/if}
		</div>

		<!-- CONTENT Column -->
		<div class="us-column" data-column="content">
			<h3 class="us-column-header">
				<span class="us-column-dot" style="background: oklch(0.65 0.15 310);"></span>
				Content <span class="text-[10px] font-normal" style="color: oklch(0.45 0.02 250);">({contentCount})</span>
			</h3>
			{#if contentLoading}
				<div class="space-y-1.5">
					{#each [1, 2, 3] as _}
						<div class="skeleton h-10 w-full rounded" style="background: oklch(0.25 0.02 250);"></div>
					{/each}
				</div>
			{:else if contentResults.length > 0}
				<div class="space-y-1">
					{#each contentResults.slice(0, 10) as result}
						{@render contentCard(result)}
					{/each}
					{#if contentResults.length > 10}
						<button onclick={() => switchTab('content')} class="text-[10px] px-1 mt-1 transition-colors" style="color: oklch(0.60 0.12 220);">
							+{contentResults.length - 10} more...
						</button>
					{/if}
				</div>
			{:else}
				<p class="text-[11px] px-1" style="color: oklch(0.40 0.02 250);">No matches</p>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet taskCard(task: TaskResult)}
	<button
		onclick={() => openTask(task.id)}
		class="us-result-card group"
	>
		<div class="flex items-center gap-1.5 min-w-0">
			<div class="flex-none"><TaskIdBadge {task} size="xs" /></div>
			<p class="text-xs font-medium truncate min-w-0" style="color: oklch(0.88 0.02 250);">{task.title}</p>
		</div>
		{#if task.snippet || task.description}
			<p class="text-[11px] mt-0.5 line-clamp-2" style="color: oklch(0.50 0.02 250);">
				{@html highlightMatch(truncate(task.snippet || task.description || '', 150), query)}
			</p>
		{/if}
	</button>
{/snippet}

{#snippet memoryCard(mem: MemoryResult)}
	<button
		onclick={() => navigateToMemory(mem.file)}
		class="us-result-card"
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
			<p class="text-[11px] mt-0.5 line-clamp-2" style="color: oklch(0.50 0.02 250);">
				{@html highlightMatch(truncate(mem.snippet, 150), query)}
			</p>
		{/if}
	</button>
{/snippet}

{#snippet fileCard(file: FileResult)}
	<button
		onclick={() => navigateToFile(file.path, file.line)}
		class="us-result-card"
	>
		<p class="text-[11px] font-mono truncate" style="color: oklch(0.70 0.10 85);">
			{file.path.split('/').pop()}{file.line ? `:${file.line}` : ''}
		</p>
		<p class="text-[10px] font-mono truncate" style="color: oklch(0.40 0.02 250);">{file.path}</p>
		{#if file.snippet}
			<pre class="text-[11px] mt-0.5 overflow-hidden whitespace-pre-wrap break-all line-clamp-2 font-mono" style="color: oklch(0.50 0.02 250);">{@html highlightMatch(truncate(file.snippet, 200), query)}</pre>
		{/if}
	</button>
{/snippet}

{#snippet filenameCard(file: FilenameResult)}
	<button
		onclick={() => openFilename(file)}
		class="us-compact-file-card"
	>
		<span class="flex-none text-xs">{getFileIcon(file.name)}</span>
		<span class="text-[11px] font-mono font-medium truncate" style="color: oklch(0.80 0.12 220);">{@html highlightMatch(file.name, query)}</span>
		{#if file.folder}
			<span class="text-[10px] font-mono truncate ml-auto" style="color: oklch(0.40 0.02 250); direction: rtl; text-align: left;">{file.folder}</span>
		{/if}
	</button>
{/snippet}

{#snippet contentCard(result: ContentResult)}
	<button
		onclick={() => openContentResult(result)}
		class="us-result-card"
	>
		<div class="flex items-center gap-1 min-w-0">
			<span class="flex-none text-xs">{getFileIcon(result.file)}</span>
			<span class="text-[11px] font-mono truncate" style="color: oklch(0.75 0.12 220);">{result.file.split('/').pop()}</span>
			<span class="text-[10px] font-mono flex-none" style="color: oklch(0.45 0.02 250);">:{result.line}</span>
		</div>
		<pre class="text-[11px] mt-0.5 overflow-hidden whitespace-pre-wrap break-all line-clamp-2 font-mono" style="color: oklch(0.55 0.02 250);">{@html highlightMatch(truncate(result.content, 150), useRegex ? '' : query)}</pre>
	</button>
{/snippet}

{#snippet tasksList(isModal: boolean)}
	<div class="{isModal ? 'px-2' : 'max-w-3xl mx-auto'} space-y-1">
		{#each taskResults as task, index}
			<button
				onclick={() => openTask(task.id)}
				onmouseenter={() => { selectedResultIndex = index; }}
				class="us-result-card w-full"
				class:result-selected={index === selectedResultIndex}
			>
				<div class="flex items-center gap-2 min-w-0">
					<div class="flex-none"><TaskIdBadge {task} size="xs" /></div>
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
{/snippet}

{#snippet memoryList(isModal: boolean)}
	<div class="{isModal ? 'px-2' : 'max-w-3xl mx-auto'} space-y-1">
		{#each memoryResults as mem, index}
			<button
				onclick={() => navigateToMemory(mem.file)}
				onmouseenter={() => { selectedResultIndex = index; }}
				class="us-result-card w-full"
				class:result-selected={index === selectedResultIndex}
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
{/snippet}

{#snippet filenamesList(isModal: boolean)}
	<div class="{isModal ? 'px-1' : 'max-w-3xl mx-auto'}">
		{#each filenameResults as file, index}
			<button
				class="us-filename-result"
				class:result-selected={index === selectedResultIndex}
				onclick={() => openFilename(file)}
				onmouseenter={() => { selectedResultIndex = index; }}
			>
				<span class="flex-none text-sm">{getFileIcon(file.name)}</span>
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-1">
						{#if file.folder}
							<span class="text-[11px] font-mono truncate" style="color: oklch(0.50 0.02 250); direction: rtl; text-align: left;">{file.folder}/</span>
						{/if}
						<span class="text-[12px] font-mono font-medium flex-none" style="color: oklch(0.80 0.12 220);">{@html highlightMatch(file.name, query)}</span>
					</div>
				</div>
			</button>
		{/each}
		{#if filenameResults.length === 0 && hasSearched}
			<div class="text-center py-6">
				<p class="text-sm" style="color: oklch(0.50 0.02 250);">No filename matches for "{query}"</p>
			</div>
		{/if}
	</div>
{/snippet}

{#snippet contentList(isModal: boolean)}
	<div class="{isModal ? 'px-1' : 'max-w-3xl mx-auto'}">
		{#each contentResults as result, index}
			<button
				class="us-content-result"
				class:result-selected={index === selectedResultIndex}
				onclick={() => openContentResult(result)}
				onmouseenter={() => { selectedResultIndex = index; }}
			>
				<div class="flex items-center gap-1.5 min-w-0">
					<span class="flex-none text-sm">{getFileIcon(result.file)}</span>
					{#if result.file.includes('/')}
						<span class="text-[11px] font-mono truncate" style="color: oklch(0.50 0.02 250);">{result.file.slice(0, result.file.lastIndexOf('/') + 1)}</span>
						<span class="text-[11px] font-mono font-medium flex-none" style="color: oklch(0.75 0.12 220);">{result.file.slice(result.file.lastIndexOf('/') + 1)}</span>
					{:else}
						<span class="text-[11px] font-mono font-medium flex-none" style="color: oklch(0.75 0.12 220);">{result.file}</span>
					{/if}
					<span class="text-[10px] font-mono flex-none" style="color: oklch(0.50 0.02 250);">:{result.line}</span>
				</div>
				<div class="us-content-context">
					{#if result.before}
						{#each result.before as line}
							<div class="text-[11px] truncate" style="color: oklch(0.45 0.02 250);">{line}</div>
						{/each}
					{/if}
					<div class="text-[11px] truncate" style="color: oklch(0.85 0.02 250);">
						{@html highlightMatch(result.content, useRegex ? '' : query)}
					</div>
					{#if result.after}
						{#each result.after as line}
							<div class="text-[11px] truncate" style="color: oklch(0.45 0.02 250);">{line}</div>
						{/each}
					{/if}
				</div>
			</button>
		{/each}
		{#if contentTruncated}
			<p class="text-center text-[11px] py-2" style="color: oklch(0.65 0.10 85);">Results truncated — refine your search</p>
		{/if}
		{#if contentResults.length === 0 && hasSearched}
			<div class="text-center py-6">
				<p class="text-sm" style="color: oklch(0.50 0.02 250);">No content matches for "{query}"</p>
			</div>
		{/if}
	</div>
{/snippet}

<!-- Task Detail Drawer -->
<TaskDetailDrawer bind:taskId={selectedTaskId} bind:isOpen={drawerOpen} />

<style>
	/* Modal overlay */
	.us-overlay {
		position: fixed;
		inset: 0;
		background: oklch(0.08 0.01 250 / 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		animation: fadeIn 0.1s ease;
	}

	.us-modal {
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.75rem;
		width: 95%;
		max-width: 1100px;
		height: 85vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 25px 60px oklch(0.05 0 0 / 0.6);
		animation: slideDown 0.15s ease;
		overflow: hidden;
	}

	.us-results-modal {
		flex: 1;
		overflow-y: auto;
		min-height: 120px;
		padding: 0.5rem;
	}

	/* Shared result card style */
	.us-result-card {
		display: flex;
		flex-direction: column;
		text-align: left;
		width: 100%;
		padding: 0.5rem 0.625rem;
		border-radius: 0.375rem;
		background: oklch(0.20 0.01 250);
		border: 1px solid oklch(0.25 0.02 250);
		cursor: pointer;
		transition: all 0.12s ease;
	}

	.us-result-card:hover,
	.us-result-card.result-selected {
		border-color: oklch(0.35 0.06 200);
		background: oklch(0.22 0.02 250);
	}

	.us-result-card.result-selected {
		border-color: oklch(0.45 0.10 200);
		background: oklch(0.24 0.03 220);
	}

	/* Filename result item */
	.us-filename-result {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.375rem 0.625rem;
		border-radius: 0.375rem;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s ease;
		background: transparent;
		border: none;
	}

	.us-filename-result:hover,
	.us-filename-result.result-selected {
		background: oklch(0.55 0.12 220 / 0.1);
	}

	.us-filename-result.result-selected {
		background: oklch(0.55 0.12 220 / 0.15);
	}

	/* Content result item */
	.us-content-result {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		width: 100%;
		padding: 0.5rem 0.625rem;
		cursor: pointer;
		text-align: left;
		border-radius: 0.375rem;
		transition: background 0.1s ease;
		background: transparent;
		border: none;
		margin-bottom: 0.125rem;
	}

	.us-content-result:hover,
	.us-content-result.result-selected {
		background: oklch(0.55 0.12 220 / 0.1);
	}

	.us-content-result.result-selected {
		background: oklch(0.55 0.12 220 / 0.15);
	}

	.us-content-context {
		font-family: ui-monospace, monospace;
		background: oklch(0.12 0.01 250);
		border-radius: 0.25rem;
		padding: 0.375rem 0.5rem;
		margin-left: 1.5rem;
		overflow: hidden;
	}

	/* 4-column horizontal scroll (Cover Flow for "All" tab) */
	.us-columns-scroll {
		display: flex;
		gap: 0.75rem;
		overflow-x: auto;
		overflow-y: hidden;
		padding: 0.25rem 0.5rem 0.75rem;
		-webkit-overflow-scrolling: touch;
	}

	/* Spacer so the last column can be scrolled to center */
	.us-columns-scroll::after {
		content: '';
		flex: 0 0 50%;
	}

	/* Hide scrollbar but keep functionality */
	.us-columns-scroll::-webkit-scrollbar {
		height: 4px;
	}
	.us-columns-scroll::-webkit-scrollbar-track {
		background: transparent;
	}
	.us-columns-scroll::-webkit-scrollbar-thumb {
		background: oklch(0.30 0.02 250);
		border-radius: 2px;
	}
	.us-columns-scroll::-webkit-scrollbar-thumb:hover {
		background: oklch(0.40 0.02 250);
	}

	.us-column {
		flex: 0 0 calc(33% - 0.5rem);
		min-width: 220px;
		max-width: 320px;
	}

	.us-column-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.25rem 0.25rem 0.5rem;
		color: oklch(0.60 0.02 250);
	}

	.us-column-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	/* Compact file card for filename column */
	.us-compact-file-card {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		width: 100%;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s ease;
		background: transparent;
		border: none;
	}

	.us-compact-file-card:hover {
		background: oklch(0.55 0.12 85 / 0.1);
	}

	/* Search highlight mark */
	:global(.search-highlight) {
		background: oklch(0.65 0.15 85 / 0.4);
		color: oklch(0.95 0.05 85);
		border-radius: 2px;
		padding: 0 2px;
	}
</style>
