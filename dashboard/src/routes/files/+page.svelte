<script lang="ts">
	/**
	 * Files Page - Side-by-Side File Browser and Editor
	 *
	 * Layout:
	 * - Header: 'Files' title + project selector dropdown
	 * - Left panel: File tree container (resizable width)
	 * - Right panel: Editor container
	 *
	 * State:
	 * - selectedProject: synced with URL param ?project=<name>
	 * - expandedFolders: Set<string> of expanded folder paths
	 * - openFiles: Array of open file tabs with path, content, dirty flag
	 * - activeFilePath: Currently focused file in editor
	 */

	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { fade, slide } from 'svelte/transition';

	// Types
	interface Project {
		name: string;
		displayName: string;
		path: string;
		port: number | null;
		description: string | null;
	}

	interface OpenFile {
		path: string;
		content: string;
		dirty: boolean;
		originalContent: string;
	}

	// State
	let projects = $state<Project[]>([]);
	let selectedProject = $state<string | null>(null);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	// File tree state
	let expandedFolders = $state<Set<string>>(new Set());

	// Editor state
	let openFiles = $state<OpenFile[]>([]);
	let activeFilePath = $state<string | null>(null);

	// Layout state
	let leftPanelWidth = $state(280); // pixels
	const MIN_PANEL_WIDTH = 180;
	const MAX_PANEL_WIDTH = 600;

	// Divider drag state
	let isDragging = $state(false);
	let startX = $state(0);
	let startWidth = $state(0);

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
		// Clamp to min/max
		newWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, newWidth));
		leftPanelWidth = newWidth;
	}

	function handleDividerMouseUp() {
		isDragging = false;
		document.removeEventListener('mousemove', handleDividerMouseMove);
		document.removeEventListener('mouseup', handleDividerMouseUp);
	}

	// Sync selectedProject from URL query parameter
	$effect(() => {
		const projectParam = $page.url.searchParams.get('project');
		if (projectParam && projects.length > 0) {
			// Verify project exists
			const projectExists = projects.some(p => p.name === projectParam);
			if (projectExists && selectedProject !== projectParam) {
				selectedProject = projectParam;
			}
		}
	});

	// Handle project change - update URL
	function handleProjectChange(projectName: string) {
		selectedProject = projectName;
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

			// If no project selected but we have projects, select the first one
			// (unless URL already has a project param)
			if (projects.length > 0 && !$page.url.searchParams.get('project')) {
				handleProjectChange(projects[0].name);
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load projects';
			console.error('[Files] Failed to fetch projects:', err);
		} finally {
			isLoading = false;
		}
	}

	// Toggle folder expansion
	function toggleFolder(path: string) {
		const newExpanded = new Set(expandedFolders);
		if (newExpanded.has(path)) {
			newExpanded.delete(path);
		} else {
			newExpanded.add(path);
		}
		expandedFolders = newExpanded;
	}

	// Get display name for selected project
	const selectedProjectDisplay = $derived(
		projects.find(p => p.name === selectedProject)?.displayName || selectedProject || 'Select Project'
	);

	// Get path for selected project
	const selectedProjectPath = $derived(
		projects.find(p => p.name === selectedProject)?.path || null
	);

	onMount(() => {
		fetchProjects();
	});
</script>

<svelte:head>
	<title>Files | JAT Dashboard</title>
</svelte:head>

