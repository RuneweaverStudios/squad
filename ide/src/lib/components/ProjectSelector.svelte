<script lang="ts">
	/**
	 * ProjectSelector Component
	 * Unified project selector + action hub for the TopBar.
	 * Combines project switching with task creation, start, and swarm actions.
	 *
	 * Default: [● squad ▾] - compact project chip
	 * Hover:  [● squad ▾|+] - plus button slides out
	 * Click chip: dropdown with projects, ready tasks, and actions
	 * Click +: opens task creation drawer for current project
	 */
	import { getProjectColor } from "$lib/utils/projectColors";
	import {
		isStartDropdownOpen,
		closeStartDropdown
	} from '$lib/stores/drawerStore';

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

	interface Props {
		projects: string[];
		selectedProject: string;
		onProjectChange: (project: string) => void;
		taskCounts?: Map<string, number> | null;
		compact?: boolean;
		showColors?: boolean;
		/** Optional map of project name -> color. If provided, used instead of getProjectColor() */
		projectColors?: Map<string, string> | null;
		readyTasks?: ReadyTask[];
		epics?: Epic[];
		idleSlots?: number;
		onNewTask?: (project: string) => void;
		onStart?: (taskId: string) => void;
		onSwarm?: (count: number, epicId?: string) => void;
	}

	let {
		projects,
		selectedProject,
		onProjectChange,
		taskCounts = null,
		compact = false,
		showColors = false,
		projectColors = null,
		readyTasks = [],
		epics = [],
		idleSlots = 0,
		onNewTask,
		onStart,
		onSwarm,
	}: Props = $props();

	let open = $state(false);
	let containerEl = $state<HTMLDivElement | null>(null);

	// Get color for a project - prefer passed projectColors, fall back to utility
	function getColor(project: string): string {
		if (projectColors && projectColors.has(project)) {
			return projectColors.get(project)!;
		}
		return getProjectColor(project);
	}

	let selectedColor = $derived(
		selectedProject ? getColor(selectedProject) : '#6b7280'
	);

	// Filter ready tasks for the selected project
	const projectReadyTasks = $derived(
		readyTasks.filter(t => {
			const taskProject = t.project || t.id.split('-')[0];
			return taskProject === selectedProject;
		})
	);

	// Filter epics for the selected project
	const projectEpics = $derived(
		epics.filter(e => e.project === selectedProject)
	);

	const hasActions = $derived(!!onStart || !!onSwarm || !!onNewTask);

	function handleSelect(project: string) {
		onProjectChange(project);
		open = false;
	}

	// Format project option with task count if available
	function formatProjectOption(project: string): string {
		if (taskCounts && taskCounts.has(project)) {
			const count = taskCounts.get(project);
			return `${project} (${count})`;
		}
		return project;
	}

	function handleClickOutside(e: MouseEvent) {
		if (containerEl && !containerEl.contains(e.target as Node)) {
			open = false;
			closeStartDropdown();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
			closeStartDropdown();
		}
	}

	function handleStartTask(taskId: string) {
		open = false;
		closeStartDropdown();
		onStart?.(taskId);
	}

	function handleStartTop() {
		if (projectReadyTasks.length > 0) {
			handleStartTask(projectReadyTasks[0].id);
		}
	}

	function handleSwarmClick(count: number, epicId?: string) {
		open = false;
		onSwarm?.(count, epicId);
	}

	function handleNewTaskClick(e: MouseEvent) {
		e.stopPropagation();
		onNewTask?.(selectedProject);
	}

	// Alt+S keyboard shortcut support - open dropdown to show ready tasks
	$effect(() => {
		const unsubscribe = isStartDropdownOpen.subscribe((isOpen: boolean) => {
			if (isOpen && readyTasks.length > 0) {
				open = true;
			}
		});
		return unsubscribe;
	});

	$effect(() => {
		if (open) {
			document.addEventListener('click', handleClickOutside, true);
			document.addEventListener('keydown', handleKeydown);
		}
		return () => {
			document.removeEventListener('click', handleClickOutside, true);
			document.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

<div class="selector-container" bind:this={containerEl}>
	<div class="chip-group" style="--project-color: {selectedColor};">
		<button
			type="button"
			class="trigger-btn"
			class:compact
			onclick={() => open = !open}
		>
			<span class="chip-dot"></span>
			<span class="chip-label">{selectedProject}</span>
			<svg class="chevron" class:open viewBox="0 0 16 16" fill="currentColor">
				<path fill-rule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
			</svg>
		</button>

		{#if onNewTask}
			<button
				type="button"
				class="new-btn"
				onclick={handleNewTaskClick}
				title="New task (Alt+N)"
			>
				<svg class="new-icon" viewBox="0 0 20 20" fill="currentColor">
					<path d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" />
				</svg>
			</button>
		{/if}
	</div>

	{#if open}
		<div class="dropdown-menu">
			<!-- Projects Section -->
			<div class="dropdown-section-header">Projects</div>
			{#each projects as project}
				{@const projColor = getColor(project)}
				<button
					type="button"
					class="dropdown-item project-item"
					class:active={selectedProject === project}
					style="--project-color: {projColor};"
					onclick={() => handleSelect(project)}
				>
					<span class="item-dot"></span>
					<span class="item-label">{formatProjectOption(project)}</span>
					{#if selectedProject === project}
						<svg class="check-icon" viewBox="0 0 16 16" fill="currentColor">
							<path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd" />
						</svg>
					{/if}
				</button>
			{/each}

			<!-- Ready Tasks Section -->
			{#if hasActions && projectReadyTasks.length > 0}
				<div class="dropdown-divider"></div>
				<div class="dropdown-section-header">Ready Tasks ({projectReadyTasks.length})</div>
				<div class="dropdown-scroll">
					{#each projectReadyTasks as task}
						<button
							type="button"
							class="dropdown-item task-item"
							onclick={() => handleStartTask(task.id)}
						>
							{#if task.priority !== undefined}
								<span class="priority-badge priority-{task.priority}">P{task.priority}</span>
							{/if}
							<span class="item-label task-title">{task.title}</span>
						</button>
					{/each}
				</div>
			{/if}

			<!-- Quick Actions Section -->
			{#if hasActions && projectReadyTasks.length > 0}
				<div class="dropdown-divider"></div>
				<div class="dropdown-section-header">Actions</div>
				<button
					type="button"
					class="dropdown-item action-item"
					onclick={handleStartTop}
				>
					<svg class="action-icon action-start" viewBox="0 0 20 20" fill="currentColor">
						<path d="M6.3 2.84A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.27l9.344-5.891a1.5 1.5 0 000-2.538L6.3 2.841z" />
					</svg>
					<span class="item-label">Start top task</span>
				</button>
				{#if idleSlots > 0 && onSwarm}
					<button
						type="button"
						class="dropdown-item action-item"
						onclick={() => handleSwarmClick(Math.min(projectReadyTasks.length, idleSlots))}
					>
						<svg class="action-icon action-swarm" viewBox="0 0 20 20" fill="currentColor">
							<path d="M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h6.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-6.572l1.305-6.093z" />
						</svg>
						<span class="item-label">Swarm ({Math.min(projectReadyTasks.length, idleSlots)} agents)</span>
					</button>
				{/if}
			{/if}

			<!-- Epics Section -->
			{#if hasActions && projectEpics.length > 0}
				<div class="dropdown-divider"></div>
				<div class="dropdown-section-header">Attack Epic</div>
				{#each projectEpics.slice(0, 3) as epic}
					<button
						type="button"
						class="dropdown-item action-item"
						onclick={() => handleSwarmClick(Math.min(epic.childCount || 4, idleSlots), epic.id)}
						disabled={idleSlots === 0}
					>
						<span class="epic-icon">&#127919;</span>
						<span class="item-label task-title">{epic.title}</span>
						{#if epic.childCount}
							<span class="dropdown-hint">{epic.childCount} tasks</span>
						{/if}
					</button>
				{/each}
			{/if}
		</div>
	{/if}
</div>

<style>
	.selector-container {
		position: relative;
		display: inline-block;
	}

	/* Pill container for chip + new button */
	.chip-group {
		display: inline-flex;
		align-items: stretch;
		border-radius: 0.375rem;
		background: color-mix(in oklch, var(--project-color) 25%, transparent);
		border: 1px solid color-mix(in oklch, var(--project-color) 50%, transparent);
		box-shadow: 0 0 6px color-mix(in oklch, var(--project-color) 15%, transparent);
		transition: all 0.15s ease;
		overflow: hidden;
	}

	.chip-group:hover {
		background: color-mix(in oklch, var(--project-color) 35%, transparent);
		border-color: color-mix(in oklch, var(--project-color) 65%, transparent);
		box-shadow: 0 0 10px color-mix(in oklch, var(--project-color) 25%, transparent);
		transform: scale(1.15);
	}

	/* Main trigger button */
	.trigger-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.3rem 0.5rem;
		background: transparent;
		border: none;
		cursor: pointer;
		font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.025em;
		color: var(--project-color);
		transition: background 0.1s ease;
	}

	.trigger-btn.compact {
		padding: 0.2rem 0.4rem;
		font-size: 0.6875rem;
	}

	.trigger-btn:hover {
		background: color-mix(in oklch, var(--project-color) 10%, transparent);
	}

	.chip-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--project-color);
		flex-shrink: 0;
	}

	.chip-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chevron {
		width: 0.875rem;
		height: 0.875rem;
		opacity: 0.7;
		transition: transform 0.15s ease;
		flex-shrink: 0;
	}

	.chevron.open {
		transform: rotate(180deg);
	}

	/* Hover-expand + button */
	.new-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		max-width: 0;
		padding: 0;
		border: none;
		border-left: 0px solid transparent;
		background: transparent;
		opacity: 0;
		overflow: hidden;
		transition: all 0.2s ease;
		cursor: pointer;
		color: oklch(0.85 0.18 145);
	}

	.chip-group:hover .new-btn {
		max-width: 1.75rem;
		padding: 0 0.3rem;
		border-left: 1px solid color-mix(in oklch, var(--project-color) 35%, transparent);
		opacity: 1;
	}

	.new-btn:hover {
		background: oklch(0.30 0.08 145 / 0.3);
	}

	.new-icon {
		width: 0.875rem;
		height: 0.875rem;
		flex-shrink: 0;
	}

	/* Dropdown */
	.dropdown-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		min-width: 16rem;
		max-width: 22rem;
		padding: 0.25rem;
		border-radius: 0.5rem;
		background: oklch(0.18 0.01 250);
		border: 1px solid oklch(0.28 0.02 250 / 0.5);
		box-shadow: 0 8px 24px oklch(0 0 0 / 0.4);
		z-index: 60;
		animation: dropdown-in 0.12s ease-out;
	}

	@keyframes dropdown-in {
		from { opacity: 0; transform: translateY(-4px); }
		to { opacity: 1; transform: translateY(0); }
	}

	/* Section header */
	.dropdown-section-header {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: oklch(0.50 0.02 250);
		padding: 0.375rem 0.5rem 0.25rem;
	}

	.dropdown-divider {
		height: 1px;
		background: oklch(0.26 0.02 250);
		margin: 0.25rem 0;
	}

	/* Dropdown items (shared) */
	.dropdown-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.375rem 0.5rem;
		border-radius: 0.375rem;
		border: none;
		background: transparent;
		cursor: pointer;
		font-size: 0.75rem;
		color: oklch(0.75 0.02 250);
		transition: background 0.1s ease;
		text-align: left;
	}

	.dropdown-item:hover:not(:disabled) {
		background: oklch(0.24 0.02 250);
		color: oklch(0.92 0.02 250);
	}

	.dropdown-item:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* Project items */
	.project-item {
		font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}

	.project-item:hover:not(:disabled) {
		background: color-mix(in oklch, var(--project-color) 15%, transparent);
		color: var(--project-color);
	}

	.project-item.active {
		color: var(--project-color);
	}

	.item-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--project-color);
		flex-shrink: 0;
		opacity: 0.8;
	}

	.project-item.active .item-dot {
		opacity: 1;
		box-shadow: 0 0 5px color-mix(in oklch, var(--project-color) 50%, transparent);
	}

	.item-label {
		flex: 1;
		text-align: left;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.task-title {
		max-width: none;
	}

	.check-icon {
		width: 0.875rem;
		height: 0.875rem;
		flex-shrink: 0;
		color: var(--project-color);
	}

	/* Task items */
	.task-item {
		font-size: 0.8125rem;
	}

	/* Action items */
	.action-item {
		font-size: 0.8125rem;
	}

	.action-icon {
		width: 0.875rem;
		height: 0.875rem;
		flex-shrink: 0;
	}

	.action-start {
		color: oklch(0.75 0.15 200);
	}

	.action-swarm {
		color: oklch(0.80 0.15 85);
	}

	.action-item:hover .action-start {
		color: oklch(0.90 0.15 200);
	}

	.action-item:hover .action-swarm {
		color: oklch(0.92 0.15 85);
	}

	.epic-icon {
		font-size: 0.875rem;
		flex-shrink: 0;
	}

	.dropdown-hint {
		margin-left: auto;
		font-size: 0.6875rem;
		color: oklch(0.50 0.02 250);
		flex-shrink: 0;
	}

	/* Priority badges */
	.priority-badge {
		font-size: 0.5625rem;
		font-weight: 700;
		padding: 0.0625rem 0.3rem;
		border-radius: 0.25rem;
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

	/* Scrollable task list */
	.dropdown-scroll {
		max-height: 12rem;
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
</style>
