/**
 * Ingest Stats API
 *
 * GET /api/ingest/stats
 *
 * Returns item counts and last ingested timestamp per source.
 */

import { json } from '@sveltejs/kit';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const DB_PATH = join(homedir(), '.local/share/jat/ingest.db');

/** @type {import('./$types').RequestHandler} */
export async function GET() {
	if (!existsSync(DB_PATH)) {
		return json({ stats: {} });
	}

	let db;
	try {
		db = new Database(DB_PATH, { readonly: true });

		const rows = db.prepare(
			'SELECT source_id, COUNT(*) as total, MAX(ingested_at) as lastIngested FROM ingested_items GROUP BY source_id'
		).all();

		// Get last poll info per source from poll_log
		/** @type {any[]} */
		let pollRows = [];
		try {
			pollRows = /** @type {any[]} */ (db.prepare(
				`SELECT p.source_id, p.poll_at, p.items_found, p.items_new, p.error, p.duration_ms
				 FROM poll_log p
				 INNER JOIN (SELECT source_id, MAX(id) as max_id FROM poll_log GROUP BY source_id) latest
				 ON p.source_id = latest.source_id AND p.id = latest.max_id`
			).all());
		} catch {
			// poll_log table may not exist yet
		}

		/** @type {Record<string, any>} */
		const pollMap = {};
		for (const row of pollRows) {
			pollMap[row.source_id] = {
				lastPollAt: row.poll_at,
				lastPollItemsFound: row.items_found,
				lastPollItemsNew: row.items_new,
				lastPollError: row.error || null,
				lastPollDurationMs: row.duration_ms
			};
		}

		/** @type {Record<string, { total: number, lastIngested: string | null, lastPollAt?: string, lastPollError?: string | null, lastPollItemsFound?: number, lastPollItemsNew?: number, lastPollDurationMs?: number }>} */
		const stats = {};
		for (const row of /** @type {any[]} */ (rows)) {
			stats[row.source_id] = {
				total: row.total,
				lastIngested: row.lastIngested || null,
				...(pollMap[row.source_id] || {})
			};
		}

		// Also include sources that have poll_log entries but no ingested items yet
		for (const sourceId of Object.keys(pollMap)) {
			if (!stats[sourceId]) {
				stats[sourceId] = {
					total: 0,
					lastIngested: null,
					...pollMap[sourceId]
				};
			}
		}

		return json({ stats });
	} catch (error) {
		console.error('Error reading ingest stats:', error);
		return json({ error: 'Failed to read ingest stats' }, { status: 500 });
	} finally {
		db?.close();
	}
}
