/**
 * POST /api/supabase/query
 *
 * Execute SQL queries against the linked Supabase database.
 * Uses the pooler-url cached by `supabase link` command.
 *
 * Request body:
 * - sql: SQL query to execute (required)
 * - limit: Optional LIMIT to add (default: 100 for SELECT queries)
 * - password: Database password (required - Supabase CLI doesn't store it)
 *
 * Query parameters:
 * - project: Project name (required)
 *
 * Response:
 * - success: boolean
 * - rows: Array of result rows (for SELECT queries)
 * - rowCount: Number of affected rows (for mutations)
 * - command: SQL command type (SELECT, UPDATE, etc.)
 * - error: Error message (if failed)
 *
 * Security notes:
 * - Only works on linked projects (requires `supabase link` to have been run)
 * - Uses transaction mode pooler connection (port 6543)
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
			const resolvedPath = projectConfig.server_path.replace(/^~/, process.env.HOME || '');
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

	// Get password: prefer request body, fall back to credentials or .env file
	const serverPath = dirname(supabasePath); // e.g., /home/jw/code/marduk/marketing
	const effectivePassword = password || getDatabasePassword(projectName, projectPath, serverPath);

	// Get pooler URL (with password)
	const poolerUrl = getPoolerUrl(supabasePath, effectivePassword ?? undefined);
	if (!poolerUrl) {
		return json(
			{ success: false, error: 'Project not linked to Supabase. Run `supabase link` in the project.' },
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

	// Remove trailing semicolon for psql -c (it adds one)
	finalSql = finalSql.replace(/;\s*$/, '');

	try {
		// Execute query using psql with JSON output
		// Use --tuples-only and JSON aggregation for SELECT queries
		const escapedSql = escapeSqlForShell(finalSql);

		// For SELECT queries, wrap in JSON aggregation to get structured output
		// For mutations, just run the query and get affected row count
		let psqlCommand: string;

		if (commandType === 'SELECT') {
			// Use psql's CSV output (includes headers on line 1)
			psqlCommand = `psql "${poolerUrl}" --csv -c '${escapedSql}'`;
		} else {
			// For mutations, use regular output to get row count
			psqlCommand = `psql "${poolerUrl}" -c '${escapedSql}'`;
		}

		const { stdout, stderr } = await execAsync(psqlCommand, {
			timeout: QUERY_TIMEOUT_MS,
			maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large results
		});

		if (stderr && !stderr.includes('NOTICE:') && !stderr.includes('WARNING:')) {
			// Real errors (not notices/warnings)
			return json({
				success: false,
				error: stderr.trim(),
				command: commandType
			});
		}

		// Parse results based on command type
		if (commandType === 'SELECT') {
			// Parse CSV output into rows
			const lines = stdout.trim().split('\n').filter(line => line.length > 0);

			if (lines.length === 0) {
				return json({
					success: true,
					rows: [],
					rowCount: 0,
					command: commandType
				});
			}

			// First line is headers
			const headers = parseCSVLine(lines[0]);
			const rows = lines.slice(1).map(line => {
				const values = parseCSVLine(line);
				const row: Record<string, unknown> = {};
				headers.forEach((header, i) => {
					row[header] = parseValue(values[i]);
				});
				return row;
			});

			return json({
				success: true,
				rows,
				rowCount: rows.length,
				command: commandType
			});
		} else {
			// For mutations, parse affected row count from output
			// Output looks like: "UPDATE 5" or "INSERT 0 5" or "DELETE 3"
			const match = stdout.match(/(?:INSERT|UPDATE|DELETE)\s+(?:\d+\s+)?(\d+)/i);
			const rowCount = match ? parseInt(match[1], 10) : 0;

			return json({
				success: true,
				rowCount,
				command: commandType,
				message: stdout.trim()
			});
		}
	} catch (error) {
		const err = error as Error & { stderr?: string; code?: number | string };

		// Handle timeout
		if (err.code === 'ETIMEDOUT' || err.message?.includes('timeout')) {
			return json({
				success: false,
				error: 'Query timed out (30 second limit)',
				command: commandType
			}, { status: 408 });
		}

		// Handle psql errors
		const errorMessage = err.stderr || err.message;
		return json({
			success: false,
			error: errorMessage,
			command: commandType
		}, { status: 500 });
	}
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
