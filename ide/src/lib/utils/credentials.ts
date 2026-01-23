/**
 * Credentials Management Utility
 *
 * Handles secure storage and retrieval of API keys and service credentials.
 * Storage location: ~/.config/jat/credentials.json
 *
 * Security:
 * - File created with 0600 permissions (user read/write only)
 * - Keys are masked when returned to browser (sk-ant-...7x4k)
 * - Full keys only used server-side
 *
 * Fallback chain for API keys:
 * 1. ~/.config/jat/credentials.json (preferred)
 * 2. ide/.env file
 * 3. Environment variables
 */

import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';

// Types
export interface ApiKeyEntry {
	key: string;
	addedAt: string;
	lastVerified?: string;
	verificationError?: string;
}

export interface MaskedApiKeyEntry {
	masked: string;
	addedAt: string;
	lastVerified?: string;
	verificationError?: string;
	isSet: boolean;
}

export interface CodingAgentConfig {
	model?: string;
	flags?: string;
	[key: string]: string | undefined;
}

export interface Credentials {
	apiKeys: {
		anthropic?: ApiKeyEntry;
		google?: ApiKeyEntry;
		openai?: ApiKeyEntry;
		[key: string]: ApiKeyEntry | undefined;
	};
	codingAgents?: {
		default?: string;
		installed?: string[];
		configs?: {
			[agent: string]: CodingAgentConfig;
		};
	};
}

export interface MaskedCredentials {
	apiKeys: {
		anthropic?: MaskedApiKeyEntry;
		google?: MaskedApiKeyEntry;
		openai?: MaskedApiKeyEntry;
		[key: string]: MaskedApiKeyEntry | undefined;
	};
	codingAgents?: Credentials['codingAgents'];
}

// Provider metadata
export interface ApiKeyProvider {
	id: string;
	name: string;
	description: string;
	keyPrefix: string;
	verifyUrl: string;
	usedBy: string[];
	docsUrl: string;
}

export const API_KEY_PROVIDERS: ApiKeyProvider[] = [
	{
		id: 'anthropic',
		name: 'Anthropic',
		description: 'Claude API for task suggestions and AI features',
		keyPrefix: 'sk-ant-',
		verifyUrl: 'https://api.anthropic.com/v1/messages',
		usedBy: ['Task suggestions', 'Usage metrics', 'AI completions'],
		docsUrl: 'https://console.anthropic.com/settings/keys'
	},
	{
		id: 'google',
		name: 'Google / Gemini',
		description: 'Gemini API for image generation and editing',
		keyPrefix: 'AIza',
		verifyUrl: 'https://generativelanguage.googleapis.com/v1/models',
		usedBy: ['gemini-edit', 'gemini-image', 'Avatar generation'],
		docsUrl: 'https://aistudio.google.com/app/apikey'
	},
	{
		id: 'openai',
		name: 'OpenAI',
		description: 'OpenAI API for future Codex integration',
		keyPrefix: 'sk-',
		verifyUrl: 'https://api.openai.com/v1/models',
		usedBy: ['Codex integration (future)'],
		docsUrl: 'https://platform.openai.com/api-keys'
	}
];

// Paths
const CONFIG_DIR = join(homedir(), '.config', 'jat');
const CREDENTIALS_FILE = join(CONFIG_DIR, 'credentials.json');

/**
 * Ensure config directory exists
 */
function ensureConfigDir(): void {
	if (!existsSync(CONFIG_DIR)) {
		mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
	}
}

/**
 * Read credentials from file
 */
export function getCredentials(): Credentials {
	ensureConfigDir();

	if (!existsSync(CREDENTIALS_FILE)) {
		return { apiKeys: {} };
	}

	try {
		const content = readFileSync(CREDENTIALS_FILE, 'utf-8');
		return JSON.parse(content);
	} catch (error) {
		console.error('Error reading credentials file:', error);
		return { apiKeys: {} };
	}
}

/**
 * Write credentials to file with secure permissions
 */
export function saveCredentials(credentials: Credentials): void {
	ensureConfigDir();

	writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), {
		encoding: 'utf-8',
		mode: 0o600
	});

	// Ensure permissions are correct (in case file already existed)
	chmodSync(CREDENTIALS_FILE, 0o600);
}

/**
 * Mask an API key for display (show first 7 and last 4 chars)
 * Example: sk-ant-api03-abc...xyz9
 */
export function maskApiKey(key: string): string {
	if (!key || key.length < 12) {
		return '****';
	}

	const prefix = key.slice(0, 10);
	const suffix = key.slice(-4);
	return `${prefix}...${suffix}`;
}

/**
 * Get credentials with masked API keys (safe to send to browser)
 */
export function getMaskedCredentials(): MaskedCredentials {
	const creds = getCredentials();

	const maskedApiKeys: MaskedCredentials['apiKeys'] = {};

	for (const [provider, entry] of Object.entries(creds.apiKeys)) {
		if (entry) {
			maskedApiKeys[provider] = {
				masked: maskApiKey(entry.key),
				addedAt: entry.addedAt,
				lastVerified: entry.lastVerified,
				verificationError: entry.verificationError,
				isSet: true
			};
		}
	}

	// Add placeholders for known providers that aren't set
	for (const provider of API_KEY_PROVIDERS) {
		if (!maskedApiKeys[provider.id]) {
			maskedApiKeys[provider.id] = {
				masked: '',
				addedAt: '',
				isSet: false
			};
		}
	}

	return {
		apiKeys: maskedApiKeys,
		codingAgents: creds.codingAgents
	};
}

