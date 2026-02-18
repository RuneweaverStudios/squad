/**
 * Dependency Analysis Utilities
 *
 * Provides functions to analyze task dependencies, identify blockers,
 * and determine if tasks can be assigned.
 */

import type { Task } from '$lib/stores/agents.svelte';

export interface DependencyStatus {
	hasBlockers: boolean;
	hasBlockedTasks: boolean;
	blockerCount: number;
	blockedCount: number;
	unresolvedBlockers: Array<{
		id: string;
		title: string;
		status: string;
		priority: number;
	}>;
	blockedTasks: Array<{
		id: string;
		title: string;
		status: string;
		priority: number;
	}>;
	canBeAssigned: boolean;
	blockingReason: string | null;
}

/**
 * Analyze a task's dependency status
 */
export function analyzeDependencies(task: Task): DependencyStatus {
	const unresolvedBlockers = (task.depends_on || []).filter(
		(dep) => dep.status !== 'closed'
	);

	const blockedTasks = task.blocked_by || [];

	const hasBlockers = unresolvedBlockers.length > 0;
	const canBeAssigned = !hasBlockers;

	let blockingReason = null;
	if (hasBlockers) {
		blockingReason = `Blocked by ${unresolvedBlockers.length} unresolved ${
			unresolvedBlockers.length === 1 ? 'task' : 'tasks'
		}`;
	}

	return {
		hasBlockers,
		hasBlockedTasks: blockedTasks.length > 0,
		blockerCount: unresolvedBlockers.length,
		blockedCount: blockedTasks.length,
		unresolvedBlockers,
		blockedTasks,
		canBeAssigned,
		blockingReason
	};
}

/**
 * Get dependency badge configuration
 */
export function getDependencyBadge(depStatus: DependencyStatus): {
	show: boolean;
	text: string;
	color: string;
	icon: string;
	tooltip: string;
} {
	if (depStatus.hasBlockers) {
		return {
			show: true,
			text: `🚫 ${depStatus.blockerCount}`,
			color: 'badge-error',
			icon: '🚫',
			tooltip: `Blocked by ${depStatus.blockerCount} ${
				depStatus.blockerCount === 1 ? 'task' : 'tasks'
			}`
		};
	}

	if (depStatus.hasBlockedTasks) {
		return {
			show: true,
			text: `⚠️ ${depStatus.blockedCount}`,
			color: 'badge-warning',
			icon: '⚠️',
			tooltip: `Blocking ${depStatus.blockedCount} ${
				depStatus.blockedCount === 1 ? 'task' : 'tasks'
			}`
		};
	}

	return {
		show: false,
		text: '',
		color: '',
		icon: '',
		tooltip: ''
	};
}

/**
 * Get agent assignments for dependency tasks
 */
export function getAgentForTask(taskId: string, allTasks: Task[]): string | null {
	const task = allTasks.find(t => t.id === taskId);
	return task?.assignee || null;
}

/**
 * Build full dependency chain (recursive)
 */
export function buildDependencyChain(
	task: Task,
	allTasks: Task[],
	visited = new Set<string>()
): Array<{ level: number; task: Task }> {
	if (visited.has(task.id)) {
		return []; // Prevent infinite loops
	}

	visited.add(task.id);

	const chain: Array<{ level: number; task: Task }> = [];

	// Add direct blockers at level 1
	if (task.depends_on) {
		task.depends_on.forEach((dep) => {
			const blockerTask = allTasks.find(t => t.id === dep.id);
			if (blockerTask) {
				chain.push({ level: 1, task: blockerTask });

				// Recursively add blockers of blockers
				const subChain = buildDependencyChain(blockerTask, allTasks, visited);
				subChain.forEach((item) => {
					chain.push({ level: item.level + 1, task: item.task });
				});
			}
		});
	}

	return chain;
}

/**
 * Format dependency chain for display
 */
export function formatDependencyChain(chain: Array<{ level: number; task: Task }>): string {
	if (chain.length === 0) return 'No dependencies';

	const lines: string[] = [];
	chain.forEach(({ level, task }) => {
		const indent = '  '.repeat(level - 1);
		const prefix = level > 1 ? '↳ ' : '→ ';
		lines.push(`${indent}${prefix}${task.id}: ${task.title} (${task.status})`);
	});

	return lines.join('\n');
}

