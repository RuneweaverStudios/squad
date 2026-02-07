/**
 * Configuration Store
 *
 * Manages slash commands and project configuration state using Svelte 5 runes.
 * Provides API fetchers, CRUD operations, and derived helpers for the config page.
 *
 * @see ide/src/lib/types/config.ts for type definitions
 * @see ide/src/routes/api/commands/+server.ts for commands API
 * @see ide/src/routes/api/projects/+server.js for projects API
 */

import type {
	SlashCommand,
	CommandGroup,
	ProjectConfig,
	ProjectsConfigFile,
	HooksConfig,
	StatusLineConfig
} from '$lib/types/config';

// =============================================================================
// CONSTANTS
// =============================================================================

const COMMANDS_API = '/api/commands';
const PROJECTS_API = '/api/projects';
const HOOKS_API = '/api/hooks';

// =============================================================================
// STATE INTERFACES
// =============================================================================

export interface ConfigState {
	// Commands state
	commands: SlashCommand[];
	commandsLoading: boolean;
	commandsError: string | null;
	selectedCommand: SlashCommand | null;

	// Projects state
	projects: ProjectConfig[];
	projectsLoading: boolean;
	projectsError: string | null;
	selectedProject: ProjectConfig | null;

	// Hooks state
	hooks: HooksConfig;
	hooksLoading: boolean;
	hooksError: string | null;
	hooksExists: boolean;

	// General state
	initialized: boolean;
}

// =============================================================================
// STATE
// =============================================================================

/**
 * Reactive state using Svelte 5 runes
 */
let state = $state<ConfigState>({
	// Commands
	commands: [],
	commandsLoading: false,
	commandsError: null,
	selectedCommand: null,

	// Projects
	projects: [],
	projectsLoading: false,
	projectsError: null,
	selectedProject: null,

	// Hooks
	hooks: {},
	hooksLoading: false,
	hooksError: null,
	hooksExists: false,

	// General
	initialized: false
});

// =============================================================================
// COMMANDS API OPERATIONS
// =============================================================================

/**
 * Load slash commands from the API
 */
export async function loadCommands(): Promise<void> {
	state.commandsLoading = true;
	state.commandsError = null;

	try {
		const response = await fetch(COMMANDS_API);
		if (!response.ok) {
			throw new Error(`Failed to load commands: ${response.statusText}`);
		}

		const data = await response.json();
		state.commands = data.commands || [];
		state.initialized = true;
	} catch (error) {
		console.error('[configStore] Failed to load commands:', error);
		state.commandsError = error instanceof Error ? error.message : 'Failed to load commands';
	} finally {
		state.commandsLoading = false;
	}
}

/**
 * Load command content from file
 */
export async function loadCommandContent(command: SlashCommand): Promise<string | null> {
	try {
		const response = await fetch(`${COMMANDS_API}?path=${encodeURIComponent(command.path)}&content=true`);
		if (!response.ok) {
			throw new Error(`Failed to load command content: ${response.statusText}`);
		}
		const data = await response.json();
		return data.content || null;
	} catch (error) {
		console.error('[configStore] Failed to load command content:', error);
		return null;
	}
}

/**
 * Save command content to file
 */
export async function saveCommand(command: SlashCommand, content: string): Promise<boolean> {
	try {
		const response = await fetch(COMMANDS_API, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				path: command.path,
				content
			})
		});

		if (!response.ok) {
			throw new Error(`Failed to save command: ${response.statusText}`);
		}

		// Update the command in state with new content
		state.commands = state.commands.map((cmd) =>
			cmd.path === command.path ? { ...cmd, content } : cmd
		);

		return true;
	} catch (error) {
		console.error('[configStore] Failed to save command:', error);
		return false;
	}
}

/**
 * Create a new command
 */
export async function createCommand(
	name: string,
	namespace: string,
	content: string
): Promise<SlashCommand | null> {
	try {
		const response = await fetch(COMMANDS_API, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, namespace, content })
		});

		if (!response.ok) {
			throw new Error(`Failed to create command: ${response.statusText}`);
		}

		const data = await response.json();
		const newCommand = data.command as SlashCommand;

		// Add to state
		state.commands = [...state.commands, newCommand];

		return newCommand;
	} catch (error) {
		console.error('[configStore] Failed to create command:', error);
		return null;
	}
}

/**
 * Delete a command
 *
 * Uses DELETE /api/commands/{namespace}/{name} endpoint
 */
