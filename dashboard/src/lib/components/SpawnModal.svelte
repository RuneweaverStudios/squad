<script lang="ts">
	/**
	 * SpawnModal Component
	 * Simple modal for spawning agents to attack the backlog
	 *
	 * Flow:
	 * - Shows count of ready tasks
	 * - Slider to pick how many agents (1 to min(tasks, MAX_SESSIONS))
	 * - Spawns agents with auto-generated names, each picks a task
	 *
	 * Keyboard shortcut: Ctrl+Shift+S to open
	 */

	import { onMount } from 'svelte';
	import { isSpawnModalOpen } from '$lib/stores/drawerStore';
	import {
		DEFAULT_MODEL,
		MAX_TMUX_SESSIONS,
		DEFAULT_AGENT_COUNT,
		MIN_AGENT_COUNT,
		SPAWN_STAGGER_MS
	} from '$lib/config/spawnConfig';

	// Keyboard shortcut: Ctrl+Shift+S to open modal
	function handleKeydown(e: KeyboardEvent) {
		if (e.ctrlKey && e.shiftKey && e.key === 'S') {
			e.preventDefault();
			isSpawnModalOpen.set(true);
		}
	}

	// Modal open state from store
	let isOpen = $state(false);

	// Subscribe to store
	$effect(() => {
		const unsubscribe = isSpawnModalOpen.subscribe(value => {
			isOpen = value;
			if (value) {
				// Refresh ready tasks when modal opens
				loadReadyTasks();
			}
		});
		return unsubscribe;
	});

	// State
	let readyTasks = $state<Array<{ id: string; title: string; priority: number }>>([]);
	let agentCount = $state(DEFAULT_AGENT_COUNT);
	let isSubmitting = $state(false);
	let submitError = $state<string | null>(null);
	let successMessage = $state<string | null>(null);
	let spawnProgress = $state(0);

	// Derived values
	const maxAgents = $derived(Math.min(readyTasks.length, MAX_TMUX_SESSIONS));
	const canSpawn = $derived(readyTasks.length > 0 && agentCount >= MIN_AGENT_COUNT);

	// Load ready tasks
	async function loadReadyTasks() {
		try {
			const response = await fetch('/api/tasks?status=open&ready=true');
			if (response.ok) {
				const data = await response.json();
				readyTasks = (data.tasks || []).slice(0, 100); // Cap at 100 for display
				// Set default agent count
				agentCount = Math.min(readyTasks.length, DEFAULT_AGENT_COUNT);
			}
		} catch (error) {
			console.error('Failed to load ready tasks:', error);
			readyTasks = [];
		}
	}

	// Load on mount
	onMount(() => {
		loadReadyTasks();
	});

	// Handle spawn
	async function handleSpawn() {
		if (!canSpawn) return;

		isSubmitting = true;
		submitError = null;
		successMessage = null;
		spawnProgress = 0;

		try {
			const tasksToAssign = readyTasks.slice(0, agentCount);
			let successful = 0;
			let failed = 0;

			for (let i = 0; i < tasksToAssign.length; i++) {
				const task = tasksToAssign[i];
				spawnProgress = i + 1;

				try {
					const response = await fetch('/api/sessions', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							model: DEFAULT_MODEL,
							task: task.id
						})
					});

					if (response.ok) {
						successful++;
					} else {
						failed++;
					}
				} catch {
					failed++;
				}

				// Stagger spawns
				if (i < tasksToAssign.length - 1) {
					await new Promise(resolve => setTimeout(resolve, SPAWN_STAGGER_MS));
				}
			}

			if (failed > 0) {
				successMessage = `Spawned ${successful}/${agentCount} agents (${failed} failed)`;
			} else {
				successMessage = `${successful} agents attacking the backlog!`;
			}

			// Close after delay
			setTimeout(() => {
				handleClose();
			}, 1500);

		} catch (error: any) {
			console.error('Spawn error:', error);
			submitError = error.message || 'Failed to spawn agents';
		} finally {
			isSubmitting = false;
			spawnProgress = 0;
		}
	}

	// Close modal
	function handleClose() {
		if (!isSubmitting) {
			isSpawnModalOpen.set(false);
			submitError = null;
			successMessage = null;
			spawnProgress = 0;
		}
	}
</script>

<!-- Keyboard shortcut listener -->
<svelte:window onkeydown={handleKeydown} />

