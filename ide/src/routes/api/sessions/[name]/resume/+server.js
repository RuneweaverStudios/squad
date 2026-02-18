/**
 * Session Resume API
 * POST /api/sessions/[name]/resume - Resume a completed session using Claude's -r flag
 *
 * Uses the session_id from signal files to resume the Claude Code conversation.
 * Launches a new terminal window with the resumed session.
 */

import { json } from '@sveltejs/kit';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import Database from 'better-sqlite3';

const execAsync = promisify(exec);

/**
 * Agent Mail database path
 */
const AGENT_MAIL_DB_PATH = process.env.AGENT_MAIL_DB || `${process.env.HOME}/.agent-mail.db`;

/**
 * Session name prefix for SQUAD agent sessions
 */
const SESSION_PREFIX = 'squad-';

/**
 * Get the full tmux session name from a name parameter.
 * @param {string} name - Agent name or full session name
 * @returns {{ agentName: string, sessionName: string }}
 */
function resolveSessionName(name) {
	if (name.startsWith(SESSION_PREFIX)) {
		return {
			agentName: name.slice(SESSION_PREFIX.length),
			sessionName: name
		};
	}
	return {
		agentName: name,
		sessionName: `${SESSION_PREFIX}${name}`
	};
}

/**
 * Convert a project path to Claude's project slug format
 * @param {string} projectPath - e.g., "/home/jw/code/squad"
 * @returns {string} - e.g., "-home-jw-code-squad"
 */
