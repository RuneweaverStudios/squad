<script lang="ts">
	/**
	 * HooksEditor Component
	 *
	 * Form-based editor for Claude Code hooks configuration (.claude/settings.json).
	 * Provides visual editing of PreToolUse, PostToolUse, UserPromptSubmit, PreCompact,
	 * and SessionStart hooks with add/remove/edit capabilities.
	 *
	 * @see ide/src/lib/types/config.ts for type definitions
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
	import HookTester from './HookTester.svelte';
	import ScriptEditorDrawer from './ScriptEditorDrawer.svelte';
	import { successToast, errorToast } from '$lib/stores/toasts.svelte';

	// Validation result type for command paths
	interface CommandValidation {
		type: 'error' | 'warning' | 'success';
		message: string;
		suggestions?: string[];
		isValidating?: boolean;
		// Enhanced validation fields
		warnings?: string[];
		fixes?: { description: string; command: string }[];
		hasShebang?: boolean;
		scriptType?: string;
		isFullyValid?: boolean;
	}

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
	let showTester = $state(false);
	let selectedTestEventType = $state<HookEventType>('PostToolUse');

	// Script editor drawer state
	let scriptEditorOpen = $state(false);
	let scriptEditorPath = $state('');

	// Inline validation errors per field
	let matcherErrors = $state<Map<string, string>>(new Map());  // key: `${eventType}-${entryIndex}`
	let commandValidations = $state<Map<string, CommandValidation>>(new Map()); // key: `${eventType}-${entryIndex}-${hookIndex}`

	// Debounce timers for async validation
	let validationTimers = new Map<string, ReturnType<typeof setTimeout>>();

	// Legacy alias for backward compatibility in hasValidationErrors
	const commandErrors = $derived(
		new Map([...commandValidations].filter(([_, v]) => v.type === 'error').map(([k, v]) => [k, v.message]))
	);

	// Track if there are unsaved changes
	const hasChanges = $derived(JSON.stringify(hooks) !== JSON.stringify(originalHooks));

	// Check if there are any validation errors
	const hasValidationErrors = $derived(matcherErrors.size > 0 || commandErrors.size > 0);

	// Search state
	let searchQuery = $state('');
	let searchInput: HTMLInputElement;

	// Highlight matching text in a string (reused from CommandsList pattern)
	function highlightMatch(text: string, query: string): { text: string; isMatch: boolean }[] {
		if (!query.trim()) {
			return [{ text, isMatch: false }];
		}
		const lowerText = text.toLowerCase();
		const lowerQuery = query.toLowerCase();
		const index = lowerText.indexOf(lowerQuery);
		if (index === -1) {
			return [{ text, isMatch: false }];
		}
		const result: { text: string; isMatch: boolean }[] = [];
		if (index > 0) {
			result.push({ text: text.substring(0, index), isMatch: false });
		}
		result.push({ text: text.substring(index, index + query.length), isMatch: true });
		if (index + query.length < text.length) {
			result.push({ text: text.substring(index + query.length), isMatch: false });
		}
		return result;
	}

	// Check if an entry matches the search query
	function entryMatchesSearch(entry: HookEntry, query: string): boolean {
		if (!query.trim()) return true;
		const q = query.toLowerCase();
		if (entry.matcher.toLowerCase().includes(q)) return true;
		for (const hook of entry.hooks) {
			if (hook.command.toLowerCase().includes(q)) return true;
			if (hook.statusMessage?.toLowerCase().includes(q)) return true;
		}
		return false;
	}

	// Filter hooks based on search query - returns original indices for editing
	function getFilteredEntryIndices(eventType: HookEventType, query: string): number[] {
		if (!query.trim()) {
			const entries = hooks[eventType] || [];
			return entries.map((_, i) => i);
		}
		const entries = hooks[eventType] || [];
		const indices: number[] = [];
		entries.forEach((entry, i) => {
			if (entryMatchesSearch(entry, query)) {
				indices.push(i);
			}
		});
		return indices;
	}

	// Check if event type has any matching entries
	function eventTypeHasMatches(eventType: HookEventType, query: string): boolean {
		if (!query.trim()) return true;
		const entries = hooks[eventType] || [];
		return entries.some(entry => entryMatchesSearch(entry, query));
	}

	// Get total entry count across all event types
	const totalEntryCount = $derived.by(() => {
		let count = 0;
		for (const eventType of Object.keys(hooks) as HookEventType[]) {
			count += hooks[eventType]?.length || 0;
		}
		return count;
	});

	// Get filtered entry count
	const filteredEntryCount = $derived.by(() => {
		if (!searchQuery.trim()) return totalEntryCount;
		let count = 0;
		for (const eventType of Object.keys(hooks) as HookEventType[]) {
			count += getFilteredEntryIndices(eventType, searchQuery).length;
		}
		return count;
	});

	const isFiltered = $derived(searchQuery.trim().length > 0);

	// Clear search
	function clearSearch() {
		searchQuery = '';
		searchInput?.focus();
	}

	// Open script editor drawer for a file
	function openScriptEditor(path: string) {
		// Resolve relative paths to absolute paths for the API
		if (path.startsWith('./') || path.startsWith('../')) {
			// For relative paths, we need to resolve them
			// The hooks are typically relative to the project root
			scriptEditorPath = path;
		} else {
			scriptEditorPath = path;
		}
		scriptEditorOpen = true;
	}

	// Handle script editor close
	function handleScriptEditorClose() {
		scriptEditorOpen = false;
		scriptEditorPath = '';
	}

	// Handle script save (could trigger re-validation)
	function handleScriptSave(path: string, content: string) {
		// Optionally refresh validation for any commands using this path
		successToast('Script saved');
	}

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

	// Validate command path (sync basic validation)
	function validateCommandSync(command: string): CommandValidation | null {
		if (!command.trim()) {
			return { type: 'error', message: 'Command path is required' };
		}
		// Warn about potentially problematic paths
		if (command.includes(' ') && !command.startsWith('"') && !command.startsWith("'")) {
			return { type: 'warning', message: 'Path contains spaces - consider quoting' };
		}
		return null;
	}

	// Validate command path (async with path existence check)
	async function validateCommandAsync(key: string, command: string): Promise<void> {
		const trimmedCommand = command.trim();

		// Skip empty commands (already handled by sync validation)
		if (!trimmedCommand) return;

		// Set loading state
		const newValidations = new Map(commandValidations);
		newValidations.set(key, { type: 'warning', message: 'Checking path...', isValidating: true });
		commandValidations = newValidations;

		try {
			const response = await fetch('/api/hooks/validate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ command: trimmedCommand })
			});

			const result = await response.json();

			const updatedValidations = new Map(commandValidations);

			if (result.error) {
				// API returned an error (file not found, etc.)
				updatedValidations.set(key, {
					type: 'error',
					message: result.error,
					suggestions: result.suggestions
				});
			} else if (result.valid) {
				// Path exists - check for warnings
				if (result.warnings && result.warnings.length > 0) {
					// Has warnings (not executable, missing shebang, etc.)
					updatedValidations.set(key, {
						type: 'warning',
						message: result.warnings[0], // Primary warning
						warnings: result.warnings,
						fixes: result.fixes,
						hasShebang: result.hasShebang,
						scriptType: result.scriptType,
						isFullyValid: result.isFullyValid
					});
				} else if (result.isFullyValid) {
					// Fully valid - clear validation (show success state)
					updatedValidations.set(key, {
						type: 'success',
						message: 'Script is valid and executable',
						hasShebang: result.hasShebang,
						scriptType: result.scriptType,
						isFullyValid: true
					});
				} else {
					// Valid but no specific warnings - clear
					updatedValidations.delete(key);
				}
			} else {
				// Path doesn't exist or other issue
				updatedValidations.set(key, {
					type: 'error',
					message: result.error || 'Invalid path',
					suggestions: result.suggestions
				});
			}

			commandValidations = updatedValidations;
		} catch (err) {
			// Network error - don't block, just show warning
			const updatedValidations = new Map(commandValidations);
			updatedValidations.set(key, {
				type: 'warning',
				message: 'Could not verify path (network error)'
			});
			commandValidations = updatedValidations;
		}
	}

	// Debounced async validation
	function scheduleAsyncValidation(key: string, command: string): void {
		// Clear existing timer for this key
		if (validationTimers.has(key)) {
			clearTimeout(validationTimers.get(key)!);
		}

		// Schedule new validation after 500ms debounce
		const timer = setTimeout(() => {
			validationTimers.delete(key);
			validateCommandAsync(key, command);
		}, 500);

		validationTimers.set(key, timer);
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
			const syncResult = validateCommandSync(value as string);

			// Apply sync validation immediately
			const newValidations = new Map(commandValidations);
			if (syncResult) {
				newValidations.set(key, syncResult);
			} else {
				// No sync error, schedule async validation
				newValidations.delete(key);
			}
			commandValidations = newValidations;

			// If sync validation passed, schedule async path check
			if (!syncResult || syncResult.type !== 'error') {
				scheduleAsyncValidation(key, value as string);
			}
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
				successToast('Hooks saved successfully', 'Configuration updated in .claude/settings.json');
				setTimeout(() => {
					saveSuccess = false;
				}, 2000);
			} else {
				saveError = 'Failed to save hooks';
				errorToast('Failed to save hooks', 'An error occurred while saving the configuration');
			}
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'Failed to save hooks';
			errorToast('Failed to save hooks', saveError);
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
		commandValidations = new Map();
		// Clear any pending validation timers
		for (const timer of validationTimers.values()) {
			clearTimeout(timer);
		}
		validationTimers.clear();
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

				<!-- Search Input -->
				<div class="search-container">
					<div class="search-input-wrapper">
						<svg class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
						</svg>
						<input
							type="text"
							class="search-input"
							placeholder="Search hooks..."
							bind:value={searchQuery}
							bind:this={searchInput}
						/>
						{#if searchQuery}
							<button class="clear-search-btn" onclick={clearSearch} title="Clear search">
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						{/if}
					</div>
					{#if isFiltered}
						<span class="filter-count">
							{filteredEntryCount} of {totalEntryCount} entries
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

			<!-- Hook Tester Toggle -->
			<div class="tester-toggle-section">
				<button
					class="tester-toggle-btn"
					onclick={() => showTester = !showTester}
					aria-expanded={showTester}
				>
					<svg
						class="expand-icon"
						class:expanded={showTester}
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
					<span class="tester-toggle-label">🧪 Hook Tester</span>
					<span class="tester-toggle-hint">Test hooks against sample tool calls</span>
				</button>
			</div>

			<!-- Hook Tester Panel -->
			{#if showTester}
				<div class="tester-panel" transition:slide={{ duration: 200 }}>
					<HookTester
						hooksConfig={hooks}
						selectedEventType={selectedTestEventType}
						onEventTypeChange={(eventType) => selectedTestEventType = eventType}
					/>
				</div>
			{/if}

			<!-- Hook Event Types -->
			<div class="event-types">
				{#each hookEventTypes as eventType}
					{@const entryCount = getEntryCount(eventType.id)}
					{@const hookCount = getHookCount(eventType.id)}
					{@const isExpanded = expandedEvents.has(eventType.id)}
					{@const hasMatches = eventTypeHasMatches(eventType.id, searchQuery)}
					{@const filteredIndices = getFilteredEntryIndices(eventType.id, searchQuery)}

					<!-- Hide event types with no matches when filtering -->
					{#if !isFiltered || hasMatches}
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
								{#each filteredIndices as entryIndex (entryIndex)}
									{@const entry = hooks[eventType.id][entryIndex]}
									{@const matcherKey = `${eventType.id}-${entryIndex}`}
									{@const matcherError = matcherErrors.get(matcherKey)}
									{@const matcherSegments = highlightMatch(entry.matcher, searchQuery)}
									{@const matcherHasMatch = searchQuery && matcherSegments.some(s => s.isMatch)}
									<div class="entry-card" transition:slide={{ duration: 150 }}>
										<div class="entry-header">
											<div class="entry-matcher">
												<label class="matcher-label">
													Matcher (regex)
													{#if matcherHasMatch}
														<span class="match-indicator">match</span>
													{/if}
												</label>
												<input
													type="text"
													class="matcher-input"
													class:has-error={!!matcherError}
													class:has-match={matcherHasMatch}
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
													<div class="field-feedback is-error">
														<span class="feedback-icon">
															<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
															</svg>
														</span>
														<span class="feedback-message">{matcherError}</span>
													</div>
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
												{@const commandValidation = commandValidations.get(commandKey)}
												{@const commandSegments = highlightMatch(hook.command, searchQuery)}
												{@const commandHasMatch = searchQuery && commandSegments.some(s => s.isMatch)}
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
															<label class="field-label">
																Command
																{#if commandHasMatch}
																	<span class="match-indicator">match</span>
																{/if}
															</label>
															<div class="command-input-wrapper">
																<input
																	type="text"
																	class="field-input font-mono"
																	class:has-error={commandValidation?.type === 'error'}
																	class:has-warning={commandValidation?.type === 'warning'}
																	class:has-match={commandHasMatch}
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
																{#if hook.command && (hook.command.startsWith('./') || hook.command.startsWith('/') || hook.command.startsWith('~/') || hook.command.startsWith('../')) && commandValidation?.type !== 'error'}
																	<button
																		type="button"
																		class="edit-script-btn"
																		onclick={() => openScriptEditor(hook.command)}
																		title="Edit script file"
																	>
																		<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
																		</svg>
																	</button>
																{/if}
																{#if commandValidation?.isValidating}
																	<span class="validation-spinner"></span>
																{/if}
															</div>
															{#if commandValidation}
																<div class="field-feedback" class:is-error={commandValidation.type === 'error'} class:is-warning={commandValidation.type === 'warning'} class:is-success={commandValidation.type === 'success'}>
																	<span class="feedback-icon">
																		{#if commandValidation.type === 'error'}
																			<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
																			</svg>
																		{:else if commandValidation.type === 'success'}
																			<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
																			</svg>
																		{:else}
																			<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
																			</svg>
																		{/if}
																	</span>
																	<span class="feedback-message">{commandValidation.message}</span>
																	{#if commandValidation.scriptType}
																		<span class="script-type-badge">{commandValidation.scriptType}</span>
																	{/if}
																</div>
																<!-- Show all warnings if multiple -->
																{#if commandValidation.warnings && commandValidation.warnings.length > 1}
																	<div class="warnings-list">
																		{#each commandValidation.warnings.slice(1) as warning}
																			<div class="warning-item">
																				<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
																				</svg>
																				<span>{warning}</span>
																			</div>
																		{/each}
																	</div>
																{/if}
																<!-- Actionable fixes -->
																{#if commandValidation.fixes && commandValidation.fixes.length > 0}
																	<div class="fixes-list">
																		<span class="fixes-label">Quick fixes:</span>
																		{#each commandValidation.fixes as fix}
																			<div class="fix-item">
																				<span class="fix-description">{fix.description}</span>
																				<button
																					type="button"
																					class="fix-copy-btn"
																					onclick={() => navigator.clipboard.writeText(fix.command)}
																					title="Copy command to clipboard"
																				>
																					<code class="fix-command">{fix.command}</code>
																					<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
																					</svg>
																				</button>
																			</div>
																		{/each}
																	</div>
																{/if}
																{#if commandValidation.suggestions && commandValidation.suggestions.length > 0}
																	<div class="path-suggestions">
																		<span class="suggestions-label">Did you mean:</span>
																		{#each commandValidation.suggestions as suggestion}
																			<button
																				type="button"
																				class="suggestion-btn"
																				onclick={() => updateHookCommand(eventType.id, entryIndex, hookIndex, 'command', suggestion)}
																			>
																				{suggestion}
																			</button>
																		{/each}
																	</div>
																{/if}
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
					{/if}
				{/each}
			</div>
		</div>
	{/if}
</div>

<!-- Script Editor Drawer -->
<ScriptEditorDrawer
	bind:isOpen={scriptEditorOpen}
	filePath={scriptEditorPath}
	onClose={handleScriptEditorClose}
	onSave={handleScriptSave}
/>

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

	/* Search Styles */
	.search-container {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.search-input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.search-icon {
		position: absolute;
		left: 0.6rem;
		width: 16px;
		height: 16px;
		color: oklch(0.5 0.02 250);
		pointer-events: none;
	}

	.search-input {
		width: 180px;
		padding: 0.4rem 2rem 0.4rem 2rem;
		font-size: 0.8rem;
		background: oklch(0.15 0.02 250);
		border: 1px solid oklch(0.3 0.02 250);
		border-radius: 6px;
		color: oklch(0.9 0.02 250);
		transition: all 0.15s ease;
	}

	.search-input:focus {
		outline: none;
		border-color: oklch(0.5 0.15 200);
		background: oklch(0.12 0.02 250);
	}

	.search-input::placeholder {
		color: oklch(0.45 0.02 250);
	}

	.clear-search-btn {
		position: absolute;
		right: 0.4rem;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		padding: 0;
		background: transparent;
		border: none;
		color: oklch(0.5 0.02 250);
		cursor: pointer;
		transition: color 0.15s ease;
	}

	.clear-search-btn:hover {
		color: oklch(0.7 0.02 250);
	}

	.filter-count {
		font-size: 0.7rem;
		color: oklch(0.6 0.12 200);
		white-space: nowrap;
	}

	/* Highlight styles for search matches */
	.highlight-match {
		background: oklch(0.6 0.2 90 / 0.3);
		color: oklch(0.9 0.15 90);
		border-radius: 2px;
		padding: 0 2px;
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

	/* Hook Tester Toggle */
	.tester-toggle-section {
		margin-bottom: 0.5rem;
	}

	.tester-toggle-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.75rem 1rem;
		background: oklch(0.18 0.02 250);
		border: 1px dashed oklch(0.35 0.08 180);
		border-radius: 8px;
		cursor: pointer;
		text-align: left;
		transition: all 0.15s ease;
	}

	.tester-toggle-btn:hover {
		background: oklch(0.20 0.03 180);
		border-color: oklch(0.45 0.1 180);
	}

	.tester-toggle-label {
		font-size: 0.9rem;
		font-weight: 600;
		color: oklch(0.85 0.08 180);
	}

	.tester-toggle-hint {
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
		margin-left: auto;
	}

	.tester-panel {
		margin-bottom: 1rem;
		background: oklch(0.14 0.02 250);
		border: 1px solid oklch(0.28 0.06 180);
		border-radius: 8px;
		padding: 1rem;
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

	.matcher-input.has-match {
		border-color: oklch(0.65 0.15 90);
		background: oklch(0.65 0.15 90 / 0.05);
	}

	.match-indicator {
		display: inline-flex;
		font-size: 0.6rem;
		font-weight: 600;
		padding: 0.1rem 0.3rem;
		background: oklch(0.6 0.2 90 / 0.3);
		color: oklch(0.9 0.15 90);
		border-radius: 3px;
		margin-left: 0.5rem;
		text-transform: lowercase;
		letter-spacing: normal;
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

	.field-input.has-warning {
		border-color: oklch(0.7 0.15 85);
		background: oklch(0.7 0.15 85 / 0.05);
	}

	.field-input.has-match {
		border-color: oklch(0.65 0.15 90);
		background: oklch(0.65 0.15 90 / 0.05);
	}

	.field-input.font-mono {
		font-family: ui-monospace, monospace;
	}

	/* Command input wrapper for spinner positioning */
	.command-input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.command-input-wrapper .field-input {
		padding-right: 2rem;
	}

	.validation-spinner {
		position: absolute;
		right: 0.5rem;
		width: 14px;
		height: 14px;
		border: 2px solid oklch(0.3 0.02 250);
		border-top-color: oklch(0.65 0.15 200);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	/* Edit script button */
	.edit-script-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		margin-left: 0.5rem;
		padding: 0;
		background: oklch(0.22 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 4px;
		color: oklch(0.65 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.edit-script-btn:hover {
		background: oklch(0.28 0.02 250);
		border-color: oklch(0.45 0.15 200);
		color: oklch(0.80 0.15 200);
	}

	.edit-script-btn:active {
		transform: scale(0.95);
	}

	/* Unified feedback for errors and warnings */
	.field-feedback {
		display: flex;
		align-items: flex-start;
		gap: 0.35rem;
		margin-top: 0.35rem;
		padding: 0.35rem 0.5rem;
		border-radius: 4px;
		font-size: 0.7rem;
	}

	.field-feedback.is-error {
		background: oklch(0.6 0.15 25 / 0.1);
		color: oklch(0.75 0.15 25);
	}

	.field-feedback.is-warning {
		background: oklch(0.7 0.15 85 / 0.1);
		color: oklch(0.75 0.12 85);
	}

	.field-feedback.is-success {
		background: oklch(0.55 0.15 145 / 0.1);
		color: oklch(0.7 0.15 145);
	}

	.feedback-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}

	.feedback-message {
		line-height: 1.4;
	}

	/* Script type badge */
	.script-type-badge {
		margin-left: auto;
		padding: 0.1rem 0.4rem;
		font-size: 0.65rem;
		font-weight: 600;
		font-family: ui-monospace, monospace;
		background: oklch(0.25 0.08 200);
		color: oklch(0.75 0.1 200);
		border-radius: 3px;
		text-transform: uppercase;
	}

	/* Warnings list for multiple warnings */
	.warnings-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-top: 0.25rem;
		padding: 0.35rem 0.5rem;
		background: oklch(0.7 0.15 85 / 0.05);
		border-radius: 4px;
		font-size: 0.7rem;
	}

	.warning-item {
		display: flex;
		align-items: flex-start;
		gap: 0.35rem;
		color: oklch(0.7 0.12 85);
	}

	.warning-item svg {
		flex-shrink: 0;
		margin-top: 0.1rem;
	}

	/* Fixes list with copy buttons */
	.fixes-list {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin-top: 0.35rem;
		padding: 0.5rem;
		background: oklch(0.18 0.03 200);
		border: 1px solid oklch(0.28 0.06 200);
		border-radius: 4px;
		font-size: 0.7rem;
	}

	.fixes-label {
		font-weight: 600;
		color: oklch(0.65 0.1 200);
		margin-bottom: 0.15rem;
	}

	.fix-item {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.fix-description {
		color: oklch(0.6 0.02 250);
	}

	.fix-copy-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.5rem;
		background: oklch(0.12 0.02 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.fix-copy-btn:hover {
		background: oklch(0.15 0.02 250);
		border-color: oklch(0.35 0.08 200);
	}

	.fix-command {
		flex: 1;
		font-family: ui-monospace, monospace;
		font-size: 0.7rem;
		color: oklch(0.75 0.08 200);
		word-break: break-all;
	}

	.fix-copy-btn svg {
		flex-shrink: 0;
		color: oklch(0.5 0.02 250);
	}

	.fix-copy-btn:hover svg {
		color: oklch(0.7 0.1 200);
	}

	/* Path suggestions */
	.path-suggestions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
		margin-top: 0.35rem;
		padding: 0.35rem 0.5rem;
		background: oklch(0.2 0.02 250);
		border-radius: 4px;
		font-size: 0.7rem;
	}

	.suggestions-label {
		color: oklch(0.55 0.02 250);
		font-weight: 500;
	}

	.suggestion-btn {
		display: inline-flex;
		padding: 0.2rem 0.5rem;
		font-family: ui-monospace, monospace;
		font-size: 0.7rem;
		background: oklch(0.25 0.08 200);
		border: 1px solid oklch(0.35 0.1 200);
		border-radius: 3px;
		color: oklch(0.8 0.1 200);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.suggestion-btn:hover {
		background: oklch(0.3 0.1 200);
		border-color: oklch(0.45 0.12 200);
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
