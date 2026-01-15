<script lang="ts">
	/**
	 * Tasks Page
	 *
	 * Top-level view of ALL tmux sessions (not just jat-* or server-*).
	 * Provides a task-centric perspective with session management:
	 * - View all running tmux sessions
	 * - Kill/attach sessions
	 * - See session type (agent, server, other)
	 * - Choose-session style interface
	 */

	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { getProjectColor, fetchAndGetProjectColors } from '$lib/utils/projectColors';
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
		resumed?: boolean;
		originalSessionId?: string;
		resumedAt?: string;
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
	let activeTab = $state('agents');

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
	let isCardResizing = $state(false); // For showing cols indicator during resize

	// Container width for sessions table (resizable)
	let containerWidth = $state(1200); // Default max-width in pixels
	let isContainerResizing = $state(false);

	// Task detail panel state (inline, not drawer overlay)
	let expandedTaskId = $state<string | null>(null);
	let taskDetailOpen = $state(false);

	// Poll for task details updates (signals) when panel is open
	let taskDetailsPollInterval: ReturnType<typeof setInterval> | null = null;
	const TASK_DETAILS_POLL_MS = 5000; // Poll every 5 seconds

	// Extended task detail data (fetched when panel opens)
	interface TaskAttachment {
		id: string;
		path: string;
		filename: string;
		url: string;
	}

	interface TaskDependency {
		id: string;
		title: string;
		status: string;
		priority: number;
	}

	interface TimelineEvent {
		type: 'beads_event' | 'agent_mail' | 'signal';
		event?: string;
		timestamp: string;
		description?: string;
		metadata?: Record<string, any>;
		data?: Record<string, any>;  // For signal events
	}

	interface ExtendedTaskDetails {
		labels?: string[];
		assignee?: string;
		depends_on?: TaskDependency[];
		blocked_by?: TaskDependency[];
		created_at?: string;
		updated_at?: string;
		attachments: TaskAttachment[];
		timeline: TimelineEvent[];
		timelineCounts: { total: number; beads_events: number; agent_mail: number; signals?: number };
	}

	let expandedTaskDetails = $state<ExtendedTaskDetails | null>(null);
	let taskDetailsLoading = $state(false);
	let timelineFilter = $state<'all' | 'tasks' | 'messages'>('all');

	// Status and priority colors
	const statusColors: Record<string, string> = {
		open: 'badge-info',
		in_progress: 'badge-warning',
		blocked: 'badge-error',
		closed: 'badge-success'
	};

	const priorityColors: Record<number, string> = {
		0: 'badge-error',
		1: 'badge-warning',
		2: 'badge-info',
		3: 'badge-ghost',
		4: 'badge-ghost'
	};

	// Agent to project mapping (from current task)
	let agentProjects = $state<Map<string, string>>(new Map());

	// Project colors (reactive state to trigger re-render when colors are fetched)
	let projectColors = $state<Record<string, string>>({});

	// Helper to get project color from reactive state
	function getProjectColorReactive(taskIdOrProject: string): string | null {
		if (!taskIdOrProject) return null;
		const projectPrefix = taskIdOrProject.split('-')[0].toLowerCase();
		return projectColors[projectPrefix] || getProjectColor(taskIdOrProject);
	}

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
		activityStateTimestamp?: number; // Timestamp when state was fetched (so SessionCard trusts sseState)
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
	// Principle: States requiring user attention/action come first
	const STATE_PRIORITY: Record<string, number> = {
		'ready-for-review': 0,   // Most urgent - needs human review
		'needs-input': 1,        // Waiting for user input
		'completed': 2,          // User must review completion screen and close it
		'working': 3,            // Actively working (no user action needed)
		'completing': 4,         // Running completion
		'starting': 5,           // Agent starting up
		'recovering': 6,         // Automation recovery
		'compacting': 7,         // Context compaction
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
					activityState: session.sessionState || undefined,
					activityStateTimestamp: Date.now() // Timestamp so SessionCard trusts the state
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

	// Fetch project colors into reactive state
	async function fetchProjectColors() {
		try {
			const colors = await fetchAndGetProjectColors();
			projectColors = colors;
		} catch (err) {
			console.warn('Failed to fetch project colors:', err);
		}
	}

	// Fetch all data (project order + agents + colors first, then sessions)
	async function fetchAllData() {
		await Promise.all([fetchProjectOrder(), fetchAgentProjects(), fetchProjectColors()]);
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
		isCardResizing = true; // Show cols indicator
		const deltaColumns = Math.round(deltaX / PIXELS_PER_COLUMN);
		if (deltaColumns !== 0) {
			tmuxWidth = Math.max(40, tmuxWidth + deltaColumns);
		}
	}

	// Commit the resize to tmux when drag ends
	function handleHorizontalResizeEnd() {
		isCardResizing = false; // Hide cols indicator
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

	// Fetch extended task details (attachments, dependencies, timeline, signals)
	async function fetchExpandedTaskDetails(taskId: string) {
		if (!taskId) return;

		taskDetailsLoading = true;
		expandedTaskDetails = null;

		try {
			// Fetch task details, attachments, history, and signals in parallel
			const [taskRes, attachmentsRes, historyRes, signalsRes] = await Promise.all([
				fetch(`/api/tasks/${taskId}`),
				fetch(`/api/tasks/${taskId}/images`),
				fetch(`/api/tasks/${taskId}/history`),
				fetch(`/api/tasks/${taskId}/signals`)
			]);

			const taskData = taskRes.ok ? await taskRes.json() : null;
			const attachmentsData = attachmentsRes.ok ? await attachmentsRes.json() : { images: [] };
			const historyData = historyRes.ok ? await historyRes.json() : { timeline: [], count: { total: 0, beads_events: 0, agent_mail: 0 } };
			const signalsData = signalsRes.ok ? await signalsRes.json() : { signals: [] };

			// Convert signals to timeline event format and merge with history
			const signalEvents = (signalsData.signals || []).map((signal: any) => ({
				type: 'signal' as const,
				timestamp: signal.timestamp,
				data: {
					state: signal.state,
					agentName: signal.agent_name,
					...signal.data
				}
			}));

			// Merge history timeline with signal events and sort by timestamp
			const mergedTimeline = [...(historyData.timeline || []), ...signalEvents]
				.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

			expandedTaskDetails = {
				labels: taskData?.task?.labels || [],
				assignee: taskData?.task?.assignee,
				depends_on: taskData?.task?.depends_on || [],
				blocked_by: taskData?.task?.blocked_by || [],
				created_at: taskData?.task?.created_at,
				updated_at: taskData?.task?.updated_at,
				attachments: (attachmentsData.images || []).map((img: any) => ({
					id: img.id || img.path,
					path: img.path,
					filename: img.filename || img.path.split('/').pop(),
					url: `/api/tasks/${taskId}/images/${encodeURIComponent(img.path.split('/').pop())}`
				})),
				timeline: mergedTimeline,
				timelineCounts: {
					total: mergedTimeline.length,
					beads_events: historyData.count?.beads_events || 0,
					agent_mail: historyData.count?.agent_mail || 0,
					signals: signalEvents.length
				}
			};
		} catch (err) {
			console.error('Failed to fetch task details:', err);
			expandedTaskDetails = {
				labels: [],
				attachments: [],
				timeline: [],
				timelineCounts: { total: 0, beads_events: 0, agent_mail: 0 }
			};
		} finally {
			taskDetailsLoading = false;
		}
	}

	// Fetch only signals and merge into existing timeline (for polling updates)
	async function fetchTaskSignalsOnly(taskId: string) {
		if (!taskId || !expandedTaskDetails) return;

		try {
			const signalsRes = await fetch(`/api/tasks/${taskId}/signals`);
			if (!signalsRes.ok) return;

			const signalsData = await signalsRes.json();
			const signalEvents = (signalsData.signals || []).map((signal: any) => ({
				type: 'signal' as const,
				timestamp: signal.timestamp,
				data: {
					state: signal.state,
					agentName: signal.agent_name,
					...signal.data
				}
			}));

			// Filter out existing signals and only add new ones
			const existingTimestamps = new Set(
				expandedTaskDetails.timeline
					.filter(e => e.type === 'signal')
					.map(e => e.timestamp)
			);
			const newSignals = signalEvents.filter((s: any) => !existingTimestamps.has(s.timestamp));

			if (newSignals.length > 0) {
				// Merge and re-sort timeline
				const mergedTimeline = [...expandedTaskDetails.timeline, ...newSignals]
					.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

				expandedTaskDetails = {
					...expandedTaskDetails,
					timeline: mergedTimeline,
					timelineCounts: {
						...expandedTaskDetails.timelineCounts,
						total: mergedTimeline.length,
						signals: (expandedTaskDetails.timelineCounts.signals || 0) + newSignals.length
					}
				};
			}
		} catch (err) {
			console.error('Failed to fetch task signals:', err);
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

		// Auto-open task panel if this session has a task
		const agentName = getAgentName(sessionName);
		const task = agentTasks.get(agentName);
		if (task) {
			expandedTaskId = task.id;
			taskDetailOpen = true;
			// Fetch extended task details
			fetchExpandedTaskDetails(task.id);
		} else {
			// Close task panel if session has no task
			expandedTaskId = null;
			taskDetailOpen = false;
			expandedTaskDetails = null;
		}

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

	// Container width resize handling
	function startContainerResize(e: MouseEvent) {
		e.preventDefault();
		isContainerResizing = true;
		const startX = e.clientX;
		const startWidth = containerWidth;

		function onMouseMove(e: MouseEvent) {
			const delta = e.clientX - startX;
			// Allow expanding up to 95% of viewport width, minimum 800px
			const maxWidth = window.innerWidth * 0.95;
			containerWidth = Math.max(800, Math.min(maxWidth, startWidth + delta));
		}

		function onMouseUp() {
			isContainerResizing = false;
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
		if (tabId === 'agents') {
			// 'agents' is the default, so no tab param needed
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
			if (tabParam && ['all', 'servers', 'terminal'].includes(tabParam)) {
				activeTab = tabParam;
			} else {
				// Default to 'agents' when no tab param or invalid param
				activeTab = 'agents';
			}
		}
	});

	// Handle sort change from dropdown
	function handleSortChange(value: string, dir: 'asc' | 'desc') {
		sortBy = value as SessionSortOption;
		sortDir = dir;
	}

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
		if (outputPollInterval) {
			clearInterval(outputPollInterval);
		}
		if (taskDetailsPollInterval) {
			clearInterval(taskDetailsPollInterval);
		}
	});

	// Poll for task details (signals) when panel is open
	$effect(() => {
		const shouldPoll = taskDetailOpen && expandedTaskId;

		if (shouldPoll) {
			// Start polling if not already
			if (!taskDetailsPollInterval) {
				taskDetailsPollInterval = setInterval(() => {
					if (expandedTaskId) {
						// Only refetch signals, merge into existing timeline
						fetchTaskSignalsOnly(expandedTaskId);
					}
				}, TASK_DETAILS_POLL_MS);
			}
		} else {
			// Stop polling
			if (taskDetailsPollInterval) {
				clearInterval(taskDetailsPollInterval);
				taskDetailsPollInterval = null;
			}
		}

		// Cleanup on effect re-run
		return () => {
			if (taskDetailsPollInterval) {
				clearInterval(taskDetailsPollInterval);
				taskDetailsPollInterval = null;
			}
		};
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
	<title>Tasks | JAT IDE</title>
	<meta name="description" content="View all tmux sessions including agents, servers, and other sessions. Attach, kill, or expand sessions." />
	<meta property="og:title" content="Tasks | JAT IDE" />
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
				Tasks
			</h1>
		</div>

	</div>

	<!-- Content with resizable width -->
	<div class="tmux-content-wrapper">
		<div class="tmux-content" style="max-width: {containerWidth}px;">
		<!-- Session type tabs + Sort control (above table) -->
		<div class="table-controls">
			<div> </div>
			<!-- <SessionsTabs
				{activeTab}
				counts={sessionCounts()}
				onTabChange={handleTabChange}
			/> -->
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
							<th class="th-task">Task</th>
							<th class="th-agent">Agent</th>
							<th class="th-status">Status</th>
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
								? getProjectColorReactive(sessionTask.id)
								: derivedProject
									? getProjectColorReactive(`${derivedProject}-x`)
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
								<!-- Column 1: TaskIdBadge + Agent below -->
								<td class="td-task">
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
											<span class="session-name">{session.name}</span>
										</div>
									{:else}
										<!-- Agent session: TaskIdBadge with avatar and status ring -->
										<div class="task-cell-content">
											{#if sessionTask}
												<div class="agent-badge-row">
													<TaskIdBadge
														task={sessionTask}
														size="sm"
														variant="agentPill"
														agentName={sessionAgentName}
														showType={true}
														{statusDotColor}
													/>
													{#if session.resumed}
														<span class="resumed-badge" title="Resumed from previous session">
															<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="resumed-icon">
																<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
															</svg>
														</span>
													{/if}
													{#if session.attached}
														<span class="attached-indicator" title="Terminal attached">
															<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="attached-icon">
																<path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
															</svg>
														</span>
													{/if}
												</div>
											{:else}
												<!-- No task - show project badge if known, otherwise session name -->
												<div class="agent-badge-row">
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
													<!-- Still show agent avatar when no task -->
													<AgentAvatar name={sessionAgentName} size={20} />
													<span class="agent-name-inline">{sessionAgentName}</span>
												</div>
											{/if}
										</div>
									{/if}
								</td>
								<!-- Column 2: Task Title + Description -->
								<td class="td-agent">
									{#if session.type === 'agent'}
										<div class="agent-cell-content">
											{#if sessionTask}
												<span class="task-title" title={sessionTask.title}>
													{sessionTask.title || sessionTask.id}
												</span>
												{#if sessionTask.description}
													<div class="task-description">
														{sessionTask.description}
													</div>
												{/if}
											{:else}
												<span class="no-task-label">No active task</span>
											{/if}
										</div>
									{:else}
										<!-- Non-agent sessions show empty -->
										<span class="no-agent-label">Server</span>
									{/if}
								</td>
								<!-- Column 3: Status (StatusActionBadge + expand chevron) -->
								<td class="td-status" onclick={(e) => e.stopPropagation()}>
									{#if session.type === 'agent'}
										<div class="status-cell-content">
											<StatusActionBadge
												sessionState={activityState || 'idle'}
												{elapsed}
												sessionName={session.name}
												alignRight={false}
												onAction={async (actionId) => {
													if (actionId === 'attach') {
														await attachSession(session.name);
													} else if (actionId === 'kill' || actionId === 'cleanup') {
														await killSession(session.name);
													} else if (actionId === 'view-task' && sessionTask) {
														window.location.href = `/tasks?task=${sessionTask.id}`;
													} else if (actionId === 'complete') {
														// Send /jat:complete command to session
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
														await fetch(`/api/work/${encodeURIComponent(session.name)}/input`, {
															method: 'POST',
															headers: { 'Content-Type': 'application/json' },
															body: JSON.stringify({ type: 'ctrl-c' })
														});
													} else if (actionId === 'escape') {
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
											<!-- Expand/Collapse chevron button -->
											<button
												class="expand-btn"
												onclick={(e) => { e.stopPropagation(); toggleExpanded(session.name); }}
												title={isExpanded ? 'Collapse' : 'Expand'}
											>
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="expand-icon" class:expanded={isExpanded}>
													<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
												</svg>
											</button>
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
									<td colspan="3" class="expanded-content">
										<div class="expanded-session-wrapper" class:with-task-panel={expandedTask && taskDetailOpen && expandedTaskId === expandedTask.id} class:collapsing={isCollapsing}>
											<!-- SessionCard section -->
											<div class="session-card-section">
												<div class="expanded-session-card" style="height: {expandedHeight}px;">
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
														sseState={expandedSessionInfo?.activityState}
														sseStateTimestamp={expandedSessionInfo?.activityStateTimestamp}
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
																expandedTaskDetails = null;
															} else {
																expandedTaskId = taskId;
																taskDetailOpen = true;
																fetchExpandedTaskDetails(taskId);
															}
														}}
													/>
												</div>
												<!-- Horizontal resize handle for tmux width -->
												<HorizontalResizeHandle
													onResize={handleHorizontalResize}
													onResizeEnd={handleHorizontalResizeEnd}
												/>
												<!-- Width indicator - visible only during resize -->
												<div class="width-indicator" class:visible={isCardResizing}>{tmuxWidth} cols</div>
											</div>

											<!-- Inline Task Detail Panel -->
											{#if expandedTask && taskDetailOpen && expandedTaskId === expandedTask.id}
												<div class="task-detail-panel" style="height: {expandedHeight}px;">
													<!-- <div class="task-panel-header">
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
													</div> -->
													<div class="task-panel-content">
														<!-- Loading state -->
														{#if taskDetailsLoading}
															<div class="task-panel-loading">
																<span class="loading loading-spinner loading-sm"></span>
																<span>Loading task details...</span>
															</div>
														{:else}
															<!-- Task ID and badges row
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
															</div> -->

															<!-- Title -->
															<!-- <h4 class="task-panel-task-title">{expandedTask.title || 'Untitled'}</h4> -->

															<!-- Description -->
															{#if expandedTask.description}
																<div class="task-panel-section">
																	<span class="task-panel-label">Description</span>
																	<p class="task-panel-description">{expandedTask.description}</p>
																</div>
															{/if}

															<!-- Labels -->
															{#if expandedTaskDetails?.labels && expandedTaskDetails.labels.length > 0}
																<div class="task-panel-section">
																	<span class="task-panel-label">Labels</span>
																	<div class="task-panel-labels">
																		{#each expandedTaskDetails.labels as label}
																			<span class="badge badge-outline badge-sm">{label}</span>
																		{/each}
																	</div>
																</div>
															{/if}

															<!-- Attachments -->
															{#if expandedTaskDetails?.attachments && expandedTaskDetails.attachments.length > 0}
																<div class="task-panel-section">
																	<span class="task-panel-label">
																		Attachments
																		<span class="badge badge-xs ml-1">{expandedTaskDetails.attachments.length}</span>
																	</span>
																	<div class="task-panel-attachments">
																		{#each expandedTaskDetails.attachments as attachment}
																			<a
																				href={attachment.url}
																				target="_blank"
																				rel="noopener noreferrer"
																				class="task-panel-attachment"
																				title={attachment.filename}
																			>
																				<img
																					src={attachment.url}
																					alt={attachment.filename}
																					class="task-panel-attachment-img"
																				/>
																			</a>
																		{/each}
																	</div>
																</div>
															{/if}

															<!-- Dependencies -->
															{#if (expandedTaskDetails?.depends_on && expandedTaskDetails.depends_on.length > 0) || (expandedTaskDetails?.blocked_by && expandedTaskDetails.blocked_by.length > 0)}
																<div class="task-panel-section">
																	<span class="task-panel-label">Dependencies</span>
																	<div class="task-panel-dependencies">
																		{#if expandedTaskDetails?.depends_on && expandedTaskDetails.depends_on.length > 0}
																			<div class="dep-group">
																				<span class="dep-label">Depends on:</span>
																				{#each expandedTaskDetails.depends_on as dep}
																					<a href="/tasks?task={dep.id}" class="dep-item">
																						<span class="dep-id">{dep.id}</span>
																						<span class="badge badge-xs {statusColors[dep.status] || 'badge-ghost'}">{dep.status}</span>
																					</a>
																				{/each}
																			</div>
																		{/if}
																		{#if expandedTaskDetails?.blocked_by && expandedTaskDetails.blocked_by.length > 0}
																			<div class="dep-group">
																				<span class="dep-label">Blocks:</span>
																				{#each expandedTaskDetails.blocked_by as dep}
																					<a href="/tasks?task={dep.id}" class="dep-item">
																						<span class="dep-id">{dep.id}</span>
																						<span class="badge badge-xs {statusColors[dep.status] || 'badge-ghost'}">{dep.status}</span>
																					</a>
																				{/each}
																			</div>
																		{/if}
																	</div>
																</div>
															{/if}

															<!-- Metadata -->
															<div class="task-panel-section">
																<span class="task-panel-label">Metadata</span>
																<div class="task-panel-metadata">
																	{#if expandedTaskDetails?.assignee}
																		<div class="meta-row">
																			<span class="meta-label">Assignee</span>
																			<span class="meta-value">
																				<AgentAvatar name={expandedTaskDetails.assignee} size={16} />
																				{expandedTaskDetails.assignee}
																			</span>
																		</div>
																	{/if}
																	{#if expandedTaskDetails?.created_at}
																		<div class="meta-row">
																			<span class="meta-label">Created</span>
																			<span class="meta-value">{new Date(expandedTaskDetails.created_at).toLocaleDateString()}</span>
																		</div>
																	{/if}
																	{#if expandedTaskDetails?.updated_at}
																		<div class="meta-row">
																			<span class="meta-label">Updated</span>
																			<span class="meta-value">{new Date(expandedTaskDetails.updated_at).toLocaleDateString()}</span>
																		</div>
																	{/if}
																</div>
															</div>

															<!-- Activity Timeline -->
															{#if expandedTaskDetails?.timeline && expandedTaskDetails.timeline.length > 0}
																<div class="task-panel-section task-panel-timeline-section">
																	<div class="timeline-header">
																		<span class="task-panel-label">Activity Timeline</span>
																		<div class="timeline-tabs">
																			<button
																				class="timeline-tab"
																				class:active={timelineFilter === 'all'}
																				onclick={() => timelineFilter = 'all'}
																			>
																				All ({expandedTaskDetails.timelineCounts.total})
																			</button>
																			<button
																				class="timeline-tab"
																				class:active={timelineFilter === 'tasks'}
																				onclick={() => timelineFilter = 'tasks'}
																			>
																				Tasks ({expandedTaskDetails.timelineCounts.beads_events})
																			</button>
																			<button
																				class="timeline-tab"
																				class:active={timelineFilter === 'messages'}
																				onclick={() => timelineFilter = 'messages'}
																			>
																				Messages ({expandedTaskDetails.timelineCounts.agent_mail})
																			</button>
																		</div>
																	</div>
																	<div class="task-panel-timeline">
																		{#each expandedTaskDetails.timeline.filter(e =>
																			timelineFilter === 'all' ||
																			(timelineFilter === 'tasks' && (e.type === 'beads_event' || e.type === 'signal')) ||
																			(timelineFilter === 'messages' && e.type === 'agent_mail')
																		) as event}
																			<div class="timeline-event" class:task-event={event.type === 'beads_event'} class:message-event={event.type === 'agent_mail'} class:signal-event={event.type === 'signal'}>
																				<div class="timeline-event-header">
																					<span class="timeline-event-type">
																						{#if event.type === 'beads_event'}
																							📋
																						{:else if event.type === 'signal'}
																							⚡
																						{:else}
																							💬
																						{/if}
																						{#if event.type === 'signal'}
																							{event.data?.state || 'signal'}
																						{:else}
																							{event.event}
																						{/if}
																					</span>
																					<span class="timeline-event-time">
																						{new Date(event.timestamp).toLocaleString()}
																					</span>
																				</div>
																				{#if event.type === 'signal'}
																					<p class="timeline-event-desc">
																						{#if event.data?.state === 'starting'}
																							Agent {event.data?.agentName || ''} started working
																						{:else if event.data?.state === 'working'}
																							Working on: {event.data?.taskTitle || event.data?.taskId || ''}
																						{:else if event.data?.state === 'review'}
																							Ready for review
																						{:else if event.data?.state === 'needs_input'}
																							{event.data?.question || 'Waiting for input'}
																						{:else if event.data?.state === 'completing'}
																							Completing task (step: {event.data?.currentStep || ''})
																						{:else if event.data?.state === 'completed'}
																							Task completed
																						{:else}
																							State: {event.data?.state || 'unknown'}
																						{/if}
																					</p>
																					{#if event.data?.agentName}
																						<div class="timeline-event-meta">
																							<span class="badge badge-xs badge-outline">@{event.data.agentName}</span>
																						</div>
																					{/if}
																				{:else}
																					<p class="timeline-event-desc">{event.description}</p>
																					{#if event.metadata}
																						<div class="timeline-event-meta">
																							{#if event.metadata.status}
																								<span class="badge badge-xs {statusColors[event.metadata.status]}">{event.metadata.status}</span>
																							{/if}
																							{#if event.metadata.assignee}
																								<span class="badge badge-xs badge-outline">@{event.metadata.assignee}</span>
																							{/if}
																							{#if event.metadata.from_agent}
																								<span class="badge badge-xs badge-outline">from: {event.metadata.from_agent}</span>
																							{/if}
																						</div>
																					{/if}
																				{/if}
																			</div>
																		{/each}
																	</div>
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
														{/if}
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
		{/if}
		</div>
		<!-- Container resize handle (right edge) -->
		<div
			class="container-resize-handle"
			class:resizing={isContainerResizing}
			onmousedown={startContainerResize}
			role="separator"
			aria-orientation="vertical"
			tabindex="0"
			title="Drag to resize container width"
		>
			<div class="container-resize-bar"></div>
		</div>
		<!-- Width indicator -->
		<div class="container-width-indicator" class:visible={isContainerResizing}>
			{containerWidth}px
		</div>
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

	/* Content wrapper with resize handle */
	.tmux-content-wrapper {
		position: relative;
		display: flex;
		align-items: flex-start;
		gap: 0;
	}

	/* Content */
	.tmux-content {
		/* max-width controlled by inline style */
		flex: 0 0 auto;
		transition: max-width 0.05s ease-out;
	}

	/* Container resize handle (right edge) - sticky to stay visible while scrolling */
	.container-resize-handle {
		position: sticky;
		top: 80px; /* Below header */
		align-self: flex-start;
		width: 12px;
		height: 80px;
		cursor: ew-resize;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		margin-left: -4px;
		z-index: 10;
	}

	.container-resize-bar {
		width: 4px;
		height: 60px;
		background: oklch(0.30 0.02 250);
		border-radius: 2px;
		transition: all 0.15s;
	}

	.container-resize-handle:hover .container-resize-bar {
		background: oklch(0.50 0.08 200);
		height: 80px;
		width: 5px;
	}

	.container-resize-handle.resizing .container-resize-bar {
		background: oklch(0.65 0.15 200);
		height: 100px;
		width: 6px;
	}

	/* Width indicator */
	.container-width-indicator {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: oklch(0.20 0.02 250);
		border: 1px solid oklch(0.35 0.02 250);
		padding: 0.375rem 0.75rem;
		border-radius: 6px;
		font-size: 0.75rem;
		font-family: ui-monospace, monospace;
		color: oklch(0.70 0.12 200);
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.15s;
		z-index: 100;
	}

	.container-width-indicator.visible {
		opacity: 1;
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

	/* Three-column layout widths */
	.th-task, .td-task { width: 15%; min-width: 120px; }
	.th-agent, .td-agent { width: 65%; }
	.th-status, .td-status { width: 20%; min-width: 140px; text-align: right; }

	/* Task column (Column 1) - badge on top, agent below */
	.task-cell-content {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.25rem;
		width: 100%;
		min-width: 0;
	}

	/* Agent column (Column 2) - inner flex container */
	.agent-cell-content {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		width: 100%;
		min-width: 0;
	}

	.no-agent-label {
		font-size: 0.75rem;
		color: oklch(0.50 0.02 250);
		font-style: italic;
	}

	/* Status column (Column 3) - right aligned, stacked vertically */
	.status-cell-content {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.375rem;
		justify-content: center;
	}

	/* Expand/Collapse button */
	.expand-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: oklch(0.22 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 6px;
		color: oklch(0.65 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.expand-btn:hover {
		background: oklch(0.28 0.02 250);
		border-color: oklch(0.40 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	.expand-icon {
		width: 16px;
		height: 16px;
		transition: transform 0.2s ease;
	}

	.expand-icon.expanded {
		transform: rotate(180deg);
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
		font-size: 1rem;
		font-weight: 500;
		color: oklch(0.80 0.02 250);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		min-width: 0; /* Allow truncation */
	}

	.task-description {
		font-size: 0.75rem;
		color: oklch(0.65 0.05 200);
		margin-top: 0.125rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		width: 100%;
		max-width: 100%;
	}

	.agent-info-row {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.agent-badge-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.agent-name {
		font-size: 1rem;
		font-weight: 700;
		color: oklch(0.75 0.02 250);
		white-space: nowrap;
	}

	.agent-name-inline {
		font-size: 0.8125rem;
		font-weight: 500;
		color: oklch(0.70 0.02 250);
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

	/* Resumed session indicator */
	.resumed-badge {
		display: flex;
		align-items: center;
		margin-left: 0.25rem;
	}

	.resumed-icon {
		width: 12px;
		height: 12px;
		color: oklch(0.70 0.15 200);
		filter: drop-shadow(0 0 3px oklch(0.65 0.15 200 / 0.6));
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

	/* Wrapper for expanded session with horizontal resize */
	.expanded-session-wrapper {
		position: relative;
		padding: 1rem;
		display: flex;
		gap: 1rem;
		animation: expand-slide-down 0.2s ease-out;
	}

	.expanded-session-wrapper.collapsing {
		animation: expand-slide-up 0.2s ease-out forwards;
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

	/* Task panel loading state */
	.task-panel-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 2rem;
		color: oklch(0.55 0.02 250);
		font-size: 0.8rem;
	}

	/* Labels section */
	.task-panel-labels {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	/* Attachments section */
	.task-panel-attachments {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.task-panel-attachment {
		display: block;
		width: 64px;
		height: 64px;
		border-radius: 6px;
		overflow: hidden;
		border: 1px solid oklch(0.28 0.02 250);
		transition: all 0.15s;
	}

	.task-panel-attachment:hover {
		border-color: oklch(0.45 0.12 200);
		transform: scale(1.05);
	}

	.task-panel-attachment-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* Dependencies section */
	.task-panel-dependencies {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.dep-group {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.dep-label {
		font-size: 0.7rem;
		font-weight: 500;
		color: oklch(0.55 0.02 250);
	}

	.dep-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem;
		background: oklch(0.20 0.02 250);
		border-radius: 4px;
		text-decoration: none;
		transition: all 0.15s;
	}

	.dep-item:hover {
		background: oklch(0.25 0.04 200);
	}

	.dep-id {
		font-size: 0.75rem;
		font-family: ui-monospace, monospace;
		color: oklch(0.70 0.12 200);
	}

	/* Metadata section */
	.task-panel-metadata {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.meta-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.meta-label {
		font-size: 0.7rem;
		color: oklch(0.50 0.02 250);
	}

	.meta-value {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		color: oklch(0.75 0.02 250);
	}

	/* Activity Timeline section */
	.task-panel-timeline-section {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.timeline-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.timeline-tabs {
		display: flex;
		gap: 0.25rem;
	}

	.timeline-tab {
		padding: 0.25rem 0.5rem;
		font-size: 0.65rem;
		font-weight: 500;
		color: oklch(0.55 0.02 250);
		background: transparent;
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.timeline-tab:hover {
		background: oklch(0.22 0.02 250);
		color: oklch(0.70 0.02 250);
	}

	.timeline-tab.active {
		background: oklch(0.25 0.04 200);
		border-color: oklch(0.45 0.12 200);
		color: oklch(0.80 0.12 200);
	}

	/* Timeline events list */
	.task-panel-timeline {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-right: 0.25rem;
	}

	.timeline-event {
		padding: 0.5rem;
		background: oklch(0.18 0.01 250);
		border-radius: 6px;
		border-left: 2px solid oklch(0.35 0.02 250);
	}

	.timeline-event.task-event {
		border-left-color: oklch(0.60 0.15 200);
	}

	.timeline-event.message-event {
		border-left-color: oklch(0.65 0.15 280);
	}

	.timeline-event.signal-event {
		border-left-color: oklch(0.70 0.18 85); /* amber/yellow for signals */
	}

	.timeline-event-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.timeline-event-type {
		font-size: 0.7rem;
		font-weight: 600;
		color: oklch(0.70 0.02 250);
	}

	.timeline-event-time {
		font-size: 0.65rem;
		color: oklch(0.50 0.02 250);
	}

	.timeline-event-desc {
		font-size: 0.75rem;
		color: oklch(0.65 0.02 250);
		margin: 0;
		line-height: 1.4;
	}

	.timeline-event-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-top: 0.375rem;
	}

	/* Override SessionCard styles when embedded in table */
	.expanded-session-card :global(.session-card) {
		border-radius: 8px;
		border: 1px solid oklch(0.28 0.02 250);
		max-width: none;
		width: 100%;
	}

	/* Width indicator - positioned within session-card-section, hidden by default */
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
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.session-card-section .width-indicator.visible {
		opacity: 1;
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
