<script lang="ts">
	import { onDestroy } from 'svelte';
	import { getProjectColor as getProjectColorFromHash } from '$lib/utils/projectColors';
	import { TASK_STATUS_VISUALS, STATUS_ICONS, getIssueTypeVisual } from '$lib/config/statusColors';
	import { isHumanTask } from '$lib/utils/badgeHelpers';
	import WorkingAgentBadge from '$lib/components/WorkingAgentBadge.svelte';
	import AgentAvatar from '$lib/components/AgentAvatar.svelte';
	import ProviderLogo from '$lib/components/agents/ProviderLogo.svelte';

	/** Dependency task info */
	interface DepTask {
		id: string;
		status: string;
		title?: string;
		priority?: number;
	}

	/** Dependency graph data from API */
	interface DepGraphNode {
		id: string;
		title: string;
		status: string;
		priority: number;
		isBlocking?: boolean;
		isWaiting?: boolean;
	}

	interface DepGraphData {
		task: { id: string; title: string; status: string; priority: number; issue_type?: string };
		blockedBy: DepGraphNode[];
		unblocks: DepGraphNode[];
	}

	interface Props {
		task: { id: string; status: string; issue_type?: string; assignee?: string; title?: string; updated_at?: string; created_at?: string; labels?: string[]; priority?: number };
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
		/** Show dependency mini-graph in dropdown (fetches from API on hover) */
		showDepGraph?: boolean;
		/** Show compact unblocks count badge inline (e.g., "→3") */
		showUnblocksCount?: boolean;
		/** Optional status dot color (oklch string) - shows a colored dot before the ID representing agent state */
		statusDotColor?: string;
		/** Display variant: 'default' (normal badge) | 'projectPill' (outline pill with project prefix only) | 'agentPill' (avatar with status ring + task ID) */
		variant?: 'default' | 'projectPill' | 'agentPill';
		/** Agent name for agentPill variant - displays avatar with status ring */
		agentName?: string;
		/** Apply entrance animation to text (tracking-in-expand) */
		animate?: boolean;
		/** Session was resumed from previous session (agentPill variant) */
		resumed?: boolean;
		/** Terminal is attached to session (agentPill variant) */
		attached?: boolean;
		/** Direct click handler on the badge (bypasses dropdown) */
		onClick?: () => void;
		/** Play exit animation (flip-out) on avatar */
		exiting?: boolean;
		/** Agent harness/program ID (e.g., 'claude-code', 'codex-cli') for provider logo */
		harness?: string;
		/** Callback when user clicks the harness icon in the avatar slot (agentPill variant, no agent assigned) */
		onHarnessClick?: (event: MouseEvent) => void;
	}

	let { task, size = 'sm', showStatus = true, showType = true, showCopyIcon = false, showAssignee = false, minimal = false, color, onOpenTask, onAgentClick, dropdownAlign = 'start', copyOnly = false, blockedBy = [], blocks = [], showDependencies = false, showDepGraph = true, showUnblocksCount = false, statusDotColor, variant = 'default', agentName, animate = false, resumed = false, attached = false, onClick, exiting = false, harness, onHarnessClick }: Props = $props();

	// Extract project prefix from task ID (e.g., "jat-abc" -> "jat")
	const projectPrefix = $derived(task.id.split('-')[0] || task.id);

	// Dependency graph state
	let depGraphData = $state<DepGraphData | null>(null);
	let depGraphLoading = $state(false);
	let depGraphError = $state<string | null>(null);
	let depGraphFetched = $state(false);

	// Fetch dependency graph data on hover
	async function fetchDepGraph() {
		if (depGraphFetched || depGraphLoading || !showDepGraph) return;

		depGraphLoading = true;
		depGraphError = null;

		try {
			const response = await fetch(`/api/tasks/${task.id}/deps`);
			if (!response.ok) {
				throw new Error('Failed to fetch dependencies');
			}
			depGraphData = await response.json();
			depGraphFetched = true;
		} catch (err) {
			depGraphError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			depGraphLoading = false;
		}
	}

	// Handle dependency task click
	function handleDepTaskClick(depId: string, event: MouseEvent) {
		event.stopPropagation();
		event.preventDefault();
		if (onOpenTask) {
			onOpenTask(depId);
		}
	}

	// Get priority badge class
	function getPriorityBadge(priority: number): string {
		const badges: Record<number, string> = {
			0: 'badge-error',
			1: 'badge-warning',
			2: 'badge-info',
			3: 'badge-ghost'
		};
		return badges[priority] || 'badge-ghost';
	}

	// Show assignee when task is in_progress and has an assignee
	const shouldShowAssignee = $derived(showAssignee && task.status === 'in_progress' && task.assignee);

	let copied = $state(false);
	let dropdownOpen = $state(false);

	// Portal-based dropdown to escape stacking context (jat-1xa13)
	// The dropdown is rendered to document.body via portalAction to be truly above all other elements
	let dropdownRef: HTMLDivElement | null = $state(null);
	let dropdownPosition = $state({ top: 0, left: 0 });
	let isDropdownVisible = $state(false);
	let hideTimeout: ReturnType<typeof setTimeout> | null = null;

	onDestroy(() => {
		if (hideTimeout) clearTimeout(hideTimeout);
	});

	function updateDropdownPosition() {
		if (!dropdownRef) return;
		const rect = dropdownRef.getBoundingClientRect();
		// Position dropdown below and aligned to trigger
		dropdownPosition = {
			top: rect.bottom + 4, // 4px gap below trigger
			left: dropdownAlign === 'end' ? rect.right - 288 : rect.left // 288px = max-w-72 (18rem)
		};
		// Clamp to viewport bounds
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		if (dropdownPosition.left < 8) dropdownPosition.left = 8;
		if (dropdownPosition.left + 288 > viewportWidth - 8) {
			dropdownPosition.left = viewportWidth - 288 - 8;
		}
		// If dropdown would go below viewport, position above trigger instead
		if (dropdownPosition.top + 200 > viewportHeight) { // estimate dropdown height ~200px
			dropdownPosition.top = rect.top - 200 - 4;
		}
	}

	function handleDropdownEnter() {
		// Cancel any pending hide
		if (hideTimeout) {
			clearTimeout(hideTimeout);
			hideTimeout = null;
		}
		updateDropdownPosition();
		isDropdownVisible = true;
		fetchDepGraph();
	}

	function handleDropdownLeave() {
		// Delay hiding to allow mouse to move from trigger to fixed dropdown
		hideTimeout = setTimeout(() => {
			isDropdownVisible = false;
			hideTimeout = null;
		}, 100);
	}

	function handleDropdownContentEnter() {
		// Cancel hide if mouse enters the dropdown content
		if (hideTimeout) {
			clearTimeout(hideTimeout);
			hideTimeout = null;
		}
		isDropdownVisible = true;
	}

	// Portal action - moves element to body level to escape stacking contexts
	function portalAction(node: HTMLElement) {
		// Move the node to body
		document.body.appendChild(node);

		return {
			destroy() {
				// Move back before destroy (Svelte needs the node in original location to unmount)
				// Actually, just remove it - Svelte will handle cleanup
				if (node.parentNode === document.body) {
					document.body.removeChild(node);
				}
			}
		};
	}

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
		if (onClick) {
			onClick();
			return;
		}
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

	// Human task indicator - shown with warm orange styling
	const isHuman = $derived(isHumanTask(task));

	// Closed/completed task indicator
	const isClosed = $derived(task.status === 'closed');

	// Task age - human-readable time since creation
	function getAge(dateStr: string | undefined): { label: string; color: string } {
		if (!dateStr) return { label: '', color: '' };
		const ms = Date.now() - new Date(dateStr).getTime();
		if (ms < 0) return { label: '', color: '' };
		const mins = Math.floor(ms / 60000);
		const hours = Math.floor(mins / 60);
		const days = Math.floor(hours / 24);
		const weeks = Math.floor(days / 7);
		const months = Math.floor(days / 30);

		// Label
		const label = mins < 1 ? '<1m' : mins < 60 ? `${mins}m` : hours < 24 ? `${hours}h` : days < 7 ? `${days}d` : weeks < 5 ? `${weeks}w` : `${months}mo`;

		// Color: bright green → faded gray over time
		// <1h: vivid green, 1-6h: green fading, 6-24h: muted, 1-3d: dim, 3d+: gray
		const color = hours < 1
			? 'oklch(0.80 0.20 145)'        // bright green
			: hours < 6
			? 'oklch(0.72 0.15 145)'        // green, slightly faded
			: hours < 24
			? 'oklch(0.62 0.08 160)'        // muted green-teal
			: days < 3
			? 'oklch(0.55 0.03 200)'        // dim blue-gray
			: 'oklch(0.45 0.01 250)';       // gray

		return { label, color };
	}
	const taskAgeInfo = $derived(getAge(task.created_at));
