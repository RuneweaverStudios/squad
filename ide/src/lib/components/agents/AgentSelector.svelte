<script lang="ts">
	/**
	 * AgentSelector - Agent/model picker dropdown for spawn flow
	 *
	 * Shows which agent would be auto-selected from routing rules,
	 * allows user override, and returns selection for spawn API.
	 *
	 * Usage:
	 *   <AgentSelector {task} onselect={handleSelect} />
	 *
	 * The component fetches agent programs and evaluates routing rules
	 * to show the auto-selected agent/model, with override capability.
	 */

	import { onMount, tick } from 'svelte';
	import type { AgentProgram, AgentModel, AgentStatus } from '$lib/types/agentProgram';
	import ProviderLogo from './ProviderLogo.svelte';

	interface Task {
		id: string;
		issue_type?: string;
		labels?: string[];
		priority?: number;
		title?: string;
		agent_program?: string | null;
		model?: string | null;
	}

	interface RoutingResult {
		agentId: string;
		agentName: string;
		modelId: string;
		modelName: string;
		matchedRule: { id: string; name: string } | null;
		reason: string;
	}

	interface Props {
		task: Task;
		/** Called when user confirms selection (Launch / Save & Launch) */
		onselect?: (selection: { agentId: string | null; model: string | null }) => void;
		/** Called when user wants to save without launching */
		onsave?: (selection: { agentId: string | null; model: string | null }) => void;
		/** Called when user cancels/closes */
		oncancel?: () => void;
		/** Show compact inline mode vs full dropdown */
		compact?: boolean;
	}

	let {
		task,
		onselect = () => {},
		onsave,
		oncancel = () => {},
		compact = false
	}: Props = $props();

	// State
	let loading = $state(true);
	let error = $state<string | null>(null);
	let programs = $state<AgentProgram[]>([]);
	let statuses = $state<AgentStatus[]>([]);
	let routingResult = $state<RoutingResult | null>(null);

	// Selection state
	let selectedAgentId = $state<string | null>(null);
	let selectedModel = $state<string | null>(null);
	let useAutoSelection = $state(true);

	// Dropdown visibility state
	let showAgentDropdown = $state(false);
	let showModelDropdown = $state(false);

	// Model search state (type-to-filter)
	let modelSearchQuery = $state('');
	let modelSearchInput: HTMLInputElement | undefined;

	// Model loading state
	let modelsLoading = $state(false);
	let modelsError = $state<string | null>(null);
	let modelsByAgentId = $state<Record<string, AgentModel[]>>({});

	// Keyboard navigation state
	let highlightedAgentIndex = $state(-1);
	let highlightedModelIndex = $state(-1);

	// Refs for dropdown containers
	let agentDropdownRef = $state<HTMLDivElement | null>(null);
	let modelDropdownRef = $state<HTMLDivElement | null>(null);

	// Is "human" selected?
	const isHumanSelected = $derived(selectedAgentId === 'human');

	// Derived: currently selected agent object
	const selectedAgent = $derived(
		selectedAgentId ? programs.find((p) => p.id === selectedAgentId) : null
	);

	// Derived: available models for selected agent (dynamic fetch + fallback)
	const availableModels = $derived.by(() => {
		if (!selectedAgentId) return [];
		const cached = modelsByAgentId[selectedAgentId];
		return cached ?? selectedAgent?.models ?? [];
	});

	// Derived: filtered models based on search query
	const filteredModels = $derived.by(() => {
		if (!modelSearchQuery.trim()) return availableModels;
		const q = modelSearchQuery.toLowerCase();
		return availableModels.filter((m) =>
			m.name?.toLowerCase().includes(q) ||
			m.shortName?.toLowerCase().includes(q) ||
			m.id?.toLowerCase().includes(q)
		);
	});

	// Derived: is selection different from auto?
	const isOverridden = $derived(
		!useAutoSelection ||
			(routingResult &&
				(selectedAgentId !== routingResult.agentId ||
					selectedModel !== routingResult.modelName.toLowerCase()))
	);

	// Fetch agents and evaluate routing on mount
	onMount(async () => {
		await loadAgentsAndRouting();
	});

	async function loadModelsForAgent(agentId: string, force = false) {
		if (!agentId) return;
		if (!force && modelsByAgentId[agentId]) return;

		modelsLoading = true;
		modelsError = null;

		try {
			const response = await fetch(`/api/config/agents/${agentId}/models`);
			if (!response.ok) {
				throw new Error(`Failed to fetch models (${response.status})`);
			}
			const data = await response.json();
			const models = data.models ?? [];
			modelsByAgentId = { ...modelsByAgentId, [agentId]: models };
		} catch (err) {
			modelsError = err instanceof Error ? err.message : 'Failed to load models';
			const fallbackAgent = programs.find((p) => p.id === agentId);
			modelsByAgentId = { ...modelsByAgentId, [agentId]: fallbackAgent?.models ?? [] };
		} finally {
			modelsLoading = false;
		}
	}

	async function loadAgentsAndRouting() {
		loading = true;
		error = null;

		try {
			// Fetch agents with status
			const agentsResponse = await fetch('/api/config/agents?status=true');
			if (!agentsResponse.ok) {
				throw new Error('Failed to fetch agent programs');
			}
			const agentsData = await agentsResponse.json();
			programs = agentsData.programs ?? [];
			statuses = agentsData.statuses ?? [];

			// Evaluate routing for this task
			const routingResponse = await fetch('/api/config/agents/routing', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					task: {
						id: task.id,
						type: task.issue_type,
						labels: task.labels ?? [],
						priority: task.priority,
						project: task.id?.split('-')[0]
					}
				})
			});

			if (routingResponse.ok) {
				const routingData = await routingResponse.json();
				routingResult = routingData.result;

				// If task already has saved agent_program/model, use those
				if (task.agent_program) {
					selectedAgentId = task.agent_program;
					selectedModel = task.model ?? programs.find(p => p.id === task.agent_program)?.defaultModel ?? null;
					useAutoSelection = false;
				} else {
					// Initialize selection with auto-selected values from routing
					const result = routingResult;
					if (result) {
						selectedAgentId = result.agentId;
						// Find the model shortName from the model name
						const agent = programs.find((p) => p.id === result.agentId);
						const model = agent?.models.find((m) => m.name === result.modelName);
						selectedModel = model?.shortName ?? null;
					}
				}

				if (selectedAgentId) {
					await loadModelsForAgent(selectedAgentId);
				}
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load agent configuration';
		} finally {
			loading = false;
		}
	}

	function getAgentStatus(agentId: string): AgentStatus | undefined {
		return statuses.find((s) => s.agentId === agentId);
	}

	function handleAgentChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		selectedAgentId = target.value || null;
		useAutoSelection = false;
		modelSearchQuery = '';

		// Reset model to agent's default
		const agent = programs.find((p) => p.id === selectedAgentId);
		selectedModel = agent?.defaultModel ?? null;

		if (selectedAgentId) {
			void loadModelsForAgent(selectedAgentId);
		}
	}

	function handleModelChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		selectedModel = target.value || null;
		useAutoSelection = false;
	}

	function handleResetToAuto() {
		const result = routingResult;
		if (result) {
			selectedAgentId = result.agentId;
			const agent = programs.find((p) => p.id === result.agentId);
			const model = agent?.models.find((m) => m.name === result.modelName);
			selectedModel = model?.shortName ?? null;
			useAutoSelection = true;
			modelSearchQuery = '';
			void loadModelsForAgent(result.agentId);
		}
	}

	function getSelection(): { agentId: string | null; model: string | null } {
		// If using auto selection, pass null to let spawn API use routing
		if (useAutoSelection) {
			return { agentId: null, model: null };
		}
		return { agentId: selectedAgentId, model: selectedModel };
	}

	function handleConfirm() {
		if (isHumanSelected) {
			// For human, we save agent_program='human' and don't launch
			onsave?.({ agentId: 'human', model: null });
			return;
		}
		onselect(getSelection());
	}

	function handleSave() {
		onsave?.(getSelection());
	}

	function handleCancel() {
		oncancel();
	}

	// Get display name for model
	function getModelDisplayName(model: AgentModel): string {
		return `${model.name}${model.costTier ? ` (${model.costTier})` : ''}`;
	}

	// Get model metadata line (cost tier + context)
	function getModelMeta(model: AgentModel): string {
		const parts: string[] = [];
		if (model.costTier) parts.push(`Cost: ${model.costTier}`);
		if (model.description) parts.push(model.description);
		return parts.length > 0 ? parts.join(' • ') : 'Standard';
	}

	// Select agent from dropdown
	function selectAgent(program: AgentProgram) {
		selectedAgentId = program.id;
		useAutoSelection = false;
		selectedModel = program.defaultModel ?? null;
		modelSearchQuery = '';
		showAgentDropdown = false;
		highlightedAgentIndex = -1;
		void loadModelsForAgent(program.id);
	}

	// Select model from dropdown
	function selectModel(model: AgentModel) {
		selectedModel = model.shortName;
		useAutoSelection = false;
		showModelDropdown = false;
		modelSearchQuery = '';
		highlightedModelIndex = -1;
	}

	// Open/close agent dropdown with keyboard reset
	function toggleAgentDropdown() {
		showAgentDropdown = !showAgentDropdown;
		if (showAgentDropdown) {
			// Reset to current selection or first available
			const currentIndex = programs.findIndex((p) => p.id === selectedAgentId);
			highlightedAgentIndex = currentIndex >= 0 ? currentIndex : 0;
			showModelDropdown = false;
		} else {
			highlightedAgentIndex = -1;
		}
	}

	// Open/close model dropdown with keyboard reset
	function toggleModelDropdown() {
		if (!selectedAgent) return;
		showModelDropdown = !showModelDropdown;
		if (showModelDropdown) {
			modelSearchQuery = '';
			// Reset to current selection or first available
			const currentIndex = availableModels.findIndex((m) => m.shortName === selectedModel);
			highlightedModelIndex = currentIndex >= 0 ? currentIndex : 0;
			showAgentDropdown = false;
			tick().then(() => modelSearchInput?.focus());
		} else {
			highlightedModelIndex = -1;
		}
	}

	// Get available (non-disabled) agents for keyboard navigation
	function getAvailableAgentIndexes(): number[] {
		return programs
			.map((p, i) => ({ index: i, available: getAgentStatus(p.id)?.available }))
			.filter((item) => item.available)
			.map((item) => item.index);
	}

	// Keyboard handler for agent dropdown
	function handleAgentKeydown(event: KeyboardEvent) {
		if (!showAgentDropdown) return;

		const availableIndexes = getAvailableAgentIndexes();
		if (availableIndexes.length === 0) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				// Find next available index after current
				const nextDown = availableIndexes.find((i) => i > highlightedAgentIndex);
				highlightedAgentIndex = nextDown !== undefined ? nextDown : availableIndexes[0];
				scrollHighlightedIntoView(agentDropdownRef, highlightedAgentIndex);
				break;
			case 'ArrowUp':
				event.preventDefault();
				// Find previous available index before current
				const nextUp = [...availableIndexes].reverse().find((i) => i < highlightedAgentIndex);
				highlightedAgentIndex =
					nextUp !== undefined ? nextUp : availableIndexes[availableIndexes.length - 1];
				scrollHighlightedIntoView(agentDropdownRef, highlightedAgentIndex);
				break;
			case 'Enter':
				event.preventDefault();
				if (highlightedAgentIndex >= 0 && highlightedAgentIndex < programs.length) {
					const program = programs[highlightedAgentIndex];
					if (getAgentStatus(program.id)?.available) {
						selectAgent(program);
					}
				}
				break;
			case 'Escape':
				event.preventDefault();
				showAgentDropdown = false;
				highlightedAgentIndex = -1;
				break;
		}
	}

	// Reset highlighted index when filtering
	$effect(() => {
		if (showModelDropdown && modelSearchQuery.trim()) {
			highlightedModelIndex = filteredModels.length > 0 ? 0 : -1;
		}
	});

	// Keyboard handler for model dropdown
	function handleModelKeydown(event: KeyboardEvent) {
		if (!showModelDropdown || !selectedAgent) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				highlightedModelIndex = Math.min(highlightedModelIndex + 1, filteredModels.length - 1);
				scrollHighlightedIntoView(modelDropdownRef, highlightedModelIndex);
				break;
			case 'ArrowUp':
				event.preventDefault();
				highlightedModelIndex = Math.max(highlightedModelIndex - 1, 0);
				scrollHighlightedIntoView(modelDropdownRef, highlightedModelIndex);
				break;
			case 'Enter':
				event.preventDefault();
				if (highlightedModelIndex >= 0 && highlightedModelIndex < filteredModels.length) {
					selectModel(filteredModels[highlightedModelIndex]);
				}
				break;
			case 'Escape':
				event.preventDefault();
				showModelDropdown = false;
				highlightedModelIndex = -1;
				modelSearchQuery = '';
				break;
		}
	}

	// Scroll highlighted item into view
	function scrollHighlightedIntoView(container: HTMLDivElement | null, index: number) {
		if (!container) return;
		const items = container.querySelectorAll('[data-dropdown-item]');
		const item = items[index] as HTMLElement;
		if (item) {
			item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}
	}

	// Check if agent has API key configured (for status indicator)
	function getApiKeyStatus(program: AgentProgram): 'configured' | 'missing' | 'not-required' {
		const status = getAgentStatus(program.id);
		if (program.authType === 'subscription' || program.authType === 'none') {
			return 'not-required';
		}
		// If authType is api_key, check availability
		if (program.authType === 'api_key') {
			return status?.available ? 'configured' : 'missing';
		}
		return status?.available ? 'configured' : 'missing';
	}
