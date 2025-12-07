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
		type SessionStateAction
	} from '$lib/config/statusColors';
	import {
		playTaskCompleteSound,
		playCleanupSound,
		playKillSound,
		playAttachSound,
		playInterruptSound,
		playTaskStartSound
	} from '$lib/utils/soundEffects';

	type SessionState = 'starting' | 'working' | 'compacting' | 'needs-input' | 'ready-for-review' | 'completing' | 'completed' | 'idle';

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
		class: className = ''
	}: Props = $props();

	// Dropdown state
	let isOpen = $state(false);
	let isExecuting = $state(false);
	let dropdownRef: HTMLDivElement | null = null;

	// Get config from centralized statusColors.ts
	const config = $derived(getSessionStateVisual(sessionState));
	const actions = $derived(getSessionStateActions(sessionState));

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
			return `Start ${nextTask.taskId}`;
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
				const source = nextTask.source === 'epic' && nextTask.epicId
					? `from ${nextTask.epicId}`
					: 'from backlog';
				return `${title} (${source})`;
			}
			return 'No ready tasks available';
		}
		return action.description;
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
							<div class="flex flex-col min-w-0">
								<span class="font-semibold">{actionLabel}</span>
								{#if actionDescription}
									<span class="text-[10px] opacity-60 truncate">{actionDescription}</span>
								{/if}
							</div>
						</button>
					</li>
				{/each}
			</ul>

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
