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

	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import SessionCard from '$lib/components/work/SessionCard.svelte';
	import TaskTable from '$lib/components/agents/TaskTable.svelte';
	import WorkingAgentBadge from '$lib/components/WorkingAgentBadge.svelte';
	import TaskDetailDrawer from '$lib/components/TaskDetailDrawer.svelte';
	import ResizableDivider from '$lib/components/ResizableDivider.svelte';
	import SessionPanelSkeleton from '$lib/components/skeleton/SessionPanelSkeleton.svelte';
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

	// Section state type
	interface SectionState {
		collapsed: boolean;
		height: number; // pixels
	}

	// Storage keys
	const PROJECT_COLLAPSE_KEY = 'projects-collapse-';
	const SECTION_STATE_KEY = 'projects-section-';
	const PROJECT_ORDER_KEY = 'projects-order';

	// Section defaults
	const DEFAULT_SESSION_HEIGHT = 300;
	const DEFAULT_TASK_HEIGHT = 400;
	const MIN_SECTION_HEIGHT = 100;

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

	// Keyboard navigation state
	let focusedProjectIndex = $state<number>(-1);
	const focusedProject = $derived(focusedProjectIndex >= 0 ? sortedProjects[focusedProjectIndex] : null);

	// Derive all projects (from sessions OR tasks)
	const allProjects = $derived.by(() => {
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
				if (match && match[1]) projects.add(match[1]);
			}
		}
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

	onMount(async () => {
		customProjectOrder = loadProjectOrder();
		fetchTaskData();
		await fetchSessions();
		setTimeout(() => fetchSessionUsage(), 5000);
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
		<!-- Project list -->
		<div class="flex flex-col">
			{#each sortedProjects as project (project)}
				{@const isProjectCollapsed = projectCollapseState.get(project) ?? false}
				{@const sessions = sessionsByProject.get(project) || []}
				{@const projectTasks = getTasksForProject(project)}
				{@const projectColor = getProjectColor(project)}
				{@const hasSessions = sessions.length > 0}
				{@const isDragging = draggedProject === project}
				{@const isDragOver = dragOverProject === project}
				{@const isFocused = focusedProject === project}

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
					draggable="true"
					ondragstart={(e) => handleDragStart(e, project)}
					ondragover={(e) => handleDragOver(e, project)}
					ondragleave={handleDragLeave}
					ondrop={(e) => handleDrop(e, project)}
					ondragend={handleDragEnd}
				>
					<!-- Project header -->
					<div
						class="w-full flex items-center gap-3 px-4 py-2 hover:bg-base-200/50 transition-colors cursor-grab active:cursor-grabbing bg-base-100 z-20 sticky top-0 shadow-sm {isDragOver ? 'bg-primary/10' : ''}"
					>
						<!-- Drag handle -->
						<svg class="w-4 h-4 text-base-content/30 hover:text-base-content/60 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M4 8h16M4 16h16" />
						</svg>

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

							<span class="badge badge-ghost badge-sm">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>

							{#if projectTasks.length > 0}
								<span class="badge badge-outline badge-sm">{projectTasks.filter(t => t.status !== 'closed').length} tasks</span>
							{/if}

							<!-- Mini session avatars (shown when collapsed) -->
							{#if isProjectCollapsed && hasSessions}
								<div class="flex items-center -space-x-1 ml-2 pl-2 border-l border-base-300">
									{#each sessions.slice(0, 5) as session (session.sessionName)}
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
									{#if sessions.length > 5}
										<span class="text-xs text-base-content/50 ml-2">+{sessions.length - 5}</span>
									{/if}
								</div>
							{/if}
						</button>
					</div>

					<!-- Project content (collapsible) -->
					{#if !isProjectCollapsed}
						<div class="flex flex-col">
							<!-- Sessions Section -->
							{#if hasSessions}
								{@const sessionState = getSectionState(project, 'sessions')}
								<div class="border-b border-base-300">
									<!-- Sessions header (double-click to auto-size) -->
									<button
										class="w-full flex items-center gap-2 px-6 py-1.5 bg-base-200/30 hover:bg-base-200/60 transition-colors"
										onclick={() => toggleSectionCollapse(project, 'sessions')}
										ondblclick={() => autoSizeSection(project, 'sessions')}
										title="Click to collapse/expand, double-click to auto-size"
									>
										<svg
											class="w-3 h-3 transition-transform duration-200"
											class:rotate-90={!sessionState.collapsed}
											fill="none" viewBox="0 0 24 24" stroke="currentColor"
										>
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
										</svg>
										<span class="text-xs font-medium text-base-content/70 uppercase tracking-wide">
											Sessions ({sessions.length})
										</span>
									</button>

									<!-- Sessions content -->
									<div
										class="overflow-hidden transition-all duration-200"
										class:hidden={sessionState.collapsed}
										style="height: {sessionState.height}px;"
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

									<!-- Sessions resize handle -->
									{#if !sessionState.collapsed}
										<ResizableDivider
											onResize={(deltaY) => handleSectionResize(project, 'sessions', deltaY)}
											class="bg-base-300/50 hover:bg-base-300"
										/>
									{/if}
								</div>
							{/if}

							<!-- Tasks Section -->
							{#if true}
							{@const taskState = getSectionState(project, 'tasks')}
							<div>
								<!-- Tasks header (double-click to auto-size) -->
								<button
									class="w-full flex items-center gap-2 px-6 py-1.5 bg-base-200/30 hover:bg-base-200/60 transition-colors"
									onclick={() => toggleSectionCollapse(project, 'tasks')}
									ondblclick={() => autoSizeSection(project, 'tasks')}
									title="Click to collapse/expand, double-click to auto-size"
								>
									<svg
										class="w-3 h-3 transition-transform duration-200"
										class:rotate-90={!taskState.collapsed}
										fill="none" viewBox="0 0 24 24" stroke="currentColor"
									>
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
									</svg>
									<span class="text-xs font-medium text-base-content/70 uppercase tracking-wide">
										Tasks ({projectTasks.filter(t => t.status !== 'closed').length})
									</span>
								</button>

								<!-- Tasks content -->
								<div
									class="overflow-hidden transition-all duration-200"
									class:hidden={taskState.collapsed}
									style="height: {taskState.height}px;"
								>
									<div class="h-full overflow-auto">
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
								</div>

								<!-- Tasks resize handle -->
								{#if !taskState.collapsed}
									<ResizableDivider
										onResize={(deltaY) => handleSectionResize(project, 'tasks', deltaY)}
										class="bg-base-300/50 hover:bg-base-300"
									/>
								{/if}
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
</div>
