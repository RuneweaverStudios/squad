/**
 * Unified Status Colors & Icons Configuration
 *
 * Single source of truth for all status-related visual styling.
 * Used by: AgentCard, TaskTable, TaskQueue, activity feeds
 *
 * DaisyUI color semantics:
 * - info (blue): Active work, in progress
 * - success (green): Positive, complete, online
 * - warning (yellow): Caution, blocked, needs attention
 * - error (red): Critical, offline, problem
 * - primary: Brand color (used for priorities)
 * - ghost/neutral: Deemphasized, inactive
 */

// =============================================================================
// AGENT STATUS VISUAL CONFIG
// =============================================================================

export interface AgentStatusVisual {
	badge: string;        // DaisyUI badge class (badge-info, badge-success, etc.)
	text: string;         // Tailwind text color (text-info, text-success, etc.)
	icon: string;         // Icon character or identifier
	iconType: 'emoji' | 'daisyui' | 'svg';  // How to render the icon
	animation?: string;   // Tailwind animation class (animate-spin, animate-pulse)
	label: string;        // Human-readable label
	description: string;  // Tooltip description
	// Industrial theme colors (oklch for modern color handling)
	accent: string;       // Vibrant accent color for bars/highlights
	bgTint: string;       // Subtle background tint
	glow: string;         // Glow effect color (for active states)
}

export const AGENT_STATUS_VISUALS: Record<string, AgentStatusVisual> = {
	// WORKING: Has task/locks, actively coding
	working: {
		badge: 'badge-info',
		text: 'text-info',
		icon: 'gear',
		iconType: 'svg',
		animation: 'animate-spin',
		label: 'Working',
		description: 'Actively working on a task',
		accent: 'oklch(0.70 0.18 240)',       // Electric blue
		bgTint: 'oklch(0.70 0.18 240 / 0.08)',
		glow: 'oklch(0.70 0.18 240 / 0.4)'
	},

	// LIVE: Very recent activity (< 1 min) but no formal task
	live: {
		badge: 'badge-success',
		text: 'text-success',
		icon: 'loading-dots',
		iconType: 'daisyui',
		animation: undefined,  // loading-dots has built-in animation
		label: 'Live',
		description: 'Responsive and active (< 1 minute)',
		accent: 'oklch(0.75 0.20 145)',       // Vibrant green
		bgTint: 'oklch(0.75 0.20 145 / 0.08)',
		glow: 'oklch(0.75 0.20 145 / 0.4)'
	},

	// ACTIVE: Recent activity (1-10 min), probably still around
	active: {
		badge: 'badge-accent',
		text: 'text-accent',
		icon: 'pulse-dot',
		iconType: 'svg',
		animation: 'animate-pulse',
		label: 'Active',
		description: 'Recently active (< 10 minutes)',
		accent: 'oklch(0.75 0.18 70)',        // Warm amber
		bgTint: 'oklch(0.75 0.18 70 / 0.08)',
		glow: 'oklch(0.75 0.18 70 / 0.4)'
	},

	// IDLE: Within 1 hour but quiet
	idle: {
		badge: 'badge-ghost',
		text: 'text-base-content/50',
		icon: 'circle',
		iconType: 'svg',
		animation: undefined,
		label: 'Idle',
		description: 'Available but quiet (< 1 hour)',
		accent: 'oklch(0.60 0.03 250)',       // Muted slate
		bgTint: 'oklch(0.60 0.03 250 / 0.04)',
		glow: 'oklch(0.60 0.03 250 / 0.2)'
	},

	// CONNECTING: Session exists but still initializing (very new, no activity yet)
	connecting: {
		badge: 'badge-info badge-outline',
		text: 'text-info',
		icon: 'loading-ring',
		iconType: 'daisyui',
		animation: undefined,  // loading-ring has built-in animation
		label: 'Connecting',
		description: 'Session starting up',
		accent: 'oklch(0.70 0.15 220)',       // Soft blue
		bgTint: 'oklch(0.70 0.15 220 / 0.08)',
		glow: 'oklch(0.70 0.15 220 / 0.3)'
	},

	// DISCONNECTED: No session but was active recently (unexpected termination)
	disconnected: {
		badge: 'badge-warning',
		text: 'text-warning',
		icon: 'disconnect',
		iconType: 'svg',
		animation: 'animate-pulse',
		label: 'Disconnected',
		description: 'Session lost unexpectedly',
		accent: 'oklch(0.75 0.18 55)',        // Warning orange
		bgTint: 'oklch(0.75 0.18 55 / 0.08)',
		glow: 'oklch(0.75 0.18 55 / 0.4)'
	},

	// OFFLINE: Gone for > 1 hour
	offline: {
		badge: 'badge-error',
		text: 'text-error',
		icon: 'power-off',
		iconType: 'svg',
		animation: undefined,
		label: 'Offline',
		description: 'Not active for over 1 hour',
		accent: 'oklch(0.55 0.15 25)',        // Dim red
		bgTint: 'oklch(0.55 0.15 25 / 0.05)',
		glow: 'oklch(0.55 0.15 25 / 0.2)'
	}
};

