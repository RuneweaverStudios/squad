<script lang="ts">
	/**
	 * TopBar Component - Horizontal utilities bar
	 *
	 * Simplified navigation bar containing only utility components:
	 * - Hamburger toggle (mobile only, for sidebar)
	 * - AgentCountBadge
	 * - TokenUsageBadge (tokens today, cost, sparkline)
	 * - CommandPalette
	 * - UserProfile
	 *
	 * Navigation buttons (List, Graph, Agents) removed - moved to Sidebar
	 * Project filtering removed - handled by TaskTable filter bar
	 *
	 * Props:
	 * - tokensToday: number (total tokens consumed today)
	 * - costToday: number (total cost today in USD)
	 * - sparklineData: DataPoint[] (24h sparkline data)
	 */

	import { page } from "$app/stores";
	import { get } from "svelte/store";
	import AgentCountBadge from "./AgentCountBadge.svelte";
	import TokenUsageBadge from "./TokenUsageBadge.svelte";
	import TasksCompletedBadge from "./TasksCompletedBadge.svelte";
	import ServersBadge from "./ServersBadge.svelte";
	import EpicSwarmBadge from "./EpicSwarmBadge.svelte";
	import UserProfile from "./UserProfile.svelte";
	import CommandPalette from "./CommandPalette.svelte";
	import Sparkline from "./Sparkline.svelte";
	import { getSparklineVisible } from "$lib/stores/preferences.svelte";
	import {
		openTaskDrawer,
		openTaskDetailDrawer,
		closeTaskDetailDrawer,
		isTaskDetailDrawerOpen,
		openProjectDrawer,
		isSpawnModalOpen,
		isStartDropdownOpen,
		closeStartDropdown,
		startDropdownOpenedViaKeyboard,
		toggleSidebar,
		isSidebarCollapsed,
	} from "$lib/stores/drawerStore";
	import {
		startSpawning,
		stopSpawning,
		startBulkSpawn,
		endBulkSpawn,
	} from "$lib/stores/spawningTasks";
	import { pickNextTask, type NextTaskResult } from "$lib/utils/pickNextTask";
	import {
		SORT_OPTIONS,
		initSort,
		handleSortClick,
		getSortBy,
		getSortDir,
		type SortOption,
	} from "$lib/stores/workSort.svelte.js";
	import {
		AGENT_SORT_OPTIONS,
		initAgentSort,
		handleAgentSortClick,
		getAgentSortBy,
		getAgentSortDir,
		type AgentSortOption,
	} from "$lib/stores/agentSort.svelte.js";
	import {
		SERVER_SORT_OPTIONS,
		initServerSort,
		handleServerSortClick,
		getServerSortBy,
		getServerSortDir,
		type ServerSortOption,
	} from "$lib/stores/serverSort.svelte.js";
	import { onMount, onDestroy } from "svelte";
	import { SPAWN_STAGGER_MS } from "$lib/config/spawnConfig";
	import { getMaxSessions } from "$lib/stores/preferences.svelte";

	// Sparkline visibility (reactive from preferences store)
	const sparklineVisible = $derived(getSparklineVisible());

	// Initialize sort stores on mount
	onMount(() => {
		initSort();
		initAgentSort();
		initServerSort();
	});

	// Check which page we're on for showing appropriate sort dropdown
	const isWorkPage = $derived($page.url.pathname === "/work");
	const isAgentsPage = $derived($page.url.pathname === "/agents");
	const isServersPage = $derived($page.url.pathname === "/servers");

	// Sort dropdown state (shared between work and agent pages)
	let showSortDropdown = $state(false);
	let sortHovered = $state(false);
	let sortDropdownTimeout: ReturnType<typeof setTimeout> | null = null;

	// Get current sort state reactively (work page)
	const currentSort = $derived(getSortBy());
	const currentDir = $derived(getSortDir());
	const currentSortLabel = $derived(
		SORT_OPTIONS.find((o) => o.value === currentSort)?.label ?? "Sort",
	);
	const currentSortIcon = $derived(
		SORT_OPTIONS.find((o) => o.value === currentSort)?.icon ?? "🔔",
	);

	// Get current sort state reactively (agents page)
	const currentAgentSort = $derived(getAgentSortBy());
	const currentAgentDir = $derived(getAgentSortDir());
	const currentAgentSortLabel = $derived(
		AGENT_SORT_OPTIONS.find((o) => o.value === currentAgentSort)?.label ??
			"Sort",
	);
	const currentAgentSortIcon = $derived(
		AGENT_SORT_OPTIONS.find((o) => o.value === currentAgentSort)?.icon ?? "🔔",
	);

	// Get current sort state reactively (servers page)
	const currentServerSort = $derived(getServerSortBy());
	const currentServerDir = $derived(getServerSortDir());
	const currentServerSortLabel = $derived(
		SERVER_SORT_OPTIONS.find((o) => o.value === currentServerSort)?.label ??
			"Sort",
	);
	const currentServerSortIcon = $derived(
		SERVER_SORT_OPTIONS.find((o) => o.value === currentServerSort)?.icon ??
			"🔔",
	);

	// Handle sort dropdown show/hide with delay
	function showSortMenu() {
		if (sortDropdownTimeout) clearTimeout(sortDropdownTimeout);
		showSortDropdown = true;
	}

	function hideSortMenuDelayed() {
		sortDropdownTimeout = setTimeout(() => {
			showSortDropdown = false;
		}, 150);
	}

	function keepSortMenuOpen() {
		if (sortDropdownTimeout) clearTimeout(sortDropdownTimeout);
	}

	function onSortSelect(value: SortOption) {
		handleSortClick(value);
		showSortDropdown = false;
	}

	function onAgentSortSelect(value: AgentSortOption) {
		handleAgentSortClick(value);
		showSortDropdown = false;
	}

	function onServerSortSelect(value: ServerSortOption) {
		handleServerSortClick(value);
		showSortDropdown = false;
	}

	// Global action loading states
	let newSessionLoading = $state(false);
	let swarmLoading = $state(false);

	// New Session - spawn a planning session in selected project
	async function handleNewSession(projectName: string) {
		newSessionLoading = true;
		showSessionDropdown = false;
		try {
			const projectPath = `/home/jw/code/${projectName}`;
			const response = await fetch("/api/work/spawn", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					attach: true,
					project: projectPath,
				}),
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.message || "Failed to spawn session");
			}
			console.log("New session in", projectName, ":", data);
		} catch (error) {
			console.error("New session failed:", error);
			alert(error instanceof Error ? error.message : "Failed to spawn session");
		} finally {
			newSessionLoading = false;
		}
	}

	// Swarm - spawn one agent per ready task up to MAX_SESSIONS limit
	async function handleSwarm() {
		swarmLoading = true;
		startBulkSpawn(); // Signal bulk spawn started for TaskTable animations
		try {
			// Step 1: Get current active sessions to calculate available slots
			const workResponse = await fetch("/api/work");
			const workData = await workResponse.json();
			const activeSessionCount = workData.count || 0;
			const currentMaxSessions = getMaxSessions(); // Get current preference value
			const availableSlots = Math.max(
				0,
				currentMaxSessions - activeSessionCount,
			);

			if (availableSlots === 0) {
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
			const tasksToSpawn = readyData.tasks.slice(0, availableSlots);
			const skippedCount = readyData.tasks.length - tasksToSpawn.length;
			const results = [];

			// Step 3: Spawn an agent for each ready task (up to limit)
			for (let i = 0; i < tasksToSpawn.length; i++) {
				const task = tasksToSpawn[i];
				startSpawning(task.id); // Signal this task is spawning for animation
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
						stopSpawning(task.id); // Clear animation on failure
					} else {
						results.push({
							taskId: task.id,
							success: true,
							agentName: data.session?.agentName,
						});
						// Keep spawning animation until TaskTable refreshes and sees the new status
						setTimeout(() => stopSpawning(task.id), 2000);
					}
				} catch (err) {
					results.push({
						taskId: task.id,
						success: false,
						error: err instanceof Error ? err.message : "Unknown error",
					});
					stopSpawning(task.id); // Clear animation on error
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

			// Show info if some tasks were skipped due to limit
			if (skippedCount > 0) {
				console.log(
					`Note: ${skippedCount} tasks skipped due to max sessions limit (${currentMaxSessions})`,
				);
			}
		} catch (error) {
			console.error("Swarm failed:", error);
			alert(error instanceof Error ? error.message : "Failed to spawn agents");
		} finally {
			swarmLoading = false;
			endBulkSpawn(); // Signal bulk spawn ended
		}
	}

	interface DataPoint {
		timestamp: string;
		tokens: number;
		cost: number;
	}

	/** Per-project token data from multi-project API */
	interface ProjectTokenData {
		project: string;
		tokens: number;
		cost: number;
		color: string;
	}

	/** Multi-project time-series data point from API */
	interface MultiProjectDataPoint {
		timestamp: string;
		totalTokens: number;
		totalCost: number;
		projects: ProjectTokenData[];
	}

	/** Ready task structure from /api/tasks/ready */
	interface ReadyTask {
		id: string;
		title: string;
		priority: number;
		type: string;
		project: string;
	}

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

	interface StateCounts {
		needsInput: number;
		working: number;
		review: number;
		completed: number;
		starting?: number;
		idle?: number;
	}

	interface Props {
		activeAgentCount?: number;
		totalAgentCount?: number;
		activeAgents?: string[];
		stateCounts?: StateCounts;
		tokensToday?: number;
		costToday?: number;
		sparklineData?: DataPoint[];
		/** Multi-project sparkline data (from ?multiProject=true API) */
		multiProjectData?: MultiProjectDataPoint[];
		/** Project colors map (from API response) */
		projectColors?: Record<string, string>;
		/** Number of ready tasks for Swarm button */
		readyTaskCount?: number;
		/** Ready tasks list for swarm dropdown */
		readyTasks?: ReadyTask[];
		/** Available projects for session spawning */
		projects?: string[];
		/** Currently selected project filter (for auto-detection) */
		selectedProject?: string;
		/** Open epics with ready children */
		epicsWithReady?: EpicWithReady[];
		/** Current review rules */
		reviewRules?: ReviewRule[];
	}

	let {
		activeAgentCount = 0,
		totalAgentCount = 0,
		activeAgents = [],
		stateCounts,
		tokensToday = 0,
		costToday = 0,
		sparklineData = [],
		multiProjectData,
		projectColors = {},
		readyTaskCount = 0,
		readyTasks = [],
		projects = [],
		selectedProject = "All Projects",
		epicsWithReady = [],
		reviewRules = [],
	}: Props = $props();

	// Session dropdown state
	let showSessionDropdown = $state(false);
	let sessionDropdownTimeout: ReturnType<typeof setTimeout> | null = null;

	// Swarm dropdown state
	let showSwarmDropdown = $state(false);
	let swarmDropdownTimeout: ReturnType<typeof setTimeout> | null = null;
	let spawningTaskId = $state<string | null>(null); // Track which single task is being spawned
	let startNextLoading = $state(false); // Track "Start Next" primary button loading
	let selectedProjectTab = $state<string | null>(null); // null = show all projects

	// Keyboard navigation state for dropdown
	let focusedTaskIndex = $state(-1); // -1 = nothing focused
	let dropdownRef: HTMLDivElement | null = $state(null);
	let openedViaKeyboard = $state(false); // Track if opened via Alt+S

	// Sync with global stores (for Alt+S keyboard shortcut)
	$effect(() => {
		const unsubscribeOpen = isStartDropdownOpen.subscribe((isOpen) => {
			if (isOpen) {
				showSwarmDropdown = true;
				// Clear any existing timeout
				if (swarmDropdownTimeout) {
					clearTimeout(swarmDropdownTimeout);
					swarmDropdownTimeout = null;
				}
			}
		});
		const unsubscribeKeyboard = startDropdownOpenedViaKeyboard.subscribe((viaKeyboard) => {
			if (viaKeyboard) {
				openedViaKeyboard = true;
				focusedTaskIndex = 0; // Focus first task when opened via keyboard
			}
		});
		return () => {
			unsubscribeOpen();
			unsubscribeKeyboard();
		};
	});

	// Handle keyboard navigation in dropdown
	function handleDropdownKeydown(event: KeyboardEvent) {
		if (!showSwarmDropdown) return;

		const taskCount = flatTaskList.length;

		switch (event.key) {
			case 'ArrowLeft':
				// Navigate to previous project tab
				event.preventDefault();
				if (selectedProjectTab === null) {
					// On "All" tab, wrap to last project
					selectedProjectTab = projectNames.length > 0 ? projectNames[projectNames.length - 1] : null;
				} else {
					const currentIndex = projectNames.indexOf(selectedProjectTab);
					if (currentIndex <= 0) {
						// First project or not found, go to "All"
						selectedProjectTab = null;
					} else {
						selectedProjectTab = projectNames[currentIndex - 1];
					}
				}
				// Reset task focus to first item when changing tabs
				focusedTaskIndex = 0;
				break;
			case 'ArrowRight':
				// Navigate to next project tab
				event.preventDefault();
				if (selectedProjectTab === null) {
					// On "All" tab, go to first project
					selectedProjectTab = projectNames.length > 0 ? projectNames[0] : null;
				} else {
					const currentIndex = projectNames.indexOf(selectedProjectTab);
					if (currentIndex >= projectNames.length - 1) {
						// Last project, wrap to "All"
						selectedProjectTab = null;
					} else {
						selectedProjectTab = projectNames[currentIndex + 1];
					}
				}
				// Reset task focus to first item when changing tabs
				focusedTaskIndex = 0;
				break;
			case 'ArrowDown':
				event.preventDefault();
				if (taskCount === 0) break;
				if (focusedTaskIndex < 0) {
					focusedTaskIndex = 0;
				} else {
					focusedTaskIndex = Math.min(focusedTaskIndex + 1, taskCount - 1);
				}
				scrollFocusedTaskIntoView();
				break;
			case 'ArrowUp':
				event.preventDefault();
				if (taskCount === 0) break;
				if (focusedTaskIndex < 0) {
					focusedTaskIndex = taskCount - 1;
				} else {
					focusedTaskIndex = Math.max(focusedTaskIndex - 1, 0);
				}
				scrollFocusedTaskIntoView();
				break;
			case 'Enter':
				event.preventDefault();
				if (focusedTaskIndex >= 0 && focusedTaskIndex < taskCount) {
					const task = flatTaskList[focusedTaskIndex];
					handleSpawnSingle(task.id);
					showSwarmDropdown = false;
					closeStartDropdown();
				}
				break;
			case ' ':
				// Space opens task detail drawer for the focused task
				event.preventDefault();
				if (focusedTaskIndex >= 0 && focusedTaskIndex < taskCount) {
					const task = flatTaskList[focusedTaskIndex];
					openTaskDetailDrawer(task.id);
					// Keep dropdown open so user can return to it
				}
				break;
			case 'Escape':
				// If task detail drawer is open, close it and stop - don't close the dropdown
				if (get(isTaskDetailDrawerOpen)) {
					event.preventDefault();
					event.stopPropagation();
					closeTaskDetailDrawer();
					// Return focus to dropdown after drawer closes
					setTimeout(() => dropdownRef?.focus(), 50);
					return;
				}
				// Close the dropdown
				event.preventDefault();
				showSwarmDropdown = false;
				closeStartDropdown();
				focusedTaskIndex = -1;
				openedViaKeyboard = false;
				break;
		}
	}

	// Scroll the focused task into view within the dropdown
	function scrollFocusedTaskIntoView() {
		setTimeout(() => {
			const focusedElement = dropdownRef?.querySelector(`[data-task-index="${focusedTaskIndex}"]`);
			if (focusedElement) {
				focusedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
			}
		}, 10);
	}

	// Focus dropdown when opened via keyboard and select first task
	$effect(() => {
		if (showSwarmDropdown && openedViaKeyboard && dropdownRef) {
			// Small delay to ensure DOM is ready
			setTimeout(() => {
				dropdownRef?.focus();
				// Auto-select first task for immediate arrow key navigation
				if (flatTaskList.length > 0 && focusedTaskIndex < 0) {
					focusedTaskIndex = 0;
				}
			}, 50);
		}
	});

	// Reset focus when dropdown closes
	$effect(() => {
		if (!showSwarmDropdown) {
			focusedTaskIndex = -1;
			openedViaKeyboard = false;
		}
	});

	// Epic submenu state
	let showEpicSubmenu = $state(false);
	let runningEpicId = $state<string | null>(null); // Track which epic is being run

	// Review settings submenu state
	let showReviewSubmenu = $state(false);

	// Task dropdown state
	let showTaskDropdown = $state(false);
	let taskDropdownTimeout: ReturnType<typeof setTimeout> | null = null;

	// Get actual project list (filter out "All Projects")
	const actualProjects = $derived(projects.filter((p) => p !== "All Projects"));

	// Max sessions from user preferences (reactive)
	const maxSessions = $derived(getMaxSessions());

	// Calculate available slots and effective spawn count for Run All Ready
	const availableSlots = $derived(Math.max(0, maxSessions - activeAgentCount));
	const effectiveSpawnCount = $derived(
		Math.min(readyTaskCount, availableSlots),
	);

	// Handle dropdown show/hide with delay
	function showDropdown() {
		if (sessionDropdownTimeout) clearTimeout(sessionDropdownTimeout);
		showSessionDropdown = true;
	}

	function hideDropdownDelayed() {
		sessionDropdownTimeout = setTimeout(() => {
			showSessionDropdown = false;
		}, 150);
	}

	function keepDropdownOpen() {
		if (sessionDropdownTimeout) clearTimeout(sessionDropdownTimeout);
	}

	// Handle task dropdown show/hide with delay
	function showTaskDropdownMenu() {
		if (taskDropdownTimeout) clearTimeout(taskDropdownTimeout);
		showTaskDropdown = true;
	}

	function hideTaskDropdownDelayed() {
		taskDropdownTimeout = setTimeout(() => {
			showTaskDropdown = false;
		}, 150);
	}

	function keepTaskDropdownOpen() {
		if (taskDropdownTimeout) clearTimeout(taskDropdownTimeout);
	}

	// Handle task creation for selected project
	function handleNewTask(projectName: string) {
		showTaskDropdown = false;
		openTaskDrawer(projectName);
	}

	// Swarm dropdown handlers
	function showSwarmMenu() {
		if (swarmDropdownTimeout) clearTimeout(swarmDropdownTimeout);
		showSwarmDropdown = true;
	}

	function hideSwarmMenuDelayed() {
		swarmDropdownTimeout = setTimeout(() => {
			showSwarmDropdown = false;
			closeStartDropdown(); // Sync store state
		}, 150);
	}

	function keepSwarmMenuOpen() {
		if (swarmDropdownTimeout) clearTimeout(swarmDropdownTimeout);
	}

	// Start Next - spawn single agent on highest-priority ready task
	async function handleStartNext() {
		if (startNextLoading || swarmLoading || readyTaskCount === 0) return;

		startNextLoading = true;
		showSwarmDropdown = false;

		try {
			// Use pickNextTask to get the highest-priority ready task
			const nextTask = await pickNextTask(null, { project: selectedProject });

			if (!nextTask) {
				console.error("No ready tasks available");
				return;
			}

			startSpawning(nextTask.taskId);

			const response = await fetch("/api/work/spawn", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ taskId: nextTask.taskId }),
			});
			const data = await response.json();

			if (!response.ok) {
				console.error("Start Next failed:", data.message);
				stopSpawning(nextTask.taskId);
			} else {
				console.log("Started next task:", nextTask.taskId, data);
				setTimeout(() => stopSpawning(nextTask.taskId), 2000);
			}
		} catch (err) {
			console.error("Start Next error:", err);
		} finally {
			startNextLoading = false;
		}
	}

	// Open Swarm Config modal
	function handleOpenSwarmConfig() {
		showSwarmDropdown = false;
		isSpawnModalOpen.set(true);
	}

	// Run Epic - spawn agents for all ready children of an epic
	async function handleRunEpic(epicId: string) {
		if (runningEpicId || swarmLoading) return;

		runningEpicId = epicId;
		showEpicSubmenu = false;
		showSwarmDropdown = false;

		try {
			// Fetch epic's children with ready status
			const response = await fetch(`/api/epics/${epicId}/children`);
			if (!response.ok) {
				throw new Error("Failed to fetch epic children");
			}
			const data = await response.json();

			// Filter to ready children only
			const readyChildren = data.children.filter(
				(c: { isBlocked: boolean; status: string }) =>
					!c.isBlocked && c.status !== "closed" && c.status !== "in_progress",
			);

			if (readyChildren.length === 0) {
				console.log("No ready tasks in epic", epicId);
				return;
			}

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

	// Get epics with ready children count
	const epicsWithReadyChildren = $derived(
		epicsWithReady
			.filter((e) => e.readyCount > 0)
			.sort((a, b) => b.readyCount - a.readyCount),
	);

	// Get total ready across all epics
	const totalEpicReadyCount = $derived(
		epicsWithReadyChildren.reduce((sum, e) => sum + e.readyCount, 0),
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

	// Spawn a single task from the dropdown
	async function handleSpawnSingle(taskId: string) {
		if (spawningTaskId || swarmLoading) return;

		spawningTaskId = taskId;
		startSpawning(taskId);

		try {
			const response = await fetch("/api/work/spawn", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ taskId }),
			});
			const data = await response.json();

			if (!response.ok) {
				console.error("Spawn failed:", data.message);
				stopSpawning(taskId);
			} else {
				console.log("Spawned agent for task:", taskId, data);
				// Keep animation briefly then clear
				setTimeout(() => stopSpawning(taskId), 2000);
			}
		} catch (err) {
			console.error("Spawn error:", err);
			stopSpawning(taskId);
		} finally {
			spawningTaskId = null;
		}
	}

	// Group ready tasks by project for the dropdown
	const tasksByProject = $derived.by(() => {
		const groups = new Map<string, ReadyTask[]>();
		for (const task of readyTasks) {
			const project = task.project || "unknown";
			if (!groups.has(project)) {
				groups.set(project, []);
			}
			groups.get(project)!.push(task);
		}
		// Sort by priority within each group
		for (const tasks of groups.values()) {
			tasks.sort((a, b) => a.priority - b.priority);
		}
		return groups;
	});

	// Get list of project names for tabs (use order from projects prop - sorted by last activity)
	// Filter to only show projects that have ready tasks
	const projectNames = $derived(
		projects.filter((p) => p !== "All Projects" && tasksByProject.has(p)),
	);

	// Filter tasks based on selected project tab (maintains projects prop order)
	const filteredTasksByProject = $derived.by(() => {
		const result = new Map<string, ReadyTask[]>();

		if (selectedProjectTab === null) {
			// Show all projects in the order from projects prop
			for (const project of projectNames) {
				const tasks = tasksByProject.get(project);
				if (tasks && tasks.length > 0) {
					result.set(project, tasks);
				}
			}
		} else {
			// Filter to just the selected project
			const tasks = tasksByProject.get(selectedProjectTab);
			if (tasks) {
				result.set(selectedProjectTab, tasks);
			}
		}
		return result;
	});

	// Get flat list of visible tasks for keyboard navigation
	const flatTaskList = $derived.by(() => {
		const tasks: ReadyTask[] = [];
		for (const [, projectTasks] of filteredTasksByProject.entries()) {
			tasks.push(...projectTasks);
		}
		return tasks;
	});

	// Get priority badge color
	function getPriorityColor(priority: number): string {
		switch (priority) {
			case 0:
				return "oklch(0.65 0.25 25)"; // P0 - red
			case 1:
				return "oklch(0.75 0.20 60)"; // P1 - orange
			case 2:
				return "oklch(0.70 0.15 200)"; // P2 - blue
			default:
				return "oklch(0.55 0.02 250)"; // P3+ - gray
		}
	}

	// Button hover states
	let sessionHovered = $state(false);
	let taskHovered = $state(false);
	let swarmHovered = $state(false);
