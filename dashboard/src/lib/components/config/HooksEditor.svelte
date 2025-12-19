<script lang="ts">
	/**
	 * HooksEditor Component
	 *
	 * Form-based editor for Claude Code hooks configuration (.claude/settings.json).
	 * Provides visual editing of PreToolUse, PostToolUse, UserPromptSubmit, PreCompact,
	 * and SessionStart hooks with add/remove/edit capabilities.
	 *
	 * @see dashboard/src/lib/types/config.ts for type definitions
	 */

	import { fly, fade, slide } from 'svelte/transition';
	import type {
		HooksConfig,
		HookEntry,
		HookCommand,
		HookEventType,
		ClaudeSettingsFile
	} from '$lib/types/config';
	import { validateHooksConfig, type ValidationResult } from '$lib/utils/editorValidation';

	interface Props {
		/** Whether hooks are currently loading */
		loading?: boolean;
		/** Error message if loading failed */
		error?: string | null;
		/** Callback when hooks are saved */
		onSave?: (hooks: HooksConfig) => Promise<boolean>;
		/** Callback to retry loading */
		onRetry?: () => void;
	}

	let { loading = false, error = null, onSave, onRetry }: Props = $props();

	// Hook event types and their descriptions
	const hookEventTypes: { id: HookEventType; label: string; description: string }[] = [
		{
			id: 'PreToolUse',
			label: 'Pre Tool Use',
			description: 'Runs BEFORE a tool executes. Matcher is tool name regex.'
		},
		{
			id: 'PostToolUse',
			label: 'Post Tool Use',
			description: 'Runs AFTER a tool executes. Matcher is tool name regex.'
		},
		{
			id: 'UserPromptSubmit',
			label: 'User Prompt Submit',
			description: 'Runs when user submits a prompt. Matcher is ".*" for all.'
		},
		{
			id: 'PreCompact',
			label: 'Pre Compact',
			description: 'Runs before context compaction. Matcher is ".*" for all.'
		},
		{
			id: 'SessionStart',
			label: 'Session Start',
			description: 'Runs when a new session starts. Matcher is ".*" for all.'
		}
	];

	// Local state for hooks (editable copy)
	let hooks = $state<HooksConfig>({});
	let originalHooks = $state<HooksConfig>({});
	let isSaving = $state(false);
	let saveError = $state<string | null>(null);
	let saveSuccess = $state(false);
	let expandedEvents = $state<Set<HookEventType>>(new Set());
	let editingEntry = $state<{ eventType: HookEventType; entryIndex: number } | null>(null);

	// Inline validation errors per field
	let matcherErrors = $state<Map<string, string>>(new Map());  // key: `${eventType}-${entryIndex}`
	let commandErrors = $state<Map<string, string>>(new Map()); // key: `${eventType}-${entryIndex}-${hookIndex}`

	// Track if there are unsaved changes
	const hasChanges = $derived(JSON.stringify(hooks) !== JSON.stringify(originalHooks));

	// Check if there are any validation errors
	const hasValidationErrors = $derived(matcherErrors.size > 0 || commandErrors.size > 0);

	// Initialize hooks from API
	export function setHooks(hooksConfig: HooksConfig) {
		hooks = JSON.parse(JSON.stringify(hooksConfig));
		originalHooks = JSON.parse(JSON.stringify(hooksConfig));
		// Expand events that have entries
		const eventsWithHooks = new Set<HookEventType>();
		for (const eventType of Object.keys(hooksConfig) as HookEventType[]) {
			if (hooksConfig[eventType]?.length) {
				eventsWithHooks.add(eventType);
			}
		}
		expandedEvents = eventsWithHooks;
	}

	// Toggle event type expansion
	function toggleEventExpansion(eventType: HookEventType) {
		const newSet = new Set(expandedEvents);
		if (newSet.has(eventType)) {
			newSet.delete(eventType);
		} else {
			newSet.add(eventType);
		}
		expandedEvents = newSet;
	}

	// Add new entry to an event type
	function addEntry(eventType: HookEventType) {
		const entries = hooks[eventType] || [];
		const newEntry: HookEntry = {
			matcher: eventType === 'PreToolUse' || eventType === 'PostToolUse' ? '^Bash$' : '.*',
			hooks: [
				{
					type: 'command',
					command: './.claude/hooks/my-hook.sh',
					statusMessage: '',
					streamStdinJson: false
				}
			]
		};
		hooks = {
			...hooks,
			[eventType]: [...entries, newEntry]
		};
		// Expand this event type
		expandedEvents = new Set([...expandedEvents, eventType]);
		// Set editing mode for the new entry
		editingEntry = { eventType, entryIndex: entries.length };
	}

	// Remove entry from an event type
	function removeEntry(eventType: HookEventType, entryIndex: number) {
		const entries = hooks[eventType] || [];
		const newEntries = entries.filter((_, i) => i !== entryIndex);
		if (newEntries.length === 0) {
			// Remove the event type entirely if no entries left
			const { [eventType]: _, ...rest } = hooks;
			hooks = rest;
		} else {
			hooks = {
				...hooks,
				[eventType]: newEntries
			};
		}
		// Clear editing state if this entry was being edited
		if (editingEntry?.eventType === eventType && editingEntry?.entryIndex === entryIndex) {
			editingEntry = null;
		}
	}

	// Add hook command to an entry
	function addHookCommand(eventType: HookEventType, entryIndex: number) {
		const entries = hooks[eventType] || [];
		const entry = entries[entryIndex];
		if (!entry) return;

		const newHook: HookCommand = {
			type: 'command',
			command: './.claude/hooks/my-hook.sh',
			statusMessage: '',
			streamStdinJson: false
		};

		const newEntries = [...entries];
		newEntries[entryIndex] = {
			...entry,
			hooks: [...entry.hooks, newHook]
		};
		hooks = {
			...hooks,
			[eventType]: newEntries
		};
	}

	// Remove hook command from an entry
	function removeHookCommand(eventType: HookEventType, entryIndex: number, hookIndex: number) {
		const entries = hooks[eventType] || [];
		const entry = entries[entryIndex];
		if (!entry) return;

		const newHooks = entry.hooks.filter((_, i) => i !== hookIndex);
		if (newHooks.length === 0) {
			// Remove the entire entry if no hooks left
			removeEntry(eventType, entryIndex);
		} else {
			const newEntries = [...entries];
			newEntries[entryIndex] = {
				...entry,
				hooks: newHooks
			};
			hooks = {
				...hooks,
				[eventType]: newEntries
			};
		}
	}

	// Validate regex pattern
	function validateMatcher(eventType: HookEventType, entryIndex: number, matcher: string): string | null {
		if (!matcher.trim()) {
			return 'Matcher pattern is required';
		}
		try {
			new RegExp(matcher);
			return null;
		} catch (e) {
			return `Invalid regex: ${e instanceof Error ? e.message : String(e)}`;
		}
	}

	// Validate command path
	function validateCommand(eventType: HookEventType, entryIndex: number, hookIndex: number, command: string): string | null {
		if (!command.trim()) {
			return 'Command path is required';
		}
		// Warn about potentially problematic paths
		if (command.includes(' ') && !command.startsWith('"') && !command.startsWith("'")) {
			return 'Warning: Path contains spaces - consider quoting the path';
		}
		return null;
	}

	// Update matcher for an entry (with validation)
	function updateMatcher(eventType: HookEventType, entryIndex: number, matcher: string) {
		const entries = hooks[eventType] || [];
		const newEntries = [...entries];
		newEntries[entryIndex] = {
			...newEntries[entryIndex],
			matcher
		};
		hooks = {
			...hooks,
			[eventType]: newEntries
		};

		// Validate and update error state
		const key = `${eventType}-${entryIndex}`;
		const error = validateMatcher(eventType, entryIndex, matcher);
		const newErrors = new Map(matcherErrors);
		if (error) {
			newErrors.set(key, error);
		} else {
			newErrors.delete(key);
		}
		matcherErrors = newErrors;
	}

	// Update hook command
	function updateHookCommand(
		eventType: HookEventType,
		entryIndex: number,
		hookIndex: number,
		field: keyof HookCommand,
		value: any
	) {
		const entries = hooks[eventType] || [];
		const entry = entries[entryIndex];
		if (!entry) return;

		const newHooks = [...entry.hooks];
		newHooks[hookIndex] = {
			...newHooks[hookIndex],
			[field]: value
		};

		const newEntries = [...entries];
		newEntries[entryIndex] = {
			...entry,
			hooks: newHooks
		};
		hooks = {
			...hooks,
			[eventType]: newEntries
		};

		// Validate command field
		if (field === 'command') {
			const key = `${eventType}-${entryIndex}-${hookIndex}`;
			const error = validateCommand(eventType, entryIndex, hookIndex, value as string);
			const newErrors = new Map(commandErrors);
			if (error && !error.startsWith('Warning:')) {
				newErrors.set(key, error);
			} else {
				newErrors.delete(key);
			}
			commandErrors = newErrors;
		}
	}

	// Save hooks
	async function handleSave() {
		if (!onSave) return;

		isSaving = true;
		saveError = null;
		saveSuccess = false;

		try {
			const success = await onSave(hooks);
			if (success) {
				originalHooks = JSON.parse(JSON.stringify(hooks));
				saveSuccess = true;
				setTimeout(() => {
					saveSuccess = false;
				}, 2000);
			} else {
				saveError = 'Failed to save hooks';
			}
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'Failed to save hooks';
		} finally {
			isSaving = false;
		}
	}

	// Reset to original
	function handleReset() {
		hooks = JSON.parse(JSON.stringify(originalHooks));
		editingEntry = null;
		// Clear all validation errors
		matcherErrors = new Map();
		commandErrors = new Map();
	}

	// Get entry count for an event type
	function getEntryCount(eventType: HookEventType): number {
		return hooks[eventType]?.length || 0;
	}

	// Get total hook count for an event type
	function getHookCount(eventType: HookEventType): number {
		const entries = hooks[eventType] || [];
		return entries.reduce((acc, entry) => acc + entry.hooks.length, 0);
	}
