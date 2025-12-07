/**
 * Review Rules Preview API Route
 * POST - Check what action would be taken for a given task type and priority
 */
import { json } from '@sveltejs/kit';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Find .beads directory by walking up from cwd
function findBeadsDir() {
	let dir = process.cwd();
	while (dir !== '/') {
		const beadsPath = resolve(dir, '.beads');
		if (existsSync(beadsPath)) {
			return beadsPath;
		}
		dir = resolve(dir, '..');
	}
	return null;
}

// Default rules configuration (same as main review-rules endpoint)
const DEFAULT_RULES = {
	version: 1,
	defaultAction: 'review',
	priorityThreshold: 3,
	rules: [
		{ type: 'bug', maxAutoPriority: 3, note: 'P0-P3 bugs auto-proceed, P4 requires review' },
		{ type: 'feature', maxAutoPriority: 3, note: 'P0-P3 features auto-proceed' },
		{ type: 'task', maxAutoPriority: 3 },
		{ type: 'chore', maxAutoPriority: 4, note: 'All chores auto-proceed' },
		{ type: 'epic', maxAutoPriority: -1, note: 'Epics always require review' }
	],
	overrides: []
};

/**
 * @typedef {Object} Rule
 * @property {string} type
 * @property {number} maxAutoPriority
 * @property {string} [note]
 */

/**
 * @typedef {Object} Override
 * @property {string} taskId
 * @property {'auto' | 'review'} action
 * @property {string} [reason]
 */

/**
 * @typedef {Object} ReviewRules
 * @property {number} version
 * @property {string} defaultAction
 * @property {number} priorityThreshold
 * @property {Rule[]} rules
 * @property {Override[]} overrides
 */

/**
 * Determine the action for a given type and priority
 * @param {ReviewRules} rules - The review rules configuration
 * @param {string} type - Task type (bug, feature, task, chore, epic)
 * @param {number} priority - Task priority (0-4)
 * @param {string | null} [taskId] - Optional task ID for override checking
 * @returns {{ action: 'auto' | 'review', reason: string, ruleApplied: 'type-rule' | 'override' | 'default' }}
 */
function determineAction(rules, type, priority, taskId = null) {
	// Check for task-specific override first
	if (taskId && rules.overrides && rules.overrides.length > 0) {
		const override = rules.overrides.find((o) => o.taskId === taskId);
		if (override) {
			return {
				action: override.action,
				reason: override.reason || `Task-specific override for ${taskId}`,
				ruleApplied: 'override'
			};
		}
	}

	// Find the rule for this type
	const typeRule = rules.rules.find((r) => r.type === type);

	if (typeRule) {
		// maxAutoPriority of -1 means always review
		if (typeRule.maxAutoPriority === -1) {
			return {
				action: 'review',
				reason: typeRule.note || `${type} tasks always require review`,
				ruleApplied: 'type-rule'
			};
		}

		// Check if priority is at or below maxAutoPriority (auto-proceed)
		if (priority <= typeRule.maxAutoPriority) {
			return {
				action: 'auto',
				reason:
					typeRule.note ||
					`P${priority} ${type} auto-proceeds (max auto: P${typeRule.maxAutoPriority})`,
				ruleApplied: 'type-rule'
			};
		}

		// Priority is above maxAutoPriority (requires review)
		return {
			action: 'review',
			reason: `P${priority} ${type} requires review (max auto: P${typeRule.maxAutoPriority})`,
			ruleApplied: 'type-rule'
		};
	}

	// No specific rule for this type - use default
	if (priority <= rules.priorityThreshold) {
		return {
			action: rules.defaultAction === 'auto' ? 'auto' : 'review',
			reason: `Using default action for P${priority} ${type}`,
			ruleApplied: 'default'
		};
	}

	return {
		action: 'review',
		reason: `P${priority} exceeds default threshold (P${rules.priorityThreshold})`,
		ruleApplied: 'default'
	};
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	try {
		const body = await request.json();
		const { type, priority, taskId } = body;

		// Validate required fields
		if (!type) {
			return json({ error: true, message: 'Missing required field: type' }, { status: 400 });
		}

		if (priority === undefined || priority === null) {
			return json({ error: true, message: 'Missing required field: priority' }, { status: 400 });
		}

		// Validate type
		const validTypes = ['bug', 'feature', 'task', 'chore', 'epic'];
		if (!validTypes.includes(type)) {
			return json(
				{
					error: true,
					message: `Invalid type: ${type}. Must be one of: ${validTypes.join(', ')}`
				},
				{ status: 400 }
			);
		}

		// Validate priority
		const priorityNum = parseInt(priority, 10);
		if (isNaN(priorityNum) || priorityNum < 0 || priorityNum > 4) {
			return json(
				{ error: true, message: `Invalid priority: ${priority}. Must be 0-4` },
				{ status: 400 }
			);
		}

		// Load current rules
		const beadsDir = findBeadsDir();
		/** @type {ReviewRules} */
		let rules = DEFAULT_RULES;

		if (beadsDir) {
			const rulesPath = resolve(beadsDir, 'review-rules.json');
			if (existsSync(rulesPath)) {
				const content = readFileSync(rulesPath, 'utf-8');
				rules = /** @type {ReviewRules} */ (JSON.parse(content));
			}
		}

		// Determine action
		const result = determineAction(rules, type, priorityNum, taskId);

		return json({
			type,
			priority: priorityNum,
			taskId: taskId || null,
			...result
		});
	} catch (err) {
		console.error('Error in review rules preview:', err);
		const message = err instanceof Error ? err.message : 'Failed to process preview request';
		return json({ error: true, message }, { status: 500 });
	}
}
