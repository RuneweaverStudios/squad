<script lang="ts">
	/**
	 * KeyboardShortcutsEditor Component
	 *
	 * Displays and manages keyboard shortcuts for:
	 * 1. Global app shortcuts (Alt+N, Alt+E, etc.) - configurable with defaults
	 * 2. Slash command shortcuts (user-assigned)
	 *
	 * @see ide/src/lib/stores/keyboardShortcuts.svelte.ts for store API
	 * @see ide/src/lib/stores/configStore.svelte.ts for commands data
	 */

	import { onMount } from 'svelte';
	import {
		getAllShortcuts,
		getShortcut,
		setShortcut,
		validateShortcut,
		checkShortcutConflict,
		getDisplayShortcut,
		findCommandWithShortcut,
		initKeyboardShortcuts,
		clearAllShortcuts,
		// Global shortcut functions
		getAllGlobalShortcuts,
		setGlobalShortcut,
		resetGlobalShortcut,
		resetAllGlobalShortcuts,
		findGlobalShortcutConflict,
		type GlobalShortcutDef
	} from '$lib/stores/keyboardShortcuts.svelte';
	import {
		loadCommands,
		getCommands,
		isCommandsLoading
	} from '$lib/stores/configStore.svelte';
	import type { SlashCommand } from '$lib/types/config';

	// Non-editable shortcuts (system/browser level)
	const systemShortcuts = [
		{ key: 'Alt+1-9', description: 'Jump to Session by Position', context: 'Work page' },
		{ key: 'Escape', description: 'Close Modals/Drawers', context: 'Global' },
	];

	// State
	let loading = $state(true);
	let editingItem = $state<string | null>(null);  // Can be command invocation OR global shortcut id
	let editingType = $state<'command' | 'global' | null>(null);
	let editValue = $state('');
	let error = $state<string | null>(null);
	let warning = $state<string | null>(null);
	let success = $state<string | null>(null);
	let showClearConfirm = $state(false);
	let showResetGlobalConfirm = $state(false);
	let filterText = $state('');
	let showGlobalShortcuts = $state(true);

	// Reactive data
	let commands = $derived(getCommands());
	let shortcuts = $derived(getAllShortcuts());
	let globalShortcutsList = $derived(getAllGlobalShortcuts());

	// Group global shortcuts by category
	let groupedGlobalShortcuts = $derived.by(() => {
		const groups = new Map<string, Array<GlobalShortcutDef & { currentShortcut: string; isCustom: boolean }>>();

		for (const shortcut of globalShortcutsList) {
			const existing = groups.get(shortcut.category) || [];
			groups.set(shortcut.category, [...existing, shortcut]);
		}

		// Order: global, session, navigation
		const order = ['global', 'session', 'navigation'];
		return order
			.filter(cat => groups.has(cat))
			.map(cat => [cat, groups.get(cat)!] as const);
	});

	// Count custom global shortcuts
	let customGlobalCount = $derived(globalShortcutsList.filter(s => s.isCustom).length);

	// Filter commands based on search
	let filteredCommands = $derived.by(() => {
		if (!filterText.trim()) return commands;
		const search = filterText.toLowerCase();
		return commands.filter(cmd =>
			cmd.name.toLowerCase().includes(search) ||
			cmd.invocation.toLowerCase().includes(search) ||
			cmd.namespace.toLowerCase().includes(search) ||
			(getShortcut(cmd.invocation) || '').toLowerCase().includes(search)
		);
	});

	// Group commands by namespace
	let groupedCommands = $derived.by(() => {
		const groups = new Map<string, SlashCommand[]>();

		for (const cmd of filteredCommands) {
			const existing = groups.get(cmd.namespace) || [];
			groups.set(cmd.namespace, [...existing, cmd]);
		}

		// Sort namespaces: squad first, then local, then alphabetically
		const sortedEntries = Array.from(groups.entries()).sort(([a], [b]) => {
			if (a === 'squad') return -1;
			if (b === 'squad') return 1;
			if (a === 'local') return -1;
			if (b === 'local') return 1;
			return a.localeCompare(b);
		});

		return sortedEntries;
	});

	// Count of assigned shortcuts
	let assignedCount = $derived(Object.keys(shortcuts).length);
	let totalCommands = $derived(commands.length);

	onMount(async () => {
		initKeyboardShortcuts();
		await loadCommands();
		loading = false;
	});

	// Start editing a command shortcut
	function startEditingCommand(invocation: string) {
		editingItem = invocation;
		editingType = 'command';
		editValue = getShortcut(invocation) || '';
		error = null;
		warning = null;
	}

	// Start editing a global shortcut
	function startEditingGlobal(id: string, currentShortcut: string) {
		editingItem = id;
		editingType = 'global';
		editValue = currentShortcut;
		error = null;
		warning = null;
	}

	function cancelEditing() {
		editingItem = null;
		editingType = null;
		editValue = '';
		error = null;
		warning = null;
	}

	function handleKeydown(event: KeyboardEvent) {
		// Capture keyboard shortcut
		if (editingItem && event.key !== 'Escape' && event.key !== 'Enter' && event.key !== 'Tab') {
			event.preventDefault();

			const parts: string[] = [];
			if (event.ctrlKey) parts.push('Ctrl');
			if (event.altKey) parts.push('Alt');
			if (event.shiftKey) parts.push('Shift');
			if (event.metaKey) parts.push('Meta');

			// Add the key if it's not a modifier
			const key = event.key;
			if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
				parts.push(key.length === 1 ? key.toUpperCase() : key);
			}

			if (parts.length > 0) {
				editValue = parts.join('+');
				validateCurrentShortcut();
			}
		}

		// Handle escape to cancel
		if (event.key === 'Escape') {
			cancelEditing();
		}

		// Handle enter to save
		if (event.key === 'Enter' && editingItem) {
			saveShortcut();
		}
	}

	function validateCurrentShortcut() {
		error = null;
		warning = null;

		if (!editValue.trim()) return;

		// Validate format
		const validationError = validateShortcut(editValue);
		if (validationError) {
			error = validationError;
			return;
		}

		if (editingType === 'command') {
			// Check for conflicts with other commands
			const conflictingCommand = findCommandWithShortcut(editValue);
			if (conflictingCommand && conflictingCommand !== editingItem) {
				error = `Already assigned to ${conflictingCommand}`;
				return;
			}

			// Check for conflicts with global shortcuts
			const conflictingGlobal = findGlobalShortcutConflict(editValue);
			if (conflictingGlobal) {
				const globalDef = globalShortcutsList.find(s => s.id === conflictingGlobal);
				error = `Conflicts with global shortcut: ${globalDef?.description || conflictingGlobal}`;
				return;
			}
		} else if (editingType === 'global') {
			// Check for conflicts with other global shortcuts
			const conflictingGlobal = findGlobalShortcutConflict(editValue, editingItem || undefined);
			if (conflictingGlobal) {
				const globalDef = globalShortcutsList.find(s => s.id === conflictingGlobal);
				error = `Conflicts with: ${globalDef?.description || conflictingGlobal}`;
				return;
			}

			// Check for conflicts with command shortcuts
			const conflictingCommand = findCommandWithShortcut(editValue);
			if (conflictingCommand) {
				error = `Conflicts with command: ${conflictingCommand}`;
				return;
			}
		}

		// Check for browser conflicts
		const conflictWarning = checkShortcutConflict(editValue);
		if (conflictWarning) {
			warning = conflictWarning;
		}
	}

	function saveShortcut() {
		if (!editingItem || !editingType) return;

		// Validate before saving
		if (editValue.trim()) {
			const validationError = validateShortcut(editValue);
			if (validationError) {
				error = validationError;
				return;
			}

			if (editingType === 'command') {
				const conflictingCommand = findCommandWithShortcut(editValue);
				if (conflictingCommand && conflictingCommand !== editingItem) {
					error = `Already assigned to ${conflictingCommand}`;
					return;
				}
			} else {
				const conflictingGlobal = findGlobalShortcutConflict(editValue, editingItem);
				if (conflictingGlobal) {
					const globalDef = globalShortcutsList.find(s => s.id === conflictingGlobal);
					error = `Conflicts with: ${globalDef?.description || conflictingGlobal}`;
					return;
				}
			}
		}

		// Save based on type
		if (editingType === 'command') {
			setShortcut(editingItem, editValue.trim() || undefined);
			success = editValue.trim()
				? `Shortcut saved: ${getDisplayShortcut(editValue)}`
				: 'Shortcut removed';
		} else {
			setGlobalShortcut(editingItem, editValue.trim() || undefined);
			success = editValue.trim()
				? `Shortcut changed to: ${getDisplayShortcut(editValue)}`
				: 'Reset to default';
		}

		cancelEditing();

		// Clear success after 2s
		setTimeout(() => {
			success = null;
		}, 2000);
	}

	function removeCommandShortcut(invocation: string) {
		setShortcut(invocation, undefined);
		success = 'Shortcut removed';
		setTimeout(() => {
			success = null;
		}, 2000);
	}

	function handleResetGlobalShortcut(id: string) {
		resetGlobalShortcut(id);
		success = 'Reset to default';
		setTimeout(() => {
			success = null;
		}, 2000);
	}

	function handleClearAll() {
		clearAllShortcuts();
		showClearConfirm = false;
		success = 'All command shortcuts cleared';
		setTimeout(() => {
			success = null;
		}, 2000);
	}

	function handleResetAllGlobal() {
		resetAllGlobalShortcuts();
		showResetGlobalConfirm = false;
		success = 'All global shortcuts reset to defaults';
		setTimeout(() => {
			success = null;
		}, 2000);
	}

	// Category labels for display
	const categoryLabels: Record<string, string> = {
		global: 'Global Actions',
		session: 'Session Actions',
		navigation: 'Navigation'
	};
