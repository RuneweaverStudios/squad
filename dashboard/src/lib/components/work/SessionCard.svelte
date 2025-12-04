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
	import { ansiToHtml } from "$lib/utils/ansiToHtml";
	import TokenUsageDisplay from "$lib/components/TokenUsageDisplay.svelte";
	import TaskIdBadge from "$lib/components/TaskIdBadge.svelte";
	import AgentAvatar from "$lib/components/AgentAvatar.svelte";
	import Sparkline from "$lib/components/Sparkline.svelte";
	import AnimatedDigits from "$lib/components/AnimatedDigits.svelte";
	import {
		playTaskCompleteSound,
		playNeedsInputSound,
		playReadyForReviewSound,
	} from "$lib/utils/soundEffects";
	import VoiceInput from "$lib/components/VoiceInput.svelte";
	import StatusActionBadge from "./StatusActionBadge.svelte";
	import ServerStatusBadge from "./ServerStatusBadge.svelte";
	import TerminalActivitySparkline from "./TerminalActivitySparkline.svelte";
	import StreakCelebration from "$lib/components/StreakCelebration.svelte";
	import {
		SESSION_STATE_VISUALS,
		SERVER_STATE_VISUALS,
		type SessionStateVisual,
		type ServerStateVisual,
		type ServerState,
		getServerStateVisual,
	} from "$lib/config/statusColors";
	import HorizontalResizeHandle from "$lib/components/HorizontalResizeHandle.svelte";
	import { setHoveredSession } from "$lib/stores/hoveredSession";
	import { findHumanActionMarkers } from "$lib/utils/markerParser";
	import { getTerminalHeight, getCtrlCIntercept, setCtrlCIntercept } from "$lib/stores/preferences.svelte";

	// Props - aligned with workSessions.svelte.ts types
	interface Task {
		id: string;
		title?: string;
		description?: string;
		status?: string;
		priority?: number;
		issue_type?: string;
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
	}

	let {
		mode = "agent",
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
		// Server mode callbacks
		onStopServer,
		onRestartServer,
		onStartServer,
		// Shared
		class: className = "",
		isHighlighted = false,
		cardWidth,
		onWidthChange,
	}: Props = $props();

	// Derived mode helpers
	const isAgentMode = $derived(mode === "agent" || mode === "compact");
	const isServerMode = $derived(mode === "server");
	const isCompactMode = $derived(mode === "compact");

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

	// Real-time elapsed time clock (ticks every second)
	let currentTime = $state(Date.now());
	let elapsedTimeInterval: ReturnType<typeof setInterval> | null = null;

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

	// Fetch question data from API
	async function fetchQuestionData() {
		if (!sessionName) return;
		try {
			const response = await fetch(
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
		try {
			await fetch(`/api/work/${encodeURIComponent(sessionName)}/question`, {
				method: "DELETE",
			});
			apiQuestionData = null;
		} catch (error) {
			// Silently fail
		}
	}

	// Dismiss terminal-parsed question UI
	function dismissTerminalQuestion() {
		dismissedTerminalQuestion = true;
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

	onMount(() => {
		// Update currentTime every second for real-time elapsed time display
		elapsedTimeInterval = setInterval(() => {
			currentTime = Date.now();
		}, 1000);

		// Poll for question data every 500ms when in needs-input state
		fetchQuestionData();
		questionPollInterval = setInterval(fetchQuestionData, 500);

		// Load saved card width from localStorage
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
					internalWidth = parsed;
				}
			}
		}

		// Set up ResizeObserver after a short delay to ensure DOM is fully ready
		// This auto-resizes tmux session to match the SessionCard width
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
		}, 100);
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

	// Track previous output length to detect submissions from attached terminal
	let previousOutputLength = $state(0);

	// Clear textarea when streamed text is submitted in terminal
	$effect(() => {
		if (!liveStreamEnabled || !lastStreamedText || !output) {
			previousOutputLength = output?.length || 0;
			return;
		}

		// Only check if output grew significantly (not just echo of typed chars)
		const outputGrowth = output.length - previousOutputLength;
		if (outputGrowth <= 0) {
			previousOutputLength = output.length;
			return;
		}

		const newContent = output.slice(previousOutputLength);

		// Detect submission: new content contains the streamed text AND has a newline
		// The newline indicates Enter was pressed (either echoed or from response)
		const hasStreamedText = newContent.includes(lastStreamedText);
		const hasNewline = newContent.includes("\n");
		const significantGrowth = outputGrowth > lastStreamedText.length; // More output than just echo

		if (
			hasStreamedText &&
			hasNewline &&
			significantGrowth &&
			lastStreamedText.length >= 2
		) {
			// Text was likely submitted in terminal - clear textarea
			inputText = "";
			lastStreamedText = "";
			setTimeout(autoResizeTextarea, 0);
		}

		previousOutputLength = output.length;
	});

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

	// Tmux session resize state
	// Tracks the output container width and resizes tmux to match
	// Using $state so the $effect guard works correctly
	let resizeObserverSetup = $state(false);
	let lastResizedWidth = $state(0);
	let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	const RESIZE_DEBOUNCE_MS = 300; // Wait for resize to stabilize
	const MIN_COLUMN_CHANGE = 5; // Only resize if columns change by this much

	// Manual card width resize state
	// Internal width state (used when cardWidth prop not provided)
	let internalWidth = $state<number | undefined>(undefined);
	const MIN_CARD_WIDTH = 300; // Minimum card width in pixels
	const MAX_CARD_WIDTH = 1200; // Maximum card width in pixels
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

	/**
	 * Handle manual resize via drag handle
	 */
	function handleManualResize(deltaX: number) {
		const currentWidth = effectiveWidth ?? 400; // Default if no width set
		const newWidth = Math.max(
			MIN_CARD_WIDTH,
			Math.min(MAX_CARD_WIDTH, currentWidth + deltaX),
		);

		if (onWidthChange) {
			onWidthChange(newWidth);
		} else {
			internalWidth = newWidth;
		}
	}

	/**
	 * Called when resize drag ends - trigger tmux resize with final width and persist
	 */
	function handleResizeEnd() {
		// Trigger tmux resize with final width
		if (scrollContainerRef) {
			const rect = scrollContainerRef.getBoundingClientRect();
			const columns = calculateColumns(rect.width);
			resizeTmuxSession(columns);
		}

		// Persist width to localStorage if using internal state
		if (
			typeof window !== "undefined" &&
			sessionName &&
			internalWidth &&
			!cardWidth
		) {
			localStorage.setItem(
				`${STORAGE_KEY_PREFIX}${sessionName}`,
				internalWidth.toString(),
			);
		}
	}

	// Monospace font character width estimation
	// text-xs is typically 12px, monospace chars are ~0.6em wide = ~7.2px
	const CHAR_WIDTH_PX = 7.2;
	// Horizontal padding in the output container (p-3 = 12px on each side)
	const CONTAINER_PADDING_PX = 24;

	/**
	 * Calculate the number of columns that fit in a given pixel width
	 */
	function calculateColumns(pixelWidth: number): number {
		const availableWidth = pixelWidth - CONTAINER_PADDING_PX;
		const columns = Math.floor(availableWidth / CHAR_WIDTH_PX);
		// Clamp to reasonable range
		return Math.max(40, Math.min(columns, 300));
	}

	/**
	 * Resize tmux session to match container width (height is user-configurable)
	 */
	async function resizeTmuxSession(columns: number) {
		if (!sessionName) return;

		try {
			const response = await fetch(
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

			if (response.ok) {
				lastResizedWidth = columns;
			}
		} catch (error) {
			// Silently fail - resize is a UX enhancement, not critical
			console.debug("Failed to resize tmux session:", error);
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

	// Live streaming input state
	// When enabled, characters are streamed to terminal as user types
	// This enables instant slash command filtering in Claude Code
	let liveStreamEnabled = $state(true); // Default ON for better UX
	let lastStreamedText = $state(""); // Track what we've already sent
	let streamDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	const STREAM_DEBOUNCE_MS = 50; // Short debounce for responsive feel
	let isStreaming = $state(false); // Track if we're actively streaming

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
			if (previousText) {
				isStreaming = true;
				try {
					// Send Ctrl+U to clear the current line
					await onSendInput("ctrl-u", "key");
					lastStreamedText = "";
				} finally {
					isStreaming = false;
				}
			}
			return;
		}

		isStreaming = true;
		try {
			if (currentText.startsWith(previousText)) {
				// Text was appended - send only the new characters (most common case)
				const newChars = currentText.slice(previousText.length);
				if (newChars) {
					await onSendInput(newChars, "raw");
				}
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
	// NOTE: Removed auto-focus on hover - it was causing accidental input capture
	// when user typed in other inputs while hovering over the card
	function handleCardMouseEnter() {
		setHoveredSession(sessionName);
	}

	function handleCardMouseLeave() {
		setHoveredSession(null);
	}

	// Attached images (pending upload)
	interface AttachedImage {
		id: string;
		blob: Blob;
		preview: string; // Data URL for thumbnail
		name: string;
	}
	let attachedImages = $state<AttachedImage[]>([]);

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

		// Only look at recent output (last 3000 chars)
		const recentOutput = output.slice(-3000);

		// Check for the navigation footer which indicates an active question prompt
		const hasQuestionUI =
			/Enter to select.*(?:Tab|Arrow).*(?:navigate|keys).*Esc to cancel/i.test(
				recentOutput,
			);
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

			for (const line of lines) {
				// Skip empty lines and the navigation footer
				if (!line.trim()) continue;
				if (/Enter to select/i.test(line)) break;

				// Check if this line is an option (with ❯ cursor or aligned unselected)
				// The ❯ may have leading whitespace, so we check for it anywhere in the line start
				const selectedMatch = line.match(/^\s*❯\s+(.+?)(?:\s{2,}(.+))?$/);
				// Unselected options have spaces where ❯ would be (typically 2+ spaces before text)
				const unselectedMatch = line.match(
					/^\s{2,}([^\s❯].+?)(?:\s{2,}(.+))?$/,
				);

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
	 * States:
	 * - 'starting': Task assigned, agent initializing (no [JAT:WORKING] marker yet)
	 * - 'working': Has active in_progress task with [JAT:WORKING] marker
	 * - 'compacting': Context compaction in progress (via PreCompact hook)
	 * - 'needs-input': Agent blocked, needs user to provide clarification (orange)
	 * - 'ready-for-review': Work done, awaiting user review (yellow)
	 * - 'completing': User triggered /jat:complete, agent running completion steps (teal)
	 * - 'completed': Task was closed, showing completion summary (green)
	 * - 'idle': No task, new session (gray)
	 */
	type SessionState =
		| "starting"
		| "working"
		| "compacting"
		| "needs-input"
		| "ready-for-review"
		| "completing"
		| "completed"
		| "idle";

	const sessionState = $derived.by((): SessionState => {
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

	// Check if auto-proceed mode is active (for future autopilot feature)
	const isAutoProceed = $derived(
		output ? /\[JAT:AUTO_PROCEED\]/.test(output.slice(-3000)) : false,
	);

	// Detect human action markers in output
	// Format: [JAT:HUMAN_ACTION {"title":"...","description":"..."}]
	// Uses unified marker parser with balanced-brace JSON extraction
	interface HumanAction {
		title: string;
		description: string;
		completed: boolean;
	}

	let humanActionCompletedState = $state<Map<string, boolean>>(new Map());

	const detectedHumanActions = $derived.by((): HumanAction[] => {
		if (!output) return [];

		// Look at a larger window for human actions (they appear in completion summary)
		const recentOutput = output.slice(-6000);

		// Use unified marker parser for safe JSON extraction
		const markers = findHumanActionMarkers(recentOutput);

		return markers.map((marker) => ({
			title: marker.action.title,
			description: marker.action.description,
			completed: humanActionCompletedState.get(marker.action.title) || false,
		}));
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

	// Task to display - either active task or last completed task
	const displayTask = $derived(
		task || (sessionState === "completed" ? lastCompletedTask : null),
	);

	// Get visual config from centralized statusColors.ts
	const stateVisual = $derived(
		SESSION_STATE_VISUALS[sessionState] || SESSION_STATE_VISUALS.idle,
	);

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

	// Send a workflow command (e.g., /jat:complete)
	async function sendWorkflowCommand(command: string) {
		if (!onSendInput) {
			console.warn(
				"[SessionCard] sendWorkflowCommand: onSendInput is not defined",
			);
			return;
		}
		setSendingInput(true);
		try {
			// Send Ctrl+C first to clear any stray characters in input
			await onSendInput("ctrl-c", "key");
			await new Promise((r) => setTimeout(r, 50));
			// Send the command text (API appends Enter for type='text')
			const textResult = await onSendInput(command, "text");
			if (textResult === false) {
				console.warn(
					"[SessionCard] sendWorkflowCommand: Failed to send command text",
				);
				// Don't return early - fall through to finally block to reset sendingInput
			} else {
				// Send extra Enter after delay - Claude Code needs double Enter for slash commands
				await new Promise((r) => setTimeout(r, 100));
				await onSendInput("enter", "key");
			}
		} catch (err) {
			console.error("[SessionCard] sendWorkflowCommand error:", err);
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
				// Run /jat:complete command
				await sendWorkflowCommand("/jat:complete");
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

		// Need either text or images to send
		const hasText = inputText.trim().length > 0;
		const hasImages = attachedImages.length > 0;
		if (!hasText && !hasImages) return;

		setSendingInput(true);
		try {
			// Upload all attached images first and collect paths
			const imagePaths: string[] = [];
			for (const img of attachedImages) {
				const formData = new FormData();
				formData.append("image", img.blob, `pasted-image-${Date.now()}.png`);
				formData.append("sessionName", sessionName);

				const response = await fetch("/api/work/upload-image", {
					method: "POST",
					body: formData,
				});

				if (response.ok) {
					const { filePath } = await response.json();
					imagePaths.push(filePath);
				} else {
					console.error("Failed to upload image:", img.name);
				}
			}

			// Build the message: image paths first, then user text
			let message = "";
			if (imagePaths.length > 0) {
				message = imagePaths.join(" ");
				if (hasText) {
					message += " " + inputText.trim();
				}
			} else if (hasText) {
				message = inputText.trim();
			}

			if (message) {
				// If live streaming is enabled and we've already streamed the text,
				// just send Enter to submit (text is already in terminal)
				if (
					liveStreamEnabled &&
					lastStreamedText === inputText.trim() &&
					!hasImages
				) {
					// Text already in terminal, just submit
					await onSendInput("enter", "key");
				} else {
					// Not streaming or text differs - send full text
					// Clear any partial streamed text first if streaming was on
					if (liveStreamEnabled && lastStreamedText) {
						await onSendInput("ctrl-u", "key");
						await new Promise((r) => setTimeout(r, 20));
					}
					// Send text first (API adds Enter), then send explicit Enter after delay
					// Double Enter ensures Claude Code registers the submission
					await onSendInput(message, "text");
					await new Promise((r) => setTimeout(r, 100));
					await onSendInput("enter", "key");
				}
			}

			// Clear input and attached images on success
			inputText = "";
			lastStreamedText = ""; // Reset streamed text tracking
			// Reset textarea height after clearing
			setTimeout(autoResizeTextarea, 0);
			// Revoke object URLs to prevent memory leaks
			for (const img of attachedImages) {
				URL.revokeObjectURL(img.preview);
			}
			attachedImages = [];
		} finally {
			setSendingInput(false);
		}
	}

	// Handle keyboard shortcuts in input
	function handleInputKeydown(e: KeyboardEvent) {
		if (e.key === "Enter" && !e.shiftKey) {
			// Enter without Shift submits the input
			e.preventDefault();
			sendTextInput();
		} else if (e.key === "Enter" && e.shiftKey) {
			// Shift+Enter inserts newline (default textarea behavior)
			// Let it happen naturally, then resize
			setTimeout(handleInputChange, 0);
		} else if (e.key === "Tab" && liveStreamEnabled && onSendInput) {
			// When streaming, send Tab to terminal for autocomplete
			e.preventDefault();
			onSendInput("tab", "key");
		} else if (e.key === "Escape") {
			// Clear input text on Escape
			e.preventDefault();
			inputText = "";
			// If streaming was active and we had text, clear terminal input too
			if (liveStreamEnabled && lastStreamedText && onSendInput) {
				onSendInput("ctrl-u", "key");
			}
			lastStreamedText = ""; // Reset streamed text tracking
			// Reset textarea height
			setTimeout(autoResizeTextarea, 0);
		} else if (e.key === "c" && e.ctrlKey && ctrlCInterceptEnabled) {
			// Ctrl+C: Send interrupt signal to tmux AND clear local input
			// (Only when intercept is enabled; otherwise let browser handle copy)
			e.preventDefault();
			inputText = "";
			lastStreamedText = "";
			setTimeout(autoResizeTextarea, 0);
			// Send Ctrl+C to tmux to interrupt Claude
			if (onSendInput) {
				sendKey("ctrl-c");
			}
		}
		// Note: Ctrl+V is handled by onpaste event, not here
	}

	// Handle native paste event - only intercept for images, let text paste normally
	function handlePaste(e: ClipboardEvent) {
		if (!onSendInput || !e.clipboardData) return;

		// Check if clipboard contains an image
		const items = e.clipboardData.items;
		for (const item of items) {
			if (item.type.startsWith("image/")) {
				// Intercept image paste
				e.preventDefault();
				const blob = item.getAsFile();
				if (blob) {
					attachImage(blob);
				}
				return;
			}
		}
		// For text, let the native paste happen (don't preventDefault)
	}

	// Attach an image (add to pending list, don't upload yet)
	async function attachImage(blob: Blob) {
		const id = `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const name = `Image ${attachedImages.length + 1}`;

		// Create preview URL
		const preview = URL.createObjectURL(blob);

		attachedImages = [...attachedImages, { id, blob, preview, name }];
	}

	// Remove an attached image
	function removeAttachedImage(id: string) {
		const img = attachedImages.find((i) => i.id === id);
		if (img) {
			URL.revokeObjectURL(img.preview);
		}
		attachedImages = attachedImages.filter((i) => i.id !== id);
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
					await attachImage(blob);
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

	// Render output with ANSI codes
	const renderedOutput = $derived(ansiToHtml(output));
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
		class="unified-agent-card p-2 rounded-lg relative overflow-hidden {className}"
		class:ring-2={isHighlighted || sessionState === "needs-input"}
		class:ring-primary={isHighlighted}
		class:ring-warning={sessionState === "needs-input"}
		class:animate-pulse-subtle={sessionState === "needs-input"}
		style="
			background: linear-gradient(135deg, {stateVisual.bgTint} 0%, oklch(0.18 0.01 250) 100%);
			border-left: 3px solid {stateVisual.accent};
			{sessionState === 'needs-input'
			? 'box-shadow: 0 0 12px oklch(0.70 0.20 85 / 0.4);'
			: ''}
		"
		data-agent-name={agentName}
	>
		<!-- Header: Agent identity + Stats + Status (single row) -->
		<div class="flex items-center justify-between gap-2 mb-2">
			<!-- Left: Avatar + Agent name -->
			<div class="flex items-center gap-2 min-w-0">
				<div
					class="shrink-0 rounded-full leading-[0]"
					style="box-shadow: 0 0 0 2px {stateVisual.accent};"
				>
					<AgentAvatar name={agentName} size={18} />
				</div>
				<span
					class="font-mono text-[11px] font-semibold tracking-wider uppercase truncate"
					style="color: {stateVisual.accent}; text-shadow: 0 0 12px {stateVisual.glow};"
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
				<!-- Status action dropdown -->
				<StatusActionBadge
					{sessionState}
					{sessionName}
					onAction={handleStatusAction}
					variant="integrated"
					alignRight={true}
				/>
			</div>
		</div>

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
		class="card h-full flex flex-col relative rounded-none {className} {isHighlighted
			? 'agent-highlight-flash ring-2 ring-info ring-offset-2 ring-offset-base-100'
			: ''}"
		style="
			background: linear-gradient(135deg, oklch(0.22 0.02 250) 0%, oklch(0.18 0.01 250) 50%, oklch(0.16 0.01 250) 100%);
			border: 1px solid {showCompletionBanner
			? 'oklch(0.65 0.20 145)'
			: 'oklch(0.35 0.02 250)'};
			box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.05), 0 2px 8px oklch(0 0 0 / 0.1);
			width: {effectiveWidth ?? 640}px;
			flex-shrink: 0;
		"
		data-agent-name={agentName}
		in:fly={{ x: 50, duration: 300, delay: 50 }}
		out:fade={{ duration: 200 }}
		onmouseenter={handleCardMouseEnter}
		onmouseleave={handleCardMouseLeave}
	>
		<!-- Horizontal resize handle on right edge -->
		<HorizontalResizeHandle
			onResize={handleManualResize}
			onResizeEnd={handleResizeEnd}
		/>
		<!-- Status accent bar - left edge (color reflects session state) -->
		<div
			class="absolute left-0 top-0 bottom-0 w-1"
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
					style="background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); animation: shimmer 2s infinite;"
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

		{#if isAgentMode}
			<!-- Agent Tab - positioned at top-right, pulled up to top of container -->
			<!-- Combines: Agent Info + Status Dropdown into unified tab -->
			<!-- Background uses gradient that matches the main card's left-to-right gradient -->
			<div
				class="absolute right-[-1px] top-0 -mt-8.5 z-10 flex items-center gap-0 rounded-lg rounded-bl-none rounded-br-none"
				style="background: linear-gradient(90deg, oklch(0.20 0.02 250) 0%, oklch(0.18 0.01 250) 100%); border-left: 0px solid oklch(0.35 0.02 250); border-right: 1px solid oklch(0.35 0.02 250); border-top: 1px solid oklch(0.35 0.02 250);"
			>
				<!-- Agent Info Section -->
				<div class="flex items-center gap-1.5 pl-3 pt-2">
					<AgentAvatar
						name={agentName}
						size={18}
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
					<div class="flex flex-col min-w-0 ml-1">
						<div class="flex items-center gap-1">
							<span
								class="font-mono text-[11px] font-semibold tracking-wider uppercase"
								style="color: {stateVisual.accent}; text-shadow: 0 0 12px {stateVisual.glow};"
							>
								{agentName}
							</span>
							{#if sparklineData && sparklineData.length > 0}
								<div
									class="-mt-3 flex-shrink-0 w-[45px] sm:w-[50px] md:w-[60px] lg:w-[70px] h-[14px]"
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
						</div>
						<!-- Stats row (using shared snippet, no sparkline - it's above) -->
						{@render agentStatsRow(false)}
					</div>
				</div>
				<!-- Status Dropdown Section (divider + badge) -->
				<div class="flex items-center">
					<!-- Shorter, neutral divider -->
					<div
						class="w-px h-4 mx-1.5"
						style="background: oklch(0.40 0.01 250);"
					></div>
					<!-- Human Actions Required indicator -->
					{#if pendingHumanActionsCount > 0}
						<span
							class="badge badge-xs font-mono mr-1.5"
							style="background: oklch(0.45 0.18 50); color: oklch(0.98 0.02 250); border: none;"
							title="{pendingHumanActionsCount} manual action{pendingHumanActionsCount >
							1
								? 's'
								: ''} required"
						>
							🧑 {pendingHumanActionsCount}
						</span>
					{/if}
					<StatusActionBadge
						{sessionState}
						{sessionName}
						onAction={handleStatusAction}
						disabled={sendingInput}
						alignRight={true}
						variant="integrated"
					/>
				</div>
			</div>
		{:else}
			<!-- Server Tab - positioned at top-right, pulled up to top of container -->
			<!-- Shows: Project Name + Port + Status Dropdown -->
			<!-- Background uses gradient that matches the main card's left-to-right gradient -->
			{@const serverVisual = getServerStateVisual(serverStatus)}
			<div
				class="absolute right-[-1px] top-0 -mt-9.5 z-10 flex items-center gap-0 rounded rounded-bl-none rounded-br-none"
				style="background: linear-gradient(90deg, oklch(0.20 0.02 250) 0%, oklch(0.18 0.01 250) 100%); border-left: 1px solid oklch(0.35 0.02 250); border-right: 1px solid oklch(0.35 0.02 250); border-top: 1px solid oklch(0.35 0.02 250);"
			>
				<!-- Server Info Section -->
				<div class="flex items-center gap-1.5 pl-2 pr-1.5 py-1">
					<!-- Server icon -->
					<div
						class="flex items-center justify-center w-5 h-5 rounded"
						style="background: {serverVisual.bgTint};"
					>
						<svg
							class="w-3 h-3"
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
							class="font-mono text-[11px] font-semibold tracking-wider uppercase"
							style="color: {serverVisual.accent}; text-shadow: 0 0 12px {serverVisual.glow};"
						>
							{displayName || projectName}
						</span>
						<div
							class="flex items-center gap-1 font-mono text-[9px]"
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
											class="text-[9px]"
										/>
										<span class="opacity-60">:</span>
									{/if}
									<AnimatedDigits
										value={serverElapsed.minutes}
										class="text-[9px]"
									/>
									<span class="opacity-60">:</span>
									<AnimatedDigits
										value={serverElapsed.seconds}
										class="text-[9px]"
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
				<!-- Activity Sparkline Section -->
				{#if activityData.length > 0}
					{@const hasRecentActivity = activityData.slice(-3).some((v) => v > 0)}
					<div class="flex items-center">
						<div
							class="w-px h-4 mx-1"
							style="background: oklch(0.40 0.01 250);"
						></div>
						<div
							class="px-1 {hasRecentActivity ? 'animate-pulse' : ''}"
							title="Terminal activity"
							style={hasRecentActivity ? "animation-duration: 2s;" : ""}
						>
							<TerminalActivitySparkline
								{activityData}
								maxBars={12}
								height={14}
								width={44}
							/>
						</div>
					</div>
				{/if}
				<!-- Error Badge (if errors detected) -->
				{#if serverErrors().hasErrors}
					<div class="flex items-center">
						<div
							class="w-px h-4 mx-1"
							style="background: oklch(0.40 0.01 250);"
						></div>
						<div
							class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono"
							style="background: oklch(0.35 0.15 25 / 0.3); color: oklch(0.75 0.18 25);"
							title="Errors detected in output"
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
									d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
								/>
							</svg>
							<span>{serverErrors().count}</span>
						</div>
					</div>
				{/if}
				<!-- Status Dropdown Section (divider + badge) -->
				<div class="flex items-center">
					<!-- Shorter, neutral divider -->
					<div
						class="w-px h-4 mx-1.5"
						style="background: oklch(0.40 0.01 250);"
					></div>
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

		<!-- Header: Full-width task content (hover to expand title + description)
		 Row 1: [id][title - full width]
		 Row 2: [description - full width]
	-->
		<div
			class="pl-3 pr-3 pt-2 pb-2 flex-shrink-0 flex-grow-0"
			onmouseenter={handleTaskMouseEnter}
			onmouseleave={handleTaskMouseLeave}
		>
			{#if displayTask}
				<!-- Row 1: Task ID + Title (full width now that agent info is in tab) -->
				<div class="flex items-start gap-2 mb-1">
					<!-- Task ID -->
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
					<!-- Task Title (click to edit) - expands on hover -->
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
							class="font-mono font-bold text-sm tracking-wide min-w-0 flex-1 cursor-text hover:border-b hover:border-dashed hover:border-base-content/30 transition-all duration-300 ease-out {taskHovered
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

				<!-- Row 2: Description (full width, hover to expand) -->
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
			{:else}
				<!-- Idle state - no task (agent info is in tab, so just show idle message) -->
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

		<!-- Output Section -->
		<div
			class="flex-1 flex flex-col min-h-0"
			style="border-top: 1px solid oklch(0.5 0 0 / 0.08);"
		>
			<!-- Output Content -->
			<div
				bind:this={scrollContainerRef}
				class="overflow-y-auto px-3 font-mono text-xs leading-relaxed flex-1 min-h-0"
				style="background: oklch(0.12 0.01 250);"
				onscroll={handleScroll}
			>
				{#if output}
					<pre
						class="whitespace-pre-wrap break-words m-0"
						style="color: oklch(0.85 0.05 145);">{@html renderedOutput}</pre>
				{:else}
					<p class="text-base-content/40 italic m-0">No output yet...</p>
				{/if}
			</div>

			<!-- Input Section -->
			<div
				class="px-3 py-2 flex-shrink-0"
				style="border-top: 1px solid oklch(0.5 0 0 / 0.08); background: oklch(0.18 0.01 250);"
			>
				<!-- Attached Images Preview -->
				{#if attachedImages.length > 0}
					<div class="flex items-center gap-1.5 mb-2 flex-wrap">
						{#each attachedImages as img (img.id)}
							<div
								class="relative group flex items-center gap-1 px-1.5 py-0.5 rounded"
								style="background: oklch(0.28 0.08 200); border: 1px solid oklch(0.35 0.06 200);"
							>
								<!-- Thumbnail preview -->
								<img
									src={img.preview}
									alt={img.name}
									class="w-5 h-5 object-cover rounded"
								/>
								<!-- Image name -->
								<span
									class="font-mono text-[10px]"
									style="color: oklch(0.85 0.02 250);"
								>
									[{img.name}]
								</span>
								<!-- Remove button -->
								<button
									onclick={() => removeAttachedImage(img.id)}
									class="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
									title="Remove image"
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
								Click an option to select
							{/if}
						</div>
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
								Click an option to select
							{/if}
						</div>
					</div>
				{/if}

				<!-- Human Actions Required: Display when agent outputs [JAT:HUMAN_ACTION] markers -->
				{#if detectedHumanActions.length > 0}
					<div
						class="mb-2 p-2.5 rounded-lg"
						style="background: linear-gradient(135deg, oklch(0.25 0.08 50) 0%, oklch(0.22 0.05 45) 100%); border: 1px solid oklch(0.45 0.15 50);"
					>
						<!-- Header -->
						<div class="flex items-center gap-2 mb-2">
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
												: 'oklch(0.95 0.05 50)'};"
										>
											{action.title}
										</div>
										{#if action.description && !action.completed}
											<div
												class="text-[11px] mt-0.5 opacity-70"
												style="color: oklch(0.80 0.02 250);"
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

				<!-- Text input: [autoscroll][stream][esc][^c] LEFT | input MIDDLE | [action buttons] RIGHT -->
				<div class="flex gap-1.5 items-end">
					<!-- LEFT: Control buttons (always visible) -->
					<div class="flex items-center gap-0.5 flex-shrink-0 pb-0.5">
						<!-- Auto-scroll toggle -->
						<button
							class="btn btn-xs"
							class:btn-primary={autoScroll}
							class:btn-ghost={!autoScroll}
							onclick={toggleAutoScroll}
							title={autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
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
									d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3"
								/>
							</svg>
						</button>
						<!-- Live stream toggle -->
						<button
							class="btn btn-xs"
							class:btn-info={liveStreamEnabled}
							class:btn-ghost={!liveStreamEnabled}
							onclick={() => {
								liveStreamEnabled = !liveStreamEnabled;
								if (!liveStreamEnabled && lastStreamedText) {
									lastStreamedText = "";
								}
							}}
							title={liveStreamEnabled
								? "Live streaming ON - Characters sent as you type"
								: "Live streaming OFF - Send on Enter only"}
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
									d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
								/>
							</svg>
						</button>
						<button
							onclick={() => sendKey("escape")}
							class="btn btn-xs font-mono text-[10px] tracking-wider uppercase"
							style="background: oklch(0.25 0.05 250); border: none; color: oklch(0.80 0.02 250);"
							title="Escape (cancel prompt)"
							disabled={sendingInput || !onSendInput}
						>
							Esc
						</button>
						<button
							onclick={() => sendKey("ctrl-c")}
							oncontextmenu={(e) => {
								e.preventDefault();
								setCtrlCIntercept(!ctrlCInterceptEnabled);
							}}
							class="btn btn-xs font-mono text-[10px] tracking-wider uppercase {!ctrlCInterceptEnabled ? 'opacity-50' : ''}"
							style="background: {ctrlCInterceptEnabled ? 'oklch(0.30 0.12 25)' : 'oklch(0.25 0.05 250)'}; border: none; color: oklch(0.95 0.02 250); {!ctrlCInterceptEnabled ? 'text-decoration: line-through;' : ''}"
							title={ctrlCInterceptEnabled
								? "Send Ctrl+C (interrupt) — Right-click to allow Ctrl+C to copy"
								: "Ctrl+C copies to clipboard — Right-click to re-enable interrupt"}
							disabled={sendingInput || !onSendInput}
						>
							^C
						</button>
					</div>

					<!-- MIDDLE: Text input (flexible width) with clear button and streaming indicator -->
					<div class="relative flex-1 min-w-0">
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
								: ''}"
							style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.80 0.02 250); min-height: 24px; max-height: 96px;"
							disabled={sendingInput || !onSendInput}
						></textarea>
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
									setTimeout(handleInputChange, 0);
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
							disabled={sendingInput || !onSendInput}
						/>
					</div>

					<!-- RIGHT: Action buttons (context-dependent) -->
					<div class="flex items-center gap-0.5 flex-shrink-0 pb-0.5">
						{#if inputText.trim() || attachedImages.length > 0}
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
							<!-- Completed state: actionable badge with cleanup/attach options -->
							<StatusActionBadge
								{sessionState}
								{sessionName}
								dropUp={true}
								alignRight={true}
								onAction={handleStatusAction}
								disabled={sendingInput || !onSendInput}
							/>
						{:else if sessionState === "ready-for-review"}
							<!-- Ready for review: show Complete button -->
							<button
								onclick={() => sendWorkflowCommand("/jat:complete")}
								class="btn btn-xs gap-1"
								style="background: linear-gradient(135deg, oklch(0.50 0.18 145) 0%, oklch(0.42 0.15 160) 100%); border: none; color: white; font-weight: 600;"
								title="Mark task as complete"
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
								Complete
							</button>
						{:else if sessionState === "idle"}
							<!-- Idle state: show Start button -->
							<button
								onclick={() => sendWorkflowCommand("/jat:start")}
								class="btn btn-xs gap-1"
								style="background: linear-gradient(135deg, oklch(0.50 0.18 250) 0%, oklch(0.42 0.15 265) 100%); border: none; color: white; font-weight: 600;"
								title="Start working on a task"
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
										d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
									/>
								</svg>
								Start
							</button>
						{:else if sessionState === "working" && task}
							<!-- Working state with task: always show Complete button -->
							<button
								onclick={() => sendWorkflowCommand("/jat:complete")}
								class="btn btn-xs gap-1"
								style="background: linear-gradient(135deg, oklch(0.40 0.12 145) 0%, oklch(0.35 0.10 160) 100%); border: none; color: white; font-weight: 500;"
								title="Complete this task"
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
										d="M5 13l4 4L19 7"
									/>
								</svg>
								Complete
							</button>
						{:else if sessionState === "completing"}
							<!-- Completing state: show actionable badge with attach/kill options -->
							<StatusActionBadge
								{sessionState}
								{sessionName}
								dropUp={true}
								alignRight={true}
								onAction={handleStatusAction}
								disabled={sendingInput || !onSendInput}
							/>
						{:else if detectedWorkflowCommands.length > 0}
							<!-- Workflow commands detected: show Done as primary action -->
							{@const hasComplete = detectedWorkflowCommands.some(
								(c) => c.command === "/jat:complete",
							)}
							{#if hasComplete}
								<button
									onclick={() => sendWorkflowCommand("/jat:complete")}
									class="btn btn-xs gap-1"
									style="background: linear-gradient(135deg, oklch(0.45 0.18 145) 0%, oklch(0.38 0.15 160) 100%); border: none; color: white; font-weight: 600;"
									title="Complete this task"
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
</style>
