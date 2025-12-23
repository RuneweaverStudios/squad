<script lang="ts">
	/**
	 * DefaultsEditor Component
	 *
	 * Form for editing JAT global defaults from ~/.config/jat/projects.json
	 * Settings here affect agent spawning, model selection, and timing.
	 */

	import { onMount } from 'svelte';

	// Types
	interface JatDefaults {
		terminal: string;
		editor: string;
		tools_path: string;
		claude_flags: string;
		model: string;
		agent_stagger: number;
		claude_startup_timeout: number;
		projects_session_height: number;
		projects_task_height: number;
	}

	// State
	let loading = $state(true);
	let saving = $state(false);
	let resetting = $state(false);
	let showResetConfirm = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);
	let configPath = $state('');

	// Form values
	let terminal = $state('alacritty');
	let editor = $state('code');
	let toolsPath = $state('~/.local/bin');
	let claudeFlags = $state('--dangerously-skip-permissions');
	let model = $state('opus');
	let agentStagger = $state(15);
	let claudeStartupTimeout = $state(20);
	let projectsSessionHeight = $state(400);
	let projectsTaskHeight = $state(400);

	// Track if form has changes
	let originalValues = $state<JatDefaults | null>(null);
	let hasChanges = $derived(
		originalValues !== null && (
			terminal !== originalValues.terminal ||
			editor !== originalValues.editor ||
			toolsPath !== originalValues.tools_path ||
			claudeFlags !== originalValues.claude_flags ||
			model !== originalValues.model ||
			agentStagger !== originalValues.agent_stagger ||
			claudeStartupTimeout !== originalValues.claude_startup_timeout ||
			projectsSessionHeight !== originalValues.projects_session_height ||
			projectsTaskHeight !== originalValues.projects_task_height
		)
	);

	// Validation rules
	const VALIDATION_RULES = {
		agentStagger: { min: 5, max: 300 },
		claudeStartupTimeout: { min: 10, max: 120 },
		projectsSessionHeight: { min: 100, max: 1200 },
		projectsTaskHeight: { min: 100, max: 1200 }
	};

	// Validation error messages (reactive)
	let agentStaggerError = $derived.by(() => {
		if (agentStagger < VALIDATION_RULES.agentStagger.min) {
			return `Minimum is ${VALIDATION_RULES.agentStagger.min} seconds`;
		}
		if (agentStagger > VALIDATION_RULES.agentStagger.max) {
			return `Maximum is ${VALIDATION_RULES.agentStagger.max} seconds`;
		}
		return null;
	});

	let claudeStartupTimeoutError = $derived.by(() => {
		if (claudeStartupTimeout < VALIDATION_RULES.claudeStartupTimeout.min) {
			return `Minimum is ${VALIDATION_RULES.claudeStartupTimeout.min} seconds`;
		}
		if (claudeStartupTimeout > VALIDATION_RULES.claudeStartupTimeout.max) {
			return `Maximum is ${VALIDATION_RULES.claudeStartupTimeout.max} seconds`;
		}
		return null;
	});

	let projectsSessionHeightError = $derived.by(() => {
		if (projectsSessionHeight < VALIDATION_RULES.projectsSessionHeight.min) {
			return `Minimum is ${VALIDATION_RULES.projectsSessionHeight.min}px`;
		}
		if (projectsSessionHeight > VALIDATION_RULES.projectsSessionHeight.max) {
			return `Maximum is ${VALIDATION_RULES.projectsSessionHeight.max}px`;
		}
		return null;
	});

	let projectsTaskHeightError = $derived.by(() => {
		if (projectsTaskHeight < VALIDATION_RULES.projectsTaskHeight.min) {
			return `Minimum is ${VALIDATION_RULES.projectsTaskHeight.min}px`;
		}
		if (projectsTaskHeight > VALIDATION_RULES.projectsTaskHeight.max) {
			return `Maximum is ${VALIDATION_RULES.projectsTaskHeight.max}px`;
		}
		return null;
	});

	// Track if form has validation errors
	let hasValidationErrors = $derived(
		agentStaggerError !== null ||
		claudeStartupTimeoutError !== null ||
		projectsSessionHeightError !== null ||
		projectsTaskHeightError !== null
	);

	// Load defaults on mount
	onMount(() => {
		loadDefaults();
	});

	async function loadDefaults() {
		loading = true;
		error = null;

		try {
			const response = await fetch('/api/config/defaults');
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to load defaults');
			}

			const defaults = data.defaults;
			terminal = defaults.terminal || 'alacritty';
			editor = defaults.editor || 'code';
			toolsPath = defaults.tools_path || '~/.local/bin';
			claudeFlags = defaults.claude_flags || '--dangerously-skip-permissions';
			model = defaults.model || 'opus';
			agentStagger = defaults.agent_stagger || 15;
			claudeStartupTimeout = defaults.claude_startup_timeout || 20;
			projectsSessionHeight = defaults.projects_session_height || 400;
			projectsTaskHeight = defaults.projects_task_height || 400;
			configPath = data.configPath || '';

			// Store original values for change detection
			originalValues = { ...defaults };
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load defaults';
		} finally {
			loading = false;
		}
	}

	async function saveDefaults() {
		saving = true;
		error = null;
		success = null;

		try {
			const response = await fetch('/api/config/defaults', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					defaults: {
						terminal,
						editor,
						tools_path: toolsPath,
						claude_flags: claudeFlags,
						model,
						agent_stagger: agentStagger,
						claude_startup_timeout: claudeStartupTimeout,
						projects_session_height: projectsSessionHeight,
						projects_task_height: projectsTaskHeight
					}
				})
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to save defaults');
			}

			// Update original values
			originalValues = {
				terminal,
				editor,
				tools_path: toolsPath,
				claude_flags: claudeFlags,
				model,
				agent_stagger: agentStagger,
				claude_startup_timeout: claudeStartupTimeout,
				projects_session_height: projectsSessionHeight,
				projects_task_height: projectsTaskHeight
			};

			success = 'Defaults saved successfully';
			setTimeout(() => { success = null; }, 3000);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save defaults';
		} finally {
			saving = false;
		}
	}

	function resetToOriginal() {
		if (originalValues) {
			terminal = originalValues.terminal;
			editor = originalValues.editor;
			toolsPath = originalValues.tools_path;
			claudeFlags = originalValues.claude_flags;
			model = originalValues.model;
			agentStagger = originalValues.agent_stagger;
			claudeStartupTimeout = originalValues.claude_startup_timeout;
			projectsSessionHeight = originalValues.projects_session_height;
			projectsTaskHeight = originalValues.projects_task_height;
		}
	}

	async function resetToFactory() {
		resetting = true;
		error = null;
		success = null;

		try {
			const response = await fetch('/api/config/defaults', {
				method: 'DELETE'
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to reset defaults');
			}

			// Update form with factory values
			const defaults = data.defaults;
			terminal = defaults.terminal;
			editor = defaults.editor;
			toolsPath = defaults.tools_path;
			claudeFlags = defaults.claude_flags;
			model = defaults.model;
			agentStagger = defaults.agent_stagger;
			claudeStartupTimeout = defaults.claude_startup_timeout;
			projectsSessionHeight = defaults.projects_session_height;
			projectsTaskHeight = defaults.projects_task_height;

			// Update original values
			originalValues = { ...defaults };

			success = 'Defaults reset to factory values';
			setTimeout(() => { success = null; }, 3000);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to reset defaults';
		} finally {
			resetting = false;
			showResetConfirm = false;
		}
	}
</script>

<div class="defaults-editor">
	<!-- Header -->
	<div class="editor-header">
		<div class="header-content">
			<h2 class="editor-title">Global Defaults</h2>
			<p class="editor-description">
				Configure global settings for agent spawning and system behavior.
				These values are stored in <code>{configPath || '~/.config/jat/projects.json'}</code>
			</p>
		</div>
	</div>

	{#if loading}
		<!-- Loading state -->
		<div class="loading-state">
			<div class="loading-spinner"></div>
			<p>Loading defaults...</p>
		</div>
	{:else if error && !originalValues}
		<!-- Error state (couldn't load) -->
		<div class="error-state">
			<svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="10"/>
				<path d="M12 8v4M12 16h.01"/>
			</svg>
			<p class="error-title">Failed to load defaults</p>
			<p class="error-message">{error}</p>
			<button class="retry-btn" onclick={loadDefaults}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
					<path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
				</svg>
				Retry
			</button>
		</div>
	{:else}
		<!-- Form -->
		<form class="defaults-form" onsubmit={(e) => { e.preventDefault(); if (!hasValidationErrors) saveDefaults(); }}>
			<!-- Status messages -->
			{#if error}
				<div class="alert alert-error">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="alert-icon">
						<circle cx="12" cy="12" r="10"/>
						<path d="M12 8v4M12 16h.01"/>
					</svg>
					<span>{error}</span>
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

			<!-- Agent Spawning Section -->
			<div class="form-section">
				<h3 class="section-title">Agent Spawning</h3>

				<div class="form-group">
					<label class="form-label" for="model">
						Default Model
						<span class="label-hint">Claude model for new agents</span>
					</label>
					<select id="model" class="form-select" bind:value={model}>
						<option value="opus">Opus (Most capable)</option>
						<option value="sonnet">Sonnet (Balanced)</option>
						<option value="haiku">Haiku (Fastest)</option>
					</select>
				</div>

				<div class="form-group">
					<label class="form-label" for="claude-flags">
						Claude Flags
						<span class="label-hint">CLI flags passed to claude command</span>
					</label>
					<input
						type="text"
						id="claude-flags"
						class="form-input"
						bind:value={claudeFlags}
						placeholder="--dangerously-skip-permissions"
					/>
				</div>

				<div class="form-row">
					<div class="form-group">
						<label class="form-label" for="agent-stagger">
							Agent Stagger
							<span class="label-hint">Seconds between batch spawns (min {VALIDATION_RULES.agentStagger.min})</span>
						</label>
						<div class="input-with-unit">
							<input
								type="number"
								id="agent-stagger"
								class="form-input"
								class:input-error={agentStaggerError}
								bind:value={agentStagger}
								min={VALIDATION_RULES.agentStagger.min}
								max={VALIDATION_RULES.agentStagger.max}
							/>
							<span class="input-unit">seconds</span>
						</div>
						{#if agentStaggerError}
							<span class="field-error">{agentStaggerError}</span>
						{/if}
					</div>

					<div class="form-group">
						<label class="form-label" for="startup-timeout">
							Startup Timeout
							<span class="label-hint">Wait time for Claude TUI (min {VALIDATION_RULES.claudeStartupTimeout.min})</span>
						</label>
						<div class="input-with-unit">
							<input
								type="number"
								id="startup-timeout"
								class="form-input"
								class:input-error={claudeStartupTimeoutError}
								bind:value={claudeStartupTimeout}
								min={VALIDATION_RULES.claudeStartupTimeout.min}
								max={VALIDATION_RULES.claudeStartupTimeout.max}
							/>
							<span class="input-unit">seconds</span>
						</div>
						{#if claudeStartupTimeoutError}
							<span class="field-error">{claudeStartupTimeoutError}</span>
						{/if}
					</div>
				</div>
			</div>

			<!-- Tools Section -->
			<div class="form-section">
				<h3 class="section-title">Tools & Environment</h3>

				<div class="form-group">
					<label class="form-label" for="terminal">
						Terminal
						<span class="label-hint">Terminal emulator for new sessions</span>
					</label>
					<input
						type="text"
						id="terminal"
						class="form-input"
						bind:value={terminal}
						placeholder="alacritty"
					/>
				</div>

				<div class="form-group">
					<label class="form-label" for="editor">
						Editor
						<span class="label-hint">Code editor command</span>
					</label>
					<input
						type="text"
						id="editor"
						class="form-input"
						bind:value={editor}
						placeholder="code"
					/>
				</div>

				<div class="form-group">
					<label class="form-label" for="tools-path">
						Tools Path
						<span class="label-hint">Path to JAT tools directory</span>
					</label>
					<input
						type="text"
						id="tools-path"
						class="form-input"
						bind:value={toolsPath}
						placeholder="~/.local/bin"
					/>
				</div>
			</div>

			<!-- Layout Section -->
			<div class="form-section">
				<h3 class="section-title">Projects Page Layout</h3>

				<div class="form-row">
					<div class="form-group">
						<label class="form-label" for="session-height">
							Sessions Panel Height
							<span class="label-hint">Default height for sessions section</span>
						</label>
						<div class="input-with-unit">
							<input
								type="number"
								id="session-height"
								class="form-input"
								class:input-error={projectsSessionHeightError}
								bind:value={projectsSessionHeight}
								min={VALIDATION_RULES.projectsSessionHeight.min}
								max={VALIDATION_RULES.projectsSessionHeight.max}
							/>
							<span class="input-unit">px</span>
						</div>
						{#if projectsSessionHeightError}
							<span class="field-error">{projectsSessionHeightError}</span>
						{/if}
					</div>

					<div class="form-group">
						<label class="form-label" for="task-height">
							Tasks Panel Height
							<span class="label-hint">Default height for tasks section</span>
						</label>
						<div class="input-with-unit">
							<input
								type="number"
								id="task-height"
								class="form-input"
								class:input-error={projectsTaskHeightError}
								bind:value={projectsTaskHeight}
								min={VALIDATION_RULES.projectsTaskHeight.min}
								max={VALIDATION_RULES.projectsTaskHeight.max}
							/>
							<span class="input-unit">px</span>
						</div>
						{#if projectsTaskHeightError}
							<span class="field-error">{projectsTaskHeightError}</span>
						{/if}
					</div>
				</div>
			</div>

			<!-- Actions -->
			<div class="form-actions">
				<button
					type="button"
					class="btn btn-danger"
					onclick={() => showResetConfirm = true}
					disabled={saving || resetting}
				>
					Reset to Factory
				</button>
				<div class="actions-right">
					<button
						type="button"
						class="btn btn-secondary"
						onclick={resetToOriginal}
						disabled={!hasChanges || saving || resetting}
					>
						Undo Changes
					</button>
					<button
						type="submit"
						class="btn btn-primary"
						disabled={!hasChanges || saving || resetting || hasValidationErrors}
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
	<div class="modal-overlay" onclick={() => showResetConfirm = false}>
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<svg class="modal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
				</svg>
				<h3 class="modal-title">Reset to Factory Defaults?</h3>
			</div>
			<p class="modal-description">
				This will reset all settings to their original factory values. Your custom configuration will be removed from the config file.
			</p>
			<div class="modal-actions">
				<button
					type="button"
					class="btn btn-secondary"
					onclick={() => showResetConfirm = false}
					disabled={resetting}
				>
					Cancel
				</button>
				<button
					type="button"
					class="btn btn-danger"
					onclick={resetToFactory}
					disabled={resetting}
				>
					{#if resetting}
						<span class="btn-spinner"></span>
						Resetting...
					{:else}
						Reset to Factory
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.defaults-editor {
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
	.defaults-form {
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
		margin: 0 0 1rem 0;
		font-family: ui-monospace, monospace;
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
	.form-select {
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
	.form-select:focus {
		outline: none;
		border-color: oklch(0.55 0.15 200);
		box-shadow: 0 0 0 3px oklch(0.55 0.15 200 / 0.15);
	}

	.form-input::placeholder {
		color: oklch(0.45 0.02 250);
	}

	.form-select {
		cursor: pointer;
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
