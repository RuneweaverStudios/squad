<script lang="ts">
	/**
	 * ActivityBadge Component
	 *
	 * Consolidated badge combining:
	 * - Agent state counts (colored dots)
	 * - Tasks completed today (star icon + count)
	 *
	 * Dropdown shows:
	 * - Header: Sparkline, token usage, cost
	 * - Agent state breakdown
	 * - Task completion history
	 */

	import { onDestroy, onMount } from 'svelte';
	import AnimatedDigits from './AnimatedDigits.svelte';
	import AnimatedCost from './AnimatedCost.svelte';
	import Sparkline from './Sparkline.svelte';
	import TaskHistoryDrawer from './TaskHistoryDrawer.svelte';
	import TaskDetailDrawer from './TaskDetailDrawer.svelte';
	import { SESSION_STATE_VISUALS } from '$lib/config/statusColors';
	import { getProjectColor } from '$lib/utils/projectColors';

	interface StateCounts {
		needsInput: number;
		working: number;
		review: number;
		completed: number;
		starting?: number;
		idle?: number;
	}

	interface DataPoint {
		timestamp: string;
		tokens: number;
		cost: number;
	}

	interface ProjectTokenData {
		project: string;
		tokens: number;
		cost: number;
		color: string;
	}

	interface MultiProjectDataPoint {
		timestamp: string;
		totalTokens: number;
		totalCost: number;
		projects: ProjectTokenData[];
	}

	interface CompletedTask {
		id: string;
		title: string;
		assignee?: string;
		updated_at: string;
	}

	interface Props {
		// Agent data
		activeAgentCount?: number;
		stateCounts?: StateCounts;
		// Token data
		tokensToday?: number;
		costToday?: number;
		sparklineData?: DataPoint[];
		multiProjectData?: MultiProjectDataPoint[];
		projectColors?: Record<string, string>;
	}

	let {
		activeAgentCount = 0,
		stateCounts,
		tokensToday = 0,
		costToday = 0,
		sparklineData = [],
		multiProjectData,
		projectColors = {}
	}: Props = $props();

	// Dropdown state
	let showDropdown = $state(false);
	let dropdownTimeout: ReturnType<typeof setTimeout> | null = null;

	// Search state with debounce for performance
	let searchQuery = $state('');
	let debouncedSearchQuery = $state('');
	let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let searchInputRef = $state<HTMLInputElement | null>(null);

	// Debounce search query to avoid filtering on every keystroke
	// Note: We must read searchQuery in the effect body (not just in the setTimeout callback)
	// so that Svelte 5's effect tracking sees it as a dependency and re-runs the effect on changes
	$effect(() => {
		const query = searchQuery; // Read to establish dependency tracking
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
		searchDebounceTimer = setTimeout(() => {
			debouncedSearchQuery = query;
		}, 150); // 150ms debounce delay
		return () => {
			if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
		};
	});

	// History drawer state
	let historyDrawerOpen = $state(false);

	// Task detail drawer state
	let detailDrawerOpen = $state(false);
	let selectedTaskId = $state<string | null>(null);

	// Completed tasks state
	let tasks = $state<CompletedTask[]>([]);
	let allClosedTasks = $state<CompletedTask[]>([]);
	let completedCount = $state(0);
	let loading = $state(true);
	let justIncremented = $state(false);
	let hitMilestone = $state(false);
	let milestoneNumber = $state(0);
	let completedTasksInterval: ReturnType<typeof setInterval> | null = null;
	let justIncrementedTimeout: ReturnType<typeof setTimeout> | null = null;
	let hitMilestoneTimeout: ReturnType<typeof setTimeout> | null = null;
	let completedTasksAbortController: AbortController | null = null;
	let completedTasksInFlight = false;

	const MILESTONES = [5, 10, 25, 50, 100];

	// Agent state colors from centralized config
	const STATE_COLORS = {
		needsInput: SESSION_STATE_VISUALS['needs-input'].accent,
		review: SESSION_STATE_VISUALS['ready-for-review'].accent,
		working: SESSION_STATE_VISUALS.working.accent,
		starting: SESSION_STATE_VISUALS.starting.accent,
		completed: SESSION_STATE_VISUALS.completed.accent,
		idle: SESSION_STATE_VISUALS.idle.accent
	};

	// Check if we have any state data
	const hasStateCounts = $derived(
		stateCounts && (
			stateCounts.needsInput > 0 ||
			stateCounts.working > 0 ||
			stateCounts.review > 0 ||
			stateCounts.completed > 0 ||
			(stateCounts.starting && stateCounts.starting > 0) ||
			(stateCounts.idle && stateCounts.idle > 0)
		)
	);

	// Calculate total active agents
	const totalActiveAgents = $derived(() => {
		if (!stateCounts) return activeAgentCount;
		return (stateCounts.needsInput || 0) +
			(stateCounts.working || 0) +
			(stateCounts.review || 0) +
			(stateCounts.completed || 0) +
			(stateCounts.starting || 0) +
			(stateCounts.idle || 0);
	});

	// Streak calculation
	const streak = $derived.by(() => {
		if (allClosedTasks.length === 0) return 0;

		const tasksByDate = new Map<string, number>();
		for (const task of allClosedTasks) {
			if (!task.updated_at) continue;
			const date = new Date(task.updated_at).toISOString().split('T')[0];
			tasksByDate.set(date, (tasksByDate.get(date) || 0) + 1);
		}

		let streakCount = 0;
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		for (let i = 0; i < 365; i++) {
			const checkDate = new Date(today);
			checkDate.setDate(checkDate.getDate() - i);
			const dateStr = checkDate.toISOString().split('T')[0];

			if (tasksByDate.has(dateStr)) {
				streakCount++;
			} else if (i > 0) {
				break;
			} else {
				continue;
			}
		}

		return streakCount;
	});

	// Fetch completed tasks
	async function fetchCompletedToday() {
		if (completedTasksInFlight) {
			completedTasksAbortController?.abort();
		}

		const controller = new AbortController();
		completedTasksAbortController = controller;
		completedTasksInFlight = true;

		try {
			// Only fetch tasks closed today — avoids pulling entire closed task history
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const closedAfter = today.toISOString();
			const response = await fetch(`/api/tasks?status=closed&closedAfter=${encodeURIComponent(closedAfter)}`, {
				signal: controller.signal
			});
			if (!response.ok) return;

			const data = await response.json();

			allClosedTasks = data.tasks || [];

			// Server already filters by closedAfter — just sort
			const completedToday = [...allClosedTasks].sort((a: CompletedTask, b: CompletedTask) =>
				new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
			);

			const newCount = completedToday.length;

			if (newCount > completedCount && completedCount > 0) {
				justIncremented = true;
				if (justIncrementedTimeout) clearTimeout(justIncrementedTimeout);
				justIncrementedTimeout = setTimeout(() => {
					justIncremented = false;
					justIncrementedTimeout = null;
				}, 1000);

				const crossedMilestone = MILESTONES.find(m => newCount >= m && completedCount < m);
				if (crossedMilestone) {
					hitMilestone = true;
					milestoneNumber = crossedMilestone;
					if (hitMilestoneTimeout) clearTimeout(hitMilestoneTimeout);
					hitMilestoneTimeout = setTimeout(() => {
						hitMilestone = false;
						hitMilestoneTimeout = null;
					}, 2000);
				}
			}

			completedCount = newCount;
			tasks = completedToday;
			loading = false;
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				return;
			}
			console.error('Error fetching completed tasks:', error);
			loading = false;
		} finally {
			if (completedTasksAbortController === controller) {
				completedTasksAbortController = null;
			}
			completedTasksInFlight = false;
		}
	}

	onMount(() => {
		fetchCompletedToday();
		completedTasksInterval = setInterval(fetchCompletedToday, 30000);
		return () => {
			if (completedTasksInterval) {
				clearInterval(completedTasksInterval);
				completedTasksInterval = null;
			}
		};
	});

	onDestroy(() => {
		if (dropdownTimeout) {
			clearTimeout(dropdownTimeout);
			dropdownTimeout = null;
		}
		if (searchDebounceTimer) {
			clearTimeout(searchDebounceTimer);
			searchDebounceTimer = null;
		}
		if (justIncrementedTimeout) {
			clearTimeout(justIncrementedTimeout);
			justIncrementedTimeout = null;
		}
		if (hitMilestoneTimeout) {
			clearTimeout(hitMilestoneTimeout);
			hitMilestoneTimeout = null;
		}
		if (completedTasksInterval) {
			clearInterval(completedTasksInterval);
			completedTasksInterval = null;
		}
		if (completedTasksAbortController) {
			completedTasksAbortController.abort();
			completedTasksAbortController = null;
		}
	});

	// Focus search input when dropdown opens
	$effect(() => {
		if (showDropdown && searchInputRef) {
			// Small delay to ensure the dropdown is rendered
			requestAnimationFrame(() => {
				searchInputRef?.focus();
			});
		}
	});

	// Dropdown handlers
	function handleMouseEnter() {
		if (dropdownTimeout) clearTimeout(dropdownTimeout);
		showDropdown = true;
	}

	function handleMouseLeave() {
		dropdownTimeout = setTimeout(() => {
			showDropdown = false;
			searchQuery = ''; // Clear search when dropdown closes
			debouncedSearchQuery = ''; // Also clear debounced query immediately
		}, 150);
	}

	// Format helpers
	function timeAgo(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);

		if (diffMins < 1) return 'just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours}h ago`;
		return `${Math.floor(diffHours / 24)}d ago`;
	}

	function formatTokensCompact(tokens: number): string {
		if (!isFinite(tokens) || tokens < 0) return '0';
		if (tokens >= 1_000_000_000) return `${(tokens / 1_000_000_000).toFixed(1)}B`;
		if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
		if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
		return tokens.toString();
	}

	function formatCostCompact(cost: number): string {
		if (!isFinite(cost) || cost < 0) return '$0';
		if (cost >= 1_000) return `$${(cost / 1_000).toFixed(1)}K`;
		return `$${Math.round(cost)}`;
	}

	function getLocalDateStr(date: Date): string {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	}

	// Filter tasks based on debounced search query (optimized for performance)
	const filteredTasks = $derived.by(() => {
		if (!debouncedSearchQuery.trim()) return allClosedTasks;

		const query = debouncedSearchQuery.toLowerCase().trim();
		const results: CompletedTask[] = [];

		// Early termination: stop once we have enough results for display
		const MAX_RESULTS = 150; // tasksByDay already limits to 150

		for (const task of allClosedTasks) {
			if (results.length >= MAX_RESULTS) break;

			// Check id first (shortest, most likely to match for task searches)
			if (task.id.toLowerCase().includes(query)) {
				results.push(task);
				continue;
			}

			// Check title
			const title = task.title || '';
			if (title.toLowerCase().includes(query)) {
				results.push(task);
				continue;
			}

			// Check assignee last (least common search target)
			const assignee = task.assignee || '';
			if (assignee.toLowerCase().includes(query)) {
				results.push(task);
			}
		}

		return results;
	});

	// Group tasks by day
	interface DayGroup {
		date: string;
		label: string;
		tasks: CompletedTask[];
	}

	const tasksByDay = $derived.by(() => {
		const groups = new Map<string, DayGroup>();
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const todayStr = getLocalDateStr(today);
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);
		const yesterdayStr = getLocalDateStr(yesterday);

		const sorted = [...filteredTasks]
			.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
			.slice(0, 150);

		for (const task of sorted) {
			if (!task.updated_at) continue;
			const taskDate = new Date(task.updated_at);
			const dateStr = getLocalDateStr(taskDate);

			if (!groups.has(dateStr)) {
				let label: string;
				if (dateStr === todayStr) {
					label = 'Today';
				} else if (dateStr === yesterdayStr) {
					label = 'Yesterday';
				} else {
					label = taskDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
				}
				groups.set(dateStr, { date: dateStr, label, tasks: [] });
			}
			groups.get(dateStr)!.tasks.push(task);
		}

		return Array.from(groups.values()).slice(0, 14);
	});

	// Multi-project sparkline data
	const multiSeriesData = $derived.by(() => {
		if (!multiProjectData || multiProjectData.length === 0) return undefined;

		return multiProjectData.map((point) => {
			const projects: Record<string, { tokens: number; cost: number }> = {};
			for (const p of point.projects) {
				projects[p.project] = { tokens: p.tokens, cost: p.cost };
			}
			return {
				timestamp: point.timestamp,
				projects,
				total: { tokens: point.totalTokens, cost: point.totalCost }
			};
		});
	});

	const projectMeta = $derived.by(() => {
		if (!multiProjectData || multiProjectData.length === 0) return undefined;

		const projectTotals = new Map<string, number>();
		for (const point of multiProjectData) {
			for (const p of point.projects) {
				projectTotals.set(p.project, (projectTotals.get(p.project) || 0) + p.tokens);
			}
		}

		const meta: Array<{ name: string; color: string; totalTokens: number }> = [];
		for (const [name, totalTokens] of projectTotals.entries()) {
			meta.push({ name, color: projectColors[name] || '#888888', totalTokens });
		}

		return meta.sort((a, b) => b.totalTokens - a.totalTokens);
	});

	const isMultiProject = $derived(multiSeriesData && multiSeriesData.length > 0);

	// Open task detail
	function openTaskDetail(taskId: string) {
		showDropdown = false;
		selectedTaskId = taskId;
		detailDrawerOpen = true;
	}

	// Open history drawer
	function openHistory() {
		showDropdown = false;
		historyDrawerOpen = true;
	}

	function handleHistoryTaskClick(taskId: string) {
		historyDrawerOpen = false;
		selectedTaskId = taskId;
		detailDrawerOpen = true;
	}
