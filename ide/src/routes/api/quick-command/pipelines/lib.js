/**
 * Shared pipeline CRUD helpers.
 * Extracted from +server.js because SvelteKit only allows HTTP method exports in route files.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_DIR = join(homedir(), '.config', 'squad');
const PIPELINES_FILE = join(CONFIG_DIR, 'quick-command-pipelines.json');

/**
 * @typedef {{ id: string, name: string, description?: string, steps: Array<{ id: string, order: number, templateId?: string | null, prompt?: string | null, model?: string | null, label?: string | null }>, defaultProject?: string | null, createdAt?: string, updatedAt?: string }} Pipeline
 */

/**
 * Read pipelines from config file.
 * @returns {Promise<Pipeline[]>}
 */
export async function readPipelines() {
	try {
		if (!existsSync(PIPELINES_FILE)) return [];
		const content = await readFile(PIPELINES_FILE, 'utf-8');
		const data = JSON.parse(content);
		return Array.isArray(data) ? data : [];
	} catch {
		return [];
	}
}

/**
 * Write pipelines to config file.
 * @param {Pipeline[]} pipelines
 */
export async function writePipelines(pipelines) {
	if (!existsSync(CONFIG_DIR)) {
		await mkdir(CONFIG_DIR, { recursive: true });
	}
	await writeFile(PIPELINES_FILE, JSON.stringify(pipelines, null, 2), 'utf-8');
}
