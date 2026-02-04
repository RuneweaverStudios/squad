<script lang="ts">
	/**
	 * AgentProgramsEditor Component (Agent Harnesses)
	 *
	 * Manages agent harness configurations for the IDE.
	 * Harnesses are CLI tools that wrap LLMs for coding tasks (Claude Code, Codex, OpenCode, etc.)
	 * Storage: ~/.config/jat/agents.json
	 *
	 * Features:
	 * - List view showing all configured harnesses with status (enabled, auth status)
	 * - Default harness indicator (star icon)
	 * - Configure button opens drawer/modal with full edit capabilities
	 * - Add Harness button with preset templates (Claude, Codex, Gemini, OpenCode)
	 * - Drag to reorder (affects fallback priority)
	 *
	 * @see shared/agent-programs.md for architecture documentation
	 */

	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import type { AgentProgram, AgentStatus, AgentModel, AgentAuthType } from '$lib/types/agentProgram';
	import { AGENT_PRESETS } from '$lib/types/agentProgram';
	import ProviderLogo from '$lib/components/agents/ProviderLogo.svelte';

	// Types
	interface AgentProgramWithStatus extends AgentProgram {
		status?: AgentStatus;
	}

	// State
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let programs = $state<AgentProgramWithStatus[]>([]);
	let defaults = $state<{ fallbackAgent: string; fallbackModel: string } | null>(null);

	// Edit drawer state
	let editingProgram = $state<AgentProgramWithStatus | null>(null);
	let editForm = $state<Partial<AgentProgram>>({});
	let editError = $state<string | null>(null);
	let isSaving = $state(false);

	// Add modal state
	let showAddModal = $state(false);
	let selectedPreset = $state<string | null>(null);
	let newProgramForm = $state<Partial<AgentProgram>>({});
	let addError = $state<string | null>(null);
	let isAdding = $state(false);
	let showAdvancedOptions = $state(false);
	let newFormFlags = $state<string[]>([]);
	let newFormNewFlag = $state('');

	// Verification state
	let isVerifying = $state(false);
	let verificationResult = $state<{
		ready: boolean;
		commandInstalled: boolean;
		authConfigured: boolean;
		warnings: string[];
		instructions: string[];
	} | null>(null);
	let skipVerification = $state(false);

	// Delete confirmation state
	let deletingProgram = $state<string | null>(null);
	let isDeleting = $state(false);

	// Drag state
	let draggedItem = $state<string | null>(null);
	let dragOverItem = $state<string | null>(null);

	// Fetch on mount
	onMount(() => {
		fetchPrograms();
	});

	async function fetchPrograms() {
		isLoading = true;
		error = null;

		try {
			const response = await fetch('/api/config/agents?status=true&presets=true');
			if (!response.ok) {
				throw new Error('Failed to fetch agent programs');
			}

			const data = await response.json();
			const programsList = Object.values(data.programs ?? {}) as AgentProgram[];
			const statuses = (data.statuses ?? []) as AgentStatus[];

			// Merge statuses with programs
			programs = programsList.map((p) => ({
				...p,
				status: statuses.find((s) => s.agentId === p.id)
			}));

			// Sort by order
			programs.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

			defaults = data.defaults;
		} catch (err) {
			error = (err as Error).message;
		} finally {
			isLoading = false;
		}
	}

	// Open edit drawer
	function openEditDrawer(program: AgentProgramWithStatus) {
		editingProgram = program;
		editForm = {
			name: program.name,
			command: program.command,
			models: [...program.models],
			defaultModel: program.defaultModel,
			flags: [...program.flags],
			authType: program.authType,
			apiKeyProvider: program.apiKeyProvider,
			apiKeyEnvVar: program.apiKeyEnvVar,
			enabled: program.enabled,
			instructionsFile: program.instructionsFile,
			startupPattern: program.startupPattern,
			taskInjection: program.taskInjection
		};
		editError = null;
	}

	function closeEditDrawer() {
		editingProgram = null;
		editForm = {};
		editError = null;
	}

	async function saveProgram() {
		if (!editingProgram) return;

		isSaving = true;
		editError = null;

		try {
			const response = await fetch(`/api/config/agents/${encodeURIComponent(editingProgram.id)}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(editForm)
			});

			const data = await response.json();

			if (!response.ok) {
				editError = data.error || 'Failed to save agent program';
				if (data.validationErrors) {
					editError += ': ' + data.validationErrors.join(', ');
				}
				return;
			}

			// Refresh programs
			await fetchPrograms();
			closeEditDrawer();
		} catch (err) {
			editError = (err as Error).message;
		} finally {
			isSaving = false;
		}
	}

	// Add agent modal
	function openAddModal() {
		showAddModal = true;
		selectedPreset = null;
		newProgramForm = {
			enabled: true,
			isDefault: false,
			flags: []
		};
		addError = null;
	}

	function closeAddModal() {
		showAddModal = false;
		selectedPreset = null;
		newProgramForm = {};
		addError = null;
		showAdvancedOptions = false;
		newFormFlags = [];
		newFormNewFlag = '';
		verificationResult = null;
		skipVerification = false;
		isVerifying = false;
	}

	function selectPreset(presetId: string) {
		selectedPreset = presetId;
		const preset = AGENT_PRESETS.find((p) => p.id === presetId);
		if (preset) {
			newProgramForm = {
				...preset.config,
				enabled: true,
				isDefault: false
			};
			// Initialize flags from preset
			newFormFlags = preset.config.flags ? [...preset.config.flags] : [];
		}
	}

	async function verifyHarness() {
		if (!newProgramForm.command) {
			return;
		}

		isVerifying = true;
		verificationResult = null;

		try {
			const response = await fetch('/api/config/agents/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					command: newProgramForm.command,
					authType: newProgramForm.authType,
					apiKeyProvider: newProgramForm.apiKeyProvider
				})
			});

			if (response.ok) {
				verificationResult = await response.json();
			}
		} catch (err) {
			console.error('Verification failed:', err);
		} finally {
			isVerifying = false;
		}
	}

	async function addProgram() {
		if (!newProgramForm.id || !newProgramForm.name) {
			addError = 'ID and name are required';
			return;
		}

		// Verify first if not skipping
		if (!skipVerification && !verificationResult) {
			await verifyHarness();
		}

		// If verification shows issues, don't add yet (user can click "Add Anyway")
		if (verificationResult && !verificationResult.ready && !skipVerification) {
			return;
		}

		isAdding = true;
		addError = null;

		try {
			const url = selectedPreset
				? `/api/config/agents?preset=${encodeURIComponent(selectedPreset)}`
				: '/api/config/agents';

			// Include flags from advanced options
			const formData = {
				...newProgramForm,
				flags: newFormFlags.length > 0 ? newFormFlags : newProgramForm.flags
			};

			const response = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(formData)
			});

			const data = await response.json();

			if (!response.ok) {
				addError = data.error || 'Failed to add agent program';
				if (data.validationErrors) {
					addError += ': ' + data.validationErrors.join(', ');
				}
				return;
			}

			await fetchPrograms();
			closeAddModal();
		} catch (err) {
			addError = (err as Error).message;
		} finally {
			isAdding = false;
		}
	}

	function addAnyway() {
		skipVerification = true;
		addProgram();
	}

	// Delete agent
	function openDeleteConfirm(programId: string) {
		deletingProgram = programId;
	}

	function closeDeleteConfirm() {
		deletingProgram = null;
	}

	async function deleteProgram() {
		if (!deletingProgram) return;

		isDeleting = true;

		try {
			const response = await fetch(`/api/config/agents/${encodeURIComponent(deletingProgram)}`, {
				method: 'DELETE'
			});

			const data = await response.json();

			if (!response.ok) {
				error = data.error || 'Failed to delete agent program';
				return;
			}

			await fetchPrograms();
			closeDeleteConfirm();
		} catch (err) {
			error = (err as Error).message;
		} finally {
			isDeleting = false;
		}
	}

	// Set default agent
	async function setAsDefault(programId: string) {
		try {
			const response = await fetch(`/api/config/agents/${encodeURIComponent(programId)}/default`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});

			if (!response.ok) {
				const data = await response.json();
				error = data.error || 'Failed to set default agent';
				return;
			}

			await fetchPrograms();
		} catch (err) {
			error = (err as Error).message;
		}
	}

	// Toggle enabled
	async function toggleEnabled(program: AgentProgramWithStatus) {
		try {
			const response = await fetch(`/api/config/agents/${encodeURIComponent(program.id)}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enabled: !program.enabled })
			});

			if (!response.ok) {
				const data = await response.json();
				error = data.error || 'Failed to toggle agent';
				return;
			}

			await fetchPrograms();
		} catch (err) {
			error = (err as Error).message;
		}
	}

	// Drag and drop handlers
	function handleDragStart(e: DragEvent, programId: string) {
		draggedItem = programId;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', programId);
		}
	}

	function handleDragOver(e: DragEvent, programId: string) {
		e.preventDefault();
		if (draggedItem && draggedItem !== programId) {
			dragOverItem = programId;
		}
	}

	function handleDragLeave() {
		dragOverItem = null;
	}

	function handleDrop(e: DragEvent, targetId: string) {
		e.preventDefault();
		if (!draggedItem || draggedItem === targetId) {
			dragOverItem = null;
			draggedItem = null;
			return;
		}

		// Reorder locally
		const fromIndex = programs.findIndex((p) => p.id === draggedItem);
		const toIndex = programs.findIndex((p) => p.id === targetId);

		if (fromIndex !== -1 && toIndex !== -1) {
			const reordered = [...programs];
			const [moved] = reordered.splice(fromIndex, 1);
			reordered.splice(toIndex, 0, moved);

			// Update order values and save
			saveReorder(reordered);
		}

		dragOverItem = null;
		draggedItem = null;
	}

	function handleDragEnd() {
		dragOverItem = null;
		draggedItem = null;
	}

	async function saveReorder(reordered: AgentProgramWithStatus[]) {
		// Update order values
		const updates = reordered.map((p, index) => ({ id: p.id, order: index }));

		// Save each update
		for (const update of updates) {
			try {
				await fetch(`/api/config/agents/${encodeURIComponent(update.id)}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ order: update.order })
				});
			} catch (err) {
				console.error('Error saving order:', err);
			}
		}

		await fetchPrograms();
	}

	// Helpers
	function getStatusColor(status: AgentStatus | undefined): string {
		if (!status) return 'oklch(0.55 0.02 250)';
		if (status.available) return 'oklch(0.65 0.15 145)';
		if (!status.enabled) return 'oklch(0.55 0.02 250)';
		return 'oklch(0.70 0.15 45)';
	}

	function getStatusText(status: AgentStatus | undefined): string {
		if (!status) return 'Unknown';
		return status.statusMessage;
	}

	function getAuthTypeLabel(authType: AgentAuthType): string {
		switch (authType) {
			case 'subscription':
				return 'Subscription';
			case 'api_key':
				return 'API Key';
			case 'none':
				return 'None';
			default:
				return authType;
		}
	}

	function getCostTierBadge(tier: string | undefined): string {
		switch (tier) {
			case 'low':
				return 'badge-success';
			case 'medium':
				return 'badge-warning';
			case 'high':
				return 'badge-error';
			default:
				return 'badge-ghost';
		}
	}

	// Model management in edit form
	function addModel() {
		if (!editForm.models) editForm.models = [];
		editForm.models = [
			...editForm.models,
			{ id: '', name: '', shortName: '', costTier: 'medium' }
		];
	}

	function removeModel(index: number) {
		if (!editForm.models) return;
		editForm.models = editForm.models.filter((_, i) => i !== index);
	}

	function updateModel(index: number, field: keyof AgentModel, value: string) {
		if (!editForm.models) return;
		const models = [...editForm.models];
		models[index] = { ...models[index], [field]: value };
		editForm.models = models;
	}

	// Flag management
	let newFlag = $state('');

	function addFlag() {
		if (!newFlag.trim()) return;
		if (!editForm.flags) editForm.flags = [];
		editForm.flags = [...editForm.flags, newFlag.trim()];
		newFlag = '';
	}

	function removeFlag(index: number) {
		if (!editForm.flags) return;
		editForm.flags = editForm.flags.filter((_, i) => i !== index);
	}

	// Flag management for add form
	function addNewFormFlag() {
		if (!newFormNewFlag.trim()) return;
		newFormFlags = [...newFormFlags, newFormNewFlag.trim()];
		newFormNewFlag = '';
	}

	function removeNewFormFlag(index: number) {
		newFormFlags = newFormFlags.filter((_, i) => i !== index);
	}
</script>

<div class="agent-programs-editor">
	<div class="section-header">
		<div class="header-content">
			<h2>Agent Harnesses</h2>
			<p class="section-description">
				Configure AI coding agent harnesses. Harnesses wrap LLMs for coding tasks.
			</p>
		</div>
		<button class="btn btn-sm btn-primary" onclick={openAddModal}>
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
			</svg>
			Add Harness
		</button>
	</div>

	{#if isLoading}
		<div class="loading">
			<span class="loading-spinner"></span>
			Loading agent programs...
		</div>
	{:else if error}
		<div class="error-banner">
			<span>{error}</span>
			<button class="btn btn-sm" onclick={() => { error = null; fetchPrograms(); }}>Retry</button>
		</div>
	{:else}
		<div class="programs-list">
			{#each programs as program (program.id)}
				{@const isDefault = defaults?.fallbackAgent === program.id}
				<div
					class="program-card"
					class:default={isDefault}
					class:disabled={!program.enabled}
					class:drag-over={dragOverItem === program.id}
					draggable="true"
					ondragstart={(e) => handleDragStart(e, program.id)}
					ondragover={(e) => handleDragOver(e, program.id)}
					ondragleave={handleDragLeave}
					ondrop={(e) => handleDrop(e, program.id)}
					ondragend={handleDragEnd}
					role="listitem"
				>
					<div class="drag-handle" title="Drag to reorder">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon">
							<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
						</svg>
					</div>

					<div
						class="program-main"
						onclick={() => openEditDrawer(program)}
						onkeydown={(e) => e.key === 'Enter' && openEditDrawer(program)}
						role="button"
						tabindex="0"
					>
						<div class="program-header">
							<div class="program-title">
								<ProviderLogo agentId={program.id} size={20} />
								<h3>{program.name}</h3>
								{#if isDefault}
									<span class="default-badge" title="Default agent">
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="icon-sm">
											<path fill-rule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clip-rule="evenodd" />
										</svg>
									</span>
								{/if}
							</div>
							<div class="program-badges">
								<span
									class="status-badge"
									style="background: {getStatusColor(program.status)}; color: white;"
								>
									{program.status?.available ? 'Available' : program.status?.statusMessage ?? 'Unknown'}
								</span>
								<span class="auth-badge">{getAuthTypeLabel(program.authType)}</span>
							</div>
						</div>

						<div class="program-details">
							<div class="detail-row">
								<span class="detail-label">Command:</span>
								<code class="detail-value">{program.command}</code>
							</div>
							<div class="detail-row">
								<span class="detail-label">Default Model:</span>
								<span class="detail-value">{program.defaultModel}</span>
							</div>
							{#if program.models.length > 0}
								<div class="detail-row">
									<span class="detail-label">Models:</span>
									<div class="models-list">
										{#each program.models as model}
											<span class="model-badge {getCostTierBadge(model.costTier)}" title={model.description ?? model.id}>
												{model.shortName}
											</span>
										{/each}
									</div>
								</div>
							{/if}
							{#if program.flags.length > 0}
								<div class="detail-row">
									<span class="detail-label">Flags:</span>
									<code class="detail-value flags">{program.flags.join(' ')}</code>
								</div>
							{/if}
						</div>

						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
						<div class="program-actions" onclick={(e) => e.stopPropagation()}>
							<label class="toggle-label">
								<input
									type="checkbox"
									checked={program.enabled}
									onchange={() => toggleEnabled(program)}
								/>
								<span>Enabled</span>
							</label>

							{#if !isDefault && program.enabled}
								<button
									class="btn btn-xs btn-ghost"
									onclick={() => setAsDefault(program.id)}
									title="Set as default agent"
								>
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon-sm">
										<path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
									</svg>
									Set Default
								</button>
							{/if}

							<button
								class="btn btn-xs btn-ghost"
								onclick={() => openEditDrawer(program)}
							>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon-sm">
									<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
								</svg>
								Configure
							</button>

							{#if !isDefault}
								<button
									class="btn btn-xs btn-ghost btn-error"
									onclick={() => openDeleteConfirm(program.id)}
								>
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon-sm">
										<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
									</svg>
									Delete
								</button>
							{/if}
						</div>
					</div>
				</div>
			{/each}

			{#if programs.length === 0}
				<div class="empty-state">
					<p>No agent programs configured.</p>
					<button class="btn btn-primary" onclick={openAddModal}>Add Your First Agent</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- Edit Drawer -->
{#if editingProgram}
	<div class="drawer-overlay" onclick={closeEditDrawer} transition:fade={{ duration: 150 }}>
		<div class="drawer-content" onclick={(e) => e.stopPropagation()} transition:slide={{ duration: 200, axis: 'x' }}>
			<div class="drawer-header">
				<h3>Configure {editingProgram.name}</h3>
				<button class="btn btn-ghost btn-sm btn-circle" onclick={closeEditDrawer}>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="drawer-body">
				<div class="form-section">
					<h4>Basic Settings</h4>

					<div class="form-group">
						<label for="edit-name">Display Name</label>
						<input
							type="text"
							id="edit-name"
							class="input input-bordered w-full"
							bind:value={editForm.name}
						/>
					</div>

					<div class="form-group">
						<label for="edit-command">CLI Command</label>
						<input
							type="text"
							id="edit-command"
							class="input input-bordered w-full"
							placeholder="claude"
							bind:value={editForm.command}
						/>
						<p class="form-hint">The executable to run (e.g., claude, codex, aider)</p>
					</div>

					<div class="form-group">
						<label for="edit-default-model">Default Model</label>
						<select
							id="edit-default-model"
							class="select select-bordered w-full"
							bind:value={editForm.defaultModel}
						>
							{#each editForm.models ?? [] as model}
								<option value={model.shortName}>{model.name} ({model.shortName})</option>
							{/each}
						</select>
					</div>
				</div>

				<div class="form-section">
					<h4>Authentication</h4>

					<div class="form-group">
						<label for="edit-auth-type">Auth Type</label>
						<select
							id="edit-auth-type"
							class="select select-bordered w-full"
							bind:value={editForm.authType}
						>
							<option value="subscription">Subscription (CLI auth)</option>
							<option value="api_key">API Key (from vault)</option>
							<option value="none">None (local models)</option>
						</select>
					</div>

					{#if editForm.authType === 'api_key'}
						<div class="form-group">
							<label for="edit-api-provider">API Key Provider</label>
							<input
								type="text"
								id="edit-api-provider"
								class="input input-bordered w-full"
								placeholder="openai, anthropic, google, etc."
								bind:value={editForm.apiKeyProvider}
							/>
							<p class="form-hint">References key name in Settings &gt; API Keys</p>
						</div>

						<div class="form-group">
							<label for="edit-api-env">Environment Variable</label>
							<input
								type="text"
								id="edit-api-env"
								class="input input-bordered w-full"
								placeholder="OPENAI_API_KEY"
								bind:value={editForm.apiKeyEnvVar}
							/>
							<p class="form-hint">Env var to inject when spawning</p>
						</div>
					{/if}
				</div>

				<div class="form-section">
					<div class="section-header-inline">
						<h4>Models</h4>
						<button class="btn btn-xs btn-ghost" onclick={addModel}>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon-sm">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
							</svg>
							Add Model
						</button>
					</div>

					<div class="models-editor">
						{#each editForm.models ?? [] as model, index}
							<div class="model-row">
								<input
									type="text"
									class="input input-bordered input-sm"
									placeholder="Short name"
									value={model.shortName}
									oninput={(e) => updateModel(index, 'shortName', (e.target as HTMLInputElement).value)}
								/>
								<input
									type="text"
									class="input input-bordered input-sm"
									placeholder="Display name"
									value={model.name}
									oninput={(e) => updateModel(index, 'name', (e.target as HTMLInputElement).value)}
								/>
								<input
									type="text"
									class="input input-bordered input-sm"
									placeholder="Model ID"
									value={model.id}
									oninput={(e) => updateModel(index, 'id', (e.target as HTMLInputElement).value)}
								/>
								<select
									class="select select-bordered select-sm"
									value={model.costTier}
									onchange={(e) => updateModel(index, 'costTier', (e.target as HTMLSelectElement).value)}
								>
									<option value="low">Low</option>
									<option value="medium">Medium</option>
									<option value="high">High</option>
								</select>
								<button
									class="btn btn-xs btn-ghost btn-error"
									onclick={() => removeModel(index)}
									disabled={(editForm.models?.length ?? 0) <= 1}
								>
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon-sm">
										<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							</div>
						{/each}
					</div>
				</div>

				<div class="form-section">
					<div class="section-header-inline">
						<h4>CLI Flags</h4>
					</div>

					<div class="flags-editor">
						{#each editForm.flags ?? [] as flag, index}
							<div class="flag-chip">
								<code>{flag}</code>
								<button class="chip-remove" onclick={() => removeFlag(index)}>
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="icon-xs">
										<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							</div>
						{/each}
						<div class="flag-input">
							<input
								type="text"
								class="input input-bordered input-sm"
								placeholder="--flag-name"
								bind:value={newFlag}
								onkeydown={(e) => e.key === 'Enter' && addFlag()}
							/>
							<button class="btn btn-xs btn-ghost" onclick={addFlag} disabled={!newFlag.trim()}>Add</button>
						</div>
					</div>
				</div>

				<div class="form-section">
					<h4>Advanced</h4>

					<div class="form-group">
						<label for="edit-instructions">Instructions File (optional)</label>
						<input
							type="text"
							id="edit-instructions"
							class="input input-bordered w-full"
							placeholder="/path/to/CLAUDE.md"
							bind:value={editForm.instructionsFile}
						/>
						<p class="form-hint">Path to instructions file to inject</p>
					</div>

					<div class="form-group">
						<label for="edit-startup-pattern">Startup Pattern (optional)</label>
						<input
							type="text"
							id="edit-startup-pattern"
							class="input input-bordered w-full"
							placeholder={`{command} --model {model} {flags}`}
							bind:value={editForm.startupPattern}
						/>
						<p class="form-hint">Custom command pattern. Uses {`{command}`}, {`{model}`}, {`{flags}`}</p>
					</div>

					<div class="form-group">
						<label for="edit-task-injection">Task Injection Method</label>
						<select
							id="edit-task-injection"
							class="select select-bordered w-full"
							bind:value={editForm.taskInjection}
						>
							<option value="prompt">Prompt (default)</option>
							<option value="stdin">Stdin</option>
							<option value="argument">CLI Argument</option>
						</select>
					</div>
				</div>

				{#if editError}
					<div class="error-message">{editError}</div>
				{/if}
			</div>

			<div class="drawer-footer">
				<button class="btn btn-ghost" onclick={closeEditDrawer}>Cancel</button>
				<button
					class="btn btn-primary"
					onclick={saveProgram}
					disabled={isSaving}
				>
					{#if isSaving}
						<span class="loading-spinner small"></span>
						Saving...
					{:else}
						Save Changes
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Add Harness Modal -->
{#if showAddModal}
	<div class="modal-overlay" onclick={closeAddModal} transition:fade={{ duration: 150 }}>
		<div class="modal-content modal-lg" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h3>Add Agent Harness</h3>
				<button class="btn btn-ghost btn-sm btn-circle" onclick={closeAddModal}>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="modal-body">
				{#if !selectedPreset}
					<p class="modal-description">Choose a preset or create a custom agent:</p>

					<div class="presets-grid">
						{#each AGENT_PRESETS as preset}
							<button
								class="preset-card"
								onclick={() => selectPreset(preset.id)}
							>
								<div class="preset-header">
									<ProviderLogo agentId={preset.id} size={24} />
									<h4>{preset.name}</h4>
								</div>
								<p>{preset.description}</p>
								<div class="preset-models">
									{#each preset.config.models ?? [] as model}
										<span class="model-badge badge-ghost">{model.shortName}</span>
									{/each}
								</div>
							</button>
						{/each}

						<button
							class="preset-card custom"
							onclick={() => {
								selectedPreset = 'custom';
								newProgramForm = {
									id: '',
									name: '',
									command: '',
									models: [{ id: '', name: '', shortName: '', costTier: 'medium' }],
									defaultModel: '',
									flags: [],
									authType: 'subscription',
									enabled: true,
									isDefault: false
								};
							}}
						>
							<div class="preset-header">
								<ProviderLogo provider="generic" size={24} />
								<h4>Custom Agent</h4>
							</div>
							<p>Configure from scratch</p>
						</button>
					</div>
				{:else}
					{@const selectedPresetInfo = AGENT_PRESETS.find(p => p.id === selectedPreset)}
					<!-- Installation Instructions -->
					{#if selectedPresetInfo && (selectedPresetInfo.installCommand || selectedPresetInfo.installUrl)}
						<div class="install-info">
							<div class="install-header">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon-sm">
									<path stroke-linecap="round" stroke-linejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23-.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
								</svg>
								<span>Installation</span>
							</div>
							{#if selectedPresetInfo.installCommand}
								<div class="install-command">
									<code>{selectedPresetInfo.installCommand}</code>
									<button
										class="btn btn-ghost btn-xs copy-btn"
										onclick={() => {
											navigator.clipboard.writeText(selectedPresetInfo.installCommand || '');
										}}
										title="Copy command"
									>
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon-xs">
											<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
										</svg>
									</button>
								</div>
							{/if}
							{#if selectedPresetInfo.installUrl}
								<a href={selectedPresetInfo.installUrl} target="_blank" rel="noopener noreferrer" class="install-link">
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon-xs">
										<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
									</svg>
									View full installation instructions
								</a>
							{/if}
						</div>
					{/if}

					<div class="form-section">
						<div class="form-group">
							<label for="new-id">Agent ID</label>
							<input
								type="text"
								id="new-id"
								class="input input-bordered w-full"
								placeholder="my-agent"
								bind:value={newProgramForm.id}
							/>
							<p class="form-hint">Lowercase, alphanumeric with hyphens</p>
						</div>

						<div class="form-group">
							<label for="new-name">Display Name</label>
							<input
								type="text"
								id="new-name"
								class="input input-bordered w-full"
								placeholder="My Agent"
								bind:value={newProgramForm.name}
							/>
						</div>

						{#if selectedPreset === 'custom'}
							<div class="form-group">
								<label for="new-command">CLI Command</label>
								<input
									type="text"
									id="new-command"
									class="input input-bordered w-full"
									placeholder="my-cli"
									bind:value={newProgramForm.command}
								/>
							</div>

							<div class="form-group">
								<label for="new-auth">Auth Type</label>
								<select
									id="new-auth"
									class="select select-bordered w-full"
									bind:value={newProgramForm.authType}
								>
									<option value="subscription">Subscription</option>
									<option value="api_key">API Key</option>
									<option value="none">None</option>
								</select>
							</div>
						{/if}

						<!-- Advanced Options (collapsible) -->
						<div class="advanced-options-section">
							<button
								type="button"
								class="btn btn-ghost btn-sm w-full justify-between advanced-toggle"
								onclick={() => showAdvancedOptions = !showAdvancedOptions}
							>
								<span class="flex items-center gap-2">
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon-sm">
										<path stroke-linecap="round" stroke-linejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
										<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
									</svg>
									Advanced Options
								</span>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="icon-sm transition-transform {showAdvancedOptions ? 'rotate-180' : ''}"
								>
									<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
								</svg>
							</button>

							{#if showAdvancedOptions}
								<div class="advanced-options-content" transition:slide={{ duration: 200 }}>
									<!-- CLI Flags -->
									<div class="form-group">
										<label for="new-flags">CLI Flags</label>
										<p class="hint">Additional command-line flags passed to the agent CLI</p>
										<div class="flags-list">
											{#each newFormFlags as flag, index}
												<span class="badge badge-outline gap-1">
													{flag}
													<button
														type="button"
														class="btn btn-ghost btn-xs btn-circle"
														onclick={() => {
															newFormFlags = newFormFlags.filter((_, i) => i !== index);
														}}
													>
														<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon-xs">
															<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
														</svg>
													</button>
												</span>
											{/each}
										</div>
										<div class="flex gap-2">
											<input
												type="text"
												id="new-flags"
												class="input input-bordered input-sm flex-1"
												placeholder="--flag-name"
												bind:value={newFormNewFlag}
												onkeydown={(e) => {
													if (e.key === 'Enter') {
														e.preventDefault();
														addNewFormFlag();
													}
												}}
											/>
											<button
												type="button"
												class="btn btn-sm btn-outline"
												onclick={addNewFormFlag}
												disabled={!newFormNewFlag.trim()}
											>
												Add
											</button>
										</div>
									</div>

									<!-- Instructions File -->
									<div class="form-group">
										<label for="new-instructions">Instructions File</label>
										<p class="hint">Path to a file containing additional system instructions</p>
										<input
											type="text"
											id="new-instructions"
											class="input input-bordered input-sm w-full"
											placeholder="~/.config/jat/agent-instructions.md"
											bind:value={newProgramForm.instructionsFile}
										/>
									</div>

									<!-- Task Injection Method -->
									<div class="form-group">
										<label for="new-task-injection">Task Injection Method</label>
										<p class="hint">How the task prompt is passed to the agent</p>
										<select
											id="new-task-injection"
											class="select select-bordered select-sm w-full"
											bind:value={newProgramForm.taskInjection}
										>
											<option value="">Default (prompt flag)</option>
											<option value="stdin">stdin</option>
											<option value="prompt">prompt flag</option>
											<option value="argument">command argument</option>
										</select>
									</div>

									<!-- Info note -->
									<div class="info-note">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon-sm">
											<path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
										</svg>
										<span>Full configuration options (startup pattern, models, auth settings) available after adding via Settings &gt; Agents.</span>
									</div>
								</div>
							{/if}
						</div>
					</div>

					<button
						class="btn btn-ghost btn-sm back-btn"
						onclick={() => { selectedPreset = null; newProgramForm = {}; showAdvancedOptions = false; newFormFlags = []; newFormNewFlag = ''; verificationResult = null; skipVerification = false; }}
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon-sm">
							<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
						</svg>
						Back to presets
					</button>

					<!-- Verification Warnings -->
					{#if verificationResult && !verificationResult.ready && !skipVerification}
						<div class="verification-warning" transition:slide={{ duration: 200 }}>
							<div class="warning-header">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon-sm">
									<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
								</svg>
								<span>Setup Required</span>
							</div>
							<ul class="warning-list">
								{#each verificationResult.warnings as warning}
									<li>{warning}</li>
								{/each}
							</ul>
							{#if verificationResult.instructions.length > 0}
								<div class="warning-instructions">
									<span class="instructions-label">To fix:</span>
									{#each verificationResult.instructions as instruction}
										<div class="instruction-item">
											{#if instruction.startsWith('Run:') || instruction.startsWith('npm ') || instruction.startsWith('pip ') || instruction.startsWith('curl ')}
												<code>{instruction.replace('Run: ', '')}</code>
												<button
													class="btn btn-ghost btn-xs copy-btn"
													onclick={() => navigator.clipboard.writeText(instruction.replace('Run: ', ''))}
													title="Copy command"
												>
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon-xs">
														<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
													</svg>
												</button>
											{:else}
												<span>{instruction}</span>
											{/if}
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}

					{#if addError}
						<div class="error-message">{addError}</div>
					{/if}
				{/if}
			</div>

			<div class="modal-footer">
				<button class="btn btn-ghost" onclick={closeAddModal}>Cancel</button>
				{#if selectedPreset}
					{#if verificationResult && !verificationResult.ready && !skipVerification}
						<!-- Verification failed - show "Add Anyway" option -->
						<button
							class="btn btn-warning"
							onclick={addAnyway}
							disabled={isAdding || !newProgramForm.id || !newProgramForm.name}
						>
							{#if isAdding}
								<span class="loading-spinner small"></span>
								Adding...
							{:else}
								Add Anyway
							{/if}
						</button>
					{:else}
						<button
							class="btn btn-primary"
							onclick={addProgram}
							disabled={isAdding || isVerifying || !newProgramForm.id || !newProgramForm.name}
						>
							{#if isVerifying}
								<span class="loading-spinner small"></span>
								Verifying...
							{:else if isAdding}
								<span class="loading-spinner small"></span>
								Adding...
							{:else}
								Add Harness
							{/if}
						</button>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Delete Confirmation Modal -->
{#if deletingProgram}
	{@const program = programs.find(p => p.id === deletingProgram)}
	<div class="modal-overlay" onclick={closeDeleteConfirm} transition:fade={{ duration: 150 }}>
		<div class="modal-content modal-sm" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h3>Delete Agent Harness</h3>
			</div>

			<div class="modal-body">
				<p>
					Are you sure you want to delete <strong>{program?.name}</strong>?
					This cannot be undone.
				</p>
			</div>

			<div class="modal-footer">
				<button class="btn btn-ghost" onclick={closeDeleteConfirm}>Cancel</button>
				<button
					class="btn btn-error"
					onclick={deleteProgram}
					disabled={isDeleting}
				>
					{#if isDeleting}
						<span class="loading-spinner small"></span>
						Deleting...
					{:else}
						Delete
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.agent-programs-editor {
		padding: 1rem;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 1.5rem;
	}

	.header-content h2 {
		font-size: 1.25rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0 0 0.5rem 0;
	}

	.section-description {
		font-size: 0.875rem;
		color: oklch(0.60 0.02 250);
		margin: 0;
	}

	.loading {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 2rem;
		color: oklch(0.60 0.02 250);
	}

	.loading-spinner {
		width: 20px;
		height: 20px;
		border: 2px solid oklch(0.30 0.02 250);
		border-top-color: oklch(0.70 0.15 200);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.loading-spinner.small {
		width: 14px;
		height: 14px;
		border-width: 1.5px;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.error-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		background: oklch(0.25 0.08 30);
		border: 1px solid oklch(0.40 0.12 30);
		border-radius: 8px;
		color: oklch(0.85 0.10 30);
	}

	.programs-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.program-card {
		display: flex;
		align-items: stretch;
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 12px;
		overflow: hidden;
		transition: all 0.15s ease;
	}

	.program-card.default {
		border-color: oklch(0.45 0.15 85);
	}

	.program-card.disabled {
		opacity: 0.6;
	}

	.program-card.drag-over {
		border-color: oklch(0.55 0.15 200);
		background: oklch(0.18 0.03 200);
	}

	.program-card:hover {
		border-color: oklch(0.35 0.05 250);
	}

	.drag-handle {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 0.75rem;
		background: oklch(0.14 0.02 250);
		cursor: grab;
		color: oklch(0.45 0.02 250);
	}

	.drag-handle:hover {
		color: oklch(0.65 0.02 250);
	}

	.drag-handle:active {
		cursor: grabbing;
	}

	.program-main {
		flex: 1;
		padding: 1rem;
		cursor: pointer;
		border-radius: 0 10px 10px 0;
		transition: background-color 0.15s ease;
	}

	.program-main:hover {
		background-color: oklch(0.18 0.02 250);
	}

	.program-main:focus {
		outline: none;
		background-color: oklch(0.18 0.02 250);
	}

	.program-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 0.75rem;
	}

	.program-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.program-title h3 {
		font-size: 1rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
	}

	.default-badge {
		color: oklch(0.75 0.15 85);
	}

	.program-badges {
		display: flex;
		gap: 0.5rem;
	}

	.status-badge {
		font-size: 0.7rem;
		padding: 0.2rem 0.5rem;
		border-radius: 9999px;
		font-weight: 500;
	}

	.auth-badge {
		font-size: 0.7rem;
		padding: 0.2rem 0.5rem;
		border-radius: 9999px;
		font-weight: 500;
		background: oklch(0.25 0.02 250);
		color: oklch(0.70 0.02 250);
	}

	.program-details {
		margin-bottom: 0.75rem;
	}

	.detail-row {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		font-size: 0.8125rem;
		margin-bottom: 0.375rem;
	}

	.detail-label {
		color: oklch(0.55 0.02 250);
		min-width: 90px;
		flex-shrink: 0;
	}

	.detail-value {
		color: oklch(0.80 0.02 250);
	}

	.detail-value.flags {
		word-break: break-all;
	}

	code.detail-value {
		font-family: ui-monospace, monospace;
		background: oklch(0.18 0.02 250);
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		font-size: 0.75rem;
	}

	.models-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.model-badge {
		font-size: 0.7rem;
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		font-weight: 500;
	}

	.badge-success {
		background: oklch(0.30 0.10 145);
		color: oklch(0.80 0.12 145);
	}

	.badge-warning {
		background: oklch(0.30 0.10 85);
		color: oklch(0.80 0.12 85);
	}

	.badge-error {
		background: oklch(0.30 0.10 30);
		color: oklch(0.80 0.12 30);
	}

	.badge-ghost {
		background: oklch(0.22 0.02 250);
		color: oklch(0.70 0.02 250);
	}

	.program-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.toggle-label {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		cursor: pointer;
		font-size: 0.8125rem;
		color: oklch(0.70 0.02 250);
	}

	.toggle-label input {
		width: 16px;
		height: 16px;
		accent-color: oklch(0.55 0.15 200);
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.75rem;
		font-size: 0.8125rem;
		font-weight: 500;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
		border: none;
	}

	.btn-sm {
		padding: 0.375rem 0.625rem;
		font-size: 0.75rem;
	}

	.btn-xs {
		padding: 0.25rem 0.5rem;
		font-size: 0.7rem;
	}

	.btn-primary {
		background: oklch(0.55 0.15 200);
		color: white;
	}

	.btn-primary:hover:not(:disabled) {
		background: oklch(0.60 0.15 200);
	}

	.btn-ghost {
		background: transparent;
		color: oklch(0.70 0.02 250);
	}

	.btn-ghost:hover:not(:disabled) {
		background: oklch(0.22 0.02 250);
	}

	.btn-error {
		color: oklch(0.80 0.15 30);
	}

	.btn-error:hover:not(:disabled) {
		background: oklch(0.30 0.10 30);
	}

	.btn-circle {
		padding: 0.375rem;
		border-radius: 50%;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.icon {
		width: 16px;
		height: 16px;
	}

	.icon-sm {
		width: 14px;
		height: 14px;
	}

	.icon-xs {
		width: 12px;
		height: 12px;
	}

	.empty-state {
		text-align: center;
		padding: 3rem 2rem;
		background: oklch(0.14 0.01 250);
		border-radius: 12px;
	}

	.empty-state p {
		color: oklch(0.60 0.02 250);
		margin-bottom: 1rem;
	}

	/* Drawer */
	.drawer-overlay {
		position: fixed;
		inset: 0;
		background: oklch(0 0 0 / 0.6);
		display: flex;
		justify-content: flex-end;
		z-index: 50;
	}

	.drawer-content {
		background: oklch(0.14 0.02 250);
		width: 100%;
		max-width: 560px;
		height: 100%;
		display: flex;
		flex-direction: column;
		box-shadow: -4px 0 20px oklch(0 0 0 / 0.3);
	}

	.drawer-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid oklch(0.25 0.02 250);
	}

	.drawer-header h3 {
		font-size: 1.125rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
	}

	.drawer-body {
		flex: 1;
		overflow-y: auto;
		padding: 1.25rem;
	}

	.drawer-footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		padding: 1rem 1.25rem;
		border-top: 1px solid oklch(0.25 0.02 250);
	}

	.form-section {
		margin-bottom: 1.5rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.form-section:last-of-type {
		border-bottom: none;
	}

	.form-section h4 {
		font-size: 0.9375rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		margin: 0 0 1rem 0;
	}

	.section-header-inline {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.section-header-inline h4 {
		margin: 0;
	}

	.form-group {
		margin-bottom: 1rem;
	}

	.form-group label {
		display: block;
		font-size: 0.8125rem;
		font-weight: 500;
		color: oklch(0.75 0.02 250);
		margin-bottom: 0.375rem;
	}

	.input,
	.select {
		width: 100%;
		padding: 0.625rem 0.75rem;
		background: oklch(0.12 0.01 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 6px;
		color: oklch(0.90 0.02 250);
		font-size: 0.875rem;
	}

	.input-sm,
	.select-sm {
		padding: 0.375rem 0.5rem;
		font-size: 0.8125rem;
	}

	.input:focus,
	.select:focus {
		outline: none;
		border-color: oklch(0.55 0.15 200);
	}

	.form-hint {
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
		margin-top: 0.375rem;
	}

	.models-editor {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.model-row {
		display: grid;
		grid-template-columns: 1fr 1.5fr 2fr auto auto;
		gap: 0.5rem;
		align-items: center;
	}

	.flags-editor {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.flag-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		background: oklch(0.22 0.02 250);
		padding: 0.25rem 0.375rem 0.25rem 0.5rem;
		border-radius: 4px;
	}

	.flag-chip code {
		font-size: 0.75rem;
		color: oklch(0.80 0.02 250);
	}

	.chip-remove {
		display: flex;
		padding: 0.125rem;
		background: transparent;
		border: none;
		color: oklch(0.55 0.02 250);
		cursor: pointer;
		border-radius: 2px;
	}

	.chip-remove:hover {
		background: oklch(0.30 0.08 30);
		color: oklch(0.80 0.12 30);
	}

	.flag-input {
		display: flex;
		gap: 0.375rem;
	}

	.flag-input .input {
		width: 120px;
	}

	.error-message {
		padding: 0.625rem 0.75rem;
		background: oklch(0.25 0.08 30);
		border: 1px solid oklch(0.40 0.12 30);
		border-radius: 6px;
		color: oklch(0.85 0.10 30);
		font-size: 0.8125rem;
		margin-top: 1rem;
	}

	/* Modal */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: oklch(0 0 0 / 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 50;
		padding: 1rem;
	}

	.modal-content {
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 12px;
		width: 100%;
		max-width: 480px;
		max-height: 90vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 40px oklch(0 0 0 / 0.3);
	}

	.modal-sm {
		max-width: 360px;
	}

	.modal-lg {
		max-width: 640px;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid oklch(0.25 0.02 250);
	}

	.modal-header h3 {
		font-size: 1rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
	}

	.modal-body {
		padding: 1.25rem;
		overflow-y: auto;
	}

	.modal-description {
		font-size: 0.875rem;
		color: oklch(0.65 0.02 250);
		margin: 0 0 1rem 0;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		padding: 1rem 1.25rem;
		border-top: 1px solid oklch(0.25 0.02 250);
	}

	/* Presets Grid */
	.presets-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 0.75rem;
	}

	.preset-card {
		background: oklch(0.14 0.01 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 10px;
		padding: 1rem;
		text-align: left;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.preset-card:hover {
		border-color: oklch(0.45 0.12 200);
		background: oklch(0.16 0.02 200);
	}

	.preset-card.custom {
		border-style: dashed;
	}

	.preset-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.375rem;
	}

	.preset-card h4 {
		font-size: 0.9375rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
	}

	.preset-card p {
		font-size: 0.8125rem;
		color: oklch(0.60 0.02 250);
		margin: 0 0 0.75rem 0;
	}

	.preset-models {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	/* Installation Info Section */
	.install-info {
		background: oklch(0.16 0.02 200 / 0.3);
		border: 1px solid oklch(0.35 0.08 200 / 0.4);
		border-radius: 8px;
		padding: 0.875rem;
		margin-bottom: 1.25rem;
	}

	.install-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: oklch(0.80 0.08 200);
		margin-bottom: 0.625rem;
	}

	.install-header .icon-sm {
		width: 16px;
		height: 16px;
	}

	.install-command {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: oklch(0.12 0.01 250);
		border-radius: 6px;
		padding: 0.5rem 0.625rem;
		margin-bottom: 0.5rem;
		overflow-x: auto;
	}

	.install-command code {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.8125rem;
		color: oklch(0.85 0.02 250);
		white-space: nowrap;
		flex: 1;
	}

	.install-command .copy-btn {
		flex-shrink: 0;
		opacity: 0.6;
		padding: 0.25rem;
	}

	.install-command .copy-btn:hover {
		opacity: 1;
		background: oklch(0.22 0.02 250);
	}

	.install-link {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8125rem;
		color: oklch(0.70 0.12 200);
		text-decoration: none;
	}

	.install-link:hover {
		color: oklch(0.80 0.15 200);
		text-decoration: underline;
	}

	.icon-xs {
		width: 14px;
		height: 14px;
	}

	/* Verification Warning */
	.verification-warning {
		background: oklch(0.25 0.08 85 / 0.3);
		border: 1px solid oklch(0.50 0.12 85 / 0.5);
		border-radius: 8px;
		padding: 0.875rem;
		margin-top: 1rem;
	}

	.warning-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		color: oklch(0.85 0.12 85);
		margin-bottom: 0.5rem;
	}

	.warning-list {
		margin: 0 0 0.75rem 0;
		padding-left: 1.5rem;
		color: oklch(0.75 0.08 85);
		font-size: 0.875rem;
	}

	.warning-list li {
		margin-bottom: 0.25rem;
	}

	.warning-instructions {
		background: oklch(0.12 0.01 250);
		border-radius: 6px;
		padding: 0.625rem 0.75rem;
	}

	.instructions-label {
		display: block;
		font-size: 0.75rem;
		font-weight: 600;
		color: oklch(0.65 0.02 250);
		margin-bottom: 0.5rem;
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}

	.instruction-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.375rem;
	}

	.instruction-item:last-child {
		margin-bottom: 0;
	}

	.instruction-item code {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.8125rem;
		color: oklch(0.85 0.02 250);
		background: oklch(0.18 0.01 250);
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		flex: 1;
	}

	.instruction-item span {
		font-size: 0.8125rem;
		color: oklch(0.70 0.02 250);
	}

	.back-btn {
		margin-top: 1rem;
	}

	/* Advanced Options Section */
	.advanced-options-section {
		margin-top: 1.25rem;
		padding-top: 1rem;
		border-top: 1px solid oklch(0.22 0.02 250);
	}

	.advanced-toggle {
		color: oklch(0.65 0.02 250);
		font-size: 0.8125rem;
	}

	.advanced-toggle:hover {
		color: oklch(0.80 0.02 250);
		background: oklch(0.18 0.02 250);
	}

	.advanced-options-content {
		padding: 1rem 0;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.advanced-options-content .form-group {
		margin-bottom: 0;
	}

	.advanced-options-content .hint {
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
		margin: 0 0 0.5rem 0;
	}

	.flags-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin-bottom: 0.5rem;
		min-height: 1.5rem;
	}

	.flags-list .badge {
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
	}

	.flags-list .btn-circle {
		padding: 0;
		min-height: unset;
		height: auto;
		width: auto;
	}

	.info-note {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.75rem;
		background: oklch(0.18 0.03 200 / 0.15);
		border: 1px solid oklch(0.35 0.08 200 / 0.3);
		border-radius: 8px;
		font-size: 0.8125rem;
		color: oklch(0.70 0.05 200);
	}

	.info-note svg {
		flex-shrink: 0;
		margin-top: 0.125rem;
	}
</style>
