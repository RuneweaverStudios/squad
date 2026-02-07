/**
 * Signal Card Design Tokens
 *
 * Shared visual tokens for signal/session state cards.
 * Used by both the IDE (interactive) and marketing (preview).
 *
 * This is the SINGLE SOURCE OF TRUTH for signal card visuals.
 * When colors change here, both IDE and marketing update.
 *
 * @see ide/src/lib/config/statusColors.ts - Full IDE implementation
 * @see marketing/src/routes/flywheel/ - Marketing flywheel visualization
 */

// =============================================================================
// FLYWHEEL STAGE TOKENS
// =============================================================================
//
// The 9 stages of the agentic flywheel, each with visual tokens.
// These map to (but extend beyond) the signal states.

export interface FlywheelStageTokens {
  // Identity
  num: number;
  id: string;           // Machine ID: 'plan', 'tasktree', 'swarm', etc.
  title: string;        // Display title: 'PLAN', 'TASKTREE', etc.
  desc: string;         // Short description: 'Idea → PRD', '/jat:tasktree', etc.

  // Signal mapping (null for pre/post signal stages)
  signalState: string | null;

  // Colors (oklch for perceptual uniformity)
  colors: {
    primary: string;      // Main accent color
    primaryDim: string;   // Dimmed version (for borders, subtle elements)
    bg: string;           // Background tint (with alpha)
    glow: string;         // Glow effect (with alpha)
    text: string;         // Text color on dark backgrounds
  };

  // Tailwind gradient classes (for quick styling)
  // NOTE: These only work in static contexts - use cssGradient for dynamic interpolation
  bgGradient: string;

  // CSS gradient value (for inline styles - works with dynamic interpolation)
  cssGradient: string;

  // Icon
  icon: string;           // Emoji or identifier
  iconType: 'emoji' | 'svg' | 'spinner';
}

