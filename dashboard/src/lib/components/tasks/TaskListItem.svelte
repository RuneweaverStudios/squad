<script lang="ts">
	import DependencyIndicator from '$lib/components/DependencyIndicator.svelte';
	import LabelBadges from '$lib/components/LabelBadges.svelte';
	import TaskIdBadge from '$lib/components/TaskIdBadge.svelte';
	import { analyzeDependencies } from '$lib/utils/dependencyUtils';
	import { getPriorityBadge, getTaskStatusBadge } from '$lib/utils/badgeHelpers';
	import { formatRelativeTime, formatFullDate, getAgeColorClass } from '$lib/utils/dateFormatters';
	import { STATUS_ICONS } from '$lib/config/statusColors';
	import type { Task } from '$lib/types/api.types';

	/**
	 * TaskListItem - Unified task display component
	 *
	 * Consolidates task rendering across the dashboard into a single component
	 * with multiple display formats:
	 * - 'card': Full card view with description (used in TaskQueue sidebar)
	 * - 'row': Table row format (used in TaskTable)
	 * - 'compact': Minimal inline display (used in dependency lists, quick references)
	 */

	interface Props {
		task: Task;
		allTasks?: Task[];
		format?: 'card' | 'row' | 'compact';
		showLabels?: boolean;
		showDeps?: boolean;
		showDescription?: boolean;
		showTimestamp?: boolean;
		draggable?: boolean;
		selected?: boolean;
		blocked?: boolean;
		active?: boolean;
		onclick?: (taskId: string) => void;
		ondragstart?: (event: DragEvent) => void;
		ondragend?: (event: DragEvent) => void;
		class?: string;
	}

	let {
		task,
		allTasks = [],
		format = 'card',
		showLabels = true,
		showDeps = true,
		showDescription = true,
		showTimestamp = false,
		draggable = false,
		selected = false,
		blocked = false,
		active = false,
		onclick,
		ondragstart,
		ondragend,
		class: className = ''
	}: Props = $props();

	// Analyze task dependencies
	const depStatus = $derived(analyzeDependencies(task));
	const isBlocked = $derived(blocked || depStatus.hasBlockers);
</script>

