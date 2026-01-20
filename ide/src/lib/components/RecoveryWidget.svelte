<script lang="ts">
	/**
	 * RecoveryWidget - Paused/Crashed sessions recovery UI for TopBar
	 *
	 * Shows when there are paused sessions (agents that can be resumed).
	 * Displays a badge with count, dropdown with session list, and batch recovery action.
	 *
	 * Detection criteria:
	 * - Task in_progress with assignee
	 * - Session file exists (.claude/sessions/agent-{id}.txt)
	 * - No active tmux session jat-{agentName}
	 */

	import { onMount, onDestroy } from 'svelte';
	import { fetchAndGetProjectColors } from '$lib/utils/projectColors';
	import AgentAvatar from '$lib/components/AgentAvatar.svelte';

	interface RecoverableSession {
		agentName: string;
		sessionId: string;
		taskId: string;
		taskTitle: string;
		taskPriority: number;
		project: string;
		lastActivity: string;
	}

	// State
	let sessions = $state<RecoverableSession[]>([]);
	let loading = $state(false);
	let recovering = $state(false);
	let recoveringAgent = $state<string | null>(null);
	let showDropdown = $state(false);
	let error = $state<string | null>(null);
	let selectedTab = $state<string>('all');
	let projectColors = $state<Record<string, string>>({});
	let projectOrder = $state<string[]>([]);

	// Get unique projects from sessions, sorted by project order then alphabetically
	function getProjects(): string[] {
		const projectSet = new Set(sessions.map(s => s.project));
		return Array.from(projectSet).sort((a, b) => {
			const indexA = projectOrder.indexOf(a);
			const indexB = projectOrder.indexOf(b);
			const orderA = indexA === -1 ? 9999 : indexA;
			const orderB = indexB === -1 ? 9999 : indexB;
			if (orderA !== orderB) return orderA - orderB;
			return a.localeCompare(b);
		});
	}

	// Get color for a project
	function getProjectColor(project: string): string {
		return projectColors[project.toLowerCase()] || 'oklch(0.70 0.15 200)';
	}

	// Filter sessions by selected tab and sort by newest first
	const filteredSessions = $derived(
		[...(selectedTab === 'all'
			? sessions
			: sessions.filter(s => s.project === selectedTab)
		)].sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
	);

	// Polling interval
	let pollInterval: ReturnType<typeof setInterval> | null = null;
	const POLL_INTERVAL_MS = 10000; // Check every 10 seconds

	// Fetch recoverable sessions
	async function fetchRecoverable() {
		try {
			const response = await fetch('/api/recovery');
			if (!response.ok) {
				throw new Error('Failed to fetch recovery data');
			}
			const data = await response.json();
			sessions = data.sessions || [];
			error = null;
		} catch (err) {
			console.error('Recovery fetch error:', err);
			error = err instanceof Error ? err.message : 'Unknown error';
		}
	}

	// Recover a single session
	async function recoverSingle(agentName: string, sessionId: string) {
		if (recoveringAgent) return;

		recoveringAgent = agentName;
		try {
			const response = await fetch(`/api/sessions/${agentName}/resume`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ session_id: sessionId })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Resume failed');
			}

			// Remove from list on success
			sessions = sessions.filter((s) => s.agentName !== agentName);
		} catch (err) {
			console.error('Recovery error:', err);
			// Keep in list so user can retry
		} finally {
			recoveringAgent = null;
		}
	}

	// Recover filtered sessions (based on selected tab)
	async function recoverFiltered() {
		if (recovering || filteredSessions.length === 0) return;

		recovering = true;
		showDropdown = false;

		try {
			// If filtering by project, only recover those agents
			const agentsToRecover = selectedTab === 'all'
				? undefined
				: filteredSessions.map(s => s.agentName);

			console.log('[RecoveryWidget] Starting batch recovery for:', agentsToRecover || 'all');

			const response = await fetch('/api/recovery', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sessions: agentsToRecover })
			});

			const data = await response.json();
			console.log('[RecoveryWidget] Batch recovery response:', data);

			if (!response.ok) {
				throw new Error(data.message || 'Batch recovery failed');
			}

			// Log individual results
			if (data.results) {
				for (const result of data.results) {
					if (result.success) {
						console.log(`[RecoveryWidget] Recovered: ${result.agentName}`);
					} else {
						console.error(`[RecoveryWidget] Failed to recover ${result.agentName}: ${result.error}`);
					}
				}
			}

			// Refetch to get updated list (even if some failed)
			await fetchRecoverable();
		} catch (err) {
			console.error('Batch recovery error:', err);
		} finally {
			recovering = false;
		}
	}

	// Format time ago
	function timeAgo(isoDate: string): string {
		const now = new Date();
		const then = new Date(isoDate);
		const diffMs = now.getTime() - then.getTime();
		const diffMins = Math.floor(diffMs / 60000);

		if (diffMins < 1) return 'just now';
		if (diffMins < 60) return `${diffMins}m ago`;

		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours}h ago`;

		const diffDays = Math.floor(diffHours / 24);
		return `${diffDays}d ago`;
	}

	// Priority label and color
	function getPriorityInfo(priority: number): { label: string; color: string } {
		switch (priority) {
			case 0:
				return { label: 'P0', color: 'oklch(0.65 0.20 25)' }; // Red
			case 1:
				return { label: 'P1', color: 'oklch(0.75 0.15 55)' }; // Orange
			case 2:
				return { label: 'P2', color: 'oklch(0.75 0.12 85)' }; // Yellow
			default:
				return { label: `P${priority}`, color: 'oklch(0.60 0.02 250)' }; // Gray
		}
	}

	// Dropdown handling
	let dropdownTimeout: ReturnType<typeof setTimeout> | null = null;

	function showMenu() {
		if (dropdownTimeout) clearTimeout(dropdownTimeout);
		showDropdown = true;
	}

	function hideMenuDelayed() {
		dropdownTimeout = setTimeout(() => {
			showDropdown = false;
		}, 200);
	}

	function keepMenuOpen() {
		if (dropdownTimeout) clearTimeout(dropdownTimeout);
	}

	// Fetch project colors and order
	async function fetchProjectData() {
		try {
			// Fetch colors
			projectColors = await fetchAndGetProjectColors();

			// Fetch project order
			const response = await fetch('/api/projects?visible=true&stats=true');
			if (response.ok) {
				const data = await response.json();
				projectOrder = (data.projects || []).map((p: { name: string }) => p.name);
			}
		} catch {
			// Silent fail - fallback to alphabetical
		}
	}

	// Lifecycle
	onMount(() => {
		fetchRecoverable();
		fetchProjectData();
		pollInterval = setInterval(fetchRecoverable, POLL_INTERVAL_MS);
	});

	onDestroy(() => {
		if (pollInterval) clearInterval(pollInterval);
		if (dropdownTimeout) clearTimeout(dropdownTimeout);
	});

	// Hide when no recoverable sessions
	const hasRecoverable = $derived(sessions.length > 0);
</script>

{#if hasRecoverable}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="relative"
		onmouseenter={showMenu}
		onmouseleave={hideMenuDelayed}
	>
		<!-- Recovery Badge Button -->
		<button
			class="recovery-badge"
			class:recovering
			disabled={recovering}
			title="Paused sessions"
		>
			<!-- Warning/Recovery icon -->
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="w-4 h-4"
			>
				<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
				<path d="M21 3v5h-5" />
				<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
				<path d="M8 16H3v5" />
			</svg>

			<!-- Count badge -->
			<span class="recovery-count">{sessions.length}</span>

			{#if recovering}
				<span class="loading loading-spinner loading-xs ml-1"></span>
			{/if}
		</button>

		<!-- Dropdown Panel -->
		{#if showDropdown && !recovering}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="recovery-dropdown"
				onmouseenter={keepMenuOpen}
				onmouseleave={hideMenuDelayed}
			>
				<!-- Header -->
				<div class="recovery-header">
					<span class="recovery-title">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							class="w-4 h-4"
						>
							<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
							<line x1="12" y1="9" x2="12" y2="13" />
							<line x1="12" y1="17" x2="12.01" y2="17" />
						</svg>
						Paused Sessions
					</span>
					<span class="recovery-subtitle">{sessions.length} paused</span>
				</div>

				<!-- Project Tabs (only show if multiple projects) -->
				{#if getProjects().length > 1}
					<div class="recovery-tabs">
						<button
							class="recovery-tab"
							class:active={selectedTab === 'all'}
							onclick={() => selectedTab = 'all'}
						>
							<span class="project-badge">ALL</span>
							<span class="tab-count">{sessions.length}</span>
						</button>
						{#each getProjects() as project}
							{@const color = getProjectColor(project)}
							<button
								class="recovery-tab"
								class:active={selectedTab === project}
								style="--project-color: {color}"
								onclick={() => selectedTab = project}
							>
								<span class="project-badge">{project.toUpperCase()}</span>
								<span class="tab-count">{sessions.filter(s => s.project === project).length}</span>
							</button>
						{/each}
					</div>
				{/if}

				<!-- Session List -->
				<div class="recovery-list">
					{#each filteredSessions as session (session.agentName)}
						<button
							class="recovery-row"
							onclick={() => recoverSingle(session.agentName, session.sessionId)}
							disabled={recoveringAgent === session.agentName}
							title="Resume {session.agentName}"
						>
							<span class="priority-badge priority-{session.taskPriority}">P{session.taskPriority}</span>
							<span class="recovery-agent">
								<AgentAvatar name={session.agentName} size={18} />
								{session.agentName}
							</span>
							<span class="recovery-task-title">{session.taskTitle}</span>
							<span class="recovery-time">{timeAgo(session.lastActivity)}</span>
							{#if recoveringAgent === session.agentName}
								<span class="loading loading-spinner loading-xs"></span>
							{:else}
								<svg class="recovery-play" viewBox="0 0 24 24" fill="currentColor">
									<path d="M8 5v14l11-7z"/>
								</svg>
							{/if}
						</button>
					{/each}
				</div>

				<!-- Footer with Recover All -->
				<div class="recovery-footer">
					<button
						class="recovery-all-btn"
						onclick={recoverFiltered}
						disabled={recovering || filteredSessions.length === 0}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							class="w-4 h-4"
						>
							<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
							<path d="M21 3v5h-5" />
							<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
							<path d="M8 16H3v5" />
						</svg>
						{selectedTab === 'all' ? `Resume All (${sessions.length})` : `Resume ${selectedTab} (${filteredSessions.length})`}
					</button>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Recovery Badge */
	.recovery-badge {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.625rem;
		border-radius: 0.375rem;
		background: linear-gradient(135deg, oklch(0.45 0.15 30 / 0.3), oklch(0.40 0.12 25 / 0.2));
		border: 1px solid oklch(0.55 0.18 30 / 0.5);
		color: oklch(0.85 0.15 30);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		animation: recovery-pulse 2s ease-in-out infinite;
	}

	.recovery-badge:hover:not(:disabled) {
		background: linear-gradient(135deg, oklch(0.50 0.18 30 / 0.4), oklch(0.45 0.15 25 / 0.3));
		border-color: oklch(0.60 0.20 30 / 0.6);
		transform: scale(1.02);
	}

	.recovery-badge:disabled {
		opacity: 0.7;
		cursor: not-allowed;
		animation: none;
	}

	.recovery-badge.recovering {
		animation: none;
		background: oklch(0.40 0.10 30 / 0.3);
	}

	@keyframes recovery-pulse {
		0%, 100% {
			box-shadow: 0 0 0 0 oklch(0.55 0.18 30 / 0);
		}
		50% {
			box-shadow: 0 0 12px 4px oklch(0.55 0.18 30 / 0.3);
		}
	}

	.recovery-count {
		background: oklch(0.55 0.18 30);
		color: oklch(0.98 0 0);
		padding: 0.125rem 0.375rem;
		border-radius: 9999px;
		font-size: 0.65rem;
		font-weight: 700;
		min-width: 1.25rem;
		text-align: center;
	}

	/* Dropdown Panel */
	.recovery-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 0.5rem;
		min-width: 380px;
		max-width: 480px;
		max-height: 450px;
		border-radius: 0.5rem;
		background: oklch(0.18 0.01 250);
		border: 1px solid oklch(0.30 0.02 250);
		box-shadow: 0 10px 40px oklch(0 0 0 / 0.5);
		overflow: hidden;
		z-index: 50;
		animation: dropdown-slide 0.2s ease-out;
	}

	@keyframes dropdown-slide {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Header */
	.recovery-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem 1.125rem;
		background: linear-gradient(135deg, oklch(0.35 0.12 30 / 0.3), oklch(0.25 0.08 30 / 0.2));
		border-bottom: 1px solid oklch(0.30 0.02 250);
	}

	.recovery-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: oklch(0.85 0.12 30);
	}

	.recovery-subtitle {
		font-size: 0.75rem;
		color: oklch(0.60 0.02 250);
	}

	/* Project Tabs - styled like /tasks page */
	.recovery-tabs {
		display: flex;
		gap: 0.5rem;
		padding: 0.625rem 1rem;
		background: oklch(0.15 0.01 250);
		border-bottom: 1px solid oklch(0.25 0.01 250);
		overflow-x: auto;
		scrollbar-width: thin;
	}

	.recovery-tab {
		--project-color: oklch(0.60 0.02 250);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		padding: 0.5rem 0.625rem;
		border-radius: 0.5rem;
		background: oklch(0.18 0.01 250);
		border: 1.5px solid oklch(0.28 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.recovery-tab:hover {
		background: oklch(0.22 0.01 250);
		border-color: oklch(0.35 0.02 250);
	}

	.recovery-tab.active {
		background: color-mix(in oklch, var(--project-color) 15%, oklch(0.18 0.01 250));
		border-color: var(--project-color);
		box-shadow: 0 0 10px color-mix(in oklch, var(--project-color) 30%, transparent);
	}

	/* Project name badge */
	.project-badge {
		font-size: 0.75rem;
		font-weight: 600;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		letter-spacing: 0.02em;
		padding: 0.25rem 0.625rem;
		border-radius: 0.3rem;
		background: color-mix(in oklch, var(--project-color) 15%, transparent);
		border: 1px solid color-mix(in oklch, var(--project-color) 30%, transparent);
		color: var(--project-color);
		transition: all 0.15s ease;
	}

	.recovery-tab:hover .project-badge {
		background: color-mix(in oklch, var(--project-color) 25%, transparent);
		border-color: color-mix(in oklch, var(--project-color) 50%, transparent);
	}

	.recovery-tab.active .project-badge {
		background: color-mix(in oklch, var(--project-color) 30%, transparent);
		border-color: color-mix(in oklch, var(--project-color) 60%, transparent);
		box-shadow: 0 0 6px color-mix(in oklch, var(--project-color) 30%, transparent);
	}

	.recovery-tab .tab-count {
		font-size: 0.625rem;
		font-weight: 500;
		color: oklch(0.55 0.02 250);
	}

	.recovery-tab.active .tab-count {
		color: color-mix(in oklch, var(--project-color) 80%, oklch(0.70 0.02 250));
	}

	/* Session List */
	.recovery-list {
		max-height: 360px;
		overflow-y: auto;
		padding: 0.375rem;
	}

	/* Compact row style */
	.recovery-row {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: 100%;
		padding: 0.5rem 0.625rem;
		border: none;
		background: transparent;
		color: oklch(0.80 0.02 250);
		font-size: 0.875rem;
		border-radius: 0.375rem;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s;
	}

	.recovery-row:hover:not(:disabled) {
		background: oklch(0.28 0.02 250);
		color: oklch(0.92 0.02 250);
	}

	.recovery-row:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Priority badges */
	.priority-badge {
		font-size: 0.6875rem;
		font-weight: 700;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		flex-shrink: 0;
	}

	.priority-badge.priority-0 {
		background: oklch(0.45 0.15 25 / 0.3);
		color: oklch(0.75 0.18 25);
	}

	.priority-badge.priority-1 {
		background: oklch(0.50 0.12 60 / 0.3);
		color: oklch(0.80 0.15 60);
	}

	.priority-badge.priority-2 {
		background: oklch(0.45 0.10 220 / 0.3);
		color: oklch(0.75 0.12 220);
	}

	.priority-badge.priority-3,
	.priority-badge.priority-4 {
		background: oklch(0.30 0.02 250);
		color: oklch(0.65 0.02 250);
	}

	.recovery-agent {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: oklch(0.85 0.08 200);
		flex-shrink: 0;
	}

	.recovery-task-title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.8125rem;
		color: oklch(0.65 0.02 250);
	}

	.recovery-time {
		font-size: 0.75rem;
		color: oklch(0.50 0.02 250);
		flex-shrink: 0;
	}

	.recovery-play {
		width: 1rem;
		height: 1rem;
		color: oklch(0.65 0.12 145);
		flex-shrink: 0;
		opacity: 0.6;
		transition: opacity 0.1s, color 0.1s;
	}

	.recovery-row:hover:not(:disabled) .recovery-play {
		color: oklch(0.75 0.15 145);
		opacity: 1;
	}

	/* Footer */
	.recovery-footer {
		padding: 0.875rem 1.125rem;
		background: oklch(0.16 0.01 250);
		border-top: 1px solid oklch(0.25 0.01 250);
	}

	.recovery-all-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.75rem 1.125rem;
		border-radius: 0.375rem;
		background: linear-gradient(135deg, oklch(0.50 0.15 145), oklch(0.45 0.12 145));
		border: none;
		color: oklch(0.98 0 0);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.recovery-all-btn:hover:not(:disabled) {
		background: linear-gradient(135deg, oklch(0.55 0.18 145), oklch(0.50 0.15 145));
		transform: translateY(-1px);
		box-shadow: 0 4px 12px oklch(0.50 0.15 145 / 0.3);
	}

	.recovery-all-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
