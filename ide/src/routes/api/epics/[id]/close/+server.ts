/**
 * Epic Close API
 * POST /api/epics/[id]/close
 *
 * Closes an epic if all its children are complete.
 * Used by the epic celebration feature for auto-closing.
 */
import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { RequestHandler } from './$types';

const execAsync = promisify(exec);

interface CloseResponse {
	success: boolean;
	epicId: string;
	message: string;
	wasAlreadyClosed?: boolean;
	childrenStatus?: {
		total: number;
		closed: number;
		remaining: number;
	};
}

/**
 * POST /api/epics/[id]/close
 * Closes an epic if all children are complete
 */
export const POST: RequestHandler = async ({ params }) => {
	const { id: epicId } = params;

	if (!epicId) {
		return json({ success: false, epicId: '', message: 'Epic ID is required' }, { status: 400 });
	}

	try {
		// Get the epic details first
		const { stdout: epicStdout } = await execAsync(`st show "${epicId}" --json`);
		const epicData = JSON.parse(epicStdout);

		if (!epicData || epicData.length === 0) {
			return json(
				{ success: false, epicId, message: `Epic '${epicId}' not found` },
				{ status: 404 }
			);
		}

		const epic = epicData[0];

		// Check if it's actually an epic
		if (epic.issue_type !== 'epic') {
			return json(
				{
					success: false,
					epicId,
					message: `Task '${epicId}' is not an epic (type: ${epic.issue_type})`
				},
				{ status: 400 }
			);
		}

		// Check if already closed
		if (epic.status === 'closed') {
			return json({
				success: true,
				epicId,
				message: 'Epic is already closed',
				wasAlreadyClosed: true
			} satisfies CloseResponse);
		}

		// Check children status
		const children = epic.dependencies || [];
		const closedChildren = children.filter((c: { status: string }) => c.status === 'closed');

		const childrenStatus = {
			total: children.length,
			closed: closedChildren.length,
			remaining: children.length - closedChildren.length
		};

		// If not all children are closed, refuse to close
		if (childrenStatus.remaining > 0) {
			return json(
				{
					success: false,
					epicId,
					message: `Cannot close epic: ${childrenStatus.remaining} of ${childrenStatus.total} children are not complete`,
					childrenStatus
				},
				{ status: 400 }
			);
		}

		// All children are complete, close the epic
		await execAsync(`st update "${epicId}" --status closed`);

		return json({
			success: true,
			epicId,
			message: 'Epic closed successfully',
			wasAlreadyClosed: false,
			childrenStatus
		} satisfies CloseResponse);
	} catch (err) {
		const error = err as Error & { stderr?: string };
		console.error('Error closing epic:', error);

		// Check if it's a "not found" error from st
		if (error.stderr?.includes('not found') || error.stderr?.includes('no issue found')) {
			return json({ success: false, epicId, message: `Epic '${epicId}' not found` }, { status: 404 });
		}

		return json(
			{ success: false, epicId, message: 'Failed to close epic' },
			{ status: 500 }
		);
	}
};
