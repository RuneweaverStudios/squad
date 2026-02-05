/**
 * Token Usage SQLite Database Module
 *
 * Pre-aggregates token usage from JSONL files into SQLite for fast API queries.
 *
 * Design:
 * 1. Background job runs every 5 minutes (or on-demand)
 * 2. Scans JSONL files for new entries (tracks last processed position per file)
 * 3. Aggregates into 30-minute buckets in SQLite (48 points per 24h for better sparkline resolution)
 * 4. API queries SQLite instead of parsing files
 *
 * Tables:
 * - token_usage_hourly: Per-bucket aggregation by project, agent, session
 *                       (column named "hour_start" for backward compatibility, but stores 30-min bucket start)
 * - aggregation_state: Tracks last processed position per JSONL file
 *
 * Benefits:
 * - API response time: 109s → <100ms
 * - Incremental updates (only process new data)
 * - Historical queries become trivial
 * - 30-minute granularity for better sparkline resolution
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import { readdir, readFile, stat } from 'fs/promises';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import type { Database as DatabaseType } from 'better-sqlite3';

// ============================================================================
// Types
// ============================================================================

export interface HourlyUsageRow {
	id: number;
	project: string;
	agent: string | null;
	session_id: string;
	hour_start: string; // ISO timestamp rounded to 30-minute bucket (named for backward compatibility)
	input_tokens: number;
	cache_creation_tokens: number;
	cache_read_tokens: number;
	output_tokens: number;
	total_tokens: number;
	cost_usd: number;
	entry_count: number;
	updated_at: string;
}

export interface AggregationStateRow {
	file_path: string;
	last_position: number;
	last_modified: number;
	processed_at: string;
}

export interface AggregatedUsage {
	total_tokens: number;
	input_tokens: number;
	cache_creation_tokens: number;
	cache_read_tokens: number;
	output_tokens: number;
	cost_usd: number;
	session_count: number;
}

// ============================================================================
// Constants
// ============================================================================

const DB_PATH = path.join(os.homedir(), '.claude', 'token-usage.db');

// Claude Sonnet 4.5 Pricing (per million tokens)
const PRICING = {
	input: 3.0,
	cache_creation: 3.75,
	cache_read: 0.30,
	output: 15.0
} as const;

// ============================================================================
// Database Singleton
// ============================================================================

let db: DatabaseType | null = null;

/**
 * Get the SQLite database instance (creates if needed)
 */
export function getDatabase(): DatabaseType {
	if (!db) {
		db = new Database(DB_PATH);
		db.pragma('journal_mode = WAL');
		db.pragma('synchronous = NORMAL');
		initializeTables(db);
	}
	return db;
}

/**
 * Close the database connection (for cleanup)
 */
export function closeDatabase(): void {
	if (db) {
		db.close();
		db = null;
	}
}

// ============================================================================
// Schema Initialization
// ============================================================================

