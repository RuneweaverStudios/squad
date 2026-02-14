/**
 * POST /api/supabase/query
 *
 * Execute SQL queries against the linked Supabase database.
 *
 * Uses a two-tier approach:
 * 1. Supabase Management API (preferred) - uses the same OAuth token as `supabase db push`,
 *    so if migrations push works, SQL execution works too. No database password needed.
 * 2. psql via pooler-url (fallback) - requires database password, used when the Management
 *    API isn't available (no access token, self-hosted, etc.)
 *
 * Request body:
 * - sql: SQL query to execute (required)
 * - limit: Optional LIMIT to add (default: 100 for SELECT queries)
 * - password: Database password (only needed for psql fallback)
 *
 * Query parameters:
 * - project: Project name (required)
 *
 * Response:
 * - success: boolean
 * - rows: Array of result rows (for SELECT queries)
 * - rowCount: Number of affected rows (for mutations)
 * - command: SQL command type (SELECT, UPDATE, etc.)
 * - method: 'management-api' | 'psql' (which execution method was used)
 * - error: Error message (if failed)
 *
 * Security notes:
 * - Only works on linked projects (requires `supabase link` to have been run)
 * - Adds LIMIT protection for SELECT queries without explicit LIMIT
 * - Password is not logged or persisted
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getProjectSecretWithFallback } from '$lib/utils/credentials';

const execAsync = promisify(exec);

// Maximum execution time for queries (30 seconds)
const QUERY_TIMEOUT_MS = 30000;

// Default limit for SELECT queries without explicit LIMIT
const DEFAULT_SELECT_LIMIT = 100;

// Supabase Management API base URL
const SUPABASE_API_BASE = 'https://api.supabase.com';

/**
 * Get project path from config
 */
function getProjectPath(projectName: string): string | null {
	const configPath = join(process.env.HOME || '~', '.config', 'jat', 'projects.json');

	if (!existsSync(configPath)) {
		const defaultPath = join(process.env.HOME || '~', 'code', projectName);
		return existsSync(defaultPath) ? defaultPath : null;
	}

	try {
		const configContent = readFileSync(configPath, 'utf-8');
		const config = JSON.parse(configContent);
		const projectConfig = config.projects?.[projectName];

		if (projectConfig?.path) {
			const resolvedPath = projectConfig.path.replace(/^~/, process.env.HOME || '');
			if (existsSync(resolvedPath)) {
				return resolvedPath;
			}
		}

		// Also check server_path for monorepos
		if (projectConfig?.server_path) {
			let resolvedPath = projectConfig.server_path.replace(/^~/, process.env.HOME || '');
			// Resolve relative server_path against project path
			if (!resolvedPath.startsWith('/') && projectConfig.path) {
				const basePath = projectConfig.path.replace(/^~/, process.env.HOME || '');
				resolvedPath = join(basePath, resolvedPath);
			}
			if (existsSync(resolvedPath)) {
				return resolvedPath;
			}
		}

		// Fall back to ~/code/{project}
		const defaultPath = join(process.env.HOME || '~', 'code', projectName);
		return existsSync(defaultPath) ? defaultPath : null;
	} catch {
		const defaultPath = join(process.env.HOME || '~', 'code', projectName);
		return existsSync(defaultPath) ? defaultPath : null;
	}
}

/**
 * Find the supabase directory (may be in project root or subdirectory)
 */
function findSupabasePath(projectPath: string): string | null {
	// Check project root first
	const rootSupabase = join(projectPath, 'supabase');
	if (existsSync(rootSupabase)) {
		return rootSupabase;
	}

	// Check common subdirectory patterns (for monorepos)
	const subdirs = ['marketing', 'app', 'api', 'backend', 'frontend'];
	for (const subdir of subdirs) {
		const subPath = join(projectPath, subdir, 'supabase');
		if (existsSync(subPath)) {
			return subPath;
		}
	}

	return null;
}

/**
 * Get the Supabase access token from environment or credentials
 *
 * Fallback chain:
 * 1. SUPABASE_ACCESS_TOKEN env var (set by supabase login or CI)
 * 2. ~/.supabase/access-token file (fallback storage from supabase login)
 */
function getAccessToken(): string | null {
	// Check environment variable first
	const envToken = process.env.SUPABASE_ACCESS_TOKEN;
	if (envToken) {
		return envToken;
	}

	// Check the file-based fallback from supabase login
	const tokenPath = join(process.env.HOME || '~', '.supabase', 'access-token');
	if (existsSync(tokenPath)) {
		try {
			const token = readFileSync(tokenPath, 'utf-8').trim();
			if (token) return token;
		} catch {
			// Fall through
		}
	}

	return null;
}

