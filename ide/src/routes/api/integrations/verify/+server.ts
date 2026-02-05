/**
 * Integration Token Verification API
 *
 * Tests integration tokens against external APIs.
 * Supports built-in types (Slack, Telegram, Gmail) and dynamic plugins.
 * For dynamic plugins, loads the adapter via pluginLoader and calls test().
 *
 * POST /api/integrations/verify
 * Body: { type: string, secretName: string, ...typeSpecificFields }
 * Returns: { success, info?, error?, chats?, count?, channels?, sampleItems? }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCustomApiKey } from '$lib/utils/credentials';
import { ImapFlow } from 'imapflow';

const BUILTIN_TYPES = ['slack', 'telegram', 'telegram-chats', 'slack-channels', 'gmail'];

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { type } = body;

		if (!type) {
			return json(
				{ success: false, error: 'type is required' },
				{ status: 400 }
			);
		}

		// Built-in types require secretName resolved upfront
		if (BUILTIN_TYPES.includes(type)) {
			const { secretName } = body;
			if (!secretName) {
				return json(
					{ success: false, error: 'secretName is required' },
					{ status: 400 }
				);
			}

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
		}

		// Dynamic plugin verification - load adapter and call test()
		return await verifyPlugin(type, body);
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
			let error = `Slack API error: ${data.error}`;
			if (data.error === 'missing_scope') {
				const needed = data.needed || 'unknown';
				const provided = data.provided || 'none';
				error = `Missing Slack scope: "${needed}" is required but your token only has: ${provided}. Go to your Slack app → OAuth & Permissions → add the missing scope → reinstall the app → paste the new token.`;
			} else if (data.error === 'invalid_auth' || data.error === 'token_revoked') {
				error = `Slack token is invalid or revoked. Generate a new Bot User OAuth Token from your Slack app settings.`;
			}
			return json({
				success: false,
				error
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
			let error = `Slack API error: ${data.error}`;
			if (data.error === 'missing_scope') {
				const needed = data.needed || 'unknown';
				const provided = data.provided || 'none';
				error = `Missing Slack scope: "${needed}" is required but your token only has: ${provided}. Go to your Slack app → OAuth & Permissions → add the missing scope → reinstall the app → paste the new token.`;
			} else if (data.error === 'invalid_auth' || data.error === 'token_revoked') {
				error = `Slack token is invalid or revoked. Generate a new Bot User OAuth Token from your Slack app settings.`;
			}
			return json({
				success: false,
				error
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
				const mailbox = client.mailbox as any;
				const total = mailbox?.exists || 0;

				info = {
					success: true,
					info: {
						email: imapUser,
						folder,
						messageCount: total,
						uidValidity: Number(mailbox?.uidValidity)
					}
				};
			} finally {
				lock.release();
			}
		} finally {
			try { await client.logout(); } catch { /* ignore */ }
		}

		return json(info);
	} catch (err: any) {
		const msg = err?.message || String(err);
		const responseText = err?.responseText || '';
		const fullMsg = `${msg} ${responseText}`.toLowerCase();
		if (fullMsg.includes('authenticationfailed') || fullMsg.includes('invalid credentials')) {
			return json({
				success: false,
				error: 'Authentication failed. Check your email address and App Password. Make sure 2FA is enabled and you\'re using an App Password (not your regular password).'
			});
		}
		if (err?.mailboxMissing || err?.serverResponseCode === 'NONEXISTENT' || fullMsg.includes('mailbox not found') || fullMsg.includes('does not exist') || fullMsg.includes('unknown mailbox')) {
			return json({
				success: false,
				error: `Folder "${folder}" not found. Create this Gmail label first, then try again.`
			});
		}
		return json({
			success: false,
			error: `Connection failed: ${responseText || msg}`
		});
	}
}

/**
 * Verify a dynamic plugin by loading its adapter and calling test().
 * Works for any plugin type registered via pluginLoader (built-in or user).
 */
async function verifyPlugin(type: string, body: Record<string, any>) {
	try {
		const { join } = await import('node:path');
		const projectRoot = process.cwd().replace(/\/ide$/, '');
		const pluginLoaderPath = join(projectRoot, 'tools', 'ingest', 'lib', 'pluginLoader.js');
		const { discoverPlugins } = await import(/* @vite-ignore */ pluginLoaderPath);
		const plugins = await discoverPlugins();
		const plugin = plugins.get(type);

		if (!plugin) {
			return json(
				{ success: false, error: `No plugin found for type "${type}"` },
				{ status: 400 }
			);
		}

		const adapter = new plugin.AdapterClass();

		// Build a source config from body fields (matches what the adapter expects)
		const sourceConfig: Record<string, any> = {};
		for (const field of plugin.metadata.configFields) {
			if (body[field.key] !== undefined) {
				sourceConfig[field.key] = body[field.key];
			}
		}

		// getSecret resolves secret names via credentials store
		const getSecret = (name: string) => {
			const value = getCustomApiKey(name);
			if (!value) throw new Error(`Secret "${name}" not found in credentials store`);
			return value;
		};

		const result = await adapter.test(sourceConfig, getSecret);

		return json({
			success: result.ok,
			info: result.ok ? { message: result.message } : undefined,
			sampleItems: result.sampleItems,
			error: result.ok ? undefined : result.message
		});
	} catch (error) {
		return json({
			success: false,
			error: `Plugin verification failed: ${error instanceof Error ? error.message : 'unknown error'}`
		});
	}
}
