<script lang="ts">
	/**
	 * Config Page
	 *
	 * Configuration management page with tab-based navigation:
	 * - Commands tab: View and manage slash commands
	 * - Projects tab: View and manage project configurations
	 * - Hooks tab: Visual editor for .claude/settings.json hooks
	 * - CLAUDE.md tab: View project CLAUDE.md documentation
	 *
	 * Tab state syncs with URL query parameter (?tab=commands|projects|hooks|claude).
	 *
	 * @see dashboard/src/lib/stores/configStore.svelte.ts for state management
	 * @see dashboard/src/lib/components/config/ for sub-components
	 */

	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { fade } from 'svelte/transition';

	// Store imports
	import {
		loadCommands,
		loadProjects,
		getProjects,
		isProjectsLoading,
		getProjectsError
	} from '$lib/stores/configStore.svelte';

	// Components
	import ConfigTabs from '$lib/components/config/ConfigTabs.svelte';
	import CommandsList from '$lib/components/config/CommandsList.svelte';
	import CommandEditor from '$lib/components/config/CommandEditor.svelte';
	import ProjectsList from '$lib/components/config/ProjectsList.svelte';
	import McpConfigEditor from '$lib/components/config/McpConfigEditor.svelte';
	import HooksEditor from '$lib/components/config/HooksEditor.svelte';
	import ClaudeMdList from '$lib/components/config/ClaudeMdList.svelte';
	import ClaudeMdEditor from '$lib/components/config/ClaudeMdEditor.svelte';
	import DocsList from '$lib/components/config/DocsList.svelte';
	import type { SlashCommand, ProjectConfig, HooksConfig } from '$lib/types/config';

	// Page state
	let isLoading = $state(true);
	let activeTab = $state('commands');

	// Hooks state
	let hooksLoading = $state(false);
	let hooksError = $state<string | null>(null);
	let hooksEditorRef: HooksEditor | undefined = $state();

	// Command editor state
	let editingCommand = $state<SlashCommand | null>(null);
	let isCommandEditorOpen = $state(false);

	// CLAUDE.md editor state
	interface ClaudeMdFile {
		path: string;
		displayName: string;
		location: string;
		lastModified: string;
		size: number;
	}
	let selectedClaudeMdFile = $state<ClaudeMdFile | null>(null);

	// Derived store values
	const projects = $derived(getProjects());
	const projectsLoading = $derived(isProjectsLoading());
	const projectsError = $derived(getProjectsError());

	// Valid tabs for URL sync
	const validTabs = ['commands', 'projects', 'mcp', 'hooks', 'claude', 'docs'];

	// Sync activeTab from URL query parameter
	$effect(() => {
		const tabParam = $page.url.searchParams.get('tab');
		if (tabParam && validTabs.includes(tabParam)) {
			activeTab = tabParam;
		}
	});

	// Handle tab change - update URL
	function handleTabChange(tabId: string) {
		activeTab = tabId;
		const url = new URL(window.location.href);
		url.searchParams.set('tab', tabId);
		goto(url.pathname + url.search, { replaceState: true, noScroll: true });
	}

	// Handle edit command
	function handleEditCommand(command: SlashCommand) {
		editingCommand = command;
		isCommandEditorOpen = true;
	}

	// Handle command editor save
	function handleCommandSave(command: SlashCommand) {
		// Reload commands to get the updated content
		loadCommands();
	}

	// Handle command editor close
	function handleCommandEditorClose() {
		isCommandEditorOpen = false;
		editingCommand = null;
	}

	// Handle edit project
	function handleEditProject(project: ProjectConfig) {
		console.log('[Config] Edit project:', project.name);
		// TODO: Open project editor modal
	}

	// Handle add project
	function handleAddProject() {
		console.log('[Config] Add new project');
		// TODO: Open project creation modal
	}

	// Handle delete project
	function handleDeleteProject(project: ProjectConfig) {
		console.log('[Config] Delete project:', project.name);
		// TODO: Implement delete
	}

	// Load hooks configuration
	async function loadHooks() {
		hooksLoading = true;
		hooksError = null;

		try {
			const response = await fetch('/api/hooks');
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to load hooks');
			}

			// Pass hooks to the editor component
			if (hooksEditorRef) {
				hooksEditorRef.setHooks(data.hooks || {});
			}
		} catch (err) {
			hooksError = err instanceof Error ? err.message : 'Failed to load hooks';
			console.error('[Config] Failed to load hooks:', err);
		} finally {
			hooksLoading = false;
		}
	}

	// Save hooks configuration
	async function saveHooks(hooks: HooksConfig): Promise<boolean> {
		try {
			const response = await fetch('/api/hooks', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ hooks })
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to save hooks');
			}

			return true;
		} catch (err) {
			console.error('[Config] Failed to save hooks:', err);
			throw err;
		}
	}

	// Load hooks when switching to hooks tab
	$effect(() => {
		if (activeTab === 'hooks' && hooksEditorRef) {
			loadHooks();
		}
	});

	// Load data on mount
	onMount(async () => {
		await Promise.all([loadCommands(), loadProjects()]);
		isLoading = false;
	});
</script>

