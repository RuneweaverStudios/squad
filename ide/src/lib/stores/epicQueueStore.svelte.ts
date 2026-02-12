/**
 * Epic Queue Store
 *
 * Manages state for epic swarm execution - tracking which epic is running,
 * its children tasks, execution settings, and progress.
 *
 * Interface:
 * - state.epicId: string | null - Currently executing epic ID
 * - state.children: EpicChild[] - Children tasks with their status
 * - state.settings: ExecutionSettings - Parallel/sequential, review threshold, etc.
 * - state.progress: { completed: number, total: number }
 * - state.runningAgents: string[] - Agent names currently working on epic children
 * - launchEpic(epicId, settings) - Begin epic execution with API fetch and agent spawning
 * - startEpic(epicId, epicTitle, children, settings) - Initialize epic state (internal)
 * - completeTask(taskId) - Mark a child task as completed
 * - getNextReadyTask() - Get next task ready for assignment
 * - isEpicComplete() - Check if all children are done
 * - stopEpic() - Stop epic execution
 * - updateTaskStatus(taskId, status) - Update a child's status
 * - addRunningAgent(agentName) - Track agent working on epic
 * - removeRunningAgent(agentName) - Remove agent from tracking
 * - spawnNextAgent() - Spawn next agent for ready task (if under maxConcurrent)
 */

import type { Task } from '$lib/types/api.types';
import { SPAWN_STAGGER_MS, DEFAULT_MODEL } from '$lib/config/spawnConfig';
import { spawnInBatches, type SpawnResult as BatchSpawnResult, getActiveSessionCount } from '$lib/utils/spawnBatch';
import { getMaxSessions } from '$lib/stores/preferences.svelte';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Review threshold options - which priority tasks require manual review
 */
export type ReviewThreshold = 'all' | 'p0' | 'p0-p1' | 'p0-p2' | 'none';

/**
 * Execution mode - parallel or sequential
 */
export type ExecutionMode = 'parallel' | 'sequential';

/**
 * Child task status within the epic execution
 */
export type ChildStatus = 'pending' | 'ready' | 'in_progress' | 'completed' | 'blocked';

/**
 * Child task in the epic queue
 */
export interface EpicChild {
	id: string;
	title: string;
	priority: number;
	status: ChildStatus;
	assignee?: string;
	dependsOn?: string[]; // Task IDs this child depends on
}

/**
 * Execution settings for the epic swarm
 */
export interface ExecutionSettings {
	mode: ExecutionMode;
	reviewThreshold: ReviewThreshold;
	maxConcurrent: number;
	autoSpawn: boolean;
}

/**
 * Result of a spawn operation (re-exported from spawnBatch utility)
 */
export type SpawnResult = BatchSpawnResult;

/**
 * Epic queue state
 */
interface EpicQueueState {
	epicId: string | null;
	epicTitle: string | null;
	children: EpicChild[];
	settings: ExecutionSettings;
	progress: {
		completed: number;
		total: number;
	};
	runningAgents: string[];
	isActive: boolean;
	startedAt: Date | null;
	// Spawning state
	isSpawning: boolean;
	spawnQueue: string[]; // Task IDs queued for spawning
	spawnedSessions: Map<string, string>; // taskId -> sessionName
	lastSpawnError: string | null;
}

// =============================================================================
// PERSISTENCE
// =============================================================================

const STORAGE_KEY = 'epic-queue-active';

interface PersistedEpicState {
	epicId: string;
	settings: ExecutionSettings;
}

/**
 * Save active epic to localStorage for persistence across page refreshes
 */
function persistActiveEpic(epicId: string, settings: ExecutionSettings): void {
	if (typeof window === 'undefined') return;
	try {
		const data: PersistedEpicState = { epicId, settings };
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
		console.log('[epicQueueStore] Persisted active epic:', epicId);
	} catch (e) {
		console.error('[epicQueueStore] Failed to persist epic state:', e);
	}
}

/**
 * Clear persisted epic state
 */
function clearPersistedEpic(): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.removeItem(STORAGE_KEY);
		console.log('[epicQueueStore] Cleared persisted epic state');
	} catch (e) {
		console.error('[epicQueueStore] Failed to clear persisted epic:', e);
	}
}

/**
 * Write active epic file to /tmp so agents can check before auto-proceeding
 * This prevents standalone agents from grabbing epic children
 */
