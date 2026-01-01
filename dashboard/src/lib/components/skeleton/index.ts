/**
 * Skeleton Loading Components
 *
 * Animated placeholder components shown during initial data loading.
 * These provide a smoother UX than spinners by showing the layout structure.
 *
 * Usage:
 * ```svelte
 * import { TaskTableSkeleton, SessionCardSkeleton, SessionPanelSkeleton, AgentGridSkeleton } from '$lib/components/skeleton';
 *
 * {#if isLoading}
 *   <TaskTableSkeleton rows={8} showFilters={true} />
 * {:else}
 *   <TaskTable {tasks} />
 * {/if}
 * ```
 */

export { default as TaskTableSkeleton } from './TaskTableSkeleton.svelte';
export { default as SessionCardSkeleton } from './SessionCardSkeleton.svelte';
export { default as SessionPanelSkeleton } from './SessionPanelSkeleton.svelte';
export { default as AgentGridSkeleton } from './AgentGridSkeleton.svelte';
export { default as KanbanSkeleton } from './KanbanSkeleton.svelte';
export { default as ProjectsTableSkeleton } from './ProjectsTableSkeleton.svelte';
export { default as GraphSkeleton } from './GraphSkeleton.svelte';
export { default as TimelineSkeleton } from './TimelineSkeleton.svelte';
export { default as TriageSkeleton } from './TriageSkeleton.svelte';
export { default as TaskDetailSkeleton } from './TaskDetailSkeleton.svelte';
export { default as HistorySkeleton } from './HistorySkeleton.svelte';
export { default as FilesSkeleton } from './FilesSkeleton.svelte';