/**
 * Critical Path Analysis
 *
 * The critical path is the longest chain of incomplete dependencies from any
 * ready task to the epic (root) completion. Tasks on the critical path are
 * bottlenecks - completing them will shorten the overall epic completion time.
 *
 * Algorithm:
 * 1. Build a dependency graph from epic children
 * 2. For each incomplete task, calculate the longest path to the epic
 * 3. The critical path is the set of tasks on the longest path(s)
 *
 * Task: squad-puza.5 - Critical path highlighting in TaskTable
 */

export interface CriticalPathResult {
	/** Set of task IDs on the critical path */
	criticalPathIds: Set<string>;
	/** Length of the longest dependency chain */
	maxPathLength: number;
	/** Map of task ID to its distance from a ready task */
	pathLengths: Map<string, number>;
}

/**
 * Get parent epic ID from a task ID
 * e.g., "squad-puza.4" -> "squad-puza"
 */
function getParentEpicId(taskId: string): string | null {
	const dotIndex = taskId.lastIndexOf('.');
	if (dotIndex === -1) return null;
	return taskId.substring(0, dotIndex);
}

/**
 * Check if a task is "ready" (open with no unresolved dependencies)
 */
function isTaskReady(task: Task): boolean {
	if (task.status !== 'open') return false;
	if (task.depends_on && task.depends_on.length > 0) {
		const hasBlockingDep = task.depends_on.some((dep) => dep.status !== 'closed');
		if (hasBlockingDep) return false;
	}
	return true;
}

/**
 * Calculate critical path for tasks within an epic
 *
 * For a given epic, finds the longest chain of incomplete tasks that must
 * be completed before the epic can be finished.
 *
 * @param epicId - The epic task ID (e.g., "squad-puza")
 * @param allTasks - All tasks in the system
 * @returns Critical path analysis result
 */
export function calculateCriticalPath(epicId: string, allTasks: Task[]): CriticalPathResult {
	// Find all child tasks of this epic
	const epicChildren = allTasks.filter((t) => {
		const parent = getParentEpicId(t.id);
		return parent === epicId && t.status !== 'closed';
	});

	if (epicChildren.length === 0) {
		return {
			criticalPathIds: new Set<string>(),
			maxPathLength: 0,
			pathLengths: new Map<string, number>()
		};
	}

	// Build a map for quick task lookup
	const taskMap = new Map<string, Task>();
	allTasks.forEach((t) => taskMap.set(t.id, t));

	// Calculate the "forward distance" from each task to the epic
	// This is the length of the longest chain from this task forward (tasks that depend on it)
	const forwardDistances = new Map<string, number>();
	const visited = new Set<string>();

	// DFS to calculate forward distance (how many tasks depend on this transitively)
	function calculateForwardDistance(taskId: string): number {
		if (forwardDistances.has(taskId)) {
			return forwardDistances.get(taskId)!;
		}

		if (visited.has(taskId)) {
			return 0; // Prevent cycles
		}
		visited.add(taskId);

		const task = taskMap.get(taskId);
		if (!task || task.status === 'closed') {
			forwardDistances.set(taskId, 0);
			return 0;
		}

		// Find all incomplete tasks that directly depend on this task
		const dependents = allTasks.filter(
			(t) =>
				t.depends_on?.some((d) => d.id === taskId) &&
				t.status !== 'closed' &&
				getParentEpicId(t.id) === epicId
		);

		if (dependents.length === 0) {
			// This task directly blocks the epic (or has no dependents)
			forwardDistances.set(taskId, 1);
			return 1;
		}

		// Forward distance is 1 + max of all dependent distances
		let maxDepDist = 0;
		for (const dep of dependents) {
			const depDist = calculateForwardDistance(dep.id);
			maxDepDist = Math.max(maxDepDist, depDist);
		}

		const dist = 1 + maxDepDist;
		forwardDistances.set(taskId, dist);
		return dist;
	}

	// Calculate forward distance for all incomplete epic children
	for (const child of epicChildren) {
		calculateForwardDistance(child.id);
	}

	// Find the maximum path length
	let maxPathLength = 0;
	for (const dist of forwardDistances.values()) {
		maxPathLength = Math.max(maxPathLength, dist);
	}

	// Find all tasks on the critical path(s)
	// A task is on the critical path if it's part of a chain of length maxPathLength
	const criticalPathIds = new Set<string>();

	// For each ready task with max distance, trace the critical path forward
	function tracePathForward(taskId: string, remainingLength: number): void {
		if (remainingLength <= 0) return;

		const task = taskMap.get(taskId);
		if (!task || task.status === 'closed') return;

		criticalPathIds.add(taskId);

		// Find dependents that continue the critical path
		const dependents = allTasks.filter(
			(t) =>
				t.depends_on?.some((d) => d.id === taskId) &&
				t.status !== 'closed' &&
				getParentEpicId(t.id) === epicId
		);

		for (const dep of dependents) {
			const depDist = forwardDistances.get(dep.id) || 0;
			// If this dependent continues the critical path
			if (depDist === remainingLength - 1) {
				tracePathForward(dep.id, remainingLength - 1);
			}
		}
	}

	// Start from tasks that begin critical paths
	for (const child of epicChildren) {
		const dist = forwardDistances.get(child.id) || 0;
		if (dist === maxPathLength) {
			// Check if this task is ready or blocked by closed tasks only
			const blockedByIncomplete = child.depends_on?.some((d) => {
				const depTask = taskMap.get(d.id);
				return depTask && depTask.status !== 'closed' && getParentEpicId(d.id) === epicId;
			});

			if (!blockedByIncomplete) {
				tracePathForward(child.id, dist);
			}
		}
	}

	return {
		criticalPathIds,
		maxPathLength,
		pathLengths: forwardDistances
	};
}

