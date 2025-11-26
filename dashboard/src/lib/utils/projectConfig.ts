/**
 * Project Configuration Utility
 *
 * Reads project configuration from ~/.config/jat/projects.json
 * Provides type-safe access to project settings with caching and color conversion.
 *
 * @example
 * import { getProjectConfig, getProjectColor, getAllProjects } from '$lib/utils/projectConfig';
 *
 * // Get all projects
 * const projects = getAllProjects();
 *
 * // Get single project config
 * const jatConfig = getProjectConfig('jat');
 *
 * // Get hex color for a project
 * const color = getProjectColor('jat'); // → '#5588ff'
 */

import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Raw project entry from projects.json
 */
interface RawProjectEntry {
	name: string;
	path: string;
	port: number | null;
	database_url: string | null;
	active_color: string; // Format: "rgb(rrggbb)"
	inactive_color: string; // Format: "rgb(rrggbb)"
}

/**
 * Raw config file structure
 */
interface RawProjectConfig {
	projects: Record<string, RawProjectEntry>;
	defaults?: {
		terminal?: string;
		editor?: string;
		tools_path?: string;
		claude_flags?: string;
	};
}

/**
 * Processed project entry with hex colors
 */
export interface ProjectConfig {
	/** Project key (e.g., 'jat', 'chimaro') */
	key: string;
	/** Display name (usually uppercase) */
	name: string;
	/** Path to project directory (with ~ expanded) */
	path: string;
	/** Development server port (if applicable) */
	port: number | null;
	/** Database connection URL (if applicable) */
	databaseUrl: string | null;
	/** Active state color in hex format (#rrggbb) */
	activeColor: string;
	/** Inactive state color in hex format (#rrggbb) */
	inactiveColor: string;
}

/**
 * Full config with all projects and defaults
 */
export interface FullProjectConfig {
	projects: Map<string, ProjectConfig>;
	defaults: {
		terminal: string;
		editor: string;
		toolsPath: string;
		claudeFlags: string;
	};
}

// =============================================================================
// CONSTANTS
// =============================================================================

const CONFIG_PATH = join(homedir(), '.config', 'jat', 'projects.json');

/**
 * Default colors for projects without config
 */
const DEFAULT_COLORS = {
	active: '#888888',
	inactive: '#666666'
};

// =============================================================================
// CACHING
// =============================================================================

let cachedConfig: FullProjectConfig | null = null;
let cacheTimestamp: number = 0;

/**
 * Cache TTL in milliseconds (5 minutes)
 * Config file rarely changes, so we cache aggressively
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Clear the config cache (useful for testing or manual refresh)
 */
export function clearProjectConfigCache(): void {
	cachedConfig = null;
	cacheTimestamp = 0;
}

// =============================================================================
// COLOR CONVERSION
// =============================================================================

/**
 * Convert rgb(rrggbb) format to #rrggbb hex format
 *
 * @param rgbColor - Color in "rgb(rrggbb)" format
 * @returns Color in "#rrggbb" format
 *
 * @example
 * rgbToHex('rgb(5588ff)') // → '#5588ff'
 * rgbToHex('rgb(00d4aa)') // → '#00d4aa'
 */
export function rgbToHex(rgbColor: string): string {
	// Match rgb(xxxxxx) pattern
	const match = rgbColor.match(/^rgb\(([0-9a-fA-F]{6})\)$/);
	if (match) {
		return `#${match[1].toLowerCase()}`;
	}

	// Already hex format
	if (rgbColor.startsWith('#')) {
		return rgbColor.toLowerCase();
	}

	// Unknown format, return as-is
	return rgbColor;
}

// =============================================================================
// PATH EXPANSION
// =============================================================================

/**
 * Expand ~ to home directory in paths
 */
function expandPath(path: string): string {
	if (path.startsWith('~/')) {
		return join(homedir(), path.slice(2));
	}
	return path;
}

// =============================================================================
// CONFIG LOADING
// =============================================================================

/**
 * Load and parse the config file from disk
 * Returns null if file doesn't exist or can't be parsed
 */
function loadConfigFile(): RawProjectConfig | null {
	try {
		if (!existsSync(CONFIG_PATH)) {
			console.warn(`[projectConfig] Config file not found: ${CONFIG_PATH}`);
			return null;
		}

		const content = readFileSync(CONFIG_PATH, 'utf-8');
		return JSON.parse(content) as RawProjectConfig;
	} catch (error) {
		console.error(`[projectConfig] Failed to load config:`, error);
		return null;
	}
}

/**
 * Process raw config entry into ProjectConfig
 */
