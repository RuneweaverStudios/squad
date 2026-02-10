<script lang="ts">
	/**
	 * Integrations Page
	 *
	 * Two-tab layout: Installed (configured sources) and Available (discovered plugins).
	 * Service bar for start/stop/restart of the ingest daemon.
	 * Launches wizard drawer for setup.
	 */

	import { onMount, onDestroy } from 'svelte';
	import { fly, slide } from 'svelte/transition';
	import IngestWizard from '$lib/components/ingest/IngestWizard.svelte';
	import TaskDetailDrawer from '$lib/components/TaskDetailDrawer.svelte';
	import { loadProjects } from '$lib/stores/configStore.svelte';

	// Page-level tab
	let activeTab = $state<'installed' | 'add'>('installed');

	// State
	let sources: any[] = $state([]);
	let loading = $state(true);
	let error = $state('');

	// Available plugins state
	let plugins: any[] = $state([]);
	let pluginsLoading = $state(false);
	let pluginsError = $state('');
	let pluginsFetched = $state(false);

	// Install from git state
	let installUrl = $state('');
	let installing = $state(false);
	let installResult = $state<{ success: boolean; message: string } | null>(null);

	// Audit expand/collapse state
	let expandedSource = $state<string | null>(null);
	let auditItems = $state<Map<string, any[]>>(new Map());
	let auditTotal = $state<Map<string, number>>(new Map());
	let auditLoading = $state<Set<string>>(new Set());
	let sourceStats = $state<Record<string, { total: number; lastIngested: string | null; lastPollAt?: string | null; lastPollError?: string | null; lastPollItemsFound?: number; lastPollItemsNew?: number; lastPollDurationMs?: number }>>({});

	// Flash state for new items
	let flashingSources = $state<Set<string>>(new Set());

	// Poll history and manual poll
	let pollHistory = $state<Map<string, any[]>>(new Map());
	let pollHistoryLoading = $state<Set<string>>(new Set());
	let expandedTab = $state<Map<string, 'items' | 'polls'>>(new Map());
	let pollingSource = $state<Set<string>>(new Set());
	let pollResult = $state<Map<string, { success: boolean; message: string }>>(new Map());

	// Task detail drawer
	let selectedTaskId = $state<string | null>(null);
	let drawerOpen = $state(false);
	let statsInterval: ReturnType<typeof setInterval> | null = null;

	// Service state
	let serviceStatus = $state<'running' | 'starting' | 'stopped'>('stopped');
	let serviceAction = $state<'starting' | 'stopping' | 'restarting' | null>(null);
	let autoStart = $state(false);
	let serviceInterval: ReturnType<typeof setInterval> | null = null;

	// Wizard state
	let wizardOpen = $state(false);
	let wizardType = $state<string | null>(null);
	let wizardPluginMetadata = $state<any>(null);
	let editSource = $state<any>(null);

	// Template card definitions
	const templates = [
		{
			type: 'rss' as const,
			name: 'RSS Feed',
			description: 'Watch RSS or Atom feeds for new posts. Supports media content and image extraction.',
			icon: 'M6.503 20.752c0 1.794-1.456 3.248-3.251 3.248-1.796 0-3.252-1.454-3.252-3.248 0-1.794 1.456-3.248 3.252-3.248 1.795 0 3.251 1.454 3.251 3.248zm-6.503-12.572v4.811c6.05.062 10.96 4.966 11.022 11.009h4.817c-.062-8.71-7.118-15.758-15.839-15.82zm0-8.18v4.819c12.951.115 23.346 10.487 23.461 23.178h4.539c-.116-15.607-12.874-28.297-28-28.461z',
			color: { bg: 'oklch(0.22 0.06 45)', border: 'oklch(0.35 0.10 45)', text: 'oklch(0.80 0.12 45)', icon: 'oklch(0.70 0.15 45)' },
			hints: ['Public feeds (no auth needed)', 'Supports ETag caching', 'Images auto-extracted']
		},
		{
			type: 'slack' as const,
			name: 'Slack',
			description: 'Import messages from a Slack channel. Photos and file attachments are downloaded locally.',
			icon: 'M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z',
			color: { bg: 'oklch(0.22 0.06 310)', border: 'oklch(0.35 0.10 310)', text: 'oklch(0.80 0.12 310)', icon: 'oklch(0.70 0.15 310)' },
			hints: ['Requires Bot token (xoxb-...)', 'Parent messages only', 'Files downloaded with auth']
		},
		{
			type: 'telegram' as const,
			name: 'Telegram',
			description: 'Poll a Telegram group or channel for new messages. Photos and documents are downloaded.',
			icon: 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z',
			color: { bg: 'oklch(0.22 0.06 220)', border: 'oklch(0.35 0.10 220)', text: 'oklch(0.80 0.12 220)', icon: 'oklch(0.70 0.15 220)' },
			hints: ['Create bot via @BotFather', 'Handles media groups', 'Largest photo size used']
		},
		{
			type: 'gmail' as const,
			name: 'Gmail',
			description: 'Import emails from a Gmail label via IMAP. Attachments are saved locally. Requires an App Password.',
			icon: 'M1.5 8.67v8.58a3 3 0 003 3h15a3 3 0 003-3V8.67l-8.928 5.493a3 3 0 01-3.144 0L1.5 8.67zM22.5 6.908V6.75a3 3 0 00-3-3h-15a3 3 0 00-3 3v.158l9.714 5.978a1.5 1.5 0 001.572 0L22.5 6.908z',
			color: { bg: 'oklch(0.22 0.06 25)', border: 'oklch(0.35 0.10 25)', text: 'oklch(0.80 0.12 25)', icon: 'oklch(0.70 0.15 25)' },
			hints: ['App Password auth', 'Label-based filtering', 'Attachments saved locally']
		},
		{
			type: 'custom' as const,
			name: 'Custom',
			description: 'Run a shell command that outputs JSON items. Build your own adapter for any source.',
			icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
			color: { bg: 'oklch(0.22 0.04 250)', border: 'oklch(0.35 0.04 250)', text: 'oklch(0.80 0.04 250)', icon: 'oklch(0.65 0.04 250)' },
			hints: ['Any shell command', 'Output JSON to stdout', 'Flexible integration']
		}
	];

	// Derived
	let enabledCount = $derived(sources.filter((s) => s.enabled).length);

	onMount(async () => {
		await Promise.all([fetchSources(), loadProjects(), fetchServiceStatus(), fetchAutoStart(), fetchStats(), fetchPlugins()]);
		serviceInterval = setInterval(fetchServiceStatus, 5000);
		statsInterval = setInterval(fetchStats, 5000);
	});

	onDestroy(() => {
		if (serviceInterval) clearInterval(serviceInterval);
		if (statsInterval) clearInterval(statsInterval);
	});

	// Fetch available plugins when switching to Add Integration tab
	$effect(() => {
		if (activeTab === 'add' && !pluginsFetched) {
			fetchPlugins();
		}
	});

	async function fetchServiceStatus() {
		try {
			const resp = await fetch('/api/servers?lines=10');
			const data = await resp.json();
			if (data.success) {
				const ingest = data.sessions?.find((s: any) => s.sessionName === 'server-ingest');
				if (ingest) {
					serviceStatus = ingest.status === 'stopped' ? 'stopped' : ingest.status === 'starting' ? 'starting' : 'running';
				} else {
					serviceStatus = 'stopped';
				}
			}
		} catch {
			// Keep current status on network error
		}
		if (serviceAction === 'starting' && serviceStatus === 'running') serviceAction = null;
		if (serviceAction === 'stopping' && serviceStatus === 'stopped') serviceAction = null;
		if (serviceAction === 'restarting' && serviceStatus === 'running') serviceAction = null;
	}

	async function fetchAutoStart() {
		try {
			const resp = await fetch('/api/config/defaults');
			const data = await resp.json();
			if (data.success) {
				autoStart = data.defaults?.ingest_autostart ?? false;
			}
		} catch {
			// Ignore
		}
	}

	async function startService() {
		serviceAction = 'starting';
		try {
			const resp = await fetch('/api/servers/start', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ projectName: 'ingest' })
			});
			const data = await resp.json();
			if (data.success) {
				serviceStatus = 'starting';
			} else {
				error = data.error || 'Failed to start ingest service';
				serviceAction = null;
			}
		} catch {
			error = 'Failed to start ingest service';
			serviceAction = null;
		}
	}

	async function stopService() {
		serviceAction = 'stopping';
		try {
			await fetch('/api/servers/server-ingest', { method: 'DELETE' });
			serviceStatus = 'stopped';
			serviceAction = null;
		} catch {
			error = 'Failed to stop ingest service';
			serviceAction = null;
		}
	}

	async function restartService() {
		serviceAction = 'restarting';
		try {
			const resp = await fetch('/api/servers/server-ingest/restart', { method: 'POST' });
			const data = await resp.json();
			if (data.success) {
				serviceStatus = 'starting';
			} else {
				error = data.error || 'Failed to restart ingest service';
				serviceAction = null;
			}
		} catch {
			error = 'Failed to restart ingest service';
			serviceAction = null;
		}
	}

	async function toggleAutoStart() {
		const newValue = !autoStart;
		try {
			const resp = await fetch('/api/config/defaults', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ defaults: { ingest_autostart: newValue } })
			});
			const data = await resp.json();
			if (data.success) {
				autoStart = newValue;
				// When enabling autostart, also start the service immediately if not running
				if (newValue && serviceStatus === 'stopped') {
					await startService();
				}
			}
		} catch {
			error = 'Failed to update auto-start setting';
		}
	}

	async function fetchSources() {
		loading = true;
		try {
			const resp = await fetch('/api/integrations');
			const data = await resp.json();
			if (data.success) {
				sources = data.config.sources || [];
			}
		} catch (err) {
			error = 'Failed to load sources';
		}
		loading = false;
	}

	async function fetchPlugins() {
		pluginsLoading = true;
		pluginsError = '';
		try {
			const resp = await fetch('/api/integrations/available');
			const data = await resp.json();
			if (data.success) {
				plugins = data.plugins || [];
			} else {
				pluginsError = data.error || 'Failed to load plugins';
			}
		} catch {
			pluginsError = 'Failed to load available plugins';
		}
		pluginsLoading = false;
		pluginsFetched = true;
	}

	async function installPlugin() {
		if (!installUrl.trim()) return;
		installing = true;
		installResult = null;
		try {
			const resp = await fetch('/api/integrations/install', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ repoUrl: installUrl.trim() })
			});
			const data = await resp.json();
			if (data.success) {
				installResult = { success: true, message: `Installed ${data.plugin.name} (${data.plugin.type})` };
				installUrl = '';
				await fetchPlugins();
			} else {
				installResult = { success: false, message: data.error || 'Installation failed' };
			}
		} catch {
			installResult = { success: false, message: 'Network error during installation' };
		}
		installing = false;
		setTimeout(() => { installResult = null; }, 5000);
	}

	async function openWizard(type: string) {
		wizardType = type;
		// Look up plugin metadata for itemFields/defaultFilter (even for built-in types)
		if (!pluginsFetched) await fetchPlugins();
		const plugin = plugins.find(p => p.type === type);
		wizardPluginMetadata = plugin ? { configFields: plugin.configFields, itemFields: plugin.itemFields, defaultFilter: plugin.defaultFilter, name: plugin.name, type: plugin.type, capabilities: plugin.capabilities } : null;
		editSource = null;
		wizardOpen = true;
	}

	function openWizardForPlugin(pluginType: string) {
		wizardType = pluginType;
		// Find the plugin metadata to pass to the wizard
		const plugin = plugins.find(p => p.type === pluginType);
		wizardPluginMetadata = plugin ? { configFields: plugin.configFields, itemFields: plugin.itemFields, defaultFilter: plugin.defaultFilter, name: plugin.name, type: plugin.type, capabilities: plugin.capabilities } : null;
		editSource = null;
		wizardOpen = true;
	}

	async function openEdit(source: any) {
		wizardType = source.type;
		// Look up plugin metadata for itemFields/defaultFilter (all types, including built-in)
		if (!pluginsFetched) await fetchPlugins();
		const plugin = plugins.find(p => p.type === source.type);
		wizardPluginMetadata = plugin ? { configFields: plugin.configFields, itemFields: plugin.itemFields, defaultFilter: plugin.defaultFilter, name: plugin.name, type: plugin.type, capabilities: plugin.capabilities } : null;
		editSource = source;
		wizardOpen = true;
	}

	function closeWizard() {
		wizardOpen = false;
		wizardType = null;
		wizardPluginMetadata = null;
		editSource = null;
	}

	async function handleSave(source: any) {
		const isEdit = editSource != null;
		const method = isEdit ? 'PUT' : 'POST';

		try {
			const resp = await fetch('/api/integrations', {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(source)
			});
			const data = await resp.json();
			if (!data.success) throw new Error(data.error);

			closeWizard();
			await fetchSources();
		} catch (err) {
			throw err;
		}
	}

	async function toggleSource(source: any) {
		const updated = { ...source, enabled: !source.enabled };
		try {
			await fetch('/api/integrations', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updated)
			});
			await fetchSources();
		} catch {
			error = 'Failed to toggle source';
		}
	}

	async function deleteSource(source: any) {
		try {
			const resp = await fetch(`/api/integrations?id=${encodeURIComponent(source.id)}`, {
				method: 'DELETE'
			});
			const data = await resp.json();
			if (!data.success) throw new Error(data.error);
			await fetchSources();
		} catch {
			error = 'Failed to delete source';
		}
	}

	async function fetchStats() {
		try {
			const resp = await fetch('/api/ingest/stats');
			const data = await resp.json();
			if (data.stats) {
				const oldStats = sourceStats;
				sourceStats = data.stats;

				for (const [sourceId, stat] of Object.entries(data.stats) as [string, { total: number; lastIngested: string | null }][]) {
					const oldTotal = oldStats[sourceId]?.total ?? 0;
					if (oldTotal > 0 && stat.total > oldTotal) {
						flashingSources = new Set([...flashingSources, sourceId]);
						setTimeout(() => {
							const next = new Set(flashingSources);
							next.delete(sourceId);
							flashingSources = next;
						}, 1500);

						if (expandedSource === sourceId) {
							await fetchAuditItems(sourceId);
						}
					}
				}
			}
		} catch {
			// Stats are non-critical
		}
	}

	async function toggleAudit(sourceId: string) {
		if (expandedSource === sourceId) {
			expandedSource = null;
			return;
		}
		expandedSource = sourceId;
		if (!auditItems.has(sourceId)) {
			await fetchAuditItems(sourceId);
		}
	}

	async function fetchAuditItems(sourceId: string, offset = 0) {
		auditLoading = new Set([...auditLoading, sourceId]);
		try {
			const resp = await fetch(`/api/ingest/${encodeURIComponent(sourceId)}/items?limit=20&offset=${offset}`);
			const data = await resp.json();
			const existing = offset > 0 ? (auditItems.get(sourceId) || []) : [];
			const next = new Map(auditItems);
			next.set(sourceId, [...existing, ...data.items]);
			auditItems = next;
			const totals = new Map(auditTotal);
			totals.set(sourceId, data.total);
			auditTotal = totals;
		} catch {
			// Silently fail
		}
		const updated = new Set(auditLoading);
		updated.delete(sourceId);
		auditLoading = updated;
	}

	function setTab(sourceId: string, tab: 'items' | 'polls') {
		const next = new Map(expandedTab);
		next.set(sourceId, tab);
		expandedTab = next;
		if (tab === 'polls' && !pollHistory.has(sourceId)) {
			fetchPollHistory(sourceId);
		}
	}

	async function fetchPollHistory(sourceId: string) {
		pollHistoryLoading = new Set([...pollHistoryLoading, sourceId]);
		try {
			const resp = await fetch(`/api/ingest/${encodeURIComponent(sourceId)}/polls?limit=20`);
			const data = await resp.json();
			const next = new Map(pollHistory);
			next.set(sourceId, data.polls || []);
			pollHistory = next;
		} catch {
			// Silently fail
		}
		const updated = new Set(pollHistoryLoading);
		updated.delete(sourceId);
		pollHistoryLoading = updated;
	}

	async function triggerPoll(sourceId: string) {
		pollingSource = new Set([...pollingSource, sourceId]);
		const cleared = new Map(pollResult);
		cleared.delete(sourceId);
		pollResult = cleared;
		try {
			const resp = await fetch(`/api/ingest/${encodeURIComponent(sourceId)}/poll`, { method: 'POST' });
			const data = await resp.json();
			const next = new Map(pollResult);
			next.set(sourceId, {
				success: data.success,
				message: data.success ? 'Poll complete' : (data.error || 'Poll failed')
			});
			pollResult = next;
			await fetchStats();
			if (expandedSource === sourceId) {
				await fetchAuditItems(sourceId);
			}
			if (expandedTab.get(sourceId) === 'polls') {
				await fetchPollHistory(sourceId);
			}
			setTimeout(() => {
				const cleared = new Map(pollResult);
				cleared.delete(sourceId);
				pollResult = cleared;
			}, 3000);
		} catch {
			const next = new Map(pollResult);
			next.set(sourceId, { success: false, message: 'Network error' });
			pollResult = next;
		}
		const updated = new Set(pollingSource);
		updated.delete(sourceId);
		pollingSource = updated;
	}

	function timeAgo(dateStr: string): string {
		const now = Date.now();
		const then = new Date(dateStr + (dateStr.includes('Z') || dateStr.includes('+') ? '' : 'Z')).getTime();
		const diff = Math.max(0, now - then);
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}

	function getTypeColor(type: string): { bg: string; text: string } {
		const t = templates.find((t) => t.type === type);
		return t ? { bg: t.color.bg, text: t.color.text } : { bg: 'oklch(0.22 0.02 250)', text: 'oklch(0.70 0.02 250)' };
	}

	function getPluginIcon(type: string): { svg: string; viewBox: string; fill?: boolean; color?: string } | null {
		const plugin = plugins.find(p => p.type === type);
		return plugin?.icon || null;
	}
