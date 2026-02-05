/**
 * Projects API
 * GET /api/projects - List projects from JAT config (~/.config/jat/projects.json)
 *
 * Query params:
 *   ?visible=true - Only return visible projects (not hidden)
 *   ?stats=true - Include task/agent/status stats for each project
 *
 * Returns projects from JAT config, falling back to ~/code/* directory scan
 */

import { json } from '@sveltejs/kit';
import { readFile, readdir, stat, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { apiCache, cacheKey, CACHE_TTL, invalidateCache } from '$lib/server/cache.js';
import { rgbToHex } from '$lib/utils/projectConfig';
import { getTasks, initProject } from '$lib/server/jat-tasks.js';

const execAsync = promisify(exec);

// Path to JAT config
const CONFIG_DIR = join(homedir(), '.config', 'jat');
const CONFIG_FILE = join(CONFIG_DIR, 'projects.json');

// Path to IDE visibility settings (separate from JAT config)
const IDE_SETTINGS_FILE = join(CONFIG_DIR, 'ide-projects.json');

/**
 * Read JAT projects config
 */
async function readJatConfig() {
	try {
		if (!existsSync(CONFIG_FILE)) {
			return null;
		}
		const content = await readFile(CONFIG_FILE, 'utf-8');
		return JSON.parse(content);
	} catch (error) {
		console.error('Failed to read JAT config:', error);
		return null;
	}
}

/**
 * Read IDE visibility settings
 */
async function readIdeSettings() {
	try {
		if (!existsSync(IDE_SETTINGS_FILE)) {
			return { hiddenProjects: [] };
		}
		const content = await readFile(IDE_SETTINGS_FILE, 'utf-8');
		return JSON.parse(content);
	} catch (error) {
		console.error('Failed to read IDE settings:', error);
		return { hiddenProjects: [] };
	}
}

/**
 * Write IDE visibility settings
 * @param {{ hiddenProjects?: string[] }} settings
 */
async function writeIdeSettings(settings) {
	try {
		// Ensure config directory exists
		if (!existsSync(CONFIG_DIR)) {
			await import('fs/promises').then(fs => fs.mkdir(CONFIG_DIR, { recursive: true }));
		}
		await writeFile(IDE_SETTINGS_FILE, JSON.stringify(settings, null, 2));
		return true;
	} catch (error) {
		console.error('Failed to write IDE settings:', error);
		return false;
	}
}

/**
 * Fallback: scan ~/code for directories
 */
async function scanCodeDirectory() {
	const codeDir = join(homedir(), 'code');
	if (!existsSync(codeDir)) {
		return [];
	}

	const entries = await readdir(codeDir, { withFileTypes: true });
	return entries
		.filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
		.map(entry => ({
			name: entry.name,
			path: join(codeDir, entry.name),
			source: 'filesystem'
		}));
}

/**
 * Scan ~/code for directories with .jat/ initialized
 * Returns projects that have JAT set up but aren't in JAT config
 */
async function scanJatProjects() {
	const codeDir = join(homedir(), 'code');
	if (!existsSync(codeDir)) {
		return [];
	}

	const entries = await readdir(codeDir, { withFileTypes: true });
	const jatProjects = [];

	for (const entry of entries) {
		if (!entry.isDirectory() || entry.name.startsWith('.')) {
			continue;
		}

		const projectPath = join(codeDir, entry.name);
		const jatDir = join(projectPath, '.jat');

		// Only include if .jat/ directory exists
		if (existsSync(jatDir)) {
			jatProjects.push({
				name: entry.name,
				path: projectPath,
				source: 'jat-discovered'
			});
		}
	}

	return jatProjects;
}

/**
 * Check if a directory is a git repository
 * @param {string} dirPath
 * @returns {Promise<boolean>}
 */
async function isGitRepo(dirPath) {
	try {
		await execAsync('git rev-parse --git-dir', { cwd: dirPath, timeout: 5000 });
		return true;
	} catch {
		return false;
	}
}

/**
 * Check if JAT is initialized in a directory
 * @param {string} dirPath
 * @returns {boolean}
 */
function hasJatInit(dirPath) {
	return existsSync(join(dirPath, '.jat'));
}

/**
 * Initialize JAT in a project directory
 * Returns { success, steps, error? }
 * @param {string} projectPath
 * @returns {Promise<{ success: boolean, steps: string[], error?: string }>}
 */
async function initializeJat(projectPath) {
	const steps = [];

	// Initialize git if not a git repo
	const isGit = await isGitRepo(projectPath);
	if (!isGit) {
		try {
			await execAsync('git init', { cwd: projectPath, timeout: 10000 });
			steps.push('Initialized git repository');

			// Create a basic .gitignore if it doesn't exist
			const gitignorePath = join(projectPath, '.gitignore');
			if (!existsSync(gitignorePath)) {
				const { writeFileSync } = await import('fs');
				writeFileSync(gitignorePath, 'node_modules/\n.env\n.DS_Store\n*.log\n');
				steps.push('Created .gitignore');
			}
		} catch (gitError) {
			return {
				success: false,
				steps,
				error: `Failed to initialize git: ${gitError instanceof Error ? gitError.message : 'Unknown error'}`
			};
		}
	}

	// Check if JAT is already initialized
	if (hasJatInit(projectPath)) {
		steps.push('JAT already initialized');
		return { success: true, steps };
	}

	// Initialize task database directly via lib/tasks.js
	try {
		initProject(projectPath);
		steps.push('Initialized task management');
		return { success: true, steps };
	} catch (initError) {
		return {
			success: false,
			steps,
			error: `Failed to initialize tasks: ${initError instanceof Error ? initError.message : 'Unknown error'}`
		};
	}
}

/**
 * Get task counts for a project from lib/tasks.js
 * @param {string} projectPath
 */
function getProjectTaskCounts(projectPath) {
	try {
		// Extract project name from path for filtering by task ID prefix
		const projectName = projectPath.split('/').pop();
		const tasks = getTasks({ projectName });
		const open = tasks.filter((/** @type {{status: string}} */ t) => t.status === 'open' || t.status === 'in_progress').length;
		const total = tasks.length;
		return { open, total };
	} catch (err) {
		console.error(`[getProjectTaskCounts] Error for ${projectPath}:`, /** @type {Error} */ (err).message);
		return { open: 0, total: 0 };
	}
}

/**
 * Get agent count for a project
 * @param {string} projectPath
 */
async function getProjectAgentCount(projectPath) {
	try {
		// Get project name from path (e.g., /home/jw/code/jat -> jat)
		const projectName = projectPath.split('/').pop();

		// Count active tmux sessions with jat-* prefix for this project
		// Sessions are named jat-{AgentName}, and we need to check which ones
		// are working on this project
		let active = 0;

		try {
			const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}" 2>/dev/null', { timeout: 2000 });
			const sessions = stdout.trim().split('\n').filter(s => s.startsWith('jat-'));

			// For each session, check if it's working on this project by reading its agent file
			for (const sessionName of sessions) {
				const agentName = sessionName.replace('jat-', '');
				// Check if this agent has an agent file in this project's .claude/sessions/
				const sessionsDir = join(projectPath, '.claude', 'sessions');
				const claudeDir = join(projectPath, '.claude');

				// Look for any agent file containing this agent name
				let foundInProject = false;

				// Check sessions directory
				if (existsSync(sessionsDir)) {
					const entries = await readdir(sessionsDir);
					for (const file of entries.filter(f => f.startsWith('agent-') && f.endsWith('.txt'))) {
						const content = await readFile(join(sessionsDir, file), 'utf-8');
						if (content.trim() === agentName) {
							foundInProject = true;
							break;
						}
					}
				}

				// Check legacy location if not found
				if (!foundInProject && existsSync(claudeDir)) {
					const entries = await readdir(claudeDir);
					for (const file of entries.filter(f => f.startsWith('agent-') && f.endsWith('.txt'))) {
						const content = await readFile(join(claudeDir, file), 'utf-8');
						if (content.trim() === agentName) {
							foundInProject = true;
							break;
						}
					}
				}

				if (foundInProject) {
					active++;
				}
			}
		} catch {
			// tmux not available or no sessions
		}

		// Count total registered agents (all agent files)
		let total = 0;
		const sessionsDir = join(projectPath, '.claude', 'sessions');
		const claudeDir = join(projectPath, '.claude');

		if (existsSync(sessionsDir)) {
			const entries = await readdir(sessionsDir);
			total += entries.filter(f => f.startsWith('agent-') && f.endsWith('.txt')).length;
		}

		if (existsSync(claudeDir)) {
			const entries = await readdir(claudeDir);
			total += entries.filter(f => f.startsWith('agent-') && f.endsWith('.txt')).length;
		}

		return { active, total };
	} catch {
		return { active: 0, total: 0 };
	}
}

