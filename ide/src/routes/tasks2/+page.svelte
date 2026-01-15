<script lang="ts">
	/**
	 * Tasks2 Page
	 *
	 * Combined view: Active sessions above, open tasks with spawn below.
	 * - Top section: Running agent sessions (like /tasks)
	 * - Bottom section: Open tasks ready to spawn
	 */

	import { onMount, onDestroy } from 'svelte';
	import TaskIdBadge from '$lib/components/TaskIdBadge.svelte';
	import AgentAvatar from '$lib/components/AgentAvatar.svelte';
	import StatusActionBadge from '$lib/components/work/StatusActionBadge.svelte';
	import SortDropdown from '$lib/components/SortDropdown.svelte';
	import { getProjectColor, fetchAndGetProjectColors } from '$lib/utils/projectColors';

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

	function getProjectColorReactive(taskIdOrProject: string): string | null {
		if (!taskIdOrProject) return null;
		const projectPrefix = taskIdOrProject.split('-')[0].toLowerCase();
		return projectColors[projectPrefix] || getProjectColor(taskIdOrProject);
	}

	// Format elapsed time for AnimatedDigits display
	// Returns object with hours, minutes, seconds as zero-padded strings
	function getElapsedFormatted(createdISO: string | undefined): { hours: string; minutes: string; seconds: string; showHours: boolean } | null {
		if (!createdISO) return null;
		const created = new Date(createdISO).getTime();
		if (isNaN(created)) return null;
		const now = Date.now();
		const elapsedMs = now - created;

		if (elapsedMs < 0) return { hours: '00', minutes: '00', seconds: '00', showHours: false };

		const totalSeconds = Math.floor(elapsedMs / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		return {
			hours: hours.toString().padStart(2, '0'),
			minutes: minutes.toString().padStart(2, '0'),
			seconds: seconds.toString().padStart(2, '0'),
			showHours: hours > 0
		};
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

	// Derived: open tasks sorted by priority
	const sortedOpenTasks = $derived(
		openTasks
			.filter(t => t.status === 'open')
			.sort((a, b) => a.priority - b.priority)
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
			const response = await fetch('/api/spawn', {
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
	<title>Tasks2 | JAT IDE</title>
</svelte:head>

<div class="tasks2-page">
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
			<h2>Active Sessions</h2>
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
			<div class="sessions-table-wrapper">
				<table class="sessions-table">
					<thead>
						<tr>
							<th class="th-task">Task</th>
							<th class="th-agent">Agent</th>
						</tr>
					</thead>
					<tbody>
						{#each sortedAgentSessions as session (session.name)}
							{@const agentName = getAgentName(session.name)}
							{@const sessionTask = agentTasks.get(agentName)}
							{@const sessionInfo = agentSessionInfo.get(agentName)}
							{@const activityState = sessionInfo?.activityState}
							{@const statusDotColor = activityState === 'working'
								? 'oklch(0.70 0.18 250)'
								: activityState === 'compacting'
								? 'oklch(0.65 0.15 280)'
								: activityState === 'needs-input'
								? 'oklch(0.75 0.20 45)'
								: activityState === 'ready-for-review'
								? 'oklch(0.70 0.20 85)'
								: activityState === 'completing'
								? 'oklch(0.65 0.15 175)'
								: activityState === 'completed'
								? 'oklch(0.70 0.20 145)'
								: activityState === 'starting'
								? 'oklch(0.75 0.15 200)'
								: activityState === 'recovering'
								? 'oklch(0.70 0.20 190)'
								: 'oklch(0.55 0.05 250)'
							}
							{@const derivedProject = agentProjects.get(agentName) || session.project || null}
							{@const rowProjectColor = sessionTask?.id
								? getProjectColorReactive(sessionTask.id)
								: derivedProject
									? getProjectColorReactive(`${derivedProject}-x`)
									: null
							}
							{@const elapsed = getElapsedFormatted(session.created)}
							<tr
								class="session-row"
								style={rowProjectColor ? `border-left: 3px solid ${rowProjectColor};` : ''}
							>
								<td class="td-task">
									{#if sessionTask}
										<TaskIdBadge
											task={sessionTask}
											size="xs"
											variant="projectPill"
											showType={true}
											{statusDotColor}
										/>
										<span class="task-title" title={sessionTask.title}>
											{sessionTask.title || sessionTask.id}
										</span>
									{:else}
										{#if derivedProject}
											<span
												class="project-badge"
												style="background: {rowProjectColor ? `color-mix(in oklch, ${rowProjectColor} 25%, transparent)` : 'oklch(0.25 0.02 250)'}; border-color: {rowProjectColor || 'oklch(0.35 0.02 250)'}; color: {rowProjectColor || 'oklch(0.75 0.02 250)'};"
											>
												{derivedProject}
											</span>
										{:else}
											<span class="session-name-pill">{session.name}</span>
										{/if}
										<span class="no-task-label">No active task</span>
									{/if}
								</td>
								<td class="td-agent">
									<div class="agent-column">
										<div class="agent-info-row">
											<AgentAvatar name={agentName} size={16} />
											<span class="agent-name">{agentName}</span>
											{#if session.attached}
												<span class="attached-indicator" title="Terminal attached">
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="attached-icon">
														<path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
													</svg>
												</span>
											{/if}
										</div>
										<StatusActionBadge
											sessionState={activityState || 'idle'}
											{elapsed}
											sessionName={session.name}
											alignRight={true}
											onAction={async (actionId) => {
												if (actionId === 'attach') {
													await attachSession(session.name);
												} else if (actionId === 'kill' || actionId === 'cleanup') {
													await killSession(session.name);
												}
											}}
										/>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<!-- Open Tasks Section -->
	<section class="open-tasks-section">
		<div class="section-header">
			<h2>Open Tasks</h2>
			<span class="task-count">{sortedOpenTasks.length}</span>
		</div>

		{#if tasksLoading && openTasks.length === 0}
			<div class="loading-skeleton">
				{#each [1, 2, 3, 4] as _}
					<div class="skeleton-row">
						<div class="skeleton h-5 w-40 rounded"></div>
						<div class="skeleton h-8 w-20 rounded"></div>
					</div>
				{/each}
			</div>
		{:else if tasksError}
			<div class="error-state">
				<span>{tasksError}</span>
				<button onclick={() => fetchOpenTasks()}>Retry</button>
			</div>
		{:else if sortedOpenTasks.length === 0}
			<div class="empty-state">
				<span>No open tasks</span>
			</div>
		{:else}
			<div class="tasks-table-wrapper">
				<table class="tasks-table">
					<thead>
						<tr>
							<th class="th-task">Task</th>
							<th class="th-actions">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each sortedOpenTasks as task (task.id)}
							{@const projectColor = getProjectColorReactive(task.id)}
							<tr
								class="task-row"
								style={projectColor ? `border-left: 3px solid ${projectColor};` : ''}
							>
								<td class="td-task">
									<div class="task-info">
										<TaskIdBadge
											{task}
											size="xs"
											variant="projectPill"
											showType={true}
										/>
										<span class="task-title" title={task.title}>
											{task.title}
										</span>
									</div>
									{#if task.description}
										<div class="task-description">
											{task.description}
										</div>
									{/if}
								</td>
								<td class="td-actions">
									<button
										class="spawn-btn"
										onclick={() => spawnTask(task)}
										disabled={spawningTaskId === task.id}
									>
										{#if spawningTaskId === task.id}
											<span class="spinner"></span>
											Spawning...
										{:else}
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="spawn-icon">
												<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
											</svg>
											Spawn
										{/if}
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>

<style>
	.tasks2-page {
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
	section {
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

	.session-count,
	.task-count {
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

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
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

	/* Table styling */
	.sessions-table-wrapper,
	.tasks-table-wrapper {
		overflow-x: auto;
	}

	.sessions-table,
	.tasks-table {
		width: 100%;
		border-collapse: collapse;
	}

	.sessions-table th,
	.tasks-table th {
		text-align: left;
		padding: 0.625rem 1rem;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: oklch(0.55 0.02 250);
		background: oklch(0.16 0.01 250);
		border-bottom: 1px solid oklch(0.25 0.02 250);
	}

	.th-task {
		width: 70%;
	}

	.th-agent,
	.th-actions {
		width: 30%;
	}

	.sessions-table td,
	.tasks-table td {
		padding: 0.75rem 1rem;
		vertical-align: top;
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.session-row,
	.task-row {
		transition: background 0.15s;
	}

	.session-row:hover,
	.task-row:hover {
		background: oklch(0.20 0.01 250);
	}

	/* Task info */
	.task-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.task-title {
		font-size: 0.8125rem;
		color: oklch(0.88 0.02 250);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.task-description {
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
		margin-top: 0.375rem;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* Agent column */
	.agent-column {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.agent-info-row {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.agent-name {
		font-size: 0.75rem;
		font-weight: 500;
		color: oklch(0.80 0.02 250);
	}

	.attached-indicator {
		display: flex;
		align-items: center;
		color: oklch(0.70 0.15 145);
	}

	.attached-icon {
		width: 0.75rem;
		height: 0.75rem;
	}

	/* Project badge */
	.project-badge {
		font-size: 0.6875rem;
		font-weight: 500;
		padding: 0.125rem 0.5rem;
		border-radius: 0.25rem;
		border: 1px solid;
	}

	.session-name-pill {
		font-size: 0.75rem;
		padding: 0.125rem 0.5rem;
		background: oklch(0.25 0.02 250);
		border-radius: 0.25rem;
		color: oklch(0.70 0.02 250);
	}

	.no-task-label {
		font-size: 0.75rem;
		color: oklch(0.50 0.02 250);
		font-style: italic;
	}

	/* Spawn button */
	.spawn-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		background: oklch(0.55 0.18 145);
		border: none;
		border-radius: 0.375rem;
		color: oklch(0.98 0.01 250);
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s, transform 0.1s;
	}

	.spawn-btn:hover:not(:disabled) {
		background: oklch(0.60 0.20 145);
		transform: translateY(-1px);
	}

	.spawn-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.spawn-icon {
		width: 0.875rem;
		height: 0.875rem;
	}

	.spinner {
		width: 0.875rem;
		height: 0.875rem;
		border: 2px solid transparent;
		border-top-color: currentColor;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Responsive */
	@media (max-width: 768px) {
		.tasks2-page {
			padding: 1rem;
		}

		.th-task {
			width: 60%;
		}

		.th-agent,
		.th-actions {
			width: 40%;
		}
	}
</style>