</script>

{#if compact}
	<!-- Compact inline mode - just dropdowns -->
	<div class="flex items-center gap-2">
		{#if loading}
			<span class="loading loading-spinner loading-xs"></span>
		{:else if error}
			<span class="text-error text-xs">{error}</span>
		{:else}
			<!-- Agent dropdown -->
			<select
				class="select select-xs select-bordered w-28"
				value={selectedAgentId ?? ''}
				onchange={handleAgentChange}
			>
				{#each programs as program}
					{@const status = getAgentStatus(program.id)}
					<option value={program.id} disabled={!status?.available}>
						{program.name}
						{#if !status?.available}(unavailable){/if}
					</option>
				{/each}
				<option value="human">Human</option>
			</select>

			<!-- Model dropdown -->
			<select
				class="select select-xs select-bordered w-24"
				value={selectedModel ?? ''}
				onchange={handleModelChange}
				disabled={!selectedAgent}
			>
				{#each availableModels as model}
					<option value={model.shortName}>
						{model.shortName}
					</option>
				{/each}
			</select>

			{#if isOverridden}
				<button
					class="btn btn-xs btn-ghost text-info"
					onclick={handleResetToAuto}
					title="Reset to auto-selected agent"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="w-3 h-3"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
						/>
					</svg>
				</button>
			{/if}
		{/if}
	</div>
{:else}
	<!-- Full dropdown panel mode -->
	<div class="card bg-base-200 shadow-lg p-4 min-w-72 flex flex-col overflow-y-auto" style="max-height: inherit;">
		<h3 class="font-semibold text-sm mb-3 flex items-center gap-2">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="w-4 h-4"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
				/>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
				/>
			</svg>
			Agent Selection
		</h3>

		{#if loading}
			<div class="flex items-center justify-center py-4">
				<span class="loading loading-spinner loading-sm"></span>
				<span class="ml-2 text-sm text-base-content/70">Loading agents...</span>
			</div>
		{:else if error}
			<div class="alert alert-error text-sm">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="stroke-current shrink-0 h-4 w-4"
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
				<span>{error}</span>
			</div>
		{:else}
			<!-- Auto-selected info -->
			{#if routingResult}
				<div
					class="mb-3 p-2 rounded-lg text-xs"
					style="background: oklch(0.45 0.12 240 / 0.15); border: 1px solid oklch(0.55 0.15 240 / 0.3);"
				>
					<div class="flex items-center gap-1.5 mb-1">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="w-3.5 h-3.5"
							style="color: oklch(0.75 0.15 240)"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
							/>
						</svg>
						<span class="font-medium" style="color: oklch(0.85 0.10 240)">Auto-selected:</span>
						<ProviderLogo agentId={routingResult.agentId} size={16} />
						<span style="color: oklch(0.90 0.05 240)">
							{routingResult.agentName} ({routingResult.modelName})
						</span>
					</div>
					<div class="text-base-content/60 pl-5 font-mono">
						{routingResult.matchedRule ? `Rule: ${routingResult.matchedRule.name}` : routingResult.reason}
					</div>
				</div>
			{/if}

			<!-- Agent selection - Custom dropdown -->
			<div class="form-control mb-3">
				<label class="label py-1">
					<span class="label-text text-xs font-medium">Agent Harness</span>
				</label>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="relative" onkeydown={handleAgentKeydown}>
					<button
						type="button"
						class="w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all duration-200 hover:border-primary/50"
						style="background: oklch(0.22 0.02 250); border-color: {isHumanSelected ? 'oklch(0.55 0.18 45 / 0.5)' : 'oklch(0.35 0.03 250)'};"
						onclick={toggleAgentDropdown}
					>
						{#if isHumanSelected}
							<div class="w-8 h-8 rounded-full flex items-center justify-center" style="background: oklch(0.35 0.12 45 / 0.3);">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5" style="color: oklch(0.80 0.15 45);">
									<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
								</svg>
							</div>
							<div class="flex-1 min-w-0 text-left">
								<div class="font-medium text-sm">Human</div>
								<div class="text-xs" style="color: oklch(0.70 0.15 45);">Manual task — no agent spawn</div>
							</div>
						{:else if selectedAgent}
							{@const agentStatus = getAgentStatus(selectedAgent.id)}
							<div class="w-8 h-8 rounded-full flex items-center justify-center" style="background: oklch(0.30 0.04 250);">
								<ProviderLogo agentId={selectedAgent.id} apiKeyProvider={selectedAgent.apiKeyProvider} size={20} />
							</div>
							<div class="flex-1 min-w-0 text-left">
								<div class="font-medium text-sm">{selectedAgent.name}</div>
								<div class="text-xs" style="color: {agentStatus?.available ? 'oklch(0.70 0.15 145)' : 'oklch(0.65 0.12 30)'};">
									{agentStatus?.available ? 'Ready' : agentStatus?.statusMessage ?? 'Unavailable'}
								</div>
							</div>
						{:else}
							<div class="flex-1 text-left text-sm" style="color: oklch(0.60 0.02 250);">Select agent...</div>
						{/if}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"
							class="w-4 h-4 transition-transform duration-200" class:rotate-180={showAgentDropdown} style="color: oklch(0.60 0.02 250);">
							<path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
						</svg>
					</button>

					{#if showAgentDropdown}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div class="fixed inset-0 z-40" onclick={() => { showAgentDropdown = false; highlightedAgentIndex = -1; }}></div>
						<div
							bind:this={agentDropdownRef}
							class="absolute z-50 mt-1 w-full rounded-lg border shadow-xl overflow-hidden animate-dropdown"
							style="background: oklch(0.20 0.02 250); border-color: oklch(0.35 0.03 250); transform-origin: top;">
							<div class="max-h-96 overflow-y-auto">
								{#each programs as program, index}
									{@const status = getAgentStatus(program.id)}
									{@const isSelected = selectedAgentId === program.id}
									{@const isHighlighted = highlightedAgentIndex === index}
									{@const apiKeyStatus = getApiKeyStatus(program)}
									<button
										type="button"
										data-dropdown-item
										class="w-full flex items-center gap-3 p-2.5 transition-colors duration-150"
										style="background: {isHighlighted ? 'oklch(0.30 0.05 250)' : isSelected ? 'oklch(0.55 0.15 240 / 0.1)' : 'transparent'};"
										class:opacity-50={!status?.available}
										disabled={!status?.available}
										onclick={() => selectAgent(program)}
										onmouseenter={() => { if (status?.available) highlightedAgentIndex = index; }}
									>
										<div class="w-8 h-8 rounded-full flex items-center justify-center relative" style="background: oklch(0.28 0.04 250);">
											<ProviderLogo agentId={program.id} apiKeyProvider={program.apiKeyProvider} size={20} />
											<!-- API Key status indicator -->
											{#if apiKeyStatus === 'configured'}
												<div class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full" style="background: oklch(0.70 0.18 145); border: 2px solid oklch(0.20 0.02 250);" title="API key configured"></div>
											{:else if apiKeyStatus === 'missing'}
												<div class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full" style="background: oklch(0.65 0.20 30); border: 2px solid oklch(0.20 0.02 250);" title="API key missing"></div>
											{/if}
										</div>
										<div class="flex-1 min-w-0 text-left">
											<div class="font-medium text-sm flex items-center gap-1.5">
												{program.name}
												{#if apiKeyStatus === 'missing'}
													<span class="text-xs px-1.5 py-0.5 rounded" style="background: oklch(0.65 0.20 30 / 0.15); color: oklch(0.75 0.15 30);">No API Key</span>
												{/if}
											</div>
											<div class="text-xs" style="color: {status?.available ? 'oklch(0.65 0.10 145)' : 'oklch(0.60 0.10 30)'};">
												{status?.available ? 'Ready' : status?.statusMessage ?? 'Unavailable'}
											</div>
										</div>
										{#if isSelected}
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"
												class="w-4 h-4" style="color: oklch(0.75 0.15 145);">
												<path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
											</svg>
										{/if}
									</button>
								{/each}
							</div>
							<!-- Human option divider + entry -->
							<div style="border-top: 1px solid oklch(0.30 0.03 250);">
								<button
									type="button"
									data-dropdown-item
									class="w-full flex items-center gap-3 p-2.5 transition-colors duration-150"
									style="background: {isHumanSelected ? 'oklch(0.55 0.18 45 / 0.1)' : 'transparent'};"
									onclick={() => { selectedAgentId = 'human'; selectedModel = null; useAutoSelection = false; showAgentDropdown = false; }}
									onmouseenter={() => { highlightedAgentIndex = -1; }}
								>
									<div class="w-8 h-8 rounded-full flex items-center justify-center" style="background: oklch(0.35 0.12 45 / 0.3);">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5" style="color: oklch(0.80 0.15 45);">
											<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
										</svg>
									</div>
									<div class="flex-1 min-w-0 text-left">
										<div class="font-medium text-sm">Human</div>
										<div class="text-xs" style="color: oklch(0.70 0.15 45);">Manual task — no agent spawn</div>
									</div>
									{#if isHumanSelected}
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"
											class="w-4 h-4" style="color: oklch(0.75 0.15 145);">
											<path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
										</svg>
									{/if}
								</button>
							</div>
							<!-- Settings link -->
							<a
								href="/config?tab=agents"
								class="flex items-center gap-2 p-2.5 text-xs transition-colors duration-150 hover:bg-base-300 border-t"
								style="border-color: oklch(0.30 0.03 250); color: oklch(0.65 0.10 240);"
							>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
									<path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
									<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
								</svg>
								Configure agents...
							</a>
						</div>
					{/if}
				</div>
			</div>

			<!-- Model selection - Custom dropdown (hidden for human) -->
			<div class="form-control mb-4" class:hidden={isHumanSelected}>
				<label class="label py-1">
					<span class="label-text text-xs font-medium">Model</span>
				</label>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="relative" onkeydown={handleModelKeydown}>
					<button
						type="button"
						class="w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all duration-200"
						class:opacity-50={!selectedAgent}
						style="background: {selectedAgent ? 'oklch(0.22 0.02 250)' : 'oklch(0.18 0.01 250)'}; border-color: oklch(0.35 0.03 250);"
						disabled={!selectedAgent}
						onclick={toggleModelDropdown}
					>
						{#if selectedModel && selectedAgent}
							{@const currentModel = availableModels.find(m => m.shortName === selectedModel)}
							<div class="w-8 h-8 rounded-full flex items-center justify-center" style="background: oklch(0.30 0.04 250);">
								<span class="text-xs font-bold" style="color: oklch(0.80 0.10 250);">
									{selectedModel?.slice(0, 2).toUpperCase()}
								</span>
							</div>
							<div class="flex-1 min-w-0 text-left">
								<div class="font-medium text-sm">{currentModel?.name ?? selectedModel}</div>
								<div class="text-xs" style="color: oklch(0.60 0.02 250);">
									{currentModel ? getModelMeta(currentModel) : 'Custom model'}
								</div>
							</div>
						{:else}
							<div class="flex-1 text-left text-sm" style="color: oklch(0.60 0.02 250);">
								{selectedAgent ? 'Select model...' : 'Select agent first'}
							</div>
						{/if}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"
							class="w-4 h-4 transition-transform duration-200" class:rotate-180={showModelDropdown} style="color: oklch(0.60 0.02 250);">
							<path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
						</svg>
					</button>

					{#if showModelDropdown && selectedAgent}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div class="fixed inset-0 z-40" onclick={() => { showModelDropdown = false; highlightedModelIndex = -1; modelSearchQuery = ''; }}></div>
						<div
							bind:this={modelDropdownRef}
							class="absolute z-50 mt-1 w-full rounded-lg border shadow-xl overflow-hidden animate-dropdown"
							style="background: oklch(0.20 0.02 250); border-color: oklch(0.35 0.03 250); transform-origin: top;">
							<!-- Search -->
							<div class="px-2.5 py-1.5 cmd-dropdown-search-border">
								<div class="relative flex items-center gap-1.5">
									<svg class="w-3 h-3 flex-shrink-0" style="color: oklch(0.45 0.02 250);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
									</svg>
									<input
										bind:this={modelSearchInput}
										bind:value={modelSearchQuery}
										onkeydown={(e) => {
											if (e.key === 'Escape') {
												e.stopPropagation();
												showModelDropdown = false;
												modelSearchQuery = '';
											}
										}}
										type="text"
										placeholder="Filter models..."
										class="w-full bg-transparent text-[10px] font-mono focus:outline-none"
										style="color: oklch(0.75 0.02 250);"
										autocomplete="off"
									/>
									{#if modelSearchQuery}
										<button type="button" onclick={() => { modelSearchQuery = ''; modelSearchInput?.focus(); }} style="color: oklch(0.40 0.02 250);" class="hover:opacity-80 transition-opacity">
											<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
										</button>
									{/if}
								</div>
							</div>
							<div class="max-h-96 overflow-y-auto">
								{#if modelsLoading}
									<div class="p-3 text-xs" style="color: oklch(0.65 0.10 240);">Loading models...</div>
								{:else if modelsError}
									<div class="p-3 text-xs text-error">{modelsError}</div>
								{:else if filteredModels.length === 0}
									<div class="p-3 text-xs" style="color: oklch(0.65 0.10 240);">No models match your search.</div>
								{:else}
									{#each filteredModels as model, index}
										{@const isSelected = selectedModel === model.shortName}
										{@const isHighlighted = highlightedModelIndex === index}
										<button
											type="button"
											data-dropdown-item
											class="w-full flex items-center gap-3 p-2.5 transition-colors duration-150"
											style="background: {isHighlighted ? 'oklch(0.30 0.05 250)' : isSelected ? 'oklch(0.55 0.15 240 / 0.1)' : 'transparent'};"
											onclick={() => selectModel(model)}
											onmouseenter={() => { highlightedModelIndex = index; }}
										>
											<div class="w-8 h-8 rounded-full flex items-center justify-center" style="background: oklch(0.28 0.04 250);">
												<span class="text-xs font-bold" style="color: oklch(0.80 0.10 250);">
													{model.shortName?.slice(0, 2).toUpperCase()}
												</span>
											</div>
											<div class="flex-1 min-w-0 text-left">
												<div class="font-medium text-sm">{model.name}</div>
												<div class="text-xs" style="color: oklch(0.60 0.02 250);">
													{getModelMeta(model)}
												</div>
											</div>
											{#if isSelected}
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"
													class="w-4 h-4" style="color: oklch(0.75 0.15 145);">
													<path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
												</svg>
											{/if}
										</button>
									{/each}
								{/if}
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Override indicator -->
			{#if isOverridden}
				<div class="mb-3 flex items-center gap-2 text-xs">
					<span
						class="badge badge-sm"
						style="background: oklch(0.50 0.15 45 / 0.2); color: oklch(0.85 0.12 45); border-color: oklch(0.60 0.15 45 / 0.4);"
					>
						Override active
					</span>
					<button class="btn btn-xs btn-ghost text-info" onclick={handleResetToAuto}>
						Reset to auto
					</button>
				</div>
			{/if}

			<!-- Actions -->
			<div class="flex justify-end gap-2">
				<button class="btn btn-sm btn-ghost" onclick={handleCancel}> Cancel </button>
				{#if isHumanSelected}
					<!-- Human: single "Assign to Human" button, no launch -->
					<button class="btn btn-sm" style="background: oklch(0.45 0.12 45); color: oklch(0.95 0.02 45); border: none;" onclick={handleConfirm}>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
						</svg>
						Assign to Human
					</button>
				{:else}
					{#if onsave}
						<button class="btn btn-sm btn-outline btn-primary" onclick={handleSave}>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
							</svg>
							Save
						</button>
					{/if}
					<button class="btn btn-sm btn-primary" onclick={handleConfirm}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="w-4 h-4"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
							/>
						</svg>
						{onsave ? 'Save & Launch' : 'Launch'}
					</button>
				{/if}
			</div>
		{/if}
	</div>
{/if}
