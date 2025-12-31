/**
 * Drawer Store
 * Manages state for task creation drawer, spawn modal, and sidebar collapse
 */

import { writable, get } from 'svelte/store';

// Sidebar collapsed state (for desktop - separate from DaisyUI drawer mechanism)
// When collapsed: sidebar is narrow (w-14), shows tooltips on hover
// When expanded: sidebar is wide (w-64), shows full labels
export const isSidebarCollapsed = writable(false);

export function toggleSidebar() {
	isSidebarCollapsed.update(v => !v);
}

export function collapseSidebar() {
	isSidebarCollapsed.set(true);
}

export function expandSidebar() {
	isSidebarCollapsed.set(false);
}

export function getSidebarCollapsed(): boolean {
	return get(isSidebarCollapsed);
}

// Task drawer state
export const isTaskDrawerOpen = writable(false);

// Selected project context for task drawer (pre-fills project field)
export const selectedDrawerProject = writable<string | null>(null);

// Available projects for task drawer (dynamically populated from tasks)
export const availableProjects = writable<string[]>([]);

// Project colors for task drawer (populated from layout's projectColors)
export const projectColorsStore = writable<Record<string, string>>({});

// Helper functions
export function openTaskDrawer(project?: string) {
	if (project && project !== 'All Projects') {
		selectedDrawerProject.set(project);
	} else {
		selectedDrawerProject.set(null);
	}
	isTaskDrawerOpen.set(true);
}

export function closeTaskDrawer() {
	isTaskDrawerOpen.set(false);
}

// Spawn modal state
export const isSpawnModalOpen = writable(false);

export function openSpawnModal() {
	isSpawnModalOpen.set(true);
}

export function closeSpawnModal() {
	isSpawnModalOpen.set(false);
}

// Task detail drawer state (global, for inspecting tasks from anywhere)
export const isTaskDetailDrawerOpen = writable(false);
export const taskDetailDrawerTaskId = writable<string | null>(null);

export function openTaskDetailDrawer(taskId: string) {
	taskDetailDrawerTaskId.set(taskId);
	isTaskDetailDrawerOpen.set(true);
}

export function closeTaskDetailDrawer() {
	isTaskDetailDrawerOpen.set(false);
	taskDetailDrawerTaskId.set(null);
}

// Output drawer state
export const isOutputDrawerOpen = writable(false);

// Selected session for output drawer (null = show all sessions)
export const selectedOutputSession = writable<string | null>(null);

export function openOutputDrawer() {
	isOutputDrawerOpen.set(true);
}

export function closeOutputDrawer() {
	isOutputDrawerOpen.set(false);
	// Clear selection when closing
	selectedOutputSession.set(null);
}

export function toggleOutputDrawer() {
	isOutputDrawerOpen.update(v => !v);
}

/**
 * Open the output drawer focused on a specific session
 * @param sessionName - The session name to focus on (e.g., "WisePrairie")
 */
export function openOutputDrawerForSession(sessionName: string) {
	selectedOutputSession.set(sessionName);
	isOutputDrawerOpen.set(true);
}

/**
 * Clear the session selection (show all sessions)
 */
export function clearOutputSessionSelection() {
	selectedOutputSession.set(null);
}

// Epic swarm modal state
export const isEpicSwarmModalOpen = writable(false);
export const epicSwarmModalEpicId = writable<string | null>(null);

export function openEpicSwarmModal(epicId?: string) {
	if (epicId) {
		epicSwarmModalEpicId.set(epicId);
	}
	isEpicSwarmModalOpen.set(true);
}

export function closeEpicSwarmModal() {
	isEpicSwarmModalOpen.set(false);
	epicSwarmModalEpicId.set(null);
}

// Create project drawer state
export const isProjectDrawerOpen = writable(false);

export function openProjectDrawer() {
	isProjectDrawerOpen.set(true);
}

export function closeProjectDrawer() {
	isProjectDrawerOpen.set(false);
}

// Start dropdown state (TopBar's START NEXT dropdown)
// Keyboard shortcut: Alt+S to open
export const isStartDropdownOpen = writable(false);

// Track if dropdown was opened via keyboard (for auto-focus behavior)
export const startDropdownOpenedViaKeyboard = writable(false);

export function openStartDropdown() {
	isStartDropdownOpen.set(true);
}

export function closeStartDropdown() {
	isStartDropdownOpen.set(false);
	startDropdownOpenedViaKeyboard.set(false);
}

export function toggleStartDropdown() {
	isStartDropdownOpen.update(v => !v);
}

// Open dropdown via keyboard shortcut (triggers auto-focus behavior)
export function openStartDropdownViaKeyboard() {
	startDropdownOpenedViaKeyboard.set(true);
	isStartDropdownOpen.set(true);
}