function initializeTables(db: DatabaseType): void {
	// Hourly usage aggregation table
	db.exec(`
		CREATE TABLE IF NOT EXISTS token_usage_hourly (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			project TEXT NOT NULL,
			agent TEXT,
			session_id TEXT NOT NULL,
			hour_start TEXT NOT NULL,
			input_tokens INTEGER DEFAULT 0,
			cache_creation_tokens INTEGER DEFAULT 0,
			cache_read_tokens INTEGER DEFAULT 0,
			output_tokens INTEGER DEFAULT 0,
			total_tokens INTEGER DEFAULT 0,
			cost_usd REAL DEFAULT 0,
			entry_count INTEGER DEFAULT 0,
			updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(project, session_id, hour_start)
		);

		CREATE INDEX IF NOT EXISTS idx_usage_hour ON token_usage_hourly(hour_start);
		CREATE INDEX IF NOT EXISTS idx_usage_project ON token_usage_hourly(project);
		CREATE INDEX IF NOT EXISTS idx_usage_agent ON token_usage_hourly(agent);
		CREATE INDEX IF NOT EXISTS idx_usage_project_hour ON token_usage_hourly(project, hour_start);
	`);

	// Aggregation state tracking table
	db.exec(`
		CREATE TABLE IF NOT EXISTS aggregation_state (
			file_path TEXT PRIMARY KEY,
			last_position INTEGER DEFAULT 0,
			last_modified INTEGER DEFAULT 0,
			processed_at TEXT DEFAULT CURRENT_TIMESTAMP
		)
	`);

	// Session-to-agent mapping cache
	db.exec(`
		CREATE TABLE IF NOT EXISTS session_agent_map (
			session_id TEXT PRIMARY KEY,
			agent TEXT NOT NULL,
			project TEXT NOT NULL,
			discovered_at TEXT DEFAULT CURRENT_TIMESTAMP
		);

		CREATE INDEX IF NOT EXISTS idx_sam_agent ON session_agent_map(agent);
		CREATE INDEX IF NOT EXISTS idx_sam_project ON session_agent_map(project);
	`);
}

// ============================================================================
// Session-Agent Mapping (Cached in SQLite)
// ============================================================================

/**
 * Scan for agent-*.txt files and update the session_agent_map table
 */
export async function updateSessionAgentMap(projectPaths: string[]): Promise<void> {
	const db = getDatabase();

	const upsertStmt = db.prepare(`
		INSERT INTO session_agent_map (session_id, agent, project, discovered_at)
		VALUES (?, ?, ?, datetime('now'))
		ON CONFLICT(session_id) DO UPDATE SET
			agent = excluded.agent,
			project = excluded.project
	`);

	for (const projectPath of projectPaths) {
		const projectName = path.basename(projectPath);

		// Check both .claude/sessions/ (new) and .claude/ (legacy)
		const dirsToCheck = [
			path.join(projectPath, '.claude', 'sessions'),
			path.join(projectPath, '.claude')
		];

		for (const dir of dirsToCheck) {
			try {
				const files = await readdir(dir);
				const agentFiles = files.filter(f => f.startsWith('agent-') && f.endsWith('.txt'));

				for (const file of agentFiles) {
					const sessionId = file.slice(6, -4); // Remove 'agent-' and '.txt'
					try {
						const content = await readFile(path.join(dir, file), 'utf-8');
						const agentName = content.trim();
						if (agentName) {
							upsertStmt.run(sessionId, agentName, projectName);
						}
					} catch {
						// Skip unreadable files
					}
				}
			} catch {
				// Directory doesn't exist
			}
		}
	}
}

/**
 * Get agent name for a session from cache
 */
export function getAgentForSession(sessionId: string): string | null {
	const db = getDatabase();
	const row = db.prepare('SELECT agent FROM session_agent_map WHERE session_id = ?').get(sessionId) as { agent: string } | undefined;
	return row?.agent ?? null;
}

// ============================================================================
// JSONL Parsing and Aggregation
// ============================================================================

interface JSONLEntry {
	timestamp?: string;
	message?: {
		usage?: {
			input_tokens?: number;
			cache_creation_input_tokens?: number;
			cache_read_input_tokens?: number;
			output_tokens?: number;
		};
	};
}

/**
 * Default bucket size in minutes for token aggregation.
 * 30 minutes gives 48 data points per 24 hours for better sparkline resolution.
 */
export const DEFAULT_BUCKET_MINUTES = 30;

/**
 * Round timestamp to bucket start (for bucketing)
 * @param timestamp - The timestamp to round
 * @param bucketMinutes - Bucket size in minutes (default: 30)
 * @returns ISO timestamp string rounded to bucket start
 */
function roundToBucket(timestamp: Date, bucketMinutes: number = DEFAULT_BUCKET_MINUTES): string {
	const rounded = new Date(timestamp);
	const minutes = rounded.getMinutes();
	const bucketStart = Math.floor(minutes / bucketMinutes) * bucketMinutes;
	rounded.setMinutes(bucketStart, 0, 0);
	return rounded.toISOString();
}