<div class="files-page" style="background: oklch(0.14 0.01 250);">
	{#if isLoading}
		<!-- Loading State -->
		<div class="files-content" transition:fade={{ duration: 150 }}>
			<div class="files-header">
				<div class="skeleton h-8 w-24 rounded-lg" style="background: oklch(0.18 0.02 250);"></div>
				<div class="skeleton h-10 w-48 rounded-lg" style="background: oklch(0.18 0.02 250);"></div>
			</div>
			<div class="files-body">
				<div class="skeleton h-full w-64 rounded-lg" style="background: oklch(0.18 0.02 250);"></div>
				<div class="skeleton h-full flex-1 rounded-lg" style="background: oklch(0.18 0.02 250);"></div>
			</div>
		</div>
	{:else if error}
		<!-- Error State -->
		<div class="files-content error-state" transition:fade={{ duration: 150 }}>
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
		<!-- No Projects State -->
		<div class="files-content empty-state" transition:fade={{ duration: 150 }}>
			<div class="empty-icon">
				<svg class="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
				</svg>
			</div>
			<h2 class="empty-title">No Projects Available</h2>
			<p class="empty-hint">Add a project in the Config tab to get started</p>
		</div>
	{:else}
		<!-- Main Content -->
		<div class="files-content" transition:fade={{ duration: 150 }}>
			<!-- Header -->
			<div class="files-header">
				<h1 class="page-title">Files</h1>

				<!-- Project Selector Dropdown -->
				<div class="dropdown dropdown-end">
					<button class="project-selector" tabindex="0">
						<span class="project-name">{selectedProjectDisplay}</span>
						{#if selectedProjectPath}
							<span class="project-path">{selectedProjectPath}</span>
						{/if}
						<svg class="dropdown-arrow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
						</svg>
					</button>
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<ul class="dropdown-content menu bg-base-200 rounded-box shadow-xl border border-base-300 w-72 max-h-80 overflow-y-auto z-50" tabindex="0">
						{#each projects as project (project.name)}
							<li>
								<button
									class="flex flex-col items-start gap-0.5 py-2"
									class:active={selectedProject === project.name}
									onclick={() => { handleProjectChange(project.name); }}
								>
									<span class="font-medium">{project.displayName}</span>
									<span class="text-xs text-base-content/50 truncate w-full">{project.path}</span>
								</button>
							</li>
						{/each}
					</ul>
				</div>
			</div>

			<!-- Body: Side-by-side layout -->
			<div class="files-body">
				<!-- Left Panel: File Tree -->
				<div class="file-tree-panel" style="width: {leftPanelWidth}px;">
					<div class="panel-header">
						<span class="panel-title">Explorer</span>
					</div>
					<div class="panel-content">
						{#if !selectedProject}
							<div class="panel-empty">
								<p>Select a project to browse files</p>
							</div>
						{:else}
							<!-- File tree will be implemented in a future task -->
							<div class="panel-placeholder">
								<svg class="w-8 h-8 text-base-content/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
								</svg>
								<p class="text-sm text-base-content/40 mt-2">File tree coming soon</p>
								<p class="text-xs text-base-content/30 mt-1">{selectedProjectPath}</p>
							</div>
						{/if}
					</div>
				</div>

				<!-- Resizable Divider (vertical) -->
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

				<!-- Right Panel: Editor -->
				<div class="editor-panel">
					<div class="panel-header">
						<span class="panel-title">Editor</span>
						{#if openFiles.length > 0}
							<!-- Tab bar will be implemented in a future task -->
							<div class="tab-bar">
								{#each openFiles as file (file.path)}
									<button
										class="file-tab"
										class:active={activeFilePath === file.path}
										onclick={() => activeFilePath = file.path}
									>
										<span class="tab-name">{file.path.split('/').pop()}</span>
										{#if file.dirty}
											<span class="dirty-indicator"></span>
										{/if}
									</button>
								{/each}
							</div>
						{/if}
					</div>
					<div class="panel-content">
						{#if !selectedProject}
							<div class="panel-empty">
								<svg class="w-12 h-12 text-base-content/15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
								</svg>
								<p class="text-base-content/40 mt-3">Select a project to start</p>
							</div>
						{:else if !activeFilePath}
							<div class="panel-empty">
								<svg class="w-12 h-12 text-base-content/15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
								</svg>
								<p class="text-base-content/40 mt-3">Select a file to edit</p>
								<p class="text-xs text-base-content/25 mt-1">Or double-click a file in the explorer</p>
							</div>
						{:else}
							<!-- Editor content will be implemented in a future task -->
							<div class="panel-placeholder">
								<p class="text-sm text-base-content/40">Editor coming soon</p>
								<p class="text-xs text-base-content/30 mt-1">{activeFilePath}</p>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.files-page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.files-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding: 1.5rem;
		max-width: 100%;
		width: 100%;
		height: calc(100vh - 48px); /* Account for TopBar */
	}

	/* Header */
	.files-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		margin-bottom: 1rem;
		flex-shrink: 0;
	}

	.page-title {
		font-size: 1.5rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
		font-family: ui-monospace, monospace;
	}

	/* Project Selector */
	.project-selector {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 0.5rem;
		cursor: pointer;
		transition: all 0.15s ease;
		min-width: 200px;
		max-width: 400px;
	}

	.project-selector:hover {
		background: oklch(0.20 0.02 250);
		border-color: oklch(0.30 0.02 250);
	}

	.project-name {
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		font-family: ui-monospace, monospace;
		white-space: nowrap;
	}

	.project-path {
		font-size: 0.75rem;
		color: oklch(0.50 0.02 250);
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dropdown-arrow {
		width: 1rem;
		height: 1rem;
		color: oklch(0.50 0.02 250);
		flex-shrink: 0;
	}

	/* Body: Side-by-side layout */
	.files-body {
		display: flex;
		flex: 1;
		gap: 0;
		min-height: 0; /* Allow flex shrinking */
		border-radius: 0.75rem;
		overflow: hidden;
		border: 1px solid oklch(0.22 0.02 250);
		background: oklch(0.16 0.01 250);
	}

	/* File Tree Panel (Left) */
	.file-tree-panel {
		display: flex;
		flex-direction: column;
		min-width: 180px;
		max-width: 600px;
		flex-shrink: 0;
		background: oklch(0.15 0.01 250);
		border-right: 1px solid oklch(0.22 0.02 250);
	}

	/* Editor Panel (Right) */
	.editor-panel {
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

	.panel-title {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: oklch(0.55 0.02 250);
	}

	/* Panel Content */
	.panel-content {
		flex: 1;
		overflow: auto;
		padding: 0.5rem;
	}

	.panel-empty,
	.panel-placeholder {
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

	/* Tab Bar */
	.tab-bar {
		display: flex;
		gap: 0.25rem;
		overflow-x: auto;
		padding-right: 0.5rem;
	}

	.file-tab {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem;
		background: transparent;
		border: none;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		color: oklch(0.60 0.02 250);
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.15s ease;
	}

	.file-tab:hover {
		background: oklch(0.20 0.02 250);
		color: oklch(0.75 0.02 250);
	}

	.file-tab.active {
		background: oklch(0.22 0.02 250);
		color: oklch(0.85 0.02 250);
	}

	.tab-name {
		max-width: 120px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.dirty-indicator {
		width: 6px;
		height: 6px;
		background: oklch(0.65 0.15 45);
		border-radius: 50%;
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

	/* Responsive */
	@media (max-width: 768px) {
		.files-content {
			padding: 1rem;
		}

		.files-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.project-selector {
			width: 100%;
			max-width: none;
		}

		.files-body {
			flex-direction: column;
		}

		.file-tree-panel {
			width: 100% !important;
			max-width: none;
			min-width: 0;
			max-height: 200px;
			border-right: none;
			border-bottom: 1px solid oklch(0.22 0.02 250);
		}

		.vertical-divider-container {
			display: none;
		}

		.editor-panel {
			min-width: 0;
		}
	}
</style>
