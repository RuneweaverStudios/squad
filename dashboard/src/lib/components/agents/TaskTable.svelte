<script lang="ts">
	import { page } from '$app/stores';
	import { replaceState } from '$app/navigation';
	import { onMount } from 'svelte';
	import { slide, fade } from 'svelte/transition';
	import WorkingAgentBadge from '$lib/components/WorkingAgentBadge.svelte';
	import FilterDropdown from '$lib/components/FilterDropdown.svelte';
	import LabelBadges from '$lib/components/LabelBadges.svelte';
	import TaskIdBadge from '$lib/components/TaskIdBadge.svelte';
	import { analyzeDependencies, calculateAllCriticalPaths, type CriticalPathResult } from '$lib/utils/dependencyUtils';
	import { getProjectFromTaskId, extractParentId, compareTaskIds, buildEpicChildMap, getParentEpicId } from '$lib/utils/projectUtils';
	import { getProjectColor } from '$lib/utils/projectColors';
	import { getPriorityBadge, getTaskStatusBadge, getTypeBadge, isHumanTask } from '$lib/utils/badgeHelpers';
	import { formatRelativeTime, formatFullDate, normalizeTimestamp, getAgeColorClass } from '$lib/utils/dateFormatters';
	import { toggleSetItem } from '$lib/utils/filterHelpers';
	import { getTaskStatusVisual, STATUS_ICONS, getIssueTypeVisual, getGroupHeaderInfo, type GroupingMode } from '$lib/config/statusColors';
	import { getElapsedTimeColor, getFireScale, formatElapsedTime } from '$lib/config/rocketConfig';
	import { isAgentWorking as checkAgentWorking, computeAgentStatus } from '$lib/utils/agentStatusUtils';
	import TaskActionButton from './TaskActionButton.svelte';
	import {
		bulkApiOperation,
		fetchWithTimeout,
		handleApiError,
		createPutRequest,
		createDeleteRequest
	} from '$lib/utils/bulkApiHelpers';
	import { playNewTaskChime, playTaskExitSound, playTaskStartSound, playTaskCompleteSound, playEpicCompleteSound } from '$lib/utils/soundEffects';
	import { spawningTaskIds, isBulkSpawning } from '$lib/stores/spawningTasks';
	import { successToast } from '$lib/stores/toasts.svelte';
	import { getEpicCelebration, getEpicAutoClose, getCollapsedEpics, setCollapsedEpics } from '$lib/stores/preferences.svelte';
	import { workSessionsState } from '$lib/stores/workSessions.svelte';
	import { getFileTypeInfo, getFileTypeInfoFromPath, formatFileSize, type FileCategory } from '$lib/utils/fileUtils';
	import { calculateRecommendationScore, type RecommendationScore } from '$lib/utils/recommendationUtils';
	import RecommendedBadge from '$lib/components/RecommendedBadge.svelte';
	import { getEpicId, getProgress, getRunningAgents, getIsActive } from '$lib/stores/epicQueueStore.svelte';
	import EpicSwarmModal from '$lib/components/EpicSwarmModal.svelte';
	import { openEpicSwarmModal } from '$lib/stores/drawerStore';
	import { computeReviewStatus, type ReviewRule, type ReviewStatus } from '$lib/utils/reviewStatusUtils';

	// Type definitions for task files (images, PDFs, text, etc.)
	interface TaskFile {
		blob: Blob;
		preview: string; // Object URL for thumbnail (images only)
		path: string;    // Server path after upload
		id: string;      // Unique ID for this file (for removal)
		name: string;    // Original filename
		category: FileCategory; // File type category
		icon: string;    // SVG path for icon
		iconColor: string; // oklch color for icon
	}

	// Type definitions - aligned with api.types.Task
	interface Task {
		id: string;
		title: string;
		description: string;
		status: 'open' | 'in_progress' | 'blocked' | 'closed';
		priority: number;
		issue_type: 'task' | 'bug' | 'feature' | 'epic' | 'chore';
		project: string;
		assignee?: string;
		labels: string[];
		depends_on?: Array<{ id: string; title: string; status: string; priority: number }>;
		blocked_by?: Array<{ id: string; title: string; status: string; priority: number }>;
		created_ts?: string;
		updated_at?: string;
	}

	interface Agent {
		name: string;
		last_active_ts?: string;
		task?: string | null;
		// Fields needed for agent status computation (from agentStatusUtils)
		hasSession?: boolean;
		in_progress_tasks?: number;
		reservation_count?: number;
		session_created_ts?: number | null;
	}

	interface Reservation {
		agent_name: string;
		path_pattern: string;
		expires_ts: string;
	}

	// Grouping mode for task table - determines how tasks are grouped in the view
	// Type imported from statusColors.ts: type GroupingMode = 'type' | 'parent' | 'label';

	interface Props {
		tasks?: Task[];
		allTasks?: Task[];
		agents?: Agent[];
		reservations?: Reservation[];
		/** Task IDs that were completed by agents with active sessions - should remain visible */
		completedTasksFromActiveSessions?: Set<string>;
		ontaskclick?: (taskId: string) => void;
		/** Callback when user clicks on an agent avatar/name */
		onagentclick?: (agentName: string) => void;
		/** Hide the project filter dropdown (for project-scoped views) */
		hideProjectFilter?: boolean;
		/** Hide the search input (for views that have their own search) */
		hideSearch?: boolean;
		/** Callback when tasks are deleted/modified - parent should refresh */
		onTasksChanged?: () => void;
	}

	let { tasks = [], allTasks = [], agents = [], reservations = [], completedTasksFromActiveSessions = new Set(), ontaskclick = () => {}, onagentclick, hideProjectFilter = false, hideSearch = false, onTasksChanged }: Props = $props();

	// Build epic->child mapping for dependency-based grouping
	// This allows tasks linked to epics via depends_on to be grouped under the epic
	// NOTE: Uses `tasks` (not allTasks) for O(n) performance in projects page context.
	const epicChildMap = $derived.by(() => {
		return buildEpicChildMap(tasks);
	});

	// Track previously seen task IDs and statuses for animations
	// Using regular variables (not $state) to avoid effect loops
	let previousTaskIds: Set<string> = new Set();
	let previousTasksMap: Map<string, Task> = new Map();
	let previousStatusMap: Map<string, string> = new Map();
	let isInitialLoad = true;
	// Use arrays instead of Sets for better Svelte reactivity
	let newTaskIds = $state<string[]>([]);
	let exitingTasks = $state<Task[]>([]);
	let startingTaskIds = $state<string[]>([]);
	let completedTaskIds = $state<string[]>([]);
	let workingCompletedTaskIds = $state<string[]>([]); // Tasks that transitioned from working → completed
	let completedEpicIds = $state<string[]>([]); // Epics that just had all children complete

	// Review rules state - fetched on mount for review status column
	let reviewRules = $state<ReviewRule[]>([]);

	// Task sessions state - maps task ID to sessions that have worked on it
	// Fetched via batch API to show resumable session avatars
	interface TaskSession {
		agentName: string;
		sessionId: string | null;
		lastActivity: string | null;
		signalCount: number;
		isOnline: boolean;
	}
	// Use plain object instead of Map for better Svelte 5 reactivity
	let taskSessions = $state<Record<string, TaskSession[]>>({});
	let taskSessionsLoading = $state(false);

	// Fetch task sessions for all visible tasks
	async function fetchTaskSessions(taskIds: string[]) {
		if (taskIds.length === 0) return;
		taskSessionsLoading = true;
		try {
			const response = await fetch('/api/tasks/sessions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ taskIds })
			});
			if (response.ok) {
				const data = await response.json();
				// Use plain object for Svelte 5 reactivity
				const newSessions: Record<string, TaskSession[]> = {};
				for (const [taskId, sessions] of Object.entries(data.sessions || {})) {
					newSessions[taskId] = sessions as TaskSession[];
				}
				taskSessions = newSessions;
			}
		} catch (error) {
			console.error('Failed to fetch task sessions:', error);
		} finally {
			taskSessionsLoading = false;
		}
	}

	// Get resumable sessions for a task (exclude online/working agents)
	function getResumableSessions(taskId: string): TaskSession[] {
		const sessions = taskSessions[taskId] || [];
		return sessions.filter(s => {
			// Exclude agents that are currently working on any task
			if (isAgentWorking(s.agentName)) return false;
			// Only include offline/disconnected agents
			return !s.isOnline;
		});
	}

	// Resume a specific agent's session by calling the resume API
	async function handleResumeSession(session: TaskSession) {
		try {
			const response = await fetch(`/api/sessions/${session.agentName}/resume`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ session_id: session.sessionId })
			});
			if (!response.ok) {
				const data = await response.json();
				console.error('Resume failed:', data.message || data.error);
			}
		} catch (err) {
			console.error('Resume error:', err);
		}
	}

	// Timer state for elapsed time display under rockets
	let now = $state(Date.now());

	// Update timer every 30 seconds
	onMount(() => {
		const timerInterval = setInterval(() => {
			now = Date.now();
		}, 30000);
		return () => clearInterval(timerInterval);
	});

	// Fetch review rules on mount
	onMount(async () => {
		try {
			const response = await fetch('/api/review-rules');
			if (response.ok) {
				const data = await response.json();
				reviewRules = data.rules || [];
			}
		} catch (error) {
			console.error('Failed to fetch review rules:', error);
		}
	});

	// Fetch task sessions when tasks change (for resumable session avatars)
	// Track previous task IDs to avoid unnecessary refetches
	let prevTaskIdString = '';
	$effect(() => {
		const taskIds = tasks.map(t => t.id);
		const taskIdString = taskIds.sort().join(',');
		// Only refetch if task list changed
		if (taskIdString !== prevTaskIdString) {
			prevTaskIdString = taskIdString;
			fetchTaskSessions(taskIds);
		}
	});

	// Keyboard shortcuts for collapse/expand all groups
	onMount(() => {
		function handleKeyDown(event: KeyboardEvent) {
			// Alt+[ = Collapse All Groups
			if (event.altKey && event.key === '[') {
				event.preventDefault();
				collapseAll();
			}
			// Alt+] = Expand All Groups
			if (event.altKey && event.key === ']') {
				event.preventDefault();
				expandAll();
			}
		}

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	});

	// Calculate elapsed time from a timestamp with color coding
	// Uses config from $lib/config/rocketConfig.ts
	function getElapsedTime(timestamp: string | undefined): { display: string; color: string; minutes: number } | null {
		if (!timestamp) return null;
		const start = new Date(timestamp).getTime();
		const elapsed = now - start;
		if (elapsed < 0 || isNaN(elapsed)) return null;

		const totalMinutes = Math.floor(elapsed / 60000);
		const color = getElapsedTimeColor(totalMinutes);
		const display = formatElapsedTime(totalMinutes);

		return { display, color, minutes: totalMinutes };
	}

	// Grouping mode - how tasks are grouped in the table view
	// 'type' - group by issue_type (bug, task, feature, etc.)
	// 'parent' - group by parent task ID (for epic/subtask hierarchies)
	// 'label' - group by first label
	let groupingMode = $state<GroupingMode>('project');

	// Track collapsed groups (by group key) - initialized from localStorage
	let collapsedGroups = $state<Set<string | null>>(new Set(getCollapsedEpics()));

	// Track collapsed projects (for project mode's two-level hierarchy)
	let collapsedProjects = $state<Set<string>>(new Set());

	// Reactive epic queue state - must be $derived for template reactivity
	// (Functions called in {@const} don't track reactive dependencies in Svelte 5)
	const epicQueueIsActive = $derived(getIsActive());
	const epicQueueId = $derived(getEpicId());
	const epicQueueRunningAgents = $derived(getRunningAgents());

	// Keyboard navigation: track focused group index for arrow key navigation
	let focusedGroupIndex = $state<number>(-1);

	// Get array of visible group keys for keyboard navigation
	const visibleGroupKeys = $derived.by(() => {
		const keys: (string | null)[] = [];
		// No visible group headers in 'none' mode
		if (groupingMode === 'none') {
			return keys;
		}
		for (const [groupKey, typeTasks] of groupedTasks.entries()) {
			if (typeTasks.length > 0) {
				// Check if this group should show a header
				const hasChildTasks = typeTasks.some(t => extractParentId(t.id) === groupKey);
				const showGroupHeader = groupingMode !== 'parent' || typeTasks.length >= 2 || hasChildTasks;
				if (showGroupHeader) {
					keys.push(groupKey);
				}
			}
		}
		return keys;
	});

	// Handle keyboard navigation on group headers
	function handleGroupKeyDown(event: KeyboardEvent, groupKey: string | null, groupIndex: number) {
		const key = event.key;

		if (key === 'Enter' || key === ' ') {
			// Toggle collapse on Enter or Space
			event.preventDefault();
			toggleGroupCollapse(groupKey);
		} else if (key === 'ArrowDown' || key === 'ArrowRight') {
			// Navigate to next group
			event.preventDefault();
			const nextIndex = groupIndex + 1;
			if (nextIndex < visibleGroupKeys.length) {
				focusedGroupIndex = nextIndex;
				focusGroupHeader(nextIndex);
			}
		} else if (key === 'ArrowUp' || key === 'ArrowLeft') {
			// Navigate to previous group
			event.preventDefault();
			const prevIndex = groupIndex - 1;
			if (prevIndex >= 0) {
				focusedGroupIndex = prevIndex;
				focusGroupHeader(prevIndex);
			}
		} else if (key === 'Home') {
			// Jump to first group
			event.preventDefault();
			if (visibleGroupKeys.length > 0) {
				focusedGroupIndex = 0;
				focusGroupHeader(0);
			}
		} else if (key === 'End') {
			// Jump to last group
			event.preventDefault();
			if (visibleGroupKeys.length > 0) {
				const lastIndex = visibleGroupKeys.length - 1;
				focusedGroupIndex = lastIndex;
				focusGroupHeader(lastIndex);
			}
		}
	}

	// Focus a group header by index
	function focusGroupHeader(index: number) {
		// Use setTimeout to ensure DOM is updated
		setTimeout(() => {
			const groupHeader = document.querySelector(`[data-group-index="${index}"]`) as HTMLElement;
			if (groupHeader) {
				groupHeader.focus();
			}
		}, 0);
	}

	// Handle focus event on group header
	function handleGroupFocus(groupIndex: number) {
		focusedGroupIndex = groupIndex;
	}

	// Toggle group collapse state
	function toggleGroupCollapse(groupKey: string | null) {
		const newSet = new Set(collapsedGroups);
		if (newSet.has(groupKey)) {
			newSet.delete(groupKey);
		} else {
			newSet.add(groupKey);
		}
		collapsedGroups = newSet;
		// Persist to localStorage (filter out null values for storage)
		setCollapsedEpics(Array.from(newSet).filter((k): k is string => k !== null));
	}

	// Toggle project collapse state (for project mode)
	function toggleProjectCollapse(projectKey: string) {
		const newSet = new Set(collapsedProjects);
		if (newSet.has(projectKey)) {
			newSet.delete(projectKey);
		} else {
			newSet.add(projectKey);
		}
		collapsedProjects = newSet;
	}

	// Collapse all visible groups
	function collapseAll() {
		if (groupingMode === 'project') {
			// In project mode, collapse all projects
			collapsedProjects = new Set(Array.from(nestedGroupedTasks.keys()));
		} else {
			collapsedGroups = new Set(visibleGroupKeys);
			// Persist to localStorage
			setCollapsedEpics(Array.from(collapsedGroups).filter((k): k is string => k !== null));
		}
	}

	// Expand all groups
	function expandAll() {
		collapsedGroups = new Set();
		collapsedProjects = new Set();
		// Clear persisted collapsed state
		setCollapsedEpics([]);
	}

	// Check if all groups are collapsed
	const allGroupsCollapsed = $derived(
		visibleGroupKeys.length > 0 && collapsedGroups.size >= visibleGroupKeys.length
	);

	// Check if any groups are collapsed
	const anyGroupsCollapsed = $derived(collapsedGroups.size > 0);

	// Reload collapsed groups from localStorage when grouping mode changes
	// This preserves user's collapse preferences when switching views
	$effect(() => {
		groupingMode; // dependency
		collapsedGroups = new Set(getCollapsedEpics());
		collapsedProjects = new Set();
	});

	// Initialize groupingMode from URL on mount
	$effect(() => {
		const groupByParam = $page.url.searchParams.get('groupBy');
		if (groupByParam && ['type', 'parent', 'label', 'project'].includes(groupByParam)) {
			groupingMode = groupByParam as GroupingMode;
		}
	});

	/**
	 * Set grouping mode and sync to URL
	 * @param mode - The grouping mode to set ('type', 'parent', 'label', 'project')
	 */
	function setGroupingMode(mode: GroupingMode) {
		console.log('[TaskTable] setGroupingMode called:', mode, '(was:', groupingMode, ')');
		groupingMode = mode;

		// Sync to URL
		const url = new URL(window.location.href);
		if (mode === 'parent') {
			// 'parent' is default, remove param
			url.searchParams.delete('groupBy');
		} else {
			url.searchParams.set('groupBy', mode);
		}
		replaceState(url, {});
		console.log('[TaskTable] groupingMode is now:', groupingMode);
	}

	// Detect new, removed, and status-changed tasks when tasks array changes
	// Using $effect.pre to set animation state BEFORE rendering
	$effect.pre(() => {
		const taskIds = tasks.map(t => t.id);
		const currentIds = new Set(taskIds);

		// Skip animation on initial load
		if (isInitialLoad) {
			previousTaskIds = currentIds;
			previousTasksMap = new Map(tasks.map(t => [t.id, t]));
			previousStatusMap = new Map(tasks.map(t => [t.id, t.status]));
			isInitialLoad = false;
			return;
		}

		// Find tasks that weren't in the previous set (new tasks)
		const newIds = new Set<string>();
		for (const id of currentIds) {
			if (!previousTaskIds.has(id)) {
				newIds.add(id);
			}
		}

		// Find tasks that were removed
		const removedTasks: Task[] = [];
		for (const id of previousTaskIds) {
			if (!currentIds.has(id)) {
				const task = previousTasksMap.get(id);
				if (task) {
					removedTasks.push(task);
				}
			}
		}

		// Find tasks that changed status to in_progress (started working)
		const startedIds: string[] = [];
		for (const task of tasks) {
			const prevStatus = previousStatusMap.get(task.id);
			if (prevStatus && prevStatus !== 'in_progress' && task.status === 'in_progress') {
				startedIds.push(task.id);
			}
		}

		// Find tasks that changed status to closed (completed)
		const closedIds: string[] = [];
		const fromWorkingIds: string[] = []; // Tasks that were in_progress before becoming closed
		for (const task of tasks) {
			const prevStatus = previousStatusMap.get(task.id);
			if (prevStatus && prevStatus !== 'closed' && task.status === 'closed') {
				closedIds.push(task.id);
				// Track if this task was working (in_progress) before completion
				if (prevStatus === 'in_progress') {
					fromWorkingIds.push(task.id);
				}
			}
		}

		// Update tracking for next comparison
		previousTaskIds = currentIds;
		previousTasksMap = new Map(tasks.map(t => [t.id, t]));
		previousStatusMap = new Map(tasks.map(t => [t.id, t.status]));

		// If we found new tasks, trigger animation and sound
		if (newIds.size > 0) {
			newTaskIds = Array.from(newIds);
			playNewTaskChime();

			// Clear the new task highlight after animation completes
			setTimeout(() => {
				newTaskIds = [];
			}, 1500);
		}

		// If tasks were removed, trigger exit animation and sound
		if (removedTasks.length > 0) {
			// Check allTasks for current status (task might be closed but filtered out of `tasks`)
			const allTasksMap = new Map(allTasks.map(t => [t.id, t]));

			// Update removed tasks with current status from allTasks
			const exitTasksWithStatus = removedTasks.map(t => {
				const currentTask = allTasksMap.get(t.id);
				if (currentTask && currentTask.status === 'closed') {
					return { ...t, status: 'closed' as const };
				}
				// Also check closedIds in case allTasks isn't updated yet
				if (closedIds.includes(t.id)) {
					return { ...t, status: 'closed' as const };
				}
				return t;
			});
			exitingTasks = exitTasksWithStatus;

			// Only play exit sound for non-completed tasks (completed tasks have their own sound)
			const nonCompletedExits = exitTasksWithStatus.filter(t => t.status !== 'closed');
			if (nonCompletedExits.length > 0) {
				playTaskExitSound();
			}

			// Clear exiting tasks after animation completes
			// Use longer timeout if any tasks are completed (to allow landing animation)
			const hasCompletedTasks = exitTasksWithStatus.some(t => t.status === 'closed');
			setTimeout(() => {
				exitingTasks = [];
			}, hasCompletedTasks ? 2000 : 600);
		}

		// If tasks started (status -> in_progress), play start sound
		if (startedIds.length > 0) {
			startingTaskIds = startedIds;
			playTaskStartSound();

			// Clear starting highlight after animation
			setTimeout(() => {
				startingTaskIds = [];
			}, 1500);
		}

		// If tasks completed (status -> closed), play completion sound and trigger landing animation
		if (closedIds.length > 0) {
			completedTaskIds = closedIds;
			workingCompletedTaskIds = fromWorkingIds; // Track working→completed transitions
			playTaskCompleteSound();

			// Add completed tasks to exitingTasks so they show landing animation
			// (since they get filtered out of the main table view)
			const completedTasks = tasks.filter(t => closedIds.includes(t.id));
			if (completedTasks.length > 0) {
				// Add to existing exitingTasks (don't overwrite removed tasks)
				exitingTasks = [...exitingTasks.filter(t => !closedIds.includes(t.id)), ...completedTasks];
			}

			// Check for epic completions (all children of an epic just became closed)
			checkForEpicCompletions(closedIds);

			// Clear completed highlight and exitingTasks after landing animation
			// (0.8s landing + 0.6s delay + 0.4s checkmark + 1.7s linger)
			setTimeout(() => {
				completedTaskIds = [];
				workingCompletedTaskIds = [];
				exitingTasks = exitingTasks.filter(t => !closedIds.includes(t.id));
			}, 3500);
		}
	});

	/**
	 * Check if any epics just had all their children complete
	 * Called when tasks transition to closed status
	 */
	function checkForEpicCompletions(justClosedIds: string[]) {
		// Don't celebrate if the user has disabled it
		if (!getEpicCelebration()) return;

		// Build a map of parent -> children (using allTasks for complete picture)
		const parentChildrenMap = new Map<string, Task[]>();
		for (const task of allTasks) {
			const parentId = extractParentId(task.id);
			if (parentId && parentId !== task.id) {
				// This is a child task
				if (!parentChildrenMap.has(parentId)) {
					parentChildrenMap.set(parentId, []);
				}
				parentChildrenMap.get(parentId)!.push(task);
			}
		}

		// Find epics where the just-closed task was the last incomplete child
		const newlyCompletedEpics: string[] = [];
		for (const closedId of justClosedIds) {
			const parentId = extractParentId(closedId);
			if (!parentId || parentId === closedId) continue;

			const children = parentChildrenMap.get(parentId);
			if (!children || children.length === 0) continue;

			// Check if ALL children are now closed (including the one that just closed)
			const allClosed = children.every(child =>
				child.status === 'closed' || justClosedIds.includes(child.id)
			);

			if (allClosed && !newlyCompletedEpics.includes(parentId)) {
				newlyCompletedEpics.push(parentId);
			}
		}

		if (newlyCompletedEpics.length > 0) {
			// Trigger epic celebration
			celebrateEpicCompletions(newlyCompletedEpics);
		}
	}

	/**
	 * Celebrate epic completions with toast, sound, and animation
	 */
	async function celebrateEpicCompletions(epicIds: string[]) {
		// Set state for animation
		completedEpicIds = epicIds;

		// Play the epic completion sound (grander than regular task completion)
		playEpicCompleteSound();

		// Show toast for each completed epic
		for (const epicId of epicIds) {
			// Find the epic in allTasks to get its title
			const epic = allTasks.find(t => t.id === epicId);
			const title = epic?.title || epicId;
			successToast(`Epic Complete: ${title}`, `All children of ${epicId} are now closed`);
		}

		// If auto-close is enabled, close the epics in Beads
		if (getEpicAutoClose()) {
			for (const epicId of epicIds) {
				try {
					await fetch(`/api/epics/${epicId}/close`, { method: 'POST' });
				} catch (err) {
					console.error(`Failed to auto-close epic ${epicId}:`, err);
				}
			}
		}

		// Clear epic animation state after animation completes
		setTimeout(() => {
			completedEpicIds = [];
		}, 3000);
	}

	// Check if an agent is actively working (uses shared utility)
	function isAgentWorking(agentName: string | undefined | null): boolean {
		if (!agentName || !agents.length) return false;
		const agent = agents.find(a => a.name === agentName);
		if (!agent) return false;
		return checkAgentWorking(agent);
	}

	// Check if an agent's session is actively generating output (for shimmer effect)
	// Uses the centralized workSessionsState activity polling
	// Shimmer shows for both 'generating' (output growing) and 'thinking' (agent processing)
	// Returns true for any assigned agent when activity state is unknown (better UX than no shimmer)
	function isAgentGenerating(agentName: string | undefined | null): boolean {
		if (!agentName) return false;
		const sessionName = `jat-${agentName}`;
		const session = workSessionsState.sessions.find(s => s.sessionName === sessionName);

		// If we have explicit activity state, use it
		if (session?._activityState) {
			return session._activityState === 'generating' || session._activityState === 'thinking';
		}

		// Fallback: return true for any assigned agent
		// Since taskIsActive already checks task.status === 'in_progress' && task.assignee,
		// if we get here with a valid agentName, we should show shimmer
		return true;
	}

	// Initialize filters from URL params (default to open + in_progress tasks)
	let searchQuery = $state('');
	let selectedProjects = $state<Set<string>>(new Set());
	let selectedPriorities = $state<Set<string>>(new Set(['0', '1', '2', '3']));
	let selectedStatuses = $state<Set<string>>(new Set(['open', 'in_progress']));
	let selectedTypes = $state<Set<string>>(new Set());
	let selectedLabels = $state<Set<string>>(new Set());
	let humanTasksOnly = $state(false); // Show only human-action tasks

	// Sorting state
	let sortColumn = $state('priority');
	let sortDirection = $state('asc'); // 'asc' or 'desc'

	// Selection state
	let selectedTasks = $state<Set<string>>(new Set());

	// Toggle single task selection
	function toggleTask(taskId: string) {
		if (selectedTasks.has(taskId)) {
			selectedTasks.delete(taskId);
		} else {
			selectedTasks.add(taskId);
		}
		selectedTasks = new Set(selectedTasks); // trigger reactivity
	}

	// Toggle all visible tasks
	function toggleAll() {
		if (allSelected) {
			selectedTasks = new Set(); // deselect all
		} else {
			selectedTasks = new Set(sortedTasks.map(t => t.id)); // select all visible
		}
	}

	// Clear selection
	function clearSelection() {
		selectedTasks = new Set();
	}

	// Sync filters with URL on mount and page changes
	$effect(() => {
		const params = new URLSearchParams(window.location.search);
		searchQuery = params.get('search') || '';

		const projects = params.get('projects');
		if (projects) {
			selectedProjects = new Set(projects.split(','));
		} else {
			selectedProjects = new Set();
		}

		const priorities = params.get('priorities');
		if (priorities) {
			selectedPriorities = new Set(priorities.split(','));
		} else {
			selectedPriorities = new Set(['0', '1', '2', '3']);
		}

		const statuses = params.get('statuses');
		if (statuses) {
			selectedStatuses = new Set(statuses.split(','));
		} else {
			selectedStatuses = new Set(['open', 'in_progress']);
		}

		const types = params.get('types');
		if (types) {
			selectedTypes = new Set(types.split(','));
		} else {
			selectedTypes = new Set();
		}

		const labels = params.get('labels');
		if (labels) {
			selectedLabels = new Set(labels.split(','));
		} else {
			selectedLabels = new Set();
		}

		const humanOnly = params.get('humanOnly');
		humanTasksOnly = humanOnly === 'true';

		// Restore sort state from URL
		const sortCol = params.get('sort');
		if (sortCol && ['id', 'title', 'priority', 'updated'].includes(sortCol)) {
			sortColumn = sortCol;
		}
		const sortDir = params.get('sortDir');
		if (sortDir && ['asc', 'desc'].includes(sortDir)) {
			sortDirection = sortDir;
		}
	});

	// Update URL when filters change
	function updateURL() {
		const params = new URLSearchParams();

		if (searchQuery) params.set('search', searchQuery);
		if (selectedProjects.size > 0) {
			params.set('projects', Array.from(selectedProjects).join(','));
		}
		if (selectedPriorities.size > 0 && selectedPriorities.size < 4) {
			params.set('priorities', Array.from(selectedPriorities).join(','));
		}
		if (selectedStatuses.size > 0) {
			params.set('statuses', Array.from(selectedStatuses).join(','));
		}
		if (selectedTypes.size > 0) {
			params.set('types', Array.from(selectedTypes).join(','));
		}
		if (selectedLabels.size > 0) {
			params.set('labels', Array.from(selectedLabels).join(','));
		}
		if (humanTasksOnly) {
			params.set('humanOnly', 'true');
		}

		// Persist sort state to URL (only if not default)
		if (sortColumn !== 'priority') {
			params.set('sort', sortColumn);
		}
		if (sortDirection !== 'asc') {
			params.set('sortDir', sortDirection);
		}

		const newURL = params.toString() ? `?${params.toString()}` : window.location.pathname;
		window.history.replaceState({}, '', newURL);
	}

	// Compute filtered tasks
	const filteredTasks = $derived.by(() => {
		let result = tasks;

		// Filter by search
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			result = result.filter(
				(task) =>
					task.title?.toLowerCase().includes(query) ||
					task.description?.toLowerCase().includes(query) ||
					task.id?.toLowerCase().includes(query)
			);
		}

		// Filter by project
		if (selectedProjects.size > 0) {
			result = result.filter((task) => {
				const project = getProjectFromTaskId(task.id);
				return project && selectedProjects.has(project);
			});
		}

		// Filter by priority
		if (selectedPriorities.size > 0 && selectedPriorities.size < 4) {
			result = result.filter((task) => selectedPriorities.has(String(task.priority)));
		}

		// Filter by status
		// Include tasks that match selected statuses OR are completed by an active session
		if (selectedStatuses.size > 0) {
			result = result.filter((task) =>
				selectedStatuses.has(task.status) ||
				completedTasksFromActiveSessions.has(task.id)
			);
		}

		// Filter by type
		if (selectedTypes.size > 0) {
			result = result.filter((task) => task.issue_type && selectedTypes.has(task.issue_type));
		}

		// Filter by labels
		if (selectedLabels.size > 0) {
			result = result.filter((task) => {
				const taskLabels = task.labels || [];
				return Array.from(selectedLabels).every((label) => taskLabels.includes(label));
			});
		}

		// Filter for human tasks only
		if (humanTasksOnly) {
			result = result.filter((task) => isHumanTask(task));
		}

		return result;
	});

	// Calculate recommended tasks - top 3 highest-impact ready tasks
	// Uses scoring based on: unblocks count, active epic, idle agents, priority
	// NOTE: Uses `tasks` (not allTasks) for O(n) performance in projects page context.
	// For full cross-project analysis, use the main /tasks page instead.
	const recommendedTasks = $derived.by(() => {
		const scores = new Map<string, RecommendationScore>();

		// Only calculate for open tasks (ready to start)
		// Use filteredTasks for both iteration and dependency analysis
		for (const task of filteredTasks) {
			if (task.status === 'open') {
				const score = calculateRecommendationScore(task, tasks, agents);
				if (score.isRecommended) {
					scores.set(task.id, score);
				}
			}
		}

		// Sort by score and take top 3
		const sorted = Array.from(scores.entries())
			.sort((a, b) => b[1].score - a[1].score)
			.slice(0, 3);

		return new Map(sorted);
	});

	// Calculate critical paths for all incomplete epics
	// Task: jat-puza.5 - Critical path highlighting in TaskTable
	// NOTE: Uses `tasks` (not allTasks) for O(n) performance in projects page context.
	// For full cross-project analysis, use the main /tasks page instead.
	const criticalPaths = $derived.by(() => {
		return calculateAllCriticalPaths(tasks);
	});

	// Type order for grouping (BUG first, then features, tasks, chores, epics, no type last)
	const typeOrder = ['bug', 'feature', 'task', 'chore', 'epic', null];

	// Sort function for project mode: user's sort column is PRIMARY
	// Secondary tiebreakers: working agents, assigned, no blockers
	function sortTasksForProjectMode(tasksToSort: Task[]): Task[] {
		const before = tasksToSort.map(t => t.id);
		const result = [...tasksToSort].sort((a, b) => {
			// PRIMARY: sort by user-selected column
			let aVal, bVal;

			switch (sortColumn) {
				case 'id':
					// Use hierarchical-aware comparison for IDs
					const idComparison = compareTaskIds(a.id || '', b.id || '');
					return sortDirection === 'asc' ? idComparison : -idComparison;
				case 'title':
					aVal = a.title || '';
					bVal = b.title || '';
					break;
				case 'priority':
					aVal = a.priority ?? 99;
					bVal = b.priority ?? 99;
					break;
				case 'status':
					aVal = a.status || '';
					bVal = b.status || '';
					break;
				case 'type':
					aVal = a.issue_type || '';
					bVal = b.issue_type || '';
					break;
				case 'assignee':
					aVal = a.assignee || '';
					bVal = b.assignee || '';
					break;
				case 'updated':
					aVal = a.updated_at || '';
					bVal = b.updated_at || '';
					break;
				default:
					// Fallback: priority then created_ts
					const aPriority = a.priority ?? 99;
					const bPriority = b.priority ?? 99;
					if (aPriority !== bPriority) return aPriority - bPriority;
					const aCreated = a.created_ts || '';
					const bCreated = b.created_ts || '';
					return aCreated.localeCompare(bCreated);
			}

			let primaryComparison: number;
			if (typeof aVal === 'number' && typeof bVal === 'number') {
				primaryComparison = sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
			} else {
				const strComparison = String(aVal).localeCompare(String(bVal));
				primaryComparison = sortDirection === 'asc' ? strComparison : -strComparison;
			}

			// If primary sort is equal, use tiebreakers
			if (primaryComparison !== 0) return primaryComparison;

			// Tiebreaker 1: tasks with working agents come first
			const aWorking = isAgentWorking(a.assignee);
			const bWorking = isAgentWorking(b.assignee);
			if (aWorking && !bWorking) return -1;
			if (!aWorking && bWorking) return 1;

			// Tiebreaker 2: tasks with any assignee come before unassigned
			const aAssigned = !!a.assignee;
			const bAssigned = !!b.assignee;
			if (aAssigned && !bAssigned) return -1;
			if (!aAssigned && bAssigned) return 1;

			// Tiebreaker 3: tasks with NO unresolved dependencies come before those with blockers
			const aUnresolvedDeps = (a.depends_on || []).filter(d => d.status !== 'closed').length;
			const bUnresolvedDeps = (b.depends_on || []).filter(d => d.status !== 'closed').length;
			if (aUnresolvedDeps === 0 && bUnresolvedDeps > 0) return -1;
			if (aUnresolvedDeps > 0 && bUnresolvedDeps === 0) return 1;

			return 0;
		});
		const after = result.map(t => t.id);
		if (before.length > 1) {
			console.log('[TaskTable] sortTasksForProjectMode - before:', before, 'after:', after, 'changed:', JSON.stringify(before) !== JSON.stringify(after));
		}
		return result;
	}

	// Sort function used within each group
	// Priority: 1) User's sort column, 2) Tiebreakers (working, assigned)
	function sortTasks(tasksToSort: Task[]): Task[] {
		console.log('[TaskTable] sortTasks called - groupingMode:', groupingMode, 'sortColumn:', sortColumn, 'sortDirection:', sortDirection, 'tasksCount:', tasksToSort.length);

		// Use specialized sorting for project mode
		if (groupingMode === 'project') {
			console.log('[TaskTable] Using sortTasksForProjectMode');
			return sortTasksForProjectMode(tasksToSort);
		}

		console.log('[TaskTable] Using standard sort by', sortColumn, sortDirection);
		return [...tasksToSort].sort((a, b) => {
			// PRIMARY: apply user's sort column first
			let aVal, bVal;

			switch (sortColumn) {
				case 'id':
					// Use hierarchical-aware comparison for IDs (handles jat-abc.1, jat-abc.10 correctly)
					const idComparison = compareTaskIds(a.id || '', b.id || '');
					const idResult = sortDirection === 'asc' ? idComparison : -idComparison;
					if (idResult !== 0) return idResult;
					break;
				case 'title':
					aVal = a.title || '';
					bVal = b.title || '';
					break;
				case 'priority':
					aVal = a.priority ?? 99;
					bVal = b.priority ?? 99;
					break;
				case 'status':
					aVal = a.status || '';
					bVal = b.status || '';
					break;
				case 'type':
					aVal = a.issue_type || '';
					bVal = b.issue_type || '';
					break;
				case 'assignee':
					aVal = a.assignee || '';
					bVal = b.assignee || '';
					break;
				case 'updated':
					aVal = a.updated_at || '';
					bVal = b.updated_at || '';
					break;
				default:
					aVal = a.priority ?? 99;
					bVal = b.priority ?? 99;
			}

			let primaryComparison: number;
			if (typeof aVal === 'number' && typeof bVal === 'number') {
				primaryComparison = sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
			} else {
				const strComparison = String(aVal).localeCompare(String(bVal));
				primaryComparison = sortDirection === 'asc' ? strComparison : -strComparison;
			}

			// If primary sort is equal, use tiebreakers
			if (primaryComparison !== 0) return primaryComparison;

			// Tiebreaker 1: tasks with working agents come first
			const aWorking = isAgentWorking(a.assignee);
			const bWorking = isAgentWorking(b.assignee);
			if (aWorking && !bWorking) return -1;
			if (!aWorking && bWorking) return 1;

			// Tiebreaker 2: tasks with any assignee come before unassigned
			const aAssigned = !!a.assignee;
			const bAssigned = !!b.assignee;
			if (aAssigned && !bAssigned) return -1;
			if (!aAssigned && bAssigned) return 1;

			return 0;
		});
	}

	/**
	 * Get the grouping key for a task based on current groupingMode
	 */
	function getGroupKey(task: Task): string | null {
		switch (groupingMode) {
			case 'type':
				return task.issue_type || null;
			case 'parent':
				// Get parent epic ID - checks both hierarchical IDs (jat-abc.1) AND dependency-based relationships
				// Tasks without a parent (epics or standalone) use their own ID as the group
				const parentId = getParentEpicId(task.id, epicChildMap);
				return parentId || task.id; // Use own ID if no parent (standalone/epic)
			case 'label':
				// Group by first label, or null if no labels
				return task.labels && task.labels.length > 0 ? task.labels[0] : null;
			case 'project':
				// Composite key: "project::epic" for nested grouping
				// Example: "jat::jat-abc" for subtask, "jat::jat-abc" for epic itself, "jat::" for standalone
				const project = getProjectFromTaskId(task.id);
				// Get parent epic - checks both hierarchical IDs AND dependency-based relationships
				const epic = getParentEpicId(task.id, epicChildMap) || task.id;
				return project ? `${project}::${epic}` : null;
			default:
				return task.issue_type || null;
		}
	}

	// Grouped tasks based on groupingMode (for sticky headers)
	const groupedTasks = $derived.by(() => {
		// Explicitly reference sort state to ensure Svelte tracks these dependencies
		// (needed because sortTasks() reads them indirectly via closure)
		const _sortCol = sortColumn;
		const _sortDir = sortDirection;

		console.log('[TaskTable] groupedTasks derived - groupingMode:', groupingMode, 'sortColumn:', _sortCol, 'sortDir:', _sortDir, 'filteredTasks:', filteredTasks.length);

		const groups = new Map<string | null, Task[]>();

		// For 'none' mode, put all tasks in a single group and sort by user's column
		if (groupingMode === 'none') {
			console.log('[TaskTable] NONE mode - creating single __all__ group');
			const sorted = sortTasks([...filteredTasks]);
			console.log('[TaskTable] NONE mode - sorted tasks:', sorted.slice(0, 5).map(t => ({ id: t.id, title: t.title?.slice(0, 20), updated: t.updated_at })));
			groups.set('__all__', sorted);
			return groups;
		}

		// For 'type' mode, initialize groups in order
		if (groupingMode === 'type') {
			for (const type of typeOrder) {
				groups.set(type, []);
			}
		}

		// Group tasks by the appropriate key
		for (const task of filteredTasks) {
			const key = getGroupKey(task);
			if (!groups.has(key)) {
				groups.set(key, []);
			}
			groups.get(key)!.push(task);
		}

		// Sort tasks within each group
		for (const [key, groupTasks] of groups) {
			groups.set(key, sortTasks(groupTasks));
		}

		// For parent mode, sort groups: epics first (those with children), then standalone tasks
		if (groupingMode === 'parent') {
			const sortedEntries = Array.from(groups.entries()).sort(([keyA, tasksA], [keyB, tasksB]) => {
				// Groups with more tasks (epics with children) come first
				const sizeA = tasksA.length;
				const sizeB = tasksB.length;
				if (sizeA !== sizeB) return sizeB - sizeA;
				// Then alphabetically by key
				return (keyA || '').localeCompare(keyB || '');
			});
			return new Map(sortedEntries);
		}

		// For project mode, sort groups: EPICS FIRST, then standalone tasks
		// Within each category, sort by user's column
		if (groupingMode === 'project') {
			const sortedEntries = Array.from(groups.entries()).sort(([keyA, tasksA], [keyB, tasksB]) => {
				// Get the "representative" task for each group (first task after sorting)
				const taskA = tasksA[0];
				const taskB = tasksB[0];

				if (!taskA || !taskB) return 0;

				// FIRST: Epics (groups with >1 task OR task is type 'epic') come before standalone tasks
				const isEpicA = tasksA.length > 1 || taskA.issue_type === 'epic';
				const isEpicB = tasksB.length > 1 || taskB.issue_type === 'epic';
				if (isEpicA && !isEpicB) return -1;  // A is epic, B is not → A first
				if (!isEpicA && isEpicB) return 1;   // B is epic, A is not → B first

				// SECOND: Sort by user's selected column within same category
				let aVal, bVal;
				switch (_sortCol) {
					case 'id':
						aVal = taskA.id || '';
						bVal = taskB.id || '';
						break;
					case 'title':
						aVal = taskA.title || '';
						bVal = taskB.title || '';
						break;
					case 'priority':
						aVal = taskA.priority ?? 99;
						bVal = taskB.priority ?? 99;
						break;
					case 'updated':
						aVal = taskA.updated_at || '';
						bVal = taskB.updated_at || '';
						break;
					default:
						aVal = taskA.priority ?? 99;
						bVal = taskB.priority ?? 99;
				}

				let primaryComparison: number;
				if (typeof aVal === 'number' && typeof bVal === 'number') {
					primaryComparison = _sortDir === 'asc' ? aVal - bVal : bVal - aVal;
				} else {
					const strComparison = String(aVal).localeCompare(String(bVal));
					primaryComparison = _sortDir === 'asc' ? strComparison : -strComparison;
				}

				if (primaryComparison !== 0) return primaryComparison;

				// TIEBREAKER: Sort by project name, then epic key
				const [projectA, epicA] = (keyA || '').split('::');
				const [projectB, epicB] = (keyB || '').split('::');
				const projectCompare = (projectA || '').localeCompare(projectB || '');
				if (projectCompare !== 0) return projectCompare;
				return (epicA || '').localeCompare(epicB || '');
			});
			console.log('[TaskTable] Project mode group sort by', _sortCol, _sortDir, '- groups:', sortedEntries.map(([k, t]) => k + '(' + t.length + ')').slice(0, 5));
			return new Map(sortedEntries);
		}

		return groups;
	});

	// Nested grouped tasks for project mode: Map<project, Map<epic, Task[]>>
	// This provides true two-level grouping with collapsible project headers
	const nestedGroupedTasks = $derived.by(() => {
		// Explicitly reference sort state to ensure Svelte tracks these dependencies
		// (needed because sortTasksForProjectMode() reads them indirectly via closure)
		const _sortCol = sortColumn;
		const _sortDir = sortDirection;

		const projectMap = new Map<string, Map<string, Task[]>>();

		if (groupingMode !== 'project') {
			return projectMap; // Empty map for non-project modes
		}

		// Group tasks by project first, then by epic
		for (const task of filteredTasks) {
			const project = getProjectFromTaskId(task.id) || 'unknown';
			const epic = getParentEpicId(task.id, epicChildMap) || task.id;

			if (!projectMap.has(project)) {
				projectMap.set(project, new Map<string, Task[]>());
			}

			const epicMap = projectMap.get(project)!;
			if (!epicMap.has(epic)) {
				epicMap.set(epic, []);
			}
			epicMap.get(epic)!.push(task);
		}

		// Sort tasks within each epic
		for (const [project, epicMap] of projectMap) {
			for (const [epic, epicTasks] of epicMap) {
				epicMap.set(epic, sortTasksForProjectMode(epicTasks));
			}

			// Sort epics within project: EPICS FIRST (multi-task groups), then standalone tasks
			// Within each category, sort by user's column
			const sortedEpicEntries = Array.from(epicMap.entries()).sort(([epicA, tasksA], [epicB, tasksB]) => {
				const taskA = tasksA[0];
				const taskB = tasksB[0];
				if (!taskA || !taskB) return 0;

				// FIRST: Epics (groups with >1 task OR task is type 'epic') come before standalone tasks
				const isEpicA = tasksA.length > 1 || taskA.issue_type === 'epic';
				const isEpicB = tasksB.length > 1 || taskB.issue_type === 'epic';
				if (isEpicA && !isEpicB) return -1;  // A is epic, B is not → A first
				if (!isEpicA && isEpicB) return 1;   // B is epic, A is not → B first

				// SECOND: Sort by user's column within same category
				let aVal, bVal;
				switch (_sortCol) {
					case 'id': aVal = taskA.id || ''; bVal = taskB.id || ''; break;
					case 'title': aVal = taskA.title || ''; bVal = taskB.title || ''; break;
					case 'priority': aVal = taskA.priority ?? 99; bVal = taskB.priority ?? 99; break;
					case 'updated': aVal = taskA.updated_at || ''; bVal = taskB.updated_at || ''; break;
					default: aVal = taskA.priority ?? 99; bVal = taskB.priority ?? 99;
				}

				let cmp: number;
				if (typeof aVal === 'number' && typeof bVal === 'number') {
					cmp = _sortDir === 'asc' ? aVal - bVal : bVal - aVal;
				} else {
					const strCmp = String(aVal).localeCompare(String(bVal));
					cmp = _sortDir === 'asc' ? strCmp : -strCmp;
				}
				if (cmp !== 0) return cmp;

				// Tiebreaker: alphabetically by epic ID
				return epicA.localeCompare(epicB);
			});
			projectMap.set(project, new Map(sortedEpicEntries));
		}

		// Sort projects by USER'S SORT COLUMN (using best task in each project)
		const sortedProjectEntries = Array.from(projectMap.entries()).sort(([projA, epicMapA], [projB, epicMapB]) => {
			// Get first task from first epic in each project
			const firstEpicA = epicMapA.values().next().value;
			const firstEpicB = epicMapB.values().next().value;
			const taskA = firstEpicA?.[0];
			const taskB = firstEpicB?.[0];
			if (!taskA || !taskB) return projA.localeCompare(projB);

			let aVal, bVal;
			switch (_sortCol) {
				case 'id': aVal = taskA.id || ''; bVal = taskB.id || ''; break;
				case 'title': aVal = taskA.title || ''; bVal = taskB.title || ''; break;
				case 'priority': aVal = taskA.priority ?? 99; bVal = taskB.priority ?? 99; break;
				case 'updated': aVal = taskA.updated_at || ''; bVal = taskB.updated_at || ''; break;
				default: aVal = taskA.priority ?? 99; bVal = taskB.priority ?? 99;
			}

			let cmp: number;
			if (typeof aVal === 'number' && typeof bVal === 'number') {
				cmp = _sortDir === 'asc' ? aVal - bVal : bVal - aVal;
			} else {
				const strCmp = String(aVal).localeCompare(String(bVal));
				cmp = _sortDir === 'asc' ? strCmp : -strCmp;
			}
			if (cmp !== 0) return cmp;

			// Tiebreaker: alphabetically by project name
			return projA.localeCompare(projB);
		});
		console.log('[TaskTable] nestedGroupedTasks sort by', _sortCol, _sortDir, '- projects:', sortedProjectEntries.map(([p]) => p));
		return new Map(sortedProjectEntries);
	});

	// Get total task count for a project (for project header)
	function getProjectTaskCount(project: string): number {
		const epicMap = nestedGroupedTasks.get(project);
		if (!epicMap) return 0;
		let count = 0;
		for (const tasks of epicMap.values()) {
			count += tasks.length;
		}
		return count;
	}

	// Get agents currently working on a project (for project header avatars)
	// Only shows agents with in_progress tasks to match the TopBar active agent count
	function getProjectAssignedAgents(project: string): string[] {
		const epicMap = nestedGroupedTasks.get(project);
		if (!epicMap) return [];
		const agents = new Set<string>();
		for (const tasks of epicMap.values()) {
			for (const task of tasks) {
				// Only include agents with in_progress tasks (actively working)
				if (task.assignee && task.status === 'in_progress') {
					agents.add(task.assignee);
				}
			}
		}
		return Array.from(agents);
	}

	// Flattened list of all visible tasks (for select-all and backward compatibility)
	const sortedTasks = $derived.by(() => {
		if (groupingMode === 'project') {
			const allTasks: Task[] = [];
			for (const epicMap of nestedGroupedTasks.values()) {
				for (const tasks of epicMap.values()) {
					allTasks.push(...tasks);
				}
			}
			return allTasks;
		}

		const allTasks = [];
		for (const [type, tasks] of groupedTasks) {
			allTasks.push(...tasks);
		}
		return allTasks;
	});

	// Derived: are all visible tasks selected?
	const allSelected = $derived(
		sortedTasks.length > 0 &&
		sortedTasks.every(t => selectedTasks.has(t.id))
	);

	// Derived: is selection partial (some but not all)?
	const partialSelected = $derived(
		selectedTasks.size > 0 && !allSelected
	);

	// Get unique labels and types from tasks
	const availableLabels = $derived.by(() => {
		const labelsSet = new Set<string>();
		tasks.forEach((task) => {
			task.labels?.forEach((label: string) => labelsSet.add(label));
		});
		return Array.from(labelsSet).sort();
	});

	const availableTypes = $derived.by(() => {
		const typesSet = new Set<string>();
		tasks.forEach((task) => {
			if (task.issue_type) typesSet.add(task.issue_type);
		});
		return Array.from(typesSet).sort();
	});

	const availableProjects = $derived.by(() => {
		const projectsSet = new Set<string>();
		tasks.forEach((task) => {
			const project = getProjectFromTaskId(task.id);
			if (project) projectsSet.add(project);
		});
		return Array.from(projectsSet).sort();
	});

	// Pre-computed map: task.id → tasks that depend on it (for "Blocks" column)
	// This avoids O(n²) filtering in the template - replaces allTasksList.filter()
	const blockedByMap = $derived.by(() => {
		const map = new Map<string, Task[]>();
		const taskSource = allTasks.length > 0 ? allTasks : tasks;
		for (const task of taskSource) {
			if (task.status === 'closed') continue; // Only track open blockers
			if (!task.depends_on) continue;
			for (const dep of task.depends_on) {
				if (!map.has(dep.id)) {
					map.set(dep.id, []);
				}
				map.get(dep.id)!.push(task);
			}
		}
		return map;
	});

	// Pre-computed map: epic.id → all children (for epic completion tracking)
	// This avoids O(n) filtering per epic header in the template
	const epicChildrenAllMap = $derived.by(() => {
		const map = new Map<string, Task[]>();
		const taskSource = allTasks.length > 0 ? allTasks : tasks;
		for (const task of taskSource) {
			// Get parent via extractParentId or epicChildMap
			const parentFromId = extractParentId(task.id);
			const parentFromMap = epicChildMap.get(task.id);
			const parentId = parentFromId || parentFromMap;
			if (parentId && parentId !== task.id) {
				if (!map.has(parentId)) {
					map.set(parentId, []);
				}
				map.get(parentId)!.push(task);
			}
		}
		return map;
	});

	// Pre-computed map: task.id → task for O(1) lookups
	// This avoids O(n) .find() operations in group headers
	const taskLookupMap = $derived.by(() => {
		const map = new Map<string, Task>();
		const taskSource = allTasks.length > 0 ? allTasks : tasks;
		for (const task of taskSource) {
			map.set(task.id, task);
		}
		return map;
	});

	// Filter options for FilterDropdown components
	const projectOptions = $derived(availableProjects.map(p => ({
		value: p,
		label: p,
		count: tasks.filter(t => getProjectFromTaskId(t.id) === p).length
	})));

	const priorityOptions = $derived(['0', '1', '2', '3'].map(p => ({
		value: p,
		label: `P${p}`,
		count: tasks.filter(t => String(t.priority) === p).length
	})));

	const statusOptions = $derived(['open', 'in_progress', 'blocked', 'closed'].map(s => ({
		value: s,
		label: s.replace('_', ' '),
		count: tasks.filter(t => t.status === s).length
	})));

	const typeOptions = $derived(availableTypes.map(t => ({
		value: t,
		label: t,
		count: tasks.filter(task => task.issue_type === t).length
	})));

	const labelOptions = $derived(availableLabels.map(l => ({
		value: l,
		label: l,
		count: tasks.filter(t => t.labels?.includes(l)).length
	})));

	// Toggle functions using shared helper
	function toggleProject(project: string) {
		selectedProjects = toggleSetItem(selectedProjects, project);
		updateURL();
	}

	function togglePriority(priority: string) {
		selectedPriorities = toggleSetItem(selectedPriorities, priority);
		updateURL();
	}

	function toggleStatus(status: string) {
		selectedStatuses = toggleSetItem(selectedStatuses, status);
		updateURL();
	}

	function toggleType(type: string) {
		selectedTypes = toggleSetItem(selectedTypes, type);
		updateURL();
	}

	function toggleLabel(label: string) {
		selectedLabels = toggleSetItem(selectedLabels, label);
		updateURL();
	}

	function clearAllFilters() {
		searchQuery = '';
		selectedProjects = new Set();
		selectedPriorities = new Set(['0', '1', '2', '3']);
		selectedStatuses = new Set(['open', 'in_progress']);
		selectedTypes = new Set();
		selectedLabels = new Set();
		humanTasksOnly = false;
		sortColumn = 'priority';
		sortDirection = 'asc';
		updateURL();
	}

	// Sorting
	function handleSort(column: string) {
		console.log('[TaskTable] handleSort called:', column, '(current:', sortColumn, sortDirection, ')');
		if (sortColumn === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column;
			sortDirection = 'asc';
		}
		console.log('[TaskTable] handleSort - new state:', sortColumn, sortDirection);
		updateURL();
	}

	// Copy to clipboard
	let copiedTaskId = $state<string | null>(null);
	async function copyTaskId(taskId: string, event: MouseEvent) {
		event.stopPropagation(); // Don't trigger row click
		try {
			await navigator.clipboard.writeText(taskId);
			copiedTaskId = taskId;
			setTimeout(() => {
				copiedTaskId = null;
			}, 1500);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}


	// Handle row click
	function handleRowClick(taskId: string) {
		ontaskclick(taskId);
	}

	// Bulk action state
	let bulkActionLoading = $state(false);
	let bulkActionError = $state('');

	// Spawn operation state
	let spawningSingle = $state<string | null>(null); // Task ID being spawned, or null
	let spawningBulk = $state(false); // True when bulk spawn is in progress

	// Bulk epic linking state
	interface BulkEpic {
		id: string;
		title: string;
		status: string;
		priority: number;
		dependency_count?: number;
	}
	let bulkEpics = $state<BulkEpic[]>([]);
	let bulkEpicsLoading = $state(false);
	let bulkEpicsError = $state<string | null>(null);
	let bulkEpicSearchQuery = $state('');
	let bulkLinkingEpicId = $state<string | null>(null);

	// Task files state - tracks files attached to tasks (images, PDFs, text, etc.)
	let taskFiles = $state<Map<string, TaskFile[]>>(new Map());
	let uploadingFile = $state<string | null>(null); // Task ID currently uploading file
	let dragOverTask = $state<string | null>(null); // Task ID being dragged over

	/**
	 * Spawn a single agent to work on a specific task
	 * Calls POST /api/work/spawn with the task ID
	 * If an image is attached to the task, it will be passed to the agent
	 * @param taskId - The ID of the task to spawn an agent for
	 * @returns Promise that resolves when spawn completes
	 */
	async function handleSpawnSingle(taskId: string): Promise<boolean> {
		if (spawningSingle || spawningBulk) return false; // Prevent concurrent spawns

		spawningSingle = taskId;
		try {
			// Check if this task has attached files
			const taskFileArray = taskFiles.get(taskId) || [];
			const filePaths = taskFileArray.map(f => f.path).filter(Boolean);
			// Pass first file for backward compatibility, all files stored in task notes
			const imagePath = filePaths.length > 0 ? filePaths[0] : null;

			const response = await fetch('/api/work/spawn', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ taskId, imagePath })
			});

			const data = await response.json();

			if (!response.ok) {
				console.error('Spawn failed:', data.error || data.message);
				return false;
			}

			// Success - the API has already:
			// 1. Registered a new agent
			// 2. Updated task status to in_progress
			// 3. Created tmux session with Claude Code
			// 4. Sent the image path if one was attached
			// Parent page polling will pick up the updated task state
			console.log(`Spawned agent ${data.session?.agentName} for task ${taskId}${imagePath ? ' (with image)' : ''}`);

			// Clear the files after successful spawn (they've been sent)
			if (imagePath) {
				clearAllTaskFiles(taskId);
			}

			return true;
		} catch (err) {
			console.error('Spawn request failed:', err);
			return false;
		} finally {
			spawningSingle = null;
		}
	}

	/**
	 * Spawn agents for all selected tasks with staggered timing
	 * Spawns agents in parallel with small stagger (500ms) between request starts
	 * Each spawn takes 8-17 seconds server-side, so we fire them quickly and track results
	 * @returns Promise that resolves when all spawns complete
	 */
	async function handleBulkSpawn(): Promise<void> {
		const startTime = Date.now();
		console.log(`[bulk spawn] ========== BULK SPAWN STARTED ==========`);
		console.log(`[bulk spawn] spawningBulk=${spawningBulk}, spawningSingle=${spawningSingle}`);
		console.log(`[bulk spawn] selectedTasks.size=${selectedTasks.size}`);

		if (spawningBulk || spawningSingle) {
			console.log(`[bulk spawn] BLOCKED: Already spawning, exiting early`);
			return;
		}
		if (selectedTasks.size === 0) {
			console.log(`[bulk spawn] BLOCKED: No tasks selected, exiting early`);
			return;
		}

		spawningBulk = true;
		const taskIds = Array.from(selectedTasks);
		console.log(`[bulk spawn] Task IDs to spawn (${taskIds.length}):`, taskIds);

		// Fire off all spawn requests with small stagger (500ms between starts)
		// Each request runs in parallel - we don't wait for completion before starting next
		const spawnPromises = taskIds.map(async (taskId, i) => {
			const taskStartTime = Date.now();

			// Small stagger to avoid overwhelming the server
			if (i > 0) {
				console.log(`[bulk spawn] [${i + 1}/${taskIds.length}] ${taskId}: Waiting ${i * 500}ms stagger...`);
				await new Promise(resolve => setTimeout(resolve, i * 500));
			}

			console.log(`[bulk spawn] [${i + 1}/${taskIds.length}] ${taskId}: Sending spawn request...`);

			try {
				const response = await fetch('/api/work/spawn', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ taskId })
				});

				console.log(`[bulk spawn] [${i + 1}/${taskIds.length}] ${taskId}: Response status=${response.status} (${Date.now() - taskStartTime}ms)`);

				let data;
				try {
					data = await response.json();
				} catch (jsonErr) {
					console.error(`[bulk spawn] [${i + 1}/${taskIds.length}] ${taskId}: Failed to parse JSON response:`, jsonErr);
					return { taskId, success: false, error: 'JSON parse failed' };
				}

				const success = response.ok;

				if (success) {
					console.log(`[bulk spawn] [${i + 1}/${taskIds.length}] ${taskId}: ✓ SUCCESS - Agent: ${data.session?.agentName} (${Date.now() - taskStartTime}ms)`);
				} else {
					console.error(`[bulk spawn] [${i + 1}/${taskIds.length}] ${taskId}: ✗ FAILED - ${data.error || data.message}`, data);
				}

				return { taskId, success, data };
			} catch (err) {
				console.error(`[bulk spawn] [${i + 1}/${taskIds.length}] ${taskId}: ✗ EXCEPTION after ${Date.now() - taskStartTime}ms:`, err);
				return { taskId, success: false, error: err };
			}
		});

		console.log(`[bulk spawn] All ${spawnPromises.length} promises created, waiting for completion...`);

		try {
			// Wait for all spawns to complete (they're running in parallel)
			const results = await Promise.all(spawnPromises);

			// Log summary
			const successCount = results.filter(r => r.success).length;
			const failedTasks = results.filter(r => !r.success).map(r => r.taskId);

			console.log(`[bulk spawn] ========== BULK SPAWN COMPLETE ==========`);
			console.log(`[bulk spawn] Results: ${successCount}/${taskIds.length} succeeded in ${Date.now() - startTime}ms`);
			if (failedTasks.length > 0) {
				console.log(`[bulk spawn] Failed tasks:`, failedTasks);
			}

			// Clear selection on success
			if (successCount > 0) {
				console.log(`[bulk spawn] Clearing selection...`);
				clearSelection();
			}
		} catch (err) {
			console.error('[bulk spawn] ✗ Promise.all EXCEPTION:', err);
		} finally {
			spawningBulk = false;
			console.log(`[bulk spawn] spawningBulk reset to false`);
		}
	}

	// Helper to run bulk operations with consistent state management
	async function runBulkOperation(operation: (taskId: string) => Promise<void>) {
		bulkActionLoading = true;
		bulkActionError = '';

		const result = await bulkApiOperation(
			Array.from(selectedTasks),
			operation,
			{ continueOnError: false }
		);

		if (result.success) {
			clearSelection();
		} else {
			bulkActionError = result.errors[0] || 'Operation failed';
		}

		bulkActionLoading = false;
	}

	// Bulk action handlers using shared utilities
	async function handleBulkDelete() {
		if (!confirm(`Delete ${selectedTasks.size} task(s)? This cannot be undone.`)) return;

		await runBulkOperation(async (taskId: string) => {
			const response = await fetchWithTimeout(`/api/tasks/${taskId}`, createDeleteRequest());
			if (!response.ok) {
				throw new Error(await handleApiError(response, `delete task ${taskId}`));
			}
		});

		// Notify parent to refresh after successful deletion
		if (onTasksChanged) {
			onTasksChanged();
		}
	}

	async function handleBulkRelease() {
		await runBulkOperation(async (taskId: string) => {
			const response = await fetchWithTimeout(
				`/api/tasks/${taskId}`,
				createPutRequest({ assignee: null, status: 'open' })
			);
			if (!response.ok) {
				throw new Error(await handleApiError(response, `release task ${taskId}`));
			}
		});
	}

	async function handleBulkAssign() {
		const agentName = prompt('Enter agent name to assign tasks to:');
		if (!agentName) return;

		await runBulkOperation(async (taskId: string) => {
			const response = await fetchWithTimeout(
				`/api/tasks/${taskId}`,
				createPutRequest({ assignee: agentName, status: 'in_progress' })
			);
			if (!response.ok) {
				throw new Error(await handleApiError(response, `assign task ${taskId}`));
			}
		});
	}

	async function handleBulkChangePriority(priority: number) {
		await runBulkOperation(async (taskId: string) => {
			const response = await fetchWithTimeout(
				`/api/tasks/${taskId}`,
				createPutRequest({ priority })
			);
			if (!response.ok) {
				throw new Error(await handleApiError(response, `update priority for ${taskId}`));
			}
		});
	}

	async function handleBulkChangeStatus(status: string) {
		await runBulkOperation(async (taskId: string) => {
			const response = await fetchWithTimeout(
				`/api/tasks/${taskId}`,
				createPutRequest({ status })
			);
			if (!response.ok) {
				throw new Error(await handleApiError(response, `update status for ${taskId}`));
			}
		});
	}

	async function handleBulkAddLabel() {
		const label = prompt('Enter label to add to selected tasks:');
		if (!label) return;

		await runBulkOperation(async (taskId) => {
			// First get current task to get existing labels
			const getResponse = await fetchWithTimeout(`/api/tasks/${taskId}`);
			if (!getResponse.ok) {
				throw new Error(await handleApiError(getResponse, `fetch task ${taskId}`));
			}
			const taskData = await getResponse.json();
			const currentLabels = taskData.task?.labels || [];

			// Add new label if not already present
			if (!currentLabels.includes(label)) {
				const response = await fetchWithTimeout(
					`/api/tasks/${taskId}`,
					createPutRequest({ labels: [...currentLabels, label] })
				);
				if (!response.ok) {
					throw new Error(await handleApiError(response, `add label to ${taskId}`));
				}
			}
		});
	}

	// ========== Bulk Epic Linking ==========

	/**
	 * Fetch available epics for bulk linking based on selected tasks
	 * Determines project from first selected task and fetches epics for that project
	 */
	async function fetchBulkEpics() {
		if (selectedTasks.size === 0) return;

		// Get project from first selected task
		const firstTaskId = Array.from(selectedTasks)[0];
		const projectName = firstTaskId.split('-')[0];
		if (!projectName) return;

		bulkEpicsLoading = true;
		bulkEpicsError = null;
		try {
			const response = await fetch(`/api/epics?project=${projectName}`);
			if (!response.ok) throw new Error('Failed to fetch epics');
			const data = await response.json();
			bulkEpics = data.epics || [];
		} catch (err) {
			bulkEpicsError = err instanceof Error ? err.message : 'Failed to load epics';
		} finally {
			bulkEpicsLoading = false;
		}
	}

	/**
	 * Filter epics based on search query
	 */
	function filterBulkEpics(query: string): BulkEpic[] {
		if (!query.trim()) return bulkEpics;
		const q = query.toLowerCase();
		return bulkEpics.filter(epic =>
			epic.id.toLowerCase().includes(q) ||
			epic.title.toLowerCase().includes(q)
		);
	}

	const filteredBulkEpics = $derived(filterBulkEpics(bulkEpicSearchQuery));

	/**
	 * Link all selected tasks to an epic
	 * Calls POST /api/tasks/{id}/epic for each selected task
	 */
	async function handleBulkAddToEpic(epicId: string) {
		if (bulkLinkingEpicId || selectedTasks.size === 0) return;

		bulkLinkingEpicId = epicId;
		bulkActionLoading = true;
		bulkActionError = '';

		const taskIds = Array.from(selectedTasks);
		let successCount = 0;
		const errors: string[] = [];

		for (const taskId of taskIds) {
			try {
				const response = await fetch(`/api/tasks/${taskId}/epic`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ epicId })
				});

				if (!response.ok) {
					const data = await response.json();
					errors.push(`${taskId}: ${data.error || 'Failed to link'}`);
				} else {
					successCount++;
				}
			} catch (err) {
				errors.push(`${taskId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
			}
		}

		bulkLinkingEpicId = null;
		bulkActionLoading = false;

		if (successCount > 0) {
			successToast(`Linked ${successCount} task(s) to epic ${epicId}`);
			clearSelection();
			// Trigger parent refresh
			if (onTasksChanged) onTasksChanged();
		}

		if (errors.length > 0) {
			bulkActionError = errors.join('; ');
		}

		// Reset epic state
		bulkEpics = [];
		bulkEpicSearchQuery = '';
	}

	// ========== Task Image Handling ==========

	/**
	 * Load all task images from server on mount
	 * Enables cross-session reactivity - images persist across browser sessions
	 * Supports multiple images per task
	 */
	async function loadTaskFilesFromServer() {
		try {
			const response = await fetch('/api/tasks/images');
			if (!response.ok) {
				console.warn('Failed to load task files from server');
				return;
			}
			const { images } = await response.json();

			// Convert server files to local state format
			const newMap = new Map<string, TaskFile[]>();
			for (const [taskId, fileData] of Object.entries(images)) {
				// Handle both old format (single object) and new format (array)
				const dataArray = Array.isArray(fileData) ? fileData : [fileData];
				const taskFileArray: TaskFile[] = dataArray.map((data: { path: string; uploadedAt: string; id?: string }, index: number) => {
					// Get file type info directly from path - no mock File needed
					const filename = data.path.split('/').pop() || 'file';
					const typeInfo = getFileTypeInfoFromPath(data.path);

					return {
						blob: new Blob(), // Placeholder - actual file is on disk
						preview: typeInfo.previewable ? `/api/work/image${data.path}` : '',
						path: data.path,
						id: data.id || `file-${index}-${Date.now()}`,
						name: filename,
						category: typeInfo.category,
						icon: typeInfo.icon,
						iconColor: typeInfo.color
					};
				});
				if (taskFileArray.length > 0) {
					newMap.set(taskId, taskFileArray);
				}
			}
			taskFiles = newMap;
		} catch (err) {
			console.error('Error loading task files:', err);
		}
	}

	/**
	 * Save task image path to server for persistence
	 * Appends to existing images for this task
	 */
	async function saveTaskFileToServer(taskId: string, path: string, fileId: string) {
		try {
			await fetch(`/api/tasks/${taskId}/image`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path, id: fileId, action: 'add' })
			});
		} catch (err) {
			console.error('Failed to save task file to server:', err);
		}
	}

	/**
	 * Remove a specific task file from server
	 */
	async function removeTaskFileFromServer(taskId: string, fileId: string) {
		try {
			await fetch(`/api/tasks/${taskId}/image`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: fileId })
			});
		} catch (err) {
			console.error('Failed to remove task file from server:', err);
		}
	}

	// Load task files on mount
	onMount(() => {
		loadTaskFilesFromServer();
	});

	// Track last image refresh time to avoid excessive reloads
	let lastImageRefreshTime = 0;
	const IMAGE_REFRESH_INTERVAL = 10000; // 10 seconds minimum between refreshes

	// Periodically refresh task images for cross-session reactivity
	// This runs when tasks update (from parent polling) but throttles refreshes
	$effect(() => {
		// Dependency on tasks array (when parent fetches new tasks)
		const taskCount = tasks.length;
		if (taskCount > 0) {
			const now = Date.now();
			if (now - lastImageRefreshTime >= IMAGE_REFRESH_INTERVAL) {
				lastImageRefreshTime = now;
				loadTaskFilesFromServer();
			}
		}
	});

	/**
	 * Handle image drop on a task row
	 * Uploads the image and stores the path for use when spawning
	 */
	async function handleImageDrop(event: DragEvent, taskId: string) {
		event.preventDefault();
		event.stopPropagation();
		dragOverTask = null;

		if (!event.dataTransfer) return;

		// Get ALL files from the drop (images, PDFs, text, code, etc.)
		const files = Array.from(event.dataTransfer.files);

		if (files.length > 0) {
			// Upload all files sequentially
			for (const file of files) {
				await uploadTaskFile(taskId, file);
			}
			return;
		}

		// Check for data items (e.g., pasted from clipboard via drag)
		const items = Array.from(event.dataTransfer.items);
		for (const item of items) {
			const blob = item.getAsFile();
			if (blob) {
				await uploadTaskFile(taskId, blob);
			}
		}
	}

	/**
	 * Upload a file for a task and store the path
	 * Appends to existing files (supports multiple files per task)
	 * Also saves to server for cross-session persistence
	 */
	async function uploadTaskFile(taskId: string, blob: Blob) {
		uploadingFile = taskId;

		try {
			// Determine file name and type info
			let name: string;
			let typeInfo;
			if (blob instanceof File) {
				name = blob.name;
				typeInfo = getFileTypeInfo(blob);
			} else {
				const ext = blob.type.split('/')[1] || 'bin';
				name = `file-${Date.now()}.${ext}`;
				const mockFile = new File([blob], name, { type: blob.type });
				typeInfo = getFileTypeInfo(mockFile);
			}

			// Create preview URL only for images
			const preview = typeInfo.previewable ? URL.createObjectURL(blob) : '';

			// Upload to server
			const formData = new FormData();
			formData.append('file', blob, name);
			formData.append('sessionName', `task-${taskId}`);
			formData.append('filename', name);

			const response = await fetch('/api/work/upload-image', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				throw new Error('Failed to upload file');
			}

			const { filePath } = await response.json();

			// Generate unique ID for this file
			const fileId = `file-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

			// Create new file object
			const newFile: TaskFile = {
				blob,
				preview,
				path: filePath,
				id: fileId,
				name,
				category: typeInfo.category,
				icon: typeInfo.icon,
				iconColor: typeInfo.color
			};

			// Append to existing files for this task
			const newMap = new Map(taskFiles);
			const existingFiles = newMap.get(taskId) || [];
			newMap.set(taskId, [...existingFiles, newFile]);
			taskFiles = newMap;

			// Save to server for persistence across browser sessions
			await saveTaskFileToServer(taskId, filePath, fileId);

			// Update task notes with all file paths
			await updateTaskNotesWithFiles(taskId);

			console.log(`Attached file to task ${taskId}: ${filePath} (total: ${existingFiles.length + 1})`);
		} catch (err) {
			console.error('Failed to upload task file:', err);
		} finally {
			uploadingFile = null;
		}
	}

	/**
	 * Update task notes with all file paths so agents see them via bd show
	 */
	async function updateTaskNotesWithFiles(taskId: string) {
		try {
			const files = taskFiles.get(taskId) || [];
			if (files.length === 0) {
				// Clear notes if no files
				await fetch(`/api/tasks/${taskId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ notes: '' })
				});
				return;
			}

			const filePaths = files.map((f, i) => `  ${i + 1}. ${f.path} (${f.name})`).join('\n');
			const noteText = `📎 Attached files:\n${filePaths}\n(Use Read tool to view these files)`;
			await fetch(`/api/tasks/${taskId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ notes: noteText })
			});
		} catch (err) {
			console.error('Failed to update task notes with files:', err);
		}
	}

	/**
	 * Clear all files from a task
	 * Used after successful spawn when files have been sent to the agent
	 */
	async function clearAllTaskFiles(taskId: string) {
		const files = taskFiles.get(taskId) || [];

		// Revoke all object URLs
		for (const file of files) {
			if (file.preview && !file.preview.startsWith('/api')) {
				URL.revokeObjectURL(file.preview);
			}
		}

		// Remove all files from local state
		const newMap = new Map(taskFiles);
		newMap.delete(taskId);
		taskFiles = newMap;

		// Remove from server for persistence (all files)
		for (const file of files) {
			await removeTaskFileFromServer(taskId, file.id);
		}

		// Update task notes
		await updateTaskNotesWithFiles(taskId);
	}

	/**
	 * Remove a specific file from a task
	 * Also removes from server for cross-session persistence
	 */
	async function removeTaskFile(taskId: string, fileId: string, event: MouseEvent) {
		event.stopPropagation();

		const files = taskFiles.get(taskId) || [];
		const fileToRemove = files.find(f => f.id === fileId);

		// Revoke object URL if it's not a file path
		if (fileToRemove && fileToRemove.preview && !fileToRemove.preview.startsWith('/api')) {
			URL.revokeObjectURL(fileToRemove.preview);
		}

		// Filter out the removed file
		const newMap = new Map(taskFiles);
		const remainingFiles = files.filter(f => f.id !== fileId);
		if (remainingFiles.length > 0) {
			newMap.set(taskId, remainingFiles);
		} else {
			newMap.delete(taskId);
		}
		taskFiles = newMap;

		// Remove from server for persistence
		await removeTaskFileFromServer(taskId, fileId);

		// Update task notes
		await updateTaskNotesWithFiles(taskId);
	}

	/**
	 * Handle drag over a task row (for file drops)
	 */
	function handleFileDragOver(event: DragEvent, taskId: string) {
		event.preventDefault();
		event.stopPropagation();

		// Check if dragging files
		if (event.dataTransfer) {
			const hasFiles = Array.from(event.dataTransfer.types).includes('Files');
			if (hasFiles) {
				event.dataTransfer.dropEffect = 'copy';
				dragOverTask = taskId;
			}
		}
	}

	/**
	 * Handle drag leave from a task row
	 */
	function handleFileDragLeave(event: DragEvent) {
		event.preventDefault();
		dragOverTask = null;
	}
