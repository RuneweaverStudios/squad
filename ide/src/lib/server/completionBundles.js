/**
 * Completion Bundle Storage
 *
 * Persists completion bundles to .jat/completions.json
 * Similar pattern to task-images.json for auxiliary task data
 *
 * Storage format:
 * {
 *   "task-id": {
 *     taskId: string,
 *     agentName: string,
 *     sessionName: string,
 *     summary: string[],
 *     quality: { tests, build, preExisting? },
 *     humanActions?: [...],
 *     suggestedTasks?: [...],
 *     crossAgentIntel?: { files?, patterns?, gotchas? },
 *     completedAt: ISO timestamp,
 *     persistedAt: ISO timestamp
 *   }
 * }
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Get the path to completions.json in the project's .jat directory
 * @returns {string}
 */
function getCompletionsPath() {
	const projectPath = process.cwd().replace('/ide', '');
	return join(projectPath, '.jat', 'completions.json');
}

/**
 * Load existing completions from storage
 * @returns {Record<string, CompletionBundle>}
 */
function loadCompletions() {
	const path = getCompletionsPath();
	try {
		if (!existsSync(path)) {
			return {};
		}
		const content = readFileSync(path, 'utf-8');
		return JSON.parse(content);
	} catch (err) {
		console.error('[CompletionBundles] Failed to load completions:', err);
		return {};
	}
}

/**
 * Save completions to storage
 * @param {Record<string, CompletionBundle>} completions
 */
function saveCompletions(completions) {
	const path = getCompletionsPath();
	try {
		writeFileSync(path, JSON.stringify(completions, null, 2), 'utf-8');
	} catch (err) {
		console.error('[CompletionBundles] Failed to save completions:', err);
		throw err;
	}
}

/**
 * @typedef {Object} QualitySignals
 * @property {'passing' | 'failing' | 'none' | 'skipped'} tests
 * @property {'clean' | 'warnings' | 'errors'} build
 * @property {string} [preExisting]
 */

/**
 * @typedef {Object} HumanAction
 * @property {string} [action]
 * @property {string} [title]
 * @property {string} [description]
 * @property {string} [message]
 * @property {string} [timestamp]
 */

/**
 * @typedef {Object} SuggestedTask
 * @property {string} [id]
 * @property {string} type
 * @property {string} title
 * @property {string} description
 * @property {number} priority
 * @property {string} [reason]
 * @property {string} [project]
 * @property {string} [labels]
 * @property {string[]} [depends_on]
 */

/**
 * @typedef {Object} CrossAgentIntel
 * @property {string[]} [files]
 * @property {string[]} [patterns]
 * @property {string[]} [gotchas]
 */

/**
 * @typedef {Object} CompletionBundle
 * @property {string} taskId
 * @property {string} agentName
 * @property {string} [sessionName]
 * @property {string[]} summary
 * @property {QualitySignals} quality
 * @property {HumanAction[]} [humanActions]
 * @property {SuggestedTask[]} [suggestedTasks]
 * @property {CrossAgentIntel} [crossAgentIntel]
 * @property {string} [completedAt]
 * @property {string} [persistedAt]
 */

/**
 * Persist a completion bundle for a task
 * @param {string} taskId - The task ID
 * @param {CompletionBundle} bundle - The completion bundle data
 * @param {string} [sessionName] - The session that completed the task
 * @returns {{ success: boolean, error?: string }}
 */
export function persistCompletionBundle(taskId, bundle, sessionName) {
	if (!taskId) {
		return { success: false, error: 'Missing taskId' };
	}

	try {
		const completions = loadCompletions();

		// Create the stored bundle with metadata
		completions[taskId] = {
			...bundle,
			taskId,
			sessionName: sessionName || bundle.sessionName,
			completedAt: bundle.completedAt || new Date().toISOString(),
			persistedAt: new Date().toISOString()
		};

		saveCompletions(completions);

		console.log(`[CompletionBundles] Persisted bundle for ${taskId} (agent: ${bundle.agentName})`);
		return { success: true };
	} catch (err) {
		const error = /** @type {Error} */ (err);
		console.error(`[CompletionBundles] Failed to persist bundle for ${taskId}:`, error);
		return { success: false, error: error.message };
	}
}

/**
 * Get a completion bundle for a specific task
 * @param {string} taskId - The task ID
 * @returns {CompletionBundle | null}
 */
export function getCompletionBundle(taskId) {
	const completions = loadCompletions();
	return completions[taskId] || null;
}

/**
 * Get all completion bundles
 * @returns {Record<string, CompletionBundle>}
 */
export function getAllCompletionBundles() {
	return loadCompletions();
}

/**
 * Delete a completion bundle for a task
 * @param {string} taskId - The task ID
 * @returns {{ success: boolean, existed: boolean }}
 */
export function deleteCompletionBundle(taskId) {
	try {
		const completions = loadCompletions();
		const existed = taskId in completions;

		if (existed) {
			delete completions[taskId];
			saveCompletions(completions);
			console.log(`[CompletionBundles] Deleted bundle for ${taskId}`);
		}

		return { success: true, existed };
	} catch (err) {
		const error = /** @type {Error} */ (err);
		console.error(`[CompletionBundles] Failed to delete bundle for ${taskId}:`, error);
		return { success: false, existed: false };
	}
}

/**
 * Clear all completion bundles (for cleanup)
 * @returns {{ success: boolean, count: number }}
 */
export function clearAllCompletionBundles() {
	try {
		const completions = loadCompletions();
		const count = Object.keys(completions).length;

		saveCompletions({});
		console.log(`[CompletionBundles] Cleared ${count} bundles`);

		return { success: true, count };
	} catch (err) {
		const error = /** @type {Error} */ (err);
		console.error('[CompletionBundles] Failed to clear bundles:', error);
		return { success: false, count: 0 };
	}
}

export default {
	persistCompletionBundle,
	getCompletionBundle,
	getAllCompletionBundles,
	deleteCompletionBundle,
	clearAllCompletionBundles
};
