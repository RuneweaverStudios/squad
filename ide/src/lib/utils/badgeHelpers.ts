/**
 * Badge helper utilities for consistent styling across the IDE.
 *
 * Uses centralized config from statusColors.ts for consistency.
 * These functions provide backward-compatible API while pulling from single source of truth.
 */

import {
	AGENT_STATUS_VISUALS,
	TASK_STATUS_VISUALS,
	PRIORITY_VISUALS,
	getAgentStatusVisual,
	getTaskStatusVisual,
	getPriorityVisual
} from '$lib/config/statusColors';

// =============================================================================
// PRIORITY HELPERS (now using primary color with opacity)
// =============================================================================

export function getPriorityBadge(priority: number | null | undefined): string {
	return getPriorityVisual(priority).badge;
}

export function getPriorityLabel(priority: number | null | undefined): string {
	return getPriorityVisual(priority).description;
}

// =============================================================================
// TASK STATUS HELPERS
// =============================================================================

export function getTaskStatusBadge(status: string | null | undefined): string {
	return getTaskStatusVisual(status || 'open').badge;
}

export function getTaskStatusLabel(status: string | null | undefined): string {
	switch (status) {
		case 'open': return 'Open';
		case 'in_progress': return 'In Progress';
		case 'blocked': return 'Blocked';
		case 'closed': return 'Closed';
		default: return status || 'Unknown';
	}
}

// =============================================================================
// ISSUE TYPE HELPERS (unchanged - no config yet)
// =============================================================================

export function getTypeBadge(type: string | null | undefined): string {
	switch (type) {
		case 'bug': return 'badge-error';
		case 'feature': return 'badge-success';
		case 'epic': return 'badge-primary';
		case 'chore': return 'badge-ghost';
		case 'task': return 'badge-ghost';  // Changed from badge-info to avoid blue overload
		default: return 'badge-ghost';
	}
}

export function getTypeLabel(type: string | null | undefined): string {
	if (!type) return 'No Type';
	return type.charAt(0).toUpperCase() + type.slice(1);
}

// =============================================================================
// AGENT STATUS HELPERS
// =============================================================================

export function getAgentStatusBadge(status: string | null | undefined): string {
	return getAgentStatusVisual(status || 'idle').badge;
}

export function getAgentStatusIcon(status: string | null | undefined): string {
	const visual = getAgentStatusVisual(status || 'idle');
	// Return emoji/character for backward compat with existing badge rendering
	switch (status) {
		case 'live': return '...';     // Will be replaced with loading-dots component
		case 'working': return '⚙';    // Gear emoji (actual SVG rendered separately)
		case 'active': return '●';     // Pulsing dot
		case 'idle': return '○';       // Empty circle
		case 'offline': return '⏻';    // Power symbol
		default: return '○';
	}
}

export function getAgentStatusLabel(status: string | null | undefined): string {
	return getAgentStatusVisual(status || 'idle').label;
}

// =============================================================================
// EXTENDED HELPERS (new - for components that need full visual config)
// =============================================================================

export { getAgentStatusVisual, getTaskStatusVisual, getPriorityVisual };

// =============================================================================
// HUMAN TASK HELPERS
// =============================================================================

interface TaskWithLabels {
	labels?: string[];
	issue_type?: string;
}

/**
 * Check if a task is a human-action task.
 * A task is considered "human" if:
 * - It has issue_type === 'human', OR
 * - It has a label 'human-action' or 'human'
 *
 * Human tasks are tasks that require human intervention (not agent work).
 * Examples: Deploying to production, reviewing PRs, testing on real devices.
 */
export function isHumanTask(task: TaskWithLabels | null | undefined): boolean {
	if (!task) return false;

	// Check issue_type
	if (task.issue_type === 'human') return true;

	// Check labels
	const labels = task.labels || [];
	return labels.some(label =>
		label === 'human-action' || label === 'human' || label === 'harness:human'
	);
}
