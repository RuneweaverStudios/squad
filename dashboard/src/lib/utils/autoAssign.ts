/**
 * Auto-Assign Algorithm with Conflict Avoidance
 *
 * Intelligently assigns tasks to agents based on:
 * - Agent availability and load
 * - Task priority
 * - File reservation conflicts
 * - Task dependencies
 */

export interface Agent {
	name: string;
	active: boolean;
	task_count: number;
	in_progress_tasks: number;
	reservation_count: number;
}

export interface Task {
	id: string;
	title: string;
	priority: number;
	status: string;
	assignee?: string;
	dependencies?: Array<{ id: string; status: string }>;
}

export interface Reservation {
	agent_name: string;
	path_pattern: string;
	expires_ts: string;
	released_ts?: string;
}

export interface Assignment {
	agent: Agent;
	task: Task;
	confidence: 'high' | 'medium' | 'low';
	warnings: string[];
}

/**
 * Check if a task's file patterns conflict with an agent's existing reservations
 */
function hasFileConflict(
	task: Task,
	agent: Agent,
	reservations: Reservation[]
): { hasConflict: boolean; conflictingPatterns: string[] } {
	// Get active reservations for this agent
	const agentReservations = reservations.filter(r => {
		if (r.agent_name !== agent.name) return false;
		if (r.released_ts) return false;

		const expiresAt = new Date(r.expires_ts);
		return expiresAt > new Date();
	});

	// Extract file patterns from task description (heuristic-based)
	const taskPatterns = extractFilePatterns(task.title + ' ' + (task as any).description || '');

	if (taskPatterns.length === 0) {
		// No patterns detected, assume no conflict
		return { hasConflict: false, conflictingPatterns: [] };
	}

	// Check for overlapping patterns
	const conflicting: string[] = [];

	for (const taskPattern of taskPatterns) {
		for (const reservation of agentReservations) {
			if (patternsOverlap(taskPattern, reservation.path_pattern)) {
				conflicting.push(reservation.path_pattern);
			}
		}
	}

	return {
		hasConflict: conflicting.length > 0,
		conflictingPatterns: [...new Set(conflicting)]
	};
}

/**
 * Extract file patterns from task text using heuristics
 * Looks for common patterns like: dashboard/src/**, src/lib/**, etc.
 */
function extractFilePatterns(text: string): string[] {
	const patterns: string[] = [];

	// Pattern 1: Explicit glob patterns (e.g., "dashboard/**", "src/**/*.ts")
	const globMatch = text.match(/\b[\w-]+\/[*\w/.,-]+\**/g);
	if (globMatch) patterns.push(...globMatch);

	// Pattern 2: Path-like strings with forward slashes
	const pathMatch = text.match(/\b(dashboard|src|lib|components?|routes?|api|utils?)\/[\w/.-]+/gi);
	if (pathMatch) {
		// Convert to glob patterns
		patterns.push(...pathMatch.map(p => p + '/**'));
	}

	// Pattern 3: Labels that indicate file areas
	const labels = (text.match(/\b(dashboard|frontend|backend|api|ui|database)\b/gi) || []);
	for (const label of labels) {
		switch (label.toLowerCase()) {
			case 'dashboard':
				patterns.push('dashboard/**');
				break;
			case 'frontend':
			case 'ui':
				patterns.push('src/routes/**', 'src/lib/components/**');
				break;
			case 'backend':
			case 'api':
				patterns.push('src/routes/api/**', 'src/lib/server/**');
				break;
			case 'database':
				patterns.push('src/lib/db/**', '**/*.sql');
				break;
		}
	}

	return [...new Set(patterns)];
}

/**
 * Check if two file patterns overlap
 * Simplified glob matching for common cases
 */
function patternsOverlap(pattern1: string, pattern2: string): boolean {
	// Exact match
	if (pattern1 === pattern2) return true;

	// Convert patterns to comparable format
	const p1 = pattern1.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
	const p2 = pattern2.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');

	// Check if either pattern matches the other
	try {
		const regex1 = new RegExp(`^${p1}$`);
		const regex2 = new RegExp(`^${p2}$`);

		// Test if patterns overlap by checking common prefixes
		const prefix1 = pattern1.split('**')[0];
		const prefix2 = pattern2.split('**')[0];

		if (prefix1 && prefix2) {
			return prefix1.startsWith(prefix2) || prefix2.startsWith(prefix1);
		}
	} catch (e) {
		// Regex compilation failed, assume overlap for safety
		return true;
	}

	return false;
}

/**
 * Check if task has unmet dependencies
 */
