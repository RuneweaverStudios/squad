/**
 * Review Rules API Route
 * GET - Load current review rules from .jat/review-rules.json
 * PUT - Update review rules
 * POST /reset - Reset to default rules
 */
import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const execAsync = promisify(exec);

// Find .jat directory by walking up from cwd
function findJatDir() {
	let dir = process.cwd();
	while (dir !== '/') {
		const jatPath = resolve(dir, '.jat');
		if (existsSync(jatPath)) {
			return jatPath;
		}
		dir = resolve(dir, '..');
	}
	return null;
}

// Default rules configuration
// maxAutoPriority is the minimum priority number that auto-proceeds (higher number = lower importance)
// So maxAutoPriority: 3 means P3 and P4 auto-proceed, P0-P2 require review
const DEFAULT_RULES = {
	version: 1,
	defaultAction: 'review',
	priorityThreshold: 3,
	rules: [
		{ type: 'bug', maxAutoPriority: 4, note: 'Only P4 bugs auto-proceed, others require review' },
		{ type: 'feature', maxAutoPriority: 3, note: 'P3-P4 features auto-proceed' },
		{ type: 'task', maxAutoPriority: 3, note: 'P3-P4 tasks auto-proceed' },
		{ type: 'chore', maxAutoPriority: 0, note: 'All chores auto-proceed' },
		{ type: 'epic', maxAutoPriority: 5, note: 'Epics always require review' }
	],
	overrides: []
};

/** @type {import('./$types').RequestHandler} */
export async function GET() {
	try {
		const jatDir = findJatDir();
		if (!jatDir) {
			// Return defaults so UI works when running without a project .jat (e.g. dev from ide/)
			return json(DEFAULT_RULES);
		}

		const rulesPath = resolve(jatDir, 'review-rules.json');

		if (!existsSync(rulesPath)) {
			// Return defaults if file doesn't exist
			return json(DEFAULT_RULES);
		}

		const content = readFileSync(rulesPath, 'utf-8');
		const rules = JSON.parse(content);

		return json(rules);
	} catch (err) {
		console.error('Error loading review rules:', err);
		const message = err instanceof Error ? err.message : 'Failed to load review rules';
		return json(
			{ error: true, message },
			{ status: 500 }
		);
	}
}

/** @type {import('./$types').RequestHandler} */
export async function PUT({ request }) {
	try {
		const jatDir = findJatDir();
		if (!jatDir) {
			return json({ error: true, message: 'No .jat directory found' }, { status: 404 });
		}

		const rulesPath = resolve(jatDir, 'review-rules.json');
		const updates = await request.json();

		// Load existing rules or use defaults
		let rules = DEFAULT_RULES;
		if (existsSync(rulesPath)) {
			const content = readFileSync(rulesPath, 'utf-8');
			rules = JSON.parse(content);
		}

		// Apply updates
		if (updates.rules && Array.isArray(updates.rules)) {
			// Update individual rules by type
			for (const update of updates.rules) {
				const existingIndex = rules.rules.findIndex(r => r.type === update.type);
				if (existingIndex >= 0) {
					rules.rules[existingIndex] = {
						...rules.rules[existingIndex],
						...update
					};
				} else {
					rules.rules.push(update);
				}
			}
		}

		if (updates.defaultAction !== undefined) {
			rules.defaultAction = updates.defaultAction;
		}

		if (updates.priorityThreshold !== undefined) {
			rules.priorityThreshold = updates.priorityThreshold;
		}

		// Write updated rules
		writeFileSync(rulesPath, JSON.stringify(rules, null, 2) + '\n');

		// Sync to jt config
		try {
			await execAsync('jt-review-rules-loader --sync-to-config');
		} catch (syncErr) {
			const syncMessage = syncErr instanceof Error ? syncErr.message : 'Unknown sync error';
			console.warn('Failed to sync to jt config:', syncMessage);
		}

		return json({ success: true, rules });
	} catch (err) {
		console.error('Error updating review rules:', err);
		const message = err instanceof Error ? err.message : 'Failed to update review rules';
		return json(
			{ error: true, message },
			{ status: 500 }
		);
	}
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	try {
		const body = await request.json();

		// Handle reset action
		if (body.action === 'reset') {
			const jatDir = findJatDir();
			if (!jatDir) {
				return json({ error: true, message: 'No .jat directory found' }, { status: 404 });
			}

			const rulesPath = resolve(jatDir, 'review-rules.json');
			writeFileSync(rulesPath, JSON.stringify(DEFAULT_RULES, null, 2) + '\n');

			// Sync to jt config
			try {
				await execAsync('jt-review-rules-loader --sync-to-config');
			} catch (syncErr) {
				const syncMessage = syncErr instanceof Error ? syncErr.message : 'Unknown sync error';
				console.warn('Failed to sync to jt config:', syncMessage);
			}

			return json({ success: true, rules: DEFAULT_RULES, message: 'Rules reset to defaults' });
		}

		return json({ error: true, message: 'Unknown action' }, { status: 400 });
	} catch (err) {
		console.error('Error in review rules POST:', err);
		const message = err instanceof Error ? err.message : 'Failed to process request';
		return json(
			{ error: true, message },
			{ status: 500 }
		);
	}
}