export const FLYWHEEL_STAGES: FlywheelStageTokens[] = [
  {
    num: 1,
    id: 'plan',
    title: 'PLAN',
    desc: 'Idea → PRD',
    signalState: null,  // Pre-signal: human ideation
    colors: {
      primary: 'oklch(0.70 0.18 220)',      // Sky blue
      primaryDim: 'oklch(0.60 0.12 220)',
      bg: 'oklch(0.70 0.18 220 / 0.10)',
      glow: 'oklch(0.70 0.18 220 / 0.40)',
      text: 'oklch(0.95 0.02 220)',
    },
    bgGradient: 'from-sky-500 to-cyan-500',
    cssGradient: 'linear-gradient(to right, #0ea5e9, #06b6d4)',
    icon: '💭',
    iconType: 'emoji',
  },
  {
    num: 2,
    id: 'tasktree',
    title: 'TASKTREE',
    desc: '/jat:tasktree',
    signalState: null,  // Pre-signal: task creation
    colors: {
      primary: 'oklch(0.72 0.16 195)',      // Cyan
      primaryDim: 'oklch(0.62 0.10 195)',
      bg: 'oklch(0.72 0.16 195 / 0.10)',
      glow: 'oklch(0.72 0.16 195 / 0.40)',
      text: 'oklch(0.95 0.02 195)',
    },
    bgGradient: 'from-cyan-500 to-teal-500',
    cssGradient: 'linear-gradient(to right, #06b6d4, #14b8a6)',
    icon: '🌳',
    iconType: 'emoji',
  },
  {
    num: 3,
    id: 'swarm',
    title: 'SWARM',
    desc: 'Epic Swarm',
    signalState: 'starting',
    colors: {
      primary: 'oklch(0.72 0.18 175)',      // Teal
      primaryDim: 'oklch(0.62 0.12 175)',
      bg: 'oklch(0.72 0.18 175 / 0.10)',
      glow: 'oklch(0.72 0.18 175 / 0.40)',
      text: 'oklch(0.95 0.02 175)',
    },
    bgGradient: 'from-teal-500 to-emerald-500',
    cssGradient: 'linear-gradient(to right, #14b8a6, #10b981)',
    icon: '🤖',
    iconType: 'emoji',
  },
  {
    num: 4,
    id: 'working',
    title: 'WORKING',
    desc: 'working signal',
    signalState: 'working',
    colors: {
      primary: 'oklch(0.75 0.18 145)',      // Emerald/Green
      primaryDim: 'oklch(0.65 0.12 145)',
      bg: 'oklch(0.75 0.18 145 / 0.10)',
      glow: 'oklch(0.75 0.18 145 / 0.40)',
      text: 'oklch(0.95 0.02 145)',
    },
    bgGradient: 'from-emerald-500 to-green-500',
    cssGradient: 'linear-gradient(to right, #10b981, #22c55e)',
    icon: '⚡',
    iconType: 'emoji',
  },
  {
    num: 5,
    id: 'input',
    title: 'INPUT',
    desc: 'needs_input signal',
    signalState: 'needs-input',
    colors: {
      primary: 'oklch(0.75 0.20 130)',      // Lime/Green
      primaryDim: 'oklch(0.65 0.14 130)',
      bg: 'oklch(0.75 0.20 130 / 0.10)',
      glow: 'oklch(0.75 0.20 130 / 0.40)',
      text: 'oklch(0.95 0.02 130)',
    },
    bgGradient: 'from-green-500 to-lime-500',
    cssGradient: 'linear-gradient(to right, #22c55e, #84cc16)',
    icon: '❓',
    iconType: 'emoji',
  },
  {
    num: 6,
    id: 'review',
    title: 'REVIEW',
    desc: 'review signal',
    signalState: 'ready-for-review',
    colors: {
      primary: 'oklch(0.80 0.18 100)',      // Lime/Yellow
      primaryDim: 'oklch(0.70 0.12 100)',
      bg: 'oklch(0.80 0.18 100 / 0.10)',
      glow: 'oklch(0.80 0.18 100 / 0.40)',
      text: 'oklch(0.20 0.02 100)',         // Dark text on light bg
    },
    bgGradient: 'from-lime-500 to-yellow-500',
    cssGradient: 'linear-gradient(to right, #84cc16, #eab308)',
    icon: '📝',
    iconType: 'emoji',
  },
  {
    num: 7,
    id: 'complete',
    title: 'COMPLETE',
    desc: '/jat:complete',
    signalState: 'completing',
    colors: {
      primary: 'oklch(0.70 0.20 145)',      // Green (completion)
      primaryDim: 'oklch(0.60 0.14 145)',
      bg: 'oklch(0.70 0.20 145 / 0.10)',
      glow: 'oklch(0.70 0.20 145 / 0.40)',
      text: 'oklch(0.95 0.02 145)',
    },
    bgGradient: 'from-green-500 to-emerald-500',
    cssGradient: 'linear-gradient(to right, #22c55e, #10b981)',
    icon: '✅',
    iconType: 'emoji',
  },
  {
    num: 8,
    id: 'auto',
    title: 'AUTO',
    desc: 'auto_proceed',
    signalState: 'auto-proceeding',
    colors: {
      primary: 'oklch(0.75 0.20 55)',       // Orange
      primaryDim: 'oklch(0.65 0.14 55)',
      bg: 'oklch(0.75 0.20 55 / 0.10)',
      glow: 'oklch(0.75 0.20 55 / 0.40)',
      text: 'oklch(0.95 0.02 55)',
    },
    bgGradient: 'from-amber-500 to-orange-500',
    cssGradient: 'linear-gradient(to right, #f59e0b, #f97316)',
    icon: '🚀',
    iconType: 'emoji',
  },
  {
    num: 9,
    id: 'suggest',
    title: 'SUGGEST',
    desc: 'suggestedTasks',
    signalState: null,  // Post-signal: new task suggestion
    colors: {
      primary: 'oklch(0.72 0.22 350)',      // Pink
      primaryDim: 'oklch(0.62 0.16 350)',
      bg: 'oklch(0.72 0.22 350 / 0.10)',
      glow: 'oklch(0.72 0.22 350 / 0.40)',
      text: 'oklch(0.95 0.02 350)',
    },
    bgGradient: 'from-orange-500 to-pink-500',
    cssGradient: 'linear-gradient(to right, #f97316, #ec4899)',
    icon: '✨',
    iconType: 'emoji',
  },
];

