/**
 * Commands CRUD API - Single Command Operations
 *
 * Provides GET/PUT/DELETE for individual command files.
 *
 * Path format: /api/commands/{namespace}/{name}
 * Examples:
 *   - /api/commands/squad/start → ~/.claude/commands/squad/start.md
 *   - /api/commands/local/prune-resume → .claude/commands/prune-resume.md
 *
 * Security:
 *   - Namespace/name validated with regex (alphanumeric, hyphens, underscores)
 *   - Path traversal prevented (no .., /, etc.)
 *   - Only .md files allowed
 */

import { json, error } from '@sveltejs/kit';
import { readFile, writeFile, unlink, access, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { RequestHandler } from './$types';
import { parseCommandFrontmatter } from '$lib/utils/commandFrontmatter';

// Regex patterns for validation
// Namespace: alphanumeric, hyphens, underscores (e.g., "squad", "my-project", "local")
const NAMESPACE_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

// Command name: alphanumeric, hyphens, underscores (e.g., "start", "complete", "prune-resume")
const NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

// Reserved namespaces that have special handling
const LOCAL_NAMESPACE = 'local';

/**
 * Validate namespace and name against security patterns
 * Returns error message if invalid, null if valid
 */
function validatePath(namespace: string, name: string): string | null {
	// Check for path traversal attempts
	if (
		namespace.includes('..') ||
		namespace.includes('/') ||
		namespace.includes('\\') ||
		name.includes('..') ||
		name.includes('/') ||
		name.includes('\\')
	) {
		return 'Path traversal not allowed';
	}

	// Validate namespace format
	if (!NAMESPACE_REGEX.test(namespace)) {
		return `Invalid namespace format: "${namespace}". Must be alphanumeric with hyphens/underscores, starting with letter/number.`;
	}

	// Validate name format
	if (!NAME_REGEX.test(name)) {
		return `Invalid command name format: "${name}". Must be alphanumeric with hyphens/underscores, starting with letter/number.`;
	}

	return null;
}

/**
 * Resolve full path to command file
 *
 * Global commands: ~/.claude/commands/{namespace}/{name}.md
 * Local commands:  .claude/commands/{name}.md (in project directory)
 */
function resolveCommandPath(namespace: string, name: string, projectPath: string): string {
	if (namespace === LOCAL_NAMESPACE) {
		// Local commands are stored in project's .claude/commands/ directory
		return join(projectPath, '.claude', 'commands', `${name}.md`);
	} else {
		// Global commands are stored in ~/.claude/commands/{namespace}/ directory
		return join(homedir(), '.claude', 'commands', namespace, `${name}.md`);
	}
}

/**
 * Parse path segments from URL
 * Expected: namespace/name (e.g., "squad/start" or "local/prune-resume")
 */
function parsePathSegments(path: string): { namespace: string; name: string } | null {
	const segments = path.split('/').filter((s) => s.length > 0);

	if (segments.length !== 2) {
		return null;
	}

	return {
		namespace: segments[0],
		name: segments[1]
	};
}

/**
 * GET /api/commands/{namespace}/{name}
 *
 * Returns the content of a command file
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const pathParam = params.path;

	if (!pathParam) {
		throw error(400, 'Command path is required');
	}

	const parsed = parsePathSegments(pathParam);
	if (!parsed) {
		throw error(
			400,
			'Invalid path format. Expected: /api/commands/{namespace}/{name} (e.g., /api/commands/squad/start)'
		);
	}

	const { namespace, name } = parsed;

	// Validate path components
	const validationError = validatePath(namespace, name);
	if (validationError) {
		throw error(400, validationError);
	}

	// Get project path from query param or use default
	const projectPath = url.searchParams.get('project') || process.cwd().replace('/ide', '');

	const filePath = resolveCommandPath(namespace, name, projectPath);

	try {
		// Check if file exists
		await access(filePath);

		// Read file content
		const content = await readFile(filePath, 'utf-8');

		// Parse frontmatter
		const frontmatter = parseCommandFrontmatter(content);

		return json({
			namespace,
			name,
			path: filePath,
			invocation: namespace === LOCAL_NAMESPACE ? `/${name}` : `/${namespace}:${name}`,
			content,
			frontmatter: frontmatter || undefined
		});
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			throw error(404, `Command not found: ${namespace}/${name}`);
		}
		console.error(`Error reading command ${namespace}/${name}:`, err);
		throw error(500, `Failed to read command: ${(err as Error).message}`);
	}
};

/**
 * PUT /api/commands/{namespace}/{name}
 *
 * Creates or updates a command file
 * Body: { content: string }
 */
export const PUT: RequestHandler = async ({ params, url, request }) => {
	const pathParam = params.path;

	if (!pathParam) {
		throw error(400, 'Command path is required');
	}

	const parsed = parsePathSegments(pathParam);
	if (!parsed) {
		throw error(
			400,
			'Invalid path format. Expected: /api/commands/{namespace}/{name} (e.g., /api/commands/squad/start)'
		);
	}

	const { namespace, name } = parsed;

	// Validate path components
	const validationError = validatePath(namespace, name);
	if (validationError) {
		throw error(400, validationError);
	}

	// Parse request body
	let body: { content?: string };
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	if (!body.content || typeof body.content !== 'string') {
		throw error(400, 'Request body must contain "content" field with string value');
	}

	// Get project path from query param or use default
	const projectPath = url.searchParams.get('project') || process.cwd().replace('/ide', '');

	const filePath = resolveCommandPath(namespace, name, projectPath);

	try {
		// Ensure parent directory exists
		await mkdir(dirname(filePath), { recursive: true });

		// Check if file exists (for response message)
		let isNew = false;
		try {
			await access(filePath);
		} catch {
			isNew = true;
		}

		// Write file content
		await writeFile(filePath, body.content, 'utf-8');

		return json({
			success: true,
			namespace,
			name,
			path: filePath,
			invocation: namespace === LOCAL_NAMESPACE ? `/${name}` : `/${namespace}:${name}`,
			created: isNew,
			message: isNew
				? `Command ${namespace}/${name} created successfully`
				: `Command ${namespace}/${name} updated successfully`
		});
	} catch (err) {
		console.error(`Error writing command ${namespace}/${name}:`, err);
		throw error(500, `Failed to write command: ${(err as Error).message}`);
	}
};

/**
 * DELETE /api/commands/{namespace}/{name}
 *
 * Deletes a command file
 */
export const DELETE: RequestHandler = async ({ params, url }) => {
	const pathParam = params.path;

	if (!pathParam) {
		throw error(400, 'Command path is required');
	}

	const parsed = parsePathSegments(pathParam);
	if (!parsed) {
		throw error(
			400,
			'Invalid path format. Expected: /api/commands/{namespace}/{name} (e.g., /api/commands/squad/start)'
		);
	}

	const { namespace, name } = parsed;

	// Validate path components
	const validationError = validatePath(namespace, name);
	if (validationError) {
		throw error(400, validationError);
	}

	// Get project path from query param or use default
	const projectPath = url.searchParams.get('project') || process.cwd().replace('/ide', '');

	const filePath = resolveCommandPath(namespace, name, projectPath);

	try {
		// Check if file exists
		await access(filePath);

		// Delete file
		await unlink(filePath);

		return json({
			success: true,
			namespace,
			name,
			message: `Command ${namespace}/${name} deleted successfully`
		});
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			throw error(404, `Command not found: ${namespace}/${name}`);
		}
		console.error(`Error deleting command ${namespace}/${name}:`, err);
		throw error(500, `Failed to delete command: ${(err as Error).message}`);
	}
};
