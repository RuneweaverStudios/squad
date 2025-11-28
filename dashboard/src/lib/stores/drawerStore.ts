/**
 * Drawer Store
 * Manages state for task creation drawer and spawn modal
 */

import { writable } from 'svelte/store';

// Task drawer state
export const isTaskDrawerOpen = writable(false);

// Helper functions
export function openTaskDrawer() {
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
