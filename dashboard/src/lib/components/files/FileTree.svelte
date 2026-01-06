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

	interface DirectoryEntry {
		name: string;
		type: 'file' | 'folder';
		size: number;
		modified: string;
		path: string;
	}

	interface Props {
		project: string;
		selectedPath?: string | null;
		onFileSelect: (path: string) => void;
		onFileDelete?: (path: string) => void;
		onFileRename?: (oldPath: string, newPath: string) => void;
		onFileCreate?: (path: string, type: 'file' | 'folder') => void;
		onError?: (message: string) => void;
		onSuccess?: (message: string) => void;
	}

	let {
		project,
		selectedPath = null,
		onFileSelect,
		onFileDelete,
		onFileRename,
		onFileCreate,
		onError,
		onSuccess
	}: Props = $props();

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
			return `Server error while ${operation === 'delete' ? 'deleting' : operation === 'rename' ? 'renaming' : 'creating'} "${name}". Please try again.`;
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

	// Perform create
	async function performCreate() {
		if (!createModal || !createName.trim()) return;

		const name = createName.trim();
		const type = createModal.type;

		// Validate name
		if (name.includes('/') || name.includes('\\')) {
			createError = 'Name cannot contain / or \\';
			return;
		}

		// Check for invalid characters
		if (/[<>:"|?*\x00-\x1F]/.test(name)) {
			createError = 'Name contains invalid characters';
			return;
		}

		// Check for reserved names (Windows compatibility)
		const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
		if (reservedNames.includes(name.toUpperCase().split('.')[0])) {
			createError = `"${name}" is a reserved name`;
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
				const errorMsg = getOperationErrorMessage(data.error || '', response.status, 'create', name);
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
				onSuccess(`Created ${type === 'folder' ? 'folder' : 'file'} "${name}"`);
			}

			// Refresh the parent folder
			const parentPath = createModal.parentPath;

			if (parentPath) {
				// Reload parent folder
				const entries = await fetchDirectory(parentPath);
				const newLoaded = new Map(loadedFolders);
				newLoaded.set(parentPath, entries);
				loadedFolders = newLoaded;

				// Expand the parent folder if not already
				if (!expandedFolders.has(parentPath)) {
					const newExpanded = new Set(expandedFolders);
					newExpanded.add(parentPath);
					expandedFolders = newExpanded;
				}
			} else {
				// Reload root
				await loadRoot();
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

	// Handle keyboard shortcuts
	function handleKeyDown(e: KeyboardEvent) {
		// Don't handle if we're in an input field
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
			return;
		}

		// F2 - Rename selected file
		if (e.key === 'F2' && selectedPath) {
			e.preventDefault();
			openRenameModal(selectedPath);
		}

		// Delete - Delete selected file
		if (e.key === 'Delete' && selectedPath) {
			e.preventDefault();
			openDeleteModal(selectedPath);
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
			loadRoot();
		}
	});

	onMount(() => {
		if (project) {
			loadRoot();
		}
	});

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
	</div>

	<!-- Tree Content -->
	<div class="tree-content" bind:this={treeContentRef}>
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
						depth={0}
						{onFileSelect}
						onToggleFolder={handleToggleFolder}
						onContextMenu={handleContextMenu}
						filterTerm={debouncedFilterTerm}
						onFolderHover={handleFolderHover}
						onFolderHoverEnd={handleFolderHoverEnd}
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
			</button>
			<button class="context-menu-item" onclick={() => openCreateModal('folder', contextMenu!.entry.path)}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
					<path d="M12 11v6M9 14h6" />
				</svg>
				<span>New Folder</span>
			</button>
			<div class="context-menu-divider"></div>
		{/if}
		<button class="context-menu-item" onclick={() => { openRenameModal(contextMenu!.entry.path); closeContextMenu(); }}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
			</svg>
			<span>Rename</span>
		</button>
		<button class="context-menu-item context-menu-item-danger" onclick={() => { openDeleteModal(contextMenu!.entry.path); closeContextMenu(); }}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
			</svg>
			<span>Delete</span>
		</button>
	</div>
{/if}

<!-- Create Modal -->
{#if createModal}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={closeCreateModal}>
		<div class="modal-dialog" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h3 class="modal-title">New {createModal.type === 'folder' ? 'Folder' : 'File'}</h3>
				<button class="modal-close" onclick={closeCreateModal} aria-label="Close">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 6L6 18M6 6l12 12" />
					</svg>
				</button>
			</div>
			<div class="modal-body">
				<label class="modal-label">
					<span>Name</span>
					<input
						type="text"
						class="modal-input"
						bind:value={createName}
						onkeydown={(e) => {
							if (e.key === 'Enter') performCreate();
							if (e.key === 'Escape') closeCreateModal();
						}}
						placeholder={createModal.type === 'folder' ? 'folder-name' : 'filename.ts'}
						autofocus
					/>
				</label>
				{#if createModal.parentPath}
					<div class="modal-path">
						<span class="path-label">In:</span>
						<span class="path-value">{createModal.parentPath}/</span>
					</div>
				{/if}
				{#if createError}
					<div class="modal-error">{createError}</div>
				{/if}
			</div>
			<div class="modal-footer">
				<button class="modal-btn modal-btn-ghost" onclick={closeCreateModal}>
					Cancel
				</button>
				<button
					class="modal-btn modal-btn-primary"
					onclick={performCreate}
					disabled={isCreating || !createName.trim()}
				>
					{isCreating ? 'Creating...' : 'Create'}
				</button>
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

	@keyframes spin {
		to { transform: rotate(360deg); }
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

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

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

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

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

	.context-menu-divider {
		height: 1px;
		background: oklch(0.28 0.02 250);
		margin: 0.375rem 0;
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

	.path-value {
		color: oklch(0.70 0.02 250);
		font-family: ui-monospace, monospace;
	}
</style>
