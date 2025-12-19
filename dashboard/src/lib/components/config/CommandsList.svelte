<script lang="ts">
	/**
	 * CommandsList Component
	 *
	 * Displays all slash commands grouped by namespace in collapsible sections with:
	 * - Namespace-based grouping (jat, local, etc.)
	 * - Collapsible sections per namespace
	 * - New Command button
	 * - Loading and error states
	 *
	 * Follows the RulesList and ProjectsList patterns.
	 *
	 * @see dashboard/src/lib/types/config.ts for SlashCommand type
	 * @see dashboard/src/lib/stores/configStore.svelte.ts for store
	 */

	import { fade, slide } from 'svelte/transition';
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

	// Get reactive state from store
	const commands = $derived(getCommands());
	const commandGroups = $derived(getCommandGroups());
	const loading = $derived(isCommandsLoading());
	const error = $derived(getCommandsError());

	// Track expanded/collapsed state per namespace
	let expandedNamespaces = $state<Set<string>>(new Set(['jat', 'local']));

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
		if (!success) {
			// Could show error toast here
			console.error('Failed to delete command:', command.path);
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
</script>

<div class="commands-list {className}">
	<!-- Header -->
	<header class="list-header">
		<div class="header-left">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="header-icon">
				<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
			</svg>
			<span class="header-title">Slash Commands</span>
			<span class="command-count">{commands.length} command{commands.length !== 1 ? 's' : ''}</span>
		</div>

		<div class="header-right">
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
		{:else}
			<!-- Commands grouped by namespace -->
			{#each commandGroups as group (group.namespace)}
				<div class="namespace-group" transition:slide={{ duration: 200, axis: 'y' }}>
					<!-- Namespace header (collapsible) -->
					<button
						class="namespace-header"
						onclick={() => toggleNamespace(group.namespace)}
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

						<span class="namespace-name">{group.namespace}</span>
						<span class="namespace-count">{group.commands.length}</span>
					</button>

					<!-- Commands in this namespace -->
					{#if isExpanded(group.namespace)}
						<div class="namespace-commands" transition:slide={{ duration: 200, axis: 'y' }}>
							{#each group.commands as command (command.path)}
								<CommandCard
									{command}
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

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
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
</style>
