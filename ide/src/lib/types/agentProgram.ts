/**
 * Agent Program Types
 *
 * Type definitions for agent-agnostic orchestration system.
 * Supports multiple AI coding assistants (Claude Code, Codex, Gemini Code, etc.)
 * with configurable routing rules based on task attributes.
 *
 * Storage: ~/.config/jat/agents.json
 *
 * @see shared/agent-programs.md for architecture documentation
 * @see ide/CLAUDE.md "Agent Programs" section for UI documentation
 */

// =============================================================================
// AGENT PROGRAM TYPES
// =============================================================================

/**
 * Authentication type for an agent program.
 *
 * - 'subscription': Uses CLI tool's built-in auth (e.g., `claude auth`)
 * - 'api_key': Requires API key from credentials vault
 * - 'none': No authentication required (local models)
 */
export type AgentAuthType = 'subscription' | 'api_key' | 'none';

/**
 * API key provider reference for agents using 'api_key' auth.
 *
 * References keys stored in ~/.config/jat/credentials.json
 */
export type ApiKeyProvider = 'anthropic' | 'openai' | 'google' | string;

/**
 * Model configuration for an agent program.
 *
 * Each agent can support multiple models with different capabilities.
 *
 * @example
 * ```typescript
 * const sonnetModel: AgentModel = {
 *   id: 'claude-sonnet-4-20250514',
 *   name: 'Sonnet 4',
 *   shortName: 'sonnet',
 *   description: 'Balanced performance and cost',
 *   capabilities: ['coding', 'reasoning', 'vision'],
 *   costTier: 'medium'
 * };
 * ```
 */
export interface AgentModel {
	/** Full model identifier (e.g., 'claude-sonnet-4-20250514', 'gpt-4o') */
	id: string;

	/** Display name (e.g., 'Sonnet 4', 'GPT-4o') */
	name: string;

	/** Short name for CLI/UI (e.g., 'sonnet', 'opus', 'haiku') */
	shortName: string;

	/** Optional description of model capabilities */
	description?: string;

	/** Capability tags for routing decisions */
	capabilities?: string[];

	/** Cost tier hint for routing (optional) */
	costTier?: 'low' | 'medium' | 'high';
}

/**
 * An AI coding assistant program configuration.
 *
 * Represents a single AI tool that can be spawned to work on tasks.
 *
 * @example
 * ```typescript
 * const claudeCode: AgentProgram = {
 *   id: 'claude-code',
 *   name: 'Claude Code',
 *   command: 'claude',
 *   models: [
 *     { id: 'claude-opus-4-5-20251101', name: 'Opus 4.5', shortName: 'opus', costTier: 'high' },
 *     { id: 'claude-sonnet-4-20250514', name: 'Sonnet 4', shortName: 'sonnet', costTier: 'medium' },
 *     { id: 'claude-3-5-haiku-20241022', name: 'Haiku', shortName: 'haiku', costTier: 'low' }
 *   ],
 *   defaultModel: 'opus',
 *   flags: ['--dangerously-skip-permissions'],
 *   authType: 'subscription',
 *   enabled: true,
 *   isDefault: true
 * };
 * ```
 */
export interface AgentProgram {
	/** Unique identifier (e.g., 'claude-code', 'codex', 'gemini-code') */
	id: string;

	/** Display name (e.g., 'Claude Code', 'OpenAI Codex') */
	name: string;

	/** CLI command to execute (e.g., 'claude', 'codex', 'gemini') */
	command: string;

	/** Available models for this agent */
	models: AgentModel[];

	/** Default model shortName when none specified */
	defaultModel: string;

	/** Additional CLI flags to pass (e.g., ['--dangerously-skip-permissions']) */
	flags: string[];

	/** Authentication type */
	authType: AgentAuthType;

	/**
	 * API key provider for 'api_key' auth type.
	 * References credentials stored in ~/.config/jat/credentials.json
	 */
	apiKeyProvider?: ApiKeyProvider;

	/**
	 * Environment variable name for API key injection.
	 * Used when authType is 'api_key'.
	 * Example: 'OPENAI_API_KEY' for Codex
	 */
	apiKeyEnvVar?: string;

	/** Whether this agent is enabled for use */
	enabled: boolean;

	/** Whether this is the default agent for unmatched tasks */
	isDefault: boolean;

	/**
	 * Optional: Path to CLAUDE.md or equivalent instructions file.
	 * Passed to agent via --append-system-prompt or similar.
	 */
	instructionsFile?: string;