async function writeActiveEpicFile(
	epicId: string,
	epicTitle: string,
	taskIds: string[],
	reviewThreshold: string
): Promise<void> {
	try {
		const response = await fetch('/api/epics/active', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ epicId, epicTitle, taskIds, reviewThreshold })
		});
		if (!response.ok) {
			console.error('[epicQueueStore] Failed to write active epic file:', await response.text());
		} else {
			console.log(`[epicQueueStore] Wrote active epic file: ${epicId} with ${taskIds.length} tasks`);
		}
	} catch (e) {
		console.error('[epicQueueStore] Error writing active epic file:', e);
	}
}

/**
 * Clear active epic file when stopping the epic
 */
async function clearActiveEpicFile(): Promise<void> {
	try {
		const response = await fetch('/api/epics/active', { method: 'DELETE' });
		if (!response.ok) {
			console.error('[epicQueueStore] Failed to clear active epic file:', await response.text());
		} else {
			console.log('[epicQueueStore] Cleared active epic file');
		}
	} catch (e) {
		console.error('[epicQueueStore] Error clearing active epic file:', e);
	}
}

/**
 * Get persisted epic state if available
 */
function getPersistedEpic(): PersistedEpicState | null {
	if (typeof window === 'undefined') return null;
	try {
		const data = localStorage.getItem(STORAGE_KEY);
		if (data) {
			const parsed = JSON.parse(data) as PersistedEpicState;
			console.log('[epicQueueStore] Found persisted epic:', parsed.epicId);
			return parsed;
		}
	} catch (e) {
		console.error('[epicQueueStore] Failed to read persisted epic:', e);
	}
	return null;
}

// =============================================================================
// DEFAULT VALUES
// =============================================================================

const defaultSettings: ExecutionSettings = {
	mode: 'parallel',
	reviewThreshold: 'p0-p1',
	maxConcurrent: 4,
	autoSpawn: true
};

const defaultState: EpicQueueState = {
	epicId: null,
	epicTitle: null,
	children: [],
	settings: { ...defaultSettings },
	progress: { completed: 0, total: 0 },
	runningAgents: [],
	isActive: false,
	startedAt: null,
	// Spawning state
	isSpawning: false,
	spawnQueue: [],
	spawnedSessions: new Map(),
	lastSpawnError: null
};

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

// Reactive state using Svelte 5 runes
let state = $state<EpicQueueState>({ ...defaultState });

/**
 * Start epic execution with the given settings (internal - initializes state)
 * @param epicId - The epic task ID to execute
 * @param epicTitle - The epic title for display
 * @param children - Child tasks to execute
 * @param settings - Execution settings (optional, uses defaults)
 */
export function startEpic(
	epicId: string,
	epicTitle: string,
	children: Task[],
	settings: Partial<ExecutionSettings> = {}
): void {
	// Build children list with status
	const epicChildren: EpicChild[] = children.map((task) => ({
		id: task.id,
		title: task.title,
		priority: task.priority,
		status: determineInitialStatus(task, children),
		assignee: task.assignee,
		dependsOn: task.depends_on?.map((d) => d.id)
	}));

	// Mutate properties instead of reassigning (required for Svelte 5 exported state)
	state.epicId = epicId;
	state.epicTitle = epicTitle;
	state.children = epicChildren;
	state.settings = { ...defaultSettings, ...settings };
	state.progress = {
		completed: epicChildren.filter((c) => c.status === 'completed').length,
		total: epicChildren.length
	};
	state.runningAgents = [];
	state.isActive = true;
	state.startedAt = new Date();
	// Reset spawning state
	state.isSpawning = false;
	state.spawnQueue = [];
	state.spawnedSessions = new Map();
	state.lastSpawnError = null;
}

// =============================================================================
// EPIC LAUNCH & SPAWNING
// =============================================================================

/**
 * API response type for epic children
 */
interface EpicChildrenResponse {
	epicId: string;
	epicTitle: string;
	children: Array<{
		id: string;
		title: string;
		priority: number;
		status: string;
		issue_type: string;
		assignee?: string;
		isBlocked: boolean;
		blockedBy: string[];
	}>;
	summary: {
		total: number;
		open: number;
		inProgress: number;
		closed: number;
		blocked: number;
		ready: number;
	};
}