</script>

<div class="hooks-editor">
	{#if loading}
		<!-- Loading State -->
		<div class="loading-state" transition:fade={{ duration: 150 }}>
			<div class="loading-spinner"></div>
			<p class="loading-text">Loading hooks configuration...</p>
		</div>
	{:else if error}
		<!-- Error State -->
		<div class="error-state" transition:fade={{ duration: 150 }}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="error-icon"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
				/>
			</svg>
			<p class="error-title">Failed to load hooks</p>
			<p class="error-message">{error}</p>
			{#if onRetry}
				<button class="retry-btn" onclick={onRetry}>
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
							d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
						/>
					</svg>
					Retry
				</button>
			{/if}
		</div>
	{:else}
		<!-- Main Editor -->
		<div class="editor-content" transition:fade={{ duration: 150 }}>
			<!-- Header with save/reset buttons -->
			<div class="editor-header">
				<div class="header-info">
					<span class="file-path">.claude/settings.json</span>
					{#if hasChanges}
						<span class="unsaved-badge">Unsaved changes</span>
					{/if}
					{#if hasValidationErrors}
						<span class="validation-error-badge">
							{matcherErrors.size + commandErrors.size} error{matcherErrors.size + commandErrors.size > 1 ? 's' : ''}
						</span>
					{/if}
				</div>
				<div class="header-actions">
					{#if saveSuccess}
						<span class="save-success" transition:fade={{ duration: 150 }}>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M5 13l4 4L19 7"
								/>
							</svg>
							Saved
						</span>
					{/if}
					{#if saveError}
						<span class="save-error" transition:fade={{ duration: 150 }}>
							{saveError}
						</span>
					{/if}
					<button
						class="reset-btn"
						onclick={handleReset}
						disabled={!hasChanges || isSaving}
						title="Reset to last saved state"
					>
						Reset
					</button>
					<button
						class="save-btn"
						onclick={handleSave}
						disabled={!hasChanges || isSaving || hasValidationErrors}
						title={hasValidationErrors ? 'Fix validation errors before saving' : ''}
					>
						{#if isSaving}
							<span class="btn-spinner"></span>
							Saving...
						{:else}
							Save Changes
						{/if}
					</button>
				</div>
			</div>

			<!-- Hook Event Types -->
			<div class="event-types">
				{#each hookEventTypes as eventType}
					{@const entryCount = getEntryCount(eventType.id)}
					{@const hookCount = getHookCount(eventType.id)}
					{@const isExpanded = expandedEvents.has(eventType.id)}

					<div class="event-type-card" class:has-hooks={entryCount > 0}>
						<!-- Event Type Header -->
						<div class="event-header">
							<button
								class="event-toggle"
								onclick={() => toggleEventExpansion(eventType.id)}
								aria-expanded={isExpanded}
							>
								<svg
									class="expand-icon"
									class:expanded={isExpanded}
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 5l7 7-7 7"
									/>
								</svg>
								<span class="event-label">{eventType.label}</span>
								{#if entryCount > 0}
									<span class="event-count">
										{entryCount} {entryCount === 1 ? 'entry' : 'entries'}, {hookCount}
										{hookCount === 1 ? 'hook' : 'hooks'}
									</span>
								{:else}
									<span class="event-empty">No hooks configured</span>
								{/if}
							</button>
							<button
								class="add-entry-btn"
								onclick={() => addEntry(eventType.id)}
								title="Add hook entry"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 4v16m8-8H4"
									/>
								</svg>
							</button>
						</div>

						<!-- Event Description -->
						{#if isExpanded}
							<p class="event-description" transition:slide={{ duration: 150 }}>
								{eventType.description}
							</p>
						{/if}

						<!-- Hook Entries -->
						{#if isExpanded && hooks[eventType.id]}
							<div class="entries-list" transition:slide={{ duration: 200 }}>
								{#each hooks[eventType.id] || [] as entry, entryIndex (entryIndex)}
									{@const matcherKey = `${eventType.id}-${entryIndex}`}
									{@const matcherError = matcherErrors.get(matcherKey)}
									<div class="entry-card" transition:slide={{ duration: 150 }}>
										<div class="entry-header">
											<div class="entry-matcher">
												<label class="matcher-label">Matcher (regex)</label>
												<input
													type="text"
													class="matcher-input"
													class:has-error={!!matcherError}
													value={entry.matcher}
													oninput={(e) =>
														updateMatcher(
															eventType.id,
															entryIndex,
															e.currentTarget.value
														)}
													placeholder=".*"
												/>
												{#if matcherError}
													<span class="field-error">{matcherError}</span>
												{/if}
											</div>
											<button
												class="remove-entry-btn"
												onclick={() => removeEntry(eventType.id, entryIndex)}
												title="Remove entry"
											>
												<svg
													class="w-4 h-4"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
													/>
												</svg>
											</button>
										</div>

										<!-- Hook Commands -->
										<div class="hooks-list">
											{#each entry.hooks as hook, hookIndex (hookIndex)}
												{@const commandKey = `${eventType.id}-${entryIndex}-${hookIndex}`}
												{@const commandError = commandErrors.get(commandKey)}
												<div class="hook-card" transition:slide={{ duration: 150 }}>
													<div class="hook-header">
														<span class="hook-index">Hook {hookIndex + 1}</span>
														<button
															class="remove-hook-btn"
															onclick={() =>
																removeHookCommand(eventType.id, entryIndex, hookIndex)}
															title="Remove hook"
														>
															<svg
																class="w-3 h-3"
																fill="none"
																stroke="currentColor"
																viewBox="0 0 24 24"
															>
																<path
																	stroke-linecap="round"
																	stroke-linejoin="round"
																	stroke-width="2"
																	d="M6 18L18 6M6 6l12 12"
																/>
															</svg>
														</button>
													</div>

													<div class="hook-fields">
														<!-- Command -->
														<div class="field-group">
															<label class="field-label">Command</label>
															<input
																type="text"
																class="field-input font-mono"
																class:has-error={!!commandError}
																value={hook.command}
																oninput={(e) =>
																	updateHookCommand(
																		eventType.id,
																		entryIndex,
																		hookIndex,
																		'command',
																		e.currentTarget.value
																	)}
																placeholder="./.claude/hooks/my-hook.sh"
															/>
															{#if commandError}
																<span class="field-error">{commandError}</span>
															{/if}
														</div>

														<!-- Status Message -->
														<div class="field-group">
															<label class="field-label">Status Message (optional)</label>
															<input
																type="text"
																class="field-input"
																value={hook.statusMessage || ''}
																oninput={(e) =>
																	updateHookCommand(
																		eventType.id,
																		entryIndex,
																		hookIndex,
																		'statusMessage',
																		e.currentTarget.value
																	)}
																placeholder="Running hook..."
															/>
														</div>

														<!-- Stream Stdin JSON -->
														<div class="field-group-inline">
															<label class="checkbox-label">
																<input
																	type="checkbox"
																	class="checkbox-input"
																	checked={hook.streamStdinJson || false}
																	onchange={(e) =>
																		updateHookCommand(
																			eventType.id,
																			entryIndex,
																			hookIndex,
																			'streamStdinJson',
																			e.currentTarget.checked
																		)}
																/>
																<span>Stream JSON to stdin</span>
															</label>
														</div>
													</div>
												</div>
											{/each}

											<!-- Add Hook Button -->
											<button
												class="add-hook-btn"
												onclick={() => addHookCommand(eventType.id, entryIndex)}
											>
												<svg
													class="w-4 h-4"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M12 4v16m8-8H4"
													/>
												</svg>
												Add another hook command
											</button>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.hooks-editor {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* Loading State */
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 1rem;
		gap: 1rem;
	}

	.loading-spinner {
		width: 32px;
		height: 32px;
		border: 3px solid oklch(0.3 0.02 250);
		border-top-color: oklch(0.65 0.15 200);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.loading-text {
		font-size: 0.85rem;
		color: oklch(0.55 0.02 250);
		margin: 0;
	}

	/* Error State */
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 1rem;
		gap: 0.5rem;
		color: oklch(0.5 0.02 250);
	}

	.error-icon {
		width: 48px;
		height: 48px;
		color: oklch(0.6 0.15 25);
		margin-bottom: 0.5rem;
	}

	.error-title {
		font-size: 0.9rem;
		font-weight: 500;
		color: oklch(0.7 0.12 25);
		margin: 0;
	}

	.error-message {
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
		margin: 0;
		text-align: center;
	}

	.retry-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-top: 1rem;
		padding: 0.5rem 1rem;
		font-size: 0.8rem;
		font-weight: 500;
		background: oklch(0.3 0.08 200);
		border: 1px solid oklch(0.4 0.1 200);
		border-radius: 6px;
		color: oklch(0.85 0.08 200);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.retry-btn:hover {
		background: oklch(0.35 0.1 200);
	}

	/* Editor Content */
	.editor-content {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* Editor Header */
	.editor-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.header-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.file-path {
		font-family: ui-monospace, monospace;
		font-size: 0.85rem;
		color: oklch(0.6 0.02 250);
	}

	.unsaved-badge {
		font-size: 0.7rem;
		font-weight: 500;
		padding: 0.2rem 0.5rem;
		background: oklch(0.65 0.15 85 / 0.2);
		color: oklch(0.8 0.12 85);
		border-radius: 4px;
	}

	.validation-error-badge {
		font-size: 0.7rem;
		font-weight: 500;
		padding: 0.2rem 0.5rem;
		background: oklch(0.6 0.15 25 / 0.2);
		color: oklch(0.75 0.12 25);
		border-radius: 4px;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.save-success {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.8rem;
		color: oklch(0.7 0.15 145);
	}

	.save-error {
		font-size: 0.8rem;
		color: oklch(0.7 0.15 25);
	}

	.reset-btn {
		padding: 0.4rem 0.75rem;
		font-size: 0.8rem;
		font-weight: 500;
		background: transparent;
		border: 1px solid oklch(0.35 0.02 250);
		border-radius: 6px;
		color: oklch(0.65 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.reset-btn:hover:not(:disabled) {
		background: oklch(0.2 0.02 250);
		border-color: oklch(0.4 0.02 250);
	}

	.reset-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.save-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.4rem 0.75rem;
		font-size: 0.8rem;
		font-weight: 500;
		background: oklch(0.5 0.15 200);
		border: none;
		border-radius: 6px;
		color: white;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.save-btn:hover:not(:disabled) {
		background: oklch(0.55 0.17 200);
	}

	.save-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid white;
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	/* Event Types */
	.event-types {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.event-type-card {
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 8px;
		overflow: hidden;
	}

	.event-type-card.has-hooks {
		border-color: oklch(0.35 0.08 200);
	}

	.event-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		padding: 0.75rem 1rem;
		background: transparent;
		transition: background 0.15s ease;
	}

	.event-header:hover {
		background: oklch(0.18 0.02 250);
	}

	.event-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		padding: 0;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
	}

	.expand-icon {
		width: 16px;
		height: 16px;
		color: oklch(0.5 0.02 250);
		transition: transform 0.2s ease;
	}

	.expand-icon.expanded {
		transform: rotate(90deg);
	}

	.event-label {
		font-size: 0.9rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.event-count {
		font-size: 0.75rem;
		color: oklch(0.6 0.12 200);
		margin-left: 0.5rem;
	}

	.event-empty {
		font-size: 0.75rem;
		color: oklch(0.45 0.02 250);
		margin-left: 0.5rem;
	}

	.event-description {
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
		padding: 0 1rem 0.5rem;
		margin: 0;
	}

	.add-entry-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: oklch(0.25 0.08 200);
		border: 1px solid oklch(0.35 0.1 200);
		border-radius: 6px;
		color: oklch(0.75 0.1 200);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.add-entry-btn:hover {
		background: oklch(0.3 0.1 200);
	}

	/* Entries List */
	.entries-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0 0.75rem 0.75rem;
	}

	.entry-card {
		background: oklch(0.13 0.02 250);
		border: 1px solid oklch(0.22 0.02 250);
		border-radius: 6px;
		padding: 0.75rem;
	}

	.entry-header {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.entry-matcher {
		flex: 1;
	}

	.matcher-label {
		display: block;
		font-size: 0.7rem;
		font-weight: 500;
		color: oklch(0.55 0.02 250);
		margin-bottom: 0.25rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.matcher-input {
		width: 100%;
		padding: 0.4rem 0.6rem;
		font-family: ui-monospace, monospace;
		font-size: 0.85rem;
		background: oklch(0.1 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 4px;
		color: oklch(0.9 0.02 250);
		transition: border-color 0.15s ease;
	}

	.matcher-input:focus {
		outline: none;
		border-color: oklch(0.5 0.15 200);
	}

	.matcher-input.has-error {
		border-color: oklch(0.6 0.15 25);
		background: oklch(0.6 0.15 25 / 0.05);
	}

	.remove-entry-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: transparent;
		border: 1px solid oklch(0.3 0.02 250);
		border-radius: 4px;
		color: oklch(0.5 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
		margin-top: 1rem;
	}

	.remove-entry-btn:hover {
		background: oklch(0.6 0.15 25 / 0.15);
		border-color: oklch(0.6 0.12 25);
		color: oklch(0.7 0.12 25);
	}

	/* Hooks List */
	.hooks-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.hook-card {
		background: oklch(0.11 0.02 250);
		border: 1px solid oklch(0.2 0.02 250);
		border-radius: 4px;
		padding: 0.6rem;
	}

	.hook-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.hook-index {
		font-size: 0.7rem;
		font-weight: 600;
		color: oklch(0.55 0.02 250);
		text-transform: uppercase;
	}

	.remove-hook-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		background: transparent;
		border: none;
		color: oklch(0.45 0.02 250);
		cursor: pointer;
		transition: color 0.15s ease;
	}

	.remove-hook-btn:hover {
		color: oklch(0.65 0.12 25);
	}

	.hook-fields {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.field-group {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.field-label {
		font-size: 0.7rem;
		font-weight: 500;
		color: oklch(0.5 0.02 250);
	}

	.field-input {
		width: 100%;
		padding: 0.35rem 0.5rem;
		font-size: 0.8rem;
		background: oklch(0.08 0.02 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 4px;
		color: oklch(0.85 0.02 250);
		transition: border-color 0.15s ease;
	}

	.field-input:focus {
		outline: none;
		border-color: oklch(0.5 0.15 200);
	}

	.field-input.has-error {
		border-color: oklch(0.6 0.15 25);
		background: oklch(0.6 0.15 25 / 0.05);
	}

	.field-error {
		display: block;
		font-size: 0.7rem;
		color: oklch(0.7 0.15 25);
		margin-top: 0.25rem;
	}

	.field-input.font-mono {
		font-family: ui-monospace, monospace;
	}

	.field-group-inline {
		display: flex;
		align-items: center;
		margin-top: 0.25rem;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: oklch(0.65 0.02 250);
		cursor: pointer;
	}

	.checkbox-input {
		width: 14px;
		height: 14px;
		accent-color: oklch(0.55 0.15 200);
		cursor: pointer;
	}

	.add-hook-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		padding: 0.4rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 500;
		background: transparent;
		border: 1px dashed oklch(0.3 0.02 250);
		border-radius: 4px;
		color: oklch(0.55 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.add-hook-btn:hover {
		border-color: oklch(0.45 0.1 200);
		color: oklch(0.65 0.1 200);
		background: oklch(0.55 0.15 200 / 0.05);
	}

	/* Responsive */
	@media (max-width: 640px) {
		.editor-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.header-actions {
			width: 100%;
			justify-content: flex-end;
		}

		.event-header {
			padding: 0.6rem 0.75rem;
		}

		.event-label {
			font-size: 0.85rem;
		}
	}
</style>
