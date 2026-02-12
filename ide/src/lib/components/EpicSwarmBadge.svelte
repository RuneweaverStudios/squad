<script lang="ts">
	/**
	 * EpicSwarmBadge Component
	 *
	 * Shows swarm controls in the topbar - always visible.
	 * When an epic is active, shows progress and task breakdown.
	 * When inactive, shows quick actions for spawning agents.
	 *
	 * Features:
	 * - Progress indicator (3/10 tasks) when epic active
	 * - Hover dropdown with task list grouped by status
	 * - Spawn more agents button
	 * - Swarm config, Run All Ready, Run Epic actions when inactive
	 * - Review settings preview
	 */

	import { fly } from "svelte/transition";
	import { onMount } from "svelte";
	import {
		epicQueueState,
		getReadyTasks,
		getInProgressTasks,
		getBlockedTasks,
		canSpawnMore,
		spawnNextAgent,
		stopEpic,
		refreshEpicState,
		initializeFromPersisted,
		hasPersistedEpic,
		type EpicChild,
		type SpawnResult,
	} from "$lib/stores/epicQueueStore.svelte";
	import { SPAWN_STAGGER_MS } from "$lib/config/spawnConfig";
	import { isSpawnModalOpen } from "$lib/stores/drawerStore";
	import {
		startSpawning,
		stopSpawning,
		startBulkSpawn,
		endBulkSpawn,
	} from "$lib/stores/spawningTasks";
	import { getMaxSessions } from "$lib/stores/preferences.svelte";

	/** Epic with ready children for Run Epic feature */
	interface EpicWithReady {
		id: string;
		title: string;
		project: string;
		readyCount: number;
		totalCount: number;
	}

	/** Review rule structure */
	interface ReviewRule {
		type: string;
		maxAutoPriority: number;
		note?: string;
	}

	interface Props {
		/** Ready task count for Run All Ready */
		readyTaskCount?: number;
		/** Active agent count */
		activeAgentCount?: number;
		/** Open epics with ready children */
		epicsWithReady?: EpicWithReady[];
		/** Current review rules */
		reviewRules?: ReviewRule[];
		/** Project colors map */
		projectColors?: Record<string, string>;
	}

	let {
		readyTaskCount = 0,
		activeAgentCount = 0,
		epicsWithReady = [],
		reviewRules = [],
		projectColors = {},
	}: Props = $props();

	// Auto-refresh interval (10 seconds)
	const REFRESH_INTERVAL = 10000;

	// Swarm action state (for inactive mode)
	let swarmLoading = $state(false);
	let runningEpicId = $state<string | null>(null);
	let showEpicSubmenu = $state(false);
	let showReviewSubmenu = $state(false);

	// Max sessions from user preferences (reactive)
	const maxSessions = $derived(getMaxSessions());

	// Calculate available slots and effective spawn count for Run All Ready
	const availableSlots = $derived(Math.max(0, maxSessions - activeAgentCount));
	const effectiveSpawnCount = $derived(
		Math.min(readyTaskCount, availableSlots),
	);

	// Get epics with ready children count
	const epicsWithReadyChildren = $derived(
		epicsWithReady
			.filter((e) => e.readyCount > 0)
			.sort((a, b) => b.readyCount - a.readyCount),
	);

	// Get review summary for display
	const reviewSummary = $derived.by(() => {
		if (!reviewRules || reviewRules.length === 0) return null;

		// Find the common threshold (most common maxAutoPriority)
		const thresholds = reviewRules.map((r) => r.maxAutoPriority);
		const commonThreshold = thresholds[0] ?? 3;

		// Count how many types auto-proceed at each level
		const autoTypes = reviewRules.filter((r) => r.maxAutoPriority >= 0).length;
		const reviewAlways = reviewRules.filter(
			(r) => r.maxAutoPriority < 0,
		).length;

		return {
			commonThreshold,
			autoTypes,
			reviewAlways,
			description: `P0-P${commonThreshold} auto-proceed`,
		};
	});

	// Navigate to Swarm Config settings
	function handleOpenSwarmConfig() {
		showDropdown = false;
		window.location.href = '/config?tab=swarm';
	}

	// Swarm - spawn one agent per ready task up to MAX_SESSIONS limit
	async function handleSwarm() {
		swarmLoading = true;
		startBulkSpawn();
		showDropdown = false;
		try {
			// Step 1: Get current active sessions to calculate available slots
			const workResponse = await fetch("/api/work");
			const workData = await workResponse.json();
			const activeSessionCount = workData.count || 0;
			const currentMaxSessions = getMaxSessions();
			const currentAvailableSlots = Math.max(
				0,
				currentMaxSessions - activeSessionCount,
			);

			if (currentAvailableSlots === 0) {
				throw new Error(
					`All ${currentMaxSessions} session slots are in use. Close some sessions first.`,
				);
			}

			// Step 2: Get ready tasks
			const readyResponse = await fetch("/api/tasks/ready");
			const readyData = await readyResponse.json();

			if (!readyResponse.ok || !readyData.tasks?.length) {
				throw new Error("No ready tasks available");
			}

			// Limit tasks to available slots
			const tasksToSpawn = readyData.tasks.slice(0, currentAvailableSlots);
			const results = [];

			// Step 3: Spawn an agent for each ready task (up to limit)
			for (let i = 0; i < tasksToSpawn.length; i++) {
				const task = tasksToSpawn[i];
				startSpawning(task.id);
				try {
					const response = await fetch("/api/work/spawn", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ taskId: task.id }),
					});
					const data = await response.json();

					if (!response.ok) {
						results.push({
							taskId: task.id,
							success: false,
							error: data.message || "Failed to spawn",
						});
						stopSpawning(task.id);
					} else {
						results.push({
							taskId: task.id,
							success: true,
							agentName: data.session?.agentName,
						});
						setTimeout(() => stopSpawning(task.id), 2000);
					}
				} catch (err) {
					results.push({
						taskId: task.id,
						success: false,
						error: err instanceof Error ? err.message : "Unknown error",
					});
					stopSpawning(task.id);
				}

				// Stagger between spawns (except last one)
				if (i < tasksToSpawn.length - 1) {
					await new Promise((resolve) => setTimeout(resolve, SPAWN_STAGGER_MS));
				}
			}

			const successCount = results.filter((r) => r.success).length;
			console.log(
				`Swarm complete: ${successCount}/${tasksToSpawn.length} agents spawned`,
				results,
			);

			if (successCount === 0) {
				throw new Error("Failed to spawn any agents");
			}
		} catch (error) {
			console.error("Swarm failed:", error);
			alert(error instanceof Error ? error.message : "Failed to spawn agents");
		} finally {
			swarmLoading = false;
			endBulkSpawn();
		}
	}

	// Run Epic - spawn agents for all ready children of an epic
	async function handleRunEpic(epicId: string) {
		if (runningEpicId || swarmLoading) return;

		runningEpicId = epicId;
		showEpicSubmenu = false;
		showDropdown = false;

		try {
			// Check available session slots
			const workResponse = await fetch("/api/work");
			const workData = await workResponse.json();
			const activeSessionCount = workData.count || 0;
			const currentMaxSessions = getMaxSessions();
			const epicAvailableSlots = Math.max(0, currentMaxSessions - activeSessionCount);

			if (epicAvailableSlots === 0) {
				throw new Error(`All ${currentMaxSessions} session slots are in use. Close some sessions first.`);
			}

			// Fetch epic's children with ready status
			const response = await fetch(`/api/epics/${epicId}/children`);
			if (!response.ok) {
				throw new Error("Failed to fetch epic children");
			}
			const data = await response.json();

			// Filter to ready children only
			const allReadyChildren = data.children.filter(
				(c: { isBlocked: boolean; status: string }) =>
					!c.isBlocked && c.status !== "closed" && c.status !== "in_progress",
			);

			if (allReadyChildren.length === 0) {
				console.log("No ready tasks in epic", epicId);
				return;
			}

			// Cap to available session slots
			const readyChildren = allReadyChildren.slice(0, epicAvailableSlots);

			startBulkSpawn();

			// Spawn agents for each ready child
			const staggerMs = 6000;
			for (let i = 0; i < readyChildren.length; i++) {
				const task = readyChildren[i];
				startSpawning(task.id);

				try {
					const spawnResponse = await fetch("/api/work/spawn", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ taskId: task.id }),
					});

					if (!spawnResponse.ok) {
						console.error("Failed to spawn for", task.id);
						stopSpawning(task.id);
					} else {
						console.log("Spawned agent for epic child:", task.id);
						setTimeout(() => stopSpawning(task.id), 2000);
					}
				} catch (err) {
					console.error("Spawn error for", task.id, err);
					stopSpawning(task.id);
				}

				// Stagger between spawns
				if (i < readyChildren.length - 1) {
					await new Promise((resolve) => setTimeout(resolve, staggerMs));
				}
			}

			console.log(
				`Run Epic complete: spawned ${readyChildren.length} agents for ${epicId}`,
			);
		} catch (err) {
			console.error("Run Epic failed:", err);
		} finally {
			runningEpicId = null;
			endBulkSpawn();
		}
	}

	// Dropdown state
	let showDropdown = $state(false);
	let isRefreshing = $state(false);

	// Track initialization state
	let isInitializing = $state(false);

	// Initialize and restore persisted epic (async, runs separately)
	async function initializeEpic() {
		// If not already active, check for persisted epic and restore
		if (!epicQueueState.isActive && hasPersistedEpic()) {
			console.log("[EpicSwarmBadge] Restoring persisted epic...");
			isInitializing = true;
			try {
				await initializeFromPersisted();
			} finally {
				isInitializing = false;
			}
		}

		// Initial refresh
		if (epicQueueState.isActive) {
			refreshEpicState();
		}
	}

	// Auto-refresh when component mounts and epic is active
	onMount(() => {
		// Debug log
		console.log(
			"[EpicSwarmBadge] Mount - isActive:",
			epicQueueState.isActive,
			"epicId:",
			epicQueueState.epicId,
		);

		// Initialize async (don't await to avoid cleanup function issue)
		initializeEpic();

		// Set up interval
		const interval = setInterval(() => {
			if (epicQueueState.isActive && !isRefreshing) {
				refreshEpicState();
			}
		}, REFRESH_INTERVAL);

		return () => clearInterval(interval);
	});

	// Manual refresh handler
	async function handleRefresh() {
		if (isRefreshing) return;
		isRefreshing = true;
		await refreshEpicState();
		isRefreshing = false;
	}
	let dropdownTimeout: ReturnType<typeof setTimeout> | null = null;
	let isSpawningMore = $state(false);
	let spawnMessage = $state<string | null>(null);

	// Derived state from epic queue
	const isActive = $derived(epicQueueState.isActive);
	const epicId = $derived(epicQueueState.epicId);

	// Debug: log when state changes
	$effect(() => {
		console.log(
			"[EpicSwarmBadge] State changed - isActive:",
			isActive,
			"epicId:",
			epicId,
		);
	});
	const epicTitle = $derived(epicQueueState.epicTitle);
	const children = $derived(epicQueueState.children);
	const progress = $derived(epicQueueState.progress);
	const settings = $derived(epicQueueState.settings);
	const runningAgents = $derived(epicQueueState.runningAgents);
	const isSpawning = $derived(epicQueueState.isSpawning);

	// Group children by status
	const completedTasks = $derived(
		children.filter((c) => c.status === "completed"),
	);
	const inProgressTasks = $derived(
		children.filter((c) => c.status === "in_progress"),
	);
	const readyTasks = $derived(children.filter((c) => c.status === "ready"));
	const blockedTasks = $derived(children.filter((c) => c.status === "blocked"));

	// Use inProgressTasks.length as the true count of working agents on this epic
	// (runningAgents only tracks agents spawned through this store)
	const epicActiveAgentCount = $derived(inProgressTasks.length);

	// Calculate how many more agents we can spawn for this epic
	const epicAvailableSlots = $derived(
		settings.mode === "sequential"
			? epicActiveAgentCount === 0
				? 1
				: 0
			: Math.max(0, settings.maxConcurrent - epicActiveAgentCount),
	);
	const canSpawn = $derived(epicAvailableSlots > 0 && readyTasks.length > 0);
	const spawnableCount = $derived(
		Math.min(epicAvailableSlots, readyTasks.length),
	);

	// Dropdown handlers
	function handleMouseEnter() {
		if (dropdownTimeout) clearTimeout(dropdownTimeout);
		showDropdown = true;
	}

	function handleMouseLeave() {
		dropdownTimeout = setTimeout(() => {
			showDropdown = false;
		}, 200);
	}

	// Spawn more agents up to maxConcurrent
	async function handleSpawnMore() {
		if (!canSpawn || isSpawningMore) return;

		isSpawningMore = true;
		spawnMessage = null;

		const results: SpawnResult[] = [];
		const toSpawn = spawnableCount;

		try {
			for (let i = 0; i < toSpawn; i++) {
				const result = await spawnNextAgent();
				if (result) {
					results.push(result);
					if (!result.success) break;
				} else {
					break; // No more tasks or at capacity
				}

				// Stagger spawns
				if (i < toSpawn - 1) {
					await new Promise((r) => setTimeout(r, SPAWN_STAGGER_MS));
				}
			}

			const successCount = results.filter((r) => r.success).length;
			if (successCount > 0) {
				spawnMessage = `Spawned ${successCount} agent${successCount > 1 ? "s" : ""}`;
			} else if (results.length > 0) {
				spawnMessage = results[0].error || "Failed to spawn";
			}
		} catch (err) {
			spawnMessage = err instanceof Error ? err.message : "Spawn failed";
		} finally {
			isSpawningMore = false;
			// Clear message after 3s
			setTimeout(() => {
				spawnMessage = null;
			}, 3000);
		}
	}

	// Stop the epic swarm
	function handleStop() {
		if (
			confirm(
				"Stop the epic swarm? Running agents will continue but no new agents will spawn.",
			)
		) {
			stopEpic();
			showDropdown = false;
		}
	}

	// Format time since epic started
	function formatDuration(start: Date | null): string {
		if (!start) return "";
		const diffMs = Date.now() - start.getTime();
		const mins = Math.floor(diffMs / 60000);
		if (mins < 60) return `${mins}m`;
		const hours = Math.floor(mins / 60);
		return `${hours}h ${mins % 60}m`;
	}

	// Get status icon
	function getStatusIcon(status: EpicChild["status"]): string {
		switch (status) {
			case "completed":
				return "✅";
			case "in_progress":
				return "⚡";
			case "ready":
				return "⏳";
			case "blocked":
				return "🔒";
			default:
				return "○";
		}
	}

	// Get status color - using CSS variable values
	function getStatusColor(status: EpicChild["status"]): string {
		switch (status) {
			case "completed":
				return "var(--color-success)";
			case "in_progress":
				return "var(--color-warning)";
			case "ready":
				return "var(--color-info)";
			case "blocked":
				return "var(--color-neutral)";
			default:
				return "var(--color-base-content)";
		}
	}
