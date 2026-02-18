/**
 * Search Synthesis API Endpoint
 *
 * POST /api/search/synthesize
 * Body: { query: string, results: { tasks: [], memory: [], files: [] } }
 *
 * Uses LLM service (API key with claude -p fallback) to synthesize
 * search results into a structured summary.
 *
 * Returns: { summary, recommendedAction, keyFiles, relatedTasks }
 *
 * Task: squad-tvos9.3 - Build unified /api/search endpoint
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { llmCall, parseJsonResponse } from '$lib/server/llmService';

interface SearchResults {
	tasks: Array<{
		id: string;
		title: string;
		status: string;
		priority: number;
		issue_type?: string;
		snippet?: string;
		score?: number;
	}>;
	memory: Array<{
		file: string;
		taskId?: string;
		section?: string;
		snippet?: string;
		score?: number;
	}>;
	files: Array<{
		path: string;
		line?: number;
		snippet?: string;
		matchType?: string;
	}>;
}

interface SynthesisResponse {
	summary: string;
	recommendedAction: string | null;
	keyFiles: string[];
	relatedTasks: string[];
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { query, results } = body as { query: string; results: SearchResults };

		if (!query || typeof query !== 'string') {
			return json({ error: 'Missing required field: query' }, { status: 400 });
		}

		if (!results || typeof results !== 'object') {
			return json({ error: 'Missing required field: results' }, { status: 400 });
		}

		const totalResults =
			(results.tasks?.length || 0) +
			(results.memory?.length || 0) +
			(results.files?.length || 0);

		if (totalResults === 0) {
			return json({
				summary: 'No results found for this query.',
				recommendedAction: null,
				keyFiles: [],
				relatedTasks: []
			});
		}

		const prompt = buildSynthesisPrompt(query, results);

		const llmResponse = await llmCall(prompt, {
			maxTokens: 500,
			model: 'haiku'
		});

		let synthesis: SynthesisResponse;
		try {
			synthesis = parseJsonResponse<SynthesisResponse>(llmResponse.result);
		} catch {
			// LLM returned non-JSON; wrap as summary
			synthesis = {
				summary: llmResponse.result.slice(0, 500),
				recommendedAction: null,
				keyFiles: [],
				relatedTasks: []
			};
		}

		return json({
			...synthesis,
			provider: llmResponse.provider,
			model: llmResponse.model
		});
	} catch (err) {
		console.error('[search/synthesize] Error:', err);
		const message = (err as Error).message;

		// Distinguish LLM availability errors from other errors
		if (message.includes('No LLM provider') || message.includes('not available')) {
			return json(
				{ error: 'LLM synthesis unavailable. Configure an API key or install Claude CLI.' },
				{ status: 503 }
			);
		}

		return json(
			{ error: `Synthesis failed: ${message}` },
			{ status: 500 }
		);
	}
};

/**
 * Build the prompt for LLM synthesis.
 */
function buildSynthesisPrompt(query: string, results: SearchResults): string {
	const parts: string[] = [`Search query: "${query}"\n`];

	if (results.tasks?.length > 0) {
		parts.push('=== TASK RESULTS ===');
		for (const t of results.tasks) {
			parts.push(`- ${t.id} [${t.status}] P${t.priority}: ${t.title}`);
			if (t.snippet) parts.push(`  ${t.snippet.slice(0, 150)}`);
		}
		parts.push('');
	}

	if (results.memory?.length > 0) {
		parts.push('=== MEMORY RESULTS ===');
		for (const m of results.memory) {
			const task = m.taskId ? ` [${m.taskId}]` : '';
			const section = m.section ? ` §${m.section}` : '';
			parts.push(`- ${m.file}${task}${section} (score: ${m.score || 0})`);
			if (m.snippet) parts.push(`  ${m.snippet.slice(0, 150)}`);
		}
		parts.push('');
	}

	if (results.files?.length > 0) {
		parts.push('=== FILE RESULTS ===');
		for (const f of results.files) {
			const loc = f.line ? `${f.path}:${f.line}` : f.path;
			parts.push(`- ${loc} (${f.matchType || 'match'})`);
			if (f.snippet) parts.push(`  ${f.snippet.slice(0, 150)}`);
		}
		parts.push('');
	}

	parts.push(`Synthesize these search results for the query "${query}".`);
	parts.push('Return a JSON object with these fields:');
	parts.push('- summary: 1-2 sentence summary of what was found');
	parts.push('- recommendedAction: suggested next step based on results');
	parts.push('- keyFiles: array of the most relevant file paths');
	parts.push('- relatedTasks: array of related task IDs');
	parts.push('\nRespond with ONLY the JSON object, no other text.');

	return parts.join('\n');
}