export async function deleteCommand(command: SlashCommand): Promise<boolean> {
	try {
		// Build the endpoint path: /api/commands/{namespace}/{name}
		const endpoint = `${COMMANDS_API}/${encodeURIComponent(command.namespace)}/${encodeURIComponent(command.name)}`;

		const response = await fetch(endpoint, {
			method: 'DELETE'
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(errorData.message || `Failed to delete command: ${response.statusText}`);
		}

		// Remove from state
		state.commands = state.commands.filter((cmd) => cmd.path !== command.path);

		// Clear selection if deleted command was selected
		if (state.selectedCommand?.path === command.path) {
			state.selectedCommand = null;
		}

		return true;
	} catch (error) {
		console.error('[configStore] Failed to delete command:', error);
		return false;
	}
}

// =============================================================================
// PROJECTS API OPERATIONS
// =============================================================================

/**
 * Load projects from the API
 */
export async function loadProjects(): Promise<void> {
	state.projectsLoading = true;
	state.projectsError = null;

	try {
		// Fetch with stats=true to get hasJat, hasClaudeMd, etc.
		const response = await fetch(`${PROJECTS_API}?stats=true`);
		if (!response.ok) {
			throw new Error(`Failed to load projects: ${response.statusText}`);
		}

		const data = await response.json();
		// Map API response to ProjectConfig format
		state.projects = (data.projects || []).map((p: any) => ({
			name: p.displayName || p.name,
			path: p.path,
			port: p.port,
			server_path: p.serverPath,
			description: p.description,
			colors: {
				active: p.activeColor,
				inactive: p.inactiveColor
			},
			database_url: p.databaseUrl,
			hidden: p.hidden,
			stats: p.stats ? {
				hasJat: p.stats.hasJat,
				hasClaudeMd: p.stats.hasClaudeMd,
				agentCount: p.stats.agentCount,
				taskCount: p.stats.taskCount,
				openTaskCount: p.stats.openTaskCount,
				serverRunning: p.stats.serverRunning
			} : undefined
		}));
		state.initialized = true;
	} catch (error) {
		console.error('[configStore] Failed to load projects:', error);
		state.projectsError = error instanceof Error ? error.message : 'Failed to load projects';
	} finally {
		state.projectsLoading = false;
	}
}

/**
 * Save project configuration
 */
export async function saveProject(project: ProjectConfig): Promise<boolean> {
	try {
		// Extract the project key from the path (last segment)
		const projectKey = project.path.split('/').pop() || project.name.toLowerCase();

		const response = await fetch(PROJECTS_API, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				project: projectKey,
				description: project.description,
				port: project.port,
				server_path: project.server_path,
				database_url: project.database_url,
				active_color: project.colors?.active,
				inactive_color: project.colors?.inactive,
				default_harness: project.default_harness
			})
		});

		if (!response.ok) {
			throw new Error(`Failed to save project: ${response.statusText}`);
		}

		// Update in state
		state.projects = state.projects.map((p) =>
			p.path === project.path ? project : p
		);

		return true;
	} catch (error) {
		console.error('[configStore] Failed to save project:', error);
		return false;
	}
}

/**
 * Create a new project
 * Note: This would require a new API endpoint to be implemented
 */
export async function createProject(project: Omit<ProjectConfig, 'name'>): Promise<ProjectConfig | null> {
	// TODO: Implement when API endpoint is available
	console.warn('[configStore] createProject not yet implemented - requires API endpoint');
	return null;
}

/**
 * Delete a project
 * Note: This would require a new API endpoint to be implemented
 */
export async function deleteProject(project: ProjectConfig): Promise<boolean> {
	// TODO: Implement when API endpoint is available
	console.warn('[configStore] deleteProject not yet implemented - requires API endpoint');
	return false;
}

/**
 * Toggle project visibility
 */
export async function toggleProjectVisibility(projectName: string, hidden: boolean): Promise<boolean> {
	try {
		const response = await fetch(PROJECTS_API, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: hidden ? 'hide' : 'show',
				project: projectName
			})
		});

		if (!response.ok) {
			throw new Error(`Failed to toggle visibility: ${response.statusText}`);
		}

		// Update in state
		state.projects = state.projects.map((p) =>
			p.name === projectName ? { ...p, hidden } : p
		);

		return true;
	} catch (error) {
		console.error('[configStore] Failed to toggle visibility:', error);
		return false;
	}
}

// =============================================================================
// HOOKS API OPERATIONS
// =============================================================================

/**
 * Load hooks from the API
 */
export async function loadHooks(): Promise<void> {
	state.hooksLoading = true;
	state.hooksError = null;

	try {
		const response = await fetch(HOOKS_API);
		if (!response.ok) {
			throw new Error(`Failed to load hooks: ${response.statusText}`);
		}

		const data = await response.json();
		state.hooks = data.hooks || {};
		state.hooksExists = data.exists || false;
		state.initialized = true;
	} catch (error) {
		console.error('[configStore] Failed to load hooks:', error);
		state.hooksError = error instanceof Error ? error.message : 'Failed to load hooks';
	} finally {
		state.hooksLoading = false;
	}
}

