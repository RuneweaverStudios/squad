<script lang="ts">
	/**
	 * Tasks3 Page
	 *
	 * Enhanced tasks view with project tabs instead of accordions.
	 * - Shows projects as clickable tabs in a horizontal bar
	 * - Only one project visible at a time (no accordion collapse)
	 * - Within each project, groups by epic (accordion behavior)
	 * - Maintains the aesthetic of /tasks2 while simplifying navigation
	 */

	import { onMount, onDestroy } from "svelte";
	import { slide } from "svelte/transition";
	import { goto } from "$app/navigation";
	import SortDropdown from "$lib/components/SortDropdown.svelte";
	import TasksActive from "$lib/components/sessions/TasksActive.svelte";
	import TasksPaused from "$lib/components/sessions/TasksPaused.svelte";
	import TasksOpen from "$lib/components/sessions/TasksOpen.svelte";
	import ProjectNotes from "$lib/components/sessions/ProjectNotes.svelte";
	import TaskIdBadge from "$lib/components/TaskIdBadge.svelte";
	import WorkingAgentBadge from "$lib/components/WorkingAgentBadge.svelte";
	import { fetchAndGetProjectColors } from "$lib/utils/projectColors";
	import { openTaskDetailDrawer, openProjectDrawer, projectCreatedSignal, openTaskDrawer } from "$lib/stores/drawerStore";
	import {
		getProjectFromTaskId,
		buildEpicChildMap,
		getParentEpicId,
	} from "$lib/utils/projectUtils";
	import { cleanupCollapsedEpics } from "$lib/stores/preferences.svelte";

	interface TmuxSession {
		name: string;
		created: string;
		attached: boolean;
		type: "agent" | "server" | "ide" | "other";
		project?: string;
	}

	interface Task {
		id: string;
		title: string;
		description?: string;
		status: string;
		priority: number;
		issue_type?: string;
		assignee?: string;
		labels?: string[];
		created_at?: string;
		depends_on?: Array<{ id: string; [key: string]: any }>;
	}

	interface AgentTask {
		id: string;
		status: string;
		issue_type?: string;
		title?: string;
		priority?: number;
		description?: string;
	}

	interface AgentSessionInfo {
		tokens: number;
		cost: number;
		activityState?: string;
		activityStateTimestamp?: number;
	}

	// Sessions state
	let sessions = $state<TmuxSession[]>([]);
	let sessionsLoading = $state(true);
	let sessionsError = $state<string | null>(null);
	let pollInterval: ReturnType<typeof setInterval> | null = null;

	// Open tasks state
	let openTasks = $state<Task[]>([]);
	let allTasks = $state<Task[]>([]); // For epic mapping (includes closed)
	let tasksLoading = $state(true);
	let tasksError = $state<string | null>(null);

	// Agent mappings
	let agentProjects = $state<Map<string, string>>(new Map());
	let agentTasks = $state<Map<string, AgentTask>>(new Map());
	let agentSessionInfo = $state<Map<string, AgentSessionInfo>>(new Map());

	// Project colors
	let projectColors = $state<Record<string, string>>({});

	// Project notes
	let projectNotes = $state<Record<string, string>>({});
	let projectNotesHeight = $state<Record<string, number>>({});

	// Configured projects (from projects.json - includes empty projects)
	let configuredProjects = $state<string[]>([]);

	// Recoverable sessions state
	interface RecoverableSession {
		agentName: string;
		sessionId: string | null;
		resumable: boolean;
		taskId: string;
		taskTitle: string;
		taskPriority: number;
		project: string;
	}
	let recoverableSessions = $state<RecoverableSession[]>([]);

	// Spawn loading state
	let spawningTaskId = $state<string | null>(null);

	// Selected project tab (instead of collapsed projects)
	let selectedProject = $state<string | null>(null);

	// Subsection collapse state per project (sessions/paused/tasks)
	type SubsectionType = "sessions" | "paused" | "tasks";
	let collapsedSubsections = $state<Map<string, Set<SubsectionType>>>(
		new Map(),
	);

	// Epic collapse state (independent: each group can be expanded/collapsed separately)
	// Uses Set of epic keys per project. "standalone" key used for tasks without an epic.
	let expandedEpicsByProject = $state<Map<string, Set<string>>>(new Map());

	// Sort configuration for sessions
	type SessionSortOption = "state" | "project" | "created";
	type SessionSortDirection = "asc" | "desc";

	interface SessionSortConfig {
		value: string;
		label: string;
		icon: string;
		defaultDir: SessionSortDirection;
	}

	let sortBy = $state<SessionSortOption>("state");
	let sortDir = $state<SessionSortDirection>("asc");

	// State priority for sorting
	const STATE_PRIORITY: Record<string, number> = {
		"ready-for-review": 0,
		"needs-input": 1,
		completed: 2,
		working: 3,
		completing: 4,
		starting: 5,
		recovering: 6,
		compacting: 7,
		"auto-proceeding": 8,
		idle: 9,
	};

	const SORT_OPTIONS: SessionSortConfig[] = [
		{ value: "state", label: "State", icon: "🎯", defaultDir: "asc" },
		{ value: "project", label: "Project", icon: "📁", defaultDir: "asc" },
		{ value: "created", label: "Created", icon: "⏱️", defaultDir: "desc" },
	];

	let projectOrder = $state<string[]>([]);

	// Helpers
	function categorizeSession(name: string): {
		type: TmuxSession["type"];
		project?: string;
	} {
		if (name.startsWith("jat-")) {
			const agentName = name.slice(4);
			if (agentName.startsWith("pending-")) {
				return { type: "agent", project: undefined };
			}
			const project = agentProjects.get(agentName);
			return { type: "agent", project };
		}
		if (name.startsWith("server-")) {
			const project = name.slice(7);
			return { type: "server", project };
		}
		if (name === "jat-ide" || name.startsWith("jat-ide")) {
			return { type: "ide" };
		}
		return { type: "other" };
	}

	function getAgentName(sessionName: string): string {
		if (sessionName.startsWith("jat-")) {
			return sessionName.slice(4);
		}
		return sessionName;
	}

	function getSessionStatePriority(session: TmuxSession): number {
		if (session.type !== "agent") return 99;
		const agentName = getAgentName(session.name);
		const state = agentSessionInfo.get(agentName)?.activityState || "idle";
		return STATE_PRIORITY[state] ?? 99;
	}

	// Build epic-child map from all tasks
	const epicChildMap = $derived(buildEpicChildMap(allTasks));

	// Get all unique projects from sessions, tasks, and configured projects
	const allProjects = $derived.by(() => {
		const projects = new Set<string>();

		// Add configured projects (includes empty projects)
		for (const project of configuredProjects) {
			projects.add(project);
		}

		// Add projects from sessions
		for (const session of sessions) {
			if (session.project) {
				projects.add(session.project);
			}
		}

		// Add projects from tasks
		for (const task of openTasks) {
			const project = getProjectFromTaskId(task.id);
			if (project) {
				projects.add(project);
			}
		}

		// Sort by projectOrder, then alphabetically
		return Array.from(projects).sort((a, b) => {
			const indexA = projectOrder.indexOf(a);
			const indexB = projectOrder.indexOf(b);
			const orderA = indexA === -1 ? 9999 : indexA;
			const orderB = indexB === -1 ? 9999 : indexB;
			if (orderA !== orderB) return orderA - orderB;
			return a.localeCompare(b);
		});
	});

	// Auto-select first project when projects change
	// NOTE: All smart defaults for subsections are handled in selectProject() to avoid
	// infinite effect loops. Do NOT add a separate effect for subsection defaults.
	$effect(() => {
		const projects = allProjects;
		if (projects.length > 0 && !selectedProject) {
			selectProject(projects[0]);
		} else if (
			projects.length > 0 &&
			selectedProject &&
			!projects.includes(selectedProject)
		) {
			// Selected project no longer exists, select first
			selectProject(projects[0]);
		}
	});

	// Group sessions by project
	const sessionsByProject = $derived.by(() => {
		const grouped = new Map<string, TmuxSession[]>();

		for (const session of sessions.filter((s) => s.type === "agent")) {
			const project = session.project || "Unknown";
			if (!grouped.has(project)) {
				grouped.set(project, []);
			}
			grouped.get(project)!.push(session);
		}

		// Sort sessions within each project
		for (const [project, projectSessions] of grouped) {
			projectSessions.sort((a, b) => {
				const multiplier = sortDir === "asc" ? 1 : -1;

				if (sortBy === "state") {
					const stateA = getSessionStatePriority(a);
					const stateB = getSessionStatePriority(b);
					if (stateA !== stateB) {
						return (stateA - stateB) * multiplier;
					}
				}

				const createdA = new Date(a.created).getTime();
				const createdB = new Date(b.created).getTime();
				return (createdB - createdA) * multiplier;
			});
		}

		return grouped;
	});

	// Group sessions by epic within a project
	function getSessionsByEpic(
		projectSessions: TmuxSession[],
	): Map<string | null, TmuxSession[]> {
		const grouped = new Map<string | null, TmuxSession[]>();

		for (const session of projectSessions) {
			const agentName = getAgentName(session.name);
			const task = agentTasks.get(agentName);
			const epicId = task ? getParentEpicId(task.id, epicChildMap) : null;

			if (!grouped.has(epicId)) {
				grouped.set(epicId, []);
			}
			grouped.get(epicId)!.push(session);
		}

		return grouped;
	}

	// Group tasks by project
	const tasksByProject = $derived.by(() => {
		const grouped = new Map<string, Task[]>();

		for (const task of openTasks) {
			const project = getProjectFromTaskId(task.id) || "Unknown";
			if (!grouped.has(project)) {
				grouped.set(project, []);
			}
			grouped.get(project)!.push(task);
		}

		return grouped;
	});

	// Group tasks by epic within a project (only open tasks)
	function getTasksByEpic(projectTasks: Task[]): Map<string | null, Task[]> {
		const grouped = new Map<string | null, Task[]>();

		for (const task of projectTasks) {
			// Don't include epics themselves in their own group
			if (task.issue_type === "epic") {
				continue;
			}

			// Only include open tasks (not in_progress, blocked, or closed)
			if (task.status !== "open") {
				continue;
			}

			const epicId = getParentEpicId(task.id, epicChildMap);

			if (!grouped.has(epicId)) {
				grouped.set(epicId, []);
			}
			grouped.get(epicId)!.push(task);
		}

		return grouped;
	}

	// Get epic task by ID
	function getEpicTask(epicId: string): Task | undefined {
		return allTasks.find((t) => t.id === epicId);
	}

	// Toggle epic collapse
	function toggleEpicCollapse(
		project: string,
		epicId: string | null,
		subsection: "sessions" | "tasks" = "tasks",
	) {
		// Each subsection (sessions/tasks) has independent expand state
		const key = epicId
			? `${subsection}-${epicId}`
			: `${subsection}-standalone`;
		let expanded = expandedEpicsByProject.get(project);

		if (!expanded) {
			// Initialize with default state: standalone tasks expanded, epic groups collapsed
			expanded = new Set<string>();
			expanded.add("sessions-standalone");
			expanded.add("tasks-standalone");
		}

		if (expanded.has(key)) {
			// Currently expanded, collapse it
			expanded.delete(key);
		} else {
			// Currently collapsed, expand it
			expanded.add(key);
		}

		expandedEpicsByProject.set(project, expanded);
		expandedEpicsByProject = new Map(expandedEpicsByProject);
	}

	function isEpicExpanded(
		project: string,
		epicId: string | null,
		subsection: "sessions" | "tasks" = "tasks",
	): boolean {
		// Each subsection (sessions/tasks) has independent expand state
		const key = epicId
			? `${subsection}-${epicId}`
			: `${subsection}-standalone`;
		const expanded = expandedEpicsByProject.get(project);
		if (!expanded) {
			// Default: standalone tasks are expanded, epic groups are collapsed
			return epicId === null;
		}
		return expanded.has(key);
	}

	// Subsection collapse handlers
	function toggleSubsectionCollapse(
		project: string,
		subsection: SubsectionType,
	) {
		const projectSubsections =
			collapsedSubsections.get(project) || new Set();
		if (projectSubsections.has(subsection)) {
			projectSubsections.delete(subsection);
		} else {
			projectSubsections.add(subsection);
		}
		collapsedSubsections.set(project, projectSubsections);
		collapsedSubsections = new Map(collapsedSubsections);
		saveCollapseState();
	}

	function isSubsectionCollapsed(
		project: string,
		subsection: SubsectionType,
	): boolean {
		return collapsedSubsections.get(project)?.has(subsection) ?? false;
	}

	// Persist collapse state
	function saveCollapseState() {
		try {
			// Save selected project tab
			if (selectedProject) {
				localStorage.setItem(
					"tasks3-selected-project",
					selectedProject,
				);
			}
			// Save subsection collapse state
			const subsectionData: Record<string, string[]> = {};
			for (const [project, subsections] of collapsedSubsections) {
				subsectionData[project] = Array.from(subsections);
			}
			localStorage.setItem(
				"tasks3-collapsed-subsections",
				JSON.stringify(subsectionData),
			);
		} catch {
			// Ignore storage errors
		}
	}

	function loadCollapseState() {
		try {
			// Load selected project tab
			const savedProject = localStorage.getItem(
				"tasks3-selected-project",
			);
			if (savedProject) {
				selectedProject = savedProject;
			}
			// Load subsection collapse state
			const subsectionSaved = localStorage.getItem(
				"tasks3-collapsed-subsections",
			);
			if (subsectionSaved) {
				const data = JSON.parse(subsectionSaved) as Record<
					string,
					string[]
				>;
				const map = new Map<string, Set<SubsectionType>>();
				for (const [project, subsections] of Object.entries(data)) {
					map.set(project, new Set(subsections as SubsectionType[]));
				}
				collapsedSubsections = map;
			}
		} catch {
			// Ignore storage errors
		}
	}

	// API calls
	async function fetchProjectOrder() {
		try {
			const response = await fetch(
				"/api/projects?visible=true&stats=true",
			);
			if (!response.ok) return;
			const data = await response.json();
			projectOrder = (data.projects || []).map(
				(p: { name: string }) => p.name,
			);
		} catch {
			// Silent fail
		}
	}

	async function fetchAgentProjects() {
		try {
			const response = await fetch("/api/work");
			if (!response.ok) return;
			const data = await response.json();

			const projectMap = new Map<string, string>();
			const taskMap = new Map<string, AgentTask>();
			const sessionInfoMap = new Map<string, AgentSessionInfo>();

			for (const session of data.sessions || []) {
				if (!session.agentName) continue;

				sessionInfoMap.set(session.agentName, {
					tokens: session.tokens || 0,
					cost: session.cost || 0,
					activityState: session.sessionState || undefined,
					activityStateTimestamp: Date.now(),
				});

				const taskSource = session.task || session.lastCompletedTask;
				if (taskSource?.id) {
					const project = getProjectFromTaskId(taskSource.id);
					if (project) {
						projectMap.set(session.agentName, project);
					}
					taskMap.set(session.agentName, {
						id: taskSource.id,
						status: taskSource.status || "open",
						issue_type: taskSource.issue_type,
						title: taskSource.title,
						priority: taskSource.priority,
						description: taskSource.description,
					});
				} else {
					// No task — override idle state to 'planning'
					const info = sessionInfoMap.get(session.agentName);
					if (info && (!info.activityState || info.activityState === 'idle')) {
						info.activityState = 'planning';
					}
				}
			}
			agentProjects = projectMap;
			agentTasks = taskMap;
			agentSessionInfo = sessionInfoMap;
		} catch {
			// Silent fail
		}
	}

	async function fetchSessions() {
		try {
			const response = await fetch("/api/sessions?filter=all");
			if (!response.ok) {
				throw new Error("Failed to fetch sessions");
			}
			const data = await response.json();

			sessions = (data.sessions || []).map(
				(s: {
					name: string;
					created: string;
					attached: boolean;
					project?: string;
				}) => {
					const { type, project: categorizedProject } =
						categorizeSession(s.name);
					return {
						...s,
						type,
						project: s.project || categorizedProject,
					};
				},
			);
			sessionsError = null;
		} catch (err) {
			sessionsError =
				err instanceof Error ? err.message : "Unknown error";
		} finally {
			sessionsLoading = false;
		}
	}

	async function fetchTasks() {
		try {
			// Single fetch for all tasks - used for both display (openTasks) and epic mapping (allTasks)
			const response = await fetch("/api/tasks");
			if (!response.ok) {
				throw new Error("Failed to fetch tasks");
			}
			const data = await response.json();
			const tasks = data.tasks || [];
			// Set both variables from the same data to avoid duplicate fetches
			openTasks = tasks;
			allTasks = tasks;
			tasksError = null;

			// Clean up stale collapsed epic IDs to prevent memory leak
			// (removes IDs for tasks that no longer exist)
			const existingIds = new Set(tasks.map((t: Task) => t.id));
			cleanupCollapsedEpics(existingIds);
		} catch (err) {
			tasksError = err instanceof Error ? err.message : "Unknown error";
		} finally {
			tasksLoading = false;
		}
	}

	async function fetchProjectColors() {
		try {
			const colors = await fetchAndGetProjectColors();
			projectColors = colors;
		} catch (err) {
			console.warn("Failed to fetch project colors:", err);
		}
	}

	async function fetchProjectNotes() {
		try {
			const response = await fetch("/api/projects?visible=true");
			if (!response.ok) return;
			const data = await response.json();
			const notes: Record<string, string> = {};
			const heights: Record<string, number> = {};
			const projectKeys: string[] = [];
			for (const project of data.projects || []) {
				// Skip hidden projects
				if (project.hidden) continue;

				const projectKey = project.key || project.name;
				if (projectKey) {
					projectKeys.push(projectKey);
					if (project.notes) {
						notes[projectKey] = project.notes;
					}
					if (project.notesHeight) {
						heights[projectKey] = project.notesHeight;
					}
				}
			}
			projectNotes = notes;
			projectNotesHeight = heights;
			configuredProjects = projectKeys;
		} catch (err) {
			console.warn("Failed to fetch project notes:", err);
		}
	}

	async function fetchRecoverableSessions() {
		try {
			const response = await fetch("/api/recovery");
			if (!response.ok) return;
			const data = await response.json();
			recoverableSessions = data.sessions || [];
		} catch {
			// Silent fail
		}
	}

	// Get recoverable session count for a project
	function getProjectRecoverableCount(project: string): number {
		return recoverableSessions.filter(
			(s) => s.project.toLowerCase() === project.toLowerCase(),
		).length;
	}

	// Get paused sessions for a project
	function getProjectPausedSessions(project: string): RecoverableSession[] {
		return recoverableSessions.filter(
			(s) => s.project.toLowerCase() === project.toLowerCase(),
		);
	}

	async function fetchAllData() {
		await Promise.all([
			fetchProjectOrder(),
			fetchAgentProjects(),
			fetchProjectColors(),
			fetchProjectNotes(),
			fetchTasks(),
			fetchRecoverableSessions(),
			fetchSessions(),
		]);
	}

	// Actions
	async function killSession(sessionName: string) {
		try {
			const response = await fetch(
				`/api/sessions/${encodeURIComponent(sessionName)}`,
				{
					method: "DELETE",
				},
			);
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || "Failed to kill session");
			}
			await fetchSessions();
		} catch (err) {
			console.error("Failed to kill session:", err);
		}
	}

	async function attachSession(sessionName: string) {
		try {
			const response = await fetch(
				`/api/work/${encodeURIComponent(sessionName)}/attach`,
				{
					method: "POST",
				},
			);
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Failed to attach session");
			}
		} catch (err) {
			console.error("Failed to attach session:", err);
		}
	}

	async function resumeSession(agentName: string, sessionId: string) {
		try {
			const response = await fetch(
				`/api/sessions/${encodeURIComponent(agentName)}/resume`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ session_id: sessionId }),
				},
			);
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Failed to resume session");
			}
			// Refresh data after resume
			await fetchAllData();
		} catch (err) {
			console.error("Failed to resume session:", err);
		}
	}

	async function restartTask(taskId: string) {
		try {
			const response = await fetch("/api/work/spawn", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ taskId, autoStart: true }),
			});
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Failed to restart task");
			}
			await fetchAllData();
		} catch (err) {
			console.error("Failed to restart task:", err);
		}
	}

	async function unassignTask(taskId: string, agentName: string) {
		try {
			const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: "open", assignee: "" }),
			});
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Failed to unassign task");
			}
			await fetchAllData();
		} catch (err) {
			console.error("Failed to unassign task:", err);
		}
	}

	async function spawnTask(task: Task, selection?: { agentId: string | null; model: string | null }) {
		spawningTaskId = task.id;
		try {
			const body: Record<string, any> = {
				taskId: task.id,
				autoStart: true,
			};

			// Add agent/model selection if provided (from Alt+click agent picker)
			if (selection) {
				if (selection.agentId) body.agentId = selection.agentId;
				if (selection.model) body.model = selection.model;
			}

			const response = await fetch("/api/work/spawn", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Failed to spawn task");
			}

			await fetchAllData();
		} catch (err) {
			console.error("Failed to spawn task:", err);
		} finally {
			spawningTaskId = null;
		}
	}

	function handleSortChange(value: string, dir: "asc" | "desc") {
		sortBy = value as SessionSortOption;
		sortDir = dir;
	}

	// Count helpers
	function getProjectSessionCount(project: string): number {
		return sessionsByProject.get(project)?.length || 0;
	}

	function getProjectTaskCount(project: string): number {
		const tasks = tasksByProject.get(project) || [];
		// Only count open tasks (exclude epics and non-open status)
		return tasks.filter(
			(t) => t.status === "open" && t.issue_type !== "epic",
		).length;
	}

	// Handle tab selection
	function selectProject(project: string) {
		selectedProject = project;

		const projectSessions = sessionsByProject.get(project) || [];
		const projectTasks = tasksByProject.get(project) || [];
		const projectPausedSessions = getProjectPausedSessions(project);
		const hasActiveSessions = projectSessions.length > 0;
		const hasPausedSessions = projectPausedSessions.length > 0;
		const hasOpenTasks =
			projectTasks.filter(
				(t) => t.status === "open" && t.issue_type !== "epic",
			).length > 0;

		// Only apply default subsection collapse logic if this project doesn't have saved state
		// This preserves user's manual collapse/expand choices
		if (!collapsedSubsections.has(project)) {
			// Auto-expand appropriate subsection based on what's available
			// Priority: Active > Paused > Open for default expansion
			// Paused section is ALWAYS expanded if there are paused sessions
			const projectSubsections = new Set<SubsectionType>();

			if (hasActiveSessions) {
				// Expand Active Tasks (sessions not in collapsed set)
				// Collapse Open Tasks to focus on active work
				projectSubsections.add("tasks");
				// Keep paused expanded if there are paused sessions
				if (!hasPausedSessions) {
					projectSubsections.add("paused");
				}
			} else if (hasPausedSessions) {
				// No active sessions but have paused - expand paused, collapse open
				projectSubsections.add("tasks");
			} else if (hasOpenTasks) {
				// No active or paused sessions, so expand Open Tasks
				projectSubsections.add("paused");
			}
			// If nothing has content, sections simply won't render

			collapsedSubsections.set(project, projectSubsections);
			collapsedSubsections = new Map(collapsedSubsections);
		}

		// Also expand groups within the appropriate subsection
		// (expandedEpicsByProject is not persisted, so always apply defaults)
		if (!expandedEpicsByProject.has(project)) {
			const epicExpanded = new Set<string>();
			if (hasActiveSessions) {
				// Expand standalone tasks in Active Tasks section
				epicExpanded.add("sessions-standalone");
				// Also expand epic groups that have active sessions
				// so agents are always visible (not hidden behind collapsed headers)
				const sessionsByEpic = getSessionsByEpic(projectSessions);
				for (const [epicId, epicSessions] of sessionsByEpic) {
					if (epicId && epicSessions.length > 0) {
						epicExpanded.add(`sessions-${epicId}`);
					}
				}
			} else if (hasOpenTasks) {
				// Expand standalone tasks in Open Tasks section
				epicExpanded.add("tasks-standalone");
			}
			expandedEpicsByProject.set(project, epicExpanded);
			expandedEpicsByProject = new Map(expandedEpicsByProject);
		}

		saveCollapseState();
	}

	onMount(() => {
		loadCollapseState();
		fetchAllData();

		// Auto-open drawer for new users from /setup
		const params = new URL(window.location.href).searchParams;
		if (params.get('welcome') === 'true') {
			const project = params.get('project') || undefined;
			openTaskDrawer(project);
			// Clean URL without triggering navigation
			history.replaceState({}, '', '/tasks');
		}

		pollInterval = setInterval(() => {
			// Skip fetch when page is hidden to avoid Content-Length mismatch errors
			if (document.visibilityState === 'hidden') return;
			fetchAllData();
		}, 5000);
	});

	onDestroy(() => {
		if (pollInterval) {
			clearInterval(pollInterval);
		}
	});

	// Refresh data when a new project is created via CreateProjectDrawer.
	// Use Svelte's $-prefix auto-subscription instead of raw .subscribe() inside $effect.
	$effect(() => {
		const count = $projectCreatedSignal;
		// Only refetch if signal has been triggered (not on initial mount)
		if (count > 0) {
			fetchAllData();
		}
	});
