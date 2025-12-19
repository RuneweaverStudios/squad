<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import type { ProjectConfig } from '$lib/types/config';
	import { saveProject } from '$lib/stores/configStore.svelte';

	interface Props {
		isOpen: boolean;
		project?: { key: string; config: ProjectConfig } | null;
		onSave?: (key: string, config: ProjectConfig) => void;
		onCancel?: () => void;
		onDelete?: (key: string) => void;
	}

	let { isOpen = $bindable(false), project = null, onSave, onCancel, onDelete }: Props = $props();

	// Delete confirmation state
	let showDeleteConfirm = $state(false);
	let isDeleting = $state(false);
	let deleteError = $state<string | null>(null);

	// Form state
	let key = $state('');
	let name = $state('');
	let path = $state('');
	let port = $state<number | undefined>(undefined);
	let serverPath = $state('');
	let description = $state('');
	let activeColor = $state('');
	let inactiveColor = $state('');
	let databaseUrl = $state('');
	let hidden = $state(false);

	// Validation state
	let errors = $state<Record<string, string>>({});
	let touched = $state<Record<string, boolean>>({});

	// Is this a new project or editing existing?
	let isNewProject = $derived(!project);

	// Reset form when project changes
	$effect(() => {
		if (isOpen) {
			if (project) {
				key = project.key;
				name = project.config.name || '';
				path = project.config.path || '';
				port = project.config.port;
				serverPath = project.config.server_path || '';
				description = project.config.description || '';
				activeColor = project.config.colors?.active || '';
				inactiveColor = project.config.colors?.inactive || '';
				databaseUrl = project.config.database_url || '';
				hidden = project.config.hidden || false;
			} else {
				// New project - reset all fields
				key = '';
				name = '';
				path = '';
				port = undefined;
				serverPath = '';
				description = '';
				activeColor = '';
				inactiveColor = '';
				databaseUrl = '';
				hidden = false;
			}
			errors = {};
			touched = {};
			// Reset delete state
			showDeleteConfirm = false;
			isDeleting = false;
			deleteError = null;
		}
	});

	// Auto-generate key from name for new projects
	function generateKeyFromName() {
		if (isNewProject && !touched['key']) {
			key = name
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '');
		}
	}

	// Validation functions
	function validateKey(value: string): string | null {
		if (!value.trim()) return 'Project key is required';
		if (!/^[a-z0-9-]+$/.test(value)) return 'Key must be lowercase letters, numbers, and hyphens only';
		if (value.length < 2) return 'Key must be at least 2 characters';
		return null;
	}

	function validateName(value: string): string | null {
		if (!value.trim()) return 'Project name is required';
		return null;
	}

	function validatePath(value: string): string | null {
		if (!value.trim()) return 'Project path is required';
		if (!value.startsWith('/') && !value.startsWith('~')) {
			return 'Path must be absolute (start with / or ~)';
		}
		return null;
	}

	function validatePort(value: number | undefined): string | null {
		if (value === undefined || value === null) return null;
		if (value < 1 || value > 65535) return 'Port must be between 1 and 65535';
		return null;
	}

	function validateColor(value: string): string | null {
		if (!value.trim()) return null;
		// Accept oklch, hex, rgb, hsl formats
		const colorPatterns = [
			/^oklch\([^)]+\)$/i,
			/^#[0-9a-f]{3,8}$/i,
			/^rgb\([^)]+\)$/i,
			/^rgba\([^)]+\)$/i,
			/^hsl\([^)]+\)$/i,
			/^hsla\([^)]+\)$/i,
			/^[a-z]+$/i // Named colors
		];
		if (!colorPatterns.some(p => p.test(value.trim()))) {
			return 'Invalid color format';
		}
		return null;
	}

	function validateForm(): boolean {
		const newErrors: Record<string, string> = {};

		const keyError = validateKey(key);
		if (keyError) newErrors['key'] = keyError;

		const nameError = validateName(name);
		if (nameError) newErrors['name'] = nameError;

		const pathError = validatePath(path);
		if (pathError) newErrors['path'] = pathError;

		const portError = validatePort(port);
		if (portError) newErrors['port'] = portError;

		const activeColorError = validateColor(activeColor);
		if (activeColorError) newErrors['activeColor'] = activeColorError;

		const inactiveColorError = validateColor(inactiveColor);
		if (inactiveColorError) newErrors['inactiveColor'] = inactiveColorError;

		errors = newErrors;
		return Object.keys(newErrors).length === 0;
	}

	function handleSave() {
		// Mark all fields as touched
		touched = {
			key: true,
			name: true,
			path: true,
			port: true,
			serverPath: true,
			description: true,
			activeColor: true,
			inactiveColor: true,
			databaseUrl: true
		};

		if (!validateForm()) return;

		const config: ProjectConfig = {
			name: name.trim(),
			path: path.trim()
		};

		if (port !== undefined && port !== null) config.port = port;
		if (serverPath.trim()) config.server_path = serverPath.trim();
		if (description.trim()) config.description = description.trim();
		if (activeColor.trim() || inactiveColor.trim()) {
			config.colors = {};
			if (activeColor.trim()) config.colors.active = activeColor.trim();
			if (inactiveColor.trim()) config.colors.inactive = inactiveColor.trim();
		}
		if (databaseUrl.trim()) config.database_url = databaseUrl.trim();
		if (hidden) config.hidden = true;

		onSave?.(key.trim(), config);
		isOpen = false;
	}

	function handleCancel() {
		onCancel?.();
		isOpen = false;
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			handleCancel();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (showDeleteConfirm) {
				showDeleteConfirm = false;
			} else {
				handleCancel();
			}
		}
	}

	async function handleDelete() {
		if (!project?.key) return;

		isDeleting = true;
		deleteError = null;

		try {
			const response = await fetch('/api/projects', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ project: project.key })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to delete project');
			}

			// Success - close drawer and notify parent
			showDeleteConfirm = false;
			isOpen = false;
			onDelete?.(project.key);
		} catch (error) {
			deleteError = error instanceof Error ? error.message : 'Failed to delete project';
		} finally {
			isDeleting = false;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 bg-black/50 z-40"
		transition:fade={{ duration: 200 }}
		onclick={handleBackdropClick}
		role="button"
		tabindex="-1"
	></div>

	<!-- Side Drawer -->
	<div
		class="fixed right-0 top-0 h-full w-full max-w-lg bg-base-100 shadow-xl z-50 flex flex-col"
		transition:fly={{ x: 400, duration: 300 }}
	>
		<!-- Header -->
		<div class="flex items-center justify-between p-4 border-b border-base-300">
			<h2 class="text-xl font-semibold">
				{isNewProject ? 'Add Project' : 'Edit Project'}
			</h2>
			<button class="btn btn-ghost btn-sm btn-circle" onclick={handleCancel}>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Form Content -->
		<div class="flex-1 overflow-y-auto p-4 space-y-6">
			<!-- Basic Information Section -->
			<div class="space-y-4">
				<h3 class="text-sm font-medium text-base-content/70 uppercase tracking-wide">Basic Information</h3>

				<!-- Project Key -->
				<div class="form-control">
					<label class="label" for="project-key">
						<span class="label-text">Project Key <span class="text-error">*</span></span>
					</label>
					<input
						id="project-key"
						type="text"
						class="input input-bordered w-full"
						class:input-error={touched['key'] && errors['key']}
						placeholder="my-project"
						bind:value={key}
						readonly={!isNewProject}
						onfocus={() => touched['key'] = true}
					/>
					{#if touched['key'] && errors['key']}
						<label class="label">
							<span class="label-text-alt text-error">{errors['key']}</span>
						</label>
					{/if}
					{#if !isNewProject}
						<label class="label">
							<span class="label-text-alt text-base-content/50">Key cannot be changed for existing projects</span>
						</label>
					{/if}
				</div>

				<!-- Project Name -->
				<div class="form-control">
					<label class="label" for="project-name">
						<span class="label-text">Display Name <span class="text-error">*</span></span>
					</label>
					<input
						id="project-name"
						type="text"
						class="input input-bordered w-full"
						class:input-error={touched['name'] && errors['name']}
						placeholder="My Project"
						bind:value={name}
						onfocus={() => touched['name'] = true}
						onblur={generateKeyFromName}
					/>
					{#if touched['name'] && errors['name']}
						<label class="label">
							<span class="label-text-alt text-error">{errors['name']}</span>
						</label>
					{/if}
				</div>

				<!-- Project Path -->
				<div class="form-control">
					<label class="label" for="project-path">
						<span class="label-text">Project Path <span class="text-error">*</span></span>
					</label>
					<input
						id="project-path"
						type="text"
						class="input input-bordered w-full font-mono text-sm"
						class:input-error={touched['path'] && errors['path']}
						placeholder="~/code/my-project"
						bind:value={path}
						onfocus={() => touched['path'] = true}
					/>
					{#if touched['path'] && errors['path']}
						<label class="label">
							<span class="label-text-alt text-error">{errors['path']}</span>
						</label>
					{/if}
				</div>

				<!-- Description -->
				<div class="form-control">
					<label class="label" for="project-description">
						<span class="label-text">Description</span>
					</label>
					<textarea
						id="project-description"
						class="textarea textarea-bordered w-full"
						placeholder="Brief description of the project"
						rows="2"
						bind:value={description}
					></textarea>
				</div>

				<!-- Hidden Toggle -->
				<div class="form-control">
					<label class="label cursor-pointer justify-start gap-3">
						<input type="checkbox" class="toggle toggle-primary" bind:checked={hidden} />
						<span class="label-text">Hide from project list</span>
					</label>
				</div>
			</div>

			<!-- Server Configuration Section -->
			<div class="space-y-4">
				<h3 class="text-sm font-medium text-base-content/70 uppercase tracking-wide">Server Configuration</h3>

				<!-- Port -->
				<div class="form-control">
					<label class="label" for="project-port">
						<span class="label-text">Dev Server Port</span>
					</label>
					<input
						id="project-port"
						type="number"
						class="input input-bordered w-full"
						class:input-error={touched['port'] && errors['port']}
						placeholder="3000"
						min="1"
						max="65535"
						bind:value={port}
						onfocus={() => touched['port'] = true}
					/>
					{#if touched['port'] && errors['port']}
						<label class="label">
							<span class="label-text-alt text-error">{errors['port']}</span>
						</label>
					{/if}
				</div>

				<!-- Server Path -->
				<div class="form-control">
					<label class="label" for="project-server-path">
						<span class="label-text">Server Path</span>
					</label>
					<input
						id="project-server-path"
						type="text"
						class="input input-bordered w-full font-mono text-sm"
						placeholder="Leave empty to use project path"
						bind:value={serverPath}
					/>
					<label class="label">
						<span class="label-text-alt text-base-content/50">Directory where npm run dev is executed</span>
					</label>
				</div>

				<!-- Database URL -->
				<div class="form-control">
					<label class="label" for="project-database-url">
						<span class="label-text">Database URL</span>
					</label>
					<input
						id="project-database-url"
						type="text"
						class="input input-bordered w-full font-mono text-sm"
						placeholder="postgresql://localhost:5432/mydb"
						bind:value={databaseUrl}
					/>
				</div>
			</div>

			<!-- Display Colors Section -->
			<div class="space-y-4">
				<h3 class="text-sm font-medium text-base-content/70 uppercase tracking-wide">Display Colors</h3>

				<!-- Active Color -->
				<div class="form-control">
					<label class="label" for="project-active-color">
						<span class="label-text">Active Badge Color</span>
					</label>
					<div class="flex gap-2">
						<input
							id="project-active-color"
							type="text"
							class="input input-bordered flex-1 font-mono text-sm"
							class:input-error={touched['activeColor'] && errors['activeColor']}
							placeholder="oklch(0.7 0.15 150)"
							bind:value={activeColor}
							onfocus={() => touched['activeColor'] = true}
						/>
						{#if activeColor}
							<div
								class="w-10 h-10 rounded border border-base-300"
								style="background-color: {activeColor}"
							></div>
						{/if}
					</div>
					{#if touched['activeColor'] && errors['activeColor']}
						<label class="label">
							<span class="label-text-alt text-error">{errors['activeColor']}</span>
						</label>
					{/if}
				</div>

				<!-- Inactive Color -->
				<div class="form-control">
					<label class="label" for="project-inactive-color">
						<span class="label-text">Inactive Badge Color</span>
					</label>
					<div class="flex gap-2">
						<input
							id="project-inactive-color"
							type="text"
							class="input input-bordered flex-1 font-mono text-sm"
							class:input-error={touched['inactiveColor'] && errors['inactiveColor']}
							placeholder="oklch(0.5 0.1 150)"
							bind:value={inactiveColor}
							onfocus={() => touched['inactiveColor'] = true}
						/>
						{#if inactiveColor}
							<div
								class="w-10 h-10 rounded border border-base-300"
								style="background-color: {inactiveColor}"
							></div>
						{/if}
					</div>
					{#if touched['inactiveColor'] && errors['inactiveColor']}
						<label class="label">
							<span class="label-text-alt text-error">{errors['inactiveColor']}</span>
						</label>
					{/if}
				</div>
			</div>
		</div>

		<!-- Footer -->
		<div class="flex justify-between p-4 border-t border-base-300">
			<!-- Delete button (only for existing projects) -->
			<div>
				{#if !isNewProject}
					<button
						class="btn btn-error btn-outline"
						onclick={() => showDeleteConfirm = true}
						disabled={isDeleting}
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
						</svg>
						Delete
					</button>
				{/if}
			</div>
			<!-- Save/Cancel buttons -->
			<div class="flex gap-2">
				<button class="btn btn-ghost" onclick={handleCancel}>
					Cancel
				</button>
				<button class="btn btn-primary" onclick={handleSave}>
					{isNewProject ? 'Create Project' : 'Save Changes'}
				</button>
			</div>
		</div>
	</div>

	<!-- Delete Confirmation Modal -->
	{#if showDeleteConfirm}
		<div
			class="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
			transition:fade={{ duration: 150 }}
			onclick={(e) => e.target === e.currentTarget && (showDeleteConfirm = false)}
			role="dialog"
			aria-modal="true"
			aria-labelledby="delete-confirm-title"
		>
			<div
				class="bg-base-100 rounded-xl shadow-2xl max-w-md w-full"
				transition:fly={{ y: 20, duration: 200 }}
			>
				<div class="p-6">
					<div class="flex items-center gap-3 mb-4">
						<div class="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center">
							<svg class="w-6 h-6 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
							</svg>
						</div>
						<div>
							<h3 id="delete-confirm-title" class="text-lg font-semibold">Delete Project</h3>
							<p class="text-sm text-base-content/70">This action cannot be undone</p>
						</div>
					</div>

					<p class="mb-4">
						Are you sure you want to remove <span class="font-semibold text-error">{project?.key}</span> from the configuration?
					</p>

					<div class="bg-base-200 rounded-lg p-3 mb-4 text-sm">
						<p class="text-base-content/70">
							<strong>Note:</strong> This only removes the project from the JAT configuration file. The actual project directory and files will not be deleted.
						</p>
					</div>

					{#if deleteError}
						<div class="alert alert-error mb-4">
							<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
							<span>{deleteError}</span>
						</div>
					{/if}

					<div class="flex justify-end gap-2">
						<button
							class="btn btn-ghost"
							onclick={() => showDeleteConfirm = false}
							disabled={isDeleting}
						>
							Cancel
						</button>
						<button
							class="btn btn-error"
							onclick={handleDelete}
							disabled={isDeleting}
						>
							{#if isDeleting}
								<span class="loading loading-spinner loading-sm"></span>
								Deleting...
							{:else}
								Delete Project
							{/if}
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}
{/if}
