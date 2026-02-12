<script lang="ts">
	/**
	 * FileTreeNode - Recursive component for folder/file nodes
	 *
	 * Features:
	 * - Click folder → toggle expand/collapse
	 * - Click file → emit onFileSelect(path)
	 * - Loading spinner while fetching folder contents
	 * - File type icons based on extension
	 * - Performance: "Show more" for large directories (100+ items)
	 */

	import { slide } from 'svelte/transition';
	import { GIT_STATUS_VISUALS, type GitFileStatus } from './types';
	import FileTreeNode from './FileTreeNode.svelte';

	interface DirectoryEntry {
		name: string;
		type: 'file' | 'folder';
		size: number;
		modified: string;
		path: string;
	}

	interface Props {
		entry: DirectoryEntry;
		project: string;
		selectedPath: string | null;
		expandedFolders: Set<string>;
		loadedFolders: Map<string, DirectoryEntry[]>;
		loadingFolders: Set<string>;
		gitStatusMap?: Map<string, GitFileStatus>;
		depth?: number;
		onFileSelect: (path: string) => void;
		onToggleFolder: (path: string) => void;
		onContextMenu?: (entry: DirectoryEntry, event: MouseEvent) => void;
		filterTerm?: string;
		onFolderHover?: (path: string) => void;
		onFolderHoverEnd?: () => void;
		onFileMove?: (sourcePath: string, destinationFolder: string) => void;
		draggedPath?: string | null;
		onDragStart?: (path: string) => void;
		onDragEnd?: () => void;
	}

	// Performance: Limit initial children shown for large folders
	const INITIAL_VISIBLE_LIMIT = 100;
	const LOAD_MORE_INCREMENT = 100;

	let {
		entry,
		project,
		selectedPath,
		expandedFolders,
		loadedFolders,
		loadingFolders,
		gitStatusMap = new Map(),
		depth = 0,
		onFileSelect,
		onToggleFolder,
		onContextMenu,
		filterTerm = '',
		onFolderHover,
		onFolderHoverEnd,
		onFileMove,
		draggedPath = null,
		onDragStart,
		onDragEnd
	}: Props = $props();

	// Get git status for this entry
	const gitStatus = $derived(gitStatusMap.get(entry.path));
	const gitVisuals = $derived(gitStatus ? GIT_STATUS_VISUALS[gitStatus] : null);

	// Track how many children to show (for large folders)
	let visibleChildCount = $state(INITIAL_VISIBLE_LIMIT);

	// Computed states
	const isFolder = $derived(entry.type === 'folder');
	const isExpanded = $derived(expandedFolders.has(entry.path));
	const isLoading = $derived(loadingFolders.has(entry.path));
	const isSelected = $derived(selectedPath === entry.path);
	const isActiveFolder = $derived(isFolder && selectedPath !== null && selectedPath.startsWith(entry.path + '/') && !selectedPath.slice(entry.path.length + 1).includes('/'));
	const children = $derived(loadedFolders.get(entry.path) || []);

	// Filter children based on filter term
	const filteredChildren = $derived(() => {
		let result = children;

		// Apply filter if present
		if (filterTerm) {
			const lowerFilter = filterTerm.toLowerCase();
			result = result.filter(child => {
				// Include if name matches
				if (child.name.toLowerCase().includes(lowerFilter)) return true;
				// Include folders that might have matching children (we check at render time)
				if (child.type === 'folder') return true;
				return false;
			});
		}

		return result;
	});

	// Visible children (with limit applied for performance)
	const visibleChildren = $derived(() => {
		const all = filteredChildren();
		return all.slice(0, visibleChildCount);
	});

	// Check if there are more children to show
	const hasMoreChildren = $derived(() => {
		return filteredChildren().length > visibleChildCount;
	});

	// Remaining count
	const remainingCount = $derived(() => {
		return filteredChildren().length - visibleChildCount;
	});

	// Reset visible count when folder changes or filter changes
	$effect(() => {
		// When entry path or filter changes, reset to initial limit
		const _ = entry.path;
		const __ = filterTerm;
		visibleChildCount = INITIAL_VISIBLE_LIMIT;
	});

	// Show more children
	function showMoreChildren() {
		visibleChildCount += LOAD_MORE_INCREMENT;
	}

	// Get file icon based on extension
	function getFileIcon(filename: string): string {
		const ext = filename.split('.').pop()?.toLowerCase() || '';
		const name = filename.toLowerCase();

		// Special files
		if (name === 'package.json') return '📦';
		if (name === 'tsconfig.json') return '⚙️';
		if (name === '.gitignore') return '🙈';
		if (name === 'readme.md') return '📖';
		if (name === 'claude.md') return '🤖';
		if (name === 'dockerfile') return '🐳';
		if (name === 'license' || name === 'license.md') return '📜';
		if (name.startsWith('.env')) return '🔐';

		// By extension
		const iconMap: Record<string, string> = {
			// TypeScript/JavaScript
			ts: '🔷',
			tsx: '⚛️',
			js: '🟨',
			jsx: '⚛️',
			mjs: '🟨',
			cjs: '🟨',
			// Web
			svelte: '🔶',
			vue: '💚',
			html: '🌐',
			css: '🎨',
			scss: '🎨',
			less: '🎨',
			// Data
			json: '📋',
			yaml: '📋',
			yml: '📋',
			toml: '📋',
			xml: '📋',
			// Docs
			md: '📝',
			mdx: '📝',
			txt: '📄',
			// Shell
			sh: '🐚',
			bash: '🐚',
			zsh: '🐚',
			fish: '🐚',
			// Languages
			py: '🐍',
			go: '🐹',
			rs: '🦀',
			rb: '💎',
			php: '🐘',
			java: '☕',
			kt: '🎯',
			swift: '🧡',
			c: '🔧',
			cpp: '🔧',
			h: '🔧',
			// Config
			lock: '🔒',
			gitignore: '🙈',
			// Images
			png: '🖼️',
			jpg: '🖼️',
			jpeg: '🖼️',
			gif: '🖼️',
			svg: '🎨',
			ico: '🖼️',
			webp: '🖼️',
			// Other
			sql: '🗃️',
			db: '🗃️',
			log: '📃',
			env: '🔐'
		};

		return iconMap[ext] || '📄';
	}

	function handleClick() {
		if (isFolder) {
			onToggleFolder(entry.path);
		} else {
			onFileSelect(entry.path);
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handleClick();
		}
	}

	function handleContextMenu(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (onContextMenu) {
			onContextMenu(entry, e);
		}
	}

	// Handle folder hover for preloading
	function handleMouseEnter() {
		if (isFolder && !isExpanded && onFolderHover) {
			onFolderHover(entry.path);
		}
	}

	function handleMouseLeave() {
		if (isFolder && onFolderHoverEnd) {
			onFolderHoverEnd();
		}
	}

	// Drag-and-drop state
	let isDragOver = $state(false);

	// Is this node the one being dragged?
	const isBeingDragged = $derived(draggedPath === entry.path);

	// Can this folder accept a drop? (is a folder, not the source or its parent)
	function canAcceptDrop(sourcePath: string): boolean {
		if (!isFolder) return false;
		// Can't drop onto itself
		if (entry.path === sourcePath) return false;
		// Can't drop into its own parent (same location = no-op)
		const sourceParent = sourcePath.includes('/') ? sourcePath.substring(0, sourcePath.lastIndexOf('/')) : '';
		if (entry.path === sourceParent) return false;
		// Can't drop a folder into itself or a subfolder of itself
		if (entry.path.startsWith(sourcePath + '/')) return false;
		return true;
	}

	function handleDragStart(e: DragEvent) {
		if (!e.dataTransfer) return;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', entry.path);
		e.dataTransfer.setData('application/x-filetree-path', entry.path);
		if (onDragStart) onDragStart(entry.path);
	}

	function handleDragEnd() {
		isDragOver = false;
		if (onDragEnd) onDragEnd();
	}

	function handleDragOver(e: DragEvent) {
		if (!e.dataTransfer) return;
		const sourcePath = draggedPath;
		if (!sourcePath || !canAcceptDrop(sourcePath)) return;
		e.preventDefault();
		e.stopPropagation();
		e.dataTransfer.dropEffect = 'move';
		isDragOver = true;
	}

	function handleDragEnter(e: DragEvent) {
		if (!e.dataTransfer) return;
		const sourcePath = draggedPath;
		if (!sourcePath || !canAcceptDrop(sourcePath)) return;
		e.preventDefault();
		isDragOver = true;
	}

	function handleDragLeave(e: DragEvent) {
		// Only clear if leaving the node itself, not entering a child
		const relatedTarget = e.relatedTarget as HTMLElement | null;
		const currentTarget = e.currentTarget as HTMLElement;
		if (relatedTarget && currentTarget.contains(relatedTarget)) return;
		isDragOver = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragOver = false;
		if (!e.dataTransfer) return;
		const sourcePath = e.dataTransfer.getData('application/x-filetree-path') || e.dataTransfer.getData('text/plain');
		if (!sourcePath || !canAcceptDrop(sourcePath)) return;
		if (onFileMove) onFileMove(sourcePath, entry.path);
	}