</script>

<!-- Industrial/Terminal TopBar -->
<nav
	class="w-full h-12 flex items-center relative"
	style="
		background: linear-gradient(180deg, oklch(0.25 0.01 250) 0%, oklch(0.20 0.01 250) 100%);
		border-bottom: 1px solid oklch(0.35 0.02 250);
	"
>
	<!-- Sidebar toggle (industrial) -->
	<button
		onclick={toggleSidebar}
		aria-label={$isSidebarCollapsed ? "expand sidebar" : "collapse sidebar"}
		class="flex items-center justify-center w-7 h-7 ml-3 rounded cursor-pointer transition-all hover:scale-105"
		style="background: oklch(0.30 0.02 250); border: 1px solid oklch(0.40 0.02 250);"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			stroke-linejoin="round"
			stroke-linecap="round"
			stroke-width="2"
			fill="none"
			stroke="currentColor"
			class="w-4 h-4 transition-transform {$isSidebarCollapsed ? 'rotate-180' : ''}"
			style="color: oklch(0.70 0.18 240);"
		>
			<path
				d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"
			></path>
			<path d="M9 4v16"></path>
			<path d="M14 10l2 2l-2 2"></path>
		</svg>
	</button>

	<!-- Left side utilities -->
	<div class="flex-1 flex items-center gap-3 px-2">
		<!-- Add Task Dropdown (Industrial - pick project first) -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="relative"
			onmouseenter={showTaskDropdownMenu}
			onmouseleave={hideTaskDropdownDelayed}
		>
			<button
				class="flex items-center gap-1 py-1.5 rounded font-mono text-[10px] leading-none tracking-wider uppercase transition-all duration-200 ease-out overflow-hidden"
				style="
					background: {taskHovered || showTaskDropdown
					? 'linear-gradient(135deg, oklch(0.75 0.22 145 / 0.35) 0%, oklch(0.75 0.22 145 / 0.2) 100%)'
					: 'linear-gradient(135deg, oklch(0.75 0.20 145 / 0.2) 0%, oklch(0.75 0.20 145 / 0.1) 100%)'};
					border: 1px solid {taskHovered || showTaskDropdown
					? 'oklch(0.80 0.22 145 / 0.6)'
					: 'oklch(0.75 0.20 145 / 0.4)'};
					color: {taskHovered || showTaskDropdown
					? 'oklch(0.90 0.20 145)'
					: 'oklch(0.80 0.18 145)'};
					text-shadow: 0 0 10px oklch(0.75 0.20 145 / 0.5);
					padding-left: {taskHovered || showTaskDropdown ? '10px' : '8px'};
					padding-right: {taskHovered || showTaskDropdown ? '10px' : '8px'};
					box-shadow: {taskHovered || showTaskDropdown
					? '0 0 20px oklch(0.75 0.22 145 / 0.4)'
					: 'none'};
					transform: {taskHovered || showTaskDropdown ? 'scale(1.05)' : 'scale(1)'};
				"
				title="Create new task - pick a project"
				onmouseenter={() => (taskHovered = true)}
				onmouseleave={() => (taskHovered = false)}
			>
				<svg
					class="w-3 h-3 flex-shrink-0"
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
				{#if taskHovered || showTaskDropdown}
					<span class="whitespace-nowrap">New Task</span>
					<svg
						class="w-3 h-3 ml-0.5"
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
				{:else}
					<span class="hidden sm:inline pt-0.75">Task</span>
				{/if}
			</button>

			<!-- Project Dropdown for Task -->
			{#if showTaskDropdown}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="absolute top-full left-0 mt-1 min-w-[180px] rounded-lg shadow-xl z-50 overflow-hidden"
					style="
						background: linear-gradient(180deg, oklch(0.22 0.02 250) 0%, oklch(0.18 0.02 250) 100%);
						border: 1px solid oklch(0.40 0.03 250);
					"
					onmouseenter={keepTaskDropdownOpen}
					onmouseleave={hideTaskDropdownDelayed}
				>
					<div
						class="px-3 py-2 border-b"
						style="border-color: oklch(0.30 0.02 250);"
					>
						<span
							class="text-[9px] font-mono uppercase tracking-wider"
							style="color: oklch(0.55 0.02 250);"
						>
							Select Project
						</span>
					</div>
					<div class="py-1 max-h-[240px] overflow-y-auto">
						{#if actualProjects.length === 0}
							<div
								class="px-3 py-2 text-xs"
								style="color: oklch(0.50 0.02 250);"
							>
								No projects found
							</div>
						{:else}
							{#each actualProjects as project}
								<button
									class="w-full px-3 py-2 text-left text-xs font-mono flex items-center gap-2 transition-colors"
									style="color: oklch(0.80 0.02 250);"
									onmouseenter={(e) =>
										(e.currentTarget.style.background = "oklch(0.30 0.03 250)")}
									onmouseleave={(e) =>
										(e.currentTarget.style.background = "transparent")}
									onclick={() => handleNewTask(project)}
								>
									<span
										class="w-2 h-2 rounded-full flex-shrink-0"
										style="background: {projectColors[project] ||
											'oklch(0.60 0.15 145)'};"
									></span>
									<span class="flex-1">{project}</span>
								</button>
							{/each}
						{/if}
					</div>
					<!-- Add Project Button -->
					<div class="border-t" style="border-color: oklch(0.30 0.02 250);">
						<button
							class="w-full px-3 py-2 text-left text-xs font-mono flex items-center gap-2 transition-colors"
							style="color: oklch(0.70 0.18 145);"
							onmouseenter={(e) =>
								(e.currentTarget.style.background = "oklch(0.28 0.02 250)")}
							onmouseleave={(e) =>
								(e.currentTarget.style.background = "transparent")}
							onclick={() => {
								showTaskDropdown = false;
								openProjectDrawer();
							}}
						>
							<svg
								class="w-3 h-3 flex-shrink-0"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M12 4v16m8-8H4"
								/>
							</svg>
							<span>Project</span>
						</button>
					</div>
				</div>
			{/if}
		</div>

		<!-- Global Action Buttons (Industrial) -->
		<div class="hidden md:flex items-center gap-1">
			<!-- Start Next Dropdown (hover to open, pick task to spawn) -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="relative"
				onmouseenter={showSwarmMenu}
				onmouseleave={hideSwarmMenuDelayed}
			>
				<button
					class="flex items-center gap-1 py-1.5 rounded font-mono text-[10px] leading-none tracking-wider uppercase transition-all duration-200 ease-out overflow-hidden"
					style="
						background: {swarmHovered || showSwarmDropdown
						? 'linear-gradient(135deg, oklch(0.50 0.20 145) 0%, oklch(0.40 0.18 160) 100%)'
						: 'linear-gradient(135deg, oklch(0.45 0.18 145) 0%, oklch(0.35 0.16 160) 100%)'};
						border: 1px solid {swarmHovered || showSwarmDropdown
						? 'oklch(0.55 0.20 145)'
						: 'oklch(0.50 0.18 145)'};
						color: oklch(0.98 0.02 145);
						padding-left: {swarmHovered || showSwarmDropdown ? '10px' : '8px'};
						padding-right: {swarmHovered || showSwarmDropdown ? '10px' : '8px'};
						box-shadow: {swarmHovered || showSwarmDropdown
						? '0 0 20px oklch(0.50 0.20 145 / 0.4)'
						: '0 0 10px oklch(0.45 0.18 145 / 0.2)'};
						transform: {swarmHovered || showSwarmDropdown ? 'scale(1.05)' : 'scale(1)'};
					"
					title={readyTaskCount > 0
						? `Pick a task to start (${readyTaskCount} ready) • Alt+S`
						: "No ready tasks • Alt+S"}
					onmouseenter={() => (swarmHovered = true)}
					onmouseleave={() => (swarmHovered = false)}
					disabled={swarmLoading || startNextLoading}
				>
					{#if startNextLoading}
						<span class="loading loading-spinner loading-xs"></span>
						<span>Starting...</span>
					{:else}
						<svg
							class="w-3.5 h-3.5 flex-shrink-0"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
							/>
						</svg>
						{#if swarmHovered || showSwarmDropdown}
							<span class="whitespace-nowrap pt-0.75">Start</span>
							{#if readyTaskCount > 0}
								<span
									class="px-1.5 py-0.5 rounded text-[9px] font-bold"
									style="background: oklch(0.55 0.22 145); color: oklch(0.98 0.02 145);"
									>{readyTaskCount}</span
								>
							{/if}
							<svg
								class="w-3 h-3 ml-0.5 transition-transform {showSwarmDropdown
									? 'rotate-180'
									: ''}"
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
						{:else}
							<span class="whitespace-nowrap pt-0.75">Start</span>
							{#if readyTaskCount > 0}
								<span
									class="px-1.5 py-0.5 rounded text-[9px] font-bold"
									style="background: oklch(0.55 0.22 145); color: oklch(0.98 0.02 145);"
									>{readyTaskCount}</span
								>
							{/if}
						{/if}
					{/if}
				</button>

				<!-- Dropdown Panel -->
				{#if showSwarmDropdown && !swarmLoading && !startNextLoading}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						bind:this={dropdownRef}
						class="swarm-dropdown-panel"
						tabindex="-1"
						onmouseenter={keepSwarmMenuOpen}
						onmouseleave={hideSwarmMenuDelayed}
						onkeydown={handleDropdownKeydown}
					>
						<!-- Project Tabs Header -->
						<div
							class="px-1 py-1 flex items-center gap-1 overflow-x-auto"
							style="background: oklch(0.15 0.02 250); border-bottom: 1px solid oklch(0.25 0.02 250);"
						>
							<!-- All Projects Tab -->
							<button
								class="project-tab {selectedProjectTab === null
									? 'project-tab-active'
									: ''}"
								onclick={() => (selectedProjectTab = null)}
							>
								<span class="text-[9px] font-mono uppercase">All</span>
								<span class="project-tab-count">{readyTaskCount}</span>
							</button>
							<!-- Individual Project Tabs -->
							{#each projectNames as project}
								{@const count = tasksByProject.get(project)?.length || 0}
								<button
									class="project-tab {selectedProjectTab === project
										? 'project-tab-active'
										: ''}"
									onclick={() => (selectedProjectTab = project)}
								>
									<span
										class="w-1.5 h-1.5 rounded-full flex-shrink-0"
										style="background: {projectColors[project] ||
											'oklch(0.60 0.15 250)'};"
									></span>
									<span
										class="text-[9px] font-mono uppercase truncate max-w-[60px]"
										>{project}</span
									>
									<span class="project-tab-count">{count}</span>
								</button>
							{/each}
						</div>

						{#if readyTaskCount === 0}
							<div
								class="px-3 py-4 text-center text-xs"
								style="color: oklch(0.50 0.02 250);"
							>
								No tasks ready to spawn
							</div>
						{:else}
							<!-- Task list (filtered by selected project) -->
							<div class="max-h-[280px] overflow-y-auto">
								{#each [...filteredTasksByProject.entries()] as [project, tasks]}
									<!-- Project header (only show if viewing all projects) -->
									{#if selectedProjectTab === null}
										<div class="swarm-project-header">
											<span
												class="w-2 h-2 rounded-full flex-shrink-0"
												style="background: {projectColors[project] ||
													'oklch(0.60 0.15 250)'};"
											></span>
											<span class="swarm-project-label">{project}</span>
											<span class="swarm-project-count">{tasks.length}</span>
										</div>
									{/if}
									<!-- Tasks for this project -->
									{#each tasks as task}
										{@const taskFlatIndex = flatTaskList.findIndex(t => t.id === task.id)}
										{@const isFocused = focusedTaskIndex >= 0 && focusedTaskIndex === taskFlatIndex}
										<div
											class="swarm-task-row"
											class:keyboard-focused={isFocused}
											data-task-index={taskFlatIndex}
											style={isFocused ? 'background: oklch(0.40 0.15 200 / 0.3); outline: 2px solid oklch(0.60 0.18 200);' : ''}
										>
											<div
												class="flex items-start justify-between gap-2 w-full"
											>
												<div class="flex-1 min-w-0 text-left">
													<div class="flex items-center gap-1.5">
														<span
															class="px-1 py-0.5 rounded text-[9px] font-bold"
															style="background: {getPriorityColor(
																task.priority,
															)}; color: oklch(0.98 0.02 60);"
															>P{task.priority}</span
														>
														<span
															class="text-[10px] font-mono"
															style="color: {projectColors[
																task.project || ''
															] || 'oklch(0.55 0.10 200)'};"
														>
															{task.id}
														</span>
													</div>
													<div
														class="text-xs font-mono truncate mt-0.5"
														style="color: oklch(0.85 0.02 250);"
													>
														{task.title || task.id}
													</div>
												</div>
												<div class="flex items-center gap-1.5 flex-shrink-0">
													<!-- Info button to view task details -->
													<button
														class="p-1 rounded hover:bg-base-300/50 transition-colors"
														onclick={(e) => {
															e.stopPropagation();
															openTaskDetailDrawer(task.id);
														}}
														title="View task details"
													>
														<svg
															xmlns="http://www.w3.org/2000/svg"
															fill="none"
															viewBox="0 0 24 24"
															stroke-width="1.5"
															stroke="currentColor"
															class="w-3.5 h-3.5 opacity-50 hover:opacity-100"
															style="color: oklch(0.70 0.15 240);"
														>
															<path
																stroke-linecap="round"
																stroke-linejoin="round"
																d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
															/>
														</svg>
													</button>
													<!-- Spawn button -->
													<button
														class="p-1 rounded hover:bg-base-300/50 transition-colors"
														onclick={() => handleSpawnSingle(task.id)}
														disabled={spawningTaskId === task.id ||
															swarmLoading}
														title="Spawn agent for this task"
													>
														{#if spawningTaskId === task.id}
															<span
																class="loading loading-spinner loading-xs"
																style="color: oklch(0.70 0.18 145);"
															></span>
														{:else}
															<svg
																class="w-4 h-4 opacity-50 hover:opacity-100"
																style="color: oklch(0.70 0.18 145);"
																fill="none"
																viewBox="0 0 24 24"
																stroke="currentColor"
																stroke-width="2"
															>
																<path
																	stroke-linecap="round"
																	stroke-linejoin="round"
																	d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
																/>
															</svg>
														{/if}
													</button>
												</div>
											</div>
										</div>
									{/each}
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Sort Dropdown (on /work or /tasks page) -->
	{#if isWorkPage}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="relative flex-none"
			onmouseenter={showSortMenu}
			onmouseleave={hideSortMenuDelayed}
		>
			<button
				class="flex items-center gap-1 py-1 mr-3 rounded font-mono text-[10px] tracking-wider uppercase transition-all duration-200 ease-out overflow-hidden"
				style="
					background: {sortHovered || showSortDropdown
					? 'oklch(0.35 0.03 250)'
					: 'oklch(0.30 0.02 250)'};
					border: 1px solid {sortHovered || showSortDropdown
					? 'oklch(0.50 0.03 250)'
					: 'oklch(0.40 0.02 250)'};
					color: oklch(0.80 0.02 250);
					padding-left: 8px;
					padding-right: 8px;
				"
				title="Sort work sessions"
				onmouseenter={() => (sortHovered = true)}
				onmouseleave={() => (sortHovered = false)}
			>
				<span class="text-xs">{currentSortIcon}</span>
				<span class="hidden sm:inline">{currentSortLabel}</span>
				<span class="text-[9px] opacity-70"
					>{currentDir === "asc" ? "▲" : "▼"}</span
				>
				<svg
					class="w-2.5 h-2.5 ml-0.5 transition-transform {showSortDropdown
						? 'rotate-180'
						: ''}"
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

			<!-- Sort Dropdown Menu -->
			{#if showSortDropdown}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="absolute top-full left-0 mt-1 min-w-[160px] rounded-lg shadow-xl z-50 overflow-hidden"
					style="
						background: linear-gradient(180deg, oklch(0.22 0.02 250) 0%, oklch(0.18 0.02 250) 100%);
						border: 1px solid oklch(0.40 0.03 250);
					"
					onmouseenter={keepSortMenuOpen}
					onmouseleave={hideSortMenuDelayed}
				>
					<div
						class="px-3 py-2 border-b"
						style="border-color: oklch(0.30 0.02 250);"
					>
						<span
							class="text-[9px] font-mono uppercase tracking-wider"
							style="color: oklch(0.55 0.02 250);"
						>
							Sort Sessions
						</span>
					</div>
					<div class="py-1">
						{#each SORT_OPTIONS as opt (opt.value)}
							<button
								class="w-full px-3 py-2 text-left text-xs font-mono flex items-center gap-2 transition-colors"
								style="color: {currentSort === opt.value
									? 'oklch(0.90 0.15 250)'
									: 'oklch(0.75 0.02 250)'}; background: {currentSort ===
								opt.value
									? 'oklch(0.30 0.05 250)'
									: 'transparent'};"
								onmouseenter={(e) => {
									if (currentSort !== opt.value)
										e.currentTarget.style.background = "oklch(0.28 0.02 250)";
								}}
								onmouseleave={(e) => {
									if (currentSort !== opt.value)
										e.currentTarget.style.background = "transparent";
								}}
								onclick={() => onSortSelect(opt.value)}
							>
								<span class="text-sm">{opt.icon}</span>
								<span class="flex-1">{opt.label}</span>
								{#if currentSort === opt.value}
									<span class="text-[10px] opacity-70"
										>{currentDir === "asc" ? "▲" : "▼"}</span
									>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Agent Sort Dropdown (on /agents page) -->
	{#if isAgentsPage}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="relative flex-none"
			onmouseenter={showSortMenu}
			onmouseleave={hideSortMenuDelayed}
		>
			<button
				class="flex items-center gap-1 py-1 mr-3 rounded font-mono text-[10px] tracking-wider uppercase transition-all duration-200 ease-out overflow-hidden"
				style="
					background: {sortHovered || showSortDropdown
					? 'oklch(0.35 0.03 250)'
					: 'oklch(0.30 0.02 250)'};
					border: 1px solid {sortHovered || showSortDropdown
					? 'oklch(0.50 0.03 250)'
					: 'oklch(0.40 0.02 250)'};
					color: oklch(0.80 0.02 250);
					padding-left: 8px;
					padding-right: 8px;
				"
				title="Sort agents"
				onmouseenter={() => (sortHovered = true)}
				onmouseleave={() => (sortHovered = false)}
			>
				<span class="text-xs">{currentAgentSortIcon}</span>
				<span class="hidden sm:inline">{currentAgentSortLabel}</span>
				<span class="text-[9px] opacity-70"
					>{currentAgentDir === "asc" ? "▲" : "▼"}</span
				>
				<svg
					class="w-2.5 h-2.5 ml-0.5 transition-transform {showSortDropdown
						? 'rotate-180'
						: ''}"
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

			<!-- Agent Sort Dropdown Menu -->
			{#if showSortDropdown}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="absolute top-full left-0 mt-1 min-w-[160px] rounded-lg shadow-xl z-50 overflow-hidden"
					style="
						background: linear-gradient(180deg, oklch(0.22 0.02 250) 0%, oklch(0.18 0.02 250) 100%);
						border: 1px solid oklch(0.40 0.03 250);
					"
					onmouseenter={keepSortMenuOpen}
					onmouseleave={hideSortMenuDelayed}
				>
					<div
						class="px-3 py-2 border-b"
						style="border-color: oklch(0.30 0.02 250);"
					>
						<span
							class="text-[9px] font-mono uppercase tracking-wider"
							style="color: oklch(0.55 0.02 250);"
						>
							Sort Agents
						</span>
					</div>
					<div class="py-1">
						{#each AGENT_SORT_OPTIONS as opt (opt.value)}
							<button
								class="w-full px-3 py-2 text-left text-xs font-mono flex items-center gap-2 transition-colors"
								style="color: {currentAgentSort === opt.value
									? 'oklch(0.90 0.15 250)'
									: 'oklch(0.75 0.02 250)'}; background: {currentAgentSort ===
								opt.value
									? 'oklch(0.30 0.05 250)'
									: 'transparent'};"
								onmouseenter={(e) => {
									if (currentAgentSort !== opt.value)
										e.currentTarget.style.background = "oklch(0.28 0.02 250)";
								}}
								onmouseleave={(e) => {
									if (currentAgentSort !== opt.value)
										e.currentTarget.style.background = "transparent";
								}}
								onclick={() => onAgentSortSelect(opt.value)}
							>
								<span class="text-sm">{opt.icon}</span>
								<span class="flex-1">{opt.label}</span>
								{#if currentAgentSort === opt.value}
									<span class="text-[10px] opacity-70"
										>{currentAgentDir === "asc" ? "▲" : "▼"}</span
									>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Server Sort Dropdown (on /servers page) -->
	{#if isServersPage}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="relative flex-none"
			onmouseenter={showSortMenu}
			onmouseleave={hideSortMenuDelayed}
		>
			<button
				class="flex items-center gap-1 py-1 mr-3 rounded font-mono text-[10px] tracking-wider uppercase transition-all duration-200 ease-out overflow-hidden"
				style="
					background: {sortHovered || showSortDropdown
					? 'oklch(0.35 0.03 250)'
					: 'oklch(0.30 0.02 250)'};
					border: 1px solid {sortHovered || showSortDropdown
					? 'oklch(0.50 0.03 250)'
					: 'oklch(0.40 0.02 250)'};
					color: oklch(0.80 0.02 250);
					padding-left: 8px;
					padding-right: 8px;
				"
				title="Sort servers"
				onmouseenter={() => (sortHovered = true)}
				onmouseleave={() => (sortHovered = false)}
			>
				<span class="text-xs">{currentServerSortIcon}</span>
				<span class="hidden sm:inline">{currentServerSortLabel}</span>
				<span class="text-[9px] opacity-70"
					>{currentServerDir === "asc" ? "▲" : "▼"}</span
				>
				<svg
					class="w-2.5 h-2.5 ml-0.5 transition-transform {showSortDropdown
						? 'rotate-180'
						: ''}"
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

			<!-- Server Sort Dropdown Menu -->
			{#if showSortDropdown}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="absolute top-full left-0 mt-1 min-w-[160px] rounded-lg shadow-xl z-50 overflow-hidden"
					style="
						background: linear-gradient(180deg, oklch(0.22 0.02 250) 0%, oklch(0.18 0.02 250) 100%);
						border: 1px solid oklch(0.40 0.03 250);
					"
					onmouseenter={keepSortMenuOpen}
					onmouseleave={hideSortMenuDelayed}
				>
					<div
						class="px-3 py-2 border-b"
						style="border-color: oklch(0.30 0.02 250);"
					>
						<span
							class="text-[9px] font-mono uppercase tracking-wider"
							style="color: oklch(0.55 0.02 250);"
						>
							Sort Servers
						</span>
					</div>
					<div class="py-1">
						{#each SERVER_SORT_OPTIONS as opt (opt.value)}
							<button
								class="w-full px-3 py-2 text-left text-xs font-mono flex items-center gap-2 transition-colors"
								style="color: {currentServerSort === opt.value
									? 'oklch(0.90 0.15 250)'
									: 'oklch(0.75 0.02 250)'}; background: {currentServerSort ===
								opt.value
									? 'oklch(0.30 0.05 250)'
									: 'transparent'};"
								onmouseenter={(e) => {
									if (currentServerSort !== opt.value)
										e.currentTarget.style.background = "oklch(0.28 0.02 250)";
								}}
								onmouseleave={(e) => {
									if (currentServerSort !== opt.value)
										e.currentTarget.style.background = "transparent";
								}}
								onclick={() => onServerSortSelect(opt.value)}
							>
								<span class="text-sm">{opt.icon}</span>
								<span class="flex-1">{opt.label}</span>
								{#if currentServerSort === opt.value}
									<span class="text-[10px] opacity-70"
										>{currentServerDir === "asc" ? "▲" : "▼"}</span
									>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Middle: Command Palette -->
	<div class="flex-none">
		<CommandPalette />
	</div>

	<!-- Vertical separator -->
	<div
		class="w-px h-6 mx-3"
		style="background: linear-gradient(180deg, transparent, oklch(0.45 0.02 250), transparent);"
	></div>

	<!-- Right side: Sparkline + Stats + User Profile (Industrial) -->
	<div class="flex-none flex items-center gap-2.5 pr-3">
		<!-- Sparkline (positioned LEFT of all badges, visibility controlled by user preference) -->
		{#if sparklineVisible && multiProjectData && multiProjectData.length > 0}
			<div
				class="hidden sm:block flex-shrink w-[80px] sm:w-[100px] md:w-[120px] lg:w-[150px] h-[20px]"
			>
				<Sparkline
					multiSeriesData={multiProjectData.map((point) => {
						const projects: Record<string, { tokens: number; cost: number }> =
							{};
						for (const p of point.projects) {
							projects[p.project] = { tokens: p.tokens, cost: p.cost };
						}
						return {
							timestamp: point.timestamp,
							projects,
							total: { tokens: point.totalTokens, cost: point.totalCost },
						};
					})}
					projectMeta={(() => {
						const projectTotals = new Map<string, number>();
						for (const point of multiProjectData) {
							for (const p of point.projects) {
								projectTotals.set(
									p.project,
									(projectTotals.get(p.project) || 0) + p.tokens,
								);
							}
						}
						const meta: Array<{
							name: string;
							color: string;
							totalTokens: number;
						}> = [];
						for (const [name, totalTokens] of projectTotals.entries()) {
							meta.push({
								name,
								color: projectColors[name] || "#888888",
								totalTokens,
							});
						}
						return meta.sort((a, b) => b.totalTokens - a.totalTokens);
					})()}
					width="100%"
					height={20}
					showTooltip={true}
					showGrid={false}
					showStyleToolbar={true}
					showLegend={false}
					showLegendInToolbar={true}
				/>
			</div>
		{:else if sparklineVisible && sparklineData && sparklineData.length > 0}
			<div
				class="hidden sm:block flex-shrink w-[80px] sm:w-[100px] md:w-[120px] lg:w-[150px] h-[20px]"
			>
				<Sparkline
					data={sparklineData}
					width="100%"
					height={20}
					colorMode="usage"
					showTooltip={true}
					showGrid={false}
					showStyleToolbar={true}
				/>
			</div>
		{/if}

		<!-- Agent Count Badge -->
		<div class="hidden sm:flex">
			<AgentCountBadge
				activeCount={activeAgentCount}
				totalCount={totalAgentCount}
				{activeAgents}
				{stateCounts}
				compact={true}
			/>
		</div>

		<!-- Token Usage Badge (without sparkline - moved above) -->
		<div class="hidden sm:flex">
			<TokenUsageBadge
				{tokensToday}
				{costToday}
				sparklineData={[]}
				multiProjectData={undefined}
				{projectColors}
				compact={true}
			/>
		</div>

		<!-- Epic Swarm Badge (shows swarm controls) -->
		<EpicSwarmBadge
			{readyTaskCount}
			{activeAgentCount}
			{epicsWithReady}
			{reviewRules}
			{projectColors}
		/>

		<!-- Tasks Completed Today Badge -->
		<div class="flex">
			<TasksCompletedBadge compact={true} />
		</div>

		<!-- Dev Servers + WebSocket Status -->
		<ServersBadge />

		<!-- User Profile -->
		<UserProfile />
	</div>
</nav>

<style>
	/* Swarm Dropdown Panel */
	.swarm-dropdown-panel {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 0.25rem;
		z-index: 50;
		min-width: 320px;
		max-width: 400px;
		border-radius: 0.5rem;
		box-shadow: 0 10px 40px oklch(0 0 0 / 0.4);
		overflow: hidden;
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.35 0.02 250);
		animation: swarm-dropdown-slide 0.2s ease-out;
		transform-origin: top left;
	}

	@keyframes swarm-dropdown-slide {
		from {
			opacity: 0;
			transform: translateY(-8px) scale(0.96);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	/* Project header in dropdown */
	.swarm-project-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.75rem;
		background: oklch(0.14 0.02 250);
		border-bottom: 1px solid oklch(0.25 0.01 250);
		position: sticky;
		top: 0;
		z-index: 1;
	}

	.swarm-project-label {
		font-size: 0.65rem;
		font-weight: 600;
		color: oklch(0.7 0.1 30);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-family: ui-monospace, monospace;
		flex: 1;
	}

	.swarm-project-count {
		font-size: 0.6rem;
		color: oklch(0.5 0.02 250);
		padding: 0.125rem 0.375rem;
		background: oklch(0.22 0.02 250);
		border-radius: 8px;
	}

	/* Project tab selector */
	.project-tab {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		background: oklch(0.2 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.25rem;
		color: oklch(0.6 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.project-tab:hover {
		background: oklch(0.25 0.02 250);
		border-color: oklch(0.35 0.02 250);
		color: oklch(0.75 0.02 250);
	}

	.project-tab-active {
		background: oklch(0.3 0.1 145);
		border-color: oklch(0.5 0.15 145);
		color: oklch(0.9 0.05 145);
	}

	.project-tab-active:hover {
		background: oklch(0.35 0.12 145);
		border-color: oklch(0.55 0.15 145);
	}

	.project-tab-count {
		font-size: 0.55rem;
		padding: 0 0.25rem;
		background: oklch(0.15 0.02 250);
		border-radius: 4px;
		color: oklch(0.55 0.02 250);
	}

	.project-tab-active .project-tab-count {
		background: oklch(0.2 0.08 145);
		color: oklch(0.85 0.08 145);
	}

	/* Task row in dropdown */
	.swarm-task-row {
		display: block;
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: transparent;
		border: none;
		border-bottom: 1px solid oklch(0.25 0.01 250);
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.swarm-task-row:last-of-type {
		border-bottom: none;
	}

	.swarm-task-row:hover:not(:disabled) {
		background: oklch(0.25 0.02 250);
	}

	.swarm-task-row:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Menu item in dropdown (Quick Actions) */
	.swarm-menu-item {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: 100%;
		padding: 0.625rem 0.75rem;
		background: transparent;
		border: none;
		border-radius: 0.375rem;
		color: oklch(0.8 0.02 250);
		font-size: 0.75rem;
		font-family: ui-monospace, monospace;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
	}

	.swarm-menu-item:hover:not(:disabled) {
		background: oklch(0.28 0.03 250);
		color: oklch(0.9 0.02 250);
	}

	.swarm-menu-item:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.swarm-menu-item svg {
		color: oklch(0.65 0.15 145);
		flex-shrink: 0;
	}

	.swarm-menu-item:hover:not(:disabled) svg {
		color: oklch(0.75 0.18 145);
	}
</style>