</script>

<svelte:head>
	<title>Tasks (Tabbed) | JAT IDE</title>
	<meta
		name="description"
		content="Task management with project tabs for AI coding agents."
	/>
	<link rel="icon" href="/favicons/tasks.svg" />
</svelte:head>

<div class="tasks-page">
	<!-- Loading State -->
	{#if sessionsLoading && tasksLoading && sessions.length === 0 && openTasks.length === 0}
		<div class="loading-container">
			<!-- Project Tabs Skeleton -->
			<div class="project-tabs-skeleton">
				{#each [1, 2, 3] as _}
					<div class="skeleton-tab">
						<div class="skeleton h-4 w-16 rounded mb-2"></div>
						<div class="flex gap-1">
							<div class="skeleton h-5 w-5 rounded-full"></div>
							<div class="skeleton h-5 w-5 rounded-full"></div>
						</div>
					</div>
				{/each}
			</div>

			<!-- Active Tasks Section Skeleton -->
			<div class="section-skeleton">
				<div class="skeleton-section-header">
					<div class="skeleton h-4 w-4 rounded"></div>
					<div class="skeleton h-5 w-28 rounded"></div>
					<div class="skeleton h-5 w-6 rounded-full"></div>
				</div>
				<div class="skeleton-subsection">
					<div class="skeleton-subsection-header">
						<div class="skeleton h-4 w-32 rounded"></div>
						<div class="flex gap-1 ml-2">
							<div class="skeleton h-5 w-5 rounded-full"></div>
						</div>
					</div>
					<div class="skeleton-task-rows">
						{#each [1, 2] as __}
							<div class="skeleton-task-row">
								<div class="skeleton h-5 w-16 rounded"></div>
								<div
									class="skeleton h-6 w-6 rounded-full"
								></div>
								<div class="flex-1 flex flex-col gap-1">
									<div
										class="skeleton h-4 w-48 rounded"
									></div>
									<div
										class="skeleton h-3 w-72 rounded"
									></div>
								</div>
								<div
									class="skeleton h-5 w-16 rounded-full"
								></div>
							</div>
						{/each}
					</div>
				</div>
			</div>

			<!-- Open Tasks Section Skeleton -->
			<div class="section-skeleton">
				<div class="skeleton-section-header">
					<div class="skeleton h-4 w-4 rounded"></div>
					<div class="skeleton h-5 w-24 rounded"></div>
					<div class="skeleton h-5 w-6 rounded-full"></div>
				</div>
				<div class="skeleton-task-rows">
					{#each [1, 2, 3] as __}
						<div class="skeleton-task-row">
							<div class="skeleton h-5 w-16 rounded"></div>
							<div class="flex-1 flex flex-col gap-1">
								<div class="skeleton h-4 w-40 rounded"></div>
								<div class="skeleton h-3 w-64 rounded"></div>
							</div>
							<div class="skeleton h-7 w-7 rounded-full"></div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{:else if sessionsError && tasksError}
		<div class="error-state">
			<span>Failed to load data: {sessionsError || tasksError}</span>
			<button onclick={() => fetchAllData()}>Retry</button>
		</div>
	{:else if allProjects.length === 0}
		<div class="empty-state">
			<span>No projects with active sessions or open tasks</span>
		</div>
	{:else}
		<!-- Project Tabs -->
		<div class="project-tabs">
			{#each allProjects as project (project)}
				{@const projectColor =
					projectColors[project] || "oklch(0.70 0.15 200)"}
				{@const isActive = selectedProject === project}
				{@const sessionCount = getProjectSessionCount(project)}
				{@const taskCount = getProjectTaskCount(project)}
				{@const recoverableCount = getProjectRecoverableCount(project)}
				{@const projectAgentSessions =
					sessionsByProject.get(project) || []}
				<button
					class="project-tab"
					class:active={isActive}
					style="--project-color: {projectColor}"
					onclick={() => selectProject(project)}
				>
					<span class="project-tab-name mt-1"
						>{project.toUpperCase()}</span
					>
					{#if projectAgentSessions.length > 0}
						<div class="project-tab-agents mt-2.5">
							{#each projectAgentSessions as session}
								{@const agentName = getAgentName(session.name)}
								<WorkingAgentBadge
									name={agentName}
									size={20}
									variant="avatar"
									isWorking={true}
									sessionState={agentSessionInfo.get(agentName)?.activityState}
								/>
							{/each}
						</div>
					{/if}
					<div class="project-tab-counts mt-1.5">
						<!-- {#if sessionCount > 0}
							<span class="tab-count sessions">{sessionCount} active</span>
						{/if} -->
						{#if recoverableCount > 0}
							<span
								class="tab-count paused"
								title="{recoverableCount} paused session{recoverableCount !==
								1
									? 's'
									: ''}">{recoverableCount} paused</span
							>
						{/if}
						{#if taskCount > 0 && sessionCount === 0}
							<span class="tab-count tasks">{taskCount} open</span
							>
						{/if}
					</div>
				</button>
			{/each}
			<!-- Add Project Button -->
			<button
				class="add-project-tab"
				onclick={() => openProjectDrawer()}
				title="Add new project"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
					class="add-project-icon"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 4.5v15m7.5-7.5h-15"
					/>
				</svg>
			</button>
		</div>

		<!-- Selected Project Content -->
		{#if selectedProject}
			{@const projectSessions =
				sessionsByProject.get(selectedProject) || []}
			{@const projectTasks = tasksByProject.get(selectedProject) || []}
			{@const projectPausedSessions =
				getProjectPausedSessions(selectedProject)}
			{@const sessionsByEpic = getSessionsByEpic(projectSessions)}
			{@const tasksByEpic = getTasksByEpic(projectTasks)}
			{@const projectColor =
				projectColors[selectedProject] || "oklch(0.70 0.15 200)"}

			<section
				class="project-content"
				style="--project-color: {projectColor}"
			>
				<!-- Project Notes Section -->
				<ProjectNotes
					projectName={selectedProject}
					notes={projectNotes[selectedProject] || ""}
					{projectColor}
				/>

				<!-- Active Sessions Section -->
				{#if projectSessions.length > 0}
					<div class="subsection bg-base-100">
						<button
							class="subsection-header"
							onclick={() =>
								toggleSubsectionCollapse(
									selectedProject!,
									"sessions",
								)}
							aria-expanded={!isSubsectionCollapsed(
								selectedProject!,
								"sessions",
							)}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="2"
								stroke="currentColor"
								class="subsection-collapse-icon"
								class:collapsed={isSubsectionCollapsed(
									selectedProject!,
									"sessions",
								)}
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M19 9l-7 7-7-7"
								/>
							</svg>
							<span>Active Tasks</span>
							<span class="subsection-count"
								>{projectSessions.length}</span
							>
						</button>

						{#if !isSubsectionCollapsed(selectedProject!, "sessions")}
							<!-- Group by Epic - sorted: epics by priority first, standalone last -->
							{@const sortedSessionEntries = Array.from(
								sessionsByEpic.entries(),
							).sort((a, b) => {
								const [epicIdA] = a;
								const [epicIdB] = b;
								// Standalone (null) always goes last
								if (epicIdA === null) return 1;
								if (epicIdB === null) return -1;
								// Sort epics by priority (lower = higher priority)
								const epicA = getEpicTask(epicIdA);
								const epicB = getEpicTask(epicIdB);
								const priorityA = epicA?.priority ?? 99;
								const priorityB = epicB?.priority ?? 99;
								return priorityA - priorityB;
							})}
							{#each sortedSessionEntries as [epicId, epicSessions] (epicId ?? "standalone")}
								{@const epic = epicId
									? getEpicTask(epicId)
									: null}
								{@const isExpanded = isEpicExpanded(
									selectedProject!,
									epicId,
									"sessions",
								)}

								{#if epicId && epicSessions.length > 0}
									<!-- Epic Group - only show if there are active sessions -->
									<div class="epic-group">
										<button
											class="epic-header"
											onclick={() =>
												toggleEpicCollapse(
													selectedProject!,
													epicId,
													"sessions",
												)}
											aria-expanded={isExpanded}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												fill="none"
												viewBox="0 0 24 24"
												stroke-width="2"
												stroke="currentColor"
												class="collapse-icon small"
												class:collapsed={!isExpanded}
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M19 9l-7 7-7-7"
												/>
											</svg>
											<TaskIdBadge
												task={epic || {
													id: epicId,
													status: "open",
													issue_type: "epic",
												}}
												size="sm"
											/>
											<span class="epic-title"
												>{epic?.title ||
													"Untitled Epic"}</span
											>
											<div class="epic-agents">
												{#each epicSessions as session}
													<WorkingAgentBadge
														name={getAgentName(
															session.name,
														)}
														size={18}
														variant="avatar"
														isWorking={true}
													/>
												{/each}
											</div>
											<span class="epic-count"
												>{epicSessions.length} active</span
											>
										</button>

										{#if isExpanded}
											<div
												class="epic-content"
												transition:slide={{
													duration: 200,
												}}
											>
												<TasksActive
													sessions={epicSessions}
													{agentTasks}
													{agentSessionInfo}
													{agentProjects}
													{projectColors}
													onKillSession={killSession}
													onAttachSession={attachSession}
													onViewTask={(taskId) =>
														openTaskDetailDrawer(
															taskId,
														)}
												/>
											</div>
										{/if}
									</div>
								{:else if epicSessions.length > 0}
									<!-- Standalone Sessions (no epic) - collapsible group like epics -->
									{@const isStandaloneExpanded =
										isEpicExpanded(
											selectedProject!,
											null,
											"sessions",
										)}
									<div class="epic-group standalone">
										<button
											class="epic-header"
											onclick={() =>
												toggleEpicCollapse(
													selectedProject!,
													null,
													"sessions",
												)}
											aria-expanded={isStandaloneExpanded}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												fill="none"
												viewBox="0 0 24 24"
												stroke-width="2"
												stroke="currentColor"
												class="collapse-icon small"
												class:collapsed={!isStandaloneExpanded}
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M19 9l-7 7-7-7"
												/>
											</svg>
											<span class="standalone-icon"
												>📋</span
											>
											<span class="epic-title font-mono"
												>STANDALONE TASKS</span
											>
											<div class="epic-agents">
												{#each epicSessions as session}
													<WorkingAgentBadge
														name={getAgentName(
															session.name,
														)}
														size={18}
														variant="avatar"
														isWorking={true}
													/>
												{/each}
											</div>
											<span class="epic-count"
												>{epicSessions.length} active</span
											>
										</button>

										{#if isStandaloneExpanded}
											<div
												class="epic-content"
												transition:slide={{
													duration: 200,
												}}
											>
												<TasksActive
													sessions={epicSessions}
													{agentTasks}
													{agentSessionInfo}
													{agentProjects}
													{projectColors}
													onKillSession={killSession}
													onAttachSession={attachSession}
													onViewTask={(taskId) =>
														openTaskDetailDrawer(
															taskId,
														)}
												/>
											</div>
										{/if}
									</div>
								{/if}
							{/each}
						{/if}
					</div>
				{/if}

				<!-- Paused Sessions Section -->
				{#if projectPausedSessions.length > 0}
					<div class="subsection paused-subsection">
						<button
							class="subsection-header"
							onclick={() =>
								toggleSubsectionCollapse(
									selectedProject!,
									"paused",
								)}
							aria-expanded={!isSubsectionCollapsed(
								selectedProject!,
								"paused",
							)}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="2"
								stroke="currentColor"
								class="subsection-collapse-icon"
								class:collapsed={isSubsectionCollapsed(
									selectedProject!,
									"paused",
								)}
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M19 9l-7 7-7-7"
								/>
							</svg>
							<span>Paused Sessions</span>
							<div class="subsection-right">
								<div class="paused-agents">
									{#each projectPausedSessions as session}
										<WorkingAgentBadge
											name={session.agentName}
											size={18}
											variant="avatar"
											isWorking={false}
										/>
									{/each}
								</div>
								<span class="subsection-count-inline"
									>{projectPausedSessions.length}</span
								>
							</div>
						</button>

						{#if !isSubsectionCollapsed(selectedProject!, "paused")}
							<div
								class="paused-content"
								transition:slide={{ duration: 200 }}
							>
								<TasksPaused
									sessions={projectPausedSessions}
									{projectColors}
									onResumeSession={resumeSession}
									onRestartTask={restartTask}
									onUnassignTask={unassignTask}
									onViewTask={(taskId) =>
										openTaskDetailDrawer(taskId)}
								/>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Open Tasks Section -->
				{#if tasksByEpic.size > 0}
					<div class="subsection">
						<button
							class="subsection-header"
							onclick={() =>
								toggleSubsectionCollapse(
									selectedProject!,
									"tasks",
								)}
							aria-expanded={!isSubsectionCollapsed(
								selectedProject!,
								"tasks",
							)}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="2"
								stroke="currentColor"
								class="subsection-collapse-icon"
								class:collapsed={isSubsectionCollapsed(
									selectedProject!,
									"tasks",
								)}
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M19 9l-7 7-7-7"
								/>
							</svg>
							<span>Open Tasks</span>
							<span class="subsection-count"
								>{Array.from(tasksByEpic.values()).reduce(
									(sum, tasks) => sum + tasks.length,
									0,
								)}</span
							>
						</button>

						{#if !isSubsectionCollapsed(selectedProject!, "tasks")}
							<!-- Group by Epic - sorted: epics by priority first, standalone last -->
							{@const sortedTaskEntries = Array.from(
								tasksByEpic.entries(),
							).sort((a, b) => {
								const [epicIdA] = a;
								const [epicIdB] = b;
								// Standalone (null) always goes last
								if (epicIdA === null) return 1;
								if (epicIdB === null) return -1;
								// Sort epics by priority (lower = higher priority)
								const epicA = getEpicTask(epicIdA);
								const epicB = getEpicTask(epicIdB);
								const priorityA = epicA?.priority ?? 99;
								const priorityB = epicB?.priority ?? 99;
								return priorityA - priorityB;
							})}
							{#each sortedTaskEntries as [epicId, epicTasks] (epicId ?? "standalone")}
								{@const epic = epicId
									? getEpicTask(epicId)
									: null}
								{@const isExpanded = isEpicExpanded(
									selectedProject!,
									epicId,
								)}

								{#if epicId && epicTasks.length > 0}
									<!-- Epic Group - only show if there are open child tasks -->
									<div class="epic-group">
										<button
											class="epic-header"
											onclick={() =>
												toggleEpicCollapse(
													selectedProject!,
													epicId,
												)}
											aria-expanded={isExpanded}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												fill="none"
												viewBox="0 0 24 24"
												stroke-width="2"
												stroke="currentColor"
												class="collapse-icon small"
												class:collapsed={!isExpanded}
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M19 9l-7 7-7-7"
												/>
											</svg>
											<TaskIdBadge
												task={epic || {
													id: epicId,
													status: "open",
													issue_type: "epic",
												}}
												size="sm"
											/>
											<span class="epic-title"
												>{epic?.title ||
													"Untitled Epic"}</span
											>
											<span class="epic-count"
												>{epicTasks.length} open</span
											>
										</button>

										{#if isExpanded}
											<div
												class="epic-content"
												transition:slide={{
													duration: 200,
												}}
											>
												<TasksOpen
													tasks={epicTasks as any[]}
													loading={false}
													error={null}
													{spawningTaskId}
													{projectColors}
													onSpawnTask={spawnTask as any}
													onRetry={fetchTasks}
													onTaskClick={(taskId) =>
														openTaskDetailDrawer(
															taskId,
														)}
													showHeader={false}
													onAddTask={() => openTaskDrawer(selectedProject ?? undefined)}
												/>
											</div>
										{/if}
									</div>
								{:else if epicTasks.length > 0}
									<!-- Standalone Tasks (no epic) - collapsible group like epics -->
									{@const isStandaloneExpanded =
										isEpicExpanded(selectedProject!, null)}
									<div class="epic-group standalone">
										<button
											class="epic-header"
											onclick={() =>
												toggleEpicCollapse(
													selectedProject!,
													null,
												)}
											aria-expanded={isStandaloneExpanded}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												fill="none"
												viewBox="0 0 24 24"
												stroke-width="2"
												stroke="currentColor"
												class="collapse-icon small"
												class:collapsed={!isStandaloneExpanded}
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M19 9l-7 7-7-7"
												/>
											</svg>
											<span class="standalone-icon"
												>📋</span
											>
											<span class="epic-title"
												>Standalone Tasks</span
											>
											<span class="epic-count"
												>{epicTasks.length} open</span
											>
										</button>

										{#if isStandaloneExpanded}
											<div
												class="epic-content"
												transition:slide={{
													duration: 200,
												}}
											>
												<TasksOpen
													tasks={epicTasks as any[]}
													loading={false}
													error={null}
													{spawningTaskId}
													{projectColors}
													onSpawnTask={spawnTask as any}
													onRetry={fetchTasks}
													onTaskClick={(taskId) =>
														openTaskDetailDrawer(
															taskId,
														)}
													showHeader={false}
													onAddTask={() => openTaskDrawer(selectedProject ?? undefined)}
												/>
											</div>
										{/if}
									</div>
								{/if}
							{/each}
						{/if}
					</div>
				{/if}

				<!-- Empty state for selected project -->
				{#if projectSessions.length === 0 && tasksByEpic.size === 0 && projectPausedSessions.length === 0}
					<div class="project-empty-state">
						<span
							>No active sessions or open tasks for {selectedProject}</span
						>
						<button
							class="add-task-empty-btn"
							onclick={() => openTaskDrawer(selectedProject ?? undefined)}
							title="Add new task"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="2"
								stroke="currentColor"
								class="add-task-icon"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M12 4.5v15m7.5-7.5h-15"
								/>
							</svg>
							<span class="add-task-label">Add Task</span>
						</button>
					</div>
				{/if}
			</section>
		{/if}
	{/if}
</div>

<style>
	.tasks-page {
		min-height: 100vh;
		background: oklch(0.14 0.01 250);
		padding: 1.5rem;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.5rem;
	}

	.page-header h1 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.5rem;
		font-weight: 600;
		color: oklch(0.9 0.02 250);
		margin: 0;
	}

	.subtitle {
		font-size: 0.875rem;
		font-weight: 400;
		color: oklch(0.6 0.02 250);
		margin-left: 0.5rem;
	}

	.header-icon {
		width: 1.5rem;
		height: 1.5rem;
		color: oklch(0.7 0.15 200);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* Project Tabs */
	.project-tabs {
		display: flex;
		flex-wrap: nowrap;
		gap: 0.5rem;
		margin-bottom: 1rem;
		padding: 0.5rem;
		background: oklch(0.16 0.01 250);
		border-radius: 0.75rem;
		border: 1px solid oklch(0.25 0.02 250);
		/* Sticky positioning so tabs stay visible when scrolling */
		position: sticky;
		top: 0;
		z-index: 10;
		/* Horizontal scroll instead of wrapping */
		overflow-x: auto;
		overflow-y: hidden;
		/* Custom scrollbar styling */
		scrollbar-width: thin;
		scrollbar-color: oklch(0.35 0.02 250) transparent;
	}

	.project-tabs::-webkit-scrollbar {
		height: 6px;
	}

	.project-tabs::-webkit-scrollbar-track {
		background: transparent;
	}

	.project-tabs::-webkit-scrollbar-thumb {
		background: oklch(0.35 0.02 250);
		border-radius: 3px;
	}

	.project-tabs::-webkit-scrollbar-thumb:hover {
		background: oklch(0.45 0.02 250);
	}

	.project-tab {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 0.625rem 1rem;
		background: oklch(0.18 0.01 250);
		border: 2px solid transparent;
		border-radius: 0.5rem;
		cursor: pointer;
		transition: all 0.15s ease;
		min-width: 100px;
		/* Prevent shrinking when scrolling */
		flex-shrink: 0;
	}

	.project-tab:hover {
		background: oklch(0.22 0.01 250);
		border-color: oklch(0.35 0.02 250);
	}

	.project-tab.active {
		background: color-mix(
			in oklch,
			var(--project-color) 15%,
			oklch(0.18 0.01 250)
		);
		border-color: var(--project-color);
		box-shadow: 0 0 12px
			color-mix(in oklch, var(--project-color) 30%, transparent);
	}

	.project-tab-name {
		font-size: 0.9375rem;
		font-weight: 600;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
			monospace;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.375rem 0.75rem;
		border-radius: 0.375rem;
		/* Use CSS custom property for project color */
		background: color-mix(in oklch, var(--project-color) 15%, transparent);
		border: 1px solid
			color-mix(in oklch, var(--project-color) 35%, transparent);
		color: var(--project-color);
		transition: all 0.15s ease;
	}

	.project-tab:hover .project-tab-name {
		background: color-mix(in oklch, var(--project-color) 25%, transparent);
		border-color: color-mix(
			in oklch,
			var(--project-color) 50%,
			transparent
		);
	}

	.project-tab.active .project-tab-name {
		background: color-mix(in oklch, var(--project-color) 30%, transparent);
		border-color: color-mix(
			in oklch,
			var(--project-color) 60%,
			transparent
		);
		box-shadow: 0 0 8px
			color-mix(in oklch, var(--project-color) 30%, transparent);
	}

	.project-tab-agents {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		flex-wrap: wrap;
		max-width: 120px;
	}

	.project-tab-counts {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.tab-count {
		font-size: 0.6875rem;
		font-weight: 500;
		padding: 0.0625rem 0.375rem;
		border-radius: 9999px;
	}

	.tab-count.sessions {
		background: oklch(0.55 0.15 145 / 0.2);
		color: oklch(0.75 0.15 145);
	}

	.tab-count.tasks {
		background: oklch(0.55 0.15 200 / 0.2);
		color: oklch(0.75 0.15 200);
	}

	.tab-count.paused {
		background: oklch(0.55 0.18 55 / 0.25);
		color: oklch(0.8 0.15 55);
		border: 1px solid oklch(0.55 0.18 55 / 0.4);
	}

	/* Add Project Button */
	.add-project-tab {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.625rem 1rem;
		min-width: 60px;
		background: oklch(0.16 0.01 250);
		border: 2px dashed oklch(0.30 0.02 250);
		border-radius: 0.5rem;
		cursor: pointer;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.add-project-tab:hover {
		background: oklch(0.20 0.01 250);
		border-color: oklch(0.45 0.02 250);
	}

	.add-project-tab:hover .add-project-icon {
		color: oklch(0.75 0.15 200);
	}

	.add-project-icon {
		width: 1.5rem;
		height: 1.5rem;
		color: oklch(0.45 0.02 250);
		transition: color 0.15s ease;
	}

	/* Project Content Area */
	.project-content {
		background: oklch(0.18 0.01 250);
		border-radius: 0.75rem;
		border: 1px solid oklch(0.25 0.02 250);
		border-top: 3px solid var(--project-color);
		/* NOTE: overflow:hidden removed - it clips TaskIdBadge dropdowns that need to escape container (see jat-1xa13) */
	}

	/* Subsections */
	.subsection {
		padding: 0.75rem 0;
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.subsection:last-child {
		border-bottom: none;
	}

	.subsection-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 1rem;
		background: transparent;
		border: none;
		cursor: pointer;
		font-size: 0.8125rem;
		font-weight: 600;
		color: oklch(0.7 0.02 250);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		transition: background-color 0.15s ease;
	}

	.subsection-header:hover {
		background: oklch(0.2 0.01 250);
	}

	.subsection-collapse-icon {
		width: 0.875rem;
		height: 0.875rem;
		color: oklch(0.55 0.02 250);
		transition: transform 0.2s ease;
	}

	.subsection-collapse-icon.collapsed {
		transform: rotate(-90deg);
	}

	.subsection-count {
		margin-left: auto;
		font-size: 0.75rem;
		font-weight: 500;
		padding: 0.125rem 0.375rem;
		border-radius: 9999px;
		background: oklch(0.25 0.02 250);
		color: oklch(0.65 0.02 250);
		text-transform: none;
		letter-spacing: normal;
	}

	/* Epic Groups */
	.epic-group {
		margin: 0.5rem 0.75rem;
		background: oklch(0.16 0.01 250);
		border-radius: 0.5rem;
		border: 1px solid oklch(0.23 0.02 250);
		/* NOTE: Do NOT add overflow: hidden here - it clips TaskIdBadge dropdown menus */
	}

	.epic-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: transparent;
		border: none;
		cursor: pointer;
		transition: background-color 0.15s ease;
	}

	.epic-header:hover {
		background: oklch(0.19 0.01 250);
	}

	.collapse-icon {
		width: 1.25rem;
		height: 1.25rem;
		color: oklch(0.6 0.02 250);
		transition: transform 0.2s ease;
	}

	.collapse-icon.collapsed {
		transform: rotate(-90deg);
	}

	.collapse-icon.small {
		width: 1rem;
		height: 1rem;
	}

	.epic-title {
		flex: 1;
		text-align: left;
		font-size: 0.9375rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.epic-count {
		font-size: 0.75rem;
		font-weight: 500;
		padding: 0.125rem 0.375rem;
		border-radius: 9999px;
		background: oklch(0.25 0.02 250);
		color: oklch(0.7 0.02 250);
	}

	.epic-agents {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin-left: auto;
		margin-right: 0.5rem;
	}

	.paused-agents {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin-right: 0.5rem;
	}

	.subsection-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: auto;
	}

	.subsection-count-inline {
		font-size: 0.75rem;
		font-weight: 500;
		padding: 0.125rem 0.375rem;
		border-radius: 9999px;
		background: oklch(0.25 0.02 250);
		color: oklch(0.65 0.02 250);
		text-transform: none;
		letter-spacing: normal;
	}

	.epic-content {
		border-top: 1px solid oklch(0.23 0.02 250);
	}

	/* Override TasksActive table styles when inside accordion to reduce visual prominence */
	.epic-content :global(.sessions-table-wrapper) {
		background: transparent;
		border: none;
		border-radius: 0;
	}

	.epic-content :global(.sessions-table thead) {
		display: none; /* Hide header row - parent accordion header is the context */
	}

	.epic-content :global(.sessions-table tbody tr) {
		border-bottom: 1px solid oklch(0.2 0.02 250 / 0.5);
	}

	.epic-content :global(.sessions-table tbody tr:last-child) {
		border-bottom: none;
	}

	.epic-content :global(.sessions-table td) {
		padding: 0.5rem 0.75rem;
		font-size: 0.8rem;
	}

	.epic-content :global(.sessions-table tbody tr:hover) {
		background: oklch(0.18 0.01 250);
	}

	/* Expanded session row styling (non-sticky - allows other tasks to remain visible) */
	.epic-content :global(.sessions-table tbody tr.expanded) {
		background: oklch(0.18 0.02 250);
	}

	.epic-content :global(.sessions-table tbody tr.expanded-row) {
		background: oklch(0.16 0.01 250);
		box-shadow: 0 4px 12px oklch(0 0 0 / 0.4);
	}

	/* Override TasksOpen table styles when inside accordion */
	.epic-content :global(.tasks-table-wrapper) {
		background: transparent;
	}

	.epic-content :global(.tasks-table th) {
		display: none; /* Hide header row - parent accordion header is the context */
	}

	.epic-content :global(.tasks-table thead) {
		display: none;
	}

	.epic-content :global(.tasks-table td) {
		padding: 0.5rem 0.75rem;
		border-bottom-color: oklch(0.2 0.02 250 / 0.5);
	}

	.epic-content :global(.task-row:last-child td) {
		border-bottom: none;
	}

	.epic-content :global(.task-row:hover) {
		background: oklch(0.18 0.01 250);
	}

	/* Paused subsection - indent to align with epic-group content */
	.paused-subsection {
		margin-left: 0.75rem;
		margin-right: 0.75rem;
		max-width: calc(100% - 1.5rem); /* Constrain width accounting for margins */
	}

	/* Override TasksPaused table styles to match TasksActive and TasksOpen */
	.paused-content {
		overflow: hidden; /* Prevent table from overflowing container */
	}

	.paused-content :global(.paused-sessions-table) {
		background: transparent;
		border: none;
		border-radius: 0;
	}

	.paused-content :global(.paused-table thead) {
		display: none; /* Hide header row - parent subsection header is the context */
	}

	.paused-content :global(.paused-table tbody tr) {
		border-bottom: 1px solid oklch(0.2 0.02 250 / 0.5);
	}

	.paused-content :global(.paused-table tbody tr:last-child) {
		border-bottom: none;
	}

	.paused-content :global(.paused-table td) {
		padding: 0.5rem 0.75rem;
		font-size: 0.8rem;
	}

	.paused-content :global(.paused-row:hover) {
		background: oklch(0.18 0.01 250);
	}

	/* Standalone Group (collapsible, same structure as epic) */
	.epic-group.standalone {
		border-color: oklch(0.28 0.02 250);
		background: oklch(0.14 0.01 250);
	}

	.epic-group.standalone .epic-header:hover {
		background: oklch(0.17 0.01 250);
	}

	.standalone-icon {
		font-size: 0.875rem;
		line-height: 1;
	}

	/* Loading Skeleton */
	.loading-container {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* Project Tabs Skeleton */
	.project-tabs-skeleton {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem;
		background: oklch(0.16 0.01 250);
		border-radius: 0.5rem;
		border: 1px solid oklch(0.22 0.02 250);
	}

	.skeleton-tab {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		background: oklch(0.18 0.01 250);
		border-radius: 0.375rem;
	}

	/* Section Skeleton */
	.section-skeleton {
		background: oklch(0.14 0.01 250);
		border: 1px solid oklch(0.22 0.02 250);
		border-radius: 0.5rem;
		overflow: hidden;
	}

	.skeleton-section-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: oklch(0.16 0.01 250);
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.skeleton-subsection {
		padding: 0.5rem;
	}

	.skeleton-subsection-header {
		display: flex;
		align-items: center;
		padding: 0.5rem 0.75rem;
		background: oklch(0.15 0.01 250);
		border-radius: 0.375rem;
		margin-bottom: 0.5rem;
	}

	.skeleton-task-rows {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.skeleton-task-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 0.75rem;
		background: oklch(0.15 0.01 250);
		border-radius: 0.25rem;
	}

	.skeleton {
		background: oklch(0.25 0.02 250);
		animation: pulse 1.5s infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	/* Error and empty states */
	.error-state,
	.empty-state,
	.project-empty-state {
		padding: 3rem;
		text-align: center;
		color: oklch(0.6 0.02 250);
		background: oklch(0.18 0.01 250);
		border-radius: 0.75rem;
		border: 1px solid oklch(0.25 0.02 250);
	}

	.project-empty-state {
		margin: 1rem;
		padding: 2rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
	}

	/* Add task button for empty state - matches add-project-tab pattern */
	.add-task-empty-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 1rem 1.5rem;
		background: oklch(0.16 0.01 250);
		border: 2px dashed oklch(0.30 0.02 250);
		border-radius: 0.5rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.add-task-empty-btn:hover {
		background: oklch(0.20 0.01 250);
		border-color: oklch(0.45 0.02 250);
	}

	.add-task-empty-btn:hover .add-task-icon {
		color: oklch(0.75 0.15 200);
	}

	.add-task-empty-btn:hover .add-task-label {
		color: oklch(0.75 0.15 200);
	}

	.add-task-icon {
		width: 1.5rem;
		height: 1.5rem;
		color: oklch(0.45 0.02 250);
		transition: color 0.15s ease;
	}

	.add-task-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: oklch(0.45 0.02 250);
		transition: color 0.15s ease;
	}

	.error-state button {
		margin-top: 0.75rem;
		padding: 0.375rem 0.75rem;
		background: oklch(0.25 0.02 250);
		border: 1px solid oklch(0.35 0.02 250);
		border-radius: 0.375rem;
		color: oklch(0.8 0.02 250);
		cursor: pointer;
	}

	.error-state button:hover {
		background: oklch(0.3 0.02 250);
	}
</style>
