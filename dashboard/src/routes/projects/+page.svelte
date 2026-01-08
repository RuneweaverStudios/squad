<script lang="ts">
	/**
	 * Projects Page - Project Configuration & Management
	 *
	 * Manage JAT projects: add, edit, hide, remove projects.
	 * View project status: beads initialized, active agents, task counts, server status.
	 */

	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import CreateProjectDrawer from '$lib/components/CreateProjectDrawer.svelte';
	import { ProjectsSkeleton } from '$lib/components/skeleton';

	// Types
	interface Project {
		name: string;
		displayName?: string;
		path: string;
		port?: number;
		serverPath?: string;
		description?: string;
		activeColor?: string;
		inactiveColor?: string;
		hidden?: boolean;
		source?: string;
		stats?: {
			hasBeads: boolean;
			agentCount: number;
			taskCount: number;
			openTaskCount: number;
			serverRunning: boolean;
		};
	}

	// State
	let projects = $state<Project[]>([]);
	let hiddenProjects = $state<Project[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let showHidden = $state(false);

	// Drawer states
	let createDrawerOpen = $state(false);
	let editDrawerOpen = $state(false);
	let editingProject = $state<Project | null>(null);

	// Edit form state
	let editForm = $state({
		displayName: '',
		path: '',
		port: '',
		serverPath: '',
		description: '',
		activeColor: '#22c55e',
		inactiveColor: '#6b7280'
	});
	let saving = $state(false);
	let saveError = $state<string | null>(null);

	// Confirmation modal
	let confirmAction = $state<{ type: 'hide' | 'remove'; project: Project } | null>(null);

	async function fetchProjects() {
		try {
			loading = true;
			error = null;

			const response = await fetch('/api/projects?stats=true');
			if (!response.ok) throw new Error('Failed to fetch projects');

			const data = await response.json();
			const allProjects: Project[] = data.projects || [];

			// Separate visible and hidden
			projects = allProjects.filter(p => !p.hidden);
			hiddenProjects = allProjects.filter(p => p.hidden);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load projects';
			console.error('[Projects] Fetch error:', err);
		} finally {
			loading = false;
		}
	}

	function openEditDrawer(project: Project) {
		editingProject = project;
		editForm = {
			displayName: project.displayName || project.name,
			path: project.path,
			port: project.port?.toString() || '',
			serverPath: project.serverPath || '',
			description: project.description || '',
			activeColor: project.activeColor || '#22c55e',
			inactiveColor: project.inactiveColor || '#6b7280'
		};
		saveError = null;
		editDrawerOpen = true;
	}

	function closeEditDrawer() {
		editDrawerOpen = false;
		editingProject = null;
		saveError = null;
	}

	async function saveProject() {
		if (!editingProject) return;

		try {
			saving = true;
			saveError = null;

			const response = await fetch('/api/projects', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project: editingProject.name,
					description: editForm.description || undefined,
					port: editForm.port ? parseInt(editForm.port) : undefined,
					active_color: editForm.activeColor,
					inactive_color: editForm.inactiveColor
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to save project');
			}

			closeEditDrawer();
			await fetchProjects();
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'Failed to save';
		} finally {
			saving = false;
		}
	}

	async function toggleVisibility(project: Project, visible: boolean) {
		try {
			const response = await fetch('/api/projects', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'setVisibility',
					projectName: project.name,
					visible
				})
			});

			if (!response.ok) throw new Error('Failed to update visibility');

			await fetchProjects();
		} catch (err) {
			console.error('[Projects] Toggle visibility error:', err);
		}
		confirmAction = null;
	}

	async function removeProject(project: Project) {
		try {
			const response = await fetch('/api/projects', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ project: project.name })
			});

			if (!response.ok) throw new Error('Failed to remove project');

			await fetchProjects();
		} catch (err) {
			console.error('[Projects] Remove error:', err);
		}
		confirmAction = null;
	}

	async function initBeads(project: Project) {
		try {
			const response = await fetch('/api/projects/init', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: project.path })
			});

			if (!response.ok) throw new Error('Failed to initialize Beads');

			await fetchProjects();
		} catch (err) {
			console.error('[Projects] Init beads error:', err);
		}
	}

	function handleProjectCreated() {
		createDrawerOpen = false;
		fetchProjects();
	}

	onMount(() => {
		fetchProjects();
	});
