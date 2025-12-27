<script lang="ts">
	/**
	 * StateActionsEditor Component
	 *
	 * Allows users to configure which actions appear in the StatusActionBadge dropdown
	 * for each session state.
	 *
	 * Features:
	 * - View default actions per state
	 * - Add/remove/reorder custom actions
	 * - Add custom slash commands as actions
	 * - Toggle "include defaults" option
	 * - Reset individual states or all to defaults
	 */

	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import {
		loadUserConfig,
		saveUserConfig,
		updateStateActions,
		resetToDefaults,
		getActions,
		hasCustomConfig,
		getStateConfig,
		getIncludeDefaults,
		getIsLoading,
		getIsLoaded,
		getLoadError,
		getUserConfig
	} from '$lib/stores/stateActionsConfig.svelte';
	import {
		BUILTIN_ACTIONS_CATALOG,
		type UserActionConfig,
		type AvailableBuiltinAction,
		type CustomCommandAction
	} from '$lib/config/stateActionsConfig';
	import {
		SESSION_STATE_ACTIONS,
		getSessionStateVisual,
		type SessionState,
		type SessionStateAction
	} from '$lib/config/statusColors';
	import { successToast, errorToast } from '$lib/stores/toasts.svelte';
	import type { SlashCommand } from '$lib/types/config';

	// State
	let selectedState = $state<SessionState | null>(null);
	let editingActions = $state<UserActionConfig[]>([]);
	let includeDefaults = $state(true);
	let isSaving = $state(false);
	let hasChanges = $state(false);

	// Slash commands state
	let slashCommands = $state<SlashCommand[]>([]);
	let commandsLoading = $state(false);
	let commandsError = $state<string | null>(null);
	let showCommandsSection = $state(false);

	// Custom command modal state
	let showCommandModal = $state(false);
	let editingCommand = $state<SlashCommand | null>(null);
	let commandFormData = $state({
		label: '',
		description: '',
		icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z', // terminal icon default
		variant: 'default' as 'default' | 'success' | 'warning' | 'error' | 'info'
	});

	// Get all configurable states
	const states = Object.keys(SESSION_STATE_ACTIONS) as SessionState[];

	// Derived values
	const isLoading = $derived(getIsLoading());
	const isLoaded = $derived(getIsLoaded());
	const loadError = $derived(getLoadError());
	const userConfig = $derived(getUserConfig());

	// Load config on mount
	onMount(() => {
		if (!isLoaded) {
			loadUserConfig();
		}
	});

	// Fetch available slash commands from API
	async function fetchSlashCommands() {
		commandsLoading = true;
		commandsError = null;
		try {
			const response = await fetch('/api/commands');
			if (!response.ok) {
				throw new Error(`Failed to fetch commands: ${response.statusText}`);
			}
			const data = await response.json();
			slashCommands = data.commands || [];
		} catch (err) {
			commandsError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			commandsLoading = false;
		}
	}

	// Toggle slash commands section visibility
	function toggleCommandsSection() {
		showCommandsSection = !showCommandsSection;
		if (showCommandsSection && slashCommands.length === 0 && !commandsLoading) {
			fetchSlashCommands();
		}
	}

	// Open the command customization modal
	function openCommandModal(command: SlashCommand) {
		editingCommand = command;
		// Default label from command name (capitalize and replace hyphens)
		const defaultLabel = command.name
			.split(/[-_]/)
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
		commandFormData = {
			label: defaultLabel,
			description: command.frontmatter?.description || `Run ${command.invocation}`,
			icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
			variant: 'default'
		};
		showCommandModal = true;
	}

	// Close the command modal
	function closeCommandModal() {
		showCommandModal = false;
		editingCommand = null;
	}

	// Add the command as a custom action
	function addCommandAction() {
		if (!editingCommand || !selectedState) return;

		// Create a unique ID for this command action
		const actionId = `cmd-${editingCommand.namespace}-${editingCommand.name}`;

		// Check if already added
		if (editingActions.some((a) => a.type === 'command' && (a as CustomCommandAction).command === editingCommand!.invocation)) {
			errorToast('Already added', `${editingCommand.invocation} is already in the actions list`);
			closeCommandModal();
			return;
		}

		const customAction: CustomCommandAction = {
			type: 'command',
			id: actionId,
			label: commandFormData.label,
			icon: commandFormData.icon,
			variant: commandFormData.variant,
			description: commandFormData.description,
			command: editingCommand.invocation
		};

		editingActions = [...editingActions, customAction];
		hasChanges = true;
		closeCommandModal();
		successToast('Command added', `${editingCommand.invocation} added to actions`);
	}

	// Check if a command is already added
	function isCommandAdded(command: SlashCommand): boolean {
		return editingActions.some(
			(a) => a.type === 'command' && (a as CustomCommandAction).command === command.invocation
		);
	}

	// Get visual config for a state
	function getStateVisual(state: SessionState) {
		return getSessionStateVisual(state);
	}

	// Get default actions for a state
	function getDefaultActions(state: SessionState): SessionStateAction[] {
		return SESSION_STATE_ACTIONS[state] || [];
	}

	// Select a state for editing
	function selectState(state: SessionState) {
		selectedState = state;

		// Load current config for this state
		const stateConfig = getStateConfig(state);
		if (stateConfig) {
			editingActions = [...stateConfig];
			includeDefaults = getIncludeDefaults(state);
		} else {
			// No custom config - start with empty (will use defaults)
			editingActions = [];
			includeDefaults = true;
		}

		hasChanges = false;
	}

	// Add a built-in action to the list
	function addBuiltinAction(action: AvailableBuiltinAction) {
		// Check if already added
		if (editingActions.some((a) => a.type === 'builtin' && a.id === action.id)) {
			return;
		}

		editingActions = [
			...editingActions,
			{ type: 'builtin', id: action.id }
		];
		hasChanges = true;
	}

	// Remove an action from the list
	function removeAction(index: number) {
		editingActions = editingActions.filter((_, i) => i !== index);
		hasChanges = true;
	}

	// Move action up in the list
	function moveUp(index: number) {
		if (index === 0) return;
		const newActions = [...editingActions];
		[newActions[index - 1], newActions[index]] = [newActions[index], newActions[index - 1]];
		editingActions = newActions;
		hasChanges = true;
	}

	// Make action the primary (first) action
	function makePrimary(index: number) {
		if (index === 0) return;
		const newActions = [...editingActions];
		const [action] = newActions.splice(index, 1);
		newActions.unshift(action);
		editingActions = newActions;
		hasChanges = true;
	}

	// Move action down in the list
	function moveDown(index: number) {
		if (index === editingActions.length - 1) return;
		const newActions = [...editingActions];
		[newActions[index], newActions[index + 1]] = [newActions[index + 1], newActions[index]];
		editingActions = newActions;
		hasChanges = true;
	}

	// Toggle include defaults
	function toggleIncludeDefaults() {
		includeDefaults = !includeDefaults;
		hasChanges = true;
	}

	// Save changes for the current state
	async function saveChanges() {
		if (!selectedState || !hasChanges) return;

		isSaving = true;
		try {
			const success = await updateStateActions(selectedState, editingActions, includeDefaults);
			if (success) {
				successToast('Actions saved', `Actions for ${selectedState} updated successfully`);
				hasChanges = false;
			} else {
				errorToast('Save failed', 'Failed to save state actions');
			}
		} catch (err) {
			errorToast('Save failed', err instanceof Error ? err.message : 'Unknown error');
		} finally {
			isSaving = false;
		}
	}

	// Reset current state to defaults
	async function resetCurrentState() {
		if (!selectedState) return;

		isSaving = true;
		try {
			const success = await resetToDefaults(selectedState);
			if (success) {
				successToast('Reset complete', `Actions for ${selectedState} reset to defaults`);
				editingActions = [];
				includeDefaults = true;
				hasChanges = false;
			} else {
				errorToast('Reset failed', 'Failed to reset state actions');
			}
		} catch (err) {
			errorToast('Reset failed', err instanceof Error ? err.message : 'Unknown error');
		} finally {
			isSaving = false;
		}
	}

	// Reset all states to defaults
	async function resetAllStates() {
		isSaving = true;
		try {
			const success = await resetToDefaults();
			if (success) {
				successToast('Reset complete', 'All state actions reset to defaults');
				selectedState = null;
				editingActions = [];
				includeDefaults = true;
				hasChanges = false;
			} else {
				errorToast('Reset failed', 'Failed to reset all state actions');
			}
		} catch (err) {
			errorToast('Reset failed', err instanceof Error ? err.message : 'Unknown error');
		} finally {
			isSaving = false;
		}
	}

	// Get action label from catalog or built-in
	function getActionLabel(action: UserActionConfig): string {
		if (action.type === 'builtin') {
			const catalogAction = BUILTIN_ACTIONS_CATALOG.find((a) => a.id === action.id);
			return catalogAction?.label || action.id;
		}
		return action.label || 'Custom Action';
	}

	// Get action icon from catalog
	function getActionIcon(action: UserActionConfig): string {
		if (action.type === 'builtin') {
			const catalogAction = BUILTIN_ACTIONS_CATALOG.find((a) => a.id === action.id);
			return catalogAction?.icon || '';
		}
		return action.icon || '';
	}

	// Check if an action from catalog is already added
	function isActionAdded(actionId: string): boolean {
		return editingActions.some((a) => a.type === 'builtin' && a.id === actionId);
	}
