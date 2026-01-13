<script lang="ts">
	/**
	 * Git Page - Source Control View
	 *
	 * Layout (emulates VSCode source control):
	 * - Header: 'Source Control' title + project selector dropdown
	 * - Left panel: Git changes panel (staged/unstaged files)
	 * - Right panel: Side-by-side diff viewer for selected file
	 *
	 * State:
	 * - selectedProject: synced with URL param ?project=<name>
	 * - selectedFile: currently selected file for diff viewing
	 */

	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import GitPanel from '$lib/components/files/GitPanel.svelte';
	import DiffViewer from '$lib/components/files/DiffViewer.svelte';
	import ResizableDivider from '$lib/components/ResizableDivider.svelte';
	import { getActiveProject, setActiveProject } from '$lib/stores/preferences.svelte';
	import { FilesSkeleton } from '$lib/components/skeleton';

	// Types
	interface Project {
		name: string;
		displayName: string;
		path: string;
		port: number | null;
		description: string | null;
		activeColor: string | null;
	}

	// State
	let projects = $state<Project[]>([]);
	let selectedProject = $state<string | null>(null);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	// Selected file for diff view
	let selectedFilePath = $state<string | null>(null);
	let selectedFileIsStaged = $state(false);

	// Derived: selected project's color
	const selectedProjectColor = $derived(
		selectedProject
			? projects.find(p => p.name === selectedProject)?.activeColor || null
			: null
	);

	// Layout state
	let leftPanelWidth = $state(320);
	const MIN_PANEL_WIDTH = 200;
	const MAX_PANEL_WIDTH = 500;

	// Mobile layout state
	let isMobileLayout = $state(false);
	let topPanelHeight = $state(40);
	const MOBILE_BREAKPOINT = 768;
	const MIN_PANEL_HEIGHT_PERCENT = 15;
	const MAX_PANEL_HEIGHT_PERCENT = 70;

	// Divider drag state
	let isDragging = $state(false);
	let startX = $state(0);
	let startWidth = $state(0);

	// Container ref for mobile layout
	let containerRef: HTMLDivElement | null = $state(null);

	function handleDividerMouseDown(e: MouseEvent) {
		e.preventDefault();
		isDragging = true;
		startX = e.clientX;
		startWidth = leftPanelWidth;

		document.addEventListener('mousemove', handleDividerMouseMove);
		document.addEventListener('mouseup', handleDividerMouseUp);
	}

	function handleDividerMouseMove(e: MouseEvent) {
		if (!isDragging) return;
		const deltaX = e.clientX - startX;
		let newWidth = startWidth + deltaX;
		newWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, newWidth));
		leftPanelWidth = newWidth;
	}

	function handleDividerMouseUp() {
		isDragging = false;
		document.removeEventListener('mousemove', handleDividerMouseMove);
		document.removeEventListener('mouseup', handleDividerMouseUp);
	}

	function handleMobileResize(deltaY: number) {
		if (!containerRef) return;
		const containerHeight = containerRef.offsetHeight;
		const deltaPercent = (deltaY / containerHeight) * 100;
		let newHeight = topPanelHeight + deltaPercent;
		newHeight = Math.max(MIN_PANEL_HEIGHT_PERCENT, Math.min(MAX_PANEL_HEIGHT_PERCENT, newHeight));
		topPanelHeight = newHeight;
	}

	// Sync selectedProject from URL query parameter
	$effect(() => {
		const projectParam = $page.url.searchParams.get('project');
		if (projectParam && projects.length > 0) {
			const projectExists = projects.some(p => p.name === projectParam);
			if (projectExists && selectedProject !== projectParam) {
				selectedProject = projectParam;
			}
		}
	});

	// Handle project change
	function handleProjectChange(projectName: string) {
		selectedProject = projectName;
		setActiveProject(projectName);
		// Clear selected file when changing projects
		selectedFilePath = null;
		const url = new URL(window.location.href);
		url.searchParams.set('project', projectName);
		goto(url.pathname + url.search, { replaceState: true, noScroll: true });
	}

	// Fetch visible projects
	async function fetchProjects() {
		try {
			const response = await fetch('/api/projects?visible=true');
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to load projects');
			}

			projects = data.projects || [];

			// If no project selected but we have projects, choose default
			if (projects.length > 0 && !$page.url.searchParams.get('project')) {
				const activeProject = getActiveProject();
				const projectExists = activeProject && projects.some(p => p.name === activeProject);

				if (projectExists) {
					handleProjectChange(activeProject);
				} else {
					handleProjectChange(projects[0].name);
				}
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load projects';
			console.error('[Git] Failed to fetch projects:', err);
		} finally {
			isLoading = false;
		}
	}

	// Handle file click from GitPanel
	function handleFileClick(filePath: string, isStaged: boolean) {
		selectedFilePath = filePath;
		selectedFileIsStaged = isStaged;
	}

	// Handle stage file
	async function handleStageFile(path: string) {
		if (!selectedProject) return;

		try {
			const response = await fetch(`/api/files/git/stage?project=${encodeURIComponent(selectedProject)}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to stage file');
			}

			// Update the staged state if this is the selected file
			if (selectedFilePath === path) {
				selectedFileIsStaged = true;
			}
		} catch (err) {
			console.error('[Git] Failed to stage file:', err);
		}
	}

	// Handle unstage file
	async function handleUnstageFile(path: string) {
		if (!selectedProject) return;

		try {
			const response = await fetch(`/api/files/git/unstage?project=${encodeURIComponent(selectedProject)}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to unstage file');
			}

			// Update the staged state if this is the selected file
			if (selectedFilePath === path) {
				selectedFileIsStaged = false;
			}
		} catch (err) {
			console.error('[Git] Failed to unstage file:', err);
		}
	}

	// Clear selected file
	function handleClearSelection() {
		selectedFilePath = null;
	}

	// Get display name for selected project
	const selectedProjectDisplay = $derived(
		projects.find(p => p.name === selectedProject)?.displayName || selectedProject || 'Select Project'
	);

	onMount(() => {
		fetchProjects();

		function handleResize() {
			isMobileLayout = window.innerWidth < MOBILE_BREAKPOINT;
		}
		handleResize();
		window.addEventListener('resize', handleResize);

		return () => {
			window.removeEventListener('resize', handleResize);
		};
	});