</script>

{#if minimal}
	<!-- Minimal mode: just colored text, click to copy -->
	<button
		class="font-mono cursor-pointer hover:opacity-80 transition-opacity inline-flex items-center gap-1"
		onclick={copyId}
		title="Click to copy task ID"
	>
		{#if isClosed}
			<svg class="{iconSizes[size]} text-success shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
		{/if}
		<span class="{size === 'xs' ? 'text-xs' : size === 'sm' ? 'text-sm' : 'text-base'} {animate ? 'tracking-in-expand' : ''} {isClosed ? 'line-through opacity-60' : ''}" style="color: {projectColor}{animate ? '; animation-delay: 100ms;' : ''}">{task.id}</span>
		{#if copied}
			<svg class="{iconSizes[size]} text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
			</svg>
		{/if}
	</button>
{:else if variant === 'projectPill'}
	<!-- Project pill mode: outline pill with status dot and task ID -->
	{@const dotColor = isClosed ? 'oklch(0.65 0.20 145)' : (statusDotColor || 'oklch(0.50 0.02 250)')}
	<button
		class="inline-flex items-center gap-1.5 font-mono rounded-full cursor-pointer whitespace-nowrap
			   hover:opacity-90 transition-all {size === 'xs' ? 'text-xs px-2 py-0.5' : size === 'sm' ? 'text-sm px-2.5 py-0.5' : 'text-base px-3 py-1'}"
		style="
			background: color-mix(in oklch, {isClosed ? 'oklch(0.65 0.20 145)' : projectColor} 15%, transparent);
			border: 1px solid color-mix(in oklch, {isClosed ? 'oklch(0.65 0.20 145)' : projectColor} 40%, transparent);
			color: {isClosed ? 'oklch(0.65 0.20 145)' : projectColor};
		"
		onclick={copyId}
		title="Click to copy task ID"
	>
		{#if isClosed}
			<!-- Checkmark for closed tasks -->
			<svg class="{iconSizes[size]} shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
		{:else}
			<!-- Status dot (uses status color, not project color) -->
			<span
				class="rounded-full shrink-0 {size === 'xs' ? 'w-2 h-2' : size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'}"
				style="background: {dotColor};"
			></span>
		{/if}
		<!-- Full task ID -->
		<span class="{animate ? 'tracking-in-expand' : ''} {isClosed ? 'line-through opacity-70' : ''}" style={animate ? 'animation-delay: 100ms;' : ''}>{task.id}</span>
		{#if showType && task.issue_type}
			<span class="opacity-80">{typeVisual.icon}</span>
		{/if}
		{#if copied}
			<svg class="{iconSizes[size]} text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
			</svg>
		{/if}
	</button>
{:else if variant === 'agentPill'}
	<!-- Agent pill mode: avatar with status ring + task ID - more compact single-row display -->
	{@const ringColor = isClosed ? 'oklch(0.65 0.20 145)' : (statusDotColor || 'oklch(0.50 0.02 250)')}
	{@const avatarSize = size === 'xs' ? 20 : size === 'sm' ? 24 : 28}
	{@const badgeColor = isClosed ? 'oklch(0.65 0.20 145)' : projectColor}
	<div class="inline-flex flex-col items-start">
		<button
			class="inline-flex items-center gap-2 font-mono rounded-full cursor-pointer whitespace-nowrap
				   hover:opacity-90 transition-all {size === 'xs' ? 'text-xs pr-2 pl-0.5 py-0.5' : size === 'sm' ? 'text-sm pr-2.5 pl-0.5 py-0.5' : 'text-base pr-3 pl-1 py-1'}"
			style="
				background: color-mix(in oklch, {badgeColor} 12%, transparent);
				border: 1px solid color-mix(in oklch, {badgeColor} 30%, transparent);
				color: {badgeColor};
			"
			onclick={copyId}
			title="Click to copy task ID"
		>
			{#if isClosed}
				<!-- Checkmark circle for closed tasks (replaces avatar) -->
				<div
					class="rounded-full shrink-0 flex items-center justify-center"
					style="
						width: {avatarSize}px;
						height: {avatarSize}px;
						background: oklch(0.65 0.20 145 / 0.2);
						border: 2px solid oklch(0.65 0.20 145);
					"
				>
					<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
					</svg>
				</div>
			{:else}
				<!-- Avatar with status ring using AgentAvatar's built-in ring support -->
				{#if agentName}
					<AgentAvatar name={agentName} size={avatarSize - 4} showRing={true} ringColor={ringColor} showGlow={true} {exiting} />
				{:else if isHuman && !isClosed}
					<!-- Human task icon as avatar -->
					<button
						class="rounded-full shrink-0 flex items-center justify-center cursor-pointer hover:brightness-125 transition-all"
						style="width: {avatarSize}px; height: {avatarSize}px; background: oklch(0.20 0.02 250); border: 2px solid oklch(0.45 0.15 45);"
						onclick={(e) => { e.stopPropagation(); onHarnessClick?.(e); }}
						title="Human task"
					>
						<ProviderLogo agentId="human" size={avatarSize - 10} />
					</button>
				{:else if harness}
					<!-- Harness icon as avatar when no agent assigned -->
					<button
						class="rounded-full shrink-0 flex items-center justify-center cursor-pointer hover:brightness-125 transition-all"
						style="width: {avatarSize}px; height: {avatarSize}px; background: oklch(0.20 0.02 250); border: 2px solid oklch(0.35 0.03 250);"
						onclick={(e) => { e.stopPropagation(); onHarnessClick?.(e); }}
						title="Harness: {harness} — click to change"
					>
						<ProviderLogo agentId={harness} size={avatarSize - 10} />
					</button>
				{:else}
					<!-- Fallback dot if no agent and no harness -->
					<div
						class="rounded-full shrink-0"
						style="
							padding: 2px;
							background: {ringColor};
							box-shadow: 0 0 6px {ringColor};
						"
					>
						<div
							class="rounded-full"
							style="width: {avatarSize - 4}px; height: {avatarSize - 4}px; background: oklch(0.25 0.02 250);"
						></div>
					</div>
				{/if}
			{/if}
			<!-- Task ID -->
			<span class="{animate ? 'tracking-in-expand' : ''} {isClosed ? 'line-through opacity-70' : ''}" style={animate ? 'animation-delay: 100ms;' : ''}>{task.id}</span>
			{#if copied}
				<svg class="{iconSizes[size]} text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
				</svg>
			{/if}
		</button>

		<!-- Icons row - outside button, below the badge -->
		<div class="flex items-center gap-1 mt-0.5 ml-8">
			<!-- Priority badge -->
			{#if showType && task.issue_type && !isClosed}
				<span class={size === 'xs' ? 'text-xs' : size === 'sm' ? 'text-sm' : 'text-base'}>{typeVisual.icon}</span>
			{/if}
			{#if task.priority !== undefined}
				{@const priorityColors = {
					0: { bg: 'oklch(0.55 0.20 25 / 0.25)', text: 'oklch(0.75 0.18 25)', border: 'oklch(0.55 0.20 25 / 0.5)' },
					1: { bg: 'oklch(0.55 0.18 85 / 0.25)', text: 'oklch(0.80 0.15 85)', border: 'oklch(0.55 0.18 85 / 0.5)' },
					2: { bg: 'oklch(0.55 0.15 200 / 0.20)', text: 'oklch(0.75 0.12 200)', border: 'oklch(0.55 0.15 200 / 0.4)' },
					3: { bg: 'oklch(0.35 0.02 250 / 0.30)', text: 'oklch(0.65 0.02 250)', border: 'oklch(0.35 0.02 250 / 0.5)' },
					4: { bg: 'oklch(0.30 0.02 250 / 0.25)', text: 'oklch(0.55 0.02 250)', border: 'oklch(0.30 0.02 250 / 0.4)' }
				}}
				{@const pColor = priorityColors[task.priority as keyof typeof priorityColors] || priorityColors[3]}
				<span
					class="text-xs font-semibold px-1 py-0.5 rounded scale-75"
					style="background: {pColor.bg}; color: {pColor.text}; border: 1px solid {pColor.border};"
				>P{task.priority}</span>
			{/if}
			{#if isHuman && !isClosed}
				<span class="inline-flex scale-75" title="Human task">
					<ProviderLogo agentId="human" size={12} />
				</span>
			{:else if harness && agentName}
				<span class="inline-flex scale-75" title={harness}>
					<ProviderLogo agentId={harness} size={12} />
				</span>
			{/if}
			{#if taskAgeInfo.label}
				<span
					class="text-[10px] font-mono font-semibold"
					style="color: {taskAgeInfo.color};"
					title="Task age: created {task.created_at}"
				>{taskAgeInfo.label}</span>
			{/if}
			{#if resumed}
				<span class="resumed-badge" title="Resumed from previous session">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3" style="color: oklch(0.70 0.15 200); filter: drop-shadow(0 0 3px oklch(0.65 0.15 200 / 0.6));">
						<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
					</svg>
				</span>
			{/if}
			{#if attached}
				<span class="attached-indicator" title="Terminal attached">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3" style="color: oklch(0.70 0.18 145); filter: drop-shadow(0 0 3px oklch(0.65 0.18 145 / 0.6));">
						<path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
					</svg>
				</span>
			{/if}
		</div>
	</div>
{:else if copyOnly}
	<!-- Copy-only mode: just a clickable badge, no dropdown (for use in tables where info is already visible) -->
	<div class="inline-flex flex-col items-start gap-0.5 relative">
		<!-- Blocked by (ABOVE badge) - compact with wrapping and indent -->
		{#if hasBlockers}
			<div class="text-xs flex" style="color: oklch(0.65 0.20 25);">
				<span class="flex items-center gap-1 shrink-0">
					<span class="font-mono opacity-50">┌</span>
					<svg class="w-3 h-3 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
					</svg>
				</span>
				<span class="flex items-center gap-1 flex-wrap ml-1">
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
				</span>
			</div>
		{/if}

		<!-- Main badge -->
		<button
			class="inline-flex items-center font-mono rounded cursor-pointer mt-3
				   bg-base-100 hover:bg-base-200 transition-colors group border {isClosed ? 'border-success/40' : 'border-base-300'} {sizeClasses[size]}"
			onclick={copyId}
			title="Click to copy task ID"
		>
			<span class="{animate ? 'tracking-in-expand' : ''} {isClosed ? 'line-through opacity-60' : ''}" style="color: {isClosed ? 'oklch(0.65 0.20 145)' : projectColor}{animate ? '; animation-delay: 100ms;' : ''}">{task.id}</span>
		</button>

		<!-- Icons row - outside button, below the badge -->
		<div class="flex items-center gap-0.5 ml-1.5">
			<!-- Priority badge -->
			{#if task.priority !== undefined}
				{@const priorityColors = {
					0: { bg: 'oklch(0.55 0.20 25 / 0.25)', text: 'oklch(0.75 0.18 25)', border: 'oklch(0.55 0.20 25 / 0.5)' },
					1: { bg: 'oklch(0.55 0.18 85 / 0.25)', text: 'oklch(0.80 0.15 85)', border: 'oklch(0.55 0.18 85 / 0.5)' },
					2: { bg: 'oklch(0.55 0.15 200 / 0.20)', text: 'oklch(0.75 0.12 200)', border: 'oklch(0.55 0.15 200 / 0.4)' },
					3: { bg: 'oklch(0.35 0.02 250 / 0.30)', text: 'oklch(0.65 0.02 250)', border: 'oklch(0.35 0.02 250 / 0.5)' },
					4: { bg: 'oklch(0.30 0.02 250 / 0.25)', text: 'oklch(0.55 0.02 250)', border: 'oklch(0.30 0.02 250 / 0.4)' }
				}}
				{@const pColor = priorityColors[task.priority as keyof typeof priorityColors] || priorityColors[3]}
				<span
					class="text-xs font-semibold px-1 py-0.5 rounded scale-70 mt-0.25"
					style="background: {pColor.bg}; color: {pColor.text}; border: 1px solid {pColor.border};"
				>P{task.priority}</span>
			{/if}
			{#if isHuman && !isClosed}
				<span class="inline-flex scale-70 mt-0.25" title="Human task">
					<ProviderLogo agentId="human" size={12} />
				</span>
			{:else if harness}
				<span class="inline-flex scale-70 mt-0.25" title={harness}>
					<ProviderLogo agentId={harness} size={12} />
				</span>
			{/if}
			{#if taskAgeInfo.label}
				<span
					class="text-[10px] font-mono font-semibold"
					style="color: {taskAgeInfo.color};"
					title="Task age: created {task.created_at}"
				>{taskAgeInfo.label}</span>
			{/if}

			{#if isClosed}
				<!-- Checkmark for closed tasks -->
				<svg class="{iconSizes[size]} text-success shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
			{:else if showType && task.issue_type}
				<span class={size === 'xs' ? 'text-xs' : size === 'sm' ? 'text-sm' : 'text-base'}>{typeVisual.icon}</span>
			{/if}

			{#if showUnblocksCount && activeBlocks.length > 0 && !isClosed}
				<span
					class="inline-flex items-center gap-0.5 text-xs font-mono px-1 py-0.5 rounded"
					style="color: oklch(0.75 0.15 200); background: oklch(0.75 0.15 200 / 0.15);"
					title="Completing this task unblocks {activeBlocks.length} other {activeBlocks.length === 1 ? 'task' : 'tasks'}"
				>
					<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
					</svg>
					{activeBlocks.length}
				</span>
			{/if}

			{#if showStatus && !shouldShowAssignee && !isClosed}
				<svg
					class="{iconSizes[size]} {statusVisual.text} {statusVisual.animation || ''} shrink-0 ml-0.25 mt-0.5"
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

		<!-- Blocks (BELOW badge) - compact with wrapping and indent -->
		{#if hasBlocks}
			<div class="text-xs flex" style="color: oklch(0.60 0.15 200);">
				<span class="flex items-center gap-1 shrink-0">
					<span class="font-mono opacity-50">└</span>
					<svg class="w-3 h-3 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
					</svg>
				</span>
				<span class="flex items-center gap-1 flex-wrap ml-1">
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
				</span>
			</div>
		{/if}
	</div>
{:else}
	<!-- Full mode: badge with project-colored ID on first row, icons on second row -->
	<div class="inline-flex flex-col items-start gap-0.5 relative">
		<!-- Blocked by (ABOVE badge) - compact with wrapping and indent -->
		{#if hasBlockers}
			<div class="text-xs flex" style="color: oklch(0.65 0.20 25);">
				<span class="flex items-center gap-1 shrink-0">
					<span class="font-mono opacity-50">┌</span>
					<svg class="w-3 h-3 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
					</svg>
				</span>
				<span class="flex items-center gap-1 flex-wrap ml-1">
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
				</span>
			</div>
		{/if}

		<div
			class="dropdown {dropdownAlign === 'end' ? 'dropdown-left' : 'dropdown-right'}"
			bind:this={dropdownRef}
			onmouseenter={handleDropdownEnter}
			onmouseleave={handleDropdownLeave}
		>
			<button
				class="inline-flex items-center font-mono rounded cursor-pointer
					   bg-base-100 hover:bg-base-200 transition-colors group border {isClosed ? 'border-success/40' : 'border-base-300'} {sizeClasses[size]}"
				onclick={handleBadgeClick}
			>
				<span class="{animate ? 'tracking-in-expand' : ''} {isClosed ? 'line-through opacity-60' : ''}" style="color: {isClosed ? 'oklch(0.65 0.20 145)' : projectColor}{animate ? '; animation-delay: 100ms;' : ''}">{task.id}</span>
			</button>

			<!-- Icons row - outside button, below the badge -->
			<div class="flex items-center gap-1 mt-0.5 opacity-80">
				<!-- Priority badge -->
				{#if task.priority !== undefined}
					{@const priorityColors = {
						0: { bg: 'oklch(0.55 0.20 25 / 0.25)', text: 'oklch(0.75 0.18 25)', border: 'oklch(0.55 0.20 25 / 0.5)' },
						1: { bg: 'oklch(0.55 0.18 85 / 0.25)', text: 'oklch(0.80 0.15 85)', border: 'oklch(0.55 0.18 85 / 0.5)' },
						2: { bg: 'oklch(0.55 0.15 200 / 0.20)', text: 'oklch(0.75 0.12 200)', border: 'oklch(0.55 0.15 200 / 0.4)' },
						3: { bg: 'oklch(0.35 0.02 250 / 0.30)', text: 'oklch(0.65 0.02 250)', border: 'oklch(0.35 0.02 250 / 0.5)' },
						4: { bg: 'oklch(0.30 0.02 250 / 0.25)', text: 'oklch(0.55 0.02 250)', border: 'oklch(0.30 0.02 250 / 0.4)' }
					}}
					{@const pColor = priorityColors[task.priority as keyof typeof priorityColors] || priorityColors[3]}
					<span
						class="text-xs font-semibold px-1 py-0.5 rounded scale-70 ml-2"
						style="background: {pColor.bg}; color: {pColor.text}; border: 1px solid {pColor.border};"
					>P{task.priority}</span>
				{/if}
				{#if isHuman && !isClosed}
					<span class="inline-flex scale-70 ml-1" title="Human task">
						<ProviderLogo agentId="human" size={12} />
					</span>
				{:else if harness}
					<span class="inline-flex scale-70 ml-1" title={harness}>
						<ProviderLogo agentId={harness} size={12} />
					</span>
				{/if}
				{#if taskAgeInfo.label}
					<span
						class="text-[10px] font-mono font-semibold"
						style="color: {taskAgeInfo.color};"
						title="Task age: created {task.created_at}"
					>{taskAgeInfo.label}</span>
				{/if}

				{#if isClosed}
					<svg class="{iconSizes[size]} shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: oklch(0.65 0.20 145);">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
				{:else if showType && task.issue_type}
					<span class={size === 'xs' ? 'text-xs' : size === 'sm' ? 'text-sm' : 'text-base'}>{typeVisual.icon}</span>
				{/if}

				{#if showUnblocksCount && activeBlocks.length > 0 && !isClosed}
					<span
						class="inline-flex items-center gap-0.5 text-xs font-mono px-1 py-0.5 rounded"
						style="color: oklch(0.75 0.15 200); background: oklch(0.75 0.15 200 / 0.15);"
						title="Completing this task unblocks {activeBlocks.length} other {activeBlocks.length === 1 ? 'task' : 'tasks'}"
					>
						<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
						</svg>
						{activeBlocks.length}
					</span>
				{/if}

				{#if showStatus && !shouldShowAssignee && !isClosed}
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
			</div>

			<!-- Hover dropdown with task info and quick actions - uses portal to escape stacking context (jat-1xa13) -->
			{#if isDropdownVisible}
			<div
				use:portalAction
				class="fixed p-2 shadow-lg bg-base-100 rounded-lg border border-base-300 min-w-56 max-w-72"
				style="top: {dropdownPosition.top}px; left: {dropdownPosition.left}px; z-index: 2147483647;"
				onmouseenter={handleDropdownContentEnter}
				onmouseleave={handleDropdownLeave}
			>
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

				<!-- Dependency Mini-Graph -->
				{#if showDepGraph}
					<div class="border-t border-base-200 mt-1 pt-2">
						{#if depGraphLoading}
							<div class="flex items-center justify-center py-2">
								<span class="loading loading-spinner loading-xs"></span>
								<span class="text-xs text-base-content/50 ml-2">Loading deps...</span>
							</div>
						{:else if depGraphError}
							<div class="text-xs text-error/70 text-center py-2">{depGraphError}</div>
						{:else if depGraphData}
							{@const activeBlockers = depGraphData.blockedBy.filter(d => d.isBlocking)}
							{@const activeUnblocks = depGraphData.unblocks.filter(d => d.isWaiting)}
							{@const hasDeps = activeBlockers.length > 0 || activeUnblocks.length > 0}

							{#if !hasDeps}
								<div class="text-xs text-base-content/50 text-center py-1">No dependencies</div>
							{:else}
								<!-- Blockers section (tasks that block this) -->
								{#if activeBlockers.length > 0}
									<div class="mb-2">
										<div class="flex items-center gap-1 mb-1.5 px-1">
											<svg class="w-3 h-3 text-error/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
											</svg>
											<span class="text-[10px] font-semibold text-error/80 uppercase tracking-wide">Blocked By</span>
											<span class="text-[10px] text-base-content/40">({activeBlockers.length})</span>
										</div>
										<div class="space-y-1 max-h-24 overflow-y-auto">
											{#each activeBlockers.slice(0, 5) as dep}
												{@const depColor = getProjectColorFromHash(dep.id)}
												{@const depStatus = TASK_STATUS_VISUALS[dep.status] || TASK_STATUS_VISUALS.open}
												<button
													class="w-full flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-base-200 transition-colors text-left group"
													onclick={(e) => handleDepTaskClick(dep.id, e)}
												>
													<svg class="w-2.5 h-2.5 {depStatus.text} shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
														<circle cx="12" cy="12" r="10" />
													</svg>
													<span class="font-mono text-[11px]" style="color: {depColor}">{dep.id}</span>
													<span class="badge badge-xs {getPriorityBadge(dep.priority)} scale-90">P{dep.priority}</span>
													<svg class="w-3 h-3 text-base-content/20 group-hover:text-base-content/50 ml-auto shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
														<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
													</svg>
												</button>
											{/each}
											{#if activeBlockers.length > 5}
												<div class="text-[10px] text-base-content/40 text-center">+{activeBlockers.length - 5} more</div>
											{/if}
										</div>
									</div>
								{/if}

								<!-- Current task indicator -->
								<div class="flex items-center justify-center py-1.5 border-y border-base-200/50 my-1">
									<div class="flex items-center gap-1.5">
										<div class="w-1.5 h-1.5 rounded-full {statusVisual.text}"></div>
										<span class="font-mono text-[11px] font-medium" style="color: {projectColor}">{task.id}</span>
									</div>
								</div>

								<!-- Unblocks section (tasks waiting on this) -->
								{#if activeUnblocks.length > 0}
									<div class="mt-2">
										<div class="flex items-center gap-1 mb-1.5 px-1">
											<svg class="w-3 h-3 text-success/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
											</svg>
											<span class="text-[10px] font-semibold text-success/80 uppercase tracking-wide">Unblocks</span>
											<span class="text-[10px] text-base-content/40">({activeUnblocks.length})</span>
										</div>
										<div class="space-y-1 max-h-24 overflow-y-auto">
											{#each activeUnblocks.slice(0, 5) as dep}
												{@const depColor = getProjectColorFromHash(dep.id)}
												{@const depStatus = TASK_STATUS_VISUALS[dep.status] || TASK_STATUS_VISUALS.open}
												<button
													class="w-full flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-base-200 transition-colors text-left group"
													onclick={(e) => handleDepTaskClick(dep.id, e)}
												>
													<svg class="w-2.5 h-2.5 {depStatus.text} shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
														<circle cx="12" cy="12" r="10" />
													</svg>
													<span class="font-mono text-[11px]" style="color: {depColor}">{dep.id}</span>
													<span class="badge badge-xs {getPriorityBadge(dep.priority)} scale-90">P{dep.priority}</span>
													<svg class="w-3 h-3 text-base-content/20 group-hover:text-base-content/50 ml-auto shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
														<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
													</svg>
												</button>
											{/each}
											{#if activeUnblocks.length > 5}
												<div class="text-[10px] text-base-content/40 text-center">+{activeUnblocks.length - 5} more</div>
											{/if}
										</div>
									</div>
								{/if}
							{/if}
						{:else}
							<div class="text-xs text-base-content/50 text-center py-1">Hover to load deps</div>
						{/if}
					</div>
				{/if}
			</div>
			{/if}
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

		<!-- Blocks (BELOW badge) - compact with wrapping and indent -->
		{#if hasBlocks}
			<div class="text-xs flex" style="color: oklch(0.60 0.15 200);">
				<span class="flex items-center gap-1 shrink-0">
					<span class="font-mono opacity-50">└</span>
					<svg class="w-3 h-3 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
					</svg>
				</span>
				<span class="flex items-center gap-1 flex-wrap ml-1">
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
				</span>
			</div>
		{/if}
	</div>
{/if}
