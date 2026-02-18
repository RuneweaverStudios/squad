/**
 * Session Pause API - Instantly pause a session without agent involvement
 *
 * POST /api/sessions/[name]/pause
 *   Writes paused signal directly to signal files and optionally kills the session.
 *   This bypasses the agent for instant UX.
 *
 * Body:
 *   - taskId: string (required) - The task being paused
 *   - taskTitle?: string - Task title for display
 *   - reason?: string - Why the session was paused
 *   - killSession?: boolean - Whether to kill the tmux session (default: true)
 *
 * Writes to:
 *   - /tmp/squad-signal-tmux-{session}.json - Current signal state
 *   - /tmp/squad-timeline-{session}.jsonl - Timeline history (append)
 */

import { json } from '@sveltejs/kit';
import { writeFileSync, appendFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import type { RequestHandler } from './$types';

/**
 * Capture session scrollback and append to unified session log
 */
function captureSessionLog(sessionName: string, reason: string): string | null {
	const projectPath = process.cwd().replace('/ide', '');
	const logsDir = path.join(projectPath, '.squad', 'logs');
	const logFile = path.join(logsDir, `session-${sessionName}.log`);

	// Ensure logs directory exists
	if (!existsSync(logsDir)) {
		mkdirSync(logsDir, { recursive: true });
	}

	// Check if session exists
	try {
		execSync(`tmux has-session -t "${sessionName}" 2>/dev/null`, { encoding: 'utf-8' });
	} catch {
		return null; // Session doesn't exist
	}

	// Capture scrollback
	let scrollback = '';
	try {
		scrollback = execSync(
			`tmux capture-pane -t "${sessionName}" -p -S - -E -`,
			{ encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
		);
	} catch {
		return null;
	}

	if (!scrollback.trim()) {
		return null;
	}

	const timestamp = new Date().toISOString();

	// Determine separator based on reason
	const separators: Record<string, string> = {
		compacted: '📦 CONTEXT COMPACTED',
		paused: '⏸️ SESSION PAUSED',
		killed: '💀 SESSION KILLED',
		completed: '✅ TASK COMPLETED'
	};
	const label = separators[reason] || '📝 LOG CAPTURED';

	const separator = `
════════════════════════════════════════════════════════════════════════════════
${label} at ${timestamp}
════════════════════════════════════════════════════════════════════════════════
`;

	// If log file doesn't exist, add header
	if (!existsSync(logFile)) {
		const header = `# Session Log: ${sessionName}
# Created: ${timestamp}
# This file accumulates session history across compactions, pauses, and completions.
================================================================================

`;
		writeFileSync(logFile, header, 'utf-8');
	}

	// Append scrollback with separator
	appendFileSync(logFile, scrollback + separator, 'utf-8');

	return logFile;
}

interface PauseRequest {
	taskId: string;
	taskTitle?: string;
	reason?: string;
	killSession?: boolean;
	agentName?: string;
	sessionId?: string;
	project?: string;
}

interface PausedSignal {
	type: 'paused';
	taskId: string;
	taskTitle?: string;
	agentName?: string;
	reason?: string;
	resumable: boolean;
	sessionId?: string;
	project?: string;
	timestamp: string;
}

export const POST: RequestHandler = async ({ params, request }) => {
	const sessionName = params.name;

	if (!sessionName) {
		return json({ error: 'Missing session name' }, { status: 400 });
	}

	try {
		const body: PauseRequest = await request.json();
		const { taskId, taskTitle, reason, killSession = true, agentName, sessionId, project } = body;

		if (!taskId) {
			return json({ error: 'taskId is required' }, { status: 400 });
		}

		// Guard: refuse to auto-pause protected sessions
		if (reason?.startsWith('Auto-paused')) {
			const tmux = sessionName.startsWith('squad-') ? sessionName : `squad-${sessionName}`;

			// Don't auto-pause sessions whose tmux is already dead
			try {
				execSync(`tmux has-session -t "${tmux}" 2>/dev/null`, { encoding: 'utf-8' });
			} catch {
				return json({ error: 'Session tmux already dead', skipped: true }, { status: 409 });
			}

			const sigFile = `/tmp/squad-signal-tmux-${tmux}.json`;
			try {
				if (existsSync(sigFile)) {
					const sig = JSON.parse(readFileSync(sigFile, 'utf-8'));
					// Don't auto-pause planning sessions (TTL expires but user is still using them)
					if (sig.type === 'planning' || sig.state === 'planning') {
						return json({ error: 'Cannot auto-pause planning session', skipped: true }, { status: 409 });
					}
					// Don't auto-pause already-paused sessions (prevents infinite pause loop)
					if (sig.type === 'paused') {
						return json({ error: 'Session already paused', skipped: true }, { status: 409 });
					}
				}
			} catch { /* ignore — proceed with pause */ }
		}

		// Normalize session name (ensure squad- prefix)
		const tmuxSession = sessionName.startsWith('squad-') ? sessionName : `squad-${sessionName}`;
		const agentNameFromSession = tmuxSession.replace(/^squad-/, '');

		// Build the paused signal
		const timestamp = new Date().toISOString();
		const pausedSignal: PausedSignal = {
			type: 'paused',
			taskId,
			taskTitle,
			agentName: agentName || agentNameFromSession,
			reason,
			resumable: true,
			sessionId,
			project,
			timestamp
		};

		// 1. Write current signal state to signal file
		const signalFile = `/tmp/squad-signal-tmux-${tmuxSession}.json`;
		writeFileSync(signalFile, JSON.stringify(pausedSignal, null, 2));

		// 2. Append to timeline JSONL
		const timelineFile = `/tmp/squad-timeline-${tmuxSession}.jsonl`;
		const timelineEvent = {
			type: 'signal',
			session_id: sessionId || '',
			tmux_session: tmuxSession,
			timestamp,
			state: 'paused',
			task_id: taskId,
			data: pausedSignal
		};
		appendFileSync(timelineFile, JSON.stringify(timelineEvent) + '\n');

		// 3. Capture scrollback BEFORE killing the session
		let logCaptured: string | null = null;
		try {
			logCaptured = captureSessionLog(tmuxSession, 'paused');
		} catch (err) {
			console.error('Failed to capture session log before pause:', err);
			// Non-fatal - continue with pause
		}

		// 4. Optionally kill the tmux session
		let sessionKilled = false;
		if (killSession) {
			try {
				// Check if session exists first
				execSync(`tmux has-session -t "${tmuxSession}" 2>/dev/null`, { encoding: 'utf-8' });
				// Kill the session
				execSync(`tmux kill-session -t "${tmuxSession}"`, { encoding: 'utf-8' });
				sessionKilled = true;
			} catch {
				// Session might not exist or already be dead - that's okay
				sessionKilled = false;
			}
		}

		return json({
			success: true,
			sessionName: tmuxSession,
			taskId,
			paused: true,
			resumable: true,
			sessionKilled,
			logCaptured: logCaptured ? true : false,
			logFile: logCaptured,
			signalFile,
			timelineFile,
			timestamp
		});

	} catch (error) {
		console.error('Error in POST /api/sessions/[name]/pause:', error);
		return json({
			error: 'Failed to pause session',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
};

/**
 * GET /api/sessions/[name]/pause
 * Check if a session is paused (has a paused signal)
 */
export const GET: RequestHandler = async ({ params }) => {
	const sessionName = params.name;

	if (!sessionName) {
		return json({ error: 'Missing session name' }, { status: 400 });
	}

	const tmuxSession = sessionName.startsWith('squad-') ? sessionName : `squad-${sessionName}`;
	const signalFile = `/tmp/squad-signal-tmux-${tmuxSession}.json`;

	if (!existsSync(signalFile)) {
		return json({
			paused: false,
			sessionName: tmuxSession
		});
	}

	try {
		const content = readFileSync(signalFile, 'utf-8');
		const signal = JSON.parse(content);

		return json({
			paused: signal.type === 'paused',
			sessionName: tmuxSession,
			signal: signal.type === 'paused' ? signal : null
		});
	} catch {
		return json({
			paused: false,
			sessionName: tmuxSession,
			error: 'Failed to read signal file'
		});
	}
};
