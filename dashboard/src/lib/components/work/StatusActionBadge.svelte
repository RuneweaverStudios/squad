<script lang="ts">
	/**
	 * StatusActionBadge Component
	 *
	 * A clickable status badge that opens a dropdown with context-specific actions.
	 * Replaces static status badges (DONE, WORKING, etc.) with actionable buttons.
	 *
	 * Configuration is imported from statusColors.ts for consistency.
	 * Plays contextual sounds for each action type.
	 */

	import { fly } from 'svelte/transition';
	import {
		getSessionStateVisual,
		getSessionStateActions,
		type SessionStateVisual,
		type SessionStateAction,
		type SessionState
	} from '$lib/config/statusColors';
	import {
		playTaskCompleteSound,
		playCleanupSound,
		playKillSound,
		playAttachSound,
		playInterruptSound,
		playTaskStartSound
	} from '$lib/utils/soundEffects';
	import { slide } from 'svelte/transition';

	interface SlashCommand {
		name: string;
		invocation: string;
		namespace: string;
		path: string;
	}

	interface NextTaskInfo {
		taskId: string;
		taskTitle: string;
		source: 'epic' | 'backlog';
		epicId?: string;
		epicTitle?: string;
	}

	interface Props {
		sessionState: SessionState;
		sessionName: string;
		disabled?: boolean;
		dropUp?: boolean;
		alignRight?: boolean;
		/** 'badge' = standalone badge with bg/border, 'integrated' = minimal style for embedding in tabs */
		variant?: 'badge' | 'integrated';
		/** When true, shows dormant variant (💤) for states that support it (completed) */
		isDormant?: boolean;
		/** Tooltip text for dormant state (e.g., "Inactive for 15 minutes") */
		dormantTooltip?: string | null;
		/** Next task info to display in "Start Next" action (for completed state) */
		nextTask?: NextTaskInfo | null;
		/** Whether next task is being loaded */
		nextTaskLoading?: boolean;
		onAction?: (actionId: string) => Promise<void> | void;
		/** Whether to show slash commands section in dropdown */
		showCommands?: boolean;
		/** Callback to run a slash command */
		onCommand?: (command: string) => Promise<void> | void;
		class?: string;
	}

	let {
		sessionState,
		sessionName,
		disabled = false,
		dropUp = false,
		alignRight = false,
		variant = 'badge',
		isDormant = false,
		dormantTooltip = null,
		nextTask = null,
		nextTaskLoading = false,
		onAction,
		showCommands = false,
		onCommand,
		class: className = ''
	}: Props = $props();

	// Dropdown state
	let isOpen = $state(false);
	let isExecuting = $state(false);
	let dropdownRef: HTMLDivElement | null = null;

	// Commands state
	let commands = $state<SlashCommand[]>([]);
	let commandsLoading = $state(false);
	let commandsError = $state<string | null>(null);
	let commandsExpanded = $state(false);
	let commandSearchQuery = $state('');
	let commandSearchInput: HTMLInputElement;
	let selectedCommandIndex = $state(0);

	// Get config from centralized statusColors.ts
	const config = $derived(getSessionStateVisual(sessionState));
	const actions = $derived(getSessionStateActions(sessionState));

	// Score-based command search (adapted from CommandPalette)
	function scoreCommand(query: string, cmd: SlashCommand): number {
		const q = query.toLowerCase();
		const name = cmd.name.toLowerCase();
		const invocation = cmd.invocation.toLowerCase();

		let score = 0;

		// Invocation matches (highest priority - what users type)
		if (invocation === q) {
			score += 100;
		} else if (invocation.startsWith(q)) {
			score += 80;
		} else if (invocation.includes(q)) {
			score += 60;
		}

		// Name matches
		if (name === q) {
			score += 50;
		} else if (name.startsWith(q)) {
			score += 40;
		} else if (name.includes(q)) {
			score += 20;
		}

		// Namespace matches (lowest priority)
		if (cmd.namespace.toLowerCase().includes(q)) {
			score += 10;
		}

		return score;
	}

	function filterCommands(query: string): SlashCommand[] {
		if (!query.trim()) {
			return commands;
		}

		return commands
			.map(cmd => ({ cmd, score: scoreCommand(query, cmd) }))
			.filter(({ score }) => score > 0)
			.sort((a, b) => b.score - a.score)
			.map(({ cmd }) => cmd);
	}

	const filteredCommands = $derived(filterCommands(commandSearchQuery));

	// Get display label (use dormant variant if applicable)
	const displayLabel = $derived(
		isDormant && config.dormantLabel ? config.dormantLabel : config.label
	);
	const displayShortLabel = $derived(
		isDormant && config.dormantShortLabel ? config.dormantShortLabel : config.shortLabel
	);

	// Handle click outside to close dropdown
	function handleClickOutside(event: MouseEvent) {
		if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
			isOpen = false;
		}
	}

	// Setup and cleanup click outside listener
	$effect(() => {
		if (isOpen) {
			document.addEventListener('click', handleClickOutside);
			return () => document.removeEventListener('click', handleClickOutside);
		}
	});

	// Fetch commands when dropdown opens (if showCommands is enabled)
	$effect(() => {
		if (isOpen && showCommands && commands.length === 0 && !commandsLoading) {
			fetchCommands();
		}
	});

	// Focus search input when commands section expands
	$effect(() => {
		if (commandsExpanded && commandSearchInput) {
			setTimeout(() => commandSearchInput?.focus(), 50);
		}
	});

	// Reset search and selection when commands section collapses or dropdown closes
	$effect(() => {
		if (!commandsExpanded || !isOpen) {
			commandSearchQuery = '';
			selectedCommandIndex = 0;
		}
	});

	// Reset selected index when search query changes
	$effect(() => {
		if (commandSearchQuery !== undefined) {
			selectedCommandIndex = 0;
		}
	});

	// Handle keyboard navigation in commands search
	function handleCommandKeyDown(e: KeyboardEvent) {
		const maxIndex = filteredCommands.length - 1;

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				selectedCommandIndex = Math.min(selectedCommandIndex + 1, maxIndex);
				break;
			case 'ArrowUp':
				e.preventDefault();
				selectedCommandIndex = Math.max(selectedCommandIndex - 1, 0);
				break;
			case 'Enter':
				e.preventDefault();
				if (filteredCommands[selectedCommandIndex]) {
					executeCommand(filteredCommands[selectedCommandIndex].invocation);
				}
				break;
			case 'Escape':
				e.preventDefault();
				if (commandSearchQuery) {
					// Clear search first
					commandSearchQuery = '';
				} else {
					// Collapse commands section
					commandsExpanded = false;
				}
				break;
		}
	}

	// Fetch available slash commands
	async function fetchCommands() {
		commandsLoading = true;
		commandsError = null;
		try {
			const response = await fetch('/api/commands');
			if (!response.ok) throw new Error('Failed to fetch commands');
			const data = await response.json();
			commands = data.commands || [];
		} catch (err) {
			commandsError = err instanceof Error ? err.message : 'Failed to load commands';
		} finally {
			commandsLoading = false;
		}
	}

	// Execute a slash command
	async function executeCommand(command: string) {
		if (disabled || isExecuting) return;

		isExecuting = true;
		try {
			await onCommand?.(command);
		} finally {
			isExecuting = false;
			isOpen = false;
		}
	}

	// Get icon for known commands
	function getCommandIcon(invocation: string): string {
		if (invocation.includes('start')) return 'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z';
		if (invocation.includes('complete')) return 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
		if (invocation.includes('pause')) return 'M15.75 5.25v13.5m-7.5-13.5v13.5';
		if (invocation.includes('status')) return 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z';
		if (invocation.includes('help')) return 'M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z';
		if (invocation.includes('verify')) return 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z';
		if (invocation.includes('plan')) return 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z';
		if (invocation.includes('bead')) return 'M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125';
		if (invocation.includes('commit')) return 'M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5';
		if (invocation.includes('doctor')) return 'M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z';
		if (invocation.includes('next')) return 'M3 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062A1.125 1.125 0 013 16.81V8.688zM12.75 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062a1.125 1.125 0 01-1.683-.977V8.688z';
		// Default terminal icon
		return 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z';
	}

	// Play sound based on action type
	function playActionSound(actionId: string): void {
		switch (actionId) {
			case 'complete':
				playTaskCompleteSound();
				break;
			case 'cleanup':
				playCleanupSound();
				break;
			case 'kill':
				playKillSound();
				break;
			case 'attach':
				playAttachSound();
				break;
			case 'interrupt':
			case 'escape':
				playInterruptSound();
				break;
			case 'start':
			case 'start-next':
				playTaskStartSound();
				break;
			// 'view-task' is silent - just viewing
		}
	}

	// Handle action execution
	async function executeAction(action: SessionStateAction) {
		if (disabled || isExecuting) return;

		isExecuting = true;
		try {
			// Play sound before executing action
			playActionSound(action.id);
			await onAction?.(action.id);
		} finally {
			isExecuting = false;
			isOpen = false;
		}
	}

	// Get variant colors for dropdown items
	function getVariantClasses(variant: SessionStateAction['variant']): string {
		switch (variant) {
			case 'success':
				return 'hover:bg-success/20 text-success';
			case 'warning':
				return 'hover:bg-warning/20 text-warning';
			case 'error':
				return 'hover:bg-error/20 text-error';
			case 'info':
				return 'hover:bg-info/20 text-info';
			default:
				return 'hover:bg-base-300 text-base-content';
		}
	}

	// Get dynamic label/description for actions that need runtime data
	function getActionLabel(action: SessionStateAction): string {
		if (action.id === 'start-next' && nextTask) {
			// Clear distinction between epic continuation and backlog pick
			if (nextTask.source === 'epic') {
				return `Continue: ${nextTask.taskId}`;
			} else {
				return `Start: ${nextTask.taskId}`;
			}
		}
		return action.label;
	}

	function getActionDescription(action: SessionStateAction): string | undefined {
		if (action.id === 'start-next') {
			if (nextTaskLoading) {
				return 'Finding next task...';
			}
			if (nextTask) {
				// Truncate title if too long
				const title = nextTask.taskTitle.length > 35
					? nextTask.taskTitle.substring(0, 35) + '...'
					: nextTask.taskTitle;
				return title;
			}
			return 'No ready tasks available';
		}
		return action.description;
	}

	// Get source badge info for start-next action
	function getSourceBadge(action: SessionStateAction): { label: string; color: string; bgColor: string } | null {
		if (action.id === 'start-next' && nextTask) {
			if (nextTask.source === 'epic') {
				return {
					label: nextTask.epicId ? `🏔️ ${nextTask.epicId}` : '🏔️ EPIC',
					color: 'oklch(0.85 0.15 270)',
					bgColor: 'oklch(0.40 0.12 270 / 0.4)'
				};
			} else {
				return {
					label: '📋 BACKLOG',
					color: 'oklch(0.75 0.10 200)',
					bgColor: 'oklch(0.35 0.08 200 / 0.4)'
				};
			}
		}
		return null;
	}

	// Check if action should be disabled
	function isActionDisabled(action: SessionStateAction): boolean {
		if (action.id === 'start-next') {
			return nextTaskLoading || !nextTask;
		}
		return false;
	}
