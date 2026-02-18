/**
 * API endpoint to export slash commands as a JSON file
 *
 * GET /api/commands/export
 * - Returns all commands with their content as a downloadable JSON file
 * - Query params:
 *   - namespace: Filter by namespace (optional, comma-separated)
 */

import { json, error } from '@sveltejs/kit';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import type { RequestHandler } from './$types';

interface ExportedCommand {
	name: string;
	namespace: string;
	invocation: string;
	content: string;
}

interface CommandsExport {
	version: 1;
	exportedAt: string;
	commandCount: number;
	commands: ExportedCommand[];
}

/**
 * Check if a path is a file (follows symlinks)
 */
function isFileOrSymlinkToFile(path: string): boolean {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

/**
 * Read all commands from a directory
 */
function readCommandsFromDir(dir: string, namespace: string, prefix: string): ExportedCommand[] {
	const commands: ExportedCommand[] = [];

	if (!existsSync(dir)) {
		return commands;
	}

	try {
		const entries = readdirSync(dir, { withFileTypes: true });

		for (const entry of entries) {
			if (entry.name.endsWith('.md')) {
				const fullPath = join(dir, entry.name);
				if (entry.isFile() || (entry.isSymbolicLink() && isFileOrSymlinkToFile(fullPath))) {
					const name = basename(entry.name, '.md');
					try {
						const content = readFileSync(fullPath, 'utf-8');
						commands.push({
							name,
							namespace,
							invocation: prefix ? `/${prefix}:${name}` : `/${name}`,
							content
						});
					} catch (err) {
						console.error(`Error reading command ${fullPath}:`, err);
					}
				}
			}
		}
	} catch (err) {
		console.error(`Error reading commands from ${dir}:`, err);
	}

	return commands;
}

/**
 * Discover and read all commands with their content
 */
function getAllCommandsWithContent(
	projectPath: string,
	namespaceFilter?: string[]
): ExportedCommand[] {
	const allCommands: ExportedCommand[] = [];
	const home = homedir();

	// 1. Discover global namespaced commands from ~/.claude/commands/{namespace}/
	const globalCommandsDir = join(home, '.claude', 'commands');
	if (existsSync(globalCommandsDir)) {
		try {
			const namespaces = readdirSync(globalCommandsDir, { withFileTypes: true });
			for (const ns of namespaces) {
				if (ns.isDirectory()) {
					// Skip if namespace filter is set and this namespace isn't in it
					if (namespaceFilter && !namespaceFilter.includes(ns.name)) {
						continue;
					}
					const nsPath = join(globalCommandsDir, ns.name);
					const nsCommands = readCommandsFromDir(nsPath, ns.name, ns.name);
					allCommands.push(...nsCommands);
				}
			}
		} catch (err) {
			console.error('Error reading global commands:', err);
		}
	}

	// 2. Discover project-local commands from .claude/commands/
	if (!namespaceFilter || namespaceFilter.includes('local')) {
		const localCommandsDir = join(projectPath, '.claude', 'commands');
		const localCommands = readCommandsFromDir(localCommandsDir, 'local', '');
		allCommands.push(...localCommands);
	}

	// Sort by namespace then name
	allCommands.sort((a, b) => {
		if (a.namespace !== b.namespace) {
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
 * GET /api/commands/export
 *
 * Export all commands as a downloadable JSON file
 */
export const GET: RequestHandler = async ({ url }) => {
	const projectPath = url.searchParams.get('project') || process.cwd().replace('/ide', '');

	// Parse namespace filter if provided
	const namespaceParam = url.searchParams.get('namespace');
	const namespaceFilter = namespaceParam ? namespaceParam.split(',').map((n) => n.trim()) : undefined;

	const commands = getAllCommandsWithContent(projectPath, namespaceFilter);

	if (commands.length === 0) {
		throw error(404, 'No commands found to export');
	}

	const exportData: CommandsExport = {
		version: 1,
		exportedAt: new Date().toISOString(),
		commandCount: commands.length,
		commands
	};

	// Return as downloadable JSON file
	return new Response(JSON.stringify(exportData, null, 2), {
		status: 200,
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="commands-export-${new Date().toISOString().split('T')[0]}.json"`
		}
	});
};
