<script lang="ts">
	/**
	 * CreateProjectDrawer Component
	 * DaisyUI drawer for adding new projects to the IDE
	 *
	 * Features:
	 * - Text input for path or browse button
	 * - Directory browser via /api/directories
	 * - Validation that path is a git repo
	 * - Call bd init on selected path via /api/projects/init
	 * - Success/error feedback
	 * - Refresh project list on success
	 */

	import { tick } from 'svelte';
	import { isProjectDrawerOpen, closeProjectDrawer, signalProjectCreated } from '$lib/stores/drawerStore';
	import { playSuccessChime, playErrorSound } from '$lib/utils/soundEffects';
	import { invalidateAll, goto } from '$app/navigation';

	// Props
	interface Props {
		onProjectCreated?: () => void;
	}
	let { onProjectCreated }: Props = $props();

	// Directory listing types
	interface DirectoryInfo {
		path: string;
		name: string;
		isGitRepo: boolean;
		hasBeads: boolean;
	}

	// Reactive state from store
	let isOpen = $state(false);

	// Subscribe to store
	$effect(() => {
		const unsubscribe = isProjectDrawerOpen.subscribe(value => {
			isOpen = value;
		});
		return unsubscribe;
	});

	// Form state
	let pathInput = $state('');
	let pathInputRef: HTMLInputElement;

	// Directory browser state
	let directories = $state<DirectoryInfo[]>([]);
	let basePath = $state('');
	let isLoadingDirectories = $state(false);
	let directoryError = $state<string | null>(null);
	let showBrowser = $state(false);

	// Submission state
	let isSubmitting = $state(false);
	let submitError = $state<string | null>(null);
	let successMessage = $state<string | null>(null);
	let createdProjectKey = $state<string | null>(null);
	let creationSteps = $state<string[]>([]);

	// Validation state
	let validationStatus = $state<'idle' | 'checking' | 'valid' | 'invalid' | 'already-initialized' | 'needs-git' | 'will-create'>('idle');
	let validationMessage = $state<string | null>(null);
	let selectedDirectory = $state<DirectoryInfo | null>(null);

	// New folder creation state
	let showNewFolderInput = $state(false);
	let newFolderName = $state('');
	let isCreatingFolder = $state(false);
	let folderError = $state<string | null>(null);

	// Git initialization state
	let isInitializingGit = $state(false);

	// Auto-focus when drawer opens
	$effect(() => {
		if (isOpen && pathInputRef) {
			requestAnimationFrame(() => {
				setTimeout(() => {
					if (pathInputRef && isOpen) {
						pathInputRef.focus();
					}
				}, 200);
			});
		}
	});

	// Load directories when browser is opened
	$effect(() => {
		if (showBrowser && directories.length === 0) {
			loadDirectories();
		}
	});

	// Fetch directories from API
	async function loadDirectories(path?: string) {
		isLoadingDirectories = true;
		directoryError = null;

		try {
			const url = path ? `/api/directories?path=${encodeURIComponent(path)}` : '/api/directories';
			const response = await fetch(url);
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to load directories');
			}

			directories = data.directories || [];
			basePath = data.basePath || '~/code';
		} catch (error) {
			directoryError = error instanceof Error ? error.message : 'Failed to load directories';
			directories = [];
		} finally {
			isLoadingDirectories = false;
		}
	}

	// Select a directory from the browser
	function selectDirectory(dir: DirectoryInfo) {
		pathInput = dir.path;
		selectedDirectory = dir;
		showBrowser = false;

		// Update validation based on directory state
		if (dir.hasBeads) {
			validationStatus = 'already-initialized';
			validationMessage = 'Beads already initialized in this project';
		} else if (!dir.isGitRepo) {
			validationStatus = 'needs-git';
			validationMessage = 'Not a git repository. Initialize git to continue.';
		} else {
			validationStatus = 'valid';
			validationMessage = 'Ready to initialize';
		}
	}

	// Create new folder in current directory
	async function createNewFolder() {
		if (!newFolderName.trim()) {
			folderError = 'Please enter a folder name';
			return;
		}

		// Validate folder name
		const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
		if (invalidChars.test(newFolderName)) {
			folderError = 'Invalid characters in folder name';
			return;
		}

		isCreatingFolder = true;
		folderError = null;

		try {
			const parentPath = basePath || '~/code';
			const newPath = `${parentPath}/${newFolderName.trim()}`;

			const response = await fetch('/api/directories/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: newPath })
			});

			const data = await response.json();

			if (!response.ok || data.error) {
				throw new Error(data.error || 'Failed to create folder');
			}

			// Refresh directory list and select the new folder
			await loadDirectories(parentPath);

			// Find and select the newly created folder
			const newDir = directories.find(d => d.name === newFolderName.trim());
			if (newDir) {
				selectDirectory(newDir);
			} else {
				// If not found in list, set the path directly
				pathInput = newPath;
				validationStatus = 'needs-git';
				validationMessage = 'Folder created. Initialize git to continue.';
			}

			// Reset new folder input
			showNewFolderInput = false;
			newFolderName = '';
		} catch (error) {
			folderError = error instanceof Error ? error.message : 'Failed to create folder';
		} finally {
			isCreatingFolder = false;
		}
	}

	// Initialize git in selected directory
	async function initializeGit() {
		if (!pathInput.trim()) return;

		isInitializingGit = true;
		submitError = null;

		try {
			const response = await fetch('/api/directories/git-init', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: pathInput.trim() })
			});

			const data = await response.json();

			if (!response.ok || data.error) {
				throw new Error(data.error || 'Failed to initialize git');
			}

			// Update validation status
			validationStatus = 'valid';
			validationMessage = 'Git initialized! Ready to add project.';

			// Update selected directory if we have one
			if (selectedDirectory) {
				selectedDirectory = { ...selectedDirectory, isGitRepo: true };
			}
		} catch (error) {
			submitError = error instanceof Error ? error.message : 'Failed to initialize git';
		} finally {
			isInitializingGit = false;
		}
	}

	// Validate path input when it changes
	async function validatePath() {
		if (!pathInput.trim()) {
			validationStatus = 'idle';
			validationMessage = null;
			selectedDirectory = null;
			return;
		}

		validationStatus = 'checking';
		validationMessage = 'Checking path...';

		const trimmedPath = pathInput.trim();
		let currentStep = 'initial';

		try {
			// Check if path exists and get its status
			// Each fetch gets its own 10-second timeout (increased from 5s)
			currentStep = 'fetching path';
			console.log('[CreateProjectDrawer] Validating path:', trimmedPath);
			const startTime = Date.now();

			const response = await fetch(
				`/api/directories?path=${encodeURIComponent(trimmedPath)}`,
				{ signal: AbortSignal.timeout(10000) }
			);
			console.log('[CreateProjectDrawer] Path fetch completed in', Date.now() - startTime, 'ms');
			const data = await response.json();

			if (!response.ok || data.error) {
				// Check if this is a non-existent path under the home directory
				// If so, we can auto-create it
				const homeDir = data.homeDir || '';
				const isUnderHome = trimmedPath.startsWith('~/') ||
					trimmedPath.startsWith(homeDir + '/') ||
					(homeDir && trimmedPath.startsWith(homeDir));

				if (isUnderHome && (data.message?.includes('not found') || data.error?.includes('not found') || response.status === 404)) {
					validationStatus = 'will-create';
					validationMessage = 'Will create directory, initialize git, and set up Beads';
					selectedDirectory = null;
					return;
				}

				validationStatus = 'invalid';
				validationMessage = data.error || data.message || 'Path not found';
				selectedDirectory = null;
				return;
			}

			// Check if the path itself is a valid project directory
			// by looking for it in the parent directory listing
			const pathParts = trimmedPath.split('/');
			const dirName = pathParts[pathParts.length - 1];
			const parentPath = pathParts.slice(0, -1).join('/') || '/';

			currentStep = 'fetching parent';
			console.log('[CreateProjectDrawer] Fetching parent directory:', parentPath);
			const parentStartTime = Date.now();

			const parentResponse = await fetch(
				`/api/directories?path=${encodeURIComponent(parentPath)}`,
				{ signal: AbortSignal.timeout(10000) }
			);
			console.log('[CreateProjectDrawer] Parent fetch completed in', Date.now() - parentStartTime, 'ms');
			const parentData = await parentResponse.json();

			const dirInfo = parentData.directories?.find((d: DirectoryInfo) => d.name === dirName || d.path === trimmedPath);

			if (dirInfo) {
				selectedDirectory = dirInfo;
				if (dirInfo.hasBeads) {
					validationStatus = 'already-initialized';
					validationMessage = 'Beads already initialized in this project';
				} else if (!dirInfo.isGitRepo) {
					validationStatus = 'invalid';
					validationMessage = 'Not a git repository. Run "git init" first.';
				} else {
					validationStatus = 'valid';
					validationMessage = 'Ready to initialize';
				}
			} else {
				// Path exists (as a directory) but we couldn't find details
				// Let the API validate on submit
				validationStatus = 'valid';
				validationMessage = 'Path exists, click Add to initialize';
				selectedDirectory = null;
			}
		} catch (err) {
			console.error('[CreateProjectDrawer] Validation error:', err, 'at step:', currentStep, 'for path:', trimmedPath);
			if (err instanceof Error && err.name === 'TimeoutError') {
				validationStatus = 'invalid';
				validationMessage = `Validation timed out while ${currentStep}. The server may be slow or the path may be on a slow/network drive.`;
			} else {
				validationStatus = 'invalid';
				validationMessage = `Failed to validate path: ${err instanceof Error ? err.message : 'Unknown error'}`;
			}
			selectedDirectory = null;
		}
	}

	// Debounce validation
	let validationTimeout: ReturnType<typeof setTimeout>;
	function handlePathInput() {
		clearTimeout(validationTimeout);
		validationTimeout = setTimeout(validatePath, 500);
	}

	// Handle form submission
	async function handleSubmit(e: Event) {
		e.preventDefault();

		if (!pathInput.trim()) {
			submitError = 'Please enter a path or select a directory';
			return;
		}

		if (validationStatus === 'already-initialized') {
			submitError = 'This project is already initialized with Beads';
			return;
		}

		submitError = null;
		successMessage = null;
		isSubmitting = true;

		try {
			const response = await fetch('/api/projects/init', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: pathInput.trim() })
			});

			const data = await response.json();

			if (!response.ok || data.error) {
				throw new Error(data.message || 'Failed to initialize project');
			}

			// Success!
			successMessage = data.message || `Successfully added ${data.project?.name}`;
			createdProjectKey = data.project?.name?.toLowerCase() || null;
			creationSteps = data.steps || [];
			playSuccessChime();

			// Invalidate all data to refresh project lists across the app
			await invalidateAll();

			// Signal that a project was created - pages subscribed to this will refresh
			signalProjectCreated();

			// Call callback to refresh project list (for backward compatibility)
			if (onProjectCreated) {
				onProjectCreated();
			}

			// Don't auto-close - let user choose to configure or close
		} catch (error) {
			submitError = error instanceof Error ? error.message : 'Failed to add project';
			playErrorSound();
		} finally {
			isSubmitting = false;
		}
	}

	// Reset form
	function resetForm() {
		pathInput = '';
		directories = [];
		basePath = '';
		showBrowser = false;
		validationStatus = 'idle';
		validationMessage = null;
		selectedDirectory = null;
		submitError = null;
		successMessage = null;
		createdProjectKey = null;
		creationSteps = [];
		directoryError = null;
		// Reset new folder state
		showNewFolderInput = false;
		newFolderName = '';
		isCreatingFolder = false;
		folderError = null;
		isInitializingGit = false;
	}

	// Handle close
	function handleClose() {
		if (!isSubmitting) {
			resetForm();
			closeProjectDrawer();
		}
	}

	// Get status badge color
	function getStatusColor(status: typeof validationStatus): string {
		switch (status) {
			case 'valid':
			case 'will-create':
				return 'oklch(0.70 0.18 145)'; // Green
			case 'invalid':
			case 'already-initialized':
				return 'oklch(0.65 0.20 25)'; // Red/orange
			case 'needs-git':
				return 'oklch(0.70 0.18 85)'; // Amber/warning
			case 'checking':
				return 'oklch(0.70 0.18 240)'; // Blue
			default:
				return 'oklch(0.55 0.02 250)'; // Gray
		}
	}
