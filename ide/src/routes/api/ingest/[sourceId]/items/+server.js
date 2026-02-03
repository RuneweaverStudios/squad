/**
 * Ingest Audit Items API
 *
 * GET /api/ingest/[sourceId]/items?limit=20&offset=0
 *
 * Returns paginated ingested items for a specific source from ingest.db.
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
		return json({ items: [], total: 0, hasMore: false });
	}

	const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10), 1), 100);
	const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);

	let db;
	try {
		db = new Database(DB_PATH, { readonly: true });

		/** @type {any} */
		const countRow = db.prepare('SELECT COUNT(*) as total FROM ingested_items WHERE source_id = ?').get(sourceId);
		const total = countRow?.total ?? 0;

		let items;
		try {
			// Try with thread_replies join for reply count
			items = db.prepare(
				`SELECT i.id, i.item_id, i.task_id, i.title, i.ingested_at,
				        COALESCE(t.reply_count, 0) as reply_count, t.active as thread_active
				 FROM ingested_items i
				 LEFT JOIN thread_replies t ON i.source_id = t.source_id AND i.item_id = t.parent_item_id
				 WHERE i.source_id = ? ORDER BY i.ingested_at DESC, i.id ASC LIMIT ? OFFSET ?`
			).all(sourceId, limit, offset);
		} catch {
			// Fallback if thread_replies table doesn't exist
			items = db.prepare(
				'SELECT id, item_id, task_id, title, ingested_at FROM ingested_items WHERE source_id = ? ORDER BY ingested_at DESC, id ASC LIMIT ? OFFSET ?'
			).all(sourceId, limit, offset);
		}

		return json({
			items,
			total,
			hasMore: offset + limit < total
		});
	} catch (error) {
		console.error('Error reading ingest items:', error);
		return json({ error: 'Failed to read ingest data' }, { status: 500 });
	} finally {
		db?.close();
	}
}
