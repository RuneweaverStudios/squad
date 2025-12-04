/**
 * Agent Reservations API - View and Manage Agent File Locks
 * GET /api/agents/[name]/reservations - List active reservations
 * DELETE /api/agents/[name]/reservations?id=X - Release specific reservation
 *
 * Retrieves agent's active file reservations globally (across all projects)
 * since agent names are globally unique.
 */

import { json } from '@sveltejs/kit';
import { getReservations } from '$lib/server/agent-mail.js';
import Database from 'better-sqlite3';

const DB_PATH = process.env.AGENT_MAIL_DB || `${process.env.HOME}/.agent-mail.db`;

/** @type {import('./$types').RequestHandler} */
export async function GET({ params }) {
	try {
		const agentName = params.name;

		if (!agentName) {
			return json({
				error: 'Missing agent name',
				message: 'Agent name is required'
			}, { status: 400 });
		}

		// Get reservations globally (projectPath = undefined) since agents are globally unique
		const reservations = getReservations(agentName, undefined);

		return json({
			success: true,
			agentName,
			reservations,
			count: reservations.length,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error in GET /api/agents/[name]/reservations:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ params, url }) {
	try {
		const agentName = params.name;
		const reservationId = url.searchParams.get('id');

		if (!agentName) {
			return json({
				error: 'Missing agent name',
				message: 'Agent name is required'
			}, { status: 400 });
		}

		if (!reservationId) {
			return json({
				error: 'Missing reservation ID',
				message: 'Reservation ID is required'
			}, { status: 400 });
		}

		// Open database and release the reservation
		const db = new Database(DB_PATH);

		try {
			// First verify the reservation belongs to this agent
			const reservation = /** @type {{ id: number, path_pattern: string, agent_name: string } | undefined} */ (
				db.prepare(`
					SELECT r.id, r.path_pattern, a.name as agent_name
					FROM file_reservations r
					JOIN agents a ON r.agent_id = a.id
					WHERE r.id = ?
				`).get(reservationId)
			);

			if (!reservation) {
				return json({
					error: 'Reservation not found',
					message: `Reservation ${reservationId} does not exist`
				}, { status: 404 });
			}

			if (reservation.agent_name !== agentName) {
				return json({
					error: 'Permission denied',
					message: `Reservation ${reservationId} belongs to ${reservation.agent_name}, not ${agentName}`
				}, { status: 403 });
			}

			// Release the reservation by setting released_ts
			const result = db.prepare(`
				UPDATE file_reservations
				SET released_ts = datetime('now')
				WHERE id = ? AND released_ts IS NULL
			`).run(reservationId);

			if (result.changes === 0) {
				return json({
					error: 'Already released',
					message: `Reservation ${reservationId} was already released`
				}, { status: 409 });
			}

			return json({
				success: true,
				message: `Released reservation ${reservationId} for pattern: ${reservation.path_pattern}`,
				reservationId: parseInt(reservationId),
				pattern: reservation.path_pattern,
				timestamp: new Date().toISOString()
			});

		} finally {
			db.close();
		}

	} catch (error) {
		console.error('Error in DELETE /api/agents/[name]/reservations:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
