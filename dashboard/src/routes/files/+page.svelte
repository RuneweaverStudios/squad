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
	import { FileEditor, type OpenFile } from '$lib/components/files';
	import FileTree from '$lib/components/files/FileTree.svelte';
	import QuickFileFinder from '$lib/components/files/QuickFileFinder.svelte';
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

	// Derived: selected project's color
	const selectedProjectColor = $derived(
		selectedProject
			? projects.find(p => p.name === selectedProject)?.activeColor || null
			: null
	);

	// File tree state
	let expandedFolders = $state<Set<string>>(new Set());

	// Editor state
	let openFiles = $state<OpenFile[]>([]);
	let activeFilePath = $state<string | null>(null);

	// Quick file finder state
	let quickFinderOpen = $state(false);

	// Layout state
	let leftPanelWidth = $state(303); // pixels
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

	// Handle project change - update URL and user preferences
	function handleProjectChange(projectName: string) {
		selectedProject = projectName;
		// Update user preferences so other pages (like task drawer) remember this
		setActiveProject(projectName);
		const url = new URL(window.location.href);
		url.searchParams.set('project', projectName);
		goto(url.pathname + url.search, { replaceState: true, noScroll: true });
	}

	// Fetch visible projects
	async function fetchProjects() {
		try {
			// Fetch with stats=true to get agent-activity-based sorting
			const response = await fetch('/api/projects?visible=true&stats=true');
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to load projects');
			}

			projects = data.projects || [];

			// If no project selected but we have projects, choose default
			// Priority: 1) URL param, 2) User's active project, 3) First from sorted list
			if (projects.length > 0 && !$page.url.searchParams.get('project')) {
				const activeProject = getActiveProject();
				const projectExists = activeProject && projects.some(p => p.name === activeProject);

				if (projectExists) {
					// Use the user's previously selected project
					handleProjectChange(activeProject);
				} else {
					// Fall back to first project (sorted by recent agent activity)
					handleProjectChange(projects[0].name);
				}
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load projects';
			console.error('[Files] Failed to fetch projects:', err);
		} finally {
			isLoading = false;
		}
	}

	// Media file extensions that should use MediaPreview instead of Monaco
	const MEDIA_EXTENSIONS = new Set([
		// Images
		'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif',
		// Videos
		'mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv',
		// Audio
		'mp3', 'wav', 'flac', 'aac', 'm4a', 'opus',
		// Documents
		'pdf'
	]);

	/**
	 * Check if a file is a media file based on extension
	 */
	function isMediaFile(path: string): boolean {
		const ext = path.split('.').pop()?.toLowerCase() || '';
		return MEDIA_EXTENSIONS.has(ext);
	}

	/**
	 * Get a user-friendly error message for file operations
	 */
	function getFileErrorMessage(error: string, status: number, filename: string): string {
		// Map common error conditions to user-friendly messages
		if (status === 404) {
			return `"${filename}" no longer exists. It may have been deleted or moved.`;
		}
		if (status === 403) {
			if (error.includes('traversal')) {
				return `Access denied: Cannot access files outside the project directory.`;
			}
			if (error.includes('sensitive')) {
				return `"${filename}" is a sensitive file and cannot be opened.`;
			}
			return `Access denied: ${error}`;
		}
		if (status === 413) {
			return `"${filename}" is too large to open in the editor. Maximum file size is 1MB.`;
		}
		if (status === 415) {
			return `"${filename}" appears to be a binary file and cannot be displayed as text.`;
		}
		if (status === 500) {
			return `Server error while reading "${filename}". Please try again.`;
		}
		// Default to the error message from the API
		return error || `Failed to open "${filename}"`;
	}

	// Handle file selection from tree
	async function handleFileSelect(path: string) {
		// Check if file is already open
		const existingFile = openFiles.find(f => f.path === path);
		if (existingFile) {
			// Just switch to it
			activeFilePath = path;
			return;
		}

		if (!selectedProject) return;

		const filename = path.split('/').pop() || path;

		// Check if this is a media file - don't try to fetch content, just open with media preview
		if (isMediaFile(path)) {
			const newFile: OpenFile = {
				path,
				content: '', // No content for media files
				originalContent: '',
				dirty: false,
				isMedia: true
			};
			// Double-check to handle race conditions with concurrent handleFileSelect calls
			if (!openFiles.some(f => f.path === path)) {
				openFiles = [...openFiles, newFile];
			}
			activeFilePath = path;
			return;
		}

		// Fetch file content for text files
		try {
			const params = new URLSearchParams({
				project: selectedProject,
				path
			});
			const response = await fetch(`/api/files/content?${params}`);

			if (!response.ok) {
				const data = await response.json();
				const errorMsg = getFileErrorMessage(data.error || data.message, response.status, filename);
				fileError = errorMsg;
				setTimeout(() => { fileError = null; }, 5000);
				console.error('[Files] Failed to load file:', data.error || data.message);
				return;
			}

			const data = await response.json();
			const content = data.content || '';

			// Add to open files
			const newFile: OpenFile = {
				path,
				content,
				originalContent: content,
				dirty: false
			};
			// Double-check to handle race conditions with concurrent handleFileSelect calls
			if (!openFiles.some(f => f.path === path)) {
				openFiles = [...openFiles, newFile];
			}
			activeFilePath = path;
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : 'Failed to load file';
			fileError = `Could not open "${filename}": ${errorMsg}`;
			setTimeout(() => { fileError = null; }, 5000);
			console.error('[Files] Failed to load file:', err);
		}
	}

	// Get display name for selected project
	const selectedProjectDisplay = $derived(
		projects.find(p => p.name === selectedProject)?.displayName || selectedProject || 'Select Project'
	);

	// Get path for selected project
	const selectedProjectPath = $derived(
		projects.find(p => p.name === selectedProject)?.path || null
	);

	// Handle file close request (called after FileEditor confirms if dirty)
	function handleFileClose(path: string) {
		closeFile(path);
	}

	// Close a file tab
	function closeFile(path: string) {
		const index = openFiles.findIndex((f) => f.path === path);
		if (index === -1) return;

		// Remove the file from openFiles
		openFiles = openFiles.filter((f) => f.path !== path);

		// If this was the active file, switch to another
		if (activeFilePath === path) {
			if (openFiles.length > 0) {
				// Switch to the previous tab, or the first one
				const newIndex = Math.min(index, openFiles.length - 1);
				activeFilePath = openFiles[newIndex]?.path || null;
			} else {
				activeFilePath = null;
			}
		}
	}

	// Saving state for UI feedback
	let savingFiles = $state<Set<string>>(new Set());
	let saveError = $state<string | null>(null);
	let saveSuccess = $state<string | null>(null);

	// File operation feedback
	let fileError = $state<string | null>(null);
	let fileInfo = $state<string | null>(null);

	/**
	 * Get a user-friendly error message for save operations
	 */
	function getSaveErrorMessage(error: string, status: number, filename: string): string {
		if (status === 403) {
			if (error.includes('sensitive')) {
				return `Cannot save "${filename}": This is a protected file type.`;
			}
			if (error.includes('traversal')) {
				return `Cannot save outside the project directory.`;
			}
			return `Permission denied: ${error}`;
		}
		if (status === 404) {
			return `Cannot save "${filename}": Parent directory not found.`;
		}
		if (status === 409) {
			return `Conflict: Another file with this name already exists.`;
		}
		if (status === 413) {
			return `File too large to save. Maximum file size is 1MB.`;
		}
		if (status === 500) {
			return `Server error while saving "${filename}". Please try again.`;
		}
		// Check for common filesystem errors
		if (error.includes('ENOSPC') || error.includes('no space')) {
			return `Cannot save: Disk is full.`;
		}
		if (error.includes('EROFS') || error.includes('read-only')) {
			return `Cannot save: Filesystem is read-only.`;
		}
		if (error.includes('EACCES')) {
			return `Cannot save "${filename}": Permission denied.`;
		}
		return error || `Failed to save "${filename}"`;
	}

	// Handle file save
	async function handleFileSave(path: string, content: string) {
		if (!selectedProject) return;

		const filename = path.split('/').pop() || path;

		// Add to saving state
		savingFiles = new Set([...savingFiles, path]);
		saveError = null;

		try {
			const params = new URLSearchParams({
				project: selectedProject,
				path
			});

			const response = await fetch(`/api/files/content?${params}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content })
			});

			if (!response.ok) {
				const data = await response.json();
				throw { message: data.error || 'Failed to save file', status: response.status };
			}

			// Mark file as not dirty after save
			openFiles = openFiles.map((f) => {
				if (f.path === path) {
					return { ...f, dirty: false, originalContent: content };
				}
				return f;
			});

			// Show success toast
			saveSuccess = `Saved ${filename}`;
			setTimeout(() => { saveSuccess = null; }, 2000);

		} catch (err: unknown) {
			console.error('[Files] Failed to save file:', err);
			if (err && typeof err === 'object' && 'message' in err && 'status' in err) {
				saveError = getSaveErrorMessage(err.message as string, err.status as number, filename);
			} else {
				saveError = err instanceof Error ? err.message : `Failed to save "${filename}"`;
			}
			setTimeout(() => { saveError = null; }, 5000);
		} finally {
			// Remove from saving state
			const updated = new Set(savingFiles);
			updated.delete(path);
			savingFiles = updated;
		}
	}

	// Handle active file change
	function handleActiveFileChange(path: string) {
		activeFilePath = path;
	}

	// Handle content change
	function handleContentChange(path: string, content: string, dirty: boolean) {
		// Already updated by FileEditor, just log for now
		console.log('[Files] Content changed:', path, 'dirty:', dirty);
	}

	// Handle tab reorder (drag-and-drop)
	function handleTabReorder(fromIndex: number, toIndex: number) {
		if (fromIndex === toIndex) return;

		// Create a copy of the array
		const reordered = [...openFiles];

		// Remove the item from the original position
		const [movedItem] = reordered.splice(fromIndex, 1);

		// Insert it at the new position
		reordered.splice(toIndex, 0, movedItem);

		// Update state
		openFiles = reordered;

		console.log('[Files] Tab reordered from', fromIndex, 'to', toIndex);
	}

	// Handle file delete from tree
	function handleFileDelete(path: string) {
		// If the deleted file is open, close it
		const isOpen = openFiles.some(f => f.path === path);
		if (isOpen) {
			openFiles = openFiles.filter(f => f.path !== path);
			if (activeFilePath === path) {
				activeFilePath = openFiles.length > 0 ? openFiles[0].path : null;
			}
		}
	}

	// Handle file rename from tree
	function handleFileRename(oldPath: string, newPath: string) {
		// If the renamed file is open, update its path
		const openFile = openFiles.find(f => f.path === oldPath);
		if (openFile) {
			openFiles = openFiles.map(f => {
				if (f.path === oldPath) {
					return { ...f, path: newPath };
				}
				return f;
			});
			if (activeFilePath === oldPath) {
				activeFilePath = newPath;
			}
		}
	}

	// Handle file create from tree
	function handleFileCreate(path: string, type: 'file' | 'folder') {
		// Files will be auto-selected by the FileTree component
		// Just log for now
		console.log('[Files] Created:', type, path);
	}

	// Handle tree operation error (show as toast)
	function handleTreeError(message: string) {
		fileError = message;
		setTimeout(() => { fileError = null; }, 5000);
	}

	// Handle tree operation success (show as toast)
	function handleTreeSuccess(message: string) {
		fileInfo = message;
		setTimeout(() => { fileInfo = null; }, 3000);
	}

	// localStorage key for persisting open files per project
	function getStorageKey(project: string): string {
		return `jat-files-open-${project}`;
	}

	// Track which projects have been restored to prevent double-loading
	let restoredProjects = $state<Set<string>>(new Set());

	// Save open files to localStorage
	function saveOpenFilesToStorage() {
		if (!selectedProject || typeof window === 'undefined') return;

		const key = getStorageKey(selectedProject);
		if (openFiles.length === 0) {
			// Remove from storage when no files open
			localStorage.removeItem(key);
		} else {
			const data = {
				openFiles: openFiles.map(f => ({ path: f.path })),
				activeFilePath
			};
			localStorage.setItem(key, JSON.stringify(data));
		}
	}

	// Load open files from localStorage
	async function loadOpenFilesFromStorage() {
		if (!selectedProject || typeof window === 'undefined') return;
		if (restoredProjects.has(selectedProject)) return;

		// Mark as restored to prevent duplicate loads
		restoredProjects = new Set([...restoredProjects, selectedProject]);

		const key = getStorageKey(selectedProject);
		const stored = localStorage.getItem(key);
		if (!stored) return;

		try {
			const data = JSON.parse(stored);
			const paths: string[] = data.openFiles?.map((f: { path: string }) => f.path) || [];
			const savedActivePath = data.activeFilePath;

			// Load each file's content
			for (const path of paths) {
				await handleFileSelect(path);
			}

			// Restore active file
			if (savedActivePath && openFiles.some(f => f.path === savedActivePath)) {
				activeFilePath = savedActivePath;
			}
		} catch (err) {
			console.error('[Files] Failed to restore open files:', err);
		}
	}

	// Save to storage when open files change (including order changes from drag-drop)
	// Note: We use JSON.stringify to create a dependency on the full array structure,
	// ensuring the effect re-runs when files are reordered, opened, or closed.
	$effect(() => {
		// Serialize paths to track full array structure including order
		const pathsJson = JSON.stringify(openFiles.map(f => f.path));
		const currentActivePath = activeFilePath;
		const currentProject = selectedProject;

		// Only save after initial restore is complete
		if (currentProject && restoredProjects.has(currentProject)) {
			saveOpenFilesToStorage();
		}
	});

	// Handle global keyboard shortcuts
	function handleKeyDown(e: KeyboardEvent) {
		// Ctrl+S - Save current file
		if (e.ctrlKey && e.key === 's') {
			e.preventDefault();
			// Find the active file and save it if dirty
			const activeFile = openFiles.find(f => f.path === activeFilePath);
			if (activeFile && activeFile.dirty && selectedProject) {
				handleFileSave(activeFilePath!, activeFile.content);
			}
		}

		// Alt+W - Close current tab
		if (e.altKey && e.key === 'w') {
			e.preventDefault();
			if (activeFilePath && openFiles.length > 0) {
				closeFile(activeFilePath);
			}
		}

		// Alt+] - Next tab
		if (e.altKey && e.key === ']') {
			e.preventDefault();
			if (openFiles.length > 1 && activeFilePath) {
				const currentIndex = openFiles.findIndex(f => f.path === activeFilePath);
				const nextIndex = (currentIndex + 1) % openFiles.length;
				activeFilePath = openFiles[nextIndex].path;
			}
		}

		// Alt+[ - Previous tab
		if (e.altKey && e.key === '[') {
			e.preventDefault();
			if (openFiles.length > 1 && activeFilePath) {
				const currentIndex = openFiles.findIndex(f => f.path === activeFilePath);
				const prevIndex = (currentIndex - 1 + openFiles.length) % openFiles.length;
				activeFilePath = openFiles[prevIndex].path;
			}
		}

		// Alt+P - Open quick file finder (Alt instead of Ctrl to avoid browser conflict)
		if (e.altKey && e.key === 'p') {
			e.preventDefault();
			if (selectedProject) {
				quickFinderOpen = true;
			}
		}
	}

	// Track whether we've handled the initial file parameter
	let handledFileParam = $state(false);

	onMount(() => {
		fetchProjects();
	});

	// Load persisted files after project is selected
	$effect(() => {
		if (selectedProject && projects.length > 0 && !isLoading) {
			// Small delay to ensure project is fully loaded
			setTimeout(() => loadOpenFilesFromStorage(), 100);
		}
	});

	// Open file from URL parameter ?file=<path> (after project is loaded)
	$effect(() => {
		if (selectedProject && projects.length > 0 && !isLoading && !handledFileParam) {
			const fileParam = $page.url.searchParams.get('file');
			if (fileParam) {
				handledFileParam = true;
				// Clear the file param from URL (so refresh doesn't re-open)
				const url = new URL(window.location.href);
				url.searchParams.delete('file');
				goto(url.pathname + url.search, { replaceState: true, noScroll: true });
				// Open the file after a small delay to ensure storage is loaded first
				setTimeout(() => handleFileSelect(fileParam), 150);
			}
		}
	});
</script>

<svelte:head>
	<title>Files | JAT Dashboard</title>
</svelte:head>

<svelte:window onkeydown={handleKeyDown} />

<div class="files-page" style="background: oklch(0.14 0.01 250);">
	{#if isLoading}
		<!-- Loading State -->
		<FilesSkeleton treeItems={12} tabs={3} />
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
			<!-- Body: Side-by-side layout -->
			<div class="files-body">
				<!-- Left Panel: File Tree -->
				<div class="file-tree-panel" style="width: {leftPanelWidth}px;">
					<!-- Project Selector in Panel Header -->
					<div class="panel-header project-header">
						<div class="dropdown dropdown-bottom w-full">
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
					<div class="panel-content file-tree-content">
						{#if !selectedProject}
							<div class="panel-empty">
								<p>Select a project to browse files</p>
							</div>
						{:else}
							<FileTree
								project={selectedProject}
								selectedPath={activeFilePath}
								onFileSelect={handleFileSelect}
								onFileDelete={handleFileDelete}
								onFileRename={handleFileRename}
								onFileCreate={handleFileCreate}
								onError={handleTreeError}
								onSuccess={handleTreeSuccess}
							/>
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
					{#if selectedProject}
						<FileEditor
							bind:openFiles
							bind:activeFilePath
							project={selectedProject}
							onFileClose={handleFileClose}
							onFileSave={handleFileSave}
							onActiveFileChange={handleActiveFileChange}
							onContentChange={handleContentChange}
							onTabReorder={handleTabReorder}
							{savingFiles}
						/>
					{:else}
						<div class="panel-header">
							<span class="panel-title">Editor</span>
						</div>
						<div class="panel-content">
							<div class="panel-empty">
								<svg class="w-12 h-12 text-base-content/15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
								</svg>
								<p class="text-base-content/40 mt-3">Select a project to start</p>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- Toast Notifications -->
<div class="toast toast-end toast-bottom z-50">
	{#if saveSuccess}
		<div class="alert alert-success shadow-lg" transition:slide={{ duration: 200 }}>
			<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<span>{saveSuccess}</span>
		</div>
	{/if}
	{#if saveError}
		<div class="alert alert-error shadow-lg" transition:slide={{ duration: 200 }}>
			<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<span>{saveError}</span>
			<button class="btn btn-ghost btn-xs" onclick={() => { saveError = null; }}>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>
	{/if}
	{#if fileError}
		<div class="alert alert-warning shadow-lg" transition:slide={{ duration: 200 }}>
			<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
			</svg>
			<span>{fileError}</span>
			<button class="btn btn-ghost btn-xs" onclick={() => { fileError = null; }}>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>
	{/if}
	{#if fileInfo}
		<div class="alert alert-info shadow-lg" transition:slide={{ duration: 200 }}>
			<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<span>{fileInfo}</span>
		</div>
	{/if}
</div>

<!-- Quick File Finder Modal (Ctrl+P) -->
{#if selectedProject}
	<QuickFileFinder
		isOpen={quickFinderOpen}
		project={selectedProject}
		onClose={() => { quickFinderOpen = false; }}
		onFileSelect={handleFileSelect}
	/>
{/if}

<style>
	.files-page {
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	.files-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding: 0.75rem;
		max-width: 100%;
		width: 100%;
		min-height: 0; /* Allow flex shrinking to fit parent */
	}

	/* Compact Project Selector (in panel header) */
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

	.panel-content.file-tree-content {
		padding: 0;
		overflow: hidden;
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

		.vertical-divider {
			display: none;
		}

		.editor-panel {
			min-width: 0;
		}
	}
</style>