</script>

<svelte:head>
	<title>Projects | JAT Dashboard</title>
	<link rel="icon" href="/favicons/projects.svg" />
</svelte:head>

<div class="h-full bg-base-200 flex flex-col overflow-auto">
	<!-- Header -->
	<div class="sticky top-0 z-30 bg-base-200 border-b border-base-300 px-6 py-4">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-bold font-mono uppercase tracking-wider text-base-content">Projects</h1>
				<p class="text-xs font-mono text-base-content/60 mt-1 tracking-wide">
					Manage your JAT projects and their configuration
				</p>
			</div>
			<button
				class="btn btn-primary font-mono uppercase tracking-wider"
				onclick={() => createDrawerOpen = true}
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
				</svg>
				Add Project
			</button>
		</div>
	</div>

	<!-- Content -->
	<div class="flex-1 p-6">
		{#if loading}
			<ProjectsSkeleton cards={4} />
		{:else if error}
			<div class="alert alert-error">
				<span>{error}</span>
				<button class="btn btn-sm" onclick={fetchProjects}>Retry</button>
			</div>
		{:else}
			<!-- Active Projects -->
			<div class="space-y-4">
				{#each projects as project (project.name)}
					<div
						class="card bg-base-100 shadow-md border border-base-300 hover:border-primary/30 transition-colors relative overflow-hidden"
						transition:fade={{ duration: 150 }}
					>
						<!-- Project color accent bar -->
						<div
							class="absolute left-0 top-0 bottom-0 w-1"
							style="background-color: {project.activeColor || '#6b7280'}"
						></div>

						<div class="card-body p-5 pl-6">
							<!-- Header Row -->
							<div class="flex items-start justify-between gap-4">
								<div class="flex items-center gap-3">
									<!-- Project color indicator -->
									<div
										class="w-4 h-4 rounded-full ring-2 ring-base-content/10"
										style="background-color: {project.activeColor || '#6b7280'}"
										title="Project color"
									></div>
									<div>
										<h2 class="text-lg font-semibold font-mono uppercase tracking-wide text-base-content">
											{project.displayName || project.name}
										</h2>
										{#if project.displayName && project.displayName !== project.name}
											<span class="text-xs font-mono text-base-content/50">{project.name}</span>
										{/if}
									</div>
									<!-- Warning indicator for missing Beads (subtle) -->
									{#if !project.stats?.hasBeads}
										<button
											class="badge badge-warning badge-sm gap-1 cursor-pointer hover:badge-outline"
											onclick={() => initBeads(project)}
											title="Click to initialize Beads"
										>
											<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
												<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
											</svg>
											No Beads
										</button>
									{/if}
								</div>

								<!-- Actions -->
								<div class="flex items-center gap-2">
									<button
										class="btn btn-sm btn-ghost font-mono text-xs"
										onclick={() => openEditDrawer(project)}
									>
										Edit
									</button>
									<button
										class="btn btn-sm btn-ghost text-base-content/60 font-mono text-xs"
										onclick={() => confirmAction = { type: 'hide', project }}
									>
										Hide
									</button>
								</div>
							</div>

							<!-- Details -->
							<div class="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
								<div class="text-base-content/60">
									<span class="text-xs font-mono uppercase tracking-wider text-base-content/50">Path:</span>
									<span class="ml-2 font-mono text-base-content/80">{project.path}</span>
								</div>
								{#if project.port}
									<div class="text-base-content/60">
										<span class="text-xs font-mono uppercase tracking-wider text-base-content/50">Port:</span>
										<span class="ml-2 font-mono">{project.port}</span>
									</div>
								{/if}
								{#if project.serverPath && project.serverPath !== project.path}
									<div class="text-base-content/60">
										<span class="text-xs font-mono uppercase tracking-wider text-base-content/50">Server:</span>
										<span class="ml-2 font-mono text-base-content/80">{project.serverPath}</span>
									</div>
								{/if}
								{#if project.description}
									<div class="text-base-content/60 col-span-2">
										<span class="text-xs font-mono uppercase tracking-wider text-base-content/50">Description:</span>
										<span class="ml-2">{project.description}</span>
									</div>
								{/if}
							</div>

							<!-- Status Badges -->
							<div class="mt-4 flex flex-wrap gap-2">
								<div class="badge {project.stats?.hasBeads ? 'badge-success' : 'badge-ghost'} gap-1 font-mono text-xs">
									{#if project.stats?.hasBeads}
										<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
											<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
										</svg>
									{:else}
										<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
											<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
										</svg>
									{/if}
									Beads
								</div>

								<div class="badge {(project.stats?.agentCount ?? 0) > 0 ? 'badge-info' : 'badge-ghost'} gap-1 font-mono text-xs">
									<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
										<path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
									</svg>
									{project.stats?.agentCount ?? 0} agents
								</div>

								<div class="badge {(project.stats?.openTaskCount ?? 0) > 0 ? 'badge-warning' : 'badge-ghost'} gap-1 font-mono text-xs">
									<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
										<path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
										<path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd" />
									</svg>
									{project.stats?.openTaskCount ?? 0}/{project.stats?.taskCount ?? 0} tasks
								</div>

								<div class="badge {project.stats?.serverRunning ? 'badge-success' : 'badge-ghost'} gap-1 font-mono text-xs">
									{#if project.stats?.serverRunning}
										<span class="w-2 h-2 rounded-full bg-success animate-pulse"></span>
									{:else}
										<span class="w-2 h-2 rounded-full bg-base-300"></span>
									{/if}
									Server
								</div>
							</div>
						</div>
					</div>
				{/each}

				{#if projects.length === 0}
					<div class="text-center py-12">
						<div class="text-base-content/40 text-lg font-mono uppercase tracking-wider mb-4">No projects configured</div>
						<button
							class="btn btn-primary font-mono uppercase tracking-wider"
							onclick={() => createDrawerOpen = true}
						>
							Add Your First Project
						</button>
					</div>
				{/if}
			</div>

			<!-- Hidden Projects Section -->
			{#if hiddenProjects.length > 0}
				<div class="mt-8 border-t border-base-300 pt-6">
					<button
						class="flex items-center gap-2 text-base-content/60 hover:text-base-content transition-colors"
						onclick={() => showHidden = !showHidden}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 transition-transform {showHidden ? 'rotate-90' : ''}"
							viewBox="0 0 20 20"
							fill="currentColor"
						>
							<path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
						</svg>
						<span class="font-mono uppercase tracking-wider text-sm">Hidden Projects ({hiddenProjects.length})</span>
					</button>

					{#if showHidden}
						<div class="mt-4 space-y-3" transition:slide={{ duration: 200 }}>
							{#each hiddenProjects as project (project.name)}
								<div class="card bg-base-100/50 border border-base-300 p-4 relative overflow-hidden">
									<!-- Faded project color bar -->
									<div
										class="absolute left-0 top-0 bottom-0 w-1 opacity-40"
										style="background-color: {project.activeColor || '#6b7280'}"
									></div>
									<div class="flex items-center justify-between pl-4">
										<div class="flex items-center gap-3">
											<div
												class="w-3 h-3 rounded-full opacity-50"
												style="background-color: {project.activeColor || '#6b7280'}"
											></div>
											<div>
												<span class="font-mono uppercase tracking-wide text-base-content/70">{project.displayName || project.name}</span>
												<span class="text-xs text-base-content/50 ml-2 font-mono">{project.path}</span>
											</div>
										</div>
										<div class="flex items-center gap-2">
											<button
												class="btn btn-sm btn-ghost font-mono text-xs"
												onclick={() => toggleVisibility(project, true)}
											>
												Unhide
											</button>
											<button
												class="btn btn-sm btn-ghost text-error/70 font-mono text-xs"
												onclick={() => confirmAction = { type: 'remove', project }}
											>
												Remove
											</button>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
</div>

<!-- Create Project Drawer -->
<CreateProjectDrawer
	bind:open={createDrawerOpen}
	onProjectCreated={handleProjectCreated}
/>

<!-- Edit Project Drawer -->
{#if editDrawerOpen && editingProject}
	<div class="drawer drawer-end z-50">
		<input type="checkbox" class="drawer-toggle" checked={editDrawerOpen} />
		<div class="drawer-side">
			<label class="drawer-overlay" onclick={closeEditDrawer}></label>
			<!-- Drawer Panel with industrial styling -->
			<div class="h-full w-full max-w-md flex flex-col shadow-2xl bg-base-300 border-l border-base-content/30">
				<!-- Header with accent bar -->
				<div class="flex items-center justify-between p-6 relative bg-base-200 border-b border-base-content/30">
					<!-- Project color accent bar -->
					<div
						class="absolute left-0 top-0 bottom-0 w-1"
						style="background: linear-gradient(to bottom, {editingProject.activeColor || '#6b7280'}, {editingProject.activeColor || '#6b7280'}80)"
					></div>

					<div class="flex items-center gap-3 pl-2">
						<div
							class="w-4 h-4 rounded-full ring-2 ring-base-content/10"
							style="background-color: {editForm.activeColor || '#6b7280'}"
						></div>
						<h2 class="text-xl font-bold font-mono uppercase tracking-wider text-base-content">
							Edit Project
						</h2>
					</div>
					<button class="btn btn-sm btn-ghost btn-circle" onclick={closeEditDrawer}>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
						</svg>
					</button>
				</div>

				<!-- Scrollable Content -->
				<div class="flex-1 overflow-y-auto p-6 flex flex-col min-h-0 bg-base-300">
					<div class="space-y-5">
						<!-- Display Name -->
						<div class="form-control">
							<label class="label-text text-xs font-semibold font-mono uppercase tracking-wider text-base-content/70 mb-2">
								Display Name
							</label>
							<input
								type="text"
								class="input input-bordered bg-base-100 font-mono"
								bind:value={editForm.displayName}
								placeholder={editingProject.name}
							/>
						</div>

						<!-- Path -->
						<div class="form-control">
							<label class="label-text text-xs font-semibold font-mono uppercase tracking-wider text-base-content/70 mb-2 flex items-center gap-2">
								Path
								<span class="text-error">*</span>
							</label>
							<input
								type="text"
								class="input input-bordered bg-base-100 font-mono text-sm"
								bind:value={editForm.path}
								required
							/>
						</div>

						<!-- Port -->
						<div class="form-control">
							<label class="label-text text-xs font-semibold font-mono uppercase tracking-wider text-base-content/70 mb-2">
								Dev Server Port
							</label>
							<input
								type="number"
								class="input input-bordered bg-base-100 font-mono"
								bind:value={editForm.port}
								placeholder="3000"
							/>
						</div>

						<!-- Server Path -->
						<div class="form-control">
							<label class="label-text text-xs font-semibold font-mono uppercase tracking-wider text-base-content/70 mb-2">
								Server Path
								<span class="text-base-content/40 normal-case tracking-normal ml-1">(if different)</span>
							</label>
							<input
								type="text"
								class="input input-bordered bg-base-100 font-mono text-sm"
								bind:value={editForm.serverPath}
								placeholder={editForm.path}
							/>
						</div>

						<!-- Description -->
						<div class="form-control">
							<label class="label-text text-xs font-semibold font-mono uppercase tracking-wider text-base-content/70 mb-2">
								Description
							</label>
							<textarea
								class="textarea textarea-bordered bg-base-100"
								rows="2"
								bind:value={editForm.description}
								placeholder="Project description..."
							></textarea>
						</div>

						<!-- Badge Colors -->
						<div class="form-control">
							<label class="label-text text-xs font-semibold font-mono uppercase tracking-wider text-base-content/70 mb-3">
								Badge Colors
							</label>
							<div class="flex gap-6">
								<div class="flex items-center gap-3">
									<input
										type="color"
										class="w-10 h-10 rounded-lg cursor-pointer border-2 border-base-content/10"
										bind:value={editForm.activeColor}
									/>
									<span class="text-xs font-mono uppercase tracking-wider text-base-content/60">Active</span>
								</div>
								<div class="flex items-center gap-3">
									<input
										type="color"
										class="w-10 h-10 rounded-lg cursor-pointer border-2 border-base-content/10"
										bind:value={editForm.inactiveColor}
									/>
									<span class="text-xs font-mono uppercase tracking-wider text-base-content/60">Inactive</span>
								</div>
							</div>
						</div>

						{#if saveError}
							<div class="alert alert-error text-sm py-2">
								{saveError}
							</div>
						{/if}

						<!-- Danger Zone -->
						<div class="mt-8 pt-6 border-t border-error/20">
							<h3 class="text-xs font-semibold font-mono uppercase tracking-wider text-error/70 mb-3">
								Danger Zone
							</h3>
							<div class="flex flex-col gap-2">
								<button
									class="btn btn-outline btn-error btn-sm font-mono uppercase tracking-wider"
									onclick={() => {
										confirmAction = { type: 'remove', project: editingProject! };
										closeEditDrawer();
									}}
								>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
										<path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
									</svg>
									Remove from JAT
								</button>
								<p class="text-xs text-base-content/50">
									This removes the project from JAT configuration only. Your project files will not be deleted.
								</p>
							</div>
						</div>
					</div>
				</div>

				<!-- Footer -->
				<div class="p-6 bg-base-200 border-t border-base-content/30 flex justify-end gap-3">
					<button class="btn btn-ghost font-mono uppercase tracking-wider" onclick={closeEditDrawer}>
						Cancel
					</button>
					<button
						class="btn btn-primary font-mono uppercase tracking-wider"
						onclick={saveProject}
						disabled={saving || !editForm.path}
					>
						{#if saving}
							<span class="loading loading-spinner loading-sm"></span>
						{/if}
						Save Changes
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Confirmation Modal -->
{#if confirmAction}
	<div class="modal modal-open">
		<div class="modal-box bg-base-300 border border-base-content/30">
			<h3 class="font-bold text-lg font-mono uppercase tracking-wider">
				{confirmAction.type === 'hide' ? 'Hide Project?' : 'Remove Project?'}
			</h3>
			<p class="py-4 text-base-content/70">
				{#if confirmAction.type === 'hide'}
					<strong class="font-mono">{confirmAction.project.displayName || confirmAction.project.name}</strong> will be hidden from the dashboard.
					You can unhide it later from the Hidden Projects section.
				{:else}
					<strong class="font-mono">{confirmAction.project.displayName || confirmAction.project.name}</strong> will be removed from JAT.
					This only removes the configuration - your project files will not be deleted.
				{/if}
			</p>
			<div class="modal-action">
				<button class="btn btn-ghost font-mono uppercase tracking-wider" onclick={() => confirmAction = null}>
					Cancel
				</button>
				{#if confirmAction.type === 'hide'}
					<button
						class="btn btn-warning font-mono uppercase tracking-wider"
						onclick={() => toggleVisibility(confirmAction!.project, false)}
					>
						Hide Project
					</button>
				{:else}
					<button
						class="btn btn-error font-mono uppercase tracking-wider"
						onclick={() => removeProject(confirmAction!.project)}
					>
						Remove Project
					</button>
				{/if}
			</div>
		</div>
		<div class="modal-backdrop bg-black/50" onclick={() => confirmAction = null}></div>
	</div>
{/if}
