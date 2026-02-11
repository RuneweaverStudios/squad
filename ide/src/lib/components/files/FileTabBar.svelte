<script lang="ts">
	/**
	 * FileTabBar - Horizontal tab bar for open files
	 *
	 * Features:
	 * - Tab per open file showing filename
	 * - Active tab highlighted
	 * - Dirty indicator (dot) for unsaved changes
	 * - Click tab → switch to that file
	 * - Click X → close tab (emits event for parent to handle confirmation)
	 * - Middle-click → close tab
	 * - Drag-and-drop to reorder tabs
	 * - Overflow: horizontal scroll for many tabs
	 */

	import type { OpenFile } from './types';

	// Props
	let {
		openFiles = [],
		activeFilePath = null,
		onTabSelect = () => {},
		onTabClose = () => {},
		onTabMiddleClick = () => {},
		onTabReorder = () => {},
		onDiskChangeClick = () => {}
	}: {
		openFiles: OpenFile[];
		activeFilePath: string | null;
		onTabSelect?: (path: string) => void;
		onTabClose?: (path: string) => void;
		onTabMiddleClick?: (path: string) => void;
		onTabReorder?: (fromIndex: number, toIndex: number) => void;
		onDiskChangeClick?: (path: string) => void;
	} = $props();

	// Drag-and-drop state
	let draggedIndex = $state<number | null>(null);
	let dragOverIndex = $state<number | null>(null);

	// Get filename from path
	function getFileName(path: string): string {
		return path.split('/').pop() || path;
	}

	// Get file extension for icon styling
	function getFileExtension(path: string): string {
		const parts = path.split('.');
		return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
	}

	// Handle tab click
	function handleTabClick(path: string) {
		onTabSelect(path);
	}

	// Handle close button click
	function handleCloseClick(e: MouseEvent, path: string) {
		e.stopPropagation();
		onTabClose(path);
	}

	// Handle middle mouse button click on tab
	function handleMouseDown(e: MouseEvent, path: string) {
		if (e.button === 1) {
			// Middle button
			e.preventDefault();
			onTabMiddleClick(path);
		}
	}

	// Handle disk change indicator click
	function handleDiskChangeClick(e: MouseEvent, path: string) {
		e.stopPropagation();
		onDiskChangeClick(path);
	}

	// Drag-and-drop handlers
	function handleDragStart(e: DragEvent, index: number) {
		if (!e.dataTransfer) return;
		draggedIndex = index;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', index.toString());
		// Drag styling is handled reactively via class:dragging={draggedIndex === index}
	}

	function handleDragEnd(e: DragEvent) {
		draggedIndex = null;
		dragOverIndex = null;
	}

	function handleDragOver(e: DragEvent, index: number) {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
		if (draggedIndex !== null && draggedIndex !== index) {
			dragOverIndex = index;
		}
	}

	function handleDragLeave(e: DragEvent) {
		// Only reset if leaving the tab entirely (not entering a child)
		const relatedTarget = e.relatedTarget as HTMLElement | null;
		if (!relatedTarget?.closest('.file-tab')) {
			dragOverIndex = null;
		}
	}

	function handleDrop(e: DragEvent, index: number) {
		e.preventDefault();
		if (draggedIndex !== null && draggedIndex !== index) {
			onTabReorder(draggedIndex, index);
		}
		draggedIndex = null;
		dragOverIndex = null;
	}
</script>

