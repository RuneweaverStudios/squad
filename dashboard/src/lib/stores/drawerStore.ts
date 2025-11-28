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

export function openOutputDrawer() {
	isOutputDrawerOpen.set(true);
}

export function closeOutputDrawer() {
	isOutputDrawerOpen.set(false);
}

export function toggleOutputDrawer() {
	isOutputDrawerOpen.update(v => !v);
}