</script>

{#if isInitializing}
	<!-- Loading indicator while restoring persisted epic -->
	<div class="flex items-center gap-2 px-2 py-1">
		<span class="loading loading-spinner loading-xs text-primary"></span>
		<span class="text-xs text-base-content/60">Restoring epic...</span>
	</div>
{:else}
	<!-- Swarm Badge - always visible -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="relative flex items-center"
		onmouseenter={handleMouseEnter}
		onmouseleave={handleMouseLeave}
	>
		{#if isActive && epicId}
			<!-- Active Epic Badge -->
			<button
				type="button"
				class="epic-badge"
				class:spawning={isSpawning || isSpawningMore}
			>
				<!-- Mountain icon -->
				<span class="text-sm">🏔️</span>

				<!-- Epic ID (truncated) -->
				<span class="font-mono text-xs font-medium truncate max-w-[80px]">
					{epicId}
				</span>

				<!-- Progress -->
				<span class="progress-pill progress-pill-success">
					{progress.completed}/{progress.total}
				</span>

				<!-- Dropdown arrow -->
				<svg
					class="w-3 h-3 transition-transform"
					class:rotate-180={showDropdown}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M19.5 8.25l-7.5 7.5-7.5-7.5"
					/>
				</svg>
			</button>
		{:else}
			<!-- Inactive Swarm Badge -->
			<button type="button" class="swarm-badge" class:loading={swarmLoading}>
				<!-- Lightning icon -->
				<svg
					class="w-3.5 h-3.5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
					/>
				</svg>

				<span
					class="font-mono text-[10px] font-medium uppercase tracking-wide pt-0.75"
					>Swarm</span
				>

				<!-- Dropdown arrow -->
				<svg
					class="w-3 h-3 transition-transform"
					class:rotate-180={showDropdown}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M19.5 8.25l-7.5 7.5-7.5-7.5"
					/>
				</svg>
			</button>
		{/if}

		<!-- Dropdown Panel -->
		{#if showDropdown}
			<div class="dropdown-panel" transition:fly={{ y: -8, duration: 150 }}>
				{#if isActive && epicId}
					<!-- Active Epic Dropdown Content -->
					<!-- Header -->
					<div class="panel-header">
						<div class="flex flex-col gap-0.5">
							<span class="text-xs font-semibold text-secondary-content">
								🏔️ {epicTitle || epicId}
							</span>
							<span class="text-[10px] font-mono text-base-content/50">
								{epicId} • {formatDuration(epicQueueState.startedAt)}
							</span>
						</div>
						<div class="flex items-center gap-2">
							<!-- Agent count -->
							<span class="agent-count-badge">
								{inProgressTasks.length}/{settings.maxConcurrent} agents
							</span>
						</div>
					</div>

					<!-- Progress bar -->
					<div class="progress-section">
						<div class="flex items-center justify-between mb-1">
							<span class="text-[10px] text-base-content/60">Progress</span>
							<span class="text-[10px] font-mono text-success">
								{Math.round((progress.completed / progress.total) * 100)}%
							</span>
						</div>
						<div class="progress-bar-bg">
							<div
								class="progress-bar-fill"
								style="width: {(progress.completed / progress.total) * 100}%;"
							></div>
						</div>
						<!-- Status summary -->
						<div class="flex items-center gap-3 mt-2 text-[10px]">
							<span class="text-success">✅ {completedTasks.length}</span>
							<span class="text-warning">⚡ {inProgressTasks.length}</span>
							<span class="text-info">⏳ {readyTasks.length}</span>
							<span class="text-neutral-content">🔒 {blockedTasks.length}</span>
						</div>
					</div>

					<!-- Task list -->
					<div class="max-h-[300px] overflow-y-auto">
						{#each children as task (task.id)}
							<div
								class="task-row"
								style="border-left: 2px solid {getStatusColor(task.status)};"
							>
								<div class="flex items-center gap-2 flex-1 min-w-0">
									<span class="text-sm flex-shrink-0"
										>{getStatusIcon(task.status)}</span
									>
									<div class="flex-1 min-w-0">
										<div
											class="text-[11px] font-mono truncate text-base-content/80"
										>
											{task.id}
										</div>
										<div class="text-[10px] truncate text-base-content/50">
											{task.title}
										</div>
									</div>
								</div>
								{#if task.assignee}
									<span class="assignee-badge">
										{task.assignee}
									</span>
								{:else if task.status === "ready"}
									<span class="queued-badge"> queued </span>
								{/if}
							</div>
						{/each}
					</div>

					<!-- Controls footer -->
					<div class="panel-footer">
						{#if spawnMessage}
							<div
								class="text-[10px] text-center py-1 mb-2 {spawnMessage.includes(
									'Failed',
								)
									? 'text-error'
									: 'text-success'}"
							>
								{spawnMessage}
							</div>
						{/if}

						<div class="flex items-center gap-2">
							<!-- Spawn more button -->
							<button
								type="button"
								class="control-btn spawn-btn"
								onclick={handleSpawnMore}
								disabled={!canSpawn || isSpawningMore}
							>
								{#if isSpawningMore}
									<span class="loading loading-spinner loading-xs"></span>
								{:else}
									<svg
										class="w-3.5 h-3.5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M12 4.5v15m7.5-7.5h-15"
										/>
									</svg>
								{/if}
								<span>
									{#if canSpawn}
										Spawn {spawnableCount} more
									{:else if readyTasks.length === 0}
										No ready tasks
									{:else}
										At capacity
									{/if}
								</span>
							</button>

							<!-- Refresh button -->
							<button
								type="button"
								class="control-btn refresh-btn"
								onclick={handleRefresh}
								disabled={isRefreshing}
								title="Refresh status from database"
							>
								{#if isRefreshing}
									<span class="loading loading-spinner loading-xs"></span>
								{:else}
									<svg
										class="w-3.5 h-3.5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
										/>
									</svg>
								{/if}
							</button>

							<!-- Stop button -->
							<button
								type="button"
								class="control-btn stop-btn"
								onclick={handleStop}
							>
								<svg
									class="w-3.5 h-3.5"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z"
									/>
								</svg>
								<span>Stop</span>
							</button>
						</div>

						<!-- Next up preview -->
						{#if readyTasks.length > 0 && epicAvailableSlots > 0}
							<div class="next-up-preview">
								<span class="text-[9px] text-base-content/50">
									Next up: {readyTasks
										.slice(0, 3)
										.map((t) => t.id)
										.join(", ")}
									{#if readyTasks.length > 3}
										<span class="text-base-content/40"
											>+{readyTasks.length - 3} more</span
										>
									{/if}
								</span>
							</div>
						{/if}
					</div>
				{:else}
					<!-- Inactive Swarm Dropdown Content -->
					<!-- Quick Actions Section -->
					<div class="p-2">
						<div
							class="text-[9px] font-mono uppercase tracking-wider mb-2"
							style="color: oklch(0.55 0.02 250);"
						>
							Spawn Options
						</div>

						<!-- Swarm Config (opens modal) -->
						<button class="swarm-menu-item" onclick={handleOpenSwarmConfig}>
							<svg
								class="w-4 h-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="1.5"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
								/>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
								/>
							</svg>
							<div class="flex-1">
								<div class="font-semibold">Swarm Settings</div>
								<div class="text-[10px]" style="color: oklch(0.55 0.02 250);">
									Model, sessions, review rules
								</div>
							</div>
							<svg
								class="w-3 h-3 opacity-50"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M8.25 4.5l7.5 7.5-7.5 7.5"
								/>
							</svg>
						</button>

						<!-- Run All Ready -->
						<button
							class="swarm-menu-item"
							onclick={handleSwarm}
							disabled={readyTaskCount === 0 || availableSlots === 0}
							title={availableSlots === 0
								? `All ${maxSessions} session slots in use`
								: `Spawn ${effectiveSpawnCount} agent${effectiveSpawnCount !== 1 ? "s" : ""}`}
						>
							<svg
								class="w-4 h-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="1.5"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
								/>
							</svg>
							<div class="flex-1">
								<div class="font-semibold">Run All Ready</div>
								<div class="text-[10px]" style="color: oklch(0.55 0.02 250);">
									{#if availableSlots === 0}
										No slots available (max {maxSessions})
									{:else if readyTaskCount > availableSlots}
										Spawn {availableSlots} of {readyTaskCount} tasks (max {maxSessions})
									{:else}
										Spawn agent per ready task
									{/if}
								</div>
							</div>
							{#if readyTaskCount > 0}
								<span
									class="px-1.5 py-0.5 rounded text-[9px] font-bold"
									style="background: {availableSlots === 0
										? 'oklch(0.35 0.05 250)'
										: effectiveSpawnCount < readyTaskCount
											? 'oklch(0.45 0.15 60)'
											: 'oklch(0.45 0.15 30)'}; color: oklch(0.95 0.02 30);"
									>{effectiveSpawnCount}{#if effectiveSpawnCount < readyTaskCount}/{readyTaskCount}{/if}</span
								>
							{/if}
						</button>

						<!-- Run Epic (with submenu) -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="relative"
							onmouseenter={() => (showEpicSubmenu = true)}
							onmouseleave={() => (showEpicSubmenu = false)}
						>
							<button
								class="swarm-menu-item w-full"
								disabled={epicsWithReadyChildren.length === 0 ||
									runningEpicId !== null}
							>
								{#if runningEpicId}
									<span class="loading loading-spinner loading-xs"></span>
								{:else}
									<svg
										class="w-4 h-4"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="1.5"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
										/>
									</svg>
								{/if}
								<div class="flex-1">
									<div class="font-semibold">Run Epic</div>
									<div class="text-[10px]" style="color: oklch(0.55 0.02 250);">
										Spawn agents for epic tasks
									</div>
								</div>
								{#if epicsWithReadyChildren.length > 0}
									<span
										class="px-1.5 py-0.5 rounded text-[9px] font-bold"
										style="background: oklch(0.50 0.15 280); color: oklch(0.95 0.02 280);"
										>{epicsWithReadyChildren.length}</span
									>
								{/if}
								<svg
									class="w-3 h-3 opacity-50"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M8.25 4.5l7.5 7.5-7.5 7.5"
									/>
								</svg>
							</button>

							<!-- Epic Submenu -->
							{#if showEpicSubmenu && epicsWithReadyChildren.length > 0}
								<div
									class="absolute left-full top-0 ml-1 min-w-[220px] rounded-lg shadow-xl z-50 overflow-hidden"
									style="
										background: linear-gradient(180deg, oklch(0.20 0.02 250) 0%, oklch(0.16 0.02 250) 100%);
										border: 1px solid oklch(0.35 0.02 250);
									"
								>
									<div
										class="px-3 py-2 border-b"
										style="border-color: oklch(0.28 0.02 250);"
									>
										<span
											class="text-[9px] font-mono uppercase tracking-wider"
											style="color: oklch(0.55 0.02 250);"
										>
											Select Epic
										</span>
									</div>
									<div class="py-1 max-h-[200px] overflow-y-auto">
										{#each epicsWithReadyChildren as epic}
											<button
												class="w-full px-3 py-2 text-left text-xs font-mono flex items-center gap-2 transition-colors"
												style="color: oklch(0.80 0.02 250);"
												onmouseenter={(e) =>
													(e.currentTarget.style.background =
														"oklch(0.28 0.03 250)")}
												onmouseleave={(e) =>
													(e.currentTarget.style.background = "transparent")}
												onclick={() => handleRunEpic(epic.id)}
												disabled={runningEpicId === epic.id}
											>
												<span
													class="w-2 h-2 rounded-full flex-shrink-0"
													style="background: {projectColors[epic.project] ||
														'oklch(0.60 0.15 280)'};"
												></span>
												<div class="flex-1 min-w-0">
													<div
														class="truncate"
														style="color: oklch(0.70 0.10 280);"
													>
														{epic.id}
													</div>
													<div
														class="truncate text-[10px]"
														style="color: oklch(0.60 0.02 250);"
													>
														{epic.title}
													</div>
												</div>
												<span
													class="px-1.5 py-0.5 rounded text-[9px] font-bold flex-shrink-0"
													style="background: oklch(0.45 0.15 145); color: oklch(0.95 0.02 145);"
													>{epic.readyCount}</span
												>
											</button>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</div>

					<!-- Review Settings Section -->
					<div class="p-2 border-t" style="border-color: oklch(0.30 0.02 250);">
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="relative"
							onmouseenter={() => (showReviewSubmenu = true)}
							onmouseleave={() => (showReviewSubmenu = false)}
						>
							<button class="swarm-menu-item w-full">
								<svg
									class="w-4 h-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="1.5"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.573-3.007-9.963-7.178z"
									/>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
									/>
								</svg>
								<div class="flex-1">
									<div class="font-semibold">Review Settings</div>
									{#if reviewSummary}
										<div
											class="text-[10px]"
											style="color: oklch(0.55 0.02 250);"
										>
											{reviewSummary.description}
										</div>
									{:else}
										<div
											class="text-[10px]"
											style="color: oklch(0.55 0.02 250);"
										>
											Auto-proceed thresholds
										</div>
									{/if}
								</div>
								<svg
									class="w-3 h-3 opacity-50"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M8.25 4.5l7.5 7.5-7.5 7.5"
									/>
								</svg>
							</button>

							<!-- Review Submenu -->
							{#if showReviewSubmenu}
								<div
									class="absolute left-full top-0 ml-1 min-w-[240px] rounded-lg shadow-xl z-50 overflow-hidden"
									style="
										background: linear-gradient(180deg, oklch(0.20 0.02 250) 0%, oklch(0.16 0.02 250) 100%);
										border: 1px solid oklch(0.35 0.02 250);
									"
								>
									<div
										class="px-3 py-2 border-b"
										style="border-color: oklch(0.28 0.02 250);"
									>
										<span
											class="text-[9px] font-mono uppercase tracking-wider"
											style="color: oklch(0.55 0.02 250);"
										>
											Review Rules
										</span>
									</div>
									<div class="p-2">
										<!-- Mini rule display -->
										{#if reviewRules && reviewRules.length > 0}
											<div class="grid grid-cols-2 gap-1 mb-2">
												{#each reviewRules as rule}
													{@const isAutoAll = rule.maxAutoPriority >= 4}
													{@const isReviewAll = rule.maxAutoPriority < 0}
													<div
														class="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono"
														style="background: oklch(0.25 0.02 250);"
													>
														<span
															class="capitalize"
															style="color: oklch(0.75 0.02 250);"
															>{rule.type}</span
														>
														<span
															class="ml-auto px-1 rounded text-[9px]"
															style="
																background: {isReviewAll
																? 'oklch(0.40 0.15 30)'
																: isAutoAll
																	? 'oklch(0.40 0.15 145)'
																	: 'oklch(0.35 0.10 200)'};
																color: {isReviewAll
																? 'oklch(0.90 0.12 30)'
																: isAutoAll
																	? 'oklch(0.90 0.12 145)'
																	: 'oklch(0.85 0.08 200)'};
															"
														>
															{#if isReviewAll}
																Review
															{:else if isAutoAll}
																Auto
															{:else}
																≤P{rule.maxAutoPriority}
															{/if}
														</span>
													</div>
												{/each}
											</div>
										{:else}
											<div
												class="text-xs text-center py-2"
												style="color: oklch(0.50 0.02 250);"
											>
												No rules configured
											</div>
										{/if}

										<!-- Legend -->
										<div
											class="flex items-center gap-3 text-[9px] mb-2 px-1"
											style="color: oklch(0.50 0.02 250);"
										>
											<div class="flex items-center gap-1">
												<span
													class="w-2 h-2 rounded"
													style="background: oklch(0.40 0.15 145);"
												></span>
												<span>Auto-proceed</span>
											</div>
											<div class="flex items-center gap-1">
												<span
													class="w-2 h-2 rounded"
													style="background: oklch(0.40 0.15 30);"
												></span>
												<span>Always review</span>
											</div>
										</div>

										<!-- Full settings link -->
										<a
											href="/config?tab=swarm"
											class="flex items-center justify-center gap-1.5 w-full py-1.5 rounded text-[10px] font-mono transition-colors"
											style="background: oklch(0.30 0.03 250); color: oklch(0.75 0.02 250);"
											onmouseenter={(e) => {
												e.currentTarget.style.background =
													"oklch(0.35 0.05 250)";
												e.currentTarget.style.color = "oklch(0.90 0.02 250)";
											}}
											onmouseleave={(e) => {
												e.currentTarget.style.background =
													"oklch(0.30 0.03 250)";
												e.currentTarget.style.color = "oklch(0.75 0.02 250)";
											}}
											onclick={() => {
												showDropdown = false;
												showReviewSubmenu = false;
											}}
										>
											<svg
												class="w-3 h-3"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												stroke-width="1.5"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.204-.107-.397.165-.71.505-.78.929l-.15.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z"
												/>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
												/>
											</svg>
											<span>Full Settings</span>
										</a>
									</div>
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Epic badge - industrial theme using CSS variables */
	.epic-badge {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem 0.25rem 0.375rem;
		border-radius: 0.375rem;
		background: var(--color-base-200);
		border: 1px solid var(--color-secondary);
		color: var(--color-secondary-content);
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.epic-badge:hover {
		background: var(--color-base-300);
		border-color: var(--color-secondary);
		filter: brightness(1.1);
	}

	.epic-badge.spawning {
		animation: pulse-glow 1.5s ease-in-out infinite;
	}

	@keyframes pulse-glow {
		0%,
		100% {
			box-shadow: 0 0 0 0
				color-mix(in oklch, var(--color-secondary) 0%, transparent);
		}
		50% {
			box-shadow: 0 0 12px 2px
				color-mix(in oklch, var(--color-secondary) 40%, transparent);
		}
	}

	/* Progress pill base and success variant */
	.progress-pill {
		font-size: 0.625rem;
		font-family: ui-monospace, monospace;
		padding: 0.125rem 0.375rem;
		border-radius: 9999px;
		font-weight: 600;
	}

	.progress-pill-success {
		background: oklch(from var(--color-success) l c h / 20%);
		color: var(--color-success);
	}

	/* Agent count badge */
	.agent-count-badge {
		font-size: 0.625rem;
		font-family: ui-monospace, monospace;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		background: var(--color-base-300);
		color: var(--color-base-content);
	}

	/* Progress section */
	.progress-section {
		padding: 0.5rem 0.75rem;
		background: var(--color-base-200);
	}

	.progress-bar-bg {
		height: 0.375rem;
		border-radius: 9999px;
		background: var(--color-base-300);
		overflow: hidden;
	}

	.progress-bar-fill {
		height: 100%;
		border-radius: 9999px;
		background: var(--color-success);
		transition: width 0.3s ease;
	}

	/* Dropdown panel - industrial dark theme */
	.dropdown-panel {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 0.375rem;
		z-index: 50;
		min-width: 320px;
		max-width: 400px;
		border-radius: 0.5rem;
		box-shadow: 0 10px 40px
			color-mix(in oklch, var(--color-base-content) 30%, transparent);
		overflow: hidden;
		background: var(--color-base-100);
		border: 1px solid var(--color-neutral);
	}

	.panel-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 0.75rem;
		background: var(--color-base-200);
		border-bottom: 1px solid var(--color-neutral);
	}

	/* Task row styling */
	.task-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: transparent;
		border-bottom: 1px solid var(--color-base-200);
		transition: background 0.1s ease;
	}

	.task-row:hover {
		background: var(--color-base-200);
	}

	.task-row:last-child {
		border-bottom: none;
	}

	/* Assignee and queued badges */
	.assignee-badge {
		font-size: 0.5625rem;
		font-family: ui-monospace, monospace;
		padding: 0.0625rem 0.25rem;
		border-radius: 0.25rem;
		background: oklch(from var(--color-warning) l c h / 20%);
		color: var(--color-warning);
	}

	.queued-badge {
		font-size: 0.5625rem;
		font-family: ui-monospace, monospace;
		padding: 0.0625rem 0.25rem;
		border-radius: 0.25rem;
		background: oklch(from var(--color-info) l c h / 15%);
		color: var(--color-info);
	}

	/* Panel footer */
	.panel-footer {
		padding: 0.75rem;
		background: var(--color-base-200);
		border-top: 1px solid var(--color-neutral);
	}

	/* Control buttons base */
	.control-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.625rem;
		border-radius: 0.375rem;
		font-size: 0.6875rem;
		font-weight: 500;
		font-family: ui-monospace, monospace;
		cursor: pointer;
		transition: all 0.15s ease;
		border: 1px solid transparent;
	}

	/* Spawn button - success themed */
	.spawn-btn {
		flex: 1;
		justify-content: center;
		background: oklch(from var(--color-success) l c h / 30%);
		color: var(--color-success);
		border-color: oklch(from var(--color-success) l c h / 50%);
	}

	.spawn-btn:hover:not(:disabled) {
		background: oklch(from var(--color-success) l c h / 40%);
	}

	.spawn-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Refresh button - info themed */
	.refresh-btn {
		background: oklch(from var(--color-info) l c h / 25%);
		color: var(--color-info);
		border-color: oklch(from var(--color-info) l c h / 40%);
		padding: 0.375rem;
	}

	.refresh-btn:hover:not(:disabled) {
		background: oklch(from var(--color-info) l c h / 35%);
	}

	.refresh-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Stop button - error themed */
	.stop-btn {
		background: oklch(from var(--color-error) l c h / 25%);
		color: var(--color-error);
		border-color: oklch(from var(--color-error) l c h / 40%);
	}

	.stop-btn:hover {
		background: oklch(from var(--color-error) l c h / 35%);
	}

	/* Next up preview section */
	.next-up-preview {
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--color-base-300);
	}

	/* Swarm badge - inactive state styling */
	.swarm-badge {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem 0.25rem 0.375rem;
		border-radius: 0.375rem;
		background: var(--color-base-200);
		border: 1px solid var(--color-neutral);
		color: var(--color-base-content);
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.swarm-badge:hover {
		background: var(--color-base-300);
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.swarm-badge.loading {
		opacity: 0.7;
		cursor: wait;
	}

	/* Swarm menu item - dropdown action styling */
	.swarm-menu-item {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: 100%;
		padding: 0.5rem 0.75rem;
		border-radius: 0.375rem;
		font-size: 0.6875rem;
		text-align: left;
		cursor: pointer;
		transition: all 0.15s ease;
		background: transparent;
		border: none;
		color: var(--color-base-content);
	}

	.swarm-menu-item:hover:not(:disabled) {
		background: var(--color-base-300);
	}

	.swarm-menu-item:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
