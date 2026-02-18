<script lang="ts">
	/**
	 * RuleEditor Component
	 *
	 * Modal dialog for creating and editing automation rules.
	 * Provides form fields for all rule properties with validation.
	 *
	 * Features:
	 * - Name and description fields
	 * - Pattern textarea with regex/string toggle
	 * - Case sensitivity toggle
	 * - Session state filter (multi-select)
	 * - Action type dropdown with payload input
	 * - Timing controls (delay, cooldown, maxTriggers)
	 * - Category and priority settings
	 * - Validation before save
	 * - Create/Edit modes
	 */

	import type {
		AutomationRule,
		AutomationPattern,
		AutomationAction,
		ActionType,
		PatternMode,
		RuleCategory,
		QuestionUIConfig,
		QuestionUIOption
	} from '$lib/types/automation';
	import { RULE_CATEGORY_META } from '$lib/config/automationConfig';
	import { SESSION_STATE_VISUALS } from '$lib/config/statusColors';
	import { fly, fade } from 'svelte/transition';

	// =============================================================================
	// PROPS
	// =============================================================================

	interface Props {
		/** Whether the modal is open */
		isOpen?: boolean;
		/** Rule to edit (null for create mode) */
		rule?: AutomationRule | null;
		/** Called when save button is clicked with valid rule */
		onSave?: (rule: AutomationRule) => void;
		/** Called when cancel/close is clicked */
		onCancel?: () => void;
		/** Custom class */
		class?: string;
	}

	let {
		isOpen = $bindable(false),
		rule = null,
		onSave = () => {},
		onCancel = () => {},
		class: className = ''
	}: Props = $props();

	// =============================================================================
	// STATE
	// =============================================================================

	// Form state - initialized from rule prop or defaults
	let formData = $state<{
		name: string;
		description: string;
		enabled: boolean;
		patterns: Array<{ pattern: string; mode: PatternMode; caseSensitive: boolean }>;
		actions: Array<{
			type: ActionType;
			payload: string;
			delay: number;
			questionUIConfig?: QuestionUIConfig;
		}>;
		sessionFilter: string[];
		cooldownSeconds: number;
		maxTriggersPerSession: number;
		category: RuleCategory;
		priority: number;
	}>({
		name: '',
		description: '',
		enabled: true,
		patterns: [{ pattern: '', mode: 'regex', caseSensitive: false }],
		actions: [{ type: 'notify_only', payload: '', delay: 0 }],
		sessionFilter: [],
		cooldownSeconds: 30,
		maxTriggersPerSession: 0,
		category: 'custom',
		priority: 50
	});

	// Validation errors
	let errors = $state<Record<string, string>>({});

	// Session state options for multi-select - use centralized visual config
	const sessionStates = [
		{ value: 'working', label: 'Working', visual: SESSION_STATE_VISUALS.working },
		{ value: 'idle', label: 'Idle', visual: SESSION_STATE_VISUALS.idle },
		{ value: 'needs-input', label: 'Needs Input', visual: SESSION_STATE_VISUALS['needs-input'] },
		{ value: 'ready-for-review', label: 'Ready for Review', visual: SESSION_STATE_VISUALS['ready-for-review'] },
		{ value: 'completing', label: 'Completing', visual: SESSION_STATE_VISUALS.completing },
		{ value: 'starting', label: 'Starting', visual: SESSION_STATE_VISUALS.starting }
	];

	// Action type options
	const actionTypes: Array<{ value: ActionType; label: string; description: string; icon: string }> = [
		{
			value: 'send_text',
			label: 'Send Text',
			description: 'Send text input to the session (like typing)',
			icon: 'M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5'
		},
		{
			value: 'send_keys',
			label: 'Send Keys',
			description: 'Send special keys (Enter, Escape, Tab, etc.)',
			icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z'
		},
		{
			value: 'tmux_command',
			label: 'Tmux Command',
			description: 'Run an arbitrary tmux command',
			icon: 'M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5A3.375 3.375 0 006.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0015 2.25h-1.5a2.251 2.251 0 00-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 00-9-9z'
		},
		{
			value: 'signal',
			label: 'Emit Signal',
			description: 'Emit a squad-signal event',
			icon: 'M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z'
		},
		{
			value: 'notify_only',
			label: 'Notify Only',
			description: 'Show a toast notification without taking action',
			icon: 'M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0'
		},
		{
			value: 'show_question_ui',
			label: 'Show Question UI',
			description: 'Show custom question UI with options (instead of auto-responding)',
			icon: 'M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z'
		},
		{
			value: 'run_command',
			label: 'Run Command',
			description: 'Run a Claude agent slash command (e.g., /squad:complete)',
			icon: 'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z'
		}
	];

	// Available slash commands (fetched from API)
	interface SlashCommand {
		name: string;
		invocation: string;
		namespace: string;
		path: string;
	}
	let availableCommands = $state<SlashCommand[]>([]);
	let commandsLoading = $state(false);
	let commandsError = $state<string | null>(null);

	// Fetch available commands when modal opens
	async function fetchCommands() {
		if (availableCommands.length > 0) return; // Already loaded
		commandsLoading = true;
		commandsError = null;
		try {
			const response = await fetch('/api/commands');
			if (!response.ok) throw new Error('Failed to fetch commands');
			const data = await response.json();
			availableCommands = data.commands || [];
		} catch (err) {
			commandsError = err instanceof Error ? err.message : 'Failed to load commands';
			console.error('Error fetching commands:', err);
		} finally {
			commandsLoading = false;
		}
	}

	// Question type options for show_question_ui
	const questionTypes: Array<{ value: 'choice' | 'confirm' | 'input'; label: string; description: string }> = [
		{ value: 'choice', label: 'Choice', description: 'Select from multiple options' },
		{ value: 'confirm', label: 'Confirm', description: 'Yes/No confirmation' },
		{ value: 'input', label: 'Input', description: 'Free text input' }
	];

	// Special keys for send_keys action
	const specialKeys = ['Enter', 'Escape', 'Tab', 'Up', 'Down', 'Left', 'Right', 'C-c', 'C-d', 'C-u'];

	// =============================================================================
	// COMPUTED
	// =============================================================================

	const isEditMode = $derived(rule !== null);
	const modalTitle = $derived(isEditMode ? 'Edit Automation Rule' : 'Create Automation Rule');

	// =============================================================================
	// EFFECTS
	// =============================================================================

	// Fetch commands when modal opens
	$effect(() => {
		if (isOpen) {
			fetchCommands();
		}
	});

	// Initialize form when rule prop changes
	$effect(() => {
		if (rule) {
			formData = {
				name: rule.name,
				description: rule.description || '',
				enabled: rule.enabled,
				patterns: rule.patterns.map(p => ({
					pattern: p.pattern,
					mode: p.mode,
					caseSensitive: p.caseSensitive ?? false
				})),
				actions: rule.actions.map(a => ({
					type: a.type,
					payload: a.payload,
					delay: a.delay ?? 0,
					questionUIConfig: a.questionUIConfig ? { ...a.questionUIConfig } : undefined
				})),
				sessionFilter: rule.sessionFilter || [],
				cooldownSeconds: rule.cooldownSeconds,
				maxTriggersPerSession: rule.maxTriggersPerSession,
				category: rule.category || 'custom',
				priority: rule.priority
			};
		} else {
			// Reset to defaults for create mode
			formData = {
				name: '',
				description: '',
				enabled: true,
				patterns: [{ pattern: '', mode: 'regex', caseSensitive: false }],
				actions: [{ type: 'notify_only', payload: '', delay: 0 }],
				sessionFilter: [],
				cooldownSeconds: 30,
				maxTriggersPerSession: 0,
				category: 'custom',
				priority: 50
			};
		}
		errors = {};
	});

	// =============================================================================
	// HANDLERS
	// =============================================================================

	function validate(): boolean {
		const newErrors: Record<string, string> = {};

		// Name is required
		if (!formData.name.trim()) {
			newErrors.name = 'Name is required';
		}

		// At least one pattern is required
		if (formData.patterns.length === 0 || !formData.patterns.some(p => p.pattern.trim())) {
			newErrors.patterns = 'At least one pattern is required';
		}

		// Validate regex patterns
		for (let i = 0; i < formData.patterns.length; i++) {
			const p = formData.patterns[i];
			if (p.mode === 'regex' && p.pattern.trim()) {
				try {
					new RegExp(p.pattern);
				} catch {
					newErrors[`pattern-${i}`] = 'Invalid regex pattern';
				}
			}
		}

		// At least one action is required
		if (formData.actions.length === 0) {
			newErrors.actions = 'At least one action is required';
		}

		// Validate show_question_ui actions have required fields
		for (let i = 0; i < formData.actions.length; i++) {
			const action = formData.actions[i];
			if (action.type === 'show_question_ui') {
				if (!action.questionUIConfig?.question?.trim()) {
					newErrors[`action-${i}-question`] = 'Question text is required';
				}
				if (action.questionUIConfig?.questionType === 'choice') {
					const options = action.questionUIConfig.options || [];
					if (options.length < 2) {
						newErrors[`action-${i}-options`] = 'At least 2 options are required for choice type';
					}
					for (let j = 0; j < options.length; j++) {
						if (!options[j].label?.trim()) {
							newErrors[`action-${i}-option-${j}-label`] = 'Option label is required';
						}
						if (!options[j].value?.trim()) {
							newErrors[`action-${i}-option-${j}-value`] = 'Option value is required';
						}
					}
				}
			}
		}

		// Cooldown must be non-negative
		if (formData.cooldownSeconds < 0) {
			newErrors.cooldown = 'Cooldown must be non-negative';
		}

		// Max triggers must be non-negative
		if (formData.maxTriggersPerSession < 0) {
			newErrors.maxTriggers = 'Max triggers must be non-negative';
		}

		errors = newErrors;
		return Object.keys(newErrors).length === 0;
	}

	function handleSave() {
		if (!validate()) return;

		const ruleData: AutomationRule = {
			id: rule?.id || `rule-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
			name: formData.name.trim(),
			description: formData.description.trim() || undefined,
			enabled: formData.enabled,
			patterns: formData.patterns
				.filter(p => p.pattern.trim())
				.map(p => ({
					pattern: p.pattern,
					mode: p.mode,
					caseSensitive: p.caseSensitive
				})),
			actions: formData.actions.map(a => ({
				type: a.type,
				payload: a.payload,
				delay: a.delay > 0 ? a.delay : undefined,
				questionUIConfig: a.type === 'show_question_ui' ? a.questionUIConfig : undefined
			})),
			sessionFilter: formData.sessionFilter.length > 0 ? formData.sessionFilter : undefined,
			cooldownSeconds: formData.cooldownSeconds,
			maxTriggersPerSession: formData.maxTriggersPerSession,
			category: formData.category,
			priority: formData.priority,
			isPreset: rule?.isPreset,
			presetId: rule?.presetId
		};

		onSave(ruleData);
		isOpen = false;
	}

	function handleCancel() {
		onCancel();
		isOpen = false;
	}

	function handleOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			handleCancel();
		}
	}

	// Pattern management
	function addPattern() {
		formData.patterns = [...formData.patterns, { pattern: '', mode: 'regex', caseSensitive: false }];
	}

	function removePattern(index: number) {
		if (formData.patterns.length > 1) {
			formData.patterns = formData.patterns.filter((_, i) => i !== index);
		}
	}

	// Action management
	function addAction() {
		formData.actions = [...formData.actions, { type: 'notify_only', payload: '', delay: 0 }];
	}

	function removeAction(index: number) {
		if (formData.actions.length > 1) {
			formData.actions = formData.actions.filter((_, i) => i !== index);
		}
	}

	// Question UI config management
	function initQuestionUIConfig(actionIndex: number) {
		if (!formData.actions[actionIndex].questionUIConfig) {
			formData.actions[actionIndex].questionUIConfig = {
				question: '',
				questionType: 'choice',
				options: [
					{ label: 'Option 1', value: '1', description: '' },
					{ label: 'Option 2', value: '2', description: '' }
				],
				timeout: undefined
			};
		}
	}

	function addQuestionOption(actionIndex: number) {
		const config = formData.actions[actionIndex].questionUIConfig;
		if (config && config.options) {
			const nextNum = config.options.length + 1;
			config.options = [...config.options, { label: `Option ${nextNum}`, value: String(nextNum), description: '' }];
		}
	}

	function removeQuestionOption(actionIndex: number, optionIndex: number) {
		const config = formData.actions[actionIndex].questionUIConfig;
		if (config && config.options && config.options.length > 1) {
			config.options = config.options.filter((_, i) => i !== optionIndex);
		}
	}

	// Handle action type change - initialize questionUIConfig when switching to show_question_ui
	function handleActionTypeChange(actionIndex: number, newType: ActionType) {
		formData.actions[actionIndex].type = newType;
		if (newType === 'show_question_ui') {
			initQuestionUIConfig(actionIndex);
		}
	}

	// State filter toggle
	function toggleStateFilter(state: string) {
		if (formData.sessionFilter.includes(state)) {
			formData.sessionFilter = formData.sessionFilter.filter(s => s !== state);
		} else {
			formData.sessionFilter = [...formData.sessionFilter, state];
		}
	}
</script>

{#if isOpen}
	<!-- Modal Overlay -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base-300/80 backdrop-blur-sm {className}"
		onclick={handleOverlayClick}
		onkeydown={(e) => e.key === 'Escape' && handleCancel()}
		role="dialog"
		aria-modal="true"
		aria-labelledby="rule-editor-title"
		tabindex="-1"
		transition:fade={{ duration: 150 }}
	>
		<!-- Modal Content -->
		<div
			class="flex flex-col w-full max-w-[700px] rounded-xl overflow-hidden bg-base-200 border border-base-300 shadow-2xl"
			style="max-height: calc(100vh - 2rem);"
			transition:fly={{ y: 20, duration: 200 }}
		>
			<!-- Header -->
			<header class="flex items-center justify-between px-5 py-4 bg-base-300 border-b border-base-300">
				<div class="flex items-center gap-3">
					<svg
						class="w-[22px] h-[22px] text-info"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d={RULE_CATEGORY_META[formData.category].icon} />
					</svg>
					<h2 id="rule-editor-title" class="text-base font-semibold text-base-content m-0 font-mono">{modalTitle}</h2>
				</div>
				<button
					class="flex items-center justify-center w-8 h-8 rounded-md bg-transparent border-none text-base-content/50 cursor-pointer transition-all duration-150 hover:bg-base-100 hover:text-base-content/80"
					onclick={handleCancel}
					aria-label="Close dialog"
				>
					<svg class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</header>

			<!-- Form Content -->
			<div class="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
				<!-- Basic Info Section -->
				<section class="p-4 rounded-[10px] bg-base-100 border border-base-300">
					<h3 class="text-xs font-semibold text-info uppercase tracking-wider font-mono m-0 mb-3">Basic Information</h3>

					<!-- Name -->
					<div class="mb-3.5">
						<label for="rule-name" class="block text-xs font-medium text-base-content/70 mb-1.5 font-mono">
							Name <span class="text-error">*</span>
						</label>
						<input
							id="rule-name"
							type="text"
							bind:value={formData.name}
							class="w-full py-2 px-3 text-sm font-mono rounded-md bg-base-300 border border-base-300 text-base-content transition-all duration-150 focus:outline-none focus:border-info {errors.name ? 'border-error' : ''}"
							placeholder="e.g., API Error Recovery"
						/>
						{#if errors.name}
							<span class="block text-[0.7rem] text-error mt-1 font-mono">{errors.name}</span>
						{/if}
					</div>

					<!-- Description -->
					<div class="mb-3.5">
						<label for="rule-description" class="block text-xs font-medium text-base-content/70 mb-1.5 font-mono">Description</label>
						<textarea
							id="rule-description"
							bind:value={formData.description}
							class="w-full py-2 px-3 text-sm font-mono rounded-md bg-base-300 border border-base-300 text-base-content transition-all duration-150 focus:outline-none focus:border-info resize-y min-h-[60px]"
							placeholder="Describe what this rule does..."
							rows="2"
						></textarea>
					</div>

					<!-- Category & Priority -->
					<div class="flex gap-4 items-start">
						<div class="mb-3.5 flex-1">
							<label for="rule-category" class="block text-xs font-medium text-base-content/70 mb-1.5 font-mono">Category</label>
							<select id="rule-category" bind:value={formData.category} class="w-full py-2 px-3 text-sm font-mono rounded-md bg-base-300 border border-base-300 text-base-content transition-all duration-150 focus:outline-none focus:border-info cursor-pointer">
								{#each Object.entries(RULE_CATEGORY_META) as [value, meta]}
									<option {value}>{meta.label}</option>
								{/each}
							</select>
						</div>
						<div class="mb-3.5 flex-1">
							<label for="rule-priority" class="block text-xs font-medium text-base-content/70 mb-1.5 font-mono">Priority</label>
							<input
								id="rule-priority"
								type="number"
								bind:value={formData.priority}
								class="w-full py-2 px-3 text-sm font-mono rounded-md bg-base-300 border border-base-300 text-base-content transition-all duration-150 focus:outline-none focus:border-info"
								min="0"
								max="100"
							/>
							<span class="block text-[0.65rem] text-base-content/50 mt-1 font-mono">Higher = processed first</span>
						</div>
						<div class="mb-3.5">
							<label class="block text-xs font-medium text-base-content/70 mb-1.5 font-mono">Enabled</label>
							<label class="inline-flex items-center cursor-pointer mt-1">
								<input
									type="checkbox"
									bind:checked={formData.enabled}
									class="sr-only peer"
								/>
								<span class="relative w-11 h-6 rounded-xl transition-all duration-200 bg-base-300 peer-checked:bg-success after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:transition-all after:duration-200 after:bg-base-content/70 peer-checked:after:left-[22px] peer-checked:after:bg-success-content"></span>
							</label>
						</div>
					</div>
				</section>

				<!-- Patterns Section -->
				<section class="p-4 rounded-[10px] bg-base-100 border border-base-300">
					<div class="flex items-center justify-between mb-3">
						<h3 class="text-xs font-semibold text-info uppercase tracking-wider font-mono m-0">Patterns</h3>
						<button class="inline-flex items-center gap-1.5 py-1.5 px-3 text-[0.7rem] font-mono rounded-md cursor-pointer bg-info/20 border border-info/40 text-info transition-all duration-150 hover:bg-info/30 hover:border-info/60" onclick={addPattern}>
							<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
							</svg>
							Add Pattern
						</button>
					</div>
					{#if errors.patterns}
						<span class="block text-[0.7rem] text-error mt-1 font-mono">{errors.patterns}</span>
					{/if}

					{#each formData.patterns as pattern, index}
						<div class="p-3.5 rounded-lg mb-3 bg-base-300 border border-base-300 last:mb-0">
							<div class="flex items-center justify-between mb-2">
								<span class="text-[0.7rem] font-semibold text-base-content/60 font-mono">Pattern {index + 1}</span>
								{#if formData.patterns.length > 1}
									<button
										class="flex items-center justify-center w-6 h-6 rounded bg-transparent border-none text-base-content/50 cursor-pointer transition-all duration-150 hover:bg-error/20 hover:text-error"
										onclick={() => removePattern(index)}
										aria-label="Remove pattern"
									>
										<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
										</svg>
									</button>
								{/if}
							</div>
							<textarea
								bind:value={pattern.pattern}
								class="w-full py-2 px-3 text-sm font-mono rounded-md bg-base-300 border border-base-300 text-base-content transition-all duration-150 focus:outline-none focus:border-info resize-y min-h-[60px] {errors[`pattern-${index}`] ? 'border-error' : ''}"
								placeholder="Enter pattern to match..."
								rows="2"
							></textarea>
							{#if errors[`pattern-${index}`]}
								<span class="block text-[0.7rem] text-error mt-1 font-mono">{errors[`pattern-${index}`]}</span>
							{/if}
							<div class="flex gap-4 mt-2">
								<label class="inline-flex items-center gap-1.5 cursor-pointer text-xs text-base-content/70 font-mono">
									<input
										type="checkbox"
										checked={pattern.mode === 'regex'}
										onchange={() => pattern.mode = pattern.mode === 'regex' ? 'string' : 'regex'}
										class="w-4 h-4 cursor-pointer accent-info"
									/>
									<span>Regex</span>
								</label>
								<label class="inline-flex items-center gap-1.5 cursor-pointer text-xs text-base-content/70 font-mono">
									<input type="checkbox" bind:checked={pattern.caseSensitive} class="w-4 h-4 cursor-pointer accent-info" />
									<span>Case Sensitive</span>
								</label>
							</div>
						</div>
					{/each}
				</section>

				<!-- Session State Filter Section -->
				<section class="p-4 rounded-[10px] bg-base-100 border border-base-300">
					<h3 class="text-xs font-semibold text-info uppercase tracking-wider font-mono m-0 mb-3">Session State Filter</h3>
					<p class="text-xs text-base-content/50 m-0 mb-3">Only trigger when session is in selected states (leave empty for all states)</p>

					<div class="flex flex-wrap gap-2">
						{#each sessionStates as state}
							<button
								class="py-1.5 px-3 text-[0.7rem] font-mono rounded-2xl cursor-pointer transition-all duration-150 {formData.sessionFilter.includes(state.value) ? '' : 'bg-base-300 border border-base-300 text-base-content/60 hover:bg-base-100 hover:border-base-content/30'}"
								style={formData.sessionFilter.includes(state.value) ? `background: ${state.visual.bgColor}; border: 1px solid ${state.visual.borderColor}; color: ${state.visual.textColor};` : ''}
								onclick={() => toggleStateFilter(state.value)}
							>
								{state.label}
							</button>
						{/each}
					</div>
				</section>

				<!-- Actions Section -->
				<section class="p-4 rounded-[10px] bg-base-100 border border-base-300">
					<div class="flex items-center justify-between mb-3">
						<h3 class="text-xs font-semibold text-info uppercase tracking-wider font-mono m-0">Actions</h3>
						<button class="inline-flex items-center gap-1.5 py-1.5 px-3 text-[0.7rem] font-mono rounded-md cursor-pointer bg-info/20 border border-info/40 text-info transition-all duration-150 hover:bg-info/30 hover:border-info/60" onclick={addAction}>
							<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
							</svg>
							Add Action
						</button>
					</div>
					{#if errors.actions}
						<span class="block text-[0.7rem] text-error mt-1 font-mono">{errors.actions}</span>
					{/if}

					{#each formData.actions as action, index}
						<div class="p-3.5 rounded-lg mb-3 bg-base-300 border border-base-300 last:mb-0">
							<div class="flex items-center justify-between mb-2">
								<span class="text-[0.7rem] font-semibold text-base-content/60 font-mono">Action {index + 1}</span>
								{#if formData.actions.length > 1}
									<button
										class="flex items-center justify-center w-6 h-6 rounded bg-transparent border-none text-base-content/50 cursor-pointer transition-all duration-150 hover:bg-error/20 hover:text-error"
										onclick={() => removeAction(index)}
										aria-label="Remove action"
									>
										<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
										</svg>
									</button>
								{/if}
							</div>

							<div class="flex gap-4 items-start">
								<div class="mb-3.5 flex-1">
									<label class="block text-xs font-medium text-base-content/70 mb-1.5 font-mono">Action Type</label>
									<select
										value={action.type}
										onchange={(e) => handleActionTypeChange(index, e.currentTarget.value as ActionType)}
										class="w-full py-2 px-3 text-sm font-mono rounded-md bg-base-300 border border-base-300 text-base-content transition-all duration-150 focus:outline-none focus:border-info cursor-pointer"
									>
										{#each actionTypes as actionType}
											<option value={actionType.value}>{actionType.label}</option>
										{/each}
									</select>
									<span class="block text-[0.65rem] text-base-content/50 mt-1 font-mono">
										{actionTypes.find(a => a.value === action.type)?.description}
									</span>
								</div>
								<div class="mb-3.5 w-28">
									<label class="block text-xs font-medium text-base-content/70 mb-1.5 font-mono">Delay (ms)</label>
									<input
										type="number"
										bind:value={action.delay}
										class="w-full py-2 px-3 text-sm font-mono rounded-md bg-base-300 border border-base-300 text-base-content transition-all duration-150 focus:outline-none focus:border-info"
										min="0"
										step="100"
										placeholder="0"
									/>
								</div>
							</div>

							<!-- Show Question UI Configuration -->
							{#if action.type === 'show_question_ui' && action.questionUIConfig}
								<div class="mt-3 p-3 rounded-lg bg-secondary/10 border border-secondary/20">
									<div class="mb-3.5">
										<label class="block text-xs font-medium text-base-content/70 mb-1.5 font-mono">Question Text <span class="text-error">*</span></label>
										<input
											type="text"
											bind:value={action.questionUIConfig.question}
											class="w-full py-2 px-3 text-sm font-mono rounded-md bg-base-300 border border-base-300 text-base-content transition-all duration-150 focus:outline-none focus:border-info {errors[`action-${index}-question`] ? 'border-error' : ''}"
											placeholder="e.g., Which approach should we use?"
										/>
										{#if errors[`action-${index}-question`]}
											<span class="block text-[0.7rem] text-error mt-1 font-mono">{errors[`action-${index}-question`]}</span>
										{/if}
									</div>

									<div class="flex gap-4 items-start">
										<div class="mb-3.5 flex-1">
											<label class="block text-xs font-medium text-base-content/70 mb-1.5 font-mono">Question Type</label>
											<select bind:value={action.questionUIConfig.questionType} class="w-full py-2 px-3 text-sm font-mono rounded-md bg-base-300 border border-base-300 text-base-content transition-all duration-150 focus:outline-none focus:border-info cursor-pointer">
												{#each questionTypes as qType}
													<option value={qType.value}>{qType.label}</option>
												{/each}
											</select>
											<span class="block text-[0.65rem] text-base-content/50 mt-1 font-mono">
												{questionTypes.find(q => q.value === action.questionUIConfig?.questionType)?.description}
											</span>
										</div>
										<div class="mb-3.5 w-28">
											<label class="block text-xs font-medium text-base-content/70 mb-1.5 font-mono">Timeout (s)</label>
											<input
												type="number"
												bind:value={action.questionUIConfig.timeout}
												class="w-full py-2 px-3 text-sm font-mono rounded-md bg-base-300 border border-base-300 text-base-content transition-all duration-150 focus:outline-none focus:border-info"
												min="0"
												step="10"
												placeholder="None"
											/>
										</div>
									</div>

									<!-- Options (for choice type) -->
									{#if action.questionUIConfig.questionType === 'choice'}
										<div class="mt-3">
											<div class="flex items-center justify-between mb-2">
												<span class="text-[0.7rem] font-semibold text-secondary uppercase tracking-wider font-mono">Options</span>
												<button class="inline-flex items-center gap-1.5 py-1.5 px-3 text-[0.7rem] font-mono rounded-md cursor-pointer bg-info/20 border border-info/40 text-info transition-all duration-150 hover:bg-info/30 hover:border-info/60" onclick={() => addQuestionOption(index)}>
													<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
														<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
													</svg>
													Add Option
												</button>
											</div>
											{#if errors[`action-${index}-options`]}
												<span class="block text-[0.7rem] text-error mt-1 font-mono">{errors[`action-${index}-options`]}</span>
											{/if}

											{#each action.questionUIConfig.options || [] as option, optIndex}
												<div class="p-2.5 rounded-md mb-2 bg-base-300 border border-base-300 last:mb-0">
													<div class="flex items-center justify-between mb-1.5">
														<span class="text-[0.65rem] font-semibold text-secondary/70 font-mono">Option {optIndex + 1}</span>
														{#if (action.questionUIConfig.options?.length || 0) > 1}
															<button
																class="flex items-center justify-center w-6 h-6 rounded bg-transparent border-none text-base-content/50 cursor-pointer transition-all duration-150 hover:bg-error/20 hover:text-error"
																onclick={() => removeQuestionOption(index, optIndex)}
																aria-label="Remove option"
															>
																<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
																	<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
																</svg>
															</button>
														{/if}
													</div>
													<div class="flex gap-4 items-start">
														<div class="mb-3.5 flex-1">
															<label class="block text-xs font-medium text-base-content/70 mb-1.5 font-mono">Label <span class="text-error">*</span></label>
															<input
																type="text"
																bind:value={option.label}
																class="w-full py-2 px-3 text-sm font-mono rounded-md bg-base-300 border border-base-300 text-base-content transition-all duration-150 focus:outline-none focus:border-info {errors[`action-${index}-option-${optIndex}-label`] ? 'border-error' : ''}"
																placeholder="Display text"
															/>
															{#if errors[`action-${index}-option-${optIndex}-label`]}
																<span class="block text-[0.7rem] text-error mt-1 font-mono">{errors[`action-${index}-option-${optIndex}-label`]}</span>
															{/if}
														</div>
														<div class="mb-3.5 w-24">
															<label class="block text-xs font-medium text-base-content/70 mb-1.5 font-mono">Value <span class="text-error">*</span></label>
															<input
																type="text"
																bind:value={option.value}
																class="w-full py-2 px-3 text-sm font-mono rounded-md bg-base-300 border border-base-300 text-base-content transition-all duration-150 focus:outline-none focus:border-info {errors[`action-${index}-option-${optIndex}-value`] ? 'border-error' : ''}"
																placeholder="1"
															/>
															{#if errors[`action-${index}-option-${optIndex}-value`]}
																<span class="block text-[0.7rem] text-error mt-1 font-mono">{errors[`action-${index}-option-${optIndex}-value`]}</span>
															{/if}
														</div>
													</div>
													<div class="mb-0">
														<label class="block text-xs font-medium text-base-content/70 mb-1.5 font-mono">Description (optional)</label>
														<input
															type="text"
															bind:value={option.description}
															class="w-full py-2 px-3 text-sm font-mono rounded-md bg-base-300 border border-base-300 text-base-content transition-all duration-150 focus:outline-none focus:border-info"
															placeholder="Optional description"
														/>
													</div>
												</div>
											{/each}
										</div>
									{/if}
								</div>
							{:else if action.type === 'run_command'}
								<!-- Command selector for run_command action -->
								<div class="mb-3.5 mt-2">
									<label class="block text-xs font-medium text-base-content/70 mb-1.5 font-mono">Slash Command</label>
									{#if commandsLoading}
										<div class="flex items-center gap-2 py-2 px-3 text-xs text-base-content/60 font-mono">
											<span class="inline-block w-3.5 h-3.5 rounded-full border-2 border-base-300 border-t-info animate-spin"></span>
											Loading commands...
										</div>
									{:else if commandsError}
										<div class="flex items-center gap-2 py-2 px-3 rounded-md text-xs font-mono bg-error/10 border border-error/20 text-error">
											<span class="text-sm">⚠</span>
											{commandsError}
											<button class="ml-auto py-1 px-2 text-[0.65rem] font-mono rounded cursor-pointer bg-base-300 border border-base-300 text-base-content/75 transition-all duration-150 hover:bg-base-100 hover:border-base-content/40" onclick={fetchCommands}>Retry</button>
										</div>
									{:else if availableCommands.length === 0}
										<div class="py-2 px-3 text-xs text-base-content/50 italic font-mono">No commands available</div>
									{:else}
										<select bind:value={action.payload} class="w-full py-2 px-3 text-sm font-mono rounded-md bg-base-300 border border-base-300 text-base-content transition-all duration-150 focus:outline-none focus:border-info cursor-pointer">
											<option value="">Select a command...</option>
											{#each availableCommands as cmd}
												<option value={cmd.invocation}>
													{cmd.invocation}{cmd.namespace === 'local' ? ' (local)' : ''}
												</option>
											{/each}
										</select>
										<span class="block text-[0.65rem] text-base-content/50 mt-1 font-mono">
											The selected command will be sent to the session terminal
										</span>
									{/if}
								</div>
							{:else}
								<!-- Standard payload input for other action types -->
								<div class="mb-3.5">
									<label class="block text-xs font-medium text-base-content/70 mb-1.5 font-mono">
										{#if action.type === 'send_keys'}
											Key to Send
										{:else if action.type === 'notify_only'}
											Notification Message
										{:else if action.type === 'signal'}
											Signal Type/Data
										{:else if action.type === 'tmux_command'}
											Tmux Command
										{:else}
											Text to Send
										{/if}
									</label>
									{#if action.type === 'send_keys'}
										<select bind:value={action.payload} class="w-full py-2 px-3 text-sm font-mono rounded-md bg-base-300 border border-base-300 text-base-content transition-all duration-150 focus:outline-none focus:border-info cursor-pointer">
											{#each specialKeys as key}
												<option value={key}>{key}</option>
											{/each}
										</select>
									{:else}
										<input
											type="text"
											bind:value={action.payload}
											class="w-full py-2 px-3 text-sm font-mono rounded-md bg-base-300 border border-base-300 text-base-content transition-all duration-150 focus:outline-none focus:border-info"
											placeholder={action.type === 'notify_only' ? 'Notification message...' :
												action.type === 'signal' ? 'working {"taskId":"..."}' :
												action.type === 'tmux_command' ? 'send-keys -t {session} "text"' :
												'Text to send...'}
										/>
									{/if}
								<!-- Signal Help Section -->
								{#if action.type === 'signal'}
									<details class="mt-2 group">
										<summary class="flex items-center gap-1.5 text-[0.7rem] text-info/70 cursor-pointer select-none font-mono hover:text-info group-open:text-info group-open:mb-2">
											<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
												<path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
											</svg>
											Signal Types, Variables & Payloads
										</summary>
										<div class="p-3 rounded-lg text-[0.7rem] bg-base-300 border border-base-300">
											<p class="text-base-content/75 m-0 mb-3 font-mono">
												Format: <code class="py-0.5 px-1.5 rounded text-[0.65rem] bg-info/20 text-info">type payload</code> (type followed by space, then JSON)
											</p>

											<!-- Template Variables Section -->
											<div class="mb-3 p-2 rounded-md bg-base-200 border border-base-300">
												<div class="text-[0.65rem] font-semibold text-info uppercase tracking-wider mb-2 font-mono">Template Variables</div>
												<div class="grid gap-x-3 gap-y-1 items-baseline" style="grid-template-columns: auto 1fr;">
													<code class="py-0.5 px-1.5 rounded text-[0.6rem] font-mono whitespace-nowrap bg-success/20 text-success">{'{session}'}</code>
													<span class="text-[0.6rem] text-base-content/60 font-mono">Tmux session name (e.g., "squad-FairBay")</span>

													<code class="py-0.5 px-1.5 rounded text-[0.6rem] font-mono whitespace-nowrap bg-success/20 text-success">{'{agent}'}</code>
													<span class="text-[0.6rem] text-base-content/60 font-mono">Agent name (e.g., "FairBay")</span>

													<code class="py-0.5 px-1.5 rounded text-[0.6rem] font-mono whitespace-nowrap bg-success/20 text-success">{'{timestamp}'}</code>
													<span class="text-[0.6rem] text-base-content/60 font-mono">ISO timestamp when rule triggered</span>

													<code class="py-0.5 px-1.5 rounded text-[0.6rem] font-mono whitespace-nowrap bg-success/20 text-success">{'{match}'}</code>
													<span class="text-[0.6rem] text-base-content/60 font-mono">Full text matched by pattern</span>

													<code class="py-0.5 px-1.5 rounded text-[0.6rem] font-mono whitespace-nowrap bg-success/20 text-success">{'{$0}'}</code>
													<span class="text-[0.6rem] text-base-content/60 font-mono">Same as {'{match}'} (full match)</span>

													<code class="py-0.5 px-1.5 rounded text-[0.6rem] font-mono whitespace-nowrap bg-success/20 text-success">{'{$1}'}, {'{$2}'}, ...</code>
													<span class="text-[0.6rem] text-base-content/60 font-mono">Regex capture groups</span>
												</div>
											</div>

											<!-- Example with Variables -->
											<div class="mb-3 p-2 rounded-md bg-info/10 border border-info/20">
												<div class="text-[0.65rem] font-semibold text-info uppercase tracking-wider mb-2 font-mono">Example: Extract task ID from output</div>
												<div class="flex flex-col gap-1.5">
													<div class="flex flex-col gap-0.5">
														<span class="text-[0.55rem] text-base-content/60 font-mono uppercase">Pattern (regex):</span>
														<code class="py-1 px-2 rounded text-[0.6rem] font-mono break-all bg-base-300 border border-base-300 text-base-content/80">Working on task (squad-[a-z0-9]+)</code>
													</div>
													<div class="flex flex-col gap-0.5">
														<span class="text-[0.55rem] text-base-content/60 font-mono uppercase">Signal payload:</span>
														<code class="py-1 px-2 rounded text-[0.6rem] font-mono break-all bg-base-300 border border-base-300 text-base-content/80">{`working {"taskId":"{$1}","agentName":"{agent}"}`}</code>
													</div>
													<div class="flex flex-col gap-0.5">
														<span class="text-[0.55rem] text-base-content/60 font-mono uppercase">Result:</span>
														<code class="py-1 px-2 rounded text-[0.6rem] font-mono break-all bg-base-300 border border-base-300 text-base-content/80">{`working {"taskId":"squad-abc","agentName":"FairBay"}`}</code>
													</div>
												</div>
											</div>

											<div class="text-[0.65rem] font-semibold text-info uppercase tracking-wider mb-2 mt-2 font-mono">Signal Types</div>
											<div class="flex flex-col gap-1.5 mb-3">
												<div class="flex items-start gap-2 py-1">
													<span class="flex-shrink-0 w-20 font-semibold text-success text-[0.65rem] font-mono">working</span>
													<code class="flex-1 py-1 px-2 rounded text-[0.6rem] font-mono break-all bg-base-100 border border-base-300 text-base-content/70">{`{"taskId":"{$1}","taskTitle":"..."}`}</code>
												</div>
												<div class="flex items-start gap-2 py-1">
													<span class="flex-shrink-0 w-20 font-semibold text-success text-[0.65rem] font-mono">idle</span>
													<code class="flex-1 py-1 px-2 rounded text-[0.6rem] font-mono break-all bg-base-100 border border-base-300 text-base-content/70">{`{"readyForWork":true}`}</code>
												</div>
												<div class="flex items-start gap-2 py-1">
													<span class="flex-shrink-0 w-20 font-semibold text-success text-[0.65rem] font-mono">needs_input</span>
													<code class="flex-1 py-1 px-2 rounded text-[0.6rem] font-mono break-all bg-base-100 border border-base-300 text-base-content/70">{`{"taskId":"...","question":"...","questionType":"choice"}`}</code>
												</div>
												<div class="flex items-start gap-2 py-1">
													<span class="flex-shrink-0 w-20 font-semibold text-success text-[0.65rem] font-mono">review</span>
													<code class="flex-1 py-1 px-2 rounded text-[0.6rem] font-mono break-all bg-base-100 border border-base-300 text-base-content/70">{`{"taskId":"...","summary":["..."]}`}</code>
												</div>
												<div class="flex items-start gap-2 py-1">
													<span class="flex-shrink-0 w-20 font-semibold text-success text-[0.65rem] font-mono">completing</span>
													<code class="flex-1 py-1 px-2 rounded text-[0.6rem] font-mono break-all bg-base-100 border border-base-300 text-base-content/70">{`{"taskId":"...","currentStep":"..."}`}</code>
												</div>
												<div class="flex items-start gap-2 py-1">
													<span class="flex-shrink-0 w-20 font-semibold text-success text-[0.65rem] font-mono">completed</span>
													<code class="flex-1 py-1 px-2 rounded text-[0.6rem] font-mono break-all bg-base-100 border border-base-300 text-base-content/70">{`{"taskId":"...","outcome":"success"}`}</code>
												</div>
												<div class="flex items-start gap-2 py-1">
													<span class="flex-shrink-0 w-20 font-semibold text-success text-[0.65rem] font-mono">starting</span>
													<code class="flex-1 py-1 px-2 rounded text-[0.6rem] font-mono break-all bg-base-100 border border-base-300 text-base-content/70">{`{"agentName":"{agent}","project":"squad"}`}</code>
												</div>
												<div class="flex items-start gap-2 py-1">
													<span class="flex-shrink-0 w-20 font-semibold text-success text-[0.65rem] font-mono">compacting</span>
													<code class="flex-1 py-1 px-2 rounded text-[0.6rem] font-mono break-all bg-base-100 border border-base-300 text-base-content/70">{`{"reason":"...","contextSizeBefore":...}`}</code>
												</div>
											</div>
										</div>
									</details>
								{/if}
							</div>
							{/if}
						</div>
					{/each}
				</section>

				<!-- Timing Section -->
				<section class="p-4 rounded-[10px] bg-base-100 border border-base-300">
					<h3 class="text-xs font-semibold text-info uppercase tracking-wider font-mono m-0 mb-3">Timing & Limits</h3>

					<div class="flex gap-4 items-start">
						<div class="mb-3.5 flex-1">
							<label for="cooldown" class="block text-xs font-medium text-base-content/70 mb-1.5 font-mono">Cooldown (seconds)</label>
							<input
								id="cooldown"
								type="number"
								bind:value={formData.cooldownSeconds}
								class="w-full py-2 px-3 text-sm font-mono rounded-md bg-base-300 border border-base-300 text-base-content transition-all duration-150 focus:outline-none focus:border-info {errors.cooldown ? 'border-error' : ''}"
								min="0"
								step="5"
							/>
							{#if errors.cooldown}
								<span class="block text-[0.7rem] text-error mt-1 font-mono">{errors.cooldown}</span>
							{/if}
							<span class="block text-[0.65rem] text-base-content/50 mt-1 font-mono">Minimum time between triggers</span>
						</div>
						<div class="mb-3.5 flex-1">
							<label for="max-triggers" class="block text-xs font-medium text-base-content/70 mb-1.5 font-mono">Max Triggers per Session</label>
							<input
								id="max-triggers"
								type="number"
								bind:value={formData.maxTriggersPerSession}
								class="w-full py-2 px-3 text-sm font-mono rounded-md bg-base-300 border border-base-300 text-base-content transition-all duration-150 focus:outline-none focus:border-info {errors.maxTriggers ? 'border-error' : ''}"
								min="0"
							/>
							{#if errors.maxTriggers}
								<span class="block text-[0.7rem] text-error mt-1 font-mono">{errors.maxTriggers}</span>
							{/if}
							<span class="block text-[0.65rem] text-base-content/50 mt-1 font-mono">0 = unlimited</span>
						</div>
					</div>
				</section>
			</div>

			<!-- Footer -->
			<footer class="flex justify-end gap-3 px-5 py-4 bg-base-300 border-t border-base-300">
				<button class="py-2 px-5 text-sm font-mono font-medium rounded-md cursor-pointer transition-all duration-150 bg-transparent border border-base-content/30 text-base-content/70 hover:bg-base-100 hover:border-base-content/40" onclick={handleCancel}>
					Cancel
				</button>
				<button class="py-2 px-5 text-sm font-mono font-medium rounded-md cursor-pointer transition-all duration-150 bg-success border border-success text-success-content hover:brightness-110" onclick={handleSave}>
					{isEditMode ? 'Save Changes' : 'Create Rule'}
				</button>
			</footer>
		</div>
	</div>
{/if}

<style>
	/* All styling converted to inline Tailwind/DaisyUI classes for Tailwind v4 compatibility */

	/* Loading spinner uses global spin keyframe from app.css */
	.loading-spinner {
		animation: spin 0.8s linear infinite;
	}
</style>
