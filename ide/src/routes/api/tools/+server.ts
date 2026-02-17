/**
 * Tools API - List JAT tools with categories
 *
 * GET /api/tools
 * Returns categorized list of JAT tools from the installation directory.
 *
 * Response:
 * {
 *   jatPath: string,           // JAT installation directory
 *   categories: [{
 *     id: string,              // Category ID (mail, browser, etc.)
 *     name: string,            // Display name
 *     description: string,     // Category description
 *     icon: string,            // SVG path for icon
 *     tools: [{
 *       name: string,          // Tool filename
 *       path: string,          // Relative path from JAT root
 *       absolutePath: string,  // Full filesystem path
 *       type: 'bash' | 'js',   // Script type
 *       size: number,          // File size in bytes
 *       modified: string       // ISO timestamp
 *     }]
 *   }]
 * }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';

// Tool categories configuration
const TOOL_CATEGORIES = [
	{
		id: 'agents',
		name: 'Agent Registry',
		description: 'Agent identity and registration',
		directory: 'tools/agents',
		icon: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75',
		filter: (name: string) => name.startsWith('am-') && !name.endsWith('.md')
	},
	{
		id: 'browser',
		name: 'Browser Tools',
		description: 'Browser automation via Chrome DevTools Protocol',
		directory: 'tools/browser',
		icon: 'M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418',
		filter: (name: string) => name.startsWith('browser-') && name.endsWith('.js')
	},
	{
		id: 'tasks',
		name: 'Tasks & Review',
		description: 'Task management and review rule tools',
		directory: 'tools/core',
		icon: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z',
		filter: (name: string) => name.startsWith('jt-') || name.startsWith('backup-jat') || name.startsWith('rollback-jat')
	},
	{
		id: 'signal',
		name: 'Signal Tools',
		description: 'Session state signaling for IDE integration',
		directory: 'tools/signal',
		icon: 'M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
		filter: (name: string) => name.startsWith('jat-signal')
	},
	{
		id: 'media',
		name: 'Media Tools',
		description: 'Image generation and avatar tools using Gemini API',
		directory: 'tools/media',
		icon: 'M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
		filter: (name: string) => name.startsWith('gemini-') || name.startsWith('avatar-')
	},
	{
		id: 'scripts',
		name: 'Setup Scripts',
		description: 'Installation and configuration scripts',
		directory: 'tools/scripts',
		icon: 'M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z',
		filter: (name: string) => name.endsWith('.sh') && !name.includes('test')
	},
	{
		id: 'commands',
		name: 'JAT Commands',
		description: 'Workflow commands for agent lifecycle',
		directory: 'commands/jat',
		icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
		filter: (name: string) => name.endsWith('.md') && !name.startsWith('README')
	}
];

/**
 * Find JAT installation directory
 */
function findJatPath(): string | null {
	// Check common locations
	const candidates = [
		join(homedir(), 'code', 'jat'),
		join(homedir(), 'projects', 'jat'),
		join(homedir(), '.local', 'share', 'jat'),
		// Also check where IDE is running from (parent of ide/)
		join(process.cwd(), '..'),
		process.cwd().replace('/ide', '')
	];

	for (const candidate of candidates) {
		// Verify it's actually JAT by checking for key directories
		if (
			existsSync(candidate) &&
			existsSync(join(candidate, 'tools', 'mail')) &&
			existsSync(join(candidate, 'tools', 'browser'))
		) {
			return candidate;
		}
	}

	return null;
}

/**
 * Get file type from extension
 */
function getFileType(name: string): 'bash' | 'js' | 'markdown' | 'unknown' {
	const ext = extname(name).toLowerCase();
	if (ext === '.js') return 'js';
	if (ext === '.md') return 'markdown';
	if (ext === '.sh' || ext === '') return 'bash'; // No extension = likely bash
	return 'unknown';
}

/**
 * List tools in a category directory
 */
async function listCategoryTools(
	jatPath: string,
	category: (typeof TOOL_CATEGORIES)[0]
): Promise<
	{
		name: string;
		path: string;
		absolutePath: string;
		type: 'bash' | 'js' | 'markdown' | 'unknown';
		size: number;
		modified: string;
	}[]
> {
	const dirPath = join(jatPath, category.directory);

	if (!existsSync(dirPath)) {
		return [];
	}

	try {
		const entries = await readdir(dirPath, { withFileTypes: true });
		const tools: {
			name: string;
			path: string;
			absolutePath: string;
			type: 'bash' | 'js' | 'markdown' | 'unknown';
			size: number;
			modified: string;
		}[] = [];

		for (const entry of entries) {
			// Skip directories and non-matching files
			if (entry.isDirectory()) continue;
			if (!category.filter(entry.name)) continue;

			const filePath = join(dirPath, entry.name);
			const relativePath = join(category.directory, entry.name);

			try {
				const stats = await stat(filePath);
				tools.push({
					name: entry.name,
					path: relativePath,
					absolutePath: filePath,
					type: getFileType(entry.name),
					size: stats.size,
					modified: stats.mtime.toISOString()
				});
			} catch {
				// Skip files we can't stat
				continue;
			}
		}

		// Sort by name
		tools.sort((a, b) => a.name.localeCompare(b.name));

		return tools;
	} catch (err) {
		console.error(`[Tools API] Failed to list ${category.directory}:`, err);
		return [];
	}
}

export const GET: RequestHandler = async () => {
	const jatPath = findJatPath();

	if (!jatPath) {
		return json(
			{
				error: 'JAT installation not found',
				hint: 'Ensure JAT is installed in ~/code/jat or the IDE is run from the JAT directory'
			},
			{ status: 404 }
		);
	}

	try {
		const categories = [];

		for (const category of TOOL_CATEGORIES) {
			const tools = await listCategoryTools(jatPath, category);

			categories.push({
				id: category.id,
				name: category.name,
				description: category.description,
				icon: category.icon,
				tools
			});
		}

		return json({
			jatPath,
			categories
		});
	} catch (err) {
		console.error('[Tools API] Error:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to list tools' },
			{ status: 500 }
		);
	}
};
