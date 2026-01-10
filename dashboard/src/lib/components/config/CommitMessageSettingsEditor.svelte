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

<div class="commit-editor">
	<!-- Header -->
	<div class="editor-header">
		<div class="header-content">
			<h2 class="editor-title">Commit Message Generation</h2>
			<p class="editor-description">
				Configure how AI generates commit messages from staged changes.
				{#if configPath}
					Settings stored in <code>{configPath}</code>
				{/if}
			</p>
		</div>
	</div>

	{#if loading}
		<!-- Loading state -->
		<div class="loading-state">
			<div class="loading-spinner"></div>
			<p>Loading settings...</p>
		</div>
	{:else if error && !originalValues}
		<!-- Error state (couldn't load) -->
		<div class="error-state">
			<svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="10"/>
				<path d="M12 8v4M12 16h.01"/>
			</svg>
			<p class="error-title">Failed to load settings</p>
			<p class="error-message">{error}</p>
			<button class="retry-btn" onclick={loadConfig}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
					<path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
				</svg>
				Retry
			</button>
		</div>
	{:else}
		<!-- Form -->
		<form class="commit-form" onsubmit={(e) => { e.preventDefault(); if (!hasValidationErrors) saveConfig(); }}>
			<!-- Status messages -->
			{#if error}
				<div class="alert alert-error">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="alert-icon">
						<circle cx="12" cy="12" r="10"/>
						<path d="M12 8v4M12 16h.01"/>
					</svg>
					<span>{error}</span>
					<button type="button" class="alert-dismiss" onclick={() => (error = null)}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M6 18L18 6M6 6l12 12"/>
						</svg>
					</button>
				</div>
			{/if}

			{#if success}
				<div class="alert alert-success">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="alert-icon">
						<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
					<span>{success}</span>
				</div>
			{/if}

			<!-- AI Model Section -->
			<div class="form-section">
				<h3 class="section-title">AI Model</h3>
				<p class="section-description">Choose the Claude model for generating commit messages</p>

				<div class="radio-options">
					{#each MODEL_OPTIONS as option}
						<label class="radio-option" class:selected={model === option.value}>
							<input
								type="radio"
								name="model"
								value={option.value}
								bind:group={model}
							/>
							<div class="radio-content">
								<span class="radio-label">{option.label}</span>
								<span class="radio-description">{option.description}</span>
							</div>
						</label>
					{/each}
				</div>
			</div>

			<!-- Message Style Section -->
			<div class="form-section">
				<h3 class="section-title">Message Style</h3>
				<p class="section-description">Select the commit message format convention</p>

				<div class="radio-options radio-grid">
					{#each STYLE_OPTIONS as option}
						<label class="radio-option" class:selected={style === option.value}>
							<input
								type="radio"
								name="style"
								value={option.value}
								bind:group={style}
							/>
							<div class="radio-content">
								<span class="radio-label">{option.label}</span>
								<span class="radio-description">{option.description}</span>
							</div>
						</label>
					{/each}
				</div>
			</div>

			<!-- Generation Settings Section -->
			<div class="form-section">
				<h3 class="section-title">Generation Settings</h3>
				<p class="section-description">Fine-tune the commit message output</p>

				<div class="form-row">
					<div class="form-group">
						<label class="form-label" for="max-tokens">
							Max Tokens
							<span class="label-hint">{VALIDATION_RULES.maxTokens.min}-{VALIDATION_RULES.maxTokens.max}</span>
						</label>
						<div class="input-with-unit">
							<input
								id="max-tokens"
								type="number"
								class="form-input"
								class:input-error={maxTokensError}
								bind:value={maxTokens}
								min={VALIDATION_RULES.maxTokens.min}
								max={VALIDATION_RULES.maxTokens.max}
							/>
							<span class="input-unit">tokens</span>
						</div>
						{#if maxTokensError}
							<span class="field-error">{maxTokensError}</span>
						{:else}
							<span class="field-hint">Maximum response length</span>
						{/if}
					</div>

					<div class="form-group">
						<label class="form-label" for="subject-max-length">
							Subject Max Length
							<span class="label-hint">{VALIDATION_RULES.subjectMaxLength.min}-{VALIDATION_RULES.subjectMaxLength.max}</span>
						</label>
						<div class="input-with-unit">
							<input
								id="subject-max-length"
								type="number"
								class="form-input"
								class:input-error={subjectMaxLengthError}
								bind:value={subjectMaxLength}
								min={VALIDATION_RULES.subjectMaxLength.min}
								max={VALIDATION_RULES.subjectMaxLength.max}
							/>
							<span class="input-unit">chars</span>
						</div>
						{#if subjectMaxLengthError}
							<span class="field-error">{subjectMaxLengthError}</span>
						{:else}
							<span class="field-hint">First line limit (72 is standard)</span>
						{/if}
					</div>
				</div>

				<div class="form-group">
					<label class="form-label toggle-label" for="include-body">
						<span class="toggle-label-text">
							Include Body Section
							<span class="label-hint">Add detailed explanation below subject line</span>
						</span>
						<input
							type="checkbox"
							id="include-body"
							class="toggle"
							bind:checked={includeBody}
						/>
					</label>
				</div>
			</div>

			<!-- Custom Instructions Section -->
			<div class="form-section">
				<h3 class="section-title">Custom Instructions</h3>
				<p class="section-description">Additional context or rules for the AI (optional)</p>

				<div class="form-group">
					<textarea
						class="form-textarea"
						placeholder="e.g., Always mention ticket numbers, prefer short messages, use past tense..."
						bind:value={customInstructions}
						rows="3"
					></textarea>
					<span class="field-hint">These instructions are appended to the generation prompt</span>
				</div>
			</div>

			<!-- Actions -->
			<div class="form-actions">
				<button
					type="button"
					class="btn btn-danger"
					onclick={() => (showResetConfirm = true)}
					disabled={saving || resetting}
				>
					Reset to Defaults
				</button>
				<div class="actions-right">
					{#if hasChanges}
						<button
							type="button"
							class="btn btn-secondary"
							onclick={discardChanges}
							disabled={saving}
						>
							Discard
						</button>
					{/if}
					<button
						type="submit"
						class="btn btn-primary"
						disabled={saving || !hasChanges || hasValidationErrors}
					>
						{#if saving}
							<span class="btn-spinner"></span>
							Saving...
						{:else}
							Save Changes
						{/if}
					</button>
				</div>
			</div>
		</form>
	{/if}
</div>

<!-- Reset Confirmation Modal -->
{#if showResetConfirm}
	<div class="modal-overlay" onclick={() => (showResetConfirm = false)}>
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<svg class="modal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
				</svg>
				<h3 class="modal-title">Reset to Defaults?</h3>
			</div>
			<p class="modal-description">
				This will reset all commit message settings to their default values. Your custom
				instructions will be cleared.
			</p>
			<div class="modal-actions">
				<button
					type="button"
					class="btn btn-secondary"
					onclick={() => (showResetConfirm = false)}
					disabled={resetting}
				>
					Cancel
				</button>
				<button
					type="button"
					class="btn btn-danger"
					onclick={resetToDefaults}
					disabled={resetting}
				>
					{#if resetting}
						<span class="btn-spinner"></span>
						Resetting...
					{:else}
						Reset
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.commit-editor {
		max-width: 700px;
	}

	/* Header */
	.editor-header {
		margin-bottom: 1.5rem;
	}

	.editor-title {
		font-size: 1.1rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0 0 0.5rem 0;
		font-family: ui-monospace, monospace;
	}

	.editor-description {
		font-size: 0.85rem;
		color: oklch(0.60 0.02 250);
		margin: 0;
		line-height: 1.5;
	}

	.editor-description code {
		background: oklch(0.18 0.02 250);
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		font-size: 0.8rem;
		color: oklch(0.75 0.10 200);
	}

	/* Loading state */
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		gap: 1rem;
		color: oklch(0.55 0.02 250);
	}

	.loading-spinner {
		width: 32px;
		height: 32px;
		border: 3px solid oklch(0.30 0.02 250);
		border-top-color: oklch(0.65 0.15 200);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Error state */
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		gap: 0.5rem;
		color: oklch(0.55 0.02 250);
	}

	.error-icon {
		width: 48px;
		height: 48px;
		color: oklch(0.60 0.15 25);
		margin-bottom: 0.5rem;
	}

	.error-title {
		font-size: 0.9rem;
		font-weight: 500;
		color: oklch(0.70 0.12 25);
		margin: 0;
	}

	.error-message {
		font-size: 0.8rem;
		color: oklch(0.55 0.02 250);
		margin: 0;
	}

	.retry-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-top: 1rem;
		padding: 0.5rem 1rem;
		font-size: 0.8rem;
		font-weight: 500;
		background: oklch(0.25 0.05 200);
		border: 1px solid oklch(0.35 0.08 200);
		border-radius: 6px;
		color: oklch(0.85 0.08 200);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.retry-btn:hover {
		background: oklch(0.30 0.08 200);
	}

	.btn-icon {
		width: 16px;
		height: 16px;
	}

	/* Form */
	.commit-form {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	/* Alert messages */
	.alert {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		font-size: 0.85rem;
	}

	.alert-error {
		background: oklch(0.25 0.08 25);
		border: 1px solid oklch(0.40 0.12 25);
		color: oklch(0.85 0.10 25);
	}

	.alert-success {
		background: oklch(0.25 0.08 145);
		border: 1px solid oklch(0.40 0.12 145);
		color: oklch(0.85 0.10 145);
	}

	.alert-icon {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
	}

	.alert-dismiss {
		margin-left: auto;
		padding: 0.25rem;
		background: transparent;
		border: none;
		color: inherit;
		cursor: pointer;
		opacity: 0.7;
		transition: opacity 0.15s ease;
	}

	.alert-dismiss:hover {
		opacity: 1;
	}

	.alert-dismiss svg {
		width: 16px;
		height: 16px;
	}

	/* Form sections */
	.form-section {
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 10px;
		padding: 1.25rem;
	}

	.section-title {
		font-size: 0.9rem;
		font-weight: 600;
		color: oklch(0.80 0.08 200);
		margin: 0 0 0.25rem 0;
		font-family: ui-monospace, monospace;
	}

	.section-description {
		font-size: 0.8rem;
		color: oklch(0.55 0.02 250);
		margin: 0 0 1rem 0;
		line-height: 1.5;
	}

	/* Radio options */
	.radio-options {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.radio-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
	}

	@media (max-width: 500px) {
		.radio-grid {
			grid-template-columns: 1fr;
		}
	}

	.radio-option {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: oklch(0.12 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.radio-option:hover {
		background: oklch(0.15 0.02 250);
		border-color: oklch(0.35 0.02 250);
	}

	.radio-option.selected {
		background: oklch(0.18 0.05 200);
		border-color: oklch(0.45 0.12 200);
	}

	.radio-option input[type="radio"] {
		width: 16px;
		height: 16px;
		margin-top: 0.125rem;
		accent-color: oklch(0.65 0.15 200);
	}

	.radio-content {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.radio-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: oklch(0.90 0.02 250);
	}

	.radio-description {
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
	}

	/* Form groups */
	.form-group {
		margin-bottom: 1rem;
	}

	.form-group:last-child {
		margin-bottom: 0;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	@media (max-width: 500px) {
		.form-row {
			grid-template-columns: 1fr;
		}
	}

	.form-label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.85rem;
		font-weight: 500;
		color: oklch(0.80 0.02 250);
		margin-bottom: 0.5rem;
	}

	.label-hint {
		font-size: 0.75rem;
		font-weight: 400;
		color: oklch(0.55 0.02 250);
	}

	.form-input,
	.form-textarea {
		width: 100%;
		padding: 0.625rem 0.875rem;
		font-size: 0.875rem;
		font-family: ui-monospace, monospace;
		background: oklch(0.12 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 6px;
		color: oklch(0.90 0.02 250);
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}

	.form-input:focus,
	.form-textarea:focus {
		outline: none;
		border-color: oklch(0.55 0.15 200);
		box-shadow: 0 0 0 3px oklch(0.55 0.15 200 / 0.15);
	}

	.form-input::placeholder,
	.form-textarea::placeholder {
		color: oklch(0.45 0.02 250);
	}

	.form-textarea {
		resize: vertical;
		min-height: 80px;
	}

	.input-with-unit {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.input-with-unit .form-input {
		width: 100px;
	}

	.input-unit {
		font-size: 0.8rem;
		color: oklch(0.55 0.02 250);
	}

	/* Error states */
	.input-error {
		border-color: oklch(0.55 0.18 25) !important;
	}

	.input-error:focus {
		border-color: oklch(0.55 0.18 25) !important;
		box-shadow: 0 0 0 3px oklch(0.55 0.18 25 / 0.15) !important;
	}

	.field-error {
		display: block;
		margin-top: 0.375rem;
		font-size: 0.75rem;
		color: oklch(0.70 0.15 25);
	}

	.field-hint {
		display: block;
		margin-top: 0.375rem;
		font-size: 0.75rem;
		color: oklch(0.50 0.02 250);
	}

	/* Toggle label (horizontal layout) */
	.toggle-label {
		flex-direction: row !important;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}

	.toggle-label-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	/* Toggle switch */
	.toggle {
		appearance: none;
		width: 44px;
		height: 24px;
		background: oklch(0.30 0.02 250);
		border-radius: 12px;
		position: relative;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.toggle::before {
		content: '';
		position: absolute;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: oklch(0.75 0.02 250);
		top: 3px;
		left: 3px;
		transition: transform 0.2s ease;
	}

	.toggle:checked {
		background: oklch(0.55 0.15 200);
	}

	.toggle:checked::before {
		transform: translateX(20px);
		background: oklch(0.98 0.02 200);
	}

	.toggle:focus {
		outline: none;
		box-shadow: 0 0 0 3px oklch(0.55 0.15 200 / 0.2);
	}

	/* Actions */
	.form-actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		padding-top: 0.5rem;
	}

	.actions-right {
		display: flex;
		gap: 0.75rem;
	}

	.btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.625rem 1.25rem;
		font-size: 0.85rem;
		font-weight: 500;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: ui-monospace, monospace;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary {
		background: oklch(0.55 0.15 200);
		border: 1px solid oklch(0.60 0.18 200);
		color: oklch(0.98 0.02 200);
	}

	.btn-primary:hover:not(:disabled) {
		background: oklch(0.60 0.18 200);
	}

	.btn-secondary {
		background: oklch(0.22 0.02 250);
		border: 1px solid oklch(0.32 0.02 250);
		color: oklch(0.75 0.02 250);
	}

	.btn-secondary:hover:not(:disabled) {
		background: oklch(0.28 0.02 250);
		color: oklch(0.85 0.02 250);
	}

	.btn-danger {
		background: oklch(0.35 0.12 25);
		border: 1px solid oklch(0.45 0.15 25);
		color: oklch(0.90 0.08 25);
	}

	.btn-danger:hover:not(:disabled) {
		background: oklch(0.40 0.15 25);
	}

	.btn-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid oklch(0.98 0.02 200 / 0.3);
		border-top-color: oklch(0.98 0.02 200);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	/* Modal */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: oklch(0 0 0 / 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		backdrop-filter: blur(2px);
	}

	.modal-content {
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 12px;
		padding: 1.5rem;
		max-width: 420px;
		width: 90%;
		box-shadow: 0 20px 40px oklch(0 0 0 / 0.4);
	}

	.modal-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.modal-icon {
		width: 28px;
		height: 28px;
		color: oklch(0.70 0.18 45);
		flex-shrink: 0;
	}

	.modal-title {
		font-size: 1.1rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
		font-family: ui-monospace, monospace;
	}

	.modal-description {
		font-size: 0.9rem;
		color: oklch(0.65 0.02 250);
		margin: 0 0 1.5rem 0;
		line-height: 1.5;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
	}
</style>
