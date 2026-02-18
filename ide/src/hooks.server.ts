/**
 * SvelteKit Server Hooks
 *
 * This file runs on server startup and handles background tasks.
 *
 * Features:
 * - Cleans up stale SQUAD signal files from /tmp on startup
 * - Cleans up orphaned .claude/sessions/agent-*.txt files (where Claude session no longer exists)
 * - Runs token usage aggregation on startup
 * - Schedules periodic aggregation every 5 minutes
 * - Request context logging with unique request IDs
 * - Performance tracking for all API requests
 */

import { runAggregation } from '$lib/server/tokenUsageDb';
import { readdirSync, unlinkSync, statSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { redirect } from '@sveltejs/kit';
import logger from '$lib/utils/logger';
import { shouldLog, getSamplingRate } from '$lib/config/logConfig';
import { dev } from '$app/environment';
import { SIGNAL_TTL } from '$lib/config/constants';
import { isKeycloakEnabled, getSessionCookieName } from '$lib/auth/keycloak';
import { getSessionFromCookie } from '$lib/auth/session';

// Track aggregation interval
let aggregationInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Clean up stale SQUAD signal/activity files from /tmp
 *
 * These files are ephemeral state indicators for agent sessions.
 * When the IDE restarts, old session states are stale and useless.
 * Cleaning on startup prevents accumulation over time.
 *
 * File patterns cleaned:
 * - squad-signal-*.json - Signal files by session UUID
 * - squad-signal-tmux-*.json - Signal files by tmux session name
 * - squad-activity-*.json - Activity files
 * - squad-question-*.json - Question files
 * - squad-monitor-*.pid - Monitor PID files
 * - claude-*-cwd - Claude Code working directory markers (hex IDs)
 *
 * NOT cleaned (preserved across restarts):
 * - squad-timeline-*.jsonl - Append-only session history for EventStack
 */
function cleanupStaleSignalFiles(): { cleaned: number; errors: number; preserved: number } {
	const tmpDir = '/tmp';

	// Patterns that should be deleted unconditionally (always stale on restart)
	const unconditionalPatterns = [
		/^squad-activity-.*\.json$/,
		// NOTE: squad-timeline-*.jsonl files are NOT deleted - they're append-only session history
		// that agents need for displaying EventStack. They should persist across IDE restarts.
		// Old timeline files are naturally cleaned up on system reboot (/tmp is ephemeral).
		/^squad-question-.*\.json$/,
		/^squad-monitor-.*\.pid$/,
		/^claude-[0-9a-f]+-cwd$/ // Claude Code working directory markers
	];

	// Signal files need age-based cleanup - only delete if older than TTL
	// This preserves recent signals from active agents across IDE restarts
	const signalPattern = /^squad-signal-.*\.json$/;

	let cleaned = 0;
	let errors = 0;
	let preserved = 0;

	try {
		const files = readdirSync(tmpDir);

		for (const file of files) {
			const filePath = join(tmpDir, file);

			try {
				const stat = statSync(filePath);
				if (!stat.isFile()) continue;

				// Handle signal files with age-based cleanup
				if (signalPattern.test(file)) {
					const ageMs = Date.now() - stat.mtimeMs;

					// Read signal to determine appropriate TTL
					let ttl = SIGNAL_TTL.TRANSIENT_MS; // Default to shorter TTL
					try {
						const content = readFileSync(filePath, 'utf-8');
						const signal = JSON.parse(content);
						// Use longer TTL for user-waiting states
						if (signal.type === 'state' && SIGNAL_TTL.USER_WAITING_STATES.includes(signal.state)) {
							ttl = SIGNAL_TTL.USER_WAITING_MS;
						} else if (signal.type === 'complete') {
							ttl = SIGNAL_TTL.USER_WAITING_MS;
						}
					} catch {
						// If we can't read/parse, use short TTL
					}

					if (ageMs > ttl) {
						unlinkSync(filePath);
						cleaned++;
					} else {
						preserved++;
					}
					continue;
				}

				// Handle unconditional patterns (delete regardless of age)
				const matchesUnconditional = unconditionalPatterns.some((pattern) => pattern.test(file));
				if (matchesUnconditional) {
					unlinkSync(filePath);
					cleaned++;
				}
			} catch {
				// File may have been deleted between readdir and unlink, ignore
				errors++;
			}
		}
	} catch (err) {
		console.error('[Signal Cleanup] Failed to read /tmp directory:', err);
	}

	return { cleaned, errors, preserved };
}

/**
 * Clean up orphaned .claude/sessions/agent-*.txt files
 *
 * These files map Claude session IDs to agent names for IDE tracking.
 * Over time, sessions accumulate but the corresponding Claude project sessions
 * get deleted or expire. This function identifies orphaned files by checking
 * if the session ID still exists in ~/.claude/projects/.
 *
 * IMPORTANT: Only deletes files where the corresponding Claude session no longer
 * exists, preserving the ability to resume any valid session.
 *
 * Session file format: .claude/sessions/agent-{sessionId}.txt
 * Claude session format: ~/.claude/projects/{project-slug}/{sessionId}.jsonl
 *
 * The project-slug is derived from the project path by replacing / with -
 * Example: /home/jw/code/squad -> -home-jw-code-squad
 */
function cleanupOrphanedSessionFiles(): { cleaned: number; errors: number; scanned: number } {
	const home = homedir();
	const codeDir = join(home, 'code');
	const claudeProjectsDir = join(home, '.claude', 'projects');

	let cleaned = 0;
	let errors = 0;
	let scanned = 0;

	// Scan all projects in ~/code/ that have .claude/sessions/ directories
	try {
		if (!existsSync(codeDir)) {
			return { cleaned: 0, errors: 0, scanned: 0 };
		}

		const projects = readdirSync(codeDir);

		for (const projectName of projects) {
			const projectPath = join(codeDir, projectName);
			const sessionsDir = join(projectPath, '.claude', 'sessions');

			// Skip if no sessions directory
			if (!existsSync(sessionsDir)) continue;

			// Determine the Claude project slug for this project
			// Path /home/jw/code/squad -> slug -home-jw-code-squad
			const projectSlug = projectPath.replace(/\//g, '-');
			const claudeProjectDir = join(claudeProjectsDir, projectSlug);

			try {
				const sessionFiles = readdirSync(sessionsDir);

				for (const file of sessionFiles) {
					// Only process agent-*.txt files
					if (!file.startsWith('agent-') || !file.endsWith('.txt')) continue;
					// Skip activity files (agent-*-activity.jsonl)
					if (file.includes('-activity.')) continue;

					scanned++;

					// Extract session ID from filename: agent-{sessionId}.txt
					const sessionId = file.replace(/^agent-/, '').replace(/\.txt$/, '');

					// Check if corresponding Claude session exists
					// Claude stores sessions as {sessionId}.jsonl or {sessionId}/ directory
					const sessionJsonl = join(claudeProjectDir, `${sessionId}.jsonl`);
					const sessionDir = join(claudeProjectDir, sessionId);

					const sessionExists = existsSync(sessionJsonl) || existsSync(sessionDir);

					if (!sessionExists) {
						// Session no longer exists in Claude - safe to delete
						const filePath = join(sessionsDir, file);
						try {
							const stat = statSync(filePath);
							if (stat.isFile()) {
								unlinkSync(filePath);
								cleaned++;
							}
						} catch {
							errors++;
						}
					}
				}
			} catch {
				// Skip projects we can't read
				errors++;
			}
		}
	} catch (err) {
		console.error('[Session Cleanup] Failed to scan code directory:', err);
	}

	return { cleaned, errors, scanned };
}

// Run startup tasks (cleanup + aggregation)
async function initializeStartupTasks() {
	// Run signal file cleanup immediately (non-blocking, fast)
	console.log('[Signal Cleanup] Cleaning stale temp files from /tmp...');
	const cleanupResult = cleanupStaleSignalFiles();
	if (cleanupResult.cleaned > 0 || cleanupResult.preserved > 0) {
		const parts = [];
		if (cleanupResult.cleaned > 0) parts.push(`removed ${cleanupResult.cleaned} stale`);
		if (cleanupResult.preserved > 0) parts.push(`preserved ${cleanupResult.preserved} active`);
		if (cleanupResult.errors > 0) parts.push(`${cleanupResult.errors} errors`);
		console.log(`[Signal Cleanup] ${parts.join(', ')}`);
	} else {
		console.log('[Signal Cleanup] No stale files to clean');
	}

	// Clean up orphaned session files (files where Claude session no longer exists)
	console.log('[Session Cleanup] Checking for orphaned session files...');
	const sessionCleanupResult = cleanupOrphanedSessionFiles();
	if (sessionCleanupResult.cleaned > 0) {
		console.log(
			`[Session Cleanup] Removed ${sessionCleanupResult.cleaned} orphaned files (scanned ${sessionCleanupResult.scanned})${sessionCleanupResult.errors > 0 ? ` (${sessionCleanupResult.errors} errors)` : ''}`
		);
	} else if (sessionCleanupResult.scanned > 0) {
		console.log(`[Session Cleanup] All ${sessionCleanupResult.scanned} session files are valid`);
	}

	// Defer aggregation by 2 seconds to let server start serving requests first
	setTimeout(async () => {
		console.log('[Token Aggregation] Running initial aggregation...');
		try {
			const result = await runAggregation();
			console.log(
				`[Token Aggregation] Initial aggregation complete: ${result.filesProcessed} files, ${result.entriesProcessed} entries in ${result.durationMs}ms`
			);
		} catch (error) {
			console.error('[Token Aggregation] Initial aggregation failed:', error);
		}

		// Schedule periodic aggregation every 5 minutes
		if (!aggregationInterval) {
			const FIVE_MINUTES = 5 * 60 * 1000;
			aggregationInterval = setInterval(async () => {
				try {
					const result = await runAggregation();
					if (result.entriesProcessed > 0) {
						console.log(
							`[Token Aggregation] Periodic update: ${result.filesProcessed} files, ${result.entriesProcessed} entries in ${result.durationMs}ms`
						);
					}
				} catch (error) {
					console.error('[Token Aggregation] Periodic aggregation failed:', error);
				}
			}, FIVE_MINUTES);

			console.log('[Token Aggregation] Scheduled periodic aggregation every 5 minutes');
		}
	}, 2000);
}

// Initialize startup tasks when the server starts
initializeStartupTasks();

// Export handle function with request context logging
export const handle = async ({ event, resolve }) => {
	// Generate unique request ID for tracing
	const requestId = randomUUID();
	const startTime = Date.now();

	// Add request ID and logger to event.locals for use in endpoints
	event.locals.requestId = requestId;
	event.locals.logger = logger.child({
		requestId,
		path: event.url.pathname,
		method: event.request.method,
		query: event.url.search
	});

	// Keycloak auth: when enabled, require valid session for non-public paths
	if (isKeycloakEnabled()) {
		const pathname = event.url.pathname;
		const isPublic =
			pathname.startsWith('/auth/') ||
			pathname === '/login' ||
			pathname.startsWith('/_app/') ||
			pathname.startsWith('/favicon');

		if (!isPublic) {
			const cookieValue = event.cookies.get(getSessionCookieName());
			const session = await getSessionFromCookie(cookieValue);
			if (session) {
				event.locals.user = session.user;
			} else {
				throw redirect(302, '/login');
			}
		}
	}

	// Check if we should log this request based on sampling
	// In dev mode, still apply sampling for high-frequency endpoints to reduce log spam
	const samplingRate = getSamplingRate(event.url.pathname);
	const isHighFrequencyEndpoint = samplingRate < 1.0;
	const shouldSample = Math.random() < samplingRate;

	// Log request start (apply sampling even in dev mode for high-frequency endpoints)
	if (shouldSample || (dev && !isHighFrequencyEndpoint)) {
		event.locals.logger.info({
			userAgent: event.request.headers.get('user-agent'),
			referer: event.request.headers.get('referer'),
			ip: event.getClientAddress()
		}, `Request started: ${event.request.method} ${event.url.pathname}`);
	}

	try {
		// Process the request
		const response = await resolve(event);

		// Calculate duration
		const duration = Date.now() - startTime;

		// Log request completion (apply sampling even in dev mode for high-frequency endpoints)
		// Always log errors (4xx/5xx) and slow requests (>1000ms) regardless of sampling
		const isErrorOrSlow = response.status >= 400 || duration > 1000;
		if (shouldSample || (dev && !isHighFrequencyEndpoint) || isErrorOrSlow) {
			const level = response.status >= 500 ? 'error' :
			              response.status >= 400 ? 'warn' :
			              duration > 1000 ? 'warn' : 'info';

			event.locals.logger[level]({
				status: response.status,
				duration,
				contentType: response.headers.get('content-type')
			}, `Request completed: ${event.request.method} ${event.url.pathname}`);
		}

		// Add request ID to response headers for client correlation
		response.headers.append('x-request-id', requestId);

		return response;
	} catch (error) {
		// Log request error
		const duration = Date.now() - startTime;

		event.locals.logger.error({
			error,
			duration,
			stack: error instanceof Error ? error.stack : undefined
		}, `Request failed: ${event.request.method} ${event.url.pathname}`);

		throw error;
	}
};
