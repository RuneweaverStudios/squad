/**
 * API endpoint to discover available Claude agent slash commands
 *
 * Commands are discovered from:
 * 1. ~/.claude/commands/{namespace}/*.md - Global namespaced commands
 * 2. .claude/commands/*.md - Project-local commands
 */

import { json, error } from '@sveltejs/kit';
import { readdirSync, existsSync, statSync, lstatSync, readFileSync } from 'fs';
import { writeFile, mkdir, access } from 'fs/promises';
import { join, basename, dirname } from 'path';
import { homedir } from 'os';
import type { RequestHandler } from './$types';
import type { SlashCommand } from '$lib/types/config';
import { parseCommandFrontmatter } from '$lib/utils/commandFrontmatter';

// Regex patterns for validation (same as in [...path]/+server.ts)
const NAMESPACE_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const LOCAL_NAMESPACE = 'local';

/**
 * Validate namespace and name against security patterns
 */
function validateCommandPath(namespace: string, name: string): string | null {
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

	if (!NAMESPACE_REGEX.test(namespace)) {
		return `Invalid namespace format: "${namespace}". Must be alphanumeric with hyphens/underscores, starting with letter/number.`;
	}

	if (!NAME_REGEX.test(name)) {
		return `Invalid command name format: "${name}". Must be alphanumeric with hyphens/underscores, starting with letter/number.`;
	}

	return null;
}

/**
 * Resolve full path to command file
 */
function resolveCommandFilePath(namespace: string, name: string, projectPath: string): string {
	if (namespace === LOCAL_NAMESPACE) {
		return join(projectPath, '.claude', 'commands', `${name}.md`);
	} else {
		return join(homedir(), '.claude', 'commands', namespace, `${name}.md`);
	}
}

// SlashCommand type imported from $lib/types/config

/**
 * Check if a path is a file (follows symlinks)
 */
