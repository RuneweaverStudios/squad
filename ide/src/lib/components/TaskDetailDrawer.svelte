<script lang="ts">
	/**
	 * TaskDetailDrawer Component
	 * DaisyUI drawer for viewing task details with inline editing
	 *
	 * Features:
	 * - Side panel drawer (doesn't block view)
	 * - All fields editable inline (click to edit)
	 * - Auto-save on field changes (debounced 500ms)
	 * - Fetches task data on mount
	 * - Optimistic updates with rollback
	 * - Keyboard shortcuts (Esc, M, ?)
	 * - Task actions: Spawn, Attach, Release, Send Message
	 */

	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { formatDate, formatSavedTime, formatRelativeTimestamp } from '$lib/utils/dateFormatters';
	import InlineEdit from '$lib/components/InlineEdit.svelte';
	import InlineSelect from '$lib/components/InlineSelect.svelte';
	import TaskDependencyGraph from '$lib/components/TaskDependencyGraph.svelte';
	import AgentAvatar from '$lib/components/AgentAvatar.svelte';
	import { computeAgentStatus, type AgentStatusInput, type AgentStatus } from '$lib/utils/agentStatusUtils';
	import { analyzeDependencies } from '$lib/utils/dependencyUtils';
	import { broadcastTaskEvent, lastTaskEvent } from '$lib/stores/taskEvents';
	import { getElapsedTimeColor, getFireScale, formatElapsedTime } from '$lib/config/rocketConfig';
	import { TaskDetailSkeleton } from '$lib/components/skeleton';
	import SlideOpenButton from '$lib/components/SlideOpenButton.svelte';
	import { SESSION_STATE_VISUALS } from '$lib/config/statusColors';
	import EventStack from '$lib/components/work/EventStack.svelte';
	import type { SuggestedTaskWithState } from '$lib/types/signals';
	import { getProjectFromTaskId } from '$lib/utils/projectUtils';
	import { availableProjects as availableProjectsStore } from '$lib/stores/drawerStore';

	// Task interface for drawer (extends API Task with additional optional fields)
	interface DrawerTask {
		id: string;
		title: string;
		description?: string;
		status: 'open' | 'in_progress' | 'blocked' | 'closed';
		priority: number;
		type?: string;
		project?: string;
		project_path?: string;
		assignee?: string;
		labels?: string[];
		depends_on?: Array<{ id: string; title: string; status: string; priority: number }>;
		blocked_by?: Array<{ id: string; title: string; status: string; priority: number }>;
		created_at?: string;
		updated_at?: string;
	}

	// Agent interface for action state
	interface Agent extends AgentStatusInput {
		name: string;
		last_active_ts?: string | null;
		task?: string | null;
	}

	// Props
	let {
		taskId = $bindable(null),
		isOpen = $bindable(false),
		ondelete = () => {},
		agents = [],
		onspawn = async (_taskId: string) => false,
		onrefresh = () => {}
	}: {
		taskId?: string | null;
		isOpen?: boolean;
		ondelete?: () => void;
		agents?: Agent[];
		onspawn?: (taskId: string) => Promise<boolean>;
		onrefresh?: () => void;
	} = $props();

	// Task data state
	let task = $state<DrawerTask | null>(null);
	let originalTask = $state<DrawerTask | null>(null); // Track original task to prevent infinite save loops
	let loading = $state(false);
	let error = $state<string | null>(null);

	// Task history state
	interface TimelineEvent {
		type: 'jat_event' | 'agent_mail';
		event: string;
		timestamp: string;
		description: string;
		metadata: Record<string, any>;
	}

	interface TaskHistory {
		task_id: string;
		task_title: string;
		timeline: TimelineEvent[];
		count: {
			total: number;
			jat_events: number;
			agent_mail: number;
		};
		timestamp: string;
	}

	let taskHistory = $state<TaskHistory | null>(null);
	let historyLoading = $state(false);
	let historyError = $state<string | null>(null);

	// Available tasks for dependencies (from same project)
	interface AvailableTask {
		id: string;
		title: string;
		status: string;
		priority: number;
	}

	let availableTasks = $state<AvailableTask[]>([]);
	let availableTasksLoading = $state(false);
	let showDependencyDropdown = $state(false);

	// Auto-save state
	let isSaving = $state(false);
	let saveError = $state<string | null>(null);
	let lastSaved = $state<Date | null>(null);
	let saveTimeout: ReturnType<typeof setTimeout> | null = null;
	let isUpdatingFromServer = $state(false); // Flag to prevent effect loops during server updates

	// AbortController to cancel pending fetches when task changes or drawer closes
	let fetchController: AbortController | null = null;

	// UI state
	let toastMessage = $state<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
	let showHelp = $state(false);
	let copiedTaskId = $state(false);
	let editingLabels = $state(false);

	// Action state
	let isSpawning = $state(false);
	let isReleasing = $state(false);
	let showMessageModal = $state(false);
	let messageText = $state('');
	let isSendingMessage = $state(false);
	let now = $state(Date.now());

	// Reopen modal state
	let showReopenModal = $state(false);
	let reopenReason = $state('');
	let isReopening = $state(false);

	// Summary state (for closed tasks)
	interface TaskSummary {
		taskId: string;
		title: string;
		summary: string[];
		outcome: 'completed' | 'incomplete' | 'blocked';
		duration?: string;
		agent?: string;
		keyChanges: string[];
		quality?: {
			tests?: string;
			build?: string;
		};
		suggestedTasks?: Array<{
			type: string;
			title: string;
			description: string;
			priority: number;
		}>;
		humanActions?: Array<{
			title: string;
			description: string;
		}>;
		generatedAt: string;
	}
	let summaryData = $state<TaskSummary | null>(null);
	let summaryLoading = $state(false);
	let summaryError = $state<string | null>(null);

	// Update timer for elapsed time display (every 30s)
	let timerInterval: ReturnType<typeof setInterval> | null = null;

	// Poll for signals updates (for Activity Timeline real-time updates)
	let signalsPollInterval: ReturnType<typeof setInterval> | null = null;
	const SIGNALS_POLL_INTERVAL_MS = 5000; // Poll every 5 seconds

	// Derived: Find agent for this task
	const taskAgent = $derived(
		task?.assignee ? agents.find(a => a.name === task!.assignee) : null
	);

	// Derived: Compute agent status
	const agentStatus = $derived<AgentStatus | null>(
		taskAgent ? computeAgentStatus(taskAgent) : null
	);

	// Derived: Is agent reachable (has tmux session and is working)?
	const isAgentOnline = $derived(
		agentStatus !== null && agentStatus !== 'offline' && agentStatus !== 'disconnected'
	);

	// Derived: Is this a paused/recoverable session? (in_progress but agent offline)
	// This happens when an agent was working but their tmux session is gone (paused or crashed)
	const isPausedSession = $derived(
		task?.status === 'in_progress' &&
		task?.assignee &&
		!isAgentOnline &&
		recoverableSession !== null
	);

	// Derived: Session name for attach
	const sessionName = $derived(
		taskAgent ? `jat-${taskAgent.name}` : null
	);

	// Derived: Dependency analysis for blocking check
	// Cast to Task type for analyzeDependencies (DrawerTask is compatible at runtime)
	const depStatus = $derived(
		task ? analyzeDependencies(task as unknown as import('$lib/types/api.types').Task) : { hasBlockers: false, blockingReason: '' }
	);

	// Derived: Calculate elapsed time from task updated_at
	const elapsed = $derived(() => {
		if (!task || task.status !== 'in_progress' || !task.updated_at) return null;
		const start = new Date(task.updated_at).getTime();
		const elapsedMs = now - start;
		if (elapsedMs < 0 || isNaN(elapsedMs)) return null;

		const totalMinutes = Math.floor(elapsedMs / 60000);
		const color = getElapsedTimeColor(totalMinutes);
		const display = formatElapsedTime(totalMinutes);

		return { display, color, minutes: totalMinutes };
	});

	// Derived: Action mode based on task status
	type ActionMode = 'spawn' | 'in_progress' | 'blocked' | 'closed';
	const actionMode = $derived<ActionMode>((() => {
		if (!task) return 'spawn';
		if (task.status === 'closed') return 'closed';
		if (task.status === 'in_progress') return 'in_progress';
		if (task.status === 'blocked' || depStatus.hasBlockers) return 'blocked';
		return 'spawn';
	})());

	// Task attachments state
	interface TaskAttachment {
		id: string;
		path: string;
		uploadedAt: string;
	}
	let attachments = $state<TaskAttachment[]>([]);
	let attachmentsLoading = $state(false);

	// Attachment drag-drop state
	let isDraggingOver = $state(false);
	let isUploading = $state(false);

	// Session logs state
	interface SessionLog {
		filename: string;
		path: string;
		size: number;
		sizeFormatted: string;
		modifiedAt: string;
		sessionTime: string | null;
		agentName: string | null;
		taskReferences: number;
		preview: string | null;
	}
	let sessionLogs = $state<SessionLog[]>([]);
	let logsLoading = $state(false);
	let logsExpanded = $state(false);
	let selectedLog = $state<string | null>(null);
	let logContent = $state<string | null>(null);
	let logContentLoading = $state(false);

	// Task signals state (new structured timeline replacing raw logs)
	interface TaskSignal {
		type: string;
		state?: string;
		session_id: string;
		tmux_session: string;
		timestamp: string;
		task_id?: string;
		data?: Record<string, unknown>;
		git_sha?: string;
		agent_name?: string;
	}
	interface TaskSignalsResponse {
		task_id: string;
		signals: TaskSignal[];
		count: number;
		stats?: {
			startTime?: string;
			endTime?: string;
			agents: string[];
			stateChanges: number;
			hasCompletion: boolean;
			hasReview: boolean;
			hasSuggestedTasks: boolean;
		};
	}
	let taskSignals = $state<TaskSignal[]>([]);
	let signalsLoading = $state(false);
	let signalsExpanded = $state(true);  // Expanded by default since it's the primary view
	let signalsStats = $state<TaskSignalsResponse['stats'] | null>(null);
	let resumingSessionId = $state<string | null>(null);  // Track which session is being resumed

	// Recoverable session state (for paused tasks where agent is offline)
	interface RecoverableSession {
		agentName: string;
		sessionId: string;
		taskId: string;
		lastActivity?: string;
	}
	let recoverableSession = $state<RecoverableSession | null>(null);
	let recoverableLoading = $state(false);

	// Available projects for suggested task creation
	let availableProjects = $state<string[]>([]);
	$effect(() => {
		const unsubscribe = availableProjectsStore.subscribe((projects) => {
			availableProjects = projects;
		});
		return unsubscribe;
	});

	// Derived: Default project from current task ID
	const defaultProject = $derived(task?.id ? getProjectFromTaskId(task.id) || '' : '');

	// Get unique sessions from signals (for Resume button)
	// A task may have multiple sessions if different agents worked on it
	// Also includes recoverableSession as fallback when no signals exist
	interface UniqueSession {
		session_id: string;
		agent_name?: string;
		timestamp: string;  // Latest timestamp for this session
	}
	const uniqueSessions = $derived.by((): UniqueSession[] => {
		const sessionMap = new Map<string, UniqueSession>();

		// First, add sessions from task signals
		for (const signal of taskSignals) {
			if (!signal.session_id) continue;
			const existing = sessionMap.get(signal.session_id);
			if (!existing || signal.timestamp > existing.timestamp) {
				sessionMap.set(signal.session_id, {
					session_id: signal.session_id,
					agent_name: signal.agent_name || existing?.agent_name,
					timestamp: signal.timestamp
				});
			}
		}

		// Fallback: if no signals, use recoverableSession (from recovery API)
		// This handles cases where agent didn't emit signals but session is recoverable
		if (sessionMap.size === 0 && recoverableSession) {
			sessionMap.set(recoverableSession.sessionId, {
				session_id: recoverableSession.sessionId,
				agent_name: recoverableSession.agentName,
				timestamp: recoverableSession.lastActivity || new Date().toISOString()
			});
		}
		// Sort by timestamp descending (most recent first)
		return Array.from(sessionMap.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
	});

	// Autofocus action for inputs
	function autofocusAction(node: HTMLElement) {
		requestAnimationFrame(() => {
			node.focus();
			if (node instanceof HTMLInputElement) {
				node.select();
			}
		});
	}

	// Timeline filter state
	let timelineFilter = $state<'all' | 'tasks' | 'messages'>('all');

	// Filtered timeline based on selected tab
	const filteredTimeline = $derived((): TimelineEvent[] => {
		if (!taskHistory?.timeline) return [];
		if (timelineFilter === 'all') return taskHistory.timeline;
		if (timelineFilter === 'tasks') return taskHistory.timeline.filter(e => e.type === 'jat_event');
		return taskHistory.timeline.filter(e => e.type === 'agent_mail');
	});

	// Status badge colors
	const statusColors: Record<string, string> = {
		open: 'badge-info',
		in_progress: 'badge-warning',
		closed: 'badge-success',
		blocked: 'badge-error'
	};

	// Priority badge colors
	const priorityColors: Record<number, string> = {
		0: 'badge-error', // P0 - Critical
		1: 'badge-warning', // P1 - High
		2: 'badge-info', // P2 - Medium
		3: 'badge-ghost', // P3 - Low
		4: 'badge-ghost' // P4 - Lowest
	};

	// Available options
	const priorityOptions = [
		{ value: 0, label: 'P0 (Critical)' },
		{ value: 1, label: 'P1 (High)' },
		{ value: 2, label: 'P2 (Medium)' },
		{ value: 3, label: 'P3 (Low)' },
		{ value: 4, label: 'P4 (Lowest)' }
	];

	const typeOptions = [
		{ value: 'task', label: 'Task' },
		{ value: 'bug', label: 'Bug' },
		{ value: 'feature', label: 'Feature' },
		{ value: 'epic', label: 'Epic' },
		{ value: 'chore', label: 'Chore' }
	];

	const statusOptions = [
		{ value: 'open', label: 'Open' },
		{ value: 'in_progress', label: 'In Progress' },
		{ value: 'blocked', label: 'Blocked' },
		{ value: 'closed', label: 'Closed' }
	];

	// Project options (dynamically loaded)
	let projectOptions = $state<string[]>([]);
	let isMigrating = $state(false);

	// Fetch task details
	async function fetchTask(id: string) {
		if (!id) return;

		// Cancel any pending fetches from previous task
		if (fetchController) {
			fetchController.abort();
		}
		fetchController = new AbortController();
		const signal = fetchController.signal;

		// Reset loading states for new fetch
		loading = true;
		error = null;
		historyLoading = false;
		historyError = null;
		taskHistory = null;
		availableTasksLoading = false;
		availableTasks = [];

		try {
			const response = await fetch(`/api/tasks/${id}`, { signal });
			if (!response.ok) {
				throw new Error(`Failed to fetch task: ${response.statusText}`);
			}
			const data = await response.json();
			task = data.task;
			originalTask = { ...data.task };

			// Fetch task history, attachments, signals, and available tasks in parallel
			// Pass the signal to allow cancellation
			fetchTaskHistory(id, signal);
			fetchAttachments(id, signal);
			fetchTaskSignals(id, signal);  // New structured signals (primary)
			fetchSessionLogs(id, signal);   // Legacy logs (fallback)
			fetchAvailableTasks(id, signal);

			// Fetch summary for closed tasks
			if (data.task?.status === 'closed') {
				fetchSummary(id, signal);
			}

			// Fetch recoverable session info for in_progress tasks (to show Resume button when paused)
			if (data.task?.status === 'in_progress' && data.task?.assignee) {
				fetchRecoverableSession(id, signal);
			}
		} catch (err: any) {
			// Ignore abort errors (expected when switching tasks or closing drawer)
			if (err.name === 'AbortError') {
				return;
			}
			error = err.message;
			console.error('Error fetching task:', err);
		} finally {
			loading = false;
		}
	}

	// Fetch task history
	async function fetchTaskHistory(id: string, signal?: AbortSignal) {
		if (!id) return;

		historyLoading = true;
		historyError = null;

		try {
			const response = await fetch(`/api/tasks/${id}/history`, { signal });
			if (!response.ok) {
				throw new Error(`Failed to fetch task history: ${response.statusText}`);
			}
			const data = await response.json();
			taskHistory = data;
		} catch (err: any) {
			// Ignore abort errors (expected when switching tasks or closing drawer)
			if (err.name === 'AbortError') {
				return;
			}
			historyError = err.message;
			console.error('Error fetching task history:', err);
		} finally {
			historyLoading = false;
		}
	}

	// Fetch task attachments
	async function fetchAttachments(id: string, signal?: AbortSignal) {
		if (!id) return;

		attachmentsLoading = true;

		try {
			const response = await fetch(`/api/tasks/${id}/image`, { signal });
			if (!response.ok) {
				throw new Error(`Failed to fetch attachments: ${response.statusText}`);
			}
			const data = await response.json();
			attachments = data.images || [];
		} catch (err: any) {
			// Ignore abort errors
			if (err.name === 'AbortError') {
				return;
			}
			console.error('Error fetching attachments:', err);
			attachments = [];
		} finally {
			attachmentsLoading = false;
		}
	}

	// Drag-drop handlers for attachments
	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'copy';
		}
		isDraggingOver = true;
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		isDraggingOver = false;
	}

	async function handleFileDrop(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		isDraggingOver = false;

		if (!event.dataTransfer || !taskId) return;

		const files = Array.from(event.dataTransfer.files);
		if (files.length === 0) return;

		isUploading = true;

		try {
			for (const file of files) {
				await uploadAttachment(file);
			}
			// Refresh attachments after upload
			await fetchAttachments(taskId);
			showToast('success', `✓ Uploaded ${files.length} file${files.length > 1 ? 's' : ''}`);
		} catch (err) {
			console.error('Failed to upload attachment:', err);
			showToast('error', 'Failed to upload file');
		} finally {
			isUploading = false;
		}
	}

	async function uploadAttachment(file: File) {
		if (!taskId) return;

		const formData = new FormData();
		formData.append('file', file, file.name);
		formData.append('sessionName', `task-${taskId}`);
		formData.append('filename', file.name);

		const response = await fetch('/api/work/upload-image', {
			method: 'POST',
			body: formData
		});

		if (!response.ok) {
			throw new Error(`Upload failed: ${response.statusText}`);
		}

		const { filePath } = await response.json();

		// Save to task's images in the server
		const fileId = `file-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
		await fetch(`/api/tasks/${taskId}/image`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ path: filePath, id: fileId })
		});

		// Update task notes with attachment info
		await updateTaskNotesWithAttachment(filePath, file.name);
	}

	async function updateTaskNotesWithAttachment(filePath: string, fileName: string) {
		if (!taskId) return;

		try {
			// Get current attachments to build the notes
			const response = await fetch(`/api/tasks/${taskId}/image`);
			if (!response.ok) return;
			const data = await response.json();
			const images = data.images || [];

			if (images.length === 0) return;

			const filePaths = images.map((img: TaskAttachment, i: number) =>
				`  ${i + 1}. ${img.path}`
			).join('\n');
			const noteText = `📷 Attached screenshots:\n${filePaths}\n(Use Read tool to view these images)`;

			await fetch(`/api/tasks/${taskId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ notes: noteText })
			});
		} catch (err) {
			console.error('Failed to update task notes with attachment:', err);
		}
	}

	// Remove an attachment from the task
	async function removeAttachment(attachmentId: string) {
		if (!taskId) return;

		try {
			const response = await fetch(`/api/tasks/${taskId}/image`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: attachmentId })
			});

			if (!response.ok) {
				throw new Error(`Failed to remove attachment: ${response.statusText}`);
			}

			// Update local state
			attachments = attachments.filter(a => a.id !== attachmentId);
		} catch (err) {
			console.error('Error removing attachment:', err);
		}
	}

	// Fetch task signals (structured timeline)
	async function fetchTaskSignals(id: string, signal?: AbortSignal) {
		if (!id) return;

		signalsLoading = true;

		try {
			const response = await fetch(`/api/tasks/${id}/signals`, { signal });
			if (!response.ok) {
				throw new Error(`Failed to fetch task signals: ${response.statusText}`);
			}
			const data: TaskSignalsResponse = await response.json();
			taskSignals = data.signals || [];
			signalsStats = data.stats || null;
		} catch (err: any) {
			// Ignore abort errors
			if (err.name === 'AbortError') {
				return;
			}
			console.error('Error fetching task signals:', err);
			taskSignals = [];
			signalsStats = null;
		} finally {
			signalsLoading = false;
		}
	}

	// Fetch session logs for this task (legacy - kept as fallback)
	async function fetchSessionLogs(id: string, signal?: AbortSignal) {
		if (!id) return;

		logsLoading = true;

		try {
			const response = await fetch(`/api/tasks/${id}/logs`, { signal });
			if (!response.ok) {
				throw new Error(`Failed to fetch session logs: ${response.statusText}`);
			}
			const data = await response.json();
			sessionLogs = data.logs || [];
		} catch (err: any) {
			// Ignore abort errors
			if (err.name === 'AbortError') {
				return;
			}
			console.error('Error fetching session logs:', err);
			sessionLogs = [];
		} finally {
			logsLoading = false;
		}
	}

	// Fetch recoverable session for in_progress task (when agent is offline/paused)
	// This uses the recovery API to find session ID for tasks with no active tmux session
	async function fetchRecoverableSession(id: string, signal?: AbortSignal) {
		if (!id) return;

		recoverableLoading = true;

		try {
			const response = await fetch('/api/recovery', { signal });
			if (!response.ok) {
				throw new Error(`Failed to fetch recovery info: ${response.statusText}`);
			}
			const data = await response.json();
			// Find the session for this specific task
			const session = (data.sessions || []).find((s: any) => s.taskId === id);
			if (session) {
				recoverableSession = {
					agentName: session.agentName,
					sessionId: session.sessionId,
					taskId: session.taskId,
					lastActivity: session.lastActivity
				};
			} else {
				recoverableSession = null;
			}
		} catch (err: any) {
			// Ignore abort errors
			if (err.name === 'AbortError') {
				return;
			}
			console.error('Error fetching recoverable session:', err);
			recoverableSession = null;
		} finally {
			recoverableLoading = false;
		}
	}

	// Fetch task summary (for closed tasks)
	async function fetchSummary(id: string, signal?: AbortSignal, regenerate = false) {
		if (!id) return;

		summaryLoading = true;
		summaryError = null;

		try {
			const url = `/api/tasks/${id}/summary${regenerate ? '?regenerate=true' : ''}`;
			const response = await fetch(url, { signal });
			if (!response.ok) {
				throw new Error(`Failed to fetch task summary: ${response.statusText}`);
			}
			const data = await response.json();
			summaryData = data.summary || null;
		} catch (err: any) {
			// Ignore abort errors
			if (err.name === 'AbortError') {
				return;
			}
			console.error('Error fetching task summary:', err);
			summaryError = err.message;
			summaryData = null;
		} finally {
			summaryLoading = false;
		}
	}

	// Fetch content of a specific log file
	async function fetchLogContent(filename: string) {
		if (!taskId || !filename) return;

		logContentLoading = true;
		selectedLog = filename;

		try {
			const response = await fetch(`/api/tasks/${taskId}/logs/${encodeURIComponent(filename)}?format=json`);
			if (!response.ok) {
				throw new Error(`Failed to fetch log content: ${response.statusText}`);
			}
			const data = await response.json();
			logContent = data.content || '';
		} catch (err: any) {
			console.error('Error fetching log content:', err);
			logContent = null;
		} finally {
			logContentLoading = false;
		}
	}

	// Close log viewer
	function closeLogViewer() {
		selectedLog = null;
		logContent = null;
	}

	// Convert ANSI escape codes to HTML with inline styles
	function ansiToHtml(text: string): string {
		if (!text) return '';

		// Escape HTML first
		let html = text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');

		// Track current styles
		let currentStyles: string[] = [];

		// ANSI color code mappings
		const colors: Record<number, string> = {
			30: '#000000', 31: '#cc0000', 32: '#00cc00', 33: '#cccc00',
			34: '#0000cc', 35: '#cc00cc', 36: '#00cccc', 37: '#cccccc',
			90: '#666666', 91: '#ff6666', 92: '#66ff66', 93: '#ffff66',
			94: '#6666ff', 95: '#ff66ff', 96: '#66ffff', 97: '#ffffff'
		};

		const bgColors: Record<number, string> = {
			40: '#000000', 41: '#cc0000', 42: '#00cc00', 43: '#cccc00',
			44: '#0000cc', 45: '#cc00cc', 46: '#00cccc', 47: '#cccccc',
			100: '#666666', 101: '#ff6666', 102: '#66ff66', 103: '#ffff66',
			104: '#6666ff', 105: '#ff66ff', 106: '#66ffff', 107: '#ffffff'
		};

		// Process ANSI sequences
		// Match: ESC[ followed by semicolon-separated numbers, ending with 'm'
		html = html.replace(/\x1b\[([0-9;]*)m|\[([0-9;]*)m/g, (match, p1, p2) => {
			const codes = (p1 || p2 || '0').split(';').map(Number);
			let styles: string[] = [];

			for (let i = 0; i < codes.length; i++) {
				const code = codes[i];

				if (code === 0) {
					// Reset
					currentStyles = [];
				} else if (code === 1) {
					currentStyles.push('font-weight:bold');
				} else if (code === 2) {
					currentStyles.push('opacity:0.7');
				} else if (code === 3) {
					currentStyles.push('font-style:italic');
				} else if (code === 4) {
					currentStyles.push('text-decoration:underline');
				} else if (code === 22) {
					// Normal intensity
					currentStyles = currentStyles.filter(s => !s.includes('font-weight') && !s.includes('opacity'));
				} else if (code === 39) {
					// Default foreground
					currentStyles = currentStyles.filter(s => !s.includes('color:'));
				} else if (code === 49) {
					// Default background
					currentStyles = currentStyles.filter(s => !s.includes('background:'));
				} else if (colors[code]) {
					currentStyles = currentStyles.filter(s => !s.includes('color:'));
					currentStyles.push(`color:${colors[code]}`);
				} else if (bgColors[code]) {
					currentStyles = currentStyles.filter(s => !s.includes('background:'));
					currentStyles.push(`background:${bgColors[code]}`);
				} else if (code === 38 && codes[i + 1] === 2) {
					// 24-bit foreground: 38;2;r;g;b
					const r = codes[i + 2] || 0;
					const g = codes[i + 3] || 0;
					const b = codes[i + 4] || 0;
					currentStyles = currentStyles.filter(s => !s.includes('color:'));
					currentStyles.push(`color:rgb(${r},${g},${b})`);
					i += 4;
				} else if (code === 48 && codes[i + 1] === 2) {
					// 24-bit background: 48;2;r;g;b
					const r = codes[i + 2] || 0;
					const g = codes[i + 3] || 0;
					const b = codes[i + 4] || 0;
					currentStyles = currentStyles.filter(s => !s.includes('background:'));
					currentStyles.push(`background:rgb(${r},${g},${b})`);
					i += 4;
				}
			}

			if (currentStyles.length > 0) {
				return `</span><span style="${currentStyles.join(';')}">`;
			} else {
				return '</span><span>';
			}
		});

		// Wrap in span and clean up empty spans
		html = `<span>${html}</span>`;
		html = html.replace(/<span><\/span>/g, '');
		html = html.replace(/<\/span><span>/g, '');

		return html;
	}

	// Derived: rendered log content with ANSI colors
	const renderedLogContent = $derived(ansiToHtml(logContent || ''));

	// Fetch available tasks from same project for dependencies dropdown
	async function fetchAvailableTasks(taskIdParam: string, signal?: AbortSignal) {
		if (!taskIdParam) return;

		// Extract project from task ID (e.g., "jat-abc" -> "jat")
		const project = taskIdParam.split('-')[0];
		if (!project) return;

		availableTasksLoading = true;

		try {
			// Fetch open/in_progress tasks from same project
			const response = await fetch(`/api/agents?full=true&project=${encodeURIComponent(project)}`, { signal });
			if (!response.ok) {
				throw new Error(`Failed to fetch tasks: ${response.statusText}`);
			}
			const data = await response.json();

			// Filter to open/in_progress tasks, excluding current task and existing dependencies
			const currentDeps = task?.depends_on?.map((d: any) => d.id) || [];
			availableTasks = (data.tasks || [])
				.filter((t: any) =>
					t.id !== taskIdParam &&
					!currentDeps.includes(t.id) &&
					(t.status === 'open' || t.status === 'in_progress')
				)
				.map((t: any) => ({
					id: t.id,
					title: t.title,
					status: t.status,
					priority: t.priority
				}))
				.sort((a: AvailableTask, b: AvailableTask) => a.priority - b.priority);
		} catch (err: any) {
			// Ignore abort errors
			if (err.name === 'AbortError') {
				return;
			}
			console.error('Error fetching available tasks:', err);
			availableTasks = [];
		} finally {
			availableTasksLoading = false;
		}
	}

	// Watch for taskId changes
	$effect(() => {
		if (taskId && isOpen) {
			fetchTask(taskId);
		}
	});

	// Poll for signals updates when drawer is open with an in-progress task
	// This keeps the Activity Timeline updated in real-time
	$effect(() => {
		// Only poll when drawer is open, has a taskId, and task is in_progress
		const shouldPoll = isOpen && taskId && task?.status === 'in_progress';

		if (shouldPoll) {
			// Start polling if not already
			if (!signalsPollInterval) {
				signalsPollInterval = setInterval(() => {
					if (taskId) {
						fetchTaskSignals(taskId);
					}
				}, SIGNALS_POLL_INTERVAL_MS);
			}
		} else {
			// Stop polling
			if (signalsPollInterval) {
				clearInterval(signalsPollInterval);
				signalsPollInterval = null;
			}
		}

		// Cleanup on effect re-run or component destroy
		return () => {
			if (signalsPollInterval) {
				clearInterval(signalsPollInterval);
				signalsPollInterval = null;
			}
		};
	});

	// Show toast notification
	function showToast(type: 'success' | 'error' | 'warning', text: string) {
		toastMessage = { type, text };
		setTimeout(() => {
			toastMessage = null;
		}, 3000); // Hide after 3 seconds
	}

	// Copy task ID to clipboard
	async function copyTaskIdToClipboard() {
		if (!task?.id) return;
		try {
			await navigator.clipboard.writeText(task.id);
			copiedTaskId = true;
			setTimeout(() => {
				copiedTaskId = false;
			}, 1500);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	// Debounced auto-save function
	async function autoSave(field: string, value: any) {
		// Clear any pending save
		if (saveTimeout) {
			clearTimeout(saveTimeout);
		}

		// Debounce for 500ms
		saveTimeout = setTimeout(async () => {
			isSaving = true;
			isUpdatingFromServer = true;
			saveError = null;

			// Create backup of current task for rollback
			const taskBackup = task ? { ...task } : null;

			try {
				// Optimistic update - update UI immediately
				if (task) {
					task = { ...task, [field]: value };
				}

				// Prepare PATCH request body (only the changed field)
				const updateData: Record<string, any> = {};
				updateData[field] = value;

				// Make PATCH request
				const response = await fetch(`/api/tasks/${taskId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(updateData)
				});

				if (!response.ok) {
					const errorData = await response.json();
					throw new Error(errorData.message || 'Failed to save');
				}

				const data = await response.json();

				// Update task with server response
				task = data.task as DrawerTask;

				// Update originalTask to match saved state
				originalTask = task ? { ...task } : null;

				lastSaved = new Date();

				// Show success toast
				showToast('success', '✓ Saved');

			} catch (error: any) {
				// Rollback on error
				if (taskBackup) {
					task = taskBackup;
				}
				saveError = error.message;

				// Show error toast
				showToast('error', `✗ ${error.message}`);
			} finally {
				isSaving = false;
				isUpdatingFromServer = false;
			}
		}, 500);
	}

	// Fetch available projects from the API
	async function fetchProjects() {
		try {
			const response = await fetch('/api/sessions');
			if (response.ok) {
				const data = await response.json();
				// Extract unique projects from sessions
				const projects = new Set<string>();
				if (data.projects) {
					data.projects.forEach((p: string) => projects.add(p));
				}
				// Also check task IDs for additional projects
				if (data.tasks) {
					data.tasks.forEach((t: any) => {
						if (t.id) {
							const prefix = t.id.split('-')[0];
							if (prefix) projects.add(prefix);
						}
					});
				}
				// Fallback: if no projects found, use known defaults
				if (projects.size === 0) {
					projectOptions = ['jat', 'chimaro', 'jomarchy', 'flush', 'linux', 'steelbridge'];
				} else {
					projectOptions = Array.from(projects).sort();
				}
			}
		} catch (error) {
			console.error('Failed to fetch projects:', error);
			// Use defaults on error
			projectOptions = ['jat', 'chimaro', 'jomarchy'];
		}
	}

	// Migrate task to a different project
	async function migrateToProject(targetProject: string) {
		if (!task || !taskId) return;

		const currentProject = task.project;
		if (currentProject === targetProject) {
			showToast('error', 'Task is already in this project');
			return;
		}

		// Confirm migration since it changes the task ID
		const confirmed = confirm(
			`Migrate task to ${targetProject}?\n\n` +
			`This will:\n` +
			`- Move the task to the ${targetProject} project\n` +
			`- Assign a new task ID (e.g., ${targetProject}-xyz)\n` +
			`- Preserve all task data and dependencies\n\n` +
			`The current task ID (${taskId}) will no longer exist.`
		);

		if (!confirmed) return;

		isMigrating = true;
		isUpdatingFromServer = true;

		try {
			const response = await fetch(`/api/tasks/${taskId}/migrate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ targetProject })
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || 'Migration failed');
			}

			// Broadcast event for other components BEFORE closing
			// Using 'task-updated' to signal the migration (task changed)
			broadcastTaskEvent('task-updated', data.newTaskId);

			// Notify parent to refresh their data
			onrefresh();

			// Close the drawer - the old task no longer exists
			isOpen = false;

			// Show success toast with new task ID (user can find it in the list)
			showToast('success', `✓ Migrated: ${data.oldTaskId} → ${data.newTaskId}`);

		} catch (error: any) {
			showToast('error', `✗ ${error.message}`);
			console.error('Migration failed:', error);
		} finally {
			isMigrating = false;
			isUpdatingFromServer = false;
		}
	}

	// Add a dependency to the task
	async function addDependency(depId: string) {
		if (!task || !taskId || !depId) return;

		isSaving = true;
		isUpdatingFromServer = true;

		try {
			// Get current dependency IDs
			const currentDeps = task.depends_on?.map((d: any) => d.id) || [];
			const newDeps = [...currentDeps, depId];

			// Update via API
			const response = await fetch(`/api/tasks/${taskId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dependencies: newDeps })
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to add dependency');
			}

			const data = await response.json();

			// Update task with server response
			task = data.task as DrawerTask;
			originalTask = task ? { ...task } : null;

			// Refresh available tasks (to remove the one we just added)
			fetchAvailableTasks(taskId);

			// Hide dropdown
			showDependencyDropdown = false;

			showToast('success', `✓ Added dependency ${depId}`);
		} catch (error: any) {
			showToast('error', `✗ ${error.message}`);
		} finally {
			isSaving = false;
			isUpdatingFromServer = false;
		}
	}

	// Remove a dependency from the task
	async function removeDependency(depId: string) {
		if (!task || !taskId || !depId) return;

		isSaving = true;
		isUpdatingFromServer = true;

		try {
			// Get current dependency IDs and remove the specified one
			const currentDeps = task.depends_on?.map((d: any) => d.id) || [];
			const newDeps = currentDeps.filter((id: string) => id !== depId);

			// Update via API
			const response = await fetch(`/api/tasks/${taskId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dependencies: newDeps })
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to remove dependency');
			}

			const data = await response.json();

			// Update task with server response
			task = data.task as DrawerTask;
			originalTask = task ? { ...task } : null;

			// Refresh available tasks (to add the one we just removed)
			fetchAvailableTasks(taskId);

			showToast('success', `✓ Removed dependency ${depId}`);
		} catch (error: any) {
			showToast('error', `✗ ${error.message}`);
		} finally {
			isSaving = false;
			isUpdatingFromServer = false;
		}
	}

	// Delete task with confirmation
	let isDeleting = $state(false);

	async function handleDelete() {
		if (!task || !taskId) return;

		// Confirm deletion
		const confirmed = confirm(
			`Are you sure you want to delete task "${task.title}"?\n\nThis action cannot be undone.`
		);

		if (!confirmed) return;

		isDeleting = true;
		isUpdatingFromServer = true;

		try {
			const response = await fetch(`/api/tasks/${taskId}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				// Parse error response to get specific error message
				const errorData = await response.json();
				const errorMessage = errorData.message || 'Failed to delete task';
				throw new Error(errorMessage);
			}

			// Show success message
			showToast('success', '✓ Task deleted');

			// Reset state and close drawer
			isDeleting = false;
			isUpdatingFromServer = false;

			// Close drawer after short delay for toast visibility
			setTimeout(() => {
				isOpen = false;
				task = null;
				taskId = null;
				// Notify parent to refresh task list
				ondelete();
			}, 500);
		} catch (error: any) {
			console.error('Delete error:', error);
			showToast('error', `✗ ${error.message}`);
			isDeleting = false;
			isUpdatingFromServer = false;
		}
	}

	// ========== Task Action Handlers ==========

	/**
	 * Spawn a new agent to work on this task
	 * Calls /api/work/spawn directly - no need for parent to pass onspawn handler
	 */
	async function handleSpawn() {
		if (!task || !taskId || isSpawning) return;

		isSpawning = true;
		try {
			const response = await fetch('/api/work/spawn', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					taskId,
					attach: false  // Don't auto-attach terminal
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to spawn agent');
			}

			const data = await response.json();
			showToast('success', `🚀 Agent ${data.session?.agentName || ''} spawned`);

			// Broadcast event so pages refresh immediately
			broadcastTaskEvent('task-start-requested', taskId!);

			// Refetch task to get updated status
			setTimeout(() => fetchTask(taskId!), 500);

			// Also call the onspawn callback if provided (for additional parent handling)
			if (onspawn) {
				onspawn(taskId!);
			}
		} catch (error: any) {
			console.error('Spawn error:', error);
			showToast('error', `✗ ${error.message}`);
		} finally {
			isSpawning = false;
		}
	}

	/**
	 * Release task (unassign and reset to open)
	 */
	async function handleRelease() {
		if (!task || !taskId || isReleasing) return;

		isReleasing = true;
		try {
			const response = await fetch(`/api/tasks/${taskId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ assignee: null, status: 'open' })
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to release task');
			}

			// Broadcast event so pages refresh immediately
			broadcastTaskEvent('task-released', taskId);

			showToast('success', '✓ Task released');

			// Refetch task to get updated status
			await fetchTask(taskId);
			onrefresh();
		} catch (error: any) {
			console.error('Release error:', error);
			showToast('error', `✗ ${error.message}`);
		} finally {
			isReleasing = false;
		}
	}

	/**
	 * Attach to agent's tmux session
	 */
	function handleAttach() {
		if (!sessionName) return;

		const command = `tmux attach-session -t "${sessionName}"`;
		navigator.clipboard.writeText(command);
		showToast('success', '📋 Command copied - paste in terminal');
	}

	/**
	 * Resume a previous Claude Code session from the activity timeline
	 * Uses Claude's -r flag to continue the conversation
	 */
	async function handleResumeSession(sessionId: string, agentName?: string) {
		if (!sessionId || resumingSessionId) return;

		resumingSessionId = sessionId;
		try {
			// Use agent name for the URL path, pass session_id in body
			const name = agentName || 'unknown';
			const response = await fetch(`/api/sessions/${name}/resume`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ session_id: sessionId })
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to resume session');
			}

			const data = await response.json();
			showToast('success', `▶️ Resuming session for ${data.agentName || name}`);
		} catch (error: any) {
			console.error('Resume session error:', error);
			showToast('error', `✗ ${error.message}`);
		} finally {
			resumingSessionId = null;
		}
	}

	/**
	 * Create suggested tasks from EventStack timeline events
	 * Returns results for feedback UI in SuggestedTasksSection
	 */
	async function createSuggestedTasks(
		selectedTasks: SuggestedTaskWithState[]
	): Promise<{ success: any[]; failed: any[] }> {
		if (selectedTasks.length === 0) {
			return { success: [], failed: [] };
		}

		// Map tasks to the bulk API format
		const tasksToCreate = selectedTasks.map((t) => ({
			type: t.edits?.type || t.type || 'task',
			title: t.edits?.title || t.title,
			description: t.edits?.description || t.description || '',
			priority: t.edits?.priority ?? t.priority ?? 2,
			project: t.edits?.project || t.project || defaultProject || undefined,
			labels: t.edits?.labels || t.labels || undefined,
			depends_on: t.edits?.depends_on || t.depends_on || undefined,
		}));

		try {
			const response = await fetch('/api/tasks/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tasks: tasksToCreate }),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to create tasks');
			}

			const data = await response.json();

			// Format results
			const results = {
				success: data.results?.filter((r: any) => r.success) || [],
				failed: data.results?.filter((r: any) => !r.success) || [],
			};

			// Show toast feedback
			if (results.success.length > 0) {
				showToast('success', `✓ Created ${results.success.length} task${results.success.length > 1 ? 's' : ''}`);
				// Broadcast task event to refresh task lists
				broadcastTaskEvent({ type: 'tasks-created', taskIds: results.success.map((r: any) => r.taskId) });
			}
			if (results.failed.length > 0) {
				showToast('error', `✗ Failed to create ${results.failed.length} task${results.failed.length > 1 ? 's' : ''}`);
			}

			return results;
		} catch (error: any) {
			console.error('[TaskDetailDrawer] Failed to create tasks:', error);
			showToast('error', `✗ ${error.message}`);
			return {
				success: [],
				failed: selectedTasks.map((t) => ({ title: t.title, error: error.message })),
			};
		}
	}

	/**
	 * Create suggested tasks AND spawn agent sessions for each
	 * Returns results for feedback UI in SuggestedTasksSection
	 */
	async function createAndStartSuggestedTasks(
		selectedTasks: SuggestedTaskWithState[]
	): Promise<{ success: any[]; failed: any[] }> {
		// First, create the tasks
		const createResult = await createSuggestedTasks(selectedTasks);

		// If no tasks were successfully created, return early
		if (createResult.success.length === 0) {
			return createResult;
		}

		// Spawn agents for each successfully created task (with 2s stagger)
		const spawnResults: { success: any[]; failed: any[] } = {
			success: [],
			failed: [...createResult.failed],
		};

		for (let i = 0; i < createResult.success.length; i++) {
			const createdTask = createResult.success[i];
			if (!createdTask.taskId) {
				spawnResults.success.push(createdTask); // Still count as success even without spawn
				continue;
			}

			try {
				// Add stagger between spawns (except first)
				if (i > 0) {
					await new Promise((resolve) => setTimeout(resolve, 2000));
				}

				const spawnResponse = await fetch('/api/work/spawn', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ taskId: createdTask.taskId }),
				});

				const spawnData = await spawnResponse.json();

				if (spawnResponse.ok && spawnData.agentName) {
					spawnResults.success.push({
						...createdTask,
						agentName: spawnData.agentName,
						spawned: true,
					});
					console.log(`[TaskDetailDrawer] Spawned agent ${spawnData.agentName} for task ${createdTask.taskId}`);
				} else {
					spawnResults.success.push({
						...createdTask,
						spawnError: spawnData.message || 'Spawn failed',
					});
				}
			} catch (error: any) {
				console.error(`[TaskDetailDrawer] Failed to spawn agent for ${createdTask.taskId}:`, error);
				spawnResults.success.push({
					...createdTask,
					spawnError: error.message,
				});
			}
		}

		return spawnResults;
	}

	/**
	 * Send a message to the agent working on this task
	 */
	async function handleSendMessage() {
		if (!task || !taskId || !task.assignee || !messageText.trim()) return;

		isSendingMessage = true;
		try {
			const response = await fetch('/api/agents/message', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					to: task.assignee,
					subject: `Re: ${taskId}`,
					body: messageText.trim(),
					thread: taskId
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to send message');
			}

			showToast('success', '📬 Message sent');
			messageText = '';
			showMessageModal = false;
		} catch (error: any) {
			console.error('Send message error:', error);
			showToast('error', `✗ ${error.message}`);
		} finally {
			isSendingMessage = false;
		}
	}

	/**
	 * Show the reopen modal (prompts for reason)
	 */
	function handleReopen() {
		if (!task || !taskId) return;
		reopenReason = '';
		showReopenModal = true;
	}

	/**
	 * Perform the actual reopen with reason appended to description
	 * @param andStart - If true, also spawn a new agent session to work on the task
	 */
	async function confirmReopen(andStart: boolean = false) {
		if (!task || !taskId || !reopenReason.trim()) return;

		isReopening = true;
		try {
			// Build the updated description with reopened context
			const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
			const reopenedNote = `\n\n---\n**[REOPENED ${timestamp}]** ${reopenReason.trim()}`;
			const newDescription = (task.description || '') + reopenedNote;

			const response = await fetch(`/api/tasks/${taskId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					status: 'open',
					assignee: null,
					description: newDescription
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to reopen task');
			}

			// If andStart, spawn a new session to work on this task
			if (andStart && task.project_path) {
				try {
					const spawnResponse = await fetch('/api/work/spawn', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							project: task.project_path,
							taskId: taskId,
							attach: true
						})
					});
					if (!spawnResponse.ok) {
						console.error('Failed to spawn session:', await spawnResponse.text());
						showToast('warning', '✓ Task reopened, but failed to spawn session');
					} else {
						showToast('success', '✓ Task reopened and session started');
					}
				} catch (spawnErr) {
					console.error('Spawn error:', spawnErr);
					showToast('warning', '✓ Task reopened, but failed to spawn session');
				}
			} else {
				showToast('success', '✓ Task reopened');
			}

			showReopenModal = false;
			reopenReason = '';
			await fetchTask(taskId);
			onrefresh();
		} catch (error: any) {
			console.error('Reopen error:', error);
			showToast('error', `✗ ${error.message}`);
		} finally {
			isReopening = false;
		}
	}

	// Keyboard shortcut handler
	function handleKeyDown(event: KeyboardEvent) {
		// Only handle shortcuts when drawer is open
		if (!isOpen) return;

		// Ignore keyboard shortcuts when typing in inputs
		const target = event.target as HTMLElement;
		const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

		// Escape: Close drawer (always works, even in inputs)
		if (event.key === 'Escape') {
			event.preventDefault();
			handleClose();
			return;
		}

		// Don't handle other shortcuts when typing
		if (isTyping) return;

		// ?: Toggle help panel
		if (event.key === '?' && !event.shiftKey) {
			event.preventDefault();
			showHelp = !showHelp;
			return;
		}

		// M: Mark complete (close task)
		if (event.key === 'm' || event.key === 'M') {
			if (!loading && !error && task) {
				event.preventDefault();
				markComplete();
			}
			return;
		}
	}

	// Mark task as complete
	async function markComplete() {
		if (!task || isSaving) return;

		isSaving = true;
		saveError = null;

		try {
			const response = await fetch(`/api/tasks/${taskId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: 'closed' })
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to close task');
			}

			const data = await response.json();
			task = data.task;
			originalTask = { ...data.task };

			showToast('success', '✓ Task marked as complete');
		} catch (error: any) {
			console.error('Mark complete error:', error);
			saveError = error.message;
			showToast('error', `✗ ${error.message}`);
		} finally {
			isSaving = false;
		}
	}

	// Handle drawer close
	function handleClose() {
		// Clear any pending save
		if (saveTimeout) {
			clearTimeout(saveTimeout);
			saveTimeout = null;
		}

		// Cancel any pending fetches
		if (fetchController) {
			fetchController.abort();
			fetchController = null;
		}

		if (!isSaving && !isDeleting) {
			isOpen = false;
			task = null;
			originalTask = null;
			error = null;
			saveError = null;
			toastMessage = null;
			lastSaved = null;
			showHelp = false;
			// Reset logs state
			sessionLogs = [];
			logsExpanded = false;
			selectedLog = null;
			logContent = null;
			// Reset signals state
			taskSignals = [];
			signalsStats = null;
			signalsExpanded = true;
			// Reset recoverable session state
			recoverableSession = null;
			recoverableLoading = false;
			// Reset loading states
			loading = false;
			historyLoading = false;
			historyError = null;
			taskHistory = null;
			availableTasksLoading = false;
			availableTasks = [];
			attachmentsLoading = false;
			attachments = [];
			logsLoading = false;
			signalsLoading = false;
		}
	}

	// Setup keyboard listener and timer on mount
	onMount(() => {
		if (browser) {
			window.addEventListener('keydown', handleKeyDown);
			// Update timer every 30 seconds for elapsed time display
			timerInterval = setInterval(() => {
				now = Date.now();
			}, 30000);
			// Fetch available projects for migration dropdown
			fetchProjects();
		}
	});

	// Cleanup on destroy
	onDestroy(() => {
		if (browser) {
			window.removeEventListener('keydown', handleKeyDown);
			if (timerInterval) {
				clearInterval(timerInterval);
				timerInterval = null;
			}
			if (signalsPollInterval) {
				clearInterval(signalsPollInterval);
				signalsPollInterval = null;
			}
		}
	});
