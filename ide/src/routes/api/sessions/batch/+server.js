/**
 * Batch Session Spawn API
 * POST /api/sessions/batch - Spawn N agents for N ready tasks
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import { listSessionsAsync } from '$lib/server/sessions.js';
import { CLAUDE_READY_PATTERNS, SHELL_PROMPT_PATTERNS } from '$lib/server/shellPatterns.js';
import { stripAnsi } from '$lib/utils/ansiToHtml.js';

const execAsync = promisify(exec);
const DB_PATH = process.env.AGENT_MAIL_DB || `${process.env.HOME}/.agent-mail.db`;

// Name components - nature/geography themed words (same as spawn endpoint)
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
	const slug = projectPath.split('/').filter(Boolean).pop() || 'unknown';
	const existing = /** @type {{ id: number } | undefined} */ (
		db.prepare('SELECT id FROM projects WHERE human_key = ?').get(projectPath)
	);
	if (existing) {
		return existing.id;
	}
	const result = db.prepare('INSERT INTO projects (slug, human_key) VALUES (?, ?)').run(slug, projectPath);
	return /** @type {number} */ (result.lastInsertRowid);
}

/**
 * Register agent in Agent Mail database
 * @param {string} agentName - Agent name
 * @param {string} projectPath - Project path
 * @param {string} model - Model name (e.g., "opus", "sonnet")
 * @returns {{ success: boolean, agentId?: number, error?: string }}
 */
