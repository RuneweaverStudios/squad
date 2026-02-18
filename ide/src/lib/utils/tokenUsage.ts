/**
 * Token Usage Tracking Utility
 *
 * Parses Claude Code JSONL session files to aggregate token usage and costs.
 * Data sources:
 * - JSONL files: ~/.claude/projects/{project}/{session-id}.jsonl
 * - Session-agent mapping: .claude/agent-{session_id}.txt
 *
 * Pricing: Claude Sonnet 4.5
 * - Input: $3.00 per million tokens
 * - Cache creation: $3.75 per million tokens
 * - Cache read: $0.30 per million tokens
 * - Output: $15.00 per million tokens
 */

import { readdir, readFile, stat } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Types
// ============================================================================

export interface TokenUsage {
	input_tokens: number;
	cache_creation_input_tokens: number;
	cache_read_input_tokens: number;
	output_tokens: number;
	total_tokens: number;
	cost: number;
	sessionCount: number;
}

export interface SessionUsage {
	sessionId: string;
	agentName: string | null;
	timestamp: string;
	tokens: {
		input: number;
		cache_creation: number;
		cache_read: number;
		output: number;
		total: number;
	};
	cost: number;
}

export interface JSONLEntry {
	type?: string;
	message?: {
		usage?: {
			input_tokens?: number;
			cache_creation_input_tokens?: number;
			cache_read_input_tokens?: number;
			output_tokens?: number;
		};
	};
	timestamp?: string;
}

export interface HourlyUsage {
	timestamp: string;
	tokens: number;
	cost: number;
}

export type TimeRange = 'today' | 'week' | 'all';

// ============================================================================
// Constants
// ============================================================================

// Claude Sonnet 4.5 Pricing (per million tokens)
const PRICING = {
	input: 3.0,
	cache_creation: 3.75,
	cache_read: 0.30,
	output: 15.0
} as const;

// ============================================================================
// Session-Agent Mapping
// ============================================================================

/**
 * Discover all project directories that have .claude/agent-*.txt files.
 * Scans ~/code/* for directories containing .claude/ subdirectories.
 *
 * Output: Array of project paths (e.g., ['/home/user/code/squad', '/home/user/code/chimaro'])
 */
async function discoverProjectPaths(): Promise<string[]> {
	const homeDir = os.homedir();
	const codeDirs = [
		path.join(homeDir, 'code')
	];

	const projectPaths: string[] = [];

	for (const codeDir of codeDirs) {
		try {
			const entries = await readdir(codeDir, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isDirectory()) {
					const projectPath = path.join(codeDir, entry.name);
					const claudeDir = path.join(projectPath, '.claude');
					try {
						await readdir(claudeDir);
						projectPaths.push(projectPath);
					} catch {
						// No .claude directory, skip
					}
				}
			}
		} catch {
			// Code directory doesn't exist, skip
		}
	}

	return projectPaths;
}

/**
 * Scan a directory for agent-*.txt files and add to map.
 * Helper function for buildSessionAgentMap.
 */
async function scanDirectoryForAgentFiles(dir: string, map: Map<string, string>): Promise<void> {
	try {
		const files = await readdir(dir);
		const agentFiles = files.filter(f => f.startsWith('agent-') && f.endsWith('.txt'));

		for (const file of agentFiles) {
			// Extract session ID from filename: agent-{session_id}.txt
			const sessionId = file.slice(6, -4); // Remove 'agent-' prefix and '.txt' suffix

			// Skip if we already have this session mapped (first location wins)
			if (map.has(sessionId)) continue;

			try {
				const filePath = path.join(dir, file);
				const content = await readFile(filePath, 'utf-8');
				const agentName = content.trim();

				if (agentName) {
					map.set(sessionId, agentName);
				}
			} catch (error) {
				// Skip files that can't be read
			}
		}
	} catch (error) {
		// Directory doesn't exist, skip
	}
}

/**
 * Build a map of session IDs to agent names by reading agent-*.txt files.
 * Scans ALL projects in ~/code/* to find agent mappings.
 * Checks .claude/sessions/ first (new location), then .claude/ (legacy location).
 *
 * Input: Project path (e.g., /home/user/code/project) - used as primary, with fallback to all projects
 * Output: Map<sessionId, agentName>
 * State: Read-only, parses agent-*.txt files from all projects
 */
