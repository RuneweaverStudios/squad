<script lang="ts">
	/**
	 * Projects Page - Flat Hierarchy Layout
	 *
	 * Each project has independent collapsible sections:
	 * [> PROJECT HEADER] - collapses entire project
	 *   [≡ SESSIONS] - independently collapsible/resizable section
	 *   [≡ TASKS] - independently collapsible/resizable section
	 *
	 * Each section can be:
	 * - Collapsed (just header visible)
	 * - Resized (drag bottom edge)
	 * - Expanded to viewport height (drag past max)
	 */

	import { onMount, onDestroy, tick } from 'svelte';
	import { slide, fly } from 'svelte/transition';
	import { quintOut, cubicOut } from 'svelte/easing';
	import { browser } from '$app/environment';
	import SessionCard from '$lib/components/work/SessionCard.svelte';
	import TaskTable from '$lib/components/agents/TaskTable.svelte';
	import WorkingAgentBadge from '$lib/components/WorkingAgentBadge.svelte';
	import TaskDetailDrawer from '$lib/components/TaskDetailDrawer.svelte';
	import ResizableDivider from '$lib/components/ResizableDivider.svelte';
	import SessionPanelSkeleton from '$lib/components/skeleton/SessionPanelSkeleton.svelte';
	import WelcomeScreen from '$lib/components/WelcomeScreen.svelte';
	import SortDropdown from '$lib/components/SortDropdown.svelte';
	import {
		workSessionsState,
		fetch as fetchSessions,
		fetchUsage as fetchSessionUsage,
		spawn,
		kill,
		sendInput,
		interrupt,
		sendEnter
	} from '$lib/stores/workSessions.svelte.js';
	import { broadcastSessionEvent, lastSessionEvent } from '$lib/stores/sessionEvents';
	import { lastTaskEvent } from '$lib/stores/taskEvents';
	import { getProjectFromTaskId, filterTasksByProject, buildEpicChildMap, getParentEpicId } from '$lib/utils/projectUtils';
	import { getProjectColor } from '$lib/utils/projectColors';
	import { openTaskDrawer, openProjectDrawer } from '$lib/stores/drawerStore';
	import { SORT_OPTIONS, getSortBy, getSortDir, handleSortClick, initSort, workSortState, type SortOption } from '$lib/stores/workSort.svelte';
	import { maximizeSessionPanel } from '$lib/stores/hoveredSession';
	import { getSessionMaximizeHeight } from '$lib/stores/preferences.svelte';

	// Types (aligned with api.types.Task for TaskTable compatibility)
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
		updated_ts?: string;
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

	// Section state type
	interface SectionState {
		collapsed: boolean;
		height: number; // pixels
	}

	// Storage keys
	const PROJECT_COLLAPSE_KEY = 'projects-collapse-';
	const SECTION_STATE_KEY = 'projects-section-';
	const PROJECT_ORDER_KEY = 'projects-order';
	const SESSION_ORDER_KEY = 'projects-session-order-';
	const EPIC_GROUP_COLLAPSE_KEY = 'projects-epic-collapse-';

	// Section defaults (will be loaded from config)
	let configSessionHeight = $state(400);
	let configTaskHeight = $state(400);
	const MIN_SECTION_HEIGHT = 100;

	// Derived default heights (using config values)
	const DEFAULT_SESSION_HEIGHT = $derived(configSessionHeight);
	const DEFAULT_TASK_HEIGHT = $derived(configTaskHeight);

	// State
	let tasks = $state<Task[]>([]);
	let allTasks = $state<Task[]>([]);
	let agents = $state<Agent[]>([]);
	let reservations = $state<Reservation[]>([]);
	let isInitialLoad = $state(true);
	let configProjects = $state<string[]>([]); // Projects from JAT config

	// Drawer state
	let drawerOpen = $state(false);
	let selectedTaskId = $state<string | null>(null);

	// Highlighted agent for scroll-to-agent feature
	let highlightedAgent = $state<string | null>(null);

	// Per-project collapse state (entire project)
	let projectCollapseState = $state<Map<string, boolean>>(new Map());

	// Per-section state: Map<"project-sessions" | "project-tasks", SectionState>
	let sectionStates = $state<Map<string, SectionState>>(new Map());

	// Track heights before full-height snap for restore
	let heightBeforeSnap = $state<Map<string, number>>(new Map());

	// Drag and drop state for project reordering
	let draggedProject = $state<string | null>(null);
	let dragOverProject = $state<string | null>(null);
	let customProjectOrder = $state<string[]>([]);

	// Per-project search state
	let projectSearchTerms = $state<Map<string, string>>(new Map());

	// Per-project session order (for manual sorting)
	let sessionOrderByProject = $state<Map<string, string[]>>(new Map());

	// Session drag state (separate from project drag)
	let draggedSession = $state<{ project: string; sessionName: string } | null>(null);
	let dragOverSession = $state<{ project: string; sessionName: string } | null>(null);

	// Epic group collapse state - tracks which epic groups are collapsed per project
	// Key format: "project:epicId" or "project:other" for non-epic sessions
	let collapsedEpicGroups = $state<Set<string>>(new Set());

	// Per-group sort state - tracks sort setting per epic/other group
	// Key format: "project:epicId" or "project:other"
	let groupSortSettings = $state<Map<string, { sortBy: SortOption; sortDir: 'asc' | 'desc' }>>(new Map());

	// Per-group filter state - tracks filter term per epic/other group
	// Key format: "project:epicId" or "project:other"
	let groupFilterTerms = $state<Map<string, string>>(new Map());

	// Get sort setting for a group (defaults to state/asc)
	function getGroupSort(project: string, groupId: string): { sortBy: SortOption; sortDir: 'asc' | 'desc' } {
		const key = `${project}:${groupId}`;
		return groupSortSettings.get(key) || { sortBy: 'state', sortDir: 'asc' };
	}

	// Set sort setting for a group
	function setGroupSort(project: string, groupId: string, sortBy: SortOption, sortDir: 'asc' | 'desc') {
		const key = `${project}:${groupId}`;
		const newMap = new Map(groupSortSettings);
		newMap.set(key, { sortBy, sortDir });
		groupSortSettings = newMap;
	}

	// Handle sort click for a group
	function handleGroupSortClick(project: string, groupId: string, value: SortOption) {
		const current = getGroupSort(project, groupId);
		if (current.sortBy === value) {
			// Same button - toggle direction
			setGroupSort(project, groupId, value, current.sortDir === 'asc' ? 'desc' : 'asc');
		} else {
			// Different button - switch sort and use its default direction
			const opt = SORT_OPTIONS.find(o => o.value === value);
			setGroupSort(project, groupId, value, opt?.defaultDir ?? 'asc');
		}
	}

	// Get filter term for a group
	function getGroupFilter(project: string, groupId: string): string {
		const key = `${project}:${groupId}`;
		return groupFilterTerms.get(key) || '';
	}

	// Set filter term for a group
	function setGroupFilter(project: string, groupId: string, term: string) {
		const key = `${project}:${groupId}`;
		const newMap = new Map(groupFilterTerms);
		newMap.set(key, term);
		groupFilterTerms = newMap;
	}

	// Sort sessions by the given sort option
	function sortSessions<T extends { sessionName: string; agentName: string; task?: { priority?: number } | null; created?: string; cost?: number; _sseState?: string }>(
		sessions: T[],
		sortBy: SortOption,
		sortDir: 'asc' | 'desc'
	): T[] {
		const sorted = [...sessions].sort((a, b) => {
			let cmp = 0;
			switch (sortBy) {
				case 'state': {
					// Sort by SSE state: working > needs-input > review > idle > starting
					const stateOrder: Record<string, number> = {
						'working': 0, 'needs_input': 1, 'review': 2, 'idle': 3, 'starting': 4, 'completed': 5
					};
					const aState = a._sseState || 'idle';
					const bState = b._sseState || 'idle';
					cmp = (stateOrder[aState] ?? 10) - (stateOrder[bState] ?? 10);
					break;
				}
				case 'priority': {
					const aPri = a.task?.priority ?? 99;
					const bPri = b.task?.priority ?? 99;
					cmp = aPri - bPri;
					break;
				}
				case 'created': {
					const aTime = a.created ? new Date(a.created).getTime() : 0;
					const bTime = b.created ? new Date(b.created).getTime() : 0;
					cmp = aTime - bTime;
					break;
				}
				case 'cost': {
					const aCost = a.cost ?? 0;
					const bCost = b.cost ?? 0;
					cmp = aCost - bCost;
					break;
				}
				case 'manual':
				default:
					// Keep original order for manual
					cmp = 0;
					break;
			}
			return sortDir === 'desc' ? -cmp : cmp;
		});
		return sorted;
	}

	// Filter sessions by search term
	function filterSessionsByTerm<T extends { sessionName: string; agentName: string; task?: { title?: string; id?: string } | null }>(
		sessions: T[],
		term: string
	): T[] {
		if (!term.trim()) return sessions;
		const lowerTerm = term.toLowerCase();
		return sessions.filter(s =>
			s.sessionName.toLowerCase().includes(lowerTerm) ||
			s.agentName.toLowerCase().includes(lowerTerm) ||
			s.task?.title?.toLowerCase().includes(lowerTerm) ||
			s.task?.id?.toLowerCase().includes(lowerTerm)
		);
	}

	// Keyboard navigation state
	let focusedProjectIndex = $state<number>(-1);

	// Project removal confirmation state
	let projectToHide = $state<string | null>(null);
	let isHiding = $state(false);

	// Reactive sort state - use workSortState object for cross-module reactivity
	// The getter properties on workSortState access $state variables, making them reactive
	const currentSortBy = $derived(workSortState.sortBy);
	const currentSortDir = $derived(workSortState.sortDir);

	// Derive all projects (from JAT config, sessions, AND tasks)
	// Config projects are shown even if empty (for onboarding new projects)
	const allProjects = $derived.by(() => {
		const projects = new Set<string>();
		// Add all config projects (these show even without tasks/sessions)
		for (const project of configProjects) {
			projects.add(project);
		}
		// Add projects from active sessions
		for (const session of workSessionsState.sessions) {
			if (session.task?.id) {
				const project = getProjectFromTaskId(session.task.id);
				if (project) projects.add(project);
			} else if (session.lastCompletedTask?.id) {
				const project = getProjectFromTaskId(session.lastCompletedTask.id);
				if (project) projects.add(project);
			} else {
				const match = session.sessionName.match(/^([a-zA-Z0-9_-]+?)-/);
				if (match && match[1]) projects.add(match[1]);
			}
		}
		// Add projects from tasks
		for (const task of tasks) {
			const project = getProjectFromTaskId(task.id);
			if (project) projects.add(project);
		}
		return Array.from(projects).sort();
	});

	// Sorted projects list
	const sortedProjects = $derived.by(() => {
		if (customProjectOrder.length === 0) return allProjects;
		const ordered: string[] = [];
		for (const p of customProjectOrder) {
			if (allProjects.includes(p)) ordered.push(p);
		}
		for (const p of allProjects) {
			if (!ordered.includes(p)) ordered.push(p);
		}
		return ordered;
	});

	// Focused project (for keyboard navigation)
	const focusedProject = $derived(focusedProjectIndex >= 0 ? sortedProjects[focusedProjectIndex] : null);

	// Group sessions by project
	// Project is determined from (in priority order):
	// 1. task ID prefix (e.g., jat-12p -> jat)
	// 2. lastCompletedTask ID prefix
	// 3. session.project field (set by spawn API for planning sessions)
	// Do NOT fall back to tmux session name - all sessions are named jat-{AgentName}
	// regardless of which project they're working on
	const sessionsByProject = $derived.by(() => {
		const groups = new Map<string, typeof workSessionsState.sessions>();
		for (const session of workSessionsState.sessions) {
			let project: string | null = null;
			if (session.task?.id) {
				project = getProjectFromTaskId(session.task.id);
			} else if (session.lastCompletedTask?.id) {
				project = getProjectFromTaskId(session.lastCompletedTask.id);
			} else if (session.project) {
				// Fallback to session.project for planning sessions spawned via ServersBadge
				project = session.project;
			}
			// Note: We intentionally don't fall back to sessionName because
			// tmux sessions are named jat-{AgentName} not {project}-{AgentName}
			if (project) {
				const existing = groups.get(project) || [];
				existing.push(session);
				groups.set(project, existing);
			}
		}
		return groups;
	});

	// Build epic->child mapping for session grouping (same as TaskTable)
	const epicChildMap = $derived.by(() => {
		const taskList = allTasks.length > 0 ? allTasks : tasks;
		return buildEpicChildMap(taskList);
	});

	// O(1) task lookup map - avoids creating arrays for every lookup
	const taskLookup = $derived.by(() => {
		const map = new Map<string, Task>();
		const taskList = allTasks.length > 0 ? allTasks : tasks;
		for (const task of taskList) {
			map.set(task.id, task);
		}
		return map;
	});

	// Memoized session grouping by project - computed once per project, reused
	const sessionsByEpicCache = $derived.by(() => {
		// Explicitly read epicChildMap to ensure Svelte tracks it as a dependency
		const epicMap = epicChildMap;
		const lookupMap = taskLookup;

		const cache = new Map<string, { epicSessions: Map<string, typeof workSessionsState.sessions>, nonEpicSessions: typeof workSessionsState.sessions }>();

		for (const [project, sessions] of sessionsByProject.entries()) {
			const epicSessions = new Map<string, typeof workSessionsState.sessions>();
			const nonEpicSessions: typeof workSessionsState.sessions = [];

			for (const session of sessions) {
				// Check both current task and lastCompletedTask for idle sessions
				const taskId = session.task?.id || session.lastCompletedTask?.id;
				if (!taskId) {
					nonEpicSessions.push(session);
					continue;
				}

				// O(1) lookup instead of O(n) array search
				const task = lookupMap.get(taskId);
				if (task?.issue_type === 'epic') {
					const existing = epicSessions.get(taskId) || [];
					existing.push(session);
					epicSessions.set(taskId, existing);
					continue;
				}

				const parentEpic = getParentEpicId(taskId, epicMap);
				if (parentEpic) {
					const existing = epicSessions.get(parentEpic) || [];
					existing.push(session);
					epicSessions.set(parentEpic, existing);
				} else {
					nonEpicSessions.push(session);
				}
			}

			cache.set(project, { epicSessions, nonEpicSessions });
		}

		return cache;
	});

	// Get cached session grouping for a project (O(1) lookup)
	function getSessionsByEpic(sessions: typeof workSessionsState.sessions, project?: string) {
		// If project is provided, use the memoized cache
		if (project) {
			const cached = sessionsByEpicCache.get(project);
			if (cached) return cached;
		}

		// Fallback for direct session array (shouldn't be needed in normal flow)
		const epicSessions = new Map<string, typeof workSessionsState.sessions>();
		const nonEpicSessions: typeof workSessionsState.sessions = [];

		for (const session of sessions) {
			// Check both current task and lastCompletedTask for idle sessions
			const taskId = session.task?.id || session.lastCompletedTask?.id;
			if (!taskId) {
				nonEpicSessions.push(session);
				continue;
			}

			const task = taskLookup.get(taskId);
			if (task?.issue_type === 'epic') {
				const existing = epicSessions.get(taskId) || [];
				existing.push(session);
				epicSessions.set(taskId, existing);
				continue;
			}

			const parentEpic = getParentEpicId(taskId, epicChildMap);
			if (parentEpic) {
				const existing = epicSessions.get(parentEpic) || [];
				existing.push(session);
				epicSessions.set(parentEpic, existing);
			} else {
				nonEpicSessions.push(session);
			}
		}

		return { epicSessions, nonEpicSessions };
	}

	// Pre-computed sorted sessions by project - this is the key fix for sorting reactivity
	// By computing this at the component level as a $derived, it properly tracks currentSortBy/currentSortDir
	const sortedSessionsByProject = $derived.by(() => {
		const result = new Map<string, typeof workSessionsState.sessions>();

		for (const [project, sessions] of sessionsByProject.entries()) {
			const searchTerm = projectSearchTerms.get(project) || '';
			const sessionOrder = sessionOrderByProject.get(project) || [];
			const filtered = filterSessions(sessions, searchTerm);
			const sorted = sortSessionsWithOrder(filtered, project, sessionOrder, currentSortBy, currentSortDir);
			result.set(project, sorted);
		}

		return result;
	});

	// Get epic task info for display (O(1) lookup)
	function getEpicTask(epicId: string): Task | undefined {
		return taskLookup.get(epicId);
	}

	// Helper to get section key
	function getSectionKey(project: string, section: 'sessions' | 'tasks'): string {
		return `${project}-${section}`;
	}

	// Load/save section state from localStorage
	function loadSectionState(project: string, section: 'sessions' | 'tasks'): SectionState {
		const defaultHeight = section === 'sessions' ? DEFAULT_SESSION_HEIGHT : DEFAULT_TASK_HEIGHT;
		if (!browser) return { collapsed: false, height: defaultHeight };

		const key = SECTION_STATE_KEY + getSectionKey(project, section);
		const saved = localStorage.getItem(key);
		if (saved) {
			try {
				const parsed = JSON.parse(saved);
				return {
					collapsed: parsed.collapsed ?? false,
					height: parsed.height ?? defaultHeight
				};
			} catch {
				return { collapsed: false, height: defaultHeight };
			}
		}
		return { collapsed: false, height: defaultHeight };
	}

	function saveSectionState(project: string, section: 'sessions' | 'tasks', state: SectionState) {
		if (!browser) return;
		const key = SECTION_STATE_KEY + getSectionKey(project, section);
		localStorage.setItem(key, JSON.stringify(state));
	}

	// Load/save project collapse state
	function loadProjectCollapse(project: string): boolean {
		if (!browser) return false;
		return localStorage.getItem(PROJECT_COLLAPSE_KEY + project) === 'true';
	}

	function saveProjectCollapse(project: string, collapsed: boolean) {
		if (!browser) return;
		localStorage.setItem(PROJECT_COLLAPSE_KEY + project, collapsed.toString());
	}

	// Load/save project order
	function loadProjectOrder(): string[] {
		if (!browser) return [];
		const saved = localStorage.getItem(PROJECT_ORDER_KEY);
		if (saved) {
			try { return JSON.parse(saved); } catch { return []; }
		}
		return [];
	}

	function saveProjectOrder(order: string[]) {
		if (!browser) return;
		localStorage.setItem(PROJECT_ORDER_KEY, JSON.stringify(order));
	}

	// Load/save session order per project (for manual sort)
	function loadSessionOrder(project: string): string[] {
		if (!browser) return [];
		const saved = localStorage.getItem(SESSION_ORDER_KEY + project);
		if (saved) {
			try { return JSON.parse(saved); } catch { return []; }
		}
		return [];
	}

	function saveSessionOrder(project: string, order: string[]) {
		if (!browser) return;
		localStorage.setItem(SESSION_ORDER_KEY + project, JSON.stringify(order));
	}

	function getSessionOrder(project: string): string[] {
		return sessionOrderByProject.get(project) || loadSessionOrder(project);
	}

	function setSessionOrder(project: string, order: string[]) {
		const newMap = new Map(sessionOrderByProject);
		newMap.set(project, order);
		sessionOrderByProject = newMap;
		saveSessionOrder(project, order);
	}

	// Get section state (pure read - returns default if not initialized)
	function getSectionState(project: string, section: 'sessions' | 'tasks'): SectionState {
		const key = getSectionKey(project, section);
		const defaultHeight = section === 'sessions' ? DEFAULT_SESSION_HEIGHT : DEFAULT_TASK_HEIGHT;
		return sectionStates.get(key) ?? { collapsed: false, height: defaultHeight };
	}

	// Initialize section states for all projects (call this when projects change)
	function initializeSectionStates(projects: string[]) {
		let needsUpdate = false;
		const newStates = new Map(sectionStates);

		for (const project of projects) {
			for (const section of ['sessions', 'tasks'] as const) {
				const key = getSectionKey(project, section);
				if (!newStates.has(key)) {
					const loaded = loadSectionState(project, section);
					newStates.set(key, loaded);
					needsUpdate = true;
				}
			}
		}

		if (needsUpdate) {
			sectionStates = newStates;
		}
	}

	// Update section state
	function updateSectionState(project: string, section: 'sessions' | 'tasks', updates: Partial<SectionState>) {
		const key = getSectionKey(project, section);
		const current = getSectionState(project, section);
		const newState = { ...current, ...updates };

		const newStates = new Map(sectionStates);
		newStates.set(key, newState);
		sectionStates = newStates;

		saveSectionState(project, section, newState);
	}

	// Toggle section collapse
	function toggleSectionCollapse(project: string, section: 'sessions' | 'tasks') {
		const current = getSectionState(project, section);
		updateSectionState(project, section, {
			collapsed: !current.collapsed
		});
	}

	// Toggle project collapse
	function toggleProjectCollapse(project: string) {
		const current = projectCollapseState.get(project) ?? false;
		const newState = new Map(projectCollapseState);
		newState.set(project, !current);
		projectCollapseState = newState;
		saveProjectCollapse(project, !current);
	}

	// Epic group collapse helpers
	function getEpicGroupKey(project: string, groupId: string): string {
		return `${project}:${groupId}`;
	}

	function loadCollapsedEpicGroups(): Set<string> {
		if (!browser) return new Set();
		const saved = localStorage.getItem(EPIC_GROUP_COLLAPSE_KEY);
		if (saved) {
			try {
				return new Set(JSON.parse(saved));
			} catch {
				return new Set();
			}
		}
		return new Set();
	}

	function saveCollapsedEpicGroups(groups: Set<string>) {
		if (!browser) return;
		localStorage.setItem(EPIC_GROUP_COLLAPSE_KEY, JSON.stringify(Array.from(groups)));
	}

	function isEpicGroupCollapsed(project: string, groupId: string): boolean {
		return collapsedEpicGroups.has(getEpicGroupKey(project, groupId));
	}

	// Check if all epic groups in a project are collapsed
	// Returns true if ALL groups are collapsed, false if ANY is expanded
	function areAllEpicGroupsCollapsed(project: string, sessions: any[]): boolean {
		const { epicSessions, nonEpicSessions } = getSessionsByEpic(sessions, project);

		// Check each epic group
		for (const epicId of epicSessions.keys()) {
			if (!isEpicGroupCollapsed(project, epicId)) {
				return false; // Found an expanded group
			}
		}

		// Check "other" group if it exists and there are also epics (so header shows)
		if (nonEpicSessions.length > 0 && epicSessions.size > 0) {
			if (!isEpicGroupCollapsed(project, 'other')) {
				return false; // Other group is expanded
			}
		}

		// If we only have non-epic sessions (no epics), they're always shown (no collapse header)
		if (nonEpicSessions.length > 0 && epicSessions.size === 0) {
			return false; // No accordion, always expanded
		}

		return true; // All groups are collapsed
	}

	// Calculate the effective height for sessions section
	// When all groups are collapsed, shrink to just fit headers
	function getEffectiveSessionsHeight(project: string, sessions: any[], userHeight: number): number {
		const { epicSessions, nonEpicSessions } = getSessionsByEpic(sessions, project);
		const allCollapsed = areAllEpicGroupsCollapsed(project, sessions);

		if (!allCollapsed) {
			return userHeight; // Use user-set height when any group is expanded
		}

		// Calculate minimum height for collapsed headers
		const HEADER_HEIGHT = 36; // Each collapsed header is ~36px
		const CONTAINER_PADDING = 16; // Padding in the container

		let numHeaders = epicSessions.size; // One header per epic
		if (nonEpicSessions.length > 0 && epicSessions.size > 0) {
			numHeaders += 1; // Add "Other Sessions" header
		}

		// Minimum height to show all collapsed headers
		const minHeight = (numHeaders * HEADER_HEIGHT) + CONTAINER_PADDING;
		return Math.max(minHeight, 60); // At least 60px
	}

	// Toggle epic group collapse with accordion behavior
	// When expanding an epic group, collapse all other epic groups in the same project
	function toggleEpicGroupCollapse(project: string, groupId: string) {
		const key = getEpicGroupKey(project, groupId);
		const isCurrentlyCollapsed = collapsedEpicGroups.has(key);
		const willExpand = isCurrentlyCollapsed;

		const newSet = new Set(collapsedEpicGroups);

		// Accordion behavior: if expanding, collapse all OTHER epic groups in this project
		if (willExpand) {
			// Get all epic groups for this project from sessions (uses cache)
			const sessions = sessionsByProject.get(project) || [];
			const { epicSessions, nonEpicSessions } = getSessionsByEpic(sessions, project);

			// Collapse all other epic groups in this project
			for (const epicId of epicSessions.keys()) {
				if (epicId !== groupId) {
					newSet.add(getEpicGroupKey(project, epicId));
				}
			}
			// Also collapse "other" group if it's not the one being expanded
			if (groupId !== 'other' && nonEpicSessions.length > 0 && epicSessions.size > 0) {
				newSet.add(getEpicGroupKey(project, 'other'));
			}
		}

		// Toggle the clicked group
		if (isCurrentlyCollapsed) {
			newSet.delete(key);
		} else {
			newSet.add(key);
		}

		collapsedEpicGroups = newSet;
		saveCollapsedEpicGroups(newSet);
	}

	// Handle section resize
	function handleSectionResize(project: string, section: 'sessions' | 'tasks', deltaY: number) {
		const current = getSectionState(project, section);
		if (current.collapsed) return;

		let newHeight = current.height + deltaY;

		// Snap to collapsed if dragging below minimum
		if (newHeight < MIN_SECTION_HEIGHT) {
			// Save current height for restore
			const key = getSectionKey(project, section);
			const newHeightBefore = new Map(heightBeforeSnap);
			newHeightBefore.set(key, current.height);
			heightBeforeSnap = newHeightBefore;

			updateSectionState(project, section, { collapsed: true });
			return;
		}

		// No upper limit - allow free resizing to any height
		// User can scroll the page if content is taller than viewport
		updateSectionState(project, section, { height: newHeight });
	}

	// Restore section from collapsed state
	function restoreSection(project: string, section: 'sessions' | 'tasks') {
		const key = getSectionKey(project, section);
		const savedHeight = heightBeforeSnap.get(key);
		const defaultHeight = section === 'sessions' ? DEFAULT_SESSION_HEIGHT : DEFAULT_TASK_HEIGHT;
		const restoreHeight = savedHeight ?? defaultHeight;

		updateSectionState(project, section, {
			collapsed: false,
			height: restoreHeight
		});
	}

	// Auto-size section to fit content (double-click handler)
	function autoSizeSection(project: string, section: 'sessions' | 'tasks') {
		const current = getSectionState(project, section);
		if (current.collapsed) {
			// If collapsed, expand to default height
			updateSectionState(project, section, { collapsed: false });
			return;
		}

		// Calculate content height based on section type
		let contentHeight: number;
		if (section === 'sessions') {
			const sessions = sessionsByProject.get(project) || [];
			// SessionCard in agent mode is roughly 400px tall, plus padding
			contentHeight = Math.max(300, Math.min(sessions.length > 0 ? 420 : 300, window.innerHeight * 0.6));
		} else {
			const projectTasks = getTasksForProject(project);
			// Estimate ~36px per task row, plus header (~50px), min 200px
			const openTasks = projectTasks.filter(t => t.status !== 'closed').length;
			contentHeight = Math.max(200, Math.min(50 + openTasks * 36, window.innerHeight * 0.6));
		}

		updateSectionState(project, section, { height: contentHeight });
	}

	// Drag and drop handlers for project reordering
	function handleDragStart(e: DragEvent, project: string) {
		draggedProject = project;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', project);
		}
	}

	function handleDragOver(e: DragEvent, project: string) {
		e.preventDefault();
		if (draggedProject && draggedProject !== project) {
			dragOverProject = project;
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		}
	}

	function handleDragLeave() {
		dragOverProject = null;
	}

	function handleDrop(e: DragEvent, targetProject: string) {
		e.preventDefault();
		if (!draggedProject || draggedProject === targetProject) {
			draggedProject = null;
			dragOverProject = null;
			return;
		}

		const currentOrder = [...sortedProjects];
		const draggedIndex = currentOrder.indexOf(draggedProject);
		const targetIndex = currentOrder.indexOf(targetProject);

		if (draggedIndex !== -1 && targetIndex !== -1) {
			currentOrder.splice(draggedIndex, 1);
			currentOrder.splice(targetIndex, 0, draggedProject);
			customProjectOrder = currentOrder;
			saveProjectOrder(currentOrder);
		}

		draggedProject = null;
		dragOverProject = null;
	}

	function handleDragEnd() {
		draggedProject = null;
		dragOverProject = null;
	}

	// Initialize project collapse states
	$effect(() => {
		if (browser && allProjects.length > 0) {
			const currentState = $state.snapshot(projectCollapseState);
			let changed = false;
			const newState = new Map(currentState);

			for (const project of allProjects) {
				if (!newState.has(project)) {
					newState.set(project, loadProjectCollapse(project));
					changed = true;
				}
			}

			if (changed) projectCollapseState = newState;
		}
	});

	// Initialize section states when projects change
	$effect(() => {
		if (sortedProjects.length > 0) {
			initializeSectionStates(sortedProjects);
		}
	});

	// Listen for task events
	$effect(() => {
		const unsubscribe = lastTaskEvent.subscribe((event) => {
			if (event) {
				// Use fresh=true to bypass cache after task creation/update
				fetchTaskData(true);
				if (event.updatedTasks && event.updatedTasks.length > 0) {
					fetchSessions();
				}
			}
		});
		return unsubscribe;
	});

	// Listen for session events (spawn, kill, etc.)
	// This ensures the session list refreshes when an agent is spawned from the drawer
	$effect(() => {
		const unsubscribe = lastSessionEvent.subscribe((event) => {
			if (event) {
				const structuralEvents = ['session-spawned', 'session-created', 'session-destroyed', 'session-killed'];
				if (structuralEvents.includes(event.type)) {
					// Refresh sessions to pick up the new/removed session
					fetchSessions();
				}
			}
		});
		return unsubscribe;
	});

	// Fetch task data
	async function fetchTaskData(fresh = false) {
		try {
			const url = fresh ? '/api/agents?full=true&fresh=true' : '/api/agents?full=true';
			const response = await fetch(url);
			const data = await response.json();

			if (data.error) {
				console.error('API error:', data.error);
				return;
			}

			agents = data.agents || [];
			reservations = data.reservations || [];
			tasks = data.tasks || [];
			allTasks = data.tasks || [];
		} catch (error) {
			console.error('Failed to fetch task data:', error);
		} finally {
			isInitialLoad = false;
		}
	}

	// Refresh after linking task to epic - busts both task and session caches
	async function handleEpicLinkRefresh() {
		// Fetch fresh task data (includes epic dependencies)
		await fetchTaskData(true);

		// Fetch fresh session data (busts server-side task cache)
		await fetchSessions(false, true);
	}

	// Event handlers
	async function handleSpawnForTask(taskId: string) {
		const session = await spawn(taskId);
		if (session) await fetchTaskData();
	}

	async function handleKillSession(sessionName: string) {
		const success = await kill(sessionName);
		if (success) {
			broadcastSessionEvent('session-killed', sessionName);
			await fetchTaskData();
		}
	}

	async function handleInterrupt(sessionName: string) {
		await interrupt(sessionName);
	}

	async function handleContinue(sessionName: string) {
		await sendEnter(sessionName);
	}

	async function handleAttachTerminal(sessionName: string) {
		try {
			const response = await fetch(`/api/work/${sessionName}/attach`, { method: 'POST' });
			if (!response.ok) console.error('Failed to attach terminal:', await response.text());
		} catch (error) {
			console.error('Failed to attach terminal:', error);
		}
	}

	async function handleSendInput(sessionName: string, input: string, type: 'text' | 'key' | 'raw') {
		if (type === 'raw') {
			await sendInput(sessionName, input, 'raw');
			return;
		}
		if (type === 'key') {
			const specialKeys = ['ctrl-c', 'ctrl-d', 'ctrl-u', 'enter', 'escape', 'up', 'down', 'tab'];
			if (specialKeys.includes(input)) {
				await sendInput(sessionName, '', input as 'ctrl-c' | 'ctrl-d' | 'ctrl-u' | 'enter' | 'escape' | 'up' | 'down' | 'tab');
				return;
			}
			await sendInput(sessionName, input, 'raw');
			return;
		}
		await sendInput(sessionName, input, 'text');
	}

	function handleTaskClick(taskId: string) {
		selectedTaskId = taskId;
		drawerOpen = true;
	}

	function handleAgentClick(agentName: string) {
		const workCard = document.querySelector(`[data-agent-name="${agentName}"]`);
		if (workCard) {
			workCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
			highlightedAgent = agentName;
			setTimeout(() => { highlightedAgent = null; }, 1500);
		}
	}

	// Refetch on drawer close
	let wasDrawerOpen = false;
	$effect(() => {
		if (wasDrawerOpen && !drawerOpen) {
			fetchTaskData();
			fetchSessions();
		}
		wasDrawerOpen = drawerOpen;
	});

	// Get tasks for a specific project
	function getTasksForProject(project: string): Task[] {
		return filterTasksByProject(tasks, project) as Task[];
	}

	// Get completed task IDs from active sessions for a project
	function getCompletedTasksForProject(project: string): Set<string> {
		const sessions = sessionsByProject.get(project) || [];
		const completedIds = new Set<string>();
		for (const session of sessions) {
			if (session.lastCompletedTask?.id) {
				completedIds.add(session.lastCompletedTask.id);
			}
		}
		return completedIds;
	}

	// Get search term for a project
	function getSearchTerm(project: string): string {
		return projectSearchTerms.get(project) || '';
	}

	// Set search term for a project
	function setSearchTerm(project: string, term: string) {
		const newTerms = new Map(projectSearchTerms);
		if (term) {
			newTerms.set(project, term);
		} else {
			newTerms.delete(project);
		}
		projectSearchTerms = newTerms;
	}

	// Filter sessions by search term
	function filterSessions(sessions: typeof workSessionsState.sessions, searchTerm: string) {
		if (!searchTerm) return sessions;
		const term = searchTerm.toLowerCase();
		return sessions.filter(session => {
			const agentName = (session.agentName || '').toLowerCase();
			const taskId = (session.task?.id || '').toLowerCase();
			const taskTitle = (session.task?.title || '').toLowerCase();
			const lastTaskId = (session.lastCompletedTask?.id || '').toLowerCase();
			const lastTaskTitle = (session.lastCompletedTask?.title || '').toLowerCase();
			return agentName.includes(term) ||
				taskId.includes(term) ||
				taskTitle.includes(term) ||
				lastTaskId.includes(term) ||
				lastTaskTitle.includes(term);
		});
	}

	// Filter tasks by search term
	function filterTasks(tasks: Task[], searchTerm: string): Task[] {
		if (!searchTerm) return tasks;
		const term = searchTerm.toLowerCase();
		return tasks.filter(task => {
			const id = (task.id || '').toLowerCase();
			const title = (task.title || '').toLowerCase();
			const description = (task.description || '').toLowerCase();
			const assignee = (task.assignee || '').toLowerCase();
			return id.includes(term) || title.includes(term) || description.includes(term) || assignee.includes(term);
		});
	}

	// Sort sessions based on current sort settings
	// sortBy and sortDir are passed explicitly for Svelte reactivity tracking
	function sortSessionsWithOrder(
		sessions: typeof workSessionsState.sessions,
		project: string,
		sessionOrder: string[],
		sortBy: SortOption,
		sortDir: 'asc' | 'desc'
	) {
		const multiplier = sortDir === 'asc' ? 1 : -1;

		// Manual sort - use custom order
		if (sortBy === 'manual') {
			// Use passed order, or load from localStorage if empty
			const customOrder = sessionOrder.length > 0 ? sessionOrder : loadSessionOrder(project);
			if (customOrder.length > 0) {
				return [...sessions].sort((a, b) => {
					const aIndex = customOrder.indexOf(a.sessionName);
					const bIndex = customOrder.indexOf(b.sessionName);
					// Items not in custom order go to the end
					const aPos = aIndex === -1 ? 999 : aIndex;
					const bPos = bIndex === -1 ? 999 : bIndex;
					return aPos - bPos;
				});
			}
			// No custom order yet - return as-is
			return sessions;
		}

		// State priority for sorting (lower = show first when asc)
		const stateOrder: Record<string, number> = {
			needs_input: 1,
			review: 2,
			working: 3,
			idle: 4,
			offline: 5
		};

		return [...sessions].sort((a, b) => {
			switch (sortBy) {
				case 'state': {
					const aState = a._sseState || 'offline';
					const bState = b._sseState || 'offline';
					const aOrder = stateOrder[aState] ?? 99;
					const bOrder = stateOrder[bState] ?? 99;
					return (aOrder - bOrder) * multiplier;
				}
				case 'priority': {
					const aPriority = a.task?.priority ?? 999;
					const bPriority = b.task?.priority ?? 999;
					return (aPriority - bPriority) * multiplier;
				}
				case 'created': {
					const aCreated = a.created ? new Date(a.created).getTime() : 0;
					const bCreated = b.created ? new Date(b.created).getTime() : 0;
					return (aCreated - bCreated) * multiplier;
				}
				case 'cost': {
					const aCost = a.cost ?? 0;
					const bCost = b.cost ?? 0;
					return (aCost - bCost) * multiplier;
				}
				default:
					return 0;
			}
		});
	}

	// Handle session drag and drop for manual ordering
	function handleSessionDragStart(e: DragEvent, project: string, sessionName: string) {
		if (getSortBy() !== 'manual') return;
		draggedSession = { project, sessionName };
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', sessionName);
		}
	}

	function handleSessionDragOver(e: DragEvent, project: string, sessionName: string) {
		e.preventDefault(); // Required to allow drop
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		if (!draggedSession || draggedSession.project !== project) return;
		dragOverSession = { project, sessionName };
	}

	function handleSessionDragLeave() {
		dragOverSession = null;
	}

	function handleSessionDrop(e: DragEvent, project: string, targetSessionName: string) {
		e.preventDefault();
		if (!draggedSession || draggedSession.project !== project) return;

		const sessions = sessionsByProject.get(project) || [];
		const currentOrder = getSessionOrder(project);

		// Build order array if empty
		let order = currentOrder.length > 0
			? [...currentOrder]
			: sessions.map(s => s.sessionName);

		// Remove dragged item and insert at new position
		const draggedIndex = order.indexOf(draggedSession.sessionName);
		const targetIndex = order.indexOf(targetSessionName);

		if (draggedIndex !== -1 && targetIndex !== -1 && draggedIndex !== targetIndex) {
			order.splice(draggedIndex, 1);
			order.splice(targetIndex, 0, draggedSession.sessionName);
			setSessionOrder(project, order);
		}

		draggedSession = null;
		dragOverSession = null;
	}

	function handleSessionDragEnd() {
		draggedSession = null;
		dragOverSession = null;
	}

	// Keyboard navigation handler
	function handleKeydown(e: KeyboardEvent) {
		// Don't handle if user is typing in an input
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		// Don't handle if drawer is open
		if (drawerOpen) return;

		switch (e.key) {
			case 'j': // Next project
				e.preventDefault();
				if (sortedProjects.length > 0) {
					focusedProjectIndex = Math.min(focusedProjectIndex + 1, sortedProjects.length - 1);
					scrollToFocusedProject();
				}
				break;
			case 'k': // Previous project
				e.preventDefault();
				if (sortedProjects.length > 0) {
					focusedProjectIndex = Math.max(focusedProjectIndex - 1, 0);
					scrollToFocusedProject();
				}
				break;
			case 'Enter': // Toggle expand/collapse focused project
				e.preventDefault();
				if (focusedProject) {
					toggleProjectCollapse(focusedProject);
				}
				break;
			case '1': // Toggle sessions section
				e.preventDefault();
				if (focusedProject && !projectCollapseState.get(focusedProject)) {
					toggleSectionCollapse(focusedProject, 'sessions');
				}
				break;
			case '2': // Toggle tasks section
				e.preventDefault();
				if (focusedProject && !projectCollapseState.get(focusedProject)) {
					toggleSectionCollapse(focusedProject, 'tasks');
				}
				break;
			case 'Escape': // Collapse all projects
				e.preventDefault();
				const newState = new Map(projectCollapseState);
				for (const project of sortedProjects) {
					newState.set(project, true);
					saveProjectCollapse(project, true);
				}
				projectCollapseState = newState;
				break;
		}
	}

	function scrollToFocusedProject() {
		if (focusedProject) {
			const el = document.querySelector(`[data-project="${focusedProject}"]`);
			if (el) {
				el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			}
		}
	}

	// Fetch JAT config projects (for showing all configured projects)
	async function fetchConfigProjects() {
		try {
			const response = await fetch('/api/projects?visible=true');
			const data = await response.json();
			// Extract project names from the config
			configProjects = (data.projects || []).map((p: { name: string }) => p.name);
		} catch (error) {
			console.error('Failed to fetch config projects:', error);
			configProjects = [];
		}
	}

	// Fetch JAT defaults (for layout heights)
	async function fetchConfigDefaults() {
		try {
			const response = await fetch('/api/config/defaults');
			const data = await response.json();
			if (data.success && data.defaults) {
				configSessionHeight = data.defaults.projects_session_height || 400;
				configTaskHeight = data.defaults.projects_task_height || 400;
			}
		} catch (error) {
			console.error('Failed to fetch config defaults:', error);
			// Keep the defaults on error
		}
	}

	// Open task creation drawer with project pre-selected
	function handleCreateTaskForProject(project: string) {
		openTaskDrawer(project);
	}

	// Hide project from dashboard (doesn't delete .beads/)
	async function hideProject(project: string) {
		isHiding = true;
		try {
			const response = await fetch('/api/projects', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'hide', project })
			});
			if (response.ok) {
				// Remove from config projects list
				configProjects = configProjects.filter(p => p !== project);
				// Also remove from custom order if present
				customProjectOrder = customProjectOrder.filter(p => p !== project);
				saveProjectOrder(customProjectOrder);
			} else {
				console.error('Failed to hide project:', await response.text());
			}
		} catch (error) {
			console.error('Failed to hide project:', error);
		} finally {
			isHiding = false;
			projectToHide = null;
		}
	}

	// Subscription cleanup
	let unsubscribeMaximize: (() => void) | undefined;

	onMount(async () => {
		customProjectOrder = loadProjectOrder();
		collapsedEpicGroups = loadCollapsedEpicGroups();
		initSort(); // Initialize session sort from localStorage
		await fetchConfigDefaults(); // Load layout defaults before project data
		await fetchConfigProjects(); // Load all configured projects FIRST
		fetchTaskData();
		await fetchSessions();
		// Delay usage fetch to avoid blocking UI during initial user interactions
		// Usage parsing scans ~40K lines of JSONL files and takes 7+ seconds
		setTimeout(() => fetchSessionUsage(), 30000);

		// Subscribe to maximizeSessionPanel for click-to-center behavior
		console.log('[projects/+page] Setting up maximizeSessionPanel subscription');
		unsubscribeMaximize = maximizeSessionPanel.subscribe(async (sessionName) => {
			console.log('[projects/+page] maximizeSessionPanel subscription fired:', sessionName);
			if (sessionName) {
				// Find which project contains this session
				let targetProject: string | null = null;
				for (const [project, sessions] of sessionsByProject.entries()) {
					if (sessions.some(s => s.sessionName === sessionName)) {
						targetProject = project;
						break;
					}
				}

				console.log('[projects/+page] Found project for session:', targetProject);
				if (targetProject) {
					// Expand the project if collapsed
					const isProjectCollapsed = projectCollapseState.get(targetProject) ?? false;
					if (isProjectCollapsed) {
						console.log('[projects/+page] Expanding collapsed project:', targetProject);
						const newState = new Map(projectCollapseState);
						newState.set(targetProject, false);
						projectCollapseState = newState;
						saveProjectCollapse(targetProject, false);
					}

					// Expand the sessions section if collapsed
					const sessionState = getSectionState(targetProject, 'sessions');
					if (sessionState.collapsed) {
						console.log('[projects/+page] Expanding collapsed sessions section');
						updateSectionState(targetProject, 'sessions', { collapsed: false });
					}

					// ALWAYS maximize sessions section height when clicking (uses user preference as % of viewport)
					const heightPercent = getSessionMaximizeHeight();
					const maximizeHeight = Math.round(window.innerHeight * (heightPercent / 100));
					console.log('[projects/+page] Setting session height to:', maximizeHeight, `(${heightPercent}% of viewport)`);
					updateSectionState(targetProject, 'sessions', { height: maximizeHeight });

					await tick();
					console.log('[projects/+page] Panel maximized for project:', targetProject);
				}
			}
		});
	});

	onDestroy(() => {
		unsubscribeMaximize?.();
	});