</script>

<div class="shortcuts-editor">
	<!-- Header -->
	<div class="mb-4">
		<h2 class="text-lg font-semibold text-base-content">Keyboard Shortcuts</h2>
		<p class="text-sm text-base-content/60 mt-1">
			View global shortcuts and assign custom shortcuts to slash commands.
		</p>
	</div>

	<!-- Status messages -->
	{#if success}
		<div class="alert alert-success mb-4 py-2">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
				<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
			</svg>
			<span>{success}</span>
		</div>
	{/if}

	<!-- Global App Shortcuts Section -->
	<div class="collapse collapse-arrow bg-base-200/50 rounded-lg mb-6">
		<input type="checkbox" checked={showGlobalShortcuts} onchange={(e) => showGlobalShortcuts = e.currentTarget.checked} />
		<div class="collapse-title font-medium flex items-center gap-2">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-info" viewBox="0 0 20 20" fill="currentColor">
				<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
			</svg>
			Global App Shortcuts
			<span class="badge badge-sm badge-ghost">{globalShortcutsList.length}</span>
			{#if customGlobalCount > 0}
				<span class="badge badge-sm badge-info">{customGlobalCount} customized</span>
			{/if}
			<!-- Reset button in header (stops event propagation to prevent collapse toggle) -->
			{#if customGlobalCount > 0}
				<button
					class="btn btn-ghost btn-sm btn-square ml-auto mr-2"
					onclick={(e) => { e.stopPropagation(); showResetGlobalConfirm = true; }}
					title="Reset all to defaults"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
					</svg>
				</button>
			{/if}
		</div>
		<div class="collapse-content">
			<div class="flex items-center justify-between mb-3">
				<p class="text-xs text-base-content/60">
					Click any shortcut to customize. These work from anywhere (unless you're typing in an input field).
				</p>
				{#if showResetGlobalConfirm}
					<div class="flex items-center gap-2">
						<span class="text-sm text-warning">Reset all to defaults?</span>
						<button class="btn btn-error btn-xs" onclick={handleResetAllGlobal}>Yes, Reset</button>
						<button class="btn btn-ghost btn-xs" onclick={() => showResetGlobalConfirm = false}>Cancel</button>
					</div>
				{/if}
			</div>

			<!-- Grouped by category -->
			{#each groupedGlobalShortcuts as [category, shortcuts]}
				<div class="mb-4">
					<h4 class="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-2">
						{categoryLabels[category] || category}
					</h4>
					<div class="space-y-1">
						{#each shortcuts as shortcut}
							{@const isEditing = editingItem === shortcut.id && editingType === 'global'}

							<div
								class="shortcut-row flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-base-100/50 transition-colors"
								class:bg-base-100={isEditing}
							>
								<div class="flex-1 min-w-0">
									<span class="text-sm">{shortcut.description}</span>
									{#if shortcut.context}
										<span class="text-xs text-base-content/40 ml-2">({shortcut.context})</span>
									{/if}
								</div>

								<div class="flex items-center gap-2 shrink-0">
									{#if isEditing}
										<div class="flex flex-col items-end gap-1">
											<div class="flex items-center gap-2">
												<input
													type="text"
													class="input input-bordered input-sm w-40 font-mono text-center"
													class:input-error={error}
													class:input-warning={warning && !error}
													placeholder="Press keys..."
													bind:value={editValue}
													onkeydown={handleKeydown}
													autofocus
												/>
												<button
													class="btn btn-success btn-sm btn-square"
													onclick={saveShortcut}
													disabled={!!error}
													title="Save (Enter)"
												>
													<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
														<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
													</svg>
												</button>
												<button
													class="btn btn-ghost btn-sm btn-square"
													onclick={cancelEditing}
													title="Cancel (Esc)"
												>
													<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
														<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
													</svg>
												</button>
											</div>
											{#if error}
												<span class="text-xs text-error">{error}</span>
											{:else if warning}
												<span class="text-xs text-warning">{warning}</span>
											{/if}
										</div>
									{:else}
										<button
											class="kbd kbd-sm font-mono cursor-pointer hover:bg-base-300 transition-colors"
											onclick={() => startEditingGlobal(shortcut.id, shortcut.currentShortcut)}
											title="Click to edit"
										>
											{getDisplayShortcut(shortcut.currentShortcut)}
										</button>
										{#if shortcut.isCustom}
											<span class="badge badge-xs badge-info">custom</span>
											<button
												class="btn btn-ghost btn-xs btn-square opacity-50 hover:opacity-100"
												onclick={() => handleResetGlobalShortcut(shortcut.id)}
												title="Reset to default ({shortcut.defaultShortcut})"
											>
												<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
													<path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd" />
												</svg>
											</button>
										{/if}
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}

			<!-- Non-editable system shortcuts -->
			{#if systemShortcuts.length > 0}
				<div class="mt-4 pt-3 border-t border-base-300">
					<h4 class="text-xs font-semibold text-base-content/40 uppercase tracking-wide mb-2">
						System (Non-configurable)
					</h4>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
						{#each systemShortcuts as shortcut}
							<div class="flex items-center justify-between px-3 py-2 rounded-lg bg-base-100/30 opacity-60">
								<div class="flex-1">
									<span class="text-sm">{shortcut.description}</span>
									{#if shortcut.context}
										<span class="text-xs text-base-content/40 ml-2">({shortcut.context})</span>
									{/if}
								</div>
								<kbd class="kbd kbd-sm font-mono">{shortcut.key}</kbd>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Command Shortcuts Section Header -->
	<div class="flex items-center gap-2 mb-4">
		<h3 class="text-base font-semibold text-base-content">Command Shortcuts</h3>
		<span class="text-sm text-base-content/50">({assignedCount} / {totalCommands} assigned)</span>
	</div>

	<!-- Search and actions -->
	<div class="flex items-center gap-3 mb-4">
		<div class="flex-1">
			<input
				type="text"
				placeholder="Filter commands..."
				class="input input-bordered input-sm w-full max-w-xs"
				bind:value={filterText}
			/>
		</div>
		<div class="flex gap-2">
			{#if showClearConfirm}
				<span class="text-sm text-warning mr-2">Clear all shortcuts?</span>
				<button class="btn btn-error btn-sm" onclick={handleClearAll}>Yes, Clear</button>
				<button class="btn btn-ghost btn-sm" onclick={() => showClearConfirm = false}>Cancel</button>
			{:else if assignedCount > 0}
				<button
					class="btn btn-ghost btn-sm text-error"
					onclick={() => showClearConfirm = true}
				>
					Clear All
				</button>
			{/if}
		</div>
	</div>

	<!-- Loading state -->
	{#if loading || isCommandsLoading()}
		<div class="flex items-center justify-center py-12">
			<span class="loading loading-spinner loading-lg"></span>
		</div>
	{:else if commands.length === 0}
		<div class="text-center py-12 text-base-content/60">
			<p>No commands found.</p>
			<p class="text-sm mt-1">Commands are loaded from your project's commands directory.</p>
		</div>
	{:else if filteredCommands.length === 0}
		<div class="text-center py-8 text-base-content/60">
			<p>No commands match "{filterText}"</p>
			<button class="btn btn-ghost btn-sm mt-2" onclick={() => filterText = ''}>
				Clear filter
			</button>
		</div>
	{:else}
		<!-- Commands list grouped by namespace -->
		<div class="space-y-6">
			{#each groupedCommands as [namespace, cmds]}
				<div class="shortcuts-group">
					<h3 class="text-sm font-semibold text-base-content/70 mb-2 flex items-center gap-2">
						<span class="badge badge-sm badge-outline">{namespace}</span>
						<span class="text-base-content/40">{cmds.length} command{cmds.length !== 1 ? 's' : ''}</span>
					</h3>

					<div class="space-y-1">
						{#each cmds as cmd}
							{@const currentShortcut = getShortcut(cmd.invocation)}
							{@const isEditing = editingItem === cmd.invocation && editingType === 'command'}

							<div
								class="shortcut-row flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-base-200/50 transition-colors"
								class:bg-base-200={isEditing}
							>
								<!-- Command info -->
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2">
										<code class="text-sm font-mono text-primary">{cmd.invocation}</code>
									</div>
									{#if cmd.frontmatter?.description}
										<p class="text-xs text-base-content/50 truncate mt-0.5">{cmd.frontmatter?.description}</p>
									{/if}
								</div>

								<!-- Shortcut display/edit -->
								<div class="flex items-center gap-2 shrink-0">
									{#if isEditing}
										<div class="flex flex-col items-end gap-1">
											<div class="flex items-center gap-2">
												<input
													type="text"
													class="input input-bordered input-sm w-40 font-mono text-center"
													class:input-error={error}
													class:input-warning={warning && !error}
													placeholder="Press keys..."
													bind:value={editValue}
													onkeydown={handleKeydown}
													autofocus
												/>
												<button
													class="btn btn-success btn-sm btn-square"
													onclick={saveShortcut}
													disabled={!!error}
													title="Save (Enter)"
												>
													<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
														<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
													</svg>
												</button>
												<button
													class="btn btn-ghost btn-sm btn-square"
													onclick={cancelEditing}
													title="Cancel (Esc)"
												>
													<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
														<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
													</svg>
												</button>
											</div>
											{#if error}
												<span class="text-xs text-error">{error}</span>
											{:else if warning}
												<span class="text-xs text-warning">{warning}</span>
											{/if}
										</div>
									{:else}
										{#if currentShortcut}
											<kbd class="kbd kbd-sm font-mono">{getDisplayShortcut(currentShortcut)}</kbd>
											<button
												class="btn btn-ghost btn-sm btn-square opacity-50 hover:opacity-100"
												onclick={() => startEditingCommand(cmd.invocation)}
												title="Edit shortcut"
											>
												<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
													<path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
												</svg>
											</button>
											<button
												class="btn btn-ghost btn-sm btn-square opacity-50 hover:opacity-100 text-error"
												onclick={() => removeCommandShortcut(cmd.invocation)}
												title="Remove shortcut"
											>
												<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
													<path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
												</svg>
											</button>
										{:else}
											<button
												class="btn btn-ghost btn-sm text-base-content/50 hover:text-base-content"
												onclick={() => startEditingCommand(cmd.invocation)}
											>
												<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
													<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
												</svg>
												Add shortcut
											</button>
										{/if}
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Help text -->
	<div class="mt-6 pt-4 border-t border-base-300">
		<h4 class="text-sm font-semibold text-base-content/70 mb-2">Tips</h4>
		<ul class="text-xs text-base-content/50 space-y-1">
			<li>• Click "Add shortcut" and press your desired key combination</li>
			<li>• Shortcuts must include Alt, Ctrl, or Meta/Cmd modifier</li>
			<li>• Avoid common browser shortcuts like Ctrl+C, Ctrl+V</li>
			<li>• Alt+key combinations are generally safe to use</li>
			<li>• Shortcuts are saved in your browser's localStorage</li>
		</ul>
	</div>
</div>

<style>
	.shortcuts-editor {
		max-width: 800px;
	}

	.shortcut-row:hover .btn-ghost {
		opacity: 0.7;
	}
</style>
