/**
 * Feed Token Verification API
 *
 * Tests a Slack or Telegram bot token against the external API.
 * Resolves the token server-side via jat-secret (custom API keys).
 *
 * POST /api/config/feeds/verify
 * Body: { type: 'slack' | 'telegram' | 'telegram-chats' | 'slack-channels', secretName: string }
 * Returns: { success, info?, error?, chats?, count?, channels? }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCustomApiKey } from '$lib/utils/credentials';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { type, secretName } = body;

		if (!type || !secretName) {
			return json(
				{ success: false, error: 'type and secretName are required' },
				{ status: 400 }
			);
		}

		if (type !== 'slack' && type !== 'telegram' && type !== 'telegram-chats' && type !== 'slack-channels') {
			return json(
				{ success: false, error: 'type must be "slack", "telegram", "telegram-chats", or "slack-channels"' },
				{ status: 400 }
			);
		}

		// Resolve the token from credentials store
		const token = getCustomApiKey(secretName);
		if (!token) {
			return json(
				{ success: false, error: `No token found for secret "${secretName}"` },
				{ status: 404 }
			);
		}

		if (type === 'slack') {
			return await verifySlack(token);
		} else if (type === 'slack-channels') {
			return await detectSlackChannels(token);
		} else if (type === 'telegram-chats') {
			return await detectTelegramChats(token);
		} else {
			return await verifyTelegram(token);
		}
	} catch (error) {
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Verification failed'
			},
			{ status: 500 }
		);
	}
};

async function verifySlack(token: string) {
	try {
		const res = await fetch('https://slack.com/api/auth.test', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/x-www-form-urlencoded'
			}
		});

		const data = await res.json();

		if (data.ok) {
			return json({
				success: true,
				info: {
					workspace: data.team,
					botName: data.user,
					botId: data.user_id,
					teamId: data.team_id
				}
			});
		} else {
			return json({
				success: false,
				error: `Slack API error: ${data.error}`
			});
		}
	} catch (error) {
		return json({
			success: false,
			error: `Failed to connect to Slack: ${error instanceof Error ? error.message : 'unknown error'}`
		});
	}
}

async function detectSlackChannels(token: string) {
	try {
		const res = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel&exclude_archived=true&limit=200', {
			headers: {
				Authorization: `Bearer ${token}`
			}
		});

		const data = await res.json();

		if (!data.ok) {
			return json({
				success: false,
				error: `Slack API error: ${data.error}`
			});
		}

		const channels = (data.channels || []).map((ch: any) => ({
			id: ch.id,
			name: ch.name,
			isPrivate: ch.is_private,
			memberCount: ch.num_members,
			topic: ch.topic?.value || '',
			isMember: ch.is_member
		}));

		return json({
			success: true,
			channels,
			count: channels.length
		});
	} catch (error) {
		return json({
			success: false,
			error: `Failed to list channels: ${error instanceof Error ? error.message : 'unknown error'}`
		});
	}
}

async function verifyTelegram(token: string) {
	try {
		const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
		const data = await res.json();

		if (data.ok) {
			return json({
				success: true,
				info: {
					botName: data.result.first_name,
					botUsername: data.result.username,
					botId: data.result.id
				}
			});
		} else {
			return json({
				success: false,
				error: `Telegram API error: ${data.description || 'Unknown error'}`
			});
		}
	} catch (error) {
		return json({
			success: false,
			error: `Failed to connect to Telegram: ${error instanceof Error ? error.message : 'unknown error'}`
		});
	}
}

async function detectTelegramChats(token: string) {
	try {
		const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
		const data = await res.json();

		if (!data.ok) {
			return json({
				success: false,
				error: `Telegram API error: ${data.description || 'Unknown error'}`
			});
		}

		// Deduplicate chats by id
		const chatMap = new Map<number, { id: number; title: string; type: string; username?: string }>();
		for (const update of data.result || []) {
			const msg = update.message || update.channel_post || update.edited_message || update.edited_channel_post;
			if (msg?.chat) {
				const chat = msg.chat;
				if (!chatMap.has(chat.id)) {
					chatMap.set(chat.id, {
						id: chat.id,
						title: chat.title || chat.first_name || chat.username || `Chat ${chat.id}`,
						type: chat.type,
						username: chat.username
					});
				}
			}
		}

		const chats = Array.from(chatMap.values());
		return json({
			success: true,
			chats,
			count: chats.length
		});
	} catch (error) {
		return json({
			success: false,
			error: `Failed to detect chats: ${error instanceof Error ? error.message : 'unknown error'}`
		});
	}
}