/**
 * Launch epic execution with API fetch and agent spawning
 * This is the main entry point for starting an epic swarm.
 *
 * @param epicId - The epic task ID to execute
 * @param settings - Execution settings (reviewThreshold, maxConcurrent, autoSpawn, mode)
 * @returns Promise with success status and any errors
 */
export async function launchEpic(
	epicId: string,
	settings: Partial<ExecutionSettings> = {}
): Promise<{ success: boolean; error?: string; spawnResults?: SpawnResult[] }> {
	try {
		// Clear any previous error
		state.lastSpawnError = null;

		// 1. Fetch children from API
		const response = await fetch(`/api/epics/${epicId}/children`);
		if (!response.ok) {
			const errorData = await response.json();
			const errorMsg = errorData.error || 'Failed to fetch epic children';
			state.lastSpawnError = errorMsg;
			return { success: false, error: errorMsg };
		}

		const data: EpicChildrenResponse = await response.json();

		// 2. Convert API children to Task format for startEpic
		const childrenAsTasks: Task[] = data.children.map((child) => ({
			id: child.id,
			title: child.title,
			description: '', // Not needed for epic queue
			priority: child.priority,
			status: child.status as Task['status'],
			issue_type: child.issue_type as Task['issue_type'],
			project: '', // Not needed for epic queue
			assignee: child.assignee,
			labels: [],
			depends_on: child.blockedBy.map((id) => ({ id, status: 'open', title: '', priority: 0 }))
		}));

		// 3. Initialize epic state
		const mergedSettings = { ...defaultSettings, ...settings };
		startEpic(epicId, data.epicTitle, childrenAsTasks, mergedSettings);

		// 4. Persist to localStorage for page refresh survival
		persistActiveEpic(epicId, mergedSettings);

		// 5. Write active epic file so agents know not to grab these tasks
		const childTaskIds = data.children.map((c: { id: string }) => c.id);
		await writeActiveEpicFile(epicId, data.epicTitle, childTaskIds, mergedSettings.reviewThreshold);

		// 6. If autoSpawn is enabled, spawn initial agents
		if (mergedSettings.autoSpawn) {
			const spawnResults = await spawnInitialAgents();
			return { success: true, spawnResults };
		}

		return { success: true };
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : 'Unknown error launching epic';
		state.lastSpawnError = errorMsg;
		return { success: false, error: errorMsg };
	}
}

/**
 * Spawn initial agents for ready tasks up to maxConcurrent limit
 * Called automatically by launchEpic when autoSpawn is enabled.
 *
 * Uses spawnInBatches() for batched concurrent spawning with staggered starts.
 * Each batch spawns batchSize tasks simultaneously, then waits for the batch
 * to complete before starting the next.
 *
 * @returns Array of spawn results
 */
export async function spawnInitialAgents(): Promise<SpawnResult[]> {
	const startTime = Date.now();
	console.log(`[epic spawn] ========== EPIC SPAWN STARTED ==========`);
	console.log(`[epic spawn] isActive=${state.isActive}, mode=${state.settings.mode}`);

	if (!state.isActive) {
		console.log(`[epic spawn] BLOCKED: No active epic`);
		return [{ success: false, taskId: '', error: 'No active epic' }];
	}

	const readyTasks = getReadyTasks();
	console.log(`[epic spawn] Ready tasks: ${readyTasks.length}`, readyTasks.map(t => t.id));

	// In sequential mode, only spawn 1 agent at a time
	const maxToSpawn = state.settings.mode === 'sequential'
		? 1
		: Math.min(readyTasks.length, state.settings.maxConcurrent);

	console.log(`[epic spawn] maxToSpawn=${maxToSpawn} (maxConcurrent=${state.settings.maxConcurrent})`);

	if (maxToSpawn === 0) {
		console.log(`[epic spawn] BLOCKED: No ready tasks to spawn`);
		return [{ success: false, taskId: '', error: 'No ready tasks to spawn' }];
	}

	state.isSpawning = true;

	try {
		const taskIds = readyTasks.slice(0, maxToSpawn).map(t => t.id);

		const results = await spawnInBatches(taskIds, {
			batchSize: maxToSpawn,
			staggerMs: 500,
			model: DEFAULT_MODEL,
			onSpawn: (result, index, total) => {
				if (result.success) {
					console.log(`[epic spawn] [${index + 1}/${total}] ${result.taskId}: ✓ SUCCESS - Agent: ${result.agentName}`);
					updateTaskStatus(result.taskId, 'in_progress', result.agentName);
					if (result.sessionName) {
						state.spawnedSessions.set(result.taskId, result.sessionName);
					}
					if (result.agentName) {
						addRunningAgent(result.agentName);
					}
				} else {
					console.error(`[epic spawn] [${index + 1}/${total}] ${result.taskId}: ✗ FAILED - ${result.error}`);
				}
			}
		});

		const successCount = results.filter(r => r.success).length;
		console.log(`[epic spawn] ========== EPIC SPAWN COMPLETE ==========`);
		console.log(`[epic spawn] Results: ${successCount}/${maxToSpawn} succeeded in ${Date.now() - startTime}ms`);

		return results;
	} catch (err) {
		console.error('[epic spawn] ✗ spawnInBatches EXCEPTION:', err);
		return [{ success: false, taskId: '', error: 'Epic spawn failed' }];
	} finally {
		state.isSpawning = false;
		console.log(`[epic spawn] isSpawning reset to false`);
	}
}