function getProjectSlug(projectPath) {
	return projectPath.replace(/\//g, '-');
}

/**
 * Look up agent's project path from Agent Mail database
 * @param {string} agentName - Agent name to look up
 * @returns {string | null} - Project path or null if not found
 */
function getAgentProjectFromDb(agentName) {
	if (!existsSync(AGENT_MAIL_DB_PATH)) {
		return null;
	}

	try {
		const db = new Database(AGENT_MAIL_DB_PATH, { readonly: true });
		const result = /** @type {{ project: string } | undefined} */ (
			db.prepare(`
				SELECT p.human_key as project
				FROM agents a
				JOIN projects p ON a.project_id = p.id
				WHERE a.name = ?
			`).get(agentName)
		);
		db.close();

		if (result?.project) {
			// The human_key is already the full path (e.g., /home/jw/code/steelbridge)
			return result.project;
		}
	} catch (e) {
		console.error(`Failed to query Agent Mail DB for ${agentName}:`, e);
	}

	return null;
}

/**
 * Search Claude JSONL session files for an agent's most recent session
 * This is a last-resort fallback when no other session mapping exists
 * @param {string} agentName - Agent name to search for
 * @param {string} projectPath - Project path to compute the slug
 * @returns {string | null} - Session ID or null if not found
 */
function findSessionIdFromJsonl(agentName, projectPath) {
	const homeDir = process.env.HOME || '';
	const projectSlug = getProjectSlug(projectPath);
	const claudeProjectDir = join(homeDir, '.claude', 'projects', projectSlug);

	if (!existsSync(claudeProjectDir)) {
		return null;
	}

	try {
		const files = readdirSync(claudeProjectDir)
			.filter(f => f.endsWith('.jsonl'))
			.map(f => ({
				name: f,
				path: join(claudeProjectDir, f),
				sessionId: f.replace('.jsonl', ''),
				mtime: statSync(join(claudeProjectDir, f)).mtime.getTime()
			}))
			.sort((a, b) => b.mtime - a.mtime); // Newest first

		// Search for agent name in multiple patterns:
		// 1. "agentName":"TrueCave" in tool output - from squad-signal
		// 2. <command-args>TrueCave in early messages - from /squad:start command
		// Pattern 2 is checked only in the first 5 lines to avoid false positives from
		// tool_results that contain context from OTHER sessions. The /squad:start command
		// always appears in line 1-3 of the JSONL file.
		const signalPattern = new RegExp(`"agentName"\\s*:\\s*"${agentName}"`, 'i');
		const commandPattern = new RegExp(`<command-args>${agentName}\\s`, 'i');

		for (const file of files) {
			try {
				const content = readFileSync(file.path, 'utf-8');

				// Check signal pattern anywhere in file (reliable - from tool output)
				if (signalPattern.test(content)) {
					console.log(`Found session for ${agentName} via signal pattern: ${file.sessionId}`);
					return file.sessionId;
				}

				// Check command pattern only in first 5 lines (session start)
				// The /squad:start command is always in lines 1-3, so 5 lines is safe
				// but prevents matching tool_results that contain other session contexts
				const lines = content.split('\n').slice(0, 5).join('\n');
				if (commandPattern.test(lines)) {
					console.log(`Found session for ${agentName} via command pattern: ${file.sessionId}`);
					return file.sessionId;
				}
			} catch (e) {
				// Skip unreadable files
			}
		}
	} catch (e) {
		console.error(`Failed to scan Claude projects dir ${claudeProjectDir}:`, e);
	}

	return null;
}

/**
 * Find session_id from signal files or persistent agent session files
 * @param {string} sessionName - tmux session name (e.g., "squad-QuickOcean")
 * @param {string | null} projectPath - project path to search for persistent session files
 * @returns {string | null} - Claude session_id or null if not found
 */
function findSessionId(sessionName, projectPath = null) {
	// Try tmux-named signal file first (in /tmp, cleared on restart)
	const tmuxSignalFile = `/tmp/squad-signal-tmux-${sessionName}.json`;
	if (existsSync(tmuxSignalFile)) {
		try {
			const data = JSON.parse(readFileSync(tmuxSignalFile, 'utf-8'));
			if (data.session_id) {
				return data.session_id;
			}
		} catch (e) {
			console.error(`Failed to parse ${tmuxSignalFile}:`, e);
		}
	}

	// Fallback: search timeline for the session (in /tmp, cleared on restart)
	const agentName = sessionName.replace(/^squad-/, '');
	const timelineFile = `/tmp/squad-timeline-${sessionName}.jsonl`;
	if (existsSync(timelineFile)) {
		try {
			const lines = readFileSync(timelineFile, 'utf-8').trim().split('\n');
			// Search from newest to oldest for a session_id
			for (let i = lines.length - 1; i >= 0; i--) {
				try {
					const event = JSON.parse(lines[i]);
					if (event.session_id) {
						return event.session_id;
					}
				} catch (e) {
					// Skip malformed lines
				}
			}
		} catch (e) {
			console.error(`Failed to read timeline ${timelineFile}:`, e);
		}
	}

	// Fallback: search persistent .claude/sessions/agent-*.txt files (survive restarts)
	// These files are named agent-{sessionId}.txt and contain the agent name
	if (projectPath) {
		const sessionsDir = join(projectPath, '.claude', 'sessions');
		if (existsSync(sessionsDir)) {
			try {
				const files = readdirSync(sessionsDir);
				// Sort by modification time (newest first) to get the most recent session
				const agentFiles = files
					.filter(f => f.startsWith('agent-') && f.endsWith('.txt'))
					.map(f => {
						const filePath = join(sessionsDir, f);
						return {
							name: f,
							path: filePath,
							mtime: existsSync(filePath) ? statSync(filePath).mtime.getTime() : 0
						};
					})
					.sort((a, b) => b.mtime - a.mtime);

				for (const file of agentFiles) {
					try {
						const content = readFileSync(file.path, 'utf-8').trim();
						if (content === agentName) {
							// Extract session ID from filename: agent-{sessionId}.txt
							const match = file.name.match(/^agent-(.+)\.txt$/);
							if (match) {
								return match[1];
							}
						}
					} catch (e) {
						// Skip unreadable files
					}
				}
			} catch (e) {
				console.error(`Failed to scan sessions dir ${sessionsDir}:`, e);
			}
		}
	}

	// Final fallback: scan Claude JSONL session files for agent's signals
	// This catches sessions where .claude/sessions/agent-*.txt was never created
	if (projectPath) {
		const agentName = sessionName.replace(/^squad-/, '');
		const jsonlSessionId = findSessionIdFromJsonl(agentName, projectPath);
		if (jsonlSessionId) {
			return jsonlSessionId;
		}
	}

	return null;
}

/**
 * Resolve a project name or path to a full path
 * @param {string} project - Project name (e.g., "squad") or path (e.g., "~/code/squad")
 * @returns {string | null} - Full path or null
 */
function resolveProjectPath(project) {
	if (!project) return null;

	const homeDir = process.env.HOME || '';

	// If it's already a path (contains /), resolve ~ and return
	if (project.includes('/')) {
		return project.replace(/^~/, homeDir);
	}

	// It's a project name - look up in config
	const configPath = `${homeDir}/.config/squad/projects.json`;
	if (existsSync(configPath)) {
		try {
			const config = JSON.parse(readFileSync(configPath, 'utf-8'));
			const projectConfig = config.projects?.[project];
			if (projectConfig?.path) {
				return projectConfig.path.replace(/^~/, homeDir);
			}
		} catch (e) {
			// Continue to fallback
		}
	}

	// Fallback: assume ~/code/{project}
	const fallbackPath = `${homeDir}/code/${project}`;
	if (existsSync(fallbackPath)) {
		return fallbackPath;
	}

	return null;
}

/**
 * Get project path for an agent
 * @param {string} agentName - Agent name
 * @returns {Promise<string | null>} - Project path or null
 */
async function getProjectPath(agentName) {
	// Check signal file for project info
	const signalFile = `/tmp/squad-signal-tmux-squad-${agentName}.json`;
	if (existsSync(signalFile)) {
		try {
			const data = JSON.parse(readFileSync(signalFile, 'utf-8'));
			if (data.data?.project) {
				const resolved = resolveProjectPath(data.data.project);
				if (resolved) return resolved;
			}
		} catch (e) {
			// Continue to fallback
		}
	}

	// Check timeline for project
	const timelineFile = `/tmp/squad-timeline-squad-${agentName}.jsonl`;
	if (existsSync(timelineFile)) {
		try {
			const lines = readFileSync(timelineFile, 'utf-8').trim().split('\n');
			// Search for starting signal which has project info
			for (let i = lines.length - 1; i >= 0; i--) {
				try {
					const event = JSON.parse(lines[i]);
					if (event.data?.project) {
						const resolved = resolveProjectPath(event.data.project);
						if (resolved) return resolved;
					}
				} catch (e) {
					// Skip malformed lines
				}
			}
		} catch (e) {
			// Continue to fallback
		}
	}

	// Query Agent Mail database for agent's registered project
	// This is the most reliable source when temp files don't exist (e.g., after reboot)
	const dbProjectPath = getAgentProjectFromDb(agentName);
	if (dbProjectPath && existsSync(dbProjectPath)) {
		return dbProjectPath;
	}

	// Default to current working directory
	return process.cwd().replace(/\/ide$/, '');
}

/**
 * POST /api/sessions/[name]/resume
 * Resume a session using Claude's -r flag
 *
 * Body can include:
 * - session_id: Claude conversation ID to resume (if known)
 * - project: Project name or path (optional override)
 */
/** @type {import('./$types').RequestHandler} */
export async function POST({ params, request }) {
	try {
		const { agentName, sessionName } = resolveSessionName(params.name);

		if (!agentName) {
			return json({
				error: 'Missing agent name',
				message: 'Agent name is required'
			}, { status: 400 });
		}

		// Parse request body for optional session_id
		/** @type {{project?: string, session_id?: string | null}} */
		let body = {};
		try {
			body = await request.json();
		} catch {
			// No body or invalid JSON is fine
		}

		// Get project path - use provided path if available, otherwise look it up
		let projectPath = body.project ? resolveProjectPath(body.project) : null;
		if (!projectPath) {
			projectPath = await getProjectPath(agentName);
		}
		if (!projectPath || !existsSync(projectPath)) {
			return json({
				error: 'Project path not found',
				message: `Could not find project path for agent '${agentName}'.`,
				agentName,
				sessionName
			}, { status: 404 });
		}

		// Use provided session_id or look it up from signal files AND persistent agent files
		let sessionId = body.session_id;
		if (!sessionId) {
			sessionId = findSessionId(sessionName, projectPath);
		}

		if (!sessionId) {
			return json({
				error: 'Session ID not found',
				message: `Could not find session ID for agent '${agentName}'. No matching session files found in /tmp or .claude/sessions/.`,
				agentName,
				sessionName,
				projectPath
			}, { status: 404 });
		}

		// Get terminal emulator from config or use defaults
		let terminal = 'auto';
		const configPath = `${process.env.HOME}/.config/squad/projects.json`;
		if (existsSync(configPath)) {
			try {
				const config = JSON.parse(readFileSync(configPath, 'utf-8'));
				terminal = config.defaults?.terminal || 'auto';
			} catch (e) {
				// Use default
			}
		}
		// Resolve 'auto' to platform default
		if (terminal === 'auto') {
			if (process.platform === 'darwin') {
				if (existsSync('/Applications/Ghostty.app')) {
					terminal = 'ghostty';
				} else {
					terminal = existsSync('/Applications/iTerm.app') ? 'iterm2' : 'apple-terminal';
				}
			} else {
				terminal = 'alacritty';
			}
		}

		// Get claude flags from config
		let claudeFlags = '';
		if (existsSync(configPath)) {
			try {
				const config = JSON.parse(readFileSync(configPath, 'utf-8'));
				claudeFlags = config.defaults?.claude_flags || '';
				// Inject permission flag from autonomous mode toggle only
				if (config.defaults?.skip_permissions) {
					claudeFlags = (claudeFlags + ' --dangerously-skip-permissions').trim();
				}
			} catch (e) {
				// Use default
			}
		}

		// Write resume marker file so IDE can show "RESUMED" badge
		const resumeMarker = `/tmp/squad-resumed-${sessionName}.json`;
		const resumeData = JSON.stringify({
			resumed: true,
			originalSessionId: sessionId,
			agentName,
			project: projectPath,
			resumedAt: new Date().toISOString()
		}, null, 2);
		try {
			const { writeFileSync } = await import('fs');
			writeFileSync(resumeMarker, resumeData);
		} catch (e) {
			console.error('Failed to write resume marker:', e);
		}

		// Build the resume command wrapped in a tmux session for IDE tracking
		// 1. Kill any existing session with this name (in case it's stale)
		// 2. Create new tmux session with claude -r running inside
		// 3. Attach terminal to that session
		const tmuxCreateCmd = `tmux kill-session -t "${sessionName}" 2>/dev/null; tmux new-session -d -s "${sessionName}" -c "${projectPath}" "claude ${claudeFlags} -r '${sessionId}'"`;
		const tmuxAttachCmd = `tmux attach-session -t "${sessionName}"`;

		// First create the tmux session
		try {
			await execAsync(tmuxCreateCmd);
		} catch (e) {
			// Ignore errors from kill-session if session doesn't exist
			console.log('tmux session creation:', /** @type {Error} */ (e).message);
		}

		// Then launch terminal attached to the tmux session
		const attachCommand = tmuxAttachCmd;
		let child;
		switch (terminal) {
			case 'apple-terminal':
				child = spawn('osascript', ['-e', `
					tell application "Terminal"
						do script "bash -c '${attachCommand}'"
						activate
					end tell
				`], { detached: true, stdio: 'ignore' });
				break;
			case 'iterm2':
				child = spawn('osascript', ['-e', `
					tell application "iTerm"
						create window with default profile command "bash -c '${attachCommand}'"
					end tell
				`], { detached: true, stdio: 'ignore' });
				break;
			case 'ghostty':
				if (process.platform === 'darwin') {
					child = spawn('ghostty', ['+new-window', '-e', 'bash', '-c', attachCommand], {
						detached: true, stdio: 'ignore'
					});
				} else {
					child = spawn('ghostty', ['-e', 'bash', '-c', attachCommand], {
						detached: true, stdio: 'ignore'
					});
				}
				break;
			case 'alacritty':
				child = spawn('alacritty', ['-e', 'bash', '-c', attachCommand], {
					detached: true,
					stdio: 'ignore'
				});
				break;
			case 'kitty':
				child = spawn('kitty', ['bash', '-c', attachCommand], {
					detached: true,
					stdio: 'ignore'
				});
				break;
			case 'gnome-terminal':
				child = spawn('gnome-terminal', ['--', 'bash', '-c', attachCommand], {
					detached: true,
					stdio: 'ignore'
				});
				break;
			case 'konsole':
				child = spawn('konsole', ['-e', 'bash', '-c', attachCommand], {
					detached: true,
					stdio: 'ignore'
				});
				break;
			default:
				child = spawn('xterm', ['-e', 'bash', '-c', attachCommand], {
					detached: true,
					stdio: 'ignore'
				});
		}

		child.unref();

		return json({
			success: true,
			agentName,
			sessionName,
			sessionId,
			projectPath,
			terminal,
			message: `Resuming session for ${agentName} in new terminal`,
			timestamp: new Date().toISOString()
		});

	} catch (error) {
		console.error('Error in POST /api/sessions/[name]/resume:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
