<script lang="ts">
	/**
	 * CommitMessageSettingsEditor Component
	 *
	 * Form for editing commit message generation settings from ~/.config/jat/projects.json
	 * Controls AI model, message style, and generation parameters.
	 */

	import { onMount } from 'svelte';
	import {
		COMMIT_MESSAGE_DEFAULTS,
		type CommitMessageStyle,
		type CommitMessageModel
	} from '$lib/config/constants';

	// State
	let loading = $state(true);
	let saving = $state(false);
	let resetting = $state(false);
	let showResetConfirm = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);
	let configPath = $state('');

	// Form values
	let model = $state<CommitMessageModel>('claude-3-5-haiku-20241022');
	let style = $state<CommitMessageStyle>('conventional');
	let maxTokens = $state(500);
	let includeBody = $state(false);
	let subjectMaxLength = $state(72);
	let customInstructions = $state('');

	// Original values for change detection
	interface CommitMessageConfig {
		model: CommitMessageModel;
		style: CommitMessageStyle;
		max_tokens: number;
		include_body: boolean;
		subject_max_length: number;
		custom_instructions: string;
	}

	let originalValues = $state<CommitMessageConfig | null>(null);

	// Track if form has changes
	let hasChanges = $derived(
		originalValues !== null &&
			(model !== originalValues.model ||
				style !== originalValues.style ||
				maxTokens !== originalValues.max_tokens ||
				includeBody !== originalValues.include_body ||
				subjectMaxLength !== originalValues.subject_max_length ||
				customInstructions !== originalValues.custom_instructions)
	);

	// Validation rules
	const VALIDATION_RULES = {
		maxTokens: { min: 100, max: 2000 },
		subjectMaxLength: { min: 20, max: 120 }
	};

	// Validation error messages
	let maxTokensError = $derived.by(() => {
		if (maxTokens < VALIDATION_RULES.maxTokens.min) {
			return `Minimum is ${VALIDATION_RULES.maxTokens.min} tokens`;
		}
		if (maxTokens > VALIDATION_RULES.maxTokens.max) {
			return `Maximum is ${VALIDATION_RULES.maxTokens.max} tokens`;
		}
		return null;
	});

	let subjectMaxLengthError = $derived.by(() => {
		if (subjectMaxLength < VALIDATION_RULES.subjectMaxLength.min) {
			return `Minimum is ${VALIDATION_RULES.subjectMaxLength.min} characters`;
		}
		if (subjectMaxLength > VALIDATION_RULES.subjectMaxLength.max) {
			return `Maximum is ${VALIDATION_RULES.subjectMaxLength.max} characters`;
		}
		return null;
	});

	// Track if form has validation errors
	let hasValidationErrors = $derived(maxTokensError !== null || subjectMaxLengthError !== null);

	// Model options
	const MODEL_OPTIONS: { value: CommitMessageModel; label: string; description: string }[] = [
		{
			value: 'claude-3-5-haiku-20241022',
			label: 'Claude Haiku',
			description: 'Fast and cost-effective'
		},
		{
			value: 'claude-sonnet-4-20250514',
			label: 'Claude Sonnet',
			description: 'Better quality, higher cost'
		}
	];

	// Style options
	const STYLE_OPTIONS: { value: CommitMessageStyle; label: string; description: string }[] = [
		{
			value: 'conventional',
			label: 'Conventional Commits',
			description: 'feat:, fix:, docs:, chore:, etc.'
		},
		{
			value: 'descriptive',
			label: 'Descriptive',
			description: 'Plain descriptive messages'
		},
		{
			value: 'imperative',
			label: 'Imperative',
			description: 'Add, Fix, Update, Remove...'
		},
		{
			value: 'gitmoji',
			label: 'Gitmoji',
			description: 'With emoji prefixes'
		}
	];

	/**
	 * Load config from API
	 */
	async function loadConfig() {
		loading = true;
		error = null;

		try {
			const response = await fetch('/api/config/commit-message');
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || data.error || 'Failed to load config');
			}

			const config = data.config;
			configPath = data.configPath || '';

			// Set form values
			model = config.model || COMMIT_MESSAGE_DEFAULTS.model;
			style = config.style || COMMIT_MESSAGE_DEFAULTS.style;
			maxTokens = config.max_tokens ?? COMMIT_MESSAGE_DEFAULTS.max_tokens;
			includeBody = config.include_body ?? COMMIT_MESSAGE_DEFAULTS.include_body;
			subjectMaxLength = config.subject_max_length ?? COMMIT_MESSAGE_DEFAULTS.subject_max_length;
			customInstructions = config.custom_instructions ?? COMMIT_MESSAGE_DEFAULTS.custom_instructions;

			// Store original values
			originalValues = {
				model,
				style,
				max_tokens: maxTokens,
				include_body: includeBody,
				subject_max_length: subjectMaxLength,
				custom_instructions: customInstructions
			};
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load configuration';
			console.error('[CommitMessageSettingsEditor] Load error:', err);
		} finally {
			loading = false;
		}
	}

	/**
	 * Save config to API
	 */
	async function saveConfig() {
		if (hasValidationErrors) {
			error = 'Please fix validation errors before saving';
			return;
		}

		saving = true;
		error = null;
		success = null;

		try {
			const response = await fetch('/api/config/commit-message', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					config: {
						model,
						style,
						max_tokens: maxTokens,
						include_body: includeBody,
						subject_max_length: subjectMaxLength,
						custom_instructions: customInstructions
					}
				})
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || data.error || 'Failed to save config');
			}

			// Update original values to match saved state
			originalValues = {
				model,
				style,
				max_tokens: maxTokens,
				include_body: includeBody,
				subject_max_length: subjectMaxLength,
				custom_instructions: customInstructions
			};

			success = 'Settings saved successfully';
			setTimeout(() => {
				success = null;
			}, 3000);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save configuration';
			console.error('[CommitMessageSettingsEditor] Save error:', err);
		} finally {
			saving = false;
		}
	}

	/**
	 * Reset to defaults
	 */
	async function resetToDefaults() {
		resetting = true;
		error = null;
		success = null;

		try {
			const response = await fetch('/api/config/commit-message', {
				method: 'DELETE'
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || data.error || 'Failed to reset config');
			}

			// Reset form to defaults
			model = COMMIT_MESSAGE_DEFAULTS.model;
			style = COMMIT_MESSAGE_DEFAULTS.style;
			maxTokens = COMMIT_MESSAGE_DEFAULTS.max_tokens;
			includeBody = COMMIT_MESSAGE_DEFAULTS.include_body;
			subjectMaxLength = COMMIT_MESSAGE_DEFAULTS.subject_max_length;
			customInstructions = COMMIT_MESSAGE_DEFAULTS.custom_instructions;

			// Update original values
			originalValues = {
				model,
				style,
				max_tokens: maxTokens,
				include_body: includeBody,
				subject_max_length: subjectMaxLength,
				custom_instructions: customInstructions
			};

			showResetConfirm = false;
			success = 'Settings reset to defaults';
			setTimeout(() => {
				success = null;
			}, 3000);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to reset configuration';
			console.error('[CommitMessageSettingsEditor] Reset error:', err);
		} finally {
			resetting = false;
		}
	}

	/**
	 * Discard changes and reload
	 */
	function discardChanges() {
		if (originalValues) {
			model = originalValues.model;
			style = originalValues.style;
			maxTokens = originalValues.max_tokens;
			includeBody = originalValues.include_body;
			subjectMaxLength = originalValues.subject_max_length;
			customInstructions = originalValues.custom_instructions;
		}
	}

	onMount(() => {
		loadConfig();
	});
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-xl font-semibold">Commit Message Generation</h2>
			<p class="text-sm text-base-content/60 mt-1">
				Configure how AI generates commit messages from staged changes
			</p>
		</div>
		{#if configPath}
			<div class="badge badge-ghost text-xs font-mono">{configPath}</div>
		{/if}
	</div>

	<!-- Loading State -->
	{#if loading}
		<div class="flex items-center justify-center py-12">
			<span class="loading loading-spinner loading-lg"></span>
		</div>
	{:else}
		<!-- Error Alert -->
		{#if error}
			<div class="alert alert-error">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span>{error}</span>
				<button class="btn btn-sm btn-ghost" onclick={() => (error = null)}>Dismiss</button>
			</div>
		{/if}

		<!-- Success Alert -->
		{#if success}
			<div class="alert alert-success">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span>{success}</span>
			</div>
		{/if}

		<!-- Form Sections -->
		<div class="space-y-8">
			<!-- Model Selection -->
			<div class="card bg-base-200">
				<div class="card-body">
					<h3 class="card-title text-base">AI Model</h3>
					<p class="text-sm text-base-content/60 mb-4">
						Choose the Claude model for generating commit messages
					</p>

					<div class="grid gap-3">
						{#each MODEL_OPTIONS as option}
							<label
								class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors
                  {model === option.value
									? 'bg-primary/10 border border-primary/30'
									: 'bg-base-100 border border-base-300 hover:border-base-content/20'}"
							>
								<input
									type="radio"
									name="model"
									class="radio radio-primary"
									value={option.value}
									bind:group={model}
								/>
								<div class="flex-1">
									<div class="font-medium">{option.label}</div>
									<div class="text-sm text-base-content/60">{option.description}</div>
								</div>
							</label>
						{/each}
					</div>
				</div>
			</div>

			<!-- Style Selection -->
			<div class="card bg-base-200">
				<div class="card-body">
					<h3 class="card-title text-base">Message Style</h3>
					<p class="text-sm text-base-content/60 mb-4">
						Select the commit message format convention
					</p>

					<div class="grid gap-3 sm:grid-cols-2">
						{#each STYLE_OPTIONS as option}
							<label
								class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors
                  {style === option.value
									? 'bg-primary/10 border border-primary/30'
									: 'bg-base-100 border border-base-300 hover:border-base-content/20'}"
							>
								<input
									type="radio"
									name="style"
									class="radio radio-primary"
									value={option.value}
									bind:group={style}
								/>
								<div class="flex-1">
									<div class="font-medium">{option.label}</div>
									<div class="text-sm text-base-content/60">{option.description}</div>
								</div>
							</label>
						{/each}
					</div>
				</div>
			</div>

			<!-- Generation Settings -->
			<div class="card bg-base-200">
				<div class="card-body">
					<h3 class="card-title text-base">Generation Settings</h3>
					<p class="text-sm text-base-content/60 mb-4">Fine-tune the commit message output</p>

					<div class="space-y-4">
						<!-- Max Tokens -->
						<div class="form-control">
							<label class="label" for="max-tokens">
								<span class="label-text font-medium">Max Tokens</span>
								<span class="label-text-alt text-base-content/50">
									{VALIDATION_RULES.maxTokens.min}-{VALIDATION_RULES.maxTokens.max}
								</span>
							</label>
							<input
								id="max-tokens"
								type="number"
								class="input input-bordered w-full max-w-xs {maxTokensError
									? 'input-error'
									: ''}"
								bind:value={maxTokens}
								min={VALIDATION_RULES.maxTokens.min}
								max={VALIDATION_RULES.maxTokens.max}
							/>
							{#if maxTokensError}
								<label class="label">
									<span class="label-text-alt text-error">{maxTokensError}</span>
								</label>
							{:else}
								<label class="label">
									<span class="label-text-alt text-base-content/50"
										>Maximum response length in tokens</span
									>
								</label>
							{/if}
						</div>

						<!-- Subject Max Length -->
						<div class="form-control">
							<label class="label" for="subject-max-length">
								<span class="label-text font-medium">Subject Line Max Length</span>
								<span class="label-text-alt text-base-content/50">
									{VALIDATION_RULES.subjectMaxLength.min}-{VALIDATION_RULES.subjectMaxLength.max}
								</span>
							</label>
							<input
								id="subject-max-length"
								type="number"
								class="input input-bordered w-full max-w-xs {subjectMaxLengthError
									? 'input-error'
									: ''}"
								bind:value={subjectMaxLength}
								min={VALIDATION_RULES.subjectMaxLength.min}
								max={VALIDATION_RULES.subjectMaxLength.max}
							/>
							{#if subjectMaxLengthError}
								<label class="label">
									<span class="label-text-alt text-error">{subjectMaxLengthError}</span>
								</label>
							{:else}
								<label class="label">
									<span class="label-text-alt text-base-content/50"
										>First line character limit (72 is standard)</span
									>
								</label>
							{/if}
						</div>

						<!-- Include Body Toggle -->
						<div class="form-control">
							<label class="label cursor-pointer justify-start gap-4">
								<input type="checkbox" class="toggle toggle-primary" bind:checked={includeBody} />
								<div>
									<span class="label-text font-medium">Include Body Section</span>
									<p class="text-sm text-base-content/50">
										Add detailed explanation below the subject line
									</p>
								</div>
							</label>
						</div>
					</div>
				</div>
			</div>

			<!-- Custom Instructions -->
			<div class="card bg-base-200">
				<div class="card-body">
					<h3 class="card-title text-base">Custom Instructions</h3>
					<p class="text-sm text-base-content/60 mb-4">
						Additional context or rules for the AI (optional)
					</p>

					<div class="form-control">
						<textarea
							class="textarea textarea-bordered h-24"
							placeholder="e.g., Always mention ticket numbers, prefer short messages, use past tense..."
							bind:value={customInstructions}
						></textarea>
						<label class="label">
							<span class="label-text-alt text-base-content/50"
								>These instructions are appended to the generation prompt</span
							>
						</label>
					</div>
				</div>
			</div>
		</div>

		<!-- Action Buttons -->
		<div class="flex items-center justify-between pt-4 border-t border-base-300">
			<div class="flex items-center gap-2">
				<button
					class="btn btn-ghost btn-sm"
					onclick={() => (showResetConfirm = true)}
					disabled={saving || resetting}
				>
					Reset to Defaults
				</button>
			</div>

			<div class="flex items-center gap-2">
				{#if hasChanges}
					<button class="btn btn-ghost btn-sm" onclick={discardChanges} disabled={saving}>
						Discard
					</button>
				{/if}
				<button
					class="btn btn-primary btn-sm"
					onclick={saveConfig}
					disabled={saving || !hasChanges || hasValidationErrors}
				>
					{#if saving}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					Save Changes
				</button>
			</div>
		</div>
	{/if}
</div>

<!-- Reset Confirmation Modal -->
{#if showResetConfirm}
	<div class="modal modal-open">
		<div class="modal-box">
			<h3 class="font-bold text-lg">Reset to Defaults?</h3>
			<p class="py-4">
				This will reset all commit message settings to their default values. Your custom
				instructions will be cleared.
			</p>
			<div class="modal-action">
				<button
					class="btn btn-ghost"
					onclick={() => (showResetConfirm = false)}
					disabled={resetting}
				>
					Cancel
				</button>
				<button class="btn btn-error" onclick={resetToDefaults} disabled={resetting}>
					{#if resetting}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					Reset
				</button>
			</div>
		</div>
		<div class="modal-backdrop" onclick={() => (showResetConfirm = false)}></div>
	</div>
{/if}
