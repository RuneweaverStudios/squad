<script lang="ts">
	import { getProjectColor } from '$lib/utils/projectColors';

	interface Project {
		name: string;
		path?: string;
		taskCount?: number;
	}

	interface ReadyTask {
		id: string;
		title: string;
		project?: string;
		priority?: number;
	}

	interface Epic {
		id: string;
		title: string;
		project?: string;
		childCount?: number;
	}

	let {
		projects = [],
		readyTasks = [],
		epics = [],
		idleSlots = 0,
		onNewTask = (project?: string) => {},
		onStart = (taskId?: string) => {},
		onSwarm = (count: number, epicId?: string) => {}
	}: {
		projects?: Project[];
		readyTasks?: ReadyTask[];
		epics?: Epic[];
		idleSlots?: number;
		onNewTask?: (project?: string) => void;
		onStart?: (taskId?: string) => void;
		onSwarm?: (count: number, epicId?: string) => void;
	} = $props();

	let newHovered = $state(false);
	let startHovered = $state(false);
	let swarmHovered = $state(false);
	let newDropdownOpen = $state(false);
	let startDropdownOpen = $state(false);
	let swarmDropdownOpen = $state(false);
	let startSelectedTab = $state('all');

	// Derived
	const readyTaskCount = $derived(readyTasks.length);

	// Get unique projects from ready tasks
	const readyTaskProjects = $derived(() => {
		const projectSet = new Set<string>();
		readyTasks.forEach(task => {
			if (task.project) {
				projectSet.add(task.project);
			} else {
				// Extract from task ID (e.g., "jat-abc" → "jat")
				const prefix = task.id.split('-')[0];
				if (prefix) projectSet.add(prefix);
			}
		});
		return Array.from(projectSet).sort();
	});

	// Filter tasks by selected tab
	const filteredReadyTasks = $derived(() => {
		if (startSelectedTab === 'all') return readyTasks;
		return readyTasks.filter(task => {
			const taskProject = task.project || task.id.split('-')[0];
			return taskProject === startSelectedTab;
		});
	});

	// Close dropdowns when clicking outside
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.action-pill')) {
			newDropdownOpen = false;
			startDropdownOpen = false;
			swarmDropdownOpen = false;
		}
	}

	// Swarm options
	const swarmCounts = [2, 4, 6, 8];

	function handleNewClick() {
		if (projects.length > 1) {
			newDropdownOpen = !newDropdownOpen;
			startDropdownOpen = false;
			swarmDropdownOpen = false;
		} else if (projects.length === 1) {
			onNewTask(projects[0].name);
		} else {
			onNewTask();
		}
	}

	function handleNewProjectSelect(projectName: string) {
		newDropdownOpen = false;
		onNewTask(projectName);
	}

	function handleStartClick() {
		if (readyTaskCount > 1) {
			startDropdownOpen = !startDropdownOpen;
			newDropdownOpen = false;
			swarmDropdownOpen = false;
			if (startDropdownOpen) {
				startSelectedTab = 'all'; // Reset to All tab when opening
			}
		} else if (readyTaskCount === 1) {
			onStart(readyTasks[0].id);
		}
	}

	function handleStartTaskSelect(taskId: string) {
		startDropdownOpen = false;
		onStart(taskId);
	}

	function handleSwarmClick() {
		swarmDropdownOpen = !swarmDropdownOpen;
		newDropdownOpen = false;
		startDropdownOpen = false;
	}

	function handleSwarmSelect(count: number, epicId?: string) {
		swarmDropdownOpen = false;
		onSwarm(count, epicId);
	}

	// Priority label helper
	function getPriorityLabel(p?: number): string {
		if (p === undefined) return '';
		return `P${p}`;
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="action-pill">
	<!-- + New (Primary) -->
	<div class="segment-wrapper">
		<button
			class="segment segment-new"
			class:expanded={newHovered || newDropdownOpen}
			onmouseenter={() => newHovered = true}
			onmouseleave={() => newHovered = false}
			onclick={handleNewClick}
			title="Create new task (Alt+N)"
		>
			<svg class="icon" viewBox="0 0 20 20" fill="currentColor">
				<path d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" />
			</svg>
			<span class="label">New</span>
			{#if projects.length > 1}
				<svg class="chevron" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
				</svg>
			{/if}
		</button>

		{#if newDropdownOpen && projects.length > 1}
			<div class="dropdown dropdown-new">
				<div class="dropdown-header">Select Project</div>
				{#each projects as project}
					<button
						class="dropdown-item"
						onclick={() => handleNewProjectSelect(project.name)}
					>
						<span class="project-dot" style="background: {getProjectColor(project.name)}"></span>
						<span class="dropdown-item-label">{project.name}</span>
						{#if project.taskCount !== undefined}
							<span class="dropdown-hint">{project.taskCount}</span>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- ▶ Start -->
	<div class="segment-wrapper">
		<button
			class="segment segment-start"
			class:expanded={startHovered || startDropdownOpen}
			onmouseenter={() => startHovered = true}
			onmouseleave={() => startHovered = false}
			onclick={handleStartClick}
			disabled={readyTaskCount === 0}
			title={readyTaskCount > 0 ? `Start task (${readyTaskCount} ready)` : 'No tasks ready'}
		>
			<svg class="icon" viewBox="0 0 20 20" fill="currentColor">
				<path d="M6.3 2.84A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.27l9.344-5.891a1.5 1.5 0 000-2.538L6.3 2.841z" />
			</svg>
			{#if startHovered || startDropdownOpen}
				<span class="label">Start</span>
			{/if}
			{#if readyTaskCount > 0}
				<span class="badge">{readyTaskCount}</span>
			{/if}
			{#if readyTaskCount > 1}
				<svg class="chevron" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
				</svg>
			{/if}
		</button>

		{#if startDropdownOpen && readyTaskCount > 1}
			<div class="dropdown dropdown-start">
				<!-- Tabs -->
				{#if readyTaskProjects().length > 1}
					<div class="dropdown-tabs">
						<button
							class="dropdown-tab"
							class:active={startSelectedTab === 'all'}
							onclick={() => startSelectedTab = 'all'}
						>
							All
							<span class="tab-count">{readyTasks.length}</span>
						</button>
						{#each readyTaskProjects() as project}
							<button
								class="dropdown-tab"
								class:active={startSelectedTab === project}
								onclick={() => startSelectedTab = project}
							>
								<span class="tab-dot" style="background: {getProjectColor(project)}"></span>
								{project}
								<span class="tab-count">{readyTasks.filter(t => (t.project || t.id.split('-')[0]) === project).length}</span>
							</button>
						{/each}
					</div>
				{:else}
					<div class="dropdown-header">Ready Tasks ({readyTasks.length})</div>
				{/if}

				<!-- Scrollable task list -->
				<div class="dropdown-scroll">
					{#each filteredReadyTasks() as task}
						<button
							class="dropdown-item"
							onclick={() => handleStartTaskSelect(task.id)}
						>
							{#if task.priority !== undefined}
								<span class="priority-badge priority-{task.priority}">P{task.priority}</span>
							{/if}
							<span class="dropdown-item-label task-title">{task.title}</span>
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<!-- ⚡ Swarm -->
	<div class="segment-wrapper">
		<button
			class="segment segment-swarm"
			class:expanded={swarmHovered || swarmDropdownOpen}
			onmouseenter={() => swarmHovered = true}
			onmouseleave={() => swarmHovered = false}
			onclick={handleSwarmClick}
			disabled={readyTaskCount === 0 || idleSlots === 0}
			title={idleSlots > 0 ? `Launch swarm (${idleSlots} slots)` : 'No idle slots'}
		>
			<svg class="icon" viewBox="0 0 20 20" fill="currentColor">
				<path d="M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h6.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-6.572l1.305-6.093z" />
			</svg>
			{#if swarmHovered || swarmDropdownOpen}
				<span class="label">Swarm</span>
			{/if}
			{#if idleSlots > 0}
				<span class="badge">{idleSlots}</span>
			{/if}
			<svg class="chevron" viewBox="0 0 20 20" fill="currentColor">
				<path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
			</svg>
		</button>

		{#if swarmDropdownOpen}
			<div class="dropdown dropdown-swarm">
				<div class="dropdown-header">Launch Agents</div>
				{#each swarmCounts as count}
					<button
						class="dropdown-item"
						onclick={() => handleSwarmSelect(count)}
						disabled={count > idleSlots}
					>
						<span class="swarm-count">{count}</span>
						<span class="dropdown-item-label">agents on backlog</span>
						{#if count > idleSlots}
							<span class="dropdown-hint">({idleSlots} slots)</span>
						{/if}
					</button>
				{/each}
				{#if epics.length > 0}
					<div class="dropdown-divider"></div>
					<div class="dropdown-header">Attack Epic</div>
					{#each epics.slice(0, 3) as epic}
						<button
							class="dropdown-item"
							onclick={() => handleSwarmSelect(Math.min(epic.childCount || 4, idleSlots), epic.id)}
						>
							<span class="dropdown-icon">🎯</span>
							<span class="dropdown-item-label task-title">{epic.title}</span>
							{#if epic.childCount}
								<span class="dropdown-hint">{epic.childCount} tasks</span>
							{/if}
						</button>
					{/each}
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.action-pill {
		display: inline-flex;
		align-items: stretch;
		background: oklch(0.22 0.02 250);
		border-radius: 0.5rem;
		border: 1px solid oklch(0.30 0.02 250);
		overflow: visible;
		height: 2rem;
	}

	.segment-wrapper {
		position: relative;
		display: flex;
	}

	.segment {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0 0.6rem;
		border: none;
		background: transparent;
		cursor: pointer;
		transition: all 0.15s ease;
		font-size: 0.8125rem;
		font-weight: 500;
		white-space: nowrap;
	}

	.segment:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.segment:not(:last-child) {
		border-right: 1px solid oklch(0.30 0.02 250);
	}

	/* + New - Primary (always green) */
	.segment-new {
		color: oklch(0.85 0.18 145);
		background: oklch(0.30 0.08 145 / 0.3);
		border-radius: 0.4rem 0 0 0.4rem;
		padding-right: 0.75rem;
	}

	.segment-new:hover {
		background: oklch(0.35 0.12 145 / 0.4);
		color: oklch(0.92 0.18 145);
	}

	.segment-new .label {
		display: inline;
	}

	/* ▶ Start - Muted until hover */
	.segment-start {
		color: oklch(0.65 0.02 250);
	}

	.segment-start:not(:disabled):hover,
	.segment-start.expanded {
		color: oklch(0.85 0.15 200);
		background: oklch(0.30 0.08 200 / 0.25);
	}

	.segment-start .label {
		display: none;
	}

	.segment-start.expanded .label {
		display: inline;
	}

	/* ⚡ Swarm - Muted until hover */
	.segment-swarm {
		color: oklch(0.65 0.02 250);
		border-radius: 0 0.4rem 0.4rem 0;
	}

	.segment-swarm:not(:disabled):hover,
	.segment-swarm.expanded {
		color: oklch(0.90 0.15 85);
		background: oklch(0.35 0.10 85 / 0.25);
	}

	.segment-swarm .label {
		display: none;
	}

	.segment-swarm.expanded .label {
		display: inline;
	}

	/* Icons */
	.icon {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
	}

	.chevron {
		width: 0.875rem;
		height: 0.875rem;
		opacity: 0.6;
		margin-left: -0.15rem;
	}

	/* Badge (count) */
	.badge {
		font-size: 0.6875rem;
		font-weight: 600;
		background: oklch(0.35 0.02 250);
		color: oklch(0.75 0.02 250);
		padding: 0.1rem 0.35rem;
		border-radius: 0.25rem;
		min-width: 1.1rem;
		text-align: center;
	}

	.segment-start:not(:disabled):hover .badge,
	.segment-start.expanded .badge {
		background: oklch(0.40 0.10 200 / 0.4);
		color: oklch(0.90 0.12 200);
	}

	.segment-swarm:not(:disabled):hover .badge,
	.segment-swarm.expanded .badge {
		background: oklch(0.40 0.10 85 / 0.4);
		color: oklch(0.92 0.12 85);
	}

	/* Dropdown */
	.dropdown {
		position: absolute;
		top: calc(100% + 0.35rem);
		background: oklch(0.20 0.02 250);
		border: 1px solid oklch(0.32 0.02 250);
		border-radius: 0.5rem;
		padding: 0.35rem;
		min-width: 10rem;
		box-shadow: 0 8px 24px oklch(0 0 0 / 0.4);
		z-index: 50;
		animation: dropdown-fade 0.12s ease-out;
	}

	@keyframes dropdown-fade {
		from {
			opacity: 0;
			margin-top: -0.25rem;
		}
		to {
			opacity: 1;
			margin-top: 0;
		}
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0.65rem;
		border: none;
		background: transparent;
		color: oklch(0.80 0.02 250);
		font-size: 0.8125rem;
		border-radius: 0.35rem;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s;
	}

	.dropdown-item:hover:not(:disabled) {
		background: oklch(0.28 0.02 250);
		color: oklch(0.92 0.02 250);
	}

	.dropdown-item:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.dropdown-icon {
		font-size: 0.875rem;
	}

	.dropdown-hint {
		margin-left: auto;
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
	}

	.dropdown-divider {
		height: 1px;
		background: oklch(0.30 0.02 250);
		margin: 0.35rem 0;
	}

	/* Dropdown header */
	.dropdown-header {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: oklch(0.55 0.02 250);
		padding: 0.4rem 0.65rem 0.25rem;
	}

	/* Project dot */
	.project-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		flex-shrink: 0;
	}

	/* Dropdown item label (truncate) */
	.dropdown-item-label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dropdown-item-label.task-title {
		max-width: 12rem;
	}

	/* In Start dropdown, let task titles expand fully */
	.dropdown-start .dropdown-item-label.task-title {
		max-width: none;
	}

	/* Priority badges */
	.priority-badge {
		font-size: 0.625rem;
		font-weight: 700;
		padding: 0.1rem 0.3rem;
		border-radius: 0.2rem;
		flex-shrink: 0;
	}

	.priority-badge.priority-0 {
		background: oklch(0.45 0.15 25 / 0.3);
		color: oklch(0.75 0.18 25);
	}

	.priority-badge.priority-1 {
		background: oklch(0.50 0.12 60 / 0.3);
		color: oklch(0.80 0.15 60);
	}

	.priority-badge.priority-2 {
		background: oklch(0.45 0.10 220 / 0.3);
		color: oklch(0.75 0.12 220);
	}

	.priority-badge.priority-3,
	.priority-badge.priority-4 {
		background: oklch(0.35 0.02 250 / 0.5);
		color: oklch(0.65 0.02 250);
	}

	/* Swarm count */
	.swarm-count {
		font-size: 0.875rem;
		font-weight: 700;
		color: oklch(0.85 0.15 85);
		min-width: 1.25rem;
	}

	/* Muted dropdown item */
	.dropdown-item-muted {
		color: oklch(0.60 0.02 250);
		font-style: italic;
	}

	/* Dropdown positioning variants */
	.dropdown-new {
		left: 0;
	}

	.dropdown-start {
		left: 50%;
		transform: translateX(-50%);
		min-width: 18rem;
		max-width: 22rem;
	}

	/* Tabs for Start dropdown */
	.dropdown-tabs {
		display: flex;
		gap: 0.125rem;
		padding: 0.35rem;
		border-bottom: 1px solid oklch(0.28 0.02 250);
		overflow-x: auto;
		scrollbar-width: none;
	}

	.dropdown-tabs::-webkit-scrollbar {
		display: none;
	}

	.dropdown-tab {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.35rem 0.5rem;
		border: none;
		background: transparent;
		color: oklch(0.60 0.02 250);
		font-size: 0.75rem;
		font-weight: 500;
		border-radius: 0.3rem;
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.1s;
	}

	.dropdown-tab:hover {
		background: oklch(0.26 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	.dropdown-tab.active {
		background: oklch(0.32 0.04 200 / 0.4);
		color: oklch(0.88 0.10 200);
	}

	.tab-dot {
		width: 0.4rem;
		height: 0.4rem;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.tab-count {
		font-size: 0.625rem;
		font-weight: 600;
		background: oklch(0.28 0.02 250);
		color: oklch(0.60 0.02 250);
		padding: 0.1rem 0.25rem;
		border-radius: 0.2rem;
		min-width: 1rem;
		text-align: center;
	}

	.dropdown-tab.active .tab-count {
		background: oklch(0.38 0.06 200 / 0.5);
		color: oklch(0.85 0.10 200);
	}

	/* Scrollable task list */
	.dropdown-scroll {
		max-height: 16rem;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: oklch(0.35 0.02 250) transparent;
	}

	.dropdown-scroll::-webkit-scrollbar {
		width: 0.4rem;
	}

	.dropdown-scroll::-webkit-scrollbar-track {
		background: transparent;
	}

	.dropdown-scroll::-webkit-scrollbar-thumb {
		background: oklch(0.35 0.02 250);
		border-radius: 0.2rem;
	}

	.dropdown-scroll::-webkit-scrollbar-thumb:hover {
		background: oklch(0.42 0.02 250);
	}

	.dropdown-swarm {
		right: 0;
		left: auto;
	}

	/* Segment-new border radius when it has dropdown */
	.segment-new {
		border-radius: 0.4rem 0 0 0.4rem;
	}

	/* Hover effect for new segment */
	.segment-new.expanded {
		background: oklch(0.38 0.14 145 / 0.45);
	}
</style>