/**
 * Check if a tmux session exists
 * @param {string} sessionName
 * @returns {Promise<boolean>}
 */
async function tmuxSessionExists(sessionName) {
	try {
		await execAsync(`tmux has-session -t "${sessionName}" 2>/dev/null`, { timeout: 2000 });
		return true;
	} catch {
		return false;
	}
}

/**
 * Check if a port is actively listening
 * @param {number|null} port
 * @returns {Promise<boolean>}
 */
async function isPortListening(port) {
	if (!port) return false;
	try {
		const { stdout } = await execAsync(`ss -tlnp 2>/dev/null | grep -q ":${port} " && echo "yes" || echo "no"`, {
			timeout: 2000
		});
		return stdout.trim() === 'yes';
	} catch {
		return false;
	}
}

/**
 * Get server status for a project
 * Returns 'running' | 'starting' | 'stopped' | null
 * - running: tmux session exists AND port is listening
 * - starting: tmux session exists but port not yet listening
 * - stopped: no tmux session (or null if no port configured)
 *
 * @param {string} projectName
 * @param {number|null} port
 */
async function getServerStatus(projectName, port) {
	const sessionName = `server-${projectName}`;
	const sessionExists = await tmuxSessionExists(sessionName);

	if (!sessionExists) {
		// No session - return null (unknown/stopped)
		return null;
	}

	// Session exists - check if port is listening
	if (port) {
		const portListening = await isPortListening(port);
		return portListening ? 'running' : 'starting';
	}

	// Session exists but no port configured - assume running
	return 'running';
}

