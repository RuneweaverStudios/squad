/**
 * Epic Swarm Settings Persistence
 *
 * Manages localStorage persistence for Epic Swarm modal settings.
 * Supports both global defaults and per-project overrides.
 */

import type { ExecutionMode, ReviewThreshold } from '$lib/stores/epicQueueStore.svelte';
import {
	DEFAULT_AGENT_COUNT,
	MIN_AGENT_COUNT,
	MAX_TMUX_SESSIONS
} from '$lib/config/spawnConfig';

export interface EpicSwarmSettings {
	executionMode: ExecutionMode;
	maxConcurrent: number;
	reviewThreshold: ReviewThreshold;
	autoSpawnBlocked: boolean;
}

// Default settings (used when nothing is saved)
export const DEFAULT_EPIC_SWARM_SETTINGS: EpicSwarmSettings = {
	executionMode: 'parallel',
	maxConcurrent: DEFAULT_AGENT_COUNT,
	reviewThreshold: 'p0-p1',
	autoSpawnBlocked: true
};

const STORAGE_KEY = 'epic-swarm-settings';
const PROJECT_STORAGE_KEY_PREFIX = 'epic-swarm-settings-project-';

/**
 * Extract project name from epic ID (e.g., 'squad-abc' -> 'squad')
 */
function getProjectFromEpicId(epicId: string): string | null {
	if (!epicId) return null;
	const dashIndex = epicId.indexOf('-');
	if (dashIndex <= 0) return null;
	return epicId.substring(0, dashIndex);
}

/**
 * Get the storage key for a specific project
 */
function getProjectStorageKey(project: string): string {
	return `${PROJECT_STORAGE_KEY_PREFIX}${project}`;
}

/**
 * Save Epic Swarm settings to localStorage.
 * If epicId is provided, saves as project-specific settings.
 * Also always updates global settings as a fallback.
 */
export function saveEpicSwarmSettings(settings: EpicSwarmSettings, epicId?: string): void {
	if (typeof localStorage === 'undefined') return;

	const settingsToSave = {
		executionMode: settings.executionMode,
		maxConcurrent: Math.max(
			MIN_AGENT_COUNT,
			Math.min(settings.maxConcurrent, MAX_TMUX_SESSIONS)
		),
		reviewThreshold: settings.reviewThreshold,
		autoSpawnBlocked: settings.autoSpawnBlocked
	};

	// Always save to global settings
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsToSave));
	} catch (e) {
		console.warn('Failed to save global epic swarm settings:', e);
	}

	// If epicId provided, also save to project-specific settings
	if (epicId) {
		const project = getProjectFromEpicId(epicId);
		if (project) {
			try {
				localStorage.setItem(getProjectStorageKey(project), JSON.stringify(settingsToSave));
			} catch (e) {
				console.warn(`Failed to save epic swarm settings for project ${project}:`, e);
			}
		}
	}
}

/**
 * Load Epic Swarm settings from localStorage.
 * Priority: project-specific (if epicId provided) > global > defaults
 */
export function loadEpicSwarmSettings(epicId?: string): EpicSwarmSettings {
	if (typeof localStorage === 'undefined') {
		return { ...DEFAULT_EPIC_SWARM_SETTINGS };
	}

	let settings: EpicSwarmSettings | null = null;

	// Try project-specific settings first
	if (epicId) {
		const project = getProjectFromEpicId(epicId);
		if (project) {
			try {
				const projectData = localStorage.getItem(getProjectStorageKey(project));
				if (projectData) {
					settings = JSON.parse(projectData);
				}
			} catch (e) {
				console.warn(`Failed to load project settings for ${project}:`, e);
			}
		}
	}

	// Fall back to global settings
	if (!settings) {
		try {
			const globalData = localStorage.getItem(STORAGE_KEY);
			if (globalData) {
				settings = JSON.parse(globalData);
			}
		} catch (e) {
			console.warn('Failed to load global epic swarm settings:', e);
		}
	}

	// Return merged with defaults to ensure all fields exist
	if (settings) {
		return {
			executionMode: settings.executionMode || DEFAULT_EPIC_SWARM_SETTINGS.executionMode,
			maxConcurrent: validateMaxConcurrent(settings.maxConcurrent),
			reviewThreshold: settings.reviewThreshold || DEFAULT_EPIC_SWARM_SETTINGS.reviewThreshold,
			autoSpawnBlocked:
				typeof settings.autoSpawnBlocked === 'boolean'
					? settings.autoSpawnBlocked
					: DEFAULT_EPIC_SWARM_SETTINGS.autoSpawnBlocked
		};
	}

	return { ...DEFAULT_EPIC_SWARM_SETTINGS };
}

/**
 * Validate maxConcurrent is within bounds
 */
function validateMaxConcurrent(value: unknown): number {
	if (typeof value !== 'number' || isNaN(value)) {
		return DEFAULT_EPIC_SWARM_SETTINGS.maxConcurrent;
	}
	return Math.max(MIN_AGENT_COUNT, Math.min(value, MAX_TMUX_SESSIONS));
}

/**
 * Reset settings to defaults.
 * If project is provided, only clears that project's settings.
 * If no project, clears global settings.
 */
export function resetEpicSwarmSettings(epicId?: string): EpicSwarmSettings {
	if (typeof localStorage === 'undefined') {
		return { ...DEFAULT_EPIC_SWARM_SETTINGS };
	}

	if (epicId) {
		const project = getProjectFromEpicId(epicId);
		if (project) {
			try {
				localStorage.removeItem(getProjectStorageKey(project));
			} catch (e) {
				console.warn(`Failed to reset project settings for ${project}:`, e);
			}
		}
	} else {
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch (e) {
			console.warn('Failed to reset global epic swarm settings:', e);
		}
	}

	return { ...DEFAULT_EPIC_SWARM_SETTINGS };
}

/**
 * Check if custom settings exist (different from defaults)
 */
export function hasCustomSettings(epicId?: string): boolean {
	const settings = loadEpicSwarmSettings(epicId);

	return (
		settings.executionMode !== DEFAULT_EPIC_SWARM_SETTINGS.executionMode ||
		settings.maxConcurrent !== DEFAULT_EPIC_SWARM_SETTINGS.maxConcurrent ||
		settings.reviewThreshold !== DEFAULT_EPIC_SWARM_SETTINGS.reviewThreshold ||
		settings.autoSpawnBlocked !== DEFAULT_EPIC_SWARM_SETTINGS.autoSpawnBlocked
	);
}

/**
 * Get list of projects that have custom settings
 */
export function getProjectsWithCustomSettings(): string[] {
	if (typeof localStorage === 'undefined') return [];

	const projects: string[] = [];
	try {
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key && key.startsWith(PROJECT_STORAGE_KEY_PREFIX)) {
				const project = key.substring(PROJECT_STORAGE_KEY_PREFIX.length);
				if (project) {
					projects.push(project);
				}
			}
		}
	} catch (e) {
		console.warn('Failed to enumerate project settings:', e);
	}
	return projects;
}
