/**
 * Feed Token Verification API
 *
 * Tests a Slack, Telegram, or Gmail token against the external API.
 * Resolves the token server-side via jat-secret (custom API keys).
 *
 * POST /api/config/feeds/verify
 * Body: { type: 'slack' | 'telegram' | 'telegram-chats' | 'slack-channels' | 'gmail', secretName: string, imapUser?: string, folder?: string }
 * Returns: { success, info?, error?, chats?, count?, channels? }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCustomApiKey } from '$lib/utils/credentials';
import { ImapFlow } from 'imapflow';

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

		const validTypes = ['slack', 'telegram', 'telegram-chats', 'slack-channels', 'gmail'];
		if (!validTypes.includes(type)) {
			return json(
				{ success: false, error: `type must be one of: ${validTypes.join(', ')}` },
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

		if (type === 'gmail') {
			const { imapUser, folder } = body;
			if (!imapUser) {
				return json({ success: false, error: 'imapUser is required for Gmail verification' }, { status: 400 });
			}
			return await verifyGmail(token, imapUser, folder || 'INBOX');
		} else if (type === 'slack') {
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

async function verifyGmail(appPassword: string, imapUser: string, folder: string) {
	const client = new ImapFlow({
		host: 'imap.gmail.com',
		port: 993,
		secure: true,
		auth: {
			user: imapUser,
			pass: appPassword
		},
		logger: false
	});

	try {
		await client.connect();

		let info;
		try {
			const lock = await client.getMailboxLock(folder);
			try {
				const mailbox = client.mailbox;
				const total = mailbox.exists || 0;

				info = {
					success: true,
					info: {
						email: imapUser,
						folder,
						messageCount: total,
						uidValidity: mailbox.uidValidity
					}
				};
			} finally {
				lock.release();
			}
		} finally {
			try { await client.logout(); } catch { /* ignore */ }
		}

		return json(info);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (msg.includes('AUTHENTICATIONFAILED') || msg.includes('Invalid credentials')) {
			return json({
				success: false,
				error: 'Authentication failed. Check your email address and App Password. Make sure 2FA is enabled and you\'re using an App Password (not your regular password).'
			});
		}
		if (msg.includes('Mailbox not found') || msg.includes('does not exist')) {
			return json({
				success: false,
				error: `Folder "${folder}" not found. Create this Gmail label first, then try again.`
			});
		}
		return json({
			success: false,
			error: `Connection failed: ${msg}`
		});
	}
}
