/**
 * Epics API - List and create epics for task management
 *
 * GET /api/epics - List all epics (open and closed)
 * POST /api/epics - Create a new epic
 * Query params:
 *   - project: filter by project prefix (e.g., 'jat', 'chimaro')
 *   - status: 'open', 'closed', or 'all' (default: 'all')
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTasks, createTask, addDependency } from '$lib/server/jat-tasks.js';
import { invalidateCache } from '$lib/server/cache.js';
import { _resetTaskCache } from '../agents/+server.js';
import { getProjectPath } from '$lib/server/projectPaths.js';

interface Epic {
	id: string;
	title: string;
	description?: string;
	status: string;
	priority: number;
	issue_type: string;
	dependency_count?: number;
	created_at?: string;
}

/**
 * GET /api/epics
 * List epics, optionally filtered by project and status
 *
 * By default, returns all epics (open and closed) so the UI can show
 * closed epics that still have active work (sessions on child tasks).
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const project = url.searchParams.get('project');
		const statusFilter = url.searchParams.get('status') || 'all';

		// Build filter options for getTasks
		const filters: Record<string, string | number> = {};
		if (statusFilter === 'open' || statusFilter === 'closed') {
			filters.status = statusFilter;
		}

		// Get all tasks and filter to epics
		const allTasks = getTasks(filters);
		let epics: Epic[] = allTasks.filter((t: any) => t.issue_type === 'epic');

		// Filter by project if specified
		if (project && epics.length > 0) {
			epics = epics.filter(epic => epic.id.startsWith(`${project}-`));
		}

		// Sort: open epics first, then by priority, then by created date
		epics.sort((a, b) => {
			// Open epics come first
			const aOpen = a.status === 'open' ? 0 : 1;
			const bOpen = b.status === 'open' ? 0 : 1;
			if (aOpen !== bOpen) {
				return aOpen - bOpen;
			}
			// Then by priority (lower = higher priority)
			if (a.priority !== b.priority) {
				return a.priority - b.priority;
			}
			// Fall back to created date (newer first)
			return (b.created_at || '').localeCompare(a.created_at || '');
		});

		return json({
			success: true,
			epics,
			count: epics.length
		});
	} catch (error) {
		console.error('[epics] Error listing epics:', error);
		return json(
			{
				success: false,
				error: 'Failed to list epics',
				message: error instanceof Error ? error.message : String(error),
				epics: []
			},
			{ status: 500 }
		);
	}
};

/**
 * POST /api/epics
 * Create a new epic and optionally link a task to it
 * Body: { title: string, project?: string, linkTaskId?: string }
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { title, project, linkTaskId } = body;

		if (!title || typeof title !== 'string' || !title.trim()) {
			return json(
				{ success: false, error: 'Title is required' },
				{ status: 400 }
			);
		}

		// Resolve project path
		let projectPath: string;
		if (project) {
			const projectInfo = await getProjectPath(project);
			if (!projectInfo.exists) {
				return json(
					{ success: false, error: `Project '${project}' not found` },
					{ status: 400 }
				);
			}
			projectPath = projectInfo.path;
		} else {
			// Default to IDE's parent directory
			projectPath = process.cwd().replace(/\/ide$/, '');
		}

		// Create the epic directly using lib/tasks.js
		const createdEpic = createTask({
			projectPath,
			title: title.trim(),
			type: 'epic',
			priority: 1
		});

		const epicId = createdEpic.id;
		console.log(`[epics] Created epic: ${epicId}`);

		// If linkTaskId provided, link the task to the new epic
		if (linkTaskId) {
			try {
				// Epic depends on task (correct direction - makes task READY, epic BLOCKED)
				addDependency(epicId, linkTaskId, projectPath);
				console.log(`[epics] Linked task ${linkTaskId} to epic ${epicId}`);
			} catch (linkError) {
				console.error('[epics] Failed to link task to epic:', linkError);
				// Epic was created successfully, so we continue but note the link failed
			}
		}

		// Invalidate caches
		invalidateCache.tasks();
		invalidateCache.agents();
		_resetTaskCache();

		return json({
			success: true,
			epicId,
			message: `Epic ${epicId} created${linkTaskId ? ` and linked to ${linkTaskId}` : ''}`
		});
	} catch (error) {
		console.error('[epics] Error creating epic:', error);
		return json(
			{
				success: false,
				error: 'Failed to create epic',
				message: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
};