	/**
	 * Optional: Startup command pattern.
	 * Use {model}, {flags}, {task}, {project} as placeholders.
	 * Default: '{command} --model {model} {flags}'
	 */
	startupPattern?: string;

	/**
	 * Optional: How to send the initial task to this agent.
	 * - 'stdin': Pipe task info to stdin
	 * - 'prompt': Send as initial prompt after startup
	 * - 'argument': Pass as CLI argument
	 * Default: 'prompt'
	 */
	taskInjection?: 'stdin' | 'prompt' | 'argument';

	/** Order in the agent list (lower = higher priority for fallback) */
	order?: number;

	/** Creation timestamp */
	createdAt?: string;

	/** Last update timestamp */
	updatedAt?: string;
}

// =============================================================================
// ROUTING RULE TYPES
// =============================================================================

/**
 * Condition type for routing rules.
 *
 * - 'label': Match task labels (e.g., 'security', 'frontend')
 * - 'type': Match task type (e.g., 'bug', 'feature', 'chore')
 * - 'priority': Match task priority (e.g., 0, 1, 2, 3)
 * - 'project': Match project name
 * - 'epic': Match if task is part of specific epic
 */
export type RoutingConditionType = 'label' | 'type' | 'priority' | 'project' | 'epic';

/**
 * Comparison operator for routing conditions.
 *
 * - 'equals': Exact match
 * - 'contains': Value contains (for labels, strings)
 * - 'startsWith': Value starts with
 * - 'regex': Regular expression match
 * - 'lt', 'lte', 'gt', 'gte': Numeric comparisons (for priority)
 */
export type RoutingOperator = 'equals' | 'contains' | 'startsWith' | 'regex' | 'lt' | 'lte' | 'gt' | 'gte';

/**
 * A single condition in a routing rule.
 *
 * @example
 * ```typescript
 * // Match tasks with 'security' label
 * const labelCondition: RoutingCondition = {
 *   type: 'label',
 *   operator: 'contains',
 *   value: 'security'
 * };
 *
 * // Match high priority tasks
 * const priorityCondition: RoutingCondition = {
 *   type: 'priority',
 *   operator: 'lte',
 *   value: '1'
 * };
 * ```
 */
export interface RoutingCondition {
	/** What task attribute to match */
	type: RoutingConditionType;

	/** How to compare (defaults to 'equals') */
	operator?: RoutingOperator;

	/** Value to match against */
	value: string;
}

/**
 * A routing rule that maps task attributes to agent selection.
 *
 * Rules are evaluated in order; first match wins.
 * Use multiple conditions for AND logic (all must match).
 *
 * @example
 * ```typescript
 * // Route security bugs to Opus
 * const securityRule: AgentRoutingRule = {
 *   id: 'security-bugs',
 *   name: 'Security Issues',
 *   description: 'Use Opus for security-related work',
 *   conditions: [
 *     { type: 'label', operator: 'contains', value: 'security' },
 *     { type: 'type', operator: 'equals', value: 'bug' }
 *   ],
 *   agentId: 'claude-code',
 *   modelOverride: 'opus',
 *   enabled: true,
 *   order: 1
 * };
 * ```
 */
export interface AgentRoutingRule {
	/** Unique identifier */
	id: string;

	/** Display name for the rule */
	name: string;

	/** Optional description */
	description?: string;

	/**
	 * Conditions to match (AND logic - all must match).
	 * Empty array = matches all tasks.
	 */
	conditions: RoutingCondition[];

	/** Agent program to use when rule matches */
	agentId: string;

	/**
	 * Optional model override within the selected agent.
	 * Uses agent's defaultModel if not specified.
	 */
	modelOverride?: string;

	/** Whether this rule is enabled */
	enabled: boolean;

	/** Order in rule list (lower = evaluated first) */
	order: number;

	/** Creation timestamp */
	createdAt?: string;

	/** Last update timestamp */
	updatedAt?: string;
}

// =============================================================================
// CONFIGURATION FILE TYPES
// =============================================================================

/**
 * Root structure of ~/.config/jat/agents.json
 *
 * @example
 * ```json
 * {
 *   "version": 1,
 *   "programs": {
 *     "claude-code": { ... },
 *     "codex": { ... }
 *   },
 *   "routingRules": [
 *     { "id": "security-bugs", ... },
 *     { "id": "chores-to-haiku", ... }
 *   ],
 *   "defaults": {
 *     "fallbackAgent": "claude-code",
 *     "fallbackModel": "sonnet"
 *   }
 * }
 * ```
 */
export interface AgentConfigFile {
	/** Schema version for future migrations */
	version: number;

