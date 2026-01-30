/**
 * YOLO Session API - Launch Claude to accept permissions warning
 * POST /api/sessions/yolo
 *
 * Creates a simple Claude session with --dangerously-skip-permissions
 * so the user can accept the YOLO warning in their terminal.
 * After accepting, they can enable the skip_permissions toggle in Settings.
 */

import { json } from '@sveltejs/kit';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { getJatDefaults } from '$lib/server/projectPaths.js';

const execAsync = promisify(exec);

export async function POST() {
	try {
		const jatDefaults = await getJatDefaults();
		const sessionName = `jat-yolo-${Date.now()}`;
		const projectPath = process.cwd().replace('/ide', '');

		// Default tmux dimensions
		const TMUX_INITIAL_WIDTH = 80;
		const TMUX_INITIAL_HEIGHT = 40;

		// Build the claude command with the dangerous flag
		// This is specifically to trigger the YOLO warning so user can accept it
		const claudeCmd = `cd "${projectPath}" && claude --dangerously-skip-permissions`;

		// Create tmux session
		const createSessionCmd = `tmux new-session -d -s "${sessionName}" -x ${TMUX_INITIAL_WIDTH} -y ${TMUX_INITIAL_HEIGHT} -c "${projectPath}" && sleep 0.3 && tmux send-keys -t "${sessionName}" "${claudeCmd}" Enter`;

		try {
			await execAsync(createSessionCmd);
		} catch (err) {
			const execErr = err as { stderr?: string; message?: string };
			const errorMessage = execErr.stderr || (err instanceof Error ? err.message : String(err));

			return json({
				error: 'Failed to create session',
				message: errorMessage,
				sessionName
			}, { status: 500 });
		}

		// Find available terminal and open attached to the session
		let terminal = jatDefaults.terminal || 'auto';
		const windowTitle = `JAT: Accept YOLO Warning`;
		const attachCmd = `tmux attach-session -t "${sessionName}"`;

		// Resolve 'auto' to platform default
		if (terminal === 'auto') {
			if (process.platform === 'darwin') {
				const { existsSync } = await import('fs');
				if (existsSync('/Applications/Ghostty.app')) {
					terminal = 'ghostty';
				} else {
					terminal = existsSync('/Applications/iTerm.app') ? 'iterm2' : 'apple-terminal';
				}
			} else {
				terminal = 'alacritty';  // Will be detected below
			}
		}

		try {
			let child;

			if (terminal === 'apple-terminal') {
				child = spawn('osascript', ['-e', `
					tell application "Terminal"
						do script "bash -c '${attachCmd}'"
						set custom title of front window to "${windowTitle}"
						activate
					end tell
				`], { detached: true, stdio: 'ignore' });
			} else if (terminal === 'iterm2') {
				child = spawn('osascript', ['-e', `
					tell application "iTerm"
						create window with default profile command "bash -c '${attachCmd}'"
						tell current session of current window
							set name to "${windowTitle}"
						end tell
					end tell
				`], { detached: true, stdio: 'ignore' });
			} else if (terminal === 'ghostty' || terminal.includes('ghostty')) {
				if (process.platform === 'darwin') {
					child = spawn('ghostty', ['+new-window', '-e', 'bash', '-c', `tmux attach-session -t "${sessionName}"`], {
						detached: true, stdio: 'ignore'
					});
				} else {
					child = spawn('ghostty', ['--title=' + windowTitle, '-e', 'bash', '-c', `tmux attach-session -t "${sessionName}"`], {
						detached: true, stdio: 'ignore'
					});
				}
			} else if (terminal.includes('alacritty')) {
				child = spawn('alacritty', ['--title', windowTitle, '-e', 'tmux', 'attach-session', '-t', sessionName], {
					detached: true,
					stdio: 'ignore'
				});
			} else if (terminal.includes('kitty')) {
				child = spawn('kitty', ['--title', windowTitle, 'tmux', 'attach-session', '-t', sessionName], {
					detached: true,
					stdio: 'ignore'
				});
			} else if (terminal.includes('gnome-terminal')) {
				child = spawn('gnome-terminal', ['--title', windowTitle, '--', 'tmux', 'attach-session', '-t', sessionName], {
					detached: true,
					stdio: 'ignore'
				});
			} else if (terminal.includes('konsole')) {
				child = spawn('konsole', ['--new-tab', '-e', 'tmux', 'attach-session', '-t', sessionName], {
					detached: true,
					stdio: 'ignore'
				});
			} else {
				// Fallback to xterm
				child = spawn('xterm', ['-title', windowTitle, '-e', 'tmux', 'attach-session', '-t', sessionName], {
					detached: true,
					stdio: 'ignore'
				});
			}

			child.unref();
		} catch (err) {
			console.error('Failed to open terminal:', err);
			// Session is created, just couldn't open terminal
			// User can still manually attach
			return json({
				success: true,
				sessionName,
				message: `Session created but could not open terminal. Run: tmux attach-session -t ${sessionName}`,
				manualAttach: true
			});
		}

		return json({
			success: true,
			sessionName,
			message: 'Claude session launched. Accept the permissions warning in the terminal window, then enable the toggle in Settings.'
		});
	} catch (error) {
		console.error('Error in POST /api/sessions/yolo:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
