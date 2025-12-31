/**
 * File Content API
 * GET /api/files/content?project=<name>&path=<file> - Read file content
 * PUT /api/files/content?project=<name>&path=<file> - Write file content
 *
 * Security:
 * - Validates path is under project directory
 * - Prevents path traversal attacks
 * - Blocks sensitive files (.env, credentials, secrets)
 *
 * GET Response: { content: string, encoding: 'utf-8', language: string, size: number }
 * PUT Body: { content: string }
 * PUT Response: { success: true, size: number }
 */

import { json } from '@sveltejs/kit';
import { readFile, writeFile, stat, mkdir, rename, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join, resolve, normalize, dirname, extname, basename } from 'path';
import { randomBytes } from 'crypto';
import type { RequestHandler } from './$types';

// Maximum file size for reading (1MB)
const MAX_FILE_SIZE = 1024 * 1024;

// Sensitive file patterns that should not be written to
const SENSITIVE_PATTERNS = [
	'.env',
	'.env.local',
	'.env.production',
	'.env.development',
	'credentials.json',
	'secrets.json',
	'service-account.json',
	'.npmrc',
	'.pypirc',
	'id_rsa',
	'id_ed25519',
	'.pem',
	'.key',
	'.p12',
	'.pfx'
];

// Path to JAT config for project lookup
const CONFIG_FILE = join(homedir(), '.config', 'jat', 'projects.json');

/**
 * Language detection based on file extension for Monaco editor
 */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
	// JavaScript/TypeScript
	'.js': 'javascript',
	'.jsx': 'javascript',
	'.mjs': 'javascript',
	'.cjs': 'javascript',
	'.ts': 'typescript',
	'.tsx': 'typescript',
	'.mts': 'typescript',
	'.cts': 'typescript',

	// Web
	'.html': 'html',
	'.htm': 'html',
	'.css': 'css',
	'.scss': 'scss',
	'.sass': 'scss',
	'.less': 'less',
	'.vue': 'vue',
	'.svelte': 'svelte',

	// Data formats
	'.json': 'json',
	'.jsonc': 'json',
	'.json5': 'json',
	'.yaml': 'yaml',
	'.yml': 'yaml',
	'.toml': 'toml',
	'.xml': 'xml',
	'.csv': 'plaintext',

	// Scripting
	'.py': 'python',
	'.rb': 'ruby',
	'.php': 'php',
	'.pl': 'perl',
	'.lua': 'lua',
	'.r': 'r',

	// Systems
	'.go': 'go',
	'.rs': 'rust',
	'.c': 'c',
	'.h': 'c',
	'.cpp': 'cpp',
	'.hpp': 'cpp',
	'.cc': 'cpp',
	'.cxx': 'cpp',
	'.cs': 'csharp',
	'.java': 'java',
	'.kt': 'kotlin',
	'.kts': 'kotlin',
	'.swift': 'swift',
	'.m': 'objective-c',
	'.mm': 'objective-c',

	// Shell/Config
	'.sh': 'shell',
	'.bash': 'shell',
	'.zsh': 'shell',
	'.fish': 'shell',
	'.ps1': 'powershell',
	'.bat': 'bat',
	'.cmd': 'bat',

	// Documentation
	'.md': 'markdown',
	'.mdx': 'markdown',
	'.rst': 'restructuredtext',
	'.tex': 'latex',
	'.txt': 'plaintext',

	// Database
	'.sql': 'sql',
	'.prisma': 'prisma',

	// Config files
	'.dockerfile': 'dockerfile',
	'.dockerignore': 'plaintext',
	'.gitignore': 'plaintext',
	'.gitattributes': 'plaintext',
	'.editorconfig': 'ini',
	'.ini': 'ini',
	'.cfg': 'ini',
	'.conf': 'ini',

	// Other
	'.graphql': 'graphql',
	'.gql': 'graphql',
	'.proto': 'proto',
	'.makefile': 'makefile',
	'.cmake': 'cmake',
	'.asm': 'assembly',
	'.wasm': 'wasm',
	'.clj': 'clojure',
	'.cljs': 'clojure',
	'.ex': 'elixir',
	'.exs': 'elixir',
	'.erl': 'erlang',
	'.hrl': 'erlang',
	'.hs': 'haskell',
	'.lhs': 'haskell',
	'.ml': 'ocaml',
	'.mli': 'ocaml',
	'.fs': 'fsharp',
	'.fsx': 'fsharp',
	'.scala': 'scala',
	'.sc': 'scala',
	'.dart': 'dart',
	'.elm': 'elm',
	'.nim': 'nim',
	'.zig': 'zig',
	'.v': 'v',
	'.d': 'd',
	'.pas': 'pascal',
	'.pp': 'pascal',
	'.ada': 'ada',
	'.adb': 'ada',
	'.ads': 'ada',
	'.lisp': 'lisp',
	'.lsp': 'lisp',
	'.scm': 'scheme',
	'.rkt': 'scheme',
	'.tcl': 'tcl',
	'.vb': 'vb',
	'.vbs': 'vb',
	'.awk': 'awk',
	'.sed': 'sed'
};