	/** Map of agent program ID to configuration */
	programs: Record<string, AgentProgram>;

	/** Ordered list of routing rules */
	routingRules: AgentRoutingRule[];

	/** Default settings */
	defaults: {
		/** Agent to use when no routing rules match */
		fallbackAgent: string;
		/** Model to use for fallback agent */
		fallbackModel: string;
	};

	/** When config was last modified */
	updatedAt?: string;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

/**
 * Agent availability status for UI display.
 */
export interface AgentStatus {
	/** Agent program ID */
	agentId: string;

	/** Whether the agent is enabled in config */
	enabled: boolean;

	/** Whether the CLI command exists */
	commandAvailable: boolean;

	/** Whether authentication is configured */
	authConfigured: boolean;

	/** Overall availability (enabled && commandAvailable && authConfigured) */
	available: boolean;

	/** Human-readable status message */
	statusMessage: string;
}

/**
 * Result of evaluating routing rules for a task.
 */
export interface RoutingResult {
	/** The agent that should handle this task */
	agent: AgentProgram;

	/** The model to use */
	model: AgentModel;

	/** Which rule matched (null if using fallback) */
	matchedRule: AgentRoutingRule | null;

	/** Reason for selection */
	reason: string;
}

/**
 * Summary of agent configuration for API responses.
 */
export interface AgentConfigSummary {
	/** Total number of configured agents */
	totalAgents: number;

	/** Number of available (enabled + auth configured) agents */
	availableAgents: number;

	/** Default agent ID */
	defaultAgent: string;

	/** Number of routing rules */
	routingRulesCount: number;
}

// =============================================================================
// PRESET TYPES
// =============================================================================

/**
 * Preset agent program configurations.
 *
 * Used for quick setup of common AI coding assistants.
 */
export interface AgentProgramPreset {
	/** Preset identifier */
	id: string;

	/** Display name */
	name: string;

	/** Description of the agent */
	description: string;

	/** Partial configuration (merged with defaults) */
	config: Partial<AgentProgram>;

	/** Installation command (e.g., 'npm install -g @anthropic/claude-code') */
	installCommand?: string;

