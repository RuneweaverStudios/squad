/**
 * Feeds API Endpoint
 *
 * Manages ingest source configuration in ~/.config/jat/feeds.json
 *
 * Endpoints:
 * - GET: Returns all configured sources
 * - POST: Add a new source
 * - PUT: Update an existing source
 * - DELETE: Remove a source by id
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const FEEDS_PATH = join(homedir(), '.config/jat/feeds.json');

interface FeedSource {
	id: string;
	type: 'rss' | 'slack' | 'telegram' | 'gmail' | 'custom';
	enabled: boolean;
	project: string;
	pollInterval: number;
	taskDefaults: {
		type: string;
		priority: number;
		labels: string[];
	};
	// RSS
	feedUrl?: string;
	// Slack
	secretName?: string;
	channel?: string;
	includeBots?: boolean;
	trackReplies?: boolean;
	maxTrackedThreads?: number;
	// Telegram
	chatId?: string;
	// Gmail
	imapUser?: string;
	folder?: string;
	filterFrom?: string;
	filterSubject?: string;
	markAsRead?: boolean;
	// Custom
	command?: string;
}

interface FeedsConfig {
	version: number;
	sources: FeedSource[];
}

function readFeeds(): FeedsConfig {
	try {
		const raw = readFileSync(FEEDS_PATH, 'utf-8');
		return JSON.parse(raw);
	} catch {
		return { version: 1, sources: [] };
	}
}

function writeFeeds(config: FeedsConfig): void {
	mkdirSync(dirname(FEEDS_PATH), { recursive: true });
	writeFileSync(FEEDS_PATH, JSON.stringify(config, null, 2) + '\n', { mode: 0o644 });
}

/**
 * GET /api/config/feeds
 * Returns all configured sources
 */
export const GET: RequestHandler = async () => {
	try {
		const config = readFeeds();
		return json({ success: true, config });
	} catch (error) {
		return json(
			{ success: false, error: 'Failed to read feeds config' },
			{ status: 500 }
		);
	}
};

/**
 * POST /api/config/feeds
 * Add a new source
 * Body: FeedSource object
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const source: FeedSource = await request.json();

		if (!source.id || !source.type || !source.project) {
			return json(
				{ success: false, error: 'id, type, and project are required' },
				{ status: 400 }
			);
		}

		const config = readFeeds();

		// Check for duplicate id
		if (config.sources.some((s) => s.id === source.id)) {
			return json(
				{ success: false, error: `Source with id "${source.id}" already exists` },
				{ status: 409 }
			);
		}

		config.sources.push(source);
		writeFeeds(config);

		return json({ success: true, source });
	} catch (error) {
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to add source'
			},
			{ status: 500 }
		);
	}
};

/**
 * PUT /api/config/feeds
 * Update an existing source
 * Body: FeedSource object (must include id)
 */
export const PUT: RequestHandler = async ({ request }) => {
	try {
		const source: FeedSource = await request.json();

		if (!source.id) {
			return json({ success: false, error: 'id is required' }, { status: 400 });
		}

		const config = readFeeds();
		const index = config.sources.findIndex((s) => s.id === source.id);

		if (index === -1) {
			return json(
				{ success: false, error: `Source "${source.id}" not found` },
				{ status: 404 }
			);
		}

		config.sources[index] = source;
		writeFeeds(config);

		return json({ success: true, source });
	} catch (error) {
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to update source'
			},
			{ status: 500 }
		);
	}
};

/**
 * DELETE /api/config/feeds
 * Remove a source by id
 * Query: ?id=source-id
 */
export const DELETE: RequestHandler = async ({ url }) => {
	try {
		const id = url.searchParams.get('id');

		if (!id) {
			return json({ success: false, error: 'id query parameter is required' }, { status: 400 });
		}

		const config = readFeeds();
		const index = config.sources.findIndex((s) => s.id === id);

		if (index === -1) {
			return json({ success: false, error: `Source "${id}" not found` }, { status: 404 });
		}

		config.sources.splice(index, 1);
		writeFeeds(config);

		return json({ success: true });
	} catch (error) {
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to delete source'
			},
			{ status: 500 }
		);
	}
};
