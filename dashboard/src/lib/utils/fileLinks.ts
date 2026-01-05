/**
 * File Link Utilities
 *
 * Generates JAT dashboard file editor links for opening files in the built-in editor.
 * Supports line number deep links and project context.
 * Also provides localhost URL utilities for route files.
 *
 * @see dashboard/CLAUDE.md for usage documentation
 */

// Project configuration loaded from ~/.config/jat/projects.json
// This will be populated by getProjectConfig()
let projectsCache: Record<string, ProjectConfig> | null = null;

/**
 * Project configuration from projects.json
 */
export interface ProjectConfig {
	name: string;
	path: string;
	port: number | null;
	description?: string;
}

/**
 * Options for generating file links
 */
export interface FileLinkOptions {
	/** Project root path (defaults to cwd) */
	projectRoot?: string;
	/** Line number to navigate to (1-indexed) */
	line?: number;
	/** Column number to navigate to (1-indexed) */
	column?: number;
}

/**
 * Options for generating diff links
 */
export interface DiffLinkOptions {
	/** Project root path (defaults to cwd) */
	projectRoot?: string;
	/** Git ref to compare against (defaults to HEAD) */
	ref?: string;
	/** Compare against staged changes */
	staged?: boolean;
}

/**
 * Generate a JAT dashboard file editor URL to open a file
 *
 * Opens the file in the JAT dashboard's built-in file editor (/files route).
 * Supports line number deep links via query parameters.
 *
 * @example
 * ```typescript
 * // Open file
 * generateJatFileUrl('src/lib/auth.ts')
 * // → /files?path=src/lib/auth.ts
 *
 * // Open at specific line
 * generateJatFileUrl('src/lib/auth.ts', { line: 42 })
 * // → /files?path=src/lib/auth.ts&line=42
 *
 * // Open at specific line and column
 * generateJatFileUrl('src/lib/auth.ts', { line: 42, column: 10 })
 * // → /files?path=src/lib/auth.ts&line=42&column=10
 * ```
 */
export function generateJatFileUrl(filePath: string, options: FileLinkOptions = {}): string {
	const { projectRoot, line, column } = options;

	// Normalize path - remove project root prefix if present
	let normalizedPath = filePath;
	const defaultRoot = getDefaultProjectRoot();

	// If it's an absolute path, make it relative to project root
	if (filePath.startsWith('/')) {
		if (filePath.startsWith(defaultRoot + '/')) {
			normalizedPath = filePath.slice(defaultRoot.length + 1);
		} else if (projectRoot && filePath.startsWith(projectRoot + '/')) {
			normalizedPath = filePath.slice(projectRoot.length + 1);
		}
	}

	// Build URL with query parameters
	const params = new URLSearchParams();
	params.set('path', normalizedPath);

	if (line !== undefined && line > 0) {
		params.set('line', String(line));
		if (column !== undefined && column > 0) {
			params.set('column', String(column));
		}
	}

	return `/files?${params.toString()}`;
}

/**
 * @deprecated Use generateJatFileUrl instead. This function is kept for backward compatibility.
 */
export function generateVSCodeUrl(filePath: string, options: FileLinkOptions = {}): string {
	return generateJatFileUrl(filePath, options);
}

/**
 * Generate a JAT dashboard file editor URL with diff view
 *
 * Opens the file in the JAT dashboard's built-in file editor with diff mode.
 * Note: Diff view may show the file with a diff indicator, actual diff
 * visualization depends on the /files page implementation.
 *
 * @example
 * ```typescript
 * // Show file (diff view in JAT)
 * generateDiffUrl('src/lib/auth.ts')
 * // → /files?path=src/lib/auth.ts&diff=true
 *
 * // Show diff against specific ref
 * generateDiffUrl('src/lib/auth.ts', { ref: 'HEAD~1' })
 * // → /files?path=src/lib/auth.ts&diff=true&ref=HEAD~1
 * ```
 */
export function generateDiffUrl(filePath: string, options: DiffLinkOptions = {}): string {
	const { projectRoot, ref, staged } = options;

	// Normalize path - remove project root prefix if present
	let normalizedPath = filePath;
	const defaultRoot = getDefaultProjectRoot();

	// If it's an absolute path, make it relative to project root
	if (filePath.startsWith('/')) {
		if (filePath.startsWith(defaultRoot + '/')) {
			normalizedPath = filePath.slice(defaultRoot.length + 1);
		} else if (projectRoot && filePath.startsWith(projectRoot + '/')) {
			normalizedPath = filePath.slice(projectRoot.length + 1);
		}
	}

	// Build URL with query parameters
	const params = new URLSearchParams();
	params.set('path', normalizedPath);
	params.set('diff', 'true');

	if (ref) {
		params.set('ref', ref);
	}
	if (staged) {
		params.set('staged', 'true');
	}

	return `/files?${params.toString()}`;
}

