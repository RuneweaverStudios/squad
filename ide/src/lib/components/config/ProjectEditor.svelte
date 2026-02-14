<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import type { ProjectConfig } from '$lib/types/config';
	import { saveProject } from '$lib/stores/configStore.svelte';
	import { successToast, errorToast } from '$lib/stores/toasts.svelte';
	import ProjectSecretsEditor from './ProjectSecretsEditor.svelte';
	import SupabaseSetupWizard from './SupabaseSetupWizard.svelte';
	import { AGENT_PRESETS } from '$lib/types/agentProgram';
	import ProviderLogo from '$lib/components/agents/ProviderLogo.svelte';

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

	// Rename state
	let showRenameModal = $state(false);
	let isRenaming = $state(false);
	let renameError = $state<string | null>(null);
	let newProjectKey = $state('');
	let renameResult = $state<{ killedAgents: string[] } | null>(null);

	// Color picker state
	let editingActiveColor = $state(false);
	let editingInactiveColor = $state(false);

	// Supabase wizard state
	let showSupabaseWizard = $state(false);

	// Predefined color palette for quick selection - using oklch for perceptual uniformity
	const COLOR_PALETTE = [
		'oklch(0.70 0.18 220)', // Blue
		'oklch(0.75 0.18 160)', // Cyan
		'oklch(0.65 0.20 30)',  // Red
		'oklch(0.80 0.18 90)',  // Yellow
		'oklch(0.70 0.18 145)', // Green
		'oklch(0.65 0.18 280)', // Purple
		'oklch(0.75 0.18 60)',  // Orange
		'oklch(0.70 0.18 200)', // Sky blue
		'oklch(0.60 0.18 300)', // Violet
		'oklch(0.55 0.25 25)',  // Dark red
		'oklch(0.80 0.20 150)', // Mint green
		'oklch(0.75 0.12 220)', // Light blue
		'oklch(0.70 0.22 15)',  // Bright red
		'oklch(0.75 0.20 120)', // Lime
		'oklch(0.85 0.18 85)'   // Bright yellow
	];

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
	let defaultHarness = $state('');

	// Validation state
	let errors = $state<Record<string, string>>({});
	let touched = $state<Record<string, boolean>>({});

	// Real-time field validation
	function validateField(field: string, value: unknown) {
		touched[field] = true;
		let error: string | null = null;
		switch (field) {
			case 'key':
				error = validateKey(value as string);
				break;
			case 'name':
				error = validateName(value as string);
				break;
			case 'path':
				error = validatePath(value as string);
				break;
			case 'port':
				error = validatePort(value as number | undefined);
				break;
			case 'activeColor':
				error = validateColor(value as string);
				break;
			case 'inactiveColor':
				error = validateColor(value as string);
				break;
		}
		if (error) {
			errors = { ...errors, [field]: error };
		} else {
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			const { [field]: _, ...rest } = errors;
			errors = rest;
		}
	}

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
				defaultHarness = project.config.default_harness || '';
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
				defaultHarness = '';
			}
			errors = {};
			touched = {};
			// Reset delete state
			showDeleteConfirm = false;
			isDeleting = false;
			deleteError = null;
			// Reset rename state
			showRenameModal = false;
			isRenaming = false;
			renameError = null;
			newProjectKey = '';
			renameResult = null;
			// Reset color picker state
			editingActiveColor = false;
			editingInactiveColor = false;
			// Reset supabase wizard state
			showSupabaseWizard = false;
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
		if (!Number.isInteger(value)) return 'Port must be a whole number';
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
		if (defaultHarness && defaultHarness !== 'claude-code') {
			config.default_harness = defaultHarness;
		}

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
			successToast(`Project "${project.key}" deleted`, 'Removed from configuration');
		} catch (error) {
			deleteError = error instanceof Error ? error.message : 'Failed to delete project';
			errorToast('Failed to delete project', deleteError);
		} finally {
			isDeleting = false;
		}
	}

	function validateNewKey(value: string): string | null {
		if (!value.trim()) return 'New project key is required';
		if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]{1,2}$/.test(value)) {
			return 'Key must be lowercase letters, numbers, and hyphens only';
		}
		if (value.length < 2) return 'Key must be at least 2 characters';
		if (value.length > 50) return 'Key must be 50 characters or less';
		if (value === project?.key) return 'New key must be different from current key';
		return null;
	}

	async function handleRename() {
		if (!project?.key) return;

		const validation = validateNewKey(newProjectKey);
		if (validation) {
			renameError = validation;
			return;
		}

		isRenaming = true;
		renameError = null;
		renameResult = null;

		try {
			const response = await fetch('/api/projects/rename', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					oldKey: project.key,
					newKey: newProjectKey.trim().toLowerCase()
				})
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to rename project');
			}

			// Store result for display
			renameResult = { killedAgents: data.killedAgents || [] };

			// Build success message
			let message = `Project renamed to "${data.newKey}"`;
			if (data.killedAgents?.length > 0) {
				message += `. Stopped ${data.killedAgents.length} agent(s): ${data.killedAgents.join(', ')}`;
			}

			// Close modals and drawer
			showRenameModal = false;
			isOpen = false;

			// Notify parent about the rename (triggers refresh)
			onDelete?.(project.key);

			successToast('Project renamed', message);
		} catch (error) {
			renameError = error instanceof Error ? error.message : 'Failed to rename project';
			errorToast('Failed to rename project', renameError);
		} finally {
			isRenaming = false;
		}
	}

	// Compute the preview path for rename
	let renamePreviewPath = $derived(() => {
		if (!path || !newProjectKey) return '';
		const parts = path.split('/');
		parts[parts.length - 1] = newProjectKey.trim().toLowerCase();
		return parts.join('/');
	});
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
						onblur={() => validateField('key', key)}
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
						onblur={() => { generateKeyFromName(); validateField('name', name); }}
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
						onblur={() => validateField('path', path)}
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

			<!-- Agent Defaults Section -->
			<div class="space-y-4">
				<h3 class="text-sm font-medium text-base-content/70 uppercase tracking-wide">Agent Defaults</h3>
				<div class="form-control">
					<label class="label" for="project-default-harness">
						<span class="label-text">Default Harness</span>
					</label>
					<div class="flex items-center gap-2 flex-wrap">
						{#each AGENT_PRESETS as preset}
							<button type="button"
								class="btn btn-sm gap-1.5 {defaultHarness === preset.id || (!defaultHarness && preset.id === 'claude-code') ? 'btn-primary' : 'btn-ghost'}"
								onclick={() => defaultHarness = preset.id}
							>
								<ProviderLogo agentId={preset.id} size={16} />
								<span class="text-xs">{preset.config.name}</span>
							</button>
						{/each}
					</div>
					<label class="label">
						<span class="label-text-alt text-base-content/50">Agent program used when creating new tasks for this project</span>
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
						step="1"
						bind:value={port}
						onfocus={() => touched['port'] = true}
						onblur={() => validateField('port', port)}
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
						placeholder="e.g. dashboard"
						bind:value={serverPath}
					/>
					<label class="label">
						<span class="label-text-alt text-base-content/50">
							Subdirectory for dev server, e.g. <code class="px-1 py-0.5 bg-base-300 rounded text-xs">dashboard</code>
						</span>
					</label>
				</div>

				<!-- Project Secrets (only for existing projects) -->
				{#if !isNewProject && key}
					<ProjectSecretsEditor projectKey={key} />
				{:else}
					<div class="mt-4 p-3 rounded-lg" style="background: oklch(0.18 0.02 250 / 0.5);">
						<p class="text-xs" style="color: oklch(0.55 0.02 250);">
							<svg class="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
							Save the project first to configure secrets (database URLs, API keys, etc.)
						</p>
					</div>
				{/if}
			</div>

			<!-- Supabase Configuration Section (only for existing projects) -->
			{#if !isNewProject && key}
				<div class="space-y-4">
					<h3 class="text-sm font-medium text-base-content/70 uppercase tracking-wide">Supabase Integration</h3>

					<div class="p-4 rounded-lg border border-base-content/10" style="background: oklch(0.16 0.02 250);">
						<div class="flex items-start gap-4">
							<div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background: oklch(0.55 0.15 145 / 0.15);">
								<svg class="w-6 h-6" viewBox="0 0 109 113" fill="none" xmlns="http://www.w3.org/2000/svg">
									<path d="M63.7076 110.284C60.8481 113.885 55.0502 111.912 54.9813 107.314L53.9738 40.0627L99.1935 40.0627C107.384 40.0627 111.952 49.5228 106.859 55.9374L63.7076 110.284Z" fill="url(#sg-a)"/>
									<path d="M45.317 2.07103C48.1765 -1.53037 53.9745 0.442937 54.0434 5.04076L54.4849 72.2922H9.83113C1.64038 72.2922 -2.92775 62.8321 2.16584 56.4175L45.317 2.07103Z" fill="#3ECF8E"/>
									<defs>
										<linearGradient id="sg-a" x1="53.9738" y1="54.974" x2="94.1635" y2="71.8295" gradientUnits="userSpaceOnUse">
											<stop stop-color="#249361"/>
											<stop offset="1" stop-color="#3ECF8E"/>
										</linearGradient>
									</defs>
								</svg>
							</div>
							<div class="flex-1">
								<h4 class="font-medium text-sm mb-1">Connect to Supabase</h4>
								<p class="text-xs text-base-content/60 mb-3">
									Set up Supabase CLI linking, configure API keys, and manage database credentials for this project.
								</p>
								<button
									class="btn btn-sm"
									style="background: oklch(0.55 0.15 145 / 0.15); color: oklch(0.75 0.15 145); border-color: oklch(0.55 0.15 145 / 0.3);"
									onclick={() => showSupabaseWizard = true}
								>
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
									</svg>
									Configure Supabase
								</button>
							</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Display Colors Section -->
			<div class="space-y-4">
				<h3 class="text-sm font-medium text-base-content/70 uppercase tracking-wide">Display Colors</h3>

				<!-- Active Color -->
				<div class="form-control">
					<label class="label" for="project-active-color">
						<span class="label-text">Active Badge Color</span>
					</label>
					<div class="flex gap-2 items-start">
						<div class="relative">
							{#if editingActiveColor}
								<!-- Color picker dropdown -->
								<div class="absolute top-0 left-0 z-50 p-3 rounded-lg shadow-xl bg-base-200 border border-base-content/25 w-64">
									<!-- Palette grid -->
									<div class="grid grid-cols-5 gap-1.5 mb-3">
										{#each COLOR_PALETTE as color}
											<button
												type="button"
												class="w-8 h-8 rounded-full transition-transform hover:scale-110 {activeColor === color ? 'ring-2 ring-primary ring-offset-2 ring-offset-base-200' : ''}"
												style="background: {color};"
												onclick={() => { activeColor = color; validateField('activeColor', color); }}
												title={color}
											></button>
										{/each}
									</div>
									<!-- Custom color input -->
									<div class="flex items-center gap-2 mb-3">
										<input
											type="color"
											class="w-8 h-8 rounded cursor-pointer border-0 p-0"
											value={activeColor.startsWith('#') ? activeColor : '#6688cc'}
											oninput={(e) => { activeColor = e.currentTarget.value; validateField('activeColor', e.currentTarget.value); }}
										/>
										<input
											type="text"
											class="flex-1 px-2 py-1.5 rounded font-mono text-xs bg-base-300 border border-base-content/20 text-base-content/90"
											class:border-error={touched['activeColor'] && errors['activeColor']}
											bind:value={activeColor}
											placeholder="oklch(0.7 0.15 150)"
											onfocus={() => touched['activeColor'] = true}
											onblur={() => validateField('activeColor', activeColor)}
										/>
									</div>
									<!-- Close button -->
									<div class="flex justify-end">
										<button
											type="button"
											class="btn btn-xs btn-ghost"
											onclick={() => editingActiveColor = false}
										>
											Done
										</button>
									</div>
								</div>
							{/if}
							<!-- Color swatch button -->
							<button
								type="button"
								class="w-10 h-10 rounded-lg transition-all hover:scale-105 border-2 {editingActiveColor ? 'border-primary ring-2 ring-primary/30' : 'border-base-content/20 hover:border-base-content/40'}"
								style="background: {activeColor || 'oklch(0.50 0.05 250)'};"
								onclick={() => { editingActiveColor = !editingActiveColor; editingInactiveColor = false; }}
								title="Click to change color"
							></button>
						</div>
						<div class="flex-1">
							<input
								id="project-active-color"
								type="text"
								class="input input-bordered w-full font-mono text-sm"
								class:input-error={touched['activeColor'] && errors['activeColor']}
								placeholder="oklch(0.7 0.15 150)"
								bind:value={activeColor}
								onfocus={() => touched['activeColor'] = true}
								onblur={() => validateField('activeColor', activeColor)}
							/>
							{#if touched['activeColor'] && errors['activeColor']}
								<label class="label py-1">
									<span class="label-text-alt text-error">{errors['activeColor']}</span>
								</label>
							{/if}
						</div>
					</div>
				</div>

				<!-- Inactive Color -->
				<div class="form-control">
					<label class="label" for="project-inactive-color">
						<span class="label-text">Inactive Badge Color</span>
					</label>
					<div class="flex gap-2 items-start">
						<div class="relative">
							{#if editingInactiveColor}
								<!-- Color picker dropdown -->
								<div class="absolute top-0 left-0 z-50 p-3 rounded-lg shadow-xl bg-base-200 border border-base-content/25 w-64">
									<!-- Palette grid -->
									<div class="grid grid-cols-5 gap-1.5 mb-3">
										{#each COLOR_PALETTE as color}
											<button
												type="button"
												class="w-8 h-8 rounded-full transition-transform hover:scale-110 {inactiveColor === color ? 'ring-2 ring-primary ring-offset-2 ring-offset-base-200' : ''}"
												style="background: {color};"
												onclick={() => { inactiveColor = color; validateField('inactiveColor', color); }}
												title={color}
											></button>
										{/each}
									</div>
									<!-- Custom color input -->
									<div class="flex items-center gap-2 mb-3">
										<input
											type="color"
											class="w-8 h-8 rounded cursor-pointer border-0 p-0"
											value={inactiveColor.startsWith('#') ? inactiveColor : '#445566'}
											oninput={(e) => { inactiveColor = e.currentTarget.value; validateField('inactiveColor', e.currentTarget.value); }}
										/>
										<input
											type="text"
											class="flex-1 px-2 py-1.5 rounded font-mono text-xs bg-base-300 border border-base-content/20 text-base-content/90"
											class:border-error={touched['inactiveColor'] && errors['inactiveColor']}
											bind:value={inactiveColor}
											placeholder="oklch(0.5 0.1 150)"
											onfocus={() => touched['inactiveColor'] = true}
											onblur={() => validateField('inactiveColor', inactiveColor)}
										/>
									</div>
									<!-- Close button -->
									<div class="flex justify-end">
										<button
											type="button"
											class="btn btn-xs btn-ghost"
											onclick={() => editingInactiveColor = false}
										>
											Done
										</button>
									</div>
								</div>
							{/if}
							<!-- Color swatch button -->
							<button
								type="button"
								class="w-10 h-10 rounded-lg transition-all hover:scale-105 border-2 {editingInactiveColor ? 'border-primary ring-2 ring-primary/30' : 'border-base-content/20 hover:border-base-content/40'}"
								style="background: {inactiveColor || 'oklch(0.35 0.03 250)'};"
								onclick={() => { editingInactiveColor = !editingInactiveColor; editingActiveColor = false; }}
								title="Click to change color"
							></button>
						</div>
						<div class="flex-1">
							<input
								id="project-inactive-color"
								type="text"
								class="input input-bordered w-full font-mono text-sm"
								class:input-error={touched['inactiveColor'] && errors['inactiveColor']}
								placeholder="oklch(0.5 0.1 150)"
								bind:value={inactiveColor}
								onfocus={() => touched['inactiveColor'] = true}
								onblur={() => validateField('inactiveColor', inactiveColor)}
							/>
							{#if touched['inactiveColor'] && errors['inactiveColor']}
								<label class="label py-1">
									<span class="label-text-alt text-error">{errors['inactiveColor']}</span>
								</label>
							{/if}
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Footer -->
		<div class="flex justify-between p-4 border-t border-base-300">
			<!-- Rename and Delete buttons (only for existing projects) -->
			<div class="flex gap-2">
				{#if !isNewProject}
					<button
						class="btn btn-warning btn-outline"
						onclick={() => { showRenameModal = true; newProjectKey = ''; renameError = null; }}
						disabled={isRenaming || isDeleting}
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
						</svg>
						Rename
					</button>
					<button
						class="btn btn-error btn-outline"
						onclick={() => showDeleteConfirm = true}
						disabled={isDeleting || isRenaming}
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

	<!-- Rename Confirmation Modal -->
	{#if showRenameModal}
		<div
			class="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
			transition:fade={{ duration: 150 }}
			onclick={(e) => e.target === e.currentTarget && !isRenaming && (showRenameModal = false)}
			role="dialog"
			aria-modal="true"
			aria-labelledby="rename-modal-title"
		>
			<div
				class="bg-base-100 rounded-xl shadow-2xl max-w-md w-full"
				transition:fly={{ y: 20, duration: 200 }}
			>
				<div class="p-6">
					<div class="flex items-center gap-3 mb-4">
						<div class="w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center">
							<svg class="w-6 h-6 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
							</svg>
						</div>
						<div>
							<h3 id="rename-modal-title" class="text-lg font-semibold">Rename Project</h3>
							<p class="text-sm text-base-content/70">Change the project folder name and key</p>
						</div>
					</div>

					<p class="mb-4">
						Rename <span class="font-semibold text-warning">{project?.key}</span> to a new name.
					</p>

					<!-- Current path display -->
					<div class="bg-base-200 rounded-lg p-3 mb-4 text-sm font-mono">
						<div class="text-base-content/50 text-xs mb-1">Current path:</div>
						<div class="text-base-content/70">{path}</div>
					</div>

					<!-- New key input -->
					<div class="form-control mb-4">
						<label class="label" for="new-project-key">
							<span class="label-text font-medium">New Project Key</span>
						</label>
						<input
							id="new-project-key"
							type="text"
							class="input input-bordered w-full"
							class:input-error={renameError}
							placeholder="new-project-name"
							bind:value={newProjectKey}
							oninput={() => renameError = null}
							disabled={isRenaming}
						/>
						<label class="label">
							<span class="label-text-alt text-base-content/50">
								Lowercase letters, numbers, and hyphens only
							</span>
						</label>
					</div>

					<!-- Preview new path -->
					{#if newProjectKey.trim()}
						<div class="bg-base-200 rounded-lg p-3 mb-4 text-sm font-mono">
							<div class="text-base-content/50 text-xs mb-1">New path:</div>
							<div class="text-success">{renamePreviewPath()}</div>
						</div>
					{/if}

					<!-- Warning about agents -->
					<div class="bg-warning/10 border border-warning/30 rounded-lg p-3 mb-4 text-sm">
						<div class="flex items-start gap-2">
							<svg class="w-5 h-5 text-warning shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
							</svg>
							<div class="text-warning">
								<strong>Running agents will be stopped.</strong> Any active agent sessions on this project will be terminated before renaming.
							</div>
						</div>
					</div>

					{#if renameError}
						<div class="alert alert-error mb-4">
							<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
							<span>{renameError}</span>
						</div>
					{/if}

					<div class="flex justify-end gap-2">
						<button
							class="btn btn-ghost"
							onclick={() => showRenameModal = false}
							disabled={isRenaming}
						>
							Cancel
						</button>
						<button
							class="btn btn-warning"
							onclick={handleRename}
							disabled={isRenaming || !newProjectKey.trim()}
						>
							{#if isRenaming}
								<span class="loading loading-spinner loading-sm"></span>
								Renaming...
							{:else}
								Rename Project
							{/if}
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Supabase Setup Wizard Modal -->
	{#if showSupabaseWizard}
		<div
			class="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
			transition:fade={{ duration: 150 }}
			onclick={(e) => e.target === e.currentTarget && (showSupabaseWizard = false)}
			role="dialog"
			aria-modal="true"
			aria-labelledby="supabase-wizard-title"
		>
			<div
				class="bg-base-100 rounded-xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto"
				transition:fly={{ y: 20, duration: 200 }}
			>
				<SupabaseSetupWizard
					project={key}
					projectPath={path}
					onComplete={() => { showSupabaseWizard = false; successToast('Supabase configured', 'Project is now connected to Supabase'); }}
					onCancel={() => showSupabaseWizard = false}
				/>
			</div>
		</div>
	{/if}
{/if}
