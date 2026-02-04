<script lang="ts">
	/**
	 * Swarm Orchestration Panel
	 *
	 * A dedicated page for agent orchestration and swarm management.
	 * Consolidates all orchestration settings:
	 * - Spawn settings (model, max sessions, agent count, stagger)
	 * - Review rules
	 * - Auto-kill settings
	 * - Active session monitoring
	 * - Quick spawn controls
	 */

	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import SwarmSettingsEditor from '$lib/components/config/SwarmSettingsEditor.svelte';
	import {
		workSessionsState,
		fetch as fetchSessions,
		kill as killSession
	} from '$lib/stores/workSessions.svelte.js';
	import { isEpicSwarmModalOpen } from '$lib/stores/drawerStore';

	// Types
	interface SessionInfo {
		name: string;
		agentName: string;
		task: {
			id: string;
			title?: string;
			description?: string;
			status?: string;
			priority?: number;
			issue_type?: string;
		} | null;
		status: string;
	}

	// State
	let loading = $state(true);
	let sessions = $state<SessionInfo[]>([]);
	let pollInterval: ReturnType<typeof setInterval> | null = null;

	// Derived stats
	const activeCount = $derived(sessions.filter(s => s.status === 'working' || s.status === 'needs-input').length);
	const idleCount = $derived(sessions.filter(s => s.status === 'idle' || s.status === 'completed').length);
	const totalCount = $derived(sessions.length);

	// Session state colors
	const stateColors: Record<string, { bg: string; text: string; label: string }> = {
		working: { bg: 'oklch(0.75 0.15 85 / 0.2)', text: 'oklch(0.85 0.15 85)', label: 'Working' },
		'needs-input': { bg: 'oklch(0.70 0.15 310 / 0.2)', text: 'oklch(0.85 0.15 310)', label: 'Needs Input' },
		'ready-for-review': { bg: 'oklch(0.70 0.15 200 / 0.2)', text: 'oklch(0.85 0.15 200)', label: 'Review' },
		completing: { bg: 'oklch(0.65 0.15 175 / 0.2)', text: 'oklch(0.85 0.15 175)', label: 'Completing' },
		completed: { bg: 'oklch(0.55 0.18 145 / 0.2)', text: 'oklch(0.85 0.18 145)', label: 'Completed' },
		idle: { bg: 'oklch(0.40 0.02 250 / 0.3)', text: 'oklch(0.70 0.02 250)', label: 'Idle' },
		starting: { bg: 'oklch(0.60 0.15 200 / 0.2)', text: 'oklch(0.85 0.15 200)', label: 'Starting' }
	};

	// Fetch sessions
	async function loadSessions() {
		try {
			await fetchSessions();
			// Map sessions from store
			const state = workSessionsState;
			sessions = (state.sessions || []).map(s => ({
				name: s.sessionName,
				agentName: s.agentName || s.sessionName?.replace('jat-', '') || '',
				task: s.task,
				status: s._sseState || 'idle'
			}));
		} catch (err) {
			console.error('[Swarm] Failed to load sessions:', err);
		} finally {
			loading = false;
		}
	}

	// Open epic swarm modal
	function openEpicSwarmModal() {
		isEpicSwarmModalOpen.set(true);
	}

	// Kill a session
	async function handleKillSession(sessionName: string) {
		if (!confirm(`Kill session ${sessionName}?`)) return;
		try {
			await killSession(sessionName);
			await loadSessions();
		} catch (err) {
			console.error('[Swarm] Kill failed:', err);
		}
	}

	// Navigate to dash page
	function goToDash() {
		if (browser) {
			window.location.href = '/dash';
		}
	}

	onMount(() => {
		loadSessions();
		// Poll every 5 seconds
		pollInterval = setInterval(loadSessions, 5000);
	});

	onDestroy(() => {
		if (pollInterval) {
			clearInterval(pollInterval);
		}
	});
</script>

<svelte:head>
	<title>Swarm | JAT IDE</title>
	<meta name="description" content="Agent swarm orchestration panel. Configure spawn settings, manage active sessions, and launch coordinated attacks." />
	<meta property="og:title" content="Swarm | JAT IDE" />
	<meta property="og:description" content="Agent swarm orchestration panel. Configure spawn settings, manage active sessions, and launch coordinated attacks." />
	<meta property="og:image" content="/favicons/swarm.svg" />
	<link rel="icon" href="/favicons/swarm.svg" />
</svelte:head>

