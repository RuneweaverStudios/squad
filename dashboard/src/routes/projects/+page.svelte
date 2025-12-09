<script lang="ts">
	/**
	 * Projects Page
	 * Shows all projects with active sessions, each in a collapsible container.
	 *
	 * Layout per project:
	 * [PROJECT COLLAPSABLE CONTAINER]
	 *   [SESSION CARDS row - horizontal scroll]
	 *   [RESIZABLE DIVIDER]
	 *   [TASK TABLE COLLAPSABLE]
	 *
	 * Projects scroll vertically.
	 */

	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import SessionCard from '$lib/components/work/SessionCard.svelte';
	import TaskTable from '$lib/components/agents/TaskTable.svelte';
	import TaskDetailDrawer from '$lib/components/TaskDetailDrawer.svelte';
	import ResizableDivider from '$lib/components/ResizableDivider.svelte';
	import SessionPanelSkeleton from '$lib/components/skeleton/SessionPanelSkeleton.svelte';
	import TaskTableSkeleton from '$lib/components/skeleton/TaskTableSkeleton.svelte';
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
	import { broadcastSessionEvent } from '$lib/stores/sessionEvents';
	import { lastTaskEvent } from '$lib/stores/taskEvents';
	import { getProjectFromTaskId, filterTasksByProject } from '$lib/utils/projectUtils';
	import { getProjectColor } from '$lib/utils/projectColors';

	// Types
	interface Task {
		id: string;
		title?: string;
		description?: string;
		status: string;
		priority: number;
		issue_type?: string;
		assignee?: string;
		labels?: string[];
		depends_on?: Array<{ id: string; status?: string; title?: string; priority?: number; issue_type?: string; assignee?: string }>;
		created_at?: string;
		updated_at?: string;
	}

	interface Agent {
		name: string;
		last_active_ts?: string;
		task?: string | null;
	}

	interface Reservation {
		agent_name: string;
		path_pattern: string;
		expires_ts: string;
	}

	// Collapse state storage key prefix
	const COLLAPSE_KEY_PREFIX = 'projects-collapse-';
	const SPLIT_KEY_PREFIX = 'projects-split-';
	const PROJECT_ORDER_KEY = 'projects-order';
	const DEFAULT_SPLIT = 50; // 50% each
	const MIN_SPLIT = 10;
	const MAX_SPLIT = 90;

	// State
	let tasks = $state<Task[]>([]);
	let allTasks = $state<Task[]>([]);
	let agents = $state<Agent[]>([]);
	let reservations = $state<Reservation[]>([]);
	let isInitialLoad = $state(true);

	// Drawer state
	let drawerOpen = $state(false);
	let selectedTaskId = $state<string | null>(null);

	// Highlighted agent for scroll-to-agent feature
	let highlightedAgent = $state<string | null>(null);

	// Per-project collapse state
	let projectCollapseState = $state<Map<string, boolean>>(new Map());
	let taskTableCollapseState = $state<Map<string, boolean>>(new Map());
	let projectSplitState = $state<Map<string, number>>(new Map());
	let projectContainerRefs = $state<Map<string, HTMLDivElement | null>>(new Map());

	// Drag and drop state
	let draggedProject = $state<string | null>(null);
	let dragOverProject = $state<string | null>(null);
	let customProjectOrder = $state<string[]>([]);

	// Derive all projects (from sessions OR tasks)
	const allProjects = $derived.by(() => {
		const projects = new Set<string>();

		// Add projects from sessions
		for (const session of workSessionsState.sessions) {
			if (session.task?.id) {
				const project = getProjectFromTaskId(session.task.id);
				if (project) projects.add(project);
			} else if (session.lastCompletedTask?.id) {
				const project = getProjectFromTaskId(session.lastCompletedTask.id);
				if (project) projects.add(project);
			} else {
				// Fallback: try to get project from session name (jat-AgentName)
				const match = session.sessionName.match(/^([a-zA-Z0-9_-]+?)-/);
				if (match && match[1]) {
					projects.add(match[1]);
				}
			}
		}

		// Add projects from tasks
		for (const task of tasks) {
			const project = getProjectFromTaskId(task.id);
			if (project) projects.add(project);
		}

		return Array.from(projects).sort();
	});

	// Projects with active sessions (shown first, with session grid)
	const projectsWithSessions = $derived.by(() => {
		const projects = new Set<string>();
		for (const session of workSessionsState.sessions) {
			if (session.task?.id) {
				const project = getProjectFromTaskId(session.task.id);
				if (project) projects.add(project);
			} else if (session.lastCompletedTask?.id) {
				const project = getProjectFromTaskId(session.lastCompletedTask.id);
				if (project) projects.add(project);
			} else {
				const match = session.sessionName.match(/^([a-zA-Z0-9_-]+?)-/);
				if (match && match[1]) {
					projects.add(match[1]);
				}
			}
		}
		return projects;
	});

	// Projects with only tasks (no sessions) - shown after projects with sessions
	const projectsWithOnlyTasks = $derived.by(() => {
		return allProjects.filter(p => !projectsWithSessions.has(p));
	});

	// Sorted projects list - respects custom order, with new projects appended alphabetically
	const sortedProjects = $derived.by(() => {
		if (customProjectOrder.length === 0) {
			return allProjects;
		}
		// Start with projects in custom order (that still exist)
		const ordered: string[] = [];
		for (const p of customProjectOrder) {
			if (allProjects.includes(p)) {
				ordered.push(p);
			}
		}
		// Add any new projects not in custom order (alphabetically)
		for (const p of allProjects) {
			if (!ordered.includes(p)) {
				ordered.push(p);
			}
		}
		return ordered;
	});

	// Group sessions by project
	const sessionsByProject = $derived.by(() => {
		const groups = new Map<string, typeof workSessionsState.sessions>();
		for (const session of workSessionsState.sessions) {
			let project: string | null = null;
			if (session.task?.id) {
				project = getProjectFromTaskId(session.task.id);
			} else if (session.lastCompletedTask?.id) {
				project = getProjectFromTaskId(session.lastCompletedTask.id);
			} else {
				const match = session.sessionName.match(/^([a-zA-Z0-9_-]+?)-/);
				if (match && match[1]) project = match[1];
			}
			if (project) {
				const existing = groups.get(project) || [];
				existing.push(session);
				groups.set(project, existing);
			}
		}
		return groups;
	});

	// Load/save collapse state from localStorage
	function loadCollapseState(project: string): boolean {
		if (!browser) return false;
		const saved = localStorage.getItem(COLLAPSE_KEY_PREFIX + project);
		return saved === 'true';
	}

	function saveCollapseState(project: string, collapsed: boolean) {
		if (!browser) return;
		localStorage.setItem(COLLAPSE_KEY_PREFIX + project, collapsed.toString());
	}

	function loadTaskTableCollapseState(project: string): boolean {
		if (!browser) return false;
		const saved = localStorage.getItem(COLLAPSE_KEY_PREFIX + project + '-tasks');
		return saved === 'true';
	}

	function saveTaskTableCollapseState(project: string, collapsed: boolean) {
		if (!browser) return;
		localStorage.setItem(COLLAPSE_KEY_PREFIX + project + '-tasks', collapsed.toString());
	}

	function loadSplitState(project: string): number {
		if (!browser) return DEFAULT_SPLIT;
		const saved = localStorage.getItem(SPLIT_KEY_PREFIX + project);
		if (saved) {
			const parsed = parseFloat(saved);
			if (!isNaN(parsed) && parsed >= MIN_SPLIT && parsed <= MAX_SPLIT) {
				return parsed;
			}
		}
		return DEFAULT_SPLIT;
	}

	function saveSplitState(project: string, split: number) {
		if (!browser) return;
		localStorage.setItem(SPLIT_KEY_PREFIX + project, split.toString());
	}

	// Load/save custom project order
	function loadProjectOrder(): string[] {
		if (!browser) return [];
		const saved = localStorage.getItem(PROJECT_ORDER_KEY);
		if (saved) {
			try {
				return JSON.parse(saved);
			} catch {
				return [];
			}
		}
		return [];
	}

	function saveProjectOrder(order: string[]) {
		if (!browser) return;
		localStorage.setItem(PROJECT_ORDER_KEY, JSON.stringify(order));
	}

	// Drag and drop handlers
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
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}
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

		// Get current order (use sortedProjects as base)
		const currentOrder = [...sortedProjects];
		const draggedIndex = currentOrder.indexOf(draggedProject);
		const targetIndex = currentOrder.indexOf(targetProject);

		if (draggedIndex === -1 || targetIndex === -1) {
			draggedProject = null;
			dragOverProject = null;
			return;
		}

		// Remove from old position and insert at new position
		currentOrder.splice(draggedIndex, 1);
		currentOrder.splice(targetIndex, 0, draggedProject);

		// Save and update state
		customProjectOrder = currentOrder;
		saveProjectOrder(currentOrder);

		draggedProject = null;
		dragOverProject = null;
	}

	function handleDragEnd() {
		draggedProject = null;
		dragOverProject = null;
	}

	// Initialize collapse states on mount
	$effect(() => {
		if (browser && allProjects.length > 0) {
			let collapseChanged = false;
			let taskTableChanged = false;
			let splitChanged = false;

			const newCollapseState = new Map(projectCollapseState);
			const newTaskTableState = new Map(taskTableCollapseState);
			const newSplitState = new Map(projectSplitState);

			for (const project of allProjects) {
				if (!newCollapseState.has(project)) {
					newCollapseState.set(project, loadCollapseState(project));
					collapseChanged = true;
				}
				if (!newTaskTableState.has(project)) {
					newTaskTableState.set(project, loadTaskTableCollapseState(project));
					taskTableChanged = true;
				}
				if (!newSplitState.has(project)) {
					newSplitState.set(project, loadSplitState(project));
					splitChanged = true;
				}
			}

			// Only reassign if something changed to avoid infinite loops
			if (collapseChanged) projectCollapseState = newCollapseState;
			if (taskTableChanged) taskTableCollapseState = newTaskTableState;
			if (splitChanged) projectSplitState = newSplitState;
		}
	});

	// Toggle project collapse
	function toggleProjectCollapse(project: string) {
		const current = projectCollapseState.get(project) || false;
		// Create new Map to trigger Svelte reactivity
		const newState = new Map(projectCollapseState);
		newState.set(project, !current);
		projectCollapseState = newState;
		saveCollapseState(project, !current);
	}

	// Toggle task table collapse
	function toggleTaskTableCollapse(project: string) {
		const current = taskTableCollapseState.get(project) || false;
		// Create new Map to trigger Svelte reactivity
		const newState = new Map(taskTableCollapseState);
		newState.set(project, !current);
		taskTableCollapseState = newState;
		saveTaskTableCollapseState(project, !current);
	}

	// Handle resize for a project
	// splitPercent * 4 = session height in pixels (50 = 200px, 75 = 300px, 100 = 400px)
	function handleResize(project: string, deltaY: number) {
		const currentSplit = projectSplitState.get(project) || DEFAULT_SPLIT;
		// Convert pixel delta to split units (4px per unit)
		const deltaSplit = deltaY / 4;
		let newSplit = currentSplit + deltaSplit;

		// Clamp to min/max (10 = 40px min, 125 = 500px max for sessions)
		newSplit = Math.max(MIN_SPLIT, Math.min(125, newSplit));

		// Create new Map to trigger Svelte reactivity
		const newState = new Map(projectSplitState);
		newState.set(project, newSplit);
		projectSplitState = newState;
		saveSplitState(project, newSplit);
	}

	// Svelte action to set ref for a project
	function setProjectRef(el: HTMLDivElement, project: string) {
		projectContainerRefs.set(project, el);
		return {
			destroy() {
				projectContainerRefs.delete(project);
			}
		};
	}

	// Listen for task events
	$effect(() => {
		const unsubscribe = lastTaskEvent.subscribe((event) => {
			if (event) {
				fetchTaskData();
				if (event.updatedTasks && event.updatedTasks.length > 0) {
					fetchSessions();
				}
			}
		});
		return unsubscribe;
	});

	// Fetch task data
	async function fetchTaskData() {
		try {
			const response = await fetch('/api/agents?full=true');
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

	// Event handlers
	async function handleSpawnForTask(taskId: string) {
		const session = await spawn(taskId);
		if (session) {
			await fetchTaskData();
		}
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
			const response = await fetch(`/api/work/${sessionName}/attach`, {
				method: 'POST'
			});
			if (!response.ok) {
				console.error('Failed to attach terminal:', await response.text());
			}
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
			setTimeout(() => {
				highlightedAgent = null;
			}, 1500);
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

	onMount(async () => {
		// Load custom project order from localStorage
		customProjectOrder = loadProjectOrder();

		fetchTaskData();
		await fetchSessions();
		setTimeout(() => fetchSessionUsage(), 5000);
	});
</script>

<svelte:head>
	<title>Projects | JAT Dashboard</title>
</svelte:head>

<div class="h-full bg-base-200 flex flex-col overflow-auto">
	{#if isInitialLoad}
		<div class="p-4 space-y-4">
			<SessionPanelSkeleton cards={3} />
		</div>
	{:else if allProjects.length === 0}
		<!-- Empty state -->
		<div class="flex-1 flex flex-col items-center justify-center p-8">
			<div class="text-center text-base-content/60">
				<svg class="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
				</svg>
				<p class="text-lg font-medium mb-2">No projects found</p>
				<p class="text-sm">Projects with tasks or sessions will appear here</p>
			</div>
		</div>
	{:else}
		<!-- Project containers -->
		<div class="flex flex-col gap-0">
			{#each sortedProjects as project (project)}
				{@const isCollapsed = projectCollapseState.get(project) || false}
				{@const isTaskTableCollapsed = taskTableCollapseState.get(project) || false}
				{@const splitPercent = projectSplitState.get(project) || DEFAULT_SPLIT}
				{@const sessions = sessionsByProject.get(project) || []}
				{@const projectTasks = getTasksForProject(project)}
				{@const projectColor = getProjectColor(project)}
				{@const isDragging = draggedProject === project}
				{@const isDragOver = dragOverProject === project}

				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="border-b border-base-300 bg-base-100 transition-all duration-150"
					class:pb-0={isCollapsed}
					class:opacity-50={isDragging}
					class:border-t-2={isDragOver}
					class:border-t-primary={isDragOver}
					draggable="true"
					ondragstart={(e) => handleDragStart(e, project)}
					ondragover={(e) => handleDragOver(e, project)}
					ondragleave={handleDragLeave}
					ondrop={(e) => handleDrop(e, project)}
					ondragend={handleDragEnd}
				>
					<!-- Project header (collapsible + drag handle) -->
					<div
						class="w-full flex items-center gap-3 px-4 py-3 hover:bg-base-200/50 transition-colors cursor-grab active:cursor-grabbing {isDragOver ? 'bg-primary/10' : ''}"
					>
						<!-- Drag handle icon -->
						<svg
							class="w-4 h-4 text-base-content/30 hover:text-base-content/60 flex-shrink-0"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M4 8h16M4 16h16" />
						</svg>

						<!-- Collapse button -->
						<button
							class="flex items-center gap-3 flex-1 min-w-0"
							onclick={() => toggleProjectCollapse(project)}
						>
							<!-- Collapse indicator -->
							<svg
								class="w-4 h-4 transition-transform duration-200 flex-shrink-0"
								class:rotate-90={!isCollapsed}
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
							</svg>

							<!-- Project color indicator -->
							<div
								class="w-3 h-3 rounded-full flex-shrink-0"
								style="background-color: {projectColor}"
							></div>

							<!-- Project name -->
							<span class="font-semibold text-base-content uppercase tracking-wide">{project}</span>

							<!-- Session count badge -->
							<span class="badge badge-ghost badge-sm">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>

							<!-- Task count badge -->
							{#if projectTasks.length > 0}
								<span class="badge badge-outline badge-sm">{projectTasks.filter(t => t.status !== 'closed').length} tasks</span>
							{/if}
						</button>
					</div>

					<!-- Collapsible content -->
					{#if !isCollapsed}
						{@const sessionHeight = Math.round(splitPercent * 4)}
						{@const hasSessions = sessions.length > 0}
						<div
							class="flex flex-col"
							use:setProjectRef={project}
						>
							<!-- Sessions row - only shown if project has active sessions -->
							{#if hasSessions}
								<div
									class="min-h-0 bg-base-100 overflow-hidden flex-shrink-0"
									style="height: {sessionHeight}px;"
								>
									<div class="flex gap-3 overflow-x-auto h-full p-2 scrollbar-thin scrollbar-thumb-base-300 scrollbar-track-transparent">
										{#each sessions as session (session.sessionName)}
											<div class="h-[calc(100%-8px)]">
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
												/>
											</div>
										{/each}
									</div>
								</div>

								<!-- Resizable divider - only shown if project has sessions -->
								<ResizableDivider
									onResize={(deltaY) => handleResize(project, deltaY)}
									class="flex-shrink-0 bg-base-300 border-y border-base-300"
								/>
							{/if}

							<!-- Task table section with collapse header - grows naturally -->
							<div class="flex flex-col">
								<!-- Task table header (collapsible) -->
								<button
									class="w-full flex items-center gap-2 px-4 py-1.5 bg-base-200/50 hover:bg-base-200 transition-colors border-b border-base-300"
									onclick={() => toggleTaskTableCollapse(project)}
								>
									<svg
										class="w-3 h-3 transition-transform duration-200"
										class:rotate-90={!isTaskTableCollapsed}
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
									</svg>
									<span class="text-xs font-medium text-base-content/70 uppercase tracking-wide">
										Tasks ({projectTasks.filter(t => t.status !== 'closed').length})
									</span>
								</button>

								<!-- Task table content -->
								{#if !isTaskTableCollapsed}
									<div class="flex-1 overflow-auto">
										<TaskTable
											tasks={projectTasks}
											allTasks={allTasks}
											{agents}
											{reservations}
											completedTasksFromActiveSessions={getCompletedTasksForProject(project)}
											ontaskclick={handleTaskClick}
											onagentclick={handleAgentClick}
										/>
									</div>
								{/if}
							</div>
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
</div>
