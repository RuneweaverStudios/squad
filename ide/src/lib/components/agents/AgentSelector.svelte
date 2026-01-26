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

	import { onMount } from 'svelte';
	import type { AgentProgram, AgentModel, AgentStatus } from '$lib/types/agentProgram';
	import ProviderLogo from './ProviderLogo.svelte';

	interface Task {
		id: string;
		issue_type?: string;
		labels?: string[];
		priority?: number;
		title?: string;
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
		/** Called when user confirms selection */
		onselect?: (selection: { agentId: string | null; model: string | null }) => void;
		/** Called when user cancels/closes */
		oncancel?: () => void;
		/** Show compact inline mode vs full dropdown */
		compact?: boolean;
	}

	let {
		task,
		onselect = () => {},
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

	// Derived: currently selected agent object
	const selectedAgent = $derived(
		selectedAgentId ? programs.find((p) => p.id === selectedAgentId) : null
	);

	// Derived: available models for selected agent
	const availableModels = $derived(selectedAgent?.models ?? []);

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

				// Initialize selection with auto-selected values
				const result = routingResult;
				if (result) {
					selectedAgentId = result.agentId;
					// Find the model shortName from the model name
					const agent = programs.find((p) => p.id === result.agentId);
					const model = agent?.models.find((m) => m.name === result.modelName);
					selectedModel = model?.shortName ?? null;
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

		// Reset model to agent's default
		const agent = programs.find((p) => p.id === selectedAgentId);
		selectedModel = agent?.defaultModel ?? null;
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
		}
	}

	function handleConfirm() {
		// If using auto selection, pass null to let spawn API use routing
		if (useAutoSelection) {
			onselect({ agentId: null, model: null });
		} else {
			onselect({ agentId: selectedAgentId, model: selectedModel });
		}
	}

	function handleCancel() {
		oncancel();
	}

	// Get display name for model
	function getModelDisplayName(model: AgentModel): string {
		return `${model.name}${model.costTier ? ` (${model.costTier})` : ''}`;
	}

	// Select agent from dropdown
	function selectAgent(program: AgentProgram) {
		selectedAgentId = program.id;
		useAutoSelection = false;
		selectedModel = program.defaultModel ?? null;
		showAgentDropdown = false;
	}

	// Select model from dropdown
	function selectModel(model: AgentModel) {
		selectedModel = model.shortName;
		useAutoSelection = false;
		showModelDropdown = false;
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
	<div class="card bg-base-200 shadow-lg p-4 min-w-72">
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
					<span class="label-text text-xs font-medium">Agent Program</span>
				</label>
				<div class="relative">
					<button
						type="button"
						class="w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all duration-200 hover:border-primary/50"
						style="background: oklch(0.22 0.02 250); border-color: oklch(0.35 0.03 250);"
						onclick={() => (showAgentDropdown = !showAgentDropdown)}
					>
						{#if selectedAgent}
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
						<div class="fixed inset-0 z-40" onclick={() => (showAgentDropdown = false)}></div>
						<div class="absolute z-50 mt-1 w-full rounded-lg border shadow-xl overflow-hidden"
							style="background: oklch(0.20 0.02 250); border-color: oklch(0.35 0.03 250);">
							{#each programs as program}
								{@const status = getAgentStatus(program.id)}
								{@const isSelected = selectedAgentId === program.id}
								<button
									type="button"
									class="w-full flex items-center gap-3 p-2.5 transition-colors duration-150 hover:bg-base-300"
									style={isSelected ? 'background: oklch(0.55 0.15 240 / 0.1);' : ''}
									class:opacity-50={!status?.available}
									disabled={!status?.available}
									onclick={() => selectAgent(program)}
								>
									<div class="w-8 h-8 rounded-full flex items-center justify-center" style="background: oklch(0.28 0.04 250);">
										<ProviderLogo agentId={program.id} apiKeyProvider={program.apiKeyProvider} size={20} />
									</div>
									<div class="flex-1 min-w-0 text-left">
										<div class="font-medium text-sm">{program.name}</div>
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
					{/if}
				</div>
			</div>

			<!-- Model selection - Custom dropdown -->
			<div class="form-control mb-4">
				<label class="label py-1">
					<span class="label-text text-xs font-medium">Model</span>
				</label>
				<div class="relative">
					<button
						type="button"
						class="w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all duration-200"
						class:opacity-50={!selectedAgent}
						style="background: {selectedAgent ? 'oklch(0.22 0.02 250)' : 'oklch(0.18 0.01 250)'}; border-color: oklch(0.35 0.03 250);"
						disabled={!selectedAgent}
						onclick={() => selectedAgent && (showModelDropdown = !showModelDropdown)}
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
									{currentModel?.costTier ? `Cost: ${currentModel.costTier}` : 'Model'}
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
						<div class="fixed inset-0 z-40" onclick={() => (showModelDropdown = false)}></div>
						<div class="absolute z-50 mt-1 w-full rounded-lg border shadow-xl overflow-hidden"
							style="background: oklch(0.20 0.02 250); border-color: oklch(0.35 0.03 250);">
							{#each availableModels as model}
								{@const isSelected = selectedModel === model.shortName}
								<button
									type="button"
									class="w-full flex items-center gap-3 p-2.5 transition-colors duration-150 hover:bg-base-300"
									style={isSelected ? 'background: oklch(0.55 0.15 240 / 0.1);' : ''}
									onclick={() => selectModel(model)}
								>
									<div class="w-8 h-8 rounded-full flex items-center justify-center" style="background: oklch(0.28 0.04 250);">
										<span class="text-xs font-bold" style="color: oklch(0.80 0.10 250);">
											{model.shortName?.slice(0, 2).toUpperCase()}
										</span>
									</div>
									<div class="flex-1 min-w-0 text-left">
										<div class="font-medium text-sm">{model.name}</div>
										<div class="text-xs" style="color: oklch(0.60 0.02 250);">
											{model.costTier ? `Cost tier: ${model.costTier}` : 'Standard'}
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
					Launch
				</button>
			</div>
		{/if}
	</div>
{/if}
