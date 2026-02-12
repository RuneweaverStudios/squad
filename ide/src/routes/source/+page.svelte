<script lang="ts">
	/**
	 * Source Control Page - Git and Supabase Migrations
	 *
	 * Layout (emulates VSCode source control):
	 * - Header: Project selector + mode toggle (Git | Supabase)
	 * - Left panel: Git changes panel OR Supabase migrations panel
	 * - Right panel: Diff viewer OR Migration SQL viewer
	 *
	 * State:
	 * - selectedProject: synced with URL param ?project=<name>
	 * - activeMode: 'git' | 'supabase' - controls which panel to show
	 * - selectedFile: currently selected file for diff viewing (Git mode)
	 */

	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { fade } from 'svelte/transition';
	import GitPanel from '$lib/components/files/GitPanel.svelte';
	import DiffViewer from '$lib/components/files/DiffViewer.svelte';
	import SupabasePanel from '$lib/components/files/SupabasePanel.svelte';
	import MigrationViewer from '$lib/components/files/MigrationViewer.svelte';
	import ResizableDivider from '$lib/components/ResizableDivider.svelte';
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

	// Mode toggle: 'git' or 'supabase'
	type SourceMode = 'git' | 'supabase';
	let activeMode = $state<SourceMode>('git');

	// Git mode state: selected file for diff view
	let selectedFilePath = $state<string | null>(null);
	let selectedFileIsStaged = $state(false);

	// Supabase mode state: selected migration for viewing
	let selectedMigrationContent = $state<string>('');
	let selectedMigrationTitle = $state<string>('');
	let selectedMigrationFilename = $state<string>('');
	let isDiff = $state(false);

	// Supabase project detection
	let hasSupabase = $state(false);

	// Layout state
	let leftPanelWidth = $state(520);
	const MIN_PANEL_WIDTH = 200;
	const MAX_PANEL_WIDTH_FALLBACK = 900;

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
		const maxWidth = Math.max(MAX_PANEL_WIDTH_FALLBACK, window.innerWidth * 0.8);
		newWidth = Math.max(MIN_PANEL_WIDTH, Math.min(maxWidth, newWidth));
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
				// Clear selected file when changing projects
				selectedFilePath = null;
			}
		}
	});

	// Fetch visible projects
	async function fetchProjects() {
		try {
			// Include stats=true to get projects sorted by last activity (most recent first)
			const response = await fetch('/api/projects?visible=true&stats=true');
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to load projects');
			}

			projects = data.projects || [];
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
			const response = await fetch('/api/files/git/stage', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ project: selectedProject, paths: [path] })
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
			const response = await fetch('/api/files/git/unstage', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ project: selectedProject, paths: [path] })
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

	// Clear Supabase migration selection
	function handleClearMigration() {
		selectedMigrationContent = '';
		selectedMigrationTitle = '';
		selectedMigrationFilename = '';
		isDiff = false;
	}

	// Handle migration selection from SupabasePanel
	function handleMigrationSelect(content: string, title: string, filename: string, isSchDiff: boolean) {
		selectedMigrationContent = content;
		selectedMigrationTitle = title;
		selectedMigrationFilename = filename;
		isDiff = isSchDiff;
	}

	// Check if project has Supabase
	async function checkSupabase(projectName: string) {
		try {
			const response = await fetch(`/api/supabase/status?project=${encodeURIComponent(projectName)}`);
			if (response.ok) {
				const data = await response.json();
				hasSupabase = data.hasSupabase || false;
			} else {
				hasSupabase = false;
			}
		} catch {
			hasSupabase = false;
		}
	}

	// Switch mode
	function switchMode(mode: SourceMode) {
		activeMode = mode;
		// Clear selections when switching
		if (mode === 'git') {
			handleClearMigration();
		} else {
			handleClearSelection();
		}
	}

	// Effect: Check supabase when project changes
	$effect(() => {
		if (selectedProject) {
			checkSupabase(selectedProject);
			// Reset mode to git when project changes
			activeMode = 'git';
			handleClearSelection();
			handleClearMigration();
		}
	});

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
					<!-- Source Control Header: Project Selector + Title + Mode Toggle -->
					<div class="panel-title-header">
						<div class="title-left">
							{#if activeMode === 'git'}
								<!-- Git branch icon (Lucide-style) -->
								<svg class="panel-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<line x1="6" y1="3" x2="6" y2="15"></line>
									<circle cx="18" cy="6" r="3"></circle>
									<circle cx="6" cy="18" r="3"></circle>
									<path d="M18 9a9 9 0 0 1-9 9"></path>
								</svg>
							{:else}
								<!-- Supabase logo (lightning bolt) -->
								<svg class="panel-title-icon" viewBox="0 0 24 24" fill="currentColor">
									<path d="M13.5 3L6 14h6l-1.5 7L18 10h-6l1.5-7z"/>
								</svg>
							{/if}
							<span class="font-medium text-base-content/90">{selectedProject || 'No project selected'}</span>
						</div>
						{#if hasSupabase}
							<div class="mode-toggle">
								<button
									class="mode-btn"
									class:active={activeMode === 'git'}
									onclick={() => switchMode('git')}
									title="Git Source Control"
								>
									<!-- Git branch icon (Lucide-style) -->
									<svg class="mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<line x1="6" y1="3" x2="6" y2="15"></line>
										<circle cx="18" cy="6" r="3"></circle>
										<circle cx="6" cy="18" r="3"></circle>
										<path d="M18 9a9 9 0 0 1-9 9"></path>
									</svg>
									Git
								</button>
								<button
									class="mode-btn"
									class:active={activeMode === 'supabase'}
									onclick={() => switchMode('supabase')}
									title="Supabase Migrations"
								>
									<!-- Supabase logo (lightning bolt) -->
									<svg class="mode-icon" viewBox="0 0 24 24" fill="currentColor">
										<path d="M13.5 3L6 14h6l-1.5 7L18 10h-6l1.5-7z"/>
									</svg>
									Supabase
								</button>
							</div>
						{/if}
					</div>

					<div class="panel-content git-panel-content">
						{#if !selectedProject}
							<div class="panel-empty">
								<p>Select a project to view changes</p>
							</div>
						{:else if activeMode === 'git'}
							<GitPanel
								project={selectedProject}
								onFileClick={handleFileClick}
								{selectedFilePath}
							/>
						{:else}
							<SupabasePanel
								project={selectedProject}
								onMigrationSelect={handleMigrationSelect}
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

				<!-- Right Panel: Diff Viewer (Git) or Migration Viewer (Supabase) -->
				<div class="git-panel-right">
					{#if activeMode === 'git'}
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
					{:else}
						{#if selectedMigrationFilename}
							<MigrationViewer
								content={selectedMigrationContent}
								title={selectedMigrationTitle}
								isDiff={isDiff}
								filename={selectedMigrationFilename}
								project={selectedProject ?? undefined}
								onClose={handleClearMigration}
								onSave={(newContent) => { selectedMigrationContent = newContent; }}
							/>
						{:else}
							<div class="diff-placeholder">
								<div class="diff-placeholder-content">
									<!-- Supabase logo (lightning bolt) -->
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="diff-placeholder-icon">
										<path d="M13.5 3L6 14h6l-1.5 7L18 10h-6l1.5-7z"/>
									</svg>
									<p class="diff-placeholder-text">
										{selectedProject ? 'Select a migration to view SQL' : 'Select a project to start'}
									</p>
									<p class="diff-placeholder-hint">
										Click on a migration or check schema diff in the left panel
									</p>
								</div>
							</div>
						{/if}
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
		max-width: 80vw;
		flex-shrink: 0;
		background: oklch(0.15 0.01 250);
		border-right: 1px solid oklch(0.22 0.02 250);
		container-type: inline-size;
		container-name: git-panel;
	}

	/* Diff Panel (Right) */
	.git-panel-right {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 300px;
		background: oklch(0.14 0.01 250);
	}

	/* Panel Title Header */
	.panel-title-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
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

	.title-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		flex: 1;
	}

	.project-selector-wrapper {
		flex: 1;
		min-width: 0;
	}

.panel-title-icon {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
	}

	@container git-panel (max-width: 220px) {
		.project-selector-wrapper {
			display: none;
		}
	}

	/* Mode Toggle */
	.mode-toggle {
		display: flex;
		gap: 0.25rem;
		background: oklch(0.13 0.01 250);
		border-radius: 0.375rem;
		padding: 0.125rem;
	}

	.mode-btn {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		font-size: 0.6875rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: oklch(0.50 0.02 250);
		background: transparent;
		border: none;
		border-radius: 0.25rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.mode-btn:hover {
		color: oklch(0.70 0.02 250);
		background: oklch(0.18 0.01 250);
	}

	.mode-btn.active {
		color: oklch(0.90 0.02 250);
		background: oklch(0.22 0.02 250);
	}

	.mode-icon {
		width: 0.75rem;
		height: 0.75rem;
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
