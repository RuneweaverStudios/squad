import { json } from '@sveltejs/kit';
import { getReservations } from '$lib/server/agent-mail.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
	try {
		const agentName = url.searchParams.get('agent') ?? undefined;
		const reservations = getReservations(agentName);

		return json({ reservations });
	} catch (error) {
		console.error('Error fetching reservations:', error);
		return json({ error: 'Failed to fetch reservations', reservations: [] }, { status: 500 });
	}
}