/**
 * Spawn the next available agent for a ready task
 * Call this when an agent completes a task to spawn a replacement.
 * Respects maxConcurrent limit.
 *
 * @returns Spawn result or null if no spawning needed/possible
 */
export async function spawnNextAgent(): Promise<SpawnResult | null> {
	if (!state.isActive || state.isSpawning) {
		return null;
	}

	// Check if we're at per-epic capacity
	if (!canSpawnMore()) {
		return null;
	}

	// Check global max_sessions limit
	try {
		const activeCount = await getActiveSessionCount();
		const maxSessions = getMaxSessions();
		if (activeCount >= maxSessions) {
			console.log(`[epic spawn] spawnNextAgent blocked: ${activeCount}/${maxSessions} global sessions active`);
			return null;
		}
	} catch {
		// Non-blocking: continue if check fails
	}

	// Get next ready task
	const nextTask = getNextReadyTask();
	if (!nextTask) {
		return null;
	}

	state.isSpawning = true;

	try {
		const result = await spawnAgentForTask(nextTask.id);

		if (result.success) {
			// Mark task as in_progress
			updateTaskStatus(nextTask.id, 'in_progress', result.agentName);

			// Track the spawned session
			if (result.sessionName) {
				state.spawnedSessions.set(nextTask.id, result.sessionName);
			}

			// Add to running agents
			if (result.agentName) {
				addRunningAgent(result.agentName);
			}
		} else {
			state.lastSpawnError = result.error || 'Failed to spawn agent';
		}

		return result;
	} finally {
		state.isSpawning = false;
	}
}

/**
 * Spawn an agent for a specific task via POST /api/work/spawn
 * This endpoint handles:
 * - Auto-generating unique agent names
 * - Registering agents in Agent Mail database
 * - Detecting project from task ID prefix
 * - Assigning tasks to agents in JAT
 *
 * @param taskId - The task ID to assign to the agent
 * @returns Spawn result
 */
async function spawnAgentForTask(taskId: string): Promise<SpawnResult> {
	try {
		const response = await fetch('/api/work/spawn', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				taskId,
				model: DEFAULT_MODEL
				// Project is auto-detected from taskId prefix (e.g., steelbridge-abc -> steelbridge)
				// Agent name is auto-generated and registered in Agent Mail
			})
		});

		const data = await response.json();

		if (!response.ok) {
			return {
				success: false,
				taskId,
				error: data.message || data.error || 'Failed to spawn agent'
			};
		}

		// /api/work/spawn returns { success, session: { sessionName, agentName, ... } }
		return {
			success: true,
			sessionName: data.session?.sessionName,
			agentName: data.session?.agentName,
			taskId
		};
	} catch (err) {
		return {
			success: false,
			taskId,
			error: err instanceof Error ? err.message : 'Network error'
		};
	}
}

/**
 * Determine initial status for a child task
 */
function determineInitialStatus(task: Task, allChildren: Task[]): ChildStatus {
	// Already completed
	if (task.status === 'closed') {
		return 'completed';
	}

	// Already in progress
	if (task.status === 'in_progress') {
		return 'in_progress';
	}

	// Check if blocked by dependencies
	if (task.depends_on && task.depends_on.length > 0) {
		const childIds = new Set(allChildren.map((c) => c.id));
		const unblockedDeps = task.depends_on.filter((dep) => {
			// Only consider dependencies within this epic
			if (!childIds.has(dep.id)) return false;
			// Check if dependency is completed
			return dep.status !== 'closed';
		});

		if (unblockedDeps.length > 0) {
			return 'blocked';
		}
	}

	// Ready to start
	return 'ready';
}

