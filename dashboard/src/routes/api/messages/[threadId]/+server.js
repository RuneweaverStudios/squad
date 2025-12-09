import { json } from '@sveltejs/kit';
import { getThreadMessages } from '$lib/server/agent-mail.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params }) {
	const { threadId } = params;

	try {
		const messages = getThreadMessages(threadId);
		return json({ messages });
	} catch (error) {
		const err = /** @type {Error} */ (error);
		console.error('Error fetching thread messages:', err);
		return json({ error: err.message, messages: [] }, { status: 500 });
	}
}