// =============================================================================
// SIGNAL STATE TOKENS
// =============================================================================
//
// Core signal states from the IDE.
// These are the actual states that agents emit.

export interface SignalStateTokens {
  id: string;
  label: string;
  shortLabel: string;

  // Colors
  colors: {
    bg: string;           // Background (with alpha)
    text: string;         // Text color
    border: string;       // Border color (with alpha)
    accent: string;       // Solid accent
    glow: string;         // Glow effect
  };

  // Behavior
  pulse?: boolean;        // Should animate with pulse
  spinner?: boolean;      // Should show spinner

  // Icon
  icon: string;
  iconType: 'emoji' | 'svg';
}

export const SIGNAL_STATES: Record<string, SignalStateTokens> = {
  starting: {
    id: 'starting',
    label: '🚀 STARTING',
    shortLabel: 'Starting',
    colors: {
      bg: 'oklch(0.60 0.15 200 / 0.30)',
      text: 'oklch(0.90 0.12 200)',
      border: 'oklch(0.60 0.15 200 / 0.50)',
      accent: 'oklch(0.75 0.15 200)',
      glow: 'oklch(0.75 0.15 200 / 0.50)',
    },
    spinner: true,
    icon: '🚀',
    iconType: 'emoji',
  },
  working: {
    id: 'working',
    label: '🔧 WORKING',
    shortLabel: 'Working',
    colors: {
      bg: 'oklch(0.55 0.15 250 / 0.30)',
      text: 'oklch(0.90 0.12 250)',
      border: 'oklch(0.55 0.15 250 / 0.50)',
      accent: 'oklch(0.70 0.18 250)',
      glow: 'oklch(0.70 0.18 250 / 0.40)',
    },
    spinner: true,
    icon: '🔧',
    iconType: 'emoji',
  },
  'needs-input': {
    id: 'needs-input',
    label: '❓ INPUT',
    shortLabel: 'Needs Input',
    colors: {
      bg: 'oklch(0.60 0.20 45 / 0.30)',
      text: 'oklch(0.90 0.15 45)',
      border: 'oklch(0.60 0.20 45 / 0.50)',
      accent: 'oklch(0.75 0.20 45)',
      glow: 'oklch(0.75 0.20 45 / 0.50)',
    },
    pulse: true,
    icon: '❓',
    iconType: 'emoji',
  },
  'ready-for-review': {
    id: 'ready-for-review',
    label: '🔍 REVIEW',
    shortLabel: 'Review',
    colors: {
      bg: 'oklch(0.55 0.18 85 / 0.30)',
      text: 'oklch(0.85 0.15 85)',
      border: 'oklch(0.55 0.18 85 / 0.50)',
      accent: 'oklch(0.70 0.20 85)',
      glow: 'oklch(0.70 0.20 85 / 0.40)',
    },
    pulse: true,
    icon: '🔍',
    iconType: 'emoji',
  },
  completing: {
    id: 'completing',
    label: '⏳ COMPLETING',
    shortLabel: 'Completing',
    colors: {
      bg: 'oklch(0.50 0.12 175 / 0.30)',
      text: 'oklch(0.85 0.12 175)',
      border: 'oklch(0.50 0.12 175 / 0.50)',
      accent: 'oklch(0.65 0.15 175)',
      glow: 'oklch(0.65 0.15 175 / 0.40)',
    },
    spinner: true,
    icon: '⏳',
    iconType: 'emoji',
  },
  completed: {
    id: 'completed',
    label: '✅ COMPLETE',
    shortLabel: 'Complete',
    colors: {
      bg: 'oklch(0.45 0.18 145 / 0.30)',
      text: 'oklch(0.80 0.15 145)',
      border: 'oklch(0.45 0.18 145 / 0.50)',
      accent: 'oklch(0.70 0.20 145)',
      glow: 'oklch(0.70 0.20 145 / 0.40)',
    },
    icon: '✅',
    iconType: 'emoji',
  },
  'auto-proceeding': {
    id: 'auto-proceeding',
    label: '🚀 SPAWNING NEXT',
    shortLabel: 'Spawning',
    colors: {
      bg: 'oklch(0.50 0.20 160 / 0.30)',
      text: 'oklch(0.85 0.18 160)',
      border: 'oklch(0.50 0.20 160 / 0.50)',
      accent: 'oklch(0.75 0.22 160)',
      glow: 'oklch(0.75 0.22 160 / 0.50)',
    },
    pulse: true,
    icon: '🚀',
    iconType: 'emoji',
  },
  idle: {
    id: 'idle',
    label: '💤 IDLE',
    shortLabel: 'Idle',
    colors: {
      bg: 'oklch(0.50 0 0 / 0.10)',
      text: 'oklch(0.60 0.02 250)',
      border: 'oklch(0.50 0 0 / 0.20)',
      accent: 'oklch(0.55 0.05 250)',
      glow: 'oklch(0.55 0.05 250 / 0.20)',
    },
    icon: '💤',
    iconType: 'emoji',
  },
};