/**
 * Calculate cost from token counts
 */
function calculateCost(input: number, cacheCreation: number, cacheRead: number, output: number): number {
	return (
		(input / 1_000_000) * PRICING.input +
		(cacheCreation / 1_000_000) * PRICING.cache_creation +
		(cacheRead / 1_000_000) * PRICING.cache_read +
		(output / 1_000_000) * PRICING.output
	);
}

/**
 * Process a single JSONL file incrementally using streaming
 * Returns number of new entries processed
 *
 * IMPORTANT: Uses streaming to avoid loading entire files into memory.
 * With 950+ JSONL files totaling 2.2GB, loading files fully caused OOM crashes.
 */
async function processJSONLFile(
	filePath: string,
	project: string,
	sessionId: string
): Promise<number> {
	const db = getDatabase();

	// Get last processed state
	const stateRow = db.prepare('SELECT last_position, last_modified FROM aggregation_state WHERE file_path = ?')
		.get(filePath) as AggregationStateRow | undefined;

	const lastPosition = stateRow?.last_position ?? 0;
	const lastModified = stateRow?.last_modified ?? 0;

	// Check file modification time
	const fileStat = await stat(filePath);
	const currentModified = fileStat.mtimeMs;

	// Skip if file hasn't changed since last processing
	if (currentModified <= lastModified && lastPosition > 0) {
		return 0;
	}

	// Get agent for this session
	const agent = getAgentForSession(sessionId);

	// Prepare hourly aggregation buckets
	const hourlyBuckets = new Map<string, {
		input: number;
		cacheCreation: number;
		cacheRead: number;
		output: number;
		count: number;
	}>();

	let entriesProcessed = 0;
	let currentPosition = lastPosition;
	let isFirstLine = lastPosition > 0; // Skip first partial line when resuming

	// Use streaming to avoid loading entire file into memory
	const stream = createReadStream(filePath, {
		start: lastPosition,
		encoding: 'utf-8'
	});

	const rl = createInterface({
		input: stream,
		crlfDelay: Infinity
	});

	try {
		for await (const line of rl) {
			const lineBytes = Buffer.byteLength(line, 'utf-8') + 1; // +1 for newline
			currentPosition += lineBytes;

			// Skip the first line if we're resuming mid-file (it's likely partial)
			if (isFirstLine) {
				isFirstLine = false;
				continue;
			}

			if (!line.trim()) continue;

			try {
				const entry: JSONLEntry = JSON.parse(line);

				if (!entry.message?.usage || !entry.timestamp) continue;

				const usage = entry.message.usage;
				const bucketStart = roundToBucket(new Date(entry.timestamp));

				// Get or create bucket
				let bucket = hourlyBuckets.get(bucketStart);
				if (!bucket) {
					bucket = { input: 0, cacheCreation: 0, cacheRead: 0, output: 0, count: 0 };
					hourlyBuckets.set(bucketStart, bucket);
				}

				// Accumulate tokens
				bucket.input += usage.input_tokens || 0;
				bucket.cacheCreation += usage.cache_creation_input_tokens || 0;
				bucket.cacheRead += usage.cache_read_input_tokens || 0;
				bucket.output += usage.output_tokens || 0;
				bucket.count++;

				entriesProcessed++;
			} catch {
				// Skip malformed lines
			}
		}
	} finally {
		// Ensure stream is closed
		stream.destroy();
	}

	// Only update if we processed something
	if (entriesProcessed === 0 && hourlyBuckets.size === 0) {
		return 0;
	}

	// Update SQLite with aggregated data (upsert pattern)
	const upsertUsage = db.prepare(`
		INSERT INTO token_usage_hourly (
			project, agent, session_id, hour_start,
			input_tokens, cache_creation_tokens, cache_read_tokens, output_tokens,
			total_tokens, cost_usd, entry_count, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
		ON CONFLICT(project, session_id, hour_start) DO UPDATE SET
			input_tokens = input_tokens + excluded.input_tokens,
			cache_creation_tokens = cache_creation_tokens + excluded.cache_creation_tokens,
			cache_read_tokens = cache_read_tokens + excluded.cache_read_tokens,
			output_tokens = output_tokens + excluded.output_tokens,
			total_tokens = total_tokens + excluded.total_tokens,
			cost_usd = cost_usd + excluded.cost_usd,
			entry_count = entry_count + excluded.entry_count,
			updated_at = datetime('now')
	`);

	// Insert all hourly buckets in a transaction
	db.transaction(() => {
		for (const [hourStart, bucket] of hourlyBuckets) {
			const total = bucket.input + bucket.cacheCreation + bucket.cacheRead + bucket.output;
			const cost = calculateCost(bucket.input, bucket.cacheCreation, bucket.cacheRead, bucket.output);

			upsertUsage.run(
				project, agent, sessionId, hourStart,
				bucket.input, bucket.cacheCreation, bucket.cacheRead, bucket.output,
				total, cost, bucket.count
			);
		}

		// Update aggregation state
		db.prepare(`
			INSERT INTO aggregation_state (file_path, last_position, last_modified, processed_at)
			VALUES (?, ?, ?, datetime('now'))
			ON CONFLICT(file_path) DO UPDATE SET
				last_position = excluded.last_position,
				last_modified = excluded.last_modified,
				processed_at = datetime('now')
		`).run(filePath, currentPosition, currentModified);
	})();

	return entriesProcessed;
}