	/** URL to installation instructions */
	installUrl?: string;
}

/**
 * Built-in agent program presets.
 *
 * These are templates users can select when adding a new agent.
 */
export const AGENT_PRESETS: AgentProgramPreset[] = [
	{
		id: 'claude-code',
		name: 'Claude Code',
		description: 'Anthropic Claude via Claude Code CLI',
		installCommand: 'npm install -g @anthropic-ai/claude-code',
		installUrl: 'https://docs.anthropic.com/en/docs/claude-code',
		config: {
			id: 'claude-code',
			name: 'Claude Code',
			command: 'claude',
			models: [
				{ id: 'claude-opus-4-5-20251101', name: 'Opus 4.5', shortName: 'opus', costTier: 'high' },
				{ id: 'claude-sonnet-4-20250514', name: 'Sonnet 4', shortName: 'sonnet', costTier: 'medium' },
				{ id: 'claude-3-5-haiku-20241022', name: 'Haiku 3.5', shortName: 'haiku', costTier: 'low' }
			],
			defaultModel: 'opus',
			authType: 'subscription',
			flags: [],
			taskInjection: 'prompt'
		}
	},
	{
		id: 'codex-cli',
		name: 'Codex',
		description: 'OpenAI Codex via official CLI',
		installCommand: 'npm install -g @openai/codex',
		installUrl: 'https://github.com/openai/codex',
		config: {
			id: 'codex-cli',
			name: 'Codex CLI',
			command: 'codex',
			models: [
				{ id: 'o3', name: 'O3', shortName: 'o3', costTier: 'high' },
				{ id: 'o4-mini', name: 'O4 Mini', shortName: 'o4-mini', costTier: 'medium' },
				{ id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex', shortName: 'gpt5-codex', costTier: 'high' },
				{ id: 'gpt-4.1', name: 'GPT-4.1', shortName: 'gpt4.1', costTier: 'high' },
				{ id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', shortName: 'gpt4.1-mini', costTier: 'low' }
			],
			defaultModel: 'o4-mini',
			authType: 'subscription',  // Codex has its own auth via 'codex auth'
			flags: ['--full-auto'],
			taskInjection: 'argument'  // Codex takes prompt as positional argument
		}
	},
	{
		id: 'gemini-cli',
		name: 'Gemini CLI',
		description: 'Google Gemini terminal coding agent',
		installCommand: 'npx https://geminicli.com/run',
		installUrl: 'https://geminicli.com/',
		config: {
			id: 'gemini-cli',
			name: 'Gemini CLI',
			command: 'gemini',
			models: [
				{ id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', shortName: 'pro', costTier: 'high' },
				{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', shortName: 'flash', costTier: 'low' },
				{ id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', shortName: 'flash-2.0', costTier: 'low' }
			],
			defaultModel: 'flash',
			authType: 'subscription',  // Gemini CLI has its own auth via 'gemini auth'
			flags: [],
			taskInjection: 'prompt'
		}
	},
	{
		id: 'aider',
		name: 'Aider',
		description: 'Aider - AI pair programming in terminal',
		installCommand: 'pip install aider-chat',
		installUrl: 'https://aider.chat/docs/install.html',
		config: {
			id: 'aider',
			name: 'Aider',
			command: 'aider',
			models: [
				{ id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet', shortName: 'sonnet', costTier: 'medium' },
				{ id: 'gpt-4o', name: 'GPT-4o', shortName: 'gpt4o', costTier: 'high' }
			],
			defaultModel: 'sonnet',
			authType: 'api_key',
			apiKeyProvider: 'anthropic',
			apiKeyEnvVar: 'ANTHROPIC_API_KEY',
			flags: ['--no-auto-commits'],
			startupPattern: '{command} --model {model} {flags}',
			taskInjection: 'stdin'
		}
	},
	{
		id: 'opencode',
		name: 'OpenCode',
		description: 'OpenCode - Terminal-based AI coding assistant',
		installCommand: 'curl -fsSL https://opencode.ai/install | bash',
		installUrl: 'https://opencode.ai/',
		config: {
			id: 'opencode',
			name: 'OpenCode',
			command: 'opencode',
			models: [
				{ id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', shortName: 'sonnet', costTier: 'medium' },
				{ id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', shortName: 'opus', costTier: 'high' },
				{ id: 'gpt-4o', name: 'GPT-4o', shortName: 'gpt4o', costTier: 'high' },
				{ id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', shortName: 'flash', costTier: 'low' }
			],
			defaultModel: 'sonnet',
			authType: 'api_key',
			apiKeyProvider: 'anthropic',
			apiKeyEnvVar: 'ANTHROPIC_API_KEY',
			flags: [],
			taskInjection: 'prompt'
		}
	},
	{
		id: 'pi',
		name: 'Pi',
		description: 'Pi - Minimal terminal coding agent from pi.dev',
		installCommand: 'npm install -g @mariozechner/pi-coding-agent',
		installUrl: 'https://pi.dev/',
		config: {
			id: 'pi',
			name: 'Pi',
			command: 'pi',
			models: [
				{ id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', shortName: 'sonnet', costTier: 'medium' },
				{ id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', shortName: 'opus', costTier: 'high' },
				{ id: 'gpt-4o', name: 'GPT-4o', shortName: 'gpt4o', costTier: 'high' },
				{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', shortName: 'flash', costTier: 'low' },
				{ id: 'o4-mini', name: 'O4 Mini', shortName: 'o4-mini', costTier: 'medium' }
			],
			defaultModel: 'sonnet',
			authType: 'subscription',
			flags: [],
			taskInjection: 'argument'
		}
	}
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get an agent's model by shortName.
 */
export function getAgentModel(agent: AgentProgram, shortName: string): AgentModel | undefined {
	return agent.models.find((m) => m.shortName === shortName);
}

/**
 * Get the default model for an agent.
 */
export function getDefaultModel(agent: AgentProgram): AgentModel | undefined {
	return getAgentModel(agent, agent.defaultModel);
}

/**
 * Check if an agent program ID is valid.
 */
export function isValidAgentId(id: string): boolean {
	return /^[a-z][a-z0-9-]*$/.test(id);
}

/**
 * Create a default agent config file.
 */
export function createDefaultAgentConfig(): AgentConfigFile {
	const claudePreset = AGENT_PRESETS.find((p) => p.id === 'claude-code')!;
	const claudeConfig: AgentProgram = {
		...claudePreset.config,
		id: 'claude-code',
		name: 'Claude Code',
		command: 'claude',
		models: claudePreset.config.models!,
		defaultModel: 'opus',
		flags: [],
		authType: 'subscription',
		enabled: true,
		isDefault: true,
		order: 0,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString()
	};

	return {
		version: 1,
		programs: {
			'claude-code': claudeConfig
		},
		routingRules: [],
		defaults: {
			fallbackAgent: 'claude-code',
			fallbackModel: 'opus'
		},
		updatedAt: new Date().toISOString()
	};
}