/**
 * Mark a child task as completed and auto-spawn for newly unblocked tasks
 * @param taskId - The task ID that completed
 */
export async function completeTask(taskId: string): Promise<void> {
	if (!state.isActive) return;

	// Find the completing task to get its assignee
	const completingTask = state.children.find((c) => c.id === taskId);
	const completingAgent = completingTask?.assignee;

	// Remove the agent from running agents
	if (completingAgent) {
		removeRunningAgent(completingAgent);
	}

	// Capture which tasks are currently blocked (before recalculation)
	const previouslyBlockedIds = new Set(
		state.children.filter((c) => c.status === 'blocked').map((c) => c.id)
	);

	// Update the child's status
	state.children = state.children.map((child) => {
		if (child.id === taskId) {
			return { ...child, status: 'completed' as ChildStatus, assignee: undefined };
		}
		return child;
	});

	// Update progress
	state.progress = {
		completed: state.children.filter((c) => c.status === 'completed').length,
		total: state.children.length
	};

	// Recalculate blocked status for other children
	recalculateBlockedStatus();

	// Check for newly unblocked tasks and auto-spawn if enabled
	if (state.settings.autoSpawn) {
		// Find tasks that were blocked but are now ready
		const newlyUnblocked = state.children.filter(
			(c) => previouslyBlockedIds.has(c.id) && c.status === 'ready'
		);

		if (newlyUnblocked.length > 0) {
			// Sort by priority (lower = higher priority)
			newlyUnblocked.sort((a, b) => a.priority - b.priority);

			// Compute how many slots are available (respect maxConcurrent)
			const availableSlots = state.settings.mode === 'sequential'
				? (state.runningAgents.length === 0 ? 1 : 0)
				: Math.max(0, state.settings.maxConcurrent - state.runningAgents.length);

			if (availableSlots > 0) {
				const taskIds = newlyUnblocked.slice(0, availableSlots).map(t => t.id);

				state.isSpawning = true;
				try {
					await spawnInBatches(taskIds, {
						batchSize: availableSlots,
						staggerMs: SPAWN_STAGGER_MS,
						model: DEFAULT_MODEL,
						onSpawn: (result) => {
							if (result.success) {
								updateTaskStatus(result.taskId, 'in_progress', result.agentName);
								if (result.sessionName) {
									state.spawnedSessions.set(result.taskId, result.sessionName);
								}
								if (result.agentName) {
									addRunningAgent(result.agentName);
								}
							} else {
								state.lastSpawnError = result.error || 'Failed to spawn agent';
							}
						}
					});
				} finally {
					state.isSpawning = false;
				}
			}
		}
	}
}

/**
 * Recalculate which tasks are blocked vs ready after a completion
 */
function recalculateBlockedStatus(): void {
	const completedIds = new Set(
		state.children.filter((c) => c.status === 'completed').map((c) => c.id)
	);

	state.children = state.children.map((child) => {
		// Skip already completed or in-progress tasks
		if (child.status === 'completed' || child.status === 'in_progress') {
			return child;
		}

		// Check if all dependencies are completed
		if (child.dependsOn && child.dependsOn.length > 0) {
			const hasBlockingDep = child.dependsOn.some((depId) => {
				// Only check dependencies within this epic's children
				const depChild = state.children.find((c) => c.id === depId);
				return depChild && depChild.status !== 'completed';
			});

			if (hasBlockingDep) {
				return { ...child, status: 'blocked' as ChildStatus };
			}
		}

		// No blocking dependencies - mark as ready
		return { ...child, status: 'ready' as ChildStatus };
	});
}

/**
 * Update a child task's status
 * @param taskId - The task ID to update
 * @param status - The new status
 * @param assignee - Optional assignee
 */
export function updateTaskStatus(taskId: string, status: ChildStatus, assignee?: string): void {
	if (!state.isActive) return;

	state.children = state.children.map((child) => {
		if (child.id === taskId) {
			return { ...child, status, assignee: assignee ?? child.assignee };
		}
		return child;
	});

	// Update progress if status changed to completed
	if (status === 'completed') {
		state.progress = {
			completed: state.children.filter((c) => c.status === 'completed').length,
			total: state.children.length
		};
		recalculateBlockedStatus();
	}
}

