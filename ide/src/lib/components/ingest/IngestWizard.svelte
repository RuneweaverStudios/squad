<script lang="ts">
	/**
	 * IngestWizard Component
	 *
	 * Multi-step drawer wizard for configuring an ingest source.
	 * Steps vary by source type:
	 *   RSS:      URL -> Project -> Options -> Automation -> [Filters] -> Review
	 *   Slack:    Secret -> Channel -> Project -> Options -> Automation -> [Filters] -> Review
	 *   Telegram: Secret -> Chat ID -> Project -> Options -> Automation -> [Filters] -> Review
	 *   Gmail:    App Password -> Settings -> Project -> Options -> Automation -> [Filters] -> Review
	 *   Custom:   Command -> Project -> Options -> Automation -> [Filters] -> Review
	 *   Plugin:   Configuration -> Project -> Options -> Automation -> [Filters] -> Review
	 *
	 * [Filters] step appears when plugin metadata includes itemFields.
	 * Plugin Configuration step uses DynamicConfigForm for dynamic field rendering.
	 */

	import { untrack } from 'svelte';
	import { fly, fade, slide } from 'svelte/transition';
	import { getProjects, loadCommands, getCommands } from '$lib/stores/configStore.svelte';
	import ProjectSelector from '$lib/components/ProjectSelector.svelte';
	import DynamicConfigForm from '$lib/components/integrations/DynamicConfigForm.svelte';
	import FilterBuilder from '$lib/components/integrations/FilterBuilder.svelte';

	interface Props {
		open: boolean;
		sourceType: string | null;
		editSource?: any | null;
		pluginMetadata?: { configFields?: any[]; itemFields?: any[]; defaultFilter?: any[]; name?: string; type?: string; capabilities?: { realtime?: boolean; send?: boolean; threads?: boolean } } | null;
		onClose: () => void;
		onSave: (source: any) => void;
	}

	let { open, sourceType, editSource = null, pluginMetadata = null, onClose, onSave }: Props = $props();

	// Known built-in types
	const BUILTIN_TYPES = ['rss', 'slack', 'telegram', 'gmail', 'custom'];
	const isPluginType = $derived(sourceType != null && !BUILTIN_TYPES.includes(sourceType));

	// Chat/messaging source types default to /jat:chat instead of /jat:start
	const CHAT_SOURCE_TYPES = new Set([
		'telegram', 'slack', 'discord', 'matrix', 'mattermost',
		'line', 'signal', 'whatsapp', 'bluebubbles', 'googlechat'
	]);
	function getDefaultCommand(): string {
		if (sourceType && CHAT_SOURCE_TYPES.has(sourceType)) return '/jat:chat';
		if (pluginMetadata?.capabilities?.send) return '/jat:chat';
		return '/jat:start';
	}

	// Wizard state
	let step = $state(0);
	let saving = $state(false);
	let error = $state('');

	// Form fields
	let sourceId = $state('');
	let enabled = $state(true);
	let project = $state('');
	let pollInterval = $state(60);
	let taskType = $state('task');
	let taskPriority = $state(2);
	let taskLabels = $state('');
	let connectionMode = $state<'polling' | 'realtime'>('polling');

	// RSS fields
	let feedUrl = $state('');

	// Slack fields
	let slackSecretName = $state('slack');
	let slackChannel = $state('');
	let includeBots = $state(false);

	// Slack channel detection
	let detectingChannels = $state(false);
	let detectedChannels = $state<Array<{ id: string; name: string; isPrivate: boolean; memberCount: number; topic: string; isMember: boolean }>>([]);
	let channelDetectionError = $state('');

	// Telegram fields
	let telegramSecretName = $state('telegram-bot');
	let telegramChatId = $state('');
	let detectingChats = $state(false);
	let detectedChats = $state<Array<{ id: number; title: string; type: string; username?: string }>>([]);
	let detectionError = $state('');

	// Gmail fields
	let gmailSecretName = $state('gmail-app-password');
	let gmailImapUser = $state('');
	let gmailFolder = $state('');
	let gmailFilterFrom = $state('');
	let gmailFilterSubject = $state('');
	let gmailMarkAsRead = $state(false);

	// Custom fields
	let customCommand = $state('');

	// Dynamic plugin fields (keyed by configField.key)
	let pluginFields = $state<Record<string, any>>({});
	// Track secret status per secret-type configField key
	let pluginSecretStatus = $state<Record<string, 'checking' | 'found' | 'missing' | 'saving' | 'error'>>({});
	let pluginSecretMasked = $state<Record<string, string>>({});
	let pluginTokenInputs = $state<Record<string, string>>({});
	let pluginShowTokenInput = $state<Record<string, boolean>>({});

	// Filter conditions
	let filterConditions = $state<Array<{ field: string; operator: string; value: any }>>([]);

	// Automation fields
	let autoAction = $state<'none' | 'immediate' | 'schedule' | 'delay'>('none');
	let autoCommand = $state('/jat:start');
	let cmdDropdownOpen = $state(false);
	let cmdSearchQuery = $state('');
	let cmdSearchInput: HTMLInputElement | undefined;
	let cmdDropdownRef: HTMLDivElement | undefined;
	let autoSchedule = $state('08:00');
	let autoDelay = $state(0);
	let autoDelayUnit = $state<'minutes' | 'hours'>('minutes');

	// Token auth state (shared by Slack and Telegram)
	let secretStatus = $state<'checking' | 'found' | 'missing' | 'saving' | 'error'>('checking');
	let secretMasked = $state('');
	let tokenInput = $state('');
	let showTokenInput = $state(false);
	let testResult = $state<{ success: boolean; info?: any; error?: string } | null>(null);
	let testingConnection = $state(false);

	// Derive projects list
	const projects = $derived(getProjects());
	const projectNames = $derived(projects.map(p => p.name?.toLowerCase() || p.path?.split('/').pop() || '').filter(Boolean));

	// Whether itemFields are available (enables Filters step)
	const hasItemFields = $derived(pluginMetadata?.itemFields && pluginMetadata.itemFields.length > 0);

	// Steps per type - Automation + Filters steps added after Options
	const builtinStepConfigs = $derived.by(() => {
		const base: Record<string, string[]> = {
			rss: ['Feed URL', 'Project', 'Options'],
			slack: ['Slack Token', 'Channel', 'Project', 'Options'],
			telegram: ['Bot Token', 'Chat', 'Project', 'Options'],
			gmail: ['App Password', 'Gmail Settings', 'Project', 'Options'],
			custom: ['Command', 'Project', 'Options']
		};
		// Add Automation, optional Filters, then Review
		for (const key of Object.keys(base)) {
			base[key].push('Automation');
			if (hasItemFields) base[key].push('Filters');
			base[key].push('Review');
		}
		return base;
	});

	// For plugins: Configuration -> Project -> Options -> Automation -> [Filters] -> Review
	const pluginSteps = $derived.by(() => {
		const steps = ['Configuration', 'Project', 'Options', 'Automation'];
		if (hasItemFields) steps.push('Filters');
		steps.push('Review');
		return steps;
	});

	const steps = $derived(sourceType ? (isPluginType ? pluginSteps : builtinStepConfigs[sourceType] || []) : []);
	const totalSteps = $derived(steps.length);
	const isLastStep = $derived(step === totalSteps - 1);
	// Check if required plugin fields are all filled (for step 0 = Configuration)
	function pluginRequiredFieldsMissing(): boolean {
		if (!pluginMetadata?.configFields) return false;
		for (const field of pluginMetadata.configFields) {
			if (!field.required) continue;
			if (field.type === 'secret') {
				if (pluginSecretStatus[field.key] !== 'found') return true;
			} else {
				const val = pluginFields[field.key];
				if (val === undefined || val === null || (typeof val === 'string' && !val.trim())) return true;
			}
		}
		return false;
	}

	const nextDisabled = $derived(
		saving ||
		// RSS: step 0 = Feed URL
		(sourceType === 'rss' && step === 0 && !feedUrl.trim()) ||
		// Slack: step 0 = token saved, step 1 = channel
		(sourceType === 'slack' && step === 0 && (secretStatus !== 'found' || !slackSecretName.trim())) ||
		(sourceType === 'slack' && step === 1 && !slackChannel.trim()) ||
		// Telegram: step 0 = token saved, step 1 = chat ID
		(sourceType === 'telegram' && step === 0 && (secretStatus !== 'found' || !telegramSecretName.trim())) ||
		(sourceType === 'telegram' && step === 1 && !telegramChatId.trim()) ||
		// Gmail: step 0 = token saved, step 1 = email + folder
		(sourceType === 'gmail' && step === 0 && (secretStatus !== 'found' || !gmailSecretName.trim())) ||
		(sourceType === 'gmail' && step === 1 && (!gmailImapUser.trim() || !gmailFolder.trim())) ||
		// Custom: step 0 = command
		(sourceType === 'custom' && step === 0 && !customCommand.trim()) ||
		// Project step (varies by type): project required
		(sourceType === 'rss' && step === 1 && !project.trim()) ||
		(sourceType === 'slack' && step === 2 && !project.trim()) ||
		(sourceType === 'telegram' && step === 2 && !project.trim()) ||
		(sourceType === 'gmail' && step === 2 && !project.trim()) ||
		(sourceType === 'custom' && step === 1 && !project.trim()) ||
		// Plugin types
		(isPluginType && step === 0 && pluginRequiredFieldsMissing()) ||
		(isPluginType && step === 1 && !project.trim())
	);

	// Check secret when on step 0 for Slack/Telegram
	$effect(() => {
		if (open && step === 0 && sourceType === 'slack' && slackSecretName.trim()) {
			checkSecret(slackSecretName.trim());
		}
	});

	$effect(() => {
		if (open && step === 0 && sourceType === 'telegram' && telegramSecretName.trim()) {
			checkSecret(telegramSecretName.trim());
		}
	});

	$effect(() => {
		if (open && step === 0 && sourceType === 'gmail' && gmailSecretName.trim()) {
			checkSecret(gmailSecretName.trim());
		}
	});

	// Check secrets for plugin-type secret fields when wizard opens
	$effect(() => {
		if (open && isPluginType && pluginMetadata?.configFields) {
			for (const field of pluginMetadata.configFields) {
				if (field.type === 'secret') {
					const secretKey = field.key;
					const secretVal = pluginFields[secretKey];
					if (secretVal && typeof secretVal === 'string' && secretVal.trim()) {
						const val = secretVal.trim();
						// untrack prevents checkPluginSecret's writes to pluginSecretStatus/pluginSecretMasked
						// from being registered as dependencies of this effect, which would cause an infinite loop
						untrack(() => checkPluginSecret(secretKey, val));
					}
				}
			}
		}
	});

	// Reset form when source type changes
	$effect(() => {
		if (open && sourceType) {
			step = 0;
			error = '';
			saving = false;
			secretStatus = 'checking';
			secretMasked = '';
			tokenInput = '';
			showTokenInput = false;
			testResult = null;
			testingConnection = false;
			detectedChats = [];
			detectionError = '';
			detectingChats = false;
			detectedChannels = [];
			channelDetectionError = '';
			detectingChannels = false;

			// Build plugin state as plain objects first, then assign once.
			// This avoids reading the reactive proxies (e.g. pluginSecretStatus[key] = ...)
			// which would register them as dependencies and cause infinite re-triggering.
			const newPluginFields: Record<string, any> = {};
			const newPluginSecretStatus: Record<string, string> = {};

			// Reset filter conditions (initialize from defaultFilter if available)
			filterConditions = pluginMetadata?.defaultFilter ? [...pluginMetadata.defaultFilter] : [];

			// Initialize plugin fields with defaults
			if (isPluginType && pluginMetadata?.configFields) {
				for (const field of pluginMetadata.configFields) {
					if (field.default !== undefined) {
						newPluginFields[field.key] = field.default;
					} else if (field.type === 'boolean') {
						newPluginFields[field.key] = false;
					} else if (field.type === 'secret') {
						newPluginFields[field.key] = field.key; // Default secret name is the key
						newPluginSecretStatus[field.key] = 'checking';
					} else {
						newPluginFields[field.key] = '';
					}
				}
			}

			// Single assignments — effect only writes, never reads these proxies
			pluginFields = newPluginFields;
			pluginSecretStatus = newPluginSecretStatus;
			pluginSecretMasked = {};
			pluginTokenInputs = {};
			pluginShowTokenInput = {};

			if (editSource) {
				populateFromEdit(editSource);
			} else {
				resetForm();
			}
		}
	});

	// Load slash commands when wizard opens (for command dropdown)
	$effect(() => {
		if (open) {
			loadCommands();
		}
	});

	// Group commands by namespace for the dropdown
	const commandsByNamespace = $derived.by(() => {
		const cmds = getCommands();
		const groups = new Map<string, Array<{ invocation: string; name: string }>>();
		for (const cmd of cmds) {
			const ns = cmd.namespace || 'local';
			if (!groups.has(ns)) groups.set(ns, []);
			groups.get(ns)!.push({ invocation: cmd.invocation, name: cmd.name });
		}
		// Sort: jat first, then local, then alphabetical
		const sorted = Array.from(groups.entries()).sort(([a], [b]) => {
			if (a === 'jat') return -1;
			if (b === 'jat') return 1;
			if (a === 'local') return -1;
			if (b === 'local') return 1;
			return a.localeCompare(b);
		});
		return sorted;
	});

	// Filtered commands for search
	const filteredCommandsByNamespace = $derived.by(() => {
		if (!cmdSearchQuery.trim()) return commandsByNamespace;
		const q = cmdSearchQuery.toLowerCase();
		const result: Array<[string, Array<{ invocation: string; name: string }>]> = [];
		for (const [ns, cmds] of commandsByNamespace) {
			const filtered = cmds.filter(c => c.invocation.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
			if (filtered.length > 0) result.push([ns, filtered]);
		}
		return result;
	});

	function selectCommand(invocation: string) {
		autoCommand = invocation;
		cmdDropdownOpen = false;
		cmdSearchQuery = '';
	}

	function handleCmdClickOutside(e: MouseEvent) {
		if (cmdDropdownRef && !cmdDropdownRef.contains(e.target as Node)) {
			cmdDropdownOpen = false;
			cmdSearchQuery = '';
		}
	}

	$effect(() => {
		if (cmdDropdownOpen) {
			document.addEventListener('mousedown', handleCmdClickOutside);
			// Focus search input after DOM updates
			setTimeout(() => cmdSearchInput?.focus(), 50);
		} else {
			document.removeEventListener('mousedown', handleCmdClickOutside);
		}
		return () => document.removeEventListener('mousedown', handleCmdClickOutside);
	});

	function resetForm() {
		sourceId = '';
		enabled = true;
		project = projects.length > 0 ? projects[0].name?.toLowerCase() || '' : '';
		pollInterval = sourceType === 'rss' ? 300 : sourceType === 'gmail' ? 120 : sourceType === 'telegram' ? 30 : 60;
		taskType = 'task';
		taskPriority = 2;
		taskLabels = sourceType ? `from-${sourceType}` : '';
		feedUrl = '';
		slackSecretName = 'slack';
		slackChannel = '';
		includeBots = false;
		telegramSecretName = 'telegram-bot';
		telegramChatId = '';
		detectingChats = false;
		detectedChats = [];
		detectionError = '';
		detectingChannels = false;
		detectedChannels = [];
		channelDetectionError = '';
		gmailSecretName = 'gmail-app-password';
		gmailImapUser = '';
		gmailFolder = '';
		gmailFilterFrom = '';
		gmailFilterSubject = '';
		gmailMarkAsRead = false;
		customCommand = '';
		connectionMode = 'polling';
		autoAction = 'none';
		autoCommand = getDefaultCommand();
		autoSchedule = '08:00';
		autoDelay = 0;
		autoDelayUnit = 'minutes';
	}

	function populateFromEdit(src: any) {
		sourceId = src.id || '';
		enabled = src.enabled !== false;
		project = src.project || '';
		pollInterval = src.pollInterval || 60;
		taskType = src.taskDefaults?.type || 'task';
		taskPriority = src.taskDefaults?.priority ?? 2;
		taskLabels = (src.taskDefaults?.labels || []).join(', ');
		feedUrl = src.feedUrl || '';
		slackSecretName = src.secretName || 'slack';
		slackChannel = src.channel || '';
		includeBots = src.includeBots || false;
		telegramSecretName = src.secretName || 'telegram-bot';
		telegramChatId = src.chatId || '';
		gmailSecretName = src.secretName || 'gmail-app-password';
		gmailImapUser = src.imapUser || '';
		gmailFolder = src.folder || '';
		gmailFilterFrom = src.filterFrom || '';
		gmailFilterSubject = src.filterSubject || '';
		gmailMarkAsRead = src.markAsRead || false;
		customCommand = src.command || '';
		connectionMode = src.connectionMode || 'polling';

		// Populate automation fields from edit source
		if (src.automation) {
			autoAction = src.automation.action || 'none';
			autoCommand = src.automation.command || getDefaultCommand();
			autoSchedule = src.automation.schedule || '08:00';
			autoDelay = src.automation.delay || 0;
			autoDelayUnit = src.automation.delayUnit || 'minutes';
		}

		// Populate plugin fields from edit source.
		// Use untrack to avoid reading the reactive proxy as a dependency inside $effect.
		if (isPluginType && pluginMetadata?.configFields) {
			const merged: Record<string, any> = untrack(() => ({ ...pluginFields }));
			for (const field of pluginMetadata.configFields) {
				if (src[field.key] !== undefined) {
					merged[field.key] = src[field.key];
				}
			}
			pluginFields = merged;
		}

		// Populate filter conditions from edit source
		if (src.filter && Array.isArray(src.filter)) {
			filterConditions = [...src.filter];
		}
	}

	function generateId(): string {
		if (sourceType === 'rss' && feedUrl) {
			try {
				const host = new URL(feedUrl).hostname.replace(/^www\./, '').split('.')[0];
				return `rss-${host}`;
			} catch {
				/* ignore */
			}
		}
		if (sourceType === 'gmail' && gmailImapUser) {
			const local = gmailImapUser.split('@')[0];
			return `gmail-${local}`;
		}
		return `${sourceType}-${Date.now().toString(36).slice(-4)}`;
	}

	// --- Token auth helpers ---

	async function checkSecret(name: string) {
		secretStatus = 'checking';
		secretMasked = '';
		testResult = null;
		try {
			const res = await fetch('/api/config/credentials/custom');
			const data = await res.json();
			if (data.success && data.customKeys?.[name]?.isSet) {
				secretStatus = 'found';
				secretMasked = data.customKeys[name].masked;
				showTokenInput = false;
			} else {
				secretStatus = 'missing';
			}
		} catch {
			secretStatus = 'error';
		}
	}

	async function saveToken(name: string, token: string, type: 'slack' | 'telegram' | 'gmail') {
		secretStatus = 'saving';
		error = '';
		const envVar = type === 'slack' ? 'SLACK_BOT_TOKEN' : type === 'gmail' ? 'GMAIL_APP_PASSWORD' : 'TELEGRAM_BOT_TOKEN';
		try {
			const res = await fetch('/api/config/credentials/custom', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name,
					value: token,
					envVar,
					description: `${type} bot token for jat-ingest`
				})
			});
			const data = await res.json();
			if (data.success) {
				secretStatus = 'found';
				secretMasked = token.slice(0, 6) + '...' + token.slice(-4);
				tokenInput = '';
				showTokenInput = false;
			} else {
				secretStatus = 'missing';
				error = data.error || 'Failed to save token';
			}
		} catch {
			secretStatus = 'missing';
			error = 'Failed to save token';
		}
	}

	async function testConnection(type: 'slack' | 'telegram' | 'gmail', secretName: string) {
		testingConnection = true;
		testResult = null;
		try {
			const body: any = { type, secretName };
			if (type === 'gmail') {
				body.imapUser = gmailImapUser.trim();
				body.folder = gmailFolder.trim() || 'INBOX';
			}
			const res = await fetch('/api/integrations/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			testResult = await res.json();
		} catch {
			testResult = { success: false, error: 'Failed to connect to verification endpoint' };
		}
		testingConnection = false;
	}

	async function testPluginConnection() {
		testingConnection = true;
		testResult = null;
		try {
			// Build body from plugin fields + type
			const body: Record<string, any> = { type: sourceType };
			if (pluginMetadata?.configFields) {
				for (const field of pluginMetadata.configFields) {
					const val = pluginFields[field.key];
					if (val !== undefined && val !== null && val !== '') {
						body[field.key] = val;
					}
				}
			}
			const res = await fetch('/api/integrations/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			testResult = await res.json();
		} catch {
			testResult = { success: false, error: 'Failed to connect to verification endpoint' };
		}
		testingConnection = false;
	}

	// --- Plugin secret helpers ---

	async function checkPluginSecret(fieldKey: string, secretName: string) {
		pluginSecretStatus[fieldKey] = 'checking';
		pluginSecretMasked[fieldKey] = '';
		try {
			const res = await fetch('/api/config/credentials/custom');
			const data = await res.json();
			if (data.success && data.customKeys?.[secretName]?.isSet) {
				pluginSecretStatus[fieldKey] = 'found';
				pluginSecretMasked[fieldKey] = data.customKeys[secretName].masked;
				pluginShowTokenInput[fieldKey] = false;
			} else {
				pluginSecretStatus[fieldKey] = 'missing';
			}
		} catch {
			pluginSecretStatus[fieldKey] = 'error';
		}
		pluginSecretStatus = { ...pluginSecretStatus };
		pluginSecretMasked = { ...pluginSecretMasked };
	}

	async function savePluginToken(fieldKey: string, secretName: string, token: string) {
		pluginSecretStatus[fieldKey] = 'saving';
		error = '';
		const envVar = secretName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
		try {
			const res = await fetch('/api/config/credentials/custom', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: secretName,
					value: token,
					envVar,
					description: `${pluginMetadata?.name || sourceType} API token for jat-ingest`
				})
			});
			const data = await res.json();
			if (data.success) {
				pluginSecretStatus[fieldKey] = 'found';
				pluginSecretMasked[fieldKey] = token.slice(0, 6) + '...' + token.slice(-4);
				pluginTokenInputs[fieldKey] = '';
				pluginShowTokenInput[fieldKey] = false;
			} else {
				pluginSecretStatus[fieldKey] = 'missing';
				error = data.error || 'Failed to save token';
			}
		} catch {
			pluginSecretStatus[fieldKey] = 'missing';
			error = 'Failed to save token';
		}
		pluginSecretStatus = { ...pluginSecretStatus };
		pluginSecretMasked = { ...pluginSecretMasked };
		pluginTokenInputs = { ...pluginTokenInputs };
		pluginShowTokenInput = { ...pluginShowTokenInput };
	}

	async function detectChats() {
		detectingChats = true;
		detectionError = '';
		detectedChats = [];
		try {
			const res = await fetch('/api/integrations/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type: 'telegram-chats', secretName: telegramSecretName })
			});
			const data = await res.json();
			if (data.success) {
				if (data.chats.length === 0) {
					detectionError = 'No chats found. Make sure the bot is added to a group and someone has sent a message.';
				} else {
					detectedChats = data.chats;
				}
			} else {
				detectionError = data.error || 'Failed to detect chats';
			}
		} catch {
			detectionError = 'Failed to connect to verification endpoint';
		}
		detectingChats = false;
	}

	async function detectChannels() {
		detectingChannels = true;
		channelDetectionError = '';
		detectedChannels = [];
		try {
			const res = await fetch('/api/integrations/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type: 'slack-channels', secretName: slackSecretName })
			});
			const data = await res.json();
			if (data.success) {
				if (data.channels.length === 0) {
					channelDetectionError = 'No channels found. Make sure the bot is added to channels.';
				} else {
					detectedChannels = data.channels;
				}
			} else {
				channelDetectionError = data.error || 'Failed to list channels';
			}
		} catch {
			channelDetectionError = 'Failed to connect to verification endpoint';
		}
		detectingChannels = false;
	}

	function handleSecretNameChange() {
		secretStatus = 'checking';
		secretMasked = '';
		testResult = null;
		showTokenInput = false;
		const name = sourceType === 'slack' ? slackSecretName : sourceType === 'gmail' ? gmailSecretName : telegramSecretName;
		if (name.trim()) {
			checkSecret(name.trim());
		}
	}

	// --- Validation ---

	function validateStep(): boolean {
		error = '';

		if (sourceType === 'rss') {
			if (step === 0 && !feedUrl.trim()) {
				error = 'Feed URL is required';
				return false;
			}
			if (step === 0) {
				try {
					new URL(feedUrl);
				} catch {
					error = 'Invalid URL format';
					return false;
				}
			}
			if (step === 1 && !project.trim()) {
				error = 'Select a project';
				return false;
			}
		}

		if (sourceType === 'slack') {
			if (step === 0 && !slackSecretName.trim()) {
				error = 'Secret name is required';
				return false;
			}
			if (step === 0 && secretStatus !== 'found') {
				error = 'Save a valid token before continuing';
				return false;
			}
			if (step === 1 && !slackChannel.trim()) {
				error = 'Channel ID is required';
				return false;
			}
			if (step === 2 && !project.trim()) {
				error = 'Select a project';
				return false;
			}
		}

		if (sourceType === 'telegram') {
			if (step === 0 && !telegramSecretName.trim()) {
				error = 'Secret name is required';
				return false;
			}
			if (step === 0 && secretStatus !== 'found') {
				error = 'Save a valid token before continuing';
				return false;
			}
			if (step === 1 && !telegramChatId.trim()) {
				error = 'Chat ID is required';
				return false;
			}
			if (step === 2 && !project.trim()) {
				error = 'Select a project';
				return false;
			}
		}

		if (sourceType === 'gmail') {
			if (step === 0 && !gmailSecretName.trim()) {
				error = 'Secret name is required';
				return false;
			}
			if (step === 0 && secretStatus !== 'found') {
				error = 'Save a valid App Password before continuing';
				return false;
			}
			if (step === 1 && !gmailImapUser.trim()) {
				error = 'Email address is required';
				return false;
			}
			if (step === 1 && !gmailFolder.trim()) {
				error = 'Gmail label/folder is required';
				return false;
			}
			if (step === 2 && !project.trim()) {
				error = 'Select a project';
				return false;
			}
		}

		if (sourceType === 'custom') {
			if (step === 0 && !customCommand.trim()) {
				error = 'Command is required';
				return false;
			}
			if (step === 1 && !project.trim()) {
				error = 'Select a project';
				return false;
			}
		}

		// Plugin types: step 0 = config fields, step 1 = project
		if (isPluginType && pluginMetadata?.configFields) {
			if (step === 0) {
				for (const field of pluginMetadata.configFields) {
					if (!field.required) continue;
					if (field.type === 'secret') {
						if (pluginSecretStatus[field.key] !== 'found') {
							error = `Save a valid ${field.label || field.key} before continuing`;
							return false;
						}
					} else {
						const val = pluginFields[field.key];
						if (val === undefined || val === null || (typeof val === 'string' && !val.trim())) {
							error = `${field.label || field.key} is required`;
							return false;
						}
					}
				}
			}
			if (step === 1 && !project.trim()) {
				error = 'Select a project';
				return false;
			}
		}

		return true;
	}

	function next() {
		if (!validateStep()) return;
		if (isLastStep) {
			save();
		} else {
			step++;
		}
	}

	function back() {
		if (step > 0) step--;
	}

	async function save() {
		saving = true;
		error = '';

		const id = sourceId || generateId();
		const labels = taskLabels
			.split(',')
			.map((l) => l.trim())
			.filter(Boolean);

		const base: any = {
			id,
			type: sourceType,
			enabled,
			project: project.trim(),
			pollInterval,
			taskDefaults: {
				type: taskType,
				priority: taskPriority,
				labels
			}
		};

		// Include connectionMode if adapter supports realtime
		if (pluginMetadata?.capabilities?.realtime && connectionMode === 'realtime') {
			base.connectionMode = 'realtime';
		}

		let source: any;
		if (sourceType === 'rss') {
			source = { ...base, feedUrl: feedUrl.trim() };
		} else if (sourceType === 'slack') {
			source = {
				...base,
				secretName: slackSecretName.trim(),
				channel: slackChannel.trim(),
				includeBots
			};
		} else if (sourceType === 'telegram') {
			source = {
				...base,
				secretName: telegramSecretName.trim(),
				chatId: telegramChatId.trim()
			};
		} else if (sourceType === 'gmail') {
			source = {
				...base,
				secretName: gmailSecretName.trim(),
				imapUser: gmailImapUser.trim(),
				folder: gmailFolder.trim(),
				...(gmailFilterFrom.trim() && { filterFrom: gmailFilterFrom.trim() }),
				...(gmailFilterSubject.trim() && { filterSubject: gmailFilterSubject.trim() }),
				markAsRead: gmailMarkAsRead
			};
		} else if (isPluginType && pluginMetadata?.configFields) {
			// Build source from dynamic plugin configFields
			const pluginConfig: Record<string, any> = {};
			for (const field of pluginMetadata.configFields) {
				const val = pluginFields[field.key];
				if (field.type === 'secret') {
					// Secret fields store the secret name, not the value
					pluginConfig[field.key] = typeof val === 'string' ? val.trim() : val;
				} else if (field.type === 'boolean') {
					pluginConfig[field.key] = val === true;
				} else if (field.type === 'number') {
					pluginConfig[field.key] = Number(val) || 0;
				} else if (typeof val === 'string') {
					if (val.trim()) pluginConfig[field.key] = val.trim();
				} else if (val !== undefined && val !== null && val !== '') {
					pluginConfig[field.key] = val;
				}
			}
			source = { ...base, ...pluginConfig };
		} else {
			source = { ...base, command: customCommand.trim() };
		}

		// Add automation config if not 'none'
		if (autoAction !== 'none') {
			source.automation = {
				action: autoAction,
				command: autoCommand
			};
			if (autoAction === 'schedule') {
				source.automation.schedule = autoSchedule;
			}
			if (autoAction === 'delay') {
				source.automation.delay = autoDelay;
				source.automation.delayUnit = autoDelayUnit;
			}
		}

		// Add filter conditions if any
		if (filterConditions.length > 0) {
			source.filter = filterConditions;
		}

		try {
			onSave(source);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save';
			saving = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') onClose();
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			next();
		}
	}

	const typeLabels: Record<string, string> = {
		rss: 'RSS Feed',
		slack: 'Slack Channel',
		telegram: 'Telegram Chat',
		gmail: 'Gmail',
		custom: 'Custom Source'
	};

	// Resolve display label for any source type (built-in or plugin)
	function getSourceLabel(type: string | null): string {
		if (!type) return 'Source';
		if (typeLabels[type]) return typeLabels[type];
		if (pluginMetadata?.name) return pluginMetadata.name;
		return type.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open && sourceType}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-50 flex justify-end"
		transition:fade={{ duration: 150 }}
	>
		<!-- Overlay -->
		<button
			class="absolute inset-0 cursor-default"
			style="background: oklch(0.10 0.02 250 / 0.7); backdrop-filter: blur(2px);"
			onclick={onClose}
			tabindex="-1"
		></button>

		<!-- Drawer panel -->
		<div
			class="relative w-full max-w-lg h-full flex flex-col"
			style="background: oklch(0.16 0.02 250); border-left: 1px solid oklch(0.28 0.02 250);"
			transition:fly={{ x: 400, duration: 250 }}
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Header -->
			<div
				class="flex items-center justify-between px-5 py-4"
				style="border-bottom: 1px solid oklch(0.25 0.02 250);"
			>
				<div>
					<h2 class="font-mono text-sm font-semibold tracking-wide" style="color: oklch(0.85 0.02 250);">
						{editSource ? 'Edit' : 'Add'} {getSourceLabel(sourceType)}
					</h2>
					<div class="flex items-center gap-2 mt-1">
						{#each steps as s, i}
							<div
								class="h-1 rounded-full transition-all duration-200"
								style="
									width: {i <= step ? '24px' : '8px'};
									background: {i < step ? 'oklch(0.70 0.18 145)' : i === step ? 'oklch(0.70 0.18 220)' : 'oklch(0.30 0.02 250)'};
								"
							></div>
						{/each}
						<span class="font-mono text-[10px] ml-1" style="color: oklch(0.50 0.02 250);">
							{step + 1}/{totalSteps}
						</span>
					</div>
				</div>
				<button
					class="btn btn-sm btn-ghost btn-circle"
					onclick={onClose}
					aria-label="Close"
					style="color: oklch(0.55 0.02 250);"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
						<path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
					</svg>
				</button>
			</div>

			<!-- Content -->
			<div class="flex-1 overflow-y-auto px-5 py-5">
				{#if error}
					<div
						class="mb-4 px-3 py-2 rounded-lg font-mono text-xs"
						style="background: oklch(0.25 0.08 25); color: oklch(0.80 0.15 25); border: 1px solid oklch(0.35 0.08 25);"
					>
						{error}
					</div>
				{/if}

				<!-- RSS Steps -->
				{#if sourceType === 'rss'}
					{#if step === 0}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							<div>
								<label class="font-mono text-xs font-semibold block mb-1.5" style="color: oklch(0.65 0.02 250);">Feed URL</label>
								<input
									type="url"
									class="input input-bordered w-full font-mono text-sm"
									placeholder="https://example.com/feed.xml"
									bind:value={feedUrl}
									autofocus
								/>
								<p class="font-mono text-[10px] mt-1.5" style="color: oklch(0.45 0.02 250);">
									RSS 2.0, Atom, or Media RSS feed URL
								</p>
							</div>
						</div>
					{:else if step === 1}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render projectStep()}
						</div>
					{:else if step === 2}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render optionsStep()}
						</div>
					{:else if steps[step] === 'Automation'}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render automationStep()}
						</div>
					{:else if steps[step] === 'Filters'}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render filtersStep()}
						</div>
					{:else if steps[step] === 'Review'}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render reviewStep()}
						</div>
					{/if}
				{/if}

				<!-- Slack Steps -->
				{#if sourceType === 'slack'}
					{#if step === 0}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render tokenStep('slack', slackSecretName)}
						</div>
					{:else if step === 1}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							<!-- Detect channels button -->
							<button
								class="font-mono text-[11px] px-3 py-2 rounded-lg flex items-center gap-2 w-full justify-center cursor-pointer"
								style="background: oklch(0.30 0.10 310); color: oklch(0.85 0.10 310); border: 1px solid oklch(0.40 0.10 310);"
								onclick={detectChannels}
								disabled={detectingChannels || secretStatus !== 'found'}
							>
								{#if detectingChannels}
									<span class="loading loading-spinner loading-xs"></span>
									Loading channels...
								{:else}
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5">
										<path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
										</svg>
									Detect Channels
								{/if}
							</button>

							<!-- Detection error -->
							{#if channelDetectionError}
								<div
									class="px-3 py-2.5 rounded-lg"
									style="background: oklch(0.22 0.06 25 / 0.3); border: 1px solid oklch(0.35 0.08 25);"
								>
									<p class="font-mono text-[11px]" style="color: oklch(0.75 0.12 25);">
										{channelDetectionError}
									</p>
								</div>
							{/if}

							<!-- Detected channels -->
							{#if detectedChannels.length > 0}
								<div class="space-y-1.5">
									<p class="font-mono text-[10px] font-semibold" style="color: oklch(0.55 0.02 250);">
										{detectedChannels.length} channel{detectedChannels.length !== 1 ? 's' : ''} found — click to select
									</p>
									<div class="max-h-60 overflow-y-auto space-y-1.5 pr-1">
										{#each detectedChannels as channel}
											<button
												class="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-all duration-100 cursor-pointer"
												style="
													background: {slackChannel === channel.id ? 'oklch(0.22 0.08 310 / 0.5)' : 'oklch(0.20 0.02 250 / 0.5)'};
													border: 1px solid {slackChannel === channel.id ? 'oklch(0.45 0.12 310)' : 'oklch(0.28 0.02 250)'};
												"
												onclick={() => { slackChannel = channel.id; }}
											>
												<!-- Channel icon -->
												<span class="text-sm shrink-0" style="color: oklch(0.60 0.08 310);">
													{#if channel.isPrivate}
														<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
															<path fill-rule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clip-rule="evenodd" />
															</svg>
													{:else}
														<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
															<path fill-rule="evenodd" d="M9.493 2.852a.75.75 0 00-1.486.204L8.545 6H4.198a.75.75 0 000 1.5h4.172l-.62 4.5H3.4a.75.75 0 000 1.5h4.173l-.564 4.148a.75.75 0 001.486.204l.588-4.352h4.394l-.564 4.148a.75.75 0 001.486.204l.588-4.352h4.014a.75.75 0 000-1.5h-3.838l.62-4.5h4.168a.75.75 0 000-1.5h-3.993l.565-4.148a.75.75 0 00-1.487-.204L14.335 7.5H9.942l.564-4.148a.75.75 0 00-.013-.5zM9.766 8.998l-.62 4.5h4.394l.62-4.5H9.766z" clip-rule="evenodd" />
															</svg>
													{/if}
												</span>
												<div class="min-w-0 flex-1">
													<p class="font-mono text-[11px] truncate" style="color: oklch(0.80 0.02 250);">
														#{channel.name}
													</p>
													<p class="font-mono text-[9px] truncate" style="color: oklch(0.45 0.02 250);">
														{channel.isPrivate ? 'private' : 'public'} · {channel.memberCount} members{channel.isMember ? '' : ' · not joined'}{channel.topic ? ` · ${channel.topic}` : ''}
													</p>
												</div>
												<!-- Selected indicator -->
												{#if slackChannel === channel.id}
													<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 shrink-0" style="color: oklch(0.70 0.18 145);">
														<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
														</svg>
												{/if}
											</button>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Manual fallback -->
							<details
								class="rounded-lg"
								style="background: oklch(0.18 0.02 250 / 0.5); border: 1px solid oklch(0.25 0.02 250);"
							>
								<summary class="cursor-pointer px-3 py-2 font-mono text-[10px] select-none" style="color: oklch(0.50 0.02 250);">
									Enter Channel ID manually
								</summary>
								<div class="px-3 pb-3 pt-1">
									<input
										type="text"
										class="input input-bordered w-full font-mono text-sm"
										placeholder="C0123ABCDEF"
										bind:value={slackChannel}
									/>
									<p class="font-mono text-[10px] mt-1.5" style="color: oklch(0.45 0.02 250);">
										Right-click a channel &rarr; View channel details &rarr; copy the Channel ID at the bottom
									</p>
								</div>
							</details>

							<div>
								<label class="flex items-center gap-2 cursor-pointer">
									<input type="checkbox" class="checkbox checkbox-sm" bind:checked={includeBots} />
									<span class="font-mono text-xs" style="color: oklch(0.65 0.02 250);">Include bot messages</span>
								</label>
							</div>
						</div>
					{:else if step === 2}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render projectStep()}
						</div>
					{:else if step === 3}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render optionsStep()}
						</div>
					{:else if steps[step] === 'Automation'}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render automationStep()}
						</div>
					{:else if steps[step] === 'Filters'}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render filtersStep()}
						</div>
					{:else if steps[step] === 'Review'}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render reviewStep()}
						</div>
					{/if}
				{/if}

				<!-- Telegram Steps -->
				{#if sourceType === 'telegram'}
					{#if step === 0}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render tokenStep('telegram', telegramSecretName)}
						</div>
					{:else if step === 1}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							<!-- Instructions -->
							<details open
								class="rounded-lg"
								style="background: oklch(0.20 0.04 220 / 0.3); border: 1px solid oklch(0.30 0.04 220);"
							>
								<summary class="cursor-pointer px-3 py-2.5 font-mono text-[11px] font-semibold select-none" style="color: oklch(0.70 0.10 220);">
									How to detect your chats
								</summary>
								<div class="px-3 pb-3">
									<ol class="font-mono text-[10px] space-y-1.5 list-decimal list-inside" style="color: oklch(0.60 0.02 250);">
										<li>Add your bot to the group or channel you want to monitor</li>
										<li>Send at least one message in that group (so the bot sees it)</li>
										<li>Click <strong style="color: oklch(0.75 0.02 250);">Detect Chats</strong> below</li>
									</ol>
								</div>
							</details>

							<!-- Detect button -->
							<button
								class="font-mono text-[11px] px-3 py-2 rounded-lg flex items-center gap-2 w-full justify-center"
								style="background: oklch(0.30 0.10 220); color: oklch(0.85 0.10 220); border: 1px solid oklch(0.40 0.10 220);"
								onclick={detectChats}
								disabled={detectingChats || secretStatus !== 'found'}
							>
								{#if detectingChats}
									<span class="loading loading-spinner loading-xs"></span>
									Detecting chats...
								{:else}
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5">
										<path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
									</svg>
									Detect Chats
								{/if}
							</button>

							<!-- Detection error -->
							{#if detectionError}
								<div
									class="px-3 py-2.5 rounded-lg"
									style="background: oklch(0.22 0.06 25 / 0.3); border: 1px solid oklch(0.35 0.08 25);"
								>
									<p class="font-mono text-[11px]" style="color: oklch(0.75 0.12 25);">
										{detectionError}
									</p>
								</div>
							{/if}

							<!-- Detected chat cards -->
							{#if detectedChats.length > 0}
								<div class="space-y-1.5">
									<p class="font-mono text-[10px] font-semibold" style="color: oklch(0.55 0.02 250);">
										{detectedChats.length} chat{detectedChats.length !== 1 ? 's' : ''} found — click to select
									</p>
									{#each detectedChats as chat}
										<button
											class="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-all duration-100"
											style="
												background: {String(telegramChatId) === String(chat.id) ? 'oklch(0.22 0.08 220 / 0.5)' : 'oklch(0.20 0.02 250 / 0.5)'};
												border: 1px solid {String(telegramChatId) === String(chat.id) ? 'oklch(0.45 0.12 220)' : 'oklch(0.28 0.02 250)'};
											"
											onclick={() => { telegramChatId = String(chat.id); }}
										>
											<!-- Chat type icon -->
											<span class="text-sm shrink-0" style="color: oklch(0.60 0.08 220);">
												{#if chat.type === 'supergroup' || chat.type === 'group'}
													<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
														<path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.516 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.655zM16.44 15.98a4.97 4.97 0 002.07-.654.78.78 0 00.357-.442 3 3 0 00-4.308-3.517 6.484 6.484 0 011.907 3.96 2.32 2.32 0 01-.026.654zM18 8a2 2 0 11-4 0 2 2 0 014 0zM5.304 16.19a.844.844 0 01-.277-.71 5 5 0 019.947 0 .843.843 0 01-.277.71A6.975 6.975 0 0110 18a6.974 6.974 0 01-4.696-1.81z" />
													</svg>
												{:else if chat.type === 'channel'}
													<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
														<path fill-rule="evenodd" d="M3.43 2.524A41.29 41.29 0 0110 2c2.236 0 4.43.18 6.57.524 1.437.231 2.43 1.49 2.43 2.902v5.148c0 1.413-.993 2.67-2.43 2.902a41.202 41.202 0 01-5.183.501l-2.525 2.525a.75.75 0 01-1.28-.53v-2.2a41.453 41.453 0 01-1.862-.274C2.993 13.245 2 11.986 2 10.574V5.426c0-1.413.993-2.67 2.43-2.902z" clip-rule="evenodd" />
													</svg>
												{:else}
													<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
														<path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
													</svg>
												{/if}
											</span>
											<div class="min-w-0 flex-1">
												<p class="font-mono text-[11px] truncate" style="color: oklch(0.80 0.02 250);">
													{chat.title}
												</p>
												<p class="font-mono text-[9px]" style="color: oklch(0.45 0.02 250);">
													{chat.type}{chat.username ? ` · @${chat.username}` : ''} · ID: {chat.id}
												</p>
											</div>
											<!-- Selected indicator -->
											{#if String(telegramChatId) === String(chat.id)}
												<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 shrink-0" style="color: oklch(0.70 0.18 145);">
													<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
												</svg>
											{/if}
										</button>
									{/each}
								</div>
							{/if}

							<!-- Manual fallback -->
							<details
								class="rounded-lg"
								style="background: oklch(0.18 0.02 250 / 0.5); border: 1px solid oklch(0.25 0.02 250);"
							>
								<summary class="cursor-pointer px-3 py-2 font-mono text-[10px] select-none" style="color: oklch(0.50 0.02 250);">
									Enter Chat ID manually
								</summary>
								<div class="px-3 pb-3 pt-1">
									<input
										type="text"
										class="input input-bordered w-full font-mono text-sm"
										placeholder="-1001234567890"
										bind:value={telegramChatId}
									/>
									<p class="font-mono text-[10px] mt-1.5" style="color: oklch(0.45 0.02 250);">
										Group/channel ID (starts with -100). Forward a message to @userinfobot to find it.
									</p>
								</div>
							</details>
						</div>
					{:else if step === 2}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render projectStep()}
						</div>
					{:else if step === 3}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render optionsStep()}
						</div>
					{:else if steps[step] === 'Automation'}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render automationStep()}
						</div>
					{:else if steps[step] === 'Filters'}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render filtersStep()}
						</div>
					{:else if steps[step] === 'Review'}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render reviewStep()}
						</div>
					{/if}
				{/if}


				<!-- Gmail Steps -->
				{#if sourceType === 'gmail'}
					{#if step === 0}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render tokenStep('gmail', gmailSecretName)}
						</div>
					{:else if step === 1}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							<div>
								<label class="font-mono text-xs font-semibold block mb-1.5" style="color: oklch(0.65 0.02 250);">Email Address</label>
								<input
									type="email"
									class="input input-bordered w-full font-mono text-sm"
									placeholder="you@gmail.com"
									bind:value={gmailImapUser}
									autofocus
								/>
								<p class="font-mono text-[10px] mt-1.5" style="color: oklch(0.45 0.02 250);">
									The Gmail address to connect to via IMAP
								</p>
							</div>

							<div>
								<label class="font-mono text-xs font-semibold block mb-1.5" style="color: oklch(0.65 0.02 250);">Gmail Label / Folder <span style="color: oklch(0.70 0.12 25);">*required</span></label>
								<input
									type="text"
									class="input input-bordered w-full font-mono text-sm"
									placeholder="JAT"
									bind:value={gmailFolder}
								/>
								<p class="font-mono text-[10px] mt-1.5" style="color: oklch(0.45 0.02 250);">
									Only emails in this label become tasks. Create a Gmail label and filter rule to route relevant emails there.
								</p>
							</div>

							<!-- Test connection (requires email + folder) -->
							{#if secretStatus === 'found' && gmailImapUser.trim() && gmailFolder.trim()}
								<div class="space-y-2">
									<button
										class="font-mono text-[11px] px-3 py-1.5 rounded-lg flex items-center gap-2"
										style="background: oklch(0.22 0.04 25); color: oklch(0.75 0.10 25); border: 1px solid oklch(0.32 0.06 25);"
										onclick={() => testConnection('gmail', gmailSecretName)}
										disabled={testingConnection}
									>
										{#if testingConnection}
											<span class="loading loading-spinner loading-xs"></span>
											Testing IMAP connection...
										{:else}
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5">
												<path fill-rule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.28a.75.75 0 00-.75.75v3.955a.75.75 0 001.5 0v-2.134l.235.234a7 7 0 0011.712-3.138.75.75 0 00-1.449-.388zm1.7-5.69a.75.75 0 00-.987-.565 7 7 0 00-11.712 3.138.75.75 0 001.449.388 5.5 5.5 0 019.2-2.466l.313.311h-2.433a.75.75 0 000 1.5H15.8a.75.75 0 00.75-.75V3.778a.75.75 0 00-.538-.044z" clip-rule="evenodd" />
											</svg>
											Test Connection
										{/if}
									</button>

									{#if testResult}
										{#if testResult.success}
											<div class="px-3 py-2 rounded-lg" style="background: oklch(0.20 0.06 145 / 0.2); border: 1px solid oklch(0.30 0.08 145);">
												<p class="font-mono text-[11px]" style="color: oklch(0.75 0.10 145);">
													Connected to <strong style="color: oklch(0.85 0.02 250);">{testResult.info.email}</strong>
												</p>
												<p class="font-mono text-[10px] mt-0.5" style="color: oklch(0.60 0.06 145);">
													Folder: {testResult.info.folder} ({testResult.info.messageCount} messages)
												</p>
											</div>
										{:else}
											<div class="px-3 py-2 rounded-lg" style="background: oklch(0.22 0.06 25 / 0.3); border: 1px solid oklch(0.35 0.08 25);">
												<p class="font-mono text-[11px]" style="color: oklch(0.75 0.12 25);">{testResult.error}</p>
											</div>
										{/if}
									{/if}
								</div>
							{/if}

							<!-- Optional filters -->
							<details class="rounded-lg" style="background: oklch(0.18 0.02 250 / 0.5); border: 1px solid oklch(0.25 0.02 250);">
								<summary class="cursor-pointer px-3 py-2 font-mono text-[10px] select-none" style="color: oklch(0.50 0.02 250);">
									Optional filters
								</summary>
								<div class="px-3 pb-3 pt-1 space-y-3">
									<div>
										<label class="font-mono text-[10px] font-semibold block mb-1" style="color: oklch(0.60 0.02 250);">Filter by sender</label>
										<input type="text" class="input input-bordered w-full font-mono text-sm" placeholder="alerts@example.com" bind:value={gmailFilterFrom} />
									</div>
									<div>
										<label class="font-mono text-[10px] font-semibold block mb-1" style="color: oklch(0.60 0.02 250);">Filter by subject (regex)</label>
										<input type="text" class="input input-bordered w-full font-mono text-sm" bind:value={gmailFilterSubject} />
									</div>
									<label class="flex items-center gap-2 cursor-pointer">
										<input type="checkbox" class="checkbox checkbox-sm" bind:checked={gmailMarkAsRead} />
										<span class="font-mono text-xs" style="color: oklch(0.65 0.02 250);">Mark emails as read after ingesting</span>
									</label>
								</div>
							</details>
						</div>
					{:else if step === 2}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render projectStep()}
						</div>
					{:else if step === 3}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render optionsStep()}
						</div>
					{:else if steps[step] === 'Automation'}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render automationStep()}
						</div>
					{:else if steps[step] === 'Filters'}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render filtersStep()}
						</div>
					{:else if steps[step] === 'Review'}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render reviewStep()}
						</div>
					{/if}
				{/if}

				<!-- Custom Steps -->
				{#if sourceType === 'custom'}
					{#if step === 0}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							<div>
								<label class="font-mono text-xs font-semibold block mb-1.5" style="color: oklch(0.65 0.02 250);">Command</label>
								<textarea
									class="textarea textarea-bordered w-full font-mono text-sm"
									placeholder="curl -s https://api.example.com/items | jq '.[]'"
									rows="3"
									bind:value={customCommand}
								></textarea>
								<p class="font-mono text-[10px] mt-1.5" style="color: oklch(0.45 0.02 250);">
									Shell command that outputs JSON items. Each item needs: id, title, description
								</p>
							</div>
						</div>
					{:else if step === 1}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render projectStep()}
						</div>
					{:else if step === 2}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render optionsStep()}
						</div>
					{:else if steps[step] === 'Automation'}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render automationStep()}
						</div>
					{:else if steps[step] === 'Filters'}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render filtersStep()}
						</div>
					{:else if steps[step] === 'Review'}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render reviewStep()}
						</div>
					{/if}
				{/if}

				<!-- Dynamic Plugin Steps -->
				{#if isPluginType}
					{#if step === 0}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{#if pluginMetadata?.configFields && pluginMetadata.configFields.length > 0}
								<DynamicConfigForm
									configFields={pluginMetadata.configFields}
									values={pluginFields}
									onValueChange={(key, value) => { pluginFields[key] = value; pluginFields = { ...pluginFields }; }}
									secretStatus={pluginSecretStatus}
									secretMasked={pluginSecretMasked}
									tokenInputs={pluginTokenInputs}
									showTokenInput={pluginShowTokenInput}
									onCheckSecret={(fieldKey, secretName) => checkPluginSecret(fieldKey, secretName)}
									onSaveToken={(fieldKey, secretName, token) => savePluginToken(fieldKey, secretName, token)}
									onToggleTokenInput={(fieldKey, show) => { pluginShowTokenInput[fieldKey] = show; pluginShowTokenInput = { ...pluginShowTokenInput }; }}
									onTokenInputChange={(fieldKey, value) => { pluginTokenInputs[fieldKey] = value; pluginTokenInputs = { ...pluginTokenInputs }; }}
								/>

								<!-- Test Connection for dynamic plugins -->
								{@const allSecretsReady = pluginMetadata.configFields
									.filter((f: any) => f.type === 'secret')
									.every((f: any) => pluginSecretStatus[f.key] === 'found')}
								{@const allRequiredFilled = pluginMetadata.configFields
									.filter((f: any) => f.required && f.type !== 'secret')
									.every((f: any) => {
										const val = pluginFields[f.key];
										return val !== undefined && val !== null && (typeof val !== 'string' || val.trim() !== '');
									})}
								{#if allSecretsReady && allRequiredFilled}
									<div class="space-y-2 pt-2" style="border-top: 1px solid oklch(0.22 0.02 250);">
										<button
											class="font-mono text-[11px] px-3 py-1.5 rounded-lg flex items-center gap-2"
											style="background: oklch(0.22 0.04 220); color: oklch(0.75 0.10 220); border: 1px solid oklch(0.32 0.06 220);"
											onclick={() => testPluginConnection()}
											disabled={testingConnection}
										>
											{#if testingConnection}
												<span class="loading loading-spinner loading-xs"></span>
												Testing...
											{:else}
												<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5">
													<path fill-rule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.28a.75.75 0 00-.75.75v3.955a.75.75 0 001.5 0v-2.134l.235.234a7 7 0 0011.712-3.138.75.75 0 00-1.449-.388zm1.7-5.69a.75.75 0 00-.987-.565 7 7 0 00-11.712 3.138.75.75 0 001.449.388 5.5 5.5 0 019.2-2.466l.313.311h-2.433a.75.75 0 000 1.5H15.8a.75.75 0 00.75-.75V3.778a.75.75 0 00-.538-.044z" clip-rule="evenodd" />
												</svg>
												Test Connection
											{/if}
										</button>

										{#if testResult}
											{#if testResult.success}
												<div
													class="px-3 py-2 rounded-lg"
													style="background: oklch(0.20 0.06 145 / 0.2); border: 1px solid oklch(0.30 0.08 145);"
												>
													<p class="font-mono text-[11px]" style="color: oklch(0.75 0.10 145);">
														{testResult.info?.message || 'Connection successful'}
													</p>
													{#if testResult.sampleItems?.length}
														<div class="mt-2 space-y-1">
															<p class="font-mono text-[10px]" style="color: oklch(0.55 0.02 250);">Sample items:</p>
															{#each testResult.sampleItems.slice(0, 3) as item}
																<p class="font-mono text-[10px] truncate" style="color: oklch(0.65 0.02 250);">
																	{item.title}
																</p>
															{/each}
														</div>
													{/if}
												</div>
											{:else}
												<div
													class="px-3 py-2 rounded-lg"
													style="background: oklch(0.20 0.10 25 / 0.2); border: 1px solid oklch(0.30 0.12 25);"
												>
													<p class="font-mono text-[11px]" style="color: oklch(0.75 0.10 25);">
														{testResult.error || 'Connection failed'}
													</p>
												</div>
											{/if}
										{/if}
									</div>
								{/if}
							{:else}
								<p class="font-mono text-xs" style="color: oklch(0.50 0.02 250);">
									No configuration fields defined for this plugin.
								</p>
							{/if}
						</div>
					{:else if step === 1}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render projectStep()}
						</div>
					{:else if step === 2}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render optionsStep()}
						</div>
					{:else if steps[step] === 'Automation'}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render automationStep()}
						</div>
					{:else if steps[step] === 'Filters'}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render filtersStep()}
						</div>
					{:else if steps[step] === 'Review'}
						<div class="space-y-4" transition:fly={{ x: 30, duration: 150 }}>
							{@render reviewStep()}
						</div>
					{/if}
				{/if}
			</div>

			<!-- Footer -->
			<div
				class="flex items-center justify-between px-5 py-4"
				style="border-top: 1px solid oklch(0.25 0.02 250);"
			>
				<button
					class="btn btn-sm btn-ghost font-mono text-xs"
					onclick={step > 0 ? back : onClose}
					style="color: oklch(0.60 0.02 250);"
				>
					{step > 0 ? 'Back' : 'Cancel'}
				</button>
				<button
					class="btn btn-sm font-mono text-xs"
					style="
						background: {nextDisabled ? 'oklch(0.25 0.02 250)' : isLastStep ? 'oklch(0.45 0.15 145)' : 'oklch(0.35 0.10 220)'};
						color: {nextDisabled ? 'oklch(0.45 0.02 250)' : 'oklch(0.95 0.02 250)'};
						border: 1px solid {nextDisabled ? 'oklch(0.30 0.02 250)' : isLastStep ? 'oklch(0.55 0.15 145)' : 'oklch(0.45 0.10 220)'};
						cursor: {nextDisabled ? 'not-allowed' : 'pointer'};
					"
					onclick={next}
					disabled={nextDisabled}
				>
					{#if saving}
						<span class="loading loading-spinner loading-xs"></span>
					{:else if isLastStep}
						{editSource ? 'Save Changes' : 'Add Source'}
					{:else}
						Next
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Token step snippet (shared by Slack, Telegram, and Gmail) -->
{#snippet tokenStep(type: 'slack' | 'telegram' | 'gmail', secretName: string)}
	<div>
		<label class="font-mono text-xs font-semibold block mb-1.5" style="color: oklch(0.65 0.02 250);">Secret Name</label>
		{#if type === 'slack'}
			<input
				type="text"
				class="input input-bordered w-full font-mono text-sm"
				placeholder="slack"
				bind:value={slackSecretName}
				oninput={handleSecretNameChange}
				autofocus
			/>
		{:else if type === 'gmail'}
			<input
				type="text"
				class="input input-bordered w-full font-mono text-sm"
				placeholder="gmail-app-password"
				bind:value={gmailSecretName}
				oninput={handleSecretNameChange}
				autofocus
			/>
		{:else}
			<input
				type="text"
				class="input input-bordered w-full font-mono text-sm"
				placeholder="telegram-bot"
				bind:value={telegramSecretName}
				oninput={handleSecretNameChange}
				autofocus
			/>
		{/if}
		<p class="font-mono text-[10px] mt-1.5" style="color: oklch(0.45 0.02 250);">
			Name used in <code>jat-secret</code> to retrieve the {type === 'gmail' ? 'App Password' : 'token'}
		</p>
	</div>

	<!-- Secret status -->
	{#if secretStatus === 'checking'}
		<div
			class="flex items-center gap-2 px-3 py-2.5 rounded-lg"
			style="background: oklch(0.20 0.02 250 / 0.5); border: 1px solid oklch(0.28 0.02 250);"
		>
			<span class="loading loading-spinner loading-xs" style="color: oklch(0.55 0.02 250);"></span>
			<span class="font-mono text-[11px]" style="color: oklch(0.55 0.02 250);">Checking for token...</span>
		</div>
	{:else if secretStatus === 'found' && !showTokenInput}
		<!-- Token found -->
		<div
			class="px-3 py-2.5 rounded-lg"
			style="background: oklch(0.20 0.06 145 / 0.3); border: 1px solid oklch(0.35 0.10 145);"
		>
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5" style="color: oklch(0.70 0.18 145);">
						<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
					</svg>
					<span class="font-mono text-[11px]" style="color: oklch(0.75 0.12 145);">
						Token found: <code style="color: oklch(0.65 0.02 250);">{secretMasked}</code>
					</span>
				</div>
				<button
					class="font-mono text-[10px] px-2 py-0.5 rounded"
					style="color: oklch(0.60 0.02 250); background: oklch(0.22 0.02 250); border: 1px solid oklch(0.30 0.02 250);"
					onclick={() => { showTokenInput = true; }}
				>
					Change
				</button>
			</div>
		</div>

		<!-- Test connection button and result -->
		<div class="space-y-2">
			<button
				class="font-mono text-[11px] px-3 py-1.5 rounded-lg flex items-center gap-2"
				style="background: oklch(0.22 0.04 220); color: oklch(0.75 0.10 220); border: 1px solid oklch(0.32 0.06 220);"
				onclick={() => testConnection(type, secretName)}
				disabled={testingConnection}
			>
				{#if testingConnection}
					<span class="loading loading-spinner loading-xs"></span>
					Testing...
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5">
						<path fill-rule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.28a.75.75 0 00-.75.75v3.955a.75.75 0 001.5 0v-2.134l.235.234a7 7 0 0011.712-3.138.75.75 0 00-1.449-.388zm1.7-5.69a.75.75 0 00-.987-.565 7 7 0 00-11.712 3.138.75.75 0 001.449.388 5.5 5.5 0 019.2-2.466l.313.311h-2.433a.75.75 0 000 1.5H15.8a.75.75 0 00.75-.75V3.778a.75.75 0 00-.538-.044z" clip-rule="evenodd" />
					</svg>
					Test Connection
				{/if}
			</button>

			{#if testResult}
				{#if testResult.success}
					<div
						class="px-3 py-2 rounded-lg"
						style="background: oklch(0.20 0.06 145 / 0.2); border: 1px solid oklch(0.30 0.08 145);"
					>
						{#if type === 'slack'}
							<p class="font-mono text-[11px]" style="color: oklch(0.75 0.10 145);">
								Connected to workspace <strong style="color: oklch(0.85 0.02 250);">"{testResult.info.workspace}"</strong>
							</p>
							<p class="font-mono text-[10px] mt-0.5" style="color: oklch(0.60 0.06 145);">
								Bot: @{testResult.info.botName}
							</p>
						{:else if type === 'gmail'}
							<p class="font-mono text-[11px]" style="color: oklch(0.75 0.10 145);">
								Connected to <strong style="color: oklch(0.85 0.02 250);">{testResult.info.email}</strong>
							</p>
							<p class="font-mono text-[10px] mt-0.5" style="color: oklch(0.60 0.06 145);">
								Folder: {testResult.info.folder} ({testResult.info.messageCount} messages)
							</p>
						{:else}
							<p class="font-mono text-[11px]" style="color: oklch(0.75 0.10 145);">
								Connected to bot <strong style="color: oklch(0.85 0.02 250);">"{testResult.info.botName}"</strong>
							</p>
							<p class="font-mono text-[10px] mt-0.5" style="color: oklch(0.60 0.06 145);">
								@{testResult.info.botUsername}
							</p>
						{/if}
					</div>
				{:else}
					<div
						class="px-3 py-2 rounded-lg"
						style="background: oklch(0.22 0.06 25 / 0.3); border: 1px solid oklch(0.35 0.08 25);"
					>
						<p class="font-mono text-[11px]" style="color: oklch(0.75 0.12 25);">
							{testResult.error}
						</p>
					</div>
				{/if}
			{/if}
		</div>
	{:else if secretStatus === 'missing' || secretStatus === 'error' || showTokenInput}
		<!-- Token missing or user clicked "Change" -->
		<div
			class="px-3 py-2.5 rounded-lg space-y-3"
			style="background: oklch(0.20 0.04 60 / 0.2); border: 1px solid oklch(0.35 0.08 60);"
		>
			{#if !showTokenInput}
				<div class="flex items-center gap-2">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5" style="color: oklch(0.75 0.15 60);">
						<path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
					</svg>
					<span class="font-mono text-[11px]" style="color: oklch(0.75 0.12 60);">
						No token found for "{secretName}"
					</span>
				</div>
			{/if}

			<div>
				<label class="font-mono text-[10px] font-semibold block mb-1" style="color: oklch(0.60 0.02 250);">
					{type === 'gmail' ? 'App Password' : 'Bot Token'}
				</label>
				<input
					type="password"
					class="input input-bordered w-full font-mono text-sm"
					placeholder={type === 'slack' ? 'xoxb-...' : type === 'gmail' ? 'xxxx xxxx xxxx xxxx' : '123456:ABC-DEF...'}
					bind:value={tokenInput}
				/>
				<p class="font-mono text-[10px] mt-1" style="color: oklch(0.45 0.02 250);">
					{#if type === 'slack'}
						Create a Slack app &rarr; OAuth &amp; Permissions &rarr; Bot User OAuth Token
					{:else if type === 'gmail'}
						Google Account &rarr; Security &rarr; 2-Step Verification &rarr; App Passwords
					{:else}
						Message @BotFather on Telegram &rarr; /newbot &rarr; copy the token
					{/if}
				</p>
			</div>

			<div class="flex gap-2">
				<button
					class="font-mono text-[11px] px-3 py-1.5 rounded-lg"
					style="background: oklch(0.35 0.12 145); color: oklch(0.95 0.02 250); border: 1px solid oklch(0.45 0.12 145);"
					onclick={() => {
						if (tokenInput.trim()) {
							saveToken(secretName, tokenInput.trim(), type);
						}
					}}
					disabled={!tokenInput.trim() || secretStatus === 'saving'}
				>
					{#if secretStatus === 'saving'}
						<span class="loading loading-spinner loading-xs"></span>
					{:else}
						Save Token
					{/if}
				</button>
				{#if showTokenInput}
					<button
						class="font-mono text-[10px] px-2 py-1 rounded"
						style="color: oklch(0.55 0.02 250);"
						onclick={() => { showTokenInput = false; tokenInput = ''; }}
					>
						Cancel
					</button>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Setup guide -->
	{#if type === 'gmail'}
		<details
			class="rounded-lg"
			style="background: oklch(0.20 0.04 25 / 0.3); border: 1px solid oklch(0.30 0.04 25);"
		>
			<summary class="cursor-pointer px-3 py-2.5 font-mono text-[11px] font-semibold select-none" style="color: oklch(0.70 0.10 25);">
				How to get a Gmail App Password
			</summary>
			<div class="px-3 pb-3 space-y-2">
				<ol class="font-mono text-[10px] space-y-1.5 list-decimal list-inside" style="color: oklch(0.60 0.02 250);">
					<li>Go to <a href="https://myaccount.google.com/security" target="_blank" rel="noopener" class="underline" style="color: oklch(0.70 0.12 25);">myaccount.google.com/security</a></li>
					<li>Enable <strong style="color: oklch(0.75 0.02 250);">2-Step Verification</strong> if not already on</li>
					<li>Go to <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener" class="underline" style="color: oklch(0.70 0.12 25);">App Passwords</a></li>
					<li>Enter a name (e.g. <code style="color: oklch(0.65 0.02 250);">JAT Ingest</code>) and click <strong style="color: oklch(0.75 0.02 250);">Create</strong></li>
					<li>Copy the 16-character password (spaces are optional)</li>
				</ol>
				<div
					class="px-2.5 py-2 rounded mt-2"
					style="background: oklch(0.18 0.02 250); border: 1px solid oklch(0.25 0.02 250);"
				>
					<p class="font-mono text-[10px]" style="color: oklch(0.55 0.02 250);">
						Also create a Gmail label (e.g. <code style="color: oklch(0.65 0.02 250);">JAT</code>) and a filter rule to route relevant emails there. Only emails in that label become tasks.
					</p>
				</div>
			</div>
		</details>
	{:else if type === 'slack'}
		<details
			class="rounded-lg"
			style="background: oklch(0.20 0.04 220 / 0.3); border: 1px solid oklch(0.30 0.04 220);"
		>
			<summary class="cursor-pointer px-3 py-2.5 font-mono text-[11px] font-semibold select-none" style="color: oklch(0.70 0.10 220);">
				How to get a Slack Bot Token
			</summary>
			<div class="px-3 pb-3 space-y-2">
				<ol class="font-mono text-[10px] space-y-1.5 list-decimal list-inside" style="color: oklch(0.60 0.02 250);">
					<li>Go to <a href="https://api.slack.com/apps" target="_blank" rel="noopener" class="underline" style="color: oklch(0.70 0.12 220);">api.slack.com/apps</a> and create a new app (or select an existing one)</li>
					<li>In the sidebar, click <strong style="color: oklch(0.75 0.02 250);">OAuth &amp; Permissions</strong></li>
					<li>Scroll to <strong style="color: oklch(0.75 0.02 250);">Bot Token Scopes</strong> and add these scopes:
						<div class="flex flex-wrap gap-1 mt-1 ml-4">
							<code class="px-1.5 py-0.5 rounded text-[9px]" style="background: oklch(0.22 0.02 250); color: oklch(0.70 0.10 220);">channels:history</code>
							<code class="px-1.5 py-0.5 rounded text-[9px]" style="background: oklch(0.22 0.02 250); color: oklch(0.70 0.10 220);">channels:read</code>
							<code class="px-1.5 py-0.5 rounded text-[9px]" style="background: oklch(0.22 0.02 250); color: oklch(0.70 0.10 220);">groups:read</code>
							<code class="px-1.5 py-0.5 rounded text-[9px]" style="background: oklch(0.22 0.02 250); color: oklch(0.70 0.10 220);">files:read</code>
							<code class="px-1.5 py-0.5 rounded text-[9px]" style="background: oklch(0.22 0.02 250); color: oklch(0.70 0.10 220);">chat:write</code>
						</div>
					</li>
					<li>Scroll back up and click <strong style="color: oklch(0.75 0.02 250);">Install to Workspace</strong> (or reinstall if updating scopes)</li>
					<li>Copy the <strong style="color: oklch(0.75 0.02 250);">Bot User OAuth Token</strong> (starts with <code style="color: oklch(0.65 0.02 250);">xoxb-</code>)</li>
				</ol>
			</div>
		</details>
	{:else}
		<details
			class="rounded-lg"
			style="background: oklch(0.20 0.04 220 / 0.3); border: 1px solid oklch(0.30 0.04 220);"
		>
			<summary class="cursor-pointer px-3 py-2.5 font-mono text-[11px] font-semibold select-none" style="color: oklch(0.70 0.10 220);">
				How to get a Telegram Bot Token
			</summary>
			<div class="px-3 pb-3 space-y-2">
				<ol class="font-mono text-[10px] space-y-1.5 list-decimal list-inside" style="color: oklch(0.60 0.02 250);">
					<li>Open Telegram and message <a href="https://t.me/BotFather" target="_blank" rel="noopener" class="underline" style="color: oklch(0.70 0.12 220);">@BotFather</a></li>
					<li>Send <code style="color: oklch(0.65 0.02 250);">/newbot</code> and follow the prompts to name your bot</li>
					<li>Copy the <strong style="color: oklch(0.75 0.02 250);">HTTP API token</strong> (looks like <code style="color: oklch(0.65 0.02 250);">123456:ABC-DEF1234...</code>)</li>
					<li>Add the bot to your group/channel and make sure it has permission to read messages</li>
				</ol>
			</div>
		</details>
	{/if}
{/snippet}

<!-- Shared step snippets -->
{#snippet projectStep()}
	<div>
		<label class="font-mono text-xs font-semibold block mb-1.5" style="color: oklch(0.65 0.02 250);">Target Project</label>
		<ProjectSelector
			projects={projectNames}
			selectedProject={project || projectNames[0] || ''}
			onProjectChange={(p) => { project = p; }}
			showColors={true}
		/>
		<p class="font-mono text-[10px] mt-1.5" style="color: oklch(0.45 0.02 250);">
			Tasks will be created in this project's task database
		</p>
	</div>
	<div>
		<label class="font-mono text-xs font-semibold block mb-1.5" style="color: oklch(0.65 0.02 250);">Source Name</label>
		<input
			type="text"
			class="input input-bordered w-full font-mono text-sm"
			placeholder={generateId() || 'auto-generated'}
			bind:value={sourceId}
		/>
		<p class="font-mono text-[10px] mt-1.5" style="color: oklch(0.45 0.02 250);">
			Internal name for this feed in the ingest config. Leave blank to auto-generate.
		</p>
	</div>
{/snippet}

{#snippet optionsStep()}
	{#if pluginMetadata?.capabilities?.realtime}
		<div>
			<label class="font-mono text-xs font-semibold block mb-1.5" style="color: oklch(0.65 0.02 250);">Connection Mode</label>
			<div class="space-y-2">
				<button
					type="button"
					class="w-full text-left px-3.5 py-2.5 rounded-lg font-mono text-xs transition-all duration-150 cursor-pointer"
					style="background: {connectionMode === 'polling' ? 'oklch(0.22 0.04 250 / 0.4)' : 'oklch(0.18 0.01 250)'}; border: 1px solid {connectionMode === 'polling' ? 'oklch(0.45 0.06 250)' : 'oklch(0.25 0.02 250)'}; color: {connectionMode === 'polling' ? 'oklch(0.85 0.04 250)' : 'oklch(0.55 0.02 250)'};"
					onclick={() => { connectionMode = 'polling'; }}
				>
					<span class="font-semibold">Polling</span>
					<span class="block text-[10px] mt-0.5" style="color: oklch(0.45 0.02 250);">Check for new messages every N seconds. Simple and reliable.</span>
				</button>
				<button
					type="button"
					class="w-full text-left px-3.5 py-2.5 rounded-lg font-mono text-xs transition-all duration-150 cursor-pointer"
					style="background: {connectionMode === 'realtime' ? 'oklch(0.22 0.04 200 / 0.4)' : 'oklch(0.18 0.01 250)'}; border: 1px solid {connectionMode === 'realtime' ? 'oklch(0.45 0.10 200)' : 'oklch(0.25 0.02 250)'}; color: {connectionMode === 'realtime' ? 'oklch(0.85 0.08 200)' : 'oklch(0.55 0.02 250)'};"
					onclick={() => { connectionMode = 'realtime'; }}
				>
					<span class="font-semibold">Realtime</span>
					<span class="block text-[10px] mt-0.5" style="color: oklch(0.45 0.02 250);">Maintain live connection, receive messages instantly. Uses more resources.</span>
				</button>
			</div>
		</div>
	{/if}
	{#if connectionMode !== 'realtime'}
	<div>
		<label class="font-mono text-xs font-semibold block mb-1.5" style="color: oklch(0.65 0.02 250);">Poll Interval (seconds)</label>
		<input
			type="number"
			class="input input-bordered w-full font-mono text-sm"
			min="10"
			max="86400"
			bind:value={pollInterval}
		/>
	</div>
	{/if}
	<div>
		<label class="font-mono text-xs font-semibold block mb-1.5" style="color: oklch(0.65 0.02 250);">Task Type</label>
		<select class="select select-bordered w-full font-mono text-sm" bind:value={taskType}>
			<option value="task">task</option>
			<option value="bug">bug</option>
			<option value="feature">feature</option>
			<option value="chore">chore</option>
		</select>
	</div>
	<div>
		<label class="font-mono text-xs font-semibold block mb-1.5" style="color: oklch(0.65 0.02 250);">Priority</label>
		<select class="select select-bordered w-full font-mono text-sm" bind:value={taskPriority}>
			<option value={0}>P0 - Critical</option>
			<option value={1}>P1 - High</option>
			<option value={2}>P2 - Medium</option>
			<option value={3}>P3 - Low</option>
			<option value={4}>P4 - Minimal</option>
		</select>
	</div>
	<div>
		<label class="font-mono text-xs font-semibold block mb-1.5" style="color: oklch(0.65 0.02 250);">Labels (comma-separated)</label>
		<input
			type="text"
			class="input input-bordered w-full font-mono text-sm"
			placeholder="from-rss, frontend"
			bind:value={taskLabels}
		/>
	</div>
	<div>
		<label class="flex items-center gap-2 cursor-pointer">
			<input type="checkbox" class="checkbox checkbox-sm" bind:checked={enabled} />
			<span class="font-mono text-xs" style="color: oklch(0.65 0.02 250);">Enable immediately</span>
		</label>
	</div>
{/snippet}

{#snippet automationStep()}
	<div class="space-y-4">
		<div>
			<h3 class="font-mono text-xs font-semibold mb-1" style="color: oklch(0.70 0.02 250);">Post-Ingest Action</h3>
			<p class="font-mono text-[10px] mb-3" style="color: oklch(0.45 0.02 250);">
				What should happen after a task is created from this source?
			</p>
		</div>

		<!-- Action selector - radio style cards -->
		<div class="space-y-2">
			<button
				type="button"
				class="w-full text-left px-3.5 py-2.5 rounded-lg font-mono text-xs transition-all duration-150 cursor-pointer"
				style="background: {autoAction === 'none' ? 'oklch(0.22 0.04 200 / 0.4)' : 'oklch(0.18 0.01 250)'}; border: 1px solid {autoAction === 'none' ? 'oklch(0.45 0.10 200)' : 'oklch(0.25 0.02 250)'}; color: {autoAction === 'none' ? 'oklch(0.85 0.08 200)' : 'oklch(0.55 0.02 250)'};"
				onclick={() => { autoAction = 'none'; }}
			>
				<span class="font-semibold">Create task only</span>
				<span class="block text-[10px] mt-0.5" style="color: oklch(0.45 0.02 250);">Task is added to the backlog. No agent is summoned.</span>
			</button>

			<button
				type="button"
				class="w-full text-left px-3.5 py-2.5 rounded-lg font-mono text-xs transition-all duration-150 cursor-pointer"
				style="background: {autoAction === 'immediate' ? 'oklch(0.22 0.04 145 / 0.4)' : 'oklch(0.18 0.01 250)'}; border: 1px solid {autoAction === 'immediate' ? 'oklch(0.45 0.10 145)' : 'oklch(0.25 0.02 250)'}; color: {autoAction === 'immediate' ? 'oklch(0.85 0.08 145)' : 'oklch(0.55 0.02 250)'};"
				onclick={() => { autoAction = 'immediate'; }}
			>
				<span class="font-semibold">Spawn agent immediately</span>
				<span class="block text-[10px] mt-0.5" style="color: oklch(0.45 0.02 250);">Create task and summon an agent to work on it right away.</span>
			</button>

			<button
				type="button"
				class="w-full text-left px-3.5 py-2.5 rounded-lg font-mono text-xs transition-all duration-150 cursor-pointer"
				style="background: {autoAction === 'schedule' ? 'oklch(0.22 0.04 60 / 0.4)' : 'oklch(0.18 0.01 250)'}; border: 1px solid {autoAction === 'schedule' ? 'oklch(0.45 0.10 60)' : 'oklch(0.25 0.02 250)'}; color: {autoAction === 'schedule' ? 'oklch(0.85 0.08 60)' : 'oklch(0.55 0.02 250)'};"
				onclick={() => { autoAction = 'schedule'; }}
			>
				<span class="font-semibold">Spawn agent on schedule</span>
				<span class="block text-[10px] mt-0.5" style="color: oklch(0.45 0.02 250);">Create task, then summon an agent at a scheduled time (e.g. 8am).</span>
			</button>

			<button
				type="button"
				class="w-full text-left px-3.5 py-2.5 rounded-lg font-mono text-xs transition-all duration-150 cursor-pointer"
				style="background: {autoAction === 'delay' ? 'oklch(0.22 0.04 280 / 0.4)' : 'oklch(0.18 0.01 250)'}; border: 1px solid {autoAction === 'delay' ? 'oklch(0.45 0.10 280)' : 'oklch(0.25 0.02 250)'}; color: {autoAction === 'delay' ? 'oklch(0.85 0.08 280)' : 'oklch(0.55 0.02 250)'};"
				onclick={() => { autoAction = 'delay'; }}
			>
				<span class="font-semibold">Spawn agent after delay</span>
				<span class="block text-[10px] mt-0.5" style="color: oklch(0.45 0.02 250);">Create task, then summon an agent after a set delay.</span>
			</button>
		</div>

		<!-- Conditional options based on action -->
		{#if autoAction !== 'none'}
			<div
				class="rounded-lg px-3.5 py-3 space-y-3"
				style="background: oklch(0.16 0.01 250); border: 1px solid oklch(0.25 0.02 250);"
			>
				<div>
					<label class="font-mono text-xs font-semibold block mb-1.5" style="color: oklch(0.65 0.02 250);">Command to run</label>
					<!-- Custom command dropdown -->
					<div class="relative" bind:this={cmdDropdownRef}>
						<button
							type="button"
							class="w-full px-3 py-2 rounded-lg font-mono text-sm text-left flex items-center justify-between transition-colors cmd-dropdown-trigger"
							onclick={() => { cmdDropdownOpen = !cmdDropdownOpen; }}
						>
							<span class="truncate" style="color: oklch(0.85 0.02 250);">{autoCommand}</span>
							<svg class="w-3.5 h-3.5 flex-shrink-0 transition-transform {cmdDropdownOpen ? 'rotate-180' : ''}" style="color: oklch(0.50 0.02 250);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
							</svg>
						</button>

						{#if cmdDropdownOpen}
							<div
								class="absolute z-50 mt-1 w-full rounded-lg overflow-hidden shadow-xl"
								style="background: oklch(0.16 0.01 250); border: 1px solid oklch(0.25 0.02 250);"
								transition:slide={{ duration: 120 }}
							>
								<!-- Search -->
								<div class="px-2.5 py-1.5 cmd-dropdown-search-border">
									<div class="relative flex items-center gap-1.5">
										<svg class="w-3 h-3 flex-shrink-0" style="color: oklch(0.45 0.02 250);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
										</svg>
										<input
											bind:this={cmdSearchInput}
											bind:value={cmdSearchQuery}
											onkeydown={(e) => {
												if (e.key === 'Escape') { cmdDropdownOpen = false; cmdSearchQuery = ''; }
											}}
											type="text"
											placeholder="Filter commands..."
											class="w-full bg-transparent text-[10px] font-mono focus:outline-none"
											style="color: oklch(0.75 0.02 250);"
											autocomplete="off"
										/>
										{#if cmdSearchQuery}
											<button type="button" onclick={() => { cmdSearchQuery = ''; cmdSearchInput?.focus(); }} style="color: oklch(0.40 0.02 250);" class="hover:opacity-80 transition-opacity">
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
											</button>
										{/if}
									</div>
								</div>

								<!-- Command list -->
								<ul class="py-0.5 max-h-[360px] overflow-y-auto">
									{#if filteredCommandsByNamespace.length > 0}
										{#each filteredCommandsByNamespace as [namespace, cmds]}
											<li class="px-3 pt-1.5 pb-0.5">
												<span class="text-[9px] font-mono font-semibold uppercase tracking-wider" style="color: oklch(0.50 0.10 250);">/{namespace}</span>
											</li>
											{#each cmds as cmd}
												<li>
													<button
														type="button"
														onclick={() => selectCommand(cmd.invocation)}
														class="w-full px-3 py-1.5 flex items-center gap-2 text-left text-[11px] font-mono transition-colors {autoCommand === cmd.invocation ? 'cmd-item-selected' : 'cmd-item-default'}"
														onmouseenter={(e) => {
															const items = e.currentTarget.closest('ul')?.querySelectorAll('.cmd-item-selected');
															items?.forEach(el => el.classList.remove('cmd-item-selected'));
														}}
													>
														<span class="truncate" style="color: oklch(0.80 0.02 250);">{cmd.invocation}</span>
														{#if autoCommand === cmd.invocation}
															<svg class="w-3 h-3 flex-shrink-0 ml-auto" style="color: oklch(0.70 0.15 145);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
														{/if}
													</button>
												</li>
											{/each}
										{/each}
									{:else}
										<li class="px-3 py-3 text-center text-[10px] font-mono" style="color: oklch(0.45 0.02 250);">No commands match "{cmdSearchQuery}"</li>
									{/if}
								</ul>
							</div>
						{/if}
					</div>
					<p class="font-mono text-[10px] mt-1" style="color: oklch(0.45 0.02 250);">
						The command the spawned agent will execute.
					</p>
				</div>

				{#if autoAction === 'schedule'}
					<div>
						<label class="font-mono text-xs font-semibold block mb-1.5" style="color: oklch(0.65 0.02 250);">Run at time</label>
						<input
							type="time"
							class="input input-bordered w-full font-mono text-sm"
							bind:value={autoSchedule}
						/>
						<p class="font-mono text-[10px] mt-1" style="color: oklch(0.45 0.02 250);">
							Agent will be summoned at this time each day (local timezone).
						</p>
					</div>
				{/if}

				{#if autoAction === 'delay'}
					<div>
						<label class="font-mono text-xs font-semibold block mb-1.5" style="color: oklch(0.65 0.02 250);">Delay</label>
						<div class="flex gap-2">
							<input
								type="number"
								class="input input-bordered flex-1 font-mono text-sm"
								min="0"
								max="1440"
								bind:value={autoDelay}
							/>
							<select class="select select-bordered font-mono text-sm w-28" bind:value={autoDelayUnit}>
								<option value="minutes">minutes</option>
								<option value="hours">hours</option>
							</select>
						</div>
						<p class="font-mono text-[10px] mt-1" style="color: oklch(0.45 0.02 250);">
							How long to wait after task creation before spawning agent.
						</p>
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/snippet}

{#snippet reviewStep()}
	<div class="space-y-3">
		<h3 class="font-mono text-xs font-semibold" style="color: oklch(0.70 0.02 250);">Review Configuration</h3>

		<div
			class="rounded-lg overflow-hidden"
			style="border: 1px solid oklch(0.25 0.02 250);"
		>
			{@render reviewRow('Type', getSourceLabel(sourceType))}
			{@render reviewRow('Source Name', sourceId || generateId())}
			{@render reviewRow('Project', project)}
			{#if pluginMetadata?.capabilities?.realtime}
				{@render reviewRow('Connection Mode', connectionMode === 'realtime' ? 'Realtime' : 'Polling')}
			{/if}
			{#if connectionMode !== 'realtime'}
				{@render reviewRow('Poll Interval', `${pollInterval}s`)}
			{/if}
			{@render reviewRow('Task Type', taskType)}
			{@render reviewRow('Priority', `P${taskPriority}`)}
			{@render reviewRow('Labels', taskLabels || '(none)')}
			{@render reviewRow('Enabled', enabled ? 'Yes' : 'No')}
			{@render reviewRow('Automation', autoAction === 'none' ? 'Create task only' : autoAction === 'immediate' ? `Spawn agent → ${autoCommand}` : autoAction === 'schedule' ? `Spawn at ${autoSchedule} → ${autoCommand}` : `Spawn after ${autoDelay} ${autoDelayUnit} → ${autoCommand}`)}

			{#if sourceType === 'rss'}
				{@render reviewRow('Feed URL', feedUrl)}
			{:else if sourceType === 'slack'}
				{@render reviewRow('Secret', slackSecretName)}
				{@render reviewRow('Channel', slackChannel)}
			{:else if sourceType === 'telegram'}
				{@render reviewRow('Secret', telegramSecretName)}
				{@render reviewRow('Chat ID', telegramChatId)}
			{:else if sourceType === 'gmail'}
				{@render reviewRow('Secret', gmailSecretName)}
				{@render reviewRow('Email', gmailImapUser)}
				{@render reviewRow('Folder', gmailFolder)}
				{#if gmailFilterFrom}
					{@render reviewRow('Filter From', gmailFilterFrom)}
				{/if}
				{#if gmailFilterSubject}
					{@render reviewRow('Filter Subject', gmailFilterSubject)}
				{/if}
				{@render reviewRow('Mark as Read', gmailMarkAsRead ? 'Yes' : 'No')}
			{:else if sourceType === 'custom'}
				{@render reviewRow('Command', customCommand)}
			{:else if isPluginType && pluginMetadata?.configFields}
				{#each pluginMetadata.configFields as field}
					{@const val = pluginFields[field.key]}
					{#if field.type === 'secret'}
						{@render reviewRow(field.label || field.key, pluginSecretMasked[field.key] || val || '(not set)')}
					{:else if field.type === 'boolean'}
						{@render reviewRow(field.label || field.key, val ? 'Yes' : 'No')}
					{:else if field.type === 'select' && field.options}
						{@const opt = field.options.find((o: any) => o.value === val)}
						{@render reviewRow(field.label || field.key, opt?.label || val || '(not set)')}
					{:else}
						{@render reviewRow(field.label || field.key, String(val || '(not set)'))}
					{/if}
				{/each}
			{/if}

			<!-- Filter conditions -->
			{#if filterConditions.length > 0}
				{@render reviewRow('Filters', `${filterConditions.length} condition${filterConditions.length > 1 ? 's' : ''}`)}
				{#each filterConditions as cond}
					{@const fieldMeta = pluginMetadata?.itemFields?.find((f: any) => f.key === cond.field)}
					{@render reviewRow('', `${fieldMeta?.label || cond.field} ${cond.operator.replace(/_/g, ' ')} ${String(cond.value)}`)}
				{/each}
			{/if}
		</div>
	</div>
{/snippet}

{#snippet pluginFieldInput(field: any)}
	<div>
		<label class="font-mono text-xs font-semibold block mb-1.5" style="color: oklch(0.65 0.02 250);">
			{field.label || field.key}
			{#if field.required}
				<span style="color: oklch(0.70 0.12 25);">*</span>
			{/if}
		</label>

		{#if field.type === 'string' || field.type === 'number'}
			<input
				type={field.type === 'number' ? 'number' : 'text'}
				class="input input-bordered w-full font-mono text-sm"
				placeholder={field.placeholder || ''}
				value={pluginFields[field.key] ?? ''}
				oninput={(e) => { pluginFields[field.key] = e.currentTarget.value; pluginFields = { ...pluginFields }; }}
			/>
		{:else if field.type === 'boolean'}
			<label class="flex items-center gap-2 cursor-pointer">
				<input
					type="checkbox"
					class="checkbox checkbox-sm"
					checked={pluginFields[field.key] === true}
					onchange={(e) => { pluginFields[field.key] = e.currentTarget.checked; pluginFields = { ...pluginFields }; }}
				/>
				<span class="font-mono text-xs" style="color: oklch(0.65 0.02 250);">{field.helpText || `Enable ${field.label || field.key}`}</span>
			</label>
		{:else if field.type === 'select' && field.options}
			<select
				class="select select-bordered w-full font-mono text-sm"
				value={pluginFields[field.key] ?? ''}
				onchange={(e) => { pluginFields[field.key] = e.currentTarget.value; pluginFields = { ...pluginFields }; }}
			>
				{#each field.options as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		{:else if field.type === 'secret'}
			<!-- Secret name input -->
			<input
				type="text"
				class="input input-bordered w-full font-mono text-sm"
				placeholder={field.key}
				value={pluginFields[field.key] ?? field.key}
				oninput={(e) => {
					pluginFields[field.key] = e.currentTarget.value;
					pluginFields = { ...pluginFields };
					// Re-check secret when name changes
					const val = e.currentTarget.value.trim();
					if (val) checkPluginSecret(field.key, val);
				}}
			/>
			<p class="font-mono text-[10px] mt-1" style="color: oklch(0.45 0.02 250);">
				Name used in <code>jat-secret</code> to retrieve the token
			</p>

			<!-- Secret status -->
			{#if pluginSecretStatus[field.key] === 'checking'}
				<div
					class="flex items-center gap-2 px-3 py-2.5 rounded-lg mt-2"
					style="background: oklch(0.20 0.02 250 / 0.5); border: 1px solid oklch(0.28 0.02 250);"
				>
					<span class="loading loading-spinner loading-xs" style="color: oklch(0.55 0.02 250);"></span>
					<span class="font-mono text-[11px]" style="color: oklch(0.55 0.02 250);">Checking for secret...</span>
				</div>
			{:else if pluginSecretStatus[field.key] === 'found' && !pluginShowTokenInput[field.key]}
				<div
					class="px-3 py-2.5 rounded-lg mt-2"
					style="background: oklch(0.20 0.06 145 / 0.3); border: 1px solid oklch(0.35 0.10 145);"
				>
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5" style="color: oklch(0.70 0.18 145);">
								<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
							</svg>
							<span class="font-mono text-[11px]" style="color: oklch(0.75 0.12 145);">
								Secret found: <code style="color: oklch(0.65 0.02 250);">{pluginSecretMasked[field.key]}</code>
							</span>
						</div>
						<button
							class="font-mono text-[10px] px-2 py-0.5 rounded"
							style="color: oklch(0.60 0.02 250); background: oklch(0.22 0.02 250); border: 1px solid oklch(0.30 0.02 250);"
							onclick={() => { pluginShowTokenInput[field.key] = true; pluginShowTokenInput = { ...pluginShowTokenInput }; }}
						>
							Change
						</button>
					</div>
				</div>
			{:else}
				<!-- Secret missing or user clicked Change -->
				<div
					class="px-3 py-2.5 rounded-lg space-y-3 mt-2"
					style="background: oklch(0.20 0.04 60 / 0.2); border: 1px solid oklch(0.35 0.08 60);"
				>
					<p class="font-mono text-[11px]" style="color: oklch(0.75 0.10 60);">
						Enter the API token/secret value:
					</p>

					{#if field.setupGuide?.length}
						<details class="mt-1">
							<summary
								class="font-mono text-[11px] cursor-pointer select-none"
								style="color: oklch(0.70 0.12 200);"
							>
								{field.setupGuideTitle || 'Setup guide'}
							</summary>
							<ol class="list-decimal list-inside space-y-1.5 mt-2 ml-1">
								{#each field.setupGuide as step}
									<li class="font-mono text-[11px] leading-relaxed" style="color: oklch(0.60 0.02 250);">
										{@html step}
									</li>
								{/each}
							</ol>
						</details>
					{/if}

					<div class="flex gap-2">
						<input
							type="password"
							class="input input-bordered input-sm flex-1 font-mono text-xs"
							placeholder="Paste token here..."
							value={pluginTokenInputs[field.key] || ''}
							oninput={(e) => { pluginTokenInputs[field.key] = e.currentTarget.value; pluginTokenInputs = { ...pluginTokenInputs }; }}
						/>
						<button
							class="btn btn-sm font-mono text-[11px]"
							style="background: oklch(0.35 0.10 145); color: oklch(0.95 0.02 250); border: 1px solid oklch(0.45 0.10 145);"
							onclick={() => {
								const secretName = (pluginFields[field.key] || field.key).trim();
								const token = (pluginTokenInputs[field.key] || '').trim();
								if (secretName && token) savePluginToken(field.key, secretName, token);
							}}
							disabled={pluginSecretStatus[field.key] === 'saving' || !(pluginTokenInputs[field.key] || '').trim()}
						>
							{#if pluginSecretStatus[field.key] === 'saving'}
								<span class="loading loading-spinner loading-xs"></span>
							{:else}
								Save
							{/if}
						</button>
					</div>
				</div>
			{/if}
		{/if}

		{#if field.helpText && field.type !== 'boolean' && field.type !== 'secret'}
			<p class="font-mono text-[10px] mt-1.5" style="color: oklch(0.45 0.02 250);">
				{field.helpText}
			</p>
		{/if}
	</div>
{/snippet}

{#snippet filtersStep()}
	<div class="space-y-3">
		<h3 class="font-mono text-xs font-semibold" style="color: oklch(0.70 0.02 250);">Item Filters</h3>
		<p class="font-mono text-[10px]" style="color: oklch(0.45 0.02 250);">
			Configure conditions to filter which items are ingested. Leave empty to ingest all items.
		</p>
		{#if pluginMetadata?.itemFields && pluginMetadata.itemFields.length > 0}
			<FilterBuilder
				itemFields={pluginMetadata.itemFields}
				conditions={filterConditions}
				defaultFilter={pluginMetadata.defaultFilter}
				onConditionsChange={(conditions) => { filterConditions = conditions; }}
			/>
		{/if}
	</div>
{/snippet}

{#snippet reviewRow(label: string, value: string)}
	<div
		class="flex items-start gap-3 px-3 py-2"
		style="border-bottom: 1px solid oklch(0.22 0.02 250);"
	>
		<span class="font-mono text-[10px] font-semibold w-24 shrink-0 pt-0.5" style="color: oklch(0.50 0.02 250);">
			{label}
		</span>
		<span class="font-mono text-xs break-all" style="color: oklch(0.75 0.02 250);">
			{value}
		</span>
	</div>
{/snippet}

<style>
	/* Command dropdown styling */
	.cmd-dropdown-trigger {
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.25 0.02 250);
	}
	.cmd-dropdown-trigger:hover {
		background: oklch(0.18 0.01 250);
		border-color: oklch(0.30 0.02 250);
	}
	.cmd-dropdown-panel {
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.25 0.02 250);
	}
	.cmd-dropdown-search-border {
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}
	.cmd-item-selected {
		background: oklch(0.20 0.02 250);
		border-left: 2px solid oklch(0.65 0.15 250);
	}
	.cmd-item-default {
		background: transparent;
		border-left: 2px solid transparent;
	}
	.cmd-item-default:hover {
		background: oklch(0.19 0.01 250);
	}
</style>
