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

	import { onMount, onDestroy } from 'svelte';
	import { slide } from 'svelte/transition';
	import SortDropdown from '$lib/components/SortDropdown.svelte';
	import TasksActive from '$lib/components/sessions/TasksActive.svelte';
	import TasksOpen from '$lib/components/sessions/TasksOpen.svelte';
	import TaskIdBadge from '$lib/components/TaskIdBadge.svelte';
	import WorkingAgentBadge from '$lib/components/WorkingAgentBadge.svelte';
	import { fetchAndGetProjectColors } from '$lib/utils/projectColors';
	import { openTaskDetailDrawer } from '$lib/stores/drawerStore';
	import {
		getProjectFromTaskId,
		buildEpicChildMap,
		getParentEpicId
	} from '$lib/utils/projectUtils';

	interface TmuxSession {
		name: string;
		created: string;
		attached: boolean;
		type: 'agent' | 'server' | 'ide' | 'other';
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

	// Spawn loading state
	let spawningTaskId = $state<string | null>(null);

	// Selected project tab (instead of collapsed projects)
	let selectedProject = $state<string | null>(null);

	// Subsection collapse state per project (sessions/tasks)
	type SubsectionType = 'sessions' | 'tasks';
	let collapsedSubsections = $state<Map<string, Set<SubsectionType>>>(new Map());

	// Epic collapse state (independent: each group can be expanded/collapsed separately)
	// Uses Set of epic keys per project. "standalone" key used for tasks without an epic.
	let expandedEpicsByProject = $state<Map<string, Set<string>>>(new Map());

	// Sort configuration for sessions
	type SessionSortOption = 'state' | 'project' | 'created';
	type SessionSortDirection = 'asc' | 'desc';

	interface SessionSortConfig {
		value: string;
		label: string;
		icon: string;
		defaultDir: SessionSortDirection;
	}

	let sortBy = $state<SessionSortOption>('state');
	let sortDir = $state<SessionSortDirection>('asc');

	// State priority for sorting
	const STATE_PRIORITY: Record<string, number> = {
		'ready-for-review': 0,
		'needs-input': 1,
		completed: 2,
		working: 3,
		completing: 4,
		starting: 5,
		recovering: 6,
		compacting: 7,
		'auto-proceeding': 8,
		idle: 9
	};

	const SORT_OPTIONS: SessionSortConfig[] = [
		{ value: 'state', label: 'State', icon: '🎯', defaultDir: 'asc' },
		{ value: 'project', label: 'Project', icon: '📁', defaultDir: 'asc' },
		{ value: 'created', label: 'Created', icon: '⏱️', defaultDir: 'desc' }
	];

	let projectOrder = $state<string[]>([]);

	// Helpers
	function categorizeSession(name: string): { type: TmuxSession['type']; project?: string } {
		if (name.startsWith('jat-')) {
			const agentName = name.slice(4);
			if (agentName.startsWith('pending-')) {
				return { type: 'agent', project: undefined };
			}
			const project = agentProjects.get(agentName);
			return { type: 'agent', project };
		}
		if (name.startsWith('server-')) {
			const project = name.slice(7);
			return { type: 'server', project };
		}
		if (name === 'jat-ide' || name.startsWith('jat-ide')) {
			return { type: 'ide' };
		}
		return { type: 'other' };
	}

	function getAgentName(sessionName: string): string {
		if (sessionName.startsWith('jat-')) {
			return sessionName.slice(4);
		}
		return sessionName;
	}

	function getSessionStatePriority(session: TmuxSession): number {
		if (session.type !== 'agent') return 99;
		const agentName = getAgentName(session.name);
		const state = agentSessionInfo.get(agentName)?.activityState || 'idle';
		return STATE_PRIORITY[state] ?? 99;
	}

	// Build epic-child map from all tasks
	const epicChildMap = $derived(buildEpicChildMap(allTasks));

	// Get all unique projects from sessions and tasks
	const allProjects = $derived(() => {
		const projects = new Set<string>();

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
	$effect(() => {
		const projects = allProjects();
		if (projects.length > 0 && !selectedProject) {
			selectedProject = projects[0];
		} else if (projects.length > 0 && selectedProject && !projects.includes(selectedProject)) {
			// Selected project no longer exists, select first
			selectedProject = projects[0];
		}
	});

	// Group sessions by project
	const sessionsByProject = $derived(() => {
		const grouped = new Map<string, TmuxSession[]>();

		for (const session of sessions.filter((s) => s.type === 'agent')) {
			const project = session.project || 'Unknown';
			if (!grouped.has(project)) {
				grouped.set(project, []);
			}
			grouped.get(project)!.push(session);
		}

		// Sort sessions within each project
		for (const [project, projectSessions] of grouped) {
			projectSessions.sort((a, b) => {
				const multiplier = sortDir === 'asc' ? 1 : -1;

				if (sortBy === 'state') {
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
		projectSessions: TmuxSession[]
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
	const tasksByProject = $derived(() => {
		const grouped = new Map<string, Task[]>();

		for (const task of openTasks) {
			const project = getProjectFromTaskId(task.id) || 'Unknown';
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
			if (task.issue_type === 'epic') {
				continue;
			}

			// Only include open tasks (not in_progress, blocked, or closed)
			if (task.status !== 'open') {
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
	function toggleEpicCollapse(project: string, epicId: string | null, subsection: 'sessions' | 'tasks' = 'tasks') {
		// Each subsection (sessions/tasks) has independent expand state
		const key = epicId ? `${subsection}-${epicId}` : `${subsection}-standalone`;
		const expanded = expandedEpicsByProject.get(project) ?? new Set<string>();

		if (expanded.has(key)) {
			// Collapse this group
			expanded.delete(key);
		} else {
			// Expand this group
			expanded.add(key);
		}

		expandedEpicsByProject.set(project, expanded);
		expandedEpicsByProject = new Map(expandedEpicsByProject);
	}

	function isEpicExpanded(project: string, epicId: string | null, subsection: 'sessions' | 'tasks' = 'tasks'): boolean {
		// Each subsection (sessions/tasks) has independent expand state
		const key = epicId ? `${subsection}-${epicId}` : `${subsection}-standalone`;
		const expanded = expandedEpicsByProject.get(project);
		return expanded?.has(key) ?? false;
	}

	// Subsection collapse handlers
	function toggleSubsectionCollapse(project: string, subsection: SubsectionType) {
		const projectSubsections = collapsedSubsections.get(project) || new Set();
		if (projectSubsections.has(subsection)) {
			projectSubsections.delete(subsection);
		} else {
			projectSubsections.add(subsection);
		}
		collapsedSubsections.set(project, projectSubsections);
		collapsedSubsections = new Map(collapsedSubsections);
		saveCollapseState();
	}

	function isSubsectionCollapsed(project: string, subsection: SubsectionType): boolean {
		return collapsedSubsections.get(project)?.has(subsection) ?? false;
	}

	// Persist collapse state
	function saveCollapseState() {
		try {
			// Save selected project tab
			if (selectedProject) {
				localStorage.setItem('tasks3-selected-project', selectedProject);
			}
			// Save subsection collapse state
			const subsectionData: Record<string, string[]> = {};
			for (const [project, subsections] of collapsedSubsections) {
				subsectionData[project] = Array.from(subsections);
			}
			localStorage.setItem('tasks3-collapsed-subsections', JSON.stringify(subsectionData));
		} catch {
			// Ignore storage errors
		}
	}

	function loadCollapseState() {
		try {
			// Load selected project tab
			const savedProject = localStorage.getItem('tasks3-selected-project');
			if (savedProject) {
				selectedProject = savedProject;
			}
			// Load subsection collapse state
			const subsectionSaved = localStorage.getItem('tasks3-collapsed-subsections');
			if (subsectionSaved) {
				const data = JSON.parse(subsectionSaved) as Record<string, string[]>;
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
			const response = await fetch('/api/projects?visible=true&stats=true');
			if (!response.ok) return;
			const data = await response.json();
			projectOrder = (data.projects || []).map((p: { name: string }) => p.name);
		} catch {
			// Silent fail
		}
	}

	async function fetchAgentProjects() {
		try {
			const response = await fetch('/api/work');
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
					activityStateTimestamp: Date.now()
				});

				const taskSource = session.task || session.lastCompletedTask;
				if (taskSource?.id) {
					const project = getProjectFromTaskId(taskSource.id);
					if (project) {
						projectMap.set(session.agentName, project);
					}
					taskMap.set(session.agentName, {
						id: taskSource.id,
						status: taskSource.status || 'open',
						issue_type: taskSource.issue_type,
						title: taskSource.title,
						priority: taskSource.priority,
						description: taskSource.description
					});
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
			const response = await fetch('/api/sessions?filter=all');
			if (!response.ok) {
				throw new Error('Failed to fetch sessions');
			}
			const data = await response.json();

			sessions = (data.sessions || []).map(
				(s: { name: string; created: string; attached: boolean; project?: string }) => {
					const { type, project: categorizedProject } = categorizeSession(s.name);
					return {
						...s,
						type,
						project: s.project || categorizedProject
					};
				}
			);
			sessionsError = null;
		} catch (err) {
			sessionsError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			sessionsLoading = false;
		}
	}

	async function fetchOpenTasks() {
		try {
			const response = await fetch('/api/tasks');
			if (!response.ok) {
				throw new Error('Failed to fetch tasks');
			}
			const data = await response.json();
			openTasks = data.tasks || [];
			tasksError = null;
		} catch (err) {
			tasksError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			tasksLoading = false;
		}
	}

	async function fetchAllTasks() {
		try {
			// Fetch all tasks including closed for epic mapping (no status filter = all statuses)
			const response = await fetch('/api/tasks');
			if (!response.ok) return;
			const data = await response.json();
			allTasks = data.tasks || [];
		} catch {
			// Silent fail - epic mapping is optional
		}
	}

	async function fetchProjectColors() {
		try {
			const colors = await fetchAndGetProjectColors();
			projectColors = colors;
		} catch (err) {
			console.warn('Failed to fetch project colors:', err);
		}
	}

	async function fetchAllData() {
		await Promise.all([
			fetchProjectOrder(),
			fetchAgentProjects(),
			fetchProjectColors(),
			fetchAllTasks()
		]);
		await Promise.all([fetchSessions(), fetchOpenTasks()]);
	}

	// Actions
	async function killSession(sessionName: string) {
		try {
			const response = await fetch(`/api/sessions/${encodeURIComponent(sessionName)}`, {
				method: 'DELETE'
			});
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to kill session');
			}
			await fetchSessions();
		} catch (err) {
			console.error('Failed to kill session:', err);
		}
	}

	async function attachSession(sessionName: string) {
		try {
			const response = await fetch(
				`/api/work/${encodeURIComponent(sessionName)}/attach`,
				{
					method: 'POST'
				}
			);
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to attach session');
			}
		} catch (err) {
			console.error('Failed to attach session:', err);
		}
	}

	async function spawnTask(task: Task) {
		spawningTaskId = task.id;
		try {
			const response = await fetch('/api/work/spawn', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					taskId: task.id,
					autoStart: true
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to spawn task');
			}

			await fetchAllData();
		} catch (err) {
			console.error('Failed to spawn task:', err);
		} finally {
			spawningTaskId = null;
		}
	}

	function handleSortChange(value: string, dir: 'asc' | 'desc') {
		sortBy = value as SessionSortOption;
		sortDir = dir;
	}

	// Count helpers
	function getProjectSessionCount(project: string): number {
		return sessionsByProject().get(project)?.length || 0;
	}

	function getProjectTaskCount(project: string): number {
		const tasks = tasksByProject().get(project) || [];
		// Only count open tasks (exclude epics and non-open status)
		return tasks.filter(t => t.status === 'open' && t.issue_type !== 'epic').length;
	}

	// Handle tab selection
	function selectProject(project: string) {
		selectedProject = project;
		saveCollapseState();
	}

	onMount(() => {
		loadCollapseState();
		fetchAllData();
		pollInterval = setInterval(fetchAllData, 5000);
	});

	onDestroy(() => {
		if (pollInterval) {
			clearInterval(pollInterval);
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
	<!-- Header -->
	<header class="page-header">
		<h1>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="header-icon"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
				/>
			</svg>
			Tasks
			<span class="subtitle">(Grouped by Project & Epic)</span>
		</h1>
		<div class="header-actions">
			<SortDropdown
				options={SORT_OPTIONS as any}
				{sortBy}
				{sortDir}
				onSortChange={handleSortChange}
				size="xs"
			/>
		</div>
	</header>

	<!-- Loading State -->
	{#if sessionsLoading && tasksLoading && sessions.length === 0 && openTasks.length === 0}
		<div class="loading-container">
			<div class="loading-skeleton">
				{#each [1, 2, 3] as _}
					<div class="skeleton-project">
						<div class="skeleton h-6 w-40 rounded mb-3"></div>
						<div class="skeleton-rows">
							{#each [1, 2] as __}
								<div class="skeleton-row">
									<div class="skeleton h-5 w-32 rounded"></div>
									<div class="skeleton h-4 w-20 rounded"></div>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{:else if sessionsError && tasksError}
		<div class="error-state">
			<span>Failed to load data: {sessionsError || tasksError}</span>
			<button onclick={() => fetchAllData()}>Retry</button>
		</div>
	{:else if allProjects().length === 0}
		<div class="empty-state">
			<span>No projects with active sessions or open tasks</span>
		</div>
	{:else}
		<!-- Project Tabs -->
		<div class="project-tabs">
			{#each allProjects() as project (project)}
				{@const projectColor = projectColors[project] || 'oklch(0.70 0.15 200)'}
				{@const isActive = selectedProject === project}
				{@const sessionCount = getProjectSessionCount(project)}
				{@const taskCount = getProjectTaskCount(project)}
				{@const projectAgentSessions = sessionsByProject().get(project) || []}
				<button
					class="project-tab"
					class:active={isActive}
					style="--project-color: {projectColor}"
					onclick={() => selectProject(project)}
				>
					<span class="project-tab-name mt-1">{project.toUpperCase()}</span>
					{#if projectAgentSessions.length > 0}
						<div class="project-tab-agents mt-2.5">
							{#each projectAgentSessions as session}
								<WorkingAgentBadge name={getAgentName(session.name)} size={20} variant="avatar" isWorking={true} />
							{/each}
						</div>
					{/if}
					<div class="project-tab-counts mt-1.5">
						<!-- {#if sessionCount > 0}
							<span class="tab-count sessions">{sessionCount} active</span>
						{/if} -->
						{#if taskCount > 0 && sessionCount === 0}
							<span class="tab-count tasks">{taskCount} open</span>
						{/if}
					</div>
				</button>
			{/each}
		</div>

		<!-- Selected Project Content -->
		{#if selectedProject}
			{@const projectSessions = sessionsByProject().get(selectedProject) || []}
			{@const projectTasks = tasksByProject().get(selectedProject) || []}
			{@const sessionsByEpic = getSessionsByEpic(projectSessions)}
			{@const tasksByEpic = getTasksByEpic(projectTasks)}
			{@const projectColor = projectColors[selectedProject] || 'oklch(0.70 0.15 200)'}

			<section class="project-content" style="--project-color: {projectColor}">
				<!-- Active Sessions Section -->
				{#if projectSessions.length > 0}
					<div class="subsection">
						<button
							class="subsection-header"
							onclick={() => toggleSubsectionCollapse(selectedProject!, 'sessions')}
							aria-expanded={!isSubsectionCollapsed(selectedProject!, 'sessions')}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="2"
								stroke="currentColor"
								class="subsection-collapse-icon"
								class:collapsed={isSubsectionCollapsed(selectedProject!, 'sessions')}
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
							</svg>
							<span>Active Sessions</span>
							<span class="subsection-count">{projectSessions.length}</span>
						</button>

						{#if !isSubsectionCollapsed(selectedProject!, 'sessions')}
						<!-- Group by Epic - sorted: epics by priority first, standalone last -->
						{@const sortedSessionEntries = Array.from(sessionsByEpic.entries()).sort((a, b) => {
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
						{#each sortedSessionEntries as [epicId, epicSessions] (epicId ?? 'standalone')}
							{@const epic = epicId ? getEpicTask(epicId) : null}
							{@const isExpanded = isEpicExpanded(selectedProject!, epicId, 'sessions')}

							{#if epicId && epicSessions.length > 0}
								<!-- Epic Group - only show if there are active sessions -->
								<div class="epic-group">
									<button
										class="epic-header"
										onclick={() => toggleEpicCollapse(selectedProject!, epicId, 'sessions')}
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
										<TaskIdBadge task={epic || { id: epicId, status: 'open', issue_type: 'epic' }} size="sm" />
										<span class="epic-title">{epic?.title || 'Untitled Epic'}</span>
										<div class="epic-agents">
											{#each epicSessions as session}
												<WorkingAgentBadge name={getAgentName(session.name)} size={18} variant="avatar" isWorking={true} />
											{/each}
										</div>
										<span class="epic-count">{epicSessions.length} active</span>
									</button>

									{#if isExpanded}
										<div class="epic-content" transition:slide={{ duration: 200 }}>
											<TasksActive
												sessions={epicSessions}
												{agentTasks}
												{agentSessionInfo}
												{agentProjects}
												{projectColors}
												onKillSession={killSession}
												onAttachSession={attachSession}
												onViewTask={(taskId) => openTaskDetailDrawer(taskId)}
											/>
										</div>
									{/if}
								</div>
							{:else if epicSessions.length > 0}
								<!-- Standalone Sessions (no epic) - collapsible group like epics -->
								{@const isStandaloneExpanded = isEpicExpanded(selectedProject!, null, 'sessions')}
								<div class="epic-group standalone">
									<button
										class="epic-header"
										onclick={() => toggleEpicCollapse(selectedProject!, null, 'sessions')}
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
										<span class="standalone-icon">📋</span>
										<span class="epic-title">Standalone Sessions</span>
										<div class="epic-agents">
											{#each epicSessions as session}
												<WorkingAgentBadge name={getAgentName(session.name)} size={18} variant="avatar" isWorking={true} />
											{/each}
										</div>
										<span class="epic-count">{epicSessions.length} active</span>
									</button>

									{#if isStandaloneExpanded}
										<div class="epic-content" transition:slide={{ duration: 200 }}>
											<TasksActive
												sessions={epicSessions}
												{agentTasks}
												{agentSessionInfo}
												{agentProjects}
												{projectColors}
												onKillSession={killSession}
												onAttachSession={attachSession}
												onViewTask={(taskId) => openTaskDetailDrawer(taskId)}
											/>
										</div>
									{/if}
								</div>
							{/if}
						{/each}
						{/if}
					</div>
				{/if}

				<!-- Open Tasks Section -->
				{#if tasksByEpic.size > 0}
					<div class="subsection">
						<button
							class="subsection-header"
							onclick={() => toggleSubsectionCollapse(selectedProject!, 'tasks')}
							aria-expanded={!isSubsectionCollapsed(selectedProject!, 'tasks')}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="2"
								stroke="currentColor"
								class="subsection-collapse-icon"
								class:collapsed={isSubsectionCollapsed(selectedProject!, 'tasks')}
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
							</svg>
							<span>Open Tasks</span>
							<span class="subsection-count">{Array.from(tasksByEpic.values()).reduce((sum, tasks) => sum + tasks.length, 0)}</span>
						</button>

						{#if !isSubsectionCollapsed(selectedProject!, 'tasks')}
						<!-- Group by Epic - sorted: epics by priority first, standalone last -->
						{@const sortedTaskEntries = Array.from(tasksByEpic.entries()).sort((a, b) => {
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
						{#each sortedTaskEntries as [epicId, epicTasks] (epicId ?? 'standalone')}
							{@const epic = epicId ? getEpicTask(epicId) : null}
							{@const isExpanded = isEpicExpanded(selectedProject!, epicId)}

							{#if epicId && epicTasks.length > 0}
								<!-- Epic Group - only show if there are open child tasks -->
								<div class="epic-group">
									<button
										class="epic-header"
										onclick={() => toggleEpicCollapse(selectedProject!, epicId)}
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
										<TaskIdBadge task={epic || { id: epicId, status: 'open', issue_type: 'epic' }} size="sm" />
										<span class="epic-title">{epic?.title || 'Untitled Epic'}</span>
										<span class="epic-count">{epicTasks.length} open</span>
									</button>

									{#if isExpanded}
										<div class="epic-content" transition:slide={{ duration: 200 }}>
											<TasksOpen
												tasks={epicTasks as any[]}
												loading={false}
												error={null}
												{spawningTaskId}
												{projectColors}
												onSpawnTask={spawnTask as any}
												onRetry={fetchOpenTasks}
												onTaskClick={(taskId) => openTaskDetailDrawer(taskId)}
												showHeader={false}
											/>
										</div>
									{/if}
								</div>
							{:else if epicTasks.length > 0}
								<!-- Standalone Tasks (no epic) - collapsible group like epics -->
								{@const isStandaloneExpanded = isEpicExpanded(selectedProject!, null)}
								<div class="epic-group standalone">
									<button
										class="epic-header"
										onclick={() => toggleEpicCollapse(selectedProject!, null)}
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
										<span class="standalone-icon">📋</span>
										<span class="epic-title">Standalone Tasks</span>
										<span class="epic-count">{epicTasks.length} open</span>
									</button>

									{#if isStandaloneExpanded}
										<div class="epic-content" transition:slide={{ duration: 200 }}>
											<TasksOpen
												tasks={epicTasks as any[]}
												loading={false}
												error={null}
												{spawningTaskId}
												{projectColors}
												onSpawnTask={spawnTask as any}
												onRetry={fetchOpenTasks}
												onTaskClick={(taskId) => openTaskDetailDrawer(taskId)}
												showHeader={false}
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
				{#if projectSessions.length === 0 && tasksByEpic.size === 0}
					<div class="project-empty-state">
						<span>No active sessions or open tasks for {selectedProject}</span>
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
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1rem;
		padding: 0.5rem;
		background: oklch(0.16 0.01 250);
		border-radius: 0.75rem;
		border: 1px solid oklch(0.25 0.02 250);
		/* Sticky positioning so tabs stay visible when scrolling */
		position: sticky;
		top: 0;
		z-index: 30;
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
	}

	.project-tab:hover {
		background: oklch(0.22 0.01 250);
		border-color: oklch(0.35 0.02 250);
	}

	.project-tab.active {
		background: color-mix(in oklch, var(--project-color) 15%, oklch(0.18 0.01 250));
		border-color: var(--project-color);
		box-shadow: 0 0 12px color-mix(in oklch, var(--project-color) 30%, transparent);
	}

	.project-tab-name {
		font-size: 0.75rem;
		font-weight: 600;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.25rem 0.625rem;
		border-radius: 0.375rem;
		/* Use CSS custom property for project color */
		background: color-mix(in oklch, var(--project-color) 15%, transparent);
		border: 1px solid color-mix(in oklch, var(--project-color) 35%, transparent);
		color: var(--project-color);
		transition: all 0.15s ease;
	}

	.project-tab:hover .project-tab-name {
		background: color-mix(in oklch, var(--project-color) 25%, transparent);
		border-color: color-mix(in oklch, var(--project-color) 50%, transparent);
	}

	.project-tab.active .project-tab-name {
		background: color-mix(in oklch, var(--project-color) 30%, transparent);
		border-color: color-mix(in oklch, var(--project-color) 60%, transparent);
		box-shadow: 0 0 8px color-mix(in oklch, var(--project-color) 30%, transparent);
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

	/* Project Content Area */
	.project-content {
		background: oklch(0.18 0.01 250);
		border-radius: 0.75rem;
		border: 1px solid oklch(0.25 0.02 250);
		border-top: 3px solid var(--project-color);
		overflow: hidden;
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
		overflow: hidden;
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
		font-size: 0.875rem;
		font-weight: 500;
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
		border-bottom: 1px solid oklch(0.20 0.02 250 / 0.5);
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
	}

	.loading-skeleton {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.skeleton-project {
		background: oklch(0.18 0.01 250);
		border-radius: 0.75rem;
		padding: 1rem;
	}

	.skeleton-rows {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.skeleton-row {
		display: flex;
		gap: 1rem;
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