// =============================================================================
// TASK STATUS VISUAL CONFIG
// =============================================================================

export interface TaskStatusVisual {
	badge: string;        // DaisyUI badge class
	text: string;         // Tailwind text color
	icon: string;         // SVG path or emoji
	iconType: 'svg' | 'emoji';
	iconStyle?: 'outline' | 'solid';
	animation?: string;   // For in_progress spinning gear
	label: string;
	description: string;
}

export const TASK_STATUS_VISUALS: Record<string, TaskStatusVisual> = {
	// IN PROGRESS: Being worked on (uses STATUS_ICONS.gear)
	in_progress: {
		badge: 'badge-info',
		text: 'text-info',
		icon: 'gear',  // Reference to STATUS_ICONS.gear - with donut hole
		iconType: 'svg',
		iconStyle: 'solid',
		animation: 'animate-spin',
		label: 'In Progress',
		description: 'Currently being worked on'
	},

	// OPEN: Ready to start
	open: {
		badge: 'badge-ghost',
		text: 'text-base-content/60',
		icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
		iconType: 'svg',
		iconStyle: 'outline',
		animation: undefined,
		label: 'Open',
		description: 'Ready to start'
	},

	// BLOCKED: Waiting on dependencies
	blocked: {
		badge: 'badge-warning',
		text: 'text-warning',
		icon: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
		iconType: 'svg',
		iconStyle: 'outline',
		animation: undefined,
		label: 'Blocked',
		description: 'Blocked by dependencies'
	},

	// CLOSED: Completed
	closed: {
		badge: 'badge-success',
		text: 'text-success',
		icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
		iconType: 'svg',
		iconStyle: 'outline',
		animation: undefined,
		label: 'Closed',
		description: 'Completed'
	},

	// REOPENED: Previously closed, reopened for additional work
	reopened: {
		badge: 'badge-warning badge-outline',
		text: 'text-warning',
		icon: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99',
		iconType: 'svg',
		iconStyle: 'outline',
		animation: undefined,
		label: 'Reopened',
		description: 'Previously completed, reopened for additional work'
	}
};

// =============================================================================
// PRIORITY VISUAL CONFIG (using primary color with opacity)
// =============================================================================

export interface PriorityVisual {
	badge: string;        // Full badge class including opacity
	text: string;         // Text color
	label: string;        // P0, P1, etc.
	description: string;  // Critical, High, etc.
}

export const PRIORITY_VISUALS: Record<number, PriorityVisual> = {
	0: {
		badge: 'badge-primary',
		text: 'text-primary',
		label: 'P0',
		description: 'Critical'
	},
	1: {
		badge: 'badge-primary badge-outline',
		text: 'text-primary/80',
		label: 'P1',
		description: 'High'
	},
	2: {
		badge: 'badge-ghost text-primary/60',
		text: 'text-primary/60',
		label: 'P2',
		description: 'Medium'
	},
	3: {
		badge: 'badge-ghost text-base-content/40',
		text: 'text-base-content/40',
		label: 'P3',
		description: 'Low'
	}
};

// =============================================================================
// SVG ICON PATHS
// =============================================================================