/**
 * Save hooks configuration
 */
export async function saveHooks(hooks: HooksConfig): Promise<boolean> {
	try {
		const response = await fetch(HOOKS_API, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ hooks })
		});

		if (!response.ok) {
			throw new Error(`Failed to save hooks: ${response.statusText}`);
		}

		const data = await response.json();
		state.hooks = data.hooks || {};
		state.hooksExists = true;

		return true;
	} catch (error) {
		console.error('[configStore] Failed to save hooks:', error);
		return false;
	}
}

// =============================================================================
// SELECTION OPERATIONS
// =============================================================================

/**
 * Select a command for editing
 */
export function selectCommand(command: SlashCommand | null): void {
	state.selectedCommand = command;
}

/**
 * Select a project for editing
 */
export function selectProject(project: ProjectConfig | null): void {
	state.selectedProject = project;
}

/**
 * Clear all selections
 */
export function clearSelections(): void {
	state.selectedCommand = null;
	state.selectedProject = null;
}

// =============================================================================
// DERIVED HELPERS
// =============================================================================

/**
 * Group commands by namespace
 */
export function getCommandGroups(): CommandGroup[] {
	const groups = new Map<string, SlashCommand[]>();

	for (const command of state.commands) {
		const existing = groups.get(command.namespace) || [];
		groups.set(command.namespace, [...existing, command]);
	}

	// Convert to array and sort namespaces
	const result: CommandGroup[] = [];
	const sortedNamespaces = Array.from(groups.keys()).sort((a, b) => {
		// 'jat' first, then 'local', then alphabetically
		if (a === 'jat') return -1;
		if (b === 'jat') return 1;
		if (a === 'local') return -1;
		if (b === 'local') return 1;
		return a.localeCompare(b);
	});

	for (const namespace of sortedNamespaces) {
		const commands = groups.get(namespace) || [];
		result.push({
			namespace,
			commands: commands.sort((a, b) => a.name.localeCompare(b.name)),
			isExpanded: true // Default to expanded
		});
	}

	return result;
}

/**
 * Get visible projects (not hidden)
 */
export function getVisibleProjects(): ProjectConfig[] {
	return state.projects.filter((p) => !p.hidden);
}

/**
 * Get hidden projects
 */
export function getHiddenProjects(): ProjectConfig[] {
	return state.projects.filter((p) => p.hidden);
}

/**
 * Find command by invocation string
 */
export function findCommandByInvocation(invocation: string): SlashCommand | undefined {
	return state.commands.find((cmd) => cmd.invocation === invocation);
}

/**
 * Find project by name
 */
export function findProjectByName(name: string): ProjectConfig | undefined {
	return state.projects.find((p) => p.name === name);
}

/**
 * Find project by path
 */
export function findProjectByPath(path: string): ProjectConfig | undefined {
	return state.projects.find((p) => p.path === path);
}

// =============================================================================
// REACTIVE GETTERS
// =============================================================================

export function getCommands(): SlashCommand[] {
	return state.commands;
}

export function getProjects(): ProjectConfig[] {
	return state.projects;
}

export function getSelectedCommand(): SlashCommand | null {
	return state.selectedCommand;
}

export function getSelectedProject(): ProjectConfig | null {
	return state.selectedProject;
}

export function isCommandsLoading(): boolean {
	return state.commandsLoading;
}

export function isProjectsLoading(): boolean {
	return state.projectsLoading;
}

export function getCommandsError(): string | null {
	return state.commandsError;
}

export function getProjectsError(): string | null {
	return state.projectsError;
}

export function getHooks(): HooksConfig {
	return state.hooks;
}

export function isHooksLoading(): boolean {
	return state.hooksLoading;
}

export function getHooksError(): string | null {
	return state.hooksError;
}

export function hooksFileExists(): boolean {
	return state.hooksExists;
}

export function isInitialized(): boolean {
	return state.initialized;
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize the store by loading commands, projects, and hooks
 */
export async function initializeStore(): Promise<void> {
	if (typeof window === 'undefined') return; // SSR guard
	if (state.initialized) return;

	await Promise.all([loadCommands(), loadProjects(), loadHooks()]);
}

/**
 * Refresh all data
 */
export async function refreshAll(): Promise<void> {
	await Promise.all([loadCommands(), loadProjects(), loadHooks()]);
}

// Export state for direct reactive access
export { state as configState };
