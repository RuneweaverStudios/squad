<script lang="ts">
	/**
	 * Tasks Page
	 *
	 * Combined view: Active sessions above, open tasks with spawn below.
	 * - Top section: Running agent sessions (via TasksActive)
	 * - Bottom section: Open tasks ready to spawn (via TasksOpen)
	 */

	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import SortDropdown from '$lib/components/SortDropdown.svelte';
	import TasksActive from '$lib/components/sessions/TasksActive.svelte';
	import TasksOpen from '$lib/components/sessions/TasksOpen.svelte';
	import { fetchAndGetProjectColors } from '$lib/utils/projectColors';
	import { openTaskDetailDrawer, openTaskDrawer } from '$lib/stores/drawerStore';

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
		'completed': 2,
		'working': 3,
		'completing': 4,
		'starting': 5,
		'recovering': 6,
		'compacting': 7,
		'auto-proceeding': 8,
		'idle': 9
	};

	const SORT_OPTIONS: SessionSortConfig[] = [
		{ value: 'state', label: 'State', icon: '🎯', defaultDir: 'asc' },
		{ value: 'project', label: 'Project', icon: '📁', defaultDir: 'asc' },
		{ value: 'created', label: 'Created', icon: '⏱️', defaultDir: 'desc' }
	];

	let projectOrder = $state<string[]>([]);

	// Helpers
	function getProjectFromTaskId(taskId: string): string | undefined {
		if (!taskId) return undefined;
		const match = taskId.match(/^([a-zA-Z0-9_-]+)-[a-zA-Z0-9]+/);
		return match ? match[1] : undefined;
	}

	function categorizeSession(name: string): { type: TmuxSession['type']; project?: string } {
		if (name.startsWith('squad-')) {
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
		if (name === 'squad-ide' || name.startsWith('squad-ide')) {
			return { type: 'ide' };
		}
		return { type: 'other' };
	}

	function getAgentName(sessionName: string): string {
		if (sessionName.startsWith('squad-')) {
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

	// Derived: sorted & filtered sessions (agents only)
	const sortedAgentSessions = $derived(
		sessions
			.filter(s => s.type === 'agent')
			.sort((a, b) => {
				const multiplier = sortDir === 'asc' ? 1 : -1;

				if (sortBy === 'state') {
					const stateA = getSessionStatePriority(a);
					const stateB = getSessionStatePriority(b);
					if (stateA !== stateB) {
						return (stateA - stateB) * multiplier;
					}
					const createdA = new Date(a.created).getTime();
					const createdB = new Date(b.created).getTime();
					return (createdB - createdA);
				}

				if (sortBy === 'project') {
					const projA = a.project || '';
					const projB = b.project || '';
					if (projA !== projB) {
						const indexA = projA ? projectOrder.indexOf(projA) : -1;
						const indexB = projB ? projectOrder.indexOf(projB) : -1;
						const orderA = indexA === -1 ? (projA ? 9999 : 99999) : indexA;
						const orderB = indexB === -1 ? (projB ? 9999 : 99999) : indexB;
						if (orderA !== orderB) {
							return (orderA - orderB) * multiplier;
						}
					}
					const createdA = new Date(a.created).getTime();
					const createdB = new Date(b.created).getTime();
					return (createdB - createdA);
				}

				const createdA = new Date(a.created).getTime();
				const createdB = new Date(b.created).getTime();
				return (createdB - createdA) * multiplier;
			})
	);

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

			sessions = (data.sessions || []).map((s: { name: string; created: string; attached: boolean; project?: string }) => {
				const { type, project: categorizedProject } = categorizeSession(s.name);
				return {
					...s,
					type,
					project: s.project || categorizedProject
				};
			});
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

	async function fetchProjectColors() {
		try {
			const colors = await fetchAndGetProjectColors();
			projectColors = colors;
		} catch (err) {
			console.warn('Failed to fetch project colors:', err);
		}
	}

	async function fetchAllData() {
		await Promise.all([fetchProjectOrder(), fetchAgentProjects(), fetchProjectColors()]);
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
			const response = await fetch(`/api/work/${encodeURIComponent(sessionName)}/attach`, {
				method: 'POST'
			});
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
			// Use the spawn API to start a new agent session with this task
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

			// Refresh data after spawning
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

	onMount(() => {
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
	<title>Tasks | SQUAD IDE</title>
	<meta name="description" content="Task management for AI coding agents. Create, assign, and track tasks with dependency management." />
	<meta property="og:title" content="Tasks | SQUAD IDE" />
	<meta property="og:description" content="Task management for AI coding agents. Create, assign, and track tasks with dependency management." />
	<meta property="og:image" content="/favicons/tasks.svg" />
	<link rel="icon" href="/favicons/tasks.svg" />
</svelte:head>

<div class="tasks-page">
	<!-- Header -->
	<header class="page-header">
		<h1>
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="header-icon">
				<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
			</svg>
			Tasks
		</h1>
	</header>

	<!-- Active Sessions Section -->
	<section class="sessions-section">
		<div class="section-header">
			<h2>Active Tasks</h2>
			<span class="session-count">{sortedAgentSessions.length}</span>
			<div class="sort-control">
				<SortDropdown
					options={SORT_OPTIONS as any}
					{sortBy}
					{sortDir}
					onSortChange={handleSortChange}
					size="xs"
				/>
			</div>
		</div>

		{#if sessionsLoading && sessions.length === 0}
			<div class="loading-skeleton">
				{#each [1, 2, 3] as _}
					<div class="skeleton-row">
						<div class="skeleton h-5 w-32 rounded"></div>
						<div class="skeleton h-4 w-20 rounded"></div>
					</div>
				{/each}
			</div>
		{:else if sessionsError}
			<div class="error-state">
				<span>{sessionsError}</span>
				<button onclick={() => fetchSessions()}>Retry</button>
			</div>
		{:else if sortedAgentSessions.length === 0}
			<div class="empty-state">
				<span>No active sessions</span>
			</div>
		{:else}
			<TasksActive
				sessions={sortedAgentSessions}
				{agentTasks}
				{agentSessionInfo}
				{agentProjects}
				{projectColors}
				onKillSession={killSession}
				onAttachSession={attachSession}
				onViewTask={(taskId) => openTaskDetailDrawer(taskId)}
			/>
		{/if}
	</section>

	<!-- Open Tasks Section -->
	<TasksOpen
		tasks={openTasks}
		loading={tasksLoading}
		error={tasksError}
		{spawningTaskId}
		{projectColors}
		onSpawnTask={spawnTask}
		onRetry={fetchOpenTasks}
		onTaskClick={(taskId) => openTaskDetailDrawer(taskId)}
		onAddTask={() => openTaskDrawer()}
	/>
</div>

<style>
	.tasks-page {
		min-height: 100vh;
		background: oklch(0.14 0.01 250);
		padding: 1.5rem;
	}

	.page-header {
		margin-bottom: 1.5rem;
	}

	.page-header h1 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.5rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
	}

	.header-icon {
		width: 1.5rem;
		height: 1.5rem;
		color: oklch(0.70 0.15 200);
	}

	/* Section styling */
	.sessions-section {
		background: oklch(0.18 0.01 250);
		border-radius: 0.75rem;
		border: 1px solid oklch(0.25 0.02 250);
		margin-bottom: 1.5rem;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		border-bottom: 1px solid oklch(0.25 0.02 250);
	}

	.section-header h2 {
		font-size: 0.9375rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		margin: 0;
	}

	.session-count {
		font-size: 0.75rem;
		font-weight: 500;
		padding: 0.125rem 0.5rem;
		background: oklch(0.25 0.02 250);
		border-radius: 9999px;
		color: oklch(0.70 0.02 250);
	}

	.sort-control {
		margin-left: auto;
	}

	/* Loading skeleton */
	.loading-skeleton {
		padding: 1rem;
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

	/* Error and empty states */
	.error-state,
	.empty-state {
		padding: 2rem;
		text-align: center;
		color: oklch(0.60 0.02 250);
	}

	.error-state button {
		margin-top: 0.75rem;
		padding: 0.375rem 0.75rem;
		background: oklch(0.25 0.02 250);
		border: 1px solid oklch(0.35 0.02 250);
		border-radius: 0.375rem;
		color: oklch(0.80 0.02 250);
		cursor: pointer;
	}
</style>
