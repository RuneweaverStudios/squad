<script lang="ts">
	/**
	 * Tmux Sessions Page
	 *
	 * Orthogonal view of ALL tmux sessions (not just jat-* or server-*).
	 * Provides a tmux-centric perspective for session management:
	 * - View all running tmux sessions
	 * - Kill/attach sessions
	 * - See session type (agent, server, other)
	 * - Choose-session style interface
	 */

	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	interface TmuxSession {
		name: string;
		created: string;
		attached: boolean;
		windows: number;
		type: 'agent' | 'server' | 'ide' | 'other';
		project?: string;
	}

	// State
	let sessions = $state<TmuxSession[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let pollInterval: ReturnType<typeof setInterval> | null = null;
	let selectedSession = $state<string | null>(null);
	let actionLoading = $state<string | null>(null);
	let copiedCmd = $state<string | null>(null);
	let attachMessage = $state<{ session: string; message: string; method: string } | null>(null);

	// Agent to project mapping (from current task)
	let agentProjects = $state<Map<string, string>>(new Map());

	// Extract project from task ID (e.g., "jat-abc" → "jat", "chimaro-xyz" → "chimaro")
	function getProjectFromTaskId(taskId: string): string | undefined {
		if (!taskId) return undefined;
		const match = taskId.match(/^([a-zA-Z0-9_-]+)-[a-zA-Z0-9]+/);
		return match ? match[1] : undefined;
	}

	// Categorize sessions
	function categorizeSession(name: string): { type: TmuxSession['type']; project?: string } {
		if (name.startsWith('jat-')) {
			// Agent session: jat-AgentName
			const agentName = name.slice(4);
			if (agentName.startsWith('pending-')) {
				return { type: 'agent', project: undefined };
			}
			// Look up project from agent's current task
			const project = agentProjects.get(agentName);
			return { type: 'agent', project };
		}
		if (name.startsWith('server-')) {
			// Server session: server-ProjectName
			const project = name.slice(7);
			return { type: 'server', project };
		}
		if (name === 'jat-ide' || name.startsWith('jat-ide')) {
			return { type: 'ide' };
		}
		return { type: 'other' };
	}

	// Fetch work sessions to get project assignments from task IDs
	async function fetchAgentProjects() {
		try {
			const response = await fetch('/api/work');
			if (!response.ok) return;
			const data = await response.json();

			const projectMap = new Map<string, string>();
			for (const session of data.sessions || []) {
				// Get project from current task ID
				if (session.task?.id && session.agentName) {
					const project = getProjectFromTaskId(session.task.id);
					if (project) {
						projectMap.set(session.agentName, project);
					}
				}
			}
			agentProjects = projectMap;
		} catch {
			// Silent fail - project info is optional
		}
	}

	// Fetch all tmux sessions
	async function fetchSessions() {
		try {
			const response = await fetch('/api/sessions?filter=all');
			if (!response.ok) {
				throw new Error('Failed to fetch sessions');
			}
			const data = await response.json();

			sessions = (data.sessions || []).map((s: { name: string; created: string; attached: boolean; windows: number }) => {
				const { type, project } = categorizeSession(s.name);
				return {
					...s,
					type,
					project
				};
			});
			error = null;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	// Fetch all data (agents first to populate project map, then sessions)
	async function fetchAllData() {
		await fetchAgentProjects();
		await fetchSessions();
	}

	// Kill a session
	async function killSession(sessionName: string) {
		actionLoading = sessionName;
		try {
			const response = await fetch(`/api/sessions/${encodeURIComponent(sessionName)}`, {
				method: 'DELETE'
			});
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to kill session');
			}
			// Refresh sessions
			await fetchSessions();
		} catch (err) {
			console.error('Failed to kill session:', err);
		} finally {
			actionLoading = null;
		}
	}

	// Attach to a session (opens in terminal)
	async function attachSession(sessionName: string) {
		actionLoading = sessionName;
		attachMessage = null;
		try {
			const response = await fetch(`/api/sessions/${encodeURIComponent(sessionName)}/attach`, {
				method: 'POST'
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.message || 'Failed to attach session');
			}
			// Show success message with details
			attachMessage = {
				session: sessionName,
				message: data.method === 'tmux-window'
					? `Opened in window '${data.windowName}' of ${data.parentSession}`
					: `Opened in ${data.terminal} terminal`,
				method: data.method
			};
			// Clear message after 4 seconds
			setTimeout(() => {
				if (attachMessage?.session === sessionName) {
					attachMessage = null;
				}
			}, 4000);
		} catch (err) {
			console.error('Failed to attach session:', err);
			attachMessage = {
				session: sessionName,
				message: err instanceof Error ? err.message : 'Failed to attach',
				method: 'error'
			};
		} finally {
			actionLoading = null;
		}
	}

	// Copy attach command
	function copyAttachCmd(sessionName: string) {
		navigator.clipboard.writeText(`tmux attach-session -t ${sessionName}`);
		copiedCmd = sessionName;
		setTimeout(() => {
			copiedCmd = null;
		}, 2000);
	}

	// Format elapsed time
	function formatElapsed(createdISO: string): string {
		const created = new Date(createdISO).getTime();
		const now = Date.now();
		const elapsedMs = now - created;

		if (elapsedMs < 0) return 'just now';

		const seconds = Math.floor(elapsedMs / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) return `${days}d ${hours % 24}h`;
		if (hours > 0) return `${hours}h ${minutes % 60}m`;
		if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
		return `${seconds}s`;
	}

	// Get type badge styling
	function getTypeBadge(type: TmuxSession['type']) {
		switch (type) {
			case 'agent':
				return { bg: 'oklch(0.65 0.15 200 / 0.2)', text: 'oklch(0.75 0.15 200)', label: 'AGENT' };
			case 'server':
				return { bg: 'oklch(0.65 0.15 145 / 0.2)', text: 'oklch(0.75 0.15 145)', label: 'SERVER' };
			case 'ide':
				return { bg: 'oklch(0.65 0.15 280 / 0.2)', text: 'oklch(0.75 0.15 280)', label: 'IDE' };
			default:
				return { bg: 'oklch(0.50 0.02 250 / 0.2)', text: 'oklch(0.65 0.02 250)', label: 'OTHER' };
		}
	}

	// Tick for elapsed time updates
	let tick = $state(0);

	onMount(() => {
		fetchAllData();
		// Poll every 3 seconds
		pollInterval = setInterval(() => {
			fetchAllData();
			tick++;
		}, 3000);
	});

	onDestroy(() => {
		if (pollInterval) {
			clearInterval(pollInterval);
		}
	});

	// Sort sessions: attached first, then by type (agent > server > ide > other), then by name
	const sortedSessions = $derived(
		[...sessions].sort((a, b) => {
			// Attached first
			if (a.attached !== b.attached) return a.attached ? -1 : 1;
			// Then by type priority
			const typePriority = { agent: 0, server: 1, ide: 2, other: 3 };
			if (typePriority[a.type] !== typePriority[b.type]) {
				return typePriority[a.type] - typePriority[b.type];
			}
			// Then by name
			return a.name.localeCompare(b.name);
		})
	);

	// Group sessions by type
	const groupedSessions = $derived(() => {
		const groups: Record<TmuxSession['type'], TmuxSession[]> = {
			agent: [],
			server: [],
			ide: [],
			other: []
		};
		for (const session of sortedSessions) {
			groups[session.type].push(session);
		}
		return groups;
	});

	// Count by type
	const sessionCounts = $derived(() => {
		const counts = { agent: 0, server: 0, ide: 0, other: 0, total: 0 };
		for (const session of sessions) {
			counts[session.type]++;
			counts.total++;
		}
		return counts;
	});
</script>

<svelte:head>
	<title>Tmux | JAT IDE</title>
	<link rel="icon" href="/favicons/tmux.svg" />
</svelte:head>

<div class="tmux-page" style="background: oklch(0.14 0.01 250);">
	<!-- Header -->
	<div class="tmux-header">
		<div class="header-left">
			<h1 class="page-title">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="title-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
				</svg>
				Tmux Sessions
			</h1>
			<p class="page-subtitle">All tmux sessions on this system</p>
		</div>

		<!-- Session counts -->
		<div class="counts-row">
			{#if sessionCounts().total > 0}
				<span class="count-badge" style="background: oklch(0.65 0.15 200 / 0.2); color: oklch(0.75 0.15 200);">
					{sessionCounts().agent} agent{sessionCounts().agent !== 1 ? 's' : ''}
				</span>
				<span class="count-badge" style="background: oklch(0.65 0.15 145 / 0.2); color: oklch(0.75 0.15 145);">
					{sessionCounts().server} server{sessionCounts().server !== 1 ? 's' : ''}
				</span>
				{#if sessionCounts().other > 0}
					<span class="count-badge" style="background: oklch(0.50 0.02 250 / 0.2); color: oklch(0.65 0.02 250);">
						{sessionCounts().other} other
					</span>
				{/if}
			{/if}
		</div>
	</div>

	<!-- Content -->
	<div class="tmux-content">
		{#if loading && sessions.length === 0}
			<!-- Loading skeleton -->
			<div class="loading-skeleton">
				{#each [1, 2, 3] as _}
					<div class="skeleton-row">
						<div class="skeleton h-5 w-32 rounded"></div>
						<div class="skeleton h-4 w-16 rounded"></div>
						<div class="skeleton h-4 w-20 rounded"></div>
						<div class="skeleton h-8 w-24 rounded"></div>
					</div>
				{/each}
			</div>
		{:else if error}
			<!-- Error state -->
			<div class="error-state">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="error-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
				</svg>
				<p class="error-text">{error}</p>
				<button class="retry-btn" onclick={() => fetchSessions()}>
					Retry
				</button>
			</div>
		{:else if sessions.length === 0}
			<!-- Empty state -->
			<div class="empty-state">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="empty-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
				</svg>
				<p class="empty-title">No tmux sessions</p>
				<p class="empty-hint">Start a new agent or dev server from the Work or Servers page.</p>
			</div>
		{:else}
			<!-- Sessions table -->
			<div class="sessions-table-wrapper">
				<table class="sessions-table">
					<thead>
						<tr>
							<th class="th-name">Session</th>
							<th class="th-type">Type</th>
							<th class="th-status">Status</th>
							<th class="th-windows">Windows</th>
							<th class="th-uptime">Uptime</th>
							<th class="th-actions">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each sortedSessions as session (session.name)}
							{@const typeBadge = getTypeBadge(session.type)}
							<tr
								class="session-row"
								class:attached={session.attached}
								class:selected={selectedSession === session.name}
								onclick={() => selectedSession = selectedSession === session.name ? null : session.name}
							>
								<td class="td-name">
									<span class="session-name">{session.name}</span>
									{#if session.project}
										<span class="session-project">{session.project}</span>
									{/if}
								</td>
								<td class="td-type">
									<span class="type-badge" style="background: {typeBadge.bg}; color: {typeBadge.text};">
										{typeBadge.label}
									</span>
								</td>
								<td class="td-status">
									{#if session.attached}
										<span class="status-attached">
											<span class="status-dot attached"></span>
											attached
										</span>
									{:else}
										<span class="status-detached">
											<span class="status-dot"></span>
											detached
										</span>
									{/if}
								</td>
								<td class="td-windows">
									{session.windows} window{session.windows !== 1 ? 's' : ''}
								</td>
								<td class="td-uptime">
									{void tick}{formatElapsed(session.created)}
								</td>
								<td class="td-actions" onclick={(e) => e.stopPropagation()}>
									<div class="action-buttons">
										<!-- Attach button -->
										<button
											class="action-btn attach"
											onclick={() => attachSession(session.name)}
											disabled={actionLoading === session.name}
											title="Attach to session"
										>
											{#if actionLoading === session.name}
												<span class="loading loading-spinner loading-xs"></span>
											{:else}
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="action-icon">
													<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
												</svg>
											{/if}
										</button>

										<!-- Copy command button -->
										<button
											class="action-btn copy"
											class:copied={copiedCmd === session.name}
											onclick={() => copyAttachCmd(session.name)}
											title="Copy attach command"
										>
											{#if copiedCmd === session.name}
												<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="action-icon">
													<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
												</svg>
											{:else}
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="action-icon">
													<path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
												</svg>
											{/if}
										</button>

										<!-- Kill button -->
										<button
											class="action-btn kill"
											onclick={() => killSession(session.name)}
											disabled={actionLoading === session.name}
											title="Kill session"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="action-icon">
												<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
											</svg>
										</button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Command hint -->
			<div class="command-hint">
				<span class="hint-label">Tip:</span>
				<code class="hint-code">tmux list-sessions</code>
				<span class="hint-text">or</span>
				<code class="hint-code">tmux a -t {"<session>"}</code>
			</div>
		{/if}
	</div>

	<!-- Attach feedback toast -->
	{#if attachMessage}
		<div
			class="attach-toast"
			class:error={attachMessage.method === 'error'}
			class:success={attachMessage.method !== 'error'}
		>
			{#if attachMessage.method === 'error'}
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="toast-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
				</svg>
			{:else}
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="toast-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
				</svg>
			{/if}
			<div class="toast-content">
				<span class="toast-session">{attachMessage.session}</span>
				<span class="toast-message">{attachMessage.message}</span>
			</div>
			<button class="toast-close" onclick={() => attachMessage = null}>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>
	{/if}
</div>

<style>
	.tmux-page {
		min-height: 100vh;
		padding: 1.5rem;
	}

	/* Header */
	.tmux-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1.5rem;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
	}

	.header-left {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.page-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.5rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
		font-family: ui-monospace, monospace;
	}

	.title-icon {
		width: 24px;
		height: 24px;
		color: oklch(0.70 0.15 200);
	}

	.page-subtitle {
		font-size: 0.8rem;
		color: oklch(0.55 0.02 250);
		margin: 0;
		font-family: ui-monospace, monospace;
	}

	.counts-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.count-badge {
		font-size: 0.75rem;
		font-family: ui-monospace, monospace;
		padding: 0.25rem 0.75rem;
		border-radius: 9999px;
	}

	/* Content */
	.tmux-content {
		max-width: 1200px;
	}

	/* Loading skeleton */
	.loading-skeleton {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.skeleton-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background: oklch(0.18 0.01 250);
		border-radius: 8px;
	}

	.skeleton {
		background: oklch(0.25 0.02 250);
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}

	/* Error state */
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem;
		gap: 1rem;
	}

	.error-icon {
		width: 48px;
		height: 48px;
		color: oklch(0.65 0.15 30);
	}

	.error-text {
		color: oklch(0.70 0.12 30);
		font-size: 0.9rem;
		margin: 0;
	}

	.retry-btn {
		padding: 0.5rem 1rem;
		background: oklch(0.25 0.02 250);
		border: 1px solid oklch(0.35 0.02 250);
		border-radius: 6px;
		color: oklch(0.80 0.02 250);
		font-size: 0.85rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.retry-btn:hover {
		background: oklch(0.30 0.02 250);
	}

	/* Empty state */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem;
		gap: 0.75rem;
		color: oklch(0.50 0.02 250);
	}

	.empty-icon {
		width: 64px;
		height: 64px;
		color: oklch(0.35 0.02 250);
	}

	.empty-title {
		font-size: 1rem;
		font-weight: 500;
		color: oklch(0.60 0.02 250);
		margin: 0;
	}

	.empty-hint {
		font-size: 0.85rem;
		color: oklch(0.50 0.02 250);
		margin: 0;
	}

	/* Sessions table */
	.sessions-table-wrapper {
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 8px;
		overflow: hidden;
	}

	.sessions-table {
		width: 100%;
		border-collapse: collapse;
		font-family: ui-monospace, monospace;
	}

	.sessions-table thead {
		background: oklch(0.20 0.01 250);
		border-bottom: 1px solid oklch(0.28 0.02 250);
	}

	.sessions-table th {
		text-align: left;
		padding: 0.75rem 1rem;
		font-size: 0.7rem;
		font-weight: 600;
		color: oklch(0.55 0.02 250);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.sessions-table tbody tr {
		border-bottom: 1px solid oklch(0.22 0.02 250);
		transition: all 0.15s;
		cursor: pointer;
	}

	.sessions-table tbody tr:last-child {
		border-bottom: none;
	}

	.sessions-table tbody tr:hover {
		background: oklch(0.20 0.02 250);
	}

	.sessions-table tbody tr.attached {
		background: oklch(0.65 0.15 145 / 0.08);
	}

	.sessions-table tbody tr.attached:hover {
		background: oklch(0.65 0.15 145 / 0.12);
	}

	.sessions-table tbody tr.selected {
		background: oklch(0.65 0.15 200 / 0.12);
		outline: 1px solid oklch(0.65 0.15 200 / 0.3);
	}

	.sessions-table td {
		padding: 0.875rem 1rem;
		font-size: 0.85rem;
		color: oklch(0.75 0.02 250);
	}

	/* Session name */
	.td-name {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.session-name {
		font-weight: 500;
		color: oklch(0.85 0.02 250);
	}

	.session-project {
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
	}

	/* Type badge */
	.type-badge {
		font-size: 0.65rem;
		font-weight: 600;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* Status */
	.status-attached,
	.status-detached {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8rem;
	}

	.status-attached {
		color: oklch(0.70 0.15 145);
	}

	.status-detached {
		color: oklch(0.55 0.02 250);
	}

	.status-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: oklch(0.45 0.02 250);
	}

	.status-dot.attached {
		background: oklch(0.65 0.18 145);
		box-shadow: 0 0 6px oklch(0.65 0.18 145 / 0.6);
	}

	/* Actions */
	.action-buttons {
		display: flex;
		gap: 0.375rem;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: oklch(0.22 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 4px;
		color: oklch(0.65 0.02 250);
		cursor: pointer;
		transition: all 0.15s;
	}

	.action-btn:hover:not(:disabled) {
		background: oklch(0.28 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.action-btn.attach:hover:not(:disabled) {
		background: oklch(0.65 0.15 200 / 0.2);
		border-color: oklch(0.65 0.15 200 / 0.4);
		color: oklch(0.75 0.15 200);
	}

	.action-btn.copy:hover:not(:disabled) {
		background: oklch(0.65 0.15 280 / 0.2);
		border-color: oklch(0.65 0.15 280 / 0.4);
		color: oklch(0.75 0.15 280);
	}

	.action-btn.copy.copied {
		background: oklch(0.65 0.15 145 / 0.2);
		border-color: oklch(0.65 0.15 145 / 0.4);
		color: oklch(0.75 0.15 145);
	}

	.action-btn.kill:hover:not(:disabled) {
		background: oklch(0.65 0.15 30 / 0.2);
		border-color: oklch(0.65 0.15 30 / 0.4);
		color: oklch(0.75 0.15 30);
	}

	.action-icon {
		width: 14px;
		height: 14px;
	}

	/* Command hint */
	.command-hint {
		margin-top: 1.5rem;
		padding: 0.75rem 1rem;
		background: oklch(0.18 0.01 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 6px;
		font-size: 0.8rem;
		color: oklch(0.55 0.02 250);
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.hint-label {
		color: oklch(0.60 0.02 250);
	}

	.hint-code {
		background: oklch(0.22 0.02 250);
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		font-family: ui-monospace, monospace;
		color: oklch(0.75 0.12 200);
	}

	.hint-text {
		color: oklch(0.45 0.02 250);
	}

	/* Attach toast */
	.attach-toast {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		background: oklch(0.20 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 8px;
		box-shadow: 0 4px 12px oklch(0 0 0 / 0.3);
		z-index: 100;
		animation: slide-up 0.2s ease-out;
	}

	.attach-toast.success {
		background: oklch(0.22 0.04 200);
		border-color: oklch(0.45 0.12 200);
	}

	.attach-toast.error {
		background: oklch(0.22 0.04 30);
		border-color: oklch(0.45 0.12 30);
	}

	@keyframes slide-up {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.toast-icon {
		width: 20px;
		height: 20px;
		flex-shrink: 0;
	}

	.attach-toast.success .toast-icon {
		color: oklch(0.70 0.15 200);
	}

	.attach-toast.error .toast-icon {
		color: oklch(0.70 0.15 30);
	}

	.toast-content {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.toast-session {
		font-size: 0.8rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.toast-message {
		font-size: 0.75rem;
		color: oklch(0.60 0.02 250);
	}

	.attach-toast.success .toast-message {
		color: oklch(0.70 0.10 200);
	}

	.attach-toast.error .toast-message {
		color: oklch(0.70 0.10 30);
	}

	.toast-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		padding: 0;
		margin-left: 0.5rem;
		background: transparent;
		border: none;
		color: oklch(0.50 0.02 250);
		cursor: pointer;
		transition: color 0.15s;
	}

	.toast-close:hover {
		color: oklch(0.75 0.02 250);
	}

	.toast-close svg {
		width: 14px;
		height: 14px;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.tmux-page {
			padding: 1rem;
		}

		.sessions-table th,
		.sessions-table td {
			padding: 0.625rem 0.75rem;
		}

		.th-windows,
		.td-windows {
			display: none;
		}

		.attach-toast {
			left: 1rem;
			right: 1rem;
			bottom: 1rem;
		}
	}
</style>