{#if format === 'card'}
	<!-- CARD FORMAT: Full card with description (TaskQueue style) -->
	<div
		class="card bg-base-100 border border-base-300 hover:border-primary cursor-pointer transition-all {isBlocked ? 'opacity-60 border-error/30' : ''} {selected ? 'bg-primary/10 border-primary' : ''} {active ? 'bg-info/10' : ''} {className}"
		draggable={draggable ? 'true' : undefined}
		data-task-id={task.id}
		ondragstart={ondragstart}
		ondragend={ondragend}
		onclick={() => onclick?.(task.id)}
		title={isBlocked ? `Blocked: ${depStatus.blockingReason}` : ''}
		role="button"
		tabindex="0"
		onkeydown={(e) => e.key === 'Enter' && onclick?.(task.id)}
	>
		<div class="card-body p-3 relative">
			<!-- Task ID badge on left -->
			<div class="absolute -top-2 left-2">
				<TaskIdBadge {task} size="xs" showStatus={false} showType={false} copyOnly />
			</div>

			<!-- Priority and Dependency badges on right -->
			<div class="absolute -top-2 right-2 flex items-center gap-1">
				{#if showDeps}
					<DependencyIndicator {task} allTasks={allTasks.length > 0 ? allTasks : [task]} size="sm" />
				{/if}
				<span class="badge badge-sm {getPriorityBadge(task.priority)}">
					P{task.priority}
				</span>
			</div>

			<!-- Task Title -->
			<div class="mt-1.5 -mb-1">
				<h3 class="font-medium text-sm text-base-content truncate" title={task.title}>
					{task.title}
				</h3>
			</div>

			<!-- Task Description (truncated) -->
			{#if showDescription && task.description}
				<p class="text-xs text-base-content/70 line-clamp-4">
					{task.description}
				</p>
			{/if}

			<!-- Labels -->
			{#if showLabels && task.labels && task.labels.length > 0}
				<LabelBadges labels={task.labels} maxDisplay={3} class="mt-2" />
			{/if}
		</div>
	</div>

{:else if format === 'row'}
	<!-- ROW FORMAT: Table row cells (TaskTable style) -->
	<!-- Note: This renders TD elements - must be used inside a TR -->
	<td class="whitespace-nowrap">
		{#if task.status === 'in_progress' && task.assignee}
			<!-- In progress: show assignee with spinning gear -->
			<span class="flex items-center gap-1.5">
				<svg class="shrink-0 w-4 h-4 text-info animate-spin origin-center" viewBox="0 0 24 24" fill="currentColor" aria-label="Currently in progress">
					<title>Currently in progress</title>
					<path d={STATUS_ICONS.gear} />
				</svg>
				<span class="text-sm font-medium text-info">{task.assignee}</span>
			</span>
		{:else}
			<!-- Other statuses: show regular badge -->
			<span class="badge badge-sm {getTaskStatusBadge(task.status)}">
				{task.status?.replace('_', ' ')}
			</span>
		{/if}
	</td>
	<td>
		<div>
			<div class="font-medium text-sm">{task.title}</div>
			{#if showDescription && task.description}
				<div class="text-xs text-base-content/50">
					{task.description}
				</div>
			{/if}
		</div>
	</td>
	<td class="text-center">
		<span class="badge badge-sm {getPriorityBadge(task.priority)}">
			P{task.priority}
		</span>
	</td>
	<td>
		{#if showLabels && task.labels && task.labels.length > 0}
			<LabelBadges labels={task.labels} maxDisplay={2} />
		{:else}
			<span class="text-base-content/30">-</span>
		{/if}
	</td>
	<td class="whitespace-nowrap">
		{#if showDeps}
			<DependencyIndicator {task} allTasks={allTasks.length > 0 ? allTasks : [task]} size="sm" />
		{/if}
	</td>
	{#if showTimestamp}
		<td>
			<span class="text-xs {getAgeColorClass(task.updated_ts)}" title={formatFullDate(task.updated_ts)}>
				{formatRelativeTime(task.updated_ts)}
			</span>
		</td>
	{/if}

{:else if format === 'compact'}
	<!-- COMPACT FORMAT: Minimal inline display -->
	<div
		class="flex items-center gap-2 px-2 py-1 rounded hover:bg-base-200 cursor-pointer {isBlocked ? 'opacity-60' : ''} {selected ? 'bg-primary/10' : ''} {className}"
		onclick={() => onclick?.(task.id)}
		role="button"
		tabindex="0"
		onkeydown={(e) => e.key === 'Enter' && onclick?.(task.id)}
		title={task.title}
	>
		<!-- Task ID -->
		<TaskIdBadge {task} size="xs" minimal showStatus={false} />

		<!-- Status indicator -->
		{#if task.status === 'in_progress'}
			<svg class="shrink-0 w-3.5 h-3.5 text-info animate-spin" viewBox="0 0 24 24" fill="currentColor">
				<path d={STATUS_ICONS.gear} />
			</svg>
		{:else}
			<span class="badge badge-xs {getTaskStatusBadge(task.status)}">
				{task.status?.replace('_', ' ')}
			</span>
		{/if}

		<!-- Title (truncated) -->
		<span class="text-sm truncate flex-1">{task.title}</span>

		<!-- Priority badge -->
		<span class="badge badge-xs {getPriorityBadge(task.priority)} shrink-0">
			P{task.priority}
		</span>

		<!-- Dependency indicator -->
		{#if showDeps && (task.depends_on?.length || task.blocked_by?.length)}
			<DependencyIndicator {task} allTasks={allTasks.length > 0 ? allTasks : [task]} size="xs" />
		{/if}
	</div>
{/if}
