/**
 * POST /api/work/[sessionId]/attach
 * Opens a new terminal window attached to the tmux session
 */

import { json } from '@sveltejs/kit';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST({ params }) {
	const { sessionId } = params;

	if (!sessionId) {
		return json({ error: 'Session ID required' }, { status: 400 });
	}

	try {
		// Check if the tmux session exists
		const { stdout: sessions } = await execAsync('tmux list-sessions -F "#{session_name}" 2>/dev/null || true');
		const sessionList = sessions.trim().split('\n').filter(Boolean);

		if (!sessionList.includes(sessionId)) {
			return json({ error: `Session '${sessionId}' not found` }, { status: 404 });
		}

		// Try to find which terminal is available
		const { stdout: whichResult } = await execAsync('which alacritty kitty gnome-terminal konsole xterm 2>/dev/null | head -1 || true');
		const terminalPath = whichResult.trim();

		if (!terminalPath) {
			return json({ error: 'No terminal emulator found' }, { status: 500 });
		}

		// Determine which terminal and build the command
		let child;
		if (terminalPath.includes('alacritty')) {
			child = spawn('alacritty', ['--title', `tmux: ${sessionId}`, '-e', 'tmux', 'attach-session', '-t', sessionId], {
				detached: true,
				stdio: 'ignore'
			});
		} else if (terminalPath.includes('kitty')) {
			child = spawn('kitty', ['--title', `tmux: ${sessionId}`, 'tmux', 'attach-session', '-t', sessionId], {
				detached: true,
				stdio: 'ignore'
			});
		} else if (terminalPath.includes('gnome-terminal')) {
			child = spawn('gnome-terminal', ['--title', `tmux: ${sessionId}`, '--', 'tmux', 'attach-session', '-t', sessionId], {
				detached: true,
				stdio: 'ignore'
			});
		} else if (terminalPath.includes('konsole')) {
			child = spawn('konsole', ['--new-tab', '-e', 'tmux', 'attach-session', '-t', sessionId], {
				detached: true,
				stdio: 'ignore'
			});
		} else {
			// xterm fallback
			child = spawn('xterm', ['-title', `tmux: ${sessionId}`, '-e', 'tmux', 'attach-session', '-t', sessionId], {
				detached: true,
				stdio: 'ignore'
			});
		}

		// Unref so the parent doesn't wait for the child
		child.unref();

		return json({ success: true, session: sessionId, terminal: terminalPath });
	} catch (error) {
		console.error('Failed to attach terminal:', error);
		return json({ error: error.message }, { status: 500 });
	}
}