function hasBlockingDependencies(task: Task): { isBlocked: boolean; blockingTasks: string[] } {
	if (!task.dependencies || task.dependencies.length === 0) {
		return { isBlocked: false, blockingTasks: [] };
	}

	const blocking = task.dependencies.filter(dep => dep.status !== 'closed');

	return {
		isBlocked: blocking.length > 0,
		blockingTasks: blocking.map(dep => dep.id)
	};
}

/**
 * Calculate agent load score (lower is better, more available)
 */
function calculateAgentLoad(agent: Agent): number {
	let load = 0;

	// Weight in-progress tasks heavily
	load += agent.in_progress_tasks * 3;

	// Weight queued tasks
	load += (agent.task_count - agent.in_progress_tasks) * 1;

	// Weight active file reservations (indicates busy)
	load += agent.reservation_count * 0.5;

	return load;
}

/**
 * Find the best agent for a task
 */
function findBestAgent(
	task: Task,
	agents: Agent[],
	reservations: Reservation[]
): { agent: Agent | null; warnings: string[]; confidence: 'high' | 'medium' | 'low' } {
	const warnings: string[] = [];

	// Filter to idle or low-load agents
	const availableAgents = agents.filter(a => {
		const load = calculateAgentLoad(a);
		return load < 10; // Arbitrary threshold: less than 10 load units
	});

	if (availableAgents.length === 0) {
		warnings.push('No agents available (all are at capacity)');
		return { agent: null, warnings, confidence: 'low' };
	}

	// Score each agent
	const scores = availableAgents.map(agent => {
		let score = 0;
		const agentWarnings: string[] = [];

		// Check file conflicts
		const conflict = hasFileConflict(task, agent, reservations);
		if (conflict.hasConflict) {
			score -= 100; // Heavy penalty
			agentWarnings.push(`File conflicts: ${conflict.conflictingPatterns.join(', ')}`);
		}

		// Prefer less loaded agents
		const load = calculateAgentLoad(agent);
		score -= load * 5;

		// Prefer active agents (recently used)
		if (agent.active) {
			score += 10;
		}

		return { agent, score, warnings: agentWarnings };
	});

	// Sort by score (descending)
	scores.sort((a, b) => b.score - a.score);

	const best = scores[0];

	if (!best || best.score < -50) {
		warnings.push('No suitable agent found (all have conflicts)');
		return { agent: null, warnings, confidence: 'low' };
	}

	warnings.push(...best.warnings);

	const confidence =
		best.score > 0 && best.warnings.length === 0
			? 'high'
			: best.score > -20
			? 'medium'
			: 'low';

	return { agent: best.agent, warnings, confidence };
}

/**
 * Generate auto-assignment recommendations
 *
 * Algorithm:
 * 1. Sort unassigned tasks by priority (P0 > P1 > P2)
 * 2. For each task:
 *    a. Check dependencies
 *    b. Find best available agent (considering load and conflicts)
 *    c. Create assignment recommendation
 * 3. Return list of assignments for user review
 */
export function generateAutoAssignments(
	unassignedTasks: Task[],
	agents: Agent[],
	reservations: Reservation[]
): Assignment[] {
	const assignments: Assignment[] = [];

	// Sort tasks by priority (lower number = higher priority)
	const sortedTasks = [...unassignedTasks].sort((a, b) => {
		if (a.priority !== b.priority) {
			return a.priority - b.priority;
		}
		// Secondary sort by ID for consistency
		return a.id.localeCompare(b.id);
	});

	// Track which agents we've assigned in this batch
	const assignedAgents = new Set<string>();

	for (const task of sortedTasks) {
		const warnings: string[] = [];

		// Check dependencies
		const depCheck = hasBlockingDependencies(task);
		if (depCheck.isBlocked) {
			warnings.push(`Blocked by: ${depCheck.blockingTasks.join(', ')}`);
			// Skip this task
			continue;
		}

		// Filter out agents already assigned in this batch
		const availableAgents = agents.filter(a => !assignedAgents.has(a.name));

		if (availableAgents.length === 0) {
			warnings.push('All agents assigned in this batch');
			break; // No more agents available
		}

		// Find best agent
		const result = findBestAgent(task, availableAgents, reservations);

		if (result.agent) {
			assignments.push({
				agent: result.agent,
				task,
				confidence: result.confidence,
				warnings: [...warnings, ...result.warnings]
			});

			// Mark agent as assigned for this batch
			assignedAgents.add(result.agent.name);
		}
	}

	return assignments;
}
