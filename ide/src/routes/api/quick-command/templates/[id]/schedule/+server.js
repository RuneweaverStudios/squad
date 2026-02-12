/**
 * Quick Command Template Schedule API
 * POST   /api/quick-command/templates/[id]/schedule - Create scheduled task from template
 * DELETE /api/quick-command/templates/[id]/schedule - Remove schedule (close the scheduled task)
 * GET    /api/quick-command/templates/[id]/schedule - Get schedule status for template
 */

import { json } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createTask, getScheduledTasks, updateTask, closeTask } from '$lib/server/jat-tasks.js';
import { getProjectPath } from '$lib/server/projectPaths.js';

const CONFIG_DIR = join(homedir(), '.config', 'jat');
const TEMPLATES_FILE = join(CONFIG_DIR, 'quick-commands.json');

/**
 * Read templates from config file.
 * @returns {Promise<Array>}
 */
async function readTemplates() {
	try {
		if (!existsSync(TEMPLATES_FILE)) return [];
		const content = await readFile(TEMPLATES_FILE, 'utf-8');
		const data = JSON.parse(content);
		return Array.isArray(data) ? data : [];
	} catch {
		return [];
	}
}

/**
 * Find the scheduled task for a template.
 * Matches both quick-command and spawn-agent modes.
 * @param {string} templateId
 * @returns {object|null}
 */
function findScheduledTask(templateId) {
	const quickCommand = `/quick-command:${templateId}`;
	const scheduled = getScheduledTasks();
	// Match by quick-command prefix OR by title pattern for spawn-agent mode
	return scheduled.find((t) => {
		if (t.status === 'closed') return false;
		if (t.command === quickCommand) return true;
		// spawn-agent tasks use /jat:start but have a template-id marker in description
		if (t.description?.includes(`template-id:${templateId}`)) return true;
		return false;
	}) || null;
}

/**
 * Determine run mode from a scheduled task.
 * @param {object} task
 * @param {string} templateId
 * @returns {'quick-command' | 'spawn-agent'}
 */
function getRunMode(task, templateId) {
	if (task.command === `/quick-command:${templateId}`) return 'quick-command';
	return 'spawn-agent';
}

/** @type {import('./$types').RequestHandler} */
export async function GET({ params }) {
	try {
		const task = findScheduledTask(params.id);
		if (!task) {
			return json({ scheduled: false });
		}

		return json({
			scheduled: true,
			task: {
				id: task.id,
				title: task.title,
				schedule_cron: task.schedule_cron,
				next_run_at: task.next_run_at,
				model: task.model,
				status: task.status,
				project: task.project,
				runMode: getRunMode(task, params.id)
			}
		});
	} catch (error) {
		console.error(`[schedule] Failed to get schedule for template ${params.id}:`, error);
		return json({ error: 'Failed to get schedule', message: error.message }, { status: 500 });
	}
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ params, request }) {
	try {
		const body = await request.json();
		const { cronExpr, project, model = 'haiku', runMode = 'quick-command', variables = {} } = body;

		// Validate required fields
		if (!cronExpr || typeof cronExpr !== 'string') {
			return json(
				{ error: 'Missing required field: cronExpr', message: 'Cron expression is required' },
				{ status: 400 }
			);
		}

		if (!project || typeof project !== 'string') {
			return json(
				{ error: 'Missing required field: project', message: 'Project name is required' },
				{ status: 400 }
			);
		}

		// Find the template
		const templates = await readTemplates();
		const template = templates.find((t) => t.id === params.id);
		if (!template) {
			return json(
				{ error: 'Template not found', message: `No template with ID '${params.id}'` },
				{ status: 404 }
			);
		}

		// Check if already scheduled
		const existing = findScheduledTask(params.id);
		if (existing) {
			return json(
				{
					error: 'Already scheduled',
					message: `Template '${template.name}' is already scheduled (task ${existing.id})`
				},
				{ status: 409 }
			);
		}

		// Resolve project path
		const projectInfo = await getProjectPath(project);
		if (!projectInfo.exists) {
			return json(
				{ error: 'Project not found', message: `Project '${project}' not found` },
				{ status: 404 }
			);
		}

		// Compute first next_run_at using cron-parser from the scheduler
		// Use createRequire to resolve at runtime (avoids Rollup static analysis)
		let nextRunAt;
		try {
			const { createRequire } = await import('module');
			const { join } = await import('path');
			const require = createRequire(join(process.cwd(), '..', 'tools', 'scheduler', 'lib', 'cron.js'));
			const cronParser = require('cron-parser');
			const interval = cronParser.parseExpression(cronExpr, { currentDate: new Date(), tz: 'UTC' });
			nextRunAt = interval.next().toISOString();
		} catch {
			// Fallback: set to now + 1 minute if cron-parser not available
			nextRunAt = new Date(Date.now() + 60000).toISOString();
		}

		// Build the command string based on run mode
		const isSpawnAgent = runMode === 'spawn-agent';
		const command = isSpawnAgent ? '/jat:start' : `/quick-command:${params.id}`;

		// Store variable defaults in the description as JSON block
		const variableBlock =
			Object.keys(variables).length > 0
				? `\n\n---\nScheduled variables:\n\`\`\`json\n${JSON.stringify(variables, null, 2)}\n\`\`\``
				: '';

		// For spawn-agent mode, include full prompt so the agent has context
		const promptSection = isSpawnAgent
			? `\n\nPrompt:\n${template.prompt}`
			: `\nTemplate: ${template.prompt.substring(0, 200)}${template.prompt.length > 200 ? '...' : ''}`;

		const description = `Scheduled ${isSpawnAgent ? 'agent task' : 'quick command'}: ${template.name}${promptSection}\ntemplate-id:${params.id}${variableBlock}`;

		// Create the task
		const task = createTask({
			projectPath: projectInfo.path,
			title: `Scheduled: ${template.name}`,
			description,
			type: 'chore',
			priority: 3,
			labels: isSpawnAgent ? ['scheduled', 'agent'] : ['quick-command', 'scheduled'],
			command,
			model: model || (isSpawnAgent ? 'sonnet' : template.defaultModel || 'haiku'),
			schedule_cron: cronExpr,
			next_run_at: nextRunAt
		});

		return json({
			success: true,
			task: {
				id: task.id,
				title: task.title,
				schedule_cron: task.schedule_cron,
				next_run_at: task.next_run_at,
				model: task.model,
				project
			},
			message: `Template '${template.name}' scheduled with cron: ${cronExpr}`
		});
	} catch (error) {
		console.error(`[schedule] Failed to schedule template ${params.id}:`, error);
		return json(
			{ error: 'Failed to schedule template', message: error.message },
			{ status: 500 }
		);
	}
}

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ params }) {
	try {
		const task = findScheduledTask(params.id);
		if (!task) {
			return json(
				{ error: 'Not scheduled', message: 'Template is not currently scheduled' },
				{ status: 404 }
			);
		}

		// Close the scheduled task
		closeTask(task.id, 'Schedule removed');

		return json({
			success: true,
			message: `Schedule removed for template (task ${task.id} closed)`
		});
	} catch (error) {
		console.error(`[schedule] Failed to remove schedule for template ${params.id}:`, error);
		return json(
			{ error: 'Failed to remove schedule', message: error.message },
			{ status: 500 }
		);
	}
}
