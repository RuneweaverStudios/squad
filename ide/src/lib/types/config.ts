/**
 * Configuration Types
 *
 * Type definitions for slash commands, project configuration, and related settings
 * used throughout the IDE.
 *
 * @see commands/squad/ for slash command implementations
 * @see ~/.config/squad/projects.json for project configuration
 */

// =============================================================================
// SLASH COMMAND TYPES
// =============================================================================

/**
 * Frontmatter metadata from a slash command file.
 *
 * Slash commands can include YAML frontmatter with metadata:
 * ```md
 * ---
 * description: Start working on a task
 * author: squad
 * version: 1.0.0
 * tags: workflow, agent
 * ---
 * ```
 */
export interface CommandFrontmatter {
	/** Brief description of what the command does */
	description?: string;
	/** Author of the command */
	author?: string;
	/** Semantic version (e.g., "1.0.0") */
	version?: string;
	/** Comma-separated or array of tags for categorization */
	tags?: string | string[];
	/** Keyboard shortcut (e.g., "Alt+C", "Ctrl+Shift+S") */
	shortcut?: string;
	/** Hint for command arguments (e.g., "[agent-name | task-id]") */
	argumentHint?: string;
}

/**
 * A slash command definition.
 *
 * Slash commands are markdown files in `commands/` directories that
 * can be invoked via `/namespace:name` syntax.
 *
 * @example
 * ```typescript
 * const command: SlashCommand = {
 *   name: 'start',
 *   invocation: '/squad:start',
 *   namespace: 'squad',
 *   path: '~/code/squad/commands/squad/start.md',
 *   content: '# /squad:start - Begin Working\n...',
 *   frontmatter: {
 *     description: 'Start working on a task',
 *     tags: ['workflow', 'agent']
 *   }
 * };
 * ```
 */
export interface SlashCommand {
	/** Command name without namespace (e.g., "start", "complete") */
	name: string;
	/** Full invocation string (e.g., "/squad:start", "/squad:complete") */
	invocation: string;
	/** Namespace/category (e.g., "squad", "git") */
	namespace: string;
	/** Absolute path to the command file */
	path: string;
	/** Full content of the command file (optional, loaded on demand) */
	content?: string;
	/** Parsed frontmatter metadata (optional) */
	frontmatter?: CommandFrontmatter;
}

/**
 * A group of related slash commands.
 *
 * Commands are grouped by namespace for organization in the UI.
 *
 * @example
 * ```typescript
 * const group: CommandGroup = {
 *   namespace: 'squad',
 *   commands: [
 *     { name: 'start', invocation: '/squad:start', ... },
 *     { name: 'complete', invocation: '/squad:complete', ... }
 *   ],
 *   isExpanded: true
 * };
 * ```
 */
export interface CommandGroup {
	/** Namespace name (e.g., "squad", "git") */
	namespace: string;
	/** Commands in this group */
	commands: SlashCommand[];
	/** Whether this group is expanded in the UI */
	isExpanded: boolean;
}

// =============================================================================
// PROJECT CONFIGURATION TYPES
// =============================================================================

/**
 * Color configuration for a project.
 *
 * Used for visual distinction in the IDE.
 */
export interface ProjectColors {
	/** Color when project is active/running */
	active?: string;
	/** Color when project is inactive/stopped */
	inactive?: string;
}

/**
 * Project configuration from ~/.config/squad/projects.json.
 *
 * Defines how a project appears and behaves in the IDE.
 *
 * @example
 * ```typescript
 * const project: ProjectConfig = {
 *   name: 'SQUAD',
 *   path: '~/code/squad',
 *   port: 5174,
 *   server_path: '~/code/squad/ide',
 *   description: 'Jomarchy Agent Tools IDE',
 *   colors: {
 *     active: 'oklch(0.75 0.15 145)',
 *     inactive: 'oklch(0.55 0.10 145)'
 *   },
 *   hidden: false
 * };
 * ```
 */
/**
 * Project stats computed by the API.
 */
export interface ProjectStats {
	/** Whether the project has a .squad/ directory initialized */
	hasSquad: boolean;
	/** Whether the project has a CLAUDE.md or AGENTS.md file */
	hasClaudeMd: boolean;
	/** Number of active agents working on this project */
	agentCount: number;
	/** Total number of tasks */
	taskCount: number;
	/** Number of open tasks */
	openTaskCount: number;
	/** Whether the dev server is currently running */
	serverRunning: boolean;
}

export interface ProjectConfig {
	/** Display name for the project (e.g., "SQUAD", "Chimaro") */
	name: string;
	/** Absolute path to the project directory */
	path: string;
	/** Dev server port (optional, enables server controls) */
	port?: number;
	/** Path where `npm run dev` should be executed (optional, defaults to path) */
	server_path?: string;
	/** Brief description shown in IDE (optional) */
	description?: string;
	/** Color configuration for badges and highlights (optional) */
	colors?: ProjectColors;
	/** Database URL for database tools (optional) */
	database_url?: string;
	/** Whether to hide this project from default views (optional) */
	hidden?: boolean;
	/** Default agent harness for new tasks (optional, defaults to claude-code) */
	default_harness?: string;
	/** Project stats (optional, only when fetched with ?stats=true) */
	stats?: ProjectStats;
}

// =============================================================================
// CONFIGURATION FILE TYPES
// =============================================================================