/**
 * Get last activity time for a project
 * Checks multiple sources and returns the most recent:
 * 1. JAT task file (.jat/issues.jsonl) - task creation/updates
 * 2. Agent session files (.claude/sessions/agent-*.txt) - agent activity
 * 3. Git commit time
 * 4. Directory mtime (fallback)
 * @param {string} projectPath
 * @returns {Promise<{formatted: string|null, agentActivityMs: number}>}
 */
async function getLastActivity(projectPath) {
	let mostRecentMs = 0;
	let agentActivityMs = 0;

	// Check .jat/issues.jsonl first (most meaningful for task activity)
	try {
		const jatFile = join(projectPath, '.jat', 'issues.jsonl');
		if (existsSync(jatFile)) {
			const stats = await stat(jatFile);
			if (stats.mtimeMs > mostRecentMs) {
				mostRecentMs = stats.mtimeMs;
			}
		}
	} catch {
		// Ignore errors checking jat file
	}

	// Check .claude/sessions/agent-*.txt files (agent session activity)
	// Only check sessions/ subdirectory (legacy .claude/agent-*.txt is deprecated)
	const sessionsDir = join(projectPath, '.claude', 'sessions');
	try {
		if (existsSync(sessionsDir)) {
			const entries = await readdir(sessionsDir);
			const agentFiles = entries.filter(f => f.startsWith('agent-') && f.endsWith('.txt'));
			for (const file of agentFiles) {
				const stats = await stat(join(sessionsDir, file));
				if (stats.mtimeMs > mostRecentMs) {
					mostRecentMs = stats.mtimeMs;
				}
				// Track agent activity separately (for sorting when servers are running)
				if (stats.mtimeMs > agentActivityMs) {
					agentActivityMs = stats.mtimeMs;
				}
			}
		}
	} catch {
		// Ignore errors checking agent files
	}

	// Check git commit time
	try {
		const { stdout } = await execAsync('git log -1 --format="%ct"', {
			cwd: projectPath,
			timeout: 3000
		});
		const timestamp = parseInt(stdout.trim(), 10);
		if (!isNaN(timestamp)) {
			const gitMs = timestamp * 1000;
			if (gitMs > mostRecentMs) {
				mostRecentMs = gitMs;
			}
		}
	} catch {
		// Ignore git errors
	}

	// Fallback to directory mtime if nothing found
	if (mostRecentMs === 0) {
		try {
			const stats = await stat(projectPath);
			mostRecentMs = stats.mtimeMs;
		} catch {
			return { formatted: null, agentActivityMs: 0 };
		}
	}

	return {
		formatted: mostRecentMs > 0 ? formatRelativeTime(mostRecentMs) : null,
		agentActivityMs
	};
}