export async function buildSessionAgentMap(projectPath: string): Promise<Map<string, string>> {
	const map = new Map<string, string>();

	// First, get all project paths to scan
	const allProjectPaths = await discoverProjectPaths();

	// Ensure the specified projectPath is first (highest priority)
	const projectsToScan = [
		projectPath,
		...allProjectPaths.filter(p => p !== projectPath)
	];

	for (const scanPath of projectsToScan) {
		// Scan .claude/sessions/ for agent files (new location)
		const sessionsDir = path.join(scanPath, '.claude', 'sessions');
		await scanDirectoryForAgentFiles(sessionsDir, map);

		// Also scan .claude/ directly (legacy location)
		const claudeDir = path.join(scanPath, '.claude');
		await scanDirectoryForAgentFiles(claudeDir, map);
	}

	return map;
}

// ============================================================================
// JSONL File Discovery
// ============================================================================

/**
 * Find a session's JSONL file across all project directories.
 * This handles the case where an agent is working on a different project
 * than the IDE is running from.
 *
 * Input: sessionId (string), primaryProjectPath (string)
 * Output: Full path to the JSONL file, or null if not found
 */
async function findSessionJSONL(sessionId: string, primaryProjectPath: string): Promise<string | null> {
	const homeDir = os.homedir();
	const projectsDir = path.join(homeDir, '.claude', 'projects');

	// First, try the primary project path
	const primarySlug = primaryProjectPath.replace(/\//g, '-');
	const primaryFile = path.join(projectsDir, primarySlug, `${sessionId}.jsonl`);
	try {
		await readFile(primaryFile, 'utf-8');
		return primaryFile;
	} catch {
		// Not found in primary, search all projects
	}

	// Search all project directories
	try {
		const projectDirs = await readdir(projectsDir, { withFileTypes: true });
		for (const dir of projectDirs) {
			if (dir.isDirectory() && dir.name !== primarySlug) {
				const candidateFile = path.join(projectsDir, dir.name, `${sessionId}.jsonl`);
				try {
					await readFile(candidateFile, 'utf-8');
					return candidateFile;
				} catch {
					// Not found in this project, continue
				}
			}
		}
	} catch {
		// Projects directory doesn't exist
	}

	return null;
}

// ============================================================================
// JSONL Parsing
// ============================================================================

/**
 * Parse a single JSONL session file and extract token usage.
 *
 * Input: sessionId (string), projectPath (string)
 * Output: SessionUsage object or null if parsing fails
 * State: Read-only, parses ~/.claude/projects/{project-slug}/{sessionId}.jsonl
 */
export async function parseSessionUsage(sessionId: string, projectPath: string): Promise<SessionUsage | null> {
	try {
		// Find the JSONL file (may be in a different project)
		const sessionFile = await findSessionJSONL(sessionId, projectPath);
		if (!sessionFile) {
			return null;
		}

		// Read file
		const content = await readFile(sessionFile, 'utf-8');

		// Parse JSONL (one JSON object per line)
		const lines = content.trim().split('\n');
		let totalInput = 0;
		let totalCacheCreation = 0;
		let totalCacheRead = 0;
		let totalOutput = 0;
		let lastTimestamp = new Date().toISOString();

		for (const line of lines) {
			if (!line.trim()) continue;

			try {
				const entry: JSONLEntry = JSON.parse(line);

				// Extract timestamp if available
				if (entry.timestamp) {
					lastTimestamp = entry.timestamp;
				}

				// Sum up token usage from .message.usage field
				if (entry.message?.usage) {
					const usage = entry.message.usage;
					totalInput += usage.input_tokens || 0;
					totalCacheCreation += usage.cache_creation_input_tokens || 0;
					totalCacheRead += usage.cache_read_input_tokens || 0;
					totalOutput += usage.output_tokens || 0;
				}
			} catch (parseError) {
				// Skip malformed lines
				continue;
			}
		}

		const totalTokens = totalInput + totalCacheCreation + totalCacheRead + totalOutput;

		// Calculate cost
		const cost = (
			(totalInput / 1_000_000) * PRICING.input +
			(totalCacheCreation / 1_000_000) * PRICING.cache_creation +
			(totalCacheRead / 1_000_000) * PRICING.cache_read +
			(totalOutput / 1_000_000) * PRICING.output
		);

		return {
			sessionId,
			agentName: null, // Will be filled in by caller
			timestamp: lastTimestamp,
			tokens: {
				input: totalInput,
				cache_creation: totalCacheCreation,
				cache_read: totalCacheRead,
				output: totalOutput,
				total: totalTokens
			},
			cost
		};
	} catch (error) {
		// Session file might not exist or be unreadable
		return null;
	}
}

// ============================================================================
// Time Range Filtering
// ============================================================================

/**
 * Check if a timestamp falls within the specified time range.
 *
 * Input: timestamp (ISO string), range ('today' | 'week' | 'all')
 * Output: boolean
 * State: Read-only, pure function
 */
function isWithinTimeRange(timestamp: string, range: TimeRange): boolean {
	if (range === 'all') return true;

	const now = new Date();
	const date = new Date(timestamp);

	if (range === 'today') {
		// Check if same calendar day
		return (
			date.getFullYear() === now.getFullYear() &&
			date.getMonth() === now.getMonth() &&
			date.getDate() === now.getDate()
		);
	}

	if (range === 'week') {
		// Check if within last 7 days
		const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		return date >= weekAgo;
	}

	return false;
}

// ============================================================================
// Agent-Specific Token Usage
// ============================================================================

/**
 * Get token usage for a specific agent within a time range.
 *
 * Input: agentName (string), timeRange ('today' | 'week' | 'all'), projectPath (string)
 * Output: TokenUsage object
 * State: Read-only, aggregates data from session files
 */
export async function getAgentUsage(
	agentName: string,
	timeRange: TimeRange,
	projectPath: string
): Promise<TokenUsage> {
	// Build session → agent mapping
	const sessionAgentMap = await buildSessionAgentMap(projectPath);

	// Find all sessions for this agent
	const agentSessions = Array.from(sessionAgentMap.entries())
		.filter(([_, name]) => name === agentName)
		.map(([sessionId, _]) => sessionId);

	// Parse usage for each session
	const sessionUsages = await Promise.all(
		agentSessions.map(sessionId => parseSessionUsage(sessionId, projectPath))
	);

	// Aggregate tokens across sessions (filtering by time range)
	let totalInput = 0;
	let totalCacheCreation = 0;
	let totalCacheRead = 0;
	let totalOutput = 0;
	let sessionCount = 0;

	for (const usage of sessionUsages) {
		if (!usage) continue;

		// Filter by time range
		if (!isWithinTimeRange(usage.timestamp, timeRange)) continue;

		totalInput += usage.tokens.input;
		totalCacheCreation += usage.tokens.cache_creation;
		totalCacheRead += usage.tokens.cache_read;
		totalOutput += usage.tokens.output;
		sessionCount++;
	}

	const totalTokens = totalInput + totalCacheCreation + totalCacheRead + totalOutput;

	// Calculate cost
	const cost = (
		(totalInput / 1_000_000) * PRICING.input +
		(totalCacheCreation / 1_000_000) * PRICING.cache_creation +
		(totalCacheRead / 1_000_000) * PRICING.cache_read +
		(totalOutput / 1_000_000) * PRICING.output
	);

	return {
		input_tokens: totalInput,
		cache_creation_input_tokens: totalCacheCreation,
		cache_read_input_tokens: totalCacheRead,
		output_tokens: totalOutput,
		total_tokens: totalTokens,
		cost,
		sessionCount
	};
}

// ============================================================================
// All Agents Token Usage
// ============================================================================

/**
 * Get token usage for all agents within a time range.
 *
 * Input: timeRange ('today' | 'week' | 'all'), projectPath (string)
 * Output: Map<agentName, TokenUsage>
 * State: Read-only, aggregates data from all session files
 */
export async function getAllAgentUsage(
	timeRange: TimeRange,
	projectPath: string
): Promise<Map<string, TokenUsage>> {
	const usageMap = new Map<string, TokenUsage>();

	// Build session → agent mapping
	const sessionAgentMap = await buildSessionAgentMap(projectPath);

	// Get unique agent names
	const agentNames = Array.from(new Set(sessionAgentMap.values()));

	// Fetch usage for each agent
	for (const agentName of agentNames) {
		const usage = await getAgentUsage(agentName, timeRange, projectPath);
		usageMap.set(agentName, usage);
	}

	return usageMap;
}

// ============================================================================
// Cost Calculation Helper
// ============================================================================

/**
 * Calculate cost from token usage breakdown.
 *
 * Input: TokenUsage object
 * Output: number (cost in USD)
 * State: Pure function
 */
export function calculateCost(usage: TokenUsage): number {
	return (
		(usage.input_tokens / 1_000_000) * PRICING.input +
		(usage.cache_creation_input_tokens / 1_000_000) * PRICING.cache_creation +
		(usage.cache_read_input_tokens / 1_000_000) * PRICING.cache_read +
		(usage.output_tokens / 1_000_000) * PRICING.output
	);
}

// ============================================================================
// System-Wide Token Usage (Cross-Agent Aggregation)
// ============================================================================

/**
 * Get aggregated token usage across ALL agents for a time range.
 *
 * Input: timeRange ('today' | 'week' | 'all'), projectPath (string)
 * Output: TokenUsage object (system-wide totals)
 * State: Read-only, aggregates data from all agents
 *
 * Use case: System capacity metrics, cost tracking, overview stats
 */
export async function getSystemUsage(
	timeRange: TimeRange,
	projectPath: string
): Promise<TokenUsage> {
	const allAgentUsage = await getAllAgentUsage(timeRange, projectPath);

	// Sum across all agents
	let totalInput = 0;
	let totalCacheCreation = 0;
	let totalCacheRead = 0;
	let totalOutput = 0;
	let totalSessions = 0;

	for (const usage of allAgentUsage.values()) {
		totalInput += usage.input_tokens;
		totalCacheCreation += usage.cache_creation_input_tokens;
		totalCacheRead += usage.cache_read_input_tokens;
		totalOutput += usage.output_tokens;
		totalSessions += usage.sessionCount;
	}

	const totalTokens = totalInput + totalCacheCreation + totalCacheRead + totalOutput;
	const cost = calculateCost({
		input_tokens: totalInput,
		cache_creation_input_tokens: totalCacheCreation,
		cache_read_input_tokens: totalCacheRead,
		output_tokens: totalOutput,
		total_tokens: totalTokens,
		cost: 0,
		sessionCount: totalSessions
	});

	return {
		input_tokens: totalInput,
		cache_creation_input_tokens: totalCacheCreation,
		cache_read_input_tokens: totalCacheRead,
		output_tokens: totalOutput,
		total_tokens: totalTokens,
		cost,
		sessionCount: totalSessions
	};
}

// ============================================================================
// Hourly Token Usage (RAW DATA - NO SMOOTHING)
// ============================================================================

/**
 * Get raw hourly token usage for the last 24 hours.
 * Returns actual tokens per hour with NO smoothing or synthetic data.
 *
 * Input: projectPath (string)
 * Output: Array of HourlyUsage objects (24 hours, oldest to newest)
 * State: Read-only, parses all JSONL files and groups by hour
 */
export async function getHourlyUsage(projectPath: string): Promise<HourlyUsage[]> {
	// Initialize 24 hours of empty data (newest to oldest)
	const now = new Date();
	const hourlyBuckets = new Map<string, { tokens: number; cost: number }>();

	// Create 24 hourly buckets
	for (let i = 23; i >= 0; i--) {
		const hourTime = new Date(now.getTime() - i * 60 * 60 * 1000);
		// Round to hour start
		hourTime.setMinutes(0, 0, 0);
		const hourKey = hourTime.toISOString();
		hourlyBuckets.set(hourKey, { tokens: 0, cost: 0 });
	}

	try {
		// Get all session files
		const homeDir = os.homedir();
		const projectSlug = projectPath.replace(/\//g, '-');
		const sessionsDir = path.join(homeDir, '.claude', 'projects', projectSlug);

		const files = await readdir(sessionsDir);
		const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

		// Parse each session file
		for (const file of jsonlFiles) {
			const sessionFile = path.join(sessionsDir, file);

			try {
				const content = await readFile(sessionFile, 'utf-8');
				const lines = content.trim().split('\n');

				for (const line of lines) {
					if (!line.trim()) continue;

					try {
						const entry: JSONLEntry = JSON.parse(line);

						// Skip if no usage data
						if (!entry.message?.usage) continue;

						// Get timestamp (use entry timestamp or current time)
						const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();

						// Skip if older than 24 hours
						const age = now.getTime() - timestamp.getTime();
						if (age > 24 * 60 * 60 * 1000) continue;

						// Round to hour start
						timestamp.setMinutes(0, 0, 0);
						const hourKey = timestamp.toISOString();

						// Get bucket (might not exist if timestamp is slightly off)
						if (!hourlyBuckets.has(hourKey)) {
							// Find closest bucket
							const closestBucket = Array.from(hourlyBuckets.keys())
								.reduce((closest, key) => {
									const diff = Math.abs(new Date(key).getTime() - timestamp.getTime());
									const closestDiff = Math.abs(new Date(closest).getTime() - timestamp.getTime());
									return diff < closestDiff ? key : closest;
								});
							hourlyBuckets.set(closestBucket, {
								tokens: (hourlyBuckets.get(closestBucket)?.tokens || 0),
								cost: (hourlyBuckets.get(closestBucket)?.cost || 0)
							});
						}

						const bucket = hourlyBuckets.get(hourKey);
						if (!bucket) continue;

						// Sum tokens
						const usage = entry.message.usage;
						const totalTokens = (
							(usage.input_tokens || 0) +
							(usage.cache_creation_input_tokens || 0) +
							(usage.cache_read_input_tokens || 0) +
							(usage.output_tokens || 0)
						);

						// Calculate cost
						const cost = (
							((usage.input_tokens || 0) / 1_000_000) * PRICING.input +
							((usage.cache_creation_input_tokens || 0) / 1_000_000) * PRICING.cache_creation +
							((usage.cache_read_input_tokens || 0) / 1_000_000) * PRICING.cache_read +
							((usage.output_tokens || 0) / 1_000_000) * PRICING.output
						);

						bucket.tokens += totalTokens;
						bucket.cost += cost;

					} catch (parseError) {
						// Skip malformed JSON lines
						continue;
					}
				}
			} catch (fileError) {
				// Skip unreadable files
				continue;
			}
		}
	} catch (error) {
		// Sessions directory might not exist
		console.warn('Could not read sessions directory:', error);
	}

	// Convert map to array (sorted oldest to newest)
	return Array.from(hourlyBuckets.entries())
		.sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
		.map(([timestamp, data]) => ({
			timestamp,
			tokens: data.tokens,
			cost: data.cost
		}));
}

// ============================================================================
// Session-Specific Hourly Token Usage (For Sparklines)
// ============================================================================

/**
 * Get hourly token usage for a specific agent (last 24 hours).
 * Aggregates across all sessions belonging to this agent.
 * Used for rendering sparklines in SessionCard headers.
 *
 * Input: agentName (string), projectPath (string)
 * Output: Array of HourlyUsage objects (24 hours, oldest to newest)
 * State: Read-only, parses JSONL files and groups by hour
 */
export async function getAgentHourlyUsage(agentName: string, projectPath: string): Promise<HourlyUsage[]> {
	// Build session → agent mapping to find this agent's sessions
	const sessionAgentMap = await buildSessionAgentMap(projectPath);

	// Find all sessions for this agent
	const agentSessionIds = Array.from(sessionAgentMap.entries())
		.filter(([_, name]) => name === agentName)
		.map(([sessionId, _]) => sessionId);

	// Initialize 24 hours of empty data
	const now = new Date();
	const hourlyBuckets = new Map<string, { tokens: number; cost: number }>();

	// Create 24 hourly buckets
	for (let i = 23; i >= 0; i--) {
		const hourTime = new Date(now.getTime() - i * 60 * 60 * 1000);
		hourTime.setMinutes(0, 0, 0);
		const hourKey = hourTime.toISOString();
		hourlyBuckets.set(hourKey, { tokens: 0, cost: 0 });
	}

	// Parse each session file and aggregate
	for (const sessionId of agentSessionIds) {
		try {
			// Find the JSONL file (may be in a different project)
			const sessionFile = await findSessionJSONL(sessionId, projectPath);
			if (!sessionFile) continue;

			const content = await readFile(sessionFile, 'utf-8');
			const lines = content.trim().split('\n');

			for (const line of lines) {
				if (!line.trim()) continue;

				try {
					const entry: JSONLEntry = JSON.parse(line);
					if (!entry.message?.usage) continue;

					const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();
					const age = now.getTime() - timestamp.getTime();
					if (age > 24 * 60 * 60 * 1000) continue;

					timestamp.setMinutes(0, 0, 0);
					const hourKey = timestamp.toISOString();

					let bucket = hourlyBuckets.get(hourKey);
					if (!bucket) {
						const closestKey = Array.from(hourlyBuckets.keys())
							.reduce((closest, key) => {
								const diff = Math.abs(new Date(key).getTime() - timestamp.getTime());
								const closestDiff = Math.abs(new Date(closest).getTime() - timestamp.getTime());
								return diff < closestDiff ? key : closest;
							});
						bucket = hourlyBuckets.get(closestKey);
						if (!bucket) continue;
					}

					const usage = entry.message.usage;
					const totalTokens = (
						(usage.input_tokens || 0) +
						(usage.cache_creation_input_tokens || 0) +
						(usage.cache_read_input_tokens || 0) +
						(usage.output_tokens || 0)
					);

					const cost = (
						((usage.input_tokens || 0) / 1_000_000) * PRICING.input +
						((usage.cache_creation_input_tokens || 0) / 1_000_000) * PRICING.cache_creation +
						((usage.cache_read_input_tokens || 0) / 1_000_000) * PRICING.cache_read +
						((usage.output_tokens || 0) / 1_000_000) * PRICING.output
					);

					bucket.tokens += totalTokens;
					bucket.cost += cost;
				} catch (parseError) {
					continue;
				}
			}
		} catch (error) {
			// Session file might not exist
			continue;
		}
	}

	return Array.from(hourlyBuckets.entries())
		.sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
		.map(([timestamp, data]) => ({
			timestamp,
			tokens: data.tokens,
			cost: data.cost
		}));
}

/**
 * Get hourly token usage for a specific session (last 24 hours).
 * Used for rendering sparklines in SessionCard headers.
 *
 * Input: sessionId (string), projectPath (string)
 * Output: Array of HourlyUsage objects (24 hours, oldest to newest)
 * State: Read-only, parses single JSONL file and groups by hour
 */
export async function getSessionHourlyUsage(sessionId: string, projectPath: string): Promise<HourlyUsage[]> {
	// Initialize 24 hours of empty data
	const now = new Date();
	const hourlyBuckets = new Map<string, { tokens: number; cost: number }>();

	// Create 24 hourly buckets
	for (let i = 23; i >= 0; i--) {
		const hourTime = new Date(now.getTime() - i * 60 * 60 * 1000);
		hourTime.setMinutes(0, 0, 0);
		const hourKey = hourTime.toISOString();
		hourlyBuckets.set(hourKey, { tokens: 0, cost: 0 });
	}

	try {
		// Construct path to session JSONL file
		const homeDir = os.homedir();
		const projectSlug = projectPath.replace(/\//g, '-');
		const sessionFile = path.join(homeDir, '.claude', 'projects', projectSlug, `${sessionId}.jsonl`);

		const content = await readFile(sessionFile, 'utf-8');
		const lines = content.trim().split('\n');

		for (const line of lines) {
			if (!line.trim()) continue;

			try {
				const entry: JSONLEntry = JSON.parse(line);

				// Skip if no usage data
				if (!entry.message?.usage) continue;

				// Get timestamp
				const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();

				// Skip if older than 24 hours
				const age = now.getTime() - timestamp.getTime();
				if (age > 24 * 60 * 60 * 1000) continue;

				// Round to hour start
				timestamp.setMinutes(0, 0, 0);
				const hourKey = timestamp.toISOString();

				// Get or find closest bucket
				let bucket = hourlyBuckets.get(hourKey);
				if (!bucket) {
					// Find closest bucket
					const closestKey = Array.from(hourlyBuckets.keys())
						.reduce((closest, key) => {
							const diff = Math.abs(new Date(key).getTime() - timestamp.getTime());
							const closestDiff = Math.abs(new Date(closest).getTime() - timestamp.getTime());
							return diff < closestDiff ? key : closest;
						});
					bucket = hourlyBuckets.get(closestKey);
					if (!bucket) continue;
				}

				// Sum tokens
				const usage = entry.message.usage;
				const totalTokens = (
					(usage.input_tokens || 0) +
					(usage.cache_creation_input_tokens || 0) +
					(usage.cache_read_input_tokens || 0) +
					(usage.output_tokens || 0)
				);

				// Calculate cost
				const cost = (
					((usage.input_tokens || 0) / 1_000_000) * PRICING.input +
					((usage.cache_creation_input_tokens || 0) / 1_000_000) * PRICING.cache_creation +
					((usage.cache_read_input_tokens || 0) / 1_000_000) * PRICING.cache_read +
					((usage.output_tokens || 0) / 1_000_000) * PRICING.output
				);

				bucket.tokens += totalTokens;
				bucket.cost += cost;

			} catch (parseError) {
				continue;
			}
		}
	} catch (error) {
		// Session file might not exist - return empty buckets
	}

	// Convert map to array (sorted oldest to newest)
	return Array.from(hourlyBuckets.entries())
		.sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
		.map(([timestamp, data]) => ({
			timestamp,
			tokens: data.tokens,
			cost: data.cost
		}));
}

// ============================================================================
// Context Remaining Percentage
// ============================================================================

const CONTEXT_LIMIT = 200_000; // Claude's context window

/**
 * Get context remaining percentage for an agent's most recent session.
 * Parses the last 20 lines of the JSONL file to find the most recent usage.
 *
 * Input: agentName (string), projectPath (string)
 * Output: Number 0-100 representing context remaining, or null if unavailable
 * State: Read-only, parses JSONL files
 */
export async function getAgentContextPercent(
	agentName: string,
	projectPath: string
): Promise<number | null> {
	try {
		// Build session → agent mapping
		const sessionAgentMap = await buildSessionAgentMap(projectPath);

		// Find sessions for this agent
		const agentSessions = Array.from(sessionAgentMap.entries())
			.filter(([_, name]) => name === agentName)
			.map(([sessionId, _]) => sessionId);

		if (agentSessions.length === 0) {
			return null;
		}

		// Try each session file to find the most recent usage
		let mostRecentUsage: number | null = null;
		let mostRecentTimestamp = 0;

		for (const sessionId of agentSessions) {
			try {
				const sessionFile = await findSessionJSONL(sessionId, projectPath);
				if (!sessionFile) continue;

				// Read file and get last 20 lines (more efficient than parsing entire file)
				const content = await readFile(sessionFile, 'utf-8');
				const lines = content.trim().split('\n');
				const lastLines = lines.slice(-20);

				// Find the most recent assistant message with usage info
				for (let i = lastLines.length - 1; i >= 0; i--) {
					const line = lastLines[i];
					if (!line.trim()) continue;

					try {
						const entry = JSON.parse(line);
						if (entry.message?.role === 'assistant' && entry.message?.usage) {
							const usage = entry.message.usage;
							const totalContext =
								(usage.input_tokens || 0) +
								(usage.cache_creation_input_tokens || 0) +
								(usage.cache_read_input_tokens || 0);

							// Check if this is more recent by file mtime
							const fileStat = await stat(sessionFile);
							const mtime = fileStat.mtimeMs;

							if (mtime > mostRecentTimestamp) {
								mostRecentTimestamp = mtime;
								// Calculate remaining percentage (clamped 0-100)
								const percent = Math.max(0, Math.min(100,
									Math.round(100 - (totalContext * 100 / CONTEXT_LIMIT))
								));
								mostRecentUsage = percent;
							}
							break; // Found usage in this file, move to next session
						}
					} catch {
						// Invalid JSON line, skip
					}
				}
			} catch {
				// Session file error, continue to next
			}
		}

		return mostRecentUsage;
	} catch (err) {
		console.error('Error getting context percent:', err);
		return null;
	}
}

// ============================================================================
// Worker Thread-Based Functions (Non-Blocking)
// ============================================================================

// Flag to control whether worker threads are used
let useWorkerThreads = true;

/**
 * Enable or disable worker threads for JSONL parsing.
 * When disabled, falls back to synchronous parsing (blocks event loop).
 */
export function setUseWorkerThreads(enabled: boolean): void {
	useWorkerThreads = enabled;
}

/**
 * Check if worker threads are enabled
 */
export function isUsingWorkerThreads(): boolean {
	return useWorkerThreads;
}

/**
 * Get all JSONL file paths for a project
 */
async function getAllSessionFilePaths(projectPath: string): Promise<string[]> {
	const homeDir = os.homedir();
	const projectSlug = projectPath.replace(/\//g, '-');
	const projectsDir = path.join(homeDir, '.claude', 'projects', projectSlug);

	try {
		const files = await readdir(projectsDir);
		return files
			.filter(f => f.endsWith('.jsonl'))
			.map(f => path.join(projectsDir, f));
	} catch {
		return [];
	}
}

/**
 * Get JSONL file paths for a specific agent
 */
async function getAgentSessionFilePaths(
	agentName: string,
	projectPath: string
): Promise<string[]> {
	const sessionAgentMap = await buildSessionAgentMap(projectPath);
	const homeDir = os.homedir();

	const filePaths: string[] = [];

	for (const [sessionId, agent] of sessionAgentMap.entries()) {
		if (agent !== agentName) continue;

		// Try to find the JSONL file
		const sessionFile = await findSessionJSONL(sessionId, projectPath);
		if (sessionFile) {
			filePaths.push(sessionFile);
		}
	}

	return filePaths;
}

/**
 * Get token usage using worker threads (non-blocking)
 *
 * This is the preferred method for API endpoints as it doesn't block
 * the main event loop during JSONL parsing.
 */
export async function getAgentUsageAsync(
	agentName: string,
	timeRange: TimeRange,
	projectPath: string
): Promise<TokenUsage> {
	if (!useWorkerThreads) {
		// Fall back to synchronous version
		return getAgentUsage(agentName, timeRange, projectPath);
	}

	try {
		// Dynamically import worker pool to avoid issues in non-server contexts
		const { parseMultipleSessionsAsync } = await import('$lib/server/workers');

		const filePaths = await getAgentSessionFilePaths(agentName, projectPath);
		if (filePaths.length === 0) {
			return {
				input_tokens: 0,
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 0,
				output_tokens: 0,
				total_tokens: 0,
				cost: 0,
				sessionCount: 0
			};
		}

		return await parseMultipleSessionsAsync(filePaths, timeRange);
	} catch (error) {
		console.warn('[tokenUsage] Worker thread failed, falling back to sync:', error);
		return getAgentUsage(agentName, timeRange, projectPath);
	}
}

/**
 * Get all agents' token usage using worker threads (non-blocking)
 */
export async function getAllAgentUsageAsync(
	timeRange: TimeRange,
	projectPath: string
): Promise<Map<string, TokenUsage>> {
	if (!useWorkerThreads) {
		return getAllAgentUsage(timeRange, projectPath);
	}

	try {
		const { parseMultipleSessionsAsync } = await import('$lib/server/workers');

		const usageMap = new Map<string, TokenUsage>();
		const sessionAgentMap = await buildSessionAgentMap(projectPath);
		const agentNames = Array.from(new Set(sessionAgentMap.values()));

		// Process each agent in parallel (workers handle the heavy lifting)
		const results = await Promise.all(
			agentNames.map(async (agentName) => {
				const filePaths = await getAgentSessionFilePaths(agentName, projectPath);
				if (filePaths.length === 0) {
					return {
						agentName,
						usage: {
							input_tokens: 0,
							cache_creation_input_tokens: 0,
							cache_read_input_tokens: 0,
							output_tokens: 0,
							total_tokens: 0,
							cost: 0,
							sessionCount: 0
						}
					};
				}

				const usage = await parseMultipleSessionsAsync(filePaths, timeRange);
				return { agentName, usage };
			})
		);

		for (const { agentName, usage } of results) {
			usageMap.set(agentName, usage);
		}

		return usageMap;
	} catch (error) {
		console.warn('[tokenUsage] Worker thread failed, falling back to sync:', error);
		return getAllAgentUsage(timeRange, projectPath);
	}
}

/**
 * Get hourly usage data using worker threads (non-blocking)
 */
export async function getHourlyUsageAsync(projectPath: string): Promise<HourlyUsage[]> {
	if (!useWorkerThreads) {
		return getHourlyUsage(projectPath);
	}

	try {
		const { aggregateHourlyUsageAsync } = await import('$lib/server/workers');

		const filePaths = await getAllSessionFilePaths(projectPath);
		if (filePaths.length === 0) {
			// Return 24 hours of empty buckets
			const now = new Date();
			const buckets: HourlyUsage[] = [];
			for (let i = 23; i >= 0; i--) {
				const hourTime = new Date(now.getTime() - i * 60 * 60 * 1000);
				hourTime.setMinutes(0, 0, 0);
				buckets.push({ timestamp: hourTime.toISOString(), tokens: 0, cost: 0 });
			}
			return buckets;
		}

		return await aggregateHourlyUsageAsync(filePaths, 24);
	} catch (error) {
		console.warn('[tokenUsage] Worker thread failed, falling back to sync:', error);
		return getHourlyUsage(projectPath);
	}
}

/**
 * Get agent hourly usage using worker threads (non-blocking)
 */
export async function getAgentHourlyUsageAsync(
	agentName: string,
	projectPath: string
): Promise<HourlyUsage[]> {
	if (!useWorkerThreads) {
		return getAgentHourlyUsage(agentName, projectPath);
	}

	try {
		const { aggregateHourlyUsageAsync } = await import('$lib/server/workers');

		const filePaths = await getAgentSessionFilePaths(agentName, projectPath);
		if (filePaths.length === 0) {
			// Return 24 hours of empty buckets
			const now = new Date();
			const buckets: HourlyUsage[] = [];
			for (let i = 23; i >= 0; i--) {
				const hourTime = new Date(now.getTime() - i * 60 * 60 * 1000);
				hourTime.setMinutes(0, 0, 0);
				buckets.push({ timestamp: hourTime.toISOString(), tokens: 0, cost: 0 });
			}
			return buckets;
		}

		return await aggregateHourlyUsageAsync(filePaths, 24);
	} catch (error) {
		console.warn('[tokenUsage] Worker thread failed, falling back to sync:', error);
		return getAgentHourlyUsage(agentName, projectPath);
	}
}