/**
 * Root structure of ~/.config/squad/projects.json.
 *
 * @example
 * ```json
 * {
 *   "projects": {
 *     "squad": {
 *       "name": "SQUAD",
 *       "path": "~/code/squad",
 *       "port": 5174
 *     },
 *     "chimaro": {
 *       "name": "Chimaro",
 *       "path": "~/code/chimaro",
 *       "port": 5173
 *     }
 *   }
 * }
 * ```
 */
export interface ProjectsConfigFile {
	/** Map of project slug to configuration */
	projects: Record<string, ProjectConfig>;
}

// =============================================================================
// HOOKS CONFIGURATION TYPES
// =============================================================================

/**
 * Hook types that Claude Code supports.
 *
 * @see Claude Code documentation for hook behavior
 */
export type HookEventType =
	| 'PreToolUse'
	| 'PostToolUse'
	| 'UserPromptSubmit'
	| 'PreCompact'
	| 'SessionStart';

/**
 * A single hook command configuration.
 *
 * @example
 * ```typescript
 * const hook: HookCommand = {
 *   type: 'command',
 *   command: './.claude/hooks/my-hook.sh',
 *   statusMessage: 'Running hook...',
 *   streamStdinJson: true
 * };
 * ```
 */
export interface HookCommand {
	/** Hook type - currently only 'command' is supported */
	type: 'command';
	/** Shell command to execute */
	command: string;
	/** Optional status message shown while hook runs */
	statusMessage?: string;
	/** Whether to stream JSON input via stdin */
	streamStdinJson?: boolean;
}

/**
 * A hook entry with matcher pattern and associated hooks.
 *
 * @example
 * ```typescript
 * const entry: HookEntry = {
 *   matcher: '^Bash$',
 *   hooks: [
 *     { type: 'command', command: './.claude/hooks/post-bash.sh' }
 *   ]
 * };
 * ```
 */
export interface HookEntry {
	/** Regex pattern to match tool names (for PreToolUse/PostToolUse) or '.*' for all */
	matcher: string;
	/** Array of hook commands to execute when pattern matches */
	hooks: HookCommand[];
}

/**
 * Map of hook event types to their entries.
 */
export type HooksConfig = Partial<Record<HookEventType, HookEntry[]>>;

/**
 * StatusLine configuration from settings.json.
 */
export interface StatusLineConfig {
	type: 'command';
	command: string;
	padding?: number;
}

/**
 * Full Claude Code settings.json structure.
 *
 * @example
 * ```json
 * {
 *   "statusLine": {
 *     "type": "command",
 *     "command": "~/.claude/statusline.sh"
 *   },
 *   "hooks": {
 *     "PreToolUse": [...],
 *     "PostToolUse": [...]
 *   }
 * }
 * ```
 */
export interface ClaudeSettingsFile {
	statusLine?: StatusLineConfig;
	hooks?: HooksConfig;
}

// =============================================================================
// MCP SERVER CONFIGURATION TYPES
// =============================================================================

/**
 * MCP server transport type.
 *
 * - 'stdio': Server runs as subprocess with stdio transport
 * - 'http': Server connects via HTTP/SSE transport
 */
export type McpTransportType = 'stdio' | 'http';

/**
 * Configuration for an MCP server using stdio transport.
 *
 * @example
 * ```typescript
 * const server: McpServerStdio = {
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-filesystem'],
 *   env: { HOME: '/home/user' }
 * };
 * ```
 */
export interface McpServerStdio {
	/** Command to run the MCP server */
	command: string;
	/** Command-line arguments (optional) */
	args?: string[];
	/** Environment variables (optional) */
	env?: Record<string, string>;
	/** Timeout in milliseconds (optional, default: 60000) */
	timeout?: number;
	/** Whether the server is disabled (optional) */
	disabled?: boolean;
}

/**
 * Configuration for an MCP server using HTTP transport.
 *
 * @example
 * ```typescript
 * const server: McpServerHttp = {
 *   type: 'http',
 *   url: 'https://mcp.supabase.com/mcp'
 * };
 * ```
 */
export interface McpServerHttp {
	/** Transport type - must be 'http' */
	type: 'http';
	/** URL endpoint for the MCP server */
	url: string;
	/** HTTP headers to send with requests (optional) */
	headers?: Record<string, string>;
	/** Timeout in milliseconds (optional, default: 60000) */
	timeout?: number;
	/** Whether the server is disabled (optional) */
	disabled?: boolean;
	/** Tools to auto-approve without confirmation (optional) */
	autoApprove?: string[];
	/** Tools to disable (optional) */
	disabledTools?: string[];
}

/**
 * Union type for MCP server configuration.
 *
 * Stdio servers have 'command' property, HTTP servers have 'type: http' and 'url'.
 */
export type McpServerConfig = McpServerStdio | McpServerHttp;

/**
 * Root structure of .mcp.json file.
 *
 * @example
 * ```json
 * {
 *   "mcpServers": {
 *     "filesystem": {
 *       "command": "npx",
 *       "args": ["-y", "@modelcontextprotocol/server-filesystem"]
 *     },
 *     "supabase": {
 *       "type": "http",
 *       "url": "https://mcp.supabase.com/mcp"
 *     }
 *   }
 * }
 * ```
 */
export interface McpConfigFile {
	/** Map of server name to configuration */
	mcpServers: Record<string, McpServerConfig>;
}

/**
 * Helper type to check if an MCP server uses HTTP transport.
 */
export function isMcpServerHttp(server: McpServerConfig): server is McpServerHttp {
	return 'type' in server && server.type === 'http';
}

/**
 * Helper type to check if an MCP server uses stdio transport.
 */
export function isMcpServerStdio(server: McpServerConfig): server is McpServerStdio {
	return 'command' in server && !('type' in server);
}