/**
 * Get language from file path for Monaco editor
 */
function detectLanguage(filePath: string): string {
	const ext = extname(filePath).toLowerCase();
	const name = basename(filePath).toLowerCase();

	// Check special filenames
	if (name === 'dockerfile' || name.startsWith('dockerfile.')) return 'dockerfile';
	if (name === 'makefile' || name === 'gnumakefile') return 'makefile';
	if (name === 'cmakelists.txt') return 'cmake';
	if (name === 'jenkinsfile') return 'groovy';
	if (name === 'vagrantfile') return 'ruby';
	if (name === 'gemfile') return 'ruby';
	if (name === 'rakefile') return 'ruby';
	if (name === 'podfile') return 'ruby';
	if (name === 'fastfile') return 'ruby';
	if (name === 'appfile') return 'ruby';
	if (name === 'matchfile') return 'ruby';
	if (name === 'brewfile') return 'ruby';

	return EXTENSION_TO_LANGUAGE[ext] || 'plaintext';
}

/**
 * Read JAT projects config
 */
async function readJatConfig(): Promise<{ projects?: Record<string, { path?: string }> } | null> {
	try {
		if (!existsSync(CONFIG_FILE)) {
			return null;
		}
		const content = await readFile(CONFIG_FILE, 'utf-8');
		return JSON.parse(content);
	} catch {
		return null;
	}
}

/**
 * Get project path from name
 */
async function getProjectPath(projectName: string): Promise<string | null> {
	const config = await readJatConfig();

	// Check JAT config first
	if (config?.projects?.[projectName]?.path) {
		return config.projects[projectName].path.replace(/^~/, homedir());
	}

	// Fallback to ~/code/{project}
	const defaultPath = join(homedir(), 'code', projectName);
	if (existsSync(defaultPath)) {
		return defaultPath;
	}

	return null;
}

/**
 * Validate and resolve file path, preventing path traversal
 */
function validatePath(
	projectPath: string,
	filePath: string
): { valid: boolean; resolved?: string; error?: string } {
	try {
		// Normalize and resolve the full path
		const resolved = resolve(projectPath, filePath);
		const normalizedProject = normalize(projectPath);

		// Ensure the resolved path is under the project directory
		if (!resolved.startsWith(normalizedProject + '/') && resolved !== normalizedProject) {
			return { valid: false, error: 'Path traversal detected' };
		}

		return { valid: true, resolved };
	} catch {
		return { valid: false, error: 'Invalid path' };
	}
}

/**
 * Check if a file is sensitive and should not be written to
 */
function isSensitiveFile(filePath: string): boolean {
	const name = basename(filePath).toLowerCase();
	const lowerPath = filePath.toLowerCase();

	for (const pattern of SENSITIVE_PATTERNS) {
		if (name === pattern || name.endsWith(pattern) || lowerPath.includes(`/${pattern}`)) {
			return true;
		}
	}

	return false;
}

/**
 * Check if file content appears to be binary
 * Checks first 8KB for null bytes
 */