<div class="swarm-page">
	<!-- Page Header -->
	<header class="page-header">
		<div class="header-content">
			<div class="header-title">
				<svg xmlns="http://www.w3.org/2000/svg" class="header-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
				</svg>
				<h1>Swarm Orchestration</h1>
			</div>
			<p class="header-subtitle">Configure and monitor agent swarm behavior</p>
		</div>
		<div class="header-actions">
			<button class="btn btn-primary" onclick={openEpicSwarmModal}>
				<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
				</svg>
				Launch Epic Swarm
			</button>
		</div>
	</header>

	<div class="content-grid">
		<!-- Active Sessions Panel -->
		<section class="panel sessions-panel">
			<div class="panel-header">
				<div class="panel-title">
					<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
					</svg>
					<span>Active Sessions</span>
				</div>
				<div class="session-stats">
					<span class="stat active">{activeCount} active</span>
					<span class="stat idle">{idleCount} idle</span>
					<span class="stat total">{totalCount} total</span>
				</div>
			</div>

			<div class="panel-content">
				{#if loading}
					<div class="loading-state">
						<span class="loading loading-spinner loading-md"></span>
						<span>Loading sessions...</span>
					</div>
				{:else if sessions.length === 0}
					<div class="empty-state">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
							<path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
						</svg>
						<p>No active sessions</p>
						<button class="btn btn-sm btn-ghost" onclick={goToDash}>
							Go to Projects →
						</button>
					</div>
				{:else}
					<div class="session-list">
						{#each sessions as session}
							{@const stateStyle = stateColors[session.status] || stateColors.idle}
							<div class="session-item" style="--state-bg: {stateStyle.bg}; --state-text: {stateStyle.text};">
								<div class="session-info">
									<div class="session-name">{session.agentName}</div>
									{#if session.task}
										<div class="session-task" title={session.task.title}>
											<span class="task-id">{session.task.id}</span>
											<span class="task-title">{session.task.title}</span>
										</div>
									{:else}
										<div class="session-task no-task">No active task</div>
									{/if}
								</div>
								<div class="session-status">
									<span class="status-badge">{stateStyle.label}</span>
									<button
										class="btn btn-ghost btn-xs btn-square"
										onclick={() => handleKillSession(session.name)}
										title="Kill session"
									>
										<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
										</svg>
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			{#if sessions.length > 0}
				<div class="panel-footer">
					<button class="btn btn-sm btn-ghost" onclick={goToDash}>
						View in Projects →
					</button>
				</div>
			{/if}
		</section>

		<!-- Settings Panel -->
		<section class="panel settings-panel">
			<SwarmSettingsEditor />
		</section>
	</div>
</div>

<style>
	.swarm-page {
		min-height: 100vh;
		background: oklch(0.14 0.01 250);
		padding: 1.5rem;
	}

	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid oklch(0.25 0.02 250);
	}

	.header-content {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.header-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.header-icon {
		width: 28px;
		height: 28px;
		color: oklch(0.80 0.15 85);
	}

	.header-title h1 {
		font-size: 1.5rem;
		font-weight: 600;
		color: oklch(0.92 0.02 250);
		margin: 0;
	}

	.header-subtitle {
		font-size: 0.875rem;
		color: oklch(0.55 0.02 250);
		margin: 0;
		padding-left: 2.5rem;
	}

	.header-actions {
		display: flex;
		gap: 0.5rem;
	}

	.content-grid {
		display: grid;
		grid-template-columns: 380px 1fr;
		gap: 1.5rem;
		max-width: 1600px;
	}

	.panel {
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 0.75rem;
		overflow: hidden;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		border-bottom: 1px solid oklch(0.25 0.02 250);
		background: oklch(0.18 0.01 250);
	}

	.panel-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: oklch(0.80 0.08 200);
		font-family: ui-monospace, monospace;
	}

	.session-stats {
		display: flex;
		gap: 0.75rem;
		font-size: 0.75rem;
		font-family: ui-monospace, monospace;
	}

	.stat {
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
	}

	.stat.active {
		background: oklch(0.75 0.15 85 / 0.2);
		color: oklch(0.85 0.15 85);
	}

	.stat.idle {
		background: oklch(0.40 0.02 250 / 0.3);
		color: oklch(0.70 0.02 250);
	}

	.stat.total {
		background: oklch(0.30 0.02 250);
		color: oklch(0.70 0.02 250);
	}

	.panel-content {
		padding: 0;
		max-height: 500px;
		overflow-y: auto;
	}

	.loading-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 2rem;
		color: oklch(0.55 0.02 250);
		font-size: 0.875rem;
	}

	.session-list {
		display: flex;
		flex-direction: column;
	}

	.session-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid oklch(0.22 0.02 250);
		background: var(--state-bg);
		transition: background 0.15s ease;
	}

	.session-item:hover {
		background: oklch(0.22 0.02 250);
	}

	.session-item:last-child {
		border-bottom: none;
	}

	.session-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
		flex: 1;
	}

	.session-name {
		font-size: 0.875rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.session-task {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: oklch(0.60 0.02 250);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.session-task.no-task {
		font-style: italic;
		color: oklch(0.45 0.02 250);
	}

	.task-id {
		color: oklch(0.70 0.10 200);
		font-family: ui-monospace, monospace;
	}

	.task-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.session-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.status-badge {
		font-size: 0.7rem;
		font-weight: 500;
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
		background: var(--state-bg);
		color: var(--state-text);
		font-family: ui-monospace, monospace;
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}

	.panel-footer {
		padding: 0.75rem 1rem;
		border-top: 1px solid oklch(0.25 0.02 250);
		background: oklch(0.18 0.01 250);
		text-align: center;
	}

	.settings-panel {
		background: transparent;
		border: none;
	}

	/* Responsive */
	@media (max-width: 1024px) {
		.content-grid {
			grid-template-columns: 1fr;
		}

		.sessions-panel {
			order: 2;
		}

		.settings-panel {
			order: 1;
		}
	}

	@media (max-width: 640px) {
		.swarm-page {
			padding: 1rem;
		}

		.page-header {
			flex-direction: column;
			gap: 1rem;
		}

		.header-actions {
			width: 100%;
		}

		.header-actions .btn {
			flex: 1;
		}
	}
</style>
