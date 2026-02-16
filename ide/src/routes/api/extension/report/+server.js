/**
 * Extension Bug Report API
 *
 * Receives bug reports from the JAT Browser Extension and creates tasks.
 * Screenshots are saved to .jat/screenshots/ and referenced in the task description.
 *
 * POST - Submit a bug report (creates a task)
 * GET  - Health check (extension uses this to test connection)
 */
import { json } from '@sveltejs/kit';
import { createTask } from '$lib/server/jat-tasks.js';
import { invalidateCache } from '$lib/server/cache.js';
import { _resetTaskCache } from '../../../api/agents/+server.js';
import { emitEvent } from '$lib/utils/eventBus.server.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';

/** Map extension priority strings to JAT numeric priorities */
const PRIORITY_MAP = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3
};

/** Map extension type strings to JAT task types */
const TYPE_MAP = {
	bug: 'bug',
	enhancement: 'feature',
	other: 'task'
};

/**
 * GET /api/extension/report - Health check
 */
export async function GET() {
	return json({
		status: 'ok',
		service: 'jat-extension-report',
		timestamp: new Date().toISOString()
	});
}

/**
 * POST /api/extension/report - Submit a bug report
 */
export async function POST({ request }) {
	try {
		const body = await request.json();

		// Validate required fields
		if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
			return json({ ok: false, error: 'Title is required' }, { status: 400 });
		}

		const title = body.title.trim();
		const description = body.description ? body.description.trim() : '';
		const type = TYPE_MAP[body.type] || 'bug';
		const priority = PRIORITY_MAP[body.priority] ?? 2;

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
					const filename = `report-${timestamp}-${i}.${ext}`;
					const filepath = resolve(screenshotsDir, filename);

					writeFileSync(filepath, Buffer.from(base64, 'base64'));
					screenshotPaths.push(`.jat/screenshots/${filename}`);
				} catch (err) {
					console.warn(`[extension-report] Screenshot save failed (${i}):`, err.message);
				}
			}

			if (screenshotPaths.length > 0) {
				descParts.push(`**Screenshots:** ${screenshotPaths.length} saved\n${screenshotPaths.map(p => `- \`${p}\``).join('\n')}`);
			}
		}

		// Add console logs summary
		if (body.console_logs && Array.isArray(body.console_logs) && body.console_logs.length > 0) {
			const logSummary = body.console_logs.slice(0, 10).map(log => {
				const level = log.level || 'log';
				const msg = typeof log.message === 'string' ? log.message : JSON.stringify(log.message);
				return `- [${level}] ${msg.substring(0, 200)}`;
			}).join('\n');
			descParts.push(`**Console Logs** (${body.console_logs.length}):\n${logSummary}`);
		}

		// Add selected elements summary
		if (body.selected_elements && Array.isArray(body.selected_elements) && body.selected_elements.length > 0) {
			const elemSummary = body.selected_elements.slice(0, 5).map(el => {
				const tag = el.tagName || el.tag || 'element';
				const id = el.id ? `#${el.id}` : '';
				const classes = el.className ? `.${el.className.split(' ').join('.')}` : '';
				return `- \`${tag}${id}${classes}\``;
			}).join('\n');
			descParts.push(`**Selected Elements** (${body.selected_elements.length}):\n${elemSummary}`);
		}

		const fullDescription = descParts.join('\n\n');

		// Create the task
		const projectPath = process.cwd().replace(/\/ide$/, '');
		const createdTask = createTask({
			projectPath,
			title: `[Extension] ${title}`,
			description: fullDescription,
			type,
			priority,
			labels: ['extension', 'bug-report'],
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
				source: 'extension',
				data: {
					taskId: createdTask.id,
					title: createdTask.title,
					type,
					priority,
					labels: ['extension', 'bug-report']
				}
			});
		} catch (e) {
			console.error('[extension-report] Failed to emit event:', e);
		}

		return json({
			ok: true,
			id: createdTask.id,
			message: `Bug report submitted as task ${createdTask.id}`
		}, { status: 201 });

	} catch (err) {
		console.error('[extension-report] Error:', err);
		return json({
			ok: false,
			error: err.message || 'Failed to submit bug report'
		}, { status: 500 });
	}
}