</script>

<svelte:head>
	<title>Source Control | JAT IDE</title>
	<meta name="description" content="Git source control view with staged/unstaged changes and side-by-side diff viewer." />
	<meta property="og:title" content="Source Control | JAT IDE" />
	<meta property="og:description" content="Git source control view with staged/unstaged changes and side-by-side diff viewer." />
	<meta property="og:image" content="/favicons/source.svg" />
	<link rel="icon" href="/favicons/source.svg" />
</svelte:head>

<div class="git-page" style="background: oklch(0.14 0.01 250);">
	{#if isLoading}
		<FilesSkeleton treeItems={12} tabs={3} />
	{:else if error}
		<div class="git-content error-state" transition:fade={{ duration: 150 }}>
			<div class="error-icon">
				<svg class="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
				</svg>
			</div>
			<h2 class="error-title">Failed to load projects</h2>
			<p class="error-message">{error}</p>
			<button class="btn btn-primary btn-sm mt-4" onclick={() => { error = null; isLoading = true; fetchProjects(); }}>
				Retry
			</button>
		</div>
	{:else if projects.length === 0}
		<div class="git-content empty-state" transition:fade={{ duration: 150 }}>
			<div class="empty-icon">
				<svg class="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
				</svg>
			</div>
			<h2 class="empty-title">No Projects Available</h2>
			<p class="empty-hint">Add a project in the Config tab to get started</p>
		</div>
	{:else}
		<div class="git-content" transition:fade={{ duration: 150 }}>
			<div class="git-body" class:mobile-layout={isMobileLayout} bind:this={containerRef}>
				<!-- Left Panel: Git Changes -->
				<div
					class="git-panel-left"
					style="{isMobileLayout ? `height: ${topPanelHeight}%` : `width: ${leftPanelWidth}px`};"
				>
					<!-- Project Selector in Panel Header -->
					<div class="panel-header project-header">
						<div class="dropdown dropdown-bottom flex-1">
							<button class="project-selector-compact" tabindex="0">
								{#if selectedProjectColor}
									<span
										class="w-2 h-2 rounded-full flex-shrink-0"
										style="background: {selectedProjectColor};"
									></span>
								{/if}
								<span class="project-name-compact">{selectedProjectDisplay}</span>
								<svg class="dropdown-arrow-compact" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
								</svg>
							</button>
							<ul tabindex="-1" class="dropdown-content bg-base-200 rounded-box shadow-xl border border-base-300 max-h-64 overflow-y-auto z-50 p-1.5 w-full min-w-48">
								{#each projects as project (project.name)}
									<button
										class="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md hover:bg-base-300 transition-colors text-left text-sm"
										class:bg-base-300={selectedProject === project.name}
										onclick={() => { handleProjectChange(project.name); }}
									>
										<span
											class="w-2 h-2 rounded-full flex-shrink-0"
											style="background: {project.activeColor || 'oklch(0.60 0.15 145)'};"
										></span>
										<span class="font-medium text-base-content truncate">{project.displayName}</span>
									</button>
								{/each}
							</ul>
						</div>
					</div>

					<!-- Page Title -->
					<div class="panel-title-header">
						<svg class="panel-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
							<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
						</svg>
						<span>Source Control</span>
					</div>

					<div class="panel-content git-panel-content">
						{#if !selectedProject}
							<div class="panel-empty">
								<p>Select a project to view changes</p>
							</div>
						{:else}
							<GitPanel
								project={selectedProject}
								onFileClick={handleFileClick}
							/>
						{/if}
					</div>
				</div>

				<!-- Resizable Divider -->
				{#if isMobileLayout}
					<ResizableDivider onResize={handleMobileResize} />
				{:else}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="vertical-divider"
						class:dragging={isDragging}
						onmousedown={handleDividerMouseDown}
						role="separator"
						aria-orientation="vertical"
					>
						<div class="divider-grip">
							<div class="grip-line"></div>
							<div class="grip-line"></div>
						</div>
					</div>
				{/if}

				<!-- Right Panel: Diff Viewer -->
				<div class="git-panel-right">
					{#if selectedProject && selectedFilePath}
						<DiffViewer
							filePath={selectedFilePath}
							projectName={selectedProject}
							isStaged={selectedFileIsStaged}
							onStage={handleStageFile}
							onUnstage={handleUnstageFile}
							onClose={handleClearSelection}
						/>
					{:else}
						<div class="diff-placeholder">
							<div class="diff-placeholder-content">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="diff-placeholder-icon">
									<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
								</svg>
								<p class="diff-placeholder-text">
									{selectedProject ? 'Select a file to view diff' : 'Select a project to start'}
								</p>
								<p class="diff-placeholder-hint">
									Click on a modified file in the left panel to see changes
								</p>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.git-page {
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	.git-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding: 0.75rem;
		max-width: 100%;
		width: 100%;
		min-height: 0;
	}

	/* Project Selector (compact) */
	.project-header {
		padding: 0.375rem 0.5rem;
	}

	.project-selector-compact {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.25rem 0.5rem;
		background: transparent;
		border: none;
		border-radius: 0.375rem;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.project-selector-compact:hover {
		background: oklch(0.22 0.02 250);
	}

	.project-name-compact {
		font-size: 0.8125rem;
		font-weight: 600;
		color: oklch(0.80 0.02 250);
		font-family: ui-monospace, monospace;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
		text-align: left;
	}

	.dropdown-arrow-compact {
		width: 0.875rem;
		height: 0.875rem;
		color: oklch(0.45 0.02 250);
		flex-shrink: 0;
	}

	/* Body: Side-by-side layout */
	.git-body {
		display: flex;
		flex: 1;
		gap: 0;
		min-height: 0;
		border-radius: 0.75rem;
		overflow: hidden;
		border: 1px solid oklch(0.22 0.02 250);
		background: oklch(0.16 0.01 250);
	}

	/* Git Panel (Left) */
	.git-panel-left {
		display: flex;
		flex-direction: column;
		min-width: 200px;
		max-width: 500px;
		flex-shrink: 0;
		background: oklch(0.15 0.01 250);
		border-right: 1px solid oklch(0.22 0.02 250);
	}

	/* Diff Panel (Right) */
	.git-panel-right {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 300px;
		background: oklch(0.14 0.01 250);
	}

	/* Panel Header */
	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		background: oklch(0.17 0.01 250);
		border-bottom: 1px solid oklch(0.22 0.02 250);
		flex-shrink: 0;
	}

	/* Panel Title Header */
	.panel-title-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: oklch(0.16 0.01 250);
		border-bottom: 1px solid oklch(0.22 0.02 250);
		flex-shrink: 0;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: oklch(0.55 0.02 250);
	}

	.panel-title-icon {
		width: 1rem;
		height: 1rem;
	}

	/* Panel Content */
	.panel-content {
		flex: 1;
		overflow: auto;
		padding: 0.5rem;
	}

	.panel-content.git-panel-content {
		padding: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.panel-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		text-align: center;
		color: oklch(0.45 0.02 250);
		padding: 2rem;
	}

	/* Vertical Divider */
	.vertical-divider {
		width: 8px;
		min-width: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: col-resize;
		background: transparent;
		transition: background 0.15s ease;
		user-select: none;
	}

	.vertical-divider:hover {
		background: oklch(0.65 0.15 200 / 0.1);
	}

	.vertical-divider.dragging {
		background: oklch(0.65 0.15 200 / 0.2);
	}

	.divider-grip {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 4px 2px;
		opacity: 0.4;
		transition: opacity 0.15s ease;
	}

	.vertical-divider:hover .divider-grip,
	.vertical-divider.dragging .divider-grip {
		opacity: 1;
	}

	.grip-line {
		width: 2px;
		height: 24px;
		border-radius: 1px;
		background: oklch(0.60 0.02 250);
		transition: background 0.15s ease;
	}

	.vertical-divider:hover .grip-line {
		background: oklch(0.65 0.15 200);
	}

	.vertical-divider.dragging .grip-line {
		background: oklch(0.70 0.18 200);
	}

	/* Diff Placeholder */
	.diff-placeholder {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: oklch(0.14 0.01 250);
	}

	.diff-placeholder-content {
		text-align: center;
		padding: 2rem;
	}

	.diff-placeholder-icon {
		width: 4rem;
		height: 4rem;
		color: oklch(0.35 0.02 250);
		margin: 0 auto 1rem;
	}

	.diff-placeholder-text {
		font-size: 0.9375rem;
		color: oklch(0.55 0.02 250);
		margin-bottom: 0.5rem;
	}

	.diff-placeholder-hint {
		font-size: 0.8125rem;
		color: oklch(0.40 0.02 250);
	}

	/* Error State */
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}

	.error-icon {
		color: oklch(0.60 0.15 25);
		margin-bottom: 1rem;
	}

	.error-title {
		font-size: 1.1rem;
		font-weight: 600;
		color: oklch(0.70 0.12 25);
		margin: 0;
	}

	.error-message {
		font-size: 0.85rem;
		color: oklch(0.55 0.02 250);
		margin: 0.5rem 0 0;
	}

	/* Empty State */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}

	.empty-icon {
		color: oklch(0.35 0.02 250);
		margin-bottom: 1rem;
	}

	.empty-title {
		font-size: 1.1rem;
		font-weight: 600;
		color: oklch(0.55 0.02 250);
		margin: 0;
	}

	.empty-hint {
		font-size: 0.85rem;
		color: oklch(0.45 0.02 250);
		margin: 0.5rem 0 0;
	}

	/* Mobile Layout */
	.git-body.mobile-layout {
		flex-direction: column;
	}

	.git-body.mobile-layout .git-panel-left {
		width: 100% !important;
		max-width: none;
		min-width: 0;
		min-height: 100px;
		border-right: none;
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.git-body.mobile-layout .git-panel-right {
		min-width: 0;
		flex: 1;
		min-height: 0;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.git-content {
			padding: 0.5rem;
		}
	}
</style>
