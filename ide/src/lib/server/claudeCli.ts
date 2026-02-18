/**
 * Claude CLI Utility
 *
 * Provides LLM calls via the `claude -p` command for users who have Claude Code
 * authenticated but don't have a separate ANTHROPIC_API_KEY configured.
 *
 * This removes friction for users - they can use task suggestions, commit message
 * generation, and other AI features without configuring an API key.
 *
 * Usage:
 *   const response = await claudeCliCall("Your prompt here", { model: 'haiku' });
 *   const parsed = JSON.parse(response.result);
 *
 * Task: squad-gygxz - API key alternative using claude CLI
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ClaudeCliResponse {
	result: string;
	usage?: {
		input_tokens: number;
		output_tokens: number;
		cache_creation_input_tokens?: number;
		cache_read_input_tokens?: number;
	};
	cost_usd?: number;
	duration_ms?: number;
	model?: string;
}

export interface ClaudeCliOptions {
	model?: 'haiku' | 'sonnet' | 'opus';
	timeout?: number; // in milliseconds, default 30000
}

/**
 * Call Claude via the CLI in headless mode.
 *
 * Uses the user's existing Claude Code authentication, so no API key needed.
 *
 * @param prompt - The prompt to send to Claude
 * @param options - Optional model selection and timeout
 * @returns The response with result, usage stats, and cost
 * @throws Error if claude CLI fails or times out
 */
export async function claudeCliCall(
	prompt: string,
	options?: ClaudeCliOptions
): Promise<ClaudeCliResponse> {
	const model = options?.model || 'haiku';
	const timeout = options?.timeout || 30000;

	// Escape the prompt for shell - use base64 to handle any special characters
	const base64Prompt = Buffer.from(prompt).toString('base64');

	try {
		const { stdout } = await execAsync(
			`echo "${base64Prompt}" | base64 -d | claude -p --model ${model} --output-format json`,
			{ timeout }
		);

		const response = JSON.parse(stdout);

		if (response.is_error) {
			throw new Error(response.result || 'Claude CLI returned an error');
		}

		// Strip markdown code blocks if present (haiku sometimes wraps JSON in ```)
		let result = response.result || '';
		if (result.startsWith('```')) {
			result = result.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
		}

		// Extract model name from modelUsage keys
		const modelUsed = response.modelUsage ? Object.keys(response.modelUsage)[0] : undefined;

		return {
			result,
			usage: response.usage
				? {
						input_tokens: response.usage.input_tokens || 0,
						output_tokens: response.usage.output_tokens || 0,
						cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
						cache_read_input_tokens: response.usage.cache_read_input_tokens
					}
				: undefined,
			cost_usd: response.total_cost_usd,
			duration_ms: response.duration_ms,
			model: modelUsed
		};
	} catch (error) {
		const err = error as Error & { killed?: boolean; signal?: string };

		if (err.killed || err.signal === 'SIGTERM') {
			throw new Error(`Claude CLI timed out after ${timeout}ms`);
		}

		// Check if it's a "command not found" error
		if (err.message?.includes('command not found') || err.message?.includes('ENOENT')) {
			throw new Error('Claude CLI not found. Please install Claude Code.');
		}

		throw new Error(`Claude CLI error: ${err.message}`);
	}
}

/**
 * Check if Claude CLI is available and authenticated.
 *
 * @returns true if claude CLI is available and can make API calls
 */
export async function isClaudeCliAvailable(): Promise<boolean> {
	try {
		// Quick test - just check if claude command exists and responds
		await execAsync('claude --version', { timeout: 5000 });
		return true;
	} catch {
		return false;
	}
}