function isFileOrSymlinkToFile(path: string): boolean {
	try {
		// statSync follows symlinks, so this checks the target
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

/**
 * Discover commands from a directory
 *
 * @param dir - Directory path to search
 * @param namespace - Namespace for these commands (e.g., "squad", "local")
 * @param prefix - Invocation prefix (e.g., "squad" for "/squad:start")
 * @param includeFrontmatter - Whether to read and parse frontmatter (default: true)
 */
function discoverCommands(
	dir: string,
	namespace: string,
	prefix: string,
	includeFrontmatter: boolean = true
): SlashCommand[] {
	const commands: SlashCommand[] = [];

	if (!existsSync(dir)) {
		return commands;
	}

	try {
		const entries = readdirSync(dir, { withFileTypes: true });

		for (const entry of entries) {
			if (entry.name.endsWith('.md')) {
				const fullPath = join(dir, entry.name);
				// Check if it's a file or a symlink to a file
				if (entry.isFile() || (entry.isSymbolicLink() && isFileOrSymlinkToFile(fullPath))) {
					const name = basename(entry.name, '.md');

					const command: SlashCommand = {
						name,
						invocation: prefix ? `/${prefix}:${name}` : `/${name}`,
						namespace,
						path: fullPath
					};

					// Read file content and parse frontmatter if requested
					if (includeFrontmatter) {
						try {
							const content = readFileSync(fullPath, 'utf-8');
							const frontmatter = parseCommandFrontmatter(content);
							if (frontmatter) {
								command.frontmatter = frontmatter;
							}
						} catch (readErr) {
							console.error(`Error reading frontmatter from ${fullPath}:`, readErr);
						}
					}

					commands.push(command);
				}
			}
		}
	} catch (error) {
		console.error(`Error reading commands from ${dir}:`, error);
	}

	return commands;
}

/**
 * Discover all available commands
 *
 * @param projectPath - Project directory path for local commands
 * @param includeFrontmatter - Whether to parse frontmatter (default: true)
 */
function discoverAllCommands(projectPath?: string, includeFrontmatter: boolean = true): SlashCommand[] {
	const allCommands: SlashCommand[] = [];
	const home = homedir();

	// 1. Discover global namespaced commands from ~/.claude/commands/{namespace}/
	//    Also picks up root-level .md files (skills) as namespace "global"
	const globalCommandsDir = join(home, '.claude', 'commands');
	if (existsSync(globalCommandsDir)) {
		try {
			const entries = readdirSync(globalCommandsDir, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isDirectory()) {
					// Namespaced commands: ~/.claude/commands/squad/*.md
					const nsPath = join(globalCommandsDir, entry.name);
					const nsCommands = discoverCommands(nsPath, entry.name, entry.name, includeFrontmatter);
					allCommands.push(...nsCommands);
				} else if (entry.name.endsWith('.md') && (entry.isFile() || entry.isSymbolicLink())) {
					// Root-level commands/skills: ~/.claude/commands/clipit.md
					const fullPath = join(globalCommandsDir, entry.name);
					if (isFileOrSymlinkToFile(fullPath)) {
						const name = basename(entry.name, '.md');
						const command: SlashCommand = {
							name,
							invocation: `/${name}`,
							namespace: 'skills',
							path: fullPath
						};
						if (includeFrontmatter) {
							try {
								const content = readFileSync(fullPath, 'utf-8');
								const frontmatter = parseCommandFrontmatter(content);
								if (frontmatter) {
									command.frontmatter = frontmatter;
								}
							} catch (readErr) {
								console.error(`Error reading frontmatter from ${fullPath}:`, readErr);
							}
						}
						allCommands.push(command);
					}
				}
			}
		} catch (error) {
			console.error('Error reading global commands:', error);
		}
	}

	// 2. Discover project-local commands from .claude/commands/
	if (projectPath) {
		const localCommandsDir = join(projectPath, '.claude', 'commands');
		const localCommands = discoverCommands(localCommandsDir, 'local', '', includeFrontmatter);
		allCommands.push(...localCommands);
	}

	// Sort by namespace then name
	allCommands.sort((a, b) => {
		if (a.namespace !== b.namespace) {
			// Put 'squad' first, then 'local', then others
			if (a.namespace === 'squad') return -1;
			if (b.namespace === 'squad') return 1;
			if (a.namespace === 'local') return -1;
			if (b.namespace === 'local') return 1;
			return a.namespace.localeCompare(b.namespace);
		}
		return a.name.localeCompare(b.name);
	});

	return allCommands;
}

/**
 * GET /api/commands
 *
 * Discover and list all available slash commands.
 *
 * Query params:
 *   - project: Project path for local commands (default: parent of cwd)
 *   - frontmatter: Whether to include parsed frontmatter (default: true)
 *   - debug: Include debug info (default: false)
 */
export const GET: RequestHandler = async ({ url }) => {
	// Get project path from query param or use default
	const projectPath = url.searchParams.get('project') || process.cwd().replace('/ide', '');
	const home = homedir();
	const globalDir = join(home, '.claude', 'commands');

	// Check if frontmatter parsing is requested (default: true)
	const includeFrontmatter = url.searchParams.get('frontmatter') !== 'false';

	const commands = discoverAllCommands(projectPath, includeFrontmatter);

	// Include debug info if requested
	const debug = url.searchParams.has('debug');
	const debugInfo = debug
		? {
				homedir: home,
				globalCommandsDir: globalDir,
				globalDirExists: existsSync(globalDir),
				globalDirContents: existsSync(globalDir)
					? readdirSync(globalDir, { withFileTypes: true }).map((e) => ({
							name: e.name,
							isDir: e.isDirectory()
						}))
					: []
			}
		: undefined;

	return json({
		commands,
		count: commands.length,
		project: projectPath,
		...(debug && { debug: debugInfo })
	});
}

/**
 * POST /api/commands
 *
 * Create a new command file
 * Body: { namespace: string, name: string, content: string }
 *
 * Examples:
 *   - { namespace: "squad", name: "new-cmd", content: "# New Command\n..." }
 *   - { namespace: "local", name: "my-cmd", content: "..." }
 */
export const POST: RequestHandler = async ({ url, request }) => {
	// Parse request body
	let body: { namespace?: string; name?: string; content?: string };
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	// Validate required fields
	if (!body.namespace || typeof body.namespace !== 'string') {
		throw error(400, 'Request body must contain "namespace" field (e.g., "squad" or "local")');
	}

	if (!body.name || typeof body.name !== 'string') {
		throw error(400, 'Request body must contain "name" field (e.g., "start" or "my-command")');
	}

	if (!body.content || typeof body.content !== 'string') {
		throw error(400, 'Request body must contain "content" field with the command markdown content');
	}

	const { namespace, name, content } = body;

	// Validate path components
	const validationError = validateCommandPath(namespace, name);
	if (validationError) {
		throw error(400, validationError);
	}

	// Get project path from query param or use default
	const projectPath = url.searchParams.get('project') || process.cwd().replace('/ide', '');

	const filePath = resolveCommandFilePath(namespace, name, projectPath);

	try {
		// Check if command already exists
		let exists = false;
		try {
			await access(filePath);
			exists = true;
		} catch {
			// File doesn't exist, which is expected for creation
		}

		if (exists) {
			throw error(
				409,
				`Command already exists: ${namespace}/${name}. Use PUT /api/commands/${namespace}/${name} to update.`
			);
		}

		// Ensure parent directory exists
		await mkdir(dirname(filePath), { recursive: true });

		// Write file content
		await writeFile(filePath, content, 'utf-8');

		return json(
			{
				success: true,
				namespace,
				name,
				path: filePath,
				invocation: namespace === LOCAL_NAMESPACE ? `/${name}` : `/${namespace}:${name}`,
				message: `Command ${namespace}/${name} created successfully`
			},
			{ status: 201 }
		);
	} catch (err) {
		// Re-throw SvelteKit errors
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		console.error(`Error creating command ${namespace}/${name}:`, err);
		throw error(500, `Failed to create command: ${(err as Error).message}`);
	}
};
