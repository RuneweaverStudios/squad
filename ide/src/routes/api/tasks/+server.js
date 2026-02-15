/**
 * Tasks API Route
 * Provides task data to the IDE
 */
import { json } from '@sveltejs/kit';
import { getTasks, getProjects, getTaskById, createTask, updateTask, getScheduledTasks } from '$lib/server/jat-tasks.js';
import { invalidateCache } from '$lib/server/cache.js';
import { _resetTaskCache } from '../../api/agents/+server.js';
import { getProjectPath } from '$lib/server/projectPaths.js';
import { emitEvent } from '$lib/utils/eventBus.server.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
	const project = url.searchParams.get('project');
	const status = url.searchParams.get('status');
	const priority = url.searchParams.get('priority');
	const search = url.searchParams.get('search');
	const scheduled = url.searchParams.get('scheduled');
	const closedAfter = url.searchParams.get('closedAfter');
	const closedBefore = url.searchParams.get('closedBefore');

	// Pagination parameters
	const limit = url.searchParams.get('limit');
	const offset = url.searchParams.get('offset');
	const cursor = url.searchParams.get('cursor'); // For cursor-based pagination (task ID)

	// If ?scheduled=true, return only tasks with schedule_cron or next_run_at
	let tasks;
	if (scheduled === 'true') {
		tasks = getScheduledTasks({ projectName: project || undefined });
	} else {
		const filters = {};
		if (project) filters.projectName = project;
		if (status) filters.status = status;
		if (priority !== null) filters.priority = parseInt(priority);
		if (closedAfter) filters.closedAfter = closedAfter;
		if (closedBefore) filters.closedBefore = closedBefore;

		tasks = getTasks(filters);
	}
	const projects = getProjects();

	// Apply search filter if provided
	if (search && search.trim()) {
		const searchLower = search.toLowerCase().trim();
		tasks = tasks.filter(task => {
			// Search in task ID
			if (task.id && task.id.toLowerCase().includes(searchLower)) {
				return true;
			}
			// Search in title
			if (task.title && task.title.toLowerCase().includes(searchLower)) {
				return true;
			}
			// Search in description
			if (task.description && task.description.toLowerCase().includes(searchLower)) {
				return true;
			}
			// Search in labels
			if (task.labels && Array.isArray(task.labels)) {
				return task.labels.some(label =>
					label.toLowerCase().includes(searchLower)
				);
			}
			return false;
		});
	}

	// Store total count before pagination
	const totalCount = tasks.length;

	// Apply cursor-based pagination (skip to after the cursor task ID)
	if (cursor) {
		const cursorIndex = tasks.findIndex(t => t.id === cursor);
		if (cursorIndex !== -1) {
			tasks = tasks.slice(cursorIndex + 1);
		}
	}

	// Apply offset-based pagination
	if (offset) {
		const offsetNum = parseInt(offset);
		if (!isNaN(offsetNum) && offsetNum > 0) {
			tasks = tasks.slice(offsetNum);
		}
	}

	// Apply limit
	let hasMore = false;
	let nextCursor = null;
	if (limit) {
		const limitNum = parseInt(limit);
		if (!isNaN(limitNum) && limitNum > 0) {
			hasMore = tasks.length > limitNum;
			if (hasMore) {
				nextCursor = tasks[limitNum - 1]?.id;
			}
			tasks = tasks.slice(0, limitNum);
		}
	}

	return json({
		tasks,
		projects,
		count: tasks.length,
		totalCount,
		hasMore,
		nextCursor
	});
}