</script>

<svelte:head>
	<title>Projects | JAT Dashboard</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="h-full bg-base-200 flex flex-col overflow-auto">
	{#if isInitialLoad}
		<div class="p-4 space-y-4">
			<SessionPanelSkeleton cards={3} />
		</div>
	{:else if allProjects.length === 0}
		<!-- Welcome/onboarding screen for new users -->
		<WelcomeScreen onAddProject={openProjectDrawer} />
	{:else}
		<!-- Project list -->
		<div class="flex flex-col">
			<!-- Sticky header with Add Project button -->
			<div class="sticky top-0 z-30 bg-base-200 border-b border-base-300 px-4 py-2 flex items-center justify-between">
				<span class="text-xs font-mono uppercase tracking-wider text-base-content/60">
					{sortedProjects.length} project{sortedProjects.length !== 1 ? 's' : ''}
				</span>
				<button
					class="btn btn-xs btn-ghost gap-1"
					onclick={openProjectDrawer}
					style="
						color: oklch(0.70 0.18 145);
						border: 1px solid oklch(0.70 0.18 145 / 0.3);
					"
				>
					<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
					Add Project
				</button>
			</div>
			{#each sortedProjects as project (project)}
				{@const isProjectCollapsed = projectCollapseState.get(project) ?? false}
				{@const sessions = sessionsByProject.get(project) || []}
				{@const projectTasks = getTasksForProject(project)}
				{@const projectColor = getProjectColor(project)}
				{@const hasSessions = sessions.length > 0}
				{@const isDragging = draggedProject === project}
				{@const isDragOver = dragOverProject === project}
				{@const isFocused = focusedProject === project}
				{@const sessionsExpanded = !isProjectCollapsed && !getSectionState(project, 'sessions').collapsed}
				{@const tasksExpanded = !isProjectCollapsed && !getSectionState(project, 'tasks').collapsed}
				{@const searchTerm = getSearchTerm(project)}
				{@const currentSortOption = SORT_OPTIONS.find(o => o.value === currentSortBy)}
				{@const isManualSort = currentSortBy === 'manual'}
				{@const sessionOrder = sessionOrderByProject.get(project) || []}
				{@const filteredSessions = sortedSessionsByProject.get(project) || []}
				{@const filteredTasks = filterTasks(projectTasks, searchTerm)}
				{@const openTaskCount = projectTasks.filter(t => t.status !== 'closed').length}
				{@const filteredOpenTaskCount = filteredTasks.filter(t => t.status !== 'closed').length}

				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					data-project={project}
					class="border-b border-base-300 bg-base-100 transition-all duration-150"
					class:opacity-50={isDragging}
					class:border-t-2={isDragOver}
					class:border-t-primary={isDragOver}
					class:ring-2={isFocused}
					class:ring-primary={isFocused}
					class:ring-inset={isFocused}
					ondragover={(e) => handleDragOver(e, project)}
					ondragleave={handleDragLeave}
					ondrop={(e) => handleDrop(e, project)}
					ondragend={handleDragEnd}
				>
					<!-- Project header -->
					<div
						class="w-full flex items-center gap-3 px-4 py-2 hover:bg-base-200/50 transition-colors bg-base-100 z-20 sticky top-0 shadow-sm {isDragOver ? 'bg-primary/10' : ''}"
					>
						<!-- Drag handle - only this element initiates drag -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="p-1 -m-1 cursor-grab active:cursor-grabbing flex-shrink-0"
							draggable="true"
							ondragstart={(e) => handleDragStart(e, project)}
						>
							<svg
								class="w-4 h-4 text-base-content/30 hover:text-base-content/60 pointer-events-none"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M4 8h16M4 16h16" />
							</svg>
						</div>

						<!-- Collapse button -->
						<button
							class="flex items-center gap-3 flex-1 min-w-0"
							onclick={() => toggleProjectCollapse(project)}
						>
							<svg
								class="w-4 h-4 transition-transform duration-200 flex-shrink-0"
								class:rotate-90={!isProjectCollapsed}
								fill="none" viewBox="0 0 24 24" stroke="currentColor"
							>
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
							</svg>

							<div class="w-3 h-3 rounded-full flex-shrink-0" style="background-color: {projectColor}"></div>

							<span class="font-semibold text-base-content uppercase tracking-wide">{project}</span>

							<!-- Sessions badge - clickable to toggle sessions section -->
							{#if hasSessions}
							<span
								role="button"
								tabindex="0"
								class="badge badge-sm transition-all duration-200 cursor-pointer select-none {sessionsExpanded ? 'badge-primary shadow-inner' : 'badge-ghost hover:badge-primary'}"
								onclick={(e) => {
									e.stopPropagation();
									// If project is collapsed, expand it first
									if (isProjectCollapsed) toggleProjectCollapse(project);
									// Toggle sessions section (with slight delay if expanding project)
									if (isProjectCollapsed) {
										setTimeout(() => toggleSectionCollapse(project, 'sessions'), 50);
									} else {
										toggleSectionCollapse(project, 'sessions');
									}
								}}
								onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleSectionCollapse(project, 'sessions'); } }}
								title="Click to expand/collapse sessions"
							>{#if searchTerm && filteredSessions.length !== sessions.length}{filteredSessions.length}/{/if}{sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>
							{/if}

							<!-- Tasks badge - clickable to toggle tasks section -->
							<span
								role="button"
								tabindex="0"
								class="badge badge-sm transition-all duration-200 cursor-pointer select-none {tasksExpanded ? 'badge-primary shadow-inner' : 'badge-outline hover:badge-primary'}"
								onclick={(e) => {
									e.stopPropagation();
									// If project is collapsed, expand it first
									if (isProjectCollapsed) toggleProjectCollapse(project);
									// Toggle tasks section (with slight delay if expanding project)
									if (isProjectCollapsed) {
										setTimeout(() => toggleSectionCollapse(project, 'tasks'), 50);
									} else {
										toggleSectionCollapse(project, 'tasks');
									}
								}}
								onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleSectionCollapse(project, 'tasks'); } }}
								title="Click to expand/collapse tasks"
							>{#if searchTerm && filteredOpenTaskCount !== openTaskCount}{filteredOpenTaskCount}/{/if}{openTaskCount} task{openTaskCount !== 1 ? 's' : ''}</span>
						</button>

						<!-- Mini session avatars (shown when project collapsed) -->
						{#if isProjectCollapsed && hasSessions}
							<div class="flex items-center -space-x-1 ml-auto">
								{#each filteredSessions.slice(0, 5) as session (session.sessionName)}
									{@const isWorking = session._sseState === 'working' || session._sseState === 'needs_input' || session._sseState === 'review'}
									<WorkingAgentBadge
										name={session.agentName || ''}
										size={22}
										{isWorking}
										variant="avatar"
										onClick={() => {
											// Expand project and scroll to session
											if (isProjectCollapsed) toggleProjectCollapse(project);
											setTimeout(() => handleAgentClick(session.agentName), 100);
										}}
									/>
								{/each}
								{#if filteredSessions.length > 5}
									<span class="text-xs text-base-content/50 ml-2">+{filteredSessions.length - 5}</span>
								{/if}
							</div>
						{/if}

						<!-- Hide project button -->
						<button
							class="btn btn-xs btn-ghost opacity-30 hover:opacity-100 hover:btn-error flex-shrink-0"
							onclick={(e) => { e.stopPropagation(); projectToHide = project; }}
							title="Hide project from dashboard"
						>
							<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>

					<!-- Project content (collapsible) -->
					{#if !isProjectCollapsed}
						{@const sessionState = getSectionState(project, 'sessions')}
						{@const taskState = getSectionState(project, 'tasks')}
						{@const isEmptyProject = !hasSessions && projectTasks.length === 0}
						<div class="flex flex-col">
							<!-- Sessions Section - grouped by epic -->
							{#if filteredSessions.length > 0 && !sessionState.collapsed}
								{@const { epicSessions, nonEpicSessions } = getSessionsByEpic(filteredSessions, project)}
								{@const effectiveHeight = getEffectiveSessionsHeight(project, filteredSessions, sessionState.height)}
								<div class="border-b border-base-300" transition:slide={{ duration: 200 }}>
									<!-- Sessions content - auto-shrinks when all groups collapsed -->
									<div
										class="overflow-hidden transition-all duration-300"
										style="height: {effectiveHeight}px;"
									>
										<div class="flex flex-col gap-2 overflow-y-auto h-full p-2 scrollbar-thin scrollbar-thumb-base-300 scrollbar-track-transparent">
											<!-- Epic session groups -->
											{#each Array.from(epicSessions.entries()) as [epicId, epicSessionList] (epicId)}
												{@const epicTask = getEpicTask(epicId)}
												{@const isEpicCollapsed = isEpicGroupCollapsed(project, epicId)}
												{@const groupSort = getGroupSort(project, epicId)}
												{@const groupFilter = getGroupFilter(project, epicId)}
												{@const groupSortOption = SORT_OPTIONS.find(o => o.value === groupSort.sortBy)}
												{@const filteredEpicSessions = filterSessionsByTerm(epicSessionList, groupFilter)}
												{@const sortedEpicSessions = sortSessions(filteredEpicSessions, groupSort.sortBy, groupSort.sortDir)}
												<div class="flex flex-col gap-1 {isEpicCollapsed ? '' : 'flex-1'} min-h-0" transition:slide|local={{ duration: 250, easing: cubicOut }}>
													<!-- Epic header (clickable to collapse) -->
													<!-- svelte-ignore a11y_no_static_element_interactions -->
													<div
														class="flex items-center gap-2 px-2 py-1 bg-base-200/50 rounded-lg border-l-2 border-purple-500/50 hover:bg-base-200 transition-colors select-none"
													>
														<button
															class="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
															onclick={() => toggleEpicGroupCollapse(project, epicId)}
															title="Click to {isEpicCollapsed ? 'expand' : 'collapse'} epic sessions"
														>
															<span class="text-purple-400 text-sm transition-transform duration-200 {isEpicCollapsed ? '-rotate-90' : ''}">📦</span>
															<span class="text-xs font-semibold text-purple-300 uppercase tracking-wide truncate">{epicTask?.title || epicId}</span>
															<span class="badge badge-xs {isEpicCollapsed ? 'badge-primary' : 'badge-ghost'}">{groupFilter ? `${sortedEpicSessions.length}/${epicSessionList.length}` : epicSessionList.length}</span>
														</button>

														<!-- Sort dropdown with filter -->
														<SortDropdown
															sortBy={groupSort.sortBy}
															sortDir={groupSort.sortDir}
															filterValue={groupFilter}
															showFilter={true}
															onSortChange={(value, dir) => setGroupSort(project, epicId, value as import('$lib/stores/workSort.svelte.js').SortOption, dir)}
															onFilterChange={(value) => setGroupFilter(project, epicId, value)}
														/>
													</div>
													<!-- Epic sessions (horizontal scroll) -->
													{#if !isEpicCollapsed}
													<div class="flex gap-3 overflow-x-auto pl-3 h-full scrollbar-thin scrollbar-thumb-base-300 scrollbar-track-transparent" transition:slide|local={{ duration: 300, easing: quintOut }}>
														{#each sortedEpicSessions as session, i (session.sessionName)}
															{@const isSessionDragging = draggedSession?.sessionName === session.sessionName}
															{@const isSessionDragOver = dragOverSession?.sessionName === session.sessionName && dragOverSession?.project === project}
															<!-- svelte-ignore a11y_no_static_element_interactions -->
															<div
																class="h-full transition-all duration-150 relative flex-shrink-0"
																class:opacity-50={isSessionDragging}
																class:ring-2={isSessionDragOver}
																class:ring-primary={isSessionDragOver}
																class:cursor-grab={isManualSort}
																draggable={isManualSort}
																ondragstart={(e) => handleSessionDragStart(e, project, session.sessionName)}
																ondragend={handleSessionDragEnd}
																transition:fly|local={{ x: -20, duration: 200, delay: i * 30, easing: cubicOut }}
															>
																{#if isManualSort && draggedSession && !isSessionDragging}
																	<!-- svelte-ignore a11y_no_static_element_interactions -->
																	<div
																		class="absolute inset-0 z-50"
																		ondragover={(e) => handleSessionDragOver(e, project, session.sessionName)}
																		ondragleave={handleSessionDragLeave}
																		ondrop={(e) => handleSessionDrop(e, project, session.sessionName)}
																	></div>
																{/if}
																<SessionCard
																	mode="agent"
																	sessionName={session.sessionName}
																	agentName={session.agentName}
																	task={session.task}
																	lastCompletedTask={session.lastCompletedTask}
																	output={session.output}
																	lineCount={session.lineCount}
																	tokens={session.tokens}
																	cost={session.cost}
																	sparklineData={session.sparklineData}
																	contextPercent={session.contextPercent ?? undefined}
																	startTime={session.created ? new Date(session.created) : null}
																	sseState={session._sseState}
																	sseStateTimestamp={session._sseStateTimestamp}
																	signalSuggestedTasks={session._signalSuggestedTasks}
																	signalSuggestedTasksTimestamp={session._signalSuggestedTasksTimestamp}
																	completionBundle={session._completionBundle}
																	completionBundleTimestamp={session._completionBundleTimestamp}
																	onKillSession={() => handleKillSession(session.sessionName)}
																	onInterrupt={() => handleInterrupt(session.sessionName)}
																	onContinue={() => handleContinue(session.sessionName)}
																	onAttachTerminal={() => handleAttachTerminal(session.sessionName)}
																	onSendInput={(input, type) => handleSendInput(session.sessionName, input, type)}
																	onTaskClick={handleTaskClick}
																	isHighlighted={highlightedAgent === session.agentName}
																	isExiting={session._isExiting}
																	onTaskDataChange={handleEpicLinkRefresh}
																/>
															</div>
														{/each}
													</div>
													{/if}
												</div>
											{/each}

											<!-- Non-epic sessions -->
											{#if nonEpicSessions.length > 0}
												{@const isOtherCollapsed = isEpicGroupCollapsed(project, 'other')}
												{@const otherGroupSort = getGroupSort(project, 'other')}
												{@const otherGroupFilter = getGroupFilter(project, 'other')}
												{@const otherGroupSortOption = SORT_OPTIONS.find(o => o.value === otherGroupSort.sortBy)}
												{@const filteredOtherSessions = filterSessionsByTerm(nonEpicSessions, otherGroupFilter)}
												{@const sortedOtherSessions = sortSessions(filteredOtherSessions, otherGroupSort.sortBy, otherGroupSort.sortDir)}
												<div class="flex flex-col gap-1 {isOtherCollapsed ? '' : 'flex-1'} min-h-0" transition:slide|local={{ duration: 250, easing: cubicOut }}>
													<!-- Header with sort/filter controls -->
													{#if epicSessions.size > 0}
														<!-- svelte-ignore a11y_no_static_element_interactions -->
														<div
															class="flex items-center gap-2 px-2 py-1 bg-base-200/50 rounded-lg border-l-2 border-base-content/20 hover:bg-base-200 transition-colors select-none"
														>
															<button
																class="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
																onclick={() => toggleEpicGroupCollapse(project, 'other')}
																title="Click to {isOtherCollapsed ? 'expand' : 'collapse'} other sessions"
															>
																<span class="text-base-content/50 text-sm transition-transform duration-200 {isOtherCollapsed ? '-rotate-90' : ''}">📋</span>
																<span class="text-xs font-semibold text-base-content/50 uppercase tracking-wide">Other Sessions</span>
																<span class="badge badge-xs {isOtherCollapsed ? 'badge-primary' : 'badge-ghost'}">{otherGroupFilter ? `${sortedOtherSessions.length}/${nonEpicSessions.length}` : nonEpicSessions.length}</span>
															</button>

															<!-- Sort dropdown with filter -->
															<SortDropdown
																sortBy={otherGroupSort.sortBy}
																sortDir={otherGroupSort.sortDir}
																filterValue={otherGroupFilter}
																showFilter={true}
																onSortChange={(value, dir) => setGroupSort(project, 'other', value as import('$lib/stores/workSort.svelte.js').SortOption, dir)}
																onFilterChange={(value) => setGroupFilter(project, 'other', value)}
															/>
														</div>
													{:else}
														<!-- Header with sort/filter controls (when no epic groups exist) -->
														<!-- svelte-ignore a11y_no_static_element_interactions -->
														<div class="flex items-center gap-2 px-2 py-1 bg-base-200/50 rounded-lg border-l-2 border-base-content/20 hover:bg-base-200 transition-colors select-none">
															<span class="text-base-content/50 text-sm">📋</span>
															<span class="text-xs font-semibold text-base-content/50 uppercase tracking-wide">Sessions</span>
															<span class="badge badge-xs badge-ghost">{otherGroupFilter ? `${sortedOtherSessions.length}/${nonEpicSessions.length}` : nonEpicSessions.length}</span>

															<!-- Sort dropdown with filter (ml-auto for right alignment) -->
															<div class="ml-auto">
																<SortDropdown
																	sortBy={otherGroupSort.sortBy}
																	sortDir={otherGroupSort.sortDir}
																	filterValue={otherGroupFilter}
																	showFilter={true}
																	onSortChange={(value, dir) => setGroupSort(project, 'other', value as import('$lib/stores/workSort.svelte.js').SortOption, dir)}
																	onFilterChange={(value) => setGroupFilter(project, 'other', value)}
																/>
															</div>
																	placeholder="Filter..."
																	value={otherGroupFilter}
																	oninput={(e) => setGroupFilter(project, 'other', e.currentTarget.value)}
																	class="input input-xs input-bordered w-20 focus:w-32 transition-all duration-200 bg-base-200/50"
																/>
															</div>
														</div>
													{/if}
													<!-- Non-epic sessions (horizontal scroll) -->
													{#if !isOtherCollapsed || epicSessions.size === 0}
													<div class="flex gap-3 overflow-x-auto h-full {epicSessions.size > 0 ? 'pl-3' : ''} scrollbar-thin scrollbar-thumb-base-300 scrollbar-track-transparent" transition:slide|local={{ duration: 300, easing: quintOut }}>
														{#each sortedOtherSessions as session, i (session.sessionName)}
															{@const isSessionDragging = draggedSession?.sessionName === session.sessionName}
															{@const isSessionDragOver = dragOverSession?.sessionName === session.sessionName && dragOverSession?.project === project}
															<!-- svelte-ignore a11y_no_static_element_interactions -->
															<div
																class="h-full transition-all duration-150 relative flex-shrink-0"
																class:opacity-50={isSessionDragging}
																class:ring-2={isSessionDragOver}
																class:ring-primary={isSessionDragOver}
																class:cursor-grab={isManualSort}
																draggable={isManualSort}
																ondragstart={(e) => handleSessionDragStart(e, project, session.sessionName)}
																ondragend={handleSessionDragEnd}
																transition:fly|local={{ x: -20, duration: 200, delay: i * 30, easing: cubicOut }}
															>
																{#if isManualSort && draggedSession && !isSessionDragging}
																	<!-- svelte-ignore a11y_no_static_element_interactions -->
																	<div
																		class="absolute inset-0 z-50"
																		ondragover={(e) => handleSessionDragOver(e, project, session.sessionName)}
																		ondragleave={handleSessionDragLeave}
																		ondrop={(e) => handleSessionDrop(e, project, session.sessionName)}
																	></div>
																{/if}
																<SessionCard
																	mode="agent"
																	sessionName={session.sessionName}
																	agentName={session.agentName}
																	task={session.task}
																	lastCompletedTask={session.lastCompletedTask}
																	output={session.output}
																	lineCount={session.lineCount}
																	tokens={session.tokens}
																	cost={session.cost}
																	sparklineData={session.sparklineData}
																	contextPercent={session.contextPercent ?? undefined}
																	startTime={session.created ? new Date(session.created) : null}
																	sseState={session._sseState}
																	sseStateTimestamp={session._sseStateTimestamp}
																	signalSuggestedTasks={session._signalSuggestedTasks}
																	signalSuggestedTasksTimestamp={session._signalSuggestedTasksTimestamp}
																	completionBundle={session._completionBundle}
																	completionBundleTimestamp={session._completionBundleTimestamp}
																	onKillSession={() => handleKillSession(session.sessionName)}
																	onInterrupt={() => handleInterrupt(session.sessionName)}
																	onContinue={() => handleContinue(session.sessionName)}
																	onAttachTerminal={() => handleAttachTerminal(session.sessionName)}
																	onSendInput={(input, type) => handleSendInput(session.sessionName, input, type)}
																	onTaskClick={handleTaskClick}
																	isHighlighted={highlightedAgent === session.agentName}
																	isExiting={session._isExiting}
																	onTaskDataChange={handleEpicLinkRefresh}
																/>
															</div>
														{/each}
													</div>
													{/if}
												</div>
											{/if}
										</div>
									</div>

									<!-- Sessions resize handle -->
									<ResizableDivider
										onResize={(deltaY) => handleSectionResize(project, 'sessions', deltaY)}
										class="bg-base-300/50 hover:bg-base-300"
									/>
								</div>
							{/if}

							<!-- Tasks Section (no header row - controlled by badge) -->
							{#if !taskState.collapsed}
							<div transition:slide={{ duration: 200 }}>
								<!-- Tasks content - fixed height, user can resize via divider -->
								<div
									class="overflow-hidden transition-all duration-200"
									style="height: {taskState.height}px;"
								>
									{#if isEmptyProject}
										<!-- Empty project state - show create task button -->
										<div class="h-full flex flex-col items-center justify-center p-8 text-center">
											<svg class="w-12 h-12 text-base-content/20 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
											</svg>
											<p class="text-sm text-base-content/50 mb-4">No tasks yet for this project</p>
											<button
												class="btn btn-primary btn-sm gap-2"
												onclick={() => handleCreateTaskForProject(project)}
											>
												<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
												</svg>
												Create Task
											</button>
										</div>
									{:else if filteredTasks.length > 0}
										<div class="h-full overflow-auto">
											<TaskTable
												tasks={filteredTasks}
												allTasks={allTasks}
												{agents}
												{reservations}
												completedTasksFromActiveSessions={getCompletedTasksForProject(project)}
												ontaskclick={handleTaskClick}
												onagentclick={handleAgentClick}
												hideProjectFilter={true}
												hideSearch={true}
											/>
										</div>
									{:else}
										<div class="h-full flex items-center justify-center text-base-content/50 text-sm">
											No tasks match "{searchTerm}"
										</div>
									{/if}
								</div>

								<!-- Tasks resize handle -->
								<ResizableDivider
									onResize={(deltaY) => handleSectionResize(project, 'tasks', deltaY)}
									class="bg-base-300/50 hover:bg-base-300"
								/>
							</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Task Detail Drawer -->
	<TaskDetailDrawer
		bind:taskId={selectedTaskId}
		bind:isOpen={drawerOpen}
	/>

	<!-- Hide Project Confirmation Modal -->
	{#if projectToHide}
		<div class="modal modal-open">
			<div class="modal-box max-w-md">
				<h3 class="font-bold text-lg">Hide Project</h3>
				<p class="py-4">
					Are you sure you want to hide <span class="font-semibold text-primary">{projectToHide}</span> from the dashboard?
				</p>
				<p class="text-sm text-base-content/70 bg-base-200 rounded p-3">
					This only hides the project from JAT's dashboard. The project's <code class="text-primary">.beads/</code> directory and all task data will remain untouched.
				</p>
				<p class="text-xs text-base-content/50 mt-3">
					To restore hidden projects, edit <code>~/.config/jat/dashboard-projects.json</code>
				</p>
				<div class="modal-action">
					<button
						class="btn btn-ghost"
						onclick={() => projectToHide = null}
						disabled={isHiding}
					>
						Cancel
					</button>
					<button
						class="btn btn-error"
						onclick={() => hideProject(projectToHide!)}
						disabled={isHiding}
					>
						{#if isHiding}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						Hide Project
					</button>
				</div>
			</div>
			<div class="modal-backdrop bg-black/50" onclick={() => projectToHide = null}></div>
		</div>
	{/if}
</div>
