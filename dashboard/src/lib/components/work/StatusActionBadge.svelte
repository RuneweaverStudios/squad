<script lang="ts">
	/**
	 * StatusActionBadge Component
	 *
	 * A clickable status badge that opens a dropdown with context-specific actions.
	 * Replaces static status badges (DONE, WORKING, etc.) with actionable buttons.
	 *
	 * Actions by state:
	 * - completed (DONE): Close session, View task details
	 * - completing (COMPLETING): Attach terminal (watch progress)
	 * - ready-for-review (REVIEW): Mark done, Attach terminal
	 * - needs-input (INPUT): Attach terminal, Send Esc
	 * - working (WORKING): Interrupt, Attach terminal
	 * - starting (STARTING): Cancel, Attach terminal
	 * - idle (IDLE): Start work, Close session
	 */

	import { fade, fly } from 'svelte/transition';
	import { createEventDispatcher } from 'svelte';

	type SessionState = 'starting' | 'working' | 'needs-input' | 'ready-for-review' | 'completing' | 'completed' | 'idle';

	interface Action {
		id: string;
		label: string;
		icon: string; // SVG path
		variant: 'default' | 'success' | 'warning' | 'error' | 'info';
		description?: string;
	}

	interface Props {
		sessionState: SessionState;
		sessionName: string;
		disabled?: boolean;
		onAction?: (actionId: string) => Promise<void> | void;
		class?: string;
	}

	let {
		sessionState,
		sessionName,
		disabled = false,
		onAction,
		class: className = ''
	}: Props = $props();

	// Dropdown state
	let isOpen = $state(false);
	let isExecuting = $state(false);
	let dropdownRef: HTMLDivElement | null = null;

	// State visual configuration
	const STATE_CONFIG: Record<SessionState, {
		label: string;
		icon: string;
		bgColor: string;
		textColor: string;
		borderColor: string;
		pulse?: boolean;
	}> = {
		starting: {
			label: '🚀 STARTING',
			icon: 'M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z',
			bgColor: 'oklch(0.60 0.15 200 / 0.3)',
			textColor: 'oklch(0.90 0.12 200)',
			borderColor: 'oklch(0.60 0.15 200 / 0.5)'
		},
		working: {
			label: '⚙️ WORKING',
			icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
			bgColor: 'oklch(0.55 0.15 250 / 0.3)',
			textColor: 'oklch(0.90 0.12 250)',
			borderColor: 'oklch(0.55 0.15 250 / 0.5)'
		},
		'needs-input': {
			label: '❓ INPUT',
			icon: 'M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z',
			bgColor: 'oklch(0.60 0.20 45 / 0.3)',
			textColor: 'oklch(0.90 0.15 45)',
			borderColor: 'oklch(0.60 0.20 45 / 0.5)',
			pulse: true
		},
		'ready-for-review': {
			label: '🔍 REVIEW',
			icon: 'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
			bgColor: 'oklch(0.55 0.18 85 / 0.3)',
			textColor: 'oklch(0.85 0.15 85)',
			borderColor: 'oklch(0.55 0.18 85 / 0.5)',
			pulse: true
		},
		completing: {
			label: '⏳ COMPLETING',
			icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
			bgColor: 'oklch(0.50 0.12 175 / 0.3)',
			textColor: 'oklch(0.85 0.12 175)',
			borderColor: 'oklch(0.50 0.12 175 / 0.5)'
		},
		completed: {
			label: '✅ DONE',
			icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
			bgColor: 'oklch(0.45 0.18 145 / 0.3)',
			textColor: 'oklch(0.80 0.15 145)',
			borderColor: 'oklch(0.45 0.18 145 / 0.5)'
		},
		idle: {
			label: 'IDLE',
			icon: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
			bgColor: 'oklch(0.5 0 0 / 0.1)',
			textColor: 'oklch(0.60 0.02 250)',
			borderColor: 'oklch(0.5 0 0 / 0.2)'
		}
	};

	// Actions per state
	const STATE_ACTIONS: Record<SessionState, Action[]> = {
		completed: [
			{
				id: 'cleanup',
				label: 'Cleanup Session',
				icon: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
				variant: 'success',
				description: 'Close tmux session and remove from list'
			},
			{
				id: 'view-task',
				label: 'View Task',
				icon: 'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
				variant: 'default',
				description: 'Open task details'
			},
			{
				id: 'attach',
				label: 'Attach Terminal',
				icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
				variant: 'info',
				description: 'Open session in terminal'
			}
		],
		'ready-for-review': [
			{
				id: 'complete',
				label: 'Mark Done',
				icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
				variant: 'success',
				description: 'Run /jat:complete to finish task'
			},
			{
				id: 'attach',
				label: 'Attach Terminal',
				icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
				variant: 'info',
				description: 'Open session in terminal to review'
			}
		],
		completing: [
			{
				id: 'attach',
				label: 'Attach Terminal',
				icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
				variant: 'info',
				description: 'Watch completion progress'
			}
		],
		'needs-input': [
			{
				id: 'attach',
				label: 'Attach Terminal',
				icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
				variant: 'warning',
				description: 'Open session to provide input'
			},
			{
				id: 'escape',
				label: 'Send Escape',
				icon: 'M9 9l6 6m0-6l-6 6m12-3a9 9 0 11-18 0 9 9 0 0118 0z',
				variant: 'default',
				description: 'Send Esc key to cancel prompt'
			}
		],
		working: [
			{
				id: 'interrupt',
				label: 'Interrupt',
				icon: 'M15.75 5.25v13.5m-7.5-13.5v13.5',
				variant: 'warning',
				description: 'Send Ctrl+C to interrupt'
			},
			{
				id: 'attach',
				label: 'Attach Terminal',
				icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
				variant: 'info',
				description: 'Open session in terminal'
			}
		],
		starting: [
			{
				id: 'attach',
				label: 'Attach Terminal',
				icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
				variant: 'info',
				description: 'Open session in terminal'
			},
			{
				id: 'interrupt',
				label: 'Cancel Start',
				icon: 'M6 18L18 6M6 6l12 12',
				variant: 'error',
				description: 'Send Ctrl+C to cancel'
			}
		],
		idle: [
			{
				id: 'start',
				label: 'Start Work',
				icon: 'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z',
				variant: 'success',
				description: 'Run /jat:start to pick a task'
			},
			{
				id: 'cleanup',
				label: 'Close Session',
				icon: 'M6 18L18 6M6 6l12 12',
				variant: 'error',
				description: 'Kill tmux session'
			}
		]
	};

	const config = $derived(STATE_CONFIG[sessionState]);
	const actions = $derived(STATE_ACTIONS[sessionState]);

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

	// Handle action execution
	async function executeAction(action: Action) {
		if (disabled || isExecuting) return;

		isExecuting = true;
		try {
			await onAction?.(action.id);
		} finally {
			isExecuting = false;
			isOpen = false;
		}
	}

	// Get variant colors
	function getVariantClasses(variant: Action['variant']): string {
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
</script>

<div class="relative inline-block {className}" bind:this={dropdownRef}>
	<!-- Status Badge Button -->
	<button
		type="button"
		onclick={() => !disabled && (isOpen = !isOpen)}
		class="font-mono text-[10px] tracking-wider px-1.5 pt-0.5 rounded flex-shrink-0 font-bold cursor-pointer transition-all hover:scale-105 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-base-100"
		class:animate-pulse={config.pulse}
		class:cursor-not-allowed={disabled}
		class:opacity-50={disabled}
		style="
			background: {config.bgColor};
			color: {config.textColor};
			border: 1px solid {config.borderColor};
			focus:ring-color: {config.borderColor};
		"
		disabled={disabled}
		title="Click for actions"
	>
		{config.label}
		<!-- Dropdown indicator -->
		<svg
			class="inline-block w-2.5 h-2.5 ml-0.5 transition-transform"
			class:rotate-180={isOpen}
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
			class="absolute left-0 top-full mt-1 z-50 min-w-[180px] rounded-lg shadow-xl overflow-hidden"
			style="
				background: oklch(0.20 0.02 250);
				border: 1px solid oklch(0.35 0.03 250);
			"
			transition:fly={{ y: -5, duration: 150 }}
		>
			<!-- Actions list -->
			<ul class="py-1">
				{#each actions as action (action.id)}
					<li>
						<button
							type="button"
							onclick={() => executeAction(action)}
							class="w-full px-3 py-2 flex items-center gap-2 text-left text-xs transition-colors {getVariantClasses(action.variant)}"
							disabled={isExecuting}
						>
							{#if isExecuting}
								<span class="loading loading-spinner loading-xs"></span>
							{:else}
								<svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d={action.icon} />
								</svg>
							{/if}
							<div class="flex flex-col min-w-0">
								<span class="font-semibold">{action.label}</span>
								{#if action.description}
									<span class="text-[10px] opacity-60 truncate">{action.description}</span>
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
