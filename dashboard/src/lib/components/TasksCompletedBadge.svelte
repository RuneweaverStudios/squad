<script lang="ts">
	/**
	 * TasksCompletedBadge Component
	 * Displays count of tasks completed today with celebratory animation
	 *
	 * Features:
	 * - Star icon with count
	 * - Hover dropdown showing completed tasks
	 * - Milestone celebrations (5, 10, 25, 50)
	 * - Consecutive day streak counter
	 * - Pulse animation when count increments
	 * - Click to open task history drawer
	 */

	import { onMount } from 'svelte';
	import AnimatedDigits from './AnimatedDigits.svelte';
	import TaskHistoryDrawer from './TaskHistoryDrawer.svelte';
	import TaskDetailDrawer from './TaskDetailDrawer.svelte';
	import { getProjectColor } from '$lib/utils/projectColors';

	interface Props {
		compact?: boolean;
	}

	let { compact = false }: Props = $props();

	// History drawer state
	let historyDrawerOpen = $state(false);

	// Task detail drawer state
	let detailDrawerOpen = $state(false);
	let selectedTaskId = $state<string | null>(null);

	// Task type
	interface CompletedTask {
		id: string;
		title: string;
		assignee?: string;
		updated_at: string;
	}

	// State
	let tasks = $state<CompletedTask[]>([]);
	let allClosedTasks = $state<CompletedTask[]>([]);
	let count = $state(0);
	let previousCount = $state(0);
	let justIncremented = $state(false);
	let hitMilestone = $state(false);
	let milestoneNumber = $state(0);
	let loading = $state(true);
	let showDropdown = $state(false);
	let dropdownTimeout: ReturnType<typeof setTimeout> | null = null;

	// Milestones
	const MILESTONES = [5, 10, 25, 50, 100];

	// Calculate streak (consecutive days with completions)
	const streak = $derived.by(() => {
		if (allClosedTasks.length === 0) return 0;

		// Group tasks by date (YYYY-MM-DD)
		const tasksByDate = new Map<string, number>();
		for (const task of allClosedTasks) {
			if (!task.updated_at) continue;
			const date = new Date(task.updated_at).toISOString().split('T')[0];
			tasksByDate.set(date, (tasksByDate.get(date) || 0) + 1);
		}

		// Count consecutive days backwards from today
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
				// Allow today to have 0 completions if streak started yesterday
				break;
			} else {
				// Today has no completions, check if streak is from yesterday
				continue;
			}
		}

		return streakCount;
	});

	// Fetch tasks completed today
	async function fetchCompletedToday() {
		try {
			const response = await fetch('/api/tasks?status=closed');
			if (!response.ok) return;

			const data = await response.json();
			const today = new Date();
			today.setHours(0, 0, 0, 0);

			// Store all closed tasks for streak calculation
			allClosedTasks = data.tasks || [];

			// Filter tasks closed today
			const completedToday = allClosedTasks.filter((task: CompletedTask) => {
				if (!task.updated_at) return false;
				const taskDate = new Date(task.updated_at);
				return taskDate >= today;
			});

			// Sort by most recent first
			completedToday.sort((a, b) =>
				new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
			);

			const newCount = completedToday.length;

			// Detect increment for celebration
			if (newCount > count && count > 0) {
				justIncremented = true;
				setTimeout(() => {
					justIncremented = false;
				}, 1000);

				// Check for milestone
				const crossedMilestone = MILESTONES.find(m => newCount >= m && count < m);
				if (crossedMilestone) {
					hitMilestone = true;
					milestoneNumber = crossedMilestone;
					setTimeout(() => {
						hitMilestone = false;
					}, 2000);
				}
			}

			previousCount = count;
			count = newCount;
			tasks = completedToday;
			loading = false;
		} catch (error) {
			console.error('Error fetching completed tasks:', error);
			loading = false;
		}
	}

	onMount(() => {
		fetchCompletedToday();
		// Refresh every 30 seconds
		const interval = setInterval(fetchCompletedToday, 30000);
		return () => clearInterval(interval);
	});

	// Dropdown handlers
	function handleMouseEnter() {
		if (dropdownTimeout) clearTimeout(dropdownTimeout);
		showDropdown = true;
	}

	function handleMouseLeave() {
		dropdownTimeout = setTimeout(() => {
			showDropdown = false;
		}, 150);
	}

	// Format time ago
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

	// Group tasks by day for dropdown
	interface DayGroup {
		date: string;
		label: string;
		tasks: CompletedTask[];
	}

	// Helper to get local date string (YYYY-MM-DD)
	function getLocalDateStr(date: Date): string {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	}

	const tasksByDay = $derived.by(() => {
		const groups = new Map<string, DayGroup>();
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const todayStr = getLocalDateStr(today);
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);
		const yesterdayStr = getLocalDateStr(yesterday);

		// Sort all closed tasks by date descending, limit to 150 most recent
		// (plenty for 14 days of history, avoids processing 1000+ tasks)
		const sorted = [...allClosedTasks]
			.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
			.slice(0, 150);

		for (const task of sorted) {
			if (!task.updated_at) continue;
			const taskDate = new Date(task.updated_at);
			const dateStr = getLocalDateStr(taskDate);

			if (!groups.has(dateStr)) {
				// Format label
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

		// Return last 14 days of activity
		return Array.from(groups.values()).slice(0, 14);
	});

	// Open history drawer
	function openHistory() {
		showDropdown = false;
		historyDrawerOpen = true;
	}

	// Open task detail directly from dropdown
	function openTaskDetail(taskId: string) {
		showDropdown = false;
		selectedTaskId = taskId;
		detailDrawerOpen = true;
	}

	// Handle task click from drawer - open task detail
	function handleHistoryTaskClick(taskId: string) {
		historyDrawerOpen = false;
		selectedTaskId = taskId;
		detailDrawerOpen = true;
	}
</script>

<!-- Tasks Completed Badge with Dropdown -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="relative flex items-center"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
>
	<span
		class="pl-2 pr-0.5 py-0.5 rounded text-xs font-mono flex items-center gap-1.5 transition-all duration-300 cursor-pointer"
		class:badge-pop={justIncremented}
		class:badge-milestone={hitMilestone}
		style="
			background: oklch(0.18 0.01 250);
			border: 1px solid {count > 0 ? 'oklch(0.55 0.18 85)' : 'oklch(0.35 0.02 250)'};
			color: {count > 0 ? 'oklch(0.75 0.20 85)' : 'oklch(0.55 0.02 250)'};
		"
	>
		<!-- Star icon with optional pulse -->
		<span class="relative flex items-center justify-center" class:star-glow={count > 0}>
			{#if count > 0 && (justIncremented || hitMilestone)}
				<!-- Celebration burst on increment -->
				<span class="absolute inset-0 animate-ping-once opacity-75">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5" style="color: oklch(0.80 0.20 85);">
						<path fill-rule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clip-rule="evenodd" />
					</svg>
				</span>
			{/if}
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5 relative z-10">
				<path fill-rule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clip-rule="evenodd" />
			</svg>
		</span>

		{#if loading}
			<span class="opacity-50 mr-2">-</span>
		{:else}
			<AnimatedDigits value={count.toString()} class="font-medium mr-1.5" />
		{/if}

		<!-- Streak indicator - slides out on hover -->
		{#if streak > 1}
			<span
				class="streak-slide"
				class:streak-visible={showDropdown}
				title="{streak} day streak!"
			>
				<span class="text-[10px]">🔥</span>
				<span class="mt-0.25 text-[10px] font-medium mr-2">{streak}</span>
			</span>
		{/if}
	</span>

	<!-- Dropdown -->
	{#if showDropdown && allClosedTasks.length > 0}
		<div
			class="dropdown-panel"
		>
			<!-- Header -->
			<div
				class="px-3 py-2 border-b flex items-center justify-between"
				style="border-color: oklch(0.30 0.02 250); background: oklch(0.15 0.02 250);"
			>
				<span class="text-xs font-semibold" style="color: oklch(0.80 0.15 85);">
					⭐ {count} task{count === 1 ? '' : 's'} completed today
				</span>
				{#if streak > 1}
					<span class="text-[10px] px-1.5 py-0.5 rounded" style="background: oklch(0.25 0.10 30); color: oklch(0.80 0.15 30);">
						🔥 {streak} day streak
					</span>
				{/if}
			</div>

			<!-- Task list grouped by day -->
			<div class="max-h-[400px] overflow-y-auto">
				{#each tasksByDay as dayGroup}
					<!-- Day header -->
					<div class="day-header">
						<span class="day-label">{dayGroup.label}</span>
						<span class="day-count">{dayGroup.tasks.length}</span>
					</div>
					<!-- Tasks for this day -->
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
			</div>

			<!-- Milestone celebration message -->
			{#if hitMilestone}
				<div
					class="px-3 py-2 text-center text-xs font-bold animate-pulse"
					style="background: oklch(0.25 0.15 85); color: oklch(0.90 0.20 85);"
				>
					🎉 {milestoneNumber} tasks milestone! 🎉
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
	/* Glow effect for star when count > 0 */
	.star-glow {
		filter: drop-shadow(0 0 3px oklch(0.75 0.20 85 / 0.5));
	}

	/* Pop animation on increment */
	.badge-pop {
		animation: badge-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	/* Extra celebration for milestones */
	.badge-milestone {
		animation: badge-milestone 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
		box-shadow: 0 0 20px oklch(0.75 0.20 85 / 0.6);
	}

	@keyframes badge-pop {
		0% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.15);
		}
		100% {
			transform: scale(1);
		}
	}

	@keyframes badge-milestone {
		0% {
			transform: scale(1);
		}
		25% {
			transform: scale(1.25);
		}
		50% {
			transform: scale(1.1);
		}
		75% {
			transform: scale(1.2);
		}
		100% {
			transform: scale(1);
		}
	}

	/* Single ping animation for star burst */
	.animate-ping-once {
		animation: ping-once 0.6s cubic-bezier(0, 0, 0.2, 1) forwards;
	}

	@keyframes ping-once {
		0% {
			transform: scale(1);
			opacity: 1;
		}
		100% {
			transform: scale(2);
			opacity: 0;
		}
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

	/* Task row in dropdown */
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

	/* Day header in dropdown */
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

	/* Streak indicator - slides out on hover */
	.streak-slide {
		display: flex;
		align-items: center;
		gap: 0.125rem;
		margin-left: 0.125rem;
		padding-left: 0.375rem;
		border-left: 1px solid oklch(0.35 0.02 250);
		color: oklch(0.70 0.15 30);
		max-width: 0;
		opacity: 0;
		overflow: hidden;
		transition: max-width 0.25s ease, opacity 0.2s ease, padding 0.25s ease;
		padding-left: 0;
		border-left-width: 0;
	}

	.streak-visible {
		max-width: 50px;
		opacity: 1;
		padding-left: 0.375rem;
		border-left-width: 1px;
	}

	/* Dropdown panel with slide animation */
	.dropdown-panel {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 0.25rem;
		z-index: 50;
		min-width: 300px;
		max-width: 600px;
		border-radius: 0.5rem;
		box-shadow: 0 10px 40px oklch(0 0 0 / 0.4);
		overflow: hidden;
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.35 0.02 250);
		animation: dropdown-slide 0.2s ease-out;
		transform-origin: top right;
	}

	@keyframes dropdown-slide {
		from {
			opacity: 0;
			transform: translateY(-8px) scale(0.96);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
</style>
