/**
 * Tasks API Route
 * Provides Beads task data to the dashboard
 */
import { json } from '@sveltejs/kit';
import { getTasks, getProjects, getTaskById } from '../../../../../lib/beads.js';
import { invalidateCache } from '$lib/server/cache.js';
import { _resetTaskCache } from '../../api/agents/+server.js';
import { getProjectPath } from '$lib/server/projectPaths.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
	const project = url.searchParams.get('project');
	const status = url.searchParams.get('status');
	const priority = url.searchParams.get('priority');
	const search = url.searchParams.get('search');

	// Pagination parameters
	const limit = url.searchParams.get('limit');
	const offset = url.searchParams.get('offset');
	const cursor = url.searchParams.get('cursor'); // For cursor-based pagination (task ID)

	const filters = {};
	if (project) filters.project = project;
	if (status) filters.status = status;
	if (priority !== null) filters.priority = parseInt(priority);

	let tasks = getTasks(filters);
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
 * Create a new task using bd create CLI
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

		// Sanitize inputs
		const title = body.title.trim();
		const description = body.description ? body.description.trim() : '';
		const priority = body.priority !== undefined ? parseInt(body.priority) : 2; // Default to P2
		const type = body.type.trim().toLowerCase();
		// Note: project is already extracted at the top of try block

		// Build bd create command
		let command = `bd create "${title.replace(/"/g, '\\"')}"`;

		// Add type flag
		command += ` --type ${type}`;

		// Add priority flag
		command += ` --priority ${priority}`;

		// Add description if provided
		if (description) {
			command += ` --description "${description.replace(/"/g, '\\"')}"`;
		}

		// Add labels if provided
		if (body.labels && Array.isArray(body.labels) && body.labels.length > 0) {
			const sanitizedLabels = body.labels
				.filter((/** @type {unknown} */ l) => typeof l === 'string' && /** @type {string} */ (l).trim())
				.map((/** @type {string} */ l) => l.trim())
				.join(',');
			if (sanitizedLabels) {
				command += ` --labels ${sanitizedLabels}`;
			}
		}

		// Add dependencies if provided
		if (body.deps && Array.isArray(body.deps) && body.deps.length > 0) {
			const sanitizedDeps = body.deps
				.filter((/** @type {unknown} */ d) => typeof d === 'string' && /** @type {string} */ (d).trim())
				.map((/** @type {string} */ d) => d.trim())
				.join(',');
			if (sanitizedDeps) {
				command += ` --deps ${sanitizedDeps}`;
			}
		}

		// Add project if provided (changes working directory)
		if (project) {
			// Look up actual project path from JAT config or beads-discovered projects
			const projectInfo = await getProjectPath(project);

			if (!projectInfo.exists) {
				return json(
					{
						error: true,
						message: `Project directory not found: ${projectInfo.path}. Either create the directory and run 'bd init', or add the project to ~/.config/jat/projects.json with the correct path.`,
						type: 'project_not_found'
					},
					{ status: 400 }
				);
			}

			command = `cd "${projectInfo.path}" && ${command}`;
		}

		// Execute bd create command
		const { stdout, stderr } = await execAsync(command);

		// Parse task ID from output (e.g., "✓ Created issue: jat-abc" or "community_connect-xyz")
		// Support project names with underscores, hyphens, mixed case
		const match = stdout.match(/Created issue: ([\w]+-[\w]+)/i);
		if (!match) {
			console.error('Failed to parse task ID from bd create output:', stdout);
			return json(
				{
					error: true,
					message: 'Task may have been created but failed to parse task ID',
					output: stdout,
					stderr: stderr
				},
				{ status: 500 }
			);
		}

		const taskId = match[1];

		// Set review_override if provided (stored in notes field)
		if (body.review_override && (body.review_override === 'always_review' || body.review_override === 'always_auto')) {
			try {
				const overrideCommand = project
					? `cd ${process.env.HOME}/code/${project} && ${process.env.HOME}/code/jat/tools/core/bd-set-review-override ${taskId} ${body.review_override}`
					: `${process.env.HOME}/code/jat/tools/core/bd-set-review-override ${taskId} ${body.review_override}`;
				await execAsync(overrideCommand);
			} catch (err) {
				console.error('Failed to set review_override:', err);
				// Continue without failing - task was created successfully
			}
		}

		// Invalidate caches so subsequent fetches get fresh data
		// This is critical for reactive updates on /work page
		// Also reset module-level task cache in agents endpoint
		invalidateCache.tasks();
		invalidateCache.agents();
		_resetTaskCache();

		// Try to fetch the created task to return full object
		// Note: This may fail for cross-project tasks since getTaskById only looks in current project
		const createdTask = getTaskById(taskId);

		if (createdTask) {
			return json({
				success: true,
				task: createdTask,
				message: `Task ${taskId} created successfully`
			}, { status: 201 });
		}

		// Task was created but we can't fetch it (cross-project creation)
		// Return success with minimal task info
		return json({
			success: true,
			task: {
				id: taskId,
				title: title,
				type: type,
				priority: priority,
				status: 'open',
				project: project || null
			},
			message: `Task ${taskId} created successfully`
		}, { status: 201 });

	} catch (err) {
		console.error('Error creating task:', err);

		// Check if it's a validation error from bd create
		const execErr = /** @type {{ stderr?: string, message?: string }} */ (err);
		const stderr = execErr.stderr || '';
		const message = execErr.message || '';

		// Check for "no beads database found" error - project not initialized
		if (stderr.includes('no beads database found') || message.includes('no beads database found')) {
			const projectName = project || 'this project';
			return json(
				{
					error: true,
					message: `Project "${projectName}" has not been initialized for task tracking. Run "bd init" in the project directory, or use the "Add Project" button on the Projects page.`,
					type: 'project_not_initialized',
					hint: `cd ~/code/${projectName} && bd init`
				},
				{ status: 400 }
			);
		}

		if (stderr.includes('Error:')) {
			return json(
				{
					error: true,
					message: stderr.trim(),
					type: 'validation_error'
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