function registerAgentInDb(agentName, projectPath, model) {
	try {
		const db = new Database(DB_PATH);
		try {
			const projectId = getOrCreateProject(db, projectPath);
			const existing = /** @type {{ id: number } | undefined} */ (
				db.prepare('SELECT id FROM agents WHERE project_id = ? AND name = ?').get(projectId, agentName)
			);
			if (existing) {
				db.prepare("UPDATE agents SET last_active_ts = datetime('now'), model = ? WHERE id = ?").run(model, existing.id);
				return { success: true, agentId: existing.id };
			}
			const result = db.prepare(`
				INSERT INTO agents (project_id, name, program, model, task_description)
				VALUES (?, ?, 'claude-code', ?, '')
			`).run(projectId, agentName, model);
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

/**
 * Load SQUAD config defaults
 * @returns {{ model: string, skip_permissions: boolean, agent_stagger: number, claude_startup_timeout: number }}
 */
function loadSquadDefaults() {
	const configPath = join(homedir(), '.config/squad/projects.json');
	const defaults = {
		model: 'opus',
		skip_permissions: false,
		agent_stagger: 30,
		claude_startup_timeout: 20
	};

	if (existsSync(configPath)) {
		try {
			const config = JSON.parse(readFileSync(configPath, 'utf-8'));
			if (config.defaults) {
				if (config.defaults.model) defaults.model = config.defaults.model;
				if (typeof config.defaults.skip_permissions === 'boolean') defaults.skip_permissions = config.defaults.skip_permissions;
				if (config.defaults.agent_stagger) defaults.agent_stagger = config.defaults.agent_stagger;
				if (typeof config.defaults.claude_startup_timeout === 'number') defaults.claude_startup_timeout = config.defaults.claude_startup_timeout;
			}
		} catch (err) {
			console.error('Failed to load SQUAD config:', err);
		}
	}

	return defaults;
}

/**
 * POST /api/sessions/batch
 * Spawn N new Claude Code sessions, each auto-attacking a ready task
 * Body:
 * - count: Number of agents to spawn (required, 1-10)
 * - project: Project path (default: current project)
 * - model: Model to use (default: from SQUAD config, fallback opus-4.5)
 * - stagger: Delay between spawns in ms (default: from SQUAD config agent_stagger * 1000)
 * - autoStart: Whether to run /squad:start auto (default: true)
 */
/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	try {
		const squadDefaults = loadSquadDefaults();
		const body = await request.json();
		const {
			count = 1,
			project,
			model = squadDefaults.model,
			stagger = squadDefaults.agent_stagger * 1000,
			autoStart = true,
			skipPermissions = squadDefaults.skip_permissions
		} = body;

		// Validate count
		const agentCount = Math.min(Math.max(parseInt(count, 10) || 1, 1), 10);

		// Get project path
		const projectPath = project || process.cwd().replace('/ide', '');

		// Get existing agent names from database for collision checking
		// Also include active tmux session names to avoid conflicts
		const existingDbNames = getExistingAgentNames();
		const existingSessions = await listSessionsAsync();
		const existingSessionNames = new Set(existingSessions.map(s => s.agentName?.toLowerCase()).filter(Boolean));
		const existingNames = new Set([...existingDbNames, ...existingSessionNames]);

		// Generate unique agent names using JS word lists
		const agentNames = [];
		for (let i = 0; i < agentCount; i++) {
			const name = generateUniqueName(existingNames);
			agentNames.push(name);
			existingNames.add(name.toLowerCase());
		}

		// Spawn sessions with staggered timing
		// Now using squad-{AgentName} naming since we pre-register agents
		const results = [];

		// Default tmux dimensions for proper terminal output width
		// 80 columns is the standard terminal width that Claude Code expects
		// 40 rows provides good vertical context for terminal output
		const TMUX_INITIAL_WIDTH = 80;
		const TMUX_INITIAL_HEIGHT = 40;

		// SQUAD bootstrap prompt - minimal identity, commands load full docs on-demand
		const squadBootstrap = `You are a SQUAD agent. Run /squad:start to begin work.`;

		for (let i = 0; i < agentCount; i++) {
			const agentName = agentNames[i];
			const sessionName = `squad-${agentName}`;

			try {
				// Step 1: Register agent in Agent Mail SQLite database
				const registerResult = registerAgentInDb(agentName, projectPath, model);
				if (!registerResult.success) {
					console.error(`[batch] Failed to register agent ${agentName}:`, registerResult.error);
					results.push({
						success: false,
						sessionName,
						agentName,
						index: i + 1,
						error: `Failed to register agent: ${registerResult.error}`
					});
					continue;
				}
				console.log(`[batch] Registered agent ${agentName} in Agent Mail database (id: ${registerResult.agentId})`);

				// Step 2: Write agent identity file for session-start hook
				try {
					const sessionsDir = `${projectPath}/.claude/sessions`;
					mkdirSync(sessionsDir, { recursive: true });
					const tmuxAgentFile = `${sessionsDir}/.tmux-agent-${sessionName}`;
					writeFileSync(tmuxAgentFile, agentName, 'utf-8');
				} catch (err) {
					console.warn(`[batch] Failed to write agent identity file for ${agentName}:`, err);
				}

				// Step 3: Build the claude command
				let claudeCmd = `cd "${projectPath}" && claude`;
				if (model) claudeCmd += ` --model ${model}`;
				if (skipPermissions) claudeCmd += ' --dangerously-skip-permissions';
				claudeCmd += ` --append-system-prompt '${squadBootstrap}'`;

				// Step 4: Create tmux session with explicit dimensions
				const command = `tmux new-session -d -s "${sessionName}" -x ${TMUX_INITIAL_WIDTH} -y ${TMUX_INITIAL_HEIGHT} -c "${projectPath}" && sleep 0.3 && tmux send-keys -t "${sessionName}" "${claudeCmd}" Enter`;
				await execAsync(command);

				// Step 5: Wait for Claude to start and send initial prompt
				if (autoStart) {
					const maxWaitSeconds = squadDefaults.claude_startup_timeout;
					const checkIntervalMs = 500;
					let claudeReady = false;
					let shellPromptDetected = false;

					for (let waited = 0; waited < maxWaitSeconds * 1000 && !claudeReady; waited += checkIntervalMs) {
						await new Promise(resolve => setTimeout(resolve, checkIntervalMs));

						try {
							const { stdout: paneOutput } = await execAsync(
								`tmux capture-pane -t "${sessionName}" -p 2>/dev/null`
							);

							const hasClaudePatterns = CLAUDE_READY_PATTERNS.some(p => paneOutput.includes(p));
							const outputLowercase = paneOutput.toLowerCase();
							const hasShellPatterns = SHELL_PROMPT_PATTERNS.some(p => paneOutput.includes(p));
							const mentionsClaude = outputLowercase.includes('claude');
							const isLikelyShellPrompt = hasShellPatterns && !mentionsClaude && waited > 3000;

							if (hasClaudePatterns) {
								claudeReady = true;
								console.log(`[batch] Claude Code ready for ${sessionName} after ${waited}ms`);
							} else if (isLikelyShellPrompt && waited > 5000) {
								shellPromptDetected = true;
								console.error(`[batch] Claude Code failed to start for ${sessionName} - shell prompt detected`);
								console.error(`[batch] Terminal output (last 300 chars): ${stripAnsi(paneOutput.slice(-300))}`);
								break;
							}
						} catch {
							// Session might not exist yet, continue waiting
						}
					}

					if (claudeReady) {
						// Send /squad:start with agent name so it resumes existing registration
						const initialPrompt = `/squad:start ${agentName} auto`;
						const escapedPrompt = initialPrompt.replace(/"/g, '\\"').replace(/\$/g, '\\$');
						await execAsync(`tmux send-keys -t "${sessionName}" -- "${escapedPrompt}"`);
						await new Promise(resolve => setTimeout(resolve, 100));
						await execAsync(`tmux send-keys -t "${sessionName}" Enter`);
					} else if (shellPromptDetected) {
						console.error(`[batch] ABORTING prompt for ${sessionName} - Claude not running (shell detected)`);
						results.push({
							success: false,
							sessionName,
							agentName,
							index: i + 1,
							error: 'Claude Code failed to start - shell prompt detected'
						});
						continue;
					} else {
						console.warn(`[batch] Skipping prompt for ${sessionName} - Claude not ready after timeout`);
					}
				}

				results.push({
					success: true,
					sessionName,
					agentName,
					index: i + 1
				});
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : String(err);
				results.push({
					success: false,
					sessionName,
					agentName,
					index: i + 1,
					error: errorMessage
				});
			}

			// Stagger between spawns (except last one)
			if (i < agentCount - 1 && stagger > 0) {
				await new Promise(resolve => setTimeout(resolve, stagger));
			}
		}

		const successCount = results.filter(r => r.success).length;
		const failCount = results.filter(r => !r.success).length;

		return json({
			success: failCount === 0,
			requested: agentCount,
			spawned: successCount,
			failed: failCount,
			results,
			project: projectPath,
			model,
			skipPermissions,
			stagger,
			autoStart,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error in POST /api/sessions/batch:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