</script>

<svelte:head>
	<title>Integrations | JAT</title>
	<link rel="icon" href="/favicons/ingest.svg" />
</svelte:head>

<div class="flex flex-col h-full overflow-hidden">
	<!-- Header -->
	<div
		class="flex items-center justify-between px-6 py-4 shrink-0"
		style="border-bottom: 1px solid oklch(0.25 0.02 250);"
	>
		<div>
			<h1 class="font-mono text-sm font-semibold tracking-wide" style="color: oklch(0.85 0.02 250);">
				Integrations
			</h1>
			<p class="font-mono text-[10px] mt-0.5" style="color: oklch(0.45 0.02 250);">
				Watch external sources and automatically create tasks
			</p>
		</div>
		{#if sources.length > 0}
			<div class="flex items-center gap-2">
				<span class="font-mono text-[10px] px-2 py-1 rounded" style="background: oklch(0.22 0.02 250); color: oklch(0.55 0.02 250); border: 1px solid oklch(0.30 0.02 250);">
					{sources.filter((s) => s.enabled).length}/{sources.length} active
				</span>
			</div>
		{/if}
	</div>

	<!-- Service Bar -->
	<div
		class="mx-6 mt-4 mb-0 px-4 py-3 rounded-lg flex items-center gap-4 shrink-0"
		style="
			background: oklch(0.16 0.02 250);
			border: 1px solid {serviceStatus === 'running' ? 'oklch(0.30 0.10 145)' : serviceStatus === 'starting' ? 'oklch(0.30 0.10 85)' : 'oklch(0.25 0.02 250)'};
		"
	>
		<!-- Status indicator -->
		<div class="flex items-center gap-2">
			<div
				class="w-2 h-2 rounded-full shrink-0"
				class:animate-pulse={serviceStatus === 'starting' || serviceAction != null}
				style="background: {serviceStatus === 'running' ? 'oklch(0.65 0.20 145)' : serviceStatus === 'starting' ? 'oklch(0.70 0.18 85)' : 'oklch(0.40 0.02 250)'};"
			></div>
			<span class="font-mono text-xs font-semibold" style="color: oklch(0.80 0.02 250);">
				{#if serviceAction === 'starting'}
					Starting...
				{:else if serviceAction === 'stopping'}
					Stopping...
				{:else if serviceAction === 'restarting'}
					Restarting...
				{:else if serviceStatus === 'running'}
					Running
				{:else if serviceStatus === 'starting'}
					Starting
				{:else}
					Stopped
				{/if}
			</span>
		</div>

		{#if serviceStatus === 'running' && enabledCount > 0}
			<span class="font-mono text-[10px]" style="color: oklch(0.45 0.02 250);">
				polling {enabledCount} source{enabledCount !== 1 ? 's' : ''}
			</span>
		{/if}

		<div class="flex-1"></div>

		<!-- Controls -->
		<div class="flex items-center gap-2">
			{#if serviceStatus === 'stopped' && !serviceAction}
				<button
					class="font-mono text-[10px] font-semibold px-3 py-1.5 rounded transition-colors duration-150 cursor-pointer"
					style="background: oklch(0.30 0.10 145); color: oklch(0.85 0.15 145); border: 1px solid oklch(0.40 0.12 145);"
					onclick={startService}
				>
					Start
				</button>
			{:else if serviceStatus !== 'stopped'}
				<button
					class="font-mono text-[10px] font-semibold px-3 py-1.5 rounded transition-colors duration-150 cursor-pointer"
					style="background: oklch(0.22 0.02 250); color: oklch(0.60 0.02 250); border: 1px solid oklch(0.30 0.02 250);"
					onclick={stopService}
					disabled={serviceAction != null}
				>
					Stop
				</button>
				<button
					class="font-mono text-[10px] font-semibold px-3 py-1.5 rounded transition-colors duration-150 cursor-pointer"
					style="background: oklch(0.22 0.02 250); color: oklch(0.60 0.02 250); border: 1px solid oklch(0.30 0.02 250);"
					onclick={restartService}
					disabled={serviceAction != null}
				>
					Restart
				</button>
			{/if}

			<!-- Auto-start toggle -->
			<div
				class="flex items-center gap-1.5 ml-2 pl-3"
				style="border-left: 1px solid oklch(0.25 0.02 250);"
			>
				<span class="font-mono text-[10px]" style="color: oklch(0.45 0.02 250);">Auto-start</span>
				<button
					class="w-8 h-4 rounded-full relative transition-colors duration-200 cursor-pointer"
					style="background: {autoStart ? 'oklch(0.45 0.15 145)' : 'oklch(0.25 0.02 250)'}; border: 1px solid {autoStart ? 'oklch(0.55 0.15 145)' : 'oklch(0.30 0.02 250)'};"
					onclick={toggleAutoStart}
					title={autoStart ? 'Disable auto-start on IDE launch' : 'Enable auto-start on IDE launch'}
				>
					<div
						class="w-3 h-3 rounded-full absolute top-0.5 transition-all duration-200"
						style="background: {autoStart ? 'oklch(0.80 0.15 145)' : 'oklch(0.40 0.02 250)'}; left: {autoStart ? '14px' : '2px'};"
					></div>
				</button>
			</div>
		</div>
	</div>

	<!-- Tab Switcher -->
	<div class="flex items-center gap-0 px-6 mt-4 shrink-0" style="border-bottom: 1px solid oklch(0.22 0.02 250);">
		<button
			class="font-mono text-xs font-semibold px-4 py-2.5 cursor-pointer transition-colors duration-100"
			style="
				color: {activeTab === 'installed' ? 'oklch(0.85 0.02 250)' : 'oklch(0.50 0.02 250)'};
				border-bottom: 2px solid {activeTab === 'installed' ? 'oklch(0.60 0.15 200)' : 'transparent'};
			"
			onclick={() => activeTab = 'installed'}
		>
			Installed
			{#if sources.length > 0}
				<span
					class="ml-1.5 font-mono text-[9px] px-1.5 py-0.5 rounded"
					style="background: oklch(0.22 0.04 250); color: oklch(0.55 0.02 250);"
				>
					{sources.length}
				</span>
			{/if}
		</button>
		<button
			class="font-mono text-xs font-semibold px-4 py-2.5 cursor-pointer transition-colors duration-100"
			style="
				color: {activeTab === 'add' ? 'oklch(0.85 0.02 250)' : 'oklch(0.50 0.02 250)'};
				border-bottom: 2px solid {activeTab === 'add' ? 'oklch(0.60 0.15 200)' : 'transparent'};
			"
			onclick={() => activeTab = 'add'}
		>
			Add Integration
		</button>
	</div>

	<!-- Tab Content -->
	<div class="flex-1 overflow-y-auto px-6 py-5">
		{#if activeTab === 'installed'}
			<!-- ==================== INSTALLED TAB ==================== -->

			<!-- Configured Sources -->
			{#if loading}
				<div class="space-y-3">
					{#each [1, 2] as _}
						<div class="h-16 rounded-lg animate-pulse" style="background: oklch(0.20 0.02 250);"></div>
					{/each}
				</div>
			{:else if sources.length > 0}
				<div>
					<div class="space-y-2">
						{#each [...sources].sort((a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0)) as source, i (source.id)}
							{@const colors = getTypeColor(source.type)}
							{@const tmpl = templates.find(t => t.type === source.type)}
							{@const isExpanded = expandedSource === source.id}
							{@const stats = sourceStats[source.id]}
							{@const itemCount = stats?.total ?? 0}
							<div
								class="rounded-lg overflow-hidden transition-all duration-150"
								style="
									background: oklch(0.18 0.02 250);
									border: 1px solid {isExpanded ? 'oklch(0.30 0.04 250)' : 'oklch(0.25 0.02 250)'};
								"
								transition:fly={{ y: 10, duration: 150, delay: i * 30 }}
							>
								<!-- Source card header (clickable) -->
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-100"
									style="background: {isExpanded ? 'oklch(0.19 0.02 250)' : 'transparent'};"
									onclick={() => toggleAudit(source.id)}
								>
									<!-- Type icon -->
									<div
										class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
										style="background: {colors.bg}; border: 1px solid oklch(0.30 0.04 250);"
									>
										{#if tmpl}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												fill={tmpl.type === 'custom' ? 'none' : 'currentColor'}
												viewBox="0 0 24 24"
												stroke={tmpl.type === 'custom' ? 'currentColor' : 'none'}
												stroke-width={tmpl.type === 'custom' ? '1.5' : '0'}
												class="w-4 h-4"
												style="color: {tmpl.color.icon};"
											>
												<path stroke-linecap="round" stroke-linejoin="round" d={tmpl.icon} />
											</svg>
										{:else}
											{@const pluginIcon = getPluginIcon(source.type)}
											{#if pluginIcon}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													fill={pluginIcon.fill ? 'currentColor' : 'none'}
													viewBox={pluginIcon.viewBox || '0 0 24 24'}
													stroke={pluginIcon.fill ? 'none' : 'currentColor'}
													stroke-width={pluginIcon.fill ? '0' : '1.5'}
													class="w-4 h-4"
													style="color: {pluginIcon.color || 'oklch(0.60 0.10 200)'};"
												>
													<path stroke-linecap="round" stroke-linejoin="round" d={pluginIcon.svg} />
												</svg>
											{:else}
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4" style="color: oklch(0.60 0.10 200);">
													<path stroke-linecap="round" stroke-linejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z" />
												</svg>
											{/if}
										{/if}
									</div>

									<!-- Source info -->
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-2">
											<span class="font-mono text-xs font-semibold truncate" style="color: oklch(0.80 0.02 250);">
												{source.id}
											</span>
											{#if !source.enabled}
												<span
													class="font-mono text-[9px] px-1.5 py-0.5 rounded"
													style="background: oklch(0.22 0.02 250); color: oklch(0.45 0.02 250);"
												>
													disabled
												</span>
											{/if}
											{#if source.connectionMode === 'realtime'}
												<span
													class="font-mono text-[8px] px-1.5 py-0.5 rounded"
													style="background: oklch(0.22 0.06 200); color: oklch(0.65 0.12 200);"
												>
													Realtime
												</span>
											{:else}
												<span
													class="font-mono text-[8px] px-1.5 py-0.5 rounded"
													style="background: oklch(0.20 0.03 250); color: oklch(0.50 0.03 250);"
												>
													Polling
												</span>
											{/if}
										</div>
										<span class="font-mono text-[10px]" style="color: oklch(0.45 0.02 250);">
											{source.project}
											{#if source.feedUrl}
												&middot; {source.feedUrl.replace(/^https?:\/\//, '').slice(0, 40)}
											{:else if source.channel}
												&middot; {source.channel}
											{:else if source.chatId}
												&middot; {source.chatId}
											{:else if source.imapUser}
												&middot; {source.imapUser}{source.folder ? ` / ${source.folder}` : ''}
											{/if}
											{#if source.connectionMode === 'realtime'}
												&middot; realtime
											{:else}
												&middot; {source.pollInterval || 60}s
											{/if}
										</span>
									</div>

									<!-- Item count -->
									{#if itemCount > 0}
										{@const isFlashing = flashingSources.has(source.id)}
										<span
											class="font-mono text-[10px] px-2 py-0.5 rounded shrink-0 transition-all duration-300"
											style="
												background: {isFlashing ? 'oklch(0.35 0.15 145)' : 'oklch(0.22 0.03 250)'};
												color: {isFlashing ? 'oklch(0.90 0.15 145)' : 'oklch(0.55 0.02 250)'};
												box-shadow: {isFlashing ? '0 0 12px oklch(0.50 0.18 145 / 0.6)' : 'none'};
											"
										>
											{itemCount} item{itemCount !== 1 ? 's' : ''}
										</span>
									{/if}

									<!-- Last poll info -->
									{#if stats?.lastPollAt}
										<span class="font-mono text-[9px] shrink-0" style="color: oklch(0.40 0.02 250);">
											polled {timeAgo(stats.lastPollAt)}
										</span>
									{/if}
									{#if stats?.lastPollError}
										<span
											class="w-2 h-2 rounded-full shrink-0"
											title="Last poll error: {stats.lastPollError}"
											style="background: oklch(0.55 0.18 25);"
										></span>
									{/if}

									<!-- Chevron -->
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 20 20"
										fill="currentColor"
										class="w-4 h-4 shrink-0 transition-transform duration-200"
										style="color: oklch(0.40 0.02 250); transform: rotate({isExpanded ? 180 : 0}deg);"
									>
										<path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
									</svg>

									<!-- Actions (stop propagation so clicks don't toggle expand) -->
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div class="flex items-center gap-1 shrink-0" onclick={(e) => e.stopPropagation()}>
										<!-- Toggle -->
										<button
											class="btn btn-xs btn-ghost"
											onclick={() => toggleSource(source)}
											title={source.enabled ? 'Disable' : 'Enable'}
											style="color: {source.enabled ? 'oklch(0.65 0.15 145)' : 'oklch(0.45 0.02 250)'};"
										>
											{#if source.enabled}
												<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
													<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
												</svg>
											{:else}
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
													<circle cx="12" cy="12" r="9" />
												</svg>
											{/if}
										</button>

										<!-- Edit -->
										<button
											class="btn btn-xs btn-ghost"
											onclick={() => openEdit(source)}
											title="Edit"
											style="color: oklch(0.55 0.02 250);"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
											</svg>
										</button>

										<!-- Delete -->
										<button
											class="btn btn-xs btn-ghost"
											onclick={() => deleteSource(source)}
											title="Delete"
											style="color: oklch(0.50 0.08 25);"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
											</svg>
										</button>

										<!-- Poll Now -->
										<button
											class="btn btn-xs btn-ghost"
											onclick={() => triggerPoll(source.id)}
											disabled={pollingSource.has(source.id)}
											title="Poll now"
											style="color: oklch(0.55 0.08 200);"
										>
											{#if pollingSource.has(source.id)}
												<svg class="w-3.5 h-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
													<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
													<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
												</svg>
											{:else}
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5">
													<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
												</svg>
											{/if}
										</button>
										{#if pollResult.has(source.id)}
											{@const result = pollResult.get(source.id)}
											<span
												class="font-mono text-[9px] px-1.5 py-0.5 rounded shrink-0"
												style="
													background: {result?.success ? 'oklch(0.22 0.08 145)' : 'oklch(0.22 0.08 25)'};
													color: {result?.success ? 'oklch(0.65 0.15 145)' : 'oklch(0.65 0.15 25)'};
												"
											>
												{result?.message}
											</span>
										{/if}
									</div>
								</div>

								<!-- Expanded audit panel -->
								{#if isExpanded}
									<div
										transition:slide={{ duration: 200 }}
										style="border-top: 1px solid oklch(0.22 0.02 250); background: oklch(0.15 0.02 250);"
									>
										<!-- Tab switcher -->
										<div class="flex items-center gap-0 px-4 pt-2" style="border-bottom: 1px solid oklch(0.20 0.02 250);">
											<button
												class="font-mono text-[10px] font-semibold px-3 py-1.5 rounded-t cursor-pointer transition-colors duration-100"
												style="
													color: {(expandedTab.get(source.id) || 'items') === 'items' ? 'oklch(0.80 0.02 250)' : 'oklch(0.45 0.02 250)'};
													background: {(expandedTab.get(source.id) || 'items') === 'items' ? 'oklch(0.18 0.02 250)' : 'transparent'};
													border-bottom: 2px solid {(expandedTab.get(source.id) || 'items') === 'items' ? 'oklch(0.55 0.12 200)' : 'transparent'};
												"
												onclick={() => setTab(source.id, 'items')}
											>
												Items
											</button>
											<button
												class="font-mono text-[10px] font-semibold px-3 py-1.5 rounded-t cursor-pointer transition-colors duration-100"
												style="
													color: {expandedTab.get(source.id) === 'polls' ? 'oklch(0.80 0.02 250)' : 'oklch(0.45 0.02 250)'};
													background: {expandedTab.get(source.id) === 'polls' ? 'oklch(0.18 0.02 250)' : 'transparent'};
													border-bottom: 2px solid {expandedTab.get(source.id) === 'polls' ? 'oklch(0.55 0.12 200)' : 'transparent'};
												"
												onclick={() => setTab(source.id, 'polls')}
											>
												Polls
											</button>
										</div>

										{#if (expandedTab.get(source.id) || 'items') === 'items'}
										{#if auditLoading.has(source.id)}
											<div class="px-4 py-3 space-y-2">
												{#each [1, 2, 3] as _}
													<div class="flex items-center gap-3">
														<div class="h-3 w-12 rounded animate-pulse" style="background: oklch(0.22 0.02 250);"></div>
														<div class="h-3 flex-1 rounded animate-pulse" style="background: oklch(0.22 0.02 250);"></div>
														<div class="h-3 w-16 rounded animate-pulse" style="background: oklch(0.22 0.02 250);"></div>
													</div>
												{/each}
											</div>
										{:else if (auditItems.get(source.id) || []).length === 0}
											<div class="px-4 py-4 text-center">
												<span class="font-mono text-[10px]" style="color: oklch(0.40 0.02 250);">No ingested items yet</span>
											</div>
										{:else}
											{@const items = auditItems.get(source.id) || []}
											{@const total = auditTotal.get(source.id) || 0}
											<div class="px-4 py-2">
												<div class="space-y-0">
													{#each items as item}
														<button
															class="flex items-center gap-3 py-1.5 w-full text-left transition-colors duration-100"
															style="border-bottom: 1px solid oklch(0.20 0.02 250); cursor: {item.task_id ? 'pointer' : 'default'};"
															onmouseenter={(e) => { if (item.task_id) e.currentTarget.style.background = 'oklch(0.20 0.03 250)'; }}
															onmouseleave={(e) => { e.currentTarget.style.background = 'transparent'; }}
															onclick={(e) => {
																e.stopPropagation();
																if (item.task_id) {
																	selectedTaskId = item.task_id;
																	drawerOpen = true;
																}
															}}
														>
															<span
																class="font-mono text-[9px] w-14 shrink-0 text-right"
																style="color: oklch(0.42 0.02 250);"
															>
																{timeAgo(item.ingested_at)}
															</span>

															<span
																class="font-mono text-[10px] flex-1 truncate"
																style="color: oklch(0.65 0.02 250);"
																title={item.title || '(no title)'}
															>
																{item.title || '(no title)'}
															</span>

															{#if item.task_id}
																<span
																	class="font-mono text-[9px] px-1.5 py-0.5 rounded shrink-0"
																	style="background: oklch(0.22 0.08 145); color: oklch(0.65 0.15 145); border: 1px solid oklch(0.30 0.08 145);"
																>
																	{item.task_id}
																</span>
															{:else}
																<span
																	class="font-mono text-[9px] px-1.5 py-0.5 rounded shrink-0"
																	style="background: oklch(0.22 0.04 250); color: oklch(0.42 0.02 250);"
																>
																	no task
																</span>
															{/if}

															{#if item.reply_count > 0}
																<span
																	class="font-mono text-[9px] px-1.5 py-0.5 rounded shrink-0 flex items-center gap-0.5"
																	style="background: oklch(0.22 0.06 200); color: oklch(0.60 0.10 200);"
																	title="{item.reply_count} replies{item.thread_active ? ' (active)' : ''}"
																>
																	<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-2.5 h-2.5">
																		<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
																	</svg>
																	{item.reply_count}
																</span>
															{/if}
														</button>
													{/each}
												</div>

												{#if items.length < total}
													<div class="pt-2 pb-1 text-center">
														<button
															class="font-mono text-[10px] font-semibold px-3 py-1 rounded cursor-pointer transition-colors duration-150"
															style="background: oklch(0.22 0.02 250); color: oklch(0.55 0.02 250); border: 1px solid oklch(0.28 0.02 250);"
															onclick={(e) => { e.stopPropagation(); fetchAuditItems(source.id, items.length); }}
														>
															Load more ({total - items.length} remaining)
														</button>
													</div>
												{/if}
											</div>
										{/if}
										{/if}

										<!-- Polls tab -->
										{#if expandedTab.get(source.id) === 'polls'}
											{#if pollHistoryLoading.has(source.id)}
												<div class="px-4 py-3 space-y-2">
													{#each [1, 2, 3] as _}
														<div class="flex items-center gap-3">
															<div class="h-3 w-16 rounded animate-pulse" style="background: oklch(0.22 0.02 250);"></div>
															<div class="h-3 flex-1 rounded animate-pulse" style="background: oklch(0.22 0.02 250);"></div>
														</div>
													{/each}
												</div>
											{:else if (pollHistory.get(source.id) || []).length === 0}
												<div class="px-4 py-4 text-center">
													<span class="font-mono text-[10px]" style="color: oklch(0.40 0.02 250);">No poll history yet</span>
												</div>
											{:else}
												{@const polls = pollHistory.get(source.id) || []}
												<div class="px-4 py-2 space-y-0">
													{#each polls as poll}
														<div
															class="flex items-center gap-3 py-1.5"
															style="border-bottom: 1px solid oklch(0.20 0.02 250);"
														>
															<span class="font-mono text-[9px] w-14 shrink-0 text-right" style="color: oklch(0.42 0.02 250);">
																{timeAgo(poll.poll_at)}
															</span>

															<span
																class="w-1.5 h-1.5 rounded-full shrink-0"
																style="background: {poll.error ? 'oklch(0.55 0.18 25)' : 'oklch(0.55 0.18 145)'};"
															></span>

															<span class="font-mono text-[10px] flex-1" style="color: oklch(0.60 0.02 250);">
																{#if poll.error}
																	<span style="color: oklch(0.60 0.12 25);" title={poll.error}>Error: {poll.error.slice(0, 50)}{poll.error.length > 50 ? '...' : ''}</span>
																{:else}
																	{poll.items_found} found, {poll.items_new} new
																{/if}
															</span>

															{#if poll.duration_ms}
																<span class="font-mono text-[9px] shrink-0" style="color: oklch(0.38 0.02 250);">
																	{poll.duration_ms < 1000 ? `${poll.duration_ms}ms` : `${(poll.duration_ms / 1000).toFixed(1)}s`}
																</span>
															{/if}
														</div>
													{/each}
												</div>
											{/if}
										{/if}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{:else}
				<div
					class="text-center py-12 rounded-lg"
					style="background: oklch(0.16 0.02 250); border: 1px dashed oklch(0.28 0.02 250);"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" class="w-8 h-8 mx-auto mb-3" style="color: oklch(0.35 0.02 250);">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
					</svg>
					<p class="font-mono text-xs mb-3" style="color: oklch(0.45 0.02 250);">
						No sources configured yet.
					</p>
					<button
						class="font-mono text-[10px] font-semibold px-4 py-2 rounded cursor-pointer transition-colors duration-150"
						style="background: oklch(0.30 0.10 200); color: oklch(0.90 0.10 200); border: 1px solid oklch(0.40 0.12 200);"
						onclick={() => activeTab = 'add'}
					>
						Add Integration
					</button>
				</div>
			{/if}

		{:else}
			<!-- ==================== ADD INTEGRATION TAB ==================== -->

			<!-- Install from Git URL -->
			<div
				class="mb-6 px-4 py-4 rounded-lg"
				style="background: oklch(0.16 0.02 250); border: 1px solid oklch(0.25 0.02 250);"
			>
				<h2 class="font-mono text-[10px] font-semibold tracking-widest uppercase mb-3" style="color: oklch(0.45 0.02 250);">
					Install from Git
				</h2>
				<div class="flex items-center gap-2">
					<input
						type="text"
						bind:value={installUrl}
						placeholder="https://github.com/user/jat-ingest-cloudflare"
						class="font-mono text-xs flex-1 px-3 py-2 rounded"
						style="
							background: oklch(0.14 0.02 250);
							color: oklch(0.80 0.02 250);
							border: 1px solid oklch(0.28 0.02 250);
							outline: none;
						"
						onfocus={(e) => e.currentTarget.style.borderColor = 'oklch(0.40 0.10 200)'}
						onblur={(e) => e.currentTarget.style.borderColor = 'oklch(0.28 0.02 250)'}
						onkeydown={(e) => { if (e.key === 'Enter') installPlugin(); }}
					/>
					<button
						class="font-mono text-[10px] font-semibold px-4 py-2 rounded transition-colors duration-150 cursor-pointer shrink-0"
						style="
							background: {installing ? 'oklch(0.22 0.02 250)' : 'oklch(0.30 0.10 200)'};
							color: {installing ? 'oklch(0.50 0.02 250)' : 'oklch(0.90 0.10 200)'};
							border: 1px solid {installing ? 'oklch(0.28 0.02 250)' : 'oklch(0.40 0.12 200)'};
						"
						onclick={installPlugin}
						disabled={installing || !installUrl.trim()}
					>
						{#if installing}
							<span class="flex items-center gap-1.5">
								<svg class="w-3 h-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
								</svg>
								Installing...
							</span>
						{:else}
							Install
						{/if}
					</button>
				</div>
				{#if installResult}
					<div
						class="mt-2 px-3 py-1.5 rounded font-mono text-[10px]"
						style="
							background: {installResult.success ? 'oklch(0.22 0.08 145)' : 'oklch(0.22 0.08 25)'};
							color: {installResult.success ? 'oklch(0.70 0.15 145)' : 'oklch(0.70 0.15 25)'};
							border: 1px solid {installResult.success ? 'oklch(0.30 0.08 145)' : 'oklch(0.30 0.08 25)'};
						"
					>
						{installResult.message}
					</div>
				{/if}
			</div>

			<!-- Unified Adapters Grid -->
			{#if pluginsLoading}
				<div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));">
					{#each [1, 2, 3, 4, 5] as _}
						<div class="h-40 rounded-lg animate-pulse" style="background: oklch(0.20 0.02 250);"></div>
					{/each}
				</div>
			{:else if pluginsError}
				<div
					class="text-center py-8 rounded-lg"
					style="background: oklch(0.16 0.02 250); border: 1px solid oklch(0.30 0.08 25);"
				>
					<p class="font-mono text-xs" style="color: oklch(0.65 0.12 25);">{pluginsError}</p>
					<button
						class="font-mono text-[10px] font-semibold px-3 py-1.5 rounded mt-3 cursor-pointer"
						style="background: oklch(0.22 0.02 250); color: oklch(0.60 0.02 250); border: 1px solid oklch(0.30 0.02 250);"
						onclick={fetchPlugins}
					>
						Retry
					</button>
				</div>
			{:else}
				<div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));">
					<!-- Render each plugin as a rich card -->
					{#each plugins as plugin}
						{@const tmpl = templates.find(t => t.type === plugin.type)}
						{@const isConfigured = sources.some(s => s.type === plugin.type)}
						{@const color = tmpl?.color || {
							bg: plugin.icon?.color ? 'oklch(0.22 0.06 45)' : 'oklch(0.22 0.04 250)',
							border: plugin.icon?.color ? 'oklch(0.30 0.08 45)' : 'oklch(0.30 0.04 250)',
							text: 'oklch(0.75 0.02 250)',
							icon: plugin.icon?.color || 'oklch(0.60 0.04 250)'
						}}
						<button
							class="group flex flex-col rounded-lg overflow-hidden text-left transition-all duration-200 cursor-pointer"
							style="
								background: {color.bg};
								border: 1px solid {color.border};
							"
							onclick={() => tmpl ? openWizard(plugin.type) : openWizardForPlugin(plugin.type)}
						>
							<div class="px-4 pt-4 pb-3 flex items-start gap-3">
								<div
									class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110"
									style="background: {color.border};"
								>
									{#if tmpl}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											fill={tmpl.type === 'custom' ? 'none' : 'currentColor'}
											viewBox="0 0 24 24"
											stroke={tmpl.type === 'custom' ? 'currentColor' : 'none'}
											stroke-width={tmpl.type === 'custom' ? '1.5' : '0'}
											class="w-4 h-4"
											style="color: {color.icon};"
										>
											<path stroke-linecap="round" stroke-linejoin="round" d={tmpl.icon} />
										</svg>
									{:else if plugin.icon}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											fill={plugin.icon.fill ? 'currentColor' : 'none'}
											viewBox={plugin.icon.viewBox || '0 0 24 24'}
											stroke={plugin.icon.fill ? 'none' : 'currentColor'}
											stroke-width={plugin.icon.fill ? '0' : '1.5'}
											class="w-4 h-4"
											style="color: {plugin.icon.color || color.icon};"
										>
											<path stroke-linecap="round" stroke-linejoin="round" d={plugin.icon.svg} />
										</svg>
									{:else}
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4" style="color: {color.icon};">
											<path stroke-linecap="round" stroke-linejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z" />
										</svg>
									{/if}
								</div>
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2">
										<h3 class="font-mono text-xs font-semibold" style="color: {color.text};">
											{plugin.name || tmpl?.name || plugin.type}
										</h3>
										{#if isConfigured}
											<span
												class="font-mono text-[8px] px-1.5 py-0.5 rounded"
												style="background: oklch(0.22 0.06 145); color: oklch(0.60 0.12 145);"
											>
												configured
											</span>
										{/if}
										{#if !plugin.isBuiltin}
											<span
												class="font-mono text-[8px] px-1.5 py-0.5 rounded"
												style="background: oklch(0.22 0.06 280); color: oklch(0.60 0.10 280);"
											>
												plugin
											</span>
										{/if}
									</div>
									<!-- Capability badges -->
									<div class="flex items-center gap-1 mt-1">
										<span
											class="font-mono text-[8px] px-1.5 py-0.5 rounded"
											style="background: oklch(0.20 0.04 250); color: oklch(0.55 0.04 250);"
										>
											Polling
										</span>
										{#if plugin.capabilities?.realtime}
											<span
												class="font-mono text-[8px] px-1.5 py-0.5 rounded"
												style="background: oklch(0.22 0.06 200); color: oklch(0.65 0.12 200);"
											>
												Realtime
											</span>
										{/if}
										{#if plugin.capabilities?.send}
											<span
												class="font-mono text-[8px] px-1.5 py-0.5 rounded"
												style="background: oklch(0.22 0.06 145); color: oklch(0.65 0.12 145);"
											>
												Two-Way
											</span>
										{/if}
									</div>
									<p class="font-mono text-[10px] mt-1 leading-relaxed" style="color: {color.text}; opacity: 0.6;">
										{plugin.description || tmpl?.description || 'No description'}
									</p>
								</div>
							</div>

							{#if tmpl?.hints}
								<div class="px-4 pb-3 flex flex-wrap gap-1">
									{#each tmpl.hints as hint}
										<span
											class="font-mono text-[9px] px-1.5 py-0.5 rounded"
											style="background: oklch(0.18 0.02 250 / 0.5); color: {color.text}; opacity: 0.5;"
										>
											{hint}
										</span>
									{/each}
								</div>
							{:else if plugin.version}
								<div class="px-4 pb-3">
									<span class="font-mono text-[9px]" style="color: oklch(0.40 0.02 250);">
										v{plugin.version}
									</span>
								</div>
							{/if}

							{#if !plugin.enabled && plugin.error}
								<div
									class="mx-4 mb-2 px-2.5 py-1.5 rounded font-mono text-[9px]"
									style="background: oklch(0.20 0.06 25); color: oklch(0.60 0.10 25);"
								>
									{plugin.error}
								</div>
							{/if}

							<div
								class="px-4 py-2.5 flex items-center gap-1.5 transition-all duration-200 mt-auto"
								style="
									background: oklch(0.15 0.02 250 / 0.5);
									border-top: 1px solid {color.border};
									color: {color.text};
									opacity: 0.7;
								"
							>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5">
									<path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
								</svg>
								<span class="font-mono text-[10px] font-semibold">Add {plugin.name || tmpl?.name || plugin.type}</span>
							</div>
						</button>
					{/each}
				</div>

				{#if plugins.length === 0}
					<div
						class="text-center py-12 rounded-lg"
						style="background: oklch(0.16 0.02 250); border: 1px dashed oklch(0.28 0.02 250);"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" class="w-8 h-8 mx-auto mb-3" style="color: oklch(0.35 0.02 250);">
							<path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
						</svg>
						<p class="font-mono text-xs" style="color: oklch(0.45 0.02 250);">
							No adapters discovered. Install one from a git URL above.
						</p>
					</div>
				{/if}
			{/if}

			<!-- Create Your Own -->
			<details
				class="mt-6 rounded-lg overflow-hidden"
				style="background: oklch(0.16 0.02 250); border: 1px solid oklch(0.25 0.02 250);"
			>
				<summary
					class="flex items-center gap-2 px-4 py-3 cursor-pointer font-mono text-[10px] font-semibold tracking-widest uppercase select-none"
					style="color: oklch(0.50 0.02 250);"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 shrink-0" style="color: oklch(0.45 0.06 200);">
						<path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" />
					</svg>
					Create Your Own Integration
				</summary>
				<div class="px-4 pb-4 space-y-3" style="border-top: 1px solid oklch(0.22 0.02 250);">
					<p class="font-mono text-[10px] leading-relaxed pt-3" style="color: oklch(0.55 0.02 250);">
						An integration is a single JavaScript file that extends <code class="px-1 py-0.5 rounded" style="background: oklch(0.20 0.02 250); color: oklch(0.65 0.06 200);">BaseAdapter</code> and exports a <code class="px-1 py-0.5 rounded" style="background: oklch(0.20 0.02 250); color: oklch(0.65 0.06 200);">metadata</code> object. Drop it in a folder and it works.
					</p>

					<!-- Minimal example -->
					<div class="rounded-lg overflow-hidden" style="border: 1px solid oklch(0.22 0.02 250);">
						<div class="px-3 py-1.5 font-mono text-[9px] font-semibold" style="background: oklch(0.14 0.02 250); color: oklch(0.45 0.02 250);">
							my-adapter/index.js
						</div>
						<pre
							class="px-3 py-2 font-mono text-[10px] leading-relaxed overflow-x-auto"
							style="background: oklch(0.12 0.02 250); color: oklch(0.60 0.02 250); margin: 0;"
						>{`import { BaseAdapter } from '../base.js';

export const metadata = {
  type: 'my-source',
  name: 'My Source',
  description: 'Polls my data source for new items',
  version: '1.0.0',
  configFields: [
    { key: 'apiUrl', label: 'API URL', type: 'string', required: true },
    { key: 'token', label: 'API Token', type: 'secret' }
  ],
  itemFields: [
    { key: 'category', label: 'Category', type: 'enum', values: ['news', 'update'] }
  ]
};

export default class MyAdapter extends BaseAdapter {
  constructor() { super(metadata.type); }

  async poll(source, state, getSecret) {
    // Fetch items, return { items: [...], state: {...} }
  }

  async test(source, getSecret) {
    // Return { ok: true, message: 'Connected', sampleItems: [] }
  }
}`}</pre>
					</div>

					<!-- Where to put it -->
					<div class="flex flex-col gap-2">
						<div class="flex items-start gap-2">
							<span class="font-mono text-[10px] font-semibold shrink-0 mt-0.5" style="color: oklch(0.55 0.06 200);">Local:</span>
							<span class="font-mono text-[10px]" style="color: oklch(0.50 0.02 250);">
								Place your adapter folder in <code class="px-1 py-0.5 rounded" style="background: oklch(0.20 0.02 250); color: oklch(0.65 0.04 250);">~/.config/jat/ingest-plugins/</code>
							</span>
						</div>
						<div class="flex items-start gap-2">
							<span class="font-mono text-[10px] font-semibold shrink-0 mt-0.5" style="color: oklch(0.55 0.06 200);">Git:</span>
							<span class="font-mono text-[10px]" style="color: oklch(0.50 0.02 250);">
								Push to a repo and use the Install from Git field above
							</span>
						</div>
						<div class="flex items-start gap-2">
							<span class="font-mono text-[10px] font-semibold shrink-0 mt-0.5" style="color: oklch(0.55 0.06 200);">Reference:</span>
							<span class="font-mono text-[10px]" style="color: oklch(0.50 0.02 250);">
								See the built-in adapters in <code class="px-1 py-0.5 rounded" style="background: oklch(0.20 0.02 250); color: oklch(0.65 0.04 250);">tools/ingest/adapters/</code> for working examples
							</span>
						</div>
					</div>
				</div>
			</details>
		{/if}

		{#if error}
			<div
				class="mt-4 px-3 py-2 rounded-lg font-mono text-xs"
				style="background: oklch(0.25 0.08 25); color: oklch(0.80 0.15 25); border: 1px solid oklch(0.35 0.08 25);"
			>
				{error}
			</div>
		{/if}
	</div>
</div>

<!-- Wizard Drawer -->
<IngestWizard
	open={wizardOpen}
	sourceType={wizardType}
	pluginMetadata={wizardPluginMetadata}
	{editSource}
	onClose={closeWizard}
	onSave={handleSave}
/>

<!-- Task Detail Drawer -->
<TaskDetailDrawer
	bind:taskId={selectedTaskId}
	bind:isOpen={drawerOpen}
/>
