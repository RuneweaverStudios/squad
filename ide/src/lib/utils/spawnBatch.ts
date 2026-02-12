/**
 * Batched agent spawning utility.
 *
 * Spawns agents in configurable batch sizes. Each batch fires Promise.all
 * for batchSize tasks simultaneously, then waits for all to complete before
 * starting the next batch. Respects getMaxSessions() to cap total spawns.
 */

import { DEFAULT_AGENT_COUNT } from '$lib/config/spawnConfig';
import { getMaxSessions } from '$lib/stores/preferences.svelte';
import {
	startBulkSpawn,
	endBulkSpawn,
	startSpawning,
	stopSpawning
} from '$lib/stores/spawningTasks';

export interface SpawnResult {
	success: boolean;
	taskId: string;
	sessionName?: string;
	agentName?: string;
	error?: string;
}

export interface SpawnBatchOptions {
	/** Number of tasks to spawn simultaneously per batch. Default: DEFAULT_AGENT_COUNT (4) */
	batchSize?: number;
	/** Delay in ms between individual spawns within a batch. Default: 500 */
	staggerMs?: number;
	/** Called after each individual spawn completes */
	onSpawn?: (result: SpawnResult, index: number, total: number) => void;
	/** Called after each batch completes */
	onBatchComplete?: (batchResults: SpawnResult[], batchIndex: number, totalBatches: number) => void;
	/** Project name to pass to spawn API (optional - inferred from task) */
	project?: string;
	/** Model alias to pass to spawn API (e.g. 'opus', 'sonnet', 'haiku') */
	model?: string;
}

/**
 * Get the number of currently active sessions by querying the work API.
 */
async function getActiveSessionCount(): Promise<number> {
	try {
		const response = await fetch('/api/work');
		const data = await response.json();
		return data.count || 0;
	} catch {
		return 0;
	}
}

/**
 * Spawn a single agent for a task via the IDE spawn API.
 */
async function spawnOne(taskId: string, project?: string, model?: string): Promise<SpawnResult> {
	try {
		const body: Record<string, string> = { taskId };
		if (project) body.project = project;
		if (model) body.model = model;

		const response = await fetch('/api/work/spawn', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const data = await response.json();

		if (!response.ok) {
			return {
				success: false,
				taskId,
				error: data.message || `Spawn failed (${response.status})`
			};
		}

		return {
			success: true,
			taskId,
			sessionName: data.session?.sessionName,
			agentName: data.session?.agentName
		};
	} catch (err) {
		return {
			success: false,
			taskId,
			error: err instanceof Error ? err.message : 'Spawn exception'
		};
	}
}

/**
 * Spawn agents for multiple tasks in batches.
 *
 * Each batch spawns `batchSize` tasks concurrently (with optional stagger),
 * then waits for the entire batch to finish before starting the next.
 * Respects getMaxSessions() minus currently active sessions.
 *
 * @param taskIds - Array of task IDs to spawn agents for
 * @param options - Configuration for batch size, callbacks, etc.
 * @returns Array of SpawnResult for every task (in original order)
 */
export async function spawnInBatches(
	taskIds: string[],
	options: SpawnBatchOptions = {}
): Promise<SpawnResult[]> {
	const {
		batchSize = DEFAULT_AGENT_COUNT,
		staggerMs = 500,
		onSpawn,
		onBatchComplete,
		project,
		model
	} = options;

	if (taskIds.length === 0) return [];

	// Cap to available session slots
	const activeCount = await getActiveSessionCount();
	const maxSessions = getMaxSessions();
	const availableSlots = Math.max(0, maxSessions - activeCount);

	if (availableSlots === 0) {
		return taskIds.map(taskId => ({
			success: false,
			taskId,
			error: `All ${maxSessions} session slots are in use`
		}));
	}

	const cappedTaskIds = taskIds.slice(0, availableSlots);
	const results: SpawnResult[] = [];

	// Signal bulk spawn for UI animations
	startBulkSpawn();

	try {
		// Split into batches
		const totalBatches = Math.ceil(cappedTaskIds.length / batchSize);

		for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
			const batchStart = batchIdx * batchSize;
			const batchTaskIds = cappedTaskIds.slice(batchStart, batchStart + batchSize);

			// Mark all tasks in this batch as spawning (for animations)
			for (const taskId of batchTaskIds) {
				startSpawning(taskId);
			}

			// Spawn batch concurrently with staggered starts
			const batchPromises = batchTaskIds.map(async (taskId, i) => {
				if (i > 0 && staggerMs > 0) {
					await new Promise(resolve => setTimeout(resolve, i * staggerMs));
				}

				const result = await spawnOne(taskId, project, model);

				// Clear spawning animation (with delay on success for visual feedback)
				if (result.success) {
					setTimeout(() => stopSpawning(taskId), 2000);
				} else {
					stopSpawning(taskId);
				}

				// Notify per-spawn callback
				if (onSpawn) {
					const globalIndex = batchStart + i;
					onSpawn(result, globalIndex, cappedTaskIds.length);
				}

				return result;
			});

			const batchResults = await Promise.all(batchPromises);
			results.push(...batchResults);

			// Notify per-batch callback
			if (onBatchComplete) {
				onBatchComplete(batchResults, batchIdx, totalBatches);
			}
		}

		// Also produce failure results for tasks that exceeded available slots
		for (let i = cappedTaskIds.length; i < taskIds.length; i++) {
			results.push({
				success: false,
				taskId: taskIds[i],
				error: `Skipped: session limit reached (${maxSessions})`
			});
		}
	} finally {
		endBulkSpawn();
	}

	return results;
}
