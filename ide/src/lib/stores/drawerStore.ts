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

// Initial text to populate task drawer (parsed like paste: first line = title, rest = description)
export const initialTaskText = writable<string | null>(null);

// Initial issue type to pre-fill task drawer (e.g., 'epic' when creating from "Assign to Epic" menu)
export const initialIssueType = writable<string | null>(null);

// Creation mode for multi-mode task drawer (tabs: task, paste, template, generator, plan)
export type DrawerCreationMode = 'task' | 'paste' | 'template' | 'generator' | 'plan';
export const drawerCreationMode = writable<DrawerCreationMode>('task');

// Available projects for task drawer (dynamically populated from tasks)
export const availableProjects = writable<string[]>([]);

// Project colors for task drawer (populated from layout's projectColors)
export const projectColorsStore = writable<Record<string, string>>({});

// Helper functions
export function openTaskDrawer(project?: string, text?: string, mode?: DrawerCreationMode, issueType?: string) {
	if (project && project !== 'All Projects') {
		selectedDrawerProject.set(project);
	} else {
		selectedDrawerProject.set(null);
	}
	if (text) {
		initialTaskText.set(text);
	} else {
		initialTaskText.set(null);
	}
	initialIssueType.set(issueType || null);
	drawerCreationMode.set(mode || 'task');
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

// Project created event - increment to signal a project was created
// Pages can subscribe to this and refresh their project lists
export const projectCreatedSignal = writable(0);

export function signalProjectCreated() {
	projectCreatedSignal.update(n => n + 1);
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

// File preview drawer state (for quick file viewing/editing from signal cards)
export const isFilePreviewDrawerOpen = writable(false);
export const filePreviewDrawerPath = writable<string>('');
export const filePreviewDrawerProject = writable<string>('');
export const filePreviewDrawerLine = writable<number | null>(null);

/**
 * Open the file preview drawer for a specific file
 * @param filePath - Path to the file (relative to project root)
 * @param projectName - Project name (e.g., 'jat', 'chimaro')
 * @param lineNumber - Optional line number to scroll to
 */
export function openFilePreviewDrawer(filePath: string, projectName: string, lineNumber?: number) {
	filePreviewDrawerPath.set(filePath);
	filePreviewDrawerProject.set(projectName);
	filePreviewDrawerLine.set(lineNumber ?? null);
	isFilePreviewDrawerOpen.set(true);
}

export function closeFilePreviewDrawer() {
	isFilePreviewDrawerOpen.set(false);
	// Don't clear path/project immediately to allow for smooth close animation
}

// Terminal drawer state
// Ad-hoc terminal sessions for quick commands
// Keyboard shortcut: Ctrl+` to toggle
export const isTerminalDrawerOpen = writable(false);

export function openTerminalDrawer() {
	isTerminalDrawerOpen.set(true);
}

export function closeTerminalDrawer() {
	isTerminalDrawerOpen.set(false);
}

export function toggleTerminalDrawer() {
	isTerminalDrawerOpen.update(v => !v);
}

// Diff preview drawer state (for viewing git diffs with Monaco diff editor)
export const isDiffPreviewDrawerOpen = writable(false);
export const diffPreviewDrawerPath = writable<string>('');
export const diffPreviewDrawerProject = writable<string>('');
export const diffPreviewDrawerIsStaged = writable(false);
export const diffPreviewDrawerCommitHash = writable<string | null>(null);

/**
 * Open the diff preview drawer for a specific file
 * @param filePath - Path to the file (relative to project root)
 * @param projectName - Project name (e.g., 'jat', 'chimaro')
 * @param isStaged - Whether to show staged diff (true) or unstaged diff (false)
 */
export function openDiffPreviewDrawer(filePath: string, projectName: string, isStaged: boolean = false) {
	diffPreviewDrawerPath.set(filePath);
	diffPreviewDrawerProject.set(projectName);
	diffPreviewDrawerIsStaged.set(isStaged);
	diffPreviewDrawerCommitHash.set(null);
	isDiffPreviewDrawerOpen.set(true);
}

/**
 * Open the diff preview drawer for a specific file in a commit
 * @param filePath - Path to the file (relative to project root)
 * @param projectName - Project name (e.g., 'jat', 'chimaro')
 * @param commitHash - Full or short commit hash
 */
export function openCommitDiffDrawer(filePath: string, projectName: string, commitHash: string) {
	diffPreviewDrawerPath.set(filePath);
	diffPreviewDrawerProject.set(projectName);
	diffPreviewDrawerIsStaged.set(false);
	diffPreviewDrawerCommitHash.set(commitHash);
	isDiffPreviewDrawerOpen.set(true);
}

export function closeDiffPreviewDrawer() {
	isDiffPreviewDrawerOpen.set(false);
	// Don't clear path/project immediately to allow for smooth close animation
}

// Git status store (for Files/Source sidebar badges)
export const gitAheadCount = writable(0);
export const gitChangesCount = writable(0);

export function setGitAheadCount(count: number) {
	gitAheadCount.set(count);
}

export function getGitAheadCount(): number {
	return get(gitAheadCount);
}

export function setGitChangesCount(count: number) {
	gitChangesCount.set(count);
}

export function getGitChangesCount(): number {
	return get(gitChangesCount);
}

// Active sessions count store (for Sessions sidebar badge)
export const activeSessionsCount = writable(0);

export function setActiveSessionsCount(count: number) {
	activeSessionsCount.set(count);
}

export function getActiveSessionsCount(): number {
	return get(activeSessionsCount);
}

// Running servers count store (for Servers sidebar badge)
export const runningServersCount = writable(0);

export function setRunningServersCount(count: number) {
	runningServersCount.set(count);
}

export function getRunningServersCount(): number {
	return get(runningServersCount);
}

// Active agent sessions count store (for Tasks sidebar badge)
// This counts only agent-type sessions (not servers)
export const activeAgentSessionsCount = writable(0);

export function setActiveAgentSessionsCount(count: number) {
	activeAgentSessionsCount.set(count);
}

export function getActiveAgentSessionsCount(): number {
	return get(activeAgentSessionsCount);
}

// File changes count store (for Files sidebar badge)
// Indicates number of detected file tree changes that need refresh
export const fileChangesCount = writable(0);

export function setFileChangesCount(count: number) {
	fileChangesCount.set(count);
}

export function getFileChangesCount(): number {
	return get(fileChangesCount);
}
