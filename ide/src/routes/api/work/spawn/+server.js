/**
 * Work Spawn API - Auto-spawn agent + session
 * POST /api/work/spawn
 *
 * Creates a NEW agent + tmux session:
 * 1. Evaluate routing rules (or use explicit agentId/model)
 * 2. Validate agent is enabled and auth is available
 * 3. Generate agent name and register in Agent Mail
 * 4. Create tmux session squad-{AgentName}
 * 5. If taskId provided: Assign task to agent in SQUAD Tasks (st update)
 * 6. Run agent CLI with /squad:start (with agent name, optionally with task)
 * 7. Return new WorkSession with agent selection info
 *
 * Body:
 * - taskId: Task ID to assign (optional - if omitted, creates planning session)
 * - agentId: Agent program to use (optional - if omitted, uses routing rules or fallback)
 * - model: Model to use (optional - if omitted, uses agent default or routing rule override)
 * - attach: If true, immediately open terminal attached to session (default: false)
 * - project: Project name or path (optional - inferred from taskId if not provided)
 * - imagePath: Path to image to send after startup (optional)
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import Database from 'better-sqlite3';
import {
	DEFAULT_MODEL,
	AGENT_MAIL_URL
} from '$lib/config/spawnConfig.js';
import { getTaskById } from '$lib/server/squad-tasks.js';
import { getProjectPath, getSquadDefaults } from '$lib/server/projectPaths.js';
import {
	evaluateRouting,
	getAgentProgram,
	getAgentStatus,
	getAgentConfig
} from '$lib/utils/agentConfig.js';
import { getAgentModel } from '$lib/types/agentProgram.js';
import { getApiKey, getCustomApiKey, getCustomApiKeyMeta } from '$lib/utils/credentials.js';

const DB_PATH = process.env.AGENT_MAIL_DB || `${process.env.HOME}/.agent-mail.db`;

// Name components - nature/geography themed words
// 72 adjectives × 72 nouns = 5,184 unique combinations
const ADJECTIVES = [
	// Temperature/Texture (16)
	'Swift', 'Calm', 'Warm', 'Cool', 'Soft', 'Hard', 'Smooth', 'Rough',
	'Sharp', 'Dense', 'Thin', 'Thick', 'Crisp', 'Mild', 'Brisk', 'Gentle',
	// Light/Color (16)
	'Bright', 'Dark', 'Light', 'Pale', 'Vivid', 'Muted', 'Stark', 'Dim',
	'Gold', 'Silver', 'Azure', 'Amber', 'Russet', 'Ivory', 'Jade', 'Coral',
	// Size/Scale (16)
	'Grand', 'Great', 'Vast', 'Wide', 'Broad', 'Deep', 'High', 'Tall',
	'Long', 'Far', 'Near', 'Open', 'Steep', 'Sheer', 'Flat', 'Round',
	// Quality/Character (16)
	'Bold', 'Keen', 'Wise', 'Fair', 'True', 'Pure', 'Free', 'Wild',
	'Clear', 'Fresh', 'Fine', 'Good', 'Rich', 'Full', 'Whole', 'Prime',
	// Weather/Time (8)
	'Sunny', 'Misty', 'Windy', 'Rainy', 'Early', 'Late', 'First', 'Last'
];

const NOUNS = [
	// Water Bodies (16)
	'River', 'Ocean', 'Lake', 'Stream', 'Creek', 'Brook', 'Pond', 'Falls',
	'Bay', 'Cove', 'Gulf', 'Inlet', 'Fjord', 'Strait', 'Marsh', 'Spring',
	// Land Features (16)
	'Mountain', 'Valley', 'Canyon', 'Gorge', 'Ravine', 'Basin', 'Plateau', 'Mesa',
	'Hill', 'Ridge', 'Cliff', 'Bluff', 'Ledge', 'Shelf', 'Slope', 'Terrace',
	// Vegetation (16)
	'Forest', 'Woods', 'Grove', 'Glade', 'Thicket', 'Copse', 'Orchard', 'Garden',
	'Prairie', 'Meadow', 'Field', 'Plain', 'Heath', 'Moor', 'Steppe', 'Savanna',
	// Coastal (8)
	'Shore', 'Coast', 'Beach', 'Dune', 'Cape', 'Point', 'Isle', 'Reef',
	// Atmospheric (8)
	'Cloud', 'Storm', 'Wind', 'Mist', 'Frost', 'Dawn', 'Dusk', 'Horizon',
	// Geological (8)
	'Stone', 'Rock', 'Boulder', 'Pebble', 'Sand', 'Clay', 'Slate', 'Granite'
];

/**
 * Resolve a project input that might be a path or a name.
 * Returns a filesystem path if the input looks like a path, otherwise null.
 * @param {string} value
 * @returns {string|null}
 */
function resolveProjectInput(value) {
	const trimmed = value.trim();
	if (!trimmed) return null;

	const isPathLike =
		trimmed.includes('/') ||
		trimmed.startsWith('~') ||
		trimmed.startsWith('./') ||
		trimmed.startsWith('../');

	if (!isPathLike) return null;

	const expanded = trimmed.startsWith('~')
		? `${homedir()}${trimmed.slice(1)}`
		: trimmed;

	return resolve(expanded);
}

/**
 * Escape a string for safe use in shell commands (single-quoted).
 * @param {string} str
 * @returns {string}
 */