<div class="file-tab-bar">
	<div class="tabs-container">
		{#each openFiles as file, index (file.path)}
			<div
				class="file-tab"
				class:active={activeFilePath === file.path}
				class:dirty={file.dirty}
				class:drag-over={dragOverIndex === index}
				class:dragging={draggedIndex === index}
				class:drag-over-left={dragOverIndex === index && draggedIndex !== null && draggedIndex > index}
				class:drag-over-right={dragOverIndex === index && draggedIndex !== null && draggedIndex < index}
				onclick={() => handleTabClick(file.path)}
				onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTabClick(file.path); } }}
				onmousedown={(e) => handleMouseDown(e, file.path)}
				draggable="true"
				ondragstart={(e) => handleDragStart(e, index)}
				ondragend={handleDragEnd}
				ondragover={(e) => handleDragOver(e, index)}
				ondragleave={handleDragLeave}
				ondrop={(e) => handleDrop(e, index)}
				role="tab"
				aria-selected={activeFilePath === file.path}
				tabindex="0"
			>
				<!-- File icon based on extension -->
				<span class="file-icon" data-extension={getFileExtension(file.path)}>
					<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
						/>
					</svg>
				</span>

				<!-- Filename -->
				<span class="tab-name">{getFileName(file.path)}</span>

				<!-- Disk change indicator (external modification detected) -->
				{#if file.hasDiskChanges}
					<button
						class="disk-change-btn"
						onclick={(e) => handleDiskChangeClick(e, file.path)}
						title="File changed on disk - Click to view diff"
						aria-label="File changed externally"
					>
						<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
						</svg>
					</button>
				{/if}

				<!-- Dirty indicator -->
				{#if file.dirty}
					<span class="dirty-indicator" title="Unsaved changes"></span>
				{/if}

				<!-- Close button -->
				<button
					class="close-btn"
					onclick={(e) => handleCloseClick(e, file.path)}
					title={file.dirty ? 'Close (has unsaved changes) • Alt+W' : 'Close (Alt+W)'}
					aria-label="Close tab"
				>
					<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		{/each}
	</div>
</div>

<style>
	.file-tab-bar {
		display: flex;
		align-items: center;
		background: oklch(0.16 0.01 250);
		border-bottom: 1px solid oklch(0.22 0.02 250);
		min-height: 36px;
		overflow: hidden;
	}

	.tabs-container {
		display: flex;
		gap: 1px;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: thin;
		scrollbar-color: oklch(0.30 0.02 250) transparent;
		flex: 1;
		padding: 2px 4px;
	}

	.tabs-container::-webkit-scrollbar {
		height: 4px;
	}

	.tabs-container::-webkit-scrollbar-track {
		background: transparent;
	}

	.tabs-container::-webkit-scrollbar-thumb {
		background: oklch(0.30 0.02 250);
		border-radius: 2px;
	}

	.file-tab {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.5rem;
		background: oklch(0.18 0.01 250);
		border: 1px solid oklch(0.22 0.02 250);
		border-radius: 0.375rem 0.375rem 0 0;
		font-size: 0.8125rem;
		color: oklch(0.60 0.02 250);
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.15s ease;
		user-select: none;
		position: relative;
	}

	.file-tab:hover {
		background: oklch(0.20 0.02 250);
		color: oklch(0.75 0.02 250);
	}

	.file-tab.active {
		background: oklch(0.14 0.01 250);
		color: oklch(0.90 0.02 250);
		border-bottom-color: oklch(0.14 0.01 250);
	}

	.file-tab.active::after {
		content: '';
		position: absolute;
		bottom: -1px;
		left: 0;
		right: 0;
		height: 2px;
		background: oklch(0.65 0.15 200);
	}

	.file-icon {
		display: flex;
		align-items: center;
		color: oklch(0.50 0.02 250);
	}

	.file-tab.active .file-icon {
		color: oklch(0.65 0.15 200);
	}

	/* File type colors */
	.file-icon[data-extension='ts'],
	.file-icon[data-extension='tsx'] {
		color: oklch(0.60 0.15 230);
	}

	.file-icon[data-extension='js'],
	.file-icon[data-extension='jsx'] {
		color: oklch(0.70 0.18 85);
	}

	.file-icon[data-extension='svelte'] {
		color: oklch(0.60 0.20 25);
	}

	.file-icon[data-extension='css'],
	.file-icon[data-extension='scss'] {
		color: oklch(0.55 0.15 280);
	}

	.file-icon[data-extension='json'] {
		color: oklch(0.65 0.15 100);
	}

	.file-icon[data-extension='md'] {
		color: oklch(0.55 0.10 250);
	}

	.tab-name {
		max-width: 160px;
		overflow: hidden;
		text-overflow: ellipsis;
		font-family: ui-monospace, monospace;
	}

	.dirty-indicator {
		width: 8px;
		height: 8px;
		background: oklch(0.70 0.18 85);
		border-radius: 50%;
		flex-shrink: 0;
	}

	/* Disk change indicator button */
	.disk-change-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.125rem;
		background: oklch(0.50 0.15 200 / 0.2);
		border: none;
		border-radius: 0.25rem;
		color: oklch(0.70 0.18 200);
		cursor: pointer;
		transition: all 0.15s ease;
		flex-shrink: 0;
		animation: disk-change-pulse 2s ease-in-out infinite;
	}

	.disk-change-btn:hover {
		background: oklch(0.50 0.15 200 / 0.4);
		color: oklch(0.80 0.18 200);
		animation: none;
	}

	@keyframes disk-change-pulse {
		0%, 100% {
			opacity: 0.8;
			box-shadow: 0 0 0 0 oklch(0.65 0.15 200 / 0);
		}
		50% {
			opacity: 1;
			box-shadow: 0 0 6px 2px oklch(0.65 0.15 200 / 0.4);
		}
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.125rem;
		background: transparent;
		border: none;
		border-radius: 0.25rem;
		color: oklch(0.45 0.02 250);
		cursor: pointer;
		opacity: 0;
		transition: all 0.1s ease;
		margin-left: 0.125rem;
	}

	.file-tab:hover .close-btn {
		opacity: 1;
	}

	.file-tab.active .close-btn {
		opacity: 0.7;
	}

	.close-btn:hover {
		background: oklch(0.28 0.02 250);
		color: oklch(0.70 0.02 250);
		opacity: 1 !important;
	}

	.file-tab.dirty .close-btn:hover {
		background: oklch(0.50 0.12 45 / 0.3);
		color: oklch(0.75 0.15 45);
	}

	/* Focus styles */
	.file-tab:focus-visible {
		outline: 2px solid oklch(0.65 0.15 200);
		outline-offset: -2px;
	}

	/* Drag-and-drop styles */
	.file-tab[draggable='true'] {
		cursor: grab;
	}

	.file-tab[draggable='true']:active {
		cursor: grabbing;
	}

	.file-tab.dragging {
		opacity: 0.5;
		transform: scale(0.98);
	}

	.file-tab.drag-over-left {
		box-shadow: inset 3px 0 0 0 oklch(0.65 0.15 200);
	}

	.file-tab.drag-over-right {
		box-shadow: inset -3px 0 0 0 oklch(0.65 0.15 200);
	}

	.file-tab.drag-over {
		background: oklch(0.22 0.02 250);
	}
</style>
