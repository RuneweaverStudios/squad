/**
 * Recent Closed Sessions API
 * GET /api/sessions/recent - Returns recently closed sessions from signal files
 *
 * Reads /tmp/squad-signal-tmux-squad-*.json files, filters out currently active
 * tmux sessions, and returns the closed ones sorted by mtime descending.
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, readdirSync, statSync } from 'fs';
import { singleFlight, cacheKey } from '$lib/server/cache.js';

const execAsync = promisify(exec);

const SIGNAL_PREFIX = 'squad-signal-tmux-squad-';
const SIGNAL_SUFFIX = '.json';

/**
 * Parse a signal file and extract normalized session info
 * @param {string} filePath - Full path to signal file
 * @param {string} sessionName - tmux session name (e.g., "squad-AgentName")
 * @returns {object|null} Parsed session info or null if unparseable
 */
function parseSignalFile(filePath, sessionName) {
	try {
		const content = readFileSync(filePath, 'utf-8');
		const signal = JSON.parse(content);
		const mtime = statSync(filePath).mtime;

		// Normalize fields - data lives in different places depending on signal type
		const agentName = signal.agentName
			|| signal.data?.agentName
			|| sessionName.replace(/^squad-/, '');

		const taskId = signal.taskId || signal.task_id
			|| signal.data?.taskId
			|| null;

		const taskTitle = signal.taskTitle
			|| signal.data?.taskTitle
			|| null;

		const project = signal.project
			|| signal.data?.project
			|| (taskId && taskId.includes('-') ? taskId.split('-')[0] : null);

		// session_id is present on "complete" signals, usually absent on "paused"
		const sessionId = signal.session_id || null;

		// Map signal type to a display state
		let lastState = signal.type;
		// "state" type signals have a nested .state field
		if (signal.type === 'state' && signal.state) {
			lastState = signal.state;
		}

		return {
			sessionName,
			agentName,
			taskId,
			taskTitle,
			project,
			sessionId,
			lastState,
			timestamp: mtime.toISOString(),
			mtime: mtime.getTime()
		};
	} catch {
		return null;
	}
}

/**
 * Get set of active tmux session names
 * @returns {Promise<Set<string>>}
 */
async function getActiveSessions() {
	try {
		const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}" 2>/dev/null');
		return new Set(stdout.trim().split('\n').filter(Boolean));
	} catch {
		// No tmux server or no sessions
		return new Set();
	}
}

/** @type {import('./$types').RequestHandler} */
export async function GET() {
	try {
		const key = cacheKey('sessions-recent');

		const responseData = await singleFlight(key, async () => {
			// Get active session names
			const activeSessions = await getActiveSessions();

			// Read signal files from /tmp
			let signalFiles;
			try {
				signalFiles = readdirSync('/tmp')
					.filter(f => f.startsWith(SIGNAL_PREFIX) && f.endsWith(SIGNAL_SUFFIX));
			} catch {
				return { sessions: [], count: 0, timestamp: new Date().toISOString() };
			}

			const recentSessions = [];

			for (const filename of signalFiles) {
				// Extract session name from filename: squad-signal-tmux-squad-AgentName.json → squad-AgentName
				const sessionName = filename
					.slice('squad-signal-tmux-'.length, -SIGNAL_SUFFIX.length);

				// Skip if this session is currently active
				if (activeSessions.has(sessionName)) continue;

				const parsed = parseSignalFile(`/tmp/${filename}`, sessionName);
				if (parsed) {
					recentSessions.push(parsed);
				}
			}

			// Sort by mtime descending (most recent first), limit 20
			recentSessions.sort((a, b) => (/** @type {{ mtime: number }} */ (b)).mtime - (/** @type {{ mtime: number }} */ (a)).mtime);
			const limited = recentSessions.slice(0, 20);

			// Remove mtime (internal sorting field)
			const sessions = limited.map((s) => { const { mtime, ...rest } = /** @type {{ mtime: number, [key: string]: unknown }} */ (s); return rest; });

			return {
				sessions,
				count: sessions.length,
				timestamp: new Date().toISOString()
			};
		}, 5000); // 5s TTL

		return json(responseData);
	} catch (error) {
		console.error('Error in GET /api/sessions/recent:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
