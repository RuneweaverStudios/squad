/**
 * Auto-close Eligible Epics API
 * POST /api/epics/close-eligible
 *
 * Closes epics where all children are complete.
 * This is called automatically when the Epic Swarm modal opens to clean up.
 */
import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { RequestHandler } from './$types';

const execAsync = promisify(exec);

/**
 * POST /api/epics/close-eligible
 * Closes all epics that have all children complete
 */
export const POST: RequestHandler = async () => {
	try {
		const { stdout } = await execAsync('bd epic close-eligible --json');
		const result = JSON.parse(stdout || '{}');

		return json({
			success: true,
			closed: result.closed || [],
			count: result.closed?.length || 0
		});
	} catch (err) {
		// Command might return empty if nothing to close
		const error = err as Error & { stdout?: string; stderr?: string };

		// If stdout has valid JSON, parse it
		if (error.stdout) {
			try {
				const result = JSON.parse(error.stdout);
				return json({
					success: true,
					closed: result.closed || [],
					count: result.closed?.length || 0
				});
			} catch {
				// Fall through to error handling
			}
		}

		console.error('Error closing eligible epics:', error);
		return json({
			success: false,
			error: 'Failed to close eligible epics',
			closed: [],
			count: 0
		});
	}
};