// =============================================================================
// CARD STRUCTURE TOKENS
// =============================================================================
//
// Shared structural patterns for signal cards.

export const CARD_STRUCTURE = {
  // Border radius
  borderRadius: {
    card: '0.75rem',      // 12px - main card
    badge: '9999px',      // pill shape
    inner: '0.5rem',      // 8px - inner elements
  },

  // Spacing
  spacing: {
    cardPadding: '1rem',
    headerPadding: '0.75rem 1rem',
    badgeGap: '0.5rem',
  },

  // Typography
  typography: {
    taskId: {
      size: '0.625rem',   // 10px
      weight: '600',
      family: 'monospace',
    },
    title: {
      size: '0.875rem',   // 14px
      weight: '600',
    },
    description: {
      size: '0.6875rem',  // 11px
      weight: '400',
    },
    badge: {
      size: '0.625rem',   // 10px
      weight: '700',
    },
  },

  // Shadows
  shadows: {
    card: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    cardHover: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
    glow: (color: string) => `0 0 20px ${color}`,
  },
};

// =============================================================================
// PRIORITY TOKENS
// =============================================================================

export const PRIORITY_TOKENS = {
  P0: {
    label: 'P0',
    name: 'Critical',
    colors: {
      bg: 'oklch(0.55 0.22 25)',
      text: 'oklch(0.98 0.01 25)',
    },
  },
  P1: {
    label: 'P1',
    name: 'High',
    colors: {
      bg: 'oklch(0.65 0.18 55)',
      text: 'oklch(0.15 0.01 55)',
    },
  },
  P2: {
    label: 'P2',
    name: 'Medium',
    colors: {
      bg: 'oklch(0.60 0.15 220)',
      text: 'oklch(0.98 0.01 220)',
    },
  },
  P3: {
    label: 'P3',
    name: 'Low',
    colors: {
      bg: 'oklch(0.45 0.05 250)',
      text: 'oklch(0.85 0.02 250)',
    },
  },
  P4: {
    label: 'P4',
    name: 'Lowest',
    colors: {
      bg: 'oklch(0.35 0.02 250)',
      text: 'oklch(0.70 0.02 250)',
    },
  },
};

// =============================================================================
// TASK TYPE TOKENS
// =============================================================================