function processProjectEntry(key: string, entry: RawProjectEntry): ProjectConfig {
	return {
		key,
		name: entry.name,
		path: expandPath(entry.path),
		port: entry.port,
		databaseUrl: entry.database_url,
		activeColor: rgbToHex(entry.active_color),
		inactiveColor: rgbToHex(entry.inactive_color)
	};
}

/**
 * Load full config with caching
 * @returns FullProjectConfig or empty config if file missing/invalid
 */
function getFullConfig(): FullProjectConfig {
	const now = Date.now();

	// Return cached if fresh
	if (cachedConfig && now - cacheTimestamp < CACHE_TTL_MS) {
		return cachedConfig;
	}

	const raw = loadConfigFile();

	if (!raw) {
		// Return empty config on failure
		return {
			projects: new Map(),
			defaults: {
				terminal: 'alacritty',
				editor: 'code',
				toolsPath: '~/.local/bin',
				claudeFlags: ''
			}
		};
	}

	// Process projects
	const projects = new Map<string, ProjectConfig>();
	for (const [key, entry] of Object.entries(raw.projects)) {
		projects.set(key.toLowerCase(), processProjectEntry(key, entry));
	}

	// Process defaults
	const defaults = {
		terminal: raw.defaults?.terminal ?? 'alacritty',
		editor: raw.defaults?.editor ?? 'code',
		toolsPath: raw.defaults?.tools_path ?? '~/.local/bin',
		claudeFlags: raw.defaults?.claude_flags ?? ''
	};

	// Update cache
	cachedConfig = { projects, defaults };
	cacheTimestamp = now;

	return cachedConfig;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Get all project configurations
 *
 * @returns Map of project key to ProjectConfig
 *
 * @example
 * const projects = getAllProjects();
 * for (const [key, config] of projects) {
 *   console.log(key, config.activeColor);
 * }
 */
export function getAllProjects(): Map<string, ProjectConfig> {
	return getFullConfig().projects;
}

/**
 * Get array of all project keys
 *
 * @returns Array of project keys (lowercase)
 *
 * @example
 * const keys = getProjectKeys(); // → ['jat', 'chimaro', 'jomarchy', ...]
 */
export function getProjectKeys(): string[] {
	return Array.from(getAllProjects().keys());
}

/**
 * Get configuration for a specific project
 *
 * @param projectKey - Project identifier (case-insensitive)
 * @returns ProjectConfig or null if not found
 *
 * @example
 * const config = getProjectConfig('jat');
 * if (config) {
 *   console.log(config.activeColor); // → '#5588ff'
 * }
 */
export function getProjectConfig(projectKey: string): ProjectConfig | null {
	return getAllProjects().get(projectKey.toLowerCase()) ?? null;
}

/**
 * Get active color for a project in hex format
 *
 * @param projectKey - Project identifier (case-insensitive)
 * @returns Hex color string (#rrggbb) or default color if project not found
 *
 * @example
 * getProjectColor('jat') // → '#5588ff'
 * getProjectColor('unknown') // → '#888888' (default)
 */
export function getProjectColor(projectKey: string): string {
	const config = getProjectConfig(projectKey);
	return config?.activeColor ?? DEFAULT_COLORS.active;
}

/**
 * Get inactive color for a project in hex format
 *
 * @param projectKey - Project identifier (case-insensitive)
 * @returns Hex color string (#rrggbb) or default color if project not found
 *
 * @example
 * getProjectInactiveColor('jat') // → '#3366dd'
 */
export function getProjectInactiveColor(projectKey: string): string {
	const config = getProjectConfig(projectKey);
	return config?.inactiveColor ?? DEFAULT_COLORS.inactive;
}

/**
 * Get project path with ~ expanded
 *
 * @param projectKey - Project identifier (case-insensitive)
 * @returns Full path to project directory or null if not found
 *
 * @example
 * getProjectPath('jat') // → '/home/user/code/jat'
 */
export function getProjectPath(projectKey: string): string | null {
	const config = getProjectConfig(projectKey);
	return config?.path ?? null;
}

/**
 * Check if a project exists in config
 *
 * @param projectKey - Project identifier (case-insensitive)
 * @returns true if project exists in config
 */
export function hasProject(projectKey: string): boolean {
	return getAllProjects().has(projectKey.toLowerCase());
}

/**
 * Get global defaults from config
 *
 * @returns Default configuration values
 */
export function getDefaults(): FullProjectConfig['defaults'] {
	return getFullConfig().defaults;
}

/**
 * Get the path to the config file
 * Useful for displaying in UI or debugging
 */
export function getConfigPath(): string {
	return CONFIG_PATH;
}

/**
 * Check if config file exists
 */
export function configExists(): boolean {
	return existsSync(CONFIG_PATH);
}
