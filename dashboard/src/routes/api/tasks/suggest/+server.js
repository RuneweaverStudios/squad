/**
 * Task Auto-Suggest API Endpoint
 *
 * Analyzes task title and description to suggest:
 * - Priority (P0-P4)
 * - Type (task, bug, feature, epic, chore)
 * - Project (jat, chimaro, jomarchy, etc.)
 * - Labels (relevant tags)
 * - Dependencies (related open tasks)
 *
 * Uses Claude Haiku for fast, cost-effective suggestions.
 *
 * Task: jat-3qgk - Auto prioritize and type a task
 */

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Get API key from environment
function getApiKey() {
	return env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
}

/**
 * Format open tasks for the prompt
 * @param {Array<{ id?: string, title?: string, priority?: number, issue_type?: string }>} tasks
 * @returns {Array<{ id?: string, title?: string, priority?: number, issue_type?: string }>}
 */
function formatOpenTasks(tasks) {
	if (!Array.isArray(tasks) || tasks.length === 0) {
		return [];
	}
	return tasks.slice(0, 30); // Limit to 30 tasks
}

// Default projects (fallback if no descriptions provided)
const DEFAULT_PROJECTS = ['jat', 'chimaro', 'jomarchy'];

/**
 * Build the prompt for Claude
 * @param {string} title
 * @param {string} description
 * @param {Array<{ id?: string, title?: string, priority?: number, issue_type?: string }>} openTasks
 * @param {Record<string, string>} projectDescriptions
 * @returns {string}
 */
function buildPrompt(title, description, openTasks, projectDescriptions = {}) {
	const taskList = openTasks
		.map((/** @type {{ id?: string, title?: string, priority?: number, issue_type?: string }} */ t) => `- ${t.id}: ${t.title} (P${t.priority}, ${t.issue_type})`)
		.join('\n');

	// Build project list with descriptions if available
	const projectNames = Object.keys(projectDescriptions).length > 0
		? Object.keys(projectDescriptions)
		: DEFAULT_PROJECTS;

	let projectSection;
	if (Object.keys(projectDescriptions).length > 0) {
		// Include project descriptions for better context
		const projectList = Object.entries(projectDescriptions)
			.map(([name, desc]) => `- ${name}: ${desc}`)
			.join('\n');
		projectSection = `AVAILABLE PROJECTS (with descriptions):
${projectList}

Projects without descriptions: ${projectNames.filter((/** @type {string} */ p) => !projectDescriptions[p]).join(', ') || 'none'}`;
	} else {
		projectSection = `AVAILABLE PROJECTS: ${projectNames.join(', ')}`;
	}

	return `You are a task triage assistant. Analyze this new task and suggest appropriate metadata.

NEW TASK:
Title: ${title}
Description: ${description}

${projectSection}

OPEN TASKS (for potential dependencies):
${taskList || 'No open tasks'}

Based on the task title and description, provide your suggestions in this exact JSON format:
{
  "priority": <number 0-4>,
  "type": "<task|bug|feature|epic|chore>",
  "project": "<project name or null>",
  "labels": ["<label1>", "<label2>"],
  "dependencies": ["<task-id1>", "<task-id2>"],
  "reasoning": "<brief explanation of your choices>"
}

Guidelines:
- Priority: P0=critical/blocking, P1=high/important, P2=medium/normal, P3=low, P4=backlog
- Type: bug=defect/error, feature=new functionality, task=general work, epic=large multi-part, chore=maintenance
- Project: Match to the most relevant project based on descriptions and keywords. Use null if no clear match.
- Labels: 2-4 relevant tags (e.g., "frontend", "api", "urgent", "documentation")
- Dependencies: Only include task IDs that this new task clearly depends on

Respond with ONLY the JSON object, no other text.`;
}

export async function POST({ request }) {
	try {
		const body = await request.json();
		const { title, description, openTasks: clientOpenTasks, projectDescriptions } = body;

		// Validate input
		if (!title || typeof title !== 'string' || title.trim().length === 0) {
			return json({ error: true, message: 'Title is required' }, { status: 400 });
		}

		// Get API key
		const apiKey = getApiKey();
		if (!apiKey) {
			return json(
				{
					error: true,
					message: 'ANTHROPIC_API_KEY not configured. Add it to dashboard/.env'
				},
				{ status: 500 }
			);
		}

		// Use client-provided open tasks (pre-fetched when drawer opened)
		const openTasks = formatOpenTasks(clientOpenTasks || []);

		// Build prompt with project descriptions for better context
		const prompt = buildPrompt(
			title.trim(),
			description?.trim() || '',
			openTasks,
			projectDescriptions || {}
		);

		// Call Claude API
		const response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify({
				model: 'claude-3-5-haiku-20241022',
				max_tokens: 500,
				messages: [
					{
						role: 'user',
						content: prompt
					}
				]
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('Claude API error:', response.status, errorText);
			return json(
				{
					error: true,
					message: `Claude API error: ${response.status}`,
					details: errorText
				},
				{ status: 502 }
			);
		}

		const result = await response.json();

		// Extract the text response
		const textContent = result.content?.find((/** @type {{ type?: string, text?: string }} */ c) => c.type === 'text');
		if (!textContent?.text) {
			return json(
				{
					error: true,
					message: 'No response from Claude'
				},
				{ status: 500 }
			);
		}

		// Parse the JSON response
		let suggestions;
		try {
			// Try to extract JSON from the response (handle potential markdown code blocks)
			let jsonText = textContent.text.trim();
			if (jsonText.startsWith('```')) {
				jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
			}
			suggestions = JSON.parse(jsonText);
		} catch (parseErr) {
			console.error('Failed to parse Claude response:', textContent.text);
			return json(
				{
					error: true,
					message: 'Failed to parse AI suggestions',
					raw: textContent.text
				},
				{ status: 500 }
			);
		}

		// Validate and sanitize suggestions
		// Use dynamic project names if descriptions provided, otherwise fallback to defaults
		const validProjects = Object.keys(projectDescriptions || {}).length > 0
			? Object.keys(projectDescriptions)
			: DEFAULT_PROJECTS;

		const sanitized = {
			priority: Math.max(0, Math.min(4, parseInt(suggestions.priority) || 2)),
			type: ['task', 'bug', 'feature', 'epic', 'chore'].includes(suggestions.type)
				? suggestions.type
				: 'task',
			project: validProjects.includes(suggestions.project) ? suggestions.project : null,
			labels: Array.isArray(suggestions.labels)
				? suggestions.labels.filter((/** @type {unknown} */ l) => typeof l === 'string').slice(0, 5)
				: [],
			dependencies: Array.isArray(suggestions.dependencies)
				? suggestions.dependencies
						.filter((/** @type {unknown} */ d) => typeof d === 'string' && openTasks.some((/** @type {{ id?: string }} */ t) => t.id === d))
						.slice(0, 3)
				: [],
			reasoning: suggestions.reasoning || ''
		};

		return json({
			success: true,
			suggestions: sanitized,
			usage: result.usage
		});
	} catch (err) {
		const error = /** @type {Error} */ (err);
		console.error('Error in task suggest API:', error);
		return json(
			{
				error: true,
				message: error.message || 'Internal server error'
			},
			{ status: 500 }
		);
	}
}