</script>

<!-- Combined Activity Badge -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="relative flex items-center"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
>
	<span
		class="h-7 px-2 py-0.5 rounded text-xs font-mono flex items-center gap-2 transition-all duration-300 cursor-pointer"
		class:badge-pop={justIncremented}
		class:badge-milestone={hitMilestone}
		style="
			background: oklch(0.18 0.01 250);
			border: 1px solid oklch(0.40 0.05 200);
			color: oklch(0.70 0.05 200);
		"
	>
		<!-- Agent state dots (compact) -->
		{#if hasStateCounts && stateCounts}
			<div class="flex items-center gap-0.5">
				{#if stateCounts.needsInput > 0}
					<div class="flex items-center gap-0.5" title="{stateCounts.needsInput} needs input">
						<span class="relative flex h-2 w-2">
							<span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style="background: {STATE_COLORS.needsInput};"></span>
							<span class="relative inline-flex rounded-full h-2 w-2" style="background: {STATE_COLORS.needsInput};"></span>
						</span>
						<span class="mt-0.75 text-[10px] font-bold" style="color: {STATE_COLORS.needsInput};">{stateCounts.needsInput}</span>
					</div>
				{/if}
				{#if stateCounts.review > 0}
					<div class="flex items-center gap-0.5" title="{stateCounts.review} in review">
						<span class="relative flex h-2 w-2">
							<span class="animate-pulse absolute inline-flex h-full w-full rounded-full opacity-75" style="background: {STATE_COLORS.review};"></span>
							<span class="relative inline-flex rounded-full h-2 w-2" style="background: {STATE_COLORS.review};"></span>
						</span>
						<span class="mt-0.75 text-[10px] font-bold" style="color: {STATE_COLORS.review};">{stateCounts.review}</span>
					</div>
				{/if}
				{#if stateCounts.working > 0}
					<div class="flex items-center gap-0.5" title="{stateCounts.working} working">
						<span class="inline-flex rounded-full h-2 w-2" style="background: {STATE_COLORS.working};"></span>
						<span class="mt-0.75 text-[10px] font-bold" style="color: {STATE_COLORS.working};">{stateCounts.working}</span>
					</div>
				{/if}
				{#if stateCounts.starting && stateCounts.starting > 0}
					<div class="flex items-center gap-0.5" title="{stateCounts.starting} starting">
						<span class="inline-flex rounded-full h-2 w-2" style="background: {STATE_COLORS.starting};"></span>
						<span class="mt-0.75 text-[10px] font-bold" style="color: {STATE_COLORS.starting};">{stateCounts.starting}</span>
					</div>
				{/if}
				{#if stateCounts.completed > 0}
					<div class="flex items-center gap-0.5" title="{stateCounts.completed} session complete">
						<span class="inline-flex rounded-full h-2 w-2" style="background: {STATE_COLORS.completed};"></span>
						<span class="mt-0.75 text-[10px] font-bold" style="color: {STATE_COLORS.completed};">{stateCounts.completed}</span>
					</div>
				{/if}
				{#if stateCounts.idle && stateCounts.idle > 0}
					<div class="flex items-center gap-0.5" title="{stateCounts.idle} idle">
						<span class="inline-flex rounded-full h-2 w-2" style="background: {STATE_COLORS.idle};"></span>
						<span class="mt-0.75 text-[10px] font-bold" style="color: {STATE_COLORS.idle};">{stateCounts.idle}</span>
					</div>
				{/if}
			</div>
		{:else if activeAgentCount > 0}
			<!-- Fallback: single count -->
			<div class="flex items-center gap-1">
				<span class="relative flex h-2 w-2">
					<span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style="background: oklch(0.70 0.18 150);"></span>
					<span class="relative inline-flex rounded-full h-2 w-2" style="background: oklch(0.70 0.18 150);"></span>
				</span>
				<span class="mt-0.5 text-[10px] font-bold">{activeAgentCount}</span>
			</div>
		{/if}

		<!-- Separator -->
		{#if (hasStateCounts || activeAgentCount > 0) && completedCount > 0}
			<span class="w-px h-3 mx-0.5" style="background: oklch(0.35 0.02 250);"></span>
		{/if}

		<!-- Tasks completed (star) -->
		<div class="flex items-center gap-1" class:star-glow={completedCount > 0}>
			<span class="relative flex items-center justify-center">
				{#if completedCount > 0 && (justIncremented || hitMilestone)}
					<span class="absolute inset-0 animate-ping-once opacity-75">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5" style="color: oklch(0.80 0.20 85);">
							<path fill-rule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clip-rule="evenodd" />
						</svg>
					</span>
				{/if}
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5 relative z-10" style="color: {completedCount > 0 ? 'oklch(0.75 0.20 85)' : 'oklch(0.50 0.02 250)'};">
					<path fill-rule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clip-rule="evenodd" />
				</svg>
			</span>
			{#if loading}
				<span class="opacity-50">-</span>
			{:else}
				<AnimatedDigits value={completedCount.toString()} class="font-medium" style="color: {completedCount > 0 ? 'oklch(0.75 0.20 85)' : 'oklch(0.50 0.02 250)'};" />
			{/if}
		</div>

		<!-- Dropdown chevron -->
		<svg
			class="w-3 h-3 ml-0.5 transition-transform {showDropdown ? 'rotate-180' : ''}"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
			style="color: oklch(0.50 0.02 250);"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
		</svg>
	</span>

	<!-- Dropdown Panel -->
	{#if showDropdown}
		<div class="dropdown-panel">
			<!-- Search bar -->
			<div class="search-bar">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="search-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
				</svg>
				<input
					type="text"
					class="search-input"
					placeholder="Search tasks..."
					bind:value={searchQuery}
					bind:this={searchInputRef}
					onclick={(e) => e.stopPropagation()}
					onkeydown={(e) => e.stopPropagation()}
				/>
				{#if searchQuery}
					<button
						class="clear-btn"
						onclick={(e) => { e.stopPropagation(); searchQuery = ''; debouncedSearchQuery = ''; }}
						aria-label="Clear search"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
						</svg>
					</button>
				{/if}
				{#if searchQuery && filteredTasks.length !== allClosedTasks.length}
					<span class="match-count">{filteredTasks.length}</span>
				{/if}
			</div>

			<!-- Header: Sparkline + Tokens + Cost -->
			<div class="dropdown-header">
				<!-- Sparkline -->
				<div class="flex-1 min-w-[100px] h-[24px]">
					{#if isMultiProject}
						<Sparkline
							{multiSeriesData}
							{projectMeta}
							width="100%"
							height={24}
							showTooltip={true}
							showGrid={false}
							showStyleToolbar={false}
							showLegend={false}
						/>
					{:else if sparklineData && sparklineData.length > 0}
						<Sparkline
							data={sparklineData}
							width="100%"
							height={24}
							colorMode="usage"
							showTooltip={true}
							showGrid={false}
							showStyleToolbar={false}
						/>
					{:else}
						<div class="h-full flex items-center justify-center text-[10px] opacity-50">No data</div>
					{/if}
				</div>

				<!-- Tokens -->
				<div class="flex items-center gap-1 px-2 py-1 rounded" style="background: oklch(0.20 0.02 260);">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3" style="color: oklch(0.60 0.10 260);">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
					</svg>
					<span class="text-[11px] font-mono font-medium" style="color: oklch(0.75 0.10 260);">
						{formatTokensCompact(tokensToday)}
					</span>
				</div>

				<!-- Cost -->
				<div class="flex items-center gap-1 px-2 py-1 rounded" style="background: oklch(0.20 0.04 145);">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3" style="color: oklch(0.60 0.12 145);">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<AnimatedCost value={costToday} format={formatCostCompact} class="text-[11px] font-mono font-medium" style="color: oklch(0.75 0.12 145);" />
				</div>
			</div>

			<!-- Agent State Breakdown (if any) -->
			{#if hasStateCounts && stateCounts}
				<div class="px-3 py-2 border-b" style="border-color: oklch(0.25 0.01 250);">
					<div class="text-[10px] font-mono uppercase tracking-wider mb-1.5" style="color: oklch(0.50 0.02 250);">
						Active Sessions
					</div>
					<div class="flex flex-wrap gap-2">
						{#if stateCounts.needsInput > 0}
							<div class="flex items-center gap-1">
								<span class="w-2 h-2 rounded-full" style="background: {STATE_COLORS.needsInput};"></span>
								<span class="text-xs" style="color: {STATE_COLORS.needsInput};">{stateCounts.needsInput} needs input</span>
							</div>
						{/if}
						{#if stateCounts.review > 0}
							<div class="flex items-center gap-1">
								<span class="w-2 h-2 rounded-full" style="background: {STATE_COLORS.review};"></span>
								<span class="text-xs" style="color: {STATE_COLORS.review};">{stateCounts.review} in review</span>
							</div>
						{/if}
						{#if stateCounts.working > 0}
							<div class="flex items-center gap-1">
								<span class="w-2 h-2 rounded-full" style="background: {STATE_COLORS.working};"></span>
								<span class="text-xs" style="color: {STATE_COLORS.working};">{stateCounts.working} working</span>
							</div>
						{/if}
						{#if stateCounts.starting && stateCounts.starting > 0}
							<div class="flex items-center gap-1">
								<span class="w-2 h-2 rounded-full" style="background: {STATE_COLORS.starting};"></span>
								<span class="text-xs" style="color: {STATE_COLORS.starting};">{stateCounts.starting} starting</span>
							</div>
						{/if}
						{#if stateCounts.completed > 0}
							<div class="flex items-center gap-1">
								<span class="w-2 h-2 rounded-full" style="background: {STATE_COLORS.completed};"></span>
								<span class="text-xs" style="color: {STATE_COLORS.completed};">{stateCounts.completed} complete</span>
							</div>
						{/if}
						{#if stateCounts.idle && stateCounts.idle > 0}
							<div class="flex items-center gap-1">
								<span class="w-2 h-2 rounded-full" style="background: {STATE_COLORS.idle};"></span>
								<span class="text-xs" style="color: {STATE_COLORS.idle};">{stateCounts.idle} idle</span>
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Tasks Completed Header -->
			<div
				class="px-3 py-2 border-b flex items-center justify-between"
				style="border-color: oklch(0.25 0.01 250); background: oklch(0.15 0.02 250);"
			>
				<span class="text-xs font-semibold" style="color: oklch(0.80 0.15 85);">
					{#if searchQuery}
						{filteredTasks.length} of {allClosedTasks.length} task{allClosedTasks.length === 1 ? '' : 's'}
					{:else}
						{completedCount} task{completedCount === 1 ? '' : 's'} completed today
					{/if}
				</span>
				{#if streak > 1 && !searchQuery}
					<span class="text-[10px] px-1.5 py-0.5 rounded" style="background: oklch(0.25 0.10 30); color: oklch(0.80 0.15 30);">
						{streak} day streak
					</span>
				{/if}
			</div>

			<!-- Task list -->
			<div class="max-h-[300px] overflow-y-auto">
				{#if filteredTasks.length === 0 && searchQuery}
					<div class="px-3 py-4 text-center text-xs" style="color: oklch(0.50 0.02 250);">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 mx-auto mb-2 opacity-50">
							<path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
						</svg>
						No tasks match "{searchQuery}"
					</div>
				{:else if allClosedTasks.length === 0}
					<div class="px-3 py-4 text-center text-xs" style="color: oklch(0.50 0.02 250);">
						No completed tasks yet
					</div>
				{:else}
					{#each tasksByDay as dayGroup}
						<div class="day-header">
							<span class="day-label">{dayGroup.label}</span>
							<span class="day-count">{dayGroup.tasks.length}</span>
						</div>
						{#each dayGroup.tasks as task}
							<button
								class="task-row"
								onclick={() => openTaskDetail(task.id)}
							>
								<div class="flex items-start justify-between gap-2 w-full">
									<div class="flex-1 min-w-0 text-left">
										<div class="text-xs font-mono truncate" style="color: oklch(0.85 0.02 250);">
											{task.title || task.id}
										</div>
										<div class="flex items-center gap-2 mt-0.5">
											<span class="text-[10px] font-mono" style="color: {getProjectColor(task.id)};">
												{task.id}
											</span>
											{#if task.assignee}
												<span class="text-[10px]" style="color: oklch(0.60 0.10 145);">
													by {task.assignee}
												</span>
											{/if}
										</div>
									</div>
									<span class="text-[10px] whitespace-nowrap" style="color: oklch(0.50 0.02 250);">
										{timeAgo(task.updated_at)}
									</span>
								</div>
							</button>
						{/each}
					{/each}
				{/if}
			</div>

			<!-- Milestone celebration -->
			{#if hitMilestone}
				<div
					class="px-3 py-2 text-center text-xs font-bold animate-pulse"
					style="background: oklch(0.25 0.15 85); color: oklch(0.90 0.20 85);"
				>
					{milestoneNumber} tasks milestone!
				</div>
			{/if}

			<!-- View History Button -->
			<button
				class="view-history-btn"
				onclick={openHistory}
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
				</svg>
				View Full History
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
					<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
				</svg>
			</button>
		</div>
	{/if}
</div>

<!-- Task History Drawer -->
<TaskHistoryDrawer
	bind:isOpen={historyDrawerOpen}
	onTaskClick={handleHistoryTaskClick}
/>

<!-- Task Detail Drawer -->
<TaskDetailDrawer
	bind:taskId={selectedTaskId}
	bind:isOpen={detailDrawerOpen}
/>

<style>
	/* Glow effect for star */
	.star-glow {
		filter: drop-shadow(0 0 3px oklch(0.75 0.20 85 / 0.5));
	}

	/* Pop animation on increment */
	.badge-pop {
		animation: badge-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.badge-milestone {
		animation: badge-milestone 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
		box-shadow: 0 0 20px oklch(0.75 0.20 85 / 0.6);
	}

	@keyframes badge-pop {
		0% { transform: scale(1); }
		50% { transform: scale(1.15); }
		100% { transform: scale(1); }
	}

	@keyframes badge-milestone {
		0% { transform: scale(1); }
		25% { transform: scale(1.25); }
		50% { transform: scale(1.1); }
		75% { transform: scale(1.2); }
		100% { transform: scale(1); }
	}

	.animate-ping-once {
		animation: ping-once 0.6s cubic-bezier(0, 0, 0.2, 1) forwards;
	}

	@keyframes ping-once {
		0% { transform: scale(1); opacity: 1; }
		100% { transform: scale(2); opacity: 0; }
	}

	/* Dropdown panel */
	.dropdown-panel {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 0.25rem;
		z-index: 50;
		min-width: 360px;
		max-width: 450px;
		border-radius: 0.5rem;
		box-shadow: 0 10px 40px oklch(0 0 0 / 0.4);
		overflow: hidden;
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.35 0.02 250);
		animation: dropdown-slide 0.2s ease-out;
		transform-origin: top right;
	}

	/* Uses global @keyframes dropdown-slide from app.css */

	/* Dropdown header with sparkline and badges */
	.dropdown-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: oklch(0.14 0.02 250);
		border-bottom: 1px solid oklch(0.25 0.01 250);
	}

	/* Day header */
	.day-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.375rem 0.75rem;
		background: oklch(0.14 0.02 250);
		border-bottom: 1px solid oklch(0.25 0.01 250);
		position: sticky;
		top: 0;
		z-index: 1;
	}

	.day-label {
		font-size: 0.65rem;
		font-weight: 600;
		color: oklch(0.70 0.10 85);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-family: ui-monospace, monospace;
	}

	.day-count {
		font-size: 0.6rem;
		color: oklch(0.50 0.02 250);
		padding: 0.125rem 0.375rem;
		background: oklch(0.22 0.02 250);
		border-radius: 8px;
	}

	/* Task row */
	.task-row {
		display: block;
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: transparent;
		border: none;
		border-bottom: 1px solid oklch(0.25 0.01 250);
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.task-row:last-of-type {
		border-bottom: none;
	}

	.task-row:hover {
		background: oklch(0.25 0.02 250);
	}

	/* View History Button */
	.view-history-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.625rem 0.75rem;
		background: oklch(0.22 0.04 200 / 0.5);
		border: none;
		border-top: 1px solid oklch(0.30 0.02 250);
		color: oklch(0.70 0.10 200);
		font-size: 0.7rem;
		font-weight: 500;
		font-family: ui-monospace, monospace;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.view-history-btn:hover {
		background: oklch(0.28 0.06 200 / 0.6);
		color: oklch(0.85 0.12 200);
	}

	/* Search bar */
	.search-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: oklch(0.14 0.02 250);
		border-bottom: 1px solid oklch(0.25 0.01 250);
	}

	.search-icon {
		width: 0.875rem;
		height: 0.875rem;
		color: oklch(0.50 0.02 250);
		flex-shrink: 0;
	}

	.search-input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		outline: none;
		font-size: 0.75rem;
		font-family: ui-monospace, monospace;
		color: oklch(0.85 0.02 250);
	}

	.search-input::placeholder {
		color: oklch(0.45 0.02 250);
	}

	.clear-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 0.25rem;
		background: oklch(0.25 0.02 250);
		border: none;
		cursor: pointer;
		color: oklch(0.60 0.02 250);
		flex-shrink: 0;
		transition: all 0.15s ease;
	}

	.clear-btn:hover {
		background: oklch(0.30 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	.match-count {
		font-size: 0.625rem;
		font-family: ui-monospace, monospace;
		font-weight: 600;
		color: oklch(0.70 0.12 200);
		background: oklch(0.25 0.06 200 / 0.5);
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		flex-shrink: 0;
	}
</style>
