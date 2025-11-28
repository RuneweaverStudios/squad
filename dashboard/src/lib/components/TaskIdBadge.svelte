<script lang="ts">
	import { getProjectColor as getProjectColorFromHash } from '$lib/utils/projectColors';
	import { TASK_STATUS_VISUALS, STATUS_ICONS, getIssueTypeVisual } from '$lib/config/statusColors';
	import WorkingAgentBadge from '$lib/components/WorkingAgentBadge.svelte';

	/** Dependency task info */
	interface DepTask {
		id: string;
		status: string;
		title?: string;
	}

	interface Props {
		task: { id: string; status: string; issue_type?: string; assignee?: string; title?: string; updated_at?: string };
		size?: 'xs' | 'sm' | 'md';
		showStatus?: boolean;
		showType?: boolean;
		showCopyIcon?: boolean;
		showAssignee?: boolean;
		minimal?: boolean;
		/** Optional project color override - use this when parent has access to projectColors from API */
		color?: string;
		/** Callback when user clicks "Open Task" in dropdown */
		onOpenTask?: (taskId: string) => void;
		/** Callback when user clicks on the agent avatar/name/timer */
		onAgentClick?: (agentName: string) => void;
		/** Dropdown alignment - 'start' opens to the right, 'end' opens to the left */
		dropdownAlign?: 'start' | 'end';
		/** If true, just click-to-copy without dropdown (useful when info is already visible in context) */
		copyOnly?: boolean;
		/** Tasks that block this task (unresolved dependencies) */
		blockedBy?: DepTask[];
		/** Tasks that this task blocks */
		blocks?: DepTask[];
		/** Show dependency indicators below badge */
		showDependencies?: boolean;
	}

	let { task, size = 'sm', showStatus = true, showType = true, showCopyIcon = false, showAssignee = false, minimal = false, color, onOpenTask, onAgentClick, dropdownAlign = 'start', copyOnly = false, blockedBy = [], blocks = [], showDependencies = false }: Props = $props();

	// Show assignee when task is in_progress and has an assignee
	const shouldShowAssignee = $derived(showAssignee && task.status === 'in_progress' && task.assignee);

	let copied = $state(false);
	let dropdownOpen = $state(false);

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

	function copyId(event: MouseEvent) {
		event.stopPropagation();
		navigator.clipboard.writeText(task.id);
		copied = true;
		dropdownOpen = false;
		setTimeout(() => (copied = false), 1500);
	}

	function handleOpenTask(event: MouseEvent) {
		event.stopPropagation();
		dropdownOpen = false;
		if (onOpenTask) {
			onOpenTask(task.id);
		}
	}

	function handleBadgeClick(event: MouseEvent) {
		event.stopPropagation();
		dropdownOpen = !dropdownOpen;
	}

	function closeDropdown() {
		dropdownOpen = false;
	}

	const statusVisual = $derived(TASK_STATUS_VISUALS[task.status] || TASK_STATUS_VISUALS.open);
	const typeVisual = $derived(getIssueTypeVisual(task.issue_type));
	// Use provided color prop, or fall back to hash-based color from task ID
	const projectColor = $derived(color || getProjectColorFromHash(task.id));

	// Get the actual icon path - either from STATUS_ICONS or inline path
	const iconPath = $derived(
		statusVisual.icon === 'gear'
			? STATUS_ICONS.gear
			: statusVisual.icon
	);

	// Format status for display
	const statusLabel = $derived(task.status.replace('_', ' '));

	// Dependency helpers - filter to only show unresolved blockers
	const unresolvedBlockers = $derived(blockedBy.filter(d => d.status !== 'closed'));
	const activeBlocks = $derived(blocks.filter(d => d.status !== 'closed'));
	const hasBlockers = $derived(showDependencies && unresolvedBlockers.length > 0);
	const hasBlocks = $derived(showDependencies && activeBlocks.length > 0);
</script>