function shellEscape(str) {
	if (!str) return "''";
	return "'" + str.replace(/'/g, "'\\''") + "'";
}

/**
 * Get a compact summary of enabled skills from squad-skills installed.json.
 * Used to inject skill awareness into non-native agent prompts (Codex, Gemini, etc.)
 * @returns {string} Multi-line text block listing available skills, or empty string
 */
function getEnabledSkillsSummary() {
	const skillsDir = `${homedir()}/.config/squad/skills`;
	const installedFile = `${skillsDir}/installed.json`;

	if (!existsSync(installedFile)) return '';

	try {
		const data = JSON.parse(readFileSync(installedFile, 'utf-8'));
		const skills = data.skills || {};
		const lines = [];

		for (const [id, entry] of Object.entries(skills)) {
			if (/** @type {any} */ (entry).enabled === false) continue;
			const e = /** @type {{ name?: string, description?: string }} */ (entry);
			const name = e.name || id;
			const desc = e.description || '';
			lines.push(`- ${name}: ${desc}`);
		}

		if (lines.length === 0) return '';

		return `Available skills (in ~/.config/squad/skills/):\n${lines.join('\n')}\nRead each skill's SKILL.md for full usage instructions.`;
	} catch {
		return '';
	}
}

/**
 * Get existing agent names from database for collision checking
 * @returns {Set<string>} Set of existing agent names (lowercase)
 */
function getExistingAgentNames() {
	try {
		const db = new Database(DB_PATH, { readonly: true });
		const agents = /** @type {{ name: string }[]} */ (
			db.prepare('SELECT name FROM agents').all()
		);
		db.close();
		return new Set(agents.map(a => a.name.toLowerCase()));
	} catch {
		return new Set();
	}
}

/**
 * Generate a unique agent name
 * @param {Set<string>} existingNames - Set of existing agent names (lowercase)
 * @param {number} maxAttempts - Maximum generation attempts
 * @returns {string} A unique agent name
 */
function generateUniqueName(existingNames, maxAttempts = 100) {
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
		const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
		const name = adj + noun;

		if (!existingNames.has(name.toLowerCase())) {
			return name;
		}
	}

	// Fallback: append random suffix
	const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
	const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
	const suffix = Math.floor(Math.random() * 1000);
	return `${adj}${noun}${suffix}`;
}

/**
 * Get or create project in Agent Mail database
 * @param {import('better-sqlite3').Database} db - Database connection
 * @param {string} projectPath - Full project path
 * @returns {number} Project ID
 */
function getOrCreateProject(db, projectPath) {
	// Use project name as slug (last segment of path)
	const slug = projectPath.split('/').filter(Boolean).pop() || 'unknown';

	// Check if project exists
	const existing = /** @type {{ id: number } | undefined} */ (
		db.prepare('SELECT id FROM projects WHERE human_key = ?').get(projectPath)
	);
	if (existing) {
		return existing.id;
	}

	// Create project
	const result = db.prepare(
		'INSERT INTO projects (slug, human_key) VALUES (?, ?)'
	).run(slug, projectPath);

	return /** @type {number} */ (result.lastInsertRowid);
}

/**
 * Register agent in Agent Mail database
 * @param {string} agentName - Agent name
 * @param {string} projectPath - Project path
 * @param {string} model - Model name (e.g., "opus", "sonnet")
 * @param {string} program - Agent program ID (e.g., "claude-code", "codex-cli")
 * @returns {{ success: boolean, agentId?: number, error?: string }}
 */