/**
 * Get the project reference from supabase/.temp/project-ref
 */
function getProjectRef(supabasePath: string): string | null {
	const projectRefPath = join(supabasePath, '.temp', 'project-ref');
	if (!existsSync(projectRefPath)) {
		return null;
	}

	try {
		const ref = readFileSync(projectRefPath, 'utf-8').trim();
		return ref || null;
	} catch {
		return null;
	}
}

/**
 * Execute SQL via the Supabase Management API
 *
 * POST https://api.supabase.com/v1/projects/{ref}/database/query
 * Uses the same OAuth token as `supabase db push`.
 *
 * Returns JSON array of row objects for SELECT queries.
 * Returns empty array for mutations.
 */
async function executeViaManagementApi(
	projectRef: string,
	accessToken: string,
	sql: string,
	commandType: string
): Promise<{ success: boolean; rows?: Record<string, unknown>[]; rowCount?: number; command?: string; message?: string; error?: string }> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

	try {
		const response = await fetch(`${SUPABASE_API_BASE}/v1/projects/${projectRef}/database/query`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ query: sql }),
			signal: controller.signal
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
			const errorMsg = (errorData as { message?: string }).message || `Management API error: ${response.status}`;
			return { success: false, error: errorMsg };
		}

		const data = await response.json();

		// Management API returns a JSON array for all queries
		if (Array.isArray(data)) {
			if (commandType === 'SELECT') {
				return {
					success: true,
					rows: data as Record<string, unknown>[],
					rowCount: data.length,
					command: commandType
				};
			} else {
				// For mutations, the API returns result rows (may be empty)
				return {
					success: true,
					rowCount: data.length || 0,
					command: commandType,
					message: `${commandType} completed`
				};
			}
		}

		// Unexpected response format
		return {
			success: true,
			rows: [],
			rowCount: 0,
			command: commandType,
			message: typeof data === 'string' ? data : JSON.stringify(data)
		};
	} catch (err) {
		if ((err as Error).name === 'AbortError') {
			return { success: false, error: 'Query timed out (30 second limit)' };
		}
		return { success: false, error: (err as Error).message };
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Get database password from credentials or .env files
 *
 * Fallback chain:
 * 1. ~/.config/jat/credentials.json (supabase_db_password)
 * 2. Project .env files (SUPABASE_DB_PASSWORD, DATABASE_PASSWORD, POSTGRES_PASSWORD)
 */
function getDatabasePassword(projectName: string, projectPath: string, serverPath?: string): string | null {
	// First try the credentials system
	const credPassword = getProjectSecretWithFallback(projectName, 'supabase_db_password');
	if (credPassword) {
		return credPassword;
	}

	// Fall back to .env files
	const envVarNames = ['SUPABASE_DB_PASSWORD', 'DATABASE_PASSWORD', 'POSTGRES_PASSWORD'];

	// Check paths in order: server_path first (for monorepos), then project root
	const pathsToCheck = [serverPath, projectPath].filter(Boolean) as string[];

	for (const basePath of pathsToCheck) {
		const envPath = join(basePath, '.env');
		if (!existsSync(envPath)) continue;

		try {
			const envContent = readFileSync(envPath, 'utf-8');
			for (const varName of envVarNames) {
				const match = envContent.match(new RegExp(`^${varName}=(.+)$`, 'm'));
				if (match) {
					// Remove surrounding quotes if present
					return match[1].replace(/^["']|["']$/g, '').trim();
				}
			}
		} catch {
			continue;
		}
	}

	return null;
}

/**
 * Get the pooler URL from Supabase's cached credentials
 * @param supabasePath - Path to the supabase directory
 * @param password - Optional database password to inject into URL
 */
function getPoolerUrl(supabasePath: string, password?: string): string | null {
	const poolerUrlPath = join(supabasePath, '.temp', 'pooler-url');

	if (!existsSync(poolerUrlPath)) {
		return null;
	}

	try {
		let url = readFileSync(poolerUrlPath, 'utf-8').trim();
		// Validate it looks like a PostgreSQL URL
		if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
			return null;
		}

		// If password provided, inject it into the URL
		// URL format: postgresql://user@host:port/db -> postgresql://user:password@host:port/db
		if (password) {
			// Parse URL to inject password
			const urlMatch = url.match(/^(postgres(?:ql)?:\/\/)([^@]+)@(.+)$/);
			if (urlMatch) {
				const [, protocol, user, rest] = urlMatch;
				// URL encode the password to handle special characters
				const encodedPassword = encodeURIComponent(password);
				url = `${protocol}${user}:${encodedPassword}@${rest}`;
			}
		}

		// Change port from 5432 (session mode) to 6543 (transaction mode) for better connection handling
		url = url.replace(':5432/', ':6543/');

		return url;
	} catch {
		return null;
	}
}

/**
 * Execute SQL via psql (fallback method, requires database password)
 */
async function executeViaPsql(
	poolerUrl: string,
	sql: string,
	commandType: string
): Promise<{ success: boolean; rows?: Record<string, unknown>[]; rowCount?: number; command?: string; message?: string; error?: string }> {
	const escapedSql = escapeSqlForShell(sql);

	let psqlCommand: string;
	if (commandType === 'SELECT') {
		psqlCommand = `psql "${poolerUrl}" --csv -c '${escapedSql}'`;
	} else {
		psqlCommand = `psql "${poolerUrl}" -c '${escapedSql}'`;
	}

	try {
		const { stdout, stderr } = await execAsync(psqlCommand, {
			timeout: QUERY_TIMEOUT_MS,
			maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large results
		});

		if (stderr && !stderr.includes('NOTICE:') && !stderr.includes('WARNING:')) {
			return { success: false, error: stderr.trim(), command: commandType };
		}

		if (commandType === 'SELECT') {
			const lines = stdout.trim().split('\n').filter(line => line.length > 0);

			if (lines.length === 0) {
				return { success: true, rows: [], rowCount: 0, command: commandType };
			}

			const headers = parseCSVLine(lines[0]);
			const rows = lines.slice(1).map(line => {
				const values = parseCSVLine(line);
				const row: Record<string, unknown> = {};
				headers.forEach((header, i) => {
					row[header] = parseValue(values[i]);
				});
				return row;
			});

			return { success: true, rows, rowCount: rows.length, command: commandType };
		} else {
			const match = stdout.match(/(?:INSERT|UPDATE|DELETE)\s+(?:\d+\s+)?(\d+)/i);
			const rowCount = match ? parseInt(match[1], 10) : 0;
			return { success: true, rowCount, command: commandType, message: stdout.trim() };
		}
	} catch (error) {
		const err = error as Error & { stderr?: string; code?: number | string };

		if (err.code === 'ETIMEDOUT' || err.message?.includes('timeout')) {
			return { success: false, error: 'Query timed out (30 second limit)' };
		}

		return { success: false, error: err.stderr || err.message };
	}
}

/**
 * Detect SQL command type from query
 */
function detectCommandType(sql: string): string {
	const trimmed = sql.trim().toUpperCase();
	const commands = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'BEGIN', 'COMMIT', 'ROLLBACK'];
	for (const cmd of commands) {
		if (trimmed.startsWith(cmd)) {
			return cmd;
		}
	}
	return 'UNKNOWN';
}

/**
 * Check if query needs LIMIT protection
 */
function needsLimitProtection(sql: string): boolean {
	const trimmed = sql.trim().toUpperCase();
	// Only add LIMIT to SELECT queries that don't already have one
	if (!trimmed.startsWith('SELECT')) {
		return false;
	}
	// Don't add LIMIT if it already has one
	if (/LIMIT\s+\d+/i.test(sql)) {
		return false;
	}
	// Don't add LIMIT to count queries
	if (/SELECT\s+COUNT\s*\(/i.test(trimmed)) {
		return false;
	}
	return true;
}

/**
 * Escape single quotes in SQL for shell execution
 */
function escapeSqlForShell(sql: string): string {
	// Replace single quotes with escaped single quotes for shell
	return sql.replace(/'/g, "'\\''");
}

export const POST: RequestHandler = async ({ url, request }) => {
	const projectName = url.searchParams.get('project');

	if (!projectName) {
		return json({ success: false, error: 'Missing required parameter: project' }, { status: 400 });
	}

	let body: { sql?: string; limit?: number; password?: string };
	try {
		body = await request.json();
	} catch {
		return json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
	}

	const { sql, limit = DEFAULT_SELECT_LIMIT, password } = body;

	if (!sql || typeof sql !== 'string' || sql.trim().length === 0) {
		return json({ success: false, error: 'Missing required field: sql' }, { status: 400 });
	}

	// Get project path
	const projectPath = getProjectPath(projectName);
	if (!projectPath) {
		return json(
			{ success: false, error: `Project not found: ${projectName}` },
			{ status: 404 }
		);
	}

	// Find supabase directory
	const supabasePath = findSupabasePath(projectPath);
	if (!supabasePath) {
		return json(
			{ success: false, error: 'Supabase not initialized. Run `supabase init` in the project.' },
			{ status: 400 }
		);
	}

	// Detect command type
	const commandType = detectCommandType(sql);

	// Apply LIMIT protection for SELECT queries
	let finalSql = sql.trim();
	if (needsLimitProtection(finalSql) && limit > 0) {
		finalSql = `${finalSql} LIMIT ${limit}`;
	}

	// Remove trailing semicolon (both methods handle this themselves)
	finalSql = finalSql.replace(/;\s*$/, '');

	// Strategy 1: Try Supabase Management API (no password needed)
	const accessToken = getAccessToken();
	const projectRef = getProjectRef(supabasePath);

	if (accessToken && projectRef) {
		const result = await executeViaManagementApi(projectRef, accessToken, finalSql, commandType);

		if (result.success) {
			return json({ ...result, method: 'management-api' });
		}

		// If it's a rate limit error or server error, don't fall through - report it
		if (result.error?.includes('429') || result.error?.includes('rate limit')) {
			return json({
				success: false,
				error: 'Supabase API rate limit reached. Please wait a moment and try again.',
				command: commandType,
				method: 'management-api'
			}, { status: 429 });
		}

		// For auth errors on the Management API, fall through to psql
		// For SQL errors (syntax, missing table, etc.), return the error directly
		if (result.error && !result.error.includes('401') && !result.error.includes('403') && !result.error.includes('Unauthorized')) {
			return json({
				success: false,
				error: result.error,
				command: commandType,
				method: 'management-api'
			}, { status: 500 });
		}

		// Auth error on Management API - fall through to psql
	}

	// Strategy 2: Fall back to psql with database password
	const serverPath = dirname(supabasePath);
	const effectivePassword = password || getDatabasePassword(projectName, projectPath, serverPath);

	const poolerUrl = getPoolerUrl(supabasePath, effectivePassword ?? undefined);
	if (!poolerUrl) {
		return json(
			{ success: false, error: 'Project not linked to Supabase. Run `supabase link` in the project.' },
			{ status: 400 }
		);
	}

	// If no Management API available and no password, give a clear error
	if (!effectivePassword && !accessToken) {
		return json({
			success: false,
			error: 'No authentication available. Either run `supabase login` (recommended) or configure your database password in Settings → Project Secrets.',
			command: commandType
		}, { status: 401 });
	}

	const result = await executeViaPsql(poolerUrl, finalSql, commandType);

	if (result.success) {
		return json({ ...result, method: 'psql' });
	}

	// Enhance psql auth error messages
	if (result.error && (result.error.includes('password authentication failed') || result.error.includes('FATAL:  password'))) {
		return json({
			success: false,
			error: 'Database password authentication failed. Run `supabase login` to use the Management API (no password needed), or check your database password in Settings → Project Secrets.',
			command: commandType,
			method: 'psql'
		}, { status: 401 });
	}

	const statusCode = result.error?.includes('timed out') ? 408 : 500;
	return json({
		success: false,
		error: result.error,
		command: commandType,
		method: 'psql'
	}, { status: statusCode });
};

/**
 * Parse a CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
	const values: string[] = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		const nextChar = line[i + 1];

		if (inQuotes) {
			if (char === '"' && nextChar === '"') {
				// Escaped quote
				current += '"';
				i++; // Skip next char
			} else if (char === '"') {
				// End of quoted value
				inQuotes = false;
			} else {
				current += char;
			}
		} else {
			if (char === '"') {
				// Start of quoted value
				inQuotes = true;
			} else if (char === ',') {
				// End of value
				values.push(current);
				current = '';
			} else {
				current += char;
			}
		}
	}
	values.push(current);
	return values;
}

/**
 * Parse a string value to appropriate JS type
 */
function parseValue(value: string): unknown {
	if (value === '' || value === '\\N' || value === 'NULL') {
		return null;
	}
	// Try to parse as number
	if (/^-?\d+$/.test(value)) {
		return parseInt(value, 10);
	}
	if (/^-?\d+\.\d+$/.test(value)) {
		return parseFloat(value);
	}
	// Try to parse as boolean
	if (value === 't' || value === 'true') {
		return true;
	}
	if (value === 'f' || value === 'false') {
		return false;
	}
	// Try to parse as JSON (for jsonb columns)
	if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
		try {
			return JSON.parse(value);
		} catch {
			return value;
		}
	}
	return value;
}
