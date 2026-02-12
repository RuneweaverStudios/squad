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
 * @param {string} templateId
 * @returns {object|null}
 */
function findScheduledTask(templateId) {
	const command = `/quick-command:${templateId}`;
	const scheduled = getScheduledTasks();
	return scheduled.find((t) => t.command === command && t.status !== 'closed') || null;
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
				project: task.project
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
		const { cronExpr, project, model = 'haiku', variables = {} } = body;

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

		// Compute first next_run_at using cron-parser
		// Import dynamically since this is an IDE route
		let nextRunAt;
		try {
			const { nextCronRun } = await import(
				'../../../../../../tools/scheduler/lib/cron.js'
			);
			nextRunAt = nextCronRun(cronExpr);
		} catch {
			// Fallback: set to now + 1 minute if cron-parser not available
			nextRunAt = new Date(Date.now() + 60000).toISOString();
		}

		// Build the command string with template ID
		const command = `/quick-command:${params.id}`;

		// Store variable defaults in the description as JSON block
		const variableBlock =
			Object.keys(variables).length > 0
				? `\n\n---\nScheduled variables:\n\`\`\`json\n${JSON.stringify(variables, null, 2)}\n\`\`\``
				: '';

		const description = `Scheduled quick command: ${template.name}\nTemplate: ${template.prompt.substring(0, 200)}${template.prompt.length > 200 ? '...' : ''}${variableBlock}`;

		// Create the task
		const task = createTask({
			projectPath: projectInfo.path,
			title: `Scheduled: ${template.name}`,
			description,
			type: 'chore',
			priority: 3,
			labels: ['quick-command', 'scheduled'],
			command,
			model: model || template.defaultModel || 'haiku',
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
