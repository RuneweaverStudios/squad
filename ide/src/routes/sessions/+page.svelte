<script lang="ts">
	/**
	 * Sessions Page
	 *
	 * Top-level view of ALL tmux sessions (not just jat-* or server-*).
	 * Provides a session-centric perspective for session management:
	 * - View all running tmux sessions
	 * - Kill/attach sessions
	 * - See session type (agent, server, other)
	 * - Choose-session style interface
	 */

	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { getProjectColor, initProjectColors } from '$lib/utils/projectColors';
	import SessionCard from '$lib/components/work/SessionCard.svelte';
	import HorizontalResizeHandle from '$lib/components/HorizontalResizeHandle.svelte';
	import TaskIdBadge from '$lib/components/TaskIdBadge.svelte';
	import AgentAvatar from '$lib/components/AgentAvatar.svelte';
	import ServerStatusBadge from '$lib/components/work/ServerStatusBadge.svelte';
	import ServerSessionBadge from '$lib/components/ServerSessionBadge.svelte';
	import SessionsTabs from '$lib/components/sessions/SessionsTabs.svelte';
	import AnimatedDigits from '$lib/components/AnimatedDigits.svelte';
	import StatusActionBadge from '$lib/components/work/StatusActionBadge.svelte';
	import SortDropdown from '$lib/components/SortDropdown.svelte';

	interface TmuxSession {
		name: string;
		created: string;
		attached: boolean;
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

	// Tab filter state - synced with URL
	let activeTab = $state('all');

	// Expanded session state (inline SessionCard)
	let expandedSession = $state<string | null>(null);
	let collapsingSession = $state<string | null>(null); // For slide-up animation
	let expandedOutput = $state<string>('');
	let outputPollInterval: ReturnType<typeof setInterval> | null = null;
	let expandedHeight = $state(800); // Default height in pixels
	let isResizing = $state(false);

	// Tmux pane width tracking (in columns)
	let tmuxWidth = $state(160); // Default 160 columns
	const PIXELS_PER_COLUMN = 8.5; // Approximate pixels per monospace character

	// Task detail panel state (inline, not drawer overlay)
	let expandedTaskId = $state<string | null>(null);
	let taskDetailOpen = $state(false);

	// Agent to project mapping (from current task)
	let agentProjects = $state<Map<string, string>>(new Map());

	// Agent to task mapping (full task info for TaskIdBadge)
	interface AgentTask {
		id: string;
		status: string;
		issue_type?: string;
		title?: string;
		priority?: number;
		description?: string;
	}
	let agentTasks = $state<Map<string, AgentTask>>(new Map());

	// Agent to session info mapping (tokens, cost, activity state, etc. from /api/work)
	interface AgentSessionInfo {
		tokens: number;
		cost: number;
		activityState?: string; // 'working' | 'idle' | 'needs-input' | 'ready-for-review' | 'completing' | 'completed'
	}
	let agentSessionInfo = $state<Map<string, AgentSessionInfo>>(new Map());

	// Sort configuration for sessions
	type SessionSortOption = 'state' | 'project' | 'created';
	type SessionSortDirection = 'asc' | 'desc';

	interface SessionSortConfig {
		value: string;
		label: string;
		icon: string;
		defaultDir: SessionSortDirection;
	}

	let sortBy = $state<SessionSortOption>('state');
	let sortDir = $state<SessionSortDirection>('asc');

	// State priority for sorting (lower = more urgent/higher priority)
	const STATE_PRIORITY: Record<string, number> = {
		'ready-for-review': 0,   // Most urgent - needs human review
		'needs-input': 1,        // Waiting for user input
		'working': 2,            // Actively working
		'completing': 3,         // Running completion
		'starting': 4,           // Agent starting up
		'recovering': 5,         // Automation recovery
		'compacting': 6,         // Context compaction
		'completed': 7,          // Task done
		'auto-proceeding': 8,    // Spawning next
		'idle': 9                // Lowest priority
	};

	// Sort options for dropdown
	const SORT_OPTIONS: SessionSortConfig[] = [
		{ value: 'state', label: 'State', icon: '🎯', defaultDir: 'asc' },
		{ value: 'project', label: 'Project', icon: '📁', defaultDir: 'asc' },
		{ value: 'created', label: 'Created', icon: '⏱️', defaultDir: 'desc' }
	];

	// Project order (from /api/projects, sorted by last activity)
	let projectOrder = $state<string[]>([]);

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

	// Fetch project order (same as ActionPill uses, sorted by last activity)
	async function fetchProjectOrder() {
		try {
			const response = await fetch('/api/projects?visible=true&stats=true');
			if (!response.ok) return;
			const data = await response.json();
			projectOrder = (data.projects || []).map((p: { name: string }) => p.name);
		} catch {
			// Silent fail - will fall back to alphabetical
		}
	}

	// Fetch work sessions to get project assignments, task info, and session metrics
	async function fetchAgentProjects() {
		try {
			const response = await fetch('/api/work');
			if (!response.ok) return;
			const data = await response.json();

			const projectMap = new Map<string, string>();
			const taskMap = new Map<string, AgentTask>();
			const sessionInfoMap = new Map<string, AgentSessionInfo>();

			for (const session of data.sessions || []) {
				if (!session.agentName) continue;

				// Store session info (tokens, cost, activity state)
				sessionInfoMap.set(session.agentName, {
					tokens: session.tokens || 0,
					cost: session.cost || 0,
					activityState: session.sessionState || undefined
				});

				// Get project from current task ID, or fall back to lastCompletedTask
				const taskSource = session.task || session.lastCompletedTask;
				if (taskSource?.id) {
					const project = getProjectFromTaskId(taskSource.id);
					if (project) {
						projectMap.set(session.agentName, project);
					}
					// Store full task info for TaskIdBadge
					taskMap.set(session.agentName, {
						id: taskSource.id,
						status: taskSource.status || 'open',
						issue_type: taskSource.issue_type,
						title: taskSource.title,
						priority: taskSource.priority,
						description: taskSource.description
					});
				}
			}
			agentProjects = projectMap;
			agentTasks = taskMap;
			agentSessionInfo = sessionInfoMap;
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

			sessions = (data.sessions || []).map((s: { name: string; created: string; attached: boolean; project?: string }) => {
				const { type, project: categorizedProject } = categorizeSession(s.name);
				return {
					...s,
					type,
					// Use project from API (signal/cwd) if available, else fall back to categorized
					project: s.project || categorizedProject
				};
			});
			error = null;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	// Fetch all data (project order + agents first, then sessions)
	async function fetchAllData() {
		await Promise.all([fetchProjectOrder(), fetchAgentProjects()]);
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
			// Use the same endpoint as /work page - spawns external terminal
			const response = await fetch(`/api/work/${encodeURIComponent(sessionName)}/attach`, {
				method: 'POST'
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || 'Failed to attach session');
			}
			// Show success message
			attachMessage = {
				session: sessionName,
				message: `Opened in ${data.terminal?.split('/').pop() || 'terminal'}`,
				method: 'terminal'
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

	// Format elapsed time for AnimatedDigits display
	// Returns object with hours, minutes, seconds as zero-padded strings
	function getElapsedFormatted(createdISO: string): { hours: string; minutes: string; seconds: string; showHours: boolean } | null {
		if (!createdISO) return null;
		const created = new Date(createdISO).getTime();
		const now = Date.now();
		const elapsedMs = now - created;

		if (elapsedMs < 0) return { hours: '00', minutes: '00', seconds: '00', showHours: false };

		const totalSeconds = Math.floor(elapsedMs / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		return {
			hours: hours.toString().padStart(2, '0'),
			minutes: minutes.toString().padStart(2, '0'),
			seconds: seconds.toString().padStart(2, '0'),
			showHours: hours > 0
		};
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

	// Fetch output for expanded session
	async function fetchExpandedOutput(sessionName: string) {
		try {
			const response = await fetch(`/api/work/${encodeURIComponent(sessionName)}/output`);
			if (response.ok) {
				const data = await response.json();
				expandedOutput = data.output || '';
			}
		} catch (err) {
			console.error('Failed to fetch session output:', err);
		}
	}

	// Fetch current tmux dimensions
	async function fetchTmuxDimensions(sessionName: string) {
		try {
			const response = await fetch(`/api/work/${encodeURIComponent(sessionName)}/resize`);
			if (response.ok) {
				const data = await response.json();
				tmuxWidth = data.dimensions?.width || 80;
			}
		} catch (err) {
			console.error('Failed to fetch tmux dimensions:', err);
		}
	}

	// Resize tmux pane width
	async function resizeTmuxWidth(sessionName: string, newWidth: number) {
		try {
			await fetch(`/api/work/${encodeURIComponent(sessionName)}/resize`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ width: newWidth })
			});
		} catch (err) {
			console.error('Failed to resize tmux pane:', err);
		}
	}

	// Handle horizontal resize delta (pixels -> columns)
	function handleHorizontalResize(deltaX: number) {
		if (!expandedSession) return;
		const deltaColumns = Math.round(deltaX / PIXELS_PER_COLUMN);
		if (deltaColumns !== 0) {
			tmuxWidth = Math.max(40, tmuxWidth + deltaColumns);
		}
	}

	// Commit the resize to tmux when drag ends
	function handleHorizontalResizeEnd() {
		if (expandedSession) {
			resizeTmuxWidth(expandedSession, tmuxWidth);
		}
	}

	// Toggle session expansion (works for any session)
	function toggleExpanded(sessionName: string) {
		if (expandedSession === sessionName) {
			// Collapse with animation
			collapsingSession = sessionName;
			if (outputPollInterval) {
				clearInterval(outputPollInterval);
				outputPollInterval = null;
			}
			// After animation completes, remove the element
			setTimeout(() => {
				expandedSession = null;
				expandedOutput = '';
				collapsingSession = null;
			}, 200); // Match animation duration
		} else {
			// Expand
			expandInline(sessionName);
		}
	}

	// Expand session inline (works for any session)
	function expandInline(sessionName: string) {
		// Close any existing expansion
		if (outputPollInterval) {
			clearInterval(outputPollInterval);
			outputPollInterval = null;
		}

		expandedSession = sessionName;
		fetchExpandedOutput(sessionName);
		fetchTmuxDimensions(sessionName);

		// Poll for output updates
		outputPollInterval = setInterval(() => {
			if (expandedSession === sessionName) {
				fetchExpandedOutput(sessionName);
			}
		}, 1000);
	}

	// Resize handling for expanded session
	function startResize(e: MouseEvent) {
		e.preventDefault();
		isResizing = true;
		const startY = e.clientY;
		const startHeight = expandedHeight;

		function onMouseMove(e: MouseEvent) {
			const delta = e.clientY - startY;
			expandedHeight = Math.max(200, startHeight + delta);
		}

		function onMouseUp() {
			isResizing = false;
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
		}

		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
	}

	// Send input to expanded session
	async function sendExpandedInput(text: string, type: 'text' | 'key' | 'raw' = 'text'): Promise<boolean> {
		if (!expandedSession) return false;
		try {
			// Special key handling: when type is 'key', the text contains the key name
			// (e.g., 'backspace', 'ctrl-c', 'enter'), which should become the API type
			let apiType: string = type;
			let apiInput: string = text;

			if (type === 'key') {
				const specialKeys = ['ctrl-c', 'ctrl-d', 'ctrl-u', 'ctrl-l', 'enter', 'escape', 'up', 'down', 'left', 'right', 'tab', 'delete', 'backspace', 'space'];
				if (specialKeys.includes(text)) {
					// The key name becomes the type, input is empty
					apiType = text;
					apiInput = '';
				} else {
					// Unknown key - send as raw text
					apiType = 'raw';
					apiInput = text;
				}
			}

			const response = await fetch(`/api/work/${encodeURIComponent(expandedSession)}/input`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ input: apiInput, type: apiType })
			});
			// Refresh output after sending
			setTimeout(() => fetchExpandedOutput(expandedSession!), 100);
			return response.ok;
		} catch (err) {
			console.error('Failed to send input:', err);
			return false;
		}
	}

	// Get agent name from session name (jat-AgentName -> AgentName)
	function getAgentName(sessionName: string): string {
		if (sessionName.startsWith('jat-')) {
			return sessionName.slice(4);
		}
		return sessionName;
	}

	// Tick for elapsed time updates
	let tick = $state(0);

	// Handle tab change - update URL
	function handleTabChange(tabId: string) {
		activeTab = tabId;
		const url = new URL(window.location.href);
		if (tabId === 'all') {
			url.searchParams.delete('tab');
		} else {
			url.searchParams.set('tab', tabId);
		}
		goto(url.pathname + url.search, { replaceState: true, noScroll: true });
	}

	// Sync activeTab from URL on mount
	$effect(() => {
		if (browser) {
			const tabParam = $page.url.searchParams.get('tab');
			if (tabParam && ['agents', 'servers', 'terminal'].includes(tabParam)) {
				activeTab = tabParam;
			} else {
				activeTab = 'all';
			}
		}
	});

	// Handle sort change from dropdown
	function handleSortChange(value: string, dir: 'asc' | 'desc') {
		sortBy = value as SessionSortOption;
		sortDir = dir;
	}

	onMount(() => {
		initProjectColors();
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
		if (outputPollInterval) {
			clearInterval(outputPollInterval);
		}
	});

	// Helper function to get state priority for a session
	function getSessionStatePriority(session: TmuxSession): number {
		if (session.type !== 'agent') return 99; // Non-agent sessions go last
		const agentName = getAgentName(session.name);
		const state = agentSessionInfo.get(agentName)?.activityState || 'idle';
		return STATE_PRIORITY[state] ?? 99;
	}

	// Sort sessions based on current sort configuration
	const sortedSessions = $derived(
		[...sessions].sort((a, b) => {
			const multiplier = sortDir === 'asc' ? 1 : -1;

			if (sortBy === 'state') {
				// Sort by state priority (most urgent first)
				const stateA = getSessionStatePriority(a);
				const stateB = getSessionStatePriority(b);
				if (stateA !== stateB) {
					return (stateA - stateB) * multiplier;
				}
				// Secondary sort by created time (most recent first)
				const createdA = new Date(a.created).getTime();
				const createdB = new Date(b.created).getTime();
				return (createdB - createdA);
			}

			if (sortBy === 'project') {
				// Sort by project (using projectOrder from API, unknown projects go last)
				const projA = a.project || '';
				const projB = b.project || '';
				if (projA !== projB) {
					const indexA = projA ? projectOrder.indexOf(projA) : -1;
					const indexB = projB ? projectOrder.indexOf(projB) : -1;
					const orderA = indexA === -1 ? (projA ? 9999 : 99999) : indexA;
					const orderB = indexB === -1 ? (projB ? 9999 : 99999) : indexB;
					if (orderA !== orderB) {
						return (orderA - orderB) * multiplier;
					}
					// Both unknown, sort alphabetically
					if (indexA === -1 && indexB === -1) {
						return projA.localeCompare(projB) * multiplier;
					}
				}
				// Secondary sort by created time
				const createdA = new Date(a.created).getTime();
				const createdB = new Date(b.created).getTime();
				return (createdB - createdA);
			}

			// Default: sort by created time
			const createdA = new Date(a.created).getTime();
			const createdB = new Date(b.created).getTime();
			return (createdB - createdA) * multiplier;
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

	// Filter sessions based on active tab
	const filteredSessions = $derived(
		sortedSessions.filter(session => {
			if (activeTab === 'all') return true;
			if (activeTab === 'agents') return session.type === 'agent';
			if (activeTab === 'servers') return session.type === 'server';
			if (activeTab === 'terminal') return session.type === 'other' || session.type === 'ide';
			return true;
		})
	);
</script>

<svelte:head>
	<title>Sessions | JAT IDE</title>
	<meta name="description" content="View all tmux sessions including agents, servers, and other sessions. Attach, kill, or expand sessions." />
	<meta property="og:title" content="Sessions | JAT IDE" />
	<meta property="og:description" content="View all tmux sessions including agents, servers, and other sessions. Attach, kill, or expand sessions." />
	<meta property="og:image" content="/favicons/tmux.svg" />
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
				Sessions
			</h1>
		</div>

	</div>

	<!-- Content -->
	<div class="tmux-content">
		<!-- Session type tabs + Sort control (above table) -->
		<div class="table-controls">
			<SessionsTabs
				{activeTab}
				counts={sessionCounts()}
				onTabChange={handleTabChange}
			/>
			<SortDropdown
				options={SORT_OPTIONS as any}
				{sortBy}
				{sortDir}
				onSortChange={handleSortChange}
				size="xs"
			/>
		</div>

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
							<th class="th-actions">Agent</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredSessions as session (session.name)}
							{@const typeBadge = getTypeBadge(session.type)}
							{@const isExpanded = expandedSession === session.name}
							{@const isCollapsing = collapsingSession === session.name}
							{@const sessionAgentName = getAgentName(session.name)}
							{@const sessionTask = agentTasks.get(sessionAgentName)}
							{@const sessionInfo = agentSessionInfo.get(sessionAgentName)}
							{@const activityState = sessionInfo?.activityState}
							{@const statusDotColor = activityState === 'working'
								? 'oklch(0.70 0.18 250)' // Indigo/blue for working
								: activityState === 'compacting'
								? 'oklch(0.65 0.15 280)' // Purple for compacting
								: activityState === 'needs-input'
								? 'oklch(0.75 0.20 45)' // Orange for needs input
								: activityState === 'ready-for-review'
								? 'oklch(0.70 0.20 85)' // Amber/yellow for review
								: activityState === 'completing'
								? 'oklch(0.65 0.15 175)' // Teal for completing
								: activityState === 'completed'
								? 'oklch(0.70 0.20 145)' // Green for completed
								: activityState === 'starting'
								? 'oklch(0.75 0.15 200)' // Blue for starting
								: activityState === 'recovering'
								? 'oklch(0.70 0.20 190)' // Cyan for recovering
								: 'oklch(0.55 0.05 250)' // Grey for idle/unknown
							}
							{@const derivedProject = agentProjects.get(sessionAgentName) || session.project || null}
							{@const rowProjectColor = sessionTask?.id
								? getProjectColor(sessionTask.id)
								: derivedProject
									? getProjectColor(`${derivedProject}-x`)
									: null
							}
							{@const elapsed = getElapsedFormatted(session.created)}
							<tr
								class="session-row"
								class:attached={session.attached}
								class:selected={selectedSession === session.name}
								style={rowProjectColor ? `border-left: 3px solid ${rowProjectColor};` : ''}
								class:expanded={isExpanded}
								class:expandable={true}
								onclick={() => toggleExpanded(session.name)}
							>
								<td class="td-name">
									{#if session.type === 'server'}
										<!-- Server session display -->
										<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
										<div class="server-row" onclick={(e) => e.stopPropagation()}>
											<ServerSessionBadge
												sessionName={session.name}
												project={session.project}
												status="running"
												created={session.created}
												size="xs"
												variant="projectPill"
												onAction={async (actionId) => {
													if (actionId === 'stop') {
														await killSession(session.name);
													} else if (actionId === 'restart') {
														await killSession(session.name);
													}
												}}
											/>
										</div>
										<div class="server-name">
											<span class="session-name">{session.name}</span>
										</div>
									{:else}
										<!-- Agent session display -->
										<!-- Row 1: Project pill + Task title -->
										<div class="task-row">
											{#if sessionTask}
												<TaskIdBadge
													task={sessionTask}
													size="xs"
													variant="projectPill"
													showType={true}
													{statusDotColor}
												/>
												<span class="task-title" title={sessionTask.title}>
													{sessionTask.title || sessionTask.id}
												</span>
											{:else}
												<!-- No task - show project badge if known, otherwise session name -->
												{#if derivedProject}
													<span
														class="project-badge"
														style="background: {rowProjectColor ? `color-mix(in oklch, ${rowProjectColor} 25%, transparent)` : 'oklch(0.25 0.02 250)'}; border-color: {rowProjectColor || 'oklch(0.35 0.02 250)'}; color: {rowProjectColor || 'oklch(0.75 0.02 250)'};"
													>
														{derivedProject}
													</span>
												{:else}
													<span class="session-name-pill">{session.name}</span>
												{/if}
												<span class="no-task-label">No active task</span>
											{/if}
										</div>
										<!-- Row 2: Task description (truncated) -->
										{#if sessionTask?.description}
											<div class="task-description">
												{sessionTask.description}
											</div>
										{/if}
									{/if}
								</td>
									<td class="td-actions" onclick={(e) => e.stopPropagation()}>
									{#if session.type === 'agent'}
										<!-- Two-row layout: Agent info row, then StatusActionBadge with timer -->
										<div class="agent-column">
											<!-- Row 1: Avatar + Name + Attached indicator -->
											<div class="agent-info-row">
												<AgentAvatar name={sessionAgentName} size={16} />
												<span class="agent-name">{sessionAgentName}</span>
												{#if session.attached}
													<span class="attached-indicator" title="Terminal attached">
														<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="attached-icon">
															<path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
														</svg>
													</span>
												{/if}
											</div>
											<!-- Row 2: Status action badge with elapsed time -->
											<StatusActionBadge
												sessionState={activityState || 'idle'}
												{elapsed}
												sessionName={session.name}
												alignRight={true}
												onAction={async (actionId) => {
													if (actionId === 'attach') {
														await attachSession(session.name);
													} else if (actionId === 'kill' || actionId === 'cleanup') {
														await killSession(session.name);
													} else if (actionId === 'view-task' && sessionTask) {
														window.location.href = `/tasks?task=${sessionTask.id}`;
													} else if (actionId === 'complete') {
														// Send /jat:complete command to session
														// Claude Code slash commands need: Ctrl+U clear, text, extra Enter
														const sessionId = encodeURIComponent(session.name);
														await fetch(`/api/work/${sessionId}/input`, {
															method: 'POST',
															headers: { 'Content-Type': 'application/json' },
															body: JSON.stringify({ type: 'ctrl-u' })
														});
														await new Promise(r => setTimeout(r, 50));
														await fetch(`/api/work/${sessionId}/input`, {
															method: 'POST',
															headers: { 'Content-Type': 'application/json' },
															body: JSON.stringify({ input: '/jat:complete', type: 'text' })
														});
														await new Promise(r => setTimeout(r, 100));
														await fetch(`/api/work/${sessionId}/input`, {
															method: 'POST',
															headers: { 'Content-Type': 'application/json' },
															body: JSON.stringify({ type: 'enter' })
														});
													} else if (actionId === 'complete-kill') {
														// Send /jat:complete --kill command to session
														// Claude Code slash commands need: Ctrl+U clear, text, extra Enter
														const sessionId = encodeURIComponent(session.name);
														await fetch(`/api/work/${sessionId}/input`, {
															method: 'POST',
															headers: { 'Content-Type': 'application/json' },
															body: JSON.stringify({ type: 'ctrl-u' })
														});
														await new Promise(r => setTimeout(r, 50));
														await fetch(`/api/work/${sessionId}/input`, {
															method: 'POST',
															headers: { 'Content-Type': 'application/json' },
															body: JSON.stringify({ input: '/jat:complete --kill', type: 'text' })
														});
														await new Promise(r => setTimeout(r, 100));
														await fetch(`/api/work/${sessionId}/input`, {
															method: 'POST',
															headers: { 'Content-Type': 'application/json' },
															body: JSON.stringify({ type: 'enter' })
														});
													} else if (actionId === 'interrupt') {
														// Send Ctrl+C to session
														await fetch(`/api/work/${encodeURIComponent(session.name)}/input`, {
															method: 'POST',
															headers: { 'Content-Type': 'application/json' },
															body: JSON.stringify({ type: 'ctrl-c' })
														});
													} else if (actionId === 'escape') {
														// Send Escape key to session
														await fetch(`/api/work/${encodeURIComponent(session.name)}/input`, {
															method: 'POST',
															headers: { 'Content-Type': 'application/json' },
															body: JSON.stringify({ type: 'escape' })
														});
													}
												}}
												task={sessionTask ? { id: sessionTask.id, issue_type: sessionTask.issue_type, priority: sessionTask.priority } : null}
												project={session.project || null}
												onViewEpic={(epicId) => {
													window.location.href = `/tasks?task=${epicId}`;
												}}
											/>
										</div>
									{:else}
										<!-- Non-agent sessions: simple buttons -->
										<div class="action-buttons">
											<button
												class="action-btn attach"
												onclick={() => attachSession(session.name)}
												disabled={actionLoading === session.name}
												title="Open in terminal"
											>
												{#if actionLoading === session.name}
													<span class="loading loading-spinner loading-xs"></span>
												{:else}
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="action-icon">
														<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
													</svg>
												{/if}
											</button>
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
									{/if}
								</td>
							</tr>
							<!-- Expanded SessionCard row -->
							{#if isExpanded}
								{@const expandedAgentName = getAgentName(session.name)}
								{@const expandedTask = agentTasks.get(expandedAgentName)}
								{@const expandedSessionInfo = agentSessionInfo.get(expandedAgentName)}
								<tr class="expanded-row">
									<td colspan="2" class="expanded-content">
										<div class="expanded-session-wrapper" class:with-task-panel={expandedTask && taskDetailOpen && expandedTaskId === expandedTask.id}>
											<!-- SessionCard section -->
											<div class="session-card-section">
												<div class="expanded-session-card" class:collapsing={isCollapsing} style="height: {expandedHeight}px;">
													<SessionCard
														mode={session.type === 'server' ? 'server' : 'agent'}
														sessionName={session.name}
														agentName={expandedAgentName}
														headerless={true}
														task={expandedTask ? {
															id: expandedTask.id,
															title: expandedTask.title,
															status: expandedTask.status,
															priority: expandedTask.priority,
															issue_type: expandedTask.issue_type,
															description: expandedTask.description
														} : null}
														output={expandedOutput}
														tokens={expandedSessionInfo?.tokens ?? 0}
														cost={expandedSessionInfo?.cost ?? 0}
														startTime={session.created ? new Date(session.created) : null}
														created={session.created}
														attached={session.attached}
														onSendInput={(text, type) => sendExpandedInput(text, type)}
														onKillSession={() => {
															expandedSession = null;
															killSession(session.name);
														}}
														onInterrupt={() => {
															// Send Ctrl+C to session
															fetch(`/api/work/${encodeURIComponent(session.name)}/input`, {
																method: 'POST',
																headers: { 'Content-Type': 'application/json' },
																body: JSON.stringify({ type: 'ctrl-c' })
															});
														}}
														onAttachTerminal={() => attachSession(session.name)}
														onTaskClick={(taskId) => {
															// Toggle inline task detail panel
															if (expandedTaskId === taskId && taskDetailOpen) {
																taskDetailOpen = false;
																expandedTaskId = null;
															} else {
																expandedTaskId = taskId;
																taskDetailOpen = true;
															}
														}}
													/>
												</div>
												<!-- Horizontal resize handle for tmux width -->
												<HorizontalResizeHandle
													onResize={handleHorizontalResize}
													onResizeEnd={handleHorizontalResizeEnd}
												/>
												<!-- Width indicator -->
												<div class="width-indicator">{tmuxWidth} cols</div>
											</div>

											<!-- Inline Task Detail Panel -->
											{#if expandedTask && taskDetailOpen && expandedTaskId === expandedTask.id}
												<div class="task-detail-panel" style="height: {expandedHeight}px;">
													<div class="task-panel-header">
														<h3 class="task-panel-title">Task Details</h3>
														<button
															class="task-panel-close"
															onclick={() => { taskDetailOpen = false; expandedTaskId = null; }}
															title="Close panel"
														>
															<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
																<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
															</svg>
														</button>
													</div>
													<div class="task-panel-content">
														<!-- Task ID and badges row -->
														<div class="task-panel-badges">
															<TaskIdBadge
																task={{
																	id: expandedTask.id,
																	status: expandedTask.status,
																	issue_type: expandedTask.issue_type,
																	priority: expandedTask.priority
																}}
																size="sm"
																variant="projectPill"
																showType={true}
															/>
														</div>

														<!-- Title -->
														<h4 class="task-panel-task-title">{expandedTask.title || 'Untitled'}</h4>

														<!-- Description -->
														{#if expandedTask.description}
															<div class="task-panel-section">
																<span class="task-panel-label">Description</span>
																<p class="task-panel-description">{expandedTask.description}</p>
															</div>
														{/if}

														<!-- View full details link -->
														<div class="task-panel-actions">
															<a
																href="/tasks?task={expandedTask.id}"
																class="task-panel-link"
															>
																<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
																	<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
																</svg>
																View full details
															</a>
														</div>
													</div>
												</div>
											{/if}
										</div>
										<!-- Vertical resize divider for height -->
										<div
											class="resize-divider"
											class:resizing={isResizing}
											onmousedown={startResize}
											role="separator"
											aria-orientation="horizontal"
											tabindex="0"
										>
											<div class="resize-handle-vertical"></div>
										</div>
									</td>
								</tr>
							{/if}
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

	/* Table controls (tabs + sort) above the session table */
	.table-controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.75rem;
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
		/* Note: overflow: hidden removed to allow dropdowns to escape the table bounds */
		/* Use overflow-x: clip to contain expanded content width without cutting off dropdowns */
		overflow-x: clip;
	}

	.sessions-table {
		width: 100%;
		border-collapse: collapse;
		font-family: ui-monospace, monospace;
		table-layout: fixed;
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

	/* Column widths - fixed second column, first column gets remainder */
	.th-actions, .td-actions { width: 205px; min-width: 205px; max-width: 205px; }

	/* Session name */
	.td-name {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.125rem;
		min-width: 0; /* Allow column to shrink below content width */
		max-width: 100%;
	}

	.session-name {
		font-size: 0.75rem;
		font-weight: 500;
		color: oklch(0.65 0.02 250);
	}

	.session-name-pill {
		font-size: 0.75rem;
		font-weight: 600;
		color: oklch(0.75 0.10 250);
		background: oklch(0.25 0.02 250);
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
		font-family: ui-monospace, monospace;
	}

	.project-badge {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
		border: 1px solid;
		font-family: ui-monospace, monospace;
	}

	.no-task-label {
		font-size: 0.75rem;
		color: oklch(0.50 0.02 250);
		font-style: italic;
	}

	.task-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		min-width: 0; /* Allow flex children to shrink */
	}

	.server-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		min-width: 0; /* Allow flex children to shrink */
	}

	.server-name {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-top: 0.25rem;
	}

	.task-title {
		font-size: 0.8rem;
		font-weight: 500;
		color: oklch(0.80 0.02 250);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		min-width: 0; /* Allow truncation */
	}

	.task-description {
		font-size: 0.7rem;
		color: oklch(0.55 0.02 250);
		margin-top: 0.25rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		width: 100%;
		max-width: 100%;
	}

	/* Agent column layout (two rows: info row + badge) */
	.agent-column {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.agent-info-row {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.agent-name {
		font-size: 0.7rem;
		font-weight: 500;
		color: oklch(0.75 0.02 250);
		white-space: nowrap;
	}

	/* Attached indicator */
	.attached-indicator {
		display: flex;
		align-items: center;
		margin-left: 0.25rem;
	}

	.attached-icon {
		width: 12px;
		height: 12px;
		color: oklch(0.70 0.18 145);
		filter: drop-shadow(0 0 3px oklch(0.65 0.18 145 / 0.6));
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

	/* Expandable rows */
	.session-row.expandable {
		cursor: pointer;
	}

	.session-row.expandable:hover {
		background: oklch(0.65 0.15 145 / 0.15);
	}

	.session-row.expanded {
		background: oklch(0.65 0.15 200 / 0.12);
		border-bottom: none;
	}

	.session-row.expanded:hover {
		background: oklch(0.65 0.15 200 / 0.15);
	}

	/* Expanded row with SessionCard */
	.expanded-row {
		background: oklch(0.12 0.01 250);
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.expanded-row:hover {
		background: oklch(0.12 0.01 250);
	}

	.expanded-content {
		padding: 0 !important;
		border-top: 1px solid oklch(0.25 0.02 250);
	}

	.expanded-session-card {
		animation: expand-slide-down 0.2s ease-out;
		overflow-y: auto;
		width: 100%;
		/* Height controlled by inline style for resize functionality */
	}

	@keyframes expand-slide-down {
		from {
			opacity: 0;
			max-height: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			max-height: 600px;
			transform: translateY(0);
		}
	}

	@keyframes expand-slide-up {
		from {
			opacity: 1;
			max-height: 600px;
			transform: translateY(0);
		}
		to {
			opacity: 0;
			max-height: 0;
			transform: translateY(-10px);
		}
	}

	.expanded-session-card.collapsing {
		animation: expand-slide-up 0.2s ease-out forwards;
	}

	/* Wrapper for expanded session with horizontal resize */
	.expanded-session-wrapper {
		position: relative;
		padding: 1rem;
		display: flex;
		gap: 1rem;
	}

	/* SessionCard takes all space when no task panel */
	.session-card-section {
		position: relative;
		flex: 1;
		min-width: 0;
	}

	/* When task panel is showing, SessionCard gets 60% and panel gets 40% */
	.expanded-session-wrapper.with-task-panel .session-card-section {
		flex: 0 0 60%;
	}

	/* Task detail panel (inline) */
	.task-detail-panel {
		flex: 0 0 40%;
		min-width: 300px;
		max-width: 500px;
		overflow-y: auto;
		border-radius: 8px;
		border: 1px solid oklch(0.28 0.02 250);
		background: oklch(0.16 0.01 250);
		display: flex;
		flex-direction: column;
	}

	.task-panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid oklch(0.25 0.02 250);
		background: oklch(0.18 0.01 250);
		border-radius: 8px 8px 0 0;
	}

	.task-panel-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: oklch(0.80 0.02 250);
		margin: 0;
	}

	.task-panel-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 4px;
		color: oklch(0.55 0.02 250);
		cursor: pointer;
		transition: all 0.15s;
	}

	.task-panel-close:hover {
		background: oklch(0.25 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	.task-panel-content {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.task-panel-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.task-panel-task-title {
		font-size: 1rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
		line-height: 1.4;
	}

	.task-panel-section {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.task-panel-label {
		font-size: 0.7rem;
		font-weight: 600;
		color: oklch(0.55 0.02 250);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.task-panel-description {
		font-size: 0.8rem;
		color: oklch(0.70 0.02 250);
		margin: 0;
		line-height: 1.5;
		white-space: pre-wrap;
	}

	.task-panel-actions {
		margin-top: auto;
		padding-top: 0.75rem;
		border-top: 1px solid oklch(0.22 0.02 250);
	}

	.task-panel-link {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8rem;
		color: oklch(0.70 0.15 200);
		text-decoration: none;
		transition: color 0.15s;
	}

	.task-panel-link:hover {
		color: oklch(0.80 0.18 200);
	}

	/* Override SessionCard styles when embedded in table */
	.expanded-session-card :global(.session-card) {
		border-radius: 8px;
		border: 1px solid oklch(0.28 0.02 250);
		max-width: none;
		width: 100%;
	}

	/* Width indicator - positioned within session-card-section */
	.session-card-section .width-indicator {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		font-size: 0.7rem;
		font-family: ui-monospace, monospace;
		color: oklch(0.55 0.02 250);
		background: oklch(0.18 0.01 250);
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		border: 1px solid oklch(0.25 0.02 250);
		pointer-events: none;
		z-index: 5;
	}

	/* Vertical resize divider for expanded session height */
	.resize-divider {
		position: relative;
		height: 8px;
		cursor: ns-resize;
		background: oklch(0.18 0.01 250);
		border-top: 1px solid oklch(0.25 0.02 250);
		transition: background 0.15s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.resize-divider:hover {
		background: oklch(0.22 0.02 250);
	}

	.resize-divider.resizing {
		background: oklch(0.25 0.04 200);
	}

	.resize-handle-vertical {
		width: 40px;
		height: 4px;
		background: oklch(0.35 0.02 250);
		border-radius: 2px;
		transition: background 0.15s, width 0.15s;
	}

	.resize-divider:hover .resize-handle-vertical {
		background: oklch(0.50 0.02 250);
		width: 60px;
	}

	.resize-divider.resizing .resize-handle-vertical {
		background: oklch(0.65 0.12 200);
		width: 80px;
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

		.attach-toast {
			left: 1rem;
			right: 1rem;
			bottom: 1rem;
		}
	}
</style>
