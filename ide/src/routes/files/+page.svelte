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
	import GlobalSearch from '$lib/components/files/GlobalSearch.svelte';
	import ResizableDivider from '$lib/components/ResizableDivider.svelte';
	import { setActiveProject } from '$lib/stores/preferences.svelte';
	import { FilesSkeleton } from '$lib/components/skeleton';
	import { setGitChangesCount, setGitAheadCount } from '$lib/stores/drawerStore';
	import { successToast, errorToast, warningToast, infoToast } from '$lib/stores/toasts.svelte';

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

	// Derived: selected project's root path (for file path display)
	const selectedProjectPath = $derived(
		selectedProject
			? projects.find(p => p.name === selectedProject)?.path || ''
			: ''
	);

	// File tree state
	let expandedFolders = $state<Set<string>>(new Set());

	// Editor state
	let openFiles = $state<OpenFile[]>([]);
	let activeFilePath = $state<string | null>(null);

	// Quick file finder state
	let quickFinderOpen = $state(false);

	// Global search state (Ctrl+Shift+F)
	let globalSearchOpen = $state(false);

	// FileTree component reference for scrolling
	let fileTreeRef: { scrollToFile: (path: string) => Promise<void> } | null = $state(null);

	// Layout state
	let leftPanelWidth = $state(303); // pixels (for desktop horizontal layout)
	const MIN_PANEL_WIDTH = 180;
	const MAX_PANEL_WIDTH = 600;

	// Mobile layout state (for vertical stacked layout)
	let isMobileLayout = $state(false);
	let topPanelHeight = $state(40); // percentage of container height
	const MOBILE_BREAKPOINT = 768;
	const MIN_PANEL_HEIGHT_PERCENT = 15;
	const MAX_PANEL_HEIGHT_PERCENT = 70;

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

	// Mobile horizontal divider resize handler
	let containerRef: HTMLDivElement | null = $state(null);

	function handleMobileResize(deltaY: number) {
		if (!containerRef) return;
		const containerHeight = containerRef.offsetHeight;
		const deltaPercent = (deltaY / containerHeight) * 100;
		let newHeight = topPanelHeight + deltaPercent;
		// Clamp to min/max
		newHeight = Math.max(MIN_PANEL_HEIGHT_PERCENT, Math.min(MAX_PANEL_HEIGHT_PERCENT, newHeight));
		topPanelHeight = newHeight;
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
				warningToast(errorMsg);
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
			warningToast(`Could not open "${filename}": ${errorMsg}`);
			console.error('[Files] Failed to load file:', err);
		}
	}

	// Get display name for selected project
	const selectedProjectDisplay = $derived(
		projects.find(p => p.name === selectedProject)?.displayName || selectedProject || 'Select Project'
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
	// Disk change detection state
	let diskChangePollingInterval: ReturnType<typeof setInterval> | null = null;

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
			successToast(`Saved ${filename}`);

		} catch (err: unknown) {
			console.error('[Files] Failed to save file:', err);
			if (err && typeof err === 'object' && 'message' in err && 'status' in err) {
				errorToast(getSaveErrorMessage(err.message as string, err.status as number, filename));
			} else {
				errorToast(err instanceof Error ? err.message : `Failed to save "${filename}"`);
			}
		} finally {
			// Remove from saving state
			const updated = new Set(savingFiles);
			updated.delete(path);
			savingFiles = updated;
		}
	}

	/**
	 * Poll for disk changes on open files
	 * Checks if the content on disk differs from originalContent
	 */
	async function checkForDiskChanges() {
		if (!selectedProject || openFiles.length === 0) return;

		// Only check non-media, non-dirty files (dirty files are being edited)
		const filesToCheck = openFiles.filter(f => !f.isMedia);
		if (filesToCheck.length === 0) return;

		for (const file of filesToCheck) {
			try {
				const params = new URLSearchParams({
					project: selectedProject,
					path: file.path
				});
				const response = await fetch(`/api/files/content?${params}`);

				if (!response.ok) continue; // Skip files that can't be read

				const data = await response.json();
				const diskContent = data.content || '';

				// Check if disk content differs from our originalContent
				const hasDiskChanges = diskContent !== file.originalContent;

				// Update the file if the hasDiskChanges state changed
				if (hasDiskChanges !== file.hasDiskChanges || (hasDiskChanges && file.diskContent !== diskContent)) {
					openFiles = openFiles.map(f => {
						if (f.path === file.path) {
							return {
								...f,
								hasDiskChanges,
								diskContent: hasDiskChanges ? diskContent : undefined
							};
						}
						return f;
					});
				}
			} catch {
				// Silently ignore errors for individual files
			}
		}
	}

	/**
	 * Start polling for disk changes
	 */
	function startDiskChangePolling() {
		if (diskChangePollingInterval) return;
		if (document.visibilityState === 'hidden') return;

		// Check immediately
		checkForDiskChanges();

		// Then poll every 3 seconds
		diskChangePollingInterval = setInterval(checkForDiskChanges, 3000);
	}

	/**
	 * Stop polling for disk changes
	 */
	function stopDiskChangePolling() {
		if (diskChangePollingInterval) {
			clearInterval(diskChangePollingInterval);
			diskChangePollingInterval = null;
		}
	}

	/**
	 * Accept disk changes - replace our content with disk content
	 */
	function handleAcceptDiskChange(path: string) {
		const file = openFiles.find(f => f.path === path);
		if (!file || !file.diskContent) return;

		openFiles = openFiles.map(f => {
			if (f.path === path) {
				return {
					...f,
					content: f.diskContent!,
					originalContent: f.diskContent!,
					dirty: false,
					hasDiskChanges: false,
					diskContent: undefined
				};
			}
			return f;
		});

		const filename = path.split('/').pop() || path;
		fileInfo = `Accepted disk version of ${filename}`;
		setTimeout(() => { fileInfo = null; }, 2000);
	}

	/**
	 * Discard disk changes - save our version to disk to overwrite external changes
	 */
	async function handleDiscardDiskChange(path: string) {
		const file = openFiles.find(f => f.path === path);
		if (!file || !selectedProject) return;

		const filename = path.split('/').pop() || path;

		// Save our current content to disk
		try {
			const params = new URLSearchParams({
				project: selectedProject,
				path
			});

			const response = await fetch(`/api/files/content?${params}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: file.content })
			});

			if (!response.ok) {
				const data = await response.json();
				throw { message: data.error || 'Failed to save file', status: response.status };
			}

			// Update state - our content is now the original (saved to disk)
			openFiles = openFiles.map(f => {
				if (f.path === path) {
					return {
						...f,
						originalContent: f.content,
						dirty: false,
						hasDiskChanges: false,
						diskContent: undefined
					};
				}
				return f;
			});

			fileInfo = `Saved your version of ${filename}`;
			setTimeout(() => { fileInfo = null; }, 2000);

		} catch (err: unknown) {
			console.error('[Files] Failed to save file:', err);
			if (err && typeof err === 'object' && 'message' in err && 'status' in err) {
				fileError = getSaveErrorMessage(err.message as string, err.status as number, filename);
			} else {
				fileError = err instanceof Error ? err.message : `Failed to save "${filename}"`;
			}
			setTimeout(() => { fileError = null; }, 5000);
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
		// Remove from starred if starred
		if (starredFiles.has(path)) {
			starredFiles.delete(path);
			starredFiles = new Set(starredFiles);
			saveStarredFilesToStorage();
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
		// Update starred path if the file was starred
		if (starredFiles.has(oldPath)) {
			starredFiles.delete(oldPath);
			starredFiles.add(newPath);
			starredFiles = new Set(starredFiles);
			saveStarredFilesToStorage();
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

	// localStorage key for persisting starred files per project
	function getStarredStorageKey(project: string): string {
		return `jat-files-starred-${project}`;
	}

	// Files to auto-star by default when a project has no starred files yet
	const DEFAULT_STARRED_FILES = ['README.md', 'AGENTS.md', 'CLAUDE.md'];

	// Starred files state
	let starredFiles = $state<Set<string>>(new Set());

	// Check which default files exist in the project root and auto-star them
	async function initDefaultStarredFiles(project: string) {
		const initKey = `jat-files-starred-init-${project}`;
		if (localStorage.getItem(initKey)) return; // Already initialized

		try {
			const res = await fetch(`/api/files?project=${encodeURIComponent(project)}`);
			if (!res.ok) return;
			const data = await res.json();
			const entries: Array<{ name: string; type: string }> = data.entries || [];
			const rootFiles = new Set(entries.filter(e => e.type === 'file').map(e => e.name));

			const defaults = DEFAULT_STARRED_FILES.filter(f => rootFiles.has(f));
			if (defaults.length > 0) {
				starredFiles = new Set(defaults);
				saveStarredFilesToStorage();
			}
		} catch {
			// Silently fail — user can star files manually
		}

		localStorage.setItem(initKey, '1');
	}

	// Load starred files from localStorage
	function loadStarredFilesFromStorage() {
		if (!selectedProject || typeof window === 'undefined') return;

		const key = getStarredStorageKey(selectedProject);
		const stored = localStorage.getItem(key);
		if (stored) {
			try {
				const paths = JSON.parse(stored);
				starredFiles = new Set(paths);
			} catch (err) {
				console.error('[Files] Failed to load starred files:', err);
				starredFiles = new Set();
			}
		} else {
			starredFiles = new Set();
			// Auto-star default documentation files for new projects
			initDefaultStarredFiles(selectedProject);
		}
	}

	// Save starred files to localStorage
	function saveStarredFilesToStorage() {
		if (!selectedProject || typeof window === 'undefined') return;

		const key = getStarredStorageKey(selectedProject);
		if (starredFiles.size === 0) {
			localStorage.removeItem(key);
		} else {
			localStorage.setItem(key, JSON.stringify([...starredFiles]));
		}
	}

	// Toggle star status for a file
	function handleToggleStar(path: string) {
		if (starredFiles.has(path)) {
			starredFiles.delete(path);
		} else {
			starredFiles.add(path);
		}
		starredFiles = new Set(starredFiles); // Trigger reactivity
		saveStarredFilesToStorage();
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

		// Ctrl+Shift+F - Open global search (content search)
		// Use e.code instead of e.key for reliability with modifiers
		if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyF') {
			e.preventDefault();
			e.stopPropagation();
			if (selectedProject) {
				globalSearchOpen = true;
			}
		}
	}

	// Handle global search result selection - open file at specific line
	async function handleGlobalSearchResult(file: string, line: number, project: string) {
		// Switch project if different
		if (project !== selectedProject) {
			selectedProject = project;
			setActiveProject(project);
			const url = new URL(window.location.href);
			url.searchParams.set('project', project);
			goto(url.pathname + url.search, { replaceState: true, noScroll: true, keepFocus: true });
			// Wait for project change to take effect
			await new Promise(r => setTimeout(r, 100));
		}

		// Open the file
		await handleFileSelect(file);

		// Scroll to the file in the FileTree (after a short delay for ref to be available)
		setTimeout(() => {
			if (fileTreeRef) {
				fileTreeRef.scrollToFile(file);
			}
		}, 150);

		// Then scroll to the line in the editor
		// We need to give the editor a moment to load the file
		setTimeout(() => {
			// Get the FileEditor component and trigger scroll to line
			const event = new CustomEvent('scroll-to-line', { detail: { line } });
			window.dispatchEvent(event);
		}, 200);
	}

	// Track whether we've handled the initial file parameter
	let handledFileParam = $state(false);

	// Fetch git status for tab badges (changes count and ahead count)
	let gitStatusInterval: ReturnType<typeof setInterval> | null = null;

	async function fetchGitStatusForBadges() {
		if (!selectedProject) {
			setGitChangesCount(0);
			setGitAheadCount(0);
			return;
		}

		try {
			const response = await fetch(`/api/files/git/status?project=${encodeURIComponent(selectedProject)}`);
			if (response.ok) {
				const data = await response.json();
				// Calculate total changes (modified + deleted + untracked + created, excluding staged)
				const staged = data.staged || [];
				const modified = (data.modified || []).filter((f: string) => !staged.includes(f));
				const deleted = (data.deleted || []).filter((f: string) => !staged.includes(f));
				const untracked = (data.not_added || []).filter((f: string) => !staged.includes(f));
				const created = (data.created || []).filter((f: string) => !staged.includes(f));
				setGitChangesCount(staged.length + modified.length + deleted.length + untracked.length + created.length);
				setGitAheadCount(data.ahead || 0);
			} else {
				setGitChangesCount(0);
				setGitAheadCount(0);
			}
		} catch {
			// Silently fail - git status is not critical
			setGitChangesCount(0);
			setGitAheadCount(0);
		}
	}

	function startGitStatusPolling() {
		// Avoid duplicate intervals
		if (gitStatusInterval) return;
		// Don't start polling if tab is hidden
		if (document.visibilityState === 'hidden') return;
		// Fetch immediately
		fetchGitStatusForBadges();
		// Then poll every 10 seconds
		gitStatusInterval = setInterval(fetchGitStatusForBadges, 10000);
	}

	function stopGitStatusPolling() {
		if (gitStatusInterval) {
			clearInterval(gitStatusInterval);
			gitStatusInterval = null;
		}
	}

	onMount(() => {
		fetchProjects();

		// Track viewport size for mobile/desktop layout switching
		function handleResize() {
			isMobileLayout = window.innerWidth < MOBILE_BREAKPOINT;
		}
		handleResize(); // Check initial state
		window.addEventListener('resize', handleResize);

		// Pause polling when tab is hidden, resume when visible
		function handleVisibilityChange() {
			if (document.visibilityState === 'hidden') {
				stopGitStatusPolling();
				stopDiskChangePolling();
			} else if (selectedProject) {
				// Resume polling and fetch immediately to catch changes
				startGitStatusPolling();
				startDiskChangePolling();
			}
		}
		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			stopGitStatusPolling();
			stopDiskChangePolling();
			window.removeEventListener('resize', handleResize);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});

	// Load persisted files after project is selected and start polling
	$effect(() => {
		if (selectedProject && projects.length > 0 && !isLoading) {
			// Load starred files immediately (sync operation)
			loadStarredFilesFromStorage();
			// Small delay to ensure project is fully loaded
			setTimeout(() => loadOpenFilesFromStorage(), 100);
			// Start git status polling for tab badges
			startGitStatusPolling();
			// Start disk change polling for open files
			startDiskChangePolling();
		}
	});

	// Open file from URL parameter ?file=<path>&line=<number> (after project is loaded)
	$effect(() => {
		if (selectedProject && projects.length > 0 && !isLoading && !handledFileParam) {
			const fileParam = $page.url.searchParams.get('file');
			const lineParam = $page.url.searchParams.get('line');
			if (fileParam) {
				handledFileParam = true;
				// Clear the file and line params from URL (so refresh doesn't re-open)
				const url = new URL(window.location.href);
				url.searchParams.delete('file');
				url.searchParams.delete('line');
				goto(url.pathname + url.search, { replaceState: true, noScroll: true });
				// Open the file after a small delay to ensure storage is loaded first
				setTimeout(async () => {
					await handleFileSelect(fileParam);
					// Scroll to the file in the FileTree
					if (fileTreeRef) {
						fileTreeRef.scrollToFile(fileParam);
					}
					// If line param provided, scroll to that line after file loads
					if (lineParam) {
						const lineNumber = parseInt(lineParam, 10);
						if (!isNaN(lineNumber) && lineNumber > 0) {
							// Give editor time to initialize
							setTimeout(() => {
								const event = new CustomEvent('scroll-to-line', { detail: { line: lineNumber } });
								window.dispatchEvent(event);
							}, 200);
						}
					}
				}, 150);
			}
		}
	});
</script>

<svelte:head>
	<title>Files | JAT IDE</title>
	<meta name="description" content="Project file browser with syntax-highlighted editor. Browse, edit, and manage project files." />
	<meta property="og:title" content="Files | JAT IDE" />
	<meta property="og:description" content="Project file browser with syntax-highlighted editor. Browse, edit, and manage project files." />
	<meta property="og:image" content="/favicons/files.svg" />
	<link rel="icon" href="/favicons/files.svg" />
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
			<!-- Body: Side-by-side (desktop) or stacked (mobile) layout -->
			<div class="files-body" class:mobile-layout={isMobileLayout} bind:this={containerRef}>
				<!-- Left Panel: File Tree -->
				<div
					class="file-tree-panel"
					style="{isMobileLayout ? `height: ${topPanelHeight}%` : `width: ${leftPanelWidth}px`};"
				>
					<!-- Panel Header -->
					<div class="panel-header project-header">
						<span class="font-medium text-base-content/90 flex-1 truncate">{selectedProject || 'No project selected'}</span>
						<!-- Search button -->
						<button
							class="search-button"
							title="Search in files (Ctrl+Shift+F)"
							onclick={() => { if (selectedProject) globalSearchOpen = true; }}
							disabled={!selectedProject}
						>
							<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
							</svg>
						</button>
					</div>
					<div class="panel-content file-tree-content">
						{#if !selectedProject}
							<div class="panel-empty">
								<p>Select a project to browse files</p>
							</div>
						{:else}
							<FileTree
								bind:this={fileTreeRef}
								project={selectedProject}
								projectPath={selectedProjectPath}
								selectedPath={activeFilePath}
								onFileSelect={handleFileSelect}
								onFileDelete={handleFileDelete}
								onFileRename={handleFileRename}
								onFileCreate={handleFileCreate}
								onError={handleTreeError}
								onSuccess={handleTreeSuccess}
								{starredFiles}
								onToggleStar={handleToggleStar}
							/>
						{/if}
					</div>
				</div>

				<!-- Resizable Divider: vertical on desktop, horizontal on mobile -->
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

				<!-- Right Panel: Editor -->
				<div class="editor-panel">
					{#if selectedProject}
						<FileEditor
							bind:openFiles
							bind:activeFilePath
							project={selectedProject}
							projectPath={selectedProjectPath}
							onFileClose={handleFileClose}
							onFileSave={handleFileSave}
							onActiveFileChange={handleActiveFileChange}
							onContentChange={handleContentChange}
							onTabReorder={handleTabReorder}
							onAcceptDiskChange={handleAcceptDiskChange}
							onDiscardDiskChange={handleDiscardDiskChange}
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

<!-- Quick File Finder Modal (Alt+P) -->
{#if selectedProject}
	<QuickFileFinder
		isOpen={quickFinderOpen}
		project={selectedProject}
		onClose={() => { quickFinderOpen = false; }}
		onFileSelect={handleFileSelect}
	/>
{/if}

<!-- Global Search Modal (Ctrl+Shift+F) -->
{#if selectedProject}
	<GlobalSearch
		isOpen={globalSearchOpen}
		project={selectedProject}
		availableProjects={projects.map(p => p.name)}
		onClose={() => { globalSearchOpen = false; }}
		onResultSelect={handleGlobalSearchResult}
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

	/* Project Selector in Panel Header */
	.project-header {
		padding: 0.375rem 0.5rem;
	}

	/* Search Button */
	.search-button {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.375rem;
		background: transparent;
		border: none;
		border-radius: 0.375rem;
		color: oklch(0.55 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.search-button:hover:not(:disabled) {
		background: oklch(0.25 0.02 250);
		color: oklch(0.75 0.02 250);
	}

	.search-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
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

	/* Mobile Layout (controlled by JS isMobileLayout state) */
	.files-body.mobile-layout {
		flex-direction: column;
	}

	.files-body.mobile-layout .file-tree-panel {
		width: 100% !important;
		max-width: none;
		min-width: 0;
		min-height: 100px;
		border-right: none;
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.files-body.mobile-layout .editor-panel {
		min-width: 0;
		flex: 1;
		min-height: 0;
	}

	/* Responsive - additional small screen tweaks */
	@media (max-width: 768px) {
		.files-content {
			padding: 0.5rem;
		}
	}
</style>
