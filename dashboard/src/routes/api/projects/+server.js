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
		const claudeDir = join(projectPath, '.claude');
		if (!existsSync(claudeDir)) {
			return { active: 0, total: 0 };
		}

		const entries = await readdir(claudeDir);
		const agentFiles = entries.filter(f => f.startsWith('agent-') && f.endsWith('.txt'));
		const total = agentFiles.length;

		// Count active (modified in last 30 min)
		let active = 0;
		const now = Date.now();
		for (const file of agentFiles) {
			const stats = await stat(join(claudeDir, file));
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
 * Check if a port is in use
 * @param {number|null} port
 */
async function checkPortStatus(port) {
	if (!port) return null;
	try {
		const { stdout } = await execAsync(`ss -tlnp 2>/dev/null | grep -q ":${port} " && echo "running" || echo "stopped"`, {
			timeout: 2000
		});
		return stdout.trim() === 'running' ? 'running' : null;
	} catch {
		return null;
	}
}

/**
 * Get last activity time for a project
 * Checks multiple sources and returns the most recent:
 * 1. Agent session files (.claude/agent-*.txt)
 * 2. Git commit time
 * 3. Directory mtime (fallback)
 * @param {string} projectPath
 */
async function getLastActivity(projectPath) {
	let mostRecentMs = 0;

	// Check .claude/agent-*.txt files (most reliable indicator of recent activity)
	try {
		const claudeDir = join(projectPath, '.claude');
		if (existsSync(claudeDir)) {
			const entries = await readdir(claudeDir);
			const agentFiles = entries.filter(f => f.startsWith('agent-') && f.endsWith('.txt'));
			for (const file of agentFiles) {
				const stats = await stat(join(claudeDir, file));
				if (stats.mtimeMs > mostRecentMs) {
					mostRecentMs = stats.mtimeMs;
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
			return null;
		}
	}

	return mostRecentMs > 0 ? formatRelativeTime(mostRecentMs) : null;
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
					activeColor: config.active_color || null,
					inactiveColor: config.inactive_color || null,
					databaseUrl: config.database_url || null,
					description: config.description || null,
					hidden: hiddenProjects.has(key),
					source: 'jat-config'
				});
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
				const [tasks, agents, status, lastActivity] = await Promise.all([
					getProjectTaskCounts(project.path),
					getProjectAgentCount(project.path),
					checkPortStatus(project.port),
					getLastActivity(project.path)
				]);

				return {
					...project,
					tasks,
					agents,
					status,
					// If server is running, it's active now
					lastActivity: status === 'running' ? 'now' : lastActivity
				};
			}));
		}

		// Sort by last activity (most recent first) if stats included
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
				return getScore(a.lastActivity) - getScore(b.lastActivity);
			});
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
		await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
		return true;
	} catch (error) {
		console.error('Failed to write JAT config:', error);
		return false;
	}
}

/**
 * PATCH /api/projects - Update project fields
 * Body: { project: string, description?: string, port?: number | null }
 */
export async function PATCH({ request }) {
	try {
		const body = await request.json();
		const { project, description, port } = body;

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
			port: jatConfig.projects[project].port
		});
	} catch (error) {
		console.error('Failed to update project:', error);
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
}

/**
 * POST /api/projects - Update project visibility settings
 * Body: { action: 'hide' | 'show', project: string }
 *       or { hiddenProjects: string[] } to set all at once
 */
export async function POST({ request }) {
	try {
		const body = await request.json();
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
