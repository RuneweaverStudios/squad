<script lang="ts">
	import { onMount } from 'svelte';
	import { analyzeDependencies } from '$lib/utils/dependencyUtils';
	import { HIGH_USAGE_WARNING_THRESHOLD } from '$lib/config/tokenUsageConfig';
	import { getTaskStatusVisual, STATUS_ICONS } from '$lib/config/statusColors';
	import TaskIdBadge from '$lib/components/TaskIdBadge.svelte';
	import Sparkline from '$lib/components/Sparkline.svelte';
	import TokenUsageDisplay from '$lib/components/TokenUsageDisplay.svelte';
	import { getAgentStatusBadge, getAgentStatusIcon, getAgentStatusVisual } from '$lib/utils/badgeHelpers';
	import { formatLastActivity, formatActivityTimestamp } from '$lib/utils/dateFormatters';
	import { computeAgentStatus } from '$lib/utils/agentStatusUtils';
	import { createModalState } from '$lib/utils/modalStateHelpers.svelte';
	import AnimatedDigits from '$lib/components/AnimatedDigits.svelte';
	import AgentAvatar from '$lib/components/AgentAvatar.svelte';
	import { openOutputDrawerForSession } from '$lib/stores/drawerStore';
	import type { Agent, Task, Reservation } from '$lib/stores/agents.svelte';

	// Extended types for inbox messages
	interface InboxMessage {
		id: number;
		subject: string;
		body: string;
		from: string;
		sent_ts: string;
		read: boolean;
	}

	// Sparkline data point type
	interface SparklinePoint {
		timestamp: string;
		tokens: number;
		cost: number;
	}

	// Multi-project sparkline types
	interface ProjectTokenData {
		project: string;
		tokens: number;
		cost: number;
		color: string;
	}

	interface MultiProjectSparklinePoint {
		timestamp: string;
		totalTokens: number;
		totalCost: number;
		projects: ProjectTokenData[];
	}

	interface ProjectMeta {
		name: string;
		color: string;
		totalTokens: number;
	}

	// Props with types
	interface Props {
		agent: Agent;
		tasks?: Task[];
		allTasks?: Task[];
		reservations?: Reservation[];
		onTaskAssign?: (taskId: string, agentName: string) => Promise<void>;
		ontaskclick?: (taskId: string) => void;
		draggedTaskId?: string | null;
		/** Whether this agent is currently highlighted (e.g., from clicking avatar elsewhere) */
		isHighlighted?: boolean;
	}

	let { agent, tasks = [], allTasks = [], reservations = [], onTaskAssign = async () => {}, ontaskclick = () => {}, draggedTaskId = null, isHighlighted = false }: Props = $props();

	let isDragOver = $state(false);
	let isAssigning = $state(false);
	let assignSuccess = $state(false);
	let assignError = $state<string | null>(null);
	let hasConflict = $state(false);
	let conflictReasons = $state<string[]>([]);
	let hasDependencyBlock = $state(false);
	let dependencyBlockReason = $state('');
	// Delete modal using shared helper (example of modalStateHelpers usage)
	const deleteModal = createModalState();

	// Quick actions menu state
	let showQuickActions = $state(false);
	let quickActionsX = $state(0);
	let quickActionsY = $state(0);
	let quickActionsLoading = $state<string | null>(null); // Track which action is loading
	let showInboxModal = $state(false);
	let inboxMessages = $state<InboxMessage[]>([]);
	let showReservationsModal = $state(false);
	let reservationsList = $state<Reservation[]>([]);
	let showSendMessageModal = $state(false);
	let messageSubject = $state('');
	let messageBody = $state('');
	let showClearQueueModal = $state(false);
	let showUnassignModal = $state(false);
	let showActivityHistory = $state(false);

	// Session control state
	let sessionControlLoading = $state<string | null>(null); // 'kill' | 'interrupt' | 'continue' | slash command name
	let showSlashDropdown = $state(false);

	// Tab state: 'activity' | 'locks' | 'output'
	let activeTab = $state<'activity' | 'locks' | 'output'>('activity');

	// Output polling state
	let outputContent = $state<string>('');
	let outputLoading = $state(false);
	let outputError = $state<string | null>(null);
	let outputPollingInterval = $state<ReturnType<typeof setInterval> | null>(null);

	// Token usage state management
	let usageLoading = $state(false);
	let usageError = $state<string | null>(null);
	let usageRetryCount = $state(0);

	// Sparkline state management
	// NOTE: Sparkline is fetched once on mount, not polled.
	// With 57 agents, polling every 30s would be 114 API calls/minute!
	let sparklineData = $state<SparklinePoint[]>([]);
	let sparklineLoading = $state(false);
	let sparklineError = $state<string | null>(null);

	// Multi-project sparkline state
	let multiProjectData = $state<MultiProjectSparklinePoint[]>([]);
	let projectColors = $state<Record<string, string>>({});
	let projectKeys = $state<string[]>([]);

	// Transform multi-project data into Sparkline's expected format
	const multiSeriesData = $derived.by(() => {
		if (!multiProjectData || multiProjectData.length === 0) return undefined;

		return multiProjectData.map((point) => {
			const projects: Record<string, { tokens: number; cost: number }> = {};
			for (const p of point.projects) {
				projects[p.project] = { tokens: p.tokens, cost: p.cost };
			}
			return {
				timestamp: point.timestamp,
				projects,
				total: { tokens: point.totalTokens, cost: point.totalCost }
			};
		});
	});

	// Build project metadata for Sparkline (with colors and totals)
	const projectMeta = $derived.by(() => {
		if (!multiProjectData || multiProjectData.length === 0) return undefined;

		// Sum tokens per project across all data points
		const projectTotals = new Map<string, number>();
		for (const point of multiProjectData) {
			for (const p of point.projects) {
				projectTotals.set(p.project, (projectTotals.get(p.project) || 0) + p.tokens);
			}
		}

		// Build metadata array sorted by total tokens (descending)
		const meta: ProjectMeta[] = [];
		for (const [name, totalTokens] of projectTotals.entries()) {
			meta.push({
				name,
				color: projectColors[name] || '#888888',
				totalTokens
			});
		}

		return meta.sort((a, b) => b.totalTokens - a.totalTokens);
	});

	// Get active projects (non-zero tokens) for legend display
	const activeProjects = $derived.by(() => {
		if (!projectMeta) return [];
		return projectMeta.filter((p) => p.totalTokens > 0).slice(0, 3); // Limit to top 3 for compact display
	});

	// Check if we have multi-project data to display
	const hasMultiProjectData = $derived(multiSeriesData && multiSeriesData.length > 0 && projectMeta && projectMeta.length > 0);

	// Compute agent status using shared utility - use $derived.by() for proper reactivity
	// States: live (< 1m, truly responsive) > working (1-10m with task) > active (recent activity) > idle (within 1h) > offline (>1h)
	const agentStatus = $derived.by(() => computeAgentStatus(agent));
	const statusVisual = $derived.by(() => getAgentStatusVisual(agentStatus));

	// Compute current task (in-progress tasks assigned to this agent)
	const currentTask = $derived.by(() => {
		const inProgressTasks = tasks.filter(
			(t) => t.assignee === agent.name && t.status === 'in_progress'
		);
		return inProgressTasks.length > 0 ? inProgressTasks[0] : null;
	});

	// Compute queued tasks (open tasks assigned to this agent)
	const queuedTasks = $derived.by(() => {
		return tasks.filter((t) => t.assignee === agent.name && t.status === 'open');
	});

	// Compute file locks held by this agent
	const agentLocks = $derived.by(() => {
		return reservations.filter(
			(r) =>
				(r.agent_name === agent.name || r.agent === agent.name) &&
				(!r.released_ts) &&
				new Date(r.expires_ts) > new Date()
		);
	});


	// Extended Task type with additional fields from API
	interface ExtendedTask extends Task {
		created_at?: string;
		updated_at?: string;
	}

	// Calculate progress for current task (simple estimation based on time)
	function getTaskProgress(task: ExtendedTask | null): number {
		if (!task) return 0;

		// Simple heuristic: if task has been in progress, show 30-70% random progress
		// In a real system, this would come from task metadata
		const created = new Date(task.created_at || task.updated_at || Date.now());
		const now = new Date();
		const elapsed = now.getTime() - created.getTime();
		const oneHour = 3600000;

		// Show progress based on time elapsed (0-70% over first 2 hours)
		const progress = Math.min((elapsed / (oneHour * 2)) * 70, 70);
		return Math.floor(progress);
	}

	// Handle drop event
	async function handleDrop(event: DragEvent): Promise<void> {
		event.preventDefault();
		isDragOver = false;

		// Prevent drop if there's a dependency block
		if (hasDependencyBlock) {
			console.warn('Cannot assign task: has unresolved dependencies');
			hasDependencyBlock = false;
			dependencyBlockReason = '';
			return;
		}

		// Prevent drop if there's a conflict
		if (hasConflict) {
			console.warn('Cannot assign task: file reservation conflict');
			hasConflict = false;
			conflictReasons = [];
			return;
		}

		const taskId = event.dataTransfer?.getData('text/plain');
		if (!taskId) return;

		// Clear previous errors and show loading state
		assignError = null;
		isAssigning = true;

		try {
			// Call parent callback to assign task with timeout (30 seconds)
			const timeoutPromise = new Promise<void>((_, reject) =>
				setTimeout(() => reject(new Error('Assignment timed out after 30 seconds')), 30000)
			);

			await Promise.race([
				onTaskAssign(taskId, agent.name),
				timeoutPromise
			]);

			// Success - show success animation!
			assignError = null;
			isAssigning = false;
			assignSuccess = true;

			// Auto-hide success animation after 2 seconds
			setTimeout(() => {
				assignSuccess = false;
			}, 2000);
		} catch (error: unknown) {
			console.error('Failed to assign task:', error);
			assignError = error instanceof Error ? error.message : 'Failed to assign task';
			isAssigning = false;

			// Auto-clear error after 5 seconds
			setTimeout(() => {
				assignError = null;
			}, 5000);
		}
	}

	// Infer file patterns from task based on labels and description
	function inferFilePatterns(task: Task | null): string[] {
		if (!task) return [];

		const patterns: string[] = [];

		// Extract glob patterns from description (e.g., "src/**/*.ts")
		const descriptionPatterns = task.description?.match(/[\w-]+\/\*\*?\/\*\.\w+/g) || [];
		patterns.push(...descriptionPatterns);

		// Infer from labels (common patterns)
		const labelPatternMap: Record<string, string[]> = {
			dashboard: ['dashboard/**/*'],
			frontend: ['dashboard/**/*', 'frontend/**/*'],
			backend: ['backend/**/*', 'server/**/*', 'api/**/*'],
			browser: ['browser/**/*', 'tools/browser-*.js'],
			'agent-mail': ['agent-mail/**/*'],
			database: ['database/**/*'],
			monitoring: ['monitoring/**/*'],
			development: ['development/**/*']
		};

		task.labels?.forEach((label) => {
			if (labelPatternMap[label]) {
				patterns.push(...labelPatternMap[label]);
			}
		});

		return [...new Set(patterns)]; // Remove duplicates
	}

	// Check if two glob patterns conflict (simple overlap detection)
	function patternsConflict(pattern1: string, pattern2: string): boolean {
		// Simple heuristic: check if patterns share a common prefix
		// In a real system, use a proper glob matching library
		const normalize = (p: string) => p.replace(/\*/g, '').replace(/\//g, '');
		const p1 = normalize(pattern1);
		const p2 = normalize(pattern2);

		// Check if one pattern is a substring of the other
		return p1.includes(p2) || p2.includes(p1) || p1 === p2;
	}

	// Conflict result type
	interface ConflictResult {
		hasConflict: boolean;
		reasons: string[];
	}

	// Detect conflicts between task and agent's reservations
	function detectConflicts(taskId: string | null): ConflictResult {
		if (!taskId) return { hasConflict: false, reasons: [] };

		// Find the task
		const task = tasks.find((t) => t.id === taskId);
		if (!task) return { hasConflict: false, reasons: [] };

		// Infer file patterns needed by the task
		const taskPatterns = inferFilePatterns(task);
		if (taskPatterns.length === 0) {
			// No patterns means no conflicts
			return { hasConflict: false, reasons: [] };
		}

		// Get agent's active reservations
		const agentReservations = agentLocks;
		if (agentReservations.length === 0) {
			return { hasConflict: false, reasons: [] };
		}

		// Extended reservation type with additional fields
		interface ExtendedReservation extends Reservation {
			file_pattern?: string;
			pattern?: string;
		}

		// Check for conflicts
		const conflicts: Array<{taskPattern: string; reservedPattern: string; reservation: Reservation}> = [];
		for (const reservation of agentReservations as ExtendedReservation[]) {
			const reservedPattern = reservation.file_pattern || reservation.pattern || reservation.path_pattern;
			for (const taskPattern of taskPatterns) {
				if (patternsConflict(taskPattern, reservedPattern)) {
					conflicts.push({
						taskPattern,
						reservedPattern,
						reservation
					});
				}
			}
		}

		return {
			hasConflict: conflicts.length > 0,
			reasons: conflicts.map((c) => `${c.taskPattern} conflicts with ${c.reservedPattern}`)
		};
	}

	function handleDragOver(event: DragEvent): void {
		event.preventDefault();
		isDragOver = true;

		// Check for dependency blocks
		const taskId = event.dataTransfer?.getData('text/plain') || null;
		const task = tasks.find((t) => t.id === taskId);
		if (task) {
			const depStatus = analyzeDependencies(task);
			hasDependencyBlock = depStatus.hasBlockers;
			dependencyBlockReason = depStatus.blockingReason || '';
		}

		// Check for conflicts with the dragged task (only if not dependency-blocked)
		if (!hasDependencyBlock) {
			const conflictResult = detectConflicts(taskId);
			hasConflict = conflictResult.hasConflict;
			conflictReasons = conflictResult.reasons;
		}

		// Set drag effect based on blocks
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = hasDependencyBlock || hasConflict ? 'none' : 'move';
		}
	}

	function handleDragLeave(): void {
		isDragOver = false;
		hasConflict = false;
		conflictReasons = [];
		hasDependencyBlock = false;
		dependencyBlockReason = '';
	}

	// Handle agent deletion
	async function handleDeleteAgent(): Promise<void> {
		deleteModal.setLoading(true);
		try {
			const response = await fetch(`/api/agents/${agent.name}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const error = await response.json();
				deleteModal.setError(error.message || 'Failed to delete agent');
				return;
			}

			// Success - close modal and refresh page
			deleteModal.close();
			window.location.reload();
		} catch (error: unknown) {
			deleteModal.setError(error instanceof Error ? error.message : 'Unknown error');
		}
	}

	// Handle badge click for offline agents
	function handleBadgeClick(): void {
		if (agentStatus === 'offline') {
			deleteModal.open();
		}
	}

	// Fetch sparkline data for this agent (multi-project mode)
	async function fetchSparklineData(): Promise<void> {
		try {
			sparklineLoading = true;
			sparklineError = null;

			// Fetch multi-project sparkline data filtered by this agent
			const response = await fetch(`/api/agents/sparkline?range=24h&agent=${encodeURIComponent(agent.name)}&multiProject=true`);

			if (!response.ok) {
				throw new Error(`Failed to fetch sparkline data: ${response.statusText}`);
			}

			const data = await response.json();

			// Store multi-project data
			multiProjectData = data.data || [];
			projectColors = data.projectColors || {};
			projectKeys = data.projectKeys || [];

			// Also convert to single-series format for backward compatibility
			sparklineData = (data.data || []).map((point: MultiProjectSparklinePoint) => ({
				timestamp: point.timestamp,
				tokens: point.totalTokens,
				cost: point.totalCost
			}));

		} catch (error: unknown) {
			console.error('Error fetching sparkline data:', error);
			sparklineError = error instanceof Error ? error.message : 'Unknown error';
			sparklineData = [];
			multiProjectData = [];
			projectColors = {};
			projectKeys = [];
		} finally {
			sparklineLoading = false;
		}
	}

	// Fetch sparkline once on mount, but SKIP for offline agents (saves API calls + memory)
	onMount(() => {
		// Only fetch sparkline for active agents - offline agents don't need real-time charts
		const status = computeAgentStatus(agent);
		if (status !== 'offline') {
			fetchSparklineData();
		}
	});

	// Handle right-click to show quick actions menu
	function handleContextMenu(event: MouseEvent): void {
		event.preventDefault();
		quickActionsX = event.clientX;
		quickActionsY = event.clientY;
		showQuickActions = true;
	}

	// Close quick actions menu
	function closeQuickActions(): void {
		showQuickActions = false;
		quickActionsLoading = null;
	}

	// Quick Action: View agent's inbox
	async function viewInbox(): Promise<void> {
		quickActionsLoading = 'inbox';
		try {
			const response = await fetch(`/api/agents/${agent.name}/inbox`);
			if (!response.ok) throw new Error('Failed to fetch inbox');
			const data = await response.json();
			inboxMessages = data.messages || [];
			showInboxModal = true;
		} catch (error: unknown) {
			console.error('Failed to view inbox:', error);
			alert(`Failed to view inbox: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			quickActionsLoading = null;
			closeQuickActions();
		}
	}

	// Quick Action: View file locks
	async function viewReservations(): Promise<void> {
		quickActionsLoading = 'reservations';
		try {
			const response = await fetch(`/api/agents/${agent.name}/reservations`);
			if (!response.ok) throw new Error('Failed to fetch reservations');
			const data = await response.json();
			reservationsList = data.reservations || [];
			showReservationsModal = true;
		} catch (error: unknown) {
			console.error('Failed to view reservations:', error);
			alert(`Failed to view reservations: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			quickActionsLoading = null;
			closeQuickActions();
		}
	}

	// Release a file reservation
	async function releaseReservation(lockId: number, pattern: string): Promise<void> {
		if (!confirm(`Release lock on ${pattern}?\n\nThis will allow other agents to modify these files.`)) {
			return;
		}

		try {
			const response = await fetch(`/api/agents/${agent.name}/reservations?id=${lockId}`, {
				method: 'DELETE'
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || 'Failed to release reservation');
			}

			// Refresh the reservations list
			const refreshResponse = await fetch(`/api/agents/${agent.name}/reservations`);
			const refreshData = await refreshResponse.json();
			reservationsList = refreshData.reservations || [];

			// Show success message
			alert(`✓ Released lock on ${pattern}`);

		} catch (error: unknown) {
			console.error('Failed to release reservation:', error);
			alert(`Failed to release reservation: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	// Quick Action: Send message
	function openSendMessage(): void {
		messageSubject = '';
		messageBody = '';
		showSendMessageModal = true;
		closeQuickActions();
	}

	async function sendMessage(): Promise<void> {
		if (!messageSubject.trim() || !messageBody.trim()) {
			alert('Please fill in both subject and message');
			return;
		}

		try {
			const response = await fetch(`/api/agents/${agent.name}/message`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					subject: messageSubject,
					body: messageBody
				})
			});

			if (!response.ok) throw new Error('Failed to send message');

			showSendMessageModal = false;
			alert('Message sent successfully!');
		} catch (error: unknown) {
			console.error('Failed to send message:', error);
			alert(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	// Quick Action: Clear agent's queue
	function confirmClearQueue(): void {
		showClearQueueModal = true;
		closeQuickActions();
	}

	async function clearQueue(): Promise<void> {
		try {
			const response = await fetch(`/api/agents/${agent.name}/clear-queue`, {
				method: 'POST'
			});

			if (!response.ok) throw new Error('Failed to clear queue');

			showClearQueueModal = false;
			window.location.reload();
		} catch (error: unknown) {
			console.error('Failed to clear queue:', error);
			alert(`Failed to clear queue: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	// Quick Action: Unassign current task
	function confirmUnassignTask(): void {
		if (!currentTask) {
			alert('No current task to unassign');
			closeQuickActions();
			return;
		}
		showUnassignModal = true;
		closeQuickActions();
	}

	async function unassignCurrentTask(): Promise<void> {
		const task = currentTask;
		if (!task) return;

		try {
			const response = await fetch(`/api/agents/${agent.name}/unassign-task`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ taskId: task.id })
			});

			if (!response.ok) throw new Error('Failed to unassign task');

			showUnassignModal = false;
			window.location.reload();
		} catch (error: unknown) {
			console.error('Failed to unassign task:', error);
			alert(`Failed to unassign task: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	// Extended agent type with usage data
	interface AgentWithUsage extends Agent {
		usage?: {
			lastUpdated?: string;
			today?: { total_tokens: number; cost: number };
			week?: { total_tokens: number; cost: number; sessionCount?: number };
		};
	}

	// Retry fetching token usage (exponential backoff)
	async function retryFetchUsage(): Promise<void> {
		if (usageRetryCount >= 3) {
			usageError = 'Max retry attempts reached (3). Please refresh the page.';
			return;
		}

		usageLoading = true;
		usageError = null;

		// Exponential backoff: 1s, 2s, 4s
		const delay = Math.pow(2, usageRetryCount) * 1000;
		await new Promise(resolve => setTimeout(resolve, delay));

		try {
			// Trigger parent page to refetch agent data
			// For now, just reload the page (could be improved with proper state management)
			window.location.reload();
		} catch (error: unknown) {
			usageError = error instanceof Error ? error.message : 'Failed to fetch token usage';
			usageRetryCount++;
		} finally {
			usageLoading = false;
		}
	}

	// Check if usage data is stale (>5 minutes old)
	function isUsageStale(): boolean {
		const agentWithUsage = agent as AgentWithUsage;
		if (!agentWithUsage.usage || !agentWithUsage.usage.lastUpdated) return false;

		const lastUpdated = new Date(agentWithUsage.usage.lastUpdated);
		const now = new Date();
		const diffMs = now.getTime() - lastUpdated.getTime();
		const diffMinutes = diffMs / 60000;

		return diffMinutes > 5;
	}

	// Extract task ID from activity preview text
	// Looks for pattern like "[jat-abc]" or "jat-abc" in the preview
	function extractTaskId(preview: string | null | undefined): string | null {
		if (!preview) return null;

		// Match task ID pattern: [project-xxx] or just project-xxx
		// Task IDs have 3-8 alphanumeric chars after the hyphen (e.g., jat-abc, jat-wuxb, chimaro-12ab)
		const match = preview.match(/\[?([a-z0-9_-]+-[a-z0-9]{3,8})\]?/i);
		return match ? match[1] : null;
	}


	// Handle activity item click
	// If the activity contains a task ID, call the parent's ontaskclick handler
	function handleActivityClick(activity) {
		const taskId = extractTaskId(activity.preview);
		if (taskId && ontaskclick) {
			ontaskclick(taskId);
		}
	}

	// Copy to clipboard
	let copiedTaskId = $state<string | null>(null);

	async function copyTaskId(taskId: string, event: MouseEvent): Promise<void> {
		event.stopPropagation(); // Don't trigger parent click handlers
		try {
			await navigator.clipboard.writeText(taskId);
			copiedTaskId = taskId;
			setTimeout(() => {
				copiedTaskId = null;
			}, 1500);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	// ═══════════════════════════════════════════════════════════════════════
	// SESSION CONTROL FUNCTIONS
	// Kill session, send Ctrl+C interrupt, send continue, slash commands
	// ═══════════════════════════════════════════════════════════════════════

	// Kill the agent's tmux session
	async function killSession(): Promise<void> {
		if (!confirm(`Kill session for ${agent.name}?\n\nThis will terminate the Claude Code session.`)) {
			return;
		}

		sessionControlLoading = 'kill';
		try {
			const response = await fetch(`/api/sessions/${encodeURIComponent(agent.name)}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to kill session');
			}

			// Refresh page to update agent status
			window.location.reload();
		} catch (error: unknown) {
			console.error('Failed to kill session:', error);
			alert(`Failed to kill session: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			sessionControlLoading = null;
		}
	}

	// Send Ctrl+C interrupt to agent's session
	async function sendInterrupt(): Promise<void> {
		sessionControlLoading = 'interrupt';
		try {
			const response = await fetch(`/api/sessions/${encodeURIComponent(agent.name)}/input`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type: 'interrupt' })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to send interrupt');
			}
		} catch (error: unknown) {
			console.error('Failed to send interrupt:', error);
			alert(`Failed to send interrupt: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			sessionControlLoading = null;
		}
	}

	// Send 'continue' text to agent's session
	async function sendContinue(): Promise<void> {
		sessionControlLoading = 'continue';
		try {
			const response = await fetch(`/api/sessions/${encodeURIComponent(agent.name)}/input`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type: 'text', text: 'continue' })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to send continue');
			}
		} catch (error: unknown) {
			console.error('Failed to send continue:', error);
			alert(`Failed to send continue: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			sessionControlLoading = null;
		}
	}

	// Send slash command to agent's session
	async function sendSlashCommand(command: string): Promise<void> {
		sessionControlLoading = command;
		showSlashDropdown = false;
		try {
			const response = await fetch(`/api/sessions/${encodeURIComponent(agent.name)}/input`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type: 'text', text: `/jat:${command}` })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || `Failed to send /${command}`);
			}
		} catch (error: unknown) {
			console.error(`Failed to send /${command}:`, error);
			alert(`Failed to send /${command}: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			sessionControlLoading = null;
		}
	}

	// Toggle slash command dropdown
	function toggleSlashDropdown(event: MouseEvent): void {
		event.stopPropagation();
		showSlashDropdown = !showSlashDropdown;
	}

	// Close slash dropdown when clicking outside
	function closeSlashDropdown(): void {
		showSlashDropdown = false;
	}

	// ═══════════════════════════════════════════════════════════════════════
	// OUTPUT TAB FUNCTIONS
	// Fetch and poll terminal output for this agent's session
	// ═══════════════════════════════════════════════════════════════════════

	// Fetch output from the agent's session
	async function fetchOutput(): Promise<void> {
		if (agentStatus === 'offline') {
			outputContent = '';
			outputError = 'Agent is offline - no active session';
			return;
		}

		try {
			outputLoading = outputContent.length === 0; // Only show loading on first fetch
			outputError = null;

			const response = await fetch(`/api/sessions/${encodeURIComponent(agent.name)}/output`);

			if (!response.ok) {
				if (response.status === 404) {
					outputError = 'No active session found';
				} else {
					const data = await response.json();
					throw new Error(data.message || 'Failed to fetch output');
				}
				return;
			}

			const data = await response.json();
			outputContent = data.output || '';
		} catch (error: unknown) {
			console.error('Failed to fetch session output:', error);
			outputError = error instanceof Error ? error.message : 'Unknown error';
		} finally {
			outputLoading = false;
		}
	}

	// Start polling when output tab is active
	function startOutputPolling(): void {
		if (outputPollingInterval) return; // Already polling

		// Initial fetch
		fetchOutput();

		// Poll every 500ms as specified in task description
		outputPollingInterval = setInterval(fetchOutput, 500);
	}

	// Stop polling when leaving output tab
	function stopOutputPolling(): void {
		if (outputPollingInterval) {
			clearInterval(outputPollingInterval);
			outputPollingInterval = null;
		}
	}

	// Handle tab change
	function setActiveTab(tab: 'activity' | 'locks' | 'output'): void {
		// Stop output polling when leaving output tab
		if (activeTab === 'output' && tab !== 'output') {
			stopOutputPolling();
		}

		activeTab = tab;

		// Start output polling when entering output tab
		if (tab === 'output') {
			startOutputPolling();
		}
	}

	// Clean up polling on unmount
	import { onDestroy } from 'svelte';
	onDestroy(() => {
		stopOutputPolling();
	});
</script>

<!-- Industrial/Terminal AgentCard -->
<div
	class="ml-0.5 mt-0.5 relative h-full flex flex-col rounded-lg overflow-hidden transition-all duration-200
		{isDragOver && hasConflict ? 'scale-[1.02]' : isDragOver ? 'scale-[1.02]' : ''}
		{isAssigning || assignSuccess ? 'pointer-events-none' : ''}
		{agentStatus === 'offline' ? 'opacity-50 hover:opacity-90' : ''}
		{isHighlighted ? 'agent-highlight-flash ring-2 ring-info ring-offset-2 ring-offset-base-100' : ''}"
	style="
		background: linear-gradient(135deg, {statusVisual.bgTint} 0%, transparent 50%);
		border: 1px solid oklch(0.5 0 0 / 0.15);
		box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.05), 0 2px 8px oklch(0 0 0 / 0.1);
	"
	role="button"
	tabindex="0"
	data-agent-name={agent.name}
	ondrop={handleDrop}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	oncontextmenu={handleContextMenu}
>
	<!-- Status accent bar (left edge) -->
	<div
		class="absolute left-0 top-0 bottom-0 w-1 transition-all duration-300"
		style="background: {statusVisual.accent}; box-shadow: 0 0 12px {statusVisual.glow};"
	></div>

	<!-- Drag-over border overlay -->
	{#if isDragOver}
		<div
			class="absolute inset-0 pointer-events-none rounded-lg border-2 border-dashed transition-all z-10
				{hasConflict || hasDependencyBlock ? 'border-error bg-error/5' : 'border-success bg-success/5'}"
		></div>
	{/if}

	<!-- Loading Overlay -->
	{#if isAssigning}
		<div class="absolute inset-0 bg-base-300/80 backdrop-blur-sm rounded-lg z-50 flex items-center justify-center">
			<div class="text-center">
				<span class="loading loading-spinner loading-lg" style="color: {statusVisual.accent};"></span>
				<p class="text-sm font-medium text-base-content mt-2">Assigning task...</p>
			</div>
		</div>
	{/if}

	<!-- Success Animation Overlay -->
	{#if assignSuccess}
		<div class="absolute inset-0 bg-success/20 backdrop-blur-sm rounded-lg z-50 flex items-center justify-center animate-in fade-in duration-300">
			<div class="text-center animate-in zoom-in duration-500">
				<div class="mx-auto w-16 h-16 bg-success rounded-full flex items-center justify-center mb-3 animate-bounce">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-success-content" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
						<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
					</svg>
				</div>
				<p class="text-lg font-bold text-success font-mono tracking-wide">ASSIGNED</p>
			</div>
		</div>
	{/if}

	<div class="flex-1 flex flex-col overflow-hidden pl-3 pr-3 pt-3 pb-3">
		<!-- ═══════════════════════════════════════════════════════════════════════
		     INDUSTRIAL HEADER
		     ═══════════════════════════════════════════════════════════════════════ -->
		<div class="flex items-center gap-2 mb-2">
			<!-- Status indicator (inline with name) -->
			<div
				class="flex items-center justify-center w-6 h-6 rounded shrink-0"
				style="background: {statusVisual.bgTint}; box-shadow: 0 0 8px {statusVisual.glow};"
				title={statusVisual.description}
			>
				{#if agentStatus === 'working'}
					<svg class="w-3.5 h-3.5 animate-spin" style="color: {statusVisual.accent};" viewBox="0 0 24 24" fill="currentColor">
						<path d={STATUS_ICONS.gear} />
					</svg>
				{:else if agentStatus === 'live'}
					<span class="loading loading-dots loading-xs" style="color: {statusVisual.accent};"></span>
				{:else if agentStatus === 'active'}
					<span class="relative flex h-2 w-2">
						<span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style="background: {statusVisual.accent};"></span>
						<span class="relative inline-flex rounded-full h-2 w-2" style="background: {statusVisual.accent};"></span>
					</span>
				{:else if agentStatus === 'idle'}
					<svg class="w-3.5 h-3.5" style="color: {statusVisual.accent};" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="6" />
					</svg>
				{:else if agentStatus === 'offline'}
					<svg class="w-3.5 h-3.5" style="color: {statusVisual.accent};" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d={STATUS_ICONS['power-off']} />
					</svg>
				{/if}
			</div>

			<!-- Agent Avatar + Name (clickable to open OutputDrawer) -->
			<button
				class="flex items-center gap-2 flex-1 min-w-0 cursor-pointer rounded-md px-1 py-0.5 -ml-1
					hover:bg-base-content/5 transition-colors group"
				onclick={() => openOutputDrawerForSession(agent.name)}
				title="Click to view session output"
			>
				<AgentAvatar name={agent.name} size={28} class="shrink-0 rounded-full transition-all {agentStatus === 'working' ? 'ring-2 ring-info ring-offset-base-100 ring-offset-1' : 'group-hover:ring-2 group-hover:ring-primary/30'}" />
				<div class="flex-1 min-w-0 text-left">
					<h3
						class="font-mono font-bold text-sm tracking-wide truncate group-hover:opacity-80 transition-opacity"
						style="color: {statusVisual.accent}; text-shadow: 0 0 20px {statusVisual.glow};"
					>
						{agent.name?.toUpperCase() || 'UNKNOWN'}
					</h3>
				</div>
			</button>

			<!-- Task badge or status label -->
			{#if agentStatus === 'working' && currentTask}
				{@const taskProjectKey = currentTask.id.split('-')[0].toLowerCase()}
				<TaskIdBadge
					task={{ id: currentTask.id, status: currentTask.status, issue_type: currentTask.issue_type, title: currentTask.title }}
					size="xs"
					showType={false}
					showStatus={true}
					color={projectColors[taskProjectKey]}
					onOpenTask={ontaskclick}
					dropdownAlign="end"
				/>
			{:else}
				<button
					class="font-mono text-[10px] tracking-widest uppercase px-2 py-0.5 rounded transition-all
						{agentStatus === 'offline' ? 'cursor-pointer hover:scale-105' : 'cursor-default'}"
					style="color: {statusVisual.accent}; background: {statusVisual.bgTint};"
					onclick={handleBadgeClick}
					disabled={agentStatus !== 'offline'}
					title={statusVisual.description}
				>
					{statusVisual.label}
				</button>
			{/if}

			<!-- ═══ SESSION CONTROL BUTTONS ═══ -->
			<!-- Only show for agents with active tmux sessions -->
			{#if agent.hasSession}
				<div class="flex items-center gap-0.5 ml-1">
					<!-- Ctrl+C / Interrupt button -->
					<button
						class="p-1 rounded hover:bg-warning/20 transition-colors group"
						onclick={sendInterrupt}
						disabled={sessionControlLoading !== null}
						title="Send Ctrl+C (interrupt)"
					>
						{#if sessionControlLoading === 'interrupt'}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
							<svg class="w-3.5 h-3.5 text-base-content/40 group-hover:text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
							</svg>
						{/if}
					</button>

					<!-- Continue button -->
					<button
						class="p-1 rounded hover:bg-success/20 transition-colors group"
						onclick={sendContinue}
						disabled={sessionControlLoading !== null}
						title="Send 'continue'"
					>
						{#if sessionControlLoading === 'continue'}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
							<svg class="w-3.5 h-3.5 text-base-content/40 group-hover:text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
							</svg>
						{/if}
					</button>

					<!-- Slash command dropdown -->
					<div class="relative">
						<button
							class="p-1 rounded hover:bg-primary/20 transition-colors group"
							onclick={toggleSlashDropdown}
							disabled={sessionControlLoading !== null}
							title="Slash commands"
						>
							{#if sessionControlLoading && !['kill', 'interrupt', 'continue'].includes(sessionControlLoading)}
								<span class="loading loading-spinner loading-xs"></span>
							{:else}
								<svg class="w-3.5 h-3.5 text-base-content/40 group-hover:text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
								</svg>
							{/if}
						</button>

						<!-- Slash command dropdown menu -->
						{#if showSlashDropdown}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div class="fixed inset-0 z-40" onclick={closeSlashDropdown}></div>
							<div class="absolute right-0 top-full mt-1 bg-base-100 border border-base-300 rounded-lg shadow-xl py-1 min-w-[140px] z-50">
								<div class="px-2 py-1 text-[9px] font-mono tracking-wider uppercase text-base-content/40 border-b border-base-300">
									/jat:commands
								</div>
								<button
									class="w-full px-3 py-1.5 text-left text-xs hover:bg-base-200 transition-colors flex items-center gap-2"
									onclick={() => sendSlashCommand('complete')}
								>
									<span class="text-success">✓</span>
									<span>complete</span>
								</button>
								<button
									class="w-full px-3 py-1.5 text-left text-xs hover:bg-base-200 transition-colors flex items-center gap-2"
									onclick={() => sendSlashCommand('next')}
								>
									<span class="text-info">→</span>
									<span>next</span>
								</button>
								<button
									class="w-full px-3 py-1.5 text-left text-xs hover:bg-base-200 transition-colors flex items-center gap-2"
									onclick={() => sendSlashCommand('status')}
								>
									<span class="text-warning">?</span>
									<span>status</span>
								</button>
								<button
									class="w-full px-3 py-1.5 text-left text-xs hover:bg-base-200 transition-colors flex items-center gap-2"
									onclick={() => sendSlashCommand('pause')}
								>
									<span class="text-base-content/50">⏸</span>
									<span>pause</span>
								</button>
							</div>
						{/if}
					</div>

					<!-- Kill button (X icon) - only show if agent has active tmux session -->
					{#if agent.hasSession}
						<button
							class="p-1 rounded hover:bg-error/20 transition-colors group"
							onclick={killSession}
							disabled={sessionControlLoading !== null}
							title="Kill session"
						>
							{#if sessionControlLoading === 'kill'}
								<span class="loading loading-spinner loading-xs"></span>
							{:else}
								<svg class="w-3.5 h-3.5 text-base-content/40 group-hover:text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
								</svg>
							{/if}
						</button>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Usage Trend Sparkline (full width, multi-project) -->
		<!-- PERF: Skip heavy Sparkline component entirely for offline agents -->
		<div class="">
			{#if agentStatus === 'offline'}
				<!-- Minimal placeholder for offline agents - no Sparkline component -->
				<div class="h-10 flex items-center">
					<div class="w-full h-px bg-base-content/10"></div>
				</div>
			{:else if sparklineLoading && sparklineData.length === 0}
				<!-- Placeholder line for loading -->
				<div class="h-10 flex items-center">
					<div class="w-full h-px bg-base-content/20"></div>
				</div>
			{:else if sparklineData.length === 0}
				<!-- Placeholder line for no data -->
				<div class="h-10 flex items-center">
					<div class="w-full h-px bg-base-content/20"></div>
				</div>
			{:else if hasMultiProjectData}
				<!-- Multi-project sparkline (shows projects this agent worked on) -->
				<Sparkline
					{multiSeriesData}
					{projectMeta}
					height={40}
					showTooltip={true}
					showLegend={false}
					showStyleToolbar={true}
					animate={true}
				/>
			{:else}
				<!-- Fallback: Single-series sparkline -->
				<Sparkline
					data={sparklineData}
					height={40}
					showTooltip={true}
					colorMode="usage"
					showStyleToolbar={true}
					animate={true}
				/>
			{/if}
		</div>

		<!-- ═══════════════════════════════════════════════════════════════════════
		     TAB BAR
		     Activity | Locks | Output tabs
		     ═══════════════════════════════════════════════════════════════════════ -->
		<div
			class="flex items-center gap-0.5 mb-2 px-1 py-0.5 rounded"
			style="background: oklch(0.5 0 0 / 0.06); border: 1px solid oklch(0.5 0 0 / 0.1);"
		>
			<!-- Activity Tab -->
			<button
				class="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded transition-colors font-mono text-[10px] tracking-wider uppercase
					{activeTab === 'activity' ? 'bg-base-content/10' : 'hover:bg-base-content/5'}"
				style="color: {activeTab === 'activity' ? statusVisual.accent : 'oklch(0.5 0 0 / 0.5)'};"
				onclick={() => setActiveTab('activity')}
				title="View activity and queue"
			>
				<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
				</svg>
				<span class="hidden sm:inline">Activity</span>
				{#if queuedTasks.length > 0}
					<span
						class="w-4 h-4 text-[9px] rounded-full flex items-center justify-center"
						style="background: oklch(0.70 0.14 250 / 0.2); color: oklch(0.70 0.14 250);"
					>
						{queuedTasks.length}
					</span>
				{/if}
			</button>

			<!-- Locks Tab -->
			<button
				class="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded transition-colors font-mono text-[10px] tracking-wider uppercase
					{activeTab === 'locks' ? 'bg-base-content/10' : 'hover:bg-base-content/5'}"
				style="color: {activeTab === 'locks' ? 'oklch(0.70 0.16 85)' : 'oklch(0.5 0 0 / 0.5)'};"
				onclick={() => setActiveTab('locks')}
				title="View file locks"
			>
				<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
				</svg>
				<span class="hidden sm:inline">Locks</span>
				{#if agentLocks.length > 0}
					<span
						class="w-4 h-4 text-[9px] rounded-full flex items-center justify-center"
						style="background: oklch(0.70 0.16 85 / 0.2); color: oklch(0.70 0.16 85);"
					>
						{agentLocks.length}
					</span>
				{/if}
			</button>

			<!-- Output Tab -->
			<button
				class="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded transition-colors font-mono text-[10px] tracking-wider uppercase
					{activeTab === 'output' ? 'bg-base-content/10' : 'hover:bg-base-content/5'}"
				style="color: {activeTab === 'output' ? 'oklch(0.70 0.14 200)' : 'oklch(0.5 0 0 / 0.5)'};"
				onclick={() => setActiveTab('output')}
				title="View terminal output"
			>
				<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
				</svg>
				<span class="hidden sm:inline">Output</span>
			</button>

			<!-- Token cost indicator (always visible) -->
			{#if agent.usage}
				{@const cost = agent.usage.today?.cost || 0}
				{@const costColor = cost < 1 ? 'oklch(0.70 0.18 145)' : cost < 5 ? 'oklch(0.70 0.16 85)' : 'oklch(0.65 0.25 25)'}
				<div
					class="flex items-center gap-0.5 px-1.5 py-0.5 rounded ml-auto"
					style="background: {cost > 0 ? `${costColor.replace(')', ' / 0.1)')}` : 'transparent'};"
					title="Today's cost: ${cost.toFixed(2)}"
				>
					<span class="text-[9px]" style="color: {cost > 0 ? costColor : 'oklch(0.5 0 0 / 0.4)'};">$</span>
					<AnimatedDigits
						value={cost < 0.01 ? '0' : cost.toFixed(2)}
						class="text-[9px]"
						style="color: {cost > 0 ? costColor : 'oklch(0.5 0 0 / 0.4)'};"
					/>
				</div>
			{/if}
		</div>

		<!-- ═══════════════════════════════════════════════════════════════════════
		     TAB CONTENT AREA
		     Switches between Activity, Locks, and Output tabs
		     ═══════════════════════════════════════════════════════════════════════ -->
		<div
			class="flex-1 min-h-0 mb-2 rounded overflow-y-auto relative"
			style="background: oklch(0.5 0 0 / 0.04); border: 1px solid oklch(0.5 0 0 / 0.08);"
		>
			<!-- ═══ ACTIVITY TAB ═══ -->
			{#if activeTab === 'activity'}
				<!-- Activity Section -->
				{#if agent.current_activity || (agent.activities && agent.activities.length > 0)}
				{@const firstActivity = agent.current_activity || (agent.activities && agent.activities.length > 0 ? agent.activities[0] : null)}
				{@const isActiveTask = firstActivity && firstActivity.status !== 'closed'}
				{@const currentActivity = isActiveTask ? firstActivity : null}
				{@const historyActivities = currentActivity ? agent.activities.slice(1) : agent.activities}

				<!-- Activity header -->
				<div
					class="flex items-center gap-2 px-2 py-1 sticky top-0 z-10"
					style="background: linear-gradient(90deg, {statusVisual.bgTint} 0%, oklch(0.18 0.01 250) 100%); border-bottom: 1px solid oklch(0.5 0 0 / 0.08);"
				>
					<div class="w-0.5 h-3 rounded-full" style="background: {statusVisual.accent};"></div>
					<span class="font-mono text-[10px] tracking-widest uppercase text-base-content/50">Activity</span>
				</div>

				<div class="px-2 py-1.5">
					<!-- Current Activity (highlighted) -->
					{#if currentActivity}
						{@const taskId = extractTaskId(currentActivity.preview)}
						{@const previewText = currentActivity.preview || currentActivity.content || 'Active'}
						{@const textWithoutTaskId = taskId ? previewText.replace(/\[.*?\]\s*/, '') : previewText}
						{@const activityStatusVisual = getTaskStatusVisual(currentActivity.status || 'in_progress')}
						<div
							class="flex items-start gap-2 py-1.5 px-2 rounded mb-1"
							style="background: {statusVisual.bgTint}; border-left: 2px solid {statusVisual.accent};"
						>
							{#if currentActivity.status === 'in_progress'}
								<svg class="shrink-0 w-4 h-4 animate-spin mt-0.5" style="color: {statusVisual.accent};" viewBox="0 0 24 24" fill="currentColor">
									<path d={STATUS_ICONS.gear} />
								</svg>
							{:else if currentActivity.status === 'closed'}
								<svg class="shrink-0 w-4 h-4 {activityStatusVisual.text} mt-0.5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" d={STATUS_ICONS.check} />
								</svg>
							{:else if currentActivity.status === 'blocked'}
								<svg class="shrink-0 w-4 h-4 {activityStatusVisual.text} mt-0.5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" d={STATUS_ICONS.warning} />
								</svg>
							{:else}
								<svg class="shrink-0 w-4 h-4 {activityStatusVisual.text} mt-0.5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" d={STATUS_ICONS.clock} />
								</svg>
							{/if}
							<div class="flex-1 min-w-0">
								{#if taskId}
									<span class="font-mono text-[10px] font-bold" style="color: {statusVisual.accent};">{taskId}</span>
								{/if}
								<p class="text-xs font-medium text-base-content truncate">{textWithoutTaskId}</p>
							</div>
						</div>
					{/if}

					<!-- History (terminal log style - limited to 3 items) -->
					{#if historyActivities && historyActivities.length > 0}
						<div class="space-y-0.5 {currentActivity ? 'pt-1 border-t border-base-content/5' : ''}">
							{#each historyActivities.slice(0, 3) as activity}
								{@const taskId = extractTaskId(activity.preview)}
								{@const isClickable = taskId !== null}
								{@const previewText = activity.preview || activity.content || activity.type}
								{@const textWithoutTaskId = taskId ? previewText.replace(/\[.*?\]\s*/, '') : previewText}
								{@const activityStatusVisual = getTaskStatusVisual(activity.status || 'open')}
								<div
									class="text-xs flex items-start gap-1.5 rounded px-1.5 py-0.5 transition-colors
										{isClickable ? 'hover:bg-primary/10 cursor-pointer' : 'hover:bg-base-content/5 cursor-default'}"
									title={activity.content || activity.preview}
									onclick={isClickable ? () => handleActivityClick(activity) : undefined}
									role={isClickable ? 'button' : undefined}
									tabindex={isClickable ? 0 : undefined}
								>
									<span class="font-mono text-[9px] text-base-content/30 shrink-0 tabular-nums">
										{formatActivityTimestamp(activity.ts)}
									</span>
									{#if activity.status === 'in_progress'}
										<svg class="shrink-0 w-2.5 h-2.5 {activityStatusVisual.text} animate-spin" viewBox="0 0 24 24" fill="currentColor">
											<path d={STATUS_ICONS.gear} />
										</svg>
									{:else if activity.status === 'closed'}
										<svg class="shrink-0 w-2.5 h-2.5 {activityStatusVisual.text}" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" d={STATUS_ICONS.check} />
										</svg>
									{:else}
										<svg class="shrink-0 w-2.5 h-2.5 text-base-content/30" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
											<circle cx="12" cy="12" r="3" />
										</svg>
									{/if}
									{#if taskId}
										<span class="font-mono text-[9px] text-info shrink-0">{taskId}</span>
									{/if}
									<span class="truncate text-base-content/60 text-[11px]">{textWithoutTaskId}</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Queue Section (inline if has items) -->
			{#if queuedTasks.length > 0}
				<div style="border-top: 1px solid oklch(0.5 0 0 / 0.08);">
					<!-- Queue header -->
					<div
						class="flex items-center gap-2 px-2 py-1 sticky top-0 z-10"
						style="background: linear-gradient(90deg, oklch(0.70 0.14 250 / 0.1) 0%, oklch(0.18 0.01 250) 100%);"
					>
						<div class="w-0.5 h-3 rounded-full" style="background: oklch(0.70 0.14 250);"></div>
						<span class="font-mono text-[10px] tracking-widest uppercase text-base-content/50">Queue</span>
						<span class="font-mono text-[10px] tabular-nums ml-auto" style="color: oklch(0.70 0.14 250);">
							<AnimatedDigits value={queuedTasks.length.toString()} />
						</span>
					</div>

					<div class="px-2 py-1 space-y-0.5">
						{#each queuedTasks.slice(0, 2) as task}
							<div class="flex items-center gap-2 group/queueitem rounded px-1.5 py-0.5 hover:bg-base-content/5 transition-colors">
								<span class="font-mono text-[9px] text-base-content/40 truncate max-w-[70px]" title={task.id}>{task.id}</span>
								<button
									class="opacity-0 group-hover/queueitem:opacity-100 transition-opacity p-0.5 rounded hover:bg-base-content/10"
									title="Copy task ID"
									onclick={(e) => copyTaskId(task.id, e)}
								>
									{#if copiedTaskId === task.id}
										<svg class="w-2 h-2 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
											<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
										</svg>
									{:else}
										<svg class="w-2 h-2 text-base-content/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
										</svg>
									{/if}
								</button>
								<p class="text-[11px] text-base-content/70 truncate flex-1" title={task.title}>{task.title}</p>
							</div>
						{/each}
						{#if queuedTasks.length > 2}
							<div class="font-mono text-[9px] text-base-content/30 text-center py-0.5 flex items-center justify-center gap-1">
								<span>+</span><AnimatedDigits value={(queuedTasks.length - 2).toString()} /><span>more</span>
							</div>
						{/if}
					</div>
				</div>
			{/if}

				<!-- Empty state if no activity and no queue -->
				{#if !agent.current_activity && (!agent.activities || agent.activities.length === 0) && queuedTasks.length === 0}
					<div class="p-3 text-center">
						<p class="font-mono text-[10px] tracking-wider uppercase text-base-content/40">Drop task to assign</p>
					</div>
				{/if}

			<!-- ═══ LOCKS TAB ═══ -->
			{:else if activeTab === 'locks'}
				{#if agentLocks.length > 0}
					<!-- Locks header -->
					<div
						class="flex items-center gap-2 px-2 py-1 sticky top-0 z-10"
						style="background: linear-gradient(90deg, oklch(0.70 0.16 85 / 0.1) 0%, oklch(0.18 0.01 250) 100%); border-bottom: 1px solid oklch(0.5 0 0 / 0.08);"
					>
						<svg class="w-3 h-3 shrink-0" style="color: oklch(0.70 0.16 85);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
						</svg>
						<span class="font-mono text-[10px] tracking-widest uppercase" style="color: oklch(0.70 0.16 85);">File Locks</span>
						<span class="font-mono text-[10px] tabular-nums ml-auto" style="color: oklch(0.70 0.16 85);">
							<AnimatedDigits value={agentLocks.length.toString()} />
						</span>
						<button
							class="btn btn-xs btn-ghost"
							onclick={viewReservations}
							title="Manage locks"
						>
							<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
							</svg>
						</button>
					</div>

					<!-- Lock patterns list -->
					<div class="px-2 py-1.5 space-y-1">
						{#each agentLocks as lock}
							<div
								class="flex items-start gap-2 py-1.5 px-2 rounded"
								style="background: oklch(0.70 0.16 85 / 0.08); border: 1px solid oklch(0.70 0.16 85 / 0.15);"
							>
								<svg class="w-3 h-3 shrink-0 mt-0.5" style="color: oklch(0.70 0.16 85);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
								</svg>
								<div class="flex-1 min-w-0">
									<p class="font-mono text-[11px] text-base-content truncate" title={lock.path_pattern}>
										{lock.path_pattern}
									</p>
									{#if lock.reason}
										<p class="text-[10px] text-base-content/50 truncate" title={lock.reason}>
											{lock.reason}
										</p>
									{/if}
									<p class="text-[9px] text-base-content/40 mt-0.5">
										Expires: {new Date(lock.expires_ts).toLocaleTimeString()}
									</p>
								</div>
								<button
									class="btn btn-xs btn-ghost text-error hover:bg-error/20"
									onclick={() => releaseReservation(lock.id, lock.path_pattern)}
									title="Release lock"
								>
									<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							</div>
						{/each}
					</div>
				{:else}
					<!-- No locks empty state -->
					<div class="flex flex-col items-center justify-center h-full p-4 text-center">
						<svg class="w-8 h-8 mb-2 text-base-content/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
						</svg>
						<p class="font-mono text-[10px] tracking-wider uppercase text-base-content/40">No file locks</p>
						<p class="text-[10px] text-base-content/30 mt-1">Agent has no active reservations</p>
					</div>
				{/if}

			<!-- ═══ OUTPUT TAB ═══ -->
			{:else if activeTab === 'output'}
				{#if outputLoading}
					<!-- Loading state -->
					<div class="flex flex-col items-center justify-center h-full p-4">
						<span class="loading loading-spinner loading-md" style="color: oklch(0.70 0.14 200);"></span>
						<p class="font-mono text-[10px] tracking-wider uppercase text-base-content/40 mt-2">Loading output...</p>
					</div>
				{:else if outputError}
					<!-- Error state -->
					<div class="flex flex-col items-center justify-center h-full p-4 text-center">
						<svg class="w-8 h-8 mb-2 text-base-content/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
						</svg>
						<p class="font-mono text-[10px] tracking-wider uppercase text-base-content/40">{outputError}</p>
						{#if agentStatus !== 'offline'}
							<button
								class="btn btn-xs btn-ghost mt-2"
								onclick={fetchOutput}
							>
								Retry
							</button>
						{/if}
					</div>
				{:else if outputContent}
					<!-- Terminal output display -->
					<div
						class="h-full overflow-y-auto px-2 py-1.5 font-mono text-[10px] leading-tight whitespace-pre-wrap break-all"
						style="background: oklch(0.12 0.01 250); color: oklch(0.85 0.05 145);"
					>
						{outputContent}
					</div>
				{:else}
					<!-- No output state -->
					<div class="flex flex-col items-center justify-center h-full p-4 text-center">
						<svg class="w-8 h-8 mb-2 text-base-content/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
						</svg>
						<p class="font-mono text-[10px] tracking-wider uppercase text-base-content/40">No output yet</p>
						<p class="text-[10px] text-base-content/30 mt-1">Waiting for session output...</p>
					</div>
				{/if}
			{/if}

			<!-- Drag-over feedback (overlay on content area - always visible on Activity tab) -->
			{#if isDragOver && activeTab === 'activity'}
				<div
					class="absolute inset-0 flex items-center justify-center rounded"
					style="background: {hasDependencyBlock || hasConflict ? 'oklch(0.65 0.25 25 / 0.15)' : 'oklch(0.75 0.20 145 / 0.15)'}; backdrop-filter: blur(2px);"
				>
					{#if isAssigning}
						<div class="flex items-center gap-2">
							<span class="loading loading-spinner loading-sm" style="color: {statusVisual.accent};"></span>
							<p class="font-mono text-xs tracking-wider uppercase text-base-content/80">Assigning...</p>
						</div>
					{:else if hasDependencyBlock}
						<div class="text-center px-4">
							<svg class="w-6 h-6 mx-auto mb-1 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
							</svg>
							<p class="font-mono text-[10px] tracking-wider uppercase text-error">Blocked</p>
							<p class="text-[10px] text-error/70 mt-0.5">{dependencyBlockReason}</p>
						</div>
					{:else if hasConflict}
						<div class="text-center px-4">
							<svg class="w-6 h-6 mx-auto mb-1 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
							</svg>
							<p class="font-mono text-[10px] tracking-wider uppercase text-error">File Conflict</p>
						</div>
					{:else}
						<div class="text-center">
							<svg class="w-6 h-6 mx-auto mb-1" style="color: oklch(0.75 0.20 145);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
							<p class="font-mono text-[10px] tracking-wider uppercase" style="color: oklch(0.75 0.20 145);">Drop to assign</p>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Assignment Error Alert (Industrial) -->
		{#if assignError}
			<div
				class="mb-2 rounded px-2 py-1.5 flex items-start gap-2"
				style="background: oklch(0.65 0.25 25 / 0.1); border: 1px solid oklch(0.65 0.25 25 / 0.3); border-left: 2px solid oklch(0.65 0.25 25);"
			>
				<svg class="w-3.5 h-3.5 shrink-0 mt-0.5" style="color: oklch(0.65 0.25 25);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				<span class="text-xs text-error">{assignError}</span>
			</div>
		{/if}

		<!-- ═══════════════════════════════════════════════════════════════════════
		     FOOTER (Industrial)
		     ═══════════════════════════════════════════════════════════════════════ -->
		<div
			class="flex items-center justify-between mt-auto pt-2"
			style="border-top: 1px solid oklch(0.5 0 0 / 0.08);"
		>
			<span
				class="font-mono text-[10px] tabular-nums"
				style="color: {statusVisual.accent};"
			>
				{formatLastActivity(agent.current_activity?.ts || agent.last_active_ts)}
			</span>
			<span class="font-mono text-[10px] text-base-content/30 truncate ml-2">
				{agent.program || 'unknown'}
			</span>
		</div>

	</div>
</div>

<!-- Delete Agent Confirmation Modal (uses modalStateHelpers) -->
{#if deleteModal.isOpen}
	<div class="modal modal-open">
		<div class="modal-box">
			<h3 class="font-bold text-lg mb-4">Delete Agent?</h3>
			<div class="space-y-3">
				<p class="text-base-content/80">
					Are you sure you want to delete <strong class="text-error">{agent.name}</strong>?
				</p>
				<div class="bg-base-200 rounded p-3 space-y-2 text-sm">
					<p class="text-base-content/70">
						<strong>Agent:</strong> {agent.name}
					</p>
					<p class="text-base-content/70">
						<strong>Last active:</strong> {formatLastActivity(agent.last_active_ts)}
					</p>
					<p class="text-base-content/70">
						<strong>Status:</strong> Offline (inactive for over 1 hour)
					</p>
				</div>
				{#if deleteModal.error}
					<div class="alert alert-error">
						<span>{deleteModal.error}</span>
					</div>
				{/if}
				<div class="alert alert-warning">
					<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
					</svg>
					<div class="text-xs">
						<p class="font-semibold">This action cannot be undone.</p>
						<p>Messages and task history will be preserved.</p>
						<p>Active reservations will be released.</p>
					</div>
				</div>
			</div>
			<div class="modal-action">
				<button
					class="btn btn-ghost"
					onclick={() => { deleteModal.close(); }}
					disabled={deleteModal.loading}
				>
					Cancel
				</button>
				<button
					class="btn btn-error"
					onclick={handleDeleteAgent}
					disabled={deleteModal.loading}
				>
					{#if deleteModal.loading}
						<span class="loading loading-spinner loading-sm"></span>
						Deleting...
					{:else}
						Delete Agent
					{/if}
				</button>
			</div>
		</div>
		<div class="modal-backdrop" onclick={() => { if (!deleteModal.loading) deleteModal.close(); }}></div>
	</div>
{/if}

<!-- Quick Actions Context Menu -->
{#if showQuickActions}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-50" onclick={closeQuickActions}>
		<div
			class="absolute bg-base-100 border border-base-300 rounded-lg shadow-xl py-2 min-w-[200px]"
			style="left: {quickActionsX}px; top: {quickActionsY}px;"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="px-3 py-2 text-xs font-semibold text-base-content/50 border-b border-base-300">
				Quick Actions: {agent.name}
			</div>

			<button
				class="w-full px-3 py-2 text-left text-sm hover:bg-base-200 transition-colors flex items-center gap-2"
				onclick={viewInbox}
				disabled={quickActionsLoading === 'inbox'}
			>
				{#if quickActionsLoading === 'inbox'}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<span>📬</span>
				{/if}
				View Inbox
			</button>

			<button
				class="w-full px-3 py-2 text-left text-sm hover:bg-base-200 transition-colors flex items-center gap-2"
				onclick={viewReservations}
				disabled={quickActionsLoading === 'reservations'}
			>
				{#if quickActionsLoading === 'reservations'}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<span>🔒</span>
				{/if}
				View File Locks
			</button>

			<button
				class="w-full px-3 py-2 text-left text-sm hover:bg-base-200 transition-colors flex items-center gap-2"
				onclick={openSendMessage}
			>
				<span>✉️</span>
				Send Message
			</button>

			<div class="border-t border-base-300 my-1"></div>

			<button
				class="w-full px-3 py-2 text-left text-sm hover:bg-error hover:text-error-content transition-colors flex items-center gap-2"
				onclick={confirmClearQueue}
			>
				<span>🗑️</span>
				Clear Agent's Queue
			</button>

			<button
				class="w-full px-3 py-2 text-left text-sm hover:bg-warning hover:text-warning-content transition-colors flex items-center gap-2"
				onclick={confirmUnassignTask}
				disabled={!currentTask}
			>
				<span>⏸️</span>
				Unassign Current Task
			</button>

			<div class="border-t border-base-300 my-1"></div>

			<button
				class="w-full px-3 py-2 text-left text-sm hover:bg-error hover:text-error-content transition-colors flex items-center gap-2"
				onclick={() => {
					deleteModal.open();
					closeQuickActions();
				}}
			>
				<span>🗑️</span>
				Delete Agent
			</button>
		</div>
	</div>
{/if}

<!-- Inbox Modal -->
{#if showInboxModal}
	<div class="modal modal-open">
		<div class="modal-box max-w-2xl">
			<h3 class="font-bold text-lg mb-4">📬 Inbox: {agent.name}</h3>
			{#if inboxMessages.length === 0}
				<p class="text-base-content/50">No messages in inbox</p>
			{:else}
				<div class="space-y-2 max-h-96 overflow-y-auto">
					{#each inboxMessages as message}
						<div class="bg-base-200 p-3 rounded">
							<div class="flex justify-between items-start mb-1">
								<span class="font-semibold text-sm">{message.subject}</span>
								<span class="text-xs text-base-content/50">{message.timestamp}</span>
							</div>
							<p class="text-xs text-base-content/70">From: {message.from}</p>
							<p class="text-sm mt-2">{message.body}</p>
						</div>
					{/each}
				</div>
			{/if}
			<div class="modal-action">
				<button class="btn" onclick={() => { showInboxModal = false; }}>Close</button>
			</div>
		</div>
		<div class="modal-backdrop" onclick={() => { showInboxModal = false; }}></div>
	</div>
{/if}

<!-- Reservations Modal -->
{#if showReservationsModal}
	<div class="modal modal-open">
		<div class="modal-box max-w-2xl">
			<h3 class="font-bold text-lg mb-4">🔒 File Locks: {agent.name}</h3>
			{#if reservationsList.length === 0}
				<p class="text-base-content/50">No active file locks</p>
			{:else}
				<div class="space-y-2 max-h-96 overflow-y-auto">
					{#each reservationsList as lock}
						<div class="bg-warning/10 p-3 rounded">
							<div class="flex justify-between items-start mb-1">
								<span class="font-mono text-sm font-semibold">{lock.pattern}</span>
								<div class="flex gap-2 items-center">
									<span class="badge badge-sm {lock.exclusive ? 'badge-error' : 'badge-warning'}">
										{lock.exclusive ? 'Exclusive' : 'Shared'}
									</span>
									<button
										class="btn btn-xs btn-error btn-outline"
										onclick={() => releaseReservation(lock.id, lock.pattern)}
										title="Release this lock"
									>
										Release
									</button>
								</div>
							</div>
							<p class="text-xs text-base-content/70">Reason: {lock.reason || 'N/A'}</p>
							<p class="text-xs text-base-content/50">Expires: {lock.expires_ts}</p>
						</div>
					{/each}
				</div>
			{/if}
			<div class="modal-action">
				<button class="btn" onclick={() => { showReservationsModal = false; }}>Close</button>
			</div>
		</div>
		<div class="modal-backdrop" onclick={() => { showReservationsModal = false; }}></div>
	</div>
{/if}

<!-- Send Message Modal -->
{#if showSendMessageModal}
	<div class="modal modal-open">
		<div class="modal-box">
			<h3 class="font-bold text-lg mb-4">✉️ Send Message to {agent.name}</h3>
			<div class="space-y-4">
				<div class="form-control">
					<label class="label">
						<span class="label-text">Subject</span>
					</label>
					<input
						type="text"
						bind:value={messageSubject}
						placeholder="Message subject"
						class="input input-bordered"
					/>
				</div>
				<div class="form-control">
					<label class="label">
						<span class="label-text">Message</span>
					</label>
					<textarea
						bind:value={messageBody}
						placeholder="Your message..."
						class="textarea textarea-bordered h-32"
					></textarea>
				</div>
			</div>
			<div class="modal-action">
				<button class="btn btn-ghost" onclick={() => { showSendMessageModal = false; }}>Cancel</button>
				<button class="btn btn-primary" onclick={sendMessage}>Send</button>
			</div>
		</div>
		<div class="modal-backdrop" onclick={() => { showSendMessageModal = false; }}></div>
	</div>
{/if}

<!-- Clear Queue Confirmation Modal -->
{#if showClearQueueModal}
	<div class="modal modal-open">
		<div class="modal-box">
			<h3 class="font-bold text-lg mb-4">Clear Agent's Queue?</h3>
			<div class="space-y-3">
				<p class="text-base-content/80">
					This will unassign all open tasks from <strong class="text-error">{agent.name}</strong>.
				</p>
				<div class="alert alert-warning">
					<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
					</svg>
					<span>This action cannot be undone. Tasks will return to the unassigned pool.</span>
				</div>
			</div>
			<div class="modal-action">
				<button class="btn btn-ghost" onclick={() => { showClearQueueModal = false; }}>Cancel</button>
				<button class="btn btn-error" onclick={clearQueue}>Clear Queue</button>
			</div>
		</div>
		<div class="modal-backdrop" onclick={() => { showClearQueueModal = false; }}></div>
	</div>
{/if}

<!-- Unassign Task Confirmation Modal -->
{#if showUnassignModal}
	<div class="modal modal-open">
		<div class="modal-box">
			<h3 class="font-bold text-lg mb-4">Unassign Current Task?</h3>
			{#if currentTask}
				<div class="space-y-3">
					<p class="text-base-content/80">
						Unassign task <strong class="text-warning">{currentTask.id}</strong> from {agent.name}?
					</p>
					<div class="bg-base-200 rounded p-3">
						<p class="text-sm font-semibold">{currentTask.title}</p>
						<p class="text-xs text-base-content/50 mt-1">{currentTask.id}</p>
					</div>
					<div class="alert alert-info">
						<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<span class="text-xs">Task will return to unassigned pool. Progress will be preserved.</span>
					</div>
				</div>
			{/if}
			<div class="modal-action">
				<button class="btn btn-ghost" onclick={() => { showUnassignModal = false; }}>Cancel</button>
				<button class="btn btn-warning" onclick={unassignCurrentTask}>Unassign Task</button>
			</div>
		</div>
		<div class="modal-backdrop" onclick={() => { showUnassignModal = false; }}></div>
	</div>
{/if}