/**
 * Get the next task ready for assignment
 * @returns The next ready task, or null if none available
 */
export function getNextReadyTask(): EpicChild | null {
	if (!state.isActive) return null;

	// Find ready tasks sorted by priority (lower number = higher priority)
	const readyTasks = state.children
		.filter((child) => child.status === 'ready')
		.sort((a, b) => a.priority - b.priority);

	return readyTasks[0] || null;
}

/**
 * Get all tasks ready for assignment
 * @returns Array of ready tasks sorted by priority
 */
export function getReadyTasks(): EpicChild[] {
	if (!state.isActive) return [];

	return state.children
		.filter((child) => child.status === 'ready')
		.sort((a, b) => a.priority - b.priority);
}

/**
 * Check if the epic is complete (all children done)
 * @returns true if all children are completed
 */
export function isEpicComplete(): boolean {
	if (!state.isActive) return false;
	return state.progress.completed === state.progress.total && state.progress.total > 0;
}

/**
 * Stop epic execution
 */
export function stopEpic(): void {
	// Clear persisted state
	clearPersistedEpic();

	// Clear active epic file (fire and forget - don't block)
	clearActiveEpicFile().catch((e) => console.error('[epicQueueStore] Error clearing active epic file:', e));

	// Mutate properties instead of reassigning (required for Svelte 5 exported state)
	state.epicId = null;
	state.epicTitle = null;
	state.children = [];
	state.settings = { ...defaultSettings };
	state.progress = { completed: 0, total: 0 };
	state.runningAgents = [];
	state.isActive = false;
	state.startedAt = null;
	state.isSpawning = false;
	state.spawnQueue = [];
	state.spawnedSessions = new Map();
	state.lastSpawnError = null;
}

/**
 * Add an agent to the running agents list
 * @param agentName - The agent name
 */
export function addRunningAgent(agentName: string): void {
	if (!state.runningAgents.includes(agentName)) {
		state.runningAgents = [...state.runningAgents, agentName];
	}
}

/**
 * Remove an agent from the running agents list
 * @param agentName - The agent name
 */
export function removeRunningAgent(agentName: string): void {
	state.runningAgents = state.runningAgents.filter((a) => a !== agentName);
}

/**
 * Check if we can spawn more agents
 * @returns true if under maxConcurrent limit (or 0 running in sequential mode)
 */
export function canSpawnMore(): boolean {
	if (!state.isActive) return false;
	// In sequential mode, only spawn when no agents are running
	if (state.settings.mode === 'sequential') {
		return state.runningAgents.length === 0;
	}
	return state.runningAgents.length < state.settings.maxConcurrent;
}

/**
 * Check if a task requires review based on settings
 * @param priority - The task's priority (0-4)
 * @returns true if the task requires manual review
 */
export function requiresReview(priority: number): boolean {
	const threshold = state.settings.reviewThreshold;

	switch (threshold) {
		case 'all':
			return true;
		case 'none':
			return false;
		case 'p0':
			return priority === 0;
		case 'p0-p1':
			return priority <= 1;
		case 'p0-p2':
			return priority <= 2;
		default:
			return true;
	}
}

/**
 * Get currently in-progress tasks
 * @returns Array of in-progress children
 */
export function getInProgressTasks(): EpicChild[] {
	if (!state.isActive) return [];
	return state.children.filter((child) => child.status === 'in_progress');
}

/**
 * Get blocked tasks
 * @returns Array of blocked children
 */
export function getBlockedTasks(): EpicChild[] {
	if (!state.isActive) return [];
	return state.children.filter((child) => child.status === 'blocked');
}

/**
 * Get count of tasks by status
 * @returns Object with counts per status
 */
export function getStatusCounts(): Record<ChildStatus, number> {
	const counts: Record<ChildStatus, number> = {
		pending: 0,
		ready: 0,
		in_progress: 0,
		completed: 0,
		blocked: 0
	};

	for (const child of state.children) {
		counts[child.status]++;
	}

	return counts;
}

// =============================================================================
// REACTIVE GETTERS
// =============================================================================

export function getState(): EpicQueueState {
	return state;
}

export function getEpicId(): string | null {
	return state.epicId;
}

export function getEpicTitle(): string | null {
	return state.epicTitle;
}

export function getChildren(): EpicChild[] {
	return state.children;
}