</script>

<div class="state-actions-editor">
	<!-- Loading State -->
	{#if isLoading}
		<div class="loading-state">
			<span class="loading loading-spinner loading-md"></span>
			<span>Loading configuration...</span>
		</div>
	{:else if loadError}
		<div class="error-state">
			<span class="text-error">Error: {loadError}</span>
			<button class="btn btn-sm btn-ghost" onclick={() => loadUserConfig()}>Retry</button>
		</div>
	{:else}
		<!-- Main Content -->
		<div class="editor-layout">
			<!-- States List (Left Panel) -->
			<div class="states-panel">
				<div class="panel-header">
					<h3>Session States</h3>
					<span class="text-xs opacity-60">{states.length} states</span>
				</div>

				<div class="states-list">
					{#each states as state}
						{@const visual = getStateVisual(state)}
						{@const isCustom = hasCustomConfig(state)}
						<button
							class="state-item"
							class:selected={selectedState === state}
							onclick={() => selectState(state)}
						>
							<span
								class="state-badge"
								style="background: {visual.bgColor}; color: {visual.textColor}; border-color: {visual.borderColor};"
							>
								{visual.shortLabel}
							</span>
							{#if isCustom}
								<span class="custom-badge">Custom</span>
							{/if}
						</button>
					{/each}
				</div>

				<!-- Reset All Button -->
				<div class="panel-footer">
					<button
						class="btn btn-sm btn-ghost btn-error"
						onclick={resetAllStates}
						disabled={isSaving || !userConfig?.states || Object.keys(userConfig.states).length === 0}
					>
						Reset All to Defaults
					</button>
				</div>
			</div>

			<!-- Editor Panel (Right) -->
			<div class="editor-panel">
				{#if selectedState}
					{@const visual = getStateVisual(selectedState)}
					{@const defaultActions = getDefaultActions(selectedState)}

					<div class="editor-header" transition:fade={{ duration: 150 }}>
						<div class="header-title">
							<span
								class="state-badge-lg"
								style="background: {visual.bgColor}; color: {visual.textColor}; border-color: {visual.borderColor};"
							>
								{visual.label}
							</span>
							<h3>Configure Actions</h3>
						</div>

						<div class="header-actions">
							{#if hasChanges}
								<span class="unsaved-badge">Unsaved changes</span>
							{/if}
							<button
								class="btn btn-sm btn-ghost"
								onclick={resetCurrentState}
								disabled={isSaving || !hasCustomConfig(selectedState)}
							>
								Reset to Defaults
							</button>
							<button
								class="btn btn-sm btn-primary"
								onclick={saveChanges}
								disabled={isSaving || !hasChanges}
							>
								{#if isSaving}
									<span class="loading loading-spinner loading-xs"></span>
								{/if}
								Save Changes
							</button>
						</div>
					</div>

					<!-- Include Defaults Toggle -->
					<div class="include-defaults-toggle" transition:slide={{ duration: 150 }}>
						<label class="cursor-pointer flex items-center gap-3">
							<input
								type="checkbox"
								class="toggle toggle-sm toggle-primary"
								checked={includeDefaults}
								onchange={toggleIncludeDefaults}
							/>
							<span class="label-text">
								Include default actions (appended after custom actions)
							</span>
						</label>
					</div>

					<!-- Custom Actions List -->
					<div class="actions-section" transition:slide={{ duration: 150 }}>
						<h4>Custom Actions Order</h4>
						<p class="section-desc">
							The first action is the <strong>primary action</strong> - shown most prominently in the dropdown.
							Use the ⭐ button to quickly set any action as primary.
						</p>

						{#if editingActions.length === 0}
							<div class="empty-actions">
								<span class="opacity-60">No custom actions configured</span>
								<span class="text-xs opacity-40">Add actions from the catalog below</span>
							</div>
						{:else}
							<div class="actions-list">
								{#each editingActions as action, index (action.type + '-' + (action.type === 'builtin' ? action.id : index))}
									<div
										class="action-item"
										class:is-primary={index === 0}
										animate:flip={{ duration: 200 }}
										transition:slide={{ duration: 150 }}
									>
										<div class="action-info">
											{#if getActionIcon(action)}
												<svg class="action-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d={getActionIcon(action)} />
												</svg>
											{/if}
											<span class="action-label">{getActionLabel(action)}</span>
											<span class="action-type-badge">{action.type}</span>
											{#if index === 0}
												<span class="primary-badge">⭐ PRIMARY</span>
											{/if}
										</div>

										<div class="action-controls">
											{#if index !== 0}
												<button
													class="btn btn-xs btn-ghost btn-warning"
													onclick={() => makePrimary(index)}
													title="Make primary (move to top)"
												>
													<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
														<path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
													</svg>
												</button>
											{/if}
											<button
												class="btn btn-xs btn-ghost"
												onclick={() => moveUp(index)}
												disabled={index === 0}
												title="Move up"
											>
												<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
												</svg>
											</button>
											<button
												class="btn btn-xs btn-ghost"
												onclick={() => moveDown(index)}
												disabled={index === editingActions.length - 1}
												title="Move down"
											>
												<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
												</svg>
											</button>
											<button
												class="btn btn-xs btn-ghost btn-error"
												onclick={() => removeAction(index)}
												title="Remove"
											>
												<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
												</svg>
											</button>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Available Actions Catalog -->
					<div class="catalog-section" transition:slide={{ duration: 150 }}>
						<h4>Available Built-in Actions</h4>
						<p class="section-desc">
							Click to add an action to the custom actions list above.
						</p>

						<div class="catalog-grid">
							{#each BUILTIN_ACTIONS_CATALOG as action}
								{@const isAdded = isActionAdded(action.id)}
								<button
									class="catalog-item"
									class:added={isAdded}
									onclick={() => addBuiltinAction(action)}
									disabled={isAdded}
									title={action.description}
								>
									<svg class="catalog-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d={action.icon} />
									</svg>
									<span class="catalog-label">{action.label}</span>
									{#if isAdded}
										<span class="added-badge">Added</span>
									{/if}
								</button>
							{/each}
						</div>
					</div>

					<!-- Slash Commands Section (Collapsible) -->
					<div class="commands-section" transition:slide={{ duration: 150 }}>
						<button class="section-toggle" onclick={toggleCommandsSection}>
							<svg
								class="toggle-icon"
								class:expanded={showCommandsSection}
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
							</svg>
							<h4>Available Slash Commands</h4>
							<span class="text-xs opacity-60">
								{#if slashCommands.length > 0}
									{slashCommands.length} commands
								{:else}
									click to load
								{/if}
							</span>
						</button>

						{#if showCommandsSection}
							<div class="commands-content" transition:slide={{ duration: 150 }}>
								<p class="section-desc">
									Add any slash command as a custom action. Click to configure label, icon, and variant.
								</p>

								{#if commandsLoading}
									<div class="commands-loading">
										<span class="loading loading-spinner loading-sm"></span>
										<span>Loading commands...</span>
									</div>
								{:else if commandsError}
									<div class="commands-error">
										<span class="text-error text-sm">{commandsError}</span>
										<button class="btn btn-xs btn-ghost" onclick={fetchSlashCommands}>Retry</button>
									</div>
								{:else if slashCommands.length === 0}
									<div class="commands-empty">
										<span class="opacity-60 text-sm">No slash commands found</span>
									</div>
								{:else}
									<!-- Group commands by namespace -->
									{@const commandsByNamespace = slashCommands.reduce((acc, cmd) => {
										const ns = cmd.namespace || 'other';
										if (!acc[ns]) acc[ns] = [];
										acc[ns].push(cmd);
										return acc;
									}, {} as Record<string, typeof slashCommands>)}

									{#each Object.entries(commandsByNamespace) as [namespace, commands]}
										<div class="namespace-group">
											<span class="namespace-label">{namespace}</span>
											<div class="commands-grid">
												{#each commands as command}
													{@const cmdAdded = isCommandAdded(command)}
													<button
														class="command-item"
														class:added={cmdAdded}
														onclick={() => openCommandModal(command)}
														disabled={cmdAdded}
														title={command.frontmatter?.description || `Add ${command.invocation} as action`}
													>
														<svg class="command-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
															<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
														</svg>
														<span class="command-label">{command.invocation}</span>
														{#if cmdAdded}
															<span class="added-badge">Added</span>
														{/if}
													</button>
												{/each}
											</div>
										</div>
									{/each}
								{/if}
							</div>
						{/if}
					</div>

					<!-- Default Actions Preview -->
					{#if includeDefaults && defaultActions.length > 0}
						<div class="defaults-preview" transition:slide={{ duration: 150 }}>
							<h4>Default Actions (will be appended)</h4>
							<div class="defaults-list">
								{#each defaultActions as action}
									{@const isOverridden = editingActions.some(
										(a) => a.type === 'builtin' && a.id === action.id
									)}
									<div class="default-item" class:overridden={isOverridden}>
										<svg class="action-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d={action.icon} />
										</svg>
										<span>{action.label}</span>
										{#if isOverridden}
											<span class="overridden-badge">Overridden</span>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{:else}
					<!-- No State Selected -->
					<div class="no-selection">
						<svg class="w-16 h-16 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
							<path stroke-linecap="round" stroke-linejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
						</svg>
						<h3>Configure State Actions</h3>
						<p>
							Select a session state from the left to customize which actions appear
							in the StatusActionBadge dropdown for that state.
						</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Command Customization Modal -->
{#if showCommandModal && editingCommand}
	<div class="modal modal-open" transition:fade={{ duration: 150 }}>
		<div class="modal-box max-w-md">
			<h3 class="font-bold text-lg mb-4">Add Command Action</h3>

			<div class="space-y-4">
				<!-- Command Info -->
				<div class="bg-base-200 rounded-lg p-3">
					<div class="text-sm opacity-70 mb-1">Command</div>
					<code class="text-primary font-mono">{editingCommand.invocation}</code>
					{#if editingCommand.frontmatter?.description}
						<p class="text-sm opacity-70 mt-2">{editingCommand.frontmatter.description}</p>
					{/if}
				</div>

				<!-- Label -->
				<div class="form-control">
					<label class="label">
						<span class="label-text">Display Label</span>
					</label>
					<input
						type="text"
						class="input input-bordered input-sm"
						placeholder="e.g., Run Beads"
						bind:value={commandFormData.label}
					/>
				</div>

				<!-- Description -->
				<div class="form-control">
					<label class="label">
						<span class="label-text">Description (tooltip)</span>
					</label>
					<input
						type="text"
						class="input input-bordered input-sm"
						placeholder="e.g., Convert PRD to Beads tasks"
						bind:value={commandFormData.description}
					/>
				</div>

				<!-- Variant -->
				<div class="form-control">
					<label class="label">
						<span class="label-text">Button Variant</span>
					</label>
					<select class="select select-bordered select-sm" bind:value={commandFormData.variant}>
						<option value="default">Default (Gray)</option>
						<option value="success">Success (Green)</option>
						<option value="warning">Warning (Yellow)</option>
						<option value="error">Error (Red)</option>
						<option value="info">Info (Blue)</option>
					</select>
				</div>

				<!-- Icon Selection (simplified - just show current) -->
				<div class="form-control">
					<label class="label">
						<span class="label-text">Icon</span>
					</label>
					<div class="flex items-center gap-3 p-2 bg-base-200 rounded-lg">
						<svg class="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d={commandFormData.icon} />
						</svg>
						<span class="text-sm opacity-70">Terminal icon (default)</span>
					</div>
				</div>
			</div>

			<div class="modal-action">
				<button class="btn btn-ghost" onclick={closeCommandModal}>Cancel</button>
				<button
					class="btn btn-primary"
					onclick={addCommandAction}
					disabled={!commandFormData.label.trim()}
				>
					Add Action
				</button>
			</div>
		</div>
		<div class="modal-backdrop" onclick={closeCommandModal}></div>
	</div>
{/if}

<style>
	.state-actions-editor {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 500px;
	}

	.loading-state,
	.error-state {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 3rem;
		color: oklch(0.70 0.02 250);
	}

	.editor-layout {
		display: grid;
		grid-template-columns: 240px 1fr;
		gap: 1.5rem;
		height: 100%;
	}

	/* States Panel */
	.states-panel {
		display: flex;
		flex-direction: column;
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 12px;
		overflow: hidden;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		border-bottom: 1px solid oklch(0.25 0.02 250);
	}

	.panel-header h3 {
		font-size: 0.9rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		margin: 0;
	}

	.states-list {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem;
	}

	.state-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.state-item:hover {
		background: oklch(0.20 0.02 250);
	}

	.state-item.selected {
		background: oklch(0.22 0.05 200);
		border-color: oklch(0.40 0.10 200);
	}

	.state-badge {
		padding: 0.2rem 0.5rem;
		font-size: 0.7rem;
		font-weight: 600;
		font-family: ui-monospace, monospace;
		border-radius: 4px;
		border: 1px solid;
	}

	.state-badge-lg {
		padding: 0.3rem 0.75rem;
		font-size: 0.8rem;
		font-weight: 600;
		font-family: ui-monospace, monospace;
		border-radius: 6px;
		border: 1px solid;
	}

	.custom-badge {
		margin-left: auto;
		padding: 0.1rem 0.4rem;
		font-size: 0.65rem;
		font-weight: 500;
		color: oklch(0.80 0.15 200);
		background: oklch(0.30 0.10 200);
		border-radius: 4px;
	}

	.panel-footer {
		padding: 1rem;
		border-top: 1px solid oklch(0.25 0.02 250);
	}

	/* Editor Panel */
	.editor-panel {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 12px;
		padding: 1.5rem;
		overflow-y: auto;
	}

	.editor-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.header-title {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.header-title h3 {
		font-size: 1.1rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.unsaved-badge {
		padding: 0.25rem 0.5rem;
		font-size: 0.7rem;
		font-weight: 500;
		color: oklch(0.90 0.18 60);
		background: oklch(0.30 0.12 60);
		border-radius: 4px;
	}

	.include-defaults-toggle {
		padding: 1rem;
		background: oklch(0.14 0.02 250);
		border-radius: 8px;
	}

	/* Actions Section */
	.actions-section,
	.catalog-section,
	.defaults-preview {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.actions-section h4,
	.catalog-section h4,
	.defaults-preview h4 {
		font-size: 0.9rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		margin: 0;
	}

	.section-desc {
		font-size: 0.8rem;
		color: oklch(0.60 0.02 250);
		margin: 0;
	}

	.empty-actions {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 2rem;
		background: oklch(0.14 0.02 250);
		border: 1px dashed oklch(0.30 0.02 250);
		border-radius: 8px;
	}

	.actions-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.action-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 8px;
	}

	.action-item.is-primary {
		background: oklch(0.22 0.08 85);
		border-color: oklch(0.45 0.15 85);
	}

	.primary-badge {
		padding: 0.1rem 0.4rem;
		font-size: 0.65rem;
		font-weight: 600;
		color: oklch(0.95 0.15 85);
		background: oklch(0.40 0.15 85);
		border-radius: 4px;
		margin-left: 0.5rem;
	}

	.action-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.action-icon {
		width: 18px;
		height: 18px;
		color: oklch(0.70 0.10 200);
	}

	.action-label {
		font-size: 0.85rem;
		font-weight: 500;
		color: oklch(0.85 0.02 250);
	}

	.action-type-badge {
		padding: 0.1rem 0.4rem;
		font-size: 0.65rem;
		font-weight: 500;
		color: oklch(0.65 0.02 250);
		background: oklch(0.25 0.02 250);
		border-radius: 4px;
		text-transform: uppercase;
	}

	.action-controls {
		display: flex;
		gap: 0.25rem;
	}

	/* Catalog Grid */
	.catalog-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 0.5rem;
	}

	.catalog-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.catalog-item:hover:not(.added) {
		background: oklch(0.22 0.05 200);
		border-color: oklch(0.40 0.10 200);
	}

	.catalog-item.added {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.catalog-icon {
		width: 16px;
		height: 16px;
		color: oklch(0.70 0.02 250);
	}

	.catalog-label {
		font-size: 0.8rem;
		color: oklch(0.80 0.02 250);
	}

	.added-badge {
		margin-left: auto;
		padding: 0.1rem 0.3rem;
		font-size: 0.6rem;
		color: oklch(0.70 0.15 145);
		background: oklch(0.25 0.10 145);
		border-radius: 3px;
	}

	/* Defaults Preview */
	.defaults-preview {
		padding: 1rem;
		background: oklch(0.14 0.02 250);
		border-radius: 8px;
	}

	.defaults-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.default-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.75rem;
		background: oklch(0.20 0.02 250);
		border-radius: 6px;
		font-size: 0.8rem;
		color: oklch(0.75 0.02 250);
	}

	.default-item.overridden {
		opacity: 0.5;
		text-decoration: line-through;
	}

	.overridden-badge {
		padding: 0.1rem 0.3rem;
		font-size: 0.6rem;
		color: oklch(0.70 0.15 45);
		background: oklch(0.25 0.10 45);
		border-radius: 3px;
	}

	/* No Selection State */
	.no-selection {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		height: 100%;
		min-height: 300px;
		text-align: center;
	}

	.no-selection h3 {
		font-size: 1.2rem;
		font-weight: 600;
		color: oklch(0.80 0.02 250);
		margin: 0;
	}

	.no-selection p {
		max-width: 400px;
		font-size: 0.9rem;
		color: oklch(0.60 0.02 250);
		margin: 0;
	}

	/* Slash Commands Section */
	.commands-section {
		display: flex;
		flex-direction: column;
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 8px;
		overflow: hidden;
	}

	.section-toggle {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		padding: 0.75rem 1rem;
		background: oklch(0.16 0.02 250);
		border: none;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.section-toggle:hover {
		background: oklch(0.20 0.02 250);
	}

	.section-toggle h4 {
		font-size: 0.9rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		margin: 0;
	}

	.toggle-icon {
		width: 16px;
		height: 16px;
		color: oklch(0.60 0.02 250);
		transition: transform 0.2s ease;
	}

	.toggle-icon.expanded {
		transform: rotate(90deg);
	}

	.commands-content {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
		background: oklch(0.14 0.02 250);
		border-top: 1px solid oklch(0.25 0.02 250);
	}

	.commands-loading,
	.commands-error,
	.commands-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 1.5rem;
	}

	.namespace-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.namespace-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: oklch(0.55 0.02 250);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.commands-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0.5rem;
	}

	.command-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.28 0.05 270);
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.command-item:hover:not(.added) {
		background: oklch(0.22 0.08 270);
		border-color: oklch(0.45 0.15 270);
	}

	.command-item.added {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.command-icon {
		width: 16px;
		height: 16px;
		color: oklch(0.70 0.12 270);
	}

	.command-label {
		font-size: 0.8rem;
		font-family: ui-monospace, monospace;
		color: oklch(0.80 0.02 250);
	}

	/* Modal styles */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		cursor: pointer;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.editor-layout {
			grid-template-columns: 1fr;
		}

		.states-panel {
			max-height: 200px;
		}
	}
</style>