function registerAgentInDb(agentName, projectPath, model, program = 'claude-code') {
	try {
		const db = new Database(DB_PATH);

		try {
			const projectId = getOrCreateProject(db, projectPath);

			// Check if agent already exists for this project
			const existing = /** @type {{ id: number } | undefined} */ (
				db.prepare(
					'SELECT id FROM agents WHERE project_id = ? AND name = ?'
				).get(projectId, agentName)
			);

			if (existing) {
				// Update last_active_ts, model, and program for existing agent
				db.prepare(
					"UPDATE agents SET last_active_ts = datetime('now'), model = ?, program = ? WHERE id = ?"
				).run(model, program, existing.id);
				return { success: true, agentId: existing.id };
			}

			// Insert new agent with selected program
			const result = db.prepare(`
				INSERT INTO agents (project_id, name, program, model, task_description)
				VALUES (?, ?, ?, ?, '')
			`).run(projectId, agentName, program, model);

			return { success: true, agentId: /** @type {number} */ (result.lastInsertRowid) };
		} finally {
			db.close();
		}
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

const execAsync = promisify(exec);

/**
 * @typedef {Object} TaskForRouting
 * @property {string} id
 * @property {string} [issue_type]
 * @property {string[]} [labels]
 * @property {number} [priority]
 * @property {string} [title]
 * @property {string} [description]
 * @property {string} [status]
 */

/**
 * Select agent and model based on request parameters and routing rules.
 *
 * @param {object} params
 * @param {string | undefined} params.agentId - Explicit agent ID (optional)
 * @param {string | undefined} params.model - Explicit model shortName (optional)
 * @param {TaskForRouting | null} params.task - Task object for routing evaluation
 * @returns {{ agent: import('$lib/types/agentProgram.js').AgentProgram, model: import('$lib/types/agentProgram.js').AgentModel, matchedRule: import('$lib/types/agentProgram.js').AgentRoutingRule | null, reason: string } | { error: string, status: number }}
 */
function selectAgentAndModel({ agentId, model, task }) {
	const config = getAgentConfig();

	// If explicit agentId provided, use it
	if (agentId) {
		const agent = getAgentProgram(agentId);
		if (!agent) {
			return { error: `Agent program '${agentId}' not found`, status: 400 };
		}

		// Check agent is enabled
		const status = getAgentStatus(agent);
		if (!status.available) {
			return {
				error: `Agent '${agentId}' is not available: ${status.statusMessage}`,
				status: 400
			};
		}

		// Get the model (explicit or default)
		const modelShortName = model || agent.defaultModel;

		// If model contains '/', treat as full provider/model ID (e.g., openrouter/kimi-k2.5)
		// This allows using any model from OpenRouter or other providers without hardcoded list
		if (modelShortName && modelShortName.includes('/')) {
			return {
				agent,
				model: {
					id: modelShortName,  // Full provider/model string
					shortName: modelShortName,
					name: modelShortName
				},
				matchedRule: null,
				reason: `Explicit selection: ${agent.name} with custom model ${modelShortName}`
			};
		}

		const selectedModel = getAgentModel(agent, modelShortName);
		if (!selectedModel) {
			// If explicit model provided but not found, allow custom model ID
			if (model) {
				return {
					agent,
					model: {
						id: modelShortName,
						shortName: modelShortName,
						name: modelShortName
					},
					matchedRule: null,
					reason: `Explicit selection: ${agent.name} with custom model ${modelShortName}`
				};
			}

			return {
				error: `Model '${modelShortName}' not found for agent '${agentId}'`,
				status: 400
			};
		}

		return {
			agent,
			model: selectedModel,
			matchedRule: null,
			reason: `Explicit selection: ${agent.name} with ${selectedModel.name}`
		};
	}

	// No explicit agent - evaluate routing rules
	// Build task object for routing evaluation
	const taskForRouting = task
		? {
				id: task.id,
				type: task.issue_type,
				labels: task.labels || [],
				priority: task.priority,
				project: task.id?.split('-')[0] // Extract project from task ID prefix
			}
		: null;

	if (taskForRouting) {
		try {
			const routingResult = evaluateRouting(taskForRouting);

			// If explicit model override provided, use it instead of routing result
			if (model) {
				const overrideModel = getAgentModel(routingResult.agent, model);
				if (overrideModel) {
					return {
						agent: routingResult.agent,
						model: overrideModel,
						matchedRule: routingResult.matchedRule,
						reason: `${routingResult.reason} (model overridden to ${overrideModel.name})`
					};
				}

				// Allow custom model override even if not in list
				return {
					agent: routingResult.agent,
					model: {
						id: model,
						shortName: model,
						name: model
					},
					matchedRule: routingResult.matchedRule,
					reason: `${routingResult.reason} (model overridden to ${model})`
				};
			}

			// Check agent is available
			const status = getAgentStatus(routingResult.agent);
			if (!status.available) {
				const message = `Routing selected ${routingResult.agent.id} but it's unavailable: ${status.statusMessage}`;
				// If a routing rule matched, surface the failure instead of silently falling back.
				if (routingResult.matchedRule) {
					return { error: message, status: 400 };
				}
				// Otherwise, fall through to fallback agent.
				console.warn(`[spawn] ${message}`);
			} else {
				return routingResult;
			}
		} catch (err) {
			console.warn('[spawn] Routing evaluation failed:', err);
		}
	}

	// Use fallback agent
	const fallbackAgent = config.programs[config.defaults.fallbackAgent];
	if (!fallbackAgent) {
		return {
			error: `Fallback agent '${config.defaults.fallbackAgent}' not configured`,
			status: 500
		};
	}

	// Check fallback is available
	const fallbackStatus = getAgentStatus(fallbackAgent);
	if (!fallbackStatus.available) {
		return {
			error: `Fallback agent '${fallbackAgent.id}' is not available: ${fallbackStatus.statusMessage}`,
			status: 500
		};
	}

	// Get model (explicit override or configured fallback)
	const fallbackModelName = model || config.defaults.fallbackModel;
	const fallbackModel = getAgentModel(fallbackAgent, fallbackModelName);
	if (!fallbackModel) {
		return {
			error: `Fallback model '${fallbackModelName}' not found for agent '${fallbackAgent.id}'`,
			status: 500
		};
	}

	return {
		agent: fallbackAgent,
		model: fallbackModel,
		matchedRule: null,
		reason: 'Using fallback agent (no routing rules matched)'
	};
}

/**
 * @typedef {Object} SquadDefaults
 * @property {boolean} [skip_permissions]
 * @property {number} [claude_startup_timeout]
 * @property {string} [model]
 * @property {number} [agent_stagger]
 */

/**
 * Build a self-contained prompt for non-native agents (Codex, Gemini, OpenCode).
 * These agents don't have /squad:start, so the prompt must include all context.
 *
 * @param {object} params
 * @param {string} [params.agentName]
 * @param {string} [params.taskId]
 * @param {string} [params.taskTitle]
 * @param {string} [params.taskCommand]
 * @param {string} params.projName
 * @returns {string[]} Array of prompt sentences to join
 */
function buildNonNativePrompt({ agentName, taskId, taskTitle, taskCommand, projName }) {
	const parts = [];
	const isChat = taskCommand === '/squad:chat';

	parts.push(`You are agent ${agentName} in the ${projName} project.`);
	parts.push('You are already registered in the agent registry. Do NOT run am-register or /squad:start.');

	if (isChat) {
		if (taskId) parts.push(`Task: ${taskId}`);
		if (taskTitle) parts.push(`Message: ${taskTitle}`);
		parts.push('This is a conversational task. Research and respond to the question.');
	} else if (taskId) {
		parts.push(`Task: ${taskId}${taskTitle ? ' - ' + taskTitle : ''}`);
		parts.push(`Run st show ${taskId} --json to get full task details.`);
		parts.push("Read the project's CLAUDE.md for project context, then implement the task.");
		parts.push(`When finished, close the task: st close ${taskId} --reason "brief summary"`);
	} else {
		parts.push("Read the project's CLAUDE.md for project context.");
	}

	return parts;
}

/**
 * Build the CLI command for starting an agent session.
 *
 * @param {object} params
 * @param {import('$lib/types/agentProgram.js').AgentProgram} params.agent
 * @param {import('$lib/types/agentProgram.js').AgentModel} params.model
 * @param {string} params.projectPath
 * @param {SquadDefaults} params.squadDefaults
 * @param {string} [params.agentName] - Agent name for task injection
 * @param {string} [params.taskId] - Task ID for task injection
 * @param {string} [params.taskTitle] - Task title for task injection
 * @param {string} [params.taskCommand] - Task command (e.g. '/squad:start', '/squad:chat')
 * @param {string} [params.mode] - Spawn mode (e.g. 'planning')
 * @returns {{ command: string, env: Record<string, string>, needsSquadStart: boolean }}
 */
function buildAgentCommand({ agent, model, projectPath, squadDefaults, agentName, taskId, taskTitle, taskCommand, mode }) {
	// Build environment variables
	/** @type {Record<string, string>} */
	const env = { AGENT_MAIL_URL };

	// For API key auth, inject the key as environment variable
	if (agent.authType === 'api_key' && agent.apiKeyEnvVar && agent.apiKeyProvider) {
		// Try built-in providers first
		let apiKey = getApiKey(agent.apiKeyProvider);

		// Try custom API keys
		if (!apiKey) {
			apiKey = getCustomApiKey(agent.apiKeyProvider);
		}

		if (apiKey) {
			env[agent.apiKeyEnvVar] = apiKey;
		}
	}

	// Build command based on agent configuration
	// Default pattern: {command} --model {model} {flags}
	let cmdParts = [`cd ${shellEscape(projectPath)}`];

	// Add environment variables
	for (const [key, value] of Object.entries(env)) {
		cmdParts.push(`${key}=${shellEscape(value)}`);
	}

	// Use custom startup pattern if defined, otherwise build default
	if (agent.startupPattern) {
		// Replace placeholders in custom pattern
		let customCmd = agent.startupPattern
			.replace('{command}', agent.command)
			.replace('{model}', model.id)
			.replace('{flags}', agent.flags.join(' '));

		cmdParts.push(customCmd);
	} else {
		// Default command construction
		let agentCmd = agent.command;

		// Add model flag (agent-specific)
		if (agent.command === 'claude') {
			agentCmd += ` --model ${model.shortName}`;
		} else if (agent.command === 'codex' || agent.command === 'gemini' || agent.command === 'pi') {
			agentCmd += ` --model ${model.id}`;
		} else if (agent.command === 'opencode') {
			// OpenCode uses provider/model format (e.g., anthropic/claude-sonnet-4-20250514)
			// If model.id already contains '/', use it directly (custom provider/model)
			if (model.id.includes('/')) {
				agentCmd += ` --model ${model.id}`;
			} else if (agent.apiKeyProvider) {
				// Use the agent's configured API key provider as prefix
				agentCmd += ` --model ${agent.apiKeyProvider}/${model.id}`;
			} else {
				// No provider info available — pass bare model ID and let opencode resolve it.
				// Don't blindly prepend 'anthropic' for non-Anthropic models like kimi-k2.5.
				agentCmd += ` --model ${model.id}`;
			}
		} else {
			// Generic: try --model with full ID
			agentCmd += ` --model ${model.id}`;
		}

		// Permission-bypass flags are controlled exclusively by the skip_permissions toggle.
		// Strip them from agent.flags so they don't get double-injected or appear
		// when the user has disabled autonomous mode.
		const PERMISSION_FLAGS = ['--dangerously-skip-permissions', '--full-auto', '--auto-edit'];
		let agentFlags = (agent.flags ?? []).filter(f => !PERMISSION_FLAGS.includes(f));

		// For plan mode without autonomous, skip permission flags entirely
		// (--permission-mode plan takes precedence for non-autonomous sessions)
		const wantsAutonomous = squadDefaults.skip_permissions;
		if (mode === 'plan' && agent.command === 'claude' && !wantsAutonomous) {
			// plan mode already uses --permission-mode plan below
		}

		// Add configured flags (sans permission flags)
		if (agentFlags.length > 0) {
			agentCmd += ' ' + agentFlags.join(' ');
		}

		// Inject permission flags from the autonomous mode toggle only
		if (squadDefaults.skip_permissions) {
			if (agent.command === 'claude') {
				agentCmd += ' --dangerously-skip-permissions';
			} else if (agent.command === 'codex') {
				const codexApprovalFlags = ['--full-auto', '--auto-edit', '--suggest'];
				const hasApprovalFlag = agentFlags.some((flag) => codexApprovalFlags.includes(flag));
				if (!hasApprovalFlag) {
					agentCmd += ' --full-auto';
				}
			}
		}

		// Handle task injection based on agent configuration
		// taskInjection modes:
		// - 'stdin' (default for Claude Code): Send /squad:start command after agent starts
		// - 'prompt': Pass initial prompt via --prompt flag (e.g., OpenCode)
		// - 'argument': Pass as positional command argument (e.g., Codex)
		const taskInjectionMode = agent.taskInjection || 'stdin';

		if (agent.command === 'claude') {
			// Claude Code: system prompt + initial command as positional argument
			const projName = projectPath.split('/').filter(Boolean).pop() || 'project';
			if (mode === 'plan') {
				const squadBootstrap = `You are a planning assistant for the ${projName} project. Help the user plan features, discuss architecture, and think through requirements. When the user is ready to create tasks, they can use /squad:tasktree. Do NOT run /squad:start.`;
				agentCmd += ` --append-system-prompt '${squadBootstrap}'`;
				agentCmd += ' --permission-mode plan';
			} else {
				agentCmd += ` --append-system-prompt 'You are a SQUAD agent.'`;
				// Pass initial command as positional argument — Claude processes it
				// as the first user message in interactive mode. If a YOLO permissions
				// dialog appears, the prompt queues behind it automatically.
				const taskCmd = taskCommand || '/squad:start';
				const initialPrompt = taskId
					? `${taskCmd} ${agentName} ${taskId}`
					: `/squad:start ${agentName}`;
				const escapedPrompt = initialPrompt.replace(/'/g, "'\\''");
				agentCmd += ` '${escapedPrompt}'`;
			}
		} else if (taskInjectionMode === 'argument' && (agentName || taskId)) {
			// Agents with argument injection (like Codex) - pass task as positional argument
			const projName = projectPath.split('/').filter(Boolean).pop() || 'project';
			const promptParts = buildNonNativePrompt({
				agentName, taskId, taskTitle, taskCommand, projName
			});

			const skillsSummary = getEnabledSkillsSummary();
			if (skillsSummary) promptParts.push(skillsSummary);

			const prompt = promptParts.join(' ');
			const escapedPrompt = prompt.replace(/"/g, '\\"');
			agentCmd += ` "${escapedPrompt}"`;
		} else if (taskInjectionMode === 'prompt' && (agentName || taskId)) {
			// Agents with prompt injection (like OpenCode) - pass task via --prompt
			const projName = projectPath.split('/').filter(Boolean).pop() || 'project';
			const promptParts = buildNonNativePrompt({
				agentName, taskId, taskTitle, taskCommand, projName
			});

			const skillsSummary = getEnabledSkillsSummary();
			if (skillsSummary) promptParts.push(skillsSummary);

			const prompt = promptParts.join(' ');
			const escapedPrompt = prompt.replace(/'/g, "'\\''");
			agentCmd += ` --prompt '${escapedPrompt}'`;
		}

		cmdParts.push(agentCmd);
	}

	// Determine if we need to send /squad:start after the agent starts via tmux send-keys.
	// All known agents receive their task via CLI args (positional, --prompt, or argument).
	// Only agents with explicit 'stdin' taskInjection AND not Claude would need this.
	const taskInjectionMode = agent.taskInjection || 'stdin';
	const needsSquadStart = mode !== 'plan' && agent.command !== 'claude' && taskInjectionMode === 'stdin';

	return {
		command: cmdParts.join(' && '),
		env,
		needsSquadStart
	};
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	try {
		const body = await request.json();
		const {
			taskId,
			agentId = null,
			model = null,
			attach = false,
			imagePath = null,
			project = null,
			mode = 'task'
		} = body;
		const explicitProjectProvided =
			project !== null && project !== undefined && String(project).trim() !== '';

		// agentId is optional - if omitted, uses routing rules or fallback
		// model is optional - if omitted, uses agent default or routing rule override
		// taskId is optional - if not provided, creates a planning session
		// imagePath is optional - if provided, will be sent to the session after startup
		// project is optional - if provided, use name or path; otherwise infer from task ID prefix

		// Determine project path:
		// 1. If explicit project provided, look it up in SQUAD config
		// 2. If taskId provided, infer from prefix and look up in SQUAD config
		// 3. Fall back to current project (squad)
		let projectPath = null;
		let inferredFromTaskId = false;

		if (explicitProjectProvided) {
			// Explicit project provided - may be a name or a path
			const projectInput = String(project);
			const explicitPath = resolveProjectInput(projectInput);
			if (explicitPath) {
				projectPath = explicitPath;
			} else {
				// Look up project path from SQUAD config (supports custom paths)
				const projectInfo = await getProjectPath(projectInput);
				if (projectInfo.exists) {
					projectPath = projectInfo.path;
				}
			}
		}

		if (explicitProjectProvided && !projectPath) {
			return json({
				error: 'Project not found',
				message: `Project '${String(project)}' not found in SQUAD config`,
				project: String(project)
			}, { status: 400 });
		}

		if (!projectPath && taskId) {
			// Task IDs follow format: {project}-{hash}
			// Handle underscores in project names (e.g., "Community_Connect-abc")
			const lastDashIndex = taskId.lastIndexOf('-');
			const taskPrefix = lastDashIndex > 0 ? taskId.substring(0, lastDashIndex) : taskId.split('-')[0];

			if (taskPrefix && taskPrefix.toLowerCase() !== 'squad') {
				// Look up project path from SQUAD config (supports custom paths)
				const projectInfo = await getProjectPath(taskPrefix);
				if (projectInfo.exists) {
					projectPath = projectInfo.path;
					inferredFromTaskId = true;
				} else {
					console.warn(`[spawn] Project ${taskPrefix} not found at ${projectInfo.path}, falling back to current project`);
				}
			}
		}

		// Fall back to current project (squad) if no valid path determined
		projectPath = projectPath || process.cwd().replace('/ide', '');

		// Final validation: ensure project path exists
		if (!existsSync(projectPath)) {
			return json({
				error: 'Project path not found',
				message: `Project directory does not exist: ${projectPath}`,
				taskId
			}, { status: 400 });
		}

		// Validate SQUAD task database exists in project
		const squadPath = `${projectPath}/.squad`;
		if (!existsSync(squadPath)) {
			return json({
				error: 'SQUAD task database not found',
				message: `No .squad directory found in ${projectPath}. Run 'st init' to initialize.`,
				projectPath,
				taskId
			}, { status: 400 });
		}

		console.log('[spawn] Project path:', projectPath, inferredFromTaskId ? '(inferred from task ID)' : '');

		// Extract project name from path early (needed for signal and response)
		// e.g., "/home/jw/code/squad" -> "squad"
		const projectName = projectPath.split('/').filter(Boolean).pop() || null;

		// Get SQUAD config defaults (used for skip_permissions, timeout, etc.)
		const squadDefaults = await getSquadDefaults();

		// Step 0: Fetch task data early (needed for routing rule evaluation)
		let task = null;
		if (taskId) {
			try {
				task = getTaskById(taskId);
			} catch (err) {
				console.warn(`[spawn] Could not fetch task ${taskId} for routing:`, err);
			}
		}

		// Step 0a: Guard against duplicate spawns for the same task
		// If task is already in_progress with an assigned agent that has an active tmux session,
		// reject the spawn to prevent creating orphan "planning sessions"
		if (task && task.status === 'in_progress' && task.assignee) {
			const existingSessionName = `squad-${task.assignee}`;
			try {
				const { stdout } = await execAsync(`tmux has-session -t ${shellEscape(existingSessionName)} 2>/dev/null && echo "exists" || echo "none"`);
				if (stdout.trim() === 'exists') {
					console.log(`[spawn] Task ${taskId} already in_progress with agent ${task.assignee} (session ${existingSessionName} active)`);
					return json({
						error: 'Task already has an active agent',
						message: `Task ${taskId} is already being worked on by agent ${task.assignee}`,
						existingAgent: task.assignee,
						existingSession: existingSessionName,
						taskId
					}, { status: 409 });
				}
				// Session doesn't exist - agent died, allow respawn
				console.log(`[spawn] Task ${taskId} was in_progress with ${task.assignee} but session is gone, allowing respawn`);
			} catch (err) {
				// tmux check failed - allow spawn to proceed
				console.warn(`[spawn] Could not check existing session for ${task.assignee}:`, err);
			}
		}

		// Step 0b: Select agent and model based on routing rules or explicit params
		const agentSelection = selectAgentAndModel({ agentId, model, task });
		if ('error' in agentSelection) {
			return json({
				error: agentSelection.error
			}, { status: agentSelection.status });
		}

		const { agent: selectedAgent, model: selectedModel, matchedRule, reason: selectionReason } = agentSelection;
		console.log(`[spawn] Agent selection: ${selectedAgent.name} (${selectedModel.name}) - ${selectionReason}`);

		// Step 1: Generate unique agent name and register in Agent Mail database
		const existingNames = getExistingAgentNames();
		const agentName = generateUniqueName(existingNames);

		// Register agent in Agent Mail SQLite database
		// Use selected model's shortName and agent program ID for storage
		const registerResult = registerAgentInDb(agentName, projectPath, selectedModel.shortName, selectedAgent.id);
		if (!registerResult.success) {
			console.error('Failed to register agent:', registerResult.error);
			return json({
				error: 'Failed to register agent',
				message: registerResult.error
			}, { status: 500 });
		}
		console.log(`[spawn] Registered agent ${agentName} in Agent Mail database (id: ${registerResult.agentId})`)

		// Step 2: Assign task to new agent in SQUAD (if taskId provided)
		if (taskId) {
			try {
				await execAsync(`st update "${taskId}" --status in_progress --assignee "${agentName}" --agent-program "${selectedAgent.id}" --model "${selectedModel.shortName}"`, {
					cwd: projectPath,
					timeout: 10000
				});
				console.log(`[spawn] Assigned task ${taskId} to ${agentName} in ${projectPath}`);
			} catch (err) {
				// Provide detailed error context for debugging
				const execErr = /** @type {{ stderr?: string, stdout?: string, message?: string }} */ (err);
				const errorDetail = execErr.stderr || execErr.stdout || (err instanceof Error ? err.message : String(err));

				console.error(`[spawn] Failed to assign task ${taskId}:`, {
					error: errorDetail,
					projectPath,
					agentName
				});

				return json({
					error: 'Failed to assign task',
					message: errorDetail,
					detail: `Task ${taskId} may not exist in ${projectPath}/.squad`,
					agentName,
					taskId,
					projectPath
				}, { status: 500 });
			}
		}

		// Step 3: Create tmux session with Claude Code
		const sessionName = `squad-${agentName}`;

		// Step 3a: Write agent identity file for session-start hook to restore
		// The hook (session-start-agent-identity.sh) uses this to set up .claude/sessions/agent-{sessionId}.txt
		// We use tmux session name as the key since that's known before Claude starts
		try {
			const sessionsDir = `${projectPath}/.claude/sessions`;
			mkdirSync(sessionsDir, { recursive: true });

			// Write a file that maps tmux session name to agent name
			// The hook can look this up using: tmux display-message -p '#S' to get session name
			const tmuxAgentFile = `${sessionsDir}/.tmux-agent-${sessionName}`;
			writeFileSync(tmuxAgentFile, agentName, 'utf-8');
			console.log(`[spawn] Wrote agent identity file: ${tmuxAgentFile}`);
		} catch (err) {
			// Non-fatal - hook will still work through other mechanisms
			console.warn('[spawn] Failed to write agent identity file:', err);
		}

		// Default tmux dimensions for proper terminal output width
		// 80 columns is the standard terminal width that Claude Code expects
		// 40 rows provides good vertical context for terminal output
		const TMUX_INITIAL_WIDTH = 80;
		const TMUX_INITIAL_HEIGHT = 40;

		// Build the agent command dynamically based on selected agent program
		const { command: agentCmd, needsSquadStart } = buildAgentCommand({
			agent: selectedAgent,
			model: selectedModel,
			projectPath,
			squadDefaults,
			agentName,
			taskId,
			taskTitle: task?.title,
			taskCommand: task?.command || '/squad:start',
			mode
		});

		console.log(`[spawn] Agent command: ${agentCmd.substring(0, 100)}...`);
		console.log(`[spawn] needsSquadStart: ${needsSquadStart}`);

		// Create session with explicit dimensions to ensure proper terminal width from the start
		// Without -x and -y, tmux uses default 80x24 which may not match IDE card width
		// Use sleep to allow shell to initialize before sending keys - without this delay,
		// the shell may not be ready and keys are lost (race condition)
		const escapedSessionName = shellEscape(sessionName);
		const escapedProjectPath = shellEscape(projectPath);
		const escapedAgentCmd = shellEscape(agentCmd);

		const createSessionCmd = `tmux new-session -d -s ${escapedSessionName} -x ${TMUX_INITIAL_WIDTH} -y ${TMUX_INITIAL_HEIGHT} -c ${escapedProjectPath} && sleep 0.3 && tmux send-keys -t ${escapedSessionName} ${escapedAgentCmd} Enter`;

		try {
			await execAsync(createSessionCmd);
		} catch (err) {
			const execErr = /** @type {{ stderr?: string, message?: string }} */ (err);
			const errorMessage = execErr.stderr || (err instanceof Error ? err.message : String(err));

			// If session already exists, that's a conflict
			if (errorMessage.includes('duplicate session')) {
				return json({
					error: 'Session already exists',
					message: `Session '${sessionName}' already exists`,
					sessionName,
					agentName
				}, { status: 409 });
			}

			return json({
				error: 'Failed to create session',
				message: errorMessage,
				sessionName,
				agentName
			}, { status: 500 });
		}

		// Write IDE-initiated signal for instant UI feedback
		// For plan mode, write 'planning' state; otherwise write 'starting'
		try {
			const signalType = mode === 'plan' ? 'planning' : 'starting';
			const startingSignal = {
				type: signalType,
				agentName,
				sessionId: sessionName,
				project: projectName,
				model: selectedModel.shortName,
				agentProgram: selectedAgent.id,
				taskId: taskId || null,
				taskTitle: task?.title || null,
				timestamp: new Date().toISOString()
			};
			const signalFile = `/tmp/squad-signal-tmux-${sessionName}.json`;
			writeFileSync(signalFile, JSON.stringify(startingSignal, null, 2), 'utf-8');
			console.log(`[spawn] Wrote IDE-initiated ${signalType} signal: ${signalFile}`);
		} catch (err) {
			// Non-fatal - UI will eventually get state from agent
			console.warn('[spawn] Failed to write starting signal:', err);
		}

		// Step 4: All agents receive their initial command via CLI args (positional
		// argument, --prompt, or argument injection). No stdin send-keys needed.
		// If a YOLO permissions dialog appears, the prompt queues behind it and
		// runs automatically after the user accepts.
		console.log(`[spawn] Agent launched with command via CLI args (no stdin injection needed)`);

		// Step 4c: If imagePath provided, wait for agent to start working, then send the image
		// This gives the agent context (e.g., bug screenshot) after it has initialized
		if (imagePath) {
			// Wait for the agent to fully start and be ready for input
			await new Promise(resolve => setTimeout(resolve, 8000));

			try {
				// Send the image path as input - the agent can then view it with Read tool
				// Use same pattern as above: text first, then Enter separately
				const escapedPath = imagePath.replace(/"/g, '\\"').replace(/\$/g, '\\$');
				await execAsync(`tmux send-keys -t "${sessionName}" -- "${escapedPath}"`);
				await new Promise(resolve => setTimeout(resolve, 100));
				await execAsync(`tmux send-keys -t "${sessionName}" Enter`);
				console.log(`[spawn] Sent image path to session ${sessionName}: ${imagePath}`);
			} catch (err) {
				// Non-fatal - image send failed but session is still running
				console.error('Failed to send image path:', err);
			}
		}

		// Step 4b: If attach requested, open terminal window
		if (attach) {
			try {
				const { spawn } = await import('child_process');
				const isMacOS = process.platform === 'darwin';
				const displayName = projectName ? projectName.toUpperCase() : 'SQUAD';
				const windowTitle = `${displayName}: ${sessionName}`;
				const attachCmd = `tmux attach-session -t "${sessionName}"`;

				if (isMacOS) {
					// macOS: use osascript to open Terminal.app, iTerm2, or Ghostty
					const { existsSync } = await import('fs');
					if (existsSync('/Applications/Ghostty.app')) {
						const child = spawn('ghostty', ['+new-window', '-e', 'bash', '-c', attachCmd], {
							detached: true, stdio: 'ignore'
						});
						child.unref();
					} else if (existsSync('/Applications/iTerm.app')) {
						const child = spawn('osascript', ['-e', `
							tell application "iTerm"
								create window with default profile command "bash -c '${attachCmd}'"
								tell current session of current window
									set name to "${windowTitle}"
								end tell
							end tell
						`], { detached: true, stdio: 'ignore' });
						child.unref();
					} else {
						const child = spawn('osascript', ['-e', `
							tell application "Terminal"
								do script "bash -c '${attachCmd}'"
								set custom title of front window to "${windowTitle}"
								activate
							end tell
						`], { detached: true, stdio: 'ignore' });
						child.unref();
					}
				} else {
					// Linux: find available terminal emulator
					const { stdout: whichResult } = await execAsync('which ghostty alacritty kitty gnome-terminal konsole xterm 2>/dev/null | head -1 || true');
					const terminalPath = whichResult.trim();

					if (terminalPath) {
						let child;

						if (terminalPath.includes('ghostty')) {
							child = spawn('ghostty', ['--title=' + windowTitle, '-e', 'bash', '-c', `tmux attach-session -t "${sessionName}"`], {
								detached: true,
								stdio: 'ignore'
							});
						} else if (terminalPath.includes('alacritty')) {
							child = spawn('alacritty', ['--title', windowTitle, '-e', 'tmux', 'attach-session', '-t', sessionName], {
								detached: true,
								stdio: 'ignore'
							});
						} else if (terminalPath.includes('kitty')) {
							child = spawn('kitty', ['--title', windowTitle, 'tmux', 'attach-session', '-t', sessionName], {
								detached: true,
								stdio: 'ignore'
							});
						} else if (terminalPath.includes('gnome-terminal')) {
							child = spawn('gnome-terminal', ['--title', windowTitle, '--', 'tmux', 'attach-session', '-t', sessionName], {
								detached: true,
								stdio: 'ignore'
							});
						} else if (terminalPath.includes('konsole')) {
							child = spawn('konsole', ['--new-tab', '-e', 'tmux', 'attach-session', '-t', sessionName], {
								detached: true,
								stdio: 'ignore'
							});
						} else {
							child = spawn('xterm', ['-title', windowTitle, '-e', 'tmux', 'attach-session', '-t', sessionName], {
								detached: true,
								stdio: 'ignore'
							});
						}

						child.unref();
					}
				}
			} catch (err) {
				// Non-fatal - session is created, terminal just didn't open
				console.error('Failed to attach terminal:', err);
			}
		}

		// Step 4d: Apply Hyprland border colors for the project
		// This colors the terminal window based on project config
		// Do this after terminal is opened (attach mode) or immediately (non-attach mode)
		// Best-effort - don't fail spawn if coloring fails
		try {
			const colorProjectName = projectName || (taskId ? taskId.split('-')[0] : null);
			if (colorProjectName) {
				// Small delay to allow terminal window to be created
				setTimeout(async () => {
					try {
						const colorResponse = await globalThis.fetch(
							`http://localhost:${process.env.PORT || 3333}/api/sessions/${sessionName}/hyprland-color?project=${colorProjectName}`,
							{ method: 'POST' }
						);
						if (colorResponse.ok) {
							const colorResult = await colorResponse.json();
							console.log(`[spawn] Hyprland colors applied: ${colorResult.windowsUpdated || 0} windows`);
						}
					} catch (err) {
						// Silent - Hyprland coloring is optional
					}
				}, 1000);
			}
		} catch {
			// Silent - Hyprland coloring is optional
		}

		// Step 5: Build full task response from already-fetched task data
		// We already fetched task in Step 0 for routing evaluation
		let fullTask = null;
		if (task) {
			fullTask = {
				id: task.id,
				title: task.title,
				description: task.description,
				status: task.status,
				priority: task.priority,
				issue_type: task.issue_type
			};
		} else if (taskId) {
			// Minimal fallback if task wasn't fetched
			fullTask = { id: taskId };
		}

		// Step 6: Return WorkSession with agent selection info
		return json({
			success: true,
			session: {
				sessionName,
				agentName,
				agentProgram: selectedAgent.id,
				model: selectedModel.shortName,
				task: fullTask,
				project: projectName,  // Include project for session grouping on /work page
				imagePath: imagePath || null,
				output: '',
				lineCount: 0,
				tokens: 0,
				cost: 0,
				created: new Date().toISOString(),
				attached: attach,
				// Agent selection info
				matchedRule: matchedRule?.id || null,
				selectionReason
			},
			message: taskId
				? `Spawned ${selectedAgent.name} agent ${agentName} (${selectedModel.name}) for task ${taskId}${imagePath ? ' (with attached image)' : ''}`
				: `Spawned ${selectedAgent.name} planning session for agent ${agentName} (${selectedModel.name})`,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error in POST /api/work/spawn:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
