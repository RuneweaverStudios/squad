<script lang="ts">
	/**
	 * LLM Provider Settings Editor
	 *
	 * Configuration UI for LLM provider selection:
	 * - Provider mode: auto (API with CLI fallback), API only, CLI only
	 * - Shows current provider status and availability
	 * - Model selection for both API and CLI
	 *
	 * Task: squad-ce8x8 - Implement Claude CLI Fallback Configuration System
	 */

	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { LLM_PROVIDER_DEFAULTS, type LlmProviderMode } from '$lib/config/constants';

	// Provider status (fetched from API)
	let status = $state<{
		mode: LlmProviderMode;
		apiAvailable: boolean;
		cliAvailable: boolean;
		activeProvider: 'api' | 'cli' | 'none';
		statusMessage: string;
	} | null>(null);

	// Form state
	let config = $state({
		mode: LLM_PROVIDER_DEFAULTS.mode as LlmProviderMode,
		api_model: LLM_PROVIDER_DEFAULTS.api_model,
		cli_model: LLM_PROVIDER_DEFAULTS.cli_model as 'haiku' | 'sonnet' | 'opus',
		cli_timeout_ms: LLM_PROVIDER_DEFAULTS.cli_timeout_ms,
		show_provider_status: LLM_PROVIDER_DEFAULTS.show_provider_status
	});

	let originalConfig = $state({
		mode: LLM_PROVIDER_DEFAULTS.mode as LlmProviderMode,
		api_model: LLM_PROVIDER_DEFAULTS.api_model,
		cli_model: LLM_PROVIDER_DEFAULTS.cli_model as 'haiku' | 'sonnet' | 'opus',
		cli_timeout_ms: LLM_PROVIDER_DEFAULTS.cli_timeout_ms,
		show_provider_status: LLM_PROVIDER_DEFAULTS.show_provider_status
	});
	let isLoading = $state(true);
	let isSaving = $state(false);
	let error = $state<string | null>(null);
	let successMessage = $state<string | null>(null);

	// Check if form has changes
	const hasChanges = $derived(
		config.mode !== originalConfig.mode ||
		config.api_model !== originalConfig.api_model ||
		config.cli_model !== originalConfig.cli_model ||
		config.cli_timeout_ms !== originalConfig.cli_timeout_ms ||
		config.show_provider_status !== originalConfig.show_provider_status
	);

	// Load current config and status
	async function loadConfig() {
		isLoading = true;
		error = null;

		try {
			const response = await fetch('/api/config/llm');
			if (!response.ok) {
				throw new Error('Failed to load LLM configuration');
			}
			const data = await response.json();
			config = { ...data.config };
			originalConfig = { ...data.config };
			status = data.status;
		} catch (err) {
			error = (err as Error).message;
		} finally {
			isLoading = false;
		}
	}

	// Save configuration
	async function saveConfig() {
		isSaving = true;
		error = null;
		successMessage = null;

		try {
			const response = await fetch('/api/config/llm', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(config)
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to save configuration');
			}

			const data = await response.json();
			originalConfig = { ...config };
			status = data.status;
			successMessage = 'Configuration saved successfully';

			// Clear success message after 3 seconds
			setTimeout(() => {
				successMessage = null;
			}, 3000);
		} catch (err) {
			error = (err as Error).message;
		} finally {
			isSaving = false;
		}
	}

	// Reset to defaults
	function resetToDefaults() {
		config = {
			mode: LLM_PROVIDER_DEFAULTS.mode,
			api_model: LLM_PROVIDER_DEFAULTS.api_model,
			cli_model: LLM_PROVIDER_DEFAULTS.cli_model as 'haiku' | 'sonnet' | 'opus',
			cli_timeout_ms: LLM_PROVIDER_DEFAULTS.cli_timeout_ms,
			show_provider_status: LLM_PROVIDER_DEFAULTS.show_provider_status
		};
	}

	// Discard changes
	function discardChanges() {
		config = { ...originalConfig };
	}

	onMount(() => {
		loadConfig();
	});
</script>