{#if minimal}
	<!-- Minimal mode: just colored text, click to copy -->
	<button
		class="font-mono cursor-pointer hover:opacity-80 transition-opacity inline-flex items-center gap-1"
		onclick={copyId}
		title="Click to copy task ID"
	>
		<span class={size === 'xs' ? 'text-xs' : size === 'sm' ? 'text-sm' : 'text-base'} style="color: {projectColor}">{task.id}</span>
		{#if copied}
			<svg class="{iconSizes[size]} text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
			</svg>
		{/if}
	</button>
{:else if copyOnly}
	<!-- Copy-only mode: just a clickable badge, no dropdown (for use in tables where info is already visible) -->
	<div class="inline-flex flex-col items-start gap-0.5 relative">
		<!-- Blocked by (ABOVE badge) -->
		{#if hasBlockers}
			<div class="text-xs" style="color: oklch(0.65 0.20 25);">
				<span class="font-mono opacity-50">┌─</span>
				<span class="opacity-70">blocked by:</span>
				<div class="pl-5 flex flex-wrap items-center gap-1">
					{#each unresolvedBlockers.slice(0, 2) as dep, i}
						<button
							class="font-mono hover:underline"
							onclick={(e) => { e.stopPropagation(); if (onOpenTask) onOpenTask(dep.id); }}
							title={dep.title || dep.id}
						>{dep.id}</button>{#if i < Math.min(unresolvedBlockers.length, 2) - 1}<span>,</span>{/if}
					{/each}
					{#if unresolvedBlockers.length > 2}
						<span class="opacity-60">+{unresolvedBlockers.length - 2}</span>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Main badge -->
		<button
			class="inline-flex items-center font-mono rounded cursor-pointer
				   bg-base-100 hover:bg-base-200 transition-colors group border border-base-300 {sizeClasses[size]}"
			onclick={copyId}
			title="Click to copy task ID"
		>
			{#if showType && task.issue_type}
				<span class={size === 'xs' ? 'text-xs' : size === 'sm' ? 'text-sm' : 'text-base'}>{typeVisual.icon}</span>
			{/if}

			<span style="color: {projectColor}">{task.id}</span>

			{#if showStatus && !shouldShowAssignee}
				<svg
					class="{iconSizes[size]} {statusVisual.text} {statusVisual.animation || ''} shrink-0"
					viewBox="0 0 24 24"
					fill={statusVisual.iconStyle === 'solid' ? 'currentColor' : 'none'}
					stroke="currentColor"
					stroke-width={statusVisual.icon === 'gear' ? 2 : 1.5}
				>
					<path stroke-linecap="round" stroke-linejoin="round" d={iconPath} />
				</svg>
			{/if}

			{#if copied}
				<svg class="{iconSizes[size]} text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
				</svg>
			{:else}
				<svg class="{iconSizes[size]} opacity-0 group-hover:opacity-50 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
				</svg>
			{/if}
		</button>

		{#if shouldShowAssignee}
			<WorkingAgentBadge
				name={task.assignee || ''}
				size={16}
				isWorking={true}
				startTime={task.updated_at}
				variant="timer"
				onClick={onAgentClick}
			/>
		{/if}

		<!-- Blocks (BELOW badge) -->
		{#if hasBlocks}
			<div class="text-xs" style="color: oklch(0.60 0.15 200);">
				<span class="font-mono opacity-50">└─</span>
				<span class="opacity-70">blocks:</span>
				<div class="pl-5 flex flex-wrap items-center gap-1">
					{#each activeBlocks.slice(0, 2) as dep, i}
						<button
							class="font-mono hover:underline"
							onclick={(e) => { e.stopPropagation(); if (onOpenTask) onOpenTask(dep.id); }}
							title={dep.title || dep.id}
						>{dep.id}</button>{#if i < Math.min(activeBlocks.length, 2) - 1}<span>,</span>{/if}
					{/each}
					{#if activeBlocks.length > 2}
						<span class="opacity-60">+{activeBlocks.length - 2}</span>
					{/if}
				</div>
			</div>
		{/if}
	</div>
{:else}
	<!-- Full mode: badge with type icon, project-colored ID, status icon, and dropdown -->
	<div class="inline-flex flex-col items-start gap-0.5 relative">
		<!-- Blocked by (ABOVE badge) -->
		{#if hasBlockers}
			<div class="text-xs" style="color: oklch(0.65 0.20 25);">
				<span class="font-mono opacity-50">┌─</span>
				<span class="opacity-70">blocked by:</span>
				<div class="pl-5 flex flex-wrap items-center gap-1">
					{#each unresolvedBlockers.slice(0, 2) as dep, i}
						<button
							class="font-mono hover:underline"
							onclick={(e) => { e.stopPropagation(); if (onOpenTask) onOpenTask(dep.id); }}
							title={dep.title || dep.id}
						>{dep.id}</button>{#if i < Math.min(unresolvedBlockers.length, 2) - 1}<span>,</span>{/if}
					{/each}
					{#if unresolvedBlockers.length > 2}
						<span class="opacity-60">+{unresolvedBlockers.length - 2}</span>
					{/if}
				</div>
			</div>
		{/if}

		<div class="dropdown dropdown-hover {dropdownAlign === 'end' ? 'dropdown-left' : 'dropdown-right'}">
			<button
				class="inline-flex items-center font-mono rounded cursor-pointer
					   bg-base-100 hover:bg-base-200 transition-colors group border border-base-300 {sizeClasses[size]}"
				onclick={handleBadgeClick}
			>
				{#if showType && task.issue_type}
					<span class={size === 'xs' ? 'text-xs' : size === 'sm' ? 'text-sm' : 'text-base'}>{typeVisual.icon}</span>
				{/if}

				<span style="color: {projectColor}">{task.id}</span>

				{#if showStatus && !shouldShowAssignee}
					<!-- Show status icon in badge only when not showing assignee (assignee row has its own gear) -->
					<svg
						class="{iconSizes[size]} {statusVisual.text} {statusVisual.animation || ''} shrink-0"
						viewBox="0 0 24 24"
						fill={statusVisual.iconStyle === 'solid' ? 'currentColor' : 'none'}
						stroke="currentColor"
						stroke-width={statusVisual.icon === 'gear' ? 2 : 1.5}
					>
						<path stroke-linecap="round" stroke-linejoin="round" d={iconPath} />
					</svg>
				{/if}

				{#if copied}
					<svg class="{iconSizes[size]} text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
					</svg>
				{:else if showCopyIcon}
					<svg class="{iconSizes[size]} opacity-0 group-hover:opacity-50 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
					</svg>
				{/if}
			</button>

			<!-- Hover dropdown with task info and quick actions -->
			<div class="dropdown-content z-[9999] mt-1 p-2 shadow-lg bg-base-100 rounded-lg border border-base-300 min-w-56 max-w-72">
				<!-- Task title -->
				{#if task.title}
					<div class="px-2 py-1.5 border-b border-base-200 mb-1">
						<p class="text-sm font-medium text-base-content line-clamp-2">{task.title}</p>
					</div>
				{/if}

				<!-- Task info -->
				<div class="px-2 py-1.5 text-xs text-base-content/70 space-y-1 border-b border-base-200 mb-1">
					<div class="flex items-center gap-2">
						<span class="font-medium w-14">Status:</span>
						<span class="badge badge-xs {statusVisual.badge} capitalize">{statusLabel}</span>
					</div>
					{#if task.issue_type}
						<div class="flex items-center gap-2">
							<span class="font-medium w-14">Type:</span>
							<span>{typeVisual.icon} {task.issue_type}</span>
						</div>
					{/if}
					{#if task.assignee}
						<div class="flex items-center gap-2">
							<span class="font-medium w-14">Assignee:</span>
							<span>{task.assignee}</span>
						</div>
					{/if}
				</div>

				<!-- Quick actions -->
				<ul class="menu menu-xs p-0">
					<li>
						<button onclick={copyId} class="flex items-center gap-2">
							<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
							</svg>
							{copied ? 'Copied!' : 'Copy ID'}
						</button>
					</li>
					{#if onOpenTask}
						<li>
							<button onclick={handleOpenTask} class="flex items-center gap-2">
								<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
								</svg>
								Open Task
							</button>
						</li>
					{/if}
				</ul>
			</div>
		</div>

		{#if shouldShowAssignee}
			<WorkingAgentBadge
				name={task.assignee || ''}
				size={16}
				isWorking={true}
				startTime={task.updated_at}
				variant="timer"
				onClick={onAgentClick}
			/>
		{/if}

		<!-- Blocks (BELOW badge) -->
		{#if hasBlocks}
			<div class="text-xs" style="color: oklch(0.60 0.15 200);">
				<span class="font-mono opacity-50">└─</span>
				<span class="opacity-70">blocks:</span>
				<div class="pl-5 flex flex-wrap items-center gap-1">
					{#each activeBlocks.slice(0, 2) as dep, i}
						<button
							class="font-mono hover:underline"
							onclick={(e) => { e.stopPropagation(); if (onOpenTask) onOpenTask(dep.id); }}
							title={dep.title || dep.id}
						>{dep.id}</button>{#if i < Math.min(activeBlocks.length, 2) - 1}<span>,</span>{/if}
					{/each}
					{#if activeBlocks.length > 2}
						<span class="opacity-60">+{activeBlocks.length - 2}</span>
					{/if}
				</div>
			</div>
		{/if}
	</div>
{/if}