/**
 * Generate a shell command for git diff (fallback for non-VS Code users)
 *
 * Returns a copy-pasteable command for the terminal.
 *
 * @example
 * ```typescript
 * generateGitDiffCommand('src/lib/auth.ts')
 * // → git diff -- src/lib/auth.ts
 *
 * generateGitDiffCommand('src/lib/auth.ts', 'HEAD~1')
 * // → git diff HEAD~1 -- src/lib/auth.ts
 * ```
 */
export function generateGitDiffCommand(filePath: string, ref?: string): string {
	if (ref) {
		return `git diff ${ref} -- ${filePath}`;
	}
	return `git diff -- ${filePath}`;
}

/**
 * Open a file in the JAT dashboard file editor
 *
 * Navigates to the /files route with the file path.
 * Opens in the same window to provide a seamless editing experience.
 *
 * @param filePath - Path to the file (relative or absolute)
 * @param options - Optional line/column to scroll to
 */
export function openInVSCode(filePath: string, options: FileLinkOptions = {}): void {
	const url = generateJatFileUrl(filePath, options);

	// Navigate to the JAT files page (same window for seamless experience)
	window.location.href = url;
}

/**
 * Open a file in the JAT dashboard file editor
 *
 * Alias for openInVSCode - named for clarity when using JAT links.
 */
export function openInJatEditor(filePath: string, options: FileLinkOptions = {}): void {
	openInVSCode(filePath, options);
}

/**
 * Open a diff view in the JAT dashboard file editor
 *
 * Navigates to the /files route with diff mode enabled.
 * Opens in the same window for seamless experience.
 */
export function openDiffInVSCode(filePath: string, options: DiffLinkOptions = {}): void {
	const url = generateDiffUrl(filePath, options);
	window.location.href = url;
}

/**
 * Open a diff view in the JAT dashboard file editor
 *
 * Alias for openDiffInVSCode - named for clarity when using JAT links.
 */
export function openDiffInJatEditor(filePath: string, options: DiffLinkOptions = {}): void {
	openDiffInVSCode(filePath, options);
}

/**
 * Check if we're in a browser context where JAT file editor links work
 */
export function canOpenInVSCode(): boolean {
	return typeof window !== 'undefined' && typeof window.location !== 'undefined';
}

/**
 * Check if we're in a browser context where JAT file editor links work
 *
 * Alias for canOpenInVSCode - named for clarity.
 */
export function canOpenInJatEditor(): boolean {
	return canOpenInVSCode();
}

/**
 * Get file extension from path
 */
export function getFileExtension(filePath: string): string {
	const parts = filePath.split('.');
	return parts.length > 1 ? parts[parts.length - 1] : '';
}

/**
 * Get file name from path (without directory)
 */
export function getFileName(filePath: string): string {
	const parts = filePath.split('/');
	return parts[parts.length - 1];
}

/**
 * Get directory path from file path
 */
export function getDirectory(filePath: string): string {
	const parts = filePath.split('/');
	parts.pop();
	return parts.join('/');
}

/**
 * Normalize file path (remove ./, ../, and double slashes)
 */
