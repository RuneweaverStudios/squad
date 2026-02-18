/**
 * LLM Process Endpoint
 *
 * Process text content with an LLM using custom instructions.
 * Returns structured JSON with the result and optional filename.
 *
 * Used by SendToLLM component in SessionCard to:
 * 1. Analyze terminal output
 * 2. Extract research results
 * 3. Generate summaries and documentation
 *
 * Task: squad-a7372 - add send terminal to llm button to sessioncard.svelte
 */

import { json } from '@sveltejs/kit';
import { llmCall, stripCodeBlocks } from '$lib/server/llmService';
import type { RequestHandler } from './$types';

interface ProcessRequest {
	/** The content to process (e.g., terminal output) */
	content: string;
	/** User instructions for how to process the content */
	instructions: string;
	/** Optional: suggest a filename if creating a file */
	suggestFilename?: boolean;
}

interface ProcessResponse {
	/** The processed result from the LLM */
	result: string;
	/** Suggested filename if applicable */
	suggestedFilename?: string;
	/** Provider used (api or cli) */
	provider: 'api' | 'cli';
	/** Processing time in ms */
	durationMs?: number;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as ProcessRequest;
		console.log('[llm/process] Request received:', { contentLength: body.content?.length, instructionsLength: body.instructions?.length, suggestFilename: body.suggestFilename });

		if (!body.content || typeof body.content !== 'string') {
			return json({ error: 'Missing required field: content' }, { status: 400 });
		}

		if (!body.instructions || typeof body.instructions !== 'string') {
			return json({ error: 'Missing required field: instructions' }, { status: 400 });
		}

		// Build the prompt
		const prompt = buildPrompt(body.content, body.instructions, body.suggestFilename);

		const startTime = Date.now();

		// Call the LLM
		const response = await llmCall(prompt, {
			maxTokens: 4096,
			model: 'claude-3-5-haiku-20241022' // Use fast model for this utility
		});

		const durationMs = Date.now() - startTime;

		// Try to parse structured response if suggestFilename was requested
		let result = response.result;
		let suggestedFilename: string | undefined;

		if (body.suggestFilename) {
			try {
				const cleaned = stripCodeBlocks(response.result);
				const parsed = JSON.parse(cleaned);
				if (parsed.result && typeof parsed.result === 'string') {
					result = parsed.result;
					suggestedFilename = parsed.filename || parsed.suggestedFilename;
				}
			} catch {
				// Response wasn't JSON, use as-is
			}
		}

		const processResponse: ProcessResponse = {
			result,
			suggestedFilename,
			provider: response.provider,
			durationMs
		};

		console.log('[llm/process] Response:', { resultLength: result?.length, suggestedFilename, provider: response.provider, durationMs });
		return json(processResponse);
	} catch (err) {
		console.error('[llm/process] Error:', err);
		return json(
			{
				error: err instanceof Error ? err.message : 'Unknown error processing content'
			},
			{ status: 500 }
		);
	}
};

function buildPrompt(content: string, instructions: string, suggestFilename?: boolean): string {
	let prompt = `You are a helpful assistant processing terminal output or text content.

<content>
${content}
</content>

<instructions>
${instructions}
</instructions>

Process the content according to the instructions above. Be concise and focused.`;

	if (suggestFilename) {
		prompt += `

IMPORTANT: Return your response as JSON with this structure:
{
  "result": "your processed content here",
  "filename": "suggested-filename.md"
}

For the filename:
- Use lowercase with hyphens
- Choose an appropriate extension (.md for markdown, .txt for plain text, .json for data)
- Make it descriptive of the content
- Do NOT include paths, just the filename`;
	}

	return prompt;
}
