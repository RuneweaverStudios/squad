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

const execAsync = promisify(exec);

// Path to JAT config
const CONFIG_DIR = join(homedir(), '.config', 'jat');
const CONFIG_FILE = join(CONFIG_DIR, 'projects.json');

// Path to dashboard visibility settings (separate from JAT config)
const DASHBOARD_SETTINGS_FILE = join(CONFIG_DIR, 'dashboard-projects.json');

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
 * Read dashboard visibility settings
 */
async function readDashboardSettings() {
	try {
		if (!existsSync(DASHBOARD_SETTINGS_FILE)) {
			return { hiddenProjects: [] };
		}
		const content = await readFile(DASHBOARD_SETTINGS_FILE, 'utf-8');
		return JSON.parse(content);
	} catch (error) {
		console.error('Failed to read dashboard settings:', error);
		return { hiddenProjects: [] };
	}
}

/**
 * Write dashboard visibility settings
 * @param {{ hiddenProjects?: string[] }} settings
 */
async function writeDashboardSettings(settings) {
	try {
		// Ensure config directory exists
		if (!existsSync(CONFIG_DIR)) {
			await import('fs/promises').then(fs => fs.mkdir(CONFIG_DIR, { recursive: true }));
		}
		await writeFile(DASHBOARD_SETTINGS_FILE, JSON.stringify(settings, null, 2));
		return true;
	} catch (error) {
		console.error('Failed to write dashboard settings:', error);
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
 * Scan ~/code for directories with .beads/ initialized
 * Returns projects that have Beads set up but aren't in JAT config
 */
async function scanBeadsProjects() {
	const codeDir = join(homedir(), 'code');
	if (!existsSync(codeDir)) {
		return [];
	}

	const entries = await readdir(codeDir, { withFileTypes: true });
	const beadsProjects = [];

	for (const entry of entries) {
		if (!entry.isDirectory() || entry.name.startsWith('.')) {
			continue;
		}

		const projectPath = join(codeDir, entry.name);
		const beadsDir = join(projectPath, '.beads');

		// Only include if .beads/ directory exists
		if (existsSync(beadsDir)) {
			beadsProjects.push({
				name: entry.name,
				path: projectPath,
				source: 'beads-discovered'
			});
		}
	}

	return beadsProjects;
}

/**
 * Get task counts for a project from Beads
 * @param {string} projectPath
 */
async function getProjectTaskCounts(projectPath) {
	try {
		const { stdout } = await execAsync(`bd list --json`, {
			cwd: projectPath,
			timeout: 5000
		});
		/** @type {Array<{status: string}>} */
		const tasks = JSON.parse(stdout || '[]');
		const open = tasks.filter((/** @type {{status: string}} */ t) => t.status === 'open' || t.status === 'in_progress').length;
		const total = tasks.length;
		return { open, total };
	} catch {
		return { open: 0, total: 0 };
	}
}

/**
 * Get agent count for a project
 * @param {string} projectPath
 */
async function getProjectAgentCount(projectPath) {
	try {
		// Check both locations: .claude/sessions/ (new) and .claude/ (legacy)
		const sessionsDir = join(projectPath, '.claude', 'sessions');
		const claudeDir = join(projectPath, '.claude');

		let agentFiles = [];

		// Check new location first (.claude/sessions/)
		if (existsSync(sessionsDir)) {
			const entries = await readdir(sessionsDir);
			agentFiles = entries
				.filter(f => f.startsWith('agent-') && f.endsWith('.txt'))
				.map(f => join(sessionsDir, f));
		}

		// Also check legacy location (.claude/) for backwards compat
		if (existsSync(claudeDir)) {
			const entries = await readdir(claudeDir);
			const legacyFiles = entries
				.filter(f => f.startsWith('agent-') && f.endsWith('.txt'))
				.map(f => join(claudeDir, f));
			agentFiles = [...agentFiles, ...legacyFiles];
		}

		if (agentFiles.length === 0) {
			return { active: 0, total: 0 };
		}

		const total = agentFiles.length;

		// Count active (modified in last 30 min)
		let active = 0;
		const now = Date.now();
		for (const filePath of agentFiles) {
			const stats = await stat(filePath);
			if (now - stats.mtimeMs < 30 * 60 * 1000) {
				active++;
			}
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
 * 1. Agent session files (.claude/agent-*.txt and .claude/sessions/agent-*.txt)
 * 2. Git commit time
 * 3. Directory mtime (fallback)
 * @param {string} projectPath
 * @returns {Promise<{formatted: string|null, agentActivityMs: number}>}
 */
async function getLastActivity(projectPath) {
	let mostRecentMs = 0;
	let agentActivityMs = 0;

	// Check .claude/agent-*.txt files (most reliable indicator of recent activity)
	// Also check .claude/sessions/agent-*.txt (new location)
	const claudeDirs = [
		join(projectPath, '.claude'),
		join(projectPath, '.claude', 'sessions')
	];

	for (const claudeDir of claudeDirs) {
		try {
			if (existsSync(claudeDir)) {
				const entries = await readdir(claudeDir);
				const agentFiles = entries.filter(f => f.startsWith('agent-') && f.endsWith('.txt'));
				for (const file of agentFiles) {
					const stats = await stat(join(claudeDir, file));
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
		const dashboardSettings = await readDashboardSettings();
		const hiddenProjects = new Set(dashboardSettings.hiddenProjects || []);

		let projects = [];

		if (jatConfig?.projects) {
			// Use JAT config as primary source
			for (const [key, config] of Object.entries(jatConfig.projects)) {
				const projectPath = config.path?.replace(/^~/, homedir()) || join(homedir(), 'code', key);

				// serverPath is where 'npm run dev' should be executed (optional, defaults to path)
				const serverPath = config.server_path?.replace(/^~/, homedir()) || null;

				projects.push({
					name: key,
					displayName: config.name || key.toUpperCase(),
					path: projectPath,
					serverPath,
					port: config.port || null,
					activeColor: config.active_color ? rgbToHex(config.active_color) : null,
					inactiveColor: config.inactive_color ? rgbToHex(config.inactive_color) : null,
					databaseUrl: config.database_url || null,
					description: config.description || null,
					hidden: hiddenProjects.has(key),
					source: 'jat-config'
				});
			}

			// Also scan for projects with .beads/ that aren't in JAT config
			// This allows newly-initialized projects (via bd init) to appear automatically
			const beadsProjects = await scanBeadsProjects();
			const existingNames = new Set(projects.map(p => p.name.toLowerCase()));

			for (const bp of beadsProjects) {
				if (!existingNames.has(bp.name.toLowerCase())) {
					projects.push({
						...bp,
						displayName: bp.name.toUpperCase(),
						port: null,
						description: null,
						hidden: hiddenProjects.has(bp.name)
					});
				}
			}
		} else {
			// Fallback to filesystem scan
			const scannedProjects = await scanCodeDirectory();
			projects = scannedProjects.map(p => ({
				...p,
				displayName: p.name.toUpperCase(),
				port: null,
				description: null,
				hidden: hiddenProjects.has(p.name)
			}));
		}

		// Filter hidden projects if requested
		if (visibleOnly) {
			projects = projects.filter(p => !p.hidden);
		}

		// Add stats if requested
		if (includeStats) {
			projects = await Promise.all(projects.map(async (project) => {
				// Check if .beads/ directory exists
				const beadsDir = join(project.path, '.beads');
				const hasBeads = existsSync(beadsDir);

				const [tasks, agents, status, activityData] = await Promise.all([
					getProjectTaskCounts(project.path),
					getProjectAgentCount(project.path),
					getServerStatus(project.name, project.port),
					getLastActivity(project.path)
				]);

				return {
					...project,
					stats: {
						hasBeads,
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

		// Sort by last activity (most recent first) if stats included
		// When both have "now" (servers running), use agent activity as tiebreaker
		if (includeStats) {
			projects.sort((a, b) => {
				// Sort by lastActivity (most recent first)
				// "now" < "3m" < "2h" < "4d"
				/** @type {Record<string, number>} */
				const order = { 'now': 0, 'm': 1, 'h': 2, 'd': 3 };
				/** @param {string|null|undefined} t */
				const getScore = (t) => {
					if (!t) return 999;
					if (t === 'now') return 0;
					const unit = t.slice(-1);
					const num = parseInt(t.slice(0, -1), 10);
					return (order[unit] || 3) * 1000 + num;
				};
				// @ts-ignore - lastActivity exists when includeStats is true
				const scoreA = getScore(a.lastActivity);
				const scoreB = getScore(b.lastActivity);

				// If both have same score (e.g., both "now" from running servers),
				// use agent activity timestamp as tiebreaker (more recent wins)
				if (scoreA === scoreB) {
					// @ts-ignore - _agentActivityMs exists when includeStats is true
					return (b._agentActivityMs || 0) - (a._agentActivityMs || 0);
				}

				return scoreA - scoreB;
			});

			// Remove internal _agentActivityMs field from response
			projects = projects.map(({ _agentActivityMs, ...project }) => project);
		}

		// Build response
		const responseData = {
			projects,
			source: jatConfig ? 'jat-config' : 'filesystem',
			configPath: CONFIG_FILE,
			settingsPath: DASHBOARD_SETTINGS_FILE
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
 * Body: { project: string, description?: string, port?: number | null, active_color?: string, inactive_color?: string }
 *
 * Colors should be in "rgb(rrggbb)" format for consistency with JAT config.
 * Example: "rgb(5588ff)" for blue, "rgb(00d4aa)" for teal
 */
export async function PATCH({ request }) {
	try {
		const body = await request.json();
		const { project, description, port, active_color, inactive_color } = body;

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
		if (active_color !== undefined) {
			jatConfig.projects[project].active_color = active_color || null;
		}
		if (inactive_color !== undefined) {
			jatConfig.projects[project].inactive_color = inactive_color || null;
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
			active_color: jatConfig.projects[project].active_color,
			inactive_color: jatConfig.projects[project].inactive_color
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
			const { key, path: projectPath, name, port, description } = body;

			// Validate key format
			const keyValidation = validateProjectKey(key);
			if (!keyValidation.valid) {
				return json({ error: keyValidation.error }, { status: 400 });
			}

			// Resolve path (default to ~/code/{key})
			const resolvedPath = projectPath
				? projectPath.replace(/^~/, homedir())
				: join(homedir(), 'code', key);

			// Verify directory exists
			if (!existsSync(resolvedPath)) {
				return json({ error: `Directory does not exist: ${resolvedPath}` }, { status: 400 });
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
				}
			});
		}

		// Handle visibility settings
		const settings = await readDashboardSettings();

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

		const success = await writeDashboardSettings(settings);
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
		const settings = await readDashboardSettings();
		if (settings.hiddenProjects?.includes(project)) {
			settings.hiddenProjects = settings.hiddenProjects.filter((/** @type {string} */ p) => p !== project);
			await writeDashboardSettings(settings);
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