function isBinaryContent(buffer: Buffer): boolean {
	const checkLength = Math.min(buffer.length, 8192);
	for (let i = 0; i < checkLength; i++) {
		if (buffer[i] === 0) {
			return true;
		}
	}
	return false;
}

/**
 * GET /api/files/content - Read file content
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const projectName = url.searchParams.get('project');
		const filePath = url.searchParams.get('path');

		if (!projectName) {
			return json({ error: 'Project name is required' }, { status: 400 });
		}

		if (!filePath) {
			return json({ error: 'File path is required' }, { status: 400 });
		}

		// Get project path
		const projectPath = await getProjectPath(projectName);
		if (!projectPath) {
			return json({ error: `Project '${projectName}' not found` }, { status: 404 });
		}

		// Validate and resolve path
		const validation = validatePath(projectPath, filePath);
		if (!validation.valid) {
			return json({ error: validation.error }, { status: 403 });
		}

		const resolvedPath = validation.resolved!;

		// Check if file exists
		if (!existsSync(resolvedPath)) {
			return json({ error: 'File not found' }, { status: 404 });
		}

		// Get file stats
		const stats = await stat(resolvedPath);

		if (!stats.isFile()) {
			return json({ error: 'Path is not a file' }, { status: 400 });
		}

		// Check file size
		if (stats.size > MAX_FILE_SIZE) {
			return json(
				{
					error: `File too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`
				},
				{ status: 413 }
			);
		}

		// Read file as buffer to check for binary content
		const buffer = await readFile(resolvedPath);

		// Check for binary content
		if (isBinaryContent(buffer)) {
			return json({ error: 'Binary file - cannot display as text' }, { status: 415 });
		}

		// Convert to string
		const content = buffer.toString('utf-8');

		// Detect language
		const language = detectLanguage(resolvedPath);

		return json({
			content,
			encoding: 'utf-8',
			language,
			size: stats.size
		});
	} catch (error) {
		console.error('[Files Content API] GET error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to read file' },
			{ status: 500 }
		);
	}
};

/**
 * PUT /api/files/content - Write file content
 */
export const PUT: RequestHandler = async ({ url, request }) => {
	try {
		const projectName = url.searchParams.get('project');
		const filePath = url.searchParams.get('path');

		if (!projectName) {
			return json({ error: 'Project name is required' }, { status: 400 });
		}

		if (!filePath) {
			return json({ error: 'File path is required' }, { status: 400 });
		}

		// Get project path
		const projectPath = await getProjectPath(projectName);
		if (!projectPath) {
			return json({ error: `Project '${projectName}' not found` }, { status: 404 });
		}

		// Validate and resolve path
		const validation = validatePath(projectPath, filePath);
		if (!validation.valid) {
			return json({ error: validation.error }, { status: 403 });
		}

		const resolvedPath = validation.resolved!;

		// Check if file is sensitive
		if (isSensitiveFile(resolvedPath)) {
			return json({ error: 'Cannot write to sensitive file' }, { status: 403 });
		}

		// Parse request body
		const body = await request.json();
		const { content } = body;

		if (typeof content !== 'string') {
			return json({ error: 'Content must be a string' }, { status: 400 });
		}

		// Create parent directories if needed
		const parentDir = dirname(resolvedPath);
		if (!existsSync(parentDir)) {
			await mkdir(parentDir, { recursive: true });
		}

		// Atomic write: write to temp file, then rename
		const tempPath = `${resolvedPath}.${randomBytes(8).toString('hex')}.tmp`;

		try {
			// Write to temp file
			await writeFile(tempPath, content, 'utf-8');

			// Rename temp to target (atomic on most filesystems)
			await rename(tempPath, resolvedPath);

			// Get final file size
			const stats = await stat(resolvedPath);

			return json({
				success: true,
				size: stats.size
			});
		} catch (writeError) {
			// Clean up temp file if it exists
			try {
				if (existsSync(tempPath)) {
					await unlink(tempPath);
				}
			} catch {
				// Ignore cleanup errors
			}
			throw writeError;
		}
	} catch (error) {
		console.error('[Files Content API] PUT error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to write file' },
			{ status: 500 }
		);
	}
};
