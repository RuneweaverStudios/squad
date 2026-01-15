<script lang="ts">
	/**
	 * SessionCard Component
	 * Unified card for displaying tmux sessions (agent work or server sessions).
	 *
	 * Mode: 'agent' (default)
	 * - Task-first view of active Claude Code session work
	 * - Task is primary (headline), agent is secondary (metadata badge)
	 * - Inline output with ANSI rendering
	 * - Kill session and control buttons
	 * - Prompt detection with quick action buttons
	 * - Text input for sending commands
	 *
	 * Mode: 'server'
	 * - Server session view (dev servers like npm run dev)
	 * - Project name as headline with port status
	 * - Start/Stop server controls
	 * - Terminal output display
	 *
	 * Props:
	 * - mode: 'agent' | 'server' (default: 'agent')
	 * - sessionName: tmux session name (e.g., "jat-WisePrairie" or "server-chimaro")
	 * - agentName: Agent name (for agent mode)
	 * - task: Current task object (for agent mode)
	 * - projectName, displayName, port, portRunning: Server session props
	 * - output: Terminal output string with ANSI codes
	 * - lineCount: Number of output lines
	 * - tokens: Token usage for today (agent mode)
	 * - cost: Cost in USD for today (agent mode)
	 */

	import { onMount, onDestroy } from "svelte";
	import { fade, fly, slide } from "svelte/transition";
	import { ansiToHtmlWithLinks, stripAnsi } from "$lib/utils/ansiToHtml";
	import { throttledFetch } from "$lib/utils/requestThrottler";
	import TokenUsageDisplay from "$lib/components/TokenUsageDisplay.svelte";
	import TaskIdBadge from "$lib/components/TaskIdBadge.svelte";
	import AgentAvatar from "$lib/components/AgentAvatar.svelte";
	import Sparkline from "$lib/components/Sparkline.svelte";
	import AnimatedDigits from "$lib/components/AnimatedDigits.svelte";
	import {
		playTaskCompleteSound,
		playNeedsInputSound,
		playReadyForReviewSound,
		playNewTaskChime,
		playCopySound,
	} from "$lib/utils/soundEffects";
	import VoiceInput from "$lib/components/VoiceInput.svelte";
	import StatusActionBadge from "./StatusActionBadge.svelte";
	import ServerStatusBadge from "./ServerStatusBadge.svelte";
	import TerminalActivitySparkline from "./TerminalActivitySparkline.svelte";
	import { workSessionsState } from "$lib/stores/workSessions.svelte";
	import { autoKillCountdowns, cancelAutoKill } from "$lib/stores/sessionEvents";
	import { setPendingAutoKill } from "$lib/stores/autoKillConfig";
	import EventStack from "./EventStack.svelte";
	import StreakCelebration from "$lib/components/StreakCelebration.svelte";
	import SuggestedTasksSection from "./SuggestedTasksSection.svelte";
	import SuggestedTasksModal from "./SuggestedTasksModal.svelte";
	import RollbackConfirmModal from "./RollbackConfirmModal.svelte";
	import {
		SESSION_STATE_VISUALS,
		SERVER_STATE_VISUALS,
		type SessionStateVisual,
		type ServerStateVisual,
		type ServerState,
		type SessionState,
		getServerStateVisual,
	} from "$lib/config/statusColors";
	import { SIGNAL_TTL } from "$lib/config/constants";
	import {
		setHoveredSession,
		completingSessionFlash,
		highlightedSessionName,
		jumpToSession,
	} from "$lib/stores/hoveredSession";
	import type {
		SuggestedTask,
		SuggestedTaskWithState,
	} from "$lib/types/signals";
	import { getProjectFromTaskId } from "$lib/utils/projectUtils";
	import { getProjectColor } from "$lib/utils/projectColors";
	import {
		getFileTypeInfo,
		formatFileSize,
		type FileCategory,
	} from "$lib/utils/fileUtils";
	import {
		getTerminalHeight,
		getCtrlCIntercept,
		setCtrlCIntercept,
	} from "$lib/stores/preferences.svelte";
	import { successToast } from "$lib/stores/toasts.svelte";
	import { getReviewRules } from "$lib/stores/reviewRules.svelte";
	import { computeReviewStatus } from "$lib/utils/reviewStatusUtils";
	import { availableProjects as availableProjectsStore } from "$lib/stores/drawerStore";
	import {
		completeTask as epicCompleteTask,
		getIsActive as epicIsActive,
		getEpicId,
	} from "$lib/stores/epicQueueStore.svelte";
	// Rich signal card components
	import WorkingSignalCard from "$lib/components/signals/WorkingSignalCard.svelte";
	import ReviewSignalCard from "$lib/components/signals/ReviewSignalCard.svelte";
	import NeedsInputSignalCard from "$lib/components/signals/NeedsInputSignalCard.svelte";
	import CompletingSignalCard from "$lib/components/signals/CompletingSignalCard.svelte";
	// CompletedSignalCard removed - completion info now shown in EventStack only
	import IdleSignalCard from "$lib/components/signals/IdleSignalCard.svelte";
	import StartingSignalCard from "$lib/components/signals/StartingSignalCard.svelte";
	import CompactingSignalCard from "$lib/components/signals/CompactingSignalCard.svelte";
	import { MinimapCssScale } from "$lib/components/minimap";
	import type {
		WorkingSignal,
		ReviewSignal,
		NeedsInputSignal,
		CompletingSignal as CompletingSignalType,
		CompletedSignal as CompletedSignalType,
		IdleSignal,
		StartingSignal,
		CompactingSignal,
	} from "$lib/types/richSignals";

	// Props - aligned with workSessions.svelte.ts types
	interface TaskDep {
		id: string;
		status?: string;
		title?: string;
		priority?: number;
		issue_type?: string;
	}
	interface Task {
		id: string;
		title?: string;
		description?: string;
		status?: string;
		priority?: number;
		issue_type?: string;
		depends_on?: TaskDep[];
	}

	/** Extended task info for completed tasks - includes closedAt timestamp */
	interface CompletedTask extends Task {
		closedAt?: string;
	}

	interface SparklineDataPoint {
		timestamp: string;
		tokens: number;
		cost: number;
	}

	interface Props {
		/** Mode: 'agent' for work sessions, 'server' for dev server sessions, 'compact' for kanban cards */
		mode?: "agent" | "server" | "compact";
		/** Headerless mode: hides agent header and task section (for embedding in tables that already show this info) */
		headerless?: boolean;
		sessionName: string;
		agentName?: string; // Required for agent mode
		task?: Task | null; // Agent mode only
		/** Most recently closed task by this agent (for completion state display) */
		lastCompletedTask?: CompletedTask | null; // Agent mode only
		// Server mode props
		projectName?: string; // Server mode: project name
		displayName?: string; // Server mode: display name
		port?: number | null; // Server mode: port number
		portRunning?: boolean; // Server mode: is port listening
		serverStatus?: "running" | "starting" | "stopped"; // Server mode status
		projectPath?: string; // Server mode: path to project
		command?: string; // Server mode: command being run
		// Shared props
		output?: string;
		lineCount?: number;
		tokens?: number; // Agent mode only
		cost?: number; // Agent mode only
		usageLoading?: boolean; // Agent mode: show skeleton while loading usage data
		sparklineData?: SparklineDataPoint[]; // Agent mode: hourly token usage
		activityData?: number[]; // Server mode: terminal activity sparkline
		contextPercent?: number; // Agent mode: context remaining percentage (0-100)
		isComplete?: boolean; // Agent mode: task completion state
		startTime?: Date | null; // When work started (for elapsed time)
		created?: string; // Session creation timestamp
		attached?: boolean; // Whether session is attached
		// Callbacks
		onKillSession?: () => void;
		onInterrupt?: () => void;
		onContinue?: () => void;
		onAttachTerminal?: () => void; // Open tmux session in terminal
		onTaskClick?: (taskId: string) => void; // Agent mode only
		onSendInput?: (
			input: string,
			type: "text" | "key" | "raw",
		) => Promise<boolean | void>;
		onDismiss?: () => void; // Agent mode: called when completion banner auto-dismisses
		onTaskDataChange?: () => Promise<void> | void; // Called when task data changes (e.g., linked to epic)
		onFileAttachedToTask?: (taskId: string) => void; // Called when a file is attached to the task
		// Server mode callbacks
		onStopServer?: () => Promise<void>;
		onRestartServer?: () => Promise<void>;
		onStartServer?: () => Promise<void>;
		// Shared
		class?: string;
		/** Whether this work card is currently highlighted (e.g., from clicking avatar elsewhere) */
		isHighlighted?: boolean;
		/** Card width in pixels (for resizable cards) */
		cardWidth?: number;
		/** Called when user drags the resize handle */
		onWidthChange?: (newWidth: number) => void;
		/** Real-time state from SSE (if available, used instead of output parsing) */
		sseState?: string;
		/** Timestamp when SSE state was last updated */
		sseStateTimestamp?: number;
		/** Suggested tasks from jat-signal (via SSE session-signal event) */
		signalSuggestedTasks?: Array<{
			id?: string;
			type: string;
			title: string;
			description: string;
			priority: number;
			reason?: string;
			project?: string;
			labels?: string;
			depends_on?: string[];
		}>;
		/** Timestamp when signal suggested tasks were last updated */
		signalSuggestedTasksTimestamp?: number;
		/** Completion bundle from jat-signal complete (via SSE session-complete event) */
		completionBundle?: {
			taskId: string;
			agentName: string;
			summary: string[];
			quality: {
				tests: "passing" | "failing" | "none" | "skipped";
				build: "clean" | "warnings" | "errors";
				preExisting?: string;
			};
			humanActions?: Array<{
				title: string;
				description?: string;
				items?: string[];
			}>;
			suggestedTasks?: Array<{
				id?: string;
				type: string;
				title: string;
				description: string;
				priority: number;
				reason?: string;
				project?: string;
				labels?: string;
				depends_on?: string[];
			}>;
			crossAgentIntel?: {
				files?: string[];
				patterns?: string[];
				gotchas?: string[];
			};
			sessionStats?: {
				duration?: number;
				tokensUsed?: number;
				filesModified?: number;
				linesChanged?: number;
				commitsCreated?: number;
			};
			finalCommit?: string;
			prLink?: string;
		};
		/** Timestamp when completion bundle was received */
		completionBundleTimestamp?: number;
		/** Rich signal payload from SSE (for working, review, needs_input, completing states) */
		richSignalPayload?: {
			type: string;
			[key: string]: unknown;
		};
		/** Timestamp when rich signal payload was last updated */
		richSignalPayloadTimestamp?: number;
		/** Whether session is in recovering state (automation rule triggered recovery) */
		isRecovering?: boolean;
		/** Whether session is exiting (triggers slide-out-bck-bottom animation) */
		isExiting?: boolean;
		/** Whether session is entering (triggers slide-in-fwd-top animation) */
		isEntering?: boolean;
	}

	let {
		mode = "agent",
		headerless = false,
		sessionName,
		agentName = "",
		task = null,
		lastCompletedTask = null,
		// Server mode props
		projectName = "",
		displayName = "",
		port = null,
		portRunning = false,
		serverStatus = "stopped",
		projectPath = "",
		command = "",
		// Shared props
		output = "",
		lineCount = 0,
		tokens = 0,
		cost = 0,
		usageLoading = false,
		sparklineData = [],
		activityData = [],
		contextPercent,
		isComplete = false,
		startTime = null,
		created = "",
		attached = false,
		// Callbacks
		onKillSession,
		onInterrupt,
		onContinue,
		onAttachTerminal,
		onTaskClick,
		onSendInput,
		onDismiss,
		onTaskDataChange,
		onFileAttachedToTask,
		// Server mode callbacks
		onStopServer,
		onRestartServer,
		onStartServer,
		// Shared
		class: className = "",
		isHighlighted = false,
		cardWidth,
		onWidthChange,
		// SSE real-time state
		sseState,
		sseStateTimestamp,
		// Signal data (from jat-signal via SSE)
		signalSuggestedTasks,
		signalSuggestedTasksTimestamp,
		// Completion bundle (from jat-signal complete via SSE)
		completionBundle,
		completionBundleTimestamp,
		// Rich signal payload (from SSE session-state events)
		richSignalPayload,
		richSignalPayloadTimestamp,
		// Automation recovering state
		isRecovering = false,
		// Exit animation state
		isExiting = false,
		// Entrance animation state
		isEntering = false,
	}: Props = $props();

	// Derived mode helpers
	const isAgentMode = $derived(mode === "agent" || mode === "compact");
	const isServerMode = $derived(mode === "server");
	const isCompactMode = $derived(mode === "compact");

	// Default project derived from current task ID or last completed task (for suggested tasks pre-selection)
	const defaultProject = $derived(
		task?.id ? getProjectFromTaskId(task.id) :
		lastCompletedTask?.id ? getProjectFromTaskId(lastCompletedTask.id) : ''
	);

	// Project color for session card border accent (uses project config colors)
	// For agent mode: derives from task ID prefix (e.g., "jat-abc" → jat project color)
	// For server mode: uses projectName prop directly
	const projectColor = $derived.by(() => {
		// For agent mode, use task ID to get project color
		if (isAgentMode) {
			const taskId = task?.id || lastCompletedTask?.id;
			if (taskId) {
				return getProjectColor(taskId);
			}
		}
		// For server mode, use project name
		if (isServerMode && projectName) {
			// getProjectColor expects a task ID format, so we construct one
			return getProjectColor(`${projectName}-x`);
		}
		return null;
	});

	// Task for StatusActionBadge epic linking - use current task OR last completed task
	// This allows linking completed tasks to epics (e.g., if user forgot before completing)
	const taskForEpicLinking = $derived(
		task ? { id: task.id, issue_type: task.issue_type, priority: task.priority } :
		lastCompletedTask ? { id: lastCompletedTask.id, issue_type: lastCompletedTask.issue_type, priority: lastCompletedTask.priority } :
		null
	);

	// Review status for auto-complete logic - computed from task and review rules
	const reviewStatus = $derived.by(() => {
		if (!task) return null;
		const rules = getReviewRules();
		return computeReviewStatus(task, rules);
	});

	// Rich signal type detection - determine which signal card to render
	// These derive typed signals from the generic richSignalPayload prop
	const workingSignal = $derived.by(() => {
		if (richSignalPayload?.type === "working") {
			return richSignalPayload as unknown as WorkingSignal;
		}
		return null;
	});

	const reviewSignal = $derived.by(() => {
		if (richSignalPayload?.type === "review") {
			return richSignalPayload as unknown as ReviewSignal;
		}
		return null;
	});

	const needsInputSignal = $derived.by(() => {
		if (richSignalPayload?.type === "needs_input") {
			return richSignalPayload as unknown as NeedsInputSignal;
		}
		return null;
	});

	const completingSignal = $derived.by(() => {
		if (richSignalPayload?.type === "completing") {
			return richSignalPayload as unknown as CompletingSignalType;
		}
		return null;
	});

	const idleSignal = $derived.by(() => {
		if (richSignalPayload?.type === "idle") {
			return richSignalPayload as unknown as IdleSignal;
		}
		return null;
	});

	const startingSignal = $derived.by(() => {
		if (richSignalPayload?.type === "starting") {
			return richSignalPayload as unknown as StartingSignal;
		}
		return null;
	});

	const compactingSignal = $derived.by(() => {
		if (richSignalPayload?.type === "compacting") {
			return richSignalPayload as unknown as CompactingSignal;
		}
		return null;
	});

	const completedSignal = $derived.by(() => {
		// First check if we have a completed state signal from SSE
		if (richSignalPayload?.type === "completed") {
			return richSignalPayload as unknown as CompletedSignalType;
		}
		// Also check if we have a completion bundle (from complete data signal)
		// and SSE state is completed - construct a CompletedSignal from it
		const BUNDLE_TTL_MS = 30 * 60 * 1000; // 30 minutes
		const bundleIsValid =
			completionBundle &&
			completionBundleTimestamp &&
			Date.now() - completionBundleTimestamp < BUNDLE_TTL_MS;
		if (bundleIsValid && sseState === "completed") {
			return {
				type: "completed" as const,
				taskId: completionBundle.taskId,
				agentName: completionBundle.agentName,
				summary: completionBundle.summary || [],
				quality: completionBundle.quality || {
					tests: "none",
					build: "unknown",
				},
				humanActions: completionBundle.humanActions,
				suggestedTasks: completionBundle.suggestedTasks || [],
				crossAgentIntel: completionBundle.crossAgentIntel,
				sessionStats: completionBundle.sessionStats || {
					duration: 0,
					tokensUsed: 0,
					filesModified: 0,
					linesChanged: 0,
					commitsCreated: 0,
				},
				finalCommit: completionBundle.finalCommit || "",
				prLink: completionBundle.prLink,
			} as CompletedSignalType;
		}
		return null;
	});

	// Whether we have any rich signal to display
	const hasRichSignal = $derived(
		workingSignal !== null ||
			reviewSignal !== null ||
			needsInputSignal !== null ||
			completingSignal !== null ||
			completedSignal !== null ||
			idleSignal !== null ||
			startingSignal !== null ||
			compactingSignal !== null,
	);

	// Flash effect when Alt+C complete command is triggered
	const isCompleteFlashing = $derived($completingSessionFlash === sessionName);

	// Highlight effect when Alt+number jump is triggered
	const isJumpHighlighted = $derived($highlightedSessionName === sessionName);

	// Combined highlight state (from prop or jump)
	const effectiveHighlighted = $derived(isHighlighted || isJumpHighlighted);

	// Completion state
	let showCompletionBanner = $state(false);
	let completionDismissTimer: ReturnType<typeof setTimeout> | null = null;
	let previousIsComplete = $state(false);

	// Star celebration state (compact mode only)
	let showCelebration = $state(false);
	let tasksCompletedToday = $state(1); // Default to 1 (at least the current task)
	let previousSessionState = $state<string>("idle"); // Track for celebration trigger
	let celebrationDismissTimer: ReturnType<typeof setTimeout> | null = null;

	// Session log capture state (prevents duplicate captures)
	let logCaptured = $state(false);

	// Auto-close countdown state (for AUTO_PROCEED marker)
	// When agent outputs [JAT:AUTO_PROCEED] and completes, start 3-second countdown
	let autoCloseCountdown = $state<number | null>(null); // Seconds remaining (3, 2, 1, null)
	let autoCloseTimer: ReturnType<typeof setInterval> | null = null;
	let autoCloseHeld = $state(false); // User clicked "Hold for Review"
	let autoCompleteTriggered = $state(false); // Track if auto-complete has been triggered for this review cycle

	// Track baseline commit across state transitions (working → review)
	// When agent transitions from working to review, the working signal's baselineCommit
	// becomes unavailable. We persist it here so ReviewDiffDrawer can show changes.
	let lastBaselineCommit = $state<string | null>(null);

	// Real-time elapsed time clock (ticks every second)
	let currentTime = $state(Date.now());
	let elapsedTimeInterval: ReturnType<typeof setInterval> | null = null;

	// Activity tracking for dormancy detection
	// Track when output last changed to detect stalled/inactive sessions
	let lastOutputLength = $state(0);
	let lastActivityTime = $state(Date.now());

	// Real-time output activity state (for shimmer effect)
	// Derived from the central workSessionsState store (polling handled centrally)
	const outputActivityState = $derived.by(() => {
		const session = workSessionsState.sessions.find(
			(s) => s.sessionName === sessionName,
		);
		return session?._activityState || "idle";
	});

	// API-based question data (from PostToolUse hook)
	interface APIQuestion {
		question: string;
		header: string;
		multiSelect: boolean;
		options: { label: string; description: string }[];
	}
	let apiQuestionData = $state<{
		active: boolean;
		questions: APIQuestion[];
	} | null>(null);
	let questionPollInterval: ReturnType<typeof setInterval> | null = null;
	// Track selected options locally for multi-select (API doesn't update with selections)
	let selectedOptionIndices = $state<Set<number>>(new Set());
	// Track current cursor position in the question UI
	let currentOptionIndex = $state(0);
	// Allow manual dismissal of terminal-parsed question UI
	let dismissedTerminalQuestion = $state(false);
	// "Other" option state - when user wants to type custom text
	let isOtherInputMode = $state(false);
	let otherInputValue = $state("");
	// Suppress question fetching after answering (prevents race condition)
	let suppressQuestionFetch = $state(false);
	// Error state for failed message sends (timeout, network error)
	// When set, shows error banner and preserves input text for retry
	let sendInputError = $state<string | null>(null);

	// API-based signal data (from jat-signal action command)
	// When agent runs jat-signal action '{"title":"...","items":[...]}', this data is
	// written to /tmp/jat-signal-{session}.json and fetched here for display
	interface SignalAction {
		title: string;
		items?: string[];
		description?: string;
	}
	let signalActionData = $state<SignalAction | null>(null);
	let signalPollInterval: ReturnType<typeof setInterval> | null = null;

	// Custom question signal data (from jat-signal question command)
	// When agent runs jat-signal question '{"question":"...","questionType":"...","options":[...]}',
	// this data is written to /tmp/jat-question-tmux-{sessionName}.json and fetched here for display
	interface CustomQuestionOption {
		label: string;
		value?: string;
		description?: string;
	}
	interface CustomQuestionData {
		active: boolean;
		sessionName?: string;
		session_id?: string;
		tmux_session?: string;
		timestamp?: string;
		question: string;
		questionType: "choice" | "confirm" | "input";
		options: CustomQuestionOption[];
		timeout?: number | null;
		fileAgeMs?: number;
	}
	let customQuestionData = $state<CustomQuestionData | null>(null);
	let customQuestionPollInterval: ReturnType<typeof setInterval> | null = null;
	let customQuestionTimeout = $state<number | null>(null); // Remaining timeout in seconds
	let customQuestionTimeoutInterval: ReturnType<typeof setInterval> | null =
		null;
	let customQuestionInputValue = $state(""); // For input-type questions
	let suppressCustomQuestionFetch = $state(false); // Prevent race condition after answering

	// Next task state (for "Start Next" action in completed state)
	interface NextTaskInfo {
		taskId: string;
		taskTitle: string;
		source: "epic" | "backlog";
		epicId?: string;
		epicTitle?: string;
	}
	let nextTaskInfo = $state<NextTaskInfo | null>(null);
	let nextTaskLoading = $state(false);
	let nextTaskFetchFailed = $state(false); // Track if fetch failed (404, network error) to prevent infinite retry loop

	// Copy session contents state
	let sessionCopied = $state(false);
	let sessionCopyTimeout: ReturnType<typeof setTimeout> | null = null;

	// Fetch next task when session is in completed state
	// Only recommends tasks from the same project as the completed task
	async function fetchNextTask() {
		if (nextTaskLoading) return;
		nextTaskLoading = true;
		try {
			const completedTaskId = displayTask?.id || lastCompletedTask?.id || null;
			// Extract project from task ID (e.g., "steelbridge-abc" → "steelbridge")
			const project = completedTaskId?.split("-")[0] || null;
			const params = new URLSearchParams();
			if (completedTaskId) params.set("completedTaskId", completedTaskId);
			if (project) params.set("project", project);
			const queryString = params.toString();
			// Add timeout to prevent hanging forever
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
			const response = await fetch(
				`/api/tasks/next${queryString ? "?" + queryString : ""}`,
				{
					signal: controller.signal,
				},
			);
			clearTimeout(timeoutId);
			if (response.ok) {
				const data = await response.json();
				if (data.nextTask) {
					nextTaskInfo = {
						taskId: data.nextTask.taskId,
						taskTitle: data.nextTask.taskTitle,
						source: data.nextTask.source,
						epicId: data.nextTask.epicId,
						epicTitle: data.nextTask.epicTitle,
					};
				} else {
					nextTaskInfo = null;
				}
				nextTaskFetchFailed = false;
			} else {
				// 404 means endpoint doesn't exist (project IDE without /api/tasks/next)
				// Don't log error for 404 - this is expected for projects without the endpoint
				nextTaskInfo = null;
				nextTaskFetchFailed = true;
			}
		} catch (error) {
			// Network errors - silently fail, this is optional functionality
			nextTaskInfo = null;
			nextTaskFetchFailed = true;
		} finally {
			nextTaskLoading = false;
		}
	}

	// Fetch question data from API
	// Uses throttledFetch to prevent connection exhaustion when many sessions poll simultaneously
	async function fetchQuestionData() {
		if (!sessionName) return;
		// Skip if we just answered a question (prevents race condition with DELETE)
		if (suppressQuestionFetch) return;
		try {
			const response = await throttledFetch(
				`/api/work/${encodeURIComponent(sessionName)}/question`,
			);
			if (response.ok) {
				const data = await response.json();
				// Reset selection state if this is a new question
				const oldQuestion = apiQuestionData?.questions?.[0]?.question;
				const newQuestion = data?.questions?.[0]?.question;
				if (oldQuestion !== newQuestion) {
					selectedOptionIndices = new Set();
					currentOptionIndex = 0;
				}
				apiQuestionData = data;
			}
		} catch (error) {
			// Silently fail - question data is optional enhancement
		}
	}

	// Clear question data after answering
	async function clearQuestionData() {
		if (!sessionName) return;
		// Suppress fetching to prevent race condition
		suppressQuestionFetch = true;
		apiQuestionData = null;
		try {
			await fetch(`/api/work/${encodeURIComponent(sessionName)}/question`, {
				method: "DELETE",
			});
		} catch (error) {
			// Silently fail
		}
		// Re-enable fetching after a delay (allows polling to see the deleted state)
		setTimeout(() => {
			suppressQuestionFetch = false;
		}, 2000);
	}

	// Dismiss terminal-parsed question UI
	function dismissTerminalQuestion() {
		dismissedTerminalQuestion = true;
	}

	// Fetch custom question data from API (jat-signal question)
	// Uses throttledFetch to prevent connection exhaustion
	async function fetchCustomQuestionData() {
		if (!sessionName) return;
		if (suppressCustomQuestionFetch) return;
		try {
			const response = await throttledFetch(
				`/api/sessions/${encodeURIComponent(sessionName)}/custom-question`,
			);
			if (response.ok) {
				const data = await response.json();
				if (data.active) {
					// New question or different question - reset state
					const oldQuestion = customQuestionData?.question;
					if (oldQuestion !== data.question) {
						customQuestionInputValue = "";
						// Start timeout countdown if specified
						if (data.timeout) {
							customQuestionTimeout = data.timeout;
							startCustomQuestionTimeoutCountdown();
						} else {
							customQuestionTimeout = null;
							stopCustomQuestionTimeoutCountdown();
						}
					}
					customQuestionData = data;
				} else {
					// No active question
					customQuestionData = null;
					customQuestionTimeout = null;
					stopCustomQuestionTimeoutCountdown();
				}
			}
		} catch (error) {
			// Silently fail - custom question data is optional enhancement
		}
	}

	// Clear custom question data after answering
	async function clearCustomQuestionData() {
		if (!sessionName) return;
		// Suppress fetching to prevent race condition
		suppressCustomQuestionFetch = true;
		customQuestionData = null;
		customQuestionTimeout = null;
		customQuestionInputValue = "";
		stopCustomQuestionTimeoutCountdown();
		try {
			await fetch(
				`/api/sessions/${encodeURIComponent(sessionName)}/custom-question`,
				{
					method: "DELETE",
				},
			);
		} catch (error) {
			// Silently fail
		}
		// Re-enable fetching after a delay
		setTimeout(() => {
			suppressCustomQuestionFetch = false;
		}, 2000);
	}

	// Start countdown timer for custom question timeout
	function startCustomQuestionTimeoutCountdown() {
		stopCustomQuestionTimeoutCountdown();
		customQuestionTimeoutInterval = setInterval(() => {
			if (customQuestionTimeout !== null && customQuestionTimeout > 0) {
				customQuestionTimeout -= 1;
			} else if (customQuestionTimeout === 0) {
				// Timeout expired - could auto-dismiss or take default action
				stopCustomQuestionTimeoutCountdown();
			}
		}, 1000);
	}

	// Stop countdown timer
	function stopCustomQuestionTimeoutCountdown() {
		if (customQuestionTimeoutInterval) {
			clearInterval(customQuestionTimeoutInterval);
			customQuestionTimeoutInterval = null;
		}
	}

	// Handle custom question answer submission
	async function submitCustomQuestionAnswer(answer: string) {
		if (!sessionName || !onSendInput) return;

		// Send the answer via tmux send-keys
		await onSendInput(answer, "text");

		// Clear the question data
		await clearCustomQuestionData();
	}

	// Fetch signal data from API (for human actions via jat-signal action)
	// Uses throttledFetch to prevent connection exhaustion
	async function fetchSignalData() {
		if (!sessionName) return;
		try {
			const response = await throttledFetch(
				`/api/sessions/${encodeURIComponent(sessionName)}/signal`,
			);
			if (response.ok) {
				const data = await response.json();
				// Only process action signals
				if (
					data.hasSignal &&
					data.signal?.type === "action" &&
					data.signal?.data
				) {
					signalActionData = data.signal.data;
				} else if (!data.hasSignal) {
					signalActionData = null;
				}
			}
		} catch (error) {
			// Silently fail - signal data is optional enhancement
		}
	}

	// Clear signal data after user dismisses it
	async function clearSignalData() {
		if (!sessionName) return;
		signalActionData = null;
		try {
			await fetch(`/api/sessions/${encodeURIComponent(sessionName)}/signal`, {
				method: "DELETE",
			});
		} catch (error) {
			// Silently fail
		}
	}

	// Activate "Other" input mode - navigates to "Type something" option and shows text input
	async function activateOtherInputMode(numOptions: number) {
		// "Type something" is at index = options.length (after all options, before Submit)
		const typeIndex = numOptions;
		const delta = typeIndex - currentOptionIndex;
		const direction = delta > 0 ? "down" : "up";
		const steps = Math.abs(delta);

		// Navigate to "Type something" option
		for (let i = 0; i < steps; i++) {
			await onSendInput?.(direction, "key");
			await new Promise((r) => setTimeout(r, 30));
		}
		currentOptionIndex = typeIndex;

		// Press Enter to select "Type something" - this opens Claude Code's text input
		await new Promise((r) => setTimeout(r, 50));
		await onSendInput?.("enter", "key");

		// Show our text input for the user to type their custom response
		isOtherInputMode = true;
		otherInputValue = "";
	}

	// Submit the "Other" text input
	async function submitOtherInput() {
		if (!otherInputValue.trim()) return;

		// Send the text to Claude Code's "Type something" input
		await onSendInput?.(otherInputValue.trim(), "text");

		// Wait a moment then press Enter to submit
		await new Promise((r) => setTimeout(r, 100));
		await onSendInput?.("enter", "key");

		// Clear the "Other" input state and dismiss question UI
		isOtherInputMode = false;
		otherInputValue = "";
		await clearQuestionData();
	}

	// Cancel "Other" input mode - press Escape to go back
	async function cancelOtherInputMode() {
		await onSendInput?.("escape", "key");
		isOtherInputMode = false;
		otherInputValue = "";
	}

	// Fetch count of tasks completed today by this agent
	async function fetchTasksCompletedToday(): Promise<number> {
		if (!agentName) return 1;
		try {
			// Fetch closed tasks from the tasks API
			const response = await fetch("/api/tasks?status=closed");
			if (!response.ok) return 1;

			const data = await response.json();
			const today = new Date();
			today.setHours(0, 0, 0, 0);

			// Filter tasks completed today by this agent
			const completedToday = (data.tasks || []).filter((task: any) => {
				if (task.assignee !== agentName) return false;
				if (!task.updated_at) return false;

				const taskDate = new Date(task.updated_at);
				return taskDate >= today;
			});

			return Math.max(1, completedToday.length);
		} catch (error) {
			console.error("Error fetching tasks completed today:", error);
			return 1;
		}
	}

	// Track previous output length for detecting when question UI disappears
	let lastQuestionUIPresent = $state(false);

	// Reset dismissed state when question UI naturally disappears (user answered elsewhere)
	$effect(() => {
		if (!output) return;
		const recentOutput = output.slice(-3000);
		const hasQuestionUI =
			/Enter to select.*(?:Tab|Arrow).*(?:navigate|keys).*Esc to cancel/i.test(
				recentOutput,
			);

		// If question UI is no longer present and was dismissed, reset the dismissed state
		// This allows a new question to show up later
		if (!hasQuestionUI && lastQuestionUIPresent) {
			dismissedTerminalQuestion = false;
		}
		lastQuestionUIPresent = hasQuestionUI;
	});

	// Track activity for dormancy detection
	// Update lastActivityTime when output changes
	$effect(() => {
		const currentLength = output?.length || 0;
		if (currentLength !== lastOutputLength) {
			lastOutputLength = currentLength;
			lastActivityTime = Date.now();
		}
	});

	// Track baselineCommit when in working state
	// This persists the baseline so it's available when transitioning to review state
	$effect(() => {
		if (workingSignal?.baselineCommit) {
			lastBaselineCommit = workingSignal.baselineCommit;
		}
	});

	onMount(() => {
		// PERFORMANCE: Only tick every second for full modes that show animated digits.
		// Compact mode uses static "Xh Xm" format that doesn't need second precision.
		// With 10+ compact cards on kanban, 1-second intervals cause excessive re-renders.
		const tickInterval = mode === "compact" ? 30000 : 1000; // 30s for compact, 1s for others
		elapsedTimeInterval = setInterval(() => {
			currentTime = Date.now();
		}, tickInterval);

		// Fetch existing task titles for "already created" detection in suggested tasks
		// Run on mount to ensure we have the data when suggested tasks appear
		fetchExistingTaskTitles();

		// Question polling is now managed by $effect based on sessionState
		// This prevents N sessions from all polling simultaneously when not needed

		// Load saved card width from localStorage
		// Migrate old narrow widths (<=680px) to new default (720px) for 80-column support
		if (sessionName && !cardWidth) {
			const savedWidth = localStorage.getItem(
				`${STORAGE_KEY_PREFIX}${sessionName}`,
			);
			if (savedWidth) {
				const parsed = parseInt(savedWidth, 10);
				if (
					!isNaN(parsed) &&
					parsed >= MIN_CARD_WIDTH &&
					parsed <= MAX_CARD_WIDTH
				) {
					// Migrate old default (640px) to new default (720px)
					// Only migrate if width was near old default, preserve user-customized widths
					if (parsed <= 680) {
						internalWidth = DEFAULT_CARD_WIDTH;
						// Update localStorage with new default
						localStorage.setItem(
							`${STORAGE_KEY_PREFIX}${sessionName}`,
							DEFAULT_CARD_WIDTH.toString(),
						);
					} else {
						internalWidth = parsed;
					}
				}
			}
		}

		// Set up ResizeObserver after a short delay to ensure DOM is fully ready
		// This auto-resizes tmux session to match the SessionCard width
		// Add random stagger (0-200ms) to spread requests when multiple cards mount
		const staggerDelay = 100 + Math.floor(Math.random() * 200);
		setTimeout(() => {
			if (
				scrollContainerRef &&
				typeof ResizeObserver !== "undefined" &&
				!resizeObserverSetup
			) {
				resizeObserverInstance = new ResizeObserver(handleContainerResize);
				resizeObserverInstance.observe(scrollContainerRef);
				resizeObserverSetup = true;

				// Initial resize based on current container width
				const rect = scrollContainerRef.getBoundingClientRect();
				const initialColumns = calculateColumns(rect.width);
				if (initialColumns > 0) {
					resizeTmuxSession(initialColumns);
				}
			}
		}, staggerDelay);
	});

	// ResizeObserver instance (not reactive, just for cleanup)
	let resizeObserverInstance: ResizeObserver | null = null;

	// Track when completion state changes to trigger banner (full mode only)
	$effect(() => {
		if (isComplete && !previousIsComplete) {
			// Task just completed - show banner (full mode only, compact uses sessionState trigger)
			if (!isCompactMode) {
				showCompletionBanner = true;
				playTaskCompleteSound();

				// Auto-dismiss after 4 seconds
				completionDismissTimer = setTimeout(() => {
					showCompletionBanner = false;
					onDismiss?.();
				}, 4000);
			}
		}
		previousIsComplete = isComplete;
	});

	// NOTE: Previously had an $effect here to detect when text was submitted from an
	// attached terminal (outside the IDE). This caused a bug (jat-ygylc) where
	// text would be duplicated/re-streamed multiple times because the detection was
	// too aggressive - it would falsely trigger when Claude Code echoed back typed
	// characters or when responses happened to contain the typed text.
	//
	// The effect has been removed. If users submit from an attached terminal, the
	// local textarea won't auto-clear, but that's better than the text duplication bug.
	// Users can manually clear with Escape or the clear button.

	// Note: Activity state polling is now centralized in workSessionsState store
	// The store polls all active sessions every 200ms and updates _activityState
	// SessionCard derives outputActivityState from the store reactively

	// Cleanup timers on destroy
	onDestroy(() => {
		if (completionDismissTimer) {
			clearTimeout(completionDismissTimer);
		}
		if (celebrationDismissTimer) {
			clearTimeout(celebrationDismissTimer);
		}
		if (elapsedTimeInterval) {
			clearInterval(elapsedTimeInterval);
		}
		if (questionPollInterval) {
			clearInterval(questionPollInterval);
		}
		// Cleanup custom question polling and timeout
		if (customQuestionPollInterval) {
			clearInterval(customQuestionPollInterval);
		}
		stopCustomQuestionTimeoutCountdown();
		// Note: activityPollInterval removed - polling is now centralized in workSessionsState
		if (hoverTimeout) {
			clearTimeout(hoverTimeout);
		}
		if (streamDebounceTimer) {
			clearTimeout(streamDebounceTimer);
		}
		if (resizeDebounceTimer) {
			clearTimeout(resizeDebounceTimer);
		}
		if (resizeObserverInstance) {
			resizeObserverInstance.disconnect();
		}
		if (sendingInputTimeout) {
			clearTimeout(sendingInputTimeout);
		}
	});

	// Calculate elapsed time (uses currentTime to trigger reactive updates)
	const elapsedTime = $derived((): string => {
		if (!startTime) return "";
		const elapsed = currentTime - startTime.getTime();
		const seconds = Math.floor(elapsed / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);

		if (hours > 0) {
			return `${hours}h ${minutes % 60}m`;
		} else if (minutes > 0) {
			return `${minutes}m ${seconds % 60}s`;
		} else {
			return `${seconds}s`;
		}
	});

	// Formatted elapsed time for AnimatedDigits display
	// Returns object with hours, minutes, seconds as zero-padded strings
	const elapsedTimeFormatted = $derived(() => {
		if (!startTime) return null;
		const elapsed = currentTime - startTime.getTime();
		const totalSeconds = Math.floor(elapsed / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		return {
			hours: String(hours).padStart(2, "0"),
			minutes: String(minutes).padStart(2, "0"),
			seconds: String(seconds).padStart(2, "0"),
			showHours: hours > 0,
		};
	});

	// Server elapsed time (uses `created` timestamp for server sessions)
	const serverElapsedFormatted = $derived(() => {
		if (!created) return null;
		const startMs = new Date(created).getTime();
		if (isNaN(startMs)) return null;
		const elapsed = currentTime - startMs;
		if (elapsed < 0) return null;

		const totalSeconds = Math.floor(elapsed / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		return {
			hours: String(hours).padStart(2, "0"),
			minutes: String(minutes).padStart(2, "0"),
			seconds: String(seconds).padStart(2, "0"),
			showHours: hours > 0,
		};
	});

	// Server mode: Error detection in output
	const serverErrors = $derived(() => {
		if (!isServerMode || !output) return { count: 0, hasErrors: false };

		// Error patterns to detect
		const errorPatterns = [
			/\bError\b:?/gi,
			/\bERROR\b/g,
			/\bFATAL\b/gi,
			/\bException\b/gi,
			/\bfailed\b/gi,
			/\bECONNREFUSED\b/g,
			/\bENOENT\b/g,
			/\bEACCES\b/g,
			/\bTypeError\b/g,
			/\bSyntaxError\b/g,
			/\bReferenceError\b/g,
			/\bUnhandledPromiseRejection\b/gi,
			/at\s+\S+\s+\([^)]+:\d+:\d+\)/g, // Stack trace lines
		];

		// Only check recent output (last 2000 chars) for performance
		const recentOutput = output.slice(-2000);
		let count = 0;

		for (const pattern of errorPatterns) {
			const matches = recentOutput.match(pattern);
			if (matches) count += matches.length;
		}

		return { count, hasErrors: count > 0 };
	});

	// Format token count for display
	function formatTokens(t: number): string {
		if (t >= 1_000_000) {
			return `${(t / 1_000_000).toFixed(1)}M`;
		} else if (t >= 1_000) {
			return `${(t / 1_000).toFixed(1)}K`;
		}
		return t.toString();
	}

	// Auto-scroll state
	let autoScroll = $state(true);
	let userScrolledUp = $state(false);
	let scrollContainerRef: HTMLDivElement | null = null;

	// Minimap state
	let minimapRef: MinimapCssScale | null = $state(null);
	let outputContainerHeight = $state(0);
	let terminalWidth = $state(800);

	// Suggested tasks panel expanded state (inline) and modal state
	let suggestedTasksExpanded = $state(false);
	let suggestedTasksModalOpen = $state(false);

	// Rollback confirmation modal state
	let rollbackModalOpen = $state(false);
	let rollbackEvent = $state<{ git_sha: string; timestamp?: string } | null>(
		null,
	);

	// Track existing task titles for "already created" detection
	// Map from normalized title -> task ID (allows showing clickable task ID badge)
	let existingTaskTitles = $state<Map<string, string>>(new Map());
	// Version counter to force $derived reactivity when existingTaskTitles is updated
	let existingTaskTitlesVersion = $state(0);

	// Fetch existing task titles from Beads (normalized for comparison)
	async function fetchExistingTaskTitles(): Promise<void> {
		try {
			// Use repeated status params (API doesn't support comma-separated)
			const response = await fetch(
				"/api/tasks?status=open&status=in_progress&status=closed",
			);
			if (!response.ok) {
				console.warn(
					"[SessionCard] fetchExistingTaskTitles: response not ok",
					response.status,
				);
				return;
			}

			const data = await response.json();
			const titleToId = new Map<string, string>();
			for (const task of data.tasks || []) {
				if (task.title && task.id) {
					// Normalize: lowercase and trim for comparison
					// Store mapping to task ID for clickable badges
					titleToId.set(task.title.toLowerCase().trim(), task.id);
				}
			}
			existingTaskTitles = titleToId;
			existingTaskTitlesVersion++; // Bump version to trigger $derived reactivity
		} catch (error) {
			console.error(
				"[SessionCard] Error fetching existing task titles:",
				error,
			);
		}
	}

	// Fetch existing task titles when modal opens or when suggested tasks appear
	// Note: We check signalSuggestedTasks directly (not hasSuggestedTasks) to avoid circular dependency
	// since hasSuggestedTasks depends on detectedSuggestedTasks which depends on existingTaskTitles
	$effect(() => {
		const hasSignalTasks =
			signalSuggestedTasks && signalSuggestedTasks.length > 0;
		if (hasSignalTasks || suggestedTasksModalOpen) {
			fetchExistingTaskTitles();
		}
	});

	// Available projects for suggested task editor dropdown
	let availableProjects = $state<string[]>([]);
	$effect(() => {
		const unsubscribe = availableProjectsStore.subscribe((projects) => {
			availableProjects = projects;
		});
		return unsubscribe;
	});

	// Tmux session resize state
	// Tracks the output container width and resizes tmux to match
	// Using $state so the $effect guard works correctly
	let resizeObserverSetup = $state(false);
	let lastResizedWidth = $state(0);
	let lastResizedHeight = $state(0);
	let pendingResizeKey: string | null = null; // Track in-flight resize requests
	let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	const RESIZE_DEBOUNCE_MS = 300; // Wait for resize to stabilize
	const MIN_COLUMN_CHANGE = 5; // Only resize if columns change by this much

	// Manual card width resize state
	// Internal width state (used when cardWidth prop not provided)
	let internalWidth = $state<number | undefined>(undefined);
	const MIN_CARD_WIDTH = 300; // Minimum card width in pixels
	const MAX_CARD_WIDTH = 1200; // Maximum card width in pixels
	const DEFAULT_CARD_WIDTH = 720; // Default width for 80-column terminal output
	const STORAGE_KEY_PREFIX = "workcard-width-";

	// Tmux height configuration (from unified preferences store)
	const MIN_TMUX_HEIGHT = 20;
	const MAX_TMUX_HEIGHT = 150;
	const tmuxHeight = $derived(getTerminalHeight());

	// React to terminal height preference changes
	let previousTmuxHeight = tmuxHeight;
	$effect(() => {
		if (tmuxHeight !== previousTmuxHeight) {
			previousTmuxHeight = tmuxHeight;
			// Trigger resize with new height
			if (scrollContainerRef) {
				const columns = calculateColumns(
					scrollContainerRef.getBoundingClientRect().width,
				);
				resizeTmuxSession(columns);
			}
		}
	});

	// Load saved width from localStorage on init (done in onMount below)

	// Effective width (prop takes precedence over internal state)
	const effectiveWidth = $derived(cardWidth ?? internalWidth);

	// Horizontal padding in the output container (px-3 = 12px on each side)
	const CONTAINER_PADDING_PX = 24;

	/**
	 * Get the current character width based on terminal font settings.
	 * Monospace fonts are typically ~0.6em wide.
	 */
	function getCharWidthPx(): number {
		if (typeof window === "undefined") return 7.2; // SSR fallback

		// Get current font size from CSS variable
		const fontSizeStr =
			getComputedStyle(document.documentElement)
				.getPropertyValue("--terminal-font-size")
				.trim() || "0.875rem";

		// Convert to pixels
		let fontSizePx = 14; // default (0.875rem = 14px)
		if (fontSizeStr.endsWith("rem")) {
			fontSizePx = parseFloat(fontSizeStr) * 16; // assuming 16px root
		} else if (fontSizeStr.endsWith("px")) {
			fontSizePx = parseFloat(fontSizeStr);
		}

		// Monospace chars are ~0.6em wide
		return fontSizePx * 0.6;
	}

	/**
	 * Calculate the number of columns that fit in a given pixel width
	 */
	function calculateColumns(pixelWidth: number): number {
		const charWidth = getCharWidthPx();
		const availableWidth = pixelWidth - CONTAINER_PADDING_PX;
		const columns = Math.floor(availableWidth / charWidth);
		// Clamp to reasonable range
		return Math.max(40, Math.min(columns, 300));
	}

	/**
	 * Resize tmux session to match container width (height is user-configurable)
	 * Includes deduplication to prevent multiple calls with same dimensions
	 */
	async function resizeTmuxSession(columns: number) {
		if (!sessionName) return;

		// Create a unique key for this resize request
		const resizeKey = `${columns}x${tmuxHeight}`;

		// Skip if we already have a pending request with these exact dimensions
		if (pendingResizeKey === resizeKey) {
			return;
		}

		// Skip if we've already resized to these exact dimensions
		if (lastResizedWidth === columns && lastResizedHeight === tmuxHeight) {
			return;
		}

		// Mark this resize as pending and update last dimensions immediately
		// to prevent duplicate calls before the async request completes
		pendingResizeKey = resizeKey;
		lastResizedWidth = columns;
		lastResizedHeight = tmuxHeight;

		try {
			// Use throttledFetch to prevent overwhelming server when multiple cards mount
			const response = await throttledFetch(
				`/api/work/${encodeURIComponent(sessionName)}/resize`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						width: columns,
						height: tmuxHeight,
					}),
				},
			);

			if (!response.ok) {
				// Reset on failure so we can retry later
				lastResizedWidth = 0;
				lastResizedHeight = 0;
			}
		} catch (error) {
			// Reset on failure so we can retry later
			lastResizedWidth = 0;
			lastResizedHeight = 0;
			// Silently fail - resize is a UX enhancement, not critical
			console.debug("Failed to resize tmux session:", error);
		} finally {
			// Clear pending key
			if (pendingResizeKey === resizeKey) {
				pendingResizeKey = null;
			}
		}
	}

	/**
	 * Handle container resize - debounced to avoid excessive API calls
	 * Only tracks width changes (height is fixed for tmux)
	 */
	function handleContainerResize(entries: ResizeObserverEntry[]) {
		const entry = entries[0];
		if (!entry) return;

		const pixelWidth = entry.contentRect.width;
		const columns = calculateColumns(pixelWidth);

		// Only resize if the column count changed significantly
		if (Math.abs(columns - lastResizedWidth) < MIN_COLUMN_CHANGE) {
			return;
		}

		// Debounce the resize call
		if (resizeDebounceTimer) {
			clearTimeout(resizeDebounceTimer);
		}

		resizeDebounceTimer = setTimeout(() => {
			resizeTmuxSession(columns);
		}, RESIZE_DEBOUNCE_MS);
	}

	// Detect when user manually scrolls up to disable auto-scroll
	function handleScroll(e: Event) {
		const el = e.target as HTMLDivElement;
		if (!el) return;

		// Check if user is near bottom (within 50px)
		const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;

		if (isNearBottom) {
			// User scrolled to bottom, re-enable auto-scroll
			userScrolledUp = false;
		} else if (el.scrollTop < el.scrollHeight - el.clientHeight - 100) {
			// User scrolled up significantly, disable auto-scroll temporarily
			userScrolledUp = true;
		}

		// Sync minimap viewport position
		syncMinimapViewport();
	}

	// Minimap scroll sync functions
	function syncMinimapViewport() {
		if (!scrollContainerRef || !minimapRef) return;
		const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef;
		const maxScroll = scrollHeight - clientHeight;
		if (maxScroll > 0) {
			const scrollPercent = (scrollTop / maxScroll) * 100;
			const visiblePercent = (clientHeight / scrollHeight) * 100;
			minimapRef.setViewportPosition(scrollPercent, visiblePercent);
		}
	}

	function handleMinimapClick(percent: number) {
		if (!scrollContainerRef) return;
		const { scrollHeight, clientHeight } = scrollContainerRef;
		const maxScroll = scrollHeight - clientHeight;
		const targetScroll = (percent / 100) * maxScroll;
		scrollContainerRef.scrollTo({ top: targetScroll, behavior: 'smooth' });
	}

	// Control button loading states
	let killLoading = $state(false);
	let interruptLoading = $state(false);
	let continueLoading = $state(false);
	let sendingInput = $state(false);
	let sendingInputTimeout: ReturnType<typeof setTimeout> | null = null;
	const SENDING_INPUT_TIMEOUT_MS = 30000; // 30 second failsafe

	// Helper to set sendingInput with auto-reset failsafe
	function setSendingInput(value: boolean) {
		sendingInput = value;
		if (sendingInputTimeout) {
			clearTimeout(sendingInputTimeout);
			sendingInputTimeout = null;
		}
		if (value) {
			// Auto-reset after 30 seconds if operation hangs
			sendingInputTimeout = setTimeout(() => {
				if (sendingInput) {
					console.warn(
						"[SessionCard] sendingInput timeout - auto-resetting after 30s",
					);
					setSendingInput(false);
				}
				sendingInputTimeout = null;
			}, SENDING_INPUT_TIMEOUT_MS);
		}
	}

	// Input state
	let inputText = $state("");
	let inputRef: HTMLTextAreaElement | null = null;
	let escapeFlash = $state(false); // Brief flash when Escape clears
	let pasteFlash = $state(false); // Brief flash when content is pasted
	let tabFlash = $state(false); // Brief flash when Tab autocomplete is sent
	let copyFlash = $state(false); // Brief flash when text is copied
	let submitFlash = $state(false); // Brief flash when command is submitted
	let voiceFlash = $state(false); // Brief flash when voice recording starts/stops
	let attachFlash = $state(false); // Brief flash when image is attached
	let inputTextFlash = $state(false); // Brief flash when text is dropped into input
	let arrowFlash = $state(false); // Brief flash when arrow key navigates
	let exitingText = $state<string | null>(null); // Text being animated out on submit

	// Live streaming input state
	// When enabled, characters are streamed to terminal as user types
	// This enables instant slash command filtering in Claude Code
	let liveStreamEnabled = $state(true); // Default ON for better UX
	let lastStreamedText = $state(""); // Track what we've already sent to terminal
	let streamDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	const STREAM_DEBOUNCE_MS = 50; // Short debounce for responsive feel
	let isStreaming = $state(false); // Track if we're actively streaming

	// Track the "high water mark" of text we've sent - this prevents re-sending
	// even if lastStreamedText gets cleared by submission detection
	let maxStreamedLength = $state(0);

	// Ctrl+C behavior toggle (reactive from preferences store)
	// When true, Ctrl+C sends interrupt to tmux; when false, Ctrl+C copies as usual
	const ctrlCInterceptEnabled = $derived(getCtrlCIntercept());

	// Task description hover-expand state
	let taskHovered = $state(false);
	let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
	const HOVER_DELAY = 300; // ms before expanding

	function handleTaskMouseEnter() {
		hoverTimeout = setTimeout(() => {
			taskHovered = true;
		}, HOVER_DELAY);
	}

	function handleTaskMouseLeave() {
		if (hoverTimeout) {
			clearTimeout(hoverTimeout);
			hoverTimeout = null;
		}
		taskHovered = false;
	}

	// Inline title editing state
	let editingTitle = $state(false);
	let editedTitle = $state("");
	let titleInputRef: HTMLInputElement | null = null;
	let savingTitle = $state(false);

	function startEditingTitle(event: MouseEvent) {
		event.stopPropagation(); // Don't trigger parent button click
		editedTitle = displayTask?.title || displayTask?.id || "";
		editingTitle = true;
		// Focus input after DOM update
		setTimeout(() => titleInputRef?.focus(), 0);
	}

	async function saveTitle() {
		if (!displayTask || savingTitle) return;

		const newTitle = editedTitle.trim();
		if (!newTitle || newTitle === displayTask.title) {
			editingTitle = false;
			return;
		}

		savingTitle = true;
		try {
			const response = await fetch(`/api/tasks/${displayTask.id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: newTitle }),
			});

			if (response.ok) {
				// Update local state
				if (displayTask) {
					displayTask.title = newTitle;
				}
			} else {
				console.error("Failed to save title:", await response.text());
			}
		} catch (err) {
			console.error("Error saving title:", err);
		} finally {
			savingTitle = false;
			editingTitle = false;
		}
	}

	function handleTitleKeydown(event: KeyboardEvent) {
		if (event.key === "Enter") {
			event.preventDefault();
			saveTitle();
		} else if (event.key === "Escape") {
			editingTitle = false;
		}
	}

	// Auto-resize textarea to fit content
	function autoResizeTextarea() {
		if (!inputRef) return;
		// Reset height to auto to get accurate scrollHeight
		inputRef.style.height = "auto";
		// Set height to scrollHeight, capped at max (6 lines roughly = 96px)
		const maxHeight = 96;
		const newHeight = Math.min(inputRef.scrollHeight, maxHeight);
		inputRef.style.height = `${newHeight}px`;
	}

	// Stream text input to terminal as user types
	// This enables real-time slash command filtering in Claude Code
	async function streamInputToTerminal() {
		if (!liveStreamEnabled || !onSendInput || isStreaming) return;

		const currentText = inputText;
		const previousText = lastStreamedText;

		// Nothing changed
		if (currentText === previousText) return;

		// Don't stream if text is empty (user cleared input)
		if (!currentText) {
			// If we had text before, clear the terminal input
			if (previousText || maxStreamedLength > 0) {
				isStreaming = true;
				try {
					// Send Ctrl+U to clear the current line
					await onSendInput("ctrl-u", "key");
					lastStreamedText = "";
					maxStreamedLength = 0; // Reset high water mark when user clears
				} finally {
					isStreaming = false;
				}
			}
			return;
		}

		isStreaming = true;
		try {
			if (currentText.startsWith(previousText) && previousText.length > 0) {
				// Text was appended - send only the new characters (most common case)
				const newChars = currentText.slice(previousText.length);
				if (newChars) {
					await onSendInput(newChars, "raw");
				}
			} else if (
				previousText.length === 0 &&
				currentText.length <= maxStreamedLength
			) {
				// GUARD: lastStreamedText was reset but we already sent this text
				// This happens when submission detection clears lastStreamedText
				// but the text hasn't actually been submitted - don't resend!
				// Just restore lastStreamedText to current state
				// (no terminal command needed)
			} else {
				// Text was modified (deletion, paste, or edit in middle)
				// Clear line and resend entire text
				await onSendInput("ctrl-u", "key");
				await new Promise((r) => setTimeout(r, 20));
				if (currentText) {
					await onSendInput(currentText, "raw");
				}
			}

			lastStreamedText = currentText;
			// Update high water mark
			if (currentText.length > maxStreamedLength) {
				maxStreamedLength = currentText.length;
			}
		} catch (error) {
			console.error("Error streaming input:", error);
		} finally {
			isStreaming = false;
		}
	}

	// Debounced input handler for live streaming
	function handleInputChange() {
		autoResizeTextarea();

		if (!liveStreamEnabled) return;

		// Clear existing debounce timer
		if (streamDebounceTimer) {
			clearTimeout(streamDebounceTimer);
		}

		// Debounce the stream to avoid overwhelming tmux
		streamDebounceTimer = setTimeout(() => {
			streamInputToTerminal();
		}, STREAM_DEBOUNCE_MS);
	}

	// Track hovered session for keyboard shortcuts (Alt+A, Alt+C, etc.)
	// Focus-follows-mouse: auto-focus input on hover (Hyprland-style)
	// Always steals focus between session cards, only protects search boxes/filters
	function handleCardMouseEnter() {
		setHoveredSession(sessionName);

		// Focus-follows-mouse: focus the input when hovering over the card
		// Skip ONLY if user is typing in a non-session input (search box, filter, etc.)
		// Other session card inputs are fine to steal from (true Hyprland behavior)
		const activeEl = document.activeElement as HTMLElement | null;
		const isSessionInput = activeEl?.dataset?.sessionInput === 'true';
		const isNonSessionInput = activeEl &&
			(activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') &&
			activeEl !== inputRef &&
			!isSessionInput;

		if (!isNonSessionInput && inputRef) {
			inputRef.focus({ preventScroll: true });
		}
	}

	function handleCardMouseLeave() {
		setHoveredSession(null);
	}

	// Handle click anywhere in the card to center it and focus input
	// This combines: maximize panel, scroll to top, glow animation, and focus input textarea
	function handleCardClick() {
		// Cancel any scheduled auto-kill when user interacts with the session
		if (autoKillCountdownValue !== null) {
			cancelAutoKill(sessionName);
		}

		// Maximize panel, scroll to top, and trigger glow animation via store
		jumpToSession(sessionName, agentName);

		// Focus the input textarea after scroll completes
		// Delay must be longer than jumpToSession's scroll delay (400ms + rAF ≈ 450ms)
		// Use preventScroll to avoid browser's default scroll-into-view behavior
		setTimeout(() => {
			inputRef?.focus({ preventScroll: true });
		}, 550);
	}

	// Attached files (pending upload) - supports images, PDFs, text, code, etc.
	interface AttachedFile {
		id: string;
		blob: Blob;
		preview: string; // Object URL for thumbnail (images only)
		name: string;
		category: FileCategory; // File type category
		icon: string; // SVG path for non-image files
		iconColor: string; // oklch color for icon
	}
	let attachedFiles = $state<AttachedFile[]>([]);

	// Drag-and-drop state for file attachments
	let isDragOver = $state(false);

	// Detected Claude Code prompt options (numbered format: "1. Yes", "2. No")
	interface PromptOption {
		number: number;
		text: string;
		type: "yes" | "yes-remember" | "custom" | "other";
		keySequence: string[]; // Keys to send (e.g., ['down', 'enter'])
	}

	// Detected Claude Code AskUserQuestion options (selection format)
	// Format: "❯ Option1" or "  Option2" with optional descriptions
	interface QuestionOption {
		label: string;
		description?: string;
		index: number; // 0-based position in the list
		isSelected: boolean; // Whether this option has the ❯ cursor
		keySequence: string[]; // Keys to navigate and select
	}

	// Detected question UI state
	interface DetectedQuestion {
		question: string; // The question text (after "?")
		options: QuestionOption[];
		isMultiSelect: boolean; // True if [ ] checkboxes are used
		selectedIndices: number[]; // For multi-select, which are checked
	}

	// Detected JAT workflow commands (e.g., /jat:complete, /jat:pause)
	interface WorkflowCommand {
		command: string; // Full command (e.g., '/jat:complete')
		label: string; // Display label (e.g., 'Complete')
		description: string; // Description text
		variant: "success" | "primary" | "warning" | "info"; // Button style
	}

	// Parse Claude Code prompt options from output
	const detectedOptions = $derived.by((): PromptOption[] => {
		if (!output) return [];

		const options: PromptOption[] = [];
		const seenNumbers = new Set<number>(); // Track seen option numbers to avoid duplicates

		// Look for "Do you want to proceed?" or similar prompts
		// Match lines like "❯ 1. Yes" or "  2. Yes, and don't ask again..."
		const optionRegex = /^[❯\s]+(\d+)\.\s+(.+)$/gm;
		let match;

		while ((match = optionRegex.exec(output)) !== null) {
			const num = parseInt(match[1], 10);

			// Skip if we've already seen this option number (avoid duplicate keys)
			if (seenNumbers.has(num)) continue;
			seenNumbers.add(num);

			const text = match[2].trim();

			// Determine option type
			let type: PromptOption["type"] = "other";
			if (/^Yes\s*$/.test(text)) {
				type = "yes";
			} else if (
				/Yes.*don't ask again/i.test(text) ||
				/Yes.*and don't ask/i.test(text)
			) {
				type = "yes-remember";
			} else if (/Type here/i.test(text) || /tell Claude/i.test(text)) {
				type = "custom";
			}

			// Calculate key sequence: option 1 = just Enter, option 2 = Down+Enter, etc.
			const downs = num - 1;
			const keySequence: string[] = [];
			for (let i = 0; i < downs; i++) {
				keySequence.push("down");
			}
			keySequence.push("enter");

			options.push({ number: num, text, type, keySequence });
		}

		return options;
	});

	// Parse Claude Code AskUserQuestion format from output
	// Detects both single-select (❯ cursor) and multi-select ([ ] checkbox) formats
	const detectedQuestion = $derived.by((): DetectedQuestion | null => {
		if (!output) return null;

		// If manually dismissed, return null
		if (dismissedTerminalQuestion) return null;

		// Only look at recent output (last 3000 chars), strip ANSI codes for parsing
		const recentOutput = stripAnsi(output.slice(-3000));

		// Check for the navigation footer which indicates an active question prompt
		// Pattern 1: Normal question UI with navigation (Enter to select, Tab/Arrow to navigate, Esc to cancel)
		// Pattern 2: Confirmation/review screen (Enter to confirm/submit, may not have full navigation)
		// Pattern 3: Review your answers screen (shows answers with ❯ Submit answers option)
		const hasQuestionUI =
			/Enter to select.*(?:Tab|Arrow).*(?:navigate|keys).*Esc to cancel/i.test(
				recentOutput,
			) ||
			/(?:review your answers|Do these.*look correct|Submit answers)/i.test(
				recentOutput,
			) ||
			/Enter to (?:confirm|submit|proceed)/i.test(recentOutput);
		if (!hasQuestionUI) return null;

		// Find the question text (line starting with "?")
		const questionMatch = recentOutput.match(/^\s*\?\s+(.+)$/m);
		const question = questionMatch ? questionMatch[1].trim() : "";

		// Detect if this is multi-select by looking for [ ] or [×] checkboxes
		const isMultiSelect = /\[\s*[×x]?\s*\]/.test(recentOutput);

		const options: QuestionOption[] = [];
		const selectedIndices: number[] = [];

		if (isMultiSelect) {
			// Multi-select format: "[ ] Option" or "[×] Option" or "[x] Option"
			// Each line may have a checkbox followed by option text
			const checkboxRegex = /^\s*(\[[×x\s]*\])\s+(.+?)(?:\s{2,}(.+))?$/gm;
			let match;
			let index = 0;

			while ((match = checkboxRegex.exec(recentOutput)) !== null) {
				const checkbox = match[1];
				const label = match[2].trim();
				const description = match[3]?.trim();
				const isChecked = /[×x]/.test(checkbox);

				if (isChecked) {
					selectedIndices.push(index);
				}

				// For multi-select: navigate to option, press space to toggle
				const keySequence: string[] = [];
				// Navigate to the right position
				for (let i = 0; i < index; i++) {
					keySequence.push("down");
				}
				keySequence.push("space"); // Toggle selection

				options.push({
					label,
					description,
					index,
					isSelected: isChecked,
					keySequence,
				});
				index++;
			}
		} else {
			// Single-select format: "❯ Option" (selected) or "  Option" (not selected)
			// Options may have descriptions separated by multiple spaces
			// The ❯ may be indented, and options are aligned
			const lines = recentOutput.split("\n");
			let inOptionSection = false;
			let currentSelectedIndex = 0;
			let index = 0;

			// Check if this is a confirmation/review screen (no numbered options)
			const isConfirmationScreen =
				/(?:review your answers|Do these.*look correct|Submit answers)/i.test(
					recentOutput,
				);

			for (const line of lines) {
				// Skip empty lines and the navigation footer
				if (!line.trim()) continue;
				if (/Enter to (?:select|confirm|submit|proceed)/i.test(line)) break;

				// Check if this line is an option (with ❯ cursor or aligned unselected)
				// Normal format: "❯ 1. Label" or "  2. Label" (number prefix required)
				// Confirmation format: "❯ Submit answers" or "  Edit answers" (no numbers)
				let selectedMatch = line.match(/^\s*❯\s+(\d+\.\s+.+?)(?:\s{2,}(.+))?$/);
				let unselectedMatch = line.match(
					/^\s{2,}(\d+\.\s+.+?)(?:\s{2,}(.+))?$/,
				);

				// For confirmation screens, also match options WITHOUT number prefixes
				if (!selectedMatch && !unselectedMatch && isConfirmationScreen) {
					// Confirmation screen options: "❯ Submit answers" or "  Edit answers"
					selectedMatch = line.match(/^\s*❯\s+([A-Z][a-z]+(?:\s+[a-z]+)*)\s*$/);
					unselectedMatch = line.match(
						/^\s{2,}([A-Z][a-z]+(?:\s+[a-z]+)*)\s*$/,
					);
				}

				if (selectedMatch) {
					inOptionSection = true;
					const label = selectedMatch[1].trim();
					const description = selectedMatch[2]?.trim();
					currentSelectedIndex = index;

					// For single-select: navigate and press enter
					const keySequence: string[] = [];
					// Since this is already selected, just press enter
					keySequence.push("enter");

					options.push({
						label,
						description,
						index,
						isSelected: true,
						keySequence,
					});
					index++;
				} else if (unselectedMatch && inOptionSection) {
					const label = unselectedMatch[1].trim();
					const description = unselectedMatch[2]?.trim();

					// Skip if this looks like the question line or other non-option content
					if (label.length > 60 || /^\?/.test(label)) continue;
					// Skip lines that look like hints or navigation instructions
					if (/^(Enter|Tab|Arrow|Esc|Space)/i.test(label)) continue;

					// Navigate down from current position, then press enter
					const keySequence: string[] = [];
					const stepsDown = index - currentSelectedIndex;
					for (let i = 0; i < stepsDown; i++) {
						keySequence.push("down");
					}
					keySequence.push("enter");

					options.push({
						label,
						description,
						index,
						isSelected: false,
						keySequence,
					});
					index++;
				}
			}
		}

		// Only return if we found valid options
		if (options.length === 0) return null;

		return {
			question,
			options,
			isMultiSelect,
			selectedIndices,
		};
	});

	// Detect JAT workflow state from structured markers in output
	// Markers: [JAT:READY actions=...], [JAT:WORKING task=...], [JAT:IDLE actions=...]
	const detectedWorkflowCommands = $derived.by((): WorkflowCommand[] => {
		if (!output) return [];

		// Only look at the last ~3000 characters (recent output)
		const recentOutput = output.slice(-3000);

		const commands: WorkflowCommand[] = [];

		// Check for structured JAT markers (most reliable detection)
		const readyMatch = recentOutput.match(/\[JAT:READY actions=([^\]]+)\]/);
		const workingMatch = recentOutput.match(/\[JAT:WORKING task=([^\]]+)\]/);
		const idleMatch = recentOutput.match(/\[JAT:IDLE actions=([^\]]+)\]/);

		// If WORKING marker is more recent than READY/IDLE, agent is actively working
		if (workingMatch) {
			const workingIndex = recentOutput.lastIndexOf("[JAT:WORKING");
			const readyIndex = recentOutput.lastIndexOf("[JAT:READY");
			const idleIndex = recentOutput.lastIndexOf("[JAT:IDLE");

			// If WORKING is the most recent marker, no workflow buttons
			if (workingIndex > readyIndex && workingIndex > idleIndex) {
				return [];
			}
		}

		// Parse READY marker actions
		if (readyMatch) {
			const readyIndex = recentOutput.lastIndexOf("[JAT:READY");
			const workingIndex = recentOutput.lastIndexOf("[JAT:WORKING");

			// Only use READY if it's more recent than WORKING
			if (readyIndex > workingIndex) {
				const actions = readyMatch[1].split(",").map((a) => a.trim());

				if (actions.includes("complete")) {
					commands.push({
						command: "/jat:complete",
						label: "Done",
						description: "Complete this task and see menu",
						variant: "success",
					});
				}
				// Note: /jat:next removed from UI - one agent = one session = one task model
			}
		}

		// Parse IDLE marker actions
		if (idleMatch && commands.length === 0) {
			const idleIndex = recentOutput.lastIndexOf("[JAT:IDLE");
			const workingIndex = recentOutput.lastIndexOf("[JAT:WORKING");

			if (idleIndex > workingIndex) {
				const actions = idleMatch[1].split(",").map((a) => a.trim());

				if (actions.includes("start")) {
					commands.push({
						command: "/jat:start",
						label: "Start",
						description: "Pick up a task",
						variant: "primary",
					});
				}
			}
		}

		// Fallback: detect old-style patterns if no markers found (only for /jat:complete)
		if (commands.length === 0) {
			const hasNextStepsContext =
				/next\s*steps?:/i.test(recentOutput) &&
				/\/jat:complete\b/.test(recentOutput);

			const hasResumedWork =
				/\[JAT:WORKING/.test(recentOutput) ||
				/Get to work!/i.test(recentOutput) ||
				/╔.*STARTING WORK/i.test(recentOutput);

			if (hasNextStepsContext && !hasResumedWork) {
				// Note: /jat:next removed from UI - one agent = one session = one task model
				if (/\/jat:complete\b/.test(recentOutput)) {
					commands.push({
						command: "/jat:complete",
						label: "Done",
						description: "Complete this task",
						variant: "success",
					});
				}
			}
		}

		return commands;
	});

	/**
	 * Session State - Determines what to show in the header
	 *
	 * States (see SessionState type in statusColors.ts):
	 * - 'starting': Task assigned, agent initializing (no [JAT:WORKING] marker yet)
	 * - 'working': Has active in_progress task with [JAT:WORKING] marker
	 * - 'compacting': Context compaction in progress (via PreCompact hook)
	 * - 'needs-input': Agent blocked, needs user to provide clarification (orange)
	 * - 'ready-for-review': Work done, awaiting user review (yellow)
	 * - 'completing': User triggered /jat:complete, agent running completion steps (teal)
	 * - 'completed': Task was closed, showing completion summary (green)
	 * - 'recovering': Automation rule triggered recovery action (cyan)
	 * - 'idle': No task, new session (gray)
	 */
	const sessionState = $derived.by((): SessionState => {
		// Check for recovering state first (automation rule triggered recovery)
		// This takes priority over other states to show the user that recovery is in progress
		if (isRecovering) {
			return "recovering";
		}

		// Rich signal payload is the most authoritative source for certain states
		// These states persist based on the signal type, not a short TTL, because:
		// 1. "completing" - the task closes during this state, so no task prop will be available
		// 2. "completed" - similar, task is closed
		// 3. "idle" - explicitly signaled by agent, should persist
		// Use a longer TTL (60s) for these signal-driven states since signals are emitted explicitly
		const SIGNAL_DRIVEN_TTL_MS = 60000;
		const signalDrivenStates: SessionState[] = [
			"completing",
			"completed",
			"idle",
		];
		if (
			richSignalPayload?.type &&
			signalDrivenStates.includes(richSignalPayload.type as SessionState)
		) {
			const timestamp = richSignalPayloadTimestamp || 0;
			if (Date.now() - timestamp < SIGNAL_DRIVEN_TTL_MS) {
				return richSignalPayload.type as SessionState;
			}
		}

		// If we have an SSE state, check if it should be used
		// "completed" state persists until task changes (no TTL) - this ensures completion UI stays visible
		// Other states use 5-second TTL for real-time responsiveness
		const SSE_STATE_TTL_MS = 5000;
		const validStates: SessionState[] = [
			"starting",
			"working",
			"compacting",
			"needs-input",
			"ready-for-review",
			"completing",
			"completed",
			"auto-proceeding",
			"recovering",
			"idle",
		];

		if (sseState && validStates.includes(sseState as SessionState)) {
			// "completed" and "auto-proceeding" states should persist - they indicate terminal states
			// that are handled by the API (session cleanup, next task spawn)
			if (sseState === "completed" || sseState === "auto-proceeding") {
				return sseState as SessionState;
			}
			// Other states use TTL for freshness
			if (
				sseStateTimestamp &&
				Date.now() - sseStateTimestamp < SSE_STATE_TTL_MS
			) {
				return sseState as SessionState;
			}
		}

		// Fall back to parsing output for state detection
		// Check for markers in recent output
		const recentOutput = output ? output.slice(-3000) : "";

		// Find LAST position of each marker type (most recent wins)
		// This allows state transitions: needs-input → working → review → completed
		const findLastPos = (patterns: RegExp[]): number => {
			let maxPos = -1;
			for (const pattern of patterns) {
				const match = recentOutput.match(new RegExp(pattern.source, "g"));
				if (match) {
					const lastMatch = match[match.length - 1];
					const pos = recentOutput.lastIndexOf(lastMatch);
					if (pos > maxPos) maxPos = pos;
				}
			}
			return maxPos;
		};

		// Find last position of each marker type
		// Include Claude Code's native AskUserQuestion UI patterns
		const needsInputPos = findLastPos([
			/\[JAT:NEEDS_INPUT\]/,
			/❓\s*NEED CLARIFICATION/,
			// Claude Code's native question UI patterns
			/Enter to select.*Tab\/Arrow keys to navigate.*Esc to cancel/,
			/\[ \].*\n.*\[ \]/, // Multiple checkbox options
			/Type something\s*\n\s*Next/, // "Type something" option in questions
		]);
		const workingPos = findLastPos([/\[JAT:WORKING\s+task=/]);
		const reviewPos = findLastPos([
			/\[JAT:NEEDS_REVIEW\]/,
			/\[JAT:READY\s+actions=/,
			/🔍\s*READY FOR REVIEW/,
			// Natural language patterns indicating agent is presenting work for review
			/ready to mark.*complete/i,
			/want me to mark.*complete/i,
			/shall I mark.*complete/i,
			/mark.*as complete\??/i,
			/should I.*complete.*task/i,
			// Patterns for when agent completes substantial work and presents it
			/let me know (?:if|when|what)/i,
			/please (?:review|check|look at|see)/i,
			/i['']?ve (?:completed|finished|created|implemented|updated|fixed|added|written|built)/i,
			/(?:changes|updates|fixes|implementation|feature|analysis|document|code) (?:is|are|has been|have been) (?:done|ready|complete|finished)/i,
			/task (?:is )?(?:done|complete|finished)/i,
			/work (?:is )?(?:done|complete|finished)/i,
			/that['']?s (?:it|all|everything|done)/i,
			/run.*\/jat:complete/i, // Agent suggesting to run complete command
		]);
		const completingPos = findLastPos([
			// Triggered when user runs /jat:complete command
			/jat:complete is running/i,
			/✅\s*Marking task complete/i,
			/Committing changes/i,
		]);
		const compactingPos = findLastPos([
			// Triggered by PreCompact hook - context compaction in progress
			/\[JAT:COMPACTING\]/,
		]);

		// Boolean flags for no-task state checking
		const hasCompletionMarker =
			/\[JAT:IDLE\]/.test(recentOutput) ||
			/✅\s*TASK COMPLETE/.test(recentOutput);
		const hasReadyForReviewMarker = reviewPos >= 0;

		// Autopilot marker - can proceed automatically (future: trigger auto-spawn)
		const hasAutoProceedMarker = /\[JAT:AUTO_PROCEED\]/.test(recentOutput);

		// Determine state based on most recent marker
		// Priority when positions are equal: completed > review > needs-input > working
		if (task) {
			// Find which marker appeared most recently
			const positions = [
				{ state: "needs-input" as const, pos: needsInputPos },
				{ state: "working" as const, pos: workingPos },
				{ state: "compacting" as const, pos: compactingPos },
				{ state: "ready-for-review" as const, pos: reviewPos },
				{ state: "completing" as const, pos: completingPos },
			].filter((p) => p.pos >= 0);

			if (positions.length > 0) {
				// Sort by position descending (most recent first)
				positions.sort((a, b) => b.pos - a.pos);
				return positions[0].state;
			}

			// No markers found - check Beads task status
			// If task is in_progress in Beads, agent is working (handles resumed sessions after context compaction)
			// Otherwise, agent is still starting/initializing
			if (task.status === "in_progress") {
				return "working";
			}
			return "starting";
		}

		// No active task - check if we just completed something
		if (lastCompletedTask) {
			// Show completed state if we have recent completion evidence
			if (hasCompletionMarker || hasReadyForReviewMarker) {
				return "completed";
			}

			// If the lastCompletedTask was updated recently, still show completed state
			if (lastCompletedTask.closedAt) {
				const closedDate = new Date(lastCompletedTask.closedAt);
				const now = new Date();
				const hoursSinceClosed =
					(now.getTime() - closedDate.getTime()) / (1000 * 60 * 60);
				if (hoursSinceClosed < 2) {
					return "completed";
				}
			}
		}

		return "idle";
	});

	// Start/stop question polling based on sessionState
	// Only poll when session is in needs-input state to reduce request load
	// With 15 sessions, this prevents 15 * 2 req/sec = 30 req/sec when most sessions don't need it
	$effect(() => {
		const needsQuestionPolling = sessionState === "needs-input";

		if (needsQuestionPolling && !questionPollInterval) {
			// Start polling when entering needs-input state
			fetchQuestionData().catch(() => {}); // Immediate fetch (catch timeout errors)
			questionPollInterval = setInterval(
				() => fetchQuestionData().catch(() => {}),
				1500,
			); // 1.5s interval (was 500ms)
		} else if (!needsQuestionPolling && questionPollInterval) {
			// Stop polling when leaving needs-input state
			clearInterval(questionPollInterval);
			questionPollInterval = null;
		}
	});

	// Start/stop custom question polling based on sessionState
	// Custom questions come from jat-signal question command (separate from AskUserQuestion tool)
	$effect(() => {
		const needsCustomQuestionPolling = sessionState === "needs-input";

		if (needsCustomQuestionPolling && !customQuestionPollInterval) {
			// Start polling when entering needs-input state
			fetchCustomQuestionData().catch(() => {}); // Immediate fetch
			customQuestionPollInterval = setInterval(
				() => fetchCustomQuestionData().catch(() => {}),
				1500,
			);
		} else if (!needsCustomQuestionPolling && customQuestionPollInterval) {
			// Stop polling when leaving needs-input state
			clearInterval(customQuestionPollInterval);
			customQuestionPollInterval = null;
			// Also clear custom question data when leaving needs-input
			customQuestionData = null;
			customQuestionTimeout = null;
			stopCustomQuestionTimeoutCountdown();
		}
	});

	// Fetch next task when session enters completed state
	// This populates the "Start Next" action in the dropdown with actual task info
	$effect(() => {
		if (
			sessionState === "completed" &&
			!nextTaskInfo &&
			!nextTaskLoading &&
			!nextTaskFetchFailed
		) {
			fetchNextTask().catch(() => {}); // Catch any unhandled promise rejections
		} else if (sessionState !== "completed") {
			// Clear next task info and reset failed flag when leaving completed state
			nextTaskInfo = null;
			nextTaskFetchFailed = false;
		}
	});

	// Auto-complete effect: When session enters ready-for-review and review rules say 'auto',
	// automatically trigger /jat:complete without user intervention.
	// This enables low-priority work (e.g., P4 chores) to complete without clicks.
	$effect(() => {
		// Only trigger in agent mode (not server mode)
		if (!isAgentMode) return;

		// Only trigger when entering ready-for-review state
		if (sessionState !== "ready-for-review") {
			// Reset the trigger flag when leaving ready-for-review
			// This allows auto-complete to trigger again on next review cycle
			if (autoCompleteTriggered) {
				autoCompleteTriggered = false;
			}
			return;
		}

		// Check review rules - if 'auto', trigger completion automatically
		if (reviewStatus?.action === "auto" && !autoCompleteTriggered) {
			autoCompleteTriggered = true;
			console.log(
				`[SessionCard] Auto-completing ${sessionName} (review rules: auto for ${reviewStatus.reason})`,
			);

			// Track intent so sessionEvents knows to auto-kill when signal arrives
			setPendingAutoKill(sessionName, true);

			// Brief delay so user sees the state transition in the UI
			setTimeout(async () => {
				try {
					await sendWorkflowCommand("/jat:complete --kill");
				} catch (error) {
					console.error("[SessionCard] Auto-complete failed:", error);
					// Reset flag so user can manually complete
					autoCompleteTriggered = false;
				}
			}, 500);
		}
	});

	// Poll for signal data (human actions) in agent mode only
	// Signal data comes from jat-signal action command via PostToolUse hook
	// Poll every 3 seconds - signals are written once and persist until cleared
	$effect(() => {
		// Only poll in agent/compact mode (not server mode)
		if (!isAgentMode) return;

		// Start polling on mount
		if (!signalPollInterval) {
			fetchSignalData().catch(() => {}); // Immediate fetch (catch timeout errors)
			signalPollInterval = setInterval(
				() => fetchSignalData().catch(() => {}),
				3000,
			);
		}

		// Cleanup on unmount (effect cleanup function)
		return () => {
			if (signalPollInterval) {
				clearInterval(signalPollInterval);
				signalPollInterval = null;
			}
		};
	});

	// Detect dormant state (session that has been inactive for a while)
	// Dormant shows 💤 icon to indicate "sleeping/stalled/user away"
	// Different thresholds for different states:
	// - completed: 5 minutes since task closed (session needs cleanup)
	// - working: 10 minutes of no output (agent may be stalled)
	// - needs-input: 15 minutes of no activity (user is away)
	// - ready-for-review: 15 minutes of no activity (user is away)
	const DORMANT_THRESHOLDS = {
		completed: 5, // 5 minutes after task closed
		working: 10, // 10 minutes of no output
		"needs-input": 15, // 15 minutes waiting for user
		"ready-for-review": 15, // 15 minutes waiting for user
	} as const;

	const isDormant = $derived.by((): boolean => {
		// Only certain states can become dormant
		const threshold =
			DORMANT_THRESHOLDS[sessionState as keyof typeof DORMANT_THRESHOLDS];
		if (!threshold) return false;

		const now = currentTime; // Use reactive currentTime for live updates

		// For completed state, use the task closed timestamp
		if (sessionState === "completed") {
			if (!lastCompletedTask?.closedAt) return false;
			const closedDate = new Date(lastCompletedTask.closedAt);
			const minutesSinceClosed = (now - closedDate.getTime()) / (1000 * 60);
			return minutesSinceClosed >= threshold;
		}

		// For other states, use activity-based detection (time since last output change)
		const minutesSinceActivity = (now - lastActivityTime) / (1000 * 60);
		return minutesSinceActivity >= threshold;
	});

	// Check if auto-proceed mode is active (for future autopilot feature)
	const isAutoProceed = $derived(
		output ? /\[JAT:AUTO_PROCEED\]/.test(output.slice(-3000)) : false,
	);

	// Get auto-kill countdown for this session (null if not scheduled)
	let autoKillCountdownValue = $state<number | null>(null);

	// Subscribe to auto-kill countdowns store
	$effect(() => {
		const unsubscribe = autoKillCountdowns.subscribe(map => {
			autoKillCountdownValue = map.get(sessionName) ?? null;
		});
		return unsubscribe;
	});

	// Detect human action markers in output and from signal API
	// Sources:
	// 1. Terminal markers: [JAT:HUMAN_ACTION {"title":"...","description":"..."}]
	// 2. Signal API: jat-signal action '{"title":"...","items":[...]}'
	// Uses unified marker parser with balanced-brace JSON extraction
	interface HumanAction {
		title: string;
		description: string;
		completed: boolean;
	}

	let humanActionCompletedState = $state<Map<string, boolean>>(new Map());

	const detectedHumanActions = $derived.by((): HumanAction[] => {
		const actions: HumanAction[] = [];

		// Source: Signal API actions (jat-signal action command)
		// Human actions are delivered via the jat-signal hook system
		if (signalActionData) {
			// If signal has items array, each item is a separate action
			if (signalActionData.items && signalActionData.items.length > 0) {
				for (const item of signalActionData.items) {
					actions.push({
						title: item,
						description: "",
						completed: humanActionCompletedState.get(item) || false,
					});
				}
			}
			// If signal has title only (no items), use title as single action
			else if (signalActionData.title && !signalActionData.items) {
				actions.push({
					title: signalActionData.title,
					description: signalActionData.description || "",
					completed:
						humanActionCompletedState.get(signalActionData.title) || false,
				});
			}
		}

		return actions;
	});

	// Toggle completion state of a human action
	function toggleHumanAction(actionTitle: string) {
		const newState = new Map(humanActionCompletedState);
		newState.set(actionTitle, !newState.get(actionTitle));
		humanActionCompletedState = newState;
	}

	// Count of pending human actions
	const pendingHumanActionsCount = $derived(
		detectedHumanActions.filter((a) => !a.completed).length,
	);

	// ==========================================================================
	// Suggested Tasks Detection
	// ==========================================================================
	// Suggested tasks are delivered via the jat-signal hook system (SSE).
	// See shared/signals.md for signal system documentation.

	/** Extended SuggestedTask with local UI state for selection and editing */
	interface SuggestedTaskWithState extends SuggestedTask {
		/** Whether this task is selected for creation */
		selected: boolean;
		/** Whether user has edited this task */
		edited: boolean;
		/** Whether this task already exists in Beads (matched by title) */
		alreadyCreated?: boolean;
		/** Task ID if this task was already created (for displaying clickable badge) */
		taskId?: string;
		/** Local edits (if edited=true, these override the original values) */
		edits?: {
			type?: string;
			title?: string;
			description?: string;
			priority?: number;
			project?: string;
			labels?: string;
			depends_on?: string[];
		};
	}

	// Local state for tracking user's selection and edits of suggested tasks
	// Key is task title (or index if no title), value is selection/edit state
	let suggestedTaskSelections = $state<Map<string, boolean>>(new Map());
	let suggestedTaskEdits = $state<Map<string, Partial<SuggestedTask>>>(
		new Map(),
	);

	/**
	 * Process SUGGESTED_TASKS from signal data (via SSE).
	 * Signal data comes directly from the jat-signal hook without terminal parsing.
	 */
	const detectedSuggestedTasks = $derived.by((): SuggestedTaskWithState[] => {
		// Reference version counter to ensure this derived re-runs when titles are fetched
		// Without this, Svelte may not detect changes to the Set contents
		const _titlesVersion = existingTaskTitlesVersion;

		// Only process signal-based suggested tasks
		if (
			!signalSuggestedTasks ||
			signalSuggestedTasks.length === 0 ||
			!signalSuggestedTasksTimestamp
		) {
			return [];
		}

		// Use longer TTL since suggested tasks wait for user action
		const ageMs = Date.now() - signalSuggestedTasksTimestamp;
		if (ageMs >= SIGNAL_TTL.USER_WAITING_MS) {
			return [];
		}

		// Map signal tasks to tasks with local UI state
		return signalSuggestedTasks.map((task, index) => {
			const key = task.title || `task-${index}`;
			const isSelected = suggestedTaskSelections.get(key) ?? false;
			const edits = suggestedTaskEdits.get(key);
			const hasEdits = edits && Object.keys(edits).length > 0;

			// Check if task title already exists in Beads (normalized comparison)
			const effectiveTitle = hasEdits && edits.title ? edits.title : task.title;
			const normalizedTitle = effectiveTitle?.toLowerCase().trim() || "";
			const existingTaskId = normalizedTitle
				? existingTaskTitles.get(normalizedTitle)
				: undefined;
			const alreadyCreated = !!existingTaskId;

			return {
				...task,
				// Apply edits if present
				...(hasEdits
					? {
							type: edits.type ?? task.type,
							title: edits.title ?? task.title,
							description: edits.description ?? task.description,
							priority: edits.priority ?? task.priority,
						}
					: {}),
				selected: isSelected,
				edited: hasEdits ?? false,
				alreadyCreated,
				taskId: existingTaskId,
			};
		});
	});

	/** Toggle selection state of a suggested task */
	function toggleSuggestedTaskSelection(taskKey: string) {
		const newSelections = new Map(suggestedTaskSelections);
		newSelections.set(taskKey, !newSelections.get(taskKey));
		suggestedTaskSelections = newSelections;
	}

	/** Update edits for a suggested task */
	function updateSuggestedTaskEdit(
		taskKey: string,
		edits: Partial<SuggestedTask>,
	) {
		const newEdits = new Map(suggestedTaskEdits);
		const existing = newEdits.get(taskKey) || {};
		newEdits.set(taskKey, { ...existing, ...edits });
		suggestedTaskEdits = newEdits;
	}

	/** Clear all edits for a suggested task */
	function clearSuggestedTaskEdits(taskKey: string) {
		const newEdits = new Map(suggestedTaskEdits);
		newEdits.delete(taskKey);
		suggestedTaskEdits = newEdits;
	}

	/** Get the key for a suggested task (for state tracking) */
	function getSuggestedTaskKey(task: SuggestedTask, index: number): string {
		return task.title || `task-${index}`;
	}

	/** Count of selected suggested tasks */
	const selectedSuggestedTasksCount = $derived(
		detectedSuggestedTasks.filter((t) => t.selected).length,
	);

	/** Check if any suggested tasks are detected */
	const hasSuggestedTasks = $derived(detectedSuggestedTasks.length > 0);

	/** Whether task creation is in progress */
	let isCreatingSuggestedTasks = $state(false);

	/** Results of task creation - for inline feedback */
	interface TaskCreationResult {
		title: string;
		taskId?: string;
		success: boolean;
		error?: string;
	}
	let createResults = $state<{
		success: TaskCreationResult[];
		failed: TaskCreationResult[];
	}>({
		success: [],
		failed: [],
	});

	/** Show results feedback */
	let showCreateFeedback = $state(false);

	/** Create selected suggested tasks by calling /api/tasks/bulk endpoint */
	async function createSuggestedTasks(
		selectedTasks: typeof detectedSuggestedTasks,
	) {
		if (selectedTasks.length === 0) return;

		isCreatingSuggestedTasks = true;
		createResults = { success: [], failed: [] };

		// Map tasks to the bulk API format
		const tasksToCreate = selectedTasks.map((t) => ({
			type: t.edits?.type || t.type || "task",
			title: t.edits?.title || t.title,
			description: t.edits?.description || t.description || "",
			priority: t.edits?.priority ?? t.priority ?? 2,
		}));

		// Determine project from parent task ID
		const parentTaskId = task?.id || displayTask?.id;
		const project = parentTaskId
			? getProjectFromTaskId(parentTaskId)
			: undefined;

		// Get epic ID if we're in epic execution mode - suggested tasks will be linked to the epic
		const epicId = epicIsActive() ? getEpicId() : null;

		console.log("[SuggestedTasks] Creating tasks via bulk API:", {
			count: selectedTasks.length,
			project,
			parentTaskId,
			epicId,
		});

		try {
			const response = await fetch("/api/tasks/bulk", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tasks: tasksToCreate,
					project: project || undefined,
					epicId: epicId || undefined,
				}),
			});

			const result = await response.json();

			if (!response.ok) {
				// API returned an error
				createResults.failed = tasksToCreate.map((t) => ({
					title: t.title,
					success: false,
					error: result.message || "Failed to create tasks",
				}));
				console.error("[SuggestedTasks] Bulk creation failed:", result);
			} else {
				// Process individual results
				if (result.results && Array.isArray(result.results)) {
					createResults.success = result.results.filter(
						(r: TaskCreationResult) => r.success,
					);
					createResults.failed = result.results.filter(
						(r: TaskCreationResult) => !r.success,
					);
				} else {
					// Fallback for successful response without detailed results
					createResults.success = tasksToCreate.map((t) => ({
						title: t.title,
						success: true,
					}));
				}
				console.log(
					`[SuggestedTasks] Created ${result.created} tasks, ${result.failed} failed`,
				);
			}

			// Show feedback
			showCreateFeedback = true;

			// Play success sound and show toast if any tasks were created
			if (createResults.success.length > 0) {
				playNewTaskChime();
				successToast(
					`Created ${createResults.success.length} task${createResults.success.length > 1 ? "s" : ""}`,
					createResults.success
						.map((r) => r.taskId)
						.filter(Boolean)
						.join(", "),
				);
				// Refresh existing task titles so newly created tasks show as "Created"
				await fetchExistingTaskTitles();
			}

			// If all succeeded, clear selections after a short delay
			if (createResults.failed.length === 0) {
				setTimeout(() => {
					suggestedTaskSelections = new Map();
					suggestedTaskEdits = new Map();
					showCreateFeedback = false;
				}, 2500);
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : "Network error";
			createResults.failed = tasksToCreate.map((t) => ({
				title: t.title,
				success: false,
				error: errorMsg,
			}));
			showCreateFeedback = true;
			console.error("[SuggestedTasks] Error creating tasks:", error);
		} finally {
			isCreatingSuggestedTasks = false;
		}
	}

	/** Dismiss the creation feedback message */
	function dismissCreateFeedback() {
		showCreateFeedback = false;
		// Clear selections if there were no failures
		if (createResults.failed.length === 0) {
			suggestedTaskSelections = new Map();
			suggestedTaskEdits = new Map();
		}
	}

	/** Create suggested tasks directly via bulk API (used by modal) */
	async function createSuggestedTasksViaBulkApi(
		selectedTasks: SuggestedTaskWithState[],
	): Promise<void> {
		if (selectedTasks.length === 0) return;

		// Determine default project from current task ID if available
		const currentTaskId = task?.id || displayTask?.id;
		const defaultProject = currentTaskId
			? getProjectFromTaskId(currentTaskId)
			: undefined;

		// Map tasks to the bulk API format, including all editable fields
		const tasksToCreate = selectedTasks.map((t) => ({
			type: t.edits?.type || t.type || "task",
			title: t.edits?.title || t.title,
			description: t.edits?.description || t.description || "",
			priority: t.edits?.priority ?? t.priority ?? 2,
			// Use task-specific project if set, otherwise use default from current task
			project: t.edits?.project || t.project || defaultProject || undefined,
			labels: t.edits?.labels || t.labels || undefined,
			depends_on: t.edits?.depends_on || t.depends_on || undefined,
		}));

		// Get epic ID if we're in epic execution mode - suggested tasks will be linked to the epic
		const epicId = epicIsActive() ? getEpicId() : null;

		const response = await fetch("/api/tasks/bulk", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				tasks: tasksToCreate,
				epicId: epicId || undefined,
			}),
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.message || "Failed to create tasks");
		}

		const result = await response.json();
		if (result.failed > 0) {
			throw new Error(
				`Created ${result.created} tasks, but ${result.failed} failed`,
			);
		}

		console.log(
			`[SuggestedTasks] Created ${result.created} tasks via bulk API`,
		);

		// Refresh existing task titles so newly created tasks show as "Created"
		await fetchExistingTaskTitles();
	}

	/** Create tasks from EventStack timeline events - returns results for feedback UI */
	async function createTimelineEventTasks(
		selectedTasks: SuggestedTaskWithState[],
	): Promise<{ success: any[]; failed: any[] }> {
		if (selectedTasks.length === 0) {
			return { success: [], failed: [] };
		}

		// Determine default project from current task ID if available
		const currentTaskId = task?.id || displayTask?.id;
		const defaultProject = currentTaskId
			? getProjectFromTaskId(currentTaskId)
			: undefined;

		// Map tasks to the bulk API format
		const tasksToCreate = selectedTasks.map((t) => ({
			type: t.edits?.type || t.type || "task",
			title: t.edits?.title || t.title,
			description: t.edits?.description || t.description || "",
			priority: t.edits?.priority ?? t.priority ?? 2,
			project: t.edits?.project || t.project || defaultProject || undefined,
			labels: t.edits?.labels || t.labels || undefined,
			depends_on: t.edits?.depends_on || t.depends_on || undefined,
		}));

		// Get epic ID if we're in epic execution mode - suggested tasks will be linked to the epic
		const epicId = epicIsActive() ? getEpicId() : null;

		try {
			const response = await fetch("/api/tasks/bulk", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tasks: tasksToCreate, epicId: epicId || undefined }),
			});

			const result = await response.json();

			if (!response.ok) {
				return {
					success: [],
					failed: tasksToCreate.map((t) => ({
						title: t.title,
						success: false,
						error: result.message || "API error",
					})),
				};
			}

			// Parse results - bulk API returns { success, results, created, failed, message }
			// results is an array of { title, taskId?, success, error? }
			const successTasks = (result.results || [])
				.filter((t: any) => t.success)
				.map((t: any) => ({
					title: t.title,
					taskId: t.taskId,
					success: true,
				}));

			const failedTasks = (result.results || [])
				.filter((t: any) => !t.success)
				.map((t: any) => ({
					title: t.title || "Unknown",
					success: false,
					error: t.error || "Unknown error",
				}));

			console.log(
				`[EventStack] Created ${successTasks.length} tasks, ${failedTasks.length} failed`,
			);

			return { success: successTasks, failed: failedTasks };
		} catch (err: any) {
			return {
				success: [],
				failed: [{ title: "Error", success: false, error: err.message }],
			};
		}
	}

	/** Create tasks AND spawn agent sessions for each - returns results for feedback UI */
	async function createAndStartTimelineEventTasks(
		selectedTasks: SuggestedTaskWithState[],
	): Promise<{ success: any[]; failed: any[] }> {
		// First, create the tasks
		const createResult = await createTimelineEventTasks(selectedTasks);

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

				const spawnResponse = await fetch("/api/work/spawn", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ taskId: createdTask.taskId }),
				});

				const spawnData = await spawnResponse.json();

				if (spawnResponse.ok && spawnData.agentName) {
					spawnResults.success.push({
						...createdTask,
						agentName: spawnData.agentName,
						spawned: true,
					});
					console.log(
						`[EventStack] Spawned agent ${spawnData.agentName} for task ${createdTask.taskId}`,
					);
				} else {
					spawnResults.success.push({
						...createdTask,
						spawnError: spawnData.message || "Spawn failed",
					});
					console.warn(
						`[EventStack] Created task ${createdTask.taskId} but spawn failed:`,
						spawnData.message,
					);
				}
			} catch (err: any) {
				spawnResults.success.push({
					...createdTask,
					spawnError: err.message,
				});
				console.warn(
					`[EventStack] Created task ${createdTask.taskId} but spawn failed:`,
					err.message,
				);
			}
		}

		return spawnResults;
	}

	// Task to display - either active task or last completed task
	// Show lastCompletedTask in most states to maintain task linkage throughout the session lifecycle
	// During completing/completed states, the task prop may be null (task closed in Beads),
	// so we fall back to extracting task info from the rich signal payload
	const displayTask = $derived.by(() => {
		if (task) return task;
		if (lastCompletedTask) return lastCompletedTask;

		// Fall back to rich signal payload for task info during completing/completed states
		// This handles the race condition where the task closes before the API poll completes
		if (richSignalPayload?.taskId) {
			return {
				id: richSignalPayload.taskId as string,
				title:
					(richSignalPayload.taskTitle as string) ||
					(richSignalPayload.taskId as string),
				description: richSignalPayload.taskDescription as string | undefined,
				status: "in_progress" as const,
				priority: richSignalPayload.taskPriority as number | undefined,
				issue_type: richSignalPayload.taskType as string | undefined,
			};
		}

		return null;
	});

	// Get visual config from centralized statusColors.ts
	const stateVisual = $derived(
		SESSION_STATE_VISUALS[sessionState] || SESSION_STATE_VISUALS.idle,
	);

	// Get display labels (respects dormant state)
	const displayLabel = $derived(
		isDormant && stateVisual.dormantLabel
			? stateVisual.dormantLabel
			: stateVisual.label,
	);
	const displayShortLabel = $derived(
		isDormant && stateVisual.dormantShortLabel
			? stateVisual.dormantShortLabel
			: stateVisual.shortLabel,
	);

	// Get display colors (muted when dormant)
	const displayAccent = $derived(
		isDormant && stateVisual.dormantAccent
			? stateVisual.dormantAccent
			: stateVisual.accent,
	);
	const displayBgTint = $derived(
		isDormant && stateVisual.dormantBgTint
			? stateVisual.dormantBgTint
			: stateVisual.bgTint,
	);
	const displayGlow = $derived(
		isDormant && stateVisual.dormantGlow
			? stateVisual.dormantGlow
			: stateVisual.glow,
	);

	// Format time since activity for dormant tooltip
	const dormantTooltip = $derived.by((): string | null => {
		if (!isDormant) return null;

		const now = currentTime;
		let minutesInactive: number;

		if (sessionState === "completed" && lastCompletedTask?.closedAt) {
			const closedDate = new Date(lastCompletedTask.closedAt);
			minutesInactive = Math.floor((now - closedDate.getTime()) / (1000 * 60));
		} else {
			minutesInactive = Math.floor((now - lastActivityTime) / (1000 * 60));
		}

		if (minutesInactive < 1) {
			return "Inactive for less than a minute";
		} else if (minutesInactive === 1) {
			return "Inactive for 1 minute";
		} else if (minutesInactive < 60) {
			return `Inactive for ${minutesInactive} minutes`;
		} else {
			const hours = Math.floor(minutesInactive / 60);
			const mins = minutesInactive % 60;
			if (mins === 0) {
				return `Inactive for ${hours} hour${hours > 1 ? "s" : ""}`;
			}
			return `Inactive for ${hours}h ${mins}m`;
		}
	});

	/**
	 * Copy session contents to clipboard
	 * Formats a comprehensive summary including:
	 * - Agent mode: Agent name, session state, task info
	 * - Server mode: Project name, port, server status
	 * - Terminal output (stripped of ANSI codes)
	 */
	async function copySessionContents() {
		const lines: string[] = [];
		const separator = "─".repeat(50);

		// Header
		lines.push(`Session: ${sessionName}`);
		lines.push(separator);

		if (isServerMode) {
			// Server mode info
			if (displayName || projectName) {
				lines.push(`Server: ${displayName || projectName}`);
			}
			if (port) {
				lines.push(`Port: ${port}${portRunning ? " (running)" : " (stopped)"}`);
			}
			if (serverStatus) {
				lines.push(`Status: ${serverStatus}`);
			}
			if (command) {
				lines.push(`Command: ${command}`);
			}
			if (projectPath) {
				lines.push(`Path: ${projectPath}`);
			}
			// Server uptime
			const serverElapsed = serverElapsedFormatted();
			if (serverElapsed) {
				const timeStr = serverElapsed.showHours
					? `${serverElapsed.hours}:${serverElapsed.minutes}:${serverElapsed.seconds}`
					: `${serverElapsed.minutes}:${serverElapsed.seconds}`;
				lines.push(`Uptime: ${timeStr}`);
			}
		} else {
			// Agent mode info
			if (agentName) {
				lines.push(`Agent: ${agentName}`);
			}
			lines.push(`State: ${sessionState}`);
			if (startTime) {
				const elapsed = elapsedTimeFormatted();
				if (elapsed) {
					const timeStr = elapsed.showHours
						? `${elapsed.hours}:${elapsed.minutes}:${elapsed.seconds}`
						: `${elapsed.minutes}:${elapsed.seconds}`;
					lines.push(`Duration: ${timeStr}`);
				}
			}

			// Task info (use displayTask for proper task display)
			if (displayTask) {
				lines.push("");
				lines.push(`Task: ${displayTask.id}`);
				if (displayTask.title) {
					lines.push(`Title: ${displayTask.title}`);
				}
				if (displayTask.status) {
					lines.push(`Status: ${displayTask.status}`);
				}
				if (displayTask.description) {
					lines.push(`Description: ${displayTask.description}`);
				}
			}
		}

		// Terminal output (strip ANSI codes for clean text)
		if (output && output.trim()) {
			lines.push("");
			lines.push(separator);
			lines.push("Terminal Output:");
			lines.push(separator);
			lines.push(stripAnsi(output));
		}

		const text = lines.join("\n");

		try {
			await navigator.clipboard.writeText(text);
			sessionCopied = true;
			playCopySound();
			successToast(
				isServerMode
					? "Server output copied to clipboard"
					: "Session contents copied to clipboard",
			);

			// Clear timeout if exists
			if (sessionCopyTimeout) {
				clearTimeout(sessionCopyTimeout);
			}
			sessionCopyTimeout = setTimeout(() => {
				sessionCopied = false;
			}, 2000);
		} catch (err) {
			console.error("Failed to copy session contents:", err);
		}
	}

	// Capture session log to .beads/logs/ on completion
	async function captureSessionLog() {
		if (logCaptured || !sessionName) return;

		try {
			const response = await fetch(
				`/api/work/${encodeURIComponent(sessionName)}/capture-log`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						taskId: task?.id || displayTask?.id,
					}),
				},
			);

			if (response.ok) {
				const result = await response.json();
				console.log(`[SessionCard] Session log captured: ${result.filename}`);
				logCaptured = true;
			} else {
				const error = await response.json();
				console.warn(
					"[SessionCard] Failed to capture session log:",
					error.message,
				);
			}
		} catch (err) {
			console.error("[SessionCard] Error capturing session log:", err);
		}
	}

	// Track sessionState transitions to trigger sounds and celebration
	$effect(() => {
		// Play sound on state transitions (all modes)
		if (previousSessionState !== sessionState) {
			// Play attention sounds for states that need user action
			if (
				sessionState === "needs-input" &&
				previousSessionState !== "needs-input"
			) {
				playNeedsInputSound();
			} else if (
				sessionState === "ready-for-review" &&
				previousSessionState !== "ready-for-review"
			) {
				playReadyForReviewSound();
			}
		}

		// Detect transition to 'completed' state - celebration and log capture
		if (sessionState === "completed" && previousSessionState !== "completed") {
			// Notify epicQueueStore if we're in an epic execution (triggers auto-spawn for unblocked tasks)
			const taskId = displayTask?.id || lastCompletedTask?.id;
			if (taskId && epicIsActive()) {
				epicCompleteTask(taskId);
			}

			// Capture session log (all modes)
			if (!logCaptured) {
				captureSessionLog();
			}

			// Celebration animation (compact mode only)
			if (isCompactMode && !showCelebration) {
				showCelebration = true;
				playTaskCompleteSound();

				// Fetch actual count of tasks completed today
				fetchTasksCompletedToday().then((count) => {
					tasksCompletedToday = count;
				});

				// Clear any existing timer
				if (celebrationDismissTimer) {
					clearTimeout(celebrationDismissTimer);
				}

				// Auto-dismiss after 4 seconds
				celebrationDismissTimer = setTimeout(() => {
					showCelebration = false;
				}, 4000);
			}
		}
		previousSessionState = sessionState;
	});

	// AUTO_PROCEED handling: Start countdown when session becomes completed with AUTO_PROCEED marker
	$effect(() => {
		// Only trigger on transition to completed state with AUTO_PROCEED
		if (
			sessionState === "completed" &&
			isAutoProceed &&
			!autoCloseHeld &&
			autoCloseCountdown === null
		) {
			// Start 3-second countdown
			autoCloseCountdown = 3;

			// Clear any existing timer
			if (autoCloseTimer) {
				clearInterval(autoCloseTimer);
			}

			autoCloseTimer = setInterval(() => {
				if (autoCloseCountdown !== null && autoCloseCountdown > 0) {
					autoCloseCountdown = autoCloseCountdown - 1;
				}
			}, 1000);
		}

		// Clean up timer if we exit completed state or user holds
		if ((sessionState !== "completed" || autoCloseHeld) && autoCloseTimer) {
			clearInterval(autoCloseTimer);
			autoCloseTimer = null;
			if (autoCloseHeld) {
				autoCloseCountdown = null;
			}
		}
	});

	// Execute auto-close when countdown reaches 0
	$effect(() => {
		if (autoCloseCountdown === 0 && !autoCloseHeld) {
			// Clear the timer
			if (autoCloseTimer) {
				clearInterval(autoCloseTimer);
				autoCloseTimer = null;
			}

			// Note: epicCompleteTask is called when sessionState transitions to 'completed'
			// (see effect at line ~2130), not here. This just handles session cleanup.

			// Call cleanup/kill session
			if (onKillSession) {
				onKillSession();
			}

			// Reset countdown state
			autoCloseCountdown = null;
		}
	});

	// Cancel auto-close countdown (Hold for Review button)
	function holdForReview() {
		autoCloseHeld = true;
		autoCloseCountdown = null;
		if (autoCloseTimer) {
			clearInterval(autoCloseTimer);
			autoCloseTimer = null;
		}
	}

	// Cleanup auto-close timer on unmount
	onDestroy(() => {
		if (autoCloseTimer) {
			clearInterval(autoCloseTimer);
		}
	});

	// Send a workflow command (e.g., /jat:complete)
	async function sendWorkflowCommand(command: string) {
		const startTime = Date.now();
		console.log(
			`[SessionCard] sendWorkflowCommand START: ${command} for ${sessionName}`,
		);

		if (!onSendInput) {
			console.warn(
				"[SessionCard] sendWorkflowCommand: onSendInput is not defined",
			);
			return;
		}
		setSendingInput(true);
		try {
			// Send Ctrl+U first to clear any stray characters in input
			// Note: Previously used Ctrl+C but that sends an interrupt signal which
			// caused issues on Mac Chrome where the terminal would become unresponsive
			console.log(
				`[SessionCard] sendWorkflowCommand: sending ctrl-u to clear line`,
			);
			await onSendInput("ctrl-u", "key");
			await new Promise((r) => setTimeout(r, 50));
			// Send the command text (API appends Enter for type='text')
			console.log(
				`[SessionCard] sendWorkflowCommand: sending text "${command}"`,
			);
			const textResult = await onSendInput(command, "text");
			if (textResult === false) {
				console.warn(
					"[SessionCard] sendWorkflowCommand: Failed to send command text",
				);
				// Don't return early - fall through to finally block to reset sendingInput
			} else {
				// Send extra Enter after delay - Claude Code needs double Enter for slash commands
				await new Promise((r) => setTimeout(r, 100));
				console.log(`[SessionCard] sendWorkflowCommand: sending enter`);
				await onSendInput("enter", "key");
			}
			const duration = Date.now() - startTime;
			console.log(
				`[SessionCard] sendWorkflowCommand DONE: ${command} took ${duration}ms`,
			);
		} catch (err) {
			const duration = Date.now() - startTime;
			console.error(
				`[SessionCard] sendWorkflowCommand ERROR after ${duration}ms:`,
				err,
			);
		} finally {
			setSendingInput(false);
		}
	}

	// Scroll to bottom when output changes (if auto-scroll enabled and user hasn't scrolled up)
	$effect(() => {
		if (autoScroll && !userScrolledUp && scrollContainerRef && output) {
			requestAnimationFrame(() => {
				if (scrollContainerRef) {
					scrollContainerRef.scrollTop = scrollContainerRef.scrollHeight;
				}
			});
		}
	});

	// Sync minimap viewport when output changes
	$effect(() => {
		if (output && minimapRef) {
			requestAnimationFrame(() => syncMinimapViewport());
		}
	});

	// Handle kill session
	async function handleKill() {
		if (!onKillSession) return;
		killLoading = true;
		try {
			await onKillSession();
		} finally {
			killLoading = false;
		}
	}

	// Handle interrupt (Ctrl+C)
	async function handleInterrupt() {
		if (!onInterrupt) return;
		interruptLoading = true;
		try {
			await onInterrupt();
		} finally {
			interruptLoading = false;
		}
	}

	// Handle continue
	async function handleContinue() {
		if (!onContinue) return;
		continueLoading = true;
		try {
			await onContinue();
		} finally {
			continueLoading = false;
		}
	}

	// Toggle auto-scroll
	function toggleAutoScroll() {
		autoScroll = !autoScroll;
		if (autoScroll) {
			userScrolledUp = false; // Reset when user enables auto-scroll
		}
	}

	// Handle status badge actions
	async function handleStatusAction(actionId: string) {
		switch (actionId) {
			case "start-next":
				// Cleanup current session and spawn agent for next task
				try {
					const completedTaskId =
						displayTask?.id || lastCompletedTask?.id || null;
					const response = await fetch("/api/tasks/next", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							completedTaskId,
							cleanupSession: sessionName,
						}),
					});

					if (response.ok) {
						const data = await response.json();
						console.log("[SessionCard] Start Next result:", data);
						// Session will be cleaned up and new agent spawned
						// The work panel will pick up the new session on next poll
					} else {
						const errorData = await response.json();
						console.error("[SessionCard] Start Next failed:", errorData);
					}
				} catch (e) {
					console.error("[SessionCard] Failed to start next task:", e);
				}
				break;

			case "cleanup":
				// Close tmux session and dismiss from UI
				await onKillSession?.();
				break;

			case "view-task":
				// Open task details
				if (displayTask?.id) {
					onTaskClick?.(displayTask.id);
				}
				break;

			case "attach":
				if (sessionName) {
					try {
						await fetch(`/api/work/${encodeURIComponent(sessionName)}/attach`, {
							method: "POST",
						});
					} catch (e) {
						console.error("[SessionCard] Failed to attach terminal:", e);
					}
				}
				break;

			case "complete":
				// Run /jat:complete command (user will review completion block)
				await sendWorkflowCommand("/jat:complete");
				break;

			case "complete-kill":
				// Run /jat:complete --kill command (self-destruct session)
				// Track intent so sessionEvents knows to auto-kill when signal arrives
				setPendingAutoKill(sessionName, true);
				await sendWorkflowCommand("/jat:complete --kill");
				break;

			case "escape":
				// Send escape key
				await sendKey("escape");
				break;

			case "interrupt":
				// Send Ctrl+C
				await sendKey("ctrl-c");
				break;

			case "start":
				// Run /jat:start command
				await sendWorkflowCommand("/jat:start");
				break;

			case "kill":
				// Kill tmux session
				await onKillSession?.();
				break;

			default:
				console.warn("Unknown status action:", actionId);
		}
	}

	// Handle server status badge actions
	async function handleServerAction(actionId: string) {
		switch (actionId) {
			case "stop":
				// Stop the server
				await onStopServer?.();
				break;

			case "restart":
				// Restart the server
				await onRestartServer?.();
				break;

			case "start":
				// Start the server
				await onStartServer?.();
				break;

			case "attach":
				if (sessionName) {
					try {
						await fetch(`/api/work/${encodeURIComponent(sessionName)}/attach`, {
							method: "POST",
						});
					} catch (e) {
						console.error("[SessionCard:server] Failed to attach terminal:", e);
					}
				}
				break;

			case "kill":
				// Kill server session
				await onKillSession?.();
				break;

			default:
				console.warn("Unknown server action:", actionId);
		}
	}

	// Send a key to the session
	async function sendKey(keyType: string) {
		if (!onSendInput) return;
		setSendingInput(true);
		try {
			await onSendInput(keyType, "key");
		} finally {
			setSendingInput(false);
		}
	}

	// Send a sequence of keys (e.g., Down then Enter for option 2)
	async function sendKeySequence(keys: string[]) {
		if (!onSendInput) return;
		setSendingInput(true);
		try {
			for (const key of keys) {
				await onSendInput(key, "key");
				// Small delay between keys
				await new Promise((r) => setTimeout(r, 50));
			}
		} finally {
			setSendingInput(false);
		}
	}

	// Send option by number (1-indexed) - for numbered prompts
	function sendOptionNumber(num: number) {
		const opt = detectedOptions.find((o) => o.number === num);
		if (opt) {
			sendKeySequence(opt.keySequence);
		}
	}

	// Select a question option by navigating and pressing enter/space
	// For single-select: navigates to the option and presses enter
	// For multi-select: navigates to the option and presses space to toggle
	async function selectQuestionOption(
		option: QuestionOption,
		isMultiSelect: boolean,
	) {
		if (!onSendInput) return;
		setSendingInput(true);
		try {
			// Find the currently selected option index
			const question = detectedQuestion;
			if (!question) return;

			const currentIndex = question.options.findIndex((o) => o.isSelected);
			const targetIndex = option.index;

			// Calculate navigation from current position
			if (currentIndex >= 0 && currentIndex !== targetIndex) {
				const diff = targetIndex - currentIndex;
				const key = diff > 0 ? "down" : "up";
				const steps = Math.abs(diff);

				for (let i = 0; i < steps; i++) {
					await onSendInput(key, "key");
					await new Promise((r) => setTimeout(r, 30));
				}
			}

			// For multi-select, press space to toggle; for single-select, press enter
			await new Promise((r) => setTimeout(r, 50));
			if (isMultiSelect) {
				await onSendInput("space", "key");
			} else {
				await onSendInput("enter", "key");
			}
		} finally {
			setSendingInput(false);
		}
	}

	// Confirm multi-select choices (press Enter after selecting options)
	async function confirmMultiSelect() {
		if (!onSendInput) return;
		setSendingInput(true);
		try {
			await onSendInput("enter", "key");
		} finally {
			setSendingInput(false);
		}
	}

	// Send text input (with attached images if any)
	async function sendTextInput() {
		if (!onSendInput) return;

		// CRITICAL: Cancel any pending stream debounce timer to prevent race condition
		// where the debounce fires AFTER we send Enter, causing duplicate partial messages
		if (streamDebounceTimer) {
			clearTimeout(streamDebounceTimer);
			streamDebounceTimer = null;
		}

		// Need either text or images to send
		const hasText = inputText.trim().length > 0;
		const hasFiles = attachedFiles.length > 0;
		if (!hasText && !hasFiles) return;

		// Wait for any in-progress streaming to complete before proceeding
		// This prevents the race where isStreaming is true and we try to send Enter
		if (isStreaming) {
			await new Promise((r) => setTimeout(r, 100));
		}

		setSendingInput(true);
		try {
			// Upload all attached files first and collect paths
			const filePaths: string[] = [];
			for (const file of attachedFiles) {
				// If the file already has a path (dragged from TaskDetailPaneA), use it directly
				if (file.path) {
					filePaths.push(file.path);
					continue;
				}

				// Otherwise, upload the blob
				if (!file.blob) continue;

				const formData = new FormData();
				formData.append("file", file.blob, file.name);
				formData.append("sessionName", sessionName);
				formData.append("filename", file.name);

				const response = await fetch("/api/work/upload-image", {
					method: "POST",
					body: formData,
				});

				if (response.ok) {
					const { filePath } = await response.json();
					filePaths.push(filePath);
				} else {
					console.error("Failed to upload file:", file.name);
				}
			}

			// Build the message: file paths first, then user text
			let message = "";
			if (filePaths.length > 0) {
				message = filePaths.join(" ");
				if (hasText) {
					message += " " + inputText.trim();
				}
			} else if (hasText) {
				message = inputText.trim();
			}

			if (message) {
				// Clear any previous error
				sendInputError = null;

				// STEP 1: Send Ctrl-C and Escape BEFORE the message to clear any
				// stale terminal state (from streaming, previous sessions, or race conditions)
				// This ensures a clean slate before we send our actual message
				await onSendInput("ctrl-c", "key");
				await new Promise((r) => setTimeout(r, 50));
				await onSendInput("escape", "key");
				await new Promise((r) => setTimeout(r, 50));

				// When live streaming is enabled, also clear the line
				if (liveStreamEnabled) {
					await onSendInput("ctrl-u", "key");
					await new Promise((r) => setTimeout(r, 30));
				}

				// STEP 2: Send the complete message and submit
				// Note: "text" type already includes Enter in the API
				const sendResult = await onSendInput(message, "text");

				// Check if send failed (timeout, network error, etc.)
				if (sendResult === false) {
					// Keep the input text so user can retry
					sendInputError = "Message failed to send. Your text has been preserved - please try again.";
					return; // Don't clear input
				}

				// STEP 3: Send an extra Enter after a delay
				// This handles cases where the first Enter was interpreted as Shift+Enter
				// or a linebreak instead of a submission command
				await new Promise((r) => setTimeout(r, 100));
				await onSendInput("enter", "key");
			}

			// Capture text for exit animation before clearing
			const textToAnimate = inputText.trim();

			// Clear input and attached files on success
			inputText = "";
			lastStreamedText = ""; // Reset streamed text tracking
			maxStreamedLength = 0; // Reset high water mark after submit
			// Reset textarea height after clearing
			setTimeout(autoResizeTextarea, 0);
			// Revoke object URLs to prevent memory leaks (only for blob-based attachments)
			for (const file of attachedFiles) {
				// Don't revoke server URLs from path-based attachments
				if (file.preview && !file.path && file.preview.startsWith('blob:')) {
					URL.revokeObjectURL(file.preview);
				}
			}
			attachedFiles = [];

			// Trigger text exit animation if there was text
			if (textToAnimate) {
				exitingText = textToAnimate;
				setTimeout(() => {
					exitingText = null;
				}, 600); // Match animation duration
			}

			// Trigger visual flash feedback for successful submit
			submitFlash = true;
			setTimeout(() => {
				submitFlash = false;
			}, 300);

			// Restore focus to input after successful submission
			// Use setTimeout to ensure DOM updates complete first
			setTimeout(() => {
				inputRef?.focus({ preventScroll: true });
			}, 50);
		} finally {
			setSendingInput(false);
		}
	}

	// Handle keyboard shortcuts in input
	function handleInputKeydown(e: KeyboardEvent) {
		if (e.key === "Enter" && !e.shiftKey) {
			// Enter without Shift submits the input
			e.preventDefault();
			// If input is empty, send Enter to tmux (for "Press Enter to continue" prompts)
			const hasText = inputText.trim().length > 0;
			const hasFiles = attachedFiles.length > 0;
			if (!hasText && !hasFiles && onSendInput) {
				onSendInput("enter", "key");
				// Trigger visual flash feedback for the Enter action
				submitFlash = true;
				setTimeout(() => {
					submitFlash = false;
				}, 300);
				// Restore focus after sending Enter
				setTimeout(() => {
					inputRef?.focus({ preventScroll: true });
				}, 50);
			} else {
				sendTextInput();
			}
		} else if (e.key === "Enter" && e.shiftKey) {
			// Shift+Enter inserts newline (default textarea behavior)
			// Let it happen naturally, then resize
			setTimeout(handleInputChange, 0);
		} else if (e.key === "Tab" && liveStreamEnabled && onSendInput) {
			// When streaming, send Tab to terminal for autocomplete
			e.preventDefault();
			onSendInput("tab", "key");
			// Trigger visual flash feedback
			tabFlash = true;
			setTimeout(() => {
				tabFlash = false;
			}, 300);
		} else if (e.key === "Escape") {
			// Send 2x Escape to tmux (matches Claude Code's clear/cancel behavior)
			// Claude Code: 2x Escape = clear, 3x Escape = history dialog
			e.preventDefault();
			inputText = "";
			if (onSendInput) {
				onSendInput("escape", "key");
				// Small delay between escapes to ensure they're registered separately
				setTimeout(() => onSendInput("escape", "key"), 50);
			}
			lastStreamedText = ""; // Reset streamed text tracking
			maxStreamedLength = 0; // Reset high water mark on Escape
			// Reset textarea height
			setTimeout(autoResizeTextarea, 0);
			// Trigger visual flash feedback
			escapeFlash = true;
			setTimeout(() => {
				escapeFlash = false;
			}, 300);
		} else if (e.key === "c" && e.ctrlKey && ctrlCInterceptEnabled) {
			// Ctrl+C: Send interrupt signal to tmux AND clear local input
			// (Only when intercept is enabled; otherwise let browser handle copy)
			e.preventDefault();
			inputText = "";
			lastStreamedText = "";
			maxStreamedLength = 0; // Reset high water mark on Ctrl+C
			setTimeout(autoResizeTextarea, 0);
			// Send Ctrl+C to tmux to interrupt Claude
			if (onSendInput) {
				sendKey("ctrl-c");
			}
			// Trigger visual flash feedback (same as Escape - cancel action)
			escapeFlash = true;
			setTimeout(() => {
				escapeFlash = false;
			}, 300);
		} else if (e.key === "c" && e.ctrlKey && !ctrlCInterceptEnabled) {
			// Ctrl+C for copy - trigger green flash (browser handles actual copy)
			copyFlash = true;
			setTimeout(() => {
				copyFlash = false;
			}, 300);
		} else if (
			(e.key === "ArrowUp" ||
				e.key === "ArrowDown" ||
				e.key === "ArrowLeft" ||
				e.key === "ArrowRight") &&
			!inputText.trim() &&
			onSendInput
		) {
			// Arrow keys: When input is empty, transmit to tmux for navigation
			// (e.g., navigating Claude Code's option prompts or history)
			e.preventDefault();
			const keyMap: Record<string, string> = {
				ArrowUp: "up",
				ArrowDown: "down",
				ArrowLeft: "left",
				ArrowRight: "right",
			};
			onSendInput(keyMap[e.key], "key");
			// Trigger visual flash feedback
			arrowFlash = true;
			setTimeout(() => {
				arrowFlash = false;
			}, 300);
		} else if (
			(e.key === "Delete" || e.key === "Backspace") &&
			!inputText.trim() &&
			onSendInput
		) {
			// Delete/Backspace: When input is empty, transmit to tmux
			// (e.g., for terminal history editing or Claude Code input manipulation)
			e.preventDefault();
			onSendInput(e.key === "Delete" ? "delete" : "backspace", "key");
		}
		// Note: Ctrl+V is handled by onpaste event, not here
	}

	// Handle native paste event - only intercept for images, let text paste normally
	async function handlePaste(e: ClipboardEvent) {
		if (!onSendInput || !e.clipboardData) return;

		// Check if clipboard contains an image
		const items = e.clipboardData.items;
		for (const item of items) {
			if (item.type.startsWith("image/")) {
				// Intercept image paste
				e.preventDefault();
				const blob = item.getAsFile();
				if (blob) {
					await attachFile(blob);
					// Also archive to task if there's an active task
					if (task?.id) {
						await saveFileToTask(blob, task.id);
					}
				}
				// Trigger visual flash feedback for image paste
				pasteFlash = true;
				setTimeout(() => {
					pasteFlash = false;
				}, 300);
				return;
			}
		}
		// For text, let the native paste happen (don't preventDefault)
		// Trigger visual flash feedback for text paste
		pasteFlash = true;
		setTimeout(() => {
			pasteFlash = false;
		}, 300);
	}

	// Attach a file (add to pending list, don't upload yet)
	async function attachFile(blob: Blob, filename?: string) {
		const id = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

		// Determine file name and type info
		let name: string;
		let typeInfo;
		if (blob instanceof File) {
			name = blob.name;
			typeInfo = getFileTypeInfo(blob);
		} else {
			// For blobs without a name (e.g., pasted images), infer from MIME type
			const ext = blob.type.split("/")[1] || "bin";
			name = filename || `File ${attachedFiles.length + 1}.${ext}`;
			// Create a mock File to get type info
			const mockFile = new File([blob], name, { type: blob.type });
			typeInfo = getFileTypeInfo(mockFile);
		}

		// Create preview URL only for images
		const preview = typeInfo.previewable ? URL.createObjectURL(blob) : "";

		attachedFiles = [
			...attachedFiles,
			{
				id,
				blob,
				preview,
				name,
				category: typeInfo.category,
				icon: typeInfo.icon,
				iconColor: typeInfo.color,
			},
		];

		// Trigger visual flash feedback for attachment
		attachFlash = true;
		setTimeout(() => {
			attachFlash = false;
		}, 300);
	}

	// Remove an attached file
	function removeAttachedFile(id: string) {
		const file = attachedFiles.find((f) => f.id === id);
		if (file && file.preview) {
			URL.revokeObjectURL(file.preview);
		}
		attachedFiles = attachedFiles.filter((f) => f.id !== id);
	}

	// Handle drag-and-drop for file attachments and image paths
	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		// Show drag state for files OR custom JAT image/text data OR plain text paths
		const hasFiles = e.dataTransfer?.types.includes("Files");
		const hasJatImage = e.dataTransfer?.types.includes("application/x-jat-image");
		const hasJatText = e.dataTransfer?.types.includes("application/x-jat-text");
		const hasText = e.dataTransfer?.types.includes("text/plain");
		if ((hasFiles || hasJatImage || hasJatText || hasText) && onSendInput) {
			isDragOver = true;
			e.dataTransfer!.dropEffect = "copy";
		}
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		// Only reset if we're leaving the card entirely (not entering a child)
		const relatedTarget = e.relatedTarget as HTMLElement | null;
		if (
			!relatedTarget ||
			!e.currentTarget ||
			!(e.currentTarget as HTMLElement).contains(relatedTarget)
		) {
			isDragOver = false;
		}
	}

	function handleDragEnter(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		const hasFiles = e.dataTransfer?.types.includes("Files");
		const hasJatImage = e.dataTransfer?.types.includes("application/x-jat-image");
		const hasJatText = e.dataTransfer?.types.includes("application/x-jat-text");
		const hasText = e.dataTransfer?.types.includes("text/plain");
		if ((hasFiles || hasJatImage || hasJatText || hasText) && onSendInput) {
			isDragOver = true;
		}
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragOver = false;

		// Check for custom JAT image path data (dragged from TaskDetailPaneA thumbnails)
		const jatImageData = e.dataTransfer?.getData('application/x-jat-image');
		if (jatImageData) {
			try {
				const imageInfo = JSON.parse(jatImageData);
				if (imageInfo.path) {
					// Add as a proper attachment with the image preview
					const id = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
					const filename = imageInfo.filename || imageInfo.path.split('/').pop() || 'image';

					attachedFiles = [
						...attachedFiles,
						{
							id,
							blob: null, // No blob needed - we have the path
							preview: imageInfo.url, // Use the served URL for preview
							name: filename,
							category: 'image',
							icon: 'M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
							iconColor: 'oklch(0.70 0.15 200)',
							// Store the path for when we send the message
							path: imageInfo.path,
						},
					];

					attachFlash = true;
					setTimeout(() => { attachFlash = false; }, 300);
					return;
				}
			} catch {
				// Fall through to file handling
			}
		}

		// Check for custom JAT text data (dragged description or notes from TaskDetailPaneA)
		const jatTextData = e.dataTransfer?.getData('application/x-jat-text');
		if (jatTextData) {
			try {
				const textInfo = JSON.parse(jatTextData);
				if (textInfo.content) {
					// Insert the text content into the input field
					if (inputText.trim()) {
						inputText = inputText.trim() + "\n\n" + textInfo.content;
					} else {
						inputText = textInfo.content;
					}
					// Trigger visual flash feedback
					inputTextFlash = true;
					setTimeout(() => { inputTextFlash = false; }, 400);
					// Focus the input for immediate editing
					setTimeout(() => {
						const textarea = document.querySelector(`[data-session-input="true"][data-session-name="${sessionName}"]`) as HTMLTextAreaElement;
						textarea?.focus();
					}, 50);
					return;
				}
			} catch {
				// Fall through to other handling
			}
		}

		// Also check for plain text path (fallback) - only if it looks like an image path
		const plainText = e.dataTransfer?.getData('text/plain');
		if (plainText && plainText.startsWith('/') && !e.dataTransfer?.files?.length) {
			// Check if it looks like an image path
			const isImagePath = /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(plainText);
			if (isImagePath) {
				// Add as attachment with path
				const id = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
				const filename = plainText.split('/').pop() || 'image';

				attachedFiles = [
					...attachedFiles,
					{
						id,
						blob: null,
						preview: `/api/work/image/${encodeURIComponent(plainText)}`,
						name: filename,
						category: 'image',
						icon: 'M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
						iconColor: 'oklch(0.70 0.15 200)',
						path: plainText,
					},
				];

				attachFlash = true;
				setTimeout(() => { attachFlash = false; }, 300);
				return;
			}
		}

		if (!onSendInput || !e.dataTransfer?.files) return;

		const files = Array.from(e.dataTransfer.files);

		for (const file of files) {
			// Attach all file types (images, PDFs, text, code, etc.)
			await attachFile(file);

			// Also save to task for archival (if there's an active task)
			if (task?.id) {
				await saveFileToTask(file, task.id);
			}
		}
	}

	/**
	 * Save a file to a task for archival in TaskDetailDrawer.
	 * Uploads the file and stores the reference with the task.
	 */
	async function saveFileToTask(blob: Blob, taskId: string) {
		try {
			// Determine filename from blob or generate one
			const filename =
				blob instanceof File
					? blob.name
					: `task-${taskId}-${Date.now()}.${blob.type.split("/")[1] || "bin"}`;

			// Upload to server
			const formData = new FormData();
			formData.append("file", blob, filename);
			formData.append("sessionName", `task-${taskId}`);
			formData.append("filename", filename);

			const response = await fetch("/api/work/upload-image", {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				console.error("Failed to upload file for task archival");
				return;
			}

			const { filePath } = await response.json();

			// Generate unique ID for this file
			const fileId = `file-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

			// Save to task for persistence (shows in TaskDetailDrawer)
			const saveResponse = await fetch(`/api/tasks/${taskId}/image`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path: filePath, id: fileId, action: "add" }),
			});

			if (saveResponse.ok) {
				console.log(`Archived file to task ${taskId}: ${filePath}`);
				// Notify parent to refresh task details (so attachment shows in TaskDetailPaneA)
				onFileAttachedToTask?.(taskId);
			}
		} catch (err) {
			console.error("Failed to archive file to task:", err);
		}
	}

	// Handle voice transcription - append text to input
	function handleVoiceTranscription(event: CustomEvent<string>) {
		const text = event.detail;
		if (text) {
			// Append to existing text with space separator if needed
			if (inputText.trim()) {
				inputText = inputText.trim() + " " + text;
			} else {
				inputText = text;
			}
		}
	}

	// Handle voice input error
	function handleVoiceError(event: CustomEvent<string>) {
		console.error("Voice input error:", event.detail);
		// Could show error toast here, but for now just log
	}

	// Manual paste button - reads clipboard and handles text or images
	async function handlePasteButton() {
		if (!onSendInput) return;

		try {
			const clipboardItems = await navigator.clipboard.read();

			for (const item of clipboardItems) {
				// Check for images first
				const imageType = item.types.find((t: string) =>
					t.startsWith("image/"),
				);
				if (imageType) {
					const blob = await item.getType(imageType);
					await attachFile(blob);
					// Also archive to task if there's an active task
					if (task?.id) {
						await saveFileToTask(blob, task.id);
					}
					return;
				}

				// Fall back to text
				if (item.types.includes("text/plain")) {
					const blob = await item.getType("text/plain");
					const text = await blob.text();
					if (text.trim()) {
						inputText = text;
					}
					return;
				}
			}
		} catch (err) {
			// Fallback: try simple text paste
			try {
				const text = await navigator.clipboard.readText();
				if (text.trim()) {
					inputText = text;
				}
			} catch (textErr) {
				console.error("Failed to read clipboard:", textErr);
			}
		}
	}

	// Upload image and send file path to session
	async function uploadAndSendImage(blob: Blob) {
		if (!onSendInput) return;
		setSendingInput(true);

		try {
			// Upload to server
			const formData = new FormData();
			formData.append("image", blob, `pasted-image-${Date.now()}.png`);
			formData.append("sessionName", sessionName);

			const response = await fetch("/api/work/upload-image", {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				throw new Error("Failed to upload image");
			}

			const { filePath } = await response.json();

			// Send the file path to Claude Code
			await onSendInput(filePath, "text");
			await new Promise((r) => setTimeout(r, 100));
			await onSendInput("enter", "key");
		} catch (err) {
			console.error("Failed to upload image:", err);
		} finally {
			setSendingInput(false);
		}
	}

	// Render output with ANSI codes and clickable URLs
	const renderedOutput = $derived(ansiToHtmlWithLinks(output));
</script>

<!-- ═══════════════════════════════════════════════════════════════════════════
     REUSABLE SNIPPETS - Consistent UI elements across compact and full modes
     ═══════════════════════════════════════════════════════════════════════════ -->

<!-- Agent Stats Row: Timer + Tokens + Cost (sparkline optional via parameter) -->
{#snippet agentStatsRow(showSparkline: boolean = false)}
	<div
		class="flex items-center gap-1 font-mono text-[9px]"
		style="color: oklch(0.55 0.03 250);"
	>
		{#if startTime}
			{@const elapsed = elapsedTimeFormatted()!}
			<span class="flex items-center gap-0.5" title="Session duration">
				{#if elapsed.showHours}
					<AnimatedDigits value={elapsed.hours} class="text-[9px]" />
					<span class="opacity-60">:</span>
				{/if}
				<AnimatedDigits value={elapsed.minutes} class="text-[9px]" />
				<span class="opacity-60">:</span>
				<AnimatedDigits value={elapsed.seconds} class="text-[9px]" />
			</span>
			<span class="opacity-40">·</span>
		{/if}
		{#if usageLoading}
			<div
				class="skeleton w-8 h-3 rounded"
				style="background: oklch(0.28 0.01 250);"
			></div>
			<span class="opacity-40">·</span>
			<div
				class="skeleton w-10 h-3 rounded"
				style="background: oklch(0.28 0.01 250);"
			></div>
		{:else}
			<span style="color: oklch(0.60 0.05 250);">{formatTokens(tokens)}</span>
			<span class="opacity-40">·</span>
			<span style="color: oklch(0.65 0.10 145);">${cost.toFixed(2)}</span>
		{/if}
		{#if showSparkline && sparklineData && sparklineData.length > 0}
			<div
				class="flex-shrink-0 ml-1 w-[40px] sm:w-[45px] md:w-[50px] lg:w-[60px] h-[12px]"
			>
				<Sparkline
					data={sparklineData}
					height={12}
					showTooltip={true}
					showStyleToolbar={false}
					defaultTimeRange="24h"
					animate={false}
				/>
			</div>
		{/if}
	</div>
{/snippet}

{#if isCompactMode}
	<!-- ═══════════════════════════════════════════════════════════════════════════
	     COMPACT MODE - Simplified card for kanban views
	     Shows: Agent name (styled), task ID badge, task title, sparkline+tokens inline
	     Skips: Terminal output, input section, completion banner, resize handle
	     ═══════════════════════════════════════════════════════════════════════════ -->
	<article
		class="unified-agent-card p-2 rounded-lg relative overflow-hidden flex flex-col {className} {isCompleteFlashing
			? 'complete-flash-animation'
			: ''} {isExiting ? 'session-exit' : ''} {isEntering ? 'session-entrance' : ''}"
		class:ring-2={effectiveHighlighted ||
			sessionState === "needs-input" ||
			isCompleteFlashing}
		class:ring-primary={effectiveHighlighted}
		class:ring-success={isCompleteFlashing}
		class:ring-warning={sessionState === "needs-input" &&
			!isCompleteFlashing &&
			!effectiveHighlighted}
		class:ring-info={isJumpHighlighted}
		class:animate-pulse-subtle={sessionState === "needs-input" &&
			!isCompleteFlashing}
		style="
			background: linear-gradient(135deg, {displayBgTint} 0%, oklch(0.18 0.01 250) 100%);
			border-left: 3px solid {isCompleteFlashing
			? 'oklch(0.65 0.20 145)'
			: displayAccent};
			{isCompleteFlashing
			? 'box-shadow: 0 0 20px oklch(0.65 0.20 145 / 0.6);'
			: sessionState === 'needs-input'
				? 'box-shadow: 0 0 12px oklch(0.70 0.20 85 / 0.4);'
				: isJumpHighlighted
					? 'box-shadow: 0 0 20px oklch(0.60 0.15 220 / 0.6);'
					: ''}
			scroll-margin-top: 6rem;
		"
		data-agent-name={agentName}
	>
		{#if !headerless}
		<!-- Header: Agent identity + Stats + Status (single row) -->
		<div class="flex items-center justify-between gap-2 mb-2">
			<!-- Left: Avatar + Agent name -->
			<div class="flex items-center gap-2 min-w-0">
				<div
					class="shrink-0 rounded-full leading-[0]"
					style="box-shadow: 0 0 0 2px {displayAccent};"
					title={stateVisual.description}
				>
					<AgentAvatar name={agentName} size={18} />
				</div>
				<span
					class="font-mono text-[11px] font-semibold tracking-wider uppercase truncate"
					style="color: {displayAccent};"
					title={agentName}
				>
					{agentName}
				</span>
			</div>

			<!-- Right: Sparkline + Status dropdown -->
			<div class="flex items-center gap-2 shrink-0">
				{#if sparklineData && sparklineData.length > 0}
					<div
						class="flex-shrink-0 -mt-2 w-[45px] sm:w-[50px] md:w-[60px] lg:w-[70px] h-[14px]"
					>
						<Sparkline
							data={sparklineData}
							height={14}
							showTooltip={true}
							showStyleToolbar={false}
							defaultTimeRange="24h"
							animate={false}
						/>
					</div>
				{/if}
				<!-- Human Actions Required indicator (shows if pending actions exist) -->
				{#if pendingHumanActionsCount > 0}
					<span
						class="badge badge-xs font-mono"
						style="background: oklch(0.45 0.18 50); color: oklch(0.98 0.02 250); border: none;"
						title="{pendingHumanActionsCount} manual action{pendingHumanActionsCount >
						1
							? 's'
							: ''} required"
					>
						🧑 {pendingHumanActionsCount}
					</span>
				{/if}
				<!-- Suggested Tasks indicator (shows when agent suggests tasks to create) -->
				{#if hasSuggestedTasks}
					<button
						type="button"
						class="badge badge-xs font-mono cursor-pointer hover:opacity-80 transition-opacity"
						style="background: oklch(0.45 0.18 250); color: oklch(0.98 0.02 250); border: none;"
						title="{detectedSuggestedTasks.length} suggested task{detectedSuggestedTasks.length >
						1
							? 's'
							: ''} - click to review and create"
						onclick={() => (suggestedTasksModalOpen = true)}
					>
						💡 {detectedSuggestedTasks.length}
					</button>
				{/if}
				<!-- Copy Session Contents button (compact) -->
				<button
					type="button"
					class="p-0.5 rounded hover:bg-base-content/10 transition-colors group"
					title={sessionCopied
						? "Copied!"
						: "Copy session contents (Alt+Shift+C)"}
					onclick={copySessionContents}
				>
					{#if sessionCopied}
						<svg
							class="w-3.5 h-3.5"
							style="color: oklch(0.70 0.20 145);"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M4.5 12.75l6 6 9-13.5"
							/>
						</svg>
					{:else}
						<svg
							class="w-3.5 h-3.5 opacity-40 group-hover:opacity-70 transition-opacity"
							style="color: oklch(0.70 0.05 250);"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
							/>
						</svg>
					{/if}
				</button>
				<!-- Status action dropdown or auto-close countdown -->
				{#if sessionState === "completed" && autoCloseCountdown !== null && !autoCloseHeld}
					<!-- Auto-close countdown UI (compact) -->
					<div class="flex items-center gap-1">
						<span
							class="badge badge-xs font-mono font-bold"
							style="background: oklch(0.30 0.10 145 / 0.5); color: oklch(0.85 0.15 145); border: 1px solid oklch(0.50 0.15 145);"
						>
							{autoCloseCountdown}s
						</span>
						<button
							onclick={holdForReview}
							class="badge badge-xs cursor-pointer hover:opacity-80"
							style="background: oklch(0.45 0.12 45); color: white; border: none;"
							title="Cancel auto-close"
						>
							Hold
						</button>
					</div>
				{:else}
					<StatusActionBadge
						{sessionState}
						{sessionName}
						{isDormant}
						{dormantTooltip}
						nextTask={nextTaskInfo}
						{nextTaskLoading}
						onAction={handleStatusAction}
						variant="integrated"
						alignRight={true}
						showCommands={true}
						showEpic={true}
						onCommand={sendWorkflowCommand}
						task={taskForEpicLinking}
						project={defaultProject || null}
						onViewEpic={(epicId) => onTaskClick?.(epicId)}
						onLinkToEpic={() => onTaskDataChange?.()}
					/>
				{/if}
			</div>
		</div>
		{/if}

		{#if !headerless}
		<!-- Task Section -->
		{#if displayTask}
			<div class="flex flex-col gap-1">
				<!-- Task ID + Priority badges -->
				<div class="flex items-center gap-2 flex-wrap">
					<TaskIdBadge
						task={{
							id: displayTask.id,
							status: displayTask.status || "in_progress",
							issue_type: displayTask.issue_type,
							title: displayTask.title || displayTask.id,
						}}
						size="xs"
						showType={false}
						showStatus={false}
						onOpenTask={onTaskClick}
					/>
					{#if displayTask.priority !== undefined}
						{@const priorityLabels = ["P0", "P1", "P2", "P3"]}
						{@const priorityColors = [
							"badge-error",
							"badge-warning",
							"badge-info",
							"badge-ghost",
						]}
						<span
							class="badge badge-xs {priorityColors[displayTask.priority] ??
								'badge-ghost'}"
						>
							{priorityLabels[displayTask.priority] ??
								`P${displayTask.priority}`}
						</span>
					{/if}
					{#if displayTask.issue_type}
						{@const typeIcons: Record<string, string> = { task: '📋', bug: '🐛', feature: '✨', epic: '🎯', chore: '🔧' }}
						<span
							class="badge badge-xs badge-ghost"
							title={displayTask.issue_type}
						>
							{typeIcons[displayTask.issue_type] ?? "📋"}
						</span>
					{/if}
				</div>
				<!-- Task title -->
				<button
					type="button"
					class="text-left font-mono font-bold text-sm tracking-wide truncate transition-all hover:underline hover:underline-offset-2 hover:decoration-dashed hover:decoration-base-content/50"
					style="color: {sessionState === 'completed'
						? 'oklch(0.75 0.02 250)'
						: 'oklch(0.90 0.02 250)'};"
					onclick={() => onTaskClick?.(displayTask.id)}
					title="Click to view task details"
				>
					{displayTask.title || displayTask.id}
				</button>
			</div>
		{:else if lastCompletedTask}
			<!-- Show last completed task -->
			<div class="flex flex-col gap-1">
				<div class="flex items-center gap-2">
					<span class="badge badge-xs badge-success/20 text-success">
						<svg
							class="w-3 h-3 mr-1"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M5 13l4 4L19 7"
							/>
						</svg>
						Done
					</span>
					<span class="badge badge-xs badge-outline font-mono opacity-60">
						{lastCompletedTask.id}
					</span>
				</div>
				<button
					type="button"
					class="text-left font-mono font-bold text-sm tracking-wide truncate hover:border-b hover:border-dashed hover:border-base-content/30"
					style="color: oklch(0.75 0.02 250);"
					onclick={() => onTaskClick?.(lastCompletedTask.id)}
				>
					{lastCompletedTask.title || lastCompletedTask.id}
				</button>
			</div>
		{:else}
			<!-- No task state -->
			<div class="text-sm text-base-content/50 italic">No active task</div>
		{/if}
		{/if}

		<!-- Star celebration overlay -->
		{#if showCelebration}
			<StreakCelebration
				count={tasksCompletedToday}
				onDismiss={() => {
					showCelebration = false;
				}}
			/>
		{/if}
	</article>
{:else}
	<!-- ═══════════════════════════════════════════════════════════════════════════
	     FULL MODE (agent/server) - Complete card with terminal output
	     ═══════════════════════════════════════════════════════════════════════════ -->
	<div
		class="card h-full flex flex-col relative rounded-none {className} {effectiveHighlighted
			? 'agent-highlight-flash ring-2 ring-info ring-offset-2 ring-offset-base-100'
			: ''} {isCompleteFlashing ? 'complete-flash-animation' : ''} {isExiting ? 'session-exit' : ''} {isEntering ? 'session-entrance' : ''}"
		style="
			background: linear-gradient(135deg, oklch(0.22 0.02 250) 0%, oklch(0.18 0.01 250) 50%, oklch(0.16 0.01 250) 100%);
			border: 1px solid {isCompleteFlashing
			? 'oklch(0.65 0.20 145)'
			: showCompletionBanner
				? 'oklch(0.65 0.20 145)'
				: isJumpHighlighted
					? 'oklch(0.60 0.15 220)'
					: 'oklch(0.35 0.02 250)'};
			box-shadow: {isCompleteFlashing
			? '0 0 20px oklch(0.65 0.20 145 / 0.6), inset 0 1px 0 oklch(1 0 0 / 0.05), 0 2px 8px oklch(0 0 0 / 0.1)'
			: isJumpHighlighted
				? '0 0 20px oklch(0.60 0.15 220 / 0.6), inset 0 1px 0 oklch(1 0 0 / 0.05), 0 2px 8px oklch(0 0 0 / 0.1)'
				: 'inset 0 1px 0 oklch(1 0 0 / 0.05), 0 2px 8px oklch(0 0 0 / 0.1)'};
			width: {headerless ? '100%' : `${effectiveWidth ?? DEFAULT_CARD_WIDTH}px`};
			min-width: {headerless ? 'auto' : `${MIN_CARD_WIDTH}px`};
			flex-shrink: {headerless ? 1 : 0};
			scroll-margin-top: 6rem;
		"
		data-agent-name={agentName}
		in:fly={{ x: 50, duration: 300, delay: 50 }}
		out:fade={{ duration: 200 }}
		onmouseenter={handleCardMouseEnter}
		onmouseleave={handleCardMouseLeave}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondragenter={handleDragEnter}
		ondrop={handleDrop}
	>
		<!-- File drop overlay -->
		{#if isDragOver}
			<div
				class="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
				style="
					background: oklch(0.25 0.15 250 / 0.9);
					border: 3px dashed oklch(0.65 0.20 250);
					border-radius: inherit;
				"
				transition:fade={{ duration: 150 }}
			>
				<div class="flex flex-col items-center gap-2">
					<svg
						class="w-12 h-12"
						style="color: oklch(0.75 0.15 250);"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
						/>
					</svg>
					<span
						class="text-sm font-semibold"
						style="color: oklch(0.85 0.10 250);">Drop image to attach</span
					>
				</div>
			</div>
		{/if}
		<!-- Status accent bar - left edge (color reflects session state) -->
		<div
			class="absolute left-0 top-0 bottom-0 w-1 z-10"
			style="
			background: {sessionState === 'needs-input'
				? 'oklch(0.70 0.20 45)' /* Orange for needs input - urgent attention */
				: sessionState === 'ready-for-review'
					? 'oklch(0.65 0.20 85)' /* Yellow/amber for review */
					: sessionState === 'completing'
						? 'oklch(0.65 0.15 175)' /* Teal for completing */
						: sessionState === 'completed' || showCompletionBanner
							? 'oklch(0.65 0.20 145)' /* Green for completed */
							: sessionState === 'working'
								? 'oklch(0.60 0.18 250)' /* Blue for working */
								: sessionState === 'starting'
									? 'oklch(0.70 0.15 200)' /* Cyan for starting */
									: 'oklch(0.50 0.05 250)'};
			box-shadow: {sessionState === 'needs-input'
				? '0 0 12px oklch(0.70 0.20 45 / 0.6)' /* Stronger glow for attention */
				: sessionState === 'ready-for-review'
					? '0 0 8px oklch(0.65 0.20 85 / 0.5)'
					: sessionState === 'completing'
						? '0 0 8px oklch(0.65 0.15 175 / 0.5)' /* Teal glow for completing */
						: sessionState === 'completed' || showCompletionBanner
							? '0 0 8px oklch(0.65 0.20 145 / 0.5)'
							: sessionState === 'working'
								? '0 0 8px oklch(0.60 0.18 250 / 0.5)'
								: sessionState === 'starting'
									? '0 0 8px oklch(0.70 0.15 200 / 0.5)' /* Cyan glow for starting */
									: 'none'};
		"
		></div>
		<!-- Project color accent bar - top edge (shows project identity) -->
		{#if projectColor}
			<div
				class="absolute left-0 right-0 top-0 h-1 z-10"
				style="
					background: {projectColor};
					box-shadow: 0 0 8px color-mix(in oklch, {projectColor} 50%, transparent);
				"
			></div>
		{/if}
		<!-- Completion Success Banner -->
		{#if showCompletionBanner}
			<div
				class="relative overflow-hidden flex-shrink-0"
				style="background: linear-gradient(135deg, oklch(0.45 0.18 145) 0%, oklch(0.38 0.15 160) 100%);"
				transition:fly={{ y: -20, duration: 300 }}
			>
				<!-- Subtle shimmer effect -->
				<div
					class="absolute inset-0 opacity-30"
					style="background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); animation: shimmer 3s infinite;"
				></div>

				<div class="relative px-4 py-3">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<!-- Success checkmark icon -->
							<div
								class="flex items-center justify-center w-8 h-8 rounded-full bg-white/20"
							>
								<svg
									class="w-5 h-5 text-white"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2.5"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M5 13l4 4L19 7"
									/>
								</svg>
							</div>
							<div>
								<h3 class="font-bold text-white text-lg">Task Complete!</h3>
								{#if task}
									<p class="text-white/80 text-sm truncate max-w-xs">
										{task.title}
									</p>
								{/if}
							</div>
						</div>

						<!-- Summary stats -->
						<div class="flex items-center gap-4 text-white/90 text-sm">
							{#if elapsedTime}
								<div class="flex items-center gap-1.5">
									<svg
										class="w-4 h-4 opacity-70"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
									<span class="font-mono">{elapsedTime}</span>
								</div>
							{/if}
							{#if usageLoading}
								<!-- Token usage skeleton while loading -->
								<div class="flex items-center gap-1.5">
									<div
										class="skeleton w-4 h-4 rounded"
										style="background: oklch(0.30 0.02 250);"
									></div>
									<div
										class="skeleton w-10 h-4 rounded"
										style="background: oklch(0.25 0.01 250);"
									></div>
								</div>
								<div class="flex items-center gap-1.5">
									<div
										class="skeleton w-12 h-4 rounded"
										style="background: oklch(0.25 0.01 250);"
									></div>
								</div>
							{:else if tokens > 0}
								<div class="flex items-center gap-1.5">
									<svg
										class="w-4 h-4 opacity-70"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
										/>
									</svg>
									<span class="font-mono">{formatTokens(tokens)}</span>
								</div>
							{/if}
							{#if !usageLoading && cost > 0}
								<div class="flex items-center gap-1.5">
									<span class="font-mono font-semibold">${cost.toFixed(2)}</span
									>
								</div>
							{/if}
						</div>
					</div>
				</div>
			</div>
		{/if}

		{#if !headerless}
			{#if isAgentMode}
				<!-- Task Content Section (Task-First Layout) -->
				<!-- Shown above agent bar because task is primary focus -->
				<div
				class="pl-3 pr-3 pt-2 flex-shrink-0 flex-grow-0"
				style="border-bottom: 1px solid oklch(0.30 0.02 250);"
				onmouseenter={handleTaskMouseEnter}
				onmouseleave={handleTaskMouseLeave}
			>
				{#if displayTask}
					<!-- Row 1: Task ID + Title -->
					<div class="flex items-start gap-2 mb-1">
						<div class="flex-shrink-0 pt-0.5">
							<TaskIdBadge
								task={{
									id: displayTask.id,
									status: displayTask.status || "in_progress",
									issue_type: displayTask.issue_type,
									title: displayTask.title || displayTask.id,
								}}
								size="sm"
								showType={false}
								showStatus={false}
								onOpenTask={onTaskClick}
							/>
						</div>
						{#if editingTitle}
							<input
								bind:this={titleInputRef}
								bind:value={editedTitle}
								onblur={saveTitle}
								onkeydown={handleTitleKeydown}
								class="font-mono font-bold text-sm tracking-wide min-w-0 flex-1 bg-transparent border-b border-info outline-none"
								style="color: oklch(0.90 0.02 250);"
								disabled={savingTitle}
							/>
						{:else}
							<h3
								class="mt-2 font-mono font-bold text-sm tracking-wide min-w-0 flex-1 cursor-text hover:border-b hover:border-dashed hover:border-base-content/30 transition-all duration-300 ease-out {taskHovered
									? ''
									: 'truncate'}"
								style="color: {sessionState === 'completed'
									? 'oklch(0.75 0.02 250)'
									: 'oklch(0.90 0.02 250)'};"
								onclick={startEditingTitle}
								role="button"
								tabindex="0"
								title="Click to edit title"
							>
								{displayTask.title || displayTask.id}
							</h3>
						{/if}
					</div>
					<!-- Row 2: Description (hover to expand) -->
					<button
						type="button"
						class="w-full text-left cursor-pointer"
						onclick={() => onTaskClick?.(displayTask.id)}
						title="Click to view task details"
					>
						<div
							class="overflow-hidden transition-all duration-300 ease-out"
							style="max-height: {taskHovered ? '50vh' : '2.6rem'};"
						>
							<p
								class="text-xs leading-relaxed"
								style="color: oklch(0.65 0.02 250);"
							>
								{displayTask.description || "No description"}
							</p>
						</div>
					</button>
					<!-- Row 3: Dependencies (if any) -->
					{#if displayTask.depends_on && displayTask.depends_on.length > 0}
						{@const unresolvedDeps = displayTask.depends_on.filter(
							(d) => d.status !== "closed",
						)}
						{@const resolvedDeps = displayTask.depends_on.filter(
							(d) => d.status === "closed",
						)}
						<div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
							<span
								class="text-[10px] font-mono"
								style="color: oklch(0.55 0.02 250);">deps:</span
							>
							{#each unresolvedDeps as dep (dep.id)}
								<span
									class="px-1.5 py-0.5 rounded text-[10px] font-mono"
									style="background: oklch(0.25 0.08 30); color: oklch(0.75 0.12 30); border: 1px solid oklch(0.35 0.10 30);"
									title="{dep.title || dep.id} ({dep.status || 'open'})"
								>
									⏳ {dep.id}
								</span>
							{/each}
							{#each resolvedDeps as dep (dep.id)}
								<span
									class="px-1.5 py-0.5 rounded text-[10px] font-mono"
									style="background: oklch(0.22 0.06 145); color: oklch(0.65 0.10 145); border: 1px solid oklch(0.32 0.08 145);"
									title="{dep.title || dep.id} (closed)"
								>
									✓ {dep.id}
								</span>
							{/each}
						</div>
					{/if}
				{:else}
					<!-- Idle state -->
					<div class="flex items-center gap-2 mb-1">
						<h3
							class="font-mono font-bold text-sm tracking-wide"
							style="color: oklch(0.5 0 0 / 0.5);"
						>
							Ready to start work
						</h3>
					</div>
				{/if}
			</div>

			<!-- Agent Header Bar - Below task (secondary info) -->
			<!-- Layout: [avatar][name][time] ... [sparkline][context] | [badges][STATUS] -->
			<div
				class="flex items-center justify-between px-3 py-1.5 flex-shrink-0"
				style="
					background: linear-gradient(180deg, oklch(0.20 0.015 250) 0%, oklch(0.18 0.01 250) 100%);
					border-bottom: 1px solid oklch(0.25 0.02 250);
				"
			>
				<!-- Left: Agent Info -->
				<div class="flex items-center gap-2 min-w-0 ml-2">
					<div title={stateVisual.description}>
						<AgentAvatar
							name={agentName}
							size={28}
							class="shrink-0 {sessionState === 'starting'
								? 'ring-2 ring-secondary ring-offset-base-100 ring-offset-1'
								: sessionState === 'working'
									? 'ring-2 ring-info ring-offset-base-100 ring-offset-1'
									: sessionState === 'needs-input'
										? 'ring-2 ring-warning ring-offset-base-100 ring-offset-1'
										: sessionState === 'ready-for-review'
											? 'ring-2 ring-accent ring-offset-base-100 ring-offset-1'
											: sessionState === 'completed'
												? 'ring-2 ring-success ring-offset-base-100 ring-offset-1'
												: ''}"
						/>
					</div>
					<div class="flex flex-col min-w-0">
						<!-- Agent name -->
						<span
							class="font-mono text-sm font-bold tracking-wide {outputActivityState ===
								'generating' || outputActivityState === 'thinking'
								? 'shimmer-text-fast'
								: ''}"
							style={!(outputActivityState === 'generating' || outputActivityState === 'thinking') ? `color: ${displayAccent};` : ""}
						>
							{agentName}
						</span>
						<!-- Elapsed time (styled like server uptime) -->
						{#if startTime}
							{@const elapsed = elapsedTimeFormatted()}
							{#if elapsed}
								<span
									class="flex items-center gap-0.5 font-mono text-xs"
									title="Session duration"
									style="color: {stateVisual.textColor};"
								>
									{#if elapsed.showHours}
										<AnimatedDigits value={elapsed.hours} class="text-xs" />
										<span class="opacity-60">:</span>
									{/if}
									<AnimatedDigits value={elapsed.minutes} class="text-xs" />
									<span class="opacity-60">:</span>
									<AnimatedDigits value={elapsed.seconds} class="text-xs" />
								</span>
							{/if}
						{:else}
							<span
								class="font-mono text-xs"
								style="color: {stateVisual.textColor};"
							>
								{displayShortLabel}
							</span>
						{/if}
					</div>
				</div>

				<!-- Right: Sparkline + Context + Badges + Status -->
				<div class="flex items-center gap-2">
					<!-- Token Activity Sparkline (bar chart style, moved to right side) -->
					{#if sparklineData && sparklineData.length > 0}
						{@const tokenActivityData = sparklineData.map((d) => d.tokens)}
						<div class="mr-6">
							<TerminalActivitySparkline
								activityData={tokenActivityData}
								maxBars={12}
								height={16}
								width={70}
								showTooltip={true}
								animateEntry={true}
							/>
						</div>
					{/if}

					<!-- Context Progress (compact) -->
					{#if contextPercent != null && contextPercent >= 0}
						{@const progressColor =
							contextPercent > 50
								? "progress-success"
								: contextPercent > 25
									? "progress-warning"
									: "progress-error"}
						<div
							class="w-16 flex items-center gap-1"
							title="{contextPercent}% context remaining"
						>
							<progress
								class="progress {progressColor} h-1.5 w-full"
								value={contextPercent}
								max="100"
							></progress>
						</div>
					{/if}

					<!-- Divider -->
					<div class="w-px h-5" style="background: oklch(0.35 0.02 250);"></div>

					<!-- Copy Session Contents button -->
					<button
						type="button"
						class="p-1 rounded hover:bg-base-content/10 transition-colors group"
						title={sessionCopied
							? "Copied!"
							: "Copy session contents (Alt+Shift+C)"}
						onclick={copySessionContents}
					>
						{#if sessionCopied}
							<svg
								class="w-4 h-4"
								style="color: oklch(0.70 0.20 145);"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M4.5 12.75l6 6 9-13.5"
								/>
							</svg>
						{:else}
							<svg
								class="w-4 h-4 opacity-50 group-hover:opacity-80 transition-opacity"
								style="color: oklch(0.70 0.05 250);"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
								/>
							</svg>
						{/if}
					</button>

					<!-- Human Actions Required indicator -->
					{#if pendingHumanActionsCount > 0}
						<span
							class="badge badge-xs font-mono"
							style="background: oklch(0.45 0.18 50); color: oklch(0.98 0.02 250); border: none;"
							title="{pendingHumanActionsCount} manual action{pendingHumanActionsCount >
							1
								? 's'
								: ''} required"
						>
							🧑 {pendingHumanActionsCount}
						</span>
					{/if}
					<!-- Suggested Tasks indicator -->
					{#if hasSuggestedTasks}
						<button
							type="button"
							class="badge badge-xs font-mono cursor-pointer hover:opacity-80 transition-opacity"
							style="background: oklch(0.45 0.18 250); color: oklch(0.98 0.02 250); border: none;"
							title="{detectedSuggestedTasks.length} suggested task{detectedSuggestedTasks.length >
							1
								? 's'
								: ''} - click to review and create"
							onclick={() => (suggestedTasksModalOpen = true)}
						>
							💡 {detectedSuggestedTasks.length}
						</button>
					{/if}
					<StatusActionBadge
						{sessionState}
						{sessionName}
						{isDormant}
						{dormantTooltip}
						nextTask={nextTaskInfo}
						{nextTaskLoading}
						onAction={handleStatusAction}
						disabled={sendingInput}
						alignRight={true}
						variant="integrated"
						showCommands={true}
						showEpic={true}
						onCommand={sendWorkflowCommand}
						task={taskForEpicLinking}
						project={defaultProject || null}
						onViewEpic={(epicId) => onTaskClick?.(epicId)}
						onLinkToEpic={() => onTaskDataChange?.()}
					/>
				</div>
			</div>
		{:else}
			<!-- Server Header Bar - Integrated full-width header (matching Concept B) -->
			<!-- Layout: [icon][name][port][uptime] ... [sparkline][errors][STATUS] -->
			{@const serverVisual = getServerStateVisual(serverStatus)}
			<div
				class="flex items-center justify-between px-3 py-2 flex-shrink-0"
				style="
					background: linear-gradient(180deg, oklch(0.22 0.02 250) 0%, oklch(0.19 0.015 250) 100%);
					border-bottom: 1px solid oklch(0.30 0.02 250);
				"
			>
				<!-- Left: Server Info -->
				<div class="flex items-center gap-2 min-w-0">
					<!-- Server icon -->
					<div
						class="flex items-center justify-center w-7 h-7 rounded"
						style="background: {serverVisual.bgTint};"
					>
						<svg
							class="w-4 h-4"
							style="color: {serverVisual.accent};"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d={serverVisual.icon}
							/>
						</svg>
					</div>
					<div class="flex flex-col min-w-0">
						<span
							class="font-mono text-sm font-bold tracking-wide"
							style="color: {serverVisual.accent}; text-shadow: 0 0 12px {serverVisual.glow};"
						>
							{displayName || projectName}
						</span>
						<div
							class="flex items-center gap-1.5 font-mono text-xs"
							style="color: oklch(0.55 0.03 250);"
						>
							{#if port}
								<span
									style="color: {portRunning
										? 'oklch(0.70 0.20 145)'
										: 'oklch(0.50 0.05 250)'};"
								>
									:{port}
								</span>
								<span class="opacity-40">·</span>
							{/if}
							{#if serverElapsedFormatted()}
								{@const serverElapsed = serverElapsedFormatted()!}
								<span
									class="flex items-center gap-0.5"
									title="Server uptime"
									style="color: {serverVisual.textColor};"
								>
									{#if serverElapsed.showHours}
										<AnimatedDigits
											value={serverElapsed.hours}
											class="text-xs"
										/>
										<span class="opacity-60">:</span>
									{/if}
									<AnimatedDigits
										value={serverElapsed.minutes}
										class="text-xs"
									/>
									<span class="opacity-60">:</span>
									<AnimatedDigits
										value={serverElapsed.seconds}
										class="text-xs"
									/>
								</span>
							{:else}
								<span style="color: {serverVisual.textColor};"
									>{serverVisual.shortLabel}</span
								>
							{/if}
						</div>
					</div>
				</div>

				<!-- Right: Activity + Errors + Status -->
				<div class="flex items-center gap-2">
					<!-- Activity Sparkline -->
					{#if activityData.length > 0}
						{@const hasRecentActivity = activityData
							.slice(-3)
							.some((v) => v > 0)}
						<div
							class={hasRecentActivity ? "animate-pulse" : ""}
							title="Terminal activity"
							style={hasRecentActivity ? "animation-duration: 2s;" : ""}
						>
							<TerminalActivitySparkline
								{activityData}
								maxBars={12}
								height={16}
								width={50}
								animateEntry={true}
							/>
						</div>
					{/if}

					<!-- Error Badge -->
					{#if serverErrors().hasErrors}
						<div
							class="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono"
							style="background: oklch(0.35 0.15 25 / 0.3); color: oklch(0.75 0.18 25);"
							title="Errors detected in output"
						>
							<svg
								class="w-3.5 h-3.5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
								/>
							</svg>
							<span>{serverErrors().count}</span>
						</div>
					{/if}

					<!-- Copy Session Contents button (server mode) -->
					<button
						type="button"
						class="p-1 rounded hover:bg-base-content/10 transition-colors group"
						title={sessionCopied
							? "Copied!"
							: "Copy server output (Alt+Shift+C)"}
						onclick={copySessionContents}
					>
						{#if sessionCopied}
							<svg
								class="w-4 h-4"
								style="color: oklch(0.70 0.20 145);"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M4.5 12.75l6 6 9-13.5"
								/>
							</svg>
						{:else}
							<svg
								class="w-4 h-4 opacity-50 group-hover:opacity-80 transition-opacity"
								style="color: oklch(0.70 0.05 250);"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
								/>
							</svg>
						{/if}
					</button>

					<!-- Divider -->
					<div class="w-px h-5" style="background: oklch(0.35 0.02 250);"></div>

					<ServerStatusBadge
						{serverStatus}
						{sessionName}
						{port}
						{portRunning}
						onAction={handleServerAction}
						disabled={sendingInput}
						alignRight={true}
						variant="integrated"
					/>
				</div>
			</div>
			{/if}
		{/if}

		<!-- Output Section -->
		<div
			class="flex-1 flex flex-col min-h-0"
			style="border-top: 10px solid oklch(0.5 0 0 / 0.08);"
		>
			<!-- Rich Signal Cards - display context-aware signal information above terminal -->
			<!-- Container uses flex-shrink-0 to prevent collapse, max-height constrains expansion -->
			<!-- overflow-y-auto allows scrolling if content exceeds max-height -->
			{#if hasRichSignal && isAgentMode}
				<div
					class="px-3 py-2 overflow-y-auto flex-shrink-0"
					style="border-bottom: 1px solid oklch(0.5 0 0 / 0.12); max-height: 350px;"
				>
					{#if workingSignal}
						<WorkingSignalCard
							signal={workingSignal}
							{agentName}
							onTaskClick={(taskId) => onTaskClick?.(taskId)}
							onInterrupt={onInterrupt
								? async () => {
										await onInterrupt?.();
									}
								: undefined}
							onPause={onSendInput
								? async () => {
										// Send /jat:pause to pause work on this task
										await onSendInput("/jat:pause", "text");
									}
								: undefined}
							compact={false}
						/>
					{:else if reviewSignal}
						<ReviewSignalCard
							signal={reviewSignal}
							projectName={defaultProject}
							baselineCommit={lastBaselineCommit}
							onTaskClick={(taskId) => onTaskClick?.(taskId)}
							onApprove={async () => {
								// When user approves from review card, trigger completion flow
								if (onSendInput) {
									await onSendInput("/jat:complete", "text");
								}
							}}
							onRequestChanges={onSendInput
								? async (feedback) => {
										// Send feedback to agent for requested changes
										await onSendInput(feedback, "text");
									}
								: undefined}
							onAskQuestion={onSendInput
								? async (question) => {
										// Send question to agent
										await onSendInput(question, "text");
									}
								: undefined}
							compact={false}
						/>
					{:else if needsInputSignal}
						<NeedsInputSignalCard
							signal={needsInputSignal}
							onTaskClick={(taskId) => onTaskClick?.(taskId)}
							onSelectOption={async (optionId) => {
								// Send the option selection to the terminal
								if (onSendInput) {
									await onSendInput(optionId, "text");
								}
							}}
							onSubmitText={async (text) => {
								// Send custom text input to the terminal
								if (onSendInput) {
									await onSendInput(text, "text");
								}
							}}
							compact={false}
						/>
					{:else if completingSignal}
						<CompletingSignalCard signal={completingSignal} compact={false} />
					{:else if idleSignal}
						<IdleSignalCard
							signal={idleSignal}
							onTaskClick={(taskId) => onTaskClick?.(taskId)}
							onStartIdle={onSendInput
								? async () => {
										// Send /jat:start to start working
										await onSendInput("/jat:start", "text");
									}
								: undefined}
							onStartSuggested={onSendInput && idleSignal.suggestedNextTask
								? async () => {
										// Start working on the suggested task
										await onSendInput(
											`/jat:start ${idleSignal.suggestedNextTask!.taskId}`,
											"text",
										);
									}
								: undefined}
							onAssignTask={onSendInput
								? async (taskId) => {
										// Start working on a specific task
										await onSendInput(`/jat:start ${taskId}`, "text");
									}
								: undefined}
							compact={false}
						/>
					{:else if startingSignal}
						<StartingSignalCard signal={startingSignal} compact={false} />
					{:else if compactingSignal}
						<CompactingSignalCard signal={compactingSignal} compact={false} />
					{/if}
				</div>
			{/if}

			<!-- Output Content with Minimap Sidebar -->
			<div class="relative flex-1 min-h-0 overflow-hidden">
				<!-- Terminal Output - Click to center card, add glow effect, and focus input -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					bind:this={scrollContainerRef}
					class="absolute inset-0 overflow-y-auto overflow-x-auto px-3 leading-relaxed cursor-text"
					style="font-family: var(--terminal-font); font-size: var(--terminal-font-size); background: oklch(0.17 0.01 250); {output ? 'right: 60px;' : ''}"
					onscroll={handleScroll}
					onclick={handleCardClick}
				>
					{#if output}
						<pre
							class="whitespace-pre m-0 text-base-content"
							style="font-family: var(--terminal-font); font-size: var(--terminal-font-size);">{@html renderedOutput}</pre>
					{:else}
						<p class="text-base-content/40 italic m-0">No output yet...</p>
					{/if}
				</div>

				<!-- Minimap Sidebar (absolute positioned, always visible when there's output) -->
				{#if output && mode === 'agent'}
					<div
						class="absolute top-0 right-0 bottom-0 w-[60px] border-l overflow-hidden"
						style="border-color: oklch(0.25 0.02 250); background: oklch(0.12 0.01 250);"
						bind:clientHeight={outputContainerHeight}
					>
						<MinimapCssScale
							bind:this={minimapRef}
							output={output}
							height={outputContainerHeight}
							onPositionClick={handleMinimapClick}
						/>
					</div>
				{/if}
			</div>

			<!-- Event Timeline Stack (peeks above input, expands on hover) -->
			{#if mode === "agent" && sessionName}
				<div class="relative px-3 bg-base-300 flex-shrink-0">
					<EventStack
						{sessionName}
						maxEvents={20}
						pollInterval={5000}
						autoExpand={sessionState === "completed"}
						onCleanup={() => handleStatusAction("cleanup")}
						onComplete={() => handleStatusAction("complete")}
						onReview={async () => {
							// Emit review signal via API
							if (sessionName) {
								try {
									const taskId = displayTask?.id || lastCompletedTask?.id || '';
									await fetch(`/api/sessions/${encodeURIComponent(sessionName)}/signal`, {
										method: 'POST',
										headers: { 'Content-Type': 'application/json' },
										body: JSON.stringify({
											type: 'review',
											data: {
												taskId,
												taskTitle: displayTask?.title || lastCompletedTask?.title || '',
												summary: ['Work completed, ready for review']
											}
										})
									});
								} catch (e) {
									console.error('[SessionCard] Failed to emit review signal:', e);
								}
							}
						}}
						onRollback={(event) => {
							// Open confirmation modal before rolling back
							if (event.git_sha) {
								rollbackEvent = {
									git_sha: event.git_sha,
									timestamp: event.timestamp,
								};
								rollbackModalOpen = true;
							}
						}}
						onCreateTasks={createTimelineEventTasks}
						onCreateAndStartTasks={createAndStartTimelineEventTasks}
						{availableProjects}
						{defaultProject}
						onSelectOption={async (optionId) => {
							// Send the option selection to the terminal via EventStack's needs_input card
							if (onSendInput) {
								await onSendInput(optionId, "text");
							}
						}}
						onSubmitText={async (text) => {
							// Send custom text input to the terminal via EventStack's needs_input card
							if (onSendInput) {
								await onSendInput(text, "text");
							}
						}}
						onApplyRename={async (taskId, newTitle) => {
							// Apply suggested rename to task via PATCH API
							try {
								const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
									method: 'PATCH',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({ title: newTitle })
								});
								if (!response.ok) {
									const error = await response.json();
									console.error('[SessionCard] Failed to apply rename:', error);
								}
							} catch (e) {
								console.error('[SessionCard] Failed to apply rename:', e);
							}
						}}
						onApplyLabels={async (taskId, labels) => {
							// Apply suggested labels to task via PATCH API
							try {
								const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
									method: 'PATCH',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({ labels })
								});
								if (!response.ok) {
									const error = await response.json();
									console.error('[SessionCard] Failed to apply labels:', error);
								}
							} catch (e) {
								console.error('[SessionCard] Failed to apply labels:', e);
							}
						}}
					/>
				</div>
			{/if}

			<!-- Input Section (z-[55] to layer above collapsed AND expanded EventStack z-50) -->
			<div
				class="relative px-3 py-2 flex-shrink-0 z-[10]"
				style="border-top: 1px solid oklch(0.5 0 0 / 0.08); background: oklch(0.18 0.01 250);"
			>
				<!-- Attached Files Preview -->
				{#if attachedFiles.length > 0}
					<div class="flex items-center gap-1.5 mb-2 flex-wrap">
						{#each attachedFiles as file (file.id)}
							<div
								class="relative group flex items-center gap-1 px-1.5 py-0.5 rounded"
								style="background: oklch(0.28 0.08 200); border: 1px solid oklch(0.35 0.06 200);"
							>
								<!-- File preview/icon -->
								{#if file.category === "image" && file.preview}
									<img
										src={file.preview}
										alt={file.name}
										class="w-5 h-5 object-cover rounded"
									/>
								{:else}
									<!-- Icon for non-image files -->
									<svg
										class="w-4 h-4"
										style="color: {file.iconColor};"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="1.5"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d={file.icon}
										/>
									</svg>
								{/if}
								<!-- File name -->
								<span
									class="font-mono text-[10px] max-w-24 truncate"
									style="color: oklch(0.85 0.02 250);"
									title={file.name}
								>
									[{file.name}]
								</span>
								<!-- Remove button -->
								<button
									onclick={() => removeAttachedFile(file.id)}
									class="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
									title="Remove file"
								>
									<svg
										class="w-3 h-3"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M6 18L18 6M6 6l12 12"
										/>
									</svg>
								</button>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Custom Question UI: Show clickable options from jat-signal question -->
				<!-- Takes priority over AskUserQuestion UI when both are present -->
				{#if customQuestionData?.active}
					<div
						class="mb-2 p-2 rounded-lg relative"
						style="background: oklch(0.22 0.04 280); border: 1px solid oklch(0.40 0.12 280);"
					>
						<!-- Close button -->
						<button
							onclick={() => clearCustomQuestionData()}
							class="absolute top-1 right-1 p-1 rounded-full opacity-50 hover:opacity-100 transition-opacity"
							style="color: oklch(0.65 0.02 280);"
							title="Dismiss"
						>
							<svg
								class="w-4 h-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</button>

						<!-- Question header with signal indicator and optional timeout -->
						<div class="flex items-center gap-2 mb-2 pr-6">
							<span
								class="text-[10px] px-1.5 py-0.5 rounded font-mono"
								style="background: oklch(0.35 0.12 280); color: oklch(0.90 0.05 280);"
							>
								🎯
							</span>
							<span
								class="text-xs font-semibold flex-1"
								style="color: oklch(0.90 0.10 280);"
							>
								{customQuestionData.question}
							</span>
							{#if customQuestionTimeout !== null && customQuestionTimeout > 0}
								<span
									class="text-[10px] px-1.5 py-0.5 rounded font-mono"
									style="background: oklch(0.30 0.08 40); color: oklch(0.80 0.12 40);"
								>
									⏱️ {customQuestionTimeout}s
								</span>
							{/if}
						</div>

						<!-- Different UIs based on question type -->
						{#if customQuestionData.questionType === "choice" && customQuestionData.options?.length > 0}
							<!-- Choice question: clickable option buttons -->
							<div class="flex flex-wrap gap-1.5">
								{#each customQuestionData.options as opt, index (index)}
									<button
										onclick={() =>
											submitCustomQuestionAnswer(opt.value || opt.label)}
										class="btn btn-xs btn-outline gap-1"
										style="background: oklch(0.25 0.03 280); border-color: oklch(0.40 0.08 280); color: oklch(0.85 0.02 280);"
										title={opt.description || opt.label}
										disabled={sendingInput || !onSendInput}
									>
										<span class="text-[10px] opacity-60">{index + 1}.</span>
										{opt.label}
									</button>
								{/each}
							</div>
							<div
								class="text-[10px] mt-1.5 opacity-50"
								style="color: oklch(0.65 0.02 280);"
							>
								Click an option to select
							</div>
						{:else if customQuestionData.questionType === "confirm"}
							<!-- Confirm question: Yes/No buttons -->
							<div class="flex gap-2">
								<button
									onclick={() => submitCustomQuestionAnswer("yes")}
									class="btn btn-xs btn-success gap-1"
									disabled={sendingInput || !onSendInput}
								>
									<svg
										class="w-3 h-3"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2.5"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M5 13l4 4L19 7"
										/>
									</svg>
									Yes
								</button>
								<button
									onclick={() => submitCustomQuestionAnswer("no")}
									class="btn btn-xs btn-error btn-outline gap-1"
									disabled={sendingInput || !onSendInput}
								>
									<svg
										class="w-3 h-3"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2.5"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M6 18L18 6M6 6l12 12"
										/>
									</svg>
									No
								</button>
							</div>
						{:else if customQuestionData.questionType === "input"}
							<!-- Input question: text field with submit -->
							<div class="flex items-center gap-2">
								<input
									type="text"
									bind:value={customQuestionInputValue}
									placeholder="Type your response..."
									class="input input-xs input-bordered flex-1 text-xs"
									style="background: oklch(0.18 0.02 280); border-color: oklch(0.45 0.12 280); color: oklch(0.90 0.02 280);"
									onkeydown={(e) => {
										if (e.key === "Enter" && customQuestionInputValue.trim()) {
											submitCustomQuestionAnswer(
												customQuestionInputValue.trim(),
											);
										}
									}}
									disabled={sendingInput || !onSendInput}
								/>
								<button
									onclick={() =>
										submitCustomQuestionAnswer(customQuestionInputValue.trim())}
									class="btn btn-xs btn-success gap-1"
									title="Send (Enter)"
									disabled={sendingInput ||
										!onSendInput ||
										!customQuestionInputValue.trim()}
								>
									<svg
										class="w-3 h-3"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2.5"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
										/>
									</svg>
									Send
								</button>
							</div>
							<div
								class="text-[10px] mt-1.5 opacity-50"
								style="color: oklch(0.65 0.02 280);"
							>
								Press Enter to send
							</div>
						{/if}
					</div>
				{/if}

				<!-- Smart Question UI: Show clickable options when AskUserQuestion is detected -->
				<!-- Prefer API-based question data (from hook) over terminal parsing -->
				{#if apiQuestionData?.active && apiQuestionData.questions?.length > 0}
					{@const currentQuestion = apiQuestionData.questions[0]}
					<div
						class="mb-2 p-2 rounded-lg relative"
						style="background: oklch(0.22 0.04 250); border: 1px solid oklch(0.40 0.10 200);"
					>
						<!-- Close button -->
						<button
							onclick={() => clearQuestionData()}
							class="absolute top-1 right-1 p-1 rounded-full opacity-50 hover:opacity-100 transition-opacity"
							style="color: oklch(0.65 0.02 250);"
							title="Dismiss (already answered)"
						>
							<svg
								class="w-4 h-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</button>
						<!-- Question header with API indicator -->
						<div class="flex items-center gap-2 mb-2 pr-6">
							<span
								class="text-[10px] px-1.5 py-0.5 rounded font-mono"
								style="background: oklch(0.35 0.10 200); color: oklch(0.90 0.05 200);"
							>
								❓
							</span>
							<span
								class="text-xs font-semibold"
								style="color: oklch(0.90 0.10 200);"
							>
								{currentQuestion.question}
							</span>
						</div>

						{#if isOtherInputMode}
							<!-- "Other" text input mode -->
							<div class="flex flex-col gap-2">
								<div class="flex items-center gap-2">
									<input
										type="text"
										bind:value={otherInputValue}
										placeholder="Type your custom response..."
										class="input input-xs input-bordered flex-1 text-xs"
										style="background: oklch(0.18 0.02 250); border-color: oklch(0.45 0.12 200); color: oklch(0.90 0.02 250);"
										onkeydown={(e) => {
											if (e.key === "Enter" && otherInputValue.trim()) {
												submitOtherInput();
											} else if (e.key === "Escape") {
												cancelOtherInputMode();
											}
										}}
										disabled={sendingInput || !onSendInput}
									/>
									<button
										onclick={submitOtherInput}
										class="btn btn-xs btn-success gap-1"
										title="Send (Enter)"
										disabled={sendingInput ||
											!onSendInput ||
											!otherInputValue.trim()}
									>
										<svg
											class="w-3 h-3"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2.5"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
											/>
										</svg>
										Send
									</button>
									<button
										onclick={cancelOtherInputMode}
										class="btn btn-xs btn-ghost"
										style="color: oklch(0.65 0.02 250);"
										title="Cancel (Esc)"
										disabled={sendingInput}
									>
										Cancel
									</button>
								</div>
								<div
									class="text-[10px] opacity-50"
									style="color: oklch(0.65 0.02 250);"
								>
									Press Enter to send, Escape to cancel
								</div>
							</div>
						{:else}
							<!-- Options as clickable buttons (API data) -->
							<div class="flex flex-wrap gap-1.5">
								{#each currentQuestion.options as opt, index (index)}
									<button
										onclick={async () => {
											// Navigate from current position to target index
											const delta = index - currentOptionIndex;
											const direction = delta > 0 ? "down" : "up";
											const steps = Math.abs(delta);

											for (let i = 0; i < steps; i++) {
												await onSendInput?.(direction, "key");
												await new Promise((r) => setTimeout(r, 30));
											}
											currentOptionIndex = index;

											await new Promise((r) => setTimeout(r, 50));

											if (currentQuestion.multiSelect) {
												// Toggle selection with space
												await onSendInput?.("space", "key");
												// Update local selection state using array for better reactivity
												const newSet = new Set(selectedOptionIndices);
												if (newSet.has(index)) {
													newSet.delete(index);
												} else {
													newSet.add(index);
												}
												selectedOptionIndices = newSet;
											} else {
												// Single select - just press enter
												await onSendInput?.("enter", "key");
												clearQuestionData();
											}
										}}
										class="btn btn-xs gap-1 transition-all"
										class:btn-primary={selectedOptionIndices.has(index)}
										class:btn-outline={!selectedOptionIndices.has(index)}
										style={selectedOptionIndices.has(index)
											? "background: oklch(0.45 0.15 250); border-color: oklch(0.55 0.18 250); color: oklch(0.98 0.01 250);"
											: "background: oklch(0.25 0.03 250); border-color: oklch(0.40 0.03 250); color: oklch(0.80 0.02 250);"}
										title={opt.description}
										disabled={sendingInput || !onSendInput}
									>
										{#if currentQuestion.multiSelect}
											<span class="text-[10px]">
												{selectedOptionIndices.has(index) ? "☑" : "☐"}
											</span>
										{/if}
										{opt.label}
									</button>
								{/each}

								<!-- "Other" button - lets user type custom text -->
								<button
									onclick={() =>
										activateOtherInputMode(currentQuestion.options.length)}
									class="btn btn-xs btn-outline gap-1"
									style="background: oklch(0.20 0.04 45); border-color: oklch(0.45 0.10 45); color: oklch(0.80 0.08 45);"
									title="Type a custom response"
									disabled={sendingInput || !onSendInput}
								>
									<svg
										class="w-3 h-3"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
										/>
									</svg>
									Other
								</button>

								<!-- Confirm button for multi-select (API) -->
								{#if currentQuestion.multiSelect}
									<button
										onclick={async () => {
											// Navigate to Submit option
											// Claude Code UI has: [options...] + "Type something" + "Submit"
											// So Submit is at index = options.length + 1
											const submitIndex = currentQuestion.options.length + 1;
											const delta = submitIndex - currentOptionIndex;
											const direction = delta > 0 ? "down" : "up";
											const steps = Math.abs(delta);

											for (let i = 0; i < steps; i++) {
												await onSendInput?.(direction, "key");
												await new Promise((r) => setTimeout(r, 30));
											}

											await new Promise((r) => setTimeout(r, 50));
											// First Enter: Select "Submit" in the options list
											await onSendInput?.("enter", "key");

											// Wait for confirmation screen to appear
											await new Promise((r) => setTimeout(r, 150));

											// Second Enter: Confirm "Submit answers" on the review screen
											await onSendInput?.("enter", "key");

											clearQuestionData();
										}}
										class="btn btn-xs btn-success gap-1"
										title="Confirm selection (Enter)"
										disabled={sendingInput || !onSendInput}
									>
										<svg
											class="w-3 h-3"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2.5"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M5 13l4 4L19 7"
											/>
										</svg>
										Done
									</button>
								{/if}
							</div>

							<!-- Hint text -->
							<div
								class="text-[10px] mt-1.5 opacity-50"
								style="color: oklch(0.65 0.02 250);"
							>
								{#if currentQuestion.multiSelect}
									Click options to toggle, then Done to confirm
								{:else}
									Click an option to select, or "Other" to type a custom
									response
								{/if}
							</div>
						{/if}
					</div>
				{:else if detectedQuestion}
					<!-- Fallback to terminal-parsed question data -->
					<div
						class="mb-2 p-2 rounded-lg relative"
						style="background: oklch(0.22 0.04 250); border: 1px solid oklch(0.35 0.06 250);"
					>
						<!-- Close button -->
						<button
							onclick={() => dismissTerminalQuestion()}
							class="absolute top-1 right-1 p-1 rounded-full opacity-50 hover:opacity-100 transition-opacity"
							style="color: oklch(0.65 0.02 250);"
							title="Dismiss (already answered)"
						>
							<svg
								class="w-4 h-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</button>
						<!-- Question header -->
						{#if detectedQuestion.question}
							<div
								class="text-xs font-semibold mb-2 pr-6"
								style="color: oklch(0.85 0.10 200);"
							>
								{detectedQuestion.question}
							</div>
						{/if}

						{#if isOtherInputMode}
							<!-- "Other" text input mode (fallback UI) -->
							<div class="flex flex-col gap-2">
								<div class="flex items-center gap-2">
									<input
										type="text"
										bind:value={otherInputValue}
										placeholder="Type your custom response..."
										class="input input-xs input-bordered flex-1 text-xs"
										style="background: oklch(0.18 0.02 250); border-color: oklch(0.45 0.12 200); color: oklch(0.90 0.02 250);"
										onkeydown={(e) => {
											if (e.key === "Enter" && otherInputValue.trim()) {
												submitOtherInput();
											} else if (e.key === "Escape") {
												cancelOtherInputMode();
											}
										}}
										disabled={sendingInput || !onSendInput}
									/>
									<button
										onclick={submitOtherInput}
										class="btn btn-xs btn-success gap-1"
										title="Send (Enter)"
										disabled={sendingInput ||
											!onSendInput ||
											!otherInputValue.trim()}
									>
										<svg
											class="w-3 h-3"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2.5"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
											/>
										</svg>
										Send
									</button>
									<button
										onclick={cancelOtherInputMode}
										class="btn btn-xs btn-ghost"
										style="color: oklch(0.65 0.02 250);"
										title="Cancel (Esc)"
										disabled={sendingInput}
									>
										Cancel
									</button>
								</div>
								<div
									class="text-[10px] opacity-50"
									style="color: oklch(0.65 0.02 250);"
								>
									Press Enter to send, Escape to cancel
								</div>
							</div>
						{:else}
							<!-- Options as clickable buttons -->
							<div class="flex flex-wrap gap-1.5">
								{#each detectedQuestion.options as opt (opt.index)}
									<button
										onclick={() =>
											selectQuestionOption(opt, detectedQuestion.isMultiSelect)}
										class="btn btn-xs gap-1 transition-all"
										class:btn-primary={opt.isSelected &&
											!detectedQuestion.isMultiSelect}
										class:btn-outline={!opt.isSelected ||
											detectedQuestion.isMultiSelect}
										style={opt.isSelected && detectedQuestion.isMultiSelect
											? "background: oklch(0.35 0.12 250); border-color: oklch(0.50 0.15 250); color: oklch(0.95 0.02 250);"
											: !opt.isSelected
												? "background: oklch(0.25 0.03 250); border-color: oklch(0.40 0.03 250); color: oklch(0.80 0.02 250);"
												: ""}
										title={opt.description || opt.label}
										disabled={sendingInput || !onSendInput}
									>
										<!-- Checkbox/radio indicator for multi-select -->
										{#if detectedQuestion.isMultiSelect}
											<span class="text-[10px] opacity-70">
												{opt.isSelected ? "☑" : "☐"}
											</span>
										{/if}
										{opt.label}
									</button>
								{/each}

								<!-- "Other" button - lets user type custom text -->
								<button
									onclick={() =>
										activateOtherInputMode(detectedQuestion.options.length)}
									class="btn btn-xs btn-outline gap-1"
									style="background: oklch(0.20 0.04 45); border-color: oklch(0.45 0.10 45); color: oklch(0.80 0.08 45);"
									title="Type a custom response"
									disabled={sendingInput || !onSendInput}
								>
									<svg
										class="w-3 h-3"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
										/>
									</svg>
									Other
								</button>

								<!-- Confirm button for multi-select -->
								{#if detectedQuestion.isMultiSelect}
									<button
										onclick={confirmMultiSelect}
										class="btn btn-xs btn-success gap-1"
										title="Confirm selection (Enter)"
										disabled={sendingInput || !onSendInput}
									>
										<svg
											class="w-3 h-3"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2.5"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M5 13l4 4L19 7"
											/>
										</svg>
										Done
									</button>
								{/if}
							</div>

							<!-- Hint text -->
							<div
								class="text-[10px] mt-1.5 opacity-50"
								style="color: oklch(0.65 0.02 250);"
							>
								{#if detectedQuestion.isMultiSelect}
									Click options to toggle, then Done to confirm
								{:else}
									Click an option to select, or "Other" to type a custom
									response
								{/if}
							</div>
						{/if}
					</div>
				{/if}

				<!-- Human Actions Required: Display when agent outputs [JAT:HUMAN_ACTION] markers or jat-signal action -->
				{#if detectedHumanActions.length > 0}
					<div
						class="mb-2 p-2.5 rounded-lg"
						style="background: linear-gradient(135deg, oklch(0.25 0.08 50) 0%, oklch(0.22 0.05 45) 100%); border: 1px solid oklch(0.45 0.15 50);"
					>
						<!-- Header -->
						<div class="flex flex-col gap-1 mb-2">
							<div class="flex items-center gap-2">
								<span
									class="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold"
									style="background: oklch(0.40 0.18 50); color: oklch(0.98 0.02 250);"
								>
									🧑 HUMAN
								</span>
								<span
									class="text-xs font-semibold"
									style="color: oklch(0.95 0.08 50);"
								>
									{pendingHumanActionsCount > 0
										? `${pendingHumanActionsCount} action${pendingHumanActionsCount > 1 ? "s" : ""} required`
										: "All actions completed"}
								</span>
								{#if pendingHumanActionsCount === 0}
									<svg
										class="w-4 h-4"
										style="color: oklch(0.70 0.20 145);"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M5 13l4 4L19 7"
										/>
									</svg>
								{/if}
							</div>
							<!-- Signal action title as subtitle if available -->
							{#if signalActionData?.title && signalActionData.items?.length}
								<span
									class="text-[11px] font-medium pl-0.5"
									style="color: oklch(0.75 0.05 50);"
								>
									{signalActionData.title}
								</span>
							{/if}
						</div>

						<!-- Action items as checklist -->
						<div class="flex flex-col gap-1.5">
							{#each detectedHumanActions as action (action.title)}
								<button
									type="button"
									onclick={() => toggleHumanAction(action.title)}
									class="flex items-start gap-2 p-2 rounded text-left transition-all"
									style="background: {action.completed
										? 'oklch(0.20 0.02 250)'
										: 'oklch(0.28 0.04 50)'}; border: 1px solid {action.completed
										? 'oklch(0.35 0.02 250)'
										: 'oklch(0.40 0.08 50)'};"
									title="Click to mark as {action.completed
										? 'pending'
										: 'done'}"
								>
									<!-- Checkbox -->
									<span
										class="flex-shrink-0 w-4 h-4 rounded flex items-center justify-center mt-0.5"
										style="background: {action.completed
											? 'oklch(0.55 0.20 145)'
											: 'oklch(0.30 0.02 250)'}; border: 1px solid {action.completed
											? 'oklch(0.65 0.20 145)'
											: 'oklch(0.45 0.02 250)'};"
									>
										{#if action.completed}
											<svg
												class="w-3 h-3"
												style="color: oklch(0.98 0.01 250);"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												stroke-width="3"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M5 13l4 4L19 7"
												/>
											</svg>
										{/if}
									</span>
									<!-- Action content -->
									<div class="flex-1 min-w-0">
										<div
											class="text-xs font-semibold {action.completed
												? 'line-through opacity-60'
												: ''}"
											style="color: {action.completed
												? 'oklch(0.60 0.02 250)'
												: 'oklch(0.82 0.12 300)'};"
										>
											{action.title}
										</div>
										{#if action.description && !action.completed}
											<div
												class="text-[11px] mt-0.5"
												style="color: oklch(0.75 0.10 300);"
											>
												{action.description}
											</div>
										{/if}
									</div>
								</button>
							{/each}
						</div>

						<!-- Hint -->
						<div
							class="text-[10px] mt-2 opacity-50"
							style="color: oklch(0.65 0.02 250);"
						>
							Complete these manual steps before marking task as done
						</div>
					</div>
				{/if}

				<!-- Suggested Tasks Panel: Display when badge is clicked and tasks exist -->
				{#if suggestedTasksExpanded && hasSuggestedTasks}
					<div
						class="mb-2 p-2.5 rounded-lg"
						style="background: linear-gradient(135deg, oklch(0.25 0.08 250) 0%, oklch(0.22 0.05 245) 100%); border: 1px solid oklch(0.45 0.15 250);"
					>
						<!-- Header -->
						<div class="flex items-center justify-between gap-2 mb-2">
							<div class="flex items-center gap-2">
								<span
									class="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold"
									style="background: oklch(0.40 0.18 250); color: oklch(0.98 0.02 250);"
								>
									💡 SUGGESTED
								</span>
								<span
									class="text-xs font-semibold"
									style="color: oklch(0.95 0.08 250);"
								>
									{detectedSuggestedTasks.length} task{detectedSuggestedTasks.length >
									1
										? "s"
										: ""} to create
								</span>
							</div>
							<!-- Close button -->
							<button
								type="button"
								class="btn btn-ghost btn-xs"
								onclick={() => (suggestedTasksExpanded = false)}
								title="Close"
							>
								<svg
									class="w-3 h-3"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						</div>

						<!-- Task items list -->
						<div class="flex flex-col gap-1.5">
							{#each detectedSuggestedTasks as suggestedTask, index (getSuggestedTaskKey(suggestedTask, index))}
								{@const taskKey = getSuggestedTaskKey(suggestedTask, index)}
								<div
									class="flex items-start gap-2 p-2 rounded text-left"
									style="background: oklch(0.28 0.04 250); border: 1px solid oklch(0.40 0.08 250);"
								>
									<!-- Priority badge -->
									<span
										class="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold mt-0.5"
										style="background: {suggestedTask.priority === 0
											? 'oklch(0.50 0.20 25)'
											: suggestedTask.priority === 1
												? 'oklch(0.55 0.18 50)'
												: suggestedTask.priority === 2
													? 'oklch(0.50 0.15 250)'
													: 'oklch(0.40 0.05 250)'}; color: oklch(0.98 0.02 250);"
									>
										P{suggestedTask.priority}
									</span>
									<!-- Task content -->
									<div class="flex-1 min-w-0">
										<div
											class="text-xs font-semibold"
											style="color: oklch(0.95 0.05 250);"
										>
											{suggestedTask.title}
										</div>
										{#if suggestedTask.description}
											<div
												class="text-[11px] mt-0.5 opacity-70 line-clamp-2"
												style="color: oklch(0.80 0.02 250);"
											>
												{suggestedTask.description}
											</div>
										{/if}
										{#if suggestedTask.reason}
											<div
												class="text-[10px] mt-1 italic opacity-50"
												style="color: oklch(0.70 0.05 250);"
											>
												Reason: {suggestedTask.reason}
											</div>
										{/if}
									</div>
									<!-- Type badge -->
									<span
										class="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono opacity-70"
										style="background: oklch(0.35 0.02 250); color: oklch(0.85 0.02 250);"
									>
										{suggestedTask.type}
									</span>
								</div>
							{/each}
						</div>

						<!-- Hint -->
						<div
							class="text-[10px] mt-2 opacity-50"
							style="color: oklch(0.65 0.02 250);"
						>
							Agent-suggested tasks from recent output. Review and create as
							needed.
						</div>
					</div>
				{/if}

				<!-- Error banner for failed message sends -->
				{#if sendInputError}
					<div
						class="flex items-center gap-2 px-3 py-2 mb-2 text-xs rounded"
						style="background: oklch(0.35 0.12 25 / 0.2); border: 1px solid oklch(0.55 0.15 25 / 0.4); color: oklch(0.85 0.10 25);"
					>
						<svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
						</svg>
						<span class="flex-1">{sendInputError}</span>
						<button
							class="btn btn-xs btn-ghost"
							style="color: oklch(0.80 0.10 25);"
							onclick={() => sendInputError = null}
							title="Dismiss"
						>
							<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
				{/if}

				<!-- Text input: [attach][autoscroll][stream][keybd▼] LEFT | input MIDDLE | [action buttons] RIGHT -->
				<div class="flex gap-1.5 items-end">
					<!-- LEFT: Control buttons (always visible) -->
					<div class="flex items-center gap-0.5 flex-shrink-0 pb-0.5">
						<!-- Attach Terminal button -->
						<button
							class="btn btn-xs btn-ghost"
							onclick={async () => {
								if (sessionName) {
									try {
										await fetch(
											`/api/work/${encodeURIComponent(sessionName)}/attach`,
											{
												method: "POST",
											},
										);
									} catch (e) {
										console.error(
											"[SessionCard] Failed to attach terminal:",
											e,
										);
									}
								}
							}}
							title="Attach terminal (open in tmux)"
							disabled={!sessionName}
						>
							<svg
								class="w-3 h-3"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
								/>
							</svg>
						</button>
						<!-- Auto-scroll toggle -->
						<button
							class="btn btn-xs btn-ghost"
							onclick={toggleAutoScroll}
							title={autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
						>
							<svg
								class="w-3 h-3 transition-colors"
								class:text-primary={autoScroll}
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3"
								/>
							</svg>
						</button>
						<!-- Live stream toggle -->
						<button
							class="btn btn-xs btn-ghost"
							onclick={() => {
								liveStreamEnabled = !liveStreamEnabled;
								if (!liveStreamEnabled && lastStreamedText) {
									lastStreamedText = "";
									maxStreamedLength = 0;
								}
							}}
							title={liveStreamEnabled
								? "Live streaming ON - Characters sent as you type"
								: "Live streaming OFF - Send on Enter only"}
						>
							<svg
								class="w-3 h-3 transition-colors"
								class:text-info={liveStreamEnabled}
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
								/>
							</svg>
						</button>
						<!-- Keyboard keys dropdown (hover to show ESC, ^C, Enter) -->
						<div class="dropdown dropdown-hover dropdown-top">
							<button
								tabindex="0"
								class="btn btn-xs btn-ghost font-mono text-[10px]"
								title="Keyboard shortcuts (hover for menu)"
								disabled={sendingInput || !onSendInput}
							>
								<svg
									class="w-3.5 h-3.5"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="1.5"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M2.25 6.75A2.25 2.25 0 014.5 4.5h15a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-15A2.25 2.25 0 012.25 17.25V6.75zM6 9.75h.008v.008H6V9.75zm0 3h.008v.008H6v-.008zm0 3h.008v.008H6v-.008zm3-6h.008v.008H9V9.75zm0 3h.008v.008H9v-.008zm3-3h.008v.008H12V9.75zm0 3h.008v.008H12v-.008zm3-3h.008v.008H15V9.75zm0 3h.008v.008H15v-.008zm3-3h.008v.008H18V9.75zm0 3h.008v.008H18v-.008zM9 15.75h6"
									/>
								</svg>
							</button>
							<ul
								tabindex="0"
								class="dropdown-content z-[100] menu menu-xs p-1 shadow-lg bg-base-200 rounded-box w-auto min-w-[100px]"
							>
								<li class="menu-title px-2 py-0.5 text-[9px] opacity-60">
									Arrows
								</li>
								<li>
									<div class="flex gap-0.5 p-0.5">
										<button
											onclick={() => sendKey("up")}
											class="btn btn-xs btn-ghost font-mono text-[10px] px-1.5"
											disabled={sendingInput || !onSendInput}
											title="Up Arrow">↑</button
										>
										<button
											onclick={() => sendKey("down")}
											class="btn btn-xs btn-ghost font-mono text-[10px] px-1.5"
											disabled={sendingInput || !onSendInput}
											title="Down Arrow">↓</button
										>
										<button
											onclick={() => sendKey("left")}
											class="btn btn-xs btn-ghost font-mono text-[10px] px-1.5"
											disabled={sendingInput || !onSendInput}
											title="Left Arrow">←</button
										>
										<button
											onclick={() => sendKey("right")}
											class="btn btn-xs btn-ghost font-mono text-[10px] px-1.5"
											disabled={sendingInput || !onSendInput}
											title="Right Arrow">→</button
										>
									</div>
								</li>
								<li>
									<button
										onclick={() => sendKey("ctrl-l")}
										class="font-mono text-[10px] tracking-wider uppercase whitespace-nowrap"
										disabled={sendingInput || !onSendInput}
										title="Clear screen"
									>
										^L Clear
									</button>
								</li>
								<li>
									<button
										onclick={() => sendKey("tab")}
										class="font-mono text-[10px] tracking-wider uppercase whitespace-nowrap"
										disabled={sendingInput || !onSendInput}
									>
										Tab ⇥
									</button>
								</li>
								<li>
									<button
										onclick={() => sendKey("enter")}
										class="font-mono text-[10px] tracking-wider whitespace-nowrap"
										disabled={sendingInput || !onSendInput}
									>
										Enter ⤶
									</button>
								</li>
								<li>
									<button
										onclick={() => sendKey("escape")}
										class="font-mono text-[10px] tracking-wider uppercase whitespace-nowrap"
										disabled={sendingInput || !onSendInput}
									>
										ESC
									</button>
								</li>
								<li>
									<button
										onclick={() => sendKey("ctrl-c")}
										oncontextmenu={(e) => {
											e.preventDefault();
											setCtrlCIntercept(!ctrlCInterceptEnabled);
										}}
										class="font-mono text-[10px] tracking-wider uppercase whitespace-nowrap {!ctrlCInterceptEnabled
											? 'opacity-50 line-through'
											: ''}"
										title={ctrlCInterceptEnabled
											? "Send Ctrl+C — Right-click to allow copy"
											: "Ctrl+C copies — Right-click to enable interrupt"}
										disabled={sendingInput || !onSendInput}
									>
										^C
									</button>
								</li>
							</ul>
						</div>
					</div>

					<!-- MIDDLE: Text input (flexible width) with clear button and streaming indicator -->
					<div
						class="relative flex-1 min-w-0"
						role="textbox"
						tabindex="-1"
					>
						<textarea
							bind:this={inputRef}
							bind:value={inputText}
							onkeydown={handleInputKeydown}
							onpaste={handlePaste}
							oninput={handleInputChange}
							placeholder={liveStreamEnabled
								? "Type to stream live... (Enter to submit)"
								: "Type and press Enter..."}
							rows="1"
							class="textarea textarea-xs w-full font-mono pr-6 resize-none overflow-hidden leading-tight {liveStreamEnabled &&
							inputText
								? 'ring-1 ring-info/50'
								: ''} {escapeFlash ? 'escape-flash' : ''} {pasteFlash ? 'paste-flash' : ''} {tabFlash ? 'tab-flash' : ''} {copyFlash ? 'copy-flash' : ''} {submitFlash ? 'submit-flash' : ''} {voiceFlash ? 'voice-flash' : ''} {attachFlash ? 'attach-flash' : ''} {inputTextFlash ? 'input-text-flash' : ''} {arrowFlash ? 'arrow-flash' : ''}"
							style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.80 0.02 250); min-height: 24px; max-height: 96px;"
							disabled={sendingInput || !onSendInput}
							data-session-input="true"
						></textarea>
						<!-- Text exit animation overlay -->
						{#if exitingText}
							<div
								class="absolute inset-0 flex items-center px-2 font-mono overflow-hidden"
								style="background: oklch(0.22 0.02 250); color: oklch(0.80 0.02 250); font-size: 0.75rem; perspective: 500px;"
							>
								<span class="text-exit-animation" style="transform-origin: left center; display: inline-block;">{exitingText}</span>
							</div>
						{/if}
						{#if inputText.trim()}
							<button
								type="button"
								class="absolute right-1.5 top-2 p-0.5 rounded-full transition-colors"
								style="color: oklch(0.55 0.02 250);"
								onmouseenter={(e) =>
									(e.currentTarget.style.color = "oklch(0.75 0.02 250)")}
								onmouseleave={(e) =>
									(e.currentTarget.style.color = "oklch(0.55 0.02 250)")}
								onclick={() => {
									inputText = "";
									lastStreamedText = "";
									maxStreamedLength = 0;
									setTimeout(handleInputChange, 0);
									// Trigger visual flash feedback (same as Escape)
									escapeFlash = true;
									setTimeout(() => {
										escapeFlash = false;
									}, 300);
								}}
								aria-label="Clear input"
								disabled={sendingInput || !onSendInput}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="2"
									stroke="currentColor"
									class="w-3 h-3"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						{/if}
						<!-- Streaming indicator dot -->
						{#if liveStreamEnabled && isStreaming}
							<div
								class="absolute left-1.5 top-1.5 w-1.5 h-1.5 rounded-full bg-info animate-pulse"
								title="Streaming to terminal"
							></div>
						{/if}
					</div>

					<!-- Voice input (local whisper) -->
					<div class="pb-0.5">
						<VoiceInput
							size="sm"
							ontranscription={handleVoiceTranscription}
							onerror={handleVoiceError}
							onstart={() => {
								voiceFlash = true;
								setTimeout(() => {
									voiceFlash = false;
								}, 300);
							}}
							onend={() => {
								voiceFlash = true;
								setTimeout(() => {
									voiceFlash = false;
								}, 300);
							}}
							disabled={sendingInput || !onSendInput}
						/>
					</div>

					<!-- RIGHT: Action buttons (context-dependent) -->
					<div class="flex items-center gap-0.5 flex-shrink-0 pb-0.5">
						{#if inputText.trim() || attachedFiles.length > 0}
							<!-- User is typing: show Send button -->
							<button
								onclick={sendTextInput}
								class="btn btn-xs btn-primary"
								disabled={sendingInput || !onSendInput}
							>
								{#if sendingInput}
									<span class="loading loading-spinner loading-xs"></span>
								{:else}
									Send
								{/if}
							</button>
						{:else if sessionState === "completed"}
							<!-- Completed state: show auto-close countdown if AUTO_PROCEED, otherwise actionable badge -->
							{#if autoCloseCountdown !== null && !autoCloseHeld}
								<!-- Auto-close countdown UI -->
								<div class="flex items-center gap-2">
									<span
										class="text-xs font-mono font-bold px-2 py-1 rounded"
										style="background: oklch(0.30 0.10 145 / 0.5); color: oklch(0.85 0.15 145); border: 1px solid oklch(0.50 0.15 145);"
									>
										Auto-closing in {autoCloseCountdown}...
									</span>
									<button
										onclick={holdForReview}
										class="btn btn-xs gap-1"
										style="background: linear-gradient(135deg, oklch(0.50 0.15 45) 0%, oklch(0.42 0.12 55) 100%); border: none; color: white; font-weight: 600;"
										title="Cancel auto-close and review"
									>
										<svg
											class="w-3 h-3"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
											/>
										</svg>
										Hold
									</button>
								</div>
							{:else}
								<!-- Standard completed state: actionable badge with cleanup/attach options -->
								<StatusActionBadge
									{sessionState}
									{sessionName}
									{isDormant}
									{dormantTooltip}
									nextTask={nextTaskInfo}
									{nextTaskLoading}
									autoKillCountdown={autoKillCountdownValue}
									onCancelAutoKill={() => cancelAutoKill(sessionName)}
									dropUp={true}
									alignRight={true}
									onAction={handleStatusAction}
									disabled={sendingInput || !onSendInput}
									showCommands={true}
									showEpic={true}
									onCommand={sendWorkflowCommand}
									task={taskForEpicLinking}
									project={defaultProject || null}
									onViewEpic={(epicId) => onTaskClick?.(epicId)}
									onLinkToEpic={() => onTaskDataChange?.()}
								/>
							{/if}
						{:else if sessionState === "ready-for-review" || sessionState === "idle" || (sessionState === "working" && task) || sessionState === "completing" || detectedWorkflowCommands.length > 0}
							<!-- Unified status badge with state-appropriate actions and all commands -->
							<StatusActionBadge
								{sessionState}
								{sessionName}
								{isDormant}
								{dormantTooltip}
								nextTask={nextTaskInfo}
								{nextTaskLoading}
								dropUp={true}
								alignRight={true}
								onAction={handleStatusAction}
								disabled={sendingInput || !onSendInput}
								showCommands={true}
								showEpic={true}
								onCommand={sendWorkflowCommand}
								task={taskForEpicLinking}
								project={defaultProject || null}
								onViewEpic={(epicId) => onTaskClick?.(epicId)}
								onLinkToEpic={() => onTaskDataChange?.()}
							/>
						{:else if detectedOptions.length > 0}
							<!-- Prompt options detected: show quick action buttons -->
							{#each detectedOptions as opt (opt.number)}
								{#if opt.type === "yes"}
									<button
										onclick={() => sendOptionNumber(opt.number)}
										class="btn btn-xs font-mono text-[10px] tracking-wider uppercase"
										style="background: oklch(0.30 0.12 150); border: none; color: oklch(0.95 0.02 250);"
										title={`Option ${opt.number}: ${opt.text}`}
										disabled={sendingInput || !onSendInput}
									>
										<span class="opacity-60 mr-0.5">{opt.number}.</span>Yes
									</button>
								{:else if opt.type === "yes-remember"}
									<button
										onclick={() => sendOptionNumber(opt.number)}
										class="btn btn-xs font-mono text-[10px] tracking-wider uppercase"
										style="background: oklch(0.28 0.10 200); border: none; color: oklch(0.95 0.02 250);"
										title={`Option ${opt.number}: ${opt.text}`}
										disabled={sendingInput || !onSendInput}
									>
										<span class="opacity-60 mr-0.5">{opt.number}.</span>Yes+
									</button>
								{:else if opt.type === "custom"}
									<button
										onclick={() => sendOptionNumber(opt.number)}
										class="btn btn-xs font-mono text-[10px] tracking-wider uppercase"
										style="background: oklch(0.25 0.08 280); border: none; color: oklch(0.85 0.02 250);"
										title={`Option ${opt.number}: ${opt.text}`}
										disabled={sendingInput || !onSendInput}
									>
										<span class="opacity-60 mr-0.5">{opt.number}.</span>Custom
									</button>
								{/if}
							{/each}
						{:else}
							<!-- No task: show Paste button -->
							<button
								onclick={handlePasteButton}
								class="btn btn-xs font-mono text-[10px] tracking-wider uppercase"
								style="background: oklch(0.28 0.08 200); border: none; color: oklch(0.90 0.02 250);"
								title="Paste from clipboard (text or image)"
								disabled={sendingInput || !onSendInput}
							>
								<svg
									class="w-3 h-3"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"
									/>
								</svg>
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Suggested Tasks Modal -->
<SuggestedTasksModal
	isOpen={suggestedTasksModalOpen}
	onClose={() => (suggestedTasksModalOpen = false)}
	tasks={detectedSuggestedTasks}
	onCreateTasks={createSuggestedTasksViaBulkApi}
	{agentName}
	{sessionName}
	onTaskClick={(taskId) => onTaskClick?.(taskId)}
/>

<!-- Rollback Confirmation Modal -->
<RollbackConfirmModal
	bind:isOpen={rollbackModalOpen}
	gitSha={rollbackEvent?.git_sha || ""}
	timestamp={rollbackEvent?.timestamp}
	{sessionName}
	onClose={() => {
		rollbackModalOpen = false;
		rollbackEvent = null;
	}}
	onConfirm={() => {
		successToast(`Rolled back to ${rollbackEvent?.git_sha?.slice(0, 7)}`);
	}}
/>

<style>
	.unified-agent-card {
		position: relative;
		transition: all 0.2s ease;
	}

	.unified-agent-card:hover {
		box-shadow: 0 4px 12px oklch(0 0 0 / 0.15);
	}

	@keyframes shimmer {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(100%);
		}
	}

	/* Subtle pulse animation for needs-input state */
	@keyframes pulse-subtle {
		0%,
		100% {
			opacity: 1;
			box-shadow: 0 0 12px oklch(0.7 0.2 85 / 0.4);
		}
		50% {
			opacity: 0.95;
			box-shadow: 0 0 20px oklch(0.7 0.2 85 / 0.6);
		}
	}

	.animate-pulse-subtle {
		animation: pulse-subtle 2s ease-in-out infinite;
	}

	/* Flash animation for Alt+C complete action */
	@keyframes complete-flash {
		0% {
			border-color: oklch(0.65 0.2 145);
			box-shadow: 0 0 0 oklch(0.65 0.2 145 / 0);
		}
		15% {
			border-color: oklch(0.75 0.25 145);
			box-shadow: 0 0 30px oklch(0.65 0.2 145 / 0.8);
		}
		30% {
			border-color: oklch(0.7 0.22 145);
			box-shadow: 0 0 20px oklch(0.65 0.2 145 / 0.5);
		}
		100% {
			border-color: oklch(0.35 0.02 250);
			box-shadow: 0 0 0 oklch(0.65 0.2 145 / 0);
		}
	}

	.complete-flash-animation {
		animation: complete-flash 1.5s ease-out;
	}
</style>