/**
 * Calculate critical paths for all incomplete epics in the task list
 *
 * @param allTasks - All tasks in the system
 * @returns Map of epic ID to its critical path result
 */
export function calculateAllCriticalPaths(allTasks: Task[]): Map<string, CriticalPathResult> {
	const results = new Map<string, CriticalPathResult>();

	// Find all epic IDs from task IDs
	const epicIds = new Set<string>();
	for (const task of allTasks) {
		const epicId = getParentEpicId(task.id);
		if (epicId && task.status !== 'closed') {
			// Check if the epic itself exists and is not closed
			const epicTask = allTasks.find((t) => t.id === epicId);
			if (epicTask && epicTask.status !== 'closed') {
				epicIds.add(epicId);
			}
		}
	}

	// Calculate critical path for each epic
	for (const epicId of epicIds) {
		results.set(epicId, calculateCriticalPath(epicId, allTasks));
	}

	return results;
}

/**
 * Check if a task is on the critical path
 *
 * @param taskId - The task ID to check
 * @param criticalPaths - Map of epic ID to critical path results
 * @returns true if the task is on any critical path
 */
export function isOnCriticalPath(
	taskId: string,
	criticalPaths: Map<string, CriticalPathResult>
): boolean {
	const epicId = getParentEpicId(taskId);
	if (!epicId) return false;

	const result = criticalPaths.get(epicId);
	if (!result) return false;

	return result.criticalPathIds.has(taskId);
}

/**
 * Get critical path info for display
 *
 * @param taskId - The task ID
 * @param criticalPaths - Map of epic ID to critical path results
 * @returns Badge info for the critical path indicator
 */
export function getCriticalPathBadge(
	taskId: string,
	criticalPaths: Map<string, CriticalPathResult>
): {
	show: boolean;
	pathLength: number;
	tooltip: string;
} {
	const epicId = getParentEpicId(taskId);
	if (!epicId) {
		return { show: false, pathLength: 0, tooltip: '' };
	}

	const result = criticalPaths.get(epicId);
	if (!result || !result.criticalPathIds.has(taskId)) {
		return { show: false, pathLength: 0, tooltip: '' };
	}

	const pathLength = result.pathLengths.get(taskId) || 0;

	return {
		show: true,
		pathLength,
		tooltip: `Critical path: ${pathLength} ${pathLength === 1 ? 'task' : 'tasks'} to epic completion`
	};
}