</script>

<!-- DaisyUI Drawer -->
<div class="drawer drawer-end z-50">
	<input id="task-detail-drawer" type="checkbox" class="drawer-toggle" bind:checked={isOpen} />

	<!-- Drawer side -->
	<div class="drawer-side">
		<label
			aria-label="close sidebar"
			class="drawer-overlay"
			onclick={handleClose}
		></label>

		<!-- Drawer Panel (fixed height, header/footer sticky, content scrolls) - Industrial -->
		<div
			class="h-full w-full max-w-2xl flex flex-col shadow-2xl bg-base-100 border-l border-base-300"
		>
			<!-- Header - Industrial -->
			<div
				class="flex items-center justify-between p-6 relative bg-base-200 border-b border-base-300"
			>
				<!-- Left accent bar -->
				<div
					class="absolute left-0 top-0 bottom-0 w-1 bg-primary"
				></div>
				<div class="flex-1 min-w-0">
					<!-- Task Title (Inline Editable, truncated with tooltip) -->
					{#if task}
						<div class="group relative flex items-center gap-2">
							<InlineEdit
								value={task.title || ''}
								onSave={async (newValue) => {
									await autoSave('title', newValue);
								}}
								type="text"
								placeholder="Enter task title..."
								disabled={isSaving}
								class="text-2xl font-bold flex-1 min-w-0"
								truncate={true}
							/>
							<!-- Pencil icon hint (shows on hover) -->
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="w-4 h-4 text-base-content/30 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
								aria-hidden="true"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
							</svg>
						</div>
					{:else}
						<h2 class="text-2xl font-bold text-base-content">Task Details</h2>
					{/if}
					<!-- Task ID + Badges + Metadata (all in one row) -->
					<div class="flex flex-wrap items-center gap-2 mt-1">
						{#if task}
							<!-- Task ID (clickable to copy) -->
							<button
								class="badge badge-sm badge-outline gap-1 cursor-pointer hover:badge-primary transition-colors"
								onclick={copyTaskIdToClipboard}
								title="Click to copy task ID"
							>
								{task.id}
								{#if copiedTaskId}
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3 text-success">
										<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
									</svg>
								{:else}
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
										<path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
									</svg>
								{/if}
							</button>

							<!-- Status (editable) -->
							<InlineSelect
								value={task.status || 'open'}
								options={statusOptions}
								onSave={async (newValue) => {
									await autoSave('status', newValue);
								}}
								disabled={isSaving}
							>
								<div class="badge badge-sm {statusColors[task.status] || 'badge-ghost'}">
									{task.status || 'unknown'}
								</div>
							</InlineSelect>

							<!-- Priority (editable) -->
							<InlineSelect
								value={String(task.priority ?? 2)}
								options={priorityOptions.map(o => ({ value: String(o.value), label: o.label }))}
								onSave={async (newValue) => {
									await autoSave('priority', parseInt(newValue, 10));
								}}
								disabled={isSaving}
							>
								<div class="badge badge-sm {priorityColors[task.priority] || 'badge-ghost'}">
									P{task.priority ?? '?'}
								</div>
							</InlineSelect>

							<!-- Type (editable) -->
							<InlineSelect
								value={task.type || 'task'}
								options={typeOptions}
								onSave={async (newValue) => {
									await autoSave('type', newValue);
								}}
								disabled={isSaving}
							>
								<div class="badge badge-sm badge-outline">{task.type || 'task'}</div>
							</InlineSelect>

							<!-- Project (migrate to different project) -->
							<InlineSelect
								value={task?.project || ''}
								options={projectOptions.filter(p => p !== task?.project).map(p => ({ value: p, label: p }))}
								onSave={async (newValue) => {
									if (newValue && newValue !== task?.project) {
										await migrateToProject(newValue);
									}
								}}
								disabled={isSaving || isMigrating}
							>
								{#if isMigrating}
									<div class="badge badge-sm badge-primary gap-1">
										<span class="loading loading-spinner loading-xs"></span>
										Migrating...
									</div>
								{:else if task.project}
									<div class="badge badge-sm badge-primary">{task.project}</div>
								{:else}
									<div class="badge badge-sm badge-ghost badge-outline">No project</div>
								{/if}
							</InlineSelect>

							<!-- Separator -->
							<span class="text-base-content/20">•</span>

							<!-- Created timestamp -->
							<span class="text-xs text-base-content/50">
								{formatRelativeTimestamp(task.created_at)}
							</span>

							<!-- Separator -->
							<span class="text-base-content/20">•</span>

							<!-- Assignee / Actions -->
							<span class="flex items-center gap-1.5">
								{#if actionMode === 'spawn'}
									<!-- Unassigned: Show Launch button -->
									<button
										class="btn btn-xs btn-primary gap-1"
										onclick={handleSpawn}
										disabled={isSpawning || depStatus.hasBlockers}
										title={depStatus.hasBlockers ? depStatus.blockingReason : 'Launch agent to work on this task'}
									>
										{#if isSpawning}
											<span class="loading loading-spinner loading-xs"></span>
										{:else}
											<svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
												<path d="M12 2C12 2 8 6 8 12C8 15 9 17 10 18L10 21C10 21.5 10.5 22 11 22H13C13.5 22 14 21.5 14 21L14 18C15 17 16 15 16 12C16 6 12 2 12 2Z" />
											</svg>
										{/if}
										<span>Launch</span>
									</button>
									{#if depStatus.hasBlockers}
										<span class="text-xs text-warning" title={depStatus.blockingReason}>⚠</span>
									{/if}
								{:else if (actionMode === 'in_progress' || actionMode === 'blocked') && task?.assignee}
									<!-- Assigned: Show agent + actions (only when there's an actual assignee) -->
									<div class="flex items-center gap-1">
										<div class="avatar">
											<div class="w-5 h-5 rounded-full ring-1 {isAgentOnline ? 'ring-success' : isPausedSession ? 'ring-secondary' : 'ring-warning'}">
												<AgentAvatar name={task.assignee} size={20} />
											</div>
										</div>
										<span class="text-xs">{task.assignee}</span>
										{#if isAgentOnline && sessionName}
											<button
												class="btn btn-ghost btn-xs btn-circle h-5 w-5 min-h-0"
												onclick={handleAttach}
												title="Copy attach command"
											>
												<svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
													<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
												</svg>
											</button>
											<button
												class="btn btn-ghost btn-xs btn-circle h-5 w-5 min-h-0"
												onclick={() => showMessageModal = true}
												title="Send message"
											>
												<svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
													<path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
												</svg>
											</button>
										{:else if isPausedSession && recoverableSession}
											<!-- Paused session: Show Resume button -->
											<span class="badge badge-xs badge-secondary">paused</span>
											<button
												class="btn btn-xs btn-primary gap-1"
												onclick={() => handleResumeSession(recoverableSession!.sessionId, recoverableSession!.agentName)}
												disabled={resumingSessionId !== null}
												title="Resume the paused Claude conversation"
											>
												{#if resumingSessionId === recoverableSession.sessionId}
													<span class="loading loading-spinner loading-xs"></span>
												{:else}
													<svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
														<path d="M8 5v14l11-7z"/>
													</svg>
												{/if}
												<span>Resume</span>
											</button>
										{/if}
										<button
											class="btn btn-ghost btn-xs btn-circle h-5 w-5 min-h-0 hover:btn-error"
											onclick={handleRelease}
											disabled={isReleasing}
											title="Release task"
										>
											{#if isReleasing}
												<span class="loading loading-spinner loading-xs"></span>
											{:else}
												<svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
													<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
												</svg>
											{/if}
										</button>
									</div>
								{:else if actionMode === 'blocked' && !task?.assignee}
									<!-- Blocked but no assignee: Show blocked indicator + launch option -->
									<div class="flex items-center gap-1.5">
										<span class="badge badge-warning badge-xs gap-1">
											<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
											</svg>
											Blocked
										</span>
									</div>
								{:else if actionMode === 'closed'}
									<!-- Closed: Show resume + reopen options -->
									<div class="flex items-center gap-1">
										<!-- Resume: Continue Claude conversation (more common action) -->
										{#if uniqueSessions.length === 1}
											<button
												class="btn btn-xs btn-primary gap-1"
												onclick={() => handleResumeSession(uniqueSessions[0].session_id, uniqueSessions[0].agent_name)}
												disabled={resumingSessionId !== null}
												title="Continue the Claude conversation where it left off"
											>
												{#if resumingSessionId === uniqueSessions[0].session_id}
													<span class="loading loading-spinner loading-xs"></span>
												{:else}
													<svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
														<path d="M8 5v14l11-7z"/>
													</svg>
												{/if}
												<span>Resume</span>
											</button>
										{:else if uniqueSessions.length > 1}
											<!-- Multiple sessions - show dropdown -->
											<div class="dropdown dropdown-end">
												<button
													tabindex="0"
													class="btn btn-xs btn-primary gap-1"
													disabled={resumingSessionId !== null}
													title="Continue the Claude conversation where it left off"
												>
													<svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
														<path d="M8 5v14l11-7z"/>
													</svg>
													<span>Resume</span>
													<svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
													</svg>
												</button>
												<ul tabindex="0" class="dropdown-content menu rounded-box z-50 w-52 p-1 shadow-lg bg-base-200 border border-base-300">
													{#each uniqueSessions as session}
														<li>
															<button
																class="text-xs"
																onclick={() => { handleResumeSession(session.session_id, session.agent_name); document.activeElement?.blur(); }}
																disabled={resumingSessionId === session.session_id}
															>
																{#if resumingSessionId === session.session_id}
																	<span class="loading loading-spinner loading-xs"></span>
																{:else}
																	<svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
																		<path d="M8 5v14l11-7z"/>
																	</svg>
																{/if}
																<span>{session.agent_name || 'Session'}</span>
																<span class="text-base-content/50">{formatRelativeTimestamp(session.timestamp)}</span>
															</button>
														</li>
													{/each}
												</ul>
											</div>
										{/if}
										<!-- Reopen: Change task status back to open -->
										<button
											class="btn btn-xs btn-ghost gap-1"
											onclick={handleReopen}
											disabled={isSaving}
											title="Change task status from closed to open (doesn't restore conversation)"
										>
											<svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
											</svg>
											<span>Reopen</span>
										</button>
									</div>
								{/if}
							</span>
						{/if}

						<!-- Save indicator -->
						{#if isSaving}
							<span class="text-xs text-base-content/70">
								<span class="loading loading-spinner loading-xs"></span>
								Saving...
							</span>
						{:else if lastSaved}
							<span class="text-xs text-base-content/70">
								✓ Saved {formatSavedTime(lastSaved)}
							</span>
						{/if}
					</div>
				</div>
				<!-- Close button (header) -->
				<button
					class="btn btn-sm btn-circle btn-ghost"
					onclick={handleClose}
					disabled={isSaving || isDeleting}
					aria-label="Close drawer (Esc)"
					title="Close (Esc)"
				>
					✕
				</button>
			</div>

			<!-- Content (scrollable area between sticky header and footer) - Industrial -->
			<div
				class="flex-1 overflow-y-auto p-6 flex flex-col min-h-0 bg-base-100"
			>
				{#if loading}
					<!-- Loading state - Industrial skeleton -->
					<TaskDetailSkeleton />
				{:else if error}
					<!-- Error state -->
					<div class="alert alert-error">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="stroke-current shrink-0 h-6 w-6"
							fill="none"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span>{error}</span>
					</div>
					<div class="mt-4">
						<button class="btn btn-primary" onclick={() => taskId && fetchTask(taskId)}>
							Retry
						</button>
					</div>
				{:else if task}
					<!-- View Mode -->
					<div class="flex flex-col gap-6">
						<!-- Labels (badges, click to edit) - Industrial -->
						<div>
							<h4 class="text-xs font-semibold mb-2 font-mono uppercase tracking-wider text-base-content/60">Labels</h4>
							{#if editingLabels}
								<!-- Edit mode: text input - Industrial -->
								<input
									type="text"
									class="input input-sm w-full text-sm font-mono bg-base-200 border border-base-300 text-base-content"
									value={task.labels ? task.labels.join(', ') : ''}
									placeholder="label1, label2, label3..."
									onblur={async (e) => {
										const labelsArray = e.currentTarget.value
											.split(',')
											.map((l) => l.trim())
											.filter((l) => l.length > 0);
										await autoSave('labels', labelsArray);
										editingLabels = false;
									}}
									onkeydown={(e) => {
										if (e.key === 'Enter') {
											e.currentTarget.blur();
										} else if (e.key === 'Escape') {
											editingLabels = false;
										}
									}}
									disabled={isSaving}
									use:autofocusAction
								/>
							{:else}
								<!-- Display mode: badges - Industrial -->
								<button
									class="flex flex-wrap gap-2 items-center cursor-pointer rounded px-2 py-1 transition-colors w-full text-left industrial-hover bg-base-200"
									onclick={() => (editingLabels = true)}
									type="button"
								>
									{#if task.labels && task.labels.length > 0}
										{#each task.labels as label}
											<span class="badge badge-sm badge-outline">{label}</span>
										{/each}
									{:else}
										<span class="text-sm text-base-content/50 italic">Add labels...</span>
									{/if}
								</button>
							{/if}
						</div>

						<!-- Description (Inline Editable) - Industrial -->
						<div>
							<h4 class="text-xs font-semibold mb-2 font-mono uppercase tracking-wider text-base-content/60">Description</h4>
							<InlineEdit
								value={task.description || ''}
								onSave={async (newValue) => {
									await autoSave('description', newValue);
								}}
								type="textarea"
								placeholder="No description"
								disabled={isSaving}
								rows={4}
								class="text-sm"
							/>
						</div>

						<!-- Task Summary - Industrial -->
						{#if task.status === 'closed' || summaryData}
							<!-- Full summary section for closed tasks or when summary has been generated -->
							<div class="rounded-lg p-4 bg-base-200 border border-base-300">
								<div class="flex items-center justify-between mb-3">
									<h4 class="text-xs font-semibold font-mono uppercase tracking-wider text-base-content/60">
										{task.status === 'closed' ? 'Completion Summary' : 'Progress Summary'}
									</h4>
									{#if summaryData}
										<button
											class="btn btn-xs btn-ghost"
											onclick={() => taskId && fetchSummary(taskId, undefined, true)}
											disabled={summaryLoading}
											title="Regenerate summary"
										>
											{#if summaryLoading}
												<span class="loading loading-spinner loading-xs"></span>
											{:else}
												<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
												</svg>
											{/if}
										</button>
									{/if}
								</div>

								{#if summaryLoading}
									<div class="flex items-center gap-2 text-sm text-base-content/60">
										<span class="loading loading-spinner loading-sm"></span>
										<span>Generating summary...</span>
									</div>
								{:else if summaryError}
									<div class="text-sm text-error">{summaryError}</div>
								{:else if summaryData}
									<!-- Outcome Badge -->
									<div class="flex items-center gap-2 mb-3">
										<span class="badge {summaryData.outcome === 'completed' ? 'badge-success' : summaryData.outcome === 'blocked' ? 'badge-error' : 'badge-warning'}">
											{summaryData.outcome === 'completed' ? '✓ Completed' : summaryData.outcome === 'blocked' ? '⚠ Blocked' : '○ Incomplete'}
										</span>
										{#if summaryData.duration}
											<span class="text-xs text-base-content/50">
												{summaryData.duration}
											</span>
										{/if}
										{#if summaryData.agent}
											<span class="text-xs text-base-content/50">
												by {summaryData.agent}
											</span>
										{/if}
									</div>

									<!-- Summary Bullets -->
									{#if summaryData.summary && summaryData.summary.length > 0}
										<div class="mb-3">
											<ul class="list-disc list-inside text-sm space-y-1">
												{#each summaryData.summary as item}
													<li class="text-base-content/80">{item}</li>
												{/each}
											</ul>
										</div>
									{/if}

									<!-- Key Changes -->
									{#if summaryData.keyChanges && summaryData.keyChanges.length > 0}
										<div class="mb-3">
											<h5 class="text-xs font-semibold mb-1 text-base-content/60">Files Modified</h5>
											<div class="flex flex-wrap gap-1">
												{#each summaryData.keyChanges as file}
													<span class="badge badge-xs badge-outline font-mono">{file}</span>
												{/each}
											</div>
										</div>
									{/if}

									<!-- Quality -->
									{#if summaryData.quality}
										<div class="flex gap-3 mb-3">
											{#if summaryData.quality.tests}
												<div class="flex items-center gap-1 text-xs">
													<span class="text-base-content/50">Tests:</span>
													<span class="badge badge-xs {summaryData.quality.tests === 'passing' ? 'badge-success' : summaryData.quality.tests === 'failing' ? 'badge-error' : 'badge-ghost'}">
														{summaryData.quality.tests}
													</span>
												</div>
											{/if}
											{#if summaryData.quality.build}
												<div class="flex items-center gap-1 text-xs">
													<span class="text-base-content/50">Build:</span>
													<span class="badge badge-xs {summaryData.quality.build === 'clean' ? 'badge-success' : summaryData.quality.build === 'errors' ? 'badge-error' : 'badge-warning'}">
														{summaryData.quality.build}
													</span>
												</div>
											{/if}
										</div>
									{/if}

									<!-- Human Actions -->
									{#if summaryData.humanActions && summaryData.humanActions.length > 0}
										<div class="mb-3">
											<h5 class="text-xs font-semibold mb-1 text-warning">Human Actions Required</h5>
											<div class="space-y-1">
												{#each summaryData.humanActions as action}
													<div class="text-sm p-2 rounded bg-warning/10 border border-warning/20">
														<div class="font-medium text-warning">{action.title}</div>
														<div class="text-xs text-base-content/60">{action.description}</div>
													</div>
												{/each}
											</div>
										</div>
									{/if}

									<!-- Suggested Tasks -->
									{#if summaryData.suggestedTasks && summaryData.suggestedTasks.length > 0}
										<div>
											<h5 class="text-xs font-semibold mb-1 text-base-content/60">Suggested Follow-up Tasks</h5>
											<div class="space-y-1">
												{#each summaryData.suggestedTasks as suggestion}
													<div class="text-sm p-2 rounded bg-info/10 border border-info/20">
														<div class="flex items-center gap-2">
															<span class="badge badge-xs">{suggestion.type}</span>
															<span class="badge badge-xs badge-outline">P{suggestion.priority}</span>
															<span class="font-medium">{suggestion.title}</span>
														</div>
														<div class="text-xs text-base-content/60 mt-0.5">{suggestion.description}</div>
													</div>
												{/each}
											</div>
										</div>
									{/if}
								{:else}
									<div class="text-sm text-base-content/50 italic">No summary available</div>
								{/if}
							</div>
						{:else if task.status === 'in_progress'}
							<!-- Generate Preview button for in-progress tasks -->
							<div class="rounded-lg p-4 bg-base-200 border border-base-300 border-dashed">
								<div class="flex items-center justify-between">
									<div>
										<h4 class="text-xs font-semibold font-mono uppercase tracking-wider text-base-content/60 mb-1">
											Progress Summary
										</h4>
										<p class="text-xs text-base-content/50">Generate a summary of work done so far</p>
									</div>
									<button
										class="btn btn-sm btn-outline btn-info"
										onclick={() => taskId && fetchSummary(taskId)}
										disabled={summaryLoading}
									>
										{#if summaryLoading}
											<span class="loading loading-spinner loading-xs"></span>
											Generating...
										{:else}
											<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
												<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
											</svg>
											Generate Preview
										{/if}
									</button>
								</div>
							</div>
						{/if}

						<!-- Attachments - Industrial with Drag-Drop -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							ondragover={handleDragOver}
							ondragleave={handleDragLeave}
							ondrop={handleFileDrop}
							class="relative rounded transition-all duration-200 {isDraggingOver ? 'bg-success/15 border-2 border-dashed border-success' : ''}"
						>
							<h4 class="text-xs font-semibold mb-2 font-mono uppercase tracking-wider text-base-content/60">
								Attachments
								{#if attachments.length > 0}
									<span class="ml-1 badge badge-xs bg-base-300 text-base-content/70">{attachments.length}</span>
								{/if}
							</h4>

							{#if isUploading}
								<div class="flex items-center gap-2 p-3 rounded bg-base-200">
									<span class="loading loading-spinner loading-sm"></span>
									<span class="text-sm text-base-content/60">Uploading...</span>
								</div>
							{:else if attachmentsLoading}
								<div class="flex items-center gap-2 p-3 rounded bg-base-200">
									<span class="loading loading-spinner loading-sm"></span>
									<span class="text-sm text-base-content/60">Loading attachments...</span>
								</div>
							{:else if isDraggingOver}
								<div class="p-6 rounded text-center bg-success/20">
									<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 mx-auto mb-2 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
									</svg>
									<span class="text-sm font-medium text-success">Drop files to attach</span>
								</div>
							{:else if attachments.length > 0}
								<div class="grid grid-cols-3 gap-3 p-3 rounded overflow-visible bg-base-200">
									{#each attachments as attachment (attachment.id)}
										<div class="relative group">
											<a
												href={`/api/work/image${attachment.path}`}
												target="_blank"
												rel="noopener noreferrer"
												class="block"
											>
												<img
													src={`/api/work/image${attachment.path}`}
													alt="Task attachment"
													class="w-full h-20 object-cover rounded border border-base-300 cursor-pointer hover:border-primary transition-colors"
												/>
											</a>
											<!-- Delete button -->
											<button
												class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-error text-error-content"
												onclick={(e) => {
													e.preventDefault();
													e.stopPropagation();
													removeAttachment(attachment.id);
												}}
												title="Remove attachment"
											>
												<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
													<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
												</svg>
											</button>
											<div
												class="absolute bottom-0 left-0 right-0 px-1 py-0.5 text-[10px] truncate opacity-0 group-hover:opacity-100 transition-opacity rounded-b bg-base-100/90 text-base-content/60"
												title={attachment.path}
											>
												{attachment.path.split('/').pop()}
											</div>
										</div>
									{/each}
									<!-- Add more hint when attachments exist -->
									<div class="flex items-center justify-center h-20 rounded border-2 border-dashed border-base-300 opacity-50 hover:opacity-80 transition-opacity cursor-default">
										<span class="text-[10px] text-center px-1 text-base-content/50">Drop to add more</span>
									</div>
								</div>
							{:else}
								<div class="p-4 rounded text-center border-2 border-dashed transition-colors bg-base-200 border-base-300">
									<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mx-auto mb-2 text-base-content/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
									</svg>
									<span class="text-sm block text-base-content/50">No attachments</span>
									<p class="text-xs mt-1 text-base-content/40">Drag and drop files here to attach</p>
								</div>
							{/if}
						</div>

						<!-- Task Activity Timeline (Signals) -->
						<div>
							<div class="flex items-center justify-between mb-2">
								<h4 class="text-xs font-semibold font-mono uppercase tracking-wider text-base-content/60">
									Activity Timeline
									{#if taskSignals.length > 0}
										<span class="ml-1 badge badge-xs bg-base-300 text-base-content/70">{taskSignals.length}</span>
									{/if}
								</h4>
								<div class="flex items-center gap-1">
									{#if taskSignals.length > 0}
										<button
											class="btn btn-xs btn-ghost gap-1"
											onclick={() => signalsExpanded = !signalsExpanded}
										>
											<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 transition-transform {signalsExpanded ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
											</svg>
											{signalsExpanded ? 'Collapse' : 'Expand'}
										</button>
									{/if}
								</div>
							</div>
							{#if signalsLoading}
								<div class="flex items-center gap-2 p-3 rounded bg-base-200">
									<span class="loading loading-spinner loading-sm"></span>
									<span class="text-sm text-base-content/60">Loading activity timeline...</span>
								</div>
							{:else if taskSignals.length > 0}
								<!-- Stats summary -->
								{#if signalsStats}
									<div class="flex flex-wrap gap-2 mb-3">
										{#if signalsStats.agents.length > 0}
											<span class="badge badge-xs badge-primary">{signalsStats.agents.join(', ')}</span>
										{/if}
										{#if signalsStats.hasCompletion}
											<span class="badge badge-xs badge-success">Completed</span>
										{:else if signalsStats.hasReview}
											<span class="badge badge-xs badge-warning">In Review</span>
										{/if}
										{#if signalsStats.hasSuggestedTasks}
											<span class="badge badge-xs badge-info">Has Tasks</span>
										{/if}
									</div>
								{/if}
								<!-- Timeline events using EventStack in inline mode -->
								{#if signalsExpanded}
									<EventStack
										layoutMode="inline"
										initialEvents={taskSignals.map(s => ({
											type: s.type,
											state: s.state,
											session_id: s.session_id,
											tmux_session: s.tmux_session,
											timestamp: s.timestamp,
											task_id: s.task_id,
											data: { ...s.data, agent_name: s.agent_name, agentName: s.agent_name },
											git_sha: s.git_sha
										}))}
										onTaskClick={(id) => { taskId = id; }}
										onCreateTasks={createSuggestedTasks}
										onCreateAndStartTasks={createAndStartSuggestedTasks}
										{availableProjects}
										{defaultProject}
										onApplyRename={async (tid, newTitle) => {
											try {
												const response = await fetch(`/api/tasks/${encodeURIComponent(tid)}`, {
													method: 'PATCH',
													headers: { 'Content-Type': 'application/json' },
													body: JSON.stringify({ title: newTitle })
												});
												if (response.ok) {
													// Refetch task to update drawer
													await fetchTask();
												}
											} catch (e) {
												console.error('[TaskDetailDrawer] Failed to apply rename:', e);
											}
										}}
										onApplyLabels={async (tid, labels) => {
											try {
												const response = await fetch(`/api/tasks/${encodeURIComponent(tid)}`, {
													method: 'PATCH',
													headers: { 'Content-Type': 'application/json' },
													body: JSON.stringify({ labels })
												});
												if (response.ok) {
													// Refetch task to update drawer
													await fetchTask();
												}
											} catch (e) {
												console.error('[TaskDetailDrawer] Failed to apply labels:', e);
											}
										}}
									/>
								{:else}
									<!-- Collapsed view - show just the latest signal -->
									{@const latest = taskSignals[taskSignals.length - 1]}
									{@const latestState = latest.state || latest.type}
									<div class="p-2 rounded text-sm bg-base-200 text-base-content/60">
										Latest: <span class="font-medium">{latestState}</span>
										{#if latest.agent_name}
											by {latest.agent_name}
										{/if}
										<span class="text-xs opacity-60 ml-2">{formatRelativeTimestamp(latest.timestamp)}</span>
									</div>
								{/if}
							{:else}
								<div class="p-3 rounded text-center bg-base-200">
									<span class="text-sm text-base-content/50">No activity recorded yet</span>
									<p class="text-xs mt-1 text-base-content/40">Signals are captured when agents work on this task</p>
								</div>
							{/if}
						</div>

						<!-- Session Logs - Industrial (Legacy fallback) -->
						<div>
							<div class="flex items-center justify-between mb-2">
								<h4 class="text-xs font-semibold font-mono uppercase tracking-wider text-base-content/60">
									Session Logs
									{#if sessionLogs.length > 0}
										<span class="ml-1 badge badge-xs bg-base-300 text-base-content/70">{sessionLogs.length}</span>
									{/if}
								</h4>
								{#if sessionLogs.length > 0}
									<button
										class="btn btn-xs btn-ghost gap-1"
										onclick={() => logsExpanded = !logsExpanded}
									>
										<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 transition-transform {logsExpanded ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
										</svg>
										{logsExpanded ? 'Collapse' : 'Expand'}
									</button>
								{/if}
							</div>
							{#if logsLoading}
								<div class="flex items-center gap-2 p-3 rounded bg-base-200">
									<span class="loading loading-spinner loading-sm"></span>
									<span class="text-sm text-base-content/60">Loading session logs...</span>
								</div>
							{:else if sessionLogs.length > 0}
								<div class="space-y-2">
									{#each logsExpanded ? sessionLogs : sessionLogs.slice(0, 3) as log (log.filename)}
										<button
											class="w-full text-left p-3 rounded group transition-colors industrial-hover bg-base-200 border-l-2 border-info"
											onclick={() => fetchLogContent(log.filename)}
										>
											<div class="flex items-center justify-between mb-1">
												<div class="flex items-center gap-2">
													<!-- Terminal icon -->
													<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-info" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
														<path stroke-linecap="round" stroke-linejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
													</svg>
													{#if log.agentName}
														<span class="badge badge-xs badge-primary">{log.agentName}</span>
													{/if}
													<span class="text-xs font-mono text-base-content/60">{log.sizeFormatted}</span>
												</div>
												<span class="text-xs text-base-content/50">
													{log.sessionTime ? formatRelativeTimestamp(log.sessionTime) : formatRelativeTimestamp(log.modifiedAt)}
												</span>
											</div>
											<div class="text-xs font-mono truncate text-base-content/60" title={log.filename}>
												{log.filename}
											</div>
											{#if log.preview}
												<div class="text-xs mt-1 line-clamp-2 text-base-content/50">
													{log.preview}
												</div>
											{/if}
											<div class="text-xs mt-1 opacity-0 group-hover:opacity-100 transition-opacity text-info">
												Click to view log
											</div>
										</button>
									{/each}
									{#if !logsExpanded && sessionLogs.length > 3}
										<button
											class="w-full text-center text-xs py-2 rounded transition-colors text-info hover:text-info/80"
											onclick={() => logsExpanded = true}
										>
											Show {sessionLogs.length - 3} more logs...
										</button>
									{/if}
								</div>
							{:else if recoverableSession}
								<!-- Show recoverable session info when no logs but session exists -->
								<div class="p-3 rounded bg-base-200 border border-secondary/20">
									<div class="flex items-center gap-2 mb-2">
										<span class="badge badge-secondary badge-sm">Paused Session</span>
									</div>
									<div class="text-sm space-y-1">
										<div class="flex items-center gap-2">
											<span class="text-base-content/50">Agent:</span>
											<span class="font-medium">{recoverableSession.agentName}</span>
										</div>
										{#if recoverableSession.lastActivity}
											<div class="flex items-center gap-2">
												<span class="text-base-content/50">Last active:</span>
												<span class="text-base-content/70">{new Date(recoverableSession.lastActivity).toLocaleString()}</span>
											</div>
										{/if}
										<div class="text-xs text-base-content/40 mt-2">
											Session can be resumed using the Resume button above
										</div>
									</div>
								</div>
							{:else}
								<div class="p-3 rounded text-center bg-base-200">
									<span class="text-sm text-base-content/50">No session logs found</span>
									<p class="text-xs mt-1 text-base-content/40">Logs are saved when agents work on this task</p>
								</div>
							{/if}
						</div>

						<!-- Log Content Viewer Modal -->
						{#if selectedLog}
							<div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70">
								<div
									class="w-full max-w-4xl max-h-[80vh] flex flex-col rounded-lg shadow-2xl bg-base-100 border border-base-300"
								>
									<!-- Log viewer header -->
									<div class="flex items-center justify-between p-4 border-b border-base-300">
										<div class="flex items-center gap-2">
											<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-info" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
												<path stroke-linecap="round" stroke-linejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
											</svg>
											<span class="font-mono text-sm text-base-content">{selectedLog}</span>
										</div>
										<button
											class="btn btn-sm btn-circle btn-ghost"
											onclick={closeLogViewer}
										>
											<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
											</svg>
										</button>
									</div>
									<!-- Log content -->
									<div class="flex-1 overflow-auto p-4 bg-base-200">
										{#if logContentLoading}
											<div class="flex items-center justify-center py-12">
												<span class="loading loading-spinner loading-lg"></span>
											</div>
										{:else if logContent}
											<pre class="text-xs font-mono whitespace-pre text-base-content">{@html renderedLogContent}</pre>
										{:else}
											<div class="text-center py-12 text-base-content/50">
												Failed to load log content
											</div>
										{/if}
									</div>
									<!-- Log viewer footer -->
									<div class="flex items-center justify-between p-4 border-t border-base-300">
										<span class="text-xs text-base-content/50">
											{logContent ? `${logContent.split('\n').length} lines` : ''}
										</span>
										<button
											class="btn btn-sm btn-ghost"
											onclick={closeLogViewer}
										>
											Close
										</button>
									</div>
								</div>
							</div>
						{/if}

						<!-- Dependencies - Industrial -->
						<div>
							<div class="flex items-center justify-between mb-2">
								<h4 class="text-xs font-semibold font-mono uppercase tracking-wider text-base-content/60">Depends On</h4>
								<!-- Add dependency button -->
								<div class="relative">
									<button
										class="btn btn-xs btn-ghost gap-1"
										onclick={() => showDependencyDropdown = !showDependencyDropdown}
										disabled={isSaving || availableTasksLoading}
									>
										{#if availableTasksLoading}
											<span class="loading loading-spinner loading-xs"></span>
										{:else}
											<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
												<path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd" />
											</svg>
										{/if}
										Add
									</button>

									<!-- Dropdown menu - Industrial -->
									{#if showDependencyDropdown}
										<div
											class="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-xl w-72 max-h-64 overflow-y-auto bg-base-200 border border-base-300"
										>
											{#if availableTasks.length === 0}
												<div class="p-3 text-sm text-base-content/50 text-center">
													No available tasks in this project
												</div>
											{:else}
												<div class="py-1">
													{#each availableTasks as availTask}
														<button
															class="w-full text-left px-3 py-2 flex items-center gap-2 text-sm industrial-hover"
															onclick={() => addDependency(availTask.id)}
															disabled={isSaving}
														>
															<span class="badge badge-xs {priorityColors[availTask.priority] || 'badge-ghost'}">
																P{availTask.priority}
															</span>
															<span class="font-mono text-xs text-base-content/60">{availTask.id}</span>
															<span class="flex-1 truncate">{availTask.title}</span>
														</button>
													{/each}
												</div>
											{/if}
											<!-- Close button - Industrial -->
											<div class="p-2 border-t border-base-300">
												<button
													class="btn btn-xs btn-ghost w-full"
													onclick={() => showDependencyDropdown = false}
												>
													Cancel
												</button>
											</div>
										</div>
									{/if}
								</div>
							</div>

							{#if task.depends_on && task.depends_on.length > 0}
								<div class="space-y-2">
									{#each task.depends_on as dep}
										<div
											class="flex items-center gap-2 text-sm p-2 rounded group bg-base-200 border-l-2 border-primary/30"
										>
											<span class="badge badge-sm {statusColors[dep.status] || 'badge-ghost'}">
												{dep.status || 'unknown'}
											</span>
											<span class="badge badge-sm {priorityColors[dep.priority] || 'badge-ghost'}">
												P{dep.priority ?? '?'}
											</span>
											<span class="font-mono text-xs">{dep.id}</span>
											<span class="flex-1 truncate">{dep.title || 'Untitled'}</span>
											<!-- Remove button -->
											<button
												class="btn btn-xs btn-ghost btn-circle opacity-0 group-hover:opacity-100 transition-opacity text-error hover:bg-error/10"
												onclick={() => removeDependency(dep.id)}
												disabled={isSaving}
												title="Remove dependency"
											>
												<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
													<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
												</svg>
											</button>
										</div>
									{/each}
								</div>
							{:else}
								<p class="text-sm text-base-content/50 italic px-2">No dependencies</p>
							{/if}
						</div>

						<!-- Blocks (dependents) - Industrial -->
						{#if task.blocked_by && task.blocked_by.length > 0}
							<div>
								<h4 class="text-xs font-semibold mb-2 font-mono uppercase tracking-wider text-base-content/60">Blocks</h4>
								<div class="space-y-2">
									{#each task.blocked_by as dep}
										<div
											class="flex items-center gap-2 text-sm p-2 rounded bg-base-200 border-l-2 border-primary/30"
										>
											<span class="badge badge-sm {statusColors[dep.status] || 'badge-ghost'}">
												{dep.status || 'unknown'}
											</span>
											<span class="badge badge-sm {priorityColors[dep.priority] || 'badge-ghost'}">
												P{dep.priority ?? '?'}
											</span>
											<span class="font-mono text-xs">{dep.id}</span>
											<span class="flex-1">{dep.title || 'Untitled'}</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Activity Timeline (Task Events on Left, Messages on Right) - Industrial -->
						<div class="pt-4 flex-1 flex flex-col min-h-0 border-t border-base-300">
							<!-- Header with filter tabs -->
							<div class="flex items-center justify-between mb-3">
								<h4 class="text-xs font-semibold font-mono uppercase tracking-wider text-base-content/60">Activity Timeline</h4>

								<!-- Filter tabs - Industrial -->
								<div class="tabs tabs-boxed tabs-xs bg-base-200">
									<button
										class="tab {timelineFilter === 'all' ? 'tab-active' : ''}"
										onclick={() => timelineFilter = 'all'}
									>
										All ({taskHistory?.count?.total || 0})
									</button>
									<button
										class="tab {timelineFilter === 'tasks' ? 'tab-active' : ''}"
										onclick={() => timelineFilter = 'tasks'}
									>
										Tasks ({taskHistory?.count?.jat_events || 0})
									</button>
									<button
										class="tab {timelineFilter === 'messages' ? 'tab-active' : ''}"
										onclick={() => timelineFilter = 'messages'}
									>
										Messages ({taskHistory?.count?.agent_mail || 0})
									</button>
								</div>
							</div>

							{#if historyLoading}
								<!-- Loading state -->
								<div class="flex items-center justify-center py-6">
									<span class="loading loading-spinner loading-sm"></span>
									<span class="ml-2 text-xs">Loading timeline...</span>
								</div>
							{:else if historyError}
								<!-- Error state -->
								<div class="alert alert-warning py-2">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="stroke-current shrink-0 h-4 w-4"
										fill="none"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
										/>
									</svg>
									<span class="text-xs">{historyError}</span>
								</div>
							{:else if filteredTimeline().length > 0}
								<!-- Centered DaisyUI Timeline: Task events on left (30%), Messages on right (70%) -->
								<ul class="timeline timeline-vertical flex-1 overflow-y-auto w-full">
									{#each filteredTimeline() as event, i}
										<li style="grid-template-columns: 30% min-content 1fr;">
											<!-- Top connector (skip for first item) -->
											{#if i > 0}
												<hr class="{event.type === 'jat_event' ? 'bg-info' : 'bg-warning'}" />
											{/if}

											{#if event.type === 'jat_event'}
												<!-- Task events on LEFT side (timeline-start) -->
												<div class="timeline-start timeline-box text-xs mb-4 border-info/30 bg-info/5">
													<!-- Event description -->
													<div class="font-semibold text-base-content">
														{event.description}
													</div>

													<!-- Timestamp -->
													<div class="text-base-content/60 mt-1">
														{formatDate(event.timestamp)}
													</div>

													<!-- Task event metadata badges -->
													<div class="mt-2 flex flex-wrap gap-1">
														{#if event.metadata.status}
															<span class="badge badge-xs {statusColors[event.metadata.status]}">
																{event.metadata.status}
															</span>
														{/if}
														{#if event.metadata.priority !== undefined}
															<span class="badge badge-xs {priorityColors[event.metadata.priority]}">
																P{event.metadata.priority}
															</span>
														{/if}
														{#if event.metadata.type}
															<span class="badge badge-xs badge-outline">
																{event.metadata.type}
															</span>
														{/if}
														{#if event.metadata.assignee}
															<span class="badge badge-xs badge-ghost">
																@{event.metadata.assignee}
															</span>
														{/if}
													</div>
												</div>

												<!-- Timeline middle icon -->
												<div class="timeline-middle">
													<!-- Database icon for task events -->
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="h-4 w-4 text-info"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
														/>
													</svg>
												</div>

												<!-- Empty timeline-end to balance the layout -->
												<div class="timeline-end"></div>
											{:else}
												<!-- Messages on RIGHT side (timeline-end) -->
												<!-- Empty timeline-start to balance the layout -->
												<div class="timeline-start"></div>

												<!-- Timeline middle icon -->
												<div class="timeline-middle">
													<!-- Mail icon for agent mail -->
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="h-4 w-4 text-warning"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
														/>
													</svg>
												</div>

												<div class="timeline-end timeline-box text-xs mb-4 border-warning/30 bg-warning/5">
													<!-- Event description -->
													<div class="font-semibold text-base-content">
														{event.description}
													</div>

													<!-- Timestamp -->
													<div class="text-base-content/60 mt-1">
														{formatDate(event.timestamp)}
													</div>

													<!-- Agent mail metadata -->
													<div class="mt-2 space-y-1">
														{#if event.metadata.from_agent}
															<div class="text-base-content/70">
																<strong>From:</strong> {event.metadata.from_agent}
															</div>
														{/if}
														{#if event.metadata.body}
															<div class="text-base-content/80 whitespace-pre-wrap max-h-64 overflow-y-auto text-xs bg-base-100 p-2 rounded mt-1">
																{event.metadata.body}
															</div>
														{/if}
														<div class="flex gap-1 mt-1">
															{#if event.metadata.importance === 'urgent'}
																<span class="badge badge-xs badge-error">urgent</span>
															{/if}
															{#if event.metadata.ack_required}
																<span class="badge badge-xs badge-warning">ack required</span>
															{/if}
														</div>
													</div>
												</div>
											{/if}

											<!-- Bottom connector (skip for last item) -->
											{#if i < filteredTimeline().length - 1}
												<hr class="{filteredTimeline()[i + 1]?.type === 'jat_event' ? 'bg-info' : 'bg-warning'}" />
											{/if}
										</li>
									{/each}
								</ul>
							{:else}
								<!-- Empty state -->
								<div class="text-xs text-base-content/60 py-4 text-center">
									No activity yet
								</div>
							{/if}
						</div>

						<!-- Dependency Graph Section - Industrial -->
						{#if task && ((task.depends_on && task.depends_on.length > 0) || (task.blocked_by && task.blocked_by.length > 0))}
							<div class="pt-4 mt-4 border-t border-base-300">
								<TaskDependencyGraph
									{task}
									onNodeClick={(nodeTaskId) => {
										// Navigate to clicked task
										taskId = nodeTaskId;
									}}
									height={220}
								/>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Keyboard Shortcuts Help Panel - Industrial -->
				{#if showHelp}
					<div
						class="mt-6 p-4 rounded-lg bg-base-200 border border-base-300"
					>
						<h4 class="text-xs font-semibold mb-3 font-mono uppercase tracking-wider flex items-center gap-2 text-primary">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
								/>
							</svg>
							Keyboard Shortcuts
						</h4>
						<div class="space-y-2 text-sm">
							<!-- General -->
							<div>
								<div class="flex justify-between items-center py-1">
									<span>Close drawer</span>
									<kbd class="kbd kbd-sm">Esc</kbd>
								</div>
								<div class="flex justify-between items-center py-1">
									<span>Show/hide shortcuts</span>
									<kbd class="kbd kbd-sm">?</kbd>
								</div>
								<div class="flex justify-between items-center py-1">
									<span>Mark task complete</span>
									<kbd class="kbd kbd-sm">M</kbd>
								</div>
							</div>

							<!-- Tip -->
							<div class="divider my-2"></div>
							<div class="alert alert-info py-2 text-xs">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									class="stroke-current shrink-0 w-4 h-4"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
									></path>
								</svg>
								<span>Click any field to edit inline</span>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Footer Actions - Industrial -->
			{#if !loading && !error && task}
				<div
					class="p-6 bg-base-200 border-t border-base-300"
				>
					<div class="flex justify-between items-center">
						<!-- Delete button (left) -->
						<button
							class="btn btn-sm btn-ghost text-error hover:btn-error gap-1"
							onclick={handleDelete}
							disabled={isSaving || isDeleting}
						>
							{#if isDeleting}
								<span class="loading loading-spinner loading-xs"></span>
								Deleting...
							{:else}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
									/>
								</svg>
								Delete
							{/if}
						</button>
						<!-- Right side buttons -->
						<div class="flex items-center gap-2">
							<!-- Shortcuts button -->
							<button
								class="btn btn-sm btn-ghost gap-1"
								onclick={() => (showHelp = !showHelp)}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								Shortcuts
							</button>
							<!-- Close button -->
							<button type="button" class="btn btn-ghost" onclick={handleClose} disabled={isSaving || isDeleting}>
								Close
							</button>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Modals and Toast - placed OUTSIDE drawer to avoid stacking context issues -->

<!-- Toast Notification (Fixed position, bottom-right) - Industrial -->
	{#if toastMessage}
		<div class="toast toast-end toast-bottom z-[60]">
			<div
				class="alert font-mono text-sm {toastMessage.type === 'success' ? 'alert-success' : 'alert-error'}"
			>
				<span>{toastMessage.text}</span>
			</div>
		</div>
	{/if}

	<!-- Send Message Modal - Industrial -->
	{#if showMessageModal && task?.assignee}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
			onclick={() => { showMessageModal = false; messageText = ''; }}
		>
			<div
				class="w-full max-w-md rounded-lg shadow-2xl overflow-hidden bg-base-100 border border-base-300"
				onclick={(e) => e.stopPropagation()}
			>
				<!-- Modal Header -->
				<div
					class="flex items-center gap-3 px-5 py-4 bg-base-200 border-b border-base-300"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
					</svg>
					<div class="flex-1">
						<h3 class="font-mono text-sm font-semibold text-base-content">Send Message</h3>
						<p class="text-xs text-base-content/60">To: {task.assignee}</p>
					</div>
					<button
						class="btn btn-sm btn-circle btn-ghost"
						onclick={() => { showMessageModal = false; messageText = ''; }}
					>
						✕
					</button>
				</div>

				<!-- Modal Body -->
				<div class="p-5">
					<div class="form-control">
						<label class="label">
							<span class="label-text font-mono text-xs uppercase tracking-wider text-base-content/60">Message</span>
						</label>
						<textarea
							class="textarea font-mono text-sm bg-base-200 border border-base-300 text-base-content min-h-[120px]"
							placeholder="Type your message..."
							bind:value={messageText}
							disabled={isSendingMessage}
						></textarea>
					</div>

					<div class="flex items-center gap-2 mt-2 px-1">
						<span class="text-[10px] font-mono text-base-content/50">Thread: {taskId}</span>
					</div>
				</div>

				<!-- Modal Footer -->
				<div
					class="flex items-center justify-end gap-2 px-5 py-4 bg-base-200 border-t border-base-300"
				>
					<button
						class="btn btn-sm btn-ghost"
						onclick={() => { showMessageModal = false; messageText = ''; }}
						disabled={isSendingMessage}
					>
						Cancel
					</button>
					<button
						class="btn btn-sm btn-success gap-2"
						onclick={handleSendMessage}
						disabled={isSendingMessage || !messageText.trim()}
					>
						{#if isSendingMessage}
							<span class="loading loading-spinner loading-xs"></span>
							Sending...
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
							</svg>
							Send
						{/if}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Reopen Task Modal - Industrial -->
	{#if showReopenModal && task}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
			onclick={() => { showReopenModal = false; reopenReason = ''; }}
		>
			<div
				class="w-full max-w-md rounded-lg shadow-2xl overflow-hidden bg-base-100 border border-base-300"
				onclick={(e) => e.stopPropagation()}
			>
				<!-- Modal Header -->
				<div
					class="flex items-center gap-3 px-5 py-4 bg-warning/20 border-b border-warning/30"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
					</svg>
					<div class="flex-1">
						<h3 class="font-mono text-sm font-semibold text-base-content">Reopen Task</h3>
						<p class="text-xs text-warning">{taskId}</p>
					</div>
					<button
						class="btn btn-sm btn-circle btn-ghost"
						onclick={() => { showReopenModal = false; reopenReason = ''; }}
					>
						✕
					</button>
				</div>

				<!-- Modal Body -->
				<div class="p-5">
					<p class="text-sm mb-4 text-base-content/70">
						This task was previously completed. What additional work is needed?
					</p>

					<div class="form-control">
						<label class="label">
							<span class="label-text font-mono text-xs uppercase tracking-wider text-base-content/60">
								Reason for Reopening <span class="text-warning">*</span>
							</span>
						</label>
						<textarea
							class="textarea font-mono text-sm w-full bg-base-200 border border-base-300 text-base-content min-h-[100px]"
							placeholder="e.g., Add Alt+C shortcut for complete action"
							bind:value={reopenReason}
							disabled={isReopening}
						></textarea>
						<p class="text-xs mt-2 text-base-content/50">
							This will be appended to the task description for agent context.
						</p>
					</div>
				</div>

				<!-- Modal Footer -->
				<div
					class="flex items-center justify-end gap-2 px-5 py-4 bg-base-200 border-t border-base-300"
				>
					<button
						class="btn btn-sm btn-ghost"
						onclick={() => { showReopenModal = false; reopenReason = ''; }}
						disabled={isReopening}
					>
						Cancel
					</button>
					<SlideOpenButton
						primaryLabel="Reopen"
						primaryLoadingLabel="Reopening..."
						primaryIcon="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
						secondaryLabel="& Start"
						secondaryIcon="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
						secondaryTitle="Reopen task and spawn a new agent session"
						disabled={isReopening || !reopenReason.trim()}
						loading={isReopening}
						onprimary={() => confirmReopen(false)}
						onsecondary={() => confirmReopen(true)}
					/>
				</div>
			</div>
		</div>
	{/if}
