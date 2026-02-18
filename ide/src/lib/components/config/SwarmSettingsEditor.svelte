<script lang="ts">
	/**
	 * SwarmSettingsEditor Component
	 *
	 * Consolidates all agent swarm/orchestration settings:
	 * - Spawn settings (model, max sessions, agent count, stagger)
	 * - Review rules (via embedded ReviewRulesEditor)
	 *
	 * Settings are persisted to ~/.config/squad/projects.json under defaults.
	 */

	import { onMount } from 'svelte';
	import { SQUAD_DEFAULTS } from '$lib/config/constants';
	import { successToast, errorToast } from '$lib/stores/toasts.svelte';
	import { setMaxSessions, type MaxSessions } from '$lib/stores/preferences.svelte';
	import ReviewRulesEditor from '$lib/components/ReviewRulesEditor.svelte';

	/** Coerce a number to the nearest valid MaxSessions value */
	function toMaxSessions(n: number): MaxSessions {
		const valid: MaxSessions[] = [4, 6, 8, 10, 12, 16, 20];
		// Find closest valid value
		let best: MaxSessions = 12;
		let bestDiff = Infinity;
		for (const v of valid) {
			const diff = Math.abs(n - v);
			if (diff < bestDiff) {
				bestDiff = diff;
				best = v;
			}
		}
		return best;
	}

	// State
	let loading = $state(true);
	let saving = $state(false);
	let hasChanges = $state(false);

	// Form state - spawn settings
	let model = $state(SQUAD_DEFAULTS.model);
	let maxSessions = $state(SQUAD_DEFAULTS.max_sessions);
	let defaultAgentCount = $state(SQUAD_DEFAULTS.default_agent_count);
	let agentStagger = $state(SQUAD_DEFAULTS.agent_stagger);
	let claudeStartupTimeout = $state(SQUAD_DEFAULTS.claude_startup_timeout);

	// Original values for comparison
	let originalValues = $state({
		model: SQUAD_DEFAULTS.model,
		max_sessions: SQUAD_DEFAULTS.max_sessions,
		default_agent_count: SQUAD_DEFAULTS.default_agent_count,
		agent_stagger: SQUAD_DEFAULTS.agent_stagger,
		claude_startup_timeout: SQUAD_DEFAULTS.claude_startup_timeout
	});

	// Model options
	const modelOptions = [
		{ value: 'opus', label: 'Claude Opus', description: 'Most capable, higher cost' },
		{ value: 'sonnet', label: 'Claude Sonnet', description: 'Balanced performance' },
		{ value: 'haiku', label: 'Claude Haiku', description: 'Fast and efficient' }
	];

	// Check for changes
	$effect(() => {
		hasChanges =
			model !== originalValues.model ||
			maxSessions !== originalValues.max_sessions ||
			defaultAgentCount !== originalValues.default_agent_count ||
			agentStagger !== originalValues.agent_stagger ||
			claudeStartupTimeout !== originalValues.claude_startup_timeout;
	});

	// Load current settings
	async function loadDefaults() {
		loading = true;
		try {
			const response = await fetch('/api/config/defaults');
			if (!response.ok) throw new Error('Failed to load settings');

			const data = await response.json();
			const defaults = data.defaults || {};

			// Update form state
			model = defaults.model ?? SQUAD_DEFAULTS.model;
			maxSessions = defaults.max_sessions ?? SQUAD_DEFAULTS.max_sessions;
			defaultAgentCount = defaults.default_agent_count ?? SQUAD_DEFAULTS.default_agent_count;
			agentStagger = defaults.agent_stagger ?? SQUAD_DEFAULTS.agent_stagger;
			claudeStartupTimeout = defaults.claude_startup_timeout ?? SQUAD_DEFAULTS.claude_startup_timeout;

			// Store original values
			originalValues = {
				model,
				max_sessions: maxSessions,
				default_agent_count: defaultAgentCount,
				agent_stagger: agentStagger,
				claude_startup_timeout: claudeStartupTimeout
			};

			// Sync max_sessions to client-side preferences store (localStorage)
			// so all spawn paths use the same limit
			setMaxSessions(toMaxSessions(maxSessions));
		} catch (error) {
			console.error('[SwarmSettings] Load error:', error);
			errorToast('Failed to load settings', error instanceof Error ? error.message : 'Unknown error');
		} finally {
			loading = false;
		}
	}

	// Save settings
	async function saveDefaults() {
		saving = true;
		try {
			const response = await fetch('/api/config/defaults', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					defaults: {
						model,
						max_sessions: maxSessions,
						default_agent_count: defaultAgentCount,
						agent_stagger: agentStagger,
						claude_startup_timeout: claudeStartupTimeout
					}
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to save');
			}

			// Update original values
			originalValues = {
				model,
				max_sessions: maxSessions,
				default_agent_count: defaultAgentCount,
				agent_stagger: agentStagger,
				claude_startup_timeout: claudeStartupTimeout
			};

			// Sync max_sessions to client-side preferences store (localStorage)
			setMaxSessions(toMaxSessions(maxSessions));

			successToast('Swarm settings saved', 'Configuration updated');
		} catch (error) {
			console.error('[SwarmSettings] Save error:', error);
			errorToast('Failed to save settings', error instanceof Error ? error.message : 'Unknown error');
		} finally {
			saving = false;
		}
	}

	// Reset to original
	function resetToOriginal() {
		model = originalValues.model;
		maxSessions = originalValues.max_sessions;
		defaultAgentCount = originalValues.default_agent_count;
		agentStagger = originalValues.agent_stagger;
		claudeStartupTimeout = originalValues.claude_startup_timeout;
	}

	// Reset spawn settings to factory defaults (doesn't save automatically)
	function resetSpawnToFactory() {
		model = SQUAD_DEFAULTS.model;
		maxSessions = SQUAD_DEFAULTS.max_sessions;
		defaultAgentCount = SQUAD_DEFAULTS.default_agent_count;
		agentStagger = SQUAD_DEFAULTS.agent_stagger;
		claudeStartupTimeout = SQUAD_DEFAULTS.claude_startup_timeout;
	}

	onMount(() => {
		loadDefaults();
	});