export const TASK_TYPE_TOKENS = {
  bug: {
    icon: '🐛',
    label: 'BUG',
    colors: {
      accent: 'oklch(0.65 0.25 25)',
      bg: 'oklch(0.65 0.25 25 / 0.08)',
    },
  },
  feature: {
    icon: '✨',
    label: 'FEATURE',
    colors: {
      accent: 'oklch(0.75 0.18 145)',
      bg: 'oklch(0.75 0.18 145 / 0.08)',
    },
  },
  task: {
    icon: '📋',
    label: 'TASK',
    colors: {
      accent: 'oklch(0.70 0.14 250)',
      bg: 'oklch(0.70 0.14 250 / 0.08)',
    },
  },
  chore: {
    icon: '🔧',
    label: 'CHORE',
    colors: {
      accent: 'oklch(0.65 0.05 250)',
      bg: 'oklch(0.65 0.05 250 / 0.06)',
    },
  },
  epic: {
    icon: '🏔️',
    label: 'EPIC',
    colors: {
      accent: 'oklch(0.70 0.20 300)',
      bg: 'oklch(0.70 0.20 300 / 0.08)',
    },
  },
};

// =============================================================================
// SIGNAL BADGE TOKENS
// =============================================================================
//
// Emblematic badge/button styles for signal events.
// Used in flywheel visualization and session cards.

export const SIGNAL_BADGE = {
  // Structure
  structure: {
    borderRadius: '9999px',        // pill shape
    paddingX: '1rem',              // 16px horizontal
    paddingY: '0.5rem',            // 8px vertical
    gap: '0.5rem',                 // 8px between icon and text
    minWidth: '120px',
  },

  // Typography
  typography: {
    fontSize: '0.875rem',          // 14px
    fontWeight: '600',
    letterSpacing: '0.025em',
    textTransform: 'uppercase' as const,
  },

  // Icon
  icon: {
    size: '1.25rem',               // 20px
  },

  // Effects
  effects: {
    // Glow intensity multiplier
    glowIntensity: 0.5,
    // Border width
    borderWidth: '2px',
    // Shadow
    shadow: '0 4px 12px -2px',
    shadowAlpha: 0.3,
  },

  // Generate inline styles for a signal badge
  getStyles: (colors: { primary: string; bg: string; glow: string }) => ({
    background: colors.bg,
    color: colors.primary,
    border: `2px solid ${colors.primary}`,
    boxShadow: `0 4px 12px -2px ${colors.glow}, 0 0 20px ${colors.glow}`,
  }),
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get flywheel stage by number (1-9)
 */
export function getFlywheelStage(num: number): FlywheelStageTokens | undefined {
  return FLYWHEEL_STAGES.find(s => s.num === num);
}

/**
 * Get flywheel stage by ID
 */
export function getFlywheelStageById(id: string): FlywheelStageTokens | undefined {
  return FLYWHEEL_STAGES.find(s => s.id === id);
}

/**
 * Get signal state tokens
 */
export function getSignalState(state: string): SignalStateTokens {
  return SIGNAL_STATES[state] || SIGNAL_STATES.idle;
}

/**
 * Map flywheel stage to signal state (if applicable)
 */
export function flywheelToSignalState(stageId: string): SignalStateTokens | null {
  const stage = getFlywheelStageById(stageId);
  if (!stage || !stage.signalState) return null;
  return SIGNAL_STATES[stage.signalState] || null;
}

/**
 * Get priority tokens
 */
export function getPriorityTokens(priority: number): typeof PRIORITY_TOKENS.P0 {
  const key = `P${priority}` as keyof typeof PRIORITY_TOKENS;
  return PRIORITY_TOKENS[key] || PRIORITY_TOKENS.P3;
}

/**
 * Get task type tokens
 */
export function getTaskTypeTokens(type: string): typeof TASK_TYPE_TOKENS.task {
  return TASK_TYPE_TOKENS[type as keyof typeof TASK_TYPE_TOKENS] || TASK_TYPE_TOKENS.task;
}
