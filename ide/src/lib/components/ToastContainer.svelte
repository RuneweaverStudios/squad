<script lang="ts">
	/**
	 * ToastContainer Component
	 *
	 * Displays toast notifications in a fixed position (bottom-right).
	 * Include this component once in your root layout.
	 *
	 * Features:
	 * - Project color pill when projectId is provided
	 * - Task ID badge when taskId is provided
	 * - Click-to-navigate when route is provided
	 *
	 * Usage in +layout.svelte:
	 *   <ToastContainer />
	 */

	import { fly, fade } from 'svelte/transition';
	import { toasts, removeToast, type Toast, type ToastType } from '$lib/stores/toasts.svelte';
	import { getProjectColor } from '$lib/utils/projectColors';
	import { goto } from '$app/navigation';
	import { openTaskDetailDrawer } from '$lib/stores/drawerStore';

	// Visual config for each toast type
	const typeConfig: Record<
		ToastType,
		{ bg: string; border: string; text: string; icon: string }
	> = {
		success: {
			bg: 'oklch(0.25 0.12 145)',
			border: 'oklch(0.45 0.18 145)',
			text: 'oklch(0.90 0.08 145)',
			icon: 'M5 13l4 4L19 7', // Checkmark
		},
		error: {
			bg: 'oklch(0.25 0.12 25)',
			border: 'oklch(0.45 0.18 25)',
			text: 'oklch(0.90 0.08 25)',
			icon: 'M6 18L18 6M6 6l12 12', // X mark
		},
		warning: {
			bg: 'oklch(0.28 0.12 85)',
			border: 'oklch(0.50 0.18 85)',
			text: 'oklch(0.90 0.08 85)',
			icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', // Warning triangle
		},
		info: {
			bg: 'oklch(0.25 0.10 220)',
			border: 'oklch(0.45 0.15 220)',
			text: 'oklch(0.90 0.06 220)',
			icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', // Info circle
		},
	};

	function handleDismiss(e: MouseEvent, id: string) {
		e.stopPropagation();
		removeToast(id);
	}

	function handleToastClick(toast: Toast) {
		if (toast.taskId) {
			removeToast(toast.id);
			openTaskDetailDrawer(toast.taskId);
		} else if (toast.route) {
			removeToast(toast.id);
			goto(toast.route);
		}
	}

	function handleActionClick(e: MouseEvent, action: NonNullable<Toast['action']>) {
		e.stopPropagation();
		action.onClick();
	}
</script>

<!-- Toast Container - Fixed bottom-right -->
<div class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none max-w-sm">
	{#each toasts.value as toast (toast.id)}
		{@const config = typeConfig[toast.type]}
		{@const isClickable = !!toast.taskId || !!toast.route}
		{@const projectColor = toast.projectId ? getProjectColor(toast.projectId) : null}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="pointer-events-auto rounded-lg shadow-lg px-4 py-3 flex items-start gap-3 min-w-[280px]"
			class:cursor-pointer={isClickable}
			class:toast-clickable={isClickable}
			style="
				background: {config.bg};
				border: 1px solid {config.border};
			"
			in:fly={{ x: 100, duration: 200 }}
			out:fade={{ duration: 150 }}
			role={isClickable ? 'button' : 'alert'}
			tabindex={isClickable ? 0 : undefined}
			onclick={() => handleToastClick(toast)}
		>
			<!-- Icon -->
			<svg
				class="w-5 h-5 flex-shrink-0 mt-0.5"
				style="color: {config.text};"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d={config.icon} />
			</svg>

			<!-- Content -->
			<div class="flex-1 min-w-0">
				<!-- Context badges row: project pill + task ID -->
				{#if toast.projectId || toast.taskId}
					<div class="flex items-center gap-1.5 mb-1.5 flex-wrap">
						{#if toast.projectId && projectColor}
							<span
								class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
								style="
									background: {projectColor}22;
									border: 1.5px solid {projectColor}88;
									color: {projectColor};
								"
							>
								<span
									class="w-1.5 h-1.5 rounded-full flex-shrink-0"
									style="background: {projectColor};"
								></span>
								{toast.projectId}
							</span>
						{/if}
						{#if toast.taskId}
							<span
								class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium"
								style="
									background: oklch(0.90 0.02 250 / 0.12);
									color: {projectColor || config.text};
								"
								title={toast.taskTitle || toast.taskId}
							>
								{toast.taskId}
							</span>
						{/if}
					</div>
				{/if}

				<p class="text-sm font-medium" style="color: {config.text};">
					{toast.message}
				</p>
				{#if toast.details}
					<p class="text-xs mt-1 opacity-70" style="color: {config.text};">
						{toast.details}
					</p>
				{/if}
				{#if toast.action}
					<button
						onclick={(e) => handleActionClick(e, toast.action!)}
						class="text-xs mt-2 underline hover:no-underline"
						style="color: {config.text};"
					>
						{toast.action.label}
					</button>
				{/if}
				<!-- Click hint for routable toasts -->
				{#if isClickable}
					<p class="text-[10px] mt-1.5 opacity-50 flex items-center gap-1" style="color: {config.text};">
						<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
						</svg>
						{toast.taskId ? 'Click to view task' : 'Click to open'}
					</p>
				{/if}
			</div>

			<!-- Dismiss button -->
			<button
				onclick={(e) => handleDismiss(e, toast.id)}
				class="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
				style="color: {config.text};"
				title="Dismiss"
			>
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>
	{/each}
</div>

<style>
	.toast-clickable:hover {
		filter: brightness(1.1);
		transform: translateX(-2px);
		transition: filter 0.15s, transform 0.15s;
	}
</style>
