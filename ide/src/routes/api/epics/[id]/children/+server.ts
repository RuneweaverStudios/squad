/**
 * Epic Children API
 * GET /api/epics/[id]/children
 *
 * Returns all children of an epic with blocking information.
 * This powers the EpicSwarmModal task list.
 *
 * Performance: Uses the jat-tasks.js SQLite library directly instead of spawning
 * jt CLI commands. This reduces response time from ~15s to <100ms.
 */
import { json } from '@sveltejs/kit';
import { getTasks, getTaskById } from '$lib/server/jat-tasks.js';
import type { RequestHandler } from './$types';

/** Child task with blocking info */
interface EpicChild {
	id: string;
	title: string;
	priority: number;
	status: string;
	issue_type: string;
	assignee?: string;
	isBlocked: boolean;
	blockedBy: string[];
}

interface EpicChildrenResponse {
	epicId: string;
	epicTitle: string;
	epicStatus: string;  // The epic's own status (open, in_progress, closed)
	children: EpicChild[];
	summary: {
		total: number;
		open: number;
		inProgress: number;
		closed: number;
		blocked: number;
		ready: number;
	};
}

/**
 * GET /api/epics/[id]/children
 * Returns all children of an epic with blocking information
 */
export const GET: RequestHandler = async ({ params }) => {
	const { id: epicId } = params;

	if (!epicId) {
		return json({ error: 'Epic ID is required' }, { status: 400 });
	}

	try {
		// Get all tasks first (needed for both epic lookup and child detection)
		const allTasks = getTasks();

		// Get the epic details using jat-tasks.js library (much faster than jt CLI)
		const epic = getTaskById(epicId);

		// Method 1: Find children by hierarchical ID pattern (e.g., jat-cptest.1, jat-cptest.2)
		const childPattern = new RegExp(`^${epicId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\d+$`);
		const hierarchicalChildren = allTasks.filter((t: { id: string }) => childPattern.test(t.id));

		// Check if this is a "virtual epic" - no actual epic task exists, but there are
		// child tasks with hierarchical IDs matching the pattern
		const isVirtualEpic = !epic && hierarchicalChildren.length > 0;

		if (!epic && !isVirtualEpic) {
			return json({ error: `Epic '${epicId}' not found` }, { status: 404 });
		}

		if (epic && epic.issue_type !== 'epic' && hierarchicalChildren.length === 0) {
			return json({ error: `Task '${epicId}' is not an epic (type: ${epic.issue_type})` }, { status: 400 });
		}

		// Method 2: Find children via dependency from epic's "depends_on" list
		// Epic depends on children (epic is blocked until children complete)
		const dependencyChildIds = new Set<string>();
		if (epic?.depends_on && Array.isArray(epic.depends_on)) {
			for (const dep of epic.depends_on) {
				if (dep.id) {
					dependencyChildIds.add(dep.id);
				}
			}
		}

		// Combine both methods - hierarchical IDs + dependency-linked children
		const childIdSet = new Set<string>();
		for (const child of hierarchicalChildren) {
			childIdSet.add(child.id);
		}
		for (const id of dependencyChildIds) {
			childIdSet.add(id);
		}

		// Get all child tasks from the combined set
		// Since getTasks() already includes depends_on for each task, we have all the dependency info we need
		const childrenFromTasks = allTasks.filter((t: { id: string }) => childIdSet.has(t.id));

		// For virtual epics, derive title from the epic ID and calculate status from children
		const epicTitle = epic?.title || `Virtual Epic: ${epicId}`;
		// Virtual epic status: 'open' if any children are not closed, else 'closed'
		const deriveVirtualEpicStatus = (children: Array<{ status: string }>) => {
			if (children.length === 0) return 'open';
			return children.every(c => c.status === 'closed') ? 'closed' : 'open';
		};

		if (childrenFromTasks.length === 0) {
			return json({
				epicId,
				epicTitle,
				epicStatus: epic?.status || 'open',
				isVirtualEpic: !epic,
				children: [],
				summary: {
					total: 0,
					open: 0,
					inProgress: 0,
					closed: 0,
					blocked: 0,
					ready: 0
				}
			} satisfies EpicChildrenResponse & { isVirtualEpic: boolean });
		}

		// Build a set of child IDs for quick lookup
		const childIds = new Set(childrenFromTasks.map((c: { id: string }) => c.id));

		// Build a map of child statuses for dependency checking
		const childStatusMap = new Map(childrenFromTasks.map((c: { id: string; status: string }) => [c.id, c.status]));

		// Build children array with blocking info
		// Since getTasks() already includes depends_on, we can check blocking status directly
		const children: EpicChild[] = childrenFromTasks.map((child: {
			id: string;
			title: string;
			priority: number;
			status: string;
			issue_type: string;
			assignee?: string;
			depends_on?: Array<{ id: string; status: string }>;
		}) => {
			// Find dependencies that are also children of this epic AND are not closed
			const blockedBy = (child.depends_on || [])
				.filter((dep) => {
					const depStatus = childStatusMap.get(dep.id);
					return childIds.has(dep.id) && depStatus && depStatus !== 'closed';
				})
				.map((dep) => dep.id);

			return {
				id: child.id,
				title: child.title,
				priority: child.priority,
				status: child.status,
				issue_type: child.issue_type || 'task',
				assignee: child.assignee,
				isBlocked: blockedBy.length > 0,
				blockedBy
			};
		});

		// Sort by priority (lower number = higher priority), then by blocked status (unblocked first)
		children.sort((a, b) => {
			// Closed tasks go to the end
			if (a.status === 'closed' && b.status !== 'closed') return 1;
			if (a.status !== 'closed' && b.status === 'closed') return -1;

			// Then by blocked status (unblocked first)
			if (a.isBlocked && !b.isBlocked) return 1;
			if (!a.isBlocked && b.isBlocked) return -1;

			// Then by priority
			return a.priority - b.priority;
		});

		// Calculate summary
		const summary = {
			total: children.length,
			open: children.filter(c => c.status === 'open').length,
			inProgress: children.filter(c => c.status === 'in_progress').length,
			closed: children.filter(c => c.status === 'closed').length,
			blocked: children.filter(c => c.isBlocked && c.status !== 'closed').length,
			ready: children.filter(c => !c.isBlocked && c.status !== 'closed' && c.status !== 'in_progress').length
		};

		// Calculate epic status for virtual epics based on children
		const epicStatus = epic?.status || deriveVirtualEpicStatus(children);

		return json({
			epicId,
			epicTitle,
			epicStatus,
			isVirtualEpic: !epic,
			children,
			summary
		} satisfies EpicChildrenResponse & { isVirtualEpic: boolean });

	} catch (err) {
		const error = err as Error;
		console.error('Error fetching epic children:', error);
		return json({ error: 'Failed to fetch epic children' }, { status: 500 });
	}
};