// ============================================================================
// Aggregation Job
// ============================================================================

/**
 * Run the full aggregation job
 * Scans all JSONL files and updates the SQLite database
 */
export async function runAggregation(): Promise<{
	filesProcessed: number;
	entriesProcessed: number;
	durationMs: number;
}> {
	const startTime = Date.now();
	const homeDir = os.homedir();
	const projectsDir = path.join(homeDir, '.claude', 'projects');

	let filesProcessed = 0;
	let entriesProcessed = 0;

	try {
		// Get all project directories
		const projectDirs = await readdir(projectsDir, { withFileTypes: true });

		// Discover project paths for session-agent mapping
		const codeDirs = await readdir(path.join(homeDir, 'code'), { withFileTypes: true });
		const projectPaths = codeDirs
			.filter(d => d.isDirectory())
			.map(d => path.join(homeDir, 'code', d.name));

		// Update session-agent mapping first
		await updateSessionAgentMap(projectPaths);

		// Process each project's JSONL files
		for (const dir of projectDirs) {
			if (!dir.isDirectory()) continue;

			const projectSlug = dir.name;
			// Extract project name from slug (e.g., "-home-jw-code-jat" -> "jat")
			const projectName = projectSlug.split('-').pop() || projectSlug;
			const projectDir = path.join(projectsDir, projectSlug);

			try {
				const files = await readdir(projectDir);
				const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

				for (const file of jsonlFiles) {
					const sessionId = file.replace('.jsonl', '');
					const filePath = path.join(projectDir, file);

					try {
						const entries = await processJSONLFile(filePath, projectName, sessionId);
						if (entries > 0) {
							filesProcessed++;
							entriesProcessed += entries;
						}
					} catch (err) {
						console.error(`Error processing ${filePath}:`, err);
					}
				}
			} catch {
				// Project directory unreadable, skip
			}
		}
	} catch (err) {
		console.error('Error during aggregation:', err);
	}

	return {
		filesProcessed,
		entriesProcessed,
		durationMs: Date.now() - startTime
	};
}

// ============================================================================
// Query Functions (Fast!)
// ============================================================================

/**
 * Get aggregated usage for a time range
 */
