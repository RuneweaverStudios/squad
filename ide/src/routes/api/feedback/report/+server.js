/**
 * Feedback Widget Report API
 *
 * Receives bug reports from the <jat-feedback> widget and creates tasks.
 * Screenshots are saved to .jat/screenshots/ and referenced in the task description.
 * Includes CORS headers for cross-origin widget usage.
 *
 * POST - Submit a bug report (creates a task)
 * GET  - Health check (widget uses this to test connection)
 * OPTIONS - CORS preflight
 */
import { json } from '@sveltejs/kit';
import { createTask } from '$lib/server/jat-tasks.js';
import { invalidateCache } from '$lib/server/cache.js';
import { _resetTaskCache } from '../../../api/agents/+server.js';
import { emitEvent } from '$lib/utils/eventBus.server.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Access-Control-Max-Age': '86400'
};

/** Map widget priority strings to JAT numeric priorities */
const PRIORITY_MAP = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3
};

/** Map widget type strings to JAT task types */
const TYPE_MAP = {
	bug: 'bug',
	enhancement: 'feature',
	other: 'task'
};

/**
 * OPTIONS /api/feedback/report - CORS preflight
 */
export async function OPTIONS() {
	return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET /api/feedback/report - Health check
 */
export async function GET() {
	return json(
		{
			status: 'ok',
			service: 'jat-feedback-report',
			timestamp: new Date().toISOString()
		},
		{ headers: CORS_HEADERS }
	);
}

/**
 * POST /api/feedback/report - Submit a bug report
 */
export async function POST({ request }) {
	try {
		const body = /** @type {{ title?: string, description?: string, type?: string, priority?: string, page_url?: string, user_agent?: string, screenshots?: string[], console_logs?: Array<{ type?: string, level?: string, message?: unknown }>, selected_elements?: Array<{ tagName?: string, tag?: string, id?: string, className?: string }> }} */ (await request.json());

		// Validate required fields
		if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
			return json({ ok: false, error: 'Title is required' }, { status: 400, headers: CORS_HEADERS });
		}

		const title = body.title.trim();
		const description = body.description ? body.description.trim() : '';
		const type = TYPE_MAP[/** @type {keyof typeof TYPE_MAP} */ (body.type)] || 'bug';
		const priority = PRIORITY_MAP[/** @type {keyof typeof PRIORITY_MAP} */ (body.priority)] ?? 2;

		// Build rich description with metadata
		const descParts = [];

		if (description) {
			descParts.push(description);
		}

		// Add page URL
		if (body.page_url) {
			descParts.push(`**Page:** ${body.page_url}`);
		}

		// Add user agent
		if (body.user_agent) {
			descParts.push(`**Browser:** ${body.user_agent}`);
		}

		// Save screenshots and collect paths
		const screenshotPaths = [];
		if (body.screenshots && Array.isArray(body.screenshots) && body.screenshots.length > 0) {
			const projectPath = process.cwd().replace(/\/ide$/, '');
			const screenshotsDir = resolve(projectPath, '.jat', 'screenshots');

			if (!existsSync(screenshotsDir)) {
				mkdirSync(screenshotsDir, { recursive: true });
			}

			const timestamp = Date.now();
			for (let i = 0; i < body.screenshots.length; i++) {
				try {
					const dataUrl = body.screenshots[i];
					if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) continue;

					const [header, base64] = dataUrl.split(',');
					if (!base64) continue;

					const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
					const ext = mime === 'image/png' ? 'png' : 'jpg';
					const filename = `feedback-${timestamp}-${i}.${ext}`;
					const filepath = resolve(screenshotsDir, filename);

					writeFileSync(filepath, Buffer.from(base64, 'base64'));
					screenshotPaths.push(`.jat/screenshots/${filename}`);
				} catch (err) {
					console.warn(`[feedback-report] Screenshot save failed (${i}):`, err instanceof Error ? err.message : String(err));
				}
			}

			if (screenshotPaths.length > 0) {
				descParts.push(
					`**Screenshots:** ${screenshotPaths.length} saved\n${screenshotPaths.map((p) => `- \`${p}\``).join('\n')}`
				);
			}
		}

		// Add console logs summary
		if (body.console_logs && Array.isArray(body.console_logs) && body.console_logs.length > 0) {
			const logSummary = body.console_logs
				.slice(0, 10)
				.map((/** @type {{ type?: string, level?: string, message?: unknown }} */ log) => {
					const level = log.type || log.level || 'log';
					const msg =
						typeof log.message === 'string' ? log.message : JSON.stringify(log.message);
					return `- [${level}] ${msg.substring(0, 200)}`;
				})
				.join('\n');
			descParts.push(`**Console Logs** (${body.console_logs.length}):\n${logSummary}`);
		}

		// Add selected elements summary
		if (
			body.selected_elements &&
			Array.isArray(body.selected_elements) &&
			body.selected_elements.length > 0
		) {
			const elemSummary = body.selected_elements
				.slice(0, 5)
				.map((/** @type {{ tagName?: string, tag?: string, id?: string, className?: string }} */ el) => {
					const tag = el.tagName || el.tag || 'element';
					const id = el.id ? `#${el.id}` : '';
					const classes = el.className ? `.${el.className.split(' ').join('.')}` : '';
					return `- \`${tag}${id}${classes}\``;
				})
				.join('\n');
			descParts.push(
				`**Selected Elements** (${body.selected_elements.length}):\n${elemSummary}`
			);
		}

		const fullDescription = descParts.join('\n\n');

		// Create the task
		const projectPath = process.cwd().replace(/\/ide$/, '');
		const createdTask = createTask({
			projectPath,
			title: `[Feedback] ${title}`,
			description: fullDescription,
			type,
			priority,
			labels: ['widget', 'bug-report'],
			deps: [],
			assignee: null,
			notes: ''
		});

		// Invalidate caches
		invalidateCache.tasks();
		invalidateCache.agents();
		_resetTaskCache();

		// Emit event
		try {
			emitEvent({
				type: 'task_created',
				source: 'widget',
				data: {
					taskId: createdTask.id,
					title: createdTask.title,
					type,
					priority,
					labels: ['widget', 'bug-report']
				}
			});
		} catch (e) {
			console.error('[feedback-report] Failed to emit event:', e);
		}

		return json(
			{
				ok: true,
				id: createdTask.id,
				message: `Report submitted as task ${createdTask.id}`
			},
			{ status: 201, headers: CORS_HEADERS }
		);
	} catch (err) {
		console.error('[feedback-report] Error:', err);
		return json(
			{
				ok: false,
				error: (err instanceof Error ? err.message : String(err)) || 'Failed to submit report'
			},
			{ status: 500, headers: CORS_HEADERS }
		);
	}
}
