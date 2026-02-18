/**
 * Recommendation Utils - Calculate and display "Recommended" badges for highest-impact ready tasks
 *
 * Scoring factors:
 * 1. Unblocks Most - Tasks that unblock the most other tasks get higher scores
 * 2. Has Waiting Agents - Tasks are prioritized if idle agents are available
 * 3. Critical Path - Tasks in epics with active workers are more urgent
 *
 * Task: squad-puza.4 - Smart recommendations badges in TaskTable
 */

export interface Task {
	id: string;
	title?: string;
	description?: string;
	status: string;
	priority: number;
	issue_type?: string;
	assignee?: string;
	labels?: string[];
	depends_on?: Array<{ id: string; status?: string; title?: string; priority?: number }>;
	created_at?: string;
	updated_at?: string;
}

export interface Agent {
	name: string;
	last_active_ts?: string;
	task?: string | null;
}

export interface RecommendationScore {
	score: number;
	reasons: string[];
	isRecommended: boolean;
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
 * Check if task is ready (open and no unresolved dependencies)
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
 * Calculate recommendation score for a task
 *
 * Scoring (0-100 scale):
 * - Base score for ready tasks: 20
 * - Unblocks bonus: +10 per task unblocked (max +30)
 * - Active epic bonus: +20 if part of epic with agents working
 * - Idle agents bonus: +15 if there are idle agents available
 * - Priority bonus: +5 for P0, +3 for P1, +1 for P2
 *
 * A task is "recommended" if score >= 40
 */
export function calculateRecommendationScore(
	task: Task,
	allTasks: Task[],
	agents: Agent[],
	options?: {
		/** Threshold for marking as recommended (default: 40) */
		threshold?: number;
	}
): RecommendationScore {
	const threshold = options?.threshold ?? 40;
	const reasons: string[] = [];
	let score = 0;

	// Only score ready tasks (open + no blockers)
	if (!isTaskReady(task)) {
		return { score: 0, reasons: [], isRecommended: false };
	}

	// Base score for ready tasks
	score += 20;

	// 1. Unblocks Most: Count how many tasks this task blocks
	const blockedTasks = allTasks.filter(
		(t) => t.depends_on?.some((d) => d.id === task.id) && t.status !== 'closed'
	);
	if (blockedTasks.length > 0) {
		const unblockBonus = Math.min(blockedTasks.length * 10, 30);
		score += unblockBonus;
		reasons.push(`Unblocks ${blockedTasks.length}`);
	}

	// 2. Active Epic: Check if part of an epic with other agents working
	const epicId = getParentEpicId(task.id);
	if (epicId) {
		// Find other tasks in the same epic that are in_progress
		const epicSiblings = allTasks.filter((t) => {
			const parent = getParentEpicId(t.id);
			return parent === epicId && t.id !== task.id;
		});
		const workingSiblings = epicSiblings.filter((t) => t.status === 'in_progress');

		if (workingSiblings.length > 0) {
			score += 20;
			reasons.push('Active epic');
		}
	}

	// 3. Idle Agents: Check if there are agents without active tasks
	const workingAgentTasks = new Set(agents.filter((a) => a.task).map((a) => a.task));
	const idleAgents = agents.filter((a) => !a.task || !workingAgentTasks.has(a.task));
	const hasIdleAgents = idleAgents.length > 0;

	if (hasIdleAgents) {
		score += 15;
		// Don't add as reason - it applies to all tasks equally
	}

	// 4. Priority bonus
	if (task.priority === 0) {
		score += 5;
		reasons.push('Critical');
	} else if (task.priority === 1) {
		score += 3;
	} else if (task.priority === 2) {
		score += 1;
	}

	const isRecommended = score >= threshold;

	return { score, reasons, isRecommended };
}

/**
 * Get recommended tasks from a list, sorted by score
 */
export function getRecommendedTasks(
	tasks: Task[],
	allTasks: Task[],
	agents: Agent[],
	options?: {
		/** Maximum number of recommended tasks to return */
		limit?: number;
		/** Minimum score threshold */
		threshold?: number;
	}
): Array<Task & { recommendationScore: RecommendationScore }> {
	const limit = options?.limit ?? 3;
	const threshold = options?.threshold ?? 40;

	const tasksWithScores = tasks
		.map((task) => ({
			...task,
			recommendationScore: calculateRecommendationScore(task, allTasks, agents, { threshold })
		}))
		.filter((t) => t.recommendationScore.isRecommended)
		.sort((a, b) => b.recommendationScore.score - a.recommendationScore.score);

	return tasksWithScores.slice(0, limit);
}

/**
 * Check if a specific task is recommended
 */
export function isTaskRecommended(
	taskId: string,
	tasks: Task[],
	allTasks: Task[],
	agents: Agent[]
): boolean {
	const task = tasks.find((t) => t.id === taskId);
	if (!task) return false;

	const score = calculateRecommendationScore(task, allTasks, agents);
	return score.isRecommended;
}

/**
 * Get the top recommended task IDs for quick lookup
 */
export function getRecommendedTaskIds(
	tasks: Task[],
	allTasks: Task[],
	agents: Agent[],
	limit: number = 3
): Set<string> {
	const recommended = getRecommendedTasks(tasks, allTasks, agents, { limit });
	return new Set(recommended.map((t) => t.id));
}