</script>

<!-- DaisyUI Drawer -->
<div class="drawer drawer-end z-50">
	<input id="create-project-drawer" type="checkbox" class="drawer-toggle" bind:checked={isOpen} />

	<!-- Drawer side -->
	<div class="drawer-side">
		<label aria-label="close sidebar" class="drawer-overlay" onclick={handleClose}></label>

		<!-- Drawer Panel - Industrial style matching TaskCreationDrawer -->
		<div
			class="h-full w-full max-w-xl flex flex-col shadow-2xl"
			style="
				background: linear-gradient(180deg, oklch(0.18 0.01 250) 0%, oklch(0.16 0.01 250) 100%);
				border-left: 1px solid oklch(0.35 0.02 250);
			"
			role="dialog"
			aria-labelledby="drawer-title"
		>
			<!-- Header -->
			<div
				class="flex items-center justify-between p-6 relative"
				style="
					background: linear-gradient(180deg, oklch(0.22 0.01 250) 0%, oklch(0.20 0.01 250) 100%);
					border-bottom: 1px solid oklch(0.35 0.02 250);
				"
			>
				<!-- Left accent bar -->
				<div
					class="absolute left-0 top-0 bottom-0 w-1"
					style="background: linear-gradient(180deg, oklch(0.70 0.18 145) 0%, oklch(0.70 0.18 145 / 0.3) 100%);"
				></div>
				<div class="flex items-center gap-3">
					<!-- Folder-plus icon -->
					<div
						class="w-10 h-10 rounded-lg flex items-center justify-center"
						style="background: linear-gradient(135deg, oklch(0.35 0.12 145) 0%, oklch(0.28 0.10 145) 100%); border: 1px solid oklch(0.45 0.15 145 / 0.5);"
					>
						<svg class="w-5 h-5" style="color: oklch(0.90 0.05 145);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
						</svg>
					</div>
					<div>
						<h2 id="drawer-title" class="text-xl font-bold font-mono uppercase tracking-wider" style="color: oklch(0.85 0.02 250);">
							Add Project
						</h2>
						<p class="text-sm mt-1" style="color: oklch(0.55 0.02 250);">
							Initialize a git repository with Beads
						</p>
					</div>
				</div>
				<button
					class="btn btn-sm btn-circle btn-ghost"
					onclick={handleClose}
					disabled={isSubmitting}
					aria-label="Close drawer"
				>
					✕
				</button>
			</div>

			<!-- Content -->
			<form onsubmit={handleSubmit} class="flex-1 overflow-y-auto p-6 flex flex-col min-h-0" style="background: oklch(0.16 0.01 250);">
				<div class="space-y-6">
					<!-- Path Input -->
					<div class="form-control">
						<label class="label" for="project-path">
							<span class="label-text text-xs font-semibold font-mono uppercase tracking-wider" style="color: oklch(0.55 0.02 250);">
								Project Path
								<span class="text-error">*</span>
							</span>
						</label>
						<div class="flex items-center gap-2">
							<input
								id="project-path"
								type="text"
								placeholder="/path/to/my-project"
								class="input flex-1 font-mono"
								style="background: oklch(0.18 0.01 250); border: 1px solid oklch(0.35 0.02 250); color: oklch(0.80 0.02 250);"
								bind:this={pathInputRef}
								bind:value={pathInput}
								oninput={handlePathInput}
								disabled={isSubmitting}
								required
							/>
							<button
								type="button"
								class="btn btn-sm"
								style="background: oklch(0.25 0.02 250); border: 1px solid oklch(0.40 0.02 250); color: oklch(0.75 0.02 250);"
								onclick={() => { showBrowser = !showBrowser; if (showBrowser && directories.length === 0) loadDirectories(); }}
								disabled={isSubmitting}
							>
								{showBrowser ? 'Hide' : 'Browse'}
							</button>
						</div>

						<!-- Validation status -->
						{#if validationStatus !== 'idle'}
							<div class="flex items-center gap-2 mt-2">
								{#if validationStatus === 'checking'}
									<span class="loading loading-spinner loading-xs" style="color: oklch(0.70 0.18 240);"></span>
								{:else}
									<span
										class="w-2 h-2 rounded-full"
										style="background: {getStatusColor(validationStatus)};"
									></span>
								{/if}
								<span class="text-xs font-mono" style="color: {getStatusColor(validationStatus)};">
									{validationMessage}
								</span>
							</div>

							<!-- Initialize Git button when directory needs git -->
							{#if validationStatus === 'needs-git'}
								<div class="mt-3">
									<button
										type="button"
										class="btn btn-sm"
										style="background: oklch(0.30 0.12 85); border: 1px solid oklch(0.45 0.15 85); color: oklch(0.95 0.02 250);"
										onclick={initializeGit}
										disabled={isInitializingGit || isSubmitting}
									>
										{#if isInitializingGit}
											<span class="loading loading-spinner loading-xs"></span>
											Initializing Git...
										{:else}
											<svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
											</svg>
											Initialize Git Repository
										{/if}
									</button>
									<p class="text-xs mt-2" style="color: oklch(0.55 0.02 250);">
										This will run <code class="px-1 py-0.5 rounded" style="background: oklch(0.22 0.01 250);">git init</code> in the selected folder.
									</p>
								</div>
							{/if}

							<!-- Show what will happen when creating new project -->
							{#if validationStatus === 'will-create'}
								<div class="mt-3 space-y-1">
									<p class="text-xs font-semibold" style="color: oklch(0.70 0.18 145);">
										On submit, we will:
									</p>
									<ul class="text-xs space-y-0.5" style="color: oklch(0.60 0.02 250);">
										<li class="flex items-center gap-1.5">
											<span style="color: oklch(0.70 0.18 145);">1.</span>
											Create directory at {pathInput}
										</li>
										<li class="flex items-center gap-1.5">
											<span style="color: oklch(0.70 0.18 145);">2.</span>
											Initialize git repository
										</li>
										<li class="flex items-center gap-1.5">
											<span style="color: oklch(0.70 0.18 145);">3.</span>
											Set up Beads task management
										</li>
										<li class="flex items-center gap-1.5">
											<span style="color: oklch(0.70 0.18 145);">4.</span>
											Add to JAT configuration
										</li>
									</ul>
								</div>
							{/if}
						{/if}
					</div>

					<!-- Directory Browser -->
					{#if showBrowser}
						<div
							class="rounded-lg p-4"
							style="background: oklch(0.18 0.01 250); border: 1px solid oklch(0.30 0.02 250);"
						>
							<div class="flex items-center justify-between mb-3">
								<span class="text-xs font-mono" style="color: oklch(0.55 0.02 250);">
									{basePath}
								</span>
								<div class="flex items-center gap-2">
									<button
										type="button"
										class="btn btn-xs"
										style="background: oklch(0.30 0.10 145); border: 1px solid oklch(0.40 0.15 145); color: oklch(0.95 0.02 250);"
										onclick={() => { showNewFolderInput = !showNewFolderInput; folderError = null; newFolderName = ''; }}
										disabled={isLoadingDirectories || isCreatingFolder}
									>
										{#if showNewFolderInput}
											Cancel
										{:else}
											<svg class="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
											</svg>
											New Folder
										{/if}
									</button>
									<button
										type="button"
										class="btn btn-xs btn-ghost"
										onclick={() => loadDirectories()}
										disabled={isLoadingDirectories}
									>
										{#if isLoadingDirectories}
											<span class="loading loading-spinner loading-xs"></span>
										{:else}
											Refresh
										{/if}
									</button>
								</div>
							</div>

							<!-- New Folder Input -->
							{#if showNewFolderInput}
								<div class="mb-3 p-3 rounded" style="background: oklch(0.22 0.01 250); border: 1px solid oklch(0.35 0.02 250);">
									<label class="text-xs font-mono mb-2 block" style="color: oklch(0.55 0.02 250);">
										New folder name
									</label>
									<div class="flex items-center gap-2">
										<input
											type="text"
											placeholder="my-new-project"
											class="input input-sm flex-1 font-mono"
											style="background: oklch(0.18 0.01 250); border: 1px solid oklch(0.35 0.02 250); color: oklch(0.80 0.02 250);"
											bind:value={newFolderName}
											disabled={isCreatingFolder}
											onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createNewFolder(); } }}
										/>
										<button
											type="button"
											class="btn btn-sm"
											style="background: oklch(0.35 0.15 145); border: 1px solid oklch(0.45 0.18 145); color: oklch(0.95 0.02 250);"
											onclick={createNewFolder}
											disabled={isCreatingFolder || !newFolderName.trim()}
										>
											{#if isCreatingFolder}
												<span class="loading loading-spinner loading-xs"></span>
											{:else}
												Create
											{/if}
										</button>
									</div>
									{#if folderError}
										<p class="text-xs mt-2" style="color: oklch(0.65 0.20 25);">{folderError}</p>
									{/if}
								</div>
							{/if}

							{#if directoryError}
								<div class="text-sm text-error">{directoryError}</div>
							{:else if directories.length === 0 && !isLoadingDirectories}
								<div class="text-sm" style="color: oklch(0.55 0.02 250);">
									No directories found
								</div>
							{:else}
								<div class="max-h-64 overflow-y-auto space-y-1">
									{#each directories as dir}
										<button
											type="button"
											class="w-full text-left px-3 py-2 rounded transition-colors flex items-center gap-2"
											style="
												background: {pathInput === dir.path ? 'oklch(0.30 0.08 240 / 0.3)' : 'transparent'};
												border: 1px solid {pathInput === dir.path ? 'oklch(0.50 0.15 240 / 0.5)' : 'transparent'};
											"
											onclick={() => selectDirectory(dir)}
											disabled={isSubmitting}
										>
											<!-- Folder icon -->
											<svg class="w-4 h-4 flex-shrink-0" style="color: oklch(0.60 0.10 85);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
											</svg>

											<span class="flex-1 font-mono text-sm truncate" style="color: oklch(0.80 0.02 250);">
												{dir.name}
											</span>

											<!-- Status badges -->
											<div class="flex items-center gap-1">
												{#if dir.hasBeads}
													<span
														class="badge badge-xs"
														style="background: oklch(0.35 0.15 145); color: oklch(0.90 0.02 250);"
													>
														Beads
													</span>
												{/if}
												{#if dir.isGitRepo}
													<span
														class="badge badge-xs"
														style="background: oklch(0.35 0.10 250); color: oklch(0.90 0.02 250);"
													>
														Git
													</span>
												{:else}
													<span
														class="badge badge-xs"
														style="background: oklch(0.35 0.15 25); color: oklch(0.90 0.02 250);"
													>
														No Git
													</span>
												{/if}
											</div>
										</button>
									{/each}
								</div>
							{/if}
						</div>
					{/if}

					<!-- Info about unified onboarding -->
					<div
						class="rounded-lg p-4"
						style="background: oklch(0.20 0.05 240 / 0.15); border: 1px solid oklch(0.40 0.10 240 / 0.3);"
					>
						<h4 class="text-xs font-semibold font-mono uppercase tracking-wider mb-2" style="color: oklch(0.70 0.15 240);">
							Unified Onboarding
						</h4>
						<ul class="space-y-1 text-sm" style="color: oklch(0.65 0.02 250);">
							<li class="flex items-center gap-2">
								<svg class="w-4 h-4 flex-shrink-0" style="color: oklch(0.70 0.18 145);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
								</svg>
								<span>New paths under <code class="px-1 py-0.5 rounded" style="background: oklch(0.22 0.01 250);">~/</code> are auto-created</span>
							</li>
							<li class="flex items-center gap-2">
								<svg class="w-4 h-4 flex-shrink-0" style="color: oklch(0.70 0.18 145);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
								</svg>
								<span>Git initialized automatically if needed</span>
							</li>
							<li class="flex items-center gap-2">
								<svg class="w-4 h-4 flex-shrink-0" style="color: oklch(0.70 0.18 145);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
								</svg>
								<span>Beads task management set up for you</span>
							</li>
						</ul>
					</div>

					<!-- Error Message -->
					{#if submitError}
						<div
							class="alert font-mono text-sm"
							style="background: oklch(0.35 0.15 25); border: 1px solid oklch(0.50 0.18 25); color: oklch(0.95 0.02 250);"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="stroke-current shrink-0 h-6 w-6"
								fill="none"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							<span>{submitError}</span>
						</div>
					{/if}

					<!-- Success Message -->
					{#if successMessage}
						<div
							class="rounded-lg p-4 space-y-4"
							style="background: oklch(0.20 0.08 150 / 0.2); border: 1px solid oklch(0.45 0.12 150 / 0.4);"
						>
							<!-- Success header -->
							<div class="flex items-center gap-3">
								<div
									class="w-10 h-10 rounded-full flex items-center justify-center"
									style="background: oklch(0.40 0.15 150); color: oklch(0.95 0.02 250);"
								>
									<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
									</svg>
								</div>
								<div>
									<p class="font-semibold" style="color: oklch(0.85 0.08 150);">Project Created!</p>
									<p class="text-sm" style="color: oklch(0.65 0.04 150);">{successMessage}</p>
								</div>
							</div>

							<!-- Steps taken -->
							{#if creationSteps.length > 0}
								<div class="space-y-1">
									<p class="text-xs font-semibold uppercase tracking-wider" style="color: oklch(0.55 0.02 250);">
										Steps completed:
									</p>
									<ul class="text-sm space-y-0.5" style="color: oklch(0.70 0.02 250);">
										{#each creationSteps as step}
											<li class="flex items-center gap-2">
												<svg class="w-3 h-3 flex-shrink-0" style="color: oklch(0.70 0.18 145);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
												</svg>
												<span>{step}</span>
											</li>
										{/each}
									</ul>
								</div>
							{/if}

							<!-- Action buttons -->
							<div class="flex items-center gap-3 pt-2">
								{#if createdProjectKey}
									<a
										href="/config?tab=projects&edit={encodeURIComponent(createdProjectKey)}"
										class="btn btn-sm"
										style="background: oklch(0.30 0.10 240); border: 1px solid oklch(0.45 0.12 240); color: oklch(0.90 0.02 250);"
										onclick={() => { resetForm(); closeProjectDrawer(); }}
									>
										<svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
										</svg>
										Configure Settings
									</a>
								{/if}
								<button
									type="button"
									class="btn btn-sm btn-ghost"
									onclick={() => {
									const project = createdProjectKey;
									resetForm();
									closeProjectDrawer();
									if (project) {
										localStorage.setItem('tasks3-selected-project', project);
									}
									goto('/tasks');
								}}
								>
									Done
								</button>
							</div>
						</div>
					{/if}
				</div>
			</form>

			<!-- Footer (hidden after successful creation) -->
			{#if !successMessage}
			<div
				class="p-6"
				style="
					background: linear-gradient(180deg, oklch(0.20 0.01 250) 0%, oklch(0.18 0.01 250) 100%);
					border-top: 1px solid oklch(0.35 0.02 250);
				"
			>
				<div class="flex items-center justify-end gap-3">
					<button
						type="button"
						class="btn btn-ghost"
						onclick={handleClose}
						disabled={isSubmitting}
					>
						Cancel
					</button>
					<button
						type="submit"
						class="btn btn-primary font-mono"
						onclick={handleSubmit}
						disabled={isSubmitting || validationStatus === 'checking' || validationStatus === 'invalid' || validationStatus === 'already-initialized' || validationStatus === 'needs-git' || validationStatus === 'idle'}
					>
						{#if isSubmitting}
							<span class="loading loading-spinner loading-sm"></span>
							Adding...
						{:else}
							Add Project
						{/if}
					</button>
				</div>
			</div>
			{/if}
		</div>
	</div>
</div>