</script>

<div class="flex flex-col h-full">
	<!-- Filter Bar - Industrial Style -->
	<div
		class="p-4 overflow-visible relative bg-gradient-to-b from-base-100 to-base-200 border border-base-content/20 border-l-0"
	>
		<!-- Left accent bar -->
		<div
			class="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary to-primary/30"
		></div>

		<div class="flex flex-wrap items-center gap-3">
			<!-- Search - Industrial -->
			{#if !hideSearch}
			<div class="relative">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
				</svg>
				<input
					type="text"
					placeholder="Search {sortedTasks.length} of {tasks.length} tasks..."
					class="pl-9 pr-8 py-1.5 min-w-40 max-w-64 shrink rounded font-mono text-sm bg-base-200 border border-base-content/20 text-base-content/70"
					bind:value={searchQuery}
					oninput={() => updateURL()}
				/>
				{#if searchQuery}
					<button
						type="button"
						class="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full transition-colors text-base-content/50 hover:text-base-content/70"
						onclick={() => { searchQuery = ''; updateURL(); }}
						aria-label="Clear search"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="2"
							stroke="currentColor"
							class="w-4 h-4"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				{/if}
			</div>
			{/if}

			<!-- Project Filter -->
			{#if !hideProjectFilter && projectOptions.length > 0}
				<FilterDropdown
					label="Project"
					options={projectOptions}
					selected={selectedProjects}
					onToggle={toggleProject}
					emptyMeansAll={true}
					style="checkbox"
					menuWidth="w-44"
				/>
			{/if}

			<!-- Priority Filter -->
			<FilterDropdown
				label="Priority"
				options={priorityOptions}
				selected={selectedPriorities}
				onToggle={togglePriority}
				style="checkbox"
				menuWidth="w-40"
			/>

			<!-- Status Filter -->
			<FilterDropdown
				label="Status"
				options={statusOptions}
				selected={selectedStatuses}
				onToggle={toggleStatus}
				style="checkbox"
				menuWidth="w-44"
			/>

			<!-- Type Filter -->
			{#if typeOptions.length > 0}
				<FilterDropdown
					label="Type"
					options={typeOptions}
					selected={selectedTypes}
					onToggle={toggleType}
					emptyMeansAll={true}
					style="checkbox"
					menuWidth="w-40"
				/>
			{/if}

			<!-- Labels Filter -->
			{#if labelOptions.length > 0}
				<FilterDropdown
					label="Labels"
					options={labelOptions}
					selected={selectedLabels}
					onToggle={toggleLabel}
					emptyMeansAll={true}
					style="checkbox"
					menuWidth="w-48"
					maxHeight="max-h-60"
				/>
			{/if}

			<!-- Sort Dropdown - Industrial Style -->
			<div class="dropdown">
				<div
					tabindex="0"
					role="button"
					class="px-2.5 py-1 rounded cursor-pointer transition-all industrial-hover flex items-center gap-1.5 font-mono text-xs tracking-wider bg-base-200 border border-base-300 text-base-content/60"
				>
					<span class="uppercase">Sort</span>
					<span class="px-1.5 py-0.5 rounded text-xs font-mono bg-primary/20 text-primary">
						{sortColumn === 'id' ? 'ID' : sortColumn === 'title' ? 'Title' : sortColumn === 'priority' ? 'Pri' : 'Age'}
						{sortDirection === 'asc' ? '↑' : '↓'}
					</span>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="w-3.5 h-3.5 text-base-content/50"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
					</svg>
				</div>
				<ul
					tabindex="0"
					class="dropdown-content z-40 menu p-2 shadow rounded-box w-40 bg-base-200 border border-base-300"
				>
					<li>
						<button
							class="gap-2 {sortColumn === 'priority' ? 'active' : ''}"
							onclick={() => handleSort('priority')}
						>
							<span>Priority</span>
							{#if sortColumn === 'priority'}
								<span class="text-primary ml-auto">{sortDirection === 'asc' ? '↑' : '↓'}</span>
							{/if}
						</button>
					</li>
					<li>
						<button
							class="gap-2 {sortColumn === 'updated' ? 'active' : ''}"
							onclick={() => handleSort('updated')}
						>
							<span>Age</span>
							{#if sortColumn === 'updated'}
								<span class="text-primary ml-auto">{sortDirection === 'asc' ? '↑' : '↓'}</span>
							{/if}
						</button>
					</li>
					<li>
						<button
							class="gap-2 {sortColumn === 'title' ? 'active' : ''}"
							onclick={() => handleSort('title')}
						>
							<span>Title</span>
							{#if sortColumn === 'title'}
								<span class="text-primary ml-auto">{sortDirection === 'asc' ? '↑' : '↓'}</span>
							{/if}
						</button>
					</li>
					<li>
						<button
							class="gap-2 {sortColumn === 'id' ? 'active' : ''}"
							onclick={() => handleSort('id')}
						>
							<span>ID</span>
							{#if sortColumn === 'id'}
								<span class="text-primary ml-auto">{sortDirection === 'asc' ? '↑' : '↓'}</span>
							{/if}
						</button>
					</li>
				</ul>
			</div>

			<!-- Grouping Mode Toggle - Industrial btn-group -->
			<div class="join rounded border border-base-content/20">
				<!-- No grouping (flat list icon) -->
				<button
					class="join-item btn btn-xs px-2 border-none {groupingMode === 'none' ? 'bg-primary/60 text-primary-content' : 'bg-base-100 text-base-content/50'}"
					onclick={() => setGroupingMode('none')}
					title="No Grouping - Flat sorted list"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5" />
					</svg>
				</button>
				<!-- Project grouping (cube/package icon) - DEFAULT -->
				<button
					class="join-item btn btn-xs px-2 border-none {groupingMode === 'project' ? 'bg-primary/60 text-primary-content' : 'bg-base-100 text-base-content/50'}"
					onclick={() => setGroupingMode('project')}
					title="Group by Project → Epic"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
					</svg>
				</button>
				<!-- Parent grouping (folder icon) -->
				<button
					class="join-item btn btn-xs px-2 border-none {groupingMode === 'parent' ? 'bg-primary/60 text-primary-content' : 'bg-base-100 text-base-content/50'}"
					onclick={() => setGroupingMode('parent')}
					title="Group by Parent Epic"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
					</svg>
				</button>
				<!-- Type grouping (list icon) -->
				<button
					class="join-item btn btn-xs px-2 border-none {groupingMode === 'type' ? 'bg-primary/60 text-primary-content' : 'bg-base-100 text-base-content/50'}"
					onclick={() => setGroupingMode('type')}
					title="Group by Type"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
					</svg>
				</button>
				<!-- Label grouping (tag icon) -->
				<button
					class="join-item btn btn-xs px-2 border-none {groupingMode === 'label' ? 'bg-primary/60 text-primary-content' : 'bg-base-100 text-base-content/50'}"
					onclick={() => setGroupingMode('label')}
					title="Group by Label"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6z" />
					</svg>
				</button>
			</div>

			<!-- Collapse/Expand All Groups - Industrial btn-group -->
			{#if visibleGroupKeys.length > 0}
				<div class="join rounded border border-base-content/20">
					<!-- Collapse All -->
					<button
						class="join-item btn btn-xs px-2 border-none {allGroupsCollapsed ? 'bg-primary/60 text-primary-content' : 'bg-base-100 text-base-content/50'}"
						onclick={collapseAll}
						disabled={allGroupsCollapsed}
						title="Collapse All Groups (Alt+[)"
					>
						<!-- Collapse icon: bars stacked together -->
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
						</svg>
					</button>
					<!-- Expand All -->
					<button
						class="join-item btn btn-xs px-2 border-none {!anyGroupsCollapsed ? 'bg-primary/60 text-primary-content' : 'bg-base-100 text-base-content/50'}"
						onclick={expandAll}
						disabled={!anyGroupsCollapsed}
						title="Expand All Groups (Alt+])"
					>
						<!-- Expand icon: bars with vertical lines indicating expansion -->
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
						</svg>
					</button>
				</div>
			{/if}

			<!-- Human Tasks Only Toggle - Industrial -->
			<button
				class="px-2 py-1 rounded font-mono text-xs tracking-wider transition-all flex items-center gap-1 {humanTasksOnly ? 'bg-warning/25 text-warning border border-warning/50' : 'bg-base-100 text-base-content/50 border border-base-content/20'}"
				onclick={() => { humanTasksOnly = !humanTasksOnly; updateURL(); }}
				title="Show human-action tasks only"
			>
				<span style="font-size: 1rem;">🧑</span>
				<span class="hidden sm:inline">Human</span>
			</button>

			<!-- Clear Filters - Industrial -->
			{#if searchQuery || selectedProjects.size > 0 || selectedPriorities.size < 4 || selectedStatuses.size !== 2 || !selectedStatuses.has('open') || !selectedStatuses.has('in_progress') || selectedTypes.size > 0 || selectedLabels.size > 0 || humanTasksOnly || sortColumn !== 'priority' || sortDirection !== 'asc'}
				<button
					class="px-3 py-1 rounded font-mono text-xs tracking-wider uppercase transition-all industrial-hover text-error border border-error/30"
					onclick={clearAllFilters}
				>
					Clear
				</button>
			{/if}

			<!-- Right side: Selection controls or task count -->
			<div class="ml-auto flex items-center gap-2">
				{#if selectedTasks.size > 0}
					<!-- Selection mode - Industrial -->
					<span
						class="font-mono text-xs tracking-wider text-primary"
					>
						{selectedTasks.size} SELECTED
					</span>
					<div class="dropdown dropdown-end">
						<div
							tabindex="0"
							role="button"
							class="px-3 py-1.5 rounded font-mono text-xs tracking-wider uppercase cursor-pointer transition-all industrial-hover flex items-center gap-1 bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/40 text-primary"
						>
							Bulk Actions
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
							</svg>
						</div>
						<ul
							tabindex="0"
							class="dropdown-content z-40 menu p-2 shadow rounded-box w-52 bg-base-200 border border-base-content/20"
						>
							<li><button onclick={handleBulkAssign} class="gap-2">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
									<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
								</svg>
								Assign to...
							</button></li>
							<li><button onclick={handleBulkRelease} class="gap-2">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
									<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
								</svg>
								Release
							</button></li>
							<li><button onclick={handleBulkSpawn} class="gap-2" disabled={spawningBulk || spawningSingle !== null || $isBulkSpawning}>
								{#if spawningBulk || $isBulkSpawning}
									<span class="loading loading-spinner loading-xs"></span>
								{:else}
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
										<path stroke-linecap="round" stroke-linejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
									</svg>
								{/if}
								Spawn Agents
							</button></li>
							<li>
								<details>
									<summary class="gap-2">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0l-3.75-3.75M17.25 21l3.75-3.75" />
										</svg>
										Change Priority
									</summary>
									<ul class="bg-base-100 rounded-box">
										<li><button onclick={() => handleBulkChangePriority(0)}>P0 - Critical</button></li>
										<li><button onclick={() => handleBulkChangePriority(1)}>P1 - High</button></li>
										<li><button onclick={() => handleBulkChangePriority(2)}>P2 - Medium</button></li>
										<li><button onclick={() => handleBulkChangePriority(3)}>P3 - Low</button></li>
									</ul>
								</details>
							</li>
							<li>
								<details>
									<summary class="gap-2">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
										</svg>
										Change Status
									</summary>
									<ul class="bg-base-100 rounded-box">
										<li><button onclick={() => handleBulkChangeStatus('open')}>Open</button></li>
										<li><button onclick={() => handleBulkChangeStatus('in_progress')}>In Progress</button></li>
										<li><button onclick={() => handleBulkChangeStatus('blocked')}>Blocked</button></li>
										<li><button onclick={() => handleBulkChangeStatus('closed')}>Closed</button></li>
									</ul>
								</details>
							</li>
							<li><button onclick={handleBulkAddLabel} class="gap-2">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
									<path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
									<path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6z" />
								</svg>
								Add Label
							</button></li>
							<li>
								<details ontoggle={(e) => { if ((e.target as HTMLDetailsElement).open && bulkEpics.length === 0) fetchBulkEpics(); }}>
									<summary class="gap-2">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
											<!-- Mountain/Epic icon -->
											<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
										</svg>
										Add to Epic
									</summary>
									<ul class="bg-base-100 rounded-box max-h-60 overflow-y-auto w-64">
										{#if bulkEpicsLoading}
											<li class="px-3 py-2 text-center text-xs text-base-content/50">
												<span class="loading loading-spinner loading-xs"></span>
												<span class="ml-1">Loading epics...</span>
											</li>
										{:else if bulkEpicsError}
											<li class="px-3 py-2 text-center text-xs text-error">
												{bulkEpicsError}
												<button class="btn btn-xs btn-ghost ml-1" onclick={fetchBulkEpics}>Retry</button>
											</li>
										{:else if bulkEpics.length === 0}
											<li class="px-3 py-2 text-center text-xs text-base-content/50">
												No epics in this project
											</li>
										{:else}
											<!-- Search input when many epics -->
											{#if bulkEpics.length > 3}
												<li class="px-2 py-1.5 border-b border-base-content/10 sticky top-0 bg-base-100 z-10">
													<div class="relative flex items-center gap-1.5">
														<svg class="w-3 h-3 flex-shrink-0 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
															<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
														</svg>
														<input
															type="text"
															placeholder="Filter epics..."
															class="w-full bg-transparent text-xs focus:outline-none"
															bind:value={bulkEpicSearchQuery}
															onclick={(e) => e.stopPropagation()}
														/>
														{#if bulkEpicSearchQuery}
															<button
																class="text-base-content/40 hover:text-base-content/70"
																onclick={(e) => { e.stopPropagation(); bulkEpicSearchQuery = ''; }}
															>
																<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
																	<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
																</svg>
															</button>
														{/if}
													</div>
												</li>
											{/if}
											{#if filteredBulkEpics.length === 0}
												<li class="px-3 py-2 text-center text-xs text-base-content/50">
													No epics match "{bulkEpicSearchQuery}"
												</li>
											{:else}
												{#each filteredBulkEpics as epic (epic.id)}
													{@const isClosed = epic.status === 'closed'}
													<li>
														<button
															onclick={() => handleBulkAddToEpic(epic.id)}
															class="flex items-center gap-2 text-xs {isClosed ? 'opacity-60' : ''}"
															disabled={bulkLinkingEpicId !== null}
														>
															{#if bulkLinkingEpicId === epic.id}
																<span class="loading loading-spinner loading-xs flex-shrink-0"></span>
															{:else}
																<span class="text-xs flex-shrink-0">{isClosed ? '📦' : '🏔️'}</span>
															{/if}
															<div class="flex flex-col items-start min-w-0 flex-1">
																<div class="flex items-center gap-1">
																	<span class="font-mono text-xs text-secondary">{epic.id}</span>
																	{#if isClosed}
																		<span class="text-[8px] px-1 py-0.5 rounded bg-base-content/10 text-base-content/40 uppercase">closed</span>
																	{/if}
																</div>
																<span class="truncate w-full text-left">{epic.title}</span>
															</div>
															{#if epic.dependency_count !== undefined}
																<span class="text-[9px] px-1 py-0.5 rounded bg-base-content/10 text-base-content/40 flex-shrink-0">
																	{epic.dependency_count}
																</span>
															{/if}
														</button>
													</li>
												{/each}
											{/if}
										{/if}
									</ul>
								</details>
							</li>
							<div class="divider my-1"></div>
							<li><button onclick={handleBulkDelete} class="gap-2 text-error hover:bg-error/10">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
									<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
								</svg>
								Delete
							</button></li>
						</ul>
					</div>
					<button
						class="px-2 py-1 rounded font-mono text-xs tracking-wider uppercase transition-all industrial-hover text-base-content/60"
						onclick={clearSelection}
					>
						Clear
					</button>
				{/if}
			</div>
		</div>
	</div>

	<!-- Bulk Action Error -->
	{#if bulkActionError}
		<div class="alert alert-error mx-4 mt-2">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
			</svg>
			<span>{bulkActionError}</span>
			<button class="btn btn-sm btn-ghost" onclick={() => bulkActionError = ''}>Dismiss</button>
		</div>
	{/if}

	<!-- Bulk Action Loading Overlay -->
	{#if bulkActionLoading}
		<div class="mx-4 mt-2">
			<div class="alert">
				<span class="loading loading-spinner loading-sm"></span>
				<span>Processing {selectedTasks.size} task(s)...</span>
			</div>
		</div>
	{/if}

	<!-- Table - Industrial Style -->
	<!-- ondragover/ondrop prevent browser from navigating to dropped files -->
	<div
		class="flex-1 overflow-x-auto overflow-y-auto bg-base-200"
		ondragover={(e) => e.preventDefault()}
		ondrop={(e) => e.preventDefault()}
	>
		<table class="table table-xs table-pin-rows table-pin-cols w-full">
			<!-- Main column headers (always pinned at top) - Industrial -->
			<thead>
				<tr class="bg-gradient-to-b from-base-300 to-base-200">
					<th class="w-10 bg-inherit">
						<input
							type="checkbox"
							class="checkbox checkbox-sm border-base-content/40"
							checked={allSelected}
							indeterminate={partialSelected}
							onchange={toggleAll}
							onclick={(e) => e.stopPropagation()}
						/>
					</th>
					<th
						class="cursor-pointer w-auto min-w-32 industrial-hover bg-inherit"
						onclick={() => handleSort('id')}
					>
						<div class="flex items-center gap-1 font-mono text-xs tracking-wider uppercase text-base-content/60">
							ID
							{#if sortColumn === 'id'}
								<span class="text-primary">{sortDirection === 'asc' ? '▲' : '▼'}</span>
							{/if}
						</div>
					</th>
					<td class="w-10 bg-inherit">
						<span class="font-mono text-xs tracking-wider uppercase text-base-content/60"></span>
					</td>
					<td
						class="cursor-pointer industrial-hover bg-inherit"
						onclick={() => handleSort('title')}
					>
						<div class="flex items-center gap-1 font-mono text-xs tracking-wider uppercase text-base-content/60">
							Title
							{#if sortColumn === 'title'}
								<span class="text-primary">{sortDirection === 'asc' ? '▲' : '▼'}</span>
							{/if}
						</div>
					</td>
					<th class="w-28 bg-inherit">
						<span class="font-mono text-xs tracking-wider uppercase text-base-content/60" title="Drag & drop images to attach screenshots">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
							</svg>
						</span>
					</th>
					<td
						class="cursor-pointer w-16 text-center industrial-hover bg-inherit"
						onclick={() => handleSort('priority')}
					>
						<div class="flex items-center justify-center gap-1 font-mono text-xs tracking-wider uppercase text-base-content/60">
							P
							{#if sortColumn === 'priority'}
								<span class="text-primary">{sortDirection === 'asc' ? '▲' : '▼'}</span>
							{/if}
						</div>
					</td>
					<td class="w-32 bg-inherit">
						<span class="font-mono text-xs tracking-wider uppercase text-base-content/60">Labels</span>
					</td>
					<td class="w-16 text-center bg-inherit" title="Review status: Auto-proceed or Requires Review">
						<span class="font-mono text-xs tracking-wider uppercase text-base-content/60">
							<!-- Eye icon for Review column -->
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 mx-auto">
								<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
								<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
							</svg>
						</span>
					</td>
					<td
						class="cursor-pointer w-16 industrial-hover bg-inherit"
						onclick={() => handleSort('updated')}
					>
						<div class="flex items-center gap-1 font-mono text-xs tracking-wider uppercase text-base-content/60">
							Age
							{#if sortColumn === 'updated'}
								<span class="text-primary">{sortDirection === 'asc' ? '▲' : '▼'}</span>
							{/if}
						</div>
					</td>
				</tr>
			</thead>

			{#if sortedTasks.length === 0}
				<!-- Empty state - Mission Control Style -->
				<tbody>
					<tr>
						<td colspan="9" class="p-0">
							<div
								class="relative flex flex-col items-center justify-center py-16 overflow-hidden"
								style="
									background:
										radial-gradient(circle at 50% 50%, oklch(0.20 0.02 240 / 0.3) 0%, transparent 50%),
										linear-gradient(180deg, oklch(0.14 0.01 250) 0%, oklch(0.12 0.01 250) 100%);
								"
							>
								<!-- Subtle grid pattern -->
								<div
									class="absolute inset-0 opacity-[0.03]"
									style="
										background-image:
											linear-gradient(oklch(0.70 0.18 240) 1px, transparent 1px),
											linear-gradient(90deg, oklch(0.70 0.18 240) 1px, transparent 1px);
										background-size: 40px 40px;
									"
								></div>

								<!-- Radar container -->
								<div class="relative w-32 h-32 mb-6">
									<!-- Outer ring -->
									<div
										class="absolute inset-0 rounded-full"
										style="
											border: 1px solid oklch(0.70 0.18 240 / 0.2);
											box-shadow: 0 0 20px oklch(0.70 0.18 240 / 0.1);
										"
									></div>

									<!-- Middle ring -->
									<div
										class="absolute inset-4 rounded-full"
										style="border: 1px solid oklch(0.70 0.18 240 / 0.15);"
									></div>

									<!-- Inner ring -->
									<div
										class="absolute inset-8 rounded-full"
										style="border: 1px solid oklch(0.70 0.18 240 / 0.1);"
									></div>

									<!-- Cross hairs -->
									<div
										class="absolute top-1/2 left-0 right-0 h-px"
										style="background: oklch(0.70 0.18 240 / 0.1);"
									></div>
									<div
										class="absolute left-1/2 top-0 bottom-0 w-px"
										style="background: oklch(0.70 0.18 240 / 0.1);"
									></div>

									<!-- Radar sweep -->
									<div
										class="absolute inset-0 rounded-full radar-sweep"
										style="
											background: conic-gradient(
												from 0deg,
												transparent 0deg,
												oklch(0.70 0.18 240 / 0.3) 30deg,
												transparent 60deg
											);
										"
									></div>

									<!-- Center dot (pulsing) -->
									<div class="absolute inset-0 flex items-center justify-center">
										<div
											class="w-2 h-2 rounded-full radar-pulse"
											style="background: oklch(0.70 0.18 240); box-shadow: 0 0 10px oklch(0.70 0.18 240);"
										></div>
									</div>
								</div>

								<!-- Status text -->
								<div class="relative z-10 text-center">
									<p class="font-mono text-sm tracking-widest uppercase mb-1 text-primary">
										All Clear
									</p>
									<p class="font-mono text-xs tracking-wide text-base-content/50">
										No tasks matching current filters
									</p>
								</div>

								<!-- Action buttons -->
								{#if searchQuery || selectedProjects.size > 0 || selectedPriorities.size < 4 || selectedStatuses.size !== 2 || !selectedStatuses.has('open') || !selectedStatuses.has('in_progress') || selectedTypes.size > 0 || selectedLabels.size > 0}
									<button
										class="relative z-10 mt-6 px-4 py-2 rounded font-mono text-xs tracking-wider uppercase transition-all bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20"
										onclick={clearAllFilters}
									>
										Clear Filters
									</button>
								{/if}

								<!-- Decorative corner accents -->
								<div class="absolute top-4 left-4 w-8 h-8">
									<div class="absolute top-0 left-0 w-full h-px" style="background: linear-gradient(90deg, oklch(0.70 0.18 240 / 0.3), transparent);"></div>
									<div class="absolute top-0 left-0 h-full w-px" style="background: linear-gradient(180deg, oklch(0.70 0.18 240 / 0.3), transparent);"></div>
								</div>
								<div class="absolute top-4 right-4 w-8 h-8">
									<div class="absolute top-0 right-0 w-full h-px" style="background: linear-gradient(270deg, oklch(0.70 0.18 240 / 0.3), transparent);"></div>
									<div class="absolute top-0 right-0 h-full w-px" style="background: linear-gradient(180deg, oklch(0.70 0.18 240 / 0.3), transparent);"></div>
								</div>
								<div class="absolute bottom-4 left-4 w-8 h-8">
									<div class="absolute bottom-0 left-0 w-full h-px" style="background: linear-gradient(90deg, oklch(0.70 0.18 240 / 0.3), transparent);"></div>
									<div class="absolute bottom-0 left-0 h-full w-px" style="background: linear-gradient(0deg, oklch(0.70 0.18 240 / 0.3), transparent);"></div>
								</div>
								<div class="absolute bottom-4 right-4 w-8 h-8">
									<div class="absolute bottom-0 right-0 w-full h-px" style="background: linear-gradient(270deg, oklch(0.70 0.18 240 / 0.3), transparent);"></div>
									<div class="absolute bottom-0 right-0 h-full w-px" style="background: linear-gradient(0deg, oklch(0.70 0.18 240 / 0.3), transparent);"></div>
								</div>
							</div>
						</td>
					</tr>
				</tbody>
			{:else}
				<!-- Project mode: Two-level nested grouping (Project → Epic → Tasks) -->
				{#if groupingMode === 'project'}
					{#each Array.from(nestedGroupedTasks.entries()) as [projectKey, epicMap]}
						{@const projectTaskCount = getProjectTaskCount(projectKey)}
						{@const projectAssignedAgents = getProjectAssignedAgents(projectKey)}
						{@const isProjectCollapsed = collapsedProjects.has(projectKey)}

						<!-- Project Header (Top-level, sticky) -->
						<thead class="sticky z-10" style="top: 0;">
							<tr
								class="cursor-pointer select-none hover:brightness-110 transition-all"
								onclick={() => toggleProjectCollapse(projectKey)}
								title={isProjectCollapsed ? 'Click to expand project' : 'Click to collapse project'}
							>
								<th
									colspan="9"
									class="p-0 border-b-2 border-base-content/20"
									style="background: linear-gradient(90deg, oklch(0.70 0.15 140 / 0.15) 0%, oklch(0.20 0.01 250) 80%);"
								>
									<div class="flex items-center gap-0">
										<!-- Bold accent bar (green for project) -->
										<div
											class="w-1.5 self-stretch"
											style="background: oklch(0.70 0.15 140);"
										></div>

										<!-- Collapse/Expand chevron -->
										<div
											class="flex items-center justify-center w-7 h-10 text-base-content/40 transition-transform duration-200"
											style="transform: rotate({isProjectCollapsed ? '-90deg' : '0deg'});"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
												<path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
											</svg>
										</div>

										<!-- Project icon with glow -->
										<div
											class="flex items-center justify-center w-9 h-10 text-xl"
											style="text-shadow: 0 0 10px oklch(0.70 0.15 140);"
										>
											📦
										</div>

										<!-- Project name - prominent -->
										<span
											class="font-mono font-bold text-sm tracking-[0.15em] uppercase"
											style="color: oklch(0.70 0.15 140);"
										>
											{projectKey.toUpperCase()}
										</span>

										<!-- Task count badge -->
										<span
											class="ml-3 px-2 py-0.5 rounded font-mono text-xs"
											style="background: oklch(0.70 0.15 140 / 0.2); color: oklch(0.85 0.10 140);"
										>
											{projectTaskCount} {projectTaskCount === 1 ? 'task' : 'tasks'}
										</span>

										<!-- Working agents avatars -->
										{#if projectAssignedAgents.length > 0}
											<div class="flex items-center -space-x-1 ml-3">
												{#each projectAssignedAgents.slice(0, 5) as agentName (agentName)}
													<WorkingAgentBadge
														name={agentName || ''}
														size={22}
														isWorking={true}
														variant="avatar"
														onClick={onagentclick}
													/>
												{/each}
												{#if projectAssignedAgents.length > 5}
													<div class="avatar placeholder w-5">
														<div class="bg-neutral text-neutral-content w-5 rounded-full text-[9px] font-mono">
															+{projectAssignedAgents.length - 5}
														</div>
													</div>
												{/if}
											</div>
										{/if}

										<!-- Decorative line -->
										<div
											class="flex-1 h-px mx-4 opacity-30"
											style="background: linear-gradient(90deg, oklch(0.70 0.15 140), transparent);"
										></div>
									</div>
								</th>
							</tr>
						</thead>

						<!-- Project contents (epics and tasks) -->
						{#if !isProjectCollapsed}
							{#each Array.from(epicMap.entries()) as [epicKey, epicTasks]}
								{@const epicVisual = getGroupHeaderInfo('parent', epicKey)}
								{@const parentTask = taskLookupMap.get(epicKey)}
								{@const isEpicCollapsed = collapsedGroups.has(`${projectKey}::${epicKey}`)}
								{@const epicAssignedAgents = [...new Set(epicTasks.filter(t => t.assignee && t.status === 'in_progress').map(t => t.assignee))]}
								{@const hasChildTasks = epicTasks.some(t => extractParentId(t.id) === epicKey)}
								{@const showEpicHeader = epicTasks.length >= 2 || hasChildTasks}
								{@const isEpicJustCompleted = completedEpicIds.includes(epicKey)}
								{@const isRunningEpic = epicQueueIsActive && epicQueueId === epicKey}
								{@const epicQueueAgents = isRunningEpic ? epicQueueRunningAgents : []}
								{@const allEpicChildren = epicChildrenAllMap.get(epicKey) || []}
								{@const closedChildrenCount = allEpicChildren.filter(t => t.status === 'closed').length}
								{@const totalChildrenCount = allEpicChildren.length}
								{@const isEpicFullyComplete = closedChildrenCount === totalChildrenCount && totalChildrenCount > 0}
								{@const hasReadyChildren = epicTasks.some(t => t.status === 'open' && !t.depends_on?.some(d => d.status !== 'closed'))}
								{@const canRunEpic = !isRunningEpic && !isEpicFullyComplete && hasReadyChildren}

								<!-- Epic Header (nested under project) -->
								{#if showEpicHeader}
									<thead class="sticky z-10" style="top: 40px;">
										<tr
											class="cursor-pointer select-none hover:brightness-110 transition-all {isEpicJustCompleted ? 'epic-completed-celebration' : ''} {isRunningEpic ? 'epic-running' : ''}"
											onclick={() => toggleGroupCollapse(`${projectKey}::${epicKey}`)}
											title={isEpicCollapsed ? 'Click to expand epic' : isRunningEpic ? 'Epic is actively executing - click to collapse' : 'Click to collapse epic'}
										>
											<th
												colspan="9"
												class="p-0 border-b border-base-content/10"
												style="background: linear-gradient(90deg, {epicVisual.bgTint} 0%, oklch(0.18 0.01 250) 70%);"
											>
												<div class="flex items-center gap-0 pl-4">
													<!-- Nested indent indicator -->
													<div class="w-px h-7 mr-2" style="background: oklch(0.70 0.15 140 / 0.3);"></div>

													<!-- Accent bar (purple for epic) -->
													<div
														class="w-1 self-stretch"
														style="background: {epicVisual.accent};"
													></div>

													<!-- Collapse chevron -->
													<div
														class="flex items-center justify-center w-6 h-8 text-base-content/40 transition-transform duration-200"
														style="transform: rotate({isEpicCollapsed ? '-90deg' : '0deg'});"
													>
														<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
															<path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
														</svg>
													</div>

													<!-- Epic icon -->
													<div
														class="flex items-center justify-center w-7 h-8 text-base"
														style="text-shadow: 0 0 6px {epicVisual.accent};"
													>
														{epicVisual.icon}
													</div>

													<!-- Epic ID -->
													<span
														class="font-mono font-bold text-xs tracking-[0.15em] uppercase"
														style="color: {epicVisual.accent};"
													>
														{epicVisual.label}
													</span>

													<!-- Epic title -->
													{#if parentTask?.title}
														<span class="ml-2 text-sm text-base-content/70 truncate max-w-md" title={parentTask.title}>
															{parentTask.title}
														</span>
													{/if}

													<!-- Working agents -->
													{#if epicAssignedAgents.length > 0}
														<div class="flex items-center -space-x-1 ml-3">
															{#each epicAssignedAgents.slice(0, 4) as agentName (agentName)}
																<WorkingAgentBadge
																	name={agentName || ''}
																	size={18}
																	isWorking={true}
																	variant="avatar"
																	onClick={onagentclick}
																/>
															{/each}
														</div>
													{/if}

													<!-- Progress bar -->
													{#if totalChildrenCount > 1}
														{@const progressPercent = Math.round((closedChildrenCount / totalChildrenCount) * 100)}
														<div class="flex items-center gap-2 ml-3" title="{closedChildrenCount} of {totalChildrenCount} tasks completed">
															<!-- Checkmark for fully complete -->
															{#if isEpicFullyComplete}
																<span class="flex items-center justify-center w-5 h-5 rounded-full bg-success/25">
																	<svg class="w-3 h-3 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																		<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
																	</svg>
																</span>
															{/if}
															<!-- Progress bar -->
															<div class="w-20 h-1.5 bg-base-content/10 rounded-full overflow-hidden {isRunningEpic ? 'ring-1 ring-primary/30' : ''}">
																<div
																	class="h-full rounded-full transition-all duration-300 {isRunningEpic ? 'animate-pulse' : ''} {isEpicFullyComplete ? 'bg-success' : isRunningEpic ? 'bg-warning' : ''}"
																	style="width: {progressPercent}%; {!isEpicFullyComplete && !isRunningEpic ? `background: ${epicVisual.accent};` : ''}"
																></div>
															</div>
															<!-- X/Y complete text -->
															<span class="font-mono text-[10px] {isRunningEpic ? 'text-warning' : 'text-base-content/50'}">
																{closedChildrenCount}/{totalChildrenCount}
															</span>
															<!-- Running agent count (only when epic is active) -->
															{#if isRunningEpic && epicQueueAgents.length > 0}
																<span
																	class="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono animate-pulse bg-warning/20 text-warning"
																	title="Agents working on this epic: {epicQueueAgents.join(', ')}"
																>
																	<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																		<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
																	</svg>
																	{epicQueueAgents.length}
																</span>
															{/if}
														</div>
													{/if}

													<!-- Run Epic button -->
													{#if !isEpicFullyComplete}
														<button
															class="btn btn-xs btn-ghost gap-1 ml-2 {canRunEpic ? 'hover:btn-primary' : 'opacity-40 cursor-not-allowed'}"
															onclick={(e) => {
																e.stopPropagation();
																if (canRunEpic) {
																	openEpicSwarmModal(epicKey);
																}
															}}
															disabled={!canRunEpic}
															title={isRunningEpic ? 'Epic is already running' : !hasReadyChildren ? 'No ready tasks to run' : 'Launch Epic Swarm'}
														>
															<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
																<path stroke-linecap="round" stroke-linejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
															</svg>
															<span class="hidden sm:inline text-xs">Run</span>
														</button>
													{/if}

													<!-- Decorative line -->
													<div
														class="flex-1 h-px mx-3 opacity-20"
														style="background: linear-gradient(90deg, {epicVisual.accent}, transparent);"
													></div>
												</div>
											</th>
										</tr>
									</thead>
								{/if}

								<!-- Tasks within epic -->
								{#if !showEpicHeader || !isEpicCollapsed}
									<tbody transition:fade={{ duration: 150 }}>
										{#each epicTasks as task, taskIndex (task.id)}
											{@const depStatus = analyzeDependencies(task)}
											{@const taskIsActive = task.status === 'in_progress' && task.assignee}
											{@const isNewTask = newTaskIds.includes(task.id)}
											{@const isStarting = startingTaskIds.includes(task.id)}
											{@const isCompleted = completedTaskIds.includes(task.id)}
											{@const isWorkingCompleted = workingCompletedTaskIds.includes(task.id)}
											{@const isCompletedByActiveSession = completedTasksFromActiveSessions.has(task.id)}
											{@const isHuman = isHumanTask(task)}
											{@const isChildTask = extractParentId(task.id) === epicKey && task.id !== epicKey}
											{@const isLastChild = isChildTask && taskIndex === epicTasks.length - 1}
											{@const unresolvedBlockers = task.depends_on?.filter(d => d.status !== 'closed') || []}
											{@const blockedTasks = blockedByMap.get(task.id) || []}
											{@const hasDependencyIssues = unresolvedBlockers.length > 0 || blockedTasks.length > 0}
											{@const isSpawning = spawningSingle === task.id || ($spawningTaskIds.has(task.id))}
											{@const hasRowGradient = isCompletedByActiveSession || taskIsActive}
											{@const recommendation = recommendedTasks.get(task.id)}
											{@const criticalPathResult = epicKey ? criticalPaths.get(epicKey) : undefined}
											{@const isOnCriticalPath = criticalPathResult?.criticalPathIds.has(task.id) && task.status !== 'closed'}
											{@const criticalPathLength = criticalPathResult?.pathLengths.get(task.id) || 0}
											{@const reviewStatus = computeReviewStatus(task, reviewRules)}
											<tr
												class="industrial-row hover:bg-base-200/50 cursor-pointer transition-colors {isNewTask ? 'task-new' : ''} {isStarting ? 'task-starting' : ''} {isWorkingCompleted ? 'task-working-completed' : isCompleted ? 'task-completed' : ''} {isChildTask ? 'pl-6' : ''} {taskIsActive && isAgentGenerating(task.assignee) ? 'row-shimmer' : ''}"
												onclick={() => handleRowClick(task.id)}
												style="
												background: {isCompletedByActiveSession ? 'linear-gradient(90deg, oklch(0.55 0.18 145 / 0.15), transparent)' : taskIsActive ? 'linear-gradient(90deg, oklch(0.75 0.15 85 / 0.08), transparent)' : ''};
												border-bottom: 1px solid oklch(0.25 0.01 250);
												border-left: {isCompletedByActiveSession ? '3px solid oklch(0.65 0.20 145)' : taskIsActive ? '2px solid oklch(0.75 0.18 85)' : isOnCriticalPath ? '2px solid oklch(0.65 0.18 30)' : isChildTask ? '1px dashed oklch(0.40 0.02 250)' : '2px solid transparent'};
											"
											>
												<!-- Checkbox -->
												<td class="w-10 px-2" style="background: {hasRowGradient ? 'transparent' : 'inherit'};">
													<input
														type="checkbox"
														class="checkbox checkbox-xs checkbox-primary"
														checked={selectedTasks.has(task.id)}
														onclick={(e) => { e.stopPropagation(); toggleTask(task.id); }}
													/>
												</td>

												<!-- ID Badge -->
												<th style="background: {hasRowGradient ? 'transparent' : 'inherit'};">
													<div class="flex items-center gap-1">
														{#if isCompletedByActiveSession}
															<!-- Completed checkmark for tasks finished by active session -->
															<span
																class="flex items-center justify-center w-5 h-5 rounded-full bg-success/25"
																title="Completed - session still active"
															>
																<svg class="w-3 h-3 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																	<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
																</svg>
															</span>
														{:else if isChildTask}
															<span
																class="font-mono text-xs select-none text-base-content/40"
																style="min-width: 1rem;"
															>{isLastChild ? '└' : '├'}</span>
														{/if}
														<TaskIdBadge
															{task}
															size="xs"
															showType={false}
															showAssignee={false}
															copyOnly
															blockedBy={unresolvedBlockers}
															blocks={blockedTasks}
															showDependencies={true}
															onOpenTask={handleRowClick}
															onAgentClick={onagentclick}
														/>
														{#if getResumableSessions(task.id).length > 0}
															{@const resumableSessions = getResumableSessions(task.id)}
															<!-- Resumable session avatars (agents with history) -->
															<div class="flex items-center -space-x-1">
																{#each resumableSessions.slice(0, 3) as session}
																	<WorkingAgentBadge
																		name={session.agentName}
																		size={18}
																		isWorking={false}
																		variant="avatar"
																		onClick={() => handleResumeSession(session)}
																		class="opacity-60 hover:opacity-100 transition-opacity ring-1 ring-base-100"
																		title={`Resume ${session.agentName}'s session`}
																	/>
																{/each}
																{#if resumableSessions.length > 3}
																	<span class="text-xs text-base-content/50 pl-1">+{resumableSessions.length - 3}</span>
																{/if}
															</div>
														{/if}
													</div>
												</th>

												<!-- Actions -->
												<td style="background: {hasRowGradient ? 'transparent' : 'inherit'};" onclick={(e) => e.stopPropagation()}>
													<TaskActionButton
														{task}
														{agents}
														spawning={isSpawning}
														hasBlockers={depStatus.hasBlockers}
														blockingReason={depStatus.blockingReason ?? undefined}
														{isCompletedByActiveSession}
														onspawn={handleSpawnSingle}
														onattach={async (sessionName) => {
															try {
																const response = await fetch(`/api/sessions/${sessionName}/attach`, { method: 'POST' });
																if (!response.ok) {
																	const data = await response.json();
																	console.error('Attach failed:', data.message || data.error);
																}
															} catch (err) {
																console.error('Attach error:', err);
															}
														}}
													/>
												</td>

												<!-- Title -->
												<td style="background: {hasRowGradient ? 'transparent' : 'inherit'};">
													<div>
														<div
															class="font-medium text-sm {taskIsActive && isAgentGenerating(task.assignee) ? 'shimmer-text-fast' : 'text-base-content/90'}"
														>{task.title}</div>
														{#if task.description}
															<div class="text-xs line-clamp-5 text-base-content/55">
																{task.description}
															</div>
														{/if}
													</div>
												</td>

												<!-- Image drop zone cell - supports multiple images -->
												<td
													style="background: {hasRowGradient ? 'transparent' : 'inherit'};"
													onclick={(e) => e.stopPropagation()}
													ondrop={(e) => handleImageDrop(e, task.id)}
													ondragover={(e) => handleFileDragOver(e, task.id)}
													ondragleave={handleFileDragLeave}
													class="relative w-28"
												>
													<div class="flex items-center gap-1 overflow-x-auto">
														{#if uploadingFile === task.id}
															<!-- Uploading state -->
															<div class="w-6 h-6 flex items-center justify-center">
																<span class="loading loading-spinner loading-xs"></span>
															</div>
														{/if}
														{#each taskFiles.get(task.id) || [] as file (file.id)}
															<!-- File thumbnail/icon with remove button -->
															<div class="relative group flex-shrink-0">
																{#if file.category === 'image' && file.preview}
																	<img
																		src={file.preview}
																		alt="Task attachment"
																		class="w-6 h-6 object-cover rounded border border-base-content/20 cursor-pointer hover:border-primary transition-colors"
																		title={file.name || 'Attached file'}
																	/>
																{:else}
																	<div
																		class="w-6 h-6 flex items-center justify-center rounded border border-base-content/20 cursor-pointer hover:border-primary transition-colors"
																		title={file.name || 'Attached file'}
																	>
																		<svg class="w-4 h-4" style="color: {file.iconColor};" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
																			<path stroke-linecap="round" stroke-linejoin="round" d={file.icon} />
																		</svg>
																	</div>
																{/if}
																<!-- Remove button on hover -->
																<button
																	class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-error text-error-content flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[8px] leading-none"
																	onclick={(e) => removeTaskFile(task.id, file.id, e)}
																	title="Remove file"
																>
																	×
																</button>
															</div>
														{/each}
														<!-- Add more button / empty drop zone -->
														<div
															class="w-6 h-6 rounded border border-dashed flex items-center justify-center transition-all flex-shrink-0 {dragOverTask === task.id ? 'border-primary bg-primary/10' : 'border-base-content/30'}"
															title={(taskFiles.get(task.id) || []).length > 0 ? 'Drop to add another file' : 'Drop file here to attach'}
														>
															<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3 {dragOverTask === task.id ? 'text-primary' : 'text-base-content/40'}">
																<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
															</svg>
														</div>
													</div>
												</td>

												<!-- Priority -->
												<td class="text-center" style="background: {hasRowGradient ? 'transparent' : 'inherit'};">
													<div class="flex items-center justify-center gap-1">
														<span class="badge badge-sm {getPriorityBadge(task.priority)}">
															P{task.priority}
														</span>
														{#if blockedTasks.length > 0}
															<span
																class="inline-flex items-center gap-0.5 text-xs font-mono px-1 py-0.5 rounded text-info bg-info/15"
																title="Completing this task unblocks {blockedTasks.length} other {blockedTasks.length === 1 ? 'task' : 'tasks'}: {blockedTasks.slice(0, 3).map(t => t.id).join(', ')}{blockedTasks.length > 3 ? '...' : ''}"
															>
																<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
																	<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
																</svg>
																{blockedTasks.length}
															</span>
														{/if}
														{#if isOnCriticalPath}
															<span
																class="inline-flex items-center gap-0.5 text-xs font-mono px-1 py-0.5 rounded text-error bg-error/15"
																title="Critical path: {criticalPathLength} {criticalPathLength === 1 ? 'task' : 'tasks'} to epic completion. Completing this task shortens the critical path."
															>
																<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
																	<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
																</svg>
															</span>
														{/if}
														{#if recommendation}
															<RecommendedBadge reasons={recommendation.reasons} size="xs" iconOnly />
														{/if}
													</div>
												</td>

												<!-- Labels -->
												<td style="background: {hasRowGradient ? 'transparent' : 'inherit'};">
													{#if task.labels && task.labels.length > 0}
														<LabelBadges labels={task.labels} maxDisplay={2} />
													{:else}
														<span class="text-base-content/40">-</span>
													{/if}
												</td>

												<!-- Review Status -->
												<td class="text-center" style="background: {hasRowGradient ? 'transparent' : 'inherit'};">
													<div
														class="tooltip tooltip-left"
														data-tip="{reviewStatus.reason}{reviewStatus.hasOverride ? ' (Override)' : ''}"
													>
														<div class="flex items-center justify-center gap-1">
															{#if reviewStatus.action === 'review'}
																<!-- Eye icon for Review -->
																<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-warning">
																	<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
																	<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
																</svg>
															{:else}
																<!-- Checkmark icon for Auto -->
																<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-success">
																	<path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
																</svg>
															{/if}
															{#if reviewStatus.hasOverride}
																<span class="badge badge-xs bg-secondary/20 text-secondary" style="font-size: 9px; padding: 1px 4px;">O</span>
															{/if}
														</div>
													</div>
												</td>

												<!-- Age -->
												<td style="background: {hasRowGradient ? 'transparent' : 'inherit'};">
													<span class="text-xs font-mono {getAgeColorClass(task.updated_at)}" title={formatFullDate(task.updated_at)}>
														{formatRelativeTime(task.updated_at)}
													</span>
												</td>
											</tr>
										{/each}
									</tbody>
								{/if}
							{/each}
						{/if}
					{/each}
				{:else}
					<!-- Standard grouped tasks (type, parent, label modes) -->
					{@const groupEntries = Array.from(groupedTasks.entries())}
					{#each groupEntries as [groupKey, typeTasks], loopIndex}
						{#if typeTasks.length > 0}
							<!-- Group header (pinned when scrolling) - Industrial/Terminal style -->
							{@const typeVisual = getGroupHeaderInfo(groupingMode, groupKey)}
						{@const epicId = groupingMode === 'parent' ? groupKey : null}
						{@const parentTask = epicId ? taskLookupMap.get(epicId) : undefined}
						{@const isCollapsed = collapsedGroups.has(groupKey)}
						{@const assignedAgents = [...new Set(typeTasks.filter(t => t.assignee && t.status === 'in_progress').map(t => t.assignee))]}
						<!-- In parent/project mode, only show collapsible header for groups with 2+ child tasks -->
						<!-- Standalone tasks (single task where task.id === groupKey) get no header -->
						{@const hasChildTasks = typeTasks.some(t => {
							const parent = extractParentId(t.id);
							return parent === groupKey;
						})}
						{@const showGroupHeader = groupingMode !== 'none' && (groupingMode !== 'parent' || typeTasks.length >= 2 || hasChildTasks)}
						{@const groupIndex = visibleGroupKeys.indexOf(groupKey)}
						{@const isEpicJustCompleted = groupingMode === 'parent' && groupKey && completedEpicIds.includes(groupKey)}
						{@const isParentRunningEpic = groupingMode === 'parent' && epicQueueIsActive && epicQueueId === groupKey}
						{@const parentEpicQueueAgents = isParentRunningEpic ? epicQueueRunningAgents : []}
						{@const parentAllTasksList = allTasks.length > 0 ? allTasks : tasks}
						{@const parentAllChildren = epicChildrenAllMap.get(groupKey) || []}
						{@const parentClosedCount = parentAllChildren.filter(t => t.status === 'closed').length}
						{@const parentTotalCount = parentAllChildren.length}
						{@const parentIsFullyComplete = parentClosedCount === parentTotalCount && parentTotalCount > 0}
						{@const hasParentReadyChildren = typeTasks.some(t => t.status === 'open' && !t.depends_on?.some(d => d.status !== 'closed'))}
						{@const canRunParentEpic = groupingMode === 'parent' && !isParentRunningEpic && !parentIsFullyComplete && hasParentReadyChildren}
						{#if showGroupHeader}
						<thead>
							<tr
								class="cursor-pointer select-none hover:brightness-110 transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset {isEpicJustCompleted ? 'epic-completed-celebration' : ''} {isParentRunningEpic ? 'epic-running' : ''}"
								tabindex="0"
								role="button"
								aria-expanded={!isCollapsed}
								aria-label="{typeVisual.label} group, {typeTasks.length} {typeTasks.length === 1 ? 'task' : 'tasks'}, {isCollapsed ? 'collapsed' : 'expanded'}"
								data-group-index={groupIndex}
								onclick={() => toggleGroupCollapse(groupKey)}
								onkeydown={(e) => handleGroupKeyDown(e, groupKey, groupIndex)}
								onfocus={() => handleGroupFocus(groupIndex)}
								title={isCollapsed ? 'Click to expand (Enter/Space)' : isParentRunningEpic ? 'Epic is actively executing - click to collapse' : 'Click to collapse (Enter/Space). Arrow keys to navigate groups.'}
							>
								<th
									colspan="9"
									class="p-0 border-b border-base-content/10"
									style="background: linear-gradient(90deg, {typeVisual.bgTint} 0%, transparent 60%);"
								>
									<div class="flex items-center gap-0">
										<!-- Bold accent bar -->
										<div
											class="w-1 self-stretch"
											style="background: {typeVisual.accent};"
										></div>

										<!-- Collapse/Expand chevron -->
										<div
											class="flex items-center justify-center w-6 h-9 text-base-content/40 transition-transform duration-200"
											style="transform: rotate({isCollapsed ? '-90deg' : '0deg'});"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
												<path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
											</svg>
										</div>

										<!-- Icon container with subtle glow -->
										<div
											class="flex items-center justify-center w-8 h-9 text-lg"
											style="text-shadow: 0 0 8px {typeVisual.accent};"
										>
											{typeVisual.icon}
										</div>

										<!-- Type label - monospace, uppercase, tracked -->
										<span
											class="font-mono font-bold text-xs tracking-[0.2em] uppercase"
											style="color: {typeVisual.accent};"
										>
											{typeVisual.label}
										</span>

										<!-- Parent task title (shown in parent mode) -->
										{#if groupingMode === 'parent' && parentTask?.title}
											<span class="ml-2 text-sm text-base-content/70 truncate max-w-md" title={parentTask.title}>
												{parentTask.title}
											</span>
										{/if}

										<!-- Working agents avatars -->
										{#if assignedAgents.length > 0}
											<div class="flex items-center -space-x-1 ml-3">
												{#each assignedAgents.slice(0, 4) as agentName (agentName)}
													<WorkingAgentBadge
														name={agentName || ''}
														size={20}
														isWorking={true}
														variant="avatar"
														onClick={onagentclick}
													/>
												{/each}
												{#if assignedAgents.length > 4}
													<div class="avatar placeholder w-5">
														<div class="bg-neutral text-neutral-content w-5 rounded-full text-[9px] font-mono">
															+{assignedAgents.length - 4}
														</div>
													</div>
												{/if}
											</div>
										{/if}

										<!-- Epic progress bar (only in parent mode with >1 tasks) -->
										{#if groupingMode === 'parent' && parentTotalCount > 1}
											{@const progressPercent = Math.round((parentClosedCount / parentTotalCount) * 100)}
											<div class="flex items-center gap-2 ml-3" title="{parentClosedCount} of {parentTotalCount} tasks completed">
												<!-- Checkmark for fully complete -->
												{#if parentIsFullyComplete}
													<span class="flex items-center justify-center w-5 h-5 rounded-full bg-success/25">
														<svg class="w-3 h-3 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
														</svg>
													</span>
												{/if}
												<!-- Progress bar -->
												<div class="w-24 h-1.5 bg-base-content/10 rounded-full overflow-hidden {isParentRunningEpic ? 'ring-1 ring-primary/30' : ''}">
													<div
														class="h-full rounded-full transition-all duration-300 {isParentRunningEpic ? 'animate-pulse' : ''} {parentIsFullyComplete ? 'bg-success' : isParentRunningEpic ? 'bg-warning' : ''}"
														style="width: {progressPercent}%; {!parentIsFullyComplete && !isParentRunningEpic ? `background: ${typeVisual.accent};` : ''}"
													></div>
												</div>
												<!-- X/Y complete text -->
												<span class="font-mono text-[10px] {isParentRunningEpic ? 'text-warning' : 'text-base-content/50'}">
													{parentClosedCount}/{parentTotalCount}
												</span>
												<!-- Running agent count (only when epic is active) -->
												{#if isParentRunningEpic && parentEpicQueueAgents.length > 0}
													<span
														class="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono animate-pulse bg-warning/20 text-warning"
														title="Agents working on this epic: {parentEpicQueueAgents.join(', ')}"
													>
														<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
														</svg>
														{parentEpicQueueAgents.length}
													</span>
												{/if}
											</div>
										{/if}

										<!-- Run Epic button (only in parent mode) -->
										{#if groupingMode === 'parent' && !parentIsFullyComplete}
											<button
												class="btn btn-xs btn-ghost gap-1 ml-2 {canRunParentEpic ? 'hover:btn-primary' : 'opacity-40 cursor-not-allowed'}"
												onclick={(e) => {
													e.stopPropagation();
													if (canRunParentEpic && groupKey) {
														openEpicSwarmModal(groupKey);
													}
												}}
												disabled={!canRunParentEpic}
												title={isParentRunningEpic ? 'Epic is already running' : !hasParentReadyChildren ? 'No ready tasks to run' : 'Launch Epic Swarm'}
											>
												<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
												</svg>
												<span class="hidden sm:inline text-xs">Run</span>
											</button>
										{/if}

										<!-- Decorative line -->
										<div
											class="flex-1 h-px mx-3 opacity-30"
											style="background: linear-gradient(90deg, {typeVisual.accent}, transparent);"
										></div>

										<!-- Count badge -->
										<div class="pr-3 flex items-center gap-1.5">
											<span class="font-mono text-xs text-base-content/40">{typeTasks.length}</span>
											<span class="text-base-content/30 text-xs">
												{typeTasks.length === 1 ? 'task' : 'tasks'}
											</span>
										</div>
									</div>
								</th>
							</tr>
						</thead>
						{/if}
						<!-- Show tasks if: no header (standalone task), or header exists and not collapsed -->
						{#if !showGroupHeader || !isCollapsed}
						<tbody transition:fade={{ duration: 150 }}>
							{#each typeTasks as task, taskIndex (task.id)}
								{@const depStatus = analyzeDependencies(task)}
									{@const taskIsActive = task.status === 'in_progress' && task.assignee}
									{@const isNewTask = newTaskIds.includes(task.id)}
									{@const isStarting = startingTaskIds.includes(task.id)}
									{@const isCompleted = completedTaskIds.includes(task.id)}
									{@const isWorkingCompleted = workingCompletedTaskIds.includes(task.id)}
									{@const isCompletedByActiveSession = completedTasksFromActiveSessions.has(task.id)}
									{@const isHuman = isHumanTask(task)}
									{@const isChildTask = groupingMode === 'parent' && extractParentId(task.id) === groupKey && task.id !== groupKey}
									{@const isLastChild = isChildTask && taskIndex === typeTasks.length - 1}
									{@const unresolvedBlockers = task.depends_on?.filter(d => d.status !== 'closed') || []}
									{@const blockedTasks = blockedByMap.get(task.id) || []}
									{@const elapsed = task.status === 'in_progress' ? getElapsedTime(task.updated_at) : null}
									{@const fireScale = elapsed ? getFireScale(elapsed.minutes) : 1}
									{@const hasRowGradient = isCompletedByActiveSession || dragOverTask === task.id || selectedTasks.has(task.id) || isHuman || taskIsActive}
									{@const recommendation = recommendedTasks.get(task.id)}
									{@const parentEpicId = groupingMode === 'parent' ? groupKey : extractParentId(task.id)}
									{@const criticalPathResult = parentEpicId ? criticalPaths.get(parentEpicId) : undefined}
									{@const isOnCriticalPath = criticalPathResult?.criticalPathIds.has(task.id) && task.status !== 'closed'}
									{@const criticalPathLength = criticalPathResult?.pathLengths.get(task.id) || 0}
									{@const reviewStatusStd = computeReviewStatus(task, reviewRules)}
									<!-- Main task row -->
									<tr
										class="cursor-pointer group overflow-visible industrial-row {depStatus.hasBlockers ? 'opacity-70' : ''} {isNewTask ? 'task-new-entrance' : ''} {isStarting ? 'task-starting' : ''} {isWorkingCompleted ? 'task-working-completed' : isCompleted ? 'task-completed' : ''} {taskIsActive && isAgentGenerating(task.assignee) ? 'row-shimmer' : ''}"
										style="
											background: {isCompletedByActiveSession ? 'linear-gradient(90deg, oklch(0.55 0.18 145 / 0.15), transparent)' : dragOverTask === task.id ? 'oklch(0.70 0.18 240 / 0.15)' : selectedTasks.has(task.id) ? 'oklch(0.70 0.18 240 / 0.1)' : isHuman ? 'oklch(0.70 0.18 45 / 0.10)' : taskIsActive ? 'oklch(0.70 0.18 240 / 0.05)' : ''};
											border-bottom: 1px solid oklch(0.25 0.01 250);
											border-left: {isCompletedByActiveSession ? '3px solid oklch(0.65 0.20 145)' : dragOverTask === task.id ? '2px solid oklch(0.70 0.18 240)' : selectedTasks.has(task.id) ? '2px solid oklch(0.70 0.18 240)' : isHuman ? '2px solid oklch(0.70 0.18 45)' : unresolvedBlockers.length > 0 ? '2px solid oklch(0.55 0.18 30 / 0.4)' : taskIsActive ? '2px solid oklch(0.70 0.18 240 / 0.5)' : isOnCriticalPath ? '2px solid oklch(0.65 0.18 30)' : '2px solid transparent'};
										"
										onclick={() => handleRowClick(task.id)}
										ondrop={(e) => handleImageDrop(e, task.id)}
										ondragover={(e) => handleFileDragOver(e, task.id)}
										ondragleave={handleFileDragLeave}
										title={isCompletedByActiveSession ? 'Completed - session still active' : depStatus.hasBlockers ? `Blocked: ${depStatus.blockingReason}` : isOnCriticalPath ? 'Critical path task - bottleneck for epic completion' : ''}
									>
										<th
											style="background: {hasRowGradient ? 'transparent' : 'inherit'};"
											onclick={(e) => e.stopPropagation()}
										>
											<input
												type="checkbox"
												class="checkbox checkbox-sm border-base-content/40"
												checked={selectedTasks.has(task.id)}
												onchange={() => toggleTask(task.id)}
											/>
										</th>
										<th style="background: {hasRowGradient ? 'transparent' : 'inherit'};">
											<div class="flex items-center gap-1">
												{#if isCompletedByActiveSession}
													<!-- Completed checkmark for tasks finished by active session -->
													<span
														class="flex items-center justify-center w-5 h-5 rounded-full bg-success/25"
														title="Completed - session still active"
													>
														<svg class="w-3 h-3 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
														</svg>
													</span>
												{:else if isChildTask}
													<!-- Tree line indicator for child tasks -->
													<span
														class="font-mono text-xs select-none text-base-content/40"
														style="min-width: 1rem;"
													>{isLastChild ? '└' : '├'}</span>
												{/if}
												<TaskIdBadge
													{task}
													size="xs"
													showType={false}
													showAssignee={false}
													copyOnly
													blockedBy={unresolvedBlockers}
													blocks={blockedTasks}
													showDependencies={true}
													onOpenTask={handleRowClick}
													onAgentClick={onagentclick}
												/>
												{#if getResumableSessions(task.id).length > 0}
													{@const resumableSessionsStd = getResumableSessions(task.id)}
													<!-- Resumable session avatars (agents with history) -->
													<div class="flex items-center -space-x-1">
														{#each resumableSessionsStd.slice(0, 3) as session}
															<WorkingAgentBadge
																name={session.agentName}
																size={18}
																isWorking={false}
																variant="avatar"
																onClick={() => handleResumeSession(session)}
																class="opacity-60 hover:opacity-100 transition-opacity ring-1 ring-base-100"
																title={`Resume ${session.agentName}'s session`}
															/>
														{/each}
														{#if resumableSessionsStd.length > 3}
															<span class="text-xs text-base-content/50 pl-1">+{resumableSessionsStd.length - 3}</span>
														{/if}
													</div>
												{/if}
											</div>
										</th>
										<td style="background: {hasRowGradient ? 'transparent' : 'inherit'};" onclick={(e) => e.stopPropagation()}>
											<TaskActionButton
												{task}
												{agents}
												spawning={spawningSingle === task.id || $spawningTaskIds.has(task.id)}
												hasBlockers={depStatus.hasBlockers}
												blockingReason={depStatus.blockingReason}
												{isCompletedByActiveSession}
												onspawn={handleSpawnSingle}
												{fireScale}
												{elapsed}
												onattach={async (sessionName) => {
													try {
														const response = await fetch(`/api/sessions/${sessionName}/attach`, { method: 'POST' });
														if (!response.ok) {
															const data = await response.json();
															console.error('Attach failed:', data.message || data.error);
														}
													} catch (err) {
														console.error('Attach error:', err);
													}
												}}
											/>
										</td>
										<td style="background: {hasRowGradient ? 'transparent' : 'inherit'};">
											<div>
												<div
													class="font-medium text-sm {taskIsActive && isAgentGenerating(task.assignee) ? 'shimmer-text-fast' : 'text-base-content/90'}"
												>{task.title}</div>
												{#if task.description}
													<div class="text-xs line-clamp-5 text-base-content/55">
														{task.description}
													</div>
												{/if}
											</div>
										</td>
										<!-- Image drop zone cell - supports multiple images -->
										<td
											style="background: {hasRowGradient ? 'transparent' : 'inherit'};"
											onclick={(e) => e.stopPropagation()}
											ondrop={(e) => handleImageDrop(e, task.id)}
											ondragover={(e) => handleFileDragOver(e, task.id)}
											ondragleave={handleFileDragLeave}
											class="relative w-28"
										>
											<div class="flex items-center gap-1 overflow-x-auto">
												{#if uploadingFile === task.id}
													<!-- Uploading state -->
													<div class="w-6 h-6 flex items-center justify-center">
														<span class="loading loading-spinner loading-xs"></span>
													</div>
												{/if}
												{#each taskFiles.get(task.id) || [] as file (file.id)}
													<!-- File thumbnail/icon with remove button -->
													<div class="relative group flex-shrink-0">
														{#if file.category === 'image' && file.preview}
															<img
																src={file.preview}
																alt="Task attachment"
																class="w-6 h-6 object-cover rounded border border-base-content/20 cursor-pointer hover:border-primary transition-colors"
																title={file.name || 'Attached file'}
															/>
														{:else}
															<div
																class="w-6 h-6 flex items-center justify-center rounded border border-base-content/20 cursor-pointer hover:border-primary transition-colors"
																title={file.name || 'Attached file'}
															>
																<svg class="w-4 h-4" style="color: {file.iconColor};" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
																	<path stroke-linecap="round" stroke-linejoin="round" d={file.icon} />
																</svg>
															</div>
														{/if}
														<!-- Remove button on hover -->
														<button
															class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-error text-error-content flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[8px] leading-none"
															onclick={(e) => removeTaskFile(task.id, file.id, e)}
															title="Remove file"
														>
															×
														</button>
													</div>
												{/each}
												<!-- Add more button / empty drop zone -->
												<div
													class="w-6 h-6 rounded border border-dashed flex items-center justify-center transition-all flex-shrink-0 {dragOverTask === task.id ? 'border-primary bg-primary/10' : 'border-base-content/30'}"
													title={(taskFiles.get(task.id) || []).length > 0 ? 'Drop to add another file' : 'Drop file here to attach'}
												>
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3 {dragOverTask === task.id ? 'text-primary' : 'text-base-content/40'}">
														<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
													</svg>
												</div>
											</div>
										</td>
									<td class="text-center" style="background: {hasRowGradient ? 'transparent' : 'inherit'};">
										<div class="flex items-center justify-center gap-1">
											<span class="badge badge-sm {getPriorityBadge(task.priority)}">
												P{task.priority}
											</span>
											{#if blockedTasks.length > 0}
												<span
													class="inline-flex items-center gap-0.5 text-xs font-mono px-1 py-0.5 rounded text-info bg-info/15"
													title="Completing this task unblocks {blockedTasks.length} other {blockedTasks.length === 1 ? 'task' : 'tasks'}: {blockedTasks.slice(0, 3).map(t => t.id).join(', ')}{blockedTasks.length > 3 ? '...' : ''}"
												>
													<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
														<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
													</svg>
													{blockedTasks.length}
												</span>
											{/if}
											{#if isOnCriticalPath}
												<span
													class="inline-flex items-center gap-0.5 text-xs font-mono px-1 py-0.5 rounded text-error bg-error/15"
													title="Critical path: {criticalPathLength} {criticalPathLength === 1 ? 'task' : 'tasks'} to epic completion. Completing this task shortens the critical path."
												>
													<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
														<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
													</svg>
												</span>
											{/if}
											{#if recommendation}
												<RecommendedBadge reasons={recommendation.reasons} size="xs" iconOnly />
											{/if}
										</div>
									</td>
									<td style="background: {hasRowGradient ? 'transparent' : 'inherit'};">
										{#if task.labels && task.labels.length > 0}
											<LabelBadges labels={task.labels} maxDisplay={2} />
										{:else}
											<span class="text-base-content/40">-</span>
										{/if}
									</td>
									<!-- Review Status -->
									<td class="text-center" style="background: {hasRowGradient ? 'transparent' : 'inherit'};">
										<div
											class="tooltip tooltip-left"
											data-tip="{reviewStatusStd.reason}{reviewStatusStd.hasOverride ? ' (Override)' : ''}"
										>
											<div class="flex items-center justify-center gap-1">
												{#if reviewStatusStd.action === 'review'}
													<!-- Eye icon for Review -->
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-warning">
														<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
														<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
													</svg>
												{:else}
													<!-- Checkmark icon for Auto -->
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-success">
														<path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
													</svg>
												{/if}
												{#if reviewStatusStd.hasOverride}
													<span class="badge badge-xs bg-secondary/20 text-secondary" style="font-size: 9px; padding: 1px 4px;">O</span>
												{/if}
											</div>
										</div>
									</td>
									<td style="background: {hasRowGradient ? 'transparent' : 'inherit'};">
										<span class="text-xs font-mono {getAgeColorClass(task.updated_at)}" title={formatFullDate(task.updated_at)}>
											{formatRelativeTime(task.updated_at)}
										</span>
									</td>
								</tr>
							{/each}
						</tbody>
						{/if}
						<!-- Group separator: adds visual space between groups with headers -->
						{#if showGroupHeader && loopIndex < groupEntries.length - 1}
							<tbody>
								<tr>
									<td colspan="9" class="h-3" style="background: transparent; border: none;"></td>
								</tr>
							</tbody>
						{/if}
					{/if}
				{/each}
				{/if}

				<!-- Render exiting tasks with exit animation -->
				{#if exitingTasks.length > 0}
					<tbody>
						{#each exitingTasks as task (task.id)}
							{@const isTaskCompleted = task.status === 'closed'}
							{@const blockedTasks = blockedByMap.get(task.id) || []}
							<tr
								class="{isTaskCompleted ? 'task-completed-exit' : 'task-exit'}"
								style="
									background: {isTaskCompleted ? 'oklch(0.70 0.19 145 / 0.1)' : 'oklch(0.70 0.20 25 / 0.1)'};
									border-bottom: 1px solid oklch(0.25 0.01 250);
									border-left: 2px solid {isTaskCompleted ? 'oklch(0.70 0.19 145 / 0.5)' : 'oklch(0.70 0.20 25 / 0.5)'};
								"
							>
								<th style="background: transparent;"></th>
								<th style="background: transparent;">
									<TaskIdBadge {task} size="xs" showType={false} showAssignee={false} copyOnly />
								</th>
								<td style="background: transparent;">
									{#if isTaskCompleted}
										<!-- Rocket landing animation for completed tasks -->
										<div class="rocket-btn rocket-landing">
											<div class="relative w-5 h-5 flex items-center justify-center overflow-visible">
												<!-- Rocket body -->
												<svg class="rocket-icon w-4 h-4" viewBox="0 0 24 24" fill="none">
													<path d="M12 2C12 2 8 6 8 12C8 15 9 17 10 18L10 21C10 21.5 10.5 22 11 22H13C13.5 22 14 21.5 14 21L14 18C15 17 16 15 16 12C16 6 12 2 12 2Z" fill="currentColor" />
													<circle cx="12" cy="10" r="2" fill="oklch(0.75 0.15 200)" />
													<path d="M8 14L5 17L6 18L8 16Z" fill="currentColor" />
													<path d="M16 14L19 17L18 18L16 16Z" fill="currentColor" />
												</svg>
												<!-- Fire (fading out) -->
												<div class="rocket-fire absolute bottom-0 left-1/2 -translate-x-1/2 w-2 origin-top opacity-0">
													<svg viewBox="0 0 12 20" class="w-full">
														<path d="M6 0 L9 8 L7 6 L6 12 L5 6 L3 8 Z" fill="url(#fireGradientExit-{task.id})" />
														<defs>
															<linearGradient id="fireGradientExit-{task.id}" x1="0%" y1="0%" x2="0%" y2="100%">
																<stop offset="0%" style="stop-color:#f0932b" />
																<stop offset="50%" style="stop-color:#f39c12" />
																<stop offset="100%" style="stop-color:#e74c3c" />
															</linearGradient>
														</defs>
													</svg>
												</div>
												<!-- Landing sparkle -->
												<div class="landing-sparkle absolute w-4 h-4 rounded-full left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0" style="background: radial-gradient(circle, oklch(0.85 0.2 145) 0%, transparent 70%);"></div>
												<!-- Checkmark -->
												<svg class="landing-checkmark absolute w-4 h-4 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none">
													<path d="M5 13l4 4L19 7" stroke="oklch(0.72 0.19 145)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
												</svg>
											</div>
										</div>
									{/if}
								</td>
								<td style="background: transparent;">
									<div class="font-medium text-sm text-base-content/65">{task.title}</div>
								</td>
								<td class="w-28" style="background: transparent;"></td><!-- Image column -->
								<td class="text-center" style="background: transparent;">
									<div class="flex items-center justify-center gap-1">
										<span class="badge badge-sm {getPriorityBadge(task.priority)}">
											P{task.priority}
										</span>
										{#if blockedTasks.length > 0}
											<span
												class="inline-flex items-center gap-0.5 text-xs font-mono px-1 py-0.5 rounded text-info bg-info/15"
												title="Completing this task unblocks {blockedTasks.length} other {blockedTasks.length === 1 ? 'task' : 'tasks'}: {blockedTasks.slice(0, 3).map(t => t.id).join(', ')}{blockedTasks.length > 3 ? '...' : ''}"
											>
												<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
												</svg>
												{blockedTasks.length}
											</span>
										{/if}
									</div>
								</td>
								<td style="background: transparent;"></td><!-- Labels -->
								<td style="background: transparent;"></td><!-- Review -->
								<td style="background: transparent;"></td><!-- Age -->
							</tr>
						{/each}
					</tbody>
				{/if}
			{/if}
		</table>
	</div>
</div>

<!-- Epic Swarm Modal (uses store-based state from drawerStore) -->
<EpicSwarmModal />
