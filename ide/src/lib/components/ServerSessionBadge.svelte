<script lang="ts">
	/**
	 * ServerSessionBadge Component
	 *
	 * A badge component for server sessions on the /sessions page, similar to
	 * TaskIdBadge but for dev server sessions. Shows project name, server status,
	 * port info, and uptime with action dropdown.
	 */

	import { fly } from 'svelte/transition';
	import { getProjectColor } from '$lib/utils/projectColors';
	import {
		getServerStateVisual,
		getServerStateActions,
		type ServerState,
		type ServerStateAction
	} from '$lib/config/statusColors';

	interface Props {
		/** Session name (e.g., "server-chimaro") */
		sessionName: string;
		/** Project name (e.g., "chimaro") */
		project?: string;
		/** Server status */
		status?: ServerState;
		/** Port number */
		port?: number | null;
		/** Whether the port is actively listening */
		portRunning?: boolean;
		/** Creation/start time for uptime display */
		created?: string;
		/** Badge size */
		size?: 'xs' | 'sm' | 'md';
		/** Display variant: 'default' (full badge) | 'projectPill' (outline pill with project prefix) */
		variant?: 'default' | 'projectPill';
		/** Action callback (start, stop, restart, open) */
		onAction?: (actionId: string) => Promise<void> | void;
		/** Click callback for the badge itself */
		onClick?: () => void;
		/** Custom class */
		class?: string;
	}

	let {
		sessionName,
		project,
		status = 'stopped',
		port = null,
		portRunning = false,
		created,
		size = 'sm',
		variant = 'default',
		onAction,
		onClick,
		class: className = ''
	}: Props = $props();

	// Dropdown state
	let isOpen = $state(false);
	let isExecuting = $state(false);
	let dropdownRef: HTMLDivElement | null = null;

	// Extract project from session name if not provided (server-chimaro -> chimaro)
	const projectName = $derived(project || sessionName.replace('server-', ''));
	const projectColor = $derived(getProjectColor(projectName));

	// Get config from centralized statusColors.ts
	const config = $derived(getServerStateVisual(status));
	const actions = $derived(getServerStateActions(status));

	// Size classes
	const sizeClasses: Record<string, string> = {
		xs: 'text-xs px-1.5 py-0.5 gap-1',
		sm: 'text-sm px-2 py-0.5 gap-1.5',
		md: 'text-base px-2.5 py-1 gap-2'
	};

	const iconSizes: Record<string, string> = {
		xs: 'w-3 h-3',
		sm: 'w-3.5 h-3.5',
		md: 'w-4 h-4'
	};

	// Format uptime from creation timestamp
	function formatUptime(createdISO: string): string {
		const created = new Date(createdISO).getTime();
		const now = Date.now();
		const elapsedMs = now - created;

		if (elapsedMs < 0) return 'just now';

		const seconds = Math.floor(elapsedMs / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) return `${days}d ${hours % 24}h`;
		if (hours > 0) return `${hours}h ${minutes % 60}m`;
		if (minutes > 0) return `${minutes}m`;
		return `${seconds}s`;
	}

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

	// Handle badge click
	function handleBadgeClick(event: MouseEvent) {
		event.stopPropagation();
		if (onClick) {
			onClick();
		} else {
			isOpen = !isOpen;
		}
	}

	// Handle action execution
	async function executeAction(action: ServerStateAction) {
		if (isExecuting) return;

		// Handle "open" action client-side - open localhost URL in new tab
		if (action.id === 'open') {
			if (port) {
				const url = `http://localhost:${port}`;
				window.open(url, '_blank');
			}
			isOpen = false;
			return;
		}

		isExecuting = true;
		try {
			await onAction?.(action.id);
		} finally {
			isExecuting = false;
			isOpen = false;
		}
	}

	// Get variant colors for dropdown items
	function getVariantClasses(variant: ServerStateAction['variant']): string {
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

	// Get status dot color
	const statusDotColor = $derived(() => {
		switch (status) {
			case 'running':
				return 'oklch(0.65 0.18 145)'; // Green
			case 'starting':
				return 'oklch(0.75 0.15 85)'; // Amber
			case 'stopped':
			default:
				return 'oklch(0.50 0.02 250)'; // Gray
		}
	});
</script>

{#if variant === 'projectPill'}
	<!-- Project pill mode: outline pill with status dot and project name -->
	<div class="inline-flex flex-col items-start gap-0.5 relative {className}" bind:this={dropdownRef}>
		<button
			class="inline-flex items-center gap-1.5 font-mono cursor-pointer uppercase
				   hover:opacity-90 transition-all {size === 'xs' ? 'text-xs pl-3 pr-2 py-0.5' : size === 'sm' ? 'text-sm pl-3.5 pr-2.5 py-0.5' : 'text-base pl-4 pr-3 py-1'}"
			style="
				background: color-mix(in oklch, {projectColor} 15%, transparent);
				border: 1px solid color-mix(in oklch, {projectColor} 40%, transparent);
				color: {projectColor};
			"
			onclick={handleBadgeClick}
			title="Click for server actions"
		>
			<!-- Status dot -->
			<span
				class="rounded-full shrink-0 {size === 'xs' ? 'w-2 h-2' : size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'}"
				style="background: {statusDotColor()};"
			></span>
			<!-- Server icon -->
			<svg class="{iconSizes[size]} opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
			</svg>
			<!-- Project name -->
			<span>{projectName}</span>
			<!-- Port if running -->
			{#if port && status === 'running'}
				<span class="opacity-60">:{port}</span>
			{/if}
			<!-- Dropdown indicator -->
			<svg
				class="w-2.5 h-2.5 opacity-60 transition-transform ml-auto"
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
				class="server-dropdown absolute z-40 min-w-[180px] rounded-lg shadow-xl overflow-hidden top-full mt-1 left-0"
				transition:fly={{ y: -5, duration: 150 }}
			>
				<!-- Server info header -->
				<div
					class="px-3 py-2 flex items-center justify-between text-xs server-header"
				>
					<span class="opacity-70">Status</span>
					<span class="font-mono font-bold" style="color: {config.textColor};">
						{config.shortLabel}
						{#if port && status === 'running'}
							<span class="opacity-60">:{port}</span>
						{/if}
					</span>
				</div>

				{#if created && status === 'running'}
					<div class="px-3 py-1.5 flex items-center justify-between text-xs border-b border-base-content/10">
						<span class="opacity-70">Uptime</span>
						<span class="font-mono opacity-80">{formatUptime(created)}</span>
					</div>
				{/if}

				<!-- Actions list -->
				<ul class="py-1">
					{#each actions as action (action.id)}
						<li>
							<button
								type="button"
								onclick={(e) => { e.stopPropagation(); executeAction(action); }}
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
					class="px-3 py-1.5 text-[9px] font-mono opacity-50 truncate server-footer"
				>
					{sessionName}
				</div>
			</div>
		{/if}
	</div>
{:else}
	<!-- Default mode: full badge with server info -->
	<div class="inline-flex flex-col items-start gap-0.5 relative {className}" bind:this={dropdownRef}>
		<button
			class="inline-flex items-center font-mono cursor-pointer uppercase
				   bg-base-100 hover:bg-base-200 transition-colors group border border-base-300 {sizeClasses[size]}"
			onclick={handleBadgeClick}
			title="Click for server actions"
		>
			<!-- Server icon -->
			<svg class="{iconSizes[size]} opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
			</svg>

			<!-- Project name with color -->
			<span style="color: {projectColor}">{projectName}</span>

			<!-- Status indicator -->
			<span
				class="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded"
				style="background: {config.bgColor}; color: {config.textColor};"
			>
				{config.shortLabel}
			</span>

			<!-- Port if running -->
			{#if port && status === 'running'}
				<span class="text-xs opacity-60">:{port}</span>
				<span
					class="w-1.5 h-1.5 rounded-full {portRunning ? 'port-active' : 'port-inactive'}"
					title={portRunning ? 'Port is listening' : 'Port not responding'}
				></span>
			{/if}

			<!-- Dropdown indicator -->
			<svg
				class="w-2.5 h-2.5 opacity-40 group-hover:opacity-60 transition-all"
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
				class="server-dropdown absolute z-40 min-w-[180px] rounded-lg shadow-xl overflow-hidden top-full mt-1 left-0"
				transition:fly={{ y: -5, duration: 150 }}
			>
				<!-- Server info header -->
				<div
					class="px-3 py-2 flex items-center justify-between text-xs server-header"
				>
					<span class="opacity-70">Status</span>
					<span class="font-mono font-bold" style="color: {config.textColor};">
						{config.shortLabel}
						{#if port && status === 'running'}
							<span class="opacity-60">:{port}</span>
						{/if}
					</span>
				</div>

				{#if created && status === 'running'}
					<div class="px-3 py-1.5 flex items-center justify-between text-xs border-b border-base-content/10">
						<span class="opacity-70">Uptime</span>
						<span class="font-mono opacity-80">{formatUptime(created)}</span>
					</div>
				{/if}

				<!-- Actions list -->
				<ul class="py-1">
					{#each actions as action (action.id)}
						<li>
							<button
								type="button"
								onclick={(e) => { e.stopPropagation(); executeAction(action); }}
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
					class="px-3 py-1.5 text-[9px] font-mono opacity-50 truncate server-footer"
				>
					{sessionName}
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Port status indicators */
	.port-active {
		background: var(--color-success);
	}

	.port-inactive {
		background: var(--color-base-content);
		opacity: 0.3;
	}

	/* Dropdown container */
	.server-dropdown {
		background: var(--color-base-300);
		border: 1px solid color-mix(in oklch, var(--color-base-content) 20%, transparent);
	}

	/* Server info header */
	.server-header {
		background: var(--color-base-200);
		border-bottom: 1px solid color-mix(in oklch, var(--color-base-content) 15%, transparent);
	}

	/* Footer */
	.server-footer {
		background: var(--color-base-200);
		border-top: 1px solid color-mix(in oklch, var(--color-base-content) 15%, transparent);
	}
</style>