export function normalizePath(filePath: string): string {
	// Remove leading ./
	let normalized = filePath.replace(/^\.\//, '');

	// Remove double slashes
	normalized = normalized.replace(/\/+/g, '/');

	// Remove trailing slash
	normalized = normalized.replace(/\/$/, '');

	return normalized;
}

/**
 * Check if path looks like a glob pattern
 */
export function isGlobPattern(path: string): boolean {
	return path.includes('*') || path.includes('?') || path.includes('[');
}

/**
 * Get the default project root
 *
 * In browser context, we use a placeholder that should be replaced
 * by the actual project root at runtime.
 */
function getDefaultProjectRoot(): string {
	// This will be the jat project root when accessed from dashboard
	// The parent of /dashboard is the project root
	if (typeof window !== 'undefined' && window.location) {
		// We're in browser context - the API should provide the actual root
		// For now, use a common default that can be overridden
		return '/home/jw/code/jat';
	}
	return process.cwd();
}

/**
 * File link result containing both URL and fallback command
 */
export interface FileLinkResult {
	/** VS Code URL for direct opening */
	vscodeUrl: string;
	/** Shell command for terminal users */
	shellCommand?: string;
	/** Human-readable description */
	description: string;
}

/**
 * Generate complete file link result with URL and fallback
 *
 * @example
 * ```typescript
 * const link = getFileLink('src/lib/auth.ts', { line: 42 });
 * // link.vscodeUrl = '/files?path=src/lib/auth.ts&line=42'
 * // link.shellCommand = 'code src/lib/auth.ts:42'
 * // link.description = 'Open src/lib/auth.ts at line 42'
 * ```
 */
export function getFileLink(filePath: string, options: FileLinkOptions = {}): FileLinkResult {
	const { line, column } = options;

	const vscodeUrl = generateJatFileUrl(filePath, options);

	// Build shell command for terminal users (still points to external editor)
	let shellCommand = `code ${filePath}`;
	if (line) {
		shellCommand += `:${line}`;
		if (column) {
			shellCommand += `:${column}`;
		}
	}

	// Build description
	let description = `Open ${getFileName(filePath)}`;
	if (line) {
		description += ` at line ${line}`;
		if (column) {
			description += `:${column}`;
		}
	}

	return {
		vscodeUrl,
		shellCommand,
		description
	};
}

/**
 * Generate complete diff link result with URL and fallback
 *
 * @example
 * ```typescript
 * const link = getDiffLink('src/lib/auth.ts', { ref: 'HEAD~1' });
 * // link.vscodeUrl = '/files?path=src/lib/auth.ts&diff=true&ref=HEAD~1'
 * // link.shellCommand = 'git diff HEAD~1 -- src/lib/auth.ts'
 * // link.description = 'Show diff for src/lib/auth.ts'
 * ```
 */
export function getDiffLink(filePath: string, options: DiffLinkOptions = {}): FileLinkResult {
	const vscodeUrl = generateDiffUrl(filePath, options);
	const shellCommand = generateGitDiffCommand(filePath, options.ref);

	let description = `Show diff for ${getFileName(filePath)}`;
	if (options.ref) {
		description += ` against ${options.ref}`;
	} else if (options.staged) {
		description += ' (staged)';
	}

	return {
		vscodeUrl,
		shellCommand,
		description
	};
}

// =============================================================================
// LOCALHOST URL UTILITIES
// =============================================================================

/**
 * Set the projects cache (called from API or server-side)
 */
export function setProjectsCache(projects: Record<string, ProjectConfig>): void {
	projectsCache = projects;
}

/**
 * Get the projects cache
 */
export function getProjectsCache(): Record<string, ProjectConfig> | null {
	return projectsCache;
}

/**
 * Get the port for a project from the cache
 *
 * @param projectName - Project name (e.g., 'jat', 'chimaro')
 * @returns Port number or null if not found
 */
export function getProjectPort(projectName: string): number | null {
	if (!projectsCache) return null;
	const project = projectsCache[projectName.toLowerCase()];
	return project?.port ?? null;
}

/**
 * Generate a localhost URL for a route
 *
 * @param route - The route path (e.g., '/dashboard', '/api/users', '/login')
 * @param projectName - Project name to get port from
 * @returns Full localhost URL or null if port not available
 *
 * @example
 * ```typescript
 * generateLocalhostUrl('/dashboard', 'jat')
 * // → 'http://localhost:3333/dashboard'
 *
 * generateLocalhostUrl('/login', 'chimaro')
 * // → 'http://localhost:3500/login'
 * ```
 */
export function generateLocalhostUrl(route: string, projectName: string): string | null {
	const port = getProjectPort(projectName);
	if (!port) return null;

	// Ensure route starts with /
	const normalizedRoute = route.startsWith('/') ? route : `/${route}`;

	return `http://localhost:${port}${normalizedRoute}`;
}

/**
 * Open a localhost URL in a new browser tab
 *
 * @param route - The route path
 * @param projectName - Project name to get port from
 * @returns true if URL was opened, false if port not available
 */
export function openLocalhostUrl(route: string, projectName: string): boolean {
	const url = generateLocalhostUrl(route, projectName);
	if (!url) return false;

	window.open(url, '_blank');
	return true;
}

/**
 * Detect a route from a file path based on common patterns
 *
 * Supports SvelteKit routes (+page.svelte) and API routes (+server.ts/js)
 *
 * @param filePath - File path relative to project root
 * @returns Detected route or null if not a route file
 *
 * @example
 * ```typescript
 * detectRouteFromPath('src/routes/dashboard/+page.svelte')
 * // → '/dashboard'
 *
 * detectRouteFromPath('src/routes/api/users/+server.ts')
 * // → '/api/users'
 *
 * detectRouteFromPath('src/routes/tasks/[id]/+page.svelte')
 * // → '/tasks/[id]'
 *
 * detectRouteFromPath('src/lib/utils/auth.ts')
 * // → null (not a route)
 * ```
 */
export function detectRouteFromPath(filePath: string): string | null {
	// Normalize path separators
	const normalized = filePath.replace(/\\/g, '/');

	// Check if it's a SvelteKit route file
	const routeMatch = normalized.match(/src\/routes\/(.+?)\/\+(?:page|server|layout)\.(?:svelte|ts|js)$/);
	if (routeMatch) {
		const routePath = routeMatch[1];
		// Convert route path to URL (handle dynamic params like [id])
		return `/${routePath}`;
	}

	// Check for root route
	if (normalized.match(/src\/routes\/\+(?:page|server|layout)\.(?:svelte|ts|js)$/)) {
		return '/';
	}

	return null;
}

/**
 * Interface for all links related to a file
 */
export interface FileLinks {
	/** JAT file editor link to open the file (legacy name kept for compatibility) */
	vscodeUrl: string;
	/** JAT file editor link to show diff */
	diffUrl: string;
	/** Localhost URL if this is a route file */
	localhostUrl: string | null;
	/** Detected route from file path */
	detectedRoute: string | null;
}

/**
 * Generate all links for a file
 *
 * @param filePath - File path relative to project root
 * @param projectName - Project name for localhost URL
 * @param options - Additional options
 * @returns All available links for the file
 *
 * @example
 * ```typescript
 * getAllFileLinks('src/routes/dashboard/+page.svelte', 'jat')
 * // → {
 * //     vscodeUrl: '/files?path=src/routes/dashboard/+page.svelte',
 * //     diffUrl: '/files?path=src/routes/dashboard/+page.svelte&diff=true',
 * //     localhostUrl: 'http://localhost:3333/dashboard',
 * //     detectedRoute: '/dashboard'
 * //   }
 * ```
 */
export function getAllFileLinks(
	filePath: string,
	projectName: string,
	options: FileLinkOptions & { localhostRoute?: string } = {}
): FileLinks {
	const vscodeUrl = generateJatFileUrl(filePath, options);
	const diffUrl = generateDiffUrl(filePath, {});

	// Use explicit localhost route if provided, otherwise try to detect
	const detectedRoute = options.localhostRoute || detectRouteFromPath(filePath);
	const localhostUrl = detectedRoute ? generateLocalhostUrl(detectedRoute, projectName) : null;

	return {
		vscodeUrl,
		diffUrl,
		localhostUrl,
		detectedRoute
	};
}

/**
 * Open all links for a file
 *
 * Opens the file in JAT editor (in same window), and optionally localhost in new tab.
 * Note: Since JAT editor links navigate in the same window, only the last one will be active.
 * Use openInJatEditor for single file opens.
 *
 * @param filePath - File path relative to project root
 * @param projectName - Project name for localhost URL
 * @param options - Which links to open
 */
export function openAllFileLinks(
	filePath: string,
	projectName: string,
	options: {
		openVscode?: boolean;
		openDiff?: boolean;
		openLocalhost?: boolean;
		localhostRoute?: string;
	} = { openVscode: true, openDiff: false, openLocalhost: true }
): void {
	const links = getAllFileLinks(filePath, projectName, { localhostRoute: options.localhostRoute });

	// Open localhost in new tab first (since JAT navigation will leave current page)
	if (options.openLocalhost && links.localhostUrl) {
		window.open(links.localhostUrl, '_blank');
	}

	// Navigate to JAT file editor (this will leave the current page)
	if (options.openVscode) {
		window.location.href = links.vscodeUrl;
	} else if (options.openDiff) {
		window.location.href = links.diffUrl;
	}
}

// =============================================================================
// JAT FILES PAGE URL UTILITIES
// =============================================================================

/**
 * Generate a URL to open a file in the JAT Files page (/files)
 *
 * @param filePath - File path relative to project root
 * @param projectName - Project name (e.g., 'jat', 'chimaro')
 * @returns URL to the files page with project and file parameters
 *
 * @example
 * ```typescript
 * generateFilesPageUrl('src/lib/auth.ts', 'jat')
 * // → '/files?project=jat&file=src/lib/auth.ts'
 * ```
 */
export function generateFilesPageUrl(filePath: string, projectName: string): string {
	const params = new URLSearchParams();
	params.set('project', projectName);
	params.set('file', filePath);
	return `/files?${params.toString()}`;
}

/**
 * Open a file in the JAT Files page (/files) in the current tab
 *
 * This is the preferred way to open files within the JAT dashboard,
 * as it keeps the user in the dashboard instead of switching to VS Code.
 *
 * @param filePath - File path relative to project root
 * @param projectName - Project name (e.g., 'jat', 'chimaro')
 *
 * @example
 * ```typescript
 * openInFilesPage('src/lib/auth.ts', 'jat');
 * // Navigates to /files?project=jat&file=src/lib/auth.ts
 * ```
 */
export function openInFilesPage(filePath: string, projectName: string): void {
	const url = generateFilesPageUrl(filePath, projectName);
	// Navigate in the same tab to keep user in the dashboard
	window.location.href = url;
}
