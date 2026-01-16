<script lang="ts">
	/**
	 * Tasks2 Page
	 *
	 * Enhanced tasks view with project and epic grouping.
	 * - Groups sessions and tasks by project
	 * - Within each project, groups by epic (accordion behavior)
	 * - Maintains the aesthetic of /tasks while adding hierarchy
	 */

	import { onMount, onDestroy } from 'svelte';
	import SortDropdown from '$lib/components/SortDropdown.svelte';
	import TasksActive from '$lib/components/sessions/TasksActive.svelte';
	import TasksOpen from '$lib/components/sessions/TasksOpen.svelte';
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

	// Project collapse state (persisted to localStorage)
	let collapsedProjects = $state<Set<string>>(new Set());

	// Epic collapse state (accordion: only one expanded per project)
	let expandedEpicByProject = $state<Map<string, string | null>>(new Map());

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

	// Group tasks by epic within a project
	function getTasksByEpic(projectTasks: Task[]): Map<string | null, Task[]> {
		const grouped = new Map<string | null, Task[]>();

		for (const task of projectTasks) {
			// Don't include epics themselves in their own group
			if (task.issue_type === 'epic') {
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

	// Collapse/expand handlers
	function toggleProjectCollapse(project: string) {
		if (collapsedProjects.has(project)) {
			collapsedProjects.delete(project);
		} else {
			collapsedProjects.add(project);
		}
		collapsedProjects = new Set(collapsedProjects);
		saveCollapseState();
	}

	function toggleEpicCollapse(project: string, epicId: string | null) {
		const current = expandedEpicByProject.get(project);
		if (current === epicId) {
			// Collapse (same epic clicked)
			expandedEpicByProject.set(project, null);
		} else {
			// Expand this epic (accordion: collapse others)
			expandedEpicByProject.set(project, epicId);
		}
		expandedEpicByProject = new Map(expandedEpicByProject);
	}

	function isEpicExpanded(project: string, epicId: string | null): boolean {
		// Standalone (no epic) is always expanded
		if (epicId === null) return true;
		return expandedEpicByProject.get(project) === epicId;
	}

	// Persist collapse state
	function saveCollapseState() {
		try {
			localStorage.setItem(
				'tasks2-collapsed-projects',
				JSON.stringify(Array.from(collapsedProjects))
			);
		} catch {
			// Ignore storage errors
		}
	}

	function loadCollapseState() {
		try {
			const saved = localStorage.getItem('tasks2-collapsed-projects');
			if (saved) {
				collapsedProjects = new Set(JSON.parse(saved));
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
			// Fetch all tasks including closed for epic mapping
			const response = await fetch('/api/tasks?status=all');
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
		return tasksByProject().get(project)?.length || 0;
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
	<title>Tasks (Grouped) | JAT IDE</title>
	<meta
		name="description"
		content="Task management with project and epic grouping for AI coding agents."
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
		<!-- Projects -->
		{#each allProjects() as project (project)}
			{@const projectSessions = sessionsByProject().get(project) || []}
			{@const projectTasks = tasksByProject().get(project) || []}
			{@const sessionsByEpic = getSessionsByEpic(projectSessions)}
			{@const tasksByEpic = getTasksByEpic(projectTasks)}
			{@const isCollapsed = collapsedProjects.has(project)}
			{@const projectColor = projectColors[project] || 'oklch(0.70 0.15 200)'}

			<section class="project-section" style="--project-color: {projectColor}">
				<!-- Project Header -->
				<button
					class="project-header"
					onclick={() => toggleProjectCollapse(project)}
					aria-expanded={!isCollapsed}
				>
					<div class="project-header-left">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="2"
							stroke="currentColor"
							class="collapse-icon"
							class:collapsed={isCollapsed}
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
						</svg>
						<span class="project-badge" style="background: {projectColor}">{project}</span>
					</div>
					<div class="project-counts">
						{#if getProjectSessionCount(project) > 0}
							<span class="count-badge sessions">
								{getProjectSessionCount(project)} active
							</span>
						{/if}
						{#if getProjectTaskCount(project) > 0}
							<span class="count-badge tasks">
								{getProjectTaskCount(project)} open
							</span>
						{/if}
					</div>
				</button>

				<!-- Project Content -->
				{#if !isCollapsed}
					<div class="project-content">
						<!-- Active Sessions Section -->
						{#if projectSessions.length > 0}
							<div class="subsection">
								<h3 class="subsection-header">Active Sessions</h3>

								<!-- Group by Epic -->
								{#each Array.from(sessionsByEpic.entries()) as [epicId, epicSessions] (epicId ?? 'standalone')}
									{@const epic = epicId ? getEpicTask(epicId) : null}
									{@const isExpanded = isEpicExpanded(project, epicId)}

									{#if epicId}
										<!-- Epic Group -->
										<div class="epic-group">
											<button
												class="epic-header"
												onclick={() => toggleEpicCollapse(project, epicId)}
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
												<span class="epic-badge">EPIC</span>
												<span class="epic-title">{epic?.title || epicId}</span>
												<span class="epic-count">{epicSessions.length}</span>
											</button>

											{#if isExpanded}
												<div class="epic-content">
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
									{:else}
										<!-- Standalone Sessions (no epic) -->
										<div class="standalone-group">
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
								{/each}
							</div>
						{/if}

						<!-- Open Tasks Section -->
						{#if projectTasks.length > 0}
							<div class="subsection">
								<h3 class="subsection-header">Open Tasks</h3>

								<!-- Group by Epic -->
								{#each Array.from(tasksByEpic.entries()) as [epicId, epicTasks] (epicId ?? 'standalone')}
									{@const epic = epicId ? getEpicTask(epicId) : null}
									{@const isExpanded = isEpicExpanded(project, epicId)}

									{#if epicId}
										<!-- Epic Group -->
										<div class="epic-group">
											<button
												class="epic-header"
												onclick={() => toggleEpicCollapse(project, epicId)}
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
												<span class="epic-badge">EPIC</span>
												<span class="epic-title">{epic?.title || epicId}</span>
												<span class="epic-count">{epicTasks.length}</span>
											</button>

											{#if isExpanded}
												<div class="epic-content">
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
										<!-- Standalone Tasks (no epic) - only render if there are tasks -->
										<div class="standalone-group">
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
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</section>
		{/each}
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

	/* Project Section */
	.project-section {
		background: oklch(0.18 0.01 250);
		border-radius: 0.75rem;
		border: 1px solid oklch(0.25 0.02 250);
		margin-bottom: 1rem;
		overflow: hidden;
	}

	.project-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.875rem 1rem;
		background: transparent;
		border: none;
		border-bottom: 1px solid oklch(0.25 0.02 250);
		cursor: pointer;
		transition: background-color 0.15s ease;
	}

	.project-header:hover {
		background: oklch(0.2 0.01 250);
	}

	.project-header-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
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

	.project-badge {
		font-size: 0.875rem;
		font-weight: 600;
		padding: 0.25rem 0.75rem;
		border-radius: 9999px;
		color: white;
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}

	.project-counts {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.count-badge {
		font-size: 0.75rem;
		font-weight: 500;
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
	}

	.count-badge.sessions {
		background: oklch(0.55 0.15 145 / 0.2);
		color: oklch(0.75 0.15 145);
	}

	.count-badge.tasks {
		background: oklch(0.55 0.15 200 / 0.2);
		color: oklch(0.75 0.15 200);
	}

	.project-content {
		padding: 0;
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
		font-size: 0.8125rem;
		font-weight: 600;
		color: oklch(0.7 0.02 250);
		margin: 0 0 0.5rem 1rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
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

	.epic-badge {
		font-size: 0.625rem;
		font-weight: 700;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		background: oklch(0.55 0.15 280 / 0.3);
		color: oklch(0.8 0.12 280);
		text-transform: uppercase;
		letter-spacing: 0.05em;
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

	.epic-content {
		border-top: 1px solid oklch(0.23 0.02 250);
	}

	/* Standalone Group */
	.standalone-group {
		margin: 0.25rem 0;
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
	.empty-state {
		padding: 3rem;
		text-align: center;
		color: oklch(0.6 0.02 250);
		background: oklch(0.18 0.01 250);
		border-radius: 0.75rem;
		border: 1px solid oklch(0.25 0.02 250);
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
