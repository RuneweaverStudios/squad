/**
 * Signals API - List All Active Agent Signals
 *
 * GET /api/signals
 *   Returns all current signals from /tmp/jat-signal-*.json files
 *   Useful for dashboard overview of agent states
 *
 * DELETE /api/signals
 *   Clears all signal files (cleanup)
 *
 * Query params:
 *   ?type=state    - Filter by signal type
 *   ?state=review  - Filter by state value (for state signals)
 */

import { json } from '@sveltejs/kit';
import { readdirSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

const SIGNAL_DIR = '/tmp';
const SIGNAL_PREFIX = 'jat-signal-';

/**
 * Get all signal files from /tmp
 * @returns {string[]} Array of signal file paths
 */
function getSignalFiles() {
	try {
		const files = readdirSync(SIGNAL_DIR);
		return files
			.filter(f => f.startsWith(SIGNAL_PREFIX) && f.endsWith('.json'))
			.map(f => join(SIGNAL_DIR, f));
	} catch {
		return [];
	}
}

/**
 * @typedef {Object} Signal
 * @property {string} [type] - Signal type
 * @property {string} [state] - Signal state
 * @property {string} [timestamp] - Signal timestamp
 */

/**
 * Parse a signal file
 * @param {string} filePath
 * @returns {{ file: string, signal: Signal } | null}
 */
function parseSignalFile(filePath) {
	try {
		const content = readFileSync(filePath, 'utf-8');
		/** @type {Signal} */
		const signal = JSON.parse(content);
		return { file: filePath, signal };
	} catch {
		return null;
	}
}

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
	const typeFilter = url.searchParams.get('type');
	const stateFilter = url.searchParams.get('state');

	const signalFiles = getSignalFiles();
	/** @type {Array<{ sessionName: string, _file: string, type?: string, state?: string, timestamp?: string }>} */
	const signals = [];

	for (const file of signalFiles) {
		const parsed = parseSignalFile(file);
		if (!parsed) continue;

		// Apply filters
		if (typeFilter && parsed.signal.type !== typeFilter) continue;
		if (stateFilter && parsed.signal.state !== stateFilter) continue;

		// Extract session identifier from filename
		const filename = file.split('/').pop() || '';
		let sessionId = filename.replace(SIGNAL_PREFIX, '').replace('.json', '');

		// Handle tmux- prefix
		if (sessionId.startsWith('tmux-')) {
			sessionId = sessionId.replace('tmux-', '');
		}

		signals.push({
			sessionName: sessionId,
			...parsed.signal,
			_file: file
		});
	}

	// Sort by timestamp (newest first)
	signals.sort((a, b) => {
		const timeA = new Date(a.timestamp || 0).getTime();
		const timeB = new Date(b.timestamp || 0).getTime();
		return timeB - timeA;
	});

	return json({
		count: signals.length,
		signals,
		filters: {
			type: typeFilter,
			state: stateFilter
		}
	});
}

/** @type {import('./$types').RequestHandler} */
export async function DELETE() {
	const signalFiles = getSignalFiles();
	let deleted = 0;
	const errors = [];

	for (const file of signalFiles) {
		try {
			unlinkSync(file);
			deleted++;
		} catch (err) {
			const error = /** @type {Error} */ (err);
			errors.push({ file, error: error.message });
		}
	}

	return json({
		success: true,
		deleted,
		errors: errors.length > 0 ? errors : undefined
	});
}
