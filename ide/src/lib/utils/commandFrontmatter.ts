/**
 * Command Frontmatter Parser
 *
 * Parses YAML frontmatter from slash command files.
 * Used by the commands API to provide rich metadata for commands.
 *
 * Frontmatter format:
 * ```md
 * ---
 * description: Start working on a task
 * author: squad
 * version: 1.0.0
 * tags: workflow, agent
 * shortcut: Alt+S
 * argument-hint: [agent-name | task-id]
 * ---
 * ```
 *
 * @see CommandFrontmatter type in $lib/types/config.ts
 */

import * as yaml from 'js-yaml';
import type { CommandFrontmatter } from '$lib/types/config';

/**
 * Extract and parse YAML frontmatter from markdown content
 *
 * @param content - Full markdown file content
 * @returns Parsed frontmatter object or null if none found
 */
export function parseCommandFrontmatter(content: string): CommandFrontmatter | null {
	if (!content || typeof content !== 'string') {
		return null;
	}

	const lines = content.split('\n');

	// Check if content starts with ---
	if (lines.length === 0 || lines[0].trim() !== '---') {
		return null;
	}

	// Find closing ---
	let endIndex = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trim() === '---') {
			endIndex = i;
			break;
		}
	}

	// No closing marker found
	if (endIndex === -1) {
		return null;
	}

	// Extract YAML content between markers
	const yamlContent = lines.slice(1, endIndex).join('\n');

	// Empty frontmatter
	if (yamlContent.trim().length === 0) {
		return {};
	}

	try {
		const parsed = yaml.load(yamlContent) as Record<string, unknown> | null;

		if (!parsed || typeof parsed !== 'object') {
			return {};
		}

		// Map parsed YAML to CommandFrontmatter structure
		const frontmatter: CommandFrontmatter = {};

		// description (string)
		if ('description' in parsed && typeof parsed.description === 'string') {
			frontmatter.description = parsed.description;
		}

		// author (string)
		if ('author' in parsed && typeof parsed.author === 'string') {
			frontmatter.author = parsed.author;
		}

		// version (string)
		if ('version' in parsed) {
			// Convert to string in case it's a number (e.g., 1.0)
			frontmatter.version = String(parsed.version);
		}

		// tags (string or string[])
		if ('tags' in parsed) {
			if (typeof parsed.tags === 'string') {
				frontmatter.tags = parsed.tags;
			} else if (Array.isArray(parsed.tags)) {
				frontmatter.tags = parsed.tags.filter((t): t is string => typeof t === 'string');
			}
		}

		// shortcut (string)
		if ('shortcut' in parsed && typeof parsed.shortcut === 'string') {
			frontmatter.shortcut = parsed.shortcut;
		}

		// argument-hint (custom field, kebab-case to camelCase)
		if ('argument-hint' in parsed) {
			if (typeof parsed['argument-hint'] === 'string') {
				frontmatter.argumentHint = parsed['argument-hint'];
			} else if (Array.isArray(parsed['argument-hint'])) {
				// Convert array to string representation
				frontmatter.argumentHint = '[' + parsed['argument-hint'].join(' | ') + ']';
			}
		}

		return frontmatter;
	} catch (e) {
		// YAML parse error - return null to indicate invalid frontmatter
		console.error('Error parsing command frontmatter:', e);
		return null;
	}
}

/**
 * Get the markdown content without frontmatter
 *
 * @param content - Full markdown file content
 * @returns Content without frontmatter, or original content if no frontmatter
 */
export function stripFrontmatter(content: string): string {
	if (!content || typeof content !== 'string') {
		return content;
	}

	const lines = content.split('\n');

	// Check if content starts with ---
	if (lines.length === 0 || lines[0].trim() !== '---') {
		return content;
	}

	// Find closing ---
	let endIndex = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trim() === '---') {
			endIndex = i;
			break;
		}
	}

	// No closing marker found - return original
	if (endIndex === -1) {
		return content;
	}

	// Return content after frontmatter
	return lines.slice(endIndex + 1).join('\n').trimStart();
}