/**
 * Format timestamp as relative time (e.g., "3m", "2h", "4d")
 * @param {number} timestamp
 */
function formatRelativeTime(timestamp) {
	const now = Date.now();
	const diff = now - timestamp;
	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) return `${days}d`;
	if (hours > 0) return `${hours}h`;
	if (minutes > 0) return `${minutes}m`;
	return 'now';
}

export async function GET({ url }) {
	try {
		const visibleOnly = url.searchParams.get('visible') === 'true';
		const includeStats = url.searchParams.get('stats') === 'true';

		// Build cache key
		const key = cacheKey('projects', {
			visible: visibleOnly ? 'true' : undefined,
			stats: includeStats ? 'true' : undefined
		});

		// Use longer TTL for stats (expensive) vs base (fast)
		const ttl = includeStats ? CACHE_TTL.LONG : CACHE_TTL.MEDIUM;

		// Check cache
		const cached = apiCache.get(key);
		if (cached) {
			return json(cached);
		}

		// Read JAT config
		const jatConfig = await readJatConfig();
		const ideSettings = await readIdeSettings();
		// Normalize hidden projects to lowercase for case-insensitive comparison
		const hiddenProjects = new Set((ideSettings.hiddenProjects || []).map((/** @type {string} */ p) => p.toLowerCase()));

		let projects = [];

		if (jatConfig?.projects) {
			// Use JAT config as ONLY source (no auto-discovery)
			for (const [key, config] of Object.entries(jatConfig.projects)) {
				const projectPath = config.path?.replace(/^~/, homedir()) || join(homedir(), 'code', key);

				// serverPath is where 'npm run dev' should be executed (optional, defaults to path)
				const serverPath = config.server_path?.replace(/^~/, homedir()) || null;

				projects.push({
					name: key,
					key, // Include key explicitly for easier mapping
					displayName: config.name || key.toUpperCase(),
					path: projectPath,
					serverPath,
					port: config.port || null,
					activeColor: config.active_color ? rgbToHex(config.active_color) : null,
					inactiveColor: config.inactive_color ? rgbToHex(config.inactive_color) : null,
					databaseUrl: config.database_url || null,
					description: config.description || null,
					notes: config.notes || null,
					notesHeight: config.notes_height || null,
					hidden: hiddenProjects.has(key.toLowerCase()),
					source: 'jat-config'
				});
			}
		} else {
			// No config file - return empty projects array
			// Users must create ~/.config/jat/projects.json to add projects
			projects = [];
		}

		// Filter hidden projects if requested
		if (visibleOnly) {
			projects = projects.filter(p => !p.hidden);
		}

		// Add stats if requested
		if (includeStats) {
			projects = await Promise.all(projects.map(async (project) => {
				// Check if .jat/ directory exists
				const jatDir = join(project.path, '.jat');
				const hasJat = existsSync(jatDir);

				// Check if CLAUDE.md or AGENTS.md exists in project root
				const hasClaudeMd = existsSync(join(project.path, 'CLAUDE.md')) ||
					existsSync(join(project.path, 'AGENTS.md'));

				const [tasks, agents, status, activityData] = await Promise.all([
					getProjectTaskCounts(project.path),
					getProjectAgentCount(project.path),
					getServerStatus(project.name, project.port),
					getLastActivity(project.path)
				]);

				return {
					...project,
					stats: {
						hasJat,
						hasClaudeMd,
						agentCount: agents.active,
						taskCount: tasks.total,
						openTaskCount: tasks.open,
						serverRunning: status === 'running'
					},
					// Keep legacy fields for backwards compat
					tasks,
					agents,
					status,
					// If server is running or starting, it's active now (for display)
					lastActivity: (status === 'running' || status === 'starting') ? 'now' : activityData.formatted,
					// Track agent activity separately for sorting tiebreakers
					_agentActivityMs: activityData.agentActivityMs
				};
			}));
		}

		// Sort by activity AND task count if stats included
		// Priority: 1) Has recent activity + has tasks, 2) Has tasks, 3) Recency alone
		if (includeStats) {
			projects.sort((a, b) => {
				// Get task counts (projects with no tasks should sort lower)
				// @ts-ignore - stats exists when includeStats is true
				const tasksA = a.stats?.openTaskCount || 0;
				// @ts-ignore - stats exists when includeStats is true
				const tasksB = b.stats?.openTaskCount || 0;
				const hasTasksA = tasksA > 0;
				const hasTasksB = tasksB > 0;

				// Calculate activity score
				// "now" < "3m" < "2h" < "4d"
				/** @type {Record<string, number>} */
				const order = { 'now': 0, 'm': 1, 'h': 2, 'd': 3 };
				/** @param {string|null|undefined} t */
				const getScore = (t) => {
					if (!t) return 999999; // Unknown/null sorts to end (after "999d")
					if (t === 'now') return 0;
					const unit = t.slice(-1);
					const num = parseInt(t.slice(0, -1), 10);
					return (order[unit] || 3) * 1000 + num;
				};
				// @ts-ignore - lastActivity exists when includeStats is true
				const scoreA = getScore(a.lastActivity);
				// @ts-ignore - lastActivity exists when includeStats is true
				const scoreB = getScore(b.lastActivity);

				// Define "recent" as within the last week (7 days = 7000 in score)
				const isRecentA = scoreA < 7000;
				const isRecentB = scoreB < 7000;

				// Sorting priority:
				// 1. Projects with tasks AND recent activity (sort by recency among these)
				// 2. Projects with tasks but older activity (sort by recency among these)
				// 3. Projects without tasks but recent activity (sort by recency)
				// 4. Projects without tasks and old activity (sort by recency)

				// First: separate projects with tasks from those without
				if (hasTasksA && !hasTasksB) return -1;
				if (!hasTasksA && hasTasksB) return 1;

				// Within same task category, sort by activity score
				if (scoreA !== scoreB) {
					return scoreA - scoreB;
				}

				// If both have same score (e.g., both "now" from running servers),
				// use agent activity timestamp as tiebreaker (more recent wins)
				// @ts-ignore - _agentActivityMs exists when includeStats is true
				return (b._agentActivityMs || 0) - (a._agentActivityMs || 0);
			});

			// Remove internal _agentActivityMs field from response
			// @ts-ignore - _agentActivityMs exists when includeStats is true
			projects = projects.map(({ _agentActivityMs, ...project }) => project);
		}

		// Build response
		const responseData = {
			projects,
			source: jatConfig ? 'jat-config' : 'filesystem',
			configPath: CONFIG_FILE,
			settingsPath: IDE_SETTINGS_FILE
		};

		// Cache the response
		apiCache.set(key, responseData, ttl);

		return json(responseData);
	} catch (error) {
		console.error('Failed to list projects:', error);
		return json({ projects: [], error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
}

/**
 * Write JAT config back to file
 * @param {object} config
 */
async function writeJatConfig(config) {
	try {
		// Ensure config directory exists
		if (!existsSync(CONFIG_DIR)) {
			await import('fs/promises').then(fs => fs.mkdir(CONFIG_DIR, { recursive: true }));
		}
		await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
		return true;
	} catch (error) {
		console.error('Failed to write JAT config:', error);
		return false;
	}
}

/**
 * Validate project key format
 * Must be lowercase alphanumeric with hyphens, 2-50 chars
 * @param {string} key
 * @returns {{ valid: boolean, error?: string }}
 */
function validateProjectKey(key) {
	if (!key || typeof key !== 'string') {
		return { valid: false, error: 'Project key is required' };
	}
	if (key.length < 2 || key.length > 50) {
		return { valid: false, error: 'Project key must be 2-50 characters' };
	}
	if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]{1,2}$/.test(key)) {
		return { valid: false, error: 'Project key must be lowercase alphanumeric with optional hyphens (not at start/end)' };
	}
	return { valid: true };
}

/**
 * PATCH /api/projects - Update project fields
 * Body: { project: string, description?: string, port?: number | null, server_path?: string, database_url?: string, active_color?: string, inactive_color?: string, notes?: string, notes_height?: number }
 *
 * Colors should be in "rgb(rrggbb)" format for consistency with JAT config.
 * Example: "rgb(5588ff)" for blue, "rgb(00d4aa)" for teal
 */
export async function PATCH({ request }) {
	try {
		const body = await request.json();
		const { project, description, port, server_path, database_url, active_color, inactive_color, notes, notes_height } = body;

		if (!project) {
			return json({ error: 'Project name required' }, { status: 400 });
		}

		const jatConfig = await readJatConfig();
		if (!jatConfig?.projects?.[project]) {
			return json({ error: 'Project not found in config' }, { status: 404 });
		}

		// Update fields if provided
		if (description !== undefined) {
			jatConfig.projects[project].description = description || null;
		}
		if (port !== undefined) {
			jatConfig.projects[project].port = port;
		}
		if (server_path !== undefined) {
			if (server_path) {
				jatConfig.projects[project].server_path = server_path;
			} else {
				delete jatConfig.projects[project].server_path;
			}
		}
		if (database_url !== undefined) {
			if (database_url) {
				jatConfig.projects[project].database_url = database_url;
			} else {
				delete jatConfig.projects[project].database_url;
			}
		}
		if (active_color !== undefined) {
			jatConfig.projects[project].active_color = active_color || null;
		}
		if (inactive_color !== undefined) {
			jatConfig.projects[project].inactive_color = inactive_color || null;
		}
		if (notes !== undefined) {
			if (notes) {
				jatConfig.projects[project].notes = notes;
			} else {
				delete jatConfig.projects[project].notes;
			}
		}
		if (notes_height !== undefined) {
			if (notes_height && notes_height > 0) {
				jatConfig.projects[project].notes_height = notes_height;
			} else {
				delete jatConfig.projects[project].notes_height;
			}
		}

		const success = await writeJatConfig(jatConfig);
		if (!success) {
			return json({ error: 'Failed to save config' }, { status: 500 });
		}

		// Invalidate projects cache since config changed
		invalidateCache.projects();

		return json({
			success: true,
			project,
			description: jatConfig.projects[project].description,
			port: jatConfig.projects[project].port,
			server_path: jatConfig.projects[project].server_path,
			database_url: jatConfig.projects[project].database_url,
			active_color: jatConfig.projects[project].active_color,
			inactive_color: jatConfig.projects[project].inactive_color,
			notes: jatConfig.projects[project].notes,
			notes_height: jatConfig.projects[project].notes_height
		});
	} catch (error) {
		console.error('Failed to update project:', error);
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
}

/**
 * POST /api/projects - Create project or update visibility settings
 * Body for create: { action: 'create', key: string, path?: string, name?: string, port?: number, description?: string }
 * Body for visibility: { action: 'hide' | 'show', project: string }
 *       or { hiddenProjects: string[] } to set all at once
 */
export async function POST({ request }) {
	try {
		const body = await request.json();

		// Handle create action
		if (body.action === 'create') {
			const { key, path: projectPath, name, port, description, active_color, inactive_color, createDirectory } = body;

			// Validate key format
			const keyValidation = validateProjectKey(key);
			if (!keyValidation.valid) {
				return json({ error: keyValidation.error }, { status: 400 });
			}

			// Resolve path (default to ~/code/{key})
			const resolvedPath = projectPath
				? projectPath.replace(/^~/, homedir())
				: join(homedir(), 'code', key);

			// Verify directory exists (or create it if requested)
			if (!existsSync(resolvedPath)) {
				if (createDirectory) {
					// User requested to create the directory
					try {
						const { mkdirSync } = await import('fs');
						mkdirSync(resolvedPath, { recursive: true });
					} catch (mkdirError) {
						return json({
							error: `Failed to create directory: ${mkdirError instanceof Error ? mkdirError.message : String(mkdirError)}`,
							path: resolvedPath
						}, { status: 500 });
					}
				} else {
					// Return error with flag indicating directory can be created
					return json({
						error: `Directory does not exist: ${resolvedPath}`,
						directoryNotFound: true,
						path: resolvedPath
					}, { status: 400 });
				}
			}

			// Initialize JAT (and git if needed) in the directory
			const jatResult = await initializeJat(resolvedPath);
			if (!jatResult.success) {
				return json({
					error: jatResult.error || 'Failed to initialize JAT',
					path: resolvedPath,
					steps: jatResult.steps
				}, { status: 500 });
			}

			// Read current config
			let jatConfig = await readJatConfig();
			if (!jatConfig) {
				jatConfig = { projects: {} };
			}
			if (!jatConfig.projects) {
				jatConfig.projects = {};
			}

			// Check if project already exists
			if (jatConfig.projects[key]) {
				return json({ error: `Project '${key}' already exists` }, { status: 409 });
			}

			// Create project entry
			jatConfig.projects[key] = {
				name: name || key.toUpperCase(),
				path: resolvedPath
			};

			// Add optional fields
			if (port !== undefined && port !== null) {
				jatConfig.projects[key].port = port;
			}
			if (description) {
				jatConfig.projects[key].description = description;
			}
			if (active_color) {
				jatConfig.projects[key].active_color = active_color;
			}
			if (inactive_color) {
				jatConfig.projects[key].inactive_color = inactive_color;
			}

			// Save config
			const success = await writeJatConfig(jatConfig);
			if (!success) {
				return json({ error: 'Failed to save config' }, { status: 500 });
			}

			// Invalidate cache
			invalidateCache.projects();

			return json({
				success: true,
				project: {
					key,
					...jatConfig.projects[key]
				},
				steps: [...jatResult.steps, 'Added to JAT configuration'],
				message: `Successfully created project: ${key}`
			});
		}

		// Handle visibility settings
		const settings = await readIdeSettings();

		if (body.hiddenProjects !== undefined) {
			// Set all hidden projects at once
			settings.hiddenProjects = body.hiddenProjects;
		} else if (body.action && body.project) {
			// Toggle single project
			const hiddenSet = new Set(settings.hiddenProjects || []);

			if (body.action === 'hide') {
				hiddenSet.add(body.project);
			} else if (body.action === 'show') {
				hiddenSet.delete(body.project);
			} else {
				return json({ error: `Unknown action: ${body.action}` }, { status: 400 });
			}

			settings.hiddenProjects = Array.from(hiddenSet);
		} else {
			return json({ error: 'Invalid request body' }, { status: 400 });
		}

		const success = await writeIdeSettings(settings);
		if (!success) {
			return json({ error: 'Failed to save settings' }, { status: 500 });
		}

		// Invalidate projects cache since visibility changed
		invalidateCache.projects();

		return json({ success: true, hiddenProjects: settings.hiddenProjects });
	} catch (error) {
		console.error('Failed to update project settings:', error);
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
}

/**
 * DELETE /api/projects - Remove project from config
 * Body: { project: string }
 *
 * Note: This only removes the project from the config, not the actual directory.
 */
export async function DELETE({ request }) {
	try {
		const body = await request.json();
		const { project } = body;

		if (!project || typeof project !== 'string') {
			return json({ error: 'Project name required' }, { status: 400 });
		}

		// Read current config
		const jatConfig = await readJatConfig();
		if (!jatConfig?.projects?.[project]) {
			return json({ error: `Project '${project}' not found in config` }, { status: 404 });
		}

		// Remove project from config
		delete jatConfig.projects[project];

		// Save config
		const success = await writeJatConfig(jatConfig);
		if (!success) {
			return json({ error: 'Failed to save config' }, { status: 500 });
		}

		// Also remove from hidden projects if present
		const settings = await readIdeSettings();
		if (settings.hiddenProjects?.includes(project)) {
			settings.hiddenProjects = settings.hiddenProjects.filter((/** @type {string} */ p) => p !== project);
			await writeIdeSettings(settings);
		}

		// Invalidate cache
		invalidateCache.projects();

		return json({
			success: true,
			message: `Project '${project}' removed from config`
		});
	} catch (error) {
		console.error('Failed to delete project:', error);
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
}
