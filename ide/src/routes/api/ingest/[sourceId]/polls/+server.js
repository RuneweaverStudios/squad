/**
 * Poll History API
 *
 * GET /api/ingest/[sourceId]/polls?limit=20
 *
 * Returns recent poll_log entries for a specific source.
 */

import { json } from '@sveltejs/kit';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const DB_PATH = join(homedir(), '.local/share/jat/ingest.db');

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, url }) {
	const { sourceId } = params;

	if (!sourceId) {
		return json({ error: 'Missing sourceId' }, { status: 400 });
	}

	if (!existsSync(DB_PATH)) {
		return json({ polls: [], total: 0 });
	}

	const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10), 1), 100);

	let db;
	try {
		db = new Database(DB_PATH, { readonly: true });

		const polls = db.prepare(
			'SELECT id, poll_at, items_found, items_new, error, duration_ms FROM poll_log WHERE source_id = ? ORDER BY id DESC LIMIT ?'
		).all(sourceId, limit);

		const countRow = /** @type {any} */ (db.prepare('SELECT COUNT(*) as total FROM poll_log WHERE source_id = ?').get(sourceId));

		return json({
			polls,
			total: countRow?.total ?? 0
		});
	} catch (error) {
		console.error('Error reading poll history:', error);
		return json({ error: 'Failed to read poll history' }, { status: 500 });
	} finally {
		db?.close();
	}
}
