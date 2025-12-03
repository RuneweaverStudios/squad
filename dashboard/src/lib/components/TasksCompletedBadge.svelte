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
	 */

	import { onMount } from 'svelte';
	import AnimatedDigits from './AnimatedDigits.svelte';

	interface Props {
		compact?: boolean;
	}

	let { compact = false }: Props = $props();

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
</script>

<!-- Tasks Completed Badge with Dropdown -->
<div
	class="relative flex items-center"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
>
	<span
		class="px-2 py-0.5 rounded text-xs font-mono flex items-center gap-1.5 transition-all duration-300 cursor-pointer"
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
			<span class="opacity-50">-</span>
		{:else}
			<AnimatedDigits value={count.toString()} class="font-medium" />
		{/if}

		{#if !compact}
			<span style="color: oklch(0.50 0.02 250);">today</span>
		{/if}

		<!-- Streak indicator -->
		{#if streak > 1}
			<span
				class="mt-0.5 flex items-center gap-0.5 ml-0.5 pl-1.5 border-l"
				style="border-color: oklch(0.35 0.02 250); color: oklch(0.70 0.15 30);"
				title="{streak} day streak!"
			>
				<span class="text-[10px]">🔥</span>
				<span class="mt-0.25 text-[10px] font-medium">{streak}</span>
			</span>
		{/if}
	</span>

	<!-- Dropdown -->
	{#if showDropdown && count > 0}
		<div
			class="absolute top-full right-0 mt-1 z-50 min-w-[280px] max-w-[320px] rounded-lg shadow-xl overflow-hidden"
			style="
				background: oklch(0.18 0.02 250);
				border: 1px solid oklch(0.35 0.02 250);
			"
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

			<!-- Task list -->
			<div class="max-h-[300px] overflow-y-auto">
				{#each tasks.slice(0, 10) as task}
					<div
						class="px-3 py-2 border-b last:border-b-0 hover:bg-base-100/5 transition-colors"
						style="border-color: oklch(0.25 0.01 250);"
					>
						<div class="flex items-start justify-between gap-2">
							<div class="flex-1 min-w-0">
								<div class="text-xs font-mono truncate" style="color: oklch(0.85 0.02 250);">
									{task.title || task.id}
								</div>
								<div class="flex items-center gap-2 mt-0.5">
									<span class="text-[10px] font-mono" style="color: oklch(0.55 0.10 200);">
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
					</div>
				{/each}
				{#if tasks.length > 10}
					<div class="px-3 py-2 text-center text-[10px]" style="color: oklch(0.50 0.02 250);">
						+{tasks.length - 10} more
					</div>
				{/if}
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
		</div>
	{/if}
</div>

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
</style>
