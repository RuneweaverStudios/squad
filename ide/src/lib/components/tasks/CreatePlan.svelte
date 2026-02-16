<script lang="ts">
	/**
	 * CreatePlan — Planning session tab for the creation workspace
	 *
	 * Left side: project/model selectors, planning description, action buttons
	 * Right side: SessionCard with live agent terminal for interactive planning
	 */
	import { onMount, onDestroy } from 'svelte';
	import SessionCard from '$lib/components/work/SessionCard.svelte';
	import {
		fetch as fetchSessions,
		addSession,
		sendInput,
		kill,
		workSessionsState,
		subscribeToOutputUpdates,
		unsubscribeFromOutputUpdates
	} from '$lib/stores/workSessions.svelte';
	import { successToast, errorToast } from '$lib/stores/toasts.svelte';
	import { playSuccessChime, playErrorSound } from '$lib/utils/soundEffects';
	import { revokeAttachmentPreviews } from '$lib/utils/attachmentUpload';
	import type { PendingAttachment } from '$lib/types/attachment';
	import AgentAvatar from '$lib/components/AgentAvatar.svelte';
	import ProjectSelector from './ProjectSelector.svelte';
	import AttachmentZone from './AttachmentZone.svelte';
	import { AGENT_PRESETS } from '$lib/types/agentProgram';
	import ProviderLogo from '$lib/components/agents/ProviderLogo.svelte';

	interface Props {
		projects: string[];
		initialProject?: string;
		hideProjectSelector?: boolean;
		stacked?: boolean;
		onTasksCreated?: () => void;
	}

	let {
		projects = [],
		initialProject = '',
		hideProjectSelector = false,
		stacked = false,
		onTasksCreated = () => {},
	}: Props = $props();

	// State
	let selectedProject = $state(initialProject || projects[0] || '');
	let selectedHarness = $state<string>('claude-code');
	let selectedModel = $state<string>('opus');
	let harnessDropdownOpen = $state(false);
	let description = $state('');

	// Derive available models from selected harness
	const availableModels = $derived(() => {
		const preset = AGENT_PRESETS.find(p => p.id === selectedHarness);
		return preset?.config.models || [];
	});

	// Update selected model when harness changes — pick the highest-cost-tier model (most powerful)
	$effect(() => {
		const preset = AGENT_PRESETS.find(p => p.id === selectedHarness);
		if (preset) {
			// For planning, default to the most powerful (highest cost tier) model
			const highModel = preset.config.models?.find(m => m.costTier === 'high');
			selectedModel = highModel?.shortName || preset.config.defaultModel || '';
		} else {
			selectedModel = '';
		}
	});
	let isSpawning = $state(false);
	let activeSessionName = $state<string | null>(null);
	let activeAgentName = $state<string | null>(null);
	let contextSent = $state(false);
	let controlsCollapsed = $state(false);
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let attachments = $state<PendingAttachment[]>([]);

	// Auto-collapse controls when context is sent so terminal gets the space
	$effect(() => {
		if (contextSent && activeSessionName) {
			controlsCollapsed = true;
		}
	});

	$effect(() => {
		if (initialProject) {
			selectedProject = initialProject;
		} else if (!selectedProject && projects.length > 0) {
			selectedProject = projects[0];
		}
	});

	// Get session from store reactively
	let session = $derived.by(() => {
		if (!activeSessionName) return null;
		return workSessionsState.sessions.find(
			(s) => s.sessionName === activeSessionName
		) ?? null;
	});

	onMount(() => {
		// Restore session from sessionStorage (persists across tab switches)
		const stored = sessionStorage.getItem('jat-plan-session');
		if (stored) {
			try {
				const { sessionName, agentName, wasSent } = JSON.parse(stored);
				activeSessionName = sessionName;
				activeAgentName = agentName;
				if (wasSent) {
					contextSent = true;
					// $effect will auto-collapse
				}
			} catch {
				sessionStorage.removeItem('jat-plan-session');
			}
		}

		// Start polling + WebSocket output streaming
		fetchSessions();
		subscribeToOutputUpdates();
		pollTimer = setInterval(() => fetchSessions(), 3000);
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
		unsubscribeFromOutputUpdates();
		revokeAttachmentPreviews(attachments);
	});

	async function handleStartPlanning() {
		if (isSpawning) return;

		isSpawning = true;
		try {
			const response = await fetch('/api/work/spawn', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project: selectedProject,
					agentId: selectedHarness !== 'claude-code' ? selectedHarness : undefined,
					model: selectedModel,
					mode: 'plan',
				}),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || data.error || 'Failed to start planning session');
			}

			if (data.success && data.session) {
				activeSessionName = data.session.sessionName;
				activeAgentName = data.session.agentName;
				contextSent = false;

				// Add to store for WebSocket output tracking
				addSession({
					...data.session,
					task: null,
					lastCompletedTask: null,
				});

				// Persist across tab switches
				sessionStorage.setItem('jat-plan-session', JSON.stringify({
					sessionName: data.session.sessionName,
					agentName: data.session.agentName,
				}));

				playSuccessChime();
				successToast('Planning session started', `Agent: ${data.session.agentName}`);

				// If user wrote a description, send it after agent initializes
				if (description.trim()) {
					setTimeout(() => sendPlanningContext(), 4000);
				}
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to start planning session';
			playErrorSound();
			errorToast(msg);
		} finally {
			isSpawning = false;
		}
	}

	async function sendPlanningContext() {
		if (!activeSessionName || !description.trim() || contextSent) return;

		const text = `I want to plan the following for the ${selectedProject} project:\n\n${description.trim()}\n\nHelp me think through requirements, architecture, and break this down into actionable tasks.`;

		const sent = await sendInput(activeSessionName, text, 'text');
		if (sent) {
			contextSent = true;
			// Persist contextSent so collapsed state survives tab switches
			const stored = sessionStorage.getItem('jat-plan-session');
			if (stored) {
				try {
					const data = JSON.parse(stored);
					data.wasSent = true;
					sessionStorage.setItem('jat-plan-session', JSON.stringify(data));
				} catch { /* ignore */ }
			}
		}
	}

	async function handleConvertToTasks() {
		if (!activeSessionName) return;
		await sendInput(activeSessionName, 'Please convert our plan into a structured task tree. Create the tasks in JAT using jt create with proper types, priorities, labels, descriptions, and dependency ordering.', 'text');
	}

	async function handleEndSession() {
		if (!activeSessionName) return;

		const killed = await kill(activeSessionName);
		if (killed) {
			activeSessionName = null;
			activeAgentName = null;
			contextSent = false;
			controlsCollapsed = false;
			sessionStorage.removeItem('jat-plan-session');
			successToast('Planning session ended');
		}
	}

	async function handleSendInput(input: string, type: 'text' | 'key' | 'raw'): Promise<boolean | void> {
		if (!activeSessionName) return false;

		if (type === 'text') {
			return sendInput(activeSessionName, input, 'text');
		} else if (type === 'raw') {
			return sendInput(activeSessionName, input, 'raw');
		} else {
			// type === 'key' — pass the key name as the type
			return sendInput(activeSessionName, input, input as Parameters<typeof sendInput>[2]);
		}
	}
