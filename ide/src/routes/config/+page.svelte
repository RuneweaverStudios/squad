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
	 * @see ide/src/lib/stores/configStore.svelte.ts for state management
	 * @see ide/src/lib/components/config/ for sub-components
	 */

	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { fade, fly } from 'svelte/transition';

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
	import ProjectEditor from '$lib/components/config/ProjectEditor.svelte';
	import McpConfigEditor from '$lib/components/config/McpConfigEditor.svelte';
	import HooksEditor from '$lib/components/config/HooksEditor.svelte';
	import ClaudeMdList from '$lib/components/config/ClaudeMdList.svelte';
	import ClaudeMdEditor from '$lib/components/config/ClaudeMdEditor.svelte';
	import DocsList from '$lib/components/config/DocsList.svelte';
	import DocsEditor from '$lib/components/config/DocsEditor.svelte';
	import DefaultsEditor from '$lib/components/config/DefaultsEditor.svelte';
	import TemplatesEditor from '$lib/components/config/TemplatesEditor.svelte';
	import StateActionsEditor from '$lib/components/config/StateActionsEditor.svelte';
	import KeyboardShortcutsEditor from '$lib/components/config/KeyboardShortcutsEditor.svelte';
	import SwarmSettingsEditor from '$lib/components/config/SwarmSettingsEditor.svelte';
	import ToolsList from '$lib/components/config/ToolsList.svelte';
	import ToolsEditor from '$lib/components/config/ToolsEditor.svelte';
	import CommitMessageSettingsEditor from '$lib/components/config/CommitMessageSettingsEditor.svelte';
	import CredentialsEditor from '$lib/components/config/CredentialsEditor.svelte';
	import LlmProviderEditor from '$lib/components/config/LlmProviderEditor.svelte';
	import type { SlashCommand, ProjectConfig, HooksConfig } from '$lib/types/config';
	import { successToast, errorToast } from '$lib/stores/toasts.svelte';

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

	// Project editor state
	let isProjectEditorOpen = $state(false);
	let editingProject = $state<{ key: string; config: ProjectConfig } | null>(null);

	// CLAUDE.md editor state
	interface ClaudeMdFile {
		path: string;
		displayName: string;
		location: string;
		lastModified: string;
		size: number;
	}
	let selectedClaudeMdFile = $state<ClaudeMdFile | null>(null);

	// Docs editor state
	interface DocFile {
		filename: string;
		title: string;
		path: string;
	}
	let selectedDocFile = $state<DocFile | null>(null);

	// Derived store values
	const projects = $derived(getProjects());
	const projectsLoading = $derived(isProjectsLoading());
	const projectsError = $derived(getProjectsError());

	// Tools editor state
	interface ToolFile {
		path: string;
		name: string;
		type: 'bash' | 'js' | 'markdown' | 'unknown';
	}
	let selectedTool = $state<ToolFile | null>(null);

	// Valid tabs for URL sync
	const validTabs = ['commands', 'tools', 'projects', 'swarm', 'defaults', 'credentials', 'llm', 'mcp', 'hooks', 'claude', 'docs', 'templates', 'actions', 'shortcuts', 'commit'];

	// Sync activeTab from URL query parameter
	$effect(() => {
		const tabParam = $page.url.searchParams.get('tab');
		if (tabParam && validTabs.includes(tabParam)) {
			activeTab = tabParam;
		}
	});

	// Auto-open project editor if edit param is present
	let editParamHandled = $state(false);
	$effect(() => {
		const editParam = $page.url.searchParams.get('edit');
		if (editParam && !editParamHandled && projects && projects.length > 0) {
			// Find project by key extracted from path (like handleEditProject does)
			const projectToEdit = projects.find(
				(p: ProjectConfig) => {
					const key = p.path.split('/').pop() || p.name.toLowerCase();
					return key.toLowerCase() === editParam.toLowerCase() ||
						p.name?.toLowerCase() === editParam.toLowerCase();
				}
			);
			if (projectToEdit) {
				editParamHandled = true;
				// Use setTimeout to avoid effect loop
				setTimeout(() => {
					handleEditProject(projectToEdit);
				}, 100);
			}
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

	// Handle add new command
	function handleAddCommand() {
		editingCommand = null; // null = create mode
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
		// Extract project key from path (last segment)
		const key = project.path.split('/').pop() || project.name.toLowerCase();
		editingProject = { key, config: project };
		isProjectEditorOpen = true;
	}

	// Handle add project
	function handleAddProject() {
		editingProject = null; // null = create mode
		isProjectEditorOpen = true;
	}

	// Handle delete project - call API then reload
	async function handleDeleteProject(project: ProjectConfig) {
		try {
			// Extract project key from path (last segment), same as handleEditProject
			const projectKey = project.path.split('/').pop() || project.name.toLowerCase();

			const response = await fetch('/api/projects', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ project: projectKey })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to delete project');
			}

			successToast(`Project "${project.name}" deleted`, 'Removed from configuration');
			loadProjects();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to delete project';
			errorToast('Delete failed', message);
		}
	}

	// Directory creation confirmation state
	let showCreateDirectoryConfirm = $state(false);
	let pendingProjectKey = $state('');
	let pendingProjectConfig = $state<ProjectConfig | null>(null);
	let pendingDirectoryPath = $state('');

	// Handle project editor save
	async function handleProjectSave(key: string, config: ProjectConfig, createDirectory = false) {
		try {
			const isNewProject = !editingProject; // null means create mode

			if (isNewProject) {
				// Create new project
				const response = await fetch('/api/projects', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						action: 'create',
						key,
						path: config.path,
						name: config.name,
						port: config.port,
						description: config.description,
						active_color: config.colors?.active,
						inactive_color: config.colors?.inactive,
						createDirectory
					})
				});

				if (!response.ok) {
					const data = await response.json();

					// Check if directory doesn't exist and offer to create it
					if (data.directoryNotFound && !createDirectory) {
						pendingProjectKey = key;
						pendingProjectConfig = config;
						pendingDirectoryPath = data.path || config.path;
						showCreateDirectoryConfirm = true;
						return; // Don't throw, wait for user confirmation
					}

					throw new Error(data.error || 'Failed to create project');
				}
				successToast(`Project "${key}" created`, createDirectory ? 'Directory created and added to configuration' : 'Added to configuration');
			} else {
				// Update existing project
				const response = await fetch('/api/projects', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						project: key,
						description: config.description,
						port: config.port,
						server_path: config.server_path,
						database_url: config.database_url,
						active_color: config.colors?.active,
						inactive_color: config.colors?.inactive
					})
				});

				if (!response.ok) {
					const data = await response.json();
					throw new Error(data.error || 'Failed to update project');
				}
				successToast(`Project "${key}" saved`, 'Changes applied');
			}

			// Reload projects to reflect the change
			await loadProjects();
		} catch (error) {
			console.error('[Config] Failed to save project:', error);
			const message = error instanceof Error ? error.message : 'Failed to save project';
			errorToast('Failed to save project', message);
			throw error;
		}
	}

	// Handle project editor cancel
	function handleProjectCancel() {
		isProjectEditorOpen = false;
		editingProject = null;
	}

	// Handle project deletion from editor
	function handleProjectDelete(key: string) {
		// Reload projects to reflect the deletion
		loadProjects();
	}

	// Handle directory creation confirmation
	async function handleCreateDirectoryConfirm() {
		if (!pendingProjectConfig) return;

		showCreateDirectoryConfirm = false;

		// Retry the save with createDirectory flag
		await handleProjectSave(pendingProjectKey, pendingProjectConfig, true);

		// Close the project editor on success
		isProjectEditorOpen = false;
		editingProject = null;

		// Clear pending state
		pendingProjectKey = '';
		pendingProjectConfig = null;
		pendingDirectoryPath = '';
	}

	// Cancel directory creation
	function handleCreateDirectoryCancel() {
		showCreateDirectoryConfirm = false;
		pendingProjectKey = '';
		pendingProjectConfig = null;
		pendingDirectoryPath = '';
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
	<title>Config | JAT IDE</title>
	<meta name="description" content="JAT IDE configuration editor. Manage defaults, templates, keyboard shortcuts, and automation settings." />
	<meta property="og:title" content="Config | JAT IDE" />
	<meta property="og:description" content="JAT IDE configuration editor. Manage defaults, templates, keyboard shortcuts, and automation settings." />
	<meta property="og:image" content="/favicons/config.svg" />
	<link rel="icon" href="/favicons/config.svg" />
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
						<CommandsList onEditCommand={handleEditCommand} onAddCommand={handleAddCommand} />
					</div>
				{:else if activeTab === 'tools'}
					<!-- Tools Tab -->
					<div
						role="tabpanel"
						id="tools-panel"
						aria-labelledby="tools-tab"
						class="tools-panel"
						transition:fade={{ duration: 150 }}
					>
						<ToolsList
							selectedPath={selectedTool?.path}
							onSelect={(tool) => (selectedTool = tool)}
						/>
						<ToolsEditor
							toolPath={selectedTool?.path}
							displayName={selectedTool?.name}
							toolType={selectedTool?.type}
						/>
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
				{:else if activeTab === 'swarm'}
					<!-- Swarm Tab -->
					<div
						role="tabpanel"
						id="swarm-panel"
						aria-labelledby="swarm-tab"
						transition:fade={{ duration: 150 }}
					>
						<SwarmSettingsEditor />
					</div>
				{:else if activeTab === 'defaults'}
					<!-- Defaults Tab -->
					<div
						role="tabpanel"
						id="defaults-panel"
						aria-labelledby="defaults-tab"
						transition:fade={{ duration: 150 }}
					>
						<DefaultsEditor />
					</div>
				{:else if activeTab === 'credentials'}
					<!-- Credentials Tab -->
					<div
						role="tabpanel"
						id="credentials-panel"
						aria-labelledby="credentials-tab"
						transition:fade={{ duration: 150 }}
					>
						<CredentialsEditor />
					</div>
				{:else if activeTab === 'llm'}
					<!-- LLM Provider Tab -->
					<div
						role="tabpanel"
						id="llm-panel"
						aria-labelledby="llm-tab"
						transition:fade={{ duration: 150 }}
					>
						<LlmProviderEditor />
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
						class="docs-panel"
						transition:fade={{ duration: 150 }}
					>
						<DocsList
							selectedPath={selectedDocFile?.path}
							onSelect={(file) => (selectedDocFile = file)}
						/>
						<DocsEditor
							filename={selectedDocFile?.filename}
							displayName={selectedDocFile?.title}
						/>
					</div>
				{:else if activeTab === 'templates'}
					<!-- Templates Tab -->
					<div
						role="tabpanel"
						id="templates-panel"
						aria-labelledby="templates-tab"
						transition:fade={{ duration: 150 }}
					>
						<TemplatesEditor />
					</div>
				{:else if activeTab === 'actions'}
					<!-- State Actions Tab -->
					<div
						role="tabpanel"
						id="actions-panel"
						aria-labelledby="actions-tab"
						transition:fade={{ duration: 150 }}
					>
						<StateActionsEditor />
					</div>
				{:else if activeTab === 'shortcuts'}
					<!-- Keyboard Shortcuts Tab -->
					<div
						role="tabpanel"
						id="shortcuts-panel"
						aria-labelledby="shortcuts-tab"
						transition:fade={{ duration: 150 }}
					>
						<KeyboardShortcutsEditor />
					</div>
				{:else if activeTab === 'commit'}
					<!-- Commit Message Settings Tab -->
					<div
						role="tabpanel"
						id="commit-panel"
						aria-labelledby="commit-tab"
						transition:fade={{ duration: 150 }}
					>
						<CommitMessageSettingsEditor />
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

<!-- Project Editor Drawer -->
<ProjectEditor
	bind:isOpen={isProjectEditorOpen}
	project={editingProject}
	onSave={handleProjectSave}
	onCancel={handleProjectCancel}
	onDelete={handleProjectDelete}
/>

<!-- Create Directory Confirmation Modal -->
{#if showCreateDirectoryConfirm}
	<div
		class="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4"
		transition:fade={{ duration: 150 }}
		onclick={(e) => e.target === e.currentTarget && handleCreateDirectoryCancel()}
		role="dialog"
		aria-modal="true"
		aria-labelledby="create-dir-title"
	>
		<div
			class="bg-base-100 rounded-xl shadow-2xl max-w-md w-full"
			transition:fly={{ y: 20, duration: 200 }}
		>
			<div class="p-6">
				<div class="flex items-center gap-3 mb-4">
					<div class="w-12 h-12 rounded-full bg-info/10 flex items-center justify-center">
						<svg class="w-6 h-6 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
						</svg>
					</div>
					<div>
						<h3 id="create-dir-title" class="text-lg font-semibold">Create Directory?</h3>
						<p class="text-sm text-base-content/70">The directory doesn't exist yet</p>
					</div>
				</div>

				<p class="mb-4">
					The path <span class="font-mono text-sm bg-base-200 px-2 py-1 rounded">{pendingDirectoryPath}</span> doesn't exist.
				</p>

				<p class="mb-4 text-base-content/80">
					Would you like to create this directory and add the project?
				</p>

				<div class="bg-base-200 rounded-lg p-3 mb-4 text-sm">
					<p class="text-base-content/70">
						<strong>Note:</strong> This will create the directory and any parent directories needed.
					</p>
				</div>

				<div class="flex justify-end gap-2">
					<button
						class="btn btn-ghost"
						onclick={handleCreateDirectoryCancel}
					>
						Cancel
					</button>
					<button
						class="btn btn-info"
						onclick={handleCreateDirectoryConfirm}
					>
						<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
						</svg>
						Create Directory
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

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

	/* Shared Docs panel - side by side layout (same as claude-panel) */
	.docs-panel {
		display: flex;
		gap: 1.5rem;
		min-height: 600px;
	}

	/* Tools panel - side by side layout (same as claude-panel) */
	.tools-panel {
		display: flex;
		gap: 1.5rem;
		min-height: 600px;
	}

	@media (max-width: 900px) {
		.claude-panel {
			flex-direction: column;
		}

		.docs-panel {
			flex-direction: column;
		}

		.tools-panel {
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