</script>

<div class="tree-node" style="--depth: {depth};">
	<!-- Node row -->
	<button
		class="node-row"
		class:folder={isFolder}
		class:file={!isFolder}
		class:expanded={isExpanded}
		class:selected={isSelected}
		class:active-folder={isActiveFolder}
		class:loading={isLoading}
		class:drag-over={isDragOver}
		class:being-dragged={isBeingDragged}
		draggable="true"
		onclick={handleClick}
		onkeydown={handleKeyDown}
		oncontextmenu={handleContextMenu}
		onmouseenter={handleMouseEnter}
		onmouseleave={handleMouseLeave}
		ondragstart={handleDragStart}
		ondragend={handleDragEnd}
		ondragover={handleDragOver}
		ondragenter={handleDragEnter}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
		title={entry.path}
		aria-expanded={isFolder ? isExpanded : undefined}
		data-path={entry.path}
	>
		<!-- Indentation -->
		<span class="indent" style="width: {depth * 16}px"></span>

		<!-- Expand arrow for folders -->
		{#if isFolder}
			<span class="arrow" class:expanded={isExpanded}>
				{#if isLoading}
					<span class="loading-spinner"></span>
				{:else}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M9 18l6-6-6-6" />
					</svg>
				{/if}
			</span>
		{:else}
			<span class="arrow-placeholder"></span>
		{/if}

		<!-- Icon -->
		<span class="icon">
			{#if isFolder}
				{isExpanded ? '📂' : '📁'}
			{:else}
				{getFileIcon(entry.name)}
			{/if}
		</span>

		<!-- Name -->
		<span class="name" class:highlighted={filterTerm && entry.name.toLowerCase().includes(filterTerm.toLowerCase())}>
			{entry.name}
		</span>

		<!-- Git status indicator -->
		{#if gitVisuals}
			<span
				class="git-status-badge"
				style="color: {gitVisuals.color}; border-color: {gitVisuals.color};"
				title="{gitVisuals.label}: {entry.name}"
			>
				{gitVisuals.letter}
			</span>
		{/if}
	</button>

	<!-- Children (if folder is expanded) -->
	{#if isFolder && isExpanded && children.length > 0}
		<div class="children" transition:slide={{ duration: 150 }}>
			{#each visibleChildren() as child (child.path)}
				<FileTreeNode
					entry={child}
					{project}
					{selectedPath}
					{expandedFolders}
					{loadedFolders}
					{loadingFolders}
					{gitStatusMap}
					depth={depth + 1}
					{onFileSelect}
					{onToggleFolder}
					{onContextMenu}
					{filterTerm}
					{onFolderHover}
					{onFolderHoverEnd}
					{onFileMove}
					{draggedPath}
					{onDragStart}
					{onDragEnd}
				/>
			{/each}
			{#if hasMoreChildren()}
				<button class="show-more-btn" onclick={showMoreChildren}>
					<span class="show-more-icon">···</span>
					<span class="show-more-text">Show {Math.min(remainingCount(), LOAD_MORE_INCREMENT)} more ({remainingCount()} remaining)</span>
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.tree-node {
		user-select: none;
	}

	.node-row {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 0.25rem 0.5rem;
		border: none;
		background: transparent;
		cursor: pointer;
		font-size: 0.8125rem;
		color: oklch(0.75 0.02 250);
		text-align: left;
		border-radius: 0.25rem;
		transition: background 0.1s ease;
		gap: 0.25rem;
	}

	.node-row:hover {
		background: oklch(0.22 0.02 250);
	}

	.node-row.selected {
		background: oklch(0.65 0.12 220 / 0.2);
		color: oklch(0.85 0.08 220);
	}

	.node-row.selected:hover {
		background: oklch(0.65 0.12 220 / 0.25);
	}

	.node-row.active-folder {
		background: oklch(0.55 0.06 250 / 0.15);
	}

	.node-row.active-folder:hover {
		background: oklch(0.55 0.06 250 / 0.22);
	}

	.node-row.folder {
		font-weight: 500;
	}

	.indent {
		flex-shrink: 0;
	}

	.arrow {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		flex-shrink: 0;
		transition: transform 0.15s ease;
	}

	.arrow svg {
		width: 12px;
		height: 12px;
		color: oklch(0.55 0.02 250);
	}

	.arrow.expanded {
		transform: rotate(90deg);
	}

	.arrow-placeholder {
		width: 16px;
		flex-shrink: 0;
	}

	.loading-spinner {
		width: 12px;
		height: 12px;
		border: 2px solid oklch(0.35 0.02 250);
		border-top-color: oklch(0.65 0.12 220);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	.icon {
		font-size: 0.875rem;
		flex-shrink: 0;
		width: 18px;
		text-align: center;
	}

	.name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.name.highlighted {
		background: oklch(0.65 0.15 85 / 0.3);
		border-radius: 2px;
		padding: 0 2px;
		margin: 0 -2px;
	}

	/* Git status badge */
	.git-status-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 0.625rem;
		font-weight: 700;
		font-family: ui-monospace, 'SF Mono', Menlo, Monaco, 'Cascadia Code', monospace;
		min-width: 14px;
		height: 14px;
		padding: 0 2px;
		border-radius: 3px;
		border: 1px solid;
		background: transparent;
		margin-left: auto;
		flex-shrink: 0;
		opacity: 0.9;
		transition: opacity 0.1s ease;
	}

	.node-row:hover .git-status-badge {
		opacity: 1;
	}

	/* Drag-and-drop styles */
	.node-row.drag-over {
		background: oklch(0.55 0.15 220 / 0.25);
		outline: 2px dashed oklch(0.65 0.15 220);
		outline-offset: -2px;
		border-radius: 0.25rem;
	}

	.node-row.being-dragged {
		opacity: 0.4;
	}

	.children {
		/* Subtle left border to show hierarchy */
		margin-left: 0.5rem;
		border-left: 1px solid oklch(0.25 0.02 250);
		padding-left: 0.25rem;
	}

	/* Show more button for large directories */
	.show-more-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		width: 100%;
		padding: 0.375rem 0.5rem;
		border: none;
		background: transparent;
		cursor: pointer;
		font-size: 0.75rem;
		color: oklch(0.55 0.12 220);
		text-align: left;
		border-radius: 0.25rem;
		transition: all 0.15s ease;
		margin-top: 0.125rem;
	}

	.show-more-btn:hover {
		background: oklch(0.55 0.12 220 / 0.1);
		color: oklch(0.65 0.15 220);
	}

	.show-more-icon {
		font-size: 1rem;
		letter-spacing: 0.1em;
		color: oklch(0.50 0.08 220);
	}

	.show-more-text {
		font-weight: 500;
	}
</style>