</script>

<div class="plan-container" class:plan-stacked={stacked} class:plan-collapsed={controlsCollapsed}>
	<!-- Left: Controls (full or collapsed) -->
	{#if controlsCollapsed}
		<!-- Collapsed: compact action bar -->
		<div class="plan-controls-bar">
			<div class="flex items-center gap-2 flex-1 min-w-0">
				{#if activeAgentName}
					<AgentAvatar name={activeAgentName} size={20} showRing />
					<span class="text-xs font-mono opacity-60 truncate">{activeAgentName}</span>
				{/if}
				<span class="text-xs opacity-40">|</span>
				<ProviderLogo agentId={selectedHarness} size={14} />
				<span class="text-xs opacity-50 capitalize">{selectedModel}</span>
			</div>

			<div class="flex items-center gap-1.5">
				{#if activeSessionName}
					{#if description.trim() && !contextSent}
						<button
							class="btn btn-xs btn-secondary"
							onclick={sendPlanningContext}
						>
							Send Context
						</button>
					{/if}
					<button
						class="btn btn-xs btn-accent"
						onclick={handleConvertToTasks}
					>
						Convert to Tasks
					</button>
					<button
						class="btn btn-xs btn-ghost text-error"
						onclick={handleEndSession}
					>
						End
					</button>
				{/if}

				<!-- Expand toggle -->
				<button
					class="btn btn-xs btn-ghost px-1"
					onclick={() => controlsCollapsed = false}
					title="Show planning controls"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5 opacity-50">
						<path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
					</svg>
				</button>
			</div>
		</div>
	{:else}
		<!-- Expanded: full controls -->
		<div class="plan-input">
			{#if activeSessionName}
				<!-- Collapse toggle when session is active -->
				<div class="flex justify-end mb-1">
					<button
						class="btn btn-xs btn-ghost px-1 opacity-40 hover:opacity-80"
						onclick={() => controlsCollapsed = true}
						title="Collapse controls to give terminal more space"
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5">
							<path fill-rule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clip-rule="evenodd" />
						</svg>
					</button>
				</div>
			{/if}

			<!-- Project selector -->
			{#if !hideProjectSelector}
			<div class="mb-3">
				<label class="label py-1">
					<span class="label-text text-sm font-medium">Project</span>
				</label>
				<ProjectSelector
					projects={projects}
					selected={selectedProject}
					onSelect={(p) => selectedProject = p}
					disabled={!!activeSessionName}
				/>
			</div>
			{/if}

			<!-- Agent / Model -->
			<div class="form-control mb-3">
				<label class="label py-1">
					<span class="label-text text-sm font-medium">Agent / Model</span>
				</label>
				<div class="dropdown dropdown-end w-full" class:dropdown-open={harnessDropdownOpen}>
					<button type="button"
						class="btn btn-sm w-full justify-between gap-2 font-mono text-xs"
						style="background: oklch(0.22 0.02 250); border-color: oklch(0.35 0.03 250); color: oklch(0.75 0.02 250);"
						disabled={!!activeSessionName}
						onclick={() => harnessDropdownOpen = !harnessDropdownOpen}
					>
						<span class="flex items-center gap-2">
							<ProviderLogo agentId={selectedHarness} size={16} />
							<span>{AGENT_PRESETS.find(p => p.id === selectedHarness)?.config.name || selectedHarness}{#if selectedModel && selectedHarness !== 'human'}<span class="opacity-50">/{selectedModel}</span>{/if}</span>
						</span>
						<svg class="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
						</svg>
					</button>
					{#if harnessDropdownOpen}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="dropdown-content bg-base-200 rounded-box z-50 w-full p-2 shadow-lg border border-base-content/10 mt-1" onclick={(e) => e.stopPropagation()}>
							<!-- Agent programs -->
							<ul class="menu p-0">
								{#each AGENT_PRESETS.filter(p => p.id !== 'human') as preset}
									<li>
										<button class="flex items-center gap-2 {selectedHarness === preset.id ? 'active' : ''}"
											onclick={() => { selectedHarness = preset.id; }}
										>
											<ProviderLogo agentId={preset.id} size={16} />
											<span>{preset.config.name}</span>
											{#if selectedHarness === preset.id}
												<svg class="w-4 h-4 ml-auto text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
												</svg>
											{/if}
										</button>
									</li>
								{/each}
							</ul>
							<!-- Model selector -->
							{#if availableModels().length > 0}
								<div class="divider my-1 text-xs text-base-content/40">MODEL</div>
								<ul class="menu p-0">
									{#each availableModels() as model}
										<li>
											<button class="flex items-center gap-2 text-xs {selectedModel === model.shortName ? 'active' : ''}"
												onclick={() => { selectedModel = model.shortName; harnessDropdownOpen = false; }}
											>
												<span class="badge badge-xs {model.costTier === 'high' ? 'badge-warning' : model.costTier === 'medium' ? 'badge-info' : 'badge-ghost'}">{model.costTier?.[0]?.toUpperCase() || '?'}</span>
												<span>{model.name}</span>
												{#if selectedModel === model.shortName}
													<svg class="w-3.5 h-3.5 ml-auto text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
														<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
													</svg>
												{/if}
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}
				</div>
			</div>

			<!-- Planning description -->
			<div class="form-control">
				<label class="label py-1">
					<span class="label-text text-sm font-medium">What do you want to plan?</span>
				</label>
				<textarea
					class="textarea textarea-bordered w-full text-sm"
					rows={8}
					bind:value={description}
					disabled={contextSent}
					placeholder={`Describe the feature or system you want to plan. Be specific about requirements, target users, and technical constraints.\n\nExample: Build a notification system with email and in-app alerts. Users should configure preferences per event type. Support batching to avoid notification fatigue.`}
				onkeydown={(e) => {
					if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
						e.preventDefault();
						if (!activeSessionName && !isSpawning && description.trim()) {
							handleStartPlanning();
						} else if (activeSessionName && description.trim() && !contextSent) {
							sendPlanningContext();
						}
					}
				}}
				></textarea>
			</div>

			<!-- Attachments (context for planning) -->
			<div class="mt-3">
				<AttachmentZone disabled={!!activeSessionName} bind:attachments />
			</div>

			<!-- Action buttons -->
			<div class="flex flex-col gap-2 mt-4">
				{#if !activeSessionName}
					<button
						class="btn btn-sm btn-primary"
						onclick={handleStartPlanning}
						disabled={isSpawning || !description.trim()}
						title="Ctrl+Enter"
					>
						{#if isSpawning}
							<span class="loading loading-spinner loading-xs"></span>
							Starting...
						{:else}
							Start Planning <kbd class="kbd kbd-xs ml-1 opacity-50">Ctrl+Enter</kbd>
						{/if}
					</button>
				{:else}
					{#if description.trim() && !contextSent}
						<button
							class="btn btn-sm btn-secondary"
							onclick={sendPlanningContext}
							title="Ctrl+Enter"
						>
							Send Context to Agent <kbd class="kbd kbd-xs ml-1 opacity-50">Ctrl+Enter</kbd>
						</button>
					{/if}

					<button
						class="btn btn-sm btn-accent"
						onclick={handleConvertToTasks}
					>
						Convert to Tasks
					</button>

					<button
						class="btn btn-sm btn-ghost text-error"
						onclick={handleEndSession}
					>
						End Session
					</button>
				{/if}
			</div>

			<!-- Session info -->
			{#if activeSessionName && activeAgentName}
				<div class="defaults-section">
					<h4 class="text-xs font-medium opacity-50 mb-2">Session</h4>
					<div class="text-xs opacity-70">
						<div>Agent: <span class="font-mono">{activeAgentName}</span></div>
						<div>Session: <span class="font-mono text-[0.6875rem]">{activeSessionName}</span></div>
						{#if contextSent}
							<div class="text-success mt-1">Context sent</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Right/Bottom: Terminal -->
	<div class="plan-terminal">
		{#if session}
			<SessionCard
				mode="agent"
				sessionName={session.sessionName}
				agentName={session.agentName || activeAgentName || ''}
				task={null}
				output={session.output}
				lineCount={session.lineCount}
				sseState={session._sseState}
				headerless
				onSendInput={handleSendInput}
				onKillSession={handleEndSession}
			/>
		{:else if activeSessionName}
			<div class="flex flex-col items-center justify-center py-12 gap-3">
				<span class="loading loading-spinner loading-md"></span>
				<span class="text-sm opacity-50">Connecting to planning session...</span>
			</div>
		{:else}
			<div class="empty-state">
				<div class="text-sm opacity-40 text-center">
					<p class="mb-2">Select a project and describe what you want to plan.</p>
					<p>Click "Start Planning" to begin a conversation with an AI agent.</p>
					<p class="mt-4 text-xs opacity-60">
						When your plan is ready, click "Convert to Tasks" to generate a task tree.
					</p>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.plan-container {
		display: grid;
		grid-template-columns: 1fr 1.5fr;
		gap: 1.5rem;
		height: 100%;
	}

	/* Collapsed side-by-side: narrow left column */
	.plan-container.plan-collapsed:not(.plan-stacked) {
		grid-template-columns: auto 1fr;
		gap: 0.75rem;
	}

	/* Collapsed stacked: flex column, terminal gets all remaining space */
	.plan-container.plan-stacked {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.plan-container.plan-stacked .plan-terminal {
		flex: 1;
		min-height: 0;
	}

	.plan-container.plan-stacked:not(.plan-collapsed) {
		gap: 1rem;
	}

	.plan-input {
		display: flex;
		flex-direction: column;
	}

	/* Collapsed controls bar */
	.plan-controls-bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.375rem 0.75rem;
		border-radius: 0.375rem;
		background: oklch(0.18 0.01 250 / 0.4);
		border: 1px solid oklch(0.28 0.02 250 / 0.25);
		flex-shrink: 0;
	}

	/* In stacked collapsed mode, add margin below bar */
	.plan-stacked.plan-collapsed .plan-controls-bar {
		margin-bottom: 0.5rem;
	}

	/* In side-by-side collapsed mode, bar is vertical */
	.plan-container.plan-collapsed:not(.plan-stacked) .plan-controls-bar {
		flex-direction: column;
		align-items: stretch;
		padding: 0.5rem;
		height: 100%;
		min-width: 9rem;
	}

	.plan-container.plan-collapsed:not(.plan-stacked) .plan-controls-bar .flex-1 {
		flex: 0;
	}

	.plan-container.plan-collapsed:not(.plan-stacked) .plan-controls-bar > .flex:last-child {
		flex-direction: column;
		gap: 0.375rem;
	}

	.plan-terminal {
		overflow: hidden;
		border-radius: 0.5rem;
		background: oklch(0.18 0.01 250 / 0.5);
		border: 1px solid oklch(0.28 0.02 250 / 0.3);
		display: flex;
		flex-direction: column;
	}

	.defaults-section {
		margin-top: 1rem;
		padding: 0.75rem;
		border-radius: 0.5rem;
		background: oklch(0.18 0.01 250 / 0.3);
		border: 1px solid oklch(0.28 0.02 250 / 0.2);
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		padding: 2rem;
	}

	@media (max-width: 768px) {
		.plan-container {
			display: flex;
			flex-direction: column;
		}

		.plan-container .plan-terminal {
			flex: 1;
			min-height: 0;
		}
	}
</style>