<svelte:head>
	<title>Config | JAT Dashboard</title>
</svelte:head>

<div class="config-page" style="background: oklch(0.14 0.01 250);">
	{#if isLoading}
		<!-- Skeleton Loading State -->
		<div class="config-content" transition:fade={{ duration: 150 }}>
			<div class="config-header">
				<div class="skeleton h-8 w-32 rounded-lg" style="background: oklch(0.18 0.02 250);"></div>
				<div class="skeleton h-10 w-64 rounded-lg" style="background: oklch(0.18 0.02 250);"></div>
			</div>
			<div class="config-body">
				<div class="skeleton h-96 w-full rounded-lg" style="background: oklch(0.18 0.02 250);"></div>
			</div>
		</div>
	{:else}
		<!-- Main Content -->
		<div class="config-content" transition:fade={{ duration: 150 }}>
			<!-- Header with tabs -->
			<div class="config-header">
				<h1 class="page-title">Configuration</h1>
				<ConfigTabs {activeTab} onTabChange={handleTabChange} />
			</div>

			<!-- Tab content -->
			<div class="config-body">
				{#if activeTab === 'commands'}
					<!-- Commands Tab -->
					<div
						role="tabpanel"
						id="commands-panel"
						aria-labelledby="commands-tab"
						transition:fade={{ duration: 150 }}
					>
						<CommandsList onEditCommand={handleEditCommand} />
					</div>
				{:else if activeTab === 'projects'}
					<!-- Projects Tab -->
					<div
						role="tabpanel"
						id="projects-panel"
						aria-labelledby="projects-tab"
						transition:fade={{ duration: 150 }}
					>
						<ProjectsList
							onEditProject={handleEditProject}
							onAddProject={handleAddProject}
							onDeleteProject={handleDeleteProject}
						/>
					</div>
				{:else if activeTab === 'mcp'}
					<!-- MCP Tab -->
					<div
						role="tabpanel"
						id="mcp-panel"
						aria-labelledby="mcp-tab"
						transition:fade={{ duration: 150 }}
					>
						<McpConfigEditor />
					</div>
				{:else if activeTab === 'hooks'}
					<!-- Hooks Tab -->
					<div
						role="tabpanel"
						id="hooks-panel"
						aria-labelledby="hooks-tab"
						transition:fade={{ duration: 150 }}
					>
						<HooksEditor
							bind:this={hooksEditorRef}
							loading={hooksLoading}
							error={hooksError}
							onSave={saveHooks}
							onRetry={loadHooks}
						/>
					</div>
				{:else if activeTab === 'claude'}
					<!-- CLAUDE.md Tab -->
					<div
						role="tabpanel"
						id="claude-panel"
						aria-labelledby="claude-tab"
						class="claude-panel"
						transition:fade={{ duration: 150 }}
					>
						<ClaudeMdList
							selectedPath={selectedClaudeMdFile?.path}
							onSelect={(file) => (selectedClaudeMdFile = file)}
						/>
						<ClaudeMdEditor
							filePath={selectedClaudeMdFile?.path}
							displayName={selectedClaudeMdFile?.displayName}
						/>
					</div>
				{:else if activeTab === 'docs'}
					<!-- Shared Docs Tab -->
					<div
						role="tabpanel"
						id="docs-panel"
						aria-labelledby="docs-tab"
						transition:fade={{ duration: 150 }}
					>
						<DocsList />
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Command Editor Modal -->
<CommandEditor
	bind:isOpen={isCommandEditorOpen}
	command={editingCommand}
	onSave={handleCommandSave}
	onClose={handleCommandEditorClose}
/>

<style>
	.config-page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.config-content {
		flex: 1;
		padding: 1.5rem;
		max-width: 1400px;
		margin: 0 auto;
		width: 100%;
	}

	/* Header */
	.config-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
	}

	.page-title {
		font-size: 1.5rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
		font-family: ui-monospace, monospace;
	}

	/* Body */
	.config-body {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* CLAUDE.md panel - side by side layout */
	.claude-panel {
		display: flex;
		gap: 1.5rem;
		min-height: 600px;
	}

	@media (max-width: 900px) {
		.claude-panel {
			flex-direction: column;
		}
	}

	/* Commands content */
	.commands-content {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.commands-header {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.commands-count {
		font-size: 0.85rem;
		color: oklch(0.55 0.02 250);
		font-family: ui-monospace, monospace;
	}

	/* Command groups */
	.command-group {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.group-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.group-name {
		font-size: 0.9rem;
		font-weight: 600;
		color: oklch(0.75 0.08 200);
		font-family: ui-monospace, monospace;
	}

	.group-count {
		font-size: 0.7rem;
		color: oklch(0.50 0.02 250);
		background: oklch(0.22 0.02 250);
		padding: 0.125rem 0.5rem;
		border-radius: 10px;
	}

	.commands-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 1rem;
	}

	/* Loading state */
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 1rem;
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

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
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
		padding: 4rem 1rem;
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
		padding: 4rem 1rem;
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

	/* Responsive */
	@media (max-width: 640px) {
		.config-content {
			padding: 1rem;
		}

		.config-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.page-title {
			font-size: 1.25rem;
		}

		.commands-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