export function getSettings(): ExecutionSettings {
	return state.settings;
}

export function getProgress(): { completed: number; total: number } {
	return state.progress;
}

export function getRunningAgents(): string[] {
	return state.runningAgents;
}

export function getIsActive(): boolean {
	return state.isActive;
}

export function getStartedAt(): Date | null {
	return state.startedAt;
}

export function getIsSpawning(): boolean {
	return state.isSpawning;
}

export function getSpawnQueue(): string[] {
	return state.spawnQueue;
}

export function getSpawnedSessions(): Map<string, string> {
	return state.spawnedSessions;
}

export function getLastSpawnError(): string | null {
	return state.lastSpawnError;
}

/**
 * Get session name for a task (if spawned)
 * @param taskId - The task ID to look up
 * @returns Session name or undefined
 */
export function getSessionForTask(taskId: string): string | undefined {
	return state.spawnedSessions.get(taskId);
}

/**
 * Clear the last spawn error
 */
export function clearSpawnError(): void {
	state.lastSpawnError = null;
}

/**
 * Refresh epic children status from the API
 * Call this to sync the store with actual jat database state
 *
 * Also checks if the epic itself was closed externally (e.g., via /jat:complete)
 * and stops the swarm if so.
 */
export async function refreshEpicState(): Promise<void> {
	if (!state.isActive || !state.epicId) return;

	try {
		const response = await fetch(`/api/epics/${state.epicId}/children`);
		if (!response.ok) return;

		const data = await response.json();

		// Check if the epic itself was closed externally
		// This happens when an agent runs /jat:complete on the epic task
		if (data.epicStatus === 'closed') {
			console.log(`[epicQueueStore] Epic ${state.epicId} was closed externally, stopping swarm`);
			stopEpic();
			return;
		}

		// Update children status from API
		interface ApiChild {
			id: string;
			status: string;
			assignee?: string;
		}
		const apiChildren = new Map<string, { status: string; assignee?: string }>(
			data.children.map((c: ApiChild) => [
				c.id,
				{ status: c.status, assignee: c.assignee }
			])
		);

		// Merge API status into existing children
		state.children = state.children.map((child) => {
			const apiChild = apiChildren.get(child.id);
			if (apiChild) {
				// Map JAT task status to our ChildStatus
				let newStatus: ChildStatus = child.status;
				if (apiChild.status === 'closed') {
					newStatus = 'completed';
				} else if (apiChild.status === 'in_progress') {
					newStatus = 'in_progress';
				} else if (apiChild.status === 'open') {
					// Check if it was blocked - if so, recalculate
					newStatus = child.status === 'blocked' ? child.status : 'ready';
				}
				return {
					...child,
					status: newStatus,
					assignee: apiChild.assignee || child.assignee
				};
			}
			return child;
		});

		// Recalculate blocked status
		recalculateBlockedStatus();

		// Update progress
		state.progress = {
			completed: state.children.filter((c) => c.status === 'completed').length,
			total: state.children.length
		};
	} catch (error) {
		console.error('[epicQueueStore] Error refreshing epic state:', error);
	}
}

/**
 * Initialize epic state from localStorage if available
 * Call this on app mount to restore epic across page refreshes
 * @returns Promise with success status
 */
export async function initializeFromPersisted(): Promise<boolean> {
	const persisted = getPersistedEpic();
	if (!persisted) {
		console.log('[epicQueueStore] No persisted epic found');
		return false;
	}

	console.log('[epicQueueStore] Restoring epic from localStorage:', persisted.epicId);

	// Fetch fresh data and restore the epic
	// IMPORTANT: autoSpawn: false to prevent spawning agents on every page navigation
	// This is a restore operation, not a new launch - agents already spawned are still running
	const result = await launchEpic(persisted.epicId, { ...persisted.settings, autoSpawn: false });

	if (!result.success) {
		console.error('[epicQueueStore] Failed to restore epic:', result.error);
		// Clear invalid persisted state
		clearPersistedEpic();
		return false;
	}

	console.log('[epicQueueStore] Successfully restored epic:', persisted.epicId);
	return true;
}

/**
 * Check if there's a persisted epic (without restoring)
 * Useful for deciding whether to show loading states
 */
export function hasPersistedEpic(): boolean {
	return getPersistedEpic() !== null;
}

// Export state for direct reactive access in components
export { state as epicQueueState };