export function getUsageForRange(
	startTime: Date,
	endTime: Date,
	options?: {
		project?: string;
		agent?: string;
	}
): AggregatedUsage {
	const db = getDatabase();

	let sql = `
		SELECT
			COALESCE(SUM(total_tokens), 0) as total_tokens,
			COALESCE(SUM(input_tokens), 0) as input_tokens,
			COALESCE(SUM(cache_creation_tokens), 0) as cache_creation_tokens,
			COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
			COALESCE(SUM(output_tokens), 0) as output_tokens,
			COALESCE(SUM(cost_usd), 0) as cost_usd,
			COUNT(DISTINCT session_id) as session_count
		FROM token_usage_hourly
		WHERE hour_start >= ? AND hour_start < ?
	`;

	const params: (string | number)[] = [startTime.toISOString(), endTime.toISOString()];

	if (options?.project) {
		sql += ' AND project = ?';
		params.push(options.project);
	}

	if (options?.agent) {
		sql += ' AND agent = ?';
		params.push(options.agent);
	}

	const row = db.prepare(sql).get(...params) as AggregatedUsage;
	return row;
}

/**
 * Get time-bucketed breakdown for sparklines.
 * Data is stored in 30-minute buckets by default.
 * Use bucketMinutes to aggregate into larger buckets (e.g., 60 for hourly).
 *
 * @param startTime - Start of time range
 * @param endTime - End of time range
 * @param options.bucketMinutes - Output bucket size (30 = native 30-min, 60 = hourly, etc.)
 *                                Default is 30 (native resolution).
 */
export function getHourlyBreakdown(
	startTime: Date,
	endTime: Date,
	options?: {
		project?: string;
		agent?: string;
		bucketMinutes?: number; // 30 for 30-min buckets (native), 60 for hourly aggregation
	}
): Array<{
	timestamp: string;
	total_tokens: number;
	cost_usd: number;
}> {
	const db = getDatabase();
	const bucketMinutes = options?.bucketMinutes ?? DEFAULT_BUCKET_MINUTES;

	// Data is stored in 30-minute buckets (hour_start column).
	// For 30-minute output, just return the raw data grouped by hour_start.
	// For 60-minute (hourly) output, use SQLite datetime functions to re-bucket.
	let groupExpression: string;
	let selectExpression: string;

	if (bucketMinutes === 30 || bucketMinutes === DEFAULT_BUCKET_MINUTES) {
		// Native 30-minute buckets - just use hour_start directly
		groupExpression = 'hour_start';
		selectExpression = 'hour_start';
	} else if (bucketMinutes === 60) {
		// Re-aggregate to hourly by truncating to hour
		// strftime('%Y-%m-%dT%H:00:00.000Z', hour_start) rounds to hour start
		groupExpression = "strftime('%Y-%m-%dT%H:00:00.000Z', hour_start)";
		selectExpression = groupExpression;
	} else {
		// For other bucket sizes, fall back to native granularity
		// (could implement more complex SQL for arbitrary bucket sizes if needed)
		groupExpression = 'hour_start';
		selectExpression = 'hour_start';
	}

	let sql = `
		SELECT
			${selectExpression} as timestamp,
			COALESCE(SUM(total_tokens), 0) as total_tokens,
			COALESCE(SUM(cost_usd), 0) as cost_usd
		FROM token_usage_hourly
		WHERE hour_start >= ? AND hour_start < ?
	`;

	const params: (string | number)[] = [startTime.toISOString(), endTime.toISOString()];

	if (options?.project) {
		sql += ' AND project = ?';
		params.push(options.project);
	}

	if (options?.agent) {
		sql += ' AND agent = ?';
		params.push(options.agent);
	}

	sql += ` GROUP BY ${groupExpression} ORDER BY timestamp`;

	return db.prepare(sql).all(...params) as Array<{
		timestamp: string;
		total_tokens: number;
		cost_usd: number;
	}>;
}

