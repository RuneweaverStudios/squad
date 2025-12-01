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

// Format open tasks for the prompt
function formatOpenTasks(tasks) {
	if (!Array.isArray(tasks) || tasks.length === 0) {
		return [];
	}
	return tasks.slice(0, 30); // Limit to 30 tasks
}

// Available projects
const PROJECTS = ['jat', 'chimaro', 'jomarchy'];

// Build the prompt for Claude
function buildPrompt(title, description, openTasks) {
	const taskList = openTasks
		.map((t) => `- ${t.id}: ${t.title} (P${t.priority}, ${t.issue_type})`)
		.join('\n');

	return `You are a task triage assistant. Analyze this new task and suggest appropriate metadata.

NEW TASK:
Title: ${title}
Description: ${description}

AVAILABLE PROJECTS: ${PROJECTS.join(', ')}

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
- Project: Detect from task ID patterns, keywords, or null if unclear
- Labels: 2-4 relevant tags (e.g., "frontend", "api", "urgent", "documentation")
- Dependencies: Only include task IDs that this new task clearly depends on

Respond with ONLY the JSON object, no other text.`;
}

export async function POST({ request }) {
	try {
		const body = await request.json();
		const { title, description, openTasks: clientOpenTasks } = body;

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

		// Build prompt
		const prompt = buildPrompt(title.trim(), description?.trim() || '', openTasks);

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
		const textContent = result.content?.find((c) => c.type === 'text');
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
		const sanitized = {
			priority: Math.max(0, Math.min(4, parseInt(suggestions.priority) || 2)),
			type: ['task', 'bug', 'feature', 'epic', 'chore'].includes(suggestions.type)
				? suggestions.type
				: 'task',
			project: PROJECTS.includes(suggestions.project) ? suggestions.project : null,
			labels: Array.isArray(suggestions.labels)
				? suggestions.labels.filter((l) => typeof l === 'string').slice(0, 5)
				: [],
			dependencies: Array.isArray(suggestions.dependencies)
				? suggestions.dependencies
						.filter((d) => typeof d === 'string' && openTasks.some((t) => t.id === d))
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
		console.error('Error in task suggest API:', err);
		return json(
			{
				error: true,
				message: err.message || 'Internal server error'
			},
			{ status: 500 }
		);
	}
}
