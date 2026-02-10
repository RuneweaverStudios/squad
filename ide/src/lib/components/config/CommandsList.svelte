<script lang="ts">
	/**
	 * CommandsList Component
	 *
	 * Displays all slash commands grouped by namespace in collapsible sections with:
	 * - Namespace-based grouping (jat, local, etc.)
	 * - Collapsible sections per namespace
	 * - Search/filter by name, invocation, or namespace
	 * - Import/Export functionality
	 * - Drag-and-drop .md file import (drop on namespace header or general area)
	 * - New Command button
	 * - Loading and error states
	 *
	 * Follows the RulesList and ProjectsList patterns.
	 *
	 * @see ide/src/lib/types/config.ts for SlashCommand type
	 * @see ide/src/lib/stores/configStore.svelte.ts for store
	 */

	import { fade, slide } from 'svelte/transition';
	import { onMount } from 'svelte';
	import type { SlashCommand, CommandGroup } from '$lib/types/config';
	import {
		getCommands,
		getCommandGroups,
		isCommandsLoading,
		getCommandsError,
		loadCommands,
		deleteCommand
	} from '$lib/stores/configStore.svelte';
	import CommandCard from './CommandCard.svelte';
	import { successToast, errorToast } from '$lib/stores/toasts.svelte';

	interface Props {
		/** Called when edit button is clicked for a command */
		onEditCommand?: (command: SlashCommand) => void;
		/** Called when add command button is clicked */
		onAddCommand?: () => void;
		/** Custom class */
		class?: string;
	}

	let {
		onEditCommand = () => {},
		onAddCommand = () => {},
		class: className = ''
	}: Props = $props();

	// Import/Export state
	let isExporting = $state(false);
	let isImporting = $state(false);
	let importFileInput: HTMLInputElement;
	let importMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let exportDropdownOpen = $state(false);
	let selectedExportNamespaces = $state<Set<string>>(new Set()); // Empty = all namespaces
	let exportDropdownRef: HTMLDivElement;

	// Drag-and-drop state
	let isDragOver = $state(false);
	let dragOverNamespace = $state<string | null>(null);
	let isProcessingDrop = $state(false);
	let showNamespacePicker = $state(false);
	let pendingDropFiles = $state<File[]>([]);
	let newNamespaceInput = $state('');

	// Drag-and-drop handlers
	function handleDragEnter(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer?.types.includes('Files')) {
			isDragOver = true;
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'copy';
		}
	}

	function handleDragLeave(e: DragEvent) {
		// Only reset if leaving the container entirely
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const x = e.clientX;
		const y = e.clientY;
		if (x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom) {
			isDragOver = false;
			dragOverNamespace = null;
		}
	}

	function handleNamespaceDragEnter(e: DragEvent, namespace: string) {
		e.preventDefault();
		e.stopPropagation();
		dragOverNamespace = namespace;
	}

	function handleNamespaceDragLeave(e: DragEvent) {
		// Check if we're still within the namespace header
		const target = e.currentTarget as HTMLElement;
		const related = e.relatedTarget as HTMLElement | null;
		if (!related || !target.contains(related)) {
			dragOverNamespace = null;
		}
	}

	function getMdFiles(dataTransfer: DataTransfer): File[] {
		return Array.from(dataTransfer.files).filter(
			(f) => f.name.endsWith('.md') || f.type === 'text/markdown'
		);
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragOver = false;
		dragOverNamespace = null;

		if (!e.dataTransfer) return;

		const mdFiles = getMdFiles(e.dataTransfer);
		if (mdFiles.length === 0) {
			errorToast('No .md files found', 'Drag and drop .md (Markdown) command files');
			return;
		}

		// If dropped on general area, show namespace picker
		pendingDropFiles = mdFiles;
		showNamespacePicker = true;
		newNamespaceInput = '';
	}

	async function handleNamespaceDrop(e: DragEvent, namespace: string) {
		e.preventDefault();
		e.stopPropagation();
		isDragOver = false;
		dragOverNamespace = null;

		if (!e.dataTransfer) return;

		const mdFiles = getMdFiles(e.dataTransfer);
		if (mdFiles.length === 0) {
			errorToast('No .md files found', 'Drag and drop .md (Markdown) command files');
			return;
		}

		await processDroppedFiles(mdFiles, namespace);
	}

	async function handleNamespacePickerSubmit(namespace: string) {
		showNamespacePicker = false;
		if (pendingDropFiles.length > 0) {
			await processDroppedFiles(pendingDropFiles, namespace);
			pendingDropFiles = [];
		}
	}

	function handleNamespacePickerCancel() {
		showNamespacePicker = false;
		pendingDropFiles = [];
	}

	async function processDroppedFiles(files: File[], namespace: string) {
		isProcessingDrop = true;
		let created = 0;
		let errors = 0;
		const errorMessages: string[] = [];

		for (const file of files) {
			const name = file.name.replace(/\.md$/, '');
			try {
				const content = await file.text();
				const response = await fetch('/api/commands', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ namespace, name, content })
				});

				if (response.ok) {
					created++;
				} else {
					const result = await response.json();
					errors++;
					// 409 = already exists, offer update
					if (response.status === 409) {
						// Try PUT to update existing
						const updateResp = await fetch(`/api/commands/${namespace}/${name}`, {
							method: 'PUT',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ content })
						});
						if (updateResp.ok) {
							errors--;
							created++;
						} else {
							errorMessages.push(`${file.name}: ${result.message || 'Already exists'}`);
						}
					} else {
						errorMessages.push(`${file.name}: ${result.message || response.statusText}`);
					}
				}
			} catch (err) {
				errors++;
				errorMessages.push(`${file.name}: ${(err as Error).message}`);
			}
		}

		isProcessingDrop = false;

		if (created > 0) {
			await loadCommands();
			successToast(
				`Imported ${created} command${created !== 1 ? 's' : ''}`,
				`Added to "${namespace}" namespace`
			);
			// Expand the target namespace
			const newSet = new Set(expandedNamespaces);
			newSet.add(namespace);
			expandedNamespaces = newSet;
		}
		if (errors > 0) {
			errorToast(
				`${errors} file${errors !== 1 ? 's' : ''} failed`,
				errorMessages.slice(0, 3).join('; ')
			);
		}
	}

	// Close dropdown when clicking outside
	function handleClickOutside(event: MouseEvent) {
		if (exportDropdownOpen && exportDropdownRef && !exportDropdownRef.contains(event.target as Node)) {
			exportDropdownOpen = false;
		}
	}

	onMount(() => {
		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});

	// Get reactive state from store
	const commands = $derived(getCommands());
	const commandGroups = $derived(getCommandGroups());
	const loading = $derived(isCommandsLoading());
	const error = $derived(getCommandsError());

	// Search state
	let searchQuery = $state('');
	let searchInput: HTMLInputElement;

	// Track expanded/collapsed state per namespace
	let expandedNamespaces = $state<Set<string>>(new Set(['jat', 'local']));

	// Score-based fuzzy search (adapted from StatusActionBadge)
	function scoreCommand(query: string, cmd: SlashCommand): number {
		const q = query.toLowerCase();
		const name = cmd.name.toLowerCase();
		const invocation = cmd.invocation.toLowerCase();
		const namespace = cmd.namespace.toLowerCase();

		let score = 0;

		// Invocation matches (highest priority - what users type)
		if (invocation === q) {
			score += 100;
		} else if (invocation.startsWith(q)) {
			score += 80;
		} else if (invocation.includes(q)) {
			score += 60;
		}

		// Name matches
		if (name === q) {
			score += 50;
		} else if (name.startsWith(q)) {
			score += 40;
		} else if (name.includes(q)) {
			score += 20;
		}

		// Namespace matches (lowest priority)
		if (namespace === q) {
			score += 15;
		} else if (namespace.includes(q)) {
			score += 10;
		}

		return score;
	}

	// Filter and sort commands by score
	function filterCommands(query: string, cmds: SlashCommand[]): SlashCommand[] {
		if (!query.trim()) {
			return cmds;
		}

		return cmds
			.map(cmd => ({ cmd, score: scoreCommand(query, cmd) }))
			.filter(({ score }) => score > 0)
			.sort((a, b) => b.score - a.score)
			.map(({ cmd }) => cmd);
	}

	// Filtered commands based on search
	const filteredCommands = $derived(filterCommands(searchQuery, commands));

	// Filter command groups to only include matching commands
	const filteredCommandGroups = $derived.by(() => {
		if (!searchQuery.trim()) {
			return commandGroups;
		}

		const matchingIds = new Set(filteredCommands.map(c => c.path));

		return commandGroups
			.map(group => ({
				...group,
				commands: group.commands.filter(c => matchingIds.has(c.path))
			}))
			.filter(group => group.commands.length > 0);
	});

	// Match count for display
	const matchCount = $derived(filteredCommands.length);
	const isFiltered = $derived(searchQuery.trim().length > 0);

	// Get unique namespaces for export filter
	const availableNamespaces = $derived.by(() => {
		const namespaces = new Set<string>();
		for (const group of commandGroups) {
			namespaces.add(group.namespace);
		}
		return Array.from(namespaces).sort((a, b) => {
			// Sort jat first, then local, then alphabetically
			if (a === 'jat') return -1;
			if (b === 'jat') return 1;
			if (a === 'local') return -1;
			if (b === 'local') return 1;
			return a.localeCompare(b);
		});
	});

	// Highlight matching text in a string
	function highlightMatch(text: string, query: string): { text: string; isMatch: boolean }[] {
		if (!query.trim()) {
			return [{ text, isMatch: false }];
		}

		const lowerText = text.toLowerCase();
		const lowerQuery = query.toLowerCase();
		const index = lowerText.indexOf(lowerQuery);

		if (index === -1) {
			return [{ text, isMatch: false }];
		}

		const result: { text: string; isMatch: boolean }[] = [];
		if (index > 0) {
			result.push({ text: text.substring(0, index), isMatch: false });
		}
		result.push({ text: text.substring(index, index + query.length), isMatch: true });
		if (index + query.length < text.length) {
			result.push({ text: text.substring(index + query.length), isMatch: false });
		}
		return result;
	}

	// Clear search
	function clearSearch() {
		searchQuery = '';
		searchInput?.focus();
	}

	// Toggle namespace expansion
	function toggleNamespace(namespace: string) {
		const newSet = new Set(expandedNamespaces);
		if (newSet.has(namespace)) {
			newSet.delete(namespace);
		} else {
			newSet.add(namespace);
		}
		expandedNamespaces = newSet;
	}

	// Check if namespace is expanded
	function isExpanded(namespace: string): boolean {
		return expandedNamespaces.has(namespace);
	}

	// Handle delete command
	async function handleDeleteCommand(command: SlashCommand) {
		const success = await deleteCommand(command);
		if (success) {
			successToast(`Command "${command.invocation}" deleted`, 'Removed from configuration');
		} else {
			errorToast('Failed to delete command', `Could not delete ${command.invocation}`);
		}
	}

	// Handle retry
	function handleRetry() {
		loadCommands();
	}

	// Get namespace icon based on type
	function getNamespaceIcon(namespace: string): string {
		switch (namespace) {
			case 'jat':
				return 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12'; // menu/list icon
			case 'local':
				return 'M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z'; // key icon
			case 'git':
				return 'M15 3v8.25m0-8.25H8.25m6.75 0l-3 3m3-3l3 3M5.25 21V12m0 9H12m-6.75-6l3-3m-3 3l-3-3'; // git branch icon
			default:
				return 'M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5'; // code icon
		}
	}

	// Get namespace color
	function getNamespaceColor(namespace: string): string {
		switch (namespace) {
			case 'jat':
				return 'oklch(0.65 0.15 200)'; // blue
			case 'local':
				return 'oklch(0.65 0.15 145)'; // green
			case 'git':
				return 'oklch(0.65 0.15 25)'; // red/orange
			default:
				return 'oklch(0.65 0.10 280)'; // purple
		}
	}

	// Toggle namespace selection for export
	function toggleExportNamespace(namespace: string) {
		const newSet = new Set(selectedExportNamespaces);
		if (newSet.has(namespace)) {
			newSet.delete(namespace);
		} else {
			newSet.add(namespace);
		}
		selectedExportNamespaces = newSet;
	}

	// Get count of commands that will be exported
	const exportCommandCount = $derived.by(() => {
		if (selectedExportNamespaces.size === 0) {
			return commands.length;
		}
		return commands.filter(cmd => selectedExportNamespaces.has(cmd.namespace)).length;
	});

	// Export commands to JSON file
	async function handleExport() {
		if (isExporting || commands.length === 0) return;

		isExporting = true;
		importMessage = null;
		exportDropdownOpen = false;

		try {
			// Build URL with namespace filter if any namespaces are selected
			let exportUrl = '/api/commands/export';
			if (selectedExportNamespaces.size > 0) {
				const namespaceParam = Array.from(selectedExportNamespaces).join(',');
				exportUrl += `?namespace=${encodeURIComponent(namespaceParam)}`;
			}

			const response = await fetch(exportUrl);
			if (!response.ok) {
				throw new Error(`Export failed: ${response.statusText}`);
			}

			// Get the blob and trigger download
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `commands-export-${new Date().toISOString().split('T')[0]}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			const exportedCount = selectedExportNamespaces.size > 0 ? exportCommandCount : commands.length;
			importMessage = { type: 'success', text: `Exported ${exportedCount} commands` };
			setTimeout(() => { importMessage = null; }, 3000);
		} catch (err) {
			console.error('Export failed:', err);
			importMessage = { type: 'error', text: (err as Error).message };
		} finally {
			isExporting = false;
		}
	}

	// Trigger file input for import
	function triggerImport() {
		importFileInput?.click();
	}

	// Handle file selection for import
	async function handleImportFile(event: Event) {
		const input = event.target as HTMLInputElement;
		const files = input.files;
		if (!files || files.length === 0) return;

		// Check if any files are .md - route through namespace picker
		const mdFiles = Array.from(files).filter(
			(f) => f.name.endsWith('.md') || f.type === 'text/markdown'
		);
		const jsonFiles = Array.from(files).filter(
			(f) => f.name.endsWith('.json') || f.type === 'application/json'
		);

		// Handle .md files via namespace picker (same as drag-and-drop)
		if (mdFiles.length > 0) {
			pendingDropFiles = mdFiles;
			showNamespacePicker = true;
			newNamespaceInput = '';
			input.value = '';
			return;
		}

		// Handle JSON import (existing behavior)
		const file = jsonFiles[0];
		if (!file) {
			input.value = '';
			return;
		}

		isImporting = true;
		importMessage = null;

		try {
			const content = await file.text();
			const data = JSON.parse(content);

			// Validate basic structure
			if (!data.commands || !Array.isArray(data.commands)) {
				throw new Error('Invalid file format: missing commands array');
			}

			const response = await fetch('/api/commands/import', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: content
			});

			const result = await response.json();

			if (result.success) {
				importMessage = { type: 'success', text: result.message };
				// Refresh commands list
				await loadCommands();
			} else {
				importMessage = { type: 'error', text: result.message };
			}

			setTimeout(() => { importMessage = null; }, 5000);
		} catch (err) {
			console.error('Import failed:', err);
			importMessage = {
				type: 'error',
				text: err instanceof SyntaxError ? 'Invalid JSON file' : (err as Error).message
			};
		} finally {
			isImporting = false;
			// Reset file input so same file can be selected again
			input.value = '';
		}
	}
</script>

<div
	class="commands-list {className}"
	class:drag-over={isDragOver}
	ondragenter={handleDragEnter}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	role="region"
	aria-label="Slash commands"
>
	<!-- Drag overlay -->
	{#if isDragOver}
		<div class="drag-overlay" transition:fade={{ duration: 100 }}>
			<div class="drag-overlay-content">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="drag-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
				</svg>
				<span class="drag-text">Drop .md files to import commands</span>
				<span class="drag-hint">Drop on a namespace header to target that namespace</span>
			</div>
		</div>
	{/if}

	<!-- Namespace picker modal (for drops on general area) -->
	{#if showNamespacePicker}
		<div class="namespace-picker-overlay" transition:fade={{ duration: 100 }}>
			<div class="namespace-picker-modal" transition:slide={{ duration: 150, axis: 'y' }}>
				<h3 class="picker-title">Choose namespace for {pendingDropFiles.length} file{pendingDropFiles.length !== 1 ? 's' : ''}</h3>
				<p class="picker-hint">Select an existing namespace or create a new one</p>

				<div class="picker-options">
					{#each availableNamespaces as namespace}
						<button
							class="picker-option"
							onclick={() => handleNamespacePickerSubmit(namespace)}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="picker-icon"
								style="color: {getNamespaceColor(namespace)}"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d={getNamespaceIcon(namespace)} />
							</svg>
							<span class="picker-label">{namespace}</span>
							<span class="picker-count">{commandGroups.find(g => g.namespace === namespace)?.commands.length || 0}</span>
						</button>
					{/each}

					<!-- New namespace option -->
					<div class="picker-new">
						<input
							type="text"
							placeholder="New namespace..."
							class="picker-new-input"
							bind:value={newNamespaceInput}
							onkeydown={(e) => {
								if (e.key === 'Enter' && newNamespaceInput.trim()) {
									handleNamespacePickerSubmit(newNamespaceInput.trim());
								}
							}}
						/>
						<button
							class="picker-new-btn"
							disabled={!newNamespaceInput.trim()}
							onclick={() => {
								if (newNamespaceInput.trim()) {
									handleNamespacePickerSubmit(newNamespaceInput.trim());
								}
							}}
						>
							Create
						</button>
					</div>
				</div>

				<button class="picker-cancel" onclick={handleNamespacePickerCancel}>
					Cancel
				</button>
			</div>
		</div>
	{/if}

	<!-- Processing indicator -->
	{#if isProcessingDrop}
		<div class="processing-bar" transition:slide={{ duration: 150, axis: 'y' }}>
			<div class="btn-spinner"></div>
			<span>Importing commands...</span>
		</div>
	{/if}

	<!-- Header -->
	<header class="list-header">
		<div class="header-left">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="header-icon">
				<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
			</svg>
			<span class="header-title">Slash Commands</span>
			<span class="command-count">
				{#if isFiltered}
					{matchCount}/{commands.length}
				{:else}
					{commands.length}
				{/if}
				command{commands.length !== 1 ? 's' : ''}
			</span>
		</div>

		<div class="header-right">
			<!-- Search input -->
			<div class="search-container">
				<svg class="search-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
				</svg>
				<input
					bind:this={searchInput}
					bind:value={searchQuery}
					type="text"
					placeholder="Filter commands..."
					class="search-input"
					autocomplete="off"
				/>
				{#if searchQuery}
					<button
						class="clear-btn"
						onclick={clearSearch}
						title="Clear filter"
						aria-label="Clear filter"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				{/if}
			</div>

			<!-- Refresh button -->
			<button
				class="refresh-btn"
				onclick={handleRetry}
				disabled={loading}
				title="Refresh commands"
				aria-label="Refresh commands"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-4 h-4"
					class:spinning={loading}
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
				</svg>
			</button>

			<!-- Import button -->
			<button
				class="import-btn"
				onclick={triggerImport}
				disabled={isImporting}
				title="Import commands (.md or .json)"
				aria-label="Import commands"
			>
				{#if isImporting}
					<div class="btn-spinner"></div>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
					</svg>
				{/if}
				Import
			</button>
			<input
				bind:this={importFileInput}
				type="file"
				accept=".json,.md"
				multiple
				onchange={handleImportFile}
				class="hidden-file-input"
			/>

			<!-- Export dropdown -->
			<div class="export-dropdown" bind:this={exportDropdownRef}>
				<button
					class="export-btn"
					onclick={() => exportDropdownOpen = !exportDropdownOpen}
					disabled={isExporting || commands.length === 0}
					title="Export commands to JSON file"
					aria-label="Export commands"
					aria-expanded={exportDropdownOpen}
				>
					{#if isExporting}
						<div class="btn-spinner"></div>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
						</svg>
					{/if}
					Export
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3 chevron-down" class:rotated={exportDropdownOpen}>
						<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
					</svg>
				</button>

				{#if exportDropdownOpen}
					<div class="export-dropdown-menu" transition:slide={{ duration: 150, axis: 'y' }}>
						<div class="dropdown-header">
							<span class="dropdown-title">Select namespaces to export</span>
							<span class="dropdown-hint">
								{#if selectedExportNamespaces.size === 0}
									All ({commands.length})
								{:else}
									{selectedExportNamespaces.size} selected ({exportCommandCount})
								{/if}
							</span>
						</div>

						<div class="namespace-options">
							{#each availableNamespaces as namespace}
								{@const count = commandGroups.find(g => g.namespace === namespace)?.commands.length || 0}
								<label class="namespace-option">
									<input
										type="checkbox"
										checked={selectedExportNamespaces.has(namespace)}
										onchange={() => toggleExportNamespace(namespace)}
									/>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										stroke-width="1.5"
										stroke="currentColor"
										class="namespace-icon"
										style="color: {getNamespaceColor(namespace)}"
									>
										<path stroke-linecap="round" stroke-linejoin="round" d={getNamespaceIcon(namespace)} />
									</svg>
									<span class="namespace-label">{namespace}</span>
									<span class="namespace-count-badge">{count}</span>
								</label>
							{/each}
						</div>

						<div class="dropdown-actions">
							<button
								class="clear-selection-btn"
								onclick={() => selectedExportNamespaces = new Set()}
								disabled={selectedExportNamespaces.size === 0}
							>
								Clear
							</button>
							<button
								class="export-now-btn"
								onclick={handleExport}
								disabled={isExporting || exportCommandCount === 0}
							>
								{#if isExporting}
									<div class="btn-spinner small"></div>
								{:else}
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
										<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
									</svg>
								{/if}
								Export {exportCommandCount > 0 ? `(${exportCommandCount})` : ''}
							</button>
						</div>
					</div>
				{/if}
			</div>

			<!-- Add command button -->
			<button
				class="add-btn"
				onclick={() => onAddCommand()}
				aria-label="Add new command"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
				</svg>
				New Command
			</button>
		</div>
	</header>

	<!-- Import/Export message -->
	{#if importMessage}
		<div
			class="import-message"
			class:success={importMessage.type === 'success'}
			class:error={importMessage.type === 'error'}
			transition:slide={{ duration: 200, axis: 'y' }}
		>
			{#if importMessage.type === 'success'}
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="message-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
			{:else}
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="message-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
				</svg>
			{/if}
			<span>{importMessage.text}</span>
			<button class="message-close" onclick={() => importMessage = null} aria-label="Dismiss message">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>
	{/if}

	<!-- Content -->
	<div class="list-content">
		{#if loading && commands.length === 0}
			<!-- Loading state -->
			<div class="loading-state" transition:fade={{ duration: 150 }}>
				<div class="loading-spinner"></div>
				<p class="loading-text">Loading commands...</p>
			</div>
		{:else if error}
			<!-- Error state -->
			<div class="error-state" transition:fade={{ duration: 150 }}>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="error-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
				</svg>
				<p class="error-title">Failed to load commands</p>
				<p class="error-message">{error}</p>
				<button class="retry-btn" onclick={handleRetry}>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
					</svg>
					Retry
				</button>
			</div>
		{:else if commands.length === 0}
			<!-- Empty state -->
			<div class="empty-state" transition:fade={{ duration: 150 }}>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="empty-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
				</svg>
				<p class="empty-title">No commands found</p>
				<p class="empty-hint">Create a slash command to get started</p>
				<button class="empty-action" onclick={() => onAddCommand()}>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
					</svg>
					Add First Command
				</button>
			</div>
		{:else if isFiltered && filteredCommands.length === 0}
			<!-- No search results -->
			<div class="empty-state" transition:fade={{ duration: 150 }}>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="empty-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
				</svg>
				<p class="empty-title">No commands match "{searchQuery}"</p>
				<p class="empty-hint">Try a different search term</p>
				<button class="empty-action" onclick={clearSearch}>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
					Clear Filter
				</button>
			</div>
		{:else}
			<!-- Commands grouped by namespace -->
			{#each filteredCommandGroups as group (group.namespace)}
				<div class="namespace-group" transition:slide={{ duration: 200, axis: 'y' }}>
					<!-- Namespace header (collapsible + drop target) -->
					<button
						class="namespace-header"
						class:namespace-drop-target={dragOverNamespace === group.namespace}
						onclick={() => toggleNamespace(group.namespace)}
						ondragenter={(e) => handleNamespaceDragEnter(e, group.namespace)}
						ondragleave={handleNamespaceDragLeave}
						ondragover={handleDragOver}
						ondrop={(e) => handleNamespaceDrop(e, group.namespace)}
						aria-expanded={isExpanded(group.namespace)}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="chevron-icon"
							class:expanded={isExpanded(group.namespace)}
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
						</svg>

						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="namespace-icon"
							style="color: {getNamespaceColor(group.namespace)}"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d={getNamespaceIcon(group.namespace)} />
						</svg>

						<span class="namespace-name">
							{#each highlightMatch(group.namespace, searchQuery) as segment}
								{#if segment.isMatch}
									<mark class="search-highlight">{segment.text}</mark>
								{:else}
									{segment.text}
								{/if}
							{/each}
						</span>
						<span class="namespace-count">{group.commands.length}</span>
					</button>

					<!-- Commands in this namespace -->
					{#if isExpanded(group.namespace)}
						<div class="namespace-commands" transition:slide={{ duration: 200, axis: 'y' }}>
							{#each group.commands as command (command.path)}
								<CommandCard
									{command}
									{searchQuery}
									{highlightMatch}
									onEdit={onEditCommand}
									onDelete={handleDeleteCommand}
								/>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.commands-list {
		display: flex;
		flex-direction: column;
		position: relative;
		background: oklch(0.14 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 10px;
		overflow: hidden;
	}

	/* Header */
	.list-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: oklch(0.12 0.02 250);
		border-bottom: 1px solid oklch(0.25 0.02 250);
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.header-icon {
		width: 18px;
		height: 18px;
		color: oklch(0.65 0.10 200);
	}

	.header-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.command-count {
		font-size: 0.7rem;
		font-weight: 400;
		color: oklch(0.50 0.02 250);
		background: oklch(0.22 0.02 250);
		padding: 0.125rem 0.5rem;
		border-radius: 10px;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* Search container */
	.search-container {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.625rem;
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 6px;
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}

	.search-container:focus-within {
		border-color: oklch(0.50 0.10 200);
		box-shadow: 0 0 0 2px oklch(0.50 0.10 200 / 0.2);
	}

	.search-icon {
		width: 14px;
		height: 14px;
		color: oklch(0.50 0.02 250);
		flex-shrink: 0;
	}

	.search-input {
		background: transparent;
		border: none;
		outline: none;
		font-size: 0.75rem;
		font-family: ui-monospace, monospace;
		color: oklch(0.85 0.02 250);
		width: 140px;
	}

	.search-input::placeholder {
		color: oklch(0.45 0.02 250);
	}

	.clear-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.125rem;
		background: transparent;
		border: none;
		border-radius: 3px;
		color: oklch(0.50 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.clear-btn:hover {
		background: oklch(0.30 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	/* Search highlight */
	.search-highlight {
		background: oklch(0.50 0.15 85 / 0.4);
		color: oklch(0.95 0.10 85);
		padding: 0 0.125rem;
		border-radius: 2px;
	}

	/* Refresh button */
	.refresh-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: oklch(0.22 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 6px;
		color: oklch(0.60 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.refresh-btn:hover:not(:disabled) {
		background: oklch(0.28 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	.refresh-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.spinning {
		animation: spin 1s linear infinite;
	}

	/* Add button */
	.add-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 500;
		background: oklch(0.35 0.10 200);
		border: 1px solid oklch(0.45 0.12 200);
		border-radius: 6px;
		color: oklch(0.90 0.08 200);
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: ui-monospace, monospace;
	}

	.add-btn:hover {
		background: oklch(0.40 0.12 200);
		border-color: oklch(0.50 0.15 200);
	}

	/* Content */
	.list-content {
		display: flex;
		flex-direction: column;
	}

	/* Namespace group */
	.namespace-group {
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.namespace-group:last-child {
		border-bottom: none;
	}

	/* Namespace header */
	.namespace-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.75rem 1rem;
		background: oklch(0.16 0.02 250);
		border: none;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.namespace-header:hover {
		background: oklch(0.18 0.02 250);
	}

	.chevron-icon {
		width: 14px;
		height: 14px;
		color: oklch(0.50 0.02 250);
		transition: transform 0.2s ease;
	}

	.chevron-icon.expanded {
		transform: rotate(90deg);
	}

	.namespace-icon {
		width: 16px;
		height: 16px;
	}

	.namespace-name {
		font-size: 0.8rem;
		font-weight: 600;
		color: oklch(0.75 0.02 250);
		font-family: ui-monospace, monospace;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.namespace-count {
		font-size: 0.65rem;
		font-weight: 400;
		color: oklch(0.50 0.02 250);
		background: oklch(0.22 0.02 250);
		padding: 0.125rem 0.375rem;
		border-radius: 8px;
		margin-left: auto;
	}

	/* Namespace commands */
	.namespace-commands {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 1rem;
		padding: 1rem;
		background: oklch(0.14 0.02 250);
	}

	/* Loading state */
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		gap: 1rem;
	}

	.loading-spinner {
		width: 32px;
		height: 32px;
		border: 3px solid oklch(0.30 0.02 250);
		border-top-color: oklch(0.65 0.15 200);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.loading-text {
		font-size: 0.85rem;
		color: oklch(0.55 0.02 250);
		margin: 0;
	}

	/* Error state */
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		gap: 0.5rem;
		color: oklch(0.50 0.02 250);
	}

	.error-icon {
		width: 48px;
		height: 48px;
		color: oklch(0.60 0.15 25);
		margin-bottom: 0.5rem;
	}

	.error-title {
		font-size: 0.9rem;
		font-weight: 500;
		color: oklch(0.70 0.12 25);
		margin: 0;
	}

	.error-message {
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
		margin: 0;
		text-align: center;
	}

	.retry-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-top: 1rem;
		padding: 0.5rem 1rem;
		font-size: 0.8rem;
		font-weight: 500;
		background: oklch(0.30 0.08 200);
		border: 1px solid oklch(0.40 0.10 200);
		border-radius: 6px;
		color: oklch(0.85 0.08 200);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.retry-btn:hover {
		background: oklch(0.35 0.10 200);
	}

	/* Empty state */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		gap: 0.5rem;
		color: oklch(0.50 0.02 250);
	}

	.empty-icon {
		width: 48px;
		height: 48px;
		color: oklch(0.35 0.02 250);
		margin-bottom: 0.5rem;
	}

	.empty-title {
		font-size: 0.9rem;
		font-weight: 500;
		color: oklch(0.55 0.02 250);
		margin: 0;
	}

	.empty-hint {
		font-size: 0.75rem;
		color: oklch(0.45 0.02 250);
		margin: 0;
	}

	.empty-action {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-top: 1rem;
		padding: 0.5rem 1rem;
		font-size: 0.8rem;
		font-weight: 500;
		background: oklch(0.30 0.08 200);
		border: 1px solid oklch(0.40 0.10 200);
		border-radius: 6px;
		color: oklch(0.85 0.08 200);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.empty-action:hover {
		background: oklch(0.35 0.10 200);
	}

	/* Import/Export buttons */
	.import-btn,
	.export-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.625rem;
		font-size: 0.75rem;
		font-weight: 500;
		background: oklch(0.22 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 6px;
		color: oklch(0.70 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: ui-monospace, monospace;
	}

	.import-btn:hover:not(:disabled),
	.export-btn:hover:not(:disabled) {
		background: oklch(0.28 0.02 250);
		color: oklch(0.85 0.02 250);
		border-color: oklch(0.38 0.02 250);
	}

	.import-btn:disabled,
	.export-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Button spinner */
	.btn-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid oklch(0.50 0.02 250);
		border-top-color: oklch(0.70 0.02 250);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	/* Hidden file input */
	.hidden-file-input {
		display: none;
	}

	/* Import/Export message */
	.import-message {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1rem;
		font-size: 0.8rem;
		font-family: ui-monospace, monospace;
		border-bottom: 1px solid oklch(0.25 0.02 250);
	}

	.import-message.success {
		background: oklch(0.20 0.05 145);
		color: oklch(0.75 0.12 145);
		border-bottom-color: oklch(0.30 0.08 145);
	}

	.import-message.error {
		background: oklch(0.20 0.05 25);
		color: oklch(0.75 0.12 25);
		border-bottom-color: oklch(0.30 0.08 25);
	}

	.message-icon {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
	}

	.import-message.success .message-icon {
		color: oklch(0.65 0.15 145);
	}

	.import-message.error .message-icon {
		color: oklch(0.65 0.15 25);
	}

	.message-close {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.25rem;
		margin-left: auto;
		background: transparent;
		border: none;
		border-radius: 4px;
		color: inherit;
		opacity: 0.6;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.message-close:hover {
		opacity: 1;
		background: oklch(0 0 0 / 0.1);
	}

	/* Export dropdown */
	.export-dropdown {
		position: relative;
	}

	.chevron-down {
		transition: transform 0.15s ease;
		margin-left: 0.125rem;
	}

	.chevron-down.rotated {
		transform: rotate(180deg);
	}

	.export-dropdown-menu {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		min-width: 220px;
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 8px;
		box-shadow: 0 4px 16px oklch(0 0 0 / 0.3);
		z-index: 100;
		overflow: hidden;
	}

	.dropdown-header {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		padding: 0.625rem 0.75rem;
		background: oklch(0.14 0.02 250);
		border-bottom: 1px solid oklch(0.25 0.02 250);
	}

	.dropdown-title {
		font-size: 0.7rem;
		font-weight: 600;
		color: oklch(0.70 0.02 250);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.dropdown-hint {
		font-size: 0.7rem;
		color: oklch(0.50 0.02 250);
	}

	.namespace-options {
		display: flex;
		flex-direction: column;
		padding: 0.5rem 0;
		max-height: 200px;
		overflow-y: auto;
	}

	.namespace-option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		cursor: pointer;
		transition: background 0.1s ease;
	}

	.namespace-option:hover {
		background: oklch(0.20 0.02 250);
	}

	.namespace-option input[type="checkbox"] {
		width: 14px;
		height: 14px;
		accent-color: oklch(0.60 0.15 200);
		cursor: pointer;
	}

	.namespace-option .namespace-icon {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
	}

	.namespace-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: oklch(0.80 0.02 250);
		font-family: ui-monospace, monospace;
		flex: 1;
	}

	.namespace-count-badge {
		font-size: 0.65rem;
		font-weight: 400;
		color: oklch(0.55 0.02 250);
		background: oklch(0.22 0.02 250);
		padding: 0.125rem 0.375rem;
		border-radius: 8px;
	}

	.dropdown-actions {
		display: flex;
		gap: 0.5rem;
		padding: 0.625rem 0.75rem;
		background: oklch(0.14 0.02 250);
		border-top: 1px solid oklch(0.25 0.02 250);
	}

	.clear-selection-btn {
		flex: 0 0 auto;
		padding: 0.375rem 0.625rem;
		font-size: 0.7rem;
		font-weight: 500;
		background: transparent;
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 5px;
		color: oklch(0.60 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: ui-monospace, monospace;
	}

	.clear-selection-btn:hover:not(:disabled) {
		background: oklch(0.22 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	.clear-selection-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.export-now-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		padding: 0.375rem 0.625rem;
		font-size: 0.75rem;
		font-weight: 500;
		background: oklch(0.35 0.12 145);
		border: 1px solid oklch(0.45 0.15 145);
		border-radius: 5px;
		color: oklch(0.95 0.05 145);
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: ui-monospace, monospace;
	}

	.export-now-btn:hover:not(:disabled) {
		background: oklch(0.40 0.15 145);
	}

	.export-now-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-spinner.small {
		width: 12px;
		height: 12px;
		border-width: 1.5px;
	}

	/* Drag-and-drop styles */
	.drag-over {
		outline: 2px dashed oklch(0.60 0.15 200);
		outline-offset: -2px;
	}

	.drag-overlay {
		position: absolute;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		background: oklch(0.12 0.04 200 / 0.92);
		border-radius: 10px;
		pointer-events: none;
	}

	.drag-overlay-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 2rem;
	}

	.drag-icon {
		width: 48px;
		height: 48px;
		color: oklch(0.70 0.15 200);
	}

	.drag-text {
		font-size: 1rem;
		font-weight: 600;
		color: oklch(0.85 0.10 200);
		font-family: ui-monospace, monospace;
	}

	.drag-hint {
		font-size: 0.75rem;
		color: oklch(0.60 0.08 200);
	}

	/* Namespace drop target highlight */
	.namespace-drop-target {
		background: oklch(0.22 0.08 200) !important;
		box-shadow: inset 0 0 0 2px oklch(0.55 0.15 200);
	}

	/* Processing bar */
	.processing-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1rem;
		font-size: 0.8rem;
		font-family: ui-monospace, monospace;
		background: oklch(0.18 0.04 200);
		color: oklch(0.75 0.10 200);
		border-bottom: 1px solid oklch(0.28 0.04 200);
	}

	/* Namespace picker overlay */
	.namespace-picker-overlay {
		position: absolute;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		background: oklch(0 0 0 / 0.6);
		border-radius: 10px;
	}

	.namespace-picker-modal {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1.25rem;
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 10px;
		box-shadow: 0 8px 32px oklch(0 0 0 / 0.4);
		min-width: 280px;
		max-width: 360px;
	}

	.picker-title {
		font-size: 0.9rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		font-family: ui-monospace, monospace;
		margin: 0;
	}

	.picker-hint {
		font-size: 0.7rem;
		color: oklch(0.50 0.02 250);
		margin: 0;
	}

	.picker-options {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.picker-option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: oklch(0.20 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: ui-monospace, monospace;
	}

	.picker-option:hover {
		background: oklch(0.25 0.04 200);
		border-color: oklch(0.40 0.10 200);
	}

	.picker-icon {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
	}

	.picker-label {
		font-size: 0.8rem;
		font-weight: 500;
		color: oklch(0.80 0.02 250);
		flex: 1;
	}

	.picker-count {
		font-size: 0.65rem;
		color: oklch(0.50 0.02 250);
		background: oklch(0.22 0.02 250);
		padding: 0.125rem 0.375rem;
		border-radius: 8px;
	}

	.picker-new {
		display: flex;
		gap: 0.375rem;
		padding-top: 0.375rem;
		border-top: 1px solid oklch(0.25 0.02 250);
		margin-top: 0.25rem;
	}

	.picker-new-input {
		flex: 1;
		padding: 0.375rem 0.625rem;
		font-size: 0.75rem;
		font-family: ui-monospace, monospace;
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 5px;
		color: oklch(0.85 0.02 250);
		outline: none;
	}

	.picker-new-input:focus {
		border-color: oklch(0.50 0.10 200);
		box-shadow: 0 0 0 2px oklch(0.50 0.10 200 / 0.2);
	}

	.picker-new-input::placeholder {
		color: oklch(0.45 0.02 250);
	}

	.picker-new-btn {
		padding: 0.375rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 500;
		background: oklch(0.35 0.10 200);
		border: 1px solid oklch(0.45 0.12 200);
		border-radius: 5px;
		color: oklch(0.90 0.08 200);
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: ui-monospace, monospace;
	}

	.picker-new-btn:hover:not(:disabled) {
		background: oklch(0.40 0.12 200);
	}

	.picker-new-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.picker-cancel {
		padding: 0.375rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 500;
		background: transparent;
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 5px;
		color: oklch(0.60 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: ui-monospace, monospace;
		align-self: flex-end;
	}

	.picker-cancel:hover {
		background: oklch(0.22 0.02 250);
		color: oklch(0.80 0.02 250);
	}

</style>