</script>

<div class="relative inline-block {className} pr-2 pb-1" bind:this={dropdownRef}>
	<!-- Status Badge Button -->
	<button
		type="button"
		onclick={() => !disabled && (isOpen = !isOpen)}
		class="font-mono tracking-wider flex-shrink-0 font-bold cursor-pointer transition-all focus:outline-none {variant === 'integrated' ? 'text-[11px] px-2 py-0.5 hover:bg-white/5 rounded' : 'text-[10px] px-1.5 pt-0.5 rounded hover:scale-105 hover:brightness-110 focus:ring-2 focus:ring-offset-1 focus:ring-offset-base-100'}"
		class:animate-pulse={config.pulse && variant === 'badge'}
		class:cursor-not-allowed={disabled}
		class:opacity-50={disabled}
		style={variant === 'integrated'
			? `color: ${config.textColor};`
			: `background: ${config.bgColor}; color: ${config.textColor}; border: 1px solid ${config.borderColor};`
		}
		disabled={disabled}
		title={dormantTooltip || "Click for actions"}
	>
		{variant === 'integrated' ? displayShortLabel : displayLabel}
		<!-- Dropdown indicator -->
		<svg
			class="inline-block w-2.5 h-2.5 ml-0.5 transition-transform"
			class:rotate-180={dropUp ? !isOpen : isOpen}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2.5"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
		</svg>
	</button>

	<!-- Dropdown Menu -->
	{#if isOpen}
		<div
			class="absolute z-50 min-w-[180px] rounded-lg shadow-xl overflow-hidden {dropUp ? 'bottom-full mb-1' : 'top-full mt-1'} {alignRight ? 'right-0' : 'left-0'}"
			style="
				background: oklch(0.20 0.02 250);
				border: 1px solid oklch(0.35 0.03 250);
			"
			transition:fly={{ y: dropUp ? 5 : -5, duration: 150 }}
		>
			<!-- Actions list -->
			<ul class="py-1">
				{#each actions as action (action.id)}
					{@const actionDisabled = isActionDisabled(action)}
					{@const actionLabel = getActionLabel(action)}
					{@const actionDescription = getActionDescription(action)}
					{@const sourceBadge = getSourceBadge(action)}
					<li>
						<button
							type="button"
							onclick={() => executeAction(action)}
							class="w-full px-3 py-2 flex items-center gap-2 text-left text-xs transition-colors {getVariantClasses(action.variant)}"
							class:opacity-50={actionDisabled}
							class:cursor-not-allowed={actionDisabled}
							disabled={isExecuting || actionDisabled}
						>
							{#if isExecuting || (action.id === 'start-next' && nextTaskLoading)}
								<span class="loading loading-spinner loading-xs"></span>
							{:else}
								<svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d={action.icon} />
								</svg>
							{/if}
							<div class="flex flex-col min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<span class="font-semibold">{actionLabel}</span>
									{#if sourceBadge}
										<span
											class="text-[9px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap"
											style="color: {sourceBadge.color}; background: {sourceBadge.bgColor};"
										>
											{sourceBadge.label}
										</span>
									{/if}
								</div>
								{#if actionDescription}
									<span class="text-[10px] opacity-60 truncate">{actionDescription}</span>
								{/if}
							</div>
						</button>
					</li>
				{/each}
			</ul>

			<!-- Commands section (collapsible) -->
			{#if showCommands}
				<div
					class="border-t"
					style="border-color: oklch(0.30 0.02 250);"
				>
					<!-- Commands header (toggle) -->
					<button
						type="button"
						onclick={() => commandsExpanded = !commandsExpanded}
						class="w-full px-3 py-1.5 flex items-center justify-between text-[10px] font-semibold text-white/60 hover:text-white/80 hover:bg-white/5 transition-colors"
					>
						<span class="flex items-center gap-1.5">
							<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
							</svg>
							All Commands
						</span>
						<svg
							class="w-3 h-3 transition-transform"
							class:rotate-180={commandsExpanded}
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
						</svg>
					</button>

					<!-- Commands list (expandable) -->
					{#if commandsExpanded}
						<div
							style="background: oklch(0.15 0.02 250);"
							transition:slide={{ duration: 150 }}
						>
							<!-- Search input (show when there are many commands) -->
							{#if commands.length > 5}
								<div class="px-2 py-1.5 border-b" style="border-color: oklch(0.25 0.02 250);">
									<div class="relative flex items-center gap-1.5">
										<svg
											class="w-3 h-3 flex-shrink-0"
											style="color: oklch(0.55 0.02 250);"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
										</svg>
										<input
											bind:this={commandSearchInput}
											bind:value={commandSearchQuery}
											onkeydown={handleCommandKeyDown}
											type="text"
											placeholder="Filter commands..."
											class="w-full bg-transparent text-[10px] font-mono focus:outline-none"
											style="color: oklch(0.85 0.02 250);"
											autocomplete="off"
										/>
										{#if commandSearchQuery}
											<button
												type="button"
												onclick={() => { commandSearchQuery = ''; commandSearchInput?.focus(); }}
												class="text-white/40 hover:text-white/70 transition-colors"
											>
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
												</svg>
											</button>
										{/if}
									</div>
								</div>
							{/if}

							{#if commandsLoading}
								<div class="px-3 py-3 text-center text-[10px] text-white/50">
									<span class="loading loading-spinner loading-xs"></span>
									<span class="ml-1">Loading...</span>
								</div>
							{:else if commandsError}
								<div class="px-3 py-2 text-center text-[10px] text-error">
									<span>⚠ {commandsError}</span>
									<button class="btn btn-xs btn-ghost ml-1" onclick={fetchCommands}>Retry</button>
								</div>
							{:else if filteredCommands.length === 0}
								<div class="px-3 py-3 text-center text-[10px] text-white/50">
									No commands match "{commandSearchQuery}"
								</div>
							{:else}
								<ul class="py-0.5 max-h-[180px] overflow-y-auto">
									{#each filteredCommands as cmd, index (cmd.invocation)}
										<li>
											<button
												type="button"
												onclick={() => executeCommand(cmd.invocation)}
												class="w-full px-3 py-1.5 flex items-center gap-2 text-left text-[11px] transition-colors text-white/70 hover:text-white"
												style="background: {index === selectedCommandIndex ? 'oklch(1 0 0 / 0.1)' : 'transparent'}; border-left: 2px solid {index === selectedCommandIndex ? 'oklch(0.70 0.18 240)' : 'transparent'};"
												disabled={isExecuting}
												onmouseenter={() => { selectedCommandIndex = index; }}
											>
												<svg class="w-3.5 h-3.5 flex-shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
													<path stroke-linecap="round" stroke-linejoin="round" d={getCommandIcon(cmd.invocation)} />
												</svg>
												<span class="font-mono">{cmd.invocation}</span>
												{#if cmd.namespace === 'local'}
													<span class="text-[8px] px-1 py-0.5 rounded bg-white/10 text-white/40 ml-auto">local</span>
												{/if}
												{#if index === selectedCommandIndex && commands.length > 5}
													<kbd class="kbd kbd-xs font-mono ml-auto" style="background: oklch(0.25 0.01 250); border-color: oklch(0.35 0.02 250); color: oklch(0.70 0.18 240);">↵</kbd>
												{/if}
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Session info footer -->
			<div
				class="px-3 py-1.5 text-[9px] font-mono opacity-50 truncate"
				style="background: oklch(0.15 0.02 250); border-top: 1px solid oklch(0.30 0.02 250);"
			>
				{sessionName}
			</div>
		</div>
	{/if}
</div>