<!-- Modal -->
{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal modal-open" onclick={(e) => e.target === e.currentTarget && handleClose()}>
		<div
			class="modal-box max-w-md"
			style="
				background: linear-gradient(180deg, oklch(0.18 0.01 250) 0%, oklch(0.16 0.01 250) 100%);
				border: 1px solid oklch(0.35 0.02 250);
			"
		>
			<!-- Header -->
			<div class="flex items-center justify-between mb-6">
				<div>
					<h3
						class="text-lg font-bold font-mono uppercase tracking-wider"
						style="color: oklch(0.85 0.02 250);"
					>
						Swarm
					</h3>
					<p class="text-sm mt-1" style="color: oklch(0.55 0.02 250);">
						Spawn one agent per ready task
					</p>
				</div>
				<button
					class="btn btn-sm btn-circle btn-ghost"
					onclick={handleClose}
					disabled={isSubmitting}
					aria-label="Close modal"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Task count display -->
			<div
				class="rounded-lg p-4 mb-6 text-center"
				style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.30 0.02 250);"
			>
				<div class="text-4xl font-bold font-mono" style="color: oklch(0.70 0.18 150);">
					{readyTasks.length}
				</div>
				<div class="text-sm font-mono uppercase tracking-wider mt-1" style="color: oklch(0.55 0.02 250);">
					Ready Tasks
				</div>
			</div>

			{#if readyTasks.length === 0}
				<!-- No tasks -->
				<div class="text-center py-4" style="color: oklch(0.55 0.02 250);">
					<p>No ready tasks in the backlog.</p>
					<p class="text-sm mt-2">Create some tasks first!</p>
				</div>
			{:else}
				<!-- Agent count slider -->
				<div class="mb-6">
					<div class="flex justify-between items-center mb-2">
						<label
							class="text-xs font-semibold font-mono uppercase tracking-wider"
							style="color: oklch(0.55 0.02 250);"
						>
							Agents to Spawn
						</label>
						<span
							class="text-lg font-bold font-mono"
							style="color: oklch(0.85 0.02 250);"
						>
							{agentCount}
						</span>
					</div>
					<input
						type="range"
						min={MIN_AGENT_COUNT}
						max={maxAgents}
						bind:value={agentCount}
						class="range range-primary w-full"
						disabled={isSubmitting}
					/>
					<div class="flex justify-between text-xs mt-1" style="color: oklch(0.45 0.02 250);">
						<span>{MIN_AGENT_COUNT}</span>
						<span>max {maxAgents}</span>
					</div>
				</div>

				<!-- Preview -->
				<div
					class="rounded-lg p-3 mb-6 text-sm"
					style="background: oklch(0.20 0.01 250); border: 1px solid oklch(0.28 0.02 250);"
				>
					<div class="flex items-center gap-2 mb-2" style="color: oklch(0.65 0.02 250);">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<span class="font-mono">Preview</span>
					</div>
					<ul class="space-y-1 font-mono text-xs" style="color: oklch(0.55 0.02 250);">
						{#each readyTasks.slice(0, Math.min(agentCount, 5)) as task, i}
							<li class="truncate">
								<span style="color: oklch(0.70 0.15 {50 + i * 30});">Agent {i + 1}</span>
								<span style="color: oklch(0.45 0.02 250);">→</span>
								<span>[P{task.priority}] {task.id}</span>
							</li>
						{/each}
						{#if agentCount > 5}
							<li style="color: oklch(0.45 0.02 250);">
								... and {agentCount - 5} more
							</li>
						{/if}
					</ul>
				</div>

				<!-- Error -->
				{#if submitError}
					<div
						class="alert mb-4 font-mono text-sm"
						style="background: oklch(0.35 0.15 25); border: 1px solid oklch(0.50 0.18 25); color: oklch(0.95 0.02 250);"
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<span>{submitError}</span>
					</div>
				{/if}

				<!-- Success -->
				{#if successMessage}
					<div
						class="alert mb-4 font-mono text-sm"
						style="background: oklch(0.35 0.15 150); border: 1px solid oklch(0.50 0.18 150); color: oklch(0.95 0.02 250);"
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<span>{successMessage}</span>
					</div>
				{/if}

				<!-- Progress during spawn -->
				{#if isSubmitting && spawnProgress > 0}
					<div class="mb-4">
						<div class="flex justify-between text-xs font-mono mb-1" style="color: oklch(0.55 0.02 250);">
							<span>Spawning agents...</span>
							<span>{spawnProgress}/{agentCount}</span>
						</div>
						<progress
							class="progress progress-primary w-full"
							value={spawnProgress}
							max={agentCount}
						></progress>
					</div>
				{/if}
			{/if}

			<!-- Actions -->
			<div class="flex gap-3 justify-end">
				<button
					class="btn btn-ghost"
					onclick={handleClose}
					disabled={isSubmitting}
				>
					Cancel
				</button>
				<button
					class="btn btn-primary font-mono gap-2"
					onclick={handleSpawn}
					disabled={!canSpawn || isSubmitting}
				>
					{#if isSubmitting}
						<span class="loading loading-spinner loading-sm"></span>
						Spawning...
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
						</svg>
						Swarm {agentCount} Agent{agentCount !== 1 ? 's' : ''}
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
