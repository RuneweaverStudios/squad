<script lang="ts">
	/**
	 * FileTree - Container component for displaying project directory structure
	 *
	 * Features:
	 * - Lazy loading: Only fetch folder contents when expanded
	 * - Search/filter input at top (debounced for performance)
	 * - Highlight currently open file
	 * - Caches loaded folder contents
	 * - Keyboard shortcuts: F2 (rename), Delete (delete)
	 * - Performance optimizations for large directories
	 */

	import { onMount, tick } from 'svelte';
	import FileTreeNode from './FileTreeNode.svelte';
	import FilePathPicker from './FilePathPicker.svelte';
	import type { GitFileStatus } from './types';
	import { setFileChangesCount } from '$lib/stores/drawerStore';
	import { SQUAD_DEFAULTS } from '$lib/config/constants';

	interface DirectoryEntry {
		name: string;
		type: 'file' | 'folder';
		size: number;
		modified: string;
		path: string;
	}

	/** Git status data from the API */
	interface GitStatusResponse {
		ahead: number;
		behind: number;
		current: string | null;
		isClean: boolean;
		staged: string[];
		modified: string[];
		deleted: string[];
		created: string[];
		not_added: string[];
		conflicted: string[];
		renamed: Array<{ from: string; to: string }>;
	}

	interface Props {
		project: string;
		/** Project root path (absolute), passed from parent. Used for display truncation in FilePathPicker. */
		projectPath?: string;
		selectedPath?: string | null;
		onFileSelect: (path: string) => void;
		onFileDelete?: (path: string) => void;
		onFileRename?: (oldPath: string, newPath: string) => void;
		onFileCreate?: (path: string, type: 'file' | 'folder') => void;
		onError?: (message: string) => void;
		onSuccess?: (message: string) => void;
		starredFiles?: Set<string>;
		onToggleStar?: (path: string) => void;
	}

	let {
		project,
		projectPath = '',
		selectedPath = null,
		onFileSelect,
		onFileDelete,
		onFileRename,
		onFileCreate,
		onError,
		onSuccess,
		starredFiles = new Set(),
		onToggleStar
	}: Props = $props();

	// Starred section collapsed state
	let starredCollapsed = $state(false);

	// Drag-and-drop state for file move
	let draggedPath = $state<string | null>(null);

	/**
	 * Get a user-friendly error message for file tree operations
	 */
	function getOperationErrorMessage(error: string, status: number, operation: string, name: string): string {
		if (status === 403) {
			if (error.includes('sensitive')) {
				return `Cannot ${operation} "${name}": This is a protected file.`;
			}
			if (error.includes('traversal')) {
				return `Access denied: Cannot ${operation} files outside the project.`;
			}
			return `Permission denied: ${error}`;
		}
		if (status === 404) {
			return `"${name}" was not found. It may have been moved or deleted.`;
		}
		if (status === 409) {
			return `A file or folder named "${name}" already exists.`;
		}
		if (status === 500) {
			return `Server error while ${operation === 'delete' ? 'deleting' : operation === 'rename' ? 'renaming' : operation === 'move' ? 'moving' : 'creating'} "${name}". Please try again.`;
		}
		// Check for common filesystem errors
		if (error.includes('ENOSPC') || error.includes('no space')) {
			return `Cannot ${operation}: Disk is full.`;
		}
		if (error.includes('ENOTEMPTY')) {
			return `Cannot delete "${name}": Folder is not empty.`;
		}
		if (error.includes('EBUSY')) {
			return `Cannot ${operation} "${name}": File is in use by another process.`;
		}
		if (error.includes('EACCES')) {
			return `Cannot ${operation} "${name}": Permission denied.`;
		}
		return error || `Failed to ${operation} "${name}"`;
	}

	// State
	let rootEntries = $state<DirectoryEntry[]>([]);
	let expandedFolders = $state<Set<string>>(new Set());
	let loadedFolders = $state<Map<string, DirectoryEntry[]>>(new Map());
	let loadingFolders = $state<Set<string>>(new Set());
	let filterTerm = $state('');
	let debouncedFilterTerm = $state(''); // Actual filter applied (debounced)
	let filterDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let isLoadingRoot = $state(true);
	let rootError = $state<string | null>(null);

	// Git status state
	let gitStatusMap = $state<Map<string, GitFileStatus>>(new Map());
	let gitAhead = $state(0);
	let gitBehind = $state(0);
	let gitBranch = $state<string | null>(null);
	let isGitClean = $state(true);

	// Tree change detection state
	let hasTreeChanges = $state(false);
	// Map of folder path → fingerprint (empty string '' for root)
	let knownFingerprints = $state<Map<string, string>>(new Map());
	// Map of folder path → entries (for detailed change comparison)
	let knownEntries = $state<Map<string, DirectoryEntry[]>>(new Map());
	let treeChangePollingInterval: ReturnType<typeof setInterval> | null = null;

	// Detected changes (what specifically changed)
	interface DetectedChange {
		path: string;
		name: string;
		type: 'file' | 'folder';
		changeType: 'added' | 'removed' | 'modified';
	}
	let detectedChanges = $state<DetectedChange[]>([]);

	// Directories to ignore in change detection (internal/build artifacts)
	// Loaded from config API on mount, with fallback to SQUAD_DEFAULTS
	let ignoredChangeDirs = $state<Set<string>>(new Set(SQUAD_DEFAULTS.file_watcher_ignored_dirs));

	/**
	 * Load ignored directories from config API
	 */
	async function loadIgnoredDirsConfig() {
		try {
			const response = await fetch('/api/config/defaults');
			if (response.ok) {
				const data = await response.json();
				const dirs = data.defaults?.file_watcher_ignored_dirs ?? SQUAD_DEFAULTS.file_watcher_ignored_dirs;
				ignoredChangeDirs = new Set(dirs);
			}
		} catch (err) {
			console.debug('[FileTree] Failed to load ignored dirs config, using defaults:', err);
		}
	}

	/**
	 * Check if a path should be ignored in change detection
	 */
	function shouldIgnoreChange(path: string, name: string): boolean {
		// Check if it's a top-level ignored directory
		if (ignoredChangeDirs.has(name)) return true;
		// Check if path starts with an ignored directory
		for (const dir of ignoredChangeDirs) {
			if (path.startsWith(dir + '/') || path.includes('/' + dir + '/')) return true;
		}
		return false;
	}

	/**
	 * Fetch git status for the project and build a path → status map
	 */
	async function fetchGitStatus() {
		try {
			const response = await fetch(`/api/files/git/status?project=${encodeURIComponent(project)}`);
			if (!response.ok) {
				console.debug('[FileTree] Git status not available:', response.status);
				return;
			}

			const data: GitStatusResponse = await response.json();

			// Update git info
			gitAhead = data.ahead || 0;
			gitBehind = data.behind || 0;
			gitBranch = data.current;
			isGitClean = data.isClean;

			// Build path → status map
			const newMap = new Map<string, GitFileStatus>();

			// Staged files (highest priority)
			for (const file of data.staged || []) {
				newMap.set(file, 'staged');
			}

			// Modified (unstaged)
			for (const file of data.modified || []) {
				if (!newMap.has(file)) {
					newMap.set(file, 'modified');
				}
			}

			// Deleted
			for (const file of data.deleted || []) {
				newMap.set(file, 'deleted');
			}

			// Created (new staged files)
			for (const file of data.created || []) {
				if (!newMap.has(file)) {
					newMap.set(file, 'added');
				}
			}

			// Untracked files
			for (const file of data.not_added || []) {
				if (!newMap.has(file)) {
					newMap.set(file, 'untracked');
				}
			}

			// Conflicted
			for (const file of data.conflicted || []) {
				newMap.set(file, 'conflicted');
			}

			// Renamed files
			for (const rename of data.renamed || []) {
				newMap.set(rename.to, 'renamed');
			}

			gitStatusMap = newMap;
		} catch (err) {
			console.debug('[FileTree] Failed to fetch git status:', err);
		}
	}

	/**
	 * Generate a fingerprint of directory entries for change detection
	 * Uses entry names, types, and modification times to detect changes
	 */
	function generateFingerprint(entries: DirectoryEntry[]): string {
		// Sort entries by path for consistent comparison
		const sortedEntries = [...entries].sort((a, b) => a.path.localeCompare(b.path));
		// Create a simple fingerprint from paths and modification times
		return sortedEntries.map(e => `${e.path}:${e.type}:${e.modified || ''}`).join('|');
	}

	/**
	 * Compare old and new entries to find what changed
	 */
	function computeEntryChanges(oldEntries: DirectoryEntry[], newEntries: DirectoryEntry[]): DetectedChange[] {
		const changes: DetectedChange[] = [];
		const oldByPath = new Map(oldEntries.map(e => [e.path, e]));
		const newByPath = new Map(newEntries.map(e => [e.path, e]));

		// Find added entries (in new but not old)
		for (const [path, entry] of newByPath) {
			if (!oldByPath.has(path)) {
				changes.push({
					path: entry.path,
					name: entry.name,
					type: entry.type === 'folder' ? 'folder' : 'file',
					changeType: 'added'
				});
			}
		}

		// Find removed entries (in old but not new)
		for (const [path, entry] of oldByPath) {
			if (!newByPath.has(path)) {
				changes.push({
					path: entry.path,
					name: entry.name,
					type: entry.type === 'folder' ? 'folder' : 'file',
					changeType: 'removed'
				});
			}
		}

		// Find modified entries (same path but different mtime)
		for (const [path, newEntry] of newByPath) {
			const oldEntry = oldByPath.get(path);
			if (oldEntry && oldEntry.modified !== newEntry.modified) {
				changes.push({
					path: newEntry.path,
					name: newEntry.name,
					type: newEntry.type === 'folder' ? 'folder' : 'file',
					changeType: 'modified'
				});
			}
		}

		return changes;
	}

	/**
	 * Check if the file tree has changed on disk
	 * Compares root and all expanded directories against their known entries
	 */
	async function checkForTreeChanges() {
		if (!project || isLoadingRoot) return;

		try {
			const allChanges: DetectedChange[] = [];

			// Check root directory
			const freshRootEntries = await fetchDirectory('');
			const freshRootFingerprint = generateFingerprint(freshRootEntries);
			const knownRootFingerprint = knownFingerprints.get('');
			const knownRootEntries = knownEntries.get('');

			// Only compare if we have known data (skip first check)
			if (knownRootFingerprint && freshRootFingerprint !== knownRootFingerprint && knownRootEntries) {
				const rootChanges = computeEntryChanges(knownRootEntries, freshRootEntries);
				allChanges.push(...rootChanges);
			}

			// Check all expanded subdirectories
			for (const folderPath of expandedFolders) {
				const knownFingerprint = knownFingerprints.get(folderPath);
				const knownFolderEntries = knownEntries.get(folderPath);
				if (!knownFingerprint || !knownFolderEntries) continue;

				try {
					const freshEntries = await fetchDirectory(folderPath);
					const freshFingerprint = generateFingerprint(freshEntries);

					if (freshFingerprint !== knownFingerprint) {
						const folderChanges = computeEntryChanges(knownFolderEntries, freshEntries);
						allChanges.push(...folderChanges);
					}
				} catch {
					// Folder may have been deleted - mark all its entries as removed
					for (const entry of knownFolderEntries) {
						allChanges.push({
							path: entry.path,
							name: entry.name,
							type: entry.type === 'folder' ? 'folder' : 'file',
							changeType: 'removed'
						});
					}
				}
			}

			// Update state if we found changes
			if (allChanges.length > 0) {
				// Deduplicate by path and filter out ignored directories
				const uniqueChanges = Array.from(new Map(allChanges.map(c => [c.path, c])).values())
					.filter(c => !shouldIgnoreChange(c.path, c.name));

				if (uniqueChanges.length > 0) {
					detectedChanges = uniqueChanges;
					hasTreeChanges = true;
				}
			}
		} catch (err) {
			// Silently ignore errors during polling
			console.debug('[FileTree] Tree change check failed:', err);
		}
	}

	/**
	 * Start polling for tree changes
	 */
	function startTreeChangePolling() {
		if (treeChangePollingInterval) return;
		if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

		// Poll every 3 seconds (same as disk change detection for open files)
		treeChangePollingInterval = setInterval(checkForTreeChanges, 3000);
	}

	/**
	 * Stop polling for tree changes
	 */
	function stopTreeChangePolling() {
		if (treeChangePollingInterval) {
			clearInterval(treeChangePollingInterval);
			treeChangePollingInterval = null;
		}
	}

	/**
	 * Handle clicking the "Update" button - refresh the tree
	 * Refreshes root and all expanded subdirectories
	 */
	async function handleTreeUpdate() {
		hasTreeChanges = false;
		detectedChanges = [];
		await loadRoot();

		// Refresh all expanded subdirectories and update their fingerprints/entries
		const newLoaded = new Map(loadedFolders);
		const newFingerprints = new Map(knownFingerprints);
		const newKnownEntries = new Map(knownEntries);

		for (const folderPath of expandedFolders) {
			try {
				const entries = await fetchDirectory(folderPath);
				newLoaded.set(folderPath, entries);
				newFingerprints.set(folderPath, generateFingerprint(entries));
				newKnownEntries.set(folderPath, entries);
			} catch (err) {
				// If folder no longer exists, remove from maps
				console.debug(`[FileTree] Failed to refresh ${folderPath}:`, err);
				newLoaded.delete(folderPath);
				newFingerprints.delete(folderPath);
				newKnownEntries.delete(folderPath);
			}
		}

		loadedFolders = newLoaded;
		knownFingerprints = newFingerprints;
		knownEntries = newKnownEntries;

		// Also refresh git status
		await fetchGitStatus();
	}

	// Debounce filter updates for performance
	$effect(() => {
		const currentFilter = filterTerm;

		if (filterDebounceTimer) {
			clearTimeout(filterDebounceTimer);
		}

		// Apply filter immediately if cleared, otherwise debounce
		if (!currentFilter) {
			debouncedFilterTerm = '';
		} else {
			filterDebounceTimer = setTimeout(() => {
				debouncedFilterTerm = currentFilter;
			}, 150); // 150ms debounce
		}

		return () => {
			if (filterDebounceTimer) {
				clearTimeout(filterDebounceTimer);
			}
		};
	});

	// Sync detected changes count to the global store for sidebar badge
	$effect(() => {
		setFileChangesCount(detectedChanges.length);
	});

	// Rename modal state
	let renameModal = $state<{ path: string; name: string; isFolder: boolean } | null>(null);
	let renameValue = $state('');
	let renameError = $state<string | null>(null);
	let isRenaming = $state(false);

	// Delete modal state
	let deleteModal = $state<{ path: string; name: string; isFolder: boolean } | null>(null);
	let isDeleting = $state(false);
	let deleteError = $state<string | null>(null);

	// Create modal state
	let createModal = $state<{ parentPath: string; type: 'file' | 'folder' } | null>(null);
	let createName = $state('');
	let createError = $state<string | null>(null);
	let isCreating = $state(false);

	// projectPath is now a prop passed from parent (fetched from API, not from filesystem)

	// Context menu state
	let contextMenu = $state<{ x: number; y: number; entry: DirectoryEntry } | null>(null);

	// Filtered root entries (uses debounced filter for performance)
	const filteredRootEntries = $derived(() => {
		if (!debouncedFilterTerm) return rootEntries;
		const lowerFilter = debouncedFilterTerm.toLowerCase();
		return rootEntries.filter(entry => {
			if (entry.name.toLowerCase().includes(lowerFilter)) return true;
			// Include folders that might contain matches
			if (entry.type === 'folder') return true;
			return false;
		});
	});

	// Fetch directory contents
	async function fetchDirectory(path: string = ''): Promise<DirectoryEntry[]> {
		const params = new URLSearchParams({
			project,
			path,
			showHidden: 'true'
		});

		const response = await fetch(`/api/files?${params}`);
		
		if (!response.ok) {
			const data = await response.json();
			throw new Error(data.message || `Failed to load directory: ${response.status}`);
		}

		const data = await response.json();
		return data.entries || [];
	}

	// Load root directory
	async function loadRoot() {
		isLoadingRoot = true;
		rootError = null;

		try {
			rootEntries = await fetchDirectory('');
			// Update fingerprint and entries for change detection (root = '' key)
			const newFingerprints = new Map(knownFingerprints);
			newFingerprints.set('', generateFingerprint(rootEntries));
			knownFingerprints = newFingerprints;
			const newKnownEntries = new Map(knownEntries);
			newKnownEntries.set('', rootEntries);
			knownEntries = newKnownEntries;
			hasTreeChanges = false;
			detectedChanges = [];
		} catch (err) {
			rootError = err instanceof Error ? err.message : 'Failed to load directory';
			console.error('[FileTree] Failed to load root:', err);
		} finally {
			isLoadingRoot = false;
		}
	}

	// Track folders being preloaded (hover prefetch)
	let preloadingFolders = $state<Set<string>>(new Set());
	let preloadTimer: ReturnType<typeof setTimeout> | null = null;

	// Preload folder contents on hover (for faster expand)
	async function preloadFolder(path: string) {
		// Skip if already loaded or currently loading
		if (loadedFolders.has(path) || loadingFolders.has(path) || preloadingFolders.has(path)) {
			return;
		}

		// Mark as preloading
		preloadingFolders = new Set([...preloadingFolders, path]);

		try {
			const entries = await fetchDirectory(path);
			const newLoaded = new Map(loadedFolders);
			newLoaded.set(path, entries);
			loadedFolders = newLoaded;
		} catch (err) {
			// Silently fail preload - will retry on actual expand
			console.debug(`[FileTree] Preload failed for ${path}:`, err);
		} finally {
			const newPreloading = new Set(preloadingFolders);
			newPreloading.delete(path);
			preloadingFolders = newPreloading;
		}
	}

	// Handle folder hover - schedule preload
	function handleFolderHover(path: string) {
		// Cancel any pending preload
		if (preloadTimer) {
			clearTimeout(preloadTimer);
		}

		// Schedule preload after 200ms hover
		preloadTimer = setTimeout(() => {
			preloadFolder(path);
		}, 200);
	}

	// Cancel preload on hover end
	function handleFolderHoverEnd() {
		if (preloadTimer) {
			clearTimeout(preloadTimer);
			preloadTimer = null;
		}
	}

	// Handle file/folder move via drag-and-drop
	async function handleFileMove(sourcePath: string, destinationFolder: string) {
		const fileName = sourcePath.includes('/') ? sourcePath.split('/').pop()! : sourcePath;

		try {
			const params = new URLSearchParams({
				project,
				path: sourcePath
			});

			const response = await fetch(`/api/files/content?${params}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ destination: destinationFolder })
			});

			if (!response.ok) {
				const data = await response.json();
				const errorMsg = getOperationErrorMessage(data.error || '', response.status, 'move', fileName);
				if (onError) onError(errorMsg);
				return;
			}

			const result = await response.json();

			if (onSuccess) {
				onSuccess(`Moved "${fileName}" to ${destinationFolder || 'root'}`);
			}

			// Refresh the source parent folder
			const sourceParent = sourcePath.includes('/')
				? sourcePath.substring(0, sourcePath.lastIndexOf('/'))
				: '';

			if (sourceParent) {
				const entries = await fetchDirectory(sourceParent);
				const newLoaded = new Map(loadedFolders);
				newLoaded.set(sourceParent, entries);
				loadedFolders = newLoaded;
			} else {
				await loadRoot();
			}

			// Refresh the destination folder
			if (destinationFolder) {
				const entries = await fetchDirectory(destinationFolder);
				const newLoaded = new Map(loadedFolders);
				newLoaded.set(destinationFolder, entries);
				loadedFolders = newLoaded;

				// Expand the destination folder if not already
				if (!expandedFolders.has(destinationFolder)) {
					const newExpanded = new Set(expandedFolders);
					newExpanded.add(destinationFolder);
					expandedFolders = newExpanded;
				}
			} else {
				await loadRoot();
			}

			// Update selected path if the moved file was selected
			if (selectedPath === sourcePath && result.newPath) {
				onFileSelect(result.newPath);
			}

			// Refresh git status
			await fetchGitStatus();
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : 'Failed to move file';
			if (onError) onError(errorMsg);
		}
	}

	// Toggle folder expansion
	async function handleToggleFolder(path: string) {
		const newExpanded = new Set(expandedFolders);

		if (newExpanded.has(path)) {
			// Collapse
			newExpanded.delete(path);
			expandedFolders = newExpanded;
		} else {
			// Expand - load contents if not cached
			newExpanded.add(path);
			expandedFolders = newExpanded;

			if (!loadedFolders.has(path)) {
				// Add to loading state
				const newLoading = new Set(loadingFolders);
				newLoading.add(path);
				loadingFolders = newLoading;

				try {
					const entries = await fetchDirectory(path);
					const newLoaded = new Map(loadedFolders);
					newLoaded.set(path, entries);
					loadedFolders = newLoaded;
					// Store fingerprint and entries for change detection
					const newFingerprints = new Map(knownFingerprints);
					newFingerprints.set(path, generateFingerprint(entries));
					knownFingerprints = newFingerprints;
					const newKnownEntries = new Map(knownEntries);
					newKnownEntries.set(path, entries);
					knownEntries = newKnownEntries;
				} catch (err) {
					console.error(`[FileTree] Failed to load folder ${path}:`, err);
					// Remove from expanded on error
					const revertExpanded = new Set(expandedFolders);
					revertExpanded.delete(path);
					expandedFolders = revertExpanded;
				} finally {
					const removeLoading = new Set(loadingFolders);
					removeLoading.delete(path);
					loadingFolders = removeLoading;
				}
			}
		}
	}

	// Handle file selection
	function handleFileSelect(path: string) {
		onFileSelect(path);
	}

	// Clear filter
	function clearFilter() {
		filterTerm = '';
	}

	// Get filename from path
	function getFileName(path: string): string {
		return path.split('/').pop() || path;
	}

	// Find entry by path in the tree
	function findEntryByPath(path: string): DirectoryEntry | null {
		// Check root entries
		const rootEntry = rootEntries.find(e => e.path === path);
		if (rootEntry) return rootEntry;

		// Check loaded folders
		for (const entries of loadedFolders.values()) {
			const entry = entries.find(e => e.path === path);
			if (entry) return entry;
		}
		return null;
	}

	// Open rename modal
	function openRenameModal(path: string) {
		const entry = findEntryByPath(path);
		if (!entry) return;

		renameModal = {
			path,
			name: entry.name,
			isFolder: entry.type === 'folder'
		};
		renameValue = entry.name;
		renameError = null;
	}

	// Close rename modal
	function closeRenameModal() {
		renameModal = null;
		renameValue = '';
		renameError = null;
		isRenaming = false;
	}

	// Perform rename
	async function performRename() {
		if (!renameModal || !renameValue.trim()) return;

		const newName = renameValue.trim();
		const originalName = renameModal.name;
		const isFolder = renameModal.isFolder;

		if (newName === originalName) {
			closeRenameModal();
			return;
		}

		// Validate name
		if (newName.includes('/') || newName.includes('\\')) {
			renameError = 'Name cannot contain / or \\';
			return;
		}

		// Check for invalid characters
		if (/[<>:"|?*\x00-\x1F]/.test(newName)) {
			renameError = 'Name contains invalid characters';
			return;
		}

		isRenaming = true;
		renameError = null;

		try {
			const params = new URLSearchParams({
				project,
				path: renameModal.path
			});

			const response = await fetch(`/api/files/content?${params}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ newName })
			});

			if (!response.ok) {
				const data = await response.json();
				const errorMsg = getOperationErrorMessage(data.error || '', response.status, 'rename', originalName);
				renameError = errorMsg;
				return;
			}

			const result = await response.json();

			// Notify parent of rename
			if (onFileRename) {
				onFileRename(renameModal.path, result.newPath);
			}

			// Success notification
			if (onSuccess) {
				onSuccess(`Renamed "${originalName}" to "${newName}"`);
			}

			// Refresh the parent folder
			const parentPath = renameModal.path.includes('/')
				? renameModal.path.substring(0, renameModal.path.lastIndexOf('/'))
				: '';

			if (parentPath) {
				// Reload parent folder
				const entries = await fetchDirectory(parentPath);
				const newLoaded = new Map(loadedFolders);
				newLoaded.set(parentPath, entries);
				loadedFolders = newLoaded;
			} else {
				// Reload root
				await loadRoot();
			}

			closeRenameModal();
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : 'Failed to rename';
			renameError = errorMsg;
			if (onError) {
				onError(errorMsg);
			}
		} finally {
			isRenaming = false;
		}
	}

	// Open delete modal
	function openDeleteModal(path: string) {
		const entry = findEntryByPath(path);
		if (!entry) return;

		deleteModal = {
			path,
			name: entry.name,
			isFolder: entry.type === 'folder'
		};
		deleteError = null;
	}

	// Close delete modal
	function closeDeleteModal() {
		deleteModal = null;
		deleteError = null;
		isDeleting = false;
	}

	// Perform delete
	async function performDelete() {
		if (!deleteModal) return;

		const name = deleteModal.name;
		const isFolder = deleteModal.isFolder;

		isDeleting = true;
		deleteError = null;

		try {
			const params = new URLSearchParams({
				project,
				path: deleteModal.path
			});

			const response = await fetch(`/api/files/content?${params}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const data = await response.json();
				const errorMsg = getOperationErrorMessage(data.error || '', response.status, 'delete', name);
				deleteError = errorMsg;
				return;
			}

			// Notify parent of delete
			if (onFileDelete) {
				onFileDelete(deleteModal.path);
			}

			// Success notification
			if (onSuccess) {
				onSuccess(`Deleted ${isFolder ? 'folder' : 'file'} "${name}"`);
			}

			// Refresh the parent folder
			const parentPath = deleteModal.path.includes('/')
				? deleteModal.path.substring(0, deleteModal.path.lastIndexOf('/'))
				: '';

			if (parentPath) {
				// Reload parent folder
				const entries = await fetchDirectory(parentPath);
				const newLoaded = new Map(loadedFolders);
				newLoaded.set(parentPath, entries);
				loadedFolders = newLoaded;
			} else {
				// Reload root
				await loadRoot();
			}

			closeDeleteModal();
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : 'Failed to delete';
			deleteError = errorMsg;
			if (onError) {
				onError(errorMsg);
			}
		} finally {
			isDeleting = false;
		}
	}

	// Handle context menu
	function handleContextMenu(entry: DirectoryEntry, event: MouseEvent) {
		contextMenu = {
			x: event.clientX,
			y: event.clientY,
			entry
		};
	}

	// Close context menu
	function closeContextMenu() {
		contextMenu = null;
	}

	// Open create modal
	function openCreateModal(type: 'file' | 'folder', parentPath: string) {
		createModal = { parentPath, type };
		createName = '';
		createError = null;
		closeContextMenu();
	}

	// Close create modal
	function closeCreateModal() {
		createModal = null;
		createName = '';
		createError = null;
		isCreating = false;
	}

	// Perform create - accepts fullPath and filename from FilePathPicker
	async function performCreate(fullPath?: string, filename?: string) {
		if (!createModal) return;

		// Use provided filename or fall back to createName state
		const name = filename?.trim() || createName.trim();
		if (!name) return;

		const type = createModal.type;

		// Get just the last segment of the name for validation (after all /)
		const lastSegment = name.split('/').pop() || name;

		// Check for invalid characters in the final filename
		if (/[<>:"|?*\x00-\x1F]/.test(lastSegment)) {
			createError = 'Name contains invalid characters';
			return;
		}

		// Check for reserved names (Windows compatibility)
		const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
		if (reservedNames.includes(lastSegment.toUpperCase().split('.')[0])) {
			createError = `"${lastSegment}" is a reserved name`;
			return;
		}

		isCreating = true;
		createError = null;

		try {
			const params = new URLSearchParams({
				project,
				path: createModal.parentPath,
				name,
				type
			});

			const response = await fetch(`/api/files/content?${params}`, {
				method: 'POST'
			});

			if (!response.ok) {
				const data = await response.json();
				const errorMsg = getOperationErrorMessage(data.error || '', response.status, 'create', lastSegment);
				createError = errorMsg;
				return;
			}

			const result = await response.json();

			// Notify parent of creation
			if (onFileCreate) {
				onFileCreate(result.path, type);
			}

			// Success notification
			if (onSuccess) {
				onSuccess(`Created ${type === 'folder' ? 'folder' : 'file'} "${lastSegment}"`);
			}

			// Refresh the parent folder - use the actual parent from result.path
			const actualParentPath = result.path.includes('/')
				? result.path.substring(0, result.path.lastIndexOf('/'))
				: '';

			if (actualParentPath) {
				// Reload parent folder
				const entries = await fetchDirectory(actualParentPath);
				const newLoaded = new Map(loadedFolders);
				newLoaded.set(actualParentPath, entries);
				loadedFolders = newLoaded;

				// Expand the parent folder if not already
				if (!expandedFolders.has(actualParentPath)) {
					const newExpanded = new Set(expandedFolders);
					newExpanded.add(actualParentPath);
					expandedFolders = newExpanded;
				}
			} else {
				// Reload root
				await loadRoot();
			}

			// Also refresh intermediate directories if subdirs were created
			if (name.includes('/')) {
				const nameParts = name.split('/');
				let currentPath = createModal.parentPath;
				for (let i = 0; i < nameParts.length - 1; i++) {
					currentPath = currentPath ? `${currentPath}/${nameParts[i]}` : nameParts[i];
					if (!loadedFolders.has(currentPath)) {
						try {
							const entries = await fetchDirectory(currentPath);
							const newLoaded = new Map(loadedFolders);
							newLoaded.set(currentPath, entries);
							loadedFolders = newLoaded;
							// Also expand it
							const newExpanded = new Set(expandedFolders);
							newExpanded.add(currentPath);
							expandedFolders = newExpanded;
						} catch {
							// Ignore errors loading intermediate directories
						}
					}
				}
			}

			// Select the new file/folder
			if (type === 'file') {
				onFileSelect(result.path);
			}

			closeCreateModal();
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : 'Failed to create';
			createError = errorMsg;
			if (onError) {
				onError(errorMsg);
			}
		} finally {
			isCreating = false;
		}
	}

	// Copy path to clipboard
	async function copyPathToClipboard(path: string) {
		try {
			await navigator.clipboard.writeText(path);
			if (onSuccess) {
				onSuccess(`Copied path: ${path}`);
			}
		} catch (err) {
			if (onError) {
				onError('Failed to copy path to clipboard');
			}
		}
	}

	// Handle keyboard shortcuts
	function handleKeyDown(e: KeyboardEvent) {
		// Don't handle if we're in an input field
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
			return;
		}

		// F2 or R - Rename selected file
		if ((e.key === 'F2' || e.key.toLowerCase() === 'r') && selectedPath) {
			e.preventDefault();
			openRenameModal(selectedPath);
		}

		// Delete or D - Delete selected file
		if ((e.key === 'Delete' || e.key.toLowerCase() === 'd') && selectedPath) {
			e.preventDefault();
			openDeleteModal(selectedPath);
		}

		// C - Copy path to clipboard
		if (e.key.toLowerCase() === 'c' && selectedPath) {
			e.preventDefault();
			copyPathToClipboard(selectedPath);
		}

		// F - New file (in selected folder or root)
		if (e.key.toLowerCase() === 'f') {
			e.preventDefault();
			const entry = selectedPath ? findEntryByPath(selectedPath) : null;
			const parentPath = entry?.type === 'folder' ? entry.path : (selectedPath?.includes('/') ? selectedPath.substring(0, selectedPath.lastIndexOf('/')) : '');
			openCreateModal('file', parentPath);
		}

		// O - New folder (in selected folder or root)
		if (e.key.toLowerCase() === 'o') {
			e.preventDefault();
			const entry = selectedPath ? findEntryByPath(selectedPath) : null;
			const parentPath = entry?.type === 'folder' ? entry.path : (selectedPath?.includes('/') ? selectedPath.substring(0, selectedPath.lastIndexOf('/')) : '');
			openCreateModal('folder', parentPath);
		}
	}

	// Close context menu when clicking outside
	function handleGlobalClick() {
		if (contextMenu) {
			closeContextMenu();
		}
	}

	// Reload tree when project changes
	$effect(() => {
		if (project) {
			// Reset state
			expandedFolders = new Set();
			loadedFolders = new Map();
			loadingFolders = new Set();
			filterTerm = '';
			// Reset tree change detection state
			hasTreeChanges = false;
			knownFingerprints = new Map();
			stopTreeChangePolling();
			loadRoot();
		}
	});

	onMount(() => {
		// Load config for ignored directories
		loadIgnoredDirsConfig();

		if (project) {
			loadRoot();
			fetchGitStatus();
			// Start tree change detection polling
			startTreeChangePolling();
		}

		// Handle visibility changes to pause/resume polling
		function handleVisibilityChange() {
			if (document.visibilityState === 'visible') {
				// Resume polling and check immediately
				checkForTreeChanges();
				startTreeChangePolling();
			} else {
				// Pause polling when tab is hidden
				stopTreeChangePolling();
			}
		}

		document.addEventListener('visibilitychange', handleVisibilityChange);

		// Cleanup on unmount
		return () => {
			stopTreeChangePolling();
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});

	// Root drop zone state (for dropping files to project root)
	let isRootDragOver = $state(false);

	function handleRootDragOver(e: DragEvent) {
		if (!draggedPath) return;
		// Only accept if the dragged item is not already at root level
		if (!draggedPath.includes('/')) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		isRootDragOver = true;
	}

	function handleRootDragLeave(e: DragEvent) {
		const relatedTarget = e.relatedTarget as HTMLElement | null;
		const currentTarget = e.currentTarget as HTMLElement;
		if (relatedTarget && currentTarget.contains(relatedTarget)) return;
		isRootDragOver = false;
	}

	function handleRootDrop(e: DragEvent) {
		e.preventDefault();
		isRootDragOver = false;
		if (!e.dataTransfer) return;
		const sourcePath = e.dataTransfer.getData('application/x-filetree-path') || e.dataTransfer.getData('text/plain');
		if (!sourcePath) return;
		// Don't move if already at root level
		if (!sourcePath.includes('/')) return;
		handleFileMove(sourcePath, '');
	}

	// Reference to tree content for scrolling
	let treeContentRef: HTMLDivElement | null = $state(null);

	/**
	 * Get all parent directory paths for a given file path
	 * e.g., "src/lib/utils/foo.ts" → ["src", "src/lib", "src/lib/utils"]
	 */
	function getParentPaths(filePath: string): string[] {
		const parts = filePath.split('/');
		const parents: string[] = [];
		for (let i = 1; i < parts.length; i++) {
			parents.push(parts.slice(0, i).join('/'));
		}
		return parents;
	}

	/**
	 * Expand all parent directories of a file path and scroll to the file
	 * This is useful when navigating to a file from search results or URL params
	 */
	export async function scrollToFile(filePath: string) {
		if (!filePath) return;

		// Get all parent directories that need to be expanded
		const parentPaths = getParentPaths(filePath);

		// Expand each parent directory in sequence (they may need to load)
		for (const parentPath of parentPaths) {
			if (!expandedFolders.has(parentPath)) {
				// Expand this folder (will trigger loading if needed)
				await handleToggleFolder(parentPath);
				// Wait a bit for the DOM to update
				await tick();
			}
		}

		// Wait for any pending loads and DOM updates
		await tick();

		// Small delay to ensure the DOM is fully updated after all expansions
		await new Promise(r => setTimeout(r, 50));

		// Find the element and scroll to it
		if (treeContentRef) {
			const element = treeContentRef.querySelector(`[data-path="${CSS.escape(filePath)}"]`);
			if (element) {
				element.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} onclick={handleGlobalClick} />

<div class="file-tree">
	<!-- Starred Files Section -->
	{#if starredFiles.size > 0}
		<div class="starred-section">
			<button
				class="starred-header"
				onclick={() => starredCollapsed = !starredCollapsed}
				title={starredCollapsed ? 'Expand starred files' : 'Collapse starred files'}
			>
				<svg
					class="starred-chevron"
					class:collapsed={starredCollapsed}
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M6 9l6 6 6-6" />
				</svg>
				<svg class="starred-icon" viewBox="0 0 24 24" fill="currentColor">
					<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
				</svg>
				<span class="starred-title">Starred</span>
				<span class="starred-count">{starredFiles.size}</span>
			</button>
			{#if !starredCollapsed}
				<div class="starred-list">
					{#each [...starredFiles] as filePath}
						{@const fileName = filePath.split('/').pop() || filePath}
						<button
							class="starred-item"
							class:active={selectedPath === filePath}
							onclick={() => onFileSelect(filePath)}
							title={filePath}
						>
							<svg class="starred-item-icon" viewBox="0 0 24 24" fill="currentColor">
								<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
							</svg>
							<span class="starred-item-name">{fileName}</span>
							{#if onToggleStar}
								<button
									class="starred-item-remove"
									onclick={(e) => { e.stopPropagation(); onToggleStar(filePath); }}
									title="Unstar file"
								>
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M18 6L6 18M6 6l12 12" />
									</svg>
								</button>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Search/Filter Input -->
	<div class="filter-container">
		<div class="filter-row">
			<div class="filter-input-wrapper">
				<svg class="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="11" cy="11" r="8" />
					<path d="M21 21l-4.35-4.35" />
				</svg>
				<input
					type="text"
					class="filter-input"
					placeholder="Filter files..."
					bind:value={filterTerm}
				/>
				{#if filterTerm}
					<button class="clear-filter" onclick={clearFilter} title="Clear filter">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M18 6L6 18M6 6l12 12" />
						</svg>
					</button>
				{/if}
			</div>
			<div class="filter-actions">
				<button class="action-btn" title="New File" onclick={() => openCreateModal('file', '')}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
						<path d="M14 2v6h6M12 18v-6M9 15h6" />
					</svg>
				</button>
				<button class="action-btn" title="New Folder" onclick={() => openCreateModal('folder', '')}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
						<path d="M12 11v6M9 14h6" />
					</svg>
				</button>
			</div>
		</div>

		<!-- Tree Changes Indicator -->
		{#if hasTreeChanges}
			<div class="tree-changes-bar">
				<div class="tree-changes-header">
					<span class="tree-changes-text">
						{detectedChanges.length} file{detectedChanges.length === 1 ? '' : 's'} changed
					</span>
					<button
						class="tree-update-btn"
						onclick={handleTreeUpdate}
						title="Refresh file tree"
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="update-icon">
							<path d="M23 4v6h-6" />
							<path d="M1 20v-6h6" />
							<path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
						</svg>
						Update
					</button>
				</div>
				{#if detectedChanges.length > 0}
					<div class="tree-changes-list">
						{#each detectedChanges as change}
							<button
								class="tree-change-item"
								class:change-added={change.changeType === 'added'}
								class:change-removed={change.changeType === 'removed'}
								class:change-modified={change.changeType === 'modified'}
								onclick={() => {
									if (change.changeType !== 'removed' && change.type === 'file') {
										onFileSelect(change.path);
									}
								}}
								disabled={change.changeType === 'removed' || change.type === 'folder'}
								title={change.changeType === 'removed' ? 'File was deleted' : change.type === 'folder' ? 'Folder' : 'Click to open'}
							>
								<span class="change-indicator">
									{#if change.changeType === 'added'}+{:else if change.changeType === 'removed'}−{:else}~{/if}
								</span>
								<span class="change-icon">
									{#if change.type === 'folder'}
										<svg viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5">
											<path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.146V6a3 3 0 013-3h5.379a2.25 2.25 0 011.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 013 3v1.146A4.483 4.483 0 0019.5 9h-15a4.483 4.483 0 00-3 1.146z" />
										</svg>
									{:else}
										<svg viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5">
											<path d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V7.875L14.25 1.5H5.625z" />
											<path d="M14.25 1.5v5.25c0 .621.504 1.125 1.125 1.125h5.25" />
										</svg>
									{/if}
								</span>
								<span class="change-name">{change.name}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Git Status Bar -->
		{#if gitBranch || gitAhead > 0 || gitBehind > 0 || gitStatusMap.size > 0}
			<div class="git-status-bar">
				{#if gitBranch}
					<span class="git-branch" title="Current branch">
						<svg class="branch-icon" viewBox="0 0 16 16" fill="currentColor">
							<path fill-rule="evenodd" d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z" />
						</svg>
						{gitBranch}
					</span>
				{/if}
				{#if gitAhead > 0}
					<span class="git-ahead" title="{gitAhead} commit{gitAhead > 1 ? 's' : ''} to push">
						↑{gitAhead}
					</span>
				{/if}
				{#if gitBehind > 0}
					<span class="git-behind" title="{gitBehind} commit{gitBehind > 1 ? 's' : ''} behind">
						↓{gitBehind}
					</span>
				{/if}
				{#if gitStatusMap.size > 0}
					<span class="git-changes" title="{gitStatusMap.size} file{gitStatusMap.size > 1 ? 's' : ''} changed">
						{gitStatusMap.size} changed
					</span>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Tree Content -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="tree-content"
		class:root-drag-over={isRootDragOver}
		bind:this={treeContentRef}
		ondragover={handleRootDragOver}
		ondragleave={handleRootDragLeave}
		ondrop={handleRootDrop}
	>
		{#if isLoadingRoot}
			<div class="tree-loading">
				<span class="loading-spinner"></span>
				<span class="loading-text">Loading...</span>
			</div>
		{:else if rootError}
			<div class="tree-error">
				<svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10" />
					<path d="M12 8v4M12 16h.01" />
				</svg>
				<span class="error-text">{rootError}</span>
				<button class="retry-button" onclick={loadRoot}>
					Retry
				</button>
			</div>
		{:else if rootEntries.length === 0}
			<div class="tree-empty">
				<span class="empty-text">No files found</span>
			</div>
		{:else}
			<div class="tree-nodes">
				{#each filteredRootEntries() as entry (entry.path)}
					<FileTreeNode
						{entry}
						{project}
						{selectedPath}
						{expandedFolders}
						{loadedFolders}
						{loadingFolders}
						{gitStatusMap}
						depth={0}
						{onFileSelect}
						onToggleFolder={handleToggleFolder}
						onContextMenu={handleContextMenu}
						filterTerm={debouncedFilterTerm}
						onFolderHover={handleFolderHover}
						onFolderHoverEnd={handleFolderHoverEnd}
						onFileMove={handleFileMove}
						{draggedPath}
						onDragStart={(path) => draggedPath = path}
						onDragEnd={() => draggedPath = null}
					/>
				{/each}
			</div>
		{/if}
	</div>
</div>

<!-- Rename Modal -->
{#if renameModal}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={closeRenameModal}>
		<div class="modal-dialog" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h3 class="modal-title">Rename {renameModal.isFolder ? 'Folder' : 'File'}</h3>
				<button class="modal-close" onclick={closeRenameModal} aria-label="Close">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 6L6 18M6 6l12 12" />
					</svg>
				</button>
			</div>
			<div class="modal-body">
				<label class="modal-label">
					<span>New name</span>
					<input
						type="text"
						class="modal-input"
						bind:value={renameValue}
						onkeydown={(e) => {
							if (e.key === 'Enter') performRename();
							if (e.key === 'Escape') closeRenameModal();
						}}
						autofocus
					/>
				</label>
				{#if renameError}
					<div class="modal-error">{renameError}</div>
				{/if}
			</div>
			<div class="modal-footer">
				<button class="modal-btn modal-btn-ghost" onclick={closeRenameModal}>
					Cancel
				</button>
				<button
					class="modal-btn modal-btn-primary"
					onclick={performRename}
					disabled={isRenaming || !renameValue.trim()}
				>
					{isRenaming ? 'Renaming...' : 'Rename'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Delete Confirmation Modal -->
{#if deleteModal}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={closeDeleteModal}>
		<div class="modal-dialog" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<div class="modal-icon modal-icon-danger">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
					</svg>
				</div>
				<h3 class="modal-title">Delete {deleteModal.isFolder ? 'Folder' : 'File'}</h3>
				<button class="modal-close" onclick={closeDeleteModal} aria-label="Close">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 6L6 18M6 6l12 12" />
					</svg>
				</button>
			</div>
			<div class="modal-body">
				<p class="modal-message">
					Are you sure you want to delete <strong>{deleteModal.name}</strong>?
					{#if deleteModal.isFolder}
						<br /><span class="modal-warning">This will delete all contents of the folder.</span>
					{/if}
				</p>
				{#if deleteError}
					<div class="modal-error">{deleteError}</div>
				{/if}
			</div>
			<div class="modal-footer">
				<button class="modal-btn modal-btn-ghost" onclick={closeDeleteModal}>
					Cancel
				</button>
				<button
					class="modal-btn modal-btn-danger"
					onclick={performDelete}
					disabled={isDeleting}
				>
					{isDeleting ? 'Deleting...' : 'Delete'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Context Menu -->
{#if contextMenu}
	<div
		class="context-menu"
		style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
		onclick={(e) => e.stopPropagation()}
	>
		{#if contextMenu.entry.type === 'folder'}
			<button class="context-menu-item" onclick={() => openCreateModal('file', contextMenu!.entry.path)}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
					<path d="M14 2v6h6M12 18v-6M9 15h6" />
				</svg>
				<span>New File</span>
				<span class="context-menu-shortcut">F</span>
			</button>
			<button class="context-menu-item" onclick={() => openCreateModal('folder', contextMenu!.entry.path)}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
					<path d="M12 11v6M9 14h6" />
				</svg>
				<span>New Folder</span>
				<span class="context-menu-shortcut">O</span>
			</button>
			<div class="context-menu-divider"></div>
		{/if}
		<button class="context-menu-item" onclick={() => { openRenameModal(contextMenu!.entry.path); closeContextMenu(); }}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
			</svg>
			<span>Rename</span>
			<span class="context-menu-shortcut">R</span>
		</button>
		{#if contextMenu.entry.type === 'file' && onToggleStar}
			<button
				class="context-menu-item"
				class:context-menu-item-starred={starredFiles.has(contextMenu.entry.path)}
				onclick={() => { onToggleStar(contextMenu!.entry.path); closeContextMenu(); }}
			>
				<svg viewBox="0 0 24 24" fill={starredFiles.has(contextMenu.entry.path) ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2">
					<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
				</svg>
				<span>{starredFiles.has(contextMenu.entry.path) ? 'Unstar' : 'Star'}</span>
			</button>
		{/if}
		<button class="context-menu-item" onclick={() => { copyPathToClipboard(contextMenu!.entry.path); closeContextMenu(); }}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
				<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
			</svg>
			<span>Copy Path</span>
			<span class="context-menu-shortcut">C</span>
		</button>
		<button class="context-menu-item context-menu-item-danger" onclick={() => { openDeleteModal(contextMenu!.entry.path); closeContextMenu(); }}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
			</svg>
			<span>Delete</span>
			<span class="context-menu-shortcut">D</span>
		</button>
	</div>
{/if}

<!-- Create Modal with FilePathPicker -->
{#if createModal}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={closeCreateModal}>
		<div class="modal-dialog modal-dialog-picker" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h3 class="modal-title">New {createModal.type === 'folder' ? 'Folder' : 'File'}</h3>
				<button class="modal-close" onclick={closeCreateModal} aria-label="Close">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 6L6 18M6 6l12 12" />
					</svg>
				</button>
			</div>
			<div class="modal-body modal-body-picker">
				<FilePathPicker
					basePath={createModal.parentPath ? `${projectPath}/${createModal.parentPath}` : projectPath}
					{projectPath}
					{project}
					bind:filename={createName}
					type={createModal.type}
					placeholder={createModal.type === 'folder' ? 'folder-name or path/to/folder' : 'filename.ts or path/to/file.ts'}
					confirmText={isCreating ? 'Creating...' : 'Create'}
					confirmDisabled={isCreating}
					error={createError || ''}
					onConfirm={performCreate}
					onCancel={closeCreateModal}
				/>
			</div>
		</div>
	</div>
{/if}

<style>
	.file-tree {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	/* Starred Files Section */
	.starred-section {
		flex-shrink: 0;
		border-bottom: 1px solid oklch(0.22 0.02 250);
		background: oklch(0.14 0.02 250);
	}

	.starred-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		width: 100%;
		padding: 0.5rem;
		background: none;
		border: none;
		color: oklch(0.75 0.12 85);
		cursor: pointer;
		font-size: 0.75rem;
		font-weight: 500;
		text-align: left;
		transition: background-color 0.15s;
	}

	.starred-header:hover {
		background: oklch(0.18 0.02 250);
	}

	.starred-chevron {
		width: 14px;
		height: 14px;
		transition: transform 0.15s;
		color: oklch(0.55 0.02 250);
	}

	.starred-chevron.collapsed {
		transform: rotate(-90deg);
	}

	.starred-icon {
		width: 14px;
		height: 14px;
		color: oklch(0.75 0.15 85);
	}

	.starred-title {
		flex: 1;
	}

	.starred-count {
		padding: 0.125rem 0.375rem;
		background: oklch(0.75 0.12 85 / 0.15);
		border-radius: 9999px;
		font-size: 0.625rem;
		color: oklch(0.75 0.12 85);
	}

	.starred-list {
		padding: 0.25rem 0.5rem 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.starred-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		width: 100%;
		padding: 0.375rem 0.5rem;
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.22 0.02 250);
		border-radius: 0.25rem;
		color: oklch(0.80 0.02 250);
		cursor: pointer;
		font-size: 0.75rem;
		text-align: left;
		transition: all 0.15s;
	}

	.starred-item:hover {
		background: oklch(0.20 0.02 250);
		border-color: oklch(0.30 0.02 250);
	}

	.starred-item.active {
		background: oklch(0.75 0.12 85 / 0.12);
		border-color: oklch(0.75 0.12 85 / 0.3);
		color: oklch(0.85 0.08 85);
	}

	.starred-item-icon {
		width: 12px;
		height: 12px;
		color: oklch(0.75 0.15 85);
		flex-shrink: 0;
	}

	.starred-item-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.starred-item-remove {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		padding: 0;
		background: none;
		border: none;
		border-radius: 0.25rem;
		color: oklch(0.50 0.02 250);
		cursor: pointer;
		opacity: 0;
		transition: all 0.15s;
	}

	.starred-item:hover .starred-item-remove {
		opacity: 1;
	}

	.starred-item-remove:hover {
		background: oklch(0.65 0.15 30 / 0.2);
		color: oklch(0.70 0.15 30);
	}

	.starred-item-remove svg {
		width: 12px;
		height: 12px;
	}

	/* Filter Input */
	.filter-container {
		padding: 0.5rem;
		border-bottom: 1px solid oklch(0.22 0.02 250);
		flex-shrink: 0;
	}

	.filter-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	/* Git Status Bar */
	.git-status-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.5rem;
		margin-top: 0.375rem;
		background: oklch(0.16 0.02 250);
		border-radius: 0.25rem;
		font-size: 0.6875rem;
		color: oklch(0.65 0.02 250);
	}

	.git-branch {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		color: oklch(0.70 0.08 220);
		font-weight: 500;
	}

	.branch-icon {
		width: 12px;
		height: 12px;
	}

	.git-ahead {
		display: inline-flex;
		align-items: center;
		padding: 0.125rem 0.375rem;
		background: oklch(0.65 0.15 145 / 0.2);
		color: oklch(0.75 0.15 145);
		border-radius: 0.25rem;
		font-weight: 600;
	}

	.git-behind {
		display: inline-flex;
		align-items: center;
		padding: 0.125rem 0.375rem;
		background: oklch(0.65 0.15 25 / 0.2);
		color: oklch(0.75 0.15 25);
		border-radius: 0.25rem;
		font-weight: 600;
	}

	.git-changes {
		display: inline-flex;
		align-items: center;
		padding: 0.125rem 0.375rem;
		background: oklch(0.65 0.15 85 / 0.2);
		color: oklch(0.75 0.15 85);
		border-radius: 0.25rem;
		font-weight: 500;
		margin-left: auto;
	}

	/* Tree Changes Bar */
	.tree-changes-bar {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding: 0.375rem 0.5rem;
		margin-top: 0.375rem;
		background: linear-gradient(180deg, oklch(0.65 0.15 200 / 0.12) 0%, oklch(0.16 0.02 250) 100%);
		border: 1px solid oklch(0.65 0.15 200 / 0.3);
		border-radius: 0.25rem;
		font-size: 0.75rem;
	}

	.tree-changes-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.tree-changes-text {
		color: oklch(0.75 0.12 200);
		font-weight: 500;
	}

	.tree-changes-list {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		max-height: 150px;
		overflow-y: auto;
		padding-right: 0.25rem;
	}

	.tree-change-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.375rem;
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 0.25rem;
		cursor: pointer;
		text-align: left;
		transition: all 0.15s ease;
	}

	.tree-change-item:hover:not(:disabled) {
		background: oklch(0.22 0.02 250);
		border-color: oklch(0.35 0.02 250);
	}

	.tree-change-item:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.change-indicator {
		font-family: monospace;
		font-weight: 700;
		font-size: 0.8125rem;
		width: 1rem;
		text-align: center;
	}

	.change-added .change-indicator {
		color: oklch(0.70 0.18 145);
	}

	.change-removed .change-indicator {
		color: oklch(0.70 0.18 25);
	}

	.change-modified .change-indicator {
		color: oklch(0.75 0.15 85);
	}

	.change-icon {
		display: flex;
		align-items: center;
		opacity: 0.6;
	}

	.change-icon svg {
		width: 14px;
		height: 14px;
	}

	.change-added .change-icon {
		color: oklch(0.60 0.15 145);
	}

	.change-removed .change-icon {
		color: oklch(0.60 0.15 25);
	}

	.change-modified .change-icon {
		color: oklch(0.65 0.12 85);
	}

	.change-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: oklch(0.70 0.02 250);
		font-size: 0.6875rem;
	}

	.change-added .change-name {
		color: oklch(0.75 0.12 145);
	}

	.change-removed .change-name {
		color: oklch(0.65 0.12 25);
		text-decoration: line-through;
	}

	.change-modified .change-name {
		color: oklch(0.80 0.10 85);
	}

	.tree-update-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem;
		background: oklch(0.65 0.15 200 / 0.2);
		color: oklch(0.85 0.12 200);
		border: 1px solid oklch(0.65 0.15 200 / 0.4);
		border-radius: 0.25rem;
		cursor: pointer;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.025em;
		transition: all 0.15s ease;
	}

	.tree-update-btn:hover {
		background: oklch(0.65 0.15 200 / 0.35);
		border-color: oklch(0.65 0.15 200 / 0.6);
	}

	.tree-update-btn .update-icon {
		width: 12px;
		height: 12px;
	}

	.filter-actions {
		display: flex;
		gap: 0.25rem;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: 1px solid oklch(0.25 0.02 250);
		background: oklch(0.18 0.02 250);
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.action-btn:hover {
		background: oklch(0.25 0.02 250);
		border-color: oklch(0.35 0.02 250);
	}

	.action-btn svg {
		width: 14px;
		height: 14px;
		color: oklch(0.60 0.02 250);
	}

	.action-btn:hover svg {
		color: oklch(0.75 0.02 250);
	}

	.filter-input-wrapper {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 0.375rem;
		padding: 0.375rem 0.5rem;
		transition: border-color 0.15s ease;
	}

	.filter-input-wrapper:focus-within {
		border-color: oklch(0.65 0.12 220);
	}

	.filter-icon {
		width: 14px;
		height: 14px;
		color: oklch(0.50 0.02 250);
		flex-shrink: 0;
	}

	.filter-input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		font-size: 0.8125rem;
		color: oklch(0.80 0.02 250);
	}

	.filter-input::placeholder {
		color: oklch(0.45 0.02 250);
	}

	.clear-filter {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		padding: 0;
		border: none;
		background: transparent;
		cursor: pointer;
		opacity: 0.5;
		transition: opacity 0.15s ease;
	}

	.clear-filter:hover {
		opacity: 1;
	}

	.clear-filter svg {
		width: 12px;
		height: 12px;
		color: oklch(0.60 0.02 250);
	}

	/* Tree Content */
	.tree-content {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 0.25rem;
	}

	.tree-content.root-drag-over {
		background: oklch(0.55 0.15 220 / 0.08);
		outline: 2px dashed oklch(0.55 0.15 220 / 0.4);
		outline-offset: -2px;
	}

	.tree-nodes {
		padding-bottom: 0.5rem;
	}

	/* Loading State */
	.tree-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		gap: 0.75rem;
	}

	.loading-spinner {
		width: 20px;
		height: 20px;
		border: 2px solid oklch(0.30 0.02 250);
		border-top-color: oklch(0.65 0.12 220);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	.loading-text {
		font-size: 0.75rem;
		color: oklch(0.50 0.02 250);
	}

	/* Error State */
	.tree-error {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		gap: 0.5rem;
		text-align: center;
	}

	.error-icon {
		width: 24px;
		height: 24px;
		color: oklch(0.60 0.12 30);
	}

	.error-text {
		font-size: 0.75rem;
		color: oklch(0.55 0.08 30);
		max-width: 200px;
	}

	.retry-button {
		margin-top: 0.5rem;
		padding: 0.375rem 0.75rem;
		font-size: 0.75rem;
		color: oklch(0.80 0.02 250);
		background: oklch(0.22 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 0.25rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.retry-button:hover {
		background: oklch(0.25 0.02 250);
		border-color: oklch(0.35 0.02 250);
	}

	/* Empty State */
	.tree-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}

	.empty-text {
		font-size: 0.75rem;
		color: oklch(0.45 0.02 250);
	}

	/* Modal Styles */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: oklch(0.08 0.01 250 / 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		animation: fadeIn 0.15s ease;
	}

	/* Uses global @keyframes fadeIn from app.css */

	.modal-dialog {
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.75rem;
		padding: 1.25rem;
		min-width: 320px;
		max-width: 400px;
		width: 90%;
		box-shadow: 0 25px 60px oklch(0.05 0 0 / 0.6);
		animation: slideUp 0.2s ease;
	}

	/* Uses global @keyframes slideUp from app.css */

	.modal-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.modal-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 0.5rem;
		flex-shrink: 0;
	}

	.modal-icon svg {
		width: 20px;
		height: 20px;
	}

	.modal-icon-danger {
		background: oklch(0.55 0.15 30 / 0.2);
		color: oklch(0.70 0.18 30);
	}

	.modal-title {
		font-size: 1rem;
		font-weight: 600;
		color: oklch(0.92 0.02 250);
		margin: 0;
		flex: 1;
	}

	.modal-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: none;
		background: transparent;
		border-radius: 0.375rem;
		cursor: pointer;
		opacity: 0.5;
		transition: all 0.15s ease;
	}

	.modal-close:hover {
		opacity: 1;
		background: oklch(0.25 0.02 250);
	}

	.modal-close svg {
		width: 16px;
		height: 16px;
		color: oklch(0.60 0.02 250);
	}

	.modal-body {
		margin-bottom: 1.25rem;
	}

	.modal-label {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.modal-label span {
		font-size: 0.8125rem;
		color: oklch(0.65 0.02 250);
	}

	.modal-input {
		padding: 0.5rem 0.75rem;
		background: oklch(0.14 0.01 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.375rem;
		color: oklch(0.90 0.02 250);
		font-size: 0.875rem;
		outline: none;
		transition: border-color 0.15s ease;
	}

	.modal-input:focus {
		border-color: oklch(0.65 0.12 220);
	}

	.modal-message {
		font-size: 0.875rem;
		color: oklch(0.70 0.02 250);
		line-height: 1.5;
		margin: 0;
	}

	.modal-message strong {
		color: oklch(0.90 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.modal-warning {
		color: oklch(0.65 0.15 45);
		font-size: 0.8125rem;
	}

	.modal-error {
		margin-top: 0.75rem;
		padding: 0.5rem 0.75rem;
		background: oklch(0.50 0.12 30 / 0.15);
		border: 1px solid oklch(0.55 0.15 30 / 0.3);
		border-radius: 0.375rem;
		color: oklch(0.70 0.15 30);
		font-size: 0.8125rem;
	}

	.modal-footer {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	.modal-btn {
		padding: 0.5rem 1rem;
		font-size: 0.8125rem;
		font-weight: 500;
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.15s ease;
		border: none;
	}

	.modal-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.modal-btn-ghost {
		background: transparent;
		color: oklch(0.70 0.02 250);
	}

	.modal-btn-ghost:hover:not(:disabled) {
		background: oklch(0.22 0.02 250);
	}

	.modal-btn-primary {
		background: oklch(0.55 0.15 220);
		color: oklch(0.98 0.01 220);
	}

	.modal-btn-primary:hover:not(:disabled) {
		background: oklch(0.60 0.15 220);
	}

	.modal-btn-danger {
		background: oklch(0.55 0.15 30);
		color: oklch(0.98 0.01 30);
	}

	.modal-btn-danger:hover:not(:disabled) {
		background: oklch(0.60 0.18 30);
	}

	/* Context Menu */
	.context-menu {
		position: fixed;
		z-index: 100;
		min-width: 160px;
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.5rem;
		padding: 0.375rem;
		box-shadow: 0 10px 30px oklch(0.05 0 0 / 0.5);
		animation: contextMenuIn 0.1s ease;
	}

	@keyframes contextMenuIn {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	.context-menu-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: none;
		background: transparent;
		color: oklch(0.80 0.02 250);
		font-size: 0.8125rem;
		text-align: left;
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.1s ease;
	}

	.context-menu-item:hover {
		background: oklch(0.25 0.02 250);
	}

	.context-menu-item svg {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
		color: oklch(0.60 0.02 250);
	}

	.context-menu-item:hover svg {
		color: oklch(0.75 0.02 250);
	}

	.context-menu-item-danger:hover {
		background: oklch(0.55 0.15 30 / 0.2);
		color: oklch(0.75 0.18 30);
	}

	.context-menu-item-danger:hover svg {
		color: oklch(0.70 0.18 30);
	}

	.context-menu-item-starred {
		color: oklch(0.75 0.12 85);
	}

	.context-menu-item-starred svg {
		color: oklch(0.75 0.15 85);
	}

	.context-menu-item-starred:hover {
		background: oklch(0.75 0.12 85 / 0.2);
		color: oklch(0.80 0.15 85);
	}

	.context-menu-item-starred:hover svg {
		color: oklch(0.80 0.18 85);
	}

	.context-menu-divider {
		height: 1px;
		background: oklch(0.28 0.02 250);
		margin: 0.375rem 0;
	}

	.context-menu-shortcut {
		margin-left: auto;
		font-size: 0.6875rem;
		color: oklch(0.50 0.02 250);
		font-family: ui-monospace, monospace;
		padding: 0.125rem 0.25rem;
		background: oklch(0.22 0.02 250);
		border-radius: 0.25rem;
	}

	/* Create modal path display */
	.modal-path {
		margin-top: 0.5rem;
		padding: 0.375rem 0.5rem;
		background: oklch(0.14 0.01 250);
		border-radius: 0.25rem;
		font-size: 0.75rem;
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.path-label {
		color: oklch(0.55 0.02 250);
	}

	/* FilePathPicker modal adjustments */
	.modal-dialog-picker {
		min-width: 380px;
		max-width: 450px;
	}

	.modal-body-picker {
		margin-bottom: 0;
	}

	/* Override FilePathPicker container in modal context */
	.modal-body-picker :global(.file-path-picker) {
		background: transparent;
		border: none;
		padding: 0;
	}
</style>