/**
 * Set an API key for a provider
 */
export function setApiKey(provider: string, key: string): void {
	const creds = getCredentials();

	creds.apiKeys[provider] = {
		key: key.trim(),
		addedAt: new Date().toISOString()
	};

	saveCredentials(creds);
}

/**
 * Delete an API key
 */
export function deleteApiKey(provider: string): void {
	const creds = getCredentials();
	delete creds.apiKeys[provider];
	saveCredentials(creds);
}

/**
 * Get a specific API key (full, unmasked - for server-side use only)
 */
export function getApiKey(provider: string): string | undefined {
	const creds = getCredentials();
	return creds.apiKeys[provider]?.key;
}

/**
 * Update verification status for a key
 */
export function updateKeyVerification(
	provider: string,
	success: boolean,
	error?: string
): void {
	const creds = getCredentials();

	if (creds.apiKeys[provider]) {
		if (success) {
			creds.apiKeys[provider]!.lastVerified = new Date().toISOString();
			delete creds.apiKeys[provider]!.verificationError;
		} else {
			creds.apiKeys[provider]!.verificationError = error || 'Verification failed';
		}
		saveCredentials(creds);
	}
}

/**
 * Get API key with fallback chain:
 * 1. credentials.json
 * 2. Environment variable
 *
 * @param provider - Provider ID (anthropic, google, openai)
 * @param envVarName - Environment variable name to check
 */
export function getApiKeyWithFallback(provider: string, envVarName: string): string | undefined {
	// First try credentials.json
	const credKey = getApiKey(provider);
	if (credKey) {
		return credKey;
	}

	// Fall back to environment variable
	return process.env[envVarName];
}

/**
 * Verify an Anthropic API key
 */
export async function verifyAnthropicKey(key: string): Promise<{ success: boolean; error?: string }> {
	try {
		const response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': key,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify({
				model: 'claude-3-5-haiku-20241022',
				max_tokens: 1,
				messages: [{ role: 'user', content: 'Hi' }]
			})
		});

		if (response.ok || response.status === 400) {
			// 400 is OK - means key is valid but request might be malformed
			// We just want to verify the key works
			return { success: true };
		}

		if (response.status === 401) {
			return { success: false, error: 'Invalid API key' };
		}

		if (response.status === 403) {
			return { success: false, error: 'API key does not have required permissions' };
		}

		const errorText = await response.text();
		return { success: false, error: `API error: ${response.status} - ${errorText.slice(0, 100)}` };
	} catch (error) {
		return { success: false, error: `Connection error: ${(error as Error).message}` };
	}
}

/**
 * Verify a Google/Gemini API key
 */
export async function verifyGoogleKey(key: string): Promise<{ success: boolean; error?: string }> {
	try {
		const response = await fetch(
			`https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(key)}`
		);

		if (response.ok) {
			return { success: true };
		}

		if (response.status === 400 || response.status === 403) {
			return { success: false, error: 'Invalid API key' };
		}

		const errorText = await response.text();
		return { success: false, error: `API error: ${response.status} - ${errorText.slice(0, 100)}` };
	} catch (error) {
		return { success: false, error: `Connection error: ${(error as Error).message}` };
	}
}

/**
 * Verify an OpenAI API key
 */
export async function verifyOpenAIKey(key: string): Promise<{ success: boolean; error?: string }> {
	try {
		const response = await fetch('https://api.openai.com/v1/models', {
			headers: {
				Authorization: `Bearer ${key}`
			}
		});

		if (response.ok) {
			return { success: true };
		}

		if (response.status === 401) {
			return { success: false, error: 'Invalid API key' };
		}

		const errorText = await response.text();
		return { success: false, error: `API error: ${response.status} - ${errorText.slice(0, 100)}` };
	} catch (error) {
		return { success: false, error: `Connection error: ${(error as Error).message}` };
	}
}

/**
 * Verify an API key for any provider
 */
export async function verifyApiKey(
	provider: string,
	key: string
): Promise<{ success: boolean; error?: string }> {
	switch (provider) {
		case 'anthropic':
			return verifyAnthropicKey(key);
		case 'google':
			return verifyGoogleKey(key);
		case 'openai':
			return verifyOpenAIKey(key);
		default:
			return { success: false, error: `Unknown provider: ${provider}` };
	}
}

/**
 * Validate API key format
 */
export function validateKeyFormat(provider: string, key: string): { valid: boolean; error?: string } {
	const providerInfo = API_KEY_PROVIDERS.find((p) => p.id === provider);

	if (!providerInfo) {
		return { valid: true }; // Unknown provider, skip format check
	}

	if (!key || key.trim().length === 0) {
		return { valid: false, error: 'API key is required' };
	}

	const trimmedKey = key.trim();

	// Check prefix
	if (provider === 'anthropic' && !trimmedKey.startsWith('sk-ant-')) {
		return { valid: false, error: 'Anthropic keys should start with sk-ant-' };
	}

	if (provider === 'google' && !trimmedKey.startsWith('AIza')) {
		return { valid: false, error: 'Google keys should start with AIza' };
	}

	if (provider === 'openai' && !trimmedKey.startsWith('sk-')) {
		return { valid: false, error: 'OpenAI keys should start with sk-' };
	}

	// Check minimum length
	if (trimmedKey.length < 20) {
		return { valid: false, error: 'API key seems too short' };
	}

	return { valid: true };
}
