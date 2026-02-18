/**
 * Project Path Resolution
 *
 * Looks up project paths from SQUAD config and squad-discovered projects.
 * Used by task creation endpoints to find the correct directory.
 */
import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const SQUAD_CONFIG_PATH = join(homedir(), '.config', 'squad', 'projects.json');

/**
 * @typedef {Object} SquadProjectConfig
 * @property {string} [path] - Custom path to project
 * @property {string} [name] - Display name
 * @property {number} [port] - Dev server port
 */

/**
 * @typedef {Object} SquadDefaults
 * @property {string} [terminal] - Default terminal emulator
 * @property {string} [editor] - Default code editor
 * @property {string} [tools_path] - Path to squad tools
 * @property {string} [claude_flags] - Claude command flags
 * @property {string} [model] - Default Claude model
 * @property {number} [agent_stagger] - Stagger delay between agent spawns (seconds)
 * @property {number} [claude_startup_timeout] - Claude startup timeout (seconds)
 * @property {number} [auto_proceed_delay] - Delay before spawning next task on auto-proceed (seconds)
 * @property {boolean} [skip_permissions] - Pass autonomous flags to agents (Claude: --dangerously-skip-permissions, Codex: --full-auto)
 */

/**
 * @typedef {Object} SquadConfig
 * @property {Record<string, SquadProjectConfig>} [projects] - Project configurations
 * @property {SquadDefaults} [defaults] - Default settings
 */

/**
 * Read SQUAD config file
 * @returns {Promise<SquadConfig|null>}
 */
async function readSquadConfig() {
	try {
		if (!existsSync(SQUAD_CONFIG_PATH)) {
			return null;
		}
		const content = await readFile(SQUAD_CONFIG_PATH, 'utf-8');
		return JSON.parse(content);
	} catch {
		return null;
	}
}

/**
 * Scan ~/code for projects with .squad/ directories
 * @returns {Promise<Array<{name: string, path: string}>>}
 */
async function scanSquadProjects() {
	const codeDir = join(homedir(), 'code');
	if (!existsSync(codeDir)) {
		return [];
	}

	try {
		const entries = await readdir(codeDir, { withFileTypes: true });
		const squadProjects = [];

		for (const entry of entries) {
			if (!entry.isDirectory() || entry.name.startsWith('.')) {
				continue;
			}

			const projectPath = join(codeDir, entry.name);
			const squadDir = join(projectPath, '.squad');

			if (existsSync(squadDir)) {
				squadProjects.push({
					name: entry.name,
					path: projectPath
				});
			}
		}

		return squadProjects;
	} catch {
		return [];
	}
}

/**
 * Get the filesystem path for a project by name
 *
 * Looks up in order:
 * 1. SQUAD config (supports custom paths)
 * 2. SQUAD-discovered projects (~/code/{name}/.squad/)
 * 3. Default fallback (~/code/{name})
 *
 * @param {string} projectName - Project name (e.g., "chimaro", "squad")
 * @returns {Promise<{path: string, source: 'squad-config' | 'squad-discovered' | 'default', exists: boolean}>}
 */
/**
 * Normalize a project name for comparison
 * Handles: case, underscores vs hyphens, spaces
 * @param {string} name
 * @returns {string}
 */
function normalizeProjectName(name) {
	return name.toLowerCase().replace(/[-_\s]/g, '');
}

/** @param {string} projectName */
export async function getProjectPath(projectName) {
	const normalizedName = normalizeProjectName(projectName);

	// 1. Check SQUAD config first (supports custom paths like /code/projects/foo)
	const squadConfig = await readSquadConfig();
	if (squadConfig?.projects) {
		for (const [key, config] of Object.entries(squadConfig.projects)) {
			if (normalizeProjectName(key) === normalizedName) {
				const path = config.path?.replace(/^~/, homedir()) || join(homedir(), 'code', key);
				return {
					path,
					source: 'squad-config',
					exists: existsSync(path)
				};
			}
		}
	}

	// 2. Default fallback (auto-discovery disabled - config is source of truth)
	const defaultPath = join(homedir(), 'code', projectName);
	return {
		path: defaultPath,
		source: 'default',
		exists: existsSync(defaultPath)
	};
}

/**
 * Get SQUAD config defaults
 *
 * Returns defaults from ~/.config/squad/projects.json with fallback values.
 * Used for configurable settings like Claude startup timeout.
 *
 * @returns {Promise<SquadDefaults>}
 */
export async function getSquadDefaults() {
	const squadConfig = await readSquadConfig();

	// Default values
	// NOTE: skip_permissions defaults to false for safety - user must explicitly enable
	// after they've manually accepted the YOLO warning once
	const defaults = {
		terminal: 'auto',
		editor: 'code',
		tools_path: '~/.local/bin',
		claude_flags: '',
		model: 'opus',
		agent_stagger: 15,
		claude_startup_timeout: 20,
		auto_proceed_delay: 2,
		skip_permissions: false
	};

	// Override with config values if present
	if (squadConfig?.defaults) {
		const configDefaults = squadConfig.defaults;
		if (configDefaults.terminal) defaults.terminal = configDefaults.terminal;
		if (configDefaults.editor) defaults.editor = configDefaults.editor;
		if (configDefaults.tools_path) defaults.tools_path = configDefaults.tools_path;
		if (configDefaults.claude_flags) defaults.claude_flags = configDefaults.claude_flags;
		if (configDefaults.model) defaults.model = configDefaults.model;
		if (typeof configDefaults.agent_stagger === 'number') defaults.agent_stagger = configDefaults.agent_stagger;
		if (typeof configDefaults.claude_startup_timeout === 'number') defaults.claude_startup_timeout = configDefaults.claude_startup_timeout;
		if (typeof configDefaults.auto_proceed_delay === 'number') defaults.auto_proceed_delay = configDefaults.auto_proceed_delay;
		if (typeof configDefaults.skip_permissions === 'boolean') defaults.skip_permissions = configDefaults.skip_permissions;
	}

	return defaults;
}