<div class="p-6 max-w-3xl">
	<h2 class="text-xl font-semibold mb-2">LLM Provider Settings</h2>
	<p class="text-sm text-base-content/70 mb-6">
		Configure how the IDE makes LLM calls for features like task suggestions, summaries, and commit message generation.
	</p>

	{#if isLoading}
		<div class="flex items-center justify-center py-12">
			<span class="loading loading-spinner loading-lg"></span>
		</div>
	{:else}
		<!-- Provider Status Card -->
		{#if status}
			<div class="card bg-base-200 mb-6">
				<div class="card-body p-4">
					<h3 class="card-title text-sm font-medium">Current Status</h3>
					<div class="flex flex-wrap gap-4 mt-2">
						<!-- API Status -->
						<div class="flex items-center gap-2">
							<div class="w-3 h-3 rounded-full {status.apiAvailable ? 'bg-success' : 'bg-error'}"></div>
							<span class="text-sm">
								API Key: {status.apiAvailable ? 'Available' : 'Not configured'}
							</span>
						</div>

						<!-- CLI Status -->
						<div class="flex items-center gap-2">
							<div class="w-3 h-3 rounded-full {status.cliAvailable ? 'bg-success' : 'bg-error'}"></div>
							<span class="text-sm">
								Claude CLI: {status.cliAvailable ? 'Available' : 'Not installed'}
							</span>
						</div>

						<!-- Active Provider -->
						<div class="flex items-center gap-2">
							<span class="text-sm text-base-content/70">Active:</span>
							{#if status.activeProvider === 'api'}
								<span class="badge badge-primary badge-sm">API</span>
							{:else if status.activeProvider === 'cli'}
								<span class="badge badge-secondary badge-sm">CLI</span>
							{:else}
								<span class="badge badge-error badge-sm">None</span>
							{/if}
						</div>
					</div>

					<p class="text-xs text-base-content/60 mt-2">{status.statusMessage}</p>
				</div>
			</div>
		{/if}

		<!-- Configuration Form -->
		<div class="space-y-6">
			<!-- Provider Mode -->
			<div class="form-control">
				<label class="label">
					<span class="label-text font-medium">Provider Mode</span>
				</label>
				<select class="select select-bordered w-full max-w-md" bind:value={config.mode}>
					<option value="auto">Auto (API with CLI fallback)</option>
					<option value="api">API Only (requires API key)</option>
					<option value="cli">CLI Only (requires Claude Code)</option>
				</select>
				<label class="label">
					<span class="label-text-alt text-base-content/60">
						{#if config.mode === 'auto'}
							Uses Anthropic API when available, falls back to Claude CLI if API is unavailable.
						{:else if config.mode === 'api'}
							Requires an Anthropic API key. Fails if key is not configured.
						{:else}
							Requires Claude Code CLI to be installed and authenticated.
						{/if}
					</span>
				</label>
			</div>

			<!-- API Model -->
			<div class="form-control">
				<label class="label">
					<span class="label-text font-medium">API Model</span>
				</label>
				<select class="select select-bordered w-full max-w-md" bind:value={config.api_model}>
					<option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku (Fast, Cost-effective)</option>
					<option value="claude-sonnet-4-20250514">Claude Sonnet 4 (Balanced)</option>
				</select>
				<label class="label">
					<span class="label-text-alt text-base-content/60">
						Model used when making direct API calls. Haiku recommended for suggestions and summaries.
					</span>
				</label>
			</div>

			<!-- CLI Model -->
			<div class="form-control">
				<label class="label">
					<span class="label-text font-medium">CLI Model</span>
				</label>
				<select class="select select-bordered w-full max-w-md" bind:value={config.cli_model}>
					<option value="haiku">Haiku (Fast, Cost-effective)</option>
					<option value="sonnet">Sonnet (Balanced)</option>
					<option value="opus">Opus (Most capable)</option>
				</select>
				<label class="label">
					<span class="label-text-alt text-base-content/60">
						Model used when making CLI calls. CLI uses your Claude Code subscription.
					</span>
				</label>
			</div>

			<!-- CLI Timeout -->
			<div class="form-control">
				<label class="label">
					<span class="label-text font-medium">CLI Timeout (seconds)</span>
				</label>
				<input
					type="number"
					class="input input-bordered w-full max-w-xs"
					bind:value={config.cli_timeout_ms}
					min="5000"
					max="120000"
					step="1000"
				/>
				<label class="label">
					<span class="label-text-alt text-base-content/60">
						Maximum time to wait for CLI response ({(config.cli_timeout_ms / 1000).toFixed(0)} seconds).
					</span>
				</label>
			</div>

			<!-- Show Provider Status -->
			<div class="form-control">
				<label class="label cursor-pointer justify-start gap-3">
					<input
						type="checkbox"
						class="toggle toggle-primary"
						bind:checked={config.show_provider_status}
					/>
					<span class="label-text">Show provider status in responses</span>
				</label>
				<label class="label pt-0">
					<span class="label-text-alt text-base-content/60">
						When enabled, API responses include which provider (API/CLI) was used.
					</span>
				</label>
			</div>
		</div>

		<!-- Error/Success Messages -->
		{#if error}
			<div class="alert alert-error mt-6" transition:fade>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				<span>{error}</span>
			</div>
		{/if}

		{#if successMessage}
			<div class="alert alert-success mt-6" transition:fade>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				<span>{successMessage}</span>
			</div>
		{/if}

		<!-- Action Buttons -->
		<div class="flex flex-wrap gap-3 mt-8 pt-6 border-t border-base-300">
			<button
				class="btn btn-primary"
				onclick={saveConfig}
				disabled={!hasChanges || isSaving}
			>
				{#if isSaving}
					<span class="loading loading-spinner loading-sm"></span>
				{/if}
				Save Changes
			</button>

			<button
				class="btn btn-ghost"
				onclick={discardChanges}
				disabled={!hasChanges || isSaving}
			>
				Discard
			</button>

			<button
				class="btn btn-outline btn-sm ml-auto"
				onclick={resetToDefaults}
				disabled={isSaving}
			>
				Reset to Defaults
			</button>
		</div>

		<!-- Help Section -->
		<div class="mt-8 pt-6 border-t border-base-300">
			<h3 class="text-sm font-medium mb-3">Need Help?</h3>
			<div class="text-sm text-base-content/70 space-y-2">
				<p>
					<strong>API Key:</strong> Get one from
					<a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" class="link link-primary">
						console.anthropic.com
					</a>
					and configure in Settings → API Keys.
				</p>
				<p>
					<strong>Claude CLI:</strong> Install Claude Code from
					<a href="https://claude.ai/code" target="_blank" rel="noopener" class="link link-primary">
						claude.ai/code
					</a>
					and authenticate with <code class="text-xs bg-base-200 px-1 rounded">claude auth</code>.
				</p>
			</div>
		</div>
	{/if}
</div>