export const STATUS_ICONS = {
	// Gear icon (for working/in_progress) - with donut hole center
	gear: 'M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.923-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 00-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 00-1.85-1.567h-1.843zM15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM14.25 12a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',

	// Circle (for idle)
	circle: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0z',

	// Filled circle/dot (for active pulse)
	'pulse-dot': 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',

	// Power off / sleep (for offline)
	'power-off': 'M5.636 5.636a9 9 0 1012.728 0M12 3v9',

	// Disconnected / signal lost (for disconnected - session died unexpectedly)
	'disconnect': 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z',

	// Clock (for open/waiting)
	clock: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',

	// Warning triangle (for blocked)
	warning: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',

	// Checkmark circle (for closed/success)
	check: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get agent status visual config with fallback
 */
export function getAgentStatusVisual(status: string): AgentStatusVisual {
	return AGENT_STATUS_VISUALS[status] || AGENT_STATUS_VISUALS.idle;
}

/**
 * Get task status visual config with fallback
 */
export function getTaskStatusVisual(status: string): TaskStatusVisual {
	return TASK_STATUS_VISUALS[status] || TASK_STATUS_VISUALS.open;
}

/**
 * Get priority visual config with fallback
 */
export function getPriorityVisual(priority: number | null | undefined): PriorityVisual {
	const p = priority ?? 3;
	return PRIORITY_VISUALS[p] || PRIORITY_VISUALS[3];
}

/**
 * Get SVG icon path by name
 */
export function getStatusIcon(name: string): string {
	return STATUS_ICONS[name as keyof typeof STATUS_ICONS] || STATUS_ICONS.circle;
}

// =============================================================================
// ISSUE TYPE VISUAL CONFIG
// =============================================================================

export interface IssueTypeVisual {
	icon: string;
	label: string;
	/** Accent color for industrial theme headers */
	accent: string;
	/** Background tint for the header */
	bgTint: string;
}

const ISSUE_TYPE_VISUALS: Record<string, IssueTypeVisual> = {
	bug: {
		icon: '🐛',
		label: 'BUG',
		accent: 'oklch(0.65 0.25 25)',      // Vibrant red-orange
		bgTint: 'oklch(0.65 0.25 25 / 0.08)'
	},
	feature: {
		icon: '✨',
		label: 'FEATURE',
		accent: 'oklch(0.75 0.18 145)',     // Fresh green
		bgTint: 'oklch(0.75 0.18 145 / 0.08)'
	},
	task: {
		icon: '📋',
		label: 'TASK',
		accent: 'oklch(0.70 0.14 250)',     // Cool blue
		bgTint: 'oklch(0.70 0.14 250 / 0.08)'
	},
	chore: {
		icon: '🔧',
		label: 'CHORE',
		accent: 'oklch(0.65 0.05 250)',     // Muted slate
		bgTint: 'oklch(0.65 0.05 250 / 0.06)'
	},
	epic: {
		icon: '🏔️',
		label: 'EPIC',
		accent: 'oklch(0.70 0.20 300)',     // Royal purple
		bgTint: 'oklch(0.70 0.20 300 / 0.08)'
	},
	docs: {
		icon: '📄',
		label: 'DOCS',
		accent: 'oklch(0.72 0.12 200)',     // Soft cyan
		bgTint: 'oklch(0.72 0.12 200 / 0.06)'
	},
	refactor: {
		icon: '♻️',
		label: 'REFACTOR',
		accent: 'oklch(0.70 0.16 85)',      // Amber/yellow
		bgTint: 'oklch(0.70 0.16 85 / 0.08)'
	},
	test: {
		icon: '🧪',
		label: 'TEST',
		accent: 'oklch(0.68 0.18 180)',     // Teal
		bgTint: 'oklch(0.68 0.18 180 / 0.08)'
	},
	style: {
		icon: '🎨',
		label: 'STYLE',
		accent: 'oklch(0.70 0.22 330)',     // Pink/magenta
		bgTint: 'oklch(0.70 0.22 330 / 0.08)'
	},
	perf: {
		icon: '⚡',
		label: 'PERF',
		accent: 'oklch(0.78 0.18 70)',      // Electric yellow
		bgTint: 'oklch(0.78 0.18 70 / 0.08)'
	}
};

const DEFAULT_TYPE_VISUAL: IssueTypeVisual = {
	icon: '📋',
	label: 'UNTYPED',
	accent: 'oklch(0.60 0.02 250)',
	bgTint: 'oklch(0.60 0.02 250 / 0.05)'
};

/**
 * Get issue type visual config with fallback
 */
export function getIssueTypeVisual(issueType: string | undefined | null): IssueTypeVisual {
	if (!issueType) return DEFAULT_TYPE_VISUAL;
	return ISSUE_TYPE_VISUALS[issueType] || {
		...DEFAULT_TYPE_VISUAL,
		label: issueType.toUpperCase()
	};
}

// =============================================================================
// WORK SESSION STATE VISUAL CONFIG
// =============================================================================
//
// Unified configuration for session state visuals used by:
// - StatusActionBadge: Dropdown status badges (bgColor, textColor, borderColor)
// - SessionCard: Accent bar and agent info badge styling (accent, bgTint, glow)
//
// Both use the same icon identifiers and labels for consistency.

export type SessionStateIconType = 'rocket' | 'gear' | 'question' | 'eye' | 'check' | 'circle';

/**
 * Centralized SessionState type - single source of truth for all session states.
 * Used by SessionCard, StatusActionBadge, triage page, and any other components
 * that need to work with session states.
 */
export type SessionState =
	| 'starting'
	| 'working'
	| 'compacting'
	| 'needs-input'
	| 'ready-for-review'
	| 'completing'
	| 'completed'
	| 'auto-proceeding'
	| 'recovering'
	| 'idle';

export interface SessionStateVisual {
	// Display
	label: string;                 // Display label with emoji (e.g., "✅ DONE")
	shortLabel: string;            // Short label without emoji (e.g., "Complete")
	iconType: SessionStateIconType; // Icon identifier for SessionCard

	// Dormant variants (for sessions that have been inactive)
	dormantLabel?: string;         // Label when dormant (e.g., "💤 COMPLETE")
	dormantShortLabel?: string;    // Short label when dormant

	// StatusActionBadge colors (used for dropdown badges)
	bgColor: string;               // Background color (oklch with alpha)
	textColor: string;             // Text color (oklch)
	borderColor: string;           // Border color (oklch with alpha)
	pulse?: boolean;               // Whether to animate with pulse

	// SessionCard accent bar colors (used for left accent bar and agent badge)
	accent: string;                // Vibrant accent color for bars/highlights
	bgTint: string;                // Subtle background tint
	glow: string;                  // Glow effect color (for active states)

	// Dormant colors (muted/desaturated versions for inactive sessions)
	dormantAccent?: string;        // Muted accent color when dormant
	dormantBgTint?: string;        // Muted background tint when dormant
	dormantGlow?: string;          // Muted glow when dormant

	// SVG path for StatusActionBadge icon
	icon: string;
}

export const SESSION_STATE_VISUALS: Record<string, SessionStateVisual> = {
	starting: {
		label: '🚀 STARTING',
		shortLabel: '🚀 Starting',
		iconType: 'rocket',
		// StatusActionBadge colors
		bgColor: 'oklch(0.60 0.15 200 / 0.3)',
		textColor: 'oklch(0.90 0.12 200)',
		borderColor: 'oklch(0.60 0.15 200 / 0.5)',
		// SessionCard accent colors
		accent: 'oklch(0.75 0.15 200)',
		bgTint: 'oklch(0.75 0.15 200 / 0.10)',
		glow: 'oklch(0.75 0.15 200 / 0.5)',
		icon: 'M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z'
	},
	working: {
		label: '🔧 WORKING',
		shortLabel: '🔧 Working',
		iconType: 'gear',
		// Dormant variant: agent was working but has gone quiet/stalled
		dormantLabel: '💤 WORKING',
		dormantShortLabel: '💤 Working',
		// StatusActionBadge colors
		bgColor: 'oklch(0.55 0.15 250 / 0.3)',
		textColor: 'oklch(0.90 0.12 250)',
		borderColor: 'oklch(0.55 0.15 250 / 0.5)',
		// SessionCard accent colors
		accent: 'oklch(0.70 0.18 250)',
		bgTint: 'oklch(0.70 0.18 250 / 0.08)',
		glow: 'oklch(0.70 0.18 250 / 0.4)',
		// Dormant colors (muted/desaturated)
		dormantAccent: 'oklch(0.50 0.05 250)',
		dormantBgTint: 'oklch(0.50 0.05 250 / 0.05)',
		dormantGlow: 'oklch(0.50 0.05 250 / 0.2)',
		icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z'
	},
	// RECOVERING: Automation rule triggered recovery action (API overloaded, rate limit, etc.)
	recovering: {
		label: '🔄 RECOVERING',
		shortLabel: '🔄 Recovering',
		iconType: 'gear',
		// StatusActionBadge colors - cyan/teal to indicate auto-recovery in progress
		bgColor: 'oklch(0.55 0.18 190 / 0.3)',
		textColor: 'oklch(0.90 0.15 190)',
		borderColor: 'oklch(0.55 0.18 190 / 0.5)',
		pulse: true,
		// SessionCard accent colors - pulsing cyan to draw attention
		accent: 'oklch(0.70 0.20 190)',
		bgTint: 'oklch(0.70 0.20 190 / 0.10)',
		glow: 'oklch(0.70 0.20 190 / 0.5)',
		// Rotating arrows icon (recovery/refresh)
		icon: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99'
	},
	compacting: {
		label: '📦 COMPACTING',
		shortLabel: '📦 Compacting',
		iconType: 'gear',
		// StatusActionBadge colors - muted purple to indicate system processing
		bgColor: 'oklch(0.50 0.12 280 / 0.3)',
		textColor: 'oklch(0.85 0.10 280)',
		borderColor: 'oklch(0.50 0.12 280 / 0.5)',
		pulse: true,
		// SessionCard accent colors - purple/violet for system operation
		accent: 'oklch(0.65 0.15 280)',
		bgTint: 'oklch(0.65 0.15 280 / 0.08)',
		glow: 'oklch(0.65 0.15 280 / 0.4)',
		// Compress/archive icon
		icon: 'M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125'
	},
	'needs-input': {
		label: '❓ INPUT',
		shortLabel: '❓ Needs Input',
		iconType: 'question',
		// Dormant variant: waiting for user but user hasn't responded
		dormantLabel: '💤 INPUT',
		dormantShortLabel: '💤 Needs Input',
		// StatusActionBadge colors
		bgColor: 'oklch(0.60 0.20 45 / 0.3)',
		textColor: 'oklch(0.90 0.15 45)',
		borderColor: 'oklch(0.60 0.20 45 / 0.5)',
		pulse: true,
		// SessionCard accent colors
		accent: 'oklch(0.75 0.20 45)',
		bgTint: 'oklch(0.75 0.20 45 / 0.10)',
		glow: 'oklch(0.75 0.20 45 / 0.5)',
		// Dormant colors (muted/desaturated)
		dormantAccent: 'oklch(0.55 0.05 45)',
		dormantBgTint: 'oklch(0.55 0.05 45 / 0.05)',
		dormantGlow: 'oklch(0.55 0.05 45 / 0.2)',
		icon: 'M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z'
	},
	'ready-for-review': {
		label: '🔍 REVIEW',
		shortLabel: '🔍 Review',
		iconType: 'eye',
		// Dormant variant: waiting for user review but user hasn't acted
		dormantLabel: '💤 REVIEW',
		dormantShortLabel: '💤 Review',
		// StatusActionBadge colors
		bgColor: 'oklch(0.55 0.18 85 / 0.3)',
		textColor: 'oklch(0.85 0.15 85)',
		borderColor: 'oklch(0.55 0.18 85 / 0.5)',
		pulse: true,
		// SessionCard accent colors
		accent: 'oklch(0.70 0.20 85)',
		bgTint: 'oklch(0.70 0.20 85 / 0.08)',
		glow: 'oklch(0.70 0.20 85 / 0.4)',
		// Dormant colors (muted/desaturated)
		dormantAccent: 'oklch(0.50 0.05 85)',
		dormantBgTint: 'oklch(0.50 0.05 85 / 0.05)',
		dormantGlow: 'oklch(0.50 0.05 85 / 0.2)',
		icon: 'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z'
	},
	completing: {
		label: '⏳ COMPLETING',
		shortLabel: '⏳ Completing',
		iconType: 'gear',
		// StatusActionBadge colors
		bgColor: 'oklch(0.50 0.12 175 / 0.3)',
		textColor: 'oklch(0.85 0.12 175)',
		borderColor: 'oklch(0.50 0.12 175 / 0.5)',
		// SessionCard accent colors
		accent: 'oklch(0.65 0.15 175)',
		bgTint: 'oklch(0.65 0.15 175 / 0.08)',
		glow: 'oklch(0.65 0.15 175 / 0.4)',
		icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
	},
	completed: {
		label: '✅ DONE',
		shortLabel: '✅ Complete',
		iconType: 'check',
		// Dormant variant: session completed but now sleeping/inactive
		dormantLabel: '💤 COMPLETE',
		dormantShortLabel: '💤 Complete',
		// StatusActionBadge colors
		bgColor: 'oklch(0.45 0.18 145 / 0.3)',
		textColor: 'oklch(0.80 0.15 145)',
		borderColor: 'oklch(0.45 0.18 145 / 0.5)',
		// SessionCard accent colors
		accent: 'oklch(0.70 0.20 145)',
		bgTint: 'oklch(0.70 0.20 145 / 0.08)',
		glow: 'oklch(0.70 0.20 145 / 0.4)',
		// Dormant colors (muted/desaturated)
		dormantAccent: 'oklch(0.50 0.05 145)',
		dormantBgTint: 'oklch(0.50 0.05 145 / 0.05)',
		dormantGlow: 'oklch(0.50 0.05 145 / 0.2)',
		icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
	},
	'auto-proceeding': {
		label: '🚀 SPAWNING NEXT',
		shortLabel: '🚀 Spawning',
		iconType: 'rocket',
		// StatusActionBadge colors - vibrant green with cyan undertone (success + progress)
		bgColor: 'oklch(0.50 0.20 160 / 0.3)',
		textColor: 'oklch(0.85 0.18 160)',
		borderColor: 'oklch(0.50 0.20 160 / 0.5)',
		pulse: true,
		// SessionCard accent colors - bright green with pulse animation
		accent: 'oklch(0.75 0.22 160)',
		bgTint: 'oklch(0.75 0.22 160 / 0.10)',
		glow: 'oklch(0.75 0.22 160 / 0.5)',
		// Rocket/launch icon (same as starting)
		icon: 'M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z'
	},
	idle: {
		label: '💤 IDLE',
		shortLabel: '💤 Idle',
		iconType: 'circle',
		// StatusActionBadge colors
		bgColor: 'oklch(0.5 0 0 / 0.1)',
		textColor: 'oklch(0.60 0.02 250)',
		borderColor: 'oklch(0.5 0 0 / 0.2)',
		// SessionCard accent colors
		accent: 'oklch(0.55 0.05 250)',
		bgTint: 'oklch(0.55 0.05 250 / 0.05)',
		glow: 'oklch(0.55 0.05 250 / 0.2)',
		icon: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
	}
};

// =============================================================================
// WORK SESSION STATE ACTIONS (StatusActionBadge dropdown actions)
// =============================================================================

export interface SessionStateAction {
	id: string;
	label: string;
	icon: string;         // SVG path
	variant: 'default' | 'success' | 'warning' | 'error' | 'info';
	description?: string;
	/** For custom command actions: the slash command to execute (e.g., "/jat:bead") */
	command?: string;
}

export const SESSION_STATE_ACTIONS: Record<string, SessionStateAction[]> = {
	completed: [
		{
			id: 'start-next',
			label: 'Start Next',
			icon: 'M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061A1.125 1.125 0 013 16.811V8.69zM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061a1.125 1.125 0 01-1.683-.977V8.69z',
			variant: 'success',
			description: 'Cleanup and spawn agent for next task'
		},
		{
			id: 'cleanup',
			label: 'Cleanup Session',
			icon: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
			variant: 'default',
			description: 'Close tmux session and remove from list'
		},
		{
			id: 'view-task',
			label: 'View Task',
			icon: 'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
			variant: 'default',
			description: 'Open task details'
		},
		{
			id: 'attach',
			label: 'Attach Terminal',
			icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
			variant: 'info',
			description: 'Open session in terminal'
		}
	],
	'auto-proceeding': [
		{
			id: 'attach',
			label: 'Watch Progress',
			icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
			variant: 'info',
			description: 'Watch next session spawn'
		},
		{
			id: 'kill',
			label: 'Cancel Spawn',
			icon: 'M6 18L18 6M6 6l12 12',
			variant: 'error',
			description: 'Cancel auto-proceed and close session'
		}
	],
	'ready-for-review': [
		{
			id: 'complete',
			label: 'Mark Done',
			icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
			variant: 'success',
			description: 'Run /jat:complete to finish task'
		},
		{
			id: 'attach',
			label: 'Attach Terminal',
			icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
			variant: 'info',
			description: 'Open session in terminal to review'
		},
		{
			id: 'kill',
			label: 'Kill Session',
			icon: 'M6 18L18 6M6 6l12 12',
			variant: 'error',
			description: 'Terminate tmux session'
		}
	],
	completing: [
		{
			id: 'attach',
			label: 'Attach Terminal',
			icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
			variant: 'info',
			description: 'Watch completion progress'
		},
		{
			id: 'kill',
			label: 'Kill Session',
			icon: 'M6 18L18 6M6 6l12 12',
			variant: 'error',
			description: 'Terminate tmux session'
		}
	],
	'needs-input': [
		{
			id: 'attach',
			label: 'Attach Terminal',
			icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
			variant: 'warning',
			description: 'Open session to provide input'
		},
		{
			id: 'escape',
			label: 'Send Escape',
			icon: 'M9 9l6 6m0-6l-6 6m12-3a9 9 0 11-18 0 9 9 0 0118 0z',
			variant: 'default',
			description: 'Send Esc key to cancel prompt'
		},
		{
			id: 'kill',
			label: 'Kill Session',
			icon: 'M6 18L18 6M6 6l12 12',
			variant: 'error',
			description: 'Terminate tmux session'
		}
	],
	working: [
		{
			id: 'interrupt',
			label: 'Interrupt',
			icon: 'M15.75 5.25v13.5m-7.5-13.5v13.5',
			variant: 'warning',
			description: 'Send Ctrl+C to interrupt'
		},
		{
			id: 'attach',
			label: 'Attach Terminal',
			icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
			variant: 'info',
			description: 'Open session in terminal'
		},
		{
			id: 'kill',
			label: 'Kill Session',
			icon: 'M6 18L18 6M6 6l12 12',
			variant: 'error',
			description: 'Terminate tmux session'
		}
	],
	compacting: [
		{
			id: 'attach',
			label: 'Watch Progress',
			icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
			variant: 'info',
			description: 'Observe context compaction progress'
		},
		{
			id: 'kill',
			label: 'Force Kill',
			icon: 'M6 18L18 6M6 6l12 12',
			variant: 'error',
			description: 'Not recommended - may lose context'
		}
	],
	starting: [
		{
			id: 'attach',
			label: 'Attach Terminal',
			icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
			variant: 'info',
			description: 'Open session in terminal'
		},
		{
			id: 'interrupt',
			label: 'Cancel Start',
			icon: 'M15.75 5.25v13.5m-7.5-13.5v13.5',
			variant: 'warning',
			description: 'Send Ctrl+C to cancel'
		},
		{
			id: 'kill',
			label: 'Kill Session',
			icon: 'M6 18L18 6M6 6l12 12',
			variant: 'error',
			description: 'Terminate tmux session'
		}
	],
	idle: [
		{
			id: 'cleanup',
			label: 'Close Session',
			icon: 'M6 18L18 6M6 6l12 12',
			variant: 'error',
			description: 'Kill tmux session'
		},
		{
			id: 'attach',
			label: 'Attach Terminal',
			icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
			variant: 'info',
			description: 'Open session in terminal'
		}
	]
};

/**
 * Get session state visual config with fallback
 */
export function getSessionStateVisual(state: string): SessionStateVisual {
	return SESSION_STATE_VISUALS[state] || SESSION_STATE_VISUALS.idle;
}

/**
 * Get session state actions with fallback
 */
export function getSessionStateActions(state: string): SessionStateAction[] {
	return SESSION_STATE_ACTIONS[state] || SESSION_STATE_ACTIONS.idle;
}

// =============================================================================
// SERVER SESSION STATE VISUAL CONFIG
// =============================================================================
//
// Configuration for server session states (dev servers like npm run dev).
// Used by ServerStatusBadge and SessionCard in server mode.
//
// States:
// - running: Server is active and responding (port is listening)
// - starting: Server is booting up (tmux session exists, port not yet listening)
// - stopped: No tmux session for this server

export type ServerState = 'running' | 'starting' | 'stopped';

export interface ServerStateVisual {
	// Display
	label: string;                 // Display label with emoji (e.g., "🟢 RUNNING")
	shortLabel: string;            // Short label without emoji (e.g., "Running")

	// Badge colors (for ServerStatusBadge)
	bgColor: string;               // Background color (oklch with alpha)
	textColor: string;             // Text color (oklch)
	borderColor: string;           // Border color (oklch with alpha)
	pulse?: boolean;               // Whether to animate with pulse

	// SessionCard accent bar colors (for server mode)
	accent: string;                // Vibrant accent color for bars/highlights
	bgTint: string;                // Subtle background tint
	glow: string;                  // Glow effect color (for active states)

	// SVG path for icon
	icon: string;
}

export const SERVER_STATE_VISUALS: Record<ServerState, ServerStateVisual> = {
	running: {
		label: '🟢 RUNNING',
		shortLabel: 'Running',
		// Badge colors - vibrant green
		bgColor: 'oklch(0.45 0.18 145 / 0.3)',
		textColor: 'oklch(0.80 0.15 145)',
		borderColor: 'oklch(0.45 0.18 145 / 0.5)',
		// SessionCard accent colors
		accent: 'oklch(0.70 0.20 145)',
		bgTint: 'oklch(0.70 0.20 145 / 0.08)',
		glow: 'oklch(0.70 0.20 145 / 0.4)',
		// Play/running icon
		icon: 'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z'
	},
	starting: {
		label: '🟡 STARTING',
		shortLabel: 'Starting',
		pulse: true,
		// Badge colors - amber/yellow
		bgColor: 'oklch(0.55 0.18 85 / 0.3)',
		textColor: 'oklch(0.85 0.15 85)',
		borderColor: 'oklch(0.55 0.18 85 / 0.5)',
		// SessionCard accent colors
		accent: 'oklch(0.75 0.18 85)',
		bgTint: 'oklch(0.75 0.18 85 / 0.08)',
		glow: 'oklch(0.75 0.18 85 / 0.4)',
		// Loading/spinner icon
		icon: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99'
	},
	stopped: {
		label: '⏹️ STOPPED',
		shortLabel: 'Stopped',
		// Badge colors - muted/gray
		bgColor: 'oklch(0.5 0 0 / 0.1)',
		textColor: 'oklch(0.60 0.02 250)',
		borderColor: 'oklch(0.5 0 0 / 0.2)',
		// SessionCard accent colors
		accent: 'oklch(0.55 0.05 250)',
		bgTint: 'oklch(0.55 0.05 250 / 0.05)',
		glow: 'oklch(0.55 0.05 250 / 0.2)',
		// Stop/square icon
		icon: 'M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z'
	}
};

// =============================================================================
// SERVER SESSION STATE ACTIONS (ServerStatusBadge dropdown actions)
// =============================================================================

export interface ServerStateAction {
	id: string;
	label: string;
	icon: string;         // SVG path
	variant: 'default' | 'success' | 'warning' | 'error' | 'info';
	description?: string;
}

export const SERVER_STATE_ACTIONS: Record<ServerState, ServerStateAction[]> = {
	running: [
		{
			id: 'open',
			label: 'Open in Browser',
			icon: 'M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25',
			variant: 'success',
			description: 'Open localhost in browser'
		},
		{
			id: 'stop',
			label: 'Stop Server',
			icon: 'M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z',
			variant: 'error',
			description: 'Stop the dev server'
		},
		{
			id: 'restart',
			label: 'Restart Server',
			icon: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99',
			variant: 'warning',
			description: 'Restart the dev server'
		},
		{
			id: 'attach',
			label: 'Attach Terminal',
			icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
			variant: 'info',
			description: 'Open server output in terminal'
		}
	],
	starting: [
		{
			id: 'attach',
			label: 'Attach Terminal',
			icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
			variant: 'info',
			description: 'Watch server startup'
		},
		{
			id: 'kill',
			label: 'Kill Process',
			icon: 'M6 18L18 6M6 6l12 12',
			variant: 'error',
			description: 'Force kill the server process'
		}
	],
	stopped: [
		{
			id: 'start',
			label: 'Start Server',
			icon: 'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z',
			variant: 'success',
			description: 'Start the dev server'
		}
	]
};

/**
 * Get server state visual config with fallback
 */
export function getServerStateVisual(state: ServerState | string): ServerStateVisual {
	return SERVER_STATE_VISUALS[state as ServerState] || SERVER_STATE_VISUALS.stopped;
}

/**
 * Get server state actions with fallback
 */
export function getServerStateActions(state: ServerState | string): ServerStateAction[] {
	return SERVER_STATE_ACTIONS[state as ServerState] || SERVER_STATE_ACTIONS.stopped;
}

// =============================================================================
// GROUP HEADER VISUAL CONFIG
// =============================================================================

/**
 * Grouping modes for task table
 * - type: Group by issue_type (bug, task, feature, etc.)
 * - parent: Group by parent task ID (for epic/subtask hierarchies)
 * - label: Group by first label
 * - project: Group by project first, then by epic within each project
 */
export type GroupingMode = 'type' | 'parent' | 'label' | 'project';

export interface GroupHeaderInfo {
	icon: string;         // Emoji or unicode icon for the group header
	label: string;        // Display label (uppercase)
	accent: string;       // Accent color for industrial theme headers
	bgTint: string;       // Background tint for the header
}

/**
 * Get group header visual info based on grouping mode
 *
 * @param mode - The grouping mode ('type', 'parent', 'label', or 'project')
 * @param groupKey - The key of the group (issue_type, parent ID, label name, or composite project::epic key)
 * @returns GroupHeaderInfo with icon, label, accent, and bgTint
 *
 * @example
 * // Type mode - uses issue type visuals
 * getGroupHeaderInfo('type', 'bug')
 * // → { icon: '🐛', label: 'BUG', accent: 'oklch(...)', bgTint: '...' }
 *
 * // Parent mode - uses folder icon
 * getGroupHeaderInfo('parent', 'jat-abc')
 * // → { icon: '📁', label: 'JAT-ABC', accent: 'oklch(...)', bgTint: '...' }
 *
 * // Label mode - uses tag icon
 * getGroupHeaderInfo('label', 'dashboard')
 * // → { icon: '🏷️', label: 'DASHBOARD', accent: 'oklch(...)', bgTint: '...' }
 *
 * // Project mode - uses composite key (project::epic)
 * getGroupHeaderInfo('project', 'jat::jat-abc')
 * // → { icon: '📁', label: 'JAT-ABC', accent: 'oklch(...)', bgTint: '...' }
 * getGroupHeaderInfo('project', 'jat::')
 * // → { icon: '📦', label: 'JAT', accent: 'oklch(...)', bgTint: '...' } // Project header
 */
export function getGroupHeaderInfo(mode: GroupingMode, groupKey: string | null): GroupHeaderInfo {
	switch (mode) {
		case 'type': {
			// Use existing issue type visuals
			const typeVisual = getIssueTypeVisual(groupKey);
			return {
				icon: typeVisual.icon,
				label: typeVisual.label,
				accent: typeVisual.accent,
				bgTint: typeVisual.bgTint
			};
		}

		case 'parent': {
			// Parent grouping - folder icon with purple accent
			if (!groupKey) {
				return {
					icon: '📋',
					label: 'STANDALONE',
					accent: 'oklch(0.60 0.05 250)',       // Muted slate for ungrouped
					bgTint: 'oklch(0.60 0.05 250 / 0.06)'
				};
			}
			return {
				icon: '📁',
				label: groupKey.toUpperCase(),
				accent: 'oklch(0.70 0.18 270)',           // Purple for hierarchy
				bgTint: 'oklch(0.70 0.18 270 / 0.08)'
			};
		}

		case 'label': {
			// Label grouping - tag icon with teal accent
			if (!groupKey) {
				return {
					icon: '📋',
					label: 'UNLABELED',
					accent: 'oklch(0.60 0.05 250)',       // Muted slate for unlabeled
					bgTint: 'oklch(0.60 0.05 250 / 0.06)'
				};
			}
			return {
				icon: '🏷️',
				label: groupKey.toUpperCase(),
				accent: 'oklch(0.68 0.16 185)',           // Teal for labels
				bgTint: 'oklch(0.68 0.16 185 / 0.08)'
			};
		}

		case 'project': {
			// Project mode uses composite key: "project::epic" or "project::" for project-level
			if (!groupKey) {
				return {
					icon: '📋',
					label: 'NO PROJECT',
					accent: 'oklch(0.60 0.05 250)',       // Muted slate for ungrouped
					bgTint: 'oklch(0.60 0.05 250 / 0.06)'
				};
			}
			const [project, epic] = groupKey.split('::');
			if (!epic) {
				// Project-level header
				return {
					icon: '📦',
					label: project.toUpperCase(),
					accent: 'oklch(0.70 0.15 140)',       // Green for projects
					bgTint: 'oklch(0.70 0.15 140 / 0.08)'
				};
			}
			// Epic-level header within project (nested)
			return {
				icon: '📁',
				label: epic.toUpperCase(),
				accent: 'oklch(0.70 0.18 270)',           // Purple for hierarchy (same as parent)
				bgTint: 'oklch(0.70 0.18 270 / 0.08)'
			};
		}

		default: {
			// Fallback
			return {
				icon: '📋',
				label: groupKey?.toUpperCase() || 'UNKNOWN',
				accent: 'oklch(0.60 0.05 250)',
				bgTint: 'oklch(0.60 0.05 250 / 0.06)'
			};
		}
	}
}