</script>

<div class="swarm-settings">
	{#if loading}
		<div class="flex justify-center py-12">
			<span class="loading loading-spinner loading-lg text-primary"></span>
		</div>
	{:else}
		<!-- Explainer: Understanding Autopilot -->
		<div class="autopilot-explainer">
			<div class="explainer-header">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
				</svg>
				<span>How Autopilot Works</span>
			</div>
			<div class="explainer-content">
				<p class="explainer-intro">
					When an agent finishes work and emits a <code>review</code> signal, the IDE decides what happens next:
				</p>
				<div class="concept-grid">
					<div class="concept">
						<div class="concept-label">
							<span class="badge badge-sm badge-success">AUTO</span>
							<span>Review Rules</span>
						</div>
						<p>
							If review rules say "auto" for this task (based on type + priority),
							the IDE auto-triggers completion. User never sees the completion block.
						</p>
					</div>
					<div class="concept">
						<div class="concept-label">
							<span class="badge badge-sm badge-info">REVIEW</span>
							<span>User Choice</span>
						</div>
						<p>
							If review rules say "review", user sees completion block with two buttons:
							<strong>Complete</strong> (keep session) or <strong>Complete & Kill</strong> (session ends).
						</p>
					</div>
					<div class="concept">
						<div class="concept-label">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
							</svg>
							<span>Epic Swarm</span>
						</div>
						<p>
							In Epic Swarm mode, completed sessions auto-spawn the next task from the epic.
							This is independent of auto-kill—sessions can spawn a successor before ending.
						</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Header -->
		<div class="settings-header">
			<div>
				<h2 class="text-lg font-semibold" style="color: oklch(0.90 0.02 250);">Autopilot Settings</h2>
				<p class="text-sm mt-1" style="color: oklch(0.55 0.02 250);">
					Configure agent spawning and orchestration behavior
				</p>
			</div>
			<div class="flex items-center gap-2">
				{#if hasChanges}
					<span class="badge badge-warning badge-sm">Unsaved</span>
					<button class="btn btn-ghost btn-sm" onclick={resetToOriginal} disabled={saving}>
						Discard
					</button>
				{/if}
				<button
					class="btn btn-primary btn-sm"
					onclick={saveDefaults}
					disabled={!hasChanges || saving}
				>
					{#if saving}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					Save
				</button>
			</div>
		</div>

		<!-- Spawn Settings Section -->
		<div class="settings-section">
			<div class="section-header-with-actions">
				<div class="section-header">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="w-4 h-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
						/>
					</svg>
					<span>Spawn Configuration</span>
				</div>
				<button
					class="btn btn-ghost btn-sm btn-square"
					onclick={resetSpawnToFactory}
					disabled={saving}
					title="Reset to defaults"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
					</svg>
				</button>
			</div>

			<div class="settings-grid">
				<!-- Model Selection -->
				<div class="form-control">
					<label class="label">
						<span class="label-text font-semibold">Default Model</span>
					</label>
					<select class="select select-bordered" bind:value={model}>
						{#each modelOptions as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
					<label class="label">
						<span class="label-text-alt" style="color: oklch(0.50 0.02 250);">
							{modelOptions.find((o) => o.value === model)?.description}
						</span>
					</label>
				</div>

				<!-- Max Sessions -->
				<div class="form-control">
					<label class="label">
						<span class="label-text font-semibold">Max Concurrent Sessions</span>
					</label>
					<input
						type="number"
						class="input input-bordered"
						bind:value={maxSessions}
						min="1"
						max="20"
					/>
					<label class="label">
						<span class="label-text-alt" style="color: oklch(0.50 0.02 250);">
							Maximum tmux sessions allowed (1-20)
						</span>
					</label>
				</div>

				<!-- Default Agent Count -->
				<div class="form-control">
					<label class="label">
						<span class="label-text font-semibold">Default Agent Count</span>
					</label>
					<input
						type="number"
						class="input input-bordered"
						bind:value={defaultAgentCount}
						min="1"
						max={maxSessions}
					/>
					<label class="label">
						<span class="label-text-alt" style="color: oklch(0.50 0.02 250);">
							Default number of agents to spawn in swarm
						</span>
					</label>
				</div>

				<!-- Agent Stagger -->
				<div class="form-control">
					<label class="label">
						<span class="label-text font-semibold">Spawn Stagger (seconds)</span>
					</label>
					<input
						type="number"
						class="input input-bordered"
						bind:value={agentStagger}
						min="1"
						max="120"
					/>
					<label class="label">
						<span class="label-text-alt" style="color: oklch(0.50 0.02 250);">
							Delay between spawning each agent (1-120s)
						</span>
					</label>
				</div>

				<!-- Claude Startup Timeout -->
				<div class="form-control">
					<label class="label">
						<span class="label-text font-semibold">Claude Startup Timeout (seconds)</span>
					</label>
					<input
						type="number"
						class="input input-bordered"
						bind:value={claudeStartupTimeout}
						min="5"
						max="120"
					/>
					<label class="label">
						<span class="label-text-alt" style="color: oklch(0.50 0.02 250);">
							How long to wait for Claude Code TUI to start
						</span>
					</label>
				</div>
			</div>
		</div>

		<!-- Review Rules Section -->
		<div class="settings-section">
			<div class="section-header">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="w-4 h-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.573-3.007-9.963-7.178z"
					/>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
					/>
				</svg>
				<span>Review Rules</span>
			</div>
			<p class="text-sm mb-4" style="color: oklch(0.55 0.02 250);">
				Configure which task types and priorities auto-proceed vs require human review
			</p>
			<ReviewRulesEditor />
		</div>

	{/if}
</div>

<style>
	.swarm-settings {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	/* Autopilot Explainer */
	.autopilot-explainer {
		padding: 1rem;
		border-radius: 0.5rem;
		background: linear-gradient(135deg, oklch(0.18 0.02 200), oklch(0.16 0.01 250));
		border: 1px solid oklch(0.30 0.05 200);
	}

	.explainer-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.95rem;
		font-weight: 600;
		color: oklch(0.85 0.10 200);
		margin-bottom: 0.75rem;
	}

	.explainer-content {
		font-size: 0.85rem;
		line-height: 1.5;
	}

	.explainer-intro {
		color: oklch(0.70 0.02 250);
		margin-bottom: 1rem;
	}

	.explainer-intro code {
		background: oklch(0.25 0.02 250);
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		font-family: ui-monospace, monospace;
		font-size: 0.8rem;
		color: oklch(0.80 0.10 200);
	}

	.concept-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1rem;
	}

	.concept {
		padding: 0.75rem;
		background: oklch(0.14 0.01 250);
		border-radius: 0.375rem;
		border: 1px solid oklch(0.25 0.02 250);
	}

	.concept-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		color: oklch(0.80 0.02 250);
		margin-bottom: 0.5rem;
	}

	.concept p {
		color: oklch(0.60 0.02 250);
		margin: 0;
	}

	.concept p strong {
		color: oklch(0.75 0.02 250);
	}

	.settings-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid oklch(0.25 0.02 250);
	}

	.settings-section {
		padding: 1rem;
		border-radius: 0.5rem;
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.25 0.02 250);
	}

	.section-header-with-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: oklch(0.80 0.08 200);
		font-family: ui-monospace, monospace;
	}

	.section-header-with-actions + .settings-grid {
		margin-top: 0;
	}

	.settings-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1rem;
	}

	.form-control {
		display: flex;
		flex-direction: column;
	}

	.label {
		padding: 0.25rem 0;
	}

	.label-text {
		color: oklch(0.75 0.02 250);
	}

	.label-text-alt {
		font-size: 0.75rem;
	}

	.select,
	.input {
		background: oklch(0.20 0.01 250);
		border-color: oklch(0.30 0.02 250);
		color: oklch(0.90 0.02 250);
	}

	.select:focus,
	.input:focus {
		border-color: oklch(0.50 0.15 200);
		outline: none;
	}
</style>