/**
 * Get usage by project for multi-project sparklines
 */
export function getUsageByProject(
	startTime: Date,
	endTime: Date
): Array<{
	project: string;
	timestamp: string;
	total_tokens: number;
	cost_usd: number;
}> {
	const db = getDatabase();

	const sql = `
		SELECT
			project,
			hour_start as timestamp,
			COALESCE(SUM(total_tokens), 0) as total_tokens,
			COALESCE(SUM(cost_usd), 0) as cost_usd
		FROM token_usage_hourly
		WHERE hour_start >= ? AND hour_start < ?
		GROUP BY project, hour_start
		ORDER BY timestamp, project
	`;

	return db.prepare(sql).all(startTime.toISOString(), endTime.toISOString()) as Array<{
		project: string;
		timestamp: string;
		total_tokens: number;
		cost_usd: number;
	}>;
}

/**
 * Get usage by agent
 */
export function getUsageByAgent(
	startTime: Date,
	endTime: Date,
	options?: { project?: string }
): Array<{
	agent: string | null;
	total_tokens: number;
	cost_usd: number;
	session_count: number;
}> {
	const db = getDatabase();

	let sql = `
		SELECT
			agent,
			COALESCE(SUM(total_tokens), 0) as total_tokens,
			COALESCE(SUM(cost_usd), 0) as cost_usd,
			COUNT(DISTINCT session_id) as session_count
		FROM token_usage_hourly
		WHERE hour_start >= ? AND hour_start < ?
	`;

	const params: (string | number)[] = [startTime.toISOString(), endTime.toISOString()];

	if (options?.project) {
		sql += ' AND project = ?';
		params.push(options.project);
	}

	sql += ' GROUP BY agent ORDER BY total_tokens DESC';

	return db.prepare(sql).all(...params) as Array<{
		agent: string | null;
		total_tokens: number;
		cost_usd: number;
		session_count: number;
	}>;
}

/**
 * Get "today" usage (convenience function)
 */
export function getTodayUsage(options?: { project?: string; agent?: string }): AggregatedUsage {
	const now = new Date();
	const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

	return getUsageForRange(startOfDay, endOfDay, options);
}

/**
 * Get "this week" usage (convenience function)
 */
export function getWeekUsage(options?: { project?: string; agent?: string }): AggregatedUsage {
	const now = new Date();
	const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

	return getUsageForRange(startOfWeek, now, options);
}

/**
 * Get last 24 hours breakdown for sparklines.
 * Returns 48 data points (30-minute buckets) by default, or 24 points if bucketMinutes=60.
 */
export function getLast24HoursHourly(options?: {
	project?: string;
	agent?: string;
	bucketMinutes?: number;
}): Array<{
	timestamp: string;
	total_tokens: number;
	cost_usd: number;
}> {
	const now = new Date();
	const start24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

	return getHourlyBreakdown(start24h, now, options);
}

// ============================================================================
// Database Stats
// ============================================================================

/**
 * Get database statistics
 */
export function getDatabaseStats(): {
	totalRows: number;
	uniqueSessions: number;
	uniqueAgents: number;
	uniqueProjects: number;
	oldestEntry: string | null;
	newestEntry: string | null;
} {
	const db = getDatabase();

	const stats = db.prepare(`
		SELECT
			COUNT(*) as totalRows,
			COUNT(DISTINCT session_id) as uniqueSessions,
			COUNT(DISTINCT agent) as uniqueAgents,
			COUNT(DISTINCT project) as uniqueProjects,
			MIN(hour_start) as oldestEntry,
			MAX(hour_start) as newestEntry
		FROM token_usage_hourly
	`).get() as {
		totalRows: number;
		uniqueSessions: number;
		uniqueAgents: number;
		uniqueProjects: number;
		oldestEntry: string | null;
		newestEntry: string | null;
	};

	return stats;
}
