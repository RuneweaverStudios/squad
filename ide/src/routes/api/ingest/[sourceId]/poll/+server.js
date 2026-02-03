/**
 * Manual Poll Trigger API
 *
 * POST /api/ingest/[sourceId]/poll
 *
 * Triggers a single poll for a specific source by running jat-ingest --source <id> --once.
 */

import { json } from '@sveltejs/kit';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

/** @type {import('./$types').RequestHandler} */
export async function POST({ params }) {
	const { sourceId } = params;

	if (!sourceId) {
		return json({ error: 'Missing sourceId' }, { status: 400 });
	}

	const ingestBin = join(homedir(), '.local/bin/jat-ingest');
	if (!existsSync(ingestBin)) {
		return json({ error: 'jat-ingest not installed' }, { status: 500 });
	}

	try {
		const output = execSync(
			`node "${ingestBin}" --source "${sourceId}" --once 2>&1`,
			{ timeout: 30000, encoding: 'utf-8' }
		);

		return json({
			success: true,
			output: output.trim().split('\n').slice(-5).join('\n')
		});
	} catch (/** @type {any} */ error) {
		const stderr = error.stderr?.toString() || error.stdout?.toString() || error.message;
		return json({
			success: false,
			error: stderr.trim().split('\n').slice(-3).join('\n') || 'Poll failed'
		}, { status: 500 });
	}
}