/**
 * Create a new task
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ request }) {
	// Declare project outside try block so it's accessible in catch
	let project = null;

	try {
		// Parse request body
		const body = await request.json();
		// Extract project early so it's available in catch block for better error messages
		project = body.project ? body.project.trim() : null;

		// Validate required fields
		if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
			return json(
				{ error: true, message: 'Title is required and must be a non-empty string' },
				{ status: 400 }
			);
		}

		if (!body.type || typeof body.type !== 'string') {
			return json(
				{ error: true, message: 'Type is required (task, bug, feature, epic, chore)' },
				{ status: 400 }
			);
		}

		// Validate type is one of allowed values
		const validTypes = ['task', 'bug', 'feature', 'epic', 'chore'];
		if (!validTypes.includes(body.type)) {
			return json(
				{
					error: true,
					message: `Type must be one of: ${validTypes.join(', ')}. Got: ${body.type}`
				},
				{ status: 400 }
			);
		}

		// Validate priority if provided
		if (body.priority !== undefined && body.priority !== null) {
			const priority = parseInt(body.priority);
			if (isNaN(priority) || priority < 0 || priority > 4) {
				return json(
					{
						error: true,
						message: 'Priority must be 0-4 (P0=critical, P1=high, P2=medium, P3=low, P4=backlog)'
					},
					{ status: 400 }
				);
			}
		}

		// Validate description length
		if (body.description && typeof body.description === 'string' && body.description.length > 50_000) {
			return json(
				{
					error: true,
					message: `Description too long (${body.description.length} chars). Maximum is 50,000 characters.`
				},
				{ status: 400 }
			);
		}

		// Sanitize inputs
		const title = body.title.trim();
		const description = body.description ? body.description.trim() : '';
		const priority = body.priority !== undefined ? parseInt(body.priority) : 2; // Default to P2
		const type = body.type.trim().toLowerCase();

		// Get project path
		let projectPath = null;
		if (project) {
			const projectInfo = await getProjectPath(project);

			if (!projectInfo.exists) {
				return json(
					{
						error: true,
						message: `Project directory not found: ${projectInfo.path}. Either create the directory and run 'jt init', or add the project to ~/.config/jat/projects.json with the correct path.`,
						type: 'project_not_found'
					},
					{ status: 400 }
				);
			}

			projectPath = projectInfo.path;
		}

		// Resolve project path if not provided - use the IDE's parent directory
		if (!projectPath) {
			projectPath = process.cwd().replace(/\/ide$/, '');
		}

		// Build labels array
		let labels = [];
		if (body.labels && Array.isArray(body.labels) && body.labels.length > 0) {
			labels = body.labels
				.filter((/** @type {unknown} */ l) => typeof l === 'string' && /** @type {string} */ (l).trim())
				.map((/** @type {string} */ l) => l.trim());
		}

		// Build deps array
		let deps = [];
		if (body.deps && Array.isArray(body.deps) && body.deps.length > 0) {
			deps = body.deps
				.filter((/** @type {unknown} */ d) => typeof d === 'string' && /** @type {string} */ (d).trim())
				.map((/** @type {string} */ d) => d.trim());
		}

		// Build notes with review_override if provided
		let notes = body.notes && typeof body.notes === 'string' ? body.notes.trim() : '';
		if (body.review_override && (body.review_override === 'always_review' || body.review_override === 'always_auto')) {
			const overrideTag = `[REVIEW_OVERRIDE:${body.review_override}]`;
			notes = notes ? `${notes}\n${overrideTag}` : overrideTag;
		}

		// Build scheduling fields
		/** @type {Record<string, any>} */
		const schedulingFields = {};
		if (body.command && typeof body.command === 'string') {
			schedulingFields.command = body.command.trim();
		}
		if (body.agent_program && typeof body.agent_program === 'string') {
			schedulingFields.agent_program = body.agent_program.trim();
		}
		if (body.model && typeof body.model === 'string') {
			schedulingFields.model = body.model.trim();
		}
		if (body.schedule_cron && typeof body.schedule_cron === 'string') {
			schedulingFields.schedule_cron = body.schedule_cron.trim();
		}
		if (body.next_run_at && typeof body.next_run_at === 'string') {
			schedulingFields.next_run_at = body.next_run_at.trim();
		}
		if (body.due_date && typeof body.due_date === 'string') {
			schedulingFields.due_date = body.due_date.trim();
		}

		// Create the task directly
		const createdTask = createTask({
			projectPath,
			title,
			description,
			type,
			priority,
			labels,
			deps,
			assignee: null,
			notes,
			...schedulingFields
		});

		// Invalidate caches so subsequent fetches get fresh data
		invalidateCache.tasks();
		invalidateCache.agents();
		_resetTaskCache();

		// Emit task_created event for workflow triggers
		try {
			emitEvent({
				type: 'task_created',
				source: 'task_api',
				data: {
					taskId: createdTask.id,
					title,
					type,
					priority,
					labels,
					project: project || undefined
				},
				project: project || undefined
			});
		} catch (e) {
			console.error('[tasks] Failed to emit task_created event:', e);
		}

		return json({
			success: true,
			task: createdTask,
			message: `Task ${createdTask.id} created successfully`
		}, { status: 201 });

	} catch (err) {
		console.error('Error creating task:', err);

		const errorObj = /** @type {{ message?: string }} */ (err);
		const message = errorObj.message || '';

		// Check for "no .jat/ database" error - project not initialized
		if (message.includes('No .jat/ database') || message.includes('Run initProject()')) {
			const projectName = project || 'this project';
			return json(
				{
					error: true,
					message: `Project "${projectName}" has not been initialized for task tracking. Run "jt init" in the project directory, or use the "Add Project" button on the Projects page.`,
					type: 'project_not_initialized',
					hint: `cd ~/code/${projectName} && jt init`
				},
				{ status: 400 }
			);
		}

		return json(
			{
				error: true,
				message: message || 'Internal server error creating task',
				type: 'server_error'
			},
			{ status: 500 }
		);
	}
}
