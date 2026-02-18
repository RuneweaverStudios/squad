/**
 * Spawn Configuration
 * Settings for agent spawning
 */

// Default model for spawned agents
// Valid aliases: 'opus', 'sonnet', 'haiku' or full IDs like 'claude-opus-4-5-20250514'
export const DEFAULT_MODEL = 'opus';

// NOTE: skip_permissions is now in ~/.config/squad/projects.json under defaults.skip_permissions
// It defaults to FALSE - user must manually accept YOLO warning once, then enable it in config

// Agent Mail server URL (for inter-agent communication)
export const AGENT_MAIL_URL = 'http://localhost:8765';

// Maximum concurrent tmux sessions (system limit)
export const MAX_TMUX_SESSIONS = 12;

// Default number of agents to spawn (if enough tasks available)
export const DEFAULT_AGENT_COUNT = 4;

// Minimum agents (always allow at least 1)
export const MIN_AGENT_COUNT = 1;

// Stagger delay between spawns (ms) to avoid overwhelming system
// Must be longer than Claude init time (5s) to ensure sequential spawns
export const SPAWN_STAGGER_MS = 6000;

// Claude startup timeout (seconds) - how long to wait for Claude Code TUI to be ready
// Can be overridden in ~/.config/squad/projects.json under defaults.claude_startup_timeout
export const CLAUDE_STARTUP_TIMEOUT_SECONDS = 20;
